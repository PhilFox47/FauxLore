import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, Loader2 } from 'lucide-react';
import { DatabaseService } from '../services/db';

export function VisualSelfReferencePicker({ enabled, provider, imageModel }: {
  enabled: boolean; provider: 'cliProxy' | 'nanoGpt'; imageModel: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const objectUrl = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const canAttach = provider === 'cliProxy' && /^gpt-image-/i.test(imageModel.trim());
  const showPhoto = (blob: Blob | null) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = blob ? URL.createObjectURL(blob) : null;
    setPreview(objectUrl.current);
    setHasPhoto(!!blob);
  };

  useEffect(() => {
    let alive = true;
    void DatabaseService.getVisualSelfReference().then(blob => {
      if (alive) {
        showPhoto(blob);
        setReady(true);
      }
    }).catch(() => {
      if (alive) { setError('Could not load your saved face reference.'); setReady(true); }
    });
    return () => {
      alive = false;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      await DatabaseService.uploadVisualSelfReference(file);
      const blob = await DatabaseService.getVisualSelfReference();
      showPhoto(blob);
    } catch (e: any) {
      setError(e?.message || 'Could not save photo.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true); setError('');
    try {
      await DatabaseService.deleteVisualSelfReference();
      showPhoto(null);
    } catch (e: any) { setError(e?.message || 'Could not delete photo.'); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-3">
      <div>
        <h4 className="text-xs font-bold text-zinc-200">Face Reference Image <span className="font-normal text-zinc-500">· optional</span></h4>
        <p className="text-[11px] text-zinc-500 mt-1">
          A clear photo of just your face helps the image model keep your likeness while changing outfits, poses and art styles.
          Stored privately on your account; only sent for images that explicitly depict you.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        {preview ? <img src={preview} alt="Your private face reference" className="w-20 h-20 rounded-xl object-cover border border-white/10" />
          : <div className="w-20 h-20 rounded-xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center text-zinc-500">
            {ready ? <ImagePlus size={24} /> : <Loader2 size={20} className="animate-spin" />}
          </div>}
        <div className="flex-1 min-w-[180px] space-y-2">
          <div className="flex gap-2 flex-wrap">
            <label className={'px-3 py-2 rounded-lg text-xs font-bold border border-violet-400/30 bg-violet-500/15 text-violet-100 flex gap-2 items-center cursor-pointer hover:bg-violet-500/25 ' + (busy ? 'opacity-40 pointer-events-none' : '')}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
              {hasPhoto ? 'Replace photo' : 'Upload photo'}
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                disabled={busy} onChange={event => void upload(event.target.files?.[0])} />
            </label>
            {hasPhoto && <button type="button" onClick={() => void remove()} disabled={busy}
              className="px-3 py-2 rounded-lg text-xs font-bold border border-white/10 text-zinc-300 hover:bg-rose-500/10 hover:text-rose-300 flex items-center gap-2 disabled:opacity-40">
              <Trash2 size={14} /> Remove
            </button>}
          </div>
          <p className="text-[11px] text-zinc-500">JPEG, PNG or WebP · up to 4 MB · only one photo saved at a time.</p>
        </div>
      </div>
      {!enabled && hasPhoto && <p className="text-[11px] text-zinc-400">Your photo remains saved, but <strong>Never</strong> prevents its use in generated images.</p>}
      {enabled && hasPhoto && !canAttach && <p className="text-[11px] text-amber-300">
        Your current image provider/model does not support sending this face photo through FauxLore.
        The text description still works. For actual image reference input, select CLIProxyAPI with a GPT Image model.
      </p>}
      {enabled && hasPhoto && canAttach && <p className="text-[11px] text-emerald-300">
        Ready for opted-in self scenes via the GPT Image edit endpoint. Provider support is checked when generating.
      </p>}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </section>
  );
}
