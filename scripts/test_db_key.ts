import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

const settings = db.prepare("SELECT geminiApiKey FROM settings WHERE geminiApiKey IS NOT NULL LIMIT 1").get() as any;
const apiKey = settings?.geminiApiKey;

console.log("Found API key:", apiKey ? "Yes" : "No");

if (apiKey) {
  const prompt = `You are an RPG boss generator.
Task: Create ONE boss name and title that perfectly fits the universe of "Star Wars" (Type: Movie).
Difficulty: Level 5 out of 5.

Instructions:
1. USE WEB SEARCH to find actual characters, creatures, villains, or lore from exactly "Star Wars".
2. Pick an appropriate entity from that media.
3. Make them an RPG boss.
4. Return ONLY the name and title. No explanations, no markdown.
5. Example format: "Bowser, King of the Koopas".`;

  fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { maxOutputTokens: 60, temperature: 0.9 }
    })
  }).then(async res => {
    if (!res.ok) {
      console.error("Error text:", await res.text());
    } else {
      const data = await res.json();
      console.log("Success data:", JSON.stringify(data, null, 2));
    }
  }).catch(e => console.error(e));
}
