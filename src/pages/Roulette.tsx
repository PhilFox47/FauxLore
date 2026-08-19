import React, { useState, useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { Dice5, Sparkles, RefreshCw, Eye, Clock, Zap, Compass, Play, ArrowRight, PauseCircle, Download } from 'lucide-react';
import { MediaItem, MEDIA_TYPES, MediaType, MEDIA_COLORS } from '../types/schema';
import { MediaDetailModal } from '../components/MediaDetailModal';
import { MediaFormModal } from '../components/MediaFormModal';
import { generateText, getPersonaDescription } from '../services/nanoGptService';
import { recommendBacklog, resumableStale, Recommendation } from '../lib/recommend';
import { isWaitingOnRelease } from '../lib/onHold';
import { cn } from '../lib/utils';
import Markdown from 'react-markdown';
import { creativeModel } from '../lib/aiModels';

type TimeMood = 'any' | 'quick' | 'epic';

export function Roulette() {
  const { media, logs, settings, saveMediaItem, deleteMediaItem } = useMediaContext();

  const [mediaTypeFilters, setMediaTypeFilters] = useState<MediaType[]>([]);
  const [timeMood, setTimeMood] = useState<TimeMood>('any');
  const [seed, setSeed] = useState(0);

  const [randomPick, setRandomPick] = useState<MediaItem | null>(null);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [currentActionItem, setCurrentActionItem] = useState<MediaItem | null>(null);

  const backlogCount = useMemo(() => media.filter(m => m.status === 'Planning').length, [media]);

  const recommendations = useMemo(
    () => recommendBacklog(media, logs, settings, { types: mediaTypeFilters, time: timeMood, limit: 9 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [media, logs, settings, mediaTypeFilters, timeMood, seed],
  );

  const resumable = useMemo(() => resumableStale(media, logs, 4), [media, logs]);
  const waiting = useMemo(() => media.filter(isWaitingOnRelease), [media]);

  const topPick = recommendations[0] || null;
  const otherPicks = recommendations.slice(1, 7);

  const toggleFilter = (type: MediaType) =>
    setMediaTypeFilters(prev => (prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]));

  const startItem = (item: MediaItem) => saveMediaItem({ ...item, status: 'Active' });

  const handleEdit = (item: MediaItem) => { setCurrentActionItem(item); setIsFormOpen(true); };
  const handleViewDetails = (item: MediaItem) => { setCurrentActionItem(item); setIsDetailOpen(true); };

  const surpriseMe = () => {
    if (recommendations.length === 0) return;
    const pool = recommendations.length > 1 ? recommendations : recommendations;
    setRandomPick(pool[Math.floor(Math.random() * pool.length)].item);
  };

  const askForAdvice = async () => {
    if (!settings?.nanoGptApiKey || backlogCount === 0) return;
    setIsAdviceLoading(true);
    setAiRecommendation(null);
    try {
      const recentLogs = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
      const recentMediaIds = Array.from(new Set(recentLogs.map(l => l.mediaId)));
      const recentMedia = media.filter(m => recentMediaIds.includes(m.id)).map(m => m.title).join(', ');
      const backlogList = recommendations.map(r => `[${r.item.mediaType}] ${r.item.title}`).join('\n');
      const promptContext = `USER'S RECENTLY CONSUMED MEDIA:\n${recentMedia || 'None'}\n\nUSER'S BACKLOG (already pre-ranked for them):\n${backlogList}`;
      const personaDesc = getPersonaDescription(settings.aiPersona);
      const aiText = await generateText(
        settings.nanoGptApiKey,
        creativeModel(settings),
        `You are the recommendation assistant inside a media tracker. ${personaDesc} Recommend EXACTLY ONE item from the user's BACKLOG and justify it based on their recent consumption. Make the tone match your persona. Keep it to 2-3 sentences.`,
        promptContext,
      );
      setAiRecommendation(aiText);
    } catch (e: any) {
      console.error('Recommendation request failed: ' + e.message);
    } finally {
      setIsAdviceLoading(false);
    }
  };

  const moods: { id: TimeMood; label: string; icon: React.ReactNode; hint: string }[] = [
    { id: 'any', label: 'Any', icon: <Compass className="w-4 h-4" />, hint: 'Whatever fits best' },
    { id: 'quick', label: 'Quick', icon: <Zap className="w-4 h-4" />, hint: 'Short, knock it out' },
    { id: 'epic', label: 'Epic', icon: <Clock className="w-4 h-4" />, hint: 'A big journey' },
  ];

  const ReasonChips = ({ reasons }: { reasons: string[] }) => (
    <div className="flex flex-wrap gap-2">
      {reasons.map((r, i) => (
        <span key={i} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300">{r}</span>
      ))}
    </div>
  );

  const Cover = ({ item, className }: { item: MediaItem; className?: string }) => (
    item.coverImageUrl
      ? <img src={item.coverImageUrl} alt={item.title} referrerPolicy="no-referrer" className={cn('object-cover', className)} />
      : <div className={cn('flex items-center justify-center bg-zinc-900 text-zinc-700', className)}><Dice5 className="w-8 h-8" /></div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <header>
        <h2 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight">
          <Compass className="w-8 h-8 text-pink-500" />
          What's Next
        </h2>
        <p className="text-zinc-400 mt-2">Smart picks from your backlog — matched to your taste, your pace, and what you've been into lately.</p>

        <div className="mt-6 flex flex-col lg:flex-row lg:items-end gap-6">
          <div>
            <p className="text-[10px] text-zinc-500 mb-2 font-black tracking-[0.2em] uppercase">Mood</p>
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 w-fit">
              {moods.map(m => (
                <button
                  key={m.id}
                  onClick={() => setTimeMood(m.id)}
                  title={m.hint}
                  className={cn('px-4 py-2 rounded-lg text-sm font-black flex items-center gap-2 transition-all',
                    timeMood === m.id ? 'bg-white/10 text-white shadow-xl' : 'text-zinc-500 hover:text-zinc-300')}
                >
                  {m.icon}{m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-zinc-500 mb-2 font-black tracking-[0.2em] uppercase">Filter by type</p>
            <div className="flex flex-wrap gap-2">
              {MEDIA_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => toggleFilter(type)}
                  className={cn('px-3.5 py-1.5 rounded-full text-xs font-bold transition border',
                    mediaTypeFilters.includes(type)
                      ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                      : 'bg-zinc-800/50 text-zinc-400 border-white/5 hover:bg-zinc-800 hover:text-white')}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {backlogCount === 0 ? (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-5 sm:p-16 text-center">
          <Dice5 className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="text-xl font-black text-white mb-2">Your backlog is empty</h3>
          <p className="text-zinc-500">Add some media with the "Planning" status and I'll help you decide what to tackle next.</p>
        </div>
      ) : recommendations.length === 0 ? (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-5 sm:p-16 text-center text-zinc-500">
          No backlog items match this mood/filter. Try widening it.
        </div>
      ) : (
        <>
          {/* Top Pick */}
          {topPick && (
            <section className="relative overflow-hidden rounded-[2.5rem] border border-pink-500/20 bg-black">
              <Cover item={topPick.item} className="absolute inset-0 w-full h-full opacity-25 blur-2xl scale-110" />
              <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/40" />
              <div className="relative z-10 flex flex-col sm:flex-row gap-8 p-5 md:p-10">
                <div className="w-40 h-56 md:w-44 md:h-64 rounded-2xl overflow-hidden border border-white/10 shadow-2xl shrink-0 bg-zinc-900">
                  <Cover item={topPick.item} className="w-full h-full" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="text-[11px] font-black uppercase tracking-[0.3em] text-pink-400 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Your next quest
                  </div>
                  <h3 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-[0.95] mb-3 break-words">{topPick.item.title}</h3>
                  <div className="flex items-center gap-3 flex-wrap mb-5">
                    <span className={cn('text-[11px] font-black uppercase tracking-widest', MEDIA_COLORS[topPick.item.mediaType]?.text || 'text-zinc-400')}>{topPick.item.mediaType}</span>
                    <span className="text-zinc-700">•</span>
                    <span className="text-zinc-300 text-sm font-bold flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{topPick.estLabel}</span>
                    {topPick.item.reviewScore ? (<><span className="text-zinc-700">•</span><span className="text-blue-400 text-sm font-bold">Critic {topPick.item.reviewScore}★</span></>) : null}
                  </div>
                  {topPick.reasons.length > 0 && <div className="mb-6"><ReasonChips reasons={topPick.reasons} /></div>}
                  <div className="mt-auto flex flex-wrap gap-3">
                    <button onClick={() => startItem(topPick.item)} className="bg-white text-black hover:bg-zinc-200 px-6 py-3 rounded-xl text-sm font-black flex items-center gap-2 transition-all hover:scale-105 active:scale-95">
                      <Play className="w-4 h-4 fill-current" /> Start it
                    </button>
                    <button onClick={() => handleViewDetails(topPick.item)} className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl text-sm font-black flex items-center gap-2 transition-colors">
                      Details <ArrowRight className="w-4 h-4" />
                    </button>
                    <button onClick={() => setSeed(s => s + 1)} title="Reshuffle suggestions" className="bg-white/5 hover:bg-white/10 text-zinc-300 px-4 py-3 rounded-xl text-sm font-black flex items-center gap-2 transition-colors">
                      <RefreshCw className="w-4 h-4" /> Reroll
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Also worth your time */}
          {otherPicks.length > 0 && (
            <section>
              <h3 className="text-xl font-black text-white mb-5 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" /> Also worth your time
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {otherPicks.map((rec: Recommendation) => (
                  <div key={rec.item.id} className="bg-zinc-900/40 border border-white/5 rounded-3xl overflow-hidden group hover:border-white/15 transition-colors flex flex-col">
                    <button onClick={() => handleViewDetails(rec.item)} className="flex gap-4 p-4 text-left">
                      <Cover item={rec.item} className="w-16 h-24 rounded-xl shrink-0 border border-white/10" />
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-white truncate">{rec.item.title}</div>
                        <div className="flex items-center gap-2 mt-1 mb-2">
                          <span className={cn('text-[9px] font-black uppercase tracking-widest', MEDIA_COLORS[rec.item.mediaType]?.text || 'text-zinc-400')}>{rec.item.mediaType}</span>
                          <span className="text-zinc-700 text-xs">•</span>
                          <span className="text-[10px] text-zinc-500 font-bold">{rec.estLabel}</span>
                        </div>
                        {rec.reasons[0] && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400">{rec.reasons[0]}</span>}
                      </div>
                    </button>
                    <button onClick={() => startItem(rec.item)} className="mt-auto border-t border-white/5 py-2.5 text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
                      <Play className="w-3.5 h-3.5" /> Start it
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Surprise me (random) */}
          <section className="bg-zinc-900/40 border border-white/5 rounded-3xl p-5 sm:p-8 flex flex-col items-center text-center">
            <h3 className="text-lg font-black text-white mb-1">Can't decide? Let fate pick.</h3>
            <p className="text-zinc-500 text-sm mb-6">A random roll weighted toward your current mood &amp; filters.</p>
            <button onClick={surpriseMe} className="bg-gradient-to-r from-pink-600 to-orange-600 hover:from-pink-500 hover:to-orange-500 text-white px-8 py-3.5 rounded-full font-black tracking-wider uppercase transition-all shadow-[0_0_40px_rgba(249,115,22,0.25)] hover:scale-105 active:scale-95 flex items-center gap-3">
              <Dice5 className="w-5 h-5" /> Surprise me
            </button>
            {randomPick && (
              <div className="mt-8 w-full max-w-md bg-black/40 border border-white/10 rounded-2xl p-5 flex items-center gap-4 animate-in zoom-in duration-300">
                <Cover item={randomPick} className="w-14 h-20 rounded-lg shrink-0 border border-white/10" />
                <div className="min-w-0 flex-1 text-left">
                  <div className="font-black text-white truncate">{randomPick.title}</div>
                  <div className={cn('text-[10px] font-black uppercase tracking-widest', MEDIA_COLORS[randomPick.mediaType]?.text || 'text-zinc-400')}>{randomPick.mediaType}</div>
                </div>
                <button onClick={() => startItem(randomPick)} className="bg-white text-black hover:bg-zinc-200 px-4 py-2 rounded-lg text-xs font-black flex items-center gap-1.5 shrink-0"><Play className="w-3.5 h-3.5 fill-current" /> Start</button>
              </div>
            )}
          </section>
        </>
      )}

      {/* Pick something back up */}
      {resumable.length > 0 && (
        <section>
          <h3 className="text-xl font-black text-white mb-1 flex items-center gap-2"><RefreshCw className="w-5 h-5 text-emerald-400" /> Pick something back up</h3>
          <p className="text-zinc-500 text-sm mb-5">Started but gone quiet, plus anything On Hold that has new content waiting.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {resumable.map(({ item, days, reason }) => (
              <button
                key={item.id}
                onClick={() => handleViewDetails(item)}
                className={cn(
                  'bg-zinc-900/40 border rounded-2xl p-4 flex gap-3 text-left transition-colors',
                  reason ? 'border-emerald-500/30 hover:border-emerald-500/60' : 'border-white/5 hover:border-white/15',
                )}
              >
                <Cover item={item} className="w-12 h-16 rounded-lg shrink-0 border border-white/10" />
                <div className="min-w-0">
                  <div className="font-bold text-white text-sm truncate">{item.title}</div>
                  <div className={cn('text-[9px] font-black uppercase tracking-widest mt-0.5', MEDIA_COLORS[item.mediaType]?.text || 'text-zinc-400')}>{item.mediaType}</div>
                  {reason ? (
                    <div className="text-[10px] text-emerald-400 font-bold mt-1.5 flex items-center gap-1 truncate">
                      <Download className="w-3 h-3 shrink-0" /> {reason}
                    </div>
                  ) : (
                    <div className="text-[10px] text-amber-500/80 font-bold mt-1.5">Quiet for {days}d</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Parked on purpose — shown so they are visibly accounted for rather than
          silently dropped from every suggestion on the page. */}
      {waiting.length > 0 && (
        <section>
          <h3 className="text-xl font-black text-white mb-1 flex items-center gap-2"><PauseCircle className="w-5 h-5 text-blue-400" /> Waiting on new releases</h3>
          <p className="text-zinc-500 text-sm mb-5">
            On Hold, with nothing new upstream yet. These are left out of the picks above until something ships.
          </p>
          <div className="flex flex-wrap gap-2">
            {waiting.map(item => (
              <button
                key={item.id}
                onClick={() => handleViewDetails(item)}
                className="flex items-center gap-2 bg-zinc-900/40 border border-white/5 hover:border-white/15 rounded-full pl-2 pr-4 py-1.5 transition-colors"
              >
                <Cover item={item} className="w-6 h-8 rounded shrink-0 border border-white/10" />
                <span className="text-xs font-bold text-zinc-300 truncate max-w-[200px]">{item.title}</span>
                <span className={cn('text-[9px] font-black uppercase tracking-widest', MEDIA_COLORS[item.mediaType]?.text || 'text-zinc-500')}>{item.mediaType}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Ask the AI for a pick */}
      <section className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/20 rounded-3xl p-5 sm:p-8 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <h3 className="text-3xl font-black text-indigo-100 flex items-center gap-3 mb-4 tracking-tight">
              <Eye className="w-8 h-8 text-indigo-400" /> Ask the AI
            </h3>
            <p className="text-indigo-200/70 mb-6 text-sm leading-relaxed max-w-lg">
              Want a pick with reasoning behind it? The AI reads your backlog and what you have been logging lately, then names one thing to start next.
            </p>
            <button
              onClick={askForAdvice}
              disabled={isAdviceLoading || backlogCount === 0 || !settings?.nanoGptApiKey}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-500 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2"
            >
              {isAdviceLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              {isAdviceLoading ? 'Thinking...' : 'Recommend one for me'}
            </button>
            {!settings?.nanoGptApiKey && <p className="text-indigo-300/50 text-xs mt-3">Configure a NanoGPT key in Settings to use this.</p>}
          </div>
          {(aiRecommendation || isAdviceLoading) && (
            <div className="flex-1 w-full bg-black/40 border border-indigo-500/30 rounded-2xl p-6 min-h-[180px]">
              {isAdviceLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-indigo-400 opacity-70 gap-4">
                  <Eye className="w-10 h-10 animate-pulse" />
                  <span className="text-sm tracking-widest uppercase font-bold text-indigo-300">Reading your backlog...</span>
                </div>
              ) : (
                <div className="prose prose-invert prose-sm prose-indigo max-w-none">
                  <Markdown>{aiRecommendation}</Markdown>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Modals */}
      <MediaDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        item={currentActionItem}
        logs={logs.filter(l => l.mediaId === currentActionItem?.id)}
        onEdit={(item) => { setIsDetailOpen(false); handleEdit(item); }}
      />
      <MediaFormModal
        isOpen={isFormOpen}
        initialData={currentActionItem || undefined}
        onClose={() => setIsFormOpen(false)}
        onSave={(data) => { saveMediaItem(data); setIsFormOpen(false); }}
        onDelete={(id) => { deleteMediaItem(id); setIsFormOpen(false); }}
        onOpenExisting={(item) => { setIsFormOpen(false); handleViewDetails(item); }}
      />
    </div>
  );
}
