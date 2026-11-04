import { apiFetch } from './db';
import { generateWrappedVisualCompositions } from './wrappedVisualDirector';
import { getPersonaDescription, getPersonaEditorialFreedom } from '../lib/personas';
import { wrappedEditorialMemoryBrief, recycledWrappedThesis } from '../lib/wrappedEditorialMemory';
import type { WrappedEditorialMemoryItem } from '../lib/wrappedEditorialMemory';
import { curateWrappedTheses } from '../lib/wrappedThesisGate';
import { enforceWrappedFinale, finaleModes } from '../lib/wrappedFinale';
import { wrappedPacingBudget } from '../lib/wrappedPacing';
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
      ...(clean(item?.thesis, 330) ? { editorialThesis: clean(item.thesis, 330) } : {}),
      ...(kind === 'closing' && finaleModes.some(mode => mode === item?.finaleMode)
        ? { finaleMode: item.finaleMode } : {}),
      ...(kind === 'closing' && clean(item?.finalePayoff, 450)
        ? { finalePayoff: clean(item.finalePayoff, 450) } : {}),
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
  // One exceptionally meaningful source can support a lean three-scene
  // story (hook, one argument, final judgment). Require multiple independent
  // sources only once the Director has chosen multiple interior chapters.
  if (new Set(refs).size < (scenes.length === 3 ? 1 : 2)) {
    throw new Error('Story needs independently verified factual anchors for its chosen scene count');
  }
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
      // In a deliberately short issue, other phases must not force filler
      // merely because they contained a high *quantity* of low-signal logs.
      // However, an actual journal, written memory or explicit resonance
      // signal in another phase still deserves editorial acknowledgment.
      const mandatoryPhases = middleScenes.length === 1
        ? coverage.requiredPhases.filter(phase => evidence.facts.some(f =>
          f.phase === phase && (f.kind === 'journal' ||
            f.id.startsWith('reference-') || f.id.startsWith('session-resonance-'))))
        : coverage.requiredPhases;
      const missing = mandatoryPhases.filter(phase => !seen.has(phase));
      // A carefully argued ONE-scene cross-phase story is valid. Otherwise,
      // multiple genuinely distinct interior scenes must cover multiple
      // substantial phases; don't let several late-only scenes impersonate a
      // full-month story. This preserves coverage without a scene quota.
      const requiredSceneCount = Math.min(coverage.minPhaseScenes, middleScenes.length);
      if (missing.length || phaseSceneCount < requiredSceneCount) {
        throw new Error('Monthly coverage missing ' + missing.join(', ') +
          (missing.length ? ' phase(s)' : ' independent phase-supported scenes') +
          '. A single substantial cross-phase argument may cover the month without invented filler.');
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
  editorialMemory?: WrappedEditorialMemoryItem[];
}): Promise<WrappedStory> {
  const { apiKey, model, persona, evidence, media } = args;
  const editorialMemory = args.editorialMemory || [];
  const pacing = wrappedPacingBudget(evidence);
  const system = [
    "You are the AI STORY DIRECTOR for FauxLore Wrapped. Create an entirely NEW, standalone, deeply personalized, cinematic story from the user's media history. " + getPersonaDescription(persona),
    "This is NOT a recap reformat. You do NOT have the recap text, recap chapters or recap awards. Invent an independent editorial perspective from the raw evidence. A reader who has ALREADY READ their recap should discover NEW thoughts here.",
    getPersonaEditorialFreedom(persona),
    "ARCHIVAL REDACTION: Old Wrapped opinions are MEMORY OF WHAT YOU ALREADY SAID, NOT EVIDENCE OF WHAT THE PLAYER ACTUALLY DID. You may mock your past bad judgment, develop a real NEW twist or strongly disagree with your former verdict, but don't repackage an earlier insight under a new title. Only the current verified Evidence Cards establish historical actions or user statements.",
    "The cards are VERIFIED RAW MATERIAL, not a mandatory outline. Find the most distinctive period-specific experiences, user opinions, significant deviations from personal norms and meaningful coincidences. A specific review, real-world setting or surprising change of emphasis can be much stronger than a list of different media.",
    "SOURCE HIERARCHY: Journal Thoughts contain the player's considered emotional reactions, interpretations and reflections. These are PRIMARY narrative evidence. Impact ratings and Moodlets are personal-significance clues. Ratings/reviews and genuine contrasts also matter. Session Notes, by contrast, are ORGANIZATIONAL BOOKMARKS (issue numbers, chapters, minor plot beats, who accompanied the session). Notes are context, NOT judgments, NOT proof that a referenced plot fight mattered to the player, and NOT grounds for a dedicated slide. A comic note saying 'Porcupine fight' is a page-position reminder, not an emotional highlight. Read Journals FIRST; use Notes only if necessary to clarify a meaningful independently supported point.",
    "REFLECTION OVER RECEIPTS: The player already knows which issue, chapter, episode or opponent they encountered. A beat-by-beat plot recap or inventory of issue numbers is a FAILURE even if every detail is true. A 5/5 Moving/Social Journal about a Free Company finishing an important story is powerful because of the player's personal meaning, NOT because it includes a quantified session rating or a long list of activities.",
    "RESONANCE OVER EXPOSURE: Master Pages measure logged consumption, NOT personal significance. Consider the separate EDITORIAL SALIENCE section before choosing protagonists. A title with one 5/5-impact session may deserve more story than the top Master Page title with repeated passing-time/1-impact sessions. Also do not treat all high-impact scenes as obligatory: earn a specific angle. Important minority titles should be considered even if absent from the progress top three. Never equate a high enjoyment score with high impact, nor assume unscored sessions were unimportant.",
    "QUICK MOODLETS are user-selected descriptions of individual experiences. Immersed means deeply focused; Distracted means attention was divided; Just Passing Time means a casual time-filler; Unwinding means relaxing/comforting. A title can have contradictory sessions. Quote exact mood patterns and high-impact contrasts accurately, but never diagnose the user, guess an unrecorded emotional state, or extrapolate one session mood to the full work.",
    "EDITORIAL THESIS CONTRACT: BEFORE writing each middle scene, choose ONE evidence-backed editorial thesis, write it explicitly as the scene's thesis field (24-330 characters), then make the body ARGUE for that interpretation using its evidenceIds. The thesis must be an opinionated, provocative and testable READING of the user's documented actions, not 'X was logged', 'there were N Master Pages' or a generic observation that the month had variety. This is an AI Dungeon System's judgment: confidently overinterpret for comedy, roast, exaggerate, or take a bold position; do NOT invent a specific actual event, speech, feeling or meeting that isn't in evidence. Never hedge a take to death. Two scenes cannot have the same thesis in different words.",
    "QUALITY FILTER: A citation is NECESSARY but does not make a slide WORTH READING. Slides need a DISTINCT editorial TRANSFER: opinion, funny unfair verdict, contradiction, interpretation or unexpected connection that could not be replaced with 'and then X happened'. Strong Journals and explicit impact may inform these takes. Neither Notes, chapter/issue inventories, minor in-fiction fights nor plain completion counts earn a chapter on their own. Cut these scenes rather than padding. If a paragraph merely rephrases its evidence card, it fails. One great insight is worth more than three accurate bookkeeping reports. The opening sets up an angle; the closing changes the reader's perspective instead of recapping.",
    "EDITORIAL QUALITY BAR: Every scene should leave the reader with a thought they did not bring into the recap. Write about WHY the logged experience is interesting and YOUR take on it, not WHAT happened in every fictional issue. The Dungeon AI can accuse the player of absurd priorities with absolute conviction, but it cannot mistake organizational Notes for the user's opinion. The story is about the person's relationship with media, not a synopsis of the media itself. Evidence should occupy only the space needed to deliver the argument. Weak source-backed scenes are still weak; CUT them.",
    "MEDIA VARIETY IS BASELINE, NOT A PLOT: FauxLore tracks practically every entertainment type, so using several titles, formats or genres on the same day is routine. Do not frame ordinary switching as chaos, indecision, restlessness, a genre identity crisis, a spectacle, or evidence of exceptional eclectic taste. Do not make a 'many doors/worlds/channels' concept, multi-genre list, or habitual switching the central thesis or recurring joke. Routine mixed-location logs are not automatically extraordinary either. Never infer psychological motives from mere co-occurrence.",
    "FOCUS AND ACTUAL CHANGE ARE MORE NEWSWORTHY: Only describe unusually narrow attention or an exceptional change in format if the evidence supplies an explicit historical comparison. A period can contain many background titles AND still be strikingly focused on one work or format. Lead with the real exception, not the ordinary background variety. Prioritize specific work reactions, notable reviews, factual personal journal moments, fresh developments and earned connections over media-count commentary.",
    "STORY-JOB FIRST: For every scene, decide the editorialJob BEFORE choosing a layout. Allowed jobs: hook, verdict, contrast, turning-point, pattern, data-reveal, place, reflection, payoff. Hook/Payoff are reserved for opening/closing. A verdict needs a real opinion, a turning-point needs temporal proof, data-reveal needs a verified analytic fact. Give each scene a distinct narrative PURPOSE; do not select layout for variety and retrofit a claim around it. Output editorialJob for each scene.",
    "FOUR PURPOSEFUL ANALYTIC STAGES: When a verified fact has an analytic kind, the Visual Director can stage shift (meaningful before/after format share), duel (genuine user/critic disagreement), arc (three verified monthly phases), or dominance (one unusually central work vs everything else). These are four DIFFERENT arguments, not four required chart skins. Only a story whose point really depends on the verified numbers should ask for data-reveal. If the emotional insight is more interesting, use cinematic or textual staging instead.",
    "DATA GATE IS NON-NEGOTIABLE: Infographics are NOT an obligatory scene format and should be rare. Only propose an outlier or taste chart when its provided verified bars represent a truly meaningful change, not a trivial 10-16 percentage-point fluctuation or a tiny critic-rating gap. Never repeat a previous conclusion in graphical form. A chart must reveal an extra insight that prose or a cinematic scene cannot communicate as well. Use zero charts when there is no genuinely strong comparison.",
    "CHART BUDGET: A weekly Wrapped may have at most 1 infographic/data scene, monthly at most 2, yearly at most 3. These are CEILINGS, not targets. Do not spend a chart slot merely for visual variety. A mild comparison can support prose without becoming a slide.",
    "EDITORIAL FUNCTION REPEAT GUARD: A single thematic finding may appear once as an argument. Two slides making the same point in different visual skins are invalid. Combine correlated format shifts (e.g. books up, games down) into ONE coherent editorial insight, not two charts. Distinct media reactions and arguments are welcome; different wording is NOT a different argument.",
    "MONTHLY COVERAGE WITHOUT QUOTAS: A month is a full period, not an enlarged last-week Wrapped. For substantial verified early/middle/late phases, acknowledge the required dates and facts, but they can form ONE well-argued cross-phase contrast instead of obligatory individual chapters. If there are 2+ interior scenes and 2+ substantial phases, use at least two independently evidenced moments; for a genuinely lean one-interior-scene issue, a single scene may meaningfully connect multiple phases with multiple verified facts. Do not stretch a weak month just to mechanically visit every third. If less than 60% of recorded progress falls in the final week, do not make almost every interior slide late-week-only. For years, select worthwhile moments across the year rather than forcing quarterly chapters.",
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
    "UNPREDICTABLE FINALE: The closing is NOT a summary, not a moral lesson, and does NOT have to be tender or emotional. Pick the SINGLE finaleMode that this particular issue EARNS: dungeon-verdict (imperious judgment), sharp-reversal (the evidence turns an earlier expectation upside down), ruthless-roast (outrageously confident personal insult grounded in actual logs), earned-sincerity (a rare unexpected serious moment), absurd-callback (a precise earlier detail weaponized for a fresh laugh), unsettling-question (an uncomfortable specific unanswered question), unexpected-connection (a revealing new link between real events), or defiant-last-word (the AI doubles down on its controversial opinion). They are alternatives, NOT required beats, not a sequence and NEVER a deterministic rotation. Choose based on distinctive facts and the issue's actual dramatic arc.",
    "FINALE PAYOFF CONTRACT: The closing must include finaleMode, finalePayoff (a concrete NEW 40–450 character punchline, reversal, insight or sting), and evidenceIds with 1–5 REAL evidence cards. At least one closing card must ALSO support an interior scene that survives your script. Do not invent an ending event, emotional reaction or quote. It is fine for a Dungeon AI to offer a confident, outrageous INTERPRETATION of documented events. The finale's final statement should be visibly delivered in its actual body, not just metadata. No 'Leave the light on', 'the story continues', doors left ajar, seams, threads, lamps or generic forward-looking pep-talk endings. NEVER simply reiterate the previous slide's thesis with grander language.",
    "FINALE IMAGE: The closing is still a single cinematic image, but it illustrates the SELECTED finaleMode. It can be grotesque, triumphant, confrontational, playful, visually absurd, accusatory or unexpectedly quiet. Do not default to empty horizon, poetic afterglow, sunsets or a solitary reflective portrait. The separate achievement-finale is not this story's closing and must remain intact.",
    "The visual choice is important: if the point is a contrast, compose ONE evocative original illustration communicating tension, not two media posters; if it is one beloved work, use the source's Codex style for a NEW scene rather than enlarging the official cover; if it is a data anomaly, make verified numbers the focal point; if it is a quote, let the personal words breathe over an atmospheric visual. Never build a document page or a media-cover mosaic.",
    "The very first scene must be opening and the final scene closing. They are written by YOU, not generic 'Welcome'/'Next chapter' copy. Middle scenes cite 1-5 distinct IDs from the evidence cards. Choose at least TWO different facts across the whole story.",
    "For outlier or taste choose a source fact of the SAME kind with VERIFIED bars. For timeline cite a timeline fact with recorded events. For journal cite a journal fact, and the app will insert the EXACT user quote. YOU do not fabricate numbers, bars, dates, media titles, quotes, emotions, spoilers or user activity. Bold interpretations and fictional rhetorical accusations are welcome but they must not masquerade as factual evidence.",
    "MONTH-CLUSTER STORY PLANNING: On monthly issues examine the early/middle/late CLUSTERS with their top actual works, relative progress shares, logged locations and genuine journal excerpts. Build links between phases when they are earned. A phase card alone is not a story. Choose points that show how the full month felt or genuinely changed, rather than assigning a genre to each third or narrating merely that different media appeared.",
    "WEEKS tend to reward intimate oddities; MONTHS patterns and contradictions; YEARS larger arcs and contrasts. These are options, not a formula.",
    "MATERIAL-RESPONSIVE PACING: The supplied verified source has " + pacing.meaningfulAnchors + " independently useful editorial anchors, including " + pacing.deepMoments + " written personal moments. On this evidence, around " + pacing.suggestedMax + " total scenes is a generous editorial budget, NOT A TARGET. Absolute technical maximum is " + pacing.hardMax + " including opening/closing. Choose as few as 3 if only ONE powerful insight is earned. Even a rich period may deserve a very tight story. Each interior scene NEEDS its own thesis and source cards. Do not add an infographic or filler scene to hit a count.",
    "PROSE PACING: Let each scene EARN its word count. One poisonous one-liner may be only 15–35 words, an incisive argument can take 45–85, and a truly consequential journal/relationship/turning-point beat may need 90–165+ words. Do NOT make every slide the same length. When the lived detail deserves space, develop it with specific source-backed examples and a second thought rather than ending after three vague sentences. A short punchline must still convey a real idea; a longer passage must not restate itself. Keep titles concise enough to fit a cinematic stage, allow natural paragraph breaks in body, and vary rhythm aggressively.",
    "The voice uses original ENGLISH and the selected persona. No canned AI phrases, obligatory big moral lesson, list of numerical records, or generic dramatic clichés. You are an opinionated storyteller, not a productivity coach.",
    "Each interior scene must include a 'thesis' string explicitly defending a different, substantive opinion or surprising interpretation. The same claim must be developed in that scene's body, not just written in invisible metadata. The final scene must also carry the chosen finaleMode and finalePayoff in addition to one or more evidenceIds.",
    "Respond ONLY as JSON: {\"title\":\"an original issue title\",\"dek\":\"an independent hook\",\"scenes\":[{\"kind\":\"opening\",\"editorialJob\":\"hook\",\"eyebrow\":\"SYSTEM NOTICE\",\"title\":\"an original title\",\"body\":\"new narration\",\"evidenceIds\":[],\"design\":{\"layout\":\"cover-hero\",\"palette\":\"cobalt\",\"visual\":\"cover\",\"align\":\"left\",\"mediaIds\":[]}},{\"kind\":\"insight\",\"editorialJob\":\"pattern\",\"thesis\":\"a concrete, source-backed, daring interpretation rather than a log count\",\"eyebrow\":\"A STRANGE PATTERN\",\"title\":\"an original insight\",\"body\":\"new interpretation\",\"evidenceIds\":[\"existing-fact-id\"],\"design\":{\"layout\":\"editorial\",\"palette\":\"emerald\",\"visual\":\"none\",\"align\":\"left\",\"mediaIds\":[]}},{\"kind\":\"closing\",\"editorialJob\":\"payoff\",\"finaleMode\":\"sharp-reversal\",\"finalePayoff\":\"a distinct evidence-backed reversal rather than repeating the previous argument\",\"eyebrow\":\"FINALE\",\"title\":\"a memorable ending\",\"body\":\"a concrete final turn supported by surviving story evidence\",\"evidenceIds\":[\"existing-fact-id\"],\"design\":{\"layout\":\"cover-hero\",\"palette\":\"rose\",\"visual\":\"none\",\"align\":\"center\",\"mediaIds\":[]}}]}. Example is SHAPE ONLY; source IDs, modes, scene counts, lengths, copy and arguments must vary by real data.",
    "Do not output chart values, images or literal quotes; these are supplied from the cited fact records. Inside JSON use plain strings, no Markdown.",
  ].join('\n');
  const user = [
    'TIMEFRAME ' + evidence.timeframe + ' ' + evidence.timeId + ': ' + evidence.bounds.start + ' to ' + evidence.bounds.end,
    'EDITORIAL BASELINE CALIBRATION (these rules override any temptation to call ordinary switching unusual):\n' + evidence.editorialCalibration,
    'EDITORIAL SALIENCE (independent of progress volume; give low-volume strong-impact candidates real consideration):\n' + evidence.editorialSalience,
    'PRIOR WRAPPED EDITORIAL MEMORY (opinions already explored in STRICTLY EARLIER non-overlapping periods, plus optional same-period old rerun; DO NOT treat them as factual evidence or insert events from another time):\n' +
      wrappedEditorialMemoryBrief(editorialMemory),
    evidence.monthlyCoverage ?
      'MONTH COVERAGE CONTRACT AND VERIFIED SUBPHASE CLUSTERS (substantive scenes need evidenceIds and concrete insights, not artificial phase symmetry):\n' +
      JSON.stringify(evidence.monthlyCoverage) : '',
    'PRIMARY VERIFIED EVIDENCE CARDS (reflective Journal Thoughts are first-class; no organizational Notes are standalone evidence cards):\n' + JSON.stringify(evidence.facts.map(f => ({
      id: f.id, kind: f.kind, title: f.title, evidence: f.evidence, phase: f.phase || null, recentOnly: !!f.recentOnly,
      analyticKind: f.analytic?.kind || null,
      mediaIds: [...(f.mediaId ? [f.mediaId] : []), ...(f.mediaIds || [])], hasBars: !!f.bars?.length, hasTimeline: !!f.beats?.length, hasQuote: !!f.quote,
    }))),
    'ORGANIZATIONAL SESSION NOTES, BACKGROUND ONLY (not personal reviews, not importance signals, NEVER standalone evidence IDs; use only to identify a chapter/person/plot event when an independent supported insight needs that context):\n' +
      JSON.stringify(evidence.backgroundNotes || []),
    'MEDIA REFERENCE (personal ratings/reviews are present only when recorded by the period end):\n' + JSON.stringify(evidence.media),
    // Past editorial snapshots are supplied separately above, period-filtered
    // and marked as prior *opinions*, never factual source evidence.
    // The current period's verified cards remain the ONLY event receipts.
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
      // Delete weak or duplicated scenes rather than spending costly image
      // generation on filler. Existing saved stories remain backwards-compatible.
      const curated = curateWrappedTheses(parseJson(answer), evidence);
      const repeated = recycledWrappedThesis(curated.draft.scenes, editorialMemory);
      if (repeated) throw new Error('Recycled an earlier Wrapped argument instead of finding a new interpretation: '+repeated);
      const withFinale = enforceWrappedFinale(curated.draft, evidence);
      const story = normalizeWrappedStory(withFinale, evidence, media);
      // A second, independent creative call composes only selected visual
      // highlights. Any failure falls back to the already valid story layouts.
      return await generateWrappedVisualCompositions({ story, apiKey, model, timeframe: evidence.timeframe });
    } catch (err: any) { lastFailure = err?.message || 'Invalid story'; }
  }
  throw new Error('Wrapped Director failed validation twice: ' + lastFailure);
}
