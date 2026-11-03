import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStory, isAllowedArtworkUrl } from './wrapped';

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

test('Local cached media cover paths are allowed, but unsafe URLs remain blocked', () => {
  const hash = 'a'.repeat(40);
  const cached = '/uploads/covers/' + hash + '.webp';
  assert.equal(isAllowedArtworkUrl(cached), true);
  assert.equal(isAllowedArtworkUrl('https://example.com/art.png'), true);
  assert.equal(isAllowedArtworkUrl('http://example.com/art.jpg'), true);
  for (const bad of ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', '//evil.example/a.jpg',
    '/uploads/../admin', '/uploads/%2e%2e/admin', '/uploads/covers\\attack.jpg']) {
    assert.equal(isAllowedArtworkUrl(bad), false, bad);
  }
  const withCached = story();
  withCached.scenes[1].artworks[0].cover = cached;
  (withCached.scenes[1] as any).media = { id: 'book', title: 'Night Train', cover: cached };
  const saved = validateStory(withCached);
  assert.equal(saved.scenes[1].artworks[0].cover, cached);
  assert.equal(saved.scenes[1].media.cover, cached);
});

test('API persists bounded generated scenes and strips attempts at arbitrary HTML/CSS', () => {
  const submitted = story();
  (submitted.scenes[1] as any).composition = {
    version: 1, backdrop: 'spotlight', elements: [
      { id: 'headline', type: 'title', box: { x: 5, y: 15, w: 58, h: 20 },
        size: 'lg', tone: 'primary', motion: 'rise', delay: .2,
        html: '<script>window.alert(1)</script>', style: 'position:fixed' },
      { id: 'copy', type: 'body', box: { x: 5, y: 51, w: 58, h: 25 },
        size: 'md', tone: 'secondary', motion: 'fade', delay: .5 },
      { id: 'cover', type: 'media', box: { x: 70, y: 22, w: 24, h: 56 },
        size: 'lg', tone: 'accent', motion: 'float', delay: 0,
        mediaId: 'book', url: 'javascript:alert(2)' },
    ],
  };
  const validated = validateStory(submitted);
  const design = validated.scenes[1].composition;
  assert.equal(validated.visualRevision, 0);
  assert.equal(design.elements.length, 3);
  assert.equal(design.elements[2].mediaId, 'book');
  assert.equal('html' in design.elements[0], false);
  assert.equal('style' in design.elements[0], false);
  assert.equal('url' in design.elements[2], false);
  assert.equal(JSON.stringify(design).includes('script'), false);
});

test('API drops fabricated media, unverified stats or impossible geometry but keeps the saved story', () => {
  const submitted = story();
  (submitted.scenes[1] as any).composition = {
    version: 1, backdrop: 'grid', elements: [
      { id: 'headline', type: 'title', box: { x: 5, y: 15, w: 58, h: 20 }, size: 'lg', tone: 'primary', motion: 'rise', delay: .2 },
      { id: 'copy', type: 'body', box: { x: 5, y: 51, w: 58, h: 25 }, size: 'md', tone: 'primary', motion: 'fade', delay: .2 },
      { id: 'fake', type: 'stat', box: { x: 70, y: 22, w: 24, h: 56 }, size: 'lg', tone: 'accent', motion: 'pop', delay: 0, index: 9 },
    ],
  };
  const validated = validateStory(submitted);
  assert.equal(validated.scenes[1].composition, undefined);
  assert.equal(validated.scenes[1].title, 'Unlikely bedfellows');
  assert.equal(validated.scenes.length, 3);
});

test('server rejects data-heavy new stories even if the client claims valid compositions', () => {
  const issue: any = story();
  const chart = (id: string) => ({
    id, kind: 'taste', eyebrow: 'STATS', title: 'A critic difference',
    body: 'An evidence-linked statistical comparison.', evidenceIds: [id],
    bars: [{ label: 'User', value: 90, note: '4.5 / 5' },
      { label: 'Critics', value: 50, note: '2.5 / 5' }],
    design: design('infographic', 'bars'),
  });
  issue.scenes = [issue.scenes[0], chart('taste-a'), chart('taste-b'), issue.scenes[2]];
  assert.throws(() => validateStory(issue, 'week'), /Infographic limit exceeded/);
  assert.equal(validateStory(issue, 'month').scenes.length, 4);
  issue.scenes.splice(3, 0, chart('taste-c'));
  assert.throws(() => validateStory(issue, 'month'), /Infographic limit exceeded/);
});


test('server persists approved analytic datasets and strips arbitrary AI markup from them', () => {
  const issue: any = story();
  issue.scenes[1].kind = 'insight';
  issue.scenes[1].editorialJob = 'data-reveal';
  issue.scenes[1].design = design('infographic', 'none');
  issue.scenes[1].analytic = {
    kind: 'dominance', unit: 'percent', clientScript: '<script>alert(1)</script>',
    points: [
      { label: 'An important book', value: 73, note: 'Verified MP share', html: '<b>unsafe</b>' },
      { label: 'All others', value: 27, note: 'Remainder' },
    ],
  };
  issue.scenes[1].composition = {
    version: 1, backdrop: 'minimal',
    direction: { presentation: 'data', textSide: 'left', textPosition: 'middle',
      imageFocus: 'right', dataTreatment: 'dominance', javascript: 'alert(1)' },
    elements: [
      { id: 'title', type: 'title', box: { x: 5, y: 10, w: 60, h: 24 },
        size: 'lg', tone: 'primary', motion: 'rise', delay: .1 },
      { id: 'body', type: 'body', box: { x: 5, y: 60, w: 60, h: 25 },
        size: 'md', tone: 'secondary', motion: 'fade', delay: .3 },
    ],
  };
  const result = validateStory(issue, 'week');
  assert.equal(result.scenes[1].analytic.kind, 'dominance');
  assert.equal(result.scenes[1].editorialJob, 'data-reveal');
  assert.equal(result.scenes[1].composition.direction.dataTreatment, 'dominance');
  assert.equal(JSON.stringify(result).includes('clientScript'), false);
  assert.equal(JSON.stringify(result).includes('javascript'), false);
  assert.equal(JSON.stringify(result).includes('<script>'), false);
  assert.equal(JSON.stringify(result).includes('<b>'), false);

  issue.scenes[1].analytic.points[0].value = 200;
  assert.throws(() => validateStory(issue, 'week'), /Invalid analytic point/);
});

test('server cannot save a data stage under an unrelated analytic treatment', () => {
  const issue: any = story();
  issue.scenes[1].kind = 'insight';
  issue.scenes[1].editorialJob = 'data-reveal';
  issue.scenes[1].design = design('infographic');
  issue.scenes[1].analytic = {
    kind: 'dominance', unit: 'percent', points: [
      { label: 'A book', value: 75, note: '' },
      { label: 'Others', value: 25, note: '' },
    ],
  };
  issue.scenes[1].composition = {
    version: 1, backdrop: 'minimal',
    direction: { presentation: 'data', textSide: 'left', textPosition: 'middle',
      imageFocus: 'right', dataTreatment: 'duel' },
    elements: [
      { id: 'title', type: 'title', box: { x: 5, y: 10, w: 60, h: 24 },
        size: 'lg', tone: 'primary', motion: 'rise', delay: .1 },
      { id: 'body', type: 'body', box: { x: 5, y: 60, w: 60, h: 25 },
        size: 'md', tone: 'secondary', motion: 'fade', delay: .3 },
    ],
  };
  const saved = validateStory(issue, 'week');
  assert.equal(saved.scenes[1].composition, undefined,
    'The safe fallback drops an invalid composition, never the verified story');
});
