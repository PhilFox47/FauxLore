import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import * as dotenv from "dotenv";
import Database from "better-sqlite3";
import fs from "fs";
import cron from "node-cron";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";

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

  
  // Automatic Migrations
  try { db.exec("ALTER TABLE media ADD COLUMN language TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN isOngoing INTEGER"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN releaseStatus TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN lastSyncAt TEXT"); } catch (e) { /* Ignore if it exists */ }

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
      language TEXT,
      isOngoing INTEGER,
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
      geminiApiKey TEXT
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
      timezone TEXT,
      masterPageConfig TEXT,
      yearlyGoals TEXT,
      lastActiveDate TEXT,
      currentStreak INTEGER
    );

    CREATE TABLE IF NOT EXISTS ai_recaps (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT 'default_user',
      timeframe TEXT NOT NULL,
      timeId TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      UNIQUE(userId, timeframe, timeId)
    );

    CREATE TABLE IF NOT EXISTS ai_text_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
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
      FOREIGN KEY(mediaId) REFERENCES media(id) ON DELETE CASCADE
    );
  `);

  // Migration steps
  try { 
    const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    if (!adminExists) {
      const defaultHash = bcrypt.hashSync('admin', 10);
      db.prepare(`
        INSERT INTO users (id, username, passwordHash, role, createdAt, updatedAt) 
        VALUES ('default_user', 'admin', ?, 'Admin', ?, ?)
        ON CONFLICT(id) DO UPDATE SET username=excluded.username
      `).run(defaultHash, new Date().toISOString(), new Date().toISOString());
    }
  } catch (e) {
    console.error("Migration: seed user", e);
  }

  // Migrate API keys from settings to system_settings
  try {
    const adminSettings: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get('default_user');
    if (adminSettings) {
      db.prepare(`
        INSERT INTO system_settings (id, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, geminiApiKey)
        VALUES ('system', @igdbClientId, @igdbClientSecret, @tmdbApiKey, @hardcoverApiKey, @nanoGptApiKey, @nanoGptModel, @geminiApiKey)
        ON CONFLICT(id) DO UPDATE SET
          igdbClientId=COALESCE(system_settings.igdbClientId, excluded.igdbClientId),
          igdbClientSecret=COALESCE(system_settings.igdbClientSecret, excluded.igdbClientSecret),
          tmdbApiKey=COALESCE(system_settings.tmdbApiKey, excluded.tmdbApiKey),
          hardcoverApiKey=COALESCE(system_settings.hardcoverApiKey, excluded.hardcoverApiKey),
          nanoGptApiKey=COALESCE(system_settings.nanoGptApiKey, excluded.nanoGptApiKey),
          nanoGptModel=COALESCE(system_settings.nanoGptModel, excluded.nanoGptModel),
          geminiApiKey=COALESCE(system_settings.geminiApiKey, excluded.geminiApiKey)
      `).run({
        igdbClientId: adminSettings.igdbClientId || null,
        igdbClientSecret: adminSettings.igdbClientSecret || null,
        tmdbApiKey: adminSettings.tmdbApiKey || null,
        hardcoverApiKey: adminSettings.hardcoverApiKey || null,
        nanoGptApiKey: adminSettings.nanoGptApiKey || null,
        nanoGptModel: adminSettings.nanoGptModel || null,
        geminiApiKey: adminSettings.geminiApiKey || null,
      });
    }
  } catch (e) {
    console.error("Migration: system_settings", e);
  }

  try { db.prepare("ALTER TABLE media ADD COLUMN userId TEXT NOT NULL DEFAULT 'default_user'").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE logs ADD COLUMN userId TEXT NOT NULL DEFAULT 'default_user'").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE ai_recaps ADD COLUMN userId TEXT NOT NULL DEFAULT 'default_user'").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE ai_text_cache ADD COLUMN userId TEXT NOT NULL DEFAULT 'default_user'").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN questDifficulty REAL").run(); } catch (e) {} // old
  try { db.prepare("ALTER TABLE settings ADD COLUMN yearlyGoals TEXT").run(); console.log("Migration: Added yearlyGoals"); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN nanoGptApiKey TEXT").run(); console.log("Migration: Added nanoGptApiKey"); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN nanoGptModel TEXT").run(); console.log("Migration: Added nanoGptModel"); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN geminiApiKey TEXT").run(); console.log("Migration: Added geminiApiKey"); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN lastActiveDate TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN currentStreak INTEGER").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN hltbMain REAL").run(); } catch (e) {}
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
  
  try { db.prepare("ALTER TABLE media ADD COLUMN originalMediaId TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN selectedHltbType TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN subtitle TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN maturityRating TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE logs ADD COLUMN location TEXT").run(); } catch (e) {}
  
  try { db.prepare("UPDATE media SET status = 'Active' WHERE status = 'Playing'").run(); } catch(e) {}
  try { db.prepare("UPDATE media SET status = 'Planning' WHERE status = 'Backlog'").run(); } catch(e) {}

  const normalizeMedia = (row: any) => ({
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    tags: row.tags ? JSON.parse(row.tags) : [],
    tropes: row.tropes ? JSON.parse(row.tropes) : [],
    platforms: row.platforms ? JSON.parse(row.platforms) : [],
    franchises: row.franchises ? JSON.parse(row.franchises) : [],
    watched: row.watched === 1,
    isReRun: row.isReRun === 1,
    isOngoing: row.isOngoing === 1,
    releaseStatus: row.releaseStatus || null,
    lastSyncAt: row.lastSyncAt || null
  });

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
        INSERT INTO system_settings (id, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, geminiApiKey)
        VALUES ('system', @igdbClientId, @igdbClientSecret, @tmdbApiKey, @hardcoverApiKey, @nanoGptApiKey, @nanoGptModel, @geminiApiKey)
        ON CONFLICT(id) DO UPDATE SET
          igdbClientId=excluded.igdbClientId,
          igdbClientSecret=excluded.igdbClientSecret,
          tmdbApiKey=excluded.tmdbApiKey,
          hardcoverApiKey=excluded.hardcoverApiKey,
          nanoGptApiKey=excluded.nanoGptApiKey,
          nanoGptModel=excluded.nanoGptModel,
          geminiApiKey=excluded.geminiApiKey
      `).run({
        igdbClientId: settings.igdbClientId || null,
        igdbClientSecret: settings.igdbClientSecret || null,
        tmdbApiKey: settings.tmdbApiKey || null,
        hardcoverApiKey: settings.hardcoverApiKey || null,
        nanoGptApiKey: settings.nanoGptApiKey || null,
        nanoGptModel: settings.nanoGptModel || null,
        geminiApiKey: settings.geminiApiKey || null
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
          const id = parseInt(row.originalMediaId);
          if (!isNaN(id)) {
            // Fetch Anilist
            const graphqlQuery = `
              query ($id: Int) {
                Media (id: $id, type: MANGA) {
                  status
                  chapters
                  volumes
                }
              }
            `;
            const aniRes = await fetch("https://graphql.anilist.co", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
              },
              body: JSON.stringify({ query: graphqlQuery, variables: { id } })
            });

            if (aniRes.ok) {
              const data = await aniRes.json();
              if (data.data?.Media) {
                const media = data.data.Media;
                db.prepare(`UPDATE media SET totalChapters = ?, totalIssues = ?, releaseStatus = ?, isOngoing = ?, lastSyncAt = ? WHERE id = ?`)
                  .run(
                    media.chapters, 
                    media.volumes || row.totalIssues, 
                    media.status, 
                    (media.status === "RELEASING" || media.status === "HIATUS" || media.status === "NOT_YET_RELEASED") ? 1 : 0, 
                    now.toISOString(), 
                    row.id
                  );
              }
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
      const stmt = db.prepare(`
        INSERT INTO media (
          id, userId, title, mediaType, coverImageUrl, description, creator, publisher, year, 
          reviewScore, averagePlaytime, hltbMain, hltbMainExtra, hltbCompletionist, selectedHltbType,
          status, userRating, genres, tags, tropes, platforms, franchises,
          playtimeHours, pagesRead, totalPages, chaptersRead, totalChapters,
          season, episodesWatched, totalEpisodes, watched, watchCount, runtimeMinutes,
          issuesRead, totalIssues, isReRun, originalMediaId, language, isOngoing, releaseStatus, lastSyncAt, createdAt, updatedAt,
          subtitle, maturityRating
        ) VALUES (
          @id, @userId, @title, @mediaType, @coverImageUrl, @description, @creator, @publisher, @year, 
          @reviewScore, @averagePlaytime, @hltbMain, @hltbMainExtra, @hltbCompletionist, @selectedHltbType,
          @status, @userRating, @genres, @tags, @tropes, @platforms, @franchises,
          @playtimeHours, @pagesRead, @totalPages, @chaptersRead, @totalChapters,
          @season, @episodesWatched, @totalEpisodes, @watched, @watchCount, @runtimeMinutes,
          @issuesRead, @totalIssues, @isReRun, @originalMediaId, @language, @isOngoing, @releaseStatus, @lastSyncAt, @createdAt, @updatedAt,
          @subtitle, @maturityRating
        )
        ON CONFLICT(id) DO UPDATE SET
          userId=excluded.userId, title=excluded.title, mediaType=excluded.mediaType, coverImageUrl=excluded.coverImageUrl,
          description=excluded.description, creator=excluded.creator, publisher=excluded.publisher,
          year=excluded.year, reviewScore=excluded.reviewScore, averagePlaytime=excluded.averagePlaytime,
          hltbMain=excluded.hltbMain, hltbMainExtra=excluded.hltbMainExtra, hltbCompletionist=excluded.hltbCompletionist,
          selectedHltbType=excluded.selectedHltbType,
          status=excluded.status, userRating=excluded.userRating, genres=excluded.genres,
          tags=excluded.tags, tropes=excluded.tropes, platforms=excluded.platforms, franchises=excluded.franchises, playtimeHours=excluded.playtimeHours,
          pagesRead=excluded.pagesRead, totalPages=excluded.totalPages, chaptersRead=excluded.chaptersRead,
          totalChapters=excluded.totalChapters, season=excluded.season, episodesWatched=excluded.episodesWatched,
          totalEpisodes=excluded.totalEpisodes, watched=excluded.watched, watchCount=excluded.watchCount,
          runtimeMinutes=excluded.runtimeMinutes, issuesRead=excluded.issuesRead, totalIssues=excluded.totalIssues,
          isReRun=excluded.isReRun, originalMediaId=excluded.originalMediaId,
          language=excluded.language, isOngoing=excluded.isOngoing,
          releaseStatus=excluded.releaseStatus, lastSyncAt=excluded.lastSyncAt,
          updatedAt=excluded.updatedAt, subtitle=excluded.subtitle, maturityRating=excluded.maturityRating
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
        language: item.language || null,
        subtitle: item.subtitle || null,
        maturityRating: item.maturityRating || null,
        isOngoing: item.isOngoing ? 1 : 0,
        releaseStatus: item.releaseStatus || null,
        lastSyncAt: item.lastSyncAt || null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      });
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
      const row = db.prepare('SELECT id FROM media WHERE id = ? AND userId = ?').get(req.params.id, userId);
      if (!row) return res.status(404).json({ error: 'Not found or unauthorized' });

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
      res.json(rows);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/logs", (req, res) => {
    try {
      const log = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;
      db.prepare(`
        INSERT INTO logs (id, userId, mediaId, timestamp, metricType, delta, note, location)
        VALUES (@id, @userId, @mediaId, @timestamp, @metricType, @delta, @note, @location)
      `).run({
        id: log.id,
        userId: userId,
        mediaId: log.mediaId,
        timestamp: log.timestamp,
        metricType: log.metricType,
        delta: log.delta,
        note: log.note || null,
        location: log.location || null
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

      // Clear the AI recap cache for this specific timeframe to force regeneration
      try {
        const d = new Date(log.timestamp);
        // We aren't guaranteed to have date-fns here so do basic JS
        // Just empty all recaps for this userId where timeId matches the approximate week/month/year?
        // Actually, it's safer to just delete all recaps for the user entirely? No, let's just delete them all.
        // It forces regeneration next time they visit Recaps. The cost is negligible considering how rare back-logging is.
        // Even better, find the specific IDs.
        // Year:
        const year = d.getFullYear().toString();
        // Month:
        const month = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        
        db.prepare(`DELETE FROM ai_recaps WHERE userId = ? AND timeId IN (?, ?, 'all')`).run(userId, year, month);

        // For weeks it's RRRR-II format... which is hard to compute without date-fns. 
        // Let's just delete the 'weekly' ones that might match or are close. Actually let's delete ALL weekly recaps for this user to be safe if a back-log happens.
        db.prepare(`DELETE FROM ai_recaps WHERE userId = ? AND timeframe = 'weekly'`).run(userId);
      } catch(e) {
        // fail silently
      }
      
      const mediaRow = db.prepare('SELECT * FROM media WHERE id = ? AND userId = ?').get(log.mediaId, userId) as any;
      if (mediaRow) {
        const type = log.metricType;
        const now = new Date().toISOString();
        
        let newStatus = mediaRow.status;
        if (newStatus === 'Planning' && log.delta > 0) {
           newStatus = 'Active';
        }
        
        if (['playtimeHours', 'pagesRead', 'chaptersRead', 'episodesWatched', 'watchCount', 'issuesRead'].includes(type)) {
          db.prepare(`UPDATE media SET ${type} = IFNULL(${type}, 0) + ?, updatedAt = ?, status = ? WHERE id = ? AND userId = ?`).run(log.delta, now, newStatus, log.mediaId, userId);
        } else {
          db.prepare(`UPDATE media SET updatedAt = ?, status = ? WHERE id = ? AND userId = ?`).run(now, newStatus, log.mediaId, userId);
        }
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

      // Clean AI recaps similar to add log if timestamp or delta changed significantly
      if (deltaDiff !== 0 || newTimestamp !== existingLog.timestamp) {
        try {
          db.prepare(`DELETE FROM ai_recaps WHERE userId = ?`).run(userId);
        } catch(e) {}
      }

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

      // Clean AI recaps
      try {
        db.prepare(`DELETE FROM ai_recaps WHERE userId = ?`).run(userId);
      } catch(e) {}

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
        yearlyGoals: row.yearlyGoals ? JSON.parse(row.yearlyGoals) : undefined
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/settings", (req, res) => {
    try {
      const settings = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;
      
      db.prepare(`
        INSERT INTO settings (userId, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, geminiApiKey, timezone, masterPageConfig, yearlyGoals, lastActiveDate, currentStreak)
        VALUES (@userId, @igdbClientId, @igdbClientSecret, @tmdbApiKey, @hardcoverApiKey, @nanoGptApiKey, @nanoGptModel, @geminiApiKey, @timezone, @masterPageConfig, @yearlyGoals, @lastActiveDate, @currentStreak)
        ON CONFLICT(userId) DO UPDATE SET
          igdbClientId=excluded.igdbClientId,
          igdbClientSecret=excluded.igdbClientSecret,
          tmdbApiKey=excluded.tmdbApiKey,
          hardcoverApiKey=excluded.hardcoverApiKey,
          nanoGptApiKey=excluded.nanoGptApiKey,
          nanoGptModel=excluded.nanoGptModel,
          geminiApiKey=excluded.geminiApiKey,
          timezone=excluded.timezone,
          masterPageConfig=excluded.masterPageConfig,
          yearlyGoals=excluded.yearlyGoals,
          lastActiveDate=excluded.lastActiveDate,
          currentStreak=excluded.currentStreak
      `).run({
        userId: userId,
        igdbClientId: settings.igdbClientId || null,
        igdbClientSecret: settings.igdbClientSecret || null,
        tmdbApiKey: settings.tmdbApiKey || null,
        hardcoverApiKey: settings.hardcoverApiKey || null,
        nanoGptApiKey: settings.nanoGptApiKey || null,
        nanoGptModel: settings.nanoGptModel || null,
        geminiApiKey: settings.geminiApiKey || null,
        timezone: settings.timezone || null,
        masterPageConfig: settings.masterPageConfig ? JSON.stringify(settings.masterPageConfig) : null,
        yearlyGoals: settings.yearlyGoals ? JSON.stringify(settings.yearlyGoals) : null,
        lastActiveDate: settings.lastActiveDate || null,
        currentStreak: settings.currentStreak || 0
      });
      
      const saved: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId);
      res.json({
        ...saved,
        masterPageConfig: saved.masterPageConfig ? JSON.parse(saved.masterPageConfig) : undefined,
        yearlyGoals: saved.yearlyGoals ? JSON.parse(saved.yearlyGoals) : undefined
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/recaps", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db.prepare('SELECT * FROM ai_recaps WHERE userId = ?').all(userId);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/recaps", (req, res) => {
    try {
      const payload = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const id = payload.id || Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO ai_recaps (id, userId, timeframe, timeId, title, summary)
        VALUES (@id, @userId, @timeframe, @timeId, @title, @summary)
        ON CONFLICT(userId, timeframe, timeId) DO UPDATE SET
          title=excluded.title, summary=excluded.summary
      `).run({
        id,
        userId,
        timeframe: payload.timeframe,
        timeId: payload.timeId,
        title: payload.title || null,
        summary: payload.summary || null
      });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/ai-text", (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM ai_text_cache').all();
      const map: Record<string, string> = {};
      rows.forEach((r: any) => map[r.key] = r.value);
      res.json(map);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/ai-text", (req, res) => {
    try {
      const payload = req.body;
      db.prepare(`
        INSERT INTO ai_text_cache (key, value)
        VALUES (@key, @value)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
      `).run({
        key: payload.key,
        value: payload.value
      });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.delete("/api/ai-text", (req, res) => {
    try {
      const key = req.query.key as string;
      if (key) {
        db.prepare('DELETE FROM ai_text_cache WHERE key = ?').run(key);
      } else {
        db.prepare('DELETE FROM ai_text_cache').run();
      }
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/artifacts", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db.prepare('SELECT * FROM artifacts WHERE userId = ? ORDER BY earnedAt DESC').all(userId);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/artifacts", (req, res) => {
    try {
      const artifact = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const stmt = db.prepare(`
        INSERT INTO artifacts (id, userId, mediaId, name, description, rarity, type, earnedAt)
        VALUES (@id, @userId, @mediaId, @name, @description, @rarity, @type, @earnedAt)
      `);
      stmt.run({
        id: artifact.id,
        userId: userId,
        mediaId: artifact.mediaId,
        name: artifact.name,
        description: artifact.description,
        rarity: artifact.rarity,
        type: artifact.type,
        earnedAt: artifact.earnedAt
      });
      res.json({ success: true, artifact });
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
      const settings: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) || {};
      const clientId = settings.igdbClientId || process.env.IGDB_CLIENT_ID;
      const clientSecret = settings.igdbClientSecret || process.env.IGDB_CLIENT_SECRET;

      if (!query) {
        return res.status(400).json({ error: "Missing search query" });
      }

      const token = await getIgdbToken(clientId, clientSecret);

      // We use Apicalypse to query IGDB
      // We grab standard fields + involved companies (for developers/publishers) + genres
      const body = `
        search "${query}";
        fields name, summary, cover.image_id, first_release_date, total_rating, involved_companies.company.name, involved_companies.developer, involved_companies.publisher, genres.name, themes.name, platforms.name, franchises.name;
        limit 20;
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

      const data = await igdbRes.json();

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
          reviewScore: game.total_rating ? Math.round(game.total_rating / 10) / 2 : undefined,
          averagePlaytime: hltbMainExtra || hltbMain || 0,
          hltbMain,
          hltbMainExtra,
          hltbCompletionist,
          selectedHltbType: 'mainExtra' as const,
          genres: game.genres ? game.genres.map((g: any) => g.name) : [],
          tags: game.themes ? game.themes.map((t: any) => t.name) : [],
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

  // TMDB proxy integration for Movies and Series
  app.get("/api/tmdb/search", async (req, res) => {
    try {
      const userId = getAuthUser(req, res) as string;
      if (!userId) return;
      const settings: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) || {};
      const apiKey = settings.tmdbApiKey || process.env.TMDB_API_KEY;
      
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
          genres: genres,
          tags: tags,
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
        
        let genres: string[] = [];
        if (vn.tags) {
           genres = vn.tags.slice(0, 5).map((t: any) => t.name).filter(Boolean);
        }

        return {
          id: vn.id,
          title: vn.title,
          description: vn.description,
          coverImageUrl: vn.image?.url || "",
          developer: developer,
          year: vn.released ? new Date(vn.released).getFullYear() : undefined,
          reviewScore: vn.rating ? Math.round(vn.rating / 10) / 2 : undefined, // Convert 1-100 to 0-5
          averagePlaytime: vn.length_minutes ? Math.round(vn.length_minutes / 60) : undefined,
          genres: genres
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
      const query = req.query.q as string;
      const lang = req.query.lang as string;

      if (!query) {
        return res.status(400).json({ error: "Missing search query" });
      }

      let mappedResults: any[] = [];
      let fetchSuccess = false;

      // Try Google Books First
      try {
        let googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20`;
        if (lang) {
          googleUrl += `&langRestrict=${lang}`;
        }
        const googleRes = await fetch(googleUrl, {
          headers: {
            'User-Agent': 'FauxLoreMediaTracker/1.0'
          }
        });

        if (googleRes.ok) {
          const data = await googleRes.json();
          mappedResults = (data.items || []).map((item: any) => {
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
              language: volumeInfo.language || "",
              maturityRating: volumeInfo.maturityRating || "",
              coverImageUrl: coverImageUrl,
              year: !isNaN(year as number) ? year : undefined,
              reviewScore: volumeInfo.averageRating ? Math.round(volumeInfo.averageRating * 2) / 2 : undefined,
              totalPages: volumeInfo.pageCount,
              creator: creator,
              genres: volumeInfo.categories || []
            };
          });
          fetchSuccess = true;
        } else {
          console.warn(`Google Books API HTTP Error: ${googleRes.status}, falling back to OpenLibrary...`);
        }
      } catch (err) {
        console.warn(`Google Books fetch failed: ${err}, falling back to OpenLibrary...`);
      }

      // Fallback to OpenLibrary
      if (!fetchSuccess) {
        const olRes = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20`);
        if (!olRes.ok) {
          throw new Error(`OpenLibrary API Error: ${olRes.status}`);
        }
        const data = await olRes.json();
        
        mappedResults = (data.docs || []).map((doc: any) => {
          let coverImageUrl = "";
          if (doc.cover_i) {
            coverImageUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
          }

          let creator = "Unknown Author";
          if (doc.author_name && doc.author_name.length > 0) {
             creator = doc.author_name.join(", ");
          }

          return {
            id: `ol_${doc.key}`,
            title: doc.title || "Unknown Title",
            description: "",
            coverImageUrl: coverImageUrl,
            year: doc.first_publish_year,
            reviewScore: undefined,
            totalPages: doc.number_of_pages_median,
            creator: creator,
            genres: doc.subject ? doc.subject.slice(0, 5) : []
          };
        });
      }

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching Google Books:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from Google Books." });
    }
  });

  // Anilist API proxy for Manga
  app.get("/api/anilist/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Missing search query" });
      }

      const graphqlQuery = `
        query ($search: String) {
          Page (perPage: 20) {
            media (search: $search, type: MANGA) {
              id
              title {
                romaji
                english
              }
              description(asHtml: false)
              coverImage {
                extraLarge
              }
              startDate {
                year
              }
              averageScore
              chapters
              volumes
              genres
              status
              tags {
                name
              }
              staff {
                edges {
                  role
                  node {
                    name {
                      full
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const aniRes = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: { search: query }
        })
      });

      if (!aniRes.ok) {
        throw new Error(`Anilist error: ${aniRes.statusText}`);
      }

      const data = await aniRes.json();
      if (data.errors) {
        throw new Error(data.errors[0].message || "GraphQL Error from Anilist API");
      }

      const media = data.data?.Page?.media || [];

      const mappedResults = media.map((m: any) => {
        // Find the creator, typically "Story & Art" or "Story"
        let creator = "";
        if (m.staff?.edges) {
          const mainStaff = m.staff.edges.find((e: any) => 
            e.role?.toLowerCase().includes("story") || 
            e.role?.toLowerCase().includes("art")
          );
          if (mainStaff && mainStaff.node?.name?.full) {
            creator = mainStaff.node.name.full;
          }
        }

        let tags: string[] = [];
        if (m.tags) {
          tags = m.tags.map((t: any) => t.name);
        }

        return {
          id: m.id.toString(),
          title: m.title.english || m.title.romaji,
          description: m.description,
          coverImageUrl: m.coverImage?.extraLarge || "",
          year: m.startDate?.year,
          // Anilist score is out of 100
          reviewScore: m.averageScore ? Math.round(m.averageScore / 10) / 2 : undefined,
          totalChapters: m.chapters,
          totalIssues: m.volumes,
          genres: m.genres || [],
          tags: tags,
          creator: creator,
          releaseStatus: m.status,
          isOngoing: m.status === "RELEASING" || m.status === "HIATUS" || m.status === "NOT_YET_RELEASED"
        };
      });

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching Anilist:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from Anilist." });
    }
  });

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
