import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  startOfWeek, endOfWeek, subWeeks, 
  startOfMonth, endOfMonth, subMonths, 
  startOfYear, endOfYear, subYears, 
  format, isWithinInterval, parseISO
} from 'date-fns';
import { calculateScaledDelta } from '../lib/scaling';
import { calculateRPGState } from '../lib/rpgSystem';
import { MediaItem, MEDIA_COLORS, ProgressLog, RARITY_COLORS } from '../types/schema';
import { cn } from '../lib/utils';
import { generateAiRecapText, generateText } from '../services/nanoGptService';
import { ChevronLeft, ChevronRight, Trophy, Sparkles, RefreshCw, Presentation, Clock, CalendarDays, Target, Star, BrainCircuit, BarChart3, Medal, Library, Flame, Zap, Compass, Info, Map, LayoutGrid, Calendar, Activity, ZapOff, Hash, Ghost, History, Moon } from 'lucide-react';
import { analyzeHabits, analyzeMediaDNA, analyzeSessionVelocity, determineArchetypes, analyzeBingeFactor, analyzeSunkCost, analyzeTimeTraveler, analyzeBacklog, analyzeContrarian } from '../lib/recapAnalytics';
import Markdown from 'react-markdown';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

type Timeframe = 'week' | 'month' | 'year';

export function Recaps() {
  const { media, logs, settings, aiRecaps, saveAiRecap, artifacts, worldBosses } = useMediaContext();
  const [timeframe, setTimeframe] = useState<Timeframe>('week');
  const [offsetOffset, setOffsetOffset] = useState(1); 
  const [isGenerating, setIsGenerating] = useState(false);
  const attemptedGenRef = useRef<Set<string>>(new Set());

  const validLogs = useMemo(() => logs.filter(log => !log.isHistoric && !log.timestamp.startsWith('1970-01-01')), [logs]);

  const currentInterval = useMemo(() => {
    const now = new Date();
    if (timeframe === 'week') {
      const target = subWeeks(now, offsetOffset);
      return { start: startOfWeek(target, { weekStartsOn: 1 }), end: endOfWeek(target, { weekStartsOn: 1 }) };
    } else if (timeframe === 'month') {
      const target = subMonths(now, offsetOffset);
      return { start: startOfMonth(target), end: endOfMonth(target) };
    } else {
      const target = subYears(now, offsetOffset);
      return { start: startOfYear(target), end: endOfYear(target) };
    }
  }, [timeframe, offsetOffset]);

  const timeId = useMemo(() => {
    if (timeframe === 'week') return format(currentInterval.start, "yyyy-'W'ww");
    if (timeframe === 'month') return format(currentInterval.start, "yyyy-MM");
    return format(currentInterval.start, "yyyy");
  }, [timeframe, currentInterval]);

  const activeLogs = useMemo(() => {
    return validLogs.filter(log => isWithinInterval(parseISO(log.timestamp), currentInterval));
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
    // 1. Find all media that have a statusChange log to 'Completed' in this interval
    const completedLogIds = new Set(
      activeLogs
        .filter(l => l.metricType === 'statusChange' && l.note?.toLowerCase().includes('to completed'))
        .map(l => l.mediaId)
    );

    // 2. Fallback for older items: completed status and updatedAt in interval
    const completedLegacy = activeMedia.filter(m => {
      if (completedLogIds.has(m.id)) return false;
      
      const hasStatusLogs = logs.some(l => l.mediaId === m.id && l.metricType === 'statusChange');
      if (hasStatusLogs) return false; // This item uses the new system, so if it didn't have a log in the interval, it didn't finish now.

      return m.status === 'Completed' && isWithinInterval(parseISO(m.updatedAt), currentInterval);
    });

    const logBasedCompleted = media.filter(m => completedLogIds.has(m.id));
    
    return [...logBasedCompleted, ...completedLegacy];
  }, [activeLogs, activeMedia, currentInterval, logs, media]);

  const completedMediaIds = useMemo(() => new Set(completedMedia.map(m => m.id)), [completedMedia]);
  const inProgressMedia = useMemo(() => activeMedia.filter(m => !completedMediaIds.has(m.id)), [activeMedia, completedMediaIds]);

  const gatheredLoot = useMemo(() => {
    let intervalArtifacts = artifacts.filter(a => isWithinInterval(parseISO(a.earnedAt), currentInterval));
    
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

  const currentRecap = useMemo(() => {
    return aiRecaps.find(r => r.timeframe === timeframe && r.timeId === timeId);
  }, [aiRecaps, timeframe, timeId]);

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
    if (!currentRecap && activeLogs.length > 0 && settings?.nanoGptApiKey && !isGenerating) {
      if (!attemptedGenRef.current.has(timeId)) {
        attemptedGenRef.current.add(timeId);
        // Fire asynchronously to not block render
        setTimeout(() => handleGenerateAI(), 100);
      }
    }
  }, [currentRecap, activeLogs.length, settings?.nanoGptApiKey, isGenerating, timeId]);

  const handleGenerateAI = async () => {
    if (!settings?.nanoGptApiKey) {
      alert("Please configure your Nano-GPT API Key in the Settings menu first.");
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
        isWithinInterval(parseISO(b.updatedAt), currentInterval)
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
      
      const prevLogs = validLogs.filter(log => isWithinInterval(parseISO(log.timestamp), prevInterval) && log.metricType !== 'statusChange');
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
        const sortedDates = progressLogs.map(l => parseISO(l.timestamp).getTime()).sort();
        for(let i=1; i<sortedDates.length; i++) {
           const gap = (sortedDates[i] - sortedDates[i-1]) / (1000 * 60 * 60 * 24);
           if (gap > maxGapDays) maxGapDays = gap;
        }
      }

      // Lorekeeper Stats
      const historyLogsAtEnd = validLogs.filter(l => parseISO(l.timestamp).getTime() <= currentInterval.end.getTime());
      const rpgStateAtEnd = calculateRPGState(media, historyLogsAtEnd, settings, [], [], currentInterval.end);
      
      const historyLogsAtStart = validLogs.filter(l => parseISO(l.timestamp).getTime() < currentInterval.start.getTime());
      const rpgStateAtStart = calculateRPGState(media, historyLogsAtStart, settings, [], [], new Date(currentInterval.start.getTime() - 1000));

      const levelUps = Math.max(0, rpgStateAtEnd.level - rpgStateAtStart.level);
      const activeQuests = rpgStateAtEnd.quests.filter(q => q.type.startsWith(timeframe));
      const completedQuests = activeQuests.filter(q => q.isCompleted);
      const missedQuests = activeQuests.filter(q => !q.isCompleted);

      // Failed Bosses in this interval
      const failedBosses = worldBosses.filter(b => 
        b.status === 'Failed' && 
        b.expiresAt && 
        isWithinInterval(parseISO(b.expiresAt), currentInterval)
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
Current Level: ${rpgStateAtEnd.level} (${rpgStateAtEnd.className})
Levels Gained this ${timeframe}: ${levelUps}
Quests Completed this ${timeframe}: ${completedQuests.length > 0 ? completedQuests.map(q => `${q.title} - ${q.description}`).join(' | ') : 'None'}
Missed Quests: ${missedQuests.length > 0 ? missedQuests.map(q => `${q.title} - ${q.description} (${q.currentAmount}/${q.targetAmount})`).join(' | ') : 'None'}

BOSSES DEFEATED:
${defeatedBosses.length > 0 ? defeatedBosses.map(b => `- ${b.name} (LV ${b.level})`).join('\n') : 'None'}

Total Master Pages (EXP): ${Math.floor(totalMasterPages)} ${isNewPR ? "(PERSONAL RECORD! Highlight this!)" : ""}
Total Logs: ${activeLogs.length}

MEDIA IN PROGRESS:
${inProgressMedia.map(m => `- ${m.title} (${m.mediaType}): [Critic Rating: ${m.reviewScore || 'N/A'}/5, User Rating: ${m.userRating || 'N/A'}/5]${Array.from(new Set(activeLogs.filter(l => l.mediaId === m.id && l.location && l.location.trim().length > 0).map(l => l.location))).length > 0 ? ` [Consumed at: ${Array.from(new Set(activeLogs.filter(l => l.mediaId === m.id && l.location && l.location.trim().length > 0).map(l => l.location))).join(', ')}]` : ''} ${m.description ? m.description.substring(0, 150) + '...' : 'No description.'} ${m.genres?.length ? 'Genres: ' + m.genres.join(', ') : ''} ${m.tags?.length ? 'Tags: ' + m.tags.join(', ') : ''}`).join('\n') || 'None'}

MEDIA COMPLETED:
${completedMedia.length > 0 ? completedMedia.map(m => `- ${m.title} (${m.mediaType}): [Critic Rating: ${m.reviewScore || 'N/A'}/5, User Rating: ${m.userRating || 'N/A'}/5]${Array.from(new Set(activeLogs.filter(l => l.mediaId === m.id && l.location && l.location.trim().length > 0).map(l => l.location))).length > 0 ? ` [Consumed at: ${Array.from(new Set(activeLogs.filter(l => l.mediaId === m.id && l.location && l.location.trim().length > 0).map(l => l.location))).join(', ')}]` : ''} ${m.userReview ? `[User Review: "${m.userReview}"] ` : ''}${m.description ? m.description.substring(0, 150) + '...' : 'No description.'} ${m.genres?.length ? 'Genres: ' + m.genres.join(', ') : ''} ${m.tags?.length ? 'Tags: ' + m.tags.join(', ') : ''}`).join('\n') : 'None'}

TOP RANKED MEDIA (By Engagement/Master Pages):
${mediaRanking.slice(0,5).map(m => `- ${m.title} (${Math.round(m.pages)} MP)`).join('\n')}

GATHERED LOOT (Artifacts earned by finishing media!):
${gatheredLoot.length > 0 ? gatheredLoot.map(a => `- ${a.name} (${a.rarity}): ${a.description}`).join('\n') : 'None'}

JOURNAL NOTES (User's personal thoughts and reactions!):
${activeLogs.filter(l => l.note && l.note.trim().length > 0).map(l => `- [${l.timestamp.split('T')[0]}] On ${activeMedia.find(m => m.id === l.mediaId)?.title || 'Media'}: "${l.note}"`).join('\n') || 'None'}

PREVIOUS RECAPS (Chronological):
${previousRecaps.length > 0 ? previousRecaps.map(r => `-- ${r.timeId} (${r.title}): \n${r.summary}`).join('\n\n') : 'No past recaps available.'}
`;

      const aiResponsePromise = generateAiRecapText(settings.nanoGptApiKey, settings.nanoGptModel || 'gpt-4o-mini', `Based on the following data, generate a title and a creative, highly energetic recap of this ${timeframe}'s media consumption.
      
CRITICAL INSTRUCTIONS:
1. TITLE: Must be a punchy, clever name (1-5 words max). DO NOT include descriptions.
2. VIBE & TONE: Follow your specified persona instructions exactly. Weave the persona deeply into the narrative structure.
3. STRUCTURE & FOCUS: The core structure and primary focus of your recap MUST be the 'MEDIA COMPLETED' list (if any). Let what they finished dictate your narrative flow. After completing media, cover their 'MEDIA IN PROGRESS' as ongoing obsessions or endless slogs.
4. ORGANIC WEAVING: You MUST organically weave Journal Notes, Locations, Gathered Loot, Ratings (Critic and User Ratings), Bosses Defeated, and Lorekeeper Leveling stats (Level ups, Quests) directly into the discussion of the specific media. DO NOT create standalone paragraphs for locations, lorekeeper info, gathered loot, ratings or notes. Examples: "Reading some One Piece this month really helped you finish the 'Read some Manga' Quest!", "Glad to see you followed your weekly quest and went to watch a Comedy Movie!", "You clearly enjoyed your time reading [Book] in [Location] based on your notes.", "It's no surprise you gave it an 4/5, considering critics loved it with a 92/100!", or "Finishing [Media] gave you that sweet [Loot Name]!".
5. ACCURACY: DO NOT assume a media item is completed unless it explicitly is in the 'MEDIA COMPLETED' list! If it's just 'IN PROGRESS', treat it as their current ongoing obsession or slog.
6. FORMATTING: Use Markdown beautifully (bolding, italics, blockquotes, bullet points). Make it very readable.
7. LENGTH: Give a detailed recap (Weekly: 2-3 paragraphs. Monthly/Yearly: 4-6 paragraphs) highlighting their key moments, weird obsessions, or big wins.
8. CONTINUITY: Read the "PREVIOUS RECAPS" section and if relevant, comment on running themes, jokes, or unbroken streaks. Keep the lore alive.
9. PR ALERT: If the user hit a Personal Record (PR) in Master Pages, definitely celebrate it with some hype!

Context: 
${promptContext}`, settings.aiPersona);

      const roastPromise = generateText(
        settings.nanoGptApiKey, settings.nanoGptModel || 'gpt-4o-mini',
        "You are an AI roasting bot inside a media tracking app. Keep it fun and lighthearted, but throw some serious shade at the user's media habits. Just return the string directly, max 2 sentences.",
        promptContext
      );

      const themePromise = generateText(
        settings.nanoGptApiKey, settings.nanoGptModel || 'gpt-4o-mini',
        "You are an AI summarizing bot. Name the 'Theme of the Period' based on the user's media consumption. Provide just the theme name (max 5 words).",
        promptContext
      );

      const [aiResponse, aiRoast, aiTheme] = await Promise.all([
        aiResponsePromise,
        timeframe === 'month' || timeframe === 'year' ? roastPromise.catch(e => "Error loading roast.") : Promise.resolve(null),
        timeframe === 'month' || timeframe === 'year' ? themePromise.catch(e => "Error loading theme.") : Promise.resolve(null)
      ]);
      
      if (!aiResponse.summary || String(aiResponse.summary).trim().length === 0) {
        throw new Error("The AI failed to generate a narrative summary.");
      }

      await saveAiRecap({
        timeframe,
        timeId,
        title: aiResponse.title,
        summary: aiResponse.summary,
        data: {
          totalMasterPages,
          isNewPR,
          defeatedBosses: defeatedBosses.map(b => ({ name: b.name, level: b.level, mediaId: b.mediaId })),
          failedBosses: failedBosses.map(b => ({ name: b.name, level: b.level, mediaId: b.mediaId })),
          currentGenreDist,
          prevGenreDist,
          levelUps,
          rpgLevel: rpgStateAtEnd.level,
          rpgClass: rpgStateAtEnd.className,
          exp: rpgStateAtEnd.currentExp, 
          nextLevelExp: rpgStateAtEnd.nextLevelExp,
          aiRoast,
          aiTheme,
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
      alert("Failed to generate AI Recap: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const renderThemeOfTheMonth = () => {
    const themeText = currentRecap?.data?.aiTheme;
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
            return (
              <div key={idx} className="group relative bg-zinc-900 border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center text-center hover:border-white/20 transition-all">
                <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-4 border border-red-500/20 group-hover:scale-110 transition-transform">
                  <Ghost className="w-8 h-8 text-red-500/50" />
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
               <div key={a.id} className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-center gap-5 group hover:bg-white/10 hover:border-white/20 transition-all cursor-default">
                  <div className={`w-14 h-14 rounded-2xl ${theme.bg} flex items-center justify-center shrink-0 border ${theme.border} group-hover:scale-110 transition-transform shadow-xl`}>
                     <Star className={`w-7 h-7 ${theme.text} fill-current opacity-30`} />
                  </div>
                  <div>
                    <div className="text-white font-black text-lg tracking-tight leading-none mb-1">{a.name}</div>
                    <div className={`text-[10px] ${theme.text} font-black uppercase tracking-widest opacity-70`}>Unlocked</div>
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
      const day = format(parseISO(l.timestamp), 'EEEE');
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
     const historyLogsAtEnd = validLogs.filter(l => parseISO(l.timestamp).getTime() <= currentInterval.end.getTime());
     const rpgStateAtEnd = calculateRPGState(media, historyLogsAtEnd, settings, [], [], currentInterval.end);
     const activeQuests = rpgStateAtEnd.quests.filter(q => q.type.startsWith(timeframe));
     const completedQuests = activeQuests.filter(q => q.isCompleted);
     const missedQuests = activeQuests.filter(q => !q.isCompleted);

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
                 <div className="text-sm font-bold text-zinc-300">{rpgStateAtEnd.className}</div>
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
                 <div key={idx} className="flex flex-col gap-2 p-3 bg-black/40 rounded-2xl border border-white/5 relative overflow-hidden group">
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
             <Map className="w-5 h-5 text-zinc-400" />
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

                      {renderThemeOfTheMonth()}

                      <div className="text-xl md:text-2xl text-zinc-400 relative z-10 leading-relaxed font-light">
                         {currentRecap ? (
                             <>
                             <div className={`prose prose-invert prose-lg md:prose-xl max-w-none prose-p:leading-relaxed prose-strong:text-white prose-headings:text-white prose-a:text-white prose-blockquote:border-l-4 ${timeframe === 'week' ? 'prose-orange' : (timeframe === 'month' ? 'prose-indigo' : 'prose-emerald')} prose-blockquote:bg-white/5 prose-blockquote:px-8 prose-blockquote:py-4 prose-blockquote:rounded-r-3xl`}>
                               <Markdown>{currentRecap.summary}</Markdown>
                            </div>
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

                   {/* Macro Stats Bar */}
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-black/40 border border-white/5 p-6 rounded-3xl flex flex-col items-center justify-center text-center group hover:bg-white/5 transition-all">
                         <div className="text-3xl font-black text-white mb-1">{activeLogs.length}</div>
                         <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Logged Actions</div>
                      </div>
                      <div className="bg-black/40 border border-white/5 p-6 rounded-3xl flex flex-col items-center justify-center text-center group hover:bg-white/5 transition-all">
                         <div className="text-3xl font-black text-white mb-1">{completedMedia.length}</div>
                         <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Media Conquered</div>
                      </div>
                      <div className="bg-black/40 border border-white/5 p-6 rounded-3xl flex flex-col items-center justify-center text-center group hover:bg-white/5 transition-all">
                         <div className={`text-3xl font-black ${theme.text} mb-1`}>{Math.round(totalMasterPages)}</div>
                         <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Master Pages</div>
                      </div>
                      <div className="bg-black/40 border border-white/5 p-6 rounded-3xl flex flex-col items-center justify-center text-center group hover:bg-white/5 transition-all">
                         <div className="text-3xl font-black text-white mb-1">{activeMedia.length}</div>
                         <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Active Journeys</div>
                      </div>
                   </div>

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
                   </div>

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
                             {activeMedia.filter(m => m.status !== 'Completed').map(m => (
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
