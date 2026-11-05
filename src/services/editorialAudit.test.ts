import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITORIAL_AUDIT_PRINCIPLES,
  buildRecapEditorialAuditRequest,buildWrappedEditorialAuditRequest,
  reviewRecapEditorial,reviewWrappedEditorial,
} from './editorialAudit';
import type { WrappedEvidence } from '../lib/wrappedEvidence';
import type { StructuredRecap } from './recapAi';

const evidence:WrappedEvidence={
  timeframe:'month',timeId:'2026-10',bounds:{start:'2026-10-01',end:'2026-10-31'},
  editorialCalibration:'Multiple works are ordinary baseline.',
  editorialSalience:'Jackbox played at Halloween with friends. Another session with guildmates.',
  media:[],
  facts:[
    {id:'jackbox',kind:'journal',title:'Jackbox night',mediaId:'jackbox',
      quote:'Played Jackbox at a Halloween gathering with friends',
      evidence:'On Halloween played Jackbox with friends; another session with a guild.'},
    {id:'truck',kind:'insight',title:'ETS2',mediaId:'truck',
      evidence:'ETS2 sessions used to unwind.'},
  ],
};
const design={layout:'editorial',palette:'violet',visual:'auto',align:'left',mediaIds:[]};
const draft={title:'Your metrics differ',dek:'Some sessions have more impact than others.',scenes:[
  {kind:'opening',editorialJob:'hook',title:'Ratings differ',body:'I can count your tags and ratings.',evidenceIds:[],design},
  {kind:'insight',editorialJob:'verdict',title:'Everyone gets scores',
    body:'Jackbox got a score and you marked it Funny and Social.',
    thesis:'There was a difference in session impact.',evidenceIds:['jackbox'],design},
  {kind:'closing',editorialJob:'payoff',title:'The needle',body:'The data needle moved and the score changed.',
    evidenceIds:['jackbox'],design,finaleMode:'dungeon-verdict',
    finalePayoff:'I have counted all your session ratings and found a big difference in measured significance.'},
]};
const recap:StructuredRecap={
  title:'Scores',dek:'A report',chapters:[{heading:'Jackbox',body:'You marked the activity as Funny and Social.'}],
  pullQuote:'',awards:[],captions:{},lookAhead:{watchFor:'',challenge:''},theme:'',mood:'',roast:'',
  summary:'You marked the activity as Funny and Social.',
};

test('Wrapped editorial review is model judged, includes source evidence and explicitly attacks raw-data regurgitation',()=>{
  const req=buildWrappedEditorialAuditRequest({draft,evidence,persona:'dungeon-system'});
  assert.match(req.system,/INVISIBLE RESEARCH|invisible research/i);
  assert.match(req.system,/merciless|vicious|haughty/i);
  assert.match(req.system,/NEW idea|provocative new opinion/i);
  assert.match(req.user,/Jackbox night/);
  assert.match(req.user,/Multiple works are ordinary baseline/);
  assert.match(req.user,/I can count your tags and ratings/);
  assert.match(EDITORIAL_AUDIT_PRINCIPLES,/No simple word banlists/);
  assert.match(req.system,/imagined motives|imaginary motives/i);
  assert.match(req.system,/childhood/i);
  assert.match(req.system,/not.*courtroom|NOT a report|NOT an audit|not sworn testimony/i);
});

test('Deep Dive editor considers the full original source and may replace the entire perspective',()=>{
  const req=buildRecapEditorialAuditRequest({
    draft:recap,context:'Journal Thought: I loved playing with Leo',
    timeframe:'month',intervalLabel:'October 2026',persona:'dungeon-system',
  });
  assert.match(req.system,/NOT the writer/);
  assert.match(req.user,/Journal Thought: I loved playing with Leo/);
  assert.match(req.user,/You marked the activity as Funny and Social/);
  assert.match(req.system,/childhood memories|childhood histories|childhood episodes/i);
  assert.match(req.system,/No protective caveats/);
});

test('a second API call returns the independent AI editorial rewrite for Wrapped and Deep Dive',async()=>{
  const fetchOld=globalThis.fetch;
  const storageOld=(globalThis as any).localStorage;
  const calls:any[]=[];
  const rewritten={...draft,title:'Jackbox: The Social Autopsy',scenes:[
    {...draft.scenes[0],title:'A social autopsy',body:'You keep calling this entertainment. How adorable.'},
    {...draft.scenes[1],title:'A carefully orchestrated humiliation',
      thesis:'Jackbox is not a party game but a permitted way to find out which friends are incompetent under a timer.',
      body:'You did not invite friends to play. You invited them to make fools of themselves under a stopwatch. Very efficient.'},
    {...draft.scenes[2],title:'My verdict is considerably worse than yours',
      body:'Somewhere in the laughter, a friendship survived a room full of extraordinarily bad answers.'},
  ]};
  try{
    (globalThis as any).localStorage={getItem:()=>null};
    globalThis.fetch=(async(url:any,init:any)=>{
      assert.equal(url,'/api/nano-gpt/chat/completions');
      calls.push(JSON.parse(init.body));
      const story=calls.length===1?{story:rewritten,editorialAssessment:'Ratings are a waste of prose'}:
        {recap:{...recap,title:'A friend-shaped disaster',
          chapters:[{heading:'A socially acceptable trial',body:'Jackbox is a legal experiment in public incompetence.'}]},
          editorialAssessment:'No more recap of logged tags'};
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(story)}}]}),{
        status:200,headers:{'Content-Type':'application/json'},
      });
    }) as typeof fetch;
    const wrapped=await reviewWrappedEditorial({apiKey:'test',model:'test-model',draft,evidence,persona:'dungeon-system'});
    assert.equal(wrapped.title,'Jackbox: The Social Autopsy');
    assert.match(wrapped.scenes[1].body,/stopwatch/);
    const deep=await reviewRecapEditorial({apiKey:'test',model:'test-model',draft:recap,context:'Jackbox and Leo',
      timeframe:'month',intervalLabel:'October 2026',persona:'dungeon-system'});
    assert.equal(deep.title,'A friend-shaped disaster');
    assert.equal(calls.length,2);
    assert.ok(calls.every(c=>c.messages.length===2));
  }finally{
    globalThis.fetch=fetchOld;
    if(storageOld===undefined)delete (globalThis as any).localStorage;
    else (globalThis as any).localStorage=storageOld;
  }
});
