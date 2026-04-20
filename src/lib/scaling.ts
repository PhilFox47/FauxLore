import { MediaItem } from '../types/schema';

/**
 * Calculates a scaled normalized metric called "Master Pages".
 * The mathematical base is 1 Book Page equals 1 Normalized Page.
 *
 * For Books: 1 Page equals 1 Page
 * For Games: 5 minutes of Playtime equals 1 Page (1 hr = 12 Pages)
 * Visual Novels: 2.5 minutes of Playtime equals 1 Page (1 hr = 24 Pages)
 * Manga: 1 Chapter equals 5 Pages
 * Series: Preference: 2.5 minutes equals 1 Page. Fallback: 1 Episode equals 30 Pages.
 * Movies: Preference: 2.5 minutes equals 1 Page. Fallback: 1 Movie equals 100 Pages.
 * Comic: 1 Issue equals 20 Pages (Fallback logic)
 * 
 * @param item - The MediaItem to extract progress/time from.
 * @returns The scaled number of "pages" representing time invested.
 */
export function calculateScaledPages(item: MediaItem): number {
  switch (item.mediaType) {
    case 'Book':
      return item.pagesRead || 0;
      
    case 'Game': {
      const minutesPlayed = (item.playtimeHours || 0) * 60;
      return Math.round(minutesPlayed / 5);
    }
    
    case 'Visual Novel': {
      const minutesPlayed = (item.playtimeHours || 0) * 60;
      return Math.round(minutesPlayed / 2.5);
    }
    
    case 'Manga':
      return (item.chaptersRead || 0) * 5;
      
    case 'Series': {
      const episodes = item.episodesWatched || 0;
      if (item.runtimeMinutes && item.runtimeMinutes > 0) {
        // Preferred: 2.5 minutes = 1 Page
        const totalMinutes = episodes * item.runtimeMinutes;
        return Math.round(totalMinutes / 2.5);
      } else {
        // Fallback: 1 Episode = 30 Pages
        return episodes * 30;
      }
    }
    
    case 'Movie': {
      const isWatched = item.watched;
      const count = (item.watchCount && item.watchCount > 0) 
        ? item.watchCount 
        : (isWatched ? 1 : 0);

      if (item.runtimeMinutes && item.runtimeMinutes > 0) {
        // Preferred: 2.5 minutes = 1 Page
        const totalMinutes = count * item.runtimeMinutes;
        return Math.round(totalMinutes / 2.5);
      } else {
        // Fallback: 1 Movie = 100 Pages
        return count * 100;
      }
    }
    
    case 'Comic':
      return (item.issuesRead || 0) * 20;

    default:
      return 0;
  }
}

/**
 * Calculates absolute delta normalized "Master Pages".
 * For time series processing where only isolated deltas exist on progress logs.
 * We must locate the corresponding item to calculate scale.
 */
export function calculateScaledDelta(delta: number, item: MediaItem): number {
  if (!item) return delta; // Graceful failure if media is entirely missing

  switch (item.mediaType) {
    case 'Book':
      return delta;
      
    case 'Game': {
      const minutesPlayed = delta * 60; // Delta is in hours
      return Math.round(minutesPlayed / 5);
    }
    
    case 'Visual Novel': {
      const minutesPlayed = delta * 60; // Delta is in hours
      return Math.round(minutesPlayed / 2.5);
    }
    
    case 'Manga':
      return delta * 5; // Delta is chapters
      
    case 'Series': {
      // Delta is episodes
      if (item.runtimeMinutes && item.runtimeMinutes > 0) {
        const totalMinutes = delta * item.runtimeMinutes;
        return Math.round(totalMinutes / 2.5);
      } else {
        return delta * 30;
      }
    }
    
    case 'Movie': {
      // Delta is watchCount increments
      if (item.runtimeMinutes && item.runtimeMinutes > 0) {
        const totalMinutes = delta * item.runtimeMinutes;
        return Math.round(totalMinutes / 2.5);
      } else {
        return delta * 100;
      }
    }
    
    case 'Comic':
      return delta * 20; // Delta is issues

    default:
      return delta;
  }
}
