import React, { useState, useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { MediaCard } from '../components/MediaCard';
import { MediaFormModal } from '../components/MediaFormModal';
import { ProgressModal } from '../components/ProgressModal';
import { FilterSortBar } from '../components/FilterSortBar';
import { useMediaFilterSort } from '../hooks/useMediaFilterSort';
import { MediaItem } from '../types/schema';
import { Plus, Search, Flame } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';

export function Dashboard() {
  const { media, logs, saveMediaItem, addLog, deleteMediaItem } = useMediaContext();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MediaItem | undefined>(undefined);
  
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

  const handleEdit = (item: MediaItem) => {
    setEditingItem(item);
    setIsFormOpen(true);
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
            />
          ))}
        </div>
      )}

      {/* Modals */}
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
