
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeManifest, normalizeEntries, mergeKnowledgeEntries, missingManifest,
  excludeReviewedErrors, toCodexData, type CodexKnowledge,
} from "./codexV3Knowledge";
import { knowledgeTaskBlock } from "./codexV3Context";

test("V3 preserves useful research even if the search URL cannot be matched",()=>{
  const entries=normalizeEntries([
    {area:"characters",name:"Joker",facts:["Normandy pilot"],
      sourceUrls:["https://example.org/real-article"],priority:"important"},
  ],["https://other.example.org/receipt"],"cast");
  assert.equal(entries.length,1);
  assert.equal(entries[0].sourceStatus,"uncertain");
});

test("coverage follows named importance instead of arbitrary character counts",()=>{
  const manifest=normalizeManifest([
    {name:"Shepard",area:"characters",priority:"essential"},
    {name:"Joker",area:"characters",priority:"important"},
    {name:"Citadel",area:"locations",priority:"essential"},
  ]);
  const entries=normalizeEntries([
    {area:"characters",name:"Shepard",facts:["Commander"],priority:"essential"},
    {area:"locations",name:"Citadel",facts:["Station"],priority:"essential"},
  ],[],"cast");
  assert.deepEqual(missingManifest(manifest,entries).map(x=>x.name),["Joker"]);
});

test("a quick review removes only explicit, explained errors",()=>{
  const a=normalizeEntries([
    {area:"characters",name:"Shepard",facts:["Original game protagonist"]},
    {area:"characters",name:"Sequel character",facts:["Only in sequel"]},
  ],[],"cast");
  assert.equal(excludeReviewedErrors(a,{rejectedIds:["cast_0","cast_1"],reasons:[]}).length,2);
  assert.deepEqual(excludeReviewedErrors(a,{rejectedIds:["cast_1"],
    reasons:[{id:"cast_1",reason:"Only first appears in the sequel."}]}).map(x=>x.name),["Shepard"]);
});

test("merging duplicates retains independent facts, visual details and relationships",()=>{
  const a=normalizeEntries([{area:"characters",name:"Shepard",facts:["A commander"],
    details:{appearance:"N7 armor"},relatesTo:["Garrus"]}],[],"one");
  const b=normalizeEntries([{area:"characters",name:"shepard",facts:["Commands Normandy"],
    details:{personality:"Determined"},relatesTo:["Liara"]}],[],"two");
  const merged=mergeKnowledgeEntries([...a,...b]);
  assert.equal(merged.length,1);
  assert.deepEqual(merged[0].facts,["A commander","Commands Normandy"]);
  assert.deepEqual(merged[0].relatesTo,["Garrus","Liara"]);
  assert.equal(merged[0].details.appearance,"N7 armor");
});

test("Knowledge Base stores ALL memories; wrapped ignores spoiler-specific entities",()=>{
  const memories=Array.from({length:14},(_,i)=>({
    id:`memory_${i}`,area:"flavorTexts" as const,name:`Recognizable line ${i}`,
    facts:["Relevant in the work"],details:{kind:"quote"},relatesTo:[],sourceUrls:[],
    sourceStatus:"uncertain" as const,priority:"important" as const,
  }));
  const kb:CodexKnowledge={
    version:3,identity:{title:"Original game",year:2007,type:"Game"},
    core:{premise:"Space opera",themes:["Politics"],genres:["RPG"],tags:["Sci-Fi"]},
    manifest:[],entries:[...memories,{
      id:"event0",area:"events",name:"Secret ending",facts:["Spoiler"],
      details:{},relatesTo:[],sourceUrls:[],sourceStatus:"uncertain",priority:"essential",
    }],missing:[],sources:[],notes:[],
  };
  const dossier=toCodexData(kb);
  assert.equal(dossier.flavorTexts?.length,14);
  const wrapped=knowledgeTaskBlock(kb,"wrapped");
  assert.match(wrapped,/Space opera/);
  assert.doesNotMatch(wrapped,/Secret ending/);
  const memoriesCtx=knowledgeTaskBlock(kb,"memory");
  assert.match(memoriesCtx,/Recognizable line 13/);
});
