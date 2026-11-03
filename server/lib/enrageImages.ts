import fs from "fs";
import path from "path";
import { imageSize } from "./imageSize";

export type EnrageBossIdentity = {
  name: string;
  title?: string | null;
  description?: string | null;
  sourceTitle: string;
  sourceType?: string | null;
  imagePrompt?: string | null;
};

/**
 * The original portrait defines the identity; the enraged artwork changes only
 * its STATE. Use the same brief for edits and text-only fallback.
 */
export function buildEnragedBossImagePrompt(boss: EnrageBossIdentity, hasReference: boolean): string {
  const name = [boss.name, boss.title].filter(Boolean).join(", ");
  const original = String(boss.imagePrompt || "").trim();
  return [
    \`Create an ENRAGED version of the SAME specific enemy: \${name}, from "\${boss.sourceTitle}" (\${boss.sourceType || "media"}).\`,
    hasReference
      ? "The supplied image is the ORIGINAL portrait of this exact enemy. Treat it as the authority for recognizable identity: preserve the original face, anatomy, body proportions, silhouette, materials, colors, outfit, armor, distinctive markings and equipment. This is an image-to-image transformation, NOT a new character."
      : "No image reference is available. Reconstruct the same enemy from the original description and source, preserving its recognizable canonical appearance rather than designing a replacement.",
    boss.description ? \`Enemy context: \${boss.description.trim()}\` : "",
    original ? \`Original art direction (identity and source style, not its old emotion or static pose): \${original}\` : "",
    "Now show the enemy pushed into a visibly enraged state during a new, escalating moment. Interpret rage according to THIS particular enemy and source world. A machine may show strained mechanisms and electrical stress; an animal may become feral; a human may become desperate or reckless; a comic opponent may escalate in an absurd but recognizable way. Use only cues fitting this subject. These are examples, NOT a list of effects to apply.",
    "Increase urgency through a purposeful action, body language, environmental reaction, framing and source-appropriate lighting. The state should feel meaningfully more dangerous, furious or unhinged than the original, not merely recolored red or surrounded by generic flames. Keep the original artistic medium and visual language.",
    "One main subject only, horizontal 3:2 composition with essential parts fully visible. Do not turn the character into a different creature, swap outfits or weapons, add gratuitous mutations, or invent unrelated logos or lettering.",
  ].filter(Boolean).join("\n\n");
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
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 15 * 1024 * 1024) return null;
    const bytes = fs.readFileSync(filePath);
    const actual = imageSize(bytes);
    if (!actual || !actual.width || !actual.height) return null;
    const mime = actual.type === "jpeg" || actual.type === "jpg" ? "image/jpeg"
      : actual.type === "png" ? "image/png"
      : actual.type === "webp" ? "image/webp" : null;
    if (!mime) return null;
    return \`data:\${mime};base64,\${bytes.toString("base64")}\`;
  } catch {
    return null;
  }
}

export function isLocalGeneratedImage(url: unknown): url is string {
  return typeof url === "string" && /^\/uploads\/ai-images\/[a-f0-9-]{36}\.(?:png|jpe?g|webp)$/i.test(url);
}
