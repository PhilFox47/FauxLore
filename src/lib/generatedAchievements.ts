/** Original AI achievements owned by a single recap period. */
export type AchievementPeriod = 'week' | 'month' | 'year';
export interface AchievementDraft {
  title: string;
  description: string;
  reward: string;
  subject: string;
}
export interface GeneratedAchievement extends AchievementDraft {
  timeframe: AchievementPeriod;
  timeId: string;
  position: number;
  createdAt: string;
}

export function normalizeGeneratedAchievements(raw: any): AchievementDraft[] {
  const list = Array.isArray(raw) ? raw : raw?.achievements;
  if (!Array.isArray(list) || list.length < 1) throw new Error('The narrator awarded nothing.');
  const result: AchievementDraft[] = list.slice(0, 3).map((a: any) => ({
    title: typeof a?.title === 'string' ? a.title.trim().slice(0, 120) : '',
    description: typeof a?.description === 'string' ? a.description.trim().slice(0, 5000) : '',
    reward: typeof a?.reward === 'string' ? a.reward.trim().slice(0, 3000) : '',
    subject: typeof a?.subject === 'string' ? a.subject.trim().slice(0, 240) : '',
  }));
  if (result.some(a => !a.title || !a.description || !a.reward)) throw new Error('Incomplete achievement output.');
  if (new Set(result.map(a => a.title.toLowerCase())).size !== result.length) throw new Error('Repeated titles within achievement output.');
  return result;
}
