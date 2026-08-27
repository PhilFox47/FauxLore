/**
 * The line under each library's title.
 *
 * The lines themselves are no longer here. They live in the `flavor_texts`
 * table and arrive over the API already merged: the global STARTER set every
 * account has (seeded from `server/data/starterFlavorTexts.ts`), and the ones
 * this user's own Codexes EARNED from works they actually consumed. That is
 * what makes them manageable per user — and what makes it structural, rather
 * than a filter someone could forget, that finishing a book adds a line to your
 * library and to nobody else's.
 *
 * What is left here is the choosing, which is a rendering decision and belongs
 * on the client: which of the two pools a given page load draws from.
 */

export type FlavorKind = "quote" | "reference" | "joke";

export interface FlavorText {
  /** The line itself. */
  quote: string;
  /** The work it belongs to. Absent for a house line about the medium. */
  source?: string;
  kind?: FlavorKind;
  /** Who says it, or where in the work it appears. Only earned lines carry one. */
  attribution?: string;
  /** True when this came from the user's own library rather than the starter set. */
  earned?: boolean;
  /** The entry that earned it. */
  mediaId?: string;
}

/** Shown only if the API gave nothing at all — a blank header is worse. */
const FALLBACK: FlavorText = { quote: "A shelf is a kind of autobiography.", kind: "joke" };

/**
 * How often a library that has earned lines of its own shows one.
 *
 * Not always, deliberately. A line from something you actually finished should
 * dominate — that is the point of the whole feature — but a library with a
 * single completed entry has only three to six of them, and showing nothing else
 * would make the header repeat itself within a week. The rest keeps the starter
 * set in play, which matters most exactly when the earned pool is smallest and
 * fades to seasoning once it is large.
 */
const EARNED_SHARE = 0.7;

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/**
 * One line for a library header, from everything this user may see.
 *
 * `lines` is one media type's worth of `/api/flavor-texts`: starter rows and
 * earned rows together, the earned ones flagged. They are split here rather than
 * fetched separately because the weighting is the only reason the difference
 * matters to the client at all.
 *
 * Earned lines are de-duplicated against the starters by text. A house line
 * researched from one of the user's own works can legitimately coincide with a
 * starter — both are about the medium and name nothing — and without this the
 * coincidence would quietly double that line's odds.
 */
export function getRandomFlavorText(lines: FlavorText[] = []): FlavorText {
  const starters = lines.filter((t) => t && t.quote && !t.earned);
  const known = new Set(starters.map((t) => t.quote.toLowerCase()));
  const earned = lines.filter((t) => t && t.quote && t.earned && !known.has(t.quote.toLowerCase()));

  if (earned.length && (!starters.length || Math.random() < EARNED_SHARE)) return pick(earned);
  if (!starters.length) return earned.length ? pick(earned) : FALLBACK;
  return pick(starters);
}
