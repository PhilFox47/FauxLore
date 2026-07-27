import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";
import { getAiConfig, nanoGenerateText, parseJsonLoose } from "../lib/ai";
import { codexPromptBlock, type CodexService } from "./codex";

/**
 * Auto-tagging, on the server.
 *
 * It used to run in the browser, which meant adding a title was a two-stage
 * wait: press Auto Tag, watch a spinner, and only then press Save. Worse, the
 * whole thing died if the tab was closed. Now saving a new entry queues the work
 * here — the Codex gets compiled and the tags written while the user carries on
 * — and the entry simply gains its genres and tags a little later.
 *
 * Status lives on the media row (`autoTagStatus`), so the UI can show that
 * something is in flight and stop guessing.
 */

export type AutoTagStatus = "pending" | "done" | "failed";

/**
 * How much brand-new vocabulary one entry may introduce. Inventing terms is
 * meant to be the exception: a library whose taxonomy grows by a term or two per
 * title stops being a taxonomy at all, and the tags stop being comparable
 * between entries. Anything beyond this is dropped rather than added.
 */
const MAX_NEW_GENRES = 1;
const MAX_NEW_TAGS = 2;

/**
 * Loose key for matching a returned term against the vocabulary: case, spacing,
 * punctuation, accents and a trailing plural should never be the reason a term
 * counts as "new". "Sci-Fi", "sci fi" and "SciFi" are the same word.
 */
function normalizeTerm(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Spelling variants of one term that should all resolve to the same entry. */
function termKeys(value: string): string[] {
  const base = normalizeTerm(value);
  if (!base) return [];
  const collapsed = base.replace(/ /g, "");
  const singular = base.replace(/(\w+)s$/, "$1");
  const keys = new Set([base, collapsed, singular, singular.replace(/ /g, "")]);
  // A few pairs that are genuinely the same concept but never spelled alike.
  const ALIASES: Record<string, string> = {
    "science fiction": "sci fi",
    scifi: "sci fi",
    "role playing game": "rpg",
    "role playing": "rpg",
    "first person shooter": "fps",
    "coming of age": "coming of age",
    "slice of life": "slice of life",
  };
  const aliased = ALIASES[base] || ALIASES[collapsed];
  if (aliased) {
    keys.add(aliased);
    keys.add(aliased.replace(/ /g, ""));
  }
  return [...keys].filter(Boolean);
}

/**
 * Falls back to containment when no spelling of a term matches: a coinage that
 * wraps an existing term is that term made more specific, and the library is
 * better served by the word it already has. "Cosmic Horror" is Horror,
 * "Environmental Puzzles" is Puzzle, "Retro-Futurism" is Retro. The longest
 * enclosed term wins, so "Puzzle Platformer" prefers "Platformer" over "Puzzle"
 * when both exist.
 */
function snapByContainment(terms: string[], value: string): string | null {
  const singularize = (word: string) => (word.length >= 5 ? word.replace(/s$/, "") : word);
  const normalized = normalizeTerm(value);
  if (!normalized) return null;
  const haystacks = [
    ` ${normalized} `,
    ` ${normalized.split(" ").map(singularize).join(" ")} `,
  ];

  let best: string | null = null;
  for (const term of terms) {
    const needle = normalizeTerm(term);
    // Very short terms ("RPG", "3D") would match inside unrelated words.
    if (needle.length < 4) continue;
    const patterns = [` ${needle} `, ` ${needle.split(" ").map(singularize).join(" ")} `];
    const hit = haystacks.some((hay) => patterns.some((p) => hay.includes(p)));
    if (hit && (!best || needle.length > normalizeTerm(best).length)) best = term;
  }
  return best;
}

/** Builds "any spelling of an existing term" -> "the term as the app spells it". */
function buildLookup(terms: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const term of terms) {
    for (const key of termKeys(term)) {
      if (!map.has(key)) map.set(key, term);
    }
  }
  return map;
}

export interface AutoTagResult {
  genres: string[];
  tags: string[];
}

export function createAutoTagService({ db, codex }: { db: Db; codex: CodexService }) {
  // One run per media at a time. The queue-on-create path and a manual retry can
  // otherwise land together and write over each other.
  const inFlight = new Set<string>();

  function setStatus(mediaId: string, status: AutoTagStatus | null) {
    try {
      db.prepare("UPDATE media SET autoTagStatus = ? WHERE id = ?").run(status, mediaId);
    } catch (e) { /* column missing on a very old DB */ }
  }

  /**
   * Pulls what the model returned back onto the vocabulary the library already
   * uses.
   *
   * Every returned term is matched against the existing taxonomy ignoring case,
   * punctuation, spacing and plurals, so "sci-fi", "Sci Fi" and "SciFi" all land
   * on whichever one the app already has. A term that still matches nothing is a
   * genuinely new word, and only a couple of those are allowed through per entry
   * — the rest are dropped. Without that cap the vocabulary grows by a term or
   * two per title and stops being comparable between entries.
   */
  function reconcile(
    parsed: any,
    validGenres: string[],
    validTags: string[],
  ): AutoTagResult & { added: { genres: string[]; tags: string[] }; dropped: string[] } {
    const genreLookup = buildLookup(validGenres);
    const tagLookup = buildLookup(validTags);

    const finalGenres = new Set<string>();
    const finalTags = new Set<string>();
    const unmatchedGenres: string[] = [];
    const unmatchedTags: string[] = [];

    const snap = (lookup: Map<string, string>, value: string) => {
      for (const key of termKeys(value)) {
        const hit = lookup.get(key);
        if (hit) return hit;
      }
      return null;
    };
    // Exact spelling first across both kinds, then containment — so a coinage
    // only counts as new once nothing in the vocabulary can absorb it.
    const snapLoose = (lookup: Map<string, string>, terms: string[], value: string) =>
      snap(lookup, value) || snapByContainment(terms, value);

    const asList = (v: any) => (Array.isArray(v) ? v : []);
    const clean = (v: any) => String(v || "").trim();

    // A term is a genre OR a tag, never both: if the model files something under
    // the wrong heading and the app already knows it under the other, move it.
    for (const raw of asList(parsed?.genres)) {
      const value = clean(raw);
      if (!value) continue;
      const asGenre = snap(genreLookup, value) || snapByContainment(validGenres, value);
      const asTag = snap(tagLookup, value) || snapByContainment(validTags, value);
      if (asGenre) finalGenres.add(asGenre);
      else if (asTag) finalTags.add(asTag);
      else unmatchedGenres.push(value);
    }
    for (const raw of asList(parsed?.tags)) {
      const value = clean(raw);
      if (!value) continue;
      const asTag = snap(tagLookup, value) || snapByContainment(validTags, value);
      const asGenre = snap(genreLookup, value) || snapByContainment(validGenres, value);
      if (asTag) finalTags.add(asTag);
      else if (asGenre) finalGenres.add(asGenre);
      else unmatchedTags.push(value);
    }

    // Terms the model deliberately proposed as new go to the front of the queue;
    // anything it slipped in without declaring is only considered after those.
    const declaredGenres = asList(parsed?.newGenres).map((g: any) => clean(g?.name ?? g)).filter(Boolean);
    const declaredTags = asList(parsed?.newTags).map((t: any) => clean(t?.name ?? t)).filter(Boolean);

    const dropped: string[] = [];
    const takeNew = (
      declared: string[],
      undeclared: string[],
      limit: number,
      lookup: Map<string, string>,
      terms: string[],
      sink: Set<string>,
    ) => {
      const added: string[] = [];
      const seen = new Set<string>();
      for (const value of [...declared, ...undeclared]) {
        const key = termKeys(value)[0];
        if (!key || seen.has(key)) continue;
        seen.add(key);
        // A "new" term the vocabulary can already absorb is not new.
        const existing = snapLoose(lookup, terms, value);
        if (existing) { sink.add(existing); continue; }
        if (added.length < limit) {
          added.push(value);
          sink.add(value);
        } else {
          dropped.push(value);
        }
      }
      return added;
    };

    const addedGenres = takeNew(declaredGenres, unmatchedGenres, MAX_NEW_GENRES, genreLookup, validGenres, finalGenres);
    const addedTags = takeNew(declaredTags, unmatchedTags, MAX_NEW_TAGS, tagLookup, validTags, finalTags);

    return {
      genres: [...finalGenres],
      tags: [...finalTags],
      added: { genres: addedGenres, tags: addedTags },
      dropped,
    };
  }

  /**
   * Registers a genuinely new term so it becomes part of the vocabulary rather
   * than a one-off string living on a single entry — which is what used to
   * happen, leaving invented terms invisible to every later tagging run.
   */
  function registerTerm(name: string, type: "genre" | "tag") {
    try {
      db.prepare("INSERT OR IGNORE INTO global_taxonomy (id, type, name, usageCount) VALUES (?, ?, ?, 0)")
        .run(uuidv4(), type, name);
    } catch (e) {
      console.error(`Could not register new ${type} "${name}"`, e);
    }
  }

  /** Keeps global_taxonomy in step with what a title now carries. */
  function applyTaxonomy(mediaId: string, userId: string, next: AutoTagResult) {
    const row: any = db.prepare("SELECT genres, tags FROM media WHERE id = ? AND userId = ?").get(mediaId, userId);
    const parse = (v: any) => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } };
    const prevGenres: string[] = row ? parse(row.genres) : [];
    const prevTags: string[] = row ? parse(row.tags) : [];

    const count = db.prepare("UPDATE global_taxonomy SET usageCount = usageCount + ? WHERE name = ? AND type = ?");
    prevGenres.forEach((g) => count.run(-1, g, "genre"));
    prevTags.forEach((t) => count.run(-1, t, "tag"));
    next.genres.forEach((g) => count.run(1, g, "genre"));
    next.tags.forEach((t) => count.run(1, t, "tag"));
  }

  /**
   * Tags one media entry. Resolves to the terms written, or null when it could
   * not run (no AI configured, entry gone, model unusable).
   */
  async function autoTagMedia(userId: string, mediaId: string): Promise<AutoTagResult | null> {
    if (inFlight.has(mediaId)) return null;
    inFlight.add(mediaId);
    try {
      const media: any = db.prepare("SELECT * FROM media WHERE id = ? AND userId = ?").get(mediaId, userId);
      if (!media) return null;

      const aiConfig = getAiConfig(db, userId);
      if (!aiConfig) {
        setStatus(mediaId, "failed");
        return null;
      }

      setStatus(mediaId, "pending");

      // Most-used first: the model reads the head of a long list most closely, and
      // the terms already carrying the library are the ones worth reusing.
      const taxonomy = db
        .prepare("SELECT type, name, usageCount FROM global_taxonomy ORDER BY usageCount DESC, name ASC")
        .all() as { type: string; name: string; usageCount: number }[];
      const validGenres = taxonomy.filter((t) => t.type === "genre").map((t) => t.name);
      const validTags = taxonomy.filter((t) => t.type === "tag").map((t) => t.name);

      // The Codex first: it is the shared research every AI feature reads, and
      // compiling it here means the entry is ready for enemies and loot too.
      const codexRow = await codex.tryEnsureCodex(userId, {
        mediaId,
        title: media.title,
        mediaType: media.mediaType,
      });
      const codexBlock = codexPromptBlock(codexRow);

      const systemPrompt = `You are FauxLore's taxonomy system. You classify media using ONE controlled vocabulary shared by the user's whole library.

THE VOCABULARY — these are the only terms you may normally use, most-used first.

GENRES (${validGenres.length}): ${validGenres.join(", ")}

TAGS (${validTags.length}): ${validTags.join(", ")}

HOW TO USE IT:
1. This vocabulary is a closed list, not a suggestion. Your job is to find the terms in it that fit this work — not to describe the work in your own words. Read the whole list before you answer.
2. If a concept is even roughly covered by an existing term, USE THE EXISTING TERM. "Cosmic Horror" when the list has "Horror"; "Puzzles" when the list has "Puzzle"; "Sci-Fi Horror" when the list has both "Sci-Fi" and "Horror" — take what is there. Never coin a variant, a plural, a hyphenation or a more specific flavour of a term that already exists.
3. Match the list's exact spelling and casing. Copy terms character for character.
4. Genres: pick 1-3 that define the work, up to 5 only if genuinely needed, most defining first.
5. Tags: pick 3-10 that a person would actually filter by, up to 15 only if genuinely needed, most defining first.
6. A term is a Genre OR a Tag, never both. Do not move a term from one list to the other.
7. Inventing a term is a LAST RESORT and should almost never happen. Only if the work has a defining quality that no existing term expresses at all — not merely less precisely. If you truly must, put it in "newGenres"/"newTags" with a reason, NOT in the main lists. At most ${MAX_NEW_GENRES} new genre and ${MAX_NEW_TAGS} new tags will be accepted; anything beyond that is discarded, so spend them carefully or not at all.
8. ${codexBlock
        ? "Classify from the Codex supplied with the request — it is the researched record of this work. Its own genre and tag suggestions are raw material written without knowledge of this vocabulary: translate every one of them into the list above rather than passing them through."
        : `USE YOUR WEB SEARCH CAPABILITIES to confirm details about "${media.title}" (${media.mediaType}).`}

Return ONLY a pure JSON object in exactly this shape, with no markdown and no commentary:
{
  "genres": ["terms copied from the GENRES list"],
  "tags": ["terms copied from the TAGS list"],
  "newGenres": [{"name": "", "reason": "why no existing genre covers this at all"}],
  "newTags": [{"name": "", "reason": "why no existing tag covers this at all"}]
}
Leave "newGenres" and "newTags" as empty arrays unless the work genuinely demands otherwise — that is the normal case.`;

      const parse = (v: any) => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } };
      const userPrompt = `Please tag the following media:
Title: ${media.title}
Type: ${media.mediaType}
Description: ${media.description || "N/A"}
Creator: ${media.creator || media.publisher || "N/A"}
Year: ${media.year || "N/A"}
Existing genres on the entry: ${parse(media.genres).join(", ") || "N/A"}
Existing tags on the entry: ${parse(media.tags).join(", ") || "N/A"}
Platforms: ${parse(media.platforms).join(", ") || "N/A"}${codexBlock ? `\n\n${codexBlock}` : ""}`;

      // With a Codex in hand the facts are settled, so this is plain
      // classification. Without one, fall back to searching the web here.
      const raw = await nanoGenerateText(aiConfig, userPrompt, {
        temperature: 0.1,
        webSearch: !codexBlock,
        systemPrompt,
      });
      if (!raw) throw new Error("The model returned an empty response.");

      const result = reconcile(parseJsonLoose<any>(raw), validGenres, validTags);
      if (result.genres.length === 0 && result.tags.length === 0) {
        throw new Error("The model returned no usable terms.");
      }

      // The few new terms that got through become part of the vocabulary, so the
      // next entry can reuse them instead of coining their own variant.
      result.added.genres.forEach((g) => registerTerm(g, "genre"));
      result.added.tags.forEach((t) => registerTerm(t, "tag"));
      if (result.dropped.length > 0) {
        console.log(`Auto-tag: dropped ${result.dropped.length} coined term(s) for "${media.title}": ${result.dropped.join(", ")}`);
      }

      applyTaxonomy(mediaId, userId, result);
      db.prepare("UPDATE media SET genres = ?, tags = ?, autoTagStatus = 'done', updatedAt = ? WHERE id = ? AND userId = ?")
        .run(JSON.stringify(result.genres), JSON.stringify(result.tags), new Date().toISOString(), mediaId, userId);

      return result;
    } catch (e) {
      console.error(`Auto-tagging failed for media ${mediaId}`, e);
      setStatus(mediaId, "failed");
      return null;
    } finally {
      inFlight.delete(mediaId);
    }
  }

  /**
   * Queues tagging without blocking the request that asked for it — how saving a
   * new entry returns immediately while the work carries on server-side.
   */
  function queueAutoTag(userId: string, mediaId: string) {
    setStatus(mediaId, "pending");
    autoTagMedia(userId, mediaId).catch((e) => console.error("Queued auto-tag failed", e));
  }

  return { autoTagMedia, queueAutoTag };
}

export type AutoTagService = ReturnType<typeof createAutoTagService>;
