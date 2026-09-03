import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";
import { getAiConfig, nanoGenerateText, parseJsonLoose } from "../lib/ai";
import {
  FACETS, FACET_FLOORS, TYPE_BRIEF,
  buildDossierPrompt,
  subjectSeason, subjectYear,
  type CodexIdentity, type CodexSubject, type Facet,
} from "./codexResearch";

export { subjectSeason, subjectYear, type CodexSubject };

/**
 * The Codex: one researched dossier per media entry, shared by every AI feature.
 *
 * Auto-tagging, enemy generation and item generation all used to run their own
 * web search, which meant three lookups of the same facts, three different
 * pictures of the same universe, and a bill to match. Instead the first of those
 * tasks to touch a media entry builds its Codex — a single web-search pass that
 * writes down what the thing actually is: its cast, its enemies, its art style,
 * its iconic items, its vocabulary, and the terms that describe it.
 *
 * Afterwards the creative tasks are plain generation calls. They get the Codex as
 * ground truth and are free to invent on top of it, which is both cheaper and far
 * more consistent: the enemy, the loot and the tags all come from one canon.
 *
 * A Codex is keyed by title+type rather than by row id, so re-runs of the same
 * title share one, and a Codex built while adding an entry (before it has been
 * saved) is adopted by that entry once it exists.
 */

/**
 * One thing in a work: a person, a group, a place, an object, an antagonist.
 *
 * The fields are a superset — a character has no `material` and an object has no
 * `personality` — because everything that reads a Codex reads it the same way and
 * a shared shape keeps that simple. Every field past `name` is optional and
 * absent when the research did not support it.
 *
 * Note what is NOT here: no difficulty level, no boss tier, no loot rarity. The
 * Codex records what a work contains; deciding that the Warden makes a good
 * level 4 this week is the enemy forge's job, made at the moment it has the
 * level, the history and the difficulty setting in front of it. Grading it once
 * at research time froze that decision and, worse, biased the research toward
 * things that would make good bosses instead of things that are actually there.
 */
export interface CodexEntity {
  name: string;
  /** Other names, titles, epithets and nicknames this goes by. */
  aliases?: string[];
  description?: string;
  /** What it looks like, kept apart from what it is — image prompts need this alone. */
  appearance?: string;
  /** Which group, house, team or side it belongs to. */
  affiliation?: string;

  // People
  role?: string;
  /** How central this is TO THE WORK: central, major, recurring, minor. */
  prominence?: string;
  abilities?: string;
  /** Temperament, manner, verbal tics — the voice to write it in. */
  personality?: string;
  /** How they connect to the rest of the cast: family, rivals, mentors, debts. */
  relationships?: string;
  status?: string;

  // Antagonists
  /** person, group, institution, creature type, force, circumstance. */
  nature?: string;
  motivation?: string;
  /** How it operates and what it is capable of. */
  methods?: string;
  opposedTo?: string;

  // Objects
  /** What it is made of. */
  material?: string;
  /** What it does, or what it is for. */
  purpose?: string;
  /** What it means in the work and why it matters. */
  significance?: string;
  owner?: string;
  origin?: string;

  // Places
  /** The larger place this sits inside, giving the world a hierarchy. */
  region?: string;
  atmosphere?: string;
  whatHappensThere?: string;

  // Groups
  /** Who they stand against. */
  opposes?: string;
  goal?: string;
  symbol?: string;
  colors?: string;
  members?: string[];

  /**
   * Where this first appears, in the work's own units, and as a rough
   * percentage. Lets everything downstream be gated on how far the user has
   * actually got rather than on the entry as a whole.
   */
  introducedAt?: string;
  introducedPct?: number;
}

/** A piece of in-universe vocabulary. */
export interface CodexTerm {
  term: string;
  meaning: string;
  /** rank, currency, magic or tech, institution, title, law, slang, catchphrase… */
  category?: string;
  introducedAt?: string;
  introducedPct?: number;
}

/**
 * A line the work is actually known by.
 *
 * Not the best line in it — the one that gets repeated. Three kinds share the
 * shape because a library header shows them the same way: a `quote` is said in
 * the work, a `reference` is something it is recognised by that is not a line,
 * and a `joke` is what its audience says about it rather than what it says.
 */
export interface CodexFlavorText {
  text: string;
  kind?: FlavorKind;
  /**
   * Whether this belongs to the work or to the format.
   *
   * A `medium` line is about the experience of consuming this KIND of thing —
   * the bookmark that has not moved since March, the guide open in the other
   * window — of the particular sort this work puts people through. It names no
   * title and no character, so it is served with no source and reads as one of
   * the app's own house lines rather than a quotation from anything.
   */
  scope?: FlavorScope;
  /** Who says it, or where it appears. Absent when nobody in particular does. */
  attribution?: string;
  /** What makes it recognisable. Shown in the Codex, not in the library header. */
  why?: string;
}

export type FlavorKind = "quote" | "reference" | "joke";
export type FlavorScope = "work" | "medium";

/** The ceiling the research is told to respect, enforced rather than trusted. */
export const MAX_FLAVOR_TEXTS = 6;

/**
 * How many of those may be about the format rather than the work.
 *
 * Capped low on purpose. Format lines are the easiest thing here to write and
 * the hardest to write WELL — a model asked for one will always produce
 * something, and a generic one is indistinguishable from filler. Two is enough
 * for a work that genuinely crystallises a habit of its medium, and low enough
 * that a dossier can never become mostly house lines with a title attached.
 */
export const MAX_MEDIUM_FLAVOR_TEXTS = 2;

/** A header line has to fit on a line. Anything longer is a paragraph, not a quote. */
const MAX_FLAVOR_LENGTH = 240;

/** Words that stay lowercase inside a title and so say nothing about its case. */
const MINOR_WORDS = new Set([
  "a", "an", "the", "of", "in", "on", "and", "or", "to", "for", "at", "by", "from", "with", "vs",
]);

/**
 * A label, not a line.
 *
 * The characteristic way this research fails is by handing back the NAME of a
 * thing where a quotation was asked for — "Crimson Chronovium", "The Waiting
 * Room", "The 35 GB DLC". They look like findings and are useless: nobody says
 * them, so they cannot be quoted, and printed under a library title they read as
 * a glossary headword with the quotation marks put on by mistake.
 *
 * The tell is Title Case with nothing to end it. Everything that legitimately
 * survives is excluded first, and each exclusion is a real entry in the starter
 * set: a single word is fine ("Hodor.", "SNIKT"), terminal punctuation means
 * somebody said it ("Just Monika.", "Plus Ultra!"), an arrow or ellipsis is the
 * page itself speaking ("To Be Continued →", "MEANWHILE…"), and full caps is text
 * on a screen ("YOU DIED"). A lowercase word in the middle almost always means a
 * verb, which means a sentence — "Winter is coming" survives without a full stop.
 */
export function isBareLabel(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  if (/[.!?…。！？]$/.test(text)) return false;
  if (/[→←↑↓~—-]$/.test(text)) return false;
  if (text === text.toUpperCase()) return false;

  const significant = words.filter((w) => !MINOR_WORDS.has(w.toLowerCase().replace(/[^\w']/g, "")));
  if (significant.length < 2) return false;
  return significant.every((w) => /^[^a-z]*[A-Z0-9]/.test(w));
}

/**
 * What survives of the research's answer.
 *
 * Every rule here exists because this is the one Codex field shown to the user
 * verbatim, as a real line from something they finished — so a padded list, a
 * quote wrapped in stray punctuation or a paragraph masquerading as a catchphrase
 * is worse than nothing. The research is asked for three to six; this is what
 * makes six actually mean six.
 */
/**
 * The prompt's own worked examples, which have been coming back as answers.
 *
 * They are printed in the brief to show the SHAPE of a good line, and one of
 * them turned up verbatim in a real dossier for Dragon Age: The Veilguard — a
 * game whose character creator it says nothing about, in a list where every
 * other entry was marketing copy. An illustration copied into the record is not
 * a memory, it is the prompt talking to itself, so they are refused here as well
 * as forbidden there.
 */
const PROMPT_EXAMPLES = new Set([
  "the character creator took ninety minutes. the helmet covers the face.",
  "two hundred chapters of waiting, and he arrives in a mid-season patch.",
  "uninstalled the texture pack. got thirty-five gigabytes and a blurry hero.",
  "togashi is on hiatus again.",
  "the scanlation group went quiet at chapter 214.",
  "zoro is lost again. he was standing right there.",
  "bought in the sale, installed, never launched.",
  "wait for the trade.",
  "saved before the boss. saved after the boss. saved between the two, just in case.",
  "the bookmark has not moved since march.",
  "a guide is open in the other window. it has been since hour one.",
  "finished the errand in twenty minutes; the calendar charged me for the whole day anyway.",
]);

/**
 * Where a line came from, when the attribution admits it.
 *
 * A quote is words from inside the work. These are the sources that are not:
 * the press tour, the store page, the review. They are the easiest text about
 * any work to find, which is why they kept arriving — one dossier's memories
 * were a blog post, a store description, a creative director at a trade show and
 * a note about the EA App, none of which anybody has ever said to another fan.
 *
 * Matched on the attribution rather than the text, because that is where a model
 * is honest about it: it writes "Official game description" or "Creative
 * director John Epler at Summer Game Fest" quite plainly, having simply filed it
 * under the wrong kind.
 */
const OUTSIDE_THE_WORK = new RegExp(
  [
    "marketing", "press release", "press kit", "announcement", "blog post", "store page",
    "steam page", "official (?:game )?description", "publisher", "promotional", "trailer",
    "interview", "creative director", "game director", "showcase", "summer game fest",
    "developer(?:s)?(?: said| statement| commentary)?", "dev(?:s)? said", "keynote",
    "pre-?release coverage", "review(?:er|s)?", "ign\\b", "gamespot", "polygon", "kotaku", "eurogamer",
  ].join("|"),
  "i",
);

export function normalizeFlavorTexts(value: any): CodexFlavorText[] {
  if (!Array.isArray(value)) return [];
  const out: CodexFlavorText[] = [];
  const seen = new Set<string>();
  let medium = 0;
  /**
   * How many memories may come from outside the work.
   *
   * One, matching the brief. A production fact or a settled fandom verdict earns
   * its place; four of them mean the coverage was researched instead of the work.
   */
  let outside = 0;

  for (const row of value) {
    const raw = typeof row === "string" ? row : row?.text ?? row?.quote;
    // Models like to hand back a quote already wrapped in the quotation marks the
    // UI is about to add around it.
    const text = String(raw ?? "").trim().replace(/^["'“”„«»]+|["'“”„«»]+$/g, "").trim();
    if (!text || text.length > MAX_FLAVOR_LENGTH) continue;
    if (isBareLabel(text)) {
      // Logged rather than dropped in silence: a run that keeps producing these
      // is the prompt losing its grip, and that is worth being able to see.
      console.warn(`[codex] Dropped a flavor text that is a name, not a line: "${text}"`);
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    if (PROMPT_EXAMPLES.has(key)) {
      console.warn(`[codex] Dropped a flavor text copied from the prompt's own examples: "${text}"`);
      continue;
    }

    // "inside joke", "running joke" and "joke" are all the same kind.
    const said = String(row?.kind ?? "").toLowerCase();
    const kind: FlavorKind = said.includes("joke") ? "joke" : said.includes("refer") ? "reference" : "quote";

    // Past the cap, a format line is dropped rather than demoted to the work:
    // it names nothing in the work, so filing it under the title would be a lie.
    const isMedium = String(row?.scope ?? "").toLowerCase().startsWith("medium");
    if (isMedium && medium >= MAX_MEDIUM_FLAVOR_TEXTS) continue;
    if (isMedium) medium++;

    /**
     * Anything sourced to the press tour is not a quote, and only one of them
     * gets in at all.
     *
     * A line the marketing wrote or a director said at a showcase can be a
     * `reference` — a fact about the work — but it is never a `quote`, because
     * nothing said ABOUT a work is inside it. Demoting rather than dropping
     * keeps the genuinely interesting production fact; the cap stops the list
     * turning into a press kit.
     */
    const attributionRaw = String(row?.attribution ?? "").trim();
    let finalKind = kind;
    if (!isMedium && attributionRaw && OUTSIDE_THE_WORK.test(attributionRaw)) {
      if (outside >= 1) {
        console.warn(`[codex] Dropped a flavor text sourced outside the work: "${text}" (${attributionRaw})`);
        continue;
      }
      outside++;
      if (finalKind === "quote") {
        console.warn(`[codex] Refiled a flavor text as a reference — it is not from inside the work: "${text}" (${attributionRaw})`);
        finalKind = "reference";
      }
    }

    seen.add(key);
    const entry: CodexFlavorText = { text, kind: finalKind, scope: isMedium ? "medium" : "work" };
    const attribution = attributionRaw;
    const why = String(row?.why ?? "").trim();
    // Nobody in particular says a format line, so an attribution on one is the
    // model having ignored the rule rather than information worth keeping.
    if (!isMedium && attribution && !/^(unknown|n\/?a|none)$/i.test(attribution)) entry.attribution = attribution;
    if (why && !/^(unknown|n\/?a|none)$/i.test(why)) entry.why = why;

    out.push(entry);
    if (out.length >= MAX_FLAVOR_TEXTS) break;
  }
  return out;
}

/** What the research actually landed on, so a wrong match can be spotted. */
export interface CodexIdentification {
  title?: string;
  year?: number | string;
  /** Which season the research settled on, for series entries. */
  season?: number | string;
  type?: string;
  creator?: string;
  why?: string;
  alternatives?: string[];
  /**
   * Every other name the work goes by — original-language title, romanisation,
   * regional titles, abbreviations, what its wiki files it under. The facet
   * searches are keyed on these, which is how the detailed material gets found.
   */
  alsoKnownAs?: string[];
}

/**
 * How well-supported each part of the dossier is.
 *
 * One global flag used to tar everything with the weakest section: research can
 * be certain about the cast and vague about the soundtrack, and a consumer that
 * only reads the cast should not be told the whole thing is shaky.
 */
export type CodexSectionConfidence = Partial<Record<"identity" | Facet, string>>;

/**
 * How a section was produced: looked up, or written from the model's own memory.
 *
 * Recorded because the two are not equally trustworthy and the difference is
 * invisible in the result. A section the model wrote from recall about an
 * obscure work is exactly where invention creeps in, so it is marked rather than
 * left to look identical to a researched one.
 */
export type CodexSectionSourcing = Partial<Record<Facet, "searched" | "recalled">>;

export interface CodexData {
  identifiedAs?: CodexIdentification;
  /** The spoiler-free hook — what someone would be told before starting. */
  premise?: string;
  overview?: string;
  setting?: string;
  tone?: string;
  themes?: string[];
  /** How it is organised: arcs, routes, seasons, volumes, acts, chapters. */
  structure?: string;
  /** What separates it from the obvious comparisons. Feeds tagging. */
  distinctive?: string;
  /** The tensions that actually drive the work, and what is at stake in each. */
  conflicts?: string[];
  /** The formal systems the world runs on: magic, tech, rank, law, economy. */
  worldRules?: string;
  /** The texture of ordinary life in it. */
  everydayLife?: string;
  /** Who made it and how; notable development or production history. */
  production?: string;
  /** How it landed: reputation, awards, controversy, what it influenced. */
  reception?: string;
  /** Famous setpieces and beats, kept clear of endings. */
  signatureMoments?: string[];
  /** Its sonic identity: score, instrumentation, signature sounds. */
  soundAndMusic?: string;
  /** Who it is for, and what a reader should be warned about. */
  audience?: string;
  contentWarnings?: string[];
  /** Sibling works — sequels, adaptations, entries in the same franchise. */
  relatedWorks?: string[];
  artStyle?: {
    summary?: string;
    medium?: string;
    palette?: string;
    iconography?: string;
    /** How it is lit, and in what weather and time of day it usually sits. */
    lighting?: string;
    /** Line quality, rendering, texture, resolution of detail. */
    linework?: string;
    /** How shots are framed and composed in this work. */
    composition?: string;
    /** The design language of its people and creatures. */
    characterDesign?: string;
    /**
     * Short named craft phrases that brief this look — the medium, technique,
     * era or school. These are what an image model actually keys on: "ligne
     * claire" moves a picture, "atmospheric" does not.
     */
    styleKeywords?: string[];
    /** The wrong default someone unfamiliar would reach for. */
    notLike?: string;
    /**
     * What form the work actually takes.
     *
     * Everything else in this block is read through it: "line quality" means
     * nothing for a live-action drama and "film grain" means nothing for a
     * webcomic, so the labels shown for these fields are chosen from here rather
     * than assuming everything is drawn.
     */
    form?: string;
  };
  characters?: CodexEntity[];
  /** Who and what stands in opposition — people, groups, forces, creature types. */
  antagonists?: CodexEntity[];
  factions?: CodexEntity[];
  locations?: CodexEntity[];
  items?: CodexEntity[];
  terminology?: CodexTerm[];
  /**
   * The three to six lines this work is known by.
   *
   * Absent on every dossier compiled before this existed, and deliberately not
   * backfilled — the library falls back to its built-in set for those, and they
   * pick these up whenever they are next re-researched.
   */
  flavorTexts?: CodexFlavorText[];
  genres?: string[];
  tags?: string[];
  creators?: string;
  releaseYear?: number | string;
  confidence?: string;
  /** Per-section confidence, so one weak area does not discredit the rest. */
  sectionConfidence?: CodexSectionConfidence;
  /** Which sections were looked up and which were written from recall. */
  sectionSourcing?: CodexSectionSourcing;
  notes?: string;
  sources?: string[];

  /**
   * Fields from dossiers compiled before the Codex became a reference work
   * rather than a template. Still rendered so old entries do not go blank, but
   * nothing asks for them any more.
   */
  /** @deprecated superseded by `antagonists`. */
  enemies?: CodexEntity[];
  /** @deprecated folded into `worldRules`. */
  powerScale?: string;
}

export interface CodexRow {
  id: string;
  userId: string;
  mediaId: string | null;
  titleKey: string;
  title: string;
  mediaType: string;
  status: "generating" | "ready" | "failed";
  error: string | null;
  data: CodexData | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Identity of a Codex: the work it describes, not the row it hangs off.
 *
 * The year is part of that identity. "Avatar: The Last Airbender" is a 2005
 * series and a 2024 series; without the year they would share one dossier and
 * whichever was researched first would win.
 *
 * So is the season. Each season of a series is its own entry in the library, and
 * a dossier for the whole show would describe a cast and a set of antagonists
 * that the season being tracked has not met yet — and spoil the ones it has not
 * reached.
 */
export function codexTitleKey(
  title: string,
  mediaType: string,
  year?: number | null,
  season?: number | null,
): string {
  const base = `${(title || "").trim().toLowerCase().replace(/\s+/g, " ")}::${(mediaType || "").trim().toLowerCase()}`;
  const withYear = year ? `${base}::${year}` : base;
  return season ? `${withYear}::s${season}` : withYear;
}

function hydrate(row: any): CodexRow | null {
  if (!row) return null;
  let data: CodexData | null = null;
  if (row.data) {
    try { data = JSON.parse(row.data); } catch (_) { data = null; }
  }
  return { ...row, data };
}

const list = (v: any): any[] => (Array.isArray(v) ? v : []);

/** Media rows store arrays as JSON text; the Codex subject wants real arrays. */
function safeList(value: any): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Human names for the research sections, used when reporting confidence. */
export const SECTION_LABEL: Record<string, string> = {
  identity: "which work this is",
  cast: "the cast",
  conflict: "conflicts & opposition",
  world: "places, factions & vocabulary",
  things: "notable objects",
  craft: "style, production & themes",
};

/**
 * The work's visual language, on its own.
 *
 * `codexPromptBlock` renders the whole dossier and flattens the eight art-style
 * fields into one pipe-joined line somewhere after the cast, the factions and
 * the terminology. For a reader that is fine. For an art director it is the one
 * section that matters buried among the ones that do not, and the resulting
 * images drifted toward whatever the image model considers default — which for
 * most works is flat cartoon vector art, the exact failure the enemy prompt has
 * always had a line telling it to avoid.
 *
 * So this pulls the visual identity out and lays it out as a style sheet, to be
 * given its own place in the prompt. `styleKeywords` leads because short named
 * craft terms are what an image model actually keys on, and `notLike` is stated
 * as the wrong default to steer off rather than as a general negative.
 */
export function codexArtStyleBlock(codex: CodexRow | null): string {
  const art = codex?.data?.artStyle;
  if (!art) return "";

  const keywords = (art.styleKeywords || []).map((k) => String(k).trim()).filter(Boolean);
  const form = String(art.form || "").toLowerCase();
  const photographic = /live action|photograph/.test(form);
  const rendered = /3d|render/.test(form);

  // The same three fields mean different things depending on what the work is,
  // and labelling them all as drawing was the bug: it invited a live-action
  // series to be described as though somebody had inked it.
  const surfaceLabel = photographic
    ? "Film stock, grain & grade"
    : rendered
      ? "Rendering, materials & post-processing"
      : "Line, texture & rendering";
  const framingLabel = photographic ? "Camera, lens & framing" : "Framing & composition";
  const peopleLabel = photographic
    ? "Casting, costume & make-up look"
    : rendered
      ? "Character models & design language"
      : "How its people and creatures look";

  const rows: [string, string | undefined][] = [
    ["Form", art.form],
    ["Named style", keywords.length ? keywords.join(", ") : undefined],
    ["In one line", art.summary],
    ["Medium & technique", art.medium],
    ["Palette", art.palette],
    ["Light & weather", art.lighting],
    [surfaceLabel, art.linework],
    [framingLabel, art.composition],
    [peopleLabel, art.characterDesign],
    ["Recurring motifs & emblems", art.iconography],
  ];

  const lines = rows
    .filter(([, v]) => v && String(v).trim())
    .map(([label, v]) => `${label}: ${String(v).trim()}`);
  if (!lines.length) return "";

  if (art.notLike && art.notLike.trim()) {
    lines.push(`Commonly pictured wrong as: ${art.notLike.trim()} — this work does not look like that.`);
  }
  if (/^none/.test(form)) {
    lines.push(
      "This work has no rendered form of its own — everything above is the visual register it is ASSOCIATED with, not a style it was drawn in. Treat it as a direction to work in, not a look to reproduce.",
    );
  }
  return [`— HOUSE STYLE OF THIS WORK —`, ...lines].join("\n");
}

/**
 * Renders a Codex as the reference section other prompts read.
 *
 * Laid out as an encyclopedia entry — the work, then its world, its cast, its
 * conflicts, its objects, its style — rather than as a set of lists a generator
 * could pick from. That ordering is doing real work: a consumer that opens with
 * "here is what is true about this thing" writes something new out of it, where
 * one that opens with a graded roster of candidates just picks a row.
 */
export function codexPromptBlock(codex: CodexRow | null): string {
  const d = codex?.data;
  if (!d) return "";

  const identified = d.identifiedAs;
  const heading = identified?.title
    ? `=== CODEX: "${identified.title}"${identified.year ? ` (${identified.year}` : " ("}${identified.type ? `${identified.year ? ", " : ""}${identified.type}` : ""}) ===`
    : `=== CODEX: "${codex!.title}" (${codex!.mediaType}) ===`;
  const lines: string[] = [heading];
  if (identified?.title) {
    lines.push(`This dossier describes that exact work — not a same-named adaptation, remake or original.`);
  }
  lines.push(
    `It is a REFERENCE on the work, not a set of ready-made pieces. Nothing in it has been graded, ranked or reserved for any purpose. Build what you need out of these facts; do not lift an entry wholesale, and do not assume the order things appear in means anything.`,
  );
  // Downstream generators need to know the scope, or an enemy written from a
  // season-1 dossier will reach for a villain the user has not met.
  if (identified?.season) {
    lines.push(
      `SCOPE: season ${identified.season} only. Everything below is that season's own cast, antagonists and vocabulary.`,
      `Do not invent or reference anything from a later season.`,
    );
  }

  const push = (label: string, value?: string) => {
    if (value && value.trim()) lines.push(`${label}: ${value.trim()}`);
  };
  const section = (title: string) => lines.push("", `— ${title} —`);
  const bullets = (label: string, values: any, limit: number) => {
    const rows = list(values).filter(Boolean).slice(0, limit);
    if (rows.length) lines.push(`${label}:`, ...rows.map((v: any) => `  - ${v}`));
  };

  /** Where a thing first appears, rendered only when the research knew. */
  const introOf = (e: any): string => {
    const at = String(e.introducedAt || "").trim();
    const pct = Number(e.introducedPct);
    if (at) return `from ${at}${Number.isFinite(pct) && pct > 0 ? ` (~${Math.round(pct)}%)` : ""}`;
    return Number.isFinite(pct) && pct > 0 ? `from ~${Math.round(pct)}% in` : "";
  };

  // Limits are generous on purpose: the dossier is compiled once and read by
  // everything, and a consumer that only needs part of a list can ignore the
  // rest far more easily than it can invent what was never researched.
  const pushEntities = (label: string, entries: any[], limit = 20) => {
    const rendered = entries
      .filter((e) => e && e.name)
      .slice(0, limit)
      .flatMap((e) => {
        const qualifier = [
          e.role,
          e.prominence,
          e.nature,
          e.affiliation,
          e.region ? `in ${e.region}` : "",
          e.opposedTo ? `against ${e.opposedTo}` : "",
          e.opposes ? `opposes ${e.opposes}` : "",
          introOf(e),
        ].filter(Boolean).join(", ");
        const aka = list(e.aliases).filter(Boolean).slice(0, 4);
        const head = `  - ${e.name}${aka.length ? ` (aka ${aka.join(", ")})` : ""}${qualifier ? ` [${qualifier}]` : ""}${e.description ? `: ${e.description}` : ""}`;

        // The specifics go on their own line so the headline stays scannable.
        const detail = [
          e.appearance ? `looks: ${e.appearance}` : "",
          e.material ? `made of: ${e.material}` : "",
          e.abilities ? `capable of: ${e.abilities}` : "",
          e.methods ? `operates by: ${e.methods}` : "",
          e.motivation ? `wants: ${e.motivation}` : "",
          e.goal ? `wants: ${e.goal}` : "",
          e.purpose ? `used for: ${e.purpose}` : "",
          e.significance ? `matters because: ${e.significance}` : "",
          e.owner ? `belongs to: ${e.owner}` : "",
          e.origin ? `origin: ${e.origin}` : "",
          e.personality ? `manner: ${e.personality}` : "",
          e.relationships ? `connected to: ${e.relationships}` : "",
          e.status ? `status: ${e.status}` : "",
          e.atmosphere ? `feels: ${e.atmosphere}` : "",
          e.whatHappensThere ? `where: ${e.whatHappensThere}` : "",
          e.symbol ? `emblem: ${e.symbol}` : "",
          e.colors ? `colours: ${e.colors}` : "",
          list(e.members).length ? `members: ${list(e.members).slice(0, 6).join(", ")}` : "",
        ].filter(Boolean).join(" | ");

        return detail ? [head, `      ${detail}`] : [head];
      });
    if (rendered.length) lines.push(`${label}:`, ...rendered);
  };

  section("THE WORK");
  push("Premise", d.premise);
  push("Overview", d.overview);
  push("Tone", d.tone);
  push("Structure & pacing", d.structure);
  push("What sets it apart", d.distinctive);
  if (list(d.themes).length) push("Themes", list(d.themes).join(", "));
  bullets("Signature moments", d.signatureMoments, 8);

  section("THE WORLD");
  push("Setting", d.setting);
  // `powerScale` is what the old, template-shaped dossiers called this.
  push("How it works", d.worldRules || d.powerScale);
  push("Everyday life", d.everydayLife);
  pushEntities("Places", list(d.locations), 16);
  pushEntities("Factions & organizations", list(d.factions), 12);
  const terms = list(d.terminology)
    .filter((t) => t && t.term)
    .slice(0, 20)
    .map((t) => {
      const qualifier = [t.category, introOf(t)].filter(Boolean).join(", ");
      return `  - ${t.term}${qualifier ? ` [${qualifier}]` : ""}: ${t.meaning || ""}`;
    });
  if (terms.length) lines.push("In-universe vocabulary:", ...terms);

  section("THE CAST");
  pushEntities("Characters", list(d.characters));

  section("CONFLICT");
  bullets("Central tensions", d.conflicts, 8);
  // Old dossiers stored this as `enemies`, already graded; render it either way.
  pushEntities("Who and what stands in opposition", list(d.antagonists?.length ? d.antagonists : d.enemies));

  section("OBJECTS");
  pushEntities("Notable objects", list(d.items));

  section("STYLE");
  if (d.artStyle) {
    const art = [
      d.artStyle.summary, d.artStyle.medium, d.artStyle.palette,
      d.artStyle.lighting, d.artStyle.linework, d.artStyle.composition,
      d.artStyle.characterDesign, d.artStyle.iconography,
    ].filter(Boolean).join(" | ");
    push("Visual identity", art);
  }
  push("Sound & music", d.soundAndMusic);

  section("PRODUCTION & RECEPTION");
  push("Creators", d.creators);
  if (d.releaseYear) push("Released", String(d.releaseYear));
  push("How it was made", d.production);
  push("How it landed", d.reception);
  if (list(d.relatedWorks).length) push("Related works", list(d.relatedWorks).slice(0, 8).join(" · "));

  section("CLASSIFICATION");
  if (list(d.genres).length) push("Descriptive genres", list(d.genres).join(", "));
  if (list(d.tags).length) push("Descriptive tags", list(d.tags).join(", "));
  push("Audience", d.audience);
  if (list(d.contentWarnings).length) push("Content notes", list(d.contentWarnings).join(", "));
  if (list(identified?.alsoKnownAs).length) {
    push("Also known as", list(identified!.alsoKnownAs).slice(0, 6).join(" · "));
  }
  if (d.confidence && d.confidence !== "high") {
    push("Research confidence", `${d.confidence}${d.notes ? ` — ${d.notes}` : ""}`);
    // Naming the weak sections stops one shaky lookup discrediting the rest: a
    // dossier can be certain about the cast and vague about the soundtrack.
    const weak = Object.entries(d.sectionConfidence || {})
      .filter(([, grade]) => grade && grade !== "high")
      .map(([sec, grade]) => `${SECTION_LABEL[sec] || sec} (${grade})`);
    if (weak.length) push("Less certain about", weak.join(", "));
  }

  lines.push("=== END CODEX ===");
  return lines.join("\n");
}

/**
 * Loose family a free-text format name belongs to, for checking the research
 * against what the entry says it is.
 */
function typeFamily(value: string): string | null {
  const v = (value || "").toLowerCase();
  if (/visual novel|renpy|ren'py/.test(v)) return "visualnovel";
  if (/manga|manhwa|manhua/.test(v)) return "manga";
  if (/comic|graphic novel/.test(v)) return "comic";
  if (/audiobook|audio drama|podcast/.test(v)) return "audiobook";
  if (/series|show|tv|television|streaming|anime series|season|reality|documentary|docuseries|sport|racing|championship|league/.test(v)) return "series";
  if (/film|movie|feature/.test(v)) return "movie";
  if (/game|videogame/.test(v)) return "game";
  if (/book|novel|light novel|memoir|non-fiction/.test(v)) return "book";
  return null;
}

/**
 * How to name the wanted format when telling the model it got the wrong one.
 * The bare media type would send it hunting for the wrong thing on a retry:
 * "find the Audiobook of that name" is unhelpful when the entry is a podcast.
 */
const RETRY_LABEL: Record<string, string> = {
  Audiobook: "audiobook or podcast",
  Series: "episodic series",
  "Visual Novel": "visual novel",
};

/** Said once at the end, where the label alone would not be enough of a steer. */
const RETRY_HINT: Record<string, string> = {
  Series: " It may be fiction, a reality or competition show, a documentary series, or a sporting competition.",
  Audiobook: " If it is a podcast, describe the show itself rather than looking for a book.",
};

const OUR_FAMILY: Record<string, string> = {
  Game: "game",
  "Visual Novel": "visualnovel",
  Book: "book",
  Audiobook: "audiobook",
  Manga: "manga",
  Comic: "comic",
  Series: "series",
  Movie: "movie",
};

/**
 * Checks the work the model says it researched against what the entry claims.
 * Returns a correction to feed back into a second attempt, or null when it lines
 * up. This is the guard that catches "asked for the 2026 film, got the 2010 one".
 */
export function identificationProblem(identified: CodexIdentity, subject: CodexSubject): string | null {
  const wantYear = subjectYear(subject);
  const gotYear = Number(identified?.year || 0);

  if (wantYear && gotYear && Math.abs(gotYear - wantYear) > 1) {
    return `You named "${identified.title || subject.title}" from ${gotYear}, but the entry is the ${wantYear} ${subject.mediaType}. Those are different works.`;
  }

  const wantSeason = subjectSeason(subject);
  const gotSeason = Number(identified?.season || 0);
  if (wantSeason && gotSeason && gotSeason !== wantSeason) {
    return `You named season ${gotSeason}, but the entry is season ${wantSeason}. Identify season ${wantSeason}.`;
  }

  const wantFamily = OUR_FAMILY[subject.mediaType];
  const gotFamily = typeFamily(String(identified?.type || ""));
  // Only complain when the model named a format we recognise and it is a
  // different one — an unrecognised label is not evidence of anything.
  if (wantFamily && gotFamily && gotFamily !== wantFamily) {
    // A book and its audiobook are the same work; so is a game and its VN.
    const sameWork = [
      ["book", "audiobook"],
      ["game", "visualnovel"],
    ].some(([a, b]) => (wantFamily === a && gotFamily === b) || (wantFamily === b && gotFamily === a));
    if (!sameWork) {
      const wanted = RETRY_LABEL[subject.mediaType] || subject.mediaType.toLowerCase();
      const article = /^[aeiou]/i.test(wanted) ? "an" : "a";
      return `You named a ${identified.type}, but the entry is ${article} ${wanted}. Find the ${wanted}${wantYear ? ` from ${wantYear}` : ""} of that name.${RETRY_HINT[subject.mediaType] || ""}`;
    }
  }

  return null;
}

export type DepthGap = { key: string; have: number; want: number };

/**
 * Which of the dossier's lists came back under their floor, and by how much.
 *
 * Reporting only. This used to decide which subject areas to go and research
 * again, and that second round is gone: it cost extra calls, a second search
 * depth, and a window between a successful research pass and the dossier being
 * saved in which a network blip could lose all of it. A short list is now taken
 * as what the sources supported and logged so it is visible.
 */
export function depthGaps(data: CodexData): DepthGap[] {
  return Object.keys(FACET_FLOORS)
    .map((key) => {
      const rows = Array.isArray((data as any)?.[key]) ? (data as any)[key] : [];
      const have = rows.filter((e: any) => e && (e.name || e.term)).length;
      return { key, have, want: FACET_FLOORS[key] || 0 };
    })
    .filter((g) => g.have < g.want);
}

/**
 * How the dossier pass searches.
 *
 * Deep retrieval runs its own iterative queries instead of one, and that is what
 * makes a single call viable: it returns the breadth six separate standard
 * searches were being spent to approximate, without six chances to fail. A deep
 * search is roughly ten times a standard one, so this costs about what seven
 * standard searches did — the same money, spent once, on one attempt that
 * finishes.
 *
 * This is used for EVERY title, famous or obscure. There used to be a pass that
 * asked the model how much it already knew and skipped the search where it felt
 * confident; it saved a fraction of a cent and bought sections written from
 * memory, which is how a game every model claims to know ended up with a hostage
 * described as a helicopter pilot.
 *
 * The provider is left unset, which means NanoGPT's default (Linkup, $0.06 for a
 * deep search). Setting it to "tavily" here cuts that to about $0.016.
 */
const DOSSIER_SEARCH = { depth: "deep" as const };

/** Codex storage plus the on-demand generation the AI features call into. */
export function createCodexService({ db, onFlavorTexts }: {
  db: Db;
  /**
   * Where a dossier's researched lines go so the library can serve them.
   *
   * A callback rather than an import, so this service stays unaware of the
   * flavor library entirely — it researches, and something else decides what to
   * do with the result. It fires only once a real media row exists, which is why
   * adoption calls it too: a Codex compiled from the Add Media form has no entry
   * to hang lines off yet.
   */
  onFlavorTexts?: (userId: string, mediaId: string, mediaType: string, title: string, texts: CodexFlavorText[]) => void;
}) {
  function publishFlavorTexts(userId: string, row: any) {
    if (!onFlavorTexts || !row?.mediaId || !row?.data) return;
    try {
      const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      const texts = normalizeFlavorTexts(data?.flavorTexts);
      if (!texts.length) return;
      const media: any = db.prepare("SELECT title, mediaType FROM media WHERE id = ? AND userId = ?").get(row.mediaId, userId);
      if (!media) return;
      onFlavorTexts(userId, row.mediaId, media.mediaType, media.title, texts);
    } catch (e) {
      console.error("[codex] Could not publish flavor texts", e);
    }
  }
  // De-dupes concurrent generation of the same Codex: the Monday boss spawn and a
  // user hitting "Auto Tag" can land on the same title at the same moment.
  const inFlight = new Map<string, Promise<CodexRow | null>>();

  function getCodexRow(userId: string, opts: { mediaId?: string | null; title?: string; mediaType?: string; year?: number | null; season?: number | null }): CodexRow | null {
    if (opts.mediaId) {
      // Newest first, and explicitly so. Without an ORDER BY this returned
      // whichever row SQLite reached first, which is the oldest — so an entry
      // that had somehow acquired two Codexes would show the stale one forever
      // while the fresh one sat unread beside it. `generate` now keeps a single
      // row per entry, and this is the belt to that pair of braces.
      const byMedia = db
        .prepare("SELECT * FROM media_codex WHERE userId = ? AND mediaId = ? ORDER BY updatedAt DESC LIMIT 1")
        .get(userId, opts.mediaId);
      if (byMedia) return hydrate(byMedia);
    }
    if (opts.title && opts.mediaType) {
      const key = codexTitleKey(opts.title, opts.mediaType, opts.year, opts.season);
      const byTitle: any = db.prepare("SELECT * FROM media_codex WHERE userId = ? AND titleKey = ?").get(userId, key);
      if (byTitle) {
        // A Codex built before the entry was saved (or for a sibling re-run) gets
        // adopted by the first real media row that asks for it.
        if (opts.mediaId && !byTitle.mediaId) {
          db.prepare("UPDATE media_codex SET mediaId = ?, updatedAt = ? WHERE id = ?")
            .run(opts.mediaId, new Date().toISOString(), byTitle.id);
          byTitle.mediaId = opts.mediaId;
          // Its lines had nowhere to go until this moment.
          publishFlavorTexts(userId, byTitle);
        }
        return hydrate(byTitle);
      }
    }
    return null;
  }

  /** Resolves the media row a Codex request refers to, if it is a saved entry. */
  function resolveMedia(userId: string, mediaId?: string | null): any | null {
    if (!mediaId) return null;
    return db.prepare("SELECT * FROM media WHERE id = ? AND userId = ?").get(mediaId, userId) || null;
  }

  async function generate(
    userId: string,
    subject: CodexSubject & { mediaId?: string | null },
  ): Promise<CodexRow | null> {
    const aiConfig = getAiConfig(db, userId);
    if (!aiConfig) return null;

    const year = subjectYear(subject);
    const key = codexTitleKey(subject.title, subject.mediaType, year, subjectSeason(subject));
    const now = new Date().toISOString();

    /**
     * ONE CODEX PER ENTRY. The row an entry already has is the row it keeps.
     *
     * This used to key only on the title, and the title key carries the year:
     * `nukitashi::visual novel` before a year is known, `nukitashi::visual
     * novel::2019` after. So an entry whose year arrived later — a metadata
     * refresh, an edit — regenerated into a SECOND row, while the reader, which
     * looks up by `mediaId`, kept returning the first one. The result was a
     * Codex that visibly regenerated, was saved, was reported saved, and then
     * reverted to the old one the moment the card was reopened. Both rows were
     * real, both carried the same `mediaId`, and the writer and the reader were
     * simply not talking about the same one.
     *
     * So if this entry already has a Codex, that row is updated in place and its
     * title key is brought up to date. Any other row holding the key we are
     * moving onto, or any other row attached to this entry, is a duplicate of
     * the same work and goes.
     */
    let id: string | undefined;

    if (subject.mediaId) {
      const mine: any = db
        .prepare("SELECT id FROM media_codex WHERE userId = ? AND mediaId = ? ORDER BY updatedAt DESC LIMIT 1")
        .get(userId, subject.mediaId);
      if (mine) {
        db.prepare("DELETE FROM media_codex WHERE userId = ? AND id != ? AND (titleKey = ? OR mediaId = ?)")
          .run(userId, mine.id, key, subject.mediaId);
        db.prepare(
          `UPDATE media_codex
              SET titleKey = ?, title = ?, mediaType = ?, status = 'generating', error = NULL, updatedAt = ?
            WHERE id = ?`,
        ).run(key, subject.title, subject.mediaType, now, mine.id);
        id = mine.id;
      }
    }

    if (!id) {
      // No entry yet, or no Codex for it. Upsert on the title key, so two
      // requests that slip past the in-flight guard (a forced re-research racing
      // an implicit one) share a row instead of colliding on the unique index.
      db.prepare(
        `INSERT INTO media_codex (id, userId, mediaId, titleKey, title, mediaType, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 'generating', ?, ?)
         ON CONFLICT(userId, titleKey) DO UPDATE SET
           status = 'generating',
           error = NULL,
           mediaId = COALESCE(media_codex.mediaId, excluded.mediaId),
           updatedAt = excluded.updatedAt`,
      ).run(uuidv4(), userId, subject.mediaId || null, key, subject.title, subject.mediaType, now, now);

      id = (db.prepare("SELECT id FROM media_codex WHERE userId = ? AND titleKey = ?").get(userId, key) as any).id;
    }

    try {
      /**
       * ONE CALL. That is the whole procedure.
       *
       * What used to be here: an identify call, six facets each researched and
       * then separately structured, a self-assessment deciding which of them
       * could skip their search, and a gap-fill round afterwards. Fifteen calls,
       * three different search depths, and at any believable per-call success
       * rate a run that touches all of them fails about half the time. It did —
       * dossiers arriving with whole sections missing were routine.
       *
       * Collapsing it was tested before it was built: the same prompt, run once
       * by hand with deep retrieval against a game released that morning, came
       * back complete and accurate for $0.076 — against $0.0716 for the
       * fifteen-call version that kept losing sections. Deep retrieval runs its
       * own iterative queries, which is the thing the six separate searches were
       * being spent to imitate.
       *
       * A first cut of this kept a top-up round for the enumerable lists and a
       * shallower retry on timeout. Both are gone. They reintroduced exactly
       * what this replaced — extra calls, a second search depth, and a window
       * between a successful research pass and the dossier being saved in which
       * a network blip could still lose all of it. A slightly shorter list is
       * worth far more than another chance to fail.
       *
       * So: no second pass, no fallback depth, nothing between the answer and
       * the write. If this call fails, nothing is written and the previous
       * dossier (if any) is kept untouched.
       */
      const season = subjectSeason(subject);
      console.log(
        `[codex] Compiling the Codex for "${subject.title}"` +
        `${season ? ` season ${season}` : ""} (${subject.mediaType})` +
        ` — one deep-search pass, typically three to six minutes.`,
      );

      const raw = await nanoGenerateText(aiConfig, buildDossierPrompt(subject), {
        temperature: 0.2,
        tier: "analytical",
        webSearch: true,
        search: DOSSIER_SEARCH,
        json: true,
        scope: "codex",
        userId,
        /**
         * Room to actually finish, with a lot to spare.
         *
         * Nothing was sent here originally, so the provider chose, and its choice
         * for this model was 15,000 tokens — a dossier stopped mid-array with a
         * 200 and no error. On a thinking model that budget is shared with the
         * model's own reasoning, so the visible answer got whatever was left.
         *
         * This is a ceiling, not a target, and an unused ceiling is billed
         * nothing at all — so the only thing a low number can do is truncate a
         * dossier that had more to say. Long dossiers are wanted here, so the
         * ceiling is set well clear of any of them rather than close to the
         * largest seen so far.
         *
         * It cannot be raised alone. At the ~100 tokens/second these runs
         * actually produce, this much output is around sixteen minutes of
         * generation, so the timeout below has to clear it or a truncation
         * failure is simply traded for a timeout.
         */
        maxTokens: 96_000,
        /**
         * Streamed so the connection is never silent.
         *
         * Nothing shows the stream to anyone. It is here because a non-streamed
         * request sends no bytes while the model works, and something between
         * this server and the model closes a silent connection at 340 seconds —
         * measured three times to the millisecond, against a successful run of
         * 319. This is the longest request the app makes and the only one
         * anywhere near that wall.
         */
        stream: true,
        // A deep search runs several queries before the model writes a word, and
        // then it writes the whole dossier. Twenty-five minutes is generous on
        // purpose and sized to the ceiling above: 96,000 tokens at the ~100
        // tokens/second these runs produce is about sixteen minutes of writing,
        // plus a deep search in front of it. This call IS the Codex, so letting
        // it finish slowly beats losing all of it to the clock — and nothing is
        // written unless it succeeds, so a long wait costs only the wait.
        timeoutMs: 1_500_000,
      });

      const parsed = parseJsonLoose<any>(raw);
      if (!parsed || typeof parsed !== "object") {
        // Logged in full because there is no second pass to cover for it: if
        // this ever fires, the reply itself is the only evidence of why.
        console.error(`[codex] "${subject.title}" did not come back as JSON. Reply began: ${raw.slice(0, 400)}`);
        throw new Error("The research did not come back as a JSON object.");
      }

      /**
       * It parsed. That is not the same as it being a dossier.
       *
       * `parseJsonLoose` scans for balanced brackets so it can recover an answer
       * a model wrapped in prose, and that leniency has a failure mode: given a
       * document truncated part way through, the largest balanced thing in it is
       * not the dossier but some complete object nested inside it. A cut-off
       * Codex came back as a single character record — `{"name": …,
       * "description": …}` — which is valid JSON, is an object, and passed every
       * check above before being written to the database as a Codex containing
       * nothing whatsoever.
       *
       * So the shape is checked, not just the type. A real dossier has at least
       * one of the things a dossier is made of.
       */
      const DOSSIER_KEYS = [
        "identifiedAs", "premise", "overview", "characters", "conflicts",
        "antagonists", "locations", "factions", "terminology", "items", "artStyle", "flavorTexts",
      ];
      if (!DOSSIER_KEYS.some((k) => (parsed as any)[k] != null)) {
        console.error(
          `[codex] "${subject.title}" returned JSON that is not a dossier — keys: ${Object.keys(parsed).join(", ") || "(none)"}. ` +
          `This usually means the reply was cut off. Reply began: ${raw.slice(0, 400)}`,
        );
        throw new Error("The research came back as JSON, but not as a dossier — it was probably cut off.");
      }

      const data: CodexData = { ...parsed };

      const identity: CodexIdentity = {
        ...(parsed.identifiedAs && typeof parsed.identifiedAs === "object" ? parsed.identifiedAs : {}),
        sources: Array.isArray(parsed.sources) ? parsed.sources : undefined,
      };
      if (!identity.title) identity.title = subject.title;

      const problem = identificationProblem(identity, subject);
      if (problem) console.warn(`Codex may have identified the wrong work for "${subject.title}": ${problem}`);

      /**
       * What the dossier says about its own sourcing.
       *
       * Everything came out of the same searched pass, so every section is
       * "searched". The per-section confidence is the model's own, which is
       * worth more than one overall grade: it is where it admits which parts it
       * could not find much on.
       */
      const sectionConfidence: CodexSectionConfidence = {
        identity: identity.confidence,
        ...(parsed.sectionConfidence && typeof parsed.sectionConfidence === "object" ? parsed.sectionConfidence : {}),
      };
      const sectionSourcing: CodexSectionSourcing = {};
      for (const facet of FACETS) sectionSourcing[facet] = "searched";

      // The one field shown to the user word for word, so the three-to-six rule
      // is enforced here rather than left to the prompt's good manners.
      if (data.flavorTexts) data.flavorTexts = normalizeFlavorTexts(data.flavorTexts);

      data.identifiedAs = identity;
      data.sources = identity.sources || [];
      data.creators = identity.creator || data.creators;
      data.releaseYear = Number(identity.year) || subjectYear(subject) || undefined;
      data.sectionConfidence = sectionConfidence;
      data.sectionSourcing = sectionSourcing;
      data.notes = [
        identity.notes,
        problem ? `Could not confirm this is the right work: ${problem}` : "",
      ].filter(Boolean).join(" ") || undefined;

      // The dossier's overall confidence is the weakest thing in it, which is
      // fair because `sectionConfidence` says where the weakness actually is.
      const grades = Object.values(sectionConfidence).filter(Boolean) as string[];
      data.confidence = problem
        ? "low"
        : grades.includes("low") ? "low" : grades.includes("medium") ? "medium" : "high";

      // Reported rather than acted on. A short list is what the sources
      // supported, and chasing it costs another call and another chance to lose
      // the dossier that already arrived.
      const thin = depthGaps(data);
      if (thin.length) {
        console.log(`[codex] "${subject.title}" is light on ${thin.map((g) => `${g.key} ${g.have}/${g.want}`).join(", ")}.`);
      }

      db.prepare(
        `UPDATE media_codex SET data = ?, status = 'ready', error = NULL, model = ?, mediaId = COALESCE(mediaId, ?), updatedAt = ? WHERE id = ?`,
      ).run(JSON.stringify(data), aiConfig.webModel, subject.mediaId || null, new Date().toISOString(), id);
      console.log(`[codex] Saved the Codex for "${subject.title}" (confidence: ${data.confidence}).`);
    } catch (e: any) {
      console.error(`Codex generation failed for "${subject.title}"`, e);
      const message = String(e?.message || e).slice(0, 500);

      // A failed refresh must not cost a dossier that already worked.
      //
      // The row is flipped to 'generating' at the start, so a failure used to
      // leave it 'failed' — and the existing research, still sitting in `data`,
      // stopped being shown. Re-researching a good Codex on a bad afternoon
      // destroyed it. The previous document is kept and served as before; only
      // the error is recorded, so the panel can say the last refresh did not
      // take without pretending there is nothing on file.
      const existing: any = db.prepare("SELECT data FROM media_codex WHERE id = ?").get(id);
      const hasPrevious = !!existing?.data && existing.data !== "null";

      db.prepare("UPDATE media_codex SET status = ?, error = ?, updatedAt = ? WHERE id = ?")
        .run(hasPrevious ? "ready" : "failed", message, new Date().toISOString(), id);

      if (hasPrevious) {
        console.warn(`Kept the previous Codex for "${subject.title}"; the refresh failed and changed nothing.`);
      }
    }

    const finished: any = db.prepare("SELECT * FROM media_codex WHERE id = ?").get(id);
    // Re-research replaces the entry's lines rather than adding to them, which is
    // handled on the other side of this callback.
    publishFlavorTexts(userId, finished);
    return hydrate(finished);
  }

  /**
   * The entry point for every AI feature: returns this media's Codex, researching
   * it first if it does not have one yet. Returns null when AI is unconfigured, so
   * callers can fall back to their old, Codex-less behaviour.
   */
  async function ensureCodex(
    userId: string,
    subject: { mediaId?: string | null; title?: string; mediaType?: string; year?: number | null; force?: boolean },
  ): Promise<CodexRow | null> {
    const mediaRow = resolveMedia(userId, subject.mediaId);
    const title = (subject.title || mediaRow?.title || "").trim();
    const mediaType = (subject.mediaType || mediaRow?.mediaType || "").trim();
    if (!title || !mediaType) return null;

    // Everything the entry knows goes to the research, because identifying the
    // right work is the part that goes wrong: year and format separate a remake
    // from its original, and the synopsis catches the rest.
    const full: CodexSubject & { mediaId?: string | null } = {
      mediaId: subject.mediaId,
      title,
      mediaType,
      season: mediaRow?.season ?? null,
      subtitle: mediaRow?.subtitle || undefined,
      creator: mediaRow?.creator || undefined,
      publisher: mediaRow?.publisher || undefined,
      year: subject.year ?? mediaRow?.year ?? null,
      expectedReleaseDate: mediaRow?.expectedReleaseDate || null,
      releaseStatus: mediaRow?.releaseStatus || null,
      description: mediaRow?.description || undefined,
      franchises: safeList(mediaRow?.franchises),
      platforms: safeList(mediaRow?.platforms),
      language: mediaRow?.language || null,
    };
    const year = subjectYear(full);
    const season = subjectSeason(full);

    const existing = getCodexRow(userId, { mediaId: subject.mediaId, title, mediaType, year, season });
    if (existing && existing.status === "ready" && existing.data && !subject.force) return existing;

    const key = `${userId}:${codexTitleKey(title, mediaType, year, season)}`;
    const pending = inFlight.get(key);
    if (pending && !subject.force) return pending;

    const run = generate(userId, full).finally(() => {
      if (inFlight.get(key) === run) inFlight.delete(key);
    });
    inFlight.set(key, run);
    return run;
  }

  /**
   * Best-effort Codex for a background job: never throws and never blocks the
   * feature that asked for it. A failed lookup just means a Codex-less prompt.
   */
  async function tryEnsureCodex(userId: string, subject: { mediaId?: string | null; title?: string; mediaType?: string }): Promise<CodexRow | null> {
    try {
      return await ensureCodex(userId, subject);
    } catch (e) {
      console.error("Codex lookup failed", e);
      return null;
    }
  }

  return { getCodexRow, ensureCodex, tryEnsureCodex };
}

export type CodexService = ReturnType<typeof createCodexService>;
