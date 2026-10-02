import React, { useState, useEffect, useMemo } from 'react';
import type { Officer, Department, Designation } from '../types';
import { UserRole } from '../types';
import { api } from '../service/api';
import { translations, TranslationKey } from '../service/i18n';
import { COLORS } from '../constants';
import { Skeleton } from '../components/Skeleton';

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

const ROLE_LABELS: Record<string, string> = {
  'OF': 'Officer',
  'CC': 'Chief Clerk',
  'EX': 'Divisional Secretary',
  'PD': 'PDO',
  'SA': 'System Admin',
  'SO': 'Operator',
  'IT': 'IT Specialist',
  'VT': 'VT',
  'LO': 'Leave Officer'
};

const StaffManagement: React.FC<Props> = ({ user, lang }) => {
  console.log("[StaffManagement] Rendering for user:", user.name, "Role:", user.role);
  const t = (key: TranslationKey) => translations[lang][key];
  const [staff, setStaff] = useState<Officer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('ALL');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [labelTab, setLabelTab] = useState<'DEPTS' | 'POSTS'>('DEPTS');
  
  const [editingOfficer, setEditingOfficer] = useState<Officer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dynamic lists from backend
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [newLabelName, setNewLabelName] = useState('');

  const [form, setForm] = useState<Partial<Officer>>({
    name: '',
    username: '',
    biometric_id: '',
    post: '',
    department: '',
    role: UserRole.OFFICER,
    work_type: 'OFFICE',
    official_phone: '',
    address: ''
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Settled rather than all: a failure fetching the department or
      // designation lists used to reject the whole batch, so the staff
      // registry rendered empty even though the officer list had loaded.
      const [staffRes, deptsRes, postsRes] = await Promise.allSettled([
        api.getAllStaff(),
        api.getDepartments(),
        api.getDesignations()
      ]);

      if (staffRes.status === 'rejected') throw staffRes.reason;
      const staffData = staffRes.value || [];
      const deptsData = deptsRes.status === 'fulfilled' ? (deptsRes.value || []) : [];
      const postsData = postsRes.status === 'fulfilled' ? (postsRes.value || []) : [];

      if (deptsRes.status === 'rejected') console.error('Departments failed to load:', deptsRes.reason);
      if (postsRes.status === 'rejected') console.error('Designations failed to load:', postsRes.reason);

      setStaff(staffData);
      setDepartments(deptsData);
      setDesignations(postsData);
      
      // Default form values if empty
      if (deptsData.length > 0 && !form.department) {
        setForm(f => ({...f, department: deptsData[0].name }));
      }
      if (postsData.length > 0 && !form.post) {
        setForm(f => ({...f, post: postsData[0].name }));
      }
    } catch (e: any) {
      setErrorMessage(e.message || "Could not load records from server.");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredStaff = useMemo(() => {
    return staff.filter(s => {
      const name = s.name || '';
      const bioId = s.biometric_id || '';
      const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           bioId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDept = selectedDeptFilter === 'ALL' || s.department === selectedDeptFilter;
      return matchesSearch && matchesDept;
    });
  }, [staff, searchTerm, selectedDeptFilter]);

  const handleEdit = (officer: Officer) => {
    setEditingOfficer(officer);
    setForm({
      ...officer,
      name: officer.name || '',
      username: officer.username || '',
      biometric_id: officer.biometric_id || '',
      post: officer.post || '',
      department: officer.department || '',
      official_phone: officer.official_phone || '',
      address: officer.address || '',
      profile_pic: officer.profile_pic || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string | number) => {
    if (id === user.id) {
      alert("Self-deactivation is prohibited.");
      return;
    }

    if (!window.confirm(lang === 'SI' ? "මෙම නිලධාරියා ඉවත් කිරීමට ඔබට විශ්වාසද?" : "Are you sure you want to deactivate this officer?")) return;
    
    try {
      await api.deleteStaff(id);
      setStaff(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      alert(e.message || "Operation failed.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (editingOfficer) {
        const updated = await api.updateStaff(editingOfficer.id, form);
        setStaff(prev => prev.map(s => s.id === editingOfficer.id ? updated : s));
      } else {
        const created = await api.createStaff(form);
        setStaff([created, ...staff]);
      }
      setIsModalOpen(false);
      resetForm();
    } catch (e: any) {
      setErrorMessage(e.message || "Error saving officer profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;
    setIsSaving(true);
    try {
      if (labelTab === 'DEPTS') {
        const res = await api.createDepartment(newLabelName);
        setDepartments([...departments, res]);
      } else {
        const res = await api.createDesignation(newLabelName);
        setDesignations([...designations, res]);
      }
      setNewLabelName('');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLabel = async (id: string | number) => {
    if (!window.confirm("Delete this category label? Officers using it will remain but the label won't be selectable for new ones.")) return;
    try {
      if (labelTab === 'DEPTS') {
        await api.deleteDepartment(id);
        setDepartments(prev => prev.filter(d => d.id !== id));
      } else {
        await api.deleteDesignation(id);
        setDesignations(prev => prev.filter(d => d.id !== id));
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const resetForm = () => {
    setEditingOfficer(null);
    setErrorMessage(null);
    setForm({
      name: '',
      username: '',
      biometric_id: '',
      post: designations[0]?.name || '',
      department: departments[0]?.name || '',
      role: UserRole.OFFICER,
      work_type: 'OFFICE',
      official_phone: '',
      address: ''
    });
  };

  const deptFilters = ['ALL', ...departments.map(d => d.name)];

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-5xl font-black text-slate-900 tracking-tighter">{t('manageStaff')}</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">Institutional Human Resources Control</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setIsLabelModalOpen(true)}
            className="px-6 py-5 bg-slate-100 text-slate-600 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all border border-slate-200"
          >
            Manage Labels
          </button>
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="px-10 py-5 bg-[#1877F2] text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all"
          >
            {t('addOfficer')}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 relative">
           <input 
             type="text" 
             placeholder={t('searchPlaceholder')} 
             value={searchTerm}
             onChange={e => setSearchTerm(e.target.value)}
             className="w-full pl-14 pr-6 py-5 bg-white border border-slate-100 rounded-[2rem] shadow-sm outline-none focus:ring-4 focus:ring-[#1877F2]/5 transition-all font-bold text-slate-700"
           />
           <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300">🔍</span>
        </div>
        <div className="flex bg-white p-1 rounded-2xl border border-slate-100 overflow-x-auto no-scrollbar shadow-sm">
           {deptFilters.map((d, idx) => (
             <button 
               key={`${d}-${idx}`} 
               onClick={() => setSelectedDeptFilter(d)}
               className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${selectedDeptFilter === d ? 'bg-[#1877F2] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
             >
               {d}
             </button>
           ))}
        </div>
      </div>

      {errorMessage && (
        <div className="p-6 bg-red-50 border border-red-100 rounded-[2rem] flex items-center gap-4 animate-shake">
          <div className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center text-white text-xl shadow-lg shadow-red-500/20">⚠️</div>
          <div>
            <h4 className="font-black text-red-900 text-sm uppercase tracking-tight">System Error</h4>
            <p className="text-red-600 text-[11px] font-bold">{errorMessage}</p>
          </div>
          <button onClick={() => loadInitialData()} className="ml-auto px-6 py-3 bg-white text-red-600 rounded-xl font-black text-[10px] uppercase tracking-widest border border-red-100 hover:bg-red-50 transition-all">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white p-8 rounded-[3rem] border border-slate-50 space-y-4">
              <Skeleton className="w-full h-24 rounded-2xl" />
            </div>
          ))
        ) : filteredStaff.length === 0 ? (
          <div className="col-span-full py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-slate-300">
             <span className="text-5xl mb-4">👤</span>
             <p className="font-black uppercase text-[10px] tracking-widest">No matching officers found</p>
          </div>
        ) : (
          filteredStaff.map(s => (
            <div key={s.id} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden">
               <div className="flex gap-5 mb-6">
                 <div className="relative">
                    <img 
                        src={s.profile_pic || `https://ui-avatars.com/api/?name=${s.name}&background=random&color=fff`} 
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-50 shadow-sm"
                        alt="avatar" 
                    />
                    {s.id === user.id && (
                        <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full ring-2 ring-white">YOU</span>
                    )}
                 </div>
                 <div className="min-w-0">
                   <h4 className="text-xl font-black text-slate-800 tracking-tight leading-tight truncate">{s.name}</h4>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">{s.post}</p>
                 </div>
               </div>
               
               <div className="space-y-3 pt-6 border-t border-slate-50">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-slate-400 uppercase tracking-widest">Biometric ID</span>
                    <span className="text-slate-800 tabular-nums font-black">{s.biometric_id}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-slate-400 uppercase tracking-widest">Role</span>
                    <span className={`px-2 py-0.5 rounded uppercase tracking-tighter ${s.role === 'SA' ? 'bg-red-100 text-red-600 font-black' : 'bg-slate-100 text-slate-600'}`}>
                       {ROLE_LABELS[s.role] || s.role}
                    </span>
                  </div>
               </div>

               <div className="flex gap-2 mt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(s)} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-100 transition-colors">Edit Profile</button>
                  {s.id !== user.id && (
                    <button onClick={() => handleDelete(s.id)} className="flex-1 py-3 bg-red-50 text-red-500 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-red-100 transition-colors">Deactivate</button>
                  )}
               </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in overflow-y-auto py-10">
          <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col my-auto border border-white/20">
            <header className="px-10 py-8 bg-slate-50 border-b flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{editingOfficer ? t('editOfficer') : t('addOfficer')}</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Officer Credentials & Identity</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </header>
            
            <form onSubmit={handleSave} className="p-10 space-y-6 overflow-y-auto max-h-[70vh] no-scrollbar">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Full Name</label>
                    <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Username</label>
                    <input required value={form.username || ''} onChange={e => setForm({...form, username: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none" />
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Biometric ID (Optional)</label>
                    <input value={form.biometric_id || ''} onChange={e => setForm({...form, biometric_id: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">System Role</label>
                    <select value={form.role} onChange={e => setForm({...form, role: e.target.value as UserRole})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none">
                      {Object.entries(UserRole).map(([key, val]) => <option key={val} value={val}>{ROLE_LABELS[val] || key}</option>)}
                    </select>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Post (Designation)</label>
                    <select required value={form.post} onChange={e => setForm({...form, post: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none">
                      {designations.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Department</label>
                    <select required value={form.department} onChange={e => setForm({...form, department: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none">
                      {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
               </div>

               <button 
                 disabled={isSaving}
                 className="w-full py-5 bg-[#1877F2] text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl mt-4 disabled:opacity-50"
               >
                 {isSaving ? t('loading') : t('saveOfficer')}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* Label Management Modal */}
      {isLabelModalOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col my-auto border border-white/20">
            <header className="px-10 py-8 bg-slate-50 border-b flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">System Labels</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Constants Management</p>
              </div>
              <button onClick={() => setIsLabelModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </header>

            <div className="p-4 bg-slate-100 flex gap-2">
               <button onClick={() => setLabelTab('DEPTS')} className={`flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${labelTab === 'DEPTS' ? 'bg-white text-[#1877F2] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Departments</button>
               <button onClick={() => setLabelTab('POSTS')} className={`flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${labelTab === 'POSTS' ? 'bg-white text-[#1877F2] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Posts (Designations)</button>
            </div>

            <div className="p-10 space-y-6 flex-1 overflow-y-auto max-h-[60vh] no-scrollbar">
               <div className="flex gap-4">
                  <input 
                    type="text" 
                    value={newLabelName}
                    onChange={e => setNewLabelName(e.target.value)}
                    placeholder={`New ${labelTab === 'DEPTS' ? 'Department' : 'Designation'}...`}
                    className="flex-1 p-4 bg-slate-50 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-[#1877F2]/20"
                  />
                  <button 
                    onClick={handleCreateLabel}
                    disabled={isSaving || !newLabelName.trim()}
                    className="px-6 bg-[#1877F2] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 disabled:opacity-50"
                  >
                    Add
                  </button>
               </div>

               <div className="space-y-2">
                  {(labelTab === 'DEPTS' ? departments : designations).map(item => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl group hover:bg-slate-100 transition-colors">
                       <span className="font-bold text-slate-700">{item.name}</span>
                       <button onClick={() => handleDeleteLabel(item.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                       </button>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
