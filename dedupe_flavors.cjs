const fs = require('fs');

let code = fs.readFileSync('src/lib/flavorTexts.ts', 'utf8');

// The file exports MEME_EXPANSIONS, we can use a regex to extract and replace it, but the easiest way is to evaluate it, deduplicate, and write it back.
// But we can't easily eval TypeScript string if it has imports or whatever.
// Let's just do a simple regex or array pass.
// Actually, I can just use a simple TS script that imports it, deduplicates it, but since it's just a constant in the file:

const lines = code.split('\n');
let inMemes = false;
let currentArray = [];
let outLines = [];
let seen = new Set();

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.includes('const MEME_EXPANSIONS: Record<string, string[]> = {')) {
    inMemes = true;
    outLines.push(line);
    continue;
  }
  
  if (inMemes && line.startsWith('};')) {
    inMemes = false;
    outLines.push(line);
    continue;
  }
  
  if (inMemes) {
    if (line.includes('": [')) {
      seen = new Set();
      outLines.push(line);
    } else if (line.trim() === '],') {
      outLines.push(line);
    } else {
      // It's a text line like `    \`Some string\`, `
      const match = line.match(/^\s*`(.*)`,\s*$/);
      if (match) {
        const text = match[1];
        if (!seen.has(text)) {
          seen.add(text);
          outLines.push(line);
        }
      } else {
        outLines.push(line);
      }
    }
  } else {
    outLines.push(line);
  }
}

fs.writeFileSync('src/lib/flavorTexts.ts', outLines.join('\n'));
console.log("Deduplicated flavor texts!");
