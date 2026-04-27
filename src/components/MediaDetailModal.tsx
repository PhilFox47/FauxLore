import React, { useState } from 'react';
import { MediaItem, ProgressLog } from '../types/schema';
import { useMediaContext } from '../contexts/MediaContext';
import { X, Edit2, Clock, Calendar, BookOpen, Star, StarHalf, Hash, Gamepad2, Tv, Film, Save, Trash2, Gem, Loader2, RotateCcw, MapPin } from 'lucide-react';
import { calculateScaledDelta } from '../lib/scaling';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { generateAiArtifactWithGemini } from '../services/geminiService';
import { v4 as uuidv4 } from 'uuid';
import { Artifact } from '../types/schema';
import { LootReveal } from './LootReveal';
import { ForgingButton } from './ForgingButton';

interface MediaDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MediaItem | null;
  logs: ProgressLog[];
  onEdit: (item: MediaItem) => void;
}

export function MediaDetailModal({ isOpen, onClose, item, logs, onEdit }: MediaDetailModalProps) {
  const { settings, updateLog, deleteLog, artifacts, saveArtifact, saveMediaItem } = useMediaContext();
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [deleteConfirmLogId, setDeleteConfirmLogId] = useState<string | null>(null);
  const [isLooting, setIsLooting] = useState(false);
  const [lootedArtifact, setLootedArtifact] = useState<Artifact | null>(null);
  const [editLogData, setEditLogData] = useState<{
    delta: number;
    note: string;
    location: string;
    logDate: string;
    logTime: string;
  }>({ delta: 0, note: '', location: '', logDate: '', logTime: '' });

  if (!isOpen || !item) return null;

  const totalMasterPages = logs
    .filter(l => !l.isHistoric && l.metricType !== 'statusChange')
    .reduce((acc, log) => acc + calculateScaledDelta(log.delta, item, settings), 0);
  
  // Sort logs descending by timestamp
  const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const itemArtifacts = artifacts?.filter(a => a.mediaId === item.id) || [];

  const handleClaimLoot = async () => {
    setIsLooting(true);
    try {
      const generated = await generateAiArtifactWithGemini(settings?.geminiApiKey, item);
      const newArtifact = {
        id: uuidv4(),
        mediaId: item.id,
        name: generated.name,
        description: generated.description,
        type: generated.type || 'Trinket',
        rarity: generated.rarity as Artifact['rarity'],
        earnedAt: new Date().toISOString()
      };
      await saveArtifact(newArtifact);
      setLootedArtifact(newArtifact);
    } catch(e: any) {
      console.error("Failed to loot: " + e.message);
      alert("Failed to loot: " + e.message + "\n\nNote: Ensure your Gemini API Key is set in AI Studio Secrets.");
    } finally {
      setIsLooting(false);
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
              <div className="text-2xl font-black text-white flex items-center h-8">
                {item.userRating ? (
                  <>
                     {Array(Math.floor(item.userRating)).fill(0).map((_, i) => <Star key={`full-${i}`} className="w-5 h-5 fill-white text-white" />)}
                     {item.userRating % 1 !== 0 && <StarHalf className="w-5 h-5 fill-white text-white" />}
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
          </div>

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
            const isOngoingGame = item.mediaType === 'Game' && item.isOngoing;
            let allowedArtifactsCount = 0;
            let nonHistoricalPlaytime = 0;
            
            if (isOngoingGame) {
              nonHistoricalPlaytime = logs
                .filter(l => l.mediaId === item.id && !l.timestamp.startsWith('1970-01-01') && l.metricType === 'playtimeHours')
                .reduce((sum, log) => sum + log.delta, 0);
              
              allowedArtifactsCount = Math.floor(nonHistoricalPlaytime / 100);
            } else if (item.status === 'Completed') {
              allowedArtifactsCount = 1;
            }
            
            if (allowedArtifactsCount === 0 && itemArtifacts.length === 0) return null;

            const canLoot = itemArtifacts.length < allowedArtifactsCount;

            return (
              <div className="mb-8">
                <h3 className="text-lg font-bold text-white mb-3 tracking-wide flex items-center gap-2">
                   <Gem className="w-5 h-5 text-purple-400" />
                   {isOngoingGame ? 'Ongoing Conquest Loot' : 'Conquest Loot'}
                </h3>
                {isOngoingGame && (
                  <p className="text-xs text-zinc-400 mb-4">Tracked Playtime: {nonHistoricalPlaytime.toFixed(1)} hrs (Next loot at {((itemArtifacts.length + (canLoot ? 0 : 1)) * 100)} hrs)</p>
                )}
                {itemArtifacts.length > 0 && (
                  <div className="flex flex-col gap-3 mb-4">
                    {itemArtifacts.map(artifact => (
                       <div key={artifact.id} className="bg-purple-900/10 border border-purple-500/30 rounded-2xl p-5 flex items-start gap-4 shadow-lg shadow-purple-900/5 hover:border-purple-500/50 transition-colors">
                          <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0 border border-purple-500/40">
                             <Gem className="w-6 h-6 text-purple-400" />
                          </div>
                          <div>
                             <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-black text-purple-300 text-lg">{artifact.name}</h4>
                                <span className={cn(
                                   "text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded",
                                   artifact.rarity === 'Mythic' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                   artifact.rarity === 'Legendary' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                   artifact.rarity === 'Epic' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                   artifact.rarity === 'Rare' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                   artifact.rarity === 'Uncommon' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                   'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                                )}>{artifact.rarity} {artifact.type}</span>
                             </div>
                             <p className="text-zinc-400 text-sm leading-relaxed">{artifact.description}</p>
                          </div>
                       </div>
                    ))}
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
                          <div className="flex-1">
                            <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider pl-1">Location</label>
                            <input 
                              type="text"
                              value={editLogData.location}
                              onChange={(e) => setEditLogData({ ...editLogData, location: e.target.value })}
                              placeholder="e.g. Home, Train, Area..."
                              className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                            />
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
                            {log.metricType === 'statusChange' ? 'Status Update' : `+${log.delta} ${log.metricType}`}
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
