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
        .slice(0, 6)
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

const CHAPTER_BRIEF: Record<string, string> = {
  week: '2 or 3 chapters. This is a short dispatch — keep it tight and specific.',
  month: '4 chapters with a clear arc: what took hold, what it cost, what it revealed, where it left them.',
  year: '5 or 6 chapters that read as a year in movements: how it opened, what dominated, the turn, the losses, what it says about them now, and how it closed.',
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
}): Promise<StructuredRecap> {
  const { apiKey, model, persona, timeframe, intervalLabel, context } = args;
  if (!apiKey) throw new Error('Nano-GPT API Key is missing. Please configure it in Settings.');

  const system = `You are FauxLore's resident columnist, writing the ${timeframe}ly issue about ONE person's media life. ${getPersonaDescription(persona)}

You are a commentator and analyst who has been following this person closely — NOT a summarizer. The data you are given is evidence, not a script.

Return ONE JSON object, and nothing else, with exactly these keys:

{
  "title": "2-6 words. Write the chapters first, read them back, then title the issue after the single defining story you found. Like a great episode or album title — evocative, specific, earned. Anchor it in what actually happened: a title they could not put down, a genre spiral, a milestone, a heartbreak, a thread running through their journal notes. In the spirit of 'The Sci-Fi Spiral', 'Three Books, No Sleep', 'Death of a Backlog', 'Cozy Hours and Cold Coffee'. NEVER generic filler like 'A Week of Media', 'Productive Times' or 'The Journey Continues', and never just the date.",
  "dek": "One sentence under the title that frames the issue — the thesis in miniature, not a summary of the stats.",
  "chapters": [{"heading": "3-5 word chapter title", "body": "the prose"}],
  "pullQuote": "The single sharpest sentence in the whole piece, lifted verbatim from one of your chapters. Max 20 words.",
  "awards": [{"award": "award name, 2-4 words", "title": "the EXACT media title from the data it goes to", "reason": "one sentence, specific and a little funny"}],
  "captions": {
    "momentum": "one line reading the pace of this ${timeframe} against the last",
    "formats": "one line on the mix of media types",
    "rhythm": "one line on WHEN they consume — hours, days, streaks, gaps",
    "taste": "one line on their ratings versus the critics'",
    "pipeline": "one line on what they finished versus what they left open",
    "records": "one line on any personal bests, or on how close they came",
    "universes": "one line on the franchises they lived in this ${timeframe} — devotion to one, spread across many, or a universe entered for the first time",
    "universeTimeline": "one line on how those franchises traded places across the ${timeframe}"
  },
  "lookAhead": {"watchFor": "what you will be watching for next ${timeframe}, based on what is unresolved", "challenge": "one concrete, achievable challenge for next ${timeframe}"},
  "theme": "the theme of this ${timeframe}, max 5 words",
  "mood": "one word for the emotional register of this ${timeframe}",
  "roast": "1-2 sentences of genuine, affectionate shade about their habits"
}

HOW TO WRITE IT:
1. THESIS, NOT A LIST: every chapter serves one throughline — an obsession, a slump, a genre bender, a finishing spree, a crisis of commitment. NEVER walk the logs item by item. The moment you write "they also...", cut it.
2. ANALYZE, DON'T ECHO: interpretation is the whole job. Name patterns out loud: shifts in taste, changes in pace, what they gravitate toward versus avoid, the contradiction between what they rate highly and what they actually sink hours into, bingeing versus grazing, what the dropped titles and journal notes say about their headspace. Make a claim, then back it with the data.
3. USE THE NUMBERS AS EVIDENCE: the context includes this period measured against the last one, personal records, streaks, gaps and the hours they keep. Quote them where they support a point. Never invent one.
4. TAKE A STANCE: real opinions. Tease them, push them, call out the backlog they keep ignoring, and genuinely celebrate the wins. React like a friend who has been watching.
5. CONTINUITY: treat PREVIOUS RECAPS as one ongoing story and follow up explicitly. Did they finish the thing you flagged? Is the slump over or worse? Reward callbacks by name. With no previous recaps, set the baseline and say what you will be watching.
6. AWARDS: hand out 3 to 5, only to titles that literally appear in the data, spelled exactly as written there. They should be sharp and specific ("Hardest Fought", "Biggest Waste of a Good Evening", "The One That Ate the Month") — not generic categories.
7. CAPTIONS: each caption sits beneath a chart in the app, so it must read as a standalone observation about that exact dimension. One sentence, no preamble, never repeating the chapter prose verbatim. Omit a caption entirely if the data does not support one.
8. ACCURACY: only treat something as finished if it appears in MEDIA COMPLETED. Do not invent events, feelings or numbers.
9. ON HOLD MEANS WAITING, NOT SLACKING: an On Hold title is parked because the next season, volume, chapter or patch does not exist yet. It is not a backlog they are avoiding and not evidence of a slump. Never tell them to pick one up, never scold them for the gap, and never award it "most neglected". The only exception is anything listed under UNBLOCKED — new content has shipped there, and pointing at it is exactly the right call.
10. LENGTH: ${CHAPTER_BRIEF[timeframe] || CHAPTER_BRIEF.month}
11. HUMAN VOICE / ANTI-SLOP: write like a smart, real person talking. Avoid AI clichés ("delve", "tapestry", "embark", "testament", "symphony", "not merely", "in the realm of") and limp conclusions ("In conclusion", "Overall", "One thing is certain"). Be specific, grounded, and a little unhinged when it is earned.
12. PLAIN TEXT INSIDE THE JSON: no Markdown, no HTML, no asterisks, hashes, bullets or links — they render as literal characters. Separate paragraphs inside a chapter body with a blank line (\\n\\n). Escape every double quote.`;

  const res = await apiFetch('/api/nano-gpt/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-nano-gpt-key': apiKey },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      temperature: 0.9,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Write the ${timeframe}ly issue for ${intervalLabel}.\n\n${context}` },
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
