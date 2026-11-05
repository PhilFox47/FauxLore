import { parseISO, subHours, subMonths } from 'date-fns';
import type { MediaItem, ProgressLog } from '../types/schema';
import { wrappedPeriodRange } from './wrappedEditorialMemory';
import type { StoryPeriod } from './storyDiscovery';

/**
 * Longitudinal source material for Wrapped, deliberately separate from its
 * verified current-period evidence cards. No old AI editorial is a fact.
 * All history is cut off at the END of the requested period.
 */
export interface WrappedResearchContext {
  currentLogs: string;
  recentLogs: string;
  mediaDirectory: string;
  previousRecaps: string;
  activeMediaIds: string[];
  periodEnd: Date;
  history: ProgressLog[];
  media: MediaItem[];
}

export interface HistoricalRecap {
  timeframe?: StoryPeriod;
  timeId?: string;
  title?: string;
  summary?: string;
  data?: { structured?: unknown } | null;
}

const shiftedTime = (log: ProgressLog): number => subHours(parseISO(log.timestamp), 5).getTime();
const textOrUndefined = (value: string | undefined) => value?.trim() || undefined;

/** Compact only database boilerplate, never a user's recorded words. */
function record(log: ProgressLog, titles: Map<string, string>) {
  return {
    date: log.timestamp,
    mediaId: log.mediaId,
    title: titles.get(log.mediaId) || 'Unknown media',
    metric: log.metricType,
    delta: log.delta,
    note: textOrUndefined(log.note),
    journalThoughts: textOrUndefined(log.thoughts),
    journalQuestion: textOrUndefined(log.thoughtPrompt),
    sessionEnjoyment: log.sessionEnjoyment ?? undefined,
    sessionImpact: log.sessionImpact ?? undefined,
    moodlets: log.moodlets?.length ? log.moodlets : undefined,
    location: textOrUndefined(log.location),
  };
}

export function buildWrappedResearchContext(args: {
  timeframe: StoryPeriod;
  timeId: string;
  periodStart: Date;
  periodEnd: Date;
  periodLogs: ProgressLog[];
  allLogs: ProgressLog[];
  media: MediaItem[];
  recaps: HistoricalRecap[];
  lookbackMonths?: number;
}): WrappedResearchContext {
  const { timeframe, timeId, periodStart, periodEnd, periodLogs, allLogs, media, recaps } = args;
  const start = periodStart.getTime();
  const end = periodEnd.getTime();
  const lower = subMonths(periodStart, args.lookbackMonths ?? 4).getTime();
  const visible = allLogs
    .filter(log => !log.isHistoric && !log.timestamp.startsWith('1970-01-01') &&
      Number.isFinite(shiftedTime(log)) && shiftedTime(log) <= end)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const titles = new Map(media.map(m => [m.id, m.title]));
  const current = periodLogs.filter(l => !l.isHistoric && Number.isFinite(shiftedTime(l)) &&
    shiftedTime(l) >= start && shiftedTime(l) <= end);
  const previous = visible.filter(l => shiftedTime(l) < start && shiftedTime(l) >= lower);
  const activeMediaIds = [...new Set(current.map(l => l.mediaId))].filter(id => titles.has(id));

  // Include historical, actually logged entries from the same universes, but
  // never future/unplayed library records merely because they share a franchise.
  const activeMedia = media.filter(m => activeMediaIds.includes(m.id));
  const franchises = new Set(activeMedia.flatMap(m => (m.franchises || []).filter(Boolean)));
  const seenIds = new Set(visible.map(l => l.mediaId));
  const recentIds = new Set(previous.map(l => l.mediaId));
  const directory = media.filter(m => seenIds.has(m.id) &&
    (activeMediaIds.includes(m.id) || recentIds.has(m.id) ||
      (m.franchises || []).some(name => franchises.has(name))))
    .map(m => {
      const sessions = visible.filter(l => l.mediaId === m.id);
      return {
        id: m.id, title: m.title, type: m.mediaType, year: m.year,
        genres: m.genres, universes: m.franchises || [],
        firstLogged: sessions[0]?.timestamp, lastLogged: sessions.at(-1)?.timestamp,
        sessions: sessions.length, touchedThisPeriod: activeMediaIds.includes(m.id),
        // These personal ratings are provided as-of the target period by the caller.
        rating: m.userRating, review: m.userReview,
      };
    });

  const target = wrappedPeriodRange(timeframe, timeId);
  const oldRecaps = recaps.filter(row => {
    if (!target || !row.timeframe || !row.timeId) return false;
    const range = wrappedPeriodRange(row.timeframe, row.timeId);
    return !!range && range.end < target.start;
  }).sort((a, b) => {
    const aDate = wrappedPeriodRange(a.timeframe!, a.timeId!)!.end;
    const bDate = wrappedPeriodRange(b.timeframe!, b.timeId!)!.end;
    return bDate.localeCompare(aDate);
  }).slice(0, 5).map(row => ({
    period: row.timeframe + ' ' + row.timeId,
    title: row.title,
    // Full written editorial, rather than a summarizer's interpretation.
    story: row.data?.structured || row.summary || '',
    provenance: 'EARLIER AI EDITORIAL; not evidence of actions, emotions or events',
  }));

  return {
    currentLogs: JSON.stringify(current.map(l => record(l, titles))),
    recentLogs: JSON.stringify(previous.map(l => record(l, titles))),
    mediaDirectory: JSON.stringify(directory),
    previousRecaps: JSON.stringify(oldRecaps),
    activeMediaIds, periodEnd, history: visible, media,
  };
}

/**
 * After the research pass chooses which CURRENT works deserve a deep dive,
 * supply their complete documented journey, irrespective of age. Include
 * related franchise works as separate historical context, never new events.
 */
export function buildWrappedJourneyHistory(
  context: WrappedResearchContext,
  requestedIds: readonly string[],
): string {
  const selected = [...new Set(requestedIds)]
    .filter(id => context.activeMediaIds.includes(id));
  const titles = new Map(context.media.map(m => [m.id, m.title]));
  const result = selected.map(mediaId => {
    const entry = context.media.find(m => m.id === mediaId)!;
    const timeline = context.history.filter(log => log.mediaId === mediaId);
    const universeNames = new Set(entry.franchises || []);
    const related = context.media.filter(m => m.id !== mediaId &&
      (m.franchises || []).some(name => universeNames.has(name)));
    const relatedTimelines = related.map(m => {
      const logs = context.history.filter(l => l.mediaId === m.id);
      if (!logs.length) return null;
      return {
        mediaId: m.id, title: m.title, sharedUniverses: (m.franchises || []).filter(n => universeNames.has(n)),
        firstLogged: logs[0].timestamp, lastLogged: logs.at(-1)!.timestamp,
        logCount: logs.length,
        // Retain the user's own previous reflections across the franchise.
        datedJournalThoughts: logs.filter(l => l.thoughts?.trim())
          .map(l => ({ date: l.timestamp, thoughts: l.thoughts })),
      };
    }).filter(Boolean);
    return {
      mediaId, title: entry.title, universeNames: [...universeNames],
      firstLogged: timeline[0]?.timestamp, lastLogged: timeline.at(-1)?.timestamp,
      completeLoggedJourney: timeline.map(l => record(l, titles)),
      otherPreviouslyExperiencedUniverseMedia: relatedTimelines,
    };
  });
  return JSON.stringify(result);
}
