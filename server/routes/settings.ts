import type { Express } from "express";
import express from "express";
import { validateFacePhoto, MAX_VISUAL_SELF_REFERENCE_BYTES } from "../lib/visualSelfReference";
import type { ServerContext } from "../context";
import { AI_PERSONAS } from "../../src/lib/personas";
import { bossTarget } from "../lib/bossTargets";
import { normalizeVisualSelfMode, normalizeVisualSelfDescription } from "../../src/lib/visualSelf";

export function registerSettingsRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, queueBossVictoryArtwork } = ctx;

  app.get("/api/settings", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const row: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId);
      if (!row) return res.json({ userId });
      res.json({
        ...row,
        visualSelfInsertMode: normalizeVisualSelfMode(row.visualSelfInsertMode),
        visualSelfDescription: normalizeVisualSelfDescription(row.visualSelfDescription),
        hasVisualSelfReference: !!db.prepare("SELECT 1 FROM visual_self_references WHERE userId=?").get(userId),
        masterPageConfig: row.masterPageConfig ? JSON.parse(row.masterPageConfig) : undefined,
        yearlyGoals: row.yearlyGoals ? JSON.parse(row.yearlyGoals) : undefined,
        mediaDifficulty: row.mediaDifficulty ? JSON.parse(row.mediaDifficulty) : undefined,
        questOffsets: row.questOffsets ? JSON.parse(row.questOffsets) : undefined,
        questRerollsUsed: row.questRerollsUsed ? JSON.parse(row.questRerollsUsed) : undefined,
        questConfigs: row.questConfigs ? JSON.parse(row.questConfigs) : undefined,
        disableAutoDrop: row.disableAutoDrop === 1,
        pushEnabled: row.pushEnabled !== 0,
        pushTypes: row.pushTypes ? JSON.parse(row.pushTypes) : undefined,
        inactivityReminderDays: row.inactivityReminderDays ?? 7,
        bookMetadataProviders: row.bookMetadataProviders ? JSON.parse(row.bookMetadataProviders) : ["hardcover", "googleBooks"],
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // Reference photos are binary and explicitly managed apart from the JSON
  // settings form. They are never accessible via /uploads or other accounts.
  app.get("/api/settings/visual-reference", (req, res) => {
    const userId = getAuthUser(req, res);
    if (!userId) return;
    try {
      const row = db.prepare("SELECT image,mime FROM visual_self_references WHERE userId=?")
        .get(userId) as {image: Buffer; mime: string} | undefined;
      if (!row) return res.status(404).json({error: "No face reference uploaded."});
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.type(row.mime).send(row.image);
    } catch {
      return res.status(500).json({error: "Could not read face reference."});
    }
  });

  app.put("/api/settings/visual-reference",
    express.raw({type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_VISUAL_SELF_REFERENCE_BYTES}),
    (req, res) => {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      try {
        if (!Buffer.isBuffer(req.body)) return res.status(415).json({error: "Upload a JPEG, PNG or WebP image."});
        const {mime, width, height} = validateFacePhoto(req.body, req.get("Content-Type") || "");
        // Do not log photo bytes, include them in diagnostics, or let other users
        // fetch them. The database backup includes this intentionally private blob.
        db.prepare(`INSERT INTO visual_self_references(userId,image,mime,updatedAt) VALUES (?,?,?,?)
          ON CONFLICT(userId) DO UPDATE SET image=excluded.image,mime=excluded.mime,updatedAt=excluded.updatedAt`)
          .run(userId, req.body, mime, new Date().toISOString());
        res.setHeader("Cache-Control", "no-store");
        res.json({ok: true, width, height});
      } catch (e: any) {
        res.status(400).json({error: e?.message || "Invalid reference image."});
      }
    });

  app.delete("/api/settings/visual-reference", (req, res) => {
    const userId = getAuthUser(req, res);
    if (!userId) return;
    try {
      db.prepare("DELETE FROM visual_self_references WHERE userId=?").run(userId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ok: true});
    } catch {
      res.status(500).json({error: "Could not delete face reference."});
    }
  });

  app.post("/api/settings", (req, res) => {
    try {
      const settings = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;

      const userRec: any = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
      const isAdmin = userRec?.role === 'Admin';
      
      const oldSettings: any = db.prepare('SELECT aiPersona, enemyDifficulty, mediaDifficulty, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, nanoGptWebModel, nanoGptCreativeModel, nanoGptProvider, nanoGptSearchProvider, geminiApiKey, googleBooksApiKey, bookMetadataProviders, visualSelfInsertMode, visualSelfDescription FROM settings WHERE userId = ?').get(userId);
      const oldDifficulty = oldSettings?.enemyDifficulty ?? 1.0;
      const newDifficulty = settings.enemyDifficulty ?? 1.0;
      const oldMediaDifficulty = oldSettings?.mediaDifficulty || null;
      const newMediaDifficulty = settings.mediaDifficulty ? JSON.stringify(settings.mediaDifficulty) : null;
      
      db.prepare(`
        INSERT INTO settings (userId, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, nanoGptWebModel, nanoGptCreativeModel, nanoGptProvider, nanoGptSearchProvider, geminiApiKey, googleBooksApiKey, bookMetadataProviders, timezone, aiPersona, visualSelfInsertMode, visualSelfDescription, masterPageConfig, yearlyGoals, lastActiveDate, currentStreak, enemyDifficulty, mediaDifficulty, questOffsets, questRerollsUsed, questConfigs, disableAutoDrop, pushEnabled, pushTypes, inactivityReminderDays)
        VALUES (@userId, @igdbClientId, @igdbClientSecret, @tmdbApiKey, @hardcoverApiKey, @nanoGptApiKey, @nanoGptModel, @nanoGptWebModel, @nanoGptCreativeModel, @nanoGptProvider, @nanoGptSearchProvider, @geminiApiKey, @googleBooksApiKey, @bookMetadataProviders, @timezone, @aiPersona, @visualSelfInsertMode, @visualSelfDescription, @masterPageConfig, @yearlyGoals, @lastActiveDate, @currentStreak, @enemyDifficulty, @mediaDifficulty, @questOffsets, @questRerollsUsed, @questConfigs, @disableAutoDrop, @pushEnabled, @pushTypes, @inactivityReminderDays)
        ON CONFLICT(userId) DO UPDATE SET
          igdbClientId=excluded.igdbClientId,
          igdbClientSecret=excluded.igdbClientSecret,
          tmdbApiKey=excluded.tmdbApiKey,
          hardcoverApiKey=excluded.hardcoverApiKey,
          nanoGptApiKey=excluded.nanoGptApiKey,
          nanoGptModel=excluded.nanoGptModel,
          nanoGptWebModel=excluded.nanoGptWebModel,
          nanoGptCreativeModel=excluded.nanoGptCreativeModel,
          nanoGptProvider=excluded.nanoGptProvider,
          nanoGptSearchProvider=excluded.nanoGptSearchProvider,
          geminiApiKey=excluded.geminiApiKey,
          googleBooksApiKey=excluded.googleBooksApiKey,
          bookMetadataProviders=excluded.bookMetadataProviders,
          timezone=excluded.timezone,
          aiPersona=excluded.aiPersona,
          visualSelfInsertMode=excluded.visualSelfInsertMode,
          visualSelfDescription=excluded.visualSelfDescription,
          masterPageConfig=excluded.masterPageConfig,
          yearlyGoals=excluded.yearlyGoals,
          lastActiveDate=excluded.lastActiveDate,
          currentStreak=excluded.currentStreak,
          enemyDifficulty=excluded.enemyDifficulty,
          mediaDifficulty=excluded.mediaDifficulty,
          questOffsets=excluded.questOffsets,
          questRerollsUsed=excluded.questRerollsUsed,
          questConfigs=excluded.questConfigs,
          disableAutoDrop=excluded.disableAutoDrop,
          pushEnabled=excluded.pushEnabled,
          pushTypes=excluded.pushTypes,
          inactivityReminderDays=excluded.inactivityReminderDays
      `).run({
        userId: userId,
        igdbClientId: isAdmin ? (settings.igdbClientId || null) : (oldSettings?.igdbClientId || null),
        igdbClientSecret: isAdmin ? (settings.igdbClientSecret || null) : (oldSettings?.igdbClientSecret || null),
        tmdbApiKey: isAdmin ? (settings.tmdbApiKey || null) : (oldSettings?.tmdbApiKey || null),
        hardcoverApiKey: isAdmin ? (settings.hardcoverApiKey || null) : (oldSettings?.hardcoverApiKey || null),
        nanoGptApiKey: isAdmin ? (settings.nanoGptApiKey || null) : (oldSettings?.nanoGptApiKey || null),
        nanoGptModel: isAdmin ? (settings.nanoGptModel || null) : (oldSettings?.nanoGptModel || null),
        nanoGptWebModel: isAdmin ? (settings.nanoGptWebModel || null) : (oldSettings?.nanoGptWebModel || null),
        nanoGptCreativeModel: isAdmin ? (settings.nanoGptCreativeModel || null) : (oldSettings?.nanoGptCreativeModel || null),
        // Same rule as the model fields: a non-admin cannot change where their
        // requests are routed, they inherit whatever is already stored.
        nanoGptProvider: isAdmin ? (settings.nanoGptProvider || null) : (oldSettings?.nanoGptProvider || null),
        nanoGptSearchProvider: isAdmin ? (settings.nanoGptSearchProvider || null) : (oldSettings?.nanoGptSearchProvider || null),
        geminiApiKey: isAdmin ? (settings.geminiApiKey || null) : (oldSettings?.geminiApiKey || null),
        googleBooksApiKey: isAdmin ? (settings.googleBooksApiKey || null) : (oldSettings?.googleBooksApiKey || null),
        bookMetadataProviders: Array.isArray(settings.bookMetadataProviders)
          ? JSON.stringify([...new Set(settings.bookMetadataProviders.filter((p: unknown) => p === "hardcover" || p === "googleBooks"))])
          : (oldSettings?.bookMetadataProviders || JSON.stringify(["hardcover", "googleBooks"])),
        timezone: settings.timezone || null,
        // Keep what is stored unless a recognised persona arrives. This is an
        // upsert of the whole row, so a caller that saves settings without
        // mentioning the persona — the quest re-roll does exactly that — would
        // otherwise wipe it, which looks identical to "it never saved".
        // An unrecognised id is refused for the same reason: it would fall back
        // at read time and appear not to have saved.
        aiPersona: AI_PERSONAS.some((p) => p.id === settings.aiPersona)
          ? settings.aiPersona
          : (oldSettings?.aiPersona || null),
        // A partial settings POST must not inadvertently erase the private
        // likeness profile. Explicit "" is still allowed to clear it.
        visualSelfInsertMode: settings.visualSelfInsertMode === undefined
          ? normalizeVisualSelfMode(oldSettings?.visualSelfInsertMode)
          : normalizeVisualSelfMode(settings.visualSelfInsertMode),
        visualSelfDescription: settings.visualSelfDescription === undefined
          ? normalizeVisualSelfDescription(oldSettings?.visualSelfDescription)
          : normalizeVisualSelfDescription(settings.visualSelfDescription),
        masterPageConfig: settings.masterPageConfig ? JSON.stringify(settings.masterPageConfig) : null,
        yearlyGoals: settings.yearlyGoals ? JSON.stringify(settings.yearlyGoals) : null,
        lastActiveDate: settings.lastActiveDate || null,
        currentStreak: settings.currentStreak || 0,
        enemyDifficulty: newDifficulty,
        mediaDifficulty: newMediaDifficulty,
        questOffsets: settings.questOffsets ? JSON.stringify(settings.questOffsets) : null,
        questRerollsUsed: settings.questRerollsUsed ? JSON.stringify(settings.questRerollsUsed) : null,
        questConfigs: settings.questConfigs ? JSON.stringify(settings.questConfigs) : null,
        disableAutoDrop: settings.disableAutoDrop ? 1 : 0,
        pushEnabled: settings.pushEnabled === false ? 0 : 1,
        pushTypes: settings.pushTypes ? JSON.stringify(settings.pushTypes) : null,
        // Clamped rather than trusted: a negative period would make every sweep
        // think the user has been away forever.
        inactivityReminderDays: Math.max(0, Math.min(365, Number(settings.inactivityReminderDays ?? 7) || 0))
      });

      // Update active bosses if difficulty changed
      if (oldDifficulty !== newDifficulty || oldMediaDifficulty !== newMediaDifficulty) {
        const activeBosses = db.prepare(`
          SELECT wb.id, wb.level, wb.currentProgress, wb.enraged, m.mediaType
          FROM world_bosses wb
          JOIN media m ON wb.mediaId = m.id
          WHERE wb.userId = ? AND wb.status = 'Active'
        `).all(userId) as any[];

        for (const boss of activeBosses) {
          let mDiff = 1.0;
          if (settings.mediaDifficulty && settings.mediaDifficulty[boss.mediaType] !== undefined) {
             mDiff = settings.mediaDifficulty[boss.mediaType];
          }

          const newTarget = bossTarget(boss.mediaType, boss.level, newDifficulty * mDiff, !!boss.enraged);
          
          // Check if the boss is now defeated by this change
          const newStatus = boss.currentProgress >= newTarget ? 'Defeated' : 'Active';
          db.prepare("UPDATE world_bosses SET targetProgress = ?, status = ?, updatedAt = ? WHERE id = ?").run(newTarget, newStatus, new Date().toISOString(), boss.id);
          if (newStatus === 'Defeated') queueBossVictoryArtwork(userId as string, boss.id);
        }
      }
      
      const saved: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId);
      res.json({
        ...saved,
        visualSelfInsertMode: normalizeVisualSelfMode(saved.visualSelfInsertMode),
        visualSelfDescription: normalizeVisualSelfDescription(saved.visualSelfDescription),
        masterPageConfig: saved.masterPageConfig ? JSON.parse(saved.masterPageConfig) : undefined,
        yearlyGoals: saved.yearlyGoals ? JSON.parse(saved.yearlyGoals) : undefined,
        mediaDifficulty: saved.mediaDifficulty ? JSON.parse(saved.mediaDifficulty) : undefined,
        questOffsets: saved.questOffsets ? JSON.parse(saved.questOffsets) : undefined,
        questRerollsUsed: saved.questRerollsUsed ? JSON.parse(saved.questRerollsUsed) : undefined
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
