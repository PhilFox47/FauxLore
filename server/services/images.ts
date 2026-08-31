import fs from "fs";
import { imageSize } from "../lib/imageSize";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";
import { getAiConfig, nanoGenerateText } from "../lib/ai";
import { AUTHENTICITY, SHARPNESS, enemyTier, rarityArt } from "../lib/artDirection";
import { codexArtStyleBlock, codexPromptBlock, type CodexService } from "./codex";

/**
 * Image-generation defaults, and how they differ by model family.
 *
 * These were written for Z-Image-Turbo and are still its correct values. That
 * model is DISTILLED: it runs in a handful of steps, wants CFG barely above 1,
 * and softens above 1024x1024. None of that is true of a full model like
 * Seedream, which runs its own step schedule, reads long natural language
 * properly and is happy at 2K.
 *
 * So the numbers are no longer sent unconditionally. A step count and a CFG
 * meant for a four-step distillation are actively wrong for anything else, and
 * a provider that starts honouring them one day would quietly wreck the output
 * of an install that had been fine for months. For a non-distilled model they
 * are omitted unless somebody has set them deliberately, which lets the provider
 * apply its own — the values it was tuned with.
 */
const IMAGE_DEFAULTS = {
  model: "z-image-turbo",
  size: "1024x1024",
  steps: 10,
  guidance: 1.5,
  negative: "watermark, signature, low quality, blurry, soft focus, out of focus, bokeh, shallow depth of field, heavy vignette, jpeg artifacts, deformed, disfigured, bad anatomy, extra limbs, cropped, oversaturated",
};

/**
 * Whether the configured model is a few-step distillation.
 *
 * Matched on the name because that is all we have: NanoGPT does not report a
 * model's family, and its docs are not fetchable from the server. The names all
 * advertise it — turbo, lightning, schnell, hyper, lcm — because the speed is
 * the selling point.
 */
function isDistilled(model: string): boolean {
  return /\b(turbo|lightning|schnell|hyper|lcm|flash|fast)\b/i.test(model);
}

/**
 * How to brief the art director, given the model the prompt is actually for.
 *
 * It used to name "Z-Image-Turbo" in the prompt regardless of what was
 * configured, so after a model change the art director was still writing for a
 * model nobody was using. Worse, the two families want genuinely different
 * prompts: a distilled model wants short and direct, because it has few steps to
 * resolve anything complicated, while a full model like Seedream reads long
 * natural language properly and rewards it.
 *
 * Two Seedream behaviours are worth writing to specifically. It weights what
 * comes EARLY in the prompt more heavily, so the subject belongs in the first
 * clause rather than after a paragraph of style notes. And it is documented as
 * losing coherence past roughly 150 words, where instructions start contradicting
 * each other — which is why the length is given as a range with a ceiling rather
 * than "be vivid".
 */
function promptCraft(model: string, distilled: boolean): string {
  if (distilled) {
    return `You are writing for "${model}", a distilled few-step diffusion model. It has very few steps to resolve an image, so keep the prompt direct and concrete — name the subject, the style and the framing plainly and do not bury them in subordinate clauses.

- 2-4 natural sentences. Concrete nouns over adjectives.`;
  }
  return `You are writing for "${model}", a full diffusion model that reads natural language properly and renders many art styles, materials and real text well.

Three things about how it reads a prompt, and they matter more than any adjective you could add:
- IT WEIGHTS THE OPENING MOST. Whatever comes first carries the most influence, so OPEN with the subject and the single most important thing about how it looks. Style, setting, lighting and detail come after it, in that order. A prompt that opens with the art style and reaches the subject in sentence three has spent its strongest position on the wrong thing.
- WRITE PROSE, NOT TAGS. Flowing sentences that describe a scene, the way you would brief a photographer or an illustrator. A comma-separated pile of keywords is read as one confused sentence and produces a confused image.
- 40 TO 90 WORDS, one paragraph. Under about 15 leaves too much to invention; past roughly 150 the instructions start contradicting each other and coherence drops. Say each thing once, precisely, and stop.

- Put every exclusion INTO the prose as something the image simply is, not as a list of what to avoid — "clean unmarked surfaces" rather than "no watermark". A separate negative list may not reach this model at all, and a negation the model does read can summon the very thing it names.`;
}

// Subject-specific negatives appended to the (configurable) base negative.
const BOSS_NEGATIVE_EXTRA = "multiple characters, duplicate, collage, cluttered scene, static standing pose, T-pose, arms at sides, mugshot, passport photo, character select screen, posing for the camera";
const LOOT_NEGATIVE_EXTRA = "hands, fingers, person, multiple items, cluttered scene, environment, landscape";

/** AI image generation (NanoGPT art-direction prompt -> NanoGPT Z-Image-Turbo) and local storage. */
export function createImageService({ db, aiImagesDir, codex }: { db: Db; aiImagesDir: string; codex: CodexService }) {
  function readImageConfig() {
    let row: any = {};
    try {
      row = db.prepare("SELECT imageModel, imageSize, imageSteps, imageGuidance, imageNegativePrompt FROM system_settings WHERE id = 'system'").get() || {};
    } catch (e) { /* columns may not exist yet on very old DBs */ }
    const model = row.imageModel || IMAGE_DEFAULTS.model;
    const distilled = isDistilled(model);
    return {
      model,
      distilled,
      size: row.imageSize || IMAGE_DEFAULTS.size,
      // Only defaulted for the family they were measured on. An explicit setting
      // is always honoured — someone who typed a number meant it.
      steps: row.imageSteps ?? (distilled ? IMAGE_DEFAULTS.steps : undefined),
      guidance: row.imageGuidance ?? (distilled ? IMAGE_DEFAULTS.guidance : undefined),
      negative: row.imageNegativePrompt || IMAGE_DEFAULTS.negative,
    };
  }

  async function internalGenerateImageWithNanoGpt(apiKey: string, prompt: string, extraNegative: string = ""): Promise<string> {
    const cfg = readImageConfig();
    const negativePrompt = [cfg.negative, extraNegative].filter(Boolean).join(", ");
    const res = await fetch("https://nano-gpt.com/api/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        prompt: prompt,
        negative_prompt: negativePrompt,
        size: cfg.size,
        // Omitted rather than guessed for a model whose schedule we do not know.
        ...(cfg.steps !== undefined ? { num_inference_steps: cfg.steps } : {}),
        ...(cfg.guidance !== undefined ? { guidance_scale: cfg.guidance } : {}),
        response_format: "url"
      })
    });
    if (!res.ok) throw new Error("NanoGPT Image Generation Failed: " + await res.text());
    const data = await res.json();
    const remoteUrl = data.data?.[0]?.url;
    if (!remoteUrl) throw new Error("NanoGPT did not return an image URL");

    try {
      // Download and store locally
      const imageRes = await fetch(remoteUrl);
      if (!imageRes.ok) throw new Error(`Failed to fetch image from remote URL: ${remoteUrl}`);
      const arrayBuffer = await imageRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // What we asked for and what we got are not the same question, and until
      // now nothing compared them. A provider that ignores `size` — or silently
      // rounds it to a shape it prefers — produced an image of the wrong
      // dimensions with nothing anywhere to say so, which is indistinguishable
      // from the setting never having been saved.
      const actual = imageSize(buffer);
      if (actual?.width && actual?.height) {
        const got = `${actual.width}x${actual.height}`;
        if (cfg.size && got !== cfg.size) {
          console.warn(
            `[images] Asked ${cfg.model} for ${cfg.size} and got ${got}. ` +
              `The provider is not honouring the size parameter for this model — ` +
              `changing it in Settings will keep having no effect until a value it accepts is used.`,
          );
        } else {
          console.log(`[images] ${cfg.model} returned ${got}`);
        }
      }

      // The extension follows what actually arrived. It was hard-coded to .webp
      // while the bytes were written through untouched, so a PNG from the model
      // landed on disk claiming to be something else.
      const ext = ({ webp: ".webp", png: ".png", jpg: ".jpg", jpeg: ".jpg", gif: ".gif" } as Record<string, string>)[
        String(actual?.type || "").toLowerCase()
      ] || ".webp";
      const fileName = `${uuidv4()}${ext}`;
      const filePath = path.join(aiImagesDir, fileName);

      fs.writeFileSync(filePath, buffer);

      return `/uploads/ai-images/${fileName}`;
    } catch (e) {
      console.error("Failed to store image locally, falling back to remote URL", e);
      return remoteUrl;
    }
  }

  /**
   * Portrait for an enemy.
   *
   * Enemies are written with their own image prompt (see services/worldBoss.ts),
   * so the usual path is simply "use what the AI already art-directed". The
   * art-director call below is the fallback for enemies created before that, and
   * it leans on the media's Codex when one exists rather than searching again.
   */
  async function generateBossImageBackground(userId: string, bossId: string) {
    try {
      const aiConfig = getAiConfig(db, userId);
      if (!aiConfig) return;
      const nanoGptKey = aiConfig.apiKey;

      const boss: any = db.prepare("SELECT * FROM world_bosses WHERE id = ? AND userId = ?").get(bossId, userId);
      if (!boss) return;
      const mediaItem: any = db.prepare("SELECT title, mediaType FROM media WHERE id = ?").get(boss.mediaId);
      const mediaTitle = mediaItem?.title || "an unknown work";
      const mediaType = mediaItem?.mediaType || "media";

      db.prepare("UPDATE world_bosses SET imageStatus = 'generating' WHERE id = ?").run(bossId);

      let imagePrompt = (boss.imagePrompt || "").trim();
      if (!imagePrompt) {
        imagePrompt = await writeBossImagePrompt(userId, boss, mediaTitle, mediaType);
        if (!imagePrompt) throw new Error("Empty boss prompt");
        db.prepare("UPDATE world_bosses SET imagePrompt = ? WHERE id = ?").run(imagePrompt, bossId);
      }

      const imageUrl = await internalGenerateImageWithNanoGpt(nanoGptKey, imagePrompt, BOSS_NEGATIVE_EXTRA);
      db.prepare("UPDATE world_bosses SET imageUrl = ?, imageStatus = 'done' WHERE id = ?").run(imageUrl, bossId);
    } catch (e) {
      console.error("Boss Image Background Gen Error:", e);
      // No auto-retry — mark as failed so the UI can offer a manual regenerate.
      try { db.prepare("UPDATE world_bosses SET imageStatus = 'failed' WHERE id = ?").run(bossId); } catch (_) {}
    }
  }

  /** Art-directs an enemy portrait for a boss that has no stored prompt. */
  async function writeBossImagePrompt(userId: string, boss: any, mediaTitle: string, mediaType: string): Promise<string> {
    const aiConfig = getAiConfig(db, userId);
    if (!aiConfig) return "";

    const codexRow = await codex.tryEnsureCodex(userId, { mediaId: boss.mediaId, title: mediaTitle, mediaType });
    const codexBlock = codexPromptBlock(codexRow);
    const styleBlock = codexArtStyleBlock(codexRow);
    const tier = enemyTier(boss.level || 1);
    const imageCfg = readImageConfig();
    const fullName = [boss.name, boss.title].filter(Boolean).join(", ");

    const prompt = `You are an expert art director writing ONE text-to-image prompt.

${promptCraft(imageCfg.model, imageCfg.distilled)}

SUBJECT: a single RPG enemy named "${fullName}", from the media "${mediaTitle}" (a ${mediaType}). It is ${tier.word}, and should look ${tier.look}, set against ${tier.scene}, caught ${tier.action}.${boss.description ? `\nIts flavour text reads: "${boss.description}"` : ""}

${codexBlock || `(No Codex is on record. Use web search to identify what "${boss.name}" is within "${mediaTitle}", and the authentic visual art style, medium and colour palette of "${mediaTitle}" itself.)`}

${styleBlock ? `${styleBlock}\n\nThat house style is the single most important thing to get right. The creature must look as though it was drawn by the same hand, for the same work — its medium, palette, light and line quality are not options.\n` : ""}
YOUR TASK: write ONE prompt describing this single character/creature so it looks like it genuinely belongs in "${mediaTitle}".

THE PROMPT MUST:
- OPEN with the creature itself — what it is and the most striking thing about how it looks. Everything else follows it.
- Render the entity in the ACTUAL art style and medium of "${mediaTitle}". NAME that style explicitly in the prompt using the house style above — the named craft terms are what an image model keys on, so use them verbatim rather than paraphrasing them into adjectives. Reference the franchise by name as well, to anchor the look. Do NOT default to generic 2D cartoon or flat vector art unless that truly matches the source.
- ${AUTHENTICITY(mediaTitle)}
- Depict ONE subject only, with a setting/background appropriate to its tier — never a busy crowd scene.
- Show it mid-action rather than posed: ${tier.action}. Frame it with ${tier.camera}. Never a neutral standing figure facing the lens — no mugshots, no line-ups, no posing for a photograph.
- Faithfully describe its anatomy, armor/weapons, materials, aura and expression, and let the tier drive everything: a Level 1 must look genuinely silly and harmless; a Level 5 must look like a monumental, epic final boss.
- ${SHARPNESS}
- Contain no watermarks, signatures or extra/duplicate characters.

Return ONLY the final image prompt text, nothing else.`;

    // Web search only where the Codex could not supply the facts.
    return nanoGenerateText(aiConfig, prompt, { temperature: 0.7, webSearch: !codexBlock, tier: "analytical" });
  }

  /**
   * Inventory icon for a piece of loot. Same deal as enemies: the loot generator
   * writes its own image prompt, and this falls back to art-directing one.
   */
  async function generateArtifactImageBackground(userId: string, artifactId: string) {
    try {
      const aiConfig = getAiConfig(db, userId);
      if (!aiConfig) return;
      const nanoGptKey = aiConfig.apiKey;

      const artifact: any = db.prepare("SELECT * FROM artifacts WHERE id = ? AND userId = ?").get(artifactId, userId);
      if (!artifact) return;
      const mediaItem: any = db.prepare("SELECT title, mediaType FROM media WHERE id = ?").get(artifact.mediaId);
      const mediaTitle = mediaItem?.title || "an unknown work";
      const mediaType = mediaItem?.mediaType || "media";

      db.prepare("UPDATE artifacts SET imageStatus = 'generating' WHERE id = ?").run(artifactId);

      let imagePrompt = (artifact.imagePrompt || "").trim();
      if (!imagePrompt) {
        imagePrompt = await writeArtifactImagePrompt(userId, artifact, mediaTitle, mediaType);
        if (!imagePrompt) throw new Error("Empty artifact prompt");
        db.prepare("UPDATE artifacts SET imagePrompt = ? WHERE id = ?").run(imagePrompt, artifactId);
      }

      const imageUrl = await internalGenerateImageWithNanoGpt(nanoGptKey, imagePrompt, LOOT_NEGATIVE_EXTRA);
      db.prepare("UPDATE artifacts SET imageUrl = ?, imageStatus = 'done' WHERE id = ?").run(imageUrl, artifactId);
    } catch (e) {
      console.error("Artifact Image Background Gen Error:", e);
      // No auto-retry — mark as failed so the UI can offer a manual regenerate.
      try { db.prepare("UPDATE artifacts SET imageStatus = 'failed' WHERE id = ?").run(artifactId); } catch (_) {}
    }
  }

  /** Art-directs a loot icon for an artifact that has no stored prompt. */
  async function writeArtifactImagePrompt(userId: string, artifact: any, mediaTitle: string, mediaType: string): Promise<string> {
    const aiConfig = getAiConfig(db, userId);
    if (!aiConfig) return "";

    const codexRow = await codex.tryEnsureCodex(userId, { mediaId: artifact.mediaId, title: mediaTitle, mediaType });
    const codexBlock = codexPromptBlock(codexRow);
    const styleBlock = codexArtStyleBlock(codexRow);
    const art = rarityArt(artifact.rarity || "Common");
    const imageCfg = readImageConfig();

    const prompt = `You are an expert art director writing ONE text-to-image prompt.

${promptCraft(imageCfg.model, imageCfg.distilled)}

SUBJECT: a single RPG loot item named "${artifact.name}", described as "${artifact.description}", from the media "${mediaTitle}". Rarity: ${artifact.rarity}. At this rarity the item should read as ${art.grandeur}, carrying ${art.aura}.

${codexBlock || `(No Codex is on record. Use web search to determine what "${artifact.name}" literally IS within "${mediaTitle}", and the authentic art style, medium and material language of "${mediaTitle}".)`}

${styleBlock ? `${styleBlock}\n\nThat house style is the single most important thing to get right. The object must look as though it was drawn by the same hand, for the same work — its medium, palette, light and material language are not options.\n` : ""}
YOUR TASK: write ONE prompt for a single game-inventory icon of this exact object.

THE PROMPT MUST:
- OPEN with the object itself — what it plainly is, and what it is made of. Everything else follows it.
- Keep the object TYPE literal and correct. If it is a sword it is a sword; a cassette tape a cassette; a book a book; a flower a flower. NEVER substitute a generic ring, gem, orb or "magic trinket" unless the item genuinely is one. Believable proportions, a recognizable real object.
- Render it in the ACTUAL art style and material design of "${mediaTitle}". NAME that style explicitly using the house style above, reusing its craft terms verbatim rather than paraphrasing them, and reference the franchise to anchor the look. Avoid generic flat cartoon icons.
- ${AUTHENTICITY(mediaTitle)}
- Scale the item's grandeur to its rarity: ${art.grandeur}.
- Present ONE hero item only, centered, as a polished inventory icon / studio product shot, on this rarity-specific background: ${art.background}. A soft contact shadow under the item.
- Describe its exact materials, shape, engravings and wear.
- ${SHARPNESS}
- No hands, no person, no extra props — just the single item on its background.

Return ONLY the final image prompt text, nothing else.`;

    return nanoGenerateText(aiConfig, prompt, { temperature: 0.7, webSearch: !codexBlock, tier: "analytical" });
  }

  return {
    internalGenerateImageWithNanoGpt,
    generateBossImageBackground,
    generateArtifactImageBackground,
  };
}
