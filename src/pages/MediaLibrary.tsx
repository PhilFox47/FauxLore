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
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-semibold">{decodedMediaType}s</h2>
          <p className="text-zinc-500 text-sm">Your entire history and collection.</p>
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

      {libraryMedia.length === 0 ? (
        <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-12 text-center flex-1 flex flex-col items-center justify-center min-h-[400px]">
          <p className="text-zinc-500 mb-4">No {decodedMediaType.toLowerCase()}s found in your library.</p>
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
