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
  assert.match(brief, /IMMUTABLE/);
  assert.match(brief, /COMPOSE EVERY SCENE/);
  assert.match(brief, /canGenerateOriginalSceneArt/);
  assert.match(brief, /THE STORY\x27S MEANING COMES FIRST/i);
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

test("director allows all scenes but rejects proposals beyond the global 14-scene cap", () => {
  const input = { compositions: Array.from({ length: 15 }, (_, n) => ({ sceneId: String(n), composition })) };
  assert.throws(() => applyWrappedVisualCompositions(story, input));
});

test("director accepts meaningful original art concepts on eligible interior scenes", () => {
  const illustrated = {
    version: 1,
    backdrop: "cinematic",
    artConcept: "A lone clock suspended above a silent racetrack at dawn",
    elements: [
      element("hero", "title", 6, 8, 70, 25),
      element("copy", "body", 6, 61, 56, 31),
      element("art", "scene-art", 62, 8, 34, 85),
    ],
  };
  const result = applyWrappedVisualCompositions(story, {
    compositions: [{ sceneId: "wrapped-1", composition: illustrated }],
  });
  assert.match(result.scenes[1].composition?.artConcept || "", /silent racetrack/);
  assert.equal(result.scenes[1].composition?.elements[2].type, "scene-art");
});

test("second-pass visual director describes explicit safe cinematic versus data stages", () => {
  const brief = wrappedVisualDirectorBrief(story);
  assert.match(brief, /CINEMATIC EDITORIAL DIRECTION/);
  assert.match(brief, /textSide/);
  assert.match(brief, /imageFocus/);
  assert.match(brief, /DATA means a verified comparison/);
  assert.match(brief, /TYPOGRAPHY is a deliberately quiet/);
  assert.match(brief, /BLEEDS edge-to-edge|bleeds edge-to-edge/i);
});

test("model's editorial staging is normalized without allowing executable design fields", () => {
  const proposal = {
    ...composition,
    direction: { presentation: "data", textSide: "left", textPosition: "middle", imageFocus: "right",
      css: "position:fixed;inset:0", eventHandler: "alert(1)" },
  };
  const directed = applyWrappedVisualCompositions(story, {
    compositions: [{ sceneId: "wrapped-1", composition: proposal }],
  });
  const clean = directed.scenes[1].composition!;
  assert.equal(clean.direction?.presentation, "data");
  assert.equal(clean.direction?.textSide, "left");
  assert.equal("css" in (clean.direction || {}), false);
  assert.equal("eventHandler" in (clean.direction || {}), false);
  assert.deepEqual(directed.scenes[1].bars, story.scenes[1].bars);
});
