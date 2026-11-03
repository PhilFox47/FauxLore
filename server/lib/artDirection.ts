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

/** Faithful source identity, without inventing badges or painting logos onto unrelated items. */
export const AUTHENTICITY = (media: string) =>
  `Preserve the genuine visual identity of "${media}": canonical designs, proportions, colors, materials and any established emblem or text that actually belongs on THIS subject. Do not invent logos, markings or unrelated franchise branding just to signal the source.`;

/** How the app describes each enemy level to the AI, in plain difficulty terms. */
export const LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: "Pleb (laughable, pathetic, the weakest possible minion — a joke enemy)",
  2: "Easy (a common enemy, a foot soldier, a standard hurdle)",
  3: "Medium (an actual threat, an elite minion or mini-boss)",
  4: "Hard (menacing, a dangerous antagonist, a major boss)",
  5: "World Boss (EPIC, realm-ending, the final form, a supreme being)",
};

/**
 * Per-level art direction for enemies: silly weakling (1) up to epic final boss (5).
 *
 * `action` and `camera` exist because a prompt that only asks for a portrait
 * gets a portrait — one figure, standing straight, staring down the lens, every
 * single time. Naming a moment and an angle instead is what makes a level 5 read
 * as dangerous and a level 1 read as a joke.
 */
export function enemyTier(level: number): { word: string; look: string; scene: string; action: string; camera: string } {
  if (level >= 5)
    return {
      word: "an epic, realm-ending FINAL BOSS — colossal, terrifying and awe-inspiring",
      look: "monumental scale, intricate detail, overwhelming menace and grandeur",
      scene: "an epic, dramatic, cinematic setting with grand scale and intense lighting",
      action:
        "at the peak of an attack and fully committed to it — mid-roar, a weapon crashing down, wings snapping open, power erupting outward, the ground splitting or debris flung into the air around it",
      camera:
        "a dramatic low angle looking steeply up at it, wide and cinematic, so it towers over the viewer",
    };
  if (level === 4)
    return {
      word: "a dangerous, menacing major boss",
      look: "powerful, well-equipped and intimidating",
      scene: "a dramatic, moody dark setting",
      action:
        "advancing mid-stride with intent — weapon raised or being drawn, coat and dust moving with it, closing the distance on whoever is watching",
      camera: "a low three-quarter angle, framed tight enough that the threat feels close",
    };
  if (level === 3)
    return {
      word: "a serious, formidable elite mini-boss",
      look: "capable and battle-hardened",
      scene: "a moody atmospheric setting",
      action:
        "caught mid-motion — wheeling round to face a threat, weapon coming up, bracing itself, already halfway into the fight",
      camera: "a dynamic three-quarter angle just below eye level, with a sense of movement",
    };
  if (level === 2)
    return {
      word: "a common, unremarkable foot soldier or minor enemy",
      look: "ordinary and unthreatening",
      scene: "a plain, ordinary setting",
      action:
        "in the middle of something mundane and slightly off guard — on patrol, mid-shout, adjusting its gear, only just noticing it is being watched",
      camera: "a candid three-quarter angle at eye level, as if caught mid-shift",
    };
  return {
    word: "a laughable, almost comical weakling — silly, pathetic and utterly harmless",
    look: "goofy, absurd and a bit cute, clearly the weakest possible enemy and not intimidating in the slightest",
    scene: "a mundane, unimpressive everyday setting",
    action:
      "mid-failure at whatever it was attempting — tripping over its own feet, dropping its weapon, mid-sneeze, tangled in its own equipment, being knocked over by a light breeze",
    camera: "a plain, unflattering angle that makes it look small and faintly ridiculous",
  };
}

/**
 * Rarity controls WHAT the reward means and HOW the image is presented.
 * It never changes canonical item geometry, properties, materials or inscriptions.
 * Accent hues belong to the backdrop/UI; innate magic belongs on the object only
 * when the source actually establishes it.
 */
export function rarityArt(rarity: string): { grandeur: string; aura: string; background: string } {
  switch (rarity) {
    case "Mythic":
      return {
        grandeur: "an irreplaceable, source-defining or uniquely storied object, without inventing supernatural properties",
        aura: "very restrained iridescent edge lighting behind the item, never an invented effect emitted by it",
        background: "an uncluttered charcoal studio backdrop with subtle iridescent rim-light accents",
      };
    case "Legendary":
      return {
        grandeur: "an iconic, exceptionally significant or storied object within this specific world, retaining its authentic design",
        aura: "subtle warm golden backlighting around the silhouette, not a magical aura on the object",
        background: "a restrained dark studio backdrop with a warm gold edge-light accent",
      };
    case "Epic":
      return {
        grandeur: "a notably distinctive or hard-won object whose source-world construction stays believable",
        aura: "a soft violet accent light in the scene, not a new glow or power on the item",
        background: "a dark neutral studio backdrop with a restrained violet light accent",
      };
    case "Super Rare":
    case "Rare":
      return {
        grandeur: "a well-crafted, uncommon or meaningfully recognizable object from the source",
        aura: "a subtle cool-blue light on the background, without changing the item's color",
        background: "a neutral dark studio backdrop with gentle cool-blue edge lighting",
      };
    case "Uncommon":
      return {
        grandeur: "a slightly unusual or useful object that still feels ordinary in its own world",
        aura: "a faint green-tinted light in the background only",
        background: "a plain dark gray studio backdrop with a minimal green accent",
      };
    default:
      return {
        grandeur: "a mundane, ordinary object as it naturally appears in this world",
        aura: "plain, even neutral lighting with no artificial magical effects",
        background: "a simple neutral gray studio backdrop",
      };
  }
}
