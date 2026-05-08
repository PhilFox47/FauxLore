import { format, parseISO, differenceInDays, subHours } from 'date-fns';
import { ProgressLog } from '../types/schema';

export function calculateStreak(logs: ProgressLog[]): number {
  const historicalFilteredLogs = logs.filter(l => l.timestamp && !l.timestamp.startsWith('1970-01-01'));
  if (historicalFilteredLogs.length === 0) return 0;
  
  // Shift all timestamps by -5 hours
  // So 00:00 - 04:59 belongs to the previous calendar day
  const uniqueDates = Array.from(new Set<string>(
    historicalFilteredLogs.map(l => format(subHours(parseISO(l.timestamp), 5), 'yyyy-MM-dd'))
  ));
  uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  
  if (uniqueDates.length === 0) return 0;

  // Also shift "today" by -5 hours
  const todayDateStr = format(subHours(new Date(), 5), 'yyyy-MM-dd');
  let streak = 0;
  
  // Check if the streak is active today or yesterday
  let currentDateToCheck = new Date(uniqueDates[0]);
  const daysSinceMostRecentLog = differenceInDays(new Date(todayDateStr), currentDateToCheck);
  
  if (daysSinceMostRecentLog > 1) {
     return 0; // Streak broken
  }

  streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
     const prevDate = new Date(uniqueDates[i]);
     if (differenceInDays(currentDateToCheck, prevDate) === 1) {
       streak++;
       currentDateToCheck = prevDate;
     } else {
       break;
     }
  }

  return streak;
}
