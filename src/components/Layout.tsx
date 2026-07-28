import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Outlet } from 'react-router-dom';
import { Menu, X, Eye, PauseCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { BRAND_LOGO_URL } from '../lib/brand';
import { SettingsModal } from './SettingsModal';
import { Celebrations } from './Celebrations';
import { useAuth } from '../contexts/AuthContext';
import { useMediaContext } from '../contexts/MediaContext';

export function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { user, impersonating, stopImpersonating } = useAuth();
  const { activity } = useMediaContext();

  const handleReturn = async () => {
    await stopImpersonating();
    window.location.href = '/';
  };

  return (
    <div className="flex bg-[#09090B] text-[#FAFAFA] min-h-screen font-sans overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Wrapper */}
      <div 
        className={cn(
          "fixed inset-y-0 left-0 z-50 transform md:translate-x-0 transition-transform duration-300 ease-in-out w-60",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar 
          onCloseMobile={() => setIsMobileMenuOpen(false)} 
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </div>

      <main className="flex-1 md:ml-60 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-white/5 bg-[#09090B] z-30">
          <div className="flex items-center">
            <img src={BRAND_LOGO_URL} alt="FauxLore" className="h-8 w-auto object-contain" />
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-zinc-400 hover:text-white bg-white/5 rounded-lg"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        {/* Viewing another account: keep this unmissable so admin actions are never
            taken in someone else's library by accident. */}
        {impersonating && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-100 z-30 flex-wrap">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <Eye className="w-4 h-4 shrink-0" />
              <span className="truncate">
                Viewing as <strong>{user?.username}</strong> (signed in as {impersonating.byUsername})
              </span>
            </div>
            <button
              onClick={handleReturn}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 transition-colors shrink-0"
            >
              Return to my account
            </button>
          </div>
        )}

        {/* Paused for inactivity. Said out loud, because the alternative is a
            user wondering why nothing generates and hitting silent refusals. */}
        {activity?.frozen && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-sky-500/10 border-b border-sky-500/25 text-sky-100 z-30">
            <PauseCircle className="w-4 h-4 shrink-0 text-sky-400" />
            <p className="text-sm min-w-0">
              <strong className="font-black">Paused.</strong>{' '}
              {activity.lastLogAt
                ? `Nothing has been logged for ${activity.daysSince} days`
                : 'Nothing has been logged yet'}
              , so recaps, enemies and tagging are on hold. Log any progress and they resume immediately.
            </p>
          </div>
        )}

        <div className="flex-1 p-4 md:p-8 bg-gradient-to-br from-[#09090B] to-[#121214] overflow-y-auto relative">
          <div className="fixed top-0 right-0 bottom-0 left-0 md:left-60 pointer-events-none z-0">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.08] mix-blend-screen"></div>
          </div>
          <div className="flex flex-col gap-6 w-full min-h-full max-w-7xl mx-auto relative z-10">
            <Outlet />
          </div>
        </div>
      </main>
      
      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}

      <Celebrations />
    </div>
  );
}
