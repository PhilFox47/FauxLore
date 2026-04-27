import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [stayLoggedIn, setStayLoggedIn] = useState(false);
  const [error, setError] = useState('');
  const [covers, setCovers] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/public/covers')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          // Shuffle or multiply covers to fill grid if needed loosely
          setCovers([...data, ...data].sort(() => Math.random() - 0.5));
        }
      })
      .catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, stayLoggedIn })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }
      login(data.token, data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Background Covers Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 w-[120%] h-[120%] -translate-x-[10%] -translate-y-[10%] origin-center transform -rotate-12 scale-110">
          {covers.map((url, i) => (
            <div key={i} className="aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800">
              <img src={url} className="w-full h-full object-cover" alt="" />
            </div>
          ))}
        </div>
      </div>
      
      {/* Black Fade Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

      {/* Login Card */}
      <div className="max-w-md w-full bg-black/60 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-2xl relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="flex justify-center mb-8 pb-6 border-b border-white/10">
          <img src="https://i.imgur.com/ZgTImal.png" alt="FauxLore" className="h-[48px] object-contain" />
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

          <button
            type="submit"
            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-orange-900/20"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
