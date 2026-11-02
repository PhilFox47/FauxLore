import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoryScenes } from './storyDiscovery';
import { normalizeRecap } from '../services/recapAi';
import type { MediaItem, ProgressLog } from '../types/schema';

const media = (id: string, title: string, type: MediaItem['mediaType']): MediaItem => ({
  id, title, mediaType: type, status: 'Active', genres: [], tags: [], tropes: [],
  createdAt: '2026-01-01T12:00:00Z', updatedAt: '2026-10-25T12:00:00Z',
  userRating: id === 'book' ? 4.5 : undefined,
  reviewScore: id === 'book' ? 2.5 : undefined,
  coverImageUrl: 'https://example.invalid/' + id + '.jpg',
});

const log = (id: string, mediaId: string, timestamp: string, delta: number, location?: string, note?: string): ProgressLog => ({
  id, mediaId, timestamp, delta, location, note,
  metricType: mediaId === 'book' ? 'pagesRead' : 'playtimeHours',
});

const book = media('book', 'Der Nachtzug', 'Book');
const game = media('game', 'Other Game', 'Game');
const recap = normalizeRecap({
  title: 'An Unexpected Reading Trip',
  dek: 'Leaving home might matter more than another record.',
  chapters: [
    { heading: 'A Different Environment', body: 'Books suddenly had more room to breathe while traveling.' },
    { heading: 'An Odd Coincidence', body: 'A story about trains in a very different reading situation.' },
  ],
  lookAhead: { watchFor: 'Will reading continue after the return?', challenge: '' },
});
const current = [
  log('a', 'book', '2026-10-20T13:00:00Z', 130, 'Eindhoven', 'I was fascinated by the suspense of this book.'),
  log('b', 'book', '2026-10-22T13:00:00Z', 100, 'Train'),
  log('c', 'game', '2026-10-23T13:00:00Z', 1, 'Hotel'),
];

test('Story is a finite, curated, repeatable sequence with bookends and genuine scenes', () => {
  const args = { timeframe: 'week' as const, timeId: '2026-W43', recap, logs: current, history: current, media: [book, game], achievements: [] };
  const first = buildStoryScenes(args);
  assert.ok(first.length >= 4 && first.length <= 6);
  assert.equal(first[0].kind, 'opening');
  assert.equal(first.at(-1)?.kind, 'closing');
  assert.deepEqual(first, buildStoryScenes(args));
  assert.ok(first.some(s => s.kind === 'insight'));
  assert.ok(first.some(s => s.kind === 'journal' || s.kind === 'location'));
  assert.equal(new Set(first.map(s => s.id)).size, first.length);
});

test('No personal outlier is asserted without at least three occupied historical periods', () => {
  const scenes = buildStoryScenes({ timeframe: 'week', timeId: '2026-W43', recap, logs: current, history: current, media: [book, game], achievements: [] });
  assert.ok(!scenes.some(s => s.kind === 'outlier'));
});

test('Significant deviation uses comparison with prior weeks, not invented population statistics', () => {
  const history = [
    ...current,
    log('p1', 'game', '2026-10-14T13:00:00Z', 12),
    log('p2', 'game', '2026-10-07T13:00:00Z', 12),
    log('p3', 'game', '2026-09-30T13:00:00Z', 12),
  ];
  const scenes = buildStoryScenes({ timeframe: 'week', timeId: '2026-W43', recap, logs: current, history, media: [book, game], achievements: [] });
  const outlier = scenes.find(s => s.kind === 'outlier');
  assert.ok(outlier, 'a strong change in the dominant media type should be discoverable');
  assert.equal(outlier.bars?.[0].value, 0);
  assert.ok((outlier.bars?.[1].value || 0) > 85);
});

test('Achievements can become a scene but never replace the original achievement data', () => {
  const achieved = [{
    timeframe: 'week' as const, timeId: '2026-W43', position: 0,
    title: 'Method Acting for Idiots', description: 'You read on a train.',
    reward: 'A voucher valid on trains that arrive on time.', subject: 'Reading on a train',
    createdAt: '2026-10-25T18:00:00Z',
  }];
  const scenes = buildStoryScenes({ timeframe: 'week', timeId: '2026-W43', recap, logs: current, history: current, media: [book, game], achievements: achieved });
  const scene = scenes.find(s => s.kind === 'achievement');
  assert.equal(scene?.achievement?.reward, achieved[0].reward);
  assert.ok(scenes.length <= 6);
});

test('Empty recap and empty activity gracefully return no Story Mode', () => {
  const args = { timeframe: 'week' as const, timeId: '2026-W43', logs: current, history: current, media: [book, game], achievements: [] };
  assert.deepEqual(buildStoryScenes({ ...args, recap: null }), []);
  assert.deepEqual(buildStoryScenes({ ...args, logs: [], recap }), []);
});
