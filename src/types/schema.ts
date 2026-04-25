/**
 * Database Schema Definitions
 */

export const MEDIA_TYPES = ['Game', 'Book', 'Visual Novel', 'Manga', 'Series', 'Movie', 'Comic'] as const;
export type MediaType = typeof MEDIA_TYPES[number];

export const STATUSES = ['Planning', 'Active', 'On Hold', 'Completed', 'Dropped'] as const;
export type Status = typeof STATUSES[number];

export interface MediaItem {
  id: string;
  isReRun?: boolean;
  originalMediaId?: string;
  title: string;
  mediaType: MediaType;
  coverImageUrl?: string;
  description?: string;
  creator?: string; // Developer, Author, Studio, Director
  publisher?: string;
  year?: number;
  reviewScore?: number; // 0-5
  averagePlaytime?: number; // hours
  hltbMain?: number;
  hltbMainExtra?: number;
  hltbCompletionist?: number;
  selectedHltbType?: 'main' | 'mainExtra' | 'completionist';
  status: Status;
  userRating?: number; // 0-5
  userReview?: string; // Text review written by the user
  
  // Taxonomies
  genres: string[];
  tags: string[];
  tropes: string[];

  // Metrics (specific mapping per type)
  // Game & Visual Novel
  playtimeHours?: number;
  isOngoing?: boolean;
  
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
  | 'issuesRead';

export interface ProgressLog {
  id: string;
  mediaId: string;
  userId?: string; // Optional user identifier for future multi-user support
  timestamp: string; // ISO string
  metricType: MetricType;
  delta: number; // e.g., +2
  note?: string;
  location?: string;
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
}

export interface Settings {
  userId: string;
  igdbClientId?: string;
  igdbClientSecret?: string;
  tmdbApiKey?: string;
  nanoGptApiKey?: string;
  nanoGptModel?: string;
  geminiApiKey?: string;
  timezone?: string;
  yearlyGoals?: Partial<Record<MediaType, number>>;
  lastActiveDate?: string;
  currentStreak?: number;
  masterPageConfig?: {
    gamePagesPerHour?: number; // 5 mins = 1 page -> 12 pages per hr
    vnPagesPerHour?: number; // 2.5 mins = 1 page -> 24 pages per hr
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
  'Visual Novel': { text: 'text-purple-400', bg: 'bg-purple-600', progress: 'bg-purple-500', shadow: 'shadow-[0_0_12px_rgba(168,85,247,0.5)]', glow: 'bg-purple-500/30' },
  'Manga': { text: 'text-blue-400', bg: 'bg-blue-600', progress: 'bg-blue-500', shadow: 'shadow-[0_0_12px_rgba(59,130,246,0.5)]', glow: 'bg-blue-500/30' },
  'Series': { text: 'text-red-400', bg: 'bg-red-600', progress: 'bg-red-500', shadow: 'shadow-[0_0_12px_rgba(239,68,68,0.5)]', glow: 'bg-red-500/30' },
  'Movie': { text: 'text-yellow-400', bg: 'bg-yellow-600', progress: 'bg-yellow-500', shadow: 'shadow-[0_0_12px_rgba(234,179,8,0.5)]', glow: 'bg-yellow-500/30' },
  'Comic': { text: 'text-green-400', bg: 'bg-green-600', progress: 'bg-green-500', shadow: 'shadow-[0_0_12px_rgba(34,197,94,0.5)]', glow: 'bg-green-500/30' },
};
