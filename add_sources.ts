import fs from 'fs';

const flavorTextsFile = './src/lib/flavorTexts.ts';
let content = fs.readFileSync(flavorTextsFile, 'utf-8');

// The format we want to enforce is:
// export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry[]> = { ... }
// We can use eval or new Function to get the object, then modify it, then write it back.

const match = content.match(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = (\{[\s\S]*?\});\n\nexport function/);

if (!match) {
  console.error("Could not find MEDIA_FLAVOR_TEXTS");
  process.exit(1);
}

const objStr = match[1];
const data = eval('(' + objStr + ')');

// Define a map from quote string to source based on reading the scripts
const sourceMap = new Map<string, string>();
// Let's add the ones we know from quotes.ts and quotes2.ts

const filesToParse = ['./quotes.ts', './quotes2.ts'];
for (const file of filesToParse) {
  if (fs.existsSync(file)) {
    const fileData = fs.readFileSync(file, 'utf-8');
    const lines = fileData.split('\n');
    for (const line of lines) {
      if (line.includes('//')) {
        const parts = line.split('//');
        const codePart = parts[0];
        const commentPart = parts[1].trim();
        // Extract string literals from codePart
        const stringRegex = /"([^"]+)"|'([^']+)'/g;
        let match;
        while ((match = stringRegex.exec(codePart)) !== null) {
          const str = match[1] || match[2];
          sourceMap.set(str, commentPart);
        }
      }
    }
  }
}

for (const key in data) {
  data[key] = data[key].map((oldEntry: any) => {
    let quoteStr = typeof oldEntry === 'string' ? oldEntry : oldEntry.quote;
    let sourceStr = typeof oldEntry === 'string' ? undefined : oldEntry.source;
    
    // Check if we found a source mapping for it
    if (!sourceStr && sourceMap.has(quoteStr)) {
      sourceStr = sourceMap.get(quoteStr);
    }
    
    if (sourceStr) {
      return { quote: quoteStr, source: sourceStr };
    }
    return quoteStr;
  });
}

const exportString = `export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry[]> = ${JSON.stringify(data, null, 2)};`;
content = content.replace(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = \{[\s\S]*?\};\n/, exportString + '\n');
fs.writeFileSync(flavorTextsFile, content);

console.log("Updated flavorTexts.ts with known sources!");
