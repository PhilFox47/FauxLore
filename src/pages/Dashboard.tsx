import React, { useState, useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { MediaCard } from '../components/MediaCard';
import { MediaFormModal } from '../components/MediaFormModal';
import { MediaDetailModal } from '../components/MediaDetailModal';
import { ProgressModal } from '../components/ProgressModal';
import { FilterSortBar } from '../components/FilterSortBar';
import { useMediaFilterSort } from '../hooks/useMediaFilterSort';
import { MediaItem } from '../types/schema';
import { Plus, Search, Flame, Award, Shield, Swords } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { calculateRPGState } from '../lib/rpgSystem';

export function Dashboard() {
  const { media, logs, settings, saveMediaItem, addLog, deleteMediaItem } = useMediaContext();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MediaItem | undefined>(undefined);
  
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
  
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [progressItem, setProgressItem] = useState<MediaItem | null>(null);

  const {
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    searchQuery,
    setSearchQuery,
    filteredAndSortedMedia: activeMedia,
  } = useMediaFilterSort(media, 'All');

  const currentStreak = useMemo(() => {
    const historicalFilteredLogs = logs.filter(l => !l.timestamp.startsWith('1970-01-01'));
    if (historicalFilteredLogs.length === 0) return 0;
    
    // Get unique dates sorted descending
    const uniqueDates = Array.from(new Set<string>(historicalFilteredLogs.map(l => format(parseISO(l.timestamp), 'yyyy-MM-dd'))));
    uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    
    if (uniqueDates.length === 0) return 0;

    const todayDateStr = format(new Date(), 'yyyy-MM-dd');
    let streak = 0;
    
    // Check if the streak is active today or yesterday
    let currentDateToCheck = new Date(uniqueDates[0]);
    const daysSinceMostRecentLog = differenceInDays(new Date(todayDateStr), currentDateToCheck);
    
    if (daysSinceMostRecentLog > 1) {
       return 0; // Streak broken
    }

    streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
       const prevDate = new Date(uniqueDates[i]);
       if (differenceInDays(currentDateToCheck, prevDate) === 1) {
          streak++;
          currentDateToCheck = prevDate;
       } else {
          break;
       }
    }
    
    return streak;
  }, [logs]);

  const rpgState = useMemo(() => calculateRPGState(media, logs, settings), [media, logs, settings]);

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
      <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 mb-8 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
        {/* Glow behind RPG */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px]" />
        
        <div className="shrink-0 relative">
          <div className="w-20 h-20 bg-zinc-950 rounded-2xl flex items-center justify-center border-4 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.3)] z-10 relative">
            <Shield className="w-10 h-10 text-indigo-400" />
            <div className="absolute -bottom-3 -right-3 bg-indigo-600 text-white text-xs font-black px-2 py-0.5 rounded-full border-2 border-zinc-900 shadow-xl shadow-indigo-900/50">
              Lvl {rpgState.level}
            </div>
          </div>
        </div>

        <div className="flex-1 w-full z-10">
          <div className="flex justify-between items-end mb-2">
            <div>
               <h3 className="text-2xl font-black text-white italic tracking-tight">{rpgState.className}</h3>
               <p className="text-zinc-400 text-sm font-medium">{rpgState.currentExp.toLocaleString()} Total EXP</p>
            </div>
            <div className="text-right">
               <span className="text-xs text-indigo-400 font-bold tracking-wider uppercase">Next Level</span>
               <div className="text-xs text-zinc-500 font-mono">
                  {(rpgState.currentExp - rpgState.currentLevelExp).toLocaleString()} / {(rpgState.nextLevelExp - rpgState.currentLevelExp).toLocaleString()}
               </div>
            </div>
          </div>
          <div className="h-3 bg-zinc-950 rounded-full overflow-hidden shadow-inner border border-white/5 relative">
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
              style={{ width: `${Math.max(2, rpgState.expProgress * 100)}%` }} 
            />
          </div>
        </div>
      </div>

      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
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
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
          />
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-900 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-full sm:w-64"
            />
          </div>
          <button 
            onClick={handleAddNew}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-900/20 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add New
          </button>
        </div>
      </header>

      {activeMedia.length === 0 ? (
        <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-12 text-center flex-1 flex flex-col items-center justify-center min-h-[400px]">
          <p className="text-zinc-500 mb-4">No tracking records found.</p>
          <button onClick={handleAddNew} className="text-indigo-400 font-medium hover:text-indigo-300 transition-colors">
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
