import { apiFetch } from './db';
import { getPersonaDescription } from '../lib/personas';
import { FAUXLORE_BOSS_ATTRIBUTION } from '../lib/fauxLoreMechanics';
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
    getPersonaDescription('dungeon-system'),
    FAUXLORE_BOSS_ATTRIBUTION,
    "Write original, occasionally savage or unexpectedly sincere FICTIONAL achievement commentary about ACTUAL logged media life. The player knows what happened; invent a fresh comedic interpretation, not an activity summary.",
    "By default produce ONE achievement; TWO or THREE only for independent extraordinary moments. Never pad the set.",
    "Find an overlooked contradiction, specific harmless choice or bizarre coincidence. A false accusation is funny only when unmistakably fictional and anchored to a TRUE, accurately attributed behavior. DO NOT invent player intention behind automatic system events: boss defeats, failures, quest completions, EXP or status automation.",
    "Extreme imaginary consequences, personal unreasonable reactions, unpredictable length and rare genuine admiration are welcome. You are the dungeon intelligence ITSELF. Never invoke producers, management, offices, departments, paperwork or bureaucracy.",
    "Use original rhythm: one-line deadpan, absurd escalation or sincere fascination as warranted. Never reuse a setup, title or joke from the recap or previous achievements.",
    "A reward is ALWAYS a purely imaginary joke with NO gameplay effects. Never imply the player actually received an Artifact, EXP, a stat modifier or unlock.",
    "Attack harmless habits and taste, not personal vulnerabilities. All titles, subject, body and reward must be in English; do not imitate a copyrighted fictional narrator.",
    "Return 1-3 completely original achievements. All title, story, subject and reward text MUST BE IN ENGLISH, regardless of the selected recap persona. Do not quote or closely reproduce an existing fictional narrator's wording.",
    "Return ONLY JSON: {\"achievements\":[{\"title\":\"memorable short title\",\"description\":\"commentary and escalating story, length freely chosen\",\"reward\":\"ironic fake reward\",\"subject\":\"short factual anchor\"}]}. No markdown."
  ].join('\n');
  let correction = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    // Put raw evidence FIRST. The finished article is a negative reference:
    // seeing its entire prose first makes the narrator paraphrase it again.
    const prompt = [
      'AWARD PERIOD: ' + timeframe + ' ' + timeId,
      'WHAT ACTUALLY HAPPENED (look for overlooked context and small moments; do not turn into a list):\n' + evidence,
      'ALREADY COVERED IN THE RECAP (do NOT paraphrase this or reuse its punchlines):\n' +
        recap.title + '\n' + recap.dek + '\n' + recapText +
        '\nAWARDS ALREADY HANDED OUT: ' + recap.awards.map(a => a.award + ' for ' + a.title + ' (' + a.reason + ')').join(' | ') +
        '\nRECAP ROAST ALREADY USED: ' + recap.roast,
      'PREVIOUS ACHIEVEMENT TOPICS (avoid repetition):\n' + (allTitles || 'None'),
      'PREVIOUS PUNCHLINES AND REWARDS (invent something ELSE):\n' + (recentJokes || 'None'),
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
