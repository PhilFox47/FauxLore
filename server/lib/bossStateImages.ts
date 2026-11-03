import fs from "fs";
import path from "path";
import { imageSize } from "./imageSize";

export type BossVisualState = "enraged" | "defeated";

export type BossVisualIdentity = {
  name: string;
  title?: string | null;
  description?: string | null;
  sourceTitle: string;
  sourceType?: string | null;
  imagePrompt?: string | null;
};

export type BossPortraitSnapshot = {
  basePortraitImageUrl?: string | null;
  enrageOriginalImageUrl?: string | null;
  imageUrl?: string | null;
  imageStatus?: string | null;
  enraged?: number | boolean | null;
};

/**
 * The original portrait is immutable across phase changes. Never use an
 * enraged portrait as the defeated reference: that would drift on each edit.
 */
export function basePortraitForTransition(boss: BossPortraitSnapshot): string | null {
  for (const url of [boss.basePortraitImageUrl, boss.enrageOriginalImageUrl]) {
    if (isLocalGeneratedImage(url)) return url;
  }
  // An enraged image must never masquerade as the original. During an
  // unfinished generation the old URL might also belong to a previous boss.
  if (boss.enraged || (boss.imageStatus && boss.imageStatus !== "done")) return null;
  return isLocalGeneratedImage(boss.imageUrl) ? boss.imageUrl : null;
}

/**
 * Same enemy, new STATE. Canonical identity comes from the original portrait;
 * the prompt changes only what defeat or rage means in this source world.
 */
export function buildBossStateImagePrompt(
  state: BossVisualState,
  boss: BossVisualIdentity,
  hasReference: boolean,
): string {
  const name = [boss.name, boss.title].filter(Boolean).join(", ");
  const original = String(boss.imagePrompt || "").trim();
  const intro = state === "enraged"
    ? "Create an ENRAGED depiction of the SAME specific enemy: "
    : "Create a DEFEATED aftermath depicting the SAME specific enemy: ";
  const reference = hasReference
    ? "The supplied image is the ORIGINAL portrait of this exact enemy. Treat it as the authority for recognizable identity: preserve the original face, anatomy, body proportions, silhouette, materials, colors, outfit, armor, distinctive markings and equipment. This is an image-to-image transformation, NOT a new character."
    : "No image reference is available. Reconstruct the same enemy from the original description and source, preserving its recognizable canonical appearance rather than designing a replacement.";
  const stateDirections = state === "enraged"
    ? [
        "Now show the enemy pushed into a visibly enraged state during a new, escalating moment. Interpret rage according to THIS particular enemy and source world. A machine may show strained mechanisms and electrical stress; an animal may become feral; a human may become desperate or reckless; a comic opponent may escalate in an absurd but recognizable way. Use only cues fitting this subject. These are examples, NOT a list of effects to apply.",
        "Increase urgency through a purposeful action, body language, environmental reaction, framing and source-appropriate lighting. The state should feel meaningfully more dangerous, furious or unhinged than the original, not merely recolored red or surrounded by generic flames. Keep the original artistic medium and visual language.",
      ]
    : [
        "The fight is over, and this SAME opponent has clearly LOST. Show an unmistakable defeat or exhausted aftermath, interpreted within this specific work: a machine might be disabled or sparking; a beast collapsed or subdued; a human disarmed and spent; a comic opponent spectacularly embarrassed or defeated by their own absurdity. Choose ONLY the appropriate interpretation, not all examples.",
        "Change the posture, interaction with surroundings and tone to express defeat. Keep source-appropriate stakes: defeat does NOT automatically mean death, blood, gore, mutilation or random explosions. If the original was a comedy or nonviolent work, make the loss funny or humiliating instead of violent. Preserve the source medium and style, using subdued aftermath lighting and a clearly changed situation.",
      ];
  return [
    intro + name + ', from "' + boss.sourceTitle + '" (' + (boss.sourceType || "media") + ").",
    reference,
    boss.description ? "Enemy context: " + boss.description.trim() : "",
    original ? "Original art direction (identity and original style only; do not copy its old action or emotional state): " + original : "",
    ...stateDirections,
    "One recognizable main subject only, horizontal 3:2 composition with key silhouette and equipment visible. Do not swap characters, redesign the body, replace signature weapons or outfits, add arbitrary mutations, logos or lettering, or depict an unrelated victor.",
  ].filter(Boolean).join("\n\n");
}

/** Backward-compatible helper used by existing enrage tests and callers. */
export function buildEnragedBossImagePrompt(boss: BossVisualIdentity, hasReference: boolean): string {
  return buildBossStateImagePrompt("enraged", boss, hasReference);
}

/**
 * Only images already saved by FauxLore itself may be sent to the proxy as
 * references. Reject remote URLs, relative paths and traversal before touching
 * disk: no SSRF, no user-controlled server file reads.
 */
export function localImageReferenceDataUrl(url: unknown, aiImagesDir: string): string | null {
  if (typeof url !== "string") return null;
  const match = /^\/uploads\/ai-images\/([a-f0-9-]{36}\.(?:png|jpe?g|webp))$/i.exec(url);
  if (!match) return null;
  try {
    const filePath = path.join(aiImagesDir, match[1]);
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 10 * 1024 * 1024) return null;
    const bytes = fs.readFileSync(filePath);
    const actual = imageSize(bytes);
    if (!actual || !actual.width || !actual.height) return null;
    const mime = actual.type === "jpeg" || actual.type === "jpg" ? "image/jpeg"
      : actual.type === "png" ? "image/png"
      : actual.type === "webp" ? "image/webp" : null;
    if (!mime) return null;
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export function isLocalGeneratedImage(url: unknown): url is string {
  return typeof url === "string" && /^\/uploads\/ai-images\/[a-f0-9-]{36}\.(?:png|jpe?g|webp)$/i.test(url);
}
