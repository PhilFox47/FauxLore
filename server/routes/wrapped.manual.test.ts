import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import Database from "better-sqlite3";
import { initSchema } from "../db/schema";
import { registerWrappedRoutes } from "./wrapped";

test("opening an ungenerated historical month is read-only; old auto clients cannot start", async () => {
  const db = new Database(":memory:");
  initSchema(db);
  const app = express();
  app.use(express.json());
  let coverCalls = 0;
  let sceneCalls = 0;
  registerWrappedRoutes(app, {
    db,
    getAuthUser: () => "phil",
    activity: { requireActive: () => true },
    queueWrappedCoverArt: () => { coverCalls++; return true; },
    queueWrappedSceneArtwork: () => { sceneCalls++; return true; },
  } as any);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const base = "http://127.0.0.1:" + port + "/api/wrapped/month/2026-04";
    const get = await fetch(base);
    assert.equal(get.status, 200);
    assert.equal(await get.json(), null);
    assert.equal(coverCalls, 0);
    assert.equal(sceneCalls, 0);

    // Old production bundles use POST /start without an explicit intent.
    const implicit = await fetch(base + "/start", { method: "POST" });
    assert.equal(implicit.status, 428);
    const pending = db.prepare("SELECT count(*) AS count FROM wrapped_requests").get() as { count: number };
    assert.equal(pending.count, 0);

    // A click obtains a scoped, single-use capability before starting.
    const consent = await fetch(base + "/intent", { method: "POST" });
    assert.equal(consent.status, 200);
    const { intentId } = await consent.json() as { intentId: string };
    const start = await fetch(base + "/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId }),
    });
    assert.equal(start.status, 200);
    const { requestId } = await start.json() as { requestId: string };
    assert.ok(requestId);
    const replay = await fetch(base + "/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId }),
    });
    assert.equal(replay.status, 428);
    // Even a manually started story cannot be hijacked by an older/unscoped save.
    const staleSave = await fetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "legacy-request", story: {} }),
    });
    assert.equal(staleSave.status, 428);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    db.close();
  }
});
