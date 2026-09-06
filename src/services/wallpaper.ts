import { apiFetch } from './db';
import { BRAND_LOGO_STACKED_URL, BRAND_LOGO_WIDE_URL } from '../lib/brand';

/**
 * The recap as something you can actually put on a screen.
 *
 * A mosaic of the covers from the period, tilted like the login backdrop, with
 * the wordmark and the period set over it. The one rule that makes it a recap
 * rather than wallpaper-shaped noise: what you spent the most time on drifts
 * toward the middle, so the centre of the image is the centre of your month.
 *
 * Everything is composited in a canvas on the client. That means the covers
 * have to come from this origin — a canvas that has drawn a cross-origin image
 * refuses to export — which is what /api/image-proxy is for.
 */

export type WallpaperFormat = 'desktop' | 'mobile';

export interface WallpaperSpec {
  width: number;
  height: number;
  label: string;
  ratio: string;
  logoUrl: string;
  /** Logo width as a share of the canvas. */
  logoShare: number;
  /** Smallest and largest tile width, as a share of the canvas width. */
  tileMin: number;
  tileMax: number;
}

export const WALLPAPER_SPECS: Record<WallpaperFormat, WallpaperSpec> = {
  desktop: {
    width: 3840, height: 2160, label: 'Desktop', ratio: '16:9',
    logoUrl: BRAND_LOGO_WIDE_URL, logoShare: 0.36,
    tileMin: 1 / 22, tileMax: 1 / 4,
  },
  mobile: {
    width: 1080, height: 2400, label: 'Mobile', ratio: '20:9',
    logoUrl: BRAND_LOGO_STACKED_URL, logoShare: 0.62,
    tileMin: 1 / 8, tileMax: 1 / 2,
  },
};

export interface WallpaperSource {
  url: string;
  /** Master pages logged against this title in the period — decides how central it sits. */
  pages: number;
}

/** The mosaic is tilted, like the login backdrop. */
const ANGLE = (-6 * Math.PI) / 180;
const GAP_RATIO = 0.085;
const COVER_ASPECT = 1.5; // covers are 2:3
/** How far a title can drift from its rank. 0 = a strict popularity gradient. */
const SHUFFLE = 0.38;

/**
 * Loads a cover so the canvas stays exportable.
 *
 * A canvas that has drawn a cross-origin image refuses to export, which is
 * what /api/image-proxy is for — but a cover already served from our own
 * origin (everything the cover cache has downloaded, stored as a root-relative
 * `/uploads/covers/...` path) is same-origin already and does not need it.
 * Routing one through the proxy anyway used to be silently fatal rather than
 * merely wasteful: `new URL(raw)` throws on a path with no protocol or host,
 * so every locally-cached cover failed to load and only whichever titles
 * still carried an original external URL (not yet cached) made it into the
 * mosaic — the same handful of posters on every wallpaper, whatever the
 * period, because the failure was systemic rather than week-specific.
 */
async function loadProxied(url: string): Promise<HTMLImageElement | null> {
  const isSameOrigin = url.startsWith('/') && !url.startsWith('//');
  let objectUrl: string | null = null;
  try {
    let src: string;
    if (isSameOrigin) {
      src = url;
    } else {
      const res = await apiFetch(`/api/image-proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      src = objectUrl;
    }
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode failed'));
      img.src = src;
    });
    await img.decode?.().catch(() => {});
    return img;
  } catch {
    return null;
  } finally {
    // Safe once the image has decoded; the bitmap is retained independently.
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl as string), 30_000);
  }
}

/** Draws an image into a rect the way `object-fit: cover` would. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface Cell { cx: number; cy: number; dist: number }

/**
 * Lays out the grid in the tilted frame.
 *
 * The tile size is derived from how many covers there are rather than fixed, so
 * a quiet month gets a handful of large covers and a whole year gets a dense
 * mosaic — and, within the clamps, nothing has to be shown twice.
 */
function buildGrid(spec: WallpaperSpec, count: number) {
  const { width: W, height: H } = spec;
  const cos = Math.cos(ANGLE);
  const sin = Math.abs(Math.sin(ANGLE));
  // Exactly the area a tilted rect must cover to leave no corner empty.
  const overW = W * cos + H * sin;
  const overH = H * cos + W * sin;

  const minTile = W * spec.tileMin;
  const maxTile = W * spec.tileMax;
  const cellsFor = (tw: number) => {
    const cols = Math.ceil(overW / (tw * (1 + GAP_RATIO)));
    const rows = Math.ceil(overH / (tw * COVER_ASPECT * (1 + GAP_RATIO)));
    return { cols, rows, total: cols * rows };
  };

  // The largest tile that still leaves a cell for every cover.
  let tile = minTile;
  for (let t = maxTile; t >= minTile; t -= W * 0.004) {
    if (cellsFor(t).total >= count) { tile = t; break; }
  }
  tile = Math.min(maxTile, Math.max(minTile, tile));

  const { cols, rows } = cellsFor(tile);
  const tw = tile;
  const th = tile * COVER_ASPECT;
  const stepX = tw * (1 + GAP_RATIO);
  const stepY = th * (1 + GAP_RATIO);

  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c - (cols - 1) / 2) * stepX;
      const cy = (r - (rows - 1) / 2) * stepY;
      // Normalised so distance means the same thing on a 16:9 and a 20:9 canvas.
      cells.push({ cx, cy, dist: Math.hypot(cx / overW, cy / overH) });
    }
  }
  cells.sort((a, b) => a.dist - b.dist);
  return { cells, tw, th };
}

/**
 * Orders the covers so the heaviest ones land in the middle cells — but only
 * usually. A strict sort by master pages draws a bullseye of popularity, which
 * looks computed rather than composed, so each title is nudged by a random
 * fraction of the list length before the cells are handed out.
 */
function orderByWeight<T extends WallpaperSource>(sources: T[]): T[] {
  const ranked = [...sources].sort((a, b) => b.pages - a.pages);
  const n = ranked.length;
  return ranked
    .map((s, i) => ({ s, key: i + Math.random() * n * SHUFFLE }))
    .sort((a, b) => a.key - b.key)
    .map((e) => e.s);
}

export interface Placement<T> { source: T; cx: number; cy: number; dist: number }

/**
 * Decides tile size and which cover goes in which cell — the whole layout, with
 * no canvas involved, so the centrality rule can be measured rather than
 * eyeballed.
 */
export function planPlacement<T extends WallpaperSource>(sources: T[], spec: WallpaperSpec) {
  const ordered = orderByWeight(sources);
  const { cells, tw, th } = buildGrid(spec, ordered.length);
  const placements: Placement<T>[] = cells.map((cell, i) => ({
    // More cells than covers only happens at the size clamps; cycling rather
    // than picking at random keeps any repeat as far from its twin as possible.
    source: ordered[i % ordered.length],
    cx: cell.cx,
    cy: cell.cy,
    dist: cell.dist,
  }));
  return { placements, tw, th };
}

export interface WallpaperResult {
  blob: Blob;
  /** A small JPEG of the same image, for showing on the page. */
  previewUrl: string;
  width: number;
  height: number;
  /** How many distinct covers made it in — some URLs fail to load. */
  coversUsed: number;
}

/**
 * Composites the wallpaper. `subtitle` is the period it covers, set under the
 * wordmark so the file still means something a year later.
 */
export async function renderWallpaper(
  sources: WallpaperSource[],
  format: WallpaperFormat,
  subtitle: string,
): Promise<WallpaperResult> {
  const spec = WALLPAPER_SPECS[format];
  const { width: W, height: H } = spec;

  const unique = new Map<string, WallpaperSource>();
  sources.forEach((s) => {
    if (!s.url) return;
    const prev = unique.get(s.url);
    if (!prev || s.pages > prev.pages) unique.set(s.url, s);
  });

  const loaded = await Promise.all(
    [...unique.values()].map(async (s) => ({ ...s, img: await loadProxied(s.url) })),
  );
  const usable = loaded.filter((s) => s.img) as (WallpaperSource & { img: HTMLImageElement })[];
  if (usable.length === 0) throw new Error('None of the covers for this period could be loaded.');

  const { placements, tw, th } = planPlacement(usable, spec);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not give us a canvas to draw on.');

  ctx.fillStyle = '#09090B';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(ANGLE);
  ctx.globalAlpha = 0.62;
  placements.forEach((p) => {
    const x = p.cx - tw / 2;
    const y = p.cy - th / 2;
    ctx.save();
    roundRect(ctx, x, y, tw, th, tw * 0.06);
    ctx.clip();
    drawCover(ctx, p.source.img, x, y, tw, th);
    ctx.restore();
  });
  ctx.restore();
  ctx.globalAlpha = 1;

  // Legibility wash: an ellipse centred on the wordmark, then a light fade top
  // and bottom so the mosaic runs off the edges instead of stopping dead.
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(1, H / W);
  const vignette = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0.88)');
  vignette.addColorStop(0.35, 'rgba(0,0,0,0.68)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = vignette;
  ctx.fillRect(-W, -H, W * 2, H * 2);
  ctx.restore();

  const fade = ctx.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, 'rgba(9,9,11,0.75)');
  fade.addColorStop(0.25, 'rgba(9,9,11,0)');
  fade.addColorStop(0.75, 'rgba(9,9,11,0)');
  fade.addColorStop(1, 'rgba(9,9,11,0.75)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);

  const logo = await loadProxied(spec.logoUrl);
  let captionY = H / 2;
  if (logo) {
    const lw = W * spec.logoShare;
    const lh = (lw / logo.naturalWidth) * logo.naturalHeight;
    ctx.drawImage(logo, (W - lw) / 2, H / 2 - lh / 2, lw, lh);
    captionY = H / 2 + lh / 2;
  }

  if (subtitle) {
    const text = subtitle.toUpperCase();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.62)';

    // Captions vary in length — "2026" against "W1 2026 (2.1 - 8.1)" — so the
    // size is fitted rather than fixed, or a weekly label runs off a phone.
    const maxWidth = W * (format === 'mobile' ? 0.8 : 0.6);
    let size = Math.round(W * (format === 'mobile' ? 0.038 : 0.016));
    const apply = (s: number) => {
      ctx.font = `900 ${s}px Inter, "Helvetica Neue", Arial, sans-serif`;
      // Not universally supported; where it is missing the caption sets tight.
      try { (ctx as any).letterSpacing = `${Math.round(s * 0.3)}px`; } catch { /* ignore */ }
    };
    apply(size);
    while (size > 10 && ctx.measureText(text).width > maxWidth) {
      size = Math.round(size * 0.92);
      apply(size);
    }

    ctx.fillText(text, W / 2, captionY + size * 1.1);
    try { (ctx as any).letterSpacing = '0px'; } catch { /* ignore */ }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    // JPEG, not PNG: the same 4K mosaic is ~20MB as PNG and ~2MB here, with no
    // difference you can see on a wallpaper.
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be encoded.'))), 'image/jpeg', 0.95);
  });

  const preview = document.createElement('canvas');
  const pw = 640;
  preview.width = pw;
  preview.height = Math.round((pw / W) * H);
  preview.getContext('2d')?.drawImage(canvas, 0, 0, preview.width, preview.height);

  return {
    blob,
    previewUrl: preview.toDataURL('image/jpeg', 0.7),
    width: W,
    height: H,
    coversUsed: usable.length,
  };
}

/** Hands the finished image to the browser as a download. */
export function downloadWallpaper(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
