import { MediaItem } from '../types/schema';

/**
 * What "On Hold" actually means here.
 *
 * On Hold is a deliberate park with an intention to return. Most often it
 * means waiting for external content (episode/volume/patch); occasionally it
 * also means a voluntary break, for example pausing an MMO subscription.
 * Caught Up is specifically an ongoing work consumed through the latest
 * available content. Neither status indicates lost interest or laziness.
 *
 * Recommendation logic conservatively parks both until new content is known.
 * This is a UX heuristic, NOT evidence that the user could not play/read, and
 * NOT proof of the user's reason for the break. Subscription resumption can be
 * manually initiated without a metadata release signal.
 */

/**
 * Why this entry is worth looking at again, or null if nothing has changed.
 *
 * Only hard signals count. A metadata refresh finding a newer version upstream
 * is the strongest one; an awaited release date that has since passed is the
 * other. Progress remaining against a total is deliberately NOT a signal —
 * being parked mid-way is the normal state of a title waiting on its next
 * instalment.
 */
export function newContentReason(m: MediaItem): string | null {
  if (m.updateAvailable) {
    const version = (m.sourceVersion || '').trim();
    return version ? `New version: ${version}` : 'Update available';
  }
  if (m.expectedReleaseDate) {
    const due = Date.parse(m.expectedReleaseDate);
    if (Number.isFinite(due) && due <= Date.now()) return 'Expected release has landed';
  }
  return null;
}

/** Whether anything new has shipped for this entry since it was parked. */
export const hasNewContent = (m: MediaItem): boolean => newContentReason(m) !== null;

/** Parked on something outside the user's control, with nothing new to show for it. */
export const isWaitingOnRelease = (m: MediaItem): boolean =>
  (m.status === 'On Hold' || m.status === 'Caught Up') && !hasNewContent(m);

/**
 * The gate for every "you could pick this up" surface. Everything passes except
 * an On Hold entry that is still waiting.
 */
export const canBeSuggested = (m: MediaItem): boolean => !isWaitingOnRelease(m);
