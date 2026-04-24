import React from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { Gem, Copy, Library } from 'lucide-react';
import { cn } from '../lib/utils';
import { MEDIA_COLORS } from '../types/schema';

export function Armory() {
  const { artifacts, media } = useMediaContext();

  const sortedArtifacts = [...artifacts].sort((a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime());

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
        <div className="max-w-7xl mx-auto">
          {sortedArtifacts.length === 0 ? (
             <div className="flex flex-col items-center justify-center min-h-[400px] bg-zinc-900 border border-white/5 rounded-[2rem] text-center p-8">
                <Gem className="w-16 h-16 text-zinc-800 mb-6" />
                <h3 className="text-xl font-black text-white mb-2">The Vault is Empty</h3>
                <p className="text-zinc-500 max-w-sm">Complete media and visit their details page to claim unique loot from your conquests.</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
               {sortedArtifacts.map(artifact => {
                 const m = media.find(x => x.id === artifact.mediaId);
                 return (
                   <div key={artifact.id} className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 relative overflow-hidden group hover:border-white/10 transition-colors">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-purple-400 to-amber-500 opacity-50" />
                      
                      <div className="flex flex-col h-full">
                         <div className="flex items-center justify-between mb-4">
                            <span className={cn(
                               "text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded shadow-sm",
                               artifact.rarity === 'Mythic' ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-red-500/20' :
                               artifact.rarity === 'Legendary' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-amber-500/20' :
                               artifact.rarity === 'Epic' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                               artifact.rarity === 'Rare' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                               artifact.rarity === 'Uncommon' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                               'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                            )}>
                               {artifact.rarity} {artifact.type}
                            </span>
                            <Gem className={cn(
                               "w-4 h-4",
                               artifact.rarity === 'Mythic' ? 'text-red-500' :
                               artifact.rarity === 'Legendary' ? 'text-amber-500' :
                               artifact.rarity === 'Epic' ? 'text-purple-500' :
                               artifact.rarity === 'Rare' ? 'text-blue-500' :
                               artifact.rarity === 'Uncommon' ? 'text-emerald-500' :
                               'text-zinc-500'
                            )} />
                         </div>
                         
                         <h3 className="text-xl font-black text-white mb-2 leading-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-zinc-400">
                           {artifact.name}
                         </h3>
                         
                         <p className="text-sm text-zinc-400 leading-relaxed flex-1 mb-6 italic">
                           "{artifact.description}"
                         </p>

                         {m && (
                           <div className="pt-4 border-t border-white/5 flex items-center gap-3">
                              {m.coverImageUrl ? (
                                <img src={m.coverImageUrl} alt="" className="w-8 h-12 rounded object-cover border border-white/10" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-8 h-12 bg-zinc-800 rounded border border-white/10 flex items-center justify-center">
                                   <Library className="w-3 h-3 text-zinc-600" />
                                </div>
                              )}
                              <div>
                                 <div className="text-xs font-bold text-white truncate max-w-[150px]">{m.title}</div>
                                 <div className={cn("text-[9px] uppercase tracking-widest font-black mt-0.5", MEDIA_COLORS[m.mediaType]?.text || 'text-zinc-500')}>{m.mediaType}</div>
                              </div>
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
  );
}
