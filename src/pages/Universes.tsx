import React, { useMemo, useState } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { MediaCard } from '../components/MediaCard';
import { Search, Image, Activity, Clock, Edit3, X, Save, Globe, ListFilter } from 'lucide-react';
import { cn } from '../lib/utils';
import { MediaItem } from '../types/schema';
import { calculateScaledPages } from '../lib/scaling';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

type SortOption = 'Alphabetical' | 'Last Activity' | 'Total Master Pages' | 'Total Entry Count';

export function Universes() {
  const { media, logs, settings, franchises: savedFranchises, saveFranchise } = useMediaContext();
  const [selectedUniverse, setSelectedUniverse] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ coverImageUrl: '', description: '' });
  const [sortBy, setSortBy] = useState<SortOption>('Alphabetical');

  const COLORS = ['#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#eab308'];

  const franchiseMap = useMemo(() => {
    const fnMap = new Map<string, typeof media>();
    media.forEach(m => {
      if (m.franchises && m.franchises.length > 0) {
        m.franchises.forEach(f => {
          if (!fnMap.has(f)) fnMap.set(f, []);
          fnMap.get(f)!.push(m);
        });
      }
    });

    const entries = Array.from(fnMap.entries()).map(([name, items]) => {
      const sorted = [...items].sort((a, b) => {
        const yearA = a.year || 9999;
        const yearB = b.year || 9999;
        return yearA - yearB;
      });
      const dbEntry = savedFranchises?.find(f => f.name === name);
      
      const totalMasterPages = items.reduce((sum, item) => sum + calculateScaledPages(item, settings), 0);
      
      let lastActivityDate = 0;
      items.forEach(item => {
        const itemLogs = logs.filter(l => l.mediaId === item.id);
        const sortedLogs = itemLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const activityTime = sortedLogs[0] ? new Date(sortedLogs[0].timestamp).getTime() : 
          (item.updatedAt ? new Date(item.updatedAt).getTime() : 0);
        if (activityTime > lastActivityDate) {
          lastActivityDate = activityTime;
        }
      });

      return { 
        name, 
        items: sorted,
        coverImageUrl: dbEntry?.coverImageUrl || sorted.find(i => i.coverImageUrl)?.coverImageUrl || '',
        description: dbEntry?.description || '',
        dbId: dbEntry?.id,
        totalMasterPages,
        lastActivityDate
      };
    });

    return entries.sort((a, b) => {
        switch (sortBy) {
            case 'Last Activity':
                return b.lastActivityDate - a.lastActivityDate;
            case 'Total Master Pages':
                return b.totalMasterPages - a.totalMasterPages;
            case 'Total Entry Count':
                return b.items.length - a.items.length;
            case 'Alphabetical':
            default:
                return a.name.localeCompare(b.name);
        }
    });
  }, [media, savedFranchises, logs, settings, sortBy]);

  if (franchiseMap.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full">
        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
          <Search className="w-8 h-8 text-zinc-600" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">No Universes Found</h2>
        <p className="text-zinc-500 max-w-sm mb-6">
          You haven't assigned any franchises to your media yet. Edit a media item to add a franchise!
        </p>
      </div>
    );
  }

    const currentFranchise = selectedUniverse ? franchiseMap.find(f => f.name === selectedUniverse) : null;

  const handleSaveEdit = async () => {
    if (!currentFranchise) return;
    await saveFranchise({
      id: currentFranchise.dbId,
      name: currentFranchise.name,
      coverImageUrl: editData.coverImageUrl,
      description: editData.description
    });
    setIsEditing(false);
  };

  const typeDistribution = useMemo(() => {
    if (!currentFranchise) return [];
    const dist: Record<string, number> = {};
    currentFranchise.items.forEach(i => {
      dist[i.mediaType] = (dist[i.mediaType] || 0) + 1;
    });
    return Object.entries(dist).map(([name, value]) => ({ name, value }));
  }, [currentFranchise]);

  if (currentFranchise) {
    const totalItems = currentFranchise.items.length;
    
    // Calculate total hours
    const totalHours = currentFranchise.items.reduce((acc, i) => {
      if (i.mediaType === 'Game' || i.mediaType === 'Visual Novel') {
        const playtime = i.playtimeHours || i.averagePlaytime || 0;
        return acc + playtime;
      }
      if (i.mediaType === 'Movie' || i.mediaType === 'Series') {
        const runtime = (i.runtimeMinutes || 0) * (i.episodesWatched || 1); // rough guess if Series
        return acc + (runtime / 60);
      }
      return acc;
    }, 0);

    return (
      <div className="space-y-6 pb-10 fade-in">
        <button 
          onClick={() => setSelectedUniverse(null)}
          className="text-zinc-400 hover:text-white flex items-center gap-2 text-sm font-medium pr-4 py-2"
        >
          &larr; Back to Universes
        </button>

        <div className="relative w-full h-[300px] sm:h-[400px] rounded-2xl overflow-hidden border border-white/5 bg-zinc-900">
          {currentFranchise.coverImageUrl ? (
            <img src={currentFranchise.coverImageUrl} className="w-full h-full object-cover opacity-50" />
          ) : (
            <div className="w-full h-full bg-gradient-to-tr from-zinc-800 to-zinc-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
          <div className="absolute bottom-0 left-0 p-8 w-full flex justify-between items-end">
            <div>
              <h1 className="text-4xl sm:text-5xl font-black text-white px-1 tracking-tight drop-shadow-lg mb-2">
                {currentFranchise.name}
              </h1>
              {currentFranchise.description && (
                <p className="text-zinc-300 max-w-2xl text-sm leading-relaxed px-1">
                  {currentFranchise.description}
                </p>
              )}
            </div>
            {!isEditing && (
              <button 
                onClick={() => {
                  setEditData({ coverImageUrl: currentFranchise.coverImageUrl, description: currentFranchise.description });
                  setIsEditing(true);
                }}
                className="bg-white/10 hover:bg-white/20 text-white rounded-lg p-3 transition flex items-center gap-2 backdrop-blur-md"
              >
                <Edit3 className="w-4 h-4" />
                Edit
              </button>
            )}
          </div>
        </div>

        {isEditing && (
          <div className="bg-zinc-900 border border-white/10 p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-white text-lg">Edit Universe Details</h3>
              <button onClick={() => setIsEditing(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5"/></button>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Cover Image URL</label>
              <input 
                type="text" 
                value={editData.coverImageUrl}
                onChange={(e) => setEditData(prev => ({...prev, coverImageUrl: e.target.value}))}
                className="w-full bg-[#09090b] border border-white/10 rounded-lg px-4 py-2.5 text-white"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
              <textarea 
                value={editData.description}
                onChange={(e) => setEditData(prev => ({...prev, description: e.target.value}))}
                className="w-full bg-[#09090b] border border-white/10 rounded-lg px-4 py-2.5 text-white min-h-[100px]"
                placeholder="Optional description of this universe..."
              />
            </div>
            <div className="flex justify-end pt-2">
              <button 
                onClick={handleSaveEdit}
                className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-6 py-2.5 rounded-lg flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Details
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-[#111113] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
            <Activity className="w-6 h-6 text-orange-500 mb-2" />
            <div className="text-2xl font-black text-white">{totalItems}</div>
            <div className="text-xs text-zinc-500 font-medium uppercase tracking-widest mt-1">Total Entries</div>
          </div>
          <div className="bg-[#111113] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
            <Image className="w-6 h-6 text-purple-500 mb-2" />
            <div className="text-2xl font-black text-white">{Math.round(currentFranchise.totalMasterPages)}</div>
            <div className="text-xs text-zinc-500 font-medium uppercase tracking-widest mt-1">Master Pages</div>
          </div>
          <div className="bg-[#111113] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
            <Clock className="w-6 h-6 text-cyan-500 mb-2" />
            <div className="text-2xl font-black text-white">{Math.round(totalHours)}h</div>
            <div className="text-xs text-zinc-500 font-medium uppercase tracking-widest mt-1">Approx. Time Spent</div>
          </div>
          <div className="bg-[#111113] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center">
            <div className="w-full h-24">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeDistribution}
                    innerRadius={25}
                    outerRadius={40}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {typeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', fontSize: '10px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs text-zinc-500 font-medium uppercase tracking-widest mt-1">Media Types</div>
          </div>
        </div>

        <div className="bg-[#111113] border border-white/5 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">Timeline</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {currentFranchise.items.map((item, idx) => (
              <div key={item.id} className="relative group">
                <div className="absolute top-2 left-2 w-6 h-6 bg-black/80 backdrop-blur-md rounded-full z-10 flex items-center justify-center border border-white/10 text-[10px] font-bold text-white shadow-2xl">
                  {idx + 1}
                </div>
                <MediaCard item={item} />
              </div>
            ))}
          </div>
        </div>

      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10 fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black text-white px-1 tracking-tight">Universes</h1>
          <p className="text-zinc-400 mt-1 px-1">Cross-media continuity hubs.</p>
        </div>

        <div className="flex items-center gap-2 bg-[#111113] border border-white/5 p-1 rounded-xl">
          {(['Alphabetical', 'Last Activity', 'Total Master Pages', 'Total Entry Count'] as SortOption[]).map((option) => (
            <button
              key={option}
              onClick={() => setSortBy(option)}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                sortBy === option 
                  ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" 
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {franchiseMap.map(franchise => (
          <div 
            key={franchise.name} 
            onClick={() => setSelectedUniverse(franchise.name)}
            className="group relative h-48 rounded-2xl overflow-hidden cursor-pointer border border-white/5"
          >
            {franchise.coverImageUrl ? (
              <img src={franchise.coverImageUrl} className="w-full h-full object-cover transition duration-500 group-hover:scale-110 opacity-60 group-hover:opacity-80" />
            ) : (
              <div className="w-full h-full bg-zinc-800 transition duration-500 group-hover:bg-zinc-700 flex items-center justify-center">
                <Globe className="w-10 h-10 text-white/10" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-5">
              <h2 className="text-xl font-bold text-white mb-1 group-hover:text-orange-400 transition-colors drop-shadow-md">{franchise.name}</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-zinc-300 bg-white/20 backdrop-blur-md px-2 py-1 rounded-full drop-shadow">
                  {franchise.items.length} Entries
                </span>
                <span className="text-xs text-zinc-400 drop-shadow">
                  {Math.round(franchise.totalMasterPages)} MP
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

