import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Settings, X, Presentation, BookOpen, Dice5, Shield } from 'lucide-react';
import { cn } from '../lib/utils';
import { useMediaContext } from '../contexts/MediaContext';
import { MEDIA_COLORS } from '../types/schema';

export function Sidebar({ onCloseMobile, onOpenSettings }: { onCloseMobile?: () => void, onOpenSettings?: () => void }) {
  const { media } = useMediaContext();

  const getCount = (type: string) => media.filter(m => m.mediaType === type).length;

  const mainItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Lorekeeper', path: '/lorekeeper', icon: Shield },
    { name: 'Lorebook', path: '/lorebook', icon: BookOpen },
    { name: 'Roulette', path: '/roulette', icon: Dice5 },
    { name: 'Statistics', path: '/stats', icon: BarChart3 },
    { name: 'Recaps', path: '/recaps', icon: Presentation },
  ];

  const libraryItems = [
    { name: 'Games', path: '/library/Game', count: getCount('Game'), color: MEDIA_COLORS['Game'] },
    { name: 'Books', path: '/library/Book', count: getCount('Book'), color: MEDIA_COLORS['Book'] },
    { name: 'Visual Novels', path: '/library/Visual%20Novel', count: getCount('Visual Novel'), color: MEDIA_COLORS['Visual Novel'] },
    { name: 'Manga', path: '/library/Manga', count: getCount('Manga'), color: MEDIA_COLORS['Manga'] },
    { name: 'Series', path: '/library/Series', count: getCount('Series'), color: MEDIA_COLORS['Series'] },
    { name: 'Movies', path: '/library/Movie', count: getCount('Movie'), color: MEDIA_COLORS['Movie'] },
    { name: 'Comics', path: '/library/Comic', count: getCount('Comic'), color: MEDIA_COLORS['Comic'] },
  ];

  return (
    <aside className="w-60 border-r border-white/10 flex flex-col p-6 h-full bg-[#09090B] text-zinc-400">
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl text-white">F</div>
          <h1 className="text-xl font-bold tracking-tight text-white line-clamp-1">FauxLore</h1>
        </div>
        {onCloseMobile && (
          <button onClick={onCloseMobile} className="md:hidden p-1 text-zinc-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-2 text-sm overflow-y-auto">
        <div className="text-[10px] uppercase tracking-widest font-semibold text-zinc-600 mb-4">Main</div>
        {mainItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            onClick={onCloseMobile}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                isActive 
                  ? "bg-white/5 text-white" 
                  : "hover:text-white"
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.name}
          </NavLink>
        ))}

        <div className="pt-8 text-[10px] uppercase tracking-widest font-semibold text-zinc-600 mb-4">Library</div>
        <div className="space-y-1">
          {libraryItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-between px-3 py-2 rounded-md transition-all group",
                  isActive 
                    ? "bg-white/5 text-white" 
                    : "hover:text-white hover:bg-white/5"
                )
              }
            >
              <div className="flex items-center gap-3">
                <div className={cn("w-2 h-2 rounded-full", item.color.bg)} />
                <span>{item.name}</span>
              </div>
              {item.count > 0 && (
                <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono transition-colors group-hover:bg-zinc-700">{item.count}</span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <button onClick={onOpenSettings} className="mt-auto flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-900/20">
        <Settings className="w-4 h-4" />
        Settings
      </button>
    </aside>
  );
}
