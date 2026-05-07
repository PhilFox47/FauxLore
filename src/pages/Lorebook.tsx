import React, { useState } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { BookOpen, Search, MapPin, History, PencilLine, Activity } from 'lucide-react';
import { format, parseISO, isSameDay } from 'date-fns';
import { MEDIA_COLORS } from '../types/schema';
import { cn } from '../lib/utils';

export function Lorebook() {
  const { logs, media } = useMediaContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  
  // Show all non-initialized logs (skip 1970 logs which were from data import mapping to creation initially, UNLESS they represent a valid entry)
  const getHistoricalLogs = () => {
    return logs.filter(l => !l.timestamp.startsWith('1970-01-01'));
  };

  const getMediaForItem = (mediaId: string) => media.find(m => m.id === mediaId);

  const filteredLogs = getHistoricalLogs().filter(log => {
    const mediaItem = getMediaForItem(log.mediaId);
    if (!mediaItem) return false;

    if (filterType !== 'All' && mediaItem.mediaType !== filterType) return false;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const hasNoteMatch = log.note?.toLowerCase().includes(query);
      const hasTitleMatch = mediaItem.title.toLowerCase().includes(query);
      const hasActionMatch = log.metricType.toLowerCase().includes(query);
      if (!hasNoteMatch && !hasTitleMatch && !hasActionMatch) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Group logs by day
  const groupedLogs: { [key: string]: typeof filteredLogs } = {};
  filteredLogs.forEach(log => {
      const dayKey = format(parseISO(log.timestamp), 'yyyy-MM-dd');
      if (!groupedLogs[dayKey]) groupedLogs[dayKey] = [];
      groupedLogs[dayKey].push(log);
  });
  const groupedKeys = Object.keys(groupedLogs).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3 tracking-tight">
            <BookOpen className="w-8 h-8 text-orange-400" />
            The Lorebook
          </h2>
          <p className="text-zinc-400 mt-2">The complete, chronicled journey of your conquests.</p>
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          <select 
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500 shadow-inner"
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
              placeholder="Search thoughts, quests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-white focus:outline-none focus:border-orange-500 w-full shadow-inner"
            />
          </div>
        </div>
      </header>

      {filteredLogs.length === 0 ? (
        <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-12 text-center text-zinc-500 mt-8 font-mono shadow-inner">
          No memory fragments found matching your search.
        </div>
      ) : (
        <div className="space-y-10 relative">
           <div className="absolute left-6 top-2 bottom-0 w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent z-0"></div>
           
           {groupedKeys.map((dayKey) => {
              const dayLogs = groupedLogs[dayKey];
              const dateObj = parseISO(dayKey);
              
              return (
                 <div key={dayKey} className="relative z-10">
                    <div className="flex items-center gap-4 mb-4 sticky top-4 z-20">
                       <div className="w-12 h-6 bg-black border border-white/10 rounded-full flex items-center justify-center shrink-0 shadow-md">
                          <div className="w-2 h-2 bg-zinc-600 rounded-full"></div>
                       </div>
                       <h3 className="text-zinc-300 font-bold font-display uppercase tracking-widest text-xs bg-black/60 px-3 py-1 rounded-lg backdrop-blur-md shadow-sm border border-white/5">
                          {format(dateObj, 'MMMM d, yyyy')}
                       </h3>
                    </div>
                    
                    <div className="space-y-4 ml-12">
                       {dayLogs.map((log) => {
                          const mediaItem = getMediaForItem(log.mediaId);
                          if (!mediaItem) return null;
                          const colors = MEDIA_COLORS[mediaItem.mediaType];
                          
                          const renderActionNode = () => {
                             if (log.metricType === "statusChange") {
                                const noteStr = log.note || "Updated Status";
                                const match = noteStr.match(/Status changed from (.*?) to (.*)/);
                                if (match) {
                                   const fromStatus = match[1];
                                   const toStatus = match[2];
                                   
                                   const getStatusColor = (status: string) => {
                                      switch (status) {
                                         case 'Active': return 'text-amber-400 font-black';
                                         case 'Planning': return 'text-blue-400 font-black';
                                         case 'Completed': return 'text-emerald-400 font-black drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]';
                                         case 'Extras': return 'text-orange-400 font-black drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]';
                                         case 'Dropped': return 'text-red-400 font-black';
                                         default: return 'text-white font-black';
                                      }
                                   };
                                   
                                   return (
                                      <span>Status changed from <span className={getStatusColor(fromStatus)}>{fromStatus}</span> to <span className={getStatusColor(toStatus)}>{toStatus}</span></span>
                                   );
                                }
                                return <span>{noteStr}</span>;
                             }

                             let actionWord = log.delta > 0 ? "Advanced by" : log.delta < 0 ? "Reverted by" : "Logged";
                             if (log.delta > 0) {
                                if (log.metricType === 'episodesWatched' || log.metricType === 'watchCount') {
                                   actionWord = "Watched";
                                } else if (log.metricType === 'chaptersRead' || log.metricType === 'pagesRead' || log.metricType === 'issuesRead') {
                                   actionWord = "Read";
                                } else if (log.metricType === 'playtimeHours') {
                                   actionWord = "Logged"; // "Played" is also good, but "Logged X hours" or "Played X hours"
                                }
                             } else if (log.delta < 0) {
                                if (log.metricType === 'episodesWatched' || log.metricType === 'watchCount') {
                                   actionWord = "Rewatched";
                                } else if (log.metricType === 'chaptersRead' || log.metricType === 'pagesRead' || log.metricType === 'issuesRead') {
                                   actionWord = "Reread";
                                } else if (log.metricType === 'playtimeHours') {
                                   actionWord = "Reverted";
                                }
                             }
                             
                             const absDelta = Math.abs(log.delta);
                             let unit = log.metricType as string;
                             if (unit === 'playtimeHours') {
                                actionWord = log.delta > 0 ? "Logged" : "Reverted";
                                unit = absDelta === 1 ? 'hour of playtime' : 'hours of playtime';
                             } else if (unit === 'episodesWatched') {
                                unit = absDelta === 1 ? 'episode' : 'episodes';
                             } else if (unit === 'watchCount') {
                                unit = absDelta === 1 ? 'time' : 'times';
                             } else if (unit === 'chaptersRead') {
                                unit = absDelta === 1 ? 'chapter' : 'chapters';
                             } else if (unit === 'pagesRead') {
                                unit = absDelta === 1 ? 'page' : 'pages';
                             } else if (unit === 'issuesRead') {
                                unit = absDelta === 1 ? 'issue' : 'issues';
                             }

                             return <span><span className="font-bold text-white">{actionWord}</span> {absDelta} {unit}</span>;
                          };

                          return (
                             <div key={log.id} className="bg-zinc-900/50 border border-white/5 p-4 rounded-2xl flex flex-col sm:flex-row gap-4 hover:border-white/10 transition-colors shadow-sm hover:shadow-md relative group overflow-hidden">
                                {log.isHistoric && (
                                   <div className="absolute top-0 right-0 bg-amber-500/10 text-amber-500/60 text-[8px] font-black uppercase px-2 py-1 tracking-widest border-b border-l border-amber-500/10 rounded-bl-lg font-mono">
                                      Historical Record
                                   </div>
                                )}
                                
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:translate-x-full duration-1000 ease-in-out pointer-events-none"></div>
                             
                                <div className="shrink-0 flex items-start sm:items-center gap-3 w-full sm:w-48 border-b sm:border-b-0 sm:border-r border-white/5 pb-3 sm:pb-0 sm:pr-4">
                                   {mediaItem.coverImageUrl ? (
                                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 shadow-inner border border-white/10 bg-black">
                                         <img src={mediaItem.coverImageUrl} className="w-full h-full object-cover opacity-80" />
                                      </div>
                                   ) : (
                                      <div className={cn("w-10 h-10 rounded-lg shrink-0 border border-white/10 shadow-inner flex items-center justify-center bg-black/50")}>
                                         <BookOpen className={cn("w-4 h-4", colors.text)} />
                                      </div>
                                   )}
                                   <div className="min-w-0">
                                      <div className="text-[9px] font-black uppercase text-zinc-500 tracking-widest font-display truncate">
                                         {mediaItem.mediaType}
                                      </div>
                                      <div className="text-sm font-bold text-white truncate max-w-full">
                                         {mediaItem.title}
                                      </div>
                                   </div>
                                </div>

                                <div className="flex-1 flex flex-col justify-center min-w-0 py-1 space-y-2">
                                   <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-zinc-300 font-medium text-sm flex items-center gap-1.5">
                                         <Activity className={cn("w-3.5 h-3.5", colors.text)} />
                                         {renderActionNode()}
                                      </span>
                                      
                                      <span className="text-zinc-600 text-xs font-mono">
                                         • {format(parseISO(log.timestamp), 'HH:mm')}
                                      </span>

                                      {log.location && (
                                         <span className="flex items-center gap-1 text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded ml-auto tracking-widest uppercase font-mono shadow-inner">
                                            <MapPin className="w-3 h-3" />
                                            {log.location}
                                         </span>
                                      )}
                                   </div>

                                   {log.note && log.metricType !== "statusChange" && (
                                      <div className="bg-black/40 border border-white/5 rounded-xl p-3 shadow-inner relative flex gap-3 text-sm italic text-zinc-400 font-serif leading-relaxed">
                                         <PencilLine className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
                                         <p>"{log.note}"</p>
                                      </div>
                                   )}
                                </div>
                             </div>
                          );
                       })}
                    </div>
                 </div>
              );
           })}
        </div>
      )}
    </div>
  );
}
