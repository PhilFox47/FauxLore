import test from "node:test";
import assert from "node:assert/strict";
import { wrappedVisualDirectorBrief, applyWrappedVisualCompositions } from "./wrappedVisualDirector";
import type { WrappedStory } from "./wrappedAi";

const story: WrappedStory = {
  version: 2,
  title: "A Suspicious Month",
  dek: "A month where a quiet return became the main story.",
  scenes: [
    { id: "wrapped-0", kind: "opening", eyebrow: "OPENING", title: "The Return", body: "A small beginning.", evidenceIds: [] },
    { id: "wrapped-1", kind: "taste", eyebrow: "THE CONTRAST", title: "The Critics Lost",
      body: "One particular game challenged the consensus.", evidenceIds: ["taste-1"],
      bars: [{ label: "My rating", value: 90, note: "Measured" }],
      media: { id: "media-1", title: "Space Game", type: "Game", cover: "https://example.com/space.jpg" },
    },
    { id: "wrapped-2", kind: "closing", eyebrow: "CLOSING", title: "Until Next Time", body: "A modest ending.", evidenceIds: [] },
  ],
};
const element = (id: string, type: string, x: number, y: number, w: number, h: number, extra: object = {}) =>
  ({ id, type, box: { x, y, w, h }, size: "lg", tone: "primary", motion: "rise", delay: .2, ...extra });
const composition = {
  version: 1, backdrop: "grid", elements: [
    element("title", "title", 6, 12, 58, 22),
    element("body", "body", 6, 53, 60, 27),
    element("stat", "stat", 69, 20, 24, 48, { index: 0 }),
  ],
};

test("visual director receives saved copy and ONLY verified media and numerical indexes", () => {
  const brief = wrappedVisualDirectorBrief(story);
  assert.match(brief, /The Critics Lost/);
  assert.match(brief, /Space Game/);
  assert.match(brief, /"index":0/);
  assert.match(brief, /hasVerifiedQuote/);
  assert.match(brief, /No invented achievements/);
  assert.match(brief, /Choose 2 or 3 DIFFERENT scenes/);
  assert.doesNotMatch(brief, /https:\/\/example.com/);
});

test("valid independent visual staging leaves prose, facts and story chronology unchanged", () => {
  const result = applyWrappedVisualCompositions(story, {
    compositions: [{ sceneId: "wrapped-1", composition }],
  });
  assert.equal(result.scenes.length, story.scenes.length);
  assert.equal(result.scenes[1].composition?.elements[2].type, "stat");
  assert.deepEqual(result.scenes[1].bars, story.scenes[1].bars);
  assert.equal(result.scenes[1].body, story.scenes[1].body);
  assert.equal(result.scenes[0].composition, undefined);
});

test("bad scene data is discarded, while valid siblings survive", () => {
  const output = applyWrappedVisualCompositions(story, {
    compositions: [
      { sceneId: "wrapped-0", composition: { ...composition } }, // invalid stat without verified bars
      { sceneId: "wrapped-1", composition },
      { sceneId: "not-an-existing-scene", composition },
    ],
  });
  assert.equal(output.scenes[0].composition, undefined);
  assert.equal(output.scenes[1].composition?.backdrop, "grid");
  assert.equal(output.scenes[2].composition, undefined);
});

test("no one can add more than three AI-composed scenes to a Wrapped", () => {
  const input = { compositions: Array.from({ length: 9 }, (_, n) => ({ sceneId: String(n), composition })) };
  assert.throws(() => applyWrappedVisualCompositions(story, input));
});
