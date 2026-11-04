import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initSchema } from "../db/schema";
import { createImageService } from "./images";

const png = (w:number,h:number) => {
  const bytes=Buffer.alloc(64);
  Buffer.from("89504e470d0a1a0a","hex").copy(bytes);
  bytes.writeUInt32BE(w,16);bytes.writeUInt32BE(h,20);
  return bytes;
};

test("portrait requests combine face and equipment images into one GPT Image edit with private 2:3 output",async()=>{
  const db=new Database(":memory:");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"fauxlore-portrait-provider-"));
  const original=globalThis.fetch;
  const calls:Array<{url:string;body:any}>=[];
  try {
    initSchema(db);
    db.prepare("INSERT INTO users(id,username,passwordHash) VALUES(?,?,?)").run("phil","phil","testhash");
    db.prepare("INSERT INTO settings(userId,visualSelfInsertMode) VALUES(?,?)").run("phil","prefer");
    db.prepare("INSERT INTO system_settings(id,aiProvider,cliProxyApiKey,cliProxyImageModel,cliProxyBaseUrl) VALUES(?,?,?,?,?)")
      .run("system","cliProxy","test","gpt-image-2.5","http://cli-gateway.invalid/v1");
    globalThis.fetch=(async (url:any,init:any)=>{
      const body=JSON.parse(init.body);
      calls.push({url:String(url),body});
      return new Response(JSON.stringify({data:[{b64_json:png(1024,1536).toString("base64")}]}),
        {status:200,headers:{"Content-Type":"application/json"}});
    }) as typeof fetch;
    const service=createImageService({db,aiImagesDir:dir,codex:{} as any});
    const references=[
      "data:image/png;base64,"+png(480,480).toString("base64"),
      "data:image/png;base64,"+png(512,512).toString("base64"),
      "data:image/png;base64,"+png(320,320).toString("base64"),
    ];
    const output=await service.generateArmoryPortraitImage("phil",
      "One fantasy adventurer wearing a steel helmet and a leather belt",references);
    assert.equal(output,"data:image/png;base64,"+png(1024,1536).toString("base64"));
    assert.equal(calls.length,1);
    assert.match(calls[0].url,/\/images\/edits$/);
    assert.equal(calls[0].body.size,"1024x1536");
    assert.deepEqual(calls[0].body.images,references.map(image_url=>({image_url})));
    assert.match(calls[0].body.prompt,/VERTICAL 2:3/);
    assert.match(calls[0].body.prompt,/wear|wearing/i);
    assert.deepEqual(fs.readdirSync(dir),[], "Private generated portraits must never be left in static uploads");
  } finally {globalThis.fetch=original;db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test("unsupported edits use the reference-free fallback without double-charging on server failures",async()=>{
  const db=new Database(":memory:");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"fauxlore-portrait-provider-"));
  const original=globalThis.fetch;const calls:Array<{url:string;body:any}>=[];
  try {
    initSchema(db);
    db.prepare("INSERT INTO users(id,username,passwordHash) VALUES(?,?,?)").run("phil","phil","hash");
    db.prepare("INSERT INTO system_settings(id,aiProvider,cliProxyApiKey,cliProxyImageModel,cliProxyBaseUrl) VALUES(?,?,?,?,?)")
      .run("system","cliProxy","test","gpt-image-2.5","http://cli-gateway.invalid/v1");
    let editStatus=400;
    globalThis.fetch=(async(url:any,init:any)=>{
      calls.push({url:String(url),body:JSON.parse(init.body)});
      if (String(url).endsWith("/edits")) return new Response("unsupported", {status:editStatus});
      return new Response(JSON.stringify({data:[{b64_json:png(1024,1536).toString("base64")}]}),
        {status:200,headers:{"Content-Type":"application/json"}});
    }) as typeof fetch;
    const service=createImageService({db,aiImagesDir:dir,codex:{} as any});
    const ref="data:image/png;base64,"+png(480,480).toString("base64");
    const output=await service.generateArmoryPortraitImage("phil",
      "Refer to IMAGE #1 for exact facial identity",[ref],
      "A person wearing fantastical clothing; no reference image is supplied.");
    assert.match(output,/^data:image\/png;base64/);
    assert.equal(calls.length,2);
    assert.match(calls[0].url,/\/images\/edits$/);
    assert.match(calls[1].url,/\/images\/generations$/);
    assert.doesNotMatch(calls[1].body.prompt,/Refer to IMAGE #1|FACE REFERENCE INPUT/);
    assert.match(calls[1].body.prompt,/no reference image is supplied/);
    calls.length=0;editStatus=500;
    await assert.rejects(() => service.generateArmoryPortraitImage("phil",
      "An adventurer with an equipped item",[ref],"Without photo"));
    assert.equal(calls.length,1,"Do not launch a second paid request after 5xx");
  } finally {globalThis.fetch=original;db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
