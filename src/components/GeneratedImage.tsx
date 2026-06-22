import { useState } from 'react';
import { Loader2, RefreshCw, ImageOff } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Status-aware image for AI-generated boss/artifact art.
 * - has url      -> shows the image (click to expand)
 * - 'generating' -> shows a spinner placeholder
 * - 'failed'     -> shows a failed placeholder with a manual Regenerate button (no auto-retry)
 * - otherwise    -> renders nothing (keeps old, status-less items uncluttered)
 */
export function GeneratedImage({
  url,
  status,
  alt,
  aspectClass = 'aspect-[4/3]',
  onExpand,
  onRegenerate,
}: {
  url?: string | null;
  status?: 'generating' | 'done' | 'failed';
  alt?: string;
  aspectClass?: string;
  onExpand?: () => void;
  onRegenerate?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const regen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRegenerate || busy) return;
    setBusy(true);
    try { await onRegenerate(); } catch (err) { console.error(err); } finally { setBusy(false); }
  };

  if (url) {
    return (
      <div
        className={cn('w-full rounded-2xl overflow-hidden border border-white/10 shadow-lg bg-zinc-900 cursor-pointer mb-4 relative group/image', aspectClass)}
        onClick={(e) => { e.stopPropagation(); onExpand?.(); }}
      >
        <img src={url} alt={alt} className="w-full h-full object-cover transition-transform duration-700 group-hover/image:scale-105" referrerPolicy="no-referrer" />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent pointer-events-none" />
      </div>
    );
  }

  if (status === 'generating' || busy) {
    return (
      <div className={cn('w-full rounded-2xl border border-white/10 bg-black/30 mb-4 flex flex-col items-center justify-center gap-2 text-zinc-500', aspectClass)}>
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        <span className="text-[11px] font-bold uppercase tracking-widest">Generating image…</span>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className={cn('w-full rounded-2xl border border-red-500/20 bg-red-500/5 mb-4 flex flex-col items-center justify-center gap-3 text-red-300/80 p-4 text-center', aspectClass)}>
        <ImageOff className="w-6 h-6" />
        <span className="text-[11px] font-bold uppercase tracking-widest">Image failed</span>
        {onRegenerate && (
          <button
            onClick={regen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-200 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Regenerate
          </button>
        )}
      </div>
    );
  }

  return null;
}
