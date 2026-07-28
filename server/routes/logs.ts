import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerLogRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, activity, autoTag } = ctx;

  app.get("/api/logs", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db.prepare('SELECT * FROM logs WHERE userId = ? ORDER BY timestamp DESC').all(userId);
      res.json(rows.map((r: any) => ({
        ...r,
        isHistoric: r.isHistoric === 1
      })));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // Merge/rename locations: repoint every log carrying one of `from` to the single `to`
  // name. This powers the Atlas "merge locations" tool (a single-item `from` is a rename).
  app.post("/api/logs/merge-locations", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const { from, to } = req.body || {};
      const target = typeof to === "string" ? to.trim() : "";
      const sources: string[] = Array.isArray(from)
        ? from.map((s: any) => (typeof s === "string" ? s.trim() : "")).filter(Boolean)
        : [];
      if (!target || sources.length === 0) {
        return res.status(400).json({ error: "Provide `from` (non-empty array) and a non-empty `to`." });
      }
      const placeholders = sources.map(() => "?").join(", ");
      const result = db
        .prepare(`UPDATE logs SET location = ? WHERE userId = ? AND location IN (${placeholders})`)
        .run(target, userId, ...sources);

      // Group membership is keyed by the location string, so a merge has to bring
      // it along or the merged name silently drops out of every group its parts
      // were in. INSERT OR IGNORE first, because several sources in one group
      // would otherwise collide on the primary key.
      try {
        const groups = db
          .prepare(`SELECT DISTINCT groupId FROM location_group_members WHERE userId = ? AND location IN (${placeholders})`)
          .all(userId, ...sources) as { groupId: string }[];
        const adopt = db.prepare("INSERT OR IGNORE INTO location_group_members (groupId, userId, location) VALUES (?,?,?)");
        const drop = db.prepare(`DELETE FROM location_group_members WHERE userId = ? AND location IN (${placeholders}) AND location != ?`);
        const tx = db.transaction(() => {
          groups.forEach((g) => adopt.run(g.groupId, userId, target));
          drop.run(userId, ...sources, target);
        });
        tx();
      } catch (e) { console.error("Could not carry location groups through a merge", e); }

      res.json({ success: true, updated: result.changes, to: target });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });



  app.post("/api/logs", (req, res) => {
    try {
      const log = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // Read before the insert: this log is what thaws the account, so the state
      // afterwards would always say "active" and the transition would be invisible.
      const wasFrozen = activity.isFrozen(userId as string);
      db.prepare(`
        INSERT INTO logs (id, userId, mediaId, timestamp, metricType, delta, note, location, isHistoric, createdAt)
        VALUES (@id, @userId, @mediaId, @timestamp, @metricType, @delta, @note, @location, @isHistoric, @createdAt)
      `).run({
        id: log.id,
        userId: userId,
        mediaId: log.mediaId,
        timestamp: log.timestamp,
        metricType: log.metricType,
        delta: log.delta,
        note: log.note || null,
        location: log.location || null,
        isHistoric: log.isHistoric ? 1 : 0,
        // When the entry was written, as opposed to the moment it records.
        // Backfilling old sessions is still using the app, and this is what the
        // inactivity freeze measures.
        createdAt: new Date().toISOString()
      });

      // Coming back thaws the account: anything parked while it was dormant runs
      // now. Auto-tagging is the only deferred work — enemies wait for Monday's
      // spawn, and recaps are written on demand.
      if (wasFrozen) {
        try {
          const parked = db
            .prepare("SELECT id FROM media WHERE userId = ? AND autoTagStatus = 'deferred'")
            .all(userId) as { id: string }[];
          if (parked.length) {
            console.log(`[activity] ${userId} is back; tagging ${parked.length} entry(s) added while dormant`);
            parked.forEach((m) => autoTag.queueAutoTag(userId as string, m.id));
          }
        } catch (e) { console.error("Deferred auto-tag on thaw failed", e); }
      }

      // Update Streak Mode
      try {
        const todayStr = new Date(log.timestamp).toISOString().split('T')[0];
        const settingsRow: any = db.prepare('SELECT lastActiveDate, currentStreak FROM settings WHERE userId = ?').get(userId);
        
        let newStreak = settingsRow?.currentStreak || 0;
        let lastActiveDate = settingsRow?.lastActiveDate || "";

        if (lastActiveDate !== todayStr) {
          const yesterday = new Date(log.timestamp);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          if (lastActiveDate === yesterdayStr) {
            newStreak += 1;
          } else {
            newStreak = 1; // start a new streak if gap > 1 day
          }
          
          db.prepare(`
            INSERT INTO settings (userId, lastActiveDate, currentStreak) 
            VALUES (?, ?, ?) 
            ON CONFLICT(userId) DO UPDATE SET lastActiveDate=excluded.lastActiveDate, currentStreak=excluded.currentStreak
          `).run(userId, todayStr, newStreak);
        }
      } catch(e) {}

      // Skip clearing AI recaps automatically as it causes unexpected regenerations.
      // Users can refresh manually if needed.
      
      const mediaRow = db.prepare('SELECT * FROM media WHERE id = ? AND userId = ?').get(log.mediaId, userId) as any;
      if (mediaRow) {
        const type = log.metricType;
        const now = new Date().toISOString();
        
        let newStatus = log.status !== undefined ? log.status : mediaRow.status;
        if (newStatus === 'Planning' && log.delta > 0) {
           newStatus = 'Active';
        }
        
        if (newStatus !== mediaRow.status && mediaRow.status !== undefined) {
           db.prepare(`
             INSERT INTO logs (id, userId, mediaId, timestamp, metricType, delta, note, location, isHistoric)
             VALUES (@id, @userId, @mediaId, @timestamp, 'statusChange', 0, @note, null, @isHistoric)
           `).run({
             id: crypto.randomUUID(),
             userId: userId,
             mediaId: log.mediaId,
             timestamp: log.timestamp,
             note: `Status changed from ${mediaRow.status} to ${newStatus}`,
             isHistoric: log.isHistoric ? 1 : 0
           });
        }

        let newUserRating = log.userRating !== undefined ? log.userRating : (mediaRow.userRating !== undefined ? mediaRow.userRating : null);
        let newUserReview = log.userReview !== undefined ? log.userReview : (mediaRow.userReview !== undefined ? mediaRow.userReview : null);
        let newWatched = log.watched !== undefined ? (log.watched ? 1 : 0) : (mediaRow.watched !== undefined ? mediaRow.watched : null);
        
        if (['playtimeHours', 'pagesRead', 'chaptersRead', 'episodesWatched', 'watchCount', 'issuesRead'].includes(type)) {
          if (log.isHistoric) {
            db.prepare(`UPDATE media SET ${type} = IFNULL(${type}, 0) + ?, status = ?, userRating = ?, userReview = ?, watched = ? WHERE id = ? AND userId = ?`).run(log.delta, newStatus, newUserRating, newUserReview, newWatched, log.mediaId, userId);
          } else {
            db.prepare(`UPDATE media SET ${type} = IFNULL(${type}, 0) + ?, updatedAt = ?, status = ?, userRating = ?, userReview = ?, watched = ? WHERE id = ? AND userId = ?`).run(log.delta, now, newStatus, newUserRating, newUserReview, newWatched, log.mediaId, userId);
          }
        } else {
          if (log.isHistoric) {
            db.prepare(`UPDATE media SET status = ?, userRating = ?, userReview = ?, watched = ? WHERE id = ? AND userId = ?`).run(newStatus, newUserRating, newUserReview, newWatched, log.mediaId, userId);
          } else {
            db.prepare(`UPDATE media SET updatedAt = ?, status = ?, userRating = ?, userReview = ?, watched = ? WHERE id = ? AND userId = ?`).run(now, newStatus, newUserRating, newUserReview, newWatched, log.mediaId, userId);
          }
        }
      }
      // Durability Loss & Boss Progress
      if (mediaRow) {
        try {
          const settingsRow: any = db.prepare('SELECT masterPageConfig FROM settings WHERE userId = ?').get(userId);
          const mpConfig = settingsRow?.masterPageConfig ? JSON.parse(settingsRow.masterPageConfig) : {};
          
          let scaledPages = log.delta;
          if (log.metricType === 'playtimeHours') {
            scaledPages = log.delta * (mediaRow.mediaType === 'Visual Novel' ? (mpConfig.vnPagesPerHour || 24) : (mpConfig.gamePagesPerHour || 12));
          } else if (log.metricType === 'chaptersRead') {
            scaledPages = log.delta * (mpConfig.mangaPagesPerChapter || 5);
          } else if (log.metricType === 'episodesWatched') {
            scaledPages = log.delta * (mpConfig.episodesWatchedMultiplier || 30);
          } else if (log.metricType === 'watchCount') {
            scaledPages = log.delta * (mpConfig.moviePagesPerMovie || 100);
          } else if (log.metricType === 'issuesRead') {
            scaledPages = log.delta * (mpConfig.comicPagesPerIssue || 20);
          }

          // 1. Wear out equipment (Equipped items lose durability based on progress)
          const equippedItems: any[] = db.prepare("SELECT id, durability, maxDurability, bonusPercent, targetType, targetValue FROM artifacts WHERE userId = ? AND isEquipped = 1 AND durability > 0").all(userId);
          if (equippedItems.length > 0) {
            let parsedGenres: string[] = [];
            let parsedFranchises: string[] = [];
            try { parsedGenres = mediaRow.genres ? (typeof mediaRow.genres === 'string' ? JSON.parse(mediaRow.genres) : mediaRow.genres) : []; } catch(e) {}
            try { parsedFranchises = mediaRow.franchises ? (typeof mediaRow.franchises === 'string' ? JSON.parse(mediaRow.franchises) : mediaRow.franchises) : []; } catch(e) {}
            const mediaTitleLC = mediaRow.title ? mediaRow.title.toLowerCase() : '';

            const applicableItems = equippedItems.filter(a => {
              if (a.targetType === 'Genre' && parsedGenres.includes(a.targetValue)) return true;
              else if (a.targetType === 'MediaType' && mediaRow.mediaType === a.targetValue) return true;
              else if (a.targetType === 'Franchise') {
                if (parsedFranchises.includes(a.targetValue) || mediaTitleLC.includes(a.targetValue?.toLowerCase() || '')) return true;
                return false;
              } else if (!a.targetType || a.targetType === null) {
                return true; // Backward compatibility / generic base items
              }
              return false;
            });

            if (applicableItems.length > 0) {
              // Bank the Armory bonus onto THIS log using the durability the items have right now
              // (before wearing them down). This locks the bonus to the log that used the item, so
              // it never applies retroactively to the rest of the history.
              let bonusMultiplier = 0;
              for (const item of applicableItems) {
                const durabilityRatio = (item.durability ?? 100) / (item.maxDurability || 100);
                const bonusPct = (item.bonusPercent ?? 20) / 100;
                bonusMultiplier += bonusPct * durabilityRatio;
              }
              db.prepare("UPDATE logs SET bonusMultiplier = ? WHERE id = ?").run(bonusMultiplier, log.id);

              // Back-to-back logging of the SAME media within 6 hours counts as one continuous
              // session: the item still buffs each log, but it only spends durability once (on the
              // first log of the session). This lets you log while watching without extra wear.
              // We only need to look at the immediately preceding progress log — if it's the same
              // media and no more than 6 hours old, this is a continuation. If any other media was
              // logged in between, that log becomes the most recent one and this no longer qualifies.
              const prevLog: any = db.prepare(
                "SELECT mediaId, timestamp FROM logs WHERE userId = ? AND id != ? AND metricType != 'statusChange' AND timestamp <= ? ORDER BY timestamp DESC LIMIT 1"
              ).get(userId, log.id, log.timestamp);

              let isContinuation = false;
              if (prevLog && prevLog.mediaId === log.mediaId) {
                const gapMs = new Date(log.timestamp).getTime() - new Date(prevLog.timestamp).getTime();
                if (gapMs >= 0 && gapMs <= 6 * 60 * 60 * 1000) isContinuation = true;
              }

              if (!isContinuation) {
                // Wear the item down and auto-unequip it the moment it breaks (hits 0 durability).
                const updateDurability = db.prepare(
                  "UPDATE artifacts SET isEquipped = CASE WHEN durability - ? <= 0 THEN 0 ELSE isEquipped END, durability = MAX(0, durability - ?) WHERE id = ?"
                );
                for (const item of applicableItems) {
                   updateDurability.run(1, 1, item.id);
                }
              }
            }
          }

          // 2. Boss Progress
          const boss: any = db.prepare("SELECT * FROM world_bosses WHERE userId = ? AND mediaId = ? AND status = 'Active'").get(userId, log.mediaId);
          if (boss) {
            const updatedMedia = db.prepare("SELECT status FROM media WHERE id = ?").get(log.mediaId) as any;
            const isCompleted = updatedMedia && updatedMedia.status === 'Completed';

            // Use native log delta instead of scaledPages for media-specific boss goals
            const newProgress = boss.currentProgress + log.delta;
            if (newProgress >= boss.targetProgress || isCompleted) {
              const finalProgress = isCompleted ? Math.max(newProgress, boss.targetProgress) : newProgress;
              db.prepare("UPDATE world_bosses SET currentProgress = ?, status = 'Defeated', updatedAt = ? WHERE id = ?").run(finalProgress, new Date().toISOString(), boss.id);
            } else {
              db.prepare("UPDATE world_bosses SET currentProgress = ?, updatedAt = ? WHERE id = ?").run(newProgress, new Date().toISOString(), boss.id);
            }
          }
        } catch(e) { console.error("Durability/Boss update failed", e); }
      }

      res.json(db.prepare('SELECT * FROM logs WHERE id = ?').get(log.id));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.put("/api/logs/:id", (req, res) => {
    try {
      const logId = req.params.id;
      const updates = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;

      const existingLog = db.prepare('SELECT * FROM logs WHERE id = ? AND userId = ?').get(logId, userId) as any;
      if (!existingLog) return res.status(404).json({ error: 'Log not found or unauthorized' });

      const newTimestamp = updates.timestamp !== undefined ? updates.timestamp : existingLog.timestamp;
      const newNote = updates.note !== undefined ? updates.note : existingLog.note;
      const newDelta = updates.delta !== undefined ? updates.delta : existingLog.delta;
      const newLocation = updates.location !== undefined ? updates.location : existingLog.location;
      
      const deltaDiff = newDelta - existingLog.delta;

      db.prepare(`
        UPDATE logs SET timestamp = ?, delta = ?, note = ?, location = ?
        WHERE id = ? AND userId = ?
      `).run(newTimestamp, newDelta, newNote, newLocation, logId, userId);

      // Skip clearing AI recaps automatically

      // Update media item total logic
      if (deltaDiff !== 0) {
        const mediaRow = db.prepare('SELECT * FROM media WHERE id = ? AND userId = ?').get(existingLog.mediaId, userId) as any;
        if (mediaRow) {
          const type = existingLog.metricType;
          const now = new Date().toISOString();
          if (['playtimeHours', 'pagesRead', 'chaptersRead', 'episodesWatched', 'watchCount', 'issuesRead'].includes(type)) {
            db.prepare(`UPDATE media SET ${type} = IFNULL(${type}, 0) + ?, updatedAt = ? WHERE id = ? AND userId = ?`).run(deltaDiff, now, existingLog.mediaId, userId);
          }
        }
      }

      res.json(db.prepare('SELECT * FROM logs WHERE id = ?').get(logId));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.delete("/api/logs/:id", (req, res) => {
    try {
      const logId = req.params.id;
      const userId = getAuthUser(req, res);
      if (!userId) return;

      const existingLog = db.prepare('SELECT * FROM logs WHERE id = ? AND userId = ?').get(logId, userId) as any;
      if (!existingLog) return res.status(404).json({ error: 'Log not found or unauthorized' });

      db.prepare('DELETE FROM logs WHERE id = ? AND userId = ?').run(logId, userId);

      // Skip clearing AI recaps automatically

      // Revert media item metrics
      const mediaRow = db.prepare('SELECT * FROM media WHERE id = ? AND userId = ?').get(existingLog.mediaId, userId) as any;
      if (mediaRow) {
        const type = existingLog.metricType;
        const now = new Date().toISOString();
        if (['playtimeHours', 'pagesRead', 'chaptersRead', 'episodesWatched', 'watchCount', 'issuesRead'].includes(type)) {
          // Subtracting the delta, ensuring it doesn't drop below 0
          db.prepare(`UPDATE media SET ${type} = MAX(0, IFNULL(${type}, 0) - ?), updatedAt = ? WHERE id = ? AND userId = ?`).run(existingLog.delta, now, existingLog.mediaId, userId);
        }
      }

      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
