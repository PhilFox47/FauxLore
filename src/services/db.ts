import { MediaItem, ProgressLog, MetricType, MediaType } from '../types/schema';
import { v4 as uuidv4 } from 'uuid';

export async function apiFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('fauxlore_token');
  const headers: any = {
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

/**
 * REST API client that interacts with our local Express SQLite server
 */
export const DatabaseService = {
  async getAllMedia(): Promise<MediaItem[]> {
    try {
      const res = await apiFetch('/api/media');
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async getMediaById(id: string): Promise<MediaItem | undefined> {
    try {
      const res = await apiFetch(`/api/media/${id}`);
      if (res.status === 404) return undefined;
      return res.json();
    } catch (e) {
      console.error(e);
      return undefined;
    }
  },

  async saveMedia(item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }): Promise<MediaItem> {
    const payload = item.id ? { ...item, updatedAt: new Date().toISOString() } : { ...item, id: uuidv4(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const res = await apiFetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error("Server save error:", errorData);
      throw new Error(`Failed to save media: ${errorData.error || res.statusText}`);
    }
    return res.json();
  },

  async deleteMedia(id: string): Promise<void> {
    await apiFetch(`/api/media/${id}`, { method: 'DELETE' });
  },

  async getAllLogs(): Promise<ProgressLog[]> {
    try {
      const res = await apiFetch('/api/logs');
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

  async addProgressLog(mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string, location?: string, isHistoric?: boolean): Promise<ProgressLog> {
     const newLog: ProgressLog = {
       id: uuidv4(),
       mediaId,
       timestamp: timestamp || new Date().toISOString(),
       metricType,
       delta,
       note,
       location,
       isHistoric
     };
     
     const res = await apiFetch('/api/logs', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(newLog)
     });
     if (!res.ok) throw new Error('Failed to add log');
     return res.json();
  },

  async updateProgressLog(id: string, updates: Partial<ProgressLog>): Promise<ProgressLog> {
    const res = await apiFetch(`/api/logs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Failed to update log');
    return res.json();
  },

  async deleteProgressLog(id: string): Promise<void> {
    const res = await apiFetch(`/api/logs/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete log');
  },

  async getSettings(): Promise<any> {
    try {
      const authRes = await apiFetch('/api/auth/me');
      if (!authRes.ok) return {}; // Not logged in

      const res = await apiFetch('/api/settings');
      const sysRes = await apiFetch('/api/system-settings');
      let combined = {};
      if (res.ok) {
         combined = await res.json();
      }
      if (sysRes.ok) {
         const sys = await sysRes.json();
         combined = { ...sys, ...combined }; // user settings overwrite system where applicable, ideally sys has the api keys
      }
      return combined;
    } catch (e) {
      console.error(e);
      return {};
    }
  },

  async saveSettings(settings: any): Promise<any> {
    const res = await apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    
    // Attempt saving system settings too if we are admin
    try {
      const authRes = await apiFetch('/api/auth/me');
      if (authRes.ok) {
         const authData = await authRes.json();
         if (authData.user?.role === 'Admin') {
            await apiFetch('/api/system-settings', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(settings)
            });
         }
      }
    } catch(e) {}

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(`Failed to save settings: ${errorData.error || res.statusText}`);
    }
    return res.json();
  },

  async getAiRecaps(): Promise<any[]> {
    try {
      const res = await apiFetch('/api/recaps');
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async saveAiRecap(recap: any): Promise<void> {
    const res = await apiFetch('/api/recaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recap)
    });
    if (!res.ok) throw new Error('Failed to save AI recap');
  },

  async getAiTextCache(): Promise<Record<string, string>> {
    try {
      const res = await apiFetch('/api/ai-text');
      if (!res.ok) return {};
      return res.json();
    } catch (e) {
      console.error(e);
      return {};
    }
  },

  async saveAiText(key: string, value: string): Promise<void> {
    const res = await apiFetch('/api/ai-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    if (!res.ok) throw new Error('Failed to save AI text');
  },
  
  async clearAiText(key?: string): Promise<void> {
    const url = key ? `/api/ai-text?key=${encodeURIComponent(key)}` : '/api/ai-text';
    const res = await apiFetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to clear AI text');
  },

  async getArtifacts(): Promise<any[]> {
    try {
      const res = await apiFetch('/api/artifacts');
      if (!res.ok) return [];
      return res.json();
    } catch(e) {
      console.error(e);
      return [];
    }
  },

  async saveArtifact(artifact: any): Promise<void> {
    const res = await apiFetch('/api/artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(artifact)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to save artifact: ${text}`);
    }
  },

  async createBackup(): Promise<any> {
    const res = await apiFetch('/api/backup', {
      method: 'POST',
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(`Backup failed: ${errorData.error || res.statusText}`);
    }
    return res.json();
  },

  async getTaxonomies(type?: 'genre' | 'tag'): Promise<any[]> {
    try {
      const url = type ? `/api/taxonomy?type=${type}` : '/api/taxonomy';
      const res = await apiFetch(url);
      if (!res.ok) return [];
      return res.json();
    } catch(e) {
      console.error(e);
      return [];
    }
  },

  async addTaxonomy(name: string, type: 'genre' | 'tag'): Promise<any> {
    const res = await apiFetch('/api/taxonomy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type })
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(`Failed to add taxonomy: ${errorData.error || res.statusText}`);
    }
    return res.json();
  },

  async deleteTaxonomy(id: string): Promise<void> {
    const res = await apiFetch(`/api/taxonomy/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(`Failed to delete taxonomy: ${errorData.error || res.statusText}`);
    }
  },

  async getAllFranchises() {
    try {
      const res = await apiFetch('/api/franchises');
      if (!res.ok) return [];
      return res.json();
    } catch { return []; }
  },

  async saveFranchise(franchise: any) {
    const res = await apiFetch('/api/franchises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(franchise)
    });
    if (!res.ok) throw new Error("Failed to save franchise");
    return res.json();
  }
};
