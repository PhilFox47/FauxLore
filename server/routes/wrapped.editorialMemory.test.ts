import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema';
import { registerWrappedRoutes } from './wrapped';

test('editorial memory endpoint is read-only, authenticated, per-user and excludes future/overlap',async()=>{
  const db=new Database(':memory:');
  initSchema(db);
  const addUser=db.prepare('INSERT INTO users(id,username,passwordHash) VALUES(?,?,?)');
  addUser.run('phil','phil','fixture');addUser.run('other','other','fixture');
  const save=db.prepare('INSERT INTO wrapped_stories (userId,timeframe,timeId,story) VALUES (?,?,?,?)');
  const story=(title:string,mediaId='ffxiv')=>JSON.stringify({
    title,dek:'Saved issue',version:2,
    scenes:[
      {kind:'opening',title:'Start',body:'Opening'},
      {kind:'insight',title:'An archived thesis',
        editorialThesis:'The old version argued that this game was more about familiar routine than the adventure itself.',
        body:'A previously published AI interpretation, not an objective truth.',
        media:{id:mediaId,title:'FFXIV'}},
      {kind:'closing',title:'Old finale',body:'Previously I decided the game had won.',finalePayoff:'A confident older verdict.'},
    ],
  });
  save.run('phil','month','2026-08',story('August: the routine'));
  save.run('phil','month','2026-09',story('September: old rerun'));
  save.run('phil','month','2026-10',story('October: a future take'));
  save.run('phil','week','2026-W36',story('Week overlapping September'));
  save.run('other','month','2026-08',story('SECRET for other account'));
  const app=express();
  app.use(express.json());
  let art=0,cover=0;
  registerWrappedRoutes(app,{
    db,
    getAuthUser:(req:any,res:any)=>{
      const who=req.headers['x-test-user'];
      if(who==='phil'||who==='other')return who;
      res.status(401).json({error:'Unauthorized'});return null;
    },
    activity:{requireActive:()=>true},
    queueWrappedCoverArt:()=>{cover++;return true;},
    queueWrappedSceneArtwork:()=>{art++;return true;},
  } as any);
  const server=app.listen(0);
  try{
    const {port}=server.address() as AddressInfo;
    const endpoint='http://127.0.0.1:'+port+'/api/wrapped/month/2026-09/editorial-memory?ids=ffxiv';
    const unauthorized=await fetch(endpoint);
    assert.equal(unauthorized.status,401);
    const res=await fetch(endpoint,{headers:{'x-test-user':'phil'}});
    assert.equal(res.status,200);
    assert.match(res.headers.get('cache-control')||'',/no-store/);
    const {memory}=await res.json();
    const labels=memory.map((m:any)=>m.title);
    assert.ok(labels.includes('August: the routine'));
    assert.ok(labels.includes('September: old rerun'));
    assert.ok(!labels.some((s:string)=>/October|overlapping|SECRET/.test(s)));
    assert.equal(memory.find((m:any)=>m.timeId==='2026-09').samePeriodRerun,true);
    assert.equal(memory.find((m:any)=>m.timeId==='2026-08').takes[0].mediaIds[0],'ffxiv');
    const other=await fetch(endpoint,{headers:{'x-test-user':'other'}});
    assert.equal(other.status,200);
    const otherData=await other.json();
    assert.ok(otherData.memory.some((m:any)=>m.title==='SECRET for other account'));
    assert.ok(!otherData.memory.some((m:any)=>m.title==='August: the routine'));
    const bad=await fetch('http://127.0.0.1:'+port+'/api/wrapped/month/2026-99/editorial-memory',
      {headers:{'x-test-user':'phil'}});
    assert.equal(bad.status,400);
    assert.equal(cover,0);assert.equal(art,0);
    const jobs=db.prepare('SELECT COUNT(*) AS count FROM wrapped_requests').get() as {count:number};
    assert.equal(jobs.count,0);
  }finally{
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    db.close();
  }
});
