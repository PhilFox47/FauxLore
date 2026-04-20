/**
 * Database Schema Definitions
 */

export const MEDIA_TYPES = ['Game', 'Book', 'Visual Novel', 'Manga', 'Series', 'Movie', 'Comic'] as const;
export type MediaType = typeof MEDIA_TYPES[number];

export const STATUSES = ['Planning', 'Active', 'On Hold', 'Completed', 'Dropped'] as const;
export type Status = typeof STATUSES[number];

export interface MediaItem {
  id: string;
  title: string;
  mediaType: MediaType;
  coverImageUrl?: string;
  description?: string;
  creator?: string; // Developer, Author, Studio, Director
  publisher?: string;
  year?: number;
  reviewScore?: number; // 1-100
  averagePlaytime?: number; // hours
  status: Status;
  userRating?: number; // 1-10
  
  // Taxonomies
  genres: string[];
  tags: string[];
  tropes: string[];

  // Metrics (specific mapping per type)
  // Game & Visual Novel
  playtimeHours?: number;
  
  // Book
  pagesRead?: number;
  totalPages?: number;

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
  timestamp: string; // ISO string
  metricType: MetricType;
  delta: number; // e.g., +2
  note?: string;
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
