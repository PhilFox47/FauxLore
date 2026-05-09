import React, { useMemo } from 'react';
import { MediaItem, getMetricForType, MEDIA_COLORS } from '../types/schema';
import { 
  Play, 
  Pause, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Calendar, 
  Gamepad2, 
  Book, 
  Tv, 
  Clapperboard, 
  Library,
  BookImage,
  Ghost, 
  MessagesSquare,
  Plus, 
  Edit2, 
  Star, 
  StarHalf, 
  RotateCcw,
  Sparkles,
  Flame,
  Headphones,
  AlertTriangle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useMediaContext } from '../contexts/MediaContext';
import { calculateStreak } from '../lib/streak';

interface MediaCardProps {
  key?: string | number;
  item: MediaItem;
  onEdit?: (item: MediaItem) => void;
  onLogProgress?: (item: MediaItem) => void;
  onViewDetails?: (item: MediaItem) => void;
}

export function MediaCard({ item, onEdit, onLogProgress, onViewDetails }: MediaCardProps) {
  const { logs } = useMediaContext();
  
  const mediaLogs = useMemo(() => logs.filter(l => l.mediaId === item.id), [logs, item.id]);
  const currentStreak = useMemo(() => calculateStreak(mediaLogs), [mediaLogs]);

  const daysSinceActive = useMemo(() => {
    if (item.status !== 'Active') return 0;
    const lastActiveMs = mediaLogs.length 
      ? Math.max(...mediaLogs.map(l => new Date(l.timestamp).getTime())) 
      : new Date(item.updatedAt || item.createdAt).getTime();
    return Math.floor((Date.now() - lastActiveMs) / (1000 * 60 * 60 * 24));
  }, [item.status, mediaLogs, item.updatedAt, item.createdAt]);

  let grayscale = 0;
  let cobwebOpacity = 0;
  let showRedWarning = false;
  let daysUntilDrop = 0;

  if (daysSinceActive > 7 && daysSinceActive <= 21) {
    grayscale = ((daysSinceActive - 7) / 14) * 100;
  } else if (daysSinceActive > 21) {
    grayscale = 100;
    if (daysSinceActive <= 42) {
      cobwebOpacity = (daysSinceActive - 21) / 21;
    } else {
      cobwebOpacity = 1;
    }
    if (daysSinceActive >= 43) {
      showRedWarning = true;
      daysUntilDrop = Math.max(0, 50 - daysSinceActive);
    }
  }

  const metricType = getMetricForType(item.mediaType);
  const colors = MEDIA_COLORS[item.mediaType];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Active': return <Play className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />;
      case 'On Hold': return <Pause className="w-3.5 h-3.5 fill-blue-400 text-blue-400" />;
      case 'Completed': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />;
      case 'Extras': return <CheckCircle2 className="w-3.5 h-3.5 text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]" />;
      case 'Planning': return <Clock className="w-3.5 h-3.5 text-zinc-400" />;
      case 'Dropped': return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      case 'Unreleased': return <Calendar className="w-3.5 h-3.5 text-zinc-400" />;
      default: return null;
    }
  };

  const getMediaTypeIcon = (type: string, className: string) => {
    switch (type) {
      case 'Game': return <Gamepad2 className={className} />;
      case 'Book': return <Book className={className} />;
      case 'Audiobook': return <Headphones className={className} />;
      case 'Visual Novel': return <MessagesSquare className={className} />;
      case 'Manga': return <Library className={className} />;
      case 'Series': return <Tv className={className} />;
      case 'Movie': return <Clapperboard className={className} />;
      case 'Comic': return <BookImage className={className} />;
      default: return null;
    }
  };
  
  // Build a display string for progress
  let progressText = '';
  let progressPercent = 0;
  
  switch(item.mediaType) {
    case 'Game':
      if (item.isOngoing) {
        progressText = `${Number((item.playtimeHours || 0).toFixed(1))}h`;
        progressPercent = 0;
      } else {
        progressText = `${Number((item.playtimeHours || 0).toFixed(1))}h`;
        if (item.averagePlaytime && item.averagePlaytime > 0) {
          progressText += ` / ${item.averagePlaytime}h`;
          progressPercent = ((item.playtimeHours || 0) / item.averagePlaytime) * 100;
        } else {
          progressPercent = 0;
        }
      }
      break;
    case 'Visual Novel':
      if (item.isOngoing) {
        progressText = `${Number((item.playtimeHours || 0).toFixed(1))}h`;
        progressPercent = 0;
      } else {
        progressText = `${Number((item.playtimeHours || 0).toFixed(1))}h`;
        if (item.averagePlaytime && item.averagePlaytime > 0) {
          progressText += ` / ${item.averagePlaytime}h`;
          progressPercent = ((item.playtimeHours || 0) / item.averagePlaytime) * 100;
        } else {
          progressPercent = 0;
        }
      }
      break;
    case 'Book':
      progressText = item.isOngoing ? `${item.pagesRead || 0} p` : `${item.pagesRead || 0} / ${item.totalPages || '?'} p`;
      if (item.totalPages) progressPercent = ((item.pagesRead || 0) / item.totalPages) * 100;
      break;
    case 'Manga':
      progressText = item.isOngoing ? `${item.chaptersRead || 0} ch` : `${item.chaptersRead || 0} / ${item.totalChapters || '?'} ch`;
      if (item.totalChapters) progressPercent = ((item.chaptersRead || 0) / item.totalChapters) * 100;
      break;
    case 'Series':
      progressText = item.isOngoing ? `${item.episodesWatched || 0} ep` : `${item.episodesWatched || 0} / ${item.totalEpisodes || '?'} ep`;
      if (item.totalEpisodes) progressPercent = ((item.episodesWatched || 0) / item.totalEpisodes) * 100;
      break;
    case 'Movie':
      progressText = item.watched ? 'Watched' : 'Not Watched';
      progressPercent = item.watched ? 100 : 0;
      break;
    case 'Comic':
      progressText = item.isOngoing ? `${item.issuesRead || 0} iss` : `${item.issuesRead || 0} / ${item.totalIssues || '?'} iss`;
      if (item.totalIssues) progressPercent = ((item.issuesRead || 0) / item.totalIssues) * 100;
      break;
  }

  const coverFallback = "https://images.unsplash.com/photo-1618519764611-bd0823006228?auto=format&fit=crop&q=80&w=400";

  return (
    <div className="flex flex-col bg-[#0c0c0e] border border-white/5 rounded-[1.5rem] overflow-hidden group hover:border-white/10 transition-all shadow-md relative h-full">
       
       {/* Top Section: Full Bleed Cover */}
       <div 
         className="w-full aspect-[2/3] bg-zinc-900 relative shrink-0 cursor-pointer overflow-hidden border-b border-white/5"
         onClick={() => onViewDetails?.(item)}
       >
         <img 
            src={item.coverImageUrl || coverFallback} 
            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-700 group-hover:scale-105"
            style={{ filter: `grayscale(${grayscale}%)` }}
            referrerPolicy="no-referrer"
         />
         
         {cobwebOpacity > 0 && (
           <svg 
             className="absolute inset-0 w-full h-full pointer-events-none mix-blend-screen"
             style={{ opacity: cobwebOpacity }}
             viewBox="0 0 100 100" 
             preserveAspectRatio="none"
           >
             <g stroke="rgba(255, 255, 255, 0.4)" strokeWidth="0.5" fill="none">
               <path d="M0,0 L100,100 M100,0 L0,100 M50,0 L50,100 M0,50 L100,50" />
               <path d="M10,50 Q20,20 50,10 Q80,20 90,50 Q80,80 50,90 Q20,80 10,50" opacity="0.8"/>
               <path d="M25,50 Q30,30 50,25 Q70,30 75,50 Q70,70 50,75 Q30,70 25,50" opacity="0.6"/>
               <path d="M38,50 Q42,40 50,38 Q58,40 62,50 Q58,60 50,62 Q42,60 38,50" opacity="0.4"/>
               <path d="M0,0 Q10,20 0,30 M100,0 Q90,20 100,30 M0,100 Q10,80 0,70 M100,100 Q90,80 100,70" />
             </g>
           </svg>
         )}

         {showRedWarning && (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm z-30 pointer-events-none animation-pulse">
             <AlertTriangle className="w-12 h-12 text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)] mb-2" />
             <div className="flex flex-col items-center gap-1">
               <span className="text-red-500 font-black uppercase tracking-[0.2em] text-[10px] bg-red-500/20 px-3 py-1 rounded-full border border-red-500/30">Neglected</span>
               <span className="text-red-300 font-bold text-xs bg-red-900/40 px-2 py-0.5 rounded backdrop-blur-sm">Drop in {daysUntilDrop}d</span>
             </div>
           </div>
         )}

         {/* Gradients to ensure text readability */}
         <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none z-10" />
         
         {/* Floating Elements on Cover */}
         {/* Top Left: Status & Re-run */}
         <div className="absolute top-3 left-3 flex flex-col gap-2 z-20">
            <div className="flex items-center gap-1.5">
              <div className="bg-black/80 backdrop-blur-md rounded-full w-8 h-8 flex items-center justify-center border border-white/10 shadow-lg" title={item.status}>
                {getStatusIcon(item.status)}
              </div>
              {currentStreak > 0 && (
                <div className="bg-orange-500/10 backdrop-blur-md border border-orange-500/20 px-2 py-1 rounded-lg flex items-center gap-1 shadow-lg" title={`${currentStreak} Day Streak`}>
                  <Flame className="w-3.5 h-3.5 text-orange-400 fill-orange-500/20" />
                  <span className="text-orange-500 font-black text-xs">{currentStreak}</span>
                </div>
              )}
            </div>
            {item.isReRun && (
              <div className="bg-black/80 backdrop-blur-md rounded-full w-8 h-8 flex items-center justify-center border border-white/10 shadow-lg" title="Re-Run">
                 <RotateCcw className="w-4 h-4 text-orange-400" />
              </div>
            )}
         </div>

         {/* Top Right: Rating */}
         <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 z-20">
            {item.userRating != null && (
              <div className="bg-amber-500 text-black px-2 py-1 rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.5)] flex items-center gap-1 font-black text-xs font-mono tracking-tight leading-none">
                <Star className="w-3 h-3 fill-black text-black" />
                {item.userRating}
              </div>
            )}
            {item.reviewScore != null && (
              <div className="bg-black/80 backdrop-blur-md text-white border border-white/10 px-2 py-1 rounded-lg shadow-lg flex items-center gap-1 font-bold text-[10px] font-mono tracking-tight leading-none opacity-80">
                <Star className={cn("w-2.5 h-2.5", colors.text, "fill-current opacity-70")} />
                {item.reviewScore}
              </div>
            )}
         </div>

         {/* Bottom Overlay: Type */}
         <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end z-20">
            <div className={cn("bg-black/80 backdrop-blur-md border border-white/10 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-lg", colors.text)}>
              {getMediaTypeIcon(item.mediaType, "w-3.5 h-3.5")}
              <span className="text-[9px] font-black uppercase tracking-[0.2em] leading-none font-display">
                {item.mediaType}
              </span>
            </div>
            
            {item.noEnemies && (
              <div className="flex items-center justify-center bg-orange-500/20 text-orange-400 backdrop-blur-md w-7 h-7 rounded-full border border-orange-500/20 shadow-lg" title="Enemy Generation Disabled">
                <Ghost className="w-3.5 h-3.5 opacity-80" />
              </div>
            )}
         </div>
       </div>

       {/* Bottom Section: Info & Progress Bar */}
       <div className="p-3 sm:p-4 flex flex-col flex-1">
         <div className="flex justify-between items-start gap-2 mb-1">
           <h3 
             className="text-sm sm:text-base font-bold text-white line-clamp-2 min-h-[2.5rem] sm:min-h-[3rem] font-display tracking-tight cursor-pointer hover:text-orange-400 transition-colors flex-1"
             title={item.title}
             onClick={() => onViewDetails?.(item)}
           >
             {item.title}
           </h3>
           <span className="text-[9px] font-bold text-zinc-500 shrink-0 mt-1 uppercase tracking-widest">{item.season ? `S${item.season} ` : ''}{item.year}</span>
         </div>
         
         {/* Subtitle / Progress Text */}
         <div className="flex justify-between items-center mb-3">
            <span className="text-zinc-500 text-[10px] sm:text-xs italic line-clamp-1 flex-1 pr-2 font-serif">by {item.creator || 'Unknown'}</span>
            <span className="text-[10px] font-mono text-zinc-400 shrink-0 tracking-tight">{progressText}</span>
         </div>

         {/* Progress Bar */}
         <div className="mt-auto">
            {item.isOngoing ? (
               <div className="text-[10px] sm:text-xs font-black text-zinc-500/80 uppercase tracking-widest text-center w-full font-display">Ongoing</div>
            ) : (
               <div className="h-1.5 bg-black rounded-full overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] border border-white/5 relative">
                 {progressPercent > 0 ? (
                   <div 
                     className={cn("absolute top-0 left-0 h-full rounded-full transition-all duration-500", colors.progress, `shadow-[0_0_10px_var(--color-${colors.progress.split('-')[1]}-500)]`)} 
                     style={{ width: `${Math.min(progressPercent, 100)}%` }} 
                   />
                 ) : item.mediaType === 'Game' || item.mediaType === 'Visual Novel' ? (
                   <div className={cn("h-full w-full animate-pulse rounded-full opacity-30", colors.glow)} />
                 ) : null}
               </div>
            )}
         </div>

         {/* Bottom Action Bar */}
         <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
            {onLogProgress && (
              <button 
                onClick={(e) => { e.stopPropagation(); onLogProgress(item); }}
                className={cn(
                  "flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex justify-center items-center gap-1.5 shadow-inner border font-display", 
                  "bg-[#121214] border-white/10 text-white hover:bg-white/5 hover:border-white/20 active:scale-95"
                )}
              >
                <Plus className="w-3.5 h-3.5 text-zinc-400" /> Log
              </button>
            )}
            {onEdit && (
              <button 
                onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                className="w-10 h-10 bg-[#121214] border border-white/10 hover:bg-white/5 hover:border-white/20 text-zinc-400 hover:text-white rounded-xl transition-all flex justify-center items-center active:scale-95 shadow-inner"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
         </div>
       </div>
    </div>
  );
}
