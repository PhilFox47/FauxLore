import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEditorialPlan, normalizeRecap } from './recapAi';
import { normalizeGeneratedAchievements } from '../lib/generatedAchievements';

test('editorial plan keeps independent supported ideas and rejects empty filler', () => {
  const plan = normalizeEditorialPlan({
    throughline: 'Away from home',
    angles: [
      { thesis: 'A different environment changes the media mix', evidence: 'Two books logged at the hotel', twist: 'An unexpected benefit of travel' },
      { thesis: 'Plot chaos is welcome when the author controls it', evidence: 'Contrasting user reviews', twist: 'The real distinction is execution' },
      { thesis: '   ', evidence: 'none', twist: 'none' },
    ],
  });
  assert.equal(plan.angles.length, 2);
  assert.equal(plan.throughline, 'Away from home');
  assert.throws(() => normalizeEditorialPlan({ angles: [{ thesis: 'Opinion only' }] }));
});

test('recap normalization permits zero awards and one meaningful observation', () => {
  const recap = normalizeRecap({
    title: 'The Train Trap',
    chapters: [{ heading: 'Reading elsewhere', body: 'An interesting opinion.' }],
    awards: [],
    roast: '',
  });
  assert.equal(recap.chapters.length, 1);
  assert.equal(recap.awards.length, 0);
  assert.equal(recap.summary, 'An interesting opinion.');
  assert.equal(recap.roast, '');
});

test('achievement normalization preserves variable length and requires original titles', () => {
  const results = normalizeGeneratedAchievements({ achievements: [
    { title: 'Unscheduled Detour', description: 'A short jab.', reward: 'Absolutely nothing.', subject: 'Playing five games' },
  ] });
  assert.equal(results.length, 1);
  assert.equal(results[0].reward, 'Absolutely nothing.');
  assert.throws(() => normalizeGeneratedAchievements({ achievements: [
    { title: 'Repeat', description: 'A', reward: 'Nothing' },
    { title: 'repeat', description: 'B', reward: 'Still nothing' },
  ] }));
});
