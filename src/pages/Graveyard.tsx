import React, { useMemo, useState } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { MediaCard } from '../components/MediaCard';
import { Skull, Edit3, RefreshCw, Check, X } from 'lucide-react';

export function Graveyard() {
  const { media, saveMediaItem } = useMediaContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReason, setEditReason] = useState("");

  const droppedMedia = useMemo(() => {
    return media.filter(m => m.status === 'Dropped').sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [media]);

  const handleRevive = (item: any) => {
    saveMediaItem({ ...item, status: 'Active', dropReason: undefined });
  };

  const startEditing = (item: any) => {
    setEditingId(item.id);
    setEditReason(item.dropReason || "");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditReason("");
  };

  const saveEdit = (item: any) => {
    saveMediaItem({ ...item, dropReason: editReason });
    setEditingId(null);
  };

  if (droppedMedia.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[60vh]">
        <div className="w-20 h-20 bg-zinc-900/50 rounded-full flex items-center justify-center mb-6 shadow-inner blur-[1px]">
          <Skull className="w-10 h-10 text-zinc-700" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-400 mb-2 font-serif">The Graveyard is Empty</h2>
        <p className="text-zinc-600 max-w-sm mb-6 pb-12 border-b border-zinc-800/50">
          You haven't abandoned any journeys... yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-16 max-w-6xl mx-auto">
      <div className="flex justify-between items-end mb-8 mt-4 border-b border-rose-900/20 pb-6">
        <div>
          <h1 className="text-4xl font-black text-rose-500 tracking-tighter flex items-center gap-3">
            <Skull className="w-8 h-8 text-rose-500/80" /> 
            The Graveyard
          </h1>
          <p className="text-rose-400/50 mt-2 text-lg font-serif italic">Where unfinished journeys rest in peace.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
        {droppedMedia.map(item => {
          let progressText = '';
          let progressPercent = 0;
          switch(item.mediaType) {
            case 'Game':
            case 'Visual Novel':
              if (item.isOngoing) { progressText = `${item.playtimeHours || 0}h`; }
              else {
                progressText = `${item.playtimeHours || 0}h`;
                if (item.averagePlaytime && item.averagePlaytime > 0) {
                  progressText += ` / ${item.averagePlaytime}h`;
                  progressPercent = ((item.playtimeHours || 0) / item.averagePlaytime) * 100;
                }
              } break;
            case 'Book': progressText = item.isOngoing ? `${item.pagesRead || 0} p` : `${item.pagesRead || 0} / ${item.totalPages || '?'} p`;
              if (item.totalPages) progressPercent = ((item.pagesRead || 0) / item.totalPages) * 100; break;
            case 'Manga': progressText = item.isOngoing ? `${item.chaptersRead || 0} ch` : `${item.chaptersRead || 0} / ${item.totalChapters || '?'} ch`;
              if (item.totalChapters) progressPercent = ((item.chaptersRead || 0) / item.totalChapters) * 100; break;
            case 'Series': progressText = item.isOngoing ? `${item.episodesWatched || 0} ep` : `${item.episodesWatched || 0} / ${item.totalEpisodes || '?'} ep`;
              if (item.totalEpisodes) progressPercent = ((item.episodesWatched || 0) / item.totalEpisodes) * 100; break;
            case 'Movie': progressText = item.watched ? 'Watched' : 'Not Watched'; progressPercent = item.watched ? 100 : 0; break;
            case 'Comic': progressText = item.isOngoing ? `${item.issuesRead || 0} iss` : `${item.issuesRead || 0} / ${item.totalIssues || '?'} iss`;
              if (item.totalIssues) progressPercent = ((item.issuesRead || 0) / item.totalIssues) * 100; break;
          }

          return (
          <div key={item.id} className="group relative bg-[#0a0a0c] border border-zinc-800/60 rounded-3xl p-5 flex flex-col justify-between overflow-hidden shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-500">
            {/* Background Texture/Accent */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-900/0 via-zinc-600/20 to-rose-900/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="flex gap-6 mb-5">
              <div className="w-28 shrink-0 aspect-[2/3] rounded-xl overflow-hidden shadow-lg ring-1 ring-white/5 transition-all duration-700">
                <img src={item.coverImageUrl || 'https://images.unsplash.com/photo-1618519764611-bd0823006228?auto=format&fit=crop&q=80&w=400'} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={item.title} />
              </div>
              <div className="flex flex-col flex-1 pt-1 justify-between">
                <div>
                  <h3 className="font-bold text-zinc-200 text-lg line-clamp-2 leading-tight pr-2 mb-1">{item.title}</h3>
                  <div className="text-zinc-500 text-xs italic font-serif mb-2">by {item.creator || 'Unknown'}</div>
                  <span className="text-[10px] font-black text-xs text-rose-500/80 uppercase tracking-widest">{item.mediaType}</span>
                </div>
                
                <div className="mt-auto space-y-4">
                  <div>
                    <div className="flex justify-between items-end mb-1.5">
                       <span className="text-[10px] uppercase font-black tracking-widest text-zinc-600">Progress</span>
                       <span className="text-xs font-mono text-zinc-400">{progressText}</span>
                    </div>
                    {item.isOngoing ? (
                      <div className="h-1.5 bg-zinc-900 rounded-full border border-zinc-800/50 flex items-center justify-center">
                         <span className="text-[8px] uppercase tracking-widest text-zinc-700">Ongoing</span>
                      </div>
                    ) : (
                      <div className="h-1.5 bg-black rounded-full overflow-hidden border border-zinc-800/50 relative">
                        {progressPercent > 0 && (
                          <div className="absolute top-0 left-0 h-full bg-zinc-600 rounded-full" style={{ width: `${Math.min(progressPercent, 100)}%` }} />
                        )}
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={() => handleRevive(item)}
                    className="flex items-center gap-2 text-xs font-bold bg-zinc-800/40 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 px-3 py-2 rounded-xl transition-colors border border-emerald-900/30 hover:border-emerald-500/30 w-full justify-center"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    REVIVE
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-[#111113] rounded-2xl p-4 border border-zinc-800/40 min-h-[90px] relative mt-auto">
              {editingId === item.id ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <span className="font-serif italic text-rose-500/80 text-sm">Cause of death</span>
                  </div>
                  <textarea
                    autoFocus
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-lg p-2 text-zinc-300 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500/50 resize-none h-20 placeholder:text-zinc-700"
                    placeholder="Why did you drop this?"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={cancelEditing} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                    <button onClick={() => saveEdit(item)} className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors">
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col">
                  <div className="flex flex-row items-center justify-between mb-3">
                    <span className="font-serif italic text-rose-500/60 text-sm border-b border-rose-900/30 pb-0.5 inline-block">Cause of death</span>
                    <button 
                      onClick={() => startEditing(item)}
                      className="text-zinc-600 hover:text-zinc-300 transition-colors bg-zinc-900/50 hover:bg-zinc-800 p-1.5 rounded-md opacity-0 group-hover:opacity-100"
                      title="Edit cause of death"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className={`text-zinc-400 text-sm leading-relaxed italic ${!item.dropReason ? 'text-zinc-600' : ''}`}>
                    "{item.dropReason || "Unknown reasons... lost to time."}"
                  </p>
                </div>
              )}
            </div>
          </div>
        )})}
      </div>
    </div>
  );
}
