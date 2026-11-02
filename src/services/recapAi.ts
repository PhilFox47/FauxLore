import { apiFetch } from './db';
import { getPersonaDescription } from '../lib/personas';

/**
 * The written half of a recap.
 *
 * A recap used to be one blob of prose plus two throwaway calls for a "theme"
 * and a roast. It now comes back as an issue: a deck, titled chapters, a pull
 * quote, awards handed to specific titles, one-line readings of the charts, and
 * a look ahead at the next period — all in a single request, so the parts agree
 * with each other and cost one call instead of three.
 *
 * Everything is optional on the way in. A model that ignores half the schema
 * still yields a readable recap, and an older recap with only `summary` still
 * renders, because the page falls back through the same shape.
 */

export interface RecapChapter { heading: string; body: string }
export interface RecapAward { award: string; title: string; reason: string }
export interface RecapCaptions {
  momentum?: string;
  formats?: string;
  rhythm?: string;
  taste?: string;
  pipeline?: string;
  records?: string;
  universes?: string;
  universeTimeline?: string;
}

export interface StructuredRecap {
  title: string;
  dek: string;
  chapters: RecapChapter[];
  pullQuote: string;
  awards: RecapAward[];
  captions: RecapCaptions;
  lookAhead: { watchFor: string; challenge: string };
  theme: string;
  mood: string;
  roast: string;
  /** Chapters flattened to plain prose — what older readers of a recap expect. */
  summary: string;
}

const str = (v: any) => (typeof v === 'string' ? v.trim() : '');
const clean = (v: any) =>
  str(v)
    // Models sneak Markdown in even when told not to; it renders as literal junk.
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-•]\s+/gm, '')
    .trim();

function parseJsonLoose(text: string): any {
  let body = String(text || '').trim();
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) body = fenced[1].trim();
  try {
    return JSON.parse(body);
  } catch (e) {
    const start = body.search(/[{[]/);
    const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
    if (start !== -1 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error('The recap did not come back as JSON.');
  }
}

/** Coerces whatever the model returned into a complete, renderable recap. */
export function normalizeRecap(raw: any, fallbackText = ''): StructuredRecap {
  const chapters: RecapChapter[] = Array.isArray(raw?.chapters)
    ? raw.chapters
        .map((c: any) => ({ heading: clean(c?.heading), body: clean(c?.body ?? c?.text) }))
        .filter((c: RecapChapter) => c.body)
    : [];

  // A model that ignored the chapter schema usually still wrote the prose.
  if (chapters.length === 0) {
    const prose = clean(raw?.summary ?? raw?.body ?? raw?.recap) || clean(fallbackText);
    if (prose) chapters.push({ heading: '', body: prose });
  }

  const awards: RecapAward[] = Array.isArray(raw?.awards)
    ? raw.awards
        .map((a: any) => ({ award: clean(a?.award ?? a?.name), title: clean(a?.title ?? a?.media), reason: clean(a?.reason) }))
        .filter((a: RecapAward) => a.award && a.title)
        .slice(0, 3)
    : [];

  const captionsRaw = raw?.captions || {};
  const captions: RecapCaptions = {};
  (['momentum', 'formats', 'rhythm', 'taste', 'pipeline', 'records', 'universes', 'universeTimeline'] as const).forEach((k) => {
    const v = clean(captionsRaw[k]);
    if (v) captions[k] = v;
  });

  return {
    title: clean(raw?.title) || 'Untitled Chapter',
    dek: clean(raw?.dek ?? raw?.subtitle),
    chapters,
    pullQuote: clean(raw?.pullQuote ?? raw?.quote),
    awards,
    captions,
    lookAhead: {
      watchFor: clean(raw?.lookAhead?.watchFor ?? raw?.lookAhead?.watch),
      challenge: clean(raw?.lookAhead?.challenge),
    },
    theme: clean(raw?.theme),
    mood: clean(raw?.mood),
    roast: clean(raw?.roast),
    summary: chapters.map((c) => c.body).join('\n\n'),
  };
}


/**
 * Editorial preselection: think of ORIGINAL arguments before composing prose.
 * Do not mix writing with idea triage, or the most obvious statistic wins again.
 */
export interface EditorialAngle {
  thesis: string;
  evidence: string;
  twist: string;
}
export interface EditorialPlan {
  throughline: string;
  angles: EditorialAngle[];
}

export function normalizeEditorialPlan(value: any): EditorialPlan {
  const text = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const angles: EditorialAngle[] = Array.isArray(value?.angles)
    ? value.angles.slice(0, 4).map((v: any) => ({
      thesis: text(v?.thesis, 400),
      evidence: text(v?.evidence, 700),
      twist: text(v?.twist, 500),
    })).filter((v: EditorialAngle) => v.thesis && v.evidence && v.twist)
    : [];
  if (!angles.length) throw new Error('No strong editorial angles were returned.');
  return { throughline: text(value?.throughline, 300), angles };
}

export async function planRecapEditorial(args: {
  apiKey: string;
  model: string;
  timeframe: 'week' | 'month' | 'year';
  intervalLabel: string;
  context: string;
}): Promise<EditorialPlan> {
  const instructions = [
    "You are the ruthless editor of an opinionated personal media column. The reader LIVED these events. They know what happened. Find what it MEANS, or what is absurd about it.",
    "Search the evidence for location-versus-media coincidences, changes of environment, contradictions between taste and behavior, journal opinions, neglected details, cross-media parallels, funny accidents and real patterns.",
    "Privately consider at least six possible angles. Reject obvious milestones, numerical recaps, easy jokes and themes already exhausted by earlier columns. Choose 2-4 genuinely distinct insights; allow just one if evidence is weak. A trivial detail with a brilliant interpretation beats a record with nothing to say.",
    "A single RED THREAD makes the issue cohere, but it must not force every chapter to discuss the same title. Each selected angle must have a different thesis or comic premise.",
    "Past recap themes are a DO-NOT-REPEAT reference first, not obligations for callbacks. A callback needs a new development or an unexpected reinterpretation.",
    "Be provocative, skeptical, witty and occasionally unfair in your OPINIONS. Distinguish factual evidence from speculation; never invent user activity, personal feelings, or plot events. Codex lore is NOT evidence of what the user experienced.",
    "A thesis is NOT 'the user read more on the train'. A thesis asks why a setting or behavior may be revealing, what contradiction it creates, or what ridiculous conclusion an opinionated columnist could draw from it.",
    "Choose and rank by novelty, explanatory power, personal specificity, cross-context connections and distinctiveness. Numbers should support, not BE, the point.",
    "Return ONLY JSON in English: {\"throughline\":\"an evocative editorial thread\",\"angles\":[{\"thesis\":\"specific provocative claim\",\"evidence\":\"facts and notes supporting it, clearly marking inference\",\"twist\":\"new connection or comedic perspective that makes it worth reading\"}]}."
  ].join('\n');
  const response = await apiFetch('/api/nano-gpt/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-nano-gpt-key': args.apiKey },
    body: JSON.stringify({
      model: args.model || 'gpt-4o-mini', temperature: 0.95,
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: 'Select angles for the ' + args.timeframe + ' period ' + args.intervalLabel + '.\n\n' + args.context },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) throw new Error('Editorial plan request failed (' + response.status + ')');
  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== 'string') throw new Error('Editorial planner returned no text.');
  return normalizeEditorialPlan(parseJsonLoose(reply));
}

const CHAPTER_BRIEF: Record<string, string> = {
  week: 'Normally 2-4 different angles; occasionally one sharp argument is enough. No padding.',
  month: 'Normally 2-4 independent opinions connected by a red thread. No month-by-month account.',
  year: 'Normally 2-4 substantial observations about the whole year. This is not a chronology of every month.',
};

/**
 * Writes the recap. One call returns the whole issue — narrative, awards,
 * chart readings, look-ahead, roast and theme.
 */
export async function generateStructuredRecap(args: {
  apiKey: string;
  model: string;
  persona?: string;
  timeframe: 'week' | 'month' | 'year';
  intervalLabel: string;
  context: string;
  editorialPlan?: EditorialPlan | null;
}): Promise<StructuredRecap> {
  const { apiKey, model, persona, timeframe, intervalLabel, context, editorialPlan } = args;

  const system = [
    "You are FauxLore's OPINIONATED MEDIA COLUMNIST, not a life-log summarizer. " + getPersonaDescription(persona),
    "The reader WAS THERE. They already have charts and metrics. Deliver insights, provocation, contradictions, unusual connections, taste arguments, comic observations, surprising inferences and strong opinions they could actually debate.",
    "KEEP A RED THREAD for the issue's identity, but write 2-4 DISTINCT ARGUMENTS beneath it. Do not turn every chapter into another paragraph about the dominant title. One exceptional thought may suffice if the evidence is thin.",
    "LEAD WITH YOUR TAKE. A paragraph's first sentence should ideally be an interpretation, surprise or sharp claim. Use facts to earn your opinion, not as a timeline. If a sentence merely lists a title, date, session, Master Pages or rating, remove it unless that exact number is essential to the punchline or argument.",
    "THE PERSONAL SETTING MATTERS: notice travel, locations, a book read in a related real-world setting, time away from home, shifts in routines, and odd intersections between different media. Do not mistake correlation for a proved cause.",
    "BE BOLD: argue about what the player's choices might imply, disagree with ratings, point out contradictions, make outlandish but clearly rhetorical accusations. Never fabricate factual events, feelings or personal experiences. Treat source Codex as lore only, never as proof of encountered scenes or plots.",
    "PREVIOUS RECAPS ARE AN ANTI-REPETITION LIST. A callback needs fresh insight or a new joke. Do not keep discussing an old theme simply to show continuity.",
    "DYNAMIC LENGTH. An insight may need one line or several paragraphs. No obligatory story beats, no KPI sequences, no summary conclusion, no moral-of-the-story ending. Stop when you've made the point. Avoid bland AI voice ('tapestry', 'journey', 'testament', 'delve', 'symphony', 'a week defined by', 'what this really shows').",
    "AWARDS are OPTIONAL: zero to two, always tied to an exact media title, and only if the award adds a NEW angle rather than repeating a chapter. Same for the optional ROAST: empty string is better than recycling a punchline. A separate dungeon achievement narrator also runs after this column.",
    "CAPTIONS go under charts: one independent observation about the indicated dimension; never repeat prose or invent numbers. Omit when unsupported.",
    "FINISHED means explicitly present in MEDIA COMPLETED. On Hold/Caught Up means awaiting unreleased content, never laziness or abandonment. Respect the actual period dates. Avoid unearned story spoilers.",
    "Keep ALL JSON strings plain text: no Markdown, HTML or literal formatting tokens. Use blank lines between paragraphs if useful. The pullQuote must literally appear in one of the chapters.",
    "Length guide: " + (CHAPTER_BRIEF[timeframe] || CHAPTER_BRIEF.month),
    "Return exactly one JSON object with: title (specific evocative 2-6 words), dek (one provocative editorial hook), chapters ([{heading,body}]), pullQuote (verbatim sharp chapter sentence, <=20 words), awards ([{award,title,reason}]), captions ({momentum,formats,rhythm,taste,pipeline,records,universes,universeTimeline} optional properties), lookAhead ({watchFor,challenge}, empty strings if unnecessary), theme (up to 5 words), mood (one word), roast (optional original jab; blank if repetitive)."
  ].join('\n');

  const outline = editorialPlan?.angles?.length
    ? 'EDITORIAL SELECTION. USE THESE DISTINCT IDEAS, BUT WRITE FRESH PROSE, NOT A RESTATEMENT OF THE OUTLINE:\n' + JSON.stringify(editorialPlan, null, 2) + '\n\n'
    : 'Editorial planner unavailable. Privately select 2-4 distinct, non-obvious arguments before writing. Connect them with a thread but avoid repeating the main event.\n\n';

  const res = await apiFetch('/api/nano-gpt/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-nano-gpt-key': apiKey },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      temperature: 0.9,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Write the ' + timeframe + 'ly issue for ' + intervalLabel + '.\n\n' + outline + 'EVIDENCE (not a checklist):\n' + context },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // The server explains refusals (a paused account, for one) in an `error`
    // field. Showing that beats showing it wrapped in a status code.
    try {
      const parsed = JSON.parse(detail);
      if (parsed?.error) throw new Error(parsed.error);
    } catch (e: any) {
      if (e instanceof Error && e.message && !/JSON/i.test(e.message)) throw e;
    }
    throw new Error(`Nano-GPT Error (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Nano-GPT returned an empty response.');

  let parsed: any;
  try {
    parsed = parseJsonLoose(content);
  } catch (e) {
    // Prose came back instead of JSON — still a recap, just an unstructured one.
    const recap = normalizeRecap({}, content);
    if (!recap.summary) throw e;
    return recap;
  }

  const recap = normalizeRecap(parsed, content);
  if (!recap.summary) throw new Error('The AI failed to generate a narrative summary.');
  return recap;
}
