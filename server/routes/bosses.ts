import type { Express } from "express";
import type { ServerContext } from "../context";
import { getAiConfig, nanoGenerateText } from "../lib/ai";

export function registerBossRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, generateBossImageBackground, spawnWorldBoss } = ctx;

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
      
      const { mediaType } = req.body || {};

      await spawnWorldBoss(userId, true, mediaType);
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
      let newName = "Void Stalker"; // fallback
      const aiConfig = getAiConfig(db, userId);
      if (mediaItem && aiConfig) {
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

          const text = (await nanoGenerateText(aiConfig, prompt, { temperature: 0.9, webSearch: true }))
            .replace(/\*\*/g, '').replace(/\"/g, '').trim();
          if (text) newName = text;
        } catch (e) { console.error("Reroll failed", e); }
      }
      
      db.prepare("UPDATE world_bosses SET name = ? WHERE id = ? AND userId = ?").run(newName, boss.id, userId);
      res.json(db.prepare('SELECT * FROM world_bosses WHERE id = ? AND userId = ?').get(boss.id, userId));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
