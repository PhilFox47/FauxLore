import { apiFetch } from "./db";
import { normalizeDynamicScene } from "../lib/dynamicScenes";
import type { DynamicSceneComposition } from "../lib/dynamicScenes";
import type { WrappedStory } from "./wrappedAi";
import { selectIllustratedScenes } from "../lib/wrappedSceneArt";
import { MAX_DATA_SLIDES, isDataLayout, isStrongSceneData, isStrongVerifiedAnalytic, editorialJobFromKind } from "../lib/wrappedEditorial";
import type { StoryPeriod } from "../lib/storyDiscovery";

type DirectorReply = { compositions?: Array<{ sceneId: string; composition: unknown }> };

/**
 * Separate the storytelling task from visual layout design. Only the story
 * already verified by normalizeWrappedStory enters this pass. Numbers, quotes
 * and media URLs cannot be written by the model: it only references bound IDs.
 */
export function wrappedVisualDirectorBrief(
  story: WrappedStory, onlySceneIds?: string[], timeframe: StoryPeriod = "week",
): string {
  const illustrated = new Set(selectIllustratedScenes(story.scenes));
  const wanted = onlySceneIds ? new Set(onlySceneIds) : null;
  const scenes = story.scenes.filter(scene => !wanted || wanted.has(scene.id)).map(scene => ({
    sceneId: scene.id,
    kind: scene.kind,
    editorialJob: scene.editorialJob || editorialJobFromKind(scene.kind),
    title: scene.title,
    body: scene.body.slice(0, 900),
    eyebrow: scene.eyebrow,
    palette: scene.design?.palette || "violet",
    imageMediaIds: [...new Set([scene.media, ...(scene.artworks || [])]
      .filter(m => m?.cover).map(m => m!.id))].slice(0, 6),
    canUseData: (isDataLayout(scene.kind, scene.design?.layout, scene.design?.visual) ||
      scene.editorialJob === "data-reveal") &&
      (isStrongSceneData(scene.kind, scene.bars) || isStrongVerifiedAnalytic(scene.analytic)),
    verifiedAnalytic: scene.analytic ? {
      kind: scene.analytic.kind, unit: scene.analytic.unit,
      points: scene.analytic.points,
    } : null,
    verifiedBars: (scene.bars || []).slice(0, 6).map((bar, index) => ({
      index, label: bar.label, value: bar.value, note: bar.note,
    })),
    verifiedBeats: (scene.beats || []).slice(0, 8).map((beat, index) => ({
      index, label: beat.label, title: beat.title,
    })),
    hasVerifiedQuote: !!scene.quote,
    hasTitleArt: scene.kind === "opening",
    canGenerateOriginalSceneArt: illustrated.has(scene.id),
    canStageCinematic: scene.kind === "opening" || illustrated.has(scene.id),
    titleChars: scene.title.length,
    bodyChars: scene.body.length,
  }));
  return [
    "ISSUE: " + story.title + "\n" + story.dek,
    "VERIFIED, ALREADY WRITTEN SCENES (do not change their copy):\n" + JSON.stringify(scenes),
    "STRICT DATA BUDGET FOR THIS " + timeframe.toUpperCase() + ": at most " +
      MAX_DATA_SLIDES[timeframe] + " infographic/data slide(s) across the ENTIRE issue. This is a maximum, NOT a quota. The Story Director has already limited chart jobs; do not create new ones in the visual pass.",
    "STORY-JOB CONTRACT: Every scene carries an editorialJob (hook, verdict, contrast, turning-point, pattern, data-reveal, place, reflection, payoff). Your job is to STAGE that narrative function, not replace it with a different argument or pick a template for variety. The writer has already validated the factual point and the allowed data treatment. Respect its intent and sequence. A verdict wants dramatic focus, a turning-point needs an earned before/after reveal, a reflection wants breathing room. Do not automatically chart something just because figures exist.",
    "FOUR ANALYTIC STAGES, ONE APPROPRIATE PURPOSE: verifiedAnalytic.kind may be shift (before/after with a bold delta), duel (two ratings in deliberate opposition), arc (early/middle/late phase progression), or dominance (one exceptional work's large share). These are real, distinct renderers. If canUseData=true AND the story's claim fundamentally benefits from the statistic, choose presentation:data and set direction.dataTreatment to the EXACT verifiedAnalytic.kind. Otherwise choose cinematic/typography. NEVER invent a treatment or numerical values. Do not use a shift graph for a quoted review or a duel for a temporal arc.",
    "COMPOSE EVERY SCENE IN THE PROVIDED LIST. No skipping: exactly one composition for EACH sceneId listed, nothing else. Choose a distinctive but coherent cinematic-magazine treatment for each story beat, with a deliberate visual rhythm across the issue.",
    "NEW CINEMATIC EDITORIAL DIRECTION: Every composition MUST include direction:{presentation:'cinematic'|'data'|'typography'|'composed',textSide:'left'|'right'|'center',textPosition:'top'|'middle'|'bottom',imageFocus:'left'|'center'|'right',dataTreatment?:'shift'|'duel'|'arc'|'dominance'}. dataTreatment is ONLY valid when presentation:data and must match verifiedAnalytic.kind exactly. Use actual JSON double-quoted strings. This is a SAFE editorial plan, NOT arbitrary CSS or executable code.",
    "CINEMATIC means a SINGLE beautiful generated illustration bleeds edge-to-edge behind magazine typography, not an image rectangle inside a colourful card. Choose cinematic primarily for canStageCinematic=true scenes. The React renderer handles safe text spacing, gradients and contrast. A true full-art cinematic scene needs ONE striking motif and a clear visual thesis. For opening art, write artConcept specifying the thesis as an evocative scene. For chapter art, add a single scene-art element AND a 10-180 character artConcept specific to this beat. The image generator will receive EXACTLY this text placement and focal direction.",
    "IMAGE COMPOSITION IS JOINT ART DIRECTION: textSide describes where the overlaid typography will be; imageFocus describes where the primary image subject must be. Keep them mostly opposite (text LEFT, focal RIGHT, or vice versa), and reserve the text area as quiet, dark negative space. Center text is appropriate only for intentionally symmetrical imagery. textPosition determines the upper, middle or lower visual rhythm of the typography.",
    "DATA means a significant verified comparison is the HERO. Choose presentation:'data' and stat elements ONLY when canUseData=true AND the difference is editorially important. A 33% to 49% increase does not justify a whole chart! Do not recycle the same claim as both a text and a chart slide. If the same format change has already been explained, use quiet typography or image-led narrative instead. TYPOGRAPHY is a deliberately quiet text-led scene; COMPOSED is a rare fallback for a genuine sequence. Do NOT default to composed.",
    "Most illustrated scenes should favor cinematic full-art, but make it an editorial CHOICE rather than an obligatory quota. Do NOT make every slide a painting: allow data and typographic breathing room. Avoid stacked coloured card backgrounds, borders around the illustration, separate image boxes, floating unrelated covers, green or purple thematic rims, ornamental circles and title/description disconnected by huge empty gaps.",
    "THE STORY'S MEANING COMES FIRST: A visual device must express a specific observation, surprising connection, significant contrast, or earned emotional payoff. A scene about a train/book crossover can be a cinematic train emerging from an open novel; a media-share comparison should let real percentages dominate. Decorative piles of the week's many media objects are not an idea.",
    "The old coordinate elements are still REQUIRED for backwards compatibility and reliable fallback, but in cinematic/data/typography modes the renderer prioritizes the new direction plan. Give exactly ONE title and ONE body element with readable boxes, include accurate verified stat/beat/media references only when they improve the point. Avoid crowding. Never overlap title/body boxes.",
    "Allowed elements: title, body, eyebrow, media (mediaId must be from imageMediaIds), title-art (opening only), scene-art (only when canGenerateOriginalSceneArt=true), quote (only when hasVerifiedQuote), stat (verifiedBars index), beat (verifiedBeats index), shape (orb|ring|line|panel|pill). Every element needs id (unique ASCII), type, box:{x,y,w,h} on 0-100 canvas, size:sm|md|lg|xl, tone:primary|secondary|accent, motion:none|fade|rise|slide|pop|float|pulse, delay:0..3. No URLs, CSS, HTML, JS or invented text. Max 11 elements.",
    "For illustrated interior scenes with canGenerateOriginalSceneArt=true, include ONE large scene-art element and a detailed artConcept describing the intended single full-bleed visual thesis; the renderer itself places this image edge-to-edge. No image collage, book-cover wall, or large media cover pasted over generated art. For opening, add an artConcept and use cinematic direction with the verified generated title illustration.",
    "Text content, numerical facts, official reviews and quotes remain IMMUTABLE and are resolved from the already-written evidence-backed story. Layout may choose which facts to emphasize but must not invent any. Mobile automatically receives a legible layout, and reduced motion is supported.",
    "Return ONLY a JSON object {compositions:[{sceneId,composition:{version:1,backdrop,direction,artConcept?,elements:[...]}}]}. The direction object must include all four required enum fields. Include every sceneId exactly once. Do not return explanatory prose.",
  ].join("\n\n");
}

export function applyWrappedVisualCompositions(
  story: WrappedStory, raw: unknown, maxCompositions = story.scenes.length,
  timeframe: StoryPeriod = "week",
): WrappedStory {
  const reply = raw as DirectorReply;
  if (!reply || !Array.isArray(reply.compositions) || reply.compositions.length > 14) {
    throw new Error("Visual Director did not return composition proposals");
  }
  const seen = new Set<string>();
  const maps = new Map<string, DynamicSceneComposition>();
  let dataCount = story.scenes.filter(scene =>
    !!scene.composition && (scene.composition.direction?.presentation === "data" ||
      scene.composition.elements.some(element => element.type === "stat"))).length;
  for (const proposal of reply.compositions) {
    if (!proposal || typeof proposal.sceneId !== "string" || seen.has(proposal.sceneId)) continue;
    seen.add(proposal.sceneId);
    const scene = story.scenes.find(s => s.id === proposal.sceneId);
    if (!scene || maps.size >= maxCompositions) continue;
    try {
      const composition = normalizeDynamicScene(proposal.composition, scene);
      const dataLike = composition.direction?.presentation === "data" ||
        composition.elements.some(element => element.type === "stat");
      if (dataLike) {
        if (!(isDataLayout(scene.kind, scene.design?.layout, scene.design?.visual) ||
              scene.editorialJob === "data-reveal") ||
            !(isStrongSceneData(scene.kind, scene.bars) ||
              isStrongVerifiedAnalytic(scene.analytic)) ||
            dataCount >= MAX_DATA_SLIDES[timeframe]) {
          // A visual-only reroll may not turn ordinary prose into a new
          // infographic or bypass the narrative's evidence/quantity budget.
          continue;
        }
        dataCount++;
      }
      maps.set(proposal.sceneId, composition);
    } catch (error) {
      // One invalid slide does not poison the editorial story or other slides.
      console.warn("[wrapped-visuals] Skipping invalid AI composition:", proposal.sceneId, error);
    }
  }
  return { ...story, scenes: story.scenes.map(scene => ({
    ...scene, composition: maps.get(scene.id) || scene.composition,
  })) };
}

export async function generateWrappedVisualCompositions(args: {
  story: WrappedStory;
  model: string;
  apiKey: string;
  timeframe?: StoryPeriod;
}): Promise<WrappedStory> {
  const { story, model, apiKey, timeframe = "week" } = args;
  const request = async (userPrompt: string): Promise<unknown> => {
    const result = await apiFetch("/api/nano-gpt/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-nano-gpt-key": apiKey },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        temperature: .9,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are the VISUAL DIRECTOR for a personal Wrapped. Create visually original, safe, data-bound compositions. JSON ONLY. Never generate code." },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!result.ok) throw new Error("Visual Director HTTP " + result.status);
    const payload = await result.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Visual Director returned no JSON");
    const answer = content.trim();
    try { return JSON.parse(answer); }
    catch (error) {
      const from = answer.indexOf("{"), to = answer.lastIndexOf("}");
      if (from < 0 || to <= from) throw error;
      return JSON.parse(answer.slice(from, to + 1));
    }
  };
  let resultStory = story;
  try {
    resultStory = applyWrappedVisualCompositions(story, await request(wrappedVisualDirectorBrief(story, undefined, timeframe)),
      story.scenes.length, timeframe);
  } catch (error) {
    console.warn("[wrapped-visuals] Primary design pass failed; retrying only missing scenes:", error);
  }
  // One targeted repair call when an incomplete/invalid model reply leaves
  // scenes on the old template. This is cheap relative to redoing the story
  // and does not regenerate any accepted scene or its factual content.
  const missing = resultStory.scenes.filter(scene => !scene.composition).map(scene => scene.id);
  if (missing.length) {
    try {
      const repairPrompt = wrappedVisualDirectorBrief(resultStory, missing, timeframe) +
        "\n\nTARGETED REPAIR: the prior visual design was absent or invalid for these scene IDs: " +
        missing.join(", ") + ". Return exactly these scenes. Use generous title and body boxes and strong ideas.";
      resultStory = applyWrappedVisualCompositions(resultStory, await request(repairPrompt),
        resultStory.scenes.length, timeframe);
    } catch (error) {
      console.warn("[wrapped-visuals] Some scenes retain reliable preset layouts:", error);
    }
  }
  return resultStory;
}
