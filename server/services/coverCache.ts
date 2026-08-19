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
 * Cover art is portrait. Every source this app talks to returns something
 * between a squat paperback and a tall poster, so anything outside that range is
 * not a cover — which is exactly how the MangaDex placeholder is caught, since
 * it is a wide banner. Rejecting it matters more than it sounds: without this
 * check the first fix would cache the banner permanently.
 */
const MIN_RATIO = 0.45;
const MAX_RATIO = 0.95;
const MIN_WIDTH = 80;

export interface CoverCacheResult {
  /** The path to serve, or the original URL when it could not be cached. */
  url: string;
  cached: boolean;
  reason?: string;
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

const EXT_BY_TYPE: Record<string, string> = {
  jpeg: ".jpg", jpg: ".jpg", png: ".png", gif: ".gif", webp: ".webp",
};

export function createCoverCache({ coversDir }: { coversDir: string }) {
  /** Same URL, same file — so re-saving an entry costs nothing. */
  function fileNameFor(url: string, ext: string): string {
    return crypto.createHash("sha1").update(url).digest("hex") + ext;
  }

  function existingCopy(url: string): string | null {
    for (const ext of [".jpg", ".png", ".webp", ".gif"]) {
      const name = fileNameFor(url, ext);
      if (fs.existsSync(path.join(coversDir, name))) return `/uploads/covers/${name}`;
    }
    return null;
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

      const ext = EXT_BY_TYPE[(imageSize(buf)?.type || "").toLowerCase()] || ".jpg";
      const name = fileNameFor(url, ext);
      fs.writeFileSync(path.join(coversDir, name), buf);
      return { url: `/uploads/covers/${name}`, cached: true };
    } catch (e: any) {
      return { url, cached: false, reason: String(e?.message || e) };
    }
  }

  return { cacheCover, existingCopy };
}

export type CoverCache = ReturnType<typeof createCoverCache>;
