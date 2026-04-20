import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { MediaItem, ProgressLog, MetricType, MediaType } from '../types/schema';
import { DatabaseService } from '../services/db';

interface MediaContextType {
  media: MediaItem[];
  logs: ProgressLog[];
  refreshData: () => void;
  saveMediaItem: (item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }) => void;
  deleteMediaItem: (id: string) => void;
  addLog: (mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string) => void;
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

export const MediaProvider = ({ children }: { children: ReactNode }) => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [logs, setLogs] = useState<ProgressLog[]>([]);

  const refreshData = useCallback(() => {
    setMedia(DatabaseService.getAllMedia());
    setLogs(DatabaseService.getAllLogs());
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const saveMediaItem = useCallback((item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }) => {
    DatabaseService.saveMedia(item);
    refreshData();
  }, [refreshData]);

  const deleteMediaItem = useCallback((id: string) => {
    DatabaseService.deleteMedia(id);
    refreshData();
  }, [refreshData]);

  const addLog = useCallback((mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string) => {
    DatabaseService.addProgressLog(mediaId, metricType, delta, note, timestamp);
    refreshData();
  }, [refreshData]);

  return (
    <MediaContext.Provider value={{ media, logs, refreshData, saveMediaItem, deleteMediaItem, addLog }}>
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
