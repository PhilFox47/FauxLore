import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";

/**
 * Image generation settings for NanoGPT's Z-Image-Turbo model.
 * Z-Image-Turbo is a distilled ~8-step text-to-image model: it wants a low step
 * count and a low guidance scale (CFG is baked into the distill; high CFG
 * over-saturates). Tweak here if NanoGPT updates the model/parameters.
 */
const IMAGE_GEN = {
  model: "z-image-turbo",
  size: "1536x1536",
  num_inference_steps: 8,
  guidance_scale: 1,
} as const;

/** AI image generation (Gemini art-direction prompt -> NanoGPT Z-Image-Turbo) and local storage. */
export function createImageService({ db, aiImagesDir }: { db: Db; aiImagesDir: string }) {
  async function internalGenerateImageWithNanoGpt(apiKey: string, prompt: string): Promise<string> {
    const res = await fetch("https://nano-gpt.com/api/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: IMAGE_GEN.model,
        prompt: prompt,
        size: IMAGE_GEN.size,
        num_inference_steps: IMAGE_GEN.num_inference_steps,
        guidance_scale: IMAGE_GEN.guidance_scale,
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

      const tierWord = bossLevel >= 5 ? "an epic, realm-ending final World Boss"
                     : bossLevel >= 4 ? "a major, menacing boss"
                     : bossLevel >= 3 ? "an elite mini-boss"
                     : bossLevel >= 2 ? "a common foot soldier"
                     : "a laughable, weak grunt";
      const tierLook = bossLevel >= 5 ? "awe-inspiring, screen-filling, exuding overwhelming aura and danger"
                     : bossLevel >= 3 ? "formidable, imposing and elite, well-equipped"
                     : "mundane and unimpressive, a low-threat minion or weak beast";

      const prompt = `You are an expert art director writing ONE text-to-image prompt for the "Z-Image-Turbo" model (a knowledgeable diffusion model that follows natural language and renders many art styles well).

SUBJECT: a single RPG enemy named "${bossName}", from the media "${mediaTitle}" (a ${mediaType}). It is ${tierWord} and should look ${tierLook}.

YOUR TASK:
1. Use Google Search to identify what "${bossName}" actually is within "${mediaTitle}", AND — crucially — the AUTHENTIC visual art style, medium and color palette of "${mediaTitle}" itself (e.g. gritty photoreal 3D, painterly anime key-art, cel-shaded, 16-bit pixel art, watercolor, dark-fantasy oil painting, claymation, comic ink, etc.).
2. Write ONE vivid prompt of 2-4 natural sentences describing this single character/creature so it looks like it genuinely belongs in "${mediaTitle}".

THE PROMPT MUST:
- Render the entity in the ACTUAL art style and medium of "${mediaTitle}". Explicitly name that style/medium, and you may reference the franchise by name to anchor the look. Do NOT default to generic 2D cartoon or flat vector art unless that truly matches the source.
- Depict ONE subject only: a striking character portrait or full-body hero shot, centered and isolated on a simple thematic or atmospheric backdrop — never a busy scene or wallpaper.
- Faithfully describe its anatomy, armor/weapons, materials, aura, posture and expression, scaled to its tier.
- Use cinematic lighting and an intensity that fits the tier.
- Contain NO text, letters, watermarks, logos, UI, borders, or extra characters.

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

      const imageUrl = await internalGenerateImageWithNanoGpt(nanoGptKey, imagePrompt);
      db.prepare("UPDATE world_bosses SET imageUrl = ? WHERE id = ?").run(imageUrl, bossId);
    } catch (e) {
      console.error("Boss Image Background Gen Error:", e);
    }
  }

  async function generateArtifactImageBackground(userId: string, artifactId: string, artifactName: string, artifactDesc: string, mediaTitle: string, rarity: string = "Common") {
    try {
      const sysSettings: any = db.prepare('SELECT geminiApiKey, nanoGptApiKey FROM system_settings WHERE id = \'system\'').get();
      const userSettings: any = db.prepare('SELECT geminiApiKey, nanoGptApiKey FROM settings WHERE userId = ?').get(userId);
      const geminiKey = userSettings?.geminiApiKey || sysSettings?.geminiApiKey || process.env.GEMINI_API_KEY;
      const nanoGptKey = userSettings?.nanoGptApiKey || sysSettings?.nanoGptApiKey;
      if (!geminiKey || !nanoGptKey) return;

      const rarityDesc = rarity === "Mythic" ? "a multi-colored, cosmic, reality-bending aura of god-like energy"
                       : rarity === "Legendary" ? "an intense golden aura and masterwork craftsmanship"
                       : rarity === "Epic" ? "ornate detailing and a vivid purple magical glow"
                       : rarity === "Rare" ? "a subtle, special blue shimmer"
                       : rarity === "Uncommon" || rarity === "Super Rare" ? "a faint magical sheen"
                       : "no magical glow — plain, ordinary, mundane gear";

      const prompt = `You are an expert art director writing ONE text-to-image prompt for the "Z-Image-Turbo" model (a knowledgeable diffusion model that follows natural language and renders many material/art styles well).

SUBJECT: a single RPG loot item named "${artifactName}", described as "${artifactDesc}", originating from the media "${mediaTitle}". Rarity: ${rarity}, which should read as ${rarityDesc}.

YOUR TASK:
1. Use Google Search to determine what "${artifactName}" literally IS — its real object type and shape — within "${mediaTitle}", AND the AUTHENTIC art style, medium and material language of "${mediaTitle}".
2. Write ONE vivid prompt of 2-4 natural sentences for a single game-inventory icon of this exact object.

THE PROMPT MUST:
- Keep the object TYPE literal and correct. If it is a sword it is a sword; a cassette tape a cassette; a book a book; a flower a flower. NEVER substitute a generic ring, gem, orb or "magic trinket" unless the item genuinely is one. Use believable proportions and a recognizable real object.
- Render it in the ACTUAL art style and material design of "${mediaTitle}". Explicitly name that style/medium and you may reference the franchise to anchor the look. Avoid generic flat cartoon icons.
- Present ONE hero item only, centered and isolated as a polished inventory icon / studio product shot on a dark, neutral or subtly-gradient background, with clean studio lighting and a soft contact shadow.
- Describe its exact materials, shape, engravings and wear, plus the ${rarity}-appropriate aura/glow above (subtle for low rarity, intense and ornate for high rarity).
- Contain NO text, letters, watermarks, logos, UI, hands, extra props or clutter — just the single item.

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

      const imageUrl = await internalGenerateImageWithNanoGpt(nanoGptKey, imagePrompt);
      db.prepare("UPDATE artifacts SET imageUrl = ? WHERE id = ?").run(imageUrl, artifactId);
    } catch (e) {
      console.error("Artifact Image Background Gen Error:", e);
    }
  }

  return {
    internalGenerateImageWithNanoGpt,
    generateBossImageBackground,
    generateArtifactImageBackground,
  };
}
