import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Artifact } from '../types/schema';
import { Sparkles, Gem, X } from 'lucide-react';

const ARTIFACT_RARITY_COLORS: Record<string, string> = {
  Common: 'text-zinc-400',
  Uncommon: 'text-green-400',
  Rare: 'text-blue-400',
  'Super Rare': 'text-red-500',
  Legendary: 'text-orange-500',
  Mythic: 'text-fuchsia-500' // Base fallback color, mythic will override styles specifically below
};
import { cn } from '../lib/utils';
import Confetti from 'react-confetti';

interface LootRevealProps {
  artifact: Artifact | null;
  onClose: () => void;
}

export function LootReveal({ artifact, onClose }: LootRevealProps) {
  const [windowDimensions, setWindowDimensions] = useState({ width: 0, height: 0 });
  const [showDetails, setShowDetails] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
  }, []);

  useEffect(() => {
    if (artifact) {
      if (artifact.rarity === 'Mythic' || artifact.rarity === 'Legendary') {
         setShake(true);
         const s = setTimeout(() => {
            setShake(false);
            setShowDetails(true);
         }, 2500); // longer buildup for legendary/mythic
         return () => clearTimeout(s);
      } else {
         const t = setTimeout(() => setShowDetails(true), 1500);
         return () => clearTimeout(t);
      }
    } else {
      setShowDetails(false);
      setShake(false);
    }
  }, [artifact]);

  if (!artifact) return null;

  const colorCls = ARTIFACT_RARITY_COLORS[artifact.rarity] || 'text-zinc-400';
  let borderCls = colorCls.replace('text-', 'border-').replace('500', '500/50').replace('400', '400/50');
  let bgCls = colorCls.replace('text-', 'bg-').replace('400', '400/10').replace('500', '500/10');
  
  if (artifact.rarity === 'Mythic') {
     borderCls = 'border-fuchsia-500/50';
     bgCls = 'bg-fuchsia-500/10';
  }

  const rarityConfig: Record<string, { confettiCount: number, colors: string[], shakeIntensity: number }> = {
    Common: { confettiCount: 50, colors: ['#a1a1aa', '#d4d4d8', '#ffffff'], shakeIntensity: 0 },
    Uncommon: { confettiCount: 150, colors: ['#4ade80', '#22c55e', '#86efac'], shakeIntensity: 0 },
    Rare: { confettiCount: 250, colors: ['#60a5fa', '#3b82f6', '#93c5fd'], shakeIntensity: 0 },
    'Super Rare': { confettiCount: 400, colors: ['#f87171', '#ef4444', '#fca5a5'], shakeIntensity: 0 },
    Legendary: { confettiCount: 800, colors: ['#fbbf24', '#f97316', '#fcd34d'], shakeIntensity: 5 },
    Mythic: { confettiCount: 1500, colors: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'], shakeIntensity: 10 },
  };

  const config = rarityConfig[artifact.rarity] || rarityConfig.Common;
  const isRainbow = artifact.rarity === 'Mythic';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-hidden"
      >
        {(!shake) && (
          <Confetti
            width={windowDimensions.width}
            height={windowDimensions.height}
            colors={config.colors}
            numberOfPieces={config.confettiCount}
            recycle={false}
            gravity={isRainbow ? 0.2 : 0.15}
          />
        )}

        <motion.div
          initial={{ scale: 0.8, y: 50, opacity: 0 }}
          animate={
            shake 
              ? { x: [-config.shakeIntensity, config.shakeIntensity, -config.shakeIntensity, config.shakeIntensity, 0], scale: 1, opacity: 1 }
              : { scale: 1, y: 0, opacity: 1 }
          }
          transition={
            shake 
              ? { repeat: Infinity, duration: 0.1 }
              : { type: "spring", duration: 0.8, bounce: 0.5 }
          }
          className={cn(
            "relative w-full max-w-sm rounded-[2rem] border-2 p-8 text-center bg-zinc-950 flex flex-col items-center justify-center overflow-hidden",
            borderCls
          )}
          style={{
            boxShadow: `0 0 ${isRainbow ? '60px' : '40px'} -10px var(--tw-shadow-color)`,
          }}
        >
          {/* Background rays effect */}
          {!shake && (
             <motion.div 
               animate={{ rotate: 360 }}
               transition={{ duration: isRainbow ? 10 : 20, repeat: Infinity, ease: "linear" }}
               className={cn("absolute inset-0 pointer-events-none", isRainbow ? 'opacity-40' : 'opacity-20')}
               style={{
                 background: isRainbow 
                   ? 'conic-gradient(from 0deg, #ef4444 0 60deg, #f97316 60deg 120deg, #eab308 120deg 180deg, #22c55e 180deg 240deg, #3b82f6 240deg 300deg, #a855f7 300deg 360deg)'
                   : `conic-gradient(from 0deg, transparent 0 45deg, currentColor 45deg 90deg, transparent 90deg 135deg, currentColor 135deg 180deg, transparent 180deg 225deg, currentColor 225deg 270deg, transparent 270deg 315deg, currentColor 315deg 360deg)`
               }}
             />
          )}

          <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white/50 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>

          <div className="relative z-10 flex flex-col items-center w-full">
            <motion.div
              animate={shake ? {} : { 
                y: [0, -10, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                duration: isRainbow ? 1 : 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className={cn("p-6 rounded-full border mb-6", borderCls, bgCls)}
              style={isRainbow && !shake ? { background: 'linear-gradient(to right, #ef4444, #eab308, #3b82f6)' } : {}}
            >
              <Gem className={cn("w-16 h-16", isRainbow ? 'text-white' : colorCls)} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: showDetails ? 1 : 0, y: showDetails ? 0 : 20 }}
              transition={{ duration: 0.5 }}
              className="w-full flex justify-center items-center gap-2 mb-2"
            >
              <Sparkles className={cn("w-4 h-4", isRainbow ? 'text-yellow-400' : colorCls)} />
              <span className={cn("font-bold uppercase tracking-wider text-sm", isRainbow ? 'text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-yellow-400 to-blue-400' : colorCls)}>
                {artifact.rarity} {artifact.type}
              </span>
              <Sparkles className={cn("w-4 h-4", isRainbow ? 'text-yellow-400' : colorCls)} />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: showDetails ? 1 : 0, scale: showDetails ? 1 : 0.9 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-2xl font-black text-white mb-4 leading-tight"
            >
              {artifact.name}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: showDetails ? 1 : 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="text-zinc-400 text-sm mb-8 leading-relaxed px-4"
            >
              "{artifact.description}"
            </motion.p>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: showDetails ? 1 : 0, y: showDetails ? 0 : 10 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              onClick={onClose}
              className={cn(
                "px-8 py-3 rounded-full font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95",
                bgCls.replace('/10', ''), borderCls
              )}
              style={isRainbow ? { background: 'linear-gradient(to right, #3b82f6, #a855f7)' } : { backgroundColor: 'var(--tw-shadow-color)' }}
            >
              Collect
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
