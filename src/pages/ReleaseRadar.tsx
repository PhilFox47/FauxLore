import React, { useMemo, useState, useEffect } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { CalendarClock, Clock, Edit2 } from 'lucide-react';
import { isSameDay, format, isAfter, isPast, isToday } from 'date-fns';
import { MediaDetailModal } from '../components/MediaDetailModal';
import { MediaFormModal } from '../components/MediaFormModal';
import { MediaItem } from '../types/schema';

function Countdown({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, minutes: number, seconds: number } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = new Date(targetDate).getTime() - new Date().getTime();
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else {
        setTimeLeft(null);
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  if (!timeLeft) return null;

  return (
    <div className="grid grid-cols-4 gap-2 md:gap-4 mt-auto">
      {[
        { label: 'Days', value: timeLeft.days },
        { label: 'Hours', value: timeLeft.hours.toString().padStart(2, '0') },
        { label: 'Minutes', value: timeLeft.minutes.toString().padStart(2, '0') },
        { label: 'Seconds', value: timeLeft.seconds.toString().padStart(2, '0') },
      ].map(unit => (
        <div key={unit.label} className="bg-black/50 border border-white/5 rounded-xl p-2 md:p-3 flex flex-col items-center justify-center shadow-inner">
          <span className="text-xl md:text-3xl font-black text-white font-mono drop-shadow-md">{unit.value}</span>
          <span className="text-[9px] md:text-[10px] text-blue-400/80 uppercase tracking-[0.2em] font-bold mt-1 max-w-full truncate">{unit.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ReleaseRadar() {
  const { media, logs, saveMediaItem, deleteMediaItem } = useMediaContext();
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  /**
   * Everything the user is waiting on, not just everything unreleased.
   *
   * A series you are caught up on is waiting exactly as much as a game that has
   * not shipped — the only difference is that the thing being awaited is one
   * episode rather than the whole work. Caught Up entries therefore belong here
   * too, but only once the source has actually named a date: without one there
   * is nothing to count down to and the row would just be a title with a shrug.
   */
  const radarItems = useMemo(() => {
    const waiting = media.filter(
      (m) =>
        m.status === 'Unreleased' ||
        ((m.status === 'Caught Up' || m.status === 'On Hold') && !!m.nextReleaseAt),
    );
    const due = (m: MediaItem) => {
      const at = m.status === 'Unreleased' ? m.expectedReleaseDate : (m.nextReleaseAt || m.expectedReleaseDate);
      const t = at ? new Date(at).getTime() : NaN;
      // Undated entries sort last rather than being dropped: an announced game
      // with no date is still something you are waiting for.
      return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
    };
    return [...waiting].sort((a, b) => due(a) - due(b));
  }, [media]);

  if (radarItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-12 text-center h-[50vh]">
        <div className="w-20 h-20 bg-blue-500/10 rounded-[2rem] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(59,130,246,0.15)] border border-blue-500/20">
          <CalendarClock className="w-10 h-10 text-blue-400" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2 tracking-tight">No Upcoming Releases</h2>
        <p className="text-zinc-500 max-w-sm mb-6 text-sm">
          Nothing unreleased, and nothing you are caught up on has a date announced yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex justify-between items-end mb-8 mt-4">
        <div>
          <h1 className="text-4xl sm:text-5xl font-black px-1 tracking-tight bg-gradient-to-br from-blue-400 via-blue-200 to-indigo-400 bg-clip-text text-transparent drop-shadow-sm">Release Radar</h1>
          <p className="text-blue-300/60 mt-2 px-2 font-medium tracking-wide">Everything you are waiting on — launches, and the next episode of what you are caught up with.</p>
        </div>
      </div>

      <div className="relative space-y-12 pb-10">
        {radarItems.map((item, index) => {
          // What this row is actually waiting for. For an unreleased entry that
          // is the work itself; for one you are caught up on it is the next
          // episode or chapter, which is a different date and a different noun.
          const awaitingNext = item.status !== 'Unreleased' && !!item.nextReleaseAt;
          const awaitedAt = awaitingNext ? item.nextReleaseAt! : item.expectedReleaseDate;
          const hasDate = !!awaitedAt;
          const releaseDate = hasDate ? new Date(awaitedAt!) : null;
          // When the source could only manage "Q4 2026", say that rather than
          // inventing a day it never committed to.
          let label = item.releaseDateLabel || "TBD";
          let labelColor = "text-zinc-500";
          let cardGlow = "";

          if (hasDate) {
            if (isToday(releaseDate!)) {
              label = "OUT TODAY!";
              labelColor = "text-green-400 font-bold drop-shadow-[0_0_5px_rgba(74,222,128,0.8)]";
              cardGlow = "hover:border-green-500/50 shadow-[0_0_30px_rgba(74,222,128,0.1)]";
            } else if (isPast(releaseDate!)) {
              label = `Released on ${format(releaseDate!, 'MMM do, yyyy')}`;
              labelColor = "text-emerald-500/70";
            } else {
              // The two now travel together for an imprecise date: the estimate
              // so the countdown has something to work with, the wording so the
              // headline does not promise a day the source never gave.
              label = awaitingNext
                ? `${item.nextReleaseLabel || 'Next'} on ${format(releaseDate!, 'MMMM do, yyyy')}`
                : (item.releaseDateLabel || format(releaseDate!, 'MMMM do, yyyy'));
              labelColor = "text-blue-300 drop-shadow-[0_0_5px_rgba(147,197,253,0.5)]";
              cardGlow = "hover:border-blue-500/50 hover:shadow-[0_0_40px_rgba(59,130,246,0.15)]";
            }
          }

          return (
            <div key={item.id} className="group relative">
              <div className={`bg-[#0c0c0e] border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-8 lg:gap-12 items-stretch transition-all duration-500 cursor-pointer ${cardGlow}`} onClick={() => setSelectedItem(item)}>
                
                {/* Large Hype Cover */}
                <div className="w-full md:w-56 lg:w-72 shrink-0 rounded-2xl overflow-hidden shadow-2xl aspect-[2/3] relative group-hover:-translate-y-2 transition-transform duration-500">
                  <img src={item.coverImageUrl || "https://images.unsplash.com/photo-1618519764611-bd0823006228?auto=format&fit=crop&q=80&w=400"} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={item.title} referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                    <span className="text-xs font-black uppercase tracking-[0.2em] bg-blue-500/20 text-blue-300 px-3 py-1.5 rounded-lg backdrop-blur-md border border-blue-500/30">
                      {item.mediaType}
                    </span>
                    {awaitingNext && (
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-amber-500/20 text-amber-300 px-2.5 py-1.5 rounded-lg backdrop-blur-md border border-amber-500/30">
                        Caught up
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Information and Countdown */}
                <div className="flex flex-col flex-1 py-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className={`w-4 h-4 ${hasDate && isToday(releaseDate!) ? 'text-green-400' : 'text-blue-400'}`} />
                    <span className={`text-xs md:text-sm tracking-widest uppercase ${labelColor}`}>{label}</span>
                  </div>
                  
                  <h3 className="font-black text-3xl md:text-4xl lg:text-5xl text-white leading-tight mb-4 tracking-tight drop-shadow-md group-hover:text-blue-400 transition-colors">{item.title}</h3>
                  
                  <div className="flex flex-wrap gap-2 mb-6">
                    {item.platforms?.map(p => (
                      <span key={p} className="text-[10px] font-bold px-2.5 py-1 rounded-md border border-white/10 text-zinc-300 bg-white/5 uppercase tracking-wide">{p}</span>
                    ))}
                    {item.creator && (
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-md text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                         <Edit2 className="w-3 h-3" /> {item.creator}
                      </span>
                    )}
                  </div>

                  {item.description && (
                    <p className="text-zinc-400 leading-relaxed text-sm lg:text-base line-clamp-3 mb-8 italic border-l-2 border-white/10 pl-4">
                      "{item.description}"
                    </p>
                  )}
                  
                  {/* Countdown Zone */}
                  {hasDate && !isPast(releaseDate!) && (
                     <Countdown targetDate={awaitedAt!} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedItem && (
        <MediaDetailModal
          isOpen={true}
          item={selectedItem}
          logs={logs.filter(l => l.mediaId === selectedItem.id)}
          onClose={() => setSelectedItem(null)}
          onEdit={(item) => {
            setSelectedItem(null);
            setEditingItem(item);
            setIsEditModalOpen(true);
          }}
        />
      )}

      {isEditModalOpen && (
        <MediaFormModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingItem(null);
          }}
          onSave={saveMediaItem}
          onDelete={deleteMediaItem}
          initialData={editingItem || undefined}
        />
      )}
    </div>
  );
}
