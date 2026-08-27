/**
 * Database Schema Definitions
 */

export const MEDIA_TYPES = ['Game', 'Book', 'Visual Novel', 'Manga', 'Series', 'Movie', 'Comic', 'Audiobook'] as const;
export type MediaType = typeof MEDIA_TYPES[number];

/**
 * "Caught Up" is finished-for-now: you have consumed everything that exists so
 * far of something still being made. It is a real outcome, not a pause — it
 * closes the current enemy and earns its drop — but the entry then waits on a
 * release exactly like On Hold does.
 */
export const STATUSES = ['Planning', 'Active', 'Extras', 'On Hold', 'Caught Up', 'Completed', 'Dropped', 'Unreleased'] as const;
export type Status = typeof STATUSES[number];

// Metadata providers an item's data can originate from. Items remember their source
// so they can be re-looked-up for automatic update checks.
export const METADATA_SOURCES = ['vndb', 'gsl', 'igdb', 'tmdb', 'mangadex', 'googlebooks'] as const;
export type MetadataSource = typeof METADATA_SOURCES[number];

export const METADATA_SOURCE_LABELS: Record<MetadataSource, string> = {
  vndb: 'VNDB',
  gsl: 'GameStoryLog',
  igdb: 'IGDB',
  tmdb: 'TMDB',
  mangadex: 'MangaDex',
  googlebooks: 'Google Books',
};

export interface MediaItem {
  id: string;
  isReRun?: boolean;
  originalMediaId?: string;
  title: string;
  subtitle?: string;
  mediaType: MediaType;
  coverImageUrl?: string;
  description?: string;
  creator?: string; // Developer, Author, Studio, Director
  publisher?: string;
  year?: number;
  maturityRating?: string;
  reviewScore?: number; // 0-5
  averagePlaytime?: number; // hours
  hltbMain?: number;
  hltbMainExtra?: number;
  hltbCompletionist?: number;
  selectedHltbType?: 'main' | 'mainExtra' | 'completionist';
  status: Status;
  userRating?: number; // 0-5
  userReview?: string; // Text review written by the user
  dropReason?: string; // Used when status is 'Dropped'
  expectedReleaseDate?: string; // ISO date string for 'Unreleased' media
  
  // Taxonomies
  genres: string[];
  tags: string[];
  tropes: string[];
  platforms?: string[];
  franchises?: string[];

  // Metrics (specific mapping per type)
  // Game & Visual Novel
  playtimeHours?: number;
  isOngoing?: boolean;
  noEnemies?: boolean;
  /** Server-side auto-tagging progress for this entry. */
  autoTagStatus?: 'pending' | 'done' | 'failed' | null;
  isHighPriority?: boolean;
  noAutoDrop?: boolean;
  /**
   * Part of a chronological watch-through, tracked on its own dashboard.
   *
   * Implies noAutoDrop and noEnemies: a chronology is worked through over
   * months with long gaps per title, so decay and weekly enemies both fight
   * the way it is actually used.
   */
  timeTravel?: boolean;
  storyHeavyModifier?: number; // 0.5x to 1.5x
  route?: string; // Optional: which route/path this playthrough follows (VNs)
  releaseStatus?: string;
  lastSyncAt?: string;

  // Metadata provenance — where this item's metadata came from, so it can be
  // re-fetched later for auto-updates. Source-agnostic by design.
  metadataSource?: MetadataSource;
  metadataSourceId?: string;   // stable id/slug at that source (e.g. a GSL slug, a VNDB "v123")
  sourceUrl?: string;          // canonical public page for this item at its source
  sourceVersion?: string;      // latest version reported upstream, e.g. "Season 1: v1.06"
  installedVersion?: string;   // the version you actually have / played
  sourceVersions?: string[];   // versions the source knows about, for the pick-list
  sourceUpdatedAt?: string;    // last-updated date reported by the source
  updateAvailable?: boolean;   // set when a refresh detects a newer version
  updateSeenAt?: string;       // when the user acknowledged the update

  // What the source says about release timing. A date alone is not enough for
  // anything episodic: a series that is airing has a date for its NEXT episode,
  // and that is what decides whether there is anything to watch tonight.
  releaseDateLabel?: string;   // "Q4 2026", when the source is not precise
  nextReleaseAt?: string;      // ISO date of the next episode / chapter
  nextReleaseLabel?: string;   // "S2E5", "Chapter 143"
  availableUnits?: number;     // episodes aired / chapters published so far
  autoStatusAt?: string;       // when the app last moved the status by itself
  
  // Book
  pagesRead?: number;
  totalPages?: number;
  language?: string; // e.g. 'en', 'de'

  // Manga
  chaptersRead?: number;
  totalChapters?: number;

  // Series
  season?: number;
  episodesWatched?: number;
  totalEpisodes?: number;

  // Movie
  watched?: boolean;
  watchCount?: number;
  runtimeMinutes?: number;

  // Comic
  issuesRead?: number;
  totalIssues?: number;

  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  userId?: string; // Optional user identifier for future multi-user support
}

export type MetricType = 
  | 'playtimeHours' 
  | 'pagesRead' 
  | 'chaptersRead' 
  | 'episodesWatched' 
  | 'watchCount' 
  | 'issuesRead'
  | 'statusChange';

export interface ProgressLog {
  id: string;
  mediaId: string;
  userId?: string; // Optional user identifier for future multi-user support
  timestamp: string; // ISO string
  metricType: MetricType;
  delta: number; // e.g., +2
  note?: string;
  location?: string;
  isHistoric?: boolean;
  bonusMultiplier?: number; // Artifact/Armory EXP bonus banked at log creation (only applies to this log)
}

export interface Artifact {
  id: string;
  userId?: string;
  mediaId: string;
  name: string;
  description: string;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Super Rare' | 'Epic' | 'Legendary' | 'Mythic';
  type: string;
  earnedAt: string;
  durability: number;
  maxDurability: number;
  slot?: 'Head' | 'Body' | 'Legs' | 'Primary' | 'Secondary' | 'Accessory';
  isEquipped?: boolean;
  targetType?: string;
  targetValue?: string;
  bonusPercent?: number;
  imageUrl?: string;
  imageStatus?: 'generating' | 'done' | 'failed';
  imagePrompt?: string; // written by the loot generator, reused when drawing the icon
}

export interface WorldBoss {
  id: string;
  userId: string;
  mediaId: string;
  name: string;
  title?: string;       // the RPG epithet, e.g. "King of the Koopas"
  description?: string; // flavour text, written in the voice of the source work
  level: number; // 1-5
  targetProgress: number;
  currentProgress: number;
  unit: string;
  status: 'Active' | 'Defeated' | 'Failed';
  expiresAt: string;
  createdAt: string;
  updatedAt?: string;
  imageUrl?: string;
  imageStatus?: 'generating' | 'done' | 'failed';
  imagePrompt?: string; // written by the enemy generator, reused when drawing the portrait
  /** Taunted: bigger target, bigger stakes, one extra week. Never more than once. */
  enraged?: boolean;
  enragedAt?: string;
}

/**
 * The Codex: one researched dossier per title, compiled by web search the first
 * time any AI feature touches that media, and reused by all of them afterwards
 * (auto-tagging, enemy generation, item generation).
 */
/**
 * One thing in a work: a person, a group, a place, an object, an antagonist.
 *
 * Note what is not here: no difficulty level, no boss tier, no loot rarity. The
 * Codex records what a work contains; deciding what makes a good level 4 this
 * week belongs to the enemy forge, at the moment it knows the level and the
 * history. Everything past `name` is absent when the research did not support it.
 */
export interface CodexEntity {
  name: string;
  aliases?: string[];
  description?: string;
  appearance?: string;
  affiliation?: string;

  // People
  role?: string;
  /** How central this is TO THE WORK: central, major, recurring, minor. */
  prominence?: string;
  abilities?: string;
  personality?: string;
  relationships?: string;
  status?: string;

  // Antagonists
  nature?: string;
  motivation?: string;
  methods?: string;
  opposedTo?: string;

  // Objects
  material?: string;
  purpose?: string;
  significance?: string;
  owner?: string;
  origin?: string;

  // Places
  region?: string;
  atmosphere?: string;
  whatHappensThere?: string;

  // Groups
  opposes?: string;
  goal?: string;
  symbol?: string;
  colors?: string;
  members?: string[];

  /** Where this first appears, so features can gate on the user's progress. */
  introducedAt?: string;
  introducedPct?: number;
}

/** A piece of in-universe vocabulary. */
export interface CodexTerm {
  term: string;
  meaning: string;
  category?: string;
  introducedAt?: string;
  introducedPct?: number;
}

/** How well-supported each part of the dossier is, section by section. */
export type CodexSectionConfidence = Partial<
  Record<'identity' | 'cast' | 'conflict' | 'world' | 'things' | 'craft', string>
>;

export interface CodexIdentification {
  title?: string;
  year?: number | string;
  /** Which season the research settled on, for series entries. */
  season?: number | string;
  type?: string;
  creator?: string;
  why?: string;
  alternatives?: string[];
  /** Every other name the work goes by; the facet searches are keyed on these. */
  alsoKnownAs?: string[];
}

/**
 * A line the work is actually known by — not the best line in it, the one that
 * gets repeated. A `quote` is said in the work, a `reference` is something it is
 * recognised by that is not a line, and a `joke` is what its audience says about
 * it. These surface under the library title once the work has been consumed.
 */
export interface CodexFlavorText {
  text: string;
  kind?: 'quote' | 'reference' | 'joke';
  /**
   * Whether this belongs to the work or to the format. A `medium` line is about
   * the experience of consuming this kind of thing, names nothing in the work,
   * and is served to the library with no source.
   */
  scope?: 'work' | 'medium';
  /** Who says it, or where it appears. */
  attribution?: string;
  /** What makes it recognisable. */
  why?: string;
}

export interface CodexData {
  /** Which work the research settled on, so a wrong match can be spotted. */
  identifiedAs?: CodexIdentification;
  /** The spoiler-free hook — what someone would be told before starting. */
  premise?: string;
  overview?: string;
  setting?: string;
  tone?: string;
  themes?: string[];
  /** How it is organised: arcs, routes, seasons, volumes, acts, chapters. */
  structure?: string;
  /** What separates it from the obvious comparisons. */
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
  /** @deprecated folded into `worldRules`. Still read from older dossiers. */
  powerScale?: string;
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
  };
  characters?: CodexEntity[];
  /** Who and what stands in opposition — people, groups, forces, creature types. */
  antagonists?: CodexEntity[];
  /** @deprecated superseded by `antagonists`. Still read from older dossiers. */
  enemies?: CodexEntity[];
  factions?: CodexEntity[];
  locations?: CodexEntity[];
  items?: CodexEntity[];
  terminology?: CodexTerm[];
  /**
   * The three to six lines this work is known by. Absent on dossiers compiled
   * before this existed — those are not backfilled, and pick them up whenever
   * they are next re-researched.
   */
  flavorTexts?: CodexFlavorText[];
  genres?: string[];
  tags?: string[];
  creators?: string;
  releaseYear?: number | string;
  confidence?: string;
  /** Per-section confidence, so one weak area does not discredit the rest. */
  sectionConfidence?: CodexSectionConfidence;
  notes?: string;
  sources?: string[];
}

export interface MediaCodex {
  id: string;
  userId: string;
  mediaId: string | null;
  titleKey: string;
  title: string;
  mediaType: string;
  status: 'generating' | 'ready' | 'failed';
  error?: string | null;
  data: CodexData | null;
  model?: string | null;
  createdAt: string;
  updatedAt: string;
  /** The Codex rendered as prompt context, formatted server-side. */
  promptBlock?: string;
}

export interface Settings {
  userId: string;
  /** Opt out of inactivity aging: no decay visuals, no automatic drop. */
  disableAutoDrop?: boolean;
  /** Whether this account wants push at all; devices are registered separately. */
  pushEnabled?: boolean;
  /** Which notification types reach the phone. Absent means all of them. */
  pushTypes?: string[];
  /** Quiet days before the inactivity nudge fires. 0 turns it off. */
  inactivityReminderDays?: number;
  igdbClientId?: string;
  igdbClientSecret?: string;
  tmdbApiKey?: string;
  googleBooksApiKey?: string;
  nanoGptApiKey?: string;
  /** Analytical work: classifying, extracting, converting prose to JSON. */
  nanoGptModel?: string;
  /** The same analytical work, but over injected web-search results. */
  nanoGptWebModel?: string;
  /** User-facing prose: enemy and item flavour, titles, quests, recaps. */
  nanoGptCreativeModel?: string;
  geminiApiKey?: string;
  // Image generation (system-wide; merged in from system_settings on the client)
  imageModel?: string;
  imageSize?: string;
  imageSteps?: number;
  imageGuidance?: number;
  imageNegativePrompt?: string;
  timezone?: string;
  aiPersona?: string;
  yearlyGoals?: Partial<Record<MediaType, number>>;
  lastActiveDate?: string;
  currentStreak?: number;
  enemyDifficulty?: number; // 0.1 to 2.0 multiplier
  mediaDifficulty?: Partial<Record<MediaType, number>>; // 0.1 to 2.0 multiplier per media type
  questOffsets?: Record<string, number>;
  questConfigs?: Record<string, any>;
  questRerollsUsed?: Record<string, number>;
  masterPageConfig?: {
    gamePagesPerHour?: number; // 5 mins = 1 page -> 12 pages per hr
    vnPagesPerHour?: number; // 2.5 mins = 1 page -> 24 pages per hr
    audiobookPagesPerHour?: number; // fallback: 30 pages per hr
    mangaPagesPerChapter?: number; // 5
    comicPagesPerIssue?: number; // 20
    episodesWatchedMultiplier?: number; // fallback: 30 pages per episode
    moviePagesPerMovie?: number; // fallback: 100 pages per movie
    runtimeMinutesPerPage?: number; // 2.5 mins = 1 page
  };
}

// Helper specific tracking info mapping for UI and Logic
export const getMetricForType = (type: MediaType): MetricType | null => {
  switch (type) {
    case 'Game': return 'playtimeHours';
    case 'Visual Novel': return 'playtimeHours';
    case 'Audiobook': return 'playtimeHours';
    case 'Book': return 'pagesRead';
    case 'Manga': return 'chaptersRead';
    case 'Series': return 'episodesWatched';
    case 'Movie': return 'watchCount';
    case 'Comic': return 'issuesRead';
    default: return null;
  }
}

export const MEDIA_COLORS: Record<MediaType, { text: string, bg: string, progress: string, shadow: string, glow: string }> = {
  'Game': { text: 'text-orange-400', bg: 'bg-orange-600', progress: 'bg-orange-500', shadow: 'shadow-[0_0_12px_rgba(249,115,22,0.5)]', glow: 'bg-orange-500/30' },
  'Book': { text: 'text-teal-400', bg: 'bg-teal-600', progress: 'bg-teal-500', shadow: 'shadow-[0_0_12px_rgba(20,184,166,0.5)]', glow: 'bg-teal-500/30' },
  'Audiobook': { text: 'text-pink-400', bg: 'bg-pink-600', progress: 'bg-pink-500', shadow: 'shadow-[0_0_12px_rgba(244,114,182,0.5)]', glow: 'bg-pink-500/30' },
  'Visual Novel': { text: 'text-purple-400', bg: 'bg-purple-600', progress: 'bg-purple-500', shadow: 'shadow-[0_0_12px_rgba(168,85,247,0.5)]', glow: 'bg-purple-500/30' },
  'Manga': { text: 'text-blue-400', bg: 'bg-blue-600', progress: 'bg-blue-500', shadow: 'shadow-[0_0_12px_rgba(59,130,246,0.5)]', glow: 'bg-blue-500/30' },
  'Series': { text: 'text-red-400', bg: 'bg-red-600', progress: 'bg-red-500', shadow: 'shadow-[0_0_12px_rgba(239,68,68,0.5)]', glow: 'bg-red-500/30' },
  'Movie': { text: 'text-yellow-400', bg: 'bg-yellow-600', progress: 'bg-yellow-500', shadow: 'shadow-[0_0_12px_rgba(234,179,8,0.5)]', glow: 'bg-yellow-500/30' },
  'Comic': { text: 'text-green-400', bg: 'bg-green-600', progress: 'bg-green-500', shadow: 'shadow-[0_0_12px_rgba(34,197,94,0.5)]', glow: 'bg-green-500/30' },
};

export const MEDIA_HEX: Record<MediaType, { base: string, hover: string }> = {
  'Game': { base: '#f97316', hover: '#ea580c' }, // orange-500, orange-600
  'Book': { base: '#14b8a6', hover: '#0d9488' }, // teal-500, teal-600
  'Audiobook': { base: '#ec4899', hover: '#db2777' }, // pink-500, pink-600
  'Visual Novel': { base: '#a855f7', hover: '#9333ea' }, // purple-500, purple-600
  'Manga': { base: '#3b82f6', hover: '#2563eb' }, // blue-500, blue-600
  'Series': { base: '#ef4444', hover: '#dc2626' }, // red-500, red-600
  'Movie': { base: '#eab308', hover: '#ca8a04' }, // yellow-500, yellow-600
  'Comic': { base: '#22c55e', hover: '#16a34a' }, // green-500, green-600
};

export const RARITY_COLORS: Record<string, { border: string, bg: string, text: string, textShadow: string }> = {
  'Common': { border: 'border-zinc-500', bg: 'bg-zinc-500/10', text: 'text-zinc-400', textShadow: 'drop-shadow-[0_0_8px_rgba(161,161,170,0.5)]' },
  'Uncommon': { border: 'border-green-500', bg: 'bg-green-500/10', text: 'text-green-400', textShadow: 'drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]' },
  'Rare': { border: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400', textShadow: 'drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]' },
  'Super Rare': { border: 'border-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', textShadow: 'drop-shadow-[0_0_8px_rgba(192,132,252,0.5)]' },
  'Epic': { border: 'border-pink-500', bg: 'bg-pink-500/10', text: 'text-pink-400', textShadow: 'drop-shadow-[0_0_8px_rgba(244,114,182,0.5)]' },
  'Legendary': { border: 'border-yellow-500', bg: 'bg-yellow-500/10', text: 'text-yellow-400', textShadow: 'drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' },
  'Mythic': { border: 'border-red-500', bg: 'bg-red-500/10', text: 'text-red-400', textShadow: 'drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]' },
};
