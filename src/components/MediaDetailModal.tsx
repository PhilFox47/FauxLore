import React, { useState } from 'react';
import { MediaItem, ProgressLog } from '../types/schema';
import { useMediaContext } from '../contexts/MediaContext';
import { X, Edit2, Clock, Calendar, BookOpen, Star, Hash, Gamepad2, Tv, Film } from 'lucide-react';
import { calculateScaledDelta } from '../lib/scaling';

interface MediaDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MediaItem | null;
  logs: ProgressLog[];
  onEdit: (item: MediaItem) => void;
}

export function MediaDetailModal({ isOpen, onClose, item, logs, onEdit }: MediaDetailModalProps) {
  if (!isOpen || !item) return null;

  const { settings } = useMediaContext();
  const totalMasterPages = logs.reduce((acc, log) => acc + calculateScaledDelta(log.delta, item, settings), 0);
  
  // Sort logs descending by timestamp
  const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl min-h-[70vh] max-h-[90vh] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
        
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white/70 hover:text-white transition">
          <X className="w-5 h-5" />
        </button>

        {/* Left/Background Panel: Cover Art & Basic Info */}
        <div className="relative w-full md:w-2/5 p-8 flex flex-col justify-end min-h-[300px]">
          {/* Blurred Background Image */}
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ 
              backgroundImage: item.coverImageUrl ? `url(${item.coverImageUrl})` : 'none',
              filter: 'blur(30px) brightness(0.4)',
              transform: 'scale(1.1)'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          
          <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left">
            {item.coverImageUrl ? (
              <img src={item.coverImageUrl} alt={item.title} className="w-48 h-auto rounded-xl shadow-2xl mb-6 border border-white/10" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-48 h-64 bg-zinc-800 rounded-xl shadow-2xl mb-6 flex items-center justify-center border border-white/10">
                <BookOpen className="w-12 h-12 text-zinc-600" />
              </div>
            )}
            <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">{item.title}</h2>
            <p className="text-zinc-400 font-medium mb-4">{item.creator || item.publisher}</p>
            
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-6">
              <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.mediaType}</span>
              <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.status}</span>
              {item.year && <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.year}</span>}
            </div>

            <button 
              onClick={() => { onClose(); onEdit(item); }}
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium flex justify-center items-center gap-2 transition"
            >
              <Edit2 className="w-4 h-4" />
              Edit Media Details
            </button>
          </div>
        </div>

        {/* Right Panel: Content */}
        <div className="w-full md:w-3/5 bg-[#121214] p-8 overflow-y-auto">
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-zinc-800/50 p-4 rounded-2xl border border-white/5">
              <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Logs
              </div>
              <div className="text-2xl font-black text-white">{logs.length}</div>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded-2xl border border-white/5">
              <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Star className="w-3 h-3" /> Rating
              </div>
              <div className="text-2xl font-black text-white">{item.userRating ? `${Array(item.userRating).fill('★').join('')}` : '-'}</div>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded-2xl border border-white/5">
              <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Hash className="w-3 h-3" /> Master Pgs
              </div>
              <div className="text-2xl font-black text-white">{Math.floor(totalMasterPages)}</div>
            </div>
          </div>

          {item.description && (
            <div className="mb-8">
              <h3 className="text-lg font-bold text-white mb-3 tracking-wide">Description</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{item.description}</p>
            </div>
          )}

          {item.genres && item.genres.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-bold text-zinc-500 mb-3 tracking-wider uppercase">Genres & Tags</h3>
              <div className="flex flex-wrap gap-2">
                {item.genres.map((g, i) => <span key={i} className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">{g}</span>)}
                {item.tags?.map((t, i) => <span key={i} className="text-xs px-2 py-1 bg-orange-500/10 text-orange-400 rounded border border-orange-500/20">{t}</span>)}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-lg font-bold text-white mb-4 tracking-wide">Journal Entries & Progress</h3>
            {sortedLogs.length === 0 ? (
              <p className="text-zinc-500 italic text-sm">No progress logged yet.</p>
            ) : (
              <div className="space-y-4">
                {sortedLogs.map(log => (
                  <div key={log.id} className="p-4 bg-zinc-800/30 rounded-xl border border-white/5 relative">
                    {/* Timestamp indicator line */}
                    <div className="absolute top-0 bottom-0 left-4 w-px bg-zinc-700/50" />
                    
                    <div className="flex items-center gap-3 mb-2 relative z-10 pl-4">
                      <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] -ml-[21px]" />
                      <span className="text-xs font-mono text-zinc-400">
                        {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-xs font-bold text-orange-400 ml-auto bg-orange-500/10 px-2 py-0.5 rounded">
                        +{log.delta} {log.metricType}
                      </span>
                    </div>
                    {log.note && (
                      <div className="pl-4 relative z-10 mt-3">
                        <p className="text-sm text-zinc-300 italic">"{log.note}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
