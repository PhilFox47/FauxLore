import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DATA_SLIDES, isSignificantFormatShift, isSignificantTasteGap, isStrongSceneData,
  isStrongVerifiedAnalytic, normalizeVerifiedAnalytic, normalizeEditorialJob,
  evidenceStoryFunctions, requiredMonthlyPhases,
} from './wrappedEditorial';
import { buildWrappedEvidence } from './wrappedEvidence';
import { normalizeWrappedStory } from '../services/wrappedAi';
import type { WrappedEvidence } from './wrappedEvidence';
import type { MediaItem, ProgressLog } from '../types/schema';

const media: MediaItem[] = [
  { id: 'book', title: 'The Long Novel', mediaType: 'Book', status: 'Completed',
    genres: ['Thriller'], tags: [], tropes: [], createdAt: '2026-01-01', updatedAt: '2026-10-31' },
  { id: 'game', title: 'A Slow Game', mediaType: 'Game', status: 'Active',
    genres: ['Adventure'], tags: [], tropes: [], createdAt: '2026-01-01', updatedAt: '2026-10-31' },
];
const log = (id: string, mediaId: string, date: string, delta: number): ProgressLog => ({
  id, mediaId, timestamp: date + 'T12:00:00Z', delta,
  metricType: mediaId === 'book' ? 'pagesRead' : 'playtimeHours',
});
const monthLogs = [
  log('start', 'book', '2026-10-04', 100),
  log('mid', 'game', '2026-10-17', 8),
  log('end', 'book', '2026-10-28', 100),
];
const monthEvidence = () => buildWrappedEvidence({
  timeframe: 'month', timeId: '2026-10', logs: monthLogs,
  history: monthLogs, media,
});
const design = (layout = 'editorial', visual = 'none') =>
  ({ layout, palette: 'cobalt', visual, mediaIds: [], align: 'left' });
const scene = (kind: string, title: string, evidenceIds: string[], layout = 'editorial', visual = 'none') =>
  ({ kind, title, body: 'A distinct, well-supported argument about this period.', evidenceIds,
    design: design(layout, visual) });
const story = (...middle: ReturnType<typeof scene>[]) => ({
  title: 'The Entire Month', dek: 'A careful look beyond the final week.',
  scenes: [scene('opening', 'Open', [], 'cover-hero', 'cover'),
    ...middle, scene('closing', 'End', [], 'type-poster')],
});

test('weak 16-point game shift fails chart gating; major book and audiobook shifts qualify', () => {
  assert.equal(isSignificantFormatShift(.487, .327), false);
  assert.equal(isSignificantFormatShift(.26, .02), true);
  assert.equal(isSignificantFormatShift(.24, .05), true);
  assert.equal(isSignificantFormatShift(.15, .40), true);
  assert.equal(isSignificantFormatShift(.44, .30), false);
  assert.equal(isSignificantTasteGap(5, 4.5), false);
  assert.equal(isSignificantTasteGap(5, 3.5), true);
  assert.deepEqual(MAX_DATA_SLIDES, { week: 1, month: 2, year: 3 });
});

test('legacy chart numbers cannot sneak a weak game shift into a visual-only reroll', () => {
  assert.equal(isStrongSceneData('outlier', [
    { value: 32.7 }, { value: 48.7 },
  ]), false);
  assert.equal(isStrongSceneData('outlier', [
    { value: 2 }, { value: 25.7 },
  ]), true);
  assert.equal(isStrongSceneData('taste', [
    { value: 100 }, { value: 90 },
  ]), false);
  assert.equal(isStrongSceneData('taste', [
    { value: 100 }, { value: 70 },
  ]), true);
  assert.equal(isStrongSceneData('insight', [
    { value: 0 }, { value: 100 },
  ]), false);
});

test('monthly evidence exposes meaningful early, middle and late periods and actual last-week share', () => {
  const evidence = monthEvidence();
  assert.deepEqual(evidence.monthlyCoverage?.requiredPhases, ['early', 'middle', 'late']);
  assert.equal(evidence.monthlyCoverage?.minPhaseScenes, 2);
  assert.ok((evidence.monthlyCoverage?.lastWeekShare || 0) < .60);
  for (const phase of ['early', 'middle', 'late']) {
    const fact = evidence.facts.find(item => item.id === 'month-' + phase);
    assert.ok(fact);
    assert.equal(fact.phase, phase);
    assert.match(fact.evidence, /Most substantial recorded works/);
  }
});

test('valid monthly stories cite real activity from the entire month', () => {
  const result = normalizeWrappedStory(story(
    scene('insight', 'A chapter from the start', ['month-early']),
    scene('spotlight', 'The middle mattered', ['month-middle']),
    scene('insight', 'An ending worth noticing', ['month-late']),
  ), monthEvidence(), media);
  assert.equal(result.scenes.length, 5);
});

test('a monthly that looks only at the last week fails coverage', () => {
  assert.throws(() => normalizeWrappedStory(story(
    scene('insight', 'A late moment', ['month-late']),
    scene('spotlight', 'More about the ending', ['media-0']),
    scene('insight', 'Another last-week comment', ['overview']),
  ), monthEvidence(), media), /Monthly coverage missing/);
});

test('putting all monthly phases in one slide is not genuine story coverage', () => {
  assert.throws(() => normalizeWrappedStory(story(
    scene('insight', 'The entire month in a checklist', ['month-early', 'month-middle', 'month-late']),
    scene('spotlight', 'A supporting work', ['media-1']),
  ), monthEvidence(), media), /independent phase-supported scenes/);
});

test('last-week-only scenes cannot dominate a month whose final week did not dominate', () => {
  const evidence = monthEvidence();
  // These fact scopes represent verified source dates in the last seven days.
  const extra = ['late-moment-1', 'late-moment-2', 'late-moment-3'];
  const extended: WrappedEvidence = { ...evidence, facts: [...evidence.facts,
    ...extra.map(id => ({ id, kind: 'insight' as const, title: id, evidence: id, recentOnly: true }))],
  };
  assert.throws(() => normalizeWrappedStory(story(
    scene('insight', 'Beginning', ['month-early']),
    scene('insight', 'Middle', ['month-middle']),
    ...extra.map((id, index) => scene('insight', id,
      index === 0 ? [id, 'month-late'] : [id])),
  ), extended, media), /overrepresents the final seven days/);
});

test('format-share slides with different media labels still repeat ONE editorial job', () => {
  assert.deepEqual(evidenceStoryFunctions(['outlier-Book', 'outlier-Game']), ['format-share-shift']);
  const chartFacts = ['outlier-Book', 'outlier-Game'].map(id => ({
    id, kind: 'outlier' as const, title: id, evidence: 'Substantial comparison for ' + id,
    bars: [{ label: 'Before', value: 10, note: 'Before' }, { label: 'Now', value: 90, note: 'Now' }],
  }));
  const evidence: WrappedEvidence = {
    timeframe: 'month', timeId: '2026-10', bounds: { start: '2026-10-01', end: '2026-10-31' },
    editorialCalibration: '', media: [], facts: [...chartFacts],
  };
  assert.throws(() => normalizeWrappedStory(story(
    scene('outlier', 'Books rose', ['outlier-Book'], 'infographic', 'bars'),
    scene('outlier', 'Games fell', ['outlier-Game'], 'infographic', 'bars'),
  ), evidence, media), /repeats the editorial function/);
});

test('weekly stories reject two different infographic topics; monthly maximum is two', () => {
  const chartFacts = ['taste-a', 'taste-b', 'taste-c'].map(id => ({
    id, kind: 'taste' as const, title: id, evidence: id,
    bars: [{ label: 'User', value: 90, note: '4.5/5' }, { label: 'Critics', value: 50, note: '2.5/5' }],
  }));
  const weekly: WrappedEvidence = {
    timeframe: 'week', timeId: '2026-W44', bounds: { start: '2026-10-26', end: '2026-11-01' },
    editorialCalibration: '', media: [], facts: chartFacts,
  };
  const slides = chartFacts.map(f => scene('taste', f.title, [f.id], 'infographic', 'bars'));
  assert.throws(() => normalizeWrappedStory(story(slides[0], slides[1]), weekly, media),
    /Infographic budget exceeded/);
  assert.throws(() => normalizeWrappedStory(story(...slides),
    { ...weekly, timeframe: 'month', timeId: '2026-10' }, media), /Infographic budget exceeded/);
});

test('weak critic disagreement does not create an eligible chart, but still keeps the review evidence', () => {
  const sources = media.map(m => ({ ...m, userRating: 4.5, reviewScore: 4.0 }));
  const evidence = buildWrappedEvidence({
    timeframe: 'week', timeId: '2026-W44', logs: [
      log('one', 'book', '2026-10-27', 30),
      log('two', 'game', '2026-10-28', 1),
    ], history: [], media: sources,
  });
  const taste = evidence.facts.find(f => f.id === 'taste-book');
  assert.equal(taste?.kind, 'insight');
  assert.equal(taste?.bars, undefined);
  assert.match(taste?.evidence || '', /NOT an infographic-worthy disagreement/);
});

test('monthly phase requirements skip genuinely empty or tiny calendar slices', () => {
  assert.deepEqual(requiredMonthlyPhases({ early: .05, middle: .15, late: .8 }), ['middle', 'late']);
  assert.deepEqual(requiredMonthlyPhases({ early: 0, middle: 0, late: 1 }), ['late']);
});

test('a routine 33-to-49 percent gaming shift never becomes a Wrapped outlier card', () => {
  const earlierMonths = ['2026-04-13', '2026-05-13', '2026-06-13', '2026-07-13', '2026-08-13'];
  const history = earlierMonths.flatMap((date, i) => [
    log('past-book-' + i, 'book', date, 67),
    log('past-game-' + i, 'game', date, 2.75),
  ]);
  const current = [
    log('september-book', 'book', '2026-09-12', 51),
    log('september-game', 'game', '2026-09-22', 49 / 12),
  ];
  const evidence = buildWrappedEvidence({
    timeframe: 'month', timeId: '2026-09', logs: current,
    history: [...history, ...current], media,
  });
  assert.equal(evidence.facts.some(f => f.id === 'outlier-Game'), false);
  assert.equal(evidence.facts.some(f => f.id === 'outlier-Book'), false);
  assert.doesNotMatch(evidence.editorialCalibration, /REAL FORMAT SHIFTS/);
});


test('four analytical treatments have strict, distinct, source-bounded eligibility', () => {
  const analytic = (kind: 'shift' | 'duel' | 'arc' | 'dominance', values: number[]) =>
    normalizeVerifiedAnalytic({ kind, unit: 'percent',
      points: values.map((value, i) => ({ label: 'Metric ' + i, value, note: 'Verified' })),
    });
  assert.equal(isStrongVerifiedAnalytic(analytic('shift', [2, 26])), true);
  assert.equal(isStrongVerifiedAnalytic(analytic('shift', [32.7, 48.7])), false);
  assert.equal(isStrongVerifiedAnalytic(analytic('duel', [100, 70])), true);
  assert.equal(isStrongVerifiedAnalytic(analytic('duel', [90, 80])), false);
  assert.equal(isStrongVerifiedAnalytic(analytic('dominance', [67, 33])), true);
  assert.equal(isStrongVerifiedAnalytic(analytic('dominance', [45, 55])), false);
  assert.equal(isStrongVerifiedAnalytic(analytic('arc', [18, 57, 25])), true);
  assert.equal(isStrongVerifiedAnalytic(analytic('arc', [31, 36, 33])), false);
  assert.throws(() => normalizeVerifiedAnalytic({ kind: 'arc', unit: 'percent',
    points: [{ label: 'First', value: 40, note: '' }] }), /point count/);
  assert.throws(() => normalizeVerifiedAnalytic({ kind: 'shift', unit: 'percent',
    points: [{ label: 'A', value: 20, note: '' },
      { label: 'B', value: 1000, note: '' }] }), /Invalid analytic point/);
});

test('director gets app-sanitized analytics even if AI fabricates values in its story JSON', () => {
  const evidence = monthEvidence();
  const actual = { kind: 'dominance' as const, unit: 'percent' as const,
    points: [
      { label: 'Long Novel', value: 80, note: 'Actual share' },
      { label: 'All other works', value: 20, note: 'Other share' },
    ],
  };
  evidence.facts.push({ id: 'focus-0', kind: 'insight', title: 'Verified focus',
    evidence: 'Long Novel accounts for 80% of recorded progress.', analytic: actual });
  const sceneWithFakeNumbers = {
    ...scene('insight', 'A single powerful focus', ['focus-0', 'month-early'],
      'infographic', 'none'), editorialJob: 'data-reveal',
    analytic: { kind: 'dominance', unit: 'percent',
      points: [{ label: 'Invented', value: 99, note: '' },
        { label: 'Other', value: 1, note: '' }] },
  };
  const output = normalizeWrappedStory(story(
    sceneWithFakeNumbers, scene('insight', 'A different month section', ['month-middle']),
    scene('insight', 'Final chapter', ['month-late']),
  ), evidence, media);
  assert.deepEqual(output.scenes[1].analytic, actual);
  assert.equal(output.scenes[1].editorialJob, 'data-reveal');
  assert.equal(normalizeEditorialJob('random-html', 'insight'), 'pattern');
  assert.equal(normalizeEditorialJob('verdict', 'opening'), 'hook');
});

test('month clusters include real media, locations and direct reflections by phase', () => {
  const logs = [
    { ...log('early', 'book', '2026-10-02', 100),
      thoughts: 'This mystery surprised me.', location: 'Train' },
    { ...log('middle', 'game', '2026-10-15', 8),
      location: 'Home' },
    { ...log('late', 'book', '2026-10-28', 200),
      thoughts: 'The ending was tense.', location: 'Hotel' },
  ];
  const data = buildWrappedEvidence({
    timeframe: 'month', timeId: '2026-10',
    logs, history: logs, media,
  });
  const early = data.monthlyCoverage?.clusters?.find(c => c.phase === 'early');
  const middle = data.monthlyCoverage?.clusters?.find(c => c.phase === 'middle');
  const late = data.monthlyCoverage?.clusters?.find(c => c.phase === 'late');
  assert.equal(early?.activeDays, 1);
  assert.equal(early?.leadingWorks[0]?.title, 'The Long Novel');
  assert.equal(early?.journalHighlights[0]?.quote, 'This mystery surprised me.');
  assert.deepEqual(middle?.places, ['Home']);
  assert.deepEqual(late?.places, ['Hotel']);
  assert.equal(late?.journalHighlights[0]?.quote, 'The ending was tense.');
});
