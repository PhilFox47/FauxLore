import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAchievementPrompt, buildAchievementSystemPrompt } from './achievementAi';
import type { StructuredRecap } from './recapAi';
import type { WrappedStory } from './wrappedAi';
import type { GeneratedAchievement } from '../lib/generatedAchievements';

const recap: StructuredRecap = {
  title: 'A Week in the Citadel',
  dek: 'Mass Effect dominated an unusually focused week.',
  theme: 'The Mass Effect marathon',
  mood: 'absorbed',
  roast: 'The Commander apparently acquired squatter rights in the Normandy.',
  chapters: [
    { heading: 'Main event', body: 'Played Mass Effect repeatedly and finished the campaign.' },
    { heading: 'Supporting cast', body: 'Also continued a smaller mystery novel.' },
  ],
  pullQuote: 'Mass Effect owned the week.',
  awards: [
    { award: 'Main Character Energy', title: 'Mass Effect', reason: 'The dominant experience.' },
  ],
  captions: {},
  lookAhead: { watchFor: 'A new game', challenge: 'Enjoy it' },
  summary: 'Mass Effect was the main focus.',
};

const wrapped: WrappedStory = {
  version: 2,
  title: 'The Normandy Has Your House Keys',
  dek: 'The same sci-fi obsession from a different angle.',
  scenes: [
    { id: 'wrapped-0', kind: 'opening', eyebrow: 'OPENING', title: 'A very long flight',
      body: 'The week began with another trip aboard the Normandy.', evidenceIds: [] },
    { id: 'wrapped-1', kind: 'spotlight', eyebrow: 'FOCUS', title: 'Mass Effect takes over',
      body: "The defining game stole nearly all of the player's attention.", evidenceIds: ['media-0'] },
    { id: 'wrapped-2', kind: 'closing', eyebrow: 'FINALE', title: 'Still in space',
      body: 'The main theme ends where it started.', evidenceIds: [] },
  ],
};

const existing: GeneratedAchievement[] = [
  { timeframe: 'month', timeId: '2026-10', position: 0, title: 'Previously In Space',
    description: 'Once loved Mass Effect.', reward: 'An imaginary star chart.',
    subject: 'Mass Effect', createdAt: '2026-10-31T00:00:00Z' },
  { timeframe: 'week', timeId: '2026-W45', position: 0, title: 'Old Week Trophy',
    description: 'Same period previous version.', reward: 'Old medal.',
    subject: 'Mystery novel', createdAt: '2026-11-02T00:00:00Z' },
];

const make = (useWrapped = true) => buildAchievementPrompt({
  timeframe: 'week', timeId: '2026-W45', recap, wrapped: useWrapped ? wrapped : null,
  context: 'Verified logs: Mass Effect campaign completed. Two hours of a mystery book.',
  previous: existing,
});

test('achievement rules explicitly prioritize souvenirs of the central Recap and Wrapped beats', () => {
  const rules = buildAchievementSystemPrompt();
  assert.match(rules, /lasting SOUVENIRS/);
  assert.match(rules, /MOST DEFINING verified event/);
  assert.match(rules, /first and only achievement.*CORE highlight/);
  assert.match(rules, /Subject overlap is a FEATURE/);
  assert.match(rules, /Avoid redundant topics AMONG the achievements/);
  assert.match(rules, /DO NOT invent player intention/);
  assert.doesNotMatch(rules, /Find an overlooked contradiction/);
  assert.doesNotMatch(rules, /Never reuse a setup, title or joke from the recap/);
});

test('recap titles, theme, main event and recap awards are positive references', () => {
  const prompt = make();
  assert.match(prompt, /POSITIVE INSPIRATION/);
  assert.match(prompt, /A Week in the Citadel/);
  assert.match(prompt, /The Mass Effect marathon/);
  assert.match(prompt, /Played Mass Effect repeatedly and finished the campaign/);
  assert.match(prompt, /Main Character Energy for Mass Effect/);
  assert.match(prompt, /Verified logs: Mass Effect campaign completed/);
  assert.doesNotMatch(prompt, /ALREADY COVERED IN THE RECAP/);
  assert.doesNotMatch(prompt, /do NOT paraphrase this or reuse its punchlines/);
});

test('available Wrapped themes are also honored; missing Wrapped uses Recap instead', () => {
  const withWrapped = make(true);
  assert.match(withWrapped, /The Normandy Has Your House Keys/);
  assert.match(withWrapped, /Mass Effect takes over \[evidence: media-0\]/);
  const withoutWrapped = make(false);
  assert.doesNotMatch(withoutWrapped, /Normandy Has Your House Keys/);
  assert.match(withoutWrapped, /No separate Wrapped story is available yet/);
  assert.match(withoutWrapped, /The Mass Effect marathon/);
});

test('older achievements limit recycled jokes, not reused meaningful source topics', () => {
  const prompt = make();
  assert.match(prompt, /NOT recurring subjects when this period has new evidence/);
  assert.match(prompt, /Previously In Space \[Mass Effect\]/);
  assert.doesNotMatch(prompt, /Old Week Trophy/); // same period is being replaced
  assert.match(prompt, /write a new joke, even when returning to the same theme/);
});
