import React from 'react';
import { CalendarDays, ChevronDown, FileText, PenLine, Save, X } from 'lucide-react';
import type { ProgressLog } from '../types/schema';
import type { LorebookLogDraft } from '../lib/lorebookEditing';
import { SessionReflectionSignals } from './SessionReflectionSignals';

type Props = {
  log:ProgressLog;
  draft:LorebookLogDraft;
  onChange:(draft:LorebookLogDraft)=>void;
  onSave:()=>void;
  onSaveNext?:()=>void;
  onCancel:()=>void;
  saving:boolean;
  dirty:boolean;
  error:string|null;
  locations:string[];
};

export function LorebookLogEditor({
  log,draft,onChange,onSave,onSaveNext,onCancel,saving,dirty,error,locations,
}:Props) {
  const set=<K extends keyof LorebookLogDraft>(key:K,value:LorebookLogDraft[K])=>
    onChange({...draft,[key]:value});
  return (
    <form aria-label="Edit Lorebook log" onSubmit={event=>{event.preventDefault();if(!saving&&dirty)onSave();}}
      className="mt-3 rounded-2xl border border-violet-400/25 bg-[#181421] p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-black tracking-widest uppercase text-violet-300 flex items-center gap-2">
            <PenLine size={15}/> Reflect on this log
          </div>
          <p className="text-xs text-zinc-400">Saved reflections help future Recaps and Wrappeds understand what mattered to you.</p>
        </div>
        <button type="button" onClick={onCancel} disabled={saving} aria-label="Cancel editing"
          className="p-2 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-40">
          <X size={16}/>
        </button>
      </div>

      <label className="block space-y-2" htmlFor={'lorebook-journal-'+log.id}>
        <span className="block text-sm font-bold text-white">Journal Thoughts <span className="text-violet-300 font-normal">· personal reflection</span></span>
        <span className="block text-xs text-zinc-400">How did this experience feel? What surprised, moved, annoyed, or delighted you? No need to summarize the plot.</span>
      </label>
      {log.thoughtPrompt&&<p className="text-xs italic text-violet-200/70">Previous question: {log.thoughtPrompt}</p>}
      <textarea id={'lorebook-journal-'+log.id} autoFocus rows={4} maxLength={6000} value={draft.thoughts}
        onChange={e=>set('thoughts',e.target.value)}
        placeholder="What do you actually think about this experience?"
        className="w-full resize-y min-h-28 bg-black/35 rounded-xl border border-violet-400/25 px-3 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-400" />
      <div className="-mt-2 text-right text-[11px] text-zinc-500">{draft.thoughts.length}/6000</div>

      <SessionReflectionSignals
        enjoyment={draft.enjoyment} onEnjoymentChange={v=>set('enjoyment',v)}
        impact={draft.impact} onImpactChange={v=>set('impact',v)}
        moodlets={draft.moodlets} onMoodletsChange={v=>set('moodlets',v)}
      />

      <details className="rounded-xl border border-white/10 bg-black/20 group/details">
        <summary className="list-none cursor-pointer flex items-center gap-2 text-sm font-semibold text-zinc-300 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <FileText size={16} className="text-zinc-400"/>
          Notes & log details
          <span className="font-normal text-[11px] text-zinc-500 ml-1">organizational / optional</span>
          <ChevronDown size={15} className="ml-auto transition-transform group-open/details:rotate-180"/>
        </summary>
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-white/5">
          <label className="block space-y-2">
            <span className="text-xs font-bold text-zinc-300">Notes <span className="font-normal text-zinc-500">· chapters, issues, people, other context</span></span>
            <textarea rows={2} maxLength={4000} value={draft.notes} onChange={e=>set('notes',e.target.value)}
              placeholder="e.g. Chapters 5–7, played with Leo"
              className="w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-200 focus:outline-none focus:border-orange-400" />
          </label>
          <p className="text-xs text-zinc-500">These are bookkeeping notes, not personal Journal Thoughts. Changes below affect the original progress record.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-zinc-400">
              <span className="block">Progress ({log.metricType})</span>
              <input type="number" step="any" value={draft.delta} onChange={e=>set('delta',e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-white"/>
            </label>
            <label className="space-y-1 text-xs text-zinc-400">
              <span className="block">Location</span>
              <input list="lorebook-known-locations" value={draft.location} onChange={e=>set('location',e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-white"/>
            </label>
            <label className="space-y-1 text-xs text-zinc-400">
              <span className="flex gap-1 items-center"><CalendarDays size={13}/> Date</span>
              <input type="date" value={draft.date} onChange={e=>set('date',e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-white"/>
            </label>
            <label className="space-y-1 text-xs text-zinc-400">
              <span className="block">Time</span>
              <input type="time" value={draft.time} onChange={e=>set('time',e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-white"/>
            </label>
          </div>
          <datalist id="lorebook-known-locations">
            {locations.map(loc=><option key={loc} value={loc}/>)}
          </datalist>
        </div>
      </details>

      {error&&<div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
        <span className="text-xs text-zinc-500" aria-live="polite">
          {saving?'Saving…':dirty?'Unsaved changes':'No changes yet'}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={saving} onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-white/10 text-zinc-300 hover:bg-white/10 disabled:opacity-50 text-sm font-medium">Cancel</button>
          {onSaveNext && <button type="button" onClick={onSaveNext} disabled={!dirty||saving}
            className="px-4 py-2.5 rounded-xl border border-violet-400/40 text-violet-200 bg-violet-500/10 font-bold text-sm hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
            Save &amp; next
          </button>}
          <button type="submit" disabled={!dirty||saving}
            className="px-4 py-2.5 rounded-xl bg-violet-500 text-white font-bold text-sm hover:bg-violet-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
            <Save size={15}/>{saving?'Saving…':'Save log'}
          </button>
        </div>
      </div>
    </form>
  );
}
