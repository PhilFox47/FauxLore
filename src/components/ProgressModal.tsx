import React, { useState, useEffect } from 'react';
import { MediaItem, getMetricForType, MEDIA_COLORS } from '../types/schema';
import { X, Plus, Minus, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

interface ProgressModalProps {
  isOpen: boolean;
  item: MediaItem | null;
  onClose: () => void;
  onLog: (mediaId: string, metricType: any, delta: number, note?: string, timestamp?: string) => void;
}

export function ProgressModal({ isOpen, item, onClose, onLog }: ProgressModalProps) {
  const [delta, setDelta] = useState<number | ''>(1);
  const [note, setNote] = useState('');
  const [logDate, setLogDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (isOpen) {
      setDelta(1);
      setNote('');
      setLogDate(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const metricType = getMetricForType(item.mediaType);
  const colors = MEDIA_COLORS[item.mediaType];

  const getMetricLabel = () => {
    switch (metricType) {
      case 'playtimeHours': return 'Hours Played';
      case 'pagesRead': return 'Pages Read';
      case 'chaptersRead': return 'Chapters Read';
      case 'episodesWatched': return 'Episodes Watched';
      case 'watchCount': return 'Times Watched (Movie)';
      case 'issuesRead': return 'Issues Read';
      default: return 'Progress';
    }
  }

  const handleLog = () => {
    if (typeof delta !== 'number' || delta === 0 || !metricType) return;
    
    // Convert YYYY-MM-DD input to full ISO timestamp
    let finalTimestamp = new Date().toISOString();
    if (logDate && logDate !== format(new Date(), 'yyyy-MM-dd')) {
      const selectedDate = new Date(logDate);
      // Retain current time-of-day for the selected date to prevent timezone weirdness on stats
      const now = new Date();
      selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
      finalTimestamp = selectedDate.toISOString();
    }
    
    onLog(item.id, metricType, delta, note, finalTimestamp);
    setDelta(1);
    setNote('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white flex-1 truncate">
            Update {item.title}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">{getMetricLabel()} (+/-)</label>
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => setDelta(prev => typeof prev === 'number' ? prev - 1 : -1)}
                className="p-3 bg-zinc-800 rounded-xl hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input 
                type="number"
                value={delta}
                onChange={(e) => setDelta(e.target.value === '' ? '' : Number(e.target.value))}
                className={cn("flex-1 bg-[#18181b] border border-white/10 rounded-xl px-3 py-3 text-center text-white focus:outline-none font-bold", `focus:border-${colors.bg.split('-')[1]}-500`)}
              />
              <button 
                type="button"
                onClick={() => setDelta(prev => typeof prev === 'number' ? prev + 1 : 1)}
                className="p-3 bg-zinc-800 rounded-xl hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
             <label className="block text-sm font-medium text-zinc-400 mb-1">Date</label>
             <div className="relative">
               <Calendar className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
               <input 
                 type="date"
                 value={logDate}
                 onChange={(e) => setLogDate(e.target.value)}
                 className={cn("w-full bg-[#18181b] border border-white/10 rounded-xl pl-10 pr-3 py-3 text-white focus:outline-none text-sm", `focus:border-${colors.bg.split('-')[1]}-500`)}
               />
             </div>
          </div>

          <div>
             <label className="block text-sm font-medium text-zinc-400 mb-1">Log Note (Optional)</label>
             <textarea 
               value={note}
               onChange={(e) => setNote(e.target.value)}
               placeholder="Brief notes from this session..."
               className={cn("w-full bg-[#18181b] border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none min-h-[100px] resize-none text-sm", `focus:border-${colors.bg.split('-')[1]}-500`)}
             />
          </div>
        </div>

        <div className="p-6 border-t border-white/5 flex gap-3 bg-[#09090B]">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-white/10 font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition">
            Cancel
          </button>
          <button type="button" onClick={handleLog} className={cn("flex-1 px-4 py-2 rounded-xl font-medium text-white transition shadow-lg", colors.bg, colors.shadow, `hover:opacity-80`)}>
            Save Log
          </button>
        </div>
      </div>
    </div>
  );
}
