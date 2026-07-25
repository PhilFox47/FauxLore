import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, X, Gift, ArrowUpCircle, Presentation, Skull } from 'lucide-react';
import { useMediaContext } from '../contexts/MediaContext';
import { cn } from '../lib/utils';

const ICONS: Record<string, React.ReactNode> = {
  media_update: <ArrowUpCircle className="w-4 h-4 text-emerald-400" />,
  media_released: <Gift className="w-4 h-4 text-sky-400" />,
  recap_ready: <Presentation className="w-4 h-4 text-orange-400" />,
  boss_expiring: <Skull className="w-4 h-4 text-rose-400" />,
};

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

export function NotificationBell() {
  const { notifications, unreadNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } =
    useMediaContext();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const handleOpenItem = async (n: any) => {
    if (!n.readAt) await markNotificationRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
        title={unreadNotifications > 0 ? `${unreadNotifications} unread` : 'Notifications'}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadNotifications > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-orange-500 text-black text-[10px] font-black rounded-full flex items-center justify-center">
            {unreadNotifications > 9 ? '9+' : unreadNotifications}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-2 w-80 max-h-[70vh] bg-[#141417] border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
            <span className="text-sm font-bold text-white">Notifications</span>
            {unreadNotifications > 0 && (
              <button
                onClick={() => markAllNotificationsRead()}
                className="text-[11px] text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto no-scrollbar">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-zinc-500">
                Nothing yet. Releases, updates and finished recaps will show up here.
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={cn(
                    'group flex gap-3 px-4 py-3 border-b border-white/5 last:border-0 cursor-pointer transition-colors',
                    n.readAt ? 'hover:bg-white/[0.03]' : 'bg-orange-500/[0.06] hover:bg-orange-500/10',
                  )}
                  onClick={() => handleOpenItem(n)}
                >
                  <div className="shrink-0 mt-0.5">{ICONS[n.type] || <Bell className="w-4 h-4 text-zinc-500" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className={cn('text-sm truncate', n.readAt ? 'text-zinc-300' : 'text-white font-semibold')}>
                      {n.title}
                    </div>
                    {n.body && <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{n.body}</div>}
                    <div className="text-[10px] text-zinc-600 mt-1 font-mono">{timeAgo(n.createdAt)}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all self-start"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
