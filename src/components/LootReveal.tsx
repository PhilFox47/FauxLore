import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Artifact, RARITY_COLORS } from '../types/schema';
import { Sparkles, Gem, X, Crown, Shirt, Footprints, Sword, Shield } from 'lucide-react';
import { playLootSound } from '../lib/sounds';

const renderSlotIcon = (slot: string, className: string) => {
  switch(slot) {
    case 'Head': return <Crown className={className} />;
    case 'Body': return <Shirt className={className} />;
    case 'Legs': return <Footprints className={className} />;
    case 'Primary': return <Sword className={className} />;
    case 'Secondary': return <Shield className={className} />;
    default: return <Gem className={className} />;
  }
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
         playLootSound(artifact.rarity, 'buildup');
         const s = setTimeout(() => {
            setShake(false);
            setShowDetails(true);
            playLootSound(artifact.rarity, 'reveal');
         }, 2500); // longer buildup for legendary/mythic
         return () => clearTimeout(s);
      } else {
         playLootSound(artifact.rarity, 'buildup');
         const t = setTimeout(() => {
           setShowDetails(true);
           playLootSound(artifact.rarity, 'reveal');
         }, 1500);
         return () => clearTimeout(t);
      }
    } else {
      setShowDetails(false);
      setShake(false);
    }
  }, [artifact]);

  if (!artifact) return null;

  const colorConfig = RARITY_COLORS[artifact.rarity] || RARITY_COLORS['Common'];
  const colorCls = colorConfig.text;
  let borderCls = colorConfig.border.replace('500', '500/50');
  let bgCls = colorConfig.bg;
  
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
  const isLegendary = artifact.rarity === 'Legendary';
  const isHighTier = isRainbow || isLegendary;

  // Enhance colors for Mythic holographic look
  const getCardStyle = () => {
     if (isRainbow) {
       return {
         background: 'linear-gradient(135deg, rgba(20,20,24,0.95) 0%, rgba(10,10,12,0.95) 100%)',
         boxShadow: shake ? '0 0 100px -20px #a855f7, inset 0 0 40px rgba(168,85,247,0.3)' : '0 0 80px -10px #a855f7, inset 0 0 20px rgba(168,85,247,0.2)',
         borderColor: 'rgba(216,180,254,0.4)',
       };
     } else if (isLegendary) {
       return {
         background: 'linear-gradient(135deg, rgba(24,20,10,0.95) 0%, rgba(12,10,5,0.95) 100%)',
         boxShadow: shake ? '0 0 80px -20px #fbbf24, inset 0 0 40px rgba(251,191,36,0.2)' : '0 0 60px -10px #f59e0b, inset 0 0 20px rgba(251,191,36,0.1)',
         borderColor: 'rgba(251,191,36,0.4)',
       };
     }
     
     // Generic fallback that uses the rarity color softly
     return {
         backgroundColor: 'rgba(9,9,11,0.95)',
         boxShadow: `0 30px 60px -15px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)`,
     };
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/90 backdrop-blur-md p-4 sm:p-8 overflow-hidden perspective-1000"
      >
        {/* Confetti Celebration */}
        {showDetails && (
          <Confetti
            width={windowDimensions.width}
            height={windowDimensions.height}
            colors={config.colors}
            numberOfPieces={config.confettiCount}
            recycle={false}
            gravity={isHighTier ? 0.2 : 0.15}
            initialVelocityY={isHighTier ? 20 : 10}
            className="z-0"
          />
        )}

        {/* Ambient background glow for high tier */}
        {showDetails && isHighTier && (
          <motion.div
             initial={{ opacity: 0, scale: 0.5 }}
             animate={{ opacity: 0.4, scale: 1.5 }}
             transition={{ duration: 1.5, ease: "easeOut" }}
             className={cn("absolute top-1/2 left-1/2 w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px] z-0")}
             style={{
                background: isRainbow 
                  ? 'radial-gradient(circle, rgba(168,85,247,0.8) 0%, rgba(239,68,68,0.4) 50%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(251,191,36,0.8) 0%, rgba(245,158,11,0.4) 50%, transparent 70%)'
             }}
          />
        )}

        {/* The Card */}
        <motion.div
          initial={{ scale: 0.4, y: 150, opacity: 0, rotateX: 45 }}
          animate={
            shake 
              ? { x: [-config.shakeIntensity, config.shakeIntensity, -config.shakeIntensity, config.shakeIntensity, 0], scale: 1.05, opacity: 1, rotateX: 0 }
              : { scale: 1, y: 0, opacity: 1, rotateX: 0 }
          }
          transition={
            shake 
              ? { repeat: Infinity, duration: 0.08, ease: "linear" }
              : { type: "spring", duration: 0.8, bounce: 0.4 }
          }
          className={cn(
            "relative w-full max-w-[360px] sm:max-w-md rounded-[2rem] border p-6 sm:p-8 text-center flex flex-col items-center justify-center overflow-hidden z-20 group",
            !isHighTier && borderCls
          )}
          style={getCardStyle()}
        >
          {/* Card inner background texture */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03] mix-blend-overlay pointer-events-none"></div>

          {/* Dramatic light sweep effect for legendary/mythic */}
          {showDetails && isHighTier && (
             <motion.div 
               initial={{ left: '-100%' }}
               animate={{ left: '200%' }}
               transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }}
               className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 pointer-events-none mix-blend-overlay"
             />
          )}

          {/* Holographic shifting glow (Mythic only) */}
          {!shake && isRainbow && (
             <motion.div 
               animate={{ rotate: [0, 360] }}
               transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
               className="absolute -inset-[100%] pointer-events-none opacity-30 mix-blend-color-dodge"
               style={{
                 background: 'conic-gradient(from 0deg, transparent 0deg, #ef4444 30deg, #eab308 90deg, #22c55e 150deg, #3b82f6 210deg, #a855f7 270deg, transparent 330deg)'
               }}
             />
          )}

          <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2.5 rounded-full bg-black/40 text-zinc-400 hover:text-white hover:bg-black/60 transition-colors backdrop-blur-md border border-white/5 disabled:opacity-0"
            disabled={shake}
          >
            <X className="w-5 h-5" />
          </button>

          <div className="relative z-30 flex flex-col items-center w-full">
            
            {/* Rarity & Item Type Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: showDetails ? 1 : 0, scale: showDetails ? 1 : 0.8, y: showDetails ? 0 : 10 }}
              transition={{ duration: 0.6, delay: 0.2, type: "spring" }}
              className="w-full flex justify-center items-center gap-2 mb-6 mt-2"
            >
              <Sparkles className={cn("w-4 h-4", isRainbow ? 'text-yellow-400 animate-pulse' : colorCls)} />
              <span className={cn(
                "font-black uppercase tracking-[0.2em] text-xs sm:text-sm font-display", 
                isRainbow ? 'text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-yellow-400 to-blue-400 drop-shadow-sm' : colorCls
              )}>
                {artifact.rarity} {artifact.type}
              </span>
              <Sparkles className={cn("w-4 h-4", isRainbow ? 'text-yellow-400 animate-pulse' : colorCls)} />
            </motion.div>

            {/* The Gem Icon Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={showDetails ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.5, y: 20 }}
              transition={{ 
                duration: 0.6, 
                delay: 0.8, 
                type: "spring"
              }}
              className="relative mb-8 mt-2"
            >
               {/* Ambient bobbing after reveal */}
               <motion.div
                 animate={{ y: [0, -8, 0] }}
                 transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}
               >
                 {/* Under glow */}
                 <div className={cn("absolute inset-0 blur-2xl rounded-full opacity-60", bgCls, !showDetails && "hidden")}></div>
                 
                 <div className={cn(
                   "relative p-5 sm:p-6 rounded-[1.5rem] border shadow-2xl flex items-center justify-center backdrop-blur-xl transition-all duration-700",
                   shake ? "scale-90 brightness-150" : "scale-100",
                   isRainbow ? "border-purple-500/50 bg-gradient-to-br from-purple-900/40 to-black/80" : cn(borderCls, bgCls)
                 )}>
                   {artifact.imageUrl ? (
                      <img src={artifact.imageUrl} referrerPolicy="no-referrer" alt={artifact.name} className={cn(
                        "w-32 h-32 sm:w-40 sm:h-40 rounded-xl object-cover transition-all duration-700 shadow-xl",
                        shake ? "animate-pulse" : "",
                      )} />
                   ) : (
                      renderSlotIcon(artifact.slot || 'Accessory', cn(
                        "w-16 h-16 sm:w-20 sm:h-20 transition-all duration-700 drop-shadow-xl",
                        shake ? "animate-pulse" : "",
                        isRainbow ? 'text-purple-300 drop-shadow-[0_0_15px_rgba(216,180,254,0.8)]' : colorCls
                      ))
                   )}
                 </div>
               </motion.div>
            </motion.div>

            {/* Item Name */}
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: showDetails ? 1 : 0, y: showDetails ? 0 : 20 }}
              transition={{ duration: 0.6, delay: 1.5, type: "spring" }}
              className={cn(
                "text-2xl sm:text-3xl font-black text-white mb-6 leading-tight tracking-tight px-2 drop-shadow-lg",
                isRainbow && "text-transparent bg-clip-text bg-gradient-to-b from-white to-purple-200"
              )}
            >
              {artifact.name}
            </motion.h2>

            {/* Item Description block */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: showDetails ? 1 : 0, y: showDetails ? 0 : 20 }}
              transition={{ duration: 0.6, delay: 2.1 }}
              className="w-full relative mb-6"
            >
               <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
               <div className="absolute right-0 top-0 bottom-0 w-1 rounded-full bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
               <p className="text-zinc-300 font-medium text-xs sm:text-sm leading-relaxed px-4 italic text-center text-shadow-sm">
                 "{artifact.description}"
               </p>
            </motion.div>
            
            {/* Stats Block */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: showDetails ? 1 : 0, y: showDetails ? 0 : 20, scale: showDetails ? 1 : 0.95 }}
              transition={{ duration: 0.6, delay: 2.6 }}
              className="w-full mb-8 relative p-[1px] rounded-2xl overflow-hidden group/stats"
            >
              {/* Animated border line */}
              <div className={cn("absolute inset-0 opacity-50", isRainbow ? "bg-gradient-to-r from-purple-500 via-pink-500 to-yellow-500" : bgCls.replace('/10', '/50'))}></div>
              
              <div className="relative bg-zinc-950/90 backdrop-blur-3xl px-4 py-3 rounded-[15px] border border-white/5 w-full flex flex-col items-center shadow-inner">
                 {artifact.targetType ? (
                    <div className="flex flex-col items-center gap-1.5">
                       <span className={cn("text-[9px] font-black uppercase tracking-[0.2em] font-display", isRainbow ? "text-purple-300" : "text-zinc-400")}>
                          Affinity: <span className="text-white">{artifact.targetType}</span>
                       </span>
                       <span className="text-sm sm:text-base text-emerald-400 font-black drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">
                          +{artifact.bonusPercent}% {artifact.targetValue} EXP
                       </span>
                    </div>
                 ) : (
                    <div className="flex flex-col items-center gap-1.5">
                       <span className={cn("text-[9px] font-black uppercase tracking-[0.2em] font-display", isRainbow ? "text-purple-300" : "text-zinc-400")}>
                          Global Affinity
                       </span>
                       <span className="text-sm sm:text-base text-emerald-400 font-black drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">
                          +{artifact.bonusPercent || 20}% Base EXP
                       </span>
                    </div>
                 )}
              </div>
            </motion.div>

            {/* Collect Button */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: showDetails ? 1 : 0, y: showDetails ? 0 : 20 }}
              transition={{ duration: 0.6, delay: 3.2 }}
              onClick={onClose}
              disabled={!showDetails}
              className={cn(
                "w-full px-6 py-3 rounded-xl font-black text-xs uppercase tracking-[0.2em] shadow-lg transition-all font-display hover:-translate-y-1 hover:shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                isRainbow 
                  ? "bg-white text-purple-900 border border-white shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:shadow-[0_0_50px_rgba(255,255,255,0.6)]" 
                  : cn("bg-zinc-800 text-white hover:bg-zinc-700 border border-white/10", "hover:border-" + colorConfig.border.split('-')[1] + "-500/50")
              )}
            >
              Collect Relic
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
