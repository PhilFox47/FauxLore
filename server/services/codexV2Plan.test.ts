 
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
test("separate stages prefix claim identifiers and verification fails closed",()=>{
  const s:State={
    narrative:{output:{claims:[{id:"1",section:"structure",fact:"Short chapters alternate perspectives",
      sourceUrl:"https://example.org/source"}]},sources:["https://example.org/source"]},
    entities:{output:{claims:[{id:"1",section:"characters",name:"Hero",fact:"Introduced in first chapter",
      sourceUrl:"https://example.org/source"}]},sources:["https://example.org/source"]},
  };
  const claims=gathered(s);
  assert.deepEqual(claims.map(c=>c.id),["n_1","e_1"]);
  assert.deepEqual(approved(claims,{approvedIds:["n_1"],rejectedIds:["e_1"]}).map(c=>c.id),["n_1"]);
  assert.deepEqual(approved(claims,{approvedIds:[],rejectedIds:[]}),[]);
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
