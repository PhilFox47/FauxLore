import type { Express } from "express";
import type { ServerContext } from "../context";
import { isRemoteCover } from "../services/coverCache";

/**
 * Genres and tags that keep a cover off the login page.
 *
 * Only the login backdrop consults this — it is the one place cover art is
 * shown to someone who has not signed in. Everywhere inside the app the library
 * is shown in full. Compared case-insensitively against trimmed terms; near
 * misses like "Erotica" or "Hentai" are deliberately not inferred, so extending
 * the list is an edit here rather than a guess at runtime.
 */
const ADULT_TERMS = new Set(["erotic", "nsfw", "eroge", "sexual content"]);

export function registerMediaRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, normalizeMedia, safeJsonParse, syncOngoingMediaInBackground, autoTag, activity, coverCache, refreshMangaCovers } = ctx;

  app.get("/api/public/covers", (req, res) => {
    try {
      // The login page tiles these behind the form. A 4K display needs a few
      // hundred to fill without repeating, so send plenty and let the client
      // take what it can actually show.
      //
      // This is the one endpoint that serves cover art to someone who is not
      // logged in, so adult titles are held back from it. Filtering happens in
      // JS rather than SQL because genres and tags are JSON arrays: a LIKE
      // against the raw text would match substrings and miss casing, and here
      // a miss means showing the thing we meant to hide.
      const rows = db
        .prepare(
          `SELECT coverImageUrl, genres, tags FROM media
            WHERE coverImageUrl IS NOT NULL AND coverImageUrl != ''`,
        )
        .all() as { coverImageUrl: string; genres: string | null; tags: string | null }[];

      // A cover shared by several entries is withheld if ANY of them is flagged.
      const blocked = new Set<string>();
      const safe = new Set<string>();
      for (const row of rows) {
        const terms = [...safeJsonParse(row.genres), ...safeJsonParse(row.tags)]
          .map((t: any) => String(t || "").trim().toLowerCase());
        if (terms.some((t) => ADULT_TERMS.has(t))) blocked.add(row.coverImageUrl);
        else safe.add(row.coverImageUrl);
      }

      const covers = [...safe].filter((url) => !blocked.has(url));
      // Shuffle here rather than with ORDER BY RANDOM(), so the limit applies to
      // what is left after filtering instead of to the whole library.
      for (let i = covers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [covers[i], covers[j]] = [covers[j], covers[i]];
      }
      res.json(covers.slice(0, 400));
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

  /**
   * Manual "fetch covers now" — the button on a manga's detail view.
   *
   * Awaited rather than fire-and-forget, unlike the same call made when a
   * manga is first added: a button click has someone watching it and
   * expecting either a result or an error, where the add-media flow has a
   * dialog to get out of the way of instead.
   */
  app.post("/api/media/:id/refresh-manga-cover", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const row: any = db.prepare('SELECT * FROM media WHERE id = ? AND userId = ?').get(req.params.id, userId);
      if (!row) return res.status(404).json({ error: 'Media not found' });
      if (row.mediaType !== 'Manga' || row.metadataSource !== 'mangadex' || !row.metadataSourceId) {
        return res.status(400).json({ error: 'This entry has no MangaDex covers to fetch.' });
      }

      await refreshMangaCovers(userId as string, row);

      const saved = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
      res.json(normalizeMedia(saved));
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

  /**
   * Undoes covers that a later fetch proved were placeholders.
   *
   * The first copy of a canned response looks like a perfectly good cover — it
   * only gives itself away when a second entry is handed the same bytes. By then
   * the file is on disk and rows point at it, so those rows go back to their
   * remote URL and the file is already gone.
   */
  function revertEvicted(evicted: { localPath: string; sourceUrl: string }[] | undefined) {
    if (!evicted?.length) return;
    const revert = db.prepare('UPDATE media SET coverImageUrl = ? WHERE coverImageUrl = ?');
    for (const e of evicted) {
      const changed = revert.run(e.sourceUrl, e.localPath).changes;
      console.warn(`Cover placeholder detected; reverted ${changed} entr${changed === 1 ? 'y' : 'ies'} to ${e.sourceUrl}`);
    }
  }

  /**
   * Takes a local copy of every cover still pointing at someone else's server.
   *
   * For libraries built before covers were cached. Entries whose cover cannot
   * be fetched, or comes back the wrong shape, are left exactly as they are —
   * so this is safe to run more than once and reports what it skipped.
   */
  app.post("/api/media/covers/cache", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // A request per entry against whichever CDNs the library was built from.
      if (!activity.requireActive(userId as string, res)) return;

      const rows = db.prepare(
        `SELECT id, title, coverImageUrl FROM media
          WHERE userId = ? AND coverImageUrl IS NOT NULL AND coverImageUrl LIKE 'http%'`,
      ).all(userId) as any[];

      const update = db.prepare('UPDATE media SET coverImageUrl = ? WHERE id = ? AND userId = ?');
      let cached = 0;
      const skipped: { title: string; reason: string }[] = [];

      for (const row of rows) {
        const result = await coverCache.cacheCover(row.coverImageUrl);
        // An eviction can undo a cover stored earlier in this very loop, so it
        // is applied before the count is reported.
        revertEvicted(result.evicted);
        if (result.evicted?.length) cached -= result.evicted.length;
        if (result.cached) {
          update.run(result.url, row.id, userId);
          cached++;
        } else {
          skipped.push({ title: row.title, reason: result.reason || 'unknown' });
        }
      }

      res.json({ checked: rows.length, cached: Math.max(0, cached), skipped });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/media", async (req, res) => {
    try {
      const item = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;

      // Take a local copy of the cover before the row is written, so the app
      // never depends on someone else's CDN staying friendly. A cover that
      // cannot be fetched — or that comes back the wrong shape, which is how a
      // hotlink placeholder announces itself — keeps its remote URL and behaves
      // exactly as it did before.
      if (isRemoteCover(item.coverImageUrl)) {
        const result = await coverCache.cacheCover(item.coverImageUrl);
        revertEvicted(result.evicted);
        if (result.cached) item.coverImageUrl = result.url;
        else console.warn(`Could not cache cover for "${item.title}": ${result.reason}`);
      }

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
          issuesRead, totalIssues, isReRun, originalMediaId, expectedReleaseDate, releaseDateLabel, nextReleaseAt, nextReleaseLabel, availableUnits, language, isOngoing, noEnemies, isHighPriority, noAutoDrop, timeTravel, storyHeavyModifier, route, releaseStatus, lastSyncAt, createdAt, updatedAt,
          subtitle, maturityRating,
          metadataSource, metadataSourceId, sourceUrl, sourceVersion, installedVersion, sourceVersions, sourceUpdatedAt, updateAvailable, updateSeenAt
        ) VALUES (
          @id, @userId, @title, @mediaType, @coverImageUrl, @description, @creator, @publisher, @year, 
          @reviewScore, @averagePlaytime, @hltbMain, @hltbMainExtra, @hltbCompletionist, @selectedHltbType,
          @status, @userRating, @userReview, @dropReason, @genres, @tags, @tropes, @platforms, @franchises,
          @playtimeHours, @pagesRead, @totalPages, @chaptersRead, @totalChapters,
          @season, @episodesWatched, @totalEpisodes, @watched, @watchCount, @runtimeMinutes,
          @issuesRead, @totalIssues, @isReRun, @originalMediaId, @expectedReleaseDate, @releaseDateLabel, @nextReleaseAt, @nextReleaseLabel, @availableUnits, @language, @isOngoing, @noEnemies, @isHighPriority, @noAutoDrop, @timeTravel, @storyHeavyModifier, @route, @releaseStatus, @lastSyncAt, @createdAt, @updatedAt,
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
          isReRun=excluded.isReRun, originalMediaId=excluded.originalMediaId, expectedReleaseDate=excluded.expectedReleaseDate, releaseDateLabel=excluded.releaseDateLabel,
          nextReleaseAt=excluded.nextReleaseAt, nextReleaseLabel=excluded.nextReleaseLabel, availableUnits=excluded.availableUnits,
          language=excluded.language, isOngoing=excluded.isOngoing, noEnemies=excluded.noEnemies, isHighPriority=excluded.isHighPriority, noAutoDrop=excluded.noAutoDrop, timeTravel=excluded.timeTravel, storyHeavyModifier=excluded.storyHeavyModifier, route=excluded.route,
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
        releaseDateLabel: item.releaseDateLabel || null,
        nextReleaseAt: item.nextReleaseAt || null,
        nextReleaseLabel: item.nextReleaseLabel || null,
        availableUnits: Number.isFinite(Number(item.availableUnits)) ? Number(item.availableUnits) : null,
        language: item.language || null,
        subtitle: item.subtitle || null,
        maturityRating: item.maturityRating || null,
        isOngoing: item.isOngoing ? 1 : 0,
        noEnemies: item.noEnemies ? 1 : 0,
        isHighPriority: item.isHighPriority ? 1 : 0,
        timeTravel: item.timeTravel ? 1 : 0,
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
      /**
       * Every branch here says what it decided and why.
       *
       * There are four reasons a new entry might get no Codex — it is not new,
       * it arrived already tagged, it is unreleased, or the account is dormant —
       * and from the outside all four look identical: you add something and
       * nothing happens. "It didn't build a Codex for Severance" was not
       * answerable from the log, which is the one thing the log exists for.
       */
      if (isNewEntry && (item.genres || []).length === 0 && (item.tags || []).length === 0) {
        // Something that does not exist yet cannot be researched. A Codex for an
        // unreleased title would be written from a marketing page and a guess,
        // and it is compiled once and read for the life of the entry — so it is
        // parked exactly like dormant-account work is, and the release picks it
        // up. Tagging and the Codex travel together here: autoTagMedia compiles
        // the Codex as its first step.
        const frozen = activity.isFrozen(userId as string);
        if (item.status === 'Unreleased' || frozen) {
          db.prepare("UPDATE media SET autoTagStatus = 'deferred' WHERE id = ?").run(item.id);
          console.log(
            `[autotag] Parked "${item.title}" — ${item.status === 'Unreleased' ? 'it has not been released yet' : 'the account is dormant'}. ` +
            `Tagging and the Codex run when that changes.`,
          );
        } else {
          console.log(`[autotag] Queued "${item.title}" (${item.mediaType}); the Codex is compiled as its first step.`);
          autoTag.queueAutoTag(userId as string, item.id);
        }
      } else if (isNewEntry) {
        console.log(
          `[autotag] Skipped "${item.title}" — it arrived already tagged ` +
          `(${(item.genres || []).length} genre(s), ${(item.tags || []).length} tag(s)), so no Codex was compiled.`,
        );
      }

      // A manga added from MangaDex gets its English (or, failing that,
      // Japanese) covers pulled in immediately, rather than waiting for the
      // next daily sweep — the entry would otherwise sit on whichever single
      // default cover MangaDex search happened to embed until tomorrow.
      // Fire-and-forget like the auto-tag queue above: this touches the
      // network several times (a cover list, an aggregate, one download per
      // volume) and must not hold up the Add Media dialog.
      if (isNewEntry && item.mediaType === 'Manga' && item.metadataSource === 'mangadex' && item.metadataSourceId) {
        const freshRow = db.prepare('SELECT * FROM media WHERE id = ?').get(item.id);
        refreshMangaCovers(userId as string, freshRow).catch((e) =>
          console.error(`[media] Could not fetch manga covers for "${item.title}"`, e),
        );
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
      // The lines this entry earned go with it. The read already hides them once
      // the media row is gone, but leaving orphans to accumulate is untidy.
      try { ctx.flavorLibrary.forgetMedia(userId as string, req.params.id); }
      catch (e) { console.error('Failed to drop this entry\'s flavor texts', e); }
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
