import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Download, Trash2, ChevronRight, AlertTriangle, Search,
  Cpu, Server, Layers, Copy, Check, Loader2, Ghost, ArrowUp, ArrowDown, Scissors,
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
  inFlight: { ts: string; message: string; callId: string; model: string; callScope: string; attempt: number }[];
  abandoned: { ts: string; message: string; model: string; callScope: string }[];
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

/** "4m 12s" — how long something has been going, at a glance. */
function elapsed(sinceIso: string, now: number): string {
  const ms = Math.max(0, now - new Date(sinceIso).getTime());
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

interface Exchange {
  prompt: string | null;
  reply: string | null;
  promptBytes: number | null;
  replyBytes: number | null;
  promptTruncated: boolean;
  replyTruncated: boolean;
  verdict: { parses: boolean; endsCleanly: boolean; lastChars: string };
}

/** One side of an exchange: collapsed by default, copyable, monospaced. */
function Body({ label, icon: Icon, text, bytes, clipped }: {
  label: string; icon: any; text: string; bytes: number | null; clipped: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-white/5 bg-black/40 overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <Icon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span className="text-[10px] uppercase tracking-wider text-zinc-400">{label}</span>
          <span className="text-[10px] text-zinc-600 font-mono">
            {bytes != null ? `${bytes.toLocaleString()} bytes` : ''}{clipped ? ' · middle trimmed' : ''}
          </span>
          <ChevronRight className={`w-3 h-3 text-zinc-600 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {}); }}
          className="shrink-0 p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-200"
          title={`Copy the ${label.toLowerCase()}`}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      {open && (
        <pre className="text-[11px] font-mono text-zinc-400 px-3 pb-3 max-h-[300px] overflow-auto whitespace-pre-wrap break-words">
          {text}
        </pre>
      )}
    </div>
  );
}

function LogRow({ entry }: { entry: Entry }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [loadingExchange, setLoadingExchange] = useState(false);
  const hasDetail = entry.detail !== null && entry.detail !== undefined;
  const d = entry.detail || {};
  const callId: string | undefined = d.callId;

  // Fetched only when the row is opened: a Codex prompt and reply together are a
  // couple of hundred kilobytes, and nobody skimming two hundred rows wants that.
  useEffect(() => {
    if (!open || !callId || exchange || loadingExchange) return;
    setLoadingExchange(true);
    apiFetch(`/api/diagnostics/payload/${encodeURIComponent(callId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => setExchange(v))
      .catch(() => {})
      .finally(() => setLoadingExchange(false));
  }, [open, callId, exchange, loadingExchange]);

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
          {callId && (
            <div className="space-y-2 mb-2">
              {loadingExchange && <div className="text-[11px] text-zinc-500">Loading the exchange…</div>}

              {/* The question this whole thing exists to answer: was the reply
                  cut off, or was it just wrong? They have opposite fixes. */}
              {exchange?.reply && !exchange.verdict.parses && (
                <div className={`flex items-start gap-2 px-2.5 py-2 rounded-lg text-[11px] border ${
                  exchange.verdict.endsCleanly
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    : 'bg-red-500/10 border-red-500/20 text-red-300'
                }`}>
                  <Scissors className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    {exchange.verdict.endsCleanly
                      ? 'The reply is not valid JSON, but it does end on a closing bracket — malformed rather than cut off.'
                      : 'The reply stops mid-document: it is not valid JSON and does not end on a closing bracket. It was cut off.'}
                    <div className="mt-1 font-mono text-[10px] text-zinc-400 break-all">
                      ends with: …{exchange.verdict.lastChars}
                    </div>
                  </div>
                </div>
              )}

              {exchange?.prompt && (
                <Body label="Prompt sent" icon={ArrowUp} text={exchange.prompt}
                      bytes={exchange.promptBytes} clipped={exchange.promptTruncated} />
              )}
              {exchange?.reply && (
                <Body label="Reply received" icon={ArrowDown} text={exchange.reply}
                      bytes={exchange.replyBytes} clipped={exchange.replyTruncated} />
              )}
              {!loadingExchange && exchange === null && (
                <div className="text-[11px] text-zinc-600">
                  The exchange for this call is no longer kept — only the most recent 300 are.
                </div>
              )}
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
  // Ticks once a second purely so the in-flight durations count up. Cheap, and
  // the whole point of the panel is answering "is it still going".
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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
        What the server and the AI actually did. Kept in the database, capped at the most recent 20,000 entries —
        plus the last 300 prompts and replies in full — with API keys stripped out. Open an AI row to read the
        exchange; export it to send it somewhere.
      </p>

      {summary && summary.inFlight?.length > 0 && (
        <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-sky-300 border-b border-sky-500/10">
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
            {summary.inFlight.length} call{summary.inFlight.length === 1 ? '' : 's'} still running
          </div>
          {summary.inFlight.map((c) => (
            <div key={c.callId} className="flex items-center gap-3 px-3 py-1.5 text-[11px] font-mono text-sky-200/80">
              <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-[10px]">{c.callScope || 'ai'}</span>
              <span className="flex-1 truncate" title={c.model}>{c.model}</span>
              {c.attempt > 1 && <span className="text-sky-300/60">attempt {c.attempt}</span>}
              <span className="tabular-nums text-sky-300">{elapsed(c.ts, now)}</span>
            </div>
          ))}
        </div>
      )}

      {summary && summary.abandoned?.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-amber-300 border-b border-amber-500/10">
            <Ghost className="w-4 h-4 shrink-0" />
            {summary.abandoned.length} call{summary.abandoned.length === 1 ? '' : 's'} never finished before the last restart
          </div>
          {summary.abandoned.map((c, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-[11px] font-mono text-amber-200/70">
              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-[10px]">{c.callScope || 'ai'}</span>
              <span className="flex-1 truncate" title={c.model}>{c.model}</span>
              <span className="tabular-nums">{shortTime(c.ts)}</span>
            </div>
          ))}
        </div>
      )}

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
          <option value="all">All levels (incl. call starts)</option>
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
