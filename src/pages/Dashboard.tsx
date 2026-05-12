import React, { useState, useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { MediaCard } from '../components/MediaCard';
import { MediaFormModal } from '../components/MediaFormModal';
import { MediaDetailModal } from '../components/MediaDetailModal';
import { ProgressModal } from '../components/ProgressModal';
import { FilterSortBar } from '../components/FilterSortBar';
import { useMediaFilterSort } from '../hooks/useMediaFilterSort';
import { MediaItem, MediaType, MEDIA_HEX, MEDIA_TYPES } from '../types/schema';
import { 
  Plus, Search, Flame, Award, Shield, Swords, Sparkles, Wand2, Clock, Target, AlertTriangle, RefreshCw,
  Gamepad2, Book, Headphones, MessagesSquare, Library, Tv, Clapperboard, BookImage
} from 'lucide-react';
import { calculateStreak } from '../lib/streak';
import { calculateRPGState } from '../lib/rpgSystem';
import { format, parseISO } from 'date-fns';
import { cn } from '../lib/utils';

export function Dashboard() {
  const { media, logs, settings, saveMediaItem, addLog, deleteMediaItem, aiTextCache, worldBosses, artifacts, oracleMessages, fetchOracleMessage, rerollBoss } = useMediaContext();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MediaItem | undefined>(undefined);
  
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
  
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [progressItem, setProgressItem] = useState<MediaItem | null>(null);

  const {
    statusFilters,
    setStatusFilters,
    sortBy,
    setSortBy,
    searchQuery,
    setSearchQuery,
    filteredAndSortedMedia: rawActiveMedia,
  } = useMediaFilterSort(media, ['Active', 'Extras']);

  const activeMedia = useMemo(() => {
    return [...rawActiveMedia].sort((a, b) => {
      // Sort Non-Ongoing (falsy) before Ongoing (truthy)
      if (a.isOngoing && !b.isOngoing) return 1;
      if (!a.isOngoing && b.isOngoing) return -1;
      return 0; // Maintain original sort order for the rest
    });
  }, [rawActiveMedia]);

  const currentStreak = useMemo(() => calculateStreak(logs), [logs]);

  const rpgState = useMemo(() => calculateRPGState(media, logs, settings, worldBosses, artifacts), [media, logs, settings, worldBosses, artifacts]);
  const getDynamicTitle = () => aiTextCache[`rpg_title_${rpgState.level}`] || rpgState.className;

  const latestOracle = oracleMessages[0];
  const activeBosses = worldBosses.filter(b => b.status === 'Active');

  React.useEffect(() => {
    // Automated aging: Drop active items that have not been logged in 50 days (8 weeks ~ day 50)
    const itemsToDrop = media.filter(item => {
      if (item.status !== 'Active') return false;
      const mediaLogs = logs.filter(l => l.mediaId === item.id);
      
      // Get the absolute latest timestamp among ALL logs, including statusChange and historic ones
      const lastActiveMs = mediaLogs.length 
        ? Math.max(...mediaLogs.map(l => new Date(l.timestamp).getTime()), new Date(item.updatedAt || item.createdAt).getTime()) 
        : new Date(item.updatedAt || item.createdAt).getTime();
        
      const days = (Date.now() - lastActiveMs) / (1000 * 60 * 60 * 24);
      return days >= 50;
    });

    if (itemsToDrop.length > 0) {
      Promise.all(itemsToDrop.map(item => saveMediaItem({ ...item, status: 'Dropped' })))
        .catch(console.error);
    }
  }, [media, logs, saveMediaItem]);

  const handleEdit = (item: MediaItem) => {
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleViewDetails = (item: MediaItem) => {
    setDetailItem(item);
    setIsDetailOpen(true);
  };

  const handleAddNew = () => {
    setEditingItem(undefined);
    setIsFormOpen(true);
  };

  const handleLogProgress = (item: MediaItem) => {
    setProgressItem(item);
    setIsProgressOpen(true);
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 auto-rows-[minmax(180px,auto)] gap-4 xl:gap-6 mb-8 w-full">
        
        {/* Bento: RPG Hero (2x2) */}
        <div className="md:col-span-2 lg:col-span-3 xl:col-span-3 xl:row-span-2 bg-gradient-to-br from-[#121214] to-[#0A0A0C] border border-white/5 border-t-white/10 rounded-[2rem] p-6 lg:p-10 relative overflow-hidden shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_20px_40px_-10px_rgba(0,0,0,0.8)] flex flex-col justify-between group">
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-orange-500/10 rounded-full blur-[100px] pointer-events-none transition-transform duration-1000 group-hover:scale-110" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
             <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-orange-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 font-display">Lorekeeper</span>
             </div>
             <div className="bg-white/5 backdrop-blur-sm border border-white/5 px-4 py-1.5 rounded-full shadow-inner">
                <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">Level {rpgState.level}</span>
             </div>
          </div>

          <div className="relative z-10 w-full mb-6">
             <h3 className="text-3xl sm:text-5xl font-black text-white italic tracking-tight font-display mb-2 drop-shadow-lg leading-tight">
               {getDynamicTitle()}
             </h3>
             <p className="text-zinc-400 text-sm sm:text-base font-medium flex items-center gap-2">
               <Sparkles className="w-4 h-4 text-orange-400/50" />
               {Math.floor(rpgState.currentExp).toLocaleString()} Total EXP
             </p>
          </div>

          <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 mb-6 relative z-10 w-full">
            {MEDIA_TYPES.map(mediaType => {
              const data = rpgState.mediaLevels[mediaType] || { level: 1, expProgress: 0 };
              const accent = MEDIA_HEX[mediaType]?.base || '#f97316';
              return (
                <div key={mediaType} className="bg-black/40 border border-white/5 rounded-lg p-2.5 flex flex-col items-center justify-center gap-2 shadow-inner group hover:bg-black/60 transition-colors relative overflow-hidden" title={`${mediaType} Level ${data.level}`}>
                  <div className="flex items-center gap-1.5 z-10">
                    <span style={{ color: accent, boxShadow: `0 0 10px ${accent}20` }} className="drop-shadow-md">
                      {mediaType === 'Game' && <Gamepad2 className="w-4 h-4" />}
                      {mediaType === 'Book' && <Book className="w-4 h-4" />}
                      {mediaType === 'Audiobook' && <Headphones className="w-4 h-4" />}
                      {mediaType === 'Visual Novel' && <MessagesSquare className="w-4 h-4" />}
                      {mediaType === 'Manga' && <Library className="w-4 h-4" />}
                      {mediaType === 'Series' && <Tv className="w-4 h-4" />}
                      {mediaType === 'Movie' && <Clapperboard className="w-4 h-4" />}
                      {mediaType === 'Comic' && <BookImage className="w-4 h-4" />}
                    </span>
                    <span className="text-sm font-black text-white italic">{data.level}</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-950/80 rounded-full overflow-hidden border border-white/5 z-10 relative">
                    <div 
                      className="absolute top-0 left-0 h-full rounded-full transition-all duration-1000"
                      style={{ width: `${Math.max(2, data.expProgress * 100)}%`, backgroundColor: accent, boxShadow: `0 0 10px ${accent}80` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-auto">
            <div className="flex justify-between items-end mb-3">
               <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Next Rank</span>
               <div className="text-xs font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded shadow-inner border border-white/5">
                  {Math.floor(rpgState.currentExp - rpgState.currentLevelExp).toLocaleString()} / {Math.floor(rpgState.nextLevelExp - rpgState.currentLevelExp).toLocaleString()}
               </div>
            </div>
            <div className="h-4 w-full bg-black/60 rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] border border-white/5 relative p-[2px]">
              <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-600 to-orange-400 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(249,115,22,0.6)]" 
                style={{ width: `${Math.max(2, rpgState.expProgress * 100)}%` }} 
              />
              {/* Skeuomorphic inner glare on the progress bar */}
              <div className="absolute top-0 left-0 w-full h-[30%] bg-white/20 rounded-full mix-blend-overlay"></div>
            </div>
          </div>
        </div>

        {/* Bento: Streak (1x1) */}
        <div className="bg-gradient-to-br from-orange-950/40 to-zinc-900 border border-orange-500/20 border-t-orange-400/30 rounded-[2rem] p-6 relative overflow-hidden shadow-lg flex flex-col items-center justify-center text-center group">
           <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-orange-400/50 to-transparent"></div>
           <Flame className={cn("w-12 h-12 mb-3 drop-shadow-md", currentStreak > 0 ? "text-orange-400 fill-orange-500/20" : "text-zinc-600")} />
           <div className="text-4xl font-black text-white font-display tabular-nums tracking-tight mb-1">{currentStreak}</div>
           <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-orange-500/70">Day Streak</div>
        </div>

        {/* Bento: Boss List (1x2) on Desktop */}
        <div className="xl:row-span-2 bg-[#0c0c0e] border border-white/5 rounded-[2rem] p-6 flex flex-col relative overflow-hidden shadow-lg">
           <div className="flex items-center justify-between mb-6 relative z-10">
              <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] font-display">
                 Priority Targets
              </h3>
              <Swords className="w-4 h-4 text-zinc-600" />
           </div>
           
           <div className="flex-1 overflow-y-auto pr-2 space-y-3 relative z-10">
             {activeBosses.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
                  <Target className="w-10 h-10 text-zinc-800 mx-auto mb-4" />
                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] leading-relaxed">
                     Zero Active<br/>Threats
                  </p>
               </div>
             ) : (
               activeBosses.slice(0, 3).map(boss => {
                 const mediaItem = media.find(m => m.id === boss.mediaId);
                 const progress = (boss.currentProgress / boss.targetProgress) * 100;
                 return (
                   <div key={boss.id} className="bg-zinc-950 border border-white/5 rounded-2xl p-4 group hover:border-red-500/30 transition-colors shadow-inner relative overflow-hidden">
                      {/* Skeuomorphic inner shadow */}
                      <div className="absolute inset-0 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] pointer-events-none rounded-2xl" />
                      <div className="relative z-10">
                        <div className="flex justify-between items-start mb-2">
                           <div className="min-w-0 pr-2">
                              <h4 className="text-xs font-bold text-white truncate font-display">{boss.name}</h4>
                              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-0.5 truncate">LVL {boss.level} • {mediaItem?.title}</div>
                           </div>
                           <button 
                              onClick={async (e) => {
                                const btn = e.currentTarget;
                                btn.disabled = true;
                                const icon = btn.querySelector('svg');
                                if(icon) icon.classList.add('animate-spin', 'text-amber-500');
                                await rerollBoss(boss.id);
                                btn.disabled = false;
                                if(icon) icon.classList.remove('animate-spin', 'text-amber-500');
                              }} 
                              className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-50"
                           >
                              <RefreshCw className="w-3 h-3" />
                           </button>
                        </div>
                        <div className="h-1.5 w-full bg-black/80 rounded-full overflow-hidden border border-white/5 relative">
                           <div 
                             className={cn(
                               "h-full rounded-full transition-all duration-700 shadow-[0_0_8px_rgba(239,68,68,0.5)]",
                               boss.level >= 4 ? "bg-red-500" : boss.level >= 2 ? "bg-amber-500" : "bg-emerald-500"
                             )}
                             style={{ width: `${Math.max(4, progress)}%` }} 
                           />
                        </div>
                        <div className="flex justify-between text-[8px] font-mono text-zinc-500 mt-1.5">
                           <span>{boss.currentProgress} / {boss.targetProgress} {boss.unit}</span>
                           <span className="flex items-center gap-1"><Clock className="w-2 h-2" /> {format(parseISO(boss.expiresAt), 'MMM d')}</span>
                        </div>
                      </div>
                   </div>
                 );
               })
             )}
             {activeBosses.length > 3 && (
               <div className="text-center text-[10px] text-zinc-600 py-1 font-bold">+ {activeBosses.length - 3} more active</div>
             )}
           </div>
        </div>

        {/* Bento: Oracle (1x1) */}
        <div className="bg-gradient-to-br from-indigo-950/30 to-[#0A0A0C] border border-indigo-500/20 border-t-indigo-400/30 rounded-[2rem] p-6 relative overflow-hidden shadow-lg group flex flex-col">
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03] mix-blend-overlay"></div>
           <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center gap-2">
                 <Wand2 className="w-4 h-4 text-indigo-400" />
                 <span className="text-[10px] font-black text-indigo-300/80 uppercase tracking-[0.2em] font-display">The Oracle</span>
              </div>
              <button 
                 onClick={async (e) => {
                   const btn = e.currentTarget;
                   btn.disabled = true;
                   const icon = btn.querySelector('svg');
                   if(icon) icon.classList.add('animate-spin', 'text-indigo-300');
                   await fetchOracleMessage();
                   btn.disabled = false;
                   if(icon) icon.classList.remove('animate-spin', 'text-indigo-300');
                 }}
                 className="text-indigo-500 hover:text-indigo-300 transition-colors disabled:opacity-50"
              >
                 <RefreshCw className="w-3 h-3" />
              </button>
           </div>
           <div className="flex-1 flex items-center justify-center relative z-10">
              <p className="text-zinc-300 italic text-xs sm:text-sm leading-relaxed font-serif text-center px-2 shadow-black drop-shadow-md">
                 "{latestOracle?.message || "Gaze into the abyss."}"
              </p>
           </div>
        </div>
      </div>

       {/* Bento: Armory Effects (Horizontal, new row) */}
       <div className="bg-gradient-to-br from-emerald-950/20 to-[#0A0A0C] border border-emerald-500/20 border-t-emerald-400/30 rounded-[2rem] p-6 relative overflow-hidden shadow-lg flex flex-col md:flex-row gap-6 mb-8 w-full">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent"></div>
          <div className="flex flex-col md:w-48 shrink-0 justify-center">
             <div className="flex items-center gap-2 mb-2">
                <Award className="w-5 h-5 text-emerald-400" />
                <h3 className="text-xs font-black text-emerald-500/80 uppercase tracking-[0.2em] font-display">Active Effects</h3>
             </div>
             <p className="text-[10px] text-zinc-500 font-semibold leading-relaxed">
               Currently active boons based on equipped artifacts.
             </p>
          </div>
          <div className="flex-1 flex overflow-x-auto gap-3 pb-2 custom-scrollbar">
            {artifacts.filter(a => a.isEquipped && a.durability > 0).length === 0 ? (
              <div className="w-full flex items-center justify-center text-center p-4 bg-emerald-950/10 rounded-2xl border border-dashed border-emerald-900/50">
                <p className="text-xs font-black text-emerald-900/80 uppercase tracking-widest">No active effects</p>
              </div>
            ) : (
              artifacts.filter(a => a.isEquipped && a.durability > 0).map(art => (
                <div key={art.id} className="min-w-[160px] bg-emerald-950/30 border border-emerald-500/20 rounded-2xl p-4 flex flex-col relative overflow-hidden hover:border-emerald-500/50 transition-colors shadow-inner shrink-0 group">
                   <div className="absolute inset-0 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] pointer-events-none rounded-2xl" />
                   <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                   <div className="relative z-10 flex flex-col h-full justify-center text-center">
                      <h4 className="text-[11px] font-bold text-emerald-100 line-clamp-1 font-display mb-2">{art.name}</h4>
                      <div className="text-[11px] text-emerald-400 font-black uppercase tracking-widest leading-tight">
                         +{art.bonusPercent}% {art.targetValue} EXP
                      </div>
                   </div>
                </div>
              ))
            )}
          </div>
       </div>

      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-4 relative z-20">
        <div>
          <div className="flex items-center gap-3 mb-1">
             <h2 className="text-2xl font-semibold">Overview</h2>
             {currentStreak > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-400">
                   <Flame className="w-3.5 h-3.5 fill-current" />
                   <span className="text-xs font-bold">{currentStreak} Day Streak</span>
                </div>
             )}
          </div>
          <p className="text-zinc-500 text-sm">Tracked across all media types</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <FilterSortBar 
            statusFilters={statusFilters}
            setStatusFilters={setStatusFilters}
            sortBy={sortBy}
            setSortBy={(val) => setSortBy(val as any)}
          />
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-900 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-orange-500 w-full sm:w-64"
            />
          </div>
          <button 
            onClick={handleAddNew}
            className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-orange-900/20 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add New
          </button>
        </div>
      </header>

      {activeMedia.length === 0 ? (
        <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-12 text-center flex-1 flex flex-col items-center justify-center min-h-[400px]">
          <p className="text-zinc-500 mb-4">No tracking records found.</p>
          <button onClick={handleAddNew} className="text-orange-400 font-medium hover:text-orange-300 transition-colors">
            Start tracking something
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4 flex-1 items-start">
          {activeMedia.map(item => (
            <MediaCard 
              key={item.id} 
              item={item} 
              onEdit={handleEdit} 
              onLogProgress={handleLogProgress}
              onViewDetails={handleViewDetails}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <MediaDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        item={detailItem}
        logs={logs.filter(l => l.mediaId === detailItem?.id)}
        onEdit={(item) => {
          setIsDetailOpen(false);
          handleEdit(item);
        }}
      />

      <MediaFormModal 
        isOpen={isFormOpen} 
        initialData={editingItem} 
        onClose={() => setIsFormOpen(false)} 
        onSave={saveMediaItem} 
        onDelete={deleteMediaItem}
      />

      <ProgressModal 
        isOpen={isProgressOpen} 
        item={progressItem} 
        onClose={() => setIsProgressOpen(false)} 
        onLog={addLog} 
      />
    </>
  );
}
