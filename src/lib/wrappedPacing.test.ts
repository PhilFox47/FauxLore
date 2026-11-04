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
  assert.throws(()=>normalizeWrappedStory({title:'Bad',dek:'Late only',
    scenes:[starter,{...one,evidenceIds:['month-late']},finisher]},data,[]),/Monthly coverage missing|Story must find at least two/);
});

test('prose length is content-responsive, not forced to one uniform word count',()=>{
  assert.equal(wrappedProseTier('One crushing verdict. None of you passed.'),'punchline');
  assert.equal(wrappedProseTier(Array.from({length:60},()=> 'specific').join(' ')),'standard');
  assert.equal(wrappedProseTier(Array.from({length:135},()=> 'specific').join(' ')),'substantial');
});
