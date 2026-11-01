import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFlavorTexts } from "./codex";

test("Sovereign is not mistaken for IGN, while IGN coverage is still filtered", () => {
  const memories = normalizeFlavorTexts([
    { text: "I am the vanguard of your destruction.", kind: "quote", scope: "work", attribution: "Sovereign", why: "Confrontation on Virmire." },
  ], { enforceDiversity: true });
  assert.equal(memories.length, 1);
  assert.equal(memories[0].kind, "quote");

  const external = normalizeFlavorTexts([
    { text: "This is something an IGN journalist said in a review.", kind: "quote", scope: "work", attribution: "IGN review" },
  ], { enforceDiversity: true });
  assert.equal(external[0]?.kind, "reference");
});

test("Mass Effect sample keeps a real quote and one diverse Mako memory", () => {
  const memories = normalizeFlavorTexts([
    { text: "I want you to try.", kind: "quote", scope: "work", attribution: "Urdnot Wrex", why: "Wrex meets a threat of arrest." },
    { text: "I am the vanguard of your destruction.", kind: "quote", scope: "work", attribution: "Sovereign", why: "Confrontation on Virmire." },
    { text: "*Ascending vertical cliff face noises*", kind: "joke", scope: "work", why: "A fan's Mako impression." },
    { text: "BOOM", kind: "joke", scope: "work", why: "A fan's favorite Mako quote." },
  ], { enforceDiversity: true });
  assert.equal(memories.length, 3);
  assert.equal(memories.filter(m => m.kind === "quote").length, 2);
  assert.ok(memories.some(m => m.text.includes("cliff face")));
  assert.ok(!memories.some(m => m.text === "BOOM"));
});
