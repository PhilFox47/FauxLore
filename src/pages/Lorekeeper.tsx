import React, { useMemo, useState } from 'react';
import { useMediaContext } from '../contexts/MediaContext';
import { calculateRPGState } from '../lib/rpgSystem';
import { Shield, Swords, Award, TrendingDown, CheckCircle2, CircleDashed, Flame, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateText } from '../services/nanoGptService';

export function Lorekeeper() {
  const { media, logs, settings, aiTextCache, saveAiText, refreshData } = useMediaContext();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false);
  
  const rpgState = useMemo(() => calculateRPGState(media, logs, settings), [media, logs, settings]);

  const weeklyQuests = rpgState.quests.filter(q => q.type === 'weekly');
  const monthlyQuests = rpgState.quests.filter(q => q.type === 'monthly');
  const yearlyQuests = rpgState.quests.filter(q => q.type === 'yearly');

  const getDynamicTitle = () => {
     return aiTextCache[`rpg_title_${rpgState.level}`] || rpgState.className;
  };

  const getLevelContext = (level: number) => {
    if (level >= 100) return "almost unrealistic, ultimate, mythical";
    if (level >= 50) return "epic, legendary, master-level (soft level cap)";
    if (level > 10) return "experienced, intermediate-level";
    return "basic, beginner-level";
  };

  const getRecentMediaContext = () => {
    const recent = [...media]
      .filter(m => m.status === 'Active' || m.status === 'Completed')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 50);
      
    if (recent.length === 0) return 'None yet';

    const top10 = recent.slice(0, 10).map(m => `"${m.title}" (${m.mediaType}, Genres: ${m.genres.join(', ')})`).join(' | ');
    const rest = recent.slice(10).map(m => `"${m.title}" (${m.mediaType})`).join(' | ');
    
    return `Most Recent (High Impact): ${top10}` + (rest ? `\nOlder Recent (Low Impact): ${rest}` : '');
  };

  const handleRegenerateTitle = async () => {
    if (!settings?.nanoGptApiKey) {
      alert("Please configure your Nano-GPT API Key in Settings first.");
      return;
    }

    setIsRegeneratingTitle(true);
    try {
      const apiKey = settings.nanoGptApiKey;
      const model = settings.nanoGptModel || 'gpt-4o-mini';
      const systemPrompt = "You are FauxLore, a creative AI assistant. Your task is to generate a fun, punchy title based on the user's level and their recently consumed media.";

      const recentMediaStr = getRecentMediaContext();
      const levelContext = getLevelContext(rpgState.level);

      const titlePrompt = `The user is Level ${rpgState.level} (${levelContext}). 
Their recently active/completed media are provided below. Give the "Most Recent" items significantly more weight in determining their title.
${recentMediaStr}
Generate a creative, punchy, and surprising title for them combining their level prestige and media tastes.
Example: "Novice Gamer of the Fantastic Things" or "Romantic Reader of the Fine Arts".
NO extra comments, NO quotes, just the title. 2-6 words.`;

      const titleKey = `rpg_title_${rpgState.level}`;
      const titleRes = await generateText(apiKey, model, systemPrompt, titlePrompt);
      await saveAiText(titleKey, titleRes);
      
      await refreshData();
    } catch (e: any) {
      alert("Error regenerating title: " + e.message);
    } finally {
      setIsRegeneratingTitle(false);
    }
  };

  const handleRegenerate = async () => {
    if (!settings?.nanoGptApiKey) {
      alert("Please configure your Nano-GPT API Key in Settings first.");
      return;
    }
    
    setIsRegenerating(true);
    try {
      const apiKey = settings.nanoGptApiKey;
      const model = settings.nanoGptModel || 'gpt-4o-mini';
      const systemPrompt = "You are FauxLore, a helpful and natural media tracking assistant. Keep your tone conversational, friendly, and grounded. No epic RPG or fantasy roleplay unless explicitly asked.";

      // 1. RPG Title
      const recentMediaStr = getRecentMediaContext();
      const levelContext = getLevelContext(rpgState.level);
      const titlePrompt = `The user is Level ${rpgState.level} (${levelContext}). 
Their recently active/completed media are provided below. Give the "Most Recent" items significantly more weight in determining their title.
${recentMediaStr}
Generate a creative, punchy, and surprising title for them combining their level prestige and media tastes.
Example: "Novice Gamer of the Fantastic Things" or "Romantic Reader of the Fine Arts".
NO extra comments, NO quotes, just the title. 2-6 words.`;

      const titleKey = `rpg_title_${rpgState.level}`;
      const titleRes = await generateText(apiKey, model, systemPrompt, titlePrompt);
      await saveAiText(titleKey, titleRes);

      // 2. Quests
      for (const quest of rpgState.quests) {
        // Title
        const qTitleKey = `quest_title_${quest.id}`;
        const qTitleRes = await generateText(apiKey, model, systemPrompt, `Rewrite this Quest Title to sound natural, conversational and motivating. DON'T use RPG tropes like 'Saga', 'Undying', 'Eternal', 'Valor'. Keep it simple and human. Original: "${quest.title}". Give ONLY the title.`);
        await saveAiText(qTitleKey, qTitleRes);

        // Description
        const qDescKey = `quest_desc_${quest.id}`;
        const qDescRes = await generateText(apiKey, model, systemPrompt, `Rewrite this Quest Description to sound natural and friendly, like a helpful friend encouraging you to read or play. Avoid flowery RPG language and descriptions of 'infinite glory' or 'transcendence'. Just keep it simple. Example: 'Time to read some good books! Read 100 pages this week.' Original: "${quest.description}". Give ONLY the description.`);
        await saveAiText(qDescKey, qDescRes);
      }
      
      await refreshData();
      alert("All Lore and Quests have been regenerated with a natural tone!");
    } catch (e: any) {
      alert("Error regenerating content: " + e.message);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-12">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3 tracking-tight">
            <Shield className="w-8 h-8 text-orange-500" />
            The Lorekeeper
          </h2>
          <p className="text-zinc-400 mt-2">Your RPG progress, active quests, and lifetime experience breakdown.</p>
        </div>
        
        <div className="flex flex-wrap gap-4 justify-end">
          <button
            onClick={handleRegenerateTitle}
            disabled={isRegeneratingTitle}
            className="flex items-center gap-2 px-6 py-3 bg-zinc-900 border border-white/10 hover:border-orange-500/50 hover:bg-zinc-800 text-white rounded-2xl transition-all shadow-xl disabled:opacity-50"
          >
            {isRegeneratingTitle ? (
              <RefreshCw className="w-5 h-5 animate-spin text-orange-500" />
            ) : (
              <Sparkles className="w-5 h-5 text-orange-500" />
            )}
            <span className="font-bold text-sm">Regenerate Title</span>
          </button>
          
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-2 px-6 py-3 bg-zinc-900 border border-white/10 hover:border-orange-500/50 hover:bg-zinc-800 text-white rounded-2xl transition-all shadow-xl disabled:opacity-50"
          >
            {isRegenerating ? (
              <RefreshCw className="w-5 h-5 animate-spin text-orange-500" />
            ) : (
              <Sparkles className="w-5 h-5 text-orange-500" />
            )}
            <span className="font-bold text-sm">Regenerate Flavor Text</span>
          </button>
        </div>
      </header>

      {/* Hero Overview */}
      <section className="shrink-0 bg-zinc-900 border border-white/5 rounded-3xl p-8 relative overflow-hidden flex flex-col md:flex-row items-center gap-8">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="shrink-0 relative">
          <div className="w-32 h-32 bg-zinc-950 rounded-3xl flex items-center justify-center border-4 border-orange-500/50 shadow-[0_0_30px_rgba(249,115,22,0.3)] z-10 relative">
            <Swords className="w-16 h-16 text-orange-400" />
            <div className="absolute -bottom-4 -right-4 bg-orange-600 text-white text-base font-black px-4 py-1 rounded-full border-4 border-zinc-900 shadow-xl shadow-orange-900/50">
              Lvl {rpgState.level}
            </div>
          </div>
        </div>

        <div className="flex-1 w-full z-10 text-center md:text-left">
          <h3 className="text-4xl font-black text-white italic tracking-tight mb-2">{getDynamicTitle()}</h3>
          <p className="text-zinc-400 text-lg font-medium mb-6">{rpgState.currentExp.toLocaleString()} Total EXP</p>

          <div className="flex justify-between items-end mb-2">
            <span className="text-sm text-orange-400 font-bold tracking-wider uppercase">Progress to Level {rpgState.level + 1}</span>
            <div className="text-sm text-zinc-500 font-mono">
              {(rpgState.currentExp - rpgState.currentLevelExp).toLocaleString()} / {(rpgState.nextLevelExp - rpgState.currentLevelExp).toLocaleString()} EXP
            </div>
          </div>
          <div className="h-4 bg-zinc-950 rounded-full overflow-hidden shadow-inner border border-white/5 relative">
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-600 to-orange-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(249,115,22,0.5)]" 
              style={{ width: `${Math.max(2, rpgState.expProgress * 100)}%` }} 
            />
          </div>
        </div>
      </section>

      {/* Breakdown Grid */}
      <section>
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Award className="w-5 h-5 text-zinc-400" />
          Experience Breakdown
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-zinc-900/40 border border-white/5 p-5 rounded-2xl">
            <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-2">Base EXP</div>
            <div className="text-2xl font-black text-white">+{Math.floor(rpgState.expBreakdown.baseExp).toLocaleString()}</div>
            <div className="text-xs text-zinc-500 mt-1">From Master Pages</div>
          </div>
          <div className="bg-zinc-900/40 border border-emerald-500/10 p-5 rounded-2xl">
            <div className="text-emerald-500 text-xs font-bold uppercase tracking-wider mb-2">Quest EXP</div>
            <div className="text-2xl font-black text-emerald-400">+{Math.floor(rpgState.expBreakdown.questExp).toLocaleString()}</div>
            <div className="text-xs text-zinc-500 mt-1">From completed quests</div>
          </div>
          <div className="bg-zinc-900/40 border border-red-500/10 p-5 rounded-2xl">
            <div className="text-red-500 text-xs font-bold uppercase tracking-wider mb-2">Decay Penalty</div>
            <div className="text-2xl font-black text-red-400">{Math.floor(rpgState.expBreakdown.decayExp).toLocaleString()}</div>
            <div className="text-xs text-zinc-500 mt-1">Due to inactivity gaps</div>
          </div>
          <div className="bg-zinc-900/40 border border-orange-500/10 p-5 rounded-2xl">
            <div className="text-orange-500 text-xs font-bold uppercase tracking-wider mb-2">Drop Penalty</div>
            <div className="text-2xl font-black text-orange-400">{Math.floor(rpgState.expBreakdown.penaltyExp).toLocaleString()}</div>
            <div className="text-xs text-zinc-500 mt-1">From dropped media</div>
          </div>
        </div>
      </section>

      {/* Quests */}
      <section className="space-y-8">
        <h3 className="text-2xl font-bold text-white flex items-center gap-2">
          <Flame className="w-6 h-6 text-amber-500" />
          Active Quests
        </h3>

        {/* Weekly */}
        <div>
          <h4 className="text-zinc-400 font-bold uppercase tracking-widest text-xs mb-4">Weekly Quests</h4>
          <div className="grid md:grid-cols-2 gap-4">
            {weeklyQuests.map((q, i) => <QuestCard key={i} quest={q} />)}
          </div>
        </div>

        {/* Monthly */}
        <div>
          <h4 className="text-zinc-400 font-bold uppercase tracking-widest text-xs mb-4">Monthly Quests</h4>
          <div className="grid md:grid-cols-2 gap-4">
            {monthlyQuests.map((q, i) => <QuestCard key={i} quest={q} />)}
          </div>
        </div>

        {/* Yearly */}
        <div>
          <h4 className="text-zinc-400 font-bold uppercase tracking-widest text-xs mb-4">Yearly Quests</h4>
          <div className="grid md:grid-cols-2 gap-4">
            {yearlyQuests.map((q, i) => <QuestCard key={i} quest={q} />)}
          </div>
        </div>

      </section>
    </div>
  );
}

function QuestCard({ quest }: { quest: any }) {
  const { aiTextCache } = useMediaContext();
  const percentage = Math.min(100, Math.max(0, (quest.currentAmount / quest.targetAmount) * 100));
  
  const dynTitle = aiTextCache[`quest_title_${quest.id}`] || quest.title;
  const dynDesc = aiTextCache[`quest_desc_${quest.id}`] || quest.description;

  return (
    <div className={cn(
      "p-6 rounded-2xl border relative overflow-hidden transition-all",
      quest.isCompleted 
        ? "bg-emerald-900/20 border-emerald-500/30" 
        : "bg-zinc-900/50 border-white/5 shadow-xl"
    )}>
      {quest.isCompleted && (
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-[40px]" />
      )}
      
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="flex items-center gap-3">
          {quest.isCompleted ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
          ) : (
            <CircleDashed className="w-8 h-8 text-zinc-600 shrink-0" />
          )}
          <div>
            <h5 className="font-bold text-white text-lg leading-tight mb-1">{dynTitle}</h5>
            <p className="text-sm text-zinc-400">{dynDesc}</p>
          </div>
        </div>
        <div className={cn(
          "px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase flex-shrink-0",
          quest.isCompleted ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
        )}>
          +{quest.expReward} EXP
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between text-xs font-mono font-bold mb-2">
          <span className={quest.isCompleted ? "text-emerald-400" : "text-zinc-500"}>
            {Math.floor(quest.currentAmount).toLocaleString()}
          </span>
          <span className="text-zinc-600">{quest.targetAmount.toLocaleString()}</span>
        </div>
        <div className="h-2 bg-zinc-950 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-1000",
              quest.isCompleted ? "bg-emerald-500" : "bg-orange-500"
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
