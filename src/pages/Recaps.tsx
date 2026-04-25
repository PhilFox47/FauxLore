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
import { MediaItem, MEDIA_COLORS, ProgressLog } from '../types/schema';
import { generateAiRecapText } from '../services/nanoGptService';
import { ChevronLeft, ChevronRight, Trophy, Sparkles, RefreshCw, Presentation, Clock, CalendarDays, Target, Star, BrainCircuit, BarChart3, Medal, Library, Flame, Zap, Compass, Info, Map, LayoutGrid, Calendar, Activity, ZapOff, Hash, Ghost, History, Moon } from 'lucide-react';
import { analyzeHabits, analyzeMediaDNA, analyzeSessionVelocity, determineArchetypes, analyzeBingeFactor, analyzeSunkCost, analyzeTimeTraveler, analyzeBacklog } from '../lib/recapAnalytics';
import Markdown from 'react-markdown';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from 'recharts';

type Timeframe = 'week' | 'month' | 'year';

export function Recaps() {
  const { media, logs, settings, aiRecaps, saveAiRecap } = useMediaContext();
  const [timeframe, setTimeframe] = useState<Timeframe>('week');
  const [offsetOffset, setOffsetOffset] = useState(1); 
  const [isGenerating, setIsGenerating] = useState(false);
  const attemptedGenRef = useRef<Set<string>>(new Set());

  const validLogs = useMemo(() => logs.filter(log => !log.timestamp.startsWith('1970-01-01')), [logs]);

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

  const activeMedia = useMemo(() => {
    const mediaIds = new Set(activeLogs.map(l => l.mediaId));
    // We want to include ALL media that have progress logs in this time interval,
    // regardless of their current status (even if they were moved back to Planning, etc.)
    return media.filter(m => mediaIds.has(m.id));
  }, [activeLogs, media]);

  const completedMedia = useMemo(() => {
    return activeMedia.filter(m => m.status === 'Completed' && isWithinInterval(parseISO(m.updatedAt), currentInterval));
  }, [activeMedia, currentInterval]);

  const totalMasterPages = useMemo(() => {
    return activeLogs.reduce((acc, log) => {
      const m = media.find(x => x.id === log.mediaId);
      if (!m) return acc;
      return acc + calculateScaledDelta(log.delta || 0, m, settings);
    }, 0);
  }, [activeLogs, media, settings]);

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
        const mLogs = activeLogs.filter(l => l.mediaId === m.id);
        const pages = mLogs.reduce((acc, l) => acc + calculateScaledDelta(l.delta, m, settings), 0);
        return { title: m.title, type: m.mediaType, pages };
      }).sort((a,b) => b.pages - a.pages).slice(0, rankingLimit);

      const promptContext = `
Timeframe: ${timeframe} (${formatIntervalLabel()})
Total Master Pages (EXP): ${Math.round(totalMasterPages)}
Total Logs: ${activeLogs.length}

MEDIA IN PROGRESS:
${activeMedia.filter(m => m.status !== 'Completed').map(m => `- ${m.title} (${m.mediaType}): ${m.description ? m.description.substring(0, 150) + '...' : 'No description.'} ${m.genres?.length ? 'Genres: ' + m.genres.join(', ') : ''} ${m.tags?.length ? 'Tags: ' + m.tags.join(', ') : ''}`).join('\n') || 'None'}

MEDIA COMPLETED:
${completedMedia.length > 0 ? completedMedia.map(m => `- ${m.title} (${m.mediaType}): ${m.description ? m.description.substring(0, 150) + '...' : 'No description.'} ${m.genres?.length ? 'Genres: ' + m.genres.join(', ') : ''} ${m.tags?.length ? 'Tags: ' + m.tags.join(', ') : ''}`).join('\n') : 'None'}

TOP RANKED MEDIA (By Engagement/Master Pages):
${mediaRanking.slice(0,5).map(m => `- ${m.title} (${Math.round(m.pages)} MP)`).join('\n')}

LOCATIONS TRACKED (Where the user consumed media):
${Array.from(new Set(activeLogs.filter(l => l.location && l.location.trim().length > 0).map(l => l.location))).join(', ') || 'None'}

JOURNAL NOTES (User's personal thoughts and reactions!):
${activeLogs.filter(l => l.note && l.note.trim().length > 0).map(l => `- [${l.timestamp.split('T')[0]}] On ${activeMedia.find(m => m.id === l.mediaId)?.title || 'Media'}: "${l.note}"`).join('\n') || 'None'}
`;

      const aiResponse = await generateAiRecapText(settings.nanoGptApiKey, settings.nanoGptModel || 'gpt-4o-mini', `Based on the following data, generate a title and a creative, witty, and highly energetic recap of this ${timeframe}'s media consumption.
      
CRITICAL INSTRUCTIONS:
1. TITLE: Must be a punchy, clever name (1-5 words max). DO NOT include descriptions.
2. VIBE & TONE: Be charming, sarcastic, witty, and charismatic! Sound natural, modern and casual. Feel free to roast or tease the user playfully about their habits (e.g., spending too much time on one thing, slow reading, weird combos). Less "classic prose" and more like an entertaining, hyper-aware gamer/geek podcaster talking to the user.
3. WEAVE REAL DATA: You MUST talk about the SPECIFIC media consumed, referencing their plots/descriptions/genres! Use their actual journal notes to comment on their opinions.
4. ACCURACY: DO NOT assume a media item is completed unless it explicitly is in the 'MEDIA COMPLETED' list! If it's just 'IN PROGRESS', treat it as their current ongoing obsession or slog.
5. FORMATTING: Use Markdown beautifully (bolding, italics, blockquotes, bullet points). Make it very readable.
6. LENGTH: Give a detailed recap (Weekly: 2-3 paragraphs. Monthly/Yearly: 4-6 paragraphs) highlighting their key moments, weird obsessions, or big wins.
7. LOCATIONS: If any locations are tracked, incorporate them into the recap creatively (e.g. 'You were slaying dragons while stuck in a waiting room').

Context: 
${promptContext}`);
      
      if (!aiResponse.summary || String(aiResponse.summary).trim().length === 0) {
        throw new Error("The AI failed to generate a narrative summary.");
      }

      await saveAiRecap({
        timeframe,
        timeId,
        title: aiResponse.title,
        summary: aiResponse.summary
      });
    } catch (e: any) {
      alert("Failed to generate AI Recap: " + e.message);
    } finally {
      setIsGenerating(false);
    }
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
     activeLogs.forEach(l => {
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
     const avgYear = analyzeTimeTraveler({ timeScale: timeframe, logs: activeLogs, media: activeMedia, allMedia: media, settings });
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
     const binge = analyzeBingeFactor({ timeScale: timeframe, logs: activeLogs, media: activeMedia, allMedia: media, settings });
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
     const sunk = analyzeSunkCost({ timeScale: timeframe, logs: activeLogs, media: activeMedia, allMedia: media, settings });
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
        const mLogs = activeLogs.filter(l => l.mediaId === m.id);
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
                    <span className={`text-xs uppercase tracking-widest font-bold mt-0.5 ${MEDIA_COLORS[r.item.mediaType]?.text || 'text-zinc-400'}`}>{r.item.mediaType}</span>
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
    const habits = analyzeHabits({ timeScale: timeframe, logs: activeLogs, media: activeMedia, allMedia: media, settings });
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
    const dna = analyzeMediaDNA({ timeScale: timeframe, logs: activeLogs, media: activeMedia, allMedia: media, settings });
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
    const velocity = analyzeSessionVelocity({ timeScale: timeframe, logs: activeLogs, media: activeMedia, allMedia: media, settings });
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
    const earned = determineArchetypes({ timeScale: timeframe, logs: activeLogs, media: activeMedia, allMedia: media, settings });
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
    activeLogs.forEach(l => {
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
    const habits = analyzeHabits({ timeScale: timeframe, logs: activeLogs, media: activeMedia, allMedia: media, settings });
    if (!habits) return null;

    const dayPages: Record<string, number> = {};
    activeLogs.forEach(l => {
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
     const dna = analyzeMediaDNA({ timeScale: timeframe, logs: activeLogs, media: activeMedia, allMedia: media, settings });
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

  const renderLocationBreakdown = () => {
     const locations: Record<string, number> = {};
     let locationCount = 0;
     activeLogs.forEach(l => {
        if (l.location && l.location.trim().length > 0) {
           const loc = l.location.trim();
           locations[loc] = (locations[loc] || 0) + 1;
           locationCount++;
        }
     });

     if (locationCount === 0) return null;

     const sorted = Object.entries(locations).sort((a,b) => b[1] - a[1]);

     return (
        <div className="bg-zinc-900/50 border border-white/5 p-6 rounded-3xl">
           <h3 className="text-lg font-black text-white mb-6 flex items-center gap-3">
             <Map className="w-5 h-5 text-zinc-400" />
             Scouted Locations
           </h3>
           <div className="space-y-4">
              {sorted.map(([loc, count], idx) => (
                 <div key={idx} className="flex justify-between items-center group">
                    <div className="flex items-center gap-3">
                       <div className="w-2 h-2 rounded-full bg-zinc-600 group-hover:bg-white transition-colors" />
                       <span className="text-sm font-bold text-zinc-300 truncate max-w-[150px]" title={loc}>{loc}</span>
                    </div>
                    <span className="text-zinc-500 font-black text-xs bg-white/5 px-2 py-1 rounded-lg border border-white/5">{count} log{count !== 1 ? 's' : ''}</span>
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
                           <h2 className="text-5xl md:text-8xl font-black text-white tracking-tighter leading-[0.9]">
                             {currentRecap ? currentRecap.title : "Unwritten History"}
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

                      <div className="text-xl md:text-2xl text-zinc-400 relative z-10 leading-relaxed font-light">
                         {currentRecap ? (
                            <div className={`prose prose-invert prose-lg md:prose-xl max-w-none prose-p:leading-relaxed prose-strong:text-white prose-headings:text-white prose-a:text-white prose-blockquote:border-l-4 ${timeframe === 'week' ? 'prose-orange' : (timeframe === 'month' ? 'prose-indigo' : 'prose-emerald')} prose-blockquote:bg-white/5 prose-blockquote:px-8 prose-blockquote:py-4 prose-blockquote:rounded-r-3xl`}>
                               <Markdown>{currentRecap.summary}</Markdown>
                            </div>
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
                         
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderHabitsHeatmap()}
                            <div className="space-y-6">
                               {renderTopCreator()}
                               {renderBingeSpotlight()}
                            </div>
                         </div>
                      </div>
 
                      {/* Right Side: Micro stats & Deep Dives */}
                      <div className="lg:col-span-4 space-y-6">
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
