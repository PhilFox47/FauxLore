/**
 * Reading a visual novel's names out of VNDB.
 *
 * VNDB does not have "the title". It has a list of titles, one per language,
 * each carrying the name in its own script plus an optional romanization, and
 * one of them flagged as the work's original. Which of those is the useful one
 * depends entirely on who is reading: for this library the English name is the
 * title and the original Japanese is the subtitle.
 *
 * The API also exposes flattened `title` and `alttitle` fields, but they are
 * defined relative to the *account's* language preference — `title` is the main
 * title romanized, `alttitle` the same in its original script. Neither is the
 * English release name, which is why the `titles` array is what this reads.
 * They remain as fallbacks for a record that has no titles array at all.
 */

export interface VndbTitle {
  lang?: string;
  /** The name in its own script. */
  title?: string;
  /** Romanization of `title`, null when `title` is already latin. */
  latin?: string | null;
  official?: boolean;
  /** Marks the entry in the work's original language. */
  main?: boolean;
}

export interface VndbNames {
  title: string;
  /** Omitted when it would only repeat the title. */
  subtitle?: string;
}

/** The fields the search request has to ask for to make this work. */
export const VNDB_TITLE_FIELDS = 'title, alttitle, titles.lang, titles.title, titles.latin, titles.official, titles.main';

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** Same name, ignoring case and spacing — enough to spot a pointless subtitle. */
const same = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, ' ') === b.toLowerCase().replace(/\s+/g, ' ');

/**
 * Picks the title and subtitle for one VNDB record.
 *
 * English becomes the title, the original script becomes the subtitle. With no
 * English name, the original takes the title instead — romanized when a
 * romanization exists, since a title nobody can type is worse than one that is
 * merely transliterated, and the original script still appears as the subtitle.
 */
export function vndbNames(vn: any): VndbNames {
  const titles: VndbTitle[] = Array.isArray(vn?.titles) ? vn.titles : [];

  const english = titles.filter((t) => (t.lang || '').toLowerCase() === 'en');
  // An official release name beats a fan-made one where both exist.
  const englishName = clean(english.find((t) => t.official)?.title) || clean(english[0]?.title);

  const mainEntry = titles.find((t) => t.main);
  // `alttitle` is the flattened form of exactly this, so it covers records that
  // came back without the titles array.
  const originalScript = clean(mainEntry?.title) || clean(vn?.alttitle);
  const originalLatin = clean(mainEntry?.latin) || clean(vn?.title);

  const title = englishName || originalLatin || originalScript || clean(vn?.title) || 'Unknown Title';

  // The subtitle only earns its place by saying something the title does not.
  let subtitle = '';
  for (const candidate of [originalScript, originalLatin]) {
    if (candidate && !same(candidate, title)) { subtitle = candidate; break; }
  }

  return subtitle ? { title, subtitle } : { title };
}
