import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { StoryScene } from "../lib/storyDiscovery";
import type {
  DynamicSceneComposition, DynamicSceneElement, DynamicSceneTone,
} from "../lib/dynamicScenes";

const themes = {
  violet: { canvas: "from-violet-950 via-[#151028] to-[#080710]", accent: "text-violet-200", glow: "bg-violet-400/35", edge: "border-violet-400/30" },
  cobalt: { canvas: "from-blue-950 via-[#0b1a35] to-[#050b18]", accent: "text-blue-200", glow: "bg-blue-400/35", edge: "border-blue-400/30" },
  amber: { canvas: "from-amber-950 via-[#301c09] to-[#110906]", accent: "text-amber-200", glow: "bg-amber-400/35", edge: "border-amber-400/30" },
  rose: { canvas: "from-rose-950 via-[#2d0e20] to-[#12080d]", accent: "text-rose-200", glow: "bg-rose-400/35", edge: "border-rose-400/30" },
  emerald: { canvas: "from-emerald-950 via-[#0c2928] to-[#081311]", accent: "text-emerald-200", glow: "bg-emerald-400/35", edge: "border-emerald-400/30" },
  cyan: { canvas: "from-cyan-950 via-[#092633] to-[#051319]", accent: "text-cyan-200", glow: "bg-cyan-400/35", edge: "border-cyan-400/30" },
  monochrome: { canvas: "from-zinc-800 via-zinc-950 to-black", accent: "text-zinc-200", glow: "bg-zinc-300/30", edge: "border-white/30" },
} as const;

const headlineSize = {
  sm: "text-3xl md:text-4xl",
  md: "text-4xl md:text-5xl",
  lg: "text-4xl md:text-6xl lg:text-7xl",
  xl: "text-5xl md:text-7xl lg:text-8xl",
};
const bodySize = {
  sm: "text-sm md:text-base",
  md: "text-base md:text-lg",
  lg: "text-lg md:text-xl",
  xl: "text-xl md:text-2xl",
};
const metricSize = {
  sm: "text-3xl md:text-4xl",
  md: "text-4xl md:text-5xl",
  lg: "text-5xl md:text-6xl",
  xl: "text-6xl md:text-7xl",
};
const toneClass = (tone: DynamicSceneTone, accent: string): string =>
  tone === "accent" ? accent : tone === "secondary" ? "text-white/70" : "text-white";

function NodeContent({ node, scene, coverArtUrl, accent, glow, edge, reduce }: {
  node: DynamicSceneElement;
  scene: StoryScene;
  coverArtUrl?: string | null;
  accent: string; glow: string; edge: string; reduce: boolean;
}) {
  const color = toneClass(node.tone, accent);
  switch (node.type) {
    case "title":
      return <h2 className={"font-black leading-[1.05] tracking-[-.05em] break-words " +
        headlineSize[node.size] + " " + color}>{scene.title}</h2>;
    case "body":
      return <div className={"font-medium leading-relaxed whitespace-pre-line break-words " +
        bodySize[node.size] + " " + color}>{scene.body}</div>;
    case "eyebrow":
      return <div className={"text-xs tracking-[.23em] uppercase font-black " + color}>{scene.eyebrow}</div>;
    case "quote":
      return scene.quote ? <blockquote className={"border-l-4 pl-5 italic font-semibold " +
        headlineSize[node.size] + " " + color + " " + edge}>“{scene.quote}”</blockquote> : null;
    case "media": {
      const media = [...(scene.media ? [scene.media] : []), ...(scene.artworks || [])]
        .find(m => m.id === node.mediaId && !!m.cover);
      return media?.cover ? <figure className="w-full h-full flex flex-col justify-center items-center gap-2">
        <img src={media.cover} alt={"Cover of " + media.title} loading="lazy" referrerPolicy="no-referrer"
          className="max-h-full max-w-full object-contain rounded-xl shadow-[0_16px_48px_rgba(0,0,0,.55)]" />
      </figure> : null;
    }
    case "title-art":
      return coverArtUrl ? <img src={coverArtUrl} alt="" aria-hidden="true" loading="eager"
        className="w-full h-full object-cover rounded-xl opacity-90" /> : null;
    case "stat": {
      const stat = scene.bars?.[node.index ?? -1];
      return stat ? <div className="h-full flex flex-col justify-center" aria-label={stat.label + ": " + stat.value + " percent"}>
        <div className={"font-black tabular-nums tracking-[-.06em] " + metricSize[node.size] + " " + color}>
          {stat.value}<span className="text-[.4em] opacity-65">%</span>
        </div>
        <p className={"text-sm font-semibold " + accent}>{stat.label}</p>
        <div className="mt-2 w-full h-2 bg-white/10 rounded-full overflow-hidden" aria-hidden="true">
          <motion.div initial={reduce ? false : { width: 0 }} whileInView={{ width: Math.max(0, Math.min(100, stat.value)) + "%" }}
            viewport={{ once: true }} transition={{ duration: reduce ? 0 : .85, delay: reduce ? 0 : node.delay }}
            className={"h-full rounded-full " + glow} />
        </div>
        <p className="text-xs text-white/55 mt-1">{stat.note}</p>
      </div> : null;
    }
    case "beat": {
      const beat = scene.beats?.[node.index ?? -1];
      return beat ? <div className={"h-full flex flex-col justify-center border-l-2 pl-4 " + edge}>
        <span className={"uppercase text-xs font-black tracking-wider " + accent}>{beat.label}</span>
        <p className={"font-black text-xl md:text-2xl mt-1 " + color}>{beat.title}</p>
        <p className="text-sm text-white/70 mt-2">{beat.detail}</p>
      </div> : null;
    }
    case "shape": {
      const base = "w-full h-full pointer-events-none " + glow;
      if (node.shape === "orb") return <div aria-hidden="true" className={base + " rounded-full blur-2xl"} />;
      if (node.shape === "ring") return <div aria-hidden="true" className={"w-full h-full rounded-full border-[10px] opacity-30 " + edge} />;
      if (node.shape === "line") return <div aria-hidden="true" className={base + " rounded-full max-h-1"} />;
      if (node.shape === "pill") return <div aria-hidden="true" className={base + " rounded-full opacity-25"} />;
      return <div aria-hidden="true" className={"w-full h-full rounded-3xl border opacity-30 " + edge} />;
    }
  }
}

function Entrance({ node, children, reduce, mobile }: {
  node: DynamicSceneElement;
  children: React.ReactNode;
  reduce: boolean; mobile: boolean;
}) {
  const ambient = !reduce && (node.motion === "float" || node.motion === "pulse");
  const initial = reduce || node.motion === "none" ? false
    : node.motion === "slide" ? { opacity: 0, x: 36 }
    : node.motion === "pop" ? { opacity: 0, scale: .8 }
    : node.motion === "rise" ? { opacity: 0, y: 30 }
    : { opacity: 0 };
  const animate = ambient
    ? node.motion === "float" ? { opacity: 1, y: [0, -8, 0] } : { opacity: [0.75, 1, 0.75] }
    : { opacity: 1, x: 0, y: 0, scale: 1 };
  const transition = ambient
    ? { duration: node.motion === "float" ? 7 : 4, repeat: Infinity, ease: "easeInOut" as const, delay: node.delay }
    : { duration: reduce ? 0 : .7, delay: reduce ? 0 : node.delay, ease: "easeOut" as const };
  const boxStyle = mobile ? undefined : {
    left: node.box.x + "%",
    top: node.box.y + "%",
    width: node.box.w + "%",
    height: node.box.h + "%",
  };
  const decoration = node.type === "shape";
  return <motion.div initial={initial} animate={animate} transition={transition} style={boxStyle}
    className={mobile
      ? (decoration ? "hidden" : "relative w-full min-w-0 " +
        (node.type === "media" || node.type === "title-art" ? "min-h-48 max-h-72" : ""))
      : "absolute min-w-0 min-h-0 " + (decoration ? "pointer-events-none" : "overflow-auto")}>
    <div className={"w-full h-full " + (mobile ? "py-1" : "")}>{children}</div>
  </motion.div>;
}

const priority = (node: DynamicSceneElement) =>
  node.type === "shape" ? 0 : node.type === "title-art" ? 1 :
  node.type === "media" ? 2 : node.type === "eyebrow" ? 3 :
  node.type === "title" ? 4 : node.type === "body" ? 5 : 6;

/**
 * Static JSX only. No dangerouslySetInnerHTML, arbitrary element names,
 * CSS strings, or user-defined JS. Mobile is semantic flow rather than
 * scaled desktop coordinates, so text stays readable on small screens.
 */
export function DynamicStorySlide({ scene, composition, number, total, coverArtUrl, onDeepDive }: {
  scene: StoryScene;
  composition: DynamicSceneComposition;
  number: number; total: number;
  coverArtUrl?: string | null;
  onDeepDive: () => void;
}) {
  const reduce = !!useReducedMotion();
  const theme = themes[scene.design?.palette || "violet"];
  const foreground = composition.elements.filter(e => e.type !== "shape");
  const desktop = [...composition.elements].sort((a, b) => priority(a) - priority(b));
  const mobile = [...foreground].sort((a, b) => priority(a) - priority(b));
  const background = {
    cinematic: "bg-gradient-to-br " + theme.canvas,
    spotlight: "bg-gradient-to-tl " + theme.canvas,
    grid: "bg-gradient-to-br " + theme.canvas,
    minimal: "bg-gradient-to-b from-zinc-950 via-zinc-900 to-black",
    halftone: "bg-gradient-to-tr " + theme.canvas,
  }[composition.backdrop];
  const renderNode = (node: DynamicSceneElement, mobileLayout: boolean) =>
    <Entrance key={node.id} node={node} reduce={reduce} mobile={mobileLayout}>
      <NodeContent node={node} scene={scene} coverArtUrl={coverArtUrl}
        accent={theme.accent} glow={theme.glow} edge={theme.edge} reduce={reduce} />
    </Entrance>;

  return <motion.article initial={reduce ? false : { opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }}
    exit={reduce ? undefined : { opacity: 0, scale: .99 }}
    transition={{ duration: reduce ? 0 : .35 }}
    className={"relative isolate overflow-hidden rounded-[2rem] md:rounded-[2.75rem] border " +
      theme.edge + " " + background + " shadow-2xl"}>
    {scene.kind === "opening" && coverArtUrl &&
      !composition.elements.some(node => node.type === "title-art") &&
      <img src={coverArtUrl} loading="eager" alt="" aria-hidden="true"
      className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none" />}
    {composition.backdrop === "grid" && <div aria-hidden="true"
      className="absolute inset-0 opacity-20 pointer-events-none"
      style={{ backgroundImage: "linear-gradient(#fff2 1px, transparent 1px), linear-gradient(90deg,#fff2 1px,transparent 1px)", backgroundSize: "40px 40px" }} />}
    {composition.backdrop === "spotlight" && <div aria-hidden="true"
      className="absolute -top-32 -right-20 w-2/3 h-2/3 bg-white/10 blur-[120px] pointer-events-none rounded-full" />}
    {composition.backdrop === "halftone" && <div aria-hidden="true"
      className="absolute inset-0 opacity-10 pointer-events-none"
      style={{ backgroundImage: "radial-gradient(white 1px,transparent 1px)", backgroundSize: "18px 18px" }} />}
    <div className="relative z-10 p-5 sm:p-8 md:p-10">
      <div className={"flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[.22em] " + theme.accent}>
        <span>{scene.eyebrow}</span>
        <span className="font-mono text-white/60">{String(number).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      </div>
      <div className="hidden md:block relative h-[625px] mt-5" aria-label={"Individually directed scene: " + scene.title}>
        {desktop.map(node => renderNode(node, false))}
      </div>
      <div className="md:hidden relative flex flex-col gap-5 mt-8 pb-6" aria-label={"Scene: " + scene.title}>
        {mobile.map(node => renderNode(node, true))}
      </div>
      <div className="relative z-10 flex items-center justify-between gap-3 min-h-10 mt-4 border-t border-white/10 pt-4 text-xs text-white/60">
        <span>{scene.sourceLabel || "Your verified activity"}</span>
        {scene.kind === "closing" && <button onClick={onDeepDive}
          className="text-white flex items-center gap-2 hover:text-violet-200">
          Full Deep Dive <ArrowRight className="w-4 h-4" />
        </button>}
      </div>
    </div>
  </motion.article>;
}
