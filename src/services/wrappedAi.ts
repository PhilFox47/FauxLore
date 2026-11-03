import { apiFetch } from './db';
import { generateWrappedVisualCompositions } from './wrappedVisualDirector';
import { getPersonaDescription } from '../lib/personas';
import type { MediaItem } from '../types/schema';
import type { WrappedEvidence, WrappedFact } from '../lib/wrappedEvidence';
import type { StoryScene, StoryKind, StoryDesign, StoryLayout, StoryPalette, StoryVisual } from '../lib/storyDiscovery';

export interface WrappedStory {
  version: 2;
  title: string;
  dek: string;
  scenes: (StoryScene & { evidenceIds: string[] })[];
  generatedAt?: string;
  /** Separate image asset, never part of AI-authored story JSON. */
  coverArtUrl?: string | null;
  coverArtStatus?: 'pending' | 'generating' | 'done' | 'failed' | null;
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
    const permittedIds = new Set(
      (kind === 'opening' || kind === 'closing' ? evidence.media.map(m => m.id) :
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
      kind,
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
  return { version: 2, title: clean(data.title, 180) || scenes[0].title,
    dek: clean(data.dek, 500) || scenes[0].body.slice(0, 350), scenes };
}

export async function generateAiWrapped(args: {
  apiKey: string; model: string; persona?: string; evidence: WrappedEvidence;
  media: MediaItem[]; previous?: WrappedStory | null;
}): Promise<WrappedStory> {
  const { apiKey, model, persona, evidence, media, previous } = args;
  const targets = { week: '4-6', month: '6-9', year: '9-14' };
  const system = [
    "You are the AI STORY DIRECTOR for FauxLore Wrapped. Create an entirely NEW, standalone, deeply personalized, cinematic story from the user's media history. " + getPersonaDescription(persona),
    "This is NOT a recap reformat. You do NOT have the recap text, recap chapters or recap awards. Invent an independent editorial perspective from the raw evidence. A reader who has ALREADY READ their recap should discover NEW thoughts here.",
    "The cards are VERIFIED RAW MATERIAL, not a mandatory outline. Privately examine many different possible stories, select the most surprising and revealing connections, and invent an editorial arc. Unusual location-media coincidences, odd journal lines, cross-media taste contradictions and small human details can be more interesting than the biggest statistics.",
    "Write original, vivid, sharply observant narration for EVERY slide. Never recycle the evidence text as prose. Start from a provocative idea, implication, absurd comparison or opinion, then earn it with selected facts. The user lived through the events and does NOT need a log read back to them.",
    "You choose which cards deserve scenes, their sequence, each scene's format and ALL new title/body/detail text. No fixed categories or obligatory stats. Vary tone, insight, intimacy, comedic escalation and pacing. Do not use the same headline work in every scene.",
    "SCENE FORMATS: insight=opinion, spotlight=one title, outlier=verified long-term comparison, location=place/media crossover, journal=actual user quote, taste=verified user-versus-critic bars, return=logged comeback, timeline=verified chronological series, rhythm=activity pattern, opening=original hook, closing=earned memorable conclusion. Be selective; you do NOT need every type.",
    "YOU ARE ALSO THE VISUAL ART DIRECTOR. You control a SAFE SCENE COMPOSITION VOCABULARY, not HTML/CSS. For EVERY scene output design:{layout,palette,visual,align,mediaIds}. Choose its layout individually based on its IDEA, not on its scene kind. Make the issue feel art-directed and surprising, not like one identical dark card after another.",
    "LAYOUTS: cover-hero = huge full-bleed artwork with a cinematic title; split-feature = asymmetric large cover and editorial copy; cover-wall = art mosaic of related media; infographic = distinctive graphical analysis; quote-poster = huge readable user quotation; type-poster = bold typographic statement; timeline-film = cinematic sequences of events; editorial = beautifully composed long-form commentary. You may combine a layout with supporting visuals from the cited facts. Use at least THREE DIFFERENT layouts if there are five or more scenes.",
    "VISUALS: auto, cover, mosaic, bars, rings (circular comparisons), tiles (metric tiles), timeline, quote, none. Choosing bars/rings/tiles REQUIRES an outlier or taste source with verified bars. Choosing timeline REQUIRES a timeline source. Quote requires a journal source. Use art frequently where sourced; no generic stock images.",
    "PALETTES: violet, cobalt, amber, rose, emerald, cyan, monochrome. Use dramatic CONTRAST in a deliberate palette progression. Avoid endlessly repeating violet and the exact same layout on adjacent scenes. Typography, breathing room, large images and a few decisive numbers beat clutter.",
    "ARTWORK: design.mediaIds must contain ONLY exact media IDs grounded by this scene's cited evidence cards (or any listed active media on the opening/closing). The app resolves original covers; never emit URLs. Location and crossover fact cards can supply multiple related media IDs for a mosaic. Up to six covers.",
    "The visual choice is important: if the point is 'two creators battling for attention', choose an asymmetrical split or visual contrast; if it is one beloved work, make the actual cover enormous; if it's a data anomaly, make the data the focal point; if it's a quote, give the quote room to breathe. Don't let every scene look like a document page.",
    "The very first scene must be opening and the final scene closing. They are written by YOU, not generic 'Welcome'/'Next chapter' copy. Middle scenes cite 1-5 distinct IDs from the evidence cards. Choose at least TWO different facts across the whole story.",
    "For outlier or taste choose a source fact of the SAME kind with VERIFIED bars. For timeline cite a timeline fact with recorded events. For journal cite a journal fact, and the app will insert the EXACT user quote. YOU do not fabricate numbers, bars, dates, media titles, quotes, emotions, spoilers or user activity. Bold interpretations and fictional rhetorical accusations are welcome but they must not masquerade as factual evidence.",
    "WEEKS tend to reward intimate oddities; MONTHS patterns and contradictions; YEARS larger arcs and contrasts. These are options, not a formula.",
    "Target " + targets[evidence.timeframe] + " scenes INCLUDING opening and closing. It may be shorter if the evidence cannot support them. Minimum is 3. Quality beats quota.",
    "The voice uses original ENGLISH and the selected persona. No canned AI phrases, obligatory big moral lesson, list of numerical records, or generic dramatic clichés. You are an opinionated storyteller, not a productivity coach.",
    "Respond ONLY as JSON: {\"title\":\"an original issue title\",\"dek\":\"an independent hook\",\"scenes\":[{\"kind\":\"opening\",\"eyebrow\":\"SYSTEM NOTICE\",\"title\":\"an original title\",\"body\":\"new narration\",\"evidenceIds\":[],\"design\":{\"layout\":\"cover-hero\",\"palette\":\"cobalt\",\"visual\":\"cover\",\"align\":\"left\",\"mediaIds\":[]}},{\"kind\":\"insight\",\"eyebrow\":\"A STRANGE PATTERN\",\"title\":\"an original insight\",\"body\":\"new interpretation\",\"evidenceIds\":[\"existing-fact-id\"],\"design\":{\"layout\":\"editorial\",\"palette\":\"emerald\",\"visual\":\"none\",\"align\":\"left\",\"mediaIds\":[]}},{\"kind\":\"closing\",\"eyebrow\":\"FINALE\",\"title\":\"a memorable ending\",\"body\":\"the original payoff\",\"evidenceIds\":[],\"design\":{\"layout\":\"type-poster\",\"palette\":\"rose\",\"visual\":\"none\",\"align\":\"center\",\"mediaIds\":[]}}]}. Example is SHAPE ONLY; select different layouts, sources and text based on the data.",
    "Do not output chart values, images or literal quotes; these are supplied from the cited fact records. Inside JSON use plain strings, no Markdown.",
  ].join('\n');
  const user = [
    'TIMEFRAME ' + evidence.timeframe + ' ' + evidence.timeId + ': ' + evidence.bounds.start + ' to ' + evidence.bounds.end,
    'VERIFIED EVIDENCE CARDS:\n' + JSON.stringify(evidence.facts.map(f => ({
      id: f.id, kind: f.kind, title: f.title, evidence: f.evidence, mediaIds: [...(f.mediaId ? [f.mediaId] : []), ...(f.mediaIds || [])], hasBars: !!f.bars?.length, hasTimeline: !!f.beats?.length, hasQuote: !!f.quote,
    }))),
    'MEDIA REFERENCE:\n' + JSON.stringify(evidence.media),
    previous ? 'PREVIOUS WRAPPED VERSION: Avoid recycling its ideas or punchlines:\n' + previous.scenes.map(s => s.title + ' / ' + s.body.slice(0, 200)).join('\n') : '',
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
      return await generateWrappedVisualCompositions({ story, apiKey, model });
    } catch (err: any) { lastFailure = err?.message || 'Invalid story'; }
  }
  throw new Error('Wrapped Director failed validation twice: ' + lastFailure);
}
