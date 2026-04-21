import { MediaItem, ProgressLog, MetricType, MediaType } from '../types/schema';
import { v4 as uuidv4 } from 'uuid';

/**
 * REST API client that interacts with our local Express SQLite server
 */
export const DatabaseService = {
  async getAllMedia(): Promise<MediaItem[]> {
    try {
      const res = await fetch('/api/media');
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async getMediaById(id: string): Promise<MediaItem | undefined> {
    try {
      const res = await fetch(`/api/media/${id}`);
      if (res.status === 404) return undefined;
      return res.json();
    } catch (e) {
      console.error(e);
      return undefined;
    }
  },

  async saveMedia(item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }): Promise<MediaItem> {
    const payload = item.id ? { ...item, updatedAt: new Date().toISOString() } : { ...item, id: uuidv4(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to save media');
    return res.json();
  },

  async deleteMedia(id: string): Promise<void> {
    await fetch(`/api/media/${id}`, { method: 'DELETE' });
  },

  async getAllLogs(): Promise<ProgressLog[]> {
    try {
      const res = await fetch('/api/logs');
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async getLogsForMedia(mediaId: string): Promise<ProgressLog[]> {
    const logs = await this.getAllLogs();
    return logs.filter(l => l.mediaId === mediaId);
  },

  async addProgressLog(mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string): Promise<ProgressLog> {
     const newLog: ProgressLog = {
       id: uuidv4(),
       mediaId,
       timestamp: timestamp || new Date().toISOString(),
       metricType,
       delta,
       note
     };
     
     const res = await fetch('/api/logs', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(newLog)
     });
     if (!res.ok) throw new Error('Failed to add log');
     return res.json();
  }
};
