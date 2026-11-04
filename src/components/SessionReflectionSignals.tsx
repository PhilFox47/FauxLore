import React from 'react';
import { Heart, Star } from 'lucide-react';
import { QUICK_MOODLETS, MAX_SESSION_MOODLETS, type MoodletId } from '../lib/quickMoodlets';

type Props = {
  enjoyment: number | null;
  onEnjoymentChange: (value: number | null) => void;
  impact: number | null;
  onImpactChange: (value: number | null) => void;
  moodlets: MoodletId[];
  onMoodletsChange: (value: MoodletId[]) => void;
};

const impactDescriptions = [
  '', 'Fleeting · Just a moment', 'Light · A little something',
  'Noticeable · Left an impression', 'Significant · Really affected me',
  'Lasting · This will stay with me',
];

export function SessionReflectionSignals({
  enjoyment, onEnjoymentChange, impact, onImpactChange, moodlets, onMoodletsChange,
}: Props) {
  const rating = (name: string, value: number | null, onChange: (v: number | null) => void, isImpact: boolean) => (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-sm text-white font-bold">{name}</h3>
        <span className="text-[11px] text-zinc-500">Optional · 1–5</span>
      </div>
      <div className="grid grid-cols-5 gap-2" role="group" aria-label={name + ' from 1 to 5'}>
        {[1, 2, 3, 4, 5].map(n => {
          const selected = value === n;
          const Icon = isImpact ? Heart : Star;
          return <button key={n} type="button" aria-pressed={selected}
            onClick={() => onChange(selected ? null : n)}
            className={'rounded-xl py-2.5 border flex flex-col items-center gap-1 transition-colors ' +
              (selected
                ? isImpact ? 'border-violet-400/70 bg-violet-400/15' : 'border-amber-400/70 bg-amber-400/15'
                : 'border-white/10 bg-black/30 hover:bg-white/10')}>
            <Icon size={19} className={value !== null && value >= n
              ? isImpact ? 'fill-violet-400 text-violet-400' : 'fill-amber-400 text-amber-400'
              : 'text-zinc-500'} />
            <span className="text-xs text-zinc-300">{n}</span>
          </button>;
        })}
      </div>
      <p className="text-xs text-center text-zinc-500">
        {value === null ? 'Not rated' : isImpact ? impactDescriptions[value] :
          ['','Bad','Not great','Okay','Really good','Amazing'][value]}
      </p>
    </section>
  );

  return (
    <section className="rounded-2xl p-4 bg-white/[.035] border border-white/10 space-y-4">
      {rating('Session enjoyment', enjoyment, onEnjoymentChange, false)}
      <div className="border-t border-white/10" />
      {rating('Session impact', impact, onImpactChange, true)}
      <p className="text-xs text-zinc-500 -mt-2">
        How much did this experience matter beyond simply enjoying it? Not a quality score.
      </p>
      <div className="border-t border-white/10" />
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-white text-sm font-bold">Quick Moodlets</h3>
        <span className="text-[11px] text-zinc-500">{moodlets.length}/{MAX_SESSION_MOODLETS} selected</span>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick Moodlets">
        {QUICK_MOODLETS.map(moodlet => {
          const selected = moodlets.includes(moodlet.id);
          return <button type="button" key={moodlet.id} aria-pressed={selected}
            title={moodlet.description}
            disabled={!selected && moodlets.length >= MAX_SESSION_MOODLETS}
            onClick={() => onMoodletsChange(selected
              ? moodlets.filter(id => id !== moodlet.id)
              : [...moodlets, moodlet.id])}
            className={'rounded-full border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-35 ' +
              (selected ? 'bg-violet-400/15 border-violet-400/60 text-violet-100'
                : 'bg-black/30 border-white/10 text-zinc-300 hover:bg-white/10')}>
            {moodlet.emoji} {moodlet.label}
          </button>;
        })}
      </div>
      <p className="text-xs text-zinc-500">Only choose what stood out. No selection is not a neutral or negative rating.</p>
    </section>
  );
}
