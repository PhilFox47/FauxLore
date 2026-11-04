import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import Database from "better-sqlite3";
import { initSchema } from "../db/schema";
import { runMigrations } from "../db/migrations";
import { createArmoryPortraitService } from "./armoryPortrait";
import { registerArmoryPortraitRoutes } from "../routes/armoryPortrait";

const png = (w:number,h:number) => {
  const b=Buffer.alloc(64);
  Buffer.from("89504e470d0a1a0a","hex").copy(b);
  b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);
  return b;
};
const tick = () => new Promise<void>(resolve=>setImmediate(resolve));
async function until(predicate:()=>boolean) {
  for (let i=0;i<30 && !predicate();i++) await tick();
  assert.ok(predicate(),"Async generation must settle.");
}

test("GETs are read-only, POST is explicit, gear images and face are scoped, state persists and stale gear never auto-renders", async()=>{
  const db=new Database(":memory:");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"fauxlore-armory-"));
  const calls:{userId:string;prompt:string;refs:string[]}[]=[];
  initSchema(db);runMigrations(db);
  for (const id of ["phil","stranger"]) {
    db.prepare("INSERT INTO users(id,username,passwordHash) VALUES(?,?,?)").run(id,id,"hash");
    db.prepare("INSERT INTO settings(userId,visualSelfInsertMode,visualSelfDescription) VALUES(?,?,?)")
      .run(id,"prefer",id === "phil" ? "Short hair and a distinctive beard":"A stranger with a blue hat");
    db.prepare("INSERT INTO media(id,userId,title,mediaType,status) VALUES(?,?,?,?,?)")
      .run("media-"+id,id,"A Game","Game","Active");
  }
  fs.writeFileSync(path.join(dir,"0123456789abcdef.png"),png(512,512));
  db.prepare(`INSERT INTO artifacts
    (id,userId,mediaId,name,description,rarity,type,earnedAt,durability,maxDurability,slot,isEquipped,imageUrl,imagePrompt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "item-1","phil","media-phil","Starlight Robe","A striking embroidered blue robe",
      "Legendary","Armor","2026-11-02T12:00:00Z",95,100,"Body",1,
      "/uploads/ai-images/0123456789abcdef.png","Blue robes with intricate silver embroidery",
    );
  db.prepare(`INSERT INTO artifacts
    (id,userId,mediaId,name,description,rarity,type,earnedAt,durability,maxDurability,slot,isEquipped,imageUrl)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "item-2","stranger","media-stranger","Do Not Include","A secret red helmet",
      "Epic","Armor","2026-11-02T12:00:00Z",100,100,"Head",1,
      "/uploads/ai-images/0123456789abcdef.png",
    );
  db.prepare("INSERT INTO visual_self_references(userId,image,mime,updatedAt) VALUES(?,?,?,?)")
    .run("phil",png(480,480),"image/png",new Date().toISOString());
  db.prepare("INSERT INTO visual_self_references(userId,image,mime,updatedAt) VALUES(?,?,?,?)")
    .run("stranger",png(200,200),"image/png",new Date().toISOString());
  db.prepare("INSERT INTO system_settings(id,aiProvider,cliProxyImageModel) VALUES(?,?,?)")
    .run("system","cliProxy","gpt-image-2.5");
  const finished=png(1024,1536);
  const service=createArmoryPortraitService({
    db,aiImagesDir:dir, generateImage: async (userId,prompt,refs)=>{
      calls.push({userId,prompt,refs});
      return "data:image/png;base64,"+finished.toString("base64");
    },
  });
  const app=express();app.use(express.json());
  registerArmoryPortraitRoutes(app,{
    db, getAuthUser: (req:any,res:any)=>{
      const user=req.get("X-Test-User");
      if (!user) {res.status(401).json({error:"Unauthorized"});return null;}
      return user;
    },
    activity: {requireActive:()=>true},
  } as any,service);
  const server=app.listen(0);
  try {
    const url="http://127.0.0.1:"+(server.address() as AddressInfo).port+"/api/armory/portrait";
    const fetchAs=(user:string,pathSuffix="",init:RequestInit={})=>fetch(url+pathSuffix,{
      ...init,headers:{...init.headers,"X-Test-User":user},
    });
    const absent=await fetchAs("phil");
    assert.equal(absent.status,200);
    assert.equal((await absent.json()).status,"idle");
    assert.equal((await fetchAs("stranger","/image")).status,404);
    assert.equal((await fetch(url)).status,401);
    assert.equal(calls.length,0,"Merely opening the Armory never calls an image model");

    const started=await fetchAs("phil","/generate",{method:"POST"});
    assert.equal(started.status,202);
    await until(()=>service.status("phil").status==="done");
    assert.equal(calls.length,1);
    assert.equal(calls[0].userId,"phil");
    assert.equal(calls[0].refs.length,2,"Face first, equipped item icon second");
    assert.equal(calls[0].refs[0],"data:image/png;base64,"+png(480,480).toString("base64"));
    assert.equal(calls[0].refs[1],"data:image/png;base64,"+png(512,512).toString("base64"));
    assert.match(calls[0].prompt,/SLOT: BODY/);
    assert.match(calls[0].prompt,/REFERENCE IMAGE #2 IS THE EXACT ITEM FOR SLOT Body/);
    assert.doesNotMatch(calls[0].prompt,/Do Not Include|secret red helmet|stranger with a blue hat/i);
    const picture=await fetchAs("phil","/image");
    assert.equal(picture.status,200);
    assert.match(picture.headers.get("cache-control")||"",/no-store/);
    assert.equal(Buffer.compare(Buffer.from(await picture.arrayBuffer()),finished),0);
    assert.equal((await fetchAs("stranger","/image")).status,404);
    assert.equal(service.status("phil").stale,false);

    db.prepare("UPDATE artifacts SET name='New Legendary Robe' WHERE id='item-1'").run();
    assert.equal(service.status("phil").stale,true);
    await fetchAs("phil"); await fetchAs("phil");
    assert.equal(calls.length,1,"Neither a change nor a GET auto-triggers regeneration");
    assert.equal((await fetchAs("phil","/generate",{method:"POST"})).status,202);
    await until(()=>service.status("phil").status==="done");
    assert.equal(calls.length,2);
    assert.equal(service.status("phil").stale,false);

    db.prepare("UPDATE settings SET visualSelfInsertMode='never' WHERE userId='phil'").run();
    assert.equal(service.status("phil").stale,true);
    assert.equal((await fetchAs("phil","/generate",{method:"POST"})).status,202);
    await until(()=>service.status("phil").status==="done");
    assert.equal(calls.length,3);
    assert.equal(calls[2].refs.length,1,"Never must remove face but still allow gear images");
    assert.doesNotMatch(calls[2].prompt,/Short hair and a distinctive beard/);
    assert.match(calls[2].prompt,/anonymous fantasy RPG avatar/);
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    fs.rmSync(dir,{recursive:true,force:true});db.close();
  }
});

test("duplicate manual jobs are refused, and failed jobs preserve last successful art",async()=>{
  const db=new Database(":memory:"); const dir=fs.mkdtempSync(path.join(os.tmpdir(),"fauxlore-armory-"));
  try {
    initSchema(db);runMigrations(db);
    db.prepare("INSERT INTO users(id,username,passwordHash) VALUES(?,?,?)").run("user","user","hash");
    db.prepare("INSERT INTO media(id,userId,title,mediaType,status) VALUES(?,?,?,?,?)")
      .run("media","user","A Game","Game","Active");
    db.prepare(`INSERT INTO artifacts (id,userId,mediaId,name,description,rarity,type,earnedAt,durability,slot,isEquipped)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run("item","user","media","Crown","A glowing crown","Epic","Armor","2026-11-03",80,"Head",1);
    let release:((value:string)=>void)|null=null;
    let fail=false;
    const service=createArmoryPortraitService({db,aiImagesDir:dir,generateImage:async()=>{
      if (fail) throw new Error("Fake renderer outage");
      return new Promise<string>(resolve=>{release=resolve;});
    }});
    assert.equal(service.generate("user").accepted,true);
    assert.equal(service.generate("user").accepted,false);
    assert.equal(service.status("user").status,"generating");
    assert.ok(release);
    release!("data:image/png;base64,"+png(1024,1536).toString("base64"));
    await until(()=>service.status("user").status==="done");
    assert.ok(service.image("user")?.bytes);
    fail=true;
    assert.equal(service.generate("user").accepted,true);
    await until(()=>service.status("user").status==="failed");
    assert.equal(service.status("user").hasImage,true);
    assert.match(service.status("user").error||"",/Fake renderer outage/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});db.close();}
});
