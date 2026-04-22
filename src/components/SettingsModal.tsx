import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { DatabaseService } from '../services/db';
import { useMediaContext } from '../contexts/MediaContext';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { refreshData } = useMediaContext();
  const [formData, setFormData] = useState({
    igdbClientId: '',
    igdbClientSecret: '',
    tmdbApiKey: '',
    hardcoverApiKey: '',
    timezone: '',
    yearlyGoals: {
      'Game': 100,
      'Book': 5000,
      'Visual Novel': 50,
      'Manga': 200,
      'Series': 100,
      'Movie': 20,
      'Comic': 100
    } as Record<string, number>,
    gamePagesPerHour: 12,
    vnPagesPerHour: 24,
    mangaPagesPerChapter: 5,
    comicPagesPerIssue: 20,
    episodesWatchedMultiplier: 30,
    moviePagesPerMovie: 100,
    runtimeMinutesPerPage: 2.5
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await DatabaseService.getSettings();
        setFormData({
          igdbClientId: settings.igdbClientId || '',
          igdbClientSecret: settings.igdbClientSecret || '',
          tmdbApiKey: settings.tmdbApiKey || '',
          hardcoverApiKey: settings.hardcoverApiKey || '',
          timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '',
          yearlyGoals: {
            'Game': settings.yearlyGoals?.['Game'] ?? 100,
            'Book': settings.yearlyGoals?.['Book'] ?? 5000,
            'Visual Novel': settings.yearlyGoals?.['Visual Novel'] ?? 50,
            'Manga': settings.yearlyGoals?.['Manga'] ?? 200,
            'Series': settings.yearlyGoals?.['Series'] ?? 100,
            'Movie': settings.yearlyGoals?.['Movie'] ?? 20,
            'Comic': settings.yearlyGoals?.['Comic'] ?? 100
          },
          gamePagesPerHour: settings.masterPageConfig?.gamePagesPerHour ?? 12,
          vnPagesPerHour: settings.masterPageConfig?.vnPagesPerHour ?? 24,
          mangaPagesPerChapter: settings.masterPageConfig?.mangaPagesPerChapter ?? 5,
          comicPagesPerIssue: settings.masterPageConfig?.comicPagesPerIssue ?? 20,
          episodesWatchedMultiplier: settings.masterPageConfig?.episodesWatchedMultiplier ?? 30,
          moviePagesPerMovie: settings.masterPageConfig?.moviePagesPerMovie ?? 100,
          runtimeMinutesPerPage: settings.masterPageConfig?.runtimeMinutesPerPage ?? 2.5
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load settings');
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, step } = e.target;
    // Allow float inputs for step decimals
    if (name.startsWith('yearly__')) {
       const key = name.replace('yearly__', '');
       setFormData(prev => ({
         ...prev,
         yearlyGoals: {
           ...prev.yearlyGoals,
           [key]: type === 'number' ? (step ? parseFloat(value) : parseInt(value, 10)) : value
         }
       }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' ? (step ? parseFloat(value) : parseInt(value, 10)) : value
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await DatabaseService.saveSettings({
        userId: 'default_user', // Will be dynamic when auth is added
        igdbClientId: formData.igdbClientId,
        igdbClientSecret: formData.igdbClientSecret,
        tmdbApiKey: formData.tmdbApiKey,
        hardcoverApiKey: formData.hardcoverApiKey,
        timezone: formData.timezone,
        masterPageConfig: {
          gamePagesPerHour: formData.gamePagesPerHour,
          vnPagesPerHour: formData.vnPagesPerHour,
          mangaPagesPerChapter: formData.mangaPagesPerChapter,
          comicPagesPerIssue: formData.comicPagesPerIssue,
          episodesWatchedMultiplier: formData.episodesWatchedMultiplier,
          moviePagesPerMovie: formData.moviePagesPerMovie,
          runtimeMinutesPerPage: formData.runtimeMinutesPerPage
        },
        yearlyGoals: formData.yearlyGoals
      });
      await refreshData();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-[#09090B] border border-white/5 rounded-2xl md:rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative z-50 shadow-2xl">
        <div className="p-4 md:p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#09090B] z-10">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">System Settings</h2>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>

        <div className="p-4 md:p-6 overflow-y-auto no-scrollbar">
          {error && (
             <div className="mb-4 bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl text-sm">
               {error}
             </div>
          )}

          {isLoading ? (
            <div className="flex justify-center items-center py-20 text-zinc-500">
              <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <form id="settings-form" onSubmit={handleSubmit} className="space-y-8">
              
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">General Settings</h3>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Timezone</label>
                  <input 
                    name="timezone"
                    value={formData.timezone}
                    onChange={handleChange}
                    className="input-field" 
                    placeholder="e.g. America/Los_Angeles"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">Used for syncing logs to accurate local dates.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">RPG Progression System</h3>
                </div>
                <p className="text-xs text-zinc-500 mb-2">Configure your Yearly goals per Media Type. These targets dynamically influence your weekly, monthly, and yearly quests.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries({
                     'Game': { label: 'Games', unit: 'Hours Played' },
                     'Book': { label: 'Books', unit: 'Pages Read' },
                     'Visual Novel': { label: 'Visual Novels', unit: 'Hours Played' },
                     'Manga': { label: 'Manga', unit: 'Chapters Read' },
                     'Series': { label: 'Series', unit: 'Episodes Watched' },
                     'Movie': { label: 'Movies', unit: 'Movies Watched' },
                     'Comic': { label: 'Comics', unit: 'Issues Read' }
                  }).map(([key, config]) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">{config.label} ({config.unit})</label>
                      <input 
                        type="number"
                        name={`yearly__${key}`}
                        value={formData.yearlyGoals[key as keyof typeof formData.yearlyGoals]}
                        onChange={handleChange}
                        className="input-field" 
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Master Page Formatting</h3>
                </div>
                <p className="text-xs text-zinc-500 mb-2">Configure how diverse media types convert into a unified "Master Page" standard for cross-media tracking.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Book: 1 Page =</label>
                    <div className="relative text-zinc-500 font-medium px-4 py-2 border border-white/5 rounded-xl bg-white/5">
                       1 Page (Fixed)
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Game: 1 Hour = </label>
                    <div className="relative">
                      <input 
                        type="number"
                        name="gamePagesPerHour"
                        value={formData.gamePagesPerHour}
                        onChange={handleChange}
                        className="input-field pr-16" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">Pages</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Visual Novel: 1 Hour = </label>
                    <div className="relative">
                      <input 
                        type="number"
                        name="vnPagesPerHour"
                        value={formData.vnPagesPerHour}
                        onChange={handleChange}
                        className="input-field pr-16" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">Pages</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Manga: 1 Chapter = </label>
                    <div className="relative">
                      <input 
                        type="number"
                        name="mangaPagesPerChapter"
                        value={formData.mangaPagesPerChapter}
                        onChange={handleChange}
                        className="input-field pr-16" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">Pages</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Comic: 1 Issue = </label>
                    <div className="relative">
                      <input 
                        type="number"
                        name="comicPagesPerIssue"
                        value={formData.comicPagesPerIssue}
                        onChange={handleChange}
                        className="input-field pr-16" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">Pages</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Default: 1 Episode = </label>
                    <div className="relative">
                      <input 
                        type="number"
                        name="episodesWatchedMultiplier"
                        value={formData.episodesWatchedMultiplier}
                        onChange={handleChange}
                        className="input-field pr-16" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">Pages</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Default: 1 Movie = </label>
                    <div className="relative">
                      <input 
                        type="number"
                        name="moviePagesPerMovie"
                        value={formData.moviePagesPerMovie}
                        onChange={handleChange}
                        className="input-field pr-16" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">Pages</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1 flex items-center justify-between">
                       Movie/TV Runtime Preference
                       <span className="text-[10px] text-zinc-500 bg-black px-1.5 py-0.5 rounded-sm">Preferred</span>
                    </label>
                    <div className="relative">
                      <input 
                        type="number"
                        step="0.5"
                        name="runtimeMinutesPerPage"
                        value={formData.runtimeMinutesPerPage}
                        onChange={handleChange}
                        className="input-field pr-32" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium border-l border-white/10 pl-3">Mins per Page</span>
                    </div>
                  </div>

                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">API Integrations</h3>
                </div>
                <p className="text-xs text-zinc-500 mb-2">Provide keys for metadata fetching. If left empty, FauxLore will attempt to fallback to server environment variables.</p>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">IGDB Client ID (Games/VN)</label>
                    <input 
                      name="igdbClientId"
                      value={formData.igdbClientId}
                      onChange={handleChange}
                      className="input-field" 
                      placeholder="Client ID..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">IGDB Client Secret (Games/VN)</label>
                    <input 
                      type="password"
                      name="igdbClientSecret"
                      value={formData.igdbClientSecret}
                      onChange={handleChange}
                      className="input-field" 
                      placeholder="Client Secret..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">TMDB API Key (Movies/Series / Read Access Token)</label>
                    <input 
                      type="password"
                      name="tmdbApiKey"
                      value={formData.tmdbApiKey}
                      onChange={handleChange}
                      className="input-field" 
                      placeholder="eyJhbG..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Hardcover API Key (Books)</label>
                    <input 
                      type="password"
                      name="hardcoverApiKey"
                      value={formData.hardcoverApiKey}
                      onChange={handleChange}
                      className="input-field" 
                      placeholder="Bearer ..."
                    />
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        <div className="p-4 md:p-6 border-t border-white/5 bg-zinc-900/50 flex justify-end gap-3 sticky bottom-0">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            form="settings-form"
            disabled={isLoading || isSaving}
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-lg shadow-indigo-900/20"
          >
            {isSaving ? (
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
