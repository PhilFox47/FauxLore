import { MediaItem, ProgressLog, getMetricForType, MediaType, WorldBoss } from '../types/schema';
import { calculateScaledDelta } from './scaling';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, differenceInDays } from 'date-fns';

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
    questExp: number;
    bossExp: number;
    decayExp: number;
    penaltyExp: number;
  };
}

// Exp threshold curve
export function getLevelForExp(exp: number): number {
  if (exp <= 0) return 1;
  let level = Math.floor(Math.sqrt(exp / 1000)) + 1;
  return Math.min(level, 100);
}

export function getExpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 1000 * Math.pow(level - 1, 2);
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


export function calculateRPGState(
  media: MediaItem[], 
  logs: ProgressLog[], 
  settings: any, 
  worldBosses: WorldBoss[] = [], 
  artifacts: any[] = [],
  evalDate: any = new Date()
): RPGState {
  // Ensure evalDate is a Date object
  const now = evalDate instanceof Date ? evalDate : new Date(evalDate);
  
  // Filter historical
  const validLogs = logs.filter(l => !l.isHistoric && !l.timestamp.startsWith('1970-01-01'));
  
  let baseExp = 0;
  validLogs.forEach(log => {
    if (log.metricType === 'statusChange') return; // Status changes don't grant EXP
    
    const item = media.find(m => m.id === log.mediaId);
    if (item) {
      baseExp += calculateScaledDelta(log.delta, item, settings); // 1 Master Page = 1 EXP (removed the * 5)
    }
  });

  let penaltyExp = 0;
  media.forEach(m => {
    if (m.status === 'Dropped') penaltyExp -= 500;
  });

  let bossExp = 0;
  // Boss Rewards and Penalties
  worldBosses.forEach(boss => {
    // level: 1(50exp), 2(100), 3(200), 4(400), 5(1000)
    let bExp = 0;
    if (boss.level === 1) bExp = 50;
    else if (boss.level === 2) bExp = 100;
    else if (boss.level === 3) bExp = 200;
    else if (boss.level === 4) bExp = 400;
    else if (boss.level === 5) bExp = 1000;

    if (boss.status === 'Defeated') {
      bossExp += bExp;
    } else if (boss.status === 'Failed') {
      penaltyExp -= bExp;
    }
  });

  let decayExp = 0;
  if (validLogs.length > 0) {
    const dates = validLogs.map(l => parseISO(l.timestamp).getTime()).sort((a, b) => a - b);
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
  
  const currentWeekLogs = validLogs.filter(l => isWithinInterval(parseISO(l.timestamp), { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }));
  const currentMonthLogs = validLogs.filter(l => isWithinInterval(parseISO(l.timestamp), { start: startOfMonth(now), end: endOfMonth(now) }));
  const currentYearLogs = validLogs.filter(l => isWithinInterval(parseISO(l.timestamp), { start: startOfYear(now), end: endOfYear(now) }));

  const quests: Quest[] = [];

  const rngWeek = mulberry32(parseInt(currentWeekInfo.replace('-', '')));
  const rngMonth = mulberry32(parseInt(currentMonthInfo.replace('-', '')));
  const rngYear = mulberry32(currentYear);

  // 1. Gather all unique time intervals across all logs
  const allYears = new Set<string>();
  const allMonths = new Set<string>();
  const allWeeks = new Set<string>();

  validLogs.forEach(l => {
    const d = parseISO(l.timestamp);
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
    const yearLogs = validLogs.filter(l => format(parseISO(l.timestamp), "yyyy") === year);
    const tempQuests: Quest[] = [];
    generateYearlyQuests(tempQuests, yearLogs, media, settings, year);
    tempQuests.forEach(q => { if (q.isCompleted) questExp += q.expReward; });
    if (year === currentYear.toString()) quests.push(...tempQuests);
  }

  for (const month of Array.from(allMonths)) {
    const monthLogs = validLogs.filter(l => format(parseISO(l.timestamp), "yyyy-MM") === month);
    const tempQuests: Quest[] = [];
    const rng = mulberry32(parseInt(month.replace('-', '')));
    generateIntervalQuests(tempQuests, monthLogs, media, settings, 'monthly', month, 4, rng);
    tempQuests.forEach(q => { if (q.isCompleted) questExp += q.expReward; });
    if (month === currentMonthInfo) quests.push(...tempQuests);
  }

  for (const week of Array.from(allWeeks)) {
    const weekLogs = validLogs.filter(l => format(startOfWeek(parseISO(l.timestamp), { weekStartsOn: 1 }), "RRRR-II") === week);
    const tempQuests: Quest[] = [];
    const rng = mulberry32(parseInt(week.replace('-', '')));
    generateIntervalQuests(tempQuests, weekLogs, media, settings, 'weekly', week, 2, rng);
    tempQuests.forEach(q => { if (q.isCompleted) questExp += q.expReward; });
    if (week === currentWeekInfo) quests.push(...tempQuests);
  }

  // Equipment bonuses (Gradual effectiveness based on durability)
  const equipped = artifacts.filter((a: any) => a.isEquipped);
  let equipMultiplier = 1.0;
  equipped.forEach((a: any) => {
    // Artifact provides bonus relative to its durability
    const durabilityRatio = (a.durability || 100) / (a.maxDurability || 100);
    // Base 5% bonus per item slot at full durability. 
    // Linear degradation: 100% dur = 5% boost, 0% dur = 0% boost.
    const itemBonus = 0.05 * durabilityRatio; 
    equipMultiplier += itemBonus;
  });

  const totalExp = Math.max(0, baseExp + questExp + bossExp + decayExp + penaltyExp) * equipMultiplier;
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

  return {
    currentExp: totalExp,
    level,
    nextLevelExp,
    currentLevelExp,
    expProgress,
    className: prefix + classNames[classIdx],
    quests,
    expBreakdown: { baseExp, questExp, bossExp, decayExp, penaltyExp }
  };
}

const DEFAULT_YEARLY_GOALS: Record<MediaType, number> = {
  'Game': 100, 'Book': 5000, 'Visual Novel': 50, 'Manga': 200, 'Series': 100, 'Movie': 20, 'Comic': 100
};
export const NATIVE_UNIT_LABELS: Record<MediaType, string> = {
  'Game': 'Hours Played',
  'Book': 'Pages Read',
  'Visual Novel': 'Hours Played',
  'Manga': 'Chapters Read',
  'Series': 'Episodes Watched',
  'Movie': 'Movies Watched',
  'Comic': 'Issues Read'
};
const PRIMARY_METRICS: Record<MediaType, string> = {
  'Game': 'playtimeHours',
  'Visual Novel': 'playtimeHours',
  'Book': 'pagesRead',
  'Manga': 'chaptersRead',
  'Series': 'episodesWatched',
  'Movie': 'watchCount',
  'Comic': 'issuesRead'
};

const MEDIA_TYPES: MediaType[] = ['Game', 'Book', 'Visual Novel', 'Manga', 'Series', 'Movie', 'Comic'];

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

function generateIntervalQuests(quests: Quest[], logs: ProgressLog[], media: MediaItem[], settings: any, timeframe: 'monthly' | 'weekly', timeId: string, count: number, rng: () => number) {
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
    () => {
      const target = Math.max(10, Math.floor(totalMasterPagesGoal / divisor));
      const current = calculateMasterPages(logs, media, settings);
      return {
        title: "The Great Consumer",
        desc: `Consume ${target} Master Pages across your collection`,
        target, current, type: 'pages' as const, reward: baseReward * 1.5
      };
    },
    () => {
      // Pick random media type
      const possibleTypes = MEDIA_TYPES.filter(t => goals[t] > 0);
      const chosenType = possibleTypes[Math.floor(rng() * possibleTypes.length)] || 'Book';
      const target = Math.max(1, Math.floor(goals[chosenType] / divisor)); // use native target
      const current = calculateNativeUnits(logs, media, chosenType);
      
      let verb = "Consume";
      if (chosenType === 'Game') verb = "Play";
      else if (['Book', 'Manga', 'Comic', 'Visual Novel'].includes(chosenType)) verb = "Read";
      else verb = "Watch";

      return {
        title: `${chosenType} Enthusiast`,
        desc: `${verb} ${target} ${NATIVE_UNIT_LABELS[chosenType]}`,
        target, current, type: 'pages' as const, reward: baseReward
      };
    },
    () => {
      // The Scribe
      const target = timeframe === 'monthly' ? 10 : 3;
      const current = logs.filter(l => l.note && l.note.trim().length >= 10).length;
      return {
        title: "The Scribe",
        desc: `Write ${target} meaningful journal entries (10+ characters) attaching to progress logs`,
        target, current, type: 'entries' as const, reward: baseReward * 2
      };
    },
    () => {
      // The Explorer
      const target = timeframe === 'monthly' ? 4 : 2;
      const typesSet = new Set();
      logs.forEach(l => {
        const m = media.find(x => x.id === l.mediaId);
        if (m) typesSet.add(m.mediaType);
      });
      const current = typesSet.size;
      return {
        title: "The Explorer",
        desc: `Log progress in ${target} distinctly different media types`,
        target, current, type: 'entries' as const, reward: baseReward * 1.2
      };
    },
    () => {
      // Night Owl
      const target = timeframe === 'monthly' ? 5 : 2;
      let current = 0;
      logs.forEach(l => {
        const h = parseISO(l.timestamp).getHours();
        if (h >= 0 && h <= 5) current++;
      });
      return {
        title: "Night Owl",
        desc: `Log progress ${target} times during late night hours (Midnight - 5AM)`,
        target, current, type: 'entries' as const, reward: baseReward * 1.5
      };
    },
    () => {
      // Consistent Consumer
      const target = timeframe === 'monthly' ? 15 : 4;
      const days = new Set(logs.map(l => format(parseISO(l.timestamp), "yyyy-MM-dd"))).size;
      return {
        title: "Consistent Consumer",
        desc: `Log progress on ${target} different days`,
        target, current: days, type: 'entries' as const, reward: baseReward * 2
      };
    }
  ];

  // Fisher-Yates shuffle using RNG
  const shuffled = [...templates];
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
       const target = 10;
       
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

  for (let i = iOffset; i < count; i++) {
    const generator = shuffled[i % shuffled.length];
    const data = generator();
    
    quests.push({
      id: `${timeId}-${i}`,
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
