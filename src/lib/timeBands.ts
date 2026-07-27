import { parseISO, subHours } from 'date-fns';

/**
 * The times of day, defined once.
 *
 * "Night" used to mean different hours in different views, and none of them
 * said which hours they meant. These are the canonical bands, and every label
 * ships its own range so a reader never has to guess.
 *
 * They are laid out against the app's 05:00 day boundary rather than midnight:
 * the day begins when the morning does, and everything from 22:00 until 04:59
 * is one unbroken night belonging to the day it started on. A log at 02:00 on
 * Tuesday is Monday night, both in the label and in the weekday it counts
 * toward.
 */

/** The hour a new day begins. Anything earlier belongs to the night before. */
export const DAY_START_HOUR = 5;

export type TimeBandKey = 'morning' | 'afternoon' | 'evening' | 'night';

export interface TimeBand {
  key: TimeBandKey;
  label: string;
  /** Human-readable, inclusive: "22:00–04:59". */
  range: string;
  /** First hour of the band. */
  start: number;
  /** First hour *after* the band. Night wraps past midnight, so end < start. */
  end: number;
}

/** In the order a day is actually lived, starting at the 05:00 boundary. */
export const TIME_BANDS: TimeBand[] = [
  { key: 'morning', label: 'Morning', range: '05:00–11:59', start: 5, end: 12 },
  { key: 'afternoon', label: 'Afternoon', range: '12:00–16:59', start: 12, end: 17 },
  { key: 'evening', label: 'Evening', range: '17:00–21:59', start: 17, end: 22 },
  { key: 'night', label: 'Night', range: '22:00–04:59', start: 22, end: DAY_START_HOUR },
];

export const TIME_BAND_KEYS = TIME_BANDS.map((b) => b.key);

/** Which band an hour of the clock falls in. Every hour belongs to exactly one. */
export function bandIndexForHour(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const i = TIME_BANDS.findIndex((b) =>
    b.start < b.end ? h >= b.start && h < b.end : h >= b.start || h < b.end,
  );
  // The wrapping night covers whatever the daytime bands do not.
  return i === -1 ? TIME_BANDS.length - 1 : i;
}

export function bandForHour(hour: number): TimeBand {
  return TIME_BANDS[bandIndexForHour(hour)];
}

export function bandByKey(key: TimeBandKey): TimeBand {
  return TIME_BANDS.find((b) => b.key === key) || TIME_BANDS[0];
}

/** "Evening (17:00–21:59)" — the label as it should be shown to a reader. */
export function describeBand(band: TimeBand): string {
  return `${band.label} (${band.range})`;
}

/**
 * The date a timestamp belongs to under the 05:00 boundary, so late-night
 * activity counts toward the day it started on rather than the calendar date.
 */
export function logDate(timestamp: string | Date): Date {
  const d = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;
  return subHours(d, DAY_START_HOUR);
}

/** Monday-first weekday index (0-6) for a timestamp, on the same boundary. */
export function logWeekdayIndex(timestamp: string | Date): number {
  return (logDate(timestamp).getDay() + 6) % 7;
}
