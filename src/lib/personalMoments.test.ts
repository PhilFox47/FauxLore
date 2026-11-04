import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProgressLog, MediaItem } from '../types/schema';
import { selectPersonalMoments, phaseJournalHighlights } from './personalMoments';
import { buildWrappedEvidence } from './wrappedEvidence';

const media: MediaItem[] = [
  {id:'ffxiv',title:'Final Fantasy XIV: Endwalker',mediaType:'Game',status:'Completed',
    genres:[],tags:[],tropes:[],createdAt:'2026-01-01',updatedAt:'2026-11-01'},
  ...Array.from({length:28},(_,i):MediaItem=>({
    id:'filler-'+i,title:'Routine Title '+i,mediaType:'Game',status:'Active',
    genres:[],tags:[],tropes:[],createdAt:'2026-01-01',updatedAt:'2026-11-01',
  })),
];
const log=(id:string,mediaId:string,date:string,note:string,patch:Partial<ProgressLog>={}):ProgressLog=>({
  id,mediaId,timestamp:date+'T17:00:00.000Z',metricType:'playtimeHours',delta:2,note,...patch,
});

const routineLogs:ProgressLog[]=Array.from({length:160},(_,i)=>{
  const day=String(1+(i%25)).padStart(2,'0');
  return log('routine-'+i,'filler-'+(i%28),'2026-09-'+day,
    'Chapter '+i+' completed. Nothing particularly unusual in this ordinary session.');
});
const returning=log('return','ffxiv','2026-09-20',
  'Fuck, that was a long session. I basically played FFXIV for the full Sunday and loved it. Leo went back online. Like the good old times!',
  {sessionEnjoyment:4,sessionImpact:4,moodlets:['social']});
const finishing=log('ending','ffxiv','2026-09-27',
  'Finished the Endwalker MSQ. In Discord with the entire guild. What an amazing experience, finally ending this journey with all the people I met in real life. Truly a core memory.',
  {sessionEnjoyment:5,sessionImpact:5,moodlets:['social','moving'],delta:7.7});
const logs=[...routineLogs,returning,finishing];

test('September before moving a firsthand memory out of Notes: the last two sessions beat the first 20 routine notes',()=>{
  const picks=selectPersonalMoments(logs,{journalLimit:12,noteLimit:20,perMedia:4});
  assert.equal(picks[0].log.id,'ending');
  assert.ok(picks.some(m=>m.log.id==='return'));
  const data=buildWrappedEvidence({timeframe:'month',timeId:'2026-09',logs,history:logs,media});
  const endingCard=data.facts.find(f=>f.id==='reference-ending');
  const returnCard=data.facts.find(f=>f.id==='reference-return');
  assert.ok(endingCard);
  assert.ok(returnCard);
  assert.ok(data.facts.indexOf(endingCard!) < data.facts.findIndex(f=>f.id==='overview'));
  assert.match(endingCard!.evidence,/entire guild|core memory/);
  assert.match(endingCard!.evidence,/Impact 5\/5/);
  assert.ok(!data.facts.some(f=>f.id==='journal-ending'), 'Notes must not be falsely relabeled as Journal Thoughts');
  assert.equal(data.facts.length<=90,true);
});

test('September after moving text to Journal Thoughts: the core memory reaches the writer as first-class journal evidence',()=>{
  const edited:ProgressLog[]=logs.map(l=>l.id==='ending'
    ? {...l,thoughts:l.note,note:''}
    : {...l});
  const data=buildWrappedEvidence({timeframe:'month',timeId:'2026-09',logs:edited,history:edited,media});
  const journal=data.facts.find(f=>f.id==='journal-ending');
  assert.ok(journal,'Late-month final MSQ journal must be selected even with 160 earlier notes');
  assert.match(journal!.quote||'',/entire guild|core memory/);
  assert.ok(data.facts.indexOf(journal!)<data.facts.findIndex(f=>f.id==='overview'));
  const phase=data.monthlyCoverage?.clusters.find(p=>p.phase==='late');
  assert.ok(phase?.journalHighlights.some(h=>h.quote.includes('core memory')));
  const resonance=data.facts.find(f=>f.id==='session-resonance-ffxiv');
  assert.match(resonance?.evidence||'',/5\/5/);
  assert.match(resonance?.evidence||'',/Moving|Social/);
});

test('high-impact diary wins over long bland notes but other media still receive representation',()=>{
  const moments=selectPersonalMoments(logs.concat(log('a','filler-2','2026-09-28',
    'A personal revelation about this completely different story! The ending made me rethink all of the characters.',
    {sessionImpact:5,thoughts:'I changed my mind about the characters after the ending.'})),
    {journalLimit:3,noteLimit:5,perMedia:2});
  assert.ok(moments.some(m=>m.log.mediaId==='ffxiv'));
  assert.ok(moments.some(m=>m.log.mediaId==='filler-2'));
  assert.equal(moments.filter(m=>m.log.mediaId==='ffxiv').length<=2,true);
  assert.equal(phaseJournalHighlights(logs,2).length,0,'No typed journals in original legacy notes');
});
