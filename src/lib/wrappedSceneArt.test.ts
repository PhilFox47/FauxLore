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

test("two narrative chapter beats, never the title/closing and never all media", () => {
  assert.deepEqual(selectIllustratedScenes(scenes), ["wrapped-1","wrapped-2"]);
  assert.equal(selectIllustratedScenes(scenes, 0).length, 0);
  assert.equal(selectIllustratedScenes(scenes, 1).length, 1);
});

test("no story content flashes while its first title and two scene images render", () => {
  const initial = { scenes, coverArtStatus: "generating", sceneArtStatus: "generating", sceneArt: {} };
  assert.equal(shouldHoldWrappedForArtwork(initial), true);
  const halfway = { ...initial, coverArtUrl: "/uploads/ai-images/cover.png",
    coverArtStatus: "done", sceneArt: { "wrapped-1": "/uploads/ai-images/one.png" } };
  assert.equal(shouldHoldWrappedForArtwork(halfway), true);
  const complete = { ...halfway, sceneArt: { ...halfway.sceneArt, "wrapped-2": "/uploads/ai-images/two.png" } };
  assert.equal(shouldHoldWrappedForArtwork(complete), false);
  assert.equal(shouldHoldWrappedForArtwork({ ...initial, coverArtStatus: "failed", sceneArtStatus: "failed" }), false);
  assert.equal(shouldHoldWrappedForArtwork({ ...complete, coverArtStatus: "generating" }), false,
    "successful previous art remains visible during an explicit redraw");
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
