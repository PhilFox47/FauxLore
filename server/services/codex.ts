import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";
import { getAiConfig, nanoGenerateText, parseJsonLoose } from "../lib/ai";

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

export interface CodexEntity {
  name: string;
  description?: string;
  role?: string;
  tier?: string;
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
}

export interface CodexData {
  identifiedAs?: CodexIdentification;
  overview?: string;
  setting?: string;
  tone?: string;
  themes?: string[];
  artStyle?: {
    summary?: string;
    medium?: string;
    palette?: string;
    iconography?: string;
  };
  characters?: CodexEntity[];
  enemies?: CodexEntity[];
  factions?: CodexEntity[];
  locations?: CodexEntity[];
  items?: CodexEntity[];
  terminology?: { term: string; meaning: string }[];
  genres?: string[];
  tags?: string[];
  creators?: string;
  releaseYear?: number | string;
  confidence?: string;
  notes?: string;
  sources?: string[];
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

/** Renders a Codex as the context block that gets embedded in other prompts. */
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
  const pushEntities = (label: string, entries: any[], limit = 10) => {
    const rendered = entries
      .filter((e) => e && e.name)
      .slice(0, limit)
      .map((e) => {
        const qualifier = [e.role, e.tier].filter(Boolean).join(", ");
        return `  - ${e.name}${qualifier ? ` (${qualifier})` : ""}${e.description ? `: ${e.description}` : ""}`;
      });
    if (rendered.length) lines.push(`${label}:`, ...rendered);
  };

  push("Overview", d.overview);
  push("Setting", d.setting);
  push("Tone", d.tone);
  if (list(d.themes).length) push("Themes", list(d.themes).join(", "));
  if (d.artStyle) {
    const art = [d.artStyle.summary, d.artStyle.medium, d.artStyle.palette, d.artStyle.iconography]
      .filter(Boolean)
      .join(" | ");
    push("Art style & visual identity", art);
  }
  pushEntities("Notable characters", list(d.characters));
  pushEntities("Enemies, monsters & antagonists", list(d.enemies));
  pushEntities("Factions & organizations", list(d.factions), 6);
  pushEntities("Locations", list(d.locations), 6);
  pushEntities("Iconic items & equipment", list(d.items));
  const terms = list(d.terminology)
    .filter((t) => t && t.term)
    .slice(0, 10)
    .map((t) => `  - ${t.term}: ${t.meaning || ""}`);
  if (terms.length) lines.push("In-universe terminology:", ...terms);
  if (list(d.genres).length) push("Descriptive genres", list(d.genres).join(", "));
  if (list(d.tags).length) push("Descriptive tags", list(d.tags).join(", "));
  push("Creators", d.creators);
  if (d.releaseYear) push("Released", String(d.releaseYear));
  if (d.confidence && d.confidence !== "high") {
    push("Research confidence", `${d.confidence}${d.notes ? ` — ${d.notes}` : ""}`);
  }
  lines.push("=== END CODEX ===");
  return lines.join("\n");
}

/**
 * What each of the app's media types means as a *work*, so the search does not
 * wander into an adaptation. The most common failure is grabbing the famous
 * version of a name: the 2010 live-action film when asked for the 2026 animated
 * one, or the original cartoon when asked for the film.
 */
const TYPE_BRIEF: Record<string, string> = {
  Game: "a video game. NOT a film, series, book or comic adaptation of it",
  "Visual Novel": "a visual novel / interactive fiction game. NOT its anime, manga or film adaptation",
  Book: "a written book or novel. NOT a film, series or game adaptation of it",
  Audiobook: "an audiobook OR a podcast. For an audiobook, describe the written work's own content and NOT a film or series adaptation. For a podcast — including a non-fiction one — describe the show itself: its hosts, format and subject matter. Do not go looking for a book that does not exist",
  Manga: "a manga (Japanese comic). NOT its anime, film or live-action adaptation",
  Comic: "a comic book or graphic novel. NOT its film or series adaptation",
  Series: "an episodic television or streaming series. NOT a feature film, book or game of the same name. This is not only fiction: it also covers reality and competition shows (Game Changer, Taskmaster), documentary series, talk and panel shows, and recurring sporting competitions or seasons (Formula 1). Describe whichever of those it actually is",
  Movie: "a single feature film. NOT a television series, book or game of the same name",
};

export interface CodexSubject {
  title: string;
  mediaType: string;
  /** Which season of a series this entry is. Scopes the whole dossier. */
  season?: number | null;
  subtitle?: string;
  creator?: string;
  publisher?: string;
  year?: number | null;
  expectedReleaseDate?: string | null;
  releaseStatus?: string | null;
  description?: string;
  franchises?: string[];
  platforms?: string[];
  language?: string | null;
}

/**
 * Which season the dossier is about.
 *
 * The season field is authoritative, but entries created from a season pick are
 * titled "Show - Season 2" and may carry nothing else, so the title and subtitle
 * are read as a fallback. Only series have seasons; asking anything else is
 * meaningless and returns null.
 */
export function subjectSeason(subject: CodexSubject): number | null {
  if (!/series/i.test(subject.mediaType || "")) return null;
  const explicit = Number(subject.season);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  for (const text of [subject.title, subject.subtitle]) {
    const m = String(text || "").match(/\b(?:season|series|staffel|s)\s*\.?\s*(\d{1,2})\b/i);
    if (m) {
      const n = Number(m[1]);
      if (n > 0) return n;
    }
  }
  return null;
}

/** The release year we can hold the research to, from whichever field has one. */
export function subjectYear(subject: CodexSubject): number | null {
  if (subject.year) return Number(subject.year);
  const expected = subject.expectedReleaseDate ? new Date(subject.expectedReleaseDate) : null;
  if (expected && !Number.isNaN(expected.getTime())) return expected.getFullYear();
  return null;
}

function buildCodexPrompt(subject: CodexSubject, correction?: string) {
  const year = subjectYear(subject);
  const season = subjectSeason(subject);
  const typeBrief = TYPE_BRIEF[subject.mediaType] || `a ${subject.mediaType}`;

  const known = [
    season ? `Season: ${season} — this entry tracks SEASON ${season} only` : "",
    subject.subtitle ? `Subtitle: ${subject.subtitle}` : "",
    subject.creator ? `Creator / author / studio / director: ${subject.creator}` : "",
    subject.publisher ? `Publisher: ${subject.publisher}` : "",
    year ? `Release year: ${year}${subject.year ? "" : " (expected)"}` : "",
    subject.releaseStatus ? `Release status: ${subject.releaseStatus}` : "",
    subject.franchises?.length ? `Franchise: ${subject.franchises.join(", ")}` : "",
    subject.platforms?.length ? `Platforms: ${subject.platforms.join(", ")}` : "",
    subject.language ? `Language: ${subject.language}` : "",
    subject.description ? `Synopsis on record: ${String(subject.description).slice(0, 700)}` : "",
  ].filter(Boolean).join("\n");

  // Every constraint the search must satisfy, stated as a rule rather than a hint.
  const constraints = [
    `- FORMAT: it must be ${typeBrief}.`,
    year
      ? `- YEAR: it was released in ${year}. A work of the same name from a different year is a DIFFERENT work — a remake, a reboot, a sequel or an adaptation. Do not describe the ${year < 2015 ? "newer" : "older"} one.`
      : `- YEAR: unknown. If several works share this name, say so in "notes" and pick the one that best matches the other details.`,
    subject.creator ? `- CREATOR: it is by ${subject.creator}. A same-named work by someone else is a different work.` : "",
    subject.franchises?.length ? `- FRANCHISE: it belongs to ${subject.franchises.join(", ")}.` : "",
    subject.description ? `- SYNOPSIS: it must match the synopsis on record above. If your candidate's plot or subject matter contradicts it, you have the wrong work.` : "",
    season ? `- SEASON: the entry is SEASON ${season}. Identify the series first, then narrow to that one season. If the series has no season ${season}, say so in "notes" and set "confidence" to "low" rather than describing a different one.` : "",
  ].filter(Boolean).join("\n");

  const correctionBlock = correction
    ? `\n\nPREVIOUS ATTEMPT WAS WRONG. ${correction}\nStart the identification again from scratch and satisfy every constraint above before writing anything else.\n`
    : "";

  return `You are the Codex Archivist of FauxLore, a media tracker with an RPG layer. You are compiling the permanent reference dossier for ONE piece of media. Everything the app later invents about it — its enemies, its loot, its classification — will be built from this dossier, so it must be accurate, specific and rich.

SUBJECT: "${subject.title}" (${subject.mediaType})
${known || "(No further details on record.)"}

STEP 1 — IDENTIFY THE RIGHT WORK. This matters more than anything else in the dossier.
Popular names are reused constantly: a cartoon and its live-action remake, a film and the series it was based on, a game and the show adapted from it. Describing the wrong one makes every later fact wrong too. Your candidate must satisfy ALL of these:
${constraints}

If more than one work carries this name, list the ones you rejected in "identifiedAs.alternatives" and say in "identifiedAs.why" what made you choose yours.
If NOTHING matches the format and year, do not substitute the famous one. Say so in "notes", set "confidence" to "low", and fill in only what you can actually verify about the work that was asked for.${correctionBlock}

${season ? `STEP 1b — NARROW TO SEASON ${season}. Every season of a series is tracked as its own entry here, so this dossier is about season ${season} and nothing else.
- Describe season ${season}'s own arc, its own setting, its own tone. Not the series premise in general.
- "characters" are the cast as they are IN season ${season}: who appears in it, and who they are at that point. A character who has not appeared yet does not belong. A character whose role changed in a later season belongs as they are in this one.
- "enemies" are season ${season}'s antagonists and obstacles. Not the final villain of the whole show.
- "items", "locations", "factions" and "terminology" are the ones season ${season} actually features or introduces.
- HARD RULE ON SPOILERS: include nothing that is first revealed in season ${season + 1} or later. No later-season characters, no later-season twists, no "later becomes" or "is eventually revealed to be". The user is watching this season now. Earlier seasons are fair game, since they have already been seen.
- If season ${season} is the first, that is simply the show's opening state — say so and describe it.

` : ""}STEP 2 — RESEARCH IT.
1. USE WEB SEARCH against the work you identified. Search with the year and format included, not the bare title.${season ? ` Search for season ${season} specifically — its episode list, its cast, its plot summary — not the series overview.` : ""}
2. Fill in the dossier below with concrete, named specifics from that work. Never write filler like "various characters" or "a rich world" — name them.
3. Prefer widely known material: the premise, the main cast, the marketed antagonists, the signature equipment. Avoid late-story twists and ending spoilers; the user may still be partway through.
4. If you genuinely cannot verify something, leave that field empty or the array short rather than inventing it, and say so in "notes" with a lowered "confidence".

Return ONLY a pure JSON object, no markdown fence, no commentary, in exactly this shape:
{
  "identifiedAs": {
    "title": "the work's own full title as published",
    "year": ${year || 0},
    "type": "film | television series | reality or competition show | documentary series | sporting competition | video game | novel | manga | comic | visual novel | audiobook | podcast",${season ? `
    "season": ${season},` : ""}
    "creator": "studio, author, director or developer",
    "why": "one sentence on how you know this is the right one and not a same-named work",
    "alternatives": ["same-named works you rejected, with their year and format"]
  },
  "overview": "2-4 sentences: ${season ? `what season ${season} is about — its own arc and what distinguishes it from the seasons around it` : "what this work is, its premise and what makes it distinctive"}",
  "setting": "${season ? `where and when season ${season} takes place` : "the world/era/place it takes place in"}",
  "tone": "one line on mood and register (e.g. bleak military sci-fi with black comedy)",
  "themes": ["up to 6 recurring themes or motifs"],
  "artStyle": {
    "summary": "the actual visual style of THIS work, named precisely (e.g. cel-shaded anime key-art, gritty photoreal 3D, 16-bit pixel art, ligne claire ink, watercolour picture-book). An adaptation does not look like its source — describe what this version looks like",
    "medium": "the medium/technique it is rendered in",
    "palette": "its characteristic colours and lighting",
    "iconography": "recurring visual motifs, emblems, logos, insignia, costume or architecture cues"
  },
  "characters": [{"name": "", "role": "protagonist | antagonist | supporting | ...", "description": "one line on who they are and how they look"}],
  "enemies": [{"name": "", "tier": "minion | elite | boss | final", "description": "one line on what it is, how it fights and how it looks"}],
  "factions": [{"name": "", "description": "one line"}],
  "locations": [{"name": "", "description": "one line"}],
  "items": [{"name": "", "description": "one line on the iconic weapons, tools, artifacts or objects of this work"}],
  "terminology": [{"term": "", "meaning": "in-universe jargon, ranks, magic systems, currencies"}],
  "genres": ["up to 5 genre terms that describe this work, most defining first"],
  "tags": ["up to 15 descriptive tags: subject matter, mechanics, structure, mood, audience"],
  "creators": "the studio, developer, author or director actually responsible",
  "releaseYear": ${year || 0},
  "confidence": "high | medium | low",
  "notes": "anything uncertain, ambiguous or worth flagging (empty string if all clear)",
  "sources": ["up to 4 URLs you actually consulted"]
}

Aim for up to 8 characters, 8 enemies, 5 factions, 5 locations, 8 items and 8 terminology entries — as many as the work genuinely supports. If the work has no combat at all, still fill "enemies" with its obstacles, rivals, antagonistic forces or thematic adversaries, because the app must be able to build an opponent out of it.

IF THIS IS NOT FICTION — a reality or competition show, a documentary, a podcast, a sporting competition — do not force it into a story it does not have, and do not invent one. The fields still apply, they just mean real things:
- "characters" are the real people: hosts, presenters, regular contestants, commentators, drivers, athletes. Describe them as they actually appear.
- "factions" are the teams, constructors, studios, networks or recurring groups.
- "locations" are the real venues: circuits, studios, arenas, the places it is filmed or held.
- "items" are the real equipment and paraphernalia: the cars, the trophy, the buzzer, the format's props, the signature gear.
- "terminology" is the genuine jargon of that world: DRS, undercut, the rules of the game, scoring terms, in-show catchphrases.
- "enemies" are the real opposition: rival competitors, rival teams, the reigning champion, the format's own difficulty, the clock, the conditions.
- "setting" is the real world it takes place in — the sport, the era, the circuit calendar, the studio — and "themes" are what it is actually about.
Say plainly in "notes" that this is a non-fiction work, and never dress a real person up as a fantasy creature.`;
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
export function identificationProblem(data: CodexData, subject: CodexSubject): string | null {
  const identified = data?.identifiedAs || {};
  const wantYear = subjectYear(subject);
  const gotYear = Number(identified.year || data?.releaseYear || 0);

  if (wantYear && gotYear && Math.abs(gotYear - wantYear) > 1) {
    return `You described "${identified.title || subject.title}" from ${gotYear}, but the entry is the ${wantYear} ${subject.mediaType}. Those are different works.`;
  }

  const wantSeason = subjectSeason(subject);
  const gotSeason = Number(identified.season || 0);
  if (wantSeason && gotSeason && gotSeason !== wantSeason) {
    return `You described season ${gotSeason}, but the entry is season ${wantSeason}. Research season ${wantSeason} on its own and include nothing that is first revealed later.`;
  }

  const wantFamily = OUR_FAMILY[subject.mediaType];
  const gotFamily = typeFamily(String(identified.type || ""));
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
      return `You described a ${identified.type}, but the entry is ${article} ${wanted}. Find the ${wanted}${wantYear ? ` from ${wantYear}` : ""} of that name.${RETRY_HINT[subject.mediaType] || ""}`;
    }
  }

  return null;
}

/** Codex storage plus the on-demand generation the AI features call into. */
export function createCodexService({ db }: { db: Db }) {
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
      const research = async (correction?: string) => {
        // The one web-search pass. Low temperature: this is research, not flavour.
        const raw = await nanoGenerateText(aiConfig, buildCodexPrompt(subject, correction), {
          temperature: 0.2,
          webSearch: true,
        });
        if (!raw) throw new Error("The model returned an empty Codex.");
        const parsed = parseJsonLoose<CodexData>(raw);
        if (!parsed || typeof parsed !== "object") throw new Error("The Codex was not a JSON object.");
        return parsed;
      };

      let data = await research();

      // Check the work it says it found against what the entry claims, and give
      // it exactly one chance to correct itself. Without this a same-named film
      // from another decade sails through and poisons every later generation.
      let problem = identificationProblem(data, subject);
      if (problem) {
        console.warn(`Codex identified the wrong work for "${subject.title}": ${problem} Retrying.`);
        try {
          const retry = await research(problem);
          const stillWrong = identificationProblem(retry, subject);
          if (!stillWrong) {
            data = retry;
            problem = null;
          } else {
            // Keep the better-informed second attempt but flag it clearly.
            data = retry;
            problem = stillWrong;
          }
        } catch (e) {
          console.error("Codex retry failed; keeping the first attempt", e);
        }
      }

      if (problem) {
        data = {
          ...data,
          confidence: "low",
          notes: [`Could not confirm this is the right work: ${problem}`, data.notes].filter(Boolean).join(" "),
        };
      }

      db.prepare(
        `UPDATE media_codex SET data = ?, status = 'ready', error = NULL, model = ?, mediaId = COALESCE(mediaId, ?), updatedAt = ? WHERE id = ?`,
      ).run(JSON.stringify(data), aiConfig.webModel, subject.mediaId || null, new Date().toISOString(), id);
    } catch (e: any) {
      console.error(`Codex generation failed for "${subject.title}"`, e);
      db.prepare("UPDATE media_codex SET status = 'failed', error = ?, updatedAt = ? WHERE id = ?")
        .run(String(e?.message || e).slice(0, 500), new Date().toISOString(), id);
    }

    return hydrate(db.prepare("SELECT * FROM media_codex WHERE id = ?").get(id));
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
