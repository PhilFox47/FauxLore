import type { ProgressLog } from '../types/schema';
import { readMoodlets } from './quickMoodlets';

export type PersonalMoment = {
  log: ProgressLog;
  /** The user entered this in the journal field, not as a session label. */
  source: 'journal' | 'note';
  text: string;
  score: number;
};

const meaningSignals = /\b(core memory|never forget|unforgettable|meant so much|amazing experience|finished|finally finished|completed|ending|finale|with (the )?(whole|entire)|guild|free company|discord|together|people i (have )?met|in real life|cried|tears|changed my mind|heartbreaking|loved it|back online|missed (it|this))\b/i;

/**
 * Rank user-WRITTEN moments ahead of mere progress totals. 'Notes' can contain
 * meaningful firsthand context even though they are NOT journal entries.
 *
 * No keyword is used as invented evidence: the exact stored text is sent to
 * the writer. These signals only determine which authored records get airtime.
 */
export function selectPersonalMoments(
  logs: ProgressLog[],
  options: { journalLimit?: number; noteLimit?: number; perMedia?: number } = {},
): PersonalMoment[] {
  const journalLimit = options.journalLimit ?? 18;
  const noteLimit = options.noteLimit ?? 18;
  const perMedia = options.perMedia ?? 4;
  const scored: PersonalMoment[] = [];
  for (const log of logs) {
    if (log.metricType === 'statusChange') continue;
    const impact = log.sessionImpact ?? null;
    const ratedImpact = typeof impact === 'number' && impact >= 1 && impact <= 5 ? impact : null;
    const tags = readMoodlets(log.moodlets);
    const highImpact = ratedImpact !== null && ratedImpact >= 4;
    const strongMood = tags.includes('moving') || tags.includes('thought-provoking') ||
      tags.includes('social') || tags.includes('immersed');
    for (const source of ['journal', 'note'] as const) {
      const text = (source === 'journal' ? log.thoughts : log.note)?.trim();
      if (!text) continue;
      // A short 'Episode 7' is useful metadata, but should never displace the
      // person's 400-character final-MSQ-with-friends memory.
      const important = meaningSignals.test(text);
      const score = (source === 'journal' ? 12 : 0) +
        (ratedImpact !== null ? ratedImpact * 3 : 0) +
        (strongMood ? 6 : 0) + (important ? 9 : 0) +
        Math.min(7, Math.floor(text.length / 70)) +
        (text.length >= 80 ? 3 : 0);
      scored.push({log, source, text, score});
    }
  }
  // Explicit importance dominates chronological position and raw Master Pages.
  scored.sort((a,b) => b.score - a.score ||
    b.text.length - a.text.length || b.log.timestamp.localeCompare(a.log.timestamp) ||
    a.log.id.localeCompare(b.log.id));
  const selected: PersonalMoment[] = [];
  const counts = {journal: 0, note: 0};
  const byMedia = new Map<string, number>();
  const seenText = new Set<string>();
  for (const moment of scored) {
    if (counts[moment.source] >= (moment.source === 'journal' ? journalLimit : noteLimit)) continue;
    if ((byMedia.get(moment.log.mediaId) || 0) >= perMedia) continue;
    const signature = moment.log.mediaId + ':' + moment.text.toLowerCase().replace(/\s+/g, ' ');
    if (seenText.has(signature)) continue;
    selected.push(moment);
    seenText.add(signature);
    counts[moment.source]++;
    byMedia.set(moment.log.mediaId, (byMedia.get(moment.log.mediaId) || 0) + 1);
  }
  return selected;
}

/** Carry an explicit month-phase sample, rather than only the first two logs. */
export function phaseJournalHighlights(logs: ProgressLog[], limit = 2): PersonalMoment[] {
  return selectPersonalMoments(logs, {journalLimit: limit, noteLimit: 0, perMedia: limit})
    .filter(moment => moment.source === 'journal').slice(0, limit);
}
