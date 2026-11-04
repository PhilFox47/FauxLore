import type { MediaItem } from '../types/schema';

/** Server-observed personal state. Legacy opinions are first observed at migration, never backdated. */
export interface MediaOpinionSnapshot {
  mediaId: string;
  recordedAt: string;
  userRating: number | null;
  userReview: string | null;
  dropReason: string | null;
}

/**
 * Only personal opinions witnessed by the server on or before the period's end
 * can be told as part of that period. A missing snapshot means "unknown", not
 * "unrated". Source metadata (genres, title, critic score) remains intact.
 */
export function mediaOpinionsAsOf(
  media: MediaItem[],
  history: MediaOpinionSnapshot[],
  periodEnd: Date,
): MediaItem[] {
  const cutoff = periodEnd.getTime();
  const latest = new Map<string, { at: number; state: MediaOpinionSnapshot }>();
  for (const state of history) {
    const at = Date.parse(state.recordedAt);
    if (!Number.isFinite(at) || at > cutoff) continue;
    const previous = latest.get(state.mediaId);
    if (!previous || at >= previous.at) latest.set(state.mediaId, { at, state });
  }
  return media.map(item => {
    const state = latest.get(item.id)?.state;
    return {
      ...item,
      userRating: state?.userRating ?? undefined,
      userReview: state?.userReview ?? undefined,
      dropReason: state?.dropReason ?? undefined,
    };
  });
}
