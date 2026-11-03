import { apiFetch } from "./db";
import { normalizeDynamicScene } from "../lib/dynamicScenes";
import type { DynamicSceneComposition } from "../lib/dynamicScenes";
import type { WrappedStory } from "./wrappedAi";
import { selectIllustratedScenes } from "../lib/wrappedSceneArt";

type DirectorReply = { compositions?: Array<{ sceneId: string; composition: unknown }> };

/**
 * Separate the storytelling task from visual layout design. Only the story
 * already verified by normalizeWrappedStory enters this pass. Numbers, quotes
 * and media URLs cannot be written by the model: it only references bound IDs.
 */
export function wrappedVisualDirectorBrief(story: WrappedStory): string {
  const illustrated = new Set(selectIllustratedScenes(story.scenes));
  const scenes = story.scenes.map(scene => ({
    sceneId: scene.id,
    kind: scene.kind,
    title: scene.title,
    body: scene.body.slice(0, 900),
    eyebrow: scene.eyebrow,
    palette: scene.design?.palette || "violet",
    imageMediaIds: [...new Set([scene.media, ...(scene.artworks || [])]
      .filter(m => m?.cover).map(m => m!.id))].slice(0, 6),
    verifiedBars: (scene.bars || []).slice(0, 6).map((bar, index) => ({
      index, label: bar.label, value: bar.value, note: bar.note,
    })),
    verifiedBeats: (scene.beats || []).slice(0, 8).map((beat, index) => ({
      index, label: beat.label, title: beat.title,
    })),
    hasVerifiedQuote: !!scene.quote,
    hasTitleArt: scene.kind === "opening",
    canGenerateOriginalSceneArt: illustrated.has(scene.id),
    titleChars: scene.title.length,
    bodyChars: scene.body.length,
  }));
  return [
    "ISSUE: " + story.title + "\n" + story.dek,
    "VERIFIED, ALREADY WRITTEN SCENES (do not change their copy):\n" + JSON.stringify(scenes),
    "COMPOSE EVERY SCENE. No skipping: one composition for EACH sceneId, from opening through closing. The previous 2-3-scene limitation caused most of a Wrapped to fall back to the same old templates. This is the visual director's main deliverable. Give each scene a DISTINCT artistic concept and layout, not the same left-copy/right-media split.",
    "Each scene must include the EXISTING title and body exactly once using elements of type title and body. No new prose. Desktop elements use rectangle box coordinates x,y,w,h in percentages from 0-100, without exceeding canvas bounds. Do NOT overlap the title and body. Place enough room for the full title and narration: titleBoxes must often be 35-65% wide, 25-45% tall. For long headings use very generous dimensions and size sm or md rather than xl. Never put text in a scrollable box.",
    "Visual composition MUST have a point. Choose one artistic device that tells the reader WHY this specific event matters: an evocative illustration, a dominant verified statistic, a meaningful contrast, an unusually shaped typography treatment, or a timeline that illustrates change. Decorative circles and cover tiles alone are NOT an idea. If a design could be reused for any random scene, it is not good enough.",
    "Elements: title, body, eyebrow, media (requires mediaId from imageMediaIds), title-art (opening only), scene-art (ONLY where canGenerateOriginalSceneArt is true), quote (only with hasVerifiedQuote), stat (verifiedBars index), beat (verifiedBeats index), shape (shape: orb|ring|line|panel|pill). No URLs, HTML, CSS, custom text or invented data.",
    "For the special moments marked canGenerateOriginalSceneArt=true, prioritize exactly ONE big scene-art element with a short artConcept: a concrete, distinct editorial scene or strong visual metaphor SPECIFIC to that chapter, not a collage or generic fantasy glow. This artwork will be generated separately and used as a single cinematic backdrop or large feature. DO NOT place media covers over the scene-art merely to prove which titles were consumed.",
    "Every element requires id (unique ASCII), type, box:{x,y,w,h}, size:sm|md|lg|xl, tone:primary|secondary|accent, motion:none|fade|rise|slide|pop|float|pulse, delay:0..3. Only images or shapes can use looping float/pulse. Max 11 elements (incl. up to 4 shapes, 2 media, 4 stats). When using scene-art add artConcept of 10-180 characters describing the ONE strong image idea, grounded in this slide.",
    "Backdrops: cinematic, spotlight, grid, minimal, halftone. Saved story palette is inherited. Compose for a wide cinematic desktop canvas; mobile will switch to a vertical reading order. Give text room for its actual length. Avoid overlapping or very narrow text blocks.",
    "Make the issue feel like one cohesive editorial experience with genuinely different visual rhythms: full-bleed scenes, data-driven typographic statements, negative-space compositions, evocative single images, restrained minimalist moments. Do NOT repeat cover-wall grids, random floating jackets, decorative circles or dull split layouts scene after scene.",
    "The verified facts and user quotes are immutable, inserted by FauxLore from stored data. Never invent a real-world achievement, plot encounter, statistic, quote or spoiler; no executable code, URLs, freeform markup or personal details beyond the provided scene.",
    "Return ONLY JSON object with a compositions array. Each entry has sceneId and composition containing version:1, backdrop and elements (plus optional artConcept for scene-art). Include every actual sceneId exactly once. Do not return explanatory prose.",
  ].join("\n\n");
}

export function applyWrappedVisualCompositions(
  story: WrappedStory, raw: unknown, maxCompositions = story.scenes.length,
): WrappedStory {
  const reply = raw as DirectorReply;
  if (!reply || !Array.isArray(reply.compositions) || reply.compositions.length > 14) {
    throw new Error("Visual Director did not return composition proposals");
  }
  const seen = new Set<string>();
  const maps = new Map<string, DynamicSceneComposition>();
  for (const proposal of reply.compositions) {
    if (!proposal || typeof proposal.sceneId !== "string" || seen.has(proposal.sceneId)) continue;
    seen.add(proposal.sceneId);
    const scene = story.scenes.find(s => s.id === proposal.sceneId);
    if (!scene || maps.size >= maxCompositions) continue;
    try {
      maps.set(proposal.sceneId, normalizeDynamicScene(proposal.composition, scene));
    } catch (error) {
      // One invalid slide does not poison the editorial story or other slides.
      console.warn("[wrapped-visuals] Skipping invalid AI composition:", proposal.sceneId, error);
    }
  }
  return { ...story, scenes: story.scenes.map(scene => ({
    ...scene, composition: maps.get(scene.id),
  })) };
}

export async function generateWrappedVisualCompositions(args: {
  story: WrappedStory;
  model: string;
  apiKey: string;
}): Promise<WrappedStory> {
  const { story, model, apiKey } = args;
  try {
    const result = await apiFetch("/api/nano-gpt/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-nano-gpt-key": apiKey },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        temperature: .9,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are the VISUAL DIRECTOR for a personal Wrapped. Create visually original, safe, data-bound compositions. JSON ONLY. Never generate code." },
          { role: "user", content: wrappedVisualDirectorBrief(story) },
        ],
      }),
    });
    if (!result.ok) throw new Error("Visual Director HTTP " + result.status);
    const payload = await result.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Visual Director returned no JSON");
    const answer = content.trim();
    try { return applyWrappedVisualCompositions(story, JSON.parse(answer)); }
    catch (error) {
      const from = answer.indexOf("{"), to = answer.lastIndexOf("}");
      if (from < 0 || to <= from) throw error;
      return applyWrappedVisualCompositions(story, JSON.parse(answer.slice(from, to + 1)));
    }
  } catch (error) {
    console.warn("[wrapped-visuals] Using reliable legacy layouts after Visual Director error:", error);
    return story;
  }
}
