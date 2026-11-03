import {
  endOfISOWeek, endOfMonth, endOfYear, isWithinInterval, parseISO,
  startOfISOWeek, startOfMonth, startOfYear, subHours,
  subMonths, subWeeks, subYears,
} from 'date-fns';
import { calculateScaledDelta } from './scaling';
import type { MediaItem, ProgressLog, Settings } from '../types/schema';

export type FocusPeriod = 'week' | 'month' | 'year';

export interface MediaFocusAnalysis {
  /** Raw period values reflect normalized progress, not hours or deliberate decisions. */
  titleCount: number;
  leadingTitle: string | null;
  leadingShare: number;
  effectiveTitles: number;
  baselinePeriods: number;
  baselineLeadingShare: number | null;
  baselineEffectiveTitles: number | null;
  /** Only true when concentration is markedly above this person's historical norm. */
  unusuallyFocused: boolean;
  formatShifts: Array<{ type: string; currentShare: number; baselineShare: number }>;
}

const bounds = (date: Date, kind: FocusPeriod) => kind === 'week'
  ? { start: startOfISOWeek(date), end: endOfISOWeek(date) }
  : kind === 'month' ? { start: startOfMonth(date), end: endOfMonth(date) }
    : { start: startOfYear(date), end: endOfYear(date) };
const back = (date: Date, kind: FocusPeriod, n: number) =>
  kind === 'week' ? subWeeks(date, n) : kind === 'month' ? subMonths(date, n) : subYears(date, n);

function summarize(
  logs: ProgressLog[], byId: Map<string, MediaItem>, settings?: Settings | null,
) {
  const perTitle = new Map<string, number>();
  const perType = new Map<string, number>();
  for (const log of logs) {
    if (log.metricType === 'statusChange') continue;
    const media = byId.get(log.mediaId);
    if (!media) continue;
    const amount = calculateScaledDelta(log.delta || 0, media, settings);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    perTitle.set(media.id, (perTitle.get(media.id) || 0) + amount);
    perType.set(media.mediaType, (perType.get(media.mediaType) || 0) + amount);
  }
  const values = [...perTitle].sort((a, b) => b[1] - a[1]);
  const total = values.reduce((s, [,v]) => s + v, 0);
  const shares = total ? values.map(([,v]) => v / total) : [];
  return {
    titleCount: values.length,
    leadingId: values[0]?.[0] || null,
    leadingShare: shares[0] || 0,
    // Inverse concentration (Simpson effective titles) is robust to background
    // items with tiny progress; unlike a raw title count it measures attention.
    effectiveTitles: shares.length ? 1 / shares.reduce((s, v) => s + v * v, 0) : 0,
    typeShares: new Map([...perType].map(([type, amount]) => [type, total ? amount / total : 0])),
  };
}

/**
 * Calibrate media concentration to the user's own preceding, comparable
 * periods. Having many titles is a normal property of an all-media tracker,
 * not an intrinsic editorial event.
 *
 * Comparisons are for same-length calendar periods; logs are shifted by the
 * application's existing 05:00 reporting boundary before grouping.
 */
export function analyzeMediaFocus(args: {
  timeframe: FocusPeriod;
  periodStart: Date;
  logs: ProgressLog[];
  history: ProgressLog[];
  media: MediaItem[];
  settings?: Settings | null;
}): MediaFocusAnalysis {
  const { timeframe, periodStart, logs, history, media, settings } = args;
  const byId = new Map(media.map(m => [m.id, m]));
  const current = summarize(logs, byId, settings);
  const past = Array.from({ length: 12 }, (_, index) => {
    const { start, end } = bounds(back(periodStart, timeframe, index + 1), timeframe);
    const historical = history.filter(log => {
      if (log.metricType === 'statusChange') return false;
      const shifted = subHours(parseISO(log.timestamp), 5);
      return isWithinInterval(shifted, { start, end });
    });
    const distribution = summarize(historical, byId, settings);
    // Ignore tiny one-off historical windows; they artificially look focused.
    return historical.length >= 2 && distribution.titleCount > 0 ? distribution : null;
  }).filter((v): v is NonNullable<typeof v> => v !== null);
  const baselineLeadingShare = past.length >= 3
    ? past.reduce((s, p) => s + p.leadingShare, 0) / past.length : null;
  const baselineEffectiveTitles = past.length >= 3
    ? past.reduce((s, p) => s + p.effectiveTitles, 0) / past.length : null;
  const formatShifts = past.length >= 3 ? [...current.typeShares]
    .map(([type, currentShare]) => ({
      type, currentShare,
      baselineShare: past.reduce((s, p) => s + (p.typeShares.get(type) || 0), 0) / past.length,
    }))
    .filter(shift => Math.abs(shift.currentShare - shift.baselineShare) >= 0.12)
    .sort((a, b) =>
      Math.abs(b.currentShare - b.baselineShare) - Math.abs(a.currentShare - a.baselineShare))
    .slice(0, 3) : [];
  const unusuallyFocused = current.titleCount > 0 && baselineLeadingShare !== null &&
    current.leadingShare >= 0.30 &&
    current.leadingShare - baselineLeadingShare >= 0.12 &&
    current.leadingShare >= baselineLeadingShare * 1.25;
  return {
    titleCount: current.titleCount,
    leadingTitle: current.leadingId ? byId.get(current.leadingId)?.title || null : null,
    leadingShare: current.leadingShare,
    effectiveTitles: current.effectiveTitles,
    baselinePeriods: past.length,
    baselineLeadingShare,
    baselineEffectiveTitles,
    unusuallyFocused,
    formatShifts,
  };
}

export function focusEditorialCalibration(focus: MediaFocusAnalysis): string {
  const note = [
    'BASELINE: FauxLore tracks virtually all entertainment types. Numerous titles, genres,',
    'same-day media combinations and switching between works are routine, not a discovery.',
    'Do NOT celebrate, mock, diagnose, or center the issue on a busy media mix just because',
    'several titles were logged. Title count is descriptive, not evidence of chaos.',
  ].join(' ');
  if (focus.baselineLeadingShare === null) return note +
    ' A reliable same-length historical concentration baseline is unavailable; do not claim an unusual level of switching OR focus.';
  const stats = 'Leading title share: ' + Math.round(focus.leadingShare * 100) +
    '% this period versus ' + Math.round(focus.baselineLeadingShare * 100) +
    '% average in ' + focus.baselinePeriods + ' previous active comparable periods (normalized Master Pages, NOT hours).';
  const shifts = focus.formatShifts.length
    ? ' REAL FORMAT SHIFTS (relative to personal baseline, normalized progress shares): ' +
      focus.formatShifts.map(s => s.type + ' ' + Math.round(s.currentShare * 100) +
        '% now versus ' + Math.round(s.baselineShare * 100) + '% usual').join('; ') +
      '. These differences may be more meaningful than the number of titles.'
    : '';
  return note + ' ' + stats + shifts + ' ' + (
    focus.unusuallyFocused
      ? 'UNUSUAL CONCENTRATION DETECTED: ' + (focus.leadingTitle || 'One title') +
        ' occupied substantially more of this period than the personal baseline. This MAY be an editorial angle if it connects to compelling evidence. Other titles remaining in the logs do not negate the focus.'
      : 'No exceptional single-title concentration established. Ordinary variety is not an editorial angle. Look instead for reactions, specific works, meaningful changes of format, documented choices, places or genuinely distinctive connections.'
  );
}
