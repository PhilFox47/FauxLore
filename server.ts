import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import * as dotenv from "dotenv";
import Database from "better-sqlite3";
import fs from "fs";
import cron from "node-cron";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import { calculateRPGState } from "./src/lib/rpgSystem";

dotenv.config();

async function hltbSearch(query: string) {
  try {
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";
    
    // 1. Fetch main page to find the script containing the dynamic endpoint
    const mainPageRes = await fetch("https://howlongtobeat.com/", {
      headers: { "User-Agent": userAgent, "Referer": "https://howlongtobeat.com/" }
    });
    if (!mainPageRes.ok) throw new Error("Could not fetch HLTB main page");
    const mainHtml = await mainPageRes.text();
    
    const scriptRegex = /_next\/static\/chunks\/[^"]+\.js/g;
    const scripts = mainHtml.match(scriptRegex) || [];
    
    let endpointBasePath = null;
    
    // Prioritize _app scripts but scan all if needed
    const prioritizedScripts = scripts.filter(s => s.includes('_app'));
    const otherScripts = scripts.filter(s => !s.includes('_app'));
    const allScripts = [...prioritizedScripts, ...otherScripts].slice(0, 15);
    
    for (const script of allScripts) {
      const scriptSrc = `https://howlongtobeat.com/${script}`;
      try {
        const scriptRes = await fetch(scriptSrc, { headers: { "User-Agent": userAgent } });
        if (scriptRes.ok) {
          const scriptText = await scriptRes.text();
          // Look for fetch call with POST to find base endpoint (e.g. /api/search or /api/find)
          const match = scriptText.match(/fetch\s*\(\s*["']\/api\/([a-zA-Z0-9_/]+)[^"']*["']\s*,\s*\{[^}]*method:\s*["']POST["'][^}]*\}/i);
          if (match && match[1]) {
            let basePath = match[1];
            if (basePath.includes('/')) basePath = basePath.split('/')[0];
            endpointBasePath = `/api/${basePath}`;
            break;
          }
        }
      } catch (err) {
        // ignore individual script fetch errors
      }
    }
    
    // Fallback if not found inside scripts
    if (!endpointBasePath) {
      endpointBasePath = "/api/find"; // current as of mid-test
    }
    
    // 2. Fetch the auth token using the /init endpoint
    const initUrl = `https://howlongtobeat.com${endpointBasePath}/init?t=${Date.now()}`;
    const initRes = await fetch(initUrl, { 
      headers: { "User-Agent": userAgent, "Referer": "https://howlongtobeat.com/" } 
    });
    
    if (!initRes.ok) throw new Error(`Failed to fetch init token, status: ${initRes.status}`);
    const initData = await initRes.json();
    
    const token = initData.token;
    let hpKey = "";
    let hpVal = "";
    
    // Extract dynamic payload keys just like python scraper
    for (const key of Object.keys(initData)) {
      if (key.toLowerCase().includes("key")) hpKey = initData[key];
      else if (key.toLowerCase().includes("val")) hpVal = initData[key];
    }
    
    if (!token || !hpKey || !hpVal) {
      throw new Error("Missing auth params from init payload");
    }
    
    // 3. Perform the actual search request
    const url = `https://howlongtobeat.com${endpointBasePath}`;
    const payload: any = {
      searchType: "games",
      searchTerms: query.split(" "),
      searchPage: 1,
      size: 20,
      searchOptions: {
        games: {
          userId: 0,
          platform: "",
          sortCategory: "popular",
          rangeCategory: "main",
          rangeTime: { min: 0, max: 0 },
          gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
          rangeYear: { max: "", min: "" },
          modifier: ""
        },
        users: { sortCategory: "postcount" },
        lists: { sortCategory: "follows" },
        filter: "",
        sort: 0,
        randomizer: 0
      },
      useCache: true
    };
    
    // Inject the dynamic key-value
    payload[hpKey] = hpVal;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": userAgent,
        "Referer": "https://howlongtobeat.com/",
        "Origin": "https://howlongtobeat.com",
        "x-auth-token": token,
        "x-hp-key": hpKey,
        "x-hp-val": hpVal
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`HLTB API status error: ${response.status} at ${url}`);
      return [];
    }

    const json = await response.json();
    if (!json || !json.data) return [];

    return json.data.map((item: any) => ({
      gameplayMain: Math.round(item.comp_main / 3600),
      gameplayMainExtra: Math.round(item.comp_plus / 3600),
      gameplayCompletionist: Math.round(item.comp_100 / 3600),
      gameName: item.game_name,
      gameId: item.game_id
    }));
  } catch (err) {
    console.error("HLTB search failed:", err);
    return [];
  }
}

let igdbToken: { access_token: string, expires_at: number } | null = null;
async function getIgdbToken(clientId: string, clientSecret: string) {
  if (!clientId || !clientSecret) {
    throw new Error("IGDB_CLIENT_ID or IGDB_CLIENT_SECRET missing. Please configure them in Settings.");
  }

  if (igdbToken && Date.now() < igdbToken.expires_at) {
    return igdbToken.access_token;
  }

  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
    method: 'POST'
  });

  if (!res.ok) {
    throw new Error("Failed to authenticate with Twitch for IGDB: " + res.statusText);
  }

  const data = await res.json();
  igdbToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000) - 60000 // 1 minute buffer
  };

  return igdbToken.access_token;
}

async function startServer() {
  const app = express();
  // AI Studio requires port 3000, but using process.env.PORT allows you to easily proxy or run locally on other ports!
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Middleware to parse JSON bodies
  app.use(express.json());

  // Initialize SQLite Database
  const dbPath = path.join(process.cwd(), 'fauxlore.db');
  const db = new Database(dbPath);

  // Backup Manager
  const backupsDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir);
  }

  // Uploads Manager
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const aiImagesDir = path.join(uploadsDir, 'ai-images');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
  if (!fs.existsSync(aiImagesDir)) fs.mkdirSync(aiImagesDir);

  function createDatabaseBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const backupFile = path.join(backupsDir, `fauxlore-backup-${timestamp}.db`);
      fs.copyFileSync(dbPath, backupFile);
      
      // Keep only last 28 backups
      const backups = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('fauxlore-backup-') && f.endsWith('.db'))
        .sort();
      
      if (backups.length > 28) {
        const toDelete = backups.slice(0, backups.length - 28);
        for (const f of toDelete) {
          fs.unlinkSync(path.join(backupsDir, f));
        }
      }
      return { success: true, file: backupFile };
    } catch (e: any) {
      console.error("Backup failed", e);
      return { success: false, error: e.message };
    }
  }

  // Run daily at 13:00
  cron.schedule('0 13 * * *', () => {
    console.log("Running scheduled daily backup...");
    createDatabaseBackup();
  });

  // Oracle generation logic
  async function generateOracleMessage(userId: string, type: 'morning' | 'evening') {
    try {
      const settings: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId);
      const sysSettings: any = db.prepare('SELECT * FROM system_settings WHERE id = \'system\'').get();
      const apiKey = settings?.nanoGptApiKey || sysSettings?.nanoGptApiKey;
      if (!apiKey) return;

      const activeBosses: any[] = db.prepare("SELECT * FROM world_bosses WHERE userId = ? AND status = 'Active'").all(userId);
      const allLogs: any[] = db.prepare('SELECT * FROM logs WHERE userId = ? ORDER BY timestamp DESC').all(userId);
      const logs: any[] = db.prepare('SELECT * FROM logs WHERE userId = ? AND timestamp > ?').all(userId, new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString());
      const media: any[] = db.prepare('SELECT * FROM media WHERE userId = ?').all(userId).map(normalizeMedia);
      const artifacts: any[] = db.prepare('SELECT * FROM artifacts WHERE userId = ?').all(userId);
      
      const parsedSettings = {
        ...settings,
        rankConfigs: settings?.rankConfigs ? JSON.parse(settings.rankConfigs) : undefined,
        questConfigs: settings?.questConfigs ? JSON.parse(settings.questConfigs) : undefined
      };
      
      let activeQuests: any[] = [];
      try {
         const rpgState = calculateRPGState(allLogs as any, media as any, parsedSettings, artifacts as any, activeBosses);
         activeQuests = rpgState.quests.filter(q => !q.isFailed);
      } catch (e) {
         console.warn("Could not calculate RPG state for oracle", e);
      }
      
      const dustyMedia = media.filter(m => m.status === 'Active' || m.status === 'On Hold').filter(m => {
        const mLogs = allLogs.filter(l => l.mediaId === m.id);
        if (mLogs.length === 0) return true;
        const lastLog = new Date(mLogs[0].timestamp).getTime();
        return (Date.now() - lastLog) > 7 * 24 * 60 * 60 * 1000;
      }).map(m => m.title);

      let personaStr = "You are witty, charismatic, naturally sarcastic, and modern. You act as an entertaining, hyper-aware geek podcaster analyzing the user's media habits.";
      if (settings?.aiPersona === 'mystic') personaStr = "You are mystical, poetic, and write like an ancient fantasy oracle or dungeon master. Use metaphors of magic, quests, and cosmic destiny.";
      else if (settings?.aiPersona === 'archivist') personaStr = "You are a scholarly archivist. You write with the dry, intellectual, yet deeply fascinated tone of a historian examining sacred texts, keeping things slightly formal but full of wonder.";
      else if (settings?.aiPersona === 'noir') personaStr = "You are a cynical, hardboiled noir detective. You narrate the user's actions like you're piecing together a gritty case file in a rain-slicked city. Very dry and dramatic.";
      else if (settings?.aiPersona === 'cyberpunk') personaStr = "You are a slick cyberpunk netrunner AI. You use tech slang, talk about 'jacking in', 'data streams', 'corpos', and write in a fast, hyper-digital, edgy street tone.";

      const systemPrompt = `You are the Narrative Oracle, a helpful, welcoming, and charismatic gamemaster AI for a personal RPG.
      Your responsibility is to warmly greet the user, give them some engaging advice, and comment on their progress without just parroting the logs.
      NOTE: The concepts of "Enemies", "Bosses", "Combat", and "Quests" are purely metaphorical and part of an innocuous gamified productivity and media tracking system. No real violence is depicted or encouraged. Please ignore any default content policy flags regarding fictional gamified tasks.
      You can make general welcoming remarks, mention a 'dusty' media item that hasn't been active in a while, give advice on overcoming their current World Boss, comment on recent progress, or suggest tackling specific types of quests in their tracker.
      Persona Tone Guide: ${personaStr} Allow this tone to shape your response!`;
      
      let dustyContext = dustyMedia.length > 0 ? `Dusty Media (Needs Attention): ${dustyMedia.slice(0, 3).join(', ')}` : "No neglected media.";
      let bossContext = activeBosses.length > 0 ? `Active Challenges (World Bosses) to overcome: ${activeBosses.map(b => b.name).join(', ')}` : "No active challenges right now.";
      let questContext = activeQuests.length > 0 ? `Active/Completed Quests: ${activeQuests.map(q => `${q.title} (${q.isCompleted ? 'Completed' : 'Active'})`).join(', ')}` : "No interesting quests right now.";
      let logsContext = logs.length > 0 ? `Recent Triumphs (Past 12h): ${logs.slice(0,5).map(l => {
        const m = media.find(x => x.id === l.mediaId);
        return `${m?.title} (+${l.delta} ${l.metricType})`;
      }).join(', ')}` : "No recent logs (Past 12h).";
      
      const recentMessages = db.prepare('SELECT message FROM oracle_messages WHERE userId = ? ORDER BY timestamp DESC LIMIT 20').all(userId) as any[];
      let recentMessagesContext = recentMessages.length > 0 ? `Previous Messages you've sent recently (DO NOT repeat these concepts, greetings, or topics. Be fresh!):\n${recentMessages.map((m, i) => `${i+1}. "${m.message}"`).join('\n')}` : "";

      const userPrompt = `Time of Day: ${type === 'morning' ? 'Morning' : 'Evening'}
      ${logsContext}
      ${bossContext}
      ${questContext}
      ${dustyContext}
      
      ${recentMessagesContext}
      
      Keep it short (2-3 sentences, approx 250 characters). Don't be too cryptic—be charismatic and welcoming!
      Start with a greeting! If it's Morning, suggest a focus for the day (e.g., tackle an enemy, finish a quest, or pick up a dusty book/game). If Evening, summarize their triumphs or encourage them to log something if they haven't.`;

      const aiRes = await fetch("https://nano-gpt.com/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: settings?.nanoGptModel || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        })
      });

      if (aiRes.ok) {
        const data = await aiRes.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          db.prepare('INSERT INTO oracle_messages (id, userId, message, type, timestamp) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), userId, text.trim(), type, new Date().toISOString());
        }
      } else {
        console.error("Oracle generation API error", await aiRes.text());
      }
    } catch (e) {
      console.error("Oracle generation failed", e);
    }
  }

  async function internalGenerateImageWithNanoGpt(apiKey: string, prompt: string): Promise<string> {
    const res = await fetch("https://nano-gpt.com/api/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "chroma",
        prompt: prompt,
        size: "1536x1536",
        response_format: "url"
      })
    });
    if (!res.ok) throw new Error("NanoGPT Image Generation Failed: " + await res.text());
    const data = await res.json();
    const remoteUrl = data.data?.[0]?.url;
    if (!remoteUrl) throw new Error("NanoGPT did not return an image URL");

    try {
      // Download and store locally
      const imageRes = await fetch(remoteUrl);
      if (!imageRes.ok) throw new Error(`Failed to fetch image from remote URL: ${remoteUrl}`);
      const arrayBuffer = await imageRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const fileName = `${uuidv4()}.webp`;
      const filePath = path.join(aiImagesDir, fileName);
      
      fs.writeFileSync(filePath, buffer);
      
      return `/uploads/ai-images/${fileName}`;
    } catch (e) {
      console.error("Failed to store image locally, falling back to remote URL", e);
      return remoteUrl;
    }
  }

  async function generateBossImageBackground(userId: string, bossId: string, bossName: string, mediaTitle: string, mediaType: string, bossLevel: number = 1) {
    try {
      const sysSettings: any = db.prepare('SELECT geminiApiKey, nanoGptApiKey FROM system_settings WHERE id = \'system\'').get();
      const userSettings: any = db.prepare('SELECT geminiApiKey, nanoGptApiKey FROM settings WHERE userId = ?').get(userId);
      const geminiKey = userSettings?.geminiApiKey || sysSettings?.geminiApiKey || process.env.GEMINI_API_KEY;
      const nanoGptKey = userSettings?.nanoGptApiKey || sysSettings?.nanoGptApiKey;
      if (!geminiKey || !nanoGptKey) return;

      const styleDesc = bossLevel >= 5 ? "looks incredibly epic, intimidating, and legendary, exuding aura and extreme danger." 
                      : bossLevel >= 3 ? "looks formidable and elite, quite imposing and well-equipped." 
                      : "looks relatively mundane, like a common foot soldier, grunt, or weak beast.";

      const prompt = `You are an expert AI image prompt engineer. An RPG boss named "${bossName}" has been encountered for the media "${mediaTitle}" (Type: ${mediaType}).
Create a highly detailed, descriptive image prompt for the Chroma model to generate an image of ONLY the boss character or entity itself isolated, looking like an RPG icon or portrait, NOT a full background wallpaper. 
The boss ${styleDesc} 
Contextualize it perfectly to fit the world, lore, and visual aesthetic of "${mediaTitle}". Describe its armor, weapons, aura, posture, and facial expression depending on its description. Use a dark, epic RPG style.
Return ONLY the raw prompt text, nothing else.`;

      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.7 }
        })
      });

      if (!aiRes.ok) throw new Error("Failed to generate boss prompt");
      const data = await aiRes.json();
      const imagePrompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!imagePrompt) throw new Error("Empty boss prompt");

      const imageUrl = await internalGenerateImageWithNanoGpt(nanoGptKey, imagePrompt);
      db.prepare("UPDATE world_bosses SET imageUrl = ? WHERE id = ?").run(imageUrl, bossId);
    } catch (e) {
      console.error("Boss Image Background Gen Error:", e);
    }
  }

  async function generateArtifactImageBackground(userId: string, artifactId: string, artifactName: string, artifactDesc: string, mediaTitle: string, rarity: string = "Common") {
    try {
      const sysSettings: any = db.prepare('SELECT geminiApiKey, nanoGptApiKey FROM system_settings WHERE id = \'system\'').get();
      const userSettings: any = db.prepare('SELECT geminiApiKey, nanoGptApiKey FROM settings WHERE userId = ?').get(userId);
      const geminiKey = userSettings?.geminiApiKey || sysSettings?.geminiApiKey || process.env.GEMINI_API_KEY;
      const nanoGptKey = userSettings?.nanoGptApiKey || sysSettings?.nanoGptApiKey;
      if (!geminiKey || !nanoGptKey) return;

      const rarityDesc = rarity === "Mythic" ? "is a multi-colored cosmic and impossible artifact, pulsing with god-like energy." 
                       : rarity === "Legendary" ? "is legendary, glowing with a golden, intense aura and extreme craftsmanship." 
                       : rarity === "Epic" ? "is epic, adorned with purple magical effects and ornate details."
                       : rarity === "Rare" ? "is rare, looking special with a faint blue glow."
                       : "is common and mundane, looking like standard, ordinary gear with no magical glow.";

      const prompt = `You are an expert AI image prompt engineer. An RPG loot item (artifact) named "${artifactName}" with the description "${artifactDesc}" has been found. It originates from the media "${mediaTitle}".
Create a highly detailed, descriptive image prompt for the Chroma model to generate an image of ONLY the artifact itself as a single item icon on a dark, neutral background.
CRITICAL INSTRUCTION: Use Google Search to look up the item "${artifactName}" and the media "${mediaTitle}" to understand what the item actually is and what it looks like. Then, ensure the physical shape, literal object, and material mentioned in the name and description MUST be the exact subject of the image (e.g. if it's a tape spool, it must be a plastic tape spool, if it's a book, it must be a book). Do not turn the object into a stone ring, gem, or generic magical item unless specified.
The item's aura and magic ${rarityDesc} 
Contextualize its design to fit the world, lore, and visual aesthetic of "${mediaTitle}", but NEVER change the fundamental object type. Describe its physical materials, exact shape, engravings, and visual effects based heavily on its description.
Return ONLY the raw prompt text, nothing else.`;

      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.7 }
        })
      });

      if (!aiRes.ok) throw new Error("Failed to generate artifact prompt");
      const data = await aiRes.json();
      const imagePrompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!imagePrompt) throw new Error("Empty artifact prompt");

      const imageUrl = await internalGenerateImageWithNanoGpt(nanoGptKey, imagePrompt);
      db.prepare("UPDATE artifacts SET imageUrl = ? WHERE id = ?").run(imageUrl, artifactId);
    } catch (e) {
      console.error("Artifact Image Background Gen Error:", e);
    }
  }

  // World Boss Spawner
  async function spawnWorldBoss(userId: string, throwOnEmpty = false) {
    try {
      // Exclude Movies from boss spawns as they are either watched or unwatched (not ongoing)
      // Also exclude media where user explicitly disabled enemies
      const allActiveMedia = db.prepare("SELECT id FROM media WHERE userId = ? AND status = 'Active' AND mediaType != 'Movie' AND (noEnemies = 0 OR noEnemies IS NULL)").all(userId) as any[];
      if (allActiveMedia.length === 0) {
        if (throwOnEmpty) throw new Error("No active media found (excluding Movies & disabled enemies). Start consuming a Media Item to spawn an enemy!");
        return;
      }

      const activeMedia = db.prepare("SELECT id, title, mediaType FROM media WHERE userId = ? AND status = 'Active' AND mediaType != 'Movie' AND (noEnemies = 0 OR noEnemies IS NULL) AND id NOT IN (SELECT mediaId FROM world_bosses WHERE userId = ? AND status = 'Active')").all(userId, userId) as any[];
      if (activeMedia.length === 0) {
        if (throwOnEmpty) throw new Error("All your active media already have enemies. Defeat or survive them before requesting an Encore!");
        return;
      }

      const mediaItem = activeMedia[Math.floor(Math.random() * activeMedia.length)];
      const settings: any = db.prepare('SELECT geminiApiKey, enemyDifficulty FROM settings WHERE userId = ?').get(userId);
      const difficulty = settings?.enemyDifficulty ?? 1.0;
      
      const r = Math.random();
      let level = 1;
      if (r < 0.20) level = 1;
      else if (r < 0.50) level = 2;
      else if (r < 0.80) level = 3;
      else if (r < 0.95) level = 4;
      else level = 5;

      const getBaseTarget = (type: string, lv: number) => {
        const levels = {
          'Game': [2, 5, 10, 20, 40],
          'Visual Novel': [2, 5, 10, 20, 40],
          'Book': [40, 100, 200, 400, 800],
          'Manga': [6, 12, 20, 34, 60],
          'Series': [2, 6, 12, 24, 40],
          'Comic': [4, 8, 14, 24, 30]
        }[type] || [90, 180, 360, 720, 1440]; // Fallback to old Master Pages scale

        return levels[lv - 1];
      };

      const getUnit = (type: string) => ({
        'Game': 'Hours',
        'Visual Novel': 'Hours',
        'Book': 'Pages',
        'Manga': 'Chapters',
        'Series': 'Episodes',
        'Comic': 'Issues'
      }[type] || 'Units');

      const baseTarget = getBaseTarget(mediaItem.mediaType, level);
      const target = Math.max(0.1, baseTarget * difficulty);
      const unit = getUnit(mediaItem.mediaType);
      
      let bossName = "";
      
      const sysSettings: any = db.prepare('SELECT geminiApiKey FROM system_settings WHERE id = \'system\'').get();
      const apiKey = settings?.geminiApiKey || sysSettings?.geminiApiKey || process.env.GEMINI_API_KEY;
      if (apiKey) {
        try {
          const levelDescriptions: Record<number, string> = {
            1: "Pleb (Laughable, pathetic, weakest minion, joke enemy)",
            2: "Easy (Common enemy, foot soldier, standard hurdle)",
            3: "Medium (Actual threat, elite minion, mini-boss)",
            4: "Hard (Menacing, dangerous antagonist, major boss)",
            5: "World Boss (EPIC, realm-ending, the final form, supreme being)"
          };

          const prompt = `You are an RPG boss generator.
Task: Create ONE boss name and title that perfectly fits the universe of "${mediaItem.title}" (Type: ${mediaItem.mediaType}).
Difficulty: Level ${level} - ${levelDescriptions[level as keyof typeof levelDescriptions]}.

Instructions:
1. USE WEB SEARCH to find actual characters, creatures, villains, or lore from exactly "${mediaItem.title}".
2. Pick an appropriate entity from that media based on the difficulty level. Level 1 should be a joke/laughable, while Level 5 should be an epic, ultimate threat.
3. Make them an RPG boss by giving them an appropriate title based on the difficulty. If the media doesn't have obvious bosses, create a thematic boss out of a character/concept from it.
4. Return ONLY the name and title. No explanations, no markdown.
5. Example format: "Bowser, King of the Koopas".

It MUST directly reference "${mediaItem.title}". Do not use generic fantasy names.`;

          const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              tools: [{ googleSearch: {} }],
              generationConfig: { temperature: 0.9 }
            })
          });

          if (aiRes.ok) {
            const data = await aiRes.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/\*\*/g, '').replace(/\"/g, '').trim() || "";
            if (text) bossName = text;
          }
        } catch (e) { console.error("Boss name generation failed", e); }
      }

      if (!bossName) {
        const fallbackNames = ["Void Stalker", "Doom Herald", "Chaos Reaver", "Eternal Echo"];
        bossName = fallbackNames[Math.floor(Math.random() * fallbackNames.length)];
      }

      let nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(5, 0, 0, 0);

      const bossId = uuidv4();
      db.prepare(`
        INSERT INTO world_bosses (id, userId, mediaId, name, level, targetProgress, currentProgress, expiresAt, createdAt, updatedAt, unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(bossId, userId, mediaItem.id, bossName, level, target, 0, nextMonday.toISOString(), new Date().toISOString(), new Date().toISOString(), unit);
      
      // Auto-generate image in background
      generateBossImageBackground(userId, bossId, bossName, mediaItem.title, mediaItem.mediaType);
    } catch (e) { 
        console.error("Boss spawn failed", e); 
        if (throwOnEmpty) throw e;
    }
  }

  // Cron schedule for Oracle messages (09:00 and 21:00)
  cron.schedule('0 9 * * *', () => {
    const users = db.prepare('SELECT id FROM users').all() as {id: string}[];
    for (const u of users) generateOracleMessage(u.id, 'morning');
  });
  cron.schedule('0 21 * * *', () => {
    const users = db.prepare('SELECT id FROM users').all() as {id: string}[];
    for (const u of users) generateOracleMessage(u.id, 'evening');
  });

  // Weekly boss spawn (Mondays)
  cron.schedule('0 5 * * 1', () => {
    const users = db.prepare('SELECT id FROM users').all() as {id: string}[];
    for (const u of users) {
       db.prepare("UPDATE world_bosses SET status = 'Failed' WHERE userId = ? AND status = 'Active' AND expiresAt < ?").run(u.id, new Date().toISOString());
       spawnWorldBoss(u.id);
    }
  });

  async function checkMissedOracleMessages() {
    const users = db.prepare('SELECT id FROM users').all() as {id: string}[];
    const now = new Date();
    const currentHour = now.getHours();
    
    for (const u of users) {
      if (currentHour >= 9) {
          const lastMorning = db.prepare("SELECT timestamp FROM oracle_messages WHERE userId = ? AND type = 'morning' ORDER BY timestamp DESC LIMIT 1").get(u.id) as any;
          const isTodayMorning = lastMorning && (new Date(lastMorning.timestamp).toDateString() === now.toDateString());
          if (!isTodayMorning) {
              await generateOracleMessage(u.id, 'morning');
          }
      }
      if (currentHour >= 21) {
          const lastEvening = db.prepare("SELECT timestamp FROM oracle_messages WHERE userId = ? AND type = 'evening' ORDER BY timestamp DESC LIMIT 1").get(u.id) as any;
          const isTodayEvening = lastEvening && (new Date(lastEvening.timestamp).toDateString() === now.toDateString());
          if (!isTodayEvening) {
              await generateOracleMessage(u.id, 'evening');
          }
      }
    }
  }
  
  checkMissedOracleMessages();

  
  // Create Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT 'default_user',
      title TEXT NOT NULL,
      mediaType TEXT NOT NULL,
      coverImageUrl TEXT,
      description TEXT,
      creator TEXT,
      publisher TEXT,
      year INTEGER,
      reviewScore INTEGER,
      averagePlaytime REAL,
      hltbMain REAL,
      hltbMainExtra REAL,
      hltbCompletionist REAL,
      selectedHltbType TEXT,
      status TEXT NOT NULL,
      userRating INTEGER,
      userReview TEXT,
      dropReason TEXT,
      genres TEXT,
      tags TEXT,
      tropes TEXT,
      platforms TEXT,
      franchises TEXT,
      subtitle TEXT,
      maturityRating TEXT,
      playtimeHours REAL,
      pagesRead INTEGER,
      totalPages INTEGER,
      chaptersRead INTEGER,
      totalChapters INTEGER,
      season INTEGER,
      episodesWatched INTEGER,
      totalEpisodes INTEGER,
      watched INTEGER,
      watchCount INTEGER,
      runtimeMinutes INTEGER,
      issuesRead INTEGER,
      totalIssues INTEGER,
      isReRun INTEGER,
      originalMediaId TEXT,
      expectedReleaseDate TEXT,
      language TEXT,
      isOngoing INTEGER,
      noEnemies INTEGER DEFAULT 0,
      releaseStatus TEXT,
      lastSyncAt TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT 'default_user',
      mediaId TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metricType TEXT NOT NULL,
      delta REAL NOT NULL,
      note TEXT,
      location TEXT,
      isHistoric INTEGER DEFAULT 0,
      FOREIGN KEY(mediaId) REFERENCES media(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'User',
      profilePic TEXT,
      bio TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY DEFAULT 'system',
      igdbClientId TEXT,
      igdbClientSecret TEXT,
      tmdbApiKey TEXT,
      hardcoverApiKey TEXT,
      nanoGptApiKey TEXT,
      nanoGptModel TEXT,
      geminiApiKey TEXT,
      googleBooksApiKey TEXT
    );

    CREATE TABLE IF NOT EXISTS global_taxonomy (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL, -- 'genre' or 'tag'
      name TEXT NOT NULL UNIQUE,
      usageCount INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      userId TEXT PRIMARY KEY,
      igdbClientId TEXT,
      igdbClientSecret TEXT,
      tmdbApiKey TEXT,
      hardcoverApiKey TEXT,
      nanoGptApiKey TEXT,
      nanoGptModel TEXT,
      geminiApiKey TEXT,
      googleBooksApiKey TEXT,
      timezone TEXT,
      masterPageConfig TEXT,
      yearlyGoals TEXT,
      lastActiveDate TEXT,
      currentStreak INTEGER,
      enemyDifficulty REAL DEFAULT 1.0,
      questOffsets TEXT,
      questRerollsUsed TEXT,
      questConfigs TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_recaps (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT 'default_user',
      timeframe TEXT NOT NULL,
      timeId TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      data TEXT,
      UNIQUE(userId, timeframe, timeId)
    );

    CREATE TABLE IF NOT EXISTS ai_text_cache (
      key TEXT NOT NULL,
      userId TEXT NOT NULL DEFAULT 'default_user',
      value TEXT NOT NULL,
      PRIMARY KEY (userId, key)
    );


    CREATE TABLE IF NOT EXISTS franchises (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT 'default_user',
      name TEXT NOT NULL,
      coverImageUrl TEXT,
      description TEXT,
      UNIQUE(userId, name)
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      mediaId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      rarity TEXT NOT NULL, 
      type TEXT NOT NULL,
      earnedAt TEXT NOT NULL,
      durability INTEGER DEFAULT 100,
      maxDurability INTEGER DEFAULT 100,
      slot TEXT,
      isEquipped INTEGER DEFAULT 0,
      targetType TEXT,
      targetValue TEXT,
      bonusPercent INTEGER,
      imageUrl TEXT,
      FOREIGN KEY(mediaId) REFERENCES media(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS world_bosses (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      mediaId TEXT NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL, -- 1=Pleb, 2=Easy, 3=Medium, 4=Hard, 5=World Boss
      unit TEXT,
      targetProgress REAL NOT NULL,
      currentProgress REAL DEFAULT 0,
      status TEXT DEFAULT 'Active',
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      imageUrl TEXT,
      FOREIGN KEY(mediaId) REFERENCES media(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS oracle_messages (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT, -- 'morning', 'evening'
      timestamp TEXT NOT NULL
    );
  `);

  // Automatic Migrations
  try { db.exec("ALTER TABLE media ADD COLUMN language TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN isOngoing INTEGER"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN releaseStatus TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN lastSyncAt TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN noEnemies INTEGER DEFAULT 0"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN storyHeavyModifier REAL"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN userReview TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN dropReason TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE settings ADD COLUMN enemyDifficulty REAL DEFAULT 1.0"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE settings ADD COLUMN questConfigs TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE world_bosses ADD COLUMN unit TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE ai_recaps ADD COLUMN data TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE world_bosses ADD COLUMN updatedAt TEXT"); } catch (e) { /* Ignore if it exists */ }

  // Migration steps
  try { 
    const defaultUserExists = db.prepare('SELECT id FROM users WHERE id = ?').get('default_user');
    if (!defaultUserExists) {
      const defaultHash = bcrypt.hashSync('admin', 10);
      db.prepare(`
        INSERT INTO users (id, username, passwordHash, role, createdAt, updatedAt) 
        VALUES ('default_user', 'admin', ?, 'Admin', ?, ?)
      `).run(defaultHash, new Date().toISOString(), new Date().toISOString());
    }
  } catch (e) {
    console.error("Migration: seed user", e);
  }

  // Synchronize media progress with logs
  try {
    const allMedia = db.prepare('SELECT id, userId FROM media').all() as any[];
    for (const m of allMedia) {
      const logs = db.prepare('SELECT metricType, delta FROM logs WHERE mediaId = ? AND userId = ?').all(m.id, m.userId) as any[];
      
      const sums: Record<string, number> = {};
      for (const l of logs) {
        if (!sums[l.metricType]) sums[l.metricType] = 0;
        sums[l.metricType] += l.delta;
      }
      
      for (const [metric, total] of Object.entries(sums)) {
        if (['playtimeHours', 'pagesRead', 'chaptersRead', 'episodesWatched', 'watchCount', 'issuesRead'].includes(metric)) {
          // If total logs > 0, or if total is 0 but we had logs
          db.prepare(`UPDATE media SET ${metric} = MAX(0, ?) WHERE id = ? AND userId = ?`).run(total, m.id, m.userId);
        }
      }
    }
  } catch(e) {
    console.error("Migration: sync media progress", e);
  }

  // Migrate API keys from settings to system_settings
  try {
    const adminSettings: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get('default_user');
    if (adminSettings) {
      db.prepare(`
        INSERT INTO system_settings (id, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, geminiApiKey, googleBooksApiKey)
        VALUES ('system', @igdbClientId, @igdbClientSecret, @tmdbApiKey, @hardcoverApiKey, @nanoGptApiKey, @nanoGptModel, @geminiApiKey, @googleBooksApiKey)
        ON CONFLICT(id) DO UPDATE SET
          igdbClientId=COALESCE(system_settings.igdbClientId, excluded.igdbClientId),
          igdbClientSecret=COALESCE(system_settings.igdbClientSecret, excluded.igdbClientSecret),
          tmdbApiKey=COALESCE(system_settings.tmdbApiKey, excluded.tmdbApiKey),
          hardcoverApiKey=COALESCE(system_settings.hardcoverApiKey, excluded.hardcoverApiKey),
          nanoGptApiKey=COALESCE(system_settings.nanoGptApiKey, excluded.nanoGptApiKey),
          nanoGptModel=COALESCE(system_settings.nanoGptModel, excluded.nanoGptModel),
          geminiApiKey=COALESCE(system_settings.geminiApiKey, excluded.geminiApiKey),
          googleBooksApiKey=COALESCE(system_settings.googleBooksApiKey, excluded.googleBooksApiKey)
      `).run({
        igdbClientId: adminSettings.igdbClientId || null,
        igdbClientSecret: adminSettings.igdbClientSecret || null,
        tmdbApiKey: adminSettings.tmdbApiKey || null,
        hardcoverApiKey: adminSettings.hardcoverApiKey || null,
        nanoGptApiKey: adminSettings.nanoGptApiKey || null,
        nanoGptModel: adminSettings.nanoGptModel || null,
        geminiApiKey: adminSettings.geminiApiKey || null,
        googleBooksApiKey: adminSettings.googleBooksApiKey || null,
      });
    }
  } catch (e) {
    console.error("Migration: system_settings", e);
  }

  try { db.prepare("ALTER TABLE media ADD COLUMN userId TEXT NOT NULL DEFAULT 'default_user'").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE logs ADD COLUMN userId TEXT NOT NULL DEFAULT 'default_user'").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE ai_recaps ADD COLUMN userId TEXT NOT NULL DEFAULT 'default_user'").run(); } catch (e) {}
  // --- Recreate ai_text_cache for correct PRIMARY KEY ---
  try {
    const tableInfo = db.prepare("PRAGMA table_info(ai_text_cache)").all() as any[];
    const hasUserIdPk = tableInfo.some(c => c.name === 'userId' && c.pk > 0);
    if (!hasUserIdPk) {
      console.log("Migrating ai_text_cache schema for proper multi-user PK...");
      db.prepare(`
        CREATE TABLE IF NOT EXISTS ai_text_cache_new (
          key TEXT NOT NULL,
          userId TEXT NOT NULL DEFAULT 'default_user',
          value TEXT NOT NULL,
          PRIMARY KEY (userId, key)
        )
      `).run();
      db.prepare(`INSERT OR IGNORE INTO ai_text_cache_new (key, userId, value) SELECT key, userId, value FROM ai_text_cache`).run();
      db.prepare(`DROP TABLE ai_text_cache`).run();
      db.prepare(`ALTER TABLE ai_text_cache_new RENAME TO ai_text_cache`).run();
    }
  } catch (e: any) {
    console.error("Migration error for ai_text_cache:", e);
  }
  try { db.prepare("ALTER TABLE settings ADD COLUMN questDifficulty REAL").run(); } catch (e) {} // old
  try { db.prepare("ALTER TABLE settings ADD COLUMN yearlyGoals TEXT").run(); console.log("Migration: Added yearlyGoals"); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN nanoGptApiKey TEXT").run(); console.log("Migration: Added nanoGptApiKey"); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN nanoGptModel TEXT").run(); console.log("Migration: Added nanoGptModel"); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN geminiApiKey TEXT").run(); console.log("Migration: Added geminiApiKey"); } catch (e) {}
  try { db.prepare("ALTER TABLE system_settings ADD COLUMN googleBooksApiKey TEXT").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN googleBooksApiKey TEXT").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN lastActiveDate TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN currentStreak INTEGER").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN questOffsets TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN questRerollsUsed TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN hltbMain REAL").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN targetType TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN targetValue TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN bonusPercent INTEGER").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN hltbMainExtra REAL").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN hltbCompletionist REAL").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN isReRun INTEGER").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN platforms TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN franchises TEXT").run(); } catch (e) {}
  // SQLite ALTER TABLE doesn't support adding foreign keys or multiple columns at once well,
  // but we can add columns if they are missing.
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN userId TEXT NOT NULL DEFAULT 'default_user'").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN rarity TEXT DEFAULT 'Common'").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN type TEXT DEFAULT 'Trinket'").run(); } catch (e) {}
  
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN durability INTEGER DEFAULT 100").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN maxDurability INTEGER DEFAULT 100").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN slot TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN isEquipped INTEGER DEFAULT 0").run(); } catch (e) {}
  
  try { db.prepare("ALTER TABLE media ADD COLUMN originalMediaId TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN selectedHltbType TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN expectedReleaseDate TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN subtitle TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN maturityRating TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE logs ADD COLUMN location TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE logs ADD COLUMN isHistoric INTEGER DEFAULT 0").run(); } catch (e) {}
  
  try { db.prepare("UPDATE media SET status = 'Active' WHERE status = 'Playing'").run(); } catch(e) {}
  try { db.prepare("UPDATE media SET status = 'Planning' WHERE status = 'Backlog'").run(); } catch(e) {}

  // Auto-assign default_user records to the first Admin user
  try {
    const firstAdmin: any = db.prepare('SELECT id FROM users WHERE role = ? ORDER BY createdAt ASC LIMIT 1').get('Admin');
    if (firstAdmin) {
      const adminId = firstAdmin.id;
      db.prepare("UPDATE media SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE logs SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE settings SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE ai_recaps SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE artifacts SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE ai_text_cache SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE world_bosses SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE oracle_messages SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE franchises SET userId = ? WHERE userId = 'default_user'").run(adminId);
    }
  } catch(e) { console.error('Migration of default_user failed:', e); }

  // Auto-migrate artifacts slots/durability
  try {
    db.prepare(`
      UPDATE artifacts SET 
        durability = CASE WHEN durability IS NULL THEN 100 ELSE durability END,
        maxDurability = CASE WHEN maxDurability IS NULL THEN 100 ELSE maxDurability END,
        slot = CASE 
          WHEN slot IS NOT NULL THEN slot
          WHEN name LIKE '%Sword%' OR name LIKE '%Blade%' OR name LIKE '%Axe%' THEN 'Primary'
          WHEN name LIKE '%Shield%' OR name LIKE '%Book%' OR name LIKE '%Tome%' THEN 'Secondary'
          WHEN name LIKE '%Helm%' OR name LIKE '%Crest%' THEN 'Head'
          WHEN name LIKE '%Armor%' OR name LIKE '%Robe%' THEN 'Body'
          WHEN name LIKE '%Boots%' OR name LIKE '%Greaves%' THEN 'Legs'
          ELSE 'Accessory'
        END
      WHERE durability IS NULL OR slot IS NULL
    `).run();
  } catch(e) { console.error('Migration of artifacts failed:', e); }

  // Auto-migrate historical log timestamps
  try {
    const historicalUpdateResult = db.prepare("UPDATE logs SET timestamp = '1970-01-01T00:00:00.000Z' WHERE isHistoric = 1 AND timestamp != '1970-01-01T00:00:00.000Z'").run();
    if (historicalUpdateResult.changes > 0) {
      console.log(`Migrated ${historicalUpdateResult.changes} historical logs to proper timestamp.`);
    }
  } catch(e) { console.error('Migration of historical log timestamps failed:', e); }

  // Seed Taxonomies if empty
  try {
    const genreCount = db.prepare('SELECT count(*) as count FROM global_taxonomy WHERE type = ?').get('genre') as { count: number };
    const tagCount = db.prepare('SELECT count(*) as count FROM global_taxonomy WHERE type = ?').get('tag') as { count: number };
    
    if (genreCount.count === 0 && tagCount.count === 0) {
      if (fs.existsSync('taxonomy.json')) {
         const { genres, tags } = JSON.parse(fs.readFileSync('taxonomy.json', 'utf8'));
         const insertTaxonomy = db.prepare('INSERT INTO global_taxonomy (id, type, name) VALUES (@id, @type, @name) ON CONFLICT(name) DO NOTHING');
         
         db.transaction(() => {
           for (const genre of genres) {
              insertTaxonomy.run({ id: uuidv4(), type: 'genre', name: genre });
           }
           for (const tag of tags) {
              insertTaxonomy.run({ id: uuidv4(), type: 'tag', name: tag });
           }
         })();
         console.log('Seeded global taxonomies');
      }
    }
  } catch (e) {
    console.error("Taxonomy Seed Error:", e);
  }

  try {
    const versionRow = db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (versionRow.user_version < 1) {
      db.prepare("UPDATE world_bosses SET targetProgress = targetProgress * 2 WHERE status = 'Active'").run();
      db.prepare("PRAGMA user_version = 1").run();
      console.log('Migrated world_bosses to double target progress (user_version 1)');
    }
  } catch (e) {
    console.error("Migration to user_version 1 failed:", e);
  }

  try { db.prepare("ALTER TABLE artifacts ADD COLUMN imageUrl TEXT").run(); console.log("Migration: Added imageUrl to artifacts"); } catch (e) {}
  try { db.prepare("ALTER TABLE world_bosses ADD COLUMN imageUrl TEXT").run(); console.log("Migration: Added imageUrl to world_bosses"); } catch (e) {}

  function safeJsonParse(str: any) {
    try {
      if (typeof str === 'string') {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed;
        return [parsed];
      }
      return [];
    } catch(e) {
      return typeof str === 'string' && str ? [str] : [];
    }
  }

  function normalizeMedia(row: any) {
    return {
      ...row,
      genres: row.genres ? safeJsonParse(row.genres) : [],
      tags: row.tags ? safeJsonParse(row.tags) : [],
      tropes: row.tropes ? safeJsonParse(row.tropes) : [],
      platforms: row.platforms ? safeJsonParse(row.platforms) : [],
      franchises: row.franchises ? safeJsonParse(row.franchises) : [],
      watched: row.watched === 1,
      isReRun: row.isReRun === 1,
      isOngoing: row.isOngoing === 1,
      noEnemies: row.noEnemies === 1,
      expectedReleaseDate: row.expectedReleaseDate || null,
      releaseStatus: row.releaseStatus || null,
      lastSyncAt: row.lastSyncAt || null
    };
  }

  // Authorization Routes
  app.post("/api/auth/login", (req, res) => {
    try {
      const { username, password, stayLoggedIn } = req.body;
      const user: any = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      
      let isValidPass = false;
      if (user) {
        // Fallback for plain text 'admin' password from before migration
        if (user.passwordHash === 'admin' && password === 'admin') {
           isValidPass = true;
           // Auto-migrate the hash
           const newHash = bcrypt.hashSync(password, 10);
           db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(newHash, user.id);
        } else {
           isValidPass = bcrypt.compareSync(password, user.passwordHash);
        }
      }

      if (!user || !isValidPass) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = uuidv4();
      const expiresAt = new Date();
      if (stayLoggedIn) {
        expiresAt.setDate(expiresAt.getDate() + 14);
      } else {
        expiresAt.setHours(expiresAt.getHours() + 24);
      }
      
      db.prepare('INSERT INTO sessions (token, userId, expiresAt) VALUES (?, ?, ?)').run(token, user.id, expiresAt.toISOString());
      
      const safeUser = { id: user.id, username: user.username, role: user.role, profilePic: user.profilePic, bio: user.bio };
      res.json({ token, user: safeUser });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/auth/logout", (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
         db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      }
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/auth/me", (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No token' });
      
      db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(new Date().toISOString());
      
      const session: any = db.prepare('SELECT userId FROM sessions WHERE token = ?').get(token);
      if (!session) return res.status(401).json({ error: 'Session expired' });
      
      const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      
      const safeUser = { id: user.id, username: user.username, role: user.role, profilePic: user.profilePic, bio: user.bio };
      
      res.json({ user: safeUser });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/users", (req, res) => {
     try {
       const actingUserId = getAuthUser(req, res);
      if (!actingUserId) return;
       if (!actingUserId) return res.status(401).json({ error: 'Unauthorized' });
       
       const rows = db.prepare('SELECT id, username, role, profilePic, bio, createdAt, updatedAt FROM users').all();
       res.json(rows);
     } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/users", (req, res) => {
     try {
       const actingUserId = getAuthUser(req, res);
      if (!actingUserId) return;
       const actingUser: any = db.prepare('SELECT role FROM users WHERE id = ?').get(actingUserId);
       if (actingUser?.role !== 'Admin') {
         return res.status(403).json({ error: 'Only admins can create users' });
       }

       const { username, password, role } = req.body;
       const id = uuidv4();
       const hash = bcrypt.hashSync(password, 10);
       db.prepare(`
         INSERT INTO users (id, username, passwordHash, role, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)
       `).run(id, username, hash, role || 'User', new Date().toISOString(), new Date().toISOString());
       res.json({ id, username, role });
     } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.put("/api/users/:id", (req, res) => {
    try {
      const actingUserId = getAuthUser(req, res);
      if (!actingUserId) return;
      const actingUser: any = db.prepare('SELECT role FROM users WHERE id = ?').get(actingUserId);
      const id = req.params.id;

      if (actingUserId !== id && actingUser?.role !== 'Admin') {
        return res.status(403).json({ error: 'Unauthorized to modify this user' });
      }

      const { username, password, role, profilePic, bio } = req.body;
      const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      let hash = null;
      if (password) {
         hash = bcrypt.hashSync(password, 10);
      }

      let finalRole = role;
      // If user is not Admin, they cannot modify roles
      if (actingUser?.role !== 'Admin') {
        finalRole = null;
      }

      db.prepare(`
        UPDATE users SET 
          username = COALESCE(?, username),
          passwordHash = COALESCE(?, passwordHash),
          role = COALESCE(?, role),
          profilePic = COALESCE(?, profilePic),
          bio = COALESCE(?, bio),
          updatedAt = ?
        WHERE id = ?
      `).run(username || null, hash, finalRole || null, profilePic || null, bio || null, new Date().toISOString(), id);
      
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.delete("/api/users/:id", (req, res) => {
     try {
        db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
        res.json({ success: true });
     } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/system-settings", (req, res) => {
    try {
      const sys: any = db.prepare('SELECT * FROM system_settings WHERE id = ?').get('system') || {};
      res.json(sys);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/system-settings", (req, res) => {
    try {
      const actingUserId = getAuthUser(req, res);
      if (!actingUserId) return;
      const actingUser: any = db.prepare('SELECT role FROM users WHERE id = ?').get(actingUserId);
      if (actingUser?.role !== 'Admin') {
         return res.status(403).json({ error: 'Unauthorized. Admins only.' });
      }

      const settings = req.body;
      db.prepare(`
        INSERT INTO system_settings (id, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, geminiApiKey, googleBooksApiKey)
        VALUES ('system', @igdbClientId, @igdbClientSecret, @tmdbApiKey, @hardcoverApiKey, @nanoGptApiKey, @nanoGptModel, @geminiApiKey, @googleBooksApiKey)
        ON CONFLICT(id) DO UPDATE SET
          igdbClientId=excluded.igdbClientId,
          igdbClientSecret=excluded.igdbClientSecret,
          tmdbApiKey=excluded.tmdbApiKey,
          hardcoverApiKey=excluded.hardcoverApiKey,
          nanoGptApiKey=excluded.nanoGptApiKey,
          nanoGptModel=excluded.nanoGptModel,
          geminiApiKey=excluded.geminiApiKey,
          googleBooksApiKey=excluded.googleBooksApiKey
      `).run({
        igdbClientId: settings.igdbClientId || null,
        igdbClientSecret: settings.igdbClientSecret || null,
        tmdbApiKey: settings.tmdbApiKey || null,
        hardcoverApiKey: settings.hardcoverApiKey || null,
        nanoGptApiKey: settings.nanoGptApiKey || null,
        nanoGptModel: settings.nanoGptModel || null,
        geminiApiKey: settings.geminiApiKey || null,
        googleBooksApiKey: settings.googleBooksApiKey || null
      });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // Local DB API Routes
  
  // Public endpoint for Login background
  app.get("/api/public/covers", (req, res) => {
    try {
      const rows = db.prepare('SELECT DISTINCT coverImageUrl FROM media WHERE coverImageUrl IS NOT NULL AND coverImageUrl != \'\' ORDER BY RANDOM() LIMIT 40').all() as {coverImageUrl: string}[];
      res.json(rows.map(r => r.coverImageUrl));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  const syncOngoingMediaInBackground = async (userId: string) => {
    try {
      const now = new Date();
      // 7 days in ms
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      
      const rows: any[] = db.prepare(`SELECT * FROM media WHERE userId = ? AND mediaType = 'Manga' AND (isOngoing = 1 OR releaseStatus IN ('RELEASING', 'HIATUS', 'NOT_YET_RELEASED')) AND originalMediaId IS NOT NULL`).all(userId);
      
      for (const row of rows) {
        let shouldSync = false;
        if (!row.lastSyncAt) {
          shouldSync = true;
        } else {
          const lastSync = new Date(row.lastSyncAt).getTime();
          if (now.getTime() - lastSync > SEVEN_DAYS) {
            shouldSync = true;
          }
        }
        
        if (shouldSync) {
          const mediaId = row.originalMediaId;
          if (mediaId && mediaId.length > 0) {
            try {
              // Fetch MangaDex
              const mangaDexRes = await fetch(`https://api.mangadex.org/manga/${mediaId}`);

              if (mangaDexRes.ok) {
                const data = await mangaDexRes.json();
                if (data.data?.attributes) {
                  const attr = data.data.attributes;
                  let currentChapters = attr.lastChapter ? Math.floor(parseFloat(attr.lastChapter)) : row.totalChapters;
                  let currentVolumes = attr.lastVolume ? Math.floor(parseFloat(attr.lastVolume)) : row.totalIssues;

                  // If ongoing and lastChapter is null, try to fetch aggregate to find the latest chapter
                  if (attr.status === 'ongoing' || !attr.lastChapter) {
                    try {
                      const aggRes = await fetch(`https://api.mangadex.org/manga/${mediaId}/aggregate?translatedLanguage[]=en`);
                      if (aggRes.ok) {
                        const aggData = await aggRes.json();
                        let maxChapter = 0;
                        if (aggData.volumes) {
                          Object.values(aggData.volumes).forEach((vol: any) => {
                            if (vol.chapters) {
                              Object.values(vol.chapters).forEach((chap: any) => {
                                const c = parseFloat(chap.chapter);
                                if (!isNaN(c) && c > maxChapter) {
                                  maxChapter = c;
                                }
                              });
                            }
                          });
                        }
                        if (maxChapter > 0) {
                          currentChapters = Math.floor(maxChapter);
                        }
                      }
                    } catch (aggErr) {
                      console.error("Failed to fetch MangaDex aggregate", aggErr);
                    }
                  }

                  db.prepare(`UPDATE media SET totalChapters = ?, totalIssues = ?, releaseStatus = ?, isOngoing = ?, lastSyncAt = ? WHERE id = ?`)
                    .run(
                      currentChapters, 
                      currentVolumes, 
                      attr.status.toUpperCase(), 
                      (attr.status === "ongoing") ? 1 : 0, 
                      now.toISOString(), 
                      row.id
                    );
                }
              }
            } catch (fetchErr) {
              console.error(`Failed to sync MangaDex media ${mediaId}`, fetchErr);
            }
          }
        }
      }
    } catch (e) {
      console.error("Background sync failed", e);
    }
  };

  // Helper to extract authenticated user
  const getAuthUser = (req: any, res?: any) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      if (res) res.status(401).json({ error: 'Unauthorized' });
      return null;
    }
    const session: any = db.prepare('SELECT userId, expiresAt FROM sessions WHERE token = ?').get(token);
    if (!session || new Date(session.expiresAt) < new Date()) {
      if (res) res.status(401).json({ error: 'Unauthorized' });
      return null;
    }
    return session.userId;
  };

  // Recalculate Taxonomy Usage Counts on startup
  try {
    const mediaItems = db.prepare('SELECT genres, tags FROM media').all() as any[];
    const counts: Record<string, number> = {};
    const types: Record<string, string> = {};

    mediaItems.forEach(item => {
      const g = safeJsonParse(item.genres);
      const t = safeJsonParse(item.tags);
      g.forEach((name: string) => {
        counts[name] = (counts[name] || 0) + 1;
        types[name] = 'genre';
      });
      t.forEach((name: string) => {
        counts[name] = (counts[name] || 0) + 1;
        types[name] = 'tag';
      });
    });

    db.prepare('UPDATE global_taxonomy SET usageCount = 0').run();
    const updateStmt = db.prepare('UPDATE global_taxonomy SET usageCount = ? WHERE name = ? AND type = ?');
    Object.entries(counts).forEach(([name, count]) => {
      updateStmt.run(count, name, types[name]);
    });
  } catch (e) {
    console.error("Failed to recalculate taxonomy counts", e);
  }

  app.get("/api/media", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // Fire and forget sync
      syncOngoingMediaInBackground(userId as string);
      
      const rows = db.prepare('SELECT * FROM media WHERE userId = ? ORDER BY updatedAt DESC').all(userId);
      res.json(rows.map(normalizeMedia));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/media/:id", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const row = db.prepare('SELECT * FROM media WHERE id = ? AND userId = ?').get(req.params.id, userId);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(normalizeMedia(row));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/media", (req, res) => {
    try {
      const item = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;

      // Handle Taxonomy Usage Counts
      try {
        const oldItem = db.prepare('SELECT genres, tags FROM media WHERE id = ? AND userId = ?').get(item.id, userId) as any;
        const oldGenres = oldItem ? safeJsonParse(oldItem.genres) : [];
        const oldTags = oldItem ? safeJsonParse(oldItem.tags) : [];
        
        const newGenres = item.genres || [];
        const newTags = item.tags || [];

        const updateCount = db.prepare('UPDATE global_taxonomy SET usageCount = usageCount + ? WHERE name = ? AND type = ?');

        // Decrement old
        oldGenres.forEach((g: string) => updateCount.run(-1, g, 'genre'));
        oldTags.forEach((t: string) => updateCount.run(-1, t, 'tag'));
        // Increment new
        newGenres.forEach((g: string) => updateCount.run(1, g, 'genre'));
        newTags.forEach((t: string) => updateCount.run(1, t, 'tag'));
      } catch (e) {
        console.error("Failed to update taxonomy counts", e);
      }

      const stmt = db.prepare(`
        INSERT INTO media (
          id, userId, title, mediaType, coverImageUrl, description, creator, publisher, year, 
          reviewScore, averagePlaytime, hltbMain, hltbMainExtra, hltbCompletionist, selectedHltbType,
          status, userRating, userReview, dropReason, genres, tags, tropes, platforms, franchises,
          playtimeHours, pagesRead, totalPages, chaptersRead, totalChapters,
          season, episodesWatched, totalEpisodes, watched, watchCount, runtimeMinutes,
          issuesRead, totalIssues, isReRun, originalMediaId, expectedReleaseDate, language, isOngoing, noEnemies, storyHeavyModifier, releaseStatus, lastSyncAt, createdAt, updatedAt,
          subtitle, maturityRating
        ) VALUES (
          @id, @userId, @title, @mediaType, @coverImageUrl, @description, @creator, @publisher, @year, 
          @reviewScore, @averagePlaytime, @hltbMain, @hltbMainExtra, @hltbCompletionist, @selectedHltbType,
          @status, @userRating, @userReview, @dropReason, @genres, @tags, @tropes, @platforms, @franchises,
          @playtimeHours, @pagesRead, @totalPages, @chaptersRead, @totalChapters,
          @season, @episodesWatched, @totalEpisodes, @watched, @watchCount, @runtimeMinutes,
          @issuesRead, @totalIssues, @isReRun, @originalMediaId, @expectedReleaseDate, @language, @isOngoing, @noEnemies, @storyHeavyModifier, @releaseStatus, @lastSyncAt, @createdAt, @updatedAt,
          @subtitle, @maturityRating
        )
        ON CONFLICT(id) DO UPDATE SET
          userId=excluded.userId, title=excluded.title, mediaType=excluded.mediaType, coverImageUrl=excluded.coverImageUrl,
          description=excluded.description, creator=excluded.creator, publisher=excluded.publisher,
          year=excluded.year, reviewScore=excluded.reviewScore, averagePlaytime=excluded.averagePlaytime,
          hltbMain=excluded.hltbMain, hltbMainExtra=excluded.hltbMainExtra, hltbCompletionist=excluded.hltbCompletionist,
          selectedHltbType=excluded.selectedHltbType,
          status=excluded.status, userRating=excluded.userRating, userReview=excluded.userReview, dropReason=excluded.dropReason, genres=excluded.genres,
          tags=excluded.tags, tropes=excluded.tropes, platforms=excluded.platforms, franchises=excluded.franchises, playtimeHours=excluded.playtimeHours,
          pagesRead=excluded.pagesRead, totalPages=excluded.totalPages, chaptersRead=excluded.chaptersRead,
          totalChapters=excluded.totalChapters, season=excluded.season, episodesWatched=excluded.episodesWatched,
          totalEpisodes=excluded.totalEpisodes, watched=excluded.watched, watchCount=excluded.watchCount,
          runtimeMinutes=excluded.runtimeMinutes, issuesRead=excluded.issuesRead, totalIssues=excluded.totalIssues,
          isReRun=excluded.isReRun, originalMediaId=excluded.originalMediaId, expectedReleaseDate=excluded.expectedReleaseDate,
          language=excluded.language, isOngoing=excluded.isOngoing, noEnemies=excluded.noEnemies, storyHeavyModifier=excluded.storyHeavyModifier,
          releaseStatus=excluded.releaseStatus, lastSyncAt=excluded.lastSyncAt,
          subtitle=excluded.subtitle, maturityRating=excluded.maturityRating
      `);

      stmt.run({
        id: item.id,
        userId: userId,
        title: item.title,
        mediaType: item.mediaType,
        coverImageUrl: item.coverImageUrl || null,
        description: item.description || null,
        creator: item.creator || null,
        publisher: item.publisher || null,
        year: item.year || null,
        reviewScore: item.reviewScore || null,
        averagePlaytime: item.averagePlaytime || null,
        hltbMain: item.hltbMain || null,
        hltbMainExtra: item.hltbMainExtra || null,
        hltbCompletionist: item.hltbCompletionist || null,
        selectedHltbType: item.selectedHltbType || null,
        status: item.status,
        userRating: item.userRating || null,
        userReview: item.userReview || null,
        dropReason: item.dropReason || null,
        genres: JSON.stringify(item.genres || []),
        tags: JSON.stringify(item.tags || []),
        tropes: JSON.stringify(item.tropes || []),
        platforms: JSON.stringify(item.platforms || []),
        franchises: JSON.stringify(item.franchises || []),
        playtimeHours: item.playtimeHours || null,
        pagesRead: item.pagesRead || null,
        totalPages: item.totalPages || null,
        chaptersRead: item.chaptersRead || null,
        totalChapters: item.totalChapters || null,
        season: item.season || null,
        episodesWatched: item.episodesWatched || null,
        totalEpisodes: item.totalEpisodes || null,
        watched: item.watched ? 1 : 0,
        watchCount: item.watchCount || null,
        runtimeMinutes: item.runtimeMinutes || null,
        issuesRead: item.issuesRead || null,
        totalIssues: item.totalIssues || null,
        isReRun: item.isReRun ? 1 : 0,
        originalMediaId: item.originalMediaId || null,
        expectedReleaseDate: item.expectedReleaseDate || null,
        language: item.language || null,
        subtitle: item.subtitle || null,
        maturityRating: item.maturityRating || null,
        isOngoing: item.isOngoing ? 1 : 0,
        noEnemies: item.noEnemies ? 1 : 0,
        storyHeavyModifier: item.storyHeavyModifier ?? null,
        releaseStatus: item.releaseStatus || null,
        lastSyncAt: item.lastSyncAt || null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      });

      if (item.status === 'Completed') {
        try {
          db.prepare(`
            UPDATE world_bosses 
            SET status = 'Defeated', currentProgress = targetProgress 
            WHERE userId = ? AND mediaId = ? AND status = 'Active'
          `).run(userId, item.id);
        } catch (e) { console.error("Could not defeat boss on media completion", e); }
      }

      const saved = db.prepare('SELECT * FROM media WHERE id = ?').get(item.id);
      res.json(normalizeMedia(saved));
    } catch (e) { 
      console.error("DB Save Error:", e);
      res.status(500).json({ error: String(e) }); 
    }
  });

  app.delete("/api/media/:id", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const row = db.prepare('SELECT id, genres, tags FROM media WHERE id = ? AND userId = ?').get(req.params.id, userId) as any;
      if (!row) return res.status(404).json({ error: 'Not found or unauthorized' });

      // Handle Taxonomy Usage Counts (Decrement)
      try {
        const genres = safeJsonParse(row.genres);
        const tags = safeJsonParse(row.tags);
        const updateCount = db.prepare('UPDATE global_taxonomy SET usageCount = usageCount - 1 WHERE name = ? AND type = ?');
        
        genres.forEach((g: string) => updateCount.run(g, 'genre'));
        tags.forEach((t: string) => updateCount.run(t, 'tag'));
      } catch (e) {
        console.error("Failed to decrement taxonomy counts", e);
      }

      db.prepare('DELETE FROM media WHERE id = ? AND userId = ?').run(req.params.id, userId);
      // SQLite CASCADE will handle deleting the logs attached to this mediaId, 
      // but just incase PRAGMA is off, we manually delete:
      db.prepare('DELETE FROM logs WHERE mediaId = ? AND userId = ?').run(req.params.id, userId);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/logs", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db.prepare('SELECT * FROM logs WHERE userId = ? ORDER BY timestamp DESC').all(userId);
      res.json(rows.map((r: any) => ({
        ...r,
        isHistoric: r.isHistoric === 1
      })));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });



  app.post("/api/logs", (req, res) => {
    try {
      const log = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;
      db.prepare(`
        INSERT INTO logs (id, userId, mediaId, timestamp, metricType, delta, note, location, isHistoric)
        VALUES (@id, @userId, @mediaId, @timestamp, @metricType, @delta, @note, @location, @isHistoric)
      `).run({
        id: log.id,
        userId: userId,
        mediaId: log.mediaId,
        timestamp: log.timestamp,
        metricType: log.metricType,
        delta: log.delta,
        note: log.note || null,
        location: log.location || null,
        isHistoric: log.isHistoric ? 1 : 0
      });

      // Update Streak Mode
      try {
        const todayStr = new Date(log.timestamp).toISOString().split('T')[0];
        const settingsRow: any = db.prepare('SELECT lastActiveDate, currentStreak FROM settings WHERE userId = ?').get(userId);
        
        let newStreak = settingsRow?.currentStreak || 0;
        let lastActiveDate = settingsRow?.lastActiveDate || "";

        if (lastActiveDate !== todayStr) {
          const yesterday = new Date(log.timestamp);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          if (lastActiveDate === yesterdayStr) {
            newStreak += 1;
          } else {
            newStreak = 1; // start a new streak if gap > 1 day
          }
          
          db.prepare(`
            INSERT INTO settings (userId, lastActiveDate, currentStreak) 
            VALUES (?, ?, ?) 
            ON CONFLICT(userId) DO UPDATE SET lastActiveDate=excluded.lastActiveDate, currentStreak=excluded.currentStreak
          `).run(userId, todayStr, newStreak);
        }
      } catch(e) {}

      // Skip clearing AI recaps automatically as it causes unexpected regenerations.
      // Users can refresh manually if needed.
      
      const mediaRow = db.prepare('SELECT * FROM media WHERE id = ? AND userId = ?').get(log.mediaId, userId) as any;
      if (mediaRow) {
        const type = log.metricType;
        const now = new Date().toISOString();
        
        let newStatus = log.status !== undefined ? log.status : mediaRow.status;
        if (newStatus === 'Planning' && log.delta > 0) {
           newStatus = 'Active';
        }
        
        let newUserRating = log.userRating !== undefined ? log.userRating : (mediaRow.userRating !== undefined ? mediaRow.userRating : null);
        let newUserReview = log.userReview !== undefined ? log.userReview : (mediaRow.userReview !== undefined ? mediaRow.userReview : null);
        let newWatched = log.watched !== undefined ? (log.watched ? 1 : 0) : (mediaRow.watched !== undefined ? mediaRow.watched : null);
        
        if (['playtimeHours', 'pagesRead', 'chaptersRead', 'episodesWatched', 'watchCount', 'issuesRead'].includes(type)) {
          if (log.isHistoric) {
            db.prepare(`UPDATE media SET ${type} = IFNULL(${type}, 0) + ?, status = ?, userRating = ?, userReview = ?, watched = ? WHERE id = ? AND userId = ?`).run(log.delta, newStatus, newUserRating, newUserReview, newWatched, log.mediaId, userId);
          } else {
            db.prepare(`UPDATE media SET ${type} = IFNULL(${type}, 0) + ?, updatedAt = ?, status = ?, userRating = ?, userReview = ?, watched = ? WHERE id = ? AND userId = ?`).run(log.delta, now, newStatus, newUserRating, newUserReview, newWatched, log.mediaId, userId);
          }
        } else {
          if (log.isHistoric) {
            db.prepare(`UPDATE media SET status = ?, userRating = ?, userReview = ?, watched = ? WHERE id = ? AND userId = ?`).run(newStatus, newUserRating, newUserReview, newWatched, log.mediaId, userId);
          } else {
            db.prepare(`UPDATE media SET updatedAt = ?, status = ?, userRating = ?, userReview = ?, watched = ? WHERE id = ? AND userId = ?`).run(now, newStatus, newUserRating, newUserReview, newWatched, log.mediaId, userId);
          }
        }
      }
      // Durability Loss & Boss Progress
      if (mediaRow) {
        try {
          const settingsRow: any = db.prepare('SELECT masterPageConfig FROM settings WHERE userId = ?').get(userId);
          const mpConfig = settingsRow?.masterPageConfig ? JSON.parse(settingsRow.masterPageConfig) : {};
          
          let scaledPages = log.delta;
          if (log.metricType === 'playtimeHours') {
            scaledPages = log.delta * (mediaRow.mediaType === 'Visual Novel' ? (mpConfig.vnPagesPerHour || 24) : (mpConfig.gamePagesPerHour || 12));
          } else if (log.metricType === 'chaptersRead') {
            scaledPages = log.delta * (mpConfig.mangaPagesPerChapter || 5);
          } else if (log.metricType === 'episodesWatched') {
            scaledPages = log.delta * (mpConfig.episodesWatchedMultiplier || 30);
          } else if (log.metricType === 'watchCount') {
            scaledPages = log.delta * (mpConfig.moviePagesPerMovie || 100);
          } else if (log.metricType === 'issuesRead') {
            scaledPages = log.delta * (mpConfig.comicPagesPerIssue || 20);
          }

          // 1. Wear out equipment (Equipped items lose durability based on progress)
          const equippedItems: any[] = db.prepare("SELECT id, durability FROM artifacts WHERE userId = ? AND isEquipped = 1 AND durability > 0").all(userId);
          if (equippedItems.length > 0) {
            const updateDurability = db.prepare("UPDATE artifacts SET durability = MAX(0, durability - ?) WHERE id = ?");
            // Each log hit reduces 1 random item durability or all? Let's do 1 random item per log to be fair.
            const randomItem = equippedItems[Math.floor(Math.random() * equippedItems.length)];
            updateDurability.run(1, randomItem.id);
          }

          // 2. Boss Progress
          const boss: any = db.prepare("SELECT * FROM world_bosses WHERE userId = ? AND mediaId = ? AND status = 'Active'").get(userId, log.mediaId);
          if (boss) {
            // Use native log delta instead of scaledPages for media-specific boss goals
            const newProgress = boss.currentProgress + log.delta;
            if (newProgress >= boss.targetProgress) {
              db.prepare("UPDATE world_bosses SET currentProgress = ?, status = 'Defeated', updatedAt = ? WHERE id = ?").run(boss.targetProgress, new Date().toISOString(), boss.id);
            } else {
              db.prepare("UPDATE world_bosses SET currentProgress = ?, updatedAt = ? WHERE id = ?").run(newProgress, new Date().toISOString(), boss.id);
            }
          }
        } catch(e) { console.error("Durability/Boss update failed", e); }
      }

      res.json(db.prepare('SELECT * FROM logs WHERE id = ?').get(log.id));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.put("/api/logs/:id", (req, res) => {
    try {
      const logId = req.params.id;
      const updates = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;

      const existingLog = db.prepare('SELECT * FROM logs WHERE id = ? AND userId = ?').get(logId, userId) as any;
      if (!existingLog) return res.status(404).json({ error: 'Log not found or unauthorized' });

      const newTimestamp = updates.timestamp !== undefined ? updates.timestamp : existingLog.timestamp;
      const newNote = updates.note !== undefined ? updates.note : existingLog.note;
      const newDelta = updates.delta !== undefined ? updates.delta : existingLog.delta;
      const newLocation = updates.location !== undefined ? updates.location : existingLog.location;
      
      const deltaDiff = newDelta - existingLog.delta;

      db.prepare(`
        UPDATE logs SET timestamp = ?, delta = ?, note = ?, location = ?
        WHERE id = ? AND userId = ?
      `).run(newTimestamp, newDelta, newNote, newLocation, logId, userId);

      // Skip clearing AI recaps automatically

      // Update media item total logic
      if (deltaDiff !== 0) {
        const mediaRow = db.prepare('SELECT * FROM media WHERE id = ? AND userId = ?').get(existingLog.mediaId, userId) as any;
        if (mediaRow) {
          const type = existingLog.metricType;
          const now = new Date().toISOString();
          if (['playtimeHours', 'pagesRead', 'chaptersRead', 'episodesWatched', 'watchCount', 'issuesRead'].includes(type)) {
            db.prepare(`UPDATE media SET ${type} = IFNULL(${type}, 0) + ?, updatedAt = ? WHERE id = ? AND userId = ?`).run(deltaDiff, now, existingLog.mediaId, userId);
          }
        }
      }

      res.json(db.prepare('SELECT * FROM logs WHERE id = ?').get(logId));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.delete("/api/logs/:id", (req, res) => {
    try {
      const logId = req.params.id;
      const userId = getAuthUser(req, res);
      if (!userId) return;

      const existingLog = db.prepare('SELECT * FROM logs WHERE id = ? AND userId = ?').get(logId, userId) as any;
      if (!existingLog) return res.status(404).json({ error: 'Log not found or unauthorized' });

      db.prepare('DELETE FROM logs WHERE id = ? AND userId = ?').run(logId, userId);

      // Skip clearing AI recaps automatically

      // Revert media item metrics
      const mediaRow = db.prepare('SELECT * FROM media WHERE id = ? AND userId = ?').get(existingLog.mediaId, userId) as any;
      if (mediaRow) {
        const type = existingLog.metricType;
        const now = new Date().toISOString();
        if (['playtimeHours', 'pagesRead', 'chaptersRead', 'episodesWatched', 'watchCount', 'issuesRead'].includes(type)) {
          // Subtracting the delta, ensuring it doesn't drop below 0
          db.prepare(`UPDATE media SET ${type} = MAX(0, IFNULL(${type}, 0) - ?), updatedAt = ? WHERE id = ? AND userId = ?`).run(existingLog.delta, now, existingLog.mediaId, userId);
        }
      }

      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/settings", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const row: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId);
      if (!row) return res.json({ userId });
      res.json({
        ...row,
        masterPageConfig: row.masterPageConfig ? JSON.parse(row.masterPageConfig) : undefined,
        yearlyGoals: row.yearlyGoals ? JSON.parse(row.yearlyGoals) : undefined,
        questOffsets: row.questOffsets ? JSON.parse(row.questOffsets) : undefined,
        questRerollsUsed: row.questRerollsUsed ? JSON.parse(row.questRerollsUsed) : undefined,
        questConfigs: row.questConfigs ? JSON.parse(row.questConfigs) : undefined
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/settings", (req, res) => {
    try {
      const settings = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;

      const userRec: any = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
      const isAdmin = userRec?.role === 'Admin';
      
      const oldSettings: any = db.prepare('SELECT enemyDifficulty, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, geminiApiKey, googleBooksApiKey FROM settings WHERE userId = ?').get(userId);
      const oldDifficulty = oldSettings?.enemyDifficulty ?? 1.0;
      const newDifficulty = settings.enemyDifficulty ?? 1.0;
      
      db.prepare(`
        INSERT INTO settings (userId, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, geminiApiKey, googleBooksApiKey, timezone, masterPageConfig, yearlyGoals, lastActiveDate, currentStreak, enemyDifficulty, questOffsets, questRerollsUsed, questConfigs)
        VALUES (@userId, @igdbClientId, @igdbClientSecret, @tmdbApiKey, @hardcoverApiKey, @nanoGptApiKey, @nanoGptModel, @geminiApiKey, @googleBooksApiKey, @timezone, @masterPageConfig, @yearlyGoals, @lastActiveDate, @currentStreak, @enemyDifficulty, @questOffsets, @questRerollsUsed, @questConfigs)
        ON CONFLICT(userId) DO UPDATE SET
          igdbClientId=excluded.igdbClientId,
          igdbClientSecret=excluded.igdbClientSecret,
          tmdbApiKey=excluded.tmdbApiKey,
          hardcoverApiKey=excluded.hardcoverApiKey,
          nanoGptApiKey=excluded.nanoGptApiKey,
          nanoGptModel=excluded.nanoGptModel,
          geminiApiKey=excluded.geminiApiKey,
          googleBooksApiKey=excluded.googleBooksApiKey,
          timezone=excluded.timezone,
          masterPageConfig=excluded.masterPageConfig,
          yearlyGoals=excluded.yearlyGoals,
          lastActiveDate=excluded.lastActiveDate,
          currentStreak=excluded.currentStreak,
          enemyDifficulty=excluded.enemyDifficulty,
          questOffsets=excluded.questOffsets,
          questRerollsUsed=excluded.questRerollsUsed,
          questConfigs=excluded.questConfigs
      `).run({
        userId: userId,
        igdbClientId: isAdmin ? (settings.igdbClientId || null) : (oldSettings?.igdbClientId || null),
        igdbClientSecret: isAdmin ? (settings.igdbClientSecret || null) : (oldSettings?.igdbClientSecret || null),
        tmdbApiKey: isAdmin ? (settings.tmdbApiKey || null) : (oldSettings?.tmdbApiKey || null),
        hardcoverApiKey: isAdmin ? (settings.hardcoverApiKey || null) : (oldSettings?.hardcoverApiKey || null),
        nanoGptApiKey: isAdmin ? (settings.nanoGptApiKey || null) : (oldSettings?.nanoGptApiKey || null),
        nanoGptModel: isAdmin ? (settings.nanoGptModel || null) : (oldSettings?.nanoGptModel || null),
        geminiApiKey: isAdmin ? (settings.geminiApiKey || null) : (oldSettings?.geminiApiKey || null),
        googleBooksApiKey: isAdmin ? (settings.googleBooksApiKey || null) : (oldSettings?.googleBooksApiKey || null),
        timezone: settings.timezone || null,
        masterPageConfig: settings.masterPageConfig ? JSON.stringify(settings.masterPageConfig) : null,
        yearlyGoals: settings.yearlyGoals ? JSON.stringify(settings.yearlyGoals) : null,
        lastActiveDate: settings.lastActiveDate || null,
        currentStreak: settings.currentStreak || 0,
        enemyDifficulty: newDifficulty,
        questOffsets: settings.questOffsets ? JSON.stringify(settings.questOffsets) : null,
        questRerollsUsed: settings.questRerollsUsed ? JSON.stringify(settings.questRerollsUsed) : null,
        questConfigs: settings.questConfigs ? JSON.stringify(settings.questConfigs) : null
      });

      // Update active bosses if difficulty changed
      if (oldDifficulty !== newDifficulty) {
        const activeBosses = db.prepare(`
          SELECT wb.id, wb.level, wb.currentProgress, m.mediaType 
          FROM world_bosses wb
          JOIN media m ON wb.mediaId = m.id
          WHERE wb.userId = ? AND wb.status = 'Active'
        `).all(userId) as any[];

        const getBaseTarget = (type: string, lv: number) => {
          const levels = {
            'Game': [1, 2.5, 5, 10, 20],
            'Visual Novel': [1, 2.5, 5, 10, 20],
            'Book': [20, 50, 100, 200, 400],
            'Manga': [3, 6, 10, 17, 30],
            'Series': [1, 3, 6, 12, 20],
            'Comic': [2, 4, 7, 12, 15]
          }[type] || [45, 90, 180, 360, 720]; 
          return levels[lv - 1];
        };

        for (const boss of activeBosses) {
          const baseTarget = getBaseTarget(boss.mediaType, boss.level);
          const newTarget = Math.max(0.1, baseTarget * newDifficulty);
          
          // Check if the boss is now defeated by this change
          const newStatus = boss.currentProgress >= newTarget ? 'Defeated' : 'Active';
          db.prepare("UPDATE world_bosses SET targetProgress = ?, status = ?, updatedAt = ? WHERE id = ?").run(newTarget, newStatus, new Date().toISOString(), boss.id);
        }
      }
      
      const saved: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId);
      res.json({
        ...saved,
        masterPageConfig: saved.masterPageConfig ? JSON.parse(saved.masterPageConfig) : undefined,
        yearlyGoals: saved.yearlyGoals ? JSON.parse(saved.yearlyGoals) : undefined,
        questOffsets: saved.questOffsets ? JSON.parse(saved.questOffsets) : undefined,
        questRerollsUsed: saved.questRerollsUsed ? JSON.parse(saved.questRerollsUsed) : undefined
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/recaps", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db.prepare('SELECT * FROM ai_recaps WHERE userId = ?').all(userId) as any[];
      res.json(rows.map(r => ({
        ...r,
        data: r.data ? JSON.parse(r.data) : null
      })));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/recaps", (req, res) => {
    try {
      const payload = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const id = payload.id || Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO ai_recaps (id, userId, timeframe, timeId, title, summary, data)
        VALUES (@id, @userId, @timeframe, @timeId, @title, @summary, @data)
        ON CONFLICT(userId, timeframe, timeId) DO UPDATE SET
          title=excluded.title, summary=excluded.summary, data=excluded.data
      `).run({
        id,
        userId,
        timeframe: payload.timeframe,
        timeId: payload.timeId,
        title: payload.title || null,
        summary: payload.summary || null,
        data: payload.data ? JSON.stringify(payload.data) : null
      });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/ai-text", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db.prepare('SELECT * FROM ai_text_cache WHERE userId = ?').all(userId);
      const map: Record<string, string> = {};
      rows.forEach((r: any) => map[r.key] = r.value);
      res.json(map);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/ai-text", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const payload = req.body;
      db.prepare(`
        INSERT INTO ai_text_cache (key, userId, value)
        VALUES (@key, @userId, @value)
        ON CONFLICT(userId, key) DO UPDATE SET value=excluded.value
      `).run({
        key: payload.key,
        userId: userId,
        value: payload.value
      });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.delete("/api/ai-text", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const key = req.query.key as string;
      if (key) {
        db.prepare('DELETE FROM ai_text_cache WHERE userId = ? AND key = ?').run(userId, key);
      } else {
        db.prepare('DELETE FROM ai_text_cache WHERE userId = ?').run(userId);
      }
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/artifacts", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db.prepare('SELECT * FROM artifacts WHERE userId = ? ORDER BY earnedAt DESC').all(userId);
      res.json(rows.map((r: any) => ({ ...r, isEquipped: r.isEquipped === 1 })));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/artifacts", (req, res) => {
    try {
      const artifact = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const stmt = db.prepare(`
        INSERT INTO artifacts (id, userId, mediaId, name, description, rarity, type, earnedAt, durability, maxDurability, slot, isEquipped, targetType, targetValue, bonusPercent)
        VALUES (@id, @userId, @mediaId, @name, @description, @rarity, @type, @earnedAt, @durability, @maxDurability, @slot, @isEquipped, @targetType, @targetValue, @bonusPercent)
      `);
      stmt.run({
        id: artifact.id,
        userId: userId,
        mediaId: artifact.mediaId,
        name: artifact.name,
        description: artifact.description,
        rarity: artifact.rarity,
        type: artifact.type,
        earnedAt: artifact.earnedAt,
        durability: artifact.durability || 100,
        maxDurability: artifact.maxDurability || 100,
        slot: artifact.slot || null,
        isEquipped: artifact.isEquipped ? 1 : 0,
        targetType: artifact.targetType || null,
        targetValue: artifact.targetValue || null,
        bonusPercent: artifact.bonusPercent || 0
      });
      
      const mediaItem = db.prepare('SELECT title FROM media WHERE id = ?').get(artifact.mediaId) as any;
      if (mediaItem) {
        generateArtifactImageBackground(userId, artifact.id, artifact.name, artifact.description, mediaItem.title);
      }
      
      res.json({ success: true, artifact });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/artifacts/:id/generate-image", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const artifactId = req.params.id;
      const artifact = db.prepare('SELECT name, description, mediaId, rarity FROM artifacts WHERE id = ? AND userId = ?').get(artifactId, userId) as any;
      if (!artifact) return res.status(404).json({ error: 'Not found' });
      const mediaItem = db.prepare('SELECT title FROM media WHERE id = ?').get(artifact.mediaId) as any;
      if (!mediaItem) return res.status(404).json({ error: 'Media not found' });
      
      // Await so the UI blocks and shows the loading spinner
      await generateArtifactImageBackground(userId, artifactId, artifact.name, artifact.description, mediaItem.title, artifact.rarity);
      
      res.json({ success: true, message: 'Image generation finished.' });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/world-bosses/:id/generate-image", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const bossId = req.params.id;
      const boss = db.prepare('SELECT name, mediaId, level FROM world_bosses WHERE id = ? AND userId = ?').get(bossId, userId) as any;
      if (!boss) return res.status(404).json({ error: 'Not found' });
      const mediaItem = db.prepare('SELECT title, mediaType FROM media WHERE id = ?').get(boss.mediaId) as any;
      if (!mediaItem) return res.status(404).json({ error: 'Media not found' });

      await generateBossImageBackground(userId, bossId, boss.name, mediaItem.title, mediaItem.mediaType, boss.level);
      
      res.json({ success: true, message: 'Image generation finished.' });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.put("/api/artifacts/:id", (req, res) => {
    try {
      const artifact = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const stmt = db.prepare(`
        UPDATE artifacts SET 
          name = @name, description = @description, rarity = @rarity, type = @type, 
          slot = @slot, targetType = @targetType, targetValue = @targetValue, bonusPercent = @bonusPercent
        WHERE id = @id AND userId = @userId
      `);
      stmt.run({
        id: req.params.id,
        userId: userId,
        name: artifact.name,
        description: artifact.description,
        rarity: artifact.rarity,
        type: artifact.type,
        slot: artifact.slot || null,
        targetType: artifact.targetType || null,
        targetValue: artifact.targetValue || null,
        bonusPercent: artifact.bonusPercent || 0
      });
      res.json({ success: true, artifact });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/artifacts/:id/equip", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      
      const id = req.params.id;
      // Get the artifact to find its intended slot
      const artifact = db.prepare('SELECT slot FROM artifacts WHERE id = ? AND userId = ?').get(id, userId) as any;
      if (!artifact || !artifact.slot) {
         return res.status(400).json({ error: "Invalid artifact" });
      }
      
      const slot = artifact.slot;
      db.prepare("UPDATE artifacts SET isEquipped = 0 WHERE userId = ? AND slot = ?").run(userId, slot);
      db.prepare("UPDATE artifacts SET isEquipped = 1 WHERE id = ? AND userId = ?").run(id, userId);
      res.json({ success: true, slot });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/artifacts/:id/unequip", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      db.prepare("UPDATE artifacts SET isEquipped = 0 WHERE id = ? AND userId = ?").run(req.params.id, userId);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/oracle", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db.prepare('SELECT * FROM oracle_messages WHERE userId = ? ORDER BY timestamp DESC LIMIT 5').all(userId);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/oracle/generate", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const hour = new Date().getHours();
      const type = hour < 12 ? 'morning' : 'evening';
      await generateOracleMessage(userId, type);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/world-bosses", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      db.prepare("UPDATE world_bosses SET status = 'Failed' WHERE userId = ? AND status = 'Active' AND expiresAt < ?").run(userId, new Date().toISOString());
      
      let rows = db.prepare('SELECT * FROM world_bosses WHERE userId = ? ORDER BY createdAt DESC').all(userId) as any[];
      if (rows.length === 0) {
        await spawnWorldBoss(userId);
        rows = db.prepare('SELECT * FROM world_bosses WHERE userId = ? ORDER BY createdAt DESC').all(userId) as any[];
      }
      res.json(rows);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/world-bosses/spawn", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      
      await spawnWorldBoss(userId, true);
      const rows = db.prepare('SELECT * FROM world_bosses WHERE userId = ? ORDER BY createdAt DESC').all(userId) as any[];
      res.json(rows);
    } catch (e: any) { 
        res.status(500).json({ error: e.message || String(e) }); 
    }
  });

  app.post("/api/world-bosses/:id/reroll", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      
      const boss = db.prepare('SELECT * FROM world_bosses WHERE id = ? AND userId = ?').get(req.params.id, userId) as any;
      if (!boss) return res.status(404).json({ error: "Not found" });
      
      const mediaItem = db.prepare('SELECT * FROM media WHERE id = ?').get(boss.mediaId) as any;
      const settings = db.prepare('SELECT geminiApiKey FROM settings WHERE userId = ?').get(userId) as any;
      
      let newName = "Void Stalker"; // fallback
      const sysSettings: any = db.prepare('SELECT geminiApiKey FROM system_settings WHERE id = \'system\'').get();
      const apiKey = settings?.geminiApiKey || sysSettings?.geminiApiKey || process.env.GEMINI_API_KEY;
      if (mediaItem && apiKey) {
        try {
          const levelDescriptions: Record<number, string> = {
            1: "Pleb (Laughable, pathetic, weakest minion, joke enemy)",
            2: "Easy (Common enemy, foot soldier, standard hurdle)",
            3: "Medium (Actual threat, elite minion, mini-boss)",
            4: "Hard (Menacing, dangerous antagonist, major boss)",
            5: "World Boss (EPIC, realm-ending, the final form, supreme being)"
          };

          const prompt = `You are an RPG boss generator.
Task: Create ONE boss name and title that perfectly fits the universe of "${mediaItem.title}" (Type: ${mediaItem.mediaType}).
Difficulty: Level ${boss.level} - ${levelDescriptions[boss.level as keyof typeof levelDescriptions]}.

Instructions:
1. USE WEB SEARCH to find actual characters, creatures, villains, or lore from exactly "${mediaItem.title}".
2. Pick an appropriate entity from that media based on the difficulty level. Level 1 should be a joke/laughable, while Level 5 should be an epic, ultimate threat.
3. Make them an RPG boss by giving them an appropriate title based on the difficulty. If the media doesn't have obvious bosses, create a thematic boss out of a character/concept from it.
4. Return ONLY the name and title. No explanations, no markdown.
5. Example format: "Bowser, King of the Koopas".

It MUST directly reference "${mediaItem.title}". Do not use generic fantasy names.`;

          const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              tools: [{ googleSearch: {} }],
              generationConfig: { temperature: 0.9 }
            })
          });

          if (aiRes.ok) {
            const data = await aiRes.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/\*\*/g, '').replace(/\"/g, '').trim() || "";
            if (text) newName = text;
          } else {
            console.error("Gemini API error", await aiRes.text());
          }
        } catch (e) { console.error("Reroll failed", e); }
      }
      
      db.prepare("UPDATE world_bosses SET name = ? WHERE id = ? AND userId = ?").run(newName, boss.id, userId);
      res.json(db.prepare('SELECT * FROM world_bosses WHERE id = ? AND userId = ?').get(boss.id, userId));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // --- Franchises ---
  app.get("/api/franchises", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const f = db.prepare('SELECT * FROM franchises WHERE userId = ?').all(userId);
      res.json(f);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/franchises", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      
      const { name, coverImageUrl, description } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      
      const id = req.body.id || crypto.randomUUID();
      
      const stmt = db.prepare(`
        INSERT INTO franchises (id, userId, name, coverImageUrl, description)
        VALUES (@id, @userId, @name, @coverImageUrl, @description)
        ON CONFLICT(userId, name) DO UPDATE SET
          coverImageUrl=excluded.coverImageUrl,
          description=excluded.description
      `);
      stmt.run({
        id,
        userId,
        name,
        coverImageUrl: coverImageUrl || null,
        description: description || null
      });
      res.json({ success: true, franchise: { id, userId, name, coverImageUrl, description } });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/backup", (req, res) => {
    const result = createDatabaseBackup();
    if (result.success) {
      res.json({ message: "Backup created successfully", file: result.file });
    } else {
      res.status(500).json({ error: result.error });
    }
  });

  // IGDB Video Game Database Integration
  app.get("/api/games/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const userId = getAuthUser(req, res) as string;
      if (!userId) return;
      const userSettings: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) || {};
      const sysSettings: any = db.prepare('SELECT * FROM system_settings WHERE id = ?').get('system') || {};
      const clientId = sysSettings.igdbClientId || process.env.IGDB_CLIENT_ID;
      const clientSecret = sysSettings.igdbClientSecret || process.env.IGDB_CLIENT_SECRET;

      if (!query) {
        return res.status(400).json({ error: "Missing search query" });
      }

      const token = await getIgdbToken(clientId, clientSecret);

      // We use Apicalypse to query IGDB
      // We grab standard fields + involved companies (for developers/publishers) + genres
      const body = `
        search "${query}";
        fields name, summary, cover.image_id, first_release_date, total_rating, total_rating_count, category, involved_companies.company.name, involved_companies.developer, involved_companies.publisher, genres.name, themes.name, platforms.name, franchises.name;
        limit 50;
      `;

      const igdbRes = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Client-ID": clientId as string,
          "Authorization": `Bearer ${token}`
        },
        body: body
      });

      if (!igdbRes.ok) {
        throw new Error(`IGDB error: ${igdbRes.statusText}`);
      }

      let data = await igdbRes.json();

      // Sort logic: Prioritize Main Games (0), Remakes (8), Remasters (9), Standalone Expansions (4).
      // Downgrade DLCs (1), Expansions (2), Updates (14), Episodes (6), Seasons (7), Ports (11), etc.
      // Additionally, sort by total_rating_count to bring popular titles up.
      data.sort((a: any, b: any) => {
        const getPriority = (cat: number) => {
          if (cat === 0) return 1; // main
          if (cat === 8 || cat === 9) return 2; // remakes/remasters
          if (cat === 4 || cat === 10) return 3; // standalone exp / expanded
          if (cat === 11) return 4; // ports
          if (cat === 1 || cat === 2) return 5; // dlc / exp
          return 6; // patches, updates, mods, etc.
        };
        const pA = getPriority(a.category);
        const pB = getPriority(b.category);
        
        if (pA !== pB) return pA - pB;
        
        const countA = a.total_rating_count || 0;
        const countB = b.total_rating_count || 0;
        if (countA !== countB) return countB - countA;
        
        return 0; // fallback to IGDB relevance
      });

      // Limit array back to 20 after sorting
      data = data.slice(0, 20);

      const mappedResults = await Promise.all(data.map(async (game: any) => {
        let developer = "";
        let publisher = "";
        
        if (game.involved_companies) {
          const dev = game.involved_companies.find((ic: any) => ic.developer);
          const pub = game.involved_companies.find((ic: any) => ic.publisher);
          if (dev && dev.company) developer = dev.company.name;
          if (pub && pub.company) publisher = pub.company.name;
        }

        let hltbMain = 0;
        let hltbMainExtra = 0;
        let hltbCompletionist = 0;
        try {
          const hltbResults = await hltbSearch(game.name);
          if (hltbResults && hltbResults.length > 0) {
            const hltbRecord = hltbResults[0];
            hltbMain = hltbRecord.gameplayMain || 0;
            hltbMainExtra = hltbRecord.gameplayMainExtra || 0;
            hltbCompletionist = hltbRecord.gameplayCompletionist || 0;
          }
        } catch (e) {
          console.error(`HLTB error for ${game.name}:`, e);
        }

        return {
          id: game.id.toString(),
          title: game.name,
          description: game.summary,
          coverImageUrl: game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg` : "",
          year: game.first_release_date ? new Date(game.first_release_date * 1000).getFullYear() : undefined,
          expectedReleaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString() : undefined,
          reviewScore: game.total_rating ? Math.round(game.total_rating / 10) / 2 : undefined,
          averagePlaytime: hltbMainExtra || hltbMain || 0,
          hltbMain,
          hltbMainExtra,
          hltbCompletionist,
          selectedHltbType: 'mainExtra' as const,
          genres: [],
          tags: [],
          platforms: game.platforms ? game.platforms.map((p: any) => p.name) : [],
          franchises: game.franchises ? game.franchises.map((f: any) => f.name) : [],
          developer,
          publisher
        };
      }));

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching IGDB:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from VGDB." });
    }
  });

  app.get("/api/hltb/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) return res.status(400).json({ error: "Missing query" });
      
      const results = await hltbSearch(query);
      if (results && results.length > 0) {
        const top = results[0];
        res.json({
          hltbMain: top.gameplayMain || 0,
          hltbMainExtra: top.gameplayMainExtra || 0,
          hltbCompletionist: top.gameplayCompletionist || 0
        });
      } else {
        res.status(404).json({ error: "No HLTB data found" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Taxonomy API
  app.get("/api/taxonomy", (req, res) => {
    try {
      const type = req.query.type as string;
      let query = 'SELECT * FROM global_taxonomy ORDER BY usageCount DESC, name ASC';
      const params: any[] = [];
      
      if (type === 'genre' || type === 'tag') {
        query = 'SELECT * FROM global_taxonomy WHERE type = ? ORDER BY usageCount DESC, name ASC';
        params.push(type);
      }
      
      const results = db.prepare(query).all(...params);
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/taxonomy", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      
      const user: any = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
      if (user?.role !== 'Admin') {
        return res.status(403).json({ error: 'Only admins can modify taxonomy' });
      }

      const { name, type } = req.body;
      if (!name || (type !== 'genre' && type !== 'tag')) {
        return res.status(400).json({ error: 'Invalid taxonomy data' });
      }

      const id = uuidv4();
      db.prepare('INSERT INTO global_taxonomy (id, type, name) VALUES (?, ?, ?)').run(id, type, name);
      res.json({ id, type, name, usageCount: 0 });
    } catch (e: any) {
      if (e.message.includes('UNIQUE constraint')) {
        res.status(400).json({ error: 'Taxonomy item already exists' });
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  app.delete("/api/taxonomy/:id", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      
      const user: any = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
      if (user?.role !== 'Admin') {
        return res.status(403).json({ error: 'Only admins can modify taxonomy' });
      }

      db.prepare('DELETE FROM global_taxonomy WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // TMDB proxy integration for Movies and Series
  app.get("/api/tmdb/search", async (req, res) => {
    try {
      const userId = getAuthUser(req, res) as string;
      if (!userId) return;
      const userSettings: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) || {};
      const sysSettings: any = db.prepare('SELECT * FROM system_settings WHERE id = ?').get('system') || {};
      const apiKey = sysSettings.tmdbApiKey || process.env.TMDB_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "Missing TMDB API KEY. Please configure it in Settings." });
      }

      const query = req.query.q as string;
      const type = req.query.type as string; // 'movie' or 'tv'
      if (!query || !type) return res.json([]);

      // 1. Search for the basic items
      const searchRes = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=1`);
      if (!searchRes.ok) {
         throw new Error("Failed to search TMDB");
      }
      
      const searchData = await searchRes.json();
      const topResults = (searchData.results || []).slice(0, 20);

      // 2. Fetch detailed info (credits + genres + keywords) for the top 20
      const detailedResults = await Promise.all(topResults.map(async (item: any) => {
         const detailRes = await fetch(`https://api.themoviedb.org/3/${type}/${item.id}?api_key=${apiKey}&append_to_response=credits,keywords`);
         if (!detailRes.ok) return null;
         return detailRes.json();
      }));

      // 3. Map into expected format
      const mappedResults = detailedResults.filter(Boolean).map((detail: any) => {
        let creator = "";
        if (type === 'movie' && detail.credits?.crew) {
           const director = detail.credits.crew.find((c: any) => c.job === 'Director');
           if (director) creator = director.name;
        } else if (type === 'tv' && detail.created_by && detail.created_by.length > 0) {
           creator = detail.created_by.map((c: any) => c.name).join(', ');
        }

        const genres = (detail.genres || []).map((g: any) => g.name);

        let tags: string[] = [];
        if (detail.keywords) {
           const kwList = detail.keywords.keywords || detail.keywords.results || [];
           tags = kwList.map((k: any) => k.name).filter(Boolean);
        }

        let franchises: string[] = [];
        if (detail.belongs_to_collection) {
           franchises.push(detail.belongs_to_collection.name);
        }

        const seasons = detail.seasons ? detail.seasons.map((s: any) => ({
          id: s.id.toString(),
          name: s.name,
          seasonNumber: s.season_number,
          episodeCount: s.episode_count,
          overview: s.overview,
          posterPath: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : "",
          voteAverage: s.vote_average,
          airDate: s.air_date
        })) : [];

        // Parse runtime
        let runtimeMinutes: number | undefined = undefined;
        if (type === 'movie' && detail.runtime) {
          runtimeMinutes = detail.runtime;
        } else if (type === 'tv') {
          if (detail.episode_run_time && detail.episode_run_time.length > 0) {
            runtimeMinutes = detail.episode_run_time[0];
          } else if (detail.last_episode_to_air && detail.last_episode_to_air.runtime) {
            runtimeMinutes = detail.last_episode_to_air.runtime;
          } else if (detail.next_episode_to_air && detail.next_episode_to_air.runtime) {
            runtimeMinutes = detail.next_episode_to_air.runtime;
          }
        }

        return {
          id: detail.id.toString(),
          title: type === 'movie' ? detail.title : detail.name,
          description: detail.overview,
          coverImageUrl: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : "",
          year: type === 'movie' ? (detail.release_date ? new Date(detail.release_date).getFullYear() : undefined) : (detail.first_air_date ? new Date(detail.first_air_date).getFullYear() : undefined),
          reviewScore: detail.vote_average ? Math.round(detail.vote_average) / 2 : undefined, // 0-10 -> 0-5
          genres: [],
          tags: [],
          franchises: franchises,
          creator: creator,
          totalEpisodes: type === 'tv' ? detail.number_of_episodes : undefined,
          runtimeMinutes: runtimeMinutes,
          seasons: type === 'tv' ? seasons : undefined
        };
      });

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching TMDB:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from TMDB." });
    }
  });

  // VNDB Kana API Integration for Visual Novels
  app.get("/api/vndb/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) return res.json([]);

      const payload = {
        filters: ["search", "=", query],
        fields: "title, image.url, description, rating, developers.name, length_minutes, released, tags.name",
        results: 20
      };

      const searchRes = await fetch('https://api.vndb.org/kana/vn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!searchRes.ok) throw new Error("Failed to search VNDB");
      
      const searchData = await searchRes.json();
      
      const mappedResults = (searchData.results || []).map((vn: any) => {
        const developer = (vn.developers && vn.developers.length > 0) ? vn.developers[0].name : "Unknown Developer";

        return {
          id: vn.id,
          title: vn.title,
          description: vn.description,
          coverImageUrl: vn.image?.url || "",
          developer: developer,
          year: vn.released ? new Date(vn.released).getFullYear() : undefined,
          reviewScore: vn.rating ? Math.round(vn.rating / 10) / 2 : undefined, // Convert 1-100 to 0-5
          averagePlaytime: vn.length_minutes ? Math.round(vn.length_minutes / 60) : undefined,
          genres: []
        };
      });

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching VNDB:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from VNDB." });
    }
  });

  // Google Books Integration
  app.get("/api/books/search", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const userSettings: any = db.prepare('SELECT googleBooksApiKey FROM settings WHERE userId = ?').get(userId) || {};
      const sysSettings: any = db.prepare('SELECT googleBooksApiKey FROM system_settings WHERE id = ?').get('system') || {};
      const apiKey = sysSettings.googleBooksApiKey || process.env.GOOGLE_BOOKS_API_KEY;

      const query = req.query.q as string;
      const lang = req.query.lang as string;

      if (!query) {
        return res.status(400).json({ error: "Missing search query" });
      }

      let mappedResults: any[] = [];
      let fetchSuccess = false;

      // Try Google Books First
      try {
        const pages = [0, 40, 80];
        let allItems: any[] = [];

        for (const startIndex of pages) {
          let retryCount = 0;
          let success = false;
          while (retryCount < 2 && !success) {
            try {
              let googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=40&startIndex=${startIndex}`;
              if (lang) {
                googleUrl += `&langRestrict=${lang}`;
              }
              if (apiKey) {
                googleUrl += `&key=${apiKey}`;
              }
              const res = await fetch(googleUrl, {
                headers: {
                  'User-Agent': 'FauxLoreMediaTracker/1.0'
                }
              });

              if (!res.ok) {
                if (res.status === 503) {
                  // Retry on 503
                  retryCount++;
                  await new Promise(r => setTimeout(r, 1000));
                  continue;
                }
                console.warn(`Google Books API HTTP Error: ${res.status} at index ${startIndex}`);
                break; // Stop fetching more pages on other errors
              }
              const data = await res.json();
              if (data.items) {
                allItems = allItems.concat(data.items);
              }
              success = true;
              if (!data.items || data.items.length < 40) {
                break; // No more results
              }
            } catch (err) {
              console.error(`Google Books fetch failed at index ${startIndex}:`, err);
              break; // Network or parsing error, keep what we have
            }
          }
          if (!success) {
             break; // If we failed all retries for this page, stop fetching more pages
          }
        }

        if (allItems.length > 0) {
          // Deduplicate by ID
          const uniqueItems = Array.from(new Map(allItems.map(item => [item.id, item])).values());
          
          mappedResults = uniqueItems
            .filter((item: any) => {
              const l = item.volumeInfo?.language?.toLowerCase();
              if (lang) {
                return l === lang.toLowerCase();
              }
              return l === 'en' || l === 'de'; // Only English & German by default
            })
            .sort((a: any, b: any) => {
              const titleA = (a.volumeInfo?.title || '').toLowerCase();
              const titleB = (b.volumeInfo?.title || '').toLowerCase();
              const queryLower = query.toLowerCase();
              
              const aExact = titleA === queryLower ? 1 : 0;
              const bExact = titleB === queryLower ? 1 : 0;
              if (aExact !== bExact) return bExact - aExact;
              
              const aStarts = titleA.startsWith(queryLower) ? 1 : 0;
              const bStarts = titleB.startsWith(queryLower) ? 1 : 0;
              if (aStarts !== bStarts) return bStarts - aStarts;

              const aIncludes = titleA.includes(queryLower) ? 1 : 0;
              const bIncludes = titleB.includes(queryLower) ? 1 : 0;
              if (aIncludes !== bIncludes) return bIncludes - aIncludes;

              const aRatingsCount = a.volumeInfo?.ratingsCount || 0;
              const bRatingsCount = b.volumeInfo?.ratingsCount || 0;
              return bRatingsCount - aRatingsCount;
            })
            .map((item: any) => {
              const volumeInfo = item.volumeInfo || {};
            
            let creator = "Unknown Author";
            if (volumeInfo.authors && volumeInfo.authors.length > 0) {
              creator = volumeInfo.authors.join(", ");
            }

            let coverImageUrl = "";
            if (volumeInfo.imageLinks) {
              coverImageUrl = volumeInfo.imageLinks.thumbnail?.replace('http:', 'https:') 
                || volumeInfo.imageLinks.smallThumbnail?.replace('http:', 'https:') 
                || "";
            }

            const year = volumeInfo.publishedDate ? parseInt(volumeInfo.publishedDate.substring(0, 4)) : undefined;

            return {
              id: `gb_${item.id}`,
              title: volumeInfo.title || "Unknown Title",
              subtitle: volumeInfo.subtitle || "",
              description: volumeInfo.description || "",
              publisher: volumeInfo.publisher || "",
              language: volumeInfo.language ? volumeInfo.language.toUpperCase() : "",
              maturityRating: volumeInfo.maturityRating || "",
              coverImageUrl: coverImageUrl,
              year: !isNaN(year as number) ? year : undefined,
              reviewScore: volumeInfo.averageRating ? Math.round(volumeInfo.averageRating * 2) / 2 : undefined,
              totalPages: volumeInfo.pageCount,
              creator: creator,
              genres: []
            };
          });
        }
      } catch (err) {
        console.error(`Google Books search processing failed:`, err);
        // We do not throw here so we can return empty results instead of crashing
      }

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching Google Books:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from Google Books." });
    }
  });

  // MangaDex API proxy for Manga
  app.get("/api/manga/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Missing search query" });
      }

      const mangaDexRes = await fetch(`https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=20&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic&includes[]=cover_art&includes[]=author`);

      if (!mangaDexRes.ok) {
        throw new Error(`MangaDex error: ${mangaDexRes.statusText} (${mangaDexRes.status})`);
      }

      const data = await mangaDexRes.json();
      const mangaList = data.data || [];

      const mappedResults = await Promise.all(mangaList.map(async (m: any) => {
        const attr = m.attributes;
        const title = attr.title.en || attr.title.ja || attr.title["ja-ro"] || Object.values(attr.title)[0];
        const description = attr.description.en || Object.values(attr.description || {})[0] || "";
        
        const authorRel = m.relationships.find((r: any) => r.type === "author");
        const author = authorRel?.attributes?.name || "";

        const coverRel = m.relationships.find((r: any) => r.type === "cover_art");
        const filename = coverRel?.attributes?.fileName;
        const coverImageUrl = filename ? `https://uploads.mangadex.org/covers/${m.id}/${filename}` : "";

        let totalChapters = attr.lastChapter ? Math.floor(parseFloat(attr.lastChapter)) : undefined;
        let totalIssues = attr.lastVolume ? Math.floor(parseFloat(attr.lastVolume)) : undefined;

        // If ongoing, try a quick aggregate fetch to get current progress
        if (attr.status === 'ongoing' && !totalChapters) {
          try {
            const aggRes = await fetch(`https://api.mangadex.org/manga/${m.id}/aggregate?translatedLanguage[]=en`);
            if (aggRes.ok) {
              const aggData = await aggRes.json();
              let maxChap = 0;
              if (aggData.volumes) {
                Object.values(aggData.volumes).forEach((v: any) => {
                  Object.values(v.chapters || {}).forEach((c: any) => {
                    const num = parseFloat(c.chapter);
                    if (!isNaN(num) && num > maxChap) maxChap = num;
                  });
                });
              }
              if (maxChap > 0) totalChapters = Math.floor(maxChap);
            }
          } catch (e) {
            // Ignore error for search enrichment
          }
        }

        return {
          id: m.id,
          title,
          description: description.replace(/\[\/?\w+\]/g, ""), // Simple BBCode removal
          coverImageUrl,
          year: attr.year,
          reviewScore: undefined,
          totalChapters,
          totalIssues,
          genres: [],
          tags: attr.tags.map((t: any) => t.attributes.name.en),
          creator: author,
          releaseStatus: attr.status.toUpperCase(),
          isOngoing: attr.status === "ongoing"
        };
      }));

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching MangaDex:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from MangaDex." });
    }
  });

  app.use('/uploads', express.static(uploadsDir));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
