import fs from 'fs';

async function run() {
  const fileContent = fs.readFileSync('./src/lib/flavorTexts.ts', 'utf-8');
  let MEDIA_FLAVOR_TEXTS: Record<string, string[]>;
  
  try {
    const jsonStr = fileContent.match(/export const MEDIA_FLAVOR_TEXTS: Record<string, string\[\]> = (\{[\s\S]*?\});/);
    if (!jsonStr) throw new Error("Could not find dict");
    MEDIA_FLAVOR_TEXTS = JSON.parse(jsonStr[1]);
  } catch (e) {
    console.error("Failed to parse", e);
    return;
  }

  const NEW_TEXTS = {
    Movie: [
      "Here's Johnny!",
      "Heeeeeere's Johnny!",
      "Yippie-ki-yay.",
      "The cinematic masterpiece of our generation."
    ]
  };

  for (const category in MEDIA_FLAVOR_TEXTS) {
    if (NEW_TEXTS[category]) {
      const existing = MEDIA_FLAVOR_TEXTS[category];
      const combined = [...existing, ...NEW_TEXTS[category]];
      const unique = Array.from(new Set(combined));
      MEDIA_FLAVOR_TEXTS[category] = unique;
    }
  }

  const exportString = `export const MEDIA_FLAVOR_TEXTS: Record<string, string[]> = ${JSON.stringify(MEDIA_FLAVOR_TEXTS, null, 2)};\n` +
  `\nexport function getRandomFlavorText(type: string): string {\n  if (!type || !MEDIA_FLAVOR_TEXTS[type] || MEDIA_FLAVOR_TEXTS[type].length === 0) {\n    return 'A classic masterpiece.';\n  }\n  const texts = MEDIA_FLAVOR_TEXTS[type];\n  return texts[Math.floor(Math.random() * texts.length)];\n}\n`;
  
  fs.writeFileSync('./src/lib/flavorTexts.ts', exportString);
  console.log("Updated flavorTexts.ts!");
}

run();
