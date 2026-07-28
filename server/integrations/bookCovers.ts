import { imageSize } from "../lib/imageSize";

/**
 * Getting a book cover that is actually worth looking at.
 *
 * Google Books search results only ever carry `smallThumbnail` and `thumbnail`
 * — around 80 and 128 pixels wide, complete with a fake page-curl graphic
 * burned into the corner. That is what was being saved, and at the size a media
 * card renders it, it shows.
 *
 * Two things are available and were not being used. The single-volume endpoint
 * returns `small` / `medium` / `large` / `extraLarge` links for many volumes,
 * and the content URL those links share takes a zoom parameter that maps to
 * progressively larger renders. Neither is reliable per-volume: the big keys are
 * often absent, and an unavailable zoom level answers with a placeholder rather
 * than an error.
 *
 * So nothing here is trusted. Candidates are generated cheaply, then fetched and
 * measured from their header bytes, and the widest real image wins. That means
 * the exact behaviour of any one source can change without this breaking — a
 * candidate that stops working simply stops measuring large.
 */

export interface CoverCandidate {
  url: string;
  /** Where the URL came from, for logging and for the API response. */
  source: string;
  /**
   * The known-good cover, measured first so the others can be checked against
   * its shape. This is Google's own thumbnail: tiny, but unquestionably the
   * right artwork.
   */
  isReference?: boolean;
  /**
   * Whether this URL is supposed to be the *same* artwork as the reference.
   * True for Google's own renders, false for another catalogue's edition, which
   * may legitimately be a different cover with a different shape.
   */
  strictShape?: boolean;
}

export interface ResolvedCover {
  url: string;
  width: number;
  height: number;
  source: string;
}

/** Below this a cover is thumbnail-grade and worth replacing. */
export const LOW_RES_WIDTH = 300;
/** Tall enough that hunting further is not worth the requests. */
const GOOD_ENOUGH_HEIGHT = 900;
const MAX_PROBES = 8;

/**
 * What a book cover can plausibly look like, as width / height.
 *
 * Used when there is no reference to compare against. Covers are portrait;
 * anything wider than it is tall is something else entirely.
 */
const MIN_RATIO = 0.4;
const MAX_RATIO = 1.05;
/** How far a render of the *same* artwork may drift from the reference shape. */
const SHAPE_TOLERANCE = 0.15;
const PROBE_TIMEOUT_MS = 8000;
/** A cover is at most a couple of MB; anything larger is not a cover. */
const MAX_BYTES = 8 * 1024 * 1024;

const https = (u: string) => u.replace(/^http:/, "https:");

/**
 * Strips the page-curl overlay and pins a zoom level on a Google content URL.
 * The curl is a decoration drawn into the bitmap, so it survives being scaled up
 * and looks like an artefact on a large cover.
 */
function googleContentUrl(base: string, zoom: number): string {
  const u = https(base)
    .replace(/&?edge=curl/g, "")
    .replace(/&?zoom=\d+/g, "");
  return `${u}${u.includes("?") ? "&" : "?"}zoom=${zoom}`;
}

/**
 * Every URL worth trying for one volume, widest-first.
 *
 * `volume` is the payload from /volumes/{id}; passing the search-result item
 * works too, it just contributes fewer candidates.
 */
export function candidateCovers(volume: any, fallbackThumbnail?: string): CoverCandidate[] {
  const info = volume?.volumeInfo || volume || {};
  const links = info.imageLinks || {};
  const out: CoverCandidate[] = [];
  const seen = new Set<string>();
  const add = (url: string | undefined, source: string, opts: Partial<CoverCandidate> = {}) => {
    if (!url) return;
    const clean = https(url).replace(/&?edge=curl/g, "");
    if (seen.has(clean)) return;
    seen.add(clean);
    out.push({ url: clean, source, ...opts });
  };

  // The reference goes first: Google's own thumbnail is small but is definitely
  // this book's cover, so measuring it gives every other candidate a shape to be
  // checked against.
  const base = links.thumbnail || links.smallThumbnail || fallbackThumbnail;
  add(base, "google:thumbnail", { isReference: true, strictShape: true });

  // The named links, largest first. Present for some volumes, absent for many.
  add(links.extraLarge, "google:extraLarge", { strictShape: true });
  add(links.large, "google:large", { strictShape: true });
  add(links.medium, "google:medium", { strictShape: true });
  add(links.small, "google:small", { strictShape: true });

  // Open Library, keyed by ISBN. No key needed, and its -L covers are often
  // larger than anything Google will serve. default=false makes a missing cover
  // a 404 instead of a 1x1 placeholder — though it is measured either way.
  const isbns: string[] = (info.industryIdentifiers || [])
    .filter((i: any) => i?.identifier && /ISBN/i.test(i.type || ""))
    .map((i: any) => String(i.identifier).replace(/[^0-9Xx]/g, ""))
    // ISBN-13 first: it is what modern editions are catalogued under.
    .sort((a: string, b: string) => b.length - a.length);
  for (const isbn of isbns.slice(0, 2)) {
    // Not shape-checked against the reference: Open Library may hold a different
    // edition, whose cover is a different picture at a different aspect ratio.
    // It still has to look like a book cover at all.
    add(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`, "openlibrary", { strictShape: false });
  }

  // The same content endpoint at larger zooms. Which levels exist varies per
  // volume, and a level that has no full-size render answers with something else
  // entirely — for House of Leaves, zoom=6 returns a 1280px-wide band of the
  // title lettering rather than the cover. Measuring the pixels is not enough to
  // catch that; it is caught by the shape check, since a cover is portrait and
  // that band is six times wider than it is tall.
  if (base && base.includes("books.google")) {
    for (const zoom of [6, 4, 3, 2]) add(googleContentUrl(base, zoom), `google:zoom${zoom}`, { strictShape: true });
  }

  return out;
}

/** Fetches just enough of an image to read its dimensions. */
async function measure(url: string): Promise<ResolvedCover | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { "User-Agent": "FauxLoreMediaTracker/1.0" },
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") || "").startsWith("image/")) return null;
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BYTES) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return null;
    const size = imageSize(buf);
    if (!size) return null;
    // Sources answer "no cover" with a 1x1 or a tiny spacer rather than a 404.
    if (size.width < 40 || size.height < 40) return null;
    return { url, width: size.width, height: size.height, source: "" };
  } catch {
    return null;
  }
}

/** Does this image have the shape of the cover we are looking for? */
function plausibleCover(
  candidate: CoverCandidate,
  measured: ResolvedCover,
  reference: ResolvedCover | null,
): boolean {
  const ratio = measured.width / measured.height;
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) return false;
  if (candidate.strictShape && reference) {
    const refRatio = reference.width / reference.height;
    if (Math.abs(ratio - refRatio) / refRatio > SHAPE_TOLERANCE) return false;
  }
  return true;
}

/**
 * Returns the largest image that is actually this book's cover.
 *
 * Size alone is not the test. Google's content endpoint answers some zoom levels
 * with a crop — a wide band of the title lettering — which is both large and
 * useless, and it wins on width every time. So the tiny reference thumbnail is
 * measured first purely for its aspect ratio, and anything that is not that
 * shape is discarded no matter how many pixels it has. Ranking is by height,
 * since a cover's height is what its resolution actually means.
 *
 * Returns null only if nothing loaded at all.
 */
export async function resolveBestCover(candidates: CoverCandidate[]): Promise<ResolvedCover | null> {
  const ordered = candidates.slice(0, MAX_PROBES);
  let reference: ResolvedCover | null = null;
  let best: ResolvedCover | null = null;

  for (const candidate of ordered) {
    const measured = await measure(candidate.url);
    if (!measured) continue;
    const scored = { ...measured, source: candidate.source };

    if (candidate.isReference) {
      // The reference is the fallback as well as the yardstick, but only if it
      // is a believable cover itself.
      reference = scored;
      if (plausibleCover(candidate, scored, null) && (!best || scored.height > best.height)) best = scored;
      continue;
    }

    if (!plausibleCover(candidate, scored, reference)) continue;
    if (!best || scored.height > best.height) best = scored;
    if (best.height >= GOOD_ENOUGH_HEIGHT) break;
  }

  // Everything plausible failed to load, but the reference did: better a small
  // real cover than nothing.
  return best || reference;
}

/** Fetches one volume's full record, which carries the larger image links. */
export async function fetchVolume(volumeId: string, apiKey?: string | null): Promise<any | null> {
  try {
    const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(volumeId)}${apiKey ? `?key=${apiKey}` : ""}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { "User-Agent": "FauxLoreMediaTracker/1.0" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * The whole job for one book: look the volume up, try everything, measure, pick.
 * `fallbackThumbnail` is whatever cover is already on the entry, so a volume
 * that can no longer be fetched still contributes its existing URL.
 */
export async function bestCoverForVolume(
  volumeId: string,
  apiKey?: string | null,
  fallbackThumbnail?: string,
): Promise<ResolvedCover | null> {
  const volume = await fetchVolume(volumeId, apiKey);
  const candidates = candidateCovers(volume || {}, fallbackThumbnail);
  if (candidates.length === 0) return null;
  return resolveBestCover(candidates);
}
