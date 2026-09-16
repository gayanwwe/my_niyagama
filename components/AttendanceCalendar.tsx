import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay, addMonths, subMonths, isAfter, isBefore, startOfDay } from 'date-fns';
import { api } from '../service/api';
import { calculateRequiredOffTime, ATTENDANCE_RULES } from '../src/lib/attendanceUtils';

interface AttendanceCalendarProps {
  user: any;
  lang: 'EN' | 'SI';
}

const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({ user, lang }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [attendance, setAttendance] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const t = (si: string, en: string) => lang === 'SI' ? si : en;

  const minDate = subMonths(startOfMonth(new Date()), 23); // 24 months including current
  const maxDate = new Date();

  useEffect(() => {
    const fetchAttendance = async () => {
      if (!user?.id) return;
      setIsLoading(true);
      try {
        const res = await api.getOfficerAttendance(
          user.id, 
          currentMonth.getFullYear(), 
          currentMonth.getMonth() + 1
        );
        setAttendance(res.attendance || []);
        setHolidays(res.holidays || []);
      } catch (error) {
        console.error('Failed to fetch attendance:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAttendance();
  }, [user?.id, currentMonth]);

  const start = startOfMonth(currentMonth);
  const end = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start, end });

  // Fill leading empty days
  const firstDayOfWeek = start.getDay();
  const leadingEmptyDays = Array.from({ length: firstDayOfWeek });

  const getDayData = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const att = attendance.find(a => a.date.startsWith(dateStr));
    const holiday = holidays.find(h => h.date.startsWith(dateStr));
    return { att, holiday };
  };

  const getDayStyles = (day: Date) => {
    const { att, holiday } = getDayData(day);
    
    if (holiday) return 'bg-yellow-400 text-slate-900 shadow-sm ring-1 ring-yellow-500/20';
    
    if (!att) {
      // If it's a weekday and in the past, and no data, it's ABSENT/LEAVE as per requirement 3
      const dayOfWeek = day.getDay();
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
      const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
      if (isWeekday && isPast) return 'bg-red-500 text-white shadow-lg shadow-red-500/20';
      return 'bg-slate-50 text-slate-400';
    }

    switch (att.status) {
      case 'PRESENT':
        return 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20';
      case 'FIELD':
        return 'bg-blue-400 text-white shadow-lg shadow-blue-500/20';
      case 'ABSENT':
        return 'bg-red-500 text-white shadow-lg shadow-red-500/20';
      case 'HALF_DAY':
        return 'bg-pink-500 text-white shadow-lg shadow-pink-500/20';
      case 'SHORT_LEAVE':
        return 'bg-orange-500 text-white shadow-lg shadow-orange-500/20';
      case 'LEAVE':
        return 'bg-red-500 text-white shadow-lg shadow-red-500/20';
      default:
        return 'bg-slate-100 text-slate-400';
    }
  };

  const handlePrevMonth = () => {
    const prev = subMonths(currentMonth, 1);
    if (!isBefore(prev, minDate)) {
      setCurrentMonth(prev);
    }
  };

  const handleNextMonth = () => {
    const next = addMonths(currentMonth, 1);
    if (!isAfter(next, maxDate)) {
      setCurrentMonth(next);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tighter">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
            {t('පැමිණීමේ දින දර්ශනය', 'Attendance History')}
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handlePrevMonth}
            disabled={isBefore(subMonths(currentMonth, 1), minDate)}
            className="p-3 bg-white border border-slate-100 rounded-2xl hover:bg-slate-50 disabled:opacity-30 transition-all shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <button 
            onClick={handleNextMonth}
            disabled={isAfter(addMonths(currentMonth, 1), maxDate)}
            className="p-3 bg-white border border-slate-100 rounded-2xl hover:bg-slate-50 disabled:opacity-30 transition-all shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>

      <div className="bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-100">
        <div className="grid grid-cols-7 gap-3">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
            <div key={d} className="text-center text-[9px] font-black text-slate-400 uppercase py-2 tracking-widest">{d}</div>
          ))}
          
          {leadingEmptyDays.map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}

          {days.map(day => {
            const styles = getDayStyles(day);
            const isTodayDay = isToday(day);
            const { att } = getDayData(day);
            const requiredOff = att?.time_in ? calculateRequiredOffTime(att.time_in, user) : null;
            const isLate = att?.time_in && att.time_in > ATTENDANCE_RULES.STANDARD.START;

            return (
              <div
                key={day.toISOString()}
                onClick={() => att?.time_in && alert(`${t('පැමිණීම', 'Arrival')}: ${att.time_in}\n${att.time_out ? `${t('පිටවීම', 'Off')}: ${att.time_out}` : ''}`)}
                className={`aspect-square rounded-2xl flex flex-col items-center justify-center transition-all relative group cursor-pointer ${styles} ${
                  isTodayDay ? 'ring-4 ring-blue-500/20' : ''
                }`}
              >
                {att?.time_in && (
                  <span className="text-[5px] md:text-[8px] font-black absolute top-0.5 md:top-1 w-full text-center px-0.5 leading-none tracking-tighter opacity-70 truncate">
                    {att.time_in.substring(0, 5)}
                  </span>
                )}
                <span className="text-[10px] md:text-lg font-black relative top-0.5 md:top-0">{format(day, 'd')}</span>
                {att?.time_out && (
                  <span className="text-[5px] md:text-[8px] font-black absolute bottom-0.5 md:bottom-1 w-full text-center px-0.5 leading-none tracking-tighter opacity-70 truncate">
                    {att.time_out.substring(0, 5)}
                  </span>
                )}
                {isLate && att?.status === 'PRESENT' && (
                  <div className="absolute top-1 left-1 w-1 h-1 bg-red-400 rounded-full" />
                )}
                {isTodayDay && (
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white shadow-sm" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4">
        <LegendItem color="bg-emerald-500" label={t('පැමිණි', 'Present')} />
        <LegendItem color="bg-red-500" label={t('නොපැමිණි', 'Absent')} />
        <LegendItem color="bg-pink-500" label={t('අර්ධ දින', 'Half Day')} />
        <LegendItem color="bg-orange-500" label={t('කෙටි නිවාඩු', 'Short Leave')} />
        <LegendItem color="bg-yellow-400" label={t('නිවාඩු දින', 'Holiday')} />
        <LegendItem color="bg-slate-100" label={t('දත්ත නොමැත', 'No Data')} />
      </div>
    </div>
  );
};

const LegendItem = ({ color, label }: { color: string, label: string }) => (
  <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
    <div className={`w-4 h-4 rounded-lg ${color}`} />
    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
  </div>
);

export default AttendanceCalendar;
