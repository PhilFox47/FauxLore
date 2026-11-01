 
import test from "node:test";
import assert from "node:assert/strict";
import {
  fingerprint, supportedClaim, gathered, approved, narrowDossier,
  researchPrompt, type State,
} from "./codexV2Plan";

test("V2 evidence does not accept an unrelated search receipt", () => {
  assert.equal(supportedClaim({
    id:"n1",section:"structure",fact:"Alternates multiple chapter viewpoints",
    sourceUrl:"https://made-up.test/article",
  },["https://real.test/article"]),false);
  assert.equal(supportedClaim({
    id:"n1",section:"structure",fact:"Alternates multiple chapter viewpoints",
    sourceUrl:"https://real.test/article?utm_source=search",
  },["https://real.test/article"]),true);
});
test("stage IDs are unique; only explicitly explained errors are removed",()=>{
  const s:State={
    narrative:{output:{claims:[{id:"1",section:"structure",fact:"Short chapters alternate perspectives",
      sourceUrl:"https://example.org/source"}]},sources:["https://example.org/source"]},
    entities:{output:{claims:[{id:"1",section:"characters",name:"Hero",fact:"Introduced in first chapter",
      sourceUrl:"https://example.org/source"}]},sources:["https://example.org/source"]},
  };
  const claims=gathered(s);
  assert.deepEqual(claims.map(c=>c.id),["n_1","e_1"]);
  assert.deepEqual(approved(claims,{rejectedIds:["e_1"],reasons:[{id:"e_1",reason:"This character belongs to the second game."}]}).map(c=>c.id),["n_1"]);
  // Missing approvals and rejection without a reason MUST NOT delete valid data.
  assert.deepEqual(approved(claims,{approvedIds:[],rejectedIds:["e_1"],reasons:[]}).map(c=>c.id),["n_1","e_1"]);
  assert.deepEqual(approved(claims,{approvedIds:[],rejectedIds:[],reasons:[]}).map(c=>c.id),["n_1","e_1"]);
});
test("compiler cannot introduce sequel-only entities or unsupported memories",()=>{
  const data=narrowDossier({
    overview:"A test work",
    characters:[{name:"Hero"},{name:"Sequel Character"}],
    flavorTexts:[{text:"Original confirmed quote",kind:"quote"},{text:"Made up",kind:"joke"}],
    signatureMoments:["A verified opening","An imagined ending"],
  },[
    {id:"e_1",section:"characters",name:"Hero",fact:"The first game's protagonist",sourceUrl:"https://example.org"},
    {id:"a_1",section:"flavorTexts",fact:"Original confirmed quote",sourceUrl:"https://example.org"},
    {id:"n_1",section:"signatureMoments",fact:"A verified opening",sourceUrl:"https://example.org"},
  ]);
  assert.deepEqual(data.characters?.map(c=>c.name),["Hero"]);
  assert.deepEqual(data.flavorTexts?.map(c=>c.text),["Original confirmed quote"]);
  assert.deepEqual(data.signatureMoments,["A verified opening"]);
});
test("subject change invalidates old V2 checkpoints",()=>{
  const s={title:"Mass Effect",mediaType:"Game",year:2007};
  assert.notEqual(fingerprint(s,"gpt-6.1-sol"),fingerprint(s,"gpt-6.1-terra"));
  assert.notEqual(fingerprint(s,"gpt-6.1-sol"),
    fingerprint({...s,year:2008},"gpt-6.1-sol"));
});
test("research prompts inherit exact work boundary and avoid forced new-book memories",()=>{
  const s={title:"Der Nachtzug",mediaType:"Book",creator:"Sebastian Fitzek",year:2026};
  const p=researchPrompt("audience",s,{identity:{output:{title:"Der Nachtzug",excludedWorks:["Other book"]},sources:[]}},[]);
  assert.match(p,/Other book/);
  assert.match(p,/zero-length list/i);
});

test("spoiler-introduction fields are never copied from an unverified compiler guess",()=>{
  const dossier=narrowDossier({
    characters:[
      {name:"Hero",introducedAt:"final mission",introducedPct:95},
      {name:"Ally",introducedAt:"Act 1",introducedPct:0},
    ],
  },[
    {id:"e_1",section:"characters",name:"Hero",fact:"Hero participates in the first chapter",
      sourceUrl:"https://example.org",introducedAt:"first chapter",introducedPct:5},
    {id:"e_2",section:"characters",name:"Ally",fact:"Ally participates in the original game",
      sourceUrl:"https://example.org"},
  ]);
  assert.equal(dossier.characters?.[0]?.introducedAt,"first chapter");
  assert.equal(dossier.characters?.[0]?.introducedPct,5);
  assert.equal(dossier.characters?.[1]?.introducedAt,undefined);
  assert.equal(dossier.characters?.[1]?.introducedPct,undefined);
});

test("real Mass Effect-shaped memories survive even with a speaker/name field",()=>{
  const facts=[
    {id:"a_1",section:"flavorTexts",name:"Sovereign",
      fact:"You exist because we allow it. And you will end because we demand it.",
      kind:"quote",attribution:"Sovereign",sourceUrl:"https://example.org"},
    {id:"a_2",section:"flavorTexts",name:"Commander Shepard",
      fact:"I should go.",kind:"quote",attribution:"Shepard",sourceUrl:"https://example.org"},
    {id:"e_1",section:"characters",name:"Commander Shepard",
      fact:"Commander Shepard is the human Spectre protagonist",sourceUrl:"https://example.org"},
    {id:"e_2",section:"characters",name:"Garrus Vakarian",
      fact:"Garrus is a C-Sec investigator who joins the team",sourceUrl:"https://example.org"},
    {id:"n_1",section:"signatureMoments",fact:"The Normandy lands on Eden Prime.",
      sourceUrl:"https://example.org"},
  ];
  const output=narrowDossier({
    characters:[{name:"Commander Shepard"}],
    flavorTexts:[
      {text:"You exist because we allow it. And you will end because we demand it.",kind:"quote"},
      {text:"I should go.",kind:"quote"},
    ],
    signatureMoments:[],
  },facts);
  assert.deepEqual(output.flavorTexts?.map(m=>m.text),facts.slice(0,2).map(f=>f.fact));
  assert.deepEqual(output.characters?.map(c=>c.name),["Commander Shepard","Garrus Vakarian"]);
  assert.deepEqual(output.signatureMoments,["The Normandy lands on Eden Prime."]);
});
test("missing 17 reviewer verdicts cannot erase 17 researched Mass Effect facts",()=>{
  const facts=Array.from({length:77},(_,i)=>({id:`e_${i}`,section:"characters",
    name:`Character ${i}`,fact:`Original game supporting character ${i}`,sourceUrl:"https://example.org"}));
  const oldIncompleteReview={
    approvedIds:facts.slice(0,60).map(c=>c.id),rejectedIds:[],reasons:[],
  };
  const survivors=approved(facts,oldIncompleteReview);
  assert.equal(survivors.length,77);
  const compiled=narrowDossier({characters:[{name:"Character 0"}]},survivors);
  assert.equal(compiled.characters?.length,77);
});
test("short reviewer prompt contains no per-claim approval instruction or web research",()=>{
  const subject={title:"Mass Effect",mediaType:"Game",year:2007};
  const p=researchPrompt("verification",subject,{identity:{output:{title:"Mass Effect",excludedWorks:["Mass Effect 2"]},sources:[]}},
    [{id:"e_7",section:"characters",name:"Garrus Vakarian",fact:"Original squadmate",sourceUrl:"https://example.org"}]);
  assert.match(p,/KEEP THEM BY DEFAULT/);
  assert.match(p,/No web search/);
  assert.match(p,/Mass Effect 2/);
  assert.doesNotMatch(p,/explicit verdict for EACH/i);
});
