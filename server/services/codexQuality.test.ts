import test from "node:test";
import assert from "node:assert/strict";
import { chooseCodexFollowUp, memoryTopicsOverlap, memoryQuality, duplicatedMemoryTopics, isGenericStructure, verifiedResearchSource, distinctScene } from "./codexQuality";

test("two different Mako jokes share one topic without hardcoding the game", () => {
  const a = { text: "*Ascending vertical cliff face noises*", kind: "joke", why: "A fan's Mako impression." };
  const b = { text: "BOOM", kind: "joke", why: "A fan's favorite Mako quote." };
  assert.equal(memoryTopicsOverlap(a, b), true);
  assert.equal(duplicatedMemoryTopics([a, b]), 1);
  assert.ok(memoryQuality(a) > memoryQuality(b));
});

test("multiple distinct dialogue quotes from the same speaker are allowed", () => {
  const a = { text: "Quote A", kind: "quote", attribution: "Shepard" };
  const b = { text: "Quote B", kind: "quote", attribution: "Shepard" };
  assert.equal(memoryTopicsOverlap(a, b), false);
});

test("source-poor new book triggers factual research, not fabricated memories", () => {
  assert.equal(chooseCodexFollowUp({ mediaType: "Book", coverage: "moderate", characters: [{},{}],
    signatureMoments: [{}, {}, {}], flavorTexts: [] }), "facts");
  assert.equal(chooseCodexFollowUp({ mediaType: "Book", coverage: "thin", characters: [], signatureMoments: [] }), null);
});
test("well documented work gets a dedicated memory pass only if thin", () => {
  assert.equal(chooseCodexFollowUp({ mediaType: "Game", coverage: "abundant", flavorTexts: [1,2,3] }), "memories");
  assert.equal(chooseCodexFollowUp({ mediaType: "Game", coverage: "abundant", flavorTexts: [1,2,3,4,5] }), null);
});
test("bibliographic metadata is not a description of the narrative structure", () => {
  assert.equal(isGenericStructure("German thriller novel, 352 pages"), true);
  assert.equal(isGenericStructure("Short chapters and alternating perspectives with cliffhangers"), false);
});

test("verified sources must be returned by native tool, not only invented by model", () => {
  assert.equal(verifiedResearchSource("https://example.org/article", ["https://example.org/article?ref=search"]), true);
  assert.equal(verifiedResearchSource("https://fake.org/post", ["https://example.org/article"]), false);
  assert.equal(verifiedResearchSource("javascript:alert(1)", ["https://example.org/article"]), false);
});
test("new scene cannot be a near-verbatim repetition of an existing blurb beat", () => {
  assert.equal(distinctScene("The protagonist boards the night train and hears an offer concerning their missing child.", [
    "The protagonist boards the night train and hears an offer concerning their missing child."
  ]), false);
  assert.equal(distinctScene("Short chapters use switching points of view to reframe the narrator's testimony.", [
    "The protagonist boards the night train and hears an offer concerning their missing child."
  ]), true);
});
