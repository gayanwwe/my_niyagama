import React, { useState, useEffect } from 'react';
import type { Officer } from '../types';
import { api } from '../service/api';
import { translations, TranslationKey } from '../service/i18n';
import { Skeleton } from '../components/Skeleton';

interface AuditLog {
  id: number;
  officer_id: number | null;
  officer?: Officer;
  event_type: string;
  resource: string | null;
  description: string;
  payload: any;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

const SecurityAudit: React.FC<Props> = ({ lang }) => {
  const t = (si: string, en: string) => lang === 'SI' ? si : en;
  
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const res = await api.getAuditLogs();
      // api.request() already unwraps the envelope's `data`, so `res` IS the
      // array. Reading `res.data` gave undefined, and the first `logs.filter`
      // threw - this page has never rendered. The comment it carried was left
      // over from a Laravel backend that no longer exists.
      setLogs(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'AUTH_FAILURE': return 'bg-red-500';
      case 'LOGIN': return 'bg-emerald-500';
      case 'DATA_DELETED': return 'bg-red-600';
      case 'DATA_CREATED': return 'bg-blue-500';
      case 'DATA_UPDATED': return 'bg-amber-500';
      default: return 'bg-slate-500';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8 animate-fade-in p-10">
        <Skeleton className="w-1/3 h-12 rounded-3xl" />
        <Skeleton className="w-full h-[600px] rounded-[3rem]" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-fade-in pb-20">
      <div>
        <h2 className="text-5xl font-black text-slate-900 tracking-tighter">Security Audit</h2>
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">Immutable Access & Data Logs</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Failed Logins (24h)</p>
           <h3 className="text-4xl font-black text-red-500 mt-4 tracking-tighter">
             {logs.filter(l => l.event_type === 'AUTH_FAILURE').length}
           </h3>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Mutations</p>
           <h3 className="text-4xl font-black text-amber-500 mt-4 tracking-tighter">
             {logs.filter(l => l.event_type.startsWith('DATA_')).length}
           </h3>
        </div>
      </div>

      <div className="bg-slate-900 rounded-[3.5rem] overflow-hidden shadow-2xl border border-white/10">
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-900/50">
           <h3 className="text-white font-black uppercase text-[10px] tracking-widest">Live Audit Terminal</h3>
           <button onClick={loadLogs} className="text-white/40 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
           </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
             <thead className="bg-white/5 text-[10px] font-black text-white/40 uppercase tracking-widest">
                <tr>
                   <th className="p-6">Timestamp</th>
                   <th className="p-6">Event</th>
                   <th className="p-6">Officer</th>
                   <th className="p-6">Description</th>
                   <th className="p-6 text-right">Details</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-white/5">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/5 transition-colors group">
                    <td className="p-6 text-white/60 font-mono text-xs whitespace-nowrap">
                       {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="p-6">
                       <span className={`px-3 py-1 rounded-full text-[8px] font-black text-white uppercase tracking-tighter ${getEventColor(log.event_type)}`}>
                         {log.event_type}
                       </span>
                    </td>
                    <td className="p-6">
                       <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-xs">
                           {log.officer?.name?.[0] || '?'}
                         </div>
                         <div className="min-w-0">
                           <p className="text-white text-xs font-bold truncate">{log.officer?.name || 'System / Guest'}</p>
                           <p className="text-white/20 text-[9px] font-bold uppercase truncate">{log.ip_address}</p>
                         </div>
                       </div>
                    </td>
                    <td className="p-6 text-white/80 text-xs font-medium">
                       {log.description}
                    </td>
                    <td className="p-6 text-right">
                       <button 
                        onClick={() => setSelectedLog(log)}
                        className="text-white/30 group-hover:text-blue-400 transition-all font-black uppercase text-[10px] tracking-widest"
                       >
                         View Raw
                       </button>
                    </td>
                  </tr>
                ))}
             </tbody>
          </table>
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
           <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden">
              <div className="p-8 border-b bg-slate-50 flex justify-between items-center">
                 <h4 className="text-xl font-black text-slate-900 tracking-tighter">Event Payload Details</h4>
                 <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-slate-200 rounded-full transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                 </button>
              </div>
              <div className="p-10 space-y-6">
                 <div className="p-6 bg-slate-900 rounded-3xl overflow-auto max-h-[400px]">
                    <pre className="text-emerald-400 font-mono text-xs leading-relaxed">
                       {JSON.stringify(selectedLog.payload, null, 2) || "// No data payload for this event"}
                    </pre>
                 </div>
                 <div className="grid grid-cols-2 gap-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <div>
                       <span className="block mb-1">User Agent</span>
                       <span className="text-slate-800 break-words normal-case font-medium">{selectedLog.user_agent}</span>
                    </div>
                    <div>
                       <span className="block mb-1">Origin IP</span>
                       <span className="text-slate-800">{selectedLog.ip_address}</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default SecurityAudit;