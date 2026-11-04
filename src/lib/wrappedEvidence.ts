import { format, isWithinInterval, parseISO, startOfISOWeek, startOfMonth, startOfYear, endOfISOWeek, endOfMonth, endOfYear, getDaysInMonth, subHours, subWeeks, subMonths, subYears } from 'date-fns';
import { calculateScaledDelta } from './scaling';
import { analyzeMediaFocus, focusEditorialCalibration } from './periodFocus';
import { analyzeRecapSalience, recapSalienceBrief, selectRecapEditorialCandidates } from './recapSalience';
import { selectPersonalMoments, phaseJournalHighlights } from './personalMoments';
import { isSignificantFormatShift, isSignificantTasteGap, monthPhase, monthPhaseLabel, requiredMonthlyPhases } from './wrappedEditorial';
import type { MonthPhase, MonthlyCoverage, VerifiedAnalytic } from './wrappedEditorial';
import type { MediaItem, ProgressLog, Settings } from '../types/schema';
import type { StoryBar, StoryBeat, StoryKind, StoryPeriod } from './storyDiscovery';

export interface WrappedFact {
  id: string;
  kind: StoryKind;
  title: string;
  evidence: string;
  mediaId?: string;
  mediaIds?: string[];
  quote?: string;
  bars?: StoryBar[];
  beats?: StoryBeat[];
  /** Validated by the data pipeline, never written by the story LLM. */
  analytic?: VerifiedAnalytic;
  /** Verified date scope for enforceable monthly storytelling coverage. */
  phase?: MonthPhase;
  /** All supporting activity falls in the month's final seven days. */
  recentOnly?: boolean;
}
export interface WrappedEvidence {
  timeframe: StoryPeriod;
  timeId: string;
  facts: WrappedFact[];
  media: { id: string; title: string; type: string; year?: number; genres: string[]; rating?: number; review?: string }[];
  bounds: { start: string; end: string };
  /** Norm-relative editorial warning; not a required factual story beat. */
  editorialCalibration: string;
  /** Independent qualitative signals, not a time-weighted popularity ranking. */
  editorialSalience: string;
  /** Month phases with material logged activity; absent for week and year. */
  monthlyCoverage?: MonthlyCoverage;
}

const period = (date: Date, kind: StoryPeriod) => kind === 'week'
  ? { start: startOfISOWeek(date), end: endOfISOWeek(date) }
  : kind === 'month' ? { start: startOfMonth(date), end: endOfMonth(date) }
    : { start: startOfYear(date), end: endOfYear(date) };
const backward = (date: Date, kind: StoryPeriod, steps: number) => kind === 'week' ? subWeeks(date, steps) : kind === 'month' ? subMonths(date, steps) : subYears(date, steps);
const within = (l: ProgressLog, range: {start: Date; end: Date}) => isWithinInterval(subHours(parseISO(l.timestamp), 5), range);
const stamp = (l: ProgressLog) => format(subHours(parseISO(l.timestamp), 5), 'MMM d');
const round = (n: number) => Math.round(n * 10) / 10;
function timeIdDate(timeframe: StoryPeriod, timeId: string): Date {
  if (timeframe === 'year') return new Date(Number(timeId), 0, 1);
  if (timeframe === 'month') return new Date(Number(timeId.slice(0, 4)), Number(timeId.slice(5, 7)) - 1, 1);
  const year = Number(timeId.slice(0, 4)), week = Number(timeId.slice(6));
  const jan4 = new Date(year, 0, 4);
  return new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
}

/** Self-contained source of truth for Wrapped. No recap, awards or prior recap prose. */
export function buildWrappedEvidence(args: {
  timeframe: StoryPeriod; timeId: string; logs: ProgressLog[];
  history: ProgressLog[]; media: MediaItem[]; settings?: Settings | null;
}): WrappedEvidence {
  const { timeframe, timeId, logs, history, media, settings } = args;
  const byId = new Map(media.map(m => [m.id, m]));
  const salience = analyzeRecapSalience({ logs, media, settings });
  const editorialCandidates = selectRecapEditorialCandidates(salience);
  const salienceSummary = recapSalienceBrief(salience);
  const progress = logs.filter(l => l.metricType !== 'statusChange').sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const value = (l: ProgressLog) => {
    const item = byId.get(l.mediaId);
    if (!item || l.metricType === 'statusChange') return 0;
    const n = calculateScaledDelta(l.delta || 0, item, settings);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const facts: WrappedFact[] = [];
  const add = (fact: WrappedFact) => { if (fact.evidence && facts.length < 90) facts.push(fact); };
  const total = progress.reduce((n, l) => n + value(l), 0);
  const byMedia = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const l of progress) {
    const m = byId.get(l.mediaId); if (!m) continue;
    const pages = value(l);
    byMedia.set(m.id, (byMedia.get(m.id) || 0) + pages);
    byType.set(m.mediaType, (byType.get(m.mediaType) || 0) + pages);
  }
  const ranking = [...byMedia].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const touched = [...new Set(progress.filter(l => value(l) > 0).map(l => l.mediaId))]
    .map(id => byId.get(id)).filter((m): m is MediaItem => !!m);
  const focus = analyzeMediaFocus({
    timeframe, periodStart: timeIdDate(timeframe, timeId),
    logs: progress, history, media, settings,
  });
  const monthStart = timeIdDate(timeframe, timeId);
  const daysInMonth = getDaysInMonth(monthStart);
  const dayOf = (l: ProgressLog) => Number(format(subHours(parseISO(l.timestamp), 5), 'd'));
  const inFinalWeek = (l: ProgressLog) => dayOf(l) > daysInMonth - 7;
  const scopeFor = (items: ProgressLog[]) => timeframe === 'month' && items.length > 0 &&
    items.every(inFinalWeek);
  const phaseFor = (items: ProgressLog[]): MonthPhase | undefined => {
    if (timeframe !== 'month' || !items.length) return undefined;
    const phases = [...new Set(items.map(item => monthPhase(dayOf(item))))];
    return phases.length === 1 ? phases[0] : undefined;
  };
  // Personal narrative is scarce and precious. Extract BEFORE MP leaderboards,
  // phase clusters and routine statistics can occupy the bounded evidence
  // budget. A Note remains a Note; it can still contain firsthand details.
  const personalMoments = selectPersonalMoments(progress, {
    journalLimit: timeframe === 'year' ? 22 : 14,
    noteLimit: timeframe === 'year' ? 24 : 20,
    perMedia: timeframe === 'year' ? 5 : 3,
  }).filter(moment => byId.has(moment.log.mediaId));
  for (const moment of personalMoments) {
    const l = moment.log, m = byId.get(l.mediaId)!;
    const significance = [
      typeof l.sessionImpact === 'number' ? 'Impact ' + l.sessionImpact + '/5.' : '',
      // Moodlets and dates must remain user-authored and unambiguous.
      (l.moodlets || []).length ? 'User-selected Moodlets: ' +
        (Array.isArray(l.moodlets) ? l.moodlets.join(', ') : '') + '.' : '',
    ].filter(Boolean).join(' ');
    if (moment.source === 'journal') {
      const quote = moment.text.slice(0, 2000);
      add({ id: 'journal-' + l.id, kind: 'journal', title: 'Personal journal: ' + m.title,
        mediaId: m.id, phase: phaseFor([l]), recentOnly: scopeFor([l]),
        evidence: 'On ' + stamp(l) + (l.location ? ' at ' + l.location : '') +
          ', the user WROTE in their journal about ' + m.title +
          (l.thoughtPrompt ? ' in answer to ' + l.thoughtPrompt.slice(0, 160) : '') +
          ': ' + quote + '. ' + significance +
          ' This personal memory is the primary source, not the session count.',
        quote });
    } else {
      add({ id: 'reference-' + l.id, kind: 'insight', title: 'User-authored session note: ' + m.title,
        mediaId: m.id, phase: phaseFor([l]), recentOnly: scopeFor([l]),
        evidence: 'On ' + stamp(l) + ', the user wrote in Notes for ' + m.title +
          (l.location ? ' at ' + l.location : '') + ': ' + moment.text.slice(0, 950) +
          '. ' + significance +
          ' Treat this as their actual written session account. It is NOT a journal-field quote. ' +
          'It may contain specific personal opinions or memories, not just organizational metadata.' });
    }
  }
  let monthlyCoverage: MonthlyCoverage | undefined;
  if (timeframe === 'month') {
    const names: MonthPhase[] = ['early', 'middle', 'late'];
    const segments = new Map<MonthPhase, ProgressLog[]>(names.map(phase => [phase, []]));
    for (const log of progress) if (value(log) > 0) {
      segments.get(monthPhase(dayOf(log)))!.push(log);
    }
    const totals = new Map(names.map(phase => [
      phase, segments.get(phase)!.reduce((sum, log) => sum + value(log), 0),
    ] as const));
    const shares = Object.fromEntries(names.map(phase => [phase,
      total > 0 ? totals.get(phase)! / total : 0,
    ])) as Record<MonthPhase, number>;
    const requiredPhases = requiredMonthlyPhases(shares);
    monthlyCoverage = {
      requiredPhases,
      lastWeekShare: total > 0
        ? progress.filter(log => inFinalWeek(log)).reduce((sum, log) => sum + value(log), 0) / total
        : 0,
      minPhaseScenes: Math.min(requiredPhases.length, 2),
      clusters: names.map(phase => {
        const entries = segments.get(phase)!;
        const titleWeights = new Map<string, number>();
        for (const entry of entries) titleWeights.set(entry.mediaId,
          (titleWeights.get(entry.mediaId) || 0) + value(entry));
        return {
          phase, progressShare: round(shares[phase] * 100),
          activeDays: new Set(entries.map(entry =>
            format(subHours(parseISO(entry.timestamp), 5), 'yyyy-MM-dd'))).size,
          leadingWorks: [...titleWeights].sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([id, weight]) => ({
              id, title: byId.get(id)?.title || 'Unknown',
              share: round(totals.get(phase)! > 0 ? weight / totals.get(phase)! * 100 : 0),
            })),
          journalHighlights: phaseJournalHighlights(entries, 2).map(moment => ({
            mediaId: moment.log.mediaId, quote: moment.text.slice(0, 240),
          })),
          places: [...new Set(entries.map(entry => entry.location?.trim() || '').filter(Boolean))]
            .slice(0, 3),
        };
      }),
    };
    // Supply verified, phase-scoped evidence. A month's first ten days are
    // NEVER displaced merely because its final week has more recent reviews.
    for (const phase of names) {
      const entries = segments.get(phase)!;
      if (!entries.length) continue;
      const byTitle = new Map<string, number>();
      for (const entry of entries) byTitle.set(entry.mediaId,
        (byTitle.get(entry.mediaId) || 0) + value(entry));
      const highlights = [...byTitle].sort((a, b) => b[1] - a[1])
        .slice(0, 3).map(([id, pages]) =>
          (byId.get(id)?.title || 'Unknown work') + ' (' + round(pages) + ' MP)');
      add({
        id: 'month-' + phase, kind: 'insight', phase,
        recentOnly: scopeFor(entries),
        title: 'Monthly chapter: ' + phase + ' (' + monthPhaseLabel[phase] + ')',
        mediaIds: [...byTitle].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id),
        evidence: 'During ' + monthPhaseLabel[phase] + ', ' + entries.length +
          ' positive progress log(s) accounted for ' + Math.round(shares[phase] * 100) +
          '% of the entire month\'s normalized Master Pages. Most substantial recorded works: ' +
          highlights.join(', ') +
          '. This is a SOURCE FOR THIS PART OF THE MONTH, not an obligation to list everything or invent an emotional arc.',
      });
    }
  }
  const days = new Set(progress.filter(l => value(l) > 0).map(l => format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd')));
  add({ id: 'overview', kind: 'rhythm', title: 'What the period contained',
    evidence: logs.length + ' log entries, ' + days.size + ' distinct active days, ' + touched.length + ' media titles; ' + round(total) + ' normalized Master Pages. These are NOT hours.' });
  if (focus.unusuallyFocused && focus.leadingTitle && focus.baselineLeadingShare !== null) {
    const id = ranking[0]?.[0];
    add({ id: 'focus-0', kind: 'insight', title: 'Unusually strong focus: ' + focus.leadingTitle,
      mediaId: id,
      ...(focus.leadingShare >= .50 ? { analytic: {
        kind: 'dominance' as const, unit: 'percent' as const,
        points: [
          { label: focus.leadingTitle, value: round(focus.leadingShare * 100), note: 'Share of the period\'s normalized Master Pages' },
          { label: 'All other works', value: round((1 - focus.leadingShare) * 100), note: 'Combined remaining share; NOT hours' },
        ],
      } } : {}),
      evidence: focus.leadingTitle + ' accounted for ' + Math.round(focus.leadingShare * 100) +
        '% of normalized Master Pages this period, versus ' +
        Math.round(focus.baselineLeadingShare * 100) + '% for the leading title on average across ' +
        focus.baselinePeriods + ' earlier comparable active ' + timeframe +
        ' periods. This is unusual concentration even if other works were logged. These are weighted progress units, NOT hours.' });
  }
  // Preserve a few genuine volume leaders for numeric coverage, but let
  // strongly felt minority titles compete for spotlight fact cards as well.
  const spotlightIds = [...new Set([
    ...ranking.slice(0, 2).map(([id]) => id),
    ...editorialCandidates.map(candidate => candidate.mediaId),
  ])].slice(0, timeframe === 'year' ? 20 : 14);
  spotlightIds.forEach((id, i) => {
    const pages = byMedia.get(id) || 0;
    const m = byId.get(id)!;
    add({ id: 'media-' + i, kind: 'spotlight', title: m.title, mediaId: id,
      phase: phaseFor(progress.filter(l => l.mediaId === id && value(l) > 0)),
      recentOnly: scopeFor(progress.filter(l => l.mediaId === id && value(l) > 0)),
      evidence: m.title + ' (' + m.mediaType + ') logged ' + round(pages) + ' Master Pages (' +
        (total > 0 ? Math.round(pages / total * 100) : 0) + '% of this period); ' +
        progress.filter(l => l.mediaId === id).length + ' progress entries. ' +
        (m.genres?.length ? 'Genres: ' + m.genres.slice(0, 4).join(', ') + '. ' : '') +
        (m.userReview ? 'Review recorded by period end: ' + m.userReview.slice(0, 450) + '.' : ''),
    });
  });
  // Session resonance is evidence independent of how many Master Pages a title
  // accumulated. Missing ratings are NEVER interpreted as low impact.
  for (const signal of salience) {
    if (!signal.impactCount && !signal.moodlets.length) continue;
    const sessionLogs = progress.filter(l => l.mediaId === signal.mediaId);
    const impact = signal.impactCount
      ? signal.impactCount + ' explicitly rated impact session(s): average ' +
        signal.averageImpact + '/5, peak ' + signal.maxImpact + '/5.'
      : 'No session impact ratings recorded (unknown).';
    const tags = signal.moodlets.length
      ? ' User-selected Quick Moodlets: ' + signal.moodlets.map(m =>
          m.label + ' (' + m.count + ' session(s))').join(', ') + '.'
      : '';
    add({ id: 'session-resonance-' + signal.mediaId, kind: 'insight',
      title: 'Session resonance: ' + signal.title,
      mediaId: signal.mediaId, phase: phaseFor(sessionLogs), recentOnly: scopeFor(sessionLogs),
      evidence: signal.title + ': ' + impact + tags + ' Only session annotations, not a final work rating. ' +
        (signal.contrast === 'quiet-standout'
          ? 'Verified contrast: less than 15% of period Master Pages but at least one reported 4+/5 impact session.'
          : signal.contrast === 'high-volume-low-impact'
            ? 'Verified contrast: at least 25% of Master Pages, with 1–2/5 average reported impact.'
            : 'Do not equate time spent with personal significance.'),
    });
  }
  // Qualitative moments were already prioritized above. Never re-add them
  // after spotlight/statistics cards or truncate to the first 20 by date.
  const ratings = new Map<string, { score: number; date: string }[]>();
  for (const l of progress) if (typeof l.sessionEnjoyment === 'number' &&
    l.sessionEnjoyment >= 1 && l.sessionEnjoyment <= 5) {
    ratings.set(l.mediaId, [...(ratings.get(l.mediaId) || []),
      { score: l.sessionEnjoyment, date: stamp(l) }]);
  }
  for (const [mediaId, sessions] of ratings) {
    const m = byId.get(mediaId);
    if (!m) continue;
    const average = sessions.reduce((sum, s) => sum + s.score, 0) / sessions.length;
    add({ id: 'session-enjoyment-' + mediaId, kind: 'insight', title: 'Session enjoyment: ' + m.title, mediaId,
      phase: phaseFor(progress.filter(l => l.mediaId === mediaId &&
        typeof l.sessionEnjoyment === 'number')),
      recentOnly: scopeFor(progress.filter(l => l.mediaId === mediaId &&
        typeof l.sessionEnjoyment === 'number')),
      evidence: sessions.length + ' separately rated sessions, average ' + round(average) + '/5. Chronological session scores: ' +
        sessions.map(s => s.date + '=' + s.score + '/5').join(', ') +
        '. These are individual-session reactions and NOT the full-work rating.' });
  }
  touched.filter(m => m.userRating != null && m.reviewScore != null)
    .sort((a, b) => Math.abs((b.userRating || 0) - (b.reviewScore || 0)) - Math.abs((a.userRating || 0) - (a.reviewScore || 0)))
    .slice(0, 8).forEach(m => {
      const largeGap = isSignificantTasteGap(m.userRating!, m.reviewScore!);
      add({ id: 'taste-' + m.id, kind: largeGap ? 'taste' : 'insight',
        title: (largeGap ? 'Meaningful critic disagreement: ' : 'Personal take: ') + m.title,
        mediaId: m.id,
        recentOnly: scopeFor(progress.filter(l => l.mediaId === m.id && value(l) > 0)),
        evidence: 'Rating recorded by period end for ' + m.title + ': user ' + m.userRating + '/5, currently listed critics ' + m.reviewScore +
          '/5. The user rating is reconstructed from a dated personal opinion snapshot; the critic score is source metadata.' +
          (largeGap ? ' This gap is large enough to consider a visual comparison, but only if the story gains something from it.' :
            ' This small gap is NOT an infographic-worthy disagreement; a specific written review may still be worth discussing.') +
          (m.userReview ? ' Review: ' + m.userReview.slice(0, 500) : ''),
        ...(largeGap ? { bars: [
          { label: 'You', value: round((m.userRating || 0) * 20), note: m.userRating + ' / 5' },
          { label: 'Critics', value: round((m.reviewScore || 0) * 20), note: m.reviewScore + ' / 5' },
        ], analytic: {
          kind: 'duel' as const, unit: 'percent' as const,
          points: [
            { label: 'Your rating', value: round((m.userRating || 0) * 20), note: m.userRating + ' / 5' },
            { label: 'Critic rating', value: round((m.reviewScore || 0) * 20), note: m.reviewScore + ' / 5' },
          ],
        } } : {}),
      });
    });
  const places = new Map<string, ProgressLog[]>();
  for (const l of progress) if (l.location?.trim()) {
    const key = l.location.trim();
    places.set(key, [...(places.get(key) || []), l]);
  }
  [...places].sort((a, b) => b[1].length - a[1].length).slice(0, 12).forEach(([place, matches], i) => {
    const locationTotals = new Map<string, number>();
    for (const log of matches) {
      const amount = value(log);
      if (amount > 0) locationTotals.set(log.mediaId, (locationTotals.get(log.mediaId) || 0) + amount);
    }
    const mostSubstantial = [...locationTotals].sort((a, b) => b[1] - a[1])
      .slice(0, 2).map(([id]) => byId.get(id)?.title).filter(Boolean);
    const dates = [...new Set(matches.map(l => format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd')))];
    add({ id: 'place-' + i, kind: 'location', title: 'Recorded place: ' + place,
      phase: phaseFor(matches), recentOnly: scopeFor(matches),
      mediaId: mostSubstantial.length ? [...locationTotals].sort((a, b) => b[1] - a[1])[0]?.[0] : matches[0]?.mediaId,
      mediaIds: [...new Set(matches.map(l => l.mediaId))],
      evidence: 'User explicitly logged progress at "' + place + '" on ' + dates.length +
        ' different recorded dates. Principal media here by normalized progress: ' +
        (mostSubstantial.join(' and ') || 'none measurable') +
        '. Other titles may also have been logged; their number is not inherently noteworthy. The place label does NOT prove travel purpose, reasons for media selection or emotional state.' });
  });
  // Do NOT manufacture a 'crossover' fact from ordinary same-day media use.
  // This tracker spans all entertainment media; such combinations are routine.
  // Specific, meaningful coincidences remain available through logged
  // locations, journal thoughts, reviews and other verified evidence above.
  const previousIdSet = new Set(logs.map(l => l.id));
  const oldProgress = history.filter(l => !previousIdSet.has(l.id) && l.metricType !== 'statusChange');
  for (const m of touched) {
    const first = progress.filter(l => l.mediaId === m.id).map(l => parseISO(l.timestamp).getTime()).sort((a, b) => a - b)[0];
    const last = oldProgress.filter(l => l.mediaId === m.id && parseISO(l.timestamp).getTime() < first)
      .map(l => parseISO(l.timestamp).getTime()).sort((a, b) => b - a)[0];
    const gap = first && last ? Math.floor((first - last) / 86400000) : 0;
    if (gap >= 30) add({ id: 'comeback-' + m.id, kind: 'return', title: 'Return to ' + m.title, mediaId: m.id,
      phase: phaseFor(progress.filter(l => l.mediaId === m.id && value(l) > 0)),
      recentOnly: scopeFor(progress.filter(l => l.mediaId === m.id && value(l) > 0)),
      evidence: 'Gap between logged progress sessions for ' + m.title + ': ' + gap + ' days. This is NOT proof of abandonment.' });
  }
  const start = timeIdDate(timeframe, timeId);
  const past = Array.from({ length: 8 }, (_, index) => {
    const subset = oldProgress.filter(l => within(l, period(backward(start, timeframe, index + 1), timeframe)));
    const pages = subset.reduce((s, l) => s + value(l), 0);
    const shares = new Map<string, number>();
    for (const l of subset) {
      const type = byId.get(l.mediaId)?.mediaType;
      if (type) shares.set(type, (shares.get(type) || 0) + value(l));
    }
    return { pages, shares };
  }).filter(p => p.pages > 0);
  if (past.length >= 3 && total > 0) {
    [...byType].sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([type, pages]) => {
      const share = pages / total;
      const baseline = past.reduce((s, p) => s + (p.shares.get(type) || 0) / p.pages, 0) / past.length;
      if (isSignificantFormatShift(share, baseline)) add({
        id: 'outlier-' + type, kind: 'outlier', title: type + ' vs your usual mix',
        evidence: type + ' accounted for ' + Math.round(share * 100) + '% of Master Pages this period, compared with ' +
          Math.round(baseline * 100) + '% across ' + past.length + ' earlier active ' + timeframe +
          ' periods. Normalized Master Pages are NOT hours; gaps in logging may limit conclusions.',
        bars: [
          { label: 'Previous periods', value: round(baseline * 100), note: 'Average of ' + past.length + ' active periods' },
          { label: 'This period', value: round(share * 100), note: 'Share of Master Pages' },
        ],
        analytic: { kind: 'shift', unit: 'percent', points: [
          { label: 'Your usual ' + type + ' share', value: round(baseline * 100),
            note: 'Average of ' + past.length + ' prior active ' + timeframe + ' periods' },
          { label: type + ' this period', value: round(share * 100),
            note: 'Percent of normalized Master Pages, not time spent' },
        ] },
      });
    });
  }
  // A genuinely lopsided month can support an ARC data scene, but only
  // when the phase distribution itself tells a substantial story. Otherwise
  // the clusters remain editorial context, not an obligatory chart.
  if (timeframe === 'month' && monthlyCoverage?.clusters?.length === 3) {
    const clusters = monthlyCoverage.clusters;
    const values = clusters.map(cluster => cluster.progressShare);
    if (monthlyCoverage.requiredPhases.length >= 2 &&
        Math.max(...values) - Math.min(...values) >= 25) {
      add({ id: 'month-arc', kind: 'rhythm',
        title: 'Where the month actually happened',
        evidence: 'Recorded normalized progress was not distributed evenly: ' +
          clusters.map(cluster => cluster.phase + ' ' + cluster.progressShare + '%').join(', ') +
          '. Show this ONLY if the concentration across phases makes a substantive point. Percentages of Master Pages, NOT hours or total attention.',
        mediaIds: [...new Set(clusters.flatMap(cluster =>
          cluster.leadingWorks.slice(0, 1).map(work => work.id)))],
        analytic: { kind: 'arc', unit: 'percent', points: clusters.map(cluster => ({
          label: cluster.phase === 'early' ? 'Days 1–10' :
            cluster.phase === 'middle' ? 'Days 11–20' : 'Days 21–end',
          value: cluster.progressShare,
          note: cluster.leadingWorks[0]?.title || 'No substantial recorded activity',
        })) },
      });
    }
  }
  if (timeframe !== 'week') {
    const buckets = new Map<string, Map<string, number>>();
    for (const l of progress) {
      const dt = subHours(parseISO(l.timestamp), 5);
      const key = timeframe === 'month' ? format(startOfISOWeek(dt), 'yyyy-MM-dd') : format(dt, 'yyyy-MM');
      if (!buckets.has(key)) buckets.set(key, new Map());
      const b = buckets.get(key)!;
      b.set(l.mediaId, (b.get(l.mediaId) || 0) + value(l));
    }
    const beats: StoryBeat[] = [...buckets].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, ms]) => {
        const top: [string, number] | undefined = [...ms].sort((a, b) => b[1] - a[1])[0];
        return { label: timeframe === 'month' ? 'Week of ' + key : key, title: top ? byId.get(top[0])?.title || 'Unknown' : 'Unknown',
          detail: round(top?.[1] || 0) + ' MP' };
      }).filter(b => b.title !== 'Unknown');
    if (beats.length >= 3) add({ id: 'timeline', kind: 'timeline', title: 'Changing leaders across the period',
      evidence: 'In each active ' + (timeframe === 'month' ? 'week' : 'month') + ', the most logged title changed as shown. Do not call these invented psychological eras.',
      beats: beats.slice(0, 16) });
  }
  return {
    timeframe, timeId, facts,
    ...(monthlyCoverage ? { monthlyCoverage } : {}),
    editorialCalibration: focusEditorialCalibration(focus),
    editorialSalience: salienceSummary,
    bounds: { start: format(period(start, timeframe).start, 'yyyy-MM-dd'), end: format(period(start, timeframe).end, 'yyyy-MM-dd') },
    media: [...touched].sort((a, b) => {
      const ai = editorialCandidates.findIndex(s => s.mediaId === a.id);
      const bi = editorialCandidates.findIndex(s => s.mediaId === b.id);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    }).map(m => ({ id: m.id, title: m.title, type: m.mediaType, year: m.year, genres: (m.genres || []).slice(0, 6),
      rating: m.userRating, review: m.userReview?.slice(0, 450) })).slice(0, 45),
  };
}
