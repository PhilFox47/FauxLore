import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Download, Trash2, ChevronRight, AlertTriangle, Search,
  Cpu, Server, Layers, Copy, Check,
} from 'lucide-react';
import { apiFetch } from '../services/db';

/**
 * The diagnostic log, for an admin.
 *
 * Built after a debugging session in which the only evidence available for a
 * failing Codex was a screenshot of a billing page. Two channels, because the
 * two questions are different: "what did the app do" and "what did the model
 * do". The AI rows carry the things that actually settle an argument — the
 * resolved model name including its search suffix, the depth asked for, tokens
 * in and out, how long it took, and how much retrieved material came back.
 */

type Channel = 'all' | 'internal' | 'ai';
type Level = 'all' | 'info' | 'warn' | 'error';

interface Entry {
  id: number;
  ts: string;
  channel: 'internal' | 'ai';
  level: 'debug' | 'info' | 'warn' | 'error';
  scope: string | null;
  message: string;
  userId: string | null;
  detail: any;
}

interface Summary {
  total: number;
  byChannel: { channel: string; n: number }[];
  byLevel: { level: string; n: number }[];
  scopes: { scope: string; n: number }[];
  errorsLastDay: number;
  oldest: string | null;
  newest: string | null;
  aiLastDay: {
    model: string; depth: string | null; calls: number; failures: number;
    promptTokens: number; completionTokens: number; avgMs: number;
  }[];
}

const LEVEL_STYLE: Record<string, string> = {
  error: 'text-red-400 bg-red-500/10 border-red-500/20',
  warn: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  info: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  debug: 'text-zinc-400 bg-white/5 border-white/10',
};

/** Local time, to the second. A log is read against a clock on the wall. */
function shortTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortDate(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const n = (v: any) => (typeof v === 'number' ? v.toLocaleString() : v ?? '—');

function LogRow({ entry }: { entry: Entry }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasDetail = entry.detail !== null && entry.detail !== undefined;
  const d = entry.detail || {};

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `${entry.ts}  ${entry.level.toUpperCase()} [${entry.channel}/${entry.scope || 'app'}]  ${entry.message}${
      hasDetail ? `\n${JSON.stringify(entry.detail, null, 2)}` : ''
    }`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };

  return (
    <div className={`border-b border-white/5 ${entry.level === 'error' ? 'bg-red-500/[0.03]' : ''}`}>
      <button
        type="button"
        onClick={() => hasDetail && setOpen(!open)}
        className={`w-full flex items-start gap-3 px-3 py-2 text-left ${hasDetail ? 'hover:bg-white/[0.03] cursor-pointer' : 'cursor-default'}`}
      >
        <ChevronRight
          className={`w-3.5 h-3.5 mt-1 shrink-0 transition-transform ${open ? 'rotate-90' : ''} ${hasDetail ? 'text-zinc-500' : 'text-transparent'}`}
        />
        <span className="shrink-0 font-mono text-[11px] text-zinc-500 mt-0.5 tabular-nums" title={entry.ts}>
          {shortTime(entry.ts)}
        </span>
        <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${LEVEL_STYLE[entry.level] || LEVEL_STYLE.debug}`}>
          {entry.level}
        </span>
        <span className="shrink-0 px-1.5 py-0.5 rounded bg-white/5 text-[10px] font-mono text-zinc-400 mt-0.5">
          {entry.scope || 'app'}
        </span>
        <span className="flex-1 text-xs text-zinc-300 break-words whitespace-pre-wrap font-mono leading-relaxed min-w-0">
          {entry.message}
        </span>
        <span
          onClick={copy}
          className="shrink-0 p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-200"
          title="Copy this entry"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </span>
      </button>

      {open && hasDetail && (
        <div className="px-10 pb-3">
          {/* An AI call gets the numbers laid out rather than buried in JSON —
              these are the fields anyone actually opens the row to read. */}
          {entry.channel === 'ai' && d.model && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              {[
                ['Model', d.model],
                ['Search', d.webSearch ? `${d.searchDepth || 'standard'}${d.searchBody === false ? ' (suffix only)' : ''}` : 'off'],
                ['Prompt tokens', n(d.promptTokens)],
                ['Output tokens', n(d.completionTokens)],
                ['Retrieved', d.injectedTokens != null ? `~${n(d.injectedTokens)} tok` : '—'],
                ['Duration', d.durationMs != null ? `${(d.durationMs / 1000).toFixed(1)}s` : '—'],
                ['Attempt', d.attempt ?? '—'],
                ['JSON mode', d.json ? 'on' : 'off'],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-black/30 rounded-lg px-2.5 py-1.5 border border-white/5 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
                  <div className="text-[11px] font-mono text-zinc-200 truncate" title={String(value)}>{String(value)}</div>
                </div>
              ))}
            </div>
          )}
          <pre className="text-[11px] font-mono text-zinc-400 bg-black/40 rounded-lg p-3 overflow-x-auto border border-white/5 whitespace-pre-wrap break-words">
            {typeof entry.detail === 'string' ? entry.detail : JSON.stringify(entry.detail, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function DiagnosticsPanel() {
  const [channel, setChannel] = useState<Channel>('all');
  const [level, setLevel] = useState<Level>('all');
  const [scope, setScope] = useState('');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(200);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (channel !== 'all') p.set('channel', channel);
    if (level !== 'all') p.set('level', level);
    if (scope) p.set('scope', scope);
    if (query.trim()) p.set('q', query.trim());
    return p;
  }, [channel, level, scope, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams(params);
      p.set('limit', String(limit));
      const [logRes, sumRes] = await Promise.all([
        apiFetch(`/api/diagnostics?${p}`),
        apiFetch('/api/diagnostics/summary'),
      ]);
      if (!logRes.ok) throw new Error(`${logRes.status} ${await logRes.text()}`);
      const data = await logRes.json();
      setEntries(data.entries || []);
      setTotal(data.total || 0);
      if (sumRes.ok) setSummary(await sumRes.json());
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [params, limit]);

  useEffect(() => { load(); }, [load]);

  // Off by default: a log that moves while you are reading it is worse than one
  // you refresh yourself. It earns its place while reproducing something.
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  /**
   * Exports whatever the filters currently show.
   *
   * Fetched with the auth header and saved from a blob rather than linked
   * directly, because the endpoint is admin-gated and a plain `<a href>` carries
   * no Authorization header.
   */
  const exportLog = async (format: 'txt' | 'json') => {
    try {
      const p = new URLSearchParams(params);
      p.set('format', format);
      const res = await apiFetch(`/api/diagnostics/export?${p}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fauxlore-diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(`Export failed: ${e?.message || e}`);
    }
  };

  const clearLog = async () => {
    const scoped = params.toString().length > 0;
    if (!confirm(scoped
      ? 'Delete the entries matching the current filters? This cannot be undone.'
      : 'Delete the entire diagnostic log? This cannot be undone.')) return;
    try {
      const res = await apiFetch(`/api/diagnostics?${params}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      load();
    } catch (e: any) {
      setError(`Could not clear: ${e?.message || e}`);
    }
  };

  const tabs: { id: Channel; label: string; icon: any }[] = [
    { id: 'all', label: 'Combined', icon: Layers },
    { id: 'internal', label: 'Internal', icon: Server },
    { id: 'ai', label: 'AI API', icon: Cpu },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Diagnostics</h3>
        {summary && (
          <span className="text-[11px] text-zinc-500 font-mono">
            {n(summary.total)} entries
            {summary.oldest ? ` · since ${shortDate(summary.oldest)} ${shortTime(summary.oldest)}` : ''}
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        What the server and the AI actually did. Kept in the database, capped at the most recent 20,000 entries,
        with API keys stripped out. Export it to send it somewhere.
      </p>

      {summary && summary.errorsLastDay > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {summary.errorsLastDay} error{summary.errorsLastDay === 1 ? '' : 's'} in the last 24 hours.
          <button
            type="button"
            onClick={() => { setLevel('error'); setChannel('all'); }}
            className="ml-auto underline hover:text-red-200"
          >
            Show them
          </button>
        </div>
      )}

      {/* The AI summary is the thing that would have answered the questions this
          panel was built for, so it sits above the log rather than inside it. */}
      {channel === 'ai' && summary && summary.aiLastDay.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-black/20 overflow-x-auto">
          <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500 border-b border-white/5">
            Model calls, last 24 hours
          </div>
          <table className="w-full text-[11px] font-mono">
            <thead className="text-zinc-500">
              <tr className="border-b border-white/5">
                {['Model', 'Depth', 'Calls', 'Failed', 'In', 'Out', 'Avg'].map((h, i) => (
                  <th key={h} className={`px-3 py-1.5 font-normal ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {summary.aiLastDay.map((r, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-1.5 text-zinc-200">{r.model || '—'}</td>
                  <td className="px-3 py-1.5 text-right text-zinc-400">{r.depth || '—'}</td>
                  <td className="px-3 py-1.5 text-right">{n(r.calls)}</td>
                  <td className={`px-3 py-1.5 text-right ${r.failures > 0 ? 'text-red-400' : 'text-zinc-500'}`}>{n(r.failures)}</td>
                  <td className="px-3 py-1.5 text-right text-zinc-400">{n(r.promptTokens)}</td>
                  <td className="px-3 py-1.5 text-right text-zinc-400">{n(r.completionTokens)}</td>
                  <td className="px-3 py-1.5 text-right text-zinc-400">{r.avgMs ? `${(r.avgMs / 1000).toFixed(1)}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-black/30 border border-white/5 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setChannel(t.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              channel === t.id ? 'bg-orange-500/15 text-orange-300' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {summary && t.id !== 'all' && (
              <span className="text-[10px] text-zinc-500">
                {n(summary.byChannel.find((c) => c.channel === t.id)?.n || 0)}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages and details…"
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-black/30 border border-white/10 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40"
          />
        </div>

        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as Level)}
          className="px-2.5 py-1.5 text-xs bg-black/30 border border-white/10 rounded-lg text-zinc-200 focus:outline-none focus:border-orange-500/40"
        >
          <option value="all">All levels</option>
          <option value="info">Info and above</option>
          <option value="warn">Warnings and errors</option>
          <option value="error">Errors only</option>
        </select>

        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-black/30 border border-white/10 rounded-lg text-zinc-200 focus:outline-none focus:border-orange-500/40 max-w-[160px]"
        >
          <option value="">All subsystems</option>
          {summary?.scopes.map((s) => (
            <option key={s.scope} value={s.scope}>{s.scope} ({s.n})</option>
          ))}
        </select>

        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="px-2.5 py-1.5 text-xs bg-black/30 border border-white/10 rounded-lg text-zinc-200 focus:outline-none focus:border-orange-500/40"
        >
          {[100, 200, 500, 1000, 2000].map((v) => <option key={v} value={v}>{v} rows</option>)}
        </select>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-zinc-300 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>

        <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-zinc-400 cursor-pointer select-none">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-orange-500" />
          Live
        </label>

        <button
          type="button"
          onClick={() => exportLog('txt')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-zinc-300"
        >
          <Download className="w-3.5 h-3.5" /> .txt
        </button>
        <button
          type="button"
          onClick={() => exportLog('json')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-zinc-300"
        >
          <Download className="w-3.5 h-3.5" /> .json
        </button>
        <button
          type="button"
          onClick={clearLog}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-red-400"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 font-mono break-words">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 text-[10px] uppercase tracking-widest text-zinc-500">
          <span>{entries.length} shown{total > entries.length ? ` of ${n(total)} matching` : ''}</span>
          <span>newest first · click a row for detail</span>
        </div>
        <div className="max-h-[440px] overflow-y-auto">
          {entries.length === 0 ? (
            <div className="px-3 py-10 text-center text-xs text-zinc-500">
              {loading ? 'Loading…' : 'Nothing logged that matches these filters.'}
            </div>
          ) : (
            entries.map((e) => <LogRow key={e.id} entry={e} />)
          )}
        </div>
      </div>
    </div>
  );
}
