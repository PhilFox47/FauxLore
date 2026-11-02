import { format, isWithinInterval, parseISO, startOfISOWeek, startOfMonth, startOfYear, endOfISOWeek, endOfMonth, endOfYear, subHours, subWeeks, subMonths, subYears } from 'date-fns';
import { calculateScaledDelta } from './scaling';
import type { MediaItem, ProgressLog, Settings } from '../types/schema';
import type { StoryBar, StoryBeat, StoryKind, StoryPeriod } from './storyDiscovery';

export interface WrappedFact {
  id: string;
  kind: StoryKind;
  title: string;
  evidence: string;
  mediaId?: string;
  quote?: string;
  bars?: StoryBar[];
  beats?: StoryBeat[];
}
export interface WrappedEvidence {
  timeframe: StoryPeriod;
  timeId: string;
  facts: WrappedFact[];
  media: { id: string; title: string; type: string; year?: number; genres: string[]; rating?: number; review?: string }[];
  bounds: { start: string; end: string };
}

const period = (date: Date, kind: StoryPeriod) => kind === 'week'
  ? { start: startOfISOWeek(date), end: endOfISOWeek(date) }
  : kind === 'month' ? { start: startOfMonth(date), end: endOfMonth(date) }
    : { start: startOfYear(date), end: endOfYear(date) };
const backward = (date: Date, kind: StoryPeriod, steps: number) => kind === 'week' ? subWeeks(date, steps) : kind === 'month' ? subMonths(date, steps) : subYears(date, steps);
const within = (l: ProgressLog, range: {start: Date; end: Date}) => isWithinInterval(subHours(parseISO(l.timestamp), 5), range);
const stamp = (l: ProgressLog) => format(subHours(parseISO(l.timestamp), 5), 'MMM d');
const round = (n: number) => Math.round(n * 10) / 10;
function timeIdDate(timeframe: StoryPeriod, timeId: string): Date {
  if (timeframe === 'year') return new Date(Number(timeId), 0, 1);
  if (timeframe === 'month') return new Date(Number(timeId.slice(0, 4)), Number(timeId.slice(5, 7)) - 1, 1);
  const year = Number(timeId.slice(0, 4)), week = Number(timeId.slice(6));
  const jan4 = new Date(year, 0, 4);
  return new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
}

/** Self-contained source of truth for Wrapped. No recap, awards or prior recap prose. */
export function buildWrappedEvidence(args: {
  timeframe: StoryPeriod; timeId: string; logs: ProgressLog[];
  history: ProgressLog[]; media: MediaItem[]; settings?: Settings | null;
}): WrappedEvidence {
  const { timeframe, timeId, logs, history, media, settings } = args;
  const byId = new Map(media.map(m => [m.id, m]));
  const progress = logs.filter(l => l.metricType !== 'statusChange').sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const value = (l: ProgressLog) => {
    const item = byId.get(l.mediaId);
    if (!item || l.metricType === 'statusChange') return 0;
    const n = calculateScaledDelta(l.delta || 0, item, settings);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const facts: WrappedFact[] = [];
  const add = (fact: WrappedFact) => { if (fact.evidence && facts.length < 90) facts.push(fact); };
  const total = progress.reduce((n, l) => n + value(l), 0);
  const byMedia = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const l of progress) {
    const m = byId.get(l.mediaId); if (!m) continue;
    const pages = value(l);
    byMedia.set(m.id, (byMedia.get(m.id) || 0) + pages);
    byType.set(m.mediaType, (byType.get(m.mediaType) || 0) + pages);
  }
  const ranking = [...byMedia].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const touched = [...new Set(logs.map(l => l.mediaId))].map(id => byId.get(id)).filter((m): m is MediaItem => !!m);
  const days = new Set(progress.filter(l => value(l) > 0).map(l => format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd')));
  add({ id: 'overview', kind: 'rhythm', title: 'What the period contained',
    evidence: logs.length + ' log entries, ' + days.size + ' distinct active days, ' + touched.length + ' media titles; ' + round(total) + ' normalized Master Pages. These are NOT hours.' });
  ranking.slice(0, 10).forEach(([id, pages], i) => {
    const m = byId.get(id)!;
    add({ id: 'media-' + i, kind: 'spotlight', title: m.title, mediaId: id,
      evidence: m.title + ' (' + m.mediaType + ') logged ' + round(pages) + ' Master Pages (' +
        (total > 0 ? Math.round(pages / total * 100) : 0) + '% of this period); ' +
        progress.filter(l => l.mediaId === id).length + ' progress entries. ' +
        (m.genres?.length ? 'Genres: ' + m.genres.slice(0, 4).join(', ') + '. ' : '') +
        (m.userReview ? 'Current stored review: ' + m.userReview.slice(0, 450) + '.' : ''),
    });
  });
  // Explicit opinions and diary moments, not automatic statusChange strings.
  const notes = progress.filter(l => !!l.note?.trim() && byId.has(l.mediaId))
    .sort((a, b) => Math.min(b.note!.length, 350) - Math.min(a.note!.length, 350));
  const usedNoteMedia = new Set<string>();
  notes.forEach(l => {
    if (facts.filter(f => f.kind === 'journal').length >= (timeframe === 'year' ? 20 : 12)) return;
    if (usedNoteMedia.has(l.mediaId) && notes.length > 8 && facts.filter(f => f.kind === 'journal' && f.mediaId === l.mediaId).length >= 2) return;
    usedNoteMedia.add(l.mediaId);
    const m = byId.get(l.mediaId)!;
    const quote = l.note!.trim().slice(0, 2000);
    add({ id: 'journal-' + l.id, kind: 'journal', title: 'Journal: ' + m.title, mediaId: m.id,
      evidence: 'On ' + stamp(l) + (l.location ? ' at ' + l.location : '') + ', user wrote about ' + m.title + ': ' + quote,
      quote });
  });
  touched.filter(m => m.userRating != null && m.reviewScore != null)
    .sort((a, b) => Math.abs((b.userRating || 0) - (b.reviewScore || 0)) - Math.abs((a.userRating || 0) - (a.reviewScore || 0)))
    .slice(0, 8).forEach(m => add({ id: 'taste-' + m.id, kind: 'taste', title: 'Taste versus critics: ' + m.title, mediaId: m.id,
      evidence: 'Currently saved rating for ' + m.title + ': user ' + m.userRating + '/5, critics ' + m.reviewScore +
        '/5. Ratings are current library values; the app does NOT have a historical rating snapshot for this period.' +
        (m.userReview ? ' Review: ' + m.userReview.slice(0, 500) : ''),
      bars: [{ label: 'You', value: round((m.userRating || 0) * 20), note: m.userRating + ' / 5' },
        { label: 'Critics', value: round((m.reviewScore || 0) * 20), note: m.reviewScore + ' / 5' }],
    }));
  const places = new Map<string, ProgressLog[]>();
  for (const l of progress) if (l.location?.trim()) {
    const key = l.location.trim();
    places.set(key, [...(places.get(key) || []), l]);
  }
  [...places].sort((a, b) => b[1].length - a[1].length).slice(0, 12).forEach(([place, matches], i) => {
    const titles = [...new Set(matches.map(l => l.mediaId))].map(id => byId.get(id)?.title).filter(Boolean);
    const dates = [...new Set(matches.map(l => format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd')))];
    add({ id: 'place-' + i, kind: 'location', title: 'Recorded place: ' + place, mediaId: matches[0]?.mediaId,
      evidence: 'User explicitly logged activity at "' + place + '" on ' + dates.length + ' different dates, with ' + titles.length +
        ' titles: ' + titles.slice(0, 10).join(', ') + '. The place label does NOT prove travel purpose or emotional state.' });
  });
  // Show correlations and juxtapositions as evidence, not invented causation.
  const dates = new Map<string, Set<string>>();
  for (const l of progress) {
    const date = format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd');
    if (!dates.has(date)) dates.set(date, new Set());
    dates.get(date)!.add(l.mediaId);
  }
  [...dates].filter(([, v]) => v.size >= 2).slice(0, 12).forEach(([date, ids], i) => {
    add({ id: 'crossover-' + i, kind: 'insight', title: 'Different worlds on ' + date,
      evidence: 'On ' + date + ' the user logged ' + [...ids].map(id => byId.get(id)?.title).filter(Boolean).join(' and ') +
        '. Co-occurrence alone does not establish why the user switched.' });
  });
  const previousIdSet = new Set(logs.map(l => l.id));
  const oldProgress = history.filter(l => !previousIdSet.has(l.id) && l.metricType !== 'statusChange');
  for (const m of touched) {
    const first = progress.filter(l => l.mediaId === m.id).map(l => parseISO(l.timestamp).getTime()).sort((a, b) => a - b)[0];
    const last = oldProgress.filter(l => l.mediaId === m.id && parseISO(l.timestamp).getTime() < first)
      .map(l => parseISO(l.timestamp).getTime()).sort((a, b) => b - a)[0];
    const gap = first && last ? Math.floor((first - last) / 86400000) : 0;
    if (gap >= 30) add({ id: 'comeback-' + m.id, kind: 'return', title: 'Return to ' + m.title, mediaId: m.id,
      evidence: 'Gap between logged progress sessions for ' + m.title + ': ' + gap + ' days. This is NOT proof of abandonment.' });
  }
  const start = timeIdDate(timeframe, timeId);
  const past = Array.from({ length: 8 }, (_, index) => {
    const subset = oldProgress.filter(l => within(l, period(backward(start, timeframe, index + 1), timeframe)));
    const pages = subset.reduce((s, l) => s + value(l), 0);
    const shares = new Map<string, number>();
    for (const l of subset) {
      const type = byId.get(l.mediaId)?.mediaType;
      if (type) shares.set(type, (shares.get(type) || 0) + value(l));
    }
    return { pages, shares };
  }).filter(p => p.pages > 0);
  if (past.length >= 3 && total > 0) {
    [...byType].sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([type, pages]) => {
      const share = pages / total;
      const baseline = past.reduce((s, p) => s + (p.shares.get(type) || 0) / p.pages, 0) / past.length;
      if (Math.abs(share - baseline) >= 0.12) add({
        id: 'outlier-' + type, kind: 'outlier', title: type + ' vs your usual mix',
        evidence: type + ' accounted for ' + Math.round(share * 100) + '% of Master Pages this period, compared with ' +
          Math.round(baseline * 100) + '% across ' + past.length + ' earlier active ' + timeframe +
          ' periods. Normalized Master Pages are NOT hours; gaps in logging may limit conclusions.',
        bars: [
          { label: 'Previous periods', value: round(baseline * 100), note: 'Average of ' + past.length + ' active periods' },
          { label: 'This period', value: round(share * 100), note: 'Share of Master Pages' },
        ],
      });
    });
  }
  if (timeframe !== 'week') {
    const buckets = new Map<string, Map<string, number>>();
    for (const l of progress) {
      const dt = subHours(parseISO(l.timestamp), 5);
      const key = timeframe === 'month' ? format(startOfISOWeek(dt), 'yyyy-MM-dd') : format(dt, 'yyyy-MM');
      if (!buckets.has(key)) buckets.set(key, new Map());
      const b = buckets.get(key)!;
      b.set(l.mediaId, (b.get(l.mediaId) || 0) + value(l));
    }
    const beats: StoryBeat[] = [...buckets].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, ms]) => {
        const top: [string, number] | undefined = [...ms].sort((a, b) => b[1] - a[1])[0];
        return { label: timeframe === 'month' ? 'Week of ' + key : key, title: top ? byId.get(top[0])?.title || 'Unknown' : 'Unknown',
          detail: round(top?.[1] || 0) + ' MP' };
      }).filter(b => b.title !== 'Unknown');
    if (beats.length >= 3) add({ id: 'timeline', kind: 'timeline', title: 'Changing leaders across the period',
      evidence: 'In each active ' + (timeframe === 'month' ? 'week' : 'month') + ', the most logged title changed as shown. Do not call these invented psychological eras.',
      beats: beats.slice(0, 16) });
  }
  return {
    timeframe, timeId, facts,
    bounds: { start: format(period(start, timeframe).start, 'yyyy-MM-dd'), end: format(period(start, timeframe).end, 'yyyy-MM-dd') },
    media: touched.map(m => ({ id: m.id, title: m.title, type: m.mediaType, year: m.year, genres: (m.genres || []).slice(0, 6),
      rating: m.userRating, review: m.userReview?.slice(0, 450) })).slice(0, 45),
  };
}
