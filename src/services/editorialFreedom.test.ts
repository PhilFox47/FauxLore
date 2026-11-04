import test from 'node:test';
import assert from 'node:assert/strict';
import { getPersonaDescription, getPersonaEditorialFreedom } from '../lib/personas';
import { generateAiWrapped } from './wrappedAi';
import { generateStructuredRecap, planRecapEditorial } from './recapAi';
import { selectWrappedEditorialMemory } from '../lib/wrappedEditorialMemory';
import type { WrappedEvidence } from '../lib/wrappedEvidence';

const evidence:WrappedEvidence={
  timeframe:'month',timeId:'2026-09',bounds:{start:'2026-09-01',end:'2026-09-30'},
  facts:[{id:'journal-ffxiv',kind:'journal',title:'Personal memory',mediaId:'ffxiv',
    evidence:'On September 27 the user completed the Endwalker MSQ with the whole FC and called it a core memory.',
    quote:'Completed the MSQ with the whole FC; a core memory.'},
    {id:'resonance-ffxiv',kind:'insight',title:'Session impact',mediaId:'ffxiv',
      evidence:'Impact 5, Moving, Social'}],
  media:[],editorialSalience:'Moving at impact 5',editorialCalibration:'Media switching is normal.',
};
const history=selectWrappedEditorialMemory([{
  timeframe:'month',timeId:'2026-08',
  story:JSON.stringify({
    title:'An earlier verdict',
    scenes:[
      {kind:'opening',title:'Start'},
      {kind:'insight',title:'Old MMO thesis',
        editorialThesis:'The game became a ritual of returning to a familiar place rather than a personal adventure.',
        media:{id:'ffxiv',title:'Final Fantasy XIV'}},
      {kind:'closing',title:'Old ending',finalePayoff:'A vaguely condescending ending',finaleMode:'dungeon-verdict'},
    ],
  }),
}],{timeframe:'month',timeId:'2026-09'},['ffxiv']);

async function captureFailingRequest(run:()=>Promise<unknown>):Promise<{
  system:string;user:string;
}> {
  const originalFetch=globalThis.fetch;
  const storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  let request:any;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}});
  globalThis.fetch=(async(_url:any,options:any)=>{
    request=JSON.parse(String(options.body));
    return new Response(JSON.stringify({error:'test interrupt'}),{
      status:503,headers:{'Content-Type':'application/json'},
    });
  }) as typeof fetch;
  try{
    await assert.rejects(run);
  }finally{
    globalThis.fetch=originalFetch;
    if(storage)Object.defineProperty(globalThis,'localStorage',storage);
    else delete (globalThis as any).localStorage;
  }
  assert.ok(request,'AI call should have been attempted');
  assert.ok(Array.isArray(request.messages));
  return {system:request.messages[0].content,user:request.messages[1].content};
}

test('Dungeon System AI openly owns bad takes but real events still require receipts',()=>{
  const persona=getPersonaDescription('dungeon-system');
  const directive=getPersonaEditorialFreedom('dungeon-system');
  assert.match(persona,/opinions and your ridiculous THEORIES have no leash/);
  assert.match(directive,/wild, knowingly unfair THEORIES/);
  assert.match(directive,/No constant/);
  assert.match(directive,/Never present a fictional or hypothetical EVENT/);
  assert.match(directive,/not personal vulnerability/i);
  assert.doesNotMatch(getPersonaEditorialFreedom('witty'),/OWNER of the courtroom/);
});

test('Wrapped Director receives the period-bounded memory AND the actual irreverent Dungeon persona',async()=>{
  const p=await captureFailingRequest(()=>generateAiWrapped({
    apiKey:'test',model:'test-model',persona:'dungeon-system',
    evidence,media:[],editorialMemory:history,
  }));
  assert.match(p.system,/DUNGEON SYSTEM AI EDITORIAL LICENSE/);
  assert.match(p.system,/not a polite historian/);
  assert.match(p.system,/old verdict|past bad judgment|PRIOR WRAPPED/i);
  assert.match(p.user,/PRIOR WRAPPED EDITORIAL MEMORY/);
  assert.match(p.user,/An earlier verdict/);
  assert.match(p.user,/The game became a ritual/);
  assert.match(p.user,/not factual logs|NOT factual logs/i);
  assert.match(p.user,/VERIFIED EVIDENCE CARDS/);
  assert.match(p.user,/core memory/);
});

test('Deep Dive editorial planning and prose both receive the selected Dungeon license',async()=>{
  const plan=await captureFailingRequest(()=>planRecapEditorial({
    apiKey:'test',model:'test-model',persona:'dungeon-system',
    timeframe:'month',intervalLabel:'September 2026',
    context:'The player completed Endwalker with the FC.',
  }));
  assert.match(plan.system,/DUNGEON SYSTEM AI EDITORIAL LICENSE/);
  const writer=await captureFailingRequest(()=>generateStructuredRecap({
    apiKey:'test',model:'test-model',persona:'dungeon-system',
    timeframe:'month',intervalLabel:'September 2026',
    context:'The player completed Endwalker with the FC.',
  }));
  assert.match(writer.system,/DUNGEON SYSTEM AI EDITORIAL LICENSE/);
  assert.match(writer.system,/No obligatory/);
  const defaultVoice=await captureFailingRequest(()=>planRecapEditorial({
    apiKey:'test',model:'test-model',persona:'witty',
    timeframe:'month',intervalLabel:'September 2026',context:'A logged evening.',
  }));
  assert.doesNotMatch(defaultVoice.system,/OWNER of the courtroom/);
});
