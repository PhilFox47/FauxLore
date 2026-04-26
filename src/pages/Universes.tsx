import React, { useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { MediaCard } from '../components/MediaCard';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';

export function Universes() {
  const { media } = useMediaContext();

  const franchises = useMemo(() => {
    const fnMap = new Map<string, typeof media>();
    media.forEach(m => {
      if (m.franchises && m.franchises.length > 0) {
        m.franchises.forEach(f => {
          if (!fnMap.has(f)) fnMap.set(f, []);
          fnMap.get(f)!.push(m);
        });
      }
    });

    const entries = Array.from(fnMap.entries()).map(([name, items]) => {
      const sorted = [...items].sort((a, b) => {
        const yearA = a.year || 9999;
        const yearB = b.year || 9999;
        return yearA - yearB;
      });
      return { name, items: sorted };
    });

    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }, [media]);

  if (franchises.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
          <Search className="w-8 h-8 text-zinc-600" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">No Universes Found</h2>
        <p className="text-zinc-500 max-w-sm mb-6">
          You haven't assigned any franchises to your media yet. Edit a media item to add a franchise!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-black text-white px-1 tracking-tight">Universes</h1>
          <p className="text-zinc-400 mt-1 px-1">Cross-media continuity hubs.</p>
        </div>
      </div>

      <div className="space-y-12">
        {franchises.map(franchise => (
          <div key={franchise.name} className="bg-[#111113] border border-white/5 rounded-2xl p-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
              <h2 className="text-2xl font-bold text-orange-500">{franchise.name}</h2>
              <span className="text-sm font-medium text-zinc-500 px-3 py-1 bg-white/5 rounded-full">{franchise.items.length} Entries</span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {franchise.items.map((item, idx) => (
                <div key={item.id} className="relative group">
                  <div className="absolute top-2 left-2 w-6 h-6 bg-black/80 backdrop-blur-md rounded-full z-10 flex items-center justify-center border border-white/10 text-xs font-bold text-white shadow-2xl">
                    {idx + 1}
                  </div>
                  <MediaCard item={item} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
