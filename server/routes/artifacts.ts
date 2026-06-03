import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerArtifactRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, generateArtifactImageBackground } = ctx;

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

}
