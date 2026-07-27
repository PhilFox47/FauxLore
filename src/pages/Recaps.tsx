import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { useToast } from '../contexts/ToastContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  startOfWeek, endOfWeek, subWeeks, 
  startOfMonth, endOfMonth, subMonths, 
  startOfYear, endOfYear, subYears, 
  format, isWithinInterval, parseISO, subHours,
  startOfISOWeek, endOfISOWeek, formatISO,
  eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, getDay
} from 'date-fns';
import { calculateScaledDelta } from '../lib/scaling';
import { calculateRPGState } from '../lib/rpgSystem';
import { MediaItem, MEDIA_COLORS, ProgressLog, RARITY_COLORS } from '../types/schema';
import { cn } from '../lib/utils';
import { ChevronLeft, ChevronRight, Trophy, Sparkles, RefreshCw, Presentation, Clock, CalendarDays, Target, Star, BrainCircuit, BarChart3, Medal, Library, Flame, Zap, Compass, Info, Map as MapIcon, LayoutGrid, Calendar, Activity, ZapOff, Hash, Ghost, History, Moon, Skull } from 'lucide-react';
import { analyzeHabits, analyzeMediaDNA, analyzeSessionVelocity, determineArchetypes, analyzeBingeFactor, analyzeSunkCost, analyzeTimeTraveler, analyzeBacklog, analyzeContrarian, extractJournals, calculateLongestStreak } from '../lib/recapAnalytics';
import {
  buildClock, buildComparison, buildHistoryMetrics, buildIntervalMetrics, buildMomentumSeries,
  buildPipeline, buildRankRace, buildRecords, buildTasteAlignment, logsInInterval, shift,
} from '../lib/recapInsights';
import {
  ActivityClock, ConsistencyRing, HeroStat, MomentumChart, PipelineFunnel, RankRace,
  RecordsBoard, TasteScatter, typeHex,
} from '../components/RecapCharts';
import { AwardsShelf, LookAhead, RecapDek, RecapNarrative, readRecap } from '../components/RecapStory';
import { generateStructuredRecap } from '../services/recapAi';
import { groupLogsIntoSessions } from '../lib/sessions';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, AreaChart, Area, Legend } from 'recharts';

type Timeframe = 'week' | 'month' | 'year';

/** A number that animates up from 0 (eased) whenever it mounts or its value changes. */
function CountUp({ value, duration = 1300, className }: { value: number; duration?: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf = 0;
    const to = value || 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(to * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(to);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className={className}>{Math.round(display).toLocaleString()}</span>;
}

/** Consistent chapter header used across every recap section for visual rhythm. */
function SectionHeader({ icon, title, eyebrow, accent }: { icon?: React.ReactNode; title: string; eyebrow?: string; accent?: string }) {
  return (
    <div className="flex items-center gap-4 mb-8">
      {icon && <div className={cn("p-3 rounded-2xl border bg-white/5 border-white/10 shrink-0", accent)}>{icon}</div>}
      <div className="min-w-0">
        {eyebrow && <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black mb-1">{eyebrow}</div>}
        <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-none truncate">{title}</h3>
      </div>
    </div>
  );
}

/** Soft upward fade-in when the block scrolls into view. */
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8%' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Recaps() {
  const { media, logs, settings, aiRecaps, saveAiRecap, artifacts, worldBosses, isLoading, aiTextCache } = useMediaContext();
  const toast = useToast();
  const [timeframe, setTimeframe] = useState<Timeframe>('week');
  const [offsetOffset, setOffsetOffset] = useState(1); 
  const [isGenerating, setIsGenerating] = useState(false);
  const attemptedGenRef = useRef<Set<string>>(new Set());

  const validLogs = useMemo(() => logs.filter(log => !log.isHistoric && !log.timestamp.startsWith('1970-01-01')), [logs]);

  const currentInterval = useMemo(() => {
    const now = subHours(new Date(), 5);
    if (timeframe === 'week') {
      const target = subWeeks(now, offsetOffset);
      return { start: startOfISOWeek(target), end: endOfISOWeek(target) };
    } else if (timeframe === 'month') {
      const target = subMonths(now, offsetOffset);
      return { start: startOfMonth(target), end: endOfMonth(target) };
    } else {
      const target = subYears(now, offsetOffset);
      return { start: startOfYear(target), end: endOfYear(target) };
    }
  }, [timeframe, offsetOffset]);

  const timeId = useMemo(() => {
    if (timeframe === 'week') return format(currentInterval.start, "RRRR-'W'II");
    if (timeframe === 'month') return format(currentInterval.start, "yyyy-MM");
    return format(currentInterval.start, "yyyy");
  }, [timeframe, currentInterval]);

  const activeLogs = useMemo(() => {
    return validLogs.filter(log => isWithinInterval(subHours(parseISO(log.timestamp), 5), currentInterval));
  }, [validLogs, currentInterval]);

  const activeProgressLogs = useMemo(() => {
    return activeLogs.filter(l => l.metricType !== 'statusChange');
  }, [activeLogs]);

  const activeMedia = useMemo(() => {
    const mediaIds = new Set(activeLogs.map(l => l.mediaId));
    // We want to include ALL media that have progress logs in this time interval,
    // regardless of their current status (even if they were moved back to Planning, etc.)
    return media.filter(m => mediaIds.has(m.id));
  }, [activeLogs, media]);

  const completedMedia = useMemo(() => {
    // 1. Find all media that have a statusChange log to 'Completed' or 'Extras' in this interval
    const completedLogIds = new Set(
      activeLogs
        .filter(l => l.metricType === 'statusChange' && (l.note?.toLowerCase().includes('to completed') || l.note?.toLowerCase().includes('to extras')))
        .map(l => l.mediaId)
    );

    // 2. Fallback for older items: completed/extras status and updatedAt in interval
    const completedLegacy = activeMedia.filter(m => {
      if (completedLogIds.has(m.id)) return false;
      
      const hasStatusLogs = logs.some(l => l.mediaId === m.id && l.metricType === 'statusChange');
      if (hasStatusLogs) return false; // This item uses the new system, so if it didn't have a log in the interval, it didn't finish now.

      return (m.status === 'Completed' || m.status === 'Extras') && isWithinInterval(subHours(parseISO(m.updatedAt), 5), currentInterval);
    });

    const logBasedCompleted = media.filter(m => completedLogIds.has(m.id));
    
    return [...logBasedCompleted, ...completedLegacy];
  }, [activeLogs, activeMedia, currentInterval, logs, media]);

  const completedMediaIds = useMemo(() => new Set(completedMedia.map(m => m.id)), [completedMedia]);

  const droppedMedia = useMemo(() => {
    const droppedLogIds = new Set(
      activeLogs
        .filter(l => l.metricType === 'statusChange' && l.note?.toLowerCase().includes('to dropped'))
        .map(l => l.mediaId)
    );
    return media.filter(m => droppedLogIds.has(m.id));
  }, [activeLogs, media]);
  const droppedMediaIds = useMemo(() => new Set(droppedMedia.map(m => m.id)), [droppedMedia]);

  const inProgressMedia = useMemo(() => activeMedia.filter(m => !completedMediaIds.has(m.id) && !droppedMediaIds.has(m.id)), [activeMedia, completedMediaIds, droppedMediaIds]);

  const gatheredLoot = useMemo(() => {
    let intervalArtifacts = artifacts.filter(a => isWithinInterval(subHours(parseISO(a.earnedAt), 5), currentInterval));
    
    const rarityWeight: Record<string, number> = {
      'Mythic': 7,
      'Legendary': 6,
      'Epic': 5,
      'Super Rare': 4,
      'Rare': 3,
      'Uncommon': 2,
      'Common': 1
    };

    intervalArtifacts.sort((a, b) => {
      const weightA = rarityWeight[a.rarity] || 0;
      const weightB = rarityWeight[b.rarity] || 0;
      
      if (weightB !== weightA) {
        return weightB - weightA;
      }
      
      const mLogsA = validLogs.filter(l => l.mediaId === a.mediaId && l.metricType !== 'statusChange');
      const pagesA = mLogsA.reduce((acc, l) => acc + calculateScaledDelta(l.delta, media.find(m => m.id === a.mediaId)!, settings), 0);
      
      const mLogsB = validLogs.filter(l => l.mediaId === b.mediaId && l.metricType !== 'statusChange');
      const pagesB = mLogsB.reduce((acc, l) => acc + calculateScaledDelta(l.delta, media.find(m => m.id === b.mediaId)!, settings), 0);
      
      return pagesB - pagesA;
    });

    if (timeframe === 'month') return intervalArtifacts.slice(0, 5);
    if (timeframe === 'year') return intervalArtifacts.slice(0, 10);
    return intervalArtifacts;
  }, [artifacts, currentInterval, timeframe, validLogs, media, settings]);

  const totalMasterPages = useMemo(() => {
    return activeProgressLogs.reduce((acc, log) => {
      const m = media.find(x => x.id === log.mediaId);
      if (!m) return acc;
      return acc + calculateScaledDelta(log.delta || 0, m, settings);
    }, 0);
  }, [activeProgressLogs, media, settings]);

  // --- The measured layer -------------------------------------------------
  // Every infographic and every number the narrative quotes comes from here, so
  // the charts and the prose can never disagree about what happened.

  const previousInterval = useMemo(() => {
    if (timeframe === 'week') {
      const t = subWeeks(currentInterval.start, 1);
      return { start: startOfISOWeek(t), end: endOfISOWeek(t) };
    }
    if (timeframe === 'month') {
      const t = subMonths(currentInterval.start, 1);
      return { start: startOfMonth(t), end: endOfMonth(t) };
    }
    const t = subYears(currentInterval.start, 1);
    return { start: startOfYear(t), end: endOfYear(t) };
  }, [timeframe, currentInterval]);

  const previousProgressLogs = useMemo(
    () => logsInInterval(validLogs, previousInterval).filter((l) => l.metricType !== 'statusChange'),
    [validLogs, previousInterval],
  );

  /** Titles that changed to a finished state inside an interval. */
  const countCompletedIn = React.useCallback((interval: { start: Date; end: Date }) => {
    const ids = new Set(
      logsInInterval(validLogs, interval)
        .filter((l) => l.metricType === 'statusChange' && (l.note?.toLowerCase().includes('to completed') || l.note?.toLowerCase().includes('to extras')))
        .map((l) => l.mediaId),
    );
    return ids.size;
  }, [validLogs]);

  const currentMetrics = useMemo(
    () => buildIntervalMetrics(activeProgressLogs, media, settings, currentInterval, {
      completed: completedMedia.length,
      dropped: droppedMedia.length,
    }),
    [activeProgressLogs, media, settings, currentInterval, completedMedia.length, droppedMedia.length],
  );

  const previousMetrics = useMemo(
    () => buildIntervalMetrics(previousProgressLogs, media, settings, previousInterval, {
      completed: countCompletedIn(previousInterval),
    }),
    [previousProgressLogs, media, settings, previousInterval, countCompletedIn],
  );

  const comparison = useMemo(
    () => buildComparison(currentMetrics, previousProgressLogs.length > 0 ? previousMetrics : null),
    [currentMetrics, previousMetrics, previousProgressLogs.length],
  );

  const momentumSeries = useMemo(
    () => buildMomentumSeries(currentMetrics, previousProgressLogs.length > 0 ? previousMetrics : null),
    [currentMetrics, previousMetrics, previousProgressLogs.length],
  );

  const clock = useMemo(() => buildClock(currentMetrics), [currentMetrics]);

  // A title "started here" if its very first log in the whole archive lands in
  // this period — that is what separates a fresh start from a carry-over.
  const startedIds = useMemo(() => {
    const firstSeen = new Map<string, number>();
    validLogs.forEach((l) => {
      const t = shift(l.timestamp).getTime();
      const known = firstSeen.get(l.mediaId);
      if (known === undefined || t < known) firstSeen.set(l.mediaId, t);
    });
    const ids = new Set<string>();
    activeMedia.forEach((m) => {
      const first = firstSeen.get(m.id);
      if (first !== undefined && first >= currentInterval.start.getTime() && first <= currentInterval.end.getTime()) {
        ids.add(m.id);
      }
    });
    return ids;
  }, [validLogs, activeMedia, currentInterval]);

  const pipeline = useMemo(
    () => buildPipeline({ touched: activeMedia, completedIds: completedMediaIds, droppedIds: droppedMediaIds, startedIds }),
    [activeMedia, completedMediaIds, droppedMediaIds, startedIds],
  );

  const rankRace = useMemo(
    () => buildRankRace(activeProgressLogs, media, settings, currentInterval, timeframe),
    [activeProgressLogs, media, settings, currentInterval, timeframe],
  );

  const taste = useMemo(() => buildTasteAlignment(activeMedia), [activeMedia]);

  // Records are only meaningful against comparable periods, so history is
  // bucketed by the same timeframe the user is currently looking at.
  const records = useMemo(() => {
    const keyFor = (d: Date) =>
      timeframe === 'week' ? format(d, "RRRR-'W'II") : timeframe === 'month' ? format(d, 'yyyy-MM') : format(d, 'yyyy');
    const boundsFor = (d: Date) =>
      timeframe === 'week'
        ? { start: startOfISOWeek(d), end: endOfISOWeek(d) }
        : timeframe === 'month'
          ? { start: startOfMonth(d), end: endOfMonth(d) }
          : { start: startOfYear(d), end: endOfYear(d) };
    const history = buildHistoryMetrics(
      validLogs.filter((l) => l.metricType !== 'statusChange'),
      media, settings, keyFor, boundsFor,
    );
    return buildRecords(currentMetrics, history, timeId);
  }, [validLogs, media, settings, timeframe, currentMetrics, timeId]);

  const currentRecap = useMemo(() => {
    if (isLoading) return undefined; // Return undefined while loading to avoid false "missing" states
    return aiRecaps.find(r => r.timeframe === timeframe && r.timeId === timeId) || null;
  }, [aiRecaps, timeframe, timeId, isLoading]);

  const formatIntervalLabel = () => {
    if (timeframe === 'week') {
      if (offsetOffset === 1) return 'Last Week';
      return `${format(currentInterval.start, 'MMM d')} - ${format(currentInterval.end, 'MMM d, yyyy')}`;
    }
    if (timeframe === 'month') {
      if (offsetOffset === 1) return 'Last Month';
      return format(currentInterval.start, 'MMMM yyyy');
    }
    if (timeframe === 'year') {
      if (offsetOffset === 1) return 'Last Year';
      return format(currentInterval.start, 'yyyy');
    }
    return '';
  };

  const handlePrevious = () => setOffsetOffset(p => p + 1);
  const handleNext = () => setOffsetOffset(p => Math.max(1, p - 1));

  useEffect(() => {
    // Only trigger if:
    // 1. Not loading
    // 2. No recap exists (returned null, not undefined)
    // 3. There is activity
    // 4. We have API keys
    // 5. Not already generating
    // 6. We are looking at a RECENT period (e.g. within the last 2 periods) to prevent mass historical generation
    const isRecent = offsetOffset <= 2;

    if (!isLoading && currentRecap === null && activeLogs.length > 0 && settings?.nanoGptApiKey && !isGenerating && isRecent) {
      if (!attemptedGenRef.current.has(timeId)) {
        attemptedGenRef.current.add(timeId);
        setTimeout(() => handleGenerateAI(), 100);
      }
    }
  }, [currentRecap, activeLogs.length, settings?.nanoGptApiKey, isGenerating, timeId, isLoading, offsetOffset]);

  const handleGenerateAI = async () => {
    if (!settings?.nanoGptApiKey) {
      toast.error("Please configure your Nano-GPT API Key in the Settings menu first.");
      return;
    }
    
    setIsGenerating(true);
    try {
      let rankingLimit = timeframe === 'week' ? 999 : (timeframe === 'month' ? 5 : 20);
      
      const mediaRanking = activeMedia.map(m => {
        const mLogs = activeProgressLogs.filter(l => l.mediaId === m.id);
        const pages = mLogs.reduce((acc, l) => acc + calculateScaledDelta(l.delta, m, settings), 0);
        return { title: m.title, type: m.mediaType, pages };
      }).sort((a,b) => b.pages - a.pages).slice(0, rankingLimit);

      // Defeated Bosses in this interval
      const defeatedBosses = worldBosses.filter(b => 
        b.status === 'Defeated' && 
        b.updatedAt && 
        isWithinInterval(subHours(parseISO(b.updatedAt), 5), currentInterval)
      );

      // PR Calculation
      const previousIntervalRecaps = aiRecaps.filter(r => r.timeframe === timeframe && r.timeId < timeId);
      const pastMaxPages = previousIntervalRecaps.reduce((max, r) => Math.max(max, r.data?.totalMasterPages || 0), 0);
      const isNewPR = totalMasterPages > pastMaxPages && previousIntervalRecaps.length > 0;

      // Genre Distribution
      const calculateGenres = (logsToProcess: ProgressLog[]) => {
        const dist: Record<string, number> = {};
        logsToProcess.forEach(l => {
          const m = media.find(x => x.id === l.mediaId);
          if (!m) return;
          const pages = calculateScaledDelta(l.delta, m, settings);
          m.genres.forEach(g => {
            dist[g] = (dist[g] || 0) + pages;
          });
        });
        return dist;
      };

      const currentGenreDist = calculateGenres(activeProgressLogs);
      
      // Previous interval genre dist for shift analysis
      const prevTarget = timeframe === 'week' ? subWeeks(currentInterval.start, 1) : 
                        timeframe === 'month' ? subMonths(currentInterval.start, 1) : subYears(currentInterval.start, 1);
      const prevInterval = timeframe === 'week' ? { start: startOfWeek(prevTarget, { weekStartsOn: 1 }), end: endOfWeek(prevTarget, { weekStartsOn: 1 }) } :
                          timeframe === 'month' ? { start: startOfMonth(prevTarget), end: endOfMonth(prevTarget) } :
                          { start: startOfYear(prevTarget), end: endOfYear(prevTarget) };
      
      const prevLogs = validLogs.filter(log => isWithinInterval(subHours(parseISO(log.timestamp), 5), prevInterval) && log.metricType !== 'statusChange');
      const prevGenreDist = calculateGenres(prevLogs);

      // Previous recaps for continuity
      const previousRecaps = aiRecaps
        .filter(r => r.timeframe === timeframe && r.timeId !== timeId && r.timeId < timeId)
        .sort((a, b) => b.timeId.localeCompare(a.timeId))
        .slice(0, 4)
        .reverse();

      const isFirstRecap = aiRecaps.filter(r => r.timeframe === timeframe && r.timeId < timeId).length === 0;

      // Gap calculation
      let maxGapDays = 0;
      const progressLogs = activeProgressLogs;
      if (progressLogs.length > 1) {
        const sortedDates = progressLogs.map(l => subHours(parseISO(l.timestamp), 5).getTime()).sort();
        for(let i=1; i<sortedDates.length; i++) {
           const gap = (sortedDates[i] - sortedDates[i-1]) / (1000 * 60 * 60 * 24);
           if (gap > maxGapDays) maxGapDays = gap;
        }
      }

      // Lorekeeper Stats
      const historyLogsAtEnd = validLogs.filter(l => subHours(parseISO(l.timestamp), 5).getTime() <= currentInterval.end.getTime());
      
      const bossesAtEnd = worldBosses.filter(b => b.status === 'Defeated' && b.updatedAt && parseISO(b.updatedAt).getTime() <= currentInterval.end.getTime());
      const artifactsAtEnd = artifacts.filter(a => a.earnedAt && parseISO(a.earnedAt).getTime() <= currentInterval.end.getTime());
      
      const rpgStateAtEnd = calculateRPGState(media, historyLogsAtEnd, settings, bossesAtEnd, artifactsAtEnd, currentInterval.end);
      
      const historyLogsAtStart = validLogs.filter(l => subHours(parseISO(l.timestamp), 5).getTime() < currentInterval.start.getTime());
      
      const bossesAtStart = worldBosses.filter(b => b.status === 'Defeated' && b.updatedAt && parseISO(b.updatedAt).getTime() < currentInterval.start.getTime());
      const artifactsAtStart = artifacts.filter(a => a.earnedAt && parseISO(a.earnedAt).getTime() < currentInterval.start.getTime());
      
      const rpgStateAtStart = calculateRPGState(media, historyLogsAtStart, settings, bossesAtStart, artifactsAtStart, new Date(currentInterval.start.getTime() - 1000));

      const finalClassName = aiTextCache[`rpg_title_${rpgStateAtEnd.level}`] || rpgStateAtEnd.className;

      const levelUps = Math.max(0, rpgStateAtEnd.level - rpgStateAtStart.level);
      const activeQuests = rpgStateAtEnd.quests.filter(q => q.type.startsWith(timeframe));
      const completedQuests = activeQuests.filter(q => q.isCompleted);
      const missedQuests = activeQuests.filter(q => !q.isCompleted);

      // Failed Bosses in this interval
      const failedBosses = worldBosses.filter(b => 
        b.status === 'Failed' && 
        b.expiresAt && 
        isWithinInterval(subHours(parseISO(b.expiresAt), 5), currentInterval)
      );

      // Add analytics for specific new modules
      const recapDataConfig = { timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings };
      const contrarianMedia = analyzeContrarian(recapDataConfig);
      const backlogVelocity = analyzeBacklog(recapDataConfig);
      const habitsDetails = analyzeHabits(recapDataConfig);

      // Count loot frequency by rarity
      const lootDist: Record<string, number> = {};
      gatheredLoot.forEach(a => {
        lootDist[a.rarity] = (lootDist[a.rarity] || 0) + 1;
      });

      const promptContext = `
Timeframe: ${timeframe} (${formatIntervalLabel()})
Is First Ever Recap?: ${isFirstRecap ? "YES. Welcome the user to their first recap!" : "NO"}
Mayor Gaps in Logging: ${maxGapDays >= 3 ? `Yes, max gap of ${Math.round(maxGapDays)} days without playing/reading.` : "No major gaps. Consistent!"}

LOREKEEPER LEVELING:
Current Level: ${rpgStateAtEnd.level} (${finalClassName})
Levels Gained this ${timeframe}: ${levelUps}
Quests Completed this ${timeframe}: ${completedQuests.length > 0 ? completedQuests.map(q => `${q.title} - ${q.description}`).join(' | ') : 'None'}
Missed Quests: ${missedQuests.length > 0 ? missedQuests.map(q => `${q.title} - ${q.description} (${q.currentAmount}/${q.targetAmount})`).join(' | ') : 'None'}

BOSSES DEFEATED:
${defeatedBosses.length > 0 ? defeatedBosses.map(b => `- ${b.name} (LV ${b.level})`).join('\n') : 'None'}

Total Master Pages (EXP): ${Math.floor(totalMasterPages)} ${isNewPR ? "(PERSONAL RECORD! Highlight this!)" : ""}
Total Logs: ${activeLogs.length}

MEDIA IN PROGRESS:
${inProgressMedia.map(m => `- ${m.title} (${m.mediaType}): [Critic Rating: ${m.reviewScore || 'N/A'}/5, User Rating: ${m.userRating || 'N/A'}/5]${Array.from(new Set(activeLogs.filter(l => l.mediaId === m.id && l.location && l.location.trim().length > 0).map(l => l.location))).length > 0 ? ` [Consumed at: ${Array.from(new Set(activeLogs.filter(l => l.mediaId === m.id && l.location && l.location.trim().length > 0).map(l => l.location))).join(', ')}]` : ''} ${m.description ? m.description.substring(0, 150) + '...' : 'No description.'} ${m.genres?.length ? 'Genres (ordered by importance): ' + m.genres.join(', ') : ''} ${m.tags?.length ? 'Tags (ordered by importance): ' + m.tags.join(', ') : ''}`).join('\n') || 'None'}

MEDIA DROPPED OR ABANDONED:
${droppedMedia.length > 0 ? droppedMedia.map(m => `- ${m.title} (${m.mediaType}): ${m.dropReason ? `[Drop Reason: ${m.dropReason}]` : '[No reason specified]'}`).join('\n') : 'None'}

MEDIA COMPLETED:
${completedMedia.length > 0 ? completedMedia.map(m => `- ${m.title} (${m.mediaType}): [Critic Rating: ${m.reviewScore || 'N/A'}/5, User Rating: ${m.userRating || 'N/A'}/5]${Array.from(new Set(activeLogs.filter(l => l.mediaId === m.id && l.location && l.location.trim().length > 0).map(l => l.location))).length > 0 ? ` [Consumed at: ${Array.from(new Set(activeLogs.filter(l => l.mediaId === m.id && l.location && l.location.trim().length > 0).map(l => l.location))).join(', ')}]` : ''} ${m.userReview ? `[User Review: "${m.userReview}"] ` : ''}${m.description ? m.description.substring(0, 150) + '...' : 'No description.'} ${m.genres?.length ? 'Genres (ordered by importance): ' + m.genres.join(', ') : ''} ${m.tags?.length ? 'Tags (ordered by importance): ' + m.tags.join(', ') : ''}`).join('\n') : 'None'}

TOP RANKED MEDIA (By Engagement/Master Pages):
${mediaRanking.slice(0,5).map(m => `- ${m.title} (${Math.round(m.pages)} MP)`).join('\n')}

GATHERED LOOT (Artifacts earned by finishing media!):
${gatheredLoot.length > 0 ? gatheredLoot.map(a => `- ${a.name} (${a.rarity}): ${a.description}`).join('\n') : 'None'}

JOURNAL NOTES (User's personal thoughts and reactions!):
${activeLogs.filter(l => l.note && l.note.trim().length > 0).map(l => `- [${l.timestamp.split('T')[0]}] On ${activeMedia.find(m => m.id === l.mediaId)?.title || 'Media'}: "${l.note}"`).join('\n') || 'None'}

MEASURED SIGNALS (hard numbers — quote them, never invent them):
Master pages this ${timeframe}: ${Math.round(comparison.masterPages.value)}${comparison.masterPages.pct !== null ? ` (previous ${timeframe}: ${Math.round(comparison.masterPages.previous)}, ${comparison.masterPages.diff >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(comparison.masterPages.pct))}%)` : ' (no previous period on record)'}
Titles touched: ${comparison.titles.value}${comparison.titles.pct !== null ? ` (was ${comparison.titles.previous})` : ''} | Finished: ${comparison.completed.value}${comparison.completed.pct !== null ? ` (was ${comparison.completed.previous})` : ''}
Consistency: active on ${currentMetrics.activeDays} of ${currentMetrics.totalDays} days, ${currentMetrics.restDays} rest days, longest streak ${currentMetrics.longestStreak} days
Sessions: ${currentMetrics.sessions}, averaging ${Math.round(currentMetrics.avgSession)} MP${currentMetrics.biggestSession ? `; biggest was ${Math.round(currentMetrics.biggestSession.pages)} MP on "${currentMetrics.biggestSession.title}"` : ''}
${currentMetrics.bestDay ? `Biggest day: ${Math.round(currentMetrics.bestDay.pages)} MP on ${currentMetrics.bestDay.key}` : ''}
${clock ? `When they consume: peak window ${clock.peakWindow.start}:00-${clock.peakWindow.end}:00 (${Math.round(clock.peakWindow.share * 100)}% of everything), mostly a ${clock.dominant.name.toLowerCase()} person — ${clock.dominant.range} — at ${Math.round(clock.dominant.share * 100)}% of their master pages` : ''}
Outcomes: ${pipeline.stages.map(st => `${st.label} ${st.count}`).join(', ')}; ${pipeline.stillOpen} carried forward; ${Math.round(pipeline.closureRate * 100)}% closed out
${taste ? `Taste vs critics: ${taste.stance} overall (average gap ${taste.avgGap.toFixed(1)})${taste.biggestChampion ? `; championed "${taste.biggestChampion.title}" (+${taste.biggestChampion.gap.toFixed(1)})` : ''}${taste.biggestSkeptic ? `; resisted "${taste.biggestSkeptic.title}" (${taste.biggestSkeptic.gap.toFixed(1)})` : ''}` : ''}
${rankRace ? `The race: ${rankRace.series.map(r => r.title).join(' vs ')}${rankRace.leadChanges > 0 ? `, lead changed hands ${rankRace.leadChanges} time(s)` : ', one title led throughout'}` : ''}
PERSONAL RECORDS this ${timeframe}: ${records.filter(r => r.isRecord).map(r => `${r.label} — ${r.value} ${r.unit} (previous best ${r.previousBest})`).join(' | ') || 'None broken'}
NEAR MISSES: ${records.filter(r => !r.isRecord && r.previousBest > 0 && r.value >= r.previousBest * 0.85).map(r => `${r.label} — ${r.value} vs best ${r.previousBest}`).join(' | ') || 'None close'}

PREVIOUS RECAPS (Chronological):
${previousRecaps.length > 0 ? previousRecaps.map(r => `-- ${r.timeId} (${r.title}): \n${r.summary}`).join('\n\n') : 'No past recaps available.'}
`;

      const recap = await generateStructuredRecap({
        apiKey: settings.nanoGptApiKey,
        model: settings.nanoGptModel || 'gpt-4o-mini',
        persona: settings.aiPersona,
        timeframe,
        intervalLabel: formatIntervalLabel(),
        context: promptContext,
      });

      await saveAiRecap({
        timeframe,
        timeId,
        title: recap.title,
        summary: recap.summary,
        data: {
          // The whole issue — chapters, awards, chart captions, look-ahead.
          structured: recap,
          totalMasterPages,
          isNewPR,
          defeatedBosses: defeatedBosses.map(b => ({ id: b.id, name: b.name, level: b.level, mediaId: b.mediaId, imageUrl: b.imageUrl })),
          failedBosses: failedBosses.map(b => ({ id: b.id, name: b.name, level: b.level, mediaId: b.mediaId, imageUrl: b.imageUrl })),
          currentGenreDist,
          prevGenreDist,
          levelUps,
          rpgLevel: rpgStateAtEnd.level,
          rpgClass: finalClassName,
          exp: rpgStateAtEnd.currentExp, 
          nextLevelExp: rpgStateAtEnd.nextLevelExp,
          // Kept flat as well: older recap readers still look for these.
          aiRoast: recap.roast,
          aiTheme: recap.theme,
          lootDist,
          backlogVelocity,
          midnightOil: habitsDetails?.timeSegments?.night || 0,
          totalLogs: activeLogs.length,
          contrarian: contrarianMedia ? {
            title: contrarianMedia.media.title,
            mediaType: contrarianMedia.media.mediaType,
            userRating: contrarianMedia.media.userRating,
            reviewScore: contrarianMedia.media.reviewScore,
            type: contrarianMedia.type
          } : null
        }
      });
    } catch (e: any) {
      toast.error("Failed to generate AI Recap: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const renderThemeBanner = () => {
    const themeText = story?.theme || currentRecap?.data?.aiTheme;
    if (!themeText) return null;
    return (
      <div className="w-full text-center py-6">
        <div className="inline-block relative">
           <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full"></div>
           <h3 className="relative text-[10px] uppercase tracking-[0.4em] text-blue-400 font-bold mb-2">Theme of the Period</h3>
           <p className="relative text-2xl md:text-3xl font-black text-white px-8">"{themeText}"</p>
        </div>
      </div>
    );
  };

  const renderAIRoast = () => {
    const roastText = currentRecap?.data?.aiRoast;
    if (!roastText) return null;
    return (
      <div className="bg-rose-950/30 border border-rose-500/10 p-8 rounded-[2rem] mt-6 relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-rose-600"></div>
        <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
          <Flame className="w-48 h-48 text-rose-500" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start">
           <div className="bg-rose-500/10 p-3 rounded-2xl shrink-0">
             <BrainCircuit className="w-8 h-8 text-rose-500" />
           </div>
           <div>
             <h3 className="text-rose-500 font-black text-[11px] uppercase tracking-[0.2em] mb-2">The AI Roast</h3>
             <p className="text-zinc-300 text-lg md:text-xl font-light italic leading-relaxed">"{roastText}"</p>
           </div>
        </div>
      </div>
    );
  };

  const renderMonthlyStats = () => {
    const d = currentRecap?.data;
    if (!d || timeframe !== 'month') return null;

    const velocity = d.backlogVelocity;
    const isAccumulating = velocity && velocity.net > 0;
    
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
        
        {/* Midnight Oil */}
        {d.midnightOil !== undefined && (
          <div className="bg-indigo-950/40 border border-indigo-500/10 p-6 rounded-3xl flex flex-col items-center justify-center text-center">
             <Moon className="w-6 h-6 text-indigo-400 mb-3" />
             <div className="text-2xl font-black text-white">{d.midnightOil}</div>
             <div className="text-[9px] uppercase tracking-widest text-indigo-500/70 mt-1 font-bold">Midnight Sessions</div>
          </div>
        )}

        {/* Backlog Velocity */}
        {velocity && (
          <div className="bg-zinc-900/50 border border-white/5 p-6 rounded-3xl flex flex-col items-center justify-center text-center relative overflow-hidden">
             <Library className="w-6 h-6 text-zinc-500 mb-3" />
             <div className={cn("text-2xl font-black", isAccumulating ? "text-rose-400" : "text-emerald-400")}>
               {isAccumulating ? '+' : ''}{velocity.net}
             </div>
             <div className="text-[9px] uppercase tracking-widest text-zinc-500 mt-1 font-bold">Backlog Change</div>
             {isAccumulating && <div className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-full m-3 animate-pulse"></div>}
          </div>
        )}

        {/* Global XP Milestone */}
        {d.nextLevelExp !== undefined && d.exp !== undefined && (
          <div className="col-span-2 bg-zinc-900/50 border border-white/5 p-6 rounded-3xl flex flex-col justify-center">
             <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-emerald-400" />
                <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Global XP Milestone • LV {d.rpgLevel || 1}</div>
             </div>
             <div className="w-full bg-black rounded-full h-3 border border-white/10 overflow-hidden relative">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.max(0, (d.exp / d.nextLevelExp) * 100))}%` }}
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
                />
             </div>
             <div className="flex justify-between items-center mt-2">
                <span className="text-[10px] font-bold text-emerald-500/70">{Math.round(d.exp).toLocaleString()} XP</span>
                <span className="text-[10px] font-bold text-zinc-600">{Math.round(d.nextLevelExp).toLocaleString()} XP</span>
             </div>
          </div>
        )}
      </div>
    );
  };

  const renderCriticDisparity = () => {
    const d = currentRecap?.data?.contrarian;
    if (!d || timeframe !== 'month') return null;

    return (
      <div className="bg-zinc-900/50 border border-white/5 p-6 rounded-3xl mt-4 flex items-center justify-between">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold mb-1">The Contrarian Award</div>
          <div className="text-sm font-black text-white">{d.title}</div>
          <div className="text-[10px] text-zinc-400">{d.type === 'loved' ? 'You loved it, critics hated it.' : 'You hated it, critics loved it.'}</div>
        </div>
        <div className="flex gap-4">
           <div className="text-center">
              <div className="text-lg font-black text-rose-400">{d.reviewScore}</div>
              <div className="text-[8px] uppercase text-zinc-600 font-bold">Critic</div>
           </div>
           <div className="w-px bg-white/10"></div>
           <div className="text-center">
              <div className="text-lg font-black text-emerald-400">{d.userRating}</div>
              <div className="text-[8px] uppercase text-zinc-600 font-bold">You</div>
           </div>
        </div>
      </div>
    );
  };

  const renderLootDistribution = () => {
    const d = currentRecap?.data?.lootDist;
    if (!d || Object.keys(d).length === 0 || timeframe !== 'month') return null;
    
    // Sort logic to order rarities
    const order = ['Common', 'Uncommon', 'Rare', 'Super Rare', 'Legendary', 'Mythic'];
    const entries = Object.entries(d).sort((a,b) => order.indexOf(a[0]) - order.indexOf(b[0]));

    return (
      <div className="mt-8 bg-black/30 border border-white/5 p-6 rounded-[2rem]">
         <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-6 text-center">Loot Rarity Distribution</div>
         <div className="flex justify-center gap-2 flex-wrap">
           {entries.map(([rarity, count]) => (
             <div key={rarity} className="flex flex-col items-center justify-center p-3 rounded-2xl bg-zinc-900 border border-white/5 min-w-[70px]">
                <div className={cn("text-lg font-black", (RARITY_COLORS as any)[rarity] || "text-zinc-400")}>
                  {count as number}
                </div>
                <div className={cn("text-[8px] uppercase tracking-wider mt-1 opacity-70", (RARITY_COLORS as any)[rarity] || "text-zinc-500")}>{rarity}</div>
             </div>
           ))}
         </div>
      </div>
    );
  };

  const renderFailedBosses = () => {
    const bosses = currentRecap?.data?.failedBosses;
    if (!bosses || bosses.length === 0) return null;

    return (
      <div className="mt-6 bg-rose-950/10 border border-rose-500/10 p-6 rounded-3xl">
        <div className="text-[10px] uppercase tracking-widest text-rose-500/50 font-bold mb-4 flex items-center gap-2">
           <ZapOff className="w-3 h-3" /> The Ones That Got Away
        </div>
        <div className="flex flex-wrap gap-2">
          {bosses.map((boss: any, idx: number) => (
             <div key={idx} className="bg-black/50 border border-rose-500/20 px-4 py-2 rounded-xl flex items-center gap-2">
                <span className="text-zinc-500 text-sm">☠️</span>
                <div>
                   <div className="text-xs font-bold text-zinc-300">{boss.name}</div>
                   <div className="text-[9px] uppercase tracking-widest text-rose-500/50">LV {boss.level} BOSS</div>
                </div>
             </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPRBadge = () => {
    if (!currentRecap?.data?.isNewPR) return null;
    return (
      <motion.div 
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        className="absolute -top-4 -right-4 bg-yellow-500 text-black px-4 py-2 rounded-full font-black text-xs shadow-[0_0_20px_rgba(234,179,8,0.4)] z-30 uppercase tracking-[0.2em] border-2 border-black"
      >
        Personal Record!
      </motion.div>
    );
  };

  const renderBossTrophyRoom = () => {
    const bosses = currentRecap?.data?.defeatedBosses;
    if (!bosses || bosses.length === 0) return null;

    return (
      <div className="bg-black/50 border border-white/5 p-10 rounded-[3rem] mt-8">
        <h3 className="text-xl font-black text-white mb-8 flex items-center gap-4">
          <Trophy className="w-8 h-8 text-amber-500" />
          Boss Trophy Room
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {bosses.map((boss: any, idx: number) => {
            const m = media.find(x => x.id === boss.mediaId);
            const liveBoss = worldBosses.find(wb => (boss.id && wb.id === boss.id) || (wb.mediaId === boss.mediaId && wb.name === boss.name));
            const bossImg = boss.imageUrl || liveBoss?.imageUrl;
            return (
              <div key={idx} className="group relative bg-zinc-900 border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center text-center hover:border-white/20 transition-all">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border border-red-500/20 group-hover:scale-110 transition-transform overflow-hidden bg-red-500/10">
                  {bossImg
                    ? <img src={bossImg} alt={boss.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    : <Ghost className="w-8 h-8 text-red-500/50" />}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">LV {boss.level} BOSS</div>
                <div className="text-sm font-black text-white leading-tight mb-2">{boss.name}</div>
                {m && <div className={`text-[8px] font-black uppercase tracking-widest opacity-60 ${MEDIA_COLORS[m.mediaType]?.text}`}>{m.title}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderGenreRadar = () => {
    const dist = currentRecap?.data?.currentGenreDist;
    if (!dist || Object.keys(dist).length < 3) return null;

    const data = Object.entries(dist)
      .map(([name, value]) => ({ name, value: Math.round(value as number) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    return (
      <div className="bg-zinc-900/50 border border-white/5 p-8 rounded-[2.5rem] flex flex-col items-center">
        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 mb-8 self-start">Genre Fusion Map</h4>
        <div className="w-full h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
              <PolarGrid stroke="#ffffff10" />
              <PolarAngleAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10, fontWeight: 900 }} />
              <Radar
                name="Pages"
                dataKey="value"
                stroke={theme.text.replace('text-', '') === 'orange-500' ? '#f97316' : theme.text.replace('text-', '') === 'indigo-400' ? '#818cf8' : '#34d399'}
                fill={theme.text.replace('text-', '') === 'orange-500' ? '#f97316' : theme.text.replace('text-', '') === 'indigo-400' ? '#818cf8' : '#34d399'}
                fillOpacity={0.4}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#000', border: '1px solid #ffffff10', borderRadius: '12px' }}
                itemStyle={{ color: '#fff', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderFocusShift = () => {
    const cur = currentRecap?.data?.currentGenreDist || {};
    const prev = currentRecap?.data?.prevGenreDist || {};
    
    const allGenres = Array.from(new Set([...Object.keys(cur), ...Object.keys(prev)]));
    const shifts = allGenres.map(g => {
      const cVal = cur[g] || 0;
      const pVal = prev[g] || 0;
      const diff = cVal - pVal;
      const pct = pVal > 0 ? (diff / pVal) * 100 : 100;
      return { genre: g, diff, pct, current: cVal };
    }).sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 5);

    if (shifts.length === 0) return null;

    return (
      <div className="bg-zinc-900/50 border border-white/5 p-8 rounded-[2.5rem]">
        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 mb-6">Focus Shift Analysis</h4>
        <div className="space-y-4">
          {shifts.map(s => (
            <div key={s.genre} className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black text-white uppercase tracking-wider">{s.genre}</div>
                <div className="text-[9px] font-bold text-zinc-500 uppercase">{Math.round(s.current)} Pages</div>
              </div>
              <div className={cn(
                "text-[10px] font-black px-2 py-1 rounded-lg border",
                s.diff > 0 ? "text-emerald-400 bg-emerald-400/5 border-emerald-400/10" : "text-rose-400 bg-rose-400/5 border-rose-400/10"
              )}>
                {s.diff > 0 ? '+' : ''}{Math.round(s.pct)}%
              </div>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-zinc-600 mt-6 leading-relaxed italic">
          Comparing engagement against the previous equivalent interval.
        </p>
      </div>
    );
  };

  const getTheme = () => {
    switch(timeframe) {
      case 'week': return { 
        text: 'text-orange-500', 
        bg: 'bg-orange-500/10', 
        border: 'border-orange-500/20', 
        glow: 'bg-orange-500/5', 
        primary: 'orange',
        label: 'Weekly Pulse',
        icon: <Zap className="w-5 h-5" />
      };
      case 'month': return { 
        text: 'text-indigo-400', 
        bg: 'bg-indigo-400/10', 
        border: 'border-indigo-400/20', 
        glow: 'bg-indigo-400/5', 
        primary: 'indigo',
        label: 'Monthly Resonance',
        icon: <Moon className="w-5 h-5" />
      };
      case 'year': return { 
        text: 'text-emerald-400', 
        bg: 'bg-emerald-400/10', 
        border: 'border-emerald-400/20', 
        glow: 'bg-emerald-400/5', 
        primary: 'emerald',
        label: 'Yearly Odyssey',
        icon: <Compass className="w-5 h-5" />
      };
    }
  };

  const theme = getTheme();
  /** The recap as an issue: chapters, awards, captions — legacy rows included. */
  const story = useMemo(() => readRecap(currentRecap), [currentRecap]);
  const captions = story?.captions || {};

  const renderTopCreator = () => {
     const creatorPages: Record<string, number> = {};
     activeProgressLogs.forEach(l => {
        const m = activeMedia.find(x => x.id === l.mediaId);
        if (m && m.creator) {
           creatorPages[m.creator] = (creatorPages[m.creator] || 0) + calculateScaledDelta(l.delta, m, settings);
        }
     });
     const sorted = Object.entries(creatorPages).sort((a,b) => b[1] - a[1]);
     if (sorted.length === 0) return null;
     const [name, amount] = sorted[0];

     return (
        <div className={`${theme.bg} ${theme.border} p-6 rounded-3xl relative overflow-hidden group`}>
           <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 blur-3xl -mr-12 -mt-12 rounded-full" />
           <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-2">Prime Architect</h4>
           <div className="text-xl font-black text-white truncate mb-1">{name}</div>
           <div className={`text-xs font-bold ${theme.text}`}>{Math.round(amount)} Master Pages Logged</div>
        </div>
     );
  };

  const renderTimeTraveler = () => {
     const avgYear = analyzeTimeTraveler({ timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings });
     if (!avgYear) return null;

     return (
        <div className="bg-zinc-900/50 border border-white/5 p-6 rounded-3xl flex flex-col items-center justify-center text-center">
           <History className="w-10 h-10 text-zinc-600 mb-4" />
           <div className="text-3xl font-black text-white">{avgYear}</div>
           <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mt-2">Era of Focus</div>
           <p className="text-[9px] text-zinc-600 mt-2 max-w-[120px]">Average publication year of consumed media.</p>
        </div>
     );
  };

  const renderBacklogHealth = () => {
     const status = analyzeBacklog({ timeScale: timeframe, logs: activeLogs, media: activeMedia, allMedia: media, settings });
     return (
        <div className="bg-zinc-900/50 border border-white/5 p-6 rounded-3xl">
           <h3 className="text-lg font-black text-white mb-6 flex items-center gap-3">
             <Library className="w-5 h-5 text-zinc-400" />
             Backlog Pulse
           </h3>
           <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                 <div className="text-xl font-black text-emerald-400">{status.completed}</div>
                 <div className="text-[8px] font-black uppercase text-zinc-500">Conquered</div>
              </div>
              <div className="text-center p-3 rounded-2xl bg-orange-500/5 border border-orange-500/10">
                 <div className="text-xl font-black text-orange-400">{status.planned}</div>
                 <div className="text-[8px] font-black uppercase text-zinc-500">Planned</div>
              </div>
           </div>
           <div className="mt-4 text-center">
              <span className={`text-xs font-bold ${status.net > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                 {status.net > 0 ? `Net Growth: +${status.net} items` : `Efficient Burn: ${status.net} items`}
              </span>
           </div>
        </div>
     );
  };

  const renderBingeSpotlight = () => {
     const binge = analyzeBingeFactor({ timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings });
     if (!binge) return null;

     return (
        <div className={`${theme.bg} ${theme.border} p-6 rounded-3xl relative overflow-hidden group`}>
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Flame className="w-16 h-16 text-white" />
           </div>
           <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-2">Binge Spotlight</h4>
           <div className="text-lg font-black text-white truncate mb-1">{binge.media.title}</div>
           <p className="text-xs text-zinc-400 leading-snug">You blazed through this in a record session period.</p>
        </div>
     );
  };

  const renderSunkCost = () => {
     const sunk = analyzeSunkCost({ timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings });
     if (!sunk) return null;

     return (
        <div className="bg-red-500/5 border border-red-500/10 p-6 rounded-3xl overflow-hidden relative">
           <div className="absolute -bottom-8 -right-8 opacity-5">
              <Ghost className="w-32 h-32" />
           </div>
           <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500/60 mb-2 font-black">Shadow Valley</h4>
           <div className="text-lg font-black text-white truncate">{sunk.media.title}</div>
           <p className="text-xs text-zinc-500 mt-2">High investment, but low resonance. A tough path to tread.</p>
        </div>
     );
  };

  const renderRanking = () => {
    const limit = timeframe === 'week' ? 999 : (timeframe === 'month' ? 5 : 20);
    let ranked = activeMedia.map(m => {
        const mLogs = activeProgressLogs.filter(l => l.mediaId === m.id);
        const pages = mLogs.reduce((acc, l) => acc + calculateScaledDelta(l.delta, m, settings), 0);
        return { item: m, pages };
    }).filter(m => m.pages > 0).sort((a,b) => b.pages - a.pages);

    if (timeframe === 'year') {
        const byClass: Record<string, typeof ranked> = {};
        ranked.forEach(r => {
            if (!byClass[r.item.mediaType]) byClass[r.item.mediaType] = [];
            byClass[r.item.mediaType].push(r);
        });
        const finalRanked: typeof ranked = [];
        Object.values(byClass).forEach(arr => {
            finalRanked.push(...arr.slice(0,3)); // top 3 per class
        });
        ranked = finalRanked.sort((a,b) => b.pages - a.pages).slice(0, limit);
    } else {
        ranked = ranked.slice(0, limit);
    }

    if (ranked.length === 0) return <p className="text-zinc-500 italic text-sm">No recorded progress.</p>;

    return (
      <div className="space-y-4">
        {ranked.map((r, i) => (
           <div key={`${r.item.id}-${i}`} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors relative overflow-hidden group">
              {r.item.coverImageUrl && (
                <div 
                  className="absolute inset-0 opacity-20 bg-cover bg-center transition-opacity group-hover:opacity-30" 
                  style={{ backgroundImage: `url(${r.item.coverImageUrl})` }} 
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-900 via-zinc-900/80 to-transparent" />
              
              <div className="flex items-center gap-4 relative z-10">
                 <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 border-2 ${i === 0 ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : (i === 1 ? 'bg-zinc-300/20 text-zinc-300 border-zinc-400/50' : (i === 2 ? 'bg-orange-700/20 text-orange-400 border-orange-700/50' : 'bg-black/50 text-zinc-500 border-white/5'))}`}>
                   #{i+1}
                 </div>
                 {r.item.coverImageUrl && (
                   <img src={r.item.coverImageUrl} className="w-10 h-14 object-cover rounded-md shadow-lg shrink-0 border border-white/10" alt="" />
                 )}
                 <div className="flex flex-col min-w-0">
                    <span className="font-bold text-white text-base truncate">{r.item.title}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                       <span className={`text-[10px] uppercase tracking-widest font-bold ${MEDIA_COLORS[r.item.mediaType]?.text || 'text-zinc-400'}`}>{r.item.mediaType}</span>
                       {r.item.reviewScore && <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/20 rounded-md text-blue-400 font-bold">C: {r.item.reviewScore}</span>}
                       {r.item.userRating && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 rounded-md text-amber-500 font-bold">★ {r.item.userRating}</span>}
                    </div>
                 </div>
              </div>
              <div className="text-right relative z-10 shrink-0 ml-4">
                 <div className="text-orange-400 font-black text-lg tracking-widest bg-black/60 px-3 py-1 rounded-lg border border-orange-500/20 backdrop-blur-sm">{Math.round(r.pages)} MP</div>
              </div>
           </div>
        ))}
      </div>
    );
  };

  const renderHabitsHeatmap = () => {
    const habits = analyzeHabits({ timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings });
    if (!habits) return null;

    const data = habits.hourCounts.map((count, hour) => ({
      hour: `${hour}:00`,
      count
    }));

    return (
      <div className="bg-black/40 border border-white/5 p-8 rounded-3xl flex flex-col h-fit">
        <h3 className="text-lg font-black text-white mb-8 flex items-center gap-3">
          <Activity className={`w-5 h-5 ${theme.text}`} />
          Chronological Intensity
        </h3>
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="hour" hide />
              <YAxis hide />
              <Tooltip 
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ backgroundColor: '#09090b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}
                itemStyle={{ color: timeframe === 'year' ? '#34d399' : '#818cf8' }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={index >= 20 || index <= 4 ? '#27272a' : (timeframe === 'year' ? '#10b981' : '#6366f1')} opacity={0.6 + (index / 24) * 0.4} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-between mt-6 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">
           <span>Midnight</span>
           <span>Noon</span>
           <span>Midnight</span>
        </div>
      </div>
    );
  };

  const renderDNADeepDive = () => {
    const dna = analyzeMediaDNA({ timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings });
    if (!dna || dna.traits.length === 0) return null;

    return (
      <div className="bg-zinc-900/50 border border-white/5 p-6 md:p-8 rounded-3xl">
        <h3 className="text-xl font-black text-white mb-1 flex items-center gap-3">
          <BrainCircuit className="w-6 h-6 text-orange-500" />
          Thematic DNA
        </h3>
        <p className="text-zinc-500 text-xs mb-6 uppercase tracking-widest font-bold">What your consumption says about you</p>
        
        <div className="space-y-6">
           <div className="flex flex-wrap gap-2">
              {dna.traits.map(([trait, val]) => (
                 <div key={trait} className="px-4 py-2 bg-gradient-to-br from-zinc-800 to-black border border-white/5 rounded-2xl text-sm text-zinc-300 flex items-center gap-3 shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
                    <span className="font-bold">{trait}</span>
                    <span className="text-[10px] text-zinc-600 font-black">{Math.round(val)} MP</span>
                 </div>
              ))}
           </div>

           {dna.genres.length > 0 && (
             <div className="pt-6 border-t border-white/5">
                <h4 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-zinc-500" /> Domain Mastery
                </h4>
                <div className="space-y-3">
                   {dna.genres.map(([genre, pages]) => (
                     <div key={genre} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold">
                           <span className="text-zinc-300">{genre}</span>
                           <span className="text-orange-400">{Math.round(pages)} MP</span>
                        </div>
                        <div className="w-full h-1.5 bg-black rounded-full overflow-hidden border border-white/5">
                           <motion.div 
                             initial={{ width: 0 }}
                             animate={{ width: `${(pages / (dna.genres[0][1] as number)) * 100}%` }}
                             className="h-full bg-orange-500"
                           />
                        </div>
                     </div>
                   ))}
                </div>
             </div>
           )}
        </div>
      </div>
    );
  };

   const renderVelocity = () => {
    const velocity = analyzeSessionVelocity({ timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings });
    if (!velocity) return null;

    const data = [
      { name: 'Binges', value: velocity.bins.binges, color: timeframe === 'week' ? '#f97316' : (timeframe === 'month' ? '#4f46e5' : '#10b981') },
      { name: 'Standard', value: velocity.bins.standard, color: timeframe === 'week' ? '#d97706' : (timeframe === 'month' ? '#6366f1' : '#059669') },
      { name: 'Snippets', value: velocity.bins.snippets, color: timeframe === 'week' ? '#fbbf24' : (timeframe === 'month' ? '#818cf8' : '#047857') },
    ].filter(d => d.value > 0);

    return (
      <div className={`bg-black/40 border border-white/5 p-6 rounded-3xl flex flex-col`}>
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-6 flex items-center gap-3">
          <Zap className={`w-4 h-4 ${theme.text}`} />
          {timeframe === 'week' ? 'Blast Radius' : 'Momentum'}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
           <div className="w-full aspect-square max-w-[120px] mx-auto relative">
              <ResponsiveContainer width="100%" height="100%">
                 <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={data}
                      innerRadius="65%"
                      outerRadius="95%"
                      paddingAngle={5}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                 </PieChart>
              </ResponsiveContainer>
           </div>
           <div className="flex flex-col gap-4">
              <div className="space-y-4">
                {data.map(d => (
                  <div key={d.name} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                       <div className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]" style={{ backgroundColor: d.color }} />
                       <span className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em]">{d.name}</span>
                    </div>
                    <span className="text-base font-black text-white ml-2">{d.value}</span>
                  </div>
                ))}
              </div>
              
              <div className="mt-2 pt-4 border-t border-white/5 grid grid-cols-2 gap-2">
                 <div className="flex flex-col">
                    <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest leading-none">Avg</span>
                    <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-1">Output</span>
                 </div>
                 <div className="flex flex-col items-end text-right">
                    <span className={`text-lg font-black leading-none ${theme.text}`}>{Math.round(velocity.avg)}</span>
                    <span className={`text-[9px] font-black uppercase tracking-tighter mt-1 ${theme.text} opacity-80`}>Master Pages</span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
  };

  const renderArchetypesSection = () => {
    const earned = determineArchetypes({ timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings });
    if (earned.length === 0) return null;

    return (
      <div className={`bg-gradient-to-br from-${theme.primary}-500/10 via-black to-black border ${theme.border} rounded-3xl p-6 md:p-10 relative overflow-hidden`}>
         <div className={`absolute top-0 right-0 w-64 h-64 ${theme.glow} blur-[80px] rounded-full -mr-32 -mt-32`} />
         <h3 className="text-2xl font-black text-white mb-8 flex items-center gap-4 relative z-10">
            <Compass className={`w-8 h-8 ${theme.text}`} />
            {timeframe === 'year' ? "Hall of Archetypes" : "Earned Mantles"}
         </h3>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
            {earned.map(a => (
               <div key={a.id} className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-start gap-4 group hover:bg-white/10 hover:border-white/20 transition-all cursor-default">
                  <div className={`w-12 h-12 rounded-2xl ${theme.bg} flex items-center justify-center shrink-0 border ${theme.border} group-hover:scale-110 transition-transform shadow-xl`}>
                     <Star className={`w-6 h-6 ${theme.text} fill-current opacity-30`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-white font-black text-lg tracking-tight leading-tight mb-1.5">{a.name}</div>
                    <div className="text-xs text-zinc-400 leading-snug">{a.reason}</div>
                  </div>
               </div>
            ))}
         </div>
      </div>
    );
  };

  const renderTypeBreakdown = () => {
    const breakdown: Record<string, number> = {};
    activeProgressLogs.forEach(l => {
      const m = activeMedia.find(x => x.id === l.mediaId);
      if (m) {
         breakdown[m.mediaType] = (breakdown[m.mediaType] || 0) + calculateScaledDelta(l.delta, m, settings);
      }
    });

    const entries = Object.entries(breakdown).sort((a,b) => b[1] - a[1]);
    if (entries.length === 0) return null;

    return (
       <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4`}>
          {entries.map(([type, amount]) => (
            <div key={type} className="bg-black/30 border border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center text-center group hover:border-white/20 transition-all shadow-inner relative overflow-hidden">
               <div className={`absolute top-0 left-0 w-1 h-full ${MEDIA_COLORS[type as any]?.bg || 'bg-zinc-500'} opacity-30`} />
               <span className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${MEDIA_COLORS[type as any]?.text || 'text-zinc-400'}`}>{type}</span>
               <span className="text-2xl font-black text-white group-hover:scale-110 transition-transform">{Math.round(amount)}</span>
               <span className="text-[10px] text-zinc-500 mt-1 uppercase font-bold tracking-tighter">Pages</span>
            </div>
          ))}
       </div>
    );
  };

  const renderActiveTime = () => {
    const habits = analyzeHabits({ timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings });
    if (!habits) return null;

    const dayPages: Record<string, number> = {};
    activeProgressLogs.forEach(l => {
      const day = format(subHours(parseISO(l.timestamp), 5), 'EEEE');
      const m = activeMedia.find(x => x.id === l.mediaId);
      if (m) {
        dayPages[day] = (dayPages[day] || 0) + calculateScaledDelta(l.delta, m, settings);
      }
    });
    
    let peakDay = '';
    let peakPages = -1;
    Object.entries(dayPages).forEach(([day, pages]) => {
      if (pages > peakPages) {
        peakPages = pages;
        peakDay = day;
      }
    });

    return (
       <div className={`${theme.bg} ${theme.border} p-8 rounded-3xl flex items-center gap-6 shadow-2xl relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl rounded-full" />
          <div className={`w-16 h-16 rounded-2xl ${theme.bg} flex items-center justify-center shrink-0 border ${theme.border} relative z-10`}>
            <Clock className={`w-8 h-8 ${theme.text}`} />
          </div>
          <div className="relative z-10">
            <h4 className={`${theme.text} font-black text-[10px] uppercase tracking-[0.3em] mb-2`}>Temporal Resonance</h4>
            <p className="text-white font-black text-2xl tracking-tighter">{peakDay ? `${peakDay}s (${habits.profile})` : habits.profile}</p>
            <p className="text-zinc-400 text-sm mt-1 max-w-md leading-relaxed">{peakDay ? `Your most potent energy manifests on ${peakDay}s. ` : ''}{habits.desc}</p>
          </div>
       </div>
    );
  };

   const renderPatterns = () => {
     if (timeframe !== 'year') return null;
     const dna = analyzeMediaDNA({ timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings });
     if (!dna || dna.traits.length === 0) return null;
     return (
        <div className="space-y-3">
           <h4 className="text-orange-400 font-bold text-xs uppercase tracking-widest mb-1">Noticeable Themes</h4>
           <div className="flex flex-wrap gap-2">
             {dna.traits.map(([trait, val]) => (
                <div key={trait} className="px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-sm text-zinc-300 flex items-center gap-2">
                   <BrainCircuit className="w-4 h-4 text-orange-500/70" />
                   {trait}
                </div>
             ))}
           </div>
        </div>
     );
  };

  const renderLorekeeper = () => {
     const historyLogsAtEnd = validLogs.filter(l => subHours(parseISO(l.timestamp), 5).getTime() <= currentInterval.end.getTime());
     const bossesAtEnd = worldBosses.filter(b => b.status === 'Defeated' && b.updatedAt && parseISO(b.updatedAt).getTime() <= currentInterval.end.getTime());
     const artifactsAtEnd = artifacts.filter(a => a.earnedAt && parseISO(a.earnedAt).getTime() <= currentInterval.end.getTime());
     const rpgStateAtEnd = calculateRPGState(media, historyLogsAtEnd, settings, bossesAtEnd, artifactsAtEnd, currentInterval.end);
     const activeQuests = rpgStateAtEnd.quests.filter(q => q.type.startsWith(timeframe));
     const completedQuests = activeQuests.filter(q => q.isCompleted);
     const missedQuests = activeQuests.filter(q => !q.isCompleted);

     const finalRenderedClassName = currentRecap?.data?.rpgClass || aiTextCache[`rpg_title_${rpgStateAtEnd.level}`] || rpgStateAtEnd.className;

     return (
        <div className="bg-gradient-to-br from-indigo-900/40 to-black border border-indigo-500/20 p-6 rounded-3xl relative overflow-hidden">
           <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[50px] rounded-full pointer-events-none" />
           <h3 className="text-lg font-black text-indigo-400 mb-6 flex items-center gap-3">
             <Star className="w-5 h-5" />
             Lorekeeper Progress
           </h3>
           <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex flex-col items-center justify-center border border-indigo-500/30">
                 <span className="text-[9px] font-black uppercase text-indigo-300">Level</span>
                 <span className="text-xl font-black text-white leading-none">{rpgStateAtEnd.level}</span>
              </div>
              <div>
                 <div className="text-sm font-bold text-zinc-300">{finalRenderedClassName}</div>
                 <div className="text-xs text-zinc-500">{Math.floor(rpgStateAtEnd.currentExp)} Total EXP</div>
              </div>
           </div>
           
           <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/30 border border-white/5 p-3 rounded-2xl text-center">
                 <div className="text-2xl font-black text-emerald-400">{completedQuests.length}</div>
                 <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mt-1">Quests Done</div>
              </div>
              <div className="bg-black/30 border border-white/5 p-3 rounded-2xl text-center">
                 <div className="text-2xl font-black text-orange-400">{missedQuests.length}</div>
                 <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mt-1">Quests Missed</div>
              </div>
           </div>
        </div>
     );
  };

  const renderGatheredLoot = () => {
     if (gatheredLoot.length === 0) return null;

     return (
        <div className="bg-zinc-900/50 border border-white/5 p-6 rounded-3xl">
           <h3 className="text-lg font-black text-white mb-6 flex items-center gap-3">
             <Trophy className="w-5 h-5 text-amber-500" />
             Gathered Loot
           </h3>
           <div className="space-y-4">
              {gatheredLoot.map((artifact, idx) => {
                 const style = RARITY_COLORS[artifact.rarity] || RARITY_COLORS['Common'];
                 return (
                 <div key={idx} className="flex gap-3 p-3 bg-black/40 rounded-2xl border border-white/5 relative overflow-hidden group">
                    {artifact.imageUrl && (
                       <img src={artifact.imageUrl} alt={artifact.name} referrerPolicy="no-referrer" className={cn("w-14 h-14 rounded-xl object-cover shrink-0 border", style.border.replace('500', '500/30'))} />
                    )}
                    <div className="flex flex-col gap-2 min-w-0 flex-1">
                       <div className="flex justify-between items-start gap-4 z-10 relative">
                          <span className={cn("font-bold text-sm line-clamp-2", style.text)}>{artifact.name}</span>
                          <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border whitespace-nowrap", style.text, style.bg, style.border.replace('500', '500/30'))}>
                             {artifact.rarity}
                          </span>
                       </div>
                       <p className="text-xs text-zinc-500 z-10 relative line-clamp-2">{artifact.description}</p>
                       {artifact.targetType && (
                          <div className="flex items-center justify-between mt-1 opacity-70">
                             <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{artifact.targetType}: {artifact.targetValue}</span>
                             <span className="text-[10px] text-green-400 font-black tracking-widest">+{artifact.bonusPercent || 20}%</span>
                          </div>
                       )}
                    </div>
                 </div>
              );})}
           </div>
        </div>
     );
  };

  const renderLocationBreakdown = () => {
     const locations: Record<string, number> = {};
     let locationCount = 0;
     activeProgressLogs.forEach(l => {
        if (l.location && l.location.trim().length > 0) {
           const loc = l.location.trim();
           const m = activeMedia.find(media => media.id === l.mediaId);
           if (m) {
              const pages = calculateScaledDelta(l.delta || 0, m, settings);
              locations[loc] = (locations[loc] || 0) + pages;
              locationCount++;
           }
        }
     });

     if (locationCount === 0 || Object.keys(locations).length === 0) return null;

     const sorted = Object.entries(locations).sort((a,b) => b[1] - a[1]);

     return (
        <div className="bg-zinc-900/50 border border-white/5 p-6 rounded-3xl">
           <h3 className="text-lg font-black text-white mb-6 flex items-center gap-3">
             <MapIcon className="w-5 h-5 text-zinc-400" />
             Scouted Locations
           </h3>
           <div className="space-y-4">
              {sorted.map(([loc, pages], idx) => (
                 <div key={idx} className="flex justify-between items-center group">
                    <div className="flex items-center gap-3">
                       <div className="w-2 h-2 rounded-full bg-zinc-600 group-hover:bg-white transition-colors" />
                       <span className="text-sm font-bold text-zinc-300 truncate max-w-[150px]" title={loc}>{loc}</span>
                    </div>
                    <span className="text-zinc-500 font-black text-xs bg-white/5 px-2 py-1 rounded-lg border border-white/5">{Math.round(pages)} MP</span>
                 </div>
              ))}
           </div>
        </div>
     );
  };

  // The single highest-engagement media of the period (Spotify "top song" moment).
  const renderSpotlight = () => {
    const ranked = activeMedia.map(m => {
      const pages = activeProgressLogs.filter(l => l.mediaId === m.id).reduce((acc, l) => acc + calculateScaledDelta(l.delta, m, settings), 0);
      return { item: m, pages };
    }).filter(r => r.pages > 0).sort((a, b) => b.pages - a.pages);
    if (ranked.length === 0) return null;

    const top = ranked[0];
    const m = top.item;
    const share = totalMasterPages > 0 ? Math.round((top.pages / totalMasterPages) * 100) : 0;

    return (
      <Reveal className={`relative overflow-hidden rounded-[2.5rem] border ${theme.border} bg-black`}>
        {m.coverImageUrl && (
          <div className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-110" style={{ backgroundImage: `url(${m.coverImageUrl})` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/40" />
        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-8 p-8 md:p-12">
          <div className="w-40 h-56 md:w-48 md:h-72 rounded-2xl overflow-hidden border border-white/10 shadow-2xl shrink-0 bg-zinc-900">
            {m.coverImageUrl
              ? <img src={m.coverImageUrl} className="w-full h-full object-cover" alt={m.title} />
              : <div className="w-full h-full flex items-center justify-center text-zinc-700"><Library className="w-12 h-12" /></div>}
          </div>
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className={`text-[11px] font-black uppercase tracking-[0.3em] ${theme.text} mb-3`}>Your #1 this {timeframe}</div>
            <h3 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-[0.95] mb-4 break-words">{m.title}</h3>
            <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
              <span className={`text-[11px] font-black uppercase tracking-widest ${MEDIA_COLORS[m.mediaType]?.text || 'text-zinc-400'}`}>{m.mediaType}</span>
              <span className="text-zinc-700">•</span>
              <span className="text-white font-black"><CountUp value={Math.round(top.pages)} /> MP</span>
              <span className="text-zinc-700">•</span>
              <span className="text-zinc-400 font-bold text-sm">{share}% of your {timeframe}</span>
            </div>
          </div>
        </div>
      </Reveal>
    );
  };

  // "This {period}, you were {archetype}" identity banner + theme chip (Wrapped-style).
  const renderIdentity = () => {
    const archetypes = determineArchetypes({ timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings });
    const topArch = archetypes[0];
    const themeText = currentRecap?.data?.aiTheme;
    if (!topArch && !themeText) return null;
    return (
      <div className="mt-2 flex flex-col gap-4 relative z-10">
        {topArch && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black mb-1">This {timeframe}, you were</div>
            <div className={`text-3xl md:text-5xl font-black tracking-tighter ${theme.text}`}>{topArch.name}</div>
          </div>
        )}
        {themeText && (
          <div className="inline-flex items-center gap-2 w-fit px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur">
            <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-black">Theme</span>
            <span className="text-sm font-black text-white">"{themeText}"</span>
          </div>
        )}
      </div>
    );
  };

  const accentHex = timeframe === 'week' ? '#f97316' : timeframe === 'month' ? '#6366f1' : '#10b981';

  // GitHub-style activity heatmap for the period (consistency / time-capsule).
  const renderActivityCalendar = () => {
    const days = eachDayOfInterval({ start: currentInterval.start, end: currentInterval.end });
    if (days.length < 2) return null;

    const dayMap: Record<string, number> = {};
    activeProgressLogs.forEach(l => {
      const key = format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd');
      const m = activeMedia.find(x => x.id === l.mediaId);
      if (m) dayMap[key] = (dayMap[key] || 0) + calculateScaledDelta(l.delta, m, settings);
    });

    const max = Math.max(1, ...Object.values(dayMap));
    const activeDays = Object.values(dayMap).filter(v => v > 0).length;
    const lead = (getDay(days[0]) + 6) % 7; // Monday-first weekday offset
    const opacities = [0, 0.28, 0.5, 0.75, 1];
    const levelOf = (v: number) => (v <= 0 ? 0 : v < max * 0.25 ? 1 : v < max * 0.5 ? 2 : v < max * 0.75 ? 3 : 4);

    const streak = calculateLongestStreak({ timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings });
    let busiestKey = ''; let busiestVal = 0;
    Object.entries(dayMap).forEach(([k, v]) => { if (v > busiestVal) { busiestVal = v; busiestKey = k; } });
    const stats = [
      { label: 'Active days', value: `${activeDays}/${days.length}` },
      { label: 'Longest streak', value: `${streak}d` },
      { label: 'Busiest day', value: busiestKey ? format(parseISO(busiestKey), 'MMM d') : '—' },
      { label: 'Best haul', value: `${Math.round(busiestVal)} MP` },
    ];

    return (
      <Reveal className="bg-black/40 border border-white/5 p-6 md:p-8 rounded-[2rem]">
        <SectionHeader icon={<CalendarDays className={`w-6 h-6 ${theme.text}`} />} eyebrow="Consistency" title="Activity Map" accent={theme.border} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
          {stats.map(s => (
            <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-center">
              <div className="text-2xl font-black text-white leading-none">{s.value}</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500 font-black mt-1.5">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto no-scrollbar pb-1">
          <div className="grid grid-rows-7 grid-flow-col gap-1.5 w-fit mx-auto">
            {Array.from({ length: lead }).map((_, i) => <div key={`lead-${i}`} className="w-3.5 h-3.5" />)}
            {days.map((d) => {
              const v = dayMap[format(d, 'yyyy-MM-dd')] || 0;
              const lvl = levelOf(v);
              return (
                <div
                  key={format(d, 'yyyy-MM-dd')}
                  title={`${format(d, 'MMM d')} — ${Math.round(v)} MP`}
                  className="w-3.5 h-3.5 rounded-[3px] border border-white/5"
                  style={{ backgroundColor: lvl === 0 ? 'rgba(255,255,255,0.04)' : accentHex, opacity: lvl === 0 ? 1 : opacities[lvl] }}
                />
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-5">
          <span className="text-[9px] text-zinc-600 font-black uppercase tracking-widest mr-1">Less</span>
          {opacities.map((o, i) => (
            <div key={i} className="w-3 h-3 rounded-[3px] border border-white/5" style={{ backgroundColor: i === 0 ? 'rgba(255,255,255,0.04)' : accentHex, opacity: i === 0 ? 1 : o }} />
          ))}
          <span className="text-[9px] text-zinc-600 font-black uppercase tracking-widest ml-1">More</span>
        </div>
      </Reveal>
    );
  };

  // Master pages by weekday — finds the "power day".
  const renderWeekdayBars = () => {
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const totals = [0, 0, 0, 0, 0, 0, 0];
    activeProgressLogs.forEach(l => {
      const m = activeMedia.find(x => x.id === l.mediaId);
      if (!m) return;
      const idx = (getDay(subHours(parseISO(l.timestamp), 5)) + 6) % 7; // Mon = 0
      totals[idx] += calculateScaledDelta(l.delta, m, settings);
    });
    if (totals.every(v => v === 0)) return null;
    const data = names.map((n, i) => ({ name: n, value: Math.round(totals[i]) }));
    const peakIdx = totals.indexOf(Math.max(...totals));
    return (
      <Reveal className="bg-black/40 border border-white/5 p-6 md:p-8 rounded-[2rem] lg:col-span-3">
        <SectionHeader icon={<CalendarDays className={`w-6 h-6 ${theme.text}`} />} eyebrow="Rhythm" title="By Weekday" accent={theme.border} />
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10, fontWeight: 900 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ backgroundColor: '#09090b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }} formatter={(v: any) => [`${v} MP`, 'Master Pages']} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.map((_, i) => <Cell key={i} fill={accentHex} opacity={i === peakIdx ? 1 : 0.4} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-zinc-500 font-bold mt-4">Your power day is <span className="text-white font-black">{names[peakIdx]}</span>.</p>
      </Reveal>
    );
  };

  // Distribution of your own ratings across engaged media.
  const renderRatingSpread = () => {
    const buckets = [0, 0, 0, 0, 0];
    let rated = 0; let sum = 0;
    activeMedia.forEach(m => {
      if (m.userRating && m.userRating > 0) {
        const star = Math.min(5, Math.max(1, Math.round(m.userRating)));
        buckets[star - 1]++; rated++; sum += m.userRating;
      }
    });
    if (rated === 0) return null;
    const data = buckets.map((c, i) => ({ name: `${i + 1}★`, value: c }));
    const avg = sum / rated;
    return (
      <Reveal className="bg-black/40 border border-white/5 p-6 md:p-8 rounded-[2rem] lg:col-span-2">
        <SectionHeader icon={<Star className={`w-6 h-6 ${theme.text}`} />} eyebrow="Taste" title="How You Rate" accent={theme.border} />
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10, fontWeight: 900 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ backgroundColor: '#09090b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }} formatter={(v: any) => [`${v} titles`, 'Count']} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#fbbf24" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-zinc-500 font-bold mt-4">Average score: <span className="text-amber-400 font-black">{avg.toFixed(1)}★</span> across {rated} rated {rated === 1 ? 'title' : 'titles'}.</p>
      </Reveal>
    );
  };

  // Fresh starts vs. titles carried over from before this period.
  const renderNewVsReturning = () => {
    let fresh = 0; let returning = 0;
    activeMedia.forEach(m => {
      const firstEver = validLogs
        .filter(l => l.mediaId === m.id && l.metricType !== 'statusChange')
        .sort((a, b) => +parseISO(a.timestamp) - +parseISO(b.timestamp))[0];
      if (!firstEver) return;
      if (isWithinInterval(subHours(parseISO(firstEver.timestamp), 5), currentInterval)) fresh++;
      else returning++;
    });
    if (fresh + returning === 0) return null;
    const data = [
      { name: 'New starts', value: fresh, color: accentHex },
      { name: 'Carried over', value: returning, color: '#3f3f46' },
    ].filter(d => d.value > 0);
    return (
      <Reveal className="bg-black/40 border border-white/5 p-6 md:p-8 rounded-[2rem] lg:col-span-2">
        <SectionHeader icon={<Library className={`w-6 h-6 ${theme.text}`} />} eyebrow="Renewal" title="New vs Carried Over" accent={theme.border} />
        <div className="flex items-center gap-6">
          <div className="w-[120px] h-[120px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie data={data} innerRadius="62%" outerRadius="95%" paddingAngle={4} dataKey="value" startAngle={90} endAngle={-270} stroke="none">
                  {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-4">
            {data.map(d => (
              <div key={d.name} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-2xl font-black text-white leading-none">{d.value}</span>
                <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    );
  };

  // First and last thing you touched this period (bookends).
  const renderBookends = () => {
    const prog = [...activeProgressLogs].sort((a, b) => +parseISO(a.timestamp) - +parseISO(b.timestamp));
    if (prog.length < 2) return null;
    const first = prog[0]; const last = prog[prog.length - 1];
    const fm = activeMedia.find(m => m.id === first.mediaId);
    const lm = activeMedia.find(m => m.id === last.mediaId);
    const row = (label: string, m: any, ts: string) => (
      <div className="flex items-center gap-4 bg-black/30 border border-white/5 rounded-2xl p-4">
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-black w-16 shrink-0">{label}</span>
        {m?.coverImageUrl && <img src={m.coverImageUrl} alt="" referrerPolicy="no-referrer" className="w-9 h-12 object-cover rounded-md shrink-0 border border-white/10" />}
        <span className="text-white font-bold truncate flex-1">{m?.title || 'Unknown'}</span>
        <span className="text-zinc-500 text-xs font-bold shrink-0">{format(parseISO(ts), 'MMM d')}</span>
      </div>
    );
    return (
      <Reveal className="bg-black/40 border border-white/5 p-6 md:p-8 rounded-[2rem] lg:col-span-2">
        <SectionHeader icon={<History className={`w-6 h-6 ${theme.text}`} />} eyebrow="Bookends" title="How It Played Out" accent={theme.border} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {row('Opened', fm, first.timestamp)}
          {row('Closed', lm, last.timestamp)}
        </div>
      </Reveal>
    );
  };

  // Master-pages momentum across the last few comparable intervals (sparkline).
  const renderTrend = () => {
    const count = timeframe === 'week' ? 8 : timeframe === 'month' ? 6 : 5;
    const points: { label: string; value: number }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const target = timeframe === 'week' ? subWeeks(currentInterval.start, i)
        : timeframe === 'month' ? subMonths(currentInterval.start, i)
        : subYears(currentInterval.start, i);
      const intv = timeframe === 'week' ? { start: startOfWeek(target, { weekStartsOn: 1 }), end: endOfWeek(target, { weekStartsOn: 1 }) }
        : timeframe === 'month' ? { start: startOfMonth(target), end: endOfMonth(target) }
        : { start: startOfYear(target), end: endOfYear(target) };
      const label = timeframe === 'week' ? format(intv.start, 'MMM d') : timeframe === 'month' ? format(intv.start, 'MMM') : format(intv.start, 'yyyy');
      const pages = validLogs
        .filter(l => l.metricType !== 'statusChange' && isWithinInterval(subHours(parseISO(l.timestamp), 5), intv))
        .reduce((acc, l) => { const m = media.find(x => x.id === l.mediaId); return m ? acc + calculateScaledDelta(l.delta, m, settings) : acc; }, 0);
      points.push({ label, value: Math.round(pages) });
    }
    if (points.filter(p => p.value > 0).length < 2) return null;

    const peak = Math.max(...points.map(p => p.value));
    const peakLabel = points.find(p => p.value === peak)?.label;

    return (
      <Reveal className="bg-black/40 border border-white/5 p-6 md:p-8 rounded-[2rem] lg:col-span-3">
        <SectionHeader icon={<Activity className={`w-6 h-6 ${theme.text}`} />} eyebrow={timeframe === 'year' ? 'Year over year' : timeframe === 'month' ? 'Month over month' : 'Week over week'} title="Momentum" accent={theme.border} />
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentHex} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={accentHex} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10, fontWeight: 900 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={{ backgroundColor: '#09090b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }} itemStyle={{ color: accentHex }} labelStyle={{ color: '#fff' }} formatter={(v: any) => [`${v} MP`, 'Master Pages']} />
              <Area type="monotone" dataKey="value" stroke={accentHex} strokeWidth={3} fill="url(#trendFill)" dot={{ r: 3, fill: accentHex }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {peakLabel && <p className="text-xs text-zinc-500 font-bold mt-4">Peak output in <span className="text-white font-black">{peakLabel}</span> with {peak.toLocaleString()} Master Pages.</p>}
      </Reveal>
    );
  };

  // Stacked media-type composition across sub-intervals ("your year in formats").
  const renderTypeStack = () => {
    const buckets = timeframe === 'year' ? eachMonthOfInterval(currentInterval)
      : timeframe === 'month' ? eachWeekOfInterval(currentInterval, { weekStartsOn: 1 })
      : eachDayOfInterval(currentInterval);
    if (buckets.length < 2) return null;
    const fmt = timeframe === 'year' ? 'MMM' : timeframe === 'month' ? "'W'w" : 'EEE';

    const bucketData: Record<string, any> = {};
    buckets.forEach(b => { bucketData[format(b, fmt)] = { label: format(b, fmt) }; });
    const typesUsed = new Set<string>();
    activeProgressLogs.forEach(l => {
      const m = activeMedia.find(x => x.id === l.mediaId);
      if (!m) return;
      const k = format(subHours(parseISO(l.timestamp), 5), fmt);
      if (!bucketData[k]) bucketData[k] = { label: k };
      bucketData[k][m.mediaType] = (bucketData[k][m.mediaType] || 0) + calculateScaledDelta(l.delta, m, settings);
      typesUsed.add(m.mediaType);
    });
    const data = buckets.map(b => bucketData[format(b, fmt)]);
    const types = Array.from(typesUsed);
    if (types.length === 0) return null;

    return (
      <Reveal className="bg-black/40 border border-white/5 p-6 md:p-8 rounded-[2rem]">
        <SectionHeader icon={<BarChart3 className={`w-6 h-6 ${theme.text}`} />} eyebrow="Composition" title={timeframe === 'year' ? 'Your Year in Formats' : timeframe === 'month' ? 'Your Month in Formats' : 'Your Week in Formats'} accent={theme.border} />
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10, fontWeight: 900 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ backgroundColor: '#09090b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }} />
              <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
              {types.map((t, i) => (
                <Bar key={t} dataKey={t} stackId="a" fill={typeHex(t)} radius={i === types.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Reveal>
    );
  };

  // A memorable journal note as a pull-quote (the human voice of the capsule).
  const renderJournalQuote = () => {
    const journals = extractJournals({ timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings });
    if (journals.length === 0) return null;
    const j = journals[0];
    return (
      <Reveal className={`relative overflow-hidden rounded-[2rem] border ${theme.border} ${theme.bg} p-8 md:p-12`}>
        <div className={`absolute -top-16 -left-4 text-[14rem] leading-none font-black ${theme.text} opacity-10 select-none pointer-events-none`}>“</div>
        <div className="relative z-10">
          <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black mb-4">From your journal</div>
          <p className="text-2xl md:text-3xl font-light text-white leading-snug italic max-w-3xl">{j.note}</p>
          <div className="mt-6 flex items-center gap-3 text-sm flex-wrap">
            <span className={`font-black ${MEDIA_COLORS[j.media.mediaType]?.text || 'text-zinc-300'}`}>{j.media.title}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-500 font-bold">{format(parseISO(j.date), 'MMM d, yyyy')}</span>
          </div>
        </div>
      </Reveal>
    );
  };

  // Deep Cuts: a signature hero number (with delta vs the previous equivalent interval)
  // plus a superlatives grid — the period's bests at a glance.
  const renderDeepCuts = () => {
    const prevTarget = timeframe === 'week' ? subWeeks(currentInterval.start, 1)
      : timeframe === 'month' ? subMonths(currentInterval.start, 1)
      : subYears(currentInterval.start, 1);
    const prevInterval = timeframe === 'week' ? { start: startOfWeek(prevTarget, { weekStartsOn: 1 }), end: endOfWeek(prevTarget, { weekStartsOn: 1 }) }
      : timeframe === 'month' ? { start: startOfMonth(prevTarget), end: endOfMonth(prevTarget) }
      : { start: startOfYear(prevTarget), end: endOfYear(prevTarget) };
    const prevLogs = validLogs.filter(l => l.metricType !== 'statusChange' && isWithinInterval(subHours(parseISO(l.timestamp), 5), prevInterval));
    const prevPages = prevLogs.reduce((acc, l) => { const m = media.find(x => x.id === l.mediaId); return m ? acc + calculateScaledDelta(l.delta, m, settings) : acc; }, 0);
    const deltaPct = prevPages > 0 ? Math.round(((totalMasterPages - prevPages) / prevPages) * 100) : null;

    const ranked = activeMedia.map(m => ({ item: m, pages: activeProgressLogs.filter(l => l.mediaId === m.id).reduce((a, l) => a + calculateScaledDelta(l.delta, m, settings), 0) })).filter(r => r.pages > 0).sort((a, b) => b.pages - a.pages);
    const mostPlayed = ranked[0];

    const topRated = completedMedia.filter(m => (m.userRating || 0) > 0).sort((a, b) => (b.userRating || 0) - (a.userRating || 0))[0];

    const sessions = groupLogsIntoSessions(activeProgressLogs);
    let longest = { pages: 0, title: '' };
    sessions.forEach(s => {
      const p = s.logs.reduce((a, l) => { const m = media.find(x => x.id === l.mediaId); return m ? a + calculateScaledDelta(l.delta, m, settings) : a; }, 0);
      if (p > longest.pages) { const m = media.find(x => x.id === s.mediaId); longest = { pages: p, title: m?.title || '' }; }
    });

    const placeCounts: Record<string, number> = {};
    activeProgressLogs.forEach(l => { if (l.location && l.location.trim()) placeCounts[l.location.trim()] = (placeCounts[l.location.trim()] || 0) + 1; });
    const topPlace = Object.entries(placeCounts).sort((a, b) => b[1] - a[1])[0];

    const topBoss = (worldBosses || []).filter(b => b.status === 'Defeated' && b.updatedAt && isWithinInterval(subHours(parseISO(b.updatedAt), 5), currentInterval)).sort((a, b) => b.level - a.level)[0];

    let comeback: { title: string; gap: number } | null = null;
    activeMedia.forEach(m => {
      const inPeriod = activeProgressLogs.filter(l => l.mediaId === m.id).sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
      if (!inPeriod.length) return;
      const firstIn = +new Date(inPeriod[0].timestamp);
      const priors = validLogs.filter(l => l.mediaId === m.id && +new Date(l.timestamp) < firstIn);
      if (!priors.length) return;
      const gap = (firstIn - Math.max(...priors.map(l => +new Date(l.timestamp)))) / 86400000;
      if (gap > 30 && (!comeback || gap > comeback.gap)) comeback = { title: m.title, gap: Math.round(gap) };
    });

    if (!mostPlayed && totalMasterPages === 0) return null;

    const cells: any[] = [
      mostPlayed && { icon: <Flame className="w-4 h-4" />, label: 'Most played', value: mostPlayed.item.title, sub: `${Math.round(mostPlayed.pages).toLocaleString()} pages` },
      topRated && { icon: <Star className="w-4 h-4" />, label: 'Highest rated', value: topRated.title, sub: `${topRated.userRating}★` },
      longest.pages > 0 && { icon: <Zap className="w-4 h-4" />, label: 'Longest session', value: longest.title, sub: `${Math.round(longest.pages).toLocaleString()} pages` },
      topPlace && { icon: <MapIcon className="w-4 h-4" />, label: 'Most-logged place', value: topPlace[0], sub: `${topPlace[1]} logs` },
      topBoss && { icon: <Skull className="w-4 h-4" />, label: 'Biggest foe felled', value: topBoss.name, sub: `Level ${topBoss.level}` },
      comeback && { icon: <History className="w-4 h-4" />, label: 'Comeback', value: (comeback as { title: string; gap: number }).title, sub: `after ${(comeback as { title: string; gap: number }).gap}d away` },
    ].filter(Boolean);

    return (
      <Reveal className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-b from-zinc-950 to-black p-8 md:p-12">
        <div className={`absolute top-0 right-0 w-72 h-72 ${theme.glow} blur-[120px] rounded-full -mr-24 -mt-24 pointer-events-none`} />
        <div className="relative z-10">
          <div className={`text-[10px] uppercase tracking-[0.4em] ${theme.text} font-black mb-6`}>Deep Cuts</div>

          {/* Signature number */}
          <div className="mb-10">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="text-6xl md:text-7xl font-black text-white tracking-tighter tabular-nums">{Math.round(totalMasterPages).toLocaleString()}</div>
              <div className="pb-2">
                <div className="text-sm font-black uppercase tracking-widest text-zinc-500">Master Pages</div>
                {deltaPct !== null && (
                  <div className={`text-sm font-bold ${deltaPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}% vs last {timeframe}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Superlatives grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cells.map((c, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
                <div className={`flex items-center gap-2 ${theme.text} mb-2`}>
                  {c.icon}
                  <span className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-500">{c.label}</span>
                </div>
                <div className="text-base font-black text-white truncate" title={c.value}>{c.value}</div>
                <div className="text-xs text-zinc-500 font-bold mt-0.5">{c.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    );
  };

  // Closing "sealed capsule" summary — the period at a glance, dated now.
  const renderTimeCapsule = () => {
    const cfg = { timeScale: timeframe, logs: activeProgressLogs, media: activeMedia, allMedia: media, settings };
    const archetypes = determineArchetypes(cfg);
    const streak = calculateLongestStreak(cfg);
    const ranked = activeMedia.map(m => {
      const pages = activeProgressLogs.filter(l => l.mediaId === m.id).reduce((acc, l) => acc + calculateScaledDelta(l.delta, m, settings), 0);
      return { item: m, pages };
    }).filter(r => r.pages > 0).sort((a, b) => b.pages - a.pages);
    const top = ranked[0]?.item;

    const rows = [
      { label: 'Top media', value: top ? top.title : '—' },
      { label: 'You were', value: archetypes[0]?.name || '—' },
      { label: 'Theme', value: currentRecap?.data?.aiTheme || '—' },
      { label: 'Longest streak', value: `${streak} ${streak === 1 ? 'day' : 'days'}` },
      { label: 'Master Pages', value: Math.round(totalMasterPages).toLocaleString() },
      { label: 'Conquered', value: `${completedMedia.length}` },
    ];

    return (
      <Reveal className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-b from-zinc-950 to-black p-8 md:p-12">
        <div className={`absolute top-0 right-0 w-72 h-72 ${theme.glow} blur-[120px] rounded-full -mr-24 -mt-24 pointer-events-none`} />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3 mb-8 pb-8 border-b border-white/10">
          <div>
            <div className={`text-[10px] uppercase tracking-[0.4em] ${theme.text} font-black mb-2`}>Time Capsule</div>
            <h3 className="text-3xl md:text-4xl font-black text-white tracking-tighter">{formatIntervalLabel()}</h3>
          </div>
          <div className="md:text-right">
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-black">Sealed</div>
            <div className="text-sm font-bold text-zinc-400">{format(new Date(), 'MMM d, yyyy')}</div>
          </div>
        </div>
        <div className="relative z-10 grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-6">
          {rows.map(r => (
            <div key={r.label}>
              <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-black mb-1">{r.label}</div>
              <div className="text-lg font-black text-white truncate">{r.value}</div>
            </div>
          ))}
        </div>
      </Reveal>
    );
  };

  return (
    <div className="flex flex-col h-full max-h-full overflow-hidden w-full bg-[#080809]">
      <div className="flex-shrink-0 p-4 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 bg-zinc-950/80 sticky top-0 z-10 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className={`p-2.5 rounded-xl ${theme.bg} border ${theme.border}`}>
            {theme.icon}
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">{theme.label}</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none mt-1">Archive of the {timeframe}</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 items-center">
           <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
              {(['week', 'month', 'year'] as Timeframe[]).map(t => (
                 <button
                   key={t}
                   onClick={() => { setTimeframe(t); setOffsetOffset(1); }}
                   className={`px-5 py-1.5 rounded-lg text-sm font-black capitalize transition-all ${timeframe === t ? `bg-white/10 text-white shadow-xl` : 'text-zinc-500 hover:text-zinc-300'}`}
                 >
                   {t}
                 </button>
              ))}
           </div>
           
           <div className="flex items-center gap-3 bg-white/5 px-2 py-1 rounded-xl border border-white/10 md:mr-4">
              <button onClick={handlePrevious} className="p-2 text-zinc-400 hover:text-white transition-colors"><ChevronLeft className="w-5 h-5"/></button>
              <span className="text-xs font-black text-white min-w-[140px] text-center tracking-tighter">{formatIntervalLabel()}</span>
              <button 
                onClick={handleNext} 
                disabled={offsetOffset === 1} 
                className={`p-2 transition-colors ${offsetOffset === 1 ? 'text-zinc-800 cursor-not-allowed' : 'text-zinc-400 hover:text-white'}`}
              >
                <ChevronRight className="w-5 h-5"/>
              </button>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar relative p-4 md:p-8">
         <AnimatePresence mode="wait">
            <motion.div
               key={`${timeframe}-${offsetOffset}`}
               initial={{ opacity: 0, y: 30 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -30 }}
               className="max-w-7xl mx-auto space-y-6 pb-20"
            >
               {activeLogs.length > 0 ? (
                 <>
                   {/* Main Header / AI Section */}
                   <div className={`bg-gradient-to-br from-black via-black to-zinc-950 border ${theme.border} rounded-[2rem] p-6 md:p-10 relative overflow-hidden shadow-2xl`}>
                      <div className={`absolute top-0 right-0 w-[500px] h-[500px] ${theme.glow} blur-[120px] rounded-full pointer-events-none opacity-40`} />
                      
                      <div className="flex flex-col lg:flex-row lg:items-end justify-between relative z-10 gap-8 mb-8 border-b border-white/10 pb-8">
                         <div className="flex-1 space-y-4">
                           <span className={`${theme.text} font-black tracking-[0.3em] uppercase text-[10px] flex items-center gap-2 px-4 py-1.5 rounded-full border ${theme.border} bg-black/50 w-fit backdrop-blur-md`}>
                             <Sparkles className="w-4 h-4" /> {timeframe}ly narrative
                           </span>
                           <h2 className="text-5xl md:text-8xl font-black text-white tracking-tighter leading-[0.9] relative">
                             {currentRecap ? currentRecap.title : "Unwritten History"}
                             {renderPRBadge()}
                           </h2>
                         </div>
                         <button 
                           onClick={handleGenerateAI}
                           disabled={isGenerating}
                           className="bg-white text-black hover:bg-zinc-200 px-8 py-4 rounded-2xl text-sm font-black transition-all flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95 shadow-2xl shadow-white/5 whitespace-nowrap"
                         >
                           <RefreshCw className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`} /> 
                           {currentRecap ? 'Forging New Tale' : 'Extract Memories'}
                         </button>
                      </div>

                      {story?.dek && (
                        <div className="relative z-10 mb-8">
                          <RecapDek dek={story.dek} mood={story.mood} />
                        </div>
                      )}

                      {renderIdentity()}

                      <div className="text-xl md:text-2xl text-zinc-400 relative z-10 leading-relaxed font-light mt-8">
                         {currentRecap ? (
                             <>
                             {story && <RecapNarrative recap={story} accentText={theme.text} />}
                            {renderAIRoast()}
                            {renderMonthlyStats()}
                            {renderBossTrophyRoom()}
                            {renderFailedBosses()}
                             </>
                         ) : (
                            <div className="flex flex-col items-center justify-center text-center py-20 border-2 border-dashed border-white/5 rounded-[2rem] bg-white/[0.02]">
                               <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>
                                  <RefreshCw className={`w-16 h-16 mb-6 ${isGenerating ? theme.text : 'text-zinc-800'}`} />
                               </motion.div>
                               <h3 className="text-2xl font-black text-white mb-2">{isGenerating ? "Consulting the Archives..." : "Ready for Chronicle"}</h3>
                               <p className="text-zinc-500 max-w-md">Your {timeframe}ly journey awaits processing. Forge the legend to see your story unfold.</p>
                            </div>
                         )}
                      </div>
                   </div>

                   {/* Hero Numbers */}
                   <Reveal className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <HeroStat label="Master Pages" delta={comparison.masterPages} accentClass={theme.text} />
                      <HeroStat label="Media Conquered" delta={comparison.completed} />
                      <HeroStat label="Logged Actions" delta={comparison.logCount} />
                      <HeroStat label="Active Journeys" delta={comparison.titles} />
                   </Reveal>

                   {/* The measured story: pace, consistency, rhythm, outcomes,
                       the race for first place, taste and the record books.
                       Each card carries the AI's one-line reading of it. */}
                   {renderThemeBanner()}

                   <div className="grid grid-cols-1 lg:grid-cols-6 gap-6 grid-flow-dense">
                      <MomentumChart
                        className="lg:col-span-4"
                        points={momentumSeries}
                        accent={accentHex}
                        timeframe={timeframe}
                        caption={captions.momentum}
                      />
                      <ConsistencyRing className="lg:col-span-2" metrics={currentMetrics} accent={accentHex} />
                      {clock && <ActivityClock className="lg:col-span-2" clock={clock} accent={accentHex} caption={captions.rhythm} />}
                      <PipelineFunnel className="lg:col-span-2" pipeline={pipeline} accent={accentHex} caption={captions.pipeline} />
                      <RecordsBoard className="lg:col-span-2" records={records} caption={captions.records} />
                      {rankRace && <RankRace className="lg:col-span-3" race={rankRace} />}
                      {taste && <TasteScatter className="lg:col-span-3" taste={taste} accent={accentHex} caption={captions.taste} />}
                   </div>

                   {/* #1 Spotlight (Last.fm / Wrapped-style top media moment) */}
                   {renderSpotlight()}

                   {/* A line from your journal */}
                   {renderJournalQuote()}

                   {/* Primary Grid Layout */}
                   <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Left Side: Rankings & Large Visuals */}
                      <div className="lg:col-span-8 space-y-6">
                         <div className="bg-black/40 border border-white/5 p-6 md:p-8 rounded-[2rem] relative overflow-hidden">
                            <div className="flex items-center justify-between mb-8">
                               <h3 className="text-2xl font-black text-white flex items-center gap-4">
                                 <Trophy className={`w-8 h-8 ${theme.text}`} />
                                 {timeframe === 'week' ? "Weekly Standings" : timeframe === 'month' ? "Monthly Vanguard" : "The Yearly Pantheon"}
                               </h3>
                            </div>
                            {renderRanking()}
                         </div>

                          {timeframe !== 'week' && renderArchetypesSection()}
                         
                         {renderLorekeeper()}
                         
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderHabitsHeatmap()}
                             {renderGenreRadar()}
                            <div className="space-y-6">
                               {renderTopCreator()}
                               {renderBingeSpotlight()}
                            </div>
                         </div>
                      </div>
 
                      {/* Right Side: Micro stats & Deep Dives */}
                      <div className="lg:col-span-4 space-y-6">
                         {renderFocusShift()}
                          {renderActiveTime()}
                         {renderVelocity()}
                         {renderDNADeepDive()}
                         {renderBacklogHealth()}
                         <div className="grid grid-cols-2 gap-4">
                            {renderTimeTraveler()}
                            <div className="bg-black/40 border border-white/5 p-4 rounded-3xl flex flex-col items-center justify-center text-center">
                               <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-3">
                                  <Hash className="w-5 h-5 text-zinc-500" />
                               </div>
                               <div className="text-xl font-black text-white">{Math.round(totalMasterPages / (activeLogs.length || 1))}</div>
                               <div className="text-[8px] text-zinc-500 uppercase tracking-widest font-black">Avg Session</div>
                            </div>
                         </div>
                         {renderLocationBreakdown()}
                         {renderCriticDisparity()}
                         {renderGatheredLoot()}
                         {renderLootDistribution()}
                         {renderSunkCost()}
                      </div>
                   </div>
                   {/* Themed Breakdown / Distribution */}
                   <div className="bg-zinc-950/40 border border-white/5 p-8 rounded-[2.5rem]">
                      <h3 className="text-xl font-black text-white mb-8 flex items-center gap-4">
                        <BarChart3 className={`w-8 h-8 ${theme.text}`} />
                        Format Allocation
                      </h3>
                      {renderTypeBreakdown()}
                      {captions.formats && (
                        <div className="mt-6 pt-4 border-t border-white/5 flex gap-2.5 items-start">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500/70 shrink-0 mt-0.5" />
                          <p className="text-sm text-zinc-400 italic leading-snug">{captions.formats}</p>
                        </div>
                      )}
                   </div>

                   {/* Insights — full-width activity map, then a gap-free spanned grid */}
                   {renderActivityCalendar()}
                   <div className="grid grid-cols-1 lg:grid-cols-6 gap-6 grid-flow-dense">
                      {renderTrend()}
                      {renderWeekdayBars()}
                      {renderRatingSpread()}
                      {renderNewVsReturning()}
                      {renderBookends()}
                   </div>
                   {renderTypeStack()}

                   {/* Conquered Gallery */}
                   {completedMedia.length > 0 && (
                      <div className={`${theme.bg} ${theme.border} rounded-[3rem] p-10 md:p-16 relative overflow-hidden`}>
                         <div className={`absolute top-0 right-0 w-96 h-96 ${theme.glow} blur-[120px] -mr-32 -mt-32 rounded-full pointer-events-none`} />
                         <h3 className="text-3xl font-black text-white mb-12 flex items-center gap-5">
                           <Medal className={`w-10 h-10 ${theme.text}`} />
                           Artifacts Conquered
                         </h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                           {completedMedia.map(m => (
                             <div key={m.id} className="bg-black border border-white/10 p-6 rounded-[2rem] flex gap-6 items-center relative overflow-hidden group/card hover:border-white/30 transition-all shadow-2xl">
                                {m.coverImageUrl && (
                                  <div className="absolute inset-0 opacity-20 bg-cover bg-center grayscale group-hover/card:grayscale-0 group-hover:scale-110 transition-all duration-700" style={{ backgroundImage: `url(${m.coverImageUrl})` }} />
                                )}
                                <div className="w-20 h-28 bg-zinc-800 rounded-2xl shrink-0 border border-white/10 overflow-hidden relative z-10 shadow-2xl">
                                   {m.coverImageUrl ? (
                                     <img src={m.coverImageUrl} className="w-full h-full object-cover" alt="" />
                                   ) : (
                                     <div className="w-full h-full flex items-center justify-center text-zinc-600"><Library /></div>
                                   )}
                                </div>
                                <div className="flex-1 min-w-0 relative z-10">
                                  <div className="font-black text-white text-xl truncate leading-tight mb-2">{m.title}</div>
                                  <div className={`text-[10px] font-black tracking-[0.2em] uppercase ${MEDIA_COLORS[m.mediaType]?.text || 'text-zinc-500'}`}>{m.mediaType}</div>
                                  <div className="flex flex-wrap gap-1.5 mt-3">
                                     {(m.tags || []).slice(0, 2).map(t => (
                                        <span key={t} className="text-[9px] px-2.5 py-1 bg-white/10 rounded-full text-zinc-400 border border-white/5 font-bold">{t}</span>
                                     ))}
                                     {m.reviewScore && <span className="text-[9px] px-2.5 py-1 bg-blue-500/20 rounded-full text-blue-400 border border-blue-500/20 font-bold">Critic: {m.reviewScore}/5</span>}
                                     {m.userRating && <span className="text-[9px] px-2.5 py-1 bg-amber-500/20 rounded-full text-amber-500 border border-amber-500/20 font-bold">★ {m.userRating}/5</span>}
                                  </div>
                                </div>
                             </div>
                           ))}
                         </div>
                      </div>
                   )}

                   {/* Ongoing / Active Media */}
                   {timeframe !== 'week' && (
                      <div className="bg-black border border-white/5 p-10 md:p-14 rounded-[3rem]">
                          <h3 className="text-xl font-black text-white mb-8 flex items-center gap-4">
                            <Library className="w-8 h-8 text-zinc-500" />
                            Ongoing Chronicles
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                             {activeMedia.filter(m => m.status !== 'Completed' && m.status !== 'Extras').map(m => (
                                <div key={m.id} className="group relative aspect-[3/4.5] rounded-2xl overflow-hidden border border-white/5 hover:border-white/20 transition-all shadow-xl">
                                   {m.coverImageUrl ? (
                                     <img src={m.coverImageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={m.title} />
                                   ) : (
                                     <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-700"><Library /></div>
                                   )}
                                   <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent opacity-80" />
                                   <div className="absolute bottom-0 left-0 right-0 p-4">
                                      <div className="flex items-center gap-1.5 mb-1.5 overflow-hidden">
                                        {m.reviewScore && <span className="shrink-0 text-[7px] px-1.5 py-0.5 bg-blue-500/30 rounded-sm text-blue-300 font-bold">C:{m.reviewScore}</span>}
                                        {m.userRating && <span className="shrink-0 text-[7px] px-1.5 py-0.5 bg-amber-500/30 rounded-sm text-amber-500 font-bold">★{m.userRating}</span>}
                                      </div>
                                      <div className="text-[10px] font-black text-white truncate leading-none mb-1">{m.title}</div>
                                      <div className={`text-[8px] font-black uppercase tracking-widest ${MEDIA_COLORS[m.mediaType]?.text || 'text-white'} opacity-70`}>{m.mediaType}</div>
                                   </div>
                                </div>
                             ))}
                          </div>
                      </div>
                   )}

                   {/* Dropped Media */}
                   {droppedMedia.length > 0 && (
                      <div className="bg-black/80 border border-rose-900/40 p-10 md:p-14 rounded-[3rem] relative overflow-hidden mt-8">
                          <div className="absolute top-0 right-0 w-96 h-96 bg-rose-900/20 blur-[120px] -mr-32 -mt-32 rounded-full pointer-events-none" />
                          <h3 className="text-xl font-black text-rose-500 mb-8 flex items-center gap-4">
                            <Skull className="w-8 h-8 text-rose-500/80" />
                            The Graveyard (Dropped)
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                             {droppedMedia.map(m => (
                                <div key={m.id} className="group relative aspect-[3/4.5] rounded-2xl overflow-hidden border border-rose-900/30 hover:border-rose-500/50 transition-all shadow-xl">
                                   {m.coverImageUrl ? (
                                     <img src={m.coverImageUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-700" alt={m.title} />
                                   ) : (
                                     <div className="w-full h-full bg-zinc-950 flex items-center justify-center text-zinc-800"><Skull /></div>
                                   )}
                                   <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                                   <div className="absolute bottom-0 left-0 right-0 p-4">
                                      <div className="text-[10px] font-black text-rose-200 truncate leading-none mb-1">{m.title}</div>
                                      <div className="text-[8px] font-black uppercase tracking-widest text-rose-500/80">{m.mediaType}</div>
                                      {m.dropReason && (
                                        <div className="mt-2 text-[8px] text-zinc-400 italic line-clamp-2 leading-tight border-t border-rose-900/30 pt-1">
                                          "{m.dropReason}"
                                        </div>
                                      )}
                                   </div>
                                </div>
                             ))}
                          </div>
                      </div>
                   )}

                   {/* The AI's awards, handed to specific titles */}
                   {story?.awards?.length ? <AwardsShelf awards={story.awards} media={media} /> : null}

                   {/* Deep cuts: signature number + superlatives */}
                   {renderDeepCuts()}

                   {/* Where this leaves them, and what to do about it */}
                   {story?.lookAhead && <LookAhead lookAhead={story.lookAhead} timeframe={timeframe} />}

                   {/* Sealed time capsule (closing) */}
                   {renderTimeCapsule()}
                 </>
               ) : (
                  <div className="flex flex-col items-center justify-center text-center py-40 px-4">
                     <div className="w-32 h-32 rounded-[2.5rem] bg-white/5 border border-white/10 flex items-center justify-center mb-8 rotate-12">
                        <Sparkles className="w-12 h-12 text-zinc-700" />
                     </div>
                     <h2 className="text-3xl font-black text-white mb-4">The Chronicles are Empty</h2>
                     <p className="text-zinc-500 max-w-sm mx-auto text-lg leading-relaxed">No echoes of your journeys were heard during this interval. Log your actions to fill these pages.</p>
                  </div>
               )}

            </motion.div>
         </AnimatePresence>
      </div>
    </div>
  );
}
