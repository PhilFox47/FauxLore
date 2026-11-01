import test from "node:test";
import assert from "node:assert/strict";
import { codexText, codexList } from "./codexDisplay";
test("Codex full view safely renders descriptive strings in members fields", () => {
  const value = "Several members are described in a source but not individually named.";
  assert.equal(codexText(value), value);
  assert.deepEqual(codexList(value), [value]);
  assert.equal(codexText(["Member A","Member B"]), "Member A, Member B");
});
test("Codex display handles incorrect model shapes without rendering raw React objects", () => {
  assert.deepEqual(codexList("One alias"), ["One alias"]);
  assert.equal(codexText({unexpected:"object"}), "");
  assert.equal(codexText(null), "");
  assert.equal(codexText(["One", {nested:"object"}, "Two"]), "One, Two");
});
