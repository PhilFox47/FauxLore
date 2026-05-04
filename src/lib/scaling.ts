import { MediaItem, Settings } from '../types/schema';

/**
 * Calculates a scaled normalized metric called "Master Pages".
 * The mathematical base is 1 Book Page equals 1 Normalized Page.
 *
 * @param item - The MediaItem to extract progress/time from.
 * @param settings - The user settings containing Master Page multipliers.
 * @returns The scaled number of "pages" representing time invested.
 */
export function calculateScaledPages(item: MediaItem, settings?: Settings | null): number {
  const defaults = {
    gamePagesPerHour: 12,
    vnPagesPerHour: 24,
    audiobookPagesPerHour: 30,
    mangaPagesPerChapter: 5,
    comicPagesPerIssue: 20,
    episodesWatchedMultiplier: 30,
    moviePagesPerMovie: 100,
    runtimeMinutesPerPage: 2.5
  };
  
  const multipliers = { ...defaults, ...settings?.masterPageConfig };

  switch (item.mediaType) {
    case 'Book':
      return item.pagesRead || 0;
      
    case 'Audiobook': {
      const hoursPlayed = (item.playtimeHours || 0);
      return Math.round(hoursPlayed * multipliers.audiobookPagesPerHour);
    }
      
    case 'Game': {
      const hoursPlayed = (item.playtimeHours || 0);
      const modifier = item.storyHeavyModifier ?? 1.0;
      return Math.round(hoursPlayed * multipliers.gamePagesPerHour * modifier);
    }

    case 'Visual Novel': {
      const hoursPlayed = (item.playtimeHours || 0);
      const modifier = item.storyHeavyModifier ?? 1.0;
      return Math.round(hoursPlayed * multipliers.vnPagesPerHour * modifier);
    }
    
    case 'Manga':
      return (item.chaptersRead || 0) * multipliers.mangaPagesPerChapter;
      
    case 'Series': {
      const episodes = item.episodesWatched || 0;
      if (item.runtimeMinutes && item.runtimeMinutes > 0) {
        const totalMinutes = episodes * item.runtimeMinutes;
        return Math.round(totalMinutes / multipliers.runtimeMinutesPerPage);
      } else {
        return episodes * multipliers.episodesWatchedMultiplier;
      }
    }
    
    case 'Movie': {
      const isWatched = item.watched;
      const count = (item.watchCount && item.watchCount > 0) 
        ? item.watchCount 
        : (isWatched ? 1 : 0);

      if (item.runtimeMinutes && item.runtimeMinutes > 0) {
        const totalMinutes = count * item.runtimeMinutes;
        return Math.round(totalMinutes / multipliers.runtimeMinutesPerPage);
      } else {
        return count * multipliers.moviePagesPerMovie;
      }
    }
    
    case 'Comic':
      return (item.issuesRead || 0) * multipliers.comicPagesPerIssue;

    default:
      return 0;
  }
}

/**
 * Calculates absolute delta normalized "Master Pages".
 * For time series processing where only isolated deltas exist on progress logs.
 * We must locate the corresponding item to calculate scale.
 */
export function calculateScaledDelta(delta: number, item: MediaItem, settings?: Settings | null): number {
  if (!item) return delta; // Graceful failure if media is entirely missing

  const defaults = {
    gamePagesPerHour: 12,
    vnPagesPerHour: 24,
    audiobookPagesPerHour: 30,
    mangaPagesPerChapter: 5,
    comicPagesPerIssue: 20,
    episodesWatchedMultiplier: 30,
    moviePagesPerMovie: 100,
    runtimeMinutesPerPage: 2.5
  };
  
  const multipliers = { ...defaults, ...settings?.masterPageConfig };

  switch (item.mediaType) {
    case 'Book':
      return delta;
      
    case 'Audiobook': {
      return Math.round(delta * multipliers.audiobookPagesPerHour); // Delta is in hours
    }
      
    case 'Game': {
      const modifier = item.storyHeavyModifier ?? 1.0;
      return Math.round(delta * multipliers.gamePagesPerHour * modifier); // Delta is in hours
    }

    case 'Visual Novel': {
      const modifier = item.storyHeavyModifier ?? 1.0;
      return Math.round(delta * multipliers.vnPagesPerHour * modifier); // Delta is in hours
    }
    
    case 'Manga':
      return delta * multipliers.mangaPagesPerChapter; // Delta is chapters
      
    case 'Series': {
      // Delta is episodes
      if (item.runtimeMinutes && item.runtimeMinutes > 0) {
        const totalMinutes = delta * item.runtimeMinutes;
        return Math.round(totalMinutes / multipliers.runtimeMinutesPerPage);
      } else {
        return delta * multipliers.episodesWatchedMultiplier;
      }
    }
    
    case 'Movie': {
      // Delta is watchCount increments
      if (item.runtimeMinutes && item.runtimeMinutes > 0) {
        const totalMinutes = delta * item.runtimeMinutes;
        return Math.round(totalMinutes / multipliers.runtimeMinutesPerPage);
      } else {
        return delta * multipliers.moviePagesPerMovie;
      }
    }
    
    case 'Comic':
      return delta * multipliers.comicPagesPerIssue; // Delta is issues

    default:
      return delta;
  }
}
