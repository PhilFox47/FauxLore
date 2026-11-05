import test from 'node:test';
import assert from 'node:assert/strict';
import { type AddressInfo } from 'node:net';
import express from 'express';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema';
import { runMigrations } from '../db/migrations';
import { registerImportantPeopleRoutes } from './importantPeople';

const png=(width=320,height=320)=>{
  const b=Buffer.alloc(64);
  Buffer.from('89504e470d0a1a0a','hex').copy(b);
  b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);return b;
};
const profile={
  name:'Leonie',aliases:['Leo'],relationship:'Partner',notes:'Plays FFXIV together',
  appearance:'Long brown hair',allowImages:true,
};

test('private people profiles and photos are isolated per account and never in JSON',async()=>{
  const db=new Database(':memory:');
  let server:ReturnType<ReturnType<typeof express>['listen']>|null=null;
  try {
    initSchema(db);runMigrations(db);
    for(const id of ['alice','bob'])db.prepare('INSERT INTO users(id,username,passwordHash) VALUES (?,?,?)')
      .run(id,id,'hash');
    const app=express();app.use(express.json());
    registerImportantPeopleRoutes(app,{db,getAuthUser:(req:any,res:any)=>{
      const id=req.header('X-Test-User');
      if(id==='alice'||id==='bob')return id;
      res.status(401).json({error:'Unauthorized'});return null;
    }} as any);
    server=app.listen(0);
    const base='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api/important-people';
    const json=(method:string,url:string,body?:unknown,who='alice')=>fetch(url,{
      method,headers:{'X-Test-User':who,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    assert.equal((await fetch(base)).status,401);
    const created=await json('POST',base,profile);
    assert.equal(created.status,201);
    const person=await created.json();
    const id=person.id as string;
    assert.match(id,/^[0-9a-f-]{36}$/i);
    assert.equal(person.name,'Leonie');
    const alice=await (await fetch(base,{headers:{'X-Test-User':'alice'}})).json();
    const bob=await (await fetch(base,{headers:{'X-Test-User':'bob'}})).json();
    assert.equal(alice.length,1);
    assert.equal(bob.length,0);
    assert.ok(!JSON.stringify(alice).includes('base64'));
    assert.equal((await fetch(base+'/'+id+'/photo',{headers:{'X-Test-User':'bob'}})).status,404);
    const photo=png();
    const photoRes=await fetch(base+'/'+id+'/photo',{method:'PUT',
      headers:{'X-Test-User':'alice','Content-Type':'image/png'},body:photo as any});
    assert.equal(photoRes.status,200);
    const saved=await fetch(base+'/'+id+'/photo',{headers:{'X-Test-User':'alice'}});
    assert.equal(saved.status,200);
    assert.equal(saved.headers.get('cache-control'),'private, no-store');
    assert.equal(Buffer.compare(Buffer.from(await saved.arrayBuffer()),photo),0);
    const photoBob=await fetch(base+'/'+id+'/photo',{headers:{'X-Test-User':'bob'}});
    assert.equal(photoBob.status,404);
    const after=await (await fetch(base,{headers:{'X-Test-User':'alice'}})).json();
    assert.equal(after[0].hasImage,true);
    assert.ok(!JSON.stringify(after).includes('iVBOR'));
    const invalid=await fetch(base+'/'+id+'/photo',{method:'PUT',headers:{
      'X-Test-User':'alice','Content-Type':'image/jpeg'},body:photo as any});
    assert.equal(invalid.status,400);
    assert.equal((await fetch(base+'/'+id+'/photo',{headers:{'X-Test-User':'alice'}})).status,200);
    assert.equal((await json('PUT',base+'/'+id,{...profile,allowImages:false})).status,200);
    assert.equal((await json('PUT',base+'/'+id,{...profile,allowImages:true},'bob')).status,404);
    assert.equal((await json('DELETE',base+'/'+id,undefined,'bob')).status,404);
    assert.equal((await json('DELETE',base+'/'+id)).status,200);
    assert.equal((await fetch(base+'/'+id+'/photo',{headers:{'X-Test-User':'alice'}})).status,404);
    assert.equal((await fetch(base,{headers:{'X-Test-User':'alice'}})).status,200);
  }finally{
    if(server)await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));
    db.close();
  }
});
