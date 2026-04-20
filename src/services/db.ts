import { MediaItem, ProgressLog, MetricType, MediaType } from '../types/schema';
import { v4 as uuidv4 } from 'uuid';

/**
 * Local Storage simulated database.
 * This is designed to be easily swapped out for Firebase, Supabase, or PostgreSQL.
 */

const DB_KEYS = {
  MEDIA: 'fauxlore_media',
  LOGS: 'fauxlore_logs',
};

const getStoredItem = <T>(key: string, defaultValue: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

const setStoredItem = <T>(key: string, value: T): void => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const DatabaseService = {
  getAllMedia(): MediaItem[] {
    return getStoredItem<MediaItem[]>(DB_KEYS.MEDIA, []);
  },

  getMediaById(id: string): MediaItem | undefined {
    return this.getAllMedia().find(m => m.id === id);
  },

  saveMedia(item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }): MediaItem {
    const all = this.getAllMedia();
    const now = new Date().toISOString();
    
    if (item.id) {
      const idx = all.findIndex(m => m.id === item.id);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...item, updatedAt: now };
        setStoredItem(DB_KEYS.MEDIA, all);
        return all[idx];
      }
    }
    
    // New
    const newItem: MediaItem = {
      ...item,
      id: uuidv4(),
      genres: item.genres || [],
      tags: item.tags || [],
      tropes: item.tropes || [],
      createdAt: now,
      updatedAt: now,
    } as MediaItem;
    
    all.push(newItem);
    setStoredItem(DB_KEYS.MEDIA, all);
    return newItem;
  },

  deleteMedia(id: string): void {
    let all = this.getAllMedia();
    all = all.filter(m => m.id !== id);
    setStoredItem(DB_KEYS.MEDIA, all);

    // Cascade delete logs
    let logs = this.getAllLogs();
    logs = logs.filter(l => l.mediaId !== id);
    setStoredItem(DB_KEYS.LOGS, logs);
  },

  getAllLogs(): ProgressLog[] {
    return getStoredItem<ProgressLog[]>(DB_KEYS.LOGS, []);
  },

  getLogsForMedia(mediaId: string): ProgressLog[] {
    return this.getAllLogs().filter(l => l.mediaId === mediaId);
  },

  addProgressLog(mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string): ProgressLog {
     const logs = this.getAllLogs();
     const newLog: ProgressLog = {
       id: uuidv4(),
       mediaId,
       timestamp: timestamp || new Date().toISOString(),
       metricType,
       delta,
       note
     };
     logs.push(newLog);
     setStoredItem(DB_KEYS.LOGS, logs);

     // Must also update the source entity
     const item = this.getMediaById(mediaId);
     if (item) {
        const updatedItem = { ...item };
        // We ensure we only push updatedAt forward if the timestamp is recent, 
        // but for simplicity, we just trigger updatedAt now to push it to the top of standard sorts.
        const effectiveLogDate = timestamp || new Date().toISOString();
        
        updatedItem.updatedAt = new Date().toISOString(); 
        
        // Apply numeric delta to the appropriate metric
        updatedItem[metricType] = ((updatedItem[metricType] as number) || 0) + delta;
        this.saveMedia(updatedItem);
     }

     return newLog;
  }
};
