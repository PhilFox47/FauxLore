import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDynamicScene } from "./dynamicScenes";
import { wrappedActionImageGuidance } from "./wrappedVisualAction";
import { buildWrappedSceneArtPrompt, buildWrappedClosingTableauPrompt } from "./wrappedSceneArt";
import { buildWrappedCoverPrompt } from "../../server/services/wrappedCovers";
import { diversifyWrappedVisualPlans, wrappedVisualDirectorBrief } from "../services/wrappedVisualDirector";
import type { WrappedStory } from "../services/wrappedAi";
import type { StoryScene } from "./storyDiscovery";

const owner = {
  visualSelfInsertMode: "prefer" as const,
  visualSelfDescription: "Short light-brown hair, short beard, blue left eye and green right eye",
};
const visualPlan = {
  activityMode: "action" as const,
  castMode: "in-world-self" as const,
  camera: "low-angle" as const,
  action: "Dodge behind an open car door during a frantic fictional city firefight",
  interaction: "The car, the moving attackers and the escape route",
};
const direction = {
  presentation: "cinematic" as const, textSide: "left" as const,
  textPosition: "middle" as const, imageFocus: "right" as const,
};
const node = (id: string, type: string, box: object) => ({
  id, type, box, size: "lg", tone: "primary", motion: "fade", delay: 0,
});
const elements = [
  node("headline", "title", { x: 4, y: 10, w: 52, h: 25 }),
  node("copy", "body", { x: 4, y: 50, w: 54, h: 28 }),
];
const scene: StoryScene = {
  id: "wrapped-1", kind: "spotlight", eyebrow: "ACTION", title: "The escape",
  body: "GTA V was part of this week's progress. The chapter is about its chaotic energy.",
  media: { id: "gta", title: "Grand Theft Auto V", cover: "https://example.com/gta.jpg", type: "Game" },
};

test("visual plan survives validated composition but untrusted markup and bad enums never do", () => {
  const cleaned = normalizeDynamicScene({
    version: 1, backdrop: "cinematic", direction, visualPlan: {
      ...visualPlan, html: "<script>bad</script>", css: "position:fixed",
    }, artConcept: "A car skids across a wet Los Santos street", elements,
  }, scene);
  assert.deepEqual(cleaned.visualPlan, visualPlan);
  assert.ok(!JSON.stringify(cleaned.visualPlan).includes("script"));
  assert.match(cleaned.artConcept || "", /car skids/);
  assert.equal(normalizeDynamicScene({
    version: 1, backdrop: "cinematic", direction,
    visualPlan: { ...visualPlan, castMode: "javascript" }, elements,
  }, scene).visualPlan, undefined);
  assert.equal(normalizeDynamicScene({
    version: 1, backdrop: "cinematic", direction,
    visualPlan: { ...visualPlan, action: "<script>alert(1)</script>" }, elements,
  }, scene).visualPlan, undefined);
});

test("one-work scenes can depict a participating owner in the game's art style", () => {
  const staged: StoryScene = {
    ...scene,
    composition: { version: 1, backdrop: "cinematic", direction, visualPlan,
      artConcept: "A car skids across a wet Los Santos street", elements: [] },
  };
  const prompt = buildWrappedSceneArtPrompt(
    { title: "A week of games", dek: "GTA V appeared in the logs" }, staged, owner,
    { mediaId: "gta", mediaTitle: "Grand Theft Auto V", style: "Cinematic open-world 3D game rendering" },
  );
  assert.match(prompt, /Dodg(e|ing) behind an open car door/i);
  assert.match(prompt, /fictional in-world counterpart/i);
  assert.match(prompt, /low-angle/i);
  assert.match(prompt, /Cinematic open-world 3D game rendering/);
  assert.match(prompt, /SMALL GROUP interacting/);
  assert.match(prompt, /not proof|never evidence/i);
  assert.match(prompt, /short beard/);
});

test("never/auto preference cannot be overridden by a director's owner casting", () => {
  const noOwner = wrappedActionImageGuidance(visualPlan, {
    visualSelfInsertMode: "never", visualSelfDescription: owner.visualSelfDescription,
  }, "Grand Theft Auto V");
  assert.match(noOwner, /No account-owner likeness is authorized/);
  assert.doesNotMatch(noOwner, /short beard/);
  const noDescription = wrappedActionImageGuidance(visualPlan, {
    visualSelfInsertMode: "auto", visualSelfDescription: "",
  }, "Grand Theft Auto V");
  assert.match(noDescription, /No account-owner likeness is authorized/);
  assert.match(wrappedActionImageGuidance({ ...visualPlan, castMode: "canon-character" }, owner),
    /canon protagonist/i);
});

test("social interactions and non-observing participants are allowed when relevant", () => {
  const social = {
    ...visualPlan, activityMode: "social" as const, camera: "wide" as const,
    action: "Celebrate together at a fictional guild banquet after a long adventure",
    interaction: "A small party of guildmates sharing food and cheering",
  };
  const prompt = wrappedActionImageGuidance(social, owner, "Final Fantasy XIV");
  assert.match(prompt, /guild banquet/);
  assert.match(prompt, /guildmates/);
  assert.match(prompt, /reciprocal social activity/);
  assert.doesNotMatch(prompt, /one person only/i);
});

test("issue-wide variety keeps at most two reflective owner portraits and different neighboring cameras", () => {
  const make = (n: number): StoryScene => ({
    id: "wrapped-" + n, kind: n === 0 ? "opening" : n === 4 ? "closing" : "spotlight",
    eyebrow: "SCENE", title: "Moment " + n, body: "Meaningful media detail",
    composition: { version: 1, backdrop: "cinematic", direction, elements: [],
      visualPlan: {
        activityMode: "reflection", castMode: "self", camera: "medium",
        action: "Sit thoughtfully with a notebook in front of a city skyline",
      } },
  });
  const issue: WrappedStory = {
    version: 2, title: "An issue", dek: "An issue of stories",
    scenes: Array.from({ length: 5 }, (_, i) => make(i)),
  };
  const varied = diversifyWrappedVisualPlans(issue);
  const plans = varied.scenes.map(s => s.composition!.visualPlan!);
  assert.equal(plans.filter(p => p.activityMode === "reflection").length, 2);
  assert.equal(plans[4].activityMode, "reflection");
  assert.equal(plans[0].activityMode, "reflection");
  assert.ok(plans.slice(1, -1).every(p => p.activityMode !== "reflection"));
  assert.ok(plans.every((p, i) => !i || p.camera !== plans[i - 1].camera));
  assert.equal(varied.scenes[2].body, issue.scenes[2].body);
});

test("opening and closing can use an active planned beat without changing text layout", () => {
  const opening = { kind: "opening", title: "The city", evidenceIds: [], composition: {
    artConcept: "One car turning under city lights", direction,
    visualPlan,
  } };
  const cover = buildWrappedCoverPrompt({
    title: "An unlikely week", dek: "Unexpected adventures",
    scenes: [opening, { kind: "spotlight", title: "The escape", evidenceIds: ["media-0"], media: { id: "gta" } }],
  }, "week", "2026-W43", [{ id: "gta", title: "Grand Theft Auto V", type: "Game" }], owner);
  assert.match(cover, /Dodg(e|ing) behind an open car door/i);
  assert.match(cover, /ONE focal action or interaction/);
  assert.match(cover, /editorial image framing/i);
  const closing = buildWrappedClosingTableauPrompt({
    title: "An unlikely week", dek: "Unexpected adventures",
    scenes: [scene, { kind: "closing", title: "The end", body: "The curtain falls" }],
  }, { title: "The end", body: "The curtain falls", composition: {
    version: 1, backdrop: "cinematic", elements: [],
    visualPlan: { ...visualPlan, activityMode: "exploration", castMode: "self",
      action: "Walk through the archway as the castle lights blink out behind" },
  } }, owner);
  assert.match(closing, /Walk through the archway/);
  assert.match(closing, /action coming to a close/);
});

test("visual director asks for a concrete whole-issue action plan without exposing user appearance", () => {
  const issue: WrappedStory = { version: 2, title: "Fictional Scenes", dek: "A real log and imagined visual",
    scenes: [{ id: "wrapped-0", kind: "opening", title: "Start", eyebrow: "OPEN",
      body: "Beginning", evidenceIds: [] },
      { ...scene, evidenceIds: ["media-0"] },
      { id: "wrapped-2", kind: "closing", title: "End", eyebrow: "END", body: "Over", evidenceIds: [] }],
  };
  const brief = wrappedVisualDirectorBrief(issue);
  assert.match(brief, /visualPlan:/);
  assert.match(brief, /ISSUE-WIDE CAST AND CAMERA VARIETY/);
  assert.match(brief, /ENTER THE MEDIA WORLD/);
  assert.match(brief, /featuredWork/);
  assert.doesNotMatch(brief, /short beard/);
});
