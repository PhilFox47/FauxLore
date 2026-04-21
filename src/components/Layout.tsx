import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { SettingsModal } from './SettingsModal';

export function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl text-white">F</div>
            <h1 className="text-xl font-bold tracking-tight text-white">FauxLore</h1>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-zinc-400 hover:text-white bg-white/5 rounded-lg"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 p-4 md:p-8 bg-gradient-to-br from-[#09090B] to-[#121214] overflow-y-auto">
          <div className="flex flex-col gap-6 w-full h-full max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
      
      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
}
