import React, { useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts';
import { format, subDays, isAfter } from 'date-fns';
import { BarChart3, DatabaseZap } from 'lucide-react';
import { calculateScaledPages, calculateScaledDelta } from '../lib/scaling';

export function Statistics() {
  const { logs, media } = useMediaContext();

  const totalMasterPages = useMemo(() => {
    return media.reduce((acc, current) => acc + calculateScaledPages(current), 0);
  }, [media]);

  const activityData = useMemo(() => {
    // Generate last 7 days
    const days = Array.from({length: 7}).map((_, i) => {
      const d = subDays(new Date(), 6 - i);
      return { 
        dateStr: format(d, 'yyyy-MM-dd'),
        display: format(d, 'EEE'),
        count: 0 // Will store master pages volume instead of absolute increments
      };
    });

    const cutoff = subDays(new Date(), 7);
    logs.forEach(log => {
      const logDate = new Date(log.timestamp);
      if (isAfter(logDate, cutoff)) {
        const logDateStr = format(logDate, 'yyyy-MM-dd');
        const day = days.find(d => d.dateStr === logDateStr);
        if (day) {
          const item = media.find(m => m.id === log.mediaId);
          if (item) {
            day.count += calculateScaledDelta(log.delta || 1, item);
          } else {
            day.count += log.delta || 1;
          }
        }
      }
    });

    return days;
  }, [logs, media]);

  const typeDistribution = useMemo(() => {
    // Changed this to aggregate Master Pages instead of pure media count
    const counts = media.reduce((acc, current) => {
      const pages = calculateScaledPages(current);
      acc[current.mediaType] = (acc[current.mediaType] || 0) + pages;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [media]);

  return (
    <>
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Activity Map</h2>
          <p className="text-zinc-500 text-sm">Deep analysis of your media consumption habits.</p>
        </div>
        <div className="bg-indigo-500/10 border border-indigo-500/20 px-6 py-3 rounded-2xl flex items-center gap-4">
          <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
            <DatabaseZap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-indigo-400/80 uppercase tracking-wider">Total Master Pages</p>
            <p className="text-2xl font-black text-white leading-none">{totalMasterPages.toLocaleString()}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4">
        {/* Activity Chart */}
        <div className="col-span-12 lg:col-span-8 bg-zinc-900/50 border border-white/5 rounded-3xl p-6 flex flex-col">
          <h4 className="text-sm font-bold text-zinc-400 mb-6 flex items-center gap-2">
             <BarChart3 className="w-4 h-4 text-indigo-400" />
             Activity Last 7 Days
          </h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="display" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff' }}
                  itemStyle={{ color: '#6366f1', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="count" stroke="#6366f1" fillOpacity={1} fill="url(#colorCount)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Media Distribution Chart */}
        <div className="col-span-12 lg:col-span-4 bg-zinc-900/50 border border-white/5 rounded-3xl p-6 flex flex-col">
          <h4 className="text-sm font-bold text-zinc-400 mb-6 flex items-center gap-2">
             Library Composition
          </h4>
          <div className="h-64 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeDistribution} layout="vertical" margin={{ left: 40, top: 0, right: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
                <XAxis type="number" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} hide />
                <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} width={80} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff' }}
                />
                <Bar dataKey="value" fill="#fb923c" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-4 flex items-center justify-between group hover:bg-white/5 transition-all cursor-pointer mt-2">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <span className="text-sm font-medium">Coming Soon: Deep Taxonomy & Yearly Wraps</span>
          </div>
        </div>
      </div>
    </>
  );
}
