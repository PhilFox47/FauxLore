import type { MediaItem, ProgressLog, Settings } from '../types/schema';
import { calculateScaledDelta } from './scaling';
import { QUICK_MOODLETS, readMoodlets, type MoodletId } from './quickMoodlets';

export interface RecapMediaSignal {
  mediaId: string;
  title: string;
  pages: number;
  pageShare: number;
  sessions: number;
  firstSessionAt: string;
  journalOrReview: boolean;
  impactCount: number;
  averageImpact: number | null;
  maxImpact: number | null;
  enjoymentCount: number;
  averageEnjoyment: number | null;
  journalCount: number;
  moodlets: { id: MoodletId; label: string; count: number }[];
  /** Subjective resonance needs evidence. No scores means 'unknown', not low. */
  resonance: 'high' | 'some' | 'low' | 'unknown';
  contrast: 'quiet-standout' | 'high-volume-low-impact' | null;
}

/**
 * Split quantitative exposure from qualitative significance. This is NOT a
 * master-page multiplier: a single high-impact hour can lead editorial
 * selection ahead of weeks of passing-time sessions.
 */
export function analyzeRecapSalience(args: {
  logs: ProgressLog[]; media: MediaItem[]; settings?: Settings | null;
}): RecapMediaSignal[] {
  const byId = new Map(args.media.map(m => [m.id, m]));
  const grouped = new Map<string, ProgressLog[]>();
  for (const log of args.logs) {
    if (log.metricType === 'statusChange' || log.isHistoric || !byId.has(log.mediaId)) continue;
    const group = grouped.get(log.mediaId) || [];
    group.push(log);
    grouped.set(log.mediaId, group);
  }
  const records = [...grouped].map(([id, logs]) => {
    const media = byId.get(id)!;
    const pages = Math.max(0, logs.reduce((sum, log) =>
      sum + Math.max(0, calculateScaledDelta(log.delta, media, args.settings)), 0));
    const impacts = logs.map(log => log.sessionImpact)
      .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5);
    const enjoys = logs.map(log => log.sessionEnjoyment)
      .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5);
    const moodCounts = new Map<MoodletId, number>();
    for (const log of logs) for (const id of readMoodlets(log.moodlets)) {
      moodCounts.set(id, (moodCounts.get(id) || 0) + 1);
    }
    const avg = (values: number[]) => values.length
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
    const averageImpact = avg(impacts);
    return {
      mediaId: id, title: media.title, pages, pageShare: 0,
      sessions: logs.length,
      firstSessionAt: logs.map(log => log.timestamp).sort()[0] || '',
      journalOrReview: logs.some(log => !!log.thoughts?.trim()) ||
        !!media.userReview?.trim(),
      impactCount: impacts.length,
      averageImpact, maxImpact: impacts.length ? Math.max(...impacts) : null,
      enjoymentCount: enjoys.length, averageEnjoyment: avg(enjoys),
      journalCount: logs.filter(log => !!log.thoughts?.trim()).length,
      moodlets: QUICK_MOODLETS.filter(m => moodCounts.has(m.id))
        .map(m => ({ id: m.id, label: m.label, count: moodCounts.get(m.id)! })),
      resonance: 'unknown' as RecapMediaSignal['resonance'],
      contrast: null as RecapMediaSignal['contrast'],
    };
  });
  const total = records.reduce((sum, item) => sum + item.pages, 0);
  for (const item of records) {
    item.pageShare = total > 0 ? item.pages / total : 0;
    // A 5/5 experience must remain visible even if only one session was logged.
    item.resonance = item.maxImpact !== null
      ? item.maxImpact >= 4 ? 'high' : item.averageImpact !== null && item.averageImpact >= 3 ? 'some' : 'low'
      : item.journalOrReview || item.moodlets.some(m => m.id === 'moving' || m.id === 'thought-provoking')
        ? 'some' : 'unknown';
    if (item.impactCount > 0 && item.maxImpact !== null && item.maxImpact >= 4 &&
      item.pageShare < 0.15) item.contrast = 'quiet-standout';
    if (item.impactCount > 0 && item.averageImpact !== null &&
      item.averageImpact <= 2 && item.pageShare >= 0.25) item.contrast = 'high-volume-low-impact';
  }
  return records;
}

/** Editorial candidates, not a mandatory ranking of the user's favorite works. */
export function selectRecapEditorialCandidates(signals: RecapMediaSignal[], limit = 16): RecapMediaSignal[] {
  const chosen = new Map<string, RecapMediaSignal>();
  const add = (items: RecapMediaSignal[], budget: number) => {
    for (const item of items.slice(0, budget)) if (chosen.size < limit) chosen.set(item.mediaId, item);
  };
  const byResonance = [...signals].filter(s => s.resonance === 'high').sort((a, b) =>
    (b.maxImpact || 0) - (a.maxImpact || 0) ||
    (b.averageImpact || 0) - (a.averageImpact || 0) ||
    a.pages - b.pages);
  add(byResonance, 8);
  add([...signals].filter(s => !!s.contrast).sort((a, b) =>
    (a.contrast === 'quiet-standout' ? -1 : 1) - (b.contrast === 'quiet-standout' ? -1 : 1)), 4);
  add([...signals].filter(s => s.journalOrReview)
    .sort((a, b) => b.journalCount - a.journalCount || a.pages - b.pages), 5);
  add([...signals].filter(s => s.moodlets.some(m => m.id === 'moving' || m.id === 'thought-provoking'))
    .sort((a, b) => b.moodlets.length - a.moodlets.length), 4);
  // Consumption still belongs in the story, but cannot monopolize its casting.
  add([...signals].sort((a, b) => b.pages - a.pages), 5);
  // Even before Moodlets existed, previous months had meaningful minority
  // media. Offer additional candidates distributed across the period, not only
  // yet another top-five consumption list. These are POSSIBILITIES, not forced
  // scenes: the Writer still needs an actual angle.
  const minor = [...signals].filter(s => s.pages > 0 && s.pageShare < 0.15)
    .sort((a, b) => a.firstSessionAt.localeCompare(b.firstSessionAt));
  if (minor.length) {
    const indices = [...new Set([0, Math.floor((minor.length - 1) / 2), minor.length - 1])];
    add(indices.map(index => minor[index]), 3);
  }
  return [...chosen.values()].slice(0, limit);
}

export function recapSalienceBrief(signals: RecapMediaSignal[]): string {
  const selected = selectRecapEditorialCandidates(signals);
  if (!selected.length) return 'No media sessions recorded.';
  return [
    'QUALITATIVE EDITORIAL CANDIDATES (not a ranked list of favorite titles):',
    ...selected.map(s =>
      '- ' + s.title + ': ' + Math.round(s.pageShare * 100) + '% of normalized Master Pages' +
      '; ' + s.sessions + ' session(s)' +
      (s.impactCount ? '; reported impact ' + s.averageImpact + '/5 average, peak ' + s.maxImpact + '/5 in ' + s.impactCount + ' rated session(s)' : '; impact not rated (UNKNOWN, not low)') +
      (s.enjoymentCount ? '; enjoyment ' + s.averageEnjoyment + '/5 across ' + s.enjoymentCount + ' sessions' : '') +
      (s.journalCount ? '; ' + s.journalCount + ' personal journal reflection(s)' : '') +
      (s.journalOrReview && !s.journalCount ? '; written work review on record by period end' : '') +
      (s.moodlets.length ? '; explicitly selected Moodlets: ' + s.moodlets.map(m => m.label + ' x' + m.count).join(', ') : '') +
      (s.contrast === 'quiet-standout' ? '; CONTRAST: little time, strong reported impact' :
        s.contrast === 'high-volume-low-impact' ? '; CONTRAST: high time investment, low reported impact' : '')),
    'Editorial rule: Master Pages measure exposure, not meaning. Consider documented high-impact low-volume works, reversals between enjoyment and impact, journal reflections and qualitative Moodlets alongside major time commitments. Do not automatically give the top three highest-MP titles the most space. No moodlet/impact score means NOT RECORDED, not neutral or negative. Moodlets are subjective session annotations, not permanent judgments about the work. Never infer unlogged feelings or manufacture a narrative contrast.',
  ].join('\n');
}
