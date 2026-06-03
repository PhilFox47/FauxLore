import { GoogleGenAI, Type, Schema } from "@google/genai";
import fs from "fs";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
import { MEDIA_FLAVOR_TEXTS } from "./src/lib/flavorTexts.ts";

async function main() {
  const categories = Object.keys(MEDIA_FLAVOR_TEXTS);
  const newTexts: Record<string, string[]> = {};

  for (const category of categories) {
    console.log(`Processing ${category}...`);
    const texts = MEDIA_FLAVOR_TEXTS[category];
    
    const prompt = `Here is a list of flavor texts for the category "${category}". 
The user noticed that some of these are simply the names of a media (e.g., "Appleseed.", "Dungeon Crawler Carl.", "Doctor Who.", "Stranger Things.", "Fate/stay night.").
A flavor text should be a reference, quote, or meme/inside joke from a fitting media, not simply the name of it.

Please review the following list. For any item that is just the name of a media, REPLACE it with an actual iconic quote, reference, or meme from that specific media. If it's already a quote/meme/reference, leave it as is.
Return a JSON array of strings with the cleaned up and replaced texts. Make sure no item is just the title of a work.

Original list:
${JSON.stringify(texts, null, 2)}
`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          } as Schema,
        }
      });
      
      const returnedTexts = JSON.parse(response.text() || "[]");
      newTexts[category] = returnedTexts;
      console.log(`Done with ${category}. Old length: ${texts.length}, New length: ${returnedTexts.length}`);
    } catch (e) {
      console.error(`Error processing ${category}:`, e);
      newTexts[category] = texts;
    }
  }

  const exportString = `export const MEDIA_FLAVOR_TEXTS: Record<string, string[]> = ${JSON.stringify(newTexts, null, 2)};`;
  fs.writeFileSync('./src/lib/flavorTexts.ts', exportString);
  console.log("Finished writing to src/lib/flavorTexts.ts");
}

main();
