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

export function getRecentMediaContext(media: MediaItem[], logs: ProgressLog[], settings: Settings | null | undefined, mediaType?: string) {
  const recent = [...media]
    .filter((m) => m.status === "Active" || m.status === "Completed" || m.status === "Extras")
    .filter((m) => (mediaType ? m.mediaType === mediaType : true))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 50);

  if (recent.length === 0) return { text: "None yet", dominantTitle: null as string | null };

  const top10 = recent.slice(0, 10);
  let totalTop10Mp = 0;
  const top10WithMp = top10.map((m) => {
    const nonHistoricLogs = logs.filter((l) => l.mediaId === m.id && !l.isHistoric && !l.timestamp.startsWith("1970-01-01"));
    let mp = 0;
    if (nonHistoricLogs.length > 0) {
      mp = nonHistoricLogs.reduce((sum, log) => sum + Math.floor(calculateScaledDelta(log.delta, m, settings)), 0);
    } else {
      mp = 1;
    }
    totalTop10Mp += mp;
    return { ...m, mp };
  });

  let dominantTitle: string | null = null;
  if (totalTop10Mp > 0) {
    const dom = top10WithMp.find((m) => m.mp > totalTop10Mp * 0.5);
    if (dom) dominantTitle = dom.title;
  }

  const top10Str = top10WithMp
    .map((m) => `"${m.title}" (${m.mediaType}, Genres: ${m.genres?.join(", ") || "none"}, Tags: ${m.tags?.join(", ") || "none"}, MP: ${m.mp})`)
    .join(" | ");
  const restStr = recent.slice(10).map((m) => `"${m.title}" (${m.mediaType})`).join(" | ");

  const text = `Most Recent (High Impact): ${top10Str}` + (restStr ? `\nOlder Recent (Low Impact): ${restStr}` : "");
  return { text, dominantTitle };
}

function franchiseRule(dominantTitle: string | null): string {
  if (dominantTitle) {
    return `FRANCHISE EXCEPTION: You MAY reference the specific work "${dominantTitle}" by name (and ONLY that one), because it dominates their recent time. Do not name any other specific work.`;
  }
  return `Do NOT reference any specific franchise, character or work by name — use genre, medium, mood or theme words only.`;
}

/** The heart of title quality: what makes a good "earned alias". */
const TITLE_GUIDELINES = `WHAT MAKES A GREAT TITLE:
- It is the player's personal, earned ALIAS — a flavorful nickname capturing who they have become through what they consume. Think a cool gamertag, a wrestling persona, or a character epithet — NOT a job class.
- The dominant genres, tags, themes and mood of their recent media drive the flavor (genres/tags are listed most-defining first). Cyberpunk -> sleek and futuristic; cozy slice-of-life -> warm and pastoral; horror -> faintly eerie; sci-fi -> spacey; noir -> shadowy and hardboiled; fantasy -> mythic; if their taste is varied, blend it cleverly.
- Weave PRESTIGE into the tone, never tack it on. Low levels feel humble, scrappy, even a little silly (e.g. "Backseat Galaxy Racer", "The Noir Apprentice", "Couch-Bound Cadet"). High levels feel iconic and self-assured (e.g. "Sovereign of Static", "The Midnight Archivist", "Warden of Cozy Realms"). NEVER append rank words like Novice, Master, Fan, Enthusiast, Hobbyist, Player, Recruit, Aficionado.
- BREAK THE FORMULA. Vary the grammar wildly: a two-word handle, "The X", "X of the Y", a verb phrase, an epithet. Range examples (do NOT copy): "Neon Walker", "Reads In The Dark", "Collector of Cozy", "Sleepless Streamer", "The Pixel Vagabond", "Keeper of Late Nights", "Doomscroll Daydreamer".
- Grounded, human, a little playful. No pompous high-fantasy ("Eternal Valor of the Undying Saga"). No bare RPG words (Warrior, Mage, Hero, Champion). Never include the word Level, Lvl, or any number.
- 2-6 words, Title Case.`;

export function buildTitleSystemPrompt(personaDesc: string): string {
  return `You are FauxLore's title-smith. You craft a single, personal "earned alias" for the player that reflects their real media-consumption habits and current prestige. ${personaDesc}${FAUXLORE_CONTEXT}
CRITICAL RULE: Do NOT reference any specific franchise, character, work or media title by name. Use general genre, medium, mood or theme terms instead, UNLESS a FRANCHISE EXCEPTION is explicitly granted in the user message.`;
}

/** Batch prompt that requests the main alias and/or per-media aliases as JSON. */
export function buildBatchTitlePrompt(params: {
  level: number;
  main: { context: string; dominantTitle: string | null } | null;
  perMedia: { type: string; level: number; context: string }[];
  forbidden: string[];
}): string {
  const { level, main, perMedia, forbidden } = params;
  const formatRules: string[] = [];
  if (main) formatRules.push(`"main": "The earned alias here"`);
  perMedia.forEach((p) => formatRules.push(`"${p.type}": "The ${p.type} alias here"`));

  const mainBlock = main
    ? `=== OVERALL MEDIA (drives the main alias) ===\n${main.context}\n${franchiseRule(main.dominantTitle)}\n\n`
    : "";

  const perMediaBlocks = perMedia
    .map((p) => `=== ${p.type} (Level ${p.level}, ${getLevelContext(p.level)}) ===\n${p.context}`)
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
export function buildMainTitlePrompt(params: { level: number; context: string; dominantTitle: string | null; forbidden?: string }): string {
  const { level, context, dominantTitle, forbidden } = params;
  const forbiddenRule = forbidden ? `\nAVOID "${forbidden}" or close variants — make it fresh and distinct.` : "";
  return `The player is Level ${level} (${getLevelContext(level)}).

=== THEIR RECENT MEDIA (drives the alias) ===
${context}
${franchiseRule(dominantTitle)}

${TITLE_GUIDELINES}

Craft ONE alias: the player's overall earned handle, shaped by the media above and Level ${level}'s prestige.${forbiddenRule}

Output ONLY the alias text — no quotes, no JSON, no extra words.`;
}
