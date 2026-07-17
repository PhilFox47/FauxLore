import React, { useState, useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Cell } from 'recharts';
import { format, subDays, isAfter, startOfDay } from 'date-fns';
import { BarChart3, DatabaseZap, Clock, ListChecks, Calendar, Target, Activity, Zap, MapPin, Sparkles, GitBranch, Star, Layers } from 'lucide-react';
import { calculateScaledPages, calculateScaledDelta } from '../lib/scaling';
import { calculateNativeUnits, NATIVE_UNIT_LABELS } from '../lib/rpgSystem';
import { groupLogsIntoSessions } from '../lib/sessions';
import { aggregateStatusHistory } from '../lib/history';
import { ProgressLog, MediaItem, MEDIA_HEX } from '../types/schema';
import { GithubHeatmap } from '../components/Heatmap';

type DateRange = '7days' | '30days' | '90days' | '1year' | 'all' | 'custom';

export function Statistics() {
  const { logs, media, settings } = useMediaContext();
  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [mediaTypeFilters, setMediaTypeFilters] = useState<string[]>(['All']);

  const MEDIA_TYPES = ['Game', 'Book', 'Visual Novel', 'Manga', 'Series', 'Movie', 'Comic', 'Audiobook'];
  const [isMediaDropdownOpen, setIsMediaDropdownOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsMediaDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMediaType = (type: string) => {
    if (mediaTypeFilters.includes(type)) {
      setMediaTypeFilters(mediaTypeFilters.filter(t => t !== type));
    } else {
      setMediaTypeFilters([...mediaTypeFilters.filter(t => t !== 'All'), type]);
    }
  };

  const toggleAllMedia = () => {
    setMediaTypeFilters(['All']);
  };

  // Apply Date Filter to Logs
  const filteredLogs = useMemo(() => {
    const cutoffMap: Record<DateRange, number | null> = {
      '7days': 7,
      '30days': 30,
      '90days': 90,
      '1year': 365,
      'all': null,
      'custom': null
    };
    
    const cutoffDays = cutoffMap[dateRange];
    const cutoffDate = cutoffDays ? subDays(new Date(), cutoffDays) : null;
    
    return logs.filter(log => {
      // 1. Exclude historical logs
      if (log.isHistoric) return false;
      if (log.timestamp.startsWith('1970-01-01')) return false;

      const logDate = new Date(log.timestamp);

      // 2. Date Range Filter
      if (dateRange === 'custom') {
        if (customStartDate && logDate < new Date(customStartDate)) return false;
        if (customEndDate && logDate > new Date(customEndDate + 'T23:59:59')) return false;
      } else {
        if (cutoffDate && !isAfter(logDate, cutoffDate)) return false;
      }
      
      // 3. Media Filter
      if (!mediaTypeFilters.includes('All') && mediaTypeFilters.length > 0) {
        const parentMedia = media.find(m => m.id === log.mediaId);
        if (!parentMedia || !mediaTypeFilters.includes(parentMedia.mediaType)) return false;
      }
      return true;
    });
  }, [logs, media, dateRange, mediaTypeFilters, customStartDate, customEndDate]);

  // Activity Over Time Mapping
  const activityData = useMemo(() => {
    let daysToShow = dateRange === 'all' ? 365 
      : dateRange === '1year' ? 365
      : dateRange === '90days' ? 90
      : dateRange === '30days' ? 30 : 7;

    let endD = new Date();
    
    if (dateRange === 'custom') {
      const sDate = customStartDate ? new Date(customStartDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
      const eDate = customEndDate ? new Date(customEndDate) : new Date();
      endD = eDate;
      const diffTime = Math.abs(eDate.getTime() - sDate.getTime());
      daysToShow = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      if (daysToShow > 365) daysToShow = 365; // cap to 1 year for performance
    }

    const days = Array.from({length: daysToShow}).map((_, i) => {
      const d = startOfDay(subDays(endD, (daysToShow - 1) - i));
      return { 
        dateStr: format(d, 'yyyy-MM-dd'),
        display: format(d, daysToShow > 35 ? 'MMM d' : 'EEE, MMM d'),
        count: 0
      };
    });

    const dayMap = new Map(days.map(d => [d.dateStr, d]));

    filteredLogs.forEach(log => {
      const logDateStr = format(new Date(log.timestamp), 'yyyy-MM-dd');
      const day = dayMap.get(logDateStr);
      if (day) {
        const item = media.find(m => m.id === log.mediaId);
        if (item) day.count += calculateScaledDelta(log.delta || 1, item, settings);
      }
    });

    return days;
  }, [filteredLogs, media, settings, dateRange, customStartDate, customEndDate]);

  // Aggregate Key Metrics
  const { totalMasterPages, totalLogs, busiestDay, nativeStats } = useMemo(() => {
    let pages = 0;
    
    // Day aggregation for busiest
    const dayRollup: Record<string, number> = {};
    
    // Native units breakdown
    const nativeRollup: Record<string, number> = {};

    filteredLogs.forEach(log => {
      const item = media.find(m => m.id === log.mediaId);
      if (item) {
         const deltaPages = calculateScaledDelta(log.delta || 1, item, settings);
         pages += deltaPages;
         
         const dateKey = format(new Date(log.timestamp), 'yyyy-MM-dd');
         dayRollup[dateKey] = (dayRollup[dateKey] || 0) + deltaPages;
      }
    });

    // Native total
    if (!mediaTypeFilters.includes('All')) {
      mediaTypeFilters.forEach(type => {
        const unit = NATIVE_UNIT_LABELS[type as keyof typeof NATIVE_UNIT_LABELS];
        if (unit) {
          nativeRollup[type + '_' + unit] = calculateNativeUnits(filteredLogs, media, type as any);
        }
      });
    }
    
    let maxDay = { date: '-', count: 0 };
    Object.entries(dayRollup).forEach(([date, count]) => {
       if (count > maxDay.count) {
          maxDay = { date: format(new Date(date), 'MMM do'), count: Math.floor(count) };
       }
    });

    // Count tracking sessions rather than raw logs: back-to-back progress on the same media
    // (<6h apart, nothing else in between) is one session, so live-logging doesn't inflate this.
    const sessionCount = groupLogsIntoSessions(filteredLogs).length;

    return {
      totalMasterPages: Math.floor(pages),
      totalLogs: sessionCount,
      busiestDay: maxDay,
      nativeStats: nativeRollup
    };
  }, [filteredLogs, media, settings, mediaTypeFilters]);

  // Library Composition Data (Filter based on timeframe activity)
  const typeDistribution = useMemo(() => {
    // Only count media that was active in the filtered timeframe
    const activeMediaIds = new Set(filteredLogs.map(l => l.mediaId));
    const activeMediaInTimeframe = media.filter(m => activeMediaIds.has(m.id));

    const counts = activeMediaInTimeframe.reduce((acc, current) => {
      if (!mediaTypeFilters.includes('All') && !mediaTypeFilters.includes(current.mediaType)) return acc;
      
      // We only count the pages logged in this period for "Volume"
      const activityInPeriod = filteredLogs
        .filter(l => l.mediaId === current.id)
        .reduce((sum, l) => sum + calculateScaledDelta(l.delta, current, settings), 0);
      
      if (activityInPeriod > 0) {
        acc[current.mediaType] = (acc[current.mediaType] || 0) + activityInPeriod;
      }
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [media, filteredLogs, settings, mediaTypeFilters]);

  // Status Distribution Data (Filter based on timeframe activity)
  const statusDistribution = useMemo(() => {
    // Only count media that had logs in the filtered timeframe
    const activeMediaIds = new Set(filteredLogs.map(l => l.mediaId));
    const activeMediaInTimeframe = media.filter(m => activeMediaIds.has(m.id));

    const counts = activeMediaInTimeframe.reduce((acc, current) => {
      if (!mediaTypeFilters.includes('All') && !mediaTypeFilters.includes(current.mediaType)) return acc;
      
      // Determine what status the item had *during* this period or at least it was active
      acc[current.status] = (acc[current.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [media, filteredLogs, mediaTypeFilters]);

  // Location Distribution
  const locationDistribution = useMemo(() => {
    const counts = filteredLogs.reduce((acc, log) => {
      if (!log.location || !log.location.trim()) return acc;
      const mediaItem = media.find(m => m.id === log.mediaId);
      if (!mediaItem) return acc;
      if (!mediaTypeFilters.includes('All') && !mediaTypeFilters.includes(mediaItem.mediaType)) return acc;

      const loc = log.location.trim();
      const pages = calculateScaledDelta(log.delta || 1, mediaItem, settings);
      
      acc[loc] = (acc[loc] || 0) + pages;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value: Math.floor(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // top 5
  }, [filteredLogs, media, settings, mediaTypeFilters]);

  // Taste fingerprint: weight each media item's tags & genres by the Master Pages
  // consumed in the selected timeframe, so your "identity" reflects time invested.
  const tasteProfile = useMemo(() => {
    const tagW: Record<string, number> = {};
    const genreW: Record<string, number> = {};
    filteredLogs.forEach(log => {
      if (log.metricType === 'statusChange') return;
      const item = media.find(m => m.id === log.mediaId);
      if (!item) return;
      const w = calculateScaledDelta(log.delta || 1, item, settings);
      if (w <= 0) return;
      (item.tags || []).forEach(t => { if (t) tagW[t] = (tagW[t] || 0) + w; });
      (item.genres || []).forEach(g => { if (g) genreW[g] = (genreW[g] || 0) + w; });
    });
    const rank = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]);
    const tags = rank(tagW);
    const genres = rank(genreW);
    const maxTag = tags[0]?.[1] || 1;
    const maxGenre = genres[0]?.[1] || 1;
    return {
      headline: tags.slice(0, 3).map(t => t[0]),
      tags: tags.slice(0, 10).map(([name, value]) => ({ name, pct: value / maxTag })),
      genres: genres.slice(0, 8).map(([name, value]) => ({ name, pct: value / maxGenre })),
      hasData: tags.length > 0 || genres.length > 0,
    };
  }, [filteredLogs, media, settings]);

  // Pipeline & backlog health (library-wide, uses full status history — not date-filtered)
  const pipeline = useMemo(() => {
    const agg = aggregateStatusHistory(media, logs);
    const planning = media.filter(m => m.status === 'Planning').length;
    const active = media.filter(m => m.status === 'Active').length;
    const onHold = media.filter(m => m.status === 'On Hold').length;
    return { ...agg, planning, active, onHold, library: media.length };
  }, [media, logs]);

  // Rating analytics (library-wide)
  const ratingStats = useMemo(() => {
    const rated = media.filter(m => (m.userRating || 0) > 0);
    if (rated.length === 0) return null;
    const dist: Record<string, number> = {};
    [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].forEach(r => (dist[r] = 0));
    rated.forEach(m => { const k = String(m.userRating); dist[k] = (dist[k] || 0) + 1; });
    const avg = rated.reduce((s, m) => s + (m.userRating || 0), 0) / rated.length;
    // Average by genre
    const genreSum: Record<string, { sum: number; n: number }> = {};
    rated.forEach(m => (m.genres || []).forEach(g => {
      if (!genreSum[g]) genreSum[g] = { sum: 0, n: 0 };
      genreSum[g].sum += m.userRating || 0; genreSum[g].n += 1;
    }));
    const byGenre = Object.entries(genreSum).filter(([, v]) => v.n >= 3)
      .map(([g, v]) => ({ genre: g, avg: v.sum / v.n, n: v.n }))
      .sort((a, b) => b.avg - a.avg);
    const distArr = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1].map(r => ({ rating: r, n: dist[String(r)] || 0 }));
    return { count: rated.length, avg, distArr, topGenres: byGenre.slice(0, 4), lowGenres: byGenre.slice(-3).reverse() };
  }, [media]);

  // When you consume: weekday x time-of-band heatmap (respects date/type filters)
  const whenHeatmap = useMemo(() => {
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const BANDS = ['Night', 'Morning', 'Afternoon', 'Evening'];
    const grid: number[][] = DAYS.map(() => BANDS.map(() => 0));
    let max = 0;
    filteredLogs.forEach(l => {
      if (l.metricType === 'statusChange') return;
      const d = new Date(l.timestamp);
      const dow = (d.getDay() + 6) % 7; // Mon=0
      const h = d.getHours();
      const b = h < 6 ? 0 : h < 12 ? 1 : h < 17 ? 2 : h < 22 ? 3 : 0;
      grid[dow][b] += 1;
      if (grid[dow][b] > max) max = grid[dow][b];
    });
    return { DAYS, BANDS, grid, max };
  }, [filteredLogs]);

  // Tag chemistry: which tags co-occur most on your items (respects type filter via media set)
  const tagChemistry = useMemo(() => {
    const activeMediaIds = new Set(filteredLogs.map(l => l.mediaId));
    const items = media.filter(m => activeMediaIds.has(m.id));
    const pool = items.length >= 5 ? items : media; // fall back to full library if the window is thin
    const pairCounts: Record<string, number> = {};
    pool.forEach(m => {
      const tags = Array.from(new Set(m.tags || [])).sort();
      for (let i = 0; i < tags.length; i++)
        for (let j = i + 1; j < tags.length; j++)
          pairCounts[`${tags[i]}||${tags[j]}`] = (pairCounts[`${tags[i]}||${tags[j]}`] || 0) + 1;
    });
    const pairs = Object.entries(pairCounts).map(([k, n]) => ({ a: k.split('||')[0], b: k.split('||')[1], n }))
      .sort((x, y) => y.n - x.n).slice(0, 8).filter(p => p.n >= 2);
    return pairs;
  }, [filteredLogs, media]);

  const STATUS_COLORS: Record<string, string> = {
    'Active': '#10b981', // Emerald
    'Planning': '#8b5cf6', // Violet
    'Completed': '#3b82f6', // Blue
    'Extras': '#f59e0b', // Amber
    'Dropped': '#ef4444' // Red
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Statistics</h2>
          <p className="text-zinc-500 text-sm">Deep analysis of your media consumption habits.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 bg-[#18181b] border border-white/10 rounded-xl px-2 h-10 w-full sm:w-auto">
              <input 
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-transparent text-sm text-white focus:outline-none max-w-[120px]"
              />
              <span className="text-zinc-500 text-sm">to</span>
              <input 
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-transparent text-sm text-white focus:outline-none max-w-[120px]"
              />
            </div>
          )}

          <select 
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="w-full sm:w-auto bg-[#18181b] border border-white/10 text-sm font-medium text-white rounded-xl px-4 py-2 h-10 outline-none focus:border-orange-500 transition-colors cursor-pointer"
          >
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 3 Months</option>
            <option value="1year">Last Year</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Range</option>
          </select>

          <div className="relative group flex-1 sm:flex-none sm:w-48" ref={dropdownRef}>
            <button
              onClick={() => setIsMediaDropdownOpen(!isMediaDropdownOpen)}
              className="w-full bg-[#18181b] border border-white/10 rounded-xl px-4 py-2 h-10 text-sm text-white focus:outline-none focus:border-orange-500 hover:border-white/20 transition-colors cursor-pointer text-left flex items-center justify-between"
            >
              <span className="truncate">
                {mediaTypeFilters.includes('All') ? 'All Media Types' : 
                 mediaTypeFilters.length === 0 ? 'No Types' : 
                 mediaTypeFilters.join(', ')}
              </span>
            </button>

            {isMediaDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-full lg:w-48 bg-zinc-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="p-1">
                  <button
                    onClick={toggleAllMedia}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${mediaTypeFilters.includes('All') ? 'bg-orange-500 border-orange-500' : 'border-zinc-700 bg-zinc-800'}`}>
                      {mediaTypeFilters.includes('All') && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                    </div>
                    <span>All Media Types</span>
                  </button>
                  
                  <div className="h-px bg-white/10 my-1 mx-2" />

                  {MEDIA_TYPES.map(type => (
                    <button
                      key={type}
                      onClick={() => toggleMediaType(type)}
                      className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${mediaTypeFilters.includes(type) && !mediaTypeFilters.includes('All') ? 'bg-orange-500 border-orange-500' : 'border-zinc-700 bg-zinc-800'}`}>
                        {mediaTypeFilters.includes(type) && !mediaTypeFilters.includes('All') && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                      </div>
                      <span>{type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <GithubHeatmap />

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/50 border border-white/5 p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-orange-500/20 text-orange-400 rounded-xl">
            <DatabaseZap className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Master Pages ({dateRange})</p>
            <p className="text-2xl font-black text-white">{totalMasterPages.toLocaleString()}</p>
          </div>
        </div>

        {!mediaTypeFilters.includes('All') ? Object.entries(nativeStats).map(([unit, val]) => (
          <div key={unit} className="bg-zinc-900/50 border border-white/5 p-5 rounded-2xl flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{unit.split('_')[1]}</p>
              <p className="text-2xl font-black text-white">{Math.floor(val).toLocaleString()}</p>
            </div>
          </div>
        )) : (
          <div className="bg-zinc-900/50 border border-white/5 p-5 rounded-2xl flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Media Tracked</p>
              <p className="text-2xl font-black text-white">{media.length}</p>
            </div>
          </div>
        )}

        <div className="bg-zinc-900/50 border border-white/5 p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-blue-500/20 text-blue-400 rounded-xl">
            <ListChecks className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Tracking Sessions</p>
            <p className="text-2xl font-black text-white">{totalLogs.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-white/5 p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-orange-500/20 text-orange-400 rounded-xl">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Busiest Day</p>
            <p className="text-lg font-black text-white">{busiestDay.date}</p>
            <p className="text-xs text-zinc-500">{busiestDay.count} MP</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Activity Chart */}
        <div className="col-span-12 lg:col-span-8 bg-zinc-900/50 border border-white/5 rounded-3xl p-6 flex flex-col min-h-[350px]">
          <h4 className="text-sm font-bold text-zinc-400 mb-6 flex items-center gap-2">
             <BarChart3 className="w-4 h-4 text-orange-400" />
             Activity Over Time (Master Pages)
          </h4>
          <div className="w-full flex-1 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityData} margin={{ left: -20, right: 0, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="display" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} tickMargin={10} minTickGap={20} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff' }}
                  itemStyle={{ color: '#6366f1', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="count" name="Master Pages" stroke="#6366f1" fillOpacity={1} fill="url(#colorCount)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          {/* Media Distribution Chart (Only if All is selected, or multiple selected) */}
          {(mediaTypeFilters.includes('All') || mediaTypeFilters.length > 1) && (
            <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 flex flex-col flex-1 min-h-[250px]">
              <h4 className="text-sm font-bold text-zinc-400 mb-6 flex items-center gap-2">
                 <Zap className="w-4 h-4 text-orange-400" />
                 Media Volume (Master Pages)
              </h4>
              <div className="w-full flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeDistribution} layout="vertical" margin={{ left: 80, top: 0, right: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
                    <XAxis type="number" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} hide />
                    <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} width={80} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff' }}
                    />
                    <Bar dataKey="value" name="Master Pages" radius={[0, 4, 4, 0]} barSize={20}>
                      {typeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={MEDIA_HEX[entry.name as keyof typeof MEDIA_HEX]?.base || '#fb923c'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Status Distribution Chart */}
          <div className={`bg-zinc-900/50 border border-white/5 rounded-3xl p-6 flex flex-col flex-1 min-h-[250px] ${(mediaTypeFilters.includes('All') || mediaTypeFilters.length > 1) ? '' : 'h-full'}`}>
            <h4 className="text-sm font-bold text-zinc-400 mb-6 flex items-center gap-2">
               <Calendar className="w-4 h-4 text-emerald-400" />
               Status Overview (Item Count)
            </h4>
            <div className="w-full flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusDistribution} margin={{ left: -20, top: 0, right: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff' }}
                  />
                  <Bar dataKey="value" name="Total Items" radius={[4, 4, 0, 0]} barSize={40}>
                    {
                      statusDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#71717a'} />
                      ))
                    }
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Location Distribution */}
          {locationDistribution.length > 0 && (
            <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 flex flex-col flex-1 min-h-[250px]">
              <h4 className="text-sm font-bold text-zinc-400 mb-6 flex items-center gap-2">
                 <MapPin className="w-4 h-4 text-sky-400" />
                 Top Locations (Master Pages)
              </h4>
              <div className="w-full flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={locationDistribution} layout="vertical" margin={{ left: 60, top: 0, right: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
                    <XAxis type="number" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} hide />
                    <YAxis dataKey="name" type="category" stroke="#d4d4d8" fontSize={12} tickLine={false} axisLine={false} width={60} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff' }}
                    />
                    <Bar dataKey="value" name="Master Pages" fill="#38bdf8" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Taste Fingerprint */}
      {tasteProfile.hasData && (
          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
            <h4 className="text-sm font-bold text-zinc-400 mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-400" />
              Your Taste Fingerprint
            </h4>
            {tasteProfile.headline.length > 0 && (
              <p className="text-lg text-zinc-300 mb-6">
                You are:{" "}
                {tasteProfile.headline.map((h, i) => (
                  <React.Fragment key={h}>
                    {i > 0 && <span className="text-zinc-600"> · </span>}
                    <span className="font-bold text-white">{h}</span>
                  </React.Fragment>
                ))}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Defining Tags</div>
                <div className="space-y-2">
                  {tasteProfile.tags.map(t => (
                    <div key={t.name} className="flex items-center gap-3">
                      <div className="w-32 shrink-0 text-xs text-zinc-300 truncate text-right">{t.name}</div>
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.max(4, t.pct * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Top Genres</div>
                <div className="space-y-2">
                  {tasteProfile.genres.map(g => (
                    <div key={g.name} className="flex items-center gap-3">
                      <div className="w-32 shrink-0 text-xs text-zinc-300 truncate text-right">{g.name}</div>
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.max(4, g.pct * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-600 mt-5">Weighted by Master Pages consumed in the selected timeframe.</p>
          </div>
        )}

        {/* Pipeline & backlog health */}
        <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
          <h4 className="text-sm font-bold text-zinc-400 mb-1 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-orange-400" /> Pipeline &amp; Backlog Health
          </h4>
          <p className="text-[11px] text-zinc-600 mb-5">Your whole library, all time.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div><div className="text-2xl font-black text-emerald-400">{Math.round(pipeline.completionRate * 100)}%</div><div className="text-[11px] text-zinc-500 uppercase tracking-wider mt-1">Completion rate</div></div>
            <div><div className="text-2xl font-black text-red-400">{Math.round(pipeline.dropRate * 100)}%</div><div className="text-[11px] text-zinc-500 uppercase tracking-wider mt-1">Drop rate</div></div>
            <div><div className="text-2xl font-black text-violet-400">{pipeline.planning}</div><div className="text-[11px] text-zinc-500 uppercase tracking-wider mt-1">In backlog</div></div>
            <div><div className="text-2xl font-black text-white">{Math.round(pipeline.avgPlanningWait)}<span className="text-sm text-zinc-500">d</span></div><div className="text-[11px] text-zinc-500 uppercase tracking-wider mt-1">Avg wait to start</div></div>
          </div>
          {/* Funnel bar: Backlog -> Active/OnHold -> Completed -> Dropped */}
          <div className="flex w-full h-3 rounded-full overflow-hidden border border-white/10">
            {[
              { label: 'Backlog', n: pipeline.planning, c: '#8b5cf6' },
              { label: 'In progress', n: pipeline.active + pipeline.onHold, c: '#f59e0b' },
              { label: 'Completed', n: pipeline.completed, c: '#10b981' },
              { label: 'Dropped', n: pipeline.dropped, c: '#ef4444' },
            ].map((seg, i) => {
              const tot = Math.max(1, pipeline.planning + pipeline.active + pipeline.onHold + pipeline.completed + pipeline.dropped);
              return seg.n > 0 ? <div key={i} title={`${seg.label}: ${seg.n}`} style={{ width: `${(seg.n / tot) * 100}%`, backgroundColor: seg.c }} /> : null;
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500" />Backlog {pipeline.planning}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />In progress {pipeline.active + pipeline.onHold}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Completed {pipeline.completed}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Dropped {pipeline.dropped}</span>
          </div>
          {Object.keys(pipeline.avgTimeInStatus).length > 0 && (
            <div className="mt-6 pt-5 border-t border-white/5">
              <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Average time spent in each status</div>
              <div className="flex flex-wrap gap-2">
                {['Planning', 'Active', 'On Hold'].filter(s => pipeline.avgTimeInStatus[s]).map(s => (
                  <span key={s} className="text-xs px-3 py-1.5 bg-black/30 border border-white/5 rounded-lg text-zinc-300">{s}: <span className="text-white font-bold">{Math.round(pipeline.avgTimeInStatus[s])}d</span></span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rating analytics */}
        {ratingStats && (
          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
            <h4 className="text-sm font-bold text-zinc-400 mb-1 flex items-center gap-2"><Star className="w-4 h-4 text-orange-400" /> How You Rate</h4>
            <p className="text-[11px] text-zinc-600 mb-5">{ratingStats.count} rated · average <span className="text-zinc-400 font-bold">{ratingStats.avg.toFixed(2)}</span> / 5</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Distribution</div>
                <div className="space-y-1.5">
                  {ratingStats.distArr.map(d => {
                    const max = Math.max(...ratingStats.distArr.map(x => x.n)) || 1;
                    return (
                      <div key={d.rating} className="flex items-center gap-2">
                        <div className="w-8 text-right text-xs text-zinc-400 tabular-nums">{d.rating}★</div>
                        <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${(d.n / max) * 100}%` }} /></div>
                        <div className="w-6 text-xs text-zinc-500 tabular-nums">{d.n}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Rated highest by genre <span className="text-zinc-600 normal-case">(3+ items)</span></div>
                <div className="space-y-2">
                  {ratingStats.topGenres.map(g => (
                    <div key={g.genre} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-300">{g.genre}</span>
                      <span className="text-white font-bold">{g.avg.toFixed(1)}<span className="text-zinc-600 text-xs font-normal"> · {g.n}</span></span>
                    </div>
                  ))}
                  {ratingStats.topGenres.length === 0 && <div className="text-xs text-zinc-600">Not enough rated items per genre yet.</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* When you consume */}
        {whenHeatmap.max > 0 && (
          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
            <h4 className="text-sm font-bold text-zinc-400 mb-5 flex items-center gap-2"><Clock className="w-4 h-4 text-orange-400" /> When You Log</h4>
            <div className="overflow-x-auto">
              <div className="inline-grid gap-1" style={{ gridTemplateColumns: `auto repeat(${whenHeatmap.BANDS.length}, minmax(64px, 1fr))` }}>
                <div />
                {whenHeatmap.BANDS.map(b => <div key={b} className="text-[10px] text-zinc-500 uppercase tracking-wider text-center pb-1">{b}</div>)}
                {whenHeatmap.DAYS.map((day, di) => (
                  <React.Fragment key={day}>
                    <div className="text-[11px] text-zinc-500 pr-2 flex items-center justify-end">{day}</div>
                    {whenHeatmap.grid[di].map((n, bi) => {
                      const intensity = whenHeatmap.max > 0 ? n / whenHeatmap.max : 0;
                      return <div key={bi} title={`${n} logs`} className="h-8 rounded" style={{ backgroundColor: n === 0 ? 'rgba(255,255,255,0.03)' : `rgba(249,115,22,${0.15 + intensity * 0.85})` }} />;
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tag chemistry */}
        {tagChemistry.length > 0 && (
          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
            <h4 className="text-sm font-bold text-zinc-400 mb-1 flex items-center gap-2"><Layers className="w-4 h-4 text-orange-400" /> Tag Chemistry</h4>
            <p className="text-[11px] text-zinc-600 mb-5">The tag pairings that define your library.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tagChemistry.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    <span className="text-zinc-200 truncate">{p.a}</span>
                    <span className="text-zinc-600 shrink-0">+</span>
                    <span className="text-zinc-200 truncate">{p.b}</span>
                  </div>
                  <span className="text-xs text-orange-400 font-bold shrink-0 ml-2">{p.n}×</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
  );
}
