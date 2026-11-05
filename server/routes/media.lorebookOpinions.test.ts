import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema';
import { runMigrations } from '../db/migrations';
import { registerMediaRoutes } from './media';

test('Lorebook review history is account-scoped, ordered and excludes orphaned media', async()=>{
  const db=new Database(':memory:');
  const app=express();
  let server:ReturnType<typeof app.listen>|null=null;
  try {
    initSchema(db);
    runMigrations(db);
    db.prepare('INSERT INTO users(id,username,passwordHash) VALUES (?,?,?)').run('phil','phil','hash');
    db.prepare('INSERT INTO users(id,username,passwordHash) VALUES (?,?,?)').run('leo','leo','hash');
    const addMedia=db.prepare('INSERT INTO media(id,userId,title,mediaType,status) VALUES (?,?,?,?,?)');
    addMedia.run('moon','phil','To the Moon','Game','Completed');
    addMedia.run('secret','leo','Private Review','Book','Completed');
    const addOpinion=db.prepare('INSERT INTO media_opinion_history(userId,mediaId,recordedAt,userRating,userReview,dropReason) VALUES (?,?,?,?,?,?)');
    addOpinion.run('phil','moon','2026-10-20T10:00:00Z',4,'Early impressions',null);
    addOpinion.run('phil','moon','2026-10-21T10:00:00Z',5,'A changed opinion',null);
    addOpinion.run('leo','secret','2026-10-20T12:00:00Z',5,'Not Phil review',null);

    app.use(express.json());
    registerMediaRoutes(app,{
      db,
      getAuthUser:(req:any,res:any)=>{
        const owner=req.header('x-test-user');
        if(owner==='phil'||owner==='leo')return owner;
        res.status(401).json({error:'Unauthorized'});
        return null;
      },
    } as any);
    server=app.listen(0);
    const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
    const endpoint=base+'/api/media/lorebook-opinions';
    const phil=await fetch(endpoint,{headers:{'x-test-user':'phil'}});
    assert.equal(phil.status,200);
    const philRows=await phil.json() as any[];
    assert.equal(philRows.length,2);
    assert.equal(philRows[0].userReview,'Early impressions');
    assert.equal(philRows[1].userReview,'A changed opinion');
    assert.deepEqual(philRows.map(r=>r.mediaId),['moon','moon']);
    assert.ok(philRows.every(r=>typeof r.id==='number'));
    assert.ok(philRows.every(r=>!('userId' in r)));
    const leo=await fetch(endpoint,{headers:{'x-test-user':'leo'}});
    const leoRows=await leo.json() as any[];
    assert.deepEqual(leoRows.map(r=>r.mediaId),['secret']);
    assert.equal(leoRows[0].userReview,'Not Phil review');
    const anonymous=await fetch(endpoint);
    assert.equal(anonymous.status,401);
  } finally {
    if(server)await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));
    db.close();
  }
});
