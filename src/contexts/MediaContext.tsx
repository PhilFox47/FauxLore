import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { MediaItem, ProgressLog, MetricType, MediaType, Settings, Artifact } from '../types/schema';
import { DatabaseService } from '../services/db';
import { calculateRPGState } from '../lib/rpgSystem';
import { generateText } from '../services/nanoGptService';
import { useAuth } from './AuthContext';

interface MediaContextType {
  media: MediaItem[];
  logs: ProgressLog[];
  settings: Settings | null;
  aiRecaps: any[];
  artifacts: Artifact[];
  aiTextCache: Record<string, string>;
  refreshData: () => Promise<void>;
  saveMediaItem: (item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }) => Promise<void>;
  deleteMediaItem: (id: string) => Promise<void>;
  addLog: (mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string, location?: string) => Promise<void>;
  updateLog: (id: string, updates: Partial<ProgressLog>) => Promise<void>;
  deleteLog: (id: string) => Promise<void>;
  saveAiRecap: (recap: any) => Promise<void>;
  saveArtifact: (artifact: Artifact) => Promise<void>;
  saveAiText: (key: string, value: string) => Promise<void>;
  clearAiTextCache: (key?: string) => Promise<void>;
  isLoading: boolean;
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

export const MediaProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [aiRecaps, setAiRecaps] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [aiTextCache, setAiTextCache] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refreshData = useCallback(async () => {
    if (!user) {
      setMedia([]);
      setLogs([]);
      setSettings(null);
      setAiRecaps([]);
      setArtifacts([]);
      setAiTextCache({});
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const [mediaData, logsData, settingsData, recapsData, artifactsData, textCacheData] = await Promise.all([
        DatabaseService.getAllMedia(),
        DatabaseService.getAllLogs(),
        DatabaseService.getSettings(),
        DatabaseService.getAiRecaps(),
        DatabaseService.getArtifacts(),
        DatabaseService.getAiTextCache()
      ]);
      setMedia(mediaData);
      setLogs(logsData);
      setSettings(settingsData);
      setAiRecaps(recapsData);
      setArtifacts(artifactsData);
      setAiTextCache(textCacheData);
    } catch (error) {
      console.error("Failed to load data from server:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshData();
  }, [refreshData, user?.id]);

  const previousLevel = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading || !settings) return;

    const rpgState = calculateRPGState(media, logs, settings);
    const currentLevel = rpgState.level;

    if (previousLevel.current === null || previousLevel.current !== currentLevel) {
      if (settings.nanoGptApiKey) {
        const titleKey = `rpg_title_${currentLevel}`;
        
        // Generate if it's an actual level change, OR if it's the initial load and the title is missing
        if ((previousLevel.current !== null && previousLevel.current !== currentLevel) || !aiTextCache[titleKey]) {
          const systemPrompt = "You are FauxLore, a helpful and natural media tracking assistant. Keep your tone conversational, friendly, and grounded. No epic RPG or fantasy roleplay unless explicitly asked.";
          const titlePrompt = `The user has just reached Level ${currentLevel} with the base title "${rpgState.className}". Generate a creative, punchy, and natural title for them. NO extra comments, just the title. 1-4 words. Avoid fantasy clichés.`;
          
          generateText(settings.nanoGptApiKey, settings.nanoGptModel || 'gpt-4o-mini', systemPrompt, titlePrompt)
            .then(titleRes => {
               DatabaseService.saveAiText(titleKey, titleRes).then(() => refreshData());
            })
            .catch(err => console.error("Auto generation of title failed", err));
        }
      }
    }
    
    previousLevel.current = currentLevel;
  }, [media, logs, settings, aiTextCache, isLoading, refreshData]);

  const saveMediaItem = useCallback(async (item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }) => {
    await DatabaseService.saveMedia(item);
    await refreshData();
  }, [refreshData]);

  const deleteMediaItem = useCallback(async (id: string) => {
    await DatabaseService.deleteMedia(id);
    await refreshData();
  }, [refreshData]);

  const addLog = useCallback(async (mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string, location?: string) => {
    await DatabaseService.addProgressLog(mediaId, metricType, delta, note, timestamp, location);
    await refreshData();
  }, [refreshData]);

  const updateLog = useCallback(async (id: string, updates: Partial<ProgressLog>) => {
    await DatabaseService.updateProgressLog(id, updates);
    await refreshData();
  }, [refreshData]);

  const deleteLog = useCallback(async (id: string) => {
    await DatabaseService.deleteProgressLog(id);
    await refreshData();
  }, [refreshData]);

  const saveAiRecap = useCallback(async (recap: any) => {
    await DatabaseService.saveAiRecap(recap);
    await refreshData();
  }, [refreshData]);

  const saveArtifact = useCallback(async (artifact: Artifact) => {
    await DatabaseService.saveArtifact(artifact);
    await refreshData();
  }, [refreshData]);

  const saveAiText = useCallback(async (key: string, value: string) => {
    await DatabaseService.saveAiText(key, value);
    await refreshData();
  }, [refreshData]);

  const clearAiTextCache = useCallback(async (key?: string) => {
    await DatabaseService.clearAiText(key);
    await refreshData();
  }, [refreshData]);

  return (
    <MediaContext.Provider value={{ media, logs, settings, aiRecaps, artifacts, aiTextCache, refreshData, saveMediaItem, deleteMediaItem, addLog, updateLog, deleteLog, saveAiRecap, saveArtifact, saveAiText, clearAiTextCache, isLoading }}>
      {children}
    </MediaContext.Provider>
  );
};

export const useMediaContext = () => {
  const context = useContext(MediaContext);
  if (context === undefined) {
    throw new Error('useMediaContext must be used within a MediaProvider');
  }
  return context;
};
