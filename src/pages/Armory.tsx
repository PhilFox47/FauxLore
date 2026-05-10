import React, { useState, useEffect } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { Gem, Copy, Sword, Shield, Footprints, Sparkles, Hammer, AlertCircle, CheckCircle2, RotateCw, Crown, Shirt, User, ImageIcon, Flame } from 'lucide-react';
import { cn } from '../lib/utils';
import { MEDIA_COLORS, Artifact, RARITY_COLORS } from '../types/schema';
import { generateAiArtifactWithGemini } from '../services/geminiService';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../services/db';
import { LootReveal } from '../components/LootReveal';

import { MediaDetailModal } from '../components/MediaDetailModal';
import { MediaFormModal } from '../components/MediaFormModal';

type Slot = 'Head' | 'Body' | 'Legs' | 'Primary' | 'Secondary' | 'Accessory';
const SLOTS: Slot[] = ['Head', 'Body', 'Legs', 'Primary', 'Secondary', 'Accessory'];

export function Armory() {
  const { artifacts, media, settings, equipArtifact, unequipArtifact, updateArtifact, saveArtifact, generateArtifactImage, logs } = useMediaContext();
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [selectedMediaForDetails, setSelectedMediaForDetails] = useState<any | null>(null);
  const [editingMedia, setEditingMedia] = useState<any | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isLootingMediaId, setIsLootingMediaId] = useState<string | null>(null);
  const [pendingLootId, setPendingLootId] = useState<string | null>(null);
  const [lootedArtifact, setLootedArtifact] = useState<Artifact | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortType, setSortType] = useState<'Recent' | 'Rarity' | 'Durability'>('Recent');
  const [filterSlot, setFilterSlot] = useState<Slot | 'All'>('All');
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const handleClaimLoot = async (item: any) => {
    setIsLootingMediaId(item.id);
    try {
      const generated = await generateAiArtifactWithGemini(settings?.geminiApiKey, item);
      const newArtifact: Artifact = {
        id: uuidv4(),
        mediaId: item.id,
        name: generated.name,
        description: generated.description,
        type: generated.type || 'Trinket',
        slot: generated.slot as any || 'Accessory',
        rarity: generated.rarity as Artifact['rarity'],
        targetType: generated.targetType,
        targetValue: generated.targetValue,
        bonusPercent: generated.bonusPercent,
        earnedAt: new Date().toISOString(),
        durability: 100,
        maxDurability: 100,
        isEquipped: false
      };
      
      setPendingLootId(newArtifact.id);
      await saveArtifact(newArtifact);
      
      try {
        await generateArtifactImage(newArtifact.id);
        const loadedArtifacts = await DatabaseService.getArtifacts();
        const updatedArtifact = loadedArtifacts.find(a => a.id === newArtifact.id) || newArtifact;
        setLootedArtifact(updatedArtifact);
      } catch (e) {
        console.error("Failed to generate and load image for artifact", e);
        setLootedArtifact(newArtifact);
      }
    } catch(e: any) {
      console.error("Failed to loot: " + e.message);
      alert("Failed to loot: " + e.message + "\n\nNote: Ensure your Gemini API Key is set in AI Studio Secrets.");
    } finally {
      setIsLootingMediaId(null);
      setPendingLootId(null);
    }
  };

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
      if (a.id === pendingLootId || a.id === lootedArtifact?.id) return false;
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

  const unlootedMedia = media.filter(m => {
    const itemArtifacts = artifacts.filter(a => a.mediaId === m.id);
    let allowedArtifactsCount = 0;
    
    if (m.status === 'Completed' || m.status === 'Extras') {
      allowedArtifactsCount += 1;
    }
    
    if ((m.mediaType === 'Game' || m.mediaType === 'Visual Novel' || m.mediaType === 'Audiobook') && m.isOngoing) {
      const nonHistoricalPlaytime = logs
        .filter(l => l.mediaId === m.id && !l.isHistoric && !l.timestamp.startsWith('1970-01-01') && l.metricType === 'playtimeHours')
        .reduce((sum, log) => sum + log.delta, 0);
      allowedArtifactsCount += Math.floor(nonHistoricalPlaytime / 50);
    }
    
    return itemArtifacts.length < allowedArtifactsCount;
  });

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
          
          {/* Character Paper Doll Section & Unlooted */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start mb-12">
            
            {/* Paper Doll */}
            <div className="bg-gradient-to-br from-zinc-950 to-black border border-white/5 rounded-[2.5rem] p-8 sm:p-10 relative overflow-hidden shadow-[inset_0_2px_4px_rgba(255,255,255,0.02),0_20px_40px_-10px_rgba(0,0,0,0.8)]">
               <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                  <User className="w-96 h-96 text-white translate-x-1/4 -translate-y-1/4" />
               </div>
               
               <h2 className="text-xl sm:text-2xl font-black text-white mb-8 flex items-center gap-3 font-display uppercase tracking-widest drop-shadow-md">
                 <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
                 Active Loadout
               </h2>

               <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 relative z-10">
                 {SLOTS.map(slot => {
                   const item = getEquippedInSlot(slot);
                   return (
                     <div key={slot} className="space-y-2 group/slot">
                        <div className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] px-2 font-display">{slot}</div>
                        <div 
                          className={cn(
                            "aspect-square rounded-2xl border flex flex-col items-center justify-center p-3 sm:p-4 transition-all group/item relative cursor-pointer shadow-inner",
                            item 
                              ? "bg-gradient-to-t from-zinc-900 to-zinc-800/80 border-white/10 hover:border-white/20 hover:scale-105 duration-300" 
                              : "bg-black/50 border-white/5 border-dashed"
                          )}
                          onClick={() => item && handleUnequip(item)}
                        >
                           {item ? (
                             <>
                               <div className="absolute top-2 right-2 text-[8px] opacity-0 group-hover/item:opacity-100 transition-opacity text-red-400 font-bold uppercase tracking-widest bg-red-500/10 px-2 py-1 rounded shadow-sm border border-red-500/20 backdrop-blur-sm z-20">
                                  Remove
                               </div>
                               <div className="mb-2 relative">
                                 {/* Glow effect */}
                                 <div className={cn("absolute inset-0 blur-xl opacity-40", RARITY_COLORS[item.rarity]?.text || RARITY_COLORS['Common'].text)}></div>
                                 {item.imageUrl ? (
                                    <div className="w-10 h-10 sm:w-12 sm:h-12 relative z-10 shrink-0 rounded-xl overflow-hidden border border-white/10 shadow-lg bg-zinc-900 mx-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); setExpandedImage(item.imageUrl || null); }}>
                                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    </div>
                                 ) : (
                                    renderSlotIcon(slot, cn("w-6 h-6 sm:w-8 sm:h-8 relative z-10 drop-shadow-lg mx-auto", RARITY_COLORS[item.rarity]?.text || RARITY_COLORS['Common'].text))
                                 )}
                               </div>
                               <div className="text-[9px] sm:text-[10px] font-black text-white text-center leading-tight truncate w-full px-1 font-display tracking-wide">{item.name}</div>
                               <div className="text-[8px] sm:text-[9px] font-bold text-center uppercase tracking-widest mt-1 w-full px-1">
                                 <span className={cn(RARITY_COLORS[item.rarity]?.text || RARITY_COLORS['Common'].text)}>{item.rarity}</span>
                               </div>
                               <div className="text-[8px] sm:text-[9px] text-zinc-500 text-center leading-tight mt-1 line-clamp-2 w-full px-1">{item.description}</div>
                               
                               {/* Durability Bar */}
                               <div className="w-full mt-3 h-1.5 bg-black rounded-full overflow-hidden border border-white/5 shadow-inner p-[1px]">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full transition-all shadow-inner",
                                      (item.durability / item.maxDurability) < 0.2 ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                                    )} 
                                    style={{ width: `${(item.durability / item.maxDurability) * 100}%` }}
                                  />
                               </div>
                               <div className="text-[8px] text-zinc-500 font-black mt-1.5 uppercase font-mono">{item.durability}/{item.maxDurability}</div>
                             </>
                           ) : (
                             <div className="text-zinc-800">
                               {renderSlotIcon(slot, "w-8 h-8 sm:w-10 sm:h-10 opacity-[0.15] drop-shadow-sm")}
                             </div>
                           )}
                        </div>
                     </div>
                   );
                 })}
               </div>
            </div>

            {/* Unlooted Treasures & selected artifact details */}
            <div className="space-y-6">
               <div className={cn("transition-all duration-500", selectedArtifact ? "opacity-30 pointer-events-none scale-95" : "opacity-100 scale-100")}>
                 {unlootedMedia.length > 0 ? (
                   <div className="bg-gradient-to-br from-indigo-950/20 to-black border border-indigo-500/20 shadow-[0_0_40px_rgba(99,102,241,0.1)] rounded-[2.5rem] p-8 sm:p-10 relative overflow-hidden">
                     <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03] mix-blend-overlay"></div>
                     <h3 className="text-sm sm:text-base font-black text-white mb-6 uppercase tracking-[0.2em] flex items-center gap-2 font-display">
                       <Gem className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
                       Unidentified Loot
                       <span className="ml-2 px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[10px] tracking-widest">{unlootedMedia.length} Pending</span>
                     </h3>
                     <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 gap-4 relative z-10">
                       {unlootedMedia.map(item => (
                         <button 
                           key={item.id}
                           onClick={() => handleClaimLoot(item)}
                           disabled={!!isLootingMediaId}
                           className="aspect-square rounded-2xl bg-zinc-900 border border-white/5 cursor-pointer hover:border-indigo-500 hover:ring-2 hover:ring-indigo-500/50 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all relative group flex flex-col items-center justify-center p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                           title={`Identify loot from ${item.title}`}
                         >
                            <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"></div>
                             {isLootingMediaId === item.id ? (
                               <div className="relative mb-2 flex items-center justify-center">
                                  <div className="absolute inset-0 bg-indigo-500/30 blur-xl animate-pulse rounded-full"></div>
                                  <Hammer className="w-8 h-8 text-indigo-400 relative z-10 animate-bounce" />
                                  <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-indigo-300 animate-spin z-20 opacity-75" />
                                  <Flame className="absolute -bottom-1 -left-1 w-4 h-4 text-amber-500/80 animate-pulse z-20" />
                               </div>
                            ) : (
                               <Gem className="w-8 h-8 text-indigo-500 opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-transform duration-300 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)] mb-2" />
                            )}
                            <div className={cn(
                               "text-[8px] font-black uppercase text-zinc-500 group-hover:text-indigo-300 truncate w-full text-center tracking-widest px-1 font-display transition-all duration-300",
                               isLootingMediaId === item.id && "text-indigo-300 font-bold scale-110 drop-shadow-[0_0_5px_rgba(99,102,241,0.5)] bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300 animate-pulse"
                            )}>
                               {isLootingMediaId === item.id ? "Forging Relic..." : item.title}
                            </div>
                         </button>
                       ))}
                     </div>
                   </div>
                 ) : (
                    <div className="h-full bg-gradient-to-br from-zinc-900/30 to-black border-2 border-dashed border-white/5 rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center">
                       <Shield className="w-16 h-16 text-zinc-800 mb-6" />
                       <p className="text-xs font-black text-zinc-600 uppercase tracking-[0.2em] font-display max-w-[200px] leading-relaxed">
                          All completed conquests have been looted.
                       </p>
                    </div>
                 )}
               </div>
               
               {/* Selection Viewer (if artifact selected) */}
               {selectedArtifact && (
                 <div className="bg-gradient-to-br from-zinc-900 to-[#121214] shadow-2xl shadow-black border border-white/10 rounded-[2.5rem] p-8 sm:p-10 animate-in fade-in slide-in-from-bottom-8 duration-500 ease-out relative overflow-hidden">
                    <div className={cn("absolute inset-0 opacity-[0.05] mix-blend-screen pointer-events-none", RARITY_COLORS[selectedArtifact.rarity]?.bg || RARITY_COLORS['Common'].bg)}></div>
                    <div className="flex items-start justify-between mb-6 relative z-10 w-full gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-3">
                          <span className={cn(
                              "text-[10px] uppercase tracking-[0.2em] font-black px-3 py-1 rounded border shadow-sm backdrop-blur-md font-display",
                              RARITY_COLORS[selectedArtifact.rarity]?.bg || RARITY_COLORS['Common'].bg,
                              RARITY_COLORS[selectedArtifact.rarity]?.text || RARITY_COLORS['Common'].text,
                              (RARITY_COLORS[selectedArtifact.rarity]?.border || RARITY_COLORS['Common'].border).replace('500', '500/30')
                          )}>
                              {selectedArtifact.rarity}
                          </span>
                        </div>
                        <h3 className="text-2xl sm:text-3xl font-black text-white italic truncate tracking-tight py-1">{selectedArtifact.name}</h3>
                      </div>
                      <div className="text-zinc-600 shrink-0 p-4 bg-black/40 rounded-2xl border border-white/5 shadow-inner" title={selectedArtifact.slot}>
                        {renderSlotIcon(selectedArtifact.slot || 'Accessory', "w-8 h-8")}
                      </div>
                    </div>
                    
                    <div className="relative z-10 backdrop-blur-sm bg-black/30 border border-white/5 rounded-2xl p-5 mb-6">
                       <p className="text-sm text-zinc-300 font-medium leading-relaxed italic border-l-2 border-white/10 pl-4 py-1">"{selectedArtifact.description}"</p>
                    </div>
                    
                    <div className="mb-6 flex items-center gap-3 w-full bg-black/50 p-4 rounded-2xl border border-white/5 relative z-10" title="Durability">
                      <Hammer className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                      <div className="flex-1 h-3 bg-zinc-950 rounded-full overflow-hidden border border-white/5 shadow-inner p-[1px]">
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all shadow-[inset_0_2px_4px_rgba(255,255,255,0.2)]",
                              (selectedArtifact.durability / selectedArtifact.maxDurability) < 0.2 ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                            )} 
                            style={{ width: `${(selectedArtifact.durability / selectedArtifact.maxDurability) * 100}%` }}
                          />
                      </div>
                      <span className="text-xs font-black text-zinc-400 flex-shrink-0 w-12 text-right font-mono">{selectedArtifact.durability}/{selectedArtifact.maxDurability}</span>
                    </div>

                    <div className="relative z-10 space-y-4 mb-8">
                       {selectedArtifact.targetType ? (
                         <div className="bg-gradient-to-r from-purple-900/40 to-transparent border-l-4 border-purple-500 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-inner">
                            <span className="text-[10px] text-purple-300 font-bold uppercase tracking-[0.2em] font-display">Target Affinity: <span className="text-white">{selectedArtifact.targetType}</span></span>
                            <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded shadow-sm border border-emerald-500/20">+{selectedArtifact.bonusPercent}% {selectedArtifact.targetValue} EXP</span>
                         </div>
                       ) : (
                         <div className="bg-gradient-to-r from-purple-900/40 to-transparent border-l-4 border-purple-500 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-inner">
                            <span className="text-[10px] text-purple-300 font-bold uppercase tracking-[0.2em] font-display">Global Affinity</span>
                            <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded shadow-sm border border-emerald-500/20">+20% Base EXP</span>
                         </div>
                       )}
                    </div>
                    
                    <div className="flex gap-4 relative z-10 w-full">
                       <button 
                         onClick={() => setSelectedArtifact(null)}
                         className="px-6 py-4 rounded-xl border border-white/10 font-black text-zinc-400 uppercase tracking-widest text-[10px] hover:text-white hover:bg-white/5 transition-all font-display shrink-0"
                       >
                         Dismiss
                       </button>
                       <button
                         onClick={() => handleEquip(selectedArtifact, selectedArtifact.slot as Slot || 'Accessory')}
                         className={cn(
                           "flex-1 bg-white hover:bg-zinc-200 text-black py-4 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all font-display shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] hover:-translate-y-1",
                           RARITY_COLORS[selectedArtifact.rarity]?.text || RARITY_COLORS['Common'].text
                         )}
                         style={{ color: `var(--color-${RARITY_COLORS[selectedArtifact.rarity]?.text.split('-')[1] || 'zinc'}-500, #000)` }}
                       >
                         Equip to {selectedArtifact.slot || 'Accessory'}
                       </button>
                    </div>
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
         <div className="flex flex-col h-full relative z-10">
            {artifact.imageUrl && (
              <div 
                className="w-full aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 shadow-lg bg-zinc-900 cursor-pointer mb-4 relative group/image" 
                onClick={(e) => { e.stopPropagation(); setExpandedImage(artifact.imageUrl || null); }}
              >
                <img src={artifact.imageUrl} alt={artifact.name} className="w-full h-full object-cover transition-transform duration-700 group-hover/image:scale-105" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent pointer-events-none"></div>
              </div>
            )}
            
            <div className="flex-1 flex flex-col">
                 <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="text-zinc-500" title={artifact.slot}>
                        {renderSlotIcon(artifact.slot || 'Accessory', "w-4 h-4")}
                      </div>
                      <span className={cn(
                         "text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded border shadow-sm shrink-0",
                         RARITY_COLORS[artifact.rarity]?.bg || RARITY_COLORS['Common'].bg,
                         RARITY_COLORS[artifact.rarity]?.text || RARITY_COLORS['Common'].text,
                         (RARITY_COLORS[artifact.rarity]?.border || RARITY_COLORS['Common'].border).replace('500', '500/30')
                      )}>
                         {artifact.rarity}
                      </span>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const btn = e.currentTarget;
                        btn.disabled = true;
                        const icon = btn.querySelector("svg");
                        if (icon) icon.classList.add("animate-pulse", "text-emerald-500");
                        try {
                          await generateArtifactImage(artifact.id);
                        } catch (error) {
                          console.error("Image generation failed:", error);
                        } finally {
                          btn.disabled = false;
                          if (icon) icon.classList.remove("animate-pulse", "text-emerald-500");
                        }
                      }}
                      className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 relative z-10 shrink-0"
                      title="Regenerate Artifact Image"
                    >
                      <ImageIcon className="w-4 h-4 text-zinc-500" />
                    </button>
                 </div>
                 
                 <h3 className="text-lg sm:text-xl font-black text-white mb-2 leading-tight relative drop-shadow-md break-words">
                   {artifact.name}
                 </h3>
                 {artifact.targetType ? (
                    <div className="flex flex-col gap-1 mb-4 border-l-2 border-purple-500/50 pl-3 relative z-10 pointer-events-none">
                       <span className="text-[9px] text-purple-400 font-bold uppercase tracking-[0.2em] font-display">Target Affinity: <span className="text-zinc-300">{artifact.targetType}</span></span>
                       <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest leading-tight">+{artifact.bonusPercent}% {artifact.targetValue} EXP</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 mb-4 border-l-2 border-purple-500/50 pl-3 relative z-10 pointer-events-none">
                       <span className="text-[9px] text-purple-400 font-bold uppercase tracking-[0.2em] font-display">Global Affinity</span>
                       <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest leading-tight">+20% Base EXP</span>
                    </div>
                  )}
            </div>

            <div className="mt-auto pt-4 border-t border-white/5 flex flex-col gap-3">
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

      <LootReveal 
        artifact={lootedArtifact} 
        onClose={() => setLootedArtifact(null)} 
      />

      {expandedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" onClick={() => setExpandedImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center">
            <img src={expandedImage} alt="Expanded Artifact" className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" referrerPolicy="no-referrer" />
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute top-4 right-4 bg-black/50 hover:bg-black/80 text-white w-10 h-10 rounded-full flex items-center justify-center transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
