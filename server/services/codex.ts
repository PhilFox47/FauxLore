import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";
import { getAiConfig, nanoGenerateText, parseJsonLoose } from "../lib/ai";
import {
  FACETS, FACET_FLOORS, FACET_FOR_KEY, FACET_SPECS, TYPE_BRIEF,
  buildFacetPrompt, buildIdentifyPrompt, buildStructurePrompt,
  subjectSeason, subjectYear,
  type CodexIdentity, type CodexSubject, type Facet, type ResearchContext,
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
export function normalizeFlavorTexts(value: any): CodexFlavorText[] {
  if (!Array.isArray(value)) return [];
  const out: CodexFlavorText[] = [];
  const seen = new Set<string>();
  let medium = 0;

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

    // "inside joke", "running joke" and "joke" are all the same kind.
    const said = String(row?.kind ?? "").toLowerCase();
    const kind: FlavorKind = said.includes("joke") ? "joke" : said.includes("refer") ? "reference" : "quote";

    // Past the cap, a format line is dropped rather than demoted to the work:
    // it names nothing in the work, so filing it under the title would be a lie.
    const isMedium = String(row?.scope ?? "").toLowerCase().startsWith("medium");
    if (isMedium && medium >= MAX_MEDIUM_FLAVOR_TEXTS) continue;
    if (isMedium) medium++;

    seen.add(key);
    const entry: CodexFlavorText = { text, kind, scope: isMedium ? "medium" : "work" };
    const attribution = String(row?.attribution ?? "").trim();
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

/**
 * How many entries each list should carry before the research counts as thin,
 * and which facet to re-run when one of them does.
 */
export const DEPTH_FLOORS = FACET_FLOORS;

export type DepthGap = { key: string; have: number; want: number; facet: Facet };

/** Which of the dossier's lists came back under their floor, and by how much. */
export function depthGaps(data: CodexData): DepthGap[] {
  return Object.keys(FACET_FLOORS)
    .map((key) => {
      const rows = Array.isArray((data as any)?.[key]) ? (data as any)[key] : [];
      const have = rows.filter((e: any) => e && (e.name || e.term)).length;
      return { key, have, want: FACET_FLOORS[key] || 0, facet: FACET_FOR_KEY[key] };
    })
    .filter((g) => g.have < g.want);
}

/**
 * Whether a thin dossier is worth re-running the facets that came up short.
 *
 * Faceted research rarely comes back empty, so this is deliberately reluctant: a
 * genuinely small work is allowed to be short. It fires when the shortfall is
 * broad (three or more lists under floor) or when one of the two lists the enemy
 * forge draws from came back less than half full.
 */
export function needsExpansion(gaps: DepthGap[]): boolean {
  if (gaps.length >= 3) return true;
  return gaps.some((g) => (g.key === "characters" || g.key === "enemies") && g.have * 2 < g.want);
}

/** The facets to re-run for a set of gaps, each with what it already found. */
export function expansionPlan(data: CodexData, gaps: DepthGap[]): { facet: Facet; alreadyFound: string[] }[] {
  const byFacet = new Map<Facet, Set<string>>();
  for (const gap of gaps) {
    if (!gap.facet) continue;
    const found = byFacet.get(gap.facet) || new Set<string>();
    // A facet fills several lists, so re-running it must be told about all of
    // them — otherwise it returns the locations it already found while hunting
    // for the terminology it missed.
    for (const key of FACET_SPECS[gap.facet].keys) {
      for (const row of (Array.isArray((data as any)[key]) ? (data as any)[key] : [])) {
        const name = String(row?.name || row?.term || "").trim();
        if (name) found.add(name);
      }
    }
    byFacet.set(gap.facet, found);
  }
  return [...byFacet].map(([facet, found]) => ({ facet, alreadyFound: [...found] }));
}

/**
 * Folds an expansion pass into the dossier: new names are appended, existing
 * ones are left exactly as they were researched the first time.
 */
export function mergeExpansion(data: CodexData, extra: any, keys: string[]): CodexData {
  if (!extra || typeof extra !== "object") return data;
  const merged: any = { ...data };
  const nameOf = (e: any) => String(e?.name || e?.term || "").trim().toLowerCase();

  for (const key of keys) {
    const incoming = Array.isArray(extra[key]) ? extra[key] : [];
    if (!incoming.length) continue;
    const current: any[] = Array.isArray((merged as any)[key]) ? (merged as any)[key] : [];
    const seen = new Set(current.map(nameOf).filter(Boolean));
    for (const row of incoming) {
      const name = nameOf(row);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      current.push(row);
    }
    merged[key] = current;
  }
  return merged;
}

/**
 * How many research calls may be in flight at once.
 *
 * All six facets used to fire together. Each one is a retrieval request, and six
 * simultaneous ones at a provider that is already busy is the shape that gets
 * rate-limited, queued past the timeout, or simply dropped — which is why the
 * failures landed on different facets every run and occasionally on all of them.
 * Two at a time takes longer in the best case and finishes far more often, which
 * is the trade worth making for something that runs once per title.
 */
const RESEARCH_CONCURRENCY = 2;

/**
 * Runs tasks a few at a time, settling every one.
 *
 * Same result shape as `Promise.allSettled`, and the same order, so callers that
 * pair results back to their inputs by index keep working.
 */
export async function settleWithLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

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
      const byMedia = db.prepare("SELECT * FROM media_codex WHERE userId = ? AND mediaId = ?").get(userId, opts.mediaId);
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

    // Upsert on the title key, so two requests that slip past the in-flight guard
    // (a forced re-research racing an implicit one) share a row instead of
    // colliding on the unique index.
    db.prepare(
      `INSERT INTO media_codex (id, userId, mediaId, titleKey, title, mediaType, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'generating', ?, ?)
       ON CONFLICT(userId, titleKey) DO UPDATE SET
         status = 'generating',
         error = NULL,
         mediaId = COALESCE(media_codex.mediaId, excluded.mediaId),
         updatedAt = excluded.updatedAt`,
    ).run(uuidv4(), userId, subject.mediaId || null, key, subject.title, subject.mediaType, now, now);

    const id = (db.prepare("SELECT id FROM media_codex WHERE userId = ? AND titleKey = ?").get(userId, key) as any).id;

    try {
      // ROUND 1 — settle which work this is, and what else it is called.
      // Short prompt on purpose: `:online` keys its search on the message, so a
      // long one buries the only thing this call needs to find.
      const identify = async (correction?: string): Promise<CodexIdentity> => {
        const raw = await nanoGenerateText(aiConfig, buildIdentifyPrompt(subject, correction), {
          temperature: 0.1,
          webSearch: true,
          tier: "analytical",
        });
        if (!raw) throw new Error("The model could not identify this work.");
        const parsed = parseJsonLoose<CodexIdentity>(raw);
        if (!parsed || typeof parsed !== "object") throw new Error("The identification was not a JSON object.");
        return parsed;
      };

      let identity = await identify();
      let problem = identificationProblem(identity, subject);
      if (problem) {
        // One correction. Cheap now that it is only the identification being
        // redone rather than the whole dossier.
        console.warn(`Codex identified the wrong work for "${subject.title}": ${problem} Retrying.`);
        try {
          const retry = await identify(problem);
          identity = retry;
          problem = identificationProblem(retry, subject);
        } catch (e) {
          console.error("Codex identification retry failed; keeping the first answer", e);
        }
      }

      const ctx: ResearchContext = { subject, identity };

      /**
       * Every facet is looked up. There is no longer a pass that decides some
       * need not be.
       *
       * That pass existed to save search fees, on the understanding that
       * retrieval was what a dossier cost. Measured against a real run it is
       * not: output tokens were 78% of the bill and searches 17%, so skipping a
       * search saved a sixth of a cent and bought a section written from memory
       * — which on Far Cry 3, a game any model claims to know, put a hostage
       * down as a helicopter pilot, moved a recluse into a clinic, and spelled
       * both credited creators wrong. Two sections even disagreed with each
       * other about what the same antagonist looked like, because neither was
       * grounded in anything.
       *
       * Capping how much each facet writes saves more than skipping every search
       * ever did, and costs nothing that matters. So the budget goes there, and
       * retrieval goes back to being unconditional.
       */
      const searched = new Set<Facet>(FACETS);

      /**
       * Facets that gave up on retrieval and answered from memory instead.
       *
       * Tracked so the dossier can say so. A recalled section is not as good as
       * a researched one and the difference has to stay visible.
       */
      const fellBackToRecall = new Set<Facet>();

      const researchFacet = async (facet: Facet, alreadyFound?: string[]): Promise<string> => {
        const prompt = buildFacetPrompt(ctx, facet, alreadyFound);
        const wanted = searched.has(facet);

        const ask = (webSearch: boolean) =>
          nanoGenerateText(aiConfig, prompt, { temperature: 0.2, webSearch, tier: "analytical" });

        let prose = "";
        try {
          prose = await ask(wanted);
        } catch (e: any) {
          // A retrieval call that runs out of time is the one failure worth
          // retrying differently rather than simply repeating. Search plus a long
          // generation is what exceeds the clock; the same model answering from
          // its own knowledge finishes comfortably — which is exactly what the
          // un-searched facets in the same run demonstrate. A section written
          // from memory and labelled as such beats an empty one, and repeating
          // the search would spend another search fee to time out again.
          const timedOut = e?.name === "TimeoutError" || /timeout|aborted/i.test(String(e?.message || ""));
          if (!wanted || !timedOut) throw e;
          console.warn(`[codex] "${facet}" timed out while searching; retrying from the model's own knowledge`);
          prose = await ask(false);
          fellBackToRecall.add(facet);
          // Do not pay for that search again. The gap-fill re-runs whichever
          // facets came back thin, and without this it would attempt the very
          // retrieval that has just been shown to exceed the clock — another
          // search fee, another wait, the same result.
          searched.delete(facet);
        }

        if (!prose) throw new Error(`The ${facet} research came back empty.`);
        return prose;
      };

      /**
       * Turn one facet's prose into the dossier's shape.
       *
       * The unparseable answer is retried, and it is worth being clear about why
       * this is not the same retry `nanoGenerateText` already does. That one
       * handles a provider that did not reply. This one handles a provider that
       * replied with something that is not JSON — a reasoning model narrating
       * its way to an answer, a truncated object, a fence inside a fence. The
       * request succeeded, so nothing below would try again, and the section was
       * thrown away along with the retrieval that had just been paid for.
       * Asking a second time costs one cheap unsearched call and usually lands.
       */
      const structureFacet = async (facet: Facet, prose: string): Promise<any> => {
        let last: any = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          const raw = await nanoGenerateText(aiConfig, buildStructurePrompt(ctx, facet, prose), {
            temperature: 0.1,
            tier: "analytical",
          });
          try {
            const parsed = parseJsonLoose<any>(raw);
            if (!parsed || typeof parsed !== "object") throw new Error(`The ${facet} section was not a JSON object.`);
            return parsed;
          } catch (e) {
            last = e;
            if (attempt === 1) {
              console.warn(`[codex] "${facet}" did not come back as JSON; asking once more`);
            }
          }
        }
        throw last;
      };

      const runFacet = async (facet: Facet, alreadyFound?: string[]) =>
        structureFacet(facet, await researchFacet(facet, alreadyFound));

      const settled = await settleWithLimit(FACETS.map((f) => () => runFacet(f)), RESEARCH_CONCURRENCY);

      // A facet that fails costs its own section, not the dossier. Losing the
      // cast list is bad; losing the whole Codex over a soundtrack lookup is worse.
      let data: CodexData = { identifiedAs: identity, sources: identity.sources || [] };
      const sectionConfidence: CodexSectionConfidence = { identity: identity.confidence };
      const sectionSourcing: CodexSectionSourcing = {};
      const failed: string[] = [];

      settled.forEach((result, i) => {
        const facet = FACETS[i];
        if (result.status !== "fulfilled") {
          failed.push(facet);
          sectionConfidence[facet] = "low";
          console.error(`Codex facet "${facet}" failed for "${subject.title}"`, result.reason);
          return;
        }
        sectionConfidence[facet] = result.value.confidence || "medium";
        sectionSourcing[facet] = searched.has(facet) ? "searched" : "recalled";
        for (const key of FACET_SPECS[facet].keys) {
          const value = result.value[key];
          if (value !== undefined && value !== null && value !== "") (data as any)[key] = value;
        }
      });

      if (failed.length === FACETS.length) {
        const why = settled
          .map((r, i) => (r.status === "rejected" ? `${FACETS[i]}: ${String((r as any).reason?.message || (r as any).reason).slice(0, 80)}` : ""))
          .filter(Boolean)
          .join(" · ");
        throw new Error(`Every research pass failed — ${why}`);
      }

      // The one field shown to the user word for word, so the three-to-six rule
      // is enforced here rather than left to the prompt's good manners.
      if (data.flavorTexts) data.flavorTexts = normalizeFlavorTexts(data.flavorTexts);

      data.creators = identity.creator || data.creators;
      data.releaseYear = identity.year || subjectYear(subject) || undefined;
      data.sectionConfidence = sectionConfidence;
      data.sectionSourcing = sectionSourcing;
      data.notes = [identity.notes, failed.length ? `Research incomplete for: ${failed.join(", ")}.` : ""]
        .filter(Boolean).join(" ") || undefined;

      // The dossier's overall confidence is now the weakest thing in it, which is
      // only fair because `sectionConfidence` says where the weakness actually is.
      const grades = Object.values(sectionConfidence).filter(Boolean) as string[];
      data.confidence = grades.includes("low") ? "low" : grades.includes("medium") ? "medium" : "high";

      if (problem) {
        data.confidence = "low";
        data.notes = [`Could not confirm this is the right work: ${problem}`, data.notes].filter(Boolean).join(" ");
      } else {
        // Faceted research rarely comes up short, but when it does the fix is to
        // re-run only the facets that did, telling them what they already found.
        const gaps = depthGaps(data);
        if (needsExpansion(gaps)) {
          const plan = expansionPlan(data, gaps);
          console.warn(
            `Codex for "${subject.title}" came back thin (${gaps.map((g) => `${g.key} ${g.have}/${g.want}`).join(", ")}). Re-running: ${plan.map((p) => p.facet).join(", ")}.`,
          );
          const refills = await settleWithLimit(plan.map((p) => () => runFacet(p.facet, p.alreadyFound)), RESEARCH_CONCURRENCY);
          refills.forEach((result, i) => {
            const facet = plan[i].facet;
            if (result.status !== "fulfilled") {
              console.error(`Codex gap-fill for "${facet}" failed; keeping the first pass`, result.reason);
              return;
            }
            data = mergeExpansion(data, result.value, FACET_SPECS[facet].keys);

            // A repaired section is no longer a failed one. Without this the
            // dossier contradicted itself: a full cast list under a heading
            // saying the cast could not be researched, and a note listing every
            // facet as incomplete when the retry had already filled them in.
            const stillFailed = failed.indexOf(facet);
            if (stillFailed !== -1) failed.splice(stillFailed, 1);
            sectionConfidence[facet] = result.value.confidence || "medium";
            sectionSourcing[facet] = searched.has(facet) ? "searched" : "recalled";
          });
        }
      }

      // Restated after the gap-fill, since a successful retry changes both what
      // is missing and how confident the dossier as a whole should sound.
      data.sectionConfidence = sectionConfidence;
      data.sectionSourcing = sectionSourcing;
      data.notes = [
        identity.notes,
        problem ? `Could not confirm this is the right work: ${problem}` : "",
        failed.length ? `Research incomplete for: ${failed.join(", ")}.` : "",
      ].filter(Boolean).join(" ") || undefined;
      const finalGrades = Object.values(sectionConfidence).filter(Boolean) as string[];
      data.confidence = problem
        ? "low"
        : finalGrades.includes("low") ? "low" : finalGrades.includes("medium") ? "medium" : "high";

      db.prepare(
        `UPDATE media_codex SET data = ?, status = 'ready', error = NULL, model = ?, mediaId = COALESCE(mediaId, ?), updatedAt = ? WHERE id = ?`,
      ).run(JSON.stringify(data), aiConfig.webModel, subject.mediaId || null, new Date().toISOString(), id);
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
