/**
 * Personal full-work review and rating events derived from the append-only
 * opinion history. These are NOT progress logs, session ratings or Journals.
 *
 * recordedAt is when FauxLore actually observed the opinion; legacy reviews
 * are deliberately not backdated to a medium's creation/update timestamp.
 */
export interface LorebookOpinionSnapshot {
  id: number;
  mediaId: string;
  recordedAt: string;
  userRating: number | null;
  userReview: string | null;
}

export interface LorebookReviewEvent {
  id: string;
  mediaId: string;
  ts: string;
  kind: 'review' | 'rating';
  change: 'recorded' | 'updated' | 'removed';
  review: string | null;
  previousReview: string | null;
  rating: number | null;
  previousRating: number | null;
}

const normalizedReview = (text: string | null): string | null =>
  typeof text === 'string' && text.trim() ? text.trim() : null;

const normalizedRating = (rating: number | null): number | null =>
  typeof rating === 'number' && Number.isFinite(rating) && rating >= 0 && rating <= 5
    ? rating : null;

/** Keep the chronology per media, not one global "previous review". */
export function buildLorebookReviewEvents(
  history: readonly LorebookOpinionSnapshot[],
): LorebookReviewEvent[] {
  const previous = new Map<string, { review: string | null; rating: number | null }>();
  const events: LorebookReviewEvent[] = [];

  const ordered = [...history].sort((a, b) =>
    a.recordedAt.localeCompare(b.recordedAt) || a.id - b.id);
  for (const snapshot of ordered) {
    const ts = Date.parse(snapshot.recordedAt);
    if (!snapshot.mediaId || !Number.isFinite(ts) || !Number.isSafeInteger(snapshot.id)) continue;

    const review = normalizedReview(snapshot.userReview);
    const rating = normalizedRating(snapshot.userRating);
    const before = previous.get(snapshot.mediaId) || { review: null, rating: null };
    const reviewChanged = review !== before.review;
    const ratingChanged = rating !== before.rating;
    previous.set(snapshot.mediaId, { review, rating });

    // A drop-reason-only snapshot or duplicate state is not a review event.
    if (!reviewChanged && !ratingChanged) continue;
    const kind = reviewChanged ? 'review' : 'rating';
    const prior = kind === 'review' ? before.review : before.rating;
    const current = kind === 'review' ? review : rating;
    const change: LorebookReviewEvent['change'] =
      current === null ? 'removed' : prior === null ? 'recorded' : 'updated';

    events.push({
      id: 'opinion-' + snapshot.id,
      mediaId: snapshot.mediaId,
      ts: snapshot.recordedAt,
      kind, change,
      review: kind === 'review' ? review : null,
      previousReview: kind === 'review' && change === 'removed' ? before.review : null,
      rating,
      previousRating: before.rating,
    });
  }
  return events;
}
