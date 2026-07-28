import React, { useMemo, useState } from 'react';
import { Layers, Plus, Trash2, Check, X, Loader2, Pencil } from 'lucide-react';
import { cn } from '../lib/utils';
import { GROUP_COLORS, LocationGroup, buildGroupIndex, groupsFor } from '../lib/locationGroups';

/**
 * Building and editing location groups.
 *
 * Deliberately not the merge tool sitting next to it. Merging answers "these are
 * the same place" by rewriting logs; grouping answers "these are the same *kind*
 * of place" and rewrites nothing, so a place can be in as many groups as makes
 * sense — the local cinema is both a Cinema and part of Wolfenbüttel.
 */
export function LocationGroupManager({
  groups, locations, onSave, onSetMembers, onDelete,
}: {
  groups: LocationGroup[];
  /** Every location that appears in the logs, most-used first. */
  locations: { location: string; entries: number }[];
  onSave: (g: { id?: string; name: string; color?: string | null; locations?: string[] }) => Promise<void>;
  onSetMembers: (id: string, locations: string[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(GROUP_COLORS[0]);
  const [draftMembers, setDraftMembers] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const index = useMemo(() => buildGroupIndex(groups), [groups]);
  const isCreating = editingId === 'new';

  const startCreate = () => {
    setEditingId('new');
    setDraftName('');
    setDraftColor(GROUP_COLORS[groups.length % GROUP_COLORS.length]);
    setDraftMembers(new Set());
    setFilter('');
    setError('');
  };

  const startEdit = (g: LocationGroup) => {
    setEditingId(g.id);
    setDraftName(g.name);
    setDraftColor(g.color || GROUP_COLORS[0]);
    setDraftMembers(new Set(g.locations));
    setFilter('');
    setError('');
  };

  const cancel = () => { setEditingId(null); setError(''); };

  const toggleMember = (loc: string) => {
    setDraftMembers((prev) => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc); else next.add(loc);
      return next;
    });
  };

  const save = async () => {
    const name = draftName.trim();
    if (!name) { setError('Give the group a name.'); return; }
    setBusy(true);
    setError('');
    try {
      await onSave({
        id: isCreating ? undefined : editingId!,
        name,
        color: draftColor,
        locations: Array.from(draftMembers),
      });
      setEditingId(null);
    } catch (e: any) {
      setError(e?.message || 'Could not save the group.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (g: LocationGroup) => {
    if (!window.confirm(`Delete the "${g.name}" group? The places and their logs are untouched — only the grouping goes.`)) return;
    setBusy(true);
    try { await onDelete(g.id); } finally { setBusy(false); }
  };

  const visible = filter.trim()
    ? locations.filter((l) => l.location.toLowerCase().includes(filter.trim().toLowerCase()))
    : locations;

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
          <Layers className="w-4 h-4 text-sky-400" /> Location groups
        </h3>
        {!editingId && (
          <button
            type="button"
            onClick={startCreate}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> New group
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500 mb-5">
        Unlike merging, this changes nothing about your logs. It just says which places belong together —
        every cinema, everywhere that counts as home, everything logged while travelling — so statistics and
        recaps can talk about kinds of place. A place can be in as many groups as you like.
      </p>

      {/* Existing groups */}
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {groups.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-2 rounded-full border pl-3 pr-1.5 py-1.5"
              style={{ borderColor: `${g.color || '#71717a'}55`, backgroundColor: `${g.color || '#71717a'}14` }}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color || '#71717a' }} />
              <span className="text-xs font-black text-white">{g.name}</span>
              <span className="text-[10px] font-mono text-zinc-500">{g.locations.length}</span>
              <button type="button" onClick={() => startEdit(g)} title="Edit" className="p-1 text-zinc-500 hover:text-white transition-colors">
                <Pencil className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => remove(g)} title="Delete" className="p-1 text-zinc-600 hover:text-red-400 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {editingId ? (
        <div className="border border-white/10 rounded-2xl p-4 bg-black/30">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder='Group name — e.g. "Cinema", "Home", "Travelling"'
              className="input-field flex-1"
            />
            <div className="flex items-center gap-1.5">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraftColor(c)}
                  title={c}
                  className={cn('w-6 h-6 rounded-full border-2 transition-transform', draftColor === c ? 'scale-110' : 'border-transparent opacity-60 hover:opacity-100')}
                  style={{ backgroundColor: c, borderColor: draftColor === c ? '#fff' : 'transparent' }}
                />
              ))}
            </div>
          </div>

          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter places…"
            className="input-field mb-3"
          />

          <div className="max-h-64 overflow-y-auto no-scrollbar rounded-xl border border-white/5 divide-y divide-white/5 mb-4">
            {visible.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-zinc-600">No places match that.</div>
            )}
            {visible.map((l) => {
              const on = draftMembers.has(l.location);
              // Groups this place is already in, other than the one being edited.
              const others = groupsFor(l.location, index).filter((g) => g.id !== editingId);
              return (
                <button
                  key={l.location}
                  type="button"
                  onClick={() => toggleMember(l.location)}
                  className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors', on ? 'bg-sky-500/10' : 'hover:bg-white/5')}
                >
                  <span className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0', on ? 'bg-sky-500 border-sky-500' : 'border-white/20')}>
                    {on && <Check className="w-3 h-3 text-black" />}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm text-white">{l.location}</span>
                  {others.length > 0 && (
                    <span className="hidden sm:flex items-center gap-1 shrink-0">
                      {others.slice(0, 3).map((g) => (
                        <span key={g.id} className="w-2 h-2 rounded-full" title={`Also in ${g.name}`} style={{ backgroundColor: g.color || '#71717a' }} />
                      ))}
                    </span>
                  )}
                  <span className="text-[11px] text-zinc-500 font-mono shrink-0">{l.entries}</span>
                </button>
              );
            })}
          </div>

          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy || !draftName.trim()}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition flex items-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {isCreating ? 'Create group' : 'Save changes'}
            </button>
            <button type="button" onClick={cancel} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5">
              <X className="w-4 h-4" /> Cancel
            </button>
            <span className="text-[11px] text-zinc-500 ml-auto">{draftMembers.size} place{draftMembers.size === 1 ? '' : 's'} in this group</span>
          </div>
        </div>
      ) : groups.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-2xl px-4 py-8 text-center">
          <p className="text-sm text-zinc-500">No groups yet.</p>
          <button type="button" onClick={startCreate} className="text-sky-400 hover:text-sky-300 text-sm font-bold mt-2 transition-colors">
            Create your first one
          </button>
        </div>
      ) : null}
    </div>
  );
}
