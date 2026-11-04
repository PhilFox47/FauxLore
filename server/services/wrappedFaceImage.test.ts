import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { initSchema } from "../db/schema";
import { createImageService } from "./images";

const png = (width:number, height:number) => {
  const bytes = Buffer.alloc(64);
  Buffer.from("89504e470d0a1a0a","hex").copy(bytes);
  bytes.writeUInt32BE(width,16);
  bytes.writeUInt32BE(height,20);
  return bytes;
};

test("GPT Image provider receives real face bytes only when self-casting and consent allow them", async () => {
  const db = new Database(":memory:");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fauxlore-face-provider-"));
  const originalFetch = globalThis.fetch;
  const requests: Array<{endpoint:string;body:any}> = [];
  try {
    initSchema(db);
    db.prepare("INSERT INTO system_settings(id,aiProvider,cliProxyApiKey,cliProxyImageModel,cliProxyBaseUrl) VALUES(?,?,?,?,?)")
      .run("system","cliProxy","test-key","gpt-image-2.5","http://fake-gateway.local/v1");
    for (const id of ["alice", "bob"]) {
      db.prepare("INSERT INTO users(id,username,passwordHash) VALUES(?,?,?)").run(id,id,"testhash");
      db.prepare("INSERT INTO settings(userId,visualSelfInsertMode,visualSelfDescription) VALUES(?,?,?)")
        .run(id,"prefer","short brown hair and a beard");
    }
    const photo = png(400,400);
    db.prepare("INSERT INTO visual_self_references(userId,image,mime,updatedAt) VALUES(?,?,?,?)")
      .run("alice",photo,"image/png",new Date().toISOString());
    const output = png(1536,1024).toString("base64");
    globalThis.fetch = (async (url: any, init: any) => {
      requests.push({ endpoint: String(url), body: JSON.parse(init?.body || "{}") });
      return new Response(JSON.stringify({data:[{b64_json:output}]}),{
        status:200,headers:{"Content-Type":"application/json"},
      });
    }) as typeof fetch;

    const images = createImageService({db,aiImagesDir:dir,codex:{} as any});
    await images.generateWrappedSceneImage("alice","Self in Eorzea",{useFaceReference:true});
    await images.generateWrappedSceneImage("alice","Canon protagonist in Eorzea",{useFaceReference:false});
    db.prepare("UPDATE settings SET visualSelfInsertMode='never' WHERE userId='alice'").run();
    await images.generateWrappedSceneImage("alice","Opted-out portrait",{useFaceReference:true});
    await images.generateWrappedSceneImage("bob","Bob without any uploaded photo",{useFaceReference:true});

    assert.equal(requests.length,4);
    assert.match(requests[0].endpoint,/\/images\/edits$/);
    assert.equal(requests[0].body.images[0].image_url,
      "data:image/png;base64,"+photo.toString("base64"));
    assert.match(requests[0].body.prompt,/FACE REFERENCE INPUT/);
    for (const request of requests.slice(1)) {
      assert.match(request.endpoint,/\/images\/generations$/);
      assert.equal(request.body.images,undefined);
    }
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(dir,{recursive:true,force:true});
    db.close();
  }
});
