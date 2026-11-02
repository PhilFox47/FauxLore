import type { MediaItem, Status } from '../types/schema';

/** Shared status policy for both the UI preview and server write. */
export function suggestLogStatus(
  media: Pick<MediaItem, 'mediaType' | 'status' | 'isOngoing' | 'releaseStatus' | 'pagesRead' | 'totalPages'
    | 'chaptersRead' | 'totalChapters' | 'episodesWatched' | 'totalEpisodes'
    | 'issuesRead' | 'totalIssues' | 'availableUnits' | 'playtimeHours' | 'totalDurationHours'>,
  delta: number,
  historic = false,
): Status {
  const current = media.status;
  // Never infer conclusions or begin a new playthrough from retroactive/historical progress.
  if (historic || !Number.isFinite(delta) || delta <= 0) return current;
  if (['Completed','Extras','Dropped','Unreleased'].includes(current)) return current;
  const ongoing = !!media.isOngoing ||
    /ongoing|releasing|airing|returning/.test(String(media.releaseStatus || '').toLowerCase());
  let reachedEnd = false;
  if (media.mediaType === 'Movie') reachedEnd = true;
  else {
    const units: Record<string, [number | undefined, number | undefined]> = {
      Book: [media.pagesRead, media.totalPages],
      Series: [media.episodesWatched, ongoing ? (media.availableUnits || media.totalEpisodes) : media.totalEpisodes],
      Manga: [media.chaptersRead, ongoing ? (media.availableUnits || media.totalChapters) : media.totalChapters],
      Comic: [media.issuesRead, ongoing ? (media.availableUnits || media.totalIssues) : media.totalIssues],
      Audiobook: [media.playtimeHours, media.totalDurationHours],
    };
    const values = units[media.mediaType];
    if (values) {
      const [currentValue, total] = values;
      reachedEnd = typeof total === 'number' && Number.isFinite(total) && total > 0 &&
        (Number(currentValue) || 0) + delta >= total - 0.001;
    }
  }
  if (reachedEnd) return ongoing && media.mediaType !== 'Movie' ? 'Caught Up' : 'Completed';
  // Previously caught-up series can become active when new material is released.
  if (current === 'Caught Up' && ongoing) return 'Active';
  return current === 'Planning' ? 'Active' : current;
}
