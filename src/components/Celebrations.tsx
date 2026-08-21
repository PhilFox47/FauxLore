import { useEffect, useRef, useState } from 'react';
import Confetti from 'react-confetti';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Loader2 } from 'lucide-react';
import { useMediaContext } from '../contexts/MediaContext';
import { useToast } from '../contexts/ToastContext';
import { calculateStreak } from '../lib/streak';
import { MEDIA_TYPES, MEDIA_HEX } from '../types/schema';

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 1000];

/** How long the number gets the stage to itself before the title can appear. */
const REVEAL_DELAY_MS = 2200;
/** After this, the overlay stops waiting on the model and shows the fallback. */
const TITLE_TIMEOUT_MS = 20000;

interface LevelUpEvent {
  id: string;
  level: number;
  /** Absent for the overall rank. */
  mediaType?: string;
  /** Shown if the alias cannot be written — never leave the user staring at nothing. */
  fallback: string;
}

/**
 * Global RPG celebration layer: a full-screen flourish on level-up, plus toasts
 * for streak milestones and freshly-defeated World Bosses. Gated on isLoading so
 * nothing fires during the initial data load (only real, in-session changes).
 */
export function Celebrations() {
  const { rpgState, worldBosses, logs, media, isLoading, ensureLevelTitle } = useMediaContext();
  const toast = useToast();

  /**
   * Level-ups queue rather than overwrite. Finishing a long session can cross an
   * overall level and a format level at the same moment, and the second one is
   * not worth less for having arrived together.
   */
  const [queue, setQueue] = useState<LevelUpEvent[]>([]);
  const current = queue[0] || null;
  const [title, setTitle] = useState<string | null>(null);
  const [readyToReveal, setReadyToReveal] = useState(false);
  const [size, setSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  const prevLevel = useRef<number | null>(null);
  const prevMediaLevels = useRef<Record<string, number> | null>(null);
  const prevStreak = useRef<number | null>(null);
  const seenDefeated = useRef<Set<string> | null>(null);
  const seenUpdates = useRef<Set<string> | null>(null);

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Level-ups: the overall rank and every per-format rank.
  useEffect(() => {
    if (isLoading) return;
    const events: LevelUpEvent[] = [];

    const lvl = rpgState.level;
    if (prevLevel.current !== null && lvl > prevLevel.current) {
      events.push({ id: `main-${lvl}`, level: lvl, fallback: rpgState.className });
    }
    prevLevel.current = lvl;

    const levels: Record<string, number> = {};
    MEDIA_TYPES.forEach((t) => { levels[t] = rpgState.mediaLevels?.[t]?.level ?? 1; });
    if (prevMediaLevels.current !== null) {
      MEDIA_TYPES.forEach((t) => {
        const before = prevMediaLevels.current![t];
        if (before !== undefined && levels[t] > before) {
          events.push({ id: `${t}-${levels[t]}`, level: levels[t], mediaType: t, fallback: rpgState.mediaLevels?.[t]?.title || t });
        }
      });
    }
    prevMediaLevels.current = levels;

    if (events.length) {
      setQueue((q) => {
        const seen = new Set(q.map((e) => e.id));
        return [...q, ...events.filter((e) => !seen.has(e.id))];
      });
    }
  }, [isLoading, rpgState]);

  /**
   * The reveal is staged on purpose: the banner and the number land immediately,
   * the title is written while that animation plays, and it appears when both
   * the generation and a minimum beat have passed. Showing a placeholder and
   * swapping it a second later reads as a glitch; a short, deliberate pause
   * reads as a drumroll.
   */
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setTitle(null);
    setReadyToReveal(false);

    const beat = setTimeout(() => { if (!cancelled) setReadyToReveal(true); }, REVEAL_DELAY_MS);
    ensureLevelTitle({ level: current.level, mediaType: current.mediaType })
      .then((t) => { if (!cancelled) setTitle((t || '').trim() || current.fallback); })
      .catch(() => { if (!cancelled) setTitle(current.fallback); });

    // However slow the model is, the overlay does not hang on it forever.
    const bail = setTimeout(() => { if (!cancelled) setTitle((prev) => prev ?? current.fallback); }, TITLE_TIMEOUT_MS);
    return () => { cancelled = true; clearTimeout(beat); clearTimeout(bail); };
  }, [current, ensureLevelTitle]);

  const dismiss = () => setQueue((q) => q.slice(1));

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

  // New upstream versions for things you're actively playing or have shelved.
  //
  // Only announces a flag that appears WHILE the app is open. `updateAvailable`
  // lives in the database until the update is acknowledged, but this ref does
  // not survive a reload — so announcing the pending set on startup re-toasted
  // every outstanding update on every single load, and marking the notification
  // read did nothing because these toasts never read the notifications table.
  //
  // The backlog is not lost: each of these already writes a persistent
  // notification, which is what the bell and the phone are for. A toast is for
  // something that just happened in front of you.
  useEffect(() => {
    if (isLoading) return;
    const pending = media.filter(
      (m) => m.updateAvailable && (m.status === 'Active' || m.status === 'On Hold' || m.status === 'Caught Up'),
    );
    if (seenUpdates.current === null) {
      seenUpdates.current = new Set(pending.map((m) => m.id));
      return;
    }
    pending
      .filter((m) => !(seenUpdates.current as Set<string>).has(m.id))
      .forEach((m) =>
        toast.info(
          `\u2b06\ufe0f Update available for ${m.title}${m.sourceVersion ? ` (${m.sourceVersion})` : ''}`,
        ),
      );
    seenUpdates.current = new Set(pending.map((m) => m.id));
  }, [isLoading, media, toast]);

  const accent = current?.mediaType ? (MEDIA_HEX[current.mediaType as keyof typeof MEDIA_HEX]?.base || '#f59e0b') : '#f59e0b';
  const revealed = !!title && readyToReveal;

  return (
    <AnimatePresence mode="wait">
      {current && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[250] flex items-center justify-center bg-zinc-950/85 backdrop-blur-md p-6 overflow-hidden"
          onClick={dismiss}
        >
          <Confetti width={size.width} height={size.height} recycle={false} numberOfPieces={420} gravity={0.18} className="z-0" />
          <div
            className="absolute top-1/2 left-1/2 w-[70vw] h-[70vw] max-w-[700px] max-h-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px] pointer-events-none"
            style={{ backgroundColor: `${accent}33` }}
          />
          <motion.div
            initial={{ scale: 0.6, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            className="relative z-10 text-center max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[11px] font-black uppercase tracking-[0.3em] mb-6"
              style={{ borderColor: `${accent}4d`, backgroundColor: `${accent}1a`, color: accent }}
            >
              <Sparkles className="w-4 h-4" />
              {current.mediaType ? `${current.mediaType} Level Up` : 'Level Up'}
            </div>

            <div className="text-lg md:text-xl font-bold text-zinc-300 mb-2">
              Congratulations — you reached
            </div>
            <div className="text-6xl md:text-7xl font-black text-white tracking-tighter leading-none">
              {current.mediaType ? `${current.mediaType} ` : ''}Lv {current.level}
            </div>

            {/* The title slot holds its height so the reveal does not shove the
                rest of the card around when it arrives. */}
            <div className="min-h-[4.5rem] flex items-center justify-center mt-6 mb-8">
              <AnimatePresence mode="wait">
                {revealed ? (
                  <motion.div
                    key="title"
                    initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full"
                  >
                    <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black mb-2">
                      {current.mediaType ? `Your ${current.mediaType.toLowerCase()} alias` : 'You are now known as'}
                    </div>
                    <div
                      className="text-2xl md:text-3xl font-black bg-clip-text text-transparent"
                      style={{ backgroundImage: `linear-gradient(90deg, ${accent}, #fbbf24)` }}
                    >
                      {title}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="pending"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2.5 text-zinc-500"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-[11px] uppercase tracking-[0.25em] font-black">Earning your new title…</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={dismiss}
              className="px-8 py-3 rounded-2xl bg-white text-black font-black text-sm hover:bg-zinc-200 transition-colors active:scale-95"
            >
              {queue.length > 1 ? `Onward (${queue.length - 1} more)` : 'Onward'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
