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
      // Exclude Movies from boss spawns as they are either watched or unwatched (not ongoing)
      // Also exclude media where user explicitly disabled enemies
      let queryExt = "";
      let paramsActive: any[] = [userId];
      let paramsSpawn: any[] = [userId, userId];
      
      if (targetMediaType && targetMediaType !== 'All' && targetMediaType !== 'All Media Types') {
          queryExt = " AND mediaType = ?";
          paramsActive.push(targetMediaType);
          paramsSpawn.push(targetMediaType);
      }

      const allActiveMedia = db.prepare(`SELECT id FROM media WHERE userId = ? AND status = 'Active' AND mediaType != 'Movie' AND (noEnemies = 0 OR noEnemies IS NULL)${queryExt}`).all(...paramsActive) as any[];
      if (allActiveMedia.length === 0) {
        if (throwOnEmpty) {
            if (targetMediaType && targetMediaType !== 'All' && targetMediaType !== 'All Media Types') {
                throw new Error(`No active ${targetMediaType} found (excluding disabled enemies).`);
            }
            throw new Error("No active media found (excluding Movies & disabled enemies). Start consuming a Media Item to spawn an enemy!");
        }
        return;
      }

      const activeMedia = db.prepare(`SELECT id, title, mediaType, isHighPriority FROM media WHERE userId = ? AND status = 'Active' AND mediaType != 'Movie' AND (noEnemies = 0 OR noEnemies IS NULL) AND id NOT IN (SELECT mediaId FROM world_bosses WHERE userId = ? AND status = 'Active')${queryExt}`).all(...paramsSpawn) as any[];
      if (activeMedia.length === 0) {
        if (throwOnEmpty) throw new Error("All your active media already have enemies. Defeat or survive them before requesting an Encore!");
        return;
      }

      // Create a weighted pool
      const pool: any[] = [];
      for (const m of activeMedia) {
        pool.push(m);
        // Double the chance if it's high priority
        if (m.isHighPriority) {
          pool.push(m);
        }
      }

      const mediaItem = pool[Math.floor(Math.random() * pool.length)];
      const settings: any = db.prepare('SELECT geminiApiKey, enemyDifficulty, mediaDifficulty FROM settings WHERE userId = ?').get(userId);
      const enemyDifficulty = settings?.enemyDifficulty ?? 1.0;
      let mDiff = 1.0;
      if (settings?.mediaDifficulty) {
        try {
          const parsed = JSON.parse(settings.mediaDifficulty);
          if (parsed[mediaItem.mediaType] !== undefined) {
             mDiff = parsed[mediaItem.mediaType];
          }
        } catch(e) {}
      }
      
      const difficulty = enemyDifficulty * mDiff;
      
      const dayIndex = new Date().getDay();
      const r = Math.random();
      let level = 1;
      
      switch(dayIndex) {
        case 1: // Monday
          if (r < 0.3) level = 3;
          else if (r < 0.6) level = 4;
          else level = 5;
          break;
        case 2: // Tuesday
          if (r < 0.1) level = 2;
          else if (r < 0.3) level = 3;
          else if (r < 0.6) level = 4;
          else level = 5;
          break;
        case 3: // Wednesday
          if (r < 0.05) level = 1;
          else if (r < 0.20) level = 2;
          else if (r < 0.60) level = 3;
          else if (r < 0.90) level = 4;
          else level = 5;
          break;
        case 4: // Thursday
          if (r < 0.1) level = 1;
          else if (r < 0.3) level = 2;
          else if (r < 0.6) level = 3;
          else level = 4;
          break;
        case 5: // Friday
          if (r < 0.2) level = 1;
          else if (r < 0.55) level = 2;
          else level = 3;
          break;
        case 6: // Saturday
          if (r < 0.4) level = 1;
          else level = 2;
          break;
        case 0: // Sunday
        default:
          level = 1;
          break;
      }

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

  return { spawnWorldBoss };
}
