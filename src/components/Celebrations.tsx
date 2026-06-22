import { useEffect, useRef, useState } from 'react';
import Confetti from 'react-confetti';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { useMediaContext } from '../contexts/MediaContext';
import { useToast } from '../contexts/ToastContext';
import { calculateStreak } from '../lib/streak';

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 1000];

/**
 * Global RPG celebration layer: a full-screen flourish on level-up, plus toasts
 * for streak milestones and freshly-defeated World Bosses. Gated on isLoading so
 * nothing fires during the initial data load (only real, in-session changes).
 */
export function Celebrations() {
  const { rpgState, worldBosses, logs, aiTextCache, isLoading } = useMediaContext();
  const toast = useToast();

  const [levelUp, setLevelUp] = useState<{ level: number; title: string } | null>(null);
  const [size, setSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  const prevLevel = useRef<number | null>(null);
  const prevStreak = useRef<number | null>(null);
  const seenDefeated = useRef<Set<string> | null>(null);

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Level-up flourish
  useEffect(() => {
    if (isLoading) return;
    const lvl = rpgState.level;
    if (prevLevel.current === null) { prevLevel.current = lvl; return; }
    if (lvl > prevLevel.current) {
      setLevelUp({ level: lvl, title: aiTextCache[`rpg_title_${lvl}`] || rpgState.className });
    }
    prevLevel.current = lvl;
  }, [isLoading, rpgState.level, rpgState.className, aiTextCache]);

  // Streak milestones
  useEffect(() => {
    if (isLoading) return;
    const streak = calculateStreak(logs);
    if (prevStreak.current === null) { prevStreak.current = streak; return; }
    if (streak > prevStreak.current) {
      const crossed = STREAK_MILESTONES.filter((m) => m > (prevStreak.current as number) && m <= streak);
      if (crossed.length) toast.success(`🔥 ${Math.max(...crossed)}-day streak! Keep the fire burning.`);
    }
    prevStreak.current = streak;
  }, [isLoading, logs, toast]);

  // Freshly defeated bosses
  useEffect(() => {
    if (isLoading) return;
    const defeated = worldBosses.filter((b) => b.status === 'Defeated');
    if (seenDefeated.current === null) { seenDefeated.current = new Set(defeated.map((b) => b.id)); return; }
    defeated.filter((b) => !(seenDefeated.current as Set<string>).has(b.id)).forEach((b) => toast.success(`⚔️ ${b.name} defeated!`));
    seenDefeated.current = new Set(defeated.map((b) => b.id));
  }, [isLoading, worldBosses, toast]);

  return (
    <AnimatePresence>
      {levelUp && (
        <motion.div
          key="levelup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[250] flex items-center justify-center bg-zinc-950/85 backdrop-blur-md p-6 overflow-hidden"
          onClick={() => setLevelUp(null)}
        >
          <Confetti width={size.width} height={size.height} recycle={false} numberOfPieces={420} gravity={0.18} className="z-0" />
          <div className="absolute top-1/2 left-1/2 w-[70vw] h-[70vw] max-w-[700px] max-h-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px] bg-amber-500/20 pointer-events-none" />
          <motion.div
            initial={{ scale: 0.6, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            className="relative z-10 text-center max-w-md"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11px] font-black uppercase tracking-[0.3em] mb-6">
              <Sparkles className="w-4 h-4" /> Level Up
            </div>
            <div className="text-7xl md:text-8xl font-black text-white tracking-tighter leading-none mb-3">Lv {levelUp.level}</div>
            <div className="text-2xl md:text-3xl font-black bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent mb-8">{levelUp.title}</div>
            <button onClick={() => setLevelUp(null)} className="px-8 py-3 rounded-2xl bg-white text-black font-black text-sm hover:bg-zinc-200 transition-colors active:scale-95">
              Onward
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
