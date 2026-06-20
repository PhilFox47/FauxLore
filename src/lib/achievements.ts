import { MediaItem, ProgressLog, Artifact, WorldBoss } from '../types/schema';
import { estimateEffort } from './recommend';

export type AchievementCategory = 'Combat' | 'Mastery' | 'Collection' | 'Taste' | 'Habits' | 'Completion';
export type AchievementRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

export interface AchievementContext {
  media: MediaItem[];
  logs: ProgressLog[];
  artifacts: Artifact[];
  worldBosses: WorldBoss[];
  rpgLevel: number;
  weeklyQuestsCleared: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  earned: (ctx: AchievementContext) => boolean;
}

// --- helpers -------------------------------------------------------------
const finished = (m: MediaItem) => m.status === 'Completed' || m.status === 'Extras';
const realLogs = (logs: ProgressLog[]) =>
  logs.filter(l => l.metricType !== 'statusChange' && !l.timestamp.startsWith('1970-01-01'));

function longestStreak(logs: ProgressLog[]): number {
  const dates = Array.from(new Set(realLogs(logs).map(l => new Date(l.timestamp).toISOString().slice(0, 10)))).sort();
  if (dates.length === 0) return 0;
  let max = 1; let cur = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = Math.round((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000);
    if (diff === 1) { cur++; max = Math.max(max, cur); } else if (diff > 1) cur = 1;
  }
  return max;
}

function firstLastByMedia(logs: ProgressLog[]) {
  const map = new Map<string, { first: number; last: number }>();
  realLogs(logs).forEach(l => {
    const t = new Date(l.timestamp).getTime();
    const e = map.get(l.mediaId);
    if (!e) map.set(l.mediaId, { first: t, last: t });
    else { e.first = Math.min(e.first, t); e.last = Math.max(e.last, t); }
  });
  return map;
}

const distinct = <T>(arr: T[]) => Array.from(new Set(arr));

// --- definitions ---------------------------------------------------------
export const ACHIEVEMENTS: Achievement[] = [
  // Combat
  { id: 'first_blood', name: 'First Blood', description: 'Defeat your very first World Boss.', category: 'Combat', rarity: 'Common',
    earned: c => c.worldBosses.some(b => b.status === 'Defeated') },
  { id: 'giant_slayer', name: 'Giant Slayer', description: 'Bring down a Level 5 World Boss.', category: 'Combat', rarity: 'Epic',
    earned: c => c.worldBosses.some(b => b.status === 'Defeated' && b.level === 5) },
  { id: 'boss_hunter', name: 'Boss Hunter', description: 'Defeat 25 World Bosses.', category: 'Combat', rarity: 'Rare',
    earned: c => c.worldBosses.filter(b => b.status === 'Defeated').length >= 25 },

  // Mastery
  { id: 'centurion', name: 'Centurion', description: 'Reach Lorekeeper Level 10.', category: 'Mastery', rarity: 'Rare',
    earned: c => c.rpgLevel >= 10 },
  { id: 'ascended', name: 'Ascended', description: 'Reach Lorekeeper Level 25.', category: 'Mastery', rarity: 'Legendary',
    earned: c => c.rpgLevel >= 25 },
  { id: 'iron_will', name: 'Iron Will', description: 'Log progress 30 days in a row.', category: 'Mastery', rarity: 'Epic',
    earned: c => longestStreak(c.logs) >= 30 },
  { id: 'unbroken', name: 'Unbroken', description: 'Sustain a 100-day logging streak.', category: 'Mastery', rarity: 'Mythic',
    earned: c => longestStreak(c.logs) >= 100 },
  { id: 'quest_master', name: 'Quest Master', description: 'Clear every weekly quest in a single week.', category: 'Mastery', rarity: 'Rare',
    earned: c => c.weeklyQuestsCleared },

  // Collection
  { id: 'loot_goblin', name: 'Loot Goblin', description: 'Hoard 25 artifacts.', category: 'Collection', rarity: 'Rare',
    earned: c => c.artifacts.length >= 25 },
  { id: 'mythic_find', name: 'Mythic Find', description: 'Earn a Mythic-rarity artifact.', category: 'Collection', rarity: 'Legendary',
    earned: c => c.artifacts.some(a => a.rarity === 'Mythic') },
  { id: 'fully_equipped', name: 'Fully Equipped', description: 'Have artifacts equipped in 4 different slots at once.', category: 'Collection', rarity: 'Epic',
    earned: c => distinct(c.artifacts.filter(a => a.isEquipped && a.slot).map(a => a.slot)).length >= 4 },

  // Taste
  { id: 'perfectionist', name: 'Perfectionist', description: 'Give a finished work a perfect 5★.', category: 'Taste', rarity: 'Common',
    earned: c => c.media.some(m => finished(m) && (m.userRating || 0) >= 5) },
  { id: 'contrarian', name: 'The Contrarian', description: 'Rate something 5★ that critics scored 2.5★ or lower.', category: 'Taste', rarity: 'Epic',
    earned: c => c.media.some(m => (m.userRating || 0) >= 5 && !!m.reviewScore && m.reviewScore <= 2.5) },
  { id: 'tough_crowd', name: 'Tough Crowd', description: 'Drop a media the critics loved (rated 4★+).', category: 'Taste', rarity: 'Rare',
    earned: c => c.media.some(m => m.status === 'Dropped' && (m.reviewScore || 0) >= 4) },
  { id: 'polyglot', name: 'Polyglot', description: 'Engage with media in 3 or more languages.', category: 'Taste', rarity: 'Rare',
    earned: c => distinct(c.media.filter(m => finished(m) || m.status === 'Active').map(m => (m.language || '').trim().toUpperCase()).filter(Boolean)).length >= 3 },
  { id: 'renaissance', name: 'Renaissance Soul', description: 'Finish media across 5 different formats.', category: 'Taste', rarity: 'Epic',
    earned: c => distinct(c.media.filter(finished).map(m => m.mediaType)).length >= 5 },

  // Habits
  { id: 'night_shift', name: 'Night Shift', description: 'Log progress between 2 and 5 in the morning.', category: 'Habits', rarity: 'Common',
    earned: c => realLogs(c.logs).some(l => { const h = new Date(l.timestamp).getHours(); return h >= 2 && h < 5; }) },
  { id: 'globetrotter', name: 'Globetrotter', description: 'Log from 5 or more distinct locations.', category: 'Habits', rarity: 'Rare',
    earned: c => distinct(realLogs(c.logs).map(l => (l.location || '').trim()).filter(Boolean)).length >= 5 },
  { id: 'dear_diary', name: 'Dear Diary', description: 'Write 25 journal notes on your logs.', category: 'Habits', rarity: 'Rare',
    earned: c => realLogs(c.logs).filter(l => (l.note || '').trim().length > 10).length >= 25 },

  // Completion
  { id: 'comeback', name: 'Comeback Story', description: 'Finish a media you had previously dropped.', category: 'Completion', rarity: 'Epic',
    earned: c => c.media.some(m => finished(m) && c.logs.some(l => l.mediaId === m.id && l.metricType === 'statusChange' && /from\s+Dropped/i.test(l.note || ''))) },
  { id: 'long_haul', name: 'The Long Haul', description: 'Complete a title that takes 40+ hours to beat.', category: 'Completion', rarity: 'Epic',
    earned: c => c.media.some(m => finished(m) && (estimateEffort(m).hours || 0) >= 40) },
  { id: 'speed_demon', name: 'Speed Demon', description: 'Start and finish a title within 7 days.', category: 'Completion', rarity: 'Rare',
    earned: c => { const fl = firstLastByMedia(c.logs); return c.media.some(m => { if (!finished(m)) return false; const e = fl.get(m.id); return !!e && e.last > e.first && (e.last - e.first) <= 7 * 86400000; }); } },
  { id: 'post_game', name: 'Post-Game', description: 'Take a media all the way to "Extras".', category: 'Completion', rarity: 'Rare',
    earned: c => c.media.some(m => m.status === 'Extras') },
  { id: 'backlog_slayer', name: 'Backlog Slayer', description: 'Complete 50 media in total.', category: 'Completion', rarity: 'Legendary',
    earned: c => c.media.filter(finished).length >= 50 },
];

export function evaluateAchievements(ctx: AchievementContext) {
  return ACHIEVEMENTS.map(a => ({ ...a, unlocked: a.earned(ctx) }));
}
