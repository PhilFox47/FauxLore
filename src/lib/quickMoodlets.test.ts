import test from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_MOODLETS, MAX_SESSION_MOODLETS, readMoodlets, validateMoodlets } from './quickMoodlets';

test('quick catalogue includes both extreme focus modes and distinct relaxation / passing time', () => {
  assert.equal(QUICK_MOODLETS.length, 11);
  assert.ok(QUICK_MOODLETS.some(m => m.id === 'immersed'));
  assert.ok(QUICK_MOODLETS.some(m => m.id === 'distracted'));
  assert.ok(QUICK_MOODLETS.some(m => m.id === 'unwinding'));
  assert.ok(QUICK_MOODLETS.some(m => m.id === 'passing-time'));
  assert.ok(!QUICK_MOODLETS.some(m => m.id === 'normal' || m.id === 'relaxing' || m.id === 'comforting'));
  assert.equal(MAX_SESSION_MOODLETS, 4);
});

test('empty means no reported signal and unknown/duplicated/excessive tags are rejected', () => {
  assert.deepEqual(readMoodlets(null), []);
  assert.deepEqual(readMoodlets(undefined), []);
  assert.deepEqual(readMoodlets('invalid json'), []);
  assert.deepEqual(readMoodlets('["immersed","social"]'), ['immersed','social']);
  assert.deepEqual(validateMoodlets(['immersed','distracted']), ['immersed','distracted']);
  assert.equal(validateMoodlets(['immersed','immersed']), null);
  assert.equal(validateMoodlets(['fake']), null);
  assert.equal(validateMoodlets(['moving','funny','immersed','social','tense']), null);
  assert.equal(validateMoodlets('moving'), null);
});
