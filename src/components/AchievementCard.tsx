import React from 'react';
import { motion } from 'motion/react';
import { Gift, Trophy } from 'lucide-react';
import type { AchievementDraft } from '../lib/generatedAchievements';

export function AchievementCard({ achievement, index = 0, fresh = false }: {
  achievement: AchievementDraft; index?: number; fresh?: boolean;
}) {
  return (
    <motion.article initial={fresh ? { opacity: 0, y: 24, scale: 0.96 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay: fresh ? index * 0.12 : 0 }}
      className="relative overflow-hidden rounded-[1.6rem] border border-amber-500/25 bg-gradient-to-br from-amber-950/20 via-zinc-950 to-black p-6 sm:p-8 shadow-xl">
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-amber-500/10 blur-[55px]" />
      <div className="relative flex items-center gap-2 text-[10px] font-black tracking-[0.22em] uppercase text-amber-400 mb-5">
        <Trophy className="h-4 w-4" /> NEW ACHIEVEMENT!
      </div>
      <h3 className="relative text-2xl sm:text-3xl font-black text-white tracking-tight mb-4">{achievement.title}</h3>
      <div className="relative space-y-3">
        {achievement.description.split(/\n\s*\n/).filter(Boolean).map((paragraph, i) => (
          <p key={i} className="text-sm sm:text-base text-zinc-300 leading-relaxed whitespace-pre-line">{paragraph}</p>
        ))}
      </div>
      <div className="relative mt-6 border-t border-amber-500/20 pt-5 flex gap-3 items-start">
        <Gift className="h-5 w-5 mt-0.5 shrink-0 text-amber-400" />
        <div>
          <div className="text-[10px] uppercase tracking-widest font-black text-amber-400 mb-1">Reward</div>
          <p className="text-sm sm:text-base text-zinc-200 leading-relaxed whitespace-pre-line">{achievement.reward}</p>
        </div>
      </div>
    </motion.article>
  );
}
