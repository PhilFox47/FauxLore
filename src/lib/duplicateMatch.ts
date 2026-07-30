import { MediaItem } from '../types/schema';

/**
 * Catching a title you already have, while you are still typing it.
 *
 * The old check compared normalised titles for exact equality, which only ever
 * caught a duplicate typed the same way twice. "Dune: Part Two" and "Dune Part 2"
 * are the same film and it saw two different ones.
 *
 * The hard part is not finding similar strings — it is not crying wolf. A
 * library is full of titles that are deliberately near-identical: Final Fantasy
 * VII and VIII, Severance Season 1 and Season 2, Berserk Vol. 3 and Vol. 4.
 * Those differ by one token that carries all the meaning, and a plain
 * similarity score reads them as the same thing. So an ordinal is pulled out
 * first and compared on its own: differ there, and nothing else matters.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
};

const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15,
};

/** Lowercase, unaccented, punctuation-free, with leading articles dropped. */
export function normalizeTitle(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/\s+/g, ' ');
}

export interface TitleParts {
  /** The title with its ordinal removed — what actually gets compared. */
  base: string;
  /** Season / part / volume number, or a trailing numeral. Null when there is none. */
  ordinal: number | null;
  /** What kind of ordinal it was, so a Season 2 is not matched against a Volume 2. */
  ordinalKind: string | null;
}

const ORDINAL_WORDS = 'season|staffel|series|part|pt|vol|volume|book|chapter|ch|episode|ep|act|stage|arc|cour';

/**
 * Splits a title into the name and the instalment it identifies.
 *
 * Both halves matter. Two entries whose bases match but whose ordinals differ
 * are siblings, not duplicates — which is the single most common way a naive
 * matcher embarrasses itself in a library organised by season.
 */
export function titleParts(input: string): TitleParts {
  let base = normalizeTitle(input);
  let ordinal: number | null = null;
  let ordinalKind: string | null = null;

  // "... season 2", "... vol 3", "... part two"
  const labelled = base.match(new RegExp(`\\b(${ORDINAL_WORDS})\\s+([a-z0-9]+)\\s*$`));
  if (labelled) {
    const raw = labelled[2];
    const n = /^\d+$/.test(raw) ? Number(raw) : (NUMBER_WORDS[raw] ?? ROMAN[raw] ?? null);
    if (n !== null && Number.isFinite(n)) {
      ordinal = n;
      // Season, series and staffel all mean the same instalment.
      ordinalKind = /season|staffel|series|cour/.test(labelled[1]) ? 'season'
        : /vol|book/.test(labelled[1]) ? 'volume'
        : /chapter|ch|episode|ep/.test(labelled[1]) ? 'chapter'
        : 'part';
      base = base.slice(0, labelled.index).trim();
    }
  }

  if (ordinal === null) {
    // A bare trailing numeral: "Final Fantasy VII", "Portal 2", "Persona 5".
    const trailing = base.match(/\s([a-z0-9]+)$/);
    if (trailing) {
      const raw = trailing[1];
      const n = /^\d+$/.test(raw) ? Number(raw) : (ROMAN[raw] ?? NUMBER_WORDS[raw] ?? null);
      // Only when the rest is substantial — "1917" is a title, not an instalment.
      if (n !== null && Number.isFinite(n) && base.length - raw.length > 2) {
        ordinal = n;
        ordinalKind = 'numeral';
        base = base.slice(0, base.length - raw.length).trim();
      }
    }
  }

  return { base, ordinal, ordinalKind };
}

/** Sørensen–Dice over character bigrams: forgiving of word order and typos. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let shared = 0;
  let total = 0;
  A.forEach((count, g) => { total += count; shared += Math.min(count, B.get(g) || 0); });
  B.forEach((count) => { total += count; });
  return total === 0 ? 0 : (2 * shared) / total;
}

export interface DuplicateMatch {
  item: MediaItem;
  /** 0-1; 1 means the titles are the same once normalised. */
  score: number;
  exact: boolean;
  /** Same media type — a real duplicate rather than the same work in another format. */
  sameType: boolean;
}

/** How alike two titles have to be before it is worth interrupting someone. */
export const SIMILAR_THRESHOLD = 0.86;

/**
 * Entries that look like the one being typed.
 *
 * Same-format matches lead, because those are the actual duplicates; the same
 * work in another format follows, since owning the book does not stop you
 * tracking the audiobook but is worth knowing about.
 */
export function findDuplicateMatches(
  title: string,
  mediaType: string,
  media: MediaItem[],
  opts: { excludeId?: string; limit?: number } = {},
): DuplicateMatch[] {
  const typed = titleParts(title);
  // Two characters of a name is not enough to accuse anyone of anything.
  if (typed.base.length < 3) return [];

  const matches: DuplicateMatch[] = [];
  for (const item of media || []) {
    if (!item || item.isReRun) continue;
    if (opts.excludeId && item.id === opts.excludeId) continue;

    const theirs = titleParts(item.title);
    if (theirs.base.length < 2) continue;

    // Siblings, not duplicates: Season 1 against Season 2, Vol 3 against Vol 4,
    // Final Fantasy VII against VIII. Only when both actually carry a number —
    // "Severance" against "Severance Season 2" stays a candidate.
    if (typed.ordinal !== null && theirs.ordinal !== null && typed.ordinal !== theirs.ordinal) continue;

    const score = similarity(typed.base, theirs.base);
    const exact = typed.base === theirs.base;
    if (!exact && score < SIMILAR_THRESHOLD) continue;

    matches.push({ item, score, exact, sameType: item.mediaType === mediaType });
  }

  matches.sort((a, b) => {
    if (a.sameType !== b.sameType) return a.sameType ? -1 : 1;
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    return b.score - a.score;
  });
  return matches.slice(0, opts.limit ?? 6);
}
