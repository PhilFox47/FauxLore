import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema';
import { runMigrations } from '../db/migrations';
import { registerLogRoutes } from './logs';

test('optional impact and Moodlets persist, can be revised/cleared and reject unknown values', async () => {
  const db = new Database(':memory:');
  initSchema(db);
  runMigrations(db);
  runMigrations(db); // additive migration must remain idempotent
  db.prepare('INSERT INTO users(id, username, passwordHash) VALUES (?,?,?)')
    .run('phil', 'phil', 'test-hash');
  db.prepare('INSERT INTO media(id,userId,title,mediaType,status) VALUES (?,?,?,?,?)')
    .run('moon','phil','To the Moon','Game','Active');
  db.prepare('INSERT INTO logs(id,userId,mediaId,timestamp,metricType,delta) VALUES (?,?,?,?,?,?)')
    .run('session','phil','moon','2026-10-22T12:00:00Z','playtimeHours',1);
  const app = express();
  app.use(express.json());
  registerLogRoutes(app, {
    db, getAuthUser: () => 'phil', activity: { isFrozen: () => false },
    autoTag: {}, queueBossVictoryArtwork: () => {},
  } as any);
  const server = app.listen(0);
  try {
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    const put = (patch: unknown) => fetch(base + '/api/logs/session', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    let result = await put({
      sessionEnjoyment: 3, sessionImpact: 5, moodlets: ['moving','thought-provoking'],
    });
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).moodlets, ['moving','thought-provoking']);
    const saved = db.prepare('SELECT sessionEnjoyment,sessionImpact,moodlets FROM logs WHERE id=?')
      .get('session') as { sessionEnjoyment:number;sessionImpact:number;moodlets:string };
    assert.equal(saved.sessionImpact, 5);
    assert.equal(saved.sessionEnjoyment, 3);
    assert.deepEqual(JSON.parse(saved.moodlets), ['moving','thought-provoking']);

    // An unrelated edit must not silently clear the session's personal signals.
    result = await put({ note: 'A chapter' });
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).moodlets,['moving','thought-provoking']);
    for (const patch of [
      { sessionImpact: 0 },
      { sessionImpact: 6 },
      { moodlets: ['made-up'] },
      { moodlets: ['moving','moving'] },
      { moodlets: ['moving','funny','social','tense','distracted'] },
    ]) {
      result = await put(patch);
      assert.equal(result.status, 400);
    }
    result = await put({sessionImpact:null,sessionEnjoyment:null,moodlets:[]});
    assert.equal(result.status, 200);
    const cleared = await result.json();
    assert.equal(cleared.sessionImpact, null);
    assert.equal(cleared.sessionEnjoyment, null);
    assert.deepEqual(cleared.moodlets, []);
    // Full-work reviews submitted on reflection page must be dated in the
    // historical opinion ledger, not silently backfilled on a later restart.
    db.prepare("UPDATE media SET status='Completed' WHERE id='moon'").run();
    result = await put({ userRating: 4.5, userReview: 'An unforgettable ending' });
    assert.equal(result.status, 200);
    const history = db.prepare('SELECT userRating,userReview,recordedAt FROM media_opinion_history WHERE mediaId=? ORDER BY id')
      .all('moon') as {userRating:number;userReview:string;recordedAt:string}[];
    assert.equal(history.length,1);
    assert.equal(history[0].userRating,4.5);
    assert.equal(history[0].userReview,'An unforgettable ending');
    assert.ok(Date.parse(history[0].recordedAt) > 0);
    result = await put({ userRating: 4.5, userReview: 'An unforgettable ending' });
    assert.equal(result.status, 200);
    const count = db.prepare('SELECT COUNT(*) as n FROM media_opinion_history WHERE mediaId=?')
      .get('moon') as {n:number};
    assert.equal(count.n,1);
    const list = await fetch(base + '/api/logs');
    assert.equal(list.status, 200);
    const rows = await list.json() as Array<{moodlets:string[]}>;
    assert.deepEqual(rows.find((l:any)=>l.id==='session')?.moodlets, []);
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    db.close();
  }
});
