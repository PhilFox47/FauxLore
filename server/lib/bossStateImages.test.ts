import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEnragedBossImagePrompt, buildBossStateImagePrompt, bossVisualState, basePortraitForTransition, isLocalGeneratedImage, localImageReferenceDataUrl } from "./bossStateImages";
import { cliProxyImageEditBody, imageEditSupportsTextFallback } from "./cliProxy";

const ID = "a53692ba-c34f-4fad-9155-d0d0d0d0d0d0";
const URL = "/uploads/ai-images/" + ID + ".png";

test("enrage prompt explicitly preserves the original enemy, but escalates in a world-appropriate way", () => {
  const boss = {
    name: "Dalek",
    title: "Damaged Sentinel",
    description: "A bronze armored alien war machine from Doctor Who.",
    sourceTitle: "Doctor Who",
    sourceType: "Series",
    imagePrompt: "One bronze Dalek in a factory with its eye stalk raised.",
  };
  const withRef = buildEnragedBossImagePrompt(boss, true);
  assert.match(withRef, /ORIGINAL portrait of this exact enemy/);
  assert.match(withRef, /same specific enemy/i);
  assert.match(withRef, /strained mechanisms/);
  assert.match(withRef, /not merely recolored red/);
  assert.match(withRef, /bronze Dalek in a factory/);

  const withoutRef = buildEnragedBossImagePrompt(boss, false);
  assert.match(withoutRef, /No image reference is available/);
  assert.doesNotMatch(withoutRef, /supplied image is the ORIGINAL portrait/);
});

test("local reference loader rejects remote paths, traversals, bogus files, and oversized uploads", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fauxlore-enrage-"));
  try {
    const buffer = Buffer.alloc(32);
    buffer.writeUInt32BE(0x89504e47, 0);
    buffer.writeUInt32BE(512, 16);
    buffer.writeUInt32BE(512, 20);
    fs.writeFileSync(path.join(dir, ID + ".png"), buffer);
    assert.equal(isLocalGeneratedImage(URL), true);
    const data = localImageReferenceDataUrl(URL, dir);
    assert.ok(data?.startsWith("data:image/png;base64,"));
    assert.equal(Buffer.from(data!.split(",")[1], "base64").compare(buffer), 0);
    assert.equal(localImageReferenceDataUrl("https://evil.example/image.png", dir), null);
    assert.equal(localImageReferenceDataUrl("/uploads/ai-images/../secrets.png", dir), null);
    assert.equal(localImageReferenceDataUrl("/uploads/ai-images/" + ID + ".gif", dir), null);
    assert.equal(localImageReferenceDataUrl("/uploads/ai-images/ffffffff-ffff-ffff-ffff-ffffffffffff.png", dir), null);
    fs.writeFileSync(path.join(dir, ID + ".png"), Buffer.from("definitely not a PNG"));
    assert.equal(localImageReferenceDataUrl(URL, dir), null);
    // Sparse file: exercises the upload size cap without allocating 11 MiB.
    fs.truncateSync(path.join(dir, ID + ".png"), 11 * 1024 * 1024);
    assert.equal(localImageReferenceDataUrl(URL, dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLIProxy image edit request uses JSON images and never a remote image URL", () => {
  const data = "data:image/png;base64,AAAA";
  const body = cliProxyImageEditBody("gpt-image-2.5-sunburst", "Same Dalek, enraged.", "1536x1024", data);
  assert.deepEqual(body, {
    model: "gpt-image-2.5-sunburst",
    prompt: "Same Dalek, enraged.",
    size: "1536x1024",
    response_format: "b64_json",
    images: [{ image_url: data }],
  });
  assert.throws(() => cliProxyImageEditBody("gpt-image-2.5-flare", "test", "1536x1024", "https://evil.example/image.png"));
});

test("Edit endpoint absence falls back; auth/rate-limit/transient failure does not silently spend more", () => {
  for (const s of [400, 404, 405, 415, 422, 501]) assert.equal(imageEditSupportsTextFallback(s), true);
  for (const s of [0, 401, 403, 408, 429, 500, 502, 503]) assert.equal(imageEditSupportsTextFallback(s), false);
});

test("Victory artwork depicts the same enemy defeated, not a renamed or dead replacement", () => {
  const boss = {
    name: "Dalek",
    description: "A bronze war machine",
    sourceTitle: "Doctor Who",
    imagePrompt: "Bronze shell with a single eye stalk.",
  };
  const withRef = buildBossStateImagePrompt("defeated", boss, true);
  assert.match(withRef, /DEFEATED aftermath/);
  assert.match(withRef, /ORIGINAL portrait of this exact enemy/);
  assert.match(withRef, /machine might be disabled or sparking/);
  assert.match(withRef, /defeat does NOT automatically mean death/i);
  assert.match(withRef, /Bronze shell with a single eye stalk/);
  assert.doesNotMatch(withRef, /Now show the enemy pushed into a visibly enraged state/);

  const fallback = buildBossStateImagePrompt("defeated", boss, false);
  assert.match(fallback, /No image reference is available/);
  assert.doesNotMatch(fallback, /supplied image is the ORIGINAL portrait/);
});

test("Victory takes priority over Enrage and every state refers to the same original image", () => {
  const base = URL;
  const raging = "/uploads/ai-images/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png";
  assert.equal(bossVisualState({ status: "Defeated", enraged: true }), "defeated");
  assert.equal(bossVisualState({ status: "Active", enraged: 1 }), "enraged");
  assert.equal(bossVisualState({ status: "Active", enraged: false }), null);
  assert.equal(basePortraitForTransition({
    imageUrl: raging,
    basePortraitImageUrl: base,
    enrageOriginalImageUrl: base,
    enraged: 1,
    imageStatus: "done",
  }), base);
  assert.equal(basePortraitForTransition({
    imageUrl: raging, enraged: 1, imageStatus: "done",
  }), null, "Do not mistake an enraged image for the original.");
  assert.equal(basePortraitForTransition({ imageUrl: base, enraged: 0, imageStatus: "done" }), base);
  assert.equal(basePortraitForTransition({ imageUrl: base, enraged: 0, imageStatus: "generating" }), null);
});
