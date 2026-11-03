import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { StoryScene } from "../lib/storyDiscovery";
import type { EditorialDirection } from "../lib/dynamicScenes";

/**
 * Cinematic Editorial is a true full-bleed stage, NOT an image node inside a
 * padded card. The model chooses the direction; React owns readable placement,
 * contrast, responsive sizing, accessibility and motion.
 */
const positioning = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
} as const;
const vertical = {
  top: "justify-start",
  middle: "justify-center",
  bottom: "justify-end",
} as const;
const gradients = {
  left: "bg-gradient-to-r from-black/95 via-black/75 to-black/15",
  right: "bg-gradient-to-l from-black/95 via-black/75 to-black/15",
  center: "bg-gradient-to-t from-black/85 via-black/65 to-black/35",
} as const;
const imagePosition = { left: "27% center", center: "center", right: "73% center" };
const sourceLabel = (scene: StoryScene) => scene.sourceLabel || "Your verified activity";

export function EditorialStorySlide({ scene, direction, imageUrl, number, total, onDeepDive }: {
  scene: StoryScene;
  direction: EditorialDirection;
  imageUrl?: string | null;
  number: number;
  total: number;
  onDeepDive: () => void;
}) {
  const reduceMotion = !!useReducedMotion();
  const visual = direction.presentation === "cinematic" && !!imageUrl;
  const hasMetrics = direction.presentation === "data" && !!scene.bars?.length;
  const heroTitle = scene.title.length > 65 ? "text-4xl sm:text-5xl lg:text-6xl"
    : "text-5xl sm:text-6xl lg:text-[clamp(4rem,6vw,6.4rem)]";
  const side = positioning[direction.textSide];
  const vert = vertical[direction.textPosition];
  const enter = (delay: number) => ({
    initial: reduceMotion ? false as const : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduceMotion ? 0 : 0.65, delay: reduceMotion ? 0 : delay },
  });

  return <motion.article
    initial={reduceMotion ? false : { opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={reduceMotion ? undefined : { opacity: 0 }}
    transition={{ duration: reduceMotion ? 0 : .4 }}
    className={"relative isolate overflow-hidden rounded-[2rem] md:rounded-[2.75rem] " +
      "border border-white/10 bg-[#090a10] text-white shadow-2xl " +
      (visual ? "min-h-[640px] md:min-h-[735px]" : "min-h-[580px] md:min-h-[680px]")}
  >
    {visual ? <>
      <img src={imageUrl} alt="" aria-hidden="true" loading="eager" referrerPolicy="no-referrer"
        style={{ objectPosition: imagePosition[direction.imageFocus] }}
        className="absolute inset-0 h-full w-full object-cover pointer-events-none" />
      <div className={"absolute inset-0 pointer-events-none " + gradients[direction.textSide]} aria-hidden="true" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/65 via-transparent to-black/20"
        aria-hidden="true" />
    </> : <>
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-[#090a10] to-black" aria-hidden="true" />
      <div className="absolute -right-48 -top-52 h-[520px] w-[520px] rounded-full bg-white/[0.045] blur-[110px]"
        aria-hidden="true" />
    </>}
    <div className="relative z-10 flex flex-col min-h-[640px] md:min-h-[735px] px-7 py-8 sm:px-12 sm:py-11 md:px-16 md:py-12">
      <header className="flex items-start justify-between gap-5 text-xs font-black tracking-[.23em] uppercase text-white/80">
        <span className="max-w-[74%]">{scene.eyebrow}</span>
        <span className="font-mono text-white/60 tabular-nums shrink-0">
          {String(number).padStart(2,"0")} / {String(total).padStart(2,"0")}
        </span>
      </header>

      {hasMetrics ? (
        <div className="flex flex-1 flex-col justify-center gap-8 md:gap-12 py-14 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 items-end">
            <motion.h2 {...enter(.05)}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.05] tracking-[-.055em] text-balance [overflow-wrap:anywhere]">
              {scene.title}
            </motion.h2>
            <motion.p {...enter(.2)} className="text-base sm:text-lg lg:text-xl leading-relaxed text-white/80">
              {scene.body}
            </motion.p>
          </div>
          <div className={"grid gap-7 md:gap-10 " +
            ((scene.bars?.length || 0) > 1 ? "md:grid-cols-2" : "grid-cols-1")}>
            {scene.bars!.map((metric, i) => <motion.div key={metric.label + i} {...enter(.23 + .12*i)}
              className="border-t border-white/20 pt-5">
              <div className="flex gap-3 justify-between items-baseline">
                <div className="text-sm sm:text-base font-semibold text-white/75">{metric.label}</div>
                <div className="text-5xl md:text-6xl font-black tabular-nums tracking-[-.06em]">
                  {metric.value}<span className="text-[.42em] opacity-70">%</span>
                </div>
              </div>
              <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
                <motion.div initial={reduceMotion ? false : { width: 0 }}
                  whileInView={{ width: Math.max(0,Math.min(100,metric.value)) + "%" }}
                  viewport={{once:true}} transition={{duration: reduceMotion?0:.8,delay:.3+i*.12}}
                  className="h-full rounded-full bg-white/80" />
              </div>
              {metric.note && <p className="mt-2 text-xs text-white/55">{metric.note}</p>}
            </motion.div>)}
          </div>
        </div>
      ) : (
        <div className={"flex flex-1 flex-col py-14 md:py-20 " + vert + " " + side}>
          <div className={"w-full " + (direction.textSide === "center" ? "max-w-[930px]" : "max-w-[750px]")}>
            <motion.h2 {...enter(.07)}
              className={"font-black leading-[1.06] tracking-[-.055em] text-balance " +
                "[overflow-wrap:anywhere] drop-shadow-[0_3px_20px_rgba(0,0,0,.7)] " + heroTitle}>
              {scene.title}
            </motion.h2>
            <motion.p {...enter(.25)}
              className="mt-7 sm:mt-9 text-base sm:text-lg lg:text-xl leading-[1.62] font-medium text-white/90 drop-shadow-[0_2px_10px_rgba(0,0,0,.85)] whitespace-pre-line">
              {scene.body}
            </motion.p>
            {scene.quote && <motion.blockquote {...enter(.4)}
              className="mt-7 border-l-2 border-white/60 pl-5 text-lg sm:text-xl italic text-white/85 text-left">
              “{scene.quote}”
            </motion.blockquote>}
          </div>
        </div>
      )}

      <footer className="flex items-center justify-between gap-4 text-xs font-medium text-white/65">
        <span>{sourceLabel(scene)}</span>
        {scene.kind === "closing" && <button onClick={onDeepDive}
          className="text-white/95 hover:text-white font-semibold inline-flex gap-2 items-center">
          Full Deep Dive <ArrowRight className="w-4 h-4"/>
        </button>}
      </footer>
    </div>
  </motion.article>;
}
