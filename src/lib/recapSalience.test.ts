import test from 'node:test';
import assert from 'node:assert/strict';
import type { MediaItem, ProgressLog } from '../types/schema';
import { analyzeRecapSalience, recapSalienceBrief, selectRecapEditorialCandidates } from './recapSalience';
import { buildWrappedEvidence } from './wrappedEvidence';

const media: MediaItem[] = [
  { id: 'pyraplex', title: 'Pyraplex', mediaType: 'Game', status: 'Active',
    genres: [], tags: [], tropes: [], createdAt: '2026-01-01', updatedAt: '2026-10-31' },
  { id: 'moon', title: 'To the Moon', mediaType: 'Game', status: 'Completed',
    genres: [], tags: [], tropes: [], createdAt: '2026-01-01', updatedAt: '2026-10-31' },
  { id: 'unrated', title: 'No Reflection', mediaType: 'Game', status: 'Active',
    genres: [], tags: [], tropes: [], createdAt: '2026-01-01', updatedAt: '2026-10-31' },
];

const log = (id: string, mediaId: string, hours: number, patch: Partial<ProgressLog> = {}): ProgressLog =>
  ({ id, mediaId, timestamp: '2026-10-22T14:00:00.000Z', delta: hours,
    metricType: 'playtimeHours', ...patch });
const logs: ProgressLog[] = [
  log('p1','pyraplex',12,{sessionEnjoyment:4,sessionImpact:1,moodlets:['passing-time','unwinding']}),
  log('p2','pyraplex',12,{sessionEnjoyment:5,sessionImpact:1,moodlets:['passing-time']}),
  log('p3','pyraplex',12,{sessionEnjoyment:4,sessionImpact:2,moodlets:['passing-time']}),
  log('m1','moon',2,{sessionEnjoyment:3,sessionImpact:5,moodlets:['moving','thought-provoking'],
    thoughts:'This short experience hit much harder than the longer ones.'}),
  log('u1','unrated',2),
];

test('high-impact short experience outranks a high-volume time-filler for editorial candidacy', () => {
  const all = analyzeRecapSalience({logs,media});
  const moon = all.find(s=>s.mediaId==='moon')!;
  const pyraplex = all.find(s=>s.mediaId==='pyraplex')!;
  assert.ok(pyraplex.pages > moon.pages * 10);
  assert.equal(moon.resonance,'high');
  assert.equal(moon.contrast,'quiet-standout');
  assert.equal(pyraplex.contrast,'high-volume-low-impact');
  assert.equal(pyraplex.averageEnjoyment,4.3);
  assert.equal(pyraplex.averageImpact,1.3);
  assert.equal(selectRecapEditorialCandidates(all)[0].mediaId, 'moon');
  const brief = recapSalienceBrief(all);
  assert.match(brief,/little time, strong reported impact/);
  assert.match(brief,/high time investment, low reported impact/);
  assert.match(brief,/Moving x1/);
});

test('missing impact never becomes low impact or a neutral mood', () => {
  const unrated = analyzeRecapSalience({ logs, media }).find(s=>s.mediaId==='unrated')!;
  assert.equal(unrated.averageImpact,null);
  assert.equal(unrated.resonance,'unknown');
  assert.deepEqual(unrated.moodlets,[]);
  assert.match(recapSalienceBrief([unrated]),/impact not rated \(UNKNOWN, not low\)/);
});

test('Wrapped evidence includes the low-volume emotional work as verified, citeable source material', () => {
  const evidence = buildWrappedEvidence({
    timeframe:'week',timeId:'2026-W43',logs,history:logs,media,
  });
  assert.equal(evidence.facts.find(f=>f.id==='media-0')?.mediaId,'pyraplex');
  assert.ok(evidence.facts.some(f=>f.kind==='spotlight' && f.mediaId==='moon'));
  const resonance = evidence.facts.find(f=>f.id==='session-resonance-moon');
  assert.ok(resonance);
  assert.match(resonance.evidence,/peak 5\/5/);
  assert.match(resonance.evidence,/Moving/);
  assert.match(evidence.editorialSalience,/To the Moon/);
  assert.match(evidence.editorialSalience,/Pyraplex/);
});

test('older months without impact data still offer minor work candidates, without inventing feelings', () => {
  const oldMedia: MediaItem[] = [
    { ...media[0], id: 'long-a', title: 'Long Game A' },
    { ...media[0], id: 'long-b', title: 'Long Game B' },
    { ...media[0], id: 'long-c', title: 'Long Game C' },
    { ...media[0], id: 'little', title: 'Short Game' },
  ];
  const oldLogs = [
    log('la', 'long-a', 15, { timestamp: '2026-05-02T12:00:00Z' }),
    log('lb', 'long-b', 13, { timestamp: '2026-05-12T12:00:00Z' }),
    log('lc', 'long-c', 14, { timestamp: '2026-05-23T12:00:00Z' }),
    log('ll', 'little', 1, { timestamp: '2026-05-06T12:00:00Z' }),
  ];
  const signals = analyzeRecapSalience({ logs: oldLogs, media: oldMedia });
  const picked = selectRecapEditorialCandidates(signals);
  assert.ok(picked.some(s => s.mediaId === 'little'));
  assert.equal(signals.find(s => s.mediaId === 'little')?.resonance, 'unknown');
  const evidence = buildWrappedEvidence({
    timeframe: 'month', timeId: '2026-05', logs: oldLogs, history: oldLogs, media: oldMedia,
  });
  assert.ok(evidence.facts.some(f => f.kind === 'spotlight' && f.mediaId === 'little'));
});
