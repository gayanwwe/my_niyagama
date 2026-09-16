import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as ReactRouterDom from 'react-router-dom';
import type { Officer } from '../types';
import { api } from '../service/api';
import { translations, TranslationKey } from '../service/i18n';
import { Skeleton } from '../components/Skeleton';

// Destructure from namespace import to resolve "no exported member" errors
const { useNavigate } = ReactRouterDom;

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

interface PreviewLog {
  bioId: string;
  date: string;
  timeIn: string;
}

const DivisionalSettings: React.FC<Props> = ({ lang }) => {
  const navigate = useNavigate();
  const t = (si: string, en: string) => lang === 'SI' ? si : en;
  
  const [activeTab, setActiveTab] = useState<'HOURS' | 'HOLIDAYS' | 'BIOMETRIC'>('HOURS');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [holidays, setHolidays] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Biometric Import State
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewLogs, setPreviewLogs] = useState<PreviewLog[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newHoliday, setNewHoliday] = useState({ date: '', name: '', type: 'PUBLIC' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [settingsData, holidaysData] = await Promise.all([
        api.getDivisionalSettings(),
        api.getHolidays()
      ]);
      setSettings(settingsData);
      setHolidays(holidaysData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.updateDivisionalSettings(settings);
      alert(t('සැකසුම් සාර්ථකව යාවත්කාලීන කරන ලදී!', 'Settings updated successfully!'));
    } catch (e: any) { alert(e.message); }
    finally { setIsSaving(false); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setImportStatus(null);
      
      // Parse for preview
      const reader = new FileReader();
      reader.onload = (re) => {
        const content = re.target?.result as string;
        const lines = content.split(/\r?\n/).filter(l => l.trim());
        const preview: PreviewLog[] = [];
        lines.slice(0, 10).forEach(line => {
           const parts = line.split(/[,;\t]/).map(p => p.trim());
           if (parts.length >= 3) {
             preview.push({ bioId: parts[0], date: parts[1], timeIn: parts[2] });
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
          const parts = line.split(/[,;\t]/).map(p => p.trim());
          if (parts.length >= 3) {
            logsToSend.push({ bioId: parts[0], date: parts[1], timeIn: parts[2] });
          }
        });

        const res = await api.importBiometricLogs(logsToSend);
        setImportStatus(`✅ ${res.message}`);
        setSelectedFile(null);
        setPreviewLogs([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err: any) {
        setImportStatus(`❌ ${err.message}`);
      } finally {
        setImportLoading(false);
      }
    };
    reader.readAsText(selectedFile);
  };

  const generateSampleFile = () => {
    const today = new Date().toISOString().split('T')[0];
    const csvContent = `1001, ${today}, 08:15\n1002, ${today}, 08:24\n9999, ${today}, 08:45`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sample_logs.csv`;
    a.click();
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHoliday.date || !newHoliday.name) return;
    setIsSaving(true);
    try {
      await api.createHoliday(newHoliday);
      setNewHoliday({ date: '', name: '', type: 'PUBLIC' });
      loadData();
    } catch (e: any) { alert(e.message); }
    finally { setIsSaving(false); }
  };

  const handleDeleteHoliday = async (id: number) => {
    if (!confirm(t('මෙම නිවාඩු දිනය ඉවත් කිරීමට ඔබට විශ්වාසද?', 'Are you sure you want to remove this holiday?'))) return;
    try {
      await api.deleteHoliday(id);
      loadData();
    } catch (e: any) { alert(e.message); }
  };

  if (isLoading) return <div className="p-10 space-y-10"><Skeleton className="w-1/3 h-12 rounded-3xl" /><Skeleton className="w-full h-64 rounded-[3rem]" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-10 animate-fade-in pb-20">
      <div>
        <h2 className="text-5xl font-black text-slate-900 tracking-tighter">Divisional Settings</h2>
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">Institutional Configuration Hub</p>
      </div>

      <div className="flex bg-white p-2 rounded-3xl border border-slate-100 shadow-sm w-fit">
        {['HOURS', 'HOLIDAYS', 'BIOMETRIC'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-[#1877F2] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'BIOMETRIC' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 space-y-8">
            <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100">
               <div className="flex justify-between items-start mb-8">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Terminal Log Ingestion</h3>
                  <button onClick={generateSampleFile} className="text-[9px] font-black uppercase text-blue-600 hover:underline">Download Format</button>
               </div>
               
               <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".csv,.txt" />
               
               {!selectedFile ? (
                 <div 
                   onClick={() => fileInputRef.current?.click()}
                   className="w-full p-20 border-4 border-dashed border-slate-100 rounded-[3rem] bg-slate-50 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-200 hover:bg-white transition-all group"
                 >
                    <span className="text-6xl group-hover:scale-110 transition-transform">📂</span>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Browse Terminal Logs</p>
                 </div>
               ) : (
                 <div className="space-y-6">
                    <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl flex justify-between items-center">
                       <div>
                          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none">Selected Data Source</p>
                          <h5 className="text-sm font-black text-blue-900 mt-1">{selectedFile.name}</h5>
                       </div>
                       <button onClick={() => { setSelectedFile(null); setPreviewLogs([]); }} className="text-xs font-bold text-red-500 hover:underline">Cancel</button>
                    </div>

                    <div className="bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-xl">
                       <div className="p-5 border-b border-white/5 bg-white/5 flex items-center justify-between">
                          <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Validation Preview (First 10 rows)</p>
                          <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">Format Detected</span>
                       </div>
                       <table className="w-full text-left text-white/80 text-[10px]">
                          <thead className="bg-white/5 font-black uppercase text-white/20">
                             <tr><th className="p-4">Hardware ID</th><th className="p-4">Date</th><th className="p-4">Time</th></tr>
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
                 <div className={`mt-8 p-6 rounded-3xl font-bold text-sm border animate-fade-in ${importStatus.includes('✅') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                    {importStatus}
                 </div>
               )}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
             <div onClick={() => navigate('/admin/biometric')} className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl cursor-pointer hover:scale-[1.02] transition-transform group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 text-8xl opacity-10 group-hover:rotate-12 transition-transform">🧬</div>
                <h4 className="text-2xl font-black tracking-tighter">Biometric Hub</h4>
                <p className="text-sm text-white/40 mt-2 leading-relaxed">Review synced records, manage unmapped hardware signals, and verify physical attendance consistency.</p>
                <div className="mt-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#1877F2]">Open Hub →</div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'HOURS' && (
        <div className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-100">
          <form onSubmit={handleUpdateSettings} className="space-y-10 max-w-2xl">
            <div className="grid grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Work Start</label>
                <input type="time" value={settings.work_start_time || '08:30'} onChange={e => setSettings({...settings, work_start_time: e.target.value})} className="w-full p-6 bg-slate-50 rounded-2xl font-black text-2xl text-[#1877F2] outline-none" />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Work End</label>
                <input type="time" value={settings.work_end_time || '16:15'} onChange={e => setSettings({...settings, work_end_time: e.target.value})} className="w-full p-6 bg-slate-50 rounded-2xl font-black text-2xl text-[#1877F2] outline-none" />
              </div>
            </div>
            <button type="submit" disabled={isSaving} className="px-12 py-5 bg-[#1877F2] text-white rounded-[2rem] font-black uppercase text-[10px] shadow-2xl disabled:opacity-50">Apply Changes</button>
          </form>
        </div>
      )}

      {activeTab === 'HOLIDAYS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
           <div className="lg:col-span-4">
              <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 sticky top-24">
                 <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tighter">Declare Holiday</h3>
                 <form onSubmit={handleAddHoliday} className="space-y-6">
                    <div className="space-y-1.5">
                       <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</label>
                       <input type="date" required value={newHoliday.date} onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Holiday Name</label>
                       <input placeholder="e.g. Independence Day" required value={newHoliday.name} onChange={e => setNewHoliday({...newHoliday, name: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Type</label>
                       <select value={newHoliday.type} onChange={e => setNewHoliday({...newHoliday, type: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold">
                          <option value="PUBLIC">Public</option>
                          <option value="BANK">Bank</option>
                          <option value="MERCANTILE">Mercantile</option>
                          <option value="SPECIAL">Special</option>
                       </select>
                    </div>
                    <button type="submit" disabled={isSaving} className="w-full py-4 bg-[#1877F2] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">Add Holiday</button>
                 </form>
              </div>
           </div>
           <div className="lg:col-span-8">
              <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                       <tr>
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                          <th className="p-6"></th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                       {holidays.length === 0 ? (
                         <tr><td colSpan={4} className="p-20 text-center text-slate-400 font-bold">No holidays declared yet.</td></tr>
                       ) : (
                         holidays.map(h => (
                           <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-6 font-bold text-slate-900">{h.date}</td>
                              <td className="p-6 font-bold text-slate-600">{h.name}</td>
                              <td className="p-6">
                                 <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase tracking-widest">{h.type}</span>
                              </td>
                              <td className="p-6 text-right">
                                 <button onClick={() => handleDeleteHoliday(h.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                 </button>
                              </td>
                           </tr>
                         ))
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default DivisionalSettings;