import React, { useMemo } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { calculateRPGState } from '../lib/rpgSystem';
import { Shield, Swords, Award, TrendingDown, CheckCircle2, CircleDashed, Flame } from 'lucide-react';
import { cn } from '../lib/utils';

export function Lorekeeper() {
  const { media, logs, settings } = useMediaContext();
  const rpgState = useMemo(() => calculateRPGState(media, logs, settings), [media, logs, settings]);

  const weeklyQuests = rpgState.quests.filter(q => q.type === 'weekly');
  const monthlyQuests = rpgState.quests.filter(q => q.type === 'monthly');
  const yearlyQuests = rpgState.quests.filter(q => q.type === 'yearly');

  return (
    <div className="max-w-6xl mx-auto space-y-12">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white flex items-center gap-3 tracking-tight">
          <Shield className="w-8 h-8 text-indigo-500" />
          The Lorekeeper
        </h2>
        <p className="text-zinc-400 mt-2">Your RPG progress, active quests, and lifetime experience breakdown.</p>
      </header>

      {/* Hero Overview */}
      <section className="shrink-0 bg-zinc-900 border border-white/5 rounded-3xl p-8 relative overflow-hidden flex flex-col md:flex-row items-center gap-8">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="shrink-0 relative">
          <div className="w-32 h-32 bg-zinc-950 rounded-3xl flex items-center justify-center border-4 border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.3)] z-10 relative">
            <Swords className="w-16 h-16 text-indigo-400" />
            <div className="absolute -bottom-4 -right-4 bg-indigo-600 text-white text-base font-black px-4 py-1 rounded-full border-4 border-zinc-900 shadow-xl shadow-indigo-900/50">
              Lvl {rpgState.level}
            </div>
          </div>
        </div>

        <div className="flex-1 w-full z-10 text-center md:text-left">
          <h3 className="text-4xl font-black text-white italic tracking-tight mb-2">{rpgState.className}</h3>
          <p className="text-zinc-400 text-lg font-medium mb-6">{rpgState.currentExp.toLocaleString()} Total EXP</p>

          <div className="flex justify-between items-end mb-2">
            <span className="text-sm text-indigo-400 font-bold tracking-wider uppercase">Progress to Level {rpgState.level + 1}</span>
            <div className="text-sm text-zinc-500 font-mono">
              {(rpgState.currentExp - rpgState.currentLevelExp).toLocaleString()} / {(rpgState.nextLevelExp - rpgState.currentLevelExp).toLocaleString()} EXP
            </div>
          </div>
          <div className="h-4 bg-zinc-950 rounded-full overflow-hidden shadow-inner border border-white/5 relative">
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
              style={{ width: `${Math.max(2, rpgState.expProgress * 100)}%` }} 
            />
          </div>
        </div>
      </section>

      {/* Breakdown Grid */}
      <section>
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Award className="w-5 h-5 text-zinc-400" />
          Experience Breakdown
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-zinc-900/40 border border-white/5 p-5 rounded-2xl">
            <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-2">Base EXP</div>
            <div className="text-2xl font-black text-white">+{Math.floor(rpgState.expBreakdown.baseExp).toLocaleString()}</div>
            <div className="text-xs text-zinc-500 mt-1">From Master Pages</div>
          </div>
          <div className="bg-zinc-900/40 border border-emerald-500/10 p-5 rounded-2xl">
            <div className="text-emerald-500 text-xs font-bold uppercase tracking-wider mb-2">Quest EXP</div>
            <div className="text-2xl font-black text-emerald-400">+{Math.floor(rpgState.expBreakdown.questExp).toLocaleString()}</div>
            <div className="text-xs text-zinc-500 mt-1">From completed quests</div>
          </div>
          <div className="bg-zinc-900/40 border border-red-500/10 p-5 rounded-2xl">
            <div className="text-red-500 text-xs font-bold uppercase tracking-wider mb-2">Decay Penalty</div>
            <div className="text-2xl font-black text-red-400">{Math.floor(rpgState.expBreakdown.decayExp).toLocaleString()}</div>
            <div className="text-xs text-zinc-500 mt-1">Due to inactivity gaps</div>
          </div>
          <div className="bg-zinc-900/40 border border-orange-500/10 p-5 rounded-2xl">
            <div className="text-orange-500 text-xs font-bold uppercase tracking-wider mb-2">Drop Penalty</div>
            <div className="text-2xl font-black text-orange-400">{Math.floor(rpgState.expBreakdown.penaltyExp).toLocaleString()}</div>
            <div className="text-xs text-zinc-500 mt-1">From dropped media</div>
          </div>
        </div>
      </section>

      {/* Quests */}
      <section className="space-y-8">
        <h3 className="text-2xl font-bold text-white flex items-center gap-2">
          <Flame className="w-6 h-6 text-amber-500" />
          Active Quests
        </h3>

        {/* Weekly */}
        <div>
          <h4 className="text-zinc-400 font-bold uppercase tracking-widest text-xs mb-4">Weekly Quests</h4>
          <div className="grid md:grid-cols-2 gap-4">
            {weeklyQuests.map((q, i) => <QuestCard key={i} quest={q} />)}
          </div>
        </div>

        {/* Monthly */}
        <div>
          <h4 className="text-zinc-400 font-bold uppercase tracking-widest text-xs mb-4">Monthly Quests</h4>
          <div className="grid md:grid-cols-2 gap-4">
            {monthlyQuests.map((q, i) => <QuestCard key={i} quest={q} />)}
          </div>
        </div>

        {/* Yearly */}
        <div>
          <h4 className="text-zinc-400 font-bold uppercase tracking-widest text-xs mb-4">Yearly Quests</h4>
          <div className="grid md:grid-cols-2 gap-4">
            {yearlyQuests.map((q, i) => <QuestCard key={i} quest={q} />)}
          </div>
        </div>

      </section>
    </div>
  );
}

function QuestCard({ quest }: { quest: any }) {
  const percentage = Math.min(100, Math.max(0, (quest.currentAmount / quest.targetAmount) * 100));
  
  return (
    <div className={cn(
      "p-6 rounded-2xl border relative overflow-hidden transition-all",
      quest.isCompleted 
        ? "bg-emerald-900/20 border-emerald-500/30" 
        : "bg-zinc-900/50 border-white/5 shadow-xl"
    )}>
      {quest.isCompleted && (
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-[40px]" />
      )}
      
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="flex items-center gap-3">
          {quest.isCompleted ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          ) : (
            <CircleDashed className="w-8 h-8 text-zinc-600" />
          )}
          <div>
            <h5 className="font-bold text-white text-lg">{quest.title}</h5>
            <p className="text-sm text-zinc-400">{quest.description}</p>
          </div>
        </div>
        <div className={cn(
          "px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase flex-shrink-0",
          quest.isCompleted ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
        )}>
          +{quest.expReward} EXP
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between text-xs font-mono font-bold mb-2">
          <span className={quest.isCompleted ? "text-emerald-400" : "text-zinc-500"}>
            {Math.floor(quest.currentAmount).toLocaleString()}
          </span>
          <span className="text-zinc-600">{quest.targetAmount.toLocaleString()}</span>
        </div>
        <div className="h-2 bg-zinc-950 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-1000",
              quest.isCompleted ? "bg-emerald-500" : "bg-indigo-500"
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
