import React, { useState, useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { Dice5, Sparkles, RefreshCw, Eye } from 'lucide-react';
import { MediaCard } from '../components/MediaCard';
import { MediaItem } from '../types/schema';
import { MediaDetailModal } from '../components/MediaDetailModal';
import { MediaFormModal } from '../components/MediaFormModal';
import { generateText } from '../services/nanoGptService';
import Markdown from 'react-markdown';

export function Roulette() {
  const { media, logs, settings, saveMediaItem, deleteMediaItem } = useMediaContext();

  const [selectedCard, setSelectedCard] = useState<MediaItem | null>(null);
  const [smartSuggestions, setSmartSuggestions] = useState<MediaItem[]>([]);
  
  const [isOracleLoading, setIsOracleLoading] = useState(false);
  const [oracleRecommendation, setOracleRecommendation] = useState<string | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [currentActionItem, setCurrentActionItem] = useState<MediaItem | null>(null);

  // Consider things in Backlog (Planning only)
  const validBacklog = useMemo(() => media.filter(m => m.status === 'Planning'), [media]);

  const spinRoulette = () => {
    if (validBacklog.length === 0) return;
    const randomIndex = Math.floor(Math.random() * validBacklog.length);
    setSelectedCard(validBacklog[randomIndex]);
  };

  const consultOracle = async () => {
    if (!settings?.nanoGptApiKey || validBacklog.length === 0) {
       return;
    }

    setIsOracleLoading(true);
    setOracleRecommendation(null);
    try {
      const recentLogs = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
      const recentMediaIds = Array.from(new Set(recentLogs.map(l => l.mediaId)));
      const recentMedia = media.filter(m => recentMediaIds.includes(m.id)).map(m => m.title).join(', ');
      
      const backlogList = validBacklog.map(m => `[${m.mediaType}] ${m.title}`).join('\n');

      const promptContext = `
USER'S RECENTLY CONSUMED MEDIA:
${recentMedia || "None"}

USER'S BACKLOG:
${backlogList}
      `;

      const aiText = await generateText(
        settings.nanoGptApiKey, 
        settings.nanoGptModel || "gpt-4o-mini",
        "You are 'The Oracle', a cryptic but deeply intuitive AI entity within an RPG universe. Your task is to recommend EXACTLY ONE item from the user's BACKLOG. Explain your reasoning based on their recent consumption or simply what might spark joy and wonder. Do not list multiple items. Embellish your response with mystical prose and deep insight.",
        promptContext
      );

      setOracleRecommendation(aiText);
    } catch(e: any) {
      console.error("Oracle connection failed: " + e.message);
    } finally {
      setIsOracleLoading(false);
    }
  };

  const generateSmartSuggestions = () => {
    if (validBacklog.length === 0) return;

    // Determine what user has been engaged with recently based on logs
    const recentLogs = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
    const recentMediaIds = Array.from(new Set(recentLogs.map(l => l.mediaId)));
    const recentMedia = media.filter(m => recentMediaIds.includes(m.id));

    // Gather their genres
    const recentGenres = new Map<string, number>();
    recentMedia.forEach(m => {
      m.genres?.forEach(g => {
        recentGenres.set(g, (recentGenres.get(g) || 0) + 1);
      });
    });

    // Score backlog items based on how many genres they share
    const scoredBacklog = validBacklog.map(item => {
      let score = 0;
      item.genres?.forEach(g => {
        if (recentGenres.has(g)) score += recentGenres.get(g)!;
      });
      // also rate higher if it has higher review score
      if (item.reviewScore) score += (item.reviewScore / 2); // add extra points
      return { item, score };
    });

    // Sort by score
    scoredBacklog.sort((a, b) => b.score - a.score);

    // Pick top 3 unique items
    const top3 = scoredBacklog.slice(0, 3).map(s => s.item);
    setSmartSuggestions(top3);
  };

  // Generate initial suggestions if unset
  useState(() => {
    // Only run once
    setTimeout(generateSmartSuggestions, 500);
  });

  const handleEdit = (item: MediaItem) => {
    setCurrentActionItem(item);
    setIsFormOpen(true);
  };

  const handleViewDetails = (item: MediaItem) => {
    setCurrentActionItem(item);
    setIsDetailOpen(true);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-12">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white flex items-center gap-3 tracking-tight">
          <Dice5 className="w-8 h-8 text-pink-500" />
          Backlog Roulette
        </h2>
        <p className="text-zinc-400 mt-2">Let fate decide your next journey.</p>
      </header>

      {/* The Roulette Section */}
      <section className="bg-zinc-900/40 border border-white/5 rounded-3xl p-8 flex flex-col items-center">
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Not sure what to consume next?</h3>
          <p className="text-zinc-400">Spin the wheel and pick a random item from your backlog.</p>
        </div>

        <button 
          onClick={spinRoulette}
          disabled={validBacklog.length === 0}
          className="bg-gradient-to-r from-pink-600 to-orange-600 hover:from-pink-500 hover:to-orange-500 text-white px-8 py-4 rounded-full font-black text-xl tracking-wider uppercase transition-all shadow-[0_0_40px_rgba(249,115,22,0.3)] hover:shadow-[0_0_60px_rgba(249,115,22,0.5)] hover:scale-105 active:scale-95 disabled:opacity-50 disabled:grayscale mb-10 flex items-center gap-3"
        >
          <RefreshCw className="w-6 h-6" />
          Spin The Roulette
        </button>

        {validBacklog.length === 0 && (
          <p className="text-zinc-500 text-sm italic mt-[-20px] mb-8">Your backlog (media in "Planning" status) is empty.</p>
        )}

        {selectedCard && (
          <div className="w-full max-w-sm animate-in zoom-in spin-in-2 duration-500">
            <h4 className="text-center text-zinc-400 font-bold tracking-widest uppercase text-xs mb-3">Your Destiny:</h4>
            <MediaCard 
              item={selectedCard}
              onLogProgress={() => {}}
              onEdit={handleEdit}
              onViewDetails={handleViewDetails}
            />
          </div>
        )}
      </section>

      {/* Smart Suggestions Section */}
      <section>
        <div className="flex justify-between items-end mb-6">
          <div>
            <h3 className="text-2xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-400" />
              Smart Suggestions
            </h3>
            <p className="text-zinc-400 text-sm mt-1">Based on what you've recently engaged with.</p>
          </div>
          <button 
            onClick={generateSmartSuggestions}
            className="text-zinc-500 hover:text-white transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {validBacklog.length === 0 ? (
           <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-12 text-center text-zinc-500">
             No backlog to suggest from.
           </div>
        ) : smartSuggestions.length === 0 ? (
          <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-12 text-center text-zinc-500 flex justify-center">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {smartSuggestions.map(item => (
              <MediaCard 
                key={item.id}
                item={item}
                onLogProgress={() => {}}
                onEdit={handleEdit}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
        )}
      </section>

      {/* The Oracle Section */}
      <section className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/20 rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
           <div className="flex-1">
             <h3 className="text-3xl font-black text-indigo-100 flex items-center gap-3 mb-4 tracking-tight">
               <Eye className="w-8 h-8 text-indigo-400" />
               Consult The Oracle
             </h3>
             <p className="text-indigo-200/70 mb-6 text-sm leading-relaxed max-w-lg">
               Allow the mystic forces (Nano-GPT) to peer into your past journeys and scry your backlog to reveal the singular path you must take.
             </p>
             <button 
               onClick={consultOracle}
               disabled={isOracleLoading || validBacklog.length === 0}
               className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-500 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2"
             >
               {isOracleLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
               {isOracleLoading ? "The Oracle is Scrying..." : "Ask The Oracle"}
             </button>
           </div>
           
           {(oracleRecommendation || isOracleLoading) && (
             <div className="flex-1 w-full bg-black/40 border border-indigo-500/30 rounded-2xl p-6 min-h-[200px]">
                {isOracleLoading ? (
                  <div className="h-full flex flex-col items-center justify-center text-indigo-400 opacity-70 gap-4">
                     <Eye className="w-10 h-10 animate-pulse" />
                     <span className="text-sm tracking-widest uppercase font-bold text-indigo-300">Peering into the void...</span>
                  </div>
                ) : (
                  <div className="prose prose-invert prose-sm prose-indigo max-w-none">
                     <Markdown>{oracleRecommendation}</Markdown>
                  </div>
                )}
             </div>
           )}
        </div>
      </section>

      {/* Modals */}
      <MediaDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        item={currentActionItem}
        logs={logs.filter(l => l.mediaId === currentActionItem?.id)}
        onEdit={(item) => {
          setIsDetailOpen(false);
          handleEdit(item);
        }}
      />

      <MediaFormModal 
        isOpen={isFormOpen} 
        initialData={currentActionItem || undefined} 
        onClose={() => setIsFormOpen(false)} 
        onSave={(data) => {
          saveMediaItem(data);
          setIsFormOpen(false);
        }} 
        onDelete={(id) => {
          deleteMediaItem(id);
          setIsFormOpen(false);
        }}
      />
    </div>
  );
}
