import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerSystemSettingsRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;

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
        INSERT INTO system_settings (id, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, nanoGptWebModel, geminiApiKey, googleBooksApiKey, imageModel, imageSize, imageSteps, imageGuidance, imageNegativePrompt)
        VALUES ('system', @igdbClientId, @igdbClientSecret, @tmdbApiKey, @hardcoverApiKey, @nanoGptApiKey, @nanoGptModel, @nanoGptWebModel, @geminiApiKey, @googleBooksApiKey, @imageModel, @imageSize, @imageSteps, @imageGuidance, @imageNegativePrompt)
        ON CONFLICT(id) DO UPDATE SET
          igdbClientId=excluded.igdbClientId,
          igdbClientSecret=excluded.igdbClientSecret,
          tmdbApiKey=excluded.tmdbApiKey,
          hardcoverApiKey=excluded.hardcoverApiKey,
          nanoGptApiKey=excluded.nanoGptApiKey,
          nanoGptModel=excluded.nanoGptModel,
          nanoGptWebModel=excluded.nanoGptWebModel,
          geminiApiKey=excluded.geminiApiKey,
          googleBooksApiKey=excluded.googleBooksApiKey,
          imageModel=excluded.imageModel,
          imageSize=excluded.imageSize,
          imageSteps=excluded.imageSteps,
          imageGuidance=excluded.imageGuidance,
          imageNegativePrompt=excluded.imageNegativePrompt
      `).run({
        igdbClientId: settings.igdbClientId || null,
        igdbClientSecret: settings.igdbClientSecret || null,
        tmdbApiKey: settings.tmdbApiKey || null,
        hardcoverApiKey: settings.hardcoverApiKey || null,
        nanoGptApiKey: settings.nanoGptApiKey || null,
        nanoGptModel: settings.nanoGptModel || null,
        nanoGptWebModel: settings.nanoGptWebModel || null,
        geminiApiKey: settings.geminiApiKey || null,
        googleBooksApiKey: settings.googleBooksApiKey || null,
        imageModel: settings.imageModel || null,
        imageSize: settings.imageSize || null,
        imageSteps: (settings.imageSteps === undefined || settings.imageSteps === null || settings.imageSteps === '') ? null : Number(settings.imageSteps),
        imageGuidance: (settings.imageGuidance === undefined || settings.imageGuidance === null || settings.imageGuidance === '') ? null : Number(settings.imageGuidance),
        imageNegativePrompt: settings.imageNegativePrompt || null
      });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
