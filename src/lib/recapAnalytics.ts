import { MediaItem, ProgressLog, Settings, MEDIA_TYPES } from '../types/schema';
import { calculateScaledDelta } from './scaling';
import { groupLogsIntoSessions } from './sessions';
import { differenceInDays, parseISO, isSameDay, getHours, subHours, format } from 'date-fns';
import { mulberry32 } from './rpgSystem';
import { TIME_BANDS, bandIndexForHour, logWeekdayIndex } from './timeBands';

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
    if (media.userRating && media.userRating <= 2.5 && masterPages[media.id] > 50) {
       if (!worst || masterPages[media.id] > worst.pages) {
          worst = { media, pages: masterPages[media.id] };
       }
    }
  }
  return worst;
}

export function analyzeContrarian(data: RecapAnalyticsData) {
  // Find largest difference between userRating (0-5) and reviewScore (0-5)
  let biggestDiff = -1;
  let contrarianMedia: { media: MediaItem, diff: number, type: 'hated' | 'loved' } | null = null;

  for (const m of data.media) {
    if (m.userRating && m.reviewScore) {
      const normalizedCritic = m.reviewScore;
      const difference = Math.abs(m.userRating - normalizedCritic);
      if (difference > biggestDiff && difference >= 1.5) {
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
  const dayCounts = Array(7).fill(0); // 0 = Monday, on the 05:00 day boundary

  data.logs.forEach(l => {
    const d = new Date(l.timestamp);
    hourCounts[d.getHours()]++;
    dayCounts[logWeekdayIndex(l.timestamp)]++;
  });

  // Shares of the day, on the shared bands. The old hand-rolled slices left
  // 04:00, 10:00 and 11:00 in no segment at all, which quietly deflated every
  // share they were compared against.
  const bandTotals = TIME_BANDS.map((_, i) =>
    hourCounts.reduce((sum, count, hour) => (bandIndexForHour(hour) === i ? sum + count : sum), 0),
  );
  const [morning, afternoon, evening, night] = bandTotals;

  const total = data.logs.length;
  let profile = 'Chaotic Neutral';
  let desc = 'You consume media at literally any hour unpredictably.';
  
  if ((night / total) > 0.4) { profile = 'Night Owl'; desc = 'You thrive in the dark (22:00–04:59).'; }
  else if ((morning / total) > 0.4) { profile = 'Early Bird'; desc = 'Dawn is your domain (05:00–11:59).'; }
  else if ((afternoon / total) > 0.4) { profile = 'Daywalker'; desc = 'Prime daytime consumer (12:00–16:59).'; }
  else if ((evening / total) > 0.4) { profile = 'Evening Wind-Down'; desc = 'Prime evening consumer (17:00–21:59).'; }

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

  // Master Pages consumed per session, using the shared session rule
  // (same media, <=6h apart, nothing else logged in between).
  const sessions: number[] = groupLogsIntoSessions(data.logs).map(session =>
    session.logs.reduce((sum, log) =>
      sum + calculateScaledDelta(log.delta, data.allMedia.find(x => x.id === log.mediaId), data.settings), 0)
  );

  if (sessions.length === 0) return null;

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

  data.media.filter(m => (m.status === 'Completed' || m.status === 'Extras')).forEach(m => {
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
      if ((m.status === 'Completed' || m.status === 'Extras')) completed++;
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
  const uniqueDates = Array.from(new Set(data.logs.map(l => format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd')))).sort();
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
const pct = (n: number) => Math.round((n || 0) * 100);

const ARCHETYPES = [
  { id: '1', name: 'The Weeb', conditions: (data: RecapAnalyticsData, stats: any) => (stats.typeShares['Manga'] || 0) + (stats.typeShares['Visual Novel'] || 0) > 0.6, reason: (s: any) => `Manga and visual novels were ${pct((s.typeShares['Manga'] || 0) + (s.typeShares['Visual Novel'] || 0))}% of everything you logged.` },
  { id: '2', name: 'The Bookworm', conditions: (data: RecapAnalyticsData, stats: any) => (stats.typeShares['Book'] || 0) > 0.7, reason: (s: any) => `Books made up ${pct(s.typeShares['Book'])}% of your master pages.` },
  { id: '3', name: 'The Gamer', conditions: (data: RecapAnalyticsData, stats: any) => (stats.typeShares['Game'] || 0) > 0.7, reason: (s: any) => `Games dominated at ${pct(s.typeShares['Game'])}% of your master pages.` },
  { id: '4', name: 'The Completionist', conditions: (data: RecapAnalyticsData, stats: any) => stats.completionRate > 0.7 && stats.droppedCount === 0, reason: (s: any) => `You finished ${pct(s.completionRate)}% of what you touched — and dropped nothing.` },
  { id: '5', name: 'The Plate Spinner', conditions: (data: RecapAnalyticsData, stats: any) => stats.activeConcurrent >= 5, reason: (s: any) => `You kept ${s.activeConcurrent} titles spinning at once.` },
  { id: '6', name: 'The Retro Scavenger', conditions: (data: RecapAnalyticsData, stats: any) => stats.avgYear > 0 && stats.avgYear < 2010, reason: (s: any) => `Your media averaged the year ${s.avgYear} — certified vintage.` },
  { id: '7', name: 'The Trendsetter', conditions: (data: RecapAnalyticsData, stats: any) => stats.avgYear > 0 && stats.avgYear >= new Date().getFullYear() - 1, reason: (s: any) => `You rode the bleeding edge, averaging ${s.avgYear} releases.` },
  { id: '8', name: 'The Hater', conditions: (data: RecapAnalyticsData, stats: any) => stats.avgRating > 0 && stats.avgRating <= 4, reason: () => `A tough crowd — your ratings ran cold this time.` },
  { id: '9', name: 'The Lover', conditions: (data: RecapAnalyticsData, stats: any) => stats.avgRating >= 8, reason: () => `You adored nearly everything you experienced.` },
  { id: '10', name: 'The Cinematic Soul', conditions: (data: RecapAnalyticsData, stats: any) => (stats.typeShares['Movie'] || 0) > 0.7, reason: (s: any) => `Movies were ${pct(s.typeShares['Movie'])}% of your intake.` },
  { id: '11', name: 'The Serial Watcher', conditions: (data: RecapAnalyticsData, stats: any) => (stats.typeShares['Series'] || 0) > 0.7, reason: (s: any) => `Series ate ${pct(s.typeShares['Series'])}% of your time.` },
  { id: '12', name: 'The Marathon Runner', conditions: (data: RecapAnalyticsData, stats: any) => stats.maxStreak >= 14, reason: (s: any) => `You logged something ${s.maxStreak} days in a row.` },
  { id: '13', name: 'The Drip Feeder', conditions: (data: RecapAnalyticsData, stats: any) => stats.avgPagesPerLog < 10, reason: (s: any) => `You sipped slowly — about ${Math.round(s.avgPagesPerLog)} master pages per log.` },
  { id: '14', name: 'The Hyper-Fixator', conditions: (data: RecapAnalyticsData, stats: any) => stats.topMediaShare > 0.6, reason: (s: any) => `One title hogged ${pct(s.topMediaShare)}% of your attention.` },
  { id: '15', name: 'The Omnivore', conditions: (data: RecapAnalyticsData, stats: any) => Object.keys(stats.typeShares).length >= 4 && Object.values(stats.typeShares).every(s => (s as number) > 0.1), reason: (s: any) => `You spread evenly across ${Object.keys(s.typeShares).length} different media types.` },
  { id: '16', name: 'The Sunk Cost Victim', conditions: (data: RecapAnalyticsData, stats: any) => !!analyzeSunkCost(data), reason: (s: any, d: RecapAnalyticsData) => { const w = analyzeSunkCost(d); return w ? `You poured ${Math.round(w.pages)} master pages into "${w.media.title}" despite rating it low.` : `You poured real effort into something you barely enjoyed.`; } },
  { id: '17', name: 'The Contrarian', conditions: (data: RecapAnalyticsData, stats: any) => !!analyzeContrarian(data), reason: (s: any, d: RecapAnalyticsData) => { const c = analyzeContrarian(d); return c ? `You ${c.type === 'loved' ? 'loved' : 'panned'} "${c.media.title}" while the critics disagreed.` : `Your scores went to war with the critics.`; } },
  { id: '18', name: 'The Hoarder', conditions: (data: RecapAnalyticsData, stats: any) => analyzeBacklog(data).net > 15, reason: (s: any, d: RecapAnalyticsData) => `Your backlog grew by ${analyzeBacklog(d).net} as additions outpaced finishes.` },
  { id: '19', name: 'The Gravedigger', conditions: (data: RecapAnalyticsData, stats: any) => analyzeGraveyard(data).dropped.length >= 5, reason: (s: any, d: RecapAnalyticsData) => `You sent ${analyzeGraveyard(d).dropped.length} titles to the graveyard.` },
  { id: '20', name: 'The Night Owl', conditions: (data: RecapAnalyticsData, stats: any) => analyzeHabits(data)?.profile === 'Night Owl', reason: () => `Most of your logging happened deep in the night.` },
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
      completionRate: data.media.filter(m => (m.status === 'Completed' || m.status === 'Extras')).length / (data.media.length || 1),
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
    
    return shuffled.slice(0, 3).map(a => ({ id: a.id, name: a.name, reason: a.reason(stats, data) }));
}
