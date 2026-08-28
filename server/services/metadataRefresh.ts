import type { Db } from "../context";
import { getGameDetails } from "../integrations/gamestorylog";
import { getIgdbToken, igdbCoverUrl } from "../integrations/igdb";
import { igdbRelease, mangadexRelease, tmdbRelease, type ReleaseState } from "../integrations/releaseFeeds";
import type { NewNotification } from "./notifications";
import type { CoverCache } from "./coverCache";
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
 * Where each source keeps the cover, asked for only once.
 *
 * An unreleased entry is carrying whatever art existed when it was announced —
 * a teaser, a logo on a black field, a placeholder — and that is usually replaced
 * on or shortly before release day. So the cover is re-fetched at exactly the
 * moment the entry stops being unreleased, and never otherwise: this is separate
 * from REFRESHERS on purpose, because the daily poll runs against every tracked
 * entry and has no business spending a request on art that has not changed.
 *
 * Returning undefined is normal — no key, no cover on the record, a source that
 * does not publish one. The entry then keeps the cover it already had.
 */
type CoverFetcher = (sourceId: string, ctx: RefreshContext) => Promise<string | undefined>;

/**
 * TMDB serves posters at a handful of fixed widths. w780 is the largest before
 * `original`, which is unbounded and occasionally enormous for no visible gain.
 */
const TMDB_POSTER_WIDTH = "w780";

const COVER_FETCHERS: Record<string, CoverFetcher> = {
  gsl: async (slug) => {
    const game = await getGameDetails(slug, true);
    return game?.coverImageUrl || undefined;
  },

  tmdb: async (id, { db, row }) => {
    const keys = systemKeys(db);
    const apiKey = keys.tmdbApiKey || process.env.TMDB_API_KEY;
    if (!apiKey) return undefined;
    const type = row.mediaType === "Movie" ? "movie" : "tv";
    // A season has its own poster, and for a series tracked season by season it
    // is the right one — the series poster is whatever the show is currently
    // being sold as, which is usually the newest season.
    const path = type === "tv" && row.season
      ? `tv/${id}/season/${row.season}`
      : `${type}/${id}`;
    const res = await fetch(`https://api.themoviedb.org/3/${path}?api_key=${apiKey}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return undefined;
    const detail: any = await res.json();
    return detail?.poster_path
      ? `https://image.tmdb.org/t/p/${TMDB_POSTER_WIDTH}${detail.poster_path}`
      : undefined;
  },

  igdb: async (id, { db }) => {
    const keys = systemKeys(db);
    const clientId = keys.igdbClientId || process.env.IGDB_CLIENT_ID;
    const clientSecret = keys.igdbClientSecret || process.env.IGDB_CLIENT_SECRET;
    if (!clientId || !clientSecret) return undefined;
    const token = await getIgdbToken(clientId, clientSecret);
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: { "Client-ID": clientId, Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: `fields cover.image_id; where id = ${Number(id)};`,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return undefined;
    const rows: any[] = await res.json();
    return igdbCoverUrl(rows?.[0]?.cover?.image_id) || undefined;
  },

  mangadex: async (id) => {
    // The release poll reads the chapter feed, which carries no art, so this is
    // the one source where the cover genuinely costs an extra request.
    const res = await fetch(
      `https://api.mangadex.org/manga/${encodeURIComponent(id)}?includes[]=cover_art`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return undefined;
    const body: any = await res.json();
    const art = (body?.data?.relationships || []).find((r: any) => r?.type === "cover_art");
    const file = art?.attributes?.fileName;
    return file ? `https://uploads.mangadex.org/covers/${id}/${file}` : undefined;
  },
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
  /**
   * Taken a local copy of, so a refreshed cover is stored the same way every
   * other cover is. Optional: without it the release still happens, it just
   * keeps whatever art it was announced with.
   */
  coverCache?: CoverCache,
) {
  /**
   * Replaces the pre-release cover once the thing is actually out.
   *
   * An unreleased entry carries whatever art existed when it was announced, and
   * that is usually a teaser or a placeholder that gets replaced on or shortly
   * before release day. This asks the source once, at the transition.
   *
   * Every failure keeps the existing cover. A source with no key, no cover on
   * the record, an unreachable CDN, or something that comes back the wrong shape
   * all end the same way: the entry is unchanged. That matters because the
   * alternative — a released entry with no art at all — is worse than a stale
   * teaser, and because `looksLikeCover` rejecting the download is exactly how a
   * hotlink placeholder announces itself.
   */
  async function refreshCoverOnRelease(userId: string, row: any) {
    if (!coverCache) return;
    const fetcher = COVER_FETCHERS[row.metadataSource];
    if (!fetcher) return;

    try {
      const url = await fetcher(row.metadataSourceId, { db, row });
      if (!url) return;

      const result = await coverCache.cacheCover(url);
      if (!result.cached) {
        console.warn(`[metadataRefresh] Release cover for "${row.title}" not taken: ${result.reason}`);
        return;
      }
      // Same file as before, so the source simply never changed its art.
      if (result.url === row.coverImageUrl) return;

      db.prepare("UPDATE media SET coverImageUrl = ? WHERE id = ? AND userId = ?")
        .run(result.url, row.id, userId);
      console.log(`[metadataRefresh] "${row.title}" released — cover refreshed from ${row.metadataSource}`);
    } catch (e) {
      console.error(`[metadataRefresh] Could not refresh the cover for "${row.title}"`, e);
    }
  }
  /**
   * Writes what a source said about dates and instalments, and moves the status
   * if that changed the answer to "is there anything to watch".
   *
   * Every write goes through the same UPDATE so a source that only knows part of
   * the picture cannot blank the rest: `releaseFieldsFor` returns only the
   * columns it actually has an opinion about.
   */
  async function applyRelease(userId: string, row: any, release: ReleaseState) {
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
      const justReleased = row.status === "Unreleased" && decision.status !== "Unreleased";
      if (justReleased && row.autoTagStatus === "deferred") {
        try { onReleased?.(userId, row.id); } catch (e) { console.error("[metadataRefresh] release hook failed", e); }
      }
      // Unconditional, unlike the research above: the art needs replacing
      // whether or not this entry was ever parked for tagging.
      //
      // Awaited rather than fired and forgotten. This is a once-per-entry
      // opportunity — the status has already flipped, so the transition will
      // never come round again — and a fetch still in flight when the process
      // stops would be a cover that is never refreshed at all. A slow CDN
      // delaying a nightly sweep by a few seconds is the cheaper problem.
      if (justReleased) await refreshCoverOnRelease(userId, row);
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

          if (upstream.release) await applyRelease(userId, row, upstream.release);
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
