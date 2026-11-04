import { apiFetch } from './db';
import { generateWrappedVisualCompositions } from './wrappedVisualDirector';
import { getPersonaDescription } from '../lib/personas';
import { MAX_DATA_SLIDES, evidenceStoryFunctions, isDataLayout, isStrongVerifiedAnalytic, normalizeEditorialJob } from '../lib/wrappedEditorial';
import type { MediaItem } from '../types/schema';
import type { WrappedEvidence, WrappedFact } from '../lib/wrappedEvidence';
import type { StoryScene, StoryKind, StoryDesign, StoryLayout, StoryPalette, StoryVisual } from '../lib/storyDiscovery';

export interface WrappedStory {
  version: 2;
  title: string;
  dek: string;
  scenes: (StoryScene & { evidenceIds: string[] })[];
  /** Optimistic revision for independently rerolling visual compositions. */
  visualRevision?: number;
  generatedAt?: string;
  /** Separate image asset, never part of AI-authored story JSON. */
  coverArtUrl?: string | null;
  coverArtStatus?: 'pending' | 'generating' | 'done' | 'failed' | null;
  /** Original cinematic illustrations keyed by verified scene IDs. */
  sceneArt?: Record<string, string>;
  sceneArtStatus?: 'pending' | 'generating' | 'done' | 'failed' | null;
}
const kinds = new Set<StoryKind>(['opening','insight','outlier','location','journal','spotlight','taste','return','timeline','rhythm','closing']);
const limit = { week: 6, month: 9, year: 14 };
const layouts = new Set<StoryLayout>([
  'cover-hero', 'split-feature', 'cover-wall', 'infographic',
  'quote-poster', 'type-poster', 'timeline-film', 'editorial',
]);
const palettes = new Set<StoryPalette>(['violet', 'cobalt', 'amber', 'rose', 'emerald', 'cyan', 'monochrome']);
const visuals = new Set<StoryVisual>(['auto', 'cover', 'mosaic', 'bars', 'rings', 'tiles', 'timeline', 'quote', 'none']);
const fallbackLayout: Record<StoryKind, StoryLayout> = {
  opening: 'cover-hero', insight: 'editorial', outlier: 'infographic',
  location: 'cover-wall', journal: 'quote-poster', spotlight: 'cover-hero',
  taste: 'infographic', return: 'split-feature', timeline: 'timeline-film',
  rhythm: 'type-poster', achievement: 'type-poster', closing: 'type-poster',
};

const clean = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : '';
function parseJson(raw: string): any {
  const text = raw.trim();
  try { return JSON.parse(text); } catch {
    const from = text.indexOf('{'), to = text.lastIndexOf('}');
    if (from === -1 || to <= from) throw new Error('Wrapped Director did not return JSON.');
    return JSON.parse(text.slice(from, to + 1));
  }
}

/**
 * The AI authors the script, selects the evidence and chooses the scene types.
 * Only the app attaches VERIFIED numbers, quotes, timelines and media artwork.
 */
export function normalizeWrappedStory(raw: any, evidence: WrappedEvidence, media: MediaItem[]): WrappedStory {
  const data = raw?.story && typeof raw.story === 'object' ? raw.story : raw;
  if (!Array.isArray(data?.scenes) || data.scenes.length < 3 || data.scenes.length > limit[evidence.timeframe])
    throw new Error('Invalid scene count');
  const factIndex = new Map(evidence.facts.map(f => [f.id, f]));
  const mediaIndex = new Map(media.map(m => [m.id, m]));
  const scenes = data.scenes.map((item: any, index: number) => {
    const kind: StoryKind = item?.kind;
    if (!kinds.has(kind)) throw new Error('Unsupported scene format');
    const title = clean(item?.title, 200);
    const body = clean(item?.body, 5000);
    if (!title || !body) throw new Error('Every scene needs independently written text');
    const refs: string[] = Array.isArray(item?.evidenceIds) ? [...new Set(item.evidenceIds)] : [];
    if (refs.length > 5 || refs.some(id => typeof id !== 'string' || !factIndex.has(id)) ||
      (kind !== 'opening' && kind !== 'closing' && refs.length === 0))
      throw new Error('Scene references unknown or missing evidence IDs');
    const facts = refs.map(id => factIndex.get(id)!);
    const visual = facts.find(f => f.kind === kind && (f.bars?.length || f.beats?.length));
    const verifiedAnalysis = facts.find(f => !!f.analytic && isStrongVerifiedAnalytic(f.analytic))?.analytic;
    const editorialJob = normalizeEditorialJob(item?.editorialJob, kind);
    if ((kind === 'outlier' || kind === 'taste') && !visual?.bars?.length)
      throw new Error('Comparison requires measured visual data');
    if (kind === 'timeline' && !visual?.beats?.length) throw new Error('Timeline needs measured events');
    const quoted = facts.find(f => f.kind === 'journal' && !!f.quote);
    if (kind === 'journal' && !quoted) throw new Error('Journal scene requires an actual user quote');
    const supplied = item?.design && typeof item.design === 'object' ? item.design : {};
    if (!layouts.has(supplied.layout) || !palettes.has(supplied.palette) || !visuals.has(supplied.visual)) {
      throw new Error('AI Story Director must choose a supported visual composition for every scene');
    }
    const rawLayout = supplied.layout as StoryLayout;
    const rawPalette = supplied.palette as StoryPalette;
    const rawVisual = supplied.visual as StoryVisual;
    if ((isDataLayout(kind, rawLayout, rawVisual) || editorialJob === 'data-reveal') &&
        !visual?.bars?.length && !verifiedAnalysis) {
      throw new Error('Infographic needs a significant, verified statistical comparison; use editorial art or prose instead');
    }
    if (editorialJob === 'data-reveal' && !verifiedAnalysis && !visual?.bars?.length) {
      throw new Error('Data-reveal job needs a verified analytic source');
    }
    const permittedIds = new Set(
      (kind === 'opening' || kind === 'closing' ? [] :
        facts.flatMap(f => [...(f.mediaId ? [f.mediaId] : []), ...(f.mediaIds || [])]))
        .filter(id => mediaIndex.has(id)),
    );
    // The director proposes art by MEDIA ID. Neither image URLs nor cover
    // titles are model-authored. Source evidence must support scene images.
    const requested: string[] = Array.isArray(supplied.mediaIds) ? supplied.mediaIds.filter((id: any) => typeof id === 'string') : [];
    const eligible = [...new Set([...requested, ...permittedIds])].filter(id => permittedIds.has(id));
    const artworks = eligible.slice(0, 6).map(id => mediaIndex.get(id)!).filter(m => !!m.coverImageUrl).map(m => ({
      id: m.id, title: m.title, type: m.mediaType, cover: m.coverImageUrl,
    }));
    const primary = artworks[0] || (eligible[0] && mediaIndex.has(eligible[0])
      ? (() => { const m = mediaIndex.get(eligible[0])!; return { id: m.id, title: m.title, type: m.mediaType, cover: m.coverImageUrl }; })()
      : undefined);
    const wants = visuals.has(rawVisual) ? rawVisual : 'auto';
    const design: StoryDesign = {
      layout: layouts.has(rawLayout) ? rawLayout : fallbackLayout[kind],
      palette: palettes.has(rawPalette) ? rawPalette : 'violet',
      visual: (wants === 'bars' || wants === 'rings' || wants === 'tiles') && !visual?.bars?.length ? 'auto'
        : wants === 'timeline' && !visual?.beats?.length ? 'auto'
        : wants === 'quote' && !quoted ? 'auto' : wants,
      align: supplied.align === 'center' ? 'center' : 'left',
      mediaIds: artworks.map(m => m.id),
    };
    return {
      id: 'wrapped-' + index,
      kind, editorialJob,
      ...(verifiedAnalysis ? { analytic: verifiedAnalysis } : {}),
      title, body, eyebrow: clean(item?.eyebrow, 90) || 'YOUR STORY',
      evidenceIds: refs, detail: clean(item?.detail, 1200) || undefined,
      sourceLabel: facts[0]?.title || 'Your activity', design,
      ...(primary ? { media: primary } : {}),
      ...(artworks.length ? { artworks } : {}),
      ...(visual?.bars ? { bars: visual.bars } : {}),
      ...(visual?.beats ? { beats: visual.beats } : {}),
      ...(kind === 'journal' ? { quote: quoted!.quote } : {}),
    };
  });
  if (scenes[0].kind !== 'opening' || scenes.at(-1)?.kind !== 'closing' ||
    scenes.slice(1, -1).some(s => s.kind === 'opening' || s.kind === 'closing'))
    throw new Error('Story must have its own opening and ending');
  const refs = scenes.flatMap(s => s.evidenceIds);
  if (new Set(refs).size < 2) throw new Error('Story must find at least two different factual anchors');
  if (scenes.length > 4 && new Set(scenes.slice(1, -1).map(s => s.evidenceIds.join('|'))).size < 2)
    throw new Error('Story repeats one discovery');
  const middleScenes = scenes.slice(1, -1);
  const chartScenes = middleScenes.filter(scene =>
    isDataLayout(scene.kind, scene.design?.layout, scene.design?.visual) ||
    scene.editorialJob === 'data-reveal');
  if (chartScenes.length > MAX_DATA_SLIDES[evidence.timeframe]) {
    throw new Error('Infographic budget exceeded: at most ' +
      MAX_DATA_SLIDES[evidence.timeframe] + ' strong data slide(s) for a ' +
      evidence.timeframe + '. Remove weak or redundant charts.');
  }
  // Editorial jobs must actually differ: a second format-share chart with
  // another type of media is still the SAME "our mix changed" story.
  const usedFunctions = new Map<string, number>();
  middleScenes.forEach((scene, index) => {
    for (const functionKey of evidenceStoryFunctions(scene.evidenceIds)) {
      const prior = usedFunctions.get(functionKey);
      if (prior !== undefined) {
        throw new Error('Scene ' + (index + 2) + ' repeats the editorial function "' +
          functionKey + '" from scene ' + (prior + 2) +
          '. Combine the evidence into one scene or tell a genuinely different story.');
      }
      usedFunctions.set(functionKey, index);
    }
  });
  if (evidence.timeframe === 'month' && evidence.monthlyCoverage) {
    const coverage = evidence.monthlyCoverage;
    if (coverage.requiredPhases.length >= 2) {
      const seen = new Set<string>();
      let phaseSceneCount = 0;
      for (const scene of middleScenes) {
        const phases = scene.evidenceIds
          .map(id => factIndex.get(id)?.phase)
          .filter((phase): phase is NonNullable<typeof phase> => !!phase);
        if (phases.length) phaseSceneCount++;
        for (const phase of phases) seen.add(phase);
      }
      const missing = coverage.requiredPhases.filter(phase => !seen.has(phase));
      if (missing.length || phaseSceneCount < coverage.minPhaseScenes) {
        throw new Error('Monthly coverage missing ' + missing.join(', ') +
          (missing.length ? ' phase(s)' : ' independent phase-supported scenes') +
          '. Anchor substantive scenes in the early, middle and late month facts, not just recent highlights.');
      }
    }
    // Only cap LAST-WEEK-ONLY stories if that week itself did not dominate
    // the measured month; never force artificial balance on a late-heavy month.
    if (middleScenes.length >= 3 && coverage.lastWeekShare < .60) {
      const lastWeekOnly = middleScenes.filter(scene =>
        scene.evidenceIds.length > 0 &&
        scene.evidenceIds.every(id => factIndex.get(id)?.recentOnly === true));
      if (lastWeekOnly.length > Math.floor(middleScenes.length / 2)) {
        throw new Error('Monthly story overrepresents the final seven days: ' +
          lastWeekOnly.length + ' last-week-only scenes out of ' +
          middleScenes.length + '. Cover earlier substantive activity.');
      }
    }
  }
  return { version: 2, title: clean(data.title, 180) || scenes[0].title,
    dek: clean(data.dek, 500) || scenes[0].body.slice(0, 350), scenes };
}

export async function generateAiWrapped(args: {
  apiKey: string; model: string; persona?: string; evidence: WrappedEvidence;
  media: MediaItem[]; previous?: WrappedStory | null;
}): Promise<WrappedStory> {
  const { apiKey, model, persona, evidence, media } = args;
  const targets = { week: '4-6', month: '6-9', year: '9-14' };
  const system = [
    "You are the AI STORY DIRECTOR for FauxLore Wrapped. Create an entirely NEW, standalone, deeply personalized, cinematic story from the user's media history. " + getPersonaDescription(persona),
    "This is NOT a recap reformat. You do NOT have the recap text, recap chapters or recap awards. Invent an independent editorial perspective from the raw evidence. A reader who has ALREADY READ their recap should discover NEW thoughts here.",
    "The cards are VERIFIED RAW MATERIAL, not a mandatory outline. Find the most distinctive period-specific experiences, user opinions, significant deviations from personal norms and meaningful coincidences. A specific review, real-world setting or surprising change of emphasis can be much stronger than a list of different media.",
    "EDITORIAL QUALITY BAR: A scene must have an actual POINT, not merely announce a list of logged titles, a big total or a mix of genres. Ask what a specific recorded experience, opinion, documented choice or significant personal-baseline deviation reveals about THIS period. Develop a surprising, justified interpretation or a meaningful contrast. If you cannot earn a distinct insight from a fact, leave it out rather than manufacturing a slide. Avoid repetitive multi-cover catalog scenes.",
    "MEDIA VARIETY IS BASELINE, NOT A PLOT: FauxLore tracks practically every entertainment type, so using several titles, formats or genres on the same day is routine. Do not frame ordinary switching as chaos, indecision, restlessness, a genre identity crisis, a spectacle, or evidence of exceptional eclectic taste. Do not make a 'many doors/worlds/channels' concept, multi-genre list, or habitual switching the central thesis or recurring joke. Routine mixed-location logs are not automatically extraordinary either. Never infer psychological motives from mere co-occurrence.",
    "FOCUS AND ACTUAL CHANGE ARE MORE NEWSWORTHY: Only describe unusually narrow attention or an exceptional change in format if the evidence supplies an explicit historical comparison. A period can contain many background titles AND still be strikingly focused on one work or format. Lead with the real exception, not the ordinary background variety. Prioritize specific work reactions, notable reviews, factual personal journal moments, fresh developments and earned connections over media-count commentary.",
    "STORY-JOB FIRST: For every scene, decide the editorialJob BEFORE choosing a layout. Allowed jobs: hook, verdict, contrast, turning-point, pattern, data-reveal, place, reflection, payoff. Hook/Payoff are reserved for opening/closing. A verdict needs a real opinion, a turning-point needs temporal proof, data-reveal needs a verified analytic fact. Give each scene a distinct narrative PURPOSE; do not select layout for variety and retrofit a claim around it. Output editorialJob for each scene.",
    "FOUR PURPOSEFUL ANALYTIC STAGES: When a verified fact has an analytic kind, the Visual Director can stage shift (meaningful before/after format share), duel (genuine user/critic disagreement), arc (three verified monthly phases), or dominance (one unusually central work vs everything else). These are four DIFFERENT arguments, not four required chart skins. Only a story whose point really depends on the verified numbers should ask for data-reveal. If the emotional insight is more interesting, use cinematic or textual staging instead.",
    "DATA GATE IS NON-NEGOTIABLE: Infographics are NOT an obligatory scene format and should be rare. Only propose an outlier or taste chart when its provided verified bars represent a truly meaningful change, not a trivial 10-16 percentage-point fluctuation or a tiny critic-rating gap. Never repeat a previous conclusion in graphical form. A chart must reveal an extra insight that prose or a cinematic scene cannot communicate as well. Use zero charts when there is no genuinely strong comparison.",
    "CHART BUDGET: A weekly Wrapped may have at most 1 infographic/data scene, monthly at most 2, yearly at most 3. These are CEILINGS, not targets. Do not spend a chart slot merely for visual variety. A mild comparison can support prose without becoming a slide.",
    "EDITORIAL FUNCTION REPEAT GUARD: A single thematic finding may appear once as an argument. Two slides making the same point in different visual skins are invalid. Combine correlated format shifts (e.g. books up, games down) into ONE coherent editorial insight, not two charts. Distinct media reactions and arguments are welcome; different wording is NOT a different argument.",
    "MONTHLY COVERAGE: A monthly must not become an enlarged last-week Wrapped. The source contains verifiable month-early, month-middle and month-late fact cards (when those phases have activity). Cite each required substantial phase somewhere in the interior and support at least TWO separate scenes with phase-specific facts when at least two phases are substantive. Synthesize the entire month; don't make three obligatory diary chapters. If less than 60% of the month's normalized progress occurred in the final seven days, no more than half the interior scenes may rely ONLY on that final week. For years, sample across quarters rather than treating December as the whole year.",
    "EACH SLIDE MUST ADVANCE THE STORY: Give adjacent slides genuinely different jobs. The opening creates an evocative question, surprising incident or emotional setting; it must NOT already explain the same numerical comparison the very next scene will reveal. If a slide merely repeats the previous claim with a chart, merge them or find another meaningful observation. A big visual change alone does not count as a new idea. Reusing the same media in a different, genuinely revealing interpretation is fine.",
    "VISUAL-FIRST STORYTELLING: Every NON-INFOGRAPHIC scene will receive a new, original, full-bleed visual. Choose vivid, specific editorial moments and single-motif metaphors worthy of their own images. A reflective conclusion can remain spacious and quiet WHILE its closing tableau supplies the visual atmosphere. Only meaningful infographics stay image-free. Do not summarize a media inventory.",
    "Write original, vivid, sharply observant narration for EVERY slide. Never recycle the evidence text as prose. Start from a provocative idea, implication, absurd comparison or opinion, then earn it with selected facts. The user lived through the events and does NOT need a log read back to them.",
    "You choose which cards deserve scenes, their sequence, each scene's format and ALL new title/body/detail text. No fixed categories or obligatory stats. Vary tone, insight, intimacy, comedic escalation and pacing. Do not use the same headline work in every scene.",
    "SCENE FORMATS: insight=a defensible period-specific observation, spotlight=one meaningful title, outlier=verified personal-baseline comparison, location=a specific recorded place with an actually meaningful connection, journal=actual user quote, taste=verified user-versus-critic bars, return=logged comeback, timeline=verified chronological series, rhythm=activity pattern, opening=original hook, closing=earned memorable conclusion. Be selective; you do NOT need every type.",
    "DESIGN METADATA ONLY: For EVERY scene output design:{layout,palette,visual,align,mediaIds}. These legacy fields remain for compatibility and chart gating. A SEPARATE Visual Director will choose the text/focus placement for the generated full-bleed background or the clean infographic. Do not write a story to fill visual templates or inventory cover art.",
    "COMPATIBILITY LAYOUTS (not the final stage): cover-hero, split-feature, cover-wall, infographic, quote-poster, type-poster, timeline-film, editorial. The renderer never uses legacy media-cover walls in narrative Story Mode. Choose infographic ONLY for important verified data; all other legacy layout values are superseded by original full-bleed imagery.",
    "VISUALS: auto, cover, mosaic, bars, rings (circular comparisons), tiles (metric tiles), timeline, quote, none. Choosing bars/rings/tiles REQUIRES an outlier or taste source with verified bars. New verified analytic kinds (arc/dominance) may instead use layout:'infographic' with visual:'none' and editorialJob:'data-reveal'; the Visual Director will draw the factual analytics automatically. Choosing timeline REQUIRES a timeline source. Quote requires a journal source. Use art frequently where sourced; no generic stock images.",
    "PALETTES: violet, cobalt, amber, rose, emerald, cyan, monochrome. Use dramatic CONTRAST in a deliberate palette progression. Avoid endlessly repeating violet and the exact same layout on adjacent scenes. Typography, breathing room, large images and a few decisive numbers beat clutter.",
    "ARTWORK: Every NON-DATA slide receives an original AI-generated edge-to-edge illustration, including the opening, the literary/storytelling chapters and the final closing. Original media covers are reserved for the Deep Dive and for optional behind-the-scenes Codex style references; NEVER design a cover wall, poster strip, grid or media-cover inset in Wrapped Story Mode. design.mediaIds may cite exact media IDs from a scene's verified evidence only to inform the art direction. Opening/closing do not need media IDs.",
    "CLOSING TABLEAU: The final closing scene is a cinematic visual EPILOGUE, not a summary shelf. Write a memorable last thought that synthesizes the whole story, and describe ONE symbolic atmospheric final motif. No repeated franchise imagery, no poster cards, no official cover list. The next separate Achievement finale has its own dark-fantasy background and authentic achievement cards.",
    "The visual choice is important: if the point is a contrast, compose ONE evocative original illustration communicating tension, not two media posters; if it is one beloved work, use the source's Codex style for a NEW scene rather than enlarging the official cover; if it is a data anomaly, make verified numbers the focal point; if it is a quote, let the personal words breathe over an atmospheric visual. Never build a document page or a media-cover mosaic.",
    "The very first scene must be opening and the final scene closing. They are written by YOU, not generic 'Welcome'/'Next chapter' copy. Middle scenes cite 1-5 distinct IDs from the evidence cards. Choose at least TWO different facts across the whole story.",
    "For outlier or taste choose a source fact of the SAME kind with VERIFIED bars. For timeline cite a timeline fact with recorded events. For journal cite a journal fact, and the app will insert the EXACT user quote. YOU do not fabricate numbers, bars, dates, media titles, quotes, emotions, spoilers or user activity. Bold interpretations and fictional rhetorical accusations are welcome but they must not masquerade as factual evidence.",
    "MONTH-CLUSTER STORY PLANNING: On monthly issues examine the early/middle/late CLUSTERS with their top actual works, relative progress shares, logged locations and genuine journal excerpts. Build links between phases when they are earned. A phase card alone is not a story. Choose points that show how the full month felt or genuinely changed, rather than assigning a genre to each third or narrating merely that different media appeared.",
    "WEEKS tend to reward intimate oddities; MONTHS patterns and contradictions; YEARS larger arcs and contrasts. These are options, not a formula.",
    "Target " + targets[evidence.timeframe] + " scenes INCLUDING opening and closing. It may be shorter if the evidence cannot support them. Minimum is 3. Quality beats quota.",
    "The voice uses original ENGLISH and the selected persona. No canned AI phrases, obligatory big moral lesson, list of numerical records, or generic dramatic clichés. You are an opinionated storyteller, not a productivity coach.",
    "Respond ONLY as JSON: {\"title\":\"an original issue title\",\"dek\":\"an independent hook\",\"scenes\":[{\"kind\":\"opening\",\"editorialJob\":\"hook\",\"eyebrow\":\"SYSTEM NOTICE\",\"title\":\"an original title\",\"body\":\"new narration\",\"evidenceIds\":[],\"design\":{\"layout\":\"cover-hero\",\"palette\":\"cobalt\",\"visual\":\"cover\",\"align\":\"left\",\"mediaIds\":[]}},{\"kind\":\"insight\",\"editorialJob\":\"pattern\",\"eyebrow\":\"A STRANGE PATTERN\",\"title\":\"an original insight\",\"body\":\"new interpretation\",\"evidenceIds\":[\"existing-fact-id\"],\"design\":{\"layout\":\"editorial\",\"palette\":\"emerald\",\"visual\":\"none\",\"align\":\"left\",\"mediaIds\":[]}},{\"kind\":\"closing\",\"editorialJob\":\"payoff\",\"eyebrow\":\"FINALE\",\"title\":\"a memorable ending\",\"body\":\"the original payoff\",\"evidenceIds\":[],\"design\":{\"layout\":\"cover-hero\",\"palette\":\"rose\",\"visual\":\"none\",\"align\":\"center\",\"mediaIds\":[]}}]}. Example is SHAPE ONLY; select different layouts, sources and text based on the data.",
    "Do not output chart values, images or literal quotes; these are supplied from the cited fact records. Inside JSON use plain strings, no Markdown.",
  ].join('\n');
  const user = [
    'TIMEFRAME ' + evidence.timeframe + ' ' + evidence.timeId + ': ' + evidence.bounds.start + ' to ' + evidence.bounds.end,
    'EDITORIAL BASELINE CALIBRATION (these rules override any temptation to call ordinary switching unusual):\n' + evidence.editorialCalibration,
    evidence.monthlyCoverage ?
      'MONTH COVERAGE CONTRACT AND VERIFIED SUBPHASE CLUSTERS (substantive scenes need evidenceIds and concrete insights, not artificial phase symmetry):\n' +
      JSON.stringify(evidence.monthlyCoverage) : '',
    'VERIFIED EVIDENCE CARDS:\n' + JSON.stringify(evidence.facts.map(f => ({
      id: f.id, kind: f.kind, title: f.title, evidence: f.evidence, phase: f.phase || null, recentOnly: !!f.recentOnly,
      analyticKind: f.analytic?.kind || null,
      mediaIds: [...(f.mediaId ? [f.mediaId] : []), ...(f.mediaIds || [])], hasBars: !!f.bars?.length, hasTimeline: !!f.beats?.length, hasQuote: !!f.quote,
    }))),
    'MEDIA REFERENCE (personal ratings/reviews are present only when recorded by the period end):\n' + JSON.stringify(evidence.media),
    // Older persisted stories may themselves contain opinions written in later weeks.
    // Never reintroduce them as reference material during a historical reroll.
  ].filter(Boolean).join('\n\n');
  let lastFailure = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await apiFetch('/api/nano-gpt/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-nano-gpt-key': apiKey },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini', temperature: 1.05,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user + (lastFailure ? '\n\nThe last output failed structural validation: ' + lastFailure + '. Correct it and return a complete story.' : '') }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!result.ok) throw new Error('Wrapped AI failed (' + result.status + '): ' + (await result.text()).slice(0, 250));
    const data = await result.json();
    const answer = data.choices?.[0]?.message?.content;
    if (typeof answer !== 'string') throw new Error('Wrapped Director returned no story');
    try {
      const story = normalizeWrappedStory(parseJson(answer), evidence, media);
      // A second, independent creative call composes only selected visual
      // highlights. Any failure falls back to the already valid story layouts.
      return await generateWrappedVisualCompositions({ story, apiKey, model, timeframe: evidence.timeframe });
    } catch (err: any) { lastFailure = err?.message || 'Invalid story'; }
  }
  throw new Error('Wrapped Director failed validation twice: ' + lastFailure);
}
