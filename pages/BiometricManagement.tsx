
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserRole, type Officer, AttendanceRegistryItem, Department } from '../types';
import { api } from '../service/api';
import { translations, TranslationKey } from '../service/i18n';
import { Skeleton } from '../components/Skeleton';

/**
 * The six kinds of long absence the office records. These are months-long
 * spells approved outside the ordinary leave form, and none of them is drawn
 * from the 21 casual / 21 vacation allowance.
 */
const LONG_LEAVE_TYPES: { id: string; en: string; si: string; icon: string; chip: string }[] = [
  { id: 'MATERNITY', en: 'Maternity', si: 'ප්‍රසූත',  icon: '👶', chip: 'bg-pink-50 text-pink-700 border-pink-200' },
  { id: 'MEDICAL',   en: 'Medical',   si: 'වෛද්‍ය',   icon: '🏥', chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'STUDY',     en: 'Study',     si: 'අධ්‍යයන',  icon: '🎓', chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  { id: 'FOREIGN',   en: 'Foreign',   si: 'විදේශ',    icon: '✈️', chip: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'LOCAL',     en: 'Local',     si: 'දේශීය',    icon: '🏠', chip: 'bg-teal-50 text-teal-700 border-teal-200' },
  { id: 'SPECIAL',   en: 'Special',   si: 'විශේෂ',    icon: '⭐', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
];


interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

interface BiometricLog {
  id: string;
  biometric_id: string;
  officer_id?: string;
  officer_name?: string;
  department?: string;
  post?: string;
  timestamp: string;
  date: string;
  time: string;
  status: 'SYNCED' | 'UNMAPPED' | 'DUPLICATE' | 'ERROR';
  terminal_id: string;
  registry_status?: string;
}

interface PreviewLog {
  bioId: string;
  date: string;
  timeIn: string;
}

const BiometricManagement: React.FC<Props> = ({ user, lang }) => {
  const t = (si: string, en: string) => lang === 'SI' ? si : en;

  // Global State
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const [logs, setLogs] = useState<BiometricLog[]>([]);
  const [staff, setStaff] = useState<Officer[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [registryMap, setRegistryMap] = useState<AttendanceRegistryItem[]>([]);
  const [monthlyRegistry, setMonthlyRegistry] = useState<any>(null);
  
  // UI State
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<BiometricLog | null>(null);

  // Ingestion Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSyncingAvailability, setIsSyncingAvailability] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewLogs, setPreviewLogs] = useState<PreviewLog[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filterTerm, setFilterTerm] = useState('');
  const [filterDept, setFilterDept] = useState('ALL');
  const [viewMode, setViewMode] = useState<'LOGS' | 'REGISTRY_GAPS' | 'LEAVE_MAP' | 'INSTITUTIONAL_MAP' | 'HOLIDAYS' | 'LONG_LEAVE' | 'JOIN_DATES'>('LOGS');
  const [holidays, setHolidays] = useState<any[]>([]);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });

  // Long-term leave: months-long absences recorded by the office rather than
  // requested by the officer, and not drawn from the casual/vacation allowance.
  const [longLeaves, setLongLeaves] = useState<any[]>([]);
  const [longLeaveForm, setLongLeaveForm] = useState({
    officer_id: '', type: 'MATERNITY', start_date: '', end_date: '', reference_no: '', remarks: '',
  });
  const [editingLongLeave, setEditingLongLeave] = useState<any>(null);
  const [longLeaveSaving, setLongLeaveSaving] = useState(false);
  const [longLeaveError, setLongLeaveError] = useState<string | null>(null);
  const [longLeaveFilter, setLongLeaveFilter] = useState<'CURRENT' | 'ALL'>('CURRENT');

  // Join dates. Leave is inferred from missing scans, so an officer who joined
  // mid-year was charged for every working day before they existed here. The
  // column has always been honoured by the calculation - it was simply never
  // filled in for anyone, which is what made the gap invisible.
  const [joinDraft, setJoinDraft] = useState<Record<string, string>>({});
  const [joinSaving, setJoinSaving] = useState<string | null>(null);
  const [joinFilter, setJoinFilter] = useState<'MISSING' | 'ALL'>('MISSING');
  const [joinSearch, setJoinSearch] = useState('');
  const [mapSearch, setMapSearch] = useState('');

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState<any>({
    officer_id: '',
    date: new Date().toISOString().split('T')[0],
    status: 'PRESENT',
    time_in: '08:30',
    time_out: '16:15',
    is_half_day: null,
    short_leave_minutes: 0
  });

  const isManagement = [
    UserRole.SA, 
    UserRole.CHIEF_CLERK, 
    UserRole.LEAVE_OFFICER, 
    UserRole.EXECUTIVE, 
    UserRole.ADMIN, 
    UserRole.IT, 
    UserRole.EX
  ].includes(user.role);

  useEffect(() => {
    if (viewMode === 'INSTITUTIONAL_MAP') {
      loadMonthlyData();
    } else if (viewMode === 'HOLIDAYS') {
      loadHolidays();
    } else if (viewMode === 'LONG_LEAVE') {
      loadLongLeaves();
    } else if (viewMode === 'JOIN_DATES') {
      loadJoinDates();
    } else {
      loadInitialData();
    }
  }, [selectedDate, selectedMonth, selectedYear, viewMode]);

  const loadHolidays = async () => {
    setIsLoading(true);
    try {
      const data = await api.getHolidays();
      setHolidays(data);
    } catch (e) {
      console.error("Holidays load error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddHoliday = async () => {
    if (!newHoliday.date || !newHoliday.name) return;
    try {
      await api.createHoliday(newHoliday);
      setNewHoliday({ date: '', name: '' });
      loadHolidays();
    } catch (e: any) { alert(e.message); }
  };

  const handleDeleteHoliday = async (id: string | number) => {
    if (!window.confirm(t('මෙම නිවාඩු දිනය ඉවත් කිරීමට ඔබට විශ්වාසද?', 'Remove this holiday?'))) return;
    try {
      await api.deleteHoliday(id);
      loadHolidays();
    } catch (e: any) { alert(e.message); }
  };

  const loadLongLeaves = async () => {
    setIsLoading(true);
    try {
      const [records, people] = await Promise.all([
        api.getLongTermLeaves(),
        staff.length ? Promise.resolve(staff) : api.getAllStaff(),
      ]);
      setLongLeaves(Array.isArray(records) ? records : []);
      if (!staff.length && Array.isArray(people)) setStaff(people as any);
    } catch (e) {
      console.error('Long-term leave load error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadJoinDates = async () => {
    setIsLoading(true);
    try {
      const people = await api.getAllStaff();
      if (Array.isArray(people)) setStaff(people as any);
    } catch (e) {
      console.error('Join date load error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveJoinDate = async (officer: any) => {
    const value = joinDraft[String(officer.id)];
    if (!value) return;
    setJoinSaving(String(officer.id));
    try {
      await api.updateStaff(officer.id, { join_date: value });
      setStaff(prev => prev.map((o: any) => (String(o.id) === String(officer.id) ? { ...o, join_date: value } : o)));
      setJoinDraft(prev => { const n = { ...prev }; delete n[String(officer.id)]; return n; });
    } catch (e: any) {
      alert(e?.message || t('සුරැකීම අසාර්ථකයි.', 'Could not save the join date.'));
    } finally {
      setJoinSaving(null);
    }
  };

  const joinDateRows = useMemo(() => {
    const q = joinSearch.trim().toLowerCase();
    return [...staff]
      .filter((o: any) => (joinFilter === 'ALL' ? true : !o.join_date))
      .filter((o: any) => !q || `${o.name} ${o.post || ''} ${o.department || ''}`.toLowerCase().includes(q))
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  }, [staff, joinFilter, joinSearch]);

  const missingJoinDates = useMemo(() => staff.filter((o: any) => !o.join_date).length, [staff]);

  const visibleLongLeaves = useMemo(() => {
    if (longLeaveFilter === 'ALL') return longLeaves;
    const today = new Date().toLocaleDateString('en-CA');
    return longLeaves.filter((r: any) => String(r.end_date).slice(0, 10) >= today);
  }, [longLeaves, longLeaveFilter]);

  const resetLongLeaveForm = () => {
    setEditingLongLeave(null);
    setLongLeaveError(null);
    setLongLeaveForm({ officer_id: '', type: 'MATERNITY', start_date: '', end_date: '', reference_no: '', remarks: '' });
  };

  const handleSaveLongLeave = async () => {
    const { officer_id, type, start_date, end_date } = longLeaveForm;
    if (!officer_id || !type || !start_date || !end_date) {
      setLongLeaveError(t('නිලධාරියා, වර්ගය සහ දින දෙකම අවශ්‍යයි.', 'Officer, type and both dates are required.'));
      return;
    }
    if (end_date < start_date) {
      setLongLeaveError(t('අවසන් දිනය ආරම්භක දිනයට පෙර විය නොහැක.', 'The end date cannot fall before the start date.'));
      return;
    }
    setLongLeaveSaving(true);
    setLongLeaveError(null);
    try {
      if (editingLongLeave) {
        await api.updateLongTermLeave(editingLongLeave.id, longLeaveForm);
      } else {
        await api.createLongTermLeave(longLeaveForm);
      }
      resetLongLeaveForm();
      await loadLongLeaves();
    } catch (e: any) {
      setLongLeaveError(e?.message || t('සුරැකීම අසාර්ථකයි.', 'Could not save the record.'));
    } finally {
      setLongLeaveSaving(false);
    }
  };

  const handleEditLongLeave = (record: any) => {
    setEditingLongLeave(record);
    setLongLeaveError(null);
    setLongLeaveForm({
      officer_id: String(record.officer_id),
      type: record.type,
      start_date: String(record.start_date).slice(0, 10),
      end_date: String(record.end_date).slice(0, 10),
      reference_no: record.reference_no || '',
      remarks: record.remarks || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteLongLeave = async (record: any) => {
    const who = record.officer_name || t('මෙම නිලධාරියා', 'this officer');
    if (!window.confirm(t(`${who} සඳහා වන මෙම නිවාඩු වාර්තාව ඉවත් කරන්නද?`,
                          `Remove this leave record for ${who}? Their attendance for those dates will be recalculated.`))) return;
    try {
      await api.deleteLongTermLeave(record.id);
      if (editingLongLeave?.id === record.id) resetLongLeaveForm();
      await loadLongLeaves();
    } catch (e: any) { alert(e.message); }
  };

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [staffData, divisionData, depts, registryData] = await Promise.all([
        api.getAllStaff(),
        api.getDivisionAttendance(selectedDate),
        api.getDepartments(),
        api.getAttendanceRegistry(selectedDate)
      ]);
      setStaff(staffData);
      setDepartments(depts);
      setRegistryMap(registryData);

      const dData = divisionData as any;
      const rawScansData = dData?.raw_scans || [];

      // Reconcile Hardware Logs with Staff Registry
      const combinedLogs: BiometricLog[] = rawScansData.map((scan: any) => {
          const officer = staffData.find(s => String(s.biometric_id) === String(scan.hardware_id));
          const registryItem = registryData.find(r => String(r.officer_id) === String(officer?.id));
          return {
              id: `scan-${scan.id}`,
              biometric_id: String(scan.hardware_id),
              officer_id: officer?.id,
              officer_name: officer?.name,
              department: officer?.department,
              post: officer?.post,
              timestamp: `${scan.scan_date} ${scan.scan_time}`,
              date: scan.scan_date,
              time: scan.scan_time,
              status: scan.status as any,
              terminal_id: scan.terminal_id,
              registry_status: registryItem?.official_status
          };
      });
      
      setLogs(combinedLogs);
    } catch (e) {
      console.error("Biometric Hub Load Error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMonthlyData = async () => {
    setIsLoading(true);
    try {
      const data = await api.getMonthlyAttendanceRegistry(selectedYear, selectedMonth);
      setMonthlyRegistry(data);
    } catch (e) {
      console.error("Monthly registry load error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setImportStatus(null);
      
      const reader = new FileReader();
      reader.onload = (re) => {
        const content = re.target?.result as string;
        const lines = content.split(/\r?\n/).filter(l => l.trim());
        const preview: PreviewLog[] = [];
        lines.slice(0, 10).forEach(line => {
           const trimmedLine = line.trim();
           if (!trimmedLine) return;

           // Support both tab/space separated (.dat) and comma/semicolon separated (.csv)
           const parts = trimmedLine.split(/\s+/).map(p => p.trim());
           if (parts.length >= 3 && parts[1].includes('-')) {
             // .dat format: BioID Date Time ...
             preview.push({ bioId: parts[0], date: parts[1], timeIn: parts[2] });
           } else {
             const legacyParts = trimmedLine.split(/[,;\t]/).map(p => p.trim());
             if (legacyParts.length >= 3) {
               preview.push({ bioId: legacyParts[0], date: legacyParts[1], timeIn: legacyParts[2] });
             }
           }
        });
        setPreviewLogs(preview);
      };
      reader.readAsText(file);
    }
  };

  const handleImportBiometricLogs = async () => {
    if (!selectedFile) return;
    setImportLoading(true);
    setImportStatus(t('දත්ත සමමුහුර්ත වෙමින් පවතී...', 'Synchronizing data with staff ledger...'));
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const lines = content.split(/\r?\n/).filter(l => l.trim());
        const logsToSend: PreviewLog[] = [];
        
        lines.forEach(line => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;

          const parts = trimmedLine.split(/\s+/).map(p => p.trim());
          if (parts.length >= 3 && parts[1].includes('-')) {
            // .dat format: BioID Date Time ...
            logsToSend.push({ bioId: parts[0], date: parts[1], timeIn: parts[2] });
          } else {
            const legacyParts = trimmedLine.split(/[,;\t]/).map(p => p.trim());
            if (legacyParts.length >= 3) {
              logsToSend.push({ bioId: legacyParts[0], date: legacyParts[1], timeIn: legacyParts[2] });
            }
          }
        });

        const res = await api.importBiometricLogs(logsToSend);
        // A partial import must not read as a clean success.
        setImportStatus(res?.status === 'partial' ? `⚠️ ${res.message}` : `✅ ${res.message}`);
        setSelectedFile(null);
        setPreviewLogs([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        setTimeout(() => {
          setIsImportModalOpen(false);
          loadInitialData();
        }, 1500);
      } catch (err: any) {
        setImportStatus(`❌ ${err.message}`);
      } finally {
        setImportLoading(false);
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleSyncAvailability = async () => {
    setIsSyncingAvailability(true);
    try {
      const res = await api.syncBiometricsToAvailability();
      alert(res.message);
      loadInitialData();
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncingAvailability(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      const bId = String(l.biometric_id).toLowerCase();
      const oName = String(l.officer_name || '').toLowerCase();
      const term = filterTerm.toLowerCase();
      const matchesSearch = !filterTerm || bId.includes(term) || oName.includes(term);
      const matchesDept = filterDept === 'ALL' || l.department === filterDept;
      return matchesSearch && matchesDept;
    });
  }, [logs, filterTerm, filterDept]);

  const gapOfficers = useMemo(() => {
    return staff.filter(s => {
      const hasLog = logs.some(l => String(l.officer_id) === String(s.id));
      const onLeave = registryMap.find(r => String(r.officer_id) === String(s.id))?.official_status === 'LEAVE';
      const matchesSearch = !filterTerm || s.name.toLowerCase().includes(filterTerm.toLowerCase());
      const matchesDept = filterDept === 'ALL' || s.department === filterDept;
      return !hasLog && !onLeave && matchesSearch && matchesDept;
    });
  }, [staff, logs, registryMap, filterTerm, filterDept]);

  const filteredLeaveMap = useMemo(() => {
    return registryMap.filter(item => {
      const matchesSearch = !filterTerm || item.name.toLowerCase().includes(filterTerm.toLowerCase());
      const matchesDept = filterDept === 'ALL' || item.department === filterDept;
      return matchesSearch && matchesDept;
    });
  }, [registryMap, filterTerm, filterDept]);

  const stats = useMemo(() => ({
    totalHits: logs.length,
    missing: gapOfficers.length,
    onLeave: registryMap.filter(r => r.official_status === 'LEAVE').length,
    unmapped: logs.filter(l => l.status === 'UNMAPPED').length,
    health: Math.round(((staff.length - gapOfficers.length) / (staff.length || 1)) * 100)
  }), [logs, gapOfficers, staff, registryMap]);

  const handleMapId = async (officerId: string | number) => {
    if (!selectedLog) return;
    setIsProcessing(true);
    try {
      await api.mapBiometricId(officerId, selectedLog.biometric_id);
      alert(t('හැඳුනුම්පත සාර්ථකව සම්බන්ධ කරන ලදී.', 'Identity linked. Profile mapped to hardware ID.'));
      setSelectedLog(null);
      loadInitialData();
    } catch (e: any) { alert(e.message); }
    finally { setIsProcessing(false); }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!window.confirm(t('මෙම වාර්තාව ඉවත් කිරීමට ඔබට විශ්වාසද?', 'Remove log from ledger?'))) return;
    try {
      await api.deleteBiometricLog(logId);
      setLogs(prev => prev.filter(l => l.id !== logId));
    } catch (e: any) { alert(e.message); }
  };

  const getDayColor = (status: string) => {
    switch (status) {
      case 'PRESENT': return 'bg-emerald-500';
      case 'ABSENT': return 'bg-red-500';
      case 'HALF_DAY': return 'bg-pink-500';
      case 'SHORT_LEAVE': return 'bg-orange-500';
      case 'HOLIDAY': return 'bg-yellow-400';
      case 'NON_WORKING': return 'bg-slate-200';    // weekend: not an absence
      case 'MISSING_PUNCH': return 'bg-amber-400';  // needs a human to resolve
      case 'LATE': return 'bg-amber-500';
      case 'FIELD': return 'bg-sky-500';
      // Sanctioned leave is not the same as an unexplained absence, so it no
      // longer shares the red used for ABSENT.
      case 'LEAVE': return 'bg-violet-500';
      // Nothing was ever recorded for these days, so they are not absences:
      // before the first biometric import, or before the officer joined.
      case 'NO_DATA': return 'bg-slate-100 border border-dashed border-slate-300';
      case 'NOT_JOINED': return 'bg-white border border-dashed border-slate-300';
      default: return 'bg-slate-100';
    }
  };

  if (!isManagement && viewMode !== 'LEAVE_MAP' && viewMode !== 'INSTITUTIONAL_MAP') {
     setViewMode('INSTITUTIONAL_MAP');
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20 px-4 md:px-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-1">
          <h2 className="text-5xl font-black text-slate-900 tracking-tighter">Biometric Hub</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.4em]">Forensic Hardware & Leave Synchronization</p>
        </div>
        <div className="flex flex-wrap gap-4">
           {isManagement && (
             <>
               <button 
                 onClick={handleSyncAvailability}
                 disabled={isSyncingAvailability}
                 className="px-8 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
               >
                 {isSyncingAvailability ? 'Syncing...' : 'Sync to Availability'}
               </button>
               <button 
                 onClick={() => setIsManualModalOpen(true)}
                 className="px-8 py-3 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-purple-500/20 hover:scale-105 active:scale-95 transition-all"
               >
                 Manual Control
               </button>
               <button 
                 onClick={() => setIsImportModalOpen(true)}
                 className="px-8 py-3 bg-[#1877F2] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all"
               >
                 Sync Hardware Logs
               </button>
               <div className="flex bg-white p-1 rounded-2xl border shadow-sm">
                  <button onClick={() => setViewMode('LOGS')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'LOGS' ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'text-slate-400 hover:text-slate-600'}`}>Signals</button>
                  <button onClick={() => setViewMode('INSTITUTIONAL_MAP')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'INSTITUTIONAL_MAP' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-indigo-600'}`}>Monthly Map</button>
                  <button onClick={() => setViewMode('LEAVE_MAP')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'LEAVE_MAP' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-blue-500'}`}>Registry Map</button>
                  <button onClick={() => setViewMode('HOLIDAYS')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'HOLIDAYS' ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-500/20' : 'text-slate-400 hover:text-yellow-600'}`}>Holidays</button>
                  <button onClick={() => setViewMode('LONG_LEAVE')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'LONG_LEAVE' ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20' : 'text-slate-400 hover:text-violet-600'}`}>Long Leave</button>
                  <button onClick={() => setViewMode('JOIN_DATES')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'JOIN_DATES' ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20' : 'text-slate-400 hover:text-teal-600'}`}>Join Dates</button>
                  <button onClick={() => setViewMode('REGISTRY_GAPS')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'REGISTRY_GAPS' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-slate-400 hover:text-red-500'}`}>Gaps ({stats.missing})</button>
               </div>
             </>
           )}
        </div>
      </div>

      {isManagement && viewMode !== 'INSTITUTIONAL_MAP' && viewMode !== 'LONG_LEAVE' && viewMode !== 'JOIN_DATES' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Hardware Hits', val: stats.totalHits, icon: '⚡', color: 'text-slate-900' },
            { label: 'Unmapped Signals', val: stats.unmapped, icon: '⚠️', color: 'text-red-500' },
            { label: 'Approved Leave', val: stats.onLeave, icon: '🏖️', color: 'text-blue-500' },
            { label: 'Silent Staff', val: stats.missing, icon: '🕵️', color: 'text-amber-500' }
          ].map((s, i) => (
            <div key={i} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 group relative overflow-hidden">
               <span className="absolute top-4 right-4 text-2xl opacity-10 group-hover:scale-125 transition-transform">{s.icon}</span>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
               <h3 className={`text-4xl font-black mt-4 tracking-tighter ${s.color}`}>{s.val}</h3>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'INSTITUTIONAL_MAP' && (
        <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <header className="p-8 border-b border-slate-100 bg-slate-50">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter">
                  {isManagement ? 'Divisional Presence Map' : 'Personal Attendance Map'}
                </h3>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">
                  Monthly Status Grid Reconciliation
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Live Filter</span>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">🔍</span>
                    <input
                      type="text"
                      placeholder="Search officer..."
                      value={mapSearch}
                      onChange={e => setMapSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs shadow-sm outline-none focus:ring-4 focus:ring-blue-50"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Period</span>
                  <div className="flex gap-2">
                    <select
                      value={selectedMonth}
                      onChange={e => setSelectedMonth(Number(e.target.value))}
                      className="p-4 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none shadow-sm cursor-pointer focus:ring-4 focus:ring-blue-50"
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </select>
                    <select
                      value={selectedYear}
                      onChange={e => setSelectedYear(Number(e.target.value))}
                      className="p-4 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none shadow-sm cursor-pointer focus:ring-4 focus:ring-blue-50"
                    >
                      {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-6">
              {[
                ['PRESENT', 'bg-emerald-500'],
                ['ABSENT', 'bg-red-500'],
                ['LEAVE', 'bg-violet-500'],
                ['HALF DAY', 'bg-pink-500'],
                ['SHORT LEAVE', 'bg-orange-500'],
                ['FIELD', 'bg-sky-500'],
                ['MISSING PUNCH', 'bg-amber-400'],
                ['HOLIDAY', 'bg-yellow-400'],
                ['WEEKEND', 'bg-slate-200'],
                ['NO DATA', 'bg-slate-100 border border-dashed border-slate-400'],
                ['NOT JOINED', 'bg-white border border-dashed border-slate-400'],
              ].map(([label, colour]) => (
                <div key={label} className="flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-2 pr-3 py-1 shadow-sm">
                  <div className={`w-2.5 h-2.5 rounded-sm ${colour}`}></div>
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</span>
                </div>
              ))}
            </div>
          </header>

          <div className="relative overflow-auto max-h-[600px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="p-4 sticky left-0 top-0 bg-slate-50 z-30 min-w-[220px] border-b border-r border-slate-100">Officer</th>
                  {monthlyRegistry?.daysInMonth && Array.from({ length: monthlyRegistry.daysInMonth }).map((_, i) => {
                    const d = new Date(selectedYear, selectedMonth - 1, i + 1);
                    const weekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <th
                        key={i}
                        className={`px-2 py-3 text-center min-w-[38px] sticky top-0 z-20 border-b border-slate-100 ${weekend ? 'bg-slate-100' : 'bg-slate-50'}`}
                      >
                        {/* Weekday initial makes a 31-column grid readable at a glance. */}
                        <span className={`block text-[7px] ${weekend ? 'text-slate-400' : 'text-slate-300'}`}>
                          {d.toLocaleDateString('en-US', { weekday: 'short' })[0]}
                        </span>
                        <span className={weekend ? 'text-slate-500' : 'text-slate-600'}>{i + 1}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={32} className="p-4"><Skeleton className="h-8 w-full" /></td></tr>
                  ))
                ) : (monthlyRegistry?.registry || [])
                    .filter((entry: any) => isManagement || String(entry.officer_id) === String(user.id))
                    .filter((entry: any) => !mapSearch || (entry.name || '').toLowerCase().includes(mapSearch.toLowerCase()))
                    .map((entry: any) => (
                  <tr key={entry.officer_id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-4 sticky left-0 bg-white group-hover:bg-slate-50 z-20 border-r border-slate-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-[11px] font-black text-[#1877F2] flex-none">
                          {entry.name ? entry.name[0] : '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 truncate">{entry.name || 'Unknown'}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter truncate">{entry.post || 'No Post'}</p>
                        </div>
                      </div>
                    </td>
                    {entry.days && typeof entry.days === 'object' ? Object.values(entry.days).map((status: any, idx: number) => (
                      <td key={idx} className="p-2 text-center">
                        <div
                          className={`w-6 h-6 rounded-md mx-auto transition-transform hover:scale-125 cursor-default ${getDayColor(status)} ${['NON_WORKING', 'NO_DATA', 'NOT_JOINED'].includes(status) ? '' : 'shadow-sm'}`}
                          title={`${entry.name} — ${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(idx + 1).padStart(2, '0')}: ${String(status).replace(/_/g, ' ')}`}
                        />
                      </td>
                    )) : null}
                  </tr>
                ))}
                {!isLoading && (monthlyRegistry?.registry || []).length === 0 && (
                  <tr>
                    <td colSpan={32} className="p-16 text-center">
                      <p className="text-sm font-black text-slate-400">No attendance records for this period</p>
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">Import biometric logs to populate the grid</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode !== 'INSTITUTIONAL_MAP' && (
        <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
          {/* A date, a hardware-ID search and a section filter say nothing about
              a leave record that spans months, so this strip stays out of the
              long-leave and holiday views. */}
          {viewMode !== 'LONG_LEAVE' && viewMode !== 'HOLIDAYS' && viewMode !== 'JOIN_DATES' && (
          <header className="p-8 border-b bg-slate-50 flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Archive Search</span>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-4 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none shadow-sm focus:ring-4 focus:ring-blue-50" />
            </div>
            <div className="flex-1 min-w-[200px] flex flex-col gap-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Live Filter</span>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">🔍</span>
                  <input type="text" placeholder="Hardware ID or Officer Name..." value={filterTerm} onChange={e => setFilterTerm(e.target.value)} className="w-full pl-10 pr-4 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs shadow-sm" />
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Section Filter</span>
                <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="p-4 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none shadow-sm">
                  <option value="ALL">All Sections</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
            </div>
          </header>
          )}

          <div className="overflow-x-auto min-h-[400px]">
            {viewMode === 'LOGS' ? (
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                  <tr>
                    <th className="p-8">Raw Signal</th>
                    <th className="p-8">Assigned Profile</th>
                    <th className="p-8">Sync Status</th>
                    <th className="p-8">Registry Status</th>
                    <th className="p-8 text-right">Utility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={5} className="p-8"><Skeleton className="h-10 w-full" /></td></tr>
                    ))
                  ) : filteredLogs.length === 0 ? (
                    <tr><td colSpan={5} className="p-24 text-center text-slate-300 font-bold italic">No machine signals for this date.</td></tr>
                  ) : filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/30 transition-colors group">
                      <td className="p-8">
                        <div className="flex flex-col">
                            <span className="font-mono text-sm font-black text-slate-800">{log.biometric_id}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tabular-nums">Hit: {log.time}</span>
                        </div>
                      </td>
                      <td className="p-8">
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${log.status === 'SYNCED' ? 'bg-blue-50 text-blue-500' : 'bg-red-50 text-red-500'}`}>
                              {log.officer_name?.[0] || '?'}
                            </div>
                            <div>
                              <p className={`text-sm font-bold ${log.status === 'UNMAPPED' ? 'text-red-500 italic' : 'text-slate-800'}`}>
                                {log.officer_name || 'Unrecognized ID'}
                              </p>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{log.department || 'Identity Pending'}</p>
                            </div>
                        </div>
                      </td>
                      <td className="p-8">
                        <span className={`px-4 py-1.5 rounded-full text-[8px] font-black border uppercase tracking-widest ${
                          log.status === 'SYNCED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="p-8">
                        <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                          log.registry_status === 'PRESENT' ? 'bg-emerald-100 text-emerald-600' : 
                          log.registry_status === 'LATE' ? 'bg-amber-100 text-amber-600' :
                          log.registry_status === 'SHORT_LEAVE' ? 'bg-orange-100 text-orange-600' :
                          log.registry_status === 'HALF_DAY' ? 'bg-purple-100 text-purple-600' :
                          log.registry_status === 'LEAVE' ? 'bg-red-100 text-red-600' : 
                          log.registry_status === 'HOLIDAY' ? 'bg-indigo-100 text-indigo-600' :
                          log.registry_status === 'MISSING_PUNCH' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-400'
                        }`}>
                          {log.registry_status || 'NOT-SET'}
                        </span>
                      </td>
                      <td className="p-8 text-right">
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setSelectedLog(log)} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 shadow-lg shadow-slate-900/10">
                              {log.status === 'SYNCED' ? 'Remap' : 'Handshake'}
                            </button>
                            <button onClick={() => handleDeleteLog(log.id)} className="p-3 text-slate-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : viewMode === 'JOIN_DATES' ? (
              <div className="p-5 sm:p-10 space-y-6">
                <div className="bg-slate-50 p-5 sm:p-7 rounded-[2rem] border border-slate-100">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                    {t('සේවයට බැඳුණු දිනය', 'Service Join Dates')}
                  </h4>
                  <p className="text-[11px] font-bold text-slate-500 mt-2 leading-relaxed max-w-3xl">
                    {t('නොපැමිණීම ගණනය වන්නේ ජෛවමිතික සටහනක් නොමැති වැඩ කරන දින ඔස්සේය. එබැවින් නිලධාරියෙකු සේවයට බැඳුණු දිනය සටහන් කර නොමැති නම්, ඔහු සේවයට පැමිණීමට පෙර කාලය ද නොපැමිණීම ලෙස ගණන් ගනී. මෙතැනින් එය නිවැරදි කරන්න.',
                       'Absence is inferred from working days with no biometric record, so an officer whose join date is blank is charged for every working day before they joined. Setting it here corrects their leave balance.')}
                  </p>

                  {missingJoinDates > 0 && (
                    <div className="mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
                      <p className="text-[11px] font-black text-amber-800">
                        {missingJoinDates} {t('නිලධාරීන්ට සේවයට බැඳුණු දිනය සටහන් කර නොමැත', 'officers have no join date recorded')}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 mt-4">
                    <div className="flex bg-white p-1 rounded-xl border border-slate-200">
                      {([['MISSING', t('හිස්', 'Missing only')], ['ALL', t('සියල්ල', 'All officers')]] as const).map(([k, label]) => (
                        <button
                          key={k}
                          onClick={() => setJoinFilter(k as any)}
                          className={`px-4 py-2 min-h-[36px] rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${joinFilter === k ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                        >{label}</button>
                      ))}
                    </div>
                    <input
                      value={joinSearch}
                      onChange={e => setJoinSearch(e.target.value)}
                      placeholder={t('නම හෝ අංශය සොයන්න…', 'Search name or section…')}
                      className="flex-1 min-w-[200px] px-4 py-2.5 min-h-[40px] bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                    />
                  </div>
                </div>

                {isLoading ? (
                  <Skeleton className="h-24 w-full rounded-3xl" />
                ) : joinDateRows.length === 0 ? (
                  <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                      {joinFilter === 'MISSING'
                        ? t('සියලු නිලධාරීන්ට දින සටහන් කර ඇත', 'Every officer has a join date recorded')
                        : t('නිලධාරීන් නොමැත', 'No officers match')}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {joinDateRows.map((o: any) => {
                      const id = String(o.id);
                      const current = o.join_date ? String(o.join_date).slice(0, 10) : '';
                      const draft = joinDraft[id] ?? current;
                      const dirty = draft && draft !== current;
                      return (
                        <div key={id} className={`p-4 bg-white border rounded-2xl flex items-center gap-3 ${o.join_date ? 'border-slate-100' : 'border-amber-200 bg-amber-50/40'}`}>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-slate-900 truncate">{o.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 truncate">
                              {o.post || '—'}{o.department ? ` · ${o.department}` : ''}
                            </p>
                          </div>
                          <input
                            type="date"
                            value={draft}
                            onChange={e => setJoinDraft(prev => ({ ...prev, [id]: e.target.value }))}
                            className="shrink-0 px-3 py-2 min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700"
                          />
                          <button
                            onClick={() => handleSaveJoinDate(o)}
                            disabled={!dirty || joinSaving === id}
                            className="shrink-0 px-4 py-2 min-h-[40px] bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                          >
                            {joinSaving === id ? '…' : t('සුරකින්න', 'Save')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : viewMode === 'LONG_LEAVE' ? (
              <div className="p-5 sm:p-10 space-y-8">
                {/* Record a spell */}
                <div className="bg-slate-50 p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-slate-100">
                  <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                      {editingLongLeave
                        ? t('නිවාඩු වාර්තාව සංස්කරණය', 'Edit Leave Record')
                        : t('දිගුකාලීන නිවාඩුවක් සටහන් කරන්න', 'Record Long-Term Leave')}
                    </h4>
                    {editingLongLeave && (
                      <button
                        onClick={resetLongLeaveForm}
                        className="px-4 py-2 min-h-[40px] bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest"
                      >
                        {t('අලුත් එකක්', 'New record')}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    <div className="space-y-1.5 xl:col-span-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        {t('නිලධාරියා', 'Officer')}
                      </label>
                      <select
                        value={longLeaveForm.officer_id}
                        onChange={e => setLongLeaveForm(prev => ({ ...prev, officer_id: e.target.value }))}
                        className="w-full p-4 min-h-[44px] bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none shadow-sm"
                      >
                        <option value="">— {t('නිලධාරියෙකු තෝරන්න', 'Select an officer')} —</option>
                        {[...staff]
                          .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
                          .map((o: any) => (
                            <option key={o.id} value={String(o.id)}>
                              {o.name}{o.department ? ` — ${o.department}` : ''}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        {t('නිවාඩු වර්ගය', 'Leave Type')}
                      </label>
                      <select
                        value={longLeaveForm.type}
                        onChange={e => setLongLeaveForm(prev => ({ ...prev, type: e.target.value }))}
                        className="w-full p-4 min-h-[44px] bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none shadow-sm"
                      >
                        {LONG_LEAVE_TYPES.map(k => (
                          <option key={k.id} value={k.id}>{k.icon} {t(k.si, k.en)}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        {t('ආරම්භක දිනය', 'From')}
                      </label>
                      <input
                        type="date"
                        value={longLeaveForm.start_date}
                        onChange={e => setLongLeaveForm(prev => ({ ...prev, start_date: e.target.value }))}
                        className="w-full p-4 min-h-[44px] bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none shadow-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        {t('අවසන් දිනය', 'To')}
                      </label>
                      <input
                        type="date"
                        value={longLeaveForm.end_date}
                        min={longLeaveForm.start_date || undefined}
                        onChange={e => setLongLeaveForm(prev => ({ ...prev, end_date: e.target.value }))}
                        className="w-full p-4 min-h-[44px] bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none shadow-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        {t('ලිපි අංකය', 'Reference No.')}
                      </label>
                      <input
                        type="text"
                        placeholder={t('අත්‍යවශ්‍ය නොවේ', 'Optional')}
                        value={longLeaveForm.reference_no}
                        onChange={e => setLongLeaveForm(prev => ({ ...prev, reference_no: e.target.value }))}
                        className="w-full p-4 min-h-[44px] bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none shadow-sm"
                      />
                    </div>

                    <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        {t('සටහන්', 'Remarks')}
                      </label>
                      <input
                        type="text"
                        placeholder={t('අත්‍යවශ්‍ය නොවේ', 'Optional')}
                        value={longLeaveForm.remarks}
                        onChange={e => setLongLeaveForm(prev => ({ ...prev, remarks: e.target.value }))}
                        className="w-full p-4 min-h-[44px] bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none shadow-sm"
                      />
                    </div>
                  </div>

                  {longLeaveError && (
                    <p className="mt-4 px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl text-[11px] font-bold text-rose-700">
                      {longLeaveError}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-5 flex-wrap">
                    <button
                      onClick={handleSaveLongLeave}
                      disabled={longLeaveSaving}
                      className="px-6 py-4 min-h-[44px] bg-slate-900 disabled:opacity-50 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-violet-600 transition-all"
                    >
                      {longLeaveSaving
                        ? t('සුරකිමින්…', 'Saving…')
                        : editingLongLeave ? t('වෙනස්කම් සුරකින්න', 'Save changes') : t('නිවාඩුව සටහන් කරන්න', 'Record leave')}
                    </button>
                    <p className="text-[10px] font-bold text-slate-400 leading-relaxed max-w-md">
                      {t('මෙම දිනවල අනියම් හෝ විවේක නිවාඩු ගණනයට නොගැනේ.',
                         'These dates are not charged against the officer\u2019s casual or vacation allowance, and no absence is inferred from the missing scans.')}
                    </p>
                  </div>
                </div>

                {/* Recorded spells */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest ml-1">
                      {t('සටහන් කළ නිවාඩු', 'Recorded Leave')}
                    </h4>
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                      {([['CURRENT', t('වත්මන්', 'Current & upcoming')], ['ALL', t('සියල්ල', 'All')]] as const).map(([k, label]) => (
                        <button
                          key={k}
                          onClick={() => setLongLeaveFilter(k as any)}
                          className={`px-4 py-2 min-h-[36px] rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                            longLeaveFilter === k ? 'bg-slate-900 text-white' : 'text-slate-500'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {isLoading ? (
                    <Skeleton className="h-24 w-full rounded-3xl" />
                  ) : visibleLongLeaves.length === 0 ? (
                    <div className="p-10 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                        {longLeaveFilter === 'CURRENT'
                          ? t('දැනට දිගුකාලීන නිවාඩු නොමැත', 'Nobody is on long-term leave right now')
                          : t('වාර්තා නොමැත', 'No records yet')}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {visibleLongLeaves.map((r: any) => {
                        const meta = LONG_LEAVE_TYPES.find(k => k.id === r.type);
                        const start = String(r.start_date).slice(0, 10);
                        const end = String(r.end_date).slice(0, 10);
                        const todayKey = new Date().toLocaleDateString('en-CA');
                        const state = end < todayKey ? 'PAST' : start > todayKey ? 'UPCOMING' : 'AWAY';
                        return (
                          <div key={r.id} className="p-5 bg-white border border-slate-100 rounded-3xl hover:shadow-lg transition-all">
                            <div className="flex items-start gap-3">
                              <div className="w-11 h-11 rounded-full bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                                {r.officer_pic
                                  ? <img src={r.officer_pic} alt="" className="w-full h-full object-cover" />
                                  : <span className="text-[10px] font-black text-slate-400">
                                      {String(r.officer_name || '?').split(/\s+/).slice(0, 2).map((x: string) => x[0]).join('').toUpperCase()}
                                    </span>}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-slate-900 truncate">{r.officer_name}</p>
                                <p className="text-[10px] font-bold text-slate-400 truncate">
                                  {r.officer_post || r.officer_department || '—'}
                                </p>
                              </div>
                              <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                                state === 'AWAY' ? 'bg-violet-50 text-violet-700 border-violet-200'
                                : state === 'UPCOMING' ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                              }`}>
                                {state === 'AWAY' ? t('ඉවත්ව', 'Away')
                                  : state === 'UPCOMING' ? t('ඉදිරියේදී', 'Upcoming')
                                  : t('අවසන්', 'Completed')}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-4 flex-wrap">
                              <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${meta?.chip || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                {meta?.icon} {t(meta?.si || r.type, meta?.en || r.type)}
                              </span>
                              <span className="text-[10px] font-black text-slate-600 tabular-nums">
                                {start} → {end}
                              </span>
                              {r.reference_no && (
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                  #{r.reference_no}
                                </span>
                              )}
                            </div>

                            {r.remarks && (
                              <p className="text-[10px] text-slate-500 mt-2.5 leading-relaxed">{r.remarks}</p>
                            )}

                            <div className="flex gap-2 mt-4 pt-4 border-t border-slate-50">
                              <button
                                onClick={() => handleEditLongLeave(r)}
                                className="px-4 py-2.5 min-h-[40px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest"
                              >
                                {t('සංස්කරණය', 'Edit')}
                              </button>
                              <button
                                onClick={() => handleDeleteLongLeave(r)}
                                className="px-4 py-2.5 min-h-[40px] bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest"
                              >
                                {t('ඉවත් කරන්න', 'Remove')}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : viewMode === 'HOLIDAYS' ? (
              <div className="p-10 space-y-8">
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Add New Holiday</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
                      <input 
                        type="date" 
                        value={newHoliday.date} 
                        onChange={e => setNewHoliday(prev => ({ ...prev, date: e.target.value }))} 
                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none shadow-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Holiday Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Independence Day" 
                        value={newHoliday.name} 
                        onChange={e => setNewHoliday(prev => ({ ...prev, name: e.target.value }))} 
                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none shadow-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <button 
                        onClick={handleAddHoliday} 
                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-blue-600 transition-all"
                      >
                        Register Holiday
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest ml-1">Scheduled Holidays</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {isLoading ? (
                      <Skeleton className="h-20 w-full rounded-3xl" />
                    ) : holidays.length === 0 ? (
                      <p className="text-slate-400 italic text-sm p-8">No holidays registered.</p>
                    ) : holidays.map(h => (
                      <div key={h.id} className="p-6 bg-white border border-slate-100 rounded-3xl flex justify-between items-center group hover:shadow-lg transition-all">
                        <div>
                          <p className="text-xs font-black text-slate-900">{h.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h.date}</p>
                        </div>
                        <button onClick={() => handleDeleteHoliday(h.id)} className="p-3 text-slate-200 hover:text-red-500 transition-all">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : viewMode === 'LEAVE_MAP' ? (
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {filteredLeaveMap.map(item => (
                    <div key={item.officer_id} className="p-6 bg-slate-50 border border-slate-100 rounded-[2rem] hover:bg-white hover:shadow-xl transition-all group">
                      <div className="flex items-center gap-4 mb-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${item.official_status === 'PRESENT' ? 'bg-emerald-50 text-emerald-500' : item.official_status === 'LEAVE' ? 'bg-blue-50 text-blue-500' : 'bg-red-50 text-red-400'}`}>
                            {item.name[0]}
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-xs font-black text-slate-800 truncate">{item.name}</h5>
                            <p className="text-[8px] font-bold text-slate-400 uppercase truncate">{item.post}</p>
                          </div>
                      </div>
                      <div className="space-y-2 pt-4 border-t border-slate-100">
                          <div className="flex justify-between items-center text-[8px] font-black uppercase">
                            <span className="text-slate-400">Registry Status:</span>
                            <span className={`px-2 py-0.5 rounded-full ${item.official_status === 'PRESENT' ? 'bg-emerald-100 text-emerald-600' : item.official_status === 'LEAVE' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                                {item.official_status} {item.leave_type && `(${item.leave_type})`}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[8px] font-black uppercase">
                            <span className="text-slate-400">Machine Hit:</span>
                            <span className={item.biometric_hit ? 'text-slate-800' : 'text-slate-300'}>{item.biometric_hit || 'No Scan'}</span>
                          </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="p-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {gapOfficers.length === 0 ? (
                  <div className="col-span-full py-32 text-center opacity-30 grayscale flex flex-col items-center">
                    <span className="text-7xl mb-6">🎯</span>
                    <p className="font-black uppercase tracking-widest text-[10px]">Registry Fully Mapped. Zero Absentee Signals.</p>
                  </div>
                ) : gapOfficers.map(s => (
                  <div key={s.id} className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] group relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 bg-red-50 text-red-500 text-[8px] font-black uppercase tracking-tighter">Absentee Pulse</div>
                    <div className="flex items-center gap-5">
                        <img src={`https://ui-avatars.com/api/?name=${s.name}&background=f1f5f9&color=94a3b8`} className="w-14 h-14 rounded-2xl" alt="gap" />
                        <div>
                          <h4 className="text-lg font-black text-slate-800 tracking-tight leading-none mb-2">{s.name}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.post}</p>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terminal Log Ingestion Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col my-auto border border-white/20">
            <header className="px-10 py-8 bg-slate-50 border-b flex justify-between items-center">
               <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Log Ingestion Engine</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Process Physical Terminal Files</p>
               </div>
               <button onClick={() => setIsImportModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
               </button>
            </header>

            <div className="p-10 space-y-6">
               <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".csv,.txt,.dat" />
               
               {!selectedFile ? (
                 <div 
                   onClick={() => fileInputRef.current?.click()}
                   className="w-full p-20 border-4 border-dashed border-slate-100 rounded-[3rem] bg-slate-50 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-200 hover:bg-white transition-all group"
                 >
                    <span className="text-6xl group-hover:scale-110 transition-transform">📂</span>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Browse Hardware Logs (.dat, .csv, .txt)</p>
                 </div>
               ) : (
                 <div className="space-y-6">
                    <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl flex justify-between items-center">
                       <div>
                          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none">Synthesizing Data</p>
                          <h5 className="text-sm font-black text-blue-900 mt-1">{selectedFile.name}</h5>
                       </div>
                       <button onClick={() => { setSelectedFile(null); setPreviewLogs([]); }} className="text-xs font-bold text-red-500 hover:underline">Cancel</button>
                    </div>

                    <div className="bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-xl">
                       <div className="p-5 border-b border-white/5 bg-white/5">
                          <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Validation Stream (10 Row Fragment)</p>
                       </div>
                       <table className="w-full text-left text-white/80 text-[10px]">
                          <thead className="bg-white/5 font-black uppercase text-white/20">
                             <tr><th className="p-4">HW_ID</th><th className="p-4">DATE</th><th className="p-4">TIMESTAMP</th></tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                             {previewLogs.map((p, i) => (
                               <tr key={i}><td className="p-4 font-mono">{p.bioId}</td><td className="p-4">{p.date}</td><td className="p-4">{p.timeIn}</td></tr>
                             ))}
                          </tbody>
                       </table>
                    </div>

                    <button 
                      onClick={handleImportBiometricLogs}
                      disabled={importLoading}
                      className="w-full py-5 bg-[#1877F2] text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                    >
                      {importLoading ? 'Synthesizing...' : 'Finalize Sync to Registry'}
                    </button>
                 </div>
               )}

               {importStatus && (
                 <div className={`p-6 rounded-3xl font-bold text-sm border animate-fade-in ${importStatus.includes('✅') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                    {importStatus}
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Identity Assignment Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[200] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col border border-white/20">
              <header className="px-10 py-8 bg-slate-50 border-b flex justify-between items-center">
                 <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Biometric Handshake</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Hardware ID: {selectedLog.biometric_id} ({selectedLog.time})</p>
                 </div>
                 <button onClick={() => setSelectedLog(null)} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                 </button>
              </header>
              <div className="p-10 space-y-6 flex-1 overflow-y-auto max-h-[60vh] no-scrollbar">
                 <p className="text-xs text-slate-500 font-medium italic">Select an institutional profile to link this hardware signal. This mapping applies to all historical and future hits for this machine ID.</p>
                 <div className="grid grid-cols-1 gap-3">
                    {staff.map(s => (
                      <button key={s.id} onClick={() => handleMapId(s.id)} disabled={isProcessing} className="p-5 bg-slate-50 rounded-2xl flex items-center justify-between hover:bg-blue-50 hover:ring-2 hover:ring-blue-100 transition-all group">
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-white border flex items-center justify-center font-black text-xs text-blue-500 shadow-sm">{s.name[0]}</div>
                            <div className="text-left"><p className="text-sm font-black text-slate-800 leading-none mb-1">{s.name}</p><p className="text-[9px] font-bold text-slate-400 uppercase">{s.post}</p></div>
                         </div>
                         <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all">Establish Link →</span>
                      </button>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      )}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col border border-white/20">
            <header className="px-10 py-8 bg-slate-50 border-b flex justify-between items-center">
               <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Manual Override</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Correct Ledger Entries Manually</p>
               </div>
               <button onClick={() => setIsManualModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
               </button>
            </header>
            <div className="p-10 space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar">
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Officer</label>
                    <select 
                      value={manualForm.officer_id}
                      onChange={e => setManualForm({...manualForm, officer_id: e.target.value})}
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none"
                    >
                      <option value="">Select Officer...</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
                    <input 
                      type="date" 
                      value={manualForm.date}
                      onChange={e => setManualForm({...manualForm, date: e.target.value})}
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs"
                    />
                  </div>
               </div>

               <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Manual Status Update</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['PRESENT', 'LEAVE', 'DUTY LEAVE', 'FIELD', 'SHORT_LEAVE', 'HALF_DAY', 'ABSENT', 'MISSING_PUNCH'].map(st => (
                      <button 
                        key={st}
                        onClick={() => setManualForm({...manualForm, status: st})}
                        className={`py-3 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${manualForm.status === st ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Time In</label>
                    <input 
                      type="time" 
                      value={manualForm.time_in}
                      onChange={e => setManualForm({...manualForm, time_in: e.target.value})}
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Time Out</label>
                    <input 
                      type="time" 
                      value={manualForm.time_out}
                      onChange={e => setManualForm({...manualForm, time_out: e.target.value})}
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs"
                    />
                  </div>
               </div>

               <button 
                onClick={async () => {
                  try {
                    if (!manualForm.officer_id) return alert("Select an officer first");
                    await api.updateManualAttendance(manualForm);
                    alert("Attendance overridden successfully.");
                    setIsManualModalOpen(false);
                    loadInitialData();
                  } catch (e: any) { alert(e.message); }
                }}
                className="w-full py-5 bg-purple-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl hover:bg-purple-700 transition-all mt-6"
               >
                 Execute Manual Override
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BiometricManagement;
