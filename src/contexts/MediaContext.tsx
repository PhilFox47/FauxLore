import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode, useRef } from 'react';
import { MediaItem, ProgressLog, MetricType, MediaType, Settings, Artifact, WorldBoss, OracleMessage, getMetricForType } from '../types/schema';
import { DatabaseService } from '../services/db';
import { calculateRPGState } from '../lib/rpgSystem';
import { generateText, getPersonaDescription } from '../services/nanoGptService';
import { getRecentMediaContext, buildTitleSystemPrompt, buildMainTitlePrompt } from '../lib/lorekeeperTitles';
import { useAuth } from './AuthContext';

interface MediaContextType {
  media: MediaItem[];
  logs: ProgressLog[];
  settings: Settings | null;
  rpgState: ReturnType<typeof calculateRPGState>;
  aiRecaps: any[];
  artifacts: Artifact[];
  worldBosses: WorldBoss[];
  oracleMessages: OracleMessage[];
  aiTextCache: Record<string, string>;
  taxonomies: any[];
  refreshData: () => Promise<void>;
  saveMediaItem: (item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }) => Promise<void>;
  deleteMediaItem: (id: string) => Promise<void>;
  addLog: (mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string, location?: string, isHistoric?: boolean, extraUpdates?: any) => Promise<void>;
  updateLog: (id: string, updates: Partial<ProgressLog>) => Promise<void>;
  deleteLog: (id: string) => Promise<void>;
  mergeLocations: (from: string[], to: string) => Promise<number>;
  refreshMetadata: (force?: boolean) => Promise<number>;
  notifications: any[];
  unreadNotifications: number;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  acknowledgeUpdate: (mediaId: string) => Promise<void>;
  saveAiRecap: (recap: any) => Promise<void>;
  saveArtifact: (artifact: Artifact) => Promise<void>;
  updateArtifact: (id: string, artifact: Partial<Artifact>) => Promise<void>;
  equipArtifact: (id: string, slot: string) => Promise<void>;
  unequipArtifact: (id: string) => Promise<void>;
  fetchOracleMessage: () => Promise<void>;
  saveAiText: (key: string, value: string) => Promise<void>;
  clearAiTextCache: (key?: string) => Promise<void>;
  addTaxonomy: (name: string, type: 'genre'|'tag') => Promise<void>;
  deleteTaxonomy: (id: string) => Promise<void>;
  moveTaxonomy: (id: string) => Promise<void>;
  editTaxonomy: (id: string, newName: string) => Promise<void>;
  franchises: any[];
  saveFranchise: (franchise: any) => Promise<void>;
  rerollBoss: (id: string) => Promise<void>;
  generateBossImage: (id: string) => Promise<void>;
  generateArtifactImage: (id: string) => Promise<void>;
  spawnBoss: (mediaType?: string) => Promise<void>;
  isLoading: boolean;
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

export const MediaProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [aiRecaps, setAiRecaps] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [worldBosses, setWorldBosses] = useState<WorldBoss[]>([]);
  const [oracleMessages, setOracleMessages] = useState<OracleMessage[]>([]);
  const [aiTextCache, setAiTextCache] = useState<Record<string, string>>({});
  const [taxonomies, setTaxonomies] = useState<any[]>([]);
  const [franchises, setFranchises] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Single source of truth for the current RPG state; consumers read this
  // instead of each recomputing the (expensive) calculation.
  const rpgState = useMemo(
    () => calculateRPGState(media, logs, settings, worldBosses, artifacts),
    [media, logs, settings, worldBosses, artifacts],
  );

  const unreadNotifications = useMemo(() => notifications.filter(n => !n.readAt).length, [notifications]);

  const refreshData = useCallback(async () => {
    if (!user) {
      setMedia([]);
      setLogs([]);
      setSettings(null);
      setAiRecaps([]);
      setArtifacts([]);
      setWorldBosses([]);
      setOracleMessages([]);
      setAiTextCache({});
      setTaxonomies([]);
      setFranchises([]);
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const [mediaData, logsData, settingsData, recapsData, artifactsData, bossesData, oracleData, textCacheData, taxData, franchisesData] = await Promise.all([
        DatabaseService.getAllMedia(),
        DatabaseService.getAllLogs(),
        DatabaseService.getSettings(),
        DatabaseService.getAiRecaps(),
        DatabaseService.getArtifacts(),
        DatabaseService.getWorldBosses(),
        DatabaseService.getOracleMessages(),
        DatabaseService.getAiTextCache(),
        DatabaseService.getTaxonomies(),
        DatabaseService.getAllFranchises()
      ]);
      setMedia(mediaData);
      setLogs(logsData);
      setSettings(settingsData);
      setAiRecaps(recapsData);
      setArtifacts(artifactsData);
      setWorldBosses(bossesData);
      setOracleMessages(oracleData);
      setAiTextCache(textCacheData);
      setTaxonomies(taxData);
      setFranchises(franchisesData);
      loadNotifications();
    } catch (error) {
      console.error("Failed to load data from server:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshData();
  }, [refreshData, user?.id]);

  // Auto-tagging runs on the server after a new entry is saved. Poll while any
  // entry is still pending so its genres and tags appear on their own.
  useEffect(() => {
    if (!media.some((m) => m.autoTagStatus === 'pending')) return;
    const timer = setInterval(() => { refreshData(); }, 8000);
    return () => clearInterval(timer);
  }, [media, refreshData]);

  const previousLevel = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading || !settings) return;

    const currentLevel = rpgState.level;

    if (previousLevel.current === null || previousLevel.current !== currentLevel) {
      if (settings.nanoGptApiKey) {
        const titleKey = `rpg_title_${currentLevel}`;
        
        // Generate if it's an actual level change, OR if it's the initial load and the title is missing
        if ((previousLevel.current !== null && previousLevel.current !== currentLevel) || !aiTextCache[titleKey]) {
          const ctx = getRecentMediaContext(media, logs, settings);
          const systemPrompt = buildTitleSystemPrompt(getPersonaDescription(settings.aiPersona));
          const titlePrompt = buildMainTitlePrompt({ level: currentLevel, context: ctx.text, dominantTitle: ctx.dominantTitle });

          generateText(settings.nanoGptApiKey, settings.nanoGptModel || 'gpt-4o-mini', systemPrompt, titlePrompt, 1.2)
            .then(titleRes => {
               DatabaseService.saveAiText(titleKey, titleRes).then(() => refreshData());
            })
            .catch(err => console.error("Auto generation of title failed", err));
        }
      }
    }
    
    previousLevel.current = currentLevel;
  }, [rpgState, settings, aiTextCache, isLoading, refreshData, media, logs]);

  const saveMediaItem = useCallback(async (item: Partial<MediaItem> & { title: string, mediaType: MediaType, status: MediaItem['status'] }) => {
    let oldMetricValue = 0;
    const metric = getMetricForType(item.mediaType);
    let existingItem: MediaItem | undefined;

    // Check for status change if editing an existing item
    if (item.id) {
      existingItem = media.find(m => m.id === item.id);
      if (existingItem) {
        if (existingItem.status !== item.status) {
          // Track status change in logs
          await DatabaseService.addProgressLog(
            item.id, 
            'statusChange', 
            0, 
            `Status changed from ${existingItem.status} to ${item.status}`,
            new Date().toISOString()
          );
        }
        if (metric) {
          oldMetricValue = Number(existingItem[metric as keyof MediaItem]) || 0;
        }
      }
    }

    const savedItem = await DatabaseService.saveMedia(item);

    // After saving, check if the numeric metric increased
    if (metric) {
      const newMetricValue = Number(item[metric as keyof MediaItem]) || 0;
      const delta = newMetricValue - oldMetricValue;
      if (delta > 0) {
        // Create a historical log for this change
        await DatabaseService.addProgressLog(
          savedItem.id,
          metric,
          delta, 
          "Initial Progress", 
          new Date('1970-01-01T00:00:00.000Z').toISOString(), 
          undefined, 
          true // isHistoric: true
        );
      }
    }
    
    await refreshData();
  }, [media, refreshData]);

  const deleteMediaItem = useCallback(async (id: string) => {
    await DatabaseService.deleteMedia(id);
    await refreshData();
  }, [refreshData]);

  const addLog = useCallback(async (mediaId: string, metricType: MetricType, delta: number, note?: string, timestamp?: string, location?: string, isHistoric?: boolean, extraUpdates?: any) => {
    await DatabaseService.addProgressLog(mediaId, metricType, delta, note, timestamp, location, isHistoric, extraUpdates);
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

  const loadNotifications = useCallback(async () => {
    setNotifications(await DatabaseService.getNotifications());
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    await DatabaseService.markNotificationRead(id);
    await loadNotifications();
  }, [loadNotifications]);

  const markAllNotificationsRead = useCallback(async () => {
    await DatabaseService.markAllNotificationsRead();
    await loadNotifications();
  }, [loadNotifications]);

  const deleteNotification = useCallback(async (id: string) => {
    await DatabaseService.deleteNotification(id);
    await loadNotifications();
  }, [loadNotifications]);

  const refreshMetadata = useCallback(async (force = false) => {
    const { updates } = await DatabaseService.refreshMetadata(force);
    await refreshData();
    return updates;
  }, [refreshData]);

  const acknowledgeUpdate = useCallback(async (mediaId: string) => {
    await DatabaseService.acknowledgeUpdate(mediaId);
    await refreshData();
  }, [refreshData]);

  const mergeLocations = useCallback(async (from: string[], to: string) => {
    const { updated } = await DatabaseService.mergeLocations(from, to);
    await refreshData();
    return updated;
  }, [refreshData]);

  const saveAiRecap = useCallback(async (recap: any) => {
    await DatabaseService.saveAiRecap(recap);
    await refreshData();
  }, [refreshData]);

  const saveArtifact = useCallback(async (artifact: Artifact) => {
    await DatabaseService.saveArtifact(artifact);
    await refreshData();
  }, [refreshData]);

  const updateArtifact = useCallback(async (id: string, artifact: Partial<Artifact>) => {
    await DatabaseService.updateArtifact(id, artifact);
    await refreshData();
  }, [refreshData]);

  const equipArtifact = useCallback(async (id: string, slot: string) => {
    await DatabaseService.equipArtifact(id, slot);
    await refreshData();
  }, [refreshData]);

  const unequipArtifact = useCallback(async (id: string) => {
    await DatabaseService.unequipArtifact(id);
    await refreshData();
  }, [refreshData]);

  const fetchOracleMessage = useCallback(async () => {
    await DatabaseService.generateOracleMessage();
    await refreshData();
  }, [refreshData]);

  const rerollBoss = useCallback(async (id: string) => {
    await DatabaseService.rerollBoss(id);
    await refreshData();
  }, [refreshData]);

  const generateBossImage = useCallback(async (id: string) => {
    await DatabaseService.generateBossImage(id);
    await refreshData();
  }, [refreshData]);

  const generateArtifactImage = useCallback(async (id: string) => {
    await DatabaseService.generateArtifactImage(id);
    await refreshData();
  }, [refreshData]);

  const spawnBoss = useCallback(async (mediaType?: string) => {
    await DatabaseService.spawnBoss(mediaType);
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

  const addTaxonomy = useCallback(async (name: string, type: 'genre'|'tag') => {
    await DatabaseService.addTaxonomy(name, type);
    await refreshData();
  }, [refreshData]);

  const deleteTaxonomy = useCallback(async (id: string) => {
    await DatabaseService.deleteTaxonomy(id);
    await refreshData();
  }, [refreshData]);

  const moveTaxonomy = useCallback(async (id: string) => {
    await DatabaseService.moveTaxonomy(id);
    await refreshData();
  }, [refreshData]);

  const editTaxonomy = useCallback(async (id: string, newName: string) => {
    await DatabaseService.editTaxonomy(id, newName);
    await refreshData();
  }, [refreshData]);

  const saveFranchise = useCallback(async (franchise: any) => {
    await DatabaseService.saveFranchise(franchise);
    await refreshData();
  }, [refreshData]);

  return (
    <MediaContext.Provider value={{ media, logs, settings, rpgState, aiRecaps, artifacts, worldBosses, oracleMessages, taxonomies, franchises, aiTextCache, refreshData, saveMediaItem, deleteMediaItem, addLog, updateLog, deleteLog, mergeLocations, refreshMetadata, acknowledgeUpdate, notifications, unreadNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, saveAiRecap, saveArtifact, updateArtifact, equipArtifact, unequipArtifact, fetchOracleMessage, rerollBoss, generateBossImage, generateArtifactImage, spawnBoss, saveAiText, clearAiTextCache, addTaxonomy, deleteTaxonomy, moveTaxonomy, editTaxonomy, saveFranchise, isLoading }}>
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
