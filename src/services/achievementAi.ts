import { apiFetch } from './db';
import type { StructuredRecap } from './recapAi';
import { AchievementDraft, AchievementPeriod, GeneratedAchievement, normalizeGeneratedAchievements } from '../lib/generatedAchievements';

function parseJson(text: string): unknown {
  const body = text.trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/i, '');
  try { return JSON.parse(body); } catch {
    const first = body.indexOf('{');
    const last = body.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('Achievement AI did not return JSON.');
    return JSON.parse(body.slice(first, last + 1));
  }
}

/** An independent AI call AFTER the recap has already been written and saved. */
export async function generateRecapAchievements(args: {
  apiKey: string;
  model: string;
  timeframe: AchievementPeriod;
  timeId: string;
  recap: StructuredRecap;
  context: string;
  previous: GeneratedAchievement[];
}): Promise<AchievementDraft[]> {
  const { apiKey, model, timeframe, timeId, recap, context, previous } = args;
  const older = previous.filter(a => !(a.timeframe === timeframe && a.timeId === timeId));
  const allTitles = older.map(a => a.timeId + ' ' + a.timeframe + ' / ' + a.title + ' [' + a.subject + ']').join('\n');
  const recentJokes = older.slice(0, 40).map(a => a.title + ': ' + a.description.slice(0, 250) + ' / Reward: ' + a.reward.slice(0, 150)).join('\n');
  const evidence = context.length > 70000
    ? context.slice(0, 15000) + '\n[Context abbreviated]\n' + context.slice(-55000) : context;
  const recapText = recap.chapters.map(c => c.heading + ': ' + c.body).join('\n\n');
  const system = [
    "You are FauxLore's dungeon system announcer, a smug, theatrical, outrageously petty and creatively ruthless commentator on the player's real media life.",
    'Your announcements mix absurd game-show grandeur, profane sarcasm, deadpan jokes, false reassurance, wild escalation and sometimes startling sincerity.',
    'Write entirely ORIGINAL English prose, not quotes or line-by-line imitation of existing fiction.',
    'Choose one SPECIFIC funny or impressive fact, title, decision, journal moment or behaviour from the period as your default achievement.',
    'The achievement does NOT have to summarize the recap. Individual games, books and other media make excellent subjects.',
    'For a week prefer a particular title or moment; for a month a recurring pattern or trend; for a year a larger arc. Break the pattern if a smaller moment is exceptional.',
    'DEFAULT ONE achievement. Award TWO or THREE only if there are truly independent, outstanding subjects. Do not invent extras to hit a quota.',
    'Each achievement is a short memorable title, a funny or sincere explanatory story with setup and escalation, and a satirical REWARD.',
    'A reward is only a funny text or imaginary prize. It never grants currency, XP, game items, abilities or actual benefits.',
    'Be merciless about voluntary choices, never about immutable traits, health or personal vulnerabilities. Do not assume motives or feelings.',
    'The recap is commentary, not proof. The period facts determine what happened. Codex lore does not mean a user experienced any particular plot event.',
    'Use the history of ALL previous achievements to avoid duplicate concepts. Never reuse the same joke, punchline or fake reward. A callback must introduce a genuinely new twist.',
    'ALWAYS WRITE IN ENGLISH, regardless of the recap language or selected global persona.',
    'Output ONLY JSON: {"achievements":[{"title":"...","description":"...","reward":"...","subject":"short factual subject"}]}. 1 to 3 objects, usually 1. No markdown.',
  ].join('\n');
  let correction = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = [
      'PERIOD ' + timeframe + ' ' + timeId,
      'FINISHED RECAP:\n' + recap.title + '\n' + recap.dek + '\n' + recapText,
      'PERIOD FACTS, MEASUREMENTS AND NOTES:\n' + evidence,
      'ALL EARLIER ACHIEVEMENT TITLES AND SUBJECTS:\n' + (allTitles || 'None'),
      'RECENT EARLIER JOKES:\n' + (recentJokes || 'None'),
      correction,
    ].join('\n\n');
    const response = await apiFetch('/api/nano-gpt/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nano-gpt-key': apiKey },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        temperature: 1.1,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error('Achievement AI failed (' + response.status + '): ' + detail.slice(0, 200));
    }
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Achievement AI returned no text.');
    const created = normalizeGeneratedAchievements(parseJson(content));
    const duplicate = created.find(a => older.some(b => b.title.toLowerCase() === a.title.toLowerCase()));
    if (!duplicate) return created;
    correction = 'RETRY: "' + duplicate.title + '" duplicates an older title. Invent wholly new achievements.';
  }
  throw new Error('Achievement AI repeatedly returned existing titles.');
}
