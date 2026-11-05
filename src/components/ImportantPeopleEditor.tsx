import React, { useEffect, useRef, useState } from 'react';
import { UserPlus, Trash2, Save, ImagePlus, Users, Loader2 } from 'lucide-react';
import { DatabaseService } from '../services/db';
import type { ImportantPerson } from '../lib/importantPeople';

type Draft = Omit<ImportantPerson,'hasImage'|'aliases'> & { aliasesText: string };
const empty = (): Draft => ({
  id:'',name:'',aliasesText:'',relationship:'',notes:'',appearance:'',allowImages:false,
});
const fromPerson = (p:ImportantPerson):Draft => ({
  id:p.id,name:p.name,aliasesText:p.aliases.join(', '),relationship:p.relationship,
  notes:p.notes,appearance:p.appearance,allowImages:p.allowImages,
});

/** Independent explicit-save editor, avoids accidentally submitting the outer Settings form. */
export function ImportantPeopleEditor({provider,imageModel}:{
  provider:'nanoGpt'|'cliProxy'; imageModel:string;
}) {
  const [people,setPeople]=useState<ImportantPerson[]>([]);
  const [draft,setDraft]=useState<Draft>(empty);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [photo,setPhoto]=useState<string|null>(null);
  const photoRef=useRef<string|null>(null);
  const photoInput=useRef<HTMLInputElement>(null);
  const supportsReference=provider==='cliProxy' && /^gpt-image-/i.test(imageModel.trim());
  const selected=people.find(p=>p.id===draft.id);
  const setField=<K extends keyof Draft>(name:K,value:Draft[K])=>
    setDraft(prev=>({...prev,[name]:value}));

  const load=async()=>{
    const all=await DatabaseService.getImportantPeople();
    setPeople(all);
    return all;
  };
  useEffect(()=>{
    let active=true;
    DatabaseService.getImportantPeople().then(rows=>{if(active)setPeople(rows);})
      .catch(e=>{if(active)setError(e?.message||'Could not load people.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    let active=true;
    if(photoRef.current)URL.revokeObjectURL(photoRef.current);
    photoRef.current=null;
    setPhoto(null);
    if(!draft.id)return;
    void DatabaseService.getImportantPersonPhoto(draft.id).then(blob=>{
      if(!active||!blob)return;
      const url=URL.createObjectURL(blob);
      photoRef.current=url;setPhoto(url);
    }).catch(e=>{if(active)setError(e?.message||'Could not load photo.');});
    return()=>{
      active=false;
      if(photoRef.current)URL.revokeObjectURL(photoRef.current);
      photoRef.current=null;
    };
  },[draft.id]);

  const choose=(p:ImportantPerson|null)=>{
    if(busy)return;
    setError('');setNotice('');setDraft(p?fromPerson(p):empty());
  };
  const save=async()=>{
    setError('');setNotice('');
    if(!draft.name.trim()||!draft.relationship.trim()){
      setError('Give this person a name and explain how you know them.');
      return;
    }
    setBusy(true);
    try{
      const aliases=[...new Set(draft.aliasesText.split(',').map(s=>s.trim()).filter(Boolean))].slice(0,12);
      await DatabaseService.saveImportantPerson({
        id:draft.id,name:draft.name.trim(),aliases,relationship:draft.relationship.trim(),
        notes:draft.notes.trim(),appearance:draft.appearance.trim(),allowImages:draft.allowImages,
      });
      const all=await load();
      // New profile is returned by GET; select its stable ID for subsequent photo upload.
      if(!draft.id){
        const created=all.find(p=>p.name===draft.name.trim()&&p.relationship===draft.relationship.trim());
        if(created)setDraft(fromPerson(created));
      }
      setNotice('Saved. Future Recaps and new Wrapped images can use this profile.');
    }catch(e:any){setError(e.message||'Could not save person.');}
    finally{setBusy(false);}
  };
  const remove=async()=>{
    if(!draft.id||!window.confirm('Remove this person and permanently delete their private reference photo?'))return;
    setBusy(true);setError('');
    try{await DatabaseService.removeImportantPerson(draft.id);await load();chooseNew();}
    catch(e:any){setError(e.message||'Could not remove person.');}
    finally{setBusy(false);}
  };
  const chooseNew=()=>{setDraft(empty());setPhoto(null);setNotice('Person and reference photo removed.');};
  const upload=async(file?:File)=>{
    if(!file||!draft.id)return;
    setBusy(true);setError('');setNotice('');
    try{
      await DatabaseService.uploadImportantPersonPhoto(draft.id,file);
      const blob=await DatabaseService.getImportantPersonPhoto(draft.id);
      if(photoRef.current)URL.revokeObjectURL(photoRef.current);
      photoRef.current=blob?URL.createObjectURL(blob):null;
      setPhoto(photoRef.current);
      await load();
      setNotice('Reference photo saved privately.');
    }catch(e:any){setError(e.message||'Could not upload photo.');}
    finally{setBusy(false);if(photoInput.current)photoInput.current.value='';}
  };
  const removePhoto=async()=>{
    if(!draft.id||!window.confirm('Remove this private photo?'))return;
    setBusy(true);setError('');
    try{
      await DatabaseService.removeImportantPersonPhoto(draft.id);
      if(photoRef.current)URL.revokeObjectURL(photoRef.current);
      photoRef.current=null;setPhoto(null);
      await load();setNotice('Photo removed.');
    }catch(e:any){setError(e.message||'Could not remove photo.');}
    finally{setBusy(false);}
  };

  return (
    <section aria-label="Other Important People" className="rounded-xl border border-violet-500/20 bg-zinc-900/40 p-4 space-y-4">
      <div className="flex gap-2 items-center"><Users size={18} className="text-violet-300"/>
        <h3 className="text-sm font-bold text-white">Other Important People</h3></div>
      <p className="text-xs text-zinc-400 leading-relaxed">
        Give FauxLore context about people you mention in your Logs or Journal Thoughts.
        Names and relationships help Recaps and Wrappeds understand those references without inventing shared experiences.
        Optional private photos can guide pictures only when a scene actually calls for that person.
      </p>
      {loading?<Loader2 size={20} className="animate-spin text-zinc-400"/>:<div className="flex flex-wrap gap-2">
        {people.map(p=><button type="button" key={p.id} onClick={()=>choose(p)} disabled={busy}
          className={'px-3 py-2 rounded-lg text-xs font-semibold border '+
          (draft.id===p.id?'text-violet-100 border-violet-400/50 bg-violet-500/20':'text-zinc-300 border-white/10 bg-white/5 hover:bg-white/10')}>
          {p.name}{p.hasImage?' 📷':''}
        </button>)}
        <button type="button" onClick={()=>choose(null)} disabled={busy||people.length>=50}
          className="px-3 py-2 rounded-lg text-xs flex gap-1 items-center border border-dashed border-white/20 text-zinc-300 hover:text-white">
          <UserPlus size={13}/> Add person
        </button>
      </div>}
      <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-300 space-y-1 block">Name
            <input className="input-field w-full" maxLength={100} value={draft.name}
              onChange={e=>setField('name',e.target.value)} placeholder="e.g. Alex" /></label>
          <label className="text-xs text-zinc-300 space-y-1 block">Your connection
            <input className="input-field w-full" maxLength={220} value={draft.relationship}
              onChange={e=>setField('relationship',e.target.value)} placeholder="Friend, partner, guildmate…" /></label>
        </div>
        <label className="text-xs text-zinc-300 space-y-1 block">Other names / nicknames (comma-separated)
          <input className="input-field w-full" maxLength={400} value={draft.aliasesText}
            onChange={e=>setField('aliasesText',e.target.value)} placeholder="e.g. Alex, Al" /></label>
        <label className="text-xs text-zinc-300 space-y-1 block">Background and shared history
          <textarea className="input-field w-full resize-y" rows={3} maxLength={2000} value={draft.notes}
            onChange={e=>setField('notes',e.target.value)} placeholder="How you know each other, shared interests, what their presence means…" /></label>
        <label className="text-xs text-zinc-300 space-y-1 block">Appearance for illustration (optional)
          <textarea className="input-field w-full resize-y" rows={2} maxLength={800} value={draft.appearance}
            onChange={e=>setField('appearance',e.target.value)} placeholder="Distinguishing visible features, hair, clothing…" /></label>
        <label className="flex gap-2 items-start text-xs text-zinc-300 cursor-pointer">
          <input type="checkbox" className="accent-violet-500 mt-0.5" checked={draft.allowImages}
            onChange={e=>setField('allowImages',e.target.checked)}/>
          <span>Allow FauxLore to depict this person in future Wrapped illustrations if they are explicitly mentioned in a relevant scene.</span>
        </label>
        {draft.id&&<div className="flex gap-3 items-center border-t border-white/10 pt-3">
          {photo?<img className="w-16 h-16 rounded-lg object-cover border border-white/10" src={photo} alt={'Private reference of '+draft.name}/>
            :<div className="w-16 h-16 rounded-lg border border-dashed border-white/20 grid place-items-center text-zinc-500"><ImagePlus size={23}/></div>}
          <div className="space-y-2">
            <label className={'inline-flex cursor-pointer items-center gap-2 text-xs font-semibold rounded-lg px-3 py-2 bg-violet-500/15 text-violet-200 border border-violet-400/20 '+(busy?'opacity-50 pointer-events-none':'')}>
              <ImagePlus size={14}/>{photo?'Replace reference photo':'Upload reference photo'}
              <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                disabled={busy} onChange={e=>void upload(e.target.files?.[0])}/>
            </label>
            {photo&&<button type="button" disabled={busy} onClick={()=>void removePhoto()}
              className="text-xs text-rose-300 hover:text-rose-200 ml-2">Remove photo</button>}
            <p className="text-[10px] text-zinc-500">Private JPEG, PNG or WebP · max 4 MB.
              {draft.allowImages&&!supportsReference?' Current provider uses text appearance only.':''}</p>
          </div>
        </div>}
        {!draft.id&&<p className="text-[11px] text-zinc-500">Save the person first to upload a private photo.</p>}
        <p className="text-[11px] text-zinc-500">Only upload a photo you have permission to use. Private files stay on your account and are sent to the configured image provider only for explicitly matched artwork. This is not face recognition.</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {draft.id?<button type="button" disabled={busy} onClick={()=>void remove()}
            className="text-xs text-rose-300 hover:text-rose-200 flex items-center gap-1"><Trash2 size={13}/> Delete person</button>:<span/>}
          <button type="button" disabled={busy||loading} onClick={()=>void save()}
            className="text-xs font-bold px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white inline-flex items-center gap-2">
            {busy?<Loader2 size={14} className="animate-spin"/>:<Save size={14}/>} Save person
          </button>
        </div>
      </div>
      {error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}
      {notice&&<p role="status" className="text-xs text-emerald-300">{notice}</p>}
    </section>
  );
}
