import type { MediaItem, MediaType, ProgressLog } from '../types/schema';
import { getMetricForType } from '../types/schema';

/**
 * What one library has to show for itself.
 *
 * The header already says how big the shelf is and how much of it is cleared.
 * This is the other question — how the shelf has actually been used, and when —
 * which the app knows from the logs and was not surfacing anywhere except the
 * global Statistics page, where it is mixed in with every other media type.
 *
 * Everything here is derived on the client from data already loaded. No new
 * endpoint, no new column: the logs are all in memory anyway.
 */

export interface MonthBucket {
  /** First day of the month, for sorting and keys. */
  key: string;
  /** "Mar", for the axis. */
  label: string;
  /** Full "March 2026", for the tooltip. */
  full: string;
  /** Total in the type's native unit. */
  value: number;
}

export interface LibraryStats {
  months: MonthBucket[];
  /** Native-unit total since 1 January. */
  thisYear: number;
  /** The biggest single month in the window, or null when nothing was logged. */
  bestMonth: MonthBucket | null;
  /** How many of the last twelve months had any activity at all. */
  activeMonths: number;
  /** Mean of the ratings actually given, or null when none have been. */
  averageRating: number | null;
  /** Whether anything at all has been logged, so the caller can hide the strip. */
  hasActivity: boolean;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHS_SHOWN = 12;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * The last twelve months of activity in one library, plus the figures worth
 * putting beside it.
 *
 * `now` is injected so the window can be argued with in a test rather than
 * hoped about.
 *
 * Historic logs are excluded on purpose. Backfilled progress is stamped
 * 1970-01-01 so it cannot pollute streaks, which means it would either sit
 * outside this window silently or, worse, land in it if that convention ever
 * changed. Saying so here is cheaper than finding out later.
 */
export function libraryStats(
  mediaType: MediaType,
  media: MediaItem[],
  logs: ProgressLog[],
  now = new Date(),
): LibraryStats {
  const mine = media.filter((m) => m.mediaType === mediaType);
  const ids = new Set(mine.map((m) => m.id));
  const metric = getMetricForType(mediaType);

  // An empty window first, so a month with nothing logged is a gap in the chart
  // rather than a missing bar — the shape of the year is the point.
  const months: MonthBucket[] = [];
  const index = new Map<string, MonthBucket>();
  for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const bucket: MonthBucket = {
      key: monthKey(d),
      label: MONTH_SHORT[d.getMonth()],
      full: `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`,
      value: 0,
    };
    months.push(bucket);
    index.set(bucket.key, bucket);
  }

  let thisYear = 0;
  let hasActivity = false;
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

  for (const log of logs) {
    if (!ids.has(log.mediaId)) continue;
    if (log.isHistoric) continue;
    // Only the unit this library is measured in. A status change is activity but
    // has no quantity, and mixing it in would make the bars meaningless.
    if (!metric || log.metricType !== metric) continue;
    const delta = Number(log.delta) || 0;
    if (delta <= 0) continue;

    const at = new Date(log.timestamp);
    if (isNaN(at.getTime())) continue;
    hasActivity = true;

    if (at.getTime() >= yearStart) thisYear += delta;
    const bucket = index.get(monthKey(at));
    if (bucket) bucket.value += delta;
  }

  const rated = mine.map((m) => Number(m.userRating)).filter((r) => Number.isFinite(r) && r > 0);
  const best = months.reduce<MonthBucket | null>(
    (top, m) => (m.value > 0 && (!top || m.value > top.value) ? m : top),
    null,
  );

  return {
    months,
    thisYear: Math.round(thisYear * 10) / 10,
    bestMonth: best,
    activeMonths: months.filter((m) => m.value > 0).length,
    averageRating: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : null,
    hasActivity,
  };
}
