import type { StoryScene } from "./storyDiscovery";
import { imageFramingGuidance } from "./dynamicScenes";
import { visualSelfImageClause, type VisualSelfProfile } from "./visualSelf";

/**
 * Pick up to three story-driven beats for original illustrations. Never turn this
 * into "one image per media title": image generation serves the narrative.
 * Same deterministic selection is used by the Visual Director and server.
 */
export function selectIllustratedScenes<T extends Pick<StoryScene, "id" | "kind" | "title" | "body">>(
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
    return { id: scene.id, index, score };
  });
  const chosen = available.sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.min(3, maximum)).sort((a, b) => a.index - b.index);
  return chosen.map(({ id }) => id);
}

/** Safe, independent illustration prompt, not a collage of media covers. */
export function buildWrappedSceneArtPrompt(
  issue: { title: string; dek: string },
  scene: Pick<StoryScene, "kind" | "title" | "body" | "media" | "composition">,
  visualSelf?: VisualSelfProfile | null,
): string {
  const idea = (scene.composition?.artConcept || "").trim();
  const influence = scene.media?.title
    ? "One possible tonal influence is " + scene.media.title.slice(0, 120) +
      ". It is optional, not an object or trademark that must appear."
    : "Do not introduce any unrelated franchise characters or logos.";
  return [
    "Draw ONE original, cinematic EDITORIAL ILLUSTRATION for an interior chapter of a personal media story. This is not a title-page cover, screenshot, list of franchises, or collection of book jackets.",
    "The Wrapped issue is about: " + issue.title.slice(0, 180) + ". " + issue.dek.slice(0, 260),
    "Chapter: " + scene.title.slice(0, 160) + ". Its actual editorial premise: " + scene.body.slice(0, 700),
    idea ? "MAIN VISUAL CONCEPT (interpret boldly, but stay true to the chapter): " + idea : "",
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
