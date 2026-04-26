import React, { useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { MediaCard } from '../components/MediaCard';
import { CalendarClock, Clock } from 'lucide-react';
import { isSameDay, format, isAfter, isPast, isToday } from 'date-fns';

export function ReleaseRadar() {
  const { media } = useMediaContext();

  const radarItems = useMemo(() => {
    return media.filter(m => m.status === 'Unreleased').sort((a, b) => {
      const dateA = a.expectedReleaseDate ? new Date(a.expectedReleaseDate).getTime() : 9999999999999;
      const dateB = b.expectedReleaseDate ? new Date(b.expectedReleaseDate).getTime() : 9999999999999;
      return dateA - dateB;
    });
  }, [media]);

  if (radarItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
          <CalendarClock className="w-8 h-8 text-zinc-600" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">No Upcoming Releases</h2>
        <p className="text-zinc-500 max-w-sm mb-6">
          You don't have any unreleased media tracked.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-black text-blue-400 px-1 tracking-tight">Release Radar</h1>
          <p className="text-blue-300/60 mt-1 px-1">Upcoming drops and launches.</p>
        </div>
      </div>

      <div className="relative border-l border-white/10 ml-4 md:ml-8 space-y-12 pb-10">
        {radarItems.map((item, index) => {
          const hasDate = !!item.expectedReleaseDate;
          const releaseDate = hasDate ? new Date(item.expectedReleaseDate!) : null;
          let label = "TBD";
          let labelColor = "text-zinc-500";
          let dotColor = "bg-zinc-700";

          if (hasDate) {
            if (isToday(releaseDate!)) {
              label = "OUT TODAY!";
              labelColor = "text-green-400 font-bold";
              dotColor = "bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]";
            } else if (isPast(releaseDate!)) {
              label = `Released on ${format(releaseDate!, 'MMM do, yyyy')}`;
              labelColor = "text-emerald-500/70";
              dotColor = "bg-emerald-600/50";
            } else {
              label = format(releaseDate!, 'MMMM do, yyyy');
              labelColor = "text-blue-200";
              dotColor = "bg-blue-500";
            }
          }

          return (
            <div key={item.id} className="relative pl-8 md:pl-12 group">
              <div className={`absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full ${dotColor} border-2 border-[#111113] z-10 transition-transform group-hover:scale-150`} />
              
              <div className="bg-[#111113] border border-white/5 rounded-2xl p-5 flex flex-col md:flex-row gap-6 items-start hover:border-blue-500/20 transition-colors">
                <div className="w-24 md:w-32 shrink-0">
                  <MediaCard item={item} onClick={() => {}} />
                </div>
                
                <div className="flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-zinc-500" />
                    <span className={`text-sm ${labelColor}`}>{label}</span>
                  </div>
                  <h3 className="font-bold text-2xl text-white leading-tight mb-2">{item.title}</h3>
                  <div className="flex gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/10 text-zinc-300 uppercase tracking-wider">{item.mediaType}</span>
                    {item.platforms?.slice(0,2).map(p => (
                      <span key={p} className="text-xs font-medium px-2 py-0.5 rounded border border-white/10 text-zinc-400">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
