import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStory } from './wrapped';

const design = (layout: string, visual = 'none') => ({
  layout, palette: 'cobalt', visual, align: 'left', mediaIds: ['book'],
});
const story = () => ({
  version: 2, title: 'One Weird Week', dek: 'A separately edited story.',
  scenes: [
    { id: 'wrapped-0', kind: 'opening', eyebrow: 'START', title: 'Arrival', body: 'The opening scene.', evidenceIds: [], design: design('cover-hero', 'cover') },
    { id: 'wrapped-1', kind: 'insight', eyebrow: 'DISCOVERY', title: 'Unlikely bedfellows', body: 'An original insight.', evidenceIds: ['place-0'],
      design: design('cover-wall', 'mosaic'),
      artworks: [{ id: 'book', title: 'Night Train', type: 'Book', cover: 'https://example.com/train.jpg' }],
    },
    { id: 'wrapped-2', kind: 'closing', eyebrow: 'END', title: 'Last Call', body: 'An original ending.', evidenceIds: [], design: design('type-poster') },
  ],
});

test('API saves director design and verified image references', () => {
  const value = validateStory(story());
  assert.equal(value.scenes[1].design.layout, 'cover-wall');
  assert.equal(value.scenes[1].artworks[0].cover, 'https://example.com/train.jpg');
  assert.equal(value.scenes.length, 3);
});

test('API keeps compatibility with stories saved before the design system', () => {
  const old = story();
  delete (old.scenes[0] as any).design;
  delete (old.scenes[1] as any).design;
  delete (old.scenes[2] as any).design;
  assert.equal(validateStory(old).scenes[0].design, undefined);
});

test('API rejects invalid layouts, arbitrary CSS and dangerous artwork schemes', () => {
  const invalid = story();
  (invalid.scenes[0].design as any).layout = '<style>everything</style>';
  assert.throws(() => validateStory(invalid));
  const bad = story();
  (bad.scenes[1] as any).artworks[0].cover = 'javascript:alert(1)';
  assert.throws(() => validateStory(bad));
});
