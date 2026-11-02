import test from 'node:test';
import assert from 'node:assert/strict';
import { imageFrameSize, imageFrameMatches, withImageFrame } from './imageFraming';

test('request sizes match both intended UI canvases on both providers', () => {
  assert.equal(imageFrameSize('square', 'cliProxy'), '1024x1024');
  assert.equal(imageFrameSize('landscape-3:2', 'cliProxy'), '1536x1024');
  assert.equal(imageFrameSize('square', 'nanoGpt'), '1024x1024');
  assert.equal(imageFrameSize('landscape-3:2', 'nanoGpt'), '1152x768');
});

test('instructions prevent vertical composition and preserve safe margins', () => {
  const boss = withImageFrame('A charging creature in comic style.', 'landscape-3:2');
  const loot = withImageFrame('A weathered flask on a neutral background.', 'square');
  assert.match(boss, /HORIZONTAL LANDSCAPE/);
  assert.match(boss, /3:2/);
  assert.match(boss, /comfortable margins/);
  assert.match(loot, /SQUARE 1:1/);
  assert.match(loot, /complete silhouette/);
  assert.equal(withImageFrame(boss, 'landscape-3:2'), boss);
});

test('provider result aspect-ratio checks accept matching frames and reject portrait images', () => {
  assert.equal(imageFrameMatches('square', 1024, 1024), true);
  assert.equal(imageFrameMatches('square', 1024, 1536), false);
  assert.equal(imageFrameMatches('landscape-3:2', 1536, 1024), true);
  assert.equal(imageFrameMatches('landscape-3:2', 1152, 768), true);
  assert.equal(imageFrameMatches('landscape-3:2', 1024, 768), false);
  assert.equal(imageFrameMatches('landscape-3:2', 1024, 1536), false);
});
