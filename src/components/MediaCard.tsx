import React from 'react';
import { MediaItem, getMetricForType, MEDIA_COLORS } from '../types/schema';
import { Play, PlayCircle, Plus, Edit2, Popcorn, BookOpen, Star, StarHalf, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';

interface MediaCardProps {
  key?: string | number;
  item: MediaItem;
  onEdit?: (item: MediaItem) => void;
  onLogProgress?: (item: MediaItem) => void;
  onViewDetails?: (item: MediaItem) => void;
}

export function MediaCard({ item, onEdit, onLogProgress, onViewDetails }: MediaCardProps) {
  const metricType = getMetricForType(item.mediaType);
  const colors = MEDIA_COLORS[item.mediaType];
  
  const renderStars = (rating: number, isUser: boolean) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0; // Accommodate .5 ratings
    
    // Fill active stars
    for (let i = 0; i < fullStars; i++) {
        stars.push(<Star key={`full-${i}`} className={cn("w-2 h-2 md:w-[10px] md:h-[10px]", isUser ? "fill-black/80 text-black" : "fill-white/90 text-white")} />);
    }
    
    // Add half star if applicable
    if (hasHalfStar) {
        // We use lucide's StarHalf and simulate solid fill with text/fill color props correctly
        stars.push(<StarHalf key="half" className={cn("w-2 h-2 md:w-[10px] md:h-[10px]", isUser ? "fill-black/80 text-black" : "fill-white/90 text-white")} />);
    }
    
    // Add remaining empty slots
    const emptyStarsCount = 5 - stars.length;
    for (let i = 0; i < emptyStarsCount; i++) {
        stars.push(<Star key={`empty-${i}`} className={cn("w-2 h-2 md:w-[10px] md:h-[10px]", isUser ? "text-black/20" : "text-white/20")} />);
    }
    
    return <div className="flex gap-[1px]">{stars}</div>;
  };
  
  // Build a display string for progress
  let progressText = '';
  let progressPercent = 0;
  
  switch(item.mediaType) {
    case 'Game':
      if (item.isOngoing) {
        progressText = `Ongoing (${item.playtimeHours || 0} hrs)`;
        progressPercent = 0;
      } else {
        progressText = `${item.playtimeHours || 0} hrs`;
        if (item.averagePlaytime && item.averagePlaytime > 0) {
          progressText += ` / ${item.averagePlaytime} hrs`;
          progressPercent = ((item.playtimeHours || 0) / item.averagePlaytime) * 100;
        } else {
          progressPercent = 0; // Usually no total for games unless we add it
        }
      }
      break;
    case 'Visual Novel':
      progressText = `${item.playtimeHours || 0} hrs`;
      if (item.averagePlaytime && item.averagePlaytime > 0) {
        progressText += ` / ${item.averagePlaytime} hrs`;
        progressPercent = ((item.playtimeHours || 0) / item.averagePlaytime) * 100;
      } else {
        progressPercent = 0; // Usually no total for games unless we add it
      }
      break;
    case 'Book':
      progressText = `${item.pagesRead || 0} / ${item.totalPages || '?'} pgs`;
      if (item.totalPages) progressPercent = ((item.pagesRead || 0) / item.totalPages) * 100;
      break;
    case 'Manga':
      progressText = `${item.chaptersRead || 0} / ${item.totalChapters || (item.isOngoing ? 'Ongoing' : '?')} ch`;
      if (item.totalChapters) progressPercent = ((item.chaptersRead || 0) / item.totalChapters) * 100;
      break;
    case 'Series':
      progressText = `${item.episodesWatched || 0} / ${item.totalEpisodes || '?'} ep`;
      if (item.totalEpisodes) progressPercent = ((item.episodesWatched || 0) / item.totalEpisodes) * 100;
      break;
    case 'Movie':
      progressText = item.watched ? 'Watched' : 'Not Watched';
      progressPercent = item.watched ? 100 : 0;
      break;
    case 'Comic':
      progressText = `${item.issuesRead || 0} / ${item.totalIssues || '?'} iss`;
      if (item.totalIssues) progressPercent = ((item.issuesRead || 0) / item.totalIssues) * 100;
      break;
  }

  const coverFallback = "https://images.unsplash.com/photo-1618519764611-bd0823006228?auto=format&fit=crop&q=80&w=400"; // Generic glowing neon background for tech/media vibe

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl md:rounded-3xl p-4 md:p-6 flex flex-col group transition-all hover:bg-white/[0.02] shadow-sm relative overflow-hidden">
      <span className={cn("text-[8px] md:text-[10px] font-bold uppercase tracking-wider mb-1 line-clamp-1 mt-1", colors.text)}>
        {item.status} • {item.mediaType} {item.season ? `• S${item.season}` : ''} {item.year ? `• ${item.year}` : ''}
      </span>
      <h3 
        className="text-base md:text-xl font-bold mb-1 line-clamp-2 min-h-[2.5rem] md:min-h-[3.5rem] pr-2 cursor-pointer hover:text-orange-400 transition-colors" 
        title={item.title}
        onClick={() => onViewDetails?.(item)}
      >
        {item.title}
      </h3>
      <p className="text-zinc-500 text-[10px] md:text-xs mb-3 md:mb-4 italic line-clamp-1">{item.creator || 'Unknown Creator'}</p>
      
      <div 
        className="aspect-[2/3] bg-zinc-800 rounded-lg md:rounded-xl relative w-full overflow-hidden shadow-xl shrink-0 mb-3 md:mb-4 cursor-pointer"
        onClick={() => onViewDetails?.(item)}
      >
        {item.isReRun && (
          <div className="absolute top-2 left-2 z-20 bg-black/60 backdrop-blur-md rounded-full p-1 border border-white/10" title="Re-Run">
             <RotateCcw className="w-3 h-3 text-orange-400" />
          </div>
        )}
        <div className="absolute top-0 right-0 z-20 flex flex-col items-end opacity-90 hover:opacity-100 transition-opacity">
          {item.userRating != null && (
            <div className="bg-amber-500/80 backdrop-blur-sm text-black px-1.5 md:px-2 py-0.5 md:py-1 text-xs rounded-bl-lg md:rounded-bl-xl shadow-lg flex flex-col items-end gap-0.5 min-w-[2rem] md:min-w-[2.5rem]">
              <span className="text-[5px] md:text-[6px] uppercase tracking-widest font-black opacity-60 leading-none mr-0.5">Your Rating</span>
              {renderStars(item.userRating, true)}
            </div>
          )}
          {item.reviewScore != null && (
            <div className={cn("px-1.5 md:px-2 py-0.5 md:py-1 flex flex-col items-end gap-0.5 min-w-[2rem] md:min-w-[2.5rem] shadow-lg", item.userRating != null ? "bg-black/60 backdrop-blur-md border-l border-b border-white/10 text-zinc-300 rounded-bl-lg md:rounded-bl-xl" : cn("rounded-bl-lg md:rounded-bl-xl text-white/90 backdrop-blur-sm", colors.bg))}>
              <span className="text-[5px] md:text-[6px] uppercase tracking-widest font-black opacity-60 leading-none mr-0.5">{item.userRating != null ? "Critic" : "Critic Rating"}</span>
              <div className={cn(item.userRating != null ? "opacity-60 saturate-50" : "")}>
                {renderStars(item.reviewScore, false)}
              </div>
            </div>
          )}
        </div>
        <img 
          src={item.coverImageUrl || coverFallback} 
          alt={item.title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
      </div>

      <div className="mt-auto">
        <div className="flex justify-between text-[10px] md:text-xs mb-2 font-mono">
          <span className="text-zinc-300">{progressText}</span>
          {progressPercent > 0 && <span className={colors.text}>{progressPercent.toFixed(0)}%</span>}
        </div>
        {!(item.mediaType === 'Game' && item.isOngoing) && (
          <div className="h-1 md:h-1.5 bg-zinc-800 rounded-full mb-3 md:mb-4">
            {progressPercent > 0 ? (
              <div 
                className={cn("h-full rounded-full transition-all duration-500", colors.progress, colors.shadow)} 
                style={{ width: `${Math.min(progressPercent, 100)}%` }} 
              />
            ) : item.mediaType === 'Game' || item.mediaType === 'Visual Novel' ? (
              <div className={cn("h-full w-full animate-pulse rounded-full", colors.glow)} />
            ) : null}
          </div>
        )}
        
        <div className="flex gap-1.5 md:gap-2">
          {onLogProgress && (
            <button 
              onClick={(e) => { e.stopPropagation(); onLogProgress(item); }}
              className="flex-1 bg-white/5 hover:bg-white/10 text-white py-1.5 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-medium transition-colors flex justify-center items-center gap-1"
            >
              <Plus className="w-2.5 h-2.5 md:w-3 md:h-3" /> Log
            </button>
          )}
          {onEdit && (
            <button 
              onClick={(e) => { e.stopPropagation(); onEdit(item); }}
              className="px-2 md:px-3 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs font-medium transition-colors flex justify-center items-center"
            >
              <Edit2 className="w-2.5 h-2.5 md:w-3 md:h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
