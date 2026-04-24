export async function generateAiRecapText(apiKey: string, model: string, prompt: string) {
  if (!apiKey) throw new Error("Nano-GPT API Key is missing. Please configure it in Settings.");
  
  const res = await fetch("https://nano-gpt.com/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini", // Cost efficient model fallback
      messages: [
        { role: "system", content: "You are FauxLore's creative recap generator. Keep it engaging, flavorful, and match the 'Faux Brand' identity (quirky, tracking enthusiast, fun). Generate a succinct JSON response containing exactly two fields: 'title' (a punchy, creative title of 1-5 words maximum, string) and 'summary' (a highly detailed, Markdown-formatted narrative summarizing the data with multiple paragraphs, string)." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("NanoGPT error:", errorText);
    throw new Error(`Nano-GPT Error: ${res.statusText}`);
  }

  const data = await res.json();
  const messageContent = data.choices[0].message.content;
  try {
    return JSON.parse(messageContent);
  } catch (e) {
    console.error("Failed to parse JSON from NanoGPT:", messageContent);
    return { title: "Error generating title", summary: "Failed to generate proper JSON summary." };
  }
}

export async function generateAiArtifact(apiKey: string, model: string, item: any) {
  if (!apiKey) throw new Error("Nano-GPT API Key is missing. Please configure it in Settings.");

  // Generate rarity based on distribution
  const rand = Math.random() * 100;
  let rarity = 'Common';
  if (rand < 5) rarity = 'Mythic';
  else if (rand < 15) rarity = 'Legendary';
  else if (rand < 30) rarity = 'Super Rare';
  else if (rand < 50) rarity = 'Rare';
  else if (rand < 75) rarity = 'Uncommon';
  else rarity = 'Common';

  let contextSnippet = `Title: ${item.title}\nType: ${item.mediaType}`;
  if (item.creator) contextSnippet += `\nCreator: ${item.creator}`;
  if (item.description) contextSnippet += `\nSynopsis: ${item.description.substring(0, 300)}...`;
  if (item.genres && item.genres.length > 0) contextSnippet += `\nGenres: ${item.genres.join(", ")}`;
  if (item.tags && item.tags.length > 0) contextSnippet += `\nTags: ${item.tags.join(", ")}`;

  const res = await fetch("https://nano-gpt.com/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are an RPG Loot Master. The user has just completed a piece of media. Generate an Artifact based strictly on the lore, characters, or aesthetic of this media. The response MUST be a JSON object containing: 'name' (string, max 4 words), 'description' (string, 1-2 flavorful sentences), 'type' (string, e.g., Weapon, Relic, Armor, Spell, Trinket). The rarity of this item MUST be exactly '${rarity}'. Make the name and description match the prestige of the assigned rarity.` },
        { role: "user", content: `I just completed a piece of media. Drop some loot with rarity ${rarity}!\n\nContext regarding the media:\n${contextSnippet}` }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("NanoGPT error:", errorText);
    throw new Error(`Nano-GPT Error: ${res.statusText}`);
  }

  const data = await res.json();
  const messageContent = data.choices[0].message.content;
  try {
    let cleanStr = messageContent.trim();
    if (cleanStr.startsWith('```json')) {
      cleanStr = cleanStr.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanStr.startsWith('```')) {
      cleanStr = cleanStr.replace(/^```/, '').replace(/```$/, '').trim();
    }
    const parsed = JSON.parse(cleanStr);
    const artifactData = parsed.artifact || parsed; // Handle wrapping
    
    return {
      name: artifactData.name || "Mysterious Artifact",
      description: artifactData.description || "The magic seems to have faded from this item.",
      type: artifactData.type || "Trinket",
      rarity 
    };
  } catch (e) {
    console.error("Failed to parse JSON from NanoGPT:", messageContent);
    throw new Error("Failed to generate proper JSON for Artifact.");
  }
}

export async function generateText(apiKey: string, model: string, systemPrompt: string, prompt: string) {
  if (!apiKey) throw new Error("Nano-GPT API Key is missing. Please configure it in Settings.");

  const res = await fetch("https://nano-gpt.com/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("NanoGPT error:", errorText);
    throw new Error(`Nano-GPT Error: ${res.statusText}`);
  }

  const data = await res.json();
  const messageContent = data.choices[0].message.content;
  return messageContent.trim();
}
