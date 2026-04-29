const fs = require('fs');
let content = fs.readFileSync('src/pages/Recaps.tsx', 'utf8');

// Fix the JSX fragment issue
const target = '                          {currentRecap ? (\n                             <div className={`prose prose-invert prose-lg md:prose-xl';
const replacement = '                          {currentRecap ? (\n                             <>\n                             <div className={`prose prose-invert prose-lg md:prose-xl';

if (content.includes(target)) {
    content = content.replace(target, replacement);
    content = content.replace('{renderBossTrophyRoom()}', '{renderBossTrophyRoom()}\n                             </>');
} else {
    // try with different whitespace
    console.log("Target not found exactly, trying search and replace with regex");
    content = content.replace(/\{currentRecap\s\?\s\(\s+<div className=\{`prose prose-invert prose-lg md:prose-xl/g, '{currentRecap ? (\n                             <>\n                             <div className={`prose prose-invert prose-lg md:prose-xl');
    content = content.replace('{renderBossTrophyRoom()}', '{renderBossTrophyRoom()}\n                             </>');
}

fs.writeFileSync('src/pages/Recaps.tsx', content);
