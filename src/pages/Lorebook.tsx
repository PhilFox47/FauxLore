import React, { useState, useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { BookOpen, Search, MapPin, PencilLine, Activity } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { MEDIA_COLORS, ProgressLog } from '../types/schema';
import { groupLogsIntoSessions, LogSession } from '../lib/sessions';
import { cn } from '../lib/utils';

// A single strand of the chronicle: either a merged progress session or a lone status change.
type JournalEntry =
  | { kind: 'session'; ts: string; session: LogSession }
  | { kind: 'status'; ts: string; log: ProgressLog };

// Renders "Logged 4.5 hours of playtime" etc. from a (possibly summed) delta + metric.
function describeProgress(delta: number, metricType: string) {
  let actionWord = delta > 0 ? 'Advanced by' : delta < 0 ? 'Reverted by' : 'Logged';
  if (delta > 0) {
    if (metricType === 'episodesWatched' || metricType === 'watchCount') actionWord = 'Watched';
    else if (metricType === 'chaptersRead' || metricType === 'pagesRead' || metricType === 'issuesRead') actionWord = 'Read';
    else if (metricType === 'playtimeHours') actionWord = 'Logged';
  } else if (delta < 0) {
    if (metricType === 'episodesWatched' || metricType === 'watchCount') actionWord = 'Rewatched';
    else if (metricType === 'chaptersRead' || metricType === 'pagesRead' || metricType === 'issuesRead') actionWord = 'Reread';
    else if (metricType === 'playtimeHours') actionWord = 'Reverted';
  }

  const absDelta = Math.abs(delta);
  let unit = metricType;
  let displayDelta: number = absDelta;
  if (unit === 'playtimeHours') {
    actionWord = delta >= 0 ? 'Logged' : 'Reverted';
    displayDelta = Number(absDelta.toFixed(1));
    unit = displayDelta === 1 ? 'hour of playtime' : 'hours of playtime';
  } else if (unit === 'episodesWatched') {
    unit = absDelta === 1 ? 'episode' : 'episodes';
  } else if (unit === 'watchCount') {
    unit = absDelta === 1 ? 'time' : 'times';
  } else if (unit === 'chaptersRead') {
    unit = absDelta === 1 ? 'chapter' : 'chapters';
  } else if (unit === 'pagesRead') {
    unit = absDelta === 1 ? 'page' : 'pages';
  } else if (unit === 'issuesRead') {
    unit = absDelta === 1 ? 'issue' : 'issues';
  }

  return <span><span className="font-bold text-white">{actionWord}</span> {displayDelta} {unit}</span>;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Active': return 'text-amber-400 font-black';
    case 'Planning': return 'text-blue-400 font-black';
    case 'Completed': return 'text-emerald-400 font-black drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]';
    case 'Extras': return 'text-orange-400 font-black drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]';
    case 'Dropped': return 'text-red-400 font-black';
    default: return 'text-white font-black';
  }
};

export function Lorebook() {
  const { logs, media } = useMediaContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('All');

  const getMediaForItem = (mediaId: string) => media.find(m => m.id === mediaId);

  // Build the day-grouped journal: progress logs are merged into sessions, status changes stay
  // as their own entries, and everything is threaded back together in chronological order.
  const { groupedEntries, groupedKeys, hasEntries } = useMemo(() => {
    const filtered = logs.filter(log => {
      if (log.timestamp.startsWith('1970-01-01')) return false; // import placeholders
      const mediaItem = getMediaForItem(log.mediaId);
      if (!mediaItem) return false;
      if (filterType !== 'All' && mediaItem.mediaType !== filterType) return false;

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const hasNoteMatch = log.note?.toLowerCase().includes(query);
        const hasTitleMatch = mediaItem.title.toLowerCase().includes(query);
        const hasActionMatch = log.metricType.toLowerCase().includes(query);
        if (!hasNoteMatch && !hasTitleMatch && !hasActionMatch) return false;
      }
      return true;
    });

    const statusLogs = filtered.filter(l => l.metricType === 'statusChange');
    const sessions = groupLogsIntoSessions(filtered);

    const entries: JournalEntry[] = [
      ...sessions.map(s => ({ kind: 'session' as const, ts: s.endTimestamp, session: s })),
      ...statusLogs.map(l => ({ kind: 'status' as const, ts: l.timestamp, log: l })),
    ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    const grouped: Record<string, JournalEntry[]> = {};
    entries.forEach(e => {
      const dayKey = format(parseISO(e.ts), 'yyyy-MM-dd');
      (grouped[dayKey] ||= []).push(e);
    });
    const keys = Object.keys(grouped).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    return { groupedEntries: grouped, groupedKeys: keys, hasEntries: entries.length > 0 };
  }, [logs, media, filterType, searchQuery]);

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3 tracking-tight">
            <BookOpen className="w-8 h-8 text-orange-400" />
            The Lorebook
          </h2>
          <p className="text-zinc-400 mt-2">The complete, chronicled journey of your conquests.</p>
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500 shadow-inner"
          >
            <option value="All">All Types</option>
            <option value="Game">Games</option>
            <option value="Book">Books</option>
            <option value="Movie">Movies</option>
            <option value="Series">Series</option>
            <option value="Manga">Manga</option>
            <option value="Comic">Comics</option>
            <option value="Visual Novel">Visual Novels</option>
          </select>

          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search thoughts, quests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-white focus:outline-none focus:border-orange-500 w-full shadow-inner"
            />
          </div>
        </div>
      </header>

      {!hasEntries ? (
        <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-12 text-center text-zinc-500 mt-8 font-mono shadow-inner">
          No memory fragments found matching your search.
        </div>
      ) : (
        <div className="space-y-10 relative">
          <div className="absolute left-6 top-2 bottom-0 w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent z-0"></div>

          {groupedKeys.map((dayKey) => {
            const dayEntries = groupedEntries[dayKey];
            const dateObj = parseISO(dayKey);

            return (
              <div key={dayKey} className="relative z-10">
                <div className="flex items-center gap-4 mb-4 sticky top-4 z-20">
                  <div className="w-12 h-6 bg-black border border-white/10 rounded-full flex items-center justify-center shrink-0 shadow-md">
                    <div className="w-2 h-2 bg-zinc-600 rounded-full"></div>
                  </div>
                  <h3 className="text-zinc-300 font-bold font-display uppercase tracking-widest text-xs bg-black/60 px-3 py-1 rounded-lg backdrop-blur-md shadow-sm border border-white/5">
                    {format(dateObj, 'MMMM d, yyyy')}
                  </h3>
                </div>

                <div className="space-y-4 ml-12">
                  {dayEntries.map((entry) => {
                    const mediaId = entry.kind === 'session' ? entry.session.mediaId : entry.log.mediaId;
                    const mediaItem = getMediaForItem(mediaId);
                    if (!mediaItem) return null;
                    const colors = MEDIA_COLORS[mediaItem.mediaType];

                    const isHistoric = entry.kind === 'session' ? entry.session.isHistoric : entry.log.isHistoric;
                    const location = entry.kind === 'session' ? entry.session.location : entry.log.location;

                    // Action node + time label differ between a session and a lone status change.
                    let actionNode: React.ReactNode;
                    let timeLabel: string;
                    let logCount = 1;
                    let notes: string[] = [];

                    if (entry.kind === 'status') {
                      const noteStr = entry.log.note || 'Updated Status';
                      const match = noteStr.match(/Status changed from (.*?) to (.*)/);
                      actionNode = match
                        ? <span>Status changed from <span className={getStatusColor(match[1])}>{match[1]}</span> to <span className={getStatusColor(match[2])}>{match[2]}</span></span>
                        : <span>{noteStr}</span>;
                      timeLabel = format(parseISO(entry.log.timestamp), 'HH:mm');
                    } else {
                      const s = entry.session;
                      logCount = s.logs.length;
                      notes = s.notes;
                      actionNode = describeProgress(s.totalDelta, s.metricType);
                      timeLabel = logCount > 1
                        ? `${format(parseISO(s.startTimestamp), 'HH:mm')}–${format(parseISO(s.endTimestamp), 'HH:mm')}`
                        : format(parseISO(s.endTimestamp), 'HH:mm');
                    }

                    return (
                      <div key={entry.kind === 'session' ? entry.session.id : entry.log.id} className="bg-zinc-900/50 border border-white/5 p-4 rounded-2xl flex flex-col sm:flex-row gap-4 hover:border-white/10 transition-colors shadow-sm hover:shadow-md relative group overflow-hidden">
                        {isHistoric && (
                          <div className="absolute top-0 right-0 bg-amber-500/10 text-amber-500/60 text-[8px] font-black uppercase px-2 py-1 tracking-widest border-b border-l border-amber-500/10 rounded-bl-lg font-mono">
                            Historical Record
                          </div>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:translate-x-full duration-1000 ease-in-out pointer-events-none"></div>

                        <div className="shrink-0 flex items-start sm:items-center gap-3 w-full sm:w-48 border-b sm:border-b-0 sm:border-r border-white/5 pb-3 sm:pb-0 sm:pr-4">
                          {mediaItem.coverImageUrl ? (
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 shadow-inner border border-white/10 bg-black">
                              <img src={mediaItem.coverImageUrl} className="w-full h-full object-cover opacity-80" />
                            </div>
                          ) : (
                            <div className={cn("w-10 h-10 rounded-lg shrink-0 border border-white/10 shadow-inner flex items-center justify-center bg-black/50")}>
                              <BookOpen className={cn("w-4 h-4", colors.text)} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-[9px] font-black uppercase text-zinc-500 tracking-widest font-display truncate">
                              {mediaItem.mediaType}
                            </div>
                            <div className="text-sm font-bold text-white truncate max-w-full">
                              {mediaItem.title}
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 flex flex-col justify-center min-w-0 py-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-zinc-300 font-medium text-sm flex items-center gap-1.5">
                              <Activity className={cn("w-3.5 h-3.5", colors.text)} />
                              {actionNode}
                            </span>

                            <span className="text-zinc-600 text-xs font-mono">
                              • {timeLabel}
                            </span>

                            {logCount > 1 && (
                              <span className="text-[10px] text-zinc-400 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded tracking-wider uppercase font-mono">
                                {logCount} logs
                              </span>
                            )}

                            {location && (
                              <span className="flex items-center gap-1 text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded ml-auto tracking-widest uppercase font-mono shadow-inner">
                                <MapPin className="w-3 h-3" />
                                {location}
                              </span>
                            )}
                          </div>

                          {notes.length > 0 && (
                            <div className="bg-black/40 border border-white/5 rounded-xl p-3 shadow-inner relative flex gap-3 text-sm italic text-zinc-400 font-serif leading-relaxed">
                              <PencilLine className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
                              <div className="space-y-1 min-w-0">
                                {notes.map((note, i) => (
                                  <p key={i}>"{note}"</p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
