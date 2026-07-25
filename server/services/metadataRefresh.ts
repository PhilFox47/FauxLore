import type { Db } from "../context";
import { getGameDetails } from "../integrations/gamestorylog";

/**
 * Source-aware metadata refresh.
 *
 * Media items remember where their metadata came from (metadataSource /
 * metadataSourceId). This walks the items worth re-checking and asks their source
 * whether anything changed. Western AVNs in particular are developed continuously,
 * so a new version is the signal to pull something off the shelf and play it again.
 *
 * Only items the user is plausibly still following are checked (Active / On Hold),
 * which keeps upstream traffic proportional to what is actually being tracked.
 *
 * Adding a new updatable source means adding one entry to REFRESHERS — the rest of
 * the pipeline (scheduling, change detection, flagging) is source-agnostic.
 */

/** What a source reports back about an item's current state upstream. */
interface UpstreamState {
  version?: string;
  updatedAt?: string;
  releaseStatus?: string;
}

type Refresher = (sourceId: string) => Promise<UpstreamState>;

const REFRESHERS: Record<string, Refresher> = {
  gsl: async (slug: string) => {
    const game = await getGameDetails(slug, true); // bypass cache: we want the live state
    return { version: game.version, updatedAt: game.updatedAt, releaseStatus: game.status };
  },
  // vndb / mangadex / igdb can be added here as they gain update semantics.
};

/** Statuses worth polling — things the user is still engaged with. */
const TRACKED_STATUSES = ["Active", "On Hold"];

export function createMetadataRefresh(db: Db) {
  /**
   * Re-checks tracked media for one user. Returns how many items were found to have
   * a new version upstream.
   */
  const refreshTrackedMedia = async (userId: string, opts: { minAgeMs?: number } = {}) => {
    const minAge = opts.minAgeMs ?? 20 * 60 * 60 * 1000; // don't re-poll within ~a day
    let updatesFound = 0;

    try {
      const placeholders = TRACKED_STATUSES.map(() => "?").join(", ");
      const rows: any[] = db
        .prepare(
          `SELECT id, title, status, metadataSource, metadataSourceId, sourceVersion, sourceUpdatedAt, lastSyncAt
             FROM media
            WHERE userId = ?
              AND metadataSource IS NOT NULL
              AND metadataSourceId IS NOT NULL
              AND status IN (${placeholders})`,
        )
        .all(userId, ...TRACKED_STATUSES);

      const now = Date.now();

      for (const row of rows) {
        const refresher = REFRESHERS[row.metadataSource];
        if (!refresher) continue; // source has no update semantics yet

        // Throttle: skip anything checked recently
        if (row.lastSyncAt && now - new Date(row.lastSyncAt).getTime() < minAge) continue;

        try {
          const upstream = await refresher(row.metadataSourceId);

          // A change in either the version string or the upstream update date counts.
          const versionChanged =
            !!upstream.version && !!row.sourceVersion && upstream.version !== row.sourceVersion;
          const dateChanged =
            !!upstream.updatedAt &&
            (!row.sourceUpdatedAt ||
              new Date(upstream.updatedAt).getTime() > new Date(row.sourceUpdatedAt).getTime());
          const isUpdate = versionChanged || dateChanged;

          // First sight of an item with no stored version: record a baseline rather
          // than claiming an update the user has probably already played.
          const hasBaseline = !!row.sourceVersion || !!row.sourceUpdatedAt;

          db.prepare(
            `UPDATE media
                SET sourceVersion = COALESCE(?, sourceVersion),
                    sourceUpdatedAt = COALESCE(?, sourceUpdatedAt),
                    releaseStatus = COALESCE(?, releaseStatus),
                    updateAvailable = CASE WHEN ? = 1 THEN 1 ELSE updateAvailable END,
                    lastSyncAt = ?
              WHERE id = ?`,
          ).run(
            upstream.version ?? null,
            upstream.updatedAt ?? null,
            upstream.releaseStatus ?? null,
            isUpdate && hasBaseline ? 1 : 0,
            new Date().toISOString(),
            row.id,
          );

          if (isUpdate && hasBaseline) {
            updatesFound++;
            console.log(
              `[metadataRefresh] Update for "${row.title}": ${row.sourceVersion || "?"} -> ${upstream.version || "(new date)"}`,
            );
          }
        } catch (e) {
          // A single failing item must never abort the sweep (a page may 404 or the
          // markup may have shifted). Stamp lastSyncAt so it backs off either way.
          console.error(`[metadataRefresh] Failed to refresh "${row.title}":`, e);
          db.prepare("UPDATE media SET lastSyncAt = ? WHERE id = ?").run(new Date().toISOString(), row.id);
        }
      }
    } catch (e) {
      console.error("[metadataRefresh] Sweep failed:", e);
    }

    return updatesFound;
  };

  /** Runs the sweep for every user. */
  const refreshAllUsers = async () => {
    const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
    for (const u of users) {
      const n = await refreshTrackedMedia(u.id);
      if (n > 0) console.log(`[metadataRefresh] ${n} update(s) found for user ${u.id}`);
    }
  };

  return { refreshTrackedMedia, refreshAllUsers };
}
