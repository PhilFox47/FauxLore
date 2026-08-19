import crypto from "crypto";
import fs from "fs";
import path from "path";
import { imageSize } from "../lib/imageSize";
import { isPublicHost } from "../lib/publicHost";

/**
 * Keeps a local copy of remote cover art.
 *
 * Written for MangaDex, which answers a request for a cover with a "read this
 * at MangaDex" banner unless it likes the look of it. Setting the browser's
 * referrer policy is not enough — their protection is applied at the CDN and a
 * third-party origin can lose either way — and their own guidance is that
 * applications should serve the images themselves rather than hotlink them.
 *
 * Fetching server-side sidesteps the whole question: no browser origin is
 * involved, the request carries whatever headers we choose, and afterwards the
 * file is ours. That also fixes three things that were never MangaDex-specific:
 * covers stop disappearing when a source reorganises its CDN, canvas exports
 * (the wallpapers) stop needing the image proxy, and a cover loads once instead
 * of on every render.
 */

/** A browser-ish identity. A bare Node fetch is refused by several CDNs. */
const USER_AGENT =
  "Mozilla/5.0 (compatible; FauxLore/1.0; +https://github.com/PhilFox47/FauxLore) AppleWebKit/537.36";

const MAX_BYTES = 8 * 1024 * 1024;
const MIN_BYTES = 1024;

/**
 * MangaDex's hotlink placeholder is SQUARE. Cover art never is.
 *
 * That one fact is what catches the placeholder on the very first fetch, before
 * there is anything to compare it against, and it holds no matter what size the
 * CDN renders it at. It is checked separately from the ratio band below rather
 * than left to fall out of it, because it is a specific known signal and should
 * survive anyone widening those bounds later — a square cover would otherwise
 * start being cached again with nothing to say it had.
 */
const SQUARE_TOLERANCE = 0.03;

/**
 * Cover art is portrait. Every source this app talks to returns something
 * between a squat paperback and a tall poster.
 *
 * Broader than the square rule and doing a different job: this catches a banner,
 * an error graphic or a letterboxed screenshot from any provider. Neither check
 * can catch a portrait placeholder, which is what `isCannedResponse` is for.
 */
const MIN_RATIO = 0.45;
const MAX_RATIO = 0.95;
const MIN_WIDTH = 80;

export interface CoverCacheResult {
  /** The path to serve, or the original URL when it could not be cached. */
  url: string;
  cached: boolean;
  reason?: string;
  /**
   * Covers already on disk that this fetch proved were placeholders. The caller
   * must put these entries back to their remote URL — they were cached before
   * there was a second sample to compare against.
   */
  evicted?: { localPath: string; sourceUrl: string }[];
}

/** Whether a URL is something we could take a local copy of. */
export function isRemoteCover(url?: string | null): boolean {
  return !!url && /^https?:\/\//i.test(url);
}

/** Whether a stored image is shaped like cover art rather than a placeholder. */
export function looksLikeCover(buf: Buffer): { ok: boolean; reason?: string } {
  const size = imageSize(buf);
  if (!size) return { ok: false, reason: "unrecognised image format" };
  if (size.width < MIN_WIDTH) return { ok: false, reason: `too small (${size.width}px wide)` };

  const ratio = size.width / size.height;
  if (Math.abs(ratio - 1) <= SQUARE_TOLERANCE) {
    return {
      ok: false,
      reason: `square (${size.width}x${size.height}) — cover art is not, so this is a hotlink placeholder`,
    };
  }
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) {
    return { ok: false, reason: `not cover-shaped (${size.width}x${size.height})` };
  }
  return { ok: true };
}

/** Headers that get a cover out of a host rather than a scolding. */
function headersFor(url: string): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "image/*,*/*" };
  // MangaDex serves the real file to its own origin. We are not a browser, so
  // there is no origin to lie about — this is just the header it wants to see.
  if (/(^|\.)mangadex\.org$/i.test(new URL(url).hostname)) {
    headers.Referer = "https://mangadex.org/";
  }
  return headers;
}

/**
 * The backstop, for a placeholder that is not square.
 *
 * MangaDex's is, and the shape check gets it on the first fetch. Another
 * provider's — or a changed one — might not be, so there is a second rule that
 * needs no knowledge of what the thing looks like: a cover is unique, and a
 * canned response is not. The moment two different source URLs hand us identical
 * content, that content is not cover art whatever it depicts, and every copy of
 * it already on disk is wrong too.
 *
 * Recording the hash of what we stored is enough to catch that, and once caught
 * the hash is remembered so it is refused outright next time.
 */
interface CoverIndex {
  /** Content hashes known to be canned responses rather than cover art. */
  banned: string[];
  /** sha1(sourceUrl) -> what we stored for it. */
  urls: Record<string, { content: string; src: string; ext: string }>;
}

const EXT_BY_TYPE: Record<string, string> = {
  jpeg: ".jpg", jpg: ".jpg", png: ".png", gif: ".gif", webp: ".webp",
};

export function createCoverCache({ coversDir }: { coversDir: string }) {
  const indexPath = path.join(coversDir, "index.json");

  function readIndex(): CoverIndex {
    try {
      const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      return { banned: parsed.banned || [], urls: parsed.urls || {} };
    } catch {
      return { banned: [], urls: {} };
    }
  }

  function writeIndex(index: CoverIndex) {
    try {
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    } catch (e) {
      console.error("Could not write the cover index", e);
    }
  }

  const hash = (v: string | Buffer) => crypto.createHash("sha1").update(v).digest("hex");
  const localPath = (content: string, ext: string) => `/uploads/covers/${content}${ext}`;

  function existingCopy(url: string): string | null {
    const entry = readIndex().urls[hash(url)];
    if (!entry) return null;
    return fs.existsSync(path.join(coversDir, entry.content + entry.ext))
      ? localPath(entry.content, entry.ext)
      : null;
  }

  /**
   * Whether this body is a canned response rather than a cover, judged only by
   * having seen it before under a different URL.
   *
   * Returns everything that has to be undone: the file is deleted, the hash is
   * banned so no future fetch can reintroduce it, and every entry that already
   * points at it is handed back for the caller to reset.
   */
  function isCannedResponse(index: CoverIndex, urlKey: string, content: string): {
    canned: boolean;
    evicted: { localPath: string; sourceUrl: string }[];
  } {
    if (index.banned.includes(content)) return { canned: true, evicted: [] };

    const clashes = Object.entries(index.urls).filter(
      ([key, entry]) => entry.content === content && key !== urlKey,
    );
    if (!clashes.length) return { canned: false, evicted: [] };

    // Two different works cannot share a cover. Everything holding these bytes
    // is wrong, including whatever we wrote the first time.
    index.banned.push(content);
    const evicted = clashes.map(([key, entry]) => {
      delete index.urls[key];
      try { fs.unlinkSync(path.join(coversDir, entry.content + entry.ext)); } catch { /* already gone */ }
      return { localPath: localPath(entry.content, entry.ext), sourceUrl: entry.src };
    });
    return { canned: true, evicted };
  }

  /**
   * Takes a local copy of one cover. Never throws: a cover that cannot be
   * cached falls back to its remote URL, which is what the app did before.
   */
  async function cacheCover(url?: string | null): Promise<CoverCacheResult> {
    if (!url) return { url: "", cached: false, reason: "no url" };
    if (!isRemoteCover(url)) return { url, cached: false, reason: "already local" };

    const already = existingCopy(url);
    if (already) return { url: already, cached: true };

    try {
      // The URL arrives on a media entry, so it is client-supplied: this must
      // not become a way to make the server fetch things on its own network.
      const host = new URL(url).hostname;
      if (!(await isPublicHost(host))) return { url, cached: false, reason: "host not allowed" };

      const res = await fetch(url, {
        headers: headersFor(url),
        redirect: "follow",
        // Short on purpose: this runs inline when an entry is saved, so a
        // slow or unreachable host must not hold up the Add Media dialog.
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return { url, cached: false, reason: `upstream ${res.status}` };

      const type = res.headers.get("content-type") || "";
      if (!type.startsWith("image/")) return { url, cached: false, reason: `not an image (${type})` };

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) return { url, cached: false, reason: "too large" };
      if (buf.byteLength < MIN_BYTES) return { url, cached: false, reason: "suspiciously small" };

      const shape = looksLikeCover(buf);
      if (!shape.ok) return { url, cached: false, reason: shape.reason };

      const index = readIndex();
      const urlKey = hash(url);
      const content = hash(buf);

      const canned = isCannedResponse(index, urlKey, content);
      if (canned.canned) {
        writeIndex(index);
        return {
          url,
          cached: false,
          reason: "the same image is being served for other covers too — this looks like a hotlink placeholder",
          evicted: canned.evicted,
        };
      }

      const ext = EXT_BY_TYPE[(imageSize(buf)?.type || "").toLowerCase()] || ".jpg";
      fs.writeFileSync(path.join(coversDir, content + ext), buf);
      index.urls[urlKey] = { content, src: url, ext };
      writeIndex(index);
      return { url: localPath(content, ext), cached: true };
    } catch (e: any) {
      return { url, cached: false, reason: String(e?.message || e) };
    }
  }

  return { cacheCover, existingCopy };
}

export type CoverCache = ReturnType<typeof createCoverCache>;
