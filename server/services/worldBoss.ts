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
      // Difficulty ramps with how many enemies are already live, rather than with the
      // weekday: the auto-spawn lands on an empty board and should be survivable on a
      // busy week, while asking for more is opting in to harder ones.
      //
      //   no enemies yet -> always level 3 (the Monday spawn)
      //   one enemy live  -> the first Encore: level 4 (75%) or level 5 (25%)
      //   beyond that     -> any level, subject to the caps below
      //
      // Levels 4 and 5 are mutually exclusive and capped: at most two level 4s, at
      // most one level 5, and neither may join the other. Movies ignore all of this
      // and are always level 2, since a movie boss is beaten by watching it once.
      const activeLevels = (db
        .prepare("SELECT level, COUNT(*) as c FROM world_bosses WHERE userId = ? AND status = 'Active' GROUP BY level")
        .all(userId) as any[]);
      const countAt: Record<number, number> = {};
      activeLevels.forEach((row) => { countAt[row.level] = row.c; });
      const activeCount = activeLevels.reduce((sum, row) => sum + row.c, 0);

      const allows = (lv: number) => {
        if (lv === 5) return (countAt[5] || 0) < 1 && (countAt[4] || 0) === 0;
        if (lv === 4) return (countAt[4] || 0) < 2 && (countAt[5] || 0) === 0;
        return true; // 1-3 are uncapped
      };

      let level: number;
      if (chosenType === 'Movie') {
        level = 2;
      } else if (activeCount === 0) {
        level = 3;
      } else if (activeCount === 1) {
        // First Encore: usually a level 4, occasionally a level 5, which keeps the
        // top tier rare. Preference order is filtered by what the caps allow.
        const wanted = Math.random() < 0.25 ? [5, 4] : [4, 5];
        level = wanted.find(allows) ?? 3;
      } else {
        const open = [1, 2, 3, 4, 5].filter(allows);
        level = open[Math.floor(Math.random() * open.length)];
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
