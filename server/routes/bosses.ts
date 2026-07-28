import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerBossRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, generateBossImageBackground, spawnWorldBoss, generateEnemy, activity } = ctx;

  app.post("/api/world-bosses/:id/generate-image", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // Dormant accounts cost nothing: this call spends tokens.
      if (!activity.requireActive(userId as string, res)) return;
      const bossId = req.params.id;
      const boss = db.prepare('SELECT id FROM world_bosses WHERE id = ? AND userId = ?').get(bossId, userId) as any;
      if (!boss) return res.status(404).json({ error: 'Not found' });

      await generateBossImageBackground(userId, bossId);

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
      // Dormant accounts cost nothing: this call spends tokens.
      if (!activity.requireActive(userId as string, res)) return;
      
      const { mediaType } = req.body || {};

      await spawnWorldBoss(userId, true, mediaType);
      const rows = db.prepare('SELECT * FROM world_bosses WHERE userId = ? ORDER BY createdAt DESC').all(userId) as any[];
      res.json(rows);
    } catch (e: any) { 
        res.status(500).json({ error: e.message || String(e) }); 
    }
  });

  /**
   * Rerolls the whole enemy, not just its name: a new opponent is written from the
   * media's Codex, and its portrait is redrawn to match, since the old one now
   * depicts something that no longer exists.
   */
  app.post("/api/world-bosses/:id/reroll", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // Dormant accounts cost nothing: this call spends tokens.
      if (!activity.requireActive(userId as string, res)) return;

      const boss = db.prepare('SELECT * FROM world_bosses WHERE id = ? AND userId = ?').get(req.params.id, userId) as any;
      if (!boss) return res.status(404).json({ error: "Not found" });

      const mediaItem = db.prepare('SELECT * FROM media WHERE id = ?').get(boss.mediaId) as any;
      const enemy = mediaItem ? await generateEnemy(userId, mediaItem, boss.level) : null;

      if (enemy) {
        db.prepare("UPDATE world_bosses SET name = ?, title = ?, description = ?, imagePrompt = ?, updatedAt = ? WHERE id = ? AND userId = ?")
          .run(enemy.name, enemy.title || null, enemy.description || null, enemy.imagePrompt || null, new Date().toISOString(), boss.id, userId);
        // Awaited so the client's spinner covers the redraw and one refresh shows
        // the finished enemy.
        await generateBossImageBackground(userId, boss.id);
      }

      res.json(db.prepare('SELECT * FROM world_bosses WHERE id = ? AND userId = ?').get(boss.id, userId));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
