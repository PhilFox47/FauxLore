import test from "node:test";
import assert from "node:assert/strict";
import { chooseCodexFollowUp, memoryTopicsOverlap, memoryQuality, duplicatedMemoryTopics, isGenericStructure } from "./codexQuality";

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
