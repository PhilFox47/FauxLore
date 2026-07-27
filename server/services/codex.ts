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

export interface CodexData {
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

/** Identity of a Codex: the title and type it describes, not the row it hangs off. */
export function codexTitleKey(title: string, mediaType: string): string {
  return `${(title || "").trim().toLowerCase().replace(/\s+/g, " ")}::${(mediaType || "").trim().toLowerCase()}`;
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

/** Renders a Codex as the context block that gets embedded in other prompts. */
export function codexPromptBlock(codex: CodexRow | null): string {
  const d = codex?.data;
  if (!d) return "";

  const lines: string[] = [`=== CODEX: "${codex!.title}" (${codex!.mediaType}) ===`];
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

function buildCodexPrompt(media: { title: string; mediaType: string; creator?: string; publisher?: string; year?: number; description?: string }) {
  const known = [
    media.creator ? `Creator/author/studio (from the user's library): ${media.creator}` : "",
    media.publisher ? `Publisher: ${media.publisher}` : "",
    media.year ? `Year: ${media.year}` : "",
    media.description ? `Existing synopsis: ${String(media.description).slice(0, 600)}` : "",
  ].filter(Boolean).join("\n");

  return `You are the Codex Archivist of FauxLore, a media tracker with an RPG layer. You are compiling the permanent reference dossier for ONE piece of media. Everything the app later invents about it — its enemies, its loot, its classification — will be built from this dossier, so it must be accurate, specific and rich.

SUBJECT: "${media.title}" (${media.mediaType})
${known || "(No further details on record.)"}

YOUR TASK:
1. USE WEB SEARCH to identify this exact title and gather real, verifiable information about it. Beware of same-named works: match the type${media.creator ? ", creator" : ""} and any details given above.
2. Fill in the dossier below with concrete, named specifics from the work itself. Never write filler like "various characters" or "a rich world" — name them.
3. Prefer widely known material: the premise, the main cast, the marketed antagonists, the signature equipment. Avoid late-story twists and ending spoilers; the user may still be partway through.
4. If you genuinely cannot verify something, leave that field empty or the array short rather than inventing it, and say so in "notes" with a lowered "confidence".

Return ONLY a pure JSON object, no markdown fence, no commentary, in exactly this shape:
{
  "overview": "2-4 sentences: what this work is, its premise and what makes it distinctive",
  "setting": "the world/era/place it takes place in",
  "tone": "one line on mood and register (e.g. bleak military sci-fi with black comedy)",
  "themes": ["up to 6 recurring themes or motifs"],
  "artStyle": {
    "summary": "the actual visual style of this work, named precisely (e.g. cel-shaded anime key-art, gritty photoreal 3D, 16-bit pixel art, ligne claire ink, watercolour picture-book)",
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
  "releaseYear": 0,
  "confidence": "high | medium | low",
  "notes": "anything uncertain, ambiguous or worth flagging (empty string if all clear)",
  "sources": ["up to 4 URLs you actually consulted"]
}

Aim for up to 8 characters, 8 enemies, 5 factions, 5 locations, 8 items and 8 terminology entries — as many as the work genuinely supports. If the work has no combat at all, still fill "enemies" with its obstacles, rivals, antagonistic forces or thematic adversaries, because the app must be able to build an opponent out of it.`;
}

/** Codex storage plus the on-demand generation the AI features call into. */
export function createCodexService({ db }: { db: Db }) {
  // De-dupes concurrent generation of the same Codex: the Monday boss spawn and a
  // user hitting "Auto Tag" can land on the same title at the same moment.
  const inFlight = new Map<string, Promise<CodexRow | null>>();

  function getCodexRow(userId: string, opts: { mediaId?: string | null; title?: string; mediaType?: string }): CodexRow | null {
    if (opts.mediaId) {
      const byMedia = db.prepare("SELECT * FROM media_codex WHERE userId = ? AND mediaId = ?").get(userId, opts.mediaId);
      if (byMedia) return hydrate(byMedia);
    }
    if (opts.title && opts.mediaType) {
      const key = codexTitleKey(opts.title, opts.mediaType);
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
    subject: { mediaId?: string | null; title: string; mediaType: string; creator?: string; publisher?: string; year?: number; description?: string },
  ): Promise<CodexRow | null> {
    const aiConfig = getAiConfig(db, userId);
    if (!aiConfig) return null;

    const key = codexTitleKey(subject.title, subject.mediaType);
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
      // The one web-search pass. Low temperature: this is research, not flavour.
      const raw = await nanoGenerateText(aiConfig, buildCodexPrompt(subject), { temperature: 0.2, webSearch: true });
      if (!raw) throw new Error("The model returned an empty Codex.");
      const data = parseJsonLoose<CodexData>(raw);
      if (!data || typeof data !== "object") throw new Error("The Codex was not a JSON object.");

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
    subject: { mediaId?: string | null; title?: string; mediaType?: string; force?: boolean },
  ): Promise<CodexRow | null> {
    const mediaRow = resolveMedia(userId, subject.mediaId);
    const title = (subject.title || mediaRow?.title || "").trim();
    const mediaType = (subject.mediaType || mediaRow?.mediaType || "").trim();
    if (!title || !mediaType) return null;

    const existing = getCodexRow(userId, { mediaId: subject.mediaId, title, mediaType });
    if (existing && existing.status === "ready" && existing.data && !subject.force) return existing;

    const key = `${userId}:${codexTitleKey(title, mediaType)}`;
    const pending = inFlight.get(key);
    if (pending && !subject.force) return pending;

    const run = generate(userId, {
      mediaId: subject.mediaId,
      title,
      mediaType,
      creator: mediaRow?.creator,
      publisher: mediaRow?.publisher,
      year: mediaRow?.year,
      description: mediaRow?.description,
    }).finally(() => {
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
