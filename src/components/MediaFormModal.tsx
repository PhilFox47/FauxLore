import React, { useState, useEffect } from 'react';
import { MediaItem, MEDIA_TYPES, STATUSES, MediaType } from '../types/schema';
import { X, Search, Loader2 } from 'lucide-react';
import { IntegrationsService, GameMetadata } from '../services/integrations';

interface MediaFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }) => void;
  onDelete?: (id: string) => void;
  initialData?: MediaItem;
}

export function MediaFormModal({ isOpen, onClose, onSave, onDelete, initialData }: MediaFormModalProps) {
  const [formData, setFormData] = useState<Partial<MediaItem>>({
    title: '',
    mediaType: 'Game',
    status: 'Active',
  });

  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [selectedSeriesForSeasons, setSelectedSeriesForSeasons] = useState<any | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({ title: '', mediaType: 'Game', status: 'Active' });
    }
    setSearchResults(null);
    setSelectedSeriesForSeasons(null);
    setIsConfirmingDelete(false);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as any;
    let finalValue = value;
    if (type === 'number') {
      finalValue = value === '' ? undefined : Number(value);
    }
    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleArrayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value.split(',').map(s => s.trim()).filter(Boolean)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.mediaType || !formData.status) return;

    let finalData = { ...formData };

    if (finalData.status === 'Completed' && typeof finalData.userRating !== 'number') {
      const ratingStr = window.prompt(`You've completed ${finalData.title}! How would you rate it from 1 to 5?`);
      if (ratingStr && !isNaN(Number(ratingStr))) {
        let rating = Number(ratingStr);
        if (rating < 0) rating = 0;
        if (rating > 5) rating = 5;
        finalData.userRating = rating;
      }
    }

    onSave(finalData as any);
    onClose();
  };

  const handleSearchMetadata = async () => {
    if (!formData.title) return;
    setIsSearching(true);
    setSearchResults(null);
    setSelectedSeriesForSeasons(null);
    try {
      if (formData.mediaType === 'Game') {
        const results = await IntegrationsService.searchGameMetadata(formData.title);
        setSearchResults(results);
      } else if (formData.mediaType === 'Visual Novel') {
        const results = await IntegrationsService.searchVNDBMetadata(formData.title);
        setSearchResults(results);
      } else if (formData.mediaType === 'Book') {
        const results = await IntegrationsService.searchBookMetadata(formData.title);
        setSearchResults(results);
      } else if (formData.mediaType === 'Movie' || formData.mediaType === 'Series') {
        const results = await IntegrationsService.searchTMDBMetadata(formData.title, formData.mediaType);
        setSearchResults(results);
      } else if (formData.mediaType === 'Manga') {
        const results = await IntegrationsService.searchAnilistMetadata(formData.title);
        setSearchResults(results);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to search metadata. Please ensure API keys are configured in Settings > Environment Variables.');
    } finally {
      setIsSearching(false);
    }
  };

  const applySearchResult = (match: any) => {
    if (formData.mediaType === 'Series' && match.seasons && match.seasons.length > 0) {
      setSelectedSeriesForSeasons(match);
      setSearchResults(null);
      return;
    }

    setFormData(prev => ({
      ...prev,
      title: match.title,
      description: match.description,
      creator: match.creator || match.developer || match.author, // Handle different API schemas
      publisher: match.publisher,
      year: match.year,
      genres: match.genres || [],
      tags: match.tags || [],
      reviewScore: match.reviewScore,
      averagePlaytime: match.averagePlaytime,
      totalPages: match.totalPages,
      totalEpisodes: match.totalEpisodes,
      totalChapters: match.totalChapters,
      runtimeMinutes: match.runtimeMinutes,
      coverImageUrl: match.coverImageUrl,
    }));
    setSearchResults(null);
  };

  const applySeason = (series: any, season: any) => {
    setFormData(prev => ({
      ...prev,
      title: `${series.title} - ${season.name}`,
      description: season.overview || series.description,
      creator: series.creator || series.developer || series.author,
      publisher: series.publisher,
      year: season.airDate ? new Date(season.airDate).getFullYear() : series.year,
      genres: series.genres || [],
      tags: series.tags || [],
      reviewScore: season.voteAverage ? Math.round(season.voteAverage) / 2 : series.reviewScore,
      totalEpisodes: season.episodeCount,
      runtimeMinutes: series.runtimeMinutes,
      coverImageUrl: season.posterPath || series.coverImageUrl,
      season: season.seasonNumber,
    }));
    setSelectedSeriesForSeasons(null);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl relative">
        <div className="flex justify-between items-center p-6 border-b border-white/5">
          <h2 className="text-xl font-bold text-white">
            {initialData ? 'Edit Media' : 'Add Media'}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="relative z-10 block">
            <label className="block text-sm font-medium text-zinc-400 mb-1">Title *</label>
            <div className="flex gap-2">
              <input 
                required
                name="title"
                value={formData.title}
                onChange={handleChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault(); // Prevent form submission
                    if (formData.title && !isSearching) {
                      handleSearchMetadata();
                    }
                  }
                }}
                className="input-field" 
                placeholder="E.g., The Witcher 3"
              />
              {['Game', 'Book', 'Movie', 'Series', 'Visual Novel', 'Manga'].includes(formData.mediaType) && (
                <button
                  type="button"
                  onClick={handleSearchMetadata}
                  disabled={isSearching || !formData.title}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Auto-fill
                </button>
              )}
            </div>

            {/* Autofill Results */}
            {searchResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 w-full mt-2 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1 max-h-64 overflow-y-auto">
                <div className="flex justify-between items-center px-2 py-1 mb-1">
                   <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Select Match</span>
                   <button type="button" onClick={() => setSearchResults(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                {searchResults.map((res, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applySearchResult(res)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition flex justify-between items-center group border border-transparent hover:border-white/5 gap-4"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white line-clamp-2 group-hover:text-orange-400 transition-colors">
                        {res.title} <span className="text-zinc-500 font-normal">({res.year})</span>
                      </div>
                      <div className="text-xs text-zinc-400 truncate mt-0.5">
                        {formData.mediaType === 'Game' || formData.mediaType === 'Visual Novel' ? (
                          <>{res.developer || res.creator} • {res.reviewScore ? `${res.reviewScore}/5` : 'No Rating'} • {res.averagePlaytime ? `${res.averagePlaytime}h` : 'N/A'}</>
                        ) : formData.mediaType === 'Movie' ? (
                           <>{res.creator || 'Unknown Director'} • {res.reviewScore ? `${res.reviewScore}/5` : 'No Rating'} • {res.runtimeMinutes ? `${res.runtimeMinutes} mins` : 'N/A'}</>
                        ) : formData.mediaType === 'Series' ? (
                           <>{res.creator || 'Unknown Creator'} • {res.reviewScore ? `${res.reviewScore}/5` : 'No Rating'} • {res.seasons ? `${res.seasons.length} Seasons` : 'N/A'} • {res.runtimeMinutes ? `~${res.runtimeMinutes}m/ep` : 'N/A'}</>
                        ) : formData.mediaType === 'Manga' ? (
                          <>{res.creator || 'Unknown Creator'} • {res.reviewScore ? `${res.reviewScore}/5` : 'No Rating'} • {res.totalChapters ? `${res.totalChapters} Ch` : 'Ongoing/Unknown'}</>
                        ) : (
                          <>{res.creator || 'Unknown Author'} • {res.reviewScore ? `${res.reviewScore}/5` : 'No Rating'} • {res.totalPages ? `${res.totalPages} pages` : 'N/A'}</>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Season Selection */}
            {selectedSeriesForSeasons && (
              <div className="absolute top-full left-0 w-full mt-2 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1 max-h-64 overflow-y-auto">
                <div className="flex justify-between items-center px-2 py-1 mb-1">
                   <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Select Season for {selectedSeriesForSeasons.title}</span>
                   <button type="button" onClick={() => setSelectedSeriesForSeasons(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                {selectedSeriesForSeasons.seasons.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => applySeason(selectedSeriesForSeasons, s)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition flex justify-between items-center group border border-transparent hover:border-white/5 gap-4"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white line-clamp-2 group-hover:text-orange-400 transition-colors">
                        {s.name} <span className="text-zinc-500 font-normal">({s.seasonNumber})</span>
                      </div>
                      <div className="text-xs text-zinc-400 truncate mt-0.5">
                        {s.episodeCount} Episodes • {s.airDate ? new Date(s.airDate).getFullYear() : 'Unknown Year'} • {s.voteAverage ? `${Math.round(s.voteAverage) / 2}/5` : 'No Rating'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-0">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Type *</label>
              <select 
                name="mediaType" 
                value={formData.mediaType} 
                onChange={handleChange}
                className="input-field"
              >
                {MEDIA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Status *</label>
              <select 
                name="status" 
                value={formData.status} 
                onChange={handleChange}
                className="input-field"
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {formData.mediaType === 'Game' || formData.mediaType === 'Visual Novel' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Developer</label>
                <input 
                  name="creator"
                  value={formData.creator || ''}
                  onChange={handleChange}
                  className="input-field" 
                  placeholder="CD Projekt Red"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Publisher</label>
                <input 
                  name="publisher"
                  value={formData.publisher || ''}
                  onChange={handleChange}
                  className="input-field" 
                  placeholder="Warner Bros"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Release Year</label>
                <input 
                  type="number"
                  name="year"
                  value={formData.year || ''}
                  onChange={handleChange}
                  className="input-field" 
                  placeholder="2015"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Review Score (0-5)</label>
                <input 
                  type="number"
                  name="reviewScore"
                  step="0.5"
                  min="0"
                  max="5"
                  value={formData.reviewScore === undefined ? '' : formData.reviewScore}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(p => ({...p, reviewScore: val === '' ? undefined : Number(val) }));
                  }} 
                  className="input-field" 
                  placeholder="Leave unrated"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Genres (comma separated)</label>
                <input 
                  name="genres"
                  value={formData.genres?.join(', ') || ''}
                  onChange={handleArrayChange}
                  className="input-field" 
                  placeholder="RPG, Open World"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Tags (comma separated)</label>
                <input 
                  name="tags"
                  value={formData.tags?.join(', ') || ''}
                  onChange={handleArrayChange}
                  className="input-field" 
                  placeholder="Fantasy, Story Rich"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  {formData.mediaType === 'Movie' ? 'Director' : 
                   formData.mediaType === 'Series' ? 'Creator / Showrunner' : 
                   formData.mediaType === 'Book' ? 'Author' : 
                   formData.mediaType === 'Manga' ? 'Mangaka (Writer / Artist)' :
                   'Creator / Author / Studio'}
                </label>
                <input 
                  name="creator"
                  value={formData.creator || ''}
                  onChange={handleChange}
                  className="input-field" 
                  placeholder={
                    formData.mediaType === 'Movie' ? 'e.g., Christopher Nolan' : 
                    formData.mediaType === 'Series' ? 'e.g., Craig Mazin' : 
                    formData.mediaType === 'Book' ? 'e.g., Brandon Sanderson' : 
                    formData.mediaType === 'Manga' ? 'e.g., Kentaro Miura' :
                    'Enter creator name'
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Release Year</label>
                <input 
                  type="number"
                  name="year"
                  value={formData.year || ''}
                  onChange={handleChange}
                  className="input-field" 
                  placeholder="2015"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Review Score (0-5)</label>
                <input 
                  type="number"
                  name="reviewScore"
                  step="0.5"
                  min="0"
                  max="5"
                  value={formData.reviewScore === undefined ? '' : formData.reviewScore}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(p => ({...p, reviewScore: val === '' ? undefined : Number(val) }));
                  }} 
                  className="input-field" 
                  placeholder="Leave unrated"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-zinc-400 mb-1">Genres (comma separated)</label>
                <input 
                  name="genres"
                  value={formData.genres?.join(', ') || ''}
                  onChange={handleArrayChange}
                  className="input-field" 
                  placeholder="Fantasy, Sci-Fi"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
            <textarea 
              name="description"
              value={formData.description || ''}
              onChange={(e) => setFormData(p => ({...p, description: e.target.value}))}
              className="input-field min-h-[80px]" 
              placeholder="A brief summary..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Cover Image URL</label>
            <input 
              name="coverImageUrl"
              value={formData.coverImageUrl || ''}
              onChange={handleChange}
              className="input-field" 
              placeholder="https://..."
            />
          </div>

          {/* Dynamic Fields Based on MediaType */}
          <div className="pt-4 border-t border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Tracking Metrics</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-amber-500/80 mb-1">Your Rating (0-5)</label>
                <input 
                  type="number" 
                  name="userRating" 
                  step="0.5" 
                  min="0" 
                  max="5" 
                  value={formData.userRating === undefined ? '' : formData.userRating} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(p => ({...p, userRating: val === '' ? undefined : Number(val) }));
                  }} 
                  className="input-field border-amber-500/20 focus:border-amber-500/50" 
                  placeholder="Leave blank for unrated" 
                />
              </div>
            </div>

            {(formData.mediaType === 'Game' || formData.mediaType === 'Visual Novel') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Your Playtime (Hours)</label>
                  <input type="number" name="playtimeHours" value={formData.playtimeHours || ''} onChange={handleChange} className="input-field" placeholder="0" />
                </div>
                {formData.mediaType === 'Game' && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Avg. Playtime (HLTB)</label>
                    <input type="number" name="averagePlaytime" value={formData.averagePlaytime || ''} onChange={handleChange} className="input-field" placeholder="0" />
                  </div>
                )}
              </div>
            )}

            {formData.mediaType === 'Series' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Season</label>
                  <input type="number" name="season" value={formData.season || ''} onChange={handleChange} className="input-field" placeholder="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Episode Runtime (mins)</label>
                  <input type="number" name="runtimeMinutes" value={formData.runtimeMinutes || ''} onChange={handleChange} className="input-field" placeholder="30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Episodes Watched</label>
                  <input type="number" name="episodesWatched" value={formData.episodesWatched || ''} onChange={handleChange} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Total Episodes</label>
                  <input type="number" name="totalEpisodes" value={formData.totalEpisodes || ''} onChange={handleChange} className="input-field" placeholder="0" />
                </div>
              </div>
            )}

            {formData.mediaType === 'Book' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Pages Read</label>
                  <input type="number" name="pagesRead" value={formData.pagesRead || ''} onChange={handleChange} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Total Pages</label>
                  <input type="number" name="totalPages" value={formData.totalPages || ''} onChange={handleChange} className="input-field" placeholder="0" />
                </div>
              </div>
            )}

            {formData.mediaType === 'Manga' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Chapters Read</label>
                  <input type="number" name="chaptersRead" value={formData.chaptersRead || ''} onChange={handleChange} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Total Chapters</label>
                  <input type="number" name="totalChapters" value={formData.totalChapters || ''} onChange={handleChange} className="input-field" placeholder="0" />
                </div>
              </div>
            )}

            {formData.mediaType === 'Comic' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Issues Read</label>
                  <input type="number" name="issuesRead" value={formData.issuesRead || ''} onChange={handleChange} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Total Issues</label>
                  <input type="number" name="totalIssues" value={formData.totalIssues || ''} onChange={handleChange} className="input-field" placeholder="0" />
                </div>
              </div>
            )}

            {formData.mediaType === 'Movie' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Watch Count</label>
                  <input type="number" name="watchCount" value={formData.watchCount || ''} onChange={handleChange} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Runtime (mins)</label>
                  <input type="number" name="runtimeMinutes" value={formData.runtimeMinutes || ''} onChange={handleChange} className="input-field" placeholder="120" />
                </div>
                <div className="col-span-1 sm:col-span-2 flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="watched" checked={!!formData.watched} onChange={(e) => setFormData(p => ({...p, watched: e.target.checked}))} className="w-5 h-5 accent-orange-500 rounded bg-zinc-800" />
                    <span className="text-sm font-medium text-zinc-400">Watched?</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="p-6 border-t border-white/5 flex justify-between items-center bg-[#09090B] relative z-20">
          <div>
            {initialData && onDelete && (
              isConfirmingDelete ? (
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    onClick={() => {
                      onDelete(initialData.id);
                      onClose();
                    }} 
                    className="px-4 py-2 rounded-xl font-medium bg-red-600 text-white hover:bg-red-500 transition shadow-lg shadow-red-900/20"
                  >
                    Confirm Delete
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setIsConfirmingDelete(false)} 
                    className="px-4 py-2 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button 
                  type="button" 
                  onClick={() => setIsConfirmingDelete(true)} 
                  className="px-4 py-2 rounded-xl font-medium text-red-500 hover:text-white hover:bg-red-500/20 transition"
                >
                  Delete
                </button>
              )
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} className="px-4 py-2 rounded-xl font-medium bg-orange-600 text-white hover:bg-orange-500 transition shadow-lg shadow-orange-900/20">
              Save Media
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
