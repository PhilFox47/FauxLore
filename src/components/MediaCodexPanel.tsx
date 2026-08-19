import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollText, Sparkles, Palette, Users, Swords, Landmark, MapPin, Gem, BookOpen,
  Loader2, RefreshCw, AlertTriangle, ExternalLink, Music, Library,
} from 'lucide-react';
import { format } from 'date-fns';
import { CodexData, CodexEntity, MediaCodex } from '../types/schema';
import { DatabaseService } from '../services/db';
import { cn } from '../lib/utils';
import { useToast } from '../contexts/ToastContext';

/**
 * The Codex: what the app has researched about a title.
 *
 * It is compiled automatically the first time auto-tagging, an enemy or a piece
 * of loot needs to know what this work actually is, and everything the app
 * invents afterwards is written from it — so this panel is also the honest
 * answer to "why did it come up with that?".
 */

/** Human names for the research passes that make up a dossier. */
const SECTION_LABEL: Record<string, string> = {
  identity: 'which work this is',
  cast: 'the cast',
  conflict: 'conflicts & opposition',
  world: 'places, factions & vocabulary',
  things: 'notable objects',
  craft: 'style, production & themes',
};

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5">
        {icon} {title}
      </h4>
      {children}
    </div>
  );
}

/** Where an entity first turns up, when the research knew. */
function introOf(e: { introducedAt?: string; introducedPct?: number }): string {
  const at = (e.introducedAt || '').trim();
  const pct = Number(e.introducedPct);
  const hasPct = Number.isFinite(pct) && pct > 0;
  if (at) return hasPct ? `${at} · ~${Math.round(pct)}%` : at;
  return hasPct ? `~${Math.round(pct)}% in` : '';
}

function EntityList({ entries, limit = 12, detailed }: { entries?: CodexEntity[]; limit?: number; detailed?: boolean }) {
  const rows = (entries || []).filter((e) => e && e.name).slice(0, limit);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((e, i) => {
        const intro = introOf(e);
        const qualifier = [
          e.role, e.prominence, e.nature, e.affiliation,
          e.region ? `in ${e.region}` : '',
          e.opposedTo ? `against ${e.opposedTo}` : '',
          e.opposes ? `opposes ${e.opposes}` : '',
        ].filter(Boolean).join(' · ');

        // The specifics are what a reader actually wants from a reference entry,
        // and what the generators build from — kept out of the headline so the
        // list still scans.
        const detail: [string, string | undefined][] = [
          ['Looks', e.appearance], ['Made of', e.material], ['Capable of', e.abilities],
          ['Operates by', e.methods], ['Wants', e.motivation || e.goal],
          ['Used for', e.purpose], ['Matters because', e.significance],
          ['Belongs to', e.owner], ['Origin', e.origin],
          ['Manner', e.personality], ['Connected to', e.relationships], ['Status', e.status],
          ['Feels', e.atmosphere], ['Where', e.whatHappensThere],
          ['Emblem', e.symbol], ['Colours', e.colors],
          ['Members', (e.members || []).slice(0, 6).join(', ') || undefined],
        ];
        const shown = detail.filter(([, v]) => v && String(v).trim());

        return (
          <div key={`${e.name}-${i}`} className="text-sm leading-snug">
            <div>
              <span className="font-bold text-zinc-200">{e.name}</span>
              {(e.aliases?.length || 0) > 0 && (
                <span className="text-zinc-600 text-xs"> aka {e.aliases!.slice(0, 3).join(', ')}</span>
              )}
              {qualifier && (
                <span className="text-[10px] uppercase tracking-widest text-amber-500/70 font-black ml-2">{qualifier}</span>
              )}
              {intro && (
                <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black ml-2">{intro}</span>
              )}
              {e.description && <span className="text-zinc-400"> — {e.description}</span>}
            </div>
            {detailed && shown.length > 0 && (
              <div className="mt-1 pl-3 border-l border-white/10 flex flex-col gap-0.5">
                {shown.map(([label, value]) => (
                  <div key={label} className="text-xs text-zinc-500 leading-snug">
                    <span className="text-zinc-600 font-bold uppercase tracking-wider text-[9px] mr-1.5">{label}</span>
                    {value}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A list of plain statements — conflicts, signature moments. */
function Lines({ values, limit = 10 }: { values?: string[]; limit?: number }) {
  const rows = (values || []).filter(Boolean).slice(0, limit);
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((v, i) => (
        <li key={`${v}-${i}`} className="text-sm text-zinc-400 leading-snug pl-3 border-l border-white/10">{v}</li>
      ))}
    </ul>
  );
}

/** A named division of the entry, the way a reference work would break it up. */
function Chapter({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-4 border-t border-white/5 space-y-4">
      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500/60">{title}</h4>
      {children}
    </div>
  );
}

function Chips({ values, className }: { values?: string[]; className?: string }) {
  const rows = (values || []).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((v, i) => (
        <span key={`${v}-${i}`} className={className || 'text-xs px-2 py-1 bg-white/5 text-zinc-300 rounded border border-white/10'}>{v}</span>
      ))}
    </div>
  );
}

/**
 * What the research actually identified, and whether that matches the entry.
 * Same-named works are the failure mode here — a 2010 film standing in for a
 * 2026 one — so the answer is shown rather than assumed.
 */
function IdentifiedAs({ data, mediaType, year, season }: { data: CodexData; mediaType: string; year?: number; season?: number }) {
  const id = data.identifiedAs;
  if (!id?.title) return null;

  const gotYear = Number(id.year || data.releaseYear || 0);
  const yearOff = !!year && !!gotYear && Math.abs(gotYear - year) > 1;
  // A dossier for the wrong season is as wrong as one for the wrong work: it
  // describes a cast this entry has not met and spoils what it has not reached.
  const gotSeason = Number(id.season || 0);
  const seasonOff = !!season && !!gotSeason && gotSeason !== season;
  const off = yearOff || seasonOff;

  return (
    <div className={cn(
      'rounded-xl border px-3 py-2.5',
      off ? 'border-amber-500/40 bg-amber-500/[0.08]' : 'border-white/10 bg-black/30',
    )}>
      <div className="flex items-start gap-2">
        {off && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1">Researched</div>
          <div className="text-sm font-bold text-white leading-snug">
            {id.title}
            {(id.year || id.type || id.season) && (
              <span className="text-zinc-400 font-medium">
                {' '}({[id.season ? `Season ${id.season}` : '', id.year, id.type].filter(Boolean).join(', ')})
              </span>
            )}
          </div>
          {id.creator && <div className="text-[11px] text-zinc-500 font-bold mt-0.5">{id.creator}</div>}
          {off && (
            <div className="text-[11px] text-amber-200/80 mt-1.5 leading-snug">
              Your entry says {[season ? `season ${season}` : '', year].filter(Boolean).join(', ')} ({mediaType}).
              If this is the wrong one, re-research it.
            </div>
          )}
          {(id.alsoKnownAs?.length || 0) > 0 && (
            <div className="text-[10px] text-zinc-500 mt-1.5 leading-snug">
              {/* These are what the detailed research was actually searched under. */}
              <span className="font-black uppercase tracking-widest text-zinc-600 mr-1.5">Also known as</span>
              {id.alsoKnownAs!.slice(0, 5).join(' · ')}
            </div>
          )}
          {id.why && !off && <p className="text-[11px] text-zinc-500 italic mt-1 leading-snug">{id.why}</p>}
          {(id.alternatives?.length || 0) > 0 && (
            <div className="text-[10px] text-zinc-600 mt-1.5 leading-snug">
              Not: {id.alternatives!.slice(0, 3).join(' · ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MediaCodexPanel({ mediaId, title, mediaType, year, season }: { mediaId: string; title: string; mediaType: string; year?: number; season?: number }) {
  const toast = useToast();
  const [codex, setCodex] = useState<MediaCodex | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompiling, setIsCompiling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const row = await DatabaseService.getCodex(mediaId);
    setCodex(row);
    setIsLoading(false);
    return row;
  }, [mediaId]);

  useEffect(() => {
    setIsLoading(true);
    setExpanded(false);
    load();
  }, [load]);

  // Another task (a boss spawn, an auto-tag) may be compiling this Codex right
  // now, so a 'generating' row is watched until it settles.
  useEffect(() => {
    if (codex?.status !== 'generating') return;
    pollRef.current = setTimeout(() => { load(); }, 4000);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [codex, load]);

  const compile = async (force: boolean) => {
    setIsCompiling(true);
    try {
      const row = await DatabaseService.ensureCodex({ mediaId, title, mediaType, force });
      setCodex(row);
      toast.success(force ? 'The Codex has been re-researched.' : 'The Codex has been compiled.');
    } catch (e: any) {
      toast.error(e.message || 'Could not compile the Codex.');
      load();
    } finally {
      setIsCompiling(false);
    }
  };

  if (isLoading) return null;

  const data = codex?.data;
  const isBusy = isCompiling || codex?.status === 'generating';

  const weakSections = Object.entries(data?.sectionConfidence || {})
    .filter(([, grade]) => grade && grade !== 'high') as [string, string][];

  // The art style is researched in eight facets so an image prompt has something
  // to work with; collapsed, only the four broad ones are worth the room.
  const art = data?.artStyle;
  const artStyleLine = [
    art?.summary, art?.medium, art?.palette, art?.iconography,
    ...(expanded ? [art?.lighting, art?.linework, art?.composition, art?.characterDesign] : []),
  ].filter(Boolean).join(' · ');

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold text-zinc-500 tracking-wider uppercase flex items-center gap-2">
          <ScrollText className="w-4 h-4" /> Codex
        </h3>
        {codex && (
          <button
            onClick={() => compile(true)}
            disabled={isBusy}
            className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition flex items-center gap-1.5 disabled:opacity-50"
            title="Research this title again from scratch"
          >
            <RefreshCw className={isBusy ? 'w-3 h-3 animate-spin' : 'w-3 h-3'} /> Re-research
          </button>
        )}
      </div>

      {/* Never researched yet */}
      {!codex && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-center">
          <p className="text-sm text-zinc-400 mb-1">No Codex on record for this title.</p>
          <p className="text-xs text-zinc-600 mb-4 max-w-md mx-auto">
            The Codex is what FauxLore knows about a work — its cast, its enemies, its art style, its iconic
            items. It is compiled automatically the first time this entry is tagged, or spawns an enemy or a
            piece of loot, and everything generated afterwards is built from it.
          </p>
          <button
            onClick={() => compile(false)}
            disabled={isCompiling}
            className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl text-sm font-bold transition inline-flex items-center gap-2 disabled:opacity-50"
          >
            {isCompiling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isCompiling ? 'Researching…' : 'Compile the Codex'}
          </button>
        </div>
      )}

      {codex?.status === 'generating' && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5 flex items-center gap-3 text-sm text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
          Researching “{codex.title}” — this takes a moment.
        </div>
      )}

      {codex?.status === 'failed' && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-red-300 mb-1">
            <AlertTriangle className="w-4 h-4" /> The Codex could not be compiled.
          </div>
          {codex.error && <p className="text-xs text-red-200/70 mb-3 break-words">{codex.error}</p>}
          <button
            onClick={() => compile(true)}
            disabled={isCompiling}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-2 disabled:opacity-50"
          >
            {isCompiling ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Try again
          </button>
        </div>
      )}

      {codex?.status === 'ready' && data && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-5">
          <IdentifiedAs data={data} mediaType={mediaType} year={year} season={season} />
          {data.premise && <p className="text-sm text-zinc-200 leading-relaxed font-medium">{data.premise}</p>}
          {data.overview && <p className="text-sm text-zinc-300 leading-relaxed">{data.overview}</p>}

          {(data.setting || data.tone) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.setting && (
                <Section icon={<MapPin className="w-3 h-3" />} title="Setting">
                  <p className="text-sm text-zinc-400 leading-snug">{data.setting}</p>
                </Section>
              )}
              {data.tone && (
                <Section icon={<Sparkles className="w-3 h-3" />} title="Tone">
                  <p className="text-sm text-zinc-400 leading-snug">{data.tone}</p>
                </Section>
              )}
            </div>
          )}

          {/* Collapsed, the entry shows what a reference entry opens with: what
              the work is, who is in it, and what it is about. */}
          {(data.characters?.length || 0) > 0 && (
            <Section icon={<Users className="w-3 h-3" />} title="Cast">
              <EntityList entries={data.characters} limit={expanded ? 24 : 5} detailed={expanded} />
            </Section>
          )}

          {(data.conflicts?.length || 0) > 0 && (
            <Section icon={<Swords className="w-3 h-3" />} title="Central tensions">
              <Lines values={data.conflicts} limit={expanded ? 10 : 4} />
            </Section>
          )}

          {expanded && (
            <>
              <Chapter title="The work">
                {(data.distinctive || data.structure) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {data.distinctive && (
                      <Section icon={<Sparkles className="w-3 h-3" />} title="What sets it apart">
                        <p className="text-sm text-zinc-400 leading-snug">{data.distinctive}</p>
                      </Section>
                    )}
                    {data.structure && (
                      <Section icon={<BookOpen className="w-3 h-3" />} title="Structure & pacing">
                        <p className="text-sm text-zinc-400 leading-snug">{data.structure}</p>
                      </Section>
                    )}
                  </div>
                )}
                {(data.themes?.length || 0) > 0 && (
                  <Section icon={<Sparkles className="w-3 h-3" />} title="Themes">
                    <Chips values={data.themes} />
                  </Section>
                )}
                {(data.signatureMoments?.length || 0) > 0 && (
                  <Section icon={<Sparkles className="w-3 h-3" />} title="Signature moments">
                    <Lines values={data.signatureMoments} />
                  </Section>
                )}
              </Chapter>

              <Chapter title="The world">
                {(data.worldRules || data.powerScale) && (
                  <Section icon={<Landmark className="w-3 h-3" />} title="How it works">
                    <p className="text-sm text-zinc-400 leading-snug">{data.worldRules || data.powerScale}</p>
                  </Section>
                )}
                {data.everydayLife && (
                  <Section icon={<Users className="w-3 h-3" />} title="Everyday life">
                    <p className="text-sm text-zinc-400 leading-snug">{data.everydayLife}</p>
                  </Section>
                )}
                {(data.locations?.length || 0) > 0 && (
                  <Section icon={<MapPin className="w-3 h-3" />} title="Places">
                    <EntityList entries={data.locations} limit={24} detailed />
                  </Section>
                )}
                {(data.factions?.length || 0) > 0 && (
                  <Section icon={<Landmark className="w-3 h-3" />} title="Factions & organizations">
                    <EntityList entries={data.factions} limit={24} detailed />
                  </Section>
                )}
                {(data.terminology?.length || 0) > 0 && (
                  <Section icon={<BookOpen className="w-3 h-3" />} title="In-universe vocabulary">
                    <EntityList
                      entries={(data.terminology || []).map((t) => ({
                        name: t.term, description: t.meaning, role: t.category,
                        introducedAt: t.introducedAt, introducedPct: t.introducedPct,
                      }))}
                      limit={24}
                    />
                  </Section>
                )}
              </Chapter>

              {/* `enemies` is what dossiers compiled before this was a reference
                  work called the same section. */}
              {((data.antagonists?.length || data.enemies?.length || 0) > 0) && (
                <Chapter title="Opposition">
                  <Section icon={<Swords className="w-3 h-3" />} title="Who and what stands in the way">
                    <EntityList
                      entries={data.antagonists?.length ? data.antagonists : data.enemies}
                      limit={24}
                      detailed
                    />
                  </Section>
                </Chapter>
              )}

              {(data.items?.length || 0) > 0 && (
                <Chapter title="Objects">
                  <Section icon={<Gem className="w-3 h-3" />} title="Notable objects">
                    <EntityList entries={data.items} limit={24} detailed />
                  </Section>
                </Chapter>
              )}

              <Chapter title="Style">
                {artStyleLine && (
                  <Section icon={<Palette className="w-3 h-3" />} title="Visual identity">
                    <p className="text-sm text-zinc-400 leading-snug">{artStyleLine}</p>
                  </Section>
                )}
                {data.soundAndMusic && (
                  <Section icon={<Music className="w-3 h-3" />} title="Sound & music">
                    <p className="text-sm text-zinc-400 leading-snug">{data.soundAndMusic}</p>
                  </Section>
                )}
              </Chapter>

              {(data.production || data.reception || (data.relatedWorks?.length || 0) > 0) && (
                <Chapter title="Production & reception">
                  {data.production && (
                    <Section icon={<Landmark className="w-3 h-3" />} title="How it was made">
                      <p className="text-sm text-zinc-400 leading-snug">{data.production}</p>
                    </Section>
                  )}
                  {data.reception && (
                    <Section icon={<Sparkles className="w-3 h-3" />} title="How it landed">
                      <p className="text-sm text-zinc-400 leading-snug">{data.reception}</p>
                    </Section>
                  )}
                  {(data.relatedWorks?.length || 0) > 0 && (
                    <Section icon={<Library className="w-3 h-3" />} title="Related works">
                      <Chips values={data.relatedWorks} />
                    </Section>
                  )}
                </Chapter>
              )}

              <Chapter title="Classification">
                {((data.genres?.length || 0) > 0 || (data.tags?.length || 0) > 0) && (
                  <Section icon={<ScrollText className="w-3 h-3" />} title="Descriptors the Codex suggests">
                    <div className="flex flex-wrap gap-1.5">
                      {(data.genres || []).map((g, i) => (
                        <span key={`cg-${i}`} className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">{g}</span>
                      ))}
                      {(data.tags || []).map((t, i) => (
                        <span key={`ct-${i}`} className="text-xs px-2 py-1 bg-orange-500/10 text-orange-400 rounded border border-orange-500/20">{t}</span>
                      ))}
                    </div>
                  </Section>
                )}
                {(data.audience || (data.contentWarnings?.length || 0) > 0) && (
                  <Section icon={<Users className="w-3 h-3" />} title="Audience & content notes">
                    {data.audience && <p className="text-sm text-zinc-400 leading-snug mb-2">{data.audience}</p>}
                    <Chips
                      values={data.contentWarnings}
                      className="text-xs px-2 py-1 bg-red-500/10 text-red-300 rounded border border-red-500/20"
                    />
                  </Section>
                )}
              </Chapter>

              {(weakSections.length > 0 || data.notes) && (
                <Chapter title="About this research">
                  {weakSections.length > 0 && (
                    <Section icon={<AlertTriangle className="w-3 h-3" />} title="Less certain about">
                      {/* Each area is researched by its own pass, so a shaky lookup
                          is named rather than souring the whole dossier. */}
                      <div className="flex flex-wrap gap-1.5">
                        {weakSections.map(([section, grade]) => (
                          <span
                            key={section}
                            className="text-xs px-2 py-1 bg-amber-500/10 text-amber-300/80 rounded border border-amber-500/20"
                          >
                            {SECTION_LABEL[section] || section} · {grade}
                          </span>
                        ))}
                      </div>
                    </Section>
                  )}
                  {data.notes && (
                    <p className="text-xs text-zinc-500 italic leading-snug">{data.notes}</p>
                  )}
                </Chapter>
              )}
              {(data.sources?.length || 0) > 0 && (
                <Section icon={<ExternalLink className="w-3 h-3" />} title="Sources consulted">
                  <div className="flex flex-col gap-1">
                    {(data.sources || []).slice(0, 6).map((s, i) => (
                      <a
                        key={`src-${i}`}
                        href={s}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-xs text-zinc-500 hover:text-amber-400 transition truncate"
                      >
                        {s}
                      </a>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}

          <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/5">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] font-black uppercase tracking-widest text-amber-500/80 hover:text-amber-400 transition"
            >
              {expanded ? 'Show less' : 'Show the full Codex'}
            </button>
            <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
              Compiled {format(new Date(codex.updatedAt), 'MMM d, yyyy')}
              {data.confidence && data.confidence !== 'high' ? ` · ${data.confidence} confidence` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
