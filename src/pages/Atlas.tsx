import React, { useMemo, useState } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { useToast } from '../contexts/ToastContext';
import { MapPin, Home, Plane, Merge, Loader2, Check, Layers } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { calculateScaledDelta } from '../lib/scaling';
import { groupLogsIntoSessions } from '../lib/sessions';
import { cn } from '../lib/utils';
import { LocationGroupManager } from '../components/LocationGroupManager';
import { buildGroupIndex, groupsFor, homeAwaySplit, summariseGroups, UNGROUPED } from '../lib/locationGroups';

interface LocStat {
  location: string;
  pages: number;   // master pages logged here
  entries: number; // progress logs here
  sessions: number;
  types: Record<string, number>; // pages per media type
}

export function Atlas() {
  const {
    logs, media, settings, mergeLocations,
    locationGroups, saveLocationGroup, setLocationGroupMembers, deleteLocationGroup,
  } = useMediaContext();
  const toast = useToast();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const { locStats, totalPages, awayPages, homePages, distinctCount, topAway, atHome, homeSource } = useMemo(() => {
    const valid = logs.filter(
      l => l && l.location && l.location.trim() && l.metricType !== 'statusChange'
        && !l.isHistoric && !l.timestamp.startsWith('1970-01-01')
    );

    const byLoc: Record<string, LocStat> = {};
    valid.forEach(l => {
      const loc = l.location!.trim();
      const item = media.find(m => m.id === l.mediaId);
      if (!item) return;
      const pages = calculateScaledDelta(l.delta || 1, item, settings);
      if (!byLoc[loc]) byLoc[loc] = { location: loc, pages: 0, entries: 0, sessions: 0, types: {} };
      byLoc[loc].pages += pages;
      byLoc[loc].entries += 1;
      byLoc[loc].types[item.mediaType] = (byLoc[loc].types[item.mediaType] || 0) + pages;
    });

    // Sessions per location, keyed off the session's first log location.
    groupLogsIntoSessions(valid).forEach(s => {
      const loc = s.logs[0]?.location?.trim();
      if (loc && byLoc[loc]) byLoc[loc].sessions += 1;
    });

    const list = Object.values(byLoc).sort((a, b) => b.pages - a.pages);
    const total = list.reduce((s, l) => s + l.pages, 0);

    // Home is whatever the user put in a group called "Home". Only when there is
    // no such group does this fall back to guessing from the wording.
    const split = homeAwaySplit(logs, media, settings, locationGroups);
    const homeIndex = buildGroupIndex(locationGroups.filter((g: any) => /^home$/i.test(g.name || '')));
    const atHome = (loc: string) =>
      split.source === 'group'
        ? groupsFor(loc, homeIndex).length > 0
        : /home|bedroom|living room|mancave|garden|pc room/i.test(loc);

    return {
      locStats: list,
      totalPages: total,
      awayPages: split.away,
      homePages: split.home,
      distinctCount: list.length,
      topAway: list.filter(l => !atHome(l.location)).slice(0, 6),
      atHome,
      homeSource: split.source,
    };
  }, [logs, media, settings, locationGroups]);

  const groupSummary = useMemo(
    () => summariseGroups(logs, media, settings, locationGroups),
    [logs, media, settings, locationGroups],
  );

  const mergeGroupIndex = useMemo(() => buildGroupIndex(locationGroups), [locationGroups]);

  const chartData = locStats.slice(0, 12).map(l => ({
    name: l.location.length > 26 ? l.location.slice(0, 25) + '…' : l.location,
    pages: Math.floor(l.pages),
  }));

  const awayPct = totalPages > 0 ? Math.round((awayPages / totalPages) * 100) : 0;

  const toggle = (loc: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc); else next.add(loc);
      // Convenience: prefill the target when exactly one is selected (rename flow).
      if (next.size === 1) setTarget(Array.from(next)[0]);
      else if (next.size === 0) setTarget('');
      return next;
    });
  };

  const handleMerge = async () => {
    const from = Array.from(selected);
    const to = target.trim();
    if (from.length === 0 || !to) return;
    const isRename = from.length === 1 && from[0] === to;
    const verb = isRename ? 'rename' : 'merge';
    if (!isRename) {
      const ok = window.confirm(
        `Merge ${from.length} location${from.length > 1 ? 's' : ''} into "${to}"? ` +
          `Every affected log will be updated. This can't be auto-undone.`
      );
      if (!ok) return;
    }
    setIsMerging(true);
    try {
      const updated = await mergeLocations(from, to);
      toast.success(`Updated ${updated} log${updated === 1 ? '' : 's'} (${verb} → "${to}").`);
      setSelected(new Set());
      setTarget('');
    } catch (e: any) {
      toast.error(`Failed to ${verb} locations: ${e.message}`);
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white flex items-center gap-3 tracking-tight">
          <MapPin className="w-8 h-8 text-orange-400" />
          Atlas
        </h2>
        <p className="text-zinc-400 mt-2">Where your story actually happens. Every place you've logged from.</p>
      </header>

      {locStats.length === 0 ? (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 sm:p-12 text-center text-zinc-500">
          No locations logged yet. Add a location when you log progress and it'll show up here.
        </div>
      ) : (
        <div className="space-y-8">
          {/* Summary tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile icon={<MapPin className="w-4 h-4" />} label="Places logged" value={distinctCount.toLocaleString()} />
            <Tile icon={<Home className="w-4 h-4" />} label="At home" value={`${100 - awayPct}%`} sub={homeSource === 'group' ? `${Math.floor(homePages).toLocaleString()} pages · from your Home group` : `${Math.floor(homePages).toLocaleString()} pages · guessed`} />
            <Tile icon={<Plane className="w-4 h-4" />} label="Away / on the road" value={`${awayPct}%`} sub={`${Math.floor(awayPages).toLocaleString()} pages`} />
            <Tile icon={<MapPin className="w-4 h-4" />} label="Most-logged place" value={locStats[0]?.location.split(' - ').pop() || '—'} sub={`${Math.floor(locStats[0]?.pages || 0).toLocaleString()} pages`} small />
          </div>

          {/* Ranked chart */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest mb-6 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-400" /> Master pages by location
            </h3>
            <div style={{ height: Math.max(240, chartData.length * 34) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 24, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={170} tick={{ fill: '#a1a1aa', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }}
                    formatter={(v: any) => [`${Number(v).toLocaleString()} pages`, 'Master Pages']}
                  />
                  <Bar dataKey="pages" radius={[0, 4, 4, 0]} barSize={18}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={atHome(locStats[i]?.location || '') ? '#f97316' : '#818cf8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-4 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-500" /> Home</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-400" /> Away</span>
            </div>
          </div>

          {/* Away hotspots */}
          {topAway.length > 0 && (
            <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
              <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Plane className="w-4 h-4 text-indigo-400" /> On the road
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {topAway.map(l => (
                  <div key={l.location} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate">{l.location}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">{l.sessions} session{l.sessions === 1 ? '' : 's'} · {l.entries} log{l.entries === 1 ? '' : 's'}</div>
                    </div>
                    <div className="text-sm font-mono text-indigo-300 shrink-0 ml-3">{Math.floor(l.pages).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By kind of place */}
          {groupSummary.stats.length > 0 && locationGroups.length > 0 && (
            <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
              <div className="flex items-baseline justify-between gap-4 mb-1">
                <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" /> By kind of place
                </h3>
                <span className="text-[11px] text-zinc-500 font-mono shrink-0">
                  {Math.round((groupSummary.groupedPages / (groupSummary.totalPages || 1)) * 100)}% grouped
                </span>
              </div>
              <p className="text-xs text-zinc-500 mb-5">
                A place can be in several groups, so these overlap and will not add up to 100%. Anything you
                have not grouped yet is counted once under {UNGROUPED}.
              </p>
              <div className="space-y-3.5">
                {groupSummary.stats.map(g => (
                  <div key={g.id}>
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 self-center" style={{ backgroundColor: g.color || '#52525b' }} />
                        <span className="text-sm font-black text-white truncate">{g.name}</span>
                        <span className="text-[10px] font-mono text-zinc-600 shrink-0">{g.places} place{g.places === 1 ? '' : 's'}</span>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-500 shrink-0 tabular-nums">
                        {Math.floor(g.pages).toLocaleString()} · {Math.round(g.share * 100)}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.max(2, g.share * 100)}%`, backgroundColor: g.color || '#52525b' }}
                      />
                    </div>
                    {g.topPlace && (
                      <div className="text-[10px] text-zinc-600 font-bold mt-1.5 truncate">
                        Mostly {g.topPlace.location} · {g.entries} log{g.entries === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <LocationGroupManager
            groups={locationGroups}
            locations={locStats.map(l => ({ location: l.location, entries: l.entries }))}
            onSave={saveLocationGroup}
            onSetMembers={setLocationGroupMembers}
            onDelete={deleteLocationGroup}
          />

          {/* Manage / merge tool */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest mb-1 flex items-center gap-2">
              <Merge className="w-4 h-4 text-orange-400" /> Merge &amp; rename locations
            </h3>
            <p className="text-xs text-zinc-500 mb-5">
              Select one or more places, then type the name they should all become. Selecting a single
              place lets you rename it. Every affected log is updated — this rewrites history, so use it
              only for places that really are the same. To say places are the same <em>kind</em> of place,
              group them above instead.
            </p>

            <div className="max-h-72 overflow-y-auto no-scrollbar rounded-xl border border-white/5 divide-y divide-white/5 mb-4">
              {locStats.map(l => {
                const on = selected.has(l.location);
                return (
                  <button
                    key={l.location}
                    type="button"
                    onClick={() => toggle(l.location)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      on ? 'bg-orange-500/10' : 'hover:bg-white/5'
                    )}
                  >
                    <span className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                      on ? 'bg-orange-500 border-orange-500' : 'border-white/20'
                    )}>
                      {on && <Check className="w-3 h-3 text-black" />}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sm text-white">{l.location}</span>
                    <span className="hidden sm:flex items-center gap-1 shrink-0">
                      {groupsFor(l.location, mergeGroupIndex).slice(0, 3).map(g => (
                        <span key={g.id} className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
                              style={{ color: g.color || '#a1a1aa', backgroundColor: `${g.color || '#71717a'}1f` }}>
                          {g.name}
                        </span>
                      ))}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono shrink-0">{l.entries} log{l.entries === 1 ? '' : 's'}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <input
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder={selected.size > 1 ? 'New name for all selected (e.g. "Train")' : 'Target name'}
                className="input-field flex-1"
              />
              <button
                type="button"
                onClick={handleMerge}
                disabled={isMerging || selected.size === 0 || !target.trim()}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition flex items-center justify-center gap-2 shrink-0"
              >
                {isMerging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
                {selected.size > 1 ? `Merge ${selected.size} →` : 'Apply'}
              </button>
            </div>
            {selected.size > 0 && (
              <div className="text-[11px] text-zinc-500 mt-3">
                {selected.size} selected. {selected.size === 1 ? 'Rename it, or pick more to merge together.' : `They'll all become "${target.trim() || '…'}".`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ icon, label, value, sub, small }: { icon: React.ReactNode; label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-5">
      <div className="flex items-center gap-2 text-zinc-500 mb-3">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn('font-black text-white truncate', small ? 'text-lg' : 'text-2xl')} title={value}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-1 font-mono">{sub}</div>}
    </div>
  );
}
