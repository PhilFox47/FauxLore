import React, { useMemo, useState, useEffect, useRef } from "react";
import { format, differenceInDays, parseISO, subDays } from 'date-fns';
import { useMediaContext } from "../contexts/MediaContext";
import { calculateRPGState } from "../lib/rpgSystem";
import {
  Shield,
  Swords,
  Award,
  TrendingDown,
  CheckCircle2,
  CircleDashed,
  Flame,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  Target,
  Calendar,
  ImageIcon
} from "lucide-react";
import { cn } from "../lib/utils";
import { calculateScaledPages } from "../lib/scaling";
import {
  generateText,
  getPersonaDescription,
} from "../services/nanoGptService";
import { generateGeminiText } from "../services/geminiService";
import { DatabaseService } from "../services/db";
import { Loader2, Dices } from "lucide-react";

const FAUXLORE_CONTEXT = `\n\nCONTEXT ABOUT FAUXLORE:
FauxLore is an RPG-themed media-tracking app where the user logs their time/pages/etc on Games, Books, Visual Novels, Manga, Series, Movies, Comics, and Audiobooks to earn "Master Pages" (XP) and level up.
"Quests" in FauxLore are weekly, monthly, or daily consumption goals (e.g. "Read 200 pages" or "Play 10 hours").
When generating text, DO NOT treat the user as a literal warrior fighting real monsters. Instead, playfully frame their normal media consumption habits using the chosen persona's style, acknowledging that they are interacting with media (reading, playing, watching).`;

export function Lorekeeper() {
  const {
    media,
    logs,
    settings,
    aiTextCache,
    saveAiText,
    clearAiTextCache,
    refreshData,
    worldBosses,
    artifacts,
    rerollBoss,
    generateBossImage,
    spawnBoss,
  } = useMediaContext();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false);
  const [isSpawningBoss, setIsSpawningBoss] = useState(false);
  const [dateRange, setDateRange] = useState<'7days' | '30days' | '90days' | '1year' | 'all' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const nowTime = new Date().getTime();
  const currentWeekBosses = worldBosses.filter(b => new Date(b.expiresAt).getTime() > nowTime);
  
  const sevenDaysAgo = nowTime - 7 * 24 * 60 * 60 * 1000;
  const lastWeekBosses = worldBosses.filter(b => {
    const t = new Date(b.expiresAt).getTime();
    return t <= nowTime && t > sevenDaysAgo;
  });

  const rpgState = useMemo(
    () => calculateRPGState(media, logs, settings, worldBosses, artifacts),
    [media, logs, settings, worldBosses, artifacts],
  );

  const breakdownState = useMemo(() => {
    if (dateRange === 'all') return rpgState;
    const cutoffMap: Record<string, number | null> = { '7days': 7, '30days': 30, '90days': 90, '1year': 365, 'custom': null };
    const cutoffDays = cutoffMap[dateRange];
    const cutoffDate = cutoffDays ? subDays(new Date(), cutoffDays) : null;

    const filteredLogs = logs.filter(log => {
      if (log.isHistoric || log.timestamp.startsWith('1970-01-01')) return false;
      const logDate = new Date(log.timestamp);
      if (dateRange === 'custom') {
        if (customStartDate && logDate < new Date(customStartDate)) return false;
        if (customEndDate && logDate > new Date(customEndDate + 'T23:59:59')) return false;
        return true;
      }
      return cutoffDate ? logDate >= cutoffDate : true;
    });

    const filteredBosses = worldBosses.filter(b => {
      // For completed/failed bosses, check if updatedAt is within range
      if (b.status !== 'Active') {
         if (!b.updatedAt) return false;
         const bDate = new Date(b.updatedAt);
         if (dateRange === 'custom') {
           if (customStartDate && bDate < new Date(customStartDate)) return false;
           if (customEndDate && bDate > new Date(customEndDate + 'T23:59:59')) return false;
           return true;
         }
         return cutoffDate ? bDate >= cutoffDate : true;
      }
      return false; // Active bosses don't grant exp until defeated/failed
    });

    return calculateRPGState(media, filteredLogs, settings, filteredBosses, artifacts);
  }, [logs, media, settings, worldBosses, artifacts, rpgState, dateRange, customStartDate, customEndDate]);

  const weeklyQuests = rpgState.quests.filter((q) => q.type === "weekly");
  const monthlyQuests = rpgState.quests.filter((q) => q.type === "monthly");
  const yearlyQuests = rpgState.quests.filter((q) => q.type === "yearly");

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
      .filter((m) => m.status === "Active" || m.status === "Completed")
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 50);

    if (recent.length === 0) return { text: "None yet", dominantMedia: null };

    const top10 = recent.slice(0, 10);
    let totalTop10Mp = 0;
    const top10WithMp = top10.map((m) => {
      const mp = Math.floor(calculateScaledPages(m, settings));
      totalTop10Mp += mp;
      return { ...m, mp };
    });

    let dominantMedia = null;
    if (totalTop10Mp > 0) {
      dominantMedia =
        top10WithMp.find((m) => m.mp > totalTop10Mp * 0.5) || null;
    }

    const top10Str = top10WithMp
      .map(
        (m) =>
          `"${m.title}" (${m.mediaType}, Genres: ${m.genres.join(", ")}, Master Pages: ${m.mp})`,
      )
      .join(" | ");
    const restStr = recent
      .slice(10)
      .map((m) => `"${m.title}" (${m.mediaType})`)
      .join(" | ");

    const text =
      `Most Recent (High Impact): ${top10Str}` +
      (restStr ? `\nOlder Recent (Low Impact): ${restStr}` : "");

    return { text, dominantMedia };
  };

  const handleRegenerateTitle = async () => {
    if (!settings?.nanoGptApiKey && !settings?.geminiApiKey) {
      alert("Please configure an AI API Key in Settings first.");
      return;
    }

    setIsRegeneratingTitle(true);
    try {
      const personaDesc = getPersonaDescription(settings?.aiPersona);
      const systemPrompt = `You are FauxLore, a creative AI assistant. ${personaDesc} Your task is to generate a fun, punchy title based on the user's level and their recently consumed media.${FAUXLORE_CONTEXT}`;

      const { text: recentMediaStr, dominantMedia } = getRecentMediaContext();
      const levelContext = getLevelContext(rpgState.level);

      let franchiseRule = `CRITICAL RULE: DO NOT reference any specific franchise, character, or media title by name. Use general genre or medium terms instead.`;
      if (dominantMedia) {
        franchiseRule = `CRITICAL RULE: You MAY reference the specific franchise or title "${dominantMedia.title}" by name, because it accounts for more than 50% of their recent Master Pages. Do NOT reference any other specific franchise by name.`;
      }

      const titlePrompt = `The user is Level ${rpgState.level} (${levelContext}). 
Their recently active/completed media are provided below. Give the "Most Recent" items significantly more weight in determining their title. The user's time investment is represented by "Master Pages".
${franchiseRule}

Media Context:
${recentMediaStr}

Generate a creative, punchy, and surprising title for them combining their level prestige and media tastes.
Example: "Novice Gamer of the Fantastic Things" or "Romantic Reader of the Fine Arts".
NO extra comments, NO quotes, just the title. 2-6 words.`;

      const titleKey = `rpg_title_${rpgState.level}`;
      let titleRes = "";
      if (settings.nanoGptApiKey) {
        const apiKey = settings.nanoGptApiKey;
        const model = settings.nanoGptModel || "gpt-4o-mini";
        titleRes = await generateText(apiKey, model, systemPrompt, titlePrompt);
      } else if (settings.geminiApiKey) {
        const apiKey = settings.geminiApiKey;
        titleRes = await generateGeminiText(apiKey, systemPrompt, titlePrompt);
      }

      await saveAiText(titleKey, titleRes);

      await refreshData();
    } catch (e: any) {
      alert("Error regenerating title: " + e.message);
    } finally {
      setIsRegeneratingTitle(false);
    }
  };

  const handleRegenerate = async () => {
    if (!settings?.nanoGptApiKey && !settings?.geminiApiKey) {
      alert("Please configure an AI API Key in Settings first.");
      return;
    }

    setIsRegenerating(true);
    try {
      const personaDesc = getPersonaDescription(settings?.aiPersona);
      const systemPrompt = `You are FauxLore's central AI logic core. ${personaDesc}${FAUXLORE_CONTEXT}`;

      // 1. RPG Title
      const { text: recentMediaStr, dominantMedia } = getRecentMediaContext();
      const levelContext = getLevelContext(rpgState.level);

      let franchiseRule = `CRITICAL RULE: DO NOT reference any specific franchise, character, or media title by name. Use general genre or medium terms instead.`;
      if (dominantMedia) {
        franchiseRule = `CRITICAL RULE: You MAY reference the specific franchise or title "${dominantMedia.title}" by name, because it accounts for more than 50% of their recent Master Pages. Do NOT reference any other specific franchise by name.`;
      }

      const titlePrompt = `The user is Level ${rpgState.level} (${levelContext}). 
Their recently active/completed media are provided below. Give the "Most Recent" items significantly more weight in determining their title. The user's time investment is represented by "Master Pages".
${franchiseRule}

Media Context:
${recentMediaStr}

Generate a creative, punchy, and surprising title for them combining their level prestige and media tastes.
Example: "Novice Gamer of the Fantastic Things" or "Romantic Reader of the Fine Arts".
NO extra comments, NO quotes, just the title. 2-6 words.`;

      const titleKey = `rpg_title_${rpgState.level}`;
      let titleRes = "";
      if (settings.nanoGptApiKey) {
        const apiKey = settings.nanoGptApiKey;
        const model = settings.nanoGptModel || "gpt-4o-mini";
        titleRes = await generateText(apiKey, model, systemPrompt, titlePrompt);
      } else if (settings.geminiApiKey) {
        titleRes = await generateGeminiText(
          settings.geminiApiKey,
          systemPrompt,
          titlePrompt,
        );
      }

      await saveAiText(titleKey, titleRes);

      // 2. Quests
      for (const quest of rpgState.quests) {
        // Title
        const qTitleKey = `quest_title_${quest.id}`;
        const tPrompt = `Rewrite this Quest Title to sound natural, conversational and motivating. DON'T use RPG tropes like 'Saga', 'Undying', 'Eternal', 'Valor'. Keep it simple and human. Original: "${quest.title}". Give ONLY the title.`;
        let qTitleRes = "";

        // Description
        const qDescKey = `quest_desc_${quest.id}`;
        const dPrompt = `Rewrite this Quest Description to sound natural and friendly, like a helpful friend encouraging you to read or play. Avoid flowery RPG language and descriptions of 'infinite glory' or 'transcendence'. Just keep it simple. Limit the response to 1-2 short sentences. CRITICAL: You MUST explicitly include clear instructions on what needs to be done based on the original description! Example: 'Time to read some good books! Read at least 100 pages this week.' Original: "${quest.description}". Give ONLY the description.`;
        let qDescRes = "";

        if (settings.nanoGptApiKey) {
          const apiKey = settings.nanoGptApiKey;
          const model = settings.nanoGptModel || "gpt-4o-mini";
          qTitleRes = await generateText(apiKey, model, systemPrompt, tPrompt);
          qDescRes = await generateText(apiKey, model, systemPrompt, dPrompt);
        } else if (settings.geminiApiKey) {
          qTitleRes = await generateGeminiText(
            settings.geminiApiKey,
            systemPrompt,
            tPrompt,
          );
          qDescRes = await generateGeminiText(
            settings.geminiApiKey,
            systemPrompt,
            dPrompt,
          );
        }

        await saveAiText(qTitleKey, qTitleRes);
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

  const [rerollingQuestId, setRerollingQuestId] = useState<string | null>(null);

  const handleRerollQuest = async (
    e: React.MouseEvent,
    questId: string,
    type: "monthly" | "weekly" | "yearly",
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (type === "yearly") {
      console.warn("Yearly quests cannot be re-rolled.");
      return;
    }
    const currentSettings = settings || { userId: "default_user" };
    const timeId =
      type === "monthly"
        ? questId.split("-").slice(0, 2).join("-")
        : questId.split("-").slice(0, 2).join("-"); // handles '2026-05' or '2026-18'

    const maxRerolls = type === "monthly" ? 4 : 2;
    const currentRerolls = currentSettings.questRerollsUsed?.[timeId] || 0;

    if (currentRerolls >= maxRerolls) {
      console.warn(
        `You have exhausted all ${maxRerolls} re-rolls for this ${type === "monthly" ? "month" : "week"}!`,
      );
      return;
    }

    const newOffsets = { ...(currentSettings.questOffsets || {}) };
    newOffsets[questId] = (newOffsets[questId] || 0) + 1;

    const newRerollsUsed = { ...(currentSettings.questRerollsUsed || {}) };
    newRerollsUsed[timeId] = currentRerolls + 1;

    try {
      setRerollingQuestId(questId);
      await clearAiTextCache(`quest_title_${questId}`);
      await clearAiTextCache(`quest_desc_${questId}`);
      await DatabaseService.saveSettings({
        ...currentSettings,
        questOffsets: newOffsets,
        questRerollsUsed: newRerollsUsed,
      });
      await refreshData();
    } catch (e: any) {
      console.error("Error re-rolling quest", e);
    } finally {
      setRerollingQuestId(null);
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
          <p className="text-zinc-400 mt-2">
            Your RPG progress, active quests, and lifetime experience breakdown.
          </p>
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
          <h3 className="text-4xl font-black text-white italic tracking-tight mb-2">
            {getDynamicTitle()}
          </h3>
          <p className="text-zinc-400 text-lg font-medium mb-6">
            {Math.floor(rpgState.currentExp).toLocaleString()} Total EXP
          </p>

          <div className="flex justify-between items-end mb-2">
            <span className="text-sm text-orange-400 font-bold tracking-wider uppercase">
              Progress to Level {rpgState.level + 1}
            </span>
            <div className="text-sm text-zinc-500 font-mono">
              {Math.floor(
                rpgState.currentExp - rpgState.currentLevelExp,
              ).toLocaleString()}{" "}
              /{" "}
              {Math.floor(
                rpgState.nextLevelExp - rpgState.currentLevelExp,
              ).toLocaleString()}{" "}
              EXP
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

      {/* World Bosses Section */}
      <section className="bg-zinc-900/50 border border-white/5 rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h2 className="text-3xl font-black text-white italic tracking-tight mb-2 flex items-center gap-3">
              <Swords className="w-8 h-8 text-red-500" />
              Legendary Encounters
            </h2>
            <p className="text-zinc-500 text-sm font-medium">
              Weekly challenges linked to your currently active media.
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={async () => {
                setIsSpawningBoss(true);
                try {
                  await spawnBoss();
                } catch (e: any) {
                  alert(e.message || "Failed to spawn boss");
                } finally {
                  setIsSpawningBoss(false);
                }
              }}
              disabled={isSpawningBoss}
              className="bg-black/40 hover:bg-zinc-800 border border-white/5 px-6 py-3 rounded-2xl flex items-center justify-center gap-2 hover:border-red-500/30 transition-all font-bold text-white group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSpawningBoss ? (
                <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
              ) : (
                <Swords className="w-5 h-5 text-red-500 group-hover:scale-110 transition-transform" />
              )}
              Encore
            </button>
            <div className="bg-zinc-950 px-6 py-3 rounded-2xl border border-white/5 text-center">
              <div className="text-[10px] text-zinc-600 font-black uppercase tracking-widest mb-1">
                Total Defeated
              </div>
              <div className="text-xl font-black text-white">
                {worldBosses.filter((b) => b.status === "Defeated").length}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-12">
          <div>
            <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-widest text-zinc-400">Current Week</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentWeekBosses.length === 0 ? (
                <div className="col-span-full py-6 text-zinc-600 font-bold uppercase tracking-widest text-sm text-center border border-dashed border-white/10 rounded-2xl">
                  No active boss encounters
                </div>
              ) : (
                currentWeekBosses.map((boss) => {
                  const mediaItem = media.find((m) => m.id === boss.mediaId);
                  const progress =
                    (boss.currentProgress / boss.targetProgress) * 100;
                  return (
                    <div
                      key={boss.id}
                      className={cn(
                        "p-6 rounded-3xl border transition-all relative overflow-hidden group",
                        boss.status === "Defeated"
                          ? "bg-emerald-500/5 border-emerald-500/20"
                          : boss.status === "Failed"
                            ? "bg-red-500/5 border-red-500/20 opacity-60"
                            : "bg-zinc-950/50 border-white/10",
                      )}
                    >
                      <div className="flex items-center justify-between mb-4 relative z-10">
                        <span
                          className={cn(
                            "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                            boss.status === "Defeated"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : boss.status === "Failed"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-zinc-500/20 text-zinc-400",
                          )}
                        >
                          {boss.status}
                        </span>
                        <span className="text-[10px] font-black text-zinc-600 uppercase bg-zinc-950/80 px-2 py-0.5 rounded">
                          Lv. {boss.level}
                        </span>
                      </div>

                      {boss.imageUrl && (
                        <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 shadow-lg cursor-pointer mb-4 relative group/image" onClick={(e) => { e.stopPropagation(); setExpandedImage(boss.imageUrl || null); }}>
                          <img src={boss.imageUrl} alt={boss.name} className="w-full h-full object-cover transition-transform duration-700 group-hover/image:scale-105" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent pointer-events-none"></div>
                        </div>
                      )}
                      
                      <div className="flex-1 flex flex-col mb-4 relative z-10">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="text-lg sm:text-xl font-black text-white drop-shadow-md break-words leading-tight">
                              {boss.name}
                            </h4>
                            <div className="flex gap-1 shrink-0">
                              {boss.status === "Active" && (
                                <>
                                  <button
                                    onClick={async (e) => {
                                      const btn = e.currentTarget;
                                      btn.disabled = true;
                                      const icon = btn.querySelector("svg");
                                      if (icon) icon.classList.add("animate-pulse", "text-emerald-500");
                                      try {
                                        await generateBossImage(boss.id);
                                      } catch (error) {
                                        console.error("Image generation failed:", error);
                                      } finally {
                                        btn.disabled = false;
                                        if (icon) icon.classList.remove("animate-pulse", "text-emerald-500");
                                      }
                                    }}
                                    className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                                    title="Regenerate Boss Image"
                                  >
                                    <ImageIcon className="w-4 h-4 text-zinc-500" />
                                  </button>
                                  <button
                                    onClick={async (e) => {
                                      const btn = e.currentTarget;
                                      btn.disabled = true;
                                      const icon = btn.querySelector("svg");
                                      if (icon) icon.classList.add("animate-spin", "text-amber-500");
                                      await rerollBoss(boss.id);
                                      btn.disabled = false;
                                      if (icon) icon.classList.remove("animate-spin", "text-amber-500");
                                    }}
                                    className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                                    title="Reroll Boss Name"
                                  >
                                    <RefreshCw className="w-4 h-4 text-zinc-500" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-zinc-400/80 truncate italic">
                            Target: {mediaItem?.title || "Unknown"}
                          </p>
                      </div>

                      <div className="space-y-2">
                        <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-700",
                              boss.status === "Defeated"
                                ? "bg-emerald-500"
                                : "bg-red-500",
                            )}
                            style={{ width: `${Math.max(4, progress)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[8px] font-black text-zinc-600 uppercase tracking-widest">
                          <span>
                            {Math.floor(boss.currentProgress)} /{" "}
                            {boss.targetProgress} {boss.unit}
                          </span>
                          <span>{Math.floor(progress)}%</span>
                        </div>
                      </div>

                      {boss.status === "Active" && (
                        <div className="mt-4 flex items-center gap-2 text-[9px] font-black text-amber-500 uppercase tracking-widest">
                          <ShieldAlert className="w-3 h-3" />
                          Expires {new Date(boss.expiresAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {lastWeekBosses.length > 0 && (
            <div>
              <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-widest text-zinc-500">Last Week</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {lastWeekBosses.map((boss) => {
                  const mediaItem = media.find((m) => m.id === boss.mediaId);
                  const progress =
                    (boss.currentProgress / boss.targetProgress) * 100;
                  return (
                    <div
                      key={boss.id}
                      className={cn(
                        "p-6 rounded-3xl border transition-all relative overflow-hidden group hover:border-white/20",
                        boss.status === "Defeated"
                          ? "bg-emerald-500/5 border-emerald-500/20"
                          : "bg-red-500/5 border-red-500/20 opacity-60",
                      )}
                    >
                      <div className="flex items-center justify-between mb-4 relative z-10">
                        <span
                          className={cn(
                            "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                            boss.status === "Defeated"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          )}
                        >
                          {boss.status}
                        </span>
                        <span className="text-[10px] font-black text-zinc-600 uppercase bg-zinc-950/80 px-2 py-0.5 rounded">
                          Lv. {boss.level}
                        </span>
                      </div>

                      {boss.imageUrl && (
                        <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 shadow-lg cursor-pointer mb-4 relative group/image" onClick={(e) => { e.stopPropagation(); setExpandedImage(boss.imageUrl || null); }}>
                          <img src={boss.imageUrl} alt={boss.name} className="w-full h-full object-cover transition-transform duration-700 group-hover/image:scale-105" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent pointer-events-none"></div>
                        </div>
                      )}
                      
                      <div className="flex-1 flex flex-col mb-4 relative z-10">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="text-lg sm:text-xl font-black text-white drop-shadow-md break-words leading-tight">
                              {boss.name}
                            </h4>
                          </div>
                          <p className="text-xs text-zinc-400/80 truncate italic">
                            Target: {mediaItem?.title || "Unknown"}
                          </p>
                      </div>

                      <div className="space-y-2">
                        <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-700",
                              boss.status === "Defeated"
                                ? "bg-emerald-500"
                                : "bg-red-500",
                            )}
                            style={{ width: `${Math.max(4, progress)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[8px] font-black text-zinc-600 uppercase tracking-widest">
                          <span>
                            {Math.floor(boss.currentProgress)} /{" "}
                            {boss.targetProgress} {boss.unit}
                          </span>
                          <span>{Math.floor(progress)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Breakdown Grid */}
      <section>
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-zinc-400" />
            Experience Breakdown
          </h3>
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
            {dateRange === 'custom' && (
              <div className="flex items-center gap-2 bg-[#18181b] border border-white/10 rounded-xl px-2 h-10 w-full sm:w-auto">
                <input 
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent text-sm text-white focus:outline-none max-w-[120px]"
                />
                <span className="text-zinc-500 text-sm">to</span>
                <input 
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent text-sm text-white focus:outline-none max-w-[120px]"
                />
              </div>
            )}
            <div className="flex items-center gap-2 bg-[#18181b] border border-white/10 rounded-xl px-2 h-10 w-full sm:w-auto">
              <Calendar className="w-4 h-4 text-zinc-400" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as any)}
                className="bg-transparent text-sm text-white font-medium focus:outline-none pr-4 w-full [&>option]:bg-[#18181b]"
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="90days">Last 90 Days</option>
                <option value="1year">Last Year</option>
                <option value="all">All Time</option>
                <option value="custom">Custom Timeframe</option>
              </select>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="bg-zinc-900/40 border border-white/5 p-5 rounded-2xl">
            <div className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">
              Base EXP
            </div>
            <div className="text-2xl font-black text-white">
              +{Math.floor(breakdownState.expBreakdown.baseExp).toLocaleString()}
            </div>
            <div className="text-xs text-zinc-500 mt-1">From Master Pages</div>
          </div>
          <div className="bg-zinc-900/40 border border-[#b8860b]/30 p-5 rounded-2xl">
            <div className="text-[#b8860b] text-[10px] font-black uppercase tracking-[0.2em] mb-2">
              Armory Bonus
            </div>
            <div className="text-2xl font-black text-[#b8860b]">
              +{Math.floor(breakdownState.expBreakdown.armoryExp).toLocaleString()}
            </div>
            <div className="text-xs text-[#b8860b]/60 mt-1">From Artifacts</div>
          </div>
          <div className="bg-zinc-900/40 border border-emerald-500/10 p-5 rounded-2xl">
            <div className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">
              Quest EXP
            </div>
            <div className="text-2xl font-black text-emerald-400">
              +{Math.floor(breakdownState.expBreakdown.questExp).toLocaleString()}
            </div>
            <div className="text-xs text-emerald-500/60 mt-1">
              From completed quests
            </div>
          </div>
          <div className="bg-zinc-900/40 border border-fuchsia-500/20 p-5 rounded-2xl">
            <div className="text-fuchsia-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">
              Boss EXP
            </div>
            <div className="text-2xl font-black text-fuchsia-400">
              +{Math.floor(breakdownState.expBreakdown.bossExp).toLocaleString()}
            </div>
            <div className="text-xs text-fuchsia-500/60 mt-1">
              From Defeated Bosses
            </div>
          </div>
          <div className="bg-zinc-900/40 border border-red-500/10 p-5 rounded-2xl">
            <div className="text-red-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">
              Decay Penalty
            </div>
            <div className="text-2xl font-black text-red-400">
              {Math.floor(breakdownState.expBreakdown.decayExp).toLocaleString()}
            </div>
            <div className="text-xs text-red-500/60 mt-1">
              Due to inactivity gaps
            </div>
          </div>
          <div className="bg-zinc-900/40 border border-orange-500/10 p-5 rounded-2xl">
            <div className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">
              Drop Penalty
            </div>
            <div className="text-2xl font-black text-orange-400">
              {Math.floor(breakdownState.expBreakdown.penaltyExp).toLocaleString()}
            </div>
            <div className="text-xs text-orange-500/60 mt-1">From dropped media</div>
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
          <h4 className="text-zinc-400 font-bold uppercase tracking-widest text-xs mb-4">
            Weekly Quests
          </h4>
          <div className="grid md:grid-cols-2 gap-4">
            {weeklyQuests.map((q, i) => (
              <QuestCard
                key={i}
                quest={q}
                onReroll={(e) => handleRerollQuest(e, q.id, "weekly")}
                isRerolling={rerollingQuestId === q.id}
              />
            ))}
          </div>
        </div>

        {/* Monthly */}
        <div>
          <h4 className="text-zinc-400 font-bold uppercase tracking-widest text-xs mb-4">
            Monthly Quests
          </h4>
          <div className="grid md:grid-cols-2 gap-4">
            {monthlyQuests.map((q, i) => (
              <QuestCard
                key={i}
                quest={q}
                onReroll={(e) => handleRerollQuest(e, q.id, "monthly")}
                isRerolling={rerollingQuestId === q.id}
              />
            ))}
          </div>
        </div>

        {/* Yearly */}
        <div>
          <h4 className="text-zinc-400 font-bold uppercase tracking-widest text-xs mb-4">
            Yearly Quests
          </h4>
          <div className="grid md:grid-cols-2 gap-4">
            {yearlyQuests.map((q, i) => (
              <QuestCard key={i} quest={q} />
            ))}
          </div>
        </div>
      </section>

      {expandedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" onClick={() => setExpandedImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center">
            <img src={expandedImage} alt="Expanded Boss" className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" referrerPolicy="no-referrer" />
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute top-4 right-4 bg-black/50 hover:bg-black/80 text-white w-10 h-10 rounded-full flex items-center justify-center transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestCard({
  quest,
  onReroll,
  isRerolling,
}: {
  quest: any;
  onReroll?: (e: React.MouseEvent) => void;
  isRerolling?: boolean;
}) {
  const { aiTextCache, saveAiText, settings, refreshData } = useMediaContext();
  const percentage = Math.min(
    100,
    Math.max(0, (quest.currentAmount / quest.targetAmount) * 100),
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const fetchedForRef = useRef<string | null>(null);

  const dynTitleCached = aiTextCache[`quest_title_${quest.id}`];
  const dynDescCached = aiTextCache[`quest_desc_${quest.id}`];

  useEffect(() => {
    const currentQuestStr = quest.title + "|" + quest.description;

    if (
      (!dynTitleCached || !dynDescCached) &&
      (settings?.nanoGptApiKey || settings?.geminiApiKey) &&
      fetchedForRef.current !== currentQuestStr &&
      !quest.isFailed &&
      !quest.isCompleted &&
      !isRerolling &&
      ["monthly", "weekly", "yearly"].includes(quest.type)
    ) {
      fetchedForRef.current = currentQuestStr;
      setIsGenerating(true);
      (async () => {
        try {
          const systemPrompt = getPersonaDescription(settings?.aiPersona) + FAUXLORE_CONTEXT;

          const titlePrompt = `Rewrite this Quest Title to sound natural, conversational and motivating. DON'T use RPG tropes like 'Saga', 'Undying', 'Eternal', 'Valor'. Keep it simple and human. Original: "${quest.title}". Give ONLY the title.`;
          const descPrompt = `Rewrite this Quest Description to sound natural and friendly, like a helpful friend encouraging you to read or play. Avoid flowery RPG language and descriptions of 'infinite glory' or 'transcendence'. Just keep it simple. Limit the response to 1-2 short sentences. CRITICAL: You MUST explicitly include clear instructions on what needs to be done based on the original description! Example: 'Time to read some good books! Read at least 100 pages this week.' Original: "${quest.description}". Give ONLY the description.`;

          let qTitleRes = "";
          let qDescRes = "";

          if (settings.nanoGptApiKey) {
            const apiKey = settings.nanoGptApiKey;
            const model = settings.nanoGptModel || "chatgpt-4o-latest";
            qTitleRes = await generateText(
              apiKey,
              model,
              systemPrompt,
              titlePrompt,
            );
            qDescRes = await generateText(
              apiKey,
              model,
              systemPrompt,
              descPrompt,
            );
          } else if (settings.geminiApiKey) {
            const apiKey = settings.geminiApiKey;
            qTitleRes = await generateGeminiText(
              apiKey,
              systemPrompt,
              titlePrompt,
            );
            qDescRes = await generateGeminiText(
              apiKey,
              systemPrompt,
              descPrompt,
            );
          }

          const qTitleKey = `quest_title_${quest.id}`;
          await saveAiText(qTitleKey, qTitleRes);

          const qDescKey = `quest_desc_${quest.id}`;
          await saveAiText(qDescKey, qDescRes);

          await refreshData();
        } catch (e) {
          console.error(e);
        } finally {
          setIsGenerating(false);
        }
      })();
    }
  }, [
    quest.id,
    quest.title,
    quest.description,
    dynTitleCached,
    dynDescCached,
    settings,
    refreshData,
    saveAiText,
    quest.isFailed,
    quest.isCompleted,
    quest.type,
    isRerolling,
  ]);

  const dynTitle = dynTitleCached || quest.title;
  const dynDesc = dynDescCached || quest.description;

  const showLoading = isRerolling || isGenerating;

  return (
    <div
      className={cn(
        "p-6 rounded-2xl border relative overflow-hidden transition-all flex flex-col justify-between",
        quest.isCompleted
          ? "bg-emerald-900/20 border-emerald-500/30"
          : "bg-zinc-900/50 border-white/5 shadow-xl",
      )}
    >
      {quest.isCompleted && (
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-[40px]" />
      )}

      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="flex items-center gap-3 pr-2">
          {quest.isCompleted ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
          ) : (
            <CircleDashed className="w-8 h-8 text-zinc-600 shrink-0" />
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              {showLoading ? (
                <div className="h-6 w-32 bg-white/10 rounded animate-pulse"></div>
              ) : (
                <h5 className="font-bold text-white text-lg leading-tight">
                  {dynTitle}
                </h5>
              )}
              {onReroll && !quest.isCompleted && (
                <button
                  type="button"
                  onClick={onReroll}
                  disabled={showLoading}
                  title="Re-Roll Quest"
                  className="relative z-20 pointer-events-auto text-zinc-500 hover:text-orange-400 transition-colors p-1 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg disabled:opacity-50"
                >
                  {showLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Dices className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
            {showLoading ? (
              <div className="space-y-2 mt-2">
                <div className="h-4 w-48 bg-white/10 rounded animate-pulse"></div>
                <div className="h-4 w-32 bg-white/10 rounded animate-pulse"></div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">{dynDesc}</p>
            )}
          </div>
        </div>
        <div
          className={cn(
            "px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase flex-shrink-0",
            quest.isCompleted
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-orange-500/20 text-orange-400 border border-orange-500/30",
          )}
        >
          +{quest.expReward} EXP
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between text-xs font-mono font-bold mb-2">
          <span
            className={quest.isCompleted ? "text-emerald-400" : "text-zinc-500"}
          >
            {Math.floor(quest.currentAmount).toLocaleString()}
          </span>
          <span className="text-zinc-600">
            {quest.targetAmount.toLocaleString()}
          </span>
        </div>
        <div className="h-2 bg-zinc-950 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-1000",
              quest.isCompleted ? "bg-emerald-500" : "bg-orange-500",
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
