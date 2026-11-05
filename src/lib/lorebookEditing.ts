import { format, parseISO } from 'date-fns';
import type { ProgressLog } from '../types/schema';
import { readMoodlets, type MoodletId } from './quickMoodlets';

export type LorebookReviewFilter = 'all' | 'needs-journal' | 'has-journal';
export type LorebookLogDraft = {
  notes: string;
  thoughts: string;
  enjoyment: number | null;
  impact: number | null;
  moodlets: MoodletId[];
  location: string;
  delta: string;
  date: string;
  time: string;
};

export function lorebookMonth(timestamp:string):string {
  const date=parseISO(timestamp);
  return Number.isNaN(date.getTime())?'':format(date,'yyyy-MM');
}
export function lorebookMonths(logs:ProgressLog[], reviews:readonly {ts:string}[]=[]):string[] {
  return [...new Set([
    ...logs.filter(l=>!l.timestamp.startsWith('1970-01-01')).map(l=>lorebookMonth(l.timestamp)),
    ...reviews.filter(r=>!r.ts.startsWith('1970-01-01')).map(r=>lorebookMonth(r.ts)),
  ].filter(Boolean))].sort().reverse();
}
export function isJournalWritten(log:ProgressLog):boolean {
  return log.metricType!=='statusChange' && !!log.thoughts?.trim();
}
export function matchesLorebookReflectionFilter(log:ProgressLog,filter:LorebookReviewFilter):boolean {
  if(filter==='all')return true;
  if(log.metricType==='statusChange')return false;
  return filter==='has-journal'?isJournalWritten(log):!isJournalWritten(log);
}
export function lorebookReviewProgress(logs:ProgressLog[]):{total:number;journals:number;enjoyment:number;impact:number;moodlets:number} {
  const entries=logs.filter(l=>l.metricType!=='statusChange');
  return {total:entries.length,journals:entries.filter(isJournalWritten).length,
    enjoyment:entries.filter(l=>l.sessionEnjoyment!=null).length,
    impact:entries.filter(l=>l.sessionImpact!=null).length,
    moodlets:entries.filter(l=>readMoodlets(l.moodlets).length>0).length};
}

/**
 * A Lorebook card can represent multiple saved logs. Show the highest explicit
 * rating with a "peak" marker for merged sessions, never pretend that it was
 * a shared rating or that an unrated log was rated 0.
 */
export function lorebookSessionRatings(logs:ProgressLog[]):{
  enjoyment:{value:number;ratedLogs:number}|null;
  impact:{value:number;ratedLogs:number}|null;
} {
  const rating=(key:'sessionEnjoyment'|'sessionImpact')=>{
    const values=logs.map(log=>log[key]).filter((v):v is number=>typeof v==='number' && v>=1 && v<=5);
    return values.length?{value:Math.max(...values),ratedLogs:values.length}:null;
  };
  return {enjoyment:rating('sessionEnjoyment'),impact:rating('sessionImpact')};
}

export function lorebookDraftFromLog(log:ProgressLog):LorebookLogDraft {
  const time=parseISO(log.timestamp);
  return {
    notes:log.note||'',thoughts:log.thoughts||'',
    enjoyment:log.sessionEnjoyment??null,
    impact:log.sessionImpact??null,
    moodlets:readMoodlets(log.moodlets),
    location:log.location||'',
    delta:String(log.delta),
    date:format(time,'yyyy-MM-dd'),
    time:format(time,'HH:mm'),
  };
}
/** Only update explicitly changed fields. In particular a reflection-only
 * edit must never rewrite precision timestamps, progress or physical location.
 */
export function lorebookDraftChanges(log:ProgressLog,draft:LorebookLogDraft):Partial<ProgressLog> {
  const patch:Partial<ProgressLog>={};
  const note=draft.notes.trim(), thoughts=draft.thoughts.trim(), location=draft.location.trim();
  if(note.length>4000) throw new Error('Notes must be 4,000 characters or fewer.');
  if(thoughts.length>6000) throw new Error('Journal Thoughts must be 6,000 characters or fewer.');
  if(note!==(log.note||'').trim())patch.note=note;
  if(thoughts!==(log.thoughts||'').trim())patch.thoughts=thoughts;
  if(location!==(log.location||'').trim())patch.location=location;
  if(draft.enjoyment!==(log.sessionEnjoyment??null))patch.sessionEnjoyment=draft.enjoyment;
  if(draft.impact!==(log.sessionImpact??null))patch.sessionImpact=draft.impact;
  const previous=readMoodlets(log.moodlets);
  if([...previous].sort().join('|')!==[...draft.moodlets].sort().join('|'))patch.moodlets=draft.moodlets;
  const delta=Number(draft.delta);
  if(!draft.delta.trim() || !Number.isFinite(delta))throw new Error('Progress must be a valid number.');
  if(delta!==log.delta)patch.delta=delta;
  if(draft.date.length!==10||!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)||
     !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time))throw new Error('Choose a valid date and time.');
  if(draft.date!==format(parseISO(log.timestamp),'yyyy-MM-dd')||
     draft.time!==format(parseISO(log.timestamp),'HH:mm')) {
    const parsed=new Date(draft.date+'T'+draft.time+':00');
    if(Number.isNaN(parsed.getTime())||
       format(parsed,'yyyy-MM-dd')!==draft.date||
       format(parsed,'HH:mm')!==draft.time)throw new Error('Choose a valid date and time.');
    patch.timestamp=parsed.toISOString();
  }
  return patch;
}
export function isLorebookDraftDirty(log:ProgressLog,draft:LorebookLogDraft):boolean {
  try{return Object.keys(lorebookDraftChanges(log,draft)).length>0;}
  catch{return true;}
}
