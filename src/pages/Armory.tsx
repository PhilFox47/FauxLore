import React, { useState } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { Gem, Copy, Library, Sword, Shield, Footprints, User, Sparkle, Hammer, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { MEDIA_COLORS, Artifact } from '../types/schema';

type Slot = 'Head' | 'Body' | 'Legs' | 'Primary' | 'Secondary' | 'Accessory';
const SLOTS: Slot[] = ['Head', 'Body', 'Legs', 'Primary', 'Secondary', 'Accessory'];

export function Armory() {
  const { artifacts, media, equipArtifact, unequipArtifact } = useMediaContext();
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  const equipped = artifacts.filter(a => a.isEquipped);
  const inventory = artifacts.filter(a => !a.isEquipped);

  const getEquippedInSlot = (slot: Slot) => equipped.find(a => a.slot === slot);

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
                               <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Hammer className="w-3 h-3 text-red-500" />
                               </div>
                               <Gem className={cn(
                                 "w-6 h-6 mb-2",
                                 item.rarity === 'Legendary' ? 'text-amber-500' : 'text-purple-500'
                               )} />
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
                                {slot === 'Head' && <User className="w-8 h-8 opacity-20" />}
                                {slot === 'Primary' && <Sword className="w-8 h-8 opacity-20" />}
                                {slot === 'Secondary' && <Shield className="w-8 h-8 opacity-20" />}
                                {slot === 'Legs' && <Footprints className="w-8 h-8 opacity-20" />}
                                {!['Head', 'Primary', 'Secondary', 'Legs'].includes(slot) && <Gem className="w-8 h-8 opacity-20" />}
                             </div>
                           )}
                        </div>
                     </div>
                   );
                 })}
               </div>
            </div>

            <div className="space-y-6">
               <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6">
                  <div className="flex gap-4">
                     <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" />
                     <div>
                        <h4 className="text-sm font-black text-white mb-1 uppercase tracking-tight">Artifact Maintenance</h4>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          Your artifacts lose durability whenever you log progress in your media. Once durability hits zero, the artifact provides no benefits until repaired. Looting remains meaningful as you'll always need fresh gear or master materials!
                        </p>
                     </div>
                  </div>
               </div>
               
               {selectedArtifact && (
                 <div className="bg-purple-600/20 shadow-2xl shadow-purple-900/20 border border-purple-500/30 rounded-[2rem] p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h3 className="text-lg font-black text-white mb-2 italic">"{selectedArtifact.name}"</h3>
                    <p className="text-sm text-purple-200/60 mb-6 font-medium leading-relaxed">{selectedArtifact.description}</p>
                    
                    <div className="grid grid-cols-2 gap-3">
                       {SLOTS.map(slot => (
                         <button
                           key={slot}
                           onClick={() => handleEquip(selectedArtifact, slot)}
                           className="bg-white/10 hover:bg-white/20 border border-white/10 py-3 rounded-xl text-[10px] font-black text-white uppercase tracking-widest transition-all"
                         >
                           Equip as {slot}
                         </button>
                       ))}
                    </div>
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
             <h2 className="text-xl font-black text-white flex items-center gap-3">
                <Copy className="w-6 h-6 text-zinc-700" />
                Your Inventory
                <span className="text-xs font-bold text-zinc-600 bg-zinc-900 px-3 py-1 rounded-full uppercase tracking-widest ml-4">{inventory.length} Items</span>
             </h2>

             {inventory.length === 0 ? (
                <div className="bg-zinc-900/20 border border-white/5 rounded-[2rem] p-12 text-center">
                   <p className="text-zinc-600 font-bold uppercase tracking-widest text-xs">No items in inventory</p>
                </div>
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {inventory.map(artifact => {
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
                               <span className={cn(
                                  "text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded shadow-sm",
                                  artifact.rarity === 'Mythic' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                  artifact.rarity === 'Legendary' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                  artifact.rarity === 'Epic' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                  artifact.rarity === 'Rare' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                  artifact.rarity === 'Uncommon' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                  'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                               )}>
                                  {artifact.rarity}
                               </span>
                               <div className="flex gap-0.5">
                                 {Array.from({ length: artifact.durability > 50 ? 3 : artifact.durability > 20 ? 2 : 1 }).map((_, i) => (
                                   <div key={i} className="w-1 h-1 rounded-full bg-emerald-500" />
                                 ))}
                               </div>
                            </div>
                            
                            <h3 className="text-lg font-black text-white mb-2 leading-tight">
                              {artifact.name}
                            </h3>
                            
                            <p className="text-xs text-zinc-500 leading-relaxed flex-1 mb-6 italic line-clamp-2">
                              "{artifact.description}"
                            </p>

                            {m && (
                              <div className="pt-4 border-t border-white/5 flex items-center gap-3">
                                 {m.coverImageUrl && (
                                   <img src={m.coverImageUrl} alt="" className="w-6 h-9 rounded object-cover border border-white/10" referrerPolicy="no-referrer" />
                                 )}
                                 <div className="text-[10px] font-bold text-zinc-400 truncate">{m.title}</div>
                              </div>
                            )}
                         </div>
                      </div>
                    );
                  })}
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
