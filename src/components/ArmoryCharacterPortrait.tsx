import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Expand, RotateCw, Sparkles, UserRound, AlertCircle } from 'lucide-react';
import type { Artifact } from '../types/schema';
import { portraitLoadoutKey } from '../lib/armoryPortrait';
import { DatabaseService } from '../services/db';

type PortraitStatus = Awaited<ReturnType<typeof DatabaseService.getArmoryPortraitStatus>>;
type Props = {
  equipped: Artifact[];
  visualMode?: 'never' | 'auto' | 'prefer';
};
export function ArmoryCharacterPortrait({equipped,visualMode}:Props) {
  const [status,setStatus] = useState<PortraitStatus | null>(null);
  const [picture,setPicture] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [expanded,setExpanded] = useState(false);
  const imageUrl = useRef<string | null>(null);
  const version = useRef('');
  const gearKey = useMemo(()=>portraitLoadoutKey(equipped),[equipped]);

  const refresh = useCallback(async () => {
    const data = await DatabaseService.getArmoryPortraitStatus();
    setStatus(data);
    // Never recreate object URL just because the UI is polling an in-flight render.
    const imageVersion = data.hasImage ? String(data.updatedAt) : '';
    if (data.hasImage && (version.current !== imageVersion || !imageUrl.current)) {
      const blob = await DatabaseService.getArmoryPortraitImage();
      if (blob) {
        const next = URL.createObjectURL(blob);
        if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
        imageUrl.current = next; version.current = imageVersion;
        setPicture(next);
      }
    } else if (!data.hasImage) {
      if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
      imageUrl.current = null; version.current = ''; setPicture(null);
    }
  },[]);

  useEffect(()=>{
    let active = true;
    const fetchStatus = async () => {
      try { if (active) await refresh(); }
      catch { if (active) setError('Could not load your character portrait.'); }
    };
    void fetchStatus();
    return ()=>{active=false;};
  },[refresh,gearKey]);

  useEffect(()=>{
    if (status?.status !== 'generating') return;
    const interval = window.setInterval(()=>{void refresh().catch(()=>setError('Could not check image generation.'));},3500);
    return ()=>window.clearInterval(interval);
  },[status?.status,refresh]);

  useEffect(()=>()=>{if(imageUrl.current) URL.revokeObjectURL(imageUrl.current);},[]);

  const generate = async () => {
    if (busy || status?.status === 'generating') return;
    setBusy(true); setError('');
    try {
      await DatabaseService.generateArmoryPortrait();
      await refresh();
    } catch (e: any) {setError(e?.message || 'Portrait generation could not start.');}
    finally {setBusy(false);}
  };

  const generating = busy || status?.status === 'generating';
  const hasGear = equipped.length>0;
  return (
    <div className="relative overflow-hidden rounded-[2.5rem] border border-violet-500/20 bg-gradient-to-b from-violet-950/20 via-zinc-950 to-black shadow-[0_20px_40px_-10px_rgba(0,0,0,.8)] p-5 sm:p-7 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg sm:text-xl font-black uppercase tracking-widest text-white font-display">
            <UserRound className="w-5 h-5 text-violet-300" /> Character Portrait
          </h2>
          <p className="text-xs text-zinc-500 mt-1">Your current gear, brought to life.</p>
        </div>
        <span className="px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold text-violet-300 border border-violet-500/20 bg-violet-500/10 rounded-full">2:3 Artwork</span>
      </div>

      <div className="relative w-full max-w-[410px] mx-auto aspect-[2/3] overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-800/40 via-zinc-900 to-black border border-white/10 shadow-2xl">
        {picture
          ? <button type="button" title="View character portrait" onClick={()=>setExpanded(true)} className="w-full h-full group">
              <img src={picture} alt="RPG character wearing your saved equipped loadout" className="w-full h-full object-contain" />
              <span className="absolute bottom-3 right-3 p-2 rounded-lg bg-black/60 text-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity"><Expand size={17}/></span>
            </button>
          : <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 gap-4">
              <div className="w-20 h-20 rounded-full border border-violet-400/20 bg-violet-500/10 flex items-center justify-center">
                <UserRound className="w-10 h-10 text-violet-300/60"/>
              </div>
              <p className="text-zinc-300 text-base font-bold">Your adventurer awaits</p>
              <p className="text-zinc-500 text-xs max-w-xs">Generate an original RPG portrait wearing the items from your equipped slots.</p>
            </div>}
        {generating && <div className="absolute inset-0 pointer-events-none flex flex-col justify-center items-center gap-3 bg-black/65 backdrop-blur-[2px] text-center p-5">
          <RotateCw className="w-9 h-9 animate-spin text-violet-300"/>
          <strong className="text-white text-sm">Forging your portrait…</strong>
          <span className="text-xs text-zinc-300">This is a manual AI image job. Your existing portrait is kept until the new one is ready.</span>
        </div>}
        {picture && status?.stale && !generating && <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-black text-[11px] text-center px-3 py-2 font-black">
          Loadout or appearance changed · Portrait is out of date
        </div>}
      </div>

      <div className="space-y-2">
        <button type="button" onClick={()=>void generate()} disabled={generating || !hasGear}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-500/20 border border-violet-400/30 py-3 px-4 text-violet-100 text-sm font-black uppercase tracking-wide hover:bg-violet-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {generating ? <RotateCw size={16} className="animate-spin"/> : picture ? <RotateCw size={16}/> : <Camera size={16}/>}
          {generating ? 'Generating portrait…' : picture ? 'Regenerate Portrait' : 'Generate Portrait'}
        </button>
        <p className="text-xs text-zinc-500 text-center">
          {equipped.length} equipped slot{equipped.length === 1 ? '' : 's'} · Item images and descriptions guide the illustration
        </p>
        {visualMode === 'never' && <p className="text-xs text-amber-300 text-center">
          Visual Self-Insert is set to Never. Portraits will use an anonymous avatar, not your face.
        </p>}
        {visualMode !== 'never' && status && !status.hasFaceReference &&
          <p className="text-xs text-zinc-500 text-center">
            Add a face reference under Preferences for a more recognizable likeness.
          </p>}
        {!hasGear && <p className="text-xs text-zinc-500 text-center">Equip an item to unlock character portraits.</p>}
        {(error || status?.error) && !generating && <p role="alert" className="flex gap-2 items-start text-xs text-rose-300">
          <AlertCircle size={16} className="shrink-0" /> {error || status?.error}
        </p>}
      </div>
      {expanded && picture && <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4" role="dialog" aria-label="Character portrait" onClick={()=>setExpanded(false)}>
        <img src={picture} alt="Expanded RPG character portrait" className="max-w-full max-h-full object-contain rounded-xl" />
        <button className="absolute top-5 right-5 px-3 py-2 bg-zinc-800 rounded-lg text-white text-xs">Close</button>
      </div>}
    </div>
  );
}
