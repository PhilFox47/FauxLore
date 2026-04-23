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
