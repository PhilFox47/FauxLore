/**
 * Asking a source what has come out, and what comes next.
 *
 * The existing refresh asks "is there a newer version" — the right question for
 * a continuously patched AVN, and useless for anything episodic. A series or a
 * manga does not get a new version; it gets a new instalment, on a date the
 * source usually knows in advance. These read that.
 *
 * Two numbers matter and they are not the same: how many instalments EXIST RIGHT
 * NOW, and how many are planned. Only the first can answer "have I seen
 * everything that is out", which is the whole point — a season with twelve
 * announced episodes and four aired is not something you are behind on.
 */

export interface ReleaseState {
  /** The work's own release/air date, when the source is precise about it. */
  releaseDate?: string;
  /** The source's own wording when it is not precise ("Q4 2026"). */
  releaseDateLabel?: string;
  /** When the next instalment lands. */
  nextReleaseAt?: string;
  /** What that instalment is ("S2E5", "Chapter 143"). */
  nextReleaseLabel?: string;
  /** Instalments actually available now — aired episodes, published chapters. */
  availableUnits?: number;
  /** Instalments planned in total, when the source commits to a number. */
  totalUnits?: number;
  /** Whether the source considers the work finished. */
  ended?: boolean;
}

const isoDay = (v?: string | null): string | undefined => {
  const t = (v || "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : undefined;
};

/** A day is "out" once that calendar day has started, judged in UTC. */
export function hasLanded(day: string | undefined, now = new Date()): boolean {
  if (!day) return false;
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) && t <= now.getTime();
}

/**
 * TMDB.
 *
 * Season-scoped entries have to be read from the season endpoint. The
 * series-level `next_episode_to_air` is whatever the show airs next, which for
 * an entry tracking season 2 while season 3 is running is a different season
 * entirely — it would report new content for something already finished.
 */
export async function tmdbRelease(
  id: string,
  apiKey: string,
  opts: { season?: number | null; isMovie?: boolean } = {},
  now = new Date(),
): Promise<ReleaseState> {
  const type = opts.isMovie ? "movie" : "tv";
  const res = await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${apiKey}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const detail: any = await res.json();

  if (opts.isMovie) {
    return { releaseDate: isoDay(detail.release_date), ended: !!isoDay(detail.release_date) };
  }

  const ended = detail.status === "Ended" || detail.status === "Canceled";

  if (opts.season) {
    const sRes = await fetch(
      `https://api.themoviedb.org/3/tv/${id}/season/${opts.season}?api_key=${apiKey}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (sRes.ok) {
      const season: any = await sRes.json();
      const episodes: any[] = Array.isArray(season.episodes) ? season.episodes : [];
      const aired = episodes.filter((e) => hasLanded(isoDay(e.air_date), now));
      const upcoming = episodes
        .filter((e) => isoDay(e.air_date) && !hasLanded(isoDay(e.air_date), now))
        .sort((a, b) => String(a.air_date).localeCompare(String(b.air_date)))[0];

      return {
        releaseDate: isoDay(season.air_date),
        availableUnits: aired.length,
        totalUnits: episodes.length || undefined,
        nextReleaseAt: isoDay(upcoming?.air_date),
        nextReleaseLabel: upcoming
          ? `S${opts.season}E${upcoming.episode_number}`
          : undefined,
        // A season with no episode still to come is finished, whatever the
        // series as a whole is doing.
        ended: ended || (episodes.length > 0 && !upcoming),
      };
    }
  }

  const next = detail.next_episode_to_air;
  const last = detail.last_episode_to_air;
  return {
    releaseDate: isoDay(detail.first_air_date),
    availableUnits: last?.episode_number && !detail.seasons?.length
      ? last.episode_number
      : (typeof detail.number_of_episodes === "number" && !next ? detail.number_of_episodes : undefined),
    totalUnits: typeof detail.number_of_episodes === "number" ? detail.number_of_episodes : undefined,
    nextReleaseAt: isoDay(next?.air_date),
    nextReleaseLabel: next ? `S${next.season_number}E${next.episode_number}` : undefined,
    ended,
  };
}

/** IGDB's precision grades. Only an exact day is treated as a date. */
const IGDB_EXACT_DAY = 0;
const IGDB_TBD = 7;

/**
 * IGDB.
 *
 * Games have no instalments, so this only ever answers "when does it come out,
 * and does IGDB actually know". A quarter or a bare year is carried as IGDB's
 * own wording rather than as a date, because the timestamp it ships alongside is
 * the first day of that period and reads as a promise it never made.
 */
export async function igdbRelease(
  id: string,
  auth: { clientId: string; token: string },
): Promise<ReleaseState> {
  const res = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": auth.clientId,
      Authorization: `Bearer ${auth.token}`,
      Accept: "application/json",
    },
    body: `fields first_release_date, release_dates.date, release_dates.human, release_dates.category; where id = ${Number(id)};`,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`IGDB ${res.status}`);
  const rows: any[] = await res.json();
  const game = rows?.[0];
  if (!game) return {};

  const stamp = game.first_release_date;
  if (!stamp) {
    // No headline date, but IGDB may still have said "Q1 2027" somewhere.
    const pending = (game.release_dates || []).find((d: any) => d?.human);
    return pending ? { releaseDateLabel: String(pending.human) } : {};
  }

  const dates: any[] = Array.isArray(game.release_dates) ? game.release_dates : [];
  const match = dates.find((d) => d?.date === stamp) || dates[0];
  const iso = new Date(stamp * 1000).toISOString().slice(0, 10);

  if (!match || match.category === IGDB_EXACT_DAY) return { releaseDate: iso };
  if (match.category === IGDB_TBD) return { releaseDateLabel: String(match.human || "TBD") };
  return { releaseDateLabel: String(match.human || "").trim() || iso };
}

/**
 * MangaDex.
 *
 * The manga record itself carries only a year, but every chapter has a
 * `publishAt` that may be in the future — MangaDex models scheduled releases
 * explicitly, which is exactly the episode equivalent.
 *
 * Chapters are counted rather than trusted from a "latest chapter" field:
 * numbering skips, restarts per volume and occasionally contains ranges, so the
 * highest number is not the count of what exists. What matters here is only
 * whether anything is readable that was not before.
 */
export async function mangadexRelease(
  id: string,
  opts: { language?: string } = {},
  now = new Date(),
): Promise<ReleaseState> {
  const lang = opts.language || "en";
  const params = new URLSearchParams({
    limit: "100",
    "translatedLanguage[]": lang,
    "order[publishAt]": "desc",
    // Future chapters are the point, so they must not be filtered out.
    includeFuturePublishAt: "1",
  });
  const res = await fetch(`https://api.mangadex.org/manga/${encodeURIComponent(id)}/feed?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`MangaDex ${res.status}`);
  const body: any = await res.json();
  const chapters: any[] = Array.isArray(body.data) ? body.data : [];

  let available = 0;
  let next: { at: string; label: string } | undefined;

  for (const c of chapters) {
    const at = c?.attributes?.publishAt;
    const t = Date.parse(at || "");
    if (!Number.isFinite(t)) continue;
    const number = String(c?.attributes?.chapter || "").trim();
    if (t <= now.getTime()) {
      available++;
    } else if (!next || t < Date.parse(next.at)) {
      next = { at: String(at).slice(0, 10), label: number ? `Chapter ${number}` : "Next chapter" };
    }
  }

  return {
    availableUnits: chapters.length ? available : undefined,
    nextReleaseAt: next?.at,
    nextReleaseLabel: next?.label,
  };
}
