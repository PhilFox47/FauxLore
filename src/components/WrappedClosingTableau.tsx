import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { StoryScene } from "../lib/storyDiscovery";
import { wrappedProseTier } from "../lib/wrappedPacing";

/**
 * The final image is a single visual epilogue, not a souvenir shelf.
 * Official covers, media logos and artwork mosaics belong in Deep Dive.
 */
export function WrappedClosingTableau({ scene, imageUrl, number, total, onDeepDive }: {
  scene: StoryScene;
  imageUrl?: string | null;
  number: number;
  total: number;
  onDeepDive: () => void;
}) {
  const reduced = !!useReducedMotion();
  const substantial = wrappedProseTier(scene.body) === "substantial";
  const titleSize = substantial || scene.title.length >= 65
    ? "text-4xl sm:text-5xl lg:text-7xl"
    : "text-5xl sm:text-6xl lg:text-8xl";
  const direction = scene.composition?.direction;
  const textSide = direction?.textSide || "center";
  const alignment = textSide === "right" ? "ml-auto text-right items-end"
    : textSide === "left" ? "mr-auto text-left items-start"
      : "mx-auto text-center items-center";
  const imageFocus = direction?.imageFocus === "left" ? "27% center"
    : direction?.imageFocus === "right" ? "73% center" : "center";
  const vignette = textSide === "left" ? "bg-gradient-to-r from-black/95 via-black/75 to-black/20"
    : textSide === "right" ? "bg-gradient-to-l from-black/95 via-black/75 to-black/20"
      : "bg-gradient-to-t from-black/95 via-black/65 to-black/40";

  return <motion.article initial={reduced ? false : { opacity: 0, scale: 1.025 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={reduced ? undefined : { opacity: 0, scale: .99 }}
    transition={{ duration: reduced ? 0 : .85 }}
    className="relative isolate overflow-hidden rounded-[2rem] md:rounded-[2.75rem] border border-white/15 bg-[#090a10] shadow-2xl min-h-[600px] md:min-h-[730px] text-white">
    {imageUrl && <img src={imageUrl} alt="" aria-hidden="true" loading="eager"
      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      style={{ objectPosition: imageFocus }} />}
    <div aria-hidden="true" className={"absolute inset-0 pointer-events-none " + vignette} />
    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/65 pointer-events-none" />
    <div className="relative z-10 min-h-[600px] md:min-h-[730px] px-7 py-9 sm:px-12 sm:py-12 lg:px-16 flex flex-col">
      <div className="flex items-center justify-between gap-5 text-xs font-black uppercase tracking-[.23em] text-white/75">
        <span>{scene.eyebrow || "EPILOGUE"}</span>
        <span className="font-mono text-white/55 tabular-nums">
          {String(number).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
      <div className={"flex-1 flex flex-col justify-center " +
        (substantial ? "gap-5 py-8 " : "gap-8 py-12 ") + alignment}>
        <motion.div initial={reduced ? false : { scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: reduced ? 0 : .9, delay: reduced ? 0 : .35 }}
          className="h-[2px] w-16 bg-white/75 origin-center" aria-hidden="true"/>
        <motion.h2 initial={reduced ? false : { opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : .75, delay: reduced ? 0 : .2 }}
          className={"max-w-5xl font-black leading-[1.04] tracking-[-.065em] text-balance drop-shadow-[0_4px_30px_rgba(0,0,0,.8)] [overflow-wrap:anywhere] " + titleSize}>
          {scene.title}
        </motion.h2>
        <motion.p initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : .45 }}
          className={"max-w-3xl font-medium text-white/90 whitespace-pre-line drop-shadow-[0_2px_12px_rgba(0,0,0,.8)] " +
            (substantial ? "text-base sm:text-lg leading-[1.58]" : "text-base sm:text-lg lg:text-xl leading-[1.7]")}>
          {scene.body}
        </motion.p>
        <motion.button type="button" onClick={onDeepDive}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : .55, delay: reduced ? 0 : .7 }}
          className="inline-flex items-center gap-3 px-6 py-3.5 rounded-xl border border-white/30 bg-white/15 hover:bg-white/25 backdrop-blur-md font-bold text-sm transition-colors">
          Continue to Deep Dive <ArrowRight className="w-4 h-4" />
        </motion.button>
      </div>
      <p className="text-[10px] tracking-[.17em] uppercase text-white/55">
        {scene.sourceLabel || "A final thought from your Wrapped"}
      </p>
    </div>
  </motion.article>;
}
