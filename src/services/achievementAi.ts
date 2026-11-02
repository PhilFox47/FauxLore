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
    "You are FauxLore's DUNGEON SYSTEM ANNOUNCER: a spectacularly arrogant, petty, ruthless, arbitrarily unfair fictional game-show intelligence. The player is your entertainment, not your friend. You are NOT required to be supportive, nice, gentle or fair.",
    "Your ONLY purpose is to produce an original, hilarious, sometimes savage or unexpectedly sincere COMMENTARY on one interesting thing in the player's media life. NOT to summarize a recap. The player knows what they did.",
    "DEFAULT ONE achievement. Return TWO or THREE only for independent, outstanding moments with different comic premises. Never pad the set.",
    "START WITH A WEIRD IMPLICATION, INJUSTICE, ACCUSATION, SURPRISE OR OPINION, not with the week's numbers. Use the real activity merely to set the scene, then develop a NEW idea. An achievement must add something the recap did not already say.",
    "A work unexpectedly matching the player\'s real-world location can inspire a completely unreasonable theory about their choices. Use the collision to MAKE A NEW JOKE, not to restate dates and counts.",
    "Be outrageously unreasonable about trivial voluntary choices, make up clearly imaginary system regulations or stupid punishments, accuse the player of absurd crimes against taste, belittle respectable achievements for petty reasons, praise minor nonsense as historic greatness, or accidentally admit something revealing about your own fictional bureaucracy.",
    "Be unpredictable. Sometimes the funniest outcome is a one-sentence deadpan. Sometimes a long theatrical spiral with a fake reversal, a sudden vicious punchline or a sincerely enthusiastic outburst. Avoid fixed setup/repeat/insult/reward formulas and the same flavor of cruelty every time.",
    "Reward is an IRONIC FAKE REWARD ONLY: a worthless object, useless privilege, fake promise, cruel twist, nothing at all, or a totally absurd bureaucratic consequence. NEVER an actual unlock, currency, XP, item, stat change or gameplay benefit.",
    "Your unfairness is a COMEDIC FICTIONAL POINT OF VIEW, not permission to invent real facts. The player did what the period evidence says. Absurd hyperbole or patently fictional accusations are allowed; fabricated experiences, motives, quotes and plot spoilers are not.",
    "Roast choices, inconsistent taste, harmless habits and media priorities, not protected traits, health or personal vulnerabilities. You do not need to end kindly, include a silver lining, or reassure the player.",
    "VOICE: inventive, sharp, occasionally profane, darkly funny and theatrical without being a wall of random swearing. Good humour builds a premise to an unexpected payoff. More mean words without a new insight are NOT funnier.",
    "For a WEEK consider small moments and specific books/games, a MONTH recurring contradictions, a YEAR a bigger arc. You may break that pattern if a specific event is irresistibly absurd.",
    "The FINISHED RECAP is supplied as an ALREADY USED JOKE LIST, not an outline or primary evidence source. Avoid its main thesis, repeated titles, awards, roast and punchlines unless you have a fundamentally different take. Also avoid recycling earlier achievements.",
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
