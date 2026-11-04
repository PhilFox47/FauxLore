import test from 'node:test';
import assert from 'node:assert/strict';
import { curateWrappedTheses, evaluateWrappedThesis } from './wrappedThesisGate';
import { normalizeWrappedStory } from '../services/wrappedAi';
import type { WrappedEvidence } from './wrappedEvidence';
import type { MediaItem } from '../types/schema';

const media:MediaItem[]=[{
  id:'ffxiv',title:'Final Fantasy XIV: Endwalker',mediaType:'Game',status:'Completed',
  genres:[],tags:[],tropes:[],createdAt:'2026-01-01',updatedAt:'2026-11-01',
}];
const evidence:WrappedEvidence={
  timeframe:'week',timeId:'2026-W39',bounds:{start:'2026-09-21',end:'2026-09-27'},
  editorialCalibration:'',editorialSalience:'',media:[],
  facts:[
    {id:'overview',kind:'rhythm',title:'Count',evidence:'160 logs across a month'},
    {id:'media-0',kind:'spotlight',title:'Endwalker',mediaId:'ffxiv',evidence:'7.7 hours logged'},
    {id:'journal-msq',kind:'journal',title:'User journal',mediaId:'ffxiv',
      evidence:'Finished the MSQ together with my entire FC, a core memory',
      quote:'Finished the MSQ together with my entire FC, a core memory'},
    {id:'session-resonance-ffxiv',kind:'insight',title:'Impact signals',mediaId:'ffxiv',
      evidence:'Impact 5/5, Moving and Social'},
  ],
};
const design={layout:'editorial',palette:'cobalt',visual:'auto',align:'left',mediaIds:[]};
const rawScene=(title:string,thesis:string,evidenceIds:string[],body:string)=>({
  kind:'insight',editorialJob:'verdict',title,thesis,body,evidenceIds,design,
});
const strong=rawScene('Not just a game, not just a finale',
  'The Endwalker finale mattered because a group of friends turned a fictional ending into a shared real-life memory.',
  ['journal-msq','session-resonance-ffxiv'],
  'The final MSQ was completed in Discord with the whole Free Company, and was called a core memory. My verdict: a fantasy game somehow became the meeting room for real friendships, which is the best possible abuse of server infrastructure.');

test('unsupported summaries and title-count filler fail; an audacious grounded thesis passes',()=>{
  const idx=new Map(evidence.facts.map(f=>[f.id,f]));
  assert.equal(evaluateWrappedThesis(rawScene('Lots of stuff','There were many media titles in September.',
    ['overview'],'You logged a lot of different works in a busy month.'),idx).acceptable,false);
  assert.equal(evaluateWrappedThesis(rawScene('Numbers','The player logged 7.7 hours of Endwalker.',
    ['media-0'],'It was a session of this duration and a medium worth logging.'),idx).acceptable,false);
  assert.equal(evaluateWrappedThesis({...strong,thesis:''},idx).acceptable,false);
  assert.equal(evaluateWrappedThesis(strong,idx).acceptable,true);
  assert.equal(evaluateWrappedThesis({...strong,evidenceIds:['invented']},idx).acceptable,false);
});

test('cut filler and repeated theses before visual generation; preserve factual anchors and authored points',()=>{
  const raw={title:'The Seven Hours That Mattered',dek:'Not all progress means the same thing.',
    scenes:[
      {kind:'opening',editorialJob:'hook',title:'First the statistics',body:'The counter said one thing. The memory said another.',evidenceIds:[],design},
      rawScene('A big count','September was a mixed month of various media titles.', ['overview'],
        'Several media titles appeared in the activity log during this particular month.'),
      strong,
      rawScene('An identical interpretation',
        'The Endwalker finale mattered because a group of friends turned a fictional ending into a shared real-life memory.',
        ['journal-msq'],'Yet another restatement of the importance of the guild moment, with nothing different to add.'),
      {kind:'closing',editorialJob:'payoff',title:'Your week earned one memory',
        body:'The weird thing about all those hours is how small the number becomes next to an actual memory.',evidenceIds:[],design},
    ]};
  const {draft,cut}=curateWrappedTheses(raw,evidence);
  assert.equal(draft.scenes.length,3,'The shorter 3-slide story is better than padding to five');
  assert.equal(cut.length,2);
  const normalized=normalizeWrappedStory(draft,evidence,media);
  assert.equal(normalized.scenes[1].editorialThesis,strong.thesis);
  assert.deepEqual(normalized.scenes[1].evidenceIds,['journal-msq','session-resonance-ffxiv']);
});

test('editorial gate fails rather than fabricating a stronger slide when no source-backed point exists',()=>{
  const raw={title:'Nothing',dek:'Thin',scenes:[
    {kind:'opening',title:'Start',body:'A month began',evidenceIds:[],design},
    rawScene('Empty','There were many media titles this month.',['overview'],'A list of media was logged during the period.'),
    {kind:'closing',title:'End',body:'The period ended',evidenceIds:[],design},
  ]};
  assert.throws(()=>curateWrappedTheses(raw,evidence),/No distinct, evidence-backed interior slide/);
});
