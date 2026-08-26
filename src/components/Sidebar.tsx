import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Settings, X, Presentation, BookOpen, Dice5, Shield, Flame, Gem, Globe, Skull, CalendarClock, LogOut, Gamepad2, Book, Headphones, MessagesSquare, Library, Tv, Clapperboard, BookImage, Trophy, MapPin, History } from 'lucide-react';
import { cn } from '../lib/utils';
import { useMediaContext } from '../contexts/MediaContext';
import { useAuth } from '../contexts/AuthContext';
import { MEDIA_COLORS } from '../types/schema';
import { calculateStreak } from '../lib/streak';
import { BRAND_LOGO_URL } from '../lib/brand';
import { NotificationBell } from './NotificationBell';

export function Sidebar({ onCloseMobile, onOpenSettings }: { onCloseMobile?: () => void, onOpenSettings?: () => void }) {
  const { media, logs } = useMediaContext();
  const { logout } = useAuth();

  const getCount = (type: string) => media.filter(m => m.mediaType === type).length;

  const mainItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Lorekeeper', path: '/lorekeeper', icon: Shield },
    { name: 'Lorebook', path: '/lorebook', icon: BookOpen },
    { name: 'Armory', path: '/armory', icon: Gem },
    { name: 'Achievements', path: '/achievements', icon: Trophy },
    { name: 'Roulette', path: '/roulette', icon: Dice5 },
    { name: 'Statistics', path: '/stats', icon: BarChart3 },
    { name: 'Recaps', path: '/recaps', icon: Presentation },
    { name: 'Time Travel', path: '/time-travel', icon: History },
  ];

  const exploreItems = [
    { name: 'Atlas', path: '/atlas', icon: MapPin },
    { name: 'Universes', path: '/universes', icon: Globe },
    { name: 'Graveyard', path: '/graveyard', icon: Skull },
    { name: 'Release Radar', path: '/radar', icon: CalendarClock },
    { name: 'Taxonomy', path: '/taxonomy', icon: BookOpen },
  ];

  const libraryItems = [
    { name: 'Games', path: '/library/Game', count: getCount('Game'), color: MEDIA_COLORS['Game'], icon: Gamepad2 },
    { name: 'Books', path: '/library/Book', count: getCount('Book'), color: MEDIA_COLORS['Book'], icon: Book },
    { name: 'Audiobooks', path: '/library/Audiobook', count: getCount('Audiobook'), color: MEDIA_COLORS['Audiobook'], icon: Headphones },
    { name: 'Visual Novels', path: '/library/Visual%20Novel', count: getCount('Visual Novel'), color: MEDIA_COLORS['Visual Novel'], icon: MessagesSquare },
    { name: 'Manga', path: '/library/Manga', count: getCount('Manga'), color: MEDIA_COLORS['Manga'], icon: Library },
    { name: 'Series', path: '/library/Series', count: getCount('Series'), color: MEDIA_COLORS['Series'], icon: Tv },
    { name: 'Movies', path: '/library/Movie', count: getCount('Movie'), color: MEDIA_COLORS['Movie'], icon: Clapperboard },
    { name: 'Comics', path: '/library/Comic', count: getCount('Comic'), color: MEDIA_COLORS['Comic'], icon: BookImage },
  ];

  const currentStreak = useMemo(() => calculateStreak(logs), [logs]);
  const isActiveStreak = currentStreak > 0;

  return (
    <aside className="w-60 border-r border-white/10 flex flex-col p-6 h-full bg-[#09090B] text-zinc-400">
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-3">
           <img src={BRAND_LOGO_URL} alt="FauxLore" className="h-8 w-auto object-contain cursor-pointer transition-opacity hover:opacity-80" />
           {isActiveStreak && currentStreak > 0 && (
              <div className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded-lg" title={`Current Streak: ${currentStreak} days`}>
                 <Flame className="w-4 h-4 text-orange-500 animate-pulse" />
                 <span className="text-orange-500 font-black text-xs">{currentStreak}</span>
              </div>
           )}
        </div>
        {onCloseMobile && (
          <button onClick={onCloseMobile} className="md:hidden p-1 text-zinc-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-2 text-sm overflow-y-auto no-scrollbar">
        <div className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-600 mb-4 font-display">Main HQ</div>
        {mainItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            onClick={onCloseMobile}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-all font-medium",
                isActive 
                  ? "bg-gradient-to-r from-orange-500/20 to-transparent text-white border-l-2 border-orange-500 shadow-inner" 
                  : "hover:text-white hover:bg-white/5 border-l-2 border-transparent"
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn("w-4 h-4", isActive ? "text-orange-400" : "")} />
                {item.name}
              </>
            )}
          </NavLink>
        ))}

        <div className="pt-8 text-[10px] uppercase tracking-[0.2em] font-black text-zinc-600 mb-4 font-display">Explore</div>
        {exploreItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            onClick={onCloseMobile}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-all font-medium",
                isActive 
                  ? "bg-gradient-to-r from-indigo-500/20 to-transparent text-white border-l-2 border-indigo-500 shadow-inner" 
                  : "hover:text-white hover:bg-white/5 border-l-2 border-transparent"
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn("w-4 h-4", isActive ? "text-indigo-400" : "")} />
                {item.name}
              </>
            )}
          </NavLink>
        ))}

        <div className="pt-8 text-[10px] uppercase tracking-[0.2em] font-black text-zinc-600 mb-4 font-display">Libraries</div>
        <div className="space-y-1">
          {libraryItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-between px-3 py-2 rounded-lg transition-all group font-medium",
                  isActive 
                    ? "bg-white/10 text-white shadow-inner" 
                    : "hover:text-white hover:bg-white/5"
                )
              }
            >
              <div className="flex items-center gap-3">
                 <item.icon className={cn("w-4 h-4", item.color.text)} />
                <span>{item.name}</span>
              </div>
              {item.count > 0 && (
                <span className="text-[10px] bg-black/50 px-2 py-0.5 rounded text-zinc-400 font-mono transition-colors group-hover:text-white shadow-inner border border-white/5">{item.count}</span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="mt-auto space-y-3 pt-6 border-t border-white/5">
        <div className="flex justify-start"><NotificationBell /></div>
        <button onClick={onOpenSettings} className="flex items-center justify-center gap-2 w-full py-3 bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs uppercase font-black tracking-widest transition-colors font-display shadow-inner">
          <Settings className="w-4 h-4 text-zinc-500" />
          Settings
        </button>
        <button onClick={logout} className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-red-950/40 to-transparent border border-red-900/30 hover:border-red-500/50 hover:bg-red-900/40 text-red-500 hover:text-red-400 rounded-xl text-xs uppercase font-black tracking-widest transition-colors font-display">
          <LogOut className="w-4 h-4 opacity-70" />
          Log Out
        </button>
      </div>
    </aside>
  );
}
