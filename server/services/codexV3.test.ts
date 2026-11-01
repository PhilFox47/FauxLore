
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { initSchema } from "../db/schema";
import { buildCodexV3, persistCodexV3 } from "./codexV3";
import { codexTaskContext } from "./codexV3Context";
import type { AiConfig } from "../lib/ai";
import type { CliProxyResearchResult } from "../lib/cliProxyResearch";
import type { CodexRow } from "./codex";

const source="https://example.org/source";
const ok=(result:any):CliProxyResearchResult=>({
  text:JSON.stringify(result),searched:true,sources:[source],promptTokens:150,completionTokens:80,
});
const replies=[
  ok({identity:{title:"Mass Effect",type:"Game",year:2007,creator:"BioWare",
    coverage:"abundant",excludedWorks:["Mass Effect 2"]}}),
  ok({manifest:[
    {area:"characters",name:"Shepard",priority:"essential"},
    {area:"characters",name:"Joker",priority:"important"},
    {area:"locations",name:"Citadel",priority:"essential"},
  ]}),
  ok({core:{premise:"Commander Shepard investigates the Reaper threat",
    genres:["RPG","Science Fiction"],tags:["Space Opera"],
    tone:"Cinematic space opera"}}),
  ok({entries:[{area:"characters",name:"Shepard",facts:["Commands the Normandy"],
    priority:"essential",details:{appearance:"N7 armor",personality:"Determined"},
    sourceUrls:[source],relatesTo:["Joker"]},
    {area:"characters",name:"Joker",facts:["Pilots the Normandy"],
    priority:"important",sourceUrls:["https://different.org/credible-page"]}]}),
  ok({entries:[]}),
  ok({entries:[{area:"events",name:"Eden Prime",facts:["An early mission exposes the threat"],
    priority:"essential",sourceUrls:[source]}]}),
  ok({core:{artStyle:{summary:"Cinematic futuristic military science fiction",
    palette:"Blue, gray and metallic"},tags:["Political Intrigue"]},entries:[]}),
  ok({entries:[{area:"flavorTexts",name:"I should go.",facts:["Iconic Shepard line"],
    details:{kind:"quote",attribution:"Shepard"},sourceUrls:[source]}]}),
  ok({entries:[{area:"locations",name:"Citadel",facts:["Political hub of the galaxy"],
    details:{atmosphere:"Bustling diplomatic hub"},priority:"essential",sourceUrls:[source]}]}),
];
const config:AiConfig={
  backend:"cliProxy",apiKey:"test",baseUrl:"http://localhost:8317/v1",
  model:"gpt-6.1-terra",cliProxyCodexModel:"gpt-6.1-sol",
  webModel:"unused",creativeModel:"gpt-6.1-terra",cliProxyCodexPipeline:"v3",
};
test("V3 resumes research, fills discovered gaps, stores full KB and supplies task contexts",async()=>{
  const db=new Database(":memory:");
  try {
    initSchema(db);
    let calls=0,failOnce=true,reviewCalls=0;
    const research=async(_prompt:string)=>{
      // A failed step must be retried, previous steps never rerun.
      if(calls===4 && failOnce){failOnce=false;throw new Error("gateway dropped");}
      return replies[calls++]!;
    };
    const compile=async(_prompt:string)=>{
      reviewCalls++;
      return JSON.stringify({rejectedIds:[],reasons:[]});
    };
    const args={db,codexId:"id1",userId:"user1",config,
      subject:{title:"Mass Effect",mediaType:"Game",year:2007},research,compile};
    await assert.rejects(buildCodexV3(args),/gateway dropped/);
    assert.equal(calls,4);
    const pending=db.prepare("SELECT state FROM codex_v3_runs WHERE codexId=?").get("id1") as {state:string};
    assert.ok(pending);
    assert.equal(Object.keys(JSON.parse(pending.state)).length,4);
    const built=await buildCodexV3(args);
    assert.equal(calls,9);
    assert.equal(reviewCalls,1);
    assert.equal(built.knowledge.missing.length,0);
    assert.deepEqual(built.data.characters?.map(c=>c.name),["Shepard","Joker"]);
    assert.equal(built.knowledge.entries.find(e=>e.name==="Joker")?.sourceStatus,"uncertain");
    assert.equal(built.data.locations?.[0]?.name,"Citadel");
    assert.deepEqual(built.data.tags,["Space Opera","Political Intrigue"]);
    const row:CodexRow={id:"id1",userId:"user1",title:"Mass Effect",
      mediaType:"Game",status:"ready",data:built.data,
      titleKey:"mass effect::game",createdAt:"2026-01-01",updatedAt:"2026-01-01"} as CodexRow;
    persistCodexV3(db,"id1","user1",built.knowledge);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM codex_v3_runs").get() as {n:number}).n,0);
    const enemy=codexTaskContext(db,row,"enemy");
    assert.match(enemy,/Shepard/);
    assert.match(enemy,/Joker/);
    const tags=codexTaskContext(db,row,"tags");
    assert.match(tags,/Space Opera/);
    const wrapped=codexTaskContext(db,row,"wrapped");
    assert.match(wrapped,/Space Opera/);
    assert.doesNotMatch(wrapped,/Eden Prime/);
  }finally{db.close();}
});
