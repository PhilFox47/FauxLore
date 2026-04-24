import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gem, Anvil, Sparkles, Flame } from 'lucide-react';
import { cn } from '../lib/utils';

export function ForgingButton({ isLooting, onClick }: { isLooting: boolean, onClick: () => void }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (isLooting) {
      const interval = setInterval(() => {
        setPhase(p => (p + 1) % 3);
      }, 800);
      return () => clearInterval(interval);
    } else {
      setPhase(0);
    }
  }, [isLooting]);

  if (isLooting) {
    return (
      <div className="w-full relative py-4 bg-purple-900/20 border-2 border-purple-500/50 rounded-2xl flex flex-col items-center justify-center overflow-hidden">
        {/* Background glow and sparks */}
        <motion.div 
           className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/10 to-transparent"
           animate={{ x: ['-100%', '100%'] }}
           transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />

        <div className="relative z-10 flex flex-col items-center gap-2">
          <div className="relative w-12 h-12 flex flex-col items-center justify-end mb-1">
             <motion.div
               animate={{ y: [0, -10, 0], rotate: [0, -15, 0] }}
               transition={{ duration: 0.8, repeat: Infinity }}
               className="absolute top-0 text-amber-400"
             >
               <Flame className="w-6 h-6" />
             </motion.div>
             <Anvil className="w-8 h-8 text-purple-400 relative z-10" />
             
             <AnimatePresence>
               {phase === 0 && (
                 <motion.div 
                   initial={{ opacity: 1, scale: 0, y: 0, x: 0 }}
                   animate={{ opacity: 0, scale: 1.5, y: -20, x: -20 }}
                   exit={{ opacity: 0 }}
                   transition={{ duration: 0.6 }}
                   className="absolute top-2 left-2 pointer-events-none"
                 >
                   <Sparkles className="w-4 h-4 text-yellow-300" />
                 </motion.div>
               )}
               {phase === 1 && (
                 <motion.div 
                   initial={{ opacity: 1, scale: 0, y: 0, x: 0 }}
                   animate={{ opacity: 0, scale: 1.5, y: -25, x: 20 }}
                   exit={{ opacity: 0 }}
                   transition={{ duration: 0.6 }}
                   className="absolute top-0 right-0 pointer-events-none"
                 >
                   <Sparkles className="w-4 h-4 text-yellow-400" />
                 </motion.div>
               )}
             </AnimatePresence>
          </div>
          
          <div className="font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-400 to-purple-400 flex items-center">
            Forging Legacy
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              ...
            </motion.span>
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
      <Gem className="w-8 h-8 text-purple-400 group-hover:scale-110 group-hover:text-purple-300 transition-all mb-1" />
      <span className="font-black text-purple-400 tracking-wider">
         Claim Conquest Loot!
      </span>
    </button>
  );
}
