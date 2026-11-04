import type { ProgressLog } from '../types/schema';
import { readMoodlets } from './quickMoodlets';

/**
 * "Journal Thoughts" is the user's deliberate reflective writing.
 * "Notes" is organizational context (chapters, issues, companions, plot beats).
 * Do not infer emotional importance from what a Note happens to mention.
 */
export type PersonalMoment = {
  log: ProgressLog;
  source: 'journal';
  text: string;
  score: number;
};

export type SessionContextNote = {
  log: ProgressLog;
  source: 'note';
  text: string;
};

/** Sort personal reflections by subjective salience, independent of Master Pages. */
export function selectPersonalMoments(
  logs: ProgressLog[],
  options: { journalLimit?: number; noteLimit?: number; perMedia?: number } = {},
): PersonalMoment[] {
  const journalLimit = options.journalLimit ?? 18;
  const perMedia = options.perMedia ?? 4;
  const scored: PersonalMoment[] = [];
  for (const log of logs) {
    if (log.metricType === 'statusChange') continue;
    const text = log.thoughts?.trim();
    if (!text) continue;
    const impact = typeof log.sessionImpact === 'number' &&
      log.sessionImpact >= 1 && log.sessionImpact <= 5 ? log.sessionImpact : null;
    const moods = readMoodlets(log.moodlets);
    const resonance = moods.includes('moving') || moods.includes('thought-provoking') ||
      moods.includes('social') || moods.includes('immersed');
    const score = 20 + (impact ?? 0) * 3 + (resonance ? 6 : 0) +
      Math.min(8, Math.floor(text.length / 100));
    scored.push({ log, source: 'journal', text, score });
  }
  scored.sort((a,b) => b.score - a.score || b.text.length - a.text.length ||
    b.log.timestamp.localeCompare(a.log.timestamp) || a.log.id.localeCompare(b.log.id));
  const selected: PersonalMoment[] = [];
  const byMedia = new Map<string,number>();
  const seen = new Set<string>();
  for (const moment of scored) {
    if (selected.length >= journalLimit) break;
    if ((byMedia.get(moment.log.mediaId) || 0) >= perMedia) continue;
    const signature = moment.log.mediaId + ':' + moment.text.toLowerCase().replace(/\s+/g,' ');
    if (seen.has(signature)) continue;
    selected.push(moment);
    seen.add(signature);
    byMedia.set(moment.log.mediaId,(byMedia.get(moment.log.mediaId) || 0)+1);
  }
  return selected;
}

/**
 * Notes are capped background lookups, never independent editorial moments.
 * Prefer context accompanying a written Journal or explicit Impact/Moodlets,
 * but do not reward plot words ('battle', 'finished') or long issue lists.
 */
export function selectSessionContextNotes(
  logs: ProgressLog[],
  options: { limit?: number; perMedia?: number; relevantMediaIds?: readonly string[] } = {},
): SessionContextNote[] {
  const limit = options.limit ?? 10;
  const perMedia = options.perMedia ?? 2;
  const relevant = new Set(options.relevantMediaIds ?? []);
  const all = logs.filter(log => log.metricType !== 'statusChange' && !!log.note?.trim());
  const scored = all.map(log => {
    const moods = readMoodlets(log.moodlets);
    const hasImpact = typeof log.sessionImpact === 'number' && log.sessionImpact >= 4;
    const score = (log.thoughts?.trim() ? 100 : 0) +
      (relevant.has(log.mediaId) ? 30 : 0) +
      (hasImpact ? 12 : 0) +
      (moods.includes('moving') || moods.includes('social') ? 5 : 0);
    return {log,source:'note' as const,text:log.note!.trim(),score};
  }).sort((a,b)=>b.score-a.score || b.log.timestamp.localeCompare(a.log.timestamp));
  const result:SessionContextNote[]=[];
  const per=new Map<string,number>();
  const seen=new Set<string>();
  for (const note of scored) {
    if(result.length >= limit) break;
    if((per.get(note.log.mediaId)||0)>=perMedia)continue;
    const sig=note.log.mediaId+':'+note.text.toLowerCase().replace(/\s+/g,' ');
    if(seen.has(sig))continue;
    seen.add(sig);
    per.set(note.log.mediaId,(per.get(note.log.mediaId)||0)+1);
    result.push({log:note.log,source:'note',text:note.text.slice(0,260)});
  }
  return result;
}

export function phaseJournalHighlights(logs: ProgressLog[],limit=2):PersonalMoment[] {
  return selectPersonalMoments(logs,{journalLimit:limit,perMedia:limit}).slice(0,limit);
}
