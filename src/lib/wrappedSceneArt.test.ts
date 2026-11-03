import test from "node:test";
import assert from "node:assert/strict";
import { selectIllustratedScenes, shouldHoldWrappedForArtwork, buildWrappedSceneArtPrompt } from "./wrappedSceneArt";
import type { StoryScene } from "./storyDiscovery";

const scenes: StoryScene[] = [
  { id: "wrapped-0", kind: "opening", eyebrow: "OPEN", title: "Start", body: "The premise." },
  { id: "wrapped-1", kind: "location", eyebrow: "TRAIN", title: "A train on a train",
    body: "The train and the book share a strange symmetry.", media: { id:"book", title:"Der Nachtzug", type:"Book" } },
  { id: "wrapped-2", kind: "location", eyebrow: "HOTEL", title: "Eight titles checked in",
    body: "One hotel gathered comedy and books and more." },
  { id: "wrapped-3", kind: "insight", eyebrow: "NOV", title: "Genre walls crumbled",
    body: "Several genres collided in one day." },
  { id: "wrapped-4", kind: "closing", eyebrow: "FINALE", title: "The next coincidence",
    body: "It ended with another unusual coincidence." },
];

test("up to three narrative chapter beats, never the title/closing", () => {
  assert.deepEqual(selectIllustratedScenes(scenes), ["wrapped-1","wrapped-2","wrapped-3"]);
  assert.equal(selectIllustratedScenes(scenes, 0).length, 0);
  assert.equal(selectIllustratedScenes(scenes, 1).length, 1);
});

test("story first reveal and restyles wait for title and selected chapter images", () => {
  const initial = { scenes, coverArtStatus: "generating", sceneArtStatus: "generating", sceneArt: {} };
  assert.equal(shouldHoldWrappedForArtwork(initial), true);
  const halfway = { ...initial, coverArtUrl: "/uploads/ai-images/cover.png",
    coverArtStatus: "done", sceneArt: { "wrapped-1": "/uploads/ai-images/one.png" } };
  assert.equal(shouldHoldWrappedForArtwork(halfway), true);
  const complete = { ...halfway, sceneArtStatus: "done",
    sceneArt: { ...halfway.sceneArt, "wrapped-2": "/uploads/ai-images/two.png", "wrapped-3": "/uploads/ai-images/three.png" } };
  assert.equal(shouldHoldWrappedForArtwork(complete), false);
  assert.equal(shouldHoldWrappedForArtwork({ ...initial, coverArtStatus: "failed", sceneArtStatus: "failed" }), false);
  assert.equal(shouldHoldWrappedForArtwork({ ...complete, sceneArtStatus: "generating" }), true,
    "new compositions must not flash previous chapter images during restyling");
  assert.equal(shouldHoldWrappedForArtwork({ ...complete, coverArtStatus: "generating" }), true,
    "a cinematic restyle must not show the old title image with a new text/focus layout");
});

test("chapter prompts have one strong editorial idea and never demand a source collage", () => {
  const prompt = buildWrappedSceneArtPrompt({ title: "The Geography of Taste", dek: "Places and stories" },
    { ...scenes[1], composition: {
      version: 1, backdrop: "cinematic", artConcept: "A moody train passing a bookshelf at midnight",
      elements: [],
    } });
  assert.match(prompt, /A train on a train/);
  assert.match(prompt, /moody train/);
  assert.match(prompt, /one main focal subject/i);
  assert.match(prompt, /NO text, logos/);
  assert.doesNotMatch(prompt, /draw every logged/);
});

test("image prompt and editorial layout agree on the reserved text area", () => {
  const prompt = buildWrappedSceneArtPrompt(
    { title: "The geography of books", dek: "An unusually memorable ride" },
    {
      ...scenes[1],
      composition: {
        version: 1,
        backdrop: "cinematic",
        direction: {
          presentation: "cinematic", textSide: "right",
          textPosition: "bottom", imageFocus: "left",
        },
        artConcept: "A thriller novel transforming into a night train",
        elements: [],
      },
    },
  );
  assert.match(prompt, /RIGHT 55% darker/);
  assert.match(prompt, /toward the LEFT/);
  assert.match(prompt, /FULL-BLEED/);
  assert.doesNotMatch(prompt, /positioned toward the right/);
});

test("verified data comparison scenes are not wasted as illustration calls", () => {
  const metrics: StoryScene[] = [
    scenes[0],
    { ...scenes[1], kind: "outlier" },
    { ...scenes[2], kind: "taste" },
    scenes[3],
    scenes[4],
  ];
  assert.deepEqual(selectIllustratedScenes(metrics), ["wrapped-3"]);
});
