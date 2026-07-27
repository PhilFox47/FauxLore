import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";
import { getAiConfig, nanoGenerateText } from "../lib/ai";
import { AUTHENTICITY, SHARPNESS, enemyTier, rarityArt } from "../lib/artDirection";
import { codexPromptBlock, type CodexService } from "./codex";

/**
 * Default image-generation settings for NanoGPT's Z-Image-Turbo model.
 * These are overridable per-deployment from the Admin "System & Keys" settings
 * (system_settings.image* columns); the values here are the fallbacks.
 *
 * Z-Image-Turbo is a distilled few-step model. 1024x1024 is its sweet spot
 * (higher res gets softer/distorted). It only honours the negative prompt when
 * guidance (CFG) > 1, so we keep CFG ~1.5 (the 1.5-2.0 band; 4+ over-saturates).
 */
const IMAGE_DEFAULTS = {
  model: "z-image-turbo",
  size: "1024x1024",
  steps: 10,
  guidance: 1.5,
  negative: "watermark, signature, low quality, blurry, soft focus, out of focus, bokeh, shallow depth of field, heavy vignette, jpeg artifacts, deformed, disfigured, bad anatomy, extra limbs, cropped, oversaturated",
};

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
    return {
      model: row.imageModel || IMAGE_DEFAULTS.model,
      size: row.imageSize || IMAGE_DEFAULTS.size,
      steps: row.imageSteps ?? IMAGE_DEFAULTS.steps,
      guidance: row.imageGuidance ?? IMAGE_DEFAULTS.guidance,
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
        num_inference_steps: cfg.steps,
        guidance_scale: cfg.guidance,
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

      const fileName = `${uuidv4()}.webp`;
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
    const tier = enemyTier(boss.level || 1);
    const fullName = [boss.name, boss.title].filter(Boolean).join(", ");

    const prompt = `You are an expert art director writing ONE text-to-image prompt for the "Z-Image-Turbo" model (a knowledgeable diffusion model that follows natural language and renders many art styles well, including real text and logos).

SUBJECT: a single RPG enemy named "${fullName}", from the media "${mediaTitle}" (a ${mediaType}). It is ${tier.word}, and should look ${tier.look}, set against ${tier.scene}, caught ${tier.action}.${boss.description ? `\nIts flavour text reads: "${boss.description}"` : ""}

${codexBlock || `(No Codex is on record. Use web search to identify what "${boss.name}" is within "${mediaTitle}", and the authentic visual art style, medium and colour palette of "${mediaTitle}" itself.)`}

YOUR TASK: write ONE vivid prompt of 2-4 natural sentences describing this single character/creature so it looks like it genuinely belongs in "${mediaTitle}".

THE PROMPT MUST:
- Render the entity in the ACTUAL art style and medium of "${mediaTitle}"${codexRow?.data?.artStyle?.summary ? ` (the Codex records it as: ${codexRow.data.artStyle.summary})` : ""}. Explicitly name that style/medium, and reference the franchise by name to anchor the look. Do NOT default to generic 2D cartoon or flat vector art unless that truly matches the source.
- ${AUTHENTICITY(mediaTitle)}
- Depict ONE subject only, with a setting/background appropriate to its tier — never a busy crowd scene.
- Show it mid-action rather than posed: ${tier.action}. Frame it with ${tier.camera}. Never a neutral standing figure facing the lens — no mugshots, no line-ups, no posing for a photograph.
- Faithfully describe its anatomy, armor/weapons, materials, aura and expression, and let the tier drive everything: a Level 1 must look genuinely silly and harmless; a Level 5 must look like a monumental, epic final boss.
- ${SHARPNESS}
- Contain no watermarks, signatures or extra/duplicate characters.

Return ONLY the final image prompt text, nothing else.`;

    // Web search only where the Codex could not supply the facts.
    return nanoGenerateText(aiConfig, prompt, { temperature: 0.7, webSearch: !codexBlock });
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
    const art = rarityArt(artifact.rarity || "Common");

    const prompt = `You are an expert art director writing ONE text-to-image prompt for the "Z-Image-Turbo" model (a knowledgeable diffusion model that follows natural language and renders many material/art styles well, including real text and logos).

SUBJECT: a single RPG loot item named "${artifact.name}", described as "${artifact.description}", from the media "${mediaTitle}". Rarity: ${artifact.rarity}. At this rarity the item should read as ${art.grandeur}, carrying ${art.aura}.

${codexBlock || `(No Codex is on record. Use web search to determine what "${artifact.name}" literally IS within "${mediaTitle}", and the authentic art style, medium and material language of "${mediaTitle}".)`}

YOUR TASK: write ONE vivid prompt of 2-4 natural sentences for a single game-inventory icon of this exact object.

THE PROMPT MUST:
- Keep the object TYPE literal and correct. If it is a sword it is a sword; a cassette tape a cassette; a book a book; a flower a flower. NEVER substitute a generic ring, gem, orb or "magic trinket" unless the item genuinely is one. Believable proportions, a recognizable real object.
- Render it in the ACTUAL art style and material design of "${mediaTitle}"${codexRow?.data?.artStyle?.summary ? ` (the Codex records it as: ${codexRow.data.artStyle.summary})` : ""}. Name that style/medium and reference the franchise to anchor the look. Avoid generic flat cartoon icons.
- ${AUTHENTICITY(mediaTitle)}
- Scale the item's grandeur to its rarity: ${art.grandeur}.
- Present ONE hero item only, centered, as a polished inventory icon / studio product shot, on this rarity-specific background: ${art.background}. A soft contact shadow under the item.
- Describe its exact materials, shape, engravings and wear.
- ${SHARPNESS}
- No hands, no person, no extra props — just the single item on its background.

Return ONLY the final image prompt text, nothing else.`;

    return nanoGenerateText(aiConfig, prompt, { temperature: 0.7, webSearch: !codexBlock });
  }

  return {
    internalGenerateImageWithNanoGpt,
    generateBossImageBackground,
    generateArtifactImageBackground,
  };
}
