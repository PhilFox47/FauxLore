import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { MediaItem, ProgressLog, MetricType, MediaType, Settings } from '../types/schema';
import { DatabaseService } from '../services/db';

interface MediaContextType {
  media: MediaItem[];
  logs: ProgressLog[];
  settings: Settings | null;
  aiRecaps: any[];
  aiTextCache: Record<string, string>;
  refreshData: () => Promise<void>;
  saveMediaItem: (item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }) => Promise<void>;
  deleteMediaItem: (id: string) => Promise<void>;
  addLog: (mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string) => Promise<void>;
  saveAiRecap: (recap: any) => Promise<void>;
  saveAiText: (key: string, value: string) => Promise<void>;
  clearAiTextCache: (key?: string) => Promise<void>;
  isLoading: boolean;
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

export const MediaProvider = ({ children }: { children: ReactNode }) => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [aiRecaps, setAiRecaps] = useState<any[]>([]);
  const [aiTextCache, setAiTextCache] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refreshData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [mediaData, logsData, settingsData, recapsData, textCacheData] = await Promise.all([
        DatabaseService.getAllMedia(),
        DatabaseService.getAllLogs(),
        DatabaseService.getSettings(),
        DatabaseService.getAiRecaps(),
        DatabaseService.getAiTextCache()
      ]);
      setMedia(mediaData);
      setLogs(logsData);
      setSettings(settingsData);
      setAiRecaps(recapsData);
      setAiTextCache(textCacheData);
    } catch (error) {
      console.error("Failed to load data from server:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const saveMediaItem = useCallback(async (item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }) => {
    await DatabaseService.saveMedia(item);
    await refreshData();
  }, [refreshData]);

  const deleteMediaItem = useCallback(async (id: string) => {
    await DatabaseService.deleteMedia(id);
    await refreshData();
  }, [refreshData]);

  const addLog = useCallback(async (mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string) => {
    await DatabaseService.addProgressLog(mediaId, metricType, delta, note, timestamp);
    await refreshData();
  }, [refreshData]);

  const saveAiRecap = useCallback(async (recap: any) => {
    await DatabaseService.saveAiRecap(recap);
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
    <MediaContext.Provider value={{ media, logs, settings, aiRecaps, aiTextCache, refreshData, saveMediaItem, deleteMediaItem, addLog, saveAiRecap, saveAiText, clearAiTextCache, isLoading }}>
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
