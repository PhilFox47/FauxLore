import { GoogleGenAI, Type } from "@google/genai";

export async function generateGeminiText(userApiKey: string | undefined, systemPrompt: string, userPrompt: string, temperature: number = 0.9) {
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
        temperature: temperature
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

  const validGenres = taxonomies.filter(t => t.type === 'genre').map(t => t.name);
  const validTags = taxonomies.filter(t => t.type === 'tag').map(t => t.name);

  const gptSystem = `You are FauxLore, an expert taxonomy system. Your job is to classify media.
Existing Genres: ${validGenres.join(', ')}
Existing Tags: ${validTags.join(', ')}

Rules:
1. Strongly prefer using exact matches from the Existing lists above.
2. ONLY invent a new Genre or Tag if it is ABSOLUTELY ESSENTIAL and the media cannot be properly described without it. Do not do this lightly.
3. Select between 1 and 3 core Genres. ONLY use up to 5 if absolutely essential.
4. Select between 3 and 10 highly relevant Tags. ONLY use more (up to 15) if absolutely essential. Be strict and focused - less is often more.
5. NO DUPLICATES: A term can be a Genre OR a Tag, never both. Do not use an existing Genre as a Tag, or an existing Tag as a Genre.
6. USE YOUR WEB SEARCH CAPABILITIES to confirm details about "${item.title}" (${item.mediaType}).
7. Return ONLY a pure JSON object in this exact format:
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

    const parsed = JSON.parse(jsonText);
    
    // Cross-污染 cleanup: ensure known genres aren't tags, and known tags aren't genres
    const finalGenres = new Set<string>();
    const finalTags = new Set<string>();

    const getKnownGenre = (val: string) => validGenres.find(g => g.toLowerCase() === val.toLowerCase());
    const getKnownTag = (val: string) => validTags.find(t => t.toLowerCase() === val.toLowerCase());

    if (Array.isArray(parsed.genres)) {
      for (let g of parsed.genres) {
        g = g.trim();
        const knownTag = getKnownTag(g);
        const knownGenre = getKnownGenre(g);
        
        if (knownTag && !knownGenre) {
          finalTags.add(knownTag);
        } else {
          finalGenres.add(knownGenre || g);
        }
      }
    }

    if (Array.isArray(parsed.tags)) {
      for (let t of parsed.tags) {
        t = t.trim();
        const knownGenre = getKnownGenre(t);
        const knownTag = getKnownTag(t);
        
        if (knownGenre && !knownTag) {
          finalGenres.add(knownGenre);
        } else {
          finalTags.add(knownTag || t);
        }
      }
    }

    parsed.genres = Array.from(finalGenres);
    parsed.tags = Array.from(finalTags);

    return parsed;
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

  // Pre-determine Bonus Effect via software-level RNG
  let targetType = oldArtifact?.targetType || 'MediaType';
  let targetValue = oldArtifact?.targetValue || '';

  if (!oldArtifact) {
    const hasGenre = item.genres && item.genres.length > 0;
    const hasTag = item.tags && item.tags.length > 0;
    const hasFranchise = item.franchises && item.franchises.length > 0;

    let pool = [];
    if (hasGenre) pool.push({ type: 'Genre', weight: 25 });
    if (hasTag) pool.push({ type: 'Tag', weight: 25 });
    if (hasFranchise) pool.push({ type: 'Franchise', weight: 30 });
    pool.push({ type: 'MediaType', weight: 20 });

    let totalWeight = pool.reduce((acc, curr) => acc + curr.weight, 0);
    let r = Math.random() * totalWeight;
    let currentWeight = 0;
    for (const option of pool) {
      currentWeight += option.weight;
      if (r <= currentWeight) {
        targetType = option.type;
        break;
      }
    }

    if (targetType === 'Genre') {
      targetValue = item.genres[Math.floor(Math.random() * item.genres.length)];
    } else if (targetType === 'Tag') {
      targetValue = item.tags[Math.floor(Math.random() * item.tags.length)];
    } else if (targetType === 'Franchise') {
      targetValue = item.franchises[Math.floor(Math.random() * item.franchises.length)];
    } else if (targetType === 'MediaType') {
      const allMediaTypes = ['Game', 'Visual Novel', 'Book', 'Manga', 'Series', 'Comic', 'Movie'];
      const otherMediaTypes = allMediaTypes.filter(m => m !== item.mediaType);
      targetValue = otherMediaTypes[Math.floor(Math.random() * otherMediaTypes.length)];
    }
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

Media Context:
${contextSnippet}

PRE-DETERMINED ATTRIBUTES:
- Rarity: ${rarity}
- Slot: ${slot} (Conceptually fit this slot. Head=hat/helmet, Body=armor/clothing, etc.)
- Bonus Effect: Grants a bonus to ${targetType}: "${targetValue}"

REQUIREMENTS:
1. Ensure the Item Name and Description perfectly match the specified Rarity, Slot, and Bonus Effect.
2. Target Rarity: ${rarity} (Adjust the "epicness". Common is mundane, Legendary/Mythic are world-altering).
3. The item name should be clever, thematic (max 4 words), and sound like a tangible item you would equip in the "${slot}" slot. Let the rarity guide how grand the name sounds.
4. The description should be 1-2 sentences of high-quality RPG flavor text mentioning lore details found via your search. It MUST subtly hint at the Bonus Effect (${targetType}: "${targetValue}").
5. The type should be a logical RPG category that fits the slot (e.g., Weapon, Relic, Armor, Helmet, Trinket, Consumable, etc.).

Return EXACTLY and ONLY a pure JSON object with the following keys:
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
      slot: slot || "Accessory",
      targetType: targetType,
      targetValue: targetValue,
      bonusPercent,
      rarity
    };
  } catch (error) {
    console.error("Gemini Artifact Generation Error:", error);
    throw error;
  }
}
