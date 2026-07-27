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
      noAutoDrop: row.noAutoDrop === 1,
      expectedReleaseDate: row.expectedReleaseDate || null,
      route: row.route || null,
      releaseStatus: row.releaseStatus || null,
      lastSyncAt: row.lastSyncAt || null,
      metadataSource: row.metadataSource || null,
      metadataSourceId: row.metadataSourceId || null,
      sourceUrl: row.sourceUrl || null,
      sourceVersion: row.sourceVersion || null,
      installedVersion: row.installedVersion || null,
      sourceVersions: safeJsonParse(row.sourceVersions),
      sourceUpdatedAt: row.sourceUpdatedAt || null,
      updateAvailable: row.updateAvailable === 1,
      updateSeenAt: row.updateSeenAt || null,
      autoTagStatus: row.autoTagStatus || null
    };
  }

export { safeJsonParse, normalizeMedia };
