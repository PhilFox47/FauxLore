import type { StoryScene } from "./storyDiscovery";
import type { AnalyticTreatment } from "./wrappedEditorial";

/**
 * Generative visual composition DSL v1. The model never writes HTML, CSS,
 * JavaScript, URLs, or user-visible numeric facts. React renders known
 * components and resolves every reference from a previously verified scene.
 */
export type DynamicSceneBackdrop = "cinematic" | "spotlight" | "grid" | "minimal" | "halftone";
/**
 * Editorial stage instead of arbitrary layout boxes. Safe enums are shared
 * by the visual director, server validator, image prompter and React renderer.
 * The old coordinate-based compositions remain backward compatible.
 */
export type EditorialPresentation = "cinematic" | "data" | "typography" | "composed";
export type EditorialTextSide = "left" | "right" | "center";
export type EditorialTextPosition = "top" | "middle" | "bottom";
export type EditorialImageFocus = "left" | "center" | "right";
export interface EditorialDirection {
  presentation: EditorialPresentation;
  textSide: EditorialTextSide;
  textPosition: EditorialTextPosition;
  imageFocus: EditorialImageFocus;
  /** Renderer choice locked to the scene's verified analytic kind. */
  dataTreatment?: AnalyticTreatment;
}
/** Only editorial placement metadata; generated artwork never supplies CSS. */
export function imageFramingGuidance(direction?: Partial<EditorialDirection> | null): string {
  const side = direction?.textSide === "right" ? "right" : direction?.textSide === "center" ? "center" : "left";
  const rawFocus = direction?.imageFocus === "left" ? "left" : direction?.imageFocus === "center" ? "center" : "right";
  // Do not put the image's most important subject underneath its headline.
  const focus = side === "left" && rawFocus === "left" ? "right"
    : side === "right" && rawFocus === "right" ? "left"
    : side === "center" && rawFocus === "center" ? "right" : rawFocus;
  const space = side === "center"
    ? "Keep the central 55% relatively dark, quiet and uncluttered so centered overlaid typography remains readable."
    : "Keep the " + side.toUpperCase() + " 55% darker, quieter and free of faces or vital objects for overlaid story text.";
  return "EDITORIAL IMAGE FRAMING: This image will BLEED edge-to-edge behind the story's typography. " +
    space + " Put the principal visual subject toward the " + focus.toUpperCase() +
    " of the frame, with enough room for cinematic cropping on mobile. " +
    "NO baked-in text, lettering or framed poster panels.";
}
export type DynamicSceneMotion = "none" | "fade" | "rise" | "slide" | "pop" | "float" | "pulse";
export type DynamicSceneTone = "primary" | "secondary" | "accent";
export type DynamicSceneSize = "sm" | "md" | "lg" | "xl";
export type DynamicSceneShape = "orb" | "ring" | "line" | "panel" | "pill";
export type DynamicSceneElementType =
  "title" | "body" | "eyebrow" | "quote" | "media" | "scene-art" | "stat" | "beat" | "shape" | "title-art";

export interface SceneBox {
  /** Percentage coordinates in the desktop design canvas (0-100). */
  x: number; y: number; w: number; h: number;
}

export interface DynamicSceneElement {
  id: string;
  type: DynamicSceneElementType;
  box: SceneBox;
  size: DynamicSceneSize;
  tone: DynamicSceneTone;
  motion: DynamicSceneMotion;
  delay: number;
  /** Only meaningful for a verified scene media reference. */
  mediaId?: string;
  /** Only meaningful for a verified scene bar or timeline beat. */
  index?: number;
  /** Only meaningful for a pure decorative shape. */
  shape?: DynamicSceneShape;
}

/**
 * This is a fictional image brief, NEVER a factual claim about what the user
 * played or which characters they met. The server persists only safe enums
 * and short descriptive strings.
 */
export type WrappedActivityMode = "action" | "social" | "exploration" | "investigation" | "reflection" | "environmental";
export type WrappedCastMode = "self" | "in-world-self" | "canon-character" | "environment";
export type WrappedCamera = "wide" | "tracking" | "low-angle" | "over-shoulder" | "aerial" | "close-up" | "medium";
export type WrappedVisualArchetype =
  "environmental-stillness" | "stage-spectacle" | "active-task-comedy" |
  "travel-observation" | "investigative-noir" | "symbolic-object-tableau" |
  "ensemble-interaction" | "kinetic-action" | "quiet-aftermath" | "source-world-moment";
export type WrappedSettingFamily =
  "stage" | "hotel" | "train" | "corridor" | "exterior" | "media-world" |
  "domestic" | "abstract" | "other";
export type WrappedPropStrategy = "none" | "environment" | "single-symbol" | "held-object" | "tabletop" | "group-interaction";
export interface WrappedVisualPlan {
  activityMode: WrappedActivityMode;
  castMode: WrappedCastMode;
  camera: WrappedCamera;
  /** A concrete, visual verb phrase instead of a generic emotional adjective. */
  action: string;
  /** Optional interaction partner or prop; not a factual log of a meeting. */
  interaction?: string;
  /** Issue-wide composition families, independent of the verified story text. */
  visualArchetype?: WrappedVisualArchetype;
  settingFamily?: WrappedSettingFamily;
  propStrategy?: WrappedPropStrategy;
  /** Validated visual exclusions only; not instructions about real events. */
  bannedMotifs?: string[];
}

export interface DynamicSceneComposition {
  version: 1;
  backdrop: DynamicSceneBackdrop;
  /** Preferred visual staging; original box layout remains a safe fallback. */
  direction?: EditorialDirection;
  /** A single descriptive visual metaphor used only for rendered scene artwork. */
  artConcept?: string;
  /** Original action/interaction and shot plan; absent in historical stories. */
  visualPlan?: WrappedVisualPlan;
  elements: DynamicSceneElement[];
}

const elementTypes = new Set<DynamicSceneElementType>([
  "title", "body", "eyebrow", "quote", "media", "scene-art", "stat", "beat", "shape", "title-art",
]);
const backdrops = new Set<DynamicSceneBackdrop>(["cinematic","spotlight","grid","minimal","halftone"]);
/** Old directors sometimes returned the issue PALETTE in the backdrop field.
 * Normalize only known palette names rather than dropping the entire scene
 * (and losing its carefully planned visual action and camera). */
const paletteBackdrops = new Set([
  "violet", "cobalt", "amber", "rose", "emerald", "cyan", "monochrome",
]);
const presentations = new Set<EditorialPresentation>(["cinematic","data","typography","composed"]);
const textSides = new Set<EditorialTextSide>(["left","right","center"]);
const textPositions = new Set<EditorialTextPosition>(["top","middle","bottom"]);
const imageFoci = new Set<EditorialImageFocus>(["left","center","right"]);
const activityModes = new Set<WrappedActivityMode>(["action", "social", "exploration", "investigation", "reflection", "environmental"]);
const castModes = new Set<WrappedCastMode>(["self", "in-world-self", "canon-character", "environment"]);
const cameras = new Set<WrappedCamera>(["wide", "tracking", "low-angle", "over-shoulder", "aerial", "close-up", "medium"]);
const archetypes = new Set<WrappedVisualArchetype>([
  "environmental-stillness", "stage-spectacle", "active-task-comedy",
  "travel-observation", "investigative-noir", "symbolic-object-tableau",
  "ensemble-interaction", "kinetic-action", "quiet-aftermath", "source-world-moment",
]);
const settings = new Set<WrappedSettingFamily>([
  "stage", "hotel", "train", "corridor", "exterior", "media-world", "domestic", "abstract", "other",
]);
const propStrategies = new Set<WrappedPropStrategy>([
  "none", "environment", "single-symbol", "held-object", "tabletop", "group-interaction",
]);
const sanitizedMotif = (value: unknown): value is string =>
  typeof value === "string" && value.length >= 6 && value.length <= 120 &&
  !/[<>\u0000-\u001f]|https?:\/\//i.test(value);

/** Strip invalid model-authored art directions without invalidating the story. */
export function normalizeWrappedVisualPlan(value: unknown): WrappedVisualPlan | undefined {
  if (!obj(value) || !activityModes.has(value.activityMode as WrappedActivityMode) ||
      !castModes.has(value.castMode as WrappedCastMode) ||
      !cameras.has(value.camera as WrappedCamera) ||
      typeof value.action !== "string") return undefined;
  const action = value.action.replace(/\s+/g, " ").trim();
  if (action.length < 12 || action.length > 180 ||
      /[<>\u0000-\u001f]|https?:\/\//i.test(action)) return undefined;
  const interaction = typeof value.interaction === "string"
    ? value.interaction.replace(/\s+/g, " ").trim() : "";
  return {
    activityMode: value.activityMode as WrappedActivityMode,
    castMode: value.castMode as WrappedCastMode,
    camera: value.camera as WrappedCamera,
    action,
    ...(interaction.length >= 2 && interaction.length <= 100 &&
        !/[<>\u0000-\u001f]|https?:\/\//i.test(interaction)
      ? { interaction } : {}),
    ...(archetypes.has(value.visualArchetype as WrappedVisualArchetype)
      ? { visualArchetype: value.visualArchetype as WrappedVisualArchetype } : {}),
    ...(settings.has(value.settingFamily as WrappedSettingFamily)
      ? { settingFamily: value.settingFamily as WrappedSettingFamily } : {}),
    ...(propStrategies.has(value.propStrategy as WrappedPropStrategy)
      ? { propStrategy: value.propStrategy as WrappedPropStrategy } : {}),
    ...(Array.isArray(value.bannedMotifs)
      ? { bannedMotifs: [...new Set(value.bannedMotifs.filter(sanitizedMotif))]
          .slice(0, 8).map(m => m.replace(/\s+/g, " ").trim()) } : {}),
  };
}
const sizes = new Set<DynamicSceneSize>(["sm","md","lg","xl"]);
const tones = new Set<DynamicSceneTone>(["primary","secondary","accent"]);
const motions = new Set<DynamicSceneMotion>(["none","fade","rise","slide","pop","float","pulse"]);
const shapes = new Set<DynamicSceneShape>(["orb","ring","line","panel","pill"]);

const obj = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const numeric = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

function parseBox(raw: unknown): SceneBox {
  if (!obj(raw) || !numeric(raw.x, 0, 95) || !numeric(raw.y, 0, 95) ||
      !numeric(raw.w, 5, 100) || !numeric(raw.h, 5, 100) ||
      raw.x + raw.w > 100.01 || raw.y + raw.h > 100.01) {
    throw new Error("Dynamic scene element is outside the design canvas");
  }
  return { x: raw.x, y: raw.y, w: raw.w, h: raw.h };
}

function overlapRatio(a: SceneBox, b: SceneBox): number {
  const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return width * height / Math.min(a.w * a.h, b.w * b.h);
}

/**
 * Shared by the AI client, the Express save endpoint and the React renderer.
 * It rejects unsafe structures, then RECONSTRUCTS only approved fields.
 *
 * If a composition fails validation, callers should simply use the existing
 * fixed layout, not fail an otherwise valid Wrapped.
 */
export function normalizeDynamicScene(
  value: unknown,
  scene: Pick<StoryScene, "kind" | "title" | "body" | "quote" | "bars" | "beats" | "media" | "artworks" | "analytic">,
): DynamicSceneComposition {
  if (!obj(value) || value.version !== 1 ||
    (!backdrops.has(value.backdrop as DynamicSceneBackdrop) && !paletteBackdrops.has(value.backdrop as string)) ||
    !Array.isArray(value.elements) || value.elements.length < 2 || value.elements.length > 11) {
    throw new Error("Invalid dynamic scene composition");
  }
  if (JSON.stringify(value).length > 12500) throw new Error("Dynamic scene exceeds size budget");
  if (scene.title.length > 200 || scene.body.length > 5000) throw new Error("Scene text too long");
  const allowedMedia = new Set<string>(
    [...(scene.media ? [scene.media] : []), ...(scene.artworks || [])]
      .filter(media => !!media.cover).map(media => media.id),
  );
  const elements: DynamicSceneElement[] = [];
  const ids = new Set<string>();
  for (const raw of value.elements) {
    if (!obj(raw) || typeof raw.id !== "string" || !/^[a-z0-9_-]{1,32}$/i.test(raw.id) ||
      ids.has(raw.id) || !elementTypes.has(raw.type as DynamicSceneElementType) ||
      !sizes.has(raw.size as DynamicSceneSize) ||
      !tones.has(raw.tone as DynamicSceneTone) ||
      !motions.has(raw.motion as DynamicSceneMotion) ||
      !numeric(raw.delay, 0, 3)) {
      throw new Error("Invalid dynamic scene element");
    }
    ids.add(raw.id);
    const box = parseBox(raw.box);
    const type = raw.type as DynamicSceneElementType;
    if (type === "title" && (box.w < 22 || box.h < 10) ||
      type === "body" && (box.w < 24 || box.h < 18)) {
      throw new Error("Dynamic scene text needs sufficient space");
    }
    const element: DynamicSceneElement = {
      id: raw.id, type, box,
      size: raw.size as DynamicSceneSize,
      tone: raw.tone as DynamicSceneTone,
      motion: raw.motion as DynamicSceneMotion,
      delay: raw.delay,
    };
    if (type === "quote" && !scene.quote) throw new Error("Quote must come from a verified journal");
    if (type === "title-art" && scene.kind !== "opening") throw new Error("Title art is opening-only");
    if (type === "scene-art" && (scene.kind === "opening" || scene.kind === "closing")) throw new Error("Interior art is for story beats, not the opening or epilogue");
    if (type === "media") {
      if (typeof raw.mediaId !== "string" || !allowedMedia.has(raw.mediaId)) {
        throw new Error("Media art must refer to a verified scene cover");
      }
      element.mediaId = raw.mediaId;
    }
    if (type === "stat" || type === "beat") {
      const facts = type === "stat" ? scene.bars : scene.beats;
      if (typeof raw.index !== "number" || !Number.isInteger(raw.index) || !facts ||
          raw.index < 0 || raw.index >= facts.length) {
        throw new Error("Dynamic scene data must reference a verified index");
      }
      element.index = raw.index as number;
    }
    if (type === "shape") {
      if (!shapes.has(raw.shape as DynamicSceneShape)) throw new Error("Unknown scene shape");
      element.shape = raw.shape as DynamicSceneShape;
    }
    // Ambient motion is deliberately limited to decorative and image assets.
    if ((element.motion === "float" || element.motion === "pulse") &&
      !["shape", "media", "title-art", "scene-art"].includes(element.type)) {
      throw new Error("Text and data must not endlessly animate");
    }
    elements.push(element);
  }
  const titles = elements.filter(element => element.type === "title");
  const bodies = elements.filter(element => element.type === "body");
  if (titles.length !== 1 || bodies.length !== 1) throw new Error("Dynamic composition needs one title and one body");
  if (overlapRatio(titles[0].box, bodies[0].box) > .12) throw new Error("Dynamic scene title overlaps body");
  if (elements.filter(element => element.type === "scene-art").length > 1 ||
      elements.filter(element => element.type === "title-art").length > 1 ||
      elements.filter(element => element.type === "shape").length > 4 ||
      elements.filter(element => element.type === "media").length > 2 ||
      elements.filter(element => element.type === "stat").length > 4) {
    throw new Error("Dynamic scene is too cluttered");
  }
  let direction: EditorialDirection | undefined;
  if (obj(value.direction) &&
      presentations.has(value.direction.presentation as EditorialPresentation) &&
      textSides.has(value.direction.textSide as EditorialTextSide) &&
      textPositions.has(value.direction.textPosition as EditorialTextPosition) &&
      imageFoci.has(value.direction.imageFocus as EditorialImageFocus)) {
    const proposedTreatment = value.direction.dataTreatment;
    if (proposedTreatment != null &&
        (value.direction.presentation !== "data" ||
          typeof proposedTreatment !== "string" ||
          proposedTreatment !== scene.analytic?.kind)) {
      throw new Error("Analytic treatment must match an app-verified dataset");
    }
    direction = {
      presentation: value.direction.presentation as EditorialPresentation,
      ...(value.direction.presentation === "data" && scene.analytic
        ? { dataTreatment: scene.analytic.kind } : {}),
      textSide: value.direction.textSide as EditorialTextSide,
      textPosition: value.direction.textPosition as EditorialTextPosition,
      imageFocus: value.direction.textSide === value.direction.imageFocus
        ? (value.direction.textSide === "right" ? "left" : "right")
        : value.direction.imageFocus as EditorialImageFocus,
    };
  }
  return {
    version: 1,
    backdrop: backdrops.has(value.backdrop as DynamicSceneBackdrop)
      ? value.backdrop as DynamicSceneBackdrop : "cinematic",
    ...(direction ? { direction } : {}),
    ...((direction?.presentation !== "data") &&
      typeof value.artConcept === "string" && value.artConcept.trim().length >= 6 &&
      value.artConcept.length <= 240 && !/[<>]/.test(value.artConcept)
        ? { artConcept: value.artConcept.trim().replace(/\s+/g, " ") }
        : {}),
    ...(direction?.presentation === "data" ? {} :
      (normalizeWrappedVisualPlan(value.visualPlan)
        ? { visualPlan: normalizeWrappedVisualPlan(value.visualPlan) } : {})),
    elements,
  };
}

/** A broken older or in-flight AI composition falls back to the fixed layout. */
export function safeDynamicScene(
  value: unknown,
  scene: Parameters<typeof normalizeDynamicScene>[1],
): DynamicSceneComposition | null {
  try { return normalizeDynamicScene(value, scene); } catch { return null; }
}
