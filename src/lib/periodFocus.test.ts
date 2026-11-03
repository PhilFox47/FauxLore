import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMediaFocus, focusEditorialCalibration } from './periodFocus';
import { buildWrappedEvidence } from './wrappedEvidence';
import type { MediaItem, ProgressLog } from '../types/schema';

const media = [
  { id: 'book', title: 'Der Nachtzug', mediaType: 'Book', status: 'Completed' },
  ...Array.from({ length: 5 }, (_, i) => ({
    id: 'game-' + i, title: 'Game ' + i, mediaType: 'Game', status: 'Active',
  })),
] as MediaItem[];

const log = (id: string, mediaId: string, date: string, delta: number): ProgressLog => ({
  id, mediaId, timestamp: date + 'T12:00:00Z',
  metricType: mediaId === 'book' ? 'pagesRead' : 'playtimeHours',
  delta,
});

const oldDates = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27'];
const history: ProgressLog[] = oldDates.flatMap((date, week) =>
  Array.from({ length: 5 }, (_, i) => log('old-' + week + '-' + i, 'game-' + i, date, 1)),
);
const periodStart = new Date(2026, 10, 2); // Week 45, Monday.
const currentFocus: ProgressLog[] = [
  log('cur-book', 'book', '2026-11-03', 60),
  log('cur-game-0', 'game-0', '2026-11-03', 1),
  log('cur-game-1', 'game-1', '2026-11-04', 1),
];

test('focus is calibrated against previous weeks, even when several works are logged', () => {
  const focus = analyzeMediaFocus({
    timeframe: 'week', periodStart, logs: currentFocus, history, media,
  });
  assert.equal(focus.baselinePeriods, 4);
  assert.equal(focus.leadingTitle, 'Der Nachtzug');
  assert.ok(focus.leadingShare > 0.70);
  assert.ok(Math.abs((focus.baselineLeadingShare || 0) - .20) < .001);
  assert.equal(focus.unusuallyFocused, true);
  assert.ok(focus.formatShifts.some(s => s.type === 'Book' &&
    s.currentShare > .70 && s.baselineShare === 0));
  const guidance = focusEditorialCalibration(focus);
  assert.match(guidance, /UNUSUAL CONCENTRATION DETECTED/);
  assert.match(guidance, /REAL FORMAT SHIFTS/);
  assert.match(guidance, /other titles remaining in the logs do not negate the focus/i);
});

test('ordinary variety should never be framed as chaos or a special accomplishment', () => {
  const balanced = Array.from({ length: 5 }, (_, i) =>
    log('balanced-' + i, 'game-' + i, '2026-11-03', 1));
  const focus = analyzeMediaFocus({
    timeframe: 'week', periodStart, logs: balanced, history, media,
  });
  assert.equal(focus.titleCount, 5);
  assert.equal(focus.unusuallyFocused, false);
  assert.equal(focus.formatShifts.length, 0);
  const guidance = focusEditorialCalibration(focus);
  assert.match(guidance, /routine, not a discovery/);
  assert.match(guidance, /Ordinary variety is not an editorial angle/);
  assert.doesNotMatch(guidance, /UNUSUAL CONCENTRATION DETECTED/);
});

test('weak historical coverage must never justify a claim of unusual focus', () => {
  const focus = analyzeMediaFocus({
    timeframe: 'week', periodStart, logs: currentFocus,
    history: history.slice(0, 5), media,
  });
  assert.equal(focus.unusuallyFocused, false);
  assert.equal(focus.baselineLeadingShare, null);
  assert.match(focusEditorialCalibration(focus), /baseline is unavailable/);
});

test('Wrapped evidence no longer rewards same-day switching, but does carry verified focus', () => {
  const evidence = buildWrappedEvidence({
    timeframe: 'week', timeId: '2026-W45',
    logs: currentFocus, history: [...history, ...currentFocus], media,
  });
  assert.ok(evidence.facts.some(f => f.id === 'focus-0' &&
    f.evidence.includes('unusual concentration')));
  assert.ok(evidence.facts.some(f => f.id === 'outlier-Book'));
  assert.ok(evidence.facts.every(f => !f.id.startsWith('crossover-')));
  assert.match(evidence.editorialCalibration, /FauxLore tracks virtually all entertainment types/);
});

test('Wrapped retains specific place or journal evidence without manufacturing switching coincidences', () => {
  const sameDay: ProgressLog[] = [
    { ...log('one', 'book', '2026-11-03', 100), location: 'Train',
      thoughts: 'This was a compelling thriller.' },
    { ...log('two', 'game-0', '2026-11-03', 3), location: 'Train' },
  ];
  const evidence = buildWrappedEvidence({
    timeframe: 'week', timeId: '2026-W45',
    logs: sameDay, history: [...history, ...sameDay], media,
  });
  assert.ok(evidence.facts.some(f => f.kind === 'journal'));
  assert.ok(evidence.facts.some(f => f.kind === 'location'));
  assert.ok(evidence.facts.every(f => !f.id.startsWith('crossover-')));
});
