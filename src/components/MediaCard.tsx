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
  AlertTriangle,
  Target,
  Anchor,
  GitBranch
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
  const { logs, settings } = useMediaContext();
  
  const mediaLogs = useMemo(() => logs.filter(l => l.mediaId === item.id), [logs, item.id]);
  const currentStreak = useMemo(() => calculateStreak(mediaLogs), [mediaLogs]);

  const daysSinceActive = useMemo(() => {
    if (item.status !== 'Active') return 0;
    const lastActiveMs = mediaLogs.length 
      ? Math.max(...mediaLogs.map(l => new Date(l.timestamp).getTime()), new Date(item.updatedAt || item.createdAt).getTime()) 
      : new Date(item.updatedAt || item.createdAt).getTime();
    return Math.floor((Date.now() - lastActiveMs) / (1000 * 60 * 60 * 24));
  }, [item.status, mediaLogs, item.updatedAt, item.createdAt]);

  let grayscale = 0;
  let cobwebOpacity = 0;
  let showRedWarning = false;
  let daysUntilDrop = 0;

  // Inactivity aging visuals are skipped when auto-dropping is off, whether that
  // was set for this entry or turned off library-wide in Preferences. The decay
  // is the warning that a drop is coming, so it makes no sense without one.
  if (!item.noAutoDrop && !settings?.disableAutoDrop) {
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

  // Status is shown as a labelled dot rather than an icon over the art.
  const STATUS_STYLE: Record<string, { dot: string; text: string }> = {
    'Active':     { dot: 'bg-amber-400',   text: 'text-amber-300' },
    'On Hold':    { dot: 'bg-blue-400',    text: 'text-blue-300' },
    'Completed':  { dot: 'bg-emerald-400', text: 'text-emerald-300' },
    'Extras':     { dot: 'bg-orange-400',  text: 'text-orange-300' },
    'Planning':   { dot: 'bg-violet-400',  text: 'text-violet-300' },
    'Dropped':    { dot: 'bg-red-500',     text: 'text-red-300' },
    'Unreleased': { dot: 'bg-zinc-500',    text: 'text-zinc-400' },
  };
  const statusStyle = STATUS_STYLE[item.status] || STATUS_STYLE['Unreleased'];

  // Everything that used to float over the cover now lives here, so the art is
  // never obscured. Each badge renders only when it applies, which keeps cards
  // short for plain entries and detailed for interesting ones.
  const badges: { key: string; node: React.ReactNode; title: string }[] = [];
  if (item.userRating != null) badges.push({
    key: 'rating', title: `Your rating: ${item.userRating}/5`,
    node: <><Star className="w-3 h-3 fill-amber-400 text-amber-400" /><span className="text-amber-300">{item.userRating}</span></>,
  });
  if (item.reviewScore != null) badges.push({
    key: 'critic', title: `Community score: ${item.reviewScore}/5`,
    node: <><Star className="w-3 h-3 text-zinc-500" /><span className="text-zinc-400">{item.reviewScore}</span></>,
  });
  if (currentStreak > 0) badges.push({
    key: 'streak', title: `${currentStreak} day streak`,
    node: <><Flame className="w-3 h-3 text-orange-400" /><span className="text-orange-300">{currentStreak}</span></>,
  });
  if (item.updateAvailable) badges.push({
    key: 'update', title: `New version available${item.sourceVersion ? `: ${item.sourceVersion}` : ''}`,
    node: <><Sparkles className="w-3 h-3 text-emerald-400" /><span className="text-emerald-300">Update</span></>,
  });
  if (item.isReRun) badges.push({
    key: 'rerun', title: item.route ? `Re-run - ${item.route}` : 'Re-run',
    node: <><RotateCcw className="w-3 h-3 text-orange-400" /><span className="text-orange-300">{item.route || 'Re-run'}</span></>,
  });
  if (item.route && !item.isReRun) badges.push({
    key: 'route', title: `Route: ${item.route}`,
    node: <><GitBranch className="w-3 h-3 text-zinc-400" /><span className="text-zinc-300">{item.route}</span></>,
  });
  if (item.noEnemies) badges.push({ key: 'noEnemies', title: 'Enemy generation disabled', node: <Ghost className="w-3 h-3 text-zinc-400" /> });
  if (item.isHighPriority) badges.push({ key: 'priority', title: 'High priority target', node: <Target className="w-3 h-3 text-rose-400" /> });
  if (item.noAutoDrop) badges.push({ key: 'noDrop', title: 'Never auto-drops', node: <Anchor className="w-3 h-3 text-sky-400" /> });

  return (
    <div className="flex flex-col bg-[#0c0c0e] border border-white/5 rounded-2xl overflow-hidden group hover:border-white/15 transition-colors relative h-full">

      {/* Cover: art only. Nothing is layered on top of it except the decay
          treatment (desaturation and cobwebs), which is deliberate storytelling
          rather than UI chrome. */}
      <div
        className="w-full aspect-[2/3] bg-zinc-900 relative shrink-0 cursor-pointer overflow-hidden"
        onClick={() => onViewDetails?.(item)}
        title={item.title}
      >
        <img
          src={item.coverImageUrl || coverFallback}
          alt=""
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          style={{ filter: `grayscale(${grayscale}%)` }}
          referrerPolicy="no-referrer"
        />

        {cobwebOpacity > 0 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none mix-blend-screen"
               style={{ opacity: cobwebOpacity * 0.7 }} viewBox="0 0 100 100" preserveAspectRatio="none">
            <g stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" fill="none">
              <path d="M0,0 L100,100 M100,0 L0,100 M50,0 L50,100 M0,50 L100,50" />
              <path d="M10,50 Q20,20 50,10 Q80,20 90,50 Q80,80 50,90 Q20,80 10,50" opacity="0.8"/>
              <path d="M25,50 Q30,30 50,25 Q70,30 75,50 Q70,70 50,75 Q30,70 25,50" opacity="0.6"/>
              <path d="M0,0 Q10,20 0,30 M100,0 Q90,20 100,30 M0,100 Q10,80 0,70 M100,100 Q90,80 100,70" />
            </g>
          </svg>
        )}
      </div>

      {/* Neglect warning: a strip under the art rather than a panel across it, so
          it stays impossible to miss without hiding the cover. */}
      {showRedWarning && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 border-y border-red-500/25 text-red-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Neglected</span>
          <span className="text-[10px] text-red-400/80 ml-auto">Drops in {daysUntilDrop}d</span>
        </div>
      )}

      <div className="p-3 flex flex-col flex-1 gap-2">

        {/* Meta line: status, type, and when */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusStyle.dot)} />
          <span className={cn('font-bold uppercase tracking-wider shrink-0', statusStyle.text)}>{item.status}</span>
          <span className={cn('flex items-center gap-1 shrink-0', colors.text)} title={item.mediaType}>
            {getMediaTypeIcon(item.mediaType, 'w-3 h-3')}
          </span>
          <span className="ml-auto text-zinc-500 font-mono shrink-0">
            {item.season ? `S${item.season} ` : ''}{item.year || ''}
          </span>
        </div>

        {/* Title + creator */}
        <div>
          <h3
            className="text-sm font-bold text-white line-clamp-2 leading-snug cursor-pointer hover:text-orange-400 transition-colors"
            title={item.title}
            onClick={() => onViewDetails?.(item)}
          >
            {item.title}
          </h3>
          <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">{item.creator || 'Unknown'}</p>
        </div>

        {/* Progress */}
        <div className="mt-auto pt-1">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[10px] font-mono text-zinc-400 truncate">{progressText}</span>
            {item.isOngoing && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600 shrink-0">Ongoing</span>
            )}
          </div>
          <div className="h-1 bg-white/[0.07] rounded-full overflow-hidden">
            {progressPercent > 0 && (
              <div
                className={cn('h-full rounded-full transition-all duration-500', colors.progress)}
                style={{ width: `${Math.min(progressPercent, 100)}%` }}
              />
            )}
          </div>
        </div>

        {/* Badges: only what applies to this item */}
        {badges.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {badges.map(b => (
              <span
                key={b.key}
                title={b.title}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.06] text-[10px] font-bold leading-none max-w-full"
              >
                <span className="inline-flex items-center gap-1 truncate">{b.node}</span>
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        {(onLogProgress || onEdit) && (
          <div className="flex items-center gap-2 pt-2 mt-1 border-t border-white/5">
            {onLogProgress && (
              <button
                onClick={(e) => { e.stopPropagation(); onLogProgress(item); }}
                className="flex-1 py-2.5 sm:py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex justify-center items-center gap-1.5 bg-white/[0.06] text-zinc-200 hover:bg-white/10"
              >
                <Plus className="w-3.5 h-3.5" /> Log
              </button>
            )}
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                className="w-8 h-8 shrink-0 bg-white/[0.06] hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg transition-colors flex justify-center items-center"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
