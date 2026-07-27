import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerArtifactRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, generateArtifactImageBackground, generateLoot } = ctx;

  /**
   * Writes a drop for a media entry: rarity, slot and bonus are rolled here, and
   * the AI names it, writes its flavour and art-directs its icon from the media's
   * Codex. The client keeps the result and decides its durability before saving.
   */
  app.post("/api/artifacts/generate", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const { mediaId, oldArtifact } = req.body || {};
      const mediaItem = db.prepare('SELECT * FROM media WHERE id = ? AND userId = ?').get(mediaId, userId) as any;
      if (!mediaItem) return res.status(404).json({ error: 'Media not found' });

      const loot = await generateLoot(userId, ctx.normalizeMedia(mediaItem), oldArtifact);
      if (!loot) {
        return res.status(502).json({ error: 'The Loot Master could not forge an item. Check that a Nano-GPT key is configured.' });
      }
      res.json(loot);
    } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
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
        INSERT INTO artifacts (id, userId, mediaId, name, description, rarity, type, earnedAt, durability, maxDurability, slot, isEquipped, targetType, targetValue, bonusPercent, imagePrompt)
        VALUES (@id, @userId, @mediaId, @name, @description, @rarity, @type, @earnedAt, @durability, @maxDurability, @slot, @isEquipped, @targetType, @targetValue, @bonusPercent, @imagePrompt)
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
        // ?? not ||: a broken item arrives with durability 0, which `||` would
        // silently repair back to full.
        durability: artifact.durability ?? 100,
        maxDurability: artifact.maxDurability || 100,
        slot: artifact.slot || null,
        isEquipped: artifact.isEquipped ? 1 : 0,
        targetType: artifact.targetType || null,
        targetValue: artifact.targetValue || null,
        bonusPercent: artifact.bonusPercent || 0,
        // Written by the loot generator alongside the item's name and flavour, so
        // the icon is drawn from the same idea rather than re-derived later.
        imagePrompt: artifact.imagePrompt || null
      });

      // Image generation is triggered explicitly by the client via
      // POST /api/artifacts/:id/generate-image (which uses the artifact's real
      // rarity). Generating here too would produce a duplicate, wrong-rarity
      // image that gets overwritten moments later during the loot reveal.

      res.json({ success: true, artifact });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/artifacts/:id/generate-image", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const artifactId = req.params.id;
      const artifact = db.prepare('SELECT id FROM artifacts WHERE id = ? AND userId = ?').get(artifactId, userId) as any;
      if (!artifact) return res.status(404).json({ error: 'Not found' });

      // Await so the UI blocks and shows the loading spinner
      await generateArtifactImageBackground(userId, artifactId);

      res.json({ success: true, message: 'Image generation finished.' });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.put("/api/artifacts/:id", (req, res) => {
    try {
      const artifact = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // An edited item is a different item: its stored image prompt no longer
      // describes it, so it is replaced (or dropped, and re-art-directed on the
      // next image generation).
      const stmt = db.prepare(`
        UPDATE artifacts SET
          name = @name, description = @description, rarity = @rarity, type = @type,
          slot = @slot, targetType = @targetType, targetValue = @targetValue, bonusPercent = @bonusPercent,
          imagePrompt = @imagePrompt
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
        bonusPercent: artifact.bonusPercent || 0,
        imagePrompt: artifact.imagePrompt || null
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
