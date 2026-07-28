import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerSettingsRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;

  app.get("/api/settings", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const row: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId);
      if (!row) return res.json({ userId });
      res.json({
        ...row,
        masterPageConfig: row.masterPageConfig ? JSON.parse(row.masterPageConfig) : undefined,
        yearlyGoals: row.yearlyGoals ? JSON.parse(row.yearlyGoals) : undefined,
        mediaDifficulty: row.mediaDifficulty ? JSON.parse(row.mediaDifficulty) : undefined,
        questOffsets: row.questOffsets ? JSON.parse(row.questOffsets) : undefined,
        questRerollsUsed: row.questRerollsUsed ? JSON.parse(row.questRerollsUsed) : undefined,
        questConfigs: row.questConfigs ? JSON.parse(row.questConfigs) : undefined,
        disableAutoDrop: row.disableAutoDrop === 1
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/settings", (req, res) => {
    try {
      const settings = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;

      const userRec: any = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
      const isAdmin = userRec?.role === 'Admin';
      
      const oldSettings: any = db.prepare('SELECT enemyDifficulty, mediaDifficulty, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, nanoGptWebModel, geminiApiKey, googleBooksApiKey FROM settings WHERE userId = ?').get(userId);
      const oldDifficulty = oldSettings?.enemyDifficulty ?? 1.0;
      const newDifficulty = settings.enemyDifficulty ?? 1.0;
      const oldMediaDifficulty = oldSettings?.mediaDifficulty || null;
      const newMediaDifficulty = settings.mediaDifficulty ? JSON.stringify(settings.mediaDifficulty) : null;
      
      db.prepare(`
        INSERT INTO settings (userId, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, nanoGptWebModel, geminiApiKey, googleBooksApiKey, timezone, masterPageConfig, yearlyGoals, lastActiveDate, currentStreak, enemyDifficulty, mediaDifficulty, questOffsets, questRerollsUsed, questConfigs, disableAutoDrop)
        VALUES (@userId, @igdbClientId, @igdbClientSecret, @tmdbApiKey, @hardcoverApiKey, @nanoGptApiKey, @nanoGptModel, @nanoGptWebModel, @geminiApiKey, @googleBooksApiKey, @timezone, @masterPageConfig, @yearlyGoals, @lastActiveDate, @currentStreak, @enemyDifficulty, @mediaDifficulty, @questOffsets, @questRerollsUsed, @questConfigs, @disableAutoDrop)
        ON CONFLICT(userId) DO UPDATE SET
          igdbClientId=excluded.igdbClientId,
          igdbClientSecret=excluded.igdbClientSecret,
          tmdbApiKey=excluded.tmdbApiKey,
          hardcoverApiKey=excluded.hardcoverApiKey,
          nanoGptApiKey=excluded.nanoGptApiKey,
          nanoGptModel=excluded.nanoGptModel,
          nanoGptWebModel=excluded.nanoGptWebModel,
          geminiApiKey=excluded.geminiApiKey,
          googleBooksApiKey=excluded.googleBooksApiKey,
          timezone=excluded.timezone,
          masterPageConfig=excluded.masterPageConfig,
          yearlyGoals=excluded.yearlyGoals,
          lastActiveDate=excluded.lastActiveDate,
          currentStreak=excluded.currentStreak,
          enemyDifficulty=excluded.enemyDifficulty,
          mediaDifficulty=excluded.mediaDifficulty,
          questOffsets=excluded.questOffsets,
          questRerollsUsed=excluded.questRerollsUsed,
          questConfigs=excluded.questConfigs,
          disableAutoDrop=excluded.disableAutoDrop
      `).run({
        userId: userId,
        igdbClientId: isAdmin ? (settings.igdbClientId || null) : (oldSettings?.igdbClientId || null),
        igdbClientSecret: isAdmin ? (settings.igdbClientSecret || null) : (oldSettings?.igdbClientSecret || null),
        tmdbApiKey: isAdmin ? (settings.tmdbApiKey || null) : (oldSettings?.tmdbApiKey || null),
        hardcoverApiKey: isAdmin ? (settings.hardcoverApiKey || null) : (oldSettings?.hardcoverApiKey || null),
        nanoGptApiKey: isAdmin ? (settings.nanoGptApiKey || null) : (oldSettings?.nanoGptApiKey || null),
        nanoGptModel: isAdmin ? (settings.nanoGptModel || null) : (oldSettings?.nanoGptModel || null),
        nanoGptWebModel: isAdmin ? (settings.nanoGptWebModel || null) : (oldSettings?.nanoGptWebModel || null),
        geminiApiKey: isAdmin ? (settings.geminiApiKey || null) : (oldSettings?.geminiApiKey || null),
        googleBooksApiKey: isAdmin ? (settings.googleBooksApiKey || null) : (oldSettings?.googleBooksApiKey || null),
        timezone: settings.timezone || null,
        masterPageConfig: settings.masterPageConfig ? JSON.stringify(settings.masterPageConfig) : null,
        yearlyGoals: settings.yearlyGoals ? JSON.stringify(settings.yearlyGoals) : null,
        lastActiveDate: settings.lastActiveDate || null,
        currentStreak: settings.currentStreak || 0,
        enemyDifficulty: newDifficulty,
        mediaDifficulty: newMediaDifficulty,
        questOffsets: settings.questOffsets ? JSON.stringify(settings.questOffsets) : null,
        questRerollsUsed: settings.questRerollsUsed ? JSON.stringify(settings.questRerollsUsed) : null,
        questConfigs: settings.questConfigs ? JSON.stringify(settings.questConfigs) : null,
        disableAutoDrop: settings.disableAutoDrop ? 1 : 0
      });

      // Update active bosses if difficulty changed
      if (oldDifficulty !== newDifficulty || oldMediaDifficulty !== newMediaDifficulty) {
        const activeBosses = db.prepare(`
          SELECT wb.id, wb.level, wb.currentProgress, m.mediaType 
          FROM world_bosses wb
          JOIN media m ON wb.mediaId = m.id
          WHERE wb.userId = ? AND wb.status = 'Active'
        `).all(userId) as any[];

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

        for (const boss of activeBosses) {
          let mDiff = 1.0;
          if (settings.mediaDifficulty && settings.mediaDifficulty[boss.mediaType] !== undefined) {
             mDiff = settings.mediaDifficulty[boss.mediaType];
          }

          const baseTarget = getBaseTarget(boss.mediaType, boss.level);
          const newTarget = Math.max(0.1, baseTarget * newDifficulty * mDiff);
          
          // Check if the boss is now defeated by this change
          const newStatus = boss.currentProgress >= newTarget ? 'Defeated' : 'Active';
          db.prepare("UPDATE world_bosses SET targetProgress = ?, status = ?, updatedAt = ? WHERE id = ?").run(newTarget, newStatus, new Date().toISOString(), boss.id);
        }
      }
      
      const saved: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId);
      res.json({
        ...saved,
        masterPageConfig: saved.masterPageConfig ? JSON.parse(saved.masterPageConfig) : undefined,
        yearlyGoals: saved.yearlyGoals ? JSON.parse(saved.yearlyGoals) : undefined,
        mediaDifficulty: saved.mediaDifficulty ? JSON.parse(saved.mediaDifficulty) : undefined,
        questOffsets: saved.questOffsets ? JSON.parse(saved.questOffsets) : undefined,
        questRerollsUsed: saved.questRerollsUsed ? JSON.parse(saved.questRerollsUsed) : undefined
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
