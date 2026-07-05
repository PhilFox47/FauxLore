import { ProgressLog } from '../types/schema';

export const SESSION_GAP_HOURS = 6;
export const SESSION_GAP_MS = SESSION_GAP_HOURS * 60 * 60 * 1000;

export interface LogSession {
  id: string;               // id of the first (earliest) log in the session
  mediaId: string;
  logs: ProgressLog[];      // progress logs in the session, ascending by time
  metricType: string;       // metric type of the session (taken from the first log)
  totalDelta: number;       // summed delta across the whole session
  startTimestamp: string;   // earliest log timestamp
  endTimestamp: string;     // latest log timestamp
  notes: string[];          // non-empty notes, in chronological order
  location?: string;        // last non-empty location logged in the session
  isHistoric: boolean;      // true only if every log in the session is historic
}

/**
 * Groups progress logs into "sessions".
 *
 * Consecutive logs for the SAME media that are no more than 6 hours apart, with no other
 * media logged in between, are treated as a single continuous session — the same rule the
 * server uses when deciding whether an equipped Artifact should spend durability again
 * (see POST /api/logs). Because logs are walked in chronological order, a log for a
 * different media (or a gap of more than 6 hours) always ends the current session, which
 * satisfies the "nothing else logged in between" requirement.
 *
 * statusChange logs carry no progress and are ignored here; callers that need to display
 * them (e.g. the Lorebook) handle those entries separately.
 */
export function groupLogsIntoSessions(logs: ProgressLog[]): LogSession[] {
  const progress = logs
    .filter(l => l && l.metricType !== 'statusChange')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const sessions: LogSession[] = [];
  let current: LogSession | null = null;

  for (const log of progress) {
    const ts = new Date(log.timestamp).getTime();
    const withinGap = current
      && current.mediaId === log.mediaId
      && ts - new Date(current.endTimestamp).getTime() <= SESSION_GAP_MS;

    if (current && withinGap) {
      current.logs.push(log);
      current.totalDelta += log.delta;
      current.endTimestamp = log.timestamp;
      if (log.note && log.note.trim()) current.notes.push(log.note.trim());
      if (log.location && log.location.trim()) current.location = log.location.trim();
      if (!log.isHistoric) current.isHistoric = false;
    } else {
      if (current) sessions.push(current);
      current = {
        id: log.id,
        mediaId: log.mediaId,
        logs: [log],
        metricType: log.metricType,
        totalDelta: log.delta,
        startTimestamp: log.timestamp,
        endTimestamp: log.timestamp,
        notes: log.note && log.note.trim() ? [log.note.trim()] : [],
        location: log.location && log.location.trim() ? log.location.trim() : undefined,
        isHistoric: !!log.isHistoric,
      };
    }
  }
  if (current) sessions.push(current);

  return sessions;
}
