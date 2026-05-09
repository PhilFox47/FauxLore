import React, { useState } from 'react';
import { MediaItem, ProgressLog } from '../types/schema';
import { useMediaContext } from '../contexts/MediaContext';
import { X, Edit2, Clock, Calendar, BookOpen, Star, StarHalf, Hash, Gamepad2, Tv, Film, Save, Trash2, Gem, Loader2, RotateCcw, MapPin, Crown, Shirt, Footprints, Sword, Shield, Flame } from 'lucide-react';
import { calculateScaledDelta } from '../lib/scaling';
import { cn } from '../lib/utils';
import { format, differenceInDays } from 'date-fns';
import { generateAiArtifactWithGemini } from '../services/geminiService';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../services/db';
import { Artifact, RARITY_COLORS } from '../types/schema';
import { LootReveal } from './LootReveal';
import { ForgingButton } from './ForgingButton';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, YAxis } from 'recharts';

interface MediaDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MediaItem | null;
  logs: ProgressLog[];
  onEdit: (item: MediaItem) => void;
}

export function MediaDetailModal({ isOpen, onClose, item, logs, onEdit }: MediaDetailModalProps) {
  const { settings, updateLog, deleteLog, artifacts, saveArtifact, saveMediaItem, generateArtifactImage } = useMediaContext();
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [deleteConfirmLogId, setDeleteConfirmLogId] = useState<string | null>(null);
  const [isLooting, setIsLooting] = useState(false);
  const [pendingLootId, setPendingLootId] = useState<string | null>(null);
  const [lootedArtifact, setLootedArtifact] = useState<Artifact | null>(null);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [editLogData, setEditLogData] = useState<{
    delta: number;
    note: string;
    location: string;
    logDate: string;
    logTime: string;
  }>({ delta: 0, note: '', location: '', logDate: '', logTime: '' });

  const { currentMediaStreak, maxMediaStreak, activeDays, startDate, chartData } = React.useMemo(() => {
    const historicalLogs = logs.filter(l => !l.timestamp.startsWith('1970-01-01'));
    if (historicalLogs.length === 0 || !item) return { currentMediaStreak: 0, maxMediaStreak: 0, activeDays: 0, startDate: null, chartData: [] };

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

    return { currentMediaStreak: currentStreak, maxMediaStreak: max, activeDays: uniqueDates.length, startDate, chartData };
  }, [logs, item, settings]);

  if (!isOpen || !item) return null;

  const uniqueLocations = Array.from(new Set(logs.map(l => l.location).filter(Boolean))) as string[];
  const filteredLocations = uniqueLocations.filter(loc => loc.toLowerCase().includes(editLogData.location.toLowerCase()) && loc !== editLogData.location);

  const totalMasterPages = logs
    .filter(l => !l.isHistoric && l.metricType !== 'statusChange')
    .reduce((acc, log) => acc + calculateScaledDelta(log.delta, item, settings), 0);
  
  // Sort logs descending by timestamp
  const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const itemArtifacts = artifacts?.filter(a => a.mediaId === item.id && a.id !== pendingLootId && a.id !== lootedArtifact?.id) || [];

  const handleClaimLoot = async () => {
    setIsLooting(true);
    try {
      const generated = await generateAiArtifactWithGemini(settings?.geminiApiKey, item);
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
        earnedAt: new Date().toISOString(),
        durability: 100,
        maxDurability: 100,
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
      alert("Failed to loot: " + e.message + "\n\nNote: Ensure your Gemini API Key is set in AI Studio Secrets.");
    } finally {
      setIsLooting(false);
      setPendingLootId(null);
    }
  };

  const handleReRun = async () => {
    const newId = uuidv4();
    const newCopy: MediaItem = {
      ...item,
      id: newId,
      status: 'Active',
      isReRun: true,
      originalMediaId: item.id,
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
            {item.subtitle && <h3 className="text-lg text-zinc-300 mb-2 italic">{item.subtitle}</h3>}
            <p className="text-zinc-400 font-medium mb-4">{item.creator || item.publisher}</p>
            
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-6">
              <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.mediaType}</span>
              {item.publisher && item.creator && <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.publisher}</span>}
              {item.language && <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.language.toUpperCase()}</span>}
              {item.maturityRating && item.maturityRating !== 'NOT_MATURE' && <span className="px-3 py-1 bg-red-500/20 text-red-100 border border-red-500/30 rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.maturityRating}</span>}
              <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.status}</span>
              {item.year && <span className="px-3 py-1 bg-white/10 text-white rounded-md text-xs font-medium backdrop-blur-sm shadow-sm">{item.year}</span>}
            </div>

            <div className="flex flex-col gap-3 w-full">
               <button 
                 onClick={() => { onClose(); onEdit(item); }}
                 className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium flex justify-center items-center gap-2 transition"
               >
                 <Edit2 className="w-4 h-4" />
                 Edit Media Details
               </button>

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
        <div className="w-full md:w-3/5 bg-[#121214] p-8 overflow-y-auto">
          
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

          {chartData.length > 1 && (
            <div className="mb-8 p-6 bg-zinc-800/30 rounded-2xl border border-white/5">
              <h3 className="text-sm font-bold text-zinc-500 mb-6 tracking-wider uppercase flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> Progression (Master Pages)
              </h3>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
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
                    <Area type="monotone" dataKey="pages" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#colorPages)" />
                  </AreaChart>
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
                   {isOngoingPlaytimeMedia ? 'Ongoing Conquest Loot' : 'Conquest Loot'}
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
            <h3 className="text-lg font-bold text-white mb-4 tracking-wide">Journal Entries & Progress</h3>
            {sortedLogs.length === 0 ? (
              <p className="text-zinc-500 italic text-sm">No progress logged yet.</p>
            ) : (
              <div className="space-y-4">
                {sortedLogs.map(log => (
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
                                      className="w-full text-left px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5 last:border-0"
                                    >
                                      {loc}
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
                          <span className="text-xs font-mono text-zinc-400">
                            {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
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
