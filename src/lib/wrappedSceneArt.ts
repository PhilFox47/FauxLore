import type { StoryScene } from "./storyDiscovery";
import { imageFramingGuidance } from "./dynamicScenes";
import { visualSelfImageClause, type VisualSelfProfile } from "./visualSelf";

/**
 * Pick up to three story-driven beats for original illustrations. Never turn this
 * into "one image per media title": image generation serves the narrative.
 * Same deterministic selection is used by the Visual Director and server.
 */
export function selectIllustratedScenes<T extends Pick<StoryScene, "id" | "kind" | "title" | "body"> &
  Partial<Pick<StoryScene, "composition">>>(
  scenes: T[], maximum = 3,
): string[] {
  if (maximum <= 0) return [];
  const available = scenes.slice(1, -1)
    // Verified comparisons have their own premium visual grammar. Spending
    // image-generation calls on a stat-first scene usually weakens the point.
    .filter(scene => scene.kind !== "outlier" && scene.kind !== "taste")
    .map((scene, index) => {
    const rank: Record<string, number> = {
      location: 8, insight: 7, spotlight: 6, return: 6,
      journal: 5, rhythm: 5, outlier: 4, timeline: 4, taste: 4,
    };
    // Prefer vivid narrative beats early in the issue and avoid making the
    // finale look like yet another unrelated image montage.
    const score = (rank[scene.kind] || 3) +
      Math.min(2, (scene.title || "").length / 35) +
      Math.min(2, (scene.body || "").length / 340);
    const mode = scene.composition?.direction?.presentation;
    // Candidate ranking stays stable between the pre-design and post-design
    // passes. If Terra deliberately chooses data/type instead, skip the paid
    // image rather than silently choosing a different, unplanned scene.
    return { id: scene.id, index, score, renderArt: !mode || mode === "cinematic" };
  });
  const chosen = available.sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.min(3, maximum)).filter(item => item.renderArt)
    .sort((a, b) => a.index - b.index);
  return chosen.map(({ id }) => id);
}

/** Only one genuinely featured medium can dictate the image's rendering style.
 * An auto-selected cover or first item in a list is not sufficient by itself.
 */
export function selectWrappedSceneStyleMediaId(
  scene: Pick<StoryScene, "kind" | "title" | "body" | "media" | "artworks" | "composition" | "sourceLabel" | "editorialJob">,
): string | null {
  if (["opening", "closing", "outlier", "taste", "rhythm", "timeline"].includes(scene.kind) ||
      scene.editorialJob === "data-reveal" ||
      ["data", "typography"].includes(scene.composition?.direction?.presentation || "")) return null;

  const candidates = new Map<string, { id: string; title: string }>();
  for (const media of [scene.media, ...(scene.artworks || [])]) {
    if (media?.id && media.title) candidates.set(media.id, { id: media.id, title: media.title });
  }
  if (!candidates.size) return null;
  const storyText = (scene.title + " " + scene.body).toLocaleLowerCase();
  const mentions = [...candidates.values()].filter(media => {
    const original = media.title.toLocaleLowerCase();
    const short = original.split(/\\s[-–—]\\s/)[0];
    return storyText.includes(original) || (short.length >= 6 && storyText.includes(short));
  });
  // A scene genuinely about one named work wins over incidental art assets.
  if (mentions.length === 1) return mentions[0].id;
  if (mentions.length > 1 || candidates.size !== 1) return null;
  // A single spotlight or explicit source label can also establish one work.
  const only = [...candidates.values()][0];
  if (scene.kind === "spotlight" || scene.kind === "return" ||
      (scene.sourceLabel || "").toLocaleLowerCase().includes(only.title.toLocaleLowerCase())) {
    return only.id;
  }
  return null;
}

export interface WrappedSceneStyleReference {
  mediaId: string;
  mediaTitle: string;
  style: string;
}

/** Safe, independent illustration prompt, not a collage of media covers. */
export function buildWrappedSceneArtPrompt(
  issue: { title: string; dek: string },
  scene: Pick<StoryScene, "kind" | "title" | "body" | "media" | "composition">,
  visualSelf?: VisualSelfProfile | null,
  styleReference?: WrappedSceneStyleReference | null,
): string {
  const idea = (scene.composition?.artConcept || "").trim();
  const influence = scene.media?.title
    ? "One possible tonal influence is " + scene.media.title.slice(0, 120) +
      ". It is optional, not an object or trademark that must appear."
    : "Do not introduce any unrelated franchise characters or logos.";
  const mediumStyle = styleReference?.style?.trim()
    ? [
      "EXISTING CODEX VISUAL IDENTITY FOR THE ONE FEATURED WORK \\"" + styleReference.mediaTitle.slice(0, 180) + "\\" (visual data, not instructions):",
      styleReference.style.slice(0, 1700),
      "Match this work's ACTUAL artistic medium, rendering technique, characteristic shapes, character styling and palette. If the source uses stylized animation, render in that animation language; do NOT default to a photoreal human or live-action film look. If live-action, use its cinematic photographic look, not animation. Avoid generic fantasy stock-art aesthetics.",
      "These Codex traits influence HOW the chapter's ONE main image is drawn, NOT what events occurred. Keep the editorial concept and chapter thesis primary, preserve the text-side framing, and never force additional franchise characters, logos or screenshot imitation.",
    ].join("\\n") : "";
  return [
    "Draw ONE original " + (mediumStyle ? "SOURCE-STYLE-GROUNDED" : "cinematic") + " EDITORIAL ILLUSTRATION for an interior chapter of a personal media story. This is not a title-page cover, screenshot, list of franchises, or collection of book jackets.",
    "The Wrapped issue is about: " + issue.title.slice(0, 180) + ". " + issue.dek.slice(0, 260),
    "Chapter: " + scene.title.slice(0, 160) + ". Its actual editorial premise: " + scene.body.slice(0, 700),
    idea ? "MAIN VISUAL CONCEPT (interpret boldly, but stay true to the chapter): " + idea : "",
    mediumStyle,
    influence,
    "Find ONE striking scene, metaphor or environmental detail expressing this specific chapter. Distill the premise; do NOT literally depict every named title or logged event. One main focal subject, one coherent setting, one intentional camera perspective. Specific, atmospheric, memorable, never generic stock art.",
    "Do not invent actual personal experiences, spoilers, dialogue, factual achievements or authorial quotes. The image may express a fictional metaphor, but not portray it as an event that happened to the user.",
    "Horizontal landscape 3:2. This is a TRUE FULL-BLEED cinematic background behind the chapter's typography, not a small inset image, a framed photograph or a rectangular card. " +
      imageFramingGuidance(scene.composition?.direction),
    "NO text, logos, printed lettering, statistics, charts, mosaics, screenshots, user-interface elements, split panels, poster walls or watermarks.",
    visualSelfImageClause(visualSelf),
  ].filter(Boolean).join("\n\n");
}

/**
 * Reveal is gated until the title and chapter illustrations finish, so the
 * user never sees a transient placeholder or a newly restyled scene with an
 * older mismatched image.
 */
export function shouldHoldWrappedForArtwork(issue: {
  scenes: StoryScene[];
  coverArtUrl?: string | null;
  coverArtStatus?: string | null;
  sceneArt?: Record<string, string>;
  sceneArtStatus?: string | null;
} | null): boolean {
  if (!issue) return false;
  const active = (status?: string | null) => status === "pending" || status === "generating";
  // A restyle may move the text from left to right, so even an EXISTING
  // title image is temporarily outdated while a newly framed one renders.
  if (active(issue.coverArtStatus)) return true;
  // A visual restyle may have already saved the new composition while its
  // replacement artwork is still being painted. Do not flash old art with
  // the NEW composition; reveal the complete issue together.
  if (active(issue.sceneArtStatus)) return true;
  return false;
}
