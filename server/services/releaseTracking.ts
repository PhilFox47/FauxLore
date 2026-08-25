import type { ReleaseState } from "../integrations/releaseFeeds";
import { hasLanded } from "../integrations/releaseFeeds";

/**
 * Moving an entry's status because the world moved, not because the user did.
 *
 * Three things happen on their own here: something announced becomes something
 * released, something you are level with becomes something you are behind on,
 * and the reverse. All three are facts about the source rather than judgements
 * about the user, which is the line this file will not cross.
 *
 * What it will NOT touch:
 *
 *   Completed, Dropped, Extras   Verdicts. The user has decided; a new episode
 *                                does not un-decide it.
 *   On Hold                      The user's own "I am waiting". Caught Up is the
 *                                app's version of the same idea, so the app
 *                                manages that one and leaves this one alone —
 *                                otherwise parking something deliberately would
 *                                be undone by the next chapter.
 *
 * Everything here is pure so the rules can be argued with directly, including
 * the transitions that must never fire.
 */

/** Just enough of a media row to decide. */
export interface TrackedEntry {
  status: string;
  mediaType: string;
  /** What the user has actually consumed, in the unit the source counts in. */
  consumedUnits?: number | null;
  expectedReleaseDate?: string | null;
  isOngoing?: boolean | null;
}

export interface StatusDecision {
  status: string;
  /** Said plainly, because it becomes the notification the user reads. */
  reason: string;
}

/** Statuses the app is allowed to move away from. */
const MOVABLE = new Set(["Planning", "Active", "Caught Up", "Unreleased"]);

/** Only these types have instalments worth being level with. */
const EPISODIC = new Set(["Series", "Manga"]);

/**
 * Whether every instalment that exists has been consumed.
 *
 * Returns null when the question cannot be answered: the source gave no count,
 * so "all of them" has no meaning. That must not move anything, because "0 of
 * unknown" looks identical to "all of nothing".
 *
 * A null on OUR side is different and deliberately counts as zero — an entry
 * with no episodes recorded has genuinely had none watched. That can only ever
 * produce "behind", never "level", so the worst it can do is leave something
 * Active that the user had in fact finished. The opposite mistake — declaring
 * someone caught up on a season they have not started — is the one worth
 * ruling out.
 */
export function isLevelWith(entry: TrackedEntry, upstream: ReleaseState): boolean | null {
  const available = upstream.availableUnits;
  if (typeof available !== "number" || available <= 0) return null;
  if (entry.consumedUnits === undefined) return null;
  const consumed = Number(entry.consumedUnits ?? 0);
  if (!Number.isFinite(consumed)) return null;
  return consumed >= available;
}

/**
 * The status this entry should have, or null to leave it alone.
 *
 * `now` is injected so the boundary cases — an episode airing today, a release
 * date that is today — can be argued with rather than hoped about.
 */
export function decideStatus(
  entry: TrackedEntry,
  upstream: ReleaseState,
  now = new Date(),
): StatusDecision | null {
  if (!MOVABLE.has(entry.status)) return null;

  const releaseDate = upstream.releaseDate || entry.expectedReleaseDate || undefined;
  const released = releaseDate ? hasLanded(String(releaseDate).slice(0, 10), now) : undefined;

  // 1. Nothing of this exists yet.
  //
  // Only an actual future date counts. A missing date is not evidence of the
  // future — most of the library has no release date at all, and treating that
  // as "unreleased" would swallow the whole thing.
  if (releaseDate && released === false) {
    if (entry.status === "Unreleased") return null;
    return {
      status: "Unreleased",
      reason: `Not out until ${String(releaseDate).slice(0, 10)}`,
    };
  }

  // 2. It has come out. Unreleased is now simply wrong, and Planning is the
  //    honest landing spot: available, not started.
  if (entry.status === "Unreleased") {
    if (released !== true) return null;
    return { status: "Planning", reason: "This has been released" };
  }

  // 3. Episodic: level with everything that exists, or behind again.
  if (!EPISODIC.has(entry.mediaType)) return null;

  const level = isLevelWith(entry, upstream);
  if (level === null) return null;

  if (entry.status === "Active" && level) {
    // Being level with a finished work is not "caught up", it is finished — but
    // deciding that is the user's call, so nothing happens here.
    if (upstream.ended) return null;
    const next = upstream.nextReleaseAt
      ? ` Next: ${upstream.nextReleaseLabel || "the next one"} on ${upstream.nextReleaseAt}.`
      : "";
    return {
      status: "Caught Up",
      reason: `Everything released so far has been ${entry.mediaType === "Manga" ? "read" : "watched"}.${next}`,
    };
  }

  if (entry.status === "Caught Up" && !level) {
    return {
      status: "Active",
      reason: upstream.nextReleaseLabel
        ? `Something new is out — up to ${upstream.nextReleaseLabel}`
        : "Something new is out",
    };
  }

  return null;
}

/** Which of our columns the source's answer should be written into. */
export function releaseFieldsFor(upstream: ReleaseState): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (upstream.releaseDate) fields.expectedReleaseDate = upstream.releaseDate;
  // A label and a date are mutually exclusive: once a source becomes precise,
  // the old "Q4 2026" must not linger next to the real day.
  if (upstream.releaseDate) fields.releaseDateLabel = null;
  else if (upstream.releaseDateLabel) fields.releaseDateLabel = upstream.releaseDateLabel;
  if (upstream.nextReleaseAt !== undefined) fields.nextReleaseAt = upstream.nextReleaseAt ?? null;
  if (upstream.nextReleaseLabel !== undefined) fields.nextReleaseLabel = upstream.nextReleaseLabel ?? null;
  if (typeof upstream.availableUnits === "number") fields.availableUnits = upstream.availableUnits;
  return fields;
}

/**
 * Whether the announced date moved.
 *
 * Worth telling the user about on its own: a delay or a pull-forward is news
 * even though nothing about their own progress changed.
 */
export function releaseDateMoved(before?: string | null, after?: string | null): boolean {
  const a = (before || "").slice(0, 10);
  const b = (after || "").slice(0, 10);
  return !!a && !!b && a !== b;
}
