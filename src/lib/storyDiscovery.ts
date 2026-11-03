import { format, isWithinInterval, parseISO, startOfISOWeek, startOfMonth, startOfYear, subWeeks, subMonths, subYears, endOfISOWeek, endOfMonth, endOfYear, subHours } from 'date-fns';
import { calculateScaledDelta } from './scaling';
import type { MediaItem, ProgressLog, Settings } from '../types/schema';
import type { StructuredRecap, EditorialPlan } from '../services/recapAi';
import type { GeneratedAchievement } from './generatedAchievements';
import type { DynamicSceneComposition } from './dynamicScenes';

export type StoryPeriod = 'week' | 'month' | 'year';
export type StoryKind = 'opening' | 'insight' | 'outlier' | 'location' | 'journal' | 'spotlight' | 'taste' | 'return' | 'timeline' | 'rhythm' | 'achievement' | 'closing';

export type StoryLayout =
  | 'cover-hero' | 'split-feature' | 'cover-wall' | 'infographic'
  | 'quote-poster' | 'type-poster' | 'timeline-film' | 'editorial';
export type StoryPalette = 'violet' | 'cobalt' | 'amber' | 'rose' | 'emerald' | 'cyan' | 'monochrome';
export type StoryVisual = 'auto' | 'cover' | 'mosaic' | 'bars' | 'rings' | 'tiles' | 'timeline' | 'quote' | 'none';
/** Director-controlled visual direction, with a finite safe renderer vocabulary. */
export interface StoryDesign {
  layout: StoryLayout;
  palette: StoryPalette;
  visual: StoryVisual;
  align?: 'left' | 'center';
  mediaIds?: string[];
}
export interface StoryMedia { id: string; title: string; cover?: string; type: string }
export interface StoryBar { label: string; value: number; note: string }
export interface StoryBeat { label: string; title: string; detail: string }
export interface StoryScene {
  id: string;
  kind: StoryKind;
  eyebrow: string;
  title: string;
  body: string;
  detail?: string;
  media?: StoryMedia;
  bars?: StoryBar[];
  beats?: StoryBeat[];
  quote?: string;
  sourceLabel?: string;
  achievement?: GeneratedAchievement;
  design?: StoryDesign;
  artworks?: StoryMedia[];
  /** Optional AI-composed visual stage; absent/invalid = safe legacy layout. */
  composition?: DynamicSceneComposition;
}

export interface StoryInput {
  timeframe: StoryPeriod;
  timeId: string;
  recap: StructuredRecap | null;
  plan?: EditorialPlan | null;
  logs: ProgressLog[];
  history: ProgressLog[];
  media: MediaItem[];
  settings?: Settings | null;
  achievements: GeneratedAchievement[];
}

const periodLimit: Record<StoryPeriod, number> = { week: 6, month: 9, year: 14 };
const minMeaningfulWords = (text: string) => text.trim().split(/\s+/).length;

function periodBounds(date: Date, kind: StoryPeriod) {
  if (kind === 'week') return { start: startOfISOWeek(date), end: endOfISOWeek(date) };
  if (kind === 'month') return { start: startOfMonth(date), end: endOfMonth(date) };
  return { start: startOfYear(date), end: endOfYear(date) };
}
function priorDate(date: Date, kind: StoryPeriod, steps: number) {
  return kind === 'week' ? subWeeks(date, steps) : kind === 'month' ? subMonths(date, steps) : subYears(date, steps);
}
function inPeriod(log: ProgressLog, bounds: { start: Date; end: Date }) {
  const date = subHours(parseISO(log.timestamp), 5);
  return isWithinInterval(date, bounds);
}
function toMedia(m: MediaItem | undefined): StoryMedia | undefined {
  return m ? { id: m.id, title: m.title, cover: m.coverImageUrl, type: m.mediaType } : undefined;
}
function mp(log: ProgressLog, media: Map<string, MediaItem>, settings?: Settings | null) {
  if (log.metricType === 'statusChange') return 0;
  const m = media.get(log.mediaId);
  if (!m) return 0;
  const v = calculateScaledDelta(log.delta || 0, m, settings);
  return Number.isFinite(v) && v > 0 ? v : 0;
}
function rate(input: ProgressLog[], media: Map<string, MediaItem>, settings?: Settings | null): Map<string, number> {
  const totals = new Map<string, number>();
  for (const log of input) {
    const m = media.get(log.mediaId);
    if (!m) continue;
    totals.set(m.id, (totals.get(m.id) || 0) + mp(log, media, settings));
  }
  return totals;
}
function selectCover(text: string, media: MediaItem[], used: Set<string>) {
  return [...media].filter(m => text.toLowerCase().includes(m.title.toLowerCase()) && m.title.length >= 4)
    .sort((a, b) => b.title.length - a.title.length)
    .find(m => !used.has(m.id));
}

/** Pure, grounded discovery and curation. AI supplies opinions, never invented metrics. */
export function buildStoryScenes(input: StoryInput): StoryScene[] {
  const { timeframe, timeId, recap, plan, logs, history, media, settings, achievements } = input;
  if (!recap || !logs.length) return [];
  const byId = new Map(media.map(m => [m.id, m]));
  const progress = logs.filter(l => l.metricType !== 'statusChange');
  const totals = rate(progress, byId, settings);
  const ranked = [...totals.entries()].filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const active = new Set(logs.map(l => l.mediaId));
  const currentMedia = media.filter(m => active.has(m.id));
  const leading = toMedia(byId.get(ranked[0]?.[0]));
  const opener: StoryScene = {
    id: 'opening', kind: 'opening', eyebrow: 'YOUR ' + timeframe.toUpperCase() + ' IN STORIES',
    title: recap.title || 'Your media story',
    body: recap.dek || 'The moments and oddities worth remembering.',
    media: leading,
    detail: timeId,
  };
  const candidates: { scene: StoryScene; weight: number; topic: string }[] = [];
  const add = (scene: StoryScene, weight: number, topic = '') => {
    if (scene.title.trim() && scene.body.trim()) candidates.push({ scene, weight, topic });
  };

  // Editorial arguments are the authored backbone. They are not rewritten
  // into invented discoveries, and have to survive independently of metadata.
  const usedEditorialCovers = new Set<string>();
  recap.chapters.forEach((chapter, index) => {
    const angle = plan?.angles?.[index];
    const related = selectCover([chapter.heading, chapter.body, angle?.evidence || ''].join(' '), currentMedia, usedEditorialCovers);
    if (related) usedEditorialCovers.add(related.id);
    add({
      id: 'insight-' + index, kind: 'insight', eyebrow: 'THE EDITORIAL TAKE',
      title: chapter.heading || angle?.thesis || 'A closer look',
      body: chapter.body,
      detail: angle?.twist && !chapter.body.toLowerCase().includes(angle.twist.toLowerCase()) ? angle.twist : undefined,
      media: toMedia(related),
      sourceLabel: 'Personal interpretation',
    }, 100 - index * 2, related?.id || 'editorial-' + index);
  });

  // Personal outlier: compare the same period type to past occupied periods,
  // never fabricate a norm when history is absent.
  const date = timeframe === 'year' ? new Date(Number(timeId), 0, 1)
    : timeframe === 'month' ? new Date(Number(timeId.slice(0, 4)), Number(timeId.slice(5, 7)) - 1, 1)
    : (() => {
      const y = Number(timeId.slice(0, 4)), week = Number(timeId.slice(-2));
      const jan4 = new Date(y, 0, 4);
      return new Date(y, 0, 4 - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
    })();
  const typeSum = (subset: ProgressLog[]) => {
    const counts = new Map<string, number>();
    let sum = 0;
    for (const l of subset) {
      const m = byId.get(l.mediaId); if (!m) continue;
      const value = mp(l, byId, settings);
      if (!value) continue;
      sum += value;
      counts.set(m.mediaType, (counts.get(m.mediaType) || 0) + value);
    }
    return { counts, sum };
  };
  const nowTypes = typeSum(progress);
  const previousPeriods = Array.from({ length: 8 }, (_, i) => {
    const bounds = periodBounds(priorDate(date, timeframe, i + 1), timeframe);
    return typeSum(history.filter(l => inPeriod(l, bounds)));
  }).filter(p => p.sum > 0);
  if (previousPeriods.length >= 3 && nowTypes.sum > 0) {
    const deviations = [...nowTypes.counts].map(([type, value]) => {
      const share = value / nowTypes.sum;
      const baseline = previousPeriods.reduce((a, p) => a + (p.counts.get(type) || 0) / p.sum, 0) / previousPeriods.length;
      return { type, share, baseline, delta: share - baseline };
    }).filter(x => x.share >= 0.17 && x.delta > 0.18).sort((a, b) => b.delta - a.delta);
    const biggest = deviations[0];
    if (biggest) {
      add({
        id: 'outlier-' + biggest.type, kind: 'outlier', eyebrow: 'YOUR PERSONAL OUTLIER',
        title: biggest.type + ' took over.',
        body: 'This is a real shift against your own recent history, not just a big number on this period’s chart.',
        detail: 'Based on the last ' + previousPeriods.length + ' active ' + timeframe + ' periods. Shares use FauxLore Master Pages, not hours.',
        bars: [
          { label: 'Your usual mix', value: Math.round(biggest.baseline * 100), note: 'Average share' },
          { label: 'This ' + timeframe, value: Math.round(biggest.share * 100), note: 'Share this period' },
        ],
        sourceLabel: 'Compared with your own history',
      }, 95, 'outlier-' + biggest.type);
    }
  }

  // A documented location-to-title connection; no inference that a user was
  // traveling, at home or on a commute merely from a location string.
  const locations = new Map<string, ProgressLog[]>();
  for (const l of logs) {
    const place = (l.location || '').trim();
    if (place) locations.set(place, [...(locations.get(place) || []), l]);
  }
  const currentLogIds = new Set(logs.map(l => l.id));
  const priorLocationCount = new Map<string, number>();
  for (const log of history) {
    if (currentLogIds.has(log.id)) continue;
    const place = (log.location || '').trim();
    if (place) priorLocationCount.set(place, (priorLocationCount.get(place) || 0) + 1);
  }
  const locationChoices = [...locations.entries()].map(([place, matches]) => ({
    place, matches, titles: [...new Set(matches.map(l => l.mediaId))],
    days: new Set(matches.map(l => format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd'))).size,
  })).sort((a, b) => {
    // Prefer unusual places over a habitual home location. No guessing from
    // place names, and historical frequency is computed only once.
    const score = (item: typeof a) =>
      item.days * 2 + item.titles.length + Math.min(item.matches.length, 6) +
      ((priorLocationCount.get(item.place) || 0) < 2 ? 8 : 0);
    return score(b) - score(a);
  });
  if (locationChoices.length) {
    const location = locationChoices[0];
    const m = toMedia(byId.get(location.titles.find(id => !!byId.get(id)) || ''));
    add({
      id: 'location-' + location.place, kind: 'location', eyebrow: 'WHERE THE STORY HAPPENED',
      title: location.place,
      body: location.titles.length > 1
        ? 'One real place appears alongside ' + location.titles.length + ' different works in your log. An unexpected little intersection between the worlds you visit and the one you live in.'
        : 'Even the setting of a media habit can become part of the story. ' + (m?.title || 'A title') + ' appeared in your records here.',
      detail: 'Recorded on ' + location.days + ' distinct day' + (location.days === 1 ? '' : 's') + '. No assumptions about why you were there.',
      media: m,
      sourceLabel: 'Recorded locations',
    }, locationChoices.length > 1 ? 84 : 71, 'location-' + location.place.toLowerCase());
  }

  // Journals matter even when a short session is buried under the top ranking.
  const notes = logs.filter(l => l.metricType !== 'statusChange' && l.note && l.note.trim().length >= 22 && byId.has(l.mediaId))
    .sort((a, b) => Math.min(b.note!.length, 450) - Math.min(a.note!.length, 450));
  const note = notes[0];
  if (note) {
    const m = byId.get(note.mediaId)!;
    add({
      id: 'journal-' + note.id, kind: 'journal', eyebrow: 'IN YOUR OWN WORDS',
      title: m.title,
      body: 'A moment that earned a written reaction, not just a progress update.',
      quote: note.note!.trim(), media: toMedia(m),
      detail: format(subHours(parseISO(note.timestamp), 5), 'MMM d, yyyy'),
      sourceLabel: 'Your journal',
    }, 87, m.id);
  }

  // Ratings must exist: never treat current ratings as proven historical values.
  const disagreements = currentMedia.filter(m => m.userRating != null && m.reviewScore != null)
    .map(m => ({ m, delta: (m.userRating || 0) - (m.reviewScore || 0) }))
    .filter(x => Math.abs(x.delta) >= 1).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  if (disagreements[0]) {
    const { m, delta } = disagreements[0];
    add({
      id: 'taste-' + m.id, kind: 'taste', eyebrow: 'YOU VERSUS THE CRITICS',
      title: delta > 0 ? 'You saw something they missed.' : 'The critics can keep it.',
      body: m.title + ' drew a noticeably different verdict from you and the critics. Why should consensus get the final word?',
      detail: 'Ratings reflect current saved values, which may have changed since this period.',
      media: toMedia(m), sourceLabel: 'Taste disagreement',
      bars: [
        { label: 'You', value: Math.round((m.userRating || 0) * 20), note: (m.userRating || 0) + ' / 5' },
        { label: 'Critics', value: Math.round((m.reviewScore || 0) * 20), note: (m.reviewScore || 0) + ' / 5' },
      ],
    }, 81, m.id);
  }

  if (leading) add({
    id: 'spotlight-' + leading.id, kind: 'spotlight', eyebrow: 'THE CENTER OF GRAVITY',
    title: leading.title, body: 'This title took the largest share of your tracked Master Pages this period.',
    detail: Math.round(ranked[0][1]).toLocaleString() + ' Master Pages',
    media: leading, sourceLabel: 'Most logged title',
  }, 66, leading.id);

  // Comeback after a measurable gap; intentionally ignore non-activity states.
  const earlier = history.filter(l => !logs.some(a => a.id === l.id) && l.metricType !== 'statusChange');
  const comeback = currentMedia.map(m => {
    const first = progress.filter(l => l.mediaId === m.id).map(l => parseISO(l.timestamp).getTime()).sort((a, b) => a - b)[0];
    const last = earlier.filter(l => l.mediaId === m.id && parseISO(l.timestamp).getTime() < first)
      .map(l => parseISO(l.timestamp).getTime()).sort((a, b) => b - a)[0];
    return { m, days: first && last ? Math.floor((first - last) / 86400000) : 0 };
  }).filter(a => a.days >= 30).sort((a, b) => b.days - a.days)[0];
  if (comeback) add({
    id: 'return-' + comeback.m.id, kind: 'return', eyebrow: 'A RETURN FROM THE ARCHIVES',
    title: comeback.m.title,
    body: 'After ' + comeback.days + ' days without a progress entry, this title finally appeared in the logs again.',
    detail: 'A gap between recorded sessions, not proof that the work was abandoned.',
    media: toMedia(comeback.m), sourceLabel: 'Longest return',
  }, 83, comeback.m.id);

  const days = new Set(progress.filter(l => mp(l, byId, settings) > 0).map(l => format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd')));
  if (days.size > 1) add({
    id: 'rhythm', kind: 'rhythm', eyebrow: 'THE RHYTHM',
    title: days.size + ' days with a story.',
    body: 'Not every part of the period carried equal momentum. Here is where the logged activity actually landed.',
    detail: progress.length + ' progress entries across ' + days.size + ' distinct active days.',
    sourceLabel: 'Your activity pattern',
  }, 55, 'rhythm');

  // Month/year timelines show observable periods, not invented "eras".
  if (timeframe !== 'week') {
    const buckets = new Map<string, { label: string; totals: Map<string, number> }>();
    for (const l of progress) {
      const shifted = subHours(parseISO(l.timestamp), 5);
      const key = timeframe === 'month' ? format(startOfISOWeek(shifted), 'yyyy-MM-dd') : format(shifted, 'yyyy-MM');
      const label = timeframe === 'month' ? 'Week of ' + format(startOfISOWeek(shifted), 'MMM d') : format(shifted, 'MMMM');
      const value = mp(l, byId, settings);
      if (value <= 0) continue;
      if (!buckets.has(key)) buckets.set(key, { label, totals: new Map() });
      const bucket = buckets.get(key)!;
      bucket.totals.set(l.mediaId, (bucket.totals.get(l.mediaId) || 0) + value);
    }
    const beats: StoryBeat[] = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([, bucket]) => {
        const winner = [...bucket.totals].sort((a, b) => b[1] - a[1])[0];
        const title = byId.get(winner[0])?.title || 'Unrecorded';
        return { label: bucket.label, title, detail: Math.round(winner[1]) + ' Master Pages' };
      });
    if (beats.length >= 3) add({
      id: 'timeline', kind: 'timeline', eyebrow: 'THE CHANGING CHAPTERS',
      title: timeframe === 'year' ? 'Your year in shifting favorites.' : 'A month in movements.',
      body: 'These are the leading logged titles in each active part of the period, not fictional personality eras.',
      beats, sourceLabel: 'Timeline from actual logs',
    }, timeframe === 'year' ? 94 : 77, 'timeline');
  }

  const periodAchievements = achievements.filter(a => a.timeframe === timeframe && a.timeId === timeId)
    .sort((a, b) => a.position - b.position);
  periodAchievements.forEach((a, index) => add({
    id: 'achievement-' + index, kind: 'achievement', eyebrow: 'NEW ACHIEVEMENT!',
    title: a.title, body: a.description, achievement: a, sourceLabel: 'The dungeon has spoken',
  }, 92 - index * 6, 'achievement-' + a.subject.toLowerCase()));

  // Selection: editorial scenes always get room; fill the remaining seats
  // with highest-quality *different kinds* of grounded discovery.
  const max = periodLimit[timeframe];
  const chosen: StoryScene[] = [opener];
  const taken = new Set<string>();
  const kinds = new Map<StoryKind, number>();
  const core = candidates.filter(c => c.scene.kind === 'insight').slice(0, timeframe === 'week' ? 2 : 3);
  for (const c of core) { chosen.push(c.scene); taken.add(c.scene.id); kinds.set('insight', (kinds.get('insight') || 0) + 1); }
  const free = candidates.filter(c => !taken.has(c.scene.id))
    .sort((a, b) => b.weight - a.weight || a.scene.id.localeCompare(b.scene.id));
  // Reserve one slot for the closer; prefer diverse kinds and subjects.
  const subjects = new Set(core.map(c => c.topic).filter(Boolean));
  while (chosen.length < max - 1 && free.length) {
    const options = free.map((c, i) => ({
      c, i,
      score: c.weight - (kinds.get(c.scene.kind) || 0) * 32 - (subjects.has(c.topic) ? 23 : 0),
    })).sort((a, b) => b.score - a.score || a.c.scene.id.localeCompare(b.c.scene.id));
    const { c, i } = options[0];
    free.splice(i, 1);
    // Low-information filler is worse than a short story.
    if (c.weight < 65 && chosen.length >= (timeframe === 'week' ? 4 : 5)) break;
    chosen.push(c.scene);
    kinds.set(c.scene.kind, (kinds.get(c.scene.kind) || 0) + 1);
    if (c.topic) subjects.add(c.topic);
  }
  // Vary the rhythm based on what this particular period actually offered.
  // Insights remain in editorial order; discoveries can lead and interleave,
  // rather than all the prose always preceding every visual reveal.
  const interior = chosen.slice(1);
  const editorial = interior.filter(scene => scene.kind === 'insight');
  const discoveries = interior.filter(scene => scene.kind !== 'insight' && scene.kind !== 'achievement');
  const awards = interior.filter(scene => scene.kind === 'achievement');
  const woven: StoryScene[] = [];
  const strongestDiscovery = discoveries.find(scene =>
    scene.kind === 'outlier' || scene.kind === 'timeline' || scene.kind === 'journal');
  if (strongestDiscovery && (timeframe !== 'week' || strongestDiscovery.kind === 'outlier')) {
    discoveries.splice(discoveries.indexOf(strongestDiscovery), 1);
    woven.push(strongestDiscovery);
  }
  while (editorial.length || discoveries.length) {
    if (editorial.length) woven.push(editorial.shift()!);
    if (discoveries.length) woven.push(discoveries.shift()!);
  }
  // The dungeon has the last word before the closing slide.
  woven.push(...awards);
  chosen.splice(1, chosen.length - 1, ...woven);
  chosen.push({
    id: 'closing', kind: 'closing', eyebrow: 'TO BE CONTINUED',
    title: 'The next chapter is yours.',
    body: recap.lookAhead?.watchFor || 'This issue ends here. The next one is being written in your logs.',
    detail: recap.lookAhead?.challenge || undefined,
    media: leading, sourceLabel: 'End of this issue',
  });
  return chosen;
}
