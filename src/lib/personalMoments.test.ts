import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProgressLog, MediaItem } from '../types/schema';
import { selectPersonalMoments, selectSessionContextNotes, phaseJournalHighlights } from './personalMoments';
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

test('legacy September Notes remain context, not first-class personal opinion or citable editorial source',()=>{
  assert.deepEqual(selectPersonalMoments(logs),[],'Even a long dramatic Note is not a Journal Thought');
  const data=buildWrappedEvidence({timeframe:'month',timeId:'2026-09',logs,history:logs,media});
  assert.ok(!data.facts.some(f=>f.id.startsWith('reference-')),'No organizational Notes may create standalone insight facts');
  assert.ok(!data.facts.some(f=>f.kind==='journal'));
  assert.ok(data.backgroundNotes?.some(n=>n.context.includes('core memory')));
  assert.ok(data.backgroundNotes?.some(n=>n.context.includes('Leo went back online')));
  assert.ok(data.backgroundNotes!.length<=8);
  assert.ok(data.facts.some(f=>f.id==='session-resonance-ffxiv'),'Explicit Impact remains separately important');
});

test('September edited Journal Thoughts become independent qualitative evidence despite 160 routine Notes',()=>{
  const edited:ProgressLog[]=logs.map(l=>l.id==='ending'
    ? {...l,thoughts:l.note,note:''}
    : {...l});
  const moments=selectPersonalMoments(edited);
  assert.equal(moments[0].log.id,'ending');
  const data=buildWrappedEvidence({timeframe:'month',timeId:'2026-09',logs:edited,history:edited,media});
  const journal=data.facts.find(f=>f.id==='journal-ending');
  assert.ok(journal);
  assert.match(journal!.quote||'',/entire guild|core memory/);
  assert.ok(data.facts.indexOf(journal!)<data.facts.findIndex(f=>f.id==='overview'));
  assert.ok(!data.facts.some(f=>f.id.startsWith('reference-')));
  const phase=data.monthlyCoverage?.clusters.find(p=>p.phase==='late');
  assert.ok(phase?.journalHighlights.some(h=>h.quote.includes('core memory')));
  const resonance=data.facts.find(f=>f.id==='session-resonance-ffxiv');
  assert.match(resonance?.evidence||'',/5\/5/);
  assert.match(resonance?.evidence||'',/Moving|Social/);
});

test('comic Porcupine fight and exact issue indexes are organizational bookmarks, not editorial revelations',()=>{
  const comic:ProgressLog[]= [
    log('porcupine','filler-0','2026-09-03','Issue #8: fought Porcupine; issue #9 started.'),
    log('issues','filler-0','2026-09-14','Read issues 10–12, continuing with #13 next week.'),
    log('feelings','ffxiv','2026-09-27','MSQ completed with the FC',
      {thoughts:'Playing through the ending with people I love made the whole evening unforgettable.',
       sessionImpact:5,moodlets:['social','moving']}),
  ];
  const data=buildWrappedEvidence({timeframe:'month',timeId:'2026-09',logs:comic,history:comic,media});
  assert.ok(!data.facts.some(f=>f.evidence.includes('Porcupine')));
  assert.ok(!data.facts.some(f=>f.evidence.includes('issues 10')));
  assert.ok(data.backgroundNotes?.some(n=>n.context.includes('Porcupine')),'If sampled, plot may remain available as background');
  assert.ok(data.facts.some(f=>f.kind==='journal'&&f.evidence.includes('unforgettable')));
  assert.equal(phaseJournalHighlights(comic,2)[0].log.id,'feelings');
});

test('organization notes have small independent quotas and cannot overwhelm Journal Thoughts',()=>{
  const extra:ProgressLog[]=logs.concat(log('other','filler-2','2026-09-28',
    'Read chapter 12 to 15, next up 16',
    {sessionImpact:5,thoughts:'I changed my mind about the characters after the ending.'}));
  const moments=selectPersonalMoments(extra,{journalLimit:3,perMedia:2});
  assert.equal(moments.length,1);
  assert.equal(moments[0].log.id,'other');
  const background=selectSessionContextNotes(extra,{limit:6,perMedia:2,relevantMediaIds:['ffxiv','filler-2']});
  assert.ok(background.length<=6);
  assert.ok(background.filter(n=>n.log.mediaId==='ffxiv').length<=2);
  assert.ok(background.every(n=>n.source==='note'&&n.text.length<=260));
  assert.equal(phaseJournalHighlights(logs,2).length,0);
});
