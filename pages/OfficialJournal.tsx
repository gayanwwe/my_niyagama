import React, { useState, useMemo, useEffect } from 'react';
import * as ReactRouterDom from 'react-router-dom';
import type { Officer, DiaryEntry, LeaveRequest, AttendanceRecord } from '../types';
import { api } from '../service/api';

// Destructure from namespace import to resolve "no exported member" errors
const { useNavigate } = ReactRouterDom;

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

type ViewMode = 'DAILY' | 'WEEKLY' | 'MONTHLY';

const OfficialJournal: React.FC<Props> = ({ user, lang }) => {
  const navigate = useNavigate();
  const t = (si: string, en: string) => lang === 'SI' ? si : en;

  // Manual entries state
  const [manualEntries, setManualEntries] = useState<DiaryEntry[]>([
    { 
      id: 'd1', 
      date: '2024-08-28', 
      content: 'Conducted field review of waste management project in Ward 5.', 
      type: 'MANUAL', 
      category: 'Field Duty',
      outcomes: 'Identified 3 new collection points.',
      challenges: 'Heavy rain delayed inspection by 2 hours.',
    }
  ]);

  // Mock System Data for Local Sync demonstration (Real app uses api.getJournal)
  const [leaves] = useState<LeaveRequest[]>([
    { id: 'l1', officer_id: user.id, type: 'CASUAL', start_date: '2024-08-26', end_date: '2024-08-26', reason: 'Personal work', status: 'APPROVED', created_at: '2024-08-25' }
  ]);

  const [attendance] = useState<AttendanceRecord[]>([
    { id: 'a1', officer_id: user.id, date: '2024-08-27', time_in: '08:15', status: 'SHORT_LEAVE', is_temporary: false, short_leave_minutes: 90, is_half_day: null },
    { id: 'a2', officer_id: user.id, date: '2024-08-28', time_in: '08:30', status: 'PRESENT', is_temporary: false, short_leave_minutes: 0, is_half_day: null }
  ]);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('DAILY');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ 
    content: '', 
    category: 'General Duty', 
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5), 
    outcomes: '', 
    challenges: '' 
  });
  const [isLoading, setIsLoading] = useState(false);

  // 1. Sync System Data into Unified Journal Entries
  const allEntries = useMemo(() => {
    const sysEntries: DiaryEntry[] = [];

    // Map Leaves
    leaves.forEach(l => {
      sysEntries.push({
        id: `sys-l-${l.id}`,
        date: l.start_date,
        content: `SYSTEM LOG: Approved ${l.type} Leave. Reason: ${l.reason}`,
        type: 'SYSTEM_LEAVE',
        category: 'Administrative'
      });
    });

    // Map Short Leaves
    attendance.forEach(a => {
      if (a.status === 'SHORT_LEAVE') {
        sysEntries.push({
          id: `sys-a-${a.id}`,
          date: a.date,
          content: `SYSTEM LOG: Short Leave recorded (${a.short_leave_minutes} mins).`,
          type: 'SYSTEM_TASK',
          category: 'Time Tracking'
        });
      }
    });

    return [...manualEntries, ...sysEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [manualEntries, leaves, attendance]);

  // 2. View Mode Filtering Logic
  const filteredEntries = useMemo(() => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    if (viewMode === 'DAILY') {
      return allEntries.filter(e => e.date === dateStr);
    }

    if (viewMode === 'WEEKLY') {
      const startOfWeek = new Date(selectedDate);
      startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay() + 1);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      return allEntries.filter(e => {
        const d = new Date(e.date);
        return d >= startOfWeek && d <= endOfWeek;
      });
    }

    if (viewMode === 'MONTHLY') {
      return allEntries.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === month && d.getFullYear() === year;
      });
    }

    return [];
  }, [allEntries, selectedDate, viewMode]);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const entry: DiaryEntry = {
      id: `d${Date.now()}`,
      date: form.date,
      content: form.content,
      category: form.category,
      outcomes: form.outcomes,
      challenges: form.challenges,
      type: 'MANUAL'
    };
    setManualEntries([entry, ...manualEntries]);
    setShowAddModal(false);
    setForm({ 
      content: '', 
      category: 'General Duty', 
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5),
      outcomes: '', 
      challenges: '' 
    });
  };

  const changeDate = (offset: number) => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'DAILY') newDate.setDate(selectedDate.getDate() + offset);
    else if (viewMode === 'WEEKLY') newDate.setDate(selectedDate.getDate() + offset * 7);
    else if (viewMode === 'MONTHLY') newDate.setMonth(selectedDate.getMonth() + offset);
    setSelectedDate(newDate);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 animate-fade-in">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div className="flex flex-col">
            <h1 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Official Journal</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Unified Officer Memory</p>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          {(['DAILY', 'WEEKLY', 'MONTHLY'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 lg:px-6 py-2 rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === mode ? 'bg-white text-orange-400 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {mode[0]}<span className="hidden sm:inline">{mode.slice(1)}</span>
            </button>
          ))}
        </div>

        <button 
          onClick={() => {
            setForm({
              content: '',
              category: 'General Duty',
              date: new Date().toISOString().split('T')[0],
              time: new Date().toTimeString().slice(0, 5),
              outcomes: '',
              challenges: ''
            });
            setShowAddModal(true);
          }}
          className="px-4 lg:px-6 py-2.5 bg-orange-400 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-orange-100 hover:scale-105 active:scale-95 transition-all"
        >
          <span className="sm:hidden">+</span> <span className="hidden sm:inline">New Entry</span>
        </button>
      </header>

      <div className="flex-1 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 p-4 lg:p-8">
        <aside className="lg:col-span-3 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-4">Timeline Navigation</h3>
            <div className="flex items-center justify-between gap-2 mb-6">
              <button onClick={() => changeDate(-1)} className="p-2 bg-slate-50 rounded-lg hover:bg-slate-100">Prev</button>
              <div className="text-center">
                <p className="text-xs font-black text-slate-800">
                  {viewMode === 'DAILY' ? selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 
                   viewMode === 'WEEKLY' ? `Week ${Math.ceil(selectedDate.getDate() / 7)}` : 
                   selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button onClick={() => changeDate(1)} className="p-2 bg-slate-50 rounded-lg hover:bg-slate-100">Next</button>
            </div>
            
            <input 
              type="date" 
              className="w-full p-4 bg-slate-50 border-none rounded-2xl font-black text-slate-800 outline-none focus:ring-2 focus:ring-orange-100"
              value={selectedDate.toISOString().split('T')[0]}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
            />
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
             <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Duty Overview</h3>
             <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                   <span className="font-bold text-slate-500">Journal Depth</span>
                   <span className="font-black text-orange-400">{filteredEntries.length} Records</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                   <span className="font-bold text-slate-500">System Sync</span>
                   <span className="font-black text-emerald-500">Auto Active</span>
                </div>
                <div className="pt-4 border-t">
                  <p className="text-[10px] text-slate-400 leading-relaxed italic">"System logs include leaves and short leaves recorded in your attendance file."</p>
                </div>
             </div>
          </div>
        </aside>

        <main className="lg:col-span-9 space-y-8">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
               <div className="w-10 h-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recalling Memories...</p>
            </div>
          ) : (
            <div className="relative pl-6 lg:pl-10 pb-20">
              <div className="absolute left-6 lg:left-10 top-0 bottom-0 w-1 bg-slate-200 rounded-full opacity-50"></div>
              
              <div className="space-y-8">
                {filteredEntries.length === 0 ? (
                  <div className="py-24 text-center">
                    <div className="text-6xl mb-6 grayscale opacity-20">📔</div>
                    <p className="text-slate-300 font-bold italic">No records found for this {viewMode.toLowerCase()}.</p>
                  </div>
                ) : (
                  filteredEntries.map((entry) => (
                    <div key={entry.id} className="relative group animate-fade-in">
                      <div className="absolute left-[-24px] lg:left-[-24px] top-6 flex items-center justify-center">
                        <div className={`w-6 h-6 rounded-full border-4 border-slate-50 shadow-md z-10 transition-transform group-hover:scale-125 ${entry.type === 'SYSTEM_LEAVE' ? 'bg-amber-400' : entry.type === 'SYSTEM_TASK' ? 'bg-blue-400' : 'bg-orange-400'}`}></div>
                      </div>
                      
                      <div className="bg-white p-6 lg:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 hover:border-orange-200 transition-all hover:shadow-xl hover:shadow-orange-400/5 group">
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{entry.date}</p>
                            <h3 className="text-lg font-black text-slate-800 group-hover:text-orange-400 transition-colors">{entry.category || 'Duty Entry'}</h3>
                          </div>
                          <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${entry.type.startsWith('SYSTEM') ? 'bg-slate-100 text-slate-400' : 'bg-orange-100 text-orange-600'}`}>
                            {entry.type.replace('_', ' ')}
                          </span>
                        </div>

                        <p className="text-sm font-medium text-slate-600 leading-relaxed mb-6 italic">"{entry.content}"</p>
                        
                        {(entry.outcomes || entry.challenges) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {entry.outcomes && (
                              <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                                <span className="text-[8px] font-black text-emerald-600 uppercase block mb-1">Impact</span>
                                <p className="text-xs font-bold text-slate-700">{entry.outcomes}</p>
                              </div>
                            )}
                            {entry.challenges && (
                              <div className="bg-red-50/50 p-4 rounded-2xl border border-red-100">
                                <span className="text-[8px] font-black text-red-600 uppercase block mb-1">Challenges</span>
                                <p className="text-xs font-bold text-slate-700">{entry.challenges}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <header className="px-10 py-8 border-b bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tighter">New Journal Entry</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Add Manual Work Reflection</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </header>

            <form onSubmit={handleAddEntry} className="p-10 space-y-8 overflow-y-auto no-scrollbar">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest">DESCRIPTION</label>
                <textarea 
                  required
                  placeholder="What was the main professional task performed today?"
                  className="w-full p-6 bg-slate-50 border-2 border-transparent focus:border-orange-100 focus:bg-white rounded-[2rem] text-sm font-bold text-slate-800 outline-none transition-all"
                  rows={3}
                  value={form.content}
                  onChange={e => setForm({...form, content: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest">CATEGORY</label>
                    <select 
                      className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-slate-800 outline-none"
                      value={form.category}
                      onChange={e => setForm({...form, category: e.target.value})}
                    >
                      <option>General Duty</option>
                      <option>Field Duty</option>
                      <option>Meeting</option>
                      <option>Administrative</option>
                      <option>Legal</option>
                    </select>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest">DATE & TIME</label>
                    <div className="flex gap-4">
                       <input type="date" className="flex-1 p-4 bg-slate-50 border rounded-2xl text-xs font-bold text-slate-800" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                       <input type="time" className="w-24 p-4 bg-slate-50 border rounded-2xl text-xs font-bold" value={form.time} onChange={e => setForm({...form, time: e.target.value})} />
                    </div>
                 </div>
              </div>

              <button 
                type="submit"
                className="w-full py-5 bg-orange-400 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl mt-10"
              >
                SAVE ENTRY
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficialJournal;