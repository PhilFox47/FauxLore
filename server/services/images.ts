import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";

/** AI image generation (Gemini prompt -> NanoGPT Chroma image) and local storage. */
export function createImageService({ db, aiImagesDir }: { db: Db; aiImagesDir: string }) {
  async function internalGenerateImageWithNanoGpt(apiKey: string, prompt: string): Promise<string> {
    const res = await fetch("https://nano-gpt.com/api/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "chroma",
        prompt: prompt,
        size: "1536x1536",
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

      const styleDesc = bossLevel >= 5 ? "looks incredibly epic, intimidating, and legendary, exuding aura and extreme danger." 
                      : bossLevel >= 3 ? "looks formidable and elite, quite imposing and well-equipped." 
                      : "looks relatively mundane, like a common foot soldier, grunt, or weak beast.";

      const prompt = `You are an expert AI image prompt engineer. An RPG boss named "${bossName}" has been encountered for the media "${mediaTitle}" (Type: ${mediaType}).
Create a highly detailed, descriptive image prompt for the Chroma model to generate an image of ONLY the boss character or entity itself isolated, looking like an RPG icon or portrait, NOT a full background wallpaper. 
The boss ${styleDesc} 
Contextualize it perfectly to fit the world, lore, and visual aesthetic of "${mediaTitle}". Describe its armor, weapons, aura, posture, and facial expression depending on its description. Use a dark, epic RPG style.
Return ONLY the raw prompt text, nothing else.`;

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

      const rarityDesc = rarity === "Mythic" ? "is a multi-colored cosmic and impossible artifact, pulsing with god-like energy." 
                       : rarity === "Legendary" ? "is legendary, glowing with a golden, intense aura and extreme craftsmanship." 
                       : rarity === "Epic" ? "is epic, adorned with purple magical effects and ornate details."
                       : rarity === "Rare" ? "is rare, looking special with a faint blue glow."
                       : "is common and mundane, looking like standard, ordinary gear with no magical glow.";

      const prompt = `You are an expert AI image prompt engineer. An RPG loot item (artifact) named "${artifactName}" with the description "${artifactDesc}" has been found. It originates from the media "${mediaTitle}".
Create a highly detailed, descriptive image prompt for the Chroma model to generate an image of ONLY the artifact itself as a single item icon on a dark, neutral background.
CRITICAL INSTRUCTION: Use Google Search to look up the item "${artifactName}" and the media "${mediaTitle}" to understand what the item actually is and what it looks like. Then, ensure the physical shape, literal object, and material mentioned in the name and description MUST be the exact subject of the image (e.g. if it's a tape spool, it must be a plastic tape spool, if it's a book, it must be a book). Do not turn the object into a stone ring, gem, or generic magical item unless specified.
The item's aura and magic ${rarityDesc} 
Contextualize its design to fit the world, lore, and visual aesthetic of "${mediaTitle}", but NEVER change the fundamental object type. Describe its physical materials, exact shape, engravings, and visual effects based heavily on its description.
Return ONLY the raw prompt text, nothing else.`;

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
