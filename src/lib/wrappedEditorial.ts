import type { StoryPeriod } from './storyDiscovery';

export type MonthPhase = 'early' | 'middle' | 'late';

/**
 * Charts need a genuine deviation, not just an easy 15-point talking point.
 * A huge absolute change qualifies; a 18+ point change qualifies when a
 * format at least doubles or halves its normal share (e.g. 5% -> 24%).
 * Both inputs are 0..1 normalized shares, not percentages or elapsed hours.
 */
export function isSignificantFormatShift(current: number, baseline: number): boolean {
  if (![current, baseline].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) return false;
  const difference = Math.abs(current - baseline);
  const largeRelativeChange = Math.max(current, baseline) >= 2 * Math.max(.001, Math.min(current, baseline));
  return difference >= .25 || (difference >= .18 && largeRelativeChange);
}

/** Ratings are on a 0..5 scale; a 0.5-star gap isn't a story-sized chart. */
export function isSignificantTasteGap(user: number, critics: number): boolean {
  return Number.isFinite(user) && Number.isFinite(critics) &&
    user >= 0 && user <= 5 && critics >= 0 && critics <= 5 &&
    Math.abs(user - critics) >= 1;
}

/** Compatibility gate for already-saved stories during a visual-only reroll.
 * The authoritative values are normalized 0..100 chart bars supplied by the
 * app, never invented by the visual model.
 */
export function isStrongSceneData(
  kind: string, bars?: Array<{ value: number }> | null,
): boolean {
  if (!bars || bars.length < 2 || !bars.every(b => Number.isFinite(b.value) && b.value >= 0 && b.value <= 100)) {
    return false;
  }
  if (kind === 'outlier') {
    return isSignificantFormatShift(bars[1].value / 100, bars[0].value / 100);
  }
  if (kind === 'taste') {
    return Math.abs(bars[0].value - bars[1].value) >= 20;
  }
  return false;
}

export const MAX_DATA_SLIDES: Record<StoryPeriod, number> = {
  week: 1,
  month: 2,
  year: 3,
};

export function isDataLayout(kind: string, layout?: string, visual?: string): boolean {
  return kind === 'outlier' || kind === 'taste' || layout === 'infographic' ||
    visual === 'bars' || visual === 'rings' || visual === 'tiles';
}

/**
 * Two slides must not use different chart skins to retell the same finding.
 * The same-period outlier facts are all about one format-mix change; put
 * multiple related shifts in ONE scene or choose a genuinely different idea.
 */
export function evidenceStoryFunctions(ids: string[]): string[] {
  const keys = new Set<string>();
  for (const id of ids) {
    if (id.startsWith('outlier-')) keys.add('format-share-shift');
    else if (id.startsWith('focus-')) keys.add('title-concentration');
    else if (id.startsWith('taste-')) keys.add('taste:' + id.slice(6));
    else if (id === 'timeline') keys.add('period-leaders');
    else if (id.startsWith('session-enjoyment-')) keys.add('session-reaction:' + id.slice(18));
    // Other facts can support multiple DIFFERENT scenes. Mere overlap of a
    // media or location ID does not prove a repeated editorial point.
  }
  return [...keys];
}

export function monthPhase(day: number): MonthPhase {
  return day <= 10 ? 'early' : day <= 20 ? 'middle' : 'late';
}

export const monthPhaseLabel: Record<MonthPhase, string> = {
  early: 'days 1-10', middle: 'days 11-20', late: 'days 21-end',
};

export interface MonthlyCoverage {
  requiredPhases: MonthPhase[];
  /** Portion of this month's weighted progress from its final seven days. */
  lastWeekShare: number;
  /** The number of phase-specific narrative scenes required when possible. */
  minPhaseScenes: number;
}

/** Avoid requiring a fake story from an empty or negligible slice of a month. */
export function requiredMonthlyPhases(shares: Record<MonthPhase, number>): MonthPhase[] {
  return (['early', 'middle', 'late'] as MonthPhase[]).filter(phase => shares[phase] >= .12);
}
