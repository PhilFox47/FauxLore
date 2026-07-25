import { MediaType } from '../types/schema';

export interface GameMetadata {
  id: string;
  title: string;
  developer: string;
  publisher: string;
  year: number;
  genres: string[];
  tags: string[];
  reviewScore: number;
  averagePlaytime: number;
  hltbMain?: number;
  hltbMainExtra?: number;
  hltbCompletionist?: number;
  selectedHltbType?: 'main' | 'mainExtra' | 'completionist';
  description?: string;
  coverImageUrl: string;
}

export interface BookMetadata {
  id: string;
  title: string;
  creator: string; // Author
  year?: number;
  totalPages?: number;
  reviewScore?: number;
  description?: string;
  genres?: string[];
  coverImageUrl?: string;
}

/**
 * FUTURE EXTERNAL APIS INTERFACES
 * This file serves as the blueprint for future integrations with TMDB, Plex, and Playnite.
 */

// Example: Generic external Search Result
export interface MovieMetadata {
  id: string;
  title: string;
  creator: string; // Director
  year?: number;
  reviewScore?: number;
  description?: string;
  genres?: string[];
  coverImageUrl?: string;
  runtimeMinutes?: number;
}

export interface SeasonMetadata {
  id: string;
  name: string;
  seasonNumber: number;
  episodeCount: number;
  overview?: string;
  posterPath?: string;
  voteAverage?: number;
  airDate?: string;
}

export interface SeriesMetadata {
  id: string;
  title: string;
  creator: string; // Showrunner / Creator
  year?: number;
  reviewScore?: number;
  description?: string;
  genres?: string[];
  coverImageUrl?: string;
  totalEpisodes?: number;
  runtimeMinutes?: number;
  seasons?: SeasonMetadata[];
}

export interface VisualNovelMetadata {
  id: string;
  title: string;
  developer: string;
  year?: number;
  reviewScore?: number;
  description?: string;
  genres?: string[];
  averagePlaytime?: number;
  tags?: string[];
  coverImageUrl?: string;
  franchises?: string[];
}

export interface ExternalMediaMetadata {
  externalId: string;
  title: string;
  coverImageUrl?: string;
  creator?: string;
  genres: string[];
  description?: string;
  releaseDate?: string;
}

export const IntegrationsService = {
  /**
   * Search Video Game Database using full-stack API route to IGDB
   */
  async searchGameMetadata(query: string): Promise<GameMetadata[]> {
    try {
      const response = await fetch(`/api/games/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${localStorage.getItem('fauxlore_token')}` } });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to search metadata');
      }

      const results = await response.json();
      return results;
    } catch (e) {
      console.error("Error searching game metadata:", e);
      throw e; // Pass to UI so it can display error state
    }
  },

  /**
   * Search Hardcover.app API using full-stack proxy route
   */
  async searchBookMetadata(query: string, lang?: string): Promise<BookMetadata[]> {
    try {
      const url = new URL('/api/books/search', window.location.origin);
      url.searchParams.append('q', query);
      if (lang) {
        url.searchParams.append('lang', lang);
      }
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${localStorage.getItem('fauxlore_token')}` }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to search metadata');
      }

      const results = await response.json();
      return results;
    } catch (e) {
      console.error("Error searching book metadata:", e);
      throw e; // Pass to UI so it can display error state
    }
  },

  /**
   * Search TMDB for Movies or Series
   */
  async searchTMDBMetadata(query: string, type: 'Movie' | 'Series'): Promise<MovieMetadata[] | SeriesMetadata[]> {
    try {
      const tmdbType = type === 'Movie' ? 'movie' : 'tv';
      const response = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=${tmdbType}`, { headers: { Authorization: `Bearer ${localStorage.getItem('fauxlore_token')}` } });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to search metadata');
      }

      const results = await response.json();
      return results;
    } catch (e) {
      console.error(`Error searching ${type} metadata:`, e);
      throw e; 
    }
  },

  /**
   * Search VNDB for Visual Novels
   */
  async searchVNDBMetadata(query: string): Promise<VisualNovelMetadata[]> {
    try {
      const response = await fetch(`/api/vndb/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${localStorage.getItem('fauxlore_token')}` } });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to search metadata');
      }

      const results = await response.json();
      return results;
    } catch (e) {
      console.error("Error searching VN metadata:", e);
      throw e; 
    }
  },

  /**
   * Search GameStoryLog for western / adult Visual Novels.
   * Complements VNDB, which covers these poorly.
   */
  async searchGSLMetadata(query: string): Promise<any[]> {
    try {
      const response = await fetch(`/api/gsl/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${localStorage.getItem('fauxlore_token')}` } });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to search metadata');
      }

      return await response.json();
    } catch (e) {
      console.error("Error searching GameStoryLog metadata:", e);
      throw e;
    }
  },

  /**
   * Search MangaDex for Manga
   */
  async searchMangaMetadata(query: string) {
    try {
      const response = await fetch(`/api/manga/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${localStorage.getItem('fauxlore_token')}` } });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to search metadata');
      }

      const results = await response.json();
      return results;
    } catch (e) {
      console.error("Error searching manga metadata:", e);
      throw e; 
    }
  },
  /**
   * Playnite Webhooks/Local API (Planned)
   * Future injection logic:
   * 1. App listens for websocket/REST calls from Playnite plugin
   * 2. When a game closes, Playnite sends total playtime
   * 3. This webhook parses the difference, creates a ProgressLog, and updates the Game's playtimeHours
   */
  async handlePlayniteWebhook(payload: any): Promise<void> {
    console.log('[Future] Will process Playnite webhook', payload);
  },

  /**
   * Plex Webhooks (Planned)
   * Future injection logic:
   * 1. App receives 'media.scrobble' event for Plex Server
   * 2. Map Plex series/movie ID to internal MediaItem
   * 3. Trigger watches or progress logs depending on completion percentage
   */
  async handlePlexWebhook(payload: any): Promise<void> {
    console.log('[Future] Will process Plex webhook', payload);
  },

  /**
   * MyAnimeList / MangaDex / Kitsu (Planned)
   * Future injection logic:
   * 1. Pull user's lists periodically
   * 2. Merge changes intelligently by comparing updatedAt timestamps
   */
  async syncExtraPlatforms(username: string, platform: string): Promise<void> {
    console.log(`[Future] Will sync ${platform} library for ${username}`);
  },
  
  /**
   * Standalone HLTB fetcher
   */
  async fetchHltbData(query: string) {
    try {
      const response = await fetch(`/api/hltb/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${localStorage.getItem('fauxlore_token')}` } });
      if (!response.ok) throw new Error("Could not find HLTB data");
      return await response.json();
    } catch (e) {
      console.error("HLTB Fetch error:", e);
      throw e;
    }
  }
};
