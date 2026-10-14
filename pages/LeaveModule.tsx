import React, { useState, useEffect } from 'react';
import type { Officer, LeaveRequest } from '../types';
import { api } from '../service/api';
import { Skeleton } from '../components/Skeleton';
import AttendanceCalendar from '../components/AttendanceCalendar';
import { z } from 'zod';
import { toast } from 'react-hot-toast';

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

const LeaveModule: React.FC<Props> = ({ user, lang }) => {
  const t = (si: string, en: string) => lang === 'SI' ? si : en;

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Leave history and the attendance calendar used to be buried in the profile
  // page. They belong with leave, but stacking both on one screen makes a long
  // scroll on a phone, so they sit behind a switch.
  const [view, setView] = useState<'LEAVES' | 'ATTENDANCE'>('LEAVES');

  const [form, setForm] = useState({
    type: 'CASUAL' as 'CASUAL' | 'VACATION' | 'DUTY' | 'SHORT_LEAVE' | 'HALF_DAY',
    sub_type: 'AM' as 'AM' | 'PM',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    reason: ''
  });

  // Zod schema for leave form validation
  const leaveFormSchema = z.object({
    type: z.enum(['CASUAL', 'VACATION', 'DUTY', 'SHORT_LEAVE', 'HALF_DAY']),
    sub_type: z.enum(['AM', 'PM']).default('AM'),
    start_date: z.string().date(),
    end_date: z.string().date(),
    reason: z.string().min(1, 'Reason is required')
  });

  // Parse form state with Zod schema
  const parseForm = (formState: any) => {
    const result = leaveFormSchema.safeParse(formState);
    return result.success ? result.data : null;
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [leavesData, balancesData] = await Promise.all([
        api.getMyLeaves(),
        api.getLeaveBalances()
      ]);
      setLeaves(leavesData);
      setBalances(balancesData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Zod validation
    const parsedForm = parseForm(form);
    if (!parsedForm) {
      toast.error('Please fill in all required fields correctly.');
      setIsSaving(false);
      return;
    }
    
    // Validate date range: end_date must be >= start_date
    if (new Date(parsedForm.end_date) < new Date(parsedForm.start_date)) {
      toast.error('End date must be after start date.');
      setIsSaving(false);
      return;
    }
    
    // Balance enforcement lives on the server (computeLeaveBalances), which is
    // the same calculation /leaves/balances reports. Duplicating it here meant
    // the two could disagree, so we surface the server's message instead.
    try {
      await api.applyForLeave(parsedForm);
      await loadData();
      setIsModalOpen(false);
      setForm({
        type: 'CASUAL',
        sub_type: 'AM',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        reason: ''
      });
      toast.success('Leave application submitted successfully!');
    } catch (e: any) {
      toast.error(e.message || 'Application failed');
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-emerald-100 text-emerald-600 border-emerald-200';
      case 'REJECTED': return 'bg-red-100 text-red-600 border-red-200';
      default: return 'bg-blue-100 text-blue-600 border-blue-200';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-5xl font-black text-slate-900 tracking-tighter">{t('නිවාඩු කළමනාකරණය', 'Leave Management')}</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">Digital Application & Approval Workflow</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="px-10 py-5 bg-[#1877F2] text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all"
        >
          {t('නිවාඩු ඉල්ලුම් කරන්න', 'Apply for Leave')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            label: t('අනියම් නිවාඩු', 'Casual Leave'),
            val: balances ? `${balances.casual}/${balances.casual_total}` : '--/--',
            color: 'text-blue-500',
            sub: balances ? `${balances.short_leave_count} SL / ${balances.half_day_count} HD used` : null,
          },
          {
            // Sick leave is not a method here, and the tile showed an
            // entitlement nobody could draw on. Days with no biometric record
            // are what actually consume the allowance, so that is shown instead.
            label: t('නොපැමිණි දින', 'Days Absent'),
            val: balances ? `${balances.absent_days ?? 0}` : '--',
            color: 'text-rose-500',
            sub: balances?.counted_up_to ? `No scan up to ${balances.counted_up_to}` : 'Working days with no scan',
          },
          {
            label: t('වාර්ෂික නිවාඩු', 'Vacation'),
            val: balances ? `${balances.vacation}/${balances.vacation_total}` : '--/--',
            color: 'text-amber-500',
            sub: balances?.vacation_from_casual ? `${balances.vacation_from_casual} carried from casual` : null,
          }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
             <h3 className={`text-3xl font-black mt-4 tracking-tighter ${stat.color}`}>{stat.val}</h3>
             <p className="text-[9px] text-slate-300 font-bold uppercase mt-2">
               {stat.sub || 'Remaining Balanced'}
             </p>
          </div>
        ))}
      </div>

      {balances?.no_pay > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-[2rem] p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-red-500 text-white flex items-center justify-center flex-none font-black">!</div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-red-600">
              {t('වැටුප් රහිත දින', 'No-pay days')}: {balances.no_pay}
            </p>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">
              {t('අනියම් සහ වාර්ෂික නිවාඩු දෙකම අවසන්', 'Both casual and vacation allowances are fully used')}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2 bg-white p-2 rounded-[1.5rem] shadow-sm border border-slate-100 w-full sm:w-auto sm:inline-flex">
        {([
          ['LEAVES', t('නිවාඩු ඉතිහාසය', 'Leave History')],
          ['ATTENDANCE', t('පැමිණීම', 'Attendance')],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex-1 sm:flex-none min-h-[44px] px-6 rounded-[1rem] text-[11px] font-black uppercase tracking-widest transition-all ${
              view === key ? 'bg-[#1877F2] text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-slate-600 active:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'ATTENDANCE' ? (
        <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-8 sm:p-10 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">{t('මගේ පැමිණීම', 'My Attendance')}</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
              {t('මාසික පැමිණීම සහ ප්‍රමාදයන්', 'Scans, short leave and half days by month')}
            </p>
          </div>
          <div className="p-4 sm:p-6">
            <AttendanceCalendar user={user} lang={lang} />
          </div>
        </div>
      ) : (
      <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8 sm:p-10 border-b bg-slate-50 flex items-center justify-between gap-4">
           <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">{t('මගේ නිවාඩු ඉතිහාසය', 'My Leave History')}</h3>
           <span className="bg-slate-200 px-3 py-1 rounded-full text-[9px] font-black whitespace-nowrap">{leaves.length} Applications</span>
        </div>
        <div className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-10 space-y-4">
              <Skeleton className="w-full h-12 rounded-2xl" />
              <Skeleton className="w-full h-12 rounded-2xl" />
            </div>
          ) : leaves.length === 0 ? (
            <div className="p-20 text-center flex flex-col items-center justify-center grayscale opacity-30">
               <span className="text-6xl mb-4">🏖️</span>
               <p className="font-black uppercase text-[10px] tracking-widest">No leave records found</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="p-8">Type</th>
                  <th className="p-8">Duration</th>
                  <th className="p-8">Reason</th>
                  <th className="p-8">Status</th>
                  <th className="p-8 text-right">Applied On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {leaves.map(req => (
                  <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-8">
                       <span className="text-xs font-black text-slate-800">{req.type}</span>
                    </td>
                    <td className="p-8">
                       <div className="text-xs font-bold text-slate-600">
                          {req.start_date} <span className="text-slate-300 px-1">→</span> {req.end_date}
                       </div>
                    </td>
                    <td className="p-8">
                       <p className="text-xs text-slate-500 font-medium max-w-xs truncate" title={req.reason}>
                          {req.reason}
                       </p>
                    </td>
                    <td className="p-8">
                       <span className={`px-4 py-1.5 rounded-full text-[9px] font-black border uppercase tracking-widest ${getStatusStyle(req.status)}`}>
                          {req.status}
                       </span>
                    </td>
                    <td className="p-8 text-right">
                       <span className="text-[10px] font-bold text-slate-300 tabular-nums">{new Date(req.created_at).toLocaleDateString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white w-full max-w-xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col border border-white/20">
              <header className="px-10 py-8 bg-slate-50 border-b flex justify-between items-center">
                 <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tighter">New Leave Request</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Submit for Executive Review</p>
                 </div>
                 <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                 </button>
              </header>

              <form onSubmit={handleApply} className="p-10 space-y-6">
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Leave Category</label>
                    <select 
                     value={form.type} 
                     onChange={e => setForm({...form, type: e.target.value as any})}
                     className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-[#1877F2]/20"
                    >
                      <option value="CASUAL">Casual Leave</option>
                      <option value="VACATION">Vacation / Annual</option>
                      <option value="DUTY">Official Duty (Field/Training)</option>
                      <option value="SHORT_LEAVE">Short Leave (90 Min)</option>
                      <option value="HALF_DAY">Half Day</option>
                    </select>
                    <span className="text-[9px] text-slate-500 ml-2">{form.type === 'HALF_DAY' ? '(AM/PM required)' : ''}</span>
                 </div>

                 {(form.type === 'SHORT_LEAVE' || form.type === 'HALF_DAY') && (
                   <div className="space-y-1.5 px-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Time Slot</label>
                      <div className="flex gap-4">
                        {['AM', 'PM'].map(slot => (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setForm({...form, sub_type: slot as any, end_date: form.start_date})}
                            className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${
                              form.sub_type === slot ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                            }`}
                          >
                            {slot === 'AM' ? t('පෙ.ව.', 'Morning (AM)') : t('ප.ව.', 'Evening (PM)')}
                          </button>
                        ))}
                      </div>
                   </div>
                 )}

                 <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                       <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Start Date</label>
                       <input 
                         type="date" 
                         required 
                         value={form.start_date}
                         onChange={e => setForm({...form, start_date: e.target.value})}
                         className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-[#1877F2]/20"
                       />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">End Date</label>
                       <input 
                         type="date" 
                         required 
                         value={form.end_date}
                         onChange={e => setForm({...form, end_date: e.target.value})}
                         className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-[#1877F2]/20"
                       />
                       <span className="text-[9px] text-slate-500 ml-2">Must be after start date</span>
                    </div>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Reason for Absence</label>
                    <textarea 
                     required 
                     value={form.reason}
                     onChange={e => setForm({...form, reason: e.target.value})}
                     rows={4}
                     placeholder="Briefly describe the purpose of your leave..."
                     className="w-full p-5 bg-slate-50 rounded-2xl font-medium text-sm border-none outline-none focus:ring-2 focus:ring-[#1877F2]/20 shadow-inner"
                    />
                 </div>

                 <button 
                   disabled={isSaving}
                   className="w-full py-5 bg-[#1877F2] text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl mt-4"
                 >
                   {isSaving ? 'Submitting Application...' : 'Send Application'}
                 </button>
              </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default LeaveModule;