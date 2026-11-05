import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {initSchema} from '../db/schema';
import {runMigrations} from '../db/migrations';
import {createImageService} from './images';

const png=(width:number,height:number)=>{
  const b=Buffer.alloc(64);Buffer.from('89504e470d0a1a0a','hex').copy(b);
  b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);return b;
};

test('a private person photo is passed only for the exact owner, allowed person and explicit image request',async()=>{
  const db=new Database(':memory:');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fauxlore-people-image-'));
  const originalFetch=globalThis.fetch;
  const requests:Array<{endpoint:string;body:any}>=[];
  try{
    initSchema(db);runMigrations(db);
    db.prepare("INSERT INTO system_settings(id,aiProvider,cliProxyApiKey,cliProxyImageModel,cliProxyBaseUrl) VALUES(?,?,?,?,?)")
      .run('system','cliProxy','test','gpt-image-2.5','http://fake.local/v1');
    for(const id of ['alice','bob']){
      db.prepare("INSERT INTO users(id,username,passwordHash) VALUES(?,?,?)").run(id,id,'hash');
      db.prepare("INSERT INTO settings(userId,visualSelfInsertMode,visualSelfDescription) VALUES(?,?,?)")
        .run(id,'prefer','glasses and beard');
    }
    const now=new Date().toISOString();
    const photo=png(450,450);
    db.prepare("INSERT INTO important_people(id,userId,name,aliases,relationship,notes,appearance,allowImages,image,mime,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .run('leo','alice','Leonie','["Leo"]','partner','shared adventures','long hair',1,photo,'image/png',now,now);
    db.prepare("INSERT INTO important_people(id,userId,name,aliases,relationship,notes,appearance,allowImages,image,mime,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .run('blocked','alice','Other','[]','friend','','',0,photo,'image/png',now,now);
    db.prepare("INSERT INTO visual_self_references(userId,image,mime,updatedAt) VALUES(?,?,?,?)")
      .run('alice',png(400,400),'image/png',now);
    const output=png(1536,1024).toString('base64');
    globalThis.fetch=(async(url:any,init:any)=>{
      requests.push({endpoint:String(url),body:JSON.parse(init.body)});
      return new Response(JSON.stringify({data:[{b64_json:output}]}),{
        status:200,headers:{'Content-Type':'application/json'},
      });
    }) as typeof fetch;
    const service=createImageService({db,aiImagesDir:dir,codex:{} as any});
    await service.generateWrappedSceneImage('alice','A scene with Leonie',{personReferenceIds:['leo']});
    await service.generateWrappedSceneImage('alice','A scene with blocked person',{personReferenceIds:['blocked']});
    await service.generateWrappedSceneImage('bob','No access to Leonie photo',{personReferenceIds:['leo']});
    await service.generateWrappedSceneImage('alice','Owner and Leonie',{useFaceReference:true,personReferenceIds:['leo']});
    assert.equal(requests.length,4);
    assert.match(requests[0].endpoint,/\/images\/edits$/);
    assert.equal(requests[0].body.images.length,1);
    assert.equal(requests[0].body.images[0].image_url,'data:image/png;base64,'+photo.toString('base64'));
    assert.match(requests[0].body.prompt,/Reference 1: "Leonie"/);
    for(const i of [1,2]){
      assert.match(requests[i].endpoint,/\/images\/generations$/);
      assert.equal(requests[i].body.images,undefined);
    }
    assert.equal(requests[3].body.images.length,2);
    assert.match(requests[3].body.prompt,/Reference 1: "the account owner"/);
    assert.match(requests[3].body.prompt,/Reference 2: "Leonie"/);
  }finally{
    globalThis.fetch=originalFetch;
    fs.rmSync(dir,{recursive:true,force:true});db.close();
  }
});
