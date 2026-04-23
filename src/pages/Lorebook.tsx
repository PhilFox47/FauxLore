import React, { useState } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { BookOpen, Search, Filter } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { MEDIA_COLORS } from '../types/schema';
import { cn } from '../lib/utils';

export function Lorebook() {
  const { logs, media } = useMediaContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('All');

  const historicalLogs = logs.filter(l => !l.timestamp.startsWith('1970-01-01') && l.note && l.note.trim().length > 0);

  const getMediaForItem = (mediaId: string) => media.find(m => m.id === mediaId);

  const filteredLogs = historicalLogs.filter(log => {
    const mediaItem = getMediaForItem(log.mediaId);
    if (!mediaItem) return false;

    if (filterType !== 'All' && mediaItem.mediaType !== filterType) return false;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!log.note?.toLowerCase().includes(query) && !mediaItem.title.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3 tracking-tight">
            <BookOpen className="w-8 h-8 text-orange-400" />
            The Lorebook
          </h2>
          <p className="text-zinc-400 mt-2">Your complete journal across all media and universes.</p>
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          <select 
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          >
            <option value="All">All Types</option>
            <option value="Game">Games</option>
            <option value="Book">Books</option>
            <option value="Movie">Movies</option>
            <option value="Series">Series</option>
            <option value="Manga">Manga</option>
            <option value="Comic">Comics</option>
            <option value="Visual Novel">Visual Novels</option>
          </select>

          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search thoughts, media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-white focus:outline-none focus:border-orange-500 w-full"
            />
          </div>
        </div>
      </header>

      {filteredLogs.length === 0 ? (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-12 text-center text-zinc-500 mt-8">
          No journal entries found matching your search.
        </div>
      ) : (
        <div className="space-y-6">
          {filteredLogs.map(log => {
            const mediaItem = getMediaForItem(log.mediaId);
            if (!mediaItem) return null;
            const colors = MEDIA_COLORS[mediaItem.mediaType];

            return (
              <div key={log.id} className="group relative flex gap-6">
                
                {/* Timeline line */}
                <div className="absolute top-8 bottom-[-24px] left-[39px] w-px bg-white/5 group-last:hidden" />
                
                {/* Date bubble */}
                <div className="shrink-0 w-20 pt-2 text-right">
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{format(parseISO(log.timestamp), 'MMM')}</div>
                  <div className="text-2xl font-black text-white">{format(parseISO(log.timestamp), 'dd')}</div>
                  <div className="text-xs text-zinc-600 font-mono mt-1">{format(parseISO(log.timestamp), 'yyyy')}</div>
                </div>

                {/* Entry Card */}
                <div className={cn("flex-1 bg-zinc-900/50 border border-white/5 p-6 rounded-2xl relative shadow-xl hover:bg-zinc-900/80 transition-colors pointer-events-auto")}>
                  {/* Decorative dot */}
                  <div className={cn("absolute left-[-29px] top-4 w-3 h-3 rounded-full border border-black", colors.bg, colors.shadow)} />
                  
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-4">
                      {mediaItem.coverImageUrl && (
                        <div className="w-12 h-16 shrink-0 rounded bg-zinc-800 shadow-md border border-white/10 overflow-hidden">
                          <img src={mediaItem.coverImageUrl} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div>
                        <div className={cn("text-xs font-bold uppercase tracking-wider mb-1", colors.text)}>{mediaItem.mediaType}</div>
                        <h3 className="text-lg font-bold text-white leading-tight">{mediaItem.title}</h3>
                        <div className="text-xs font-mono text-zinc-500 mt-1">
                          +{log.delta} {log.metricType}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                    <p className="text-zinc-300 leading-relaxed text-sm italic">"{log.note}"</p>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
