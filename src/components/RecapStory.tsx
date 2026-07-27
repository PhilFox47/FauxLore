import React from 'react';
import { motion } from 'motion/react';
import { Award, Compass, Library, Quote, Target } from 'lucide-react';
import { cn } from '../lib/utils';
import { MEDIA_COLORS, MediaItem } from '../types/schema';
import type { RecapAward, RecapChapter, StructuredRecap } from '../services/recapAi';

/**
 * The written half of a recap, as it appears on the page.
 *
 * A recap is an issue rather than a wall of text: a deck under the title,
 * chapters with their own headings, one line pulled out and set large, awards
 * handed to specific titles, and a look ahead at the next period. Recaps
 * written before any of that existed still render — they arrive as a single
 * untitled chapter and simply read as one continuous piece.
 */

function toParagraphs(text: string): string[] {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Reads a recap row into the structured shape, whatever era it was written in. */
export function readRecap(recap: any): StructuredRecap | null {
  if (!recap) return null;
  const structured = recap.data?.structured;
  if (structured?.chapters?.length) {
    return { ...structured, title: recap.title || structured.title };
  }
  // Pre-chapter recap: the whole summary is one unheaded chapter.
  const summary = String(recap.summary || '').trim();
  if (!summary) return null;
  return {
    title: recap.title || 'Untitled Chapter',
    dek: '',
    chapters: [{ heading: '', body: summary }],
    pullQuote: '',
    awards: [],
    captions: {},
    lookAhead: { watchFor: '', challenge: '' },
    theme: recap.data?.aiTheme || '',
    mood: '',
    roast: recap.data?.aiRoast || '',
    summary,
  };
}

export function RecapDek({ dek, mood }: { dek?: string; mood?: string }) {
  if (!dek) return null;
  return (
    <div className="flex items-start gap-4 max-w-3xl">
      {mood && (
        <span className="shrink-0 mt-1.5 text-[9px] font-black uppercase tracking-[0.25em] text-zinc-400 border border-white/10 bg-white/5 rounded-full px-3 py-1.5">
          {mood}
        </span>
      )}
      <p className="text-xl md:text-2xl text-zinc-300 font-light leading-snug">{dek}</p>
    </div>
  );
}

function Chapter({ chapter, index }: { chapter: RecapChapter; index: number }) {
  const paragraphs = toParagraphs(chapter.body);
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-6%' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-3xl"
    >
      {chapter.heading && (
        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-[10px] font-black text-zinc-600 tabular-nums">{String(index + 1).padStart(2, '0')}</span>
          <h4 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-400">{chapter.heading}</h4>
        </div>
      )}
      <div className="space-y-4">
        {paragraphs.map((p, i) => (
          <p
            key={i}
            className={cn(
              'text-lg md:text-xl text-zinc-300/90 leading-relaxed font-light',
              index === 0 && i === 0 &&
                'first-letter:float-left first-letter:mr-3 first-letter:text-6xl first-letter:font-black first-letter:leading-[0.8] first-letter:text-white',
            )}
          >
            {p}
          </p>
        ))}
      </div>
    </motion.section>
  );
}

/** The chapters, with the sharpest line lifted out between the first two. */
export function RecapNarrative({ recap, accentText }: { recap: StructuredRecap; accentText?: string }) {
  const { chapters, pullQuote } = recap;
  return (
    <div className="space-y-8">
      {chapters.map((chapter, i) => (
        <React.Fragment key={i}>
          <Chapter chapter={chapter} index={i} />
          {i === 0 && pullQuote && (
            <motion.blockquote
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="relative max-w-4xl border-y border-white/10 py-8 my-2"
            >
              <Quote className="absolute -top-3 left-0 w-6 h-6 text-white/10" />
              <p className={cn('text-2xl md:text-4xl font-black tracking-tight leading-tight', accentText || 'text-white')}>
                “{pullQuote}”
              </p>
            </motion.blockquote>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/** Matches an award to the entry it was handed to, so it can carry cover art. */
function matchMedia(title: string, media: MediaItem[]): MediaItem | undefined {
  const needle = title.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    media.find((m) => m.title.toLowerCase() === needle) ||
    media.find((m) => m.title.toLowerCase().includes(needle) || needle.includes(m.title.toLowerCase()))
  );
}

export function AwardsShelf({ awards, media }: { awards: RecapAward[]; media: MediaItem[] }) {
  if (!awards || awards.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8%' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="bg-gradient-to-b from-amber-500/[0.07] to-transparent border border-amber-500/20 rounded-[2.5rem] p-8 md:p-12"
    >
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
          <Award className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-amber-500/70 font-black mb-1">Handed out</div>
          <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-none">The Awards</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {awards.map((a, i) => {
          const m = matchMedia(a.title, media);
          return (
            <motion.div
              key={`${a.award}-${i}`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              className="bg-black/50 border border-white/10 rounded-[1.75rem] p-5 flex gap-4 relative overflow-hidden group hover:border-amber-500/30 transition-colors"
            >
              <div className="w-16 h-24 rounded-xl bg-zinc-900 border border-white/10 overflow-hidden shrink-0 shadow-xl">
                {m?.coverImageUrl ? (
                  <img src={m.coverImageUrl} alt={m.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-700"><Library className="w-5 h-5" /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] uppercase tracking-[0.25em] text-amber-500 font-black mb-1.5 leading-tight">{a.award}</div>
                <div className="text-sm font-black text-white leading-tight truncate">{m?.title || a.title}</div>
                {m && (
                  <div className={cn('text-[9px] font-black uppercase tracking-widest mt-0.5', MEDIA_COLORS[m.mediaType]?.text || 'text-zinc-500')}>
                    {m.mediaType}
                  </div>
                )}
                {a.reason && <p className="text-xs text-zinc-400 leading-snug mt-2 italic">{a.reason}</p>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

/** Closes the issue by pointing at the next one. */
export function LookAhead({ lookAhead, timeframe }: {
  lookAhead: { watchFor: string; challenge: string };
  timeframe: 'week' | 'month' | 'year';
}) {
  if (!lookAhead?.watchFor && !lookAhead?.challenge) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8%' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      {lookAhead.watchFor && (
        <div className="bg-black/40 border border-white/5 rounded-[2rem] p-8 relative overflow-hidden">
          <Compass className="absolute -right-6 -bottom-6 w-40 h-40 text-white/[0.02]" />
          <div className="flex items-center gap-3 mb-4 relative z-10">
            <Compass className="w-4 h-4 text-sky-400" />
            <div className="text-[10px] uppercase tracking-[0.3em] text-sky-400/80 font-black">Watching for</div>
          </div>
          <p className="text-lg text-zinc-300 font-light leading-relaxed relative z-10">{lookAhead.watchFor}</p>
        </div>
      )}
      {lookAhead.challenge && (
        <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-[2rem] p-8 relative overflow-hidden">
          <Target className="absolute -right-6 -bottom-6 w-40 h-40 text-emerald-500/[0.04]" />
          <div className="flex items-center gap-3 mb-4 relative z-10">
            <Target className="w-4 h-4 text-emerald-400" />
            <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-400/80 font-black">Your challenge next {timeframe}</div>
          </div>
          <p className="text-lg text-zinc-200 font-light leading-relaxed relative z-10">{lookAhead.challenge}</p>
        </div>
      )}
    </motion.div>
  );
}
