import React, { useMemo, useState } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { calculateRPGState } from '../lib/rpgSystem';
import { evaluateAchievements, AchievementCategory, AchievementRarity } from '../lib/achievements';
import { Trophy, Lock, Swords, Gem, Clock, Heart, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

const RARITY: Record<AchievementRarity, { text: string; border: string; bg: string; glow: string }> = {
  Common: { text: 'text-zinc-300', border: 'border-zinc-500/30', bg: 'bg-zinc-500/10', glow: 'bg-zinc-500/10' },
  Rare: { text: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10', glow: 'bg-blue-500/20' },
  Epic: { text: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/10', glow: 'bg-purple-500/20' },
  Legendary: { text: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10', glow: 'bg-amber-500/20' },
  Mythic: { text: 'text-pink-400', border: 'border-pink-500/40', bg: 'bg-pink-500/10', glow: 'bg-pink-500/30' },
};

const CATEGORY_ICON: Record<AchievementCategory, React.ReactNode> = {
  Combat: <Swords className="w-5 h-5" />,
  Mastery: <ShieldCheck className="w-5 h-5" />,
  Collection: <Gem className="w-5 h-5" />,
  Taste: <Heart className="w-5 h-5" />,
  Habits: <Clock className="w-5 h-5" />,
  Completion: <CheckCircle2 className="w-5 h-5" />,
};

const CATEGORIES: AchievementCategory[] = ['Combat', 'Mastery', 'Collection', 'Taste', 'Habits', 'Completion'];

export function Achievements() {
  const { media, logs, settings, artifacts, worldBosses } = useMediaContext();
  const [hideLocked, setHideLocked] = useState(false);
  const [catFilter, setCatFilter] = useState<AchievementCategory | 'All'>('All');

  const evaluated = useMemo(() => {
    const defeated = worldBosses.filter(b => b.status === 'Defeated');
    const rpg = calculateRPGState(media, logs, settings, defeated, artifacts, new Date());
    const weeklyQuests = (rpg.quests || []).filter((q: any) => q.type === 'weekly');
    const weeklyQuestsCleared = weeklyQuests.length > 0 && weeklyQuests.every((q: any) => q.isCompleted);
    return evaluateAchievements({ media, logs, artifacts, worldBosses, rpgLevel: rpg.level, weeklyQuestsCleared });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, logs, settings, artifacts, worldBosses]);

  const unlockedCount = evaluated.filter(a => a.unlocked).length;
  const total = evaluated.length;
  const pct = total ? Math.round((unlockedCount / total) * 100) : 0;

  const visible = useMemo(
    () => evaluated
      .filter(a => (catFilter === 'All' || a.category === catFilter) && (!hideLocked || a.unlocked))
      .sort((a, b) => Number(b.unlocked) - Number(a.unlocked)),
    [evaluated, catFilter, hideLocked],
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header / progress */}
      <header className="relative overflow-hidden rounded-[2rem] border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-black to-black p-8 md:p-10">
        <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 blur-[100px] rounded-full -mr-24 -mt-24 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30">
              <Trophy className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">Achievements</h1>
              <p className="text-zinc-400 text-sm mt-1">Real feats — earned by what you accomplish, not just what you log.</p>
            </div>
          </div>
          <div className="md:text-right">
            <div className="text-4xl font-black text-white"><span className="text-amber-400">{unlockedCount}</span> <span className="text-zinc-600">/ {total}</span></div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black mt-1">Unlocked</div>
          </div>
        </div>
        <div className="relative z-10 mt-7">
          <div className="w-full h-2.5 bg-black/60 rounded-full border border-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-right text-[11px] font-black text-amber-500/80 mt-2">{pct}% complete</div>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(['All', ...CATEGORIES] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setCatFilter(cat as AchievementCategory | 'All')}
            className={cn('px-3.5 py-1.5 rounded-full text-xs font-bold transition border flex items-center gap-1.5',
              catFilter === cat ? 'bg-white/10 text-white border-white/20' : 'bg-zinc-800/50 text-zinc-400 border-white/5 hover:text-white')}
          >
            {cat !== 'All' && CATEGORY_ICON[cat as AchievementCategory]}
            {cat}
          </button>
        ))}
        <button
          onClick={() => setHideLocked(v => !v)}
          className={cn('ml-auto px-3.5 py-1.5 rounded-full text-xs font-bold transition border',
            hideLocked ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-zinc-800/50 text-zinc-400 border-white/5 hover:text-white')}
        >
          {hideLocked ? 'Showing unlocked' : 'Hide locked'}
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {visible.map(a => {
          const r = RARITY[a.rarity];
          return (
            <div
              key={a.id}
              className={cn(
                'relative overflow-hidden rounded-3xl border p-6 transition-all',
                a.unlocked ? `${r.border} bg-black` : 'border-white/5 bg-zinc-900/30',
              )}
            >
              {a.unlocked && <div className={cn('absolute -top-12 -right-12 w-32 h-32 blur-3xl rounded-full pointer-events-none', r.glow)} />}
              <div className="relative z-10 flex items-start gap-4">
                <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border',
                  a.unlocked ? `${r.bg} ${r.border} ${r.text}` : 'bg-white/5 border-white/10 text-zinc-600')}>
                  {a.unlocked ? CATEGORY_ICON[a.category] : <Lock className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={cn('font-black text-lg leading-tight', a.unlocked ? 'text-white' : 'text-zinc-500')}>{a.name}</h3>
                  </div>
                  <p className={cn('text-xs leading-snug', a.unlocked ? 'text-zinc-400' : 'text-zinc-600')}>{a.description}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border',
                      a.unlocked ? `${r.text} ${r.bg} ${r.border}` : 'text-zinc-600 border-white/5')}>{a.rarity}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">{a.category}</span>
                    {a.unlocked && <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Earned</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-16 text-center text-zinc-500">
          Nothing to show here yet — go make some history.
        </div>
      )}
    </div>
  );
}
