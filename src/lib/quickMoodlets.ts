/**
 * Fixed, language-independent session annotations. A Moodlet describes one
 * session, never a permanent trait or the review of an entire work.
 *
 * Eleven choices are intentional: the last discussed catalogue had 3 + 2 + 3
 * + 3 items despite being called "ten" in prose. Don't silently drop Social.
 */
export const QUICK_MOODLETS = [
  { id: 'moving', emoji: '🥹', label: 'Moving', group: 'Emotional response', description: 'Emotionally touching or affecting.' },
  { id: 'funny', emoji: '😂', label: 'Funny', group: 'Emotional response', description: 'Made me laugh.' },
  { id: 'frustrating', emoji: '😤', label: 'Frustrating', group: 'Emotional response', description: 'Annoyed or frustrated me.' },
  { id: 'immersed', emoji: '🌌', label: 'Immersed', group: 'Focus', description: 'Fully focused and lost in the experience.' },
  { id: 'distracted', emoji: '🫠', label: 'Distracted', group: 'Focus', description: 'Often unfocused, multitasking or taking breaks.' },
  { id: 'unwinding', emoji: '🛋️', label: 'Unwinding', group: 'Atmosphere', description: 'Relaxing, comforting or simply switching off.' },
  { id: 'exciting', emoji: '🔥', label: 'Exciting', group: 'Atmosphere', description: 'Thrilling or energizing.' },
  { id: 'tense', emoji: '😬', label: 'Tense', group: 'Atmosphere', description: 'Suspenseful, demanding or nerve-racking.' },
  { id: 'passing-time', emoji: '🎮', label: 'Just Passing Time', group: 'Meaning & context', description: 'Mostly filling a gap without much intended significance.' },
  { id: 'thought-provoking', emoji: '🤔', label: 'Thought-Provoking', group: 'Meaning & context', description: 'Made me think or question something.' },
  { id: 'social', emoji: '🤝', label: 'Social', group: 'Meaning & context', description: 'An experience shared or enjoyed with others.' },
] as const;

export type MoodletId = (typeof QUICK_MOODLETS)[number]['id'];
export const MAX_SESSION_MOODLETS = 4;
const ids = new Set<string>(QUICK_MOODLETS.map(m => m.id));

/** Distinguish no annotations from malformed user input; never invent "normal". */
export function validateMoodlets(value: unknown): MoodletId[] | null {
  if (!Array.isArray(value) || value.length > MAX_SESSION_MOODLETS ||
    value.some(v => typeof v !== 'string' || !ids.has(v)) ||
    new Set(value).size !== value.length) return null;
  return value as MoodletId[];
}

export function readMoodlets(value: unknown): MoodletId[] {
  if (value == null) return [];
  if (typeof value === 'string') {
    try { return validateMoodlets(JSON.parse(value)) || []; }
    catch { return []; }
  }
  return validateMoodlets(value) || [];
}

export function describeMoodlets(ids: readonly MoodletId[]): string {
  return ids.map(id => QUICK_MOODLETS.find(m => m.id === id)?.label || id).join(', ');
}
