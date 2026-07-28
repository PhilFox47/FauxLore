import { MediaItem, ProgressLog, Settings } from '../types/schema';
import { calculateScaledDelta } from './scaling';

/**
 * Reading locations as kinds of place rather than as strings.
 *
 * A log carries whatever was typed into it — "Cinestar Wolfenbüttel", "ICE to
 * Berlin", "Sofa". Individually those say very little, and merging them to say
 * more throws away the detail that made them worth writing down. A group keeps
 * both: the log is untouched, and the place additionally counts as a cinema, or
 * as travel, or as home.
 *
 * Groups overlap by design, so shares here are of the period rather than of each
 * other and are not meant to sum to 100%. A place in no group at all is counted
 * once under "Ungrouped", which is what makes the totals reconcile.
 */

export interface LocationGroup {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  locations: string[];
}

/** The palette offered when creating a group, so charts stay legible. */
export const GROUP_COLORS = [
  '#f97316', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#facc15', '#fb7185', '#2dd4bf',
];

export const UNGROUPED = 'Ungrouped';

const norm = (s: string) => s.trim().toLowerCase();

/** Location string -> the groups it belongs to. Case- and space-insensitive. */
export function buildGroupIndex(groups: LocationGroup[]): Map<string, LocationGroup[]> {
  const index = new Map<string, LocationGroup[]>();
  groups.forEach((g) => {
    g.locations.forEach((loc) => {
      const key = norm(loc);
      if (!key) return;
      const list = index.get(key) || [];
      list.push(g);
      index.set(key, list);
    });
  });
  return index;
}

export function groupsFor(location: string, index: Map<string, LocationGroup[]>): LocationGroup[] {
  return index.get(norm(location)) || [];
}

export interface GroupStat {
  id: string;
  name: string;
  color?: string | null;
  pages: number;
  entries: number;
  /** Distinct places inside this group that were actually logged from. */
  places: number;
  /** Share of the period's located master pages. */
  share: number;
  /** Master pages per media type, biggest first. */
  types: { type: string; pages: number }[];
  topPlace: { location: string; pages: number } | null;
}

/** Only the logs that carry a usable location. */
export function locatedLogs(logs: ProgressLog[]): ProgressLog[] {
  return logs.filter(
    (l) => l && l.location && l.location.trim() && l.metricType !== 'statusChange'
      && !l.isHistoric && !l.timestamp.startsWith('1970-01-01'),
  );
}

/**
 * Master pages per group over a set of logs.
 *
 * A log in two groups counts toward both; a log in none lands in "Ungrouped", so
 * every located page is represented at least once.
 */
export function summariseGroups(
  logs: ProgressLog[],
  media: MediaItem[],
  settings: Settings | null | undefined,
  groups: LocationGroup[],
): { stats: GroupStat[]; totalPages: number; groupedPages: number } {
  const index = buildGroupIndex(groups);
  const byId = new Map<string, { pages: number; entries: number; places: Map<string, number>; types: Map<string, number> }>();
  const bucket = (id: string) => {
    let b = byId.get(id);
    if (!b) { b = { pages: 0, entries: 0, places: new Map(), types: new Map() }; byId.set(id, b); }
    return b;
  };

  const mediaById = new Map(media.map((m) => [m.id, m]));
  let totalPages = 0;
  let groupedPages = 0;

  locatedLogs(logs).forEach((l) => {
    const item = mediaById.get(l.mediaId);
    if (!item) return;
    const pages = calculateScaledDelta(l.delta || 1, item, settings);
    if (pages <= 0) return;
    const loc = l.location!.trim();
    totalPages += pages;

    const matched = groupsFor(loc, index);
    if (matched.length > 0) groupedPages += pages;
    const targets = matched.length > 0 ? matched.map((g) => g.id) : [UNGROUPED];

    targets.forEach((id) => {
      const b = bucket(id);
      b.pages += pages;
      b.entries += 1;
      b.places.set(loc, (b.places.get(loc) || 0) + pages);
      b.types.set(item.mediaType, (b.types.get(item.mediaType) || 0) + pages);
    });
  });

  const nameOf = (id: string) => (id === UNGROUPED ? UNGROUPED : groups.find((g) => g.id === id)?.name || id);
  const colorOf = (id: string) => (id === UNGROUPED ? '#52525b' : groups.find((g) => g.id === id)?.color);

  const stats: GroupStat[] = [...byId.entries()].map(([id, b]) => {
    const top = [...b.places.entries()].sort((a, c) => c[1] - a[1])[0];
    return {
      id,
      name: nameOf(id),
      color: colorOf(id),
      pages: b.pages,
      entries: b.entries,
      places: b.places.size,
      share: totalPages > 0 ? b.pages / totalPages : 0,
      types: [...b.types.entries()].map(([type, pages]) => ({ type, pages })).sort((a, c) => c.pages - a.pages),
      topPlace: top ? { location: top[0], pages: top[1] } : null,
    };
  }).sort((a, b) => b.pages - a.pages);

  return { stats, totalPages, groupedPages };
}

/**
 * Home versus everywhere else, from a group actually called "Home" when one
 * exists. The old heuristic guessed from the location's wording, which got
 * "Mancave" right and "Sofa" wrong, and had no way to learn.
 */
export function homeAwaySplit(
  logs: ProgressLog[],
  media: MediaItem[],
  settings: Settings | null | undefined,
  groups: LocationGroup[],
): { home: number; away: number; total: number; source: 'group' | 'heuristic' } {
  const homeGroup = groups.find((g) => /^home$/i.test(g.name.trim()));
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const index = homeGroup ? buildGroupIndex([homeGroup as LocationGroup]) : null;
  const heuristic = (loc: string) => /home|bedroom|living room|mancave|garden|pc room/i.test(loc);

  let home = 0;
  let total = 0;
  locatedLogs(logs).forEach((l) => {
    const item = mediaById.get(l.mediaId);
    if (!item) return;
    const pages = calculateScaledDelta(l.delta || 1, item, settings);
    if (pages <= 0) return;
    total += pages;
    const loc = l.location!.trim();
    const atHome = index ? groupsFor(loc, index).length > 0 : heuristic(loc);
    if (atHome) home += pages;
  });

  return { home, away: total - home, total, source: homeGroup ? 'group' : 'heuristic' };
}
