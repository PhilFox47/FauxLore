import { ENRAGE_TARGET_MULTIPLIER } from "../../src/lib/rpgSystem";

/**
 * World boss targets per level (1-5), in the unit boss progress is credited in:
 * the native unit of a progress log for that media type.
 *
 * The single copy. Spawning (services/worldBoss.ts) and the recalculation when
 * difficulty changes (routes/settings.ts) each used to carry their own table;
 * Audiobook was added to one and not the other, and a 5-hour boss became a
 * 90-hour one the moment its difficulty was lowered.
 */
const LEVEL_TARGETS: Record<string, number[]> = {
  Game: [2, 5, 10, 20, 40],
  "Visual Novel": [2, 5, 10, 20, 40],
  Audiobook: [2, 5, 10, 20, 40],
  Book: [40, 100, 200, 400, 800],
  Manga: [6, 12, 20, 34, 60],
  Series: [2, 6, 12, 24, 40],
  Comic: [4, 8, 14, 24, 30],
};

const UNITS: Record<string, string> = {
  Game: "Hours",
  "Visual Novel": "Hours",
  Audiobook: "Hours",
  Book: "Pages",
  Manga: "Chapters",
  Series: "Episodes",
  Comic: "Issues",
  Movie: "Movies",
};

/** Legacy Master Pages scale, for a media type with no entry above. */
const FALLBACK_TARGETS = [90, 180, 360, 720, 1440];

export function bossUnit(mediaType: string): string {
  return UNITS[mediaType] || "Units";
}

/**
 * The target a boss should have right now. A movie boss is beaten by watching
 * the movie once, whatever the level or difficulty; an enraged boss keeps its
 * enrage multiplier through any recalculation.
 */
export function bossTarget(mediaType: string, level: number, difficulty: number, enraged = false): number {
  if (mediaType === "Movie") return 1;
  const levels = LEVEL_TARGETS[mediaType] || FALLBACK_TARGETS;
  const base = levels[Math.min(Math.max((level || 1) - 1, 0), levels.length - 1)];
  const target = base * difficulty * (enraged ? ENRAGE_TARGET_MULTIPLIER : 1);
  return Math.max(0.1, Math.round(target * 100) / 100);
}
