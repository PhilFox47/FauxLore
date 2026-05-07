import React, { useState, useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Cell } from 'recharts';
import { format, subDays, isAfter, startOfDay } from 'date-fns';
import { BarChart3, DatabaseZap, Clock, ListChecks, Calendar, Target, Activity, Zap, MapPin } from 'lucide-react';
import { calculateScaledPages, calculateScaledDelta } from '../lib/scaling';
import { calculateNativeUnits, NATIVE_UNIT_LABELS } from '../lib/rpgSystem';
import { ProgressLog, MediaItem } from '../types/schema';
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

    return {
      totalMasterPages: Math.floor(pages),
      totalLogs: filteredLogs.length,
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
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total Progress Updates</p>
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
                    <Bar dataKey="value" name="Master Pages" fill="#fb923c" radius={[0, 4, 4, 0]} barSize={20} />
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
    </div>
  );
}
