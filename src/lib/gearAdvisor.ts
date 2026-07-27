import { Artifact, MediaItem, ProgressLog } from '../types/schema';
import { calculateScaledDelta } from './scaling';
import { artifactAppliesTo } from './rpgSystem';

/**
 * Gear advice, scored against what you have actually been doing.
 *
 * An artifact's affinity only pays out on media it matches, so the value of a
 * piece of gear depends entirely on your recent habits: a +150% Horror relic is
 * worthless during a month of cookbooks. The advisor replays your most recent
 * logs, asks each unequipped item "how much EXP would you have added here?",
 * and ranks by the answer. That makes every recommendation a claim you can
 * check — it is measured in master pages you actually missed out on.
 */

export const GEAR_SLOTS = ['Head', 'Body', 'Legs', 'Primary', 'Secondary', 'Accessory'] as const;
export type GearSlot = typeof GEAR_SLOTS[number];

export interface GearSuggestion {
  artifact: Artifact;
  /** Master pages this item would have added across the sampled logs. */
  bonusMP: number;
  /** How many of the sampled logs it would have paid out on. */
  matchedLogs: number;
  /** Share of the sampled master pages it covers, 0-1. */
  coverage: number;
}

export interface GearAdvice {
  /** Ranked candidates per slot, best first. */
  bySlot: Record<string, GearSuggestion[]>;
  /** What the currently equipped item in each slot would have earned, for comparison. */
  equippedScore: Record<string, number>;
  sampleSize: number;
  /** Master pages across the sampled logs, before any bonus. */
  sampleMasterPages: number;
  sampleFrom: string | null;
}

const isBroken = (a: Artifact) => (a.durability ?? 100) <= 0;

/** The most recent real progress logs — the window the advice is based on. */
export function recentProgressLogs(logs: ProgressLog[], sampleSize: number): ProgressLog[] {
  return logs
    .filter((l) => l && l.timestamp && !l.isHistoric && !l.timestamp.startsWith('1970-01-01') && l.metricType !== 'statusChange')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, sampleSize);
}

/** Scores one artifact against a set of logs, using the live EXP rules. */
export function scoreArtifact(
  artifact: Artifact,
  sample: { log: ProgressLog; item: MediaItem; pages: number }[],
): { bonusMP: number; matchedLogs: number; matchedPages: number } {
  const durabilityRatio = (artifact.durability ?? 100) / (artifact.maxDurability || 100);
  const pct = (artifact.bonusPercent ?? 20) / 100;

  let bonusMP = 0;
  let matchedLogs = 0;
  let matchedPages = 0;

  for (const entry of sample) {
    if (!artifactAppliesTo(artifact, entry.item)) continue;
    matchedLogs += 1;
    matchedPages += entry.pages;
    bonusMP += entry.pages * pct * durabilityRatio;
  }

  return { bonusMP, matchedLogs, matchedPages };
}

/**
 * Ranks every unequipped, unbroken artifact by the EXP it would have added over
 * the last `sampleSize` logs, grouped by the slot it fills.
 */
export function recommendGear(args: {
  artifacts: Artifact[];
  media: MediaItem[];
  logs: ProgressLog[];
  settings?: any;
  sampleSize?: number;
  perSlot?: number;
}): GearAdvice {
  const { artifacts, media, logs, settings, sampleSize = 20, perSlot = 3 } = args;

  const recent = recentProgressLogs(logs, sampleSize);
  const sample = recent
    .map((log) => {
      const item = media.find((m) => m.id === log.mediaId);
      if (!item) return null;
      return { log, item, pages: calculateScaledDelta(log.delta || 0, item, settings) };
    })
    .filter(Boolean) as { log: ProgressLog; item: MediaItem; pages: number }[];

  const sampleMasterPages = sample.reduce((sum, e) => sum + e.pages, 0);

  const bySlot: Record<string, GearSuggestion[]> = {};
  const equippedScore: Record<string, number> = {};
  GEAR_SLOTS.forEach((slot) => { bySlot[slot] = []; equippedScore[slot] = 0; });

  for (const artifact of artifacts) {
    const slot = (artifact.slot || 'Accessory') as GearSlot;
    if (!bySlot[slot]) { bySlot[slot] = []; equippedScore[slot] = 0; }

    const { bonusMP, matchedLogs, matchedPages } = scoreArtifact(artifact, sample);

    if (artifact.isEquipped) {
      equippedScore[slot] = bonusMP;
      continue;
    }
    // A broken item grants nothing and gets auto-unequipped, so never suggest one.
    if (isBroken(artifact)) continue;

    bySlot[slot].push({
      artifact,
      bonusMP,
      matchedLogs,
      coverage: sampleMasterPages > 0 ? matchedPages / sampleMasterPages : 0,
    });
  }

  Object.keys(bySlot).forEach((slot) => {
    bySlot[slot] = bySlot[slot]
      // Something that would never have paid out is not a recommendation.
      .filter((s) => s.bonusMP > 0)
      .sort((a, b) => b.bonusMP - a.bonusMP || (b.artifact.durability ?? 0) - (a.artifact.durability ?? 0))
      .slice(0, perSlot);
  });

  return {
    bySlot,
    equippedScore,
    sampleSize: sample.length,
    sampleMasterPages,
    sampleFrom: sample.length ? sample[sample.length - 1].log.timestamp : null,
  };
}

/**
 * Whether a candidate is worth swapping an equipped item for. Requires a real
 * margin, so the UI does not nag about a rounding difference.
 */
export function isMeaningfulUpgrade(candidate: number, current: number): boolean {
  if (candidate <= 0) return false;
  if (current <= 0) return candidate > 0;
  return candidate >= current * 1.25;
}
