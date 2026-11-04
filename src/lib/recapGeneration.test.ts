import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMissingRecapParts, getMissingRecapParts } from './recapGeneration';

const deepDive = { title: 'Saved Deep Dive' };
const wrapped = { title: 'Saved Wrapped' };

test('no generation targets are offered before both parts have been checked', () => {
  assert.deepEqual(getMissingRecapParts(undefined, null, true), []);
  assert.deepEqual(getMissingRecapParts(null, null, false), []);
  assert.deepEqual(getMissingRecapParts(deepDive, null, false), []);
});

test('missing targets are determined independently for past weeks, months and years', () => {
  assert.deepEqual(getMissingRecapParts(null, null, true), ['deep-dive', 'wrapped']);
  assert.deepEqual(getMissingRecapParts(deepDive, null, true), ['wrapped']);
  assert.deepEqual(getMissingRecapParts(null, wrapped, true), ['deep-dive']);
  assert.deepEqual(getMissingRecapParts(deepDive, wrapped, true), []);
});

test('one explicit click creates both missing parts in order', async () => {
  const generated: string[] = [];
  await generateMissingRecapParts(['deep-dive', 'wrapped'], {
    deepDive: async () => { generated.push('deep-dive'); },
    wrapped: async () => { generated.push('wrapped'); },
  });
  assert.deepEqual(generated, ['deep-dive', 'wrapped']);
});

test('one explicit click never rewrites existing parts', async () => {
  const generated: string[] = [];
  const handlers = {
    deepDive: async () => { generated.push('deep-dive'); },
    wrapped: async () => { generated.push('wrapped'); },
  };
  await generateMissingRecapParts(getMissingRecapParts(deepDive, null, true), handlers);
  assert.deepEqual(generated, ['wrapped']);
  generated.length = 0;
  await generateMissingRecapParts(getMissingRecapParts(null, wrapped, true), handlers);
  assert.deepEqual(generated, ['deep-dive']);
  generated.length = 0;
  await generateMissingRecapParts(getMissingRecapParts(deepDive, wrapped, true), handlers);
  assert.deepEqual(generated, []);
});
