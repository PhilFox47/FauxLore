import { MediaItem, ProgressLog, getMetricForType, MediaType, WorldBoss } from '../types/schema';
import { calculateScaledDelta } from './scaling';
import { hasNewContent, isWaitingOnRelease } from './onHold';
import { groupLogsIntoSessions } from './sessions';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, differenceInDays, subHours } from 'date-fns';

export function getQTarget(title: string, timeframe: 'monthly' | 'weekly', def: number, settings: any, rng?: () => number) {
  if (settings?.questConfigs?.[title]?.[timeframe] !== undefined && settings?.questConfigs?.[title]?.[timeframe] !== null && String(settings?.questConfigs?.[title]?.[timeframe]).trim() !== '') {
    const valStr = String(settings.questConfigs[title][timeframe]).trim().toLowerCase();
    
    // Check if it's a range like "1-3" or "1~3" or "1 to 3"
    const match = valStr.match(/^(\d+)\s*[-~_x,]\s*(\d+)$/i);
    if (match && rng) {
        const min = parseInt(match[1], 10);
        const max = parseInt(match[2], 10);
        if (!isNaN(min) && !isNaN(max) && max >= min) {
            return Math.floor(rng() * (max - min + 1)) + min;
        }
    }

    const val = parseInt(valStr, 10);
    if (!isNaN(val)) return val;
  }
  return def;
}

export const QUEST_DEFINITIONS = [
  { id: '1', title: 'The Finisher', desc: 'Complete X total media item(s)', timeframes: ['monthly'], defaultMonthly: 'Random (1-3)' },
  { id: '2', title: 'The Specialist', desc: 'Complete X [Type](s)', timeframes: ['monthly'], defaultMonthly: 'Random (1-2)' },
  { id: '3', title: 'Endurance Trial', desc: 'Log X Master Pages overall', timeframes: ['monthly', 'weekly'], defaultMonthly: 'Dynamic', defaultWeekly: 'Dynamic' },
  { id: '4', title: 'The Polymath', desc: 'Complete items from X different media types', timeframes: ['monthly'], defaultMonthly: 3 },
  { id: '5', title: 'Scholar of the Arcane', desc: 'Complete X item(s) in a random genre', timeframes: ['monthly'], defaultMonthly: 'Random (1-2)' },
  { id: '6', title: "Time Traveler's Archive", desc: 'Consume X Master Pages of media released over 20 years ago', timeframes: ['monthly', 'weekly'], defaultMonthly: 50, defaultWeekly: 20 },
  { id: '7', title: "Vanguard's Report", desc: 'Consume X Master Pages of media released this year', timeframes: ['monthly', 'weekly'], defaultMonthly: 50, defaultWeekly: 20 },
  { id: '8', title: 'The Leviathan', desc: 'Complete X massive media item', timeframes: ['monthly'], defaultMonthly: 1 },
  { id: '9', title: 'Franchise Loyalist', desc: 'Complete X item belonging to a Franchise', timeframes: ['monthly'], defaultMonthly: 1 },
  { id: '10', title: 'The Backlog Slayer', desc: "Complete X item that has been 'Planning' for over 3 months", timeframes: ['monthly'], defaultMonthly: 1 },
  { id: '11', title: 'Consistent Chronicler', desc: 'Log progress on X different days', timeframes: ['monthly', 'weekly'], defaultMonthly: 15, defaultWeekly: 4 },
  { id: '12', title: 'Weekend Warrior', desc: 'Log progress on X unique weekend days', timeframes: ['monthly', 'weekly'], defaultMonthly: 5, defaultWeekly: 2 },
  { id: '13', title: 'The Sprinter', desc: 'Start and complete an item within 72 hours (Target: X items)', timeframes: ['monthly'], defaultMonthly: 1 },
  { id: '14', title: 'Binge Trance', desc: 'Achieve X+ Master Pages on a single item in one day', timeframes: ['monthly', 'weekly'], defaultMonthly: 'Dynamic', defaultWeekly: 'Dynamic' },
  { id: '15', title: "Scribe's Duty", desc: 'Write X meaningful journal entries', timeframes: ['monthly', 'weekly'], defaultMonthly: 10, defaultWeekly: 3 },
  { id: '16', title: "The Critic's Eye", desc: 'Finish and rate/review X item(s)', timeframes: ['monthly'], defaultMonthly: 'Random (1-2)' },
  { id: '17', title: 'Boss Hunter', desc: 'Defeat X World Bosses', timeframes: ['monthly'], defaultMonthly: 'Random (1-2)' },
  { id: '18', title: 'Relic Appraiser', desc: 'Obtain X new Artifacts', timeframes: ['monthly'], defaultMonthly: 3 },
  { id: '19', title: 'Level Grinder', desc: 'Gain approximately X base EXP', timeframes: ['monthly', 'weekly'], defaultMonthly: 5000, defaultWeekly: 1000 },
  { id: '20', title: 'Consecutive Commitment', desc: 'Log progress for X consecutive days', timeframes: ['weekly'], defaultWeekly: 3 },
  { id: '21', title: 'The Wanderer', desc: 'Log progress on X different media items', timeframes: ['weekly'], defaultWeekly: 3 },
  { id: '22', title: 'Deep Focus', desc: 'Log progress on the same media item at least X times', timeframes: ['weekly'], defaultWeekly: 4 },
  { id: '23', title: 'Genre Hopper', desc: 'Log Progress on X items that do not share any genres', timeframes: ['weekly'], defaultWeekly: 1 },
  { id: '24', title: 'Format Focus', desc: 'Gain X Master Pages exclusively in one format', timeframes: ['weekly'], defaultWeekly: 50 },
  { id: '25', title: 'The Initiator', desc: "Move X item's status from 'Planning' to 'Active'", timeframes: ['weekly'], defaultWeekly: 1 },
  { id: '26', title: 'Weekly Sprinter', desc: 'Complete X media item', timeframes: ['weekly'], defaultWeekly: 1 },
  { id: '27', title: "Reviewer's Strike", desc: 'Complete X item and rate/review it', timeframes: ['weekly'], defaultWeekly: 1 },
  { id: '29', title: 'Dust It Off', desc: 'Log progress on X item that has been sitting without updates', timeframes: ['weekly'], defaultWeekly: 1 },
  { id: '30', title: 'Marathon Session', desc: 'Have a single progress entry that yields X+ Master Pages in one sitting', timeframes: ['weekly'], defaultWeekly: 50 },
  { id: '31', title: 'Journalist', desc: 'Write X progress notes', timeframes: ['weekly'], defaultWeekly: 2 },
  { id: 'theme', title: 'Theme Quests', desc: 'Gain Master Pages in games/books of the monthly theme.', timeframes: ['monthly'], defaultMonthly: 10 },
];

export interface Quest {
  id: string;
  type: 'weekly' | 'monthly' | 'yearly';
  title: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  expReward: number;
  metric: string;
  isCompleted: boolean;
  isFailed: boolean; // For past quests that were not completed
}

export interface RPGState {
  currentExp: number;
  level: number;
  nextLevelExp: number;
  currentLevelExp: number;
  expProgress: number; // 0 to 1
  className: string;
  quests: Quest[];
  expBreakdown: {
    baseExp: number;
    armoryExp: number;
    questExp: number;
    bossExp: number;
    decayExp: number;
    penaltyExp: number;
  };
  mediaLevels: Record<string, { level: number; exp: number; nextLevelExp: number; currentLevelExp: number; expProgress: number; title: string }>;
}

// Exp threshold curve
/**
 * Taunting an enemy: it survives the week, but it comes back bigger.
 *
 * The target grows, and so do both the reward and the failure penalty. That
 * symmetry is the whole design — an extension that only softened a loss would
 * be a free escape hatch, whereas this is a bet. Once per enemy, one enemy at a
 * time, so it can never become a routine way to stall.
 */
export const ENRAGE_TARGET_MULTIPLIER = 1.25;
export const ENRAGE_REWARD_MULTIPLIER = 1.2;

export function getLevelForExp(exp: number): number {
  if (exp <= 0) return 1;
  let level = Math.floor(Math.sqrt(exp / 1000)) + 1;
  return Math.min(level, 100);
}

export function getExpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 1000 * Math.pow(level - 1, 2);
}

export function getLevelForMediaExp(exp: number): number {
  if (exp <= 0) return 1;
  let level = Math.floor(Math.sqrt(exp / 250)) + 1;
  return Math.min(level, 100);
}

export function getExpForMediaLevel(level: number): number {
  if (level <= 1) return 0;
  return 250 * Math.pow(level - 1, 2);
}

// Seeded PRNG
export function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}


/**
 * Whether an artifact's affinity covers a given media entry.
 *
 * The single source of truth for "does this item pay out here?", shared by EXP
 * calculation and the gear advisor — a recommendation that used different rules
 * to the scoreboard would be worse than no recommendation at all.
 */
export function artifactAppliesTo(a: any, item: MediaItem): boolean {
  // No affinity recorded: legacy/generic artifacts pay out on everything.
  if (!a?.targetType) return true;

  switch (a.targetType) {
    case 'Genre':
      return !!item.genres?.includes(a.targetValue);
    case 'Tag':
      return !!item.tags?.includes(a.targetValue);
    case 'MediaType':
      return item.mediaType === a.targetValue;
    case 'Franchise':
      return (
        !!item.franchises?.includes(a.targetValue || '') ||
        item.title.toLowerCase().includes((a.targetValue || '').toLowerCase())
      );
    default:
      return false;
  }
}

export function calculateLogExpBreakdown(delta: number, item: MediaItem, settings: any, equippedArtifacts: any[]): { base: number, armory: number } {
  let logExp = calculateScaledDelta(delta, item, settings);
  let multiplier = 1.0;
  equippedArtifacts.forEach((a: any) => {
    if (artifactAppliesTo(a, item)) {
      // Use ?? so a fully-broken item (durability 0) yields a 0 ratio and no bonus,
      // instead of `|| 100` which treated 0 as full durability.
      const durabilityRatio = (a.durability ?? 100) / (a.maxDurability || 100);
      const itemBonusPct = (a.bonusPercent ?? 20) / 100;
      multiplier += itemBonusPct * durabilityRatio;
    }
  });
  return { base: logExp, armory: logExp * multiplier - logExp };
}

export function calculateLogExp(delta: number, item: MediaItem, settings: any, equippedArtifacts: any[]): number {
  const { base, armory } = calculateLogExpBreakdown(delta, item, settings, equippedArtifacts);
  return base + armory;
}

export function calculateRPGState(
  media: MediaItem[], 
  logs: ProgressLog[], 
  settings: any, 
  worldBosses: WorldBoss[] = [], 
  artifacts: any[] = [],
  evalDate: any = new Date()
): RPGState {
  // Ensure evalDate is a Date object
  const realNow = evalDate instanceof Date ? evalDate : new Date(evalDate);
  const now = subHours(realNow, 5);
  
  // Filter historical
  const validLogs = logs.filter(l => l && l.timestamp && !l.isHistoric && !l.timestamp.startsWith('1970-01-01'));
  
  // Initialize Media level EXP trackers
  const ALL_MEDIA_TYPES: MediaType[] = ['Game', 'Book', 'Audiobook', 'Visual Novel', 'Manga', 'Series', 'Movie', 'Comic'];
  const mediaExpTrackers: Record<string, number> = {};
  ALL_MEDIA_TYPES.forEach(t => mediaExpTrackers[t] = 0);

  // Base EXP is recomputed live per log, but the Artifact (Armory) bonus is NOT.
  // Each log banks the bonus multiplier that was active at the moment it was created
  // (see POST /api/logs). Items therefore only ever buff the specific logs made while
  // they were equipped — never the entire history retroactively.
  let baseExp = 0;
  let armoryExp = 0;

  validLogs.forEach(log => {
    if (log.metricType === 'statusChange') return; // Status changes don't grant EXP

    const item = media.find(m => m.id === log.mediaId);
    if (item) {
      const base = calculateScaledDelta(log.delta, item, settings);
      const armory = base * (log.bonusMultiplier || 0);
      baseExp += base;
      armoryExp += armory;
      mediaExpTrackers[item.mediaType] += (base + armory);
    }
  });

  let penaltyExp = 0;
  media.forEach(m => {
    if (m.status === 'Dropped' && !m.isOngoing) {
      penaltyExp -= 500;
      mediaExpTrackers[m.mediaType] -= 500;
    }
  });

  let bossExp = 0;
  // Boss Rewards and Penalties
  worldBosses.forEach(boss => {
    // Taunting raises both sides of the bet, which is what keeps it from being a
    // way to dodge a loss: the enemy you could not finish now costs more to lose.
    const stakes = boss.enraged ? ENRAGE_REWARD_MULTIPLIER : 1;
    // level: 1(50exp), 2(100), 3(200), 4(400), 5(1000)
    let bExp = 0;
    if (boss.level === 1) bExp = 100;
    else if (boss.level === 2) bExp = 200;
    else if (boss.level === 3) bExp = 400;
    else if (boss.level === 4) bExp = 800;
    else if (boss.level === 5) bExp = 2000;

    const bossMedia = media.find(m => m.id === boss.mediaId);
    const mType = bossMedia ? bossMedia.mediaType : null;

    if (boss.status === 'Defeated') {
      let payoutPercent = 1.0;
      if (boss.currentProgress < boss.targetProgress && boss.targetProgress > 0) {
        const ratio = boss.currentProgress / boss.targetProgress;
        payoutPercent = Math.min(1.0, ratio * 2);
      }
      const actualExp = Math.round(bExp * payoutPercent * stakes);
      bossExp += actualExp;
      if (mType) mediaExpTrackers[mType] += (actualExp * 2);
    } else if (boss.status === 'Failed') {
      let penaltyPercent = 1.0;
      if (bossMedia && bossMedia.status === 'Dropped') {
        penaltyPercent = 0.5;
      }
      const actualPenalty = Math.round(bExp * penaltyPercent * stakes);
      penaltyExp -= actualPenalty;
      if (mType) mediaExpTrackers[mType] -= (actualPenalty * 2);
    }
  });

  let decayExp = 0;
  if (validLogs.length > 0) {
    const dates = validLogs.map(l => subHours(parseISO(l.timestamp), 5).getTime()).sort((a, b) => a - b);
    for (let i = 1; i < dates.length; i++) {
      const days = differenceInDays(dates[i], dates[i-1]);
      if (days > 3) decayExp -= (days - 3) * 50;
    }
    const daysSinceLast = differenceInDays(now, dates[dates.length - 1]);
    if (daysSinceLast > 3) decayExp -= (daysSinceLast - 3) * 50;
  }

  let questExp = 0;
  
  const currentYear = now.getFullYear();
  const currentWeekInfo = format(now, "RRRR-II");
  const currentMonthInfo = format(now, "yyyy-MM");
  
  const currentWeekLogs = validLogs.filter(l => isWithinInterval(subHours(parseISO(l.timestamp), 5), { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }));
  const currentMonthLogs = validLogs.filter(l => isWithinInterval(subHours(parseISO(l.timestamp), 5), { start: startOfMonth(now), end: endOfMonth(now) }));
  const currentYearLogs = validLogs.filter(l => isWithinInterval(subHours(parseISO(l.timestamp), 5), { start: startOfYear(now), end: endOfYear(now) }));

  const quests: Quest[] = [];

  const rngWeek = mulberry32(parseInt(currentWeekInfo.replace('-', '')));
  const rngMonth = mulberry32(parseInt(currentMonthInfo.replace('-', '')));
  const rngYear = mulberry32(currentYear);

  // 1. Gather all unique time intervals across all logs
  const allYears = new Set<string>();
  const allMonths = new Set<string>();
  const allWeeks = new Set<string>();

  validLogs.forEach(l => {
    const d = subHours(parseISO(l.timestamp), 5);
    allYears.add(format(d, "yyyy"));
    allMonths.add(format(d, "yyyy-MM"));
    allWeeks.add(format(startOfWeek(d, { weekStartsOn: 1 }), "RRRR-II"));
  });

  // Make sure current intervals are always included, even if no logs yet
  allYears.add(currentYear.toString());
  allMonths.add(currentMonthInfo);
  allWeeks.add(currentWeekInfo);

  // Helper arrays
  // quests already declared above on line 95, we just reuse it or clear it. Wait, the above is:
  // `const quests: Quest[] = [];` Let's just remove this redundant declaration.

  // 2. Iterate backwards or just normally and compute
  for (const year of Array.from(allYears)) {
    const yearLogs = validLogs.filter(l => format(subHours(parseISO(l.timestamp), 5), "yyyy") === year);
    const tempQuests: Quest[] = [];
    generateYearlyQuests(tempQuests, yearLogs, media, settings, year);
    tempQuests.forEach(q => { if (q.isCompleted) questExp += q.expReward; });
    if (year === currentYear.toString()) quests.push(...tempQuests);
  }

  for (const month of Array.from(allMonths)) {
    const monthLogs = validLogs.filter(l => format(subHours(parseISO(l.timestamp), 5), "yyyy-MM") === month);
    const tempQuests: Quest[] = [];
    const rng = mulberry32(parseInt(month.replace('-', '')));
    generateIntervalQuests(tempQuests, monthLogs, media, settings, 'monthly', month, 6, rng, worldBosses, artifacts, validLogs);
    tempQuests.forEach(q => { if (q.isCompleted) questExp += q.expReward; });
    if (month === currentMonthInfo) quests.push(...tempQuests);
  }

  for (const week of Array.from(allWeeks)) {
    const weekLogs = validLogs.filter(l => format(startOfWeek(subHours(parseISO(l.timestamp), 5), { weekStartsOn: 1 }), "RRRR-II") === week);
    const tempQuests: Quest[] = [];
    const rng = mulberry32(parseInt(week.replace('-', '')));
    generateIntervalQuests(tempQuests, weekLogs, media, settings, 'weekly', week, 4, rng, worldBosses, artifacts, validLogs);
    tempQuests.forEach(q => { if (q.isCompleted) questExp += q.expReward; });
    if (week === currentWeekInfo) quests.push(...tempQuests);
  }

  const totalExp = Math.max(0, baseExp + armoryExp + questExp + bossExp + decayExp + penaltyExp);
  const level = getLevelForExp(totalExp);
  
  const currentLevelExp = getExpForLevel(level);
  const nextLevelExp = getExpForLevel(level + 1);
  const expProgress = level === 100 ? 1 : ((totalExp - currentLevelExp) / (nextLevelExp - currentLevelExp));

  const classNames = [
    "The Initiate", "Novice Tracker", "Apprentice Reader", "Journeyman Gamer", 
    "Adept Watcher", "Lore Seeker", "Dungeon Diver", "Page Turner", 
    "Media Scholar", "Binge Archmage", "Master of Backlogs", "Grandmaster",
    "Omniscient Observer", "The Legend", "Mythic Lorekeeper"
  ];
  let classIdx = Math.floor(level / 7);
  if (classIdx >= classNames.length) classIdx = classNames.length - 1;

  let gameCount = media.filter(m => m.mediaType === 'Game').length;
  let bookCount = media.filter(m => m.mediaType === 'Book').length;
  let prefix = "";
  if (gameCount > bookCount * 2) prefix = "Digital ";
  if (bookCount > gameCount * 2) prefix = "Literary ";

  const mediaLevels: Record<string, { level: number; exp: number; nextLevelExp: number; currentLevelExp: number; expProgress: number; title: string }> = {};
  const mediaTitles: Record<string, string> = {
    'Game': 'Novice Gamer',
    'Book': 'Light Reader',
    'Audiobook': 'New Listener',
    'Visual Novel': 'Story Skimmer',
    'Manga': 'Panel Browser',
    'Series': 'Occasional Streamer',
    'Movie': 'Moviegoer',
    'Comic': 'Issue Flipper'
  };

  ALL_MEDIA_TYPES.forEach(t => {
    const tExp = Math.max(0, mediaExpTrackers[t]);
    const mLevel = getLevelForMediaExp(tExp);
    const cur = getExpForMediaLevel(mLevel);
    const next = getExpForMediaLevel(mLevel + 1);
    const prog = mLevel === 100 ? 1 : ((tExp - cur) / (next - cur));
    
    // Also include questExp in a simpler way if they want it later? 
    // Wait, prompt: "While Quests EXP does not apply here" - okay.

    mediaLevels[t] = {
      level: mLevel,
      exp: tExp,
      nextLevelExp: next,
      currentLevelExp: cur,
      expProgress: prog,
      title: mediaTitles[t]
    };
  });

  return {
    currentExp: totalExp,
    level,
    nextLevelExp,
    currentLevelExp,
    expProgress,
    className: prefix + classNames[classIdx],
    quests,
    expBreakdown: { baseExp, armoryExp, questExp, bossExp, decayExp, penaltyExp },
    mediaLevels
  };
}

const DEFAULT_YEARLY_GOALS: Record<MediaType, number> = {
  'Game': 100, 'Book': 5000, 'Visual Novel': 50, 'Manga': 200, 'Series': 100, 'Movie': 20, 'Comic': 100, 'Audiobook': 50
};
export const NATIVE_UNIT_LABELS: Record<MediaType, string> = {
  'Game': 'Hours Played',
  'Book': 'Pages Read',
  'Audiobook': 'Hours Listened',
  'Visual Novel': 'Hours Played',
  'Manga': 'Chapters Read',
  'Series': 'Episodes Watched',
  'Movie': 'Movies Watched',
  'Comic': 'Issues Read'
};
const PRIMARY_METRICS: Record<MediaType, string> = {
  'Game': 'playtimeHours',
  'Visual Novel': 'playtimeHours',
  'Audiobook': 'playtimeHours',
  'Book': 'pagesRead',
  'Manga': 'chaptersRead',
  'Series': 'episodesWatched',
  'Movie': 'watchCount',
  'Comic': 'issuesRead'
};

const MEDIA_TYPES: MediaType[] = ['Game', 'Book', 'Visual Novel', 'Manga', 'Series', 'Movie', 'Comic', 'Audiobook'];

const MONTH_THEMES: Record<number, { name: string, tags: string[], desc: string }> = {
  1: { name: "New Beginnings", tags: ["Action", "Adventure", "Sci-Fi", "Mystery"], desc: "Kick off the year with" },
  2: { name: "Season of Love", tags: ["Romance", "Drama", "Slice of Life", "Dating Sim", "Otome"], desc: "Swoon over" },
  3: { name: "Spring Awakening", tags: ["Fantasy", "Magic", "Nature", "Comedy", "Wholesome"], desc: "Embrace the bloom with" },
  4: { name: "Fools & Humor", tags: ["Comedy", "Parody", "Satire", "Gag"], desc: "Laugh out loud to" },
  5: { name: "May Madness", tags: ["Action", "Mecha", "Sports", "Fighting"], desc: "Get pumped with" },
  6: { name: "Summer Vibes", tags: ["Adventure", "Slice of Life", "Travel", "Beach"], desc: "Enjoy the sun with" },
  7: { name: "Midsummer Night", tags: ["Sci-Fi", "Cyberpunk", "Space", "Futuristic"], desc: "Look to the stars with" },
  8: { name: "August Heat", tags: ["Thriller", "Action", "Survival", "Post-Apocalyptic"], desc: "Survive the heat in" },
  9: { name: "Scholars & History", tags: ["School", "Coming of Age", "Historical", "Documentary"], desc: "Learn something new from" },
  10: { name: "Spooky Season", tags: ["Horror", "Thriller", "Supernatural", "Vampire", "Zombie", "Dark"], desc: "Face your fears in" },
  11: { name: "Cozy Autumn", tags: ["Slice of Life", "Mystery", "Detective", "Cozy"], desc: "Curl up with" },
  12: { name: "Winter Wonderland", tags: ["Fantasy", "Family", "Emotional", "Drama", "Holiday"], desc: "Warm your heart with" },
};

function getYearlyGoals(settings: any) {
  return { ...DEFAULT_YEARLY_GOALS, ...(settings?.yearlyGoals || {}) };
}

export function getMasterPagesForNativeUnit(amount: number, mediaType: MediaType, settings: any) {
   const mpConfig = settings?.masterPageConfig || {};
   switch (mediaType) {
     case 'Book': return amount;
     case 'Audiobook': return amount * (mpConfig.audiobookPagesPerHour ?? 30);
     case 'Game': return amount * (mpConfig.gamePagesPerHour ?? 12);
     case 'Visual Novel': return amount * (mpConfig.vnPagesPerHour ?? 24);
     case 'Manga': return amount * (mpConfig.mangaPagesPerChapter ?? 5);
     case 'Comic': return amount * (mpConfig.comicPagesPerIssue ?? 20);
     case 'Series': return amount * (mpConfig.episodesWatchedMultiplier ?? 30);
     case 'Movie': return amount * (mpConfig.moviePagesPerMovie ?? 100);
     default: return amount;
   }
}

export function calculateNativeUnits(logs: ProgressLog[], media: MediaItem[], mediaType: MediaType) {
   const primaryMetric = PRIMARY_METRICS[mediaType];
   
   return logs.reduce((acc, log) => {
     const item = media.find(m => m.id === log.mediaId);
     if (item && item.mediaType === mediaType && log.metricType === primaryMetric) {
        return acc + log.delta;
     }
     return acc;
   }, 0);
}

function calculateMasterPages(logs: ProgressLog[], media: MediaItem[], settings: any, specificType: MediaType | null = null) {
  return logs.reduce((acc, log) => {
    if (log.metricType === 'statusChange') return acc;
    const item = media.find(m => m.id === log.mediaId);
    if (!item || (specificType && item.mediaType !== specificType)) return acc;
    return acc + calculateScaledDelta(log.delta, item, settings);
  }, 0);
}

function generateYearlyQuests(quests: Quest[], logs: ProgressLog[], media: MediaItem[], settings: any, timeId: string) {
  const goals = getYearlyGoals(settings);
  let totalGoal = 0;
  let currentTotalAmount = 0;

  MEDIA_TYPES.forEach((type, idx) => {
    const target = goals[type];
    if (!target || target <= 0) return;

    const mpTarget = getMasterPagesForNativeUnit(target, type, settings);
    totalGoal += mpTarget;
    
    currentTotalAmount += calculateMasterPages(logs, media, settings, type);
    const currentAmount = calculateNativeUnits(logs, media, type);

    let verb = "Consume";
    if (type === 'Game') verb = "Play";
    else if (['Book', 'Manga', 'Comic', 'Visual Novel'].includes(type)) verb = "Read";
    else verb = "Watch";

    quests.push({
      id: `${timeId}-yearly-${idx}`,
      type: 'yearly',
      title: `${type} Mastery`,
      description: `${verb} ${target} ${NATIVE_UNIT_LABELS[type]} this year.`,
      targetAmount: target,
      currentAmount: Math.floor(currentAmount),
      expReward: 10000, // Fixed 10,000 for completing a specific Yearly Quest
      metric: 'pages',
      isCompleted: currentAmount >= target,
      isFailed: false
    });
  });

  if (totalGoal > 0) {
    quests.push({
      id: `${timeId}-yearly-total`,
      type: 'yearly',
      title: 'Grandmaster of Media',
      description: `Consume ${totalGoal} Master Pages across all formats this year.`,
      targetAmount: totalGoal,
      currentAmount: Math.floor(currentTotalAmount),
      expReward: 50000, // Fixed 50,000 for completing the ultimate total Yearly Quest
      metric: 'pages',
      isCompleted: currentTotalAmount >= totalGoal,
      isFailed: false
    });
  }
}

/**
 * Every quest belongs to a theme. The picker allows at most one quest per theme per
 * interval, which is what stops near-duplicates landing together (two weekend
 * quests, or "log on 3 days" beside "log on 5 days").
 */
const QUEST_CATEGORY: Record<string, string> = {
  // volume: raw Master Pages
  'Endurance Trial': 'volume', 'Level Grinder': 'volume', 'Format Focus': 'volume',
  'Binge Trance': 'volume', 'Marathon Session': 'volume', 'Momentum': 'volume',
  // rhythm: when and how often you show up
  'Consistent Chronicler': 'rhythm', 'Weekend Warrior': 'rhythm', 'Consecutive Commitment': 'rhythm',
  'Night Shift': 'rhythm', 'First Light': 'rhythm',
  // breadth: spreading across different things
  'The Wanderer': 'breadth', 'Genre Hopper': 'breadth', 'The Polymath': 'breadth',
  'Format Sampler': 'breadth', 'Balanced Diet': 'breadth',
  // depth: going deep on one thing
  'Deep Focus': 'depth', 'The Long Haul': 'depth', 'Deep Diver': 'depth',
  // completion: finishing things
  'The Finisher': 'completion', 'The Specialist': 'completion', 'Weekly Sprinter': 'completion',
  'The Sprinter': 'completion', 'The Leviathan': 'completion', 'Home Stretch': 'completion',
  // revival: returning to neglected things
  'Dust It Off': 'revival', 'The Backlog Slayer': 'revival', 'Off the Shelf': 'revival',
  'The Understudy': 'revival',
  // reflection: notes, ratings, reviews
  "Scribe's Duty": 'reflection', 'Journalist': 'reflection', "The Critic's Eye": 'reflection',
  "Reviewer's Strike": 'reflection',
  // curiosity: taxonomy and provenance oddities
  "Time Traveler's Archive": 'curiosity', "Vanguard's Report": 'curiosity',
  'Franchise Loyalist': 'curiosity', 'Scholar of the Arcane': 'curiosity',
  'Road Trip': 'curiosity', 'Creator Study': 'curiosity', 'Franchise Focus': 'curiosity',
  // rpg: bosses and loot
  'Boss Hunter': 'rpg', 'Relic Appraiser': 'rpg',
};

function generateIntervalQuests(quests: Quest[], logs: ProgressLog[], media: MediaItem[], settings: any, timeframe: 'monthly' | 'weekly', timeId: string, count: number, rng: () => number, worldBosses: WorldBoss[] = [], artifacts: any[] = [], allLogs: ProgressLog[] = []) {
  const goals = getYearlyGoals(settings);
  let totalMasterPagesGoal = 0;
  MEDIA_TYPES.forEach(t => {
     totalMasterPagesGoal += getMasterPagesForNativeUnit(goals[t], t, settings);
  });
  
  const divisor = timeframe === 'monthly' ? 12 : 52;
  const baseReward = timeframe === 'monthly' ? 500 : 100; // Monthly yields 500-1000, Weekly yields 100-200.

  const validMedia = new Set(logs.map(l => media.find(m => m.id === l.mediaId)?.mediaType).filter(Boolean));

  // Fun Challenge Templates
  const templates = [
    () => { // 1. The Finisher
      if (timeframe === 'weekly') return null;
      const target = getQTarget("The Finisher", timeframe, Math.floor(rng() * 3) + 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      const validLogs = logs.filter(l => l.metricType === 'statusChange' && (l.note?.includes('to Completed') || l.note?.includes('to Extras')));
      const current = new Set(validLogs.map(l => l.mediaId)).size;
      return { title: "The Finisher", desc: "Complete " + target + " total media item(s)", target, current, type: 'entries' as const, reward: baseReward * 2 };
    },
    () => { // 2. The Specialist
      if (timeframe === 'weekly') return null;
      const possibleTypes = MEDIA_TYPES.filter(t => goals[t] > 0);
      if (possibleTypes.length === 0) return null;
      const chosenType = possibleTypes[Math.floor(rng() * possibleTypes.length)];
      const target = getQTarget("The Specialist", timeframe, Math.floor(rng() * 2) + 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      const validLogs = logs.filter(l => {
        if (l.metricType !== 'statusChange' || !(l.note?.includes('to Completed') || l.note?.includes('to Extras'))) return false;
        const m = media.find(x => x.id === l.mediaId);
        return m?.mediaType === chosenType;
      });
      const current = new Set(validLogs.map(l => l.mediaId)).size;
      return { title: "The Specialist", desc: "Complete " + target + " " + chosenType + "(s)", target, current, type: 'entries' as const, reward: baseReward * 2 };
    },
    () => { // 3. Endurance Trial
      const target = getQTarget("Endurance Trial", timeframe, Math.max(10, Math.floor(totalMasterPagesGoal / divisor)), settings, typeof rng !== 'undefined' ? rng : undefined); // 5 for approx. a fifth, but divisor handles weekly/monthly scaling
      const current = calculateMasterPages(logs, media, settings);
      return { title: "Endurance Trial", desc: `Log a massive ${target} Master Pages overall`, target, current, type: 'pages' as const, reward: baseReward * 3 };
    },
    () => { // 4. The Polymath
      if (timeframe === 'weekly') return null;
      const target = getQTarget("The Polymath", timeframe, 3, settings, typeof rng !== 'undefined' ? rng : undefined);
      const typesSet = new Set();
      logs.filter(l => l.metricType === 'statusChange' && (l.note?.includes('to Completed') || l.note?.includes('to Extras'))).forEach(l => {
        const m = media.find(x => x.id === l.mediaId);
        if (m) typesSet.add(m.mediaType);
      });
      return { title: "The Polymath", desc: `Complete items from ${target} different media types`, target, current: typesSet.size, type: 'entries' as const, reward: baseReward * 3 };
    },
    () => { // 5. Scholar of the Arcane
      if (timeframe === 'weekly') return null;
      const allGenres = Array.from(new Set(media.flatMap(m => m.genres || [])));
      const chosenGenre = allGenres[Math.floor(rng() * allGenres.length)] || 'Fantasy';
      const target = getQTarget("Scholar of the Arcane", timeframe, Math.floor(rng() * 2) + 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      const validLogs = logs.filter(l => {
        if (l.metricType !== 'statusChange' || !(l.note?.includes('to Completed') || l.note?.includes('to Extras'))) return false;
        const m = media.find(x => x.id === l.mediaId);
        return m?.genres?.includes(chosenGenre);
      });
      const current = new Set(validLogs.map(l => l.mediaId)).size;
      return { title: "Scholar of the Arcane", desc: `Complete ${target} item(s) in the '${chosenGenre}' genre`, target, current, type: 'entries' as const, reward: baseReward * 2.5 };
    },
    () => { // 6. Time Traveler's Archive
      const target = getQTarget("Time Traveler's Archive", timeframe, timeframe === 'monthly' ? 50 : 20, settings, typeof rng !== 'undefined' ? rng : undefined);
      const currentYear = new Date().getFullYear();
      let current = 0;
      logs.forEach(l => {
        const m = media.find(x => x.id === l.mediaId);
        if (m && m.year && m.year <= currentYear - 20) {
          current += calculateScaledDelta(l.delta, m, settings);
        }
      });
      return { title: "Time Traveler's Archive", desc: `Consume ${target} Master Pages of media released over 20 years ago`, target, current: Math.floor(current), type: 'pages' as const, reward: baseReward * 2 };
    },
    () => { // 7. Vanguard's Report
      const target = getQTarget("Vanguard's Report", timeframe, timeframe === 'monthly' ? 50 : 20, settings, typeof rng !== 'undefined' ? rng : undefined);
      const currentYear = new Date().getFullYear();
      let current = 0;
      logs.forEach(l => {
        const m = media.find(x => x.id === l.mediaId);
        if (m && m.year === currentYear) {
          current += calculateScaledDelta(l.delta, m, settings);
        }
      });
      return { title: "Vanguard's Report", desc: `Consume ${target} Master Pages of media released this year`, target, current: Math.floor(current), type: 'pages' as const, reward: baseReward * 1.5 };
    },
    () => { // 8. The Leviathan
      if (timeframe === 'weekly') return null;
      const target = getQTarget("The Leviathan", timeframe, 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      const validLogs = logs.filter(l => {
        if (l.metricType !== 'statusChange' || !(l.note?.includes('to Completed') || l.note?.includes('to Extras'))) return false;
        const m = media.find(x => x.id === l.mediaId);
        if (!m) return false;
        if (m.mediaType === 'Game' && m.playtimeHours && m.playtimeHours >= 80) return true;
        if (m.mediaType === 'Book' && m.totalPages && m.totalPages >= 800) return true;
        if (m.mediaType === 'Series' && m.totalEpisodes && m.totalEpisodes >= 50) return true;
        return false;
      });
      const current = new Set(validLogs.map(l => l.mediaId)).size;
      return { title: "The Leviathan", desc: `Complete ${target} massive media item(s) (e.g. 80+ Hr Game, 800+ Pg Book)`, target, current, type: 'entries' as const, reward: baseReward * 5 };
    },
    () => { // 9. Franchise Loyalist
      if (timeframe === 'weekly') return null;
      const target = getQTarget("Franchise Loyalist", timeframe, 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      const validLogs = logs.filter(l => {
        if (l.metricType !== 'statusChange' || !(l.note?.toLowerCase().includes('to completed') || l.note?.toLowerCase().includes('to extras'))) return false;
        const m = media.find(x => x.id === l.mediaId);
        return m?.franchises && m.franchises.length > 0;
      });
      const current = new Set(validLogs.map(l => l.mediaId)).size;
      return { title: "Franchise Loyalist", desc: `Complete ${target} item(s) belonging to a Franchise`, target, current, type: 'entries' as const, reward: baseReward * 1.5 };
    },
    () => { // 10. The Backlog Slayer
      if (timeframe === 'weekly') return null;
      const target = getQTarget("The Backlog Slayer", timeframe, 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const backlogItems = media.filter(m => m.status === 'Planning' && new Date(m.createdAt) < threeMonthsAgo);
      if (backlogItems.length < 3) return null; // Skip if backlog is small
      
      const validLogs = logs.filter(l => {
        if (l.metricType !== 'statusChange' || !(l.note?.includes('to Completed') || l.note?.includes('to Extras'))) return false;
        const m = media.find(x => x.id === l.mediaId);
        return m && new Date(m.createdAt) < threeMonthsAgo;
      });
      const current = new Set(validLogs.map(l => l.mediaId)).size;
      return { title: "The Backlog Slayer", desc: `Complete ${target} item(s) that has been 'Planning' for over 3 months`, target, current, type: 'entries' as const, reward: baseReward * 3 };
    },
    () => { // 11. Consistent Chronicler
      const target = getQTarget("Consistent Chronicler", timeframe, timeframe === 'monthly' ? 15 : 4, settings, typeof rng !== 'undefined' ? rng : undefined);
      const days = new Set(logs.map(l => format(subHours(parseISO(l.timestamp), 5), "yyyy-MM-dd"))).size;
      return { title: "Consistent Chronicler", desc: `Log progress on ${target} different days`, target, current: days, type: 'entries' as const, reward: baseReward * 2 };
    },
    () => { // 12. Weekend Warrior
      const target = getQTarget("Weekend Warrior", timeframe, timeframe === 'monthly' ? 5 : 2, settings, typeof rng !== 'undefined' ? rng : undefined);
      const current = new Set(logs.filter(l => {
        const d = subHours(parseISO(l.timestamp), 5).getDay();
        return d === 0 || d === 6; // Sunday or Saturday
      }).map(l => format(subHours(parseISO(l.timestamp), 5), "yyyy-MM-dd"))).size;
      return { title: "Weekend Warrior", desc: `Log progress on ${target} unique weekend days`, target, current, type: 'entries' as const, reward: baseReward * 1.5 };
    },
    () => { // 13. The Sprinter
      if (timeframe === 'weekly') return null;
      const target = getQTarget("The Sprinter", timeframe, 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      const completedLogs = logs.filter(l => l.metricType === 'statusChange' && (l.note?.includes('to Completed') || l.note?.includes('to Extras')));
      const validMediaIds = new Set<string>();
      completedLogs.forEach(cL => {
        const earliestLog = allLogs.find(l => l.mediaId === cL.mediaId && l.metricType !== 'statusChange');
        if (earliestLog) {
          const diffMs = new Date(cL.timestamp).getTime() - new Date(earliestLog.timestamp).getTime();
          if (diffMs <= 72 * 60 * 60 * 1000) {
            validMediaIds.add(cL.mediaId);
          }
        }
      });
      const current = validMediaIds.size;
      return { title: "The Sprinter", desc: `Start and complete ${target} item(s) within 72 hours`, target, current, type: 'entries' as const, reward: baseReward * 4 };
    },
    () => { // 14. Binge Trance
      const target = getQTarget("Binge Trance", timeframe, Math.max(50, Math.floor(totalMasterPagesGoal / 52)), settings, typeof rng !== 'undefined' ? rng : undefined);
      let current = 0;
      const dayMap: Record<string, number> = {};
      logs.forEach(l => {
        const m = media.find(x => x.id === l.mediaId);
        if (m) {
          const day = format(subHours(parseISO(l.timestamp), 5), "yyyy-MM-dd");
          const key = day + "_" + m.id;
          dayMap[key] = (dayMap[key] || 0) + calculateScaledDelta(l.delta, m, settings);
        }
      });
      for (const val of Object.values(dayMap)) {
        if (val > current) current = val;
      }
      return { title: "Binge Trance", desc: `Achieve ${target} Master Pages on a single item in one day`, target, current: Math.floor(current), type: 'pages' as const, reward: baseReward * 3 };
    },
    () => { // 15. Scribe's Duty
      const target = getQTarget("Scribe's Duty", timeframe, timeframe === 'monthly' ? 10 : 3, settings, typeof rng !== 'undefined' ? rng : undefined);
      const current = logs.filter(l => l.note && l.note.trim().length >= 10).length;
      return { title: "Scribe's Duty", desc: `Write ${target} meaningful journal entries (10+ characters) attaching them to progress logs`, target, current, type: 'entries' as const, reward: baseReward * 2 };
    },
    () => { // 16. The Critic's Eye
      if (timeframe === 'weekly') return null;
      const target = getQTarget("The Critic's Eye", timeframe, Math.floor(rng() * 2) + 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      const validLogs = logs.filter(l => {
         if (l.metricType !== 'statusChange' || !(l.note?.includes('to Completed') || l.note?.includes('to Extras'))) return false;
         const m = media.find(x => x.id === l.mediaId);
         return m && ((m.userRating || 0) > 0 || (m.userReview && m.userReview.trim().length > 0));
      });
      const current = new Set(validLogs.map(l => l.mediaId)).size;
      return { title: "The Critic's Eye", desc: `Finish and rate or review ${target} item(s)`, target, current, type: 'entries' as const, reward: baseReward * 2 };
    },
    () => { // 17. Boss Hunter
      if (timeframe === 'weekly') return null;
      const target = getQTarget("Boss Hunter", timeframe, Math.floor(rng() * 2) + 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      const current = worldBosses.filter(b => b.status === 'Defeated' && b.updatedAt && format(subHours(parseISO(b.updatedAt), 5), 'yyyy-MM') === timeId).length;
      return { title: "Boss Hunter", desc: `Defeat ${target} World Bosses`, target, current, type: 'entries' as const, reward: baseReward * 3 };
    },
    () => { // 18. Relic Appraiser
      if (timeframe === 'weekly') return null;
      const target = getQTarget("Relic Appraiser", timeframe, timeframe === 'monthly' ? 3 : 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      const current = artifacts.filter(a => a.earnedAt && format(subHours(parseISO(a.earnedAt), 5), 'yyyy-MM') === timeId).length;
      return { title: "Relic Appraiser", desc: `Obtain ${target} new Artifacts`, target, current, type: 'entries' as const, reward: baseReward * 2 };
    },
    () => { // 19. Level Grinder
      const targetExp = getQTarget("Level Grinder", timeframe, timeframe === 'monthly' ? 5000 : 1000, settings, typeof rng !== 'undefined' ? rng : undefined);
      const currentExp = calculateMasterPages(logs, media, settings); 
      return { title: "Level Grinder", desc: `Gain approximately ${targetExp} base EXP`, target: targetExp, current: currentExp, type: 'pages' as const, reward: baseReward * 2 };
    },
    () => { // 20. Consecutive Commitment
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Consecutive Commitment", timeframe, 3, settings, typeof rng !== 'undefined' ? rng : undefined);
      const days = Array.from(new Set(logs.map(l => format(subHours(parseISO(l.timestamp), 5), "yyyy-MM-dd")))).sort();
      let maxConsecutive = 0;
      let currentConsecutive = 1;
      for (let i = 1; i < days.length; i++) {
         const d1 = new Date(days[i-1] + "T00:00:00Z");
         const d2 = new Date(days[i] + "T00:00:00Z");
         if (d2.getTime() - d1.getTime() <= 24 * 60 * 60 * 1000 + 1000) {
            currentConsecutive++;
         } else {
            if (currentConsecutive > maxConsecutive) maxConsecutive = currentConsecutive;
            currentConsecutive = 1;
         }
      }
      if (currentConsecutive > maxConsecutive) maxConsecutive = currentConsecutive;
      if (days.length === 0) maxConsecutive = 0;
      return { title: "Consecutive Commitment", desc: `Log progress for ${target} consecutive days during the week`, target, current: maxConsecutive, type: 'entries' as const, reward: baseReward * 2 };
    },
    () => { // 21. The Wanderer
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("The Wanderer", timeframe, 3, settings, typeof rng !== 'undefined' ? rng : undefined);
      const uniqueItems = new Set(logs.map(l => l.mediaId)).size;
      return { title: "The Wanderer", desc: `Taste a little bit of everything. Log progress on ${target} different media items in a single week`, target, current: uniqueItems, type: 'entries' as const, reward: baseReward * 2 };
    },
    () => { // 22. Deep Focus
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Deep Focus", timeframe, 4, settings, typeof rng !== 'undefined' ? rng : undefined);
      const counts: Record<string, number> = {};
      logs.forEach(l => { counts[l.mediaId] = (counts[l.mediaId] || 0) + 1; });
      const maxLogs = Object.keys(counts).length > 0 ? Math.max(...Object.values(counts)) : 0;
      return { title: "Deep Focus", desc: `Dedicate yourself to one world. Log progress on the same media item at least ${target} times in the week`, target, current: maxLogs, type: 'entries' as const, reward: baseReward * 2 };
    },
    () => { // 23. Genre Hopper
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Genre Hopper", timeframe, 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      let current = 0;
      const unqMediaIds = Array.from(new Set(logs.map(l => l.mediaId)));
      const items = unqMediaIds.map(id => media.find(m => m.id === id)).filter(Boolean) as MediaItem[];
      
      for (let i = 0; i < items.length; i++) {
         for (let j = i + 1; j < items.length; j++) {
            const genresA = items[i].genres || [];
            const genresB = items[j].genres || [];
            if (genresA.length > 0 && genresB.length > 0) {
               const overlap = genresA.some(g => genresB.includes(g));
               if (!overlap) {
                  current = 1;
                  break;
               }
            }
         }
         if (current) break;
      }
      return { title: "Genre Hopper", desc: `Expand your horizons. Log Progress on ${target+1} items that do not share any genres`, target, current, type: 'entries' as const, reward: baseReward * 2 };
    },
    () => { // 24. Format Focus
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Format Focus", timeframe, 50, settings, typeof rng !== 'undefined' ? rng : undefined);
      const possibleTypes = MEDIA_TYPES.filter(t => goals[t] > 0);
      if (possibleTypes.length === 0) return null;
      const chosenType = possibleTypes[Math.floor(rng() * possibleTypes.length)];
      
      let current = 0;
      logs.forEach(l => {
         const m = media.find(x => x.id === l.mediaId);
         if (m && m.mediaType === chosenType) {
            current += calculateScaledDelta(l.delta, m, settings);
         }
      });
      return { title: "Format Focus", desc: `Dive deep into one medium. Gain ${target} Master Pages exclusively in ${chosenType}`, target, current: Math.floor(current), type: 'pages' as const, reward: baseReward * 2 };
    },
    () => { // 25. The Initiator
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("The Initiator", timeframe, 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      const validLogs = logs.filter(l => l.metricType === 'statusChange' && l.note && (l.note.includes('Planning to In Progress') || l.note.includes('Status changed from Planning to Active')));
      const current = new Set(validLogs.map(l => l.mediaId)).size;
      return { title: "The Initiator", desc: `Take the first step. Move ${target} item's status from 'Planning' to 'Active'`, target, current, type: 'entries' as const, reward: baseReward * 2 };
    },
    () => { // 26. Weekly Sprinter
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Weekly Sprinter", timeframe, 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      
      const isClose = media.some(m => {
          if (m.status === 'Active' && ['Manga', 'Book', 'Series'].includes(m.mediaType)) {
             const primary = PRIMARY_METRICS[m.mediaType];
             const totalLogs = allLogs.filter(l => l.mediaId === m.id && l.metricType === primary);
             const currentNative = totalLogs.reduce((acc, log) => acc + log.delta, 0);
             let totalNative = 0;
             if (m.mediaType === 'Manga') totalNative = m.totalChapters || 0;
             if (m.mediaType === 'Book') totalNative = m.totalPages || 0;
             if (m.mediaType === 'Series') totalNative = m.totalEpisodes || 0;
             if (totalNative > 0) {
                 const remainingNative = totalNative - currentNative;
                 if (remainingNative > 0) {
                     const logsMock = [{ mediaId: m.id, metricType: primary, delta: remainingNative }];
                     const remainingMp = calculateMasterPages(logsMock as any, [m], settings, m.mediaType);
                     if (remainingMp <= 200) return true;
                 }
             }
          }
          return false;
      });
      if (!isClose) return null;
      
      const validLogs = logs.filter(l => l.metricType === 'statusChange' && (l.note?.includes('to Completed') || l.note?.includes('to Extras')));
      const current = new Set(validLogs.map(l => l.mediaId)).size;
      return { title: "Weekly Sprinter", desc: `Finish what you started. Complete ${target} media item(s)`, target, current, type: 'entries' as const, reward: baseReward * 3 };
    },
    () => { // 27. Reviewer's Strike
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Reviewer's Strike", timeframe, 1, settings, typeof rng !== 'undefined' ? rng : undefined);

      const isClose = media.some(m => {
          if (m.status === 'Active' && ['Manga', 'Book', 'Series'].includes(m.mediaType)) {
             const primary = PRIMARY_METRICS[m.mediaType];
             const totalLogs = allLogs.filter(l => l.mediaId === m.id && l.metricType === primary);
             const currentNative = totalLogs.reduce((acc, log) => acc + log.delta, 0);
             let totalNative = 0;
             if (m.mediaType === 'Manga') totalNative = m.totalChapters || 0;
             if (m.mediaType === 'Book') totalNative = m.totalPages || 0;
             if (m.mediaType === 'Series') totalNative = m.totalEpisodes || 0;
             if (totalNative > 0) {
                 const remainingNative = totalNative - currentNative;
                 if (remainingNative > 0) {
                     const logsMock = [{ mediaId: m.id, metricType: primary, delta: remainingNative }];
                     const remainingMp = calculateMasterPages(logsMock as any, [m], settings, m.mediaType);
                     if (remainingMp <= 200) return true;
                 }
             }
          }
          return false;
      });
      if (!isClose) return null;

      const validLogs = logs.filter(l => {
         if (l.metricType !== 'statusChange' || !(l.note?.includes('to Completed') || l.note?.includes('to Extras'))) return false;
         const m = media.find(x => x.id === l.mediaId);
         return m && ((m.userRating && m.userRating >= 1 && m.userRating <= 5) || (m.userReview && m.userReview.trim().length > 0));
      });
      const current = new Set(validLogs.map(l => l.mediaId)).size;
      return { title: "Reviewer's Strike", desc: `Share your thoughts. Complete and rate/review ${target} item(s)`, target, current, type: 'entries' as const, reward: baseReward * 3 };
    },
    () => { // 29. Dust It Off
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Dust It Off", timeframe, 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      const hasDustyItem = media.some(m => {
          // An entry parked waiting on a release is not dusty, it is blocked.
          if (isWaitingOnRelease(m)) return false;
          if (m.status === 'Planning' || m.status === 'Active' || m.status === 'On Hold' || m.status === 'Caught Up') {
             const itemLogs = allLogs.filter(l => l.mediaId === m.id);
             if (itemLogs.length > 0) {
                 const latestLog = itemLogs.reduce((latest, current) => new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest);
                 if (new Date(latestLog.timestamp) < oneMonthAgo) return true;
             } else {
                 if (new Date(m.createdAt) < oneMonthAgo) return true;
             }
          }
          return false;
      });
      if (!hasDustyItem) return null;
      
      const validMediaIds = new Set<string>();
      logs.forEach(l => {
         const itemLogs = allLogs.filter(al => al.mediaId === l.mediaId && new Date(al.timestamp) < new Date(l.timestamp));
         if (itemLogs.length > 0) {
             const latestBefore = itemLogs.reduce((latest, cur) => new Date(cur.timestamp) > new Date(latest.timestamp) ? cur : latest);
             const timeDiff = new Date(l.timestamp).getTime() - new Date(latestBefore.timestamp).getTime();
             if (timeDiff > 30 * 24 * 60 * 60 * 1000) validMediaIds.add(l.mediaId);
         } else {
             const m = media.find(x => x.id === l.mediaId);
             if (m && (new Date(l.timestamp).getTime() - new Date(m.createdAt).getTime() > 30 * 24 * 60 * 60 * 1000)) {
                 validMediaIds.add(l.mediaId);
             }
         }
      });
      const current = validMediaIds.size;
      return { title: "Dust It Off", desc: `Clear out the backlog. Log progress on ${target} item(s) that has been sitting in your library without updates for over a month`, target, current, type: 'entries' as const, reward: baseReward * 3 };
    },
    () => { // 30. Marathon Session
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Marathon Session", timeframe, 50, settings, typeof rng !== 'undefined' ? rng : undefined);
      let current = 0;
      logs.forEach(l => {
         const m = media.find(x => x.id === l.mediaId);
         if (m) {
             const mp = calculateScaledDelta(l.delta, m, settings);
             if (mp > current) current = mp;
         }
      });
      return { title: "Marathon Session", desc: `Get lost in the zone. Have a single progress entry that yields ${target} Master Pages in one sitting`, target, current: Math.floor(current), type: 'pages' as const, reward: baseReward * 2 };
    },
    () => { // 31. Journalist
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Journalist", timeframe, 2, settings, typeof rng !== 'undefined' ? rng : undefined);
      const current = logs.filter(l => l.note && l.note.trim().length >= 10).length;
      return { title: "Journalist", desc: `Embody the Lorekeeper. Write ${target} progress notes (10+ characters) attaching them to your progress logs`, target, current, type: 'entries' as const, reward: baseReward * 2 };
    },

    // ---- Engagement challenges ------------------------------------------------
    // These all work with media already in the library. None asks for anything new
    // to be added: the point is to find a different angle on what is already there.

    () => { // 32. Off the Shelf - something parked has new content waiting
      // On Hold means waiting on a release, so this only offers itself when
      // something has actually shipped. Otherwise it would ask for progress
      // that does not exist yet.
      const unblocked = media.filter(m => (m.status === 'On Hold' || m.status === 'Caught Up') && hasNewContent(m));
      if (unblocked.length === 0) return null;
      const target = getQTarget("Off the Shelf", timeframe, 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      const eligibleIds = new Set(unblocked.map(m => m.id));
      // Resuming usually flips the entry to Active, so anything that left On Hold
      // during the period still counts — otherwise completing the quest would
      // erase its own progress.
      logs.forEach(l => {
        if (l.metricType === 'statusChange' && l.note?.includes('from On Hold')) eligibleIds.add(l.mediaId);
      });
      const current = new Set(logs.filter(l => l.metricType !== 'statusChange' && eligibleIds.has(l.mediaId)).map(l => l.mediaId)).size;
      return { title: "Off the Shelf", desc: `Something you were waiting on has new content. Log progress on ${target} of them`, target, current, type: 'entries' as const, reward: baseReward * 3 };
    },

    () => { // 33. The Understudy - the active item you have neglected most
      const actives = media.filter(m => m.status === 'Active');
      if (actives.length < 3) return null;
      const target = getQTarget("The Understudy", timeframe, 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      // Rank active items by how long since their last log; the quest names the coldest.
      const lastLog: Record<string, number> = {};
      allLogs.forEach(l => {
        if (l.metricType === 'statusChange') return;
        const t = new Date(l.timestamp).getTime();
        if (!lastLog[l.mediaId] || t > lastLog[l.mediaId]) lastLog[l.mediaId] = t;
      });
      const coldest = [...actives].sort((a, b) => (lastLog[a.id] || 0) - (lastLog[b.id] || 0))[0];
      if (!coldest) return null;
      const current = logs.some(l => l.mediaId === coldest.id && l.metricType !== 'statusChange') ? 1 : 0;
      return { title: "The Understudy", desc: `Your most neglected active journey: give "${coldest.title}" some attention`, target, current, type: 'entries' as const, reward: baseReward * 3 };
    },

    () => { // 34. Home Stretch - finish something nearly done
      const target = getQTarget("Home Stretch", timeframe, 1, settings, typeof rng !== 'undefined' ? rng : undefined);
      // Items at 75%+ of a known total
      const nearlyDone = media.filter(m => {
        if (m.status !== 'Active') return false;
        const totals: Record<string, number | undefined> = {
          'Book': m.totalPages, 'Manga': m.totalChapters, 'Series': m.totalEpisodes, 'Comic': m.totalIssues,
        };
        const total = totals[m.mediaType];
        if (!total || total <= 0) return false;
        const done = (m.pagesRead || m.chaptersRead || m.episodesWatched || m.issuesRead || 0);
        const pct = done / total;
        return pct >= 0.75 && pct < 1;
      });
      if (nearlyDone.length === 0) return null;
      const ids = new Set(nearlyDone.map(m => m.id));
      const current = new Set(logs.filter(l => l.metricType === 'statusChange' && (l.note?.includes('to Completed') || l.note?.includes('to Extras')) && ids.has(l.mediaId)).map(l => l.mediaId)).size;
      return { title: "Home Stretch", desc: `${nearlyDone.length === 1 ? `"${nearlyDone[0].title}" is` : `${nearlyDone.length} items are`} past three quarters. Finish ${target}`, target, current, type: 'entries' as const, reward: baseReward * 4 };
    },

    () => { // 35. Night Shift
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Night Shift", timeframe, 2, settings, typeof rng !== 'undefined' ? rng : undefined);
      const current = new Set(logs.filter(l => {
        if (l.metricType === 'statusChange') return false;
        const h = subHours(parseISO(l.timestamp), 5).getHours();
        return h >= 22 || h < 4;
      }).map(l => format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd'))).size;
      return { title: "Night Shift", desc: `Burn the midnight oil. Log progress after 22:00 on ${target} different nights`, target, current, type: 'entries' as const, reward: baseReward * 2 };
    },

    () => { // 36. First Light
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("First Light", timeframe, 2, settings, typeof rng !== 'undefined' ? rng : undefined);
      const current = new Set(logs.filter(l => {
        if (l.metricType === 'statusChange') return false;
        const h = subHours(parseISO(l.timestamp), 5).getHours();
        return h >= 4 && h < 10;
      }).map(l => format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd'))).size;
      return { title: "First Light", desc: `Start before the world does. Log progress before 10:00 on ${target} mornings`, target, current, type: 'entries' as const, reward: baseReward * 2 };
    },

    () => { // 37. Road Trip - log from more than one place
      if (timeframe !== 'weekly') return null;
      const knownLocations = new Set(allLogs.map(l => (l.location || '').trim()).filter(Boolean));
      if (knownLocations.size < 2) return null; // only meaningful if locations get used
      const target = getQTarget("Road Trip", timeframe, 2, settings, typeof rng !== 'undefined' ? rng : undefined);
      const current = new Set(logs.map(l => (l.location || '').trim()).filter(Boolean)).size;
      return { title: "Road Trip", desc: `Change of scenery. Log progress from ${target} different locations`, target, current, type: 'entries' as const, reward: baseReward * 2 };
    },

    () => { // 38. Format Sampler
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Format Sampler", timeframe, 3, settings, typeof rng !== 'undefined' ? rng : undefined);
      const types = new Set<string>();
      logs.forEach(l => { const m = media.find(x => x.id === l.mediaId); if (m && l.metricType !== 'statusChange') types.add(m.mediaType); });
      return { title: "Format Sampler", desc: `Refuse to specialise. Log progress in ${target} different media types`, target, current: types.size, type: 'entries' as const, reward: baseReward * 3 };
    },

    () => { // 39. Balanced Diet - pair a long form with a short form
      if (timeframe !== 'weekly') return null;
      const LONG = ['Game', 'Book', 'Visual Novel', 'Audiobook'];
      const SHORT = ['Movie', 'Comic', 'Manga', 'Series'];
      let long = 0, short = 0;
      new Set(logs.filter(l => l.metricType !== 'statusChange').map(l => l.mediaId)).forEach(id => {
        const m = media.find(x => x.id === id);
        if (!m) return;
        if (LONG.includes(m.mediaType)) long++;
        if (SHORT.includes(m.mediaType)) short++;
      });
      return { title: "Balanced Diet", desc: `One long haul, one quick bite. Log both a Game/Book/VN and a Movie/Comic/Manga/Series`, target: 2, current: (long > 0 ? 1 : 0) + (short > 0 ? 1 : 0), type: 'entries' as const, reward: baseReward * 2 };
    },

    () => { // 40. The Long Haul - same item, consecutive days
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("The Long Haul", timeframe, 3, settings, typeof rng !== 'undefined' ? rng : undefined);
      const byItem: Record<string, string[]> = {};
      logs.forEach(l => {
        if (l.metricType === 'statusChange') return;
        const d = format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd');
        (byItem[l.mediaId] = byItem[l.mediaId] || []).push(d);
      });
      let best = 0;
      Object.values(byItem).forEach(days => {
        const uniq = Array.from(new Set(days)).sort();
        let run = uniq.length ? 1 : 0, longest = run;
        for (let i = 1; i < uniq.length; i++) {
          const diff = (new Date(uniq[i] + 'T00:00:00').getTime() - new Date(uniq[i-1] + 'T00:00:00').getTime()) / 86400000;
          run = diff === 1 ? run + 1 : 1;
          if (run > longest) longest = run;
        }
        if (longest > best) best = longest;
      });
      return { title: "The Long Haul", desc: `Build a habit. Log the same item on ${target} consecutive days`, target, current: best, type: 'entries' as const, reward: baseReward * 3 };
    },

    () => { // 41. Deep Diver - several sittings on one item
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Deep Diver", timeframe, 3, settings, typeof rng !== 'undefined' ? rng : undefined);
      const sessions = groupLogsIntoSessions(logs.filter(l => l.metricType !== 'statusChange'));
      const perItem: Record<string, number> = {};
      sessions.forEach(s => { perItem[s.mediaId] = (perItem[s.mediaId] || 0) + 1; });
      const best = Object.values(perItem).length ? Math.max(...Object.values(perItem)) : 0;
      return { title: "Deep Diver", desc: `Return again and again. Have ${target} separate sessions on a single item`, target, current: best, type: 'entries' as const, reward: baseReward * 3 };
    },

    () => { // 42. Creator Study - two works by the same creator
      if (timeframe !== 'weekly') return null;
      const target = getQTarget("Creator Study", timeframe, 2, settings, typeof rng !== 'undefined' ? rng : undefined);
      // Only offer when the library actually has a creator with multiple works
      const byCreator: Record<string, Set<string>> = {};
      media.forEach(m => { if (m.creator) (byCreator[m.creator] = byCreator[m.creator] || new Set()).add(m.id); });
      if (!Object.values(byCreator).some(set => set.size >= 2)) return null;
      const loggedByCreator: Record<string, Set<string>> = {};
      logs.forEach(l => {
        if (l.metricType === 'statusChange') return;
        const m = media.find(x => x.id === l.mediaId);
        if (m?.creator) (loggedByCreator[m.creator] = loggedByCreator[m.creator] || new Set()).add(m.id);
      });
      const best = Object.values(loggedByCreator).reduce((mx, set) => Math.max(mx, set.size), 0);
      return { title: "Creator Study", desc: `Follow one voice. Log ${target} different works by the same creator`, target, current: best, type: 'entries' as const, reward: baseReward * 3 };
    },

    () => { // 43. Franchise Focus - two entries from one universe
      if (timeframe !== 'weekly') return null;
      const withFranchise = media.filter(m => m.franchises && m.franchises.length > 0);
      if (withFranchise.length < 2) return null;
      const target = getQTarget("Franchise Focus", timeframe, 2, settings, typeof rng !== 'undefined' ? rng : undefined);
      const byFranchise: Record<string, Set<string>> = {};
      logs.forEach(l => {
        if (l.metricType === 'statusChange') return;
        const m = media.find(x => x.id === l.mediaId);
        (m?.franchises || []).forEach(f => (byFranchise[f] = byFranchise[f] || new Set()).add(m!.id));
      });
      const best = Object.values(byFranchise).reduce((mx, set) => Math.max(mx, set.size), 0);
      return { title: "Franchise Focus", desc: `Stay in one universe. Log ${target} entries from the same franchise`, target, current: best, type: 'entries' as const, reward: baseReward * 3 };
    },

    () => { // 44. Momentum - beat the previous interval
      const target = getQTarget("Momentum", timeframe, 0, settings, typeof rng !== 'undefined' ? rng : undefined);
      // Compare against the same-length window immediately before this one
      const times = logs.map(l => parseISO(l.timestamp).getTime());
      if (!times.length) return null;
      const spanDays = timeframe === 'weekly' ? 7 : 30;
      const windowStart = Math.min(...times);
      const prevFrom = windowStart - spanDays * 86400000;
      const prevPages = allLogs.reduce((acc, l) => {
        const t = parseISO(l.timestamp).getTime();
        if (t < prevFrom || t >= windowStart || l.metricType === 'statusChange') return acc;
        const m = media.find(x => x.id === l.mediaId);
        return m ? acc + calculateScaledDelta(l.delta, m, settings) : acc;
      }, 0);
      if (prevPages <= 0) return null; // nothing to beat
      const goal = target > 0 ? target : Math.ceil(prevPages);
      const current = calculateMasterPages(logs, media, settings);
      return { title: "Momentum", desc: `Outdo your past self. Beat the ${Math.round(prevPages)} Master Pages of the previous ${timeframe.replace('ly', '')}`, target: goal, current: Math.floor(current), type: 'pages' as const, reward: baseReward * 3 };
    },
  ];

  // Filter out nulls and apply overrides
  const validTemplates = templates.map(t => t()).filter(Boolean).filter((q: any) => q && q.target > 0) as NonNullable<ReturnType<typeof templates[0]>>[];

  // Fisher-Yates shuffle using RNG
  const shuffled = [...validTemplates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  let iOffset = 0;

  // Add Theme Quest for Monthly
  if (timeframe === 'monthly') {
    const monthStr = timeId.split('-')[1];
    const monthNum = parseInt(monthStr, 10);
    const theme = MONTH_THEMES[monthNum];
    if (theme) {
       const target = getQTarget("Theme Quests", 'monthly', 10, settings, typeof rng !== 'undefined' ? rng : undefined);
       
       let current = 0;
       logs.forEach(l => {
          const m = media.find(x => x.id === l.mediaId);
          if (m && m.genres?.some(g => theme.tags.includes(g))) {
             current += calculateScaledDelta(l.delta, m, settings);
          }
       });

       quests.push({
         id: `${timeId}-theme`,
         type: timeframe,
         title: `${theme.name} Theme`,
         description: `${theme.desc} something tagged: ${theme.tags.slice(0, 3).join(', ')} (${target} Master Pages)`,
         targetAmount: target,
         currentAmount: Math.floor(current),
         expReward: baseReward * 3,
         metric: 'pages',
         isCompleted: Math.floor(current) >= target,
         isFailed: false
       });
       iOffset = 1;
    }
  }

  const usedTitles = new Set<string>();
  const usedCategories = new Set<string>();

  for (let i = iOffset; i < count; i++) {
    const qId = `${timeId}-${i}`;
    let userOffset = 0;
    if (settings?.questOffsets && settings.questOffsets[qId]) {
      userOffset = settings.questOffsets[qId];
    }

    let data;
    const startIndex = (i * 3 + userOffset) % shuffled.length;

    // Two passes. The first only accepts a quest whose theme is not represented
    // yet, which is what keeps near-duplicates ("log on 3 days" beside "log on a
    // weekend day") out of the same interval. If every remaining theme is taken,
    // the second pass falls back to any unused quest so the slate still fills.
    for (const enforceCategory of [true, false]) {
      for (let attempts = 0; attempts < shuffled.length; attempts++) {
        const candidate = shuffled[(startIndex + attempts) % shuffled.length];
        if (usedTitles.has(candidate.title)) continue;
        const cat = QUEST_CATEGORY[candidate.title];
        if (enforceCategory && cat && usedCategories.has(cat)) continue;
        data = candidate;
        break;
      }
      if (data) break;
    }

    if (!data) data = shuffled[0];
    usedTitles.add(data.title);
    const chosenCat = QUEST_CATEGORY[data.title];
    if (chosenCat) usedCategories.add(chosenCat);

    quests.push({
      id: qId,
      type: timeframe,
      title: data.title,
      description: data.desc + ` this ${timeframe.replace('ly', '')}.`,
      targetAmount: data.target,
      currentAmount: Math.floor(data.current),
      expReward: Math.floor(data.reward),
      metric: data.type,
      isCompleted: Math.floor(data.current) >= data.target,
      isFailed: false
    });
  }
}
