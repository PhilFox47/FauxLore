// Pure row-normalization helpers. Extracted verbatim from the original server.ts.

  function safeJsonParse(str: any) {
    try {
      if (typeof str === 'string') {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed;
        return [parsed];
      }
      return [];
    } catch(e) {
      return typeof str === 'string' && str ? [str] : [];
    }
  }

  function normalizeMedia(row: any) {
    return {
      ...row,
      genres: row.genres ? safeJsonParse(row.genres) : [],
      tags: row.tags ? safeJsonParse(row.tags) : [],
      tropes: row.tropes ? safeJsonParse(row.tropes) : [],
      platforms: row.platforms ? safeJsonParse(row.platforms) : [],
      franchises: row.franchises ? safeJsonParse(row.franchises) : [],
      watched: row.watched === 1,
      isReRun: row.isReRun === 1,
      isOngoing: row.isOngoing === 1,
      noEnemies: row.noEnemies === 1,
      isHighPriority: row.isHighPriority === 1,
      expectedReleaseDate: row.expectedReleaseDate || null,
      releaseStatus: row.releaseStatus || null,
      lastSyncAt: row.lastSyncAt || null
    };
  }

export { safeJsonParse, normalizeMedia };
