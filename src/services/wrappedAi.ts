import { apiFetch } from './db';
import { getPersonaDescription } from '../lib/personas';
import type { MediaItem } from '../types/schema';
import type { WrappedEvidence, WrappedFact } from '../lib/wrappedEvidence';
import type { StoryScene, StoryKind } from '../lib/storyDiscovery';

export interface WrappedStory {
  version: 2;
  title: string;
  dek: string;
  scenes: (StoryScene & { evidenceIds: string[] })[];
  generatedAt?: string;
}
const kinds = new Set<StoryKind>(['opening','insight','outlier','location','journal','spotlight','taste','return','timeline','rhythm','closing']);
const limit = { week: 6, month: 9, year: 14 };
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
    const selectedMedia = facts.find(f => f.mediaId);
    const itemMedia = selectedMedia?.mediaId ? mediaIndex.get(selectedMedia.mediaId) : undefined;
    return {
      id: 'wrapped-' + index,
      kind,
      title, body, eyebrow: clean(item?.eyebrow, 90) || 'YOUR STORY',
      evidenceIds: refs, detail: clean(item?.detail, 1200) || undefined,
      sourceLabel: facts[0]?.title || 'Your activity',
      ...(itemMedia ? { media: { id: itemMedia.id, title: itemMedia.title, type: itemMedia.mediaType, cover: itemMedia.coverImageUrl } } : {}),
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
    "The very first scene must be opening and the final scene closing. They are written by YOU, not generic 'Welcome'/'Next chapter' copy. Middle scenes cite 1-5 distinct IDs from the evidence cards. Choose at least TWO different facts across the whole story.",
    "For outlier or taste choose a source fact of the SAME kind with VERIFIED bars. For timeline cite a timeline fact with recorded events. For journal cite a journal fact, and the app will insert the EXACT user quote. YOU do not fabricate numbers, bars, dates, media titles, quotes, emotions, spoilers or user activity. Bold interpretations and fictional rhetorical accusations are welcome but they must not masquerade as factual evidence.",
    "WEEKS tend to reward intimate oddities; MONTHS patterns and contradictions; YEARS larger arcs and contrasts. These are options, not a formula.",
    "Target " + targets[evidence.timeframe] + " scenes INCLUDING opening and closing. It may be shorter if the evidence cannot support them. Minimum is 3. Quality beats quota.",
    "The voice uses original ENGLISH and the selected persona. No canned AI phrases, obligatory big moral lesson, list of numerical records, or generic dramatic clichés. You are an opinionated storyteller, not a productivity coach.",
    "Respond ONLY as JSON: {\"title\":\"original name\",\"dek\":\"independent one-line hook\",\"scenes\":[{\"kind\":\"opening\",\"eyebrow\":\"short label\",\"title\":\"fresh opening\",\"body\":\"your original narration\",\"evidenceIds\":[]},{\"kind\":\"insight\",\"eyebrow\":\"short label\",\"title\":\"your own title\",\"body\":\"insight not log summary\",\"detail\":\"optional new flourish\",\"evidenceIds\":[\"real-fact-id\"]},{\"kind\":\"closing\",\"eyebrow\":\"finale label\",\"title\":\"fresh ending\",\"body\":\"earned payoff\",\"evidenceIds\":[]}]}",
    "Do not output chart values, images or literal quotes; these are supplied from the cited fact records. Inside JSON use plain strings, no Markdown.",
  ].join('\n');
  const user = [
    'TIMEFRAME ' + evidence.timeframe + ' ' + evidence.timeId + ': ' + evidence.bounds.start + ' to ' + evidence.bounds.end,
    'VERIFIED EVIDENCE CARDS:\n' + JSON.stringify(evidence.facts.map(f => ({
      id: f.id, kind: f.kind, title: f.title, evidence: f.evidence, hasBars: !!f.bars?.length, hasTimeline: !!f.beats?.length, hasQuote: !!f.quote,
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
    try { return normalizeWrappedStory(parseJson(answer), evidence, media); }
    catch (err: any) { lastFailure = err?.message || 'Invalid story'; }
  }
  throw new Error('Wrapped Director failed validation twice: ' + lastFailure);
}
