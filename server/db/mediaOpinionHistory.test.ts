import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from './schema';
import { runMigrations } from './migrations';

test('legacy reviews are observed now, not retroactively assigned to their media update date', () => {
  const db = new Database(':memory:');
  try {
    initSchema(db);
    db.prepare(`
      INSERT INTO media (id, userId, title, mediaType, status,
        userRating, userReview, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('avatar', 'default_user', 'Avatar', 'Series', 'Caught Up',
      5, 'The next season cannot come soon enough',
      '2026-10-20T12:00:00Z', '2026-10-25T20:00:00Z');
    const before = Date.now();
    runMigrations(db);
    const after = Date.now();
    const event = db.prepare(
      'SELECT userRating, userReview, recordedAt FROM media_opinion_history WHERE mediaId = ?',
    ).get('avatar') as { userRating: number; userReview: string; recordedAt: string };
    assert.equal(event.userRating, 5);
    assert.match(event.userReview, /next season/);
    assert.ok(Date.parse(event.recordedAt) >= before && Date.parse(event.recordedAt) <= after);
    assert.ok(event.recordedAt > '2026-10-25T23:59:59Z');
    runMigrations(db);
    const count = db.prepare(
      'SELECT COUNT(*) AS count FROM media_opinion_history WHERE mediaId = ?',
    ).get('avatar') as { count: number };
    assert.equal(count.count, 1);
  } finally {
    db.close();
  }
});
