 
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { initSchema } from "../db/schema";
import { compileCodexV2, clearCodexV2Checkpoint } from "./codexV2";
import type { CliProxyResearchResult } from "../lib/cliProxyResearch";
import type { AiConfig } from "../lib/ai";

const url="https://example.org/canon";
const good=(text:string):CliProxyResearchResult => ({
  text, searched:true, sources:[url],promptTokens:100,completionTokens:30,
});
const config:AiConfig={
  backend:"cliProxy",apiKey:"local-test-key",baseUrl:"http://127.0.0.1:8317/v1",
  model:"gpt-6.1-terra",cliProxyCodexModel:"gpt-6.1-sol",
  creativeModel:"gpt-6.1-terra",webModel:"unused",
};
const subject={title:"Original Game",mediaType:"Game",year:2007};
const replies={
  identity:good(JSON.stringify({title:"Original Game",year:2007,creator:"Test studio",
    type:"Game",coverage:"abundant",excludedWorks:["Original Game 2"],sourceUrl:url})),
  narrative:good(JSON.stringify({claims:[
    {id:"1",section:"premise",fact:"A hero investigates a mysterious disappearance",sourceUrl:url},
    {id:"2",section:"structure",fact:"The world has optional side missions",sourceUrl:url},
    {id:"3",section:"signatureMoments",fact:"The hero confronts an old foe",sourceUrl:url},
  ]})),
  entities:good(JSON.stringify({claims:[
    {id:"1",section:"characters",name:"Hero",fact:"The protagonist in the original game",sourceUrl:url},
    {id:"2",section:"characters",name:"Sequel-only villain",fact:"Appears only in the sequel",sourceUrl:url},
  ]})),
  audience:good(JSON.stringify({claims:[
    {id:"1",section:"flavorTexts",fact:"There is no turning back.",kind:"quote",
      topic:"Hero's warning",sourceUrl:url},
  ]})),
  verification:good(JSON.stringify({approvedIds:["n_1","n_2","n_3","e_1","a_1"],
    rejectedIds:["e_2"],reasons:[{id:"e_2",reason:"Only appears in sequel"}],scopeConfidence:"medium"})),
};
const what=(prompt:string):keyof typeof replies => {
  if(prompt.includes("Identify exactly which work"))return "identity";
  if(prompt.includes("Research the WORK ITSELF"))return "narrative";
  if(prompt.includes("Find specific named people"))return "entities";
  if(prompt.includes("Search fan discussions"))return "audience";
  if(prompt.includes("INDEPENDENTLY VERIFY EACH CANDIDATE"))return "verification";
  throw new Error("Unknown stage");
};

test("staged V2 resumes at failed stage, never repeats successful searches and filters unapproved canon",async()=>{
  const db=new Database(":memory:");
  try {
    initSchema(db);
    const counts:Record<string,number>={};
    let fail=true;
    const research=async(prompt:string)=>{
      const phase=what(prompt);
      counts[phase]=(counts[phase]||0)+1;
      if(phase==="audience"&&fail){fail=false;throw new Error("temporary gateway outage");}
      return replies[phase];
    };
    const compile=async(_prompt:string)=>JSON.stringify({
      premise:"A hero investigates a mysterious disappearance",
      overview:"This is a small original game",
      characters:[{name:"Hero"},{name:"Sequel-only villain"}],
      signatureMoments:["The hero confronts an old foe","Unsupported added scene"],
      flavorTexts:[{text:"There is no turning back.",kind:"quote"},{text:"Invented",kind:"joke"}],
    });
    const base={db,codexId:"codex-test",userId:"u1",config,subject,research,compile};
    await assert.rejects(compileCodexV2(base),/audience failed/);
    const saved=db.prepare("SELECT state FROM codex_v2_runs WHERE codexId='codex-test'").get() as {state:string};
    assert.ok(saved);
    assert.deepEqual(Object.keys(JSON.parse(saved.state)),["identity","narrative","entities"]);
    const result=await compileCodexV2(base);
    assert.deepEqual(counts,{identity:1,narrative:1,entities:1,audience:2,verification:1});
    assert.equal(result.verifiedCount,5);
    assert.deepEqual(result.data.characters?.map(c=>c.name),["Hero"]);
    assert.deepEqual(result.data.flavorTexts?.map(c=>c.text),["There is no turning back."]);
    assert.deepEqual(result.data.signatureMoments,["The hero confronts an old foe"]);
    assert.equal(result.data.identifiedAs?.title,"Original Game");
    clearCodexV2Checkpoint(db,"codex-test","u1");
    assert.equal((db.prepare("SELECT count(*) AS n FROM codex_v2_runs").get() as {n:number}).n,0);
  } finally {db.close();}
});
