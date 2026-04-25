import { MediaItem, ProgressLog, Settings, MEDIA_TYPES } from '../types/schema';
import { calculateScaledDelta } from './scaling';
import { differenceInDays, parseISO, isSameDay, getHours } from 'date-fns';
import { mulberry32 } from './rpgSystem';

export interface RecapAnalyticsData {
  timeScale: 'week' | 'month' | 'year';
  logs: ProgressLog[];
  media: MediaItem[];
  allMedia: MediaItem[]; // Even ones untouched in the period, useful for backlog
  settings?: Settings | null;
}

export function analyzeSunkCost(data: RecapAnalyticsData) {
  // Find media with high master pages, but userRating <= 4 (or lowest relative rating)
  const masterPages: Record<string, number> = {};
  data.logs.forEach(l => {
    const m = data.allMedia.find(x => x.id === l.mediaId);
    if (m) masterPages[m.id] = (masterPages[m.id] || 0) + calculateScaledDelta(l.delta, m, data.settings);
  });

  let worst: { media: MediaItem, pages: number } | null = null;
  
  for (const media of data.media) {
    if (media.userRating && media.userRating <= 5 && masterPages[media.id] > 50) {
       if (!worst || masterPages[media.id] > worst.pages) {
          worst = { media, pages: masterPages[media.id] };
       }
    }
  }
  return worst;
}

export function analyzeContrarian(data: RecapAnalyticsData) {
  // Find largest difference between userRating (1-10) and reviewScore (1-100)
  let biggestDiff = -1;
  let contrarianMedia: { media: MediaItem, diff: number, type: 'hated' | 'loved' } | null = null;

  for (const m of data.media) {
    if (m.userRating && m.reviewScore) {
      const normalizedCritic = m.reviewScore / 10;
      const difference = Math.abs(m.userRating - normalizedCritic);
      if (difference > biggestDiff && difference >= 2) {
        biggestDiff = difference;
        contrarianMedia = { media: m, diff: difference, type: m.userRating > normalizedCritic ? 'loved' : 'hated' };
      }
    }
  }
  return contrarianMedia;
}

export function analyzeHabits(data: RecapAnalyticsData) {
  if (data.logs.length === 0) return null;
  
  const hourCounts = Array(24).fill(0);
  const dayCounts = Array(7).fill(0); // 0 = Sunday
  
  data.logs.forEach(l => {
    const d = new Date(l.timestamp);
    hourCounts[d.getHours()]++;
    dayCounts[d.getDay()]++;
  });

  // Calculate generic shifts
  const night = hourCounts.slice(22, 24).reduce((a,b)=>a+b, 0) + hourCounts.slice(0, 4).reduce((a,b)=>a+b, 0); // 10pm - 4am
  const morning = hourCounts.slice(5, 10).reduce((a,b)=>a+b, 0); // 5am - 10am
  const afternoon = hourCounts.slice(12, 17).reduce((a,b)=>a+b, 0); // 12pm - 5pm
  const evening = hourCounts.slice(17, 22).reduce((a,b)=>a+b, 0); // 5pm - 10pm

  const total = data.logs.length;
  let profile = 'Chaotic Neutral';
  let desc = 'You consume media at literally any hour unpredictably.';
  
  if ((night / total) > 0.4) { profile = 'Night Owl'; desc = 'You thrive in the dark.'; }
  else if ((morning / total) > 0.4) { profile = 'Early Bird'; desc = 'Dawn is your domain.'; }
  else if ((afternoon / total) > 0.4) { profile = 'Daywalker'; desc = 'Prime daytime consumer.'; }
  else if ((evening / total) > 0.4) { profile = 'Evening Wind-Down'; desc = 'Prime evening consumer.'; }

  return { 
    profile, 
    desc, 
    hourCounts, 
    dayCounts,
    timeSegments: { night, morning, afternoon, evening }
  };
}

export function analyzeSessionVelocity(data: RecapAnalyticsData) {
  if (data.logs.length === 0) return null;
  
  // Sort logs by timestamp ascending
  const sortedLogs = [...data.logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const sessions: number[] = [];
  
  if (sortedLogs.length > 0) {
    let currentSession = {
      mediaId: sortedLogs[0].mediaId,
      totalPages: calculateScaledDelta(sortedLogs[0].delta, data.allMedia.find(x => x.id === sortedLogs[0].mediaId), data.settings),
      lastTimestamp: new Date(sortedLogs[0].timestamp).getTime()
    };

    for (let i = 1; i < sortedLogs.length; i++) {
      const log = sortedLogs[i];
      const logTimestamp = new Date(log.timestamp).getTime();
      const m = data.allMedia.find(x => x.id === log.mediaId);
      const pages = calculateScaledDelta(log.delta, m, data.settings);
      
      const hoursDiff = (logTimestamp - currentSession.lastTimestamp) / (1000 * 60 * 60);
      
      // If same media AND less than 5 hours since last log of this session
      if (log.mediaId === currentSession.mediaId && hoursDiff < 5) {
        currentSession.totalPages += pages;
        currentSession.lastTimestamp = logTimestamp;
      } else {
        // Push finished session and start new one
        sessions.push(currentSession.totalPages);
        currentSession = {
          mediaId: log.mediaId,
          totalPages: pages,
          lastTimestamp: logTimestamp
        };
      }
    }
    // Push the last session
    sessions.push(currentSession.totalPages);
  }
  
  const avg = sessions.reduce((a,b) => a+b, 0) / (sessions.length || 1);
  const max = sessions.length > 0 ? Math.max(...sessions) : 0;
  
  // Categorize
  const snippets = sessions.filter(s => s < 10).length;
  const standard = sessions.filter(s => s >= 10 && s < 50).length;
  const binges = sessions.filter(s => s >= 50).length;
  
  return { avg, max, bins: { snippets, standard, binges }, total: sessions.length };
}

export function analyzeMediaDNA(data: RecapAnalyticsData) {
  const traitCounts: Record<string, number> = {};
  const genreCounts: Record<string, number> = {};
  
  data.logs.forEach(l => {
    const m = data.allMedia.find(x => x.id === l.mediaId);
    if (!m) return;
    const weight = calculateScaledDelta(l.delta, m, data.settings);
    
    // Mix tags and tropes to create "DNA"
    const traits = [...(m.tags || []), ...(m.tropes || [])];
    traits.forEach(t => {
       traitCounts[t] = (traitCounts[t] || 0) + weight;
    });

    if (m.genres && m.genres.length > 0) {
      m.genres.forEach(g => {
        genreCounts[g] = (genreCounts[g] || 0) + weight;
      });
    }
  });

  return {
    traits: Object.entries(traitCounts).sort((a,b) => b[1] - a[1]).slice(0, 10),
    genres: Object.entries(genreCounts).sort((a,b) => b[1] - a[1]).slice(0, 5)
  };
}

export function analyzeBingeFactor(data: RecapAnalyticsData) {
  let bestBinge: { media: MediaItem, hours: number } | null = null;
  let minDiffHours = Infinity;

  data.media.filter(m => m.status === 'Completed').forEach(m => {
    const itemLogs = data.logs.filter(l => l.mediaId === m.id).sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (itemLogs.length >= 2) {
      const first = new Date(itemLogs[0].timestamp);
      const last = new Date(itemLogs[itemLogs.length - 1].timestamp); // Assumes last log was completion
      
      const hours = (last.getTime() - first.getTime()) / (1000 * 60 * 60);
      // Ensure its a meaningful binge (e.g., > 30 master pages)
      const pages = itemLogs.reduce((acc, l) => acc + calculateScaledDelta(l.delta, m, data.settings), 0);
      
      if (pages > 50 && hours < minDiffHours && hours > 0) {
        minDiffHours = hours;
        bestBinge = { media: m, hours };
      }
    }
  });

  return bestBinge;
}

export function analyzeGraveyard(data: RecapAnalyticsData) {
  const droppedWithinPeriod = data.media.filter(m => m.status === 'Dropped');
  
  // Find "Active" items not touched in 90 days (if year view) or 30 days (if month view)
  const staleThresholdDays = data.timeScale === 'year' ? 90 : 30;
  
  const activeItems = data.allMedia.filter(m => m.status === 'Active');
  const staleItems: MediaItem[] = [];
  
  const now = new Date();
  activeItems.forEach(m => {
     const itemLogs = data.logs.filter(l => l.mediaId === m.id).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
     if (itemLogs.length > 0) {
        const lastLog = new Date(itemLogs[0].timestamp);
        if (differenceInDays(now, lastLog) >= staleThresholdDays) {
           staleItems.push(m);
        }
     } else if (differenceInDays(now, new Date(m.createdAt)) >= staleThresholdDays) {
        staleItems.push(m);
     }
  });

  return { dropped: droppedWithinPeriod, stale: staleItems };
}

export function analyzeBacklog(data: RecapAnalyticsData) {
   // Items CREATED in this period vs Items COMPLETED in this time period
   const added = data.allMedia.filter(m => new Date(m.createdAt) >= new Date(data.logs[data.logs.length-1]?.timestamp || 0)); // Approx boundary if needed, wait, better to use the exact bounds passed from Recap.tsx
   // Since data.media is already filtered by activity... we should calculate backlog growth strictly on active logs
   
   // For now, we will just compare statuses of the media touched
   let completed = 0;
   let planned = 0;
   
   data.media.forEach(m => {
      if (m.status === 'Completed') completed++;
      if (m.status === 'Planning') planned++; // Still in planning despite being "active" (e.g. just added to list recently)
   });

   return { completed, planned, net: planned - completed };
}

export function analyzeTimeTraveler(data: RecapAnalyticsData) {
   let totalYears = 0;
   let validCount = 0;
   
   data.media.forEach(m => {
      if (m.year) {
         totalYears += m.year;
         validCount++;
      }
   });

   if (validCount === 0) return null;
   const avg = Math.round(totalYears / validCount);
   return avg;
}

export function extractJournals(data: RecapAnalyticsData) {
  const journals: { note: string, media: MediaItem, date: string }[] = [];
  data.logs.forEach(l => {
     if (l.note && l.note.length > 10) {
        const m = data.allMedia.find(x => x.id === l.mediaId);
        if (m) journals.push({ note: l.note, media: m, date: l.timestamp });
     }
  });
  
  // Sort by length or just return random/longest
  return journals.sort((a, b) => b.note.length - a.note.length).slice(0, 5);
}

export function calculateLongestStreak(data: RecapAnalyticsData) {
  if (data.logs.length === 0) return 0;
  const uniqueDates = Array.from(new Set(data.logs.map(l => l.timestamp.split('T')[0]))).sort();
  if (uniqueDates.length === 0) return 0;

  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < uniqueDates.length; i++) {
    const d1 = parseISO(uniqueDates[i-1]);
    const d2 = parseISO(uniqueDates[i]);
    if (differenceInDays(d2, d1) === 1) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 1;
    }
  }

  return maxStreak;
}

// -------------------------------------------------------------
// Archetypes Engine
// -------------------------------------------------------------
const ARCHETYPES = [
  { id: '1', name: 'The Weeb', conditions: (data: RecapAnalyticsData, stats: any) => (stats.typeShares['Manga'] || 0) + (stats.typeShares['Visual Novel'] || 0) > 0.6 },
  { id: '2', name: 'The Bookworm', conditions: (data: RecapAnalyticsData, stats: any) => (stats.typeShares['Book'] || 0) > 0.7 },
  { id: '3', name: 'The Gamer', conditions: (data: RecapAnalyticsData, stats: any) => (stats.typeShares['Game'] || 0) > 0.7 },
  { id: '4', name: 'The Completionist', conditions: (data: RecapAnalyticsData, stats: any) => stats.completionRate > 0.7 && stats.droppedCount === 0 },
  { id: '5', name: 'The Plate Spinner', conditions: (data: RecapAnalyticsData, stats: any) => stats.activeConcurrent >= 5 },
  { id: '6', name: 'The Retro Scavenger', conditions: (data: RecapAnalyticsData, stats: any) => stats.avgYear > 0 && stats.avgYear < 2010 },
  { id: '7', name: 'The Trendsetter', conditions: (data: RecapAnalyticsData, stats: any) => stats.avgYear > 0 && stats.avgYear >= new Date().getFullYear() - 1 },
  { id: '8', name: 'The Hater', conditions: (data: RecapAnalyticsData, stats: any) => stats.avgRating > 0 && stats.avgRating <= 4 },
  { id: '9', name: 'The Lover', conditions: (data: RecapAnalyticsData, stats: any) => stats.avgRating >= 8 },
  { id: '10', name: 'The Cinematic Soul', conditions: (data: RecapAnalyticsData, stats: any) => (stats.typeShares['Movie'] || 0) > 0.7 },
  { id: '11', name: 'The Serial Watcher', conditions: (data: RecapAnalyticsData, stats: any) => (stats.typeShares['Series'] || 0) > 0.7 },
  { id: '12', name: 'The Marathon Runner', conditions: (data: RecapAnalyticsData, stats: any) => stats.maxStreak >= 14 },
  { id: '13', name: 'The Drip Feeder', conditions: (data: RecapAnalyticsData, stats: any) => stats.avgPagesPerLog < 10 },
  { id: '14', name: 'The Hyper-Fixator', conditions: (data: RecapAnalyticsData, stats: any) => stats.topMediaShare > 0.6 },
  { id: '15', name: 'The Omnivore', conditions: (data: RecapAnalyticsData, stats: any) => Object.keys(stats.typeShares).length >= 4 && Object.values(stats.typeShares).every(s => (s as number) > 0.1) },
  { id: '16', name: 'The Sunk Cost Victim', conditions: (data: RecapAnalyticsData, stats: any) => !!analyzeSunkCost(data) },
  { id: '17', name: 'The Contrarian', conditions: (data: RecapAnalyticsData, stats: any) => !!analyzeContrarian(data) },
  { id: '18', name: 'The Hoarder', conditions: (data: RecapAnalyticsData, stats: any) => analyzeBacklog(data).net > 15 },
  { id: '19', name: 'The Gravedigger', conditions: (data: RecapAnalyticsData, stats: any) => analyzeGraveyard(data).dropped.length >= 5 },
  { id: '20', name: 'The Night Owl', conditions: (data: RecapAnalyticsData, stats: any) => analyzeHabits(data)?.profile === 'Night Owl' },
];

export function determineArchetypes(data: RecapAnalyticsData) {
   // Pre-calculate useful stats for the rules engine
   let totalMasterPages = 0;
   const typePages: Record<string, number> = {};
   const mediaPages: Record<string, number> = {};
   let ratingSum = 0;
   let ratingCount = 0;
   let activeConcurrent = 0;

   data.logs.forEach(l => {
      const m = data.allMedia.find(x => x.id === l.mediaId);
      if (m) {
         const pages = calculateScaledDelta(l.delta, m, data.settings);
         totalMasterPages += pages;
         typePages[m.mediaType] = (typePages[m.mediaType] || 0) + pages;
         mediaPages[m.id] = (mediaPages[m.id] || 0) + pages;
      }
   });

   data.media.forEach(m => {
      if (m.userRating) { ratingSum += m.userRating; ratingCount++; }
      if (m.status === 'Active') activeConcurrent++;
   });

   const typeShares: Record<string, number> = {};
   Object.keys(typePages).forEach(k => typeShares[k] = typePages[k] / totalMasterPages);

   const maxMediaPages = Math.max(...Object.values(mediaPages), 0);
   const topMediaShare = totalMasterPages > 0 ? maxMediaPages / totalMasterPages : 0;

   const stats = {
      typeShares,
      completionRate: data.media.filter(m => m.status === 'Completed').length / (data.media.length || 1),
      droppedCount: data.media.filter(m => m.status === 'Dropped').length,
      activeConcurrent,
      avgYear: analyzeTimeTraveler(data),
      avgRating: ratingCount > 0 ? ratingSum / ratingCount : 0,
      maxStreak: calculateLongestStreak(data),
      avgPagesPerLog: totalMasterPages / (data.logs.length || 1),
      topMediaShare,
   };

    // Evaluate rules
    const earned = ARCHETYPES.filter(a => a.conditions(data, stats));
    
    // Deterministic shuffle based on user data so it doesn't change arbitrarily
    // which causes UI mismatch between desktop and phone
    const rng = mulberry32(data.logs.length + Math.floor(totalMasterPages));
    const shuffled = [...earned];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled.slice(0, 3);
}
