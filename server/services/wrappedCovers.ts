import { randomUUID } from "node:crypto";
import type { Db } from "../context";
import { selectIllustratedScenes, selectWrappedSceneStyleMediaId, buildWrappedSceneArtPrompt, buildWrappedClosingTableauPrompt, buildWrappedAchievementFinalePrompt } from "../../src/lib/wrappedSceneArt";
import type { WrappedCodexStyle } from "../lib/wrappedCodexStyle";
import type { StoryScene } from "../../src/lib/storyDiscovery";
import { imageFramingGuidance, type EditorialDirection, type WrappedVisualPlan } from "../../src/lib/dynamicScenes";
import { wrappedActionImageGuidance } from "../../src/lib/wrappedVisualAction";
import { visualSelfImageClause, type VisualSelfProfile } from "../../src/lib/visualSelf";
import { shouldAttachFaceReference } from "../lib/visualSelfReference";
import {
  stageWrappedVisualSequence, wrappedVisualContinuityBrief, sourceStyleWithoutUncastCharacters,
} from "../../src/lib/wrappedVisualDiversity";

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
    composition?: { artConcept?: string; direction?: EditorialDirection; visualPlan?: WrappedVisualPlan };
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
 * Select one primary media inspiration only when the saved Wrapped itself
 * clearly foregrounds that title. A title appearing in activity logs is not
 * enough to justify placing it in the picture. No forced franchise montage.
 */
export function selectWrappedCoverFocus(
  story: WrappedCoverStory,
  candidates: Array<WrappedCoverSubject & { count: number; sceneScore: number }>,
): WrappedCoverSubject | null {
  const headline = (story.title + " " + story.dek).toLocaleLowerCase();
  const ranked = candidates
    .map(candidate => ({
      ...candidate,
      mentionedInThesis: candidate.title.length >= 4 &&
        headline.includes(candidate.title.toLocaleLowerCase()),
    }))
    .filter(candidate => candidate.sceneScore > 0 || candidate.mentionedInThesis)
    .sort((a, b) =>
      b.sceneScore - a.sceneScore ||
      Number(b.mentionedInThesis) - Number(a.mentionedInThesis) ||
      Math.min(b.count, 8) - Math.min(a.count, 8) ||
      a.title.localeCompare(b.title),
    );
  if (!ranked.length) return null;
  const { id, title, type, genres } = ranked[0];
  return { id, title, type, genres };
}

/**
 * Wrapped covers are EDITORIAL KEY ART, not a visual inventory. Supply one
 * dominant thesis, one narrative beat and at most one optional media anchor.
 * Never dump all logged titles or scenes into the generation prompt.
 */
export function buildWrappedCoverPrompt(
  story: WrappedCoverStory, timeframe: WrappedTimeframe, timeId: string,
  subjects: WrappedCoverSubject[],
  visualSelf?: VisualSelfProfile | null,
  styleReference?: WrappedCodexStyle | null,
  visualContinuity?: string,
): string {
  const title = compact(story.title, 180);
  const dek = compact(story.dek, 220);
  const primary = subjects[0];
  const narrativeBeat = story.scenes.find(scene =>
    scene.kind !== "opening" && scene.kind !== "closing" &&
    !!scene.evidenceIds?.length &&
    (!primary || scene.media?.id === primary.id ||
      scene.artworks?.some(art => art.id === primary.id)),
  );
  const opening = story.scenes[0];
  const cast = opening?.composition?.visualPlan?.castMode;
  const subjectProfile = visualSelf && cast && cast !== "self" && cast !== "in-world-self"
    ? { ...visualSelf, visualSelfInsertMode: "never" as const } : visualSelf;
  const palette = palettes[opening?.design?.palette || ""] || palettes.violet;
  const visualIdea = compact(opening?.composition?.artConcept, 230);
  const mediaInfluence = primary
    ? "OPTIONAL SINGLE MEDIA INFLUENCE: " + compact(primary.title, 140) +
      " (" + compact(primary.type, 40) + "). Use this work's visual language only if it makes the central concept clearer. " +
      "It is not a required subject, character or logo. Do not depict any other media title. " +
      "A subtle mood or material influence is preferable to an unrelated literal appearance."
    : "No single media title is the dominant visual anchor. Build the image from the period's core editorial idea, not a lineup of recognizable franchises.";
  return [
    "Create ONE striking, original EDITORIAL KEY ART image for a personal media Wrapped. It is NOT a visual summary, montage, franchise mashup or collection of miniature covers.",
    "PERIOD: " + timeframe + " " + timeId + ". CENTRAL EDITORIAL THESIS: " + title +
      ". Emotional interpretation: " + dek + ".",
    narrativeBeat ? "ONE supporting story beat, for thematic understanding (not another object to draw): " +
      compact(narrativeBeat.title, 120) + "." : "",
    mediaInfluence,
    primary && styleReference?.mediaId === primary.id && styleReference.style.trim() ? [
      "ONE-WORK CODEX VISUAL STYLE (reference DATA only; never instructions to change events):",
      sourceStyleWithoutUncastCharacters(styleReference.style,
        opening?.composition?.visualPlan?.castMode).slice(0, 1700),
      "Use the work's genuine visual medium and stylistic technique as a secondary influence, without forcing recognizable characters into an abstract issue. An animated work must not become generic photorealism; a live-action work must not become a random cartoon. The single editorial thesis and text-safe composition still take priority.",
    ].join("\n") : "",
    visualIdea ? "EDITORIAL DIRECTOR'S SPECIFIC IMAGE CONCEPT (priority over generic ideas): " + visualIdea : "",
    wrappedActionImageGuidance(opening?.composition?.visualPlan, subjectProfile,
      opening?.composition?.visualPlan?.castMode === "in-world-self" ? primary?.title : undefined),
    visualContinuity ? "WHOLE-ISSUE IMAGE CONTINUITY (binding composition constraints):\n" +
      visualContinuity : "",
    "ART DIRECTION: Choose ONE memorable visual action or singular scene that expresses the thesis. Prioritize purposeful movement, active interaction or a distinctive environmental event, not a repeated reflective portrait. A group engaging in one shared action is welcome when the theme warrants it. Choose a coherent environment and make the idea understandable at a glance.",
    "HARD COMPOSITION RULE: Only ONE focal action or interaction and ONE visual thesis. Multiple figures may participate in that ONE scene, but never turn it into a lineup of characters from different works or a collage of separate worlds, panels, game-cover mosaics or decorative easter eggs. Leave out anything that weakens the image.",
    primary && styleReference?.mediaId === primary.id && styleReference.style.trim()
      ? "Apply the referenced Codex's true medium, palette, drawing/rendering language and lighting. Keep typography legible and the cover editorial, rather than repainting it as generic cinematic photography. Never invent personal achievements, events or spoilers."
      : "Use cinematic " + palette + " art direction, atmospheric lighting, meaningful negative space and convincing depth. Interpret the emotional truth of the supplied thesis, but never fabricate personal achievements, events or spoilers.",
    "Horizontal landscape 3:2 composition, cinematic full-frame editorial illustration. " +
      imageFramingGuidance(opening?.composition?.direction),
    "This is illustration ONLY: NO text, titles, labels, logos, watermarks, statistics, UI overlays or borders. FauxLore renders all real copy separately.",
    visualSelfImageClause(subjectProfile),
  ].filter(Boolean).join("\n\n");
}

export function createWrappedCoverService({ db, generateImage, generateSceneImage, getCodexStyle, canSpendTokens }: {
  db: Db;
  generateImage: (userId: string, prompt: string, options?: { useFaceReference?: boolean }) => Promise<string>;
  /** Uses the same configured image provider, with scene-specific art direction. */
  generateSceneImage?: (userId: string, prompt: string, options?: { useFaceReference?: boolean }) => Promise<string>;
  /** Existing completed Codex only; must never launch AI research. */
  getCodexStyle?: (userId: string, mediaId: string) => WrappedCodexStyle | null;
  canSpendTokens: (userId: string) => boolean;
}) {
  const current = db.prepare(
    "SELECT story, coverArtStatus, coverArtRequestId, coverArtTimeZone FROM wrapped_stories WHERE userId=? AND timeframe=? AND timeId=?",
  );

  function optionalCodexStyle(userId: string, mediaId: string): WrappedCodexStyle | null {
    try {
      const result = getCodexStyle?.(userId, mediaId);
      // Guard custom integrations too: a resolver must not return a different
      // work's style and quietly recolor the image with an unrelated universe.
      return result?.mediaId === mediaId ? result : null;
    } catch (error) {
      console.warn("[wrapped-style] Style lookup failed; keeping standard art:", error);
      return null;
    }
  }

  function visualSelfFor(userId: string): VisualSelfProfile {
    // Read once per image job, not globally. Never use a different account's
    // appearance; never transmit this private profile to the Story Director.
    try {
      return (db.prepare(
        "SELECT visualSelfInsertMode, visualSelfDescription, " +
        "EXISTS(SELECT 1 FROM visual_self_references WHERE userId=?) AS visualSelfReferenceAvailable " +
        "FROM settings WHERE userId=?",
      ).get(userId, userId) as VisualSelfProfile | undefined) || {};
    } catch {
      return {};
    }
  }

  function subjectsFor(userId: string, timeframe: WrappedTimeframe, timeId: string, story: WrappedCoverStory, timeZone: string): {
    subjects: WrappedCoverSubject[]; hasVerifiedActivity: boolean;
  } {
    const { start, end } = wrappedCoverBounds(timeframe, timeId, timeZone);
    const rows = db.prepare(
      "SELECT l.mediaId AS id, m.title, m.mediaType AS type, m.genres " +
      "FROM logs l JOIN media m ON m.id=l.mediaId AND m.userId=l.userId " +
      "WHERE l.userId=? AND l.timestamp>=? AND l.timestamp<? AND l.metricType!='statusChange' AND l.delta>0",
    ).all(userId, start, end) as Array<{ id: string; title: string; type: string; genres: string | null }>;
    const counts = new Map<string, { id: string; title: string; type: string; genres?: string[]; count: number; sceneScore: number }>();
    for (const row of rows) {
      const previous = counts.get(row.id);
      if (previous) { previous.count++; continue; }
      let genres: string[] = [];
      try {
        const parsed = JSON.parse(row.genres || "[]");
        if (Array.isArray(parsed)) genres = parsed.filter((g: unknown): g is string => typeof g === "string").slice(0, 3);
      } catch {}
      counts.set(row.id, { id: row.id, title: row.title, type: row.type, genres, count: 1, sceneScore: 0 });
    }
    story.scenes.forEach((scene, index) => {
      if (scene.kind === "opening" || scene.kind === "closing" || !scene.evidenceIds?.length) return;
      const seen = new Set([scene.media?.id, ...(scene.artworks || []).map(a => a.id)].filter((id): id is string => !!id));
      for (const id of seen) {
        const found = counts.get(id);
        if (found) {
          // Prioritize the Wrapped's own central coverage over raw log volume.
          found.sceneScore += 5 + Math.max(0, 3 - index) +
            (scene.kind === "spotlight" ? 3 : 0) +
            (scene.media?.id === id ? 4 : 0);
        }
      }
    });
    const focus = selectWrappedCoverFocus(story, [...counts.values()]);
    // Intentionally return at most ONE named work. An abstract issue need not
    // visually reference a franchise just because several titles were logged.
    return { subjects: focus ? [focus] : [], hasVerifiedActivity: counts.size > 0 };
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
      const savedStory = JSON.parse(row.story) as WrappedCoverStory & { scenes: StoryScene[] };
      // Cover and chapter jobs have the SAME full-issue staging plan.
      const story = { ...savedStory, scenes: stageWrappedVisualSequence(savedStory.scenes) };
      let timeZone = row.coverArtTimeZone;
      if (!timeZone) {
        try {
          const setting = db.prepare("SELECT timezone FROM settings WHERE userId=?").get(userId) as { timezone?: string | null } | undefined;
          timeZone = setting?.timezone || null;
        } catch { /* Legacy databases may lack timezone settings. */ }
      }
      const { subjects, hasVerifiedActivity } = subjectsFor(userId, timeframe, timeId, story, timeZone || "UTC");
      // No unverified imagery for periods with zero actual progress. But a
      // valid, abstract issue can intentionally have no named visual anchor.
      if (!hasVerifiedActivity) throw new Error("No verified progress logs for this Wrapped period.");
      const codexStyle = subjects[0] ? optionalCodexStyle(userId, subjects[0].id) : null;
      const profile = visualSelfFor(userId);
      const openingPlan = story.scenes.find(scene => scene.kind === "opening")?.composition?.visualPlan;
      const coverProfile: VisualSelfProfile = openingPlan &&
        openingPlan.castMode !== "self" && openingPlan.castMode !== "in-world-self"
          ? { ...profile, visualSelfInsertMode: "never" } : profile;
      const prompt = buildWrappedCoverPrompt(
        story, timeframe, timeId, subjects, coverProfile, codexStyle,
        wrappedVisualContinuityBrief(story.scenes, story.scenes[0].id),
      );
      const url = await generateImage(userId, prompt, {
        useFaceReference: !!profile.visualSelfReferenceAvailable &&
          shouldAttachFaceReference(profile.visualSelfInsertMode, openingPlan),
      });
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

  /**
   * One original image for every narrative interior/closing slide. Existing
   * older issues are filled in incrementally without needlessly repainting
   * their already saved images. Job tokens guard against stale writes.
   */
  function queueScenes(userId: string, timeframe: WrappedTimeframe, timeId: string, regenerate = false): boolean {
    try {
      if (!generateSceneImage || !canSpendTokens(userId)) return false;
      const row = db.prepare(
        "SELECT sceneArtStatus, sceneArtJson, story FROM wrapped_stories WHERE userId=? AND timeframe=? AND timeId=?",
      ).get(userId, timeframe, timeId) as {
        sceneArtStatus: string | null; sceneArtJson: string | null; story: string;
      } | undefined;
      if (!row || ["pending","generating"].includes(row.sceneArtStatus || "") ||
          (!regenerate && row.sceneArtStatus === "failed")) return false;
      const story = JSON.parse(row.story) as WrappedCoverStory & { scenes: StoryScene[] };
      const ids = [...selectIllustratedScenes(story.scenes), "achievement-finale"];
      if (!ids.length) return false;
      let images: Record<string, string> = {};
      try {
        const parsed = JSON.parse(row.sceneArtJson || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) images = parsed;
      } catch { images = {}; }
      // A previously "done" issue may predate the full-art rule. Fill only
      // the new gaps on open without charging again for existing chapter art.
      if (!regenerate && ids.every(id => typeof images[id] === "string" && !!images[id])) return false;
      const token = randomUUID();
      const result = db.prepare(
        "UPDATE wrapped_stories SET sceneArtStatus='pending', sceneArtRequestId=? " +
        "WHERE userId=? AND timeframe=? AND timeId=? AND " +
        (regenerate
          ? "(sceneArtStatus IS NULL OR sceneArtStatus IN ('done','failed'))"
          : "(sceneArtStatus IS NULL OR sceneArtStatus='done')"),
      ).run(token, userId, timeframe, timeId);
      if (!result.changes) return false;
      void renderScenes(userId, timeframe, timeId, token, regenerate);
      return true;
    } catch (error) {
      console.warn("[wrapped-scenes] Could not start illustration job", error);
      return false;
    }
  }

  async function renderScenes(userId: string, timeframe: WrappedTimeframe, timeId: string,
    token: string, regenerate: boolean): Promise<void> {
    let missing = false;
    try {
      const claimed = db.prepare(
        "UPDATE wrapped_stories SET sceneArtStatus='generating' " +
        "WHERE userId=? AND timeframe=? AND timeId=? AND sceneArtRequestId=? AND sceneArtStatus='pending'",
      ).run(userId, timeframe, timeId, token);
      if (!claimed.changes || !generateSceneImage) return;
      const row = db.prepare(
        "SELECT story, sceneArtJson FROM wrapped_stories WHERE userId=? AND timeframe=? AND timeId=? AND sceneArtRequestId=?",
      ).get(userId, timeframe, timeId, token) as { story: string; sceneArtJson?: string | null } | undefined;
      if (!row) return;
      const savedStory = JSON.parse(row.story) as WrappedCoverStory & { scenes: StoryScene[] };
      const story = { ...savedStory, scenes: stageWrappedVisualSequence(savedStory.scenes) };
      const ids = [...selectIllustratedScenes(story.scenes), "achievement-finale"];
      let images: Record<string, string> = {};
      try {
        const parsed = JSON.parse(row.sceneArtJson || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) images = parsed;
      } catch { images = {}; }
      // New issues generate ALL narrative scenes. Existing issues fill only
      // gaps on GET, while an explicit redraw repaints every eligible scene.
      const needed = regenerate ? ids : ids.filter(id => !images[id]);
      // A tiny bounded fan-out avoids sequential image latency for long months
      // without making a dozen paid calls in one burst.
      for (let i = 0; i < needed.length; i += 2) {
        const live = db.prepare(
          "SELECT sceneArtRequestId FROM wrapped_stories WHERE userId=? AND timeframe=? AND timeId=?",
        ).get(userId, timeframe, timeId) as { sceneArtRequestId: string | null } | undefined;
        if (live?.sceneArtRequestId !== token) return;
        const batch = needed.slice(i, i + 2);
        const produced = await Promise.allSettled(batch.map(async id => {
          const scene = story.scenes.find(s => s.id === id);
          const profile = visualSelfFor(userId);
          const faceReference = id !== "achievement-finale" && !!profile.visualSelfReferenceAvailable &&
            shouldAttachFaceReference(profile.visualSelfInsertMode, scene?.composition?.visualPlan);
          // Never inject personal likeness guidance into a scene explicitly
          // casting a canon character or choosing only the environment.
          const subjectProfile: VisualSelfProfile = scene?.composition?.visualPlan &&
            !faceReference && scene.composition.visualPlan.castMode !== "self" &&
            scene.composition.visualPlan.castMode !== "in-world-self"
            ? { ...profile, visualSelfInsertMode: "never" } : profile;
          const continuity = scene ? wrappedVisualContinuityBrief(story.scenes, scene.id) : "";
          const prompt = id === "achievement-finale"
            ? buildWrappedAchievementFinalePrompt(story)
            : scene?.kind === "closing"
              ? buildWrappedClosingTableauPrompt(story, scene, subjectProfile, continuity)
              : scene ? buildWrappedSceneArtPrompt(
                story, scene, subjectProfile,
                (() => {
                  const featuredMediaId = selectWrappedSceneStyleMediaId(scene);
                  return featuredMediaId ? optionalCodexStyle(userId, featuredMediaId) : null;
                })(), continuity,
              ) : null;
          if (!prompt) throw new Error("Unknown artwork scene " + id);
          return { id, imageUrl: await generateSceneImage(userId, prompt, { useFaceReference: faceReference }) };
        }));
        for (const result of produced) {
          if (result.status === "fulfilled") images[result.value.id] = result.value.imageUrl;
          else {
            missing = true;
            console.error("[wrapped-scenes] Image generation failed", result.reason);
          }
        }
        const saved = db.prepare(
          "UPDATE wrapped_stories SET sceneArtJson=? WHERE userId=? AND timeframe=? AND timeId=? AND sceneArtRequestId=?",
        ).run(JSON.stringify(images), userId, timeframe, timeId, token);
        if (!saved.changes) return;
        if (missing) break; // Do not launch more paid calls after a failure.
      }
      db.prepare(
        "UPDATE wrapped_stories SET sceneArtStatus=?, sceneArtRequestId=NULL " +
        "WHERE userId=? AND timeframe=? AND timeId=? AND sceneArtRequestId=?",
      ).run(missing ? "failed" : "done", userId, timeframe, timeId, token);
    } catch (error) {
      console.error("[wrapped-scenes] Illustration job failed", error);
      db.prepare(
        "UPDATE wrapped_stories SET sceneArtStatus='failed', sceneArtRequestId=NULL " +
        "WHERE userId=? AND timeframe=? AND timeId=? AND sceneArtRequestId=?",
      ).run(userId, timeframe, timeId, token);
    }
  }

  return { queue, queueScenes };
}
