import { apiFetch } from "./db";
import { normalizeDynamicScene } from "../lib/dynamicScenes";
import type { DynamicSceneComposition } from "../lib/dynamicScenes";
import type { WrappedStory } from "./wrappedAi";

type DirectorReply = { compositions?: Array<{ sceneId: string; composition: unknown }> };

/**
 * Separate the storytelling task from visual layout design. Only the story
 * already verified by normalizeWrappedStory enters this pass. Numbers, quotes
 * and media URLs cannot be written by the model: it only references bound IDs.
 */
export function wrappedVisualDirectorBrief(story: WrappedStory): string {
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
  }));
  return [
    "ISSUE: " + story.title + "\n" + story.dek,
    "VERIFIED, ALREADY WRITTEN SCENES (do not change their copy):\n" + JSON.stringify(scenes),
    "Choose 2 or 3 DIFFERENT scenes worth special visual staging. Strong candidates: opening, a central high point, or closing; choose according to story and pace. Avoid three nearly identical compositions.",
    "Each scene must feature the EXISTING title and body exactly once, via elements of type title and body; all other visual content is optional. On desktop arrange elements using independent rectangle boxes with percentage coordinates x,y,w,h from 0 to 100, without exceeding canvas bounds. Do NOT overlap title and body.",
    "Allowed element types: title, body, eyebrow, media (requires mediaId from imageMediaIds), title-art (opening only; uses generated issue cover), quote (only when hasVerifiedQuote), stat (requires verifiedBars index), beat (requires verifiedBeats index), shape (requires shape: orb|ring|line|panel|pill). Do not provide image URLs, original text, new numbers or any freeform HTML.",
    "Each element requires id (short unique ASCII), type, box:{x,y,w,h}, size:sm|md|lg|xl, tone:primary|secondary|accent, motion:none|fade|rise|slide|pop|float|pulse, delay:0..3. Only media/title-art/shape may use endlessly animated float or pulse. Keep a total of 2-11 elements per scene and at most 4 shapes, 2 media images and 4 data stats.",
    "Backdrops: cinematic, spotlight, grid, minimal, halftone. The saved story palette is inherited. You may put imagery behind typography, use striking negative space, stagger reveals or create asymmetry. Compose for a wide cinematic canvas; mobile uses a readable vertical arrangement.",
    "Be unusually creative in visual form: one scene might be a sweeping typographic manifesto, another a single gigantic verified percentage, another a carefully framed media image, an orbit of abstract shapes or a cinematic timeline. Do NOT force every data visual or image into every scene. Choose only what advances the narrative moment.",
    "No invented achievements, personal actions, media, numerical facts, quotations, citations or spoilers. Quote, bar and beat content is inserted verbatim by FauxLore from verified source data. You may never supply CSS, HTML, SVG markup, JavaScript, event handlers or URLs.",
    "Respond ONLY as JSON: {\"compositions\":[{\"sceneId\":\"wrapped-0\",\"composition\":{\"version\":1,\"backdrop\":\"spotlight\",\"elements\":[{\"id\":\"hero\",\"type\":\"title\",\"box\":{\"x\":6,\"y\":22,\"w\":76,\"h\":19},\"size\":\"xl\",\"tone\":\"primary\",\"motion\":\"rise\",\"delay\":0},{\"id\":\"copy\",\"type\":\"body\",\"box\":{\"x\":8,\"y\":56,\"w\":65,\"h\":27},\"size\":\"md\",\"tone\":\"secondary\",\"motion\":\"fade\",\"delay\":0.3}]}}]}. Example is SHAPE ONLY; make each scene visually distinct.",
  ].join("\n\n");
}

export function applyWrappedVisualCompositions(
  story: WrappedStory, raw: unknown, maxCompositions = 3,
): WrappedStory {
  const reply = raw as DirectorReply;
  if (!reply || !Array.isArray(reply.compositions) || reply.compositions.length > 8) {
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
