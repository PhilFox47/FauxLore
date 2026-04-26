import React, { useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { MediaCard } from '../components/MediaCard';
import { Skull } from 'lucide-react';

export function Graveyard() {
  const { media } = useMediaContext();

  const droppedMedia = useMemo(() => {
    return media.filter(m => m.status === 'Dropped').sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [media]);

  if (droppedMedia.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
          <Skull className="w-8 h-8 text-zinc-600" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">The Graveyard is Empty</h2>
        <p className="text-zinc-500 max-w-sm mb-6">
          You haven't abandoned any quests... yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-black text-rose-500 px-1 tracking-tight">The Graveyard</h1>
          <p className="text-rose-400/60 mt-1 px-1">Where unfinished journeys rest in peace.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {droppedMedia.map(item => (
          <div key={item.id} className="bg-[#111113] border border-red-900/20 rounded-2xl p-4 flex flex-col grayscale hover:grayscale-0 transition-all duration-500 hover:border-red-900/50">
            <div className="flex gap-4">
              <div className="w-24 shrink-0">
                <MediaCard item={item} />
              </div>
              <div className="flex flex-col flex-1">
                <h3 className="font-bold text-white line-clamp-2 leading-tight">{item.title}</h3>
                <span className="text-xs font-medium text-rose-500 mt-1 bg-rose-500/10 self-start px-2 py-0.5 rounded border border-rose-500/20">Dropped</span>
                <p className="text-zinc-500 text-sm mt-3 line-clamp-3">
                  <span className="font-semibold text-zinc-400">Cause of death:</span> {item.dropReason || "Unknown reasons"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
