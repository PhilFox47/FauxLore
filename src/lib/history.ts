import { MediaItem, ProgressLog, MetricType, getMetricForType } from '../types/schema';
import { calculateScaledDelta } from './scaling';

// Shared color/order for statuses (used by timelines, funnels, etc.)
export const STATUS_ORDER = ['Planning', 'Active', 'On Hold', 'Caught Up', 'Extras', 'Completed', 'Dropped', 'Unreleased'] as const;
export const STATUS_HEX: Record<string, string> = {
  Planning: '#8b5cf6',
  Active: '#f59e0b',
  'On Hold': '#64748b',
  'Caught Up': '#2dd4bf',
  Extras: '#fb923c',
  Completed: '#10b981',
  Dropped: '#ef4444',
  Unreleased: '#71717a',
};

const DAY_MS = 86400000;

function parseStatusNote(note?: string | null): { from?: string; to?: string } {
  if (!note) return {};
  const m = note.match(/Status changed from (.*?) to (.*)/i);
  if (m) return { from: m[1].trim(), to: m[2].trim() };
  return {};
}

export interface StatusSegment {
  status: string;
  start: string;      // ISO
  end: string | null; // ISO, or null if this is the current (open) segment
  days: number;
}

/**
 * Reconstructs an item's status journey from its statusChange logs. Each segment is
 * a stretch of time the item spent in one status. The last segment is open-ended
 * (end === null) and its `days` counts up to `now`.
 */
export function buildStatusTimeline(item: MediaItem, itemLogs: ProgressLog[], now: Date = new Date()): StatusSegment[] {
  const changes = itemLogs
    .filter(l => l.metricType === 'statusChange' && !l.timestamp.startsWith('1970-01-01'))
    .map(l => ({ ts: l.timestamp, ...parseStatusNote(l.note) }))
    .filter(c => c.to)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  const seg = (status: string, start: string, end: string | null): StatusSegment => {
    const endT = end ? new Date(end).getTime() : now.getTime();
    return { status, start, end, days: Math.max(0, (endT - new Date(start).getTime()) / DAY_MS) };
  };

  if (changes.length === 0) {
    const start = item.createdAt || now.toISOString();
    return [seg(item.status, start, null)];
  }

  const segments: StatusSegment[] = [];
  let curStatus = changes[0].from || 'Planning';
  let curStart = item.createdAt || changes[0].ts;

  for (const c of changes) {
    segments.push(seg(curStatus, curStart, c.ts));
    curStatus = c.to!;
    curStart = c.ts;
  }
  segments.push(seg(curStatus, curStart, null));
  return segments.filter(s => s.days >= 0);
}

export interface ItemPace {
  activeDays: number;
  masterPages: number;
  mpPerActiveDay: number;
  // Native-unit projection (null when unknown, e.g. movies or missing totals)
  unit: string | null;
  done: number;
  total: number | null;
  pctComplete: number | null;
  perActiveDay: number | null;
  projectedDaysLeft: number | null;
  finished: boolean;
}

const NATIVE_UNIT_WORD: Record<string, string> = {
  playtimeHours: 'hours',
  pagesRead: 'pages',
  chaptersRead: 'chapters',
  episodesWatched: 'episodes',
  issuesRead: 'issues',
};

function knownTotal(item: MediaItem): number | null {
  switch (item.mediaType) {
    case 'Book': return item.totalPages || null;
    case 'Manga': return item.totalChapters || null;
    case 'Series': return item.totalEpisodes || null;
    case 'Comic': return item.totalIssues || null;
    case 'Game':
    case 'Visual Novel':
    case 'Audiobook': {
      const t = item.selectedHltbType || 'mainExtra';
      const h = t === 'main' ? item.hltbMain : t === 'completionist' ? item.hltbCompletionist : item.hltbMainExtra;
      return h || null;
    }
    default: return null;
  }
}

/** Pace and finish projection for a single item, from its (non-historic) progress logs. */
export function getItemPace(item: MediaItem, itemLogs: ProgressLog[], settings: any, now: Date = new Date()): ItemPace {
  const metric = getMetricForType(item.mediaType) as MetricType | null;
  const progress = itemLogs.filter(
    l => l.metricType !== 'statusChange' && !l.timestamp.startsWith('1970-01-01')
  );
  const activeDayKeys = new Set(progress.map(l => l.timestamp.slice(0, 10)));
  const activeDays = activeDayKeys.size || 0;
  const masterPages = progress.reduce((s, l) => s + calculateScaledDelta(l.delta, item, settings), 0);

  const nativeLogged = metric
    ? progress.filter(l => l.metricType === metric).reduce((s, l) => s + (l.delta > 0 ? l.delta : 0), 0)
    : 0;
  const total = knownTotal(item);
  const done = metric ? (item as any)[metric] || nativeLogged : nativeLogged;
  const perActiveDay = activeDays > 0 && metric ? nativeLogged / activeDays : null;
  const finished = item.status === 'Completed' || item.status === 'Extras';
  const pctComplete = total && total > 0 ? Math.min(1, done / total) : null;
  const remaining = total ? Math.max(0, total - done) : null;
  const projectedDaysLeft =
    !finished && remaining !== null && perActiveDay && perActiveDay > 0
      ? Math.ceil(remaining / perActiveDay)
      : null;

  return {
    activeDays,
    masterPages,
    mpPerActiveDay: activeDays > 0 ? masterPages / activeDays : 0,
    unit: metric ? NATIVE_UNIT_WORD[metric] || null : null,
    done,
    total,
    pctComplete,
    perActiveDay,
    projectedDaysLeft,
    finished,
  };
}

/**
 * Library-wide aggregation of status history for the Statistics pipeline view:
 * completion/drop rates and average time spent in each status.
 */
export function aggregateStatusHistory(media: MediaItem[], logs: ProgressLog[], now: Date = new Date()) {
  const byItem = new Map<string, ProgressLog[]>();
  logs.forEach(l => {
    if (!byItem.has(l.mediaId)) byItem.set(l.mediaId, []);
    byItem.get(l.mediaId)!.push(l);
  });

  const timeInStatus: Record<string, { totalDays: number; n: number }> = {};
  let reachedActive = 0;
  let completed = 0;
  let dropped = 0;
  // Planning wait = time from first Planning to leaving Planning (started)
  const planningWaits: number[] = [];

  media.forEach(m => {
    const segs = buildStatusTimeline(m, byItem.get(m.id) || [], now);
    segs.forEach(s => {
      // Only count closed segments toward "time spent in status" averages
      if (s.end) {
        if (!timeInStatus[s.status]) timeInStatus[s.status] = { totalDays: 0, n: 0 };
        timeInStatus[s.status].totalDays += s.days;
        timeInStatus[s.status].n += 1;
      }
      if (s.status === 'Planning' && s.end) planningWaits.push(s.days);
    });
    if (m.status === 'Completed' || m.status === 'Extras') completed++;
    if (m.status === 'Dropped') dropped++;
    if (segs.some(s => s.status === 'Active' || s.status === 'Completed' || s.status === 'Extras' || s.status === 'Dropped' || s.status === 'On Hold' || s.status === 'Caught Up')) {
      reachedActive++;
    }
  });

  const avgTimeInStatus: Record<string, number> = {};
  Object.entries(timeInStatus).forEach(([k, v]) => { avgTimeInStatus[k] = v.n > 0 ? v.totalDays / v.n : 0; });

  const started = reachedActive || 1;
  const avgPlanningWait = planningWaits.length ? planningWaits.reduce((a, b) => a + b, 0) / planningWaits.length : 0;

  return {
    completed,
    dropped,
    started: reachedActive,
    completionRate: completed / started,
    dropRate: dropped / started,
    avgTimeInStatus,
    avgPlanningWait,
  };
}
