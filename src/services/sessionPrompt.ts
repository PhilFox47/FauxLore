import { apiFetch } from './db';
import { analyticalModel } from '../lib/aiModels';
import { FAUXLORE_SESSION_CONTEXT } from '../lib/fauxLoreMechanics';
import type { MediaItem, ProgressLog, Settings, Status } from '../types/schema';

type QuestionInput = {
  item: MediaItem;
  delta: number;
  estimatedMinutes?: number;
  metricType: string;
  enjoyment?: number | null;
  statusBefore: Status;
  statusAfter: Status;
  location?: string;
  previousLogs: ProgressLog[];
  settings?: Settings | null;
  signal?: AbortSignal;
};

export function fallbackSessionQuestion(input: QuestionInput): string {
  if (input.statusAfter === 'Completed' && input.statusBefore !== 'Completed')
    return 'Now that you have finished it, what is the one thing that will stay with you?';
  if (input.enjoyment === 5) return 'What made this particular session so memorable?';
  if (input.enjoyment && input.enjoyment <= 2) return 'What held this session back, or what frustrated you most?';
  if (input.previousLogs.some(l => typeof l.sessionEnjoyment === 'number'))
    return 'Did anything about this session feel different from the last time?';
  return 'What is one small moment or impression you want to remember from this session?';
}

/** Deliberately tiny call: one grounded question, no Codex and no Recap generation. */
export async function generateSessionQuestion(input: QuestionInput): Promise<string> {
  const settings = input.settings;
  if (!settings || (settings.aiProvider !== 'cliProxy' && !settings.nanoGptApiKey)) {
    return fallbackSessionQuestion(input);
  }
  const previous = input.previousLogs
    .filter(l => l.mediaId === input.item.id && l.metricType !== 'statusChange' && !l.isHistoric)
    .sort((a,b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 5)
    .map(l => ({
      date: l.timestamp.slice(0, 10), enjoyment: l.sessionEnjoyment ?? null,
      thoughts: (l.thoughts || '').slice(0, 320), note: (l.note || '').slice(0, 120), previousQuestion: (l.thoughtPrompt || '').slice(0, 180),
    }));
  const res = await apiFetch('/api/nano-gpt/chat/completions', {
    method: 'POST', signal: input.signal,
    headers: { 'Content-Type': 'application/json', 'x-nano-gpt-key': settings.nanoGptApiKey || '' },
    body: JSON.stringify({
      model: analyticalModel(settings), temperature: 0.7, max_tokens: 140,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: FAUXLORE_SESSION_CONTEXT + '\n\nYou are a witty, curious journaling companion. Ask exactly ONE short, specific, open-ended question about the just-logged media session. Make it easy to answer in one sentence. React to enjoyment, progress, and recent user reflections when available; ask about a contrast, emotion, detail or surprise. Do NOT invent events or plot points, assume how the user felt, ask a generic "What did you think?", or spoil unknown story content. Never mention numbers mechanically. Return JSON only: {"question":"..."}. Respond in English.' },
        { role: 'user', content: JSON.stringify({
          media: input.item.title, type: input.item.mediaType,
          genres: (input.item.genres || []).slice(0, 4), durationOrProgress: input.delta,
          progressMetric: input.metricType, estimatedSessionMinutes: input.estimatedMinutes ?? null, sessionEnjoyment: input.enjoyment ?? null,
          fromStatus: input.statusBefore, toStatus: input.statusAfter,
          location: input.location || null, previousSessions: previous,
        }) }
      ]
    })
  });
  if (!res.ok) throw new Error('AI question unavailable: ' + res.status);
  const data = await res.json();
  let answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string') throw new Error('No prompt returned');
  answer = answer.trim();
  if (!answer.startsWith('{')) answer = answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1);
  const parsed = JSON.parse(answer);
  const question = typeof parsed.question === 'string' ? parsed.question.trim() : '';
  if (!question || question.length > 300 || question.length < 12) throw new Error('Unhelpful prompt');
  return question;
}
