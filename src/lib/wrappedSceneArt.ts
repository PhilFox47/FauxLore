import type { StoryScene } from "./storyDiscovery";
import { imageFramingGuidance } from "./dynamicScenes";
import { visualSelfImageClause, type VisualSelfProfile } from "./visualSelf";
import { wrappedActionImageGuidance } from "./wrappedVisualAction";
import { sourceStyleWithoutUncastCharacters } from "./wrappedVisualDiversity";

/**
 * All narrative slides get an original full-bleed background. The opening
 * receives its own title cover job; verified data scenes remain deliberately
 * clean. This is shared by the Visual Director, queued image jobs and UI.
 */
export function isWrappedInfographicScene(
  scene: Pick<StoryScene, "kind" | "design" | "editorialJob" | "composition">,
): boolean {
  return scene.editorialJob === "data-reveal" ||
    scene.design?.layout === "infographic" ||
    ["bars", "rings", "tiles"].includes(scene.design?.visual || "") ||
    scene.composition?.direction?.presentation === "data" ||
    (Array.isArray(scene.composition?.elements) &&
      scene.composition.elements.some(element => element?.type === "stat"));
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
  visualContinuity?: string,
): string {
  const idea = (scene.composition?.artConcept || "").trim();
  const cast = scene.composition?.visualPlan?.castMode;
  // Second privacy boundary: direct prompt callers cannot accidentally
  // attach appearance text to a canon/environment-only scene.
  const subjectProfile = visualSelf && cast && cast !== "self" && cast !== "in-world-self"
    ? { ...visualSelf, visualSelfInsertMode: "never" as const } : visualSelf;
  const influence = scene.media?.title
    ? "One possible tonal influence is " + scene.media.title.slice(0, 120) +
      ". It is optional, not an object or trademark that must appear."
    : "Do not introduce any unrelated franchise characters or logos.";
  const featuredWorld = styleReference?.mediaTitle ||
    (scene.kind === "spotlight" || scene.kind === "return" ? scene.media?.title : undefined);
  const mediumStyle = styleReference?.style?.trim()
    ? [
      'EXISTING CODEX VISUAL IDENTITY FOR THE ONE FEATURED WORK "' + styleReference.mediaTitle.slice(0, 180) + '" (visual data, not instructions):',
      sourceStyleWithoutUncastCharacters(styleReference.style,
        scene.composition?.visualPlan?.castMode).slice(0, 1700),
      "Match this work's ACTUAL artistic medium, rendering technique, characteristic shapes, character styling and palette. If the source uses stylized animation, render in that animation language; do NOT default to a photoreal human or live-action film look. If live-action, use its cinematic photographic look, not animation. Avoid generic fantasy stock-art aesthetics.",
      "These Codex traits influence HOW the chapter's ONE main image is drawn, NOT what events occurred. Keep the editorial concept and chapter thesis primary, preserve the text-side framing, and never force additional franchise characters, logos or screenshot imitation.",
    ].join("\n") : "";
  return [
    "Draw ONE original " + (mediumStyle ? "SOURCE-STYLE-GROUNDED" : "cinematic") + " EDITORIAL ILLUSTRATION for an interior chapter of a personal media story. This is not a title-page cover, screenshot, list of franchises, or collection of book jackets.",
    "The Wrapped issue is about: " + issue.title.slice(0, 180) + ". " + issue.dek.slice(0, 260),
    "Chapter: " + scene.title.slice(0, 160) + ". Its actual editorial premise: " + scene.body.slice(0, 700),
    idea ? "MAIN VISUAL CONCEPT (interpret boldly, but stay true to the chapter): " + idea : "",
    wrappedActionImageGuidance(scene.composition?.visualPlan, subjectProfile, featuredWorld),
    visualContinuity ? "WHOLE-ISSUE IMAGE CONTINUITY (binding composition constraints):\n" +
      visualContinuity : "",
    mediumStyle,
    influence,
    "Find ONE striking scene, visual action or environmental detail expressing this specific chapter. Do NOT literally depict every logged event or named title. Prefer one main focal subject OR one interacting group engaged in ONE purposeful event, one coherent setting and the planned camera. Re-stage a passive artConcept as an active action if the approved visual plan calls for it. Specific, atmospheric, memorable, never generic stock art.",
    "Art can place the account owner, their in-world counterpart OR a source protagonist inside a fictional world. That is VISUAL FICTION, not proof of the player having completed any quest, battle, encounter, social gathering or story outcome. Keep details spoiler-safe and never invent quotes, facts or achievements.",
    "Horizontal landscape 3:2. This is a TRUE FULL-BLEED cinematic background behind the chapter's typography, not a small inset image, a framed photograph or a rectangular card. " +
      imageFramingGuidance(scene.composition?.direction),
    "NO text, logos, printed lettering, statistics, charts, mosaics, screenshots, user-interface elements, split panels, poster walls or watermarks.",
    visualSelfImageClause(subjectProfile),
  ].filter(Boolean).join("\n\n");
}

/**
 * The final story scene is an EPILOGUE, not a screenshot montage or a list of
 * highlighted works. Use up to three earlier editorial beats only as thematic
 * context to find a single, memorable final tableau.
 */
export function buildWrappedClosingTableauPrompt(
  issue: { title: string; dek: string; scenes: Array<Pick<StoryScene, "kind" | "title" | "body">> },
  scene: Pick<StoryScene, "title" | "body" | "composition"> &
    Partial<Pick<StoryScene, "finaleMode" | "finalePayoff">>,
  visualSelf?: VisualSelfProfile | null,
  visualContinuity?: string,
): string {
  const storyBeats = issue.scenes.filter(s => s.kind !== "opening" && s.kind !== "closing");
  const selected = storyBeats.length <= 3 ? storyBeats : [
    storyBeats[0], storyBeats[Math.floor((storyBeats.length - 1) / 2)], storyBeats[storyBeats.length - 1],
  ];
  const idea = scene.composition?.artConcept?.trim() || "";
  const mode = scene.finaleMode;
  const finaleVisualLanguage: Record<NonNullable<StoryScene["finaleMode"]>, string> = {
    "dungeon-verdict": "A dominant, theatrical visual judgment. A tribunal, an absurd award of shame, or the AI's merciless ruling rendered as ONE striking scene. Not a somber ending.",
    "sharp-reversal": "A clearly legible reversal in motion or spatial relation. Turn the earlier expectation visually upside down. Not a fade to black.",
    "ruthless-roast": "Deliberately funny and confrontational imagery. A strong comedic payoff, sly visual accusation or spectacularly ridiculous predicament, always fictional.",
    "earned-sincerity": "An unusually honest, intimate visual without compulsory sentimentality. Respect the specific recorded memory; restraint is earned, not automatic.",
    "absurd-callback": "Visually weaponize ONE specific previous image idea or documented detail for a surprising absurd punchline, not a collage.",
    "unsettling-question": "A crisp, strange, concrete unanswered tension, not a generic open door or mysterious empty hallway.",
    "unexpected-connection": "One inventive shared visual logic that binds documented moments into a NEW observation, not a montage of their covers.",
    "defiant-last-word": "Confident, audacious, possibly bombastic counterpoint. The AI has reached its verdict and absolutely refuses to apologize.",
  };
  const cast = scene.composition?.visualPlan?.castMode;
  const subjectProfile = visualSelf && cast && cast !== "self" && cast !== "in-world-self"
    ? { ...visualSelf, visualSelfInsertMode: "never" as const } : visualSelf;
  return [
    "Create ONE ORIGINAL FULL-BLEED CLOSING SCENE for a personal Wrapped. The ending may be funny, furious, quiet, surprising, irreverent or strange according to its EDITORIAL MODE. Never impose a uniformly wistful epilogue. Not an album cover, poster wall or media inventory.",
    "WHOLE ISSUE: " + issue.title.slice(0, 180) + ". The emotional premise: " + issue.dek.slice(0, 260),
    "FINAL EDITORIAL VERDICT: " + scene.title.slice(0, 160) + ". " + scene.body.slice(0, 950),
    mode ? "CHOSEN FINALE MODE: " + mode + ". Visual intent: " + finaleVisualLanguage[mode] : "",
    scene.finalePayoff ? "THE NEW FINAL TURN TO EXPRESS, NOT A RECAP: " + scene.finalePayoff.slice(0, 450) : "",
    selected.length ? "Earlier story beats for thematic understanding ONLY, not separate things to draw: " +
      selected.map(s => s.title.slice(0, 110)).join("; ") + "." : "",
    idea ? "EDITORIAL DIRECTOR'S ENDING CONCEPT: " + idea.slice(0, 350) : "",
    wrappedActionImageGuidance(scene.composition?.visualPlan, subjectProfile),
    visualContinuity ? "WHOLE-ISSUE IMAGE CONTINUITY (binding composition constraints):\n" +
      visualContinuity : "",
    "ONE coherent cinematic or illustrative scene, a visually distinctive ACTUAL LAST WORD. An emotional resolution is optional, NOT required. The image may show a sharply staged reversal, confrontation, absurd escalation, victorious spectacle, honest human connection, or a scene-specific environmental transformation. Match the actual mode and payoff, not the AI image model's stock idea of an epilogue. Avoid the ubiquitous dim lamp, empty hallway, poetic train platform, sunset, distant horizon, contemplative desk portrait and open doorway unless the documented ending genuinely needs it.",
    "Give the ending a surprising SPECIFIC image, not a recap of everything consumed. No multiple franchise worlds, character lineups, collections of media props, framed posters, book jackets, floating game covers or souvenir cards. Small factual callbacks can appear only when subordinate to ONE hero composition.",
    "Wide 3:2 horizontal background, premium editorial art with generous dark negative space behind the final headline and reflection. " +
      imageFramingGuidance(scene.composition?.direction),
    "The UI overlays ALL lettering and the Deep Dive action. Render NO text, written logos, lettering, labels, buttons, statistics, panels, screenshots, borders or watermarks.",
    "Do not invent the user's real experiences, achievements, plot events, quotes or spoilers. One evocative fictional metaphor is allowed.",
    visualSelfImageClause(subjectProfile),
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
