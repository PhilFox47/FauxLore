import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeVisualSelfMode, normalizeVisualSelfDescription,
  visualSelfImageClause, redactVisualSelfForDiagnostics,
  VISUAL_SELF_DESCRIPTION_LIMIT,
} from "./visualSelf";
import { buildWrappedSceneArtPrompt } from "./wrappedSceneArt";

const personal = "Man in his late twenties, short light-brown hair, short beard, blue left eye, green right eye";

test("visual likeness defaults to opt-out and requires explicit appearance details", () => {
  assert.equal(normalizeVisualSelfMode(undefined), "never");
  assert.equal(normalizeVisualSelfMode("evil"), "never");
  assert.equal(normalizeVisualSelfMode("auto"), "auto");
  assert.equal(normalizeVisualSelfMode("prefer"), "prefer");
  assert.equal(visualSelfImageClause(), "");
  assert.equal(visualSelfImageClause({ visualSelfInsertMode: "never", visualSelfDescription: personal }), "");
  assert.equal(visualSelfImageClause({ visualSelfInsertMode: "auto", visualSelfDescription: "" }), "");
});

test("auto is genuinely conditional and will not add a generic human to a scenic idea", () => {
  const clause = visualSelfImageClause({ visualSelfInsertMode: "auto", visualSelfDescription: personal });
  assert.match(clause, /ONLY WHEN a human protagonist naturally/);
  assert.match(clause, /Do not add a person simply to satisfy/);
  assert.match(clause, /blue left eye, green right eye/);
  assert.match(clause, /Never turn an unrelated character/);
});

test("prefer favors the owner only when a human character fits", () => {
  const clause = visualSelfImageClause({ visualSelfInsertMode: "prefer", visualSelfDescription: personal });
  assert.match(clause, /PREFER the account owner/);
  assert.match(clause, /not a requirement/);
  assert.match(clause, /recognisable fictional character must still take precedence/);
});

test("descriptions are limited and control characters cannot inject extra prompt paragraphs", () => {
  assert.equal(normalizeVisualSelfDescription("  brown hair\n\n<scripting>  short beard "), "brown hair scripting short beard");
  assert.equal(normalizeVisualSelfDescription("x".repeat(4000)).length, VISUAL_SELF_DESCRIPTION_LIMIT);
  assert.equal(normalizeVisualSelfDescription({ fake: true }), "");
});

test("private likeness text is stripped from exportable image diagnostics, but other art direction survives", () => {
  const personalClause = visualSelfImageClause({ visualSelfInsertMode: "prefer", visualSelfDescription: personal });
  const prompt = "One emotional title illustration.\n\n" + personalClause + "\n\nHorizontal 3:2 frame.";
  const safe = redactVisualSelfForDiagnostics(prompt);
  assert.doesNotMatch(safe, /blue left eye|light-brown hair|late twenties/);
  assert.match(safe, /appearance guidance redacted/);
  assert.match(safe, /Horizontal 3:2 frame/);
  assert.equal(redactVisualSelfForDiagnostics("ordinary loot render"), "ordinary loot render");
});

test("chapter art includes identity guidance only when enabled; original scene concept stays primary", () => {
  const issue = { title: "A Week in Transit", dek: "A train, an audiobook and some unexpected symmetry." };
  const scene = {
    kind: "location" as const, title: "A train on a train",
    body: "Listened to a book while travelling.",
    composition: { version: 1 as const, backdrop: "cinematic" as const,
      elements: [], artConcept: "A quiet compartment with a view out the window" },
  };
  const defaultPrompt = buildWrappedSceneArtPrompt(issue, scene);
  assert.doesNotMatch(defaultPrompt, /OPTIONAL USER LIKENESS/);
  const auto = buildWrappedSceneArtPrompt(issue, scene,
    { visualSelfInsertMode: "auto", visualSelfDescription: personal });
  assert.match(auto, /A quiet compartment/);
  assert.match(auto, /OPTIONAL USER LIKENESS/);
  assert.match(auto, /short beard/);
  const off = buildWrappedSceneArtPrompt(issue, scene,
    { visualSelfInsertMode: "never", visualSelfDescription: personal });
  assert.doesNotMatch(off, /short beard/);
});
