import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wrappedPeriodRange, selectWrappedEditorialMemory,
  wrappedEditorialMemoryBrief, recycledWrappedThesis,
} from './wrappedEditorialMemory';
import type { SavedEditorialRow } from './wrappedEditorialMemory';

const asRow = (
  timeframe:'week'|'month'|'year',timeId:string,
  title:string,mediaId='ffxiv',
  thesis='A fictional ending became an unexpectedly real friendship ritual through a long group session.',
  finale='No, I will never admit that a video game was the most touching moment of the month.',
):SavedEditorialRow=>({
  timeframe,timeId,story:JSON.stringify({
    version:2,title,scenes:[
      {kind:'opening',title:'Welcome',body:'Issue opening.'},
      {kind:'insight',title:'A particular verdict',editorialThesis:thesis,
        body:'The AI formed a dubious theory about this recorded behavior.',
        media:{id:mediaId,title:'Final Fantasy XIV'}},
      {kind:'closing',title:'Judge and jury',finalePayoff:finale,
        finaleMode:'dungeon-verdict',body:finale},
    ],
  }),
});

test('history for September excludes overlapping, later and future-dated calendar periods despite persistence dates',()=>{
  const rows=[
    asRow('month','2026-08','August revisit'),
    asRow('week','2026-W35','Week ending August 30'),
    asRow('week','2026-W36','Week crossing into September'),
    asRow('month','2026-09','Old September rerun'),
    asRow('month','2026-10','October future'),
    asRow('year','2026','Annual retrospective overlaps'),
    asRow('month','2026-06','Older June'),
  ];
  const result=selectWrappedEditorialMemory(rows,{timeframe:'month',timeId:'2026-09'},['ffxiv']);
  const ids=result.map(m=>m.timeframe+':'+m.timeId);
  assert.ok(ids.includes('month:2026-08'));
  assert.ok(ids.includes('week:2026-W35'));
  assert.ok(ids.includes('month:2026-09'),'same-period old rerun is editorial only');
  assert.ok(!ids.includes('week:2026-W36'),'week overlapping September must be excluded');
  assert.ok(!ids.includes('month:2026-10'));
  assert.ok(!ids.includes('year:2026'));
  assert.equal(result.find(m=>m.timeId==='2026-09')?.samePeriodRerun,true);
  const brief=wrappedEditorialMemoryBrief(result);
  assert.match(brief,/OLD opinions|prior published AI interpretations/i);
  assert.match(brief,/NOT factual logs/);
  assert.doesNotMatch(brief,/October future|Annual retrospective/);
});

test('ISO week boundaries handle New Year correctly',()=>{
  assert.deepEqual(wrappedPeriodRange('week','2020-W53'),{
    start:'2020-12-28',end:'2021-01-03',
  });
  assert.deepEqual(wrappedPeriodRange('week','2026-W53'),{
    start:'2026-12-28',end:'2027-01-03',
  });
  assert.equal(wrappedPeriodRange('week','2025-W53'),null);
  assert.deepEqual(wrappedPeriodRange('week','2026-W01'),{
    start:'2025-12-29',end:'2026-01-04',
  });
  const rows=[asRow('year','2025','Last year'),asRow('month','2025-12','December'),
    asRow('month','2025-11','November')];
  assert.deepEqual(selectWrappedEditorialMemory(rows,{timeframe:'week',timeId:'2026-W01'})
    .map(m=>m.timeId),['2025-11']);
});

test('older same-media takes are prioritized over recent unrelated editorials',()=>{
  const rows=[
    asRow('month','2026-08','Recent routine','other-media','The traveler never leaves the hotel room in thought.'),
    asRow('month','2026-07','Earlier FFXIV','ffxiv'),
    asRow('month','2026-06','Older game','game-id'),
  ];
  const items=selectWrappedEditorialMemory(rows,{timeframe:'month',timeId:'2026-09'},['ffxiv'],2);
  assert.equal(items[0].timeId,'2026-07');
  assert.equal(items[1].timeId,'2026-08');
  assert.ok(items[0].takes[0].mediaIds.includes('ffxiv'));
  assert.equal(selectWrappedEditorialMemory([], {timeframe:'month',timeId:'2026-09'}).length,0);
});

test('a saved old story without thesis metadata is reference context but cannot trigger false repeat rejection',()=>{
  const old:SavedEditorialRow={
    timeframe:'month',timeId:'2026-03',
    story:JSON.stringify({title:'March',scenes:[
      {kind:'opening',body:'intro'},
      {kind:'spotlight',title:'Comics',body:'The serialized comic kept appearing beside the daily commute.'},
      {kind:'closing',body:'March ended.'},
    ]}),
  };
  const memory=selectWrappedEditorialMemory([old],{timeframe:'month',timeId:'2026-09'});
  assert.equal(memory[0].takes[0].explicit,false);
  assert.match(memory[0].fullStory || '', /The serialized comic kept appearing beside the daily commute/);
  assert.equal(recycledWrappedThesis([{thesis:''},{
    thesis:'The serialized comic kept appearing beside the daily commute.',
  },{thesis:''}],memory),null);
});

test('exact prior editorial thesis is not repeated, but new evidence may support a new contradictory take',()=>{
  const memory=selectWrappedEditorialMemory([asRow('month','2026-07','Earlier FFXIV')],
    {timeframe:'month',timeId:'2026-09'},['ffxiv']);
  const same=memory[0].takes[0].thesis;
  assert.ok(recycledWrappedThesis([
    {thesis:''},{thesis:same},{thesis:''},
  ],memory));
  assert.equal(recycledWrappedThesis([
    {thesis:''},
    {thesis:'The free company gathering changed this month from a story of routine progress into an improbable real-life reunion.'},
    {thesis:''},
  ],memory),null);
});

test('no stored Wrappeds, malformed rows and unrelated periods fail closed without fabricating memory',()=>{
  const result=selectWrappedEditorialMemory([
    {timeframe:'month',timeId:'2026-02',story:'{broken'},
    asRow('month','2026-10','Future'),
    {timeframe:'week',timeId:'fake',story:'{}'},
  ],{timeframe:'month',timeId:'2026-09'},[],10);
  assert.deepEqual(result,[]);
  assert.match(wrappedEditorialMemoryBrief([]),/No earlier Saved Wrapped/);
});
