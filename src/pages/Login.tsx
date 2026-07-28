import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { BRAND_LOGO_URL } from '../lib/brand';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [stayLoggedIn, setStayLoggedIn] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [covers, setCovers] = useState<string[]>([]);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === 'undefined' ? 1920 : window.innerWidth,
    h: typeof window === 'undefined' ? 1080 : window.innerHeight,
  }));

  useEffect(() => {
    fetch('/api/public/covers')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) setCovers(data);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /**
   * How many covers the backdrop can actually show, derived from the real
   * viewport: the grid is 150vw x 150vh of fixed-ratio tiles whose width is a
   * breakpoint-dependent share of the viewport. Guessing high and repeating the
   * list — which is what this used to do — put the same cover on screen ten
   * times over.
   */
  const tileCount = React.useMemo(() => {
    const { w, h } = viewport;
    const tileVw = w >= 1024 ? 0.08 : w >= 768 ? 0.10 : w >= 640 ? 0.14 : 0.20;
    const gap = 16;
    const tileW = w * tileVw + gap;
    const tileH = w * tileVw * 1.5 + gap; // covers are 2:3
    const cols = Math.ceil((w * 1.5) / tileW);
    const rows = Math.ceil((h * 1.5) / tileH);
    return Math.max(12, cols * rows);
  }, [viewport]);

  /**
   * Unique covers first, in a stable shuffle. Only a library with fewer covers
   * than the grid has tiles falls back to repeating, and then it cycles rather
   * than randomising, so the copies end up as far apart as possible.
   */
  const tiles = React.useMemo(() => {
    if (covers.length === 0) return [];
    const shuffled = [...covers];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (shuffled.length >= tileCount) return shuffled.slice(0, tileCount);
    return Array.from({ length: tileCount }, (_, i) => shuffled[i % shuffled.length]);
  }, [covers, tileCount]);

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Caught here rather than server-side so the user isn't told their password
    // is wrong when they simply mistyped the confirmation.
    if (mode === 'register' && password !== confirmPassword) {
      setError("Those passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'register' ? { username, password } : { username, password, stayLoggedIn },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (mode === 'register' ? 'Registration failed' : 'Login failed'));
      }
      login(data.token, data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Background Covers Grid */}
      <div className="absolute top-1/2 left-1/2 w-[150vw] h-[150vh] -translate-x-1/2 -translate-y-1/2 -rotate-6 pointer-events-none opacity-[0.18] flex flex-wrap gap-4 justify-center items-center content-center overflow-hidden">
        {tiles.map((url, i) => (
          <img 
            key={i} 
            src={url} 
            className="w-[20vw] sm:w-[14vw] md:w-[10vw] lg:w-[8vw] rounded-lg shadow-xl object-cover aspect-[2/3] shrink-0" 
            alt="cover" 
            loading="lazy"
          />
        ))}
      </div>
      
      {/* Legibility wash. A vignette centred on the card, plus a light fade at
          the very top and bottom — the old bottom-up gradient went solid black
          across the whole lower half and swallowed the artwork. */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_65%_65%_at_50%_50%,rgba(0,0,0,0.80)_0%,rgba(0,0,0,0.55)_45%,rgba(0,0,0,0.30)_100%)]" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/50 via-transparent to-black/50" />

      {/* Login Card */}
      <div className="max-w-md w-full bg-black/60 backdrop-blur-md rounded-2xl p-5 sm:p-8 border border-white/10 shadow-2xl relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="flex justify-center mb-8 pb-6 border-b border-white/10">
          <img src={BRAND_LOGO_URL} alt="FauxLore" className="h-[48px] object-contain" />
        </div>
        
        {error && (
          <div className="bg-red-500/20 text-red-200 p-3 rounded-lg text-sm mb-6 border border-red-500/30">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Username</label>
            <input
              type="text"
              required
              className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Password</label>
            <input
              type="password"
              required
              className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Confirm Password</label>
              <input
                type="password"
                required
                className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          {mode === 'login' && (
          <div className="flex items-center">
            <input
              type="checkbox"
              id="stayLoggedIn"
              className="w-4 h-4 rounded border-zinc-700 text-orange-500 focus:ring-orange-500 bg-zinc-900"
              checked={stayLoggedIn}
              onChange={(e) => setStayLoggedIn(e.target.checked)}
            />
            <label htmlFor="stayLoggedIn" className="ml-2 text-sm text-zinc-400 select-none cursor-pointer">
              Stay logged in (14 days)
            </label>
          </div>
          )}

          {mode === 'register' && (
            <p className="text-xs text-zinc-500 leading-relaxed">
              Pick any username (3-32 characters) and a password of at least 6. There's no email
              involved, so keep your password somewhere safe: it can only be reset by an admin.
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-orange-900/20"
          >
            {isSubmitting ? 'Please wait...' : mode === 'register' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-white/10 text-center">
          {mode === 'login' ? (
            <p className="text-sm text-zinc-500">
              New here?{' '}
              <button type="button" onClick={() => switchMode('register')} className="text-orange-400 hover:text-orange-300 font-medium transition-colors">
                Create an account
              </button>
            </p>
          ) : (
            <p className="text-sm text-zinc-500">
              Already have an account?{' '}
              <button type="button" onClick={() => switchMode('login')} className="text-orange-400 hover:text-orange-300 font-medium transition-colors">
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
