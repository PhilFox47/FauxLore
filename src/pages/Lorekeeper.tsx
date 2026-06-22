import React, { useMemo, useState, useEffect, useRef } from "react";
import { format, differenceInDays, parseISO, subDays } from 'date-fns';
import { useMediaContext } from "../contexts/MediaContext";
import { useToast } from "../contexts/ToastContext";
import { calculateRPGState } from "../lib/rpgSystem";
import { MEDIA_HEX, MEDIA_TYPES } from "../types/schema";
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
  ImageIcon,
  Gamepad2,
  Book,
  Headphones,
  MessagesSquare,
  BookImage,
  Tv,
  Clapperboard,
  Library
} from "lucide-react";
import { cn } from "../lib/utils";
import { calculateScaledPages, calculateScaledDelta } from "../lib/scaling";
import {
  generateText,
  getPersonaDescription,
} from "../services/nanoGptService";
import { generateGeminiText } from "../services/geminiService";
import { DatabaseService } from "../services/db";
import { buildTitleSystemPrompt, buildBatchTitlePrompt, buildMainTitlePrompt } from "../lib/lorekeeperTitles";
import { GeneratedImage } from "../components/GeneratedImage";
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
    rpgState,
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
  const toast = useToast();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false);
  const [isSpawningBoss, setIsSpawningBoss] = useState(false);
  const [encoreMediaType, setEncoreMediaType] = useState<string>("All Media Types");
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

  // Poll while any boss image is still generating (auto-spawned bosses generate
  // in the background) so the UI flips from "generating" to the image on its own.
  const generatingBossCount = worldBosses.filter(b => b.imageStatus === 'generating').length;
  useEffect(() => {
    if (generatingBossCount === 0) return;
    const id = setInterval(() => refreshData(), 5000);
    return () => clearInterval(id);
  }, [generatingBossCount, refreshData]);

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

  const missingMainTitle = !aiTextCache[`rpg_title_${rpgState.level}`];
  const missingMediaTypes = useMemo(() => {
    return Object.entries(rpgState.mediaLevels)
      .filter(([, data]) => data.level > 1 || data.exp > 0)
      .filter(([mediaType, data]) => !aiTextCache[`rpg_title_${mediaType}_${data.level}`])
      .map(([mediaType]) => mediaType);
  }, [rpgState.mediaLevels, aiTextCache]);

  const missingTitleRef = useRef(false);

  useEffect(() => {
    if (!settings?.nanoGptApiKey && !settings?.geminiApiKey) return;
    if (isRegeneratingTitle || missingTitleRef.current) return;
    
    if (missingMainTitle || missingMediaTypes.length > 0) {
      missingTitleRef.current = true;
      generateMissingTitles(missingMainTitle, missingMediaTypes).finally(() => {
        missingTitleRef.current = false;
      });
    }
  }, [missingMainTitle, missingMediaTypes.length, settings?.nanoGptApiKey, settings?.geminiApiKey]);

  const getDynamicTitle = () => {
    return aiTextCache[`rpg_title_${rpgState.level}`] || rpgState.className;
  };

  const getMediaTitle = (mediaType: string, level: number, defVal: string) => {
    return aiTextCache[`rpg_title_${mediaType}_${level}`] || defVal;
  };

  const getLevelContext = (level: number) => {
    if (level >= 100) return "almost unrealistic, ultimate, mythical";
    if (level >= 50) return "epic, legendary, master-level (soft level cap)";
    if (level >= 20) return "dedicated, veteran-level";
    if (level >= 10) return "experienced, casual, intermediate-level";
    return "basic, beginner-level";
  };

  const getRecentMediaContext = (mediaType?: string) => {
    const recent = [...media]
      .filter((m) => m.status === "Active" || m.status === "Completed" || m.status === "Extras")
      .filter((m) => mediaType ? m.mediaType === mediaType : true)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 50);

    if (recent.length === 0) return { text: "None yet", dominantMedia: null };

    const top10 = recent.slice(0, 10);
    let totalTop10Mp = 0;
    const top10WithMp = top10.map((m) => {
      const nonHistoricLogs = logs.filter(l => l.mediaId === m.id && !l.isHistoric && !l.timestamp.startsWith('1970-01-01'));
      
      let mp = 0;
      if (nonHistoricLogs.length > 0) {
        mp = nonHistoricLogs.reduce((sum, log) => sum + Math.floor(calculateScaledDelta(log.delta, m, settings)), 0);
      } else {
        mp = 1; // Minimum baseline for having started it at all
      }
      
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
          `"${m.title}" (${m.mediaType}, Genres: ${m.genres?.join(", ") || 'none'}, Tags: ${m.tags?.join(", ") || 'none'}, MP: ${m.mp})`
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

  const generateMissingTitles = async (generateMain: boolean, mediaTypesToGenerate: string[], manualRes: boolean = false) => {
    if (!settings?.nanoGptApiKey && !settings?.geminiApiKey) {
      if (manualRes) toast.error("Please configure an AI API Key in Settings first.");
      return;
    }

    if (!generateMain && mediaTypesToGenerate.length === 0) return;

    setIsRegeneratingTitle(true);
    try {
      const personaDesc = getPersonaDescription(settings?.aiPersona);
      const systemPrompt = buildTitleSystemPrompt(personaDesc);

      const forbiddenTitles: string[] = [];
      if (generateMain) {
        const currentMain = aiTextCache[`rpg_title_${rpgState.level}`];
        if (currentMain) forbiddenTitles.push(currentMain);
      }
      mediaTypesToGenerate.forEach(t => {
        const currentMed = aiTextCache[`rpg_title_${t}_${rpgState.mediaLevels[t].level}`];
        if (currentMed) forbiddenTitles.push(currentMed);
      });

      const mainCtx = generateMain ? getRecentMediaContext() : null;
      const perMedia = mediaTypesToGenerate.map(t => ({
        type: t,
        level: rpgState.mediaLevels[t].level,
        context: getRecentMediaContext(t).text,
      }));

      const titlePrompt = buildBatchTitlePrompt({
        level: rpgState.level,
        main: mainCtx ? { context: mainCtx.text, dominantTitle: mainCtx.dominantMedia?.title || null } : null,
        perMedia,
        forbidden: forbiddenTitles,
      });

      let titleRes = "";
      if (settings.nanoGptApiKey) {
        const apiKey = settings.nanoGptApiKey;
        const model = settings.nanoGptModel || "gpt-4o-mini";
        titleRes = await generateText(apiKey, model, systemPrompt, titlePrompt, 1.2);
      } else if (settings.geminiApiKey) {
        const apiKey = settings.geminiApiKey;
        titleRes = await generateGeminiText(apiKey, systemPrompt, titlePrompt, 1.2);
      }

      const cleanJson = titleRes.replace(/```json/gi, '').replace(/```/g, '').trim();
      let parsedTitles: Record<string, string> = {};
      try {
         parsedTitles = JSON.parse(cleanJson);
      } catch (e) {
         console.error("Failed to parse JSON titles: ", cleanJson);
         throw new Error("AI did not return valid JSON.");
      }

      if (generateMain && parsedTitles.main) {
        await saveAiText(`rpg_title_${rpgState.level}`, parsedTitles.main);
      }
      
      for (const t of mediaTypesToGenerate) {
        if (parsedTitles[t]) {
           await saveAiText(`rpg_title_${t}_${rpgState.mediaLevels[t].level}`, parsedTitles[t]);
        }
      }

      await refreshData();
      if (manualRes) toast.success("Titles successfully regenerated!");
    } catch (e: any) {
      if (manualRes) toast.error("Error regenerating titles: " + e.message);
      else console.error("Error regenerating bg titles:", e.message);
    } finally {
      setIsRegeneratingTitle(false);
    }
  };

  const handleRegenerateTitle = async () => {
     generateMissingTitles(true, Object.keys(rpgState.mediaLevels).filter(k => rpgState.mediaLevels[k].level > 1 || rpgState.mediaLevels[k].exp > 0), true);
  };


  const handleRegenerate = async () => {
    if (!settings?.nanoGptApiKey && !settings?.geminiApiKey) {
      toast.error("Please configure an AI API Key in Settings first.");
      return;
    }

    setIsRegenerating(true);
    try {
      const personaDesc = getPersonaDescription(settings?.aiPersona);
      const systemPrompt = `You are FauxLore's central AI logic core. ${personaDesc}${FAUXLORE_CONTEXT}`;

      // 1. RPG Title (overall earned alias)
      const titleSystemPrompt = buildTitleSystemPrompt(personaDesc);
      const titleCtx = getRecentMediaContext();
      const currentMain = aiTextCache[`rpg_title_${rpgState.level}`];
      const titlePrompt = buildMainTitlePrompt({
        level: rpgState.level,
        context: titleCtx.text,
        dominantTitle: titleCtx.dominantMedia?.title || null,
        forbidden: currentMain,
      });

      const titleKey = `rpg_title_${rpgState.level}`;
      let titleRes = "";
      if (settings.nanoGptApiKey) {
        titleRes = await generateText(settings.nanoGptApiKey, settings.nanoGptModel || "gpt-4o-mini", titleSystemPrompt, titlePrompt, 1.2);
      } else if (settings.geminiApiKey) {
        titleRes = await generateGeminiText(settings.geminiApiKey, titleSystemPrompt, titlePrompt, 1.2);
      }

      await saveAiText(titleKey, titleRes);

      // 2. Quests
      const generatedQuestTitles: string[] = [];
      const generatedQuestDescs: string[] = [];

      for (const quest of rpgState.quests) {
        // Title
        const qTitleKey = `quest_title_${quest.id}`;
        let existingTitlesRule = "";
        if (generatedQuestTitles.length > 0) {
          existingTitlesRule = `\nCRITICAL RULE: Do NOT use titles similar to these already generated titles: ${generatedQuestTitles.map(d => '"' + d + '"').join(", ")}.`;
        }
        const tPrompt = `Rewrite this Quest Title to sound natural, conversational and motivating. DON'T use RPG tropes like 'Saga', 'Undying', 'Eternal', 'Valor'. Keep it simple and human. Original: "${quest.title}".${existingTitlesRule} Give ONLY the title.`;
        let qTitleRes = "";

        // Description
        const qDescKey = `quest_desc_${quest.id}`;
        let existingDescsRule = "";
        if (generatedQuestDescs.length > 0) {
          existingDescsRule = `\nCRITICAL RULE: Do NOT start with or use phrases similar to the already generated descriptions. Vary your sentence structure! Previously generated descriptions:\n${generatedQuestDescs.map(d => '- "' + d + '"').join("\n")}.`;
        }
        const dPrompt = `Rewrite this Quest Description to sound natural and friendly, like a helpful friend encouraging you to read or play. Avoid flowery RPG language and descriptions of 'infinite glory' or 'transcendence'. Just keep it simple. Limit the response to 1-2 short sentences. CRITICAL: You MUST explicitly include clear instructions on what needs to be done based on the original description! Example: 'Time to read some good books! Read at least 100 pages this week.'${existingDescsRule} Original: "${quest.description}". Give ONLY the description.`;
        let qDescRes = "";

        if (settings.nanoGptApiKey) {
          const apiKey = settings.nanoGptApiKey;
          const model = settings.nanoGptModel || "gpt-4o-mini";
          qTitleRes = await generateText(apiKey, model, systemPrompt, tPrompt, 1.2);
          qDescRes = await generateText(apiKey, model, systemPrompt, dPrompt);
        } else if (settings.geminiApiKey) {
          qTitleRes = await generateGeminiText(
            settings.geminiApiKey,
            systemPrompt,
            tPrompt,
            1.2
          );
          qDescRes = await generateGeminiText(
            settings.geminiApiKey,
            systemPrompt,
            dPrompt,
          );
        }

        await saveAiText(qTitleKey, qTitleRes);
        await saveAiText(qDescKey, qDescRes);
        
        generatedQuestTitles.push(qTitleRes);
        generatedQuestDescs.push(qDescRes);
      }

      await refreshData();
      toast.success("All Lore and Quests have been regenerated with a natural tone!");
    } catch (e: any) {
      toast.error("Error regenerating content: " + e.message);
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
      <section className="shrink-0 bg-zinc-900 border border-white/5 rounded-3xl p-8 relative overflow-hidden flex flex-col gap-8">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="flex flex-col md:flex-row items-center gap-8 z-10 relative leading-none">
          <div className="shrink-0 relative">
            <div className="w-32 h-32 bg-zinc-950 rounded-3xl flex items-center justify-center border-4 border-orange-500/50 shadow-[0_0_30px_rgba(249,115,22,0.3)] z-10 relative">
              <Swords className="w-16 h-16 text-orange-400" />
              <div className="absolute -bottom-4 -right-4 bg-orange-600 text-white text-base font-black px-4 py-1 rounded-full border-4 border-zinc-900 shadow-xl shadow-orange-900/50">
                Lvl {rpgState.level}
              </div>
            </div>
          </div>

          <div className="flex-1 w-full text-center md:text-left leading-normal">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-2 group/maintitle">
              <h3 className="text-4xl font-black text-white italic tracking-tight">
                {getDynamicTitle()}
              </h3>
              <button
                onClick={(e) => { e.stopPropagation(); generateMissingTitles(true, [], true); }}
                className="opacity-0 group-hover/maintitle:opacity-100 flex-shrink-0 p-2 rounded hover:bg-white/5 transition-all outline-none"
                title="Regenerate Title"
              >
                <RefreshCw className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
              </button>
            </div>
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
        </div>
      </section>

      {/* Per-Media Level Overview */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 z-10 relative">
        {Object.entries(rpgState.mediaLevels)
            .sort(([, a], [, b]) => b.level - a.level)
            .map(([mediaType, data]) => {
              const accent = MEDIA_HEX[mediaType as keyof typeof MEDIA_HEX]?.base || '#f97316';
              // Default to generic title if AI hasn't generated one
              const currentTitle = getMediaTitle(mediaType, data.level, data.title);
              return (
                <div key={mediaType} className="bg-zinc-900 border border-white/5 rounded-3xl p-6 flex flex-col relative overflow-hidden group shadow-lg">
                  <div className="absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-10 pointer-events-none transition-opacity group-hover:opacity-30" style={{ backgroundColor: accent }} />
                  
                  <div className="flex flex-col mb-4 relative z-10">
                    <div className="flex items-start justify-between mb-2">
                       <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center shrink-0 shadow-inner" style={{ color: accent, boxShadow: `inset 0 0 10px ${accent}20` }}>
                          {mediaType === 'Game' && <Gamepad2 className="w-5 h-5" />}
                          {mediaType === 'Book' && <Book className="w-5 h-5" />}
                          {mediaType === 'Audiobook' && <Headphones className="w-5 h-5" />}
                          {mediaType === 'Visual Novel' && <MessagesSquare className="w-5 h-5" />}
                          {mediaType === 'Manga' && <Library className="w-5 h-5" />}
                          {mediaType === 'Series' && <Tv className="w-5 h-5" />}
                          {mediaType === 'Movie' && <Clapperboard className="w-5 h-5" />}
                          {mediaType === 'Comic' && <BookImage className="w-5 h-5" />}
                       </div>
                       <div className="text-3xl font-black text-white italic pl-4">
                         <span className="text-[10px] font-bold text-zinc-500 not-italic mr-1 block text-right leading-none">LVL</span>
                         {data.level}
                       </div>
                    </div>
                    <div className="flex items-start justify-between group/medtitle w-full mt-1">
                      <div className="text-[10px] sm:text-xs font-black uppercase tracking-widest leading-tight pr-2" style={{ color: accent }} title={currentTitle}>{currentTitle}</div>
                      <button
                        onClick={(e) => { e.stopPropagation(); generateMissingTitles(false, [mediaType], true); }}
                        className="opacity-0 group-hover/medtitle:opacity-100 flex-shrink-0 p-1 rounded hover:bg-white/5 transition-all outline-none"
                        title="Regenerate Title"
                      >
                         <RefreshCw className="w-3 h-3 text-zinc-500 hover:text-zinc-300" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-auto relative z-10">
                    <div className="flex justify-between items-end mb-1.5">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{Math.floor(data.exp).toLocaleString()} EXP</div>
                      <div className="text-[11px] text-zinc-400 font-mono font-medium tracking-tighter">{Math.floor(data.expProgress * 100)}%</div>
                    </div>
                    <div className="h-2 bg-zinc-950 rounded-full overflow-hidden shadow-inner border border-white/5 relative">
                      <div 
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${Math.max(2, data.expProgress * 100)}%`, backgroundColor: accent, boxShadow: `0 0 10px ${accent}80` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
        }
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
            <select
              title="Spawn Enemy associated with this specific Media Type"
              value={encoreMediaType}
              onChange={(e) => setEncoreMediaType(e.target.value)}
              className="bg-black/40 hover:bg-zinc-800 border border-white/5 px-4 py-3 rounded-2xl flex items-center justify-center gap-2 transition-all font-bold text-zinc-400 outline-none focus:border-red-500/30"
            >
              <option value="All Media Types">All Media Types</option>
              {MEDIA_TYPES.map(type => (
                 <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <button
              onClick={async () => {
                setIsSpawningBoss(true);
                try {
                  await spawnBoss(encoreMediaType);
                } catch (e: any) {
                  toast.error(e.message || "Failed to spawn boss");
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

                      <GeneratedImage
                        url={boss.imageUrl}
                        status={boss.imageStatus}
                        alt={boss.name}
                        onExpand={() => setExpandedImage(boss.imageUrl || null)}
                        onRegenerate={() => generateBossImage(boss.id)}
                      />
                      
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

                      <GeneratedImage
                        url={boss.imageUrl}
                        status={boss.imageStatus}
                        alt={boss.name}
                        onExpand={() => setExpandedImage(boss.imageUrl || null)}
                        onRegenerate={() => generateBossImage(boss.id)}
                      />
                      
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
                allQuests={rpgState.quests}
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
                allQuests={rpgState.quests}
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
              <QuestCard key={i} quest={q} allQuests={rpgState.quests} />
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
  allQuests,
}: {
  quest: any;
  onReroll?: (e: React.MouseEvent) => void;
  isRerolling?: boolean;
  allQuests?: any[];
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
  const originalStrCached = aiTextCache[`quest_original_${quest.id}`];

  useEffect(() => {
    const currentQuestStr = quest.title + "|" + quest.description;

    const needsFetch = 
      (!dynTitleCached || !dynDescCached || (originalStrCached !== undefined && originalStrCached !== currentQuestStr)) &&
      (settings?.nanoGptApiKey || settings?.geminiApiKey) &&
      fetchedForRef.current !== currentQuestStr &&
      !quest.isFailed &&
      !quest.isCompleted &&
      !isRerolling &&
      ["monthly", "weekly", "yearly"].includes(quest.type);

    if (needsFetch) {
      fetchedForRef.current = currentQuestStr;
      setIsGenerating(true);
      (async () => {
        try {
          const systemPrompt = getPersonaDescription(settings?.aiPersona) + FAUXLORE_CONTEXT;
          
          let existingTitlesRule = "";
          let existingDescsRule = "";
          if (allQuests) {
            const skipTitleList = allQuests.map(q => aiTextCache[`quest_title_${q.id}`]).filter(Boolean);
            const skipDescList = allQuests.map(q => aiTextCache[`quest_desc_${q.id}`]).filter(Boolean);
            if (skipTitleList.length > 0) {
              existingTitlesRule = `\nCRITICAL RULE: Do NOT use titles similar to these already generated titles: ${skipTitleList.map(t => '"' + t + '"').join(", ")}.`;
            }
            if (skipDescList.length > 0) {
              existingDescsRule = `\nCRITICAL RULE: Do NOT start with or use phrases similar to the already generated descriptions. Vary your sentence structure! Previously generated descriptions:\n${skipDescList.map(d => '- "' + d + '"').join("\n")}.`;
            }
          }

          const titlePrompt = `Rewrite this Quest Title to sound natural, conversational and motivating. DON'T use RPG tropes like 'Saga', 'Undying', 'Eternal', 'Valor'. Keep it simple and human. Original: "${quest.title}".${existingTitlesRule} Give ONLY the title.`;
          const descPrompt = `Rewrite this Quest Description to sound natural and friendly, like a helpful friend encouraging you to read or play. Avoid flowery RPG language and descriptions of 'infinite glory' or 'transcendence'. Just keep it simple. Limit the response to 1-2 short sentences. CRITICAL: You MUST explicitly include clear instructions on what needs to be done based on the original description! Example: 'Time to read some good books! Read at least 100 pages this week.'${existingDescsRule} Original: "${quest.description}". Give ONLY the description.`;

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
              1.2
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
              1.2
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

          const originalKey = `quest_original_${quest.id}`;
          await saveAiText(originalKey, currentQuestStr);

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
    originalStrCached,
    settings,
    refreshData,
    saveAiText,
    quest.isFailed,
    quest.isCompleted,
    quest.type,
    isRerolling,
  ]);

  const generateSpecificText = async (type: 'title' | 'desc') => {
    setIsGenerating(true);
    try {
      const systemPrompt = getPersonaDescription(settings?.aiPersona) + FAUXLORE_CONTEXT;
      let existingRule = "";
      if (allQuests) {
        const skipList = allQuests.map(q => aiTextCache[`quest_${type}_${q.id}`]).filter(Boolean);
        if (skipList.length > 0) {
          if (type === 'title') existingRule = `\nCRITICAL RULE: Do NOT use titles similar to these already generated titles: ${skipList.map(t => '"' + t + '"').join(", ")}.`;
          else existingRule = `\nCRITICAL RULE: Do NOT start with or use phrases similar to the already generated descriptions. Vary your sentence structure! Previously generated descriptions:\n${skipList.map(d => '- "' + d + '"').join("\n")}.`;
        }
      }
      
      const prompt = type === 'title' 
        ? `Rewrite this Quest Title to sound natural, conversational and motivating. DON'T use RPG tropes like 'Saga', 'Undying', 'Eternal', 'Valor'. Keep it simple and human. Original: "${quest.title}".${existingRule} Give ONLY the title.`
        : `Rewrite this Quest Description to sound natural and friendly, like a helpful friend encouraging you to read or play. Avoid flowery RPG language and descriptions of 'infinite glory' or 'transcendence'. Just keep it simple. Limit the response to 1-2 short sentences. CRITICAL: You MUST explicitly include clear instructions on what needs to be done based on the original description! Example: 'Time to read some good books! Read at least 100 pages this week.'${existingRule} Original: "${quest.description}". Give ONLY the description.`;
        
      let res = "";
      
      if (settings?.nanoGptApiKey) {
        res = await generateText(settings.nanoGptApiKey, settings.nanoGptModel || "chatgpt-4o-latest", systemPrompt, prompt, type === 'title' ? 1.2 : 0.9);
      } else if (settings?.geminiApiKey) {
        res = await generateGeminiText(settings.geminiApiKey, systemPrompt, prompt, type === 'title' ? 1.2 : 0.9);
      }

      await saveAiText(`quest_${type}_${quest.id}`, res);
      await saveAiText(`quest_original_${quest.id}`, quest.title + "|" + quest.description);
      await refreshData();
    } catch(e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const dynTitle = dynTitleCached || quest.title;
  const dynDesc = dynDescCached || quest.description;

  const showLoading = isRerolling || isGenerating;

  return (
    <div
      className={cn(
        "p-6 rounded-2xl border relative overflow-hidden transition-all flex flex-col justify-between group",
        quest.isCompleted
          ? "bg-emerald-900/20 border-emerald-500/30"
          : "bg-zinc-900/50 border-white/5 shadow-xl",
      )}
    >
      {quest.isCompleted && (
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-[40px]" />
      )}

      <div className="flex justify-between items-start mb-4 relative z-10 w-full overflow-hidden">
        <div className="flex items-center gap-3 pr-2 w-full">
          {quest.isCompleted ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
          ) : (
            <CircleDashed className="w-8 h-8 text-zinc-600 shrink-0" />
          )}
          <div className="w-full">
            <div className="flex flex-wrap items-center gap-2 mb-1 justify-between group/title w-full">
              {showLoading ? (
                <div className="h-6 w-32 bg-white/10 rounded animate-pulse"></div>
              ) : (
                <div className="flex items-center gap-2 max-w-[85%]">
                  <h5 className="font-bold text-white text-lg leading-tight break-words">
                    {dynTitle}
                  </h5>
                  {!quest.isCompleted && (
                    <button
                      onClick={(e) => { e.stopPropagation(); generateSpecificText('title'); }}
                      className="opacity-0 group-hover/title:opacity-100 p-1 rounded hover:bg-white/5 transition-all outline-none"
                      title="Regenerate Requirement"
                    >
                      <RefreshCw className="w-3 h-3 text-zinc-600 hover:text-zinc-400" />
                    </button>
                  )}
                </div>
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
              <div className="flex items-center gap-2 group/desc">
                <p className="text-sm text-zinc-400 break-words">{dynDesc}</p>
                {!quest.isCompleted && (
                  <button
                    onClick={(e) => { e.stopPropagation(); generateSpecificText('desc'); }}
                    className="opacity-0 group-hover/desc:opacity-100 flex-shrink-0 p-1 rounded hover:bg-white/5 transition-all outline-none"
                    title="Regenerate Description"
                  >
                    <RefreshCw className="w-3 h-3 text-zinc-600 hover:text-zinc-400" />
                  </button>
                )}
              </div>
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
