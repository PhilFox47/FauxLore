import React, { useState, useEffect } from 'react';
import { X, Save, Sparkles, RefreshCw, UserCircle, Settings as SettingsIcon, Shield, Database, Users } from 'lucide-react';
import { DatabaseService } from '../services/db';
import { useMediaContext } from '../contexts/MediaContext';
import { useAuth } from '../contexts/AuthContext';
import { calculateRPGState } from '../lib/rpgSystem';
import { generateText } from '../services/nanoGptService';
import { UserManagement } from './UserManagement';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { user, login } = useAuth();
  const { media, logs, settings, aiTextCache, saveAiText, refreshData, artifacts } = useMediaContext();
  const [activeTab, setActiveTab] = useState<'account'|'preferences'|'rpg'|'system'|'users'>('account');
  
  const [accountData, setAccountData] = useState({
    username: user?.username || '',
    password: '',
    profilePic: user?.profilePic || '',
    bio: user?.bio || ''
  });

  const [formData, setFormData] = useState({
    igdbClientId: '',
    igdbClientSecret: '',
    tmdbApiKey: '',
    googleBooksApiKey: '',
    nanoGptApiKey: '',
    nanoGptModel: '',
    geminiApiKey: '',
    timezone: '',
    enemyDifficulty: 1.0,
    yearlyGoals: {
      'Game': 100,
      'Book': 5000,
      'Visual Novel': 50,
      'Manga': 200,
      'Series': 100,
      'Movie': 20,
      'Comic': 100
    } as Record<string, number>,
    gamePagesPerHour: 12,
    vnPagesPerHour: 24,
    mangaPagesPerChapter: 5,
    comicPagesPerIssue: 20,
    episodesWatchedMultiplier: 30,
    moviePagesPerMovie: 100,
    runtimeMinutesPerPage: 2.5
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setFormData({
        igdbClientId: settings.igdbClientId || '',
        igdbClientSecret: settings.igdbClientSecret || '',
        tmdbApiKey: settings.tmdbApiKey || '',
        googleBooksApiKey: settings.googleBooksApiKey || '',
        nanoGptApiKey: settings.nanoGptApiKey || '',
        nanoGptModel: settings.nanoGptModel || 'gpt-4o-mini',
        geminiApiKey: settings.geminiApiKey || '',
        timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        enemyDifficulty: settings.enemyDifficulty ?? 1.0,
        yearlyGoals: {
          'Game': settings.yearlyGoals?.['Game'] ?? 100,
          'Book': settings.yearlyGoals?.['Book'] ?? 5000,
          'Visual Novel': settings.yearlyGoals?.['Visual Novel'] ?? 50,
          'Manga': settings.yearlyGoals?.['Manga'] ?? 200,
          'Series': settings.yearlyGoals?.['Series'] ?? 100,
          'Movie': settings.yearlyGoals?.['Movie'] ?? 20,
          'Comic': settings.yearlyGoals?.['Comic'] ?? 100
        },
        gamePagesPerHour: settings.masterPageConfig?.gamePagesPerHour ?? 12,
        vnPagesPerHour: settings.masterPageConfig?.vnPagesPerHour ?? 24,
        mangaPagesPerChapter: settings.masterPageConfig?.mangaPagesPerChapter ?? 5,
        comicPagesPerIssue: settings.masterPageConfig?.comicPagesPerIssue ?? 20,
        episodesWatchedMultiplier: settings.masterPageConfig?.episodesWatchedMultiplier ?? 30,
        moviePagesPerMovie: settings.masterPageConfig?.moviePagesPerMovie ?? 100,
        runtimeMinutesPerPage: settings.masterPageConfig?.runtimeMinutesPerPage ?? 2.5
      });
      setIsLoading(false);
    } else {
      async function loadSettings() {
        try {
          const settings = await DatabaseService.getSettings();
          setFormData({
            igdbClientId: settings.igdbClientId || '',
            igdbClientSecret: settings.igdbClientSecret || '',
            tmdbApiKey: settings.tmdbApiKey || '',
            googleBooksApiKey: settings.googleBooksApiKey || '',
            nanoGptApiKey: settings.nanoGptApiKey || '',
            nanoGptModel: settings.nanoGptModel || 'gpt-4o-mini',
            geminiApiKey: settings.geminiApiKey || '',
            timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '',
            enemyDifficulty: settings.enemyDifficulty ?? 1.0,
            yearlyGoals: {
              'Game': settings.yearlyGoals?.['Game'] ?? 100,
              'Book': settings.yearlyGoals?.['Book'] ?? 5000,
              'Visual Novel': settings.yearlyGoals?.['Visual Novel'] ?? 50,
              'Manga': settings.yearlyGoals?.['Manga'] ?? 200,
              'Series': settings.yearlyGoals?.['Series'] ?? 100,
              'Movie': settings.yearlyGoals?.['Movie'] ?? 20,
              'Comic': settings.yearlyGoals?.['Comic'] ?? 100
            },
            gamePagesPerHour: settings.masterPageConfig?.gamePagesPerHour ?? 12,
            vnPagesPerHour: settings.masterPageConfig?.vnPagesPerHour ?? 24,
            mangaPagesPerChapter: settings.masterPageConfig?.mangaPagesPerChapter ?? 5,
            comicPagesPerIssue: settings.masterPageConfig?.comicPagesPerIssue ?? 20,
            episodesWatchedMultiplier: settings.masterPageConfig?.episodesWatchedMultiplier ?? 30,
            moviePagesPerMovie: settings.masterPageConfig?.moviePagesPerMovie ?? 100,
            runtimeMinutesPerPage: settings.masterPageConfig?.runtimeMinutesPerPage ?? 2.5
          });
        } catch (err: any) {
          setError(err.message || 'Failed to load settings');
        } finally {
          setIsLoading(false);
        }
      }
      loadSettings();
    }
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, step } = e.target;
    // Allow float inputs for step decimals
    if (name.startsWith('yearly__')) {
       const key = name.replace('yearly__', '');
       const numValue = step ? parseFloat(value) : parseInt(value, 10);
       setFormData(prev => ({
         ...prev,
         yearlyGoals: {
           ...prev.yearlyGoals,
           [key]: isNaN(numValue) ? 0 : numValue
         }
       }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: (type === 'number' || type === 'range') ? (step ? parseFloat(value) : parseInt(value, 10)) : value
      }));
    }
  };

  const [isFixing, setIsFixing] = useState(false);
  const [fixWarning, setFixWarning] = useState('');
  
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState({ type: '', text: '' });

  const handleBackup = async () => {
    setIsBackingUp(true);
    setBackupMessage({ type: '', text: '' });
    try {
      const res = await DatabaseService.createBackup();
      setBackupMessage({ type: 'success', text: `Backup created: ${res.file.split(/[\\/]/).pop()}` });
    } catch (e: any) {
      setBackupMessage({ type: 'error', text: e.message || 'Failed to create backup' });
    } finally {
      setIsBackingUp(false);
    }
  };

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);

  const handleTestConnection = async () => {
    if (!formData.nanoGptApiKey) {
      setTestResult({ success: false, message: "API Key is required" });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const apiKey = formData.nanoGptApiKey;
      const model = formData.nanoGptModel || 'gpt-4o-mini';
      await generateText(apiKey, model, 'You are a lively connection testing bot. Write exactly 2 words saying "Test Passed", nothing else.', 'Ping');
      setTestResult({ success: true, message: "Connection successful! Model exists." });
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || "Connection failed" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleFixFallbacks = async (isForce = false) => {
    if (!formData.nanoGptApiKey) {
      setError("Please save your Nano-GPT API Key first.");
      return;
    }
    setError(null);
    setFixWarning('');
    setIsFixing(true);

    try {
      if (isForce) {
        // Option to fully clear but maybe just overwriting during loop is safer if we want to selectively force.
        // Actually, let's just let it overwrite.
      }
      // Must save settings first to ensure model/API key are fresh internally?
      // Actually we can pass formData.nanoGptApiKey and formData.nanoGptModel directly.
      const apiKey = formData.nanoGptApiKey;
      const model = formData.nanoGptModel || 'gpt-4o-mini';

      const rpgState = calculateRPGState(media, logs, settings, [], artifacts);
      const systemPrompt = "You are FauxLore, a helpful and natural media tracking assistant. Keep your tone conversational, friendly, and grounded. No epic RPG or fantasy roleplay unless explicitly asked.";

      // 1. RPG Title
      const titleKey = `rpg_title_${rpgState.level}`;
      if (!aiTextCache[titleKey] || isForce) {
        const prompt = `The user is Level ${rpgState.level} with the base title "${rpgState.className}". Generate a creative, punchy, and natural title for them. NO extra comments, just the title. 1-4 words. Avoid fantasy clichés.`;
        const result = await generateText(apiKey, model, systemPrompt, prompt);
        await saveAiText(titleKey, result);
      }

      // 2. Quests
      for (const quest of rpgState.quests) {
        const qTitleKey = `quest_title_${quest.id}`;
        if (!aiTextCache[qTitleKey] || isForce) {
          const result = await generateText(apiKey, model, systemPrompt, `Rewrite this Quest Title to sound natural, conversational and motivating. DON'T use RPG tropes like 'Saga', 'Undying', 'Eternal', 'Valor'. Keep it simple and human. Original: "${quest.title}". Give ONLY the title.`);
          await saveAiText(qTitleKey, result);
        }

        const qDescKey = `quest_desc_${quest.id}`;
        if (!aiTextCache[qDescKey] || isForce) {
          const result = await generateText(apiKey, model, systemPrompt, `Rewrite this Quest Description to sound natural and friendly, like a helpful friend encouraging you to read or play. Avoid flowery RPG language and descriptions of 'infinite glory' or 'transcendence'. Just keep it simple. Example: 'Time to read some good books! Read 100 pages this week.' Original: "${quest.description}". Give ONLY the description.`);
          await saveAiText(qDescKey, result);
        }
      }

      setFixWarning("Successfully generated all missing dynamic texts!");
    } catch (e: any) {
      setFixWarning(`Stopped due to an error: ${e.message}`);
    } finally {
      setIsFixing(false);
    }
  };

  const handleAccountChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setAccountData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      if (activeTab === 'account') {
        const token = localStorage.getItem('fauxlore_token');
        const res = await fetch(`/api/users/${user?.id}`, {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
           body: JSON.stringify({
             username: accountData.username,
             ...(accountData.password ? { password: accountData.password } : {}),
             profilePic: accountData.profilePic,
             bio: accountData.bio
           })
        });
        if (!res.ok) throw new Error('Failed to update account');
        
        // Update auth context
        const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` }});
        if (meRes.ok) {
           const me = await meRes.json();
           login(token!, me.user);
        }
        onClose();
        return;
      }

      await DatabaseService.saveSettings({
        userId: user?.id,
        igdbClientId: formData.igdbClientId,
        igdbClientSecret: formData.igdbClientSecret,
        tmdbApiKey: formData.tmdbApiKey,
        googleBooksApiKey: formData.googleBooksApiKey,
        nanoGptApiKey: formData.nanoGptApiKey,
        nanoGptModel: formData.nanoGptModel,
        geminiApiKey: formData.geminiApiKey,
        timezone: formData.timezone,
        enemyDifficulty: formData.enemyDifficulty,
        masterPageConfig: {
          gamePagesPerHour: formData.gamePagesPerHour,
          vnPagesPerHour: formData.vnPagesPerHour,
          mangaPagesPerChapter: formData.mangaPagesPerChapter,
          comicPagesPerIssue: formData.comicPagesPerIssue,
          episodesWatchedMultiplier: formData.episodesWatchedMultiplier,
          moviePagesPerMovie: formData.moviePagesPerMovie,
          runtimeMinutesPerPage: formData.runtimeMinutesPerPage
        },
        yearlyGoals: formData.yearlyGoals
      });
      await refreshData();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-[#09090B] border border-white/5 rounded-2xl md:rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row relative z-50 shadow-2xl">
        
        {/* Sidebar Tabs */}
        <div className="w-full md:w-64 bg-zinc-900/50 border-r border-white/5 flex flex-row md:flex-col p-4 gap-2 overflow-x-auto no-scrollbar shrink-0">
           <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white mb-4 hidden md:block px-2 pt-2">Settings</h2>
           
           <button 
             onClick={() => setActiveTab('account')}
             className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${activeTab === 'account' ? 'bg-orange-500/10 text-orange-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`}
           >
             <UserCircle className="w-5 h-5" /> Account Profile
           </button>
           
           <button 
             onClick={() => setActiveTab('preferences')}
             className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${activeTab === 'preferences' ? 'bg-orange-500/10 text-orange-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`}
           >
             <SettingsIcon className="w-5 h-5" /> Base Preferences
           </button>

           <button 
             onClick={() => setActiveTab('rpg')}
             className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${activeTab === 'rpg' ? 'bg-orange-500/10 text-orange-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`}
           >
             <Shield className="w-5 h-5" /> RPG Configuration
           </button>

           {user?.role === 'Admin' && (
             <button 
               onClick={() => setActiveTab('users')}
               className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${activeTab === 'users' ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`}
             >
               <Users className="w-5 h-5" /> User Management
             </button>
           )}

           {user?.role === 'Admin' && (
             <button 
               onClick={() => setActiveTab('system')}
               className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${activeTab === 'system' ? 'bg-red-500/10 text-red-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`}
             >
               <Database className="w-5 h-5" /> System & Keys (Admin)
             </button>
           )}
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#09090B]">
          <div className="p-4 md:p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#09090B] z-10 md:hidden">
            <h2 className="text-xl font-bold tracking-tight text-white capitalize">{activeTab}</h2>
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="hidden md:flex p-4 border-b border-white/5 justify-between items-center sticky top-0 bg-[#09090B] z-10">
            <h2 className="text-xl font-bold tracking-tight text-white capitalize ml-2">{activeTab} Settings</h2>
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 md:p-6 overflow-y-auto no-scrollbar flex-1 min-h-0">
            {error && (
               <div className="mb-4 bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl text-sm">
                 {error}
               </div>
            )}

            {isLoading ? (
              <div className="flex justify-center items-center py-20 text-zinc-500">
                <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <form id="settings-form" onSubmit={handleSubmit} className="space-y-8">
                
                {activeTab === 'account' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
                      <input name="username" value={accountData.username} onChange={handleAccountChange} className="input-field" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">New Password (leave blank to keep current)</label>
                      <input type="password" name="password" value={accountData.password} onChange={handleAccountChange} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">Profile Picture URL</label>
                      <input name="profilePic" value={accountData.profilePic} onChange={handleAccountChange} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">Bio</label>
                      <textarea name="bio" value={accountData.bio} onChange={handleAccountChange} className="input-field h-24 resize-none" />
                    </div>
                  </div>
                )}

                {activeTab === 'preferences' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">Timezone</label>
                      <input 
                        name="timezone"
                        value={formData.timezone}
                        onChange={handleChange}
                        className="input-field" 
                        placeholder="e.g. America/Los_Angeles"
                      />
                      <p className="text-[10px] text-zinc-500 mt-1">Used for syncing logs to accurate local dates.</p>
                    </div>
                  </div>
                )}

                {activeTab === 'rpg' && (
                  <>
                  <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">RPG Progression System</h3>
                </div>
                <p className="text-xs text-zinc-500 mb-2">Configure your Yearly goals per Media Type. These targets dynamically influence your weekly, monthly, and yearly quests.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries({
                     'Game': { label: 'Games', unit: 'Hours Played' },
                     'Book': { label: 'Books', unit: 'Pages Read' },
                     'Visual Novel': { label: 'Visual Novels', unit: 'Hours Played' },
                     'Manga': { label: 'Manga', unit: 'Chapters Read' },
                     'Series': { label: 'Series', unit: 'Episodes Watched' },
                     'Movie': { label: 'Movies', unit: 'Movies Watched' },
                     'Comic': { label: 'Comics', unit: 'Issues Read' }
                  }).map(([key, config]) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">{config.label} ({config.unit})</label>
                      <input 
                        type="number"
                        name={`yearly__${key}`}
                        value={formData.yearlyGoals[key as keyof typeof formData.yearlyGoals]}
                        onChange={handleChange}
                        className="input-field" 
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Adventure Balance</h3>
                </div>
                <div className="bg-orange-500/5 border border-orange-500/10 p-4 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-sm font-medium text-zinc-300">Enemy Difficulty (HP Multiplier)</label>
                    <span className="text-lg font-black text-orange-400">{(formData.enemyDifficulty * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range"
                    name="enemyDifficulty"
                    min="0.1"
                    max="2.0"
                    step="0.1"
                    value={formData.enemyDifficulty}
                    onChange={handleChange}
                    className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase">Pleb (10%)</span>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Normal (100%)</span>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase">Mythic (200%)</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-4 leading-relaxed italic">
                    Lower difficulty reduces the progress required (Hours, Chapters, Pages, etc.) to defeat active World Bosses. 
                    Changes are applied instantly to all of your currently active encounters.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Master Page Formatting</h3>
                </div>
                <p className="text-xs text-zinc-500 mb-2">Configure how diverse media types convert into a unified "Master Page" standard for cross-media tracking.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Book: 1 Page =</label>
                    <div className="relative text-zinc-500 font-medium px-4 py-2 border border-white/5 rounded-xl bg-white/5">
                       1 Page (Fixed)
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Game: 1 Hour = </label>
                    <div className="relative">
                      <input 
                        type="number"
                        name="gamePagesPerHour"
                        value={formData.gamePagesPerHour}
                        onChange={handleChange}
                        className="input-field pr-16" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">Pages</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Visual Novel: 1 Hour = </label>
                    <div className="relative">
                      <input 
                        type="number"
                        name="vnPagesPerHour"
                        value={formData.vnPagesPerHour}
                        onChange={handleChange}
                        className="input-field pr-16" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">Pages</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Manga: 1 Chapter = </label>
                    <div className="relative">
                      <input 
                        type="number"
                        name="mangaPagesPerChapter"
                        value={formData.mangaPagesPerChapter}
                        onChange={handleChange}
                        className="input-field pr-16" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">Pages</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Comic: 1 Issue = </label>
                    <div className="relative">
                      <input 
                        type="number"
                        name="comicPagesPerIssue"
                        value={formData.comicPagesPerIssue}
                        onChange={handleChange}
                        className="input-field pr-16" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">Pages</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Default: 1 Episode = </label>
                    <div className="relative">
                      <input 
                        type="number"
                        name="episodesWatchedMultiplier"
                        value={formData.episodesWatchedMultiplier}
                        onChange={handleChange}
                        className="input-field pr-16" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">Pages</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Default: 1 Movie = </label>
                    <div className="relative">
                      <input 
                        type="number"
                        name="moviePagesPerMovie"
                        value={formData.moviePagesPerMovie}
                        onChange={handleChange}
                        className="input-field pr-16" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">Pages</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1 flex items-center justify-between">
                       Movie/TV Runtime Preference
                       <span className="text-[10px] text-zinc-500 bg-black px-1.5 py-0.5 rounded-sm">Preferred</span>
                    </label>
                    <div className="relative">
                      <input 
                        type="number"
                        step="0.5"
                        name="runtimeMinutesPerPage"
                        value={formData.runtimeMinutesPerPage}
                        onChange={handleChange}
                        className="input-field pr-32" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium border-l border-white/10 pl-3">Mins per Page</span>
                    </div>
                  </div>

                </div>
              </div>
              </>
            )}

            {user?.role === 'Admin' && activeTab === 'users' && (
               <UserManagement />
            )}

            {user?.role === 'Admin' && activeTab === 'system' && (
                  <>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-white/5">
                      <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">API Integrations (Global)</h3>
                    </div>
                <p className="text-xs text-zinc-500 mb-2">Provide keys for metadata fetching. If left empty, FauxLore will attempt to fallback to server environment variables.</p>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">IGDB Client ID (Games/VN)</label>
                    <input 
                      name="igdbClientId"
                      value={formData.igdbClientId}
                      onChange={handleChange}
                      className="input-field" 
                      placeholder="Client ID..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">IGDB Client Secret (Games/VN)</label>
                    <input 
                      type="password"
                      name="igdbClientSecret"
                      value={formData.igdbClientSecret}
                      onChange={handleChange}
                      className="input-field" 
                      placeholder="Client Secret..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">TMDB API Key (Movies/Series / Read Access Token)</label>
                    <input 
                      type="password"
                      name="tmdbApiKey"
                      value={formData.tmdbApiKey}
                      onChange={handleChange}
                      className="input-field" 
                      placeholder="eyJhbG..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Google Books API Key (Books)</label>
                    <input 
                      type="password"
                      name="googleBooksApiKey"
                      value={formData.googleBooksApiKey}
                      onChange={handleChange}
                      className="input-field" 
                      placeholder="AIzaSy..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Nano-GPT API Key (AI Features)</label>
                    <input 
                      type="password"
                      name="nanoGptApiKey"
                      value={formData.nanoGptApiKey}
                      onChange={handleChange}
                      className="input-field" 
                      placeholder="..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Nano-GPT Model</label>
                    <input
                      type="text"
                      name="nanoGptModel"
                      value={formData.nanoGptModel}
                      onChange={handleChange}
                      className="input-field"
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Gemini API Key (Google AI Studio)</label>
                    <input
                      type="password"
                      name="geminiApiKey"
                      value={formData.geminiApiKey}
                      onChange={handleChange}
                      className="input-field"
                      placeholder="..."
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">Required for advanced Item Generation with web search capabilities.</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col items-start bg-zinc-900/50 border border-white/5 p-4 rounded-xl">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm rounded-lg transition-colors border border-white/10 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
                      {isTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                    {testResult && (
                      <p className={`text-sm font-medium ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                        {testResult.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex flex-col items-start bg-orange-500/5 border border-orange-500/20 p-4 rounded-xl">
                  <p className="text-zinc-300 text-sm mb-3">
                    If Nano-GPT failed to generate dynamic text earlier, you can force it to attempt replacing fallback texts here.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleFixFallbacks(false)}
                      disabled={isFixing}
                      className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm rounded-lg transition-colors border border-white/10 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${isFixing ? 'animate-spin' : ''}`} />
                      {isFixing ? 'Generating...' : 'Fix Missing AI Text'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFixFallbacks(true)}
                      disabled={isFixing}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 font-bold text-sm rounded-lg transition-colors border border-orange-500/30 disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      Force Rewrite All RPG Lore
                    </button>
                  </div>
                  {fixWarning && (
                    <p className={`mt-3 text-sm font-medium ${fixWarning.startsWith('Successfully') ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fixWarning}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 space-y-4">
                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Database & Backup</h3>
                  <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-5">
                    <p className="text-sm text-zinc-400 mb-4">
                      Daily backups are automatically created at 13:00 (up to 28 rolling backups). You can also force a manual backup right now.
                    </p>
                    <div className="flex items-center gap-4 flex-wrap">
                      <button
                        type="button"
                        onClick={handleBackup}
                        disabled={isBackingUp}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 font-bold text-sm rounded-lg transition-colors border border-blue-500/30 disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        {isBackingUp ? "Creating Backup..." : "Create Manual Backup"}
                      </button>
                    </div>
                    {backupMessage.text && (
                      <p className={`mt-3 text-sm font-medium ${backupMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {backupMessage.text}
                      </p>
                    )}
                  </div>
                </div>
                </>
              )}
              </form>
            )}
          </div>

        <div className="p-4 md:p-6 border-t border-white/5 bg-zinc-900/50 flex justify-end gap-3 sticky bottom-0">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
          >
            {activeTab === 'users' ? 'Close' : 'Cancel'}
          </button>
          {activeTab !== 'users' && (
            <button 
              type="submit" 
              form="settings-form"
              disabled={isLoading || isSaving}
              className={`flex items-center gap-2 px-6 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-lg ${activeTab === 'system' ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20' : 'bg-orange-600 hover:bg-orange-500 shadow-orange-900/20'}`}
            >
              {isSaving ? (
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save {activeTab === 'system' ? 'System Settings' : activeTab === 'account' ? 'Profile' : 'Settings'}
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
