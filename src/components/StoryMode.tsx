import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, Compass, Copy, Fingerprint, GitBranch, MapPin, Quote,
  RotateCcw, Sparkles, Star, Trophy, TrendingUp, X
} from 'lucide-react';
import { AchievementCard } from './AchievementCard';
import type { StoryKind, StoryScene } from '../lib/storyDiscovery';

const KIND_ICON: Record<StoryKind, React.ComponentType<{ className?: string }>> = {
  opening: Sparkles, insight: BookOpen, outlier: TrendingUp, location: MapPin,
  journal: Quote, spotlight: Star, taste: Fingerprint, return: RotateCcw,
  timeline: GitBranch, rhythm: Clock3, achievement: Trophy, closing: Compass,
};

function StoryBars({ bars }: { bars: NonNullable<StoryScene['bars']> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5" aria-label="Period comparison">
      {bars.map((bar, i) => (
        <div key={bar.label} className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 space-y-3">
          <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">{bar.label}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl md:text-5xl font-black text-white tabular-nums">{bar.note.includes('/ 5') ? bar.note : bar.value + '%'}</span>
          </div>
          <div className="h-3 rounded-full bg-white/10 overflow-hidden" role="progressbar"
            aria-label={bar.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bar.value}>
            <motion.div initial={{ width: 0 }} animate={{ width: Math.min(100, Math.max(0, bar.value)) + '%' }}
              transition={{ duration: 0.85, delay: i * 0.12 }}
              className={i === 0 ? 'h-full rounded-full bg-violet-400' : 'h-full rounded-full bg-amber-400'} />
          </div>
          <p className="text-xs text-zinc-500">{bar.note.includes('/ 5') ? bar.value + '% of maximum rating' : bar.note}</p>
        </div>
      ))}
    </div>
  );
}

function StoryTimeline({ beats }: { beats: NonNullable<StoryScene['beats']> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
      {beats.map((beat, index) => (
        <div key={beat.label + index} className="border-l-2 border-violet-400/65 pl-4 py-2 bg-white/[0.025] rounded-r-xl">
          <p className="text-[10px] font-bold text-violet-300 uppercase tracking-[0.16em]">{beat.label}</p>
          <p className="text-base md:text-lg font-black text-white mt-1">{beat.title}</p>
          <p className="text-xs text-zinc-500 mt-1">{beat.detail}</p>
        </div>
      ))}
    </div>
  );
}

function StorySlide({ scene, number, total, onDeepDive }: {
  scene: StoryScene; number: number; total: number; onDeepDive: () => void;
}) {
  const Icon = KIND_ICON[scene.kind];
  const opener = scene.kind === 'opening';
  const closer = scene.kind === 'closing';
  const art = scene.media?.cover;
  const showCover = art && scene.kind !== 'achievement';
  const article = scene.kind === 'insight';
  return (
    <motion.article key={scene.id} initial={{ opacity: 0, x: 35, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -35, scale: 0.98 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
      className="relative isolate rounded-[2rem] md:rounded-[2.5rem] min-h-[490px] border border-white/15 bg-[#101018] overflow-hidden shadow-[0_28px_80px_rgba(0,0,0,0.5)]">
      {showCover && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <img src={art} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover scale-125 blur-[65px] opacity-[0.18]" referrerPolicy="no-referrer" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-950/25 via-[#101018]/60 to-black/85" />
      <div className="absolute right-[-10%] top-[-20%] w-1/2 h-2/3 rounded-full bg-violet-600/10 blur-[100px] pointer-events-none" />
      <div className="relative z-10 min-h-[490px] p-6 md:p-10 lg:p-14 flex flex-col justify-center gap-5 md:gap-6">
        <div className="flex items-center gap-2 text-[10px] md:text-xs font-black tracking-[0.19em] text-violet-300 uppercase">
          <Icon className="w-4 h-4 shrink-0" />
          <span>{scene.eyebrow}</span>
          <span className="ml-auto text-zinc-500 tabular-nums">{String(number).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
        </div>
        <div className={showCover && (opener || scene.kind === 'spotlight') ? 'grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(130px,230px)] items-center gap-6 lg:gap-12' : 'space-y-5'}>
          <div className="space-y-4 min-w-0">
            <h2 className={(opener ? 'text-4xl sm:text-5xl lg:text-7xl' : 'text-3xl sm:text-4xl lg:text-5xl') +
              ' font-black tracking-tight text-white leading-[1.08] break-words'}>{scene.title}</h2>
            {scene.kind !== 'achievement' && (
              <div className={'space-y-3 max-w-3xl ' + (article ? 'text-base md:text-xl leading-relaxed text-zinc-200' : 'text-base md:text-xl leading-relaxed text-zinc-300')}>
                {scene.body.split(/\n\s*\n/).filter(Boolean).map((part, i) => <p key={i} className="whitespace-pre-line">{part}</p>)}
              </div>
            )}
          </div>
          {showCover && (opener || scene.kind === 'spotlight') && (
            <div className="w-32 sm:w-full max-w-[235px] mx-auto rotate-2 shadow-[0_20px_55px_rgba(0,0,0,0.8)] rounded-2xl overflow-hidden border border-white/20">
              <img src={art} alt={'Cover: ' + scene.media!.title} referrerPolicy="no-referrer" className="aspect-[2/3] w-full object-cover" />
            </div>
          )}
        </div>
        {scene.kind === 'achievement' && scene.achievement && (
          <AchievementCard achievement={scene.achievement} fresh />
        )}
        {scene.kind === 'journal' && scene.quote && (
          <blockquote className="max-w-3xl border-l-4 border-amber-400/80 pl-5 text-lg md:text-2xl leading-relaxed text-amber-100 italic whitespace-pre-line">
            “{scene.quote}”
          </blockquote>
        )}
        {(scene.kind === 'outlier' || scene.kind === 'taste') && !!scene.bars?.length && <StoryBars bars={scene.bars} />}
        {scene.kind === 'timeline' && !!scene.beats?.length && <StoryTimeline beats={scene.beats} />}
        {scene.detail && (
          <p className={closer ? 'text-violet-200 text-lg font-semibold max-w-2xl' : 'text-xs md:text-sm text-zinc-400 max-w-2xl'}>{scene.detail}</p>
        )}
        {scene.media && !opener && scene.kind !== 'spotlight' && scene.kind !== 'achievement' && (
          <div className="flex items-center gap-3 max-w-lg rounded-xl bg-black/40 border border-white/10 p-3">
            {scene.media.cover ? <img src={scene.media.cover} alt="" referrerPolicy="no-referrer" className="w-10 h-14 object-cover rounded-md" /> : <BookOpen className="w-6 h-6 text-zinc-500" />}
            <div className="min-w-0">
              <p className="text-white text-sm font-bold truncate">{scene.media.title}</p>
              <p className="text-zinc-400 text-xs">{scene.media.type}</p>
            </div>
          </div>
        )}
        {scene.sourceLabel && !opener && (
          <p className="text-[10px] tracking-wider uppercase text-zinc-500">{scene.sourceLabel}</p>
        )}
        {closer && (
          <button onClick={onDeepDive} className="self-start flex items-center gap-2 bg-white text-black px-6 py-3 rounded-xl text-sm font-black hover:bg-violet-100">
            Explore the full Deep Dive <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.article>
  );
}

/** Keyboard/swipe-accessible curated story. No auto-advance, no surprise timers. */
export function StoryMode({ scenes, timeframe, timeId, onDeepDive }: {
  scenes: StoryScene[];
  timeframe: 'week' | 'month' | 'year';
  timeId: string;
  onDeepDive: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const touchStart = useRef<number | null>(null);
  const current = scenes[Math.min(index, scenes.length - 1)];
  useEffect(() => { setIndex(0); setCopied(false); }, [timeframe, timeId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || target?.closest('button,input,textarea,select,[contenteditable]')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); setIndex(i => Math.min(i + 1, scenes.length - 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scenes.length]);
  if (!current) return null;
  const copyScene = async () => {
    const text = [current.title, current.body, current.quote, current.detail,
      current.achievement?.reward ? 'REWARD: ' + current.achievement.reward : null].filter(Boolean).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch { setCopied(false); }
  };
  return (
    <section aria-label={'Your ' + timeframe + ' Wrapped story'} className="space-y-4 md:space-y-6 max-w-6xl mx-auto pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-violet-300 text-[10px] tracking-[0.2em] font-black uppercase">Your story · {timeId}</p>
          <p className="text-zinc-400 text-xs mt-1">{scenes.length} curated scenes from your actual activity</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyScene} aria-label="Copy current story scene" title="Copy current scene"
            className="flex items-center gap-2 px-3 py-2 border border-white/10 rounded-xl bg-white/5 text-zinc-300 text-xs hover:text-white">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy scene'}
          </button>
          <button onClick={onDeepDive} className="flex items-center gap-2 px-3 py-2 border border-white/10 rounded-xl bg-white/5 text-zinc-300 text-xs hover:text-white">
            <BookOpen className="w-4 h-4" /> Deep Dive
          </button>
        </div>
      </div>
      <div className="flex gap-1.5" role="group" aria-label="Jump to a story scene">
        {scenes.map((scene, i) => (
          <button key={scene.id} onClick={() => { setIndex(i); setCopied(false); }}
            aria-label={'Go to scene ' + (i + 1) + ': ' + scene.title} aria-current={index === i ? 'step' : undefined}
            title={scene.title}
            className={'h-2 flex-1 rounded-full transition-colors ' +
              (index === i ? 'bg-violet-400' : i < index ? 'bg-violet-400/40 hover:bg-violet-300/70' : 'bg-white/15 hover:bg-white/30')}/>
        ))}
      </div>
      <div className="relative" onTouchStart={e => { touchStart.current = e.changedTouches[0]?.screenX ?? null; }}
        onTouchEnd={e => {
          if (touchStart.current === null) return;
          const change = (e.changedTouches[0]?.screenX ?? touchStart.current) - touchStart.current;
          touchStart.current = null;
          if (Math.abs(change) < 65) return;
          setIndex(i => Math.max(0, Math.min(scenes.length - 1, i + (change < 0 ? 1 : -1))));
          setCopied(false);
        }}>
        <AnimatePresence mode="wait">
          <StorySlide key={current.id} scene={current} number={index + 1} total={scenes.length} onDeepDive={onDeepDive} />
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => { setIndex(i => Math.max(i - 1, 0)); setCopied(false); }} disabled={index === 0}
          aria-label="Previous scene"
          className="flex items-center gap-2 rounded-xl px-4 py-3 bg-white/5 border border-white/10 text-sm font-bold text-white disabled:opacity-30 hover:bg-white/10">
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        <div className="flex items-center gap-2 text-xs text-zinc-500 hidden sm:flex">
          <CalendarDays className="w-4 h-4" /> {index + 1} of {scenes.length}
          <span className="text-zinc-700">· Use arrow keys or swipe</span>
        </div>
        {index === scenes.length - 1 ? (
          <button onClick={onDeepDive}
            className="flex items-center gap-2 rounded-xl px-4 py-3 bg-violet-500/20 border border-violet-400/30 text-sm font-bold text-violet-100 hover:bg-violet-500/30">
            Full analysis <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={() => { setIndex(i => Math.min(i + 1, scenes.length - 1)); setCopied(false); }}
            aria-label="Next scene"
            className="flex items-center gap-2 rounded-xl px-4 py-3 bg-violet-500/20 border border-violet-400/30 text-sm font-bold text-violet-100 hover:bg-violet-500/30">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </section>
  );
}
