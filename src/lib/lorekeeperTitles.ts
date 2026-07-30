import { MediaItem, ProgressLog, Settings } from '../types/schema';
import { calculateScaledDelta } from './scaling';

/**
 * Shared logic + prompts for the Lorekeeper "earned alias" titles (the overall
 * level title and the per-media-type titles). Used by the Lorekeeper page, the
 * auto-generation on level-up (MediaContext), and the admin force-rewrite
 * (SettingsModal) so every path produces the same high-quality, media-aware
 * titles instead of generic ones.
 */

export const FAUXLORE_CONTEXT = `\n\nCONTEXT ABOUT FAUXLORE:
FauxLore is an RPG-themed media-tracking app where the user logs their time/pages/etc on Games, Books, Visual Novels, Manga, Series, Movies, Comics, and Audiobooks to earn "Master Pages" (XP) and level up.
"Quests" in FauxLore are weekly, monthly, or daily consumption goals (e.g. "Read 200 pages" or "Play 10 hours").
When generating text, DO NOT treat the user as a literal warrior fighting real monsters. Instead, playfully frame their normal media consumption habits using the chosen persona's style, acknowledging that they are interacting with media (reading, playing, watching).`;

export function getLevelContext(level: number): string {
  if (level >= 100) return "almost unrealistic, ultimate, mythical";
  if (level >= 50) return "epic, legendary, master-level (soft level cap)";
  if (level >= 20) return "dedicated, veteran-level";
  if (level >= 10) return "experienced, casual, intermediate-level";
  return "basic, beginner-level";
}

export interface TitleAnchor {
  id: string;
  title: string;
  mediaType: string;
  mp: number;
  share: number;
}

export interface TitleContext {
  text: string;
  /** The one or two works that actually earned this level. Nameable in the alias. */
  anchors: TitleAnchor[];
}

/**
 * The logs that carried the player through roughly the last level.
 *
 * Titles used to be built from "the 50 most recently updated entries, weighted
 * by lifetime master pages", which is a description of the whole library rather
 * than of the climb that earned the rank. Walking back from now until a level's
 * worth of progress has been counted answers the question the title is actually
 * about: what were you doing while you levelled up?
 */
export function progressionWindow(
  logs: ProgressLog[],
  media: MediaItem[],
  settings: Settings | null | undefined,
  budgetMasterPages: number,
): ProgressLog[] {
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const usable = logs
    .filter((l) => l.metricType !== 'statusChange' && !l.isHistoric && !l.timestamp.startsWith('1970-01-01'))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const out: ProgressLog[] = [];
  let spent = 0;
  for (const log of usable) {
    const m = mediaById.get(log.mediaId);
    if (!m) continue;
    out.push(log);
    spent += Math.max(0, calculateScaledDelta(log.delta, m, settings));
    if (spent >= budgetMasterPages && out.length >= 3) break;
    // A hard stop so a huge budget on a thin library cannot walk the entire archive.
    if (out.length >= 400) break;
  }
  return out;
}

/**
 * What the player has been living in lately, as material for an alias.
 *
 * Two things changed here and both matter. The window is the last level's worth
 * of progress rather than the whole library, and the result names one or two
 * anchors — the works that dominated that window — instead of handing over a
 * flat list of fifty titles for the model to average into mush. A blend of
 * everything produces "Curator of Chaotic Lore"; an anchor produces something
 * that could only be about this player.
 */
export function getProgressionContext(
  media: MediaItem[],
  logs: ProgressLog[],
  settings: Settings | null | undefined,
  opts: { budgetMasterPages: number; mediaType?: string },
): TitleContext {
  const scoped = opts.mediaType ? media.filter((m) => m.mediaType === opts.mediaType) : media;
  const allowed = new Set(scoped.map((m) => m.id));
  const window = progressionWindow(logs, media, settings, opts.budgetMasterPages).filter((l) => allowed.has(l.mediaId));

  const mpById = new Map<string, number>();
  for (const log of window) {
    const m = scoped.find((x) => x.id === log.mediaId);
    if (!m) continue;
    mpById.set(log.mediaId, (mpById.get(log.mediaId) || 0) + Math.max(0, calculateScaledDelta(log.delta, m, settings)));
  }

  // Nothing logged in the window: fall back to what is open right now, so a
  // returning player still gets something about their own library.
  if (mpById.size === 0) {
    const fallback = scoped
      .filter((m) => m.status === 'Active' || m.status === 'Extras')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6);
    if (fallback.length === 0) return { text: 'None yet', anchors: [] };
    return {
      text: `Currently open (nothing logged this level):\n${fallback.map((m) => describeWork(m)).join('\n')}`,
      anchors: [],
    };
  }

  const total = [...mpById.values()].reduce((a, b) => a + b, 0);
  const ranked = [...mpById.entries()]
    .map(([id, mp]) => {
      const m = scoped.find((x) => x.id === id)!;
      return { id, title: m.title, mediaType: m.mediaType as string, mp, share: total > 0 ? mp / total : 0, item: m };
    })
    .sort((a, b) => b.mp - a.mp);

  // One anchor if it clearly dominates; two if the top pair share the level
  // between them. More than that and the alias goes vague again.
  const anchors: TitleAnchor[] = [];
  if (ranked[0] && ranked[0].share >= 0.3) anchors.push(strip(ranked[0]));
  if (ranked[1] && ranked[1].share >= 0.2 && anchors.length === 1) anchors.push(strip(ranked[1]));
  // A level spread thin across everything still deserves its two biggest names.
  if (anchors.length === 0 && ranked.length) {
    anchors.push(strip(ranked[0]));
    if (ranked[1]) anchors.push(strip(ranked[1]));
  }

  const lines = ranked.slice(0, 8).map((r) =>
    `${describeWork(r.item)} — ${Math.round(r.mp)} MP this level (${Math.round(r.share * 100)}%)`,
  );
  const text = `What earned this level (most time first):\n${lines.join('\n')}`;
  return { text, anchors };
}

function strip(r: { id: string; title: string; mediaType: string; mp: number; share: number }): TitleAnchor {
  return { id: r.id, title: r.title, mediaType: r.mediaType, mp: Math.round(r.mp), share: r.share };
}

function describeWork(m: MediaItem): string {
  const bits = [
    m.genres?.length ? `Genres: ${m.genres.slice(0, 4).join(', ')}` : '',
    m.tags?.length ? `Tags: ${m.tags.slice(0, 6).join(', ')}` : '',
  ].filter(Boolean).join('; ');
  return `- "${m.title}" (${m.mediaType})${bits ? ` [${bits}]` : ''}`;
}

/**
 * Kept for callers that still want the old shape. The window is the whole
 * library, which is what the old behaviour amounted to.
 */
export function getRecentMediaContext(media: MediaItem[], logs: ProgressLog[], settings: Settings | null | undefined, mediaType?: string) {
  const ctx = getProgressionContext(media, logs, settings, { budgetMasterPages: Number.MAX_SAFE_INTEGER, mediaType });
  return { text: ctx.text, dominantTitle: ctx.anchors[0]?.title ?? null };
}

/**
 * Permission to name the works that earned the level.
 *
 * The old rule forbade naming anything at all unless a single work held more
 * than half the player's lifetime master pages — a bar almost nothing clears in
 * a varied library. The model was therefore left with genre and mood words and
 * nothing else, which is exactly how you get "Curator of Chaotic Lore". The
 * anchors are now named, and the model is told to mine them.
 */
function anchorRule(anchors: TitleAnchor[], codexBlocks: string[]): string {
  if (anchors.length === 0) {
    return `They have not logged anything substantial lately, so keep it to genre, medium, mood and theme words. Do not name a specific work.`;
  }
  const named = anchors.map((a) => `"${a.title}" (${a.mediaType}, ${Math.round(a.share * 100)}% of this level)`).join(" and ");
  const codex = codexBlocks.filter(Boolean).join("\n\n");
  return `ANCHOR ON WHAT THEY ACTUALLY DID: this level was earned mostly in ${named}.
Build the alias out of THAT — its world, its vocabulary, its imagery, its mood, the role the player occupies inside it. You MAY name it or a thing from it directly. Do NOT name any other work.
Borrowing one concrete noun from the anchor beats any amount of tasteful vagueness. A title that could be handed to any other player has failed.${codex ? `\n\nEVERYTHING KNOWN ABOUT THE ANCHOR WORK(S) — mine this for real nouns, factions, places, jargon and imagery:\n${codex}` : ""}`;
}

/**
 * How much progress one level represents, as a master-page budget.
 *
 * Base EXP is master pages one-for-one, so the level band doubles as the size of
 * the window that earned it. Using the band rather than "EXP so far this level"
 * means a title generated the instant someone levels up still looks back over
 * the climb that got them there instead of at an empty window.
 */
export function levelBudget(rpgState: { nextLevelExp: number; currentLevelExp: number }): number {
  const band = (rpgState?.nextLevelExp || 0) - (rpgState?.currentLevelExp || 0);
  return band > 0 ? band : 2000;
}

/** The heart of title quality: what makes a good "earned alias". */
const TITLE_GUIDELINES = `WHAT MAKES A GREAT TITLE:
- It is the player's personal, earned ALIAS — a flavorful nickname capturing who they have become through what they consume. Think a cool gamertag, a wrestling persona, or a character epithet — NOT a job class.
- SPECIFIC BEATS ATMOSPHERIC. When an anchor work is given, reach into it for a real noun — a place, a faction, a rank, a piece of equipment, a phrase its world actually uses — and build the alias around that. "Warden of the Severed Floor" says something; "Curator of Chaotic Lore" says nothing and could belong to anyone.
- Without an anchor, the dominant genres, tags, themes and mood carry the flavor (genres/tags are listed most-defining first). Cyberpunk -> sleek and futuristic; cozy slice-of-life -> warm and pastoral; horror -> faintly eerie; noir -> shadowy and hardboiled; fantasy -> mythic; varied taste -> blend it cleverly.
- Do not simply restate the work's name. "The Elden Ring Player" is not an alias. Take something from inside it and make the player the subject.
- Weave PRESTIGE into the tone, never tack it on. Low levels feel humble, scrappy, even a little silly (e.g. "Backseat Galaxy Racer", "The Noir Apprentice", "Couch-Bound Cadet"). High levels feel iconic and self-assured (e.g. "Sovereign of Static", "The Midnight Archivist", "Warden of Cozy Realms"). NEVER append rank words like Novice, Master, Fan, Enthusiast, Hobbyist, Player, Recruit, Aficionado.
- BREAK THE FORMULA. Vary the grammar wildly: a two-word handle, "The X", "X of the Y", a verb phrase, an epithet. Range examples (do NOT copy): "Neon Walker", "Reads In The Dark", "Collector of Cozy", "Sleepless Streamer", "The Pixel Vagabond", "Keeper of Late Nights", "Doomscroll Daydreamer".
- Grounded, human, a little playful. No pompous high-fantasy ("Eternal Valor of the Undying Saga"). No bare RPG words (Warrior, Mage, Hero, Champion). Never include the word Level, Lvl, or any number.
- 2-6 words, Title Case.`;

export function buildTitleSystemPrompt(personaDesc: string): string {
  return `You are FauxLore's title-smith. You craft a single, personal "earned alias" for the player that reflects what they have actually been consuming and their current prestige. ${personaDesc}${FAUXLORE_CONTEXT}
CRITICAL RULE: only the anchor work(s) named in the user message may be referenced. Draw on their world, cast, places and vocabulary freely — that specificity is the whole point — but never name a work that was not given to you.`;
}

/** Batch prompt that requests the main alias and/or per-media aliases as JSON. */
export function buildBatchTitlePrompt(params: {
  level: number;
  main: { context: string; anchors: TitleAnchor[]; codexBlocks?: string[] } | null;
  perMedia: { type: string; level: number; context: string; anchors: TitleAnchor[]; codexBlocks?: string[] }[];
  forbidden: string[];
}): string {
  const { level, main, perMedia, forbidden } = params;
  const formatRules: string[] = [];
  if (main) formatRules.push(`"main": "The earned alias here"`);
  perMedia.forEach((p) => formatRules.push(`"${p.type}": "The ${p.type} alias here"`));

  const mainBlock = main
    ? `=== OVERALL (drives the main alias) ===\n${main.context}\n\n${anchorRule(main.anchors, main.codexBlocks || [])}\n\n`
    : "";

  const perMediaBlocks = perMedia
    .map((p) => `=== ${p.type} (Level ${p.level}, ${getLevelContext(p.level)}) ===\n${p.context}\n\n${anchorRule(p.anchors, p.codexBlocks || [])}`)
    .join("\n\n");

  const forbiddenRule = forbidden.length
    ? `\nAVOID repeating these existing titles or close variants: ${forbidden.map((t) => `"${t}"`).join(", ")}. Make each one fresh and distinct.`
    : "";

  return `The player is Overall Level ${level} (${getLevelContext(level)}).

${mainBlock}${perMediaBlocks}

${TITLE_GUIDELINES}

WHAT TO PRODUCE:
${main ? `- "main": the overall earned alias, shaped by the OVERALL MEDIA above and Level ${level}'s prestige.\n` : ""}- Each per-media alias: shaped ONLY by that media type's recent media and that type's level. Same rules and quality as the main alias.${forbiddenRule}

Respond with ONLY raw JSON (no markdown, no commentary), exactly:
{
  ${formatRules.join(",\n  ")}
}`;
}

/** Single plain-text main alias (used by auto-gen on level-up and force-rewrite). */
export function buildMainTitlePrompt(params: { level: number; context: string; anchors: TitleAnchor[]; codexBlocks?: string[]; forbidden?: string }): string {
  const { level, context, anchors, codexBlocks, forbidden } = params;
  const forbiddenRule = forbidden ? `\nAVOID "${forbidden}" or close variants — make it fresh and distinct.` : "";
  return `The player is Level ${level} (${getLevelContext(level)}).

=== WHAT EARNED THIS LEVEL (drives the alias) ===
${context}

${anchorRule(anchors, codexBlocks || [])}

${TITLE_GUIDELINES}

Craft ONE alias: the player's overall earned handle, shaped by the media above and Level ${level}'s prestige.${forbiddenRule}

Output ONLY the alias text — no quotes, no JSON, no extra words.`;
}
