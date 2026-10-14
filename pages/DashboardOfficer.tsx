
import React, { useState, useMemo, useEffect } from 'react';
import * as ReactRouterDom from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Officer, AttendanceRecord, LeaderboardEntry, LeaveRequest } from '../types';
import { api } from '../service/api';
import { translations, TranslationKey } from '../service/i18n';
import { Skeleton } from '../components/Skeleton';

// Destructure from namespace import to resolve "no exported member" errors
const { useNavigate } = ReactRouterDom;

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

const StatCard: React.FC<{ label: string; value: string; sub: string; color: string; icon: string; onClick?: () => void; active?: boolean }> = ({ label, value, sub, color, icon, onClick, active }) => (
  <motion.div 
    whileHover={{ y: -5 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`bg-[var(--card)] p-6 rounded-3xl shadow-sm border min-w-[240px] sm:min-w-0 ${active ? 'border-[#1877F2] ring-4 ring-[#1877F2]/5' : 'border-[var(--border)]'} flex flex-col justify-between hover:shadow-lg hover:border-[#1877F2]/20 transition-all cursor-pointer group ${onClick ? 'active:scale-95' : ''}`}
  >
    <div className="flex justify-between items-start">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{label}</p>
      <span className="text-xl group-hover:scale-125 transition-transform">{icon}</span>
    </div>
    <h3 className={`text-3xl font-black my-3 tracking-tighter ${color}`}>{value}</h3>
    <p className={`text-[10px] font-bold uppercase tracking-tight ${active ? 'text-[#1877F2]' : 'text-slate-400'}`}>{sub}</p>
  </motion.div>
);

const AttendanceLeaderboard: React.FC<{ lang: 'EN' | 'SI' }> = ({ lang }) => {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAttendanceLeaderboard().then(setLeaders).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-[400px] w-full rounded-[3.5rem]" />;

  return (
    <div className="bg-slate-900 p-8 rounded-[3.5rem] text-white shadow-2xl space-y-8 relative overflow-hidden group">
       <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-45 transition-transform duration-700 text-6xl">🏆</div>
       <div className="relative z-10">
          <h3 className="text-2xl font-black tracking-tight">Leaderboard</h3>
          <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mt-1">Yearly Reliability Pulse</p>
       </div>

       <div className="space-y-4 max-h-[420px] overflow-y-auto no-scrollbar">
          {leaders.map((l, idx) => (
             <div key={l.officer_id} className={`flex items-center gap-4 p-4 rounded-3xl transition-all ${idx === 0 ? 'bg-gradient-to-r from-amber-500/20 to-transparent border border-amber-500/20' : 'hover:bg-white/5'}`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${idx === 0 ? 'bg-amber-500 text-white shadow-[0_0_10px_#f59e0b]' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-orange-600 text-white' : 'text-slate-600'}`}>
                   {idx + 1}
                </div>
                <div className="w-10 h-10 rounded-2xl overflow-hidden border-2 border-white/10">
                   <img src={l.avatar || `https://ui-avatars.com/api/?name=${l.name}&background=random&color=fff`} className="w-full h-full object-cover" alt="p" />
                </div>
                <div className="flex-1 min-w-0">
                   <h5 className="text-xs font-black truncate">{l.name}</h5>
                   <p className="text-[8px] font-bold text-slate-500 uppercase">{l.post}</p>
                </div>
                <div className="flex items-center gap-2">
                   {idx === 0 && (
                      <div className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-[7px] font-black text-amber-500 uppercase tracking-widest">
                         Elite
                      </div>
                   )}
                   {l.score > 90 && (
                      <div className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-[7px] font-black text-blue-500 uppercase tracking-widest">
                         Consistent
                      </div>
                   )}
                </div>
                <div className="text-right">
                   <p className="text-xs font-black text-blue-400 tabular-nums">{l.score}</p>
                   <p className="text-[7px] font-black text-slate-600 uppercase">Points</p>
                </div>
             </div>
          ))}
          {leaders.length === 0 && (
             <div className="py-20 text-center opacity-30">
                <p className="text-[10px] font-black uppercase tracking-widest">Calculating Standings...</p>
             </div>
          )}
       </div>

       <div className="pt-4 border-t border-white/5 relative z-10">
          <p className="text-[8px] text-white/30 italic text-center uppercase tracking-widest font-black">
             Updates every hardware sync
          </p>
       </div>
    </div>
  );
};

const ExecutivePresencePanel: React.FC<{ lang: 'EN' | 'SI' }> = ({ lang }) => {
  const [executives, setExecutives] = useState<any[]>([]);

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA');
    api.getExecutiveAvailabilitySummary(today).then(setExecutives).catch(console.error);
  }, []);

  if (executives.length === 0) return null;

  return (
    <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
      <div className="flex justify-between items-center mb-8">
        <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-3">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
          {lang === 'SI' ? 'විධායක නිලධාරීන්ගේ පැමිණීම' : 'Executive Presence (Today)'}
        </h4>
        <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full">
           LIVE PULSE
        </div>
      </div>
      
      <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory sm:grid sm:grid-cols-3 lg:grid-cols-6 sm:overflow-visible">
        {executives.map((exec, i) => (
          <div key={i} className="flex flex-col items-center group snap-center min-w-[120px] sm:min-w-0">
            <div className="relative p-1.5 rounded-[2rem] border-2 transition-all group-hover:scale-105 group-hover:-translate-y-1">
              <div className={`rounded-[1.8rem] overflow-hidden ${['OFFLINE', 'LEFT'].includes(exec.status_label) ? 'grayscale opacity-60' : ''}`}>
                 <img 
                   src={exec.profile_pic || `https://ui-avatars.com/api/?name=${exec.name}&background=random&color=fff`} 
                   className="w-16 h-16 object-cover" 
                   alt={exec.name} 
                 />
              </div>
              <span className={`absolute -bottom-1 -right-1 w-5 h-5 border-4 border-white rounded-full shadow-sm ${
                exec.status_label === 'AVAILABLE' ? 'bg-emerald-500' :
                exec.status_label === 'BUSY' ? 'bg-amber-500' :
                exec.status_label === 'OFF TO FIELD' ? 'bg-blue-500' :
                exec.status_label === 'ON LEAVE' ? 'bg-purple-500' :
                exec.status_label === 'LEFT' ? 'bg-slate-500' :
                'bg-slate-300'
              }`}></span>
            </div>
            
            <div className="mt-4 text-center">
              <p className="text-[10px] font-black text-slate-900 leading-tight uppercase tracking-tight truncate w-24 mx-auto">{exec.name.split(' ')[0]}</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">{exec.post}</p>
              
              <div className={`mt-2 inline-flex px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${
                exec.status_label === 'AVAILABLE' ? 'bg-emerald-50 text-emerald-600' :
                exec.status_label === 'BUSY' ? 'bg-amber-50 text-amber-600' :
                exec.status_label === 'OFF TO FIELD' ? 'bg-blue-50 text-blue-600' :
                exec.status_label === 'ON LEAVE' ? 'bg-purple-50 text-purple-600' :
                exec.status_label === 'LEFT' ? 'bg-slate-100 text-slate-500' :
                'bg-slate-100 text-slate-400'
              }`}>
                {exec.status_label}
              </div>
              {exec.eta && (
                <p className="text-[7.5px] font-black text-blue-600 uppercase tracking-tighter mt-1">
                  BACK @ {exec.eta}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DashboardOfficer: React.FC<Props> = ({ user, lang }) => {
  const navigate = useNavigate();
  const t = (key: TranslationKey) => translations[lang][key];

  const [currentTime, setCurrentTime] = useState(new Date());
  const [settings, setSettings] = useState<Record<string, string>>({
    work_start_time: '08:30',
    work_end_time: '16:15',
    grace_period_minutes: '15'
  });
  
  const [attendance, setAttendance] = useState<AttendanceRecord>({
    id: '1',
    officer_id: user.id,
    date: new Date().toISOString().split('T')[0],
    time_in: '--:--',
    is_temporary: false,
    short_leave_minutes: 0,
    is_half_day: null,
    status: 'PRESENT'
  });

  const [leaveStats, setLeaveStats] = useState({ taken: 0, total: 42, shortLeaveUsed: 0, shortLeaveTotal: 2 });
  const [activeModal, setActiveModal] = useState<'CHECKIN' | 'UNAVAILABILITY' | 'STATUS' | null>(null);
  const [checkInTime, setCheckInTime] = useState('');
  const [timeLeftStr, setTimeLeftStr] = useState<string | null>(null);
  const [isEligible, setIsEligible] = useState(false);
  const [dashboardStatus, setDashboardStatus] = useState(user.dashboard_status || 'OFFLINE');
  const [eta, setEta] = useState(user.eta || '');
  const [selectedStatus, setSelectedStatus] = useState<string>(user.dashboard_status || 'OFFLINE');
  const [publicData, setPublicData] = useState<any>({ events: [], birthdays: [] });
  
  const [quickJournal, setQuickJournal] = useState('');
  const [unavailabilityForm, setUnavailabilityForm] = useState<{ date: string, slot: 'FULL' | 'AM' | 'PM', reason: string }>({
    date: new Date().toISOString().split('T')[0],
    slot: 'FULL',
    reason: ''
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    loadInitialData();
    return () => clearInterval(timer);
  }, []);

  const loadInitialData = async () => {
    try {
      const [settingsData, attData, leaves, balancesData, publicDashboardResult] = await Promise.all([
        api.getDivisionalSettings(),
        api.getAttendance(),
        api.getMyLeaves(),
        api.getLeaveBalances().catch(() => null),
        api.getPublicDashboardData().catch(() => ({ status: 'error', data: { events: [], birthdays: [] } }))
      ]);
      setSettings(settingsData);
      if (attData) setAttendance(attData);
      
      // api.request() already unwraps `data`, so reading balancesData.data gave
      // undefined and this tile silently fell back to zeros.
      const b: any = balancesData || {};
      // Casual and vacation cascade into one another, so the tile shows the
      // combined pool rather than casual alone.
      const taken = b.combined_used ?? ((b.casual || 0) + (b.vacation || 0));
      const total = b.combined_total ?? ((b.casual_total || 21) + (b.vacation_total || 21));
      setLeaveStats({
        taken,
        total,
        // Short leave is a separate monthly allowance, reported for this month.
        shortLeaveUsed: b.short_leave_count ?? 0,
        shortLeaveTotal: b.short_leave_total ?? 2,
      });

      if (publicDashboardResult && publicDashboardResult.status === 'success') {
        const d = publicDashboardResult.data || {};
        setPublicData({
          events: d.events || [],
          birthdays: d.birthdays || []
        });
      }
    } catch (e) {
      console.error("Dashboard data load failed:", e);
    }
  };

  useEffect(() => {
    if (attendance.time_in === '--:--' || !attendance.time_in) return;

    const calculateTime = () => {
      const [h, m] = attendance.time_in.split(':').map(Number);
      const mins = h * 60 + m;
      
      const bufferStart = 8 * 60 + 15; // 08:15
      const stdStart = 8 * 60 + 30;    // 08:30
      const stdEnd = 16 * 60 + 15;     // 16:15
      const bufferEnd = 16 * 60;       // 16:00

      let requiredMins = 0;
      if (mins <= bufferStart) {
        requiredMins = bufferEnd;
      } else if (mins <= stdStart) {
        requiredMins = stdEnd;
      } else {
        requiredMins = stdEnd + (mins - stdStart);
      }
      
      const eligibilityTime = new Date(currentTime);
      eligibilityTime.setHours(Math.floor(requiredMins / 60), requiredMins % 60, 0, 0);
      
      const diff = eligibilityTime.getTime() - currentTime.getTime();

      if (diff <= 0) {
        setIsEligible(true);
        setTimeLeftStr(null);
      } else {
        setIsEligible(false);
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeftStr(`${hours}h ${mins}m ${secs}s`);
      }
    };

    calculateTime();
    const timer = setInterval(calculateTime, 1000);
    return () => clearInterval(timer);
  }, [attendance.time_in, currentTime, settings]);

  const earliestOffTime = useMemo(() => {
    if (attendance.time_in === '--:--' || !attendance.time_in) return '--:--';
    const [h, m] = attendance.time_in.split(':').map(Number);
    const mins = h * 60 + m;

    const bufferStart = 8 * 60 + 15; // 08:15
    const stdStart = 8 * 60 + 30;    // 08:30
    const stdEnd = 16 * 60 + 15;     // 16:15
    const bufferEnd = 16 * 60;       // 16:00

    let requiredMins = 0;
    if (mins <= bufferStart) {
      requiredMins = bufferEnd;
    } else if (mins <= stdStart) {
      requiredMins = stdEnd;
    } else {
      requiredMins = stdEnd + (mins - stdStart);
    }

    const resH = Math.floor(requiredMins / 60);
    const resM = requiredMins % 60;
    return `${resH.toString().padStart(2, '0')}:${resM.toString().padStart(2, '0')}`;
  }, [attendance.time_in]);

  const halfDayTime = useMemo(() => {
    if (attendance.time_in === '--:--' || !attendance.time_in) return '--:--';
    const [h, m] = attendance.time_in.split(':').map(Number);
    
    const [startH, startM] = (settings.work_start_time || '08:30').split(':').map(Number);
    const [endH, endM] = (settings.work_end_time || '16:15').split(':').map(Number);
    const requiredMinutes = (endH * 60 + endM) - (startH * 60 + startM);

    let totalMinutes = h * 60 + m + Math.floor(requiredMinutes / 2); 
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }, [attendance.time_in, settings]);

  const shortLeaveTime = useMemo(() => {
    if (attendance.time_in === '--:--' || !attendance.time_in) return '--:--';
    const [h, m] = attendance.time_in.split(':').map(Number);
    
    const [startH, startM] = (settings.work_start_time || '08:30').split(':').map(Number);
    const [endH, endM] = (settings.work_end_time || '16:15').split(':').map(Number);
    const requiredMinutes = (endH * 60 + endM) - (startH * 60 + startM);

    // Short leave is typically 2 hours before official off time
    let totalMinutes = h * 60 + m + requiredMinutes - 120; 
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }, [attendance.time_in, settings]);

  const handleManualCheckIn = () => {
    if (attendance.time_in && attendance.time_in !== '--:--') return;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setCheckInTime(timeStr);
    setActiveModal('CHECKIN');
  };

  const confirmCheckIn = async () => {
    try {
      await api.checkIn(checkInTime, true);
      setAttendance(prev => ({ ...prev, time_in: checkInTime, is_temporary: true }));
      setActiveModal(null);
      alert(lang === 'SI' ? 'පැමිණීම සටහන් කරන ලදී' : 'Check-in recorded manually.');
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleUnavailabilitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.markUnavailability(unavailabilityForm);
      alert(lang === 'SI' ? 'පැමිණීමට නොහැකි බව සටහන් කරන ලදී' : 'Unavailability marked successfully');
      setActiveModal(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleStatusUpdate = async (status: string, finalEta?: string) => {
    try {
      const statusToUpdate = status || selectedStatus;
      let etaToUpdate = finalEta !== undefined ? finalEta : eta;

      // Handle numeric input as minutes automatically
      if (etaToUpdate && /^\d+$/.test(etaToUpdate.trim())) {
        const minutes = parseInt(etaToUpdate.trim());
        let prefix = "BACK IN";
        
        if (selectedStatus === 'AVAILABLE') {
          prefix = "OFF IN";
        } else if (selectedStatus === 'FIELD') {
          prefix = "FIELD FOR";
        }

        const timeStr = minutes >= 60 ? `${Math.floor(minutes/60)}H ${minutes%60 > 0 ? (minutes%60 + 'M') : ''}` : `${minutes} MIN`;
        etaToUpdate = `${prefix} ${timeStr}`;
      }

      await api.updateOfficerDashboardStatus(user.id, statusToUpdate, etaToUpdate);
      setDashboardStatus(statusToUpdate);
      setEta(etaToUpdate);
      alert("Status updated successfully");
      setActiveModal(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const setQuickEta = (minutes: number) => {
    let prefix = "BACK IN";
    
    if (selectedStatus === 'AVAILABLE') {
      prefix = "OFF IN";
    } else if (selectedStatus === 'FIELD') {
      prefix = "FIELD FOR";
    }
    
    const timeStr = minutes >= 60 ? `${Math.floor(minutes/60)}H ${minutes%60 > 0 ? (minutes%60 + 'M') : ''}` : `${minutes} MIN`;
    setEta(`${prefix} ${timeStr}`);
  };
  const handleQuickJournalSubmit = async () => {
    if (!quickJournal.trim()) return;
    try {
      await api.saveJournalEntry({
        content: quickJournal,
        category: 'Quick Entry',
        date: new Date().toISOString().split('T')[0]
      });
      setQuickJournal('');
      alert("Entry saved to Official Journal.");
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
        <div className="space-y-4 hidden sm:block">
          <div className="flex items-center justify-between">
             <div className="space-y-1">
                <h2 className="text-5xl font-black text-[var(--foreground)] tracking-tighter">
                  {t('welcome')}, <span className="text-[#1877F2]">{user.name.split(' ')[0]}</span>
                </h2>
                <p className="text-slate-500 font-bold text-lg">
                  {t('todayIs')}: {new Date().toLocaleDateString(lang === 'SI' ? 'si-LK' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
             </div>
             <div className="bg-[var(--card)] px-6 py-4 rounded-3xl border border-[var(--border)] shadow-sm flex items-center gap-3">
               <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]"></span>
               <span className="text-lg font-black text-[var(--foreground)] tracking-tighter uppercase tabular-nums">
                 {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
               </span>
             </div>
          </div>
        </div>
        
        <ExecutivePresencePanel lang={lang} />
      </div>

      <div className="relative -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-4 pb-4 overflow-x-auto no-scrollbar sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible snap-x snap-mandatory">
          <div className="snap-center">
            <StatCard 
              label={t('logInTime')} 
              value={attendance.time_in || '--:--'} 
              color="text-[#1877F2]" 
              icon="🕒" 
              onClick={handleManualCheckIn}
              sub={(!attendance.time_in || attendance.time_in === '--:--') ? (lang === 'SI' ? 'සටහන් කිරීමට ක්ලික් කරන්න' : 'Click to Log In') : (attendance.is_temporary ? 'Manual Entry' : 'Biometric Verified')}
            />
          </div>
          <div className="snap-center">
            <StatCard 
              label={t('outEligibility')} 
              value={isEligible ? t('eligibleForDeparture') : earliestOffTime} 
              sub={isEligible ? 'Authorized' : `HD: ${halfDayTime} | SL: ${shortLeaveTime}`} 
              color={isEligible ? 'text-emerald-500' : 'text-slate-800'} 
              icon={isEligible ? '✅' : '🚪'} 
              active={isEligible}
            />
          </div>
          <div className="snap-center">
            <StatCard 
              label={t('myLeave')} 
              value={`${leaveStats.taken}/${leaveStats.total}`} 
              sub={`${t('leavesTaken')}: ${leaveStats.taken} | ${t('leavesRemaining')}: ${Math.max(0, leaveStats.total - leaveStats.taken)}`} 
              color="text-indigo-600" 
              icon="🏖️" 
              onClick={() => navigate('/leave')}
            />
          </div>
          <div className="snap-center">
            {/* This used to read attendance.short_leave_minutes - a duration for
                today - over 2, so a 60 minute short leave rendered as "60/2".
                Short leave is a monthly count of two. */}
            <StatCard 
              label={t('shortLeaves')} 
              value={`${leaveStats.shortLeaveUsed}/${leaveStats.shortLeaveTotal}`} 
              sub="This month" 
              color="text-amber-600" 
              icon="⏳" 
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {/* Sinhala User Guide Download Banner */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-55 p-8 rounded-[3rem] border border-blue-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-5 text-center md:text-left flex-col md:flex-row">
              <div className="w-16 h-16 rounded-[1.8rem] bg-blue-600 flex items-center justify-center text-white text-3xl shadow-md shadow-blue-500/20 flex-shrink-0 animate-pulse">
                📝
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-900 tracking-tight">
                  {lang === 'SI' ? 'නිලධාරී පරිශීලක මාර්ගෝපදේශය (Official Word Document)' : 'Official Officer User Guide (MS Word)'}
                </h4>
                <p className="text-xs font-medium text-slate-600 mt-1 max-w-xl">
                  {lang === 'SI' 
                    ? 'නියගම පද්ධතියේ සියලුම රීති, කොන්දේසි, සහ උපදෙස් ඇතුලත් සම්පූර්ණ පරිශීලක මාර්ගෝපදේශය MS Word (.docx) ගොනුවක් ලෙස දැන් බාගත කරගත හැක.' 
                    : 'Download the comprehensive system guide containing all operational rules, terms and instructions for officers as a customizable Word Document.'}
                </p>
              </div>
            </div>
            <a 
              href="/Officer_User_Guide.docx" 
              download="My_Niyagama_Officer_User_Guide.docx"
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-blue-500/20 hover:scale-[1.03] active:scale-95 text-center flex items-center gap-2 whitespace-nowrap"
            >
              <span>📥 {lang === 'SI' ? 'බාගත කරගන්න' : 'Download Guide'}</span>
            </a>
          </div>

          <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100">
             <div className="flex justify-between items-center mb-10">
               <h3 className="text-2xl font-black text-slate-900 tracking-tighter flex items-center gap-3">
                 <span className="w-2.5 h-8 bg-[#1877F2] rounded-full"></span>
                 {t('commandCenter')}
               </h3>
             </div>
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
               <button onClick={() => window.open('https://mymails.myniyagama.online', '_blank')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-blue-600 hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">📧</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">My Mails</span>
               </button>
               <button onClick={() => window.open('https://myrr.myniyagama.online', '_blank')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-indigo-600 hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">📁</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">Recordroom</span>
               </button>
               <button title="Coming Soon" className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] opacity-60 cursor-not-allowed group">
                 <span className="text-3xl mb-4 grayscale">📦</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">My Stores</span>
               </button>
               <button onClick={() => window.open('https://myrr.myniyagama.online', '_blank')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-indigo-600 hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">🧬</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">HRIS</span>
               </button>
               <button onClick={() => navigate('/admin/biometric')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-[#1877F2] hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">📅</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">{t('attendance')}</span>
               </button>
                <button 
                  onClick={() => setActiveModal('STATUS')} 
                  className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-emerald-500 hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95 text-emerald-500 relative"
                >
                  <div className="absolute top-4 right-4 flex items-center gap-1">
                    <span className="text-[6.5px] font-black uppercase tracking-tighter text-emerald-500/50 group-hover:text-white/80 transition-colors">Live Sync</span>
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse ring-4 ring-emerald-500/20" />
                  </div>
                  <span className="text-3xl mb-3 group-hover:rotate-12 transition-transform">📡</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight">Dashboard Status</span>
                </button>
                <button onClick={() => setActiveModal('UNAVAILABILITY')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-red-500 hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95 text-red-500">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">🚫</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">{lang === 'SI' ? 'නොපැමිණීම' : 'Unavailable'}</span>
               </button>
               <button onClick={() => navigate('/journal')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-[#1877F2] hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">📓</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">{t('officialJournal')}</span>
               </button>
               <button onClick={() => navigate('/leave')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-emerald-500 hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">🏖️</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">My Leave</span>
               </button>
               <button onClick={() => navigate('/resources')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-slate-900 hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">🚐</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">Booking</span>
               </button>
               <button onClick={() => navigate('/circles')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-purple-500 hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">⭕</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">{t('circles')}</span>
               </button>
               <button onClick={() => navigate('/mapping')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-amber-500 hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">🗺️</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">{t('map')}</span>
               </button>
               <button onClick={() => navigate('/gallery')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-pink-500 hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">🖼️</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">{t('media')}</span>
               </button>
               <button onClick={() => navigate('/profile')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-teal-500 hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">👤</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">{t('profile')}</span>
               </button>
               <button onClick={() => navigate('/directory')} className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-orange-500 hover:text-white transition-all group hover:scale-105 shadow-sm active:scale-95">
                 <span className="text-3xl mb-4 group-hover:rotate-12 transition-transform">📞</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-center">Phone Book</span>
               </button>
             </div>
          </div>

          <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100">
             <h3 className="text-xl font-black text-slate-800 tracking-tight mb-6">Quick Journal</h3>
             <div className="flex gap-4">
                <textarea 
                  value={quickJournal}
                  onChange={e => setQuickJournal(e.target.value)}
                  placeholder="What are you working on right now?" 
                  className="flex-1 p-6 bg-slate-50 rounded-[2rem] border-none outline-none focus:ring-4 focus:ring-blue-100 transition-all font-medium text-sm shadow-inner min-h-[100px]"
                />
                <button 
                  onClick={handleQuickJournalSubmit}
                  disabled={!quickJournal.trim()}
                  className="px-8 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-[#1877F2] transition-colors disabled:opacity-30"
                >
                  Log Entry
                </button>
             </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
           <AttendanceLeaderboard lang={lang} />
           
           {/* Birthday Billboard */}
           <div className="bg-gradient-to-br from-pink-500 to-rose-600 text-white p-8 rounded-[3rem] shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-all">
             <div className="absolute right-2 bottom-2 text-9xl opacity-10 select-none">🎂</div>
             <div className="relative z-10">
                <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[8.5px] font-black uppercase tracking-widest border border-white/10">
                   🎉 {lang === 'SI' ? 'උපන්දින පුවරුව' : "Today's Billboard"}
                </span>
                {publicData.birthdays && publicData.birthdays.length > 0 ? (
                   <div className="mt-6">
                      <h4 className="text-3xl font-black tracking-tight">{publicData.birthdays[0].name}</h4>
                      <p className="text-[10px] font-black uppercase tracking-widest text-pink-200 mt-1">{publicData.birthdays[0].post}</p>
                      <p className="text-xs font-bold italic text-white/95 mt-4 leading-relaxed">
                        {lang === 'SI' 
                          ? '"නියගම ප්‍රාදේශීය ලේකම් කාර්යාල පවුලෙන් ඔබට සුබ උපන්දිනයක් ප්‍රාර්ථනා කරමු!"'
                          : '"Warmest birthday wishes from Niyagama Divisional Secretariat team! May your year ahead be filled with great success and happiness!"'}
                      </p>
                   </div>
                ) : (
                   <div className="mt-6">
                      <h4 className="text-xl font-black tracking-tight">{lang === 'SI' ? 'ዛሬ උපන්දින නොමැත' : 'No Birthdays Today'}</h4>
                      <p className="text-[10px] text-pink-100 mt-1">
                        {lang === 'SI' ? 'සෑම දිනක්ම සැමරුමකි. සුබ පැතුම් යැවීමට පද්ධති පරිපාලක අමතන්න.' : 'Every day is a celebration. Use the billboard to send custom wishes.'}
                      </p>
                   </div>
                )}
             </div>
           </div>

           {/* Public Events Card */}
           <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm space-y-6">
              <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-3">
                 <span className="w-2.5 h-2.5 bg-purple-500 rounded-full animate-pulse"></span>
                 {lang === 'SI' ? 'පොදු සිදුවීම් සහ දින දර්ශනය' : 'Public Events & Schedule'}
              </h4>
              <div className="space-y-4">
                 {publicData.events && publicData.events.length > 0 ? (
                    publicData.events.map((event: any, i: number) => (
                       <div key={i} className="flex gap-4 p-4 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100">
                          <div className="w-12 h-12 bg-purple-50 rounded-xl flex flex-col items-center justify-center font-black flex-shrink-0 border border-purple-100 text-purple-600 shrink-0">
                            <span className="text-[8px] uppercase tracking-tighter leading-none">
                              {new Date(event.event_date).toLocaleString('en', { month: 'short' })}
                            </span>
                            <span className="text-base font-black leading-tight mt-0.5">
                              {new Date(event.event_date).getDate()}
                            </span>
                          </div>
                          <div className="min-w-0">
                             <h5 className="text-xs font-black text-slate-800 tracking-tight truncate">{event.title}</h5>
                             <p className="text-[10px] text-slate-400 font-bold mt-0.5 truncate">📍 {event.location}</p>
                          </div>
                       </div>
                    ))
                 ) : (
                    <div className="text-center py-6 text-slate-350 italic">
                       <span className="text-2xl block mb-2">🗓️</span>
                       <p className="font-black uppercase text-[8px] tracking-wider text-slate-400">No planned public events</p>
                    </div>
                 )}
              </div>
           </div>
        </div>
      </div>

      {activeModal === 'CHECKIN' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100">
             <div className="p-10 border-b bg-slate-50 flex items-center justify-between">
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Manual Log In</h3>
                <button onClick={() => setActiveModal(null)} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
             </div>
             <div className="p-10 space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Log In Time</label>
                   <input 
                    type="time" 
                    required 
                    value={checkInTime} 
                    onChange={e => setCheckInTime(e.target.value)} 
                    className="w-full p-6 bg-slate-50 rounded-[2rem] text-3xl font-black border-none outline-none focus:ring-4 focus:ring-blue-100 text-center" 
                   />
                </div>
                <button 
                  onClick={confirmCheckIn}
                  className="w-full py-5 bg-[#1877F2] text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all"
                >
                  Confirm Log In
                </button>
             </div>
          </div>
        </div>
      )}

      {activeModal === 'UNAVAILABILITY' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100">
             <div className="p-10 border-b bg-slate-50 flex items-center justify-between">
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Mark Unavailability</h3>
                <button onClick={() => setActiveModal(null)} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
             </div>
             <form onSubmit={handleUnavailabilitySubmit} className="p-10 space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</label>
                   <input 
                    type="date" 
                    required 
                    value={unavailabilityForm.date} 
                    onChange={e => setUnavailabilityForm({...unavailabilityForm, date: e.target.value})} 
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-red-100" 
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Time Slot</label>
                   <div className="grid grid-cols-3 gap-3">
                      {(['FULL', 'AM', 'PM'] as const).map(slot => (
                        <button 
                          key={slot}
                          type="button"
                          onClick={() => setUnavailabilityForm({...unavailabilityForm, slot})}
                          className={`py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${unavailabilityForm.slot === slot ? 'bg-red-500 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                        >
                          {slot === 'FULL' ? '☀️ Full' : slot === 'AM' ? '🌅 AM' : '🌇 PM'}
                        </button>
                      ))}
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reason (Optional)</label>
                   <input 
                    type="text" 
                    value={unavailabilityForm.reason} 
                    onChange={e => setUnavailabilityForm({...unavailabilityForm, reason: e.target.value})} 
                    placeholder="Brief reason..." 
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-red-100" 
                   />
                </div>
                <button 
                  type="submit"
                  className="w-full py-5 bg-red-500 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-red-500/20 hover:scale-105 active:scale-95 transition-all"
                >
                  Save Log
                </button>
             </form>
          </div>
        </div>
      )}

      {activeModal === 'STATUS' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100">
             <div className="p-10 border-b bg-slate-50 flex items-center justify-between">
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Public Dashboard Status</h3>
                <button onClick={() => setActiveModal(null)} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
             </div>
             <div className="p-10 space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  {(['AVAILABLE', 'LEAVE', 'FIELD', 'MEETING', 'OFFLINE'] as const).map(status => (
                    <button 
                      key={status}
                      onClick={() => setSelectedStatus(status)}
                      className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${selectedStatus === status ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                    >
                      {status === 'AVAILABLE' ? 'IN' : status === 'FIELD' ? 'OFF TO FIELD' : status === 'MEETING' ? 'BUSY' : status}
                    </button>
                  ))}
                </div>
                
                <div className="space-y-4 pt-4 border-t border-slate-100">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Timing / Note</label>
                   <div className="grid grid-cols-4 gap-2">
                      {[15, 30, 45, 60].map(mins => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setQuickEta(mins)}
                          className="py-2 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-xl text-[10px] font-black transition-all border border-slate-100"
                        >
                          {mins >= 60 ? '1h' : `${mins}m`}
                        </button>
                      ))}
                   </div>
                   <input 
                    type="text" 
                    value={eta} 
                    onChange={e => setEta(e.target.value)} 
                    placeholder="e.g. 45" 
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100" 
                   />
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter text-center mt-2 px-4">
                     Tip: Just type a number (e.g. "45") for auto "Back In" format
                   </p>
                </div>

                <button 
                  onClick={() => handleStatusUpdate(selectedStatus)}
                  className="w-full py-5 bg-[#1877F2] text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all mt-4"
                >
                  Update Dashboard
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardOfficer;
