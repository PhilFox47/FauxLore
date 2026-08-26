import React, { useState, useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { useAuth } from '../contexts/AuthContext';
import { Search, Plus, Trash2, Tag, BookOpen, Hexagon, BarChart, Settings, BrainCircuit, ListFilter, X, ArrowRightLeft, Pencil, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { DatabaseService } from '../services/db';
import { generateText } from '../services/nanoGptService';
import { MediaFormModal } from '../components/MediaFormModal';
import { useToast } from '../contexts/ToastContext';
import { analyticalModel } from '../lib/aiModels';

export function Taxonomy() {
  const { taxonomies, addTaxonomy, deleteTaxonomy, moveTaxonomy, editTaxonomy, media, saveMediaItem, deleteMediaItem, settings } = useMediaContext();
  const { user } = useAuth();
  const toast = useToast();
  
  const [activeTab, setActiveTab] = useState<'genre' | 'tag'>('genre');
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migratingId, setMigratingId] = useState<string|null>(null);
  const [sortBy, setSortBy] = useState<'Alphabetical' | 'Usage Count'>('Alphabetical');
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<{id: string; name: string; type: string} | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [missingFilter, setMissingFilter] = useState<'any' | 'tags' | 'franchise'>('any');

  const isAdmin = user?.role === 'Admin';

  // Media missing tags and/or a franchise — surfaced so gaps are easy to find & fix.
  //
  // Missing tags is only a gap once the thing exists. An unreleased entry has no
  // Codex yet, deliberately: there is nothing to research, so auto-tagging is
  // parked until release and fills them in then. Listing it here would be asking
  // the user to do by hand the one job the app is waiting to do for them.
  //
  // A missing franchise is a gap either way — that is set by hand, and whether
  // something belongs to a series is knowable long before it ships.
  const mediaMissingInfo = useMemo(() => {
    return media
      .map(m => ({
        item: m,
        noTags: m.status !== 'Unreleased' && (!m.tags || m.tags.length === 0),
        noFranchise: !m.franchises || m.franchises.length === 0,
      }))
      .filter(x => x.noTags || x.noFranchise)
      .filter(x => missingFilter === 'any' ? true : missingFilter === 'tags' ? x.noTags : x.noFranchise);
  }, [media, missingFilter]);

  const missingTaxonomyMedia = useMemo(() => {
    const globalGenres = taxonomies.filter(t => t.type === 'genre').map(t => t.name.toLowerCase().trim());
    const globalTags = taxonomies.filter(t => t.type === 'tag').map(t => t.name.toLowerCase().trim());

    return media.map(m => {
      const missingGenres = m.genres?.filter(g => !globalGenres.includes(g.toLowerCase().trim())) || [];
      const missingTags = m.tags?.filter(t => !globalTags.includes(t.toLowerCase().trim())) || [];
      return { ...m, missingGenres, missingTags };
    }).filter(m => m.missingGenres.length > 0 || m.missingTags.length > 0);
  }, [media, taxonomies]);

  const mediaWithSelectedTaxonomy = useMemo(() => {
    if (!selectedTaxonomy) return [];
    const searchName = selectedTaxonomy.name.toLowerCase().trim();
    if (selectedTaxonomy.type === 'genre') {
      return media.filter(m => m.genres?.some(g => g.toLowerCase().trim() === searchName));
    } else {
      return media.filter(m => m.tags?.some(t => t.toLowerCase().trim() === searchName));
    }
  }, [selectedTaxonomy, media]);

  const filteredItems = useMemo(() => {
    let result = taxonomies
      .filter(t => t.type === activeTab)
      .filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

    if (sortBy === 'Alphabetical') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      result.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    }
    return result;
  }, [taxonomies, activeTab, search, sortBy]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !isAdmin) return;
    setIsAdding(true);
    try {
      await addTaxonomy(newName.trim(), activeTab);
      setNewName('');
    } catch (error) {
      console.error(error);
      toast.error('Failed to add ' + activeTab);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin || !confirm(`Are you sure you want to delete this ${activeTab}?`)) return;
    try {
      await deleteTaxonomy(id);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete ' + activeTab);
    }
  };

  const handleMove = async (id: string, name: string) => {
    if (!isAdmin || !confirm(`Are you sure you want to move "${name}" to ${activeTab === 'genre' ? 'tags' : 'genres'}? This will also update all media items using it.`)) return;
    try {
      await moveTaxonomy(id);
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to move taxonomy: ' + error.message);
    }
  };

  const handleEdit = async (id: string, currentName: string) => {
    if (!isAdmin) return;
    const newName = prompt(`Enter new name for ${activeTab} "${currentName}":\nThis will also update all media items using it.`, currentName);
    if (!newName || newName.trim() === '' || newName.trim() === currentName) return;
    
    try {
      await editTaxonomy(id, newName.trim());
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to edit taxonomy: ' + error.message);
    }
  };

  const handleAutoTagItem = async (mId: string) => {
    if (!settings?.nanoGptApiKey) {
      toast.error("NanoGPT API Key is missing in Settings.");
      return;
    }
    const itemToTag = media.find(m => m.id === mId);
    if (!itemToTag) return;

    setMigratingId(mId);
    try {
      const gptSystem = `You are FauxLore, an expert taxonomy system. Your job is to classify media.
Available Genres: ${taxonomies.filter(t => t.type === 'genre').map(t => t.name).join(', ')}
Available Tags: ${taxonomies.filter(t => t.type === 'tag').map(t => t.name).join(', ')}

Rules:
1. ONLY use exact matches from the Available lists above. DO NOT invent new words.
2. Select between 1 and 5 Genres. Order them from most defining/important to least.
3. Select between 3 and 15 logical Tags. Order them from most defining/important to least.
4. Return ONLY a pure JSON object in this exact format:
{"genres": ["Genre1", "Genre2"], "tags": ["Tag1", "Tag2"]}
Do not wrap it in markdown. Do not include any explanations.`;

      const gptUser = `Please tag the following media:
Title: ${itemToTag.title}
Type: ${itemToTag.mediaType}
Description: ${itemToTag.description || 'N/A'}
Legacy Context genres: ${itemToTag.genres?.join(', ') || 'N/A'}
Legacy Context tags: ${itemToTag.tags?.join(', ') || 'N/A'}
Legacy Context platforms: ${itemToTag.platforms?.join(', ') || 'N/A'}

Return JSON only.`;

      const aiResponseText = await generateText(settings.nanoGptApiKey, analyticalModel(settings), gptSystem, gptUser);
      let parsed = null;
      try {
        parsed = JSON.parse(aiResponseText.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (e) {
        throw new Error("AI returned invalid JSON: " + aiResponseText);
      }

      if (parsed && Array.isArray(parsed.genres) && Array.isArray(parsed.tags)) {
        await saveMediaItem({
          ...itemToTag,
          genres: parsed.genres,
          tags: parsed.tags
        });
        toast.success(`Auto-tagged ${itemToTag.title}`);
      } else {
        throw new Error("AI returned an unexpected format.");
      }
    } catch (error: any) {
      console.error("AutoTag Error:", error);
      toast.error("Auto Tag Failed: " + error.message);
    } finally {
      setMigratingId(null);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 max-w-7xl mx-auto h-[calc(100vh-8rem)]">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#121214] p-6 rounded-2xl border border-white/10 shadow-xl">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Hexagon className="w-6 h-6 text-orange-500" />
            <h1 className="text-2xl font-bold tracking-tight text-white group cursor-default">
              Taxonomy Explorer
            </h1>
          </div>
          <p className="text-sm text-zinc-400">
            Define global genres and tags. Use AI to align legacy strings to your master taxonomy.
          </p>
        </div>
      </div>

      <div className="flex flex-1 gap-6 min-h-0 overflow-hidden">
        
        {/* Left Column: Database Management */}
        <div className="w-2/3 bg-[#121214] rounded-2xl border border-white/5 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-white/5">
            <button
              onClick={() => setActiveTab('genre')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors border-b-2",
                activeTab === 'genre' 
                  ? "border-orange-500 text-orange-400 bg-orange-500/5" 
                  : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
              )}
            >
              <BookOpen className="w-4 h-4" /> Global Genres ({taxonomies.filter(t => t.type === 'genre').length})
            </button>
            <button
              onClick={() => setActiveTab('tag')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors border-b-2",
                activeTab === 'tag' 
                  ? "border-teal-500 text-teal-400 bg-teal-500/5" 
                  : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
              )}
            >
              <Tag className="w-4 h-4" /> Global Tags ({taxonomies.filter(t => t.type === 'tag').length})
            </button>
          </div>

          <div className="p-6 border-b border-white/5 flex gap-4 bg-black/20">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder={`Search ${activeTab}s...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#09090B] border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
              />
            </div>
            
            <div className="flex bg-[#09090B] border border-white/10 rounded-xl p-1 gap-1">
              <button
                onClick={() => setSortBy('Alphabetical')}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-2",
                  sortBy === 'Alphabetical' 
                    ? "bg-white/10 text-white shadow-lg" 
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                )}
              >
                ABC
              </button>
              <button
                onClick={() => setSortBy('Usage Count')}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-2",
                  sortBy === 'Usage Count' 
                    ? "bg-white/10 text-white shadow-lg" 
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                )}
              >
                Usage
              </button>
            </div>

            {isAdmin && (
              <form onSubmit={handleAdd} className="flex gap-2 w-1/3">
                <input 
                  type="text" 
                  placeholder={`New ${activeTab}...`}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-[#09090B] border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
                />
                <button 
                  type="submit"
                  disabled={isAdding || !newName.trim()}
                  className="bg-white/10 hover:bg-white/20 text-white rounded-xl px-4 py-2 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-[#09090B]">
            <div className="flex flex-wrap gap-2">
              {filteredItems.map(t => (
                <div 
                  key={t.id} 
                  onClick={() => setSelectedTaxonomy(t as any)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm animate-fade-in cursor-pointer hover:brightness-125 transition-all",
                    activeTab === 'genre' 
                      ? "bg-orange-500/10 border-orange-500/20 text-orange-200" 
                      : "bg-teal-500/10 border-teal-500/20 text-teal-200"
                  )}
                >
                  {t.name}
                  <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full ml-1 opacity-70" title="Usage Count">{t.usageCount}</span>
                  {isAdmin && (
                    <>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleEdit(t.id, t.name); }}
                        className="ml-0.5 p-1.5 -m-0.5 opacity-60 hover:opacity-100 hover:text-green-400 transition-colors"
                        title={"Edit " + activeTab}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleMove(t.id, t.name); }}
                        className="ml-0.5 p-1.5 -m-0.5 opacity-60 hover:opacity-100 hover:text-blue-400 transition-colors"
                        title={activeTab === 'genre' ? "Move to Tags" : "Move to Genres"}
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                      </button>
                      {t.usageCount === 0 && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                          className="ml-0.5 p-1.5 -m-0.5 opacity-60 hover:opacity-100 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
              {filteredItems.length === 0 && (
                <div className="w-full text-center py-10 text-zinc-600">
                  No {activeTab}s found matching "{search}"
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Library health + AI helpers */}
        <div className="w-1/3 flex flex-col gap-4 overflow-hidden">

          {/* Needs Attention: media missing tags and/or franchise */}
          <div className="bg-[#121214] rounded-2xl border border-white/5 p-6 flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 mb-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="font-bold">Needs Attention <span className="text-zinc-500 font-normal text-sm">({mediaMissingInfo.length})</span></h2>
            </div>
            <p className="text-xs text-zinc-400 mb-3">Entries with no tags and/or no franchise assigned. Unreleased entries are only listed for a missing franchise — their tags arrive with the Codex once they are out.</p>
            <div className="flex gap-1 mb-3">
              {(['any', 'tags', 'franchise'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setMissingFilter(f)}
                  className={cn("px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors",
                    missingFilter === f ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5")}
                >
                  {f === 'any' ? 'All' : f === 'tags' ? 'No tags' : 'No franchise'}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {mediaMissingInfo.slice(0, 100).map(({ item, noTags, noFranchise }) => (
                <div key={item.id} className="bg-white/5 border border-white/5 p-3 rounded-xl flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white text-sm truncate">{item.title}</div>
                    <div className="text-[10px] text-zinc-500 mb-1.5">{item.mediaType}</div>
                    <div className="flex flex-wrap gap-1">
                      {noTags && <span className="text-[9px] px-1.5 py-0.5 bg-teal-500/20 text-teal-300 rounded border border-teal-500/20">No tags</span>}
                      {noFranchise && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/20">No franchise</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingItem(item)}
                    title="Edit entry"
                    className="shrink-0 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {mediaMissingInfo.length === 0 && (
                <div className="text-center text-zinc-600 text-sm mt-8">Every entry has tags and a franchise. 🎉</div>
              )}
              {mediaMissingInfo.length > 100 && (
                <div className="text-center text-zinc-600 text-[11px] pt-2">Showing first 100 of {mediaMissingInfo.length}.</div>
              )}
            </div>
          </div>

          <div className="bg-[#121214] rounded-2xl border border-white/5 p-6 flex flex-col flex-1 min-h-0 overflow-hidden">
             <div className="flex items-center gap-2 mb-4 text-purple-400">
               <BrainCircuit className="w-5 h-5" />
               <h2 className="font-bold">AI Consistency Tagging</h2>
             </div>
             <p className="text-xs text-zinc-400 mb-6">
               Scan your library and remap unstructured legacy tags into your official global database. Wait to do this until your master database is fully customized.
             </p>

             <div className="flex-1 overflow-y-auto space-y-4 pr-2">
               {missingTaxonomyMedia.slice(0, 50).map(item => (
                 <div key={item.id} className="bg-white/5 border border-white/5 p-4 rounded-xl">
                   <div className="font-semibold text-white mb-2 line-clamp-1">{item.title}</div>
                   
                   <div className="flex flex-wrap gap-1 mb-4">
                     {item.missingGenres.map((g, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-300 rounded border border-orange-500/20">{g}</span>)}
                     {item.missingTags.map((t, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 bg-teal-500/20 text-teal-300 rounded border border-teal-500/20">{t}</span>)}
                   </div>

                   <button 
                      onClick={() => handleAutoTagItem(item.id)}
                      disabled={migratingId === item.id || !settings?.nanoGptApiKey}
                      className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                    >
                      {migratingId === item.id ? (
                         <div className="animate-spin w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full" />
                      ) : (
                         <BrainCircuit className="w-3 h-3" />
                      )}
                      {migratingId === item.id ? 'Analyzing...' : 'Auto-Map to Global Taxonomy'}
                   </button>
                 </div>
               ))}
               {missingTaxonomyMedia.length === 0 && (
                 <div className="text-center text-zinc-600 text-sm mt-10">All items are categorized correctly!</div>
               )}
             </div>
          </div>
        </div>

      </div>

      {/* Selected Taxonomy Overview Modal */}
      {selectedTaxonomy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#121214] border border-white/10 w-full max-w-2xl max-h-[80vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-3">
                {selectedTaxonomy.type === 'genre' ? (
                  <BookOpen className="w-5 h-5 text-orange-400" />
                ) : (
                  <Tag className="w-5 h-5 text-teal-400" />
                )}
                <h2 className="text-xl font-bold tracking-tight text-white capitalize">
                  {selectedTaxonomy.name}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                  {mediaWithSelectedTaxonomy.length} Items
                </span>
              </div>
              <button 
                onClick={() => setSelectedTaxonomy(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 grid gap-3 grid-cols-1 md:grid-cols-2">
              {mediaWithSelectedTaxonomy.map(m => (
                <div key={m.id} className="bg-white/5 border border-white/5 p-4 rounded-xl flex flex-col">
                  <div className="font-semibold text-white mb-1 line-clamp-1">{m.title}</div>
                  <div className="text-xs text-zinc-400 mb-3">{m.mediaType}</div>
                  <div className="mt-auto flex flex-wrap gap-1">
                    {m.genres?.slice(0,2).map((g,i) => <span key={`g-${i}`} className="text-[9px] px-1.5 py-0.5 bg-orange-500/20 text-orange-300 rounded border border-orange-500/20">{g}</span>)}
                    {m.tags?.slice(0,3).map((t,i) => <span key={`t-${i}`} className="text-[9px] px-1.5 py-0.5 bg-teal-500/20 text-teal-300 rounded border border-teal-500/20">{t}</span>)}
                  </div>
                </div>
              ))}
              {mediaWithSelectedTaxonomy.length === 0 && (
                <div className="col-span-1 md:col-span-2 text-center text-zinc-500 py-10">
                  No media items use this {selectedTaxonomy.type}.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        <MediaFormModal
          isOpen={true}
          initialData={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={(data) => { saveMediaItem(data); setEditingItem(null); }}
          onDelete={(id) => { deleteMediaItem(id); setEditingItem(null); }}
        />
      )}
    </div>
  );
}
