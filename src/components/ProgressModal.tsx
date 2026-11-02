import React, { useState, useEffect, useRef } from 'react';
import type { MediaItem, ProgressLog, MetricType, Status } from '../types/schema';
import { getMetricForType, MEDIA_COLORS } from '../types/schema';
import { X, Plus, Minus, History, Check, Clock, MapPin, ArrowRight, Sparkles, Star, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useMediaContext } from '../contexts/MediaContext';
import { logSpan, formatDuration } from '../lib/logDuration';
import { suggestLogStatus } from '../lib/logStatus';
import { generateSessionQuestion, fallbackSessionQuestion } from '../services/sessionPrompt';

interface ProgressModalProps {
  isOpen: boolean;
  item: MediaItem | null;
  onClose: () => void;
  onLog: (mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string,
    location?: string, isHistoric?: boolean, extraUpdates?: any) => Promise<ProgressLog>;
}

const inputStyle = 'w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/60';
const buttonStyle = 'rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-40';

export function ProgressModal({ isOpen, item, onClose, onLog }: ProgressModalProps) {
  const { logs, settings, updateLog } = useMediaContext();
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<'set' | 'add'>('set');
  const [inputValue, setInputValue] = useState<number | ''>(1);
  const [manualStatus, setManualStatus] = useState<Status | null>(null);
  const [location, setLocation] = useState('');
  const [showLocations, setShowLocations] = useState(false);
  const [logDate, setLogDate] = useState('');
  const [logTime, setLogTime] = useState('');
  const [isHistorical, setIsHistorical] = useState(false);
  const [enjoyment, setEnjoyment] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [thoughts, setThoughts] = useState('');
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [userRating, setUserRating] = useState<number | ''>('');
  const [userReview, setUserReview] = useState('');
  const [savedLog, setSavedLog] = useState<ProgressLog | null>(null);
  const [savedStatus, setSavedStatus] = useState<Status>('Active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const saveRef = useRef(false);
  const openItemId = item?.id;
  const metricType = item ? getMetricForType(item.mediaType) : null;
  const currentVal = item && metricType ? Number(item[metricType as keyof MediaItem]) || 0 : 0;
  const colors = item ? MEDIA_COLORS[item.mediaType] : null;
  const isTimed = item && ['Game','Visual Novel','Audiobook'].includes(item.mediaType);
  const uniqueLocations = Array.from(new Set(logs.map(l => l.location).filter((x): x is string => !!x)));
  const filteredLocations = uniqueLocations.filter(l => l.toLowerCase().includes(location.toLowerCase()) && l !== location).slice(0, 7);

  useEffect(() => {
    if (!isOpen || !item) return;
    abortRef.current?.abort();
    saveRef.current = false;
    setStep(1);
    setMode('set');
    const metric = getMetricForType(item.mediaType);
    const val = metric ? Number(item[metric as keyof MediaItem]) || 0 : 0;
    setInputValue(item.mediaType === 'Movie' ? 1 : Number((val + 1).toFixed(2)));
    setManualStatus(null);
    const itemLocation = logs.filter(l => l.mediaId === item.id && l.location)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.location;
    setLocation(itemLocation || localStorage.getItem('fauxlore_last_location') || '');
    setShowLocations(false);
    setLogDate(format(new Date(), 'yyyy-MM-dd'));
    setLogTime(format(new Date(), 'HH:mm'));
    setIsHistorical(false);
    setEnjoyment(null);
    setNote(''); setThoughts(''); setQuestion(''); setAsking(false);
    setUserRating(item.userRating ?? '');
    setUserReview(item.userReview || '');
    setSavedLog(null);
    setSavedStatus(item.status);
    setSaving(false);
    setError('');
    // Only reset when opening or selecting a DIFFERENT item; NOT when logs
    // refresh between step 1 and 2.
  }, [isOpen, openItemId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!isOpen || !item || !metricType || !colors) return null;
  const deltaRaw = item.mediaType === 'Movie' ? (inputValue === 1 ? 1 : 0) :
    typeof inputValue === 'number' ? (mode === 'set' ? inputValue - currentVal : inputValue) : 0;
  const delta = Number(deltaRaw.toFixed(3));
  const automaticStatus = suggestLogStatus(item, delta, isHistorical);
  const selectedStatus = manualStatus || automaticStatus;
  const reviewAvailable = savedStatus === 'Completed' && item.status !== 'Completed';
  const previousLogs = logs.filter(l => l.mediaId === item.id && l.metricType !== 'statusChange' && !l.isHistoric);

  const dateTime = () => {
    if (isHistorical) return '1970-01-01T00:00:00.000Z';
    const d = new Date(logDate + 'T' + (logTime || '12:00') + ':00');
    if (Number.isNaN(d.getTime())) throw new Error('Please enter a valid date and time.');
    return d.toISOString();
  };
  const previewSpan = !isHistorical && !!logDate && delta > 0 ? logSpan({
    delta, metricType, timestamp: new Date(logDate + 'T' + (logTime || '12:00') + ':00').toISOString(),
  }, item, settings) : null;

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const startReflection = async () => {
    if (saveRef.current || !Number.isFinite(delta) || (!delta && selectedStatus === item.status)) {
      setError('Add some progress or change the status to create a session.');
      return;
    }
    saveRef.current = true;
    setSaving(true); setError('');
    try {
      const stamp = dateTime();
      const saved = await onLog(item.id, metricType, delta, undefined, stamp, location, isHistorical, {
        status: selectedStatus,
        ...(item.mediaType === 'Movie' && delta > 0 ? { watched: true } : {}),
        sessionEnjoyment: enjoyment,
      });
      if (location) localStorage.setItem('fauxlore_last_location', location);
      setSavedLog(saved);
      setSavedStatus(selectedStatus);
      setStep(2);
      setSaving(false);
      const controller = new AbortController();
      abortRef.current = controller;
      setAsking(true);
      const timeout = setTimeout(() => controller.abort(), 10000);
      void generateSessionQuestion({
        item, delta, estimatedMinutes: previewSpan?.minutes, metricType, enjoyment, statusBefore: item.status, statusAfter: selectedStatus,
        location, previousLogs, settings, signal: controller.signal,
      }).then(result => {
        if (!controller.signal.aborted) setQuestion(result);
      }).catch(() => {
        if (!controller.signal.aborted) setQuestion(fallbackSessionQuestion({
          item, delta, metricType, enjoyment, statusBefore: item.status,
          statusAfter: selectedStatus, location, previousLogs, settings,
        }));
        else setQuestion(fallbackSessionQuestion({
          item, delta, metricType, enjoyment, statusBefore: item.status,
          statusAfter: selectedStatus, location, previousLogs, settings,
        }));
      }).finally(() => { clearTimeout(timeout); setAsking(false); });
    } catch (e: any) {
      setError(e?.message || 'Could not save this log. Nothing has changed.');
      saveRef.current = false;
      setSaving(false);
    }
  };

  const finish = async () => {
    if (!savedLog || saving) return;
    const changes: Partial<ProgressLog> & { userRating?: number; userReview?: string } = {};
    if (note.trim()) changes.note = note.trim();
    if (thoughts.trim()) {
      changes.thoughts = thoughts.trim();
      if (question) changes.thoughtPrompt = question;
    }
    if (reviewAvailable) {
      if (userRating !== '' && userRating !== item.userRating) changes.userRating = userRating;
      if (userReview !== (item.userReview || '')) changes.userReview = userReview;
    }
    if (!Object.keys(changes).length) { close(); return; }
    setSaving(true); setError('');
    try {
      await updateLog(savedLog.id, changes);
      close();
    } catch (e: any) {
      setError(e?.message || 'Could not save reflection. The progress log itself is safe.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="relative w-full max-w-xl max-h-[94vh] overflow-hidden flex flex-col rounded-[2rem] border border-white/15 bg-gradient-to-b from-zinc-900 to-[#07070b] shadow-2xl">
        <header className="flex items-center gap-4 px-5 sm:px-7 py-5 border-b border-white/10">
          {item.coverImageUrl && <img src={item.coverImageUrl} alt="" referrerPolicy="no-referrer" className="w-12 h-16 rounded-lg object-cover border border-white/10" />}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-violet-300 uppercase tracking-[.2em] font-black">Session log · {step} / 2</p>
            <h2 className="text-lg sm:text-2xl text-white font-black truncate">{item.title}</h2>
            <p className="text-xs text-zinc-400">{step === 1 ? 'The facts, first.' : 'Your thoughts, if you feel like sharing.'}</p>
          </div>
          <button type="button" onClick={close} aria-label="Close log" className="p-2 rounded-full border border-white/10 text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </header>
        <div className="flex gap-1 px-5 sm:px-7 pt-4">
          <div className="flex-1 h-1.5 bg-violet-400 rounded-full" />
          <div className={'flex-1 h-1.5 rounded-full ' + (step === 2 ? 'bg-violet-400' : 'bg-white/15')} />
        </div>
        <div className="overflow-y-auto flex-1 px-5 sm:px-7 py-5 space-y-5">
          {step === 1 ? <>
            <section className="rounded-2xl p-4 bg-white/[.045] border border-white/10 space-y-4">
              {item.mediaType !== 'Movie' && <div className="flex gap-2">
                {(['set','add'] as const).map(m => <button key={m} type="button"
                  onClick={() => { setMode(m); setInputValue(m === 'add' ? 1 : Number((currentVal + 1).toFixed(2))); }}
                  className={'flex-1 py-2 text-xs font-bold rounded-lg border ' + (mode === m ? 'bg-violet-500/20 border-violet-400/40 text-white' : 'border-white/10 text-zinc-400')}>
                  {m === 'set' ? 'Set total' : 'Add progress'}
                </button>)}
              </div>}
              <div className="flex justify-between items-center gap-3">
                <div>
                  <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">{item.mediaType === 'Movie' ? 'Movie watched' : mode === 'set' ? 'New total' : 'Progress to add'}</p>
                  {item.mediaType !== 'Movie' && mode === 'set' && <p className="text-xs text-zinc-500 mt-1">Currently: {currentVal}</p>}
                </div>
                {delta !== 0 && <span className={'text-xs font-bold px-3 py-1 rounded-full ' + (delta > 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300')}>{delta > 0 ? '+' : ''}{delta} {isTimed ? 'hours' : 'units'}</span>}
              </div>
              {item.mediaType === 'Movie' ?
                <label className="flex items-center gap-3 cursor-pointer text-white font-bold text-sm">
                  <input type="checkbox" checked={inputValue === 1} onChange={e => setInputValue(e.target.checked ? 1 : 0)} className="accent-violet-500 w-5 h-5"/>
                  I watched this movie
                </label> :
                <div className="flex items-stretch gap-2">
                  <button type="button" className={buttonStyle} aria-label="Decrease progress" onClick={() => setInputValue(v => typeof v === 'number' ? Number((v - 1).toFixed(2)) : 0)}><Minus size={16}/></button>
                  {isTimed ? <div className="grid grid-cols-2 gap-2 flex-1">
                    <label className="text-[10px] text-zinc-400 uppercase font-bold text-center">Hours
                      <input type="number" min="0" className={inputStyle + ' text-center text-xl font-black mt-1'}
                        value={typeof inputValue === 'number' ? Math.floor(inputValue) : ''}
                        onChange={e => {
                          const hours = Math.max(0, Number(e.target.value) || 0);
                          const mins = typeof inputValue === 'number' ? Math.round((inputValue % 1)*60) : 0;
                          setInputValue(Number((hours + mins/60).toFixed(4)));
                        }}/>
                    </label>
                    <label className="text-[10px] text-zinc-400 uppercase font-bold text-center">Minutes
                      <input type="number" min="0" max="59" className={inputStyle + ' text-center text-xl font-black mt-1'}
                        value={typeof inputValue === 'number' ? Math.round((inputValue % 1)*60) : ''}
                        onChange={e => {
                          const minutes = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                          const hours = typeof inputValue === 'number' ? Math.floor(inputValue) : 0;
                          setInputValue(Number((hours + minutes/60).toFixed(4)));
                        }}/>
                    </label>
                  </div> : <input type="number" min="0" value={inputValue} onChange={e => setInputValue(e.target.value === '' ? '' : Number(e.target.value))}
                    className={inputStyle + ' flex-1 min-w-0 text-center text-2xl font-black'}/>}
                  <button type="button" className={buttonStyle} aria-label="Increase progress" onClick={() => setInputValue(v => typeof v === 'number' ? Number((v + 1).toFixed(2)) : 1)}><Plus size={16}/></button>
                </div>}
              {previewSpan && previewSpan.minutes > 0 && <p className="text-xs text-zinc-500 flex items-center gap-2"><Clock size={13}/>
                {previewSpan.start.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} – {previewSpan.end.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · {formatDuration(previewSpan.minutes)}
              </p>}
            </section>

            <section className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-400 font-bold">Date
                <input type="date" disabled={isHistorical} value={logDate} onChange={e => setLogDate(e.target.value)} className={inputStyle + ' mt-1'}/>
              </label>
              <label className="text-xs text-zinc-400 font-bold">End time
                <input type="time" disabled={isHistorical} value={logTime} onChange={e => setLogTime(e.target.value)} className={inputStyle + ' mt-1'}/>
              </label>
              <label className="col-span-2 text-xs text-zinc-400 flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isHistorical} onChange={e => setIsHistorical(e.target.checked)} className="accent-amber-500"/>
                <History size={14}/> Undated historical entry (no automatic status change)
              </label>
            </section>

            <section className="space-y-2">
              <label className="text-xs text-zinc-400 font-bold flex gap-2 items-center"><MapPin size={13}/> Location</label>
              <div className="relative">
                <input value={location} onChange={e => {setLocation(e.target.value);setShowLocations(true);}}
                  onFocus={()=>setShowLocations(true)} onBlur={()=>setTimeout(()=>setShowLocations(false),150)}
                  placeholder="Where were you?" className={inputStyle} />
                {showLocations && filteredLocations.length > 0 && <div className="absolute z-30 top-full mt-1 w-full bg-zinc-900 rounded-xl border border-white/10 max-h-32 overflow-auto shadow-xl">
                  {filteredLocations.map(l => <button type="button" key={l} className="block text-left w-full px-3 py-2 text-xs text-zinc-200 hover:bg-white/10" onMouseDown={e=>e.preventDefault()} onClick={()=>{setLocation(l);setShowLocations(false);}}>{l}</button>)}
                </div>}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[.035] p-4 space-y-3">
              <div className="flex justify-between gap-3 items-baseline">
                <h3 className="font-bold text-white text-sm">Session enjoyment</h3><span className="text-xs text-zinc-500">Optional · not the full-work rating</span>
              </div>
              <div className="grid grid-cols-5 gap-2" role="group" aria-label="Rate this session 1 to 5">
                {[1,2,3,4,5].map(n => <button type="button" key={n}
                  aria-pressed={enjoyment === n} onClick={()=>setEnjoyment(enjoyment===n?null:n)}
                  className={'rounded-xl py-3 border flex flex-col items-center gap-1 ' + (enjoyment === n ? 'border-amber-400/70 bg-amber-400/15' : 'border-white/10 bg-black/30 hover:bg-white/10')}>
                  <Star size={20} className={enjoyment !== null && enjoyment >= n ? 'fill-amber-400 text-amber-400' : 'text-zinc-500'}/>
                  <span className="text-xs text-zinc-300">{n}</span>
                </button>)}
              </div>
              <p className="text-xs text-zinc-500 text-center">{enjoyment === null ? 'Leave blank if you would rather not rate' : ['','Bad','Not great','Okay','Really good','Amazing'][enjoyment]}</p>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-white text-sm">Status</h3>
                {!manualStatus && selectedStatus !== item.status && <span className="text-emerald-300 text-xs">Auto: {item.status} → {selectedStatus}</span>}
              </div>
              <select value={selectedStatus} onChange={e => setManualStatus(e.target.value as Status)} className={inputStyle}>
                {(['Planning','Active','On Hold','Caught Up','Completed','Extras','Dropped','Unreleased'] as Status[]).map(s=>
                  <option key={s} value={s}>{s}</option>)}
              </select>
              {selectedStatus === 'Completed' && item.status !== 'Completed' && <p className="text-xs text-amber-200/80">You can review the complete work on the next page.</p>}
            </section>
          </> : <>
            <section className="rounded-2xl bg-emerald-500/10 border border-emerald-400/20 p-4 flex gap-3">
              <Check className="text-emerald-300 shrink-0" size={20}/>
              <div><p className="text-white font-bold">Progress saved</p>
                <p className="text-xs text-zinc-400">Your session is safe. Everything on this page is optional.</p>
              </div>
            </section>
            <section className="space-y-2">
              <h3 className="text-white font-bold text-sm">Notes <span className="font-normal text-zinc-500">· factual / organizational</span></h3>
              <textarea rows={2} className={inputStyle + ' resize-y'} placeholder="Episode number, Grand Prix, comic issue, chapter..."
                value={note} onChange={e => setNote(e.target.value)} />
            </section>
            <section className="rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-violet-200 font-black text-xs uppercase tracking-wider"><Sparkles size={16}/> A question just for you</div>
              <p className="text-base sm:text-lg text-white font-bold leading-snug">{question || fallbackSessionQuestion({
                item,delta,metricType,enjoyment,statusBefore:item.status,statusAfter:savedStatus,location,previousLogs,settings,
              })}</p>
              {asking && <p className="flex gap-2 items-center text-xs text-violet-300/70">
                <Loader2 size={13} className="animate-spin"/> AI is personalizing this question...
              </p>}
              <p className="text-xs text-zinc-500">One sentence is enough. You can ignore the question and write whatever matters to you.</p>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm text-white font-bold">Journal <span className="font-normal text-zinc-500">· your actual thoughts</span></h3>
              <textarea rows={4} className={inputStyle + ' resize-y'} placeholder="What stood out? What changed? How did it feel?"
                value={thoughts} onChange={e => setThoughts(e.target.value)} />
            </section>
            {reviewAvailable && <section className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4 space-y-3">
              <h3 className="text-amber-200 font-black text-sm">Completed · Full-work review</h3>
              <p className="text-zinc-400 text-xs">Separate from your enjoyment of this particular session.</p>
              <div className="flex flex-wrap items-center gap-2">
                {[0.5,1,1.5,2,2.5,3,3.5,4,4.5,5].map(n=><button type="button" key={n}
                  onClick={()=>setUserRating(userRating===n?'':n)}
                  className={'px-2.5 py-2 rounded-lg text-xs font-bold border ' +
                    (userRating === n ? 'bg-amber-400/20 text-amber-200 border-amber-400/50':'text-zinc-400 border-white/10 hover:text-white')}>{n}</button>)}
                {userRating !== '' && <button type="button" onClick={()=>setUserRating('')} className="text-xs text-zinc-400 underline">Clear</button>}
              </div>
              <textarea rows={3} className={inputStyle+' resize-y'} value={userReview} onChange={e=>setUserReview(e.target.value)}
                placeholder="Your final review of the entire work (optional)" />
            </section>}
          </>}
          {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/30 p-3 text-rose-200 text-sm">{error}</div>}
        </div>
        <footer className="px-5 sm:px-7 py-4 border-t border-white/10 bg-black/30 flex items-center gap-3">
          {step === 1 ? <>
            <button type="button" className={buttonStyle + ' flex-1'} onClick={close}>Cancel</button>
            <button type="button" onClick={()=>void startReflection()} disabled={saving || saveRef.current}
              className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-3 font-black text-white disabled:opacity-50">
              {saving ? <Loader2 className="animate-spin" size={17}/> : <ArrowRight size={17}/>} Save & Continue
            </button>
          </> : <>
            <button type="button" onClick={close} className={buttonStyle + ' flex-1'}>Skip reflection</button>
            <button type="button" onClick={()=>void finish()} disabled={saving} className="flex-[2] flex items-center gap-2 justify-center rounded-xl px-4 py-3 bg-violet-600 hover:bg-violet-500 text-white font-black disabled:opacity-50">
              {saving ? <Loader2 size={17} className="animate-spin"/> : <Check size={17}/>} Complete log
            </button>
          </>}
        </footer>
      </div>
    </div>
  );
}
