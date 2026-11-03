import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Copy,
  ShieldAlert, Trophy
} from 'lucide-react';
import { AchievementCard } from './AchievementCard';
import { EditorialStorySlide } from './EditorialStorySlide';
import { WrappedClosingTableau } from './WrappedClosingTableau';
import { isWrappedInfographicScene } from '../lib/wrappedSceneArt';
import { safeDynamicScene } from '../lib/dynamicScenes';
import type { GeneratedAchievement } from '../lib/generatedAchievements';
import type { StoryScene } from '../lib/storyDiscovery';

/** One rendering contract: story images are always full bleed. Only genuine
 * data slides remain text/graph-only; the closing is a unique image epilogue.
 * No original media cover cards appear in Story Mode.
 */
function StorySlide({ scene, number, total, onDeepDive, coverArtUrl, sceneArtUrl }: {
  scene: StoryScene;
  number: number;
  total: number;
  onDeepDive: () => void;
  coverArtUrl?: string | null;
  sceneArtUrl?: string;
}) {
  const dynamic = scene.composition ? safeDynamicScene(scene.composition, scene) : null;
  if (scene.kind === 'closing') {
    return <WrappedClosingTableau scene={scene} imageUrl={sceneArtUrl}
      number={number} total={total} onDeepDive={onDeepDive} />;
  }
  const direction = dynamic?.direction || {
    presentation: 'cinematic' as const, textSide: 'left' as const,
    textPosition: 'middle' as const, imageFocus: 'right' as const,
  };
  const isData = isWrappedInfographicScene(scene);
  return <EditorialStorySlide scene={scene}
    direction={{ ...direction, presentation: isData ? 'data' : 'cinematic' }}
    imageUrl={isData ? undefined : scene.kind === 'opening' ? coverArtUrl : sceneArtUrl}
    number={number} total={total} onDeepDive={onDeepDive} />;
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
