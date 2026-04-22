import React, { useState, useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  startOfWeek, endOfWeek, subWeeks, 
  startOfMonth, endOfMonth, subMonths, 
  startOfYear, endOfYear, subYears, 
  format, isWithinInterval, parseISO,
  isSameDay
} from 'date-fns';
import { calculateScaledDelta } from '../lib/scaling';
import { MediaItem, MEDIA_COLORS, ProgressLog } from '../types/schema';
import { ChevronLeft, ChevronRight, Trophy, Star, Flame, Zap, Compass, Medal, Presentation, Library, Clock, AlertTriangle, BookOpen, Crown, Ghost, ThumbsDown, History, BarChart3, TrendingUp, Sparkles } from 'lucide-react';
import { 
  RecapAnalyticsData,
  analyzeSunkCost, analyzeContrarian, analyzeHabits, analyzeMediaDNA, 
  analyzeBingeFactor, analyzeGraveyard, analyzeBacklog, analyzeTimeTraveler, 
  extractJournals, calculateLongestStreak, determineArchetypes 
} from '../lib/recapAnalytics';

type Timeframe = 'week' | 'month' | 'year';

export function Recaps() {
  const { media, logs, settings } = useMediaContext();
  const [timeframe, setTimeframe] = useState<Timeframe>('week');
  const [offsetOffset, setOffsetOffset] = useState(1); // 1 = previous, 2 = two ago, etc.
  
  // Filter out historical dummy dates (1970)
  const validLogs = useMemo(() => {
    return logs.filter(log => !log.timestamp.startsWith('1970-01-01'));
  }, [logs]);

  // Determine current interval
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

  const activeLogs = useMemo(() => {
    return validLogs.filter(log => {
      const d = parseISO(log.timestamp);
      return isWithinInterval(d, currentInterval);
    });
  }, [validLogs, currentInterval]);

  const activeMedia = useMemo(() => {
    const mediaIds = new Set(activeLogs.map(l => l.mediaId));
    return media.filter(m => mediaIds.has(m.id));
  }, [activeLogs, media]);

  const totalMasterPages = useMemo(() => {
    return activeLogs.reduce((acc, log) => {
      const m = media.find(x => x.id === log.mediaId);
      if (!m) return acc;
      return acc + calculateScaledDelta(log.delta || 0, m, settings);
    }, 0);
  }, [activeLogs, media, settings]);

  const handlePrevious = () => setOffsetOffset(p => p + 1);
  const handleNext = () => setOffsetOffset(p => Math.max(1, p - 1));

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

  return (
    <div className="flex flex-col h-full max-h-full overflow-hidden w-full bg-[#09090B]">
      {/* Header controls */}
      <div className="flex-shrink-0 p-4 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 bg-zinc-900/40 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Presentation className="w-8 h-8 text-indigo-500" />
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">FauxLore Recaps</h1>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 items-center">
           <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
              {(['week', 'month', 'year'] as Timeframe[]).map(t => (
                 <button
                   key={t}
                   onClick={() => { setTimeframe(t); setOffsetOffset(1); }}
                   className={`px-4 py-1.5 rounded-lg text-sm font-bold capitalize transition-all ${timeframe === t ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500 hover:text-white'}`}
                 >
                   {t}
                 </button>
              ))}
           </div>
           
           <div className="flex items-center gap-3 bg-black/40 px-2 py-1 rounded-xl border border-white/5 mr-4">
              <button onClick={handlePrevious} className="p-1 md:p-2 text-zinc-400 hover:text-white transition-colors"><ChevronLeft className="w-5 h-5"/></button>
              <span className="text-sm font-bold text-white min-w-[120px] text-center">{formatIntervalLabel()}</span>
              <button 
                onClick={handleNext} 
                disabled={offsetOffset === 1} 
                className={`p-1 md:p-2 transition-colors ${offsetOffset === 1 ? 'text-zinc-800 cursor-not-allowed' : 'text-zinc-400 hover:text-white'}`}
              >
                <ChevronRight className="w-5 h-5"/>
              </button>
           </div>

           <button
             onClick={() => {
               // html2canvas wrapper
               const element = document.getElementById('recap-canvas-target');
               if (element) {
                 import('html2canvas').then(html2canvas => {
                   html2canvas.default(element, { backgroundColor: '#09090B' }).then(canvas => {
                     const link = document.createElement('a');
                     link.download = `FauxLore-${timeframe}-recap.png`;
                     link.href = canvas.toDataURL();
                     link.click();
                   });
                 });
               }
             }}
             className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl font-medium transition-colors text-sm border border-white/10 hidden md:block whitespace-nowrap"
           >
             Get Canvas
           </button>
        </div>
      </div>

      {/* Recap Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar relative p-4 md:p-8">
         <AnimatePresence mode="wait">
            <motion.div
               id="recap-canvas-target"
               key={`${timeframe}-${offsetOffset}`}
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.98 }}
               transition={{ duration: 0.4, ease: "easeOut" }}
               className="max-w-5xl mx-auto w-full space-y-6 md:space-y-10"
            >
               {activeLogs.length === 0 ? (
                 <div className="h-64 flex flex-col items-center justify-center text-center px-4">
                   <div className="w-16 h-16 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center mb-4">
                      <Zap className="w-6 h-6 text-zinc-700" />
                   </div>
                   <h2 className="text-xl font-bold text-white mb-2">It's quiet in here...</h2>
                   <p className="text-zinc-500 text-sm max-w-sm">No activity logged during {formatIntervalLabel().toLowerCase()}. Log some progress to see your recap!</p>
                 </div>
               ) : (
                 <>
                   {timeframe === 'week' && (
                     <WeeklyRecap logs={activeLogs} media={activeMedia} totalPages={totalMasterPages} interval={currentInterval} allMedia={media} settings={settings} />
                   )}
                   {timeframe === 'month' && (
                     <MonthlyRecap logs={activeLogs} media={activeMedia} totalPages={totalMasterPages} interval={currentInterval} allMedia={media} settings={settings} />
                   )}
                   {timeframe === 'year' && (
                     <YearlyRecap logs={activeLogs} media={activeMedia} totalPages={totalMasterPages} interval={currentInterval} allMedia={media} settings={settings} />
                   )}
                 </>
               )}
            </motion.div>
         </AnimatePresence>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Weekly Recap Component
// ----------------------------------------------------------------------
function WeeklyRecap({ logs, media, totalPages, interval, allMedia, settings }: any) {
  const analyticsData: RecapAnalyticsData = useMemo(() => ({
    timeScale: 'week', logs, media, allMedia, settings
  }), [logs, media, allMedia, settings]);

  const habits = useMemo(() => analyzeHabits(analyticsData), [analyticsData]);
  const streak = useMemo(() => calculateLongestStreak(analyticsData), [analyticsData]);
  const dna = useMemo(() => analyzeMediaDNA(analyticsData), [analyticsData]);

  // Aggregate pages by day
  const dailyActivity = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 0; i <= 6; i++) {
       const d = startOfWeek(interval.start, { weekStartsOn: 1 });
       d.setDate(d.getDate() + i);
       days[format(d, 'yyyy-MM-dd')] = 0;
    }
    
    logs.forEach((log: ProgressLog) => {
      const date = format(parseISO(log.timestamp), 'yyyy-MM-dd');
      const m = allMedia.find((x: MediaItem) => x.id === log.mediaId);
      if (days[date] !== undefined && m) {
         days[date] += calculateScaledDelta(log.delta, m, settings);
      }
    });
    return Object.entries(days).map(([date, amount]) => ({ date, amount, dayName: format(parseISO(date), 'EEE') }));
  }, [logs, interval, allMedia, settings]);

  const peakDay = dailyActivity.reduce((max, current) => current.amount > max.amount ? current : max, dailyActivity[0]);
  const activeDaysCount = dailyActivity.filter(d => d.amount > 0).length;

  const rabbitHole = useMemo(() => {
    const freq: Record<string, number> = {};
    logs.forEach((l: ProgressLog) => freq[l.mediaId] = (freq[l.mediaId] || 0) + 1);
    const mostLogsId = Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b, '');
    return {
      media: allMedia.find((m: MediaItem) => m.id === mostLogsId),
      logsCount: freq[mostLogsId] || 0
    }
  }, [logs, allMedia]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-indigo-900/40 to-black border border-indigo-500/20 rounded-3xl p-6 md:p-10 relative overflow-hidden shadow-2xl flex flex-col md:flex-row gap-8">
         <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/30 blur-3xl rounded-full pointer-events-none" />
         
         <div className="flex-1 space-y-4 text-center md:text-left relative z-10">
            <span className="text-indigo-400 font-bold tracking-widest uppercase text-xs">The Weekly Sprint</span>
            <h2 className="text-4xl md:text-5xl font-black text-white leading-tight">
               You conquered <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">{Math.round(totalPages).toLocaleString()}</span> Master Pages this week.
            </h2>
            <p className="text-zinc-400 text-sm md:text-base max-w-lg mx-auto md:mx-0">
              You were active for {activeDaysCount} out of 7 days, showing true dedication to the lore. {peakDay.amount > 0 && `Your strongest push was on ${peakDay.dayName} with ${Math.round(peakDay.amount).toLocaleString()} pages.`}
            </p>
         </div>
         
         <div className="w-full md:w-64 h-48 bg-black/40 rounded-2xl flex items-end justify-between p-4 gap-2 border border-white/5 relative z-10 shrink-0">
            {dailyActivity.map((day) => {
              const heightPct = peakDay.amount > 0 ? (day.amount / peakDay.amount) * 100 : 0;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-2 group">
                   <div className="w-full relative flex-1 flex items-end">
                      <motion.div 
                        initial={{ height: 0 }}
                        animate={{ height: `${heightPct}%` }}
                        transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                        className={`w-full rounded-md ${heightPct === 100 ? 'bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-zinc-700 group-hover:bg-zinc-600'} transition-all`}
                      />
                   </div>
                   <span className="text-[10px] uppercase font-bold text-zinc-500">{day.dayName.charAt(0)}</span>
                </div>
              );
            })}
         </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
         {habits && (
           <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 group relative overflow-hidden">
             <Clock className="w-6 h-6 text-indigo-400 mb-3 relative z-10" />
             <h4 className="text-white font-bold mb-1 relative z-10">{habits.profile}</h4>
             <p className="text-xs text-zinc-400 relative z-10">{habits.desc}</p>
             <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-indigo-500/5 blur-2xl rounded-full" />
           </div>
         )}
         
         <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 group relative overflow-hidden">
             <TrendingUp className="w-6 h-6 text-orange-400 mb-3 relative z-10" />
             <h4 className="text-white font-bold mb-1 relative z-10">{streak} Day Streak</h4>
             <p className="text-xs text-zinc-400 relative z-10">Your longest unbroken combo this week.</p>
             <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-orange-500/5 blur-2xl rounded-full" />
         </div>

         {dna && dna.length > 0 && (
           <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 col-span-1 sm:col-span-2 relative overflow-hidden flex flex-col justify-center">
             <div className="flex items-center gap-2 mb-3 relative z-10">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h4 className="text-sm font-bold text-zinc-300 uppercase tracking-widest border-b border-white/5 pb-1 flex-1">Weekly DNA</h4>
             </div>
             <div className="flex flex-wrap gap-2 relative z-10">
               {dna.map(([trait]) => (
                  <span key={trait} className="px-2.5 py-1 rounded bg-white/5 border border-white/10 text-xs font-mono text-zinc-400">{trait}</span>
               ))}
             </div>
           </div>
         )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 col-span-1 md:col-span-2">
           <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-wider flex items-center gap-2">
             <Flame className="w-4 h-4 text-orange-500" /> Active Journeys
           </h3>
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {media.slice(0, 4).map((m: MediaItem) => (
                 <div key={m.id} className="flex gap-4 items-center bg-black/30 p-3 rounded-xl border border-white/5">
                    <img src={m.coverImageUrl} className="w-12 h-16 object-cover rounded shadow-lg" alt="" referrerPolicy="no-referrer" />
                    <div className="flex-1 min-w-0">
                       <h4 className="text-white font-bold truncate text-sm">{m.title}</h4>
                       <p className="text-zinc-500 text-xs truncate">{m.mediaType}</p>
                    </div>
                 </div>
              ))}
           </div>
        </div>

        <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
           <h3 className="text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wider flex items-center gap-2">
             <Compass className="w-4 h-4 text-indigo-400" /> Deepest Rabbit Hole
           </h3>
           {rabbitHole.media ? (
             <div className="flex flex-col h-full mt-2 relative z-10">
               <div className="flex items-start gap-4">
                 <img src={rabbitHole.media.coverImageUrl} className="w-16 h-24 object-cover rounded-lg shadow-lg" alt="" referrerPolicy="no-referrer" />
                 <div>
                   <h4 className="text-white font-bold line-clamp-2 leading-tight">{rabbitHole.media.title}</h4>
                   <p className="text-indigo-400 text-xs font-bold mt-2">{rabbitHole.logsCount} Sessions logged</p>
                 </div>
               </div>
             </div>
           ) : <p className="text-zinc-500 text-sm">No activity logged.</p>}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Monthly Recap Component
// ----------------------------------------------------------------------
function MonthlyRecap({ logs, media, totalPages, allMedia, settings }: any) {
  const analyticsData: RecapAnalyticsData = useMemo(() => ({
    timeScale: 'month', logs, media, allMedia, settings
  }), [logs, media, allMedia, settings]);

  const sunkCost = useMemo(() => analyzeSunkCost(analyticsData), [analyticsData]);
  const binge = useMemo(() => analyzeBingeFactor(analyticsData), [analyticsData]);
  const archetypes = useMemo(() => determineArchetypes(analyticsData), [analyticsData]);
  const journals = useMemo(() => extractJournals(analyticsData), [analyticsData]);

  // Find highest individual delta generator
  const MVP = useMemo(() => {
    const scores: Record<string, number> = {};
    logs.forEach((l: ProgressLog) => {
      const m = allMedia.find((x: MediaItem) => x.id === l.mediaId);
      if (m) scores[m.id] = (scores[m.id] || 0) + calculateScaledDelta(l.delta, m, settings);
    });
    // @ts-ignore
    const bestId = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b, '');
    return allMedia.find((m: MediaItem) => m.id === bestId);
  }, [logs, allMedia, settings]);

  const typeBreakdown = useMemo(() => {
    const bt: Record<string, number> = {};
    logs.forEach((l: ProgressLog) => {
      const m = allMedia.find((x: MediaItem) => x.id === l.mediaId);
      if (m) bt[m.mediaType] = (bt[m.mediaType] || 0) + calculateScaledDelta(l.delta, m, settings);
    });
    return Object.entries(bt).sort((a,b) => b[1] - a[1]);
  }, [logs, allMedia, settings]);

  const topGenres = useMemo(() => {
    const g: Record<string, number> = {};
    logs.forEach((l: ProgressLog) => {
      const m = allMedia.find((x: MediaItem) => x.id === l.mediaId);
      if (m && m.genres) {
        const amt = calculateScaledDelta(l.delta, m, settings);
        m.genres.forEach((genre: string) => g[genre] = (g[genre] || 0) + amt);
      }
    });
    return Object.entries(g).sort((a,b) => b[1] - a[1]).slice(0, 3);
  }, [logs, allMedia, settings]);

  const completedCount = useMemo(() => {
     return media.filter((m: MediaItem) => m.status === 'Completed').length;
  }, [media]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-emerald-900/40 to-[#09090B] border border-emerald-500/20 rounded-3xl p-6 md:p-12 text-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-64 bg-emerald-600/10 blur-[100px] rounded-full pointer-events-none" />
        <span className="text-emerald-500 font-bold tracking-widest uppercase text-xs relative z-10">The Deep Dive</span>
        <h2 className="text-3xl md:text-5xl font-black text-white mt-4 mb-6 relative z-10 leading-tight">
          A glorious month of exploration, spanning <br className="hidden md:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 text-5xl md:text-7xl">{Math.round(totalPages).toLocaleString()}</span><br className="hidden md:block"/> 
          Master Pages.
        </h2>
        
        {completedCount > 0 && (
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full text-emerald-300 font-medium text-sm relative z-10 mb-4">
             <Trophy className="w-4 h-4" /> You completed {completedCount} quest{completedCount !== 1 ? 's' : ''} this month!
          </div>
        )}

        {archetypes.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3 relative z-10 mt-6 pt-6 border-t border-white/10">
            {archetypes.slice(0, 2).map(a => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-emerald-500/30 rounded-lg shadow-lg">
                <Medal className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-emerald-100">{a.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Special Metric Cards */}
      {(binge || sunkCost) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {binge && (
            <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
               <Zap className="w-6 h-6 text-yellow-400 mb-4" />
               <h3 className="text-sm font-bold text-zinc-400 mb-1 uppercase tracking-wider">The Hyper-Fixation</h3>
               <p className="text-xs text-zinc-500 mb-4">Fastest completion from first log this month.</p>
               <div className="flex items-center gap-4">
                 <img src={binge.media.coverImageUrl} className="w-12 h-16 object-cover rounded shadow" alt="" referrerPolicy="no-referrer" />
                 <div>
                   <h4 className="text-white font-bold leading-tight">{binge.media.title}</h4>
                   <p className="text-yellow-400 font-mono text-sm mt-1">{Math.round(binge.hours)} hours total</p>
                 </div>
               </div>
            </div>
          )}

          {sunkCost && (
            <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
               <ThumbsDown className="w-6 h-6 text-rose-400 mb-4" />
               <h3 className="text-sm font-bold text-zinc-400 mb-1 uppercase tracking-wider">Sunk Cost Fallacy</h3>
               <p className="text-xs text-zinc-500 mb-4">Highest time invested for the lowest rating.</p>
               <div className="flex items-center gap-4">
                 <img src={sunkCost.media.coverImageUrl} className="w-12 h-16 object-cover rounded shadow border border-rose-500/20" alt="" referrerPolicy="no-referrer" />
                 <div>
                   <h4 className="text-white font-bold leading-tight">{sunkCost.media.title}</h4>
                   <p className="text-rose-400 font-bold text-sm mt-1">Rated {sunkCost.media.userRating}/10</p>
                 </div>
               </div>
            </div>
          )}
        </div>
      )}

      {journals.length > 0 && (
        <div className="bg-[#18181b] border border-white/5 rounded-3xl p-6 md:p-8 relative">
           <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-wider flex items-center gap-2">
             <BookOpen className="w-4 h-4 text-emerald-500" /> Journal Highlights
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {journals.slice(0, 2).map((j, i) => (
                <div key={i} className="bg-black/40 p-5 rounded-2xl border border-white/5 relative">
                   <div className="text-emerald-500/20 absolute top-4 right-4"><BookOpen className="w-8 h-8" /></div>
                   <p className="text-zinc-200 text-sm italic leading-relaxed relative z-10 mb-4">"{j.note}"</p>
                   <div className="flex items-center gap-3 relative z-10 border-t border-white/5 pt-4">
                      <img src={j.media.coverImageUrl} className="w-8 h-8 object-cover rounded shadow" alt="" referrerPolicy="no-referrer" />
                      <div>
                        <p className="text-xs font-bold text-white leading-tight">{j.media.title}</p>
                        <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{format(parseISO(j.date), 'MMM do, yyyy')}</p>
                      </div>
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 border border-white/5 bg-zinc-900 rounded-3xl p-6 relative overflow-hidden group flex flex-col">
           <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-wider">The Monthly Obsession</h3>
           {MVP ? (
             <div className="flex flex-col items-center justify-center flex-1 text-center">
                <div className="relative w-32 aspect-[2/3] mb-4 shadow-2xl transition-transform group-hover:scale-105">
                   <img src={MVP.coverImageUrl} className="w-full h-full object-cover rounded-xl" referrerPolicy="no-referrer" alt="" />
                   <div className="absolute inset-0 border border-white/10 rounded-xl" />
                </div>
                <h4 className="text-white font-bold text-lg line-clamp-2">{MVP.title}</h4>
                <p className="text-emerald-400 text-sm mt-1">{MEDIA_COLORS[MVP.mediaType as keyof typeof MEDIA_COLORS]?.text.split('-')[1].toUpperCase() || 'Focus'}</p>
             </div>
           ) : <p className="text-zinc-500">Not enough data.</p>}
        </div>

        <div className="col-span-1 md:col-span-2 flex flex-col gap-6">
           <div className="border border-white/5 bg-zinc-900 rounded-3xl p-6 flex flex-col flex-1 justify-center">
              <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-wider flex items-center gap-2">
                <Compass className="w-4 h-4 text-zinc-300" /> Format Breakdown
              </h3>
              <div className="space-y-4">
                 {typeBreakdown.map(([type, amount]) => {
                   const pct = (amount / totalPages) * 100;
                   const colorRec = MEDIA_COLORS[type as keyof typeof MEDIA_COLORS];
                   return (
                     <div key={type} className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs font-bold font-mono">
                           <span className="text-white">{type}</span>
                           <span className="text-zinc-500">{Math.round(amount).toLocaleString()} pgs</span>
                        </div>
                        <div className="w-full h-3 bg-black rounded-full overflow-hidden">
                           <motion.div 
                             initial={{ width: 0 }} 
                             animate={{ width: `${pct}%` }} 
                             transition={{ duration: 1.5, ease: 'easeOut' }}
                             className={`h-full ${colorRec ? colorRec.progress : 'bg-zinc-500'}`} 
                           />
                        </div>
                     </div>
                   )
                 })}
              </div>
           </div>

           {topGenres.length > 0 && (
              <div className="border border-white/5 bg-zinc-900 rounded-3xl p-6">
                 <h3 className="text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wider flex items-center gap-2">
                   <Star className="w-4 h-4 text-emerald-400" /> Defining Textures
                 </h3>
                 <p className="text-xs text-zinc-500 mb-4">Your most explored genres this month, ranked by time invested.</p>
                 <div className="flex flex-wrap gap-2">
                    {topGenres.map(([genre, amount], i) => (
                       <div key={genre} className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${i === 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-black/30 border-white/5 text-zinc-300'}`}>
                          <span className="font-bold">{genre}</span>
                          <span className="text-xs opacity-50 font-mono">{Math.round((amount / totalPages) * 100)}%</span>
                       </div>
                    ))}
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Yearly Recap Component
// ----------------------------------------------------------------------
function YearlyRecap({ logs, media, totalPages, allMedia, settings }: any) {
  const analyticsData: RecapAnalyticsData = useMemo(() => ({
    timeScale: 'year', logs, media, allMedia, settings
  }), [logs, media, allMedia, settings]);

  const archetypes = useMemo(() => determineArchetypes(analyticsData), [analyticsData]);
  const contrarian = useMemo(() => analyzeContrarian(analyticsData), [analyticsData]);
  const graveyard = useMemo(() => analyzeGraveyard(analyticsData), [analyticsData]);
  const backlog = useMemo(() => analyzeBacklog(analyticsData), [analyticsData]);
  const avgYear = useMemo(() => analyzeTimeTraveler(analyticsData), [analyticsData]);

  const completedArray = useMemo(() => {
     return media.filter((m: MediaItem) => m.status === 'Completed').sort((a: any, b: any) => (b.userRating||0) - (a.userRating||0));
  }, [media]);

  const topCompleted = completedArray.slice(0, 4);

  const timeSink = useMemo(() => {
    const scores: Record<string, number> = {};
    logs.forEach((l: ProgressLog) => {
      const m = allMedia.find((x: MediaItem) => x.id === l.mediaId);
      if (m) scores[m.id] = (scores[m.id] || 0) + calculateScaledDelta(l.delta, m, settings);
    });
    const bestId = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b, '');
    return {
      media: allMedia.find((m: MediaItem) => m.id === bestId),
      amount: scores[bestId] || 0
    };
  }, [logs, allMedia, settings]);

  const ratingSpread = useMemo(() => {
    const distro: Record<number, number> = { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0,10:0 };
    completedArray.forEach((m: MediaItem) => {
      if (m.userRating) {
        distro[m.userRating] = (distro[m.userRating] || 0) + 1;
      }
    });
    return Object.entries(distro).map(([score, count]) => ({ score: Number(score), count }));
  }, [completedArray]);
  const maxRatingCount = Math.max(...ratingSpread.map(r => r.count));

  const topCreators = useMemo(() => {
    const c: Record<string, number> = {};
    media.forEach((m: MediaItem) => {
      if (m.creator) c[m.creator] = (c[m.creator] || 0) + 1;
    });
    return Object.entries(c).sort((a,b) => b[1] - a[1]).slice(0, 3);
  }, [media]);

  return (
    <div className="space-y-6">
       
      <div className="relative border border-orange-500/20 bg-gradient-to-b from-orange-950/40 to-[#09090B] rounded-3xl p-8 md:p-16 overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-600/10 blur-[100px] rounded-full pointer-events-none translate-x-1/3 -translate-y-1/3" />
        <div className="relative z-10 max-w-2xl">
          <h2 className="text-5xl md:text-7xl font-black text-white leading-[1.1] mb-6">
            A legendary year filled with <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-rose-400">{Math.round(totalPages).toLocaleString()}</span> Master Pages.
          </h2>
          <p className="text-zinc-400 text-lg">
            This year, FauxLore tracked your adventures across {media.length} different media properties. You reached the conclusion of {completedArray.length} stories.
          </p>

          {archetypes.length > 0 && (
             <div className="mt-8 flex flex-wrap gap-3">
               {archetypes.map(a => (
                 <div key={a.id} className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/30 rounded-xl shadow-lg">
                   <Crown className="w-5 h-5 text-orange-400" />
                   <div className="flex flex-col">
                     <span className="text-xs text-orange-500/70 font-bold uppercase tracking-wider">Persona</span>
                     <span className="text-sm font-bold text-orange-100">{a.name}</span>
                   </div>
                 </div>
               ))}
             </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric Cards */}
        <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
           <Trophy className="w-8 h-8 text-yellow-500 mb-4 ease-out duration-500 group-hover:scale-110" />
           <p className="text-4xl font-black text-white mb-2">{completedArray.length}</p>
           <p className="text-zinc-400 text-sm font-medium mt-1 uppercase tracking-wider">Completed</p>
           <div className="absolute top-0 right-0 p-4 opacity-10"><Trophy className="w-24 h-24" /></div>
        </div>
        <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
           <BarChart3 className="w-8 h-8 text-rose-500 mb-4 ease-out duration-500 group-hover:scale-110" />
           <p className="text-4xl font-black text-white mb-2">{backlog.net > 0 ? '+' : ''}{backlog.net}</p>
           <p className="text-zinc-400 text-sm font-medium mt-1 uppercase tracking-wider">Backlog Growth</p>
           <div className="absolute top-0 right-0 p-4 opacity-10"><BarChart3 className="w-24 h-24" /></div>
        </div>
        <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
           <Ghost className="w-8 h-8 text-zinc-500 mb-4 ease-out duration-500 group-hover:scale-110" />
           <p className="text-4xl font-black text-white mb-2">{graveyard.dropped.length + graveyard.stale.length}</p>
           <p className="text-zinc-400 text-sm font-medium mt-1 uppercase tracking-wider">Graveyard Count</p>
           <div className="absolute top-0 right-0 p-4 opacity-5"><Ghost className="w-24 h-24" /></div>
        </div>
        <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
           <History className="w-8 h-8 text-blue-500 mb-4 ease-out duration-500 group-hover:scale-110" />
           <p className="text-4xl font-black text-white mb-2">{avgYear || 'N/A'}</p>
           <p className="text-zinc-400 text-sm font-medium mt-1 uppercase tracking-wider">Avg Release Year</p>
           <div className="absolute top-0 right-0 p-4 opacity-10"><History className="w-24 h-24" /></div>
        </div>

        <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 lg:col-span-4 relative overflow-hidden flex flex-col justify-center">
           <Star className="w-8 h-8 text-amber-400 mb-2 absolute right-6 -bottom-4 opacity-5 stroke-[0.5] fill-current w-32 h-32" />
           <h3 className="text-sm font-bold text-amber-500 mb-4 uppercase tracking-wider relative z-10">Best in Class</h3>
           
           {topCompleted.length > 0 ? (
             <div className="flex flex-wrap gap-4 relative z-10">
               {topCompleted.map((c: MediaItem) => (
                 <div key={c.id} className="relative aspect-[2/3] w-20 md:w-24 rounded-xl shadow-2xl shrink-0 group hover:z-20 transition-transform hover:scale-105">
                    <img src={c.coverImageUrl} alt={c.title} className="w-full h-full object-cover rounded-xl border border-white/10" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-black/80 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center flex-col text-center p-2 backdrop-blur-sm">
                      <span className="font-bold text-amber-400 text-base">{c.userRating}/10</span>
                      <span className="text-[10px] text-zinc-300 font-medium line-clamp-3 mt-1 px-1">{c.title}</span>
                    </div>
                 </div>
               ))}
             </div>
           ) : (
             <p className="text-zinc-500 italic relative z-10">No completed and rated media this year.</p>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         {timeSink.media && (
           <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 md:p-8 flex items-center gap-6 group hover:border-orange-500/30 transition-colors">
              <div className="w-24 shrink-0 aspect-[2/3] relative rounded-xl shadow-[0_0_30px_rgba(249,115,22,0.15)] group-hover:shadow-[0_0_30px_rgba(249,115,22,0.3)] transition-all">
                 <img src={timeSink.media.coverImageUrl} alt="" className="w-full h-full object-cover rounded-xl border border-orange-500/30" referrerPolicy="no-referrer" />
              </div>
              <div className="flex-1">
                 <h3 className="text-orange-500 font-bold uppercase tracking-widest text-xs mb-1">The Great Devourer</h3>
                 <h4 className="text-2xl font-black text-white leading-tight mb-2">{timeSink.media.title}</h4>
                 <p className="text-zinc-400 text-sm">
                   Consumed the absolute lion's share of your time, accounting for <strong className="text-white">{Math.round((timeSink.amount / totalPages) * 100)}%</strong> of your entire year's logged activity.
                 </p>
              </div>
           </div>
         )}

         {contrarian && (
            <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 md:p-8 flex items-center gap-6 group hover:border-blue-500/30 transition-colors">
              <div className="w-24 shrink-0 aspect-[2/3] relative rounded-xl shadow-[0_0_30px_rgba(59,130,246,0.15)] group-hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-all">
                 <img src={contrarian.media.coverImageUrl} alt="" className="w-full h-full object-cover rounded-xl border border-blue-500/30" referrerPolicy="no-referrer" />
              </div>
              <div className="flex-1">
                 <h3 className="text-blue-400 font-bold uppercase tracking-widest text-xs mb-1">The Contrarian</h3>
                 <h4 className="text-xl font-black text-white leading-tight mb-2">{contrarian.media.title}</h4>
                 <p className="text-zinc-400 text-sm">
                   You {contrarian.type === 'loved' ? 'loved' : 'hated'} it. The critics vehemently disagreed. You rated it <strong className="text-white">{contrarian.media.userRating}/10</strong> against a general critical score of <strong className="text-white">{Math.round(contrarian.media.reviewScore || 0)}/100</strong>.
                 </p>
              </div>
           </div>
         )}
         
         {topCreators.length > 0 && (
           <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 md:p-8 flex items-center gap-6 group md:col-span-2">
              <div className="flex-1 flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="text-purple-400 font-bold uppercase tracking-widest text-xs mb-2">Creator Loyalty</h3>
                  <p className="text-zinc-300 text-sm">The minds behind the media you consumed this year.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {topCreators.map(([creator, c], i) => (
                    <div key={creator} className="px-4 py-2 bg-black/40 border border-white/10 rounded-xl flex items-center gap-3">
                      <span className="text-xs text-zinc-500 font-mono">#{i+1}</span>
                      <span className="font-bold text-white text-sm">{creator}</span>
                      <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-zinc-300">{c} items</span>
                    </div>
                  ))}
                </div>
              </div>
           </div>
         )}

         <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 flex flex-col justify-center md:col-span-2">
            <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-wider flex items-center gap-2">
              <Star className="w-4 h-4 text-rose-500" /> Annual Rating Spread
            </h3>
            <div className="flex items-end justify-between gap-1 h-32 px-2">
               {ratingSpread.map((col) => {
                 const pct = maxRatingCount > 0 ? (col.count / maxRatingCount) * 100 : 0;
                 return (
                   <div key={col.score} className="flex-1 flex flex-col items-center gap-2 group">
                      <div className="w-full relative flex-1 flex items-end">
                         <div className="w-full relative">
                            {col.count > 0 && <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-zinc-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity">{col.count}</span>}
                            <motion.div 
                              initial={{ height: 0 }}
                              animate={{ height: `${pct}%` }}
                              transition={{ duration: 1, ease: 'easeOut' }}
                              className={`w-full rounded bg-rose-500/20 group-hover:bg-rose-500/40 transition-colors border-t border-rose-500/50`}
                            />
                         </div>
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500">{col.score}</span>
                   </div>
                 )
               })}
            </div>
            <p className="text-xs text-center text-zinc-500 mt-4">Calculated from media completed this year.</p>
         </div>
      </div>
    </div>
  );
}
