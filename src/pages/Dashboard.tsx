import React, { useState, useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { MediaCard } from '../components/MediaCard';
import { MediaFormModal } from '../components/MediaFormModal';
import { MediaDetailModal } from '../components/MediaDetailModal';
import { ProgressModal } from '../components/ProgressModal';
import { FilterSortBar } from '../components/FilterSortBar';
import { useMediaFilterSort } from '../hooks/useMediaFilterSort';
import { MediaItem } from '../types/schema';
import { Plus, Search, Flame, Award, Shield, Swords, Sparkles, Wand2, Clock, Target, AlertTriangle, RefreshCw } from 'lucide-react';
import { calculateStreak } from '../lib/streak';
import { calculateRPGState } from '../lib/rpgSystem';
import { format, parseISO } from 'date-fns';
import { cn } from '../lib/utils';

export function Dashboard() {
  const { media, logs, settings, saveMediaItem, addLog, deleteMediaItem, aiTextCache, worldBosses, artifacts, oracleMessages, fetchOracleMessage } = useMediaContext();
  
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
    filteredAndSortedMedia: activeMedia,
  } = useMediaFilterSort(media, 'Active');

  const currentStreak = useMemo(() => calculateStreak(logs), [logs]);

  const rpgState = useMemo(() => calculateRPGState(media, logs, settings, worldBosses, artifacts), [media, logs, settings, worldBosses, artifacts]);
  const getDynamicTitle = () => aiTextCache[`rpg_title_${rpgState.level}`] || rpgState.className;

  const latestOracle = oracleMessages[0];
  const activeBosses = worldBosses.filter(b => b.status === 'Active');

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
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8 w-full items-start">
        <div className="xl:col-span-2 space-y-6">
          {/* RPG Card */}
          <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden shadow-2xl shadow-black/50">
            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-[80px] pointer-events-none" />
            
            <div className="flex flex-col md:flex-row items-center gap-6 relative z-10 w-full">
              <div className="shrink-0 relative">
                <div className="w-20 h-20 bg-zinc-950 rounded-2xl flex items-center justify-center border-4 border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.3)] relative">
                  <Shield className="w-10 h-10 text-orange-400" />
                  <div className="absolute -bottom-3 -right-3 bg-orange-600 text-white text-xs font-black px-2 py-0.5 rounded-full border-2 border-zinc-900 shadow-xl shadow-orange-900/50">
                    Lvl {rpgState.level}
                  </div>
                </div>
              </div>

              <div className="flex-1 w-full flex flex-col justify-center min-w-0">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-3 gap-2">
                  <div className="truncate w-full min-w-0">
                     <h3 className="text-2xl font-black text-white italic tracking-tight truncate">{getDynamicTitle()}</h3>
                     <p className="text-zinc-400 text-sm font-medium">{rpgState.currentExp.toLocaleString()} Total EXP</p>
                  </div>
                  <div className="text-left sm:text-right shrink-0 mt-1 sm:mt-0">
                     <span className="text-xs text-orange-400 font-bold tracking-wider uppercase block sm:inline">Next Level</span>
                     <div className="text-xs text-zinc-500 font-mono mt-0.5 sm:mt-0">
                        {(rpgState.currentExp - rpgState.currentLevelExp).toLocaleString()} / {(rpgState.nextLevelExp - rpgState.currentLevelExp).toLocaleString()}
                     </div>
                  </div>
                </div>
                <div className="h-3 w-full bg-zinc-950 rounded-full overflow-hidden shadow-inner border border-white/5 relative">
                  <div 
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-600 to-orange-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(249,115,22,0.5)]" 
                    style={{ width: `${Math.max(2, rpgState.expProgress * 100)}%` }} 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Oracle News */}
          <div className="bg-gradient-to-br from-purple-950/30 to-zinc-900 border border-purple-500/20 rounded-3xl p-6 relative overflow-hidden group">
             <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-purple-500/0 via-purple-500 to-purple-500/0" />
             <div className="flex items-start gap-4">
                <div className="shrink-0 w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20 shadow-inner">
                   <Sparkles className="w-6 h-6 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                   <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-black text-purple-200 uppercase tracking-widest flex items-center gap-2">
                        Message from the Oracle
                        {latestOracle && (
                          <span className="text-[10px] text-zinc-500 font-medium lowercase italic px-2 py-0.5 bg-zinc-950/50 rounded-full border border-white/5">
                             {format(parseISO(latestOracle.timestamp), 'h:mm a')}
                          </span>
                        )}
                      </h4>
                      <button 
                        onClick={() => fetchOracleMessage()}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-purple-400 hover:text-purple-300 p-1"
                      >
                         <RefreshCw className="w-4 h-4" />
                      </button>
                   </div>
                   <p className="text-zinc-300 italic text-sm leading-relaxed font-serif">
                      {latestOracle?.message || "The Oracle is silent. Peer into the void to receive guidance."}
                   </p>
                </div>
             </div>
          </div>
        </div>

        {/* Boss Column */}
        <div className="space-y-4">
           <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] px-2 flex items-center justify-between">
              Weekly Encounters
              <Swords className="w-4 h-4" />
           </h3>
           
           {activeBosses.length === 0 ? (
             <div className="bg-zinc-900/40 border border-dashed border-white/5 rounded-3xl p-8 text-center">
                <Target className="w-8 h-8 text-zinc-800 mx-auto mb-3" />
                <p className="text-[10px] font-black text-zinc-700 uppercase tracking-widest leading-relaxed">
                   Peace reigns across the realms.
                </p>
             </div>
           ) : (
             activeBosses.map(boss => {
               const mediaItem = media.find(m => m.id === boss.mediaId);
               const progress = (boss.currentProgress / boss.targetProgress) * 100;
               return (
                 <div key={boss.id} className="bg-zinc-900/60 border border-white/5 rounded-3xl p-5 relative overflow-hidden group hover:border-red-500/20 transition-all">
                    <div className="flex flex-col gap-4">
                       <div className="flex items-center gap-3">
                          <div className={cn(
                             "w-10 h-10 rounded-xl flex items-center justify-center border shrink-0",
                             boss.level >= 4 ? "bg-red-500/10 border-red-500/30 text-red-500" :
                             boss.level >= 2 ? "bg-amber-500/10 border-amber-500/30 text-amber-500" :
                             "bg-zinc-500/10 border-zinc-500/30 text-zinc-500"
                          )}>
                             <AlertTriangle className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <div className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-0.5">Level {boss.level} BOSS</div>
                             <h4 className="text-sm font-black text-white truncate">{boss.name}</h4>
                          </div>
                       </div>
                       
                       <div className="space-y-2">
                          <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 px-1">
                             <span className="truncate max-w-[120px]">Target: {mediaItem?.title}</span>
                             <span>{Math.floor(progress)}%</span>
                          </div>
                          <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden border border-white/5 p-[1px]">
                             <div 
                               className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-700" 
                               style={{ width: `${Math.max(4, progress)}%` }} 
                             />
                          </div>
                          <div className="flex items-center justify-between text-[8px] font-black text-zinc-600 uppercase tracking-widest px-1">
                             <span>{boss.currentProgress} / {boss.targetProgress}</span>
                             <div className="flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                <span>{format(parseISO(boss.expiresAt), 'MMM d')}</span>
                             </div>
                          </div>
                       </div>
                    </div>
                    {/* Shadow Decor */}
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                       <Swords className="w-16 h-16" />
                    </div>
                 </div>
               );
             })
           )}
        </div>
      </div>

      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-4">
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
