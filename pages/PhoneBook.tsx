
import React, { useState, useEffect, useMemo } from 'react';
import { UserRole } from '../types';
import type { Officer, AttendanceRegistryItem } from '../types';
import { COLORS, FLOOR_MAP_PATHS, Icons } from '../constants';
import { api } from '../service/api';

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

const PhoneBook: React.FC<Props> = ({ lang, user: currentUser }) => {
  const t = (si: string, en: string) => lang === 'SI' ? si : en;
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'LIST' | 'MAP'>('LIST');
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [staff, setStaff] = useState<Officer[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRegistryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const dateStr = new Date().toLocaleDateString('en-CA');
        const [staffData, attendanceData] = await Promise.all([
          api.getAllStaff(),
          api.getAttendanceRegistry(dateStr)
        ]);
        setStaff(staffData);
        setAttendance(attendanceData || []);
      } catch (err) {
        console.error("Failed to fetch directory data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const occupancy = useMemo(() => {
    const counts: Record<string, number> = {};
    attendance.forEach(record => {
      const officer = staff.find(s => String(s.id) === String(record.officer_id));
      if (officer && record.status === 'PRESENT') {
        counts[officer.department] = (counts[officer.department] || 0) + 1;
      }
    });
    return counts;
  }, [staff, attendance]);

  const filteredStaff = useMemo(() => {
    return staff.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           s.post.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           s.department.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDept = selectedDept ? s.department === selectedDept : true;
      return matchesSearch && matchesDept;
    });
  }, [staff, searchTerm, selectedDept]);

  const isPresent = (id: string | number) => attendance.some(a => String(a.officer_id) === String(id) && a.status === 'PRESENT');

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-12">
      <div className="bg-white p-8 rounded-[3.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="flex-1 w-full">
          <h2 className="text-3xl font-black text-[#003366] tracking-tighter mb-5 px-1">{t('නිලධාරී නාමාවලිය', 'Phone Directory')}</h2>
          <div className="relative group w-full">
            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#1877F2] transition-colors pointer-events-none z-10 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input 
              type="text" 
              placeholder={t('නම හෝ තනතුර අනුව සොයන්න...', 'Search by name or post...')}
              className="w-full pl-14 pr-6 py-5 bg-slate-50 border-2 border-transparent focus:border-[#1877F2]/20 focus:bg-white rounded-[1.5rem] outline-none transition-all font-bold text-slate-700 shadow-inner relative z-0"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 flex-shrink-0">
          <button 
            onClick={() => setViewMode('LIST')}
            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${viewMode === 'LIST' ? 'bg-white text-[#1877F2] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Icons.Dashboard /> {t('ලැයිස්තුව', 'List')}
          </button>
          <button 
            onClick={() => setViewMode('MAP')}
            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${viewMode === 'MAP' ? 'bg-white text-[#1877F2] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Icons.Map /> {t('සිතියම', 'Map')}
          </button>
        </div>
      </div>

      {viewMode === 'MAP' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
           <div className="lg:col-span-8 bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm">
             <div className="flex justify-between items-center mb-8">
               <h3 className="text-xl font-black text-slate-900 tracking-tighter flex items-center gap-2">
                  <span className="w-2.5 h-8 bg-[#1877F2] rounded-full"></span>
                  {t('තත්‍ය කාලීන අංශ සිතියම', 'Real-time Occupancy Map')}
               </h3>
               <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Sync</span>
               </div>
             </div>

             <div className="relative aspect-[4/3] bg-slate-50 rounded-[2.5rem] border border-slate-100 overflow-hidden flex items-center justify-center p-4">
                <svg viewBox="0 0 100 170" className="w-full h-full">
                  {Object.entries(FLOOR_MAP_PATHS).map(([dept, path]) => {
                    const count = occupancy[dept] || 0;
                    const match = path.match(/M (\d+),(\d+) H (\d+) V (\d+)/);
                    const x = match ? (parseInt(match[1]) + parseInt(match[3])) / 2 : 50;
                    const y = match ? (parseInt(match[2]) + parseInt(match[4])) / 2 : 50;

                    return (
                      <g 
                        key={dept} 
                        className="cursor-pointer group"
                        onClick={() => setSelectedDept(selectedDept === dept ? null : dept)}
                      >
                        <path 
                          d={path} 
                          fill={selectedDept === dept ? (COLORS.depts as any)[dept] || '#1877F2' : '#ffffff'} 
                          stroke={selectedDept === dept ? '#fff' : '#cbd5e1'}
                          strokeWidth="0.8"
                          className="transition-all duration-300 shadow-lg"
                        />
                        {count > 0 && (
                          <g transform={`translate(${x}, ${y})`}>
                            <circle r="4" fill="#10b981" stroke="#fff" strokeWidth="1" />
                            <text 
                              dy="1"
                              textAnchor="middle" 
                              className="fill-white text-[3px] font-black"
                              style={{ pointerEvents: 'none' }}
                            >
                              {count}
                            </text>
                          </g>
                        )}
                        <text 
                          x={(path.match(/M (\d+)/)?.[1] || 0) as any + 2} 
                          y={(path.match(/H (\d+) V (\d+)/)?.[2] || 0) as any - 2} 
                          className={`text-[3.5px] font-black uppercase tracking-tighter pointer-events-none transition-all ${selectedDept === dept ? 'fill-white' : 'fill-slate-400'}`}
                        >
                          {dept}
                        </text>
                      </g>
                    );
                  })}
                </svg>
             </div>
           </div>
           
           <div className="lg:col-span-4 space-y-6">
              <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl">
                 <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-6">Legend & Status</h4>
                 <div className="space-y-4">
                    {Object.keys(FLOOR_MAP_PATHS).map(dept => (
                      <div 
                        key={dept} 
                        onClick={() => setSelectedDept(selectedDept === dept ? null : dept)}
                        className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all ${selectedDept === dept ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5'}`}
                      >
                        <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: (COLORS.depts as any)[dept] || '#cbd5e1' }}></div>
                        <span className="text-[10px] font-black uppercase tracking-widest flex-1">{dept}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${occupancy[dept] ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500'}`}>
                          {occupancy[dept] || 0} IN
                        </span>
                      </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredStaff.length > 0 ? filteredStaff.map(s => (
            <div 
              key={s.id} 
              className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-xl hover:border-[#1877F2]/20 transition-all flex items-center gap-5 group cursor-pointer active:scale-[0.98]"
              onClick={() => window.location.href = `tel:${s.official_phone}`}
            >
              <div className="relative flex-shrink-0">
                 <div className="w-16 h-16 rounded-[1.5rem] border-4 border-[#1877F2]/10 p-0.5 overflow-hidden group-hover:border-[#1877F2]/30 transition-colors">
                    <img 
                      src={s.profile_pic || `https://ui-avatars.com/api/?name=${s.name}&background=1877F2&color=fff`} 
                      className="w-full h-full object-cover rounded-[1.2rem]" 
                      alt={s.name} 
                    />
                 </div>
                 {isPresent(s.id) && (
                   <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></span>
                 )}
              </div>

              <div className="flex-1 min-w-0">
                <h5 className="font-bold text-slate-800 text-lg leading-tight tracking-tight group-hover:text-[#1877F2] transition-colors truncate">
                  {s.name}
                </h5>
                <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest mt-1 truncate">
                  {s.post} · {s.department}
                </p>
              </div>

              <div className="pr-4 hidden sm:block flex-shrink-0">
                 <span className="text-slate-800 font-black text-sm tracking-tighter opacity-60 group-hover:opacity-100 transition-all tabular-nums whitespace-nowrap">
                   {s.official_phone}
                 </span>
              </div>
            </div>
          )) : (
            <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border border-dashed border-slate-200">
               <span className="text-4xl mb-4 block">🔍</span>
               <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">{t('වාර්තා කිසිවක් හමු නොවීය.', 'No results found')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PhoneBook;
