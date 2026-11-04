import test from "node:test";
import assert from "node:assert/strict";
import { selectIllustratedScenes, isWrappedInfographicScene, shouldHoldWrappedForArtwork, buildWrappedSceneArtPrompt, buildWrappedClosingTableauPrompt, buildWrappedAchievementFinalePrompt, selectWrappedSceneStyleMediaId } from "./wrappedSceneArt";
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

test("every narrative scene including closing gets a background; opening has its own cover", () => {
  assert.deepEqual(selectIllustratedScenes(scenes), ["wrapped-1","wrapped-2","wrapped-3","wrapped-4"]);
  assert.equal(selectIllustratedScenes(scenes, 0).length, 0);
  assert.equal(selectIllustratedScenes(scenes, 1).length, 1);
});

test("a textual insight about statistics can still have art when it is not an infographic", () => {
  const proseOnly = { ...scenes[1], kind: "outlier" as const, title: "A meaningful change",
    body: "A change described through a personal memory instead of a chart." };
  assert.equal(isWrappedInfographicScene(proseOnly), false);
  assert.deepEqual(selectIllustratedScenes([scenes[0], proseOnly, scenes[4]]),
    ["wrapped-1", "wrapped-4"]);
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
    { ...scenes[1], kind: "outlier",
      design: { layout: "infographic", palette: "violet", visual: "bars", mediaIds: [], align: "left" } },
    { ...scenes[2], kind: "taste",
      editorialJob: "data-reveal" },
    scenes[3],
    scenes[4],
  ];
  assert.deepEqual(selectIllustratedScenes(metrics), ["wrapped-3", "wrapped-4"]);
});

test("a typography scene still receives an original image; only verified data scenes are exempt", () => {
  const directed: StoryScene[] = scenes.map((scene, index) => index === 2 ? {
    ...scene,
    composition: {
      version: 1, backdrop: "minimal", elements: [],
      direction: { presentation: "typography", textSide: "center", textPosition: "middle", imageFocus: "right" },
    },
  } : scene);
  assert.deepEqual(selectIllustratedScenes(directed),
    ["wrapped-1", "wrapped-2", "wrapped-3", "wrapped-4"]);
});


test("one featured work gets its own Codex visual style rather than generic photorealism", () => {
  const avatar: StoryScene = {
    id: "wrapped-avatar", kind: "spotlight", eyebrow: "RARE APPROVAL",
    title: "The next season is wanted",
    body: "Your saved review of Avatar: Seven Havens is emphatic. It delivered the story you wanted.",
    media: { id: "avatar", title: "Avatar: Seven Havens - Book One: Survival", type: "Game" },
    artworks: [
      { id: "avatar", title: "Avatar: Seven Havens - Book One: Survival", type: "Game" },
      { id: "other", title: "Another Game", type: "Game" },
    ],
  };
  assert.equal(selectWrappedSceneStyleMediaId(avatar), "avatar");
  const prompt = buildWrappedSceneArtPrompt(
    { title: "October verdict", dek: "A surprising approval" }, avatar, null,
    { mediaId: "avatar", mediaTitle: "Avatar: Seven Havens - Book One: Survival",
      style: "Form: stylized 2D animation\nNamed style: hand-painted cel animation\nPalette: muted jade and gold" },
  );
  assert.match(prompt, /SOURCE-STYLE-GROUNDED/);
  assert.match(prompt, /hand-painted cel animation/);
  assert.match(prompt, /Avatar: Seven Havens - Book One: Survival/);
  assert.match(prompt, /do NOT default to a photoreal human/);
  assert.match(prompt, /chapter thesis primary/);
  assert.match(prompt, /Horizontal landscape 3:2/);
});

test("mixed media, abstract themes and non-image data scenes never select a Codex style", () => {
  const avatar = { id: "avatar", title: "Avatar: Seven Havens", type: "Game" };
  const book = { id: "book", title: "Der Nachtzug", type: "Book" };
  const base: StoryScene = {
    id: "wrapped-example", kind: "insight", eyebrow: "A JOURNEY",
    title: "Two different verdicts",
    body: "Avatar: Seven Havens was wonderful, while Der Nachtzug was fascinating.",
    media: avatar, artworks: [avatar, book],
  };
  assert.equal(selectWrappedSceneStyleMediaId(base), null);
  assert.equal(selectWrappedSceneStyleMediaId({
    ...base, title: "The experience", body: "This was a month of rediscovery",
  }), null);
  assert.equal(selectWrappedSceneStyleMediaId({
    ...base, title: "A peculiar journey", body: "Der Nachtzug made the trip special",
  }), "book");
  assert.equal(selectWrappedSceneStyleMediaId({
    ...base, kind: "outlier", title: "Avatar: Seven Havens", body: "Measured share",
  }), null);
  assert.equal(selectWrappedSceneStyleMediaId({
    ...base, editorialJob: "data-reveal", title: "Avatar: Seven Havens", body: "Measured share",
  }), null);
  assert.equal(selectWrappedSceneStyleMediaId({
    ...base, kind: "opening", title: "Avatar: Seven Havens", body: "A new month",
  }), null);
  assert.equal(selectWrappedSceneStyleMediaId({
    ...base, title: "Avatar: Seven Havens", composition: {
      version: 1, backdrop: "minimal", elements: [],
      direction: { presentation: "typography", textSide: "center",
        textPosition: "middle", imageFocus: "right" },
    },
  }), null);
});

test("missing Codex context preserves existing scene art prompt behavior", () => {
  const scene = scenes[1];
  const standard = buildWrappedSceneArtPrompt({ title: "Story", dek: "A memory" }, scene);
  assert.match(standard, /original cinematic EDITORIAL ILLUSTRATION/);
  assert.doesNotMatch(standard, /CODEX VISUAL IDENTITY/);
  assert.doesNotMatch(standard, /SOURCE-STYLE-GROUNDED/);
});


test("all non-infographic scenes are illustrated even in longer monthly issues", () => {
  const longer: StoryScene[] = [
    scenes[0],
    ...Array.from({length: 9}, (_, i) => ({
      ...scenes[1], id: "wrapped-" + (i + 1), kind: "insight" as const,
      title: "Narrative point " + (i + 1),
    })),
    { ...scenes[4], id: "wrapped-10" },
  ];
  assert.equal(selectIllustratedScenes(longer).length, 10);
  assert.equal(selectIllustratedScenes(longer)[9], "wrapped-10");
});

test("data-reveal and chart compositions never consume background artwork", () => {
  const stats: StoryScene = {
    ...scenes[2], editorialJob: "data-reveal",
  };
  assert.equal(isWrappedInfographicScene(stats), true);
  assert.equal(isWrappedInfographicScene({
    ...scenes[2], design: {
      layout: "infographic", palette: "violet", visual: "bars", mediaIds: [], align: "left",
    },
  }), true);
  const composed: StoryScene = {
    ...scenes[2], composition: {
      version: 1, backdrop: "minimal", elements: [],
      direction: { presentation: "data", textSide: "center",
        textPosition: "middle", imageFocus: "right" },
    },
  };
  assert.deepEqual(selectIllustratedScenes([scenes[0], stats, composed, scenes[4]]), ["wrapped-4"]);
});

test("closing tableau follows its editorial mode without cover cards or media inventory", () => {
  const closing = { ...scenes[4], composition: {
    version: 1, backdrop: "cinematic" as const,
    direction: { presentation: "cinematic" as const, textSide: "right" as const,
      textPosition: "middle" as const, imageFocus: "left" as const },
    artConcept: "One quiet lamp glows on an empty railway platform",
    elements: [],
  }};
  const prompt = buildWrappedClosingTableauPrompt({
    title: "A month in stories", dek: "A month about patience",
    scenes: [...scenes.slice(0, -1), closing],
  }, closing);
  assert.match(prompt, /FULL-BLEED CLOSING SCENE/);
  assert.match(prompt, /quiet lamp glows/);
  assert.match(prompt, /RIGHT 55% darker/);
  assert.match(prompt, /ONE hero composition/);
  assert.match(prompt, /No multiple franchise worlds/);
  assert.match(prompt, /book jackets, floating game covers or souvenir cards/);
  assert.doesNotMatch(prompt, /EXISTING CODEX VISUAL IDENTITY/);
  const finale = buildWrappedAchievementFinalePrompt({
    title: "A month in stories", dek: "A month about patience",
  });
  assert.match(finale, /FINAL.*Dungeon System Verdict/i);
  assert.match(finale, /BEHIND interactive achievement cards/);
  assert.match(finale, /no fake medals/i);
});
