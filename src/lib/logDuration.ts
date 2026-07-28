import { MediaItem, ProgressLog, Settings } from '../types/schema';
import { DAY_START_HOUR } from './timeBands';

/**
 * How long a log actually took.
 *
 * A log records a moment, but the thing it records took time. Eight hours of a
 * game entered at 22:00 did not happen at 22:00 — it ran from 14:00 to 22:00,
 * and counting it as a single point puts an entire afternoon and evening into
 * "Night". Every time-of-day statistic was wrong in exactly that way, and
 * always in the same direction: later than reality.
 *
 * So a log is treated as a span ending at its timestamp. The timestamp is the
 * end rather than the start because that is when someone stops and writes it
 * down; you log what you just did, not what you are about to do.
 *
 * Duration is derived rather than stored: everything it needs is already on the
 * log and the entry, and deriving means an entry that later gains a runtime
 * corrects its own history instead of leaving stale numbers behind.
 */

/**
 * Minutes per unit of progress, where the unit is not already time.
 *
 * Games, visual novels and audiobooks track hours directly, so they need
 * nothing here. The rest are estimates, and are meant to be: a page is not
 * always a minute, but it is much closer to the truth than zero.
 */
export const DURATION_RATES = {
  /** Books: one page, one minute. */
  bookMinutesPerPage: 1,
  /** Comics: one issue, twenty minutes. */
  comicMinutesPerIssue: 20,
  /** Manga: one chapter, twelve minutes. */
  mangaMinutesPerChapter: 12,
  /** Used only when a movie has no runtime recorded. */
  movieFallbackMinutes: 110,
  /** Used only when a series has no per-episode runtime recorded. */
  episodeFallbackMinutes: 42,
};

/**
 * The longest a single log is allowed to stretch.
 *
 * One mistyped delta — 5000 pages instead of 50 — would otherwise smear a
 * session across days and quietly corrupt every chart it touched. Sixteen hours
 * is longer than any plausible sitting and short enough to contain the damage.
 */
export const MAX_SPAN_MINUTES = 16 * 60;

/** How long this log's progress took, in minutes. Zero when it cannot be told. */
export function logDurationMinutes(
  log: Pick<ProgressLog, 'delta' | 'metricType'>,
  item: MediaItem | undefined,
  _settings?: Settings | null,
): number {
  if (!item) return 0;
  if (log.metricType === 'statusChange') return 0;
  // Corrections run backwards; they undo progress rather than taking time.
  const delta = Math.max(0, log.delta || 0);
  if (delta <= 0) return 0;

  let minutes = 0;
  switch (item.mediaType) {
    case 'Game':
    case 'Visual Novel':
    case 'Audiobook':
      // Already measured in hours — no estimate needed.
      minutes = delta * 60;
      break;
    case 'Movie':
      minutes = delta * (item.runtimeMinutes && item.runtimeMinutes > 0 ? item.runtimeMinutes : DURATION_RATES.movieFallbackMinutes);
      break;
    case 'Series':
      minutes = delta * (item.runtimeMinutes && item.runtimeMinutes > 0 ? item.runtimeMinutes : DURATION_RATES.episodeFallbackMinutes);
      break;
    case 'Book':
      minutes = delta * DURATION_RATES.bookMinutesPerPage;
      break;
    case 'Comic':
      minutes = delta * DURATION_RATES.comicMinutesPerIssue;
      break;
    case 'Manga':
      minutes = delta * DURATION_RATES.mangaMinutesPerChapter;
      break;
    default:
      minutes = 0;
  }
  return Math.min(MAX_SPAN_MINUTES, Math.round(minutes));
}

export interface LogSpan {
  start: Date;
  end: Date;
  minutes: number;
}

/** The stretch of clock a log covers, ending at its timestamp. */
export function logSpan(
  log: Pick<ProgressLog, 'delta' | 'metricType' | 'timestamp'>,
  item: MediaItem | undefined,
  settings?: Settings | null,
): LogSpan {
  const end = new Date(log.timestamp);
  const minutes = logDurationMinutes(log, item, settings);
  return { start: new Date(end.getTime() - minutes * 60_000), end, minutes };
}

export interface ClockSlice {
  /** Hour of the clock, 0-23, that this slice falls in. */
  hour: number;
  /** Monday-first weekday index under the 05:00 day boundary. */
  weekday: number;
  /** The 05:00-shifted date this slice belongs to. */
  day: Date;
  /** The caller's weight, apportioned by how much of the span lands here. */
  value: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const shiftDay = (d: Date) => new Date(d.getTime() - DAY_START_HOUR * 60 * 60 * 1000);

/**
 * Spreads a weight across every clock hour the log actually covers.
 *
 * A zero-length log — a status change, a correction, a media type with no way
 * to estimate — lands entirely on its own hour, which is exactly the old
 * behaviour. Everything else is apportioned by the minutes spent in each hour,
 * so an eight-hour session contributes to eight hours rather than to one.
 */
export function spreadOverClock(
  log: Pick<ProgressLog, 'delta' | 'metricType' | 'timestamp'>,
  item: MediaItem | undefined,
  settings: Settings | null | undefined,
  weight = 1,
): ClockSlice[] {
  const { start, end, minutes } = logSpan(log, item, settings);
  const sliceAt = (at: Date, value: number): ClockSlice => {
    const shifted = shiftDay(at);
    return { hour: at.getHours(), weekday: (shifted.getDay() + 6) % 7, day: shifted, value };
  };

  if (minutes <= 0) return [sliceAt(end, weight)];

  const slices: ClockSlice[] = [];
  let cursor = new Date(start);
  while (cursor < end) {
    // The end of the clock hour the cursor currently sits in.
    const hourEnd = new Date(cursor);
    hourEnd.setMinutes(60, 0, 0);
    const sliceEnd = hourEnd < end ? hourEnd : end;
    const span = (sliceEnd.getTime() - cursor.getTime()) / 60_000;
    if (span > 0) slices.push(sliceAt(cursor, (weight * span) / minutes));
    cursor = sliceEnd;
  }
  // A span shorter than a rounding error still has to count somewhere.
  return slices.length > 0 ? slices : [sliceAt(end, weight)];
}

/** "8h 05m", "45m" — a duration as a reader would say it. */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
