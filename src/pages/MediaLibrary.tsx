import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useMediaContext } from '../contexts/MediaContext';
import { MediaCard } from '../components/MediaCard';
import { MediaFormModal } from '../components/MediaFormModal';
import { MediaDetailModal } from '../components/MediaDetailModal';
import { ProgressModal } from '../components/ProgressModal';
import { FilterSortBar } from '../components/FilterSortBar';
import { useMediaFilterSort } from '../hooks/useMediaFilterSort';
import { MediaItem, MediaType, MEDIA_HEX, getMetricForType } from '../types/schema';
import { NATIVE_UNIT_LABELS, calculateRPGState } from '../lib/rpgSystem';
import { getRandomFlavorText, type FlavorText } from '../lib/flavorTexts';
import { DatabaseService } from '../services/db';
import { Plus, Search, CheckCircle2, TrendingUp, Pickaxe } from 'lucide-react';

export function MediaLibrary() {
  const { mediaType } = useParams<{ mediaType: string }>();
  const { media, logs, settings, rpgState, worldBosses, artifacts, aiTextCache, saveMediaItem, addLog, deleteMediaItem } = useMediaContext();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MediaItem | undefined>(undefined);
  
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
  
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [progressItem, setProgressItem] = useState<MediaItem | null>(null);

  const decodedMediaType = decodeURIComponent(mediaType || '') as MediaType;

  const accentBase = MEDIA_HEX[decodedMediaType]?.base || '#f97316';
  const accentHover = MEDIA_HEX[decodedMediaType]?.hover || '#ea580c';

  const baseMediaItems = media.filter(m => m.mediaType === decodedMediaType);

  const vaultLevel = rpgState.mediaLevels[decodedMediaType] || { level: 1, exp: 0, nextLevelExp: 100, currentLevelExp: 0, expProgress: 0, title: 'Novice' };
  const vaultTitle = aiTextCache[`rpg_title_${decodedMediaType}_${vaultLevel.level}`] || vaultLevel.title;
  /**
   * The line under the title.
   *
   * Both pools come from the server in one call — the global starter lines and
   * whatever this library has earned — because they now live in the same table.
   * Nothing renders until they arrive, which is a change: the lines are no
   * longer in the bundle, so there is nothing to show in the meantime.
   */
  const [flavorPool, setFlavorPool] = useState<FlavorText[]>([]);
  useEffect(() => {
    let live = true;
    DatabaseService.getFlavorTexts()
      .then((byType) => { if (live) setFlavorPool(byType[decodedMediaType] || []); })
      .catch(() => {});
    return () => { live = false; };
  }, [decodedMediaType]);

  const flavorText = useMemo(() => getRandomFlavorText(flavorPool), [flavorPool]);
  
  const totalAccumulated = useMemo(() => {
    const metric = getMetricForType(decodedMediaType);
    return baseMediaItems.reduce((acc, m) => acc + ((m[metric as keyof MediaItem] as number) || 0), 0);
  }, [baseMediaItems, decodedMediaType]);

  const completionRate = useMemo(() => {
    if (baseMediaItems.length === 0) return 0;
    const completed = baseMediaItems.filter(m => m.status === 'Completed' || m.status === 'Extras').length;
    return Math.round((completed / baseMediaItems.length) * 100);
  }, [baseMediaItems]);
  
  const {
    statusFilters,
    setStatusFilters,
    sortBy,
    setSortBy,
    searchQuery,
    setSearchQuery,
    filteredAndSortedMedia: libraryMedia,
  } = useMediaFilterSort(baseMediaItems, 'All');

  const handleEdit = (item: MediaItem) => {
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleViewDetails = (item: MediaItem) => {
    setDetailItem(item);
    setIsDetailOpen(true);
  };

  const handleAddNew = () => {
    // Attempt to open the add form pre-filled with this category
    setEditingItem({
      title: '',
      mediaType: decodedMediaType,
      status: 'Active',
      genres: [], tags: [], tropes: []
    } as any);
    setIsFormOpen(true);
  };

  const handleLogProgress = (item: MediaItem) => {
    setProgressItem(item);
    setIsProgressOpen(true);
  };

  return (
    <>
      <header 
        className="flex flex-col gap-6 sm:gap-8 mb-8 bg-gradient-to-br from-zinc-900 to-[#0A0A0C] border border-white/5 rounded-3xl p-5 sm:p-8 relative shadow-2xl z-20"
        style={{ '--accent': accentBase, '--accent-hover': accentHover } as React.CSSProperties}
      >
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.05] mix-blend-overlay rounded-3xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent-hover)]" style={{ boxShadow: `0 0 8px ${accentBase}`}}></span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 font-display">Library</span>
            </div>
            <h2 className="text-4xl sm:text-5xl font-black text-white font-display tracking-tight leading-none mb-2">{decodedMediaType}s</h2>
            {/* Held back until the pool arrives. A one-render flash of a
                placeholder line, replaced a moment later, reads worse than the
                header simply settling. */}
            {flavorPool.length > 0 && (
            <div className="relative group w-fit">
              <p className="text-zinc-400 font-medium italic cursor-help">
                "{flavorText.quote}"
              </p>
              <div className="absolute left-0 top-full mt-2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0 whitespace-nowrap bg-zinc-800 border border-white/10 text-zinc-200 text-xs px-3 py-1.5 rounded-md shadow-xl pointer-events-none z-50 font-sans tracking-wide">
                {/* A line with no source is one about the medium itself, not one
                    whose origin was lost — so it says so rather than shrugging. */}
                {[flavorText.source || 'Common knowledge', flavorText.attribution]
                  .filter(Boolean)
                  .join(' — ')}
                {flavorText.earned && (
                  <span className="ml-2 text-[10px] uppercase tracking-[0.15em] text-[var(--accent)] font-bold">
                    A memory from your library
                  </span>
                )}
              </div>
            </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-6 sm:gap-10 mt-2 lg:mt-0 pt-6 lg:pt-0 border-t lg:border-t-0 border-white/5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-white/10" />
                  <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="3" fill="transparent" strokeDasharray={`${vaultLevel.expProgress * 113} 113`} className="text-[var(--accent)] transition-all duration-1000 ease-out" />
                </svg>
                <span className="absolute text-xs font-black text-white">{vaultLevel.level}</span>
              </div>
              <div className="flex flex-col justify-center">
                <div className="text-[9px] uppercase tracking-[0.1em] text-[var(--accent)] font-bold">{vaultTitle}</div>
                <div className="text-sm font-black text-white leading-none">{vaultLevel.exp.toLocaleString()} <span className="text-[10px] font-medium text-zinc-500">EXP</span></div>
              </div>
            </div>

            <div className="h-8 w-px bg-white/5 hidden sm:block"></div>

            <div className="flex flex-col justify-center">
              <div className="text-[9px] uppercase tracking-[0.1em] text-zinc-500 font-bold flex items-center gap-1 mb-0.5">
                <CheckCircle2 className="w-3 h-3 text-[var(--accent)]" /> Clear Rate
              </div>
              <div className="text-xl font-black text-white leading-none">{completionRate}%</div>
            </div>

            <div className="h-8 w-px bg-white/5 hidden sm:block"></div>

            <div className="flex flex-col justify-center">
              <div className="text-[9px] uppercase tracking-[0.1em] text-zinc-500 font-bold flex items-center gap-1 mb-0.5">
                <TrendingUp className="w-3 h-3 text-[var(--accent)]" /> {NATIVE_UNIT_LABELS[decodedMediaType] || 'Logged'}
              </div>
              <div className="text-xl font-black text-white leading-none">{totalAccumulated.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4 relative z-10 w-full pt-2">
          <FilterSortBar 
            statusFilters={statusFilters}
            setStatusFilters={setStatusFilters}
            sortBy={sortBy}
            setSortBy={(val) => setSortBy(val as any)}
          />
          <div className="relative flex-1 lg:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black/50 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--accent)] w-full backdrop-blur-md transition-shadow focus:shadow-[0_0_15px_var(--accent)] font-medium"
              style={{ boxShadow: searchQuery ? `0 0 15px ${accentBase}33` : undefined }}
            />
          </div>
          <button 
            onClick={handleAddNew}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shrink-0 font-display mt-2 lg:mt-0 flex items-center justify-center gap-2 whitespace-nowrap"
            style={{ boxShadow: `0 0 20px ${accentBase}4D` }}
          >
            <Plus className="w-4 h-4" /> Add Media
          </button>
        </div>
      </header>

      {libraryMedia.length === 0 ? (
        <div className="bg-gradient-to-br from-zinc-900/30 to-black border-2 border-dashed border-white/5 rounded-[2.5rem] p-5 sm:p-16 text-center shadow-inner flex-1 flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900/80 border border-white/5 flex items-center justify-center mx-auto mb-6 shadow-md shadow-black">
             <Search className="w-8 h-8 text-zinc-700" />
          </div>
          <h3 className="text-xl font-black text-white font-display mb-2">Nothing here yet</h3>
          <p className="text-zinc-500 font-medium">No {decodedMediaType.toLowerCase()}s found matching your current filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4 flex-1 items-start content-start">
          {libraryMedia.map(item => (
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
        onLogProgress={(item) => { setIsDetailOpen(false); handleLogProgress(item); }}
      />

      <MediaFormModal 
        isOpen={isFormOpen} 
        initialData={editingItem} 

        onClose={() => setIsFormOpen(false)} 
        onSave={saveMediaItem} 
        onDelete={deleteMediaItem}
        onOpenExisting={(item) => { setIsFormOpen(false); handleViewDetails(item); }}
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
