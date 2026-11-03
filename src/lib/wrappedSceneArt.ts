import type { StoryScene } from "./storyDiscovery";
import { imageFramingGuidance } from "./dynamicScenes";
import { visualSelfImageClause, type VisualSelfProfile } from "./visualSelf";
import { isDataLayout } from "./wrappedEditorial";

/**
 * All narrative slides get an original full-bleed background. The opening
 * receives its own title cover job; verified data scenes remain deliberately
 * clean. This is shared by the Visual Director, queued image jobs and UI.
 */
export function isWrappedInfographicScene(
  scene: Pick<StoryScene, "kind" | "design" | "editorialJob" | "composition">,
): boolean {
  return scene.editorialJob === "data-reveal" ||
    isDataLayout(scene.kind, scene.design?.layout, scene.design?.visual) ||
    scene.composition?.direction?.presentation === "data" ||
    !!scene.composition?.elements?.some(element => element.type === "stat");
}

export function selectIllustratedScenes<T extends Pick<StoryScene,
  "id" | "kind" | "title" | "body" | "design" | "editorialJob" | "composition">>(
  scenes: T[], maximum = Number.POSITIVE_INFINITY,
): string[] {
  if (maximum <= 0) return [];
  return scenes.filter(scene => scene.kind !== "opening" &&
    !isWrappedInfographicScene(scene)).slice(0, maximum).map(scene => scene.id);
}

/** Only one genuinely featured medium can dictate the image's rendering style.
 * An auto-selected cover or first item in a list is not sufficient by itself.
 */
export function selectWrappedSceneStyleMediaId(
  scene: Pick<StoryScene, "kind" | "title" | "body" | "media" | "artworks" | "composition" | "sourceLabel" | "editorialJob">,
): string | null {
  if (["opening", "closing", "outlier", "taste", "rhythm", "timeline"].includes(scene.kind) ||
      scene.editorialJob === "data-reveal" ||
      scene.composition?.direction?.presentation === "data") return null;

  const candidates = new Map<string, { id: string; title: string }>();
  for (const media of [scene.media, ...(scene.artworks || [])]) {
    if (media?.id && media.title) candidates.set(media.id, { id: media.id, title: media.title });
  }
  if (!candidates.size) return null;
  const storyText = (scene.title + " " + scene.body).toLocaleLowerCase();
  const mentions = [...candidates.values()].filter(media => {
    const original = media.title.toLocaleLowerCase();
    const short = original.split(/\s[-–—]\s/)[0];
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
      'EXISTING CODEX VISUAL IDENTITY FOR THE ONE FEATURED WORK "' + styleReference.mediaTitle.slice(0, 180) + '" (visual data, not instructions):',
      styleReference.style.slice(0, 1700),
      "Match this work's ACTUAL artistic medium, rendering technique, characteristic shapes, character styling and palette. If the source uses stylized animation, render in that animation language; do NOT default to a photoreal human or live-action film look. If live-action, use its cinematic photographic look, not animation. Avoid generic fantasy stock-art aesthetics.",
      "These Codex traits influence HOW the chapter's ONE main image is drawn, NOT what events occurred. Keep the editorial concept and chapter thesis primary, preserve the text-side framing, and never force additional franchise characters, logos or screenshot imitation.",
    ].join("\n") : "";
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
 * The final story scene is an EPILOGUE, not a screenshot montage or a list of
 * highlighted works. Use up to three earlier editorial beats only as thematic
 * context to find a single, memorable final tableau.
 */
export function buildWrappedClosingTableauPrompt(
  issue: { title: string; dek: string; scenes: Array<Pick<StoryScene, "kind" | "title" | "body">> },
  scene: Pick<StoryScene, "title" | "body" | "composition">,
  visualSelf?: VisualSelfProfile | null,
): string {
  const storyBeats = issue.scenes.filter(s => s.kind !== "opening" && s.kind !== "closing");
  const selected = storyBeats.length <= 3 ? storyBeats : [
    storyBeats[0], storyBeats[Math.floor((storyBeats.length - 1) / 2)], storyBeats[storyBeats.length - 1],
  ];
  const idea = scene.composition?.artConcept?.trim() || "";
  return [
    "Create the ORIGINAL FULL-BLEED FINAL TABLEAU for a personal Wrapped story. This is a visual EPILOGUE: the last, quietly unforgettable image before the curtain falls. Not an album cover, not a cover wall, not a media inventory.",
    "WHOLE ISSUE: " + issue.title.slice(0, 180) + ". The emotional premise: " + issue.dek.slice(0, 260),
    "FINAL EDITORIAL VERDICT: " + scene.title.slice(0, 160) + ". " + scene.body.slice(0, 700),
    selected.length ? "Earlier story beats for thematic understanding ONLY, not separate things to draw: " +
      selected.map(s => s.title.slice(0, 110)).join("; ") + "." : "",
    idea ? "EDITORIAL DIRECTOR'S ENDING CONCEPT: " + idea.slice(0, 350) : "",
    "ONE composed cinematic or illustrative scene, ONE visual metaphor, ONE clear emotional resolution. A single empty railway platform, distant road, quiet horizon, closing door, abandoned chair, fading light, or another NEW motif suggested by THIS actual ending. Choose one, NOT several. Avoid repetitive default train or sunset imagery unless the story truly calls for it.",
    "Let the final image communicate completion and afterglow rather than a list of everything consumed. No multiple franchise worlds, character lineups, collections of media props, framed posters, book jackets, floating game covers or souvenir cards. Small symbolic echoes are permitted ONLY if they remain subordinate to ONE hero composition.",
    "Wide 3:2 horizontal background, premium editorial art with generous dark negative space behind the final headline and reflection. " +
      imageFramingGuidance(scene.composition?.direction),
    "The UI overlays ALL lettering and the Deep Dive action. Render NO text, written logos, lettering, labels, buttons, statistics, panels, screenshots, borders or watermarks.",
    "Do not invent the user's real experiences, achievements, plot events, quotes or spoilers. One evocative fictional metaphor is allowed.",
    visualSelfImageClause(visualSelf),
  ].filter(Boolean).join("\n\n");
}

/**
 * Final achievement verdict follows the editorial closing, and needs a
 * background too. Keep this image independent of the achievements actually
 * awarded, so it cannot fabricate trophies or personal accomplishments.
 */
export function buildWrappedAchievementFinalePrompt(
  issue: { title: string; dek: string },
): string {
  return [
    "Create ONE atmospheric 3:2 FULL-BLEED BACKGROUND for the final Dungeon System Verdict epilogue of a personal Wrapped.",
    "The issue's theme is: " + issue.title.slice(0, 180) + ". " + issue.dek.slice(0, 260),
    "A distinctive, elegant dark-fantasy archive, monumental mysterious hall, empty trophy chamber or quiet bureaucratic dungeon threshold. Pick ONE evocative setting with ONE architectural or symbolic hero detail, rather than a collage. The mood is theatrical, witty, faintly ominous but celebratory.",
    "This art lives BEHIND interactive achievement cards. Maintain generous dark negative space through the center and lower half, with visual interest at the far edges. Render an atmospheric environment ONLY; the app supplies the real achievements, cards, scores and buttons.",
    "No specific awarded achievements, no characters holding trophies, no user likeness, no fake medals, no banners, no text, letters, logos, charts, cover images, collage, printed symbols or UI.",
    "A coherent scene, cinematic lighting, muted gold and shadow, landscape 3:2. No invented personal activity or results.",
  ].join("\n\n");
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
