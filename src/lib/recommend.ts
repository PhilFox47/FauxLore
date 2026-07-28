import { MediaItem, ProgressLog, Settings, MediaType } from '../types/schema';
import { canBeSuggested, newContentReason } from './onHold';

/**
 * Heuristic "what should I consume next" engine for the backlog (Planning items).
 * Pure + deterministic-ish (a tiny random tiebreaker keeps suggestions fresh).
 * No API key required — it reads taste from what you've rated and recently engaged with.
 */

export interface Recommendation {
  item: MediaItem;
  score: number;
  reasons: string[];
  estHours: number | null;
  estLabel: string;
  bucket: 'quick' | 'standard' | 'epic';
}

const isFinished = (m: MediaItem) => m.status === 'Completed' || m.status === 'Extras';

/** Rough hours-to-finish estimate per media type, used for "quick win" detection + labels. */
export function estimateEffort(m: MediaItem): { hours: number | null; label: string } {
  switch (m.mediaType) {
    case 'Game':
    case 'Visual Novel': {
      const h = m.hltbMainExtra || m.hltbMain || m.averagePlaytime || null;
      return { hours: h, label: h ? `~${Math.round(h)}h` : 'Unknown length' };
    }
    case 'Movie': {
      const h = m.runtimeMinutes ? m.runtimeMinutes / 60 : null;
      return { hours: h, label: m.runtimeMinutes ? `${m.runtimeMinutes} min` : 'Movie' };
    }
    case 'Series': {
      const eps = m.totalEpisodes || 0;
      const rt = m.runtimeMinutes || 30;
      const h = eps ? (eps * rt) / 60 : null;
      return { hours: h, label: eps ? `${eps} eps` : 'Series' };
    }
    case 'Book':
    case 'Audiobook': {
      const pages = m.totalPages || 0;
      const h = pages ? pages / 40 : null; // ~40 pages/hour
      return { hours: h, label: pages ? `${pages} pages` : (m.mediaType === 'Audiobook' ? 'Audiobook' : 'Book') };
    }
    case 'Manga': {
      const ch = m.totalChapters || 0;
      const h = ch ? ch * 0.12 : null; // ~7 min/chapter
      return { hours: h, label: ch ? `${ch} ch` : 'Manga' };
    }
    case 'Comic': {
      const iss = m.totalIssues || 0;
      const h = iss ? iss * 0.3 : null;
      return { hours: h, label: iss ? `${iss} issues` : 'Comic' };
    }
    default:
      return { hours: null, label: '' };
  }
}

function bucketOf(hours: number | null): 'quick' | 'standard' | 'epic' {
  if (hours == null) return 'standard';
  if (hours <= 6) return 'quick';
  if (hours <= 25) return 'standard';
  return 'epic';
}

interface TasteProfile {
  genre: Map<string, number>;
  tag: Map<string, number>;
  trope: Map<string, number>;
  creator: Map<string, number>;
  franchise: Map<string, number>;
}

function addWeighted(map: Map<string, number>, items: string[] | undefined, w: number) {
  (items || []).forEach(i => map.set(i, (map.get(i) || 0) + w));
}

const sumWeights = (map: Map<string, number>, items: string[] | undefined) =>
  (items || []).reduce((acc, i) => acc + (map.get(i) || 0), 0);

/** Builds a weighted taste profile from rated / recently-engaged / finished media. */
export function buildTasteProfile(media: MediaItem[], logs: ProgressLog[]): TasteProfile {
  const profile: TasteProfile = { genre: new Map(), tag: new Map(), trope: new Map(), creator: new Map(), franchise: new Map() };

  const lastLog = new Map<string, number>();
  logs.forEach(l => {
    if (l.metricType === 'statusChange') return;
    const t = new Date(l.timestamp).getTime();
    if (t > (lastLog.get(l.mediaId) || 0)) lastLog.set(l.mediaId, t);
  });
  const now = Date.now();

  media.forEach(m => {
    const engaged = lastLog.has(m.id) || isFinished(m) || m.status === 'Active';
    if (!engaged) return;
    let w = m.userRating ? 1 + (m.userRating / 5) * 2 : 2; // 1..3, default 2
    const lt = lastLog.get(m.id);
    if (lt) {
      const days = (now - lt) / 86400000;
      if (days < 14) w *= 1.6;
      else if (days < 45) w *= 1.25;
    }
    addWeighted(profile.genre, m.genres, w);
    addWeighted(profile.tag, m.tags, w * 0.6);
    addWeighted(profile.trope, m.tropes, w * 0.4);
    if (m.creator) addWeighted(profile.creator, [m.creator], w);
    addWeighted(profile.franchise, m.franchises, w);
  });

  return profile;
}

export interface RecommendOptions {
  types?: MediaType[];
  time?: 'quick' | 'any' | 'epic';
  limit?: number;
}

/** Scores backlog (Planning) items and returns ranked recommendations with reasons. */
export function recommendBacklog(
  media: MediaItem[],
  logs: ProgressLog[],
  _settings: Settings | null | undefined,
  opts: RecommendOptions = {},
): Recommendation[] {
  const profile = buildTasteProfile(media, logs);

  let backlog = media.filter(m => m.status === 'Planning');
  if (opts.types && opts.types.length) backlog = backlog.filter(m => opts.types!.includes(m.mediaType));

  const now = Date.now();
  let recs: Recommendation[] = backlog.map(item => {
    const { hours, label } = estimateEffort(item);
    const bucket = bucketOf(hours);
    const reasons: string[] = [];

    const gScore = sumWeights(profile.genre, item.genres);
    const tScore = sumWeights(profile.tag, item.tags) * 0.5 + sumWeights(profile.trope, item.tropes) * 0.5;
    const cScore = item.creator ? (profile.creator.get(item.creator) || 0) : 0;
    const taste = gScore + tScore + cScore;

    // franchise continuity — strongest signal
    const fScore = sumWeights(profile.franchise, item.franchises);
    let continuity = 0;
    if (fScore > 0 && item.franchises && item.franchises.length) {
      continuity = 10;
      const fr = item.franchises.find(f => (profile.franchise.get(f) || 0) > 0);
      if (fr) reasons.push(`Continues ${fr}`);
    }

    // best shared genre
    if (item.genres && item.genres.length) {
      let bestG = ''; let bestV = 0;
      item.genres.forEach(g => { const v = profile.genre.get(g) || 0; if (v > bestV) { bestV = v; bestG = g; } });
      if (bestG) reasons.push(`Right up your alley: ${bestG}`);
    }
    if (cScore > 0 && item.creator) reasons.push(`More from ${item.creator}`);

    const quality = (item.reviewScore || 0) * 1.5;
    if ((item.reviewScore || 0) >= 4) reasons.push(`Critically acclaimed (${item.reviewScore}★)`);

    let quick = 0;
    if (bucket === 'quick' && hours != null) { quick = 3; reasons.push(`Quick win (${label})`); }

    let aging = 0;
    const ageDays = (now - new Date(item.createdAt).getTime()) / 86400000;
    if (ageDays > 120) { aging = 2; reasons.push('Been waiting in your backlog'); }

    const score = taste + continuity + quality + quick + aging + Math.random() * 0.5;

    return { item, score, reasons: reasons.slice(0, 3), estHours: hours, estLabel: label, bucket };
  });

  if (opts.time === 'quick') recs = recs.filter(r => r.bucket === 'quick');
  else if (opts.time === 'epic') recs = recs.filter(r => r.bucket === 'epic');

  recs.sort((a, b) => b.score - a.score);
  return recs.slice(0, opts.limit ?? 12);
}

/**
 * Items worth picking back up: Active ones gone quiet, plus On Hold ones that
 * have something new to come back to.
 *
 * An On Hold entry is waiting on a release, not on the user, so silence alone
 * never qualifies it — but once new content lands it jumps the queue, since
 * that is the moment it stopped being blocked.
 */
export function resumableStale(
  media: MediaItem[],
  logs: ProgressLog[],
  limit = 4,
): { item: MediaItem; days: number; reason: string | null }[] {
  const lastLog = new Map<string, number>();
  logs.forEach(l => { const t = new Date(l.timestamp).getTime(); if (t > (lastLog.get(l.mediaId) || 0)) lastLog.set(l.mediaId, t); });
  const now = Date.now();
  return media
    .filter(m => m.status === 'Active' || m.status === 'On Hold')
    .filter(canBeSuggested)
    .map(m => {
      const lt = lastLog.get(m.id) || new Date(m.updatedAt || m.createdAt).getTime();
      return { item: m, days: Math.floor((now - lt) / 86400000), reason: newContentReason(m) };
    })
    .filter(x => x.reason !== null || x.days >= 14)
    .sort((a, b) => {
      if (!!a.reason !== !!b.reason) return a.reason ? -1 : 1;
      return b.days - a.days;
    })
    .slice(0, limit);
}
