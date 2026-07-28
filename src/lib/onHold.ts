import { MediaItem } from '../types/schema';

/**
 * What "On Hold" actually means here.
 *
 * It is not "paused because I lost interest" — that is what Dropped is for.
 * On Hold means the entry is parked *waiting on the world*: the next season,
 * the next volume, the next patch. Until something new ships there is nothing
 * to pick up, so nudging the user toward it is noise at best and wrong at
 * worst ("you've been ignoring this for 90 days" — no, it hasn't updated in 90
 * days).
 *
 * So anything that suggests, nags, ranks or quests over what to consume next
 * runs its candidates through here first. The rule is deliberately strict: an
 * On Hold entry only re-enters the suggestion pool once there is concrete
 * evidence of new content. No evidence means no suggestion, because a wrong
 * nudge costs more than a missed one.
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
  m.status === 'On Hold' && !hasNewContent(m);

/**
 * The gate for every "you could pick this up" surface. Everything passes except
 * an On Hold entry that is still waiting.
 */
export const canBeSuggested = (m: MediaItem): boolean => !isWaitingOnRelease(m);
