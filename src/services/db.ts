import { MediaItem, ProgressLog, MetricType, MediaType, Artifact, MediaCodex } from '../types/schema';
import type { FlavorText } from '../lib/flavorTexts';
import type { GeneratedAchievement, AchievementDraft, AchievementPeriod } from '../lib/generatedAchievements';
import type { WrappedStory } from './wrappedAi';
import type { WrappedEditorialMemoryItem } from '../lib/wrappedEditorialMemory';
import { v4 as uuidv4 } from 'uuid';
import { FAUXLORE_RUNTIME_BUILD } from '../lib/runtimeBuild';

/** See `getEarnedFlavorTexts`. Short enough that finishing something shows up. */
const FLAVOR_TTL_MS = 60_000;
let flavorCache: { at: number; value: Record<string, FlavorText[]> } | null = null;

export async function apiFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('fauxlore_token');
  const headers: any = {
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // The server's wrapped-generation audit can identify a browser bundle that
  // was never updated, even if the container hosting the backend was.
  headers['X-FauxLore-Client-Build'] = FAUXLORE_RUNTIME_BUILD;
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


  async getLorebookOpinions(): Promise<import('../lib/lorebookReviewEvents').LorebookOpinionSnapshot[]> {
    const res = await apiFetch('/api/media/lorebook-opinions');
    if (!res.ok) throw new Error('Could not load Lorebook reviews (' + res.status + ')');
    return res.json();
  },

  async getMediaOpinionHistory(ids: string[]): Promise<import('../lib/mediaOpinionHistory').MediaOpinionSnapshot[]> {
    const uniqueIds = [...new Set(ids)];
    const history: import('../lib/mediaOpinionHistory').MediaOpinionSnapshot[] = [];
    for (let index = 0; index < uniqueIds.length; index += 100) {
      const chunk = uniqueIds.slice(index, index + 100);
      const res = await apiFetch('/api/media/opinion-history?ids=' + encodeURIComponent(chunk.join(',')));
      if (!res.ok) throw new Error('Could not load historical review data (' + res.status + ')');
      history.push(...await res.json());
    }
    return history;
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
    const payload = item.id ? { ...item } : { ...item, id: uuidv4(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
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

  async addProgressLog(mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string, location?: string, isHistoric?: boolean, extraUpdates?: any): Promise<ProgressLog> {
     const newLog: any = {
       id: uuidv4(),
       mediaId,
       timestamp: timestamp || new Date().toISOString(),
       metricType,
       delta,
       note,
       location,
       isHistoric,
       ...extraUpdates
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

  async getNotifications(): Promise<any[]> {
    try {
      const res = await apiFetch('/api/notifications');
      if (!res.ok) return [];
      return res.json();
    } catch { return []; }
  },

  async checkNotifications(): Promise<{ created: number }> {
    const res = await apiFetch('/api/notifications/check', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to check notifications');
    return res.json();
  },

  async markNotificationRead(id: string): Promise<void> {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
  },

  async markAllNotificationsRead(): Promise<void> {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
  },

  async deleteNotification(id: string): Promise<void> {
    await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
  },

  async refreshMetadata(force = false): Promise<{ updates: number }> {
    const res = await apiFetch(`/api/metadata/refresh${force ? '?force=1' : ''}`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to refresh metadata');
    return res.json();
  },

  async acknowledgeUpdate(mediaId: string): Promise<void> {
    const res = await apiFetch(`/api/media/${mediaId}/acknowledge-update`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to acknowledge update');
  },

  async refreshMangaCover(mediaId: string): Promise<void> {
    const res = await apiFetch(`/api/media/${mediaId}/refresh-manga-cover`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to fetch manga covers');
    }
  },

  async mergeLocations(from: string[], to: string): Promise<{ updated: number }> {
    const res = await apiFetch('/api/logs/merge-locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to })
    });
    if (!res.ok) throw new Error('Failed to merge locations');
    return res.json();
  },

  /** Image bytes never pass through the public /uploads directory. */
  async getVisualSelfReference(): Promise<Blob | null> {
    const res = await apiFetch('/api/settings/visual-reference', {cache: 'no-store'});
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Could not load your face reference.');
    return await res.blob();
  },

  async uploadVisualSelfReference(file: File): Promise<void> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Please use a JPEG, PNG or WebP photo.');
    }
    if (!file.size || file.size > 4 * 1024 * 1024) {
      throw new Error('Reference photo must be smaller than 4 MB.');
    }
    const res = await apiFetch('/api/settings/visual-reference', {
      method: 'PUT',
      headers: {'Content-Type': file.type},
      body: file,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || 'Could not upload face reference.');
    }
  },

  async deleteVisualSelfReference(): Promise<void> {
    const res = await apiFetch('/api/settings/visual-reference', {method: 'DELETE'});
    if (!res.ok) throw new Error('Could not delete face reference.');
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
         // user settings overwrite system where applicable, but ignore nulls/empties
         const merged: any = { ...sys };
         for (const [k, v] of Object.entries(combined)) {
            if (v !== null && v !== undefined && v !== '') {
               merged[k] = v;
            }
         }
         combined = merged;
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
            const sysRes = await apiFetch('/api/system-settings', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(settings)
            });
            if (!sysRes.ok) {
              const detail = await sysRes.json().catch(() => ({}));
              throw new Error(detail.error || 'Failed to save global AI settings.');
            }
         }
      }
    } catch(e) {
      throw e instanceof Error ? e : new Error('Failed to save system settings.');
    }

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

  /** Wrapped is persisted entirely separately from the prose recap. */
  async getWrappedStory(timeframe: 'week' | 'month' | 'year', timeId: string): Promise<WrappedStory | null> {
    const res = await apiFetch('/api/wrapped/' + timeframe + '/' + encodeURIComponent(timeId));
    if (!res.ok) throw new Error('Could not load Wrapped story (' + res.status + ')');
    return res.json();
  },

  /** Only call during a user-initiated Wrapped generation, not navigation. */
  async getWrappedEditorialMemory(
    timeframe:'week'|'month'|'year',timeId:string,mediaIds:string[]=[],
  ):Promise<WrappedEditorialMemoryItem[]> {
    const ids=[...new Set(mediaIds)].slice(0,120);
    const res=await apiFetch('/api/wrapped/'+timeframe+'/'+encodeURIComponent(timeId)+
      '/editorial-memory?ids='+encodeURIComponent(ids.join(',')),{cache:'no-store'});
    if(!res.ok) throw new Error('Could not read editorial memory ('+res.status+')');
    const data=await res.json();
    return Array.isArray(data?.memory)?data.memory:[];
  },

  /** Requires an explicit user action. Never invoke from loading effects. */
  async requestWrappedManualIntent(timeframe: 'week' | 'month' | 'year', timeId: string): Promise<string> {
    const res = await apiFetch('/api/wrapped/' + timeframe + '/' + encodeURIComponent(timeId) + '/intent', {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || 'Could not authorize manual Wrapped generation');
    }
    const result = await res.json();
    return result.intentId;
  },

  async startWrappedGeneration(timeframe: 'week' | 'month' | 'year', timeId: string, intentId: string): Promise<string> {
    const res = await apiFetch('/api/wrapped/' + timeframe + '/' + encodeURIComponent(timeId) + '/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intentId }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || 'Could not start Wrapped generation');
    }
    const result = await res.json();
    return result.requestId;
  },

  async saveWrappedStory(timeframe: 'week' | 'month' | 'year', timeId: string,
    requestId: string, story: WrappedStory): Promise<WrappedStory> {
    const res = await apiFetch('/api/wrapped/' + timeframe + '/' + encodeURIComponent(timeId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId, story,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || 'Could not save Wrapped story (' + res.status + ')');
    }
    return res.json();
  },

  /** Regenerates only the persisted Wrapped cover, not its editorial story. */
  async regenerateWrappedCover(timeframe: 'week' | 'month' | 'year', timeId: string): Promise<WrappedStory> {
    const res = await apiFetch('/api/wrapped/' + timeframe + '/' + encodeURIComponent(timeId) + '/cover', {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || 'Could not generate Wrapped cover (' + res.status + ')');
    }
    return res.json();
  },

  /** Save only an AI-composed scene design with revision protection. */
  async saveWrappedVisualCompositions(
    timeframe: 'week' | 'month' | 'year', timeId: string,
    generatedAt: string, visualRevision: number,
    compositions: Array<{ sceneId: string; composition: unknown }>,
  ): Promise<WrappedStory> {
    const res = await apiFetch('/api/wrapped/' + timeframe + '/' + encodeURIComponent(timeId) + '/scenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generatedAt, visualRevision, compositions }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || 'Could not save custom scene visuals (' + res.status + ')');
    }
    return res.json();
  },

  /** Redraw only the non-opening cinematic scene illustrations. */
  async regenerateWrappedSceneArt(timeframe: 'week' | 'month' | 'year', timeId: string): Promise<WrappedStory> {
    const res = await apiFetch('/api/wrapped/' + timeframe + '/' + encodeURIComponent(timeId) + '/scene-art', { method: 'POST' });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || 'Could not regenerate chapter artwork (' + res.status + ')');
    }
    return res.json();
  },

  async getGeneratedAchievements(): Promise<GeneratedAchievement[]> {
    const res = await apiFetch('/api/achievements');
    if (!res.ok) throw new Error('Failed to load achievements');
    return res.json();
  },

  async saveGeneratedAchievements(data: {
    timeframe: AchievementPeriod; timeId: string; generationId: string | null; achievements: AchievementDraft[];
  }): Promise<void> {
    const res = await apiFetch('/api/achievements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.error || 'Failed to save achievements');
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

  /**
   * Re-runs auto-tagging for an existing entry and returns the terms written.
   * New entries are tagged by the server automatically on creation; this is the
   * manual retry from the Edit view.
   */
  async autoTagMedia(mediaId: string): Promise<{ genres: string[]; tags: string[] }> {
    const res = await apiFetch(`/api/media/${mediaId}/auto-tag`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Auto-tagging failed');
    }
    return res.json();
  },

  /** The Codex on record for a media entry, or null if it has never been researched. */
  async getCodex(mediaId: string): Promise<MediaCodex | null> {
    try {
      const res = await apiFetch(`/api/media/${mediaId}/codex`);
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  /**
   * Returns a media's Codex, researching it first if it has none. Works for an
   * entry that has not been saved yet (Auto Tag from the Add Media form) by
   * passing a title and type instead of an id.
   */
  async ensureCodex(subject: {
    mediaId?: string; title?: string; mediaType?: string;
    /** Throw the dossier away and research from scratch. */
    force?: boolean;
    /** Research again and ADD to what is already there. */
    expand?: boolean;
  }): Promise<MediaCodex> {
    const res = await apiFetch('/api/codex/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subject)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to compile the Codex');
    }
    return res.json();
  },

  /** Start long-running staged research without holding the HTTP request open. */
  async startCodex(subject: { mediaId: string; force?: boolean; expand?: boolean }): Promise<void> {
    const res = await apiFetch(`/api/media/${encodeURIComponent(subject.mediaId)}/codex/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: !!subject.force, expand: !!subject.expand }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to start Codex research');
    }
  },

  /**
   * Every line this user may see under a library title, keyed by media type:
   * the global starter set plus whatever their own Codexes have earned, with the
   * earned ones flagged.
   *
   * Cached briefly rather than per-session: it changes only when something is
   * finished or a Codex is compiled, so re-fetching on every library visit is
   * waste, but never re-fetching would hide a work the user just completed.
   */
  async getFlavorTexts(): Promise<Record<string, FlavorText[]>> {
    const now = Date.now();
    if (flavorCache && now - flavorCache.at < FLAVOR_TTL_MS) return flavorCache.value;
    try {
      const res = await apiFetch('/api/flavor-texts');
      if (!res.ok) return flavorCache?.value || {};
      const value = await res.json();
      flavorCache = { at: now, value: value || {} };
      return flavorCache.value;
    } catch (e) {
      console.error(e);
      return flavorCache?.value || {};
    }
  },

  /** Reading a saved portrait is side-effect free and never generates anything. */
  async getArmoryPortraitStatus(): Promise<{
    status: 'idle' | 'generating' | 'done' | 'failed';
    hasImage: boolean; stale: boolean; updatedAt: string | null;
    error: string | null; equippedCount: number; hasFaceReference: boolean; referenceCount: number;
  }> {
    const res = await apiFetch('/api/armory/portrait', {cache:'no-store'});
    if (!res.ok) throw new Error('Could not load Armory portrait status.');
    return res.json();
  },

  async getArmoryPortraitImage(): Promise<Blob | null> {
    const res = await apiFetch('/api/armory/portrait/image', {cache:'no-store'});
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Could not load Armory portrait image.');
    return res.blob();
  },

  async generateArmoryPortrait(): Promise<void> {
    const res = await apiFetch('/api/armory/portrait/generate',{method:'POST'});
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.message || error.error || 'Could not start character portrait.');
    }
  },

  async getArtifacts(): Promise<Artifact[]> {
    try {
      const res = await apiFetch('/api/artifacts');
      if (!res.ok) return [];
      return res.json();
    } catch(e) {
      console.error(e);
      return [];
    }
  },

  async equipArtifact(id: string, slot: string): Promise<void> {
    const res = await apiFetch(`/api/artifacts/${id}/equip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot })
    });
    if (!res.ok) throw new Error('Failed to equip artifact');
  },

  async unequipArtifact(id: string): Promise<void> {
    const res = await apiFetch(`/api/artifacts/${id}/unequip`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to unequip artifact');
  },

  async getWorldBosses(): Promise<any[]> {
    try {
      const res = await apiFetch('/api/world-bosses');
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async spawnBoss(mediaType?: string): Promise<any[]> {
    const res = await apiFetch('/api/world-bosses/spawn', { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mediaType })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to spawn boss');
    }
    return res.json();
  },

  /** Goads an enemy into staying another week — bigger, and worth more either way. */
  async tauntBoss(id: string): Promise<any> {
    const res = await apiFetch(`/api/world-bosses/${id}/taunt`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || 'Could not taunt that enemy.');
    }
    return res.json();
  },

  async rerollBoss(id: string): Promise<void> {
    await apiFetch(`/api/world-bosses/${id}/reroll`, { method: 'POST' });
  },

  async generateBossImage(id: string): Promise<void> {
    await apiFetch(`/api/world-bosses/${id}/generate-image`, { method: 'POST' });
  },

  async generateArtifactImage(id: string): Promise<void> {
    await apiFetch(`/api/artifacts/${id}/generate-image`, { method: 'POST' });
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

  async updateArtifact(id: string, artifact: any): Promise<void> {
    const res = await apiFetch(`/api/artifacts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(artifact)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to update artifact: ${text}`);
    }
  },

  /** Rendered Codex text for entries that already have one. Never generates. */
  async getCodexPromptBlocks(mediaIds: string[], task?: "wrapped"): Promise<Record<string, string>> {
    try {
      if (!mediaIds.length) return {};
      const res = await apiFetch('/api/codex/prompt-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaIds, task }),
      });
      if (!res.ok) return {};
      return res.json();
    } catch (e) {
      return {};
    }
  },

  async getLocationGroups(): Promise<any[]> {
    try {
      const res = await apiFetch('/api/location-groups');
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async saveLocationGroup(group: { id?: string; name: string; color?: string | null; icon?: string | null; locations?: string[] }): Promise<any> {
    const res = await apiFetch('/api/location-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(group),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || 'Failed to save the group');
    }
    return res.json();
  },

  async setLocationGroupMembers(id: string, locations: string[]): Promise<any> {
    const res = await apiFetch(`/api/location-groups/${id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
    });
    if (!res.ok) throw new Error('Failed to update the group');
    return res.json();
  },

  async deleteLocationGroup(id: string): Promise<void> {
    const res = await apiFetch(`/api/location-groups/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete the group');
  },

  /** Whether this account is paused for inactivity, and since when. */
  async getActivity(): Promise<{ frozen: boolean; lastLogAt: string | null; daysSince: number | null; inactivityDays: number } | null> {
    try {
      const res = await apiFetch('/api/activity');
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      return null;
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

  async editTaxonomy(id: string, newName: string): Promise<void> {
    const res = await apiFetch(`/api/taxonomy/${id}/edit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName })
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(`Failed to edit taxonomy: ${errorData.error || res.statusText}`);
    }
  },

  async moveTaxonomy(id: string): Promise<void> {
    const res = await apiFetch(`/api/taxonomy/${id}/move`, { method: 'PUT' });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(`Failed to move taxonomy: ${errorData.error || res.statusText}`);
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
