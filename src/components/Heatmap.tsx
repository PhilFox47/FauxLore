import React, { useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { subDays, format, isSameDay } from 'date-fns';

export function GithubHeatmap() {
  const { logs, media } = useMediaContext();

  const activityData = useMemo(() => {
    // Generate dates for the last 365 days
    const today = new Date();
    const daysToShow = 364; // + today = 365
    
    // We want to map each day to an activity score.
    const dayMap = new Map<string, number>();
    
    // Create baseline
    for (let i = daysToShow; i >= 0; i--) {
      const d = subDays(today, i);
      dayMap.set(format(d, 'yyyy-MM-dd'), 0);
    }
    
    // Add logs mapping
    logs.forEach(log => {
      if (log.timestamp.startsWith('1970')) return;
      const key = format(new Date(log.timestamp), 'yyyy-MM-dd');
      if (dayMap.has(key)) {
        dayMap.set(key, dayMap.get(key)! + 1);
      }
    });

    // Add media creation to activity
    media.forEach(m => {
      const key = format(new Date(m.createdAt || new Date()), 'yyyy-MM-dd');
      if (dayMap.has(key)) {
        dayMap.set(key, dayMap.get(key)! + 2); // adding media is weighted stronger
      }
    });

    // Chunk by weeks
    const weeks: { date: string, count: number }[][] = [];
    let currentWeek: { date: string, count: number }[] = [];
    
    // Day 0 is 364 days ago
    Array.from(dayMap.entries()).forEach(([date, count]) => {
      currentWeek.push({ date, count });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });
    
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  }, [logs, media]);

  return (
    <div className="bg-[#111113] border border-white/5 rounded-2xl p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Annual Contribution</h3>
        <span className="text-xs text-zinc-500">Last 365 days</span>
      </div>
      
      <div className="flex justify-center w-full overflow-x-auto pb-4 hide-scrollbar">
        <div className="flex gap-1 min-w-max">
          {activityData.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-1">
              {week.map(day => {
                let colorClass = "bg-zinc-800";
                if (day.count > 10) colorClass = "bg-orange-500";
                else if (day.count > 5) colorClass = "bg-orange-600";
                else if (day.count > 2) colorClass = "bg-orange-700/80";
                else if (day.count > 0) colorClass = "bg-orange-900/60";

                return (
                  <div
                    key={day.date}
                    title={`${day.count} activities on ${format(new Date(day.date), 'MMM do, yyyy')}`}
                    className={`w-3 h-3 rounded-sm ${colorClass} hover:ring-1 hover:ring-white/50 transition-all cursor-pointer`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 justify-end text-xs text-zinc-500">
        Less
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-sm bg-zinc-800" />
          <div className="w-3 h-3 rounded-sm bg-orange-900/60" />
          <div className="w-3 h-3 rounded-sm bg-orange-700/80" />
          <div className="w-3 h-3 rounded-sm bg-orange-600" />
          <div className="w-3 h-3 rounded-sm bg-orange-500" />
        </div>
        More
      </div>
    </div>
  );
}
