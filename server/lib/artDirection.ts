/**
 * Shared art direction for the image pipeline.
 *
 * These describe *how grand* a thing should look, which is a game-balance
 * decision (level, rarity) rather than a creative one — so they are written
 * down here and handed to whichever prompt is being composed, whether the AI
 * writes the image prompt itself or the fallback art-director call does.
 */

/** Sharpness directive shared by every prompt (counters Z-Image-Turbo softness). */
export const SHARPNESS =
  "Render with sharp focus, crisp clean detail and even, clear lighting. Avoid heavy bokeh, shallow depth of field, soft focus and excessive vignette.";

/** Authentic-franchise directive — let it borrow real iconography from the source. */
export const AUTHENTICITY = (media: string) =>
  `Incorporate authentic, recognizable iconography from "${media}" — real emblems, logos, insignia, branding, color schemes, fonts and motifs — wherever they naturally belong (for example, a festival event pass should bear that festival's actual real logo and branding; a known character should resemble their real design). Reproduce the franchise's genuine design language as faithfully as possible.`;

/** How the app describes each enemy level to the AI, in plain difficulty terms. */
export const LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: "Pleb (laughable, pathetic, the weakest possible minion — a joke enemy)",
  2: "Easy (a common enemy, a foot soldier, a standard hurdle)",
  3: "Medium (an actual threat, an elite minion or mini-boss)",
  4: "Hard (menacing, a dangerous antagonist, a major boss)",
  5: "World Boss (EPIC, realm-ending, the final form, a supreme being)",
};

/** Per-level art direction for enemies: silly weakling (1) up to epic final boss (5). */
export function enemyTier(level: number): { word: string; look: string; scene: string } {
  if (level >= 5)
    return {
      word: "an epic, realm-ending FINAL BOSS — colossal, terrifying and awe-inspiring",
      look: "monumental scale, intricate detail, overwhelming menace and grandeur",
      scene: "an epic, dramatic, cinematic setting with grand scale and intense lighting",
    };
  if (level === 4)
    return { word: "a dangerous, menacing major boss", look: "powerful, well-equipped and intimidating", scene: "a dramatic, moody dark setting" };
  if (level === 3)
    return { word: "a serious, formidable elite mini-boss", look: "capable and battle-hardened", scene: "a moody atmospheric setting" };
  if (level === 2)
    return { word: "a common, unremarkable foot soldier or minor enemy", look: "ordinary and unthreatening", scene: "a plain, ordinary setting" };
  return {
    word: "a laughable, almost comical weakling — silly, pathetic and utterly harmless",
    look: "goofy, absurd and a bit cute, clearly the weakest possible enemy and not intimidating in the slightest",
    scene: "a mundane, unimpressive everyday setting",
  };
}

/** Per-rarity art direction for loot: how grand the item is, its aura, and its background. */
export function rarityArt(rarity: string): { grandeur: string; aura: string; background: string } {
  switch (rarity) {
    case "Mythic":
      return {
        grandeur: "an impossible, reality-bending cosmic relic of god-like power, breathtakingly intricate",
        aura: "swirling multi-colored cosmic energy and radiant iridescent particles",
        background: "an epic decorated backdrop of swirling iridescent cosmic nebula colors with glowing particles and radiant light rays",
      };
    case "Legendary":
      return {
        grandeur: "a magnificent, awe-inspiring legendary masterwork, ornate and richly detailed",
        aura: "an intense golden aura and shimmering golden light",
        background: "an epic dark backdrop decorated with golden light rays, ornate gold filigree framing the edges, and floating golden embers in warm gold/yellow tones",
      };
    case "Epic":
      return {
        grandeur: "an impressive, elaborately crafted epic item with ornate detailing",
        aura: "a vivid purple magical glow",
        background: "a dark backdrop with a soft purple radial glow and faint ornamental motifs in violet",
      };
    case "Super Rare":
    case "Rare":
      return {
        grandeur: "a well-crafted, distinctly special item",
        aura: "a cool blue shimmer",
        background: "a dark backdrop with a subtle blue radial glow",
      };
    case "Uncommon":
      return {
        grandeur: "a slightly better-than-average item",
        aura: "a faint green sheen",
        background: "a plain dark grey backdrop with a very faint green tint",
      };
    default: // Common
      return {
        grandeur: "a plain, ordinary, everyday object with no embellishment",
        aura: "no magical glow at all",
        background: "a simple flat neutral grey studio background with no decoration",
      };
  }
}
