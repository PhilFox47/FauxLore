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
        { role: "system", content: "You are FauxLore's AI recap generator. You are witty, charismatic, naturally sarcastic, and modern. You act as an entertaining, hyper-aware geek podcaster analyzing the user's media habits. You MUST return a JSON object with exactly two keys: 'title' (a short, punchy title) and 'summary' (a detailed Markdown-formatted narrative). DO NOT include any other text besides the JSON object. VERY IMPORTANT: Escape all double quotes in your summary with backslashes." },
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
  const messageContent = data.choices[0]?.message?.content;
  
  if (!messageContent) {
    throw new Error("Nano-GPT returned an empty response.");
  }

  try {
    let cleanStr = messageContent.trim();
    // Remove starting backticks and optional language label
    cleanStr = cleanStr.replace(/^```[a-z]*\s*/i, '');
    // Remove trailing backticks (one or more)
    cleanStr = cleanStr.replace(/`+$/, '');
    cleanStr = cleanStr.trim();
    
    console.log("Raw NanoGPT Recap Response: ", cleanStr);
    
    let parsed: any;
    try {
      parsed = JSON.parse(cleanStr);
    } catch(e) {
      console.warn("Failed first pass JSON parse, trying regex fallback...");
      // Regex fallback if JSON is totally broken
      // Try to find title
      const titleMatch = cleanStr.match(/"(?:title|name|heading|Title|Name)"\s*:\s*"([^"]+)"/i);
      // Try to find summary or recap
      const summaryMatch = cleanStr.match(/"(?:summary|recap|text|body|content|Summary|Recap|Description)"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/i) || 
                           cleanStr.match(/"(?:summary|recap|text|body|content|Summary|Recap|Description)"\s*:\s*"([\s\S]*)"/i);
      
      if (titleMatch && summaryMatch) {
         return {
            title: titleMatch[1].replace(/\\"/g, '"'),
            summary: summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim()
         };
      }
      throw e;
    }
    
    function extractRecapFields(obj: any): { title: string, summary: string } | null {
      if (!obj || typeof obj !== 'object') return null;
      
      const title = obj.title || obj.Title || obj.name || obj.Name || obj.heading || obj.Heading;
      const summary = obj.summary || obj.Summary || obj.recap || obj.Recap || obj.text || obj.Text || obj.content || obj.Content || obj.description || obj.Description || obj.body || obj.Body;
      
      if (title && summary) return { title: String(title), summary: String(summary) };
      
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          const found = extractRecapFields(obj[key]);
          if (found) return found;
        }
      }
      return null;
    }
    
    const extracted = extractRecapFields(parsed);
    if (extracted) return extracted;
    
    return { 
      title: parsed.title || parsed.name || parsed.Title || "Untitled Recap", 
      summary: parsed.summary || parsed.recap || parsed.Summary || parsed.Recap || (typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : String(parsed)) 
    };
    
  } catch (e) {
    console.error("Failed to parse JSON from NanoGPT:");
    console.error(messageContent);
    // If it's a parsing error, return a friendly object but we still want to know it's a parsing error
    if (e instanceof Error && (e.message.includes('JSON') || e.message.includes('Unexpected token'))) {
       return { 
         title: "Formatting Error", 
         summary: `The AI response was not formatted correctly as JSON. \n\nRaw Output:\n${messageContent}` 
       };
    }
    // Re-throw if it's something else (like API error which was already thrown above)
    throw e;
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
        { role: "system", content: `You are an RPG Loot Master. The user has just completed a piece of media. Generate an Artifact based strictly on the lore, characters, or aesthetic of this media. The response MUST be a JSON object containing strictly these lowercase keys: 'name' (string, max 4 words), 'description' (string, 1-2 flavorful sentences), 'type' (string, e.g., Weapon, Relic, Armor, Spell, Trinket). The rarity of this item MUST be exactly '${rarity}'. Make the name and description match the prestige of the assigned rarity.` },
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
    // Remove starting backticks and optional language label
    cleanStr = cleanStr.replace(/^```[a-z]*\s*/i, '');
    // Remove trailing backticks (one or more)
    cleanStr = cleanStr.replace(/`+$/, '');
    cleanStr = cleanStr.trim();
    const parsed = JSON.parse(cleanStr);
    console.log("Parsed AI Artifact Data:", parsed);
    
    function findArtifactData(obj: any): any {
      if (!obj || typeof obj !== 'object') return null;
      
      const tName = obj.name || obj.Name;
      const tDesc = obj.description || obj.Description || obj.desc;
      const tType = obj.type || obj.Type || obj.itemType;
      
      if (tName && tDesc && tType) return obj;
      
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            const found = findArtifactData(item);
            if (found) return found;
          }
        } else if (typeof val === 'object' && val !== null) {
          const found = findArtifactData(val);
          if (found) return found;
        }
      }
      return null;
    }
    
    const artifactData = findArtifactData(parsed) || parsed;
    
    return {
      name: artifactData.name || artifactData.Name || "Mysterious Artifact",
      description: artifactData.description || artifactData.Description || artifactData.desc || "The magic seems to have faded from this item.",
      type: artifactData.type || artifactData.Type || artifactData.itemType || "Trinket",
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
