import React, { useState, useEffect } from 'react';
import { MediaItem, getMetricForType, MEDIA_COLORS } from '../types/schema';
import { X, Plus, Minus, Calendar, History, Check, Clock, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import { calculateLogExp } from '../lib/rpgSystem';
import { format } from 'date-fns';
import { useMediaContext } from '../contexts/MediaContext';

interface ProgressModalProps {
  isOpen: boolean;
  item: MediaItem | null;
  onClose: () => void;
  onLog: (mediaId: string, metricType: any, delta: number, note?: string, timestamp?: string, location?: string, isHistoric?: boolean, extraUpdates?: any) => void;
}

export function ProgressModal({ isOpen, item, onClose, onLog }: ProgressModalProps) {
  const { saveMediaItem, logs, settings, artifacts } = useMediaContext();
  const [mode, setMode] = useState<'set' | 'add'>('set');
  const [inputValue, setInputValue] = useState<number | ''>(1);
  const [note, setNote] = useState('');
  const [location, setLocation] = useState(localStorage.getItem('fauxlore_last_location') || '');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [status, setStatus] = useState<MediaItem['status']>('Active');

  const uniqueLocations = Array.from(new Set(logs.map(l => l.location).filter(Boolean))) as string[];
  const filteredLocations = uniqueLocations.filter(loc => loc.toLowerCase().includes(location.toLowerCase()) && loc !== location);
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
      if (item.mediaType === 'Movie') {
        setInputValue(item.watched || cv > 0 ? 1 : 1); // For movies, default to 1 (checked) to easily mark as watched
      } else {
        setInputValue(cv + 1); // UX Default: One increment above current total
      }
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

  // Auto-complete status logic
  useEffect(() => {
    if (!item) return;

    let isComplete = false;
    
    if (item.mediaType === 'Movie') {
        if (inputValue === 1) isComplete = true;
    } else {
        if (typeof inputValue === 'number') {
            const newTotal = mode === 'set' ? inputValue : currentVal + inputValue;
            
            if (item.mediaType === 'Series' && item.totalEpisodes && newTotal >= item.totalEpisodes) isComplete = true;
            if (item.mediaType === 'Manga' && item.totalChapters && newTotal >= item.totalChapters) isComplete = true;
            if (item.mediaType === 'Book' && item.totalPages && newTotal >= item.totalPages) isComplete = true;
            if (item.mediaType === 'Comic' && item.totalIssues && newTotal >= item.totalIssues) isComplete = true;
        }
    }

    if (isComplete) {
        setStatus('Completed');
    }
  }, [inputValue, mode, currentVal, item?.mediaType, item?.totalEpisodes, item?.totalChapters, item?.totalPages, item?.totalIssues]);

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

    if (delta === 0 && !note && status === item.status && item.mediaType !== 'Movie') return; // Ignore completely blank submits
    
    // Convert YYYY-MM-DD + HH:mm input to full ISO timestamp
    let finalTimestamp = new Date().toISOString();
    
    if (isHistorical) {
      finalTimestamp = new Date('1970-01-01T00:00:00.000Z').toISOString();
    } else if (logDate) {
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
    
    // For movies, if delta is 0 but we want to assure watched is true
    let modifiedDelta = delta;
    if (item.mediaType === 'Movie' && inputValue === 1 && currentVal === 0) {
      modifiedDelta = 1;
    }

    let extraUpdates: any = {};
    
    if (item.mediaType === 'Movie' && inputValue === 1 && !item.watched) {
      extraUpdates.watched = true;
    } else if (item.mediaType === 'Movie' && inputValue === 0 && item.watched) {
      extraUpdates.watched = false;
    }

    if (status !== item.status) {
      extraUpdates.status = status;
    }
    
    if (status === 'Completed' || status === 'Extras') {
      if (userRating !== '' && userRating !== item.userRating) {
        extraUpdates.userRating = userRating;
      }
      if (userReview !== item.userReview) {
        extraUpdates.userReview = userReview;
      }
    }

    if (modifiedDelta !== 0 || note || Object.keys(extraUpdates).length > 0) {
      onLog(item.id, metricType, modifiedDelta, note, finalTimestamp, location, isHistorical, extraUpdates);
    }
    
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 font-sans">
      <div className="bg-gradient-to-b from-zinc-900 to-black border-2 border-white/10 rounded-[1.5rem] w-full max-w-lg overflow-hidden shadow-[0_0_50px_rgba(0,0,0,1)] flex flex-col max-h-[90vh] relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
        {/* Header (Combat Header) */}
        <div className={cn("px-5 py-4 sm:px-6 sm:py-5 flex items-center justify-between relative overflow-hidden", `bg-${colors.bg.split('-')[1]}-950/40`)}>
           <div className={cn("absolute inset-0 opacity-[0.1]", `bg-gradient-to-br from-${colors.bg.split('-')[1]}-500 to-transparent pointer-events-none`)}></div>
           <div className="relative z-10 flex-1">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] font-display flex items-center gap-2 mb-1.5" style={{color: `var(--color-${colors.bg.split('-')[1]}-400, #fff)`}}>
                 Battle Encounter
                 <div className="flex-1 h-px bg-white/10 ml-2"></div>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white truncate drop-shadow-md">
                {item.title}
              </h2>
           </div>
           <button onClick={onClose} className="relative z-10 text-white/50 hover:text-white transition-colors bg-black/50 hover:bg-black rounded-full p-2 border border-white/10 flex-shrink-0 ml-4 shadow-inner">
             <X className="w-5 h-5" />
           </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 no-scrollbar">
          
          {/* Action Selectors (Mode Toggle) */}
          {item.mediaType !== 'Movie' && (
            <div className="flex gap-2">
              <button
                 type="button"
                 onClick={() => handleModeChange('set')}
                 className={cn(
                   "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border shadow-inner", 
                   mode === 'set' 
                     ? "text-white bg-white/10 border-white/20 shadow-[inset_0_2px_10px_rgba(255,255,255,0.05)]" 
                     : "text-zinc-500 bg-transparent border-transparent hover:text-white/70 hover:bg-white/5"
                 )}
              >
                Set Override
              </button>
              <button
                 type="button"
                 onClick={() => handleModeChange('add')}
                 className={cn(
                   "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border shadow-inner", 
                   mode === 'add' 
                     ? "text-white bg-white/10 border-white/20 shadow-[inset_0_2px_10px_rgba(255,255,255,0.05)]" 
                     : "text-zinc-500 bg-transparent border-transparent hover:text-white/70 hover:bg-white/5"
                 )}
              >
                Execute Strike
              </button>
            </div>
          )}

          {/* Core Input (Combat Action) */}
          <div className="bg-zinc-950/50 border border-white/5 rounded-2xl p-4 sm:p-5 relative group overflow-hidden">
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.05] mix-blend-screen pointer-events-none"></div>
             
             {item.mediaType === 'Movie' ? (
                 <label className="flex items-center gap-4 cursor-pointer relative z-10 p-2">
                   <div className="relative">
                      <input 
                        type="checkbox" 
                        className="peer sr-only"
                        checked={inputValue === 1}
                        onChange={(e) => setInputValue(e.target.checked ? 1 : 0)}
                      />
                      <div className={cn("w-8 h-8 rounded-lg border-2 border-white/20 flex items-center justify-center transition-all peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-white/20", inputValue === 1 ? `bg-${colors.bg.split('-')[1]}-500 border-${colors.bg.split('-')[1]}-400` : "bg-black")}>
                         {inputValue === 1 && <Check className="w-5 h-5 text-white" />}
                      </div>
                   </div>
                   <div className="flex-1">
                      <div className="text-zinc-200 font-bold text-base">Mark as Viewed</div>
                      <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">Memory Encapsulation</div>
                   </div>
                 </label>
             ) : (
               <div className="relative z-10">
                 <div className="flex justify-between items-end mb-4">
                   <label className="block text-xs font-black uppercase tracking-[0.2em] text-zinc-400 font-display">
                     {mode === 'set' ? `Target ${getMetricLabel()}` : `Damage Dealt (${getMetricLabel()})`}
                   </label>
                   {mode === 'set' && (
                     <div className="text-[10px] text-zinc-500 font-mono font-bold bg-black/40 px-3 py-1 rounded shadow-inner border border-white/5">
                        Current Frame: {currentVal}
                     </div>
                   )}
                 </div>
                 
                 <div className="flex items-stretch gap-2.5">
                   <button 
                     type="button"
                     onClick={() => setInputValue(prev => typeof prev === 'number' ? prev - 1 : -1)}
                     className="shrink-0 w-12 flex items-center justify-center bg-black rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
                   >
                     <Minus className="w-4 h-4" />
                   </button>
                   {['Game', 'Visual Novel', 'Audiobook'].includes(item.mediaType) ? (
                      <div className="flex-1 flex gap-2">
                        <div className="flex-1 min-w-0 flex flex-col relative bg-black border-2 border-white/10 rounded-xl shadow-inner transition-colors focus-within:border-white/30">
                          <span className="text-[9px] uppercase text-zinc-500 font-bold absolute top-1.5 left-0 right-0 text-center z-10 pointer-events-none">Hours</span>
                          <input 
                            type="number"
                            min="0"
                            value={typeof inputValue === 'number' ? Math.floor(inputValue) : ''}
                            onChange={(e) => {
                               const h = e.target.value === '' ? 0 : Number(e.target.value);
                               const curM = typeof inputValue === 'number' ? Math.round((inputValue % 1) * 60) : 0;
                               setInputValue(Number((h + (curM/60)).toFixed(2)));
                            }}
                            className={cn("w-full bg-transparent px-2 pt-5 pb-1 text-center text-xl sm:text-2xl font-black text-white focus:outline-none font-display")}
                          />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col relative bg-black border-2 border-white/10 rounded-xl shadow-inner transition-colors focus-within:border-white/30">
                          <span className="text-[9px] uppercase text-zinc-500 font-bold absolute top-1.5 left-0 right-0 text-center z-10 pointer-events-none">Mins</span>
                          <input 
                            type="number"
                            min="0"
                            max="59"
                            value={typeof inputValue === 'number' ? Math.round((inputValue % 1) * 60) : ''}
                            onChange={(e) => {
                               const m = e.target.value === '' ? 0 : Number(e.target.value);
                               const curH = typeof inputValue === 'number' ? Math.floor(inputValue) : 0;
                               setInputValue(Number((curH + (m/60)).toFixed(2)));
                            }}
                            className={cn("w-full bg-transparent px-2 pt-5 pb-1 text-center text-xl sm:text-2xl font-black text-white focus:outline-none font-display")}
                          />
                        </div>
                      </div>
                    ) : (
                      <input 
                        type="number"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value === '' ? '' : Number(e.target.value))}
                        className={cn("flex-1 min-w-0 bg-black border-2 border-white/10 rounded-xl px-3 py-2 text-center text-2xl font-black text-white focus:outline-none font-display shadow-inner transition-colors", `focus:border-${colors.bg.split('-')[1]}-500`)}
                      />
                    )}
                   <button 
                     type="button"
                     onClick={() => setInputValue(prev => typeof prev === 'number' ? prev + 1 : 1)}
                     className="shrink-0 w-12 flex items-center justify-center bg-black rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
                   >
                     <Plus className="w-4 h-4" />
                   </button>
                 </div>
                 
                 {mode === 'set' && typeof inputValue === 'number' && (inputValue - currentVal) !== 0 && (
                    <div className="mt-4 flex flex-col items-center justify-center gap-2">
                       <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                          <span className={cn("px-2 py-0.5 rounded", inputValue > currentVal ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
                            {inputValue > currentVal ? '+' : ''}{inputValue - currentVal}
                          </span>
                          <span className="text-zinc-600">Delta</span>
                       </div>
                       {inputValue > currentVal && (
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase font-black bg-zinc-900/50 px-3 py-1 rounded-full border border-white/5 shadow-inner">
                             <span>Estimated Yield:</span>
                             <span className="text-emerald-400 font-mono">+{Math.floor(calculateLogExp(inputValue - currentVal, item, settings, artifacts?.filter(a => a?.isEquipped) || []))} EXP</span>
                          </div>
                       )}
                    </div>
                 )}
                 {mode === 'add' && typeof inputValue === 'number' && inputValue > 0 && (
                    <div className="mt-4 flex flex-col items-center justify-center gap-2">
                       <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase font-black bg-zinc-900/50 px-3 py-1 rounded-full border border-white/5 shadow-inner">
                          <span>Estimated Yield:</span>
                          <span className="text-emerald-400 font-mono">+{Math.floor(calculateLogExp(inputValue, item, settings, artifacts?.filter(a => a?.isEquipped) || []))} EXP</span>
                       </div>
                    </div>
                 )}
               </div>
             )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
             {/* Date & Historic Options */}
             <div className="space-y-3">
                <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest font-display">Temporal Coordinates</label>
                
                {!isHistorical && (
                   <div className="space-y-2">
                     <div className="relative">
                       <input 
                         type="date"
                         value={logDate}
                         onChange={(e) => setLogDate(e.target.value)}
                         className="w-full bg-black border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none text-xs font-mono cursor-pointer shadow-inner focus:border-white/30 transition-colors"
                       />
                     </div>
                     <div className="relative w-full">
                       <input 
                         type="time"
                         value={logTime}
                         onChange={(e) => setLogTime(e.target.value)}
                         className="w-full bg-black border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none text-xs font-mono cursor-pointer shadow-inner focus:border-white/30 transition-colors [&::-webkit-calendar-picker-indicator]:opacity-0"
                       />
                     </div>
                   </div>
                )}

                <button 
                  type="button"
                  onClick={() => setIsHistorical(!isHistorical)}
                  className={cn(
                    "w-full px-3 py-2 rounded-xl border flex flex-col items-center justify-center transition-all text-[9px] font-black uppercase tracking-widest", 
                    isHistorical 
                       ? "bg-amber-950/60 border-amber-500/40 text-amber-500 shadow-[inset_0_2px_10px_rgba(245,158,11,0.1)]" 
                       : "bg-black/50 border-white/5 text-zinc-600 hover:text-zinc-400 hover:border-white/10 shadow-inner"
                  )}
                >
                   <History className="w-4 h-4 mb-1 opacity-80" />
                   {isHistorical ? "Historical mode active" : "Enable Historical Log"}
                </button>
             </div>

             {/* Meta inputs */}
             <div className="space-y-3">
                <div>
                   <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest font-display mb-1.5">Battle Notes</label>
                   <textarea 
                     value={note}
                     onChange={(e) => setNote(e.target.value)}
                     placeholder="Thoughts, strategies, or lore..."
                     className="w-full bg-black border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none min-h-[64px] sm:min-h-[80px] resize-none text-xs font-mono shadow-inner focus:border-white/30 transition-colors"
                   />
                </div>
                <div>
                   <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest font-display mb-1.5">Location Data</label>
                   <div className="relative">
                     <MapPin className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                     <input 
                       type="text"
                       value={location}
                       onChange={(e) => { setLocation(e.target.value); setShowLocationDropdown(true); }}
                       onFocus={() => setShowLocationDropdown(true)}
                       onBlur={() => setTimeout(() => setShowLocationDropdown(false), 200)}
                       placeholder="e.g. Home, Commute..."
                       className="w-full bg-black border border-white/10 rounded-xl pl-8 pr-3 py-2 text-white focus:outline-none text-xs font-mono shadow-inner focus:border-white/30 transition-colors"
                     />
                     {showLocationDropdown && filteredLocations.length > 0 && (
                       <div className="absolute z-20 w-full mt-1 bg-zinc-900 border border-white/10 rounded-xl shadow-xl overflow-hidden max-h-32 overflow-y-auto">
                          {filteredLocations.map((loc, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setLocation(loc);
                                setShowLocationDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5 last:border-0"
                            >
                              {loc}
                            </button>
                          ))}
                       </div>
                     )}
                   </div>
                </div>
             </div>
          </div>

          <div className="bg-zinc-950/50 border border-white/5 rounded-2xl p-4 sm:p-5">
             <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest font-display mb-2">Entity Status</label>
             <select
               value={status}
               onChange={(e) => setStatus(e.target.value as MediaItem['status'])}
               className="w-full bg-black border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold text-xs sm:text-sm appearance-none cursor-pointer shadow-inner focus:outline-none focus:border-white/30 transition-colors"
             >
               <option value="Active">Active (Engaged)</option>
               <option value="Planning">Planning (Scouted)</option>
               <option value="Extras">Extras (Post-Game/Bonus)</option>
               <option value="Completed">Completed (Defeated)</option>
               <option value="Dropped">Dropped (Retreated)</option>
             </select>

             {(status === 'Completed' || status === 'Extras') && (
               <div className="mt-3 space-y-3 p-4 bg-gradient-to-b from-amber-500/10 to-transparent border-t border-amber-500/20 rounded-b-xl relative">
                 <div>
                   <label className="flex items-center justify-between text-[9px] font-black text-amber-500/70 uppercase tracking-widest font-display mb-1.5">
                     <span>Final Evaluation</span>
                     {userRating !== '' && <span className="text-amber-400">Score: {userRating}/5</span>}
                   </label>
                   <input
                     type="range"
                     min="0"
                     max="5"
                     step="0.5"
                     value={userRating === '' ? 5 : userRating}
                     onChange={(e) => setUserRating(Number(e.target.value))}
                     className="w-full h-1.5 bg-black rounded-lg appearance-none cursor-pointer accent-amber-500 shadow-inner"
                   />
                 </div>
                 <div>
                   <label className="block text-[9px] font-black text-amber-500/70 uppercase tracking-widest font-display mb-1.5">Concluding Thoughts</label>
                   <textarea
                     value={userReview}
                     onChange={(e) => setUserReview(e.target.value)}
                     placeholder="Summarize the encounter..."
                     className="w-full bg-black border border-amber-500/20 rounded-xl px-3 py-2 text-white text-xs font-mono min-h-[60px] focus:outline-none focus:border-amber-500/50 resize-none shadow-inner transition-colors"
                   />
                 </div>
               </div>
             )}
          </div>
        </div>

        {/* Footer (Actions) */}
        <div className="p-4 sm:px-6 sm:py-5 border-t border-white/5 bg-[#0a0a0c] flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-white/10 font-black uppercase tracking-widest text-[10px] sm:text-xs text-zinc-400 hover:text-white hover:bg-white/5 hover:border-white/20 transition-all font-display">
            Abort
          </button>
          <button type="button" onClick={handleLog} className={cn("flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] sm:text-xs text-white transition-all shadow-[inset_0_2px_10px_rgba(255,255,255,0.3)] font-display hover:-translate-y-0.5", colors.bg, `shadow-[0_10px_20px_-10px_var(--color-${colors.bg.split('-')[1]}-600)]`)}>
            Commit Log
          </button>
        </div>
      </div>
    </div>
  );
}
