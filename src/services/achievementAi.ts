import { apiFetch } from './db';
import { getPersonaDescription } from '../lib/personas';
import { FAUXLORE_BOSS_ATTRIBUTION } from '../lib/fauxLoreMechanics';
import type { StructuredRecap } from './recapAi';
import type { WrappedStory } from './wrappedAi';
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

/**
 * Achievements are SOUVENIRS of this period, not a competing recap.
 * The defining Recap/Wrapped moments are positive references for the subject;
 * only the wording and joke angle should differ.
 */
export function buildAchievementPrompt(args: {
  timeframe: AchievementPeriod;
  timeId: string;
  recap: StructuredRecap;
  wrapped?: WrappedStory | null;
  context: string;
  previous: GeneratedAchievement[];
  correction?: string;
}): string {
  const { timeframe, timeId, recap, wrapped, context, previous, correction = '' } = args;
  const older = previous.filter(a => !(a.timeframe === timeframe && a.timeId === timeId));
  const previousTitles = older.map(a => a.timeId + ' ' + a.timeframe + ' / ' + a.title + ' [' + a.subject + ']').join('\n');
  const recentJokes = older.slice(0, 40).map(a => a.title + ': ' + a.description.slice(0, 250) + ' / Reward: ' + a.reward.slice(0, 150)).join('\n');
  const evidence = context.length > 70000
    ? context.slice(0, 15000) + '\n[Context abbreviated]\n' + context.slice(-55000) : context;
  const recapChapters = recap.chapters.map(c => c.heading + ': ' + c.body).join('\n\n');
  const recapAwards = recap.awards.map(a => a.award + ' for ' + a.title + ' (' + a.reason + ')').join(' | ');
  const wrappedHighlights = wrapped
    ? [
        'Title: ' + wrapped.title,
        'Core editorial idea: ' + wrapped.dek,
        ...wrapped.scenes.slice(0, 14).map(scene =>
          scene.kind.toUpperCase() + ': ' + scene.title +
          (scene.evidenceIds?.length ? ' [evidence: ' + scene.evidenceIds.join(', ') + ']' : '') +
          ' / ' + scene.body.slice(0, 400),
        ),
      ].join('\n')
    : 'No separate Wrapped story is available yet. The saved Recap is the editorial source of truth.';
  return [
    'AWARD PERIOD: ' + timeframe + ' ' + timeId,
    'THE PERIOD\'S DEFINING RECAP (POSITIVE INSPIRATION: core moments, important works and main theses SHOULD be commemorated):\n' +
      'Title: ' + recap.title + '\n' +
      'Theme: ' + recap.theme + '\n' +
      'Editorial hook: ' + recap.dek + '\n' +
      'Chapters:\n' + recapChapters + '\n' +
      'Recap awards (subjects CAN become achievements): ' + (recapAwards || 'None') + '\n' +
      'Recap roast (may cover same subject but do not copy its exact punchline): ' + recap.roast,
    'SEPARATE WRAPPED EDITORIAL HIGHLIGHTS (when available, ALSO positive inspiration; do not invent what the user did):\n' + wrappedHighlights,
    'VERIFIED ACTIVITY AND LOG CONTEXT (check that every achievement claim is truly supported):\n' + evidence,
    'OLDER ACHIEVEMENTS (avoid recycling exact titles, wording and punchlines, NOT recurring subjects when this period has new evidence):\n' +
      (previousTitles || 'None'),
    'OLDER PUNCHLINES AND REWARDS (write a new joke, even when returning to the same theme):\n' +
      (recentJokes || 'None'),
    correction,
  ].filter(Boolean).join('\n\n');
}

/** An independent AI call AFTER the recap has already been written and saved. */
export async function generateRecapAchievements(args: {
  apiKey: string;
  model: string;
  timeframe: AchievementPeriod;
  timeId: string;
  recap: StructuredRecap;
  wrapped?: WrappedStory | null;
  context: string;
  previous: GeneratedAchievement[];
}): Promise<AchievementDraft[]> {
  const { apiKey, model, timeframe, timeId, recap, wrapped, context, previous } = args;
  const older = previous.filter(a => !(a.timeframe === timeframe && a.timeId === timeId));
  const system = buildAchievementSystemPrompt();
  let correction = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    // The Recap/Wrapped's editorial core is a POSITIVE selection guide.
    // Evidence still constrains factual assertions; achievements bring a new
    // joke/voice to the same defining events instead of hunting for omissions.
    const prompt = buildAchievementPrompt({
      timeframe, timeId, recap, wrapped, context, previous, correction,
    });
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

/** Rules separated so source-overlap policy can be regression-tested. */
export function buildAchievementSystemPrompt(): string {
  return [
    getPersonaDescription('dungeon-system'),
    FAUXLORE_BOSS_ATTRIBUTION,
    "Write original, occasionally savage or unexpectedly sincere FICTIONAL achievement commentary about ACTUAL logged media life. Achievements are lasting SOUVENIRS of the recap and Wrapped: commemorate the defining moments in a fresh voice, not another activity summary.",
    "By default produce ONE achievement; TWO or THREE only for independent extraordinary moments. Never pad the set.",
    "PRIORITY: start from the MOST DEFINING verified event, important media work, meaningful decision or central theme of the period, as established by the Recap and (if present) Wrapped. The first and only achievement, if there is one, should honor or roast a CORE highlight rather than an obscure footnote. If awarding 2-3, choose distinct significant highlights; small oddities are optional, never mandatory.",
    "Explicitly REUSE recap/Wrapped subjects, events, media titles, themes, achievements or award-worthy choices when they are the heart of the period. Subject overlap is a FEATURE: the achievement should feel like a trophy from THAT story, not leftover trivia. A fresh comedic angle is required, but a fresh TOPIC is not.",
    "A false accusation is funny only when unmistakably fictional and anchored to a TRUE, accurately attributed behavior in the provided evidence. DO NOT invent player intention behind automatic system events: boss defeats, failures, quest completions, EXP or status automation.",
    "Extreme imaginary consequences, personal unreasonable reactions, unpredictable length and rare genuine admiration are welcome. You are the dungeon intelligence ITSELF. Never invoke producers, management, offices, departments, paperwork or bureaucracy.",
    "Use original rhythm: one-line deadpan, absurd escalation or sincere fascination as warranted. Do not COPY the recap/Wrapped's wording, punchlines, achievement titles or rewards verbatim; reinterpret the SAME key event with a distinct, collectible achievement identity. Avoid redundant topics AMONG the achievements awarded for this period.",
    "A reward is ALWAYS a purely imaginary joke with NO gameplay effects. Never imply the player actually received an Artifact, EXP, a stat modifier or unlock.",
    "Attack harmless habits and taste, not personal vulnerabilities. All titles, subject, body and reward must be in English; do not imitate a copyrighted fictional narrator.",
    "Return 1-3 completely original achievements. All title, story, subject and reward text MUST BE IN ENGLISH, regardless of the selected recap persona. Do not quote or closely reproduce an existing fictional narrator's wording.",
    "Return ONLY JSON: {\"achievements\":[{\"title\":\"memorable short title\",\"description\":\"commentary and escalating story, length freely chosen\",\"reward\":\"ironic fake reward\",\"subject\":\"short factual anchor\"}]}. No markdown."
  ].join('\n');
}
