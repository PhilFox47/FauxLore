import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import express from "express";
import Database from "better-sqlite3";
import { initSchema } from "../db/schema";
import { runMigrations } from "../db/migrations";
import { registerSettingsRoutes } from "./settings";

const makePng = (width = 480, height = 480): Buffer => {
  const b = Buffer.alloc(64, 0);
  Buffer.from("89504e470d0a1a0a", "hex").copy(b);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
};

test("private reference supports upload, per-account preview, replacement, deletion and no settings disclosure", async () => {
  const db = new Database(":memory:");
  initSchema(db); runMigrations(db);
  for (const id of ["alice", "bob"]) {
    db.prepare("INSERT INTO users(id,username,passwordHash) VALUES(?,?,?)").run(id,id,"testhash");
  }
  const app = express();
  app.use(express.json());
  registerSettingsRoutes(app, {
    db, getAuthUser: (req: any,res: any) => {
      const user = req.get("X-Test-User");
      if (!user) { res.status(401).json({error: "Not logged in"}); return null; }
      return user;
    },
  } as any);
  const server = app.listen(0);
  try {
    const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/api/settings";
    const get = (user?: string) => fetch(base + "/visual-reference", { headers: user ? { "X-Test-User": user } : {} });
    const put = (user: string, payload: Buffer, mime = "image/png") =>
      fetch(base + "/visual-reference", {
        method: "PUT",
        headers: { "X-Test-User": user, "Content-Type": mime },
        body: payload as any,
      });
    assert.equal((await get()).status, 401);
    assert.equal((await get("alice")).status, 404);
    assert.equal((await put("alice", makePng())).status, 200);
    const alice = await get("alice");
    assert.equal(alice.status, 200);
    assert.equal(alice.headers.get("content-type"), "image/png");
    assert.match(alice.headers.get("cache-control") || "", /no-store/);
    assert.equal(Buffer.compare(Buffer.from(await alice.arrayBuffer()), makePng()), 0);
    assert.equal((await get("bob")).status, 404, "A different account must never see the photo");
    const settingsRes = await fetch(base, { headers: { "X-Test-User": "alice" } });
    const settings = await settingsRes.json();
    assert.equal(settings.hasVisualSelfReference, true);
    assert.ok(!JSON.stringify(settings).includes("iVBORw0"), "Settings must never expose binary/base64 face data");
    assert.equal((await put("alice", makePng(640,640))).status, 200);
    const replacement = await get("alice");
    assert.equal(Buffer.compare(Buffer.from(await replacement.arrayBuffer()), makePng(640,640)), 0);
    const invalidMime = await put("alice", makePng(), "image/jpeg");
    assert.equal(invalidMime.status, 400);
    const invalidDimensions = await put("alice", makePng(32,32));
    assert.equal(invalidDimensions.status, 400);
    const unsupported = await put("alice", Buffer.from("<svg></svg>"), "image/svg+xml");
    assert.equal(unsupported.status, 415);
    assert.equal((await get("alice")).status, 200, "Invalid replacements must not destroy the saved image");
    const remove = await fetch(base + "/visual-reference", {
      method: "DELETE", headers: { "X-Test-User": "alice" },
    });
    assert.equal(remove.status, 200);
    assert.equal((await get("alice")).status, 404);
    const afterSettings = await (await fetch(base, {headers:{"X-Test-User":"alice"}})).json();
    assert.equal(afterSettings.hasVisualSelfReference,false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    db.close();
  }
});
