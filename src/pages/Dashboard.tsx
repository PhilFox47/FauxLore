import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMediaContext } from '../contexts/MediaContext';
import { MediaCard } from '../components/MediaCard';
import { MediaFormModal } from '../components/MediaFormModal';
import { MediaDetailModal } from '../components/MediaDetailModal';
import { ProgressModal } from '../components/ProgressModal';
import { FilterSortBar } from '../components/FilterSortBar';
import { useMediaFilterSort } from '../hooks/useMediaFilterSort';
import { MediaItem, MEDIA_HEX, MEDIA_TYPES } from '../types/schema';
import {
  Plus, Search, Flame, Award, Shield, Swords, Clock, Target, RefreshCw,
  Gamepad2, Book, Headphones, MessagesSquare, Library, Tv, Clapperboard, BookImage
} from 'lucide-react';
import { calculateStreak } from '../lib/streak';
import { format, parseISO } from 'date-fns';
import { cn } from '../lib/utils';

/**
 * The Dashboard leads with what is actually being tracked right now.
 *
 * Everything RPG-flavoured (rank, per-type levels, targets, equipped effects)
 * is either compressed into the single strip at the top or moved below the
 * grid, so the active media is the first — and largest — thing on the page.
 */
export function Dashboard() {
  const { media, logs, rpgState, saveMediaItem, addLog, deleteMediaItem, aiTextCache, worldBosses, artifacts, rerollBoss } = useMediaContext();

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

  const getDynamicTitle = () => aiTextCache[`rpg_title_${rpgState.level}`] || rpgState.className;

  const activeBosses = worldBosses.filter(b => b.status === 'Active');
  const activeEffects = useMemo(
    () => artifacts.filter(a => a.isEquipped && a.durability > 0),
    [artifacts],
  );

  React.useEffect(() => {
    // Automated aging: Drop active items that have not been logged in 50 days (8 weeks ~ day 50)
    const itemsToDrop = media.filter(item => {
      if (item.status !== 'Active') return false;
      if (item.noAutoDrop) return false; // User opted this media out of automatic dropping
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

  const expIntoLevel = Math.floor(rpgState.currentExp - rpgState.currentLevelExp);
  const expForLevel = Math.floor(rpgState.nextLevelExp - rpgState.currentLevelExp);

  return (
    <>
      {/* Status strip: the whole RPG state in one line, so it never competes
          with the library grid for attention. */}
      <div className="mb-6 bg-gradient-to-br from-[#121214] to-[#0A0A0C] border border-white/5 border-t-white/10 rounded-[1.75rem] p-4 sm:p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
        <Link to="/lorekeeper" className="min-w-0 flex items-center gap-3 group shrink-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-orange-400" />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Level {rpgState.level}</div>
            <div className="text-base sm:text-lg font-black text-white italic tracking-tight truncate group-hover:text-orange-200 transition-colors">
              {getDynamicTitle()}
            </div>
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-1.5 gap-3">
            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">Next rank</span>
            <span className="text-[10px] font-mono text-zinc-400 tabular-nums whitespace-nowrap">
              {expIntoLevel.toLocaleString()} / {expForLevel.toLocaleString()} EXP
            </span>
          </div>
          <div className="h-2.5 w-full bg-black/60 rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] border border-white/5 relative">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-600 to-orange-400 rounded-full transition-all duration-1000 shadow-[0_0_12px_rgba(249,115,22,0.5)]"
              style={{ width: `${Math.max(2, rpgState.expProgress * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl border',
            currentStreak > 0 ? 'bg-orange-500/10 border-orange-500/20' : 'bg-white/[0.03] border-white/5',
          )}>
            <Flame className={cn('w-4 h-4', currentStreak > 0 ? 'text-orange-400 fill-orange-500/20' : 'text-zinc-600')} />
            <span className="text-sm font-black text-white tabular-nums">{currentStreak}</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Day streak</span>
          </div>
          <a href="#progress" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-colors">
            <Swords className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-black text-white tabular-nums">{activeBosses.length}</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Targets</span>
          </a>
          <Link to="/armory" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 hover:border-emerald-500/30 transition-colors">
            <Award className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-black text-white tabular-nums">{activeEffects.length}</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Effects</span>
          </Link>
        </div>
      </div>

      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-4 relative z-20">
        <div>
          <h2 className="text-2xl font-semibold mb-1">Overview</h2>
          <p className="text-zinc-500 text-sm">
            {activeMedia.length} {activeMedia.length === 1 ? 'title' : 'titles'} you are working through right now
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <FilterSortBar
            statusFilters={statusFilters}
            setStatusFilters={setStatusFilters}
            sortBy={sortBy}
            setSortBy={(val) => setSortBy(val as any)}
          />
          {/* Search and Add stay on one line on phones so the grid starts sooner. */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="relative flex-1 sm:flex-none">
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
              className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-orange-900/20 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" /> Add New
            </button>
          </div>
        </div>
      </header>

      {activeMedia.length === 0 ? (
        <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 sm:p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <p className="text-zinc-500 mb-4">No tracking records found.</p>
          <button onClick={handleAddNew} className="text-orange-400 font-medium hover:text-orange-300 transition-colors">
            Start tracking something
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4 items-start content-start">
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

      {/* Supporting detail, deliberately below the library. */}
      <section id="progress" className="mt-10 scroll-mt-6">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] font-display">Your progress</h3>
          <div className="h-px flex-1 bg-white/5" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          {/* Per-media-type levels */}
          <div className="xl:col-span-2 bg-[#0c0c0e] border border-white/5 rounded-[2rem] p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] font-display">Levels by format</h4>
              <span className="text-[10px] font-mono text-zinc-600">{Math.floor(rpgState.currentExp).toLocaleString()} total EXP</span>
            </div>
            <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
              {MEDIA_TYPES.map(mediaType => {
                const data = rpgState.mediaLevels[mediaType] || { level: 1, expProgress: 0 };
                const accent = MEDIA_HEX[mediaType]?.base || '#f97316';
                return (
                  <div key={mediaType} className="bg-black/40 border border-white/5 rounded-lg p-2.5 flex flex-col items-center justify-center gap-2 shadow-inner hover:bg-black/60 transition-colors relative overflow-hidden" title={`${mediaType} Level ${data.level}`}>
                    <div className="flex items-center gap-1.5 z-10">
                      <span style={{ color: accent }} className="drop-shadow-md">
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

            {/* Equipped artifacts read as a footnote to the levels they boost. */}
            <div className="mt-6 pt-5 border-t border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-4 h-4 text-emerald-400" />
                <h4 className="text-[10px] font-black text-emerald-500/80 uppercase tracking-[0.2em] font-display">Active effects</h4>
                <Link to="/armory" className="text-[10px] font-bold text-zinc-600 hover:text-zinc-300 transition-colors ml-auto">Armory →</Link>
              </div>
              {activeEffects.length === 0 ? (
                <p className="text-xs text-zinc-600 font-semibold">Nothing equipped. Equip artifacts in the Armory to earn EXP bonuses.</p>
              ) : (
                <div className="flex overflow-x-auto gap-2 pb-1 custom-scrollbar">
                  {activeEffects.map(art => (
                    <div key={art.id} className="min-w-[150px] bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3 shrink-0">
                      <h5 className="text-[11px] font-bold text-emerald-100 line-clamp-1 font-display mb-1">{art.name}</h5>
                      <div className="text-[10px] text-emerald-400 font-black uppercase tracking-widest leading-tight">
                        +{art.bonusPercent}% {art.targetValue} EXP
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active enemies */}
          <div className="bg-[#0c0c0e] border border-white/5 rounded-[2rem] p-5 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] font-display">Priority targets</h4>
              <Swords className="w-4 h-4 text-zinc-600" />
            </div>

            <div className="flex-1 space-y-3">
              {activeBosses.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
                  <Target className="w-10 h-10 text-zinc-800 mx-auto mb-4" />
                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] leading-relaxed">
                    No active enemies
                  </p>
                </div>
              ) : (
                activeBosses.slice(0, 3).map(boss => {
                  const mediaItem = media.find(m => m.id === boss.mediaId);
                  const progress = (boss.currentProgress / boss.targetProgress) * 100;
                  return (
                    <div key={boss.id} className="bg-zinc-950 border border-white/5 rounded-2xl p-4 hover:border-red-500/30 transition-colors shadow-inner relative overflow-hidden">
                      <div className="absolute inset-0 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] pointer-events-none rounded-2xl" />
                      <div className="relative z-10">
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <div className="min-w-0 pr-2">
                            <h5 className="text-xs font-bold text-white truncate font-display">{boss.name}</h5>
                            {boss.title && <div className="text-[10px] text-amber-500/70 italic truncate">{boss.title}</div>}
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
                            title="Replace this enemy"
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
                        <div className="flex justify-between text-[8px] font-mono text-zinc-500 mt-1.5 gap-2">
                          <span className="truncate">{boss.currentProgress} / {boss.targetProgress} {boss.unit}</span>
                          <span className="flex items-center gap-1 whitespace-nowrap"><Clock className="w-2 h-2" /> {format(parseISO(boss.expiresAt), 'MMM d')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {activeBosses.length > 3 && (
                <Link to="/lorekeeper" className="block text-center text-[10px] text-zinc-600 hover:text-zinc-300 py-1 font-bold transition-colors">
                  + {activeBosses.length - 3} more active
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

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
