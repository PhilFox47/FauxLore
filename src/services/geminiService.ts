import { GoogleGenAI, Type } from "@google/genai";

export async function generateGeminiText(userApiKey: string | undefined, systemPrompt: string, userPrompt: string) {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("Gemini API Key is not configured. Please set it in Settings -> API Integrations.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
      ],
      config: {
        temperature: 0.9
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Gemini Text Gen Error:", error);
    throw error;
  }
}

export async function generateAiTagsWithGemini(userApiKey: string | undefined, item: any, taxonomies: any[]) {

  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("Gemini API Key is not configured. Please set it in Settings -> API Integrations.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const gptSystem = `You are FauxLore, an expert taxonomy system. Your job is to classify media.
Available Genres: ${taxonomies.filter(t => t.type === 'genre').map(t => t.name).join(', ')}
Available Tags: ${taxonomies.filter(t => t.type === 'tag').map(t => t.name).join(', ')}

Rules:
1. ONLY use exact matches from the Available lists above. DO NOT invent new words.
2. Select between 1 and 5 Genres.
3. Select between 5 and 30 logical Tags.
4. USE YOUR WEB SEARCH CAPABILITIES to confirm details about "${item.title}" (${item.mediaType}).
5. Return ONLY a pure JSON object in this exact format:
{"genres": ["Genre1", "Genre2"], "tags": ["Tag1", "Tag2"]}
Do not wrap it in markdown. Do not include any explanations.`;

  const gptUser = `Please tag the following media:
Title: ${item.title}
Type: ${item.mediaType}
Description: ${item.description || 'N/A'}
Legacy Context genres: ${item.genres?.join(', ') || 'N/A'}
Legacy Context tags: ${item.tags?.join(', ') || 'N/A'}
Legacy Context platforms: ${item.platforms?.join(', ') || 'N/A'}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: 'user', parts: [{ text: gptSystem + '\n\n' + gptUser }] }
      ],
      config: {
        tools: [
          { googleSearch: {} }
        ],
        temperature: 0.1
      }
    });

    let jsonText = response.text;
    if (!jsonText) throw new Error("Gemini returned an empty response.");

    const match = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      jsonText = match[1];
    } else {
      const rawMatch = jsonText.match(/```\s*([\s\S]*?)\s*```/);
      if (rawMatch) jsonText = rawMatch[1];
    }
    jsonText = jsonText.trim();

    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Gemini Auto-Tag Error:", error);
    throw error;
  }
}

export async function generateAiArtifactWithGemini(userApiKey: string | undefined, item: any, oldArtifact?: any) {
  // Use the provided key from settings, fallback to environment variable
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("Gemini API Key is not configured. Please set it in Settings -> API Integrations.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Generate rarity and slot based on distribution (consistent with the app's RPG system)
  let rarity = oldArtifact?.rarity || 'Common';
  let slot = oldArtifact?.slot;
  if (!oldArtifact) {
    const rand = Math.random() * 100;
    if (rand < 5) rarity = 'Mythic';
    else if (rand < 15) rarity = 'Legendary';
    else if (rand < 30) rarity = 'Super Rare';
    else if (rand < 50) rarity = 'Rare';
    else if (rand < 75) rarity = 'Uncommon';
    else rarity = 'Common';
    
    const slots = ['Head', 'Body', 'Legs', 'Primary', 'Secondary', 'Accessory'];
    slot = slots[Math.floor(Math.random() * slots.length)];
  }

  const contextSnippet = `
Title: ${item.title}
Type: ${item.mediaType}
Creator/Author: ${item.creator || item.publisher || 'Unknown'}
Synopsis/Description: ${item.description || 'No description provided.'}
Genres: ${item.genres?.join(", ") || 'N/A'}
Tags: ${item.tags?.join(", ") || 'N/A'}
`;

  const legacySnippet = oldArtifact ? `\nThe item is a legacy artifact! You MUST incorporate its essence.
Legacy Name: ${oldArtifact.name}
Legacy Description: ${oldArtifact.description}` : '';

  const prompt = `You are a legendary RPG Loot Master. The user has just finished or made significant progress in a piece of media. 
Your task is to generate a unique, flavor-rich Artifact that deeply references the lore, characters, themes, or signature items of this media.${legacySnippet}

USE YOUR WEB SEARCH CAPABILITIES to confirm details about "${item.title}" (${item.mediaType}) so the loot feels authentic and "inside-baseball" for fans. 
For example: 
- If it's a TV show, reference a specific plot point or character's signature item.
- If it's a game, reference a specific rare drop or lore-heavy relic.
- If it's a book, reference a peculiar magical item or a character's defining possession.

Media Context:
${contextSnippet}

REQUIREMENTS:
1. Target Rarity: ${rarity} (Adjust the "epicness" of the item name and description based on this. Common is mundane, Legendary/Mythic are world-altering.)
2. The item name should be clever and thematic (max 4 words). Let the rarity guide how grand the name sounds.
3. The description should be 1-2 sentences of high-quality RPG flavor text that mentions lore details found via your search. If the item grants a specific bonus (e.g. to a genre or franchise), weave a subtle hint to that effect into the description!
4. The item slot ${slot ? `MUST exactly be "${slot}"` : `must be picked from: Head, Body, Legs, Primary, Secondary, Accessory`}. Make sure the item conceptually fits this slot (e.g., if Body, it should be armor/clothing; if Head, it should be a hat/helmet; if Primary, a main weapon).
5. The type should be a logical RPG category that fits the slot (Weapon, Relic, Armor, Spell, Trinket, Consumable, etc.).
6. The item MUST provide a bonus to a specific category. Pick a targetType from ["Genre", "Franchise", "MediaType"] and a targetValue based on the media context (e.g. if targetType is Genre, targetValue could be "Sci-Fi").
   - If targetType is "MediaType", targetValue MUST be "${item.mediaType}".
   - If targetType is "Genre", targetValue MUST be one of: "${item.genres?.[0] || 'General'}" (pick a primary genre).
   - If targetType is "Franchise", targetValue MUST be exactly this string: "${item.franchises?.[0] || 'None'}". If none exists, do NOT use Franchise.

Return EXACTLY and ONLY a JSON object with the following keys:
{
  "name": "The item name",
  "description": "The flavor text",
  "type": "The RPG item type",
  "slot": "${slot ? slot : `Pick exactly one of: Head, Body, Legs, Primary, Secondary, Accessory`}",
  "targetType": "Genre, Franchise, or MediaType",
  "targetValue": "The specific genre, franchise, or media type"
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
    
    let bonusPercent = 20;
    if (rarity === 'Mythic') bonusPercent = 300;
    else if (rarity === 'Legendary') bonusPercent = 150;
    else if (rarity === 'Epic') bonusPercent = 125;
    else if (rarity === 'Super Rare') bonusPercent = 100;
    else if (rarity === 'Rare') bonusPercent = 75;
    else if (rarity === 'Uncommon') bonusPercent = 40;

    return {
      name: parsed.name || "Mysterious Artifact",
      description: parsed.description || "An item of unknown origin.",
      type: parsed.type || "Trinket",
      slot: parsed.slot || "Accessory",
      targetType: parsed.targetType || "MediaType",
      targetValue: parsed.targetValue || item.mediaType,
      bonusPercent,
      rarity
    };
  } catch (error) {
    console.error("Gemini Artifact Generation Error:", error);
    throw error;
  }
}
