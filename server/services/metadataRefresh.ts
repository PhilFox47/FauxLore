import type { Db } from "../context";
import { getGameDetails } from "../integrations/gamestorylog";
import { getIgdbToken } from "../integrations/igdb";
import { igdbRelease, mangadexRelease, tmdbRelease, type ReleaseState } from "../integrations/releaseFeeds";
import type { NewNotification } from "./notifications";
import { decideStatus, releaseDateMoved, releaseFieldsFor } from "./releaseTracking";

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
  versions?: string[];
  updatedAt?: string;
  releaseStatus?: string;
  /** What has come out and what is coming, for sources that know. */
  release?: ReleaseState;
}

/** What a refresher needs beyond the id: credentials, and which entry this is. */
interface RefreshContext {
  db: Db;
  row: any;
}

type Refresher = (sourceId: string, ctx: RefreshContext) => Promise<UpstreamState>;

/** Reads whichever credential set the search routes would have used. */
function systemKeys(db: Db): any {
  return db.prepare("SELECT * FROM system_settings WHERE id = ?").get("system") || {};
}

const REFRESHERS: Record<string, Refresher> = {
  gsl: async (slug: string) => {
    const game = await getGameDetails(slug, true); // bypass cache: we want the live state
    return { version: game.version, versions: game.versions, updatedAt: game.updatedAt, releaseStatus: game.status };
  },

  tmdb: async (id, { db, row }) => {
    const keys = systemKeys(db);
    const apiKey = keys.tmdbApiKey || process.env.TMDB_API_KEY;
    if (!apiKey) return {};
    return {
      release: await tmdbRelease(id, apiKey, {
        season: row.mediaType === "Series" ? row.season : null,
        isMovie: row.mediaType === "Movie",
      }),
    };
  },

  igdb: async (id, { db }) => {
    const keys = systemKeys(db);
    const clientId = keys.igdbClientId || process.env.IGDB_CLIENT_ID;
    const clientSecret = keys.igdbClientSecret || process.env.IGDB_CLIENT_SECRET;
    if (!clientId || !clientSecret) return {};
    const token = await getIgdbToken(clientId, clientSecret);
    return { release: await igdbRelease(id, { clientId, token }) };
  },

  mangadex: async (id, { row }) => ({
    release: await mangadexRelease(id, { language: row.language || "en" }),
  }),
};

/**
 * Statuses worth polling.
 *
 * Unreleased is in here because an announced date is the thing most likely to be
 * wrong: it gets delayed, brought forward, or was never known in the first place.
 * Something the user is waiting on is exactly what should be re-checked.
 */
const TRACKED_STATUSES = ["Active", "On Hold", "Caught Up", "Unreleased", "Planning"];

/** Which column holds "how much of it have I had", per type. */
const CONSUMED_COLUMN: Record<string, string> = {
  Series: "episodesWatched",
  Manga: "chaptersRead",
};

export function createMetadataRefresh(
  db: Db,
  /** Optional sink so a detected update also becomes a persistent notification. */
  notify?: (userId: string, n: NewNotification) => boolean,
  /**
   * Called when an entry stops being unreleased. Research is deliberately not
   * done for something that does not exist yet, so the release is what finally
   * earns it — this is where that debt is paid.
   */
  onReleased?: (userId: string, mediaId: string) => void,
) {
  /**
   * Writes what a source said about dates and instalments, and moves the status
   * if that changed the answer to "is there anything to watch".
   *
   * Every write goes through the same UPDATE so a source that only knows part of
   * the picture cannot blank the rest: `releaseFieldsFor` returns only the
   * columns it actually has an opinion about.
   */
  function applyRelease(userId: string, row: any, release: ReleaseState) {
    const fields = releaseFieldsFor(release, { expectedReleaseDate: row.expectedReleaseDate });

    // A date moving is news in itself — a delay is not something the user did.
    const movedTo = fields.expectedReleaseDate as string | undefined;
    if (movedTo && releaseDateMoved(row.expectedReleaseDate, movedTo)) {
      notify?.(userId, {
        type: "media_released",
        title: `New date for ${row.title}`,
        body: `Moved from ${String(row.expectedReleaseDate).slice(0, 10)} to ${movedTo.slice(0, 10)}.`,
        mediaId: row.id,
        link: "/radar",
        dedupeKey: `release_moved:${row.id}:${movedTo.slice(0, 10)}`,
      });
    }

    const consumedColumn = CONSUMED_COLUMN[row.mediaType];
    const decision = decideStatus(
      {
        status: row.status,
        mediaType: row.mediaType,
        // Undefined rather than null when the type has no such unit, so the
        // rules can tell "not applicable" from "none consumed".
        consumedUnits: consumedColumn ? (row[consumedColumn] ?? 0) : undefined,
        expectedReleaseDate: row.expectedReleaseDate,
        isOngoing: row.isOngoing,
      },
      release,
    );

    if (decision) {
      fields.status = decision.status;
      fields.autoStatusAt = new Date().toISOString();
    }

    const keys = Object.keys(fields);
    if (keys.length) {
      db.prepare(`UPDATE media SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
        .run(...keys.map((k) => fields[k]), row.id);
    }

    if (decision) {
      console.log(`[metadataRefresh] "${row.title}": ${row.status} -> ${decision.status} (${decision.reason})`);

      // Now that it exists, it can be researched. Only entries actually parked
      // for that reason are picked up, so this never re-tags something the user
      // has already curated.
      if (row.status === "Unreleased" && decision.status !== "Unreleased" && row.autoTagStatus === "deferred") {
        try { onReleased?.(userId, row.id); } catch (e) { console.error("[metadataRefresh] release hook failed", e); }
      }
      notify?.(userId, {
        type: decision.status === "Active" ? "media_update" : "media_released",
        title: `${row.title} is now ${decision.status}`,
        body: decision.reason,
        mediaId: row.id,
        link: `/library/${encodeURIComponent(row.mediaType || "Series")}`,
        // Keyed by the destination and what triggered it, so a series that keeps
        // bouncing between Active and Caught Up notifies once per instalment
        // rather than once per sweep.
        dedupeKey: `auto_status:${row.id}:${decision.status}:${release.availableUnits ?? release.nextReleaseAt ?? "x"}`,
      });
    }
  }

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
          `SELECT id, title, mediaType, status, season, language, episodesWatched, chaptersRead, autoTagStatus,
                  expectedReleaseDate, nextReleaseAt, availableUnits,
                  metadataSource, metadataSourceId, sourceVersion, installedVersion, sourceUpdatedAt, lastSyncAt
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
          const upstream = await refresher(row.metadataSourceId, { db, row });

          // When the user has recorded which version they actually have, that is the
          // authoritative comparison: anything different upstream is an update they
          // haven't played. Otherwise fall back to "did it move since we last looked".
          let isUpdate: boolean;
          let hasBaseline: boolean;

          if (row.installedVersion && upstream.version) {
            isUpdate = upstream.version !== row.installedVersion;
            hasBaseline = true;
          } else {
            const versionChanged =
              !!upstream.version && !!row.sourceVersion && upstream.version !== row.sourceVersion;
            const dateChanged =
              !!upstream.updatedAt &&
              (!row.sourceUpdatedAt ||
                new Date(upstream.updatedAt).getTime() > new Date(row.sourceUpdatedAt).getTime());
            isUpdate = versionChanged || dateChanged;
            // First sight of an item with no stored version: record a baseline rather
            // than claiming an update the user has probably already played.
            hasBaseline = !!row.sourceVersion || !!row.sourceUpdatedAt;
          }

          db.prepare(
            `UPDATE media
                SET sourceVersion = COALESCE(?, sourceVersion),
                    sourceVersions = COALESCE(?, sourceVersions),
                    sourceUpdatedAt = COALESCE(?, sourceUpdatedAt),
                    releaseStatus = COALESCE(?, releaseStatus),
                    updateAvailable = CASE WHEN ? = 1 THEN 1 ELSE updateAvailable END,
                    lastSyncAt = ?
              WHERE id = ?`,
          ).run(
            upstream.version ?? null,
            upstream.versions && upstream.versions.length ? JSON.stringify(upstream.versions) : null,
            upstream.updatedAt ?? null,
            upstream.releaseStatus ?? null,
            isUpdate && hasBaseline ? 1 : 0,
            new Date().toISOString(),
            row.id,
          );

          if (isUpdate && hasBaseline) {
            updatesFound++;
            // Keyed by the new version so each release notifies exactly once.
            notify?.(userId, {
              type: "media_update",
              title: `Update available: ${row.title}`,
              body: upstream.version
                ? `${row.installedVersion || row.sourceVersion || "your copy"} \u2192 ${upstream.version}`
                : "A new version was published.",
              mediaId: row.id,
              link: `/library/${encodeURIComponent(row.mediaType || "Visual Novel")}`,
              dedupeKey: `media_update:${row.id}:${upstream.version || upstream.updatedAt || "new"}`,
            });
            console.log(
              `[metadataRefresh] Update for "${row.title}": ${row.sourceVersion || "?"} -> ${upstream.version || "(new date)"}`,
            );
          }

          if (upstream.release) applyRelease(userId, row, upstream.release);
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
