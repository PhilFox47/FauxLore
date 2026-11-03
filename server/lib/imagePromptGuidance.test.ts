import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "../context";
import { rarityArt } from "./artDirection";
import {
  gptImage25DeliveryPrompt,
  imagePromptCraft,
  imagePromptProfileFromDb,
  resolveImagePromptProfile,
} from "./imagePromptGuidance";

test("GPT Image 2.5 Flare and Sunburst receive the specialized prompt guidance", () => {
  for (const model of ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]) {
    const profile = resolveImagePromptProfile("cliProxy", model);
    assert.equal(profile.gptImage25, true);
    assert.equal(profile.distilled, false);
    const guidance = imagePromptCraft(profile);
    assert.match(guidance, /canonical silhouette/i);
    assert.match(guidance, /lighting/i);
    assert.doesNotMatch(guidance, /few-step/i);
  }
});

test("NanoGPT and older CLIProxy models keep independent, compatible guidance", () => {
  const nano = resolveImagePromptProfile("nanoGpt", "z-image-turbo");
  assert.equal(nano.distilled, true);
  assert.equal(nano.gptImage25, false);
  assert.match(imagePromptCraft(nano), /2-4 direct natural sentences/i);
  const legacyCli = resolveImagePromptProfile("cliProxy", "gpt-image-2");
  assert.equal(legacyCli.gptImage25, false);
  assert.match(imagePromptCraft(legacyCli), /one concise paragraph/i);
});

test("The selected global image model drives initial prompt authorship", () => {
  const fakeDb = {
    prepare: () => ({
      get: () => ({ aiProvider: "cliProxy", cliProxyImageModel: "gpt-image-2.5-sunburst" }),
    }),
  } as unknown as Db;
  assert.equal(imagePromptProfileFromDb(fakeDb).gptImage25, true);
});

test("GPT Image 2.5 render instructions override old rarity effects and keep user exclusions", () => {
  const prompt = gptImage25DeliveryPrompt(
    "An iconic handheld device, glowing with invented cosmic fire.",
    "loot",
    "no floating captions",
  );
  assert.match(prompt, /Keep any non-canonical colored illumination subtle/i);
  assert.match(prompt, /NOT permission to enchant or redesign/i);
  assert.match(prompt, /Additional user-requested exclusions: no floating captions/i);
  assert.match(prompt, /An iconic handheld device/);
});

test("Bosses preserve recognizable form while changing scene presentation", () => {
  const prompt = gptImage25DeliveryPrompt("A bronze Dalek advancing.", "boss");
  assert.match(prompt, /canonical character or creature/i);
  assert.match(prompt, /Level changes the drama of the scene/i);
  assert.doesNotMatch(prompt, /inventory\/UI classification/i);
});

test("Rarity is environmental art direction, not a change in the object's material", () => {
  for (const rarity of ["Common", "Uncommon", "Rare", "Super Rare", "Epic", "Legendary", "Mythic"]) {
    const art = rarityArt(rarity);
    assert.match(art.background, /studio backdrop/i);
    assert.match(art.aura, /light|lighting/i);
    assert.doesNotMatch(art.background, /cosmic nebula|gold filigree|particle storm/i);
  }
  assert.match(rarityArt("Mythic").grandeur, /without inventing supernatural properties/i);
  assert.match(rarityArt("Legendary").grandeur, /authentic design/i);
});

test("GPT Image 2.5 Wrapped cover briefs do not inherit boss or loot portrait constraints", () => {
  const prompt = gptImage25DeliveryPrompt(
    "One cinematic editorial title illustration connecting Mass Effect and a thriller.",
    "wrapped",
  );
  assert.match(prompt, /editorial cover for the user's actual Wrapped period/);
  assert.match(prompt, /left portion darker and uncluttered/);
  assert.doesNotMatch(prompt, /Level changes the drama of the scene/);
  assert.doesNotMatch(prompt, /Rarity is an inventory/);
});
