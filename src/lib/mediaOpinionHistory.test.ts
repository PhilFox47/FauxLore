import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaOpinionsAsOf, type MediaOpinionSnapshot } from './mediaOpinionHistory';
import type { MediaItem } from '../types/schema';
import { buildWrappedEvidence } from './wrappedEvidence';

const avatar: MediaItem = {
  id: 'avatar', title: 'Avatar: Seven Havens', mediaType: 'Series',
  status: 'Caught Up', genres: ['Fantasy'], tags: [], tropes: [],
  userRating: 5, userReview: 'I cannot wait for another season!',
  reviewScore: 5, createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-11-02T12:00:00Z',
};
const reviews: MediaOpinionSnapshot[] = [{
  mediaId: avatar.id, recordedAt: '2026-11-01T20:00:00Z',
  userRating: 5, userReview: avatar.userReview!, dropReason: null,
}];
const log = (timestamp: string) => ({
  id: timestamp, mediaId: avatar.id, timestamp, metricType: 'episodesWatched' as const, delta: 1,
});

test('a later Avatar season verdict cannot contaminate the week of Oct 19', () => {
  const historical = mediaOpinionsAsOf([avatar], reviews, new Date('2026-10-25T23:59:59Z'));
  assert.equal(historical[0].userReview, undefined);
  assert.equal(historical[0].userRating, undefined);
  const logs = [log('2026-10-23T18:00:00Z')];
  const evidence = buildWrappedEvidence({
    timeframe: 'week', timeId: '2026-W43', logs, history: logs, media: historical,
  });
  assert.equal(evidence.media[0].review, undefined);
  assert.equal(evidence.media[0].rating, undefined);
  assert.ok(!JSON.stringify(evidence).includes('another season'));
  assert.ok(!evidence.facts.some(f => f.id.startsWith('taste-avatar')));
});

test('the same opinion is available in the week when it was observed', () => {
  const historical = mediaOpinionsAsOf([avatar], reviews, new Date('2026-11-01T23:59:59Z'));
  const logs = [log('2026-11-01T19:00:00Z')];
  const evidence = buildWrappedEvidence({
    timeframe: 'week', timeId: '2026-W44', logs, history: logs, media: historical,
  });
  assert.equal(historical[0].userRating, 5);
  assert.ok(evidence.facts.some(f => f.evidence.includes('another season')));
});

test('edits and deletions use the latest snapshot at each point in time', () => {
  const history: MediaOpinionSnapshot[] = [
    { mediaId: 'avatar', recordedAt: '2026-11-10T12:00:00Z',
      userRating: null, userReview: null, dropReason: null },
    ...reviews,
    { mediaId: 'avatar', recordedAt: '2026-11-05T12:00:00Z',
      userRating: 4, userReview: 'A revised take', dropReason: null },
  ];
  const asOf = (end: string) => mediaOpinionsAsOf([avatar], history, new Date(end))[0];
  assert.equal(asOf('2026-11-02T00:00:00Z').userRating, 5);
  assert.equal(asOf('2026-11-06T00:00:00Z').userReview, 'A revised take');
  assert.equal(asOf('2026-11-11T00:00:00Z').userReview, undefined);
});
