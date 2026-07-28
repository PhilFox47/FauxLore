import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerMediaRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, normalizeMedia, safeJsonParse, syncOngoingMediaInBackground, autoTag, activity } = ctx;

  app.get("/api/public/covers", (req, res) => {
    try {
      // The login page tiles these behind the form. A 4K display needs a few
      // hundred to fill without repeating, so send plenty and let the client
      // take what it can actually show.
      const rows = db.prepare('SELECT DISTINCT coverImageUrl FROM media WHERE coverImageUrl IS NOT NULL AND coverImageUrl != \'\' ORDER BY RANDOM() LIMIT 400').all() as {coverImageUrl: string}[];
      res.json(rows.map(r => r.coverImageUrl));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  /**
   * Re-tags one entry on demand. Awaited, because this is the Edit view's
   * "Auto Tag" button and the user is watching it.
   */
  app.post("/api/media/:id/auto-tag", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // Dormant accounts cost nothing: this call spends tokens.
      if (!activity.requireActive(userId as string, res)) return;
      const media = db.prepare('SELECT id FROM media WHERE id = ? AND userId = ?').get(req.params.id, userId);
      if (!media) return res.status(404).json({ error: 'Media not found' });

      const result = await autoTag.autoTagMedia(userId as string, req.params.id);
      if (!result) {
        return res.status(502).json({ error: 'Auto-tagging failed. Check that a Nano-GPT key is configured.' });
      }
      const saved = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
      res.json({ ...result, media: normalizeMedia(saved) });
    } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
  });

  app.get("/api/media", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // Fire and forget sync
      syncOngoingMediaInBackground(userId as string);
      
      const rows = db.prepare('SELECT * FROM media WHERE userId = ? ORDER BY updatedAt DESC').all(userId);
      res.json(rows.map(normalizeMedia));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/media/:id", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const row = db.prepare('SELECT * FROM media WHERE id = ? AND userId = ?').get(req.params.id, userId);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(normalizeMedia(row));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/media", (req, res) => {
    try {
      const item = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;

      // Whether this is a brand-new entry decides if tagging gets queued below;
      // it has to be read before the upsert makes the row exist either way.
      const existing = db.prepare('SELECT id FROM media WHERE id = ? AND userId = ?').get(item.id, userId) as any;
      const isNewEntry = !existing;

      // Handle Taxonomy Usage Counts
      try {
        const oldItem = db.prepare('SELECT genres, tags FROM media WHERE id = ? AND userId = ?').get(item.id, userId) as any;
        const oldGenres = oldItem ? safeJsonParse(oldItem.genres) : [];
        const oldTags = oldItem ? safeJsonParse(oldItem.tags) : [];
        
        const newGenres = item.genres || [];
        const newTags = item.tags || [];

        const updateCount = db.prepare('UPDATE global_taxonomy SET usageCount = usageCount + ? WHERE name = ? AND type = ?');

        // Decrement old
        oldGenres.forEach((g: string) => updateCount.run(-1, g, 'genre'));
        oldTags.forEach((t: string) => updateCount.run(-1, t, 'tag'));
        // Increment new
        newGenres.forEach((g: string) => updateCount.run(1, g, 'genre'));
        newTags.forEach((t: string) => updateCount.run(1, t, 'tag'));
      } catch (e) {
        console.error("Failed to update taxonomy counts", e);
      }

      const stmt = db.prepare(`
        INSERT INTO media (
          id, userId, title, mediaType, coverImageUrl, description, creator, publisher, year, 
          reviewScore, averagePlaytime, hltbMain, hltbMainExtra, hltbCompletionist, selectedHltbType,
          status, userRating, userReview, dropReason, genres, tags, tropes, platforms, franchises,
          playtimeHours, pagesRead, totalPages, chaptersRead, totalChapters,
          season, episodesWatched, totalEpisodes, watched, watchCount, runtimeMinutes,
          issuesRead, totalIssues, isReRun, originalMediaId, expectedReleaseDate, language, isOngoing, noEnemies, isHighPriority, noAutoDrop, storyHeavyModifier, route, releaseStatus, lastSyncAt, createdAt, updatedAt,
          subtitle, maturityRating,
          metadataSource, metadataSourceId, sourceUrl, sourceVersion, installedVersion, sourceVersions, sourceUpdatedAt, updateAvailable, updateSeenAt
        ) VALUES (
          @id, @userId, @title, @mediaType, @coverImageUrl, @description, @creator, @publisher, @year, 
          @reviewScore, @averagePlaytime, @hltbMain, @hltbMainExtra, @hltbCompletionist, @selectedHltbType,
          @status, @userRating, @userReview, @dropReason, @genres, @tags, @tropes, @platforms, @franchises,
          @playtimeHours, @pagesRead, @totalPages, @chaptersRead, @totalChapters,
          @season, @episodesWatched, @totalEpisodes, @watched, @watchCount, @runtimeMinutes,
          @issuesRead, @totalIssues, @isReRun, @originalMediaId, @expectedReleaseDate, @language, @isOngoing, @noEnemies, @isHighPriority, @noAutoDrop, @storyHeavyModifier, @route, @releaseStatus, @lastSyncAt, @createdAt, @updatedAt,
          @subtitle, @maturityRating,
          @metadataSource, @metadataSourceId, @sourceUrl, @sourceVersion, @installedVersion, @sourceVersions, @sourceUpdatedAt, @updateAvailable, @updateSeenAt
        )
        ON CONFLICT(id) DO UPDATE SET
          userId=excluded.userId, title=excluded.title, mediaType=excluded.mediaType, coverImageUrl=excluded.coverImageUrl,
          description=excluded.description, creator=excluded.creator, publisher=excluded.publisher,
          year=excluded.year, reviewScore=excluded.reviewScore, averagePlaytime=excluded.averagePlaytime,
          hltbMain=excluded.hltbMain, hltbMainExtra=excluded.hltbMainExtra, hltbCompletionist=excluded.hltbCompletionist,
          selectedHltbType=excluded.selectedHltbType,
          status=excluded.status, userRating=excluded.userRating, userReview=excluded.userReview, dropReason=excluded.dropReason, genres=excluded.genres,
          tags=excluded.tags, tropes=excluded.tropes, platforms=excluded.platforms, franchises=excluded.franchises, playtimeHours=excluded.playtimeHours,
          pagesRead=excluded.pagesRead, totalPages=excluded.totalPages, chaptersRead=excluded.chaptersRead,
          totalChapters=excluded.totalChapters, season=excluded.season, episodesWatched=excluded.episodesWatched,
          totalEpisodes=excluded.totalEpisodes, watched=excluded.watched, watchCount=excluded.watchCount,
          runtimeMinutes=excluded.runtimeMinutes, issuesRead=excluded.issuesRead, totalIssues=excluded.totalIssues,
          isReRun=excluded.isReRun, originalMediaId=excluded.originalMediaId, expectedReleaseDate=excluded.expectedReleaseDate,
          language=excluded.language, isOngoing=excluded.isOngoing, noEnemies=excluded.noEnemies, isHighPriority=excluded.isHighPriority, noAutoDrop=excluded.noAutoDrop, storyHeavyModifier=excluded.storyHeavyModifier, route=excluded.route,
          releaseStatus=excluded.releaseStatus, lastSyncAt=excluded.lastSyncAt,
          subtitle=excluded.subtitle, maturityRating=excluded.maturityRating,
          -- COALESCE so a client that doesn't send provenance (older UI, partial save)
          -- can never wipe it. Passing an explicit 0/'' still overwrites.
          metadataSource=COALESCE(excluded.metadataSource, media.metadataSource),
          metadataSourceId=COALESCE(excluded.metadataSourceId, media.metadataSourceId),
          sourceUrl=COALESCE(excluded.sourceUrl, media.sourceUrl),
          sourceVersion=COALESCE(excluded.sourceVersion, media.sourceVersion),
          installedVersion=COALESCE(excluded.installedVersion, media.installedVersion),
          sourceVersions=COALESCE(excluded.sourceVersions, media.sourceVersions),
          sourceUpdatedAt=COALESCE(excluded.sourceUpdatedAt, media.sourceUpdatedAt),
          updateAvailable=COALESCE(excluded.updateAvailable, media.updateAvailable),
          updateSeenAt=COALESCE(excluded.updateSeenAt, media.updateSeenAt)
      `);

      stmt.run({
        id: item.id,
        userId: userId,
        title: item.title,
        mediaType: item.mediaType,
        coverImageUrl: item.coverImageUrl || null,
        description: item.description || null,
        creator: item.creator || null,
        publisher: item.publisher || null,
        year: item.year || null,
        reviewScore: item.reviewScore || null,
        averagePlaytime: item.averagePlaytime || null,
        hltbMain: item.hltbMain || null,
        hltbMainExtra: item.hltbMainExtra || null,
        hltbCompletionist: item.hltbCompletionist || null,
        selectedHltbType: item.selectedHltbType || null,
        status: item.status,
        userRating: item.userRating || null,
        userReview: item.userReview || null,
        dropReason: item.dropReason || null,
        genres: JSON.stringify(item.genres || []),
        tags: JSON.stringify(item.tags || []),
        tropes: JSON.stringify(item.tropes || []),
        platforms: JSON.stringify(item.platforms || []),
        franchises: JSON.stringify(item.franchises || []),
        playtimeHours: item.playtimeHours || null,
        pagesRead: item.pagesRead || null,
        totalPages: item.totalPages || null,
        chaptersRead: item.chaptersRead || null,
        totalChapters: item.totalChapters || null,
        season: item.season || null,
        episodesWatched: item.episodesWatched || null,
        totalEpisodes: item.totalEpisodes || null,
        watched: item.watched ? 1 : 0,
        watchCount: item.watchCount || null,
        runtimeMinutes: item.runtimeMinutes || null,
        issuesRead: item.issuesRead || null,
        totalIssues: item.totalIssues || null,
        isReRun: item.isReRun ? 1 : 0,
        originalMediaId: item.originalMediaId || null,
        expectedReleaseDate: item.expectedReleaseDate || null,
        language: item.language || null,
        subtitle: item.subtitle || null,
        maturityRating: item.maturityRating || null,
        isOngoing: item.isOngoing ? 1 : 0,
        noEnemies: item.noEnemies ? 1 : 0,
        isHighPriority: item.isHighPriority ? 1 : 0,
        noAutoDrop: item.noAutoDrop ? 1 : 0,
        storyHeavyModifier: item.storyHeavyModifier ?? null,
        route: item.route || null,
        releaseStatus: item.releaseStatus || null,
        lastSyncAt: item.lastSyncAt || null,
        metadataSource: item.metadataSource || null,
        metadataSourceId: item.metadataSourceId || null,
        sourceUrl: item.sourceUrl || null,
        sourceVersion: item.sourceVersion || null,
        installedVersion: item.installedVersion || null,
        sourceVersions: item.sourceVersions && item.sourceVersions.length ? JSON.stringify(item.sourceVersions) : null,
        sourceUpdatedAt: item.sourceUpdatedAt || null,
        updateAvailable: item.updateAvailable === undefined ? null : (item.updateAvailable ? 1 : 0),
        updateSeenAt: item.updateSeenAt || null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      });

      if (item.status === 'Completed') {
        try {
          db.prepare(`
            UPDATE world_bosses 
            SET status = 'Defeated', currentProgress = targetProgress
            WHERE userId = ? AND mediaId = ? AND status = 'Active'
          `).run(userId, item.id);
        } catch (e) { console.error("Could not defeat boss on media completion", e); }
      } else if (item.status === 'Dropped') {
        try {
          db.prepare(`
            UPDATE world_bosses 
            SET status = 'Failed'
            WHERE userId = ? AND mediaId = ? AND status = 'Active'
          `).run(userId, item.id);
        } catch (e) { console.error("Could not fail boss on media drop", e); }
      }

      // A new entry tags itself. The form no longer asks for genres and tags, so
      // this is where they come from — in the background, on the server, so it
      // survives the user closing the tab. It also compiles the Codex, which the
      // enemy and loot generators will want later anyway.
      // A dormant account still gets to add things — it just does not get the AI
      // work until it logs something. The entry is parked as 'deferred' and the
      // first log picks it up, so nothing is silently lost.
      if (isNewEntry && (item.genres || []).length === 0 && (item.tags || []).length === 0) {
        if (activity.isFrozen(userId as string)) {
          db.prepare("UPDATE media SET autoTagStatus = 'deferred' WHERE id = ?").run(item.id);
        } else {
          autoTag.queueAutoTag(userId as string, item.id);
        }
      }

      const saved = db.prepare('SELECT * FROM media WHERE id = ?').get(item.id);
      res.json(normalizeMedia(saved));
    } catch (e) { 
      console.error("DB Save Error:", e);
      res.status(500).json({ error: String(e) }); 
    }
  });

  app.delete("/api/media/:id", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const row = db.prepare('SELECT id, genres, tags FROM media WHERE id = ? AND userId = ?').get(req.params.id, userId) as any;
      if (!row) return res.status(404).json({ error: 'Not found or unauthorized' });

      // Handle Taxonomy Usage Counts (Decrement)
      try {
        const genres = safeJsonParse(row.genres);
        const tags = safeJsonParse(row.tags);
        const updateCount = db.prepare('UPDATE global_taxonomy SET usageCount = usageCount - 1 WHERE name = ? AND type = ?');
        
        genres.forEach((g: string) => updateCount.run(g, 'genre'));
        tags.forEach((t: string) => updateCount.run(t, 'tag'));
      } catch (e) {
        console.error("Failed to decrement taxonomy counts", e);
      }

      db.prepare('DELETE FROM media WHERE id = ? AND userId = ?').run(req.params.id, userId);
      // SQLite CASCADE will handle deleting the logs attached to this mediaId, 
      // but just incase PRAGMA is off, we manually delete:
      db.prepare('DELETE FROM logs WHERE mediaId = ? AND userId = ?').run(req.params.id, userId);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
