import React, { useState, useEffect } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { Gem, Copy, Sword, Shield, Footprints, Sparkle, Hammer, AlertCircle, CheckCircle2, RotateCw, Crown, Shirt, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { MEDIA_COLORS, Artifact, RARITY_COLORS } from '../types/schema';
import { generateAiArtifactWithGemini } from '../services/geminiService';

import { MediaDetailModal } from '../components/MediaDetailModal';
import { MediaFormModal } from '../components/MediaFormModal';

type Slot = 'Head' | 'Body' | 'Legs' | 'Primary' | 'Secondary' | 'Accessory';
const SLOTS: Slot[] = ['Head', 'Body', 'Legs', 'Primary', 'Secondary', 'Accessory'];

export function Armory() {
  const { artifacts, media, settings, equipArtifact, unequipArtifact, updateArtifact, logs } = useMediaContext();
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [selectedMediaForDetails, setSelectedMediaForDetails] = useState<any | null>(null);
  const [editingMedia, setEditingMedia] = useState<any | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortType, setSortType] = useState<'Recent' | 'Rarity' | 'Durability'>('Recent');
  const [filterSlot, setFilterSlot] = useState<Slot | 'All'>('All');

  const RARITY_WEIGHT = {
    'Mythic': 7,
    'Legendary': 6,
    'Epic': 5,
    'Super Rare': 4,
    'Rare': 3,
    'Uncommon': 2,
    'Common': 1
  } as const;

  // Legacy artifact migration
  useEffect(() => {
    if (!settings?.geminiApiKey || isMigrating) return;
    
    // Check for artifacts missing targetType
    const legacyArtifacts = artifacts.filter(a => a.targetType === undefined || a.targetType === null);
    if (legacyArtifacts.length === 0) return;

    const migrate = async () => {
      setIsMigrating(true);
      try {
        for (const a of legacyArtifacts) {
          const item = media.find(m => m.id === a.mediaId);
          if (item) {
            console.log("Migrating legacy artifact", a.name);
            const regenerated = await generateAiArtifactWithGemini(settings?.geminiApiKey, item, a);
            await updateArtifact(a.id, {
              ...a,
              name: regenerated.name,
              description: regenerated.description,
              type: regenerated.type,
              slot: regenerated.slot as any,
              targetType: regenerated.targetType,
              targetValue: regenerated.targetValue,
              bonusPercent: regenerated.bonusPercent
            });
          } else {
             // Or if item deleted, just give it a default to stop checking
             await updateArtifact(a.id, { ...a, targetType: 'MediaType', targetValue: 'Game', bonusPercent: 20 });
          }
        }
      } catch (e) {
        console.error("Migration error", e);
      } finally {
        setIsMigrating(false);
      }
    };
    migrate();
  }, [artifacts, settings, media, updateArtifact, isMigrating]);

  const equipped = artifacts.filter(a => a.isEquipped);
  const inventory = artifacts.filter(a => !a.isEquipped);

  const filteredAndSortedInventory = [...inventory]
    .filter(a => {
      if (filterSlot !== 'All' && a.slot !== filterSlot) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const m = media.find(x => x.id === a.mediaId);
      return a.name.toLowerCase().includes(q) || (m && m.title.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortType === 'Recent') {
        const dateA = new Date(a.earnedAt || 0).getTime();
        const dateB = new Date(b.earnedAt || 0).getTime();
        return dateB - dateA;
      } else if (sortType === 'Rarity') {
        const weightA = RARITY_WEIGHT[a.rarity as keyof typeof RARITY_WEIGHT] || 0;
        const weightB = RARITY_WEIGHT[b.rarity as keyof typeof RARITY_WEIGHT] || 0;
        if (weightA !== weightB) return weightB - weightA;
        return new Date(b.earnedAt || 0).getTime() - new Date(a.earnedAt || 0).getTime();
      } else if (sortType === 'Durability') {
        if (a.durability !== b.durability) return b.durability - a.durability;
        return new Date(b.earnedAt || 0).getTime() - new Date(a.earnedAt || 0).getTime();
      }
      return 0;
    });

  const getEquippedInSlot = (slot: Slot) => equipped.find(a => a.slot === slot);

  const renderSlotIcon = (slot: string, className: string) => {
    switch(slot) {
      case 'Head': return <Crown className={className} />;
      case 'Body': return <Shirt className={className} />;
      case 'Legs': return <Footprints className={className} />;
      case 'Primary': return <Sword className={className} />;
      case 'Secondary': return <Shield className={className} />;
      default: return <Gem className={className} />;
    }
  };

  const handleEquip = async (artifact: Artifact, slot: Slot) => {
    try {
      await equipArtifact(artifact.id, slot);
      setSelectedArtifact(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnequip = async (artifact: Artifact) => {
    try {
      await unequipArtifact(artifact.id);
    } catch (e) {
      console.error(e);
    }
  };

  const unlootedCompletedMedia = media.filter(m => m.status === 'Completed' && !artifacts.some(a => a.mediaId === m.id));

  return (
    <div className="flex flex-col h-full overflow-hidden w-full bg-[#080809]">
      <div className="p-4 md:p-8 flex items-center justify-between border-b border-white/5 bg-zinc-950/80 sticky top-0 z-10 backdrop-blur-xl">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-3">
             <Gem className="w-6 h-6 text-purple-500" />
             The Armory
          </h1>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none mt-1">Conquest Loot & Relics</p>
        </div>
        {isMigrating && (
          <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-full">
            <RotateCw className="w-3 h-3 text-purple-400 animate-spin" />
            <span className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">Migrating Artifacts...</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-12">
          
          {/* Character Paper Doll Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-8 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                  <User className="w-64 h-64 text-white" />
               </div>
               
               <h2 className="text-lg font-black text-white mb-8 flex items-center gap-2">
                 <Sparkle className="w-5 h-5 text-amber-500" />
                 Currently Equipped
               </h2>

               <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 relative z-10">
                 {SLOTS.map(slot => {
                   const item = getEquippedInSlot(slot);
                   return (
                     <div key={slot} className="space-y-2">
                        <div className="text-[10px] text-zinc-500 font-black uppercase tracking-widest px-2">{slot}</div>
                        <div 
                          className={cn(
                            "aspect-square rounded-2xl border flex flex-col items-center justify-center p-4 transition-all group relative cursor-pointer",
                            item 
                              ? "bg-zinc-800/80 border-white/10 hover:border-white/20" 
                              : "bg-zinc-950/50 border-white/5 border-dashed"
                          )}
                          onClick={() => item && handleUnequip(item)}
                        >
                           {item ? (
                             <>
                               <div className="absolute top-2 right-2 text-[8px] opacity-0 group-hover:opacity-100 transition-opacity text-red-500 font-bold uppercase tracking-widest bg-red-500/10 px-2 py-1 rounded">
                                  Unequip
                               </div>
                               <div className="mb-2">
                                 {renderSlotIcon(slot, cn("w-6 h-6", RARITY_COLORS[item.rarity]?.text || RARITY_COLORS['Common'].text))}
                               </div>
                               <div className="text-[10px] font-bold text-white text-center leading-tight truncate w-full px-2">{item.name}</div>
                               
                               {/* Durability Bar */}
                               <div className="w-full mt-3 h-1 bg-zinc-950 rounded-full overflow-hidden">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      (item.durability / item.maxDurability) < 0.2 ? "bg-red-500" : "bg-emerald-500"
                                    )} 
                                    style={{ width: `${(item.durability / item.maxDurability) * 100}%` }}
                                  />
                               </div>
                               <div className="text-[8px] text-zinc-600 font-black mt-1 uppercase">{item.durability}/{item.maxDurability}</div>
                             </>
                           ) : (
                             <div className="text-zinc-800">
                               {renderSlotIcon(slot, "w-8 h-8 opacity-20")}
                             </div>
                           )}
                        </div>
                     </div>
                   );
                 })}
               </div>
            </div>

            <div className="space-y-6">
               {unlootedCompletedMedia.length > 0 && (
                 <div className="bg-zinc-900/40 border border-white/5 rounded-[2rem] p-6 shadow-xl">
                   <h3 className="text-sm font-black text-white mb-4 uppercase tracking-widest flex items-center gap-2">
                     <Sparkle className="w-4 h-4 text-purple-500" />
                     Unlooted Treasures
                   </h3>
                   <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-4 gap-3">
                     {unlootedCompletedMedia.map(item => (
                       <div 
                         key={item.id}
                         onClick={() => setSelectedMediaForDetails(item)}
                         className="aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 cursor-pointer hover:ring-2 hover:ring-purple-500 transition-all relative group"
                         title={item.title}
                       >
                         {item.coverImageUrl ? (
                           <img src={item.coverImageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                         ) : (
                           <div className="w-full h-full flex items-center justify-center p-2 text-center text-[10px] font-bold text-zinc-500">
                             {item.title}
                           </div>
                         )}
                         <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                           <Gem className="w-4 h-4 text-purple-400" />
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               )}
               
               {selectedArtifact && (
                 <div className="bg-purple-600/20 shadow-2xl shadow-purple-900/20 border border-purple-500/30 rounded-[2rem] p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={cn(
                              "text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded border shadow-sm",
                              RARITY_COLORS[selectedArtifact.rarity]?.bg || RARITY_COLORS['Common'].bg,
                              RARITY_COLORS[selectedArtifact.rarity]?.text || RARITY_COLORS['Common'].text,
                              (RARITY_COLORS[selectedArtifact.rarity]?.border || RARITY_COLORS['Common'].border).replace('500', '500/30')
                          )}>
                              {selectedArtifact.rarity}
                          </span>
                        </div>
                        <h3 className="text-lg font-black text-white italic">"{selectedArtifact.name}"</h3>
                      </div>
                      <div className="text-zinc-500" title={selectedArtifact.slot}>
                        {renderSlotIcon(selectedArtifact.slot || 'Accessory', "w-6 h-6")}
                      </div>
                    </div>
                    
                    <p className="text-sm text-purple-200/60 mb-4 font-medium leading-relaxed">{selectedArtifact.description}</p>
                    
                    <div className="mb-6 flex items-center gap-2 w-full" title="Durability">
                      <Hammer className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <div className="flex-1 h-2 bg-zinc-950 rounded-full overflow-hidden border border-white/5">
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all",
                              (selectedArtifact.durability / selectedArtifact.maxDurability) < 0.2 ? "bg-red-500" : "bg-emerald-500"
                            )} 
                            style={{ width: `${(selectedArtifact.durability / selectedArtifact.maxDurability) * 100}%` }}
                          />
                      </div>
                      <span className="text-xs font-black text-zinc-400 flex-shrink-0">{selectedArtifact.durability}/{selectedArtifact.maxDurability}</span>
                    </div>

                    {selectedArtifact.targetType ? (
                      <div className="mb-6 bg-purple-900/30 border border-purple-500/20 rounded-xl p-3 flex items-center justify-between">
                         <span className="text-[10px] text-purple-300 font-bold uppercase tracking-widest">{selectedArtifact.targetType}: {selectedArtifact.targetValue}</span>
                         <span className="text-xs text-green-400 font-black">+{selectedArtifact.bonusPercent}% EXP</span>
                      </div>
                    ) : (
                      <div className="mb-6 bg-purple-900/30 border border-purple-500/20 rounded-xl p-3 flex items-center justify-between">
                         <span className="text-[10px] text-purple-300 font-bold uppercase tracking-widest">Base Effect</span>
                         <span className="text-xs text-green-400 font-black">+20% EXP</span>
                      </div>
                    )}
                    
                    <button
                      onClick={() => handleEquip(selectedArtifact, selectedArtifact.slot as Slot || 'Accessory')}
                      className="w-full bg-white/10 hover:bg-white/20 border border-white/10 py-3 rounded-xl text-[10px] font-black text-white uppercase tracking-widest transition-all"
                    >
                      Equip as {selectedArtifact.slot || 'Accessory'}
                    </button>
                    
                    <button 
                      onClick={() => setSelectedArtifact(null)}
                      className="w-full mt-4 text-[10px] font-black text-purple-400/50 uppercase tracking-widest"
                    >
                      Cancel
                    </button>
                 </div>
               )}
            </div>
          </div>

          {/* Inventory Grid */}
          <div className="space-y-6">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
               <h2 className="text-xl font-black text-white flex items-center gap-3">
                  <Copy className="w-6 h-6 text-zinc-700" />
                  Your Inventory
                  <span className="text-xs font-bold text-zinc-600 bg-zinc-900 px-3 py-1 rounded-full uppercase tracking-widest ml-4">{inventory.length} Items</span>
               </h2>
               
               <div className="flex flex-wrap items-center gap-3">
                 <input 
                   type="text" 
                   placeholder="Search items or media..." 
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="bg-zinc-900/50 border border-white/10 text-white rounded-xl px-4 py-2 text-sm w-full sm:max-w-[200px] focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                 />
                 <select 
                   value={filterSlot} 
                   onChange={(e) => setFilterSlot(e.target.value as any)}
                   className="bg-zinc-900/50 border border-white/10 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                 >
                   <option value="All">All Slots</option>
                   {SLOTS.map(s => (
                     <option key={s} value={s}>{s}</option>
                   ))}
                 </select>
                 <select 
                   value={sortType} 
                   onChange={(e) => setSortType(e.target.value as any)}
                   className="bg-zinc-900/50 border border-white/10 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                 >
                   <option value="Recent">Recent</option>
                   <option value="Rarity">Rarity</option>
                   <option value="Durability">Durability</option>
                 </select>
               </div>
             </div>

             {filteredAndSortedInventory.length === 0 ? (
                <div className="bg-zinc-900/20 border border-white/5 rounded-[2rem] p-12 text-center">
                   <p className="text-zinc-600 font-bold uppercase tracking-widest text-xs">No items found</p>
                </div>
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredAndSortedInventory.map(artifact => {
                    const m = media.find(x => x.id === artifact.mediaId);

    return (
      <div 
        key={artifact.id}
        onClick={() => setSelectedArtifact(artifact)}
        className={cn(
          "bg-zinc-900/50 border border-white/5 rounded-3xl p-6 relative overflow-hidden group hover:border-purple-500/30 transition-all cursor-pointer",
          selectedArtifact?.id === artifact.id && "border-purple-500 ring-4 ring-purple-500/20"
        )}
      >
         <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
               <div className="flex items-center gap-2">
                 <div className="text-zinc-500" title={artifact.slot}>
                   {renderSlotIcon(artifact.slot || 'Accessory', "w-4 h-4")}
                 </div>
                 <span className={cn(
                    "text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded border shadow-sm",
                    RARITY_COLORS[artifact.rarity]?.bg || RARITY_COLORS['Common'].bg,
                    RARITY_COLORS[artifact.rarity]?.text || RARITY_COLORS['Common'].text,
                    (RARITY_COLORS[artifact.rarity]?.border || RARITY_COLORS['Common'].border).replace('500', '500/30')
                 )}>
                    {artifact.rarity}
                 </span>
               </div>
            </div>
                            
                            <h3 className="text-lg font-black text-white mb-2 leading-tight">
                              {artifact.name}
                            </h3>
                            
                            <p className="text-xs text-zinc-500 leading-relaxed flex-1 mb-6 italic line-clamp-2">
                              "{artifact.description}"
                            </p>

                            <div className="pt-4 border-t border-white/5 flex flex-col gap-3">
                              <div className="flex items-center gap-1.5 w-full" title="Durability">
                                <Hammer className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                                <div className="flex-1 h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                                   <div 
                                     className={cn(
                                       "h-full rounded-full transition-all",
                                       (artifact.durability / artifact.maxDurability) < 0.2 ? "bg-red-500" : "bg-emerald-500"
                                     )} 
                                     style={{ width: `${(artifact.durability / artifact.maxDurability) * 100}%` }}
                                   />
                                </div>
                                <span className="text-[10px] font-black text-zinc-500 flex-shrink-0 w-8 text-right">{artifact.durability}/{artifact.maxDurability}</span>
                              </div>

                              {m && (
                                <div className="flex items-center gap-3">
                                   {m.coverImageUrl && (
                                     <img src={m.coverImageUrl} alt="" className="w-6 h-9 rounded object-cover border border-white/10" referrerPolicy="no-referrer" />
                                   )}
                                   <div className="text-[10px] font-bold text-zinc-400 truncate">{m.title}</div>
                                </div>
                              )}
                            </div>
                         </div>
                      </div>
                    );
                  })}
                </div>
             )}
          </div>
        </div>
      </div>
      <MediaDetailModal
        isOpen={!!selectedMediaForDetails}
        onClose={() => setSelectedMediaForDetails(null)}
        item={selectedMediaForDetails}
        logs={logs.filter(l => l.mediaId === selectedMediaForDetails?.id)}
        onEdit={(item) => {
          setSelectedMediaForDetails(null);
          setEditingMedia(item);
        }}
      />
      <MediaFormModal
        isOpen={!!editingMedia}
        onClose={() => setEditingMedia(null)}
        initialData={editingMedia}
        onSave={() => setEditingMedia(null)}
      />
    </div>
  );
}
