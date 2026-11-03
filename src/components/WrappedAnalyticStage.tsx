import { motion, useReducedMotion } from 'motion/react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { VerifiedAnalytic } from '../lib/wrappedEditorial';
import { isStrongVerifiedAnalytic } from '../lib/wrappedEditorial';
import type { StoryPalette } from '../lib/storyDiscovery';

const accents: Record<StoryPalette, { text: string; solid: string; edge: string; wash: string }> = {
  violet: { text: 'text-violet-200', solid: 'bg-violet-300', edge: 'border-violet-300/30', wash: 'bg-violet-300/10' },
  cobalt: { text: 'text-blue-200', solid: 'bg-blue-300', edge: 'border-blue-300/30', wash: 'bg-blue-300/10' },
  amber: { text: 'text-amber-200', solid: 'bg-amber-300', edge: 'border-amber-300/30', wash: 'bg-amber-300/10' },
  rose: { text: 'text-rose-200', solid: 'bg-rose-300', edge: 'border-rose-300/30', wash: 'bg-rose-300/10' },
  emerald: { text: 'text-emerald-200', solid: 'bg-emerald-300', edge: 'border-emerald-300/30', wash: 'bg-emerald-300/10' },
  cyan: { text: 'text-cyan-200', solid: 'bg-cyan-300', edge: 'border-cyan-300/30', wash: 'bg-cyan-300/10' },
  monochrome: { text: 'text-white', solid: 'bg-white', edge: 'border-white/30', wash: 'bg-white/10' },
};
const percent = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
const number = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const entrance = (reduce: boolean, delay: number) => ({
  initial: reduce ? false as const : { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: reduce ? 0 : .55, delay: reduce ? 0 : delay },
});

/**
 * Four editorial charts with genuinely different analytical jobs. Every
 * displayed value originates from an already-verified, bounded dataset;
 * model-authored markup, HTML and numeric strings are never rendered.
 */
export function WrappedAnalyticStage({ analytic, palette = 'violet' }: {
  analytic: VerifiedAnalytic;
  palette?: StoryPalette;
}) {
  const reduced = !!useReducedMotion();
  const theme = accents[palette];
  if (!isStrongVerifiedAnalytic(analytic)) return null;
  const [a, b, c] = analytic.points;
  if (analytic.kind === 'shift') {
    const delta = b.value - a.value;
    return <div className="w-full grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-5 lg:gap-8 items-center"
      aria-label={'Share shift from ' + percent(a.value) + ' to ' + percent(b.value)}>
      <motion.div {...entrance(reduced, .1)} className="min-w-0 border-l-2 border-white/25 pl-5">
        <p className="text-xs font-bold uppercase tracking-[.17em] text-white/55">{a.label}</p>
        <div className="mt-4 text-5xl sm:text-6xl lg:text-7xl font-black tabular-nums tracking-[-.07em] text-white/70">
          {percent(a.value)}
        </div>
        <p className="mt-3 text-xs sm:text-sm text-white/55">{a.note}</p>
      </motion.div>
      <motion.div {...entrance(reduced, .24)}
        className={'flex lg:flex-col items-center justify-center gap-2 rounded-2xl px-5 py-4 ' + theme.wash}>
        {delta >= 0 ? <ArrowUpRight className={'w-6 h-6 ' + theme.text} /> :
          <ArrowDownRight className={'w-6 h-6 ' + theme.text} />}
        <span className={'text-3xl sm:text-4xl font-black tabular-nums tracking-tight ' + theme.text}>
          {delta > 0 ? '+' : ''}{number(delta)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/55">percentage points</span>
      </motion.div>
      <motion.div {...entrance(reduced, .36)} className={'min-w-0 border-l-2 pl-5 ' + theme.edge}>
        <p className={'text-xs font-bold uppercase tracking-[.17em] ' + theme.text}>{b.label}</p>
        <div className="mt-4 text-5xl sm:text-6xl lg:text-7xl font-black tabular-nums tracking-[-.07em]">
          {percent(b.value)}
        </div>
        <p className="mt-3 text-xs sm:text-sm text-white/65">{b.note}</p>
      </motion.div>
    </div>;
  }
  if (analytic.kind === 'duel') {
    return <div className="w-full grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-4 md:gap-8"
      aria-label={a.label + ' ' + percent(a.value) + ', compared with ' + b.label + ' ' + percent(b.value)}>
      {[a, b].map((point, index) => <motion.div key={point.label} {...entrance(reduced, .12 + index * .15)}
        className={'flex min-w-0 flex-col gap-3 justify-between rounded-2xl p-6 sm:p-8 border ' +
          (index === 0 ? theme.edge + ' ' + theme.wash : 'border-white/15 bg-white/[.035]')}>
        <p className="text-sm font-black tracking-[.14em] uppercase text-white/70">{point.label}</p>
        <div className={'text-6xl sm:text-7xl lg:text-8xl font-black tabular-nums tracking-[-.075em] ' +
          (index === 0 ? theme.text : 'text-white')}>{percent(point.value)}</div>
        <p className="text-xs sm:text-sm text-white/65">{point.note}</p>
      </motion.div>).flatMap((node, i) =>
        i === 0 ? [node, <div key="versus" className="self-center text-white/35 text-sm font-black tracking-[.3em] text-center">VS</div>] : [node])}
    </div>;
  }
  if (analytic.kind === 'arc' && c) {
    const pts = analytic.points.map((point, i) => ({
      x: 9 + i * 41, y: 86 - point.value * .66,
    }));
    const path = pts.map((p, i) => (i === 0 ? 'M ' : 'L ') + p.x + ' ' + p.y).join(' ');
    return <div className="w-full space-y-5" aria-label={'Monthly progression: ' +
      analytic.points.map(p => p.label + ' ' + percent(p.value)).join(', ')}>
      <div className="relative w-full h-36 sm:h-52 overflow-hidden" aria-hidden="true">
        <svg className={'w-full h-full ' + theme.text} viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M 8 92 L 92 92" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth=".6"/>
          {pts.map((p, i) => <path key={'axis-' + i}
            d={'M ' + p.x + ' 8 L ' + p.x + ' 92'} stroke="currentColor" strokeWidth=".3" strokeOpacity=".18"
            strokeDasharray="1 2" />)}
          <motion.path d={path} fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : 1.1 }}/>
          {pts.map((p, i) => <circle key={'dot-' + i} cx={p.x} cy={p.y} r="2.3"
            fill="currentColor" stroke="#090a10" strokeWidth=".7" />)}
        </svg>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        {analytic.points.map((p, i) => <motion.div key={p.label} {...entrance(reduced, .15 + i * .12)}
          className={'min-w-0 border-t-2 pt-4 ' + (i === pts.findIndex(x => x.y === Math.min(...pts.map(y => y.y)))
            ? theme.edge : 'border-white/15')}>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wide text-white/60">{p.label}</p>
          <div className="mt-2 text-3xl sm:text-5xl lg:text-6xl font-black tabular-nums tracking-[-.06em]">
            {percent(p.value)}
          </div>
          <p className="mt-2 text-xs sm:text-sm text-white/55 break-words">{p.note}</p>
        </motion.div>)}
      </div>
      <p className="text-xs text-white/40">Share of normalized progress (Master Pages), not hours spent.</p>
    </div>;
  }
  const primary = a.value;
  const circumference = 2 * Math.PI * 77;
  return <div className="w-full grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_1fr] gap-8 md:gap-14 items-center"
    aria-label={a.label + ' contributed ' + percent(primary) + ' of normalized progress'}>
    <motion.div {...entrance(reduced, .15)} className="relative mx-auto w-52 h-52 sm:w-64 sm:h-64 lg:w-72 lg:h-72">
      <svg viewBox="0 0 200 200" className={'w-full h-full -rotate-90 ' + theme.text} aria-hidden="true">
        <circle cx="100" cy="100" r="77" stroke="currentColor" strokeOpacity=".12"
          fill="none" strokeWidth="16" />
        <motion.circle cx="100" cy="100" r="77" fill="none" stroke="currentColor"
          strokeWidth="16" strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reduced ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - primary / 100) }}
          transition={{ duration: reduced ? 0 : 1.15, ease: 'easeOut' }}/>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-5xl sm:text-6xl font-black tabular-nums tracking-[-.07em]">
          {percent(primary)}
        </div>
        <span className="text-xs font-semibold uppercase tracking-[.18em] text-white/50">of the period</span>
      </div>
    </motion.div>
    <motion.div {...entrance(reduced, .35)} className="min-w-0 space-y-5">
      <div>
        <p className={'text-xs font-black uppercase tracking-[.16em] ' + theme.text}>Dominant work</p>
        <p className="text-2xl sm:text-3xl lg:text-4xl font-black mt-3 leading-tight break-words">{a.label}</p>
        <p className="mt-2 text-sm text-white/65">{a.note}</p>
      </div>
      <div className="border-t border-white/15 pt-5">
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-black tabular-nums text-white/75">{percent(b.value)}</span>
          <span className="text-sm font-semibold text-white/60">{b.label}</span>
        </div>
        <p className="mt-1 text-xs text-white/45">{b.note}</p>
      </div>
    </motion.div>
  </div>;
}
