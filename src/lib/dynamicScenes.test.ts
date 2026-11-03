import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDynamicScene, safeDynamicScene, imageFramingGuidance } from "./dynamicScenes";
import type { StoryScene } from "./storyDiscovery";

const scene: StoryScene = {
  id: "wrapped-1", kind: "insight", eyebrow: "A STRANGE PATTERN",
  title: "The Week Turned Sideways", body: "A surprising pattern emerged.",
  media: { id: "real", title: "Mass Effect", cover: "https://example.com/cover.jpg", type: "Game" },
  bars: [{ label: "Games", value: 75, note: "Verified distribution" }],
  beats: [{ label: "Tuesday", title: "The Turn", detail: "Verified diary event" }],
  quote: "A verified personal note.",
};
const node = (id: string, type: string, box: object, extras: object = {}) => ({
  id, type, box, size: "lg", tone: "primary", motion: "fade", delay: 0.2, ...extras,
});
const design = (elements = [
  node("hero", "title", { x: 6, y: 12, w: 52, h: 18 }),
  node("body", "body", { x: 6, y: 41, w: 50, h: 25 }),
  node("cover", "media", { x: 66, y: 20, w: 28, h: 58 }, { mediaId: "real", motion: "float" }),
  node("data", "stat", { x: 6, y: 72, w: 30, h: 24 }, { index: 0 }),
  node("light", "shape", { x: 60, y: 2, w: 30, h: 30 }, { shape: "orb", motion: "pulse" }),
]) => ({ version: 1, backdrop: "spotlight", elements });

test("bounded compositions preserve independent placement and verified media/stats", () => {
  const cleaned = normalizeDynamicScene(design(), scene);
  assert.equal(cleaned.version, 1);
  assert.equal(cleaned.elements.length, 5);
  assert.equal(cleaned.elements[2].mediaId, "real");
  assert.equal(cleaned.elements[3].index, 0);
  assert.equal(cleaned.elements[4].shape, "orb");
  assert.deepEqual(cleaned.elements[0].box, { x: 6, y: 12, w: 52, h: 18 });
});

test("untrusted code, arbitrary CSS and URLs are never retained in a composition", () => {
  const payload: any = design();
  payload.elements[0].html = '<script>alert("steal")</script>';
  payload.elements[0].style = { position: "fixed", inset: "-99999px" };
  payload.elements[2].url = "javascript:alert(1)";
  const cleaned = normalizeDynamicScene(payload, scene);
  assert.equal("html" in cleaned.elements[0], false);
  assert.equal("style" in cleaned.elements[0], false);
  assert.equal("url" in cleaned.elements[2], false);
  assert.throws(() => normalizeDynamicScene(design([
    node("hero", "script", { x: 6, y: 12, w: 52, h: 18 }),
    node("body", "body", { x: 6, y: 41, w: 50, h: 25 }),
  ]), scene));
});

test("data and images must originate from verified scene sources", () => {
  const fakeMedia = design();
  (fakeMedia.elements[2] as any).mediaId = "not-in-this-scene";
  assert.throws(() => normalizeDynamicScene(fakeMedia, scene), /verified scene cover/);
  const fakeStat = design();
  (fakeStat.elements[3] as any).index = 100;
  assert.throws(() => normalizeDynamicScene(fakeStat, scene), /verified index/);
  const noQuote = design([...design().elements, node("quote", "quote", { x: 56, y: 75, w: 33, h: 20 })]);
  assert.throws(() => normalizeDynamicScene(noQuote, { ...scene, quote: undefined }), /verified journal/);
});

test("out-of-canvas positions, overlapping copy and unreadable compositions safely fall back", () => {
  const outside = design();
  (outside.elements[0] as any).box = { x: 80, y: 80, w: 40, h: 40 };
  assert.equal(safeDynamicScene(outside, scene), null);
  const overlapping = design();
  (overlapping.elements[1] as any).box = { x: 8, y: 12, w: 53, h: 26 };
  assert.equal(safeDynamicScene(overlapping, scene), null);
  const noHeadline = design(design().elements.filter(e => e.type !== "title"));
  assert.equal(safeDynamicScene(noHeadline, scene), null);
});

test("ambient effects apply to graphics, not perpetually animated narration", () => {
  const movingText = design();
  (movingText.elements[0] as any).motion = "float";
  assert.throws(() => normalizeDynamicScene(movingText, scene), /must not endlessly animate/);
  assert.equal(normalizeDynamicScene(design(), scene).elements[2].motion, "float");
});

test("generated title artwork can only be placed on the opening scene", () => {
  const withTitleArt = design([
    node("hero", "title", { x: 6, y: 12, w: 52, h: 18 }),
    node("body", "body", { x: 6, y: 41, w: 50, h: 25 }),
    node("art", "title-art", { x: 64, y: 4, w: 30, h: 80 }, { motion: "float" }),
  ]);
  assert.throws(() => normalizeDynamicScene(withTitleArt, scene));
  assert.equal(normalizeDynamicScene(withTitleArt, { ...scene, kind: "opening" }).elements[2].type, "title-art");
});

test("interior generated art keeps a bounded concept, never executable code or fabricated source data", () => {
  const proposed = {
    ...design([
      node("hero", "title", { x: 6, y: 12, w: 52, h: 26 }),
      node("body", "body", { x: 6, y: 52, w: 50, h: 30 }),
      node("image", "scene-art", { x: 61, y: 5, w: 35, h: 90 }),
    ]),
    artConcept: "A solitary train entering a mysterious station at midnight",
    script: "<script>alert(1)</script>",
  };
  const clean = normalizeDynamicScene(proposed, scene);
  assert.equal(clean.elements[2].type, "scene-art");
  assert.match(clean.artConcept || "", /solitary train/);
  assert.equal("script" in clean, false);
  assert.equal(normalizeDynamicScene({ ...proposed, artConcept: "<script>evil()</script>" }, scene).artConcept, undefined);
  assert.throws(() => normalizeDynamicScene({
    ...proposed, elements: [...proposed.elements, node("image2", "scene-art", { x: 1, y: 1, w: 20, h: 20 })],
  }, scene), /too cluttered/);
  assert.throws(() => normalizeDynamicScene(proposed, { ...scene, kind: "opening" }), /Interior art/);
});

test("editorial direction contains only validated enum tokens and never arbitrary CSS", () => {
  const incoming = {
    ...design(),
    direction: {
      presentation: "cinematic", textSide: "right", textPosition: "bottom",
      imageFocus: "left", style: "position:fixed", javascript: "alert(1)",
    },
  };
  const cleaned = normalizeDynamicScene(incoming, scene);
  assert.deepEqual(cleaned.direction, {
    presentation: "cinematic", textSide: "right", textPosition: "bottom", imageFocus: "left",
  });
  assert.doesNotMatch(JSON.stringify(cleaned), /position:fixed|alert\(1\)/);
  assert.equal(normalizeDynamicScene({ ...incoming,
    direction: { ...incoming.direction, presentation: "javascript" },
  }, scene).direction, undefined);
});

test("model cannot aim the dominant subject behind the headline", () => {
  const proposal = normalizeDynamicScene({
    ...design(),
    direction: { presentation: "cinematic", textSide: "right", textPosition: "middle", imageFocus: "right" },
  }, scene);
  assert.equal(proposal.direction?.imageFocus, "left");
  const framing = imageFramingGuidance(proposal.direction);
  assert.match(framing, /RIGHT 55% darker/);
  assert.match(framing, /toward the LEFT/);
});

test("opening cinematic concept can accompany the cover without invented image URLs", () => {
  const incoming = {
    ...design([
      node("hero", "title", { x: 6, y: 12, w: 65, h: 28 }),
      node("body", "body", { x: 6, y: 55, w: 60, h: 30 }),
    ]),
    direction: { presentation: "cinematic", textSide: "left", textPosition: "middle", imageFocus: "right" },
    artConcept: "A vast archive whose shelves become the rings of Saturn",
  };
  const cleaned = normalizeDynamicScene(incoming, { ...scene, kind: "opening" });
  assert.match(cleaned.artConcept || "", /rings of Saturn/);
  assert.equal(cleaned.elements.length, 2);
  assert.equal("url" in cleaned, false);
});
