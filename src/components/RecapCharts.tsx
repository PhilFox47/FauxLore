import React from 'react';
import { motion } from 'motion/react';
import {
  Area, AreaChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { Globe, Orbit, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { MEDIA_HEX, MediaType } from '../types/schema';
import type { Delta, FranchiseInsights, IntervalMetrics, RecordEntry } from '../lib/recapInsights';

/**
 * The measured infographics of a recap.
 *
 * Each card answers one question a reader would actually ask — am I ahead of
 * last time, do I ever put it down, when do I do this, what did I actually
 * finish, who led the period, do I agree with the critics — and each accepts an
 * AI caption so the chart is read aloud rather than left to be decoded.
 */

/**
 * Media-type colour for charts, straight from the library's own palette.
 * recharts needs a hex rather than a Tailwind class, which is what MEDIA_HEX
 * is for — these must never be a second, hand-picked set, or a Manga is blue in
 * the sidebar and purple in a recap.
 */
export const typeHex = (t: string) => MEDIA_HEX[t as MediaType]?.base || '#71717a';

const TOOLTIP_STYLE = {
  backgroundColor: '#09090b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: 700,
} as const;

/** The shared shell: eyebrow, title, chart, and the AI's reading of it. */
export function RecapCard({
  icon, eyebrow, title, caption, children, className, action,
}: {
  icon?: React.ReactNode;
  eyebrow?: string;
  title: string;
  caption?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8%' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={cn('bg-black/40 border border-white/5 p-6 md:p-8 rounded-[2rem] flex flex-col', className)}
    >
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          {icon && <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 shrink-0">{icon}</div>}
          <div className="min-w-0">
            {eyebrow && <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 font-black mb-1">{eyebrow}</div>}
            <h3 className="text-lg md:text-xl font-black text-white tracking-tight leading-none truncate">{title}</h3>
          </div>
        </div>
        {action}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
      {caption && (
        <div className="mt-5 pt-4 border-t border-white/5 flex gap-2.5 items-start">
          <Sparkles className="w-3.5 h-3.5 text-amber-500/70 shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-400 italic leading-snug">{caption}</p>
        </div>
      )}
    </motion.div>
  );
}

/** A headline number with how it moved against the previous period. */
export function HeroStat({ label, delta, accentClass, format: fmt }: {
  label: string;
  delta: Delta;
  accentClass?: string;
  format?: (n: number) => string;
}) {
  const show = fmt || ((n: number) => Math.round(n).toLocaleString());
  const pct = delta.pct;
  const flat = pct === null || Math.abs(pct) < 3;
  const up = (pct ?? 0) > 0;

  return (
    <div className="bg-black/40 border border-white/5 p-6 md:p-8 rounded-3xl flex flex-col items-center justify-center text-center relative overflow-hidden group hover:bg-white/[0.04] transition-all">
      <div className={cn('text-4xl md:text-6xl font-black tracking-tighter mb-2', accentClass || 'text-white')}>
        {show(delta.value)}
      </div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black">{label}</div>
      {pct !== null && (
        <div
          className={cn(
            'mt-3 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border',
            flat
              ? 'text-zinc-500 border-white/10 bg-white/5'
              : up
                ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
                : 'text-rose-400 border-rose-500/20 bg-rose-500/10',
          )}
          title={`Previous period: ${show(delta.previous)}`}
        >
          {flat ? 'level' : `${up ? '▲' : '▼'} ${Math.abs(Math.round(pct))}%`}
        </div>
      )}
    </div>
  );
}

/** Cumulative pace this period, with the previous period laid over it. */
export function MomentumChart({ points, accent, caption, timeframe, className }: {
  points: { index: number; label: string; current: number | null; previous: number | null }[];
  accent: string;
  caption?: string;
  timeframe: 'week' | 'month' | 'year';
  className?: string;
}) {
  const last = [...points].reverse().find((p) => p.current !== null);
  const prevFinal = [...points].reverse().find((p) => p.previous !== null)?.previous ?? 0;
  const finalCur = last?.current ?? 0;
  const hasPrevious = prevFinal > 0;
  const lead = hasPrevious ? finalCur - prevFinal : 0;
  const leadPct = hasPrevious ? Math.round((lead / prevFinal) * 100) : 0;
  const unit = timeframe === 'year' ? 'month' : timeframe === 'month' ? 'week' : 'week';

  return (
    <RecapCard
      eyebrow="Pace"
      title="Momentum"
      caption={caption}
      className={className}
      action={
        hasPrevious ? (
          <div className={cn('text-right shrink-0', lead >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
            <div className="text-2xl font-black tracking-tighter">{lead >= 0 ? '+' : ''}{leadPct}%</div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">vs last {unit}</div>
          </div>
        ) : null
      }
    >
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="momentumFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffffff08" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#52525b', fontSize: 9, fontWeight: 900 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fill: '#52525b', fontSize: 9, fontWeight: 900 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#a1a1aa' }} formatter={(v: any, n: any) => [`${Math.round(v).toLocaleString()} MP`, n === 'current' ? 'This period' : 'Previous']} />
            {points.some((p) => p.previous !== null) && (
              <Area type="monotone" dataKey="previous" stroke="#3f3f46" strokeWidth={2} strokeDasharray="4 4" fill="none" dot={false} connectNulls />
            )}
            <Area type="monotone" dataKey="current" stroke={accent} strokeWidth={3} fill="url(#momentumFill)" dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </RecapCard>
  );
}

/** Days on versus days off, with the longest run in the middle. */
export function ConsistencyRing({ metrics, accent, caption, className }: {
  metrics: IntervalMetrics;
  accent: string;
  caption?: string;
  className?: string;
}) {
  const ratio = metrics.totalDays > 0 ? metrics.activeDays / metrics.totalDays : 0;
  const R = 54;
  const circumference = 2 * Math.PI * R;

  return (
    <RecapCard eyebrow="Consistency" title="Days You Showed Up" caption={caption} className={className}>
      <div className="flex items-center gap-6">
        <div className="relative w-[140px] h-[140px] shrink-0">
          <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
            <circle cx="70" cy="70" r={R} fill="none" stroke="#ffffff10" strokeWidth="14" />
            <motion.circle
              cx="70" cy="70" r={R} fill="none" stroke={accent} strokeWidth="14" strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              whileInView={{ strokeDashoffset: circumference * (1 - ratio) }}
              viewport={{ once: true }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-black text-white tracking-tighter leading-none">{Math.round(ratio * 100)}%</div>
            <div className="text-[8px] uppercase tracking-widest text-zinc-500 font-black mt-1">of days</div>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          {[
            { label: 'Active days', value: `${metrics.activeDays} / ${metrics.totalDays}` },
            { label: 'Longest streak', value: `${metrics.longestStreak} ${metrics.longestStreak === 1 ? 'day' : 'days'}` },
            { label: 'Rest days', value: `${metrics.restDays}` },
            { label: 'Sessions', value: `${metrics.sessions}` },
          ].map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2 last:border-0">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">{row.label}</span>
              <span className="text-sm font-black text-white">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </RecapCard>
  );
}

/** A 24-hour dial: which hours of the day this period actually happened in. */
export function ActivityClock({ clock, accent, caption, className }: {
  clock: { hourly: number[]; peakHour: number; peakWindow: { start: number; end: number; share: number }; dominant: { name: string; range: string; share: number } };
  accent: string;
  caption?: string;
  className?: string;
}) {
  const max = Math.max(...clock.hourly, 1);
  const cx = 122;
  const cy = 110;
  const rInner = 34;
  const rOuter = 96;

  const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;

  return (
    <RecapCard eyebrow="Rhythm" title="Around the Clock" caption={caption} className={className}>
      <div className="flex flex-col items-center gap-6">
        <svg viewBox="0 0 244 224" className="w-full max-w-[244px] h-auto shrink-0">
          <circle cx={cx} cy={cy} r={rInner - 6} fill="none" stroke="#ffffff08" strokeWidth="1" />
          <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="#ffffff08" strokeWidth="1" />
          {clock.hourly.map((pages, h) => {
            // Perceptual scaling: a square root keeps quiet hours visible without
            // letting one enormous hour flatten the rest of the dial.
            const t = Math.sqrt(pages / max);
            const len = rInner + t * (rOuter - rInner);
            const a0 = ((h - 0.42) / 24) * Math.PI * 2 - Math.PI / 2;
            const a1 = ((h + 0.42) / 24) * Math.PI * 2 - Math.PI / 2;
            const p = (r: number, a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
            const isPeak = h === clock.peakHour;
            return (
              <motion.polygon
                key={h}
                points={`${p(rInner, a0)} ${p(len, a0)} ${p(len, a1)} ${p(rInner, a1)}`}
                fill={pages > 0 ? accent : '#27272a'}
                opacity={pages > 0 ? (isPeak ? 1 : 0.35 + t * 0.5) : 0.4}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: pages > 0 ? (isPeak ? 1 : 0.35 + t * 0.5) : 0.4 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: h * 0.012 }}
              />
            );
          })}
          {[0, 6, 12, 18].map((h) => {
            const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
            return (
              <text
                key={h}
                x={cx + (rOuter + 12) * Math.cos(a)}
                y={cy + (rOuter + 12) * Math.sin(a) + 3}
                textAnchor="middle"
                className="fill-zinc-600"
                style={{ fontSize: 9, fontWeight: 900 }}
              >
                {h === 0 ? '12a' : h === 12 ? '12p' : hourLabel(h)}
              </text>
            );
          })}
        </svg>
        <div className="w-full grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 font-black mb-1">Peak window</div>
            <div className="text-xl font-black text-white tracking-tight whitespace-nowrap">
              {hourLabel(clock.peakWindow.start)}–{hourLabel(clock.peakWindow.end)}
            </div>
            <div className="text-[11px] text-zinc-500 font-bold mt-1 leading-snug">{Math.round(clock.peakWindow.share * 100)}% of everything logged</div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 font-black mb-1">Mostly a</div>
            <div className="text-xl font-black text-white tracking-tight truncate">{clock.dominant.name}</div>
            <div className="text-[10px] text-zinc-500 font-mono tabular-nums leading-snug">{clock.dominant.range}</div>
            <div className="text-[11px] text-zinc-500 font-bold mt-1 leading-snug">{Math.round(clock.dominant.share * 100)}% of your master pages</div>
          </div>
        </div>
      </div>
    </RecapCard>
  );
}

/** What happened to everything you touched: finished, dropped, or still open. */
export function PipelineFunnel({ pipeline, accent, caption, className }: {
  pipeline: { stages: { key: string; label: string; count: number }[]; stillOpen: number; closureRate: number };
  accent: string;
  caption?: string;
  className?: string;
}) {
  const total = pipeline.stages[0]?.count || 0;
  if (total === 0) return null;

  const colorFor = (key: string) =>
    key === 'finished' ? '#10b981' : key === 'dropped' ? '#f43f5e' : key === 'started' ? '#eab308' : accent;

  return (
    <RecapCard eyebrow="Outcomes" title="What You Actually Closed" caption={caption} className={className}>
      <div className="space-y-4">
        {pipeline.stages.map((stage, i) => {
          const width = total > 0 ? Math.max(4, (stage.count / total) * 100) : 0;
          return (
            <div key={stage.key}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-black">{stage.label}</span>
                <span className="text-sm font-black text-white">{stage.count}</span>
              </div>
              <div className="h-3 w-full bg-black/60 rounded-full overflow-hidden border border-white/5">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: colorFor(stage.key) }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${width}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-white/5">
        <div>
          <div className="text-2xl font-black text-white tracking-tighter">{Math.round(pipeline.closureRate * 100)}%</div>
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Closed out</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-amber-400 tracking-tighter">{pipeline.stillOpen}</div>
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Carried forward</div>
        </div>
      </div>
    </RecapCard>
  );
}

/** Who led the period, and when the lead changed hands. */
export function RankRace({ race, caption, className }: {
  race: { buckets: string[]; series: { id: string; title: string; mediaType: string; total: number; ranks: (number | null)[] }[]; leadChanges: number };
  caption?: string;
  className?: string;
}) {
  const depth = race.series.length;
  const rows = race.buckets.map((label, i) => {
    const row: any = { label };
    race.series.forEach((s) => { row[s.id] = s.ranks[i]; });
    return row;
  });

  return (
    <RecapCard
      eyebrow="The race"
      title="Who Led, and When"
      caption={caption}
      className={className}
      action={
        race.leadChanges > 0 ? (
          <div className="text-right shrink-0">
            <div className="text-2xl font-black text-white tracking-tighter">{race.leadChanges}</div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">lead changes</div>
          </div>
        ) : null
      }
    >
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#ffffff08" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#52525b', fontSize: 9, fontWeight: 900 }} tickLine={false} axisLine={false} />
            <YAxis
              reversed
              domain={[1, depth]}
              ticks={Array.from({ length: depth }, (_, i) => i + 1)}
              tick={{ fill: '#52525b', fontSize: 9, fontWeight: 900 }}
              tickLine={false}
              axisLine={false}
              width={28}
              tickFormatter={(v) => `#${v}`}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: '#a1a1aa' }}
              formatter={(v: any, id: any) => [`#${v}`, race.series.find((s) => s.id === id)?.title || id]}
            />
            {race.series.map((s) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                stroke={typeHex(s.mediaType)}
                strokeWidth={2.5}
                dot={{ r: 3, fill: typeHex(s.mediaType), strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
        {race.series.map((s) => (
          <div key={s.id} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: typeHex(s.mediaType) }} />
            <span className="text-xs font-bold text-zinc-300 truncate max-w-[180px]">{s.title}</span>
            <span className="text-[10px] text-zinc-600 font-black shrink-0">{s.total} MP</span>
          </div>
        ))}
      </div>
    </RecapCard>
  );
}

/** Your scores against the critics', with the line of perfect agreement. */
export function TasteScatter({ taste, accent, caption, className }: {
  taste: {
    points: { title: string; mediaType: string; user: number; critic: number; gap: number }[];
    avgGap: number;
    stance: string;
    biggestChampion: { title: string; gap: number } | null;
    biggestSkeptic: { title: string; gap: number } | null;
  };
  accent: string;
  caption?: string;
  className?: string;
}) {
  const stanceCopy =
    taste.stance === 'kinder'
      ? 'You rate higher than the critics'
      : taste.stance === 'harsher'
        ? 'You rate lower than the critics'
        : 'You and the critics broadly agree';

  return (
    <RecapCard eyebrow="Taste" title="You vs the Critics" caption={caption} className={className}>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#ffffff08" />
            <XAxis
              type="number" dataKey="critic" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} name="Critic"
              tick={{ fill: '#52525b', fontSize: 9, fontWeight: 900 }} tickLine={false} axisLine={false}
              label={{ value: 'CRITIC', position: 'insideBottom', offset: -4, fill: '#3f3f46', fontSize: 9, fontWeight: 900 }}
            />
            <YAxis
              type="number" dataKey="user" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} name="You"
              tick={{ fill: '#52525b', fontSize: 9, fontWeight: 900 }} tickLine={false} axisLine={false} width={28}
              label={{ value: 'YOU', angle: -90, position: 'insideLeft', fill: '#3f3f46', fontSize: 9, fontWeight: 900 }}
            />
            <ZAxis range={[80, 80]} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 5, y: 5 }]} stroke="#3f3f46" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: '#52525b' }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: any, n: any) => [`${v}/5`, n === 'user' ? 'You' : 'Critic']}
              labelFormatter={() => ''}
              content={({ payload }: any) => {
                const p = payload?.[0]?.payload;
                if (!p) return null;
                return (
                  <div style={TOOLTIP_STYLE as any} className="px-3 py-2">
                    <div className="text-white font-black text-xs mb-1">{p.title}</div>
                    <div className="text-zinc-400 text-[11px]">You {p.user}/5 · Critics {p.critic}/5</div>
                  </div>
                );
              }}
            />
            <Scatter data={taste.points} fill={accent}>
              {taste.points.map((p, i) => (
                <Cell key={i} fill={typeHex(p.mediaType)} fillOpacity={0.85} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t border-white/5">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-black mb-1">Verdict</div>
          <div className="text-sm font-black text-white leading-snug">{stanceCopy}</div>
        </div>
        {taste.biggestChampion && (
          <div>
            <div className="text-[9px] uppercase tracking-widest text-emerald-500/70 font-black mb-1">You championed</div>
            <div className="text-sm font-black text-white truncate">{taste.biggestChampion.title}</div>
            <div className="text-[10px] text-zinc-500 font-bold">+{taste.biggestChampion.gap.toFixed(1)} over the critics</div>
          </div>
        )}
        {taste.biggestSkeptic && (
          <div>
            <div className="text-[9px] uppercase tracking-widest text-rose-500/70 font-black mb-1">You resisted</div>
            <div className="text-sm font-black text-white truncate">{taste.biggestSkeptic.title}</div>
            <div className="text-[10px] text-zinc-500 font-bold">{taste.biggestSkeptic.gap.toFixed(1)} against the critics</div>
          </div>
        )}
      </div>
    </RecapCard>
  );
}

/** Personal bests, and how close the near-misses came. */
export function RecordsBoard({ records, caption, className }: { records: RecordEntry[]; caption?: string; className?: string }) {
  if (records.length === 0) return null;
  const broken = records.filter((r) => r.isRecord).length;

  return (
    <RecapCard
      eyebrow="The record books"
      title={broken > 0 ? `${broken} Personal Best${broken > 1 ? 's' : ''}` : 'Against Your Best'}
      caption={caption}
      className={className}
    >
      <div className="grid grid-cols-2 gap-3">
        {records.map((r) => {
          const share = r.previousBest > 0 ? Math.min(1, r.value / r.previousBest) : 1;
          return (
            <div
              key={r.key}
              className={cn(
                'relative rounded-2xl border p-4 overflow-hidden',
                r.isRecord ? 'border-amber-500/30 bg-amber-500/[0.07]' : 'border-white/5 bg-black/40',
              )}
            >
              {r.isRecord && (
                <div className="absolute top-2 right-2 text-[8px] font-black uppercase tracking-widest text-black bg-amber-400 px-1.5 py-0.5 rounded">
                  Best
                </div>
              )}
              <div className={cn('text-2xl font-black tracking-tighter', r.isRecord ? 'text-amber-300' : 'text-white')}>
                {r.value.toLocaleString()}
                <span className="text-[10px] text-zinc-500 font-black ml-1.5 uppercase tracking-widest">{r.unit}</span>
              </div>
              <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-black mt-1 truncate">{r.label}</div>
              {r.detail && <div className="text-[10px] text-zinc-500 font-bold truncate mt-0.5">{r.detail}</div>}
              {r.previousBest > 0 && (
                <div className="mt-3">
                  <div className="h-1 w-full bg-black/60 rounded-full overflow-hidden">
                    <motion.div
                      className={cn('h-full rounded-full', r.isRecord ? 'bg-amber-400' : 'bg-zinc-600')}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${share * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <div className="text-[9px] text-zinc-600 font-black mt-1.5 uppercase tracking-widest">
                    {r.isRecord ? `beat ${r.previousBest.toLocaleString()}` : `best ${r.previousBest.toLocaleString()}`}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </RecapCard>
  );
}

/**
 * Universes get their own ordinal palette rather than borrowing MEDIA_HEX.
 * A franchise is not a media type, and two of the top universes are often
 * consumed in the same format — colouring them by format would draw two
 * identical bands and destroy the one thing the chart is for. Assignment is by
 * rank, which is stable for the life of a recap.
 */
const UNIVERSE_HEX = ['#f97316', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#facc15'];
const STANDALONE_HEX = '#3f3f46';

/**
 * The period as a map of universes: who you spent it with, in what formats, and
 * which ones you had never opened before.
 */
export function UniverseLeaderboard({ insights, caption, className, limit = 6 }: {
  insights: FranchiseInsights;
  caption?: string;
  className?: string;
  limit?: number;
}) {
  const shown = insights.universes.slice(0, limit);
  const max = shown[0]?.pages || 1;
  const rest = insights.universes.length - shown.length;

  return (
    <RecapCard
      icon={<Globe className="w-5 h-5 text-orange-400" />}
      eyebrow={`${insights.distinct} universe${insights.distinct === 1 ? '' : 's'} visited`}
      title="Where You Spent It"
      caption={caption}
      className={className}
    >
      {/* The share sits in the body rather than the card header: as a header
          action it squeezes the title into an ellipsis on a phone. */}
      <div className="flex items-baseline gap-3 mb-5">
        <span className="text-3xl font-black text-white tabular-nums leading-none">{Math.round(insights.franchisedShare * 100)}%</span>
        <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-black leading-tight">of it spent<br />inside a universe</span>
      </div>

      <div className="space-y-3.5">
        {shown.map((u, i) => (
          <div key={u.name} className="flex gap-3 items-center">
            <div className="w-9 h-12 rounded-lg bg-zinc-900 border border-white/10 overflow-hidden shrink-0 relative">
              {u.coverImageUrl ? (
                <img src={u.coverImageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-700"><Globe className="w-4 h-4" /></div>
              )}
              <span className="absolute bottom-0 right-0 text-[8px] font-black text-white bg-black/80 px-1 tabular-nums">{i + 1}</span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-sm font-black text-white truncate">{u.name}</span>
                  {u.isNew && (
                    <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded px-1.5 py-0.5 shrink-0">
                      First visit
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-zinc-500 tabular-nums shrink-0">
                  {Math.round(u.pages).toLocaleString()} MP
                </span>
              </div>

              {/* One bar per universe, segmented by the formats it was consumed in. */}
              <div className="h-2.5 bg-black/50 rounded-full overflow-hidden flex" style={{ width: `${Math.max(8, (u.pages / max) * 100)}%` }}>
                {u.types.map((t) => (
                  <motion.div
                    key={t.type}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{ backgroundColor: typeHex(t.type) }}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${(t.pages / u.pages) * 100}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }}
                    title={`${t.type}: ${Math.round(t.pages).toLocaleString()} MP`}
                  />
                ))}
              </div>

              <div className="text-[10px] text-zinc-500 font-bold mt-1.5 truncate">
                {u.titles.length} {u.titles.length === 1 ? 'title' : 'titles'}
                <span className="text-zinc-700"> · </span>
                {u.titles.slice(0, 3).map((t) => t.title).join(', ')}
                {u.titles.length > 3 ? ` +${u.titles.length - 3}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-white/5 flex flex-wrap gap-2">
        {insights.newCount > 0 && (
          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 rounded-full px-2.5 py-1">
            {insights.newCount} new
          </span>
        )}
        {insights.returningCount > 0 && (
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 border border-white/10 bg-white/5 rounded-full px-2.5 py-1">
            {insights.returningCount} returning
          </span>
        )}
        {insights.deepest && (
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 border border-white/10 bg-white/5 rounded-full px-2.5 py-1 truncate max-w-full">
            Deepest: {insights.deepest.name} ({insights.deepest.titles.length})
          </span>
        )}
        {rest > 0 && (
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600 border border-white/5 rounded-full px-2.5 py-1">
            +{rest} more
          </span>
        )}
      </div>
    </RecapCard>
  );
}

/**
 * When each universe held you — stacked so the height is the period's whole
 * output and each band is one universe's share of it. Everything outside a
 * franchise sits at the bottom as the baseline it is.
 */
export function UniverseTimeline({ insights, caption, className, timeframe, limit = 5 }: {
  insights: FranchiseInsights;
  caption?: string;
  className?: string;
  timeframe: 'week' | 'month' | 'year';
  limit?: number;
}) {
  const { buckets, standaloneValues } = insights;
  if (!buckets) return null;
  const top = insights.universes.slice(0, limit);
  if (top.length < 2) return null;

  const data = buckets.map((label, i) => {
    const row: Record<string, any> = { label };
    top.forEach((u, k) => { row[`u${k}`] = Math.round(u.values[i]); });
    row.standalone = Math.round(standaloneValues[i]);
    return row;
  });
  const names = Object.fromEntries([
    ...top.map((u, k) => [`u${k}`, u.name] as const),
    ['standalone', 'Outside a universe'] as const,
  ]);
  const hasStandalone = standaloneValues.some((v) => v > 0);
  const unit = timeframe === 'week' ? 'day' : timeframe === 'month' ? 'week' : 'month';

  return (
    <RecapCard
      icon={<Orbit className="w-5 h-5 text-sky-400" />}
      eyebrow={`Universe by ${unit}`}
      title="Who Held You, When"
      caption={caption}
      className={className}
    >
      <div className="h-[240px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} width={38} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: any, key: any) => [`${Number(value).toLocaleString()} MP`, names[key] || key]}
            />
            {hasStandalone && (
              <Area type="monotone" dataKey="standalone" stackId="1" stroke={STANDALONE_HEX} fill={STANDALONE_HEX} fillOpacity={0.5} strokeWidth={1} />
            )}
            {top.map((u, k) => (
              <Area
                key={u.name}
                type="monotone"
                dataKey={`u${k}`}
                stackId="1"
                stroke={UNIVERSE_HEX[k % UNIVERSE_HEX.length]}
                fill={UNIVERSE_HEX[k % UNIVERSE_HEX.length]}
                fillOpacity={0.75}
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4">
        {top.map((u, k) => (
          <div key={u.name} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: UNIVERSE_HEX[k % UNIVERSE_HEX.length] }} />
            <span className="text-[10px] font-black text-zinc-300 truncate">{u.name}</span>
          </div>
        ))}
        {hasStandalone && (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: STANDALONE_HEX }} />
            <span className="text-[10px] font-black text-zinc-500">Outside a universe</span>
          </div>
        )}
      </div>
    </RecapCard>
  );
}
