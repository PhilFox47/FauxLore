import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";

/** Weekly/encore World Boss spawner with level/difficulty scaling and AI naming. */
export function createWorldBossService(
  { db, generateBossImageBackground }: {
    db: Db;
    generateBossImageBackground: (userId: string, bossId: string, bossName: string, mediaTitle: string, mediaType: string, bossLevel?: number) => Promise<void>;
  },
) {
  async function spawnWorldBoss(userId: string, throwOnEmpty = false, targetMediaType?: string) {
    try {
      // Eligible media: non-movies that are 'Active', plus Movies that are 'Active' OR
      // 'Planning' (movies usually jump straight from Planning to Watched). Excludes media
      // with enemies disabled and media that already has an active enemy.
      const typeFilter = (targetMediaType && targetMediaType !== 'All' && targetMediaType !== 'All Media Types') ? targetMediaType : null;
      const queryExt = typeFilter ? " AND mediaType = ?" : "";
      const eligibleWhere = `userId = ? AND (noEnemies = 0 OR noEnemies IS NULL) AND ((mediaType != 'Movie' AND status = 'Active') OR (mediaType = 'Movie' AND status IN ('Active', 'Planning')))`;

      const anyParams: any[] = typeFilter ? [userId, typeFilter] : [userId];
      const anyEligible = db.prepare(`SELECT id FROM media WHERE ${eligibleWhere}${queryExt}`).all(...anyParams) as any[];
      if (anyEligible.length === 0) {
        if (throwOnEmpty) {
          if (typeFilter) throw new Error(`No eligible ${typeFilter} found (excluding disabled enemies).`);
          throw new Error("No eligible media found (excluding disabled enemies). Start consuming a Media Item to spawn an enemy!");
        }
        return;
      }

      const spawnParams: any[] = typeFilter ? [userId, userId, typeFilter] : [userId, userId];
      const candidates = db.prepare(`SELECT id, title, mediaType, isHighPriority FROM media WHERE ${eligibleWhere} AND id NOT IN (SELECT mediaId FROM world_bosses WHERE userId = ? AND status = 'Active')${queryExt}`).all(...spawnParams) as any[];
      if (candidates.length === 0) {
        if (throwOnEmpty) throw new Error("All your eligible media already have enemies. Defeat or survive them before requesting an Encore!");
        return;
      }

      // --- Even type roll, then rotate ---
      // The media TYPE is chosen first and every type has the same chance, so a large
      // library never crowds out a small one. Only types with at least one eligible
      // entry can be drawn, since byType is built from the candidates themselves.
      //
      // Types that already have a live enemy are then set aside, so a second enemy
      // lands on a different type. Once every eligible type is represented, the
      // exclusion is dropped and types may repeat.
      const byType: Record<string, any[]> = {};
      for (const c of candidates) {
        (byType[c.mediaType] = byType[c.mediaType] || []).push(c);
      }
      const allTypes = Object.keys(byType);

      const activeTypes = new Set(
        (db
          .prepare(
            `SELECT DISTINCT m.mediaType AS t FROM world_bosses b
               JOIN media m ON m.id = b.mediaId
              WHERE b.userId = ? AND b.status = 'Active'`,
          )
          .all(userId) as any[]).map((r) => r.t),
      );

      const unrepresented = allTypes.filter((t) => !activeTypes.has(t));
      // An explicit type request (Encore on a specific type) always wins.
      const typePool = typeFilter ? allTypes : (unrepresented.length > 0 ? unrepresented : allTypes);

      const chosenType = typePool[Math.floor(Math.random() * typePool.length)];


      const settings: any = db.prepare('SELECT geminiApiKey, enemyDifficulty, mediaDifficulty FROM settings WHERE userId = ?').get(userId);
      const enemyDifficulty = settings?.enemyDifficulty ?? 1.0;
      let mDiff = 1.0;
      if (settings?.mediaDifficulty) {
        try {
          const parsed = JSON.parse(settings.mediaDifficulty);
          if (parsed[chosenType] !== undefined) {
             mDiff = parsed[chosenType];
          }
        } catch(e) {}
      }

      const difficulty = enemyDifficulty * mDiff;

      // --- Level determination ---
      // Movies are ALWAYS level 2. Everything else rolls by weekday using relative weights
      // for levels [1,2,3,4,5] (normalized at pick time so they need not sum to 100).
      const LEVEL_WEIGHTS_BY_DAY: Record<number, number[]> = {
        1: [10, 25, 30, 25, 10], // Monday
        2: [10, 25, 30, 30, 5],  // Tuesday
        3: [15, 30, 35, 20, 0],  // Wednesday
        4: [15, 35, 40, 10, 0],  // Thursday
        5: [25, 40, 30, 0, 0],   // Friday
        6: [55, 45, 10, 0, 0],   // Saturday
        0: [80, 20, 0, 0, 0],    // Sunday
      };

      let level: number;
      if (chosenType === 'Movie') {
        level = 2;
      } else {
        const weights = LEVEL_WEIGHTS_BY_DAY[new Date().getDay()] || LEVEL_WEIGHTS_BY_DAY[0];
        const totalLevelWeight = weights.reduce((a, b) => a + b, 0);
        let lr = Math.random() * totalLevelWeight;
        level = 1;
        for (let i = 0; i < weights.length; i++) {
          lr -= weights[i];
          if (lr < 0) { level = i + 1; break; }
        }

        // Enforce active-enemy caps with a downgrade cascade:
        // L5 max 1, L4 max 1, L3 max 3, L1/L2 unlimited. If the rolled level is full,
        // step down one level at a time until it fits (or reaches level 1).
        const LEVEL_CAPS: Record<number, number> = { 3: 3, 4: 1, 5: 1 };
        const activeCounts: Record<number, number> = {};
        (db.prepare("SELECT level, COUNT(*) as c FROM world_bosses WHERE userId = ? AND status = 'Active' GROUP BY level").all(userId) as any[])
          .forEach(row => { activeCounts[row.level] = row.c; });
        while (level > 1 && LEVEL_CAPS[level] !== undefined && (activeCounts[level] || 0) >= LEVEL_CAPS[level]) {
          level--;
        }
      }

      // Finally the specific entry, now that type and level are settled. Entries within
      // the type are equally likely, except high-priority ones which get doubled odds.
      const entryPool: any[] = [];
      for (const m of byType[chosenType]) {
        entryPool.push(m);
        if (m.isHighPriority) entryPool.push(m);
      }
      const mediaItem = entryPool[Math.floor(Math.random() * entryPool.length)];

      const getBaseTarget = (type: string, lv: number) => {
        const levels = {
          'Game': [2, 5, 10, 20, 40],
          'Visual Novel': [2, 5, 10, 20, 40],
          'Book': [40, 100, 200, 400, 800],
          'Manga': [6, 12, 20, 34, 60],
          'Series': [2, 6, 12, 24, 40],
          'Comic': [4, 8, 14, 24, 30],
          'Movie': [1, 1, 1, 1, 1]
        }[type] || [90, 180, 360, 720, 1440]; // Fallback to old Master Pages scale

        return levels[lv - 1];
      };

      const getUnit = (type: string) => ({
        'Game': 'Hours',
        'Visual Novel': 'Hours',
        'Book': 'Pages',
        'Manga': 'Chapters',
        'Series': 'Episodes',
        'Comic': 'Issues',
        'Movie': 'Movies'
      }[type] || 'Units');

      const baseTarget = getBaseTarget(mediaItem.mediaType, level);
      // A movie boss is beaten simply by watching the movie once, regardless of difficulty.
      const target = mediaItem.mediaType === 'Movie' ? 1 : Math.max(0.1, baseTarget * difficulty);
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
      
      // Auto-generate image in background (styled to the boss's level)
      generateBossImageBackground(userId, bossId, bossName, mediaItem.title, mediaItem.mediaType, level);
    } catch (e) { 
        console.error("Boss spawn failed", e); 
        if (throwOnEmpty) throw e;
    }
  }

  return { spawnWorldBoss };
}
