/**
 * GameStoryLog (gamestorylog.com) metadata provider.
 *
 * GSL is a community tracker for western / adult visual novels, covering titles VNDB
 * handles poorly. It has no public API, so this reads the same public pages a browser
 * would. Their robots.txt explicitly allows `/games/` and `/browse` for a generic
 * user-agent (and disallows `/api/`, which we therefore never touch).
 *
 * Politeness matters here: GSL is a solo-developer project on free-tier hosting.
 * The design keeps request volume near zero:
 *   - the sitemap (which robots.txt advertises) is fetched once and cached for a day,
 *     giving a local slug index, so *typing a search costs no upstream requests*;
 *   - a game page is fetched only when the user actually picks a result;
 *   - requests are serialised with a delay, and responses are cached.
 */

const BASE = "https://gamestorylog.com";
const UA =
  "FauxLore/1.0 (personal self-hosted media tracker; single-user metadata lookup)";

const SITEMAP_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const PAGE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MIN_REQUEST_GAP_MS = 1000; // never hammer: at most ~1 request/second

export interface GslGame {
  id: string; // slug — stable identifier at the source
  slug: string;
  url: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  developer?: string;
  engine?: string;
  platforms: string[];
  genres: string[];
  tags: string[];
  reviewScore?: number; // 0-5
  averagePlaytime?: number; // hours
  version?: string; // "Season 1: v1.06"
  status?: string; // "Active", "Completed", "Abandoned", ...
  updatedAt?: string; // ISO date of the last upstream update
  year?: number;
}

/* ------------------------------------------------------------------ fetching */

let lastRequestAt = 0;
async function politeFetchRaw(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function politeFetch(url: string): Promise<string> {
  const { ok, status, body } = await politeFetchRaw(url);
  if (!ok) throw new Error(`GSL request failed (${status}) for ${url}`);
  return body;
}

/* -------------------------------------------------------------------- parsing */

/** Decodes the HTML entities that actually show up in this markup. */
function decode(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function stripTags(s: string): string {
  return decode(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

/**
 * GSL renders its metadata as definition-list pairs:
 *   <dt ...>Version</dt><dd ... title="Season 1: v1.06">Season 1: v1.06</dd>
 * The `title` attribute holds the full, untruncated value, so prefer it.
 */
function dtdd(html: string, label: string): string | undefined {
  const re = new RegExp(
    `<dt[^>]*>\\s*${label}\\s*</dt>\\s*<dd([^>]*)>([\\s\\S]*?)</dd>`,
    "i",
  );
  const m = html.match(re);
  if (!m) return undefined;
  const titleAttr = m[1].match(/title="([^"]*)"/i);
  const value = titleAttr ? decode(titleAttr[1]) : stripTags(m[2]);
  return value || undefined;
}

function meta(html: string, prop: string): string | undefined {
  const m =
    html.match(
      new RegExp(`<meta[^>]*property="${prop}"[^>]*content="([^"]*)"`, "i"),
    ) ||
    html.match(
      new RegExp(`<meta[^>]*content="([^"]*)"[^>]*property="${prop}"`, "i"),
    );
  return m ? decode(m[1]) : undefined;
}

/** "Jun 21, 2026" / "June 21, 2026" -> ISO date string. */
function parseDate(s?: string): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** "5hrs 41min" -> 5.68 */
function parsePlaytime(s?: string): number | undefined {
  if (!s) return undefined;
  const h = s.match(/(\d+)\s*h/i);
  const m = s.match(/(\d+)\s*m/i);
  if (!h && !m) return undefined;
  const hours = (h ? parseInt(h[1], 10) : 0) + (m ? parseInt(m[1], 10) / 60 : 0);
  return hours > 0 ? Math.round(hours * 100) / 100 : undefined;
}

/**
 * Parses a public GSL game page. Exported so it can be unit-tested against saved
 * HTML without touching the network.
 */
export function parseGamePage(html: string, slug: string): GslGame {
  const ogTitle = meta(html, "og:title");
  // Titles arrive as "Growing Things Up - GSL | GameStoryLog"
  const title = (ogTitle || slug).replace(/\s*-\s*GSL\s*\|\s*GameStoryLog\s*$/i, "").trim();

  const version = dtdd(html, "Version");
  const status = dtdd(html, "Status");
  const updatedRaw = dtdd(html, "Updated");
  const engine = dtdd(html, "Engine");
  const platformsRaw = dtdd(html, "Platforms");

  // Developer sits behind a /developer/<slug> link
  let developer: string | undefined;
  const devLink = html.match(
    /href="[^"]*\/developer\/[^"]*"[^>]*>([\s\S]{0,400}?)<\/a>/i,
  );
  if (devLink) {
    const text = stripTags(devLink[1]);
    developer = text.split(/\s{2,}|Studio|Developer/i)[0].trim() || undefined;
  }

  // Cover image: predictable CDN path, fall back to og:image
  const coverMatch = html.match(
    /https:\/\/images\.gamestorylog\.com\/game-assets\/covers\/[^"' )]+/i,
  );
  const coverImageUrl = coverMatch ? coverMatch[0] : meta(html, "og:image");

  // Overall rating renders as: <span ...>4.0</span><span ...>/ 5</span>
  let reviewScore: number | undefined;
  const ratingMatch = html.match(/>\s*([\d.]+)\s*<\/span>\s*<span[^>]*>\s*\/\s*5\s*</i);
  if (ratingMatch) {
    const v = parseFloat(ratingMatch[1]);
    if (!isNaN(v) && v >= 0 && v <= 5) reviewScore = v;
  }

  // Average playtime, e.g. "5hrs 41min"
  const playtimeMatch = html.match(/Avg playtime[\s\S]{0,300}?(\d+\s*hrs?(?:\s*\d+\s*min)?)/i);
  const averagePlaytime = parsePlaytime(playtimeMatch?.[1]);

  // Tags are grouped under headings (Content / Genre / Gameplay / Protagonist ...).
  // Genre entries map to FauxLore genres; everything else becomes a tag.
  const { genres, tags } = parseTags(html);

  const updatedAt = parseDate(updatedRaw);

  return {
    id: slug,
    slug,
    url: `${BASE}/games/${slug}`,
    title,
    description: meta(html, "og:description"),
    coverImageUrl,
    developer,
    engine,
    platforms: platformsRaw
      ? platformsRaw.split(",").map((p) => p.trim()).filter(Boolean)
      : [],
    genres,
    tags,
    reviewScore,
    averagePlaytime,
    version,
    status,
    updatedAt,
    // GSL game pages carry no release date, only a last-updated date. Deriving a
    // release year from that would be wrong for long-running AVNs, so leave it unset.
    year: undefined,
  };
}

/** Pulls the tag cloud, splitting the "Genre" group out into genres. */
function parseTags(html: string): { genres: string[]; tags: string[] } {
  const genres: string[] = [];
  const tags: string[] = [];

  // Tag links look like: <a href="/browse?tags=...">Comedy</a>, grouped after a
  // heading such as ">Genre<". Walk the tag section and attribute each link to the
  // most recent heading seen.
  const section = html.match(/>\s*Tags\s*<[\s\S]{0,20000}/i)?.[0] || html;
  const GROUPS = ["Content", "Genre", "Gameplay", "Protagonist", "Art", "Engine"];
  const tokenRe = new RegExp(
    `>\\s*(${GROUPS.join("|")})\\s*<|href="[^"]*(?:/browse\\?[^"]*tag|/tags?/)[^"]*"[^>]*>([^<]{1,60})<`,
    "gi",
  );

  let current = "";
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(section)) !== null) {
    if (m[1]) {
      current = m[1];
      continue;
    }
    const value = decode(m[2] || "");
    if (!value || value.length > 50) continue;
    if (current === "Genre") {
      if (!genres.includes(value)) genres.push(value);
    } else if (!tags.includes(value)) {
      tags.push(value);
    }
  }
  return { genres, tags };
}

/* -------------------------------------------------------------- sitemap index */

interface SitemapEntry {
  slug: string;
  lastmod?: string;
}
let sitemapCache: { fetchedAt: number; entries: SitemapEntry[] } | null = null;

/**
 * The slug index, from the sitemap robots.txt advertises. Cached for a day so that
 * searching costs nothing upstream.
 */
/** Pulls every /games/<slug> out of one sitemap document. */
function extractGameEntries(xml: string, into: Map<string, SitemapEntry>) {
  const urlRe = /<url>([\s\S]*?)<\/url>/gi;
  let block: RegExpExecArray | null;
  while ((block = urlRe.exec(xml)) !== null) {
    const loc = block[1].match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
    const slug = loc?.match(/\/games\/([^/?#"'<>\s]+)\/?$/i)?.[1];
    if (slug && !into.has(slug)) {
      into.set(slug, { slug, lastmod: block[1].match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1] });
    }
  }
  // Some sitemaps omit <url> wrappers; fall back to a flat <loc> scan.
  const locRe = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = locRe.exec(xml)) !== null) {
    const slug = m[1].match(/\/games\/([^/?#"'<>\s]+)\/?$/i)?.[1];
    if (slug && !into.has(slug)) into.set(slug, { slug });
  }
}

/**
 * The slug index, from the sitemap robots.txt advertises. Cached for a day so that
 * searching costs nothing upstream.
 *
 * Handles sitemap *indexes* (a sitemap listing other sitemaps), which is how sites
 * with many pages usually organise this — otherwise the top level contains no game
 * URLs at all and the index comes back empty.
 */
export async function getSitemapIndex(force = false): Promise<SitemapEntry[]> {
  if (!force && sitemapCache && Date.now() - sitemapCache.fetchedAt < SITEMAP_TTL_MS) {
    return sitemapCache.entries;
  }
  const found = new Map<string, SitemapEntry>();
  const root = await politeFetch(`${BASE}/sitemap.xml`);
  extractGameEntries(root, found);

  // If this is an index (or simply yielded nothing), walk the child sitemaps.
  if (found.size === 0 || /<sitemapindex/i.test(root)) {
    const children: string[] = [];
    const childRe = /<sitemap>([\s\S]*?)<\/sitemap>/gi;
    let c: RegExpExecArray | null;
    while ((c = childRe.exec(root)) !== null) {
      const loc = c[1].match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
      if (loc) children.push(loc);
    }
    // Fall back to any .xml <loc> if the <sitemap> wrappers are absent
    if (children.length === 0) {
      const locRe = /<loc>\s*([^<]+?\.xml[^<]*?)\s*<\/loc>/gi;
      let m: RegExpExecArray | null;
      while ((m = locRe.exec(root)) !== null) children.push(m[1]);
    }
    for (const child of children.slice(0, 25)) {
      try {
        extractGameEntries(await politeFetch(child), found);
      } catch (e) {
        console.error(`[gsl] Failed to read child sitemap ${child}`, e);
      }
    }
  }

  const entries = Array.from(found.values());
  sitemapCache = { fetchedAt: Date.now(), entries };
  return entries;
}

/** Best-effort slug for a title, matching GSL's own slug style ("Being a DIK" -> "being-a-dik"). */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Turns a slug back into a human-readable title for search display. */
function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Scores a slug against a query. Higher is better; 0 means no match. */
function score(query: string, slug: string): number {
  const q = normalise(query);
  const s = normalise(slugToTitle(slug));
  if (!q) return 0;
  if (s === q) return 100;
  if (s.startsWith(q)) return 80;
  if (s.includes(q)) return 60;
  // all query words present, in any order
  const words = q.split(" ").filter(Boolean);
  if (words.length > 1 && words.every((w) => s.includes(w))) return 40;
  return 0;
}

/**
 * Searches GSL by matching against the locally cached slug index — no upstream
 * request per keystroke. Returns lightweight results; details are fetched on demand.
 */
export interface GslCandidate {
  id: string;
  slug: string;
  title: string;
  url: string;
  lastmod?: string;
  /** false when the slug was guessed from the title and must be confirmed by fetching it. */
  verified: boolean;
}

export async function searchGames(query: string, limit = 20): Promise<GslCandidate[]> {
  const out: GslCandidate[] = [];
  const seen = new Set<string>();

  const push = (slug: string, verified: boolean, lastmod?: string) => {
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    out.push({ id: slug, slug, title: slugToTitle(slug), url: `${BASE}/games/${slug}`, lastmod, verified });
  };

  // The sitemap index is the cheap path, but it can be unavailable or incomplete.
  // Never let that failure swallow the whole search.
  let entries: SitemapEntry[] = [];
  try {
    entries = await getSitemapIndex();
  } catch (e) {
    console.error("[gsl] Sitemap unavailable, falling back to direct slug lookup", e);
  }

  entries
    .map((e) => ({ entry: e, s: score(query, e.slug) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.entry.slug.length - b.entry.slug.length)
    .slice(0, limit)
    .forEach((r) => push(r.entry.slug, true, r.entry.lastmod));

  // GSL slugs are a direct transliteration of the title, so a guessed slug resolves
  // most exact searches even when the sitemap gives us nothing. Unverified until fetched.
  push(titleToSlug(query), false);

  return out.slice(0, limit);
}

/**
 * Reports what the integration can actually see upstream. Used by /api/gsl/diagnose
 * to distinguish "sitemap has no game URLs" from "pages don't render server-side".
 */
export async function diagnose(sampleQuery = "Being a DIK") {
  const report: Record<string, any> = { base: BASE };
  try {
    const r = await politeFetchRaw(`${BASE}/sitemap.xml`);
    report.sitemap = {
      status: r.status,
      bytes: r.body.length,
      isIndex: /<sitemapindex/i.test(r.body),
      urlCount: (r.body.match(/<loc>/gi) || []).length,
      firstLocs: (r.body.match(/<loc>\s*([^<]+?)\s*<\/loc>/gi) || []).slice(0, 5),
    };
  } catch (e: any) {
    report.sitemap = { error: String(e?.message || e) };
  }
  try {
    const entries = await getSitemapIndex(true);
    report.slugsFound = entries.length;
    report.sampleSlugs = entries.slice(0, 5).map((e) => e.slug);
  } catch (e: any) {
    report.slugsFound = { error: String(e?.message || e) };
  }
  const slug = titleToSlug(sampleQuery);
  try {
    const r = await politeFetchRaw(`${BASE}/games/${slug}`);
    const parsed = r.ok ? parseGamePage(r.body, slug) : null;
    report.directPage = {
      slug,
      status: r.status,
      bytes: r.body.length,
      // If the page is a client-rendered shell these will be missing even on a 200.
      serverRendered: !!(parsed?.version || parsed?.developer || parsed?.platforms.length),
      parsedTitle: parsed?.title,
      parsedVersion: parsed?.version,
      parsedDeveloper: parsed?.developer,
    };
  } catch (e: any) {
    report.directPage = { slug, error: String(e?.message || e) };
  }
  return report;
}

/* --------------------------------------------------------------- game details */

const pageCache = new Map<string, { fetchedAt: number; game: GslGame }>();

/** Fetches and parses a single game page, with a short-lived cache. */
export async function getGameDetails(slug: string, force = false): Promise<GslGame> {
  const cached = pageCache.get(slug);
  if (!force && cached && Date.now() - cached.fetchedAt < PAGE_TTL_MS) {
    return cached.game;
  }
  const html = await politeFetch(`${BASE}/games/${slug}`);
  const game = parseGamePage(html, slug);
  pageCache.set(slug, { fetchedAt: Date.now(), game });
  return game;
}
