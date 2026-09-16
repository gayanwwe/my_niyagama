import { Officer } from '../../types';

export const ATTENDANCE_RULES = {
  STANDARD: {
    START: '08:30',
    END: '16:15',
    BUFFER_START: '08:15',
    BUFFER_END: '16:00',
    LATE_GRACE_LIMIT: 2, // 2 days per month
    SHORT_LEAVE_MAX_MINS: 90,
    MORNING_SL: { START: '08:30', END: '10:00' },
    EVENING_SL: { START: '14:45', END: '16:15' },
    HALF_DAY_MIN_HOURS: 4,
    HALF_DAY_BEFORE_830_OFF: '12:00',
    MORNING_HALF_DAY_MAX_ARRIVAL: '12:30',
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

  // Rule 2: If attend 8.15am or before can off 4.00pm
  if (mins <= bufferStart) return ATTENDANCE_RULES.STANDARD.BUFFER_END;
  
  // Rule 3: If attend 8.30am or before can off 4.15pm
  if (mins <= stdStart) return ATTENDANCE_RULES.STANDARD.END;
  
  // Rule 4: 8.30 - 9.00 cover late time
  // For Field Officers, they ALWAYS cover late time (Rule 7)
  return minsToTime(stdEnd + (mins - stdStart));
}

export function validateHalfDay(arrivalTime: string, departureTime: string, isMorningHalfDay: boolean = false): boolean {
  const inMins = timeToMins(arrivalTime);
  const outMins = timeToMins(departureTime);

  if (isMorningHalfDay) {
    // Rule 6c: Morning half day must attend 12:30 or before
    return inMins <= timeToMins(ATTENDANCE_RULES.STANDARD.MORNING_HALF_DAY_MAX_ARRIVAL);
  }

  // Rule 6a: Attended 8:30 or before, can off 12:00
  if (inMins <= timeToMins(ATTENDANCE_RULES.STANDARD.START)) {
    return outMins >= timeToMins(ATTENDANCE_RULES.STANDARD.HALF_DAY_BEFORE_830_OFF);
  }

  // Rule 6b: Attended after 8:30, must work 4 hours
  return (outMins - inMins) >= (ATTENDANCE_RULES.STANDARD.HALF_DAY_MIN_HOURS * 60);
}

export function getShortLeaveWindow(officer: Officer, type: 'MORNING' | 'EVENING', arrivalTime?: string) {
  const isLabor = isKKS(officer.post || '');
  const rules = isLabor ? ATTENDANCE_RULES.KKS : ATTENDANCE_RULES.STANDARD;
  const window = type === 'MORNING' ? rules.MORNING_SL : rules.EVENING_SL;

  if (type === 'EVENING' && arrivalTime && !isLabor) {
    // Rule 5d: Late arrival reduces short leave time
    const arrMins = timeToMins(arrivalTime);
    const stdStart = timeToMins(ATTENDANCE_RULES.STANDARD.START);
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
