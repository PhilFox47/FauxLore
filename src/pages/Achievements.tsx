import React, { useMemo, useState } from 'react';
import { Trophy, CalendarDays, Search, BookOpen } from 'lucide-react';
import { useMediaContext } from '../contexts/MediaContext';
import { AchievementCard } from '../components/AchievementCard';
import type { AchievementPeriod, GeneratedAchievement } from '../lib/generatedAchievements';

type Filter = 'all' | AchievementPeriod;
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'week', label: 'Weeks' },
  { id: 'month', label: 'Months' }, { id: 'year', label: 'Years' },
];
function periodStart(a: GeneratedAchievement): number {
  const year = Number(a.timeId.slice(0, 4));
  if (a.timeframe === 'year') return new Date(year, 0, 1).getTime();
  if (a.timeframe === 'month') return new Date(year, Number(a.timeId.slice(5, 7)) - 1, 1).getTime();
  // ISO weeks start with the Monday of the week containing January 4.
  const jan4 = new Date(year, 0, 4);
  const day = (jan4.getDay() + 6) % 7;
  return new Date(year, 0, 4 - day + (Number(a.timeId.slice(-2)) - 1) * 7).getTime();
}
function periodLabel(a: GeneratedAchievement): string {
  if (a.timeframe === 'week') return 'Week ' + a.timeId.replace('-W', ', ');
  if (a.timeframe === 'month') return 'Month ' + a.timeId;
  return 'Year ' + a.timeId;
}

export function Achievements() {
  const { achievements } = useMediaContext();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = achievements.filter(a =>
      (filter === 'all' || a.timeframe === filter) &&
      (!q || [a.title, a.description, a.reward, a.subject, a.timeId]
        .some(v => v.toLowerCase().includes(q)))
    );
    const byPeriod = new Map<string, GeneratedAchievement[]>();
    for (const a of filtered) {
      const key = a.timeframe + ':' + a.timeId;
      byPeriod.set(key, [...(byPeriod.get(key) || []), a]);
    }
    return Array.from(byPeriod.values()).sort((a, b) =>
      periodStart(b[0]) - periodStart(a[0]) || b[0].timeframe.localeCompare(a[0].timeframe)
    );
  }, [achievements, filter, query]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-24">
      <header className="relative overflow-hidden rounded-[2rem] border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-zinc-950 to-black p-6 md:p-10">
        <div className="absolute right-0 top-0 h-64 w-64 bg-amber-500/10 blur-[100px] pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4">
              <Trophy className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white">Achievement Archive</h1>
              <p className="text-zinc-400 text-sm mt-1">An ongoing, unsolicited commentary on your media choices.</p>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-4xl font-black text-amber-400">{achievements.length}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Achievements collected</div>
          </div>
        </div>
      </header>
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {filters.map(p => (
            <button key={p.id} onClick={() => setFilter(p.id)}
              className={'rounded-full border px-4 py-2 text-xs font-black transition-colors ' +
                (filter === p.id ? 'border-amber-500/40 bg-amber-500/15 text-amber-300' :
                'border-white/10 bg-white/5 text-zinc-400 hover:text-white')}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="relative flex items-center gap-2 border border-white/10 rounded-xl px-3 py-2 bg-zinc-900/60 text-zinc-500">
          <Search className="w-4 h-4 shrink-0" />
          <input aria-label="Search achievements" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search your terrible decisions..."
            className="bg-transparent outline-none text-sm text-white placeholder:text-zinc-600 w-full md:w-64" />
        </label>
      </div>
      {groups.length ? (
        <div className="space-y-10">
          {groups.map(group => (
            <section key={group[0].timeframe + ':' + group[0].timeId} className="space-y-4">
              <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                <CalendarDays className="h-5 w-5 text-amber-400" />
                <h2 className="text-lg font-black text-zinc-100">{periodLabel(group[0])}</h2>
                <span className="text-xs text-zinc-500">{group.length} unlocked</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {group.sort((a, b) => a.position - b.position).map(a => (
                  <AchievementCard key={a.position} achievement={a} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-[2rem] border border-dashed border-white/10 bg-white/[0.02] p-10 text-center space-y-3">
          <BookOpen className="w-10 h-10 mx-auto text-zinc-600" />
          <h2 className="text-xl font-black text-white">Nothing to show. Suspicious.</h2>
          <p className="max-w-md mx-auto text-sm text-zinc-400">
            {achievements.length ? 'No achievements match your filters.' :
              'Generate or rewrite a weekly, monthly or yearly recap to let the dungeon system judge you.'}
          </p>
        </div>
      )}
    </div>
  );
}
