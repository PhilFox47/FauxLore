import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Trophy } from 'lucide-react';
import { AchievementCard } from './AchievementCard';
import type { AchievementDraft } from '../lib/generatedAchievements';

/** A deliberate unlock moment after successful recap achievement generation. */
export function AchievementReveal({ achievements, onClose }: {
  achievements: AchievementDraft[];
  onClose: () => void;
}) {
  const open = achievements.length > 0;
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-3 sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div role="dialog" aria-modal="true" aria-label="New achievements unlocked"
            initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3 }}
            className="max-w-5xl w-full max-h-[92vh] overflow-y-auto rounded-[2rem] border border-amber-500/30 bg-zinc-950 p-5 sm:p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex gap-3 items-center">
                <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30">
                  <Trophy className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-black tracking-[0.2em] uppercase text-amber-400">Dungeon System Notification</p>
                  <h2 className="text-xl sm:text-3xl font-black text-white">Achievement Unlocked!</h2>
                </div>
              </div>
              <button autoFocus onClick={onClose} aria-label="Close achievement reveal"
                className="p-2 rounded-xl bg-white/10 text-zinc-300 hover:text-white hover:bg-white/20 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {achievements.map((a, i) => (
                <AchievementCard key={i} achievement={a} index={i} fresh />
              ))}
            </div>
            <p className="text-zinc-500 text-center text-xs mt-6">
              These completely imaginary rewards have been added to your archive. Try not to spend them all at once.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
