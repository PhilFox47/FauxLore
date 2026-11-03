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
  // Bars are rounded to one decimal by the existing chart pipeline. Allow
  // microscopic float error at the threshold, never meaningful weak changes.
  return difference + 1e-6 >= .25 || (difference + 1e-6 >= .18 && largeRelativeChange);
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
    else if (id === 'month-arc') keys.add('month-phase-concentration');
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
  /** Grounded per-phase editorial clusters, not invented narrative eras. */
  clusters?: Array<{
    phase: MonthPhase;
    progressShare: number;
    activeDays: number;
    leadingWorks: Array<{ id: string; title: string; share: number }>;
    journalHighlights: Array<{ mediaId: string; quote: string }>;
    places: string[];
  }>;
}

/** Avoid requiring a fake story from an empty or negligible slice of a month. */
export function requiredMonthlyPhases(shares: Record<MonthPhase, number>): MonthPhase[] {
  return (['early', 'middle', 'late'] as MonthPhase[]).filter(phase => shares[phase] >= .12);
}


/**
 * Four verified analytic vocabularies. The AI chooses a presentation, never
 * authors the underlying values or labels. Keep percentages in 0..100.
 */
export type AnalyticTreatment = 'shift' | 'duel' | 'arc' | 'dominance';
export interface AnalyticPoint {
  label: string;
  value: number;
  note: string;
}
export interface VerifiedAnalytic {
  kind: AnalyticTreatment;
  unit: 'percent';
  points: AnalyticPoint[];
}

export function normalizeVerifiedAnalytic(value: unknown): VerifiedAnalytic {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid analytic');
  const data = value as Record<string, unknown>;
  if (!['shift','duel','arc','dominance'].includes(String(data.kind)) ||
    data.unit !== 'percent' || !Array.isArray(data.points)) throw Error('Invalid analytic kind');
  const expected = data.kind === 'arc' ? 3 : 2;
  if (data.points.length !== expected) throw Error('Invalid analytic point count');
  const points = data.points.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Malformed analytic point');
    const p = raw as Record<string, unknown>;
    if (typeof p.label !== 'string' || p.label.trim().length < 1 || p.label.length > 90 ||
      typeof p.value !== 'number' || !Number.isFinite(p.value) || p.value < 0 || p.value > 100 ||
      typeof p.note !== 'string' || p.note.length > 220) throw Error('Invalid analytic point');
    return { label: p.label.trim(), value: p.value, note: p.note.trim() };
  });
  return { kind: data.kind as AnalyticTreatment, unit: 'percent', points };
}

/** A metric must earn its own slide, even if it has an attractive renderer. */
export function isStrongVerifiedAnalytic(input: VerifiedAnalytic | undefined | null): boolean {
  if (!input) return false;
  try {
    const data = normalizeVerifiedAnalytic(input);
    const [first, second, third] = data.points;
    if (data.kind === 'shift') return isSignificantFormatShift(second.value / 100, first.value / 100);
    if (data.kind === 'duel') return Math.abs(second.value - first.value) >= 20;
    if (data.kind === 'dominance') return first.value >= 50 &&
      Math.abs(first.value + second.value - 100) < 1.5;
    return !!third &&
      Math.max(first.value, second.value, third.value) -
      Math.min(first.value, second.value, third.value) >= 25 &&
      Math.abs(first.value + second.value + third.value - 100) < 1.5;
  } catch { return false; }
}

export type EditorialJob =
  'hook' | 'verdict' | 'contrast' | 'turning-point' | 'pattern' |
  'data-reveal' | 'place' | 'reflection' | 'payoff';

/** The story owns the dramaturgical role; the visual AI cannot change it. */
export function editorialJobFromKind(kind: string): EditorialJob {
  switch (kind) {
    case 'opening': return 'hook';
    case 'closing': return 'payoff';
    case 'taste': return 'contrast';
    case 'outlier': return 'data-reveal';
    case 'timeline': return 'turning-point';
    case 'journal': return 'reflection';
    case 'location': return 'place';
    case 'spotlight': return 'verdict';
    case 'return': return 'turning-point';
    default: return 'pattern';
  }
}
export function normalizeEditorialJob(value: unknown, kind: string): EditorialJob {
  const allowed: EditorialJob[] = [
    'hook','verdict','contrast','turning-point','pattern',
    'data-reveal','place','reflection','payoff',
  ];
  if (kind === 'opening') return 'hook';
  if (kind === 'closing') return 'payoff';
  const job = allowed.includes(value as EditorialJob) ? value as EditorialJob : editorialJobFromKind(kind);
  return job;
}
