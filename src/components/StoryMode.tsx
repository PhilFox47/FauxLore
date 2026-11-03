import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Copy,
  Quote, ShieldAlert, Trophy
} from 'lucide-react';
import { AchievementCard } from './AchievementCard';
import { DynamicStorySlide } from './DynamicStorySlide';
import { EditorialStorySlide } from './EditorialStorySlide';
import { WrappedClosingTableau } from './WrappedClosingTableau';
import { isWrappedInfographicScene } from '../lib/wrappedSceneArt';
import { safeDynamicScene } from '../lib/dynamicScenes';
import type { GeneratedAchievement } from '../lib/generatedAchievements';
import type { StoryScene, StoryLayout, StoryPalette, StoryVisual, StoryMedia } from '../lib/storyDiscovery';

const PALETTES: Record<StoryPalette, {
  background: string; glow: string; accent: string; border: string; shadow: string; line: string;
}> = {
  violet: { background: 'from-violet-950 via-[#151028] to-[#080710]', glow: 'bg-violet-500/30', accent: 'text-violet-200', border: 'border-violet-400/25', shadow: 'shadow-violet-950/40', line: 'bg-violet-400' },
  cobalt: { background: 'from-blue-950 via-[#0b1a35] to-[#050b18]', glow: 'bg-blue-500/30', accent: 'text-blue-200', border: 'border-blue-400/25', shadow: 'shadow-blue-950/40', line: 'bg-blue-400' },
  amber: { background: 'from-amber-950 via-[#301c09] to-[#110906]', glow: 'bg-amber-500/25', accent: 'text-amber-200', border: 'border-amber-400/25', shadow: 'shadow-amber-950/40', line: 'bg-amber-400' },
  rose: { background: 'from-rose-950 via-[#2d0e20] to-[#12080d]', glow: 'bg-rose-500/25', accent: 'text-rose-200', border: 'border-rose-400/25', shadow: 'shadow-rose-950/40', line: 'bg-rose-400' },
  emerald: { background: 'from-emerald-950 via-[#0c2928] to-[#081311]', glow: 'bg-emerald-500/25', accent: 'text-emerald-200', border: 'border-emerald-400/25', shadow: 'shadow-emerald-950/40', line: 'bg-emerald-400' },
  cyan: { background: 'from-cyan-950 via-[#092633] to-[#051319]', glow: 'bg-cyan-500/25', accent: 'text-cyan-200', border: 'border-cyan-400/25', shadow: 'shadow-cyan-950/40', line: 'bg-cyan-400' },
  monochrome: { background: 'from-zinc-800 via-zinc-950 to-black', glow: 'bg-white/15', accent: 'text-zinc-200', border: 'border-white/20', shadow: 'shadow-black/50', line: 'bg-white/70' },
};

const fallbackLayout: Record<StoryScene['kind'], StoryLayout> = {
  opening: 'cover-hero', closing: 'type-poster', insight: 'editorial',
  outlier: 'infographic', location: 'cover-wall', journal: 'quote-poster',
  spotlight: 'split-feature', taste: 'infographic', return: 'split-feature',
  timeline: 'timeline-film', rhythm: 'type-poster', achievement: 'type-poster',
};

function Poster({ media, className = '', eager = false }: { media: StoryMedia; className?: string; eager?: boolean }) {
  return (
    <div className={'relative overflow-hidden rounded-2xl bg-white/10 border border-white/15 shadow-[0_25px_60px_rgba(0,0,0,.48)] ' + className}>
      {media.cover ? <img src={media.cover} alt={'Cover of ' + media.title} loading={eager ? 'eager' : 'lazy'}
        className="w-full h-full object-cover" referrerPolicy="no-referrer" /> :
        <div className="w-full h-full flex items-center justify-center p-6 text-center text-sm font-bold text-zinc-200">{media.title}</div>}
    </div>
  );
}

function ArtworkWall({ images, compact = false }: { images: StoryMedia[]; compact?: boolean }) {
  if (!images.length) return null;
  const shown = images.slice(0, compact ? 3 : 6);
  return (
    <div className={'grid grid-cols-2 gap-3 sm:gap-4 ' + (shown.length >= 3 ? 'sm:grid-cols-3' : '')}>
      {shown.map((m, i) => (
        <motion.div key={m.id} initial={{ opacity: 0, y: 18, rotate: i % 2 ? 3 : -3 }}
          animate={{ opacity: 1, y: 0, rotate: i % 2 ? 2 : -2 }}
          transition={{ delay: i * 0.08 }}>
          <Poster media={m} className={'aspect-[2/3] w-full max-h-[310px] ' +
            (i === 0 ? 'ring-2 ring-white/20' : '')} />
        </motion.div>
      ))}
    </div>
  );
}

function DataBars({ bars, color }: { bars: NonNullable<StoryScene['bars']>; color: string }) {
  return <div className="space-y-7 w-full" aria-label="Verified comparison">
    {bars.map((bar, i) => (
      <div key={bar.label + i} className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <span className="text-sm md:text-base font-bold text-zinc-200">{bar.label}</span>
          <span className="font-black text-3xl md:text-5xl text-white tabular-nums">{bar.value}%</span>
        </div>
        <div className="h-4 md:h-6 bg-black/40 border border-white/10 rounded-full overflow-hidden"
          role="progressbar" aria-label={bar.label} aria-valuenow={bar.value} aria-valuemin={0} aria-valuemax={100}>
          <motion.div initial={{ width: 0 }} animate={{ width: Math.max(0, Math.min(bar.value, 100)) + '%' }}
            transition={{ duration: 1, delay: i * 0.13 }} className={'h-full rounded-full ' + (i % 2 ? 'bg-white/75' : color)} />
        </div>
        <p className="text-xs text-zinc-400">{bar.note}</p>
      </div>
    ))}
  </div>;
}

function DataRings({ bars, color }: { bars: NonNullable<StoryScene['bars']>; color: string }) {
  const palette = ['#a78bfa', '#38bdf8', '#fbbf24', '#fb7185', '#34d399', '#e4e4e7'];
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-7">
    {bars.slice(0, 6).map((bar, i) => {
      const n = Math.max(0, Math.min(100, bar.value));
      const circumference = 2 * Math.PI * 52;
      return <div key={bar.label + i} className="rounded-[2rem] bg-black/20 border border-white/10 p-4 text-center flex flex-col items-center gap-1">
        <div className="relative w-32 h-32 md:w-44 md:h-44">
          <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="64" cy="64" r="52" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="11" />
            <motion.circle cx="64" cy="64" r="52" fill="none" stroke={palette[i % palette.length]} strokeWidth="11"
              strokeLinecap="round" strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference * (1 - n / 100) }}
              transition={{ duration: 1, ease: 'easeOut' }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white font-black text-3xl md:text-4xl tabular-nums">{Math.round(n)}%</span>
          </div>
        </div>
        <p className="font-black text-white text-sm md:text-base">{bar.label}</p>
        <p className="text-xs text-zinc-400">{bar.note}</p>
      </div>;
    })}
  </div>;
}

function DataTiles({ bars, color }: { bars: NonNullable<StoryScene['bars']>; color: string }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    {bars.slice(0, 6).map((bar, i) => (
      <div key={bar.label + i} className="relative overflow-hidden rounded-3xl bg-white/[.065] p-6 md:p-8 border border-white/10">
        <div className={'absolute left-0 top-0 w-1 h-full ' + color} />
        <p className="text-zinc-300 text-xs md:text-sm font-bold uppercase tracking-wider">{bar.label}</p>
        <p className="text-white text-6xl md:text-7xl font-black tracking-tighter tabular-nums mt-4">{bar.value}<span className="text-2xl opacity-60">%</span></p>
        <p className="text-sm text-zinc-400 mt-2">{bar.note}</p>
      </div>
    ))}
  </div>;
}

function TimelineFilm({ beats, color }: { beats: NonNullable<StoryScene['beats']>; color: string }) {
  return <div className="relative grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
    {beats.map((beat, index) => (
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.06 }} key={beat.label + index}
        className="relative bg-black/35 border border-white/10 rounded-2xl p-5 md:p-6 space-y-2 overflow-hidden">
        <div className={'absolute top-0 left-0 h-1 w-16 ' + color} />
        <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">{beat.label}</p>
        <p className="text-white font-black text-xl lg:text-2xl tracking-tight">{beat.title}</p>
        <p className="text-zinc-400 text-sm">{beat.detail}</p>
      </motion.div>
    ))}
  </div>;
}

function CopyBlock({ scene, large = false, center = false }: { scene: StoryScene; large?: boolean; center?: boolean }) {
  return <div className={'space-y-5 ' + (center ? 'text-center mx-auto' : '')}>
    <h2 className={'text-white font-black tracking-[-0.055em] leading-[1.02] break-words ' +
      (large ? 'text-5xl sm:text-6xl lg:text-8xl' : 'text-4xl sm:text-5xl lg:text-6xl')}>{scene.title}</h2>
    <div className={'text-zinc-100/85 leading-relaxed space-y-3 max-w-3xl ' + (center ? 'mx-auto' : '') +
      (large ? ' text-lg md:text-xl' : ' text-base md:text-xl')}>
      {scene.body.split(/\n\s*\n/).filter(Boolean).map((part, i) => <p className="whitespace-pre-line" key={i}>{part}</p>)}
    </div>
    {scene.detail && <p className="text-xs sm:text-sm text-white/55 max-w-2xl">{scene.detail}</p>}
  </div>;
}

function StorySlide({ scene, number, total, onDeepDive, coverArtUrl, sceneArtUrl }: {
  scene: StoryScene; number: number; total: number; onDeepDive: () => void;
  coverArtUrl?: string | null;
  sceneArtUrl?: string;
}) {
  const dynamic = scene.composition ? safeDynamicScene(scene.composition, scene) : null;
  // A concluding tableau is an image-led epilogue, never a row of media cards.
  // All other narrative scenes also get one full-bleed original background,
  // even if an older Visual Director chose typography or a split cover layout.
  if (scene.kind === 'closing') {
    return <WrappedClosingTableau scene={scene} imageUrl={sceneArtUrl}
      number={number} total={total} onDeepDive={onDeepDive} />;
  }
  const direction = dynamic?.direction || {
    presentation: 'cinematic' as const, textSide: 'left' as const,
    textPosition: 'middle' as const, imageFocus: 'right' as const,
  };
  if (isWrappedInfographicScene(scene)) {
    // Graphic-only stages are the sole exception to the full-art rule. Do
    // not allow an old composed image node to inject a media cover here.
    return <EditorialStorySlide scene={scene}
      direction={{ ...direction, presentation: 'data' }}
      number={number} total={total} onDeepDive={onDeepDive} />;
  }
  return <EditorialStorySlide scene={scene}
    direction={{ ...direction, presentation: 'cinematic' }}
    imageUrl={scene.kind === 'opening' ? coverArtUrl : sceneArtUrl}
    number={number} total={total} onDeepDive={onDeepDive} />;
  if (dynamic) {
    return <DynamicStorySlide scene={scene} composition={dynamic} number={number} total={total}
      coverArtUrl={coverArtUrl} sceneArtUrl={sceneArtUrl} onDeepDive={onDeepDive} />;
  }
  // A failed Visual Director pass must not turn a verified analytical story
  // back into generic bar templates. Render its safe data treatment directly.
  if (scene.analytic && (scene.editorialJob === 'data-reveal' ||
      scene.design?.layout === 'infographic')) {
    return <EditorialStorySlide scene={scene}
      direction={{ presentation: 'data', textSide: 'left', textPosition: 'middle',
        imageFocus: 'right', dataTreatment: scene.analytic.kind }}
      number={number} total={total} onDeepDive={onDeepDive} />;
  }
  const layout = scene.design?.layout || fallbackLayout[scene.kind];
  const isWrappedTitleArt = scene.kind === 'opening' && !!coverArtUrl;
  const color = PALETTES[scene.design?.palette || 'violet'];
  const align = scene.design?.align === 'center';
  const covers = (scene.artworks?.length ? scene.artworks : scene.media ? [scene.media] : [])
    .filter(m => !!m.cover);
  const primary = covers[0] || scene.media;
  const visual: StoryVisual = scene.design?.visual || 'auto';
  const infographic = !!scene.bars?.length;
  const timeline = !!scene.beats?.length;
  const quote = !!scene.quote;
  const chosenLayout: StoryLayout =
    isWrappedTitleArt || sceneArtUrl ? 'cover-hero' :
    layout === 'cover-wall' && covers.length < 2 ? (primary ? 'split-feature' : 'type-poster') :
    layout === 'cover-hero' && !primary?.cover ? 'type-poster' :
    layout === 'quote-poster' && !quote ? 'editorial' :
    layout === 'timeline-film' && !timeline ? 'editorial' :
    layout === 'infographic' && !infographic && !timeline ? 'editorial' : layout;
  const showCharts = infographic && (chosenLayout === 'infographic' || ['bars','rings','tiles'].includes(visual));
  const showTimeline = timeline && (chosenLayout === 'timeline-film' || visual === 'timeline');
  const showQuote = quote && (chosenLayout === 'quote-poster' || visual === 'quote');
  const extras = <>
    {showCharts && (visual === 'rings' ? <DataRings bars={scene.bars!} color={color.line} /> :
      visual === 'tiles' ? <DataTiles bars={scene.bars!} color={color.line} /> :
      visual === 'bars' || scene.bars!.length > 3 ? <DataBars bars={scene.bars!} color={color.line} /> :
      <DataRings bars={scene.bars!} color={color.line} />)}
    {showTimeline && <TimelineFilm beats={scene.beats!} color={color.line} />}
    {showQuote && <blockquote className="relative border-l-4 border-white/70 pl-5 md:pl-8 text-2xl sm:text-3xl lg:text-5xl font-semibold tracking-tight italic leading-snug text-white max-w-4xl">
      <Quote className="w-8 h-8 text-white/40 mb-5" />“{scene.quote}”
    </blockquote>}
  </>;

  return <motion.article key={scene.id} initial={{ opacity: 0, scale: .97, y: 15 }}
    animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .98, y: -12 }}
    transition={{ duration: .42, ease: [0.22, 1, 0.36, 1] }}
    className={'relative isolate overflow-hidden rounded-[2rem] md:rounded-[2.75rem] border ' + color.border +
      ' bg-gradient-to-br ' + color.background + ' shadow-2xl ' + color.shadow}>
    <div className={'absolute -top-24 -right-24 w-[70%] h-[80%] rounded-full blur-[100px] pointer-events-none ' + color.glow} />
    {isWrappedTitleArt && <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <img src={coverArtUrl!} alt="" loading="eager" className="w-full h-full object-cover object-center opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/75 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
    </div>}
    {sceneArtUrl && <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <img src={sceneArtUrl} alt="" loading="eager" className="w-full h-full object-cover opacity-85" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-black/15" />
    </div>}
    {chosenLayout === 'cover-hero' && !isWrappedTitleArt && !sceneArtUrl && primary?.cover && <>
      <img src={primary.cover} alt="" aria-hidden="true" loading="eager" referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover blur-[95px] opacity-25 scale-125" />
      <div className="absolute right-5 top-14 w-[28%] aspect-[2/3] sm:hidden opacity-85"><img src={primary.cover} alt="" aria-hidden="true" referrerPolicy="no-referrer" className="w-full h-full object-contain" /></div>
      <div className="absolute inset-y-0 right-0 w-[70%] hidden sm:block overflow-hidden">
        <img src={primary.cover} alt="" aria-hidden="true" loading="eager" referrerPolicy="no-referrer"
          className="absolute right-0 top-0 h-full w-full object-contain object-right opacity-90 drop-shadow-2xl" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/75 to-black/10" />
    </>}
    <div className="relative z-10 min-h-[530px] md:min-h-[620px] p-6 sm:p-10 lg:p-14 xl:p-16 flex flex-col">
      <div className={'flex items-center gap-3 text-[10px] sm:text-xs uppercase tracking-[.24em] font-black ' + color.accent}>
        <span className={'w-6 h-1 rounded-full ' + color.line} />{scene.eyebrow}
        <span className="ml-auto text-white/50 tracking-widest font-mono">{String(number).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
      </div>
      <div className="flex-1 flex flex-col justify-center py-8 md:py-12">
        {chosenLayout === 'cover-hero' && <div className="relative z-10 max-w-full sm:max-w-[65%] lg:max-w-[65%]">
          <CopyBlock scene={scene} large />
          {(showCharts || showTimeline || showQuote) && <div className="pt-6">{extras}</div>}
        </div>}
        {chosenLayout === 'split-feature' && <div className="grid md:grid-cols-[minmax(0,1.25fr)_minmax(0,.75fr)] gap-8 lg:gap-14 items-center">
          <div className="space-y-8"><CopyBlock scene={scene} />{extras}</div>
          {primary && <Poster media={primary} eager className="aspect-[2/3] w-[min(72%,240px)] md:w-full md:max-w-[330px] mx-auto rotate-2" />}
        </div>}
        {chosenLayout === 'cover-wall' && <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-10 items-center">
          <CopyBlock scene={scene}/><ArtworkWall images={covers}/>
        </div>}
        {chosenLayout === 'infographic' && <div className="space-y-10">
          <div className="max-w-4xl"><CopyBlock scene={scene}/></div>
          <div className="p-4 md:p-8 rounded-[2rem] bg-black/20 border border-white/10">{extras}</div>
        </div>}
        {chosenLayout === 'quote-poster' && <div className="space-y-10">
          <div className="max-w-3xl"><CopyBlock scene={scene}/></div>
          {extras}
          {primary && <div className="flex justify-end"><span className="text-white/65 text-xs uppercase tracking-wider">In your own words · {primary.title}</span></div>}
        </div>}
        {chosenLayout === 'timeline-film' && <div className="space-y-9"><CopyBlock scene={scene}/>{extras}</div>}
        {chosenLayout === 'type-poster' && <div className={'space-y-10 ' + (align ? 'text-center' : '')}>
          <CopyBlock scene={scene} large center={align} />
          <div className={align ? 'max-w-4xl mx-auto' : 'max-w-4xl'}>{extras}</div>
          {covers.length > 1 && <div className="max-w-md mx-auto"><ArtworkWall images={covers} compact /></div>}
        </div>}
        {chosenLayout === 'editorial' && <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.7fr)] gap-10 lg:gap-14 items-center">
          <div className="space-y-8"><CopyBlock scene={scene}/>{extras}</div>
          {primary && <Poster media={primary} className="aspect-[2/3] max-w-[250px] lg:max-w-[340px] w-full mx-auto" />}
        </div>}
      </div>
      <div className="flex justify-between items-center gap-3 text-[10px] uppercase tracking-widest text-white/45">
        <span>{scene.sourceLabel || (scene.kind === 'opening' ? 'A story according to your logs' : '')}</span>
        {scene.kind === 'closing' && <button onClick={onDeepDive} className="text-white flex items-center gap-2 hover:text-violet-200">
          Full Deep Dive <ArrowRight className="w-4 h-4" />
        </button>}
      </div>
    </div>
  </motion.article>;
}

function AchievementFinale({ achievements, onDeepDive, imageUrl }: {
  achievements: GeneratedAchievement[]; onDeepDive: () => void; imageUrl?: string;
}) {
  return <motion.section key="achievement-finale" initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }} transition={{ duration: .4 }}
    className="relative overflow-hidden rounded-[2.5rem] border border-amber-400/25 bg-gradient-to-br from-[#2a1706] via-[#130e10] to-black p-6 sm:p-10 lg:p-14 shadow-2xl">
    {imageUrl && <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <img src={imageUrl} alt="" loading="eager" className="absolute inset-0 h-full w-full object-cover opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/65 to-black/90" />
    </div>}
    <div className="absolute -top-28 left-[20%] w-3/5 h-64 rounded-full bg-amber-500/15 blur-[110px] pointer-events-none" />
    <div className="relative space-y-8">
      <div className="flex items-center gap-3 text-amber-300 text-xs font-black uppercase tracking-[.24em]">
        <ShieldAlert className="w-5 h-5" /> FINAL SYSTEM VERDICT
      </div>
      <div className="space-y-3">
        <h2 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-[-.06em] leading-[1.04] text-white">
          {achievements.length ? 'Achievements Unlocked.' : 'The System Is Silent.'}
        </h2>
        <p className="text-zinc-300 max-w-2xl text-lg">
          {achievements.length
            ? 'You have reached the end of this Wrapped. The dungeon has reviewed your actions. Its verdict is, unfortunately, binding.'
            : 'No dungeon achievements were recorded for this period. Even the bureaucracy needs evidence.'}
        </p>
      </div>
      {!!achievements.length && <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {achievements.map((a, i) => <AchievementCard key={a.timeframe + a.timeId + a.position} achievement={a} index={i} />)}
      </div>}
      <div className="flex flex-wrap gap-3 pt-4 border-t border-amber-400/15">
        <a href="/achievements" className="flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-400/10 text-amber-200 border border-amber-400/20 text-sm font-bold hover:bg-amber-400/20">
          <Trophy className="w-4 h-4" /> Achievement archive
        </a>
        <button onClick={onDeepDive} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-black font-black text-sm hover:bg-amber-50">
          Go to Deep Dive <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  </motion.section>;
}

/** An AI-directed scene sequence with an independently persisted achievement epilogue. */
export function StoryMode({ scenes, timeframe, timeId, achievements = [], onDeepDive, coverArtUrl, coverArtStatus, sceneArt = {}, sceneArtStatus }: {
  scenes: StoryScene[];
  timeframe: 'week' | 'month' | 'year';
  timeId: string;
  achievements?: GeneratedAchievement[];
  coverArtUrl?: string | null;
  coverArtStatus?: 'pending' | 'generating' | 'done' | 'failed' | null;
  sceneArt?: Record<string, string>;
  sceneArtStatus?: 'pending' | 'generating' | 'done' | 'failed' | null;
  onDeepDive: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const touchStart = useRef<number | null>(null);
  const total = scenes.length + 1; // A true epilogue, ALWAYS after the AI's closing scene.
  const current = scenes[index] || null;
  const finale = index === scenes.length;
  useEffect(() => { setIndex(0); setCopied(false); }, [timeframe, timeId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || target?.closest('button,input,textarea,select,[contenteditable]')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); setIndex(i => Math.min(i + 1, total - 1)); setCopied(false); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); setCopied(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);
  if (!scenes.length) return null;
  const copyScene = async () => {
    const text = current
      ? [current.title, current.body, current.quote, current.detail].filter(Boolean).join('\n\n')
      : achievements.map(a => [a.title, a.description, 'REWARD: ' + a.reward].join('\n')).join('\n\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); }
    catch { setCopied(false); }
  };
  return <section className="max-w-7xl mx-auto pb-12 space-y-5" aria-label={'Your ' + timeframe + ' Wrapped story'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-black text-violet-200 tracking-[.2em] uppercase">FauxLore Wrapped · {timeId}</p>
        <p className="text-xs text-zinc-500 mt-1">{scenes.length} AI-directed scenes · Dungeon verdict finale</p>
        {(coverArtStatus === 'pending' || coverArtStatus === 'generating' ||
          sceneArtStatus === 'pending' || sceneArtStatus === 'generating') && (
          <p role="status" className="text-xs text-violet-200/80 mt-1">Illustrating this Wrapped…</p>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={copyScene} aria-label="Copy current scene"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold hover:bg-white/10">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button onClick={onDeepDive}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold hover:bg-white/10">
          <BookOpen className="w-4 h-4" /> Deep Dive
        </button>
      </div>
    </div>
    <div className="flex gap-1.5" role="group" aria-label="Navigate Wrapped scenes">
      {[...scenes, { id: 'finale', title: 'Achievements', kind: 'achievement' as const }].map((scene, i) =>
        <button key={scene.id} onClick={() => { setIndex(i); setCopied(false); }}
          title={scene.title} aria-label={'Go to ' + (i === scenes.length ? 'achievement finale' : 'scene ' + (i + 1) + ': ' + scene.title)}
          aria-current={i === index ? 'step' : undefined}
          className={'h-2 rounded-full flex-1 transition-colors ' +
            (i === index ? (finale ? 'bg-amber-400' : 'bg-violet-400') :
              i < index ? 'bg-violet-400/40 hover:bg-violet-300/60' :
                i === scenes.length ? 'bg-amber-500/25 hover:bg-amber-400/60' : 'bg-white/15 hover:bg-white/30')} />
      )}
    </div>
    <div onTouchStart={e => { touchStart.current = e.changedTouches[0]?.screenX ?? null; }}
      onTouchEnd={e => {
        if (touchStart.current === null) return;
        const delta = (e.changedTouches[0]?.screenX ?? touchStart.current) - touchStart.current;
        touchStart.current = null;
        if (Math.abs(delta) >= 65) { setIndex(i => Math.max(0, Math.min(total - 1, i + (delta < 0 ? 1 : -1)))); setCopied(false); }
      }}>
      <AnimatePresence mode="wait">
        {current ? <StorySlide key={current.id} scene={current} number={index + 1} total={total}
          onDeepDive={onDeepDive} coverArtUrl={coverArtUrl} sceneArtUrl={sceneArt[current.id]} /> :
          <AchievementFinale key="finale" achievements={achievements} onDeepDive={onDeepDive}
            imageUrl={sceneArt['achievement-finale']} />}
      </AnimatePresence>
    </div>
    <div className="flex items-center justify-between gap-3">
      <button onClick={() => { setIndex(i => Math.max(0, i - 1)); setCopied(false); }} disabled={index === 0}
        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-sm disabled:opacity-25 hover:bg-white/10">
        <ChevronLeft className="w-4 h-4" /> Previous
      </button>
      <span className="hidden sm:block text-xs text-zinc-500">Scene {index + 1} of {total} · Arrow keys or swipe</span>
      {index === total - 1 ?
        <button onClick={onDeepDive} className="flex gap-2 items-center px-5 py-3 rounded-xl bg-amber-400/20 border border-amber-400/30 text-amber-100 font-bold text-sm hover:bg-amber-400/30">
          Full analysis <ArrowRight className="w-4 h-4" />
        </button> :
        <button onClick={() => { setIndex(i => Math.min(total - 1, i + 1)); setCopied(false); }}
          className={'flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm border ' +
            (index === scenes.length - 1 ? 'bg-amber-400/20 text-amber-100 border-amber-400/30 hover:bg-amber-400/30' :
              'bg-violet-400/20 text-violet-100 border-violet-400/30 hover:bg-violet-400/30')}>
          {index === scenes.length - 1 ? <><Trophy className="w-4 h-4" /> The verdict</> : <>Next <ChevronRight className="w-4 h-4" /></>}
        </button>}
    </div>
  </section>;
}
