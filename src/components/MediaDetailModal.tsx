import React, { useState, useMemo } from 'react';
import { MediaItem, ProgressLog } from '../types/schema';
import { useMediaContext } from '../contexts/MediaContext';
import { useToast } from '../contexts/ToastContext';
import { X, Edit2, ExternalLink, GitBranch, Clock, Calendar, BookOpen, Star, StarHalf, Hash, Gamepad2, Tv, Film, Save, Trash2, Gem, Loader2, RotateCcw, MapPin, Crown, Shirt, Footprints, Sword, Shield, Flame, Ghost, Target, Anchor, Library, BrainCircuit } from 'lucide-react';
import { calculateScaledDelta } from '../lib/scaling';
import { buildStatusTimeline, getItemPace, STATUS_HEX } from '../lib/history';
import { getSourceUrl, getSourceLabel } from '../lib/sourceLinks';
import { groupLogsIntoSessions } from '../lib/sessions';
import { TIME_BANDS, bandIndexForHour } from '../lib/timeBands';
import { cn } from '../lib/utils';
import { buildGroupIndex, groupsFor } from '../lib/locationGroups';
import { logSpan, formatDuration, spreadOverClock } from '../lib/logDuration';
import { format, differenceInDays } from 'date-fns';
import { generateAiArtifact } from '../services/aiService';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../services/db';
import { Artifact, RARITY_COLORS } from '../types/schema';
import { LootReveal } from './LootReveal';
import { MediaCodexPanel } from './MediaCodexPanel';
import { ForgingButton } from './ForgingButton';
import { AreaChart, Area, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, YAxis } from 'recharts';

interface MediaDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MediaItem | null;
  logs: ProgressLog[];
  onEdit: (item: MediaItem) => void;
}

export function MediaDetailModal({ isOpen, onClose, item, logs, onEdit }: MediaDetailModalProps) {
  const { settings, media, logs: allLogs, worldBosses, updateLog, deleteLog, artifacts, saveArtifact, saveMediaItem, generateArtifactImage, acknowledgeUpdate, locationGroups } = useMediaContext();
  const locationGroupIndex = useMemo(() => buildGroupIndex(locationGroups), [locationGroups]);
  const toast = useToast();
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [deleteConfirmLogId, setDeleteConfirmLogId] = useState<string | null>(null);
  const [isLooting, setIsLooting] = useState(false);
  const [pendingLootId, setPendingLootId] = useState<string | null>(null);
  const [lootedArtifact, setLootedArtifact] = useState<Artifact | null>(null);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [chartMode, setChartMode] = useState<'cumulative' | 'daily'>('cumulative');
  const [journalOnly, setJournalOnly] = useState(false);
  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [routeDraft, setRouteDraft] = useState('');
  const [editLogData, setEditLogData] = useState<{
    delta: number;
    note: string;
    location: string;
    logDate: string;
    logTime: string;
  }>({ delta: 0, note: '', location: '', logDate: '', logTime: '' });

  const { currentMediaStreak, maxMediaStreak, activeDays, startDate, chartData, dailyData } = React.useMemo(() => {
    const historicalLogs = logs.filter(l => !l.timestamp.startsWith('1970-01-01'));
    if (historicalLogs.length === 0 || !item) return { currentMediaStreak: 0, maxMediaStreak: 0, activeDays: 0, startDate: null, chartData: [], dailyData: [] };

    const uniqueDates = Array.from(new Set(historicalLogs.map(l => format(new Date(l.timestamp), 'yyyy-MM-dd')))).sort();
    const startDate = uniqueDates[0];
    
    let max = 1;
    let curr = 1;

    for (let i = 1; i < uniqueDates.length; i++) {
        const d1 = new Date(uniqueDates[i - 1]);
        const d2 = new Date(uniqueDates[i]);
        if (differenceInDays(d2, d1) === 1) {
            curr++;
            if (curr > max) max = curr;
        } else {
            curr = 1;
        }
    }

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const lastDate = new Date(uniqueDates[uniqueDates.length - 1]);
    const daysSinceLast = differenceInDays(new Date(todayStr), lastDate);
    const currentStreak = daysSinceLast <= 1 ? curr : 0;

    let cumulative = 0;
    
    // Sort logs by exact time
    const sortedLogs = [...historicalLogs]
      .filter(l => l.metricType !== 'statusChange')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const chartData = sortedLogs.map((l) => {
       const pages = calculateScaledDelta(l.delta, item, settings);
       cumulative += pages;
       const d = new Date(l.timestamp);
       return { 
         timestamp: d.getTime(),
         name: format(d, 'MMM d, HH:mm'), 
         pages: Math.floor(cumulative) 
       };
    });

    // Per-day totals: the same logs bucketed by calendar day, not accumulated.
    const perDay = new Map<string, number>();
    sortedLogs.forEach((l) => {
      const key = format(new Date(l.timestamp), 'yyyy-MM-dd');
      perDay.set(key, (perDay.get(key) || 0) + calculateScaledDelta(l.delta, item, settings));
    });
    const dailyData = Array.from(perDay.entries())
      .map(([day, pages]) => ({ timestamp: new Date(day + 'T00:00:00').getTime(), pages: Math.floor(pages) }))
      .sort((a, b) => a.timestamp - b.timestamp);

    return { currentMediaStreak: currentStreak, maxMediaStreak: max, activeDays: uniqueDates.length, startDate, chartData, dailyData };
  }, [logs, item, settings]);

  // Deeper Lore-Page analytics: status journey, pace/projection, sessions, where/when, rank.
  const lore = React.useMemo(() => {
    if (!item) return null;
    const progress = logs.filter(l => l.metricType !== 'statusChange' && !l.timestamp.startsWith('1970-01-01'));

    const timeline = buildStatusTimeline(item, logs);
    const pace = getItemPace(item, logs, settings);

    // Sessions on this item
    const sessions = groupLogsIntoSessions(progress);
    const sessionMP = sessions.map(s => s.logs.reduce((sum, l) => sum + calculateScaledDelta(l.delta, item, settings), 0));
    const longestSession = sessionMP.length ? Math.max(...sessionMP) : 0;
    const avgSession = sessionMP.length ? sessionMP.reduce((a, b) => a + b, 0) / sessionMP.length : 0;

    // Where & when. Places are grouped into kinds of place where the user has
    // said which belong together, so this reads "mostly at the cinema" rather
    // than listing three venue names that mean nothing on their own.
    const located = progress.filter(l => l.location && l.location.trim());
    const groupIndex = buildGroupIndex(locationGroups || []);
    const homeGroup = (locationGroups || []).find((g: any) => /^home$/i.test((g.name || '').trim()));
    const homeIndex = homeGroup ? buildGroupIndex([homeGroup]) : null;
    const isHome = (loc: string) =>
      homeIndex ? groupsFor(loc, homeIndex).length > 0
                : /home|bedroom|living room|mancave|garden|pc room/i.test(loc);
    const placeCounts: Record<string, number> = {};
    const kindCounts = new Map<string, { name: string; color?: string | null; n: number }>();
    let homeN = 0;
    let groupedN = 0;
    located.forEach(l => {
      const loc = l.location!.trim();
      placeCounts[loc] = (placeCounts[loc] || 0) + 1;
      if (isHome(loc)) homeN++;
      const matched = groupsFor(loc, groupIndex);
      if (matched.length > 0) groupedN++;
      matched.forEach(g => {
        const entry = kindCounts.get(g.id) || { name: g.name, color: g.color, n: 0 };
        entry.n += 1;
        kindCounts.set(g.id, entry);
      });
    });
    const topPlaces = Object.entries(placeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topKinds = [...kindCounts.entries()]
      .map(([id, v]) => ({ id, ...v, share: located.length > 0 ? v.n / located.length : 0 }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 4);
    const homeFromGroup = !!homeGroup;
    // Time of day, on the shared 05:00-boundary bands: every hour belongs to
    // exactly one, and a 02:00 session is the night before rather than a
    // vaguely-named "early hours".
    const bandCounts = TIME_BANDS.map(() => 0);
    // Spread over the hours each log actually covered, so a long sitting reads
    // as the stretch it was rather than as the minute it was written down.
    progress.forEach(l => {
      for (const slice of spreadOverClock(l, item, settings, 1)) {
        bandCounts[bandIndexForHour(slice.hour)] += slice.value;
      }
    });
    const bandTotal = bandCounts.reduce((a, b) => a + b, 0);
    const peakIndex = bandCounts.indexOf(Math.max(...bandCounts));
    const peakBand = {
      band: TIME_BANDS[peakIndex],
      n: bandCounts[peakIndex],
      share: bandTotal > 0 ? bandCounts[peakIndex] / bandTotal : 0,
    };
    const bandBreakdown = TIME_BANDS.map((b, i) => ({
      band: b,
      n: bandCounts[i],
      share: bandTotal > 0 ? bandCounts[i] / bandTotal : 0,
    }));

    // Library rank (by master pages, among same media type)
    const typePeers = (media || []).filter(m => m.mediaType === item.mediaType);
    const mpByItem = new Map<string, number>();
    allLogs.forEach(l => {
      if (l.metricType === 'statusChange' || l.timestamp.startsWith('1970-01-01')) return;
      const m = (media || []).find(x => x.id === l.mediaId);
      if (!m || m.mediaType !== item.mediaType) return;
      mpByItem.set(l.mediaId, (mpByItem.get(l.mediaId) || 0) + calculateScaledDelta(l.delta, m, settings));
    });
    const myMP = mpByItem.get(item.id) || 0;
    const peersWithMP = typePeers.map(m => mpByItem.get(m.id) || 0).sort((a, b) => b - a);
    const rankPos = peersWithMP.filter(v => v > myMP).length + 1;
    const rankTotal = typePeers.length;
    const percentile = rankTotal > 1 ? Math.round((1 - (rankPos - 1) / rankTotal) * 100) : 100;

    return { timeline, pace, sessionCount: sessions.length, longestSession, avgSession, located: located.length, homeN, topPlaces, topKinds, groupedN, homeFromGroup, peakBand, bandBreakdown, rankPos, rankTotal, percentile, myMP };
  }, [item, logs, allLogs, media, settings, locationGroups]);

  // Every playthrough of this title: the original plus its re-runs. Each carries at
  // most one route, so the family is the record of which routes have been played.
  const runFamily = React.useMemo(() => {
    if (!item) return [];
    const rootId = item.originalMediaId || item.id;
    return (media || [])
      .filter((m) => m.id === rootId || m.originalMediaId === rootId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [item, media]);

  // Shown for the types where routes make sense, even before one is recorded:
  // this is the only place a route can be committed to, including on a first run.
  // It stays a single quiet row until used, so it never forces route tracking.
  const showRoutes = !!item && (item.mediaType === 'Visual Novel' || item.mediaType === 'Game');

  const saveRoute = async () => {
    if (!item) return;
    try {
      await saveMediaItem({ ...item, route: routeDraft.trim() || undefined } as any);
      setIsEditingRoute(false);
      toast.success(routeDraft.trim() ? `Route set to "${routeDraft.trim()}".` : 'Route cleared.');
    } catch (e: any) {
      toast.error(e.message || 'Could not save the route.');
    }
  };

  const sourceUrl = item ? getSourceUrl(item) : null;

  if (!isOpen || !item) return null;

  const uniqueLocations = Array.from(new Set(logs.map(l => l.location).filter(Boolean))) as string[];
  const filteredLocations = uniqueLocations.filter(loc => loc.toLowerCase().includes(editLogData.location.toLowerCase()) && loc !== editLogData.location);

  const totalMasterPages = logs
    .filter(l => !l.isHistoric && l.metricType !== 'statusChange')
    .reduce((acc, log) => acc + calculateScaledDelta(log.delta, item, settings), 0);
  
  // Sort logs descending by timestamp
  const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const itemArtifacts = artifacts?.filter(a => a.mediaId === item.id && a.id !== pendingLootId && a.id !== lootedArtifact?.id) || [];

  // Lore-page data: enemies spawned from this media, franchise siblings, journal notes.
  const bossesForItem = (worldBosses || []).filter(b => b.mediaId === item.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const franchiseSiblings = (item.franchises && item.franchises.length)
    ? (media || []).filter(m => m.id !== item.id && m.franchises?.some(f => item.franchises!.includes(f))).slice(0, 12)
    : [];
  // Logs carrying a written note. The journal used to be its own section above,
  // which just repeated what the log list already showed; it is now a filter on
  // that one list.
  const hasJournalEntry = (l: ProgressLog) =>
    !!l.note && l.note.trim().length > 0 && l.metricType !== 'statusChange' && !l.timestamp.startsWith('1970-01-01');
  const journalEntries = logs
    .filter(hasJournalEntry)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const visibleLogs = journalOnly ? sortedLogs.filter(hasJournalEntry) : sortedLogs;

  const handleClaimLoot = async () => {
    setIsLooting(true);
    try {
      const generated = await generateAiArtifact(item);
      
      let allowedArtifactsCount = 0;
      if (item.status === 'Completed' || item.status === 'Extras') {
         allowedArtifactsCount += 1;
      }
      const isPlaytimeMedia = ['Game', 'Audiobook', 'Visual Novel'].includes(item.mediaType);
      if (isPlaytimeMedia && item.isOngoing) {
         const nonHistoricalPlaytime = logs
            .filter(l => l.mediaId === item.id && !l.isHistoric && !l.timestamp.startsWith('1970-01-01') && l.metricType === 'playtimeHours')
            .reduce((sum, log) => sum + log.delta, 0);
         allowedArtifactsCount += Math.floor(nonHistoricalPlaytime / 50);
      }
      
      let totalEstimatedHours = 0;
      switch (item.mediaType) {
        case 'Game':
        case 'Visual Novel':
        case 'Audiobook':
          totalEstimatedHours = item.playtimeHours || 0;
          break;
        case 'Movie':
          totalEstimatedHours = 2; // Generally ~2 hours
          break;
        case 'Series':
          totalEstimatedHours = (item.episodesWatched || 0) * 0.4; // ~24m per ep
          break;
        case 'Manga':
          totalEstimatedHours = (item.chaptersRead || 0) / 6; // ~10m per chap
          break;
        case 'Comic':
          totalEstimatedHours = (item.issuesRead || 0) * 0.25; // ~15m per issue
          break;
        case 'Book':
          totalEstimatedHours = (item.pagesRead || 0) / 40; // ~40 pages per hour
          break;
        default:
          totalEstimatedHours = 10;
          break;
      }
      
      let durabilityMultiplier = 1.0;
      switch (item.mediaType) {
        case 'Game': durabilityMultiplier = 0.5; break;
        case 'Visual Novel': durabilityMultiplier = 0.7; break;
        case 'Audiobook': durabilityMultiplier = 1.0; break;
        case 'Series': durabilityMultiplier = 1.3; break;
        case 'Movie': durabilityMultiplier = 2.0; break;
        case 'Manga': durabilityMultiplier = 2.0; break;
        case 'Comic': durabilityMultiplier = 2.0; break;
        case 'Book': durabilityMultiplier = 4.0; break;
        default: durabilityMultiplier = 1.0; break;
      }

      let calculatedDurability = 100;
      if (isPlaytimeMedia && item.isOngoing) {
          if (item.status === 'Completed' || item.status === 'Extras') {
              const isFinalLoot = (itemArtifacts.length === allowedArtifactsCount - 1);
              if (isFinalLoot) {
                 calculatedDurability = Math.max(1, Math.round((totalEstimatedHours - (itemArtifacts.length * 50)) * durabilityMultiplier));
              } else {
                 calculatedDurability = Math.max(1, Math.round(50 * durabilityMultiplier));
              }
          } else {
              calculatedDurability = Math.max(1, Math.round(50 * durabilityMultiplier));
          }
      } else {
          calculatedDurability = Math.max(1, Math.round(totalEstimatedHours * durabilityMultiplier));
      }

      const newArtifact: Artifact = {
        id: uuidv4(),
        mediaId: item.id,
        name: generated.name,
        description: generated.description,
        type: generated.type || 'Trinket',
        slot: generated.slot as any || 'Accessory',
        rarity: generated.rarity as Artifact['rarity'],
        targetType: generated.targetType,
        targetValue: generated.targetValue,
        bonusPercent: generated.bonusPercent,
        imagePrompt: generated.imagePrompt || undefined,
        earnedAt: new Date().toISOString(),
        durability: calculatedDurability,
        maxDurability: calculatedDurability,
        isEquipped: false
      };
      
      setPendingLootId(newArtifact.id);
      await saveArtifact(newArtifact);
      
      try {
        await generateArtifactImage(newArtifact.id);
        const loadedArtifacts = await DatabaseService.getArtifacts();
        const updatedArtifact = loadedArtifacts.find(a => a.id === newArtifact.id) || newArtifact;
        setLootedArtifact(updatedArtifact);
      } catch (e) {
        console.error("Failed to generate and load image for artifact", e);
        setLootedArtifact(newArtifact);
      }
    } catch(e: any) {
      console.error("Failed to loot: " + e.message);
      toast.error("Failed to loot: " + e.message);
    } finally {
      setIsLooting(false);
      setPendingLootId(null);
    }
  };

  const handleReRun = async () => {
    // Deliberately does not ask for a route: at the start of a run you usually
    // don't know which one you'll end up on. Past routes are shown as a reminder
    // of what's already been covered, and the route gets set later from the
    // Routes Played list once it's actually clear.
    const played = runFamily.map(r => (r.route || '').trim()).filter(Boolean);
    if (played.length) {
      const ok = window.confirm(
        `Start another run of ${item.title}?\n\nRoutes played so far: ${played.join(', ')}\n\n` +
          `You can set this run's route later, once you know it.`,
      );
      if (!ok) return;
    }

    const newId = uuidv4();
    const newCopy: MediaItem = {
      ...item,
      id: newId,
      status: 'Active',
      isReRun: true,
      originalMediaId: item.originalMediaId || item.id,
      route: undefined, // decided later, from the Routes Played list
      playtimeHours: 0,
      pagesRead: 0,
      chaptersRead: 0,
      episodesWatched: 0,
      watched: false,
      issuesRead: 0
    };
    await saveMediaItem(newCopy);
    onClose();
  };

  const handleEditClick = (log: ProgressLog) => {
    const d = new Date(log.timestamp);
    setEditLogData({
      delta: log.delta,
      note: log.note || '',
      location: log.location || '',
      logDate: format(d, 'yyyy-MM-dd'),
      logTime: format(d, 'HH:mm'),
    });
    setEditingLogId(log.id);
  };

  const handleSaveLogUpdate = async (logId: string) => {
    if (typeof editLogData.delta !== 'number') return;
    
    const selectedDate = new Date(editLogData.logDate);
    if (editLogData.logTime) {
      const [hours, minutes] = editLogData.logTime.split(':').map(Number);
      selectedDate.setHours(hours, minutes, 0, 0);
    }
    const finalTimestamp = selectedDate.toISOString();

    await updateLog(logId, {
      delta: editLogData.delta,
      note: editLogData.note,
      location: editLogData.location,
      timestamp: finalTimestamp
    });

    setEditingLogId(null);
  };

  const handleDeleteLog = async (logId: string) => {
    await deleteLog(logId);
    setEditingLogId(null);
    setDeleteConfirmLogId(null);
  };

  const renderSlotIcon = (slot: string, className: string) => {
    switch(slot) {
      case 'Head': return <Crown className={className} />;
      case 'Body': return <Shirt className={className} />;
      case 'Legs': return <Footprints className={className} />;
      case 'Primary': return <Sword className={className} />;
      case 'Secondary': return <Shield className={className} />;
      default: return <Gem className={className} />;
    }
  };

  return (
    <>
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-6xl min-h-[70vh] max-h-[92vh] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
        
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white/70 hover:text-white transition">
          <X className="w-5 h-5" />
        </button>

        {/* Left/Background Panel: Cover Art & Basic Info */}
        <div className="relative w-full md:w-2/5 p-5 sm:p-8 flex flex-col justify-end min-h-[300px]">
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
            {item.subtitle && <h3 className="text-lg text-zinc-300 mb-2 italic">{item.subtitle}</h3>}
            <p className="text-zinc-400 font-medium mb-4">{item.creator || item.publisher}</p>
            
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-6">
              <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.mediaType}</span>
              {item.publisher && item.creator && <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.publisher}</span>}
              {item.language && <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.language.toUpperCase()}</span>}
              {item.maturityRating && item.maturityRating !== 'NOT_MATURE' && <span className="px-3 py-1 bg-red-500/20 text-red-100 border border-red-500/30 rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.maturityRating}</span>}
              <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.status}</span>
              {item.year && <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.year}</span>}
              {item.noEnemies && <span className="px-3 py-1 bg-orange-500/20 text-orange-200 border border-orange-500/30 rounded-md text-xs font-medium backdrop-blur-sm shadow-sm flex items-center gap-1"><Ghost className="w-3 h-3"/> No Enemies</span>}
              {item.isHighPriority && <span className="px-3 py-1 bg-rose-500/20 text-rose-200 border border-rose-500/30 rounded-md text-xs font-medium backdrop-blur-sm shadow-sm flex items-center gap-1"><Target className="w-3 h-3"/> High Priority</span>}
              {item.noAutoDrop && <span className="px-3 py-1 bg-sky-500/20 text-sky-200 border border-sky-500/30 rounded-md text-xs font-medium backdrop-blur-sm shadow-sm flex items-center gap-1"><Anchor className="w-3 h-3"/> No Auto-Drop</span>}
            </div>

            <div className="flex flex-col gap-3 w-full">
               <button
                 onClick={() => { onClose(); onEdit(item); }}
                 className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium flex justify-center items-center gap-2 transition"
               >
                 <Edit2 className="w-4 h-4" />
                 Edit Media Details
               </button>

               {/* Version tracking: what you have vs what's live upstream */}
               {(item.sourceVersion || item.installedVersion) && (
                 <div className={cn(
                   "w-full rounded-xl border p-3 space-y-2",
                   item.updateAvailable ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]"
                 )}>
                   <div className="flex items-center justify-between gap-3 text-xs">
                     <span className="text-zinc-400">Installed</span>
                     <span className="font-bold text-white truncate">{item.installedVersion || '—'}</span>
                   </div>
                   {item.sourceVersion && (
                     <div className="flex items-center justify-between gap-3 text-xs">
                       <span className="text-zinc-400">Latest</span>
                       <span className={cn("font-bold truncate", item.updateAvailable ? "text-emerald-400" : "text-white")}>
                         {item.sourceVersion}
                       </span>
                     </div>
                   )}
                   {item.updateAvailable && (
                     <button
                       onClick={async () => {
                         try {
                           await acknowledgeUpdate(item.id);
                           toast.success(`Marked ${item.sourceVersion || 'latest'} as installed.`);
                         } catch (e: any) {
                           toast.error(e.message || 'Failed to update.');
                         }
                       }}
                       className="w-full mt-1 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 rounded-lg text-xs font-bold transition"
                     >
                       Mark {item.sourceVersion || 'latest'} as installed
                     </button>
                   )}
                 </div>
               )}

               {/* Link back to wherever this item's metadata came from */}
               {sourceUrl && (
                 <a
                   href={sourceUrl}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="w-full py-3 border border-white/10 hover:bg-white/5 text-white rounded-xl font-medium flex justify-center items-center gap-2 transition"
                   title={`Open on ${getSourceLabel(item.metadataSource)}`}
                 >
                   <ExternalLink className="w-4 h-4" />
                   Open on {getSourceLabel(item.metadataSource)}
                 </a>
               )}

               <button 
                 onClick={handleReRun}
                 className="w-full py-3 border border-white/10 hover:bg-white/5 text-white rounded-xl font-medium flex justify-center items-center gap-2 transition"
               >
                 <RotateCcw className="w-4 h-4" />
                 Start Re-Run
               </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Content */}
        <div className="w-full md:w-3/5 bg-[#121214] p-5 sm:p-8 overflow-y-auto">
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
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
              <div className="text-2xl font-black text-white flex items-center h-8">
                {item.userRating ? (
                  <>
                     {Array(Math.floor(item.userRating)).fill(0).map((_, i) => <Star key={`full-${i}`} className="w-4 h-4 fill-white text-white" />)}
                     {item.userRating % 1 !== 0 && <StarHalf className="w-4 h-4 fill-white text-white" />}
                  </>
                ) : '-'}
              </div>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded-2xl border border-white/5">
              <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Hash className="w-3 h-3" /> Master Pgs
              </div>
              <div className="text-2xl font-black text-white">{Math.floor(totalMasterPages)}</div>
            </div>
            <div className="bg-orange-500/10 p-4 rounded-2xl border border-orange-500/20">
              <div className="text-orange-500/80 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Flame className="w-3 h-3 text-orange-500" /> Max Streak
              </div>
              <div className="text-2xl font-black text-orange-500 flex items-center gap-2">
                {maxMediaStreak} <span className="text-xs text-orange-500/60 tracking-wider">DAYS</span>
              </div>
            </div>
          </div>

          {(activeDays > 0 || startDate) && (
             <div className="mb-8 grid grid-cols-2 gap-4">
                <div className="bg-zinc-800/30 p-3 rounded-xl border border-white/5 flex items-center justify-between">
                   <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">First Log</div>
                   <div className="text-sm font-bold text-white">{startDate ? format(new Date(startDate), 'MMM d, yyyy') : '-'}</div>
                </div>
                <div className="bg-zinc-800/30 p-3 rounded-xl border border-white/5 flex items-center justify-between">
                   <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Days Active</div>
                   <div className="text-sm font-bold text-white">{activeDays} Days</div>
                </div>
             </div>
          )}

          {/* Status journey timeline */}
          {lore && lore.timeline.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-bold text-zinc-500 mb-3 tracking-wider uppercase flex items-center gap-2">
                <Clock className="w-4 h-4" /> Status history
              </h3>
              <div className="flex w-full h-2.5 rounded-full overflow-hidden border border-white/10">
                {lore.timeline.map((s, i) => {
                  const total = lore!.timeline.reduce((a, b) => a + Math.max(b.days, 0.25), 0);
                  const w = (Math.max(s.days, 0.25) / total) * 100;
                  return <div key={i} title={`${s.status}: ${Math.round(s.days)}d`} style={{ width: `${w}%`, backgroundColor: STATUS_HEX[s.status] || '#71717a' }} />;
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                {lore.timeline.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_HEX[s.status] || '#71717a' }} />
                    <span className="text-white font-medium">{s.status}</span>
                    <span className="text-zinc-500">{Math.round(s.days)}d{s.end ? '' : ' · now'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Routes played across every run of this title */}
          {showRoutes && (
            <div className="mb-8">
              <h3 className="text-sm font-bold text-zinc-500 mb-3 tracking-wider uppercase flex items-center gap-2">
                <GitBranch className="w-4 h-4" /> Routes Played
              </h3>
              <div className="flex flex-col gap-2">
                {runFamily.map((run, i) => {
                  const isCurrent = run.id === item.id;
                  const done = run.status === 'Completed' || run.status === 'Extras';
                  return (
                    <div
                      key={run.id}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-2.5',
                        isCurrent ? 'bg-white/[0.06] border-white/15' : 'bg-black/30 border-white/5',
                      )}
                    >
                      <span className="text-[10px] font-black text-zinc-600 w-5 shrink-0 text-center">{i + 1}</span>
                      {isCurrent && isEditingRoute ? (
                        <>
                          <input
                            autoFocus
                            list="lore-route-options"
                            value={routeDraft}
                            onChange={(e) => setRouteDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); saveRoute(); }
                              if (e.key === 'Escape') setIsEditingRoute(false);
                            }}
                            placeholder="Which route was this?"
                            className="flex-1 min-w-0 bg-black/40 border border-white/20 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-orange-500"
                          />
                          <datalist id="lore-route-options">
                            {Array.from(new Set(
                              (media || [])
                                .filter(m => m.mediaType === item.mediaType && (m.route || '').trim())
                                .map(m => (m.route as string).trim()),
                            )).map(r => <option key={r} value={r} />)}
                          </datalist>
                          <button onClick={saveRoute} className="text-[10px] uppercase tracking-widest font-black text-emerald-300 bg-emerald-500/20 px-2 py-1 rounded shrink-0 hover:bg-emerald-500/30 transition-colors">
                            Save
                          </button>
                          <button onClick={() => setIsEditingRoute(false)} className="text-[10px] uppercase tracking-widest font-black text-zinc-400 px-1 shrink-0 hover:text-white transition-colors">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={cn('flex-1 min-w-0 truncate text-sm', run.route ? 'text-white font-medium' : 'text-zinc-500 italic')}>
                            {run.route?.trim() || (isCurrent ? 'Route not set yet' : 'No route recorded')}
                          </span>
                          {isCurrent && (
                            <>
                              <button
                                onClick={() => { setRouteDraft(item.route || ''); setIsEditingRoute(true); }}
                                className="text-[10px] uppercase tracking-widest font-black text-orange-300 bg-orange-500/15 px-2 py-0.5 rounded shrink-0 hover:bg-orange-500/25 transition-colors"
                              >
                                {run.route?.trim() ? 'Change' : 'Set route'}
                              </button>
                              <span className="text-[10px] uppercase tracking-widest font-black text-zinc-400 bg-white/10 px-2 py-0.5 rounded shrink-0">
                                This run
                              </span>
                            </>
                          )}
                        </>
                      )}
                      <span className={cn(
                        'text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded shrink-0',
                        done ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10',
                      )}>
                        {run.status}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-zinc-600 mt-2">
                One route per playthrough, set whenever you know it. Use Re-run to start another.
              </p>
            </div>
          )}

          {/* Pace & projection */}
          {lore && lore.pace.activeDays > 0 && (
            <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-800/30 p-3 rounded-xl border border-white/5">
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Pages / active day</div>
                <div className="text-lg font-black text-white">{Math.round(lore.pace.mpPerActiveDay)}</div>
              </div>
              {lore.pace.perActiveDay != null && lore.pace.unit && (
                <div className="bg-zinc-800/30 p-3 rounded-xl border border-white/5">
                  <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">{lore.pace.unit} / day</div>
                  <div className="text-lg font-black text-white">{lore.pace.perActiveDay.toFixed(1)}</div>
                </div>
              )}
              {lore.pace.pctComplete != null && (
                <div className="bg-zinc-800/30 p-3 rounded-xl border border-white/5">
                  <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Complete</div>
                  <div className="text-lg font-black text-white">{Math.round(lore.pace.pctComplete * 100)}%</div>
                </div>
              )}
              {!lore.pace.finished && lore.pace.projectedDaysLeft != null ? (
                <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                  <div className="text-[10px] text-emerald-500/80 font-bold uppercase tracking-wider mb-1">Projected finish</div>
                  <div className="text-lg font-black text-emerald-400">~{lore.pace.projectedDaysLeft}d</div>
                </div>
              ) : lore.pace.finished ? (
                <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                  <div className="text-[10px] text-emerald-500/80 font-bold uppercase tracking-wider mb-1">Cleared in</div>
                  <div className="text-lg font-black text-emerald-400">{lore.pace.activeDays}d active</div>
                </div>
              ) : null}
            </div>
          )}

          {/* Sessions + Rank */}
          {lore && lore.sessionCount > 0 && (
            <div className="mb-8 grid grid-cols-3 gap-3">
              <div className="bg-zinc-800/30 p-3 rounded-xl border border-white/5">
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Sessions</div>
                <div className="text-lg font-black text-white">{lore.sessionCount}</div>
              </div>
              <div className="bg-zinc-800/30 p-3 rounded-xl border border-white/5">
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Longest sitting</div>
                <div className="text-lg font-black text-white">{Math.round(lore.longestSession)} <span className="text-xs text-zinc-500">pg</span></div>
              </div>
              <div className="bg-zinc-800/30 p-3 rounded-xl border border-white/5">
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Avg session</div>
                <div className="text-lg font-black text-white">{Math.round(lore.avgSession)} <span className="text-xs text-zinc-500">pg</span></div>
              </div>
            </div>
          )}

          {/* Where & when you lived in it */}
          {lore && (lore.located > 0 || lore.pace.activeDays > 0) && (
            <div className="mb-8 p-4 bg-zinc-800/30 rounded-2xl border border-white/5 space-y-3">
              <h3 className="text-sm font-bold text-zinc-500 tracking-wider uppercase flex items-center gap-2"><MapPin className="w-4 h-4" /> Where &amp; When</h3>
              {lore.pace.activeDays > 0 && lore.peakBand.n > 0 && (
                <>
                  <p className="text-sm text-zinc-300">
                    You mostly experienced this in the{' '}
                    <span className="text-white font-semibold">{lore.peakBand.band.label.toLowerCase()}</span>{' '}
                    <span className="text-zinc-500 font-mono tabular-nums">({lore.peakBand.band.range})</span>
                    {lore.peakBand.share > 0 && <span className="text-zinc-500"> — {Math.round(lore.peakBand.share * 100)}% of the time you spent on it</span>}.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {lore.bandBreakdown.map(({ band, n, share }) => (
                      <div
                        key={band.key}
                        className={cn(
                          "rounded-xl border px-2.5 py-2",
                          band.key === lore.peakBand.band.key ? "border-amber-500/30 bg-amber-500/[0.07]" : "border-white/5 bg-black/20",
                        )}
                      >
                        <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{band.label}</div>
                        <div className="text-[9px] text-zinc-600 font-mono tabular-nums mb-1">{band.range}</div>
                        <div className="text-sm font-black text-white">
                          {Math.round(share * 100)}<span className="text-[10px] text-zinc-500 font-bold">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {lore.located > 0 && (
                <>
                  <p className="text-sm text-zinc-400">
                    <span className="text-white font-semibold">{Math.round((lore.homeN / lore.located) * 100)}%</span> at home,{' '}
                    <span className="text-white font-semibold">{Math.round(((lore.located - lore.homeN) / lore.located) * 100)}%</span> away
                    {lore.homeFromGroup ? '' : ' (guessed from the names — group them in the Atlas to be sure)'}.
                  </p>
                  {lore.topKinds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {lore.topKinds.map(k => (
                        <span
                          key={k.id}
                          className="text-xs px-2.5 py-1 rounded-lg border font-bold"
                          style={{ color: k.color || '#a1a1aa', borderColor: `${k.color || '#71717a'}44`, backgroundColor: `${k.color || '#71717a'}14` }}
                        >
                          {k.name} <span className="opacity-60 font-mono">· {Math.round(k.share * 100)}%</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {lore.topPlaces.map(([place, n]) => (
                      <span key={place} className="text-xs px-2 py-1 bg-black/30 border border-white/5 rounded-lg text-zinc-300">{place} <span className="text-zinc-500">· {n}</span></span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Library rank */}
          {lore && lore.myMP > 0 && lore.rankTotal > 1 && (
            <div className="mb-8 p-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl flex items-center gap-3">
              <Crown className="w-5 h-5 text-orange-500 shrink-0" />
              <p className="text-sm text-zinc-300">
                Among your {lore.rankTotal} {item.mediaType.toLowerCase()}s, this ranks{' '}
                <span className="text-white font-bold">#{lore.rankPos}</span> by Master Pages
                {(() => { const top = Math.max(1, Math.round((lore.rankPos / lore.rankTotal) * 100)); return top <= 50 ? <> — top <span className="text-orange-400 font-bold">{top}%</span></> : null; })()}.
              </p>
            </div>
          )}

          {chartData.length > 1 && (
            <div className="mb-8 p-6 bg-zinc-800/30 rounded-2xl border border-white/5">
              <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
                <h3 className="text-sm font-bold text-zinc-500 tracking-wider uppercase flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Progression (Master Pages)
                </h3>
                <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg p-0.5">
                  {([
                    { key: 'cumulative', label: 'Total' },
                    { key: 'daily', label: 'Per day' },
                  ] as const).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setChartMode(m.key)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors',
                        chartMode === m.key ? 'bg-purple-500/20 text-purple-200' : 'text-zinc-500 hover:text-zinc-300',
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {chartMode === 'daily' ? (
                  <BarChart data={dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="timestamp"
                      type="number"
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(tick) => format(new Date(tick), 'MMM d')}
                      stroke="#52525b" fontSize={10} tickLine={false} axisLine={false}
                    />
                    <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      labelFormatter={(label) => typeof label === 'number' ? format(new Date(label), 'MMM d, yyyy') : label}
                      formatter={(v: any) => [`${Number(v).toLocaleString()} MP`, 'That day']}
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                      labelStyle={{ color: '#a1a1aa', fontSize: '10px', marginBottom: '4px' }}
                    />
                    <Bar dataKey="pages" fill="#a855f7" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  </BarChart>
                  ) : (
                  <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorPages" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="timestamp" 
                      type="number" 
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(tick) => format(new Date(tick), 'MMM d')}
                      stroke="#52525b" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      labelFormatter={(label) => typeof label === 'number' ? format(new Date(label), 'MMM d, yyyy HH:mm') : label}
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                      labelStyle={{ color: '#a1a1aa', fontSize: '10px', marginBottom: '4px' }}
                    />
                    <Area type="stepAfter" dataKey="pages" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#colorPages)" />
                  </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {item.description && (
            <div className="mb-8">
              <h3 className="text-lg font-bold text-white mb-3 tracking-wide">Description</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{item.description}</p>
            </div>
          )}

          {item.userReview && (
            <div className="mb-8 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl relative overflow-hidden text-amber-50/90">
              <Star className="w-16 h-16 text-amber-500/10 absolute -top-4 -right-2 pointer-events-none" />
              <h3 className="text-sm font-bold text-amber-500 mb-2 tracking-wide uppercase">Your Review</h3>
              <p className="text-sm leading-relaxed relative z-10 italic">"{item.userReview}"</p>
            </div>
          )}

          {/* Auto-tagging runs server-side after a new entry is saved, so say so
              rather than showing an empty taxonomy and letting the user wonder. */}
          {item.autoTagStatus === 'pending' && (!item.genres || item.genres.length === 0) && (
            <div className="mb-8 flex items-center gap-3 rounded-2xl border border-purple-500/20 bg-purple-500/[0.07] p-4">
              <Loader2 className="w-4 h-4 text-purple-300 animate-spin shrink-0" />
              <p className="text-sm text-zinc-300">
                Tagging this entry and compiling its Codex — the genres and tags will appear here shortly.
              </p>
            </div>
          )}
          {item.autoTagStatus === 'failed' && (!item.genres || item.genres.length === 0) && (
            <div className="mb-8 flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4">
              <BrainCircuit className="w-4 h-4 text-amber-300 shrink-0" />
              <p className="text-sm text-zinc-300">
                Auto-tagging didn't get through. Open <span className="font-bold text-white">Edit Media Details</span> and hit Auto-Tag to try again.
              </p>
            </div>
          )}

          {item.genres && item.genres.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-bold text-zinc-500 mb-3 tracking-wider uppercase">Taxonomy</h3>
              <div className="flex flex-wrap gap-2">
                {item.platforms && item.platforms.map((p, i) => <span key={`p-${i}`} className="text-xs px-2 py-1 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20">{p}</span>)}
                {item.franchises && item.franchises.map((f, i) => <span key={`f-${i}`} className="text-xs px-2 py-1 bg-pink-500/10 text-pink-400 rounded border border-pink-500/20">{f}</span>)}
                {item.genres.map((g, i) => <span key={`g-${i}`} className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">{g}</span>)}
                {item.tags?.map((t, i) => <span key={`t-${i}`} className="text-xs px-2 py-1 bg-orange-500/10 text-orange-400 rounded border border-orange-500/20">{t}</span>)}
              </div>
            </div>
          )}

          {/* What the app has researched about this title — and generates from */}
          <MediaCodexPanel mediaId={item.id} title={item.title} mediaType={item.mediaType} year={item.year} />

          {/* Enemies faced (World Bosses spawned from this media) */}
          {bossesForItem.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-bold text-zinc-500 mb-3 tracking-wider uppercase flex items-center gap-2"><Sword className="w-4 h-4" /> Enemies Faced</h3>
              <div className="flex flex-col gap-2">
                {bossesForItem.map(b => (
                  <div key={b.id} className="flex items-center gap-3 bg-black/30 border border-white/5 rounded-xl p-2.5">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border overflow-hidden",
                      b.status === 'Defeated' ? 'border-emerald-500/30 bg-emerald-500/10' : b.status === 'Failed' ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10')}>
                      {b.imageUrl ? <img src={b.imageUrl} alt={b.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Ghost className="w-5 h-5 text-zinc-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white truncate">{b.name}</div>
                      {b.title && <div className="text-[11px] text-amber-500/80 italic truncate">{b.title}</div>}
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Lv {b.level} Boss</div>
                    </div>
                    <span className={cn("text-[10px] uppercase tracking-widest font-black px-2 py-1 rounded-full shrink-0",
                      b.status === 'Defeated' ? 'text-emerald-400 bg-emerald-500/10' : b.status === 'Failed' ? 'text-red-400 bg-red-500/10' : 'text-amber-400 bg-amber-500/10')}>{b.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* From the same universe (franchise siblings) */}
          {franchiseSiblings.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-bold text-zinc-500 mb-3 tracking-wider uppercase flex items-center gap-2"><Library className="w-4 h-4" /> From the Same Universe</h3>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {franchiseSiblings.map(m => (
                  <div key={m.id} className="shrink-0 w-20">
                    <div className="w-20 h-28 rounded-lg overflow-hidden border border-white/10 bg-zinc-800 mb-1.5">
                      {m.coverImageUrl ? <img src={m.coverImageUrl} alt={m.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600"><Library className="w-6 h-6" /></div>}
                    </div>
                    <div className="text-[10px] font-bold text-zinc-300 truncate text-center" title={m.title}>{m.title}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const isOngoingPlaytimeMedia = (item.mediaType === 'Game' || item.mediaType === 'Visual Novel' || item.mediaType === 'Audiobook') && item.isOngoing;
            let allowedArtifactsCount = 0;
            let nonHistoricalPlaytime = 0;
            
            if (item.status === 'Completed' || item.status === 'Extras') {
              allowedArtifactsCount += 1;
            }
            
            if (isOngoingPlaytimeMedia) {
              nonHistoricalPlaytime = logs
                .filter(l => l.mediaId === item.id && !l.isHistoric && !l.timestamp.startsWith('1970-01-01') && l.metricType === 'playtimeHours')
                .reduce((sum, log) => sum + log.delta, 0);
              
              allowedArtifactsCount += Math.floor(nonHistoricalPlaytime / 50);
            }
            
            if (!isOngoingPlaytimeMedia && allowedArtifactsCount === 0 && itemArtifacts.length === 0) return null;

            const canLoot = itemArtifacts.length < allowedArtifactsCount;
            const nextLootAt = allowedArtifactsCount * 50 + 50;
            const progressToNext = isOngoingPlaytimeMedia ? (nonHistoricalPlaytime % 50) : 0;

            return (
              <div className="mb-8">
                <h3 className="text-lg font-bold text-white mb-3 tracking-wide flex items-center gap-2">
                   <Gem className="w-5 h-5 text-purple-400" />
                   {isOngoingPlaytimeMedia ? 'Loot earned so far' : 'Loot earned'}
                </h3>
                {isOngoingPlaytimeMedia && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                      <span>Tracked Playtime: {nonHistoricalPlaytime.toFixed(1)} hrs</span>
                      <span>Next loot at {nextLootAt} hrs</span>
                    </div>
                    <div className="h-1.5 w-full bg-black/80 rounded-full overflow-hidden border border-white/5 relative">
                       <div 
                         className="h-full bg-purple-500 rounded-full transition-all duration-700 shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                         style={{ width: `${Math.min(100, Math.max(2, (progressToNext / 50) * 100))}%` }} 
                       />
                    </div>
                  </div>
                )}
                {itemArtifacts.length > 0 && (
                  <div className="flex flex-col gap-3 mb-4">
                    {itemArtifacts.map(artifact => {
                       const style = RARITY_COLORS[artifact.rarity] || RARITY_COLORS['Common'];
                       return (
                       <div key={artifact.id} className={cn("bg-purple-900/10 border rounded-2xl p-5 flex items-start gap-4 shadow-lg shadow-purple-900/5 hover:border-purple-500/50 transition-colors", style.border.replace('500', '500/30'))}>
                          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border", style.bg, style.border.replace('500', '500/40'))}>
                             {renderSlotIcon(artifact.slot || 'Accessory', cn("w-6 h-6", style.text))}
                          </div>
                          <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-2 mb-1">
                                <h4 className={cn("font-black text-lg truncate", style.text, style.textShadow)}>{artifact.name}</h4>
                                <span className={cn(
                                   "text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded border whitespace-nowrap",
                                   style.bg, style.text, style.border.replace('500', '500/30')
                                )}>{artifact.rarity} {artifact.type}</span>
                             </div>
                             <p className="text-zinc-400 text-sm leading-relaxed mb-2">{artifact.description}</p>
                             {artifact.targetType && (
                               <div className="flex items-center justify-between bg-black/40 border border-white/5 rounded p-1.5 px-3">
                                 <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{artifact.targetType}: <span className={style.text}>{artifact.targetValue}</span></span>
                                 <span className="text-[10px] text-green-400 font-black tracking-widest">+{artifact.bonusPercent || 20}% EXP</span>
                               </div>
                             )}
                          </div>
                       </div>
                    );})}
                  </div>
                )}
                {canLoot && (
                  <ForgingButton isLooting={isLooting} onClick={handleClaimLoot} />
                )}
              </div>
            );
          })()}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold text-white tracking-wide">Journal Entries &amp; Progress</h3>
              {journalEntries.length > 0 && (
                <button
                  onClick={() => setJournalOnly(v => !v)}
                  title={journalOnly ? 'Show every log again' : 'Hide logs that have no journal entry'}
                  className={cn(
                    "flex items-center gap-2 border rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all",
                    journalOnly
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                      : "bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:border-white/20"
                  )}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Only show journal entries
                  <span className={cn("font-mono", journalOnly ? "text-amber-200/70" : "text-zinc-600")}>{journalEntries.length}</span>
                </button>
              )}
            </div>
            {visibleLogs.length === 0 ? (
              <p className="text-zinc-500 italic text-sm">
                {journalOnly ? 'No logs with a journal entry yet.' : 'No progress logged yet.'}
              </p>
            ) : (
              <div className="space-y-4">
                {visibleLogs.map(log => (
                  <div key={log.id} className="p-4 bg-zinc-800/30 rounded-xl border border-white/5 relative group">
                    {/* Timestamp indicator line */}
                    <div className="absolute top-0 bottom-0 left-4 w-px bg-zinc-700/50" />
                    
                    {editingLogId === log.id ? (
                      <div className="relative z-10 pl-6 space-y-4">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Delta (+{log.metricType})</label>
                            <input 
                              type="number"
                              value={editLogData.delta}
                              onChange={(e) => setEditLogData({ ...editLogData, delta: e.target.value === '' ? 0 : Number(e.target.value) })}
                              className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500 font-bold"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Date</label>
                            <input 
                              type="date"
                              value={editLogData.logDate}
                              onChange={(e) => setEditLogData({ ...editLogData, logDate: e.target.value })}
                              className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500 cursor-pointer"
                            />
                          </div>
                          <div className="w-24 shrink-0">
                            <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Time</label>
                            <input 
                              type="time"
                              value={editLogData.logTime}
                              onChange={(e) => setEditLogData({ ...editLogData, logTime: e.target.value })}
                              className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500 cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 w-full mt-2">
                          <div className="flex-1">
                            <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Note</label>
                            <textarea 
                              value={editLogData.note}
                              onChange={(e) => setEditLogData({ ...editLogData, note: e.target.value })}
                              className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500 resize-none min-h-[60px]"
                            />
                          </div>
                          <div className="flex-1 relative">
                            <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider pl-1">Location</label>
                            <input 
                              type="text"
                              value={editLogData.location}
                              onChange={(e) => { setEditLogData({ ...editLogData, location: e.target.value }); setShowLocationDropdown(true); }}
                              onFocus={() => setShowLocationDropdown(true)}
                               onBlur={() => setTimeout(() => setShowLocationDropdown(false), 200)}
                              placeholder="e.g. Home, Train, Area..."
                              className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                            />
                            {showLocationDropdown && filteredLocations.length > 0 && (
                               <div className="absolute top-[100%] z-20 w-full mt-1 bg-[#18181b] border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-32 overflow-y-auto">
                                  {filteredLocations.map((loc, idx) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setEditLogData({ ...editLogData, location: loc });
                                        setShowLocationDropdown(false);
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5 last:border-0 flex items-center gap-2"
                                    >
                                      <span className="truncate">{loc}</span>
                                      <span className="ml-auto flex items-center gap-1 shrink-0">
                                        {groupsFor(loc, locationGroupIndex).slice(0, 2).map(g => (
                                          <span key={g.id} className="w-2 h-2 rounded-full" title={g.name} style={{ backgroundColor: g.color || '#71717a' }} />
                                        ))}
                                      </span>
                                    </button>
                                  ))}
                               </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end mt-4">
                          {deleteConfirmLogId === log.id ? (
                            <div className="mr-auto flex items-center gap-2 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20">
                              <span className="text-xs text-red-400 font-medium whitespace-nowrap">Delete entry?</span>
                              <button 
                                onClick={() => handleDeleteLog(log.id)}
                                className="px-2 py-1 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded transition-colors"
                              >
                                Yes
                              </button>
                              <button 
                                onClick={() => setDeleteConfirmLogId(null)}
                                className="px-2 py-1 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 rounded transition-colors"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setDeleteConfirmLogId(log.id)}
                              className="mr-auto px-3 py-1.5 text-xs font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </button>
                          )}
                          <button 
                            onClick={() => {
                              setEditingLogId(null);
                              setDeleteConfirmLogId(null);
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={() => handleSaveLogUpdate(log.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-600 hover:bg-orange-500 rounded-lg transition-colors shadow-lg shadow-orange-900/20"
                          >
                            <Save className="w-3 h-3" />
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 mb-2 relative z-10 pl-4">
                          <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] -ml-[21px]" />
                          {/* Logs record a stretch of time, not an instant, so the
                              row shows the span it covered rather than only its
                              end. This is what every time-of-day chart now reads. */}
                          {(() => {
                            const span = logSpan(log, item, settings);
                            const hhmm = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            return (
                              <span className="text-xs font-mono text-zinc-400">
                                {new Date(log.timestamp).toLocaleDateString()}{' '}
                                {span.minutes > 0 ? `${hhmm(span.start)}–${hhmm(span.end)}` : hhmm(span.end)}
                                {span.minutes > 0 && (
                                  <span className="text-zinc-600"> · {formatDuration(span.minutes)}</span>
                                )}
                              </span>
                            );
                          })()}
                          <span className="text-xs font-bold text-orange-400 ml-auto bg-orange-500/10 px-2 py-0.5 rounded">
                            {log.metricType === 'statusChange' ? 'Status Update' : `+${log.metricType === 'playtimeHours' ? Number((log.delta).toFixed(1)) : log.delta} ${log.metricType}`}
                          </span>
                          <button 
                            onClick={() => handleEditClick(log)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-md transition-all sm:flex hidden"
                            title="Edit Entry"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          {/* Mobile visible edit button */}
                          <button 
                            onClick={() => handleEditClick(log)}
                            className="p-1 text-zinc-400 hover:text-white sm:hidden"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                        {(log.note || log.location) && (
                          <div className="pl-4 relative z-10 mt-3 flex flex-col gap-1">
                            {log.note && (
                              <p className={cn(
                                "text-sm",
                                log.metricType === 'statusChange' ? "text-orange-400 font-bold" : "text-zinc-300 italic"
                              )}>
                                {log.metricType === 'statusChange' ? log.note : `"${log.note}"`}
                              </p>
                            )}
                            {log.location && <p className="text-xs text-zinc-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> {log.location}</p>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
    
    <LootReveal 
      artifact={lootedArtifact} 
      onClose={() => setLootedArtifact(null)} 
    />
    </>
  );
}
