import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gem, Anvil, Sparkles, Flame, Wand2, Stars } from 'lucide-react';
import { cn } from '../lib/utils';

const FORGING_PHRASES = [
  "Striking the Anvil...",
  "Appraising Relic...",
  "Channeling Arcane...",
  "Polishing Gemstones...",
  "Weaving Fate...",
  "Extracting Magic...",
  "Unveiling Legacy..."
];

export function ForgingButton({ isLooting, onClick }: { isLooting: boolean, onClick: () => void }) {
  const [phase, setPhase] = useState(0);
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (isLooting) {
      const interval = setInterval(() => {
        setPhase(p => (p + 1) % 4);
      }, 700);
      return () => clearInterval(interval);
    } else {
      setPhase(0);
    }
  }, [isLooting]);

  useEffect(() => {
    if (isLooting) {
      setPhraseIndex(0);
      const textInterval = setInterval(() => {
        setPhraseIndex(i => (i + 1) % FORGING_PHRASES.length);
      }, 2500);
      return () => clearInterval(textInterval);
    }
  }, [isLooting]);

  if (isLooting) {
    return (
      <div className="w-full relative py-6 bg-gradient-to-r from-purple-900/40 via-indigo-900/40 to-purple-900/40 border-2 border-purple-500/50 rounded-2xl flex flex-col items-center justify-center overflow-hidden">
        {/* Background glow and sparks */}
        <motion.div 
           className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/20 to-transparent"
           animate={{ x: ['-100%', '100%'] }}
           transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div 
           className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/5 to-transparent"
           animate={{ y: ['-100%', '100%'] }}
           transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />

        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="relative w-16 h-16 flex flex-col items-center justify-end mb-1">
             <motion.div
               animate={{ y: [0, -12, 0], scale: [1, 1.2, 1], rotate: [0, -15, 15, 0] }}
               transition={{ duration: 1.4, repeat: Infinity }}
               className="absolute top-0 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)]"
             >
               <Flame className="w-8 h-8" />
             </motion.div>
             
             {phase % 2 === 0 ? (
               <Anvil className="w-10 h-10 text-purple-300 relative z-10 drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]" />
             ) : (
               <Wand2 className="w-10 h-10 text-indigo-300 relative z-10 drop-shadow-[0_0_5px_rgba(99,102,241,0.5)] -scale-x-100 animate-pulse" />
             )}
             
             <AnimatePresence>
               {phase === 0 && (
                 <motion.div 
                   initial={{ opacity: 1, scale: 0, y: 0, x: 0 }}
                   animate={{ opacity: 0, scale: 2, y: -30, x: -30 }}
                   exit={{ opacity: 0 }}
                   transition={{ duration: 0.8 }}
                   className="absolute top-2 left-2 pointer-events-none"
                 >
                   <Sparkles className="w-5 h-5 text-yellow-300 drop-shadow-md" />
                 </motion.div>
               )}
               {phase === 2 && (
                 <motion.div 
                   initial={{ opacity: 1, scale: 0, y: 0, x: 0 }}
                   animate={{ opacity: 0, scale: 2, y: -35, x: 30 }}
                   exit={{ opacity: 0 }}
                   transition={{ duration: 0.8 }}
                   className="absolute top-0 right-0 pointer-events-none"
                 >
                   <Sparkles className="w-6 h-6 text-yellow-400 drop-shadow-md" />
                 </motion.div>
               )}
               {phase === 1 && (
                 <motion.div 
                   initial={{ opacity: 1, scale: 0, y: 0 }}
                   animate={{ opacity: 0, scale: 1.5, y: -40 }}
                   exit={{ opacity: 0 }}
                   transition={{ duration: 0.8 }}
                   className="absolute -top-4 pointer-events-none"
                 >
                   <Stars className="w-5 h-5 text-fuchsia-300 drop-shadow-md" />
                 </motion.div>
               )}
               {phase === 3 && (
                 <motion.div 
                   initial={{ opacity: 1, scale: 0, x: 0 }}
                   animate={{ opacity: 0, scale: 2, x: -30, y: 10 }}
                   exit={{ opacity: 0 }}
                   transition={{ duration: 0.8 }}
                   className="absolute bottom-2 left-0 pointer-events-none"
                 >
                   <Sparkles className="w-4 h-4 text-cyan-300 drop-shadow-md" />
                 </motion.div>
               )}
             </AnimatePresence>
          </div>
          
          <div className="h-6 overflow-hidden relative w-48 mx-auto self-center flex items-center justify-center">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={phraseIndex}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-400 to-indigo-400 text-sm uppercase text-center absolute"
              >
                {FORGING_PHRASES[phraseIndex]}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button 
      onClick={onClick}
      className="w-full py-4 border-2 border-dashed border-purple-500/30 hover:border-purple-500/60 rounded-2xl flex flex-col items-center justify-center gap-2 group transition-all"
    >
      <Gem className="w-8 h-8 text-purple-400 group-hover:scale-110 group-hover:text-purple-300 transition-all mb-1 drop-shadow-lg" />
      <span className="font-black text-purple-400 tracking-wider">
         Claim Conquest Loot!
      </span>
    </button>
  );
}
