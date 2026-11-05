import test from 'node:test';
import assert from 'node:assert/strict';
import { curateWrappedTheses, evaluateWrappedThesis } from './wrappedThesisGate';
import { normalizeWrappedStory } from '../services/wrappedAi';
import type { WrappedEvidence } from './wrappedEvidence';
import type { MediaItem } from '../types/schema';

const evidence:WrappedEvidence={
  timeframe:'week',timeId:'2026-W39',bounds:{start:'2026-09-21',end:'2026-09-27'},
  editorialCalibration:'',editorialSalience:'',media:[],
  facts:[{id:'overview',kind:'rhythm',title:'Overview',evidence:'160 logs'},
    {id:'journal-msq',kind:'journal',title:'Endwalker reflection',mediaId:'ffxiv',
      quote:'A core memory with the FC',evidence:'A core memory with the FC'}],
};
const media:MediaItem[]=[{
  id:'ffxiv',title:'Final Fantasy XIV',mediaType:'Game',status:'Completed',
  genres:[],tags:[],tropes:[],createdAt:'2026-01-01',updatedAt:'2026-11-01',
}];
const design={layout:'editorial',palette:'cobalt',visual:'auto',align:'left',mediaIds:[]};
const scene=(thesis:string,body:string,ids:string[]=['overview'])=>({
  kind:'insight',editorialJob:'verdict',title:'An opinion',thesis,body,evidenceIds:ids,design,
});

test('semantic value cannot be determined by lexical filter: both dull and daring theses remain structurally eligible',()=>{
  const facts=new Map(evidence.facts.map(f=>[f.id,f]));
  assert.equal(evaluateWrappedThesis(scene('There were various titles this month.',
    'The player logged many works in September.'),facts).acceptable,true);
  assert.equal(evaluateWrappedThesis(scene('The entire Free Company converted a fictional ending into a ritual of real friendship.',
    'The real spectacle was the group of friends who gave a fictional story a collective ending.',
    ['journal-msq']),facts).acceptable,true);
  assert.equal(evaluateWrappedThesis(scene('','Missing thesis'),facts).acceptable,false);
  assert.equal(evaluateWrappedThesis(scene('A theory','A thought',['invented']),facts).acceptable,false);
});

test('a validated AI editorial draft is not rewritten, silently shortened or rejected based on vocabulary',()=>{
  const original={title:'Provocations',dek:'Surprising interpretations',scenes:[
    {kind:'opening',title:'Opening',body:'Welcome to the nonsense.',evidenceIds:[],design},
    scene('Even this month was a mixed assortment of media.','Maybe this angle is trite.'),
    scene('A real shared ending became something bigger than the game.','That is a genuine claim.',['journal-msq']),
    {kind:'closing',title:'Final word',body:'Even a fictional world can force real people into an awkward shared triumph.',
      evidenceIds:['journal-msq'],design,finaleMode:'dungeon-verdict',
      finalePayoff:'My verdict is that the collective ritual made the game finale matter beyond what the plot itself could offer.'},
  ]};
  const result=curateWrappedTheses(original,evidence);
  assert.deepEqual(result.draft,original);
  assert.deepEqual(result.cut,[]);
  const normalized=normalizeWrappedStory(result.draft,evidence,media);
  assert.equal(normalized.scenes.length,4);
});

test('invalid citations cannot pass even if the prose is brilliant',()=>{
  const original={title:'Something',dek:'Something',scenes:[
    {kind:'opening',title:'Opening',body:'Welcome.',evidenceIds:[],design},
    scene('A clever and fearsome claim','An elaborate interpretation',['not-a-card']),
    {kind:'closing',title:'End',body:'The end.',evidenceIds:[],design},
  ]};
  assert.throws(()=>curateWrappedTheses(original,evidence),/Invalid evidence or structure/);
});
