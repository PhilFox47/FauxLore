import type { Db } from "../context";

/** A model-specific art brief, shared by fresh loot/enemy prompts and fallback art direction. */
export type ImagePromptProfile = {
  model: string;
  distilled: boolean;
  gptImage25: boolean;
};

export function resolveImagePromptProfile(provider: string, model: string): ImagePromptProfile {
  const name = String(model || "").trim();
  return {
    model: name,
    distilled: provider !== "cliProxy" && /(?:^|[-_ ])(?:turbo|lightning|schnell|hyper|lcm|flash|fast)(?:$|[-_ ])/i.test(name),
    gptImage25: provider === "cliProxy" && /^gpt-image-2\.5(?:-|$)/i.test(name),
  };
}

export function imagePromptProfileFromDb(db: Db): ImagePromptProfile {
  let row: { aiProvider?: string; cliProxyImageModel?: string; imageModel?: string } = {};
  try {
    row = (db.prepare("SELECT aiProvider, cliProxyImageModel, imageModel FROM system_settings WHERE id = 'system'").get() as typeof row | undefined) || {};
  } catch {
    // Older databases still get a safe NanoGPT prompt until their migrations run.
  }
  const cli = row.aiProvider === "cliProxy";
  return resolveImagePromptProfile(
    cli ? "cliProxy" : "nanoGpt",
    cli ? (row.cliProxyImageModel || "gpt-image-2") : (row.imageModel || "z-image-turbo"),
  );
}

/** Instructions to the TEXT model that writes an image prompt, not to the renderer. */
export function imagePromptCraft(profile: ImagePromptProfile): string {
  if (profile.gptImage25) {
    return [
      "Write a self-contained, precise image-generation brief for GPT Image 2.5 (" + profile.model + ").",
      "Start with the literal subject and its source work. Identify exactly what the viewer should see before giving style or atmosphere.",
      "For a known character, creature or branded object, preserve its canonical silhouette, proportions, colors, materials, clothing, equipment and distinctive markings. Name the important visible features explicitly when supported by the Codex; do not guess unknown details.",
      "Next describe a concrete action or presentation, appropriate environment, camera/framing, source-accurate medium and lighting. Distinguish the fixed subject identity from the flexible scene.",
      "Use clear prose, with short paragraphs when useful; not diffusion keyword soup or generic hype. Typically 80-160 words for complex action, shorter for a straightforward item. Every sentence must add a visible instruction.",
      "Specify exact words in quotes only if those words authentically belong on the subject. Otherwise request no added labels or invented logos. Keep the subject fully readable and inside the requested canvas.",
      "Do not invent fantasy effects, change real materials or redesign the subject merely to convey an RPG level or rarity. Express presentation value through composition and lighting instead.",
      "Keep these instructions inside the imagePrompt field only; obey the caller\u0027s required JSON structure.",
    ].join("\n- ");
  }
  if (profile.distilled) {
    return "You are writing for " + profile.model + ", a distilled few-step image model. Use 2-4 direct natural sentences. Name the subject, exact look, source style, action or presentation and framing. Concrete nouns over adjectives.";
  }
  return [
    "Write a self-contained text-to-image prompt for " + profile.model + ".",
    "Open with the literal subject and defining visible features, then describe source style, setting, light and composition.",
    "Use one concise paragraph of natural language (roughly 40-90 words); avoid keyword lists and conflicting instructions.",
    "Include clear composition constraints. Preserve recognizable designs, and do not add fantasy ornaments to mundane objects.",
  ].join("\n- ");
}

/**
 * Final render priorities for GPT Image 2.5, including OLD stored image prompts.
 * This does not rewrite old assets and does not change NanoGPT's request format.
 */
export function gptImage25DeliveryPrompt(prompt: string, kind: "loot" | "boss" | "wrapped" | "wrapped-scene", customExclusions = ""): string {
  const priorities = kind === "loot"
    ? [
        "The single item is the subject. Preserve its recognizable construction, silhouette, proportions, true materials, established color scheme and functional marks.",
        "Rarity is an inventory/UI classification, NOT permission to enchant or redesign the object. Keep any non-canonical colored illumination subtle and entirely in the backdrop. Intrinsic glows or elaborate details belong on the item only when established by its source.",
        "Use a quiet studio presentation with one complete, unobstructed item. No people, hands, duplicate items or unrelated props.",
      ]
    : kind === "wrapped-scene" ? [
        "Illustrate ONE specific interior scene from a personal Wrapped story, not a title page. Express the supplied chapter premise as a single strong visual metaphor or environment, grounded in the chapter's actual story.",
        "Do NOT try to draw all logged media titles, a collage of book jackets, a franchise lineup or a layout of separate panels. Prefer one memorable focal subject and atmosphere with natural negative space.",
        "Follow the explicit EDITORIAL IMAGE FRAMING in the supplied prompt EXACTLY: the quiet text side and subject focal side may vary. Do not revert to a generic left-text/right-image layout. No baked-in typography, numbers, logos or UI; no fabricated personal achievements.",
      ]
    : kind === "wrapped" ? [
        "This is singular, high-impact editorial KEY ART, not an illustrated inventory of the media consumed. Find ONE central visual thesis, ONE unmistakable hero motif and ONE coherent moment.",
        "Prefer a bold, emotionally resonant metaphor to comprehensive coverage. At most ONE source media work may influence the picture, and even that need not appear literally. Do NOT add other recognizable franchises to fill space.",
        "Absolutely no character lineup, crossover montage, multiple worlds, mini-posters, visual checklist, split panels, or scattered easter eggs. Keep secondary visual elements subordinate to the main motif.",
        "Follow the requested EDITORIAL IMAGE FRAMING rather than assuming the title always appears on the left. Leave the chosen typography side quiet and keep the focal subject on its requested opposite side. Do not invent personal achievements, story events or experiences. Add NO baked-in titles, typography, logos, watermarks or interface.",
      ]
    : [
        "Preserve the canonical character or creature's recognizable anatomy, armor, silhouette, palette and signature equipment. Level changes the drama of the scene, not the actual species or character design.",
        "Depict one complete, readable primary subject in a source-appropriate moment OR clearly defeated aftermath, according to the requested state. Do not force a defeated opponent back into an attacking pose. No extra foreground characters or montage panels.",
      ];
  priorities.push("No invented lettering, emblems, watermarks or interface overlays. Genuine intrinsic markings may remain when source-supported.");
  if (customExclusions.trim()) priorities.push("Additional user-requested exclusions: " + customExclusions.trim());
  return prompt.trim() + "\n\nFINAL IMAGE PRIORITIES:\n- " + priorities.join("\n- ");
}
