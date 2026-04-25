import { GoogleGenAI, Type } from "@google/genai";

export async function generateAiArtifactWithGemini(userApiKey: string | undefined, item: any) {
  // Use the provided key from settings, fallback to environment variable
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("Gemini API Key is not configured. Please set it in Settings -> API Integrations.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Generate rarity based on distribution (consistent with the app's RPG system)
  const rand = Math.random() * 100;
  let rarity = 'Common';
  if (rand < 5) rarity = 'Mythic';
  else if (rand < 15) rarity = 'Legendary';
  else if (rand < 30) rarity = 'Super Rare';
  else if (rand < 50) rarity = 'Rare';
  else if (rand < 75) rarity = 'Uncommon';
  else rarity = 'Common';

  const contextSnippet = `
Title: ${item.title}
Type: ${item.mediaType}
Creator/Author: ${item.creator || item.publisher || 'Unknown'}
Synopsis/Description: ${item.description || 'No description provided.'}
Genres: ${item.genres?.join(", ") || 'N/A'}
Tags: ${item.tags?.join(", ") || 'N/A'}
`;

  const prompt = `You are a legendary RPG Loot Master. The user has just finished or made significant progress in a piece of media. 
Your task is to generate a unique, flavor-rich Artifact that deeply references the lore, characters, themes, or signature items of this media.

USE YOUR WEB SEARCH CAPABILITIES to confirm details about "${item.title}" (${item.mediaType}) so the loot feels authentic and "inside-baseball" for fans. 
For example: 
- If it's a TV show, reference a specific plot point or character's signature item.
- If it's a game, reference a specific rare drop or lore-heavy relic.
- If it's a book, reference a peculiar magical item or a character's defining possession.

Media Context:
${contextSnippet}

REQUIREMENTS:
1. Target Rarity: ${rarity}
2. The item name should be clever and thematic (max 4 words).
3. The description should be 1-2 sentences of high-quality RPG flavor text that mentions lore details found via your search.
4. The type should be a logical RPG category (Weapon, Relic, Armor, Spell, Trinket, Consumable, etc.).

Return EXACTLY and ONLY a JSON object with the following keys:
{
  "name": "The item name",
  "description": "The flavor text",
  "type": "The RPG item type"
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [
          { googleSearch: {} }
        ]
      }
    });

    let jsonText = response.text;
    if (!jsonText) {
      throw new Error("Gemini returned an empty response.");
    }

    // Clean up potential markdown JSON block
    const match = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      jsonText = match[1];
    } else {
      // Sometimes it might not include the json identifier but still be backticked
      const rawMatch = jsonText.match(/```\s*([\s\S]*?)\s*```/);
      if (rawMatch) {
        jsonText = rawMatch[1];
      }
    }
    jsonText = jsonText.trim();

    const parsed = JSON.parse(jsonText);
    
    return {
      name: parsed.name || "Mysterious Artifact",
      description: parsed.description || "An item of unknown origin.",
      type: parsed.type || "Trinket",
      rarity
    };
  } catch (error) {
    console.error("Gemini Artifact Generation Error:", error);
    throw error;
  }
}
