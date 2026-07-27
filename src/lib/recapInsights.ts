import { MediaItem, ProgressLog, Settings } from '../types/schema';
import { calculateScaledDelta } from './scaling';
import { groupLogsIntoSessions } from './sessions';
import {
  differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval,
  format, isWithinInterval, parseISO, subHours,
} from 'date-fns';

/**
 * The measured half of a recap.
 *
 * Everything here is derived straight from the logs, which means it is true
 * whether or not the AI ever runs — the narrative reads these numbers rather
 * than the other way round. The app's day starts at 05:00, so every timestamp is
 * shifted back five hours before it is bucketed; a 2am session belongs to the
 * night it started, not the morning it spilled into.
 */

export type Timeframe = 'week' | 'month' | 'year';
export interface Interval { start: Date; end: Date }

/** The 5am day boundary the rest of the app logs against. */
export const shift = (iso: string) => subHours(parseISO(iso), 5);

export interface IntervalMetrics {
  masterPages: number;
  logCount: number;
  titles: number;
  completed: number;
  dropped: number;
  activeDays: number;
  totalDays: number;
  longestStreak: number;
  restDays: number;
  daily: { key: string; date: Date; pages: number }[];
  hourly: number[];   // 24 buckets, master pages
  weekday: number[];  // 7 buckets (Mon..Sun), master pages
  bestDay: { key: string; pages: number } | null;
  biggestSession: { pages: number; title: string } | null;
  sessions: number;
  avgSession: number;
}

function pagesOf(log: ProgressLog, media: MediaItem[], settings?: Settings | null) {
  const m = media.find((x) => x.id === log.mediaId);
  if (!m) return 0;
  return calculateScaledDelta(log.delta || 0, m, settings);
}

/** Everything a single period is made of, in one pass over its logs. */
export function buildIntervalMetrics(
  progressLogs: ProgressLog[],
  media: MediaItem[],
  settings: Settings | null | undefined,
  interval: Interval,
  extras?: { completed?: number; dropped?: number },
): IntervalMetrics {
  const hourly = Array(24).fill(0);
  const weekday = Array(7).fill(0);
  const byDay = new Map<string, number>();
  let masterPages = 0;

  for (const log of progressLogs) {
    const when = shift(log.timestamp);
    const pages = pagesOf(log, media, settings);
    masterPages += pages;
    // The clock face uses the real hour, not the shifted one — a 2am log should
    // sit at 2am on the dial even though it counts toward the previous day.
    hourly[parseISO(log.timestamp).getHours()] += pages;
    weekday[(when.getDay() + 6) % 7] += pages; // Mon-first
    const key = format(when, 'yyyy-MM-dd');
    byDay.set(key, (byDay.get(key) || 0) + pages);
  }

  const days = eachDayOfInterval({ start: interval.start, end: interval.end });
  const daily = days.map((date) => {
    const key = format(date, 'yyyy-MM-dd');
    return { key, date, pages: byDay.get(key) || 0 };
  });

  // Streaks run over the days that actually have activity, in order.
  let longestStreak = 0;
  let running = 0;
  for (const d of daily) {
    if (d.pages > 0) {
      running += 1;
      longestStreak = Math.max(longestStreak, running);
    } else {
      running = 0;
    }
  }

  const activeDays = daily.filter((d) => d.pages > 0).length;
  const bestDayEntry = daily.reduce<{ key: string; pages: number } | null>(
    (best, d) => (d.pages > 0 && (!best || d.pages > best.pages) ? { key: d.key, pages: d.pages } : best),
    null,
  );

  const sessions = groupLogsIntoSessions(progressLogs).map((s) => ({
    pages: s.logs.reduce((sum, l) => sum + pagesOf(l, media, settings), 0),
    title: media.find((m) => m.id === s.logs[0]?.mediaId)?.title || 'Unknown',
  }));
  const biggestSession = sessions.reduce<{ pages: number; title: string } | null>(
    (best, s) => (!best || s.pages > best.pages ? s : best),
    null,
  );

  return {
    masterPages,
    logCount: progressLogs.length,
    titles: new Set(progressLogs.map((l) => l.mediaId)).size,
    completed: extras?.completed ?? 0,
    dropped: extras?.dropped ?? 0,
    activeDays,
    totalDays: daily.length,
    longestStreak,
    restDays: daily.length - activeDays,
    daily,
    hourly,
    weekday,
    bestDay: bestDayEntry,
    biggestSession: biggestSession && biggestSession.pages > 0 ? biggestSession : null,
    sessions: sessions.length,
    avgSession: sessions.length ? sessions.reduce((a, s) => a + s.pages, 0) / sessions.length : 0,
  };
}

export interface Delta {
  value: number;
  previous: number;
  diff: number;
  pct: number | null; // null when there is no previous period to compare against
}

const delta = (value: number, previous: number): Delta => ({
  value,
  previous,
  diff: value - previous,
  pct: previous > 0 ? ((value - previous) / previous) * 100 : null,
});

/** This period against the one before it, for every headline number. */
export function buildComparison(current: IntervalMetrics, previous: IntervalMetrics | null) {
  const prev = previous || ({} as Partial<IntervalMetrics>);
  return {
    masterPages: delta(current.masterPages, prev.masterPages || 0),
    logCount: delta(current.logCount, prev.logCount || 0),
    titles: delta(current.titles, prev.titles || 0),
    completed: delta(current.completed, prev.completed || 0),
    activeDays: delta(current.activeDays, prev.activeDays || 0),
    avgSession: delta(current.avgSession, prev.avgSession || 0),
    hadPrevious: !!previous && (previous.logCount > 0),
  };
}

/**
 * Cumulative master pages day by day, with the previous period laid over it on
 * the same axis — the shape that answers "am I ahead of where I was?" at a
 * glance. Periods of different lengths are compared by day index.
 */
export function buildMomentumSeries(current: IntervalMetrics, previous: IntervalMetrics | null) {
  const length = Math.max(current.daily.length, previous?.daily.length || 0);
  let runCur = 0;
  let runPrev = 0;
  const points: { index: number; label: string; current: number | null; previous: number | null }[] = [];

  for (let i = 0; i < length; i++) {
    const cur = current.daily[i];
    const pre = previous?.daily[i];
    if (cur) runCur += cur.pages;
    if (pre) runPrev += pre.pages;
    points.push({
      index: i + 1,
      label: cur ? format(cur.date, 'MMM d') : `Day ${i + 1}`,
      current: cur ? Math.round(runCur) : null,
      previous: previous ? (pre ? Math.round(runPrev) : null) : null,
    });
  }
  return points;
}

/** Where the period's pages actually landed on a 24-hour dial. */
export function buildClock(metrics: IntervalMetrics) {
  const total = metrics.hourly.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const peakHour = metrics.hourly.indexOf(Math.max(...metrics.hourly));

  // The best contiguous three-hour window reads better than a single hour.
  let bestStart = 0;
  let bestSum = -1;
  for (let h = 0; h < 24; h++) {
    const sum = metrics.hourly[h] + metrics.hourly[(h + 1) % 24] + metrics.hourly[(h + 2) % 24];
    if (sum > bestSum) { bestSum = sum; bestStart = h; }
  }

  const band = (from: number, to: number) => {
    let sum = 0;
    for (let h = from; h !== to; h = (h + 1) % 24) sum += metrics.hourly[h];
    return sum;
  };
  const segments = {
    night: band(22, 5),
    morning: band(5, 12),
    afternoon: band(12, 17),
    evening: band(17, 22),
  };
  const dominant = (Object.entries(segments).sort((a, b) => b[1] - a[1])[0] || ['evening', 0]) as [string, number];

  return {
    hourly: metrics.hourly,
    total,
    peakHour,
    peakWindow: { start: bestStart, end: (bestStart + 3) % 24, pages: bestSum, share: bestSum / total },
    segments,
    dominant: { name: dominant[0], share: dominant[1] / total },
  };
}

/** What happened to everything you touched: the shape of the period's pipeline. */
export function buildPipeline(args: {
  touched: MediaItem[];
  completedIds: Set<string>;
  droppedIds: Set<string>;
  startedIds: Set<string>;
}) {
  const { touched, completedIds, droppedIds, startedIds } = args;
  const stages = [
    { key: 'touched', label: 'Touched', count: touched.length },
    { key: 'started', label: 'Started here', count: touched.filter((m) => startedIds.has(m.id)).length },
    { key: 'finished', label: 'Finished', count: touched.filter((m) => completedIds.has(m.id)).length },
    { key: 'dropped', label: 'Dropped', count: touched.filter((m) => droppedIds.has(m.id)).length },
  ];
  const stillOpen = touched.filter((m) => !completedIds.has(m.id) && !droppedIds.has(m.id)).length;
  return {
    stages,
    stillOpen,
    closureRate: touched.length ? (stages[2].count + stages[3].count) / touched.length : 0,
  };
}

/**
 * A bump chart of who led the period: the top titles' rank in each sub-period
 * (days across a week, weeks across a month, months across a year). Ties and
 * absences are left as gaps rather than being flattened to last place.
 */
export function buildRankRace(
  progressLogs: ProgressLog[],
  media: MediaItem[],
  settings: Settings | null | undefined,
  interval: Interval,
  timeframe: Timeframe,
  topN = 5,
) {
  const buckets =
    timeframe === 'week'
      ? eachDayOfInterval(interval).map((d) => ({ start: d, label: format(d, 'EEE') }))
      : timeframe === 'month'
        ? eachWeekOfInterval(interval, { weekStartsOn: 1 }).map((d, i) => ({ start: d, label: `W${i + 1}` }))
        : eachMonthOfInterval(interval).map((d) => ({ start: d, label: format(d, 'MMM') }));

  if (buckets.length < 2) return null;

  const bucketIndex = (when: Date) => {
    let idx = 0;
    for (let i = 0; i < buckets.length; i++) if (when >= buckets[i].start) idx = i;
    return idx;
  };

  const totals = new Map<string, number>();
  const perBucket = new Map<string, number[]>();
  for (const log of progressLogs) {
    const pages = pagesOf(log, media, settings);
    if (pages <= 0) continue;
    const idx = bucketIndex(shift(log.timestamp));
    totals.set(log.mediaId, (totals.get(log.mediaId) || 0) + pages);
    const row = perBucket.get(log.mediaId) || Array(buckets.length).fill(0);
    row[idx] += pages;
    perBucket.set(log.mediaId, row);
  }

  const leaders = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([id]) => id);
  if (leaders.length < 2) return null;

  // Standings, not daily winners: each bucket ranks the leaders by their running
  // total so far. Ranking a single bucket in isolation pins every title that
  // happened to be the only one touched that day at #1, which draws four flat
  // lines and says nothing. A title stays absent until it first appears.
  const ranksById = new Map<string, (number | null)[]>();
  leaders.forEach((id) => ranksById.set(id, Array(buckets.length).fill(null)));
  const running = new Map<string, number>(leaders.map((id) => [id, 0]));

  for (let b = 0; b < buckets.length; b++) {
    leaders.forEach((id) => {
      running.set(id, (running.get(id) || 0) + (perBucket.get(id)?.[b] || 0));
    });
    const standing = leaders
      .map((id) => ({ id, pages: running.get(id) || 0 }))
      .filter((e) => e.pages > 0)
      .sort((a, b2) => b2.pages - a.pages);
    standing.forEach((entry, i) => { ranksById.get(entry.id)![b] = i + 1; });
  }

  const series = leaders.map((id) => {
    const m = media.find((x) => x.id === id);
    return {
      id,
      title: m?.title || 'Unknown',
      mediaType: m?.mediaType || 'Game',
      total: Math.round(totals.get(id) || 0),
      ranks: ranksById.get(id)!,
    };
  });

  // How often the lead actually changed hands. Compared against the last bucket
  // that had a leader, not the one immediately before — otherwise a single quiet
  // day in the middle hides the handover that happened across it.
  let leadChanges = 0;
  let lastLeader: string | undefined;
  for (let b = 0; b < buckets.length; b++) {
    const leader = series.find((s) => s.ranks[b] === 1)?.id;
    if (!leader) continue;
    if (lastLeader && leader !== lastLeader) leadChanges++;
    lastLeader = leader;
  }

  return { buckets: buckets.map((b) => b.label), series, leadChanges };
}

/** Your scores against the critics', title by title. */
export function buildTasteAlignment(touched: MediaItem[]) {
  const points = touched
    .filter((m) => m.userRating && m.reviewScore)
    .map((m) => ({
      title: m.title,
      mediaType: m.mediaType,
      user: m.userRating as number,
      critic: m.reviewScore as number,
      gap: (m.userRating as number) - (m.reviewScore as number),
    }));
  if (points.length < 2) return null;

  const avgGap = points.reduce((a, p) => a + p.gap, 0) / points.length;
  const sorted = [...points].sort((a, b) => b.gap - a.gap);
  return {
    points,
    avgGap,
    stance: avgGap > 0.4 ? 'kinder' : avgGap < -0.4 ? 'harsher' : 'aligned',
    biggestChampion: sorted[0]?.gap > 0.5 ? sorted[0] : null,
    biggestSkeptic: sorted[sorted.length - 1]?.gap < -0.5 ? sorted[sorted.length - 1] : null,
  };
}

export interface RecordEntry {
  key: string;
  label: string;
  value: number;
  unit: string;
  detail?: string;
  isRecord: boolean;
  previousBest: number;
}

/**
 * Which of this period's numbers are all-time bests.
 *
 * "All-time" means every comparable period on record, so a weekly recap is only
 * a record against other weeks. The current period is excluded from its own
 * benchmark, otherwise nothing could ever be a record.
 */
export function buildRecords(
  current: IntervalMetrics,
  history: { key: string; metrics: IntervalMetrics }[],
  currentKey: string,
): RecordEntry[] {
  const past = history.filter((h) => h.key !== currentKey).map((h) => h.metrics);
  const bestOf = (pick: (m: IntervalMetrics) => number) => past.reduce((max, m) => Math.max(max, pick(m)), 0);

  const entries: RecordEntry[] = [
    {
      key: 'pages', label: 'Master pages', value: Math.round(current.masterPages), unit: 'MP',
      previousBest: Math.round(bestOf((m) => m.masterPages)), isRecord: false,
    },
    {
      key: 'day', label: 'Biggest day', value: Math.round(current.bestDay?.pages || 0), unit: 'MP',
      detail: current.bestDay ? format(parseISO(current.bestDay.key), 'MMM d') : undefined,
      previousBest: Math.round(bestOf((m) => m.bestDay?.pages || 0)), isRecord: false,
    },
    {
      key: 'session', label: 'Longest session', value: Math.round(current.biggestSession?.pages || 0), unit: 'MP',
      detail: current.biggestSession?.title,
      previousBest: Math.round(bestOf((m) => m.biggestSession?.pages || 0)), isRecord: false,
    },
    {
      key: 'streak', label: 'Longest streak', value: current.longestStreak, unit: 'days',
      previousBest: bestOf((m) => m.longestStreak), isRecord: false,
    },
    {
      key: 'titles', label: 'Titles juggled', value: current.titles, unit: 'titles',
      previousBest: bestOf((m) => m.titles), isRecord: false,
    },
    {
      key: 'completed', label: 'Titles finished', value: current.completed, unit: 'finished',
      previousBest: bestOf((m) => m.completed), isRecord: false,
    },
  ];

  return entries
    .filter((e) => e.value > 0)
    .map((e) => ({ ...e, isRecord: past.length > 0 && e.value > e.previousBest }));
}

/**
 * Splits every log the user has into comparable periods, for record-keeping.
 * Bounds are derived from a date inside each bucket rather than parsed back out
 * of its key, which keeps week/month/year handling in one place.
 */
export function buildHistoryMetrics(
  allProgressLogs: ProgressLog[],
  media: MediaItem[],
  settings: Settings | null | undefined,
  keyFor: (date: Date) => string,
  boundsFor: (date: Date) => Interval,
): { key: string; metrics: IntervalMetrics }[] {
  const byKey = new Map<string, { logs: ProgressLog[]; sample: Date }>();
  for (const log of allProgressLogs) {
    const when = shift(log.timestamp);
    const key = keyFor(when);
    const bucket = byKey.get(key) || { logs: [], sample: when };
    bucket.logs.push(log);
    byKey.set(key, bucket);
  }
  return [...byKey.entries()].map(([key, { logs, sample }]) => ({
    key,
    metrics: buildIntervalMetrics(logs, media, settings, boundsFor(sample)),
  }));
}

/** Filters a log set to one interval, using the app's 5am day boundary. */
export function logsInInterval(logs: ProgressLog[], interval: Interval) {
  return logs.filter((l) => isWithinInterval(shift(l.timestamp), interval));
}

/** "3 days ahead", "12% behind" — the phrasing the recap header uses. */
export function describeDelta(d: Delta, unit = ''): string | null {
  if (d.pct === null) return null;
  const rounded = Math.round(Math.abs(d.pct));
  if (rounded < 3) return 'about level with last time';
  return `${rounded}% ${d.diff > 0 ? 'up on' : 'down on'} last time${unit ? ` (${Math.abs(Math.round(d.diff))} ${unit})` : ''}`;
}

export const daysBetween = (a: Date, b: Date) => Math.abs(differenceInCalendarDays(a, b));
