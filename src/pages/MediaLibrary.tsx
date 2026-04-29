import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMediaContext } from '../contexts/MediaContext';
import { MediaCard } from '../components/MediaCard';
import { MediaFormModal } from '../components/MediaFormModal';
import { MediaDetailModal } from '../components/MediaDetailModal';
import { ProgressModal } from '../components/ProgressModal';
import { FilterSortBar } from '../components/FilterSortBar';
import { useMediaFilterSort } from '../hooks/useMediaFilterSort';
import { MediaItem, MediaType } from '../types/schema';
import { Plus, Search } from 'lucide-react';

export function MediaLibrary() {
  const { mediaType } = useParams<{ mediaType: string }>();
  const { media, logs, saveMediaItem, addLog, deleteMediaItem } = useMediaContext();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MediaItem | undefined>(undefined);
  
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
  
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [progressItem, setProgressItem] = useState<MediaItem | null>(null);

  const decodedMediaType = decodeURIComponent(mediaType || '') as MediaType;

  const baseMediaItems = media.filter(m => m.mediaType === decodedMediaType);
  
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
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 bg-gradient-to-br from-zinc-900 to-[#0A0A0C] border border-white/5 rounded-3xl p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.05] mix-blend-overlay"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]"></span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 font-display">The Vault</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-black text-white font-display tracking-tight leading-none mb-2">{decodedMediaType}s</h2>
          <p className="text-zinc-400 font-medium italic">Your entire history, collection, and backlog.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 relative z-10 w-full md:w-auto">
          <FilterSortBar 
            statusFilters={statusFilters}
            setStatusFilters={setStatusFilters}
            sortBy={sortBy}
            setSortBy={(val) => setSortBy(val as any)}
          />
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black/50 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500 w-full backdrop-blur-md transition-shadow focus:shadow-[0_0_15px_rgba(249,115,22,0.2)] font-medium"
            />
          </div>
          <button 
            onClick={handleAddNew}
            className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_30px_rgba(249,115,22,0.5)] shrink-0 font-display mt-2 sm:mt-0 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Inscribe Record
          </button>
        </div>
      </header>

      {libraryMedia.length === 0 ? (
        <div className="bg-gradient-to-br from-zinc-900/30 to-black border-2 border-dashed border-white/5 rounded-[2.5rem] p-16 text-center shadow-inner flex-1 flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900/80 border border-white/5 flex items-center justify-center mx-auto mb-6 shadow-md shadow-black">
             <Search className="w-8 h-8 text-zinc-700" />
          </div>
          <h3 className="text-xl font-black text-white font-display mb-2">Vault is Empty</h3>
          <p className="text-zinc-500 font-medium">No {decodedMediaType.toLowerCase()}s found matching your current filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4 flex-1 items-start">
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
