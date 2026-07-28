import { MediaItem, ProgressLog, Settings, MEDIA_TYPES } from '../types/schema';
import { calculateScaledDelta } from './scaling';
import { groupLogsIntoSessions } from './sessions';
import { differenceInDays, parseISO, isSameDay, getHours, subHours, format } from 'date-fns';
import { mulberry32 } from './rpgSystem';
import { TIME_BANDS, bandIndexForHour, logDate as shift, logWeekdayIndex } from './timeBands';

export interface RecapAnalyticsData {
  timeScale: 'week' | 'month' | 'year';
  logs: ProgressLog[];
  media: MediaItem[];
  allMedia: MediaItem[]; // Even ones untouched in the period, useful for backlog
  settings?: Settings | null;
  /** The equivalent logs from the period before, for momentum archetypes. */
  previousLogs?: ProgressLog[];
  /**
   * How many days the period actually spans. Without it, "active every day" can
   * only be measured against the span between the first and last log, which two
   * consecutive days would satisfy.
   */
  periodDays?: number;
  /**
   * The user's own location groups. Where they exist, a group called "Home" or
   * "Travelling" decides which logs count as which — their judgement beats
   * guessing at the wording, which cannot tell a sofa from a showroom.
   */
  locationGroups?: { id: string; name: string; color?: string | null; locations: string[] }[];
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
/**
 * "This week, you were ___".
 *
 * A recap picks up to three archetypes out of the catalogue below. The catalogue
 * is deliberately large and skewed towards the specific: with only a handful of
 * broad rules, the same two or three fire every period and the line stops
 * meaning anything. Each entry declares how rare it is (tier) and what it talks
 * about (family), and the picker prefers rare over broad and never shows two
 * from the same family, so a period with an unusual shape gets an unusual name.
 *
 * Every condition reads from one pre-computed stats object, and every reason
 * quotes a real number from it — an archetype should always be able to show its
 * working.
 */
const pct = (n: number) => Math.round((n || 0) * 100);
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export interface ArchetypeStats {
  // Volume
  totalMP: number;
  logCount: number;
  titleCount: number;
  avgMPPerLog: number;
  // Composition
  typeShares: Record<string, number>;
  distinctTypes: number;
  topMediaShare: number;
  topMediaTitle: string;
  top2Share: number;
  // Outcomes
  completed: number;
  dropped: number;
  completionRate: number;
  activeConcurrent: number;
  droppedWithReasons: number;
  reRuns: number;
  // Rhythm
  activeDays: number;
  /** Days in the period, from the caller when known, else the observed span. */
  totalDays: number;
  /** True when totalDays is the real period length rather than a guess. */
  periodLengthKnown: boolean;
  coverage: number;
  maxStreak: number;
  longestGap: number;
  bandShares: { morning: number; afternoon: number; evening: number; night: number };
  peakHour: number;
  weekendShare: number;
  busiestDay: string;
  busiestDayShare: number;
  biggestDayShare: number;
  // Sessions
  sessionCount: number;
  avgSession: number;
  maxSession: number;
  bingeSessions: number;
  snippetSessions: number;
  // Taste
  ratingCount: number;
  avgRating: number;
  topRatings: number;
  lowRatings: number;
  middlingRatings: number;
  criticGap: number | null;
  criticComparisons: number;
  contrarian: { title: string; diff: number; type: 'hated' | 'loved' } | null;
  sunkCost: { title: string; pages: number } | null;
  // Era
  avgYear: number;
  yearSpread: number;
  vintageCount: number;
  // Taxonomy
  distinctGenres: number;
  topGenreShare: number;
  topGenre: string;
  distinctTags: number;
  distinctFranchises: number;
  topFranchiseShare: number;
  topFranchise: string;
  distinctCreators: number;
  topCreatorShare: number;
  topCreator: string;
  // Place & journal
  locatedLogs: number;
  distinctLocations: number;
  homeShare: number;
  topLocation: string;
  transitLogs: number;
  noteCount: number;
  noteShare: number;
  longestNote: number;
  // Against the previous period
  prevMP: number;
  hasPrevious: boolean;
  mpRatio: number;
}

interface Archetype {
  id: string;
  name: string;
  /** 1 = broad, 2 = notable, 3 = rare and specific. Higher wins. */
  tier: 1 | 2 | 3;
  /** Only one archetype per family is shown, so the three never rhyme. */
  family: string;
  when: (s: ArchetypeStats) => boolean;
  reason: (s: ArchetypeStats) => string;
}

/** Last resort when the user has not grouped their locations. */
const HOME_RE = /home|bedroom|living room|mancave|garden|pc room|couch|sofa|bed\b/i;
const TRANSIT_RE = /train|bus|commut|metro|subway|tram|flight|plane|car|travel/i;

/**
 * Builds "is this home?" / "is this transit?" from the user's groups when they
 * have any, falling back to the wording when they do not. A group named Home or
 * Travelling (or Transit / Commute / On the road) is taken as the answer.
 */
function locationClassifiers(groups?: RecapAnalyticsData['locationGroups']) {
  const pick = (re: RegExp) => (groups || []).filter((g) => re.test((g.name || '').trim()));
  const homeGroups = pick(/^home$/i);
  const transitGroups = pick(/^(travel(ling|ing)?|transit|commute|commuting|on the road)$/i);
  const memberOf = (list: typeof homeGroups) => {
    const set = new Set<string>();
    list.forEach((g) => g.locations.forEach((l) => set.add(l.trim().toLowerCase())));
    return set;
  };
  const homeSet = memberOf(homeGroups);
  const transitSet = memberOf(transitGroups);
  return {
    isHome: (loc: string) => (homeGroups.length ? homeSet.has(loc.trim().toLowerCase()) : HOME_RE.test(loc)),
    isTransit: (loc: string) => (transitGroups.length ? transitSet.has(loc.trim().toLowerCase()) : TRANSIT_RE.test(loc)),
  };
}

/** Everything the catalogue is allowed to reason about, in one pass. */
export function buildArchetypeStats(data: RecapAnalyticsData): ArchetypeStats {
  const logs = data.logs.filter((l) => l.metricType !== 'statusChange');
  const mediaOf = (id: string) => data.allMedia.find((m) => m.id === id);
  const classify = locationClassifiers(data.locationGroups);

  let totalMP = 0;
  const typeMP: Record<string, number> = {};
  const mediaMP: Record<string, number> = {};
  const genreMP: Record<string, number> = {};
  const franchiseMP: Record<string, number> = {};
  const creatorMP: Record<string, number> = {};
  const tags = new Set<string>();
  const byDay = new Map<string, number>();
  const hourly = Array(24).fill(0);
  const weekday = Array(7).fill(0);
  const locationCounts: Record<string, number> = {};

  let locatedLogs = 0;
  let homeLogs = 0;
  let transitLogs = 0;
  let noteCount = 0;
  let longestNote = 0;

  for (const log of logs) {
    const m = mediaOf(log.mediaId);
    if (!m) continue;
    const mp = calculateScaledDelta(log.delta, m, data.settings);
    totalMP += mp;
    typeMP[m.mediaType] = (typeMP[m.mediaType] || 0) + mp;
    mediaMP[m.id] = (mediaMP[m.id] || 0) + mp;
    (m.genres || []).forEach((g) => { genreMP[g] = (genreMP[g] || 0) + mp; });
    (m.franchises || []).forEach((f) => { franchiseMP[f] = (franchiseMP[f] || 0) + mp; });
    (m.tags || []).forEach((t) => tags.add(t));
    if (m.creator) creatorMP[m.creator] = (creatorMP[m.creator] || 0) + mp;

    const when = shift(log.timestamp);
    hourly[parseISO(log.timestamp).getHours()] += 1;
    weekday[(when.getDay() + 6) % 7] += 1;
    const key = format(when, 'yyyy-MM-dd');
    byDay.set(key, (byDay.get(key) || 0) + mp);

    const loc = (log.location || '').trim();
    if (loc) {
      locatedLogs += 1;
      locationCounts[loc] = (locationCounts[loc] || 0) + 1;
      if (classify.isHome(loc)) homeLogs += 1;
      if (classify.isTransit(loc)) transitLogs += 1;
    }
    const note = (log.note || '').trim();
    if (note.length > 0) {
      noteCount += 1;
      longestNote = Math.max(longestNote, note.length);
    }
  }

  const share = (n: number) => (totalMP > 0 ? n / totalMP : 0);
  const typeShares: Record<string, number> = {};
  Object.entries(typeMP).forEach(([k, v]) => { typeShares[k] = share(v); });

  const rankedMedia = Object.entries(mediaMP).sort((a, b) => b[1] - a[1]);
  const topMediaShare = rankedMedia.length ? share(rankedMedia[0][1]) : 0;
  const top2Share = rankedMedia.slice(0, 2).reduce((sum, [, v]) => sum + share(v), 0);
  const topMediaTitle = rankedMedia.length ? (mediaOf(rankedMedia[0][0])?.title || '') : '';

  const rankedGenres = Object.entries(genreMP).sort((a, b) => b[1] - a[1]);
  const rankedFranchises = Object.entries(franchiseMP).sort((a, b) => b[1] - a[1]);
  const rankedCreators = Object.entries(creatorMP).sort((a, b) => b[1] - a[1]);
  const rankedLocations = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]);

  // Days: streaks and gaps run over the days that actually carry activity.
  const dayKeys = [...byDay.keys()].sort();
  const activeDays = dayKeys.length;
  let maxStreak = activeDays > 0 ? 1 : 0;
  let running = 1;
  let longestGap = 0;
  for (let i = 1; i < dayKeys.length; i++) {
    const gap = differenceInDays(parseISO(dayKeys[i]), parseISO(dayKeys[i - 1]));
    if (gap === 1) {
      running += 1;
      maxStreak = Math.max(maxStreak, running);
    } else {
      running = 1;
      longestGap = Math.max(longestGap, gap - 1);
    }
  }
  const observedSpan = dayKeys.length
    ? differenceInDays(parseISO(dayKeys[dayKeys.length - 1]), parseISO(dayKeys[0])) + 1
    : 0;
  const periodLengthKnown = typeof data.periodDays === 'number' && data.periodDays > 0;
  const totalDays = periodLengthKnown ? (data.periodDays as number) : observedSpan;
  const biggestDay = Math.max(0, ...byDay.values());

  const bandTotals = TIME_BANDS.map((_, i) =>
    hourly.reduce((sum, count, hour) => (bandIndexForHour(hour) === i ? sum + count : sum), 0),
  );
  const logShare = (n: number) => (logs.length > 0 ? n / logs.length : 0);
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const busiestIdx = weekday.indexOf(Math.max(...weekday));

  // Sessions, using the shared session rule.
  const sessions = groupLogsIntoSessions(logs).map((session) =>
    session.logs.reduce((sum, l) => sum + calculateScaledDelta(l.delta, mediaOf(l.mediaId), data.settings), 0),
  );

  // Ratings and era come from the titles touched, not the logs.
  const rated = data.media.filter((m) => typeof m.userRating === 'number' && m.userRating > 0);
  const ratingSum = rated.reduce((sum, m) => sum + (m.userRating || 0), 0);
  const withCritics = data.media.filter((m) => m.userRating && m.reviewScore);
  const gapSum = withCritics.reduce((sum, m) => sum + ((m.userRating || 0) - (m.reviewScore || 0)), 0);
  const years = data.media.map((m) => m.year).filter((y): y is number => !!y);
  const thisYear = new Date().getFullYear();

  const contrarianRaw = analyzeContrarian(data);
  const sunkRaw = analyzeSunkCost(data);

  const prevMP = (data.previousLogs || [])
    .filter((l) => l.metricType !== 'statusChange')
    .reduce((sum, l) => sum + calculateScaledDelta(l.delta, mediaOf(l.mediaId), data.settings), 0);

  return {
    totalMP,
    logCount: logs.length,
    titleCount: rankedMedia.length,
    avgMPPerLog: logs.length ? totalMP / logs.length : 0,

    typeShares,
    distinctTypes: Object.keys(typeMP).length,
    topMediaShare,
    topMediaTitle,
    top2Share,

    completed: data.media.filter((m) => m.status === 'Completed' || m.status === 'Extras').length,
    dropped: data.media.filter((m) => m.status === 'Dropped').length,
    completionRate: data.media.length
      ? data.media.filter((m) => m.status === 'Completed' || m.status === 'Extras').length / data.media.length
      : 0,
    activeConcurrent: data.media.filter((m) => m.status === 'Active').length,
    droppedWithReasons: data.media.filter((m) => m.status === 'Dropped' && (m.dropReason || '').trim()).length,
    reRuns: data.media.filter((m) => m.isReRun).length,

    activeDays,
    totalDays,
    periodLengthKnown,
    coverage: totalDays > 0 ? activeDays / totalDays : 0,
    maxStreak,
    longestGap,
    bandShares: {
      morning: logShare(bandTotals[0]),
      afternoon: logShare(bandTotals[1]),
      evening: logShare(bandTotals[2]),
      night: logShare(bandTotals[3]),
    },
    peakHour: hourly.indexOf(Math.max(...hourly)),
    weekendShare: logShare(weekday[5] + weekday[6]),
    busiestDay: DAY_NAMES[busiestIdx < 0 ? 0 : busiestIdx],
    busiestDayShare: logShare(Math.max(...weekday, 0)),
    biggestDayShare: share(biggestDay),

    sessionCount: sessions.length,
    avgSession: sessions.length ? sessions.reduce((a, b) => a + b, 0) / sessions.length : 0,
    maxSession: sessions.length ? Math.max(...sessions) : 0,
    bingeSessions: sessions.filter((v) => v >= 50).length,
    snippetSessions: sessions.filter((v) => v < 10).length,

    ratingCount: rated.length,
    avgRating: rated.length ? ratingSum / rated.length : 0,
    topRatings: rated.filter((m) => (m.userRating || 0) >= 4.5).length,
    lowRatings: rated.filter((m) => (m.userRating || 0) <= 2).length,
    middlingRatings: rated.filter((m) => (m.userRating || 0) >= 2.5 && (m.userRating || 0) <= 3.5).length,
    criticGap: withCritics.length ? gapSum / withCritics.length : null,
    criticComparisons: withCritics.length,
    contrarian: contrarianRaw
      ? { title: contrarianRaw.media.title, diff: contrarianRaw.diff, type: contrarianRaw.type }
      : null,
    sunkCost: sunkRaw ? { title: sunkRaw.media.title, pages: sunkRaw.pages } : null,

    avgYear: years.length ? Math.round(years.reduce((a, b) => a + b, 0) / years.length) : 0,
    yearSpread: years.length > 1 ? Math.max(...years) - Math.min(...years) : 0,
    vintageCount: years.filter((y) => thisYear - y >= 20).length,

    distinctGenres: rankedGenres.length,
    topGenreShare: rankedGenres.length ? share(rankedGenres[0][1]) : 0,
    topGenre: rankedGenres.length ? rankedGenres[0][0] : '',
    distinctTags: tags.size,
    distinctFranchises: rankedFranchises.length,
    topFranchiseShare: rankedFranchises.length ? share(rankedFranchises[0][1]) : 0,
    topFranchise: rankedFranchises.length ? rankedFranchises[0][0] : '',
    distinctCreators: rankedCreators.length,
    topCreatorShare: rankedCreators.length ? share(rankedCreators[0][1]) : 0,
    topCreator: rankedCreators.length ? rankedCreators[0][0] : '',

    locatedLogs,
    distinctLocations: rankedLocations.length,
    homeShare: locatedLogs ? homeLogs / locatedLogs : 0,
    topLocation: rankedLocations.length ? rankedLocations[0][0] : '',
    transitLogs,
    noteCount,
    noteShare: logShare(noteCount),
    longestNote,

    prevMP,
    hasPrevious: prevMP > 0,
    mpRatio: prevMP > 0 ? totalMP / prevMP : 0,
  };
}

/** Stable 32-bit hash, so a period id can seed the shuffle. */
function hashSeed(seed?: string | number): number {
  if (typeof seed === 'number') return Math.floor(seed);
  if (!seed) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const typeShare = (s: ArchetypeStats, ...types: string[]) =>
  types.reduce((sum, t) => sum + (s.typeShares[t] || 0), 0);

/**
 * The catalogue. Order does not matter — the picker sorts by tier — but keeping
 * families together makes it obvious where a new archetype belongs.
 */
const ARCHETYPES: Archetype[] = [
  // --- Format ------------------------------------------------------------
  { id: 'weeb', name: 'The Weeb', tier: 1, family: 'format',
    when: (s) => typeShare(s, 'Manga', 'Visual Novel') > 0.6,
    reason: (s) => `Manga and visual novels were ${pct(typeShare(s, 'Manga', 'Visual Novel'))}% of everything you logged.` },
  { id: 'bookworm', name: 'The Bookworm', tier: 1, family: 'format',
    when: (s) => (s.typeShares['Book'] || 0) > 0.7,
    reason: (s) => `Books made up ${pct(s.typeShares['Book'])}% of your master pages.` },
  { id: 'gamer', name: 'The Gamer', tier: 1, family: 'format',
    when: (s) => (s.typeShares['Game'] || 0) > 0.7,
    reason: (s) => `Games dominated at ${pct(s.typeShares['Game'])}% of your master pages.` },
  { id: 'cinephile', name: 'The Cinephile', tier: 1, family: 'format',
    when: (s) => (s.typeShares['Movie'] || 0) > 0.6,
    reason: (s) => `Movies were ${pct(s.typeShares['Movie'])}% of your intake.` },
  { id: 'serial-watcher', name: 'The Serial Watcher', tier: 1, family: 'format',
    when: (s) => (s.typeShares['Series'] || 0) > 0.7,
    reason: (s) => `Series ate ${pct(s.typeShares['Series'])}% of your time.` },
  { id: 'panel-reader', name: 'The Panel Reader', tier: 2, family: 'format',
    when: (s) => (s.typeShares['Comic'] || 0) > 0.5,
    reason: (s) => `Comics carried ${pct(s.typeShares['Comic'])}% of the period.` },
  { id: 'listener', name: 'The Listener', tier: 2, family: 'format',
    when: (s) => (s.typeShares['Audiobook'] || 0) > 0.5,
    reason: (s) => `You spent ${pct(s.typeShares['Audiobook'])}% of this one being read to.` },
  { id: 'visual-novelist', name: 'The Visual Novelist', tier: 2, family: 'format',
    when: (s) => (s.typeShares['Visual Novel'] || 0) > 0.6,
    reason: (s) => `Visual novels alone were ${pct(s.typeShares['Visual Novel'])}% of your master pages.` },
  { id: 'page-turner', name: 'The Page Turner', tier: 2, family: 'format',
    when: (s) => typeShare(s, 'Book', 'Manga', 'Comic') > 0.75 && s.distinctTypes >= 2,
    reason: (s) => `${pct(typeShare(s, 'Book', 'Manga', 'Comic'))}% of this period was spent on a page rather than a screen.` },
  { id: 'screen-dweller', name: 'The Screen Dweller', tier: 2, family: 'format',
    when: (s) => typeShare(s, 'Movie', 'Series') > 0.75 && s.distinctTypes >= 2,
    reason: (s) => `Movies and series were ${pct(typeShare(s, 'Movie', 'Series'))}% of everything — barely a page in sight.` },
  { id: 'omnivore', name: 'The Omnivore', tier: 2, family: 'format',
    when: (s) => s.distinctTypes >= 4 && Object.values(s.typeShares).every((v) => v > 0.1),
    reason: (s) => `You spread evenly across ${s.distinctTypes} different media types.` },
  { id: 'dual-wielder', name: 'The Dual Wielder', tier: 2, family: 'format',
    when: (s) => s.distinctTypes === 2 && Object.values(s.typeShares).every((v) => v > 0.3),
    reason: (s) => `Two formats, split ${Object.values(s.typeShares).map((v) => pct(v)).join('/')} — nothing else got a look in.` },
  { id: 'monoculture', name: 'The Monoculture', tier: 1, family: 'format',
    when: (s) => s.distinctTypes === 1 && s.titleCount >= 3,
    reason: (s) => `${plural(s.titleCount, 'title')}, one single format. No notes.` },
  { id: 'format-tourist', name: 'The Format Tourist', tier: 3, family: 'format',
    when: (s) => s.distinctTypes >= 5,
    reason: (s) => `You touched ${s.distinctTypes} different media types. Pick a lane. Or don't.` },

  // --- Pace and volume ---------------------------------------------------
  { id: 'marathon-runner', name: 'The Marathon Runner', tier: 2, family: 'pace',
    when: (s) => s.maxStreak >= 14,
    reason: (s) => `You logged something ${s.maxStreak} days in a row.` },
  { id: 'the-machine', name: 'The Machine', tier: 3, family: 'pace',
    when: (s) => s.periodLengthKnown && s.totalDays >= 7 && s.activeDays >= s.totalDays,
    reason: (s) => `Every single one of ${plural(s.totalDays, 'day')} has a log against it. Perfect attendance.` },
  { id: 'near-perfect', name: 'The Almost-Machine', tier: 3, family: 'pace',
    when: (s) => s.periodLengthKnown && s.totalDays >= 7 && s.coverage >= 0.85 && s.activeDays < s.totalDays,
    reason: (s) => `Active on ${s.activeDays} of ${plural(s.totalDays, 'day')}. So close to a clean sweep.` },
  { id: 'drip-feeder', name: 'The Drip Feeder', tier: 1, family: 'pace',
    when: (s) => s.logCount >= 5 && s.avgMPPerLog < 10,
    reason: (s) => `You sipped slowly — about ${Math.round(s.avgMPPerLog)} master pages per log.` },
  { id: 'heavy-hitter', name: 'The Heavy Hitter', tier: 2, family: 'pace',
    when: (s) => s.logCount >= 4 && s.avgMPPerLog > 100,
    reason: (s) => `Every log averaged ${Math.round(s.avgMPPerLog)} master pages. You don't do small.` },
  { id: 'sprinter', name: 'The Sprinter', tier: 2, family: 'pace',
    when: (s) => s.activeDays >= 3 && s.biggestDayShare > 0.6,
    reason: (s) => `${pct(s.biggestDayShare)}% of the whole period happened on one day.` },
  { id: 'one-day-wonder', name: 'The One-Day Wonder', tier: 3, family: 'pace',
    when: (s) => s.activeDays === 1 && s.totalMP > 30,
    reason: (s) => `One day, ${Math.round(s.totalMP)} master pages, and then silence.` },
  { id: 'slow-burn', name: 'The Slow Burn', tier: 2, family: 'pace',
    when: (s) => s.activeDays >= 8 && s.avgMPPerLog < 25 && s.logCount >= 10,
    reason: (s) => `Active on ${plural(s.activeDays, 'day')}, never in a hurry on any of them.` },
  { id: 'ghost', name: 'The Ghost', tier: 2, family: 'pace',
    when: (s) => s.periodLengthKnown && s.totalDays >= 20 && s.activeDays <= 3,
    reason: (s) => `${plural(s.activeDays, 'day')} of activity across the whole period. You were barely here.` },
  { id: 'comeback', name: 'The Comeback', tier: 3, family: 'pace',
    when: (s) => s.hasPrevious && s.mpRatio >= 3 && s.totalMP > 50,
    reason: (s) => `You did ${s.mpRatio.toFixed(1)}x what you managed last time. Something clicked.` },
  { id: 'fading-signal', name: 'The Fading Signal', tier: 2, family: 'pace',
    when: (s) => s.hasPrevious && s.mpRatio > 0 && s.mpRatio <= 0.4,
    reason: (s) => `You logged ${pct(1 - s.mpRatio)}% less than last period. Life, presumably.` },
  { id: 'steady-hand', name: 'The Steady Hand', tier: 3, family: 'pace',
    when: (s) => s.hasPrevious && s.mpRatio >= 0.92 && s.mpRatio <= 1.08 && s.totalMP > 20,
    reason: (s) => `Within a few per cent of last period. Metronomic.` },
  { id: 'overachiever', name: 'The Overachiever', tier: 2, family: 'pace',
    when: (s) => s.hasPrevious && s.mpRatio >= 1.75 && s.mpRatio < 3,
    reason: (s) => `Nearly double last period's output, at ${s.mpRatio.toFixed(1)}x.` },
  { id: 'gap-year', name: 'The Gap Year', tier: 2, family: 'pace',
    when: (s) => s.longestGap >= 10,
    reason: (s) => `There is a ${plural(s.longestGap, 'day')} hole in the middle of this period.` },

  // --- Rhythm (when) -----------------------------------------------------
  { id: 'night-owl', name: 'The Night Owl', tier: 1, family: 'rhythm',
    when: (s) => s.bandShares.night > 0.4,
    reason: (s) => `${pct(s.bandShares.night)}% of your logs landed between 22:00 and 04:59.` },
  { id: 'early-bird', name: 'The Early Bird', tier: 2, family: 'rhythm',
    when: (s) => s.bandShares.morning > 0.4,
    reason: (s) => `${pct(s.bandShares.morning)}% of this happened before midday.` },
  { id: 'afternoon-drifter', name: 'The Afternoon Drifter', tier: 2, family: 'rhythm',
    when: (s) => s.bandShares.afternoon > 0.4,
    reason: (s) => `Your afternoons carried ${pct(s.bandShares.afternoon)}% of the period.` },
  { id: 'evening-ritual', name: 'The Evening Ritual', tier: 1, family: 'rhythm',
    when: (s) => s.bandShares.evening > 0.45,
    reason: (s) => `${pct(s.bandShares.evening)}% of your logs sit between 17:00 and 21:59. Same time, most nights.` },
  { id: 'insomniac', name: 'The Insomniac', tier: 3, family: 'rhythm',
    when: (s) => s.bandShares.night > 0.6 && s.logCount >= 6,
    reason: (s) => `${pct(s.bandShares.night)}% of everything happened at night. Sleep is a suggestion.` },
  { id: 'all-hours', name: 'The All-Hours Operator', tier: 3, family: 'rhythm',
    when: (s) => Object.values(s.bandShares).every((v) => v > 0.15),
    reason: () => `Morning, afternoon, evening and night all got a real share. You have no schedule.` },
  { id: 'lunch-breaker', name: 'The Lunch Breaker', tier: 3, family: 'rhythm',
    when: (s) => s.peakHour >= 12 && s.peakHour <= 13 && s.logCount >= 5,
    reason: (s) => `Your busiest hour is ${s.peakHour}:00. That's a lunch break well spent.` },
  { id: 'weekend-warrior', name: 'The Weekend Warrior', tier: 1, family: 'rhythm',
    when: (s) => s.weekendShare > 0.6 && s.logCount >= 5,
    reason: (s) => `${pct(s.weekendShare)}% of your logs are Saturday and Sunday.` },
  { id: 'weekday-grinder', name: 'The Weekday Grinder', tier: 2, family: 'rhythm',
    when: (s) => s.weekendShare < 0.1 && s.logCount >= 8,
    reason: (s) => `Almost nothing at the weekend — ${pct(1 - s.weekendShare)}% of this was Monday to Friday.` },
  { id: 'creature-of-habit', name: 'The Creature of Habit', tier: 3, family: 'rhythm',
    when: (s) => s.busiestDayShare > 0.45 && s.logCount >= 6,
    reason: (s) => `${pct(s.busiestDayShare)}% of your logs are on a ${s.busiestDay}. Every week, the same day.` },
  { id: 'sunday-scaries', name: 'The Sunday Scaries', tier: 2, family: 'rhythm',
    when: (s) => s.busiestDay === 'Sunday' && s.busiestDayShare > 0.3,
    reason: (s) => `Sunday is your biggest day at ${pct(s.busiestDayShare)}% of logs. Squeezing it in before Monday.` },
  { id: 'monday-starter', name: 'The Monday Starter', tier: 2, family: 'rhythm',
    when: (s) => s.busiestDay === 'Monday' && s.busiestDayShare > 0.3,
    reason: (s) => `Monday carried ${pct(s.busiestDayShare)}% of your logs. Fresh-start energy.` },

  // --- Sessions ----------------------------------------------------------
  { id: 'binge-eater', name: 'The Binger', tier: 2, family: 'session',
    when: (s) => s.bingeSessions >= 3,
    reason: (s) => `${plural(s.bingeSessions, 'session')} of 50+ master pages in one sitting.` },
  { id: 'deep-diver', name: 'The Deep Diver', tier: 3, family: 'session',
    when: (s) => s.maxSession >= 150,
    reason: (s) => `Your longest single sitting was ${Math.round(s.maxSession)} master pages. That's a commitment.` },
  { id: 'micro-doser', name: 'The Micro-Doser', tier: 2, family: 'session',
    when: (s) => s.sessionCount >= 8 && s.snippetSessions / Math.max(1, s.sessionCount) > 0.7,
    reason: (s) => `${s.snippetSessions} of ${s.sessionCount} sessions were under 10 master pages. Little and often.` },
  { id: 'one-sitting', name: 'The One-Sitting Type', tier: 3, family: 'session',
    when: (s) => s.sessionCount > 0 && s.sessionCount <= 2 && s.totalMP > 40,
    reason: (s) => `The whole period fits into ${plural(s.sessionCount, 'sitting')}.` },

  // --- Commitment and outcomes -------------------------------------------
  { id: 'completionist', name: 'The Completionist', tier: 2, family: 'completion',
    when: (s) => s.completionRate > 0.7 && s.dropped === 0 && s.titleCount >= 2,
    reason: (s) => `You finished ${pct(s.completionRate)}% of what you touched — and dropped nothing.` },
  { id: 'finisher', name: 'The Finisher', tier: 2, family: 'completion',
    when: (s) => s.completed >= 3,
    reason: (s) => `${plural(s.completed, 'title')} crossed the finish line.` },
  { id: 'gravedigger', name: 'The Gravedigger', tier: 2, family: 'completion',
    when: (s) => s.dropped >= 3,
    reason: (s) => `You sent ${plural(s.dropped, 'title')} to the graveyard.` },
  { id: 'merciful-judge', name: 'The Merciful Judge', tier: 3, family: 'completion',
    when: (s) => s.dropped >= 2 && s.droppedWithReasons === s.dropped,
    reason: (s) => `You dropped ${plural(s.dropped, 'title')} and wrote down why for every one of them.` },
  { id: 'plate-spinner', name: 'The Plate Spinner', tier: 1, family: 'commitment',
    when: (s) => s.activeConcurrent >= 5,
    reason: (s) => `You kept ${s.activeConcurrent} titles spinning at once.` },
  { id: 'serial-monogamist', name: 'The Serial Monogamist', tier: 2, family: 'commitment',
    when: (s) => s.titleCount <= 2 && s.topMediaShare > 0.8 && s.totalMP > 20,
    reason: (s) => `"${s.topMediaTitle}" was ${pct(s.topMediaShare)}% of the period. Nothing else got a look in.` },
  { id: 'hyper-fixator', name: 'The Hyper-Fixator', tier: 1, family: 'commitment',
    when: (s) => s.topMediaShare > 0.6 && s.titleCount >= 3,
    reason: (s) => `"${s.topMediaTitle}" hogged ${pct(s.topMediaShare)}% of your attention.` },
  { id: 'scatterbrain', name: 'The Scatterbrain', tier: 2, family: 'commitment',
    when: (s) => s.titleCount >= 8 && s.topMediaShare < 0.25,
    reason: (s) => `${plural(s.titleCount, 'title')} on the go and not one of them above ${pct(s.topMediaShare)}%.` },
  { id: 'two-timer', name: 'The Two-Timer', tier: 3, family: 'commitment',
    when: (s) => s.titleCount >= 3 && s.top2Share > 0.85,
    reason: (s) => `Two titles took ${pct(s.top2Share)}% between them. The rest were decoration.` },
  { id: 'solo-act', name: 'The Solo Act', tier: 3, family: 'commitment',
    when: (s) => s.titleCount === 1 && s.logCount >= 4,
    reason: (s) => `One title. ${plural(s.logCount, 'log')}. Nothing else existed.` },
  { id: 'sunk-cost', name: 'The Sunk Cost Victim', tier: 3, family: 'completion',
    when: (s) => !!s.sunkCost,
    reason: (s) => `You poured ${Math.round(s.sunkCost!.pages)} master pages into "${s.sunkCost!.title}" despite rating it low.` },
  { id: 'second-chancer', name: 'The Second Chancer', tier: 3, family: 'commitment',
    when: (s) => s.reRuns >= 1,
    reason: (s) => `${plural(s.reRuns, 're-run')} on the go. Some things are worth doing twice.` },

  // --- Taste -------------------------------------------------------------
  { id: 'easy-pleaser', name: 'The Easy Pleaser', tier: 2, family: 'taste',
    when: (s) => s.ratingCount >= 3 && s.avgRating >= 4.5,
    reason: (s) => `You averaged ${s.avgRating.toFixed(1)} out of 5 across ${plural(s.ratingCount, 'rating')}. You loved everything.` },
  { id: 'harsh-critic', name: 'The Harsh Critic', tier: 2, family: 'taste',
    when: (s) => s.ratingCount >= 3 && s.avgRating <= 2.5,
    reason: (s) => `${s.avgRating.toFixed(1)} out of 5 on average. A tough crowd.` },
  { id: 'fence-sitter', name: 'The Fence Sitter', tier: 3, family: 'taste',
    when: (s) => s.ratingCount >= 4 && s.middlingRatings / s.ratingCount > 0.75,
    reason: (s) => `${s.middlingRatings} of ${s.ratingCount} ratings landed between 2.5 and 3.5. Commit to an opinion.` },
  { id: 'polariser', name: 'The Polariser', tier: 3, family: 'taste',
    when: (s) => s.ratingCount >= 4 && s.middlingRatings === 0 && s.topRatings > 0 && s.lowRatings > 0,
    reason: (s) => `${s.topRatings} adored, ${s.lowRatings} written off, nothing in between.` },
  { id: 'contrarian', name: 'The Contrarian', tier: 2, family: 'taste',
    when: (s) => !!s.contrarian,
    reason: (s) => `You ${s.contrarian!.type === 'loved' ? 'loved' : 'panned'} "${s.contrarian!.title}" while the critics disagreed by ${s.contrarian!.diff.toFixed(1)} points.` },
  { id: 'critic-whisperer', name: 'The Critic Whisperer', tier: 3, family: 'taste',
    when: (s) => s.criticComparisons >= 4 && s.criticGap !== null && Math.abs(s.criticGap) < 0.25,
    reason: (s) => `Across ${plural(s.criticComparisons, 'title')} you and the critics agreed almost exactly.` },
  { id: 'soft-touch', name: 'The Soft Touch', tier: 2, family: 'taste',
    when: (s) => s.criticComparisons >= 3 && s.criticGap !== null && s.criticGap > 0.75,
    reason: (s) => `You rated ${s.criticGap!.toFixed(1)} points above the critics on average. Generous.` },

  // --- Era ---------------------------------------------------------------
  { id: 'retro-scavenger', name: 'The Retro Scavenger', tier: 2, family: 'era',
    when: (s) => s.avgYear > 0 && s.avgYear < 2010,
    reason: (s) => `Your media averaged the year ${s.avgYear} — certified vintage.` },
  { id: 'trendsetter', name: 'The Trendsetter', tier: 2, family: 'era',
    when: (s) => s.avgYear > 0 && s.avgYear >= new Date().getFullYear() - 1,
    reason: (s) => `You rode the bleeding edge, averaging ${s.avgYear} releases.` },
  { id: 'time-traveler', name: 'The Time Traveller', tier: 3, family: 'era',
    when: (s) => s.yearSpread >= 30,
    reason: (s) => `${s.yearSpread} years between your oldest and newest pick.` },
  { id: 'archaeologist', name: 'The Archaeologist', tier: 3, family: 'era',
    when: (s) => s.vintageCount >= 3,
    reason: (s) => `${plural(s.vintageCount, 'title')} older than twenty years. You're digging.` },

  // --- Taxonomy ----------------------------------------------------------
  { id: 'genre-loyalist', name: 'The Genre Loyalist', tier: 1, family: 'variety',
    when: (s) => s.topGenreShare > 0.6 && !!s.topGenre,
    reason: (s) => `${s.topGenre} was ${pct(s.topGenreShare)}% of everything you logged.` },
  { id: 'genre-hopper', name: 'The Genre Hopper', tier: 2, family: 'variety',
    when: (s) => s.distinctGenres >= 8,
    reason: (s) => `${s.distinctGenres} distinct genres in one period.` },
  { id: 'tag-collector', name: 'The Tag Collector', tier: 3, family: 'variety',
    when: (s) => s.distinctTags >= 25,
    reason: (s) => `${s.distinctTags} different tags across what you touched. Nothing is simple with you.` },
  { id: 'franchise-devotee', name: 'The Franchise Devotee', tier: 2, family: 'variety',
    when: (s) => s.topFranchiseShare > 0.5 && !!s.topFranchise,
    reason: (s) => `${pct(s.topFranchiseShare)}% of the period stayed inside ${s.topFranchise}.` },
  { id: 'universe-builder', name: 'The Universe Builder', tier: 3, family: 'variety',
    when: (s) => s.distinctFranchises >= 4,
    reason: (s) => `You moved between ${plural(s.distinctFranchises, 'franchise')} without breaking stride.` },
  { id: 'auteur-follower', name: 'The Auteur Follower', tier: 3, family: 'variety',
    when: (s) => s.topCreatorShare > 0.5 && s.distinctCreators >= 2 && !!s.topCreator,
    reason: (s) => `${pct(s.topCreatorShare)}% of your master pages came from ${s.topCreator} alone.` },

  // --- Place and journal --------------------------------------------------
  { id: 'homebody', name: 'The Homebody', tier: 1, family: 'place',
    when: (s) => s.locatedLogs >= 5 && s.homeShare > 0.85,
    reason: (s) => `${pct(s.homeShare)}% of your logged sessions happened at home.` },
  { id: 'nomad', name: 'The Nomad', tier: 2, family: 'place',
    when: (s) => s.distinctLocations >= 4,
    reason: (s) => `You logged from ${plural(s.distinctLocations, 'different place')}.` },
  { id: 'commuter', name: 'The Commuter', tier: 3, family: 'place',
    when: (s) => s.transitLogs >= 3,
    reason: (s) => `${plural(s.transitLogs, 'session')} logged in transit. Dead time, reclaimed.` },
  { id: 'regular', name: 'The Regular', tier: 3, family: 'place',
    when: (s) => s.locatedLogs >= 6 && s.distinctLocations === 1 && !!s.topLocation,
    reason: (s) => `Every logged session, same place: ${s.topLocation}.` },
  { id: 'diarist', name: 'The Diarist', tier: 2, family: 'journal',
    when: (s) => s.logCount >= 5 && s.noteShare > 0.5,
    reason: (s) => `You wrote a note on ${pct(s.noteShare)}% of your logs.` },
  { id: 'essayist', name: 'The Essayist', tier: 3, family: 'journal',
    when: (s) => s.longestNote >= 250,
    reason: (s) => `One of your journal notes ran to ${s.longestNote} characters. That's an essay.` },
  { id: 'silent-type', name: 'The Silent Type', tier: 2, family: 'journal',
    when: (s) => s.logCount >= 12 && s.noteCount === 0,
    reason: (s) => `${plural(s.logCount, 'log')} and not one word about any of it.` },

  // --- Fallbacks: something always fires, even on a thin period -----------
  { id: 'dabbler', name: 'The Dabbler', tier: 1, family: 'volume',
    when: (s) => s.logCount > 0 && s.logCount <= 3,
    reason: (s) => `${plural(s.logCount, 'log')} this period. A light touch.` },
  { id: 'steady-reader', name: 'The Regular Logger', tier: 1, family: 'volume',
    when: (s) => s.logCount >= 4 && s.activeDays >= 3,
    reason: (s) => `${plural(s.logCount, 'log')} across ${plural(s.activeDays, 'day')}.` },
  { id: 'collector', name: 'The Collector', tier: 1, family: 'volume',
    when: (s) => s.titleCount >= 4,
    reason: (s) => `You had ${plural(s.titleCount, 'title')} on the go.` },
];

/**
 * Picks the archetypes for a period: rarest first, one per family, and shuffled
 * within a tier so equally-specific results don't always come out in catalogue
 * order. `avoidIds` lets a caller pass what the previous period showed — they
 * are only dropped if something else can take their place.
 */
export function determineArchetypes(
  data: RecapAnalyticsData,
  opts: { avoidIds?: string[]; limit?: number; seed?: string | number } = {},
) {
  const { avoidIds = [], limit = 3, seed } = opts;
  const stats = buildArchetypeStats(data);
  if (stats.logCount === 0) return [];

  const earned = ARCHETYPES.filter((a) => {
    try {
      return a.when(stats);
    } catch (e) {
      return false;
    }
  });
  if (earned.length === 0) return [];

  // Deterministic per period, so the same recap doesn't reshuffle between
  // desktop and phone, but different from period to period. The seed (the
  // period's id) matters: a heavy user's stats barely move week to week, and
  // without it they would see the same ordering — and the same headline —
  // every time.
  const rng = mulberry32(
    hashSeed(seed) + Math.round(stats.totalMP) + stats.logCount * 31 + stats.titleCount * 7,
  );
  const shuffled = [...earned];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const pick = (pool: Archetype[]) => {
    const chosen: Archetype[] = [];
    const usedFamilies = new Set<string>();
    for (const tier of [3, 2, 1]) {
      for (const a of pool) {
        if (a.tier !== tier || chosen.length >= limit) continue;
        if (usedFamilies.has(a.family)) continue;
        chosen.push(a);
        usedFamilies.add(a.family);
      }
    }
    return chosen;
  };


  // Prefer archetypes the last period didn't already use, but never return an
  // empty list just to avoid a repeat.
  const fresh = pick(shuffled.filter((a) => !avoidIds.includes(a.id)));
  const chosen = fresh.length > 0 ? fresh : pick(shuffled);

  return chosen.slice(0, limit).map((a) => ({ id: a.id, name: a.name, reason: a.reason(stats) }));
}

/** How many archetypes exist, for tests and for the "rarity" of what you got. */
export const ARCHETYPE_COUNT = ARCHETYPES.length;
