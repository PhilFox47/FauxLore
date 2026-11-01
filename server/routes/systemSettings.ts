import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerSystemSettingsRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;

  app.get("/api/system-settings", (req, res) => {
    try {
      const sys: any = db.prepare('SELECT * FROM system_settings WHERE id = ?').get('system') || {};
      // The CLIProxy key is server-only: never ship it to browsers (even admins).
      const { cliProxyApiKey, ...safe } = sys;
      res.json({ ...safe, cliProxyApiKeyConfigured: !!(cliProxyApiKey || process.env.CLIPROXY_API_KEY) });
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
      const previous: any = db.prepare("SELECT cliProxyApiKey FROM system_settings WHERE id = 'system'").get() || {};
      const chosenProvider = settings.aiProvider === 'cliProxy' ? 'cliProxy' : 'nanoGpt';
      // Blank input means retain the stored secret; avoid wiping it on unrelated saves.
      const nextCliKey = typeof settings.cliProxyApiKey === 'string' && settings.cliProxyApiKey.trim()
        ? settings.cliProxyApiKey.trim() : (previous.cliProxyApiKey || null);
      const baseUrl = String(settings.cliProxyBaseUrl || '').trim();
      if (baseUrl) {
        try {
          const url = new URL(baseUrl);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error();
        } catch {
          return res.status(400).json({ error: 'CLIProxyAPI Base URL must be an HTTP(S) URL without credentials, query or fragment.' });
        }
      }
      db.prepare(`
        INSERT INTO system_settings (id, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, nanoGptWebModel, nanoGptCreativeModel, nanoGptProvider, nanoGptSearchProvider, geminiApiKey, googleBooksApiKey, imageModel, imageSize, imageSteps, imageGuidance, imageNegativePrompt, aiProvider, cliProxyBaseUrl, cliProxyApiKey, cliProxyTextModel, cliProxyCreativeModel, cliProxyImageModel, cliProxyCodexModel)
        VALUES ('system', @igdbClientId, @igdbClientSecret, @tmdbApiKey, @hardcoverApiKey, @nanoGptApiKey, @nanoGptModel, @nanoGptWebModel, @nanoGptCreativeModel, @nanoGptProvider, @nanoGptSearchProvider, @geminiApiKey, @googleBooksApiKey, @imageModel, @imageSize, @imageSteps, @imageGuidance, @imageNegativePrompt, @aiProvider, @cliProxyBaseUrl, @cliProxyApiKey, @cliProxyTextModel, @cliProxyCreativeModel, @cliProxyImageModel, @cliProxyCodexModel)
        ON CONFLICT(id) DO UPDATE SET
          igdbClientId=excluded.igdbClientId,
          igdbClientSecret=excluded.igdbClientSecret,
          tmdbApiKey=excluded.tmdbApiKey,
          hardcoverApiKey=excluded.hardcoverApiKey,
          nanoGptApiKey=excluded.nanoGptApiKey,
          nanoGptModel=excluded.nanoGptModel,
          nanoGptWebModel=excluded.nanoGptWebModel,
          nanoGptProvider=excluded.nanoGptProvider,
          nanoGptSearchProvider=excluded.nanoGptSearchProvider,
          nanoGptCreativeModel=excluded.nanoGptCreativeModel,
          geminiApiKey=excluded.geminiApiKey,
          googleBooksApiKey=excluded.googleBooksApiKey,
          imageModel=excluded.imageModel,
          imageSize=excluded.imageSize,
          imageSteps=excluded.imageSteps,
          imageGuidance=excluded.imageGuidance,
          imageNegativePrompt=excluded.imageNegativePrompt,
          aiProvider=excluded.aiProvider,
          cliProxyBaseUrl=excluded.cliProxyBaseUrl,
          cliProxyApiKey=excluded.cliProxyApiKey,
          cliProxyTextModel=excluded.cliProxyTextModel,
          cliProxyCreativeModel=excluded.cliProxyCreativeModel,
          cliProxyImageModel=excluded.cliProxyImageModel,
          cliProxyCodexModel=excluded.cliProxyCodexModel
      `).run({
        igdbClientId: settings.igdbClientId || null,
        igdbClientSecret: settings.igdbClientSecret || null,
        tmdbApiKey: settings.tmdbApiKey || null,
        hardcoverApiKey: settings.hardcoverApiKey || null,
        nanoGptApiKey: settings.nanoGptApiKey || null,
        nanoGptModel: settings.nanoGptModel || null,
        nanoGptWebModel: settings.nanoGptWebModel || null,
        nanoGptProvider: settings.nanoGptProvider || null,
        nanoGptSearchProvider: settings.nanoGptSearchProvider || null,
        nanoGptCreativeModel: settings.nanoGptCreativeModel || null,
        geminiApiKey: settings.geminiApiKey || null,
        googleBooksApiKey: settings.googleBooksApiKey || null,
        imageModel: settings.imageModel || null,
        imageSize: settings.imageSize || null,
        imageSteps: (settings.imageSteps === undefined || settings.imageSteps === null || settings.imageSteps === '') ? null : Number(settings.imageSteps),
        imageGuidance: (settings.imageGuidance === undefined || settings.imageGuidance === null || settings.imageGuidance === '') ? null : Number(settings.imageGuidance),
        imageNegativePrompt: settings.imageNegativePrompt || null,
        aiProvider: chosenProvider,
        cliProxyBaseUrl: baseUrl || null,
        cliProxyApiKey: nextCliKey,
        cliProxyTextModel: settings.cliProxyTextModel || null,
        cliProxyCreativeModel: settings.cliProxyCreativeModel || null,
        cliProxyImageModel: settings.cliProxyImageModel || null,
        cliProxyCodexModel: settings.cliProxyCodexModel || null
      });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
