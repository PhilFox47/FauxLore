import test from 'node:test';
import assert from 'node:assert/strict';
import { wrappedPacingBudget, wrappedProseTier } from './wrappedPacing';
import { normalizeWrappedStory } from '../services/wrappedAi';
import type { WrappedEvidence, WrappedFact } from './wrappedEvidence';
const base=(facts:WrappedFact[],timeframe:'week'|'month'|'year'='month'):WrappedEvidence=>({
  timeframe,timeId:timeframe==='month'?'2026-09':timeframe==='week'?'2026-W39':'2026',
  facts,media:[],bounds:{start:'2026-09-01',end:'2026-09-30'},
  editorialCalibration:'',editorialSalience:'',
});
const design={layout:'editorial',palette:'cobalt',visual:'auto',align:'left',mediaIds:[]};
const starter={kind:'opening',title:'A week that made a point',body:'A particular moment begins an unexpected argument.',evidenceIds:[],design};
const finisher={kind:'closing',title:'A fierce last word',body:'The AI delivers its own ruthless final judgment.',evidenceIds:[],design};

test('one meaningful journal across 150 bland records gets a short story budget, not a quota',()=>{
  const busy:WrappedFact[]=Array.from({length:150},(_,i)=>({
    id:'media-'+i,kind:'spotlight',title:'Routine '+i,evidence:'20 MP',mediaId:'book-'+i,
  }));
  const thin=base(busy);
  const one=base([...busy,{id:'journal-last',kind:'journal',title:'The real moment',
    mediaId:'ffxiv',quote:'An unforgettable night with our guild.',
    evidence:'An unforgettable night with our guild.'}]);
  assert.equal(wrappedPacingBudget(thin).suggestedMax,3);
  assert.equal(wrappedPacingBudget(one).suggestedMax,3);
  assert.equal(wrappedPacingBudget(one).deepMoments,1);
});

test('diverse firsthand experiences justify more scenes; repeated pages or same-media notes cannot inflate infinitely',()=>{
  const notes:WrappedFact[]=Array.from({length:25},(_,i)=>({
    id:'reference-'+i,kind:'insight',title:'Experience '+i,mediaId:'ffxiv',
    evidence:'A specific firsthand account '+i,
  }));
  const separate:WrappedFact[]=Array.from({length:12},(_,i)=>({
    id:'journal-'+i,kind:'journal',title:'Different work '+i,mediaId:'media-'+i,
    quote:'A particular important moment',evidence:'A personal experience '+i,
  }));
  const repeated=wrappedPacingBudget(base(notes));
  const rich=wrappedPacingBudget(base([...notes,...separate]));
  assert.ok(repeated.suggestedMax<=5);
  assert.ok(rich.suggestedMax>repeated.suggestedMax);
  assert.ok(rich.suggestedMax<=9);
  assert.ok(wrappedPacingBudget(base([...notes,...separate],'week')).suggestedMax<=6);
  assert.ok(wrappedPacingBudget(base([...notes,...separate],'year')).suggestedMax<=14);
});

test('one cross-phase argument can cover a genuinely lean month without a second filler scene',()=>{
  const data:WrappedEvidence={...base([
    {id:'month-early',kind:'insight',title:'Early',evidence:'Early phase: 30% of progress',phase:'early'},
    {id:'month-middle',kind:'insight',title:'Middle',evidence:'Middle phase: 40% of progress',phase:'middle'},
    {id:'month-late',kind:'insight',title:'Late',evidence:'Late phase: 30% of progress',phase:'late'},
  ]),monthlyCoverage:{
    requiredPhases:['early','middle','late'],lastWeekShare:0.2,minPhaseScenes:2,
  }};
  const one={
    kind:'insight',title:'The long argument across three phases',
    body:'A change across all three periods was the single genuinely interesting development. The early, middle and late facts jointly support the thesis.',
    evidenceIds:['month-early','month-middle','month-late'],design,
  };
  const result=normalizeWrappedStory({title:'Short but earned',dek:'Three chapters, one idea',
    scenes:[starter,one,finisher]},data,[]);
  assert.equal(result.scenes.length,3);
  assert.equal(result.scenes[1].evidenceIds.length,3);
  // Volume-only early/middle phases must not force an extra fake angle.
  const lateOnly=normalizeWrappedStory({title:'Just the one important late detail',dek:'One honest thesis',
    scenes:[starter,{...one,evidenceIds:['month-late']},finisher]},data,[]);
  assert.equal(lateOnly.scenes.length,3);
});

test('prose length is content-responsive, not forced to one uniform word count',()=>{
  assert.equal(wrappedProseTier('One crushing verdict. None of you passed.'),'punchline');
  assert.equal(wrappedProseTier(Array.from({length:60},()=> 'specific').join(' ')),'standard');
  assert.equal(wrappedProseTier(Array.from({length:135},()=> 'specific').join(' ')),'substantial');
});


test('one extraordinary late personal memory survives a month of routine early/middle progress without manufactured filler',()=>{
  const data:WrappedEvidence={...base([
    {id:'month-early',kind:'insight',phase:'early',title:'Early progress',evidence:'Early 40% of routine pages'},
    {id:'month-middle',kind:'insight',phase:'middle',title:'Middle progress',evidence:'Middle 35% of routine pages'},
    {id:'journal-finale',kind:'journal',phase:'late',title:'Endwalker finale with Free Company',
      mediaId:'ffxiv',quote:'Finished the MSQ in Discord with my whole Free Company; a core memory.',
      evidence:'On September 27: Finished Endwalker with the entire FC; a core memory.'},
  ]),monthlyCoverage:{
    requiredPhases:['early','middle','late'],lastWeekShare:0.25,minPhaseScenes:2,
  }};
  const title='A night that mattered more than three weeks of routine progress';
  const middle={kind:'insight',editorialJob:'verdict',title,
    body:'September had many routine progress entries, but its lasting moment was the shared Endwalker MSQ ending with the Free Company, explicitly called a core memory.',
    evidenceIds:['journal-finale'],design};
  const wrapped=normalizeWrappedStory({title:'One remarkable night',dek:'A month worth one proper argument',
    scenes:[starter,middle,{...finisher,evidenceIds:['journal-finale']}]},data,[]);
  assert.equal(wrapped.scenes.length,3);
  assert.deepEqual(wrapped.scenes[1].evidenceIds,['journal-finale']);
});


test('a lean story with a real personal memory can survive editorial omissions without a phase quota',()=>{
  const data:WrappedEvidence={...base([
    {id:'journal-early',kind:'journal',phase:'early',title:'Early friendship',
      mediaId:'friends',quote:'A day with people I care about.',evidence:'On Sep 4 we met in Discord for a shared celebration.'},
    {id:'journal-late',kind:'journal',phase:'late',title:'Later finale',
      mediaId:'ffxiv',quote:'An unforgettable MSQ finale.',evidence:'On Sep 27 the FC finished the MSQ together.'},
  ]),monthlyCoverage:{requiredPhases:['early','late'],lastWeekShare:0.25,minPhaseScenes:2}};
  const onlyLate={kind:'insight',title:'Late finale',body:'The logged Free Company ending was a personal milestone.',
    evidenceIds:['journal-late'],design};
  const issue=normalizeWrappedStory({title:'Selective editorial memory',dek:'A sharp focused take',
    scenes:[starter,onlyLate,finisher]},data,[]);
  assert.equal(issue.scenes.length,3);
  assert.deepEqual(issue.scenes[1].evidenceIds,['journal-late']);
});
