import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";

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
const BOSS_NEGATIVE_EXTRA = "multiple characters, duplicate, collage, cluttered scene";
const LOOT_NEGATIVE_EXTRA = "hands, fingers, person, multiple items, cluttered scene, environment, landscape";

// Sharpness directive shared by both prompts (counters Z-Image-Turbo softness).
const SHARPNESS = "Render with sharp focus, crisp clean detail and even, clear lighting. Avoid heavy bokeh, shallow depth of field, soft focus and excessive vignette.";

// Authentic-franchise directive — let it borrow real iconography from the source.
const AUTHENTICITY = (media: string) =>
  `Incorporate authentic, recognizable iconography from "${media}" — real emblems, logos, insignia, branding, color schemes, fonts and motifs — wherever they naturally belong (for example, a festival event pass should bear that festival's actual real logo and branding; a known character should resemble their real design). Reproduce the franchise's genuine design language as faithfully as possible.`;

/** Per-rarity art direction for loot: how grand the item is, its aura, and its background. */
function rarityArt(rarity: string): { grandeur: string; aura: string; background: string } {
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

/** Per-level art direction for enemies: silly weakling (1) up to epic final boss (5). */
function enemyTier(level: number): { word: string; look: string; scene: string } {
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

/** AI image generation (Gemini art-direction prompt -> NanoGPT Z-Image-Turbo) and local storage. */
export function createImageService({ db, aiImagesDir }: { db: Db; aiImagesDir: string }) {
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

  async function generateBossImageBackground(userId: string, bossId: string, bossName: string, mediaTitle: string, mediaType: string, bossLevel: number = 1) {
    try {
      const sysSettings: any = db.prepare('SELECT geminiApiKey, nanoGptApiKey FROM system_settings WHERE id = \'system\'').get();
      const userSettings: any = db.prepare('SELECT geminiApiKey, nanoGptApiKey FROM settings WHERE userId = ?').get(userId);
      const geminiKey = userSettings?.geminiApiKey || sysSettings?.geminiApiKey || process.env.GEMINI_API_KEY;
      const nanoGptKey = userSettings?.nanoGptApiKey || sysSettings?.nanoGptApiKey;
      if (!geminiKey || !nanoGptKey) return;

      db.prepare("UPDATE world_bosses SET imageStatus = 'generating' WHERE id = ?").run(bossId);
      const tier = enemyTier(bossLevel);

      const prompt = `You are an expert art director writing ONE text-to-image prompt for the "Z-Image-Turbo" model (a knowledgeable diffusion model that follows natural language and renders many art styles well, including real text and logos).

SUBJECT: a single RPG enemy named "${bossName}", from the media "${mediaTitle}" (a ${mediaType}). It is ${tier.word}, and should look ${tier.look}, set against ${tier.scene}.

YOUR TASK:
1. Use Google Search to identify what "${bossName}" actually is within "${mediaTitle}", AND — crucially — the AUTHENTIC visual art style, medium and color palette of "${mediaTitle}" itself (e.g. gritty photoreal 3D, painterly anime key-art, cel-shaded, 16-bit pixel art, watercolor, dark-fantasy oil painting, claymation, comic ink, etc.).
2. Write ONE vivid prompt of 2-4 natural sentences describing this single character/creature so it looks like it genuinely belongs in "${mediaTitle}".

THE PROMPT MUST:
- Render the entity in the ACTUAL art style and medium of "${mediaTitle}". Explicitly name that style/medium, and reference the franchise by name to anchor the look. Do NOT default to generic 2D cartoon or flat vector art unless that truly matches the source.
- ${AUTHENTICITY(mediaTitle)}
- Depict ONE subject only: a striking character portrait or full-body hero shot, centered, with a setting/background appropriate to its tier — never a busy crowd scene.
- Faithfully describe its anatomy, armor/weapons, materials, aura, posture and expression, and let the tier drive everything: a Level 1 must look genuinely silly and harmless; a Level 5 must look like a monumental, epic final boss.
- ${SHARPNESS}
- Contain no watermarks, signatures or extra/duplicate characters.

Return ONLY the final image prompt text, nothing else.`;

      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.7 }
        })
      });

      if (!aiRes.ok) throw new Error("Failed to generate boss prompt");
      const data = await aiRes.json();
      const imagePrompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!imagePrompt) throw new Error("Empty boss prompt");

      const imageUrl = await internalGenerateImageWithNanoGpt(nanoGptKey, imagePrompt, BOSS_NEGATIVE_EXTRA);
      db.prepare("UPDATE world_bosses SET imageUrl = ?, imageStatus = 'done' WHERE id = ?").run(imageUrl, bossId);
    } catch (e) {
      console.error("Boss Image Background Gen Error:", e);
      // No auto-retry — mark as failed so the UI can offer a manual regenerate.
      try { db.prepare("UPDATE world_bosses SET imageStatus = 'failed' WHERE id = ?").run(bossId); } catch (_) {}
    }
  }

  async function generateArtifactImageBackground(userId: string, artifactId: string, artifactName: string, artifactDesc: string, mediaTitle: string, rarity: string = "Common") {
    try {
      const sysSettings: any = db.prepare('SELECT geminiApiKey, nanoGptApiKey FROM system_settings WHERE id = \'system\'').get();
      const userSettings: any = db.prepare('SELECT geminiApiKey, nanoGptApiKey FROM settings WHERE userId = ?').get(userId);
      const geminiKey = userSettings?.geminiApiKey || sysSettings?.geminiApiKey || process.env.GEMINI_API_KEY;
      const nanoGptKey = userSettings?.nanoGptApiKey || sysSettings?.nanoGptApiKey;
      if (!geminiKey || !nanoGptKey) return;

      db.prepare("UPDATE artifacts SET imageStatus = 'generating' WHERE id = ?").run(artifactId);
      const art = rarityArt(rarity);

      const prompt = `You are an expert art director writing ONE text-to-image prompt for the "Z-Image-Turbo" model (a knowledgeable diffusion model that follows natural language and renders many material/art styles well, including real text and logos).

SUBJECT: a single RPG loot item named "${artifactName}", described as "${artifactDesc}", from the media "${mediaTitle}". Rarity: ${rarity}. At this rarity the item should read as ${art.grandeur}, carrying ${art.aura}.

YOUR TASK:
1. Use Google Search to determine what "${artifactName}" literally IS — its real object type and shape — within "${mediaTitle}", AND the AUTHENTIC art style, medium and material language of "${mediaTitle}".
2. Write ONE vivid prompt of 2-4 natural sentences for a single game-inventory icon of this exact object.

THE PROMPT MUST:
- Keep the object TYPE literal and correct. If it is a sword it is a sword; a cassette tape a cassette; a book a book; a flower a flower. NEVER substitute a generic ring, gem, orb or "magic trinket" unless the item genuinely is one. Believable proportions, a recognizable real object.
- Render it in the ACTUAL art style and material design of "${mediaTitle}". Name that style/medium and reference the franchise to anchor the look. Avoid generic flat cartoon icons.
- ${AUTHENTICITY(mediaTitle)}
- Scale the item's grandeur to its rarity: ${art.grandeur}.
- Present ONE hero item only, centered, as a polished inventory icon / studio product shot, on this rarity-specific background: ${art.background}. A soft contact shadow under the item.
- Describe its exact materials, shape, engravings and wear.
- ${SHARPNESS}
- No hands, no person, no extra props — just the single item on its background.

Return ONLY the final image prompt text, nothing else.`;

      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.7 }
        })
      });

      if (!aiRes.ok) throw new Error("Failed to generate artifact prompt");
      const data = await aiRes.json();
      const imagePrompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!imagePrompt) throw new Error("Empty artifact prompt");

      const imageUrl = await internalGenerateImageWithNanoGpt(nanoGptKey, imagePrompt, LOOT_NEGATIVE_EXTRA);
      db.prepare("UPDATE artifacts SET imageUrl = ?, imageStatus = 'done' WHERE id = ?").run(imageUrl, artifactId);
    } catch (e) {
      console.error("Artifact Image Background Gen Error:", e);
      // No auto-retry — mark as failed so the UI can offer a manual regenerate.
      try { db.prepare("UPDATE artifacts SET imageStatus = 'failed' WHERE id = ?").run(artifactId); } catch (_) {}
    }
  }

  return {
    internalGenerateImageWithNanoGpt,
    generateBossImageBackground,
    generateArtifactImageBackground,
  };
}
