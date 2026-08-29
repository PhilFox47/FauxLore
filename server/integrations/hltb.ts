/**
 * HowLongToBeat.
 *
 * HLTB publishes no API, so this talks to the endpoint their own site uses —
 * which they move, deliberately and often. Everything here is built around that
 * one fact.
 *
 * The site is a Next.js app whose search endpoint is named inside a JS chunk, so
 * the path is discovered at call time rather than hard-coded. When discovery
 * fails the known paths are tried in turn, newest first, because a stale single
 * fallback is exactly how this breaks: it stops working the day they rename the
 * route and there is nothing to say so.
 *
 * The request also needs a per-session token and a key/value pair the site fetches
 * from `<endpoint>/init` and echoes back in headers.
 */

/**
 * A current browser string. Worth keeping current: HLTB sits behind a bot filter,
 * and a User-Agent claiming a Chrome release from three years ago is itself a
 * signal. This is not an attempt to defeat anything — the site serves this data
 * to its own front end and this is the same request that front end makes.
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

/**
 * Paths HLTB has served this endpoint from, newest first.
 *
 * Only used when discovery comes up empty. `/api/s` is the current one; the rest
 * are kept because the site has rotated back through old names before and trying
 * a handful of URLs costs nothing next to failing outright.
 */
const KNOWN_PATHS = ["/api/s", "/api/search", "/api/seek", "/api/find", "/api/ouch", "/api/lookup"];

const BASE = "https://howlongtobeat.com";

const browserHeaders = () => ({
  "User-Agent": USER_AGENT,
  Referer: `${BASE}/`,
  Origin: BASE,
  Accept: "*/*",
});

/** Where the site's own code says the search endpoint is. */
async function discoverPath(notes: string[]): Promise<string | null> {
  const res = await fetch(`${BASE}/`, { headers: browserHeaders(), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    notes.push(`home page returned ${res.status}`);
    return null;
  }
  const html = await res.text();
  const scripts: string[] = html.match(/_next\/static\/chunks\/[^"]+\.js/g) || [];
  if (!scripts.length) {
    notes.push("no Next.js chunks in the home page — the site's shape has changed");
    return null;
  }

  // The endpoint is usually named in the app chunk, so look there first.
  const ordered = [...scripts.filter((s) => s.includes("_app")), ...scripts.filter((s) => !s.includes("_app"))];
  const tried = new Set<string>();

  for (const script of ordered.slice(0, 20)) {
    if (tried.has(script)) continue;
    tried.add(script);
    try {
      const scriptRes = await fetch(`${BASE}/${script}`, {
        headers: browserHeaders(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!scriptRes.ok) continue;
      const text = await scriptRes.text();
      const match = text.match(
        /fetch\s*\(\s*["']\/api\/([a-zA-Z0-9_/]+)[^"']*["']\s*,\s*\{[^}]*method:\s*["']POST["'][^}]*\}/i,
      );
      // The WHOLE path, not just its first segment. HLTB currently serves this
      // from a two-segment route, and truncating at the slash turned a working
      // discovery into a 404 — which then looked identical to the site being
      // down, because both end in an empty result.
      if (match?.[1]) {
        notes.push(`discovered /api/${match[1]} in ${script}`);
        return `/api/${match[1]}`;
      }
    } catch {
      // One unreadable chunk is not a failure; there are nineteen more.
    }
  }
  notes.push(`scanned ${tried.size} chunks without finding a POST to /api/…`);
  return null;
}

interface HltbAuth { token: string; key: string; value: string; }

/** The per-session credentials the search call has to echo back. */
async function fetchAuth(path: string, notes: string[]): Promise<HltbAuth | null> {
  const res = await fetch(`${BASE}${path}/init?t=${Date.now()}`, {
    headers: browserHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    notes.push(`${path}/init returned ${res.status}`);
    return null;
  }
  let data: any;
  try {
    data = await res.json();
  } catch {
    notes.push(`${path}/init did not return JSON — likely a bot-check page`);
    return null;
  }

  let key = "";
  let value = "";
  for (const k of Object.keys(data || {})) {
    if (/key/i.test(k)) key = data[k];
    else if (/val/i.test(k)) value = data[k];
  }
  if (!data?.token || !key || !value) {
    notes.push(`${path}/init answered but without a token/key/val (keys: ${Object.keys(data || {}).join(", ") || "none"})`);
    return null;
  }
  notes.push(`authenticated against ${path}`);
  return { token: data.token, key, value };
}

function searchBody(query: string, auth: HltbAuth) {
  const payload: any = {
    searchType: "games",
    searchTerms: query.split(" ").filter(Boolean),
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform: "",
        sortCategory: "popular",
        rangeCategory: "main",
        rangeTime: { min: 0, max: 0 },
        gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
        rangeYear: { max: "", min: "" },
        modifier: "",
      },
      users: { sortCategory: "postcount" },
      lists: { sortCategory: "follows" },
      filter: "",
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };
  payload[auth.key] = auth.value;
  return payload;
}

/** Seconds to whole hours, which is the only precision the app displays. */
const hours = (seconds: any) => (Number.isFinite(Number(seconds)) ? Math.round(Number(seconds) / 3600) : 0);

export interface HltbResult {
  gameplayMain: number;
  gameplayMainExtra: number;
  gameplayCompletionist: number;
  gameName: string;
  gameId: number;
}

/**
 * Runs the search, recording every step into `notes`.
 *
 * The notes are the point. This endpoint breaks by design — HLTB moves it — and
 * a caller that only ever sees an empty array cannot tell "no such game" from
 * "the route moved again", which are the same symptom and completely different
 * problems.
 */
async function search(query: string, notes: string[]): Promise<HltbResult[]> {
  const discovered = await discoverPath(notes);
  // Discovery first, then the known paths — minus whatever discovery already
  // gave us, so a working guess is never tried twice.
  const candidates = [discovered, ...KNOWN_PATHS.filter((p) => p !== discovered)].filter(Boolean) as string[];

  for (const path of candidates) {
    const auth = await fetchAuth(path, notes);
    if (!auth) continue;

    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        ...browserHeaders(),
        "Content-Type": "application/json",
        "x-auth-token": auth.token,
        "x-hp-key": auth.key,
        "x-hp-val": auth.value,
      },
      body: JSON.stringify(searchBody(query, auth)),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      notes.push(`POST ${path} returned ${res.status}`);
      continue;
    }

    const json: any = await res.json().catch(() => null);
    const rows: any[] = Array.isArray(json?.data) ? json.data : [];
    if (!json) {
      notes.push(`POST ${path} did not return JSON`);
      continue;
    }
    notes.push(`POST ${path} returned ${rows.length} result(s)`);

    return rows.map((item) => ({
      gameplayMain: hours(item.comp_main),
      gameplayMainExtra: hours(item.comp_plus),
      gameplayCompletionist: hours(item.comp_100),
      gameName: item.game_name,
      gameId: item.game_id,
    }));
  }

  notes.push("every candidate path failed");
  return [];
}

async function hltbSearch(query: string): Promise<HltbResult[]> {
  const notes: string[] = [];
  try {
    const results = await search(query, notes);
    // Only worth logging when it produced nothing: that is the case someone will
    // come asking about, and the trail is otherwise gone by then.
    if (!results.length) console.warn(`[hltb] No playtime for "${query}" — ${notes.join(" · ")}`);
    return results;
  } catch (err) {
    console.error(`[hltb] Search failed for "${query}" — ${notes.join(" · ")}`, err);
    return [];
  }
}

/**
 * The same search, with its working shown. Mirrors the GameStoryLog diagnose
 * endpoint: when playtimes stop arriving this says which step broke, rather than
 * leaving someone to guess between a moved route, a bot check and a bad title.
 */
async function diagnose(query = "Portal 2") {
  const notes: string[] = [];
  const started = Date.now();
  try {
    const results = await search(query, notes);
    return {
      ok: results.length > 0,
      query,
      ms: Date.now() - started,
      results: results.slice(0, 3),
      knownPaths: KNOWN_PATHS,
      steps: notes,
    };
  } catch (err: any) {
    return {
      ok: false,
      query,
      ms: Date.now() - started,
      error: String(err?.message || err),
      knownPaths: KNOWN_PATHS,
      steps: notes,
    };
  }
}

export { hltbSearch, diagnose };
