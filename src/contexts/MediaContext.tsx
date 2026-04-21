import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { MediaItem, ProgressLog, MetricType, MediaType } from '../types/schema';
import { DatabaseService } from '../services/db';

interface MediaContextType {
  media: MediaItem[];
  logs: ProgressLog[];
  refreshData: () => Promise<void>;
  saveMediaItem: (item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }) => Promise<void>;
  deleteMediaItem: (id: string) => Promise<void>;
  addLog: (mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string) => Promise<void>;
  isLoading: boolean;
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

export const MediaProvider = ({ children }: { children: ReactNode }) => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [mediaData, logsData] = await Promise.all([
        DatabaseService.getAllMedia(),
        DatabaseService.getAllLogs()
      ]);
      setMedia(mediaData);
      setLogs(logsData);
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

  return (
    <MediaContext.Provider value={{ media, logs, refreshData, saveMediaItem, deleteMediaItem, addLog, isLoading }}>
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
