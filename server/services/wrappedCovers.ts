import { randomUUID } from "node:crypto";
import type { Db } from "../context";

export type WrappedTimeframe = "week" | "month" | "year";
export type WrappedCoverSubject = { id: string; title: string; type: string; genres?: string[] };
export type WrappedCoverStory = {
  title: string;
  dek: string;
  scenes: Array<{
    kind: string;
    title: string;
    evidenceIds?: string[];
    design?: { palette?: string };
    media?: { id?: string };
    artworks?: Array<{ id?: string }>;
  }>;
};

const palettes: Record<string, string> = {
  violet: "deep violet and indigo with subtle lavender highlights",
  cobalt: "deep cobalt-blue and midnight tones",
  amber: "warm amber and dark bronze",
  rose: "rose and burgundy against charcoal",
  emerald: "forest green and deep teal",
  cyan: "teal, cyan and dark navy",
  monochrome: "high-contrast charcoal, graphite and silver",
};

const compact = (value: unknown, limit = 140): string =>
  String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);

/**
 * Convert the same period IDs used by Wrapped into UTC log boundaries.
 * WrappedEvidence places activity on its reporting day after shifting a
 * timestamp back five hours. Use matching 05:00 UTC boundaries here.
 */
/** Convert a local midnight in an IANA timezone into a UTC instant, including DST. */
function zonedMidnight(utcCalendarDate: number, timeZone: string): number {
  const partsFor = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const values = Object.fromEntries(parts.map(p => [p.type, Number(p.value)]));
    return Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  };
  const offset = (at: number) => partsFor(at) - at;
  let actual = utcCalendarDate - offset(utcCalendarDate);
  actual = utcCalendarDate - offset(actual); // re-check near daylight-saving changes
  return actual;
}

export function wrappedCoverBounds(timeframe: WrappedTimeframe, timeId: string, timeZone = "UTC") {
  const year = Number(timeId.slice(0, 4));
  if (!Number.isInteger(year) || year < 1970 || year > 2200) throw new Error("Invalid Wrapped year");
  let startMs: number;
  let endMs: number;
  if (timeframe === "year") {
    if (!/^\d{4}$/.test(timeId)) throw new Error("Invalid Wrapped year");
    startMs = Date.UTC(year, 0, 1);
    endMs = Date.UTC(year + 1, 0, 1);
  } else if (timeframe === "month") {
    const month = Number(timeId.slice(5, 7));
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(timeId)) throw new Error("Invalid Wrapped month");
    startMs = Date.UTC(year, month - 1, 1);
    endMs = Date.UTC(year, month, 1);
  } else {
    const week = Number(timeId.slice(6));
    if (!/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(timeId)) throw new Error("Invalid Wrapped week");
    const jan4 = Date.UTC(year, 0, 4);
    const day = new Date(jan4).getUTCDay();
    const monday = jan4 - ((day + 6) % 7) * 86_400_000;
    startMs = monday + (week - 1) * 7 * 86_400_000;
    endMs = startMs + 7 * 86_400_000;
  }
  return {
    start: new Date(zonedMidnight(startMs, timeZone) + 5 * 3600_000).toISOString(),
    end: new Date(zonedMidnight(endMs, timeZone) + 5 * 3600_000).toISOString(),
  };
}

/**
 * A single illustrated title-page image, with actual source titles and story
 * themes. Media comes from logged user activity within the requested period,
 * NOT unverified titles invented by the story model.
 */
export function buildWrappedCoverPrompt(
  story: WrappedCoverStory, timeframe: WrappedTimeframe, timeId: string,
  subjects: WrappedCoverSubject[],
): string {
  const title = compact(story.title, 180);
  const dek = compact(story.dek, 220);
  const sceneIdeas = story.scenes
    .filter(s => s.kind !== "opening" && s.kind !== "closing" && !!s.evidenceIds?.length)
    .slice(0, 4).map(s => compact(s.title, 120)).filter(Boolean);
  const sources = subjects.slice(0, 3).map(s => {
    const genres = (s.genres || []).slice(0, 3).map(g => compact(g, 40)).filter(Boolean).join(", ");
    return compact(s.title, 140) + " (" + compact(s.type, 40) + (genres ? "; " + genres : "") + ")";
  });
  const palette = palettes[story.scenes[0]?.design?.palette || ""] || palettes.violet;
  return [
    "Create ONE original, cinematic, visually distinctive editorial TITLE ILLUSTRATION for a personal media Wrapped.",
    "Period: " + timeframe + " " + timeId + ". Main theme: " + title + ". Mood and concept: " + dek + ".",
    sceneIdeas.length ? "Supporting editorial themes: " + sceneIdeas.join("; ") + "." : "",
    sources.length ? "These works were actually logged during this period. Use recognizable visual motifs inspired by their settings and genres, without copying their existing cover art: " + sources.join("; ") + "." : "",
    "Invent one coherent visual metaphor connecting the MOST meaningful two or three themes. Give it a clear central focal point and rich spatial depth. The result should feel like commissioned cover art for THIS specific period, not a generic fantasy image, a cover mosaic, a screenshot collage or unrelated decorative objects.",
    "Cinematic " + palette + " color direction. Source-authentic materials and subject identities wherever recognizable elements appear. Do not invent achievements, gameplay events, interactions, relationships or spoilers that are not in the supplied theme.",
    "Horizontal landscape 3:2 composition. Keep the LEFT 45 percent of the frame relatively dark and uncluttered for the app's overlaid title. Put the primary visual impact mostly to the right, with essential shapes safely inside the frame.",
    "This image is art only: NO text, headlines, invented logos, labels, typography, statistics, UI panels, watermarks or borders. The application renders the real title and copy itself.",
  ].filter(Boolean).join("\n\n");
}

export function createWrappedCoverService({ db, generateImage, canSpendTokens }: {
  db: Db;
  generateImage: (userId: string, prompt: string) => Promise<string>;
  canSpendTokens: (userId: string) => boolean;
}) {
  const current = db.prepare(
    "SELECT story, coverArtStatus, coverArtRequestId, coverArtTimeZone FROM wrapped_stories WHERE userId=? AND timeframe=? AND timeId=?",
  );

  function subjectsFor(userId: string, timeframe: WrappedTimeframe, timeId: string, story: WrappedCoverStory, timeZone: string): WrappedCoverSubject[] {
    const { start, end } = wrappedCoverBounds(timeframe, timeId, timeZone);
    const rows = db.prepare(
      "SELECT l.mediaId AS id, m.title, m.mediaType AS type, m.genres " +
      "FROM logs l JOIN media m ON m.id=l.mediaId AND m.userId=l.userId " +
      "WHERE l.userId=? AND l.timestamp>=? AND l.timestamp<? AND l.metricType!='statusChange' AND l.delta>0",
    ).all(userId, start, end) as Array<{ id: string; title: string; type: string; genres: string | null }>;
    const counts = new Map<string, { id: string; title: string; type: string; genres?: string[]; count: number; scenes: number }>();
    for (const row of rows) {
      const previous = counts.get(row.id);
      if (previous) { previous.count++; continue; }
      let genres: string[] = [];
      try {
        const parsed = JSON.parse(row.genres || "[]");
        if (Array.isArray(parsed)) genres = parsed.filter((g: unknown): g is string => typeof g === "string").slice(0, 3);
      } catch {}
      counts.set(row.id, { id: row.id, title: row.title, type: row.type, genres, count: 1, scenes: 0 });
    }
    for (const scene of story.scenes) {
      if (scene.kind === "opening" || scene.kind === "closing" || !scene.evidenceIds?.length) continue;
      const seen = new Set([scene.media?.id, ...(scene.artworks || []).map(a => a.id)].filter((id): id is string => !!id));
      for (const id of seen) {
        const found = counts.get(id);
        if (found) found.scenes++;
      }
    }
    return [...counts.values()]
      .sort((a, b) => (b.scenes * 3 + Math.min(b.count, 8)) - (a.scenes * 3 + Math.min(a.count, 8)))
      .slice(0, 3).map(({ id, title, type, genres }) => ({ id, title, type, genres }));
  }

  async function render(userId: string, timeframe: WrappedTimeframe, timeId: string, token: string): Promise<void> {
    try {
      const claimed = db.prepare(
        "UPDATE wrapped_stories SET coverArtStatus='generating' " +
        "WHERE userId=? AND timeframe=? AND timeId=? AND coverArtRequestId=? AND coverArtStatus='pending'",
      ).run(userId, timeframe, timeId, token);
      if (!claimed.changes) return;
      const row = current.get(userId, timeframe, timeId) as { story: string; coverArtTimeZone?: string | null } | undefined;
      if (!row) return;
      const story = JSON.parse(row.story) as WrappedCoverStory;
      const subjects = subjectsFor(userId, timeframe, timeId, story, row.coverArtTimeZone || "UTC");
      // If no activity is actually attached to this period, don't create an
      // allegedly personal illustration from a hallucinated story title.
      if (!subjects.length) throw new Error("No verified progress logs for this Wrapped period.");
      const prompt = buildWrappedCoverPrompt(story, timeframe, timeId, subjects);
      const url = await generateImage(userId, prompt);
      db.prepare(
        "UPDATE wrapped_stories SET coverArtUrl=?, coverArtStatus='done', coverArtRequestId=NULL " +
        "WHERE userId=? AND timeframe=? AND timeId=? AND coverArtRequestId=?",
      ).run(url, userId, timeframe, timeId, token);
    } catch (error) {
      console.error("[wrapped-cover] Failed to illustrate Wrapped " + timeframe + " " + timeId, error);
      db.prepare(
        "UPDATE wrapped_stories SET coverArtStatus='failed', coverArtRequestId=NULL " +
        "WHERE userId=? AND timeframe=? AND timeId=? AND coverArtRequestId=?",
      ).run(userId, timeframe, timeId, token);
    }
  }

  function queue(userId: string, timeframe: WrappedTimeframe, timeId: string, regenerate = false): boolean {
    try {
    const row = current.get(userId, timeframe, timeId) as { coverArtStatus?: string | null } | undefined;
    if (!row || !canSpendTokens(userId)) return false;
    if (regenerate) {
      if (row.coverArtStatus === "pending" || row.coverArtStatus === "generating") return false;
    } else if (row.coverArtStatus != null) {
      return false;
    }
    const token = randomUUID();
    const claim = db.prepare(
      "UPDATE wrapped_stories SET coverArtStatus='pending', coverArtRequestId=? " +
      "WHERE userId=? AND timeframe=? AND timeId=? AND " +
      (regenerate
        ? "(coverArtStatus IS NULL OR coverArtStatus IN ('done','failed'))"
        : "coverArtStatus IS NULL"),
    ).run(token, userId, timeframe, timeId);
    if (!claim.changes) return false;
    void render(userId, timeframe, timeId, token);
    return true;
    } catch (error) {
      // Image generation is strictly auxiliary. Never turn a successfully
      // saved Wrapped into a failed HTTP request due to an artwork problem.
      console.error("[wrapped-cover] Could not enqueue title illustration:", error);
      return false;
    }
  }

  return { queue };
}
