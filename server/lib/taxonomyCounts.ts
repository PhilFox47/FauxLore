import type { Db } from "../context";
import { safeJsonParse } from "./normalize";

/** Recomputes global_taxonomy.usageCount from current media on startup. */
export function recalcTaxonomyUsageCounts(db: Db) {
  // Recalculate Taxonomy Usage Counts on startup
  try {
    const mediaItems = db.prepare('SELECT genres, tags FROM media').all() as any[];
    const counts: Record<string, number> = {};
    const types: Record<string, string> = {};

    mediaItems.forEach(item => {
      const g = safeJsonParse(item.genres);
      const t = safeJsonParse(item.tags);
      g.forEach((name: string) => {
        counts[name] = (counts[name] || 0) + 1;
        types[name] = 'genre';
      });
      t.forEach((name: string) => {
        counts[name] = (counts[name] || 0) + 1;
        types[name] = 'tag';
      });
    });

    db.prepare('UPDATE global_taxonomy SET usageCount = 0').run();
    const updateStmt = db.prepare('UPDATE global_taxonomy SET usageCount = ? WHERE name = ? AND type = ?');
    Object.entries(counts).forEach(([name, count]) => {
      updateStmt.run(count, name, types[name]);
    });
  } catch (e) {
    console.error("Failed to recalculate taxonomy counts", e);
  }
}
