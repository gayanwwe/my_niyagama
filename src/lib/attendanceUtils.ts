import { Officer } from '../../types';

export const ATTENDANCE_RULES = {
  STANDARD: {
    START: '08:30',
    END: '16:15',
    BUFFER_START: '08:15',
    BUFFER_END: '16:00',
    LATE_GRACE_LIMIT: 2, // 2 days per month
    SHORT_LEAVE_MAX_MINS: 90,
    SHORT_LEAVE_COUNT: 2, // 2 times per month
    MORNING_SL: { START: '08:30', END: '10:00' },
    EVENING_SL: { START: '14:45', END: '16:15' },
    HALF_DAY_MIN_HOURS: 4,
    HALF_DAY_BEFORE_830_OFF: '12:00',
    MORNING_HALF_DAY_MAX_ARRIVAL: '12:30',
    TOTAL_LEAVES_PER_YEAR: 42,
  },
  KKS: {
    START: '08:00',
    END: '16:45',
    SHORT_LEAVE_MAX_MINS: 90,
    MORNING_SL: { START: '08:00', END: '09:30' },
    EVENING_SL: { START: '15:15', END: '16:45' },
  }
};

export const EXCLUDED_LEADERBOARD_POSTS = ['Administrative Officer', 'Grama Niladari', 'Field Officer'];

export function isKKS(post: string) {
  return post?.toUpperCase().includes('KKS');
}

export function isFieldOfficer(post: string) {
  return post?.toUpperCase().includes('FIELD') || post?.toUpperCase().includes('GRAMA NILADARI') || post?.toUpperCase().includes('ADMINISTRATIVE');
}

/**
 * Converts "HH:mm" to minutes since midnight
 */
export function timeToMins(time: string): number {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converts minutes to "HH:mm"
 */
export function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function calculateRequiredOffTime(arrivalTime: string, officer: Officer): string {
  const mins = timeToMins(arrivalTime);
  
  if (isKKS(officer.post || '')) {
    const kksStart = timeToMins(ATTENDANCE_RULES.KKS.START);
    const kksEnd = timeToMins(ATTENDANCE_RULES.KKS.END);
    if (mins <= kksStart) return ATTENDANCE_RULES.KKS.END;
    return minsToTime(kksEnd + (mins - kksStart));
  }

  const stdStart = timeToMins(ATTENDANCE_RULES.STANDARD.START);
  const stdEnd = timeToMins(ATTENDANCE_RULES.STANDARD.END);
  const bufferStart = timeToMins(ATTENDANCE_RULES.STANDARD.BUFFER_START);
  const bufferEnd = timeToMins(ATTENDANCE_RULES.STANDARD.BUFFER_END);

  // Arrive <= 08:15 -> Depart 16:00
  if (mins <= bufferStart) return ATTENDANCE_RULES.STANDARD.BUFFER_END;
  
  // Arrive > 08:15 but <= 08:30 -> Depart 16:15 MINIMUM
  if (mins <= stdStart) return ATTENDANCE_RULES.STANDARD.END;
  
  // Arrive > 08:30 -> Depart 16:15 + (Arrive - 08:30)
  return minsToTime(stdEnd + (mins - stdStart));
}

export function validateHalfDay(arrivalTime: string, departureTime: string, isMorningHalfDay: boolean = false): boolean {
  const inMins = timeToMins(arrivalTime);
  const outMins = timeToMins(departureTime);

  if (isMorningHalfDay) {
    // Rule 6c: Morning half day must attend 12:30 or before
    return inMins <= timeToMins(ATTENDANCE_RULES.STANDARD.MORNING_HALF_DAY_MAX_ARRIVAL);
  }

  // 02. An officer who attends early any time before 8.15 still must stay until 12.00 or after to use a half day
  if (inMins <= timeToMins(ATTENDANCE_RULES.STANDARD.BUFFER_START)) {
    return outMins >= timeToMins(ATTENDANCE_RULES.STANDARD.HALF_DAY_BEFORE_830_OFF);
  }

  // Rule 6a: Attended 8:30 or before, can off 12:00
  if (inMins <= timeToMins(ATTENDANCE_RULES.STANDARD.START)) {
    return outMins >= timeToMins(ATTENDANCE_RULES.STANDARD.HALF_DAY_BEFORE_830_OFF);
  }

  // Rule 6b: Attended after 8:30, must work 4 hours
  // (e.g. 10:30 needs 4 hours -> until 14:30)
  return (outMins - inMins) >= (ATTENDANCE_RULES.STANDARD.HALF_DAY_MIN_HOURS * 60);
}

export function getShortLeaveWindow(officer: Officer, type: 'MORNING' | 'EVENING', arrivalTime?: string) {
  const isLabor = isKKS(officer.post || '');
  const rules = isLabor ? ATTENDANCE_RULES.KKS : ATTENDANCE_RULES.STANDARD;
  const window = type === 'MORNING' ? rules.MORNING_SL : rules.EVENING_SL;

  if (type === 'EVENING' && arrivalTime && !isLabor) {
    const arrMins = timeToMins(arrivalTime);
    const bufferStart = timeToMins(ATTENDANCE_RULES.STANDARD.BUFFER_START);
    const stdStart = timeToMins(ATTENDANCE_RULES.STANDARD.START);

    // 03. An officer who attends early before 08.15 must stay until 14.45 to use short leave
    if (arrMins <= bufferStart) {
      return {
        START: '14:45',
        END: '16:15'
      };
    }

    // Rule 5d: Late arrival reduces short leave time
    if (arrMins > stdStart) {
      const delay = arrMins - stdStart;
      const originalStart = timeToMins(window.START);
      return {
        START: minsToTime(originalStart + delay),
        END: window.END
      };
    }
  }

  return window;
}

export function calculateAttendanceStatus(
  arrivalTime: string, 
  departureTime: string, 
  officer: Officer,
  graceDaysUsedThisMonth: number = 0,
  shortLeavesUsedThisMonth: number = 0,
  date?: string
): { status: string; shortLeaveMinutesUsed?: number; graceDayUsed?: boolean } {
  const inMins = timeToMins(arrivalTime);
  const outMins = timeToMins(departureTime);

  const hasDeparture = !!departureTime && departureTime !== arrivalTime;

  // If on the current day, calculate as PRESENT if no out-time logs exist yet
  // Out-time is considered not available if it's blank/undefined or equals arrivalTime
  if (date) {
    const todayStr = new Date().toLocaleDateString('en-CA');
    if (date === todayStr) {
      if (!hasDeparture) {
        return { status: 'PRESENT' };
      }
    }
  }

  // A past day with an arrival but no departure scan. The officer almost
  // certainly worked; the device simply missed the second scan. Treating this
  // as a HALF_DAY silently deducted half a day of casual leave for the most
  // common hardware fault there is, so it is flagged for a human to resolve
  // (via POST /attendance/manual) and deducts nothing in the meantime.
  if (!hasDeparture) {
    return { status: 'MISSING_PUNCH' };
  }

  // Rule 06: If officer off before 11:00, assume "OFF TO FIELD"
  // Both biometric logs marked before 11.00
  if (inMins > 0 && outMins > 0 && outMins <= (11 * 60) && arrivalTime !== departureTime) {
    return { status: 'FIELD' };
  }

  const requiredOutStr = calculateRequiredOffTime(arrivalTime, officer);
  const requiredOutMins = timeToMins(requiredOutStr);

  // If already left after required time
  if (outMins >= requiredOutMins) return { status: 'PRESENT' };

  const deficit = requiredOutMins - outMins;
  const stdStartMins = timeToMins(ATTENDANCE_RULES.STANDARD.START);

  // 1. Grace Period (ONLY for late arrivers - i.e., arrived after 08:30)
  // Requirement: Arrived late (> 08:30) AND stayed until at least 16:15.
  // This allows them to "ignore" the extra late time they were supposed to cover.
  const graceThresholdMins = timeToMins('16:15');
  if (inMins > stdStartMins && 
      outMins >= graceThresholdMins && 
      graceDaysUsedThisMonth < ATTENDANCE_RULES.STANDARD.LATE_GRACE_LIMIT) {
    return { status: 'PRESENT', graceDayUsed: true };
  }

  // 2. Short Leave (if finished or not eligible for grace day)
  if (shortLeavesUsedThisMonth < ATTENDANCE_RULES.STANDARD.SHORT_LEAVE_COUNT && 
      deficit <= ATTENDANCE_RULES.STANDARD.SHORT_LEAVE_MAX_MINS) {
    return { status: 'SHORT_LEAVE', shortLeaveMinutesUsed: deficit };
  }

  // Fallback: If no grace days/short leaves left, even 1 min early (e.g. 16:14) counts as HALF_DAY
  return { status: 'HALF_DAY' };
}
