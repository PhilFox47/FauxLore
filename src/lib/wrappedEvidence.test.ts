import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWrappedEvidence } from './wrappedEvidence';
import { normalizeWrappedStory } from '../services/wrappedAi';
import type { MediaItem, ProgressLog } from '../types/schema';

const media: MediaItem[] = [
  { id: 'book', title: 'Train Story', mediaType: 'Book', status: 'Completed',
    genres: ['Thriller'], tags: [], tropes: [], userRating: 4.5, reviewScore: 2.5,
    createdAt: '2026-01-01', updatedAt: '2026-11-01' },
  { id: 'game', title: 'Space Game', mediaType: 'Game', status: 'Active',
    genres: ['Sci-Fi'], tags: [], tropes: [], createdAt: '2026-01-01', updatedAt: '2026-11-01' },
];
function log(id: string, mediaId: string, date: string, delta: number, note = '', location = ''): ProgressLog {
  return { id, mediaId, timestamp: date, delta, note, location,
    metricType: mediaId === 'book' ? 'pagesRead' : 'playtimeHours' };
}
const logs = [
  log('one','book','2026-10-20T12:00:00Z',160,'I enjoyed this mystery far more than I expected.','Hotel'),
  log('two','book','2026-10-21T12:00:00Z',110,'','Train'),
  log('three','game','2026-10-22T12:00:00Z',2,'The atmosphere was memorable.','Hotel'),
];
const args = { timeframe: 'week' as const, timeId: '2026-W43', logs, history: logs, media };

test('Wrapped evidence is independent of recap content', () => {
  const evidence = buildWrappedEvidence(args);
  assert.equal(evidence.timeId, '2026-W43');
  assert.ok(evidence.facts.some(f => f.kind === 'journal' && f.quote?.includes('mystery')));
  assert.ok(evidence.facts.some(f => f.kind === 'location' && f.evidence.includes('Hotel')));
  assert.ok(evidence.facts.some(f => f.kind === 'taste' && f.bars?.length === 2));
  assert.equal(evidence.facts.filter(f => f.kind === 'outlier').length, 0);
  assert.equal(evidence.facts.find(f => f.id === 'media-0')?.title, 'Train Story');
});

test('Comparisons require three actual active historical periods', () => {
  const evidence = buildWrappedEvidence({ ...args, history: [
    ...logs,
    log('old1','game','2026-10-14T12:00:00Z',12),
    log('old2','game','2026-10-07T12:00:00Z',12),
    log('old3','game','2026-09-30T12:00:00Z',12),
  ] });
  assert.ok(evidence.facts.some(f => f.id === 'outlier-Book'));
});

test('AI director authors its own original story and selects verified visuals', () => {
  const evidence = buildWrappedEvidence(args);
  const story = normalizeWrappedStory({
    title: 'A Reading Paradox',
    dek: 'Why hotels and mysteries suddenly collided.',
    scenes: [
      { kind: 'opening', title: 'The Hospitality Theory', body: 'A strange hypothesis emerges from your habits.', evidenceIds: [] },
      { kind: 'taste', title: 'The Critics Lost', body: 'You disagreed with the received wisdom.', evidenceIds: ['taste-book'] },
      { kind: 'journal', title: 'Your Own Words', body: 'Your own verdict offers a clue.', evidenceIds: ['journal-one'] },
      { kind: 'closing', title: 'The Unsolved Case', body: 'The story ends with a question worth carrying.', evidenceIds: [] },
    ],
  }, evidence, media);
  assert.equal(story.version, 2);
  assert.equal(story.scenes[1].bars?.[0].note, '4.5 / 5');
  assert.equal(story.scenes[2].quote, logs[0].note);
  assert.equal(story.scenes[0].body, 'A strange hypothesis emerges from your habits.');
});

test('Invented fact IDs and unsupported chart types are rejected', () => {
  const evidence = buildWrappedEvidence(args);
  const start = { kind: 'opening', title: 'An Opening', body: 'A first scene.', evidenceIds: [] };
  const end = { kind: 'closing', title: 'Ending', body: 'A last scene.', evidenceIds: [] };
  const withMiddle = (middle: any) => ({ scenes: [start, middle, end] });
  assert.throws(() => normalizeWrappedStory(withMiddle({
    kind: 'insight', title: 'Invented', body: 'No basis.', evidenceIds: ['not-in-the-data'],
  }), evidence, media));
  assert.throws(() => normalizeWrappedStory(withMiddle({
    kind: 'outlier', title: 'Fake baseline', body: 'Invented numbers.', evidenceIds: ['overview', 'media-0'],
  }), evidence, media));
  assert.throws(() => normalizeWrappedStory(withMiddle({
    kind: 'journal', title: 'Fake quote', body: 'Imaginary feeling.', evidenceIds: ['overview', 'media-0'],
  }), evidence, media));
});

test('The Director must not replace diverse evidence with the same source', () => {
  const evidence = buildWrappedEvidence(args);
  assert.throws(() => normalizeWrappedStory({ scenes: [
    { kind: 'opening', title: 'Start', body: 'Start.', evidenceIds: [] },
    { kind: 'insight', title: 'Same thing', body: 'One.', evidenceIds: ['overview'] },
    { kind: 'insight', title: 'Same again', body: 'Two.', evidenceIds: ['overview'] },
    { kind: 'closing', title: 'Finish', body: 'Finish.', evidenceIds: [] },
  ] }, evidence, media));
});
