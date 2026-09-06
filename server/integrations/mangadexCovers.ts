/**
 * Per-volume covers from MangaDex, in whichever language is actually wanted.
 *
 * MangaDex's `/manga` search endpoint (see routes/search.ts) embeds exactly
 * one `cover_art` relationship per title — whatever MangaDex considers the
 * "main" cover, which is usually the original Japanese release. Getting a
 * localized print cover, or a cover matched to a specific volume, needs the
 * separate `/cover` list endpoint (every cover MangaDex has, each carrying
 * its own `volume` and `locale`) and the `/manga/{id}/aggregate` endpoint
 * (which chapter is in which volume) — neither of which the search route
 * ever asked for.
 */

/** One cover, ready to look up by volume. */
export interface MangaVolumeCover {
  volume: number;
  /** A local `/uploads/covers/...` path once cached; the raw MangaDex URL if caching failed. */
  url: string;
}

/** One chapter, and which volume it belongs to. */
export interface MangaVolumeChapter {
  chapter: number;
  volume: number;
}

export interface MangaCoverIndex {
  /** Which language actually has covers on file — never a mix of the two. */
  locale: "en" | "ja";
  /** Ascending by volume. */
  covers: MangaVolumeCover[];
  /** Ascending by chapter. Only whole-numbered chapters — see fetchChapterVolumeMap. */
  chapters: MangaVolumeChapter[];
  fetchedAt: string;
}

interface RawCover {
  volume: number | null;
  locale: string;
  fileName: string;
}

/**
 * Every cover MangaDex has for this title, whatever the language.
 *
 * Paginated because a long-running, heavily localized series can carry more
 * than the 100-per-page MangaDex hands back in one call. Capped at 2,000
 * covers — far beyond anything a real title has — so a malformed response
 * that never reports a shrinking remainder cannot loop forever.
 */
async function fetchAllCovers(mangaId: string): Promise<RawCover[]> {
  const out: RawCover[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const params = new URLSearchParams({
      "manga[]": mangaId,
      limit: String(limit),
      offset: String(offset),
      "order[volume]": "asc",
    });
    const res = await fetch(`https://api.mangadex.org/cover?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`MangaDex cover list ${res.status}`);
    const body: any = await res.json();
    const page: any[] = Array.isArray(body?.data) ? body.data : [];
    for (const c of page) {
      const vol = parseFloat(c?.attributes?.volume);
      out.push({
        volume: Number.isFinite(vol) ? vol : null,
        locale: String(c?.attributes?.locale || ""),
        fileName: String(c?.attributes?.fileName || ""),
      });
    }
    offset += page.length;
    const total = Number(body?.total) || page.length;
    if (page.length === 0 || offset >= total || offset > 2000) break;
  }
  return out;
}

/**
 * Which volume each chapter belongs to, from MangaDex's own aggregate view.
 *
 * Only whole chapter numbers are kept — FauxLore tracks manga progress in
 * whole chapters, so a bonus/half chapter (".5") has nothing in the library
 * to ever match against, and keeping it would just be a value nothing reads.
 * A chapter with no numbered volume (MangaDex's "none" bucket) is skipped
 * for the same reason: it cannot answer "which volume is this in."
 */
async function fetchChapterVolumeMap(mangaId: string): Promise<MangaVolumeChapter[]> {
  const res = await fetch(
    `https://api.mangadex.org/manga/${encodeURIComponent(mangaId)}/aggregate?translatedLanguage[]=en`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`MangaDex aggregate ${res.status}`);
  const body: any = await res.json();
  const out: MangaVolumeChapter[] = [];
  for (const v of Object.values(body?.volumes || {}) as any[]) {
    const volume = parseFloat(v?.volume);
    if (!Number.isFinite(volume)) continue;
    for (const c of Object.values(v?.chapters || {}) as any[]) {
      const chapter = parseFloat(c?.chapter);
      if (!Number.isInteger(chapter)) continue;
      out.push({ chapter, volume });
    }
  }
  out.sort((a, b) => a.chapter - b.chapter);
  return out;
}

/** The entry whose key is the largest not exceeding `target` — or, if every entry is above it, the smallest entry there is. */
function closestNotAbove<T>(list: T[], key: (t: T) => number, target: number): T | undefined {
  if (!list.length) return undefined;
  let best: T | undefined;
  for (const item of list) {
    if (key(item) <= target && (!best || key(item) > key(best))) best = item;
  }
  return best ?? list.reduce((a, b) => (key(b) < key(a) ? b : a));
}

/** Which volume a chapter falls in, per the aggregate map — the latest volume that has started by that chapter. */
export function volumeForChapter(chapters: MangaVolumeChapter[], currentChapter: number): number | undefined {
  return closestNotAbove(chapters, (c) => c.chapter, currentChapter)?.volume;
}

/** The best cover for a volume: an exact match, or the latest earlier volume this language actually has one for. */
export function coverUrlForVolume(covers: MangaVolumeCover[], volume: number): string | undefined {
  return closestNotAbove(covers, (c) => c.volume, volume)?.url;
}

/**
 * Builds the cover index for one title: picks English if MangaDex has ANY
 * English covers at all, Japanese only if it has none, and ignores every
 * other language entirely. This is a language-level choice, not a
 * per-volume one — a title with English covers for volumes 1-5 and a
 * Japanese cover for volume 6 still shows the English volume 5 for someone
 * on volume 6, never the Japanese one, because mixing languages within one
 * title reads worse than one volume behind in a single language.
 *
 * Every cover in the winning language is cached right away via
 * `cacheCover` — not just whichever one is currently relevant — so that
 * picking a different volume later (a chapter logged, a chapter un-logged)
 * is a local lookup against already-downloaded files, not another fetch.
 * `cacheCover` already rejects MangaDex's square hotlink-placeholder image,
 * so a cover that fails that check simply falls back to its remote URL the
 * same way any other cover on this app does.
 *
 * Returns null when the title has neither English nor Japanese covers on
 * MangaDex at all — the entry then keeps whatever cover it already has.
 */
export async function buildMangaCoverIndex(
  mangaId: string,
  cacheCover: (url?: string | null) => Promise<{ url: string; cached: boolean }>,
): Promise<MangaCoverIndex | null> {
  const [rawCovers, chapters] = await Promise.all([
    fetchAllCovers(mangaId),
    fetchChapterVolumeMap(mangaId),
  ]);

  const byLocale = (loc: string) => rawCovers.filter((c) => c.locale === loc && c.volume != null && c.fileName);
  const english = byLocale("en");
  const japanese = english.length ? [] : byLocale("ja");
  const winningLocale: "en" | "ja" | null = english.length ? "en" : japanese.length ? "ja" : null;
  if (!winningLocale) return null;
  const winning = winningLocale === "en" ? english : japanese;

  const covers: MangaVolumeCover[] = [];
  for (const c of winning) {
    const remote = `https://uploads.mangadex.org/covers/${mangaId}/${c.fileName}.512.jpg`;
    const result = await cacheCover(remote);
    covers.push({ volume: c.volume as number, url: result.cached ? result.url : remote });
  }
  covers.sort((a, b) => a.volume - b.volume);

  return { locale: winningLocale, covers, chapters, fetchedAt: new Date().toISOString() };
}

/** The cover to show for a given chapter, from an already-built index. */
export function pickMangaCoverUrl(index: MangaCoverIndex | null | undefined, currentChapter: number): string | undefined {
  if (!index || !index.covers.length) return undefined;
  const volume = volumeForChapter(index.chapters, currentChapter);
  // No chapter/volume mapping at all — still better to show the earliest
  // cover we have than nothing, since covers exist but volumeForChapter has
  // no basis to pick among them.
  if (volume == null) return index.covers[0].url;
  return coverUrlForVolume(index.covers, volume);
}
