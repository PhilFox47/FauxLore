import React, { useState, useEffect } from 'react';
import { MediaItem, getMetricForType, MEDIA_COLORS } from '../types/schema';
import { X, Plus, Minus, Calendar, History, Check, Clock, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { useMediaContext } from '../contexts/MediaContext';

interface ProgressModalProps {
  isOpen: boolean;
  item: MediaItem | null;
  onClose: () => void;
  onLog: (mediaId: string, metricType: any, delta: number, note?: string, timestamp?: string, location?: string, isHistoric?: boolean) => void;
}

export function ProgressModal({ isOpen, item, onClose, onLog }: ProgressModalProps) {
  const { saveMediaItem } = useMediaContext();
  const [mode, setMode] = useState<'set' | 'add'>('set');
  const [inputValue, setInputValue] = useState<number | ''>(1);
  const [note, setNote] = useState('');
  const [location, setLocation] = useState(localStorage.getItem('fauxlore_last_location') || '');
  const [status, setStatus] = useState<MediaItem['status']>('Active');
  const [userRating, setUserRating] = useState<number | ''>('');
  const [userReview, setUserReview] = useState('');
  const [logDate, setLogDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [logTime, setLogTime] = useState<string>(format(new Date(), 'HH:mm'));
  const [isHistorical, setIsHistorical] = useState(false);

  const [currentVal, setCurrentVal] = useState(0);
  const metricType = item ? getMetricForType(item.mediaType) : null;
  const colors = item ? MEDIA_COLORS[item.mediaType] : null;

  useEffect(() => {
    if (isOpen && item) {
      const metric = getMetricForType(item.mediaType);
      const cv = metric ? Number(item[metric as keyof MediaItem]) || 0 : 0;
      setCurrentVal(cv);
      
      setMode('set');
      setInputValue(cv + 1); // UX Default: One increment above current total
      setNote('');
      setStatus(item.status);
      setUserRating(item.userRating ?? '');
      setUserReview(item.userReview ?? '');
      const now = new Date();
      setLogDate(format(now, 'yyyy-MM-dd'));
      setLogTime(format(now, 'HH:mm'));
      setIsHistorical(false);
    }
  }, [isOpen, item]);

  if (!isOpen || !item || !colors) return null;

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

  const handleModeChange = (newMode: 'set' | 'add') => {
    if (mode === newMode) return;
    setMode(newMode);
    if (newMode === 'add') {
      setInputValue(1);
    } else {
      setInputValue(currentVal + 1);
    }
  };

  const handleLog = () => {
    if (typeof inputValue !== 'number' || !metricType) return;
    
    let delta = 0;
    if (mode === 'set') {
      delta = (inputValue) - currentVal;
    } else {
      delta = inputValue;
    }

    if (delta === 0 && !note) return; // Ignore completely blank / no-change submits
    
    // Convert YYYY-MM-DD + HH:mm input to full ISO timestamp
    let finalTimestamp = new Date().toISOString();
    
    if (logDate) {
      const selectedDate = new Date(logDate);
      if (logTime) {
        const [hours, minutes] = logTime.split(':').map(Number);
        selectedDate.setHours(hours, minutes, 0, 0);
      }
      finalTimestamp = selectedDate.toISOString();
    }
    
    if (location) {
      localStorage.setItem('fauxlore_last_location', location);
    }
    
    onLog(item.id, metricType, delta, note, finalTimestamp, location, isHistorical);
    
    let updatedItem = { ...item };
    let needsUpdate = false;
    
    if (status !== item.status) {
      updatedItem.status = status;
      needsUpdate = true;
    }
    
    if (status === 'Completed') {
      if (userRating !== '' && userRating !== item.userRating) {
        updatedItem.userRating = userRating;
        needsUpdate = true;
      }
      if (userReview !== item.userReview) {
        updatedItem.userReview = userReview;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      saveMediaItem(updatedItem);
    }
    
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white flex-1 truncate">
            Update {item.title}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Mode Toggle */}
          <div className="flex p-1 bg-zinc-800/50 rounded-xl relative">
            <button
               type="button"
               onClick={() => handleModeChange('set')}
               className={cn("flex-1 py-1.5 text-xs font-bold rounded-lg transition-all relative z-10", mode === 'set' ? "text-white shadow-sm bg-zinc-700" : "text-zinc-500 hover:text-zinc-300")}
            >
              Set Total
            </button>
            <button
               type="button"
               onClick={() => handleModeChange('add')}
               className={cn("flex-1 py-1.5 text-xs font-bold rounded-lg transition-all relative z-10", mode === 'add' ? "text-white shadow-sm bg-zinc-700" : "text-zinc-500 hover:text-zinc-300")}
            >
              Add Amount
            </button>
          </div>

          {/* Value Input */}
          <div>
            <div className="flex justify-between items-end mb-2">
              <label className="block text-sm font-medium text-zinc-300">
                {mode === 'set' ? `Set Total ${getMetricLabel()}` : `Add ${getMetricLabel()}`}
              </label>
              {mode === 'set' && (
                <span className="text-xs text-zinc-500 font-mono">Current: {currentVal}</span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => setInputValue(prev => typeof prev === 'number' ? prev - 1 : -1)}
                className="shrink-0 p-3 bg-zinc-800 rounded-xl hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input 
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value === '' ? '' : Number(e.target.value))}
                className={cn("flex-1 min-w-0 bg-[#18181b] border border-white/10 rounded-xl px-3 py-3 text-center text-white focus:outline-none font-bold", `focus:border-${colors.bg.split('-')[1]}-500`)}
              />
              <button 
                type="button"
                onClick={() => setInputValue(prev => typeof prev === 'number' ? prev + 1 : 1)}
                className="shrink-0 p-3 bg-zinc-800 rounded-xl hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            {mode === 'set' && typeof inputValue === 'number' && (inputValue - currentVal) !== 0 && (
               <p className="text-xs text-center mt-2 font-medium">
                 <span className={inputValue > currentVal ? "text-emerald-400" : "text-rose-400"}>
                   {inputValue > currentVal ? '+' : ''}{inputValue - currentVal}
                 </span>
                 <span className="text-zinc-500"> difference will be logged</span>
               </p>
            )}
          </div>

          {/* Date & Historic Options */}
          <div className="space-y-3">
             <label className="block text-sm font-medium text-zinc-300">Date & Time Logged</label>
             
             {!isHistorical && (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Calendar className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input 
                      type="date"
                      value={logDate}
                      onChange={(e) => setLogDate(e.target.value)}
                      className={cn("w-full bg-[#18181b] border border-white/10 rounded-xl pl-10 pr-3 py-3 text-white focus:outline-none text-sm cursor-pointer", `focus:border-${colors.bg.split('-')[1]}-500`)}
                    />
                  </div>
                  <div className="relative w-32">
                    <Clock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input 
                      type="time"
                      value={logTime}
                      onChange={(e) => setLogTime(e.target.value)}
                      className={cn("w-full bg-[#18181b] border border-white/10 rounded-xl pl-10 pr-3 py-3 text-white focus:outline-none text-sm cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0", `focus:border-${colors.bg.split('-')[1]}-500`)}
                    />
                  </div>
                </div>
             )}

             <button 
               type="button"
               onClick={() => setIsHistorical(!isHistorical)}
               className={cn("w-full px-4 py-2.5 rounded-xl border flex items-center justify-between transition-all text-sm font-medium", isHistorical ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "bg-zinc-800/30 border-white/5 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300")}
             >
                <div className="flex items-center gap-2">
                   <History className="w-4 h-4" />
                   Historical Backlog (Exclude from stats)
                </div>
                <div className={cn("w-4 h-4 rounded border flex items-center justify-center transition-colors", isHistorical ? "border-amber-500 bg-amber-500" : "border-zinc-600")}>
                   {isHistorical && <Check className="w-3 h-3 text-amber-950" />}
                </div>
             </button>
          </div>

          <div>
             <label className="block text-sm font-medium text-zinc-300 mb-1">Log Note (Optional)</label>
             <textarea 
               value={note}
               onChange={(e) => setNote(e.target.value)}
               placeholder="Brief notes from this session..."
               className={cn("w-full bg-[#18181b] border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none min-h-[80px] resize-none text-sm mb-4", `focus:border-${colors.bg.split('-')[1]}-500`)}
             />
             
             <label className="block text-sm font-medium text-zinc-300 mb-1">Location (Optional)</label>
             <div className="relative">
               <MapPin className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
               <input 
                 type="text"
                 value={location}
                 onChange={(e) => setLocation(e.target.value)}
                 placeholder="e.g. Home, Train, Living Room"
                 className={cn("w-full bg-[#18181b] border border-white/10 rounded-xl pl-10 pr-3 py-3 text-white focus:outline-none text-sm", `focus:border-${colors.bg.split('-')[1]}-500`)}
               />
             </div>
          </div>

          <div className="space-y-4">
             <div>
               <label className="block text-sm font-medium text-zinc-300 mb-1">Status</label>
               <select
                 value={status}
                 onChange={(e) => setStatus(e.target.value as MediaItem['status'])}
                 className={cn("w-full bg-[#18181b] border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none text-sm appearance-none", `focus:border-${colors.bg.split('-')[1]}-500`)}
               >
                 <option value="Active">Active</option>
                 <option value="Planning">Planning</option>
                 <option value="Completed">Completed</option>
                 <option value="Dropped">Dropped</option>
               </select>
             </div>

             {status === 'Completed' && (
               <div className="space-y-4 p-4 border border-amber-500/30 bg-amber-500/5 rounded-xl">
                 <div>
                   <label className="block text-sm font-medium text-amber-500 mb-1 flex justify-between items-center">
                     <span>Your Rating</span>
                     {userRating !== '' && <span className="font-bold">{userRating}/5</span>}
                   </label>
                   <input
                     type="range"
                     min="0"
                     max="5"
                     step="0.5"
                     value={userRating === '' ? 5 : userRating}
                     onChange={(e) => setUserRating(Number(e.target.value))}
                     className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-amber-500 mb-1">Your Review</label>
                   <textarea
                     value={userReview}
                     onChange={(e) => setUserReview(e.target.value)}
                     placeholder="What did you think of it overall?"
                     className="w-full bg-[#18181b] border border-amber-500/30 rounded-lg px-3 py-2 text-white text-sm min-h-[80px] focus:outline-none focus:border-amber-500 resize-none"
                   />
                 </div>
               </div>
             )}
          </div>
        </div>

        <div className="p-6 border-t border-white/5 flex gap-3 bg-[#09090B]">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition">
            Cancel
          </button>
          <button type="button" onClick={handleLog} className={cn("flex-1 px-4 py-2.5 rounded-xl font-medium text-white transition shadow-lg", colors.bg, colors.shadow, `hover:opacity-80`)}>
            Save Log
          </button>
        </div>
      </div>
    </div>
  );
}
