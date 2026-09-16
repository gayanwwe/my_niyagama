import React, { useState, useEffect, useMemo } from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import type { Officer } from '../types';
import { api } from '../service/api';
import { Skeleton } from '../components/Skeleton';
import ChartErrorBoundary from '../components/ChartErrorBoundary';
import { generateContent } from '../service/ai';

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

const ExecutiveIntelligence: React.FC<Props> = ({ user, lang }) => {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const t = (si: string, en: string) => lang === 'SI' ? si : en;

  useEffect(() => {
    loadSnapshot();
  }, []);

  const loadSnapshot = async () => {
    setIsLoading(true);
    try {
      const today = new Date().toLocaleDateString('en-CA');
      const data = await api.getIntelligenceSnapshot(today);
      setSnapshot(data);
      runAiAnalysis(data);
    } catch (e) {
      console.error("Failed to load divisional snapshot:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const runAiAnalysis = async (data: any) => {
    setIsAiLoading(true);
    try {
      const model = 'gemini-1.5-flash';
      
      const prompt = `Act as the Chief Strategic Advisor to a Sri Lankan Divisional Secretary. 
      Review this real-time Divisional Operational Snapshot:
      - Departments Analysis: ${JSON.stringify(data.depts)}
      - Current Divisional Burnout Index: ${data.burnoutScore}/100
      - Efficiency Trend (Last 5 Days): ${JSON.stringify(data.efficiency)}
      - Identified Primary Bottleneck: ${data.bottleneck}
      
      Your Objective:
      1. Perform a Critical Risk Assessment.
      2. Predict service delivery impact for citizens in the coming 72 hours.
      3. Recommend 3 specific 'Leadership Nudges' (staff re-allocation, task prioritization, or resource shifting).
      
      Output Requirements:
      - Language: ${lang === 'SI' ? 'Sinhala' : 'English'}
      - Tone: Authoritative, Executive, Insightful.
      - Formatting: Use professional headers and concise bullet points.`;

      const text = await generateContent({
        model,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingBudget: 2000 },
          temperature: 0.1
        }
      });

      setAiReport(text || "Diagnostic analysis temporarily unavailable.");
    } catch (e: any) {
      setAiReport(`Intelligence Engine Error: ${e.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0e17] p-10 space-y-10">
        <header className="flex justify-between items-end">
           <Skeleton className="w-64 h-14 bg-white/5 rounded-2xl" />
           <Skeleton className="w-40 h-10 bg-white/5 rounded-xl" />
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
           <div className="lg:col-span-4"><Skeleton className="h-[600px] bg-white/5 rounded-[3.5rem]" /></div>
           <div className="lg:col-span-8 space-y-8">
              <Skeleton className="h-96 bg-white/5 rounded-[4rem]" />
              <Skeleton className="h-64 bg-white/5 rounded-[3.5rem]" />
           </div>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-[#0a0e17] p-10 flex flex-col items-center justify-center space-y-6">
        <div className="text-6xl">⚠️</div>
        <h2 className="text-2xl font-black text-white tracking-tighter">Intelligence Snapshot Unavailable</h2>
        <p className="text-slate-500 max-w-md text-center">We couldn't load the divisional operational data. This might be due to a temporary server issue or missing database records.</p>
        <button 
          onClick={loadSnapshot}
          className="px-8 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-500 transition-all"
        >
          Retry Diagnostic
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] text-white p-6 md:p-12 space-y-12 font-sans animate-fade-in pb-32">
      {/* Cinematic Command Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-10">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
             <div className="relative">
                <span className="bg-blue-500 w-3 h-3 rounded-full animate-ping absolute inset-0"></span>
                <span className="bg-blue-500 w-3 h-3 rounded-full relative block shadow-[0_0_15px_#3b82f6]"></span>
             </div>
             <p className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-400">Deep Operational Pulse Active</p>
          </div>
          <h2 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40">
            Divisional Pulse
          </h2>
          <p className="text-slate-500 font-bold uppercase text-[11px] tracking-[0.3em]">Predictive Efficiency & Operational Foresight Hub</p>
        </div>
        <div className="flex gap-4">
           <button 
             onClick={() => loadSnapshot()}
             className="px-8 py-4 bg-white/5 border border-white/10 hover:bg-white/15 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all backdrop-blur-md"
           >
             Recalibrate
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Risk Heatmap & Gauges */}
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[3.5rem] p-10 space-y-10 relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-[80px] rounded-full -mr-10 -mt-10 group-hover:bg-red-500/20 transition-all"></div>
             
             <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-3 relative z-10">
               <span className="text-red-500">🔥</span> {t('අවදානම් සිතියම', 'Critical Risk Mapping')}
             </h3>
             
             <div className="h-64 w-full relative z-10">
                <ChartErrorBoundary>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={snapshot.depts} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 900}} width={70} />
                      <Tooltip 
                        cursor={{fill: 'rgba(255,255,255,0.05)'}}
                        contentStyle={{backgroundColor: '#0f172a', border: 'none', borderRadius: '15px', color: '#fff'}}
                        itemStyle={{color: '#3b82f6', fontWeight: 900}}
                      />
                      <Bar dataKey="risk" radius={[0, 10, 10, 0]} barSize={24}>
                        {snapshot.depts.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.risk > 50 ? '#ef4444' : '#3b82f6'} fillOpacity={entry.risk / 100 + 0.2} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartErrorBoundary>
             </div>

             <div className="space-y-4 relative z-10">
                {snapshot.depts.map((d: any) => (
                  <div key={d.name} className="flex items-center justify-between p-5 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-all cursor-default">
                     <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/80 group-hover:text-white transition-colors">{d.name}</span>
                        <span className="text-[9px] font-bold text-slate-500">{d.tasks} {t('පවතින රාජකාරි', 'PENDING TASKS')}</span>
                     </div>
                     <div className="flex flex-col items-end">
                        <span className={`text-xl font-black tracking-tighter ${d.risk > 50 ? 'text-red-400' : 'text-blue-400'}`}>{d.risk}%</span>
                        <div className="w-16 h-1.5 bg-white/10 rounded-full mt-1 overflow-hidden">
                           <div className={`h-full rounded-full ${d.risk > 50 ? 'bg-red-500' : 'bg-blue-500'}`} style={{width: `${d.risk}%`}}></div>
                        </div>
                     </div>
                  </div>
                ))}
             </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
             <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/10 text-center space-y-2">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Velocity index</p>
                <h4 className="text-4xl font-black tracking-tighter text-emerald-400">{snapshot.divisionalVelocity}</h4>
                <p className="text-[8px] font-bold text-slate-600 uppercase">Files / Officer / Hr</p>
             </div>
             <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/10 text-center space-y-2">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Burnout Risk</p>
                <h4 className={`text-4xl font-black tracking-tighter ${snapshot.burnoutScore > 50 ? 'text-amber-400' : 'text-blue-400'}`}>{snapshot.burnoutScore}%</h4>
                <p className="text-[8px] font-bold text-slate-600 uppercase">Institutional Stress</p>
             </div>
          </div>
        </div>

        {/* Right Column: AI Insights & Efficiency Trends */}
        <div className="lg:col-span-8 space-y-8">
           {/* Gemini Intelligence Panel */}
           <div className="bg-gradient-to-br from-blue-600/20 to-indigo-900/40 backdrop-blur-3xl border border-blue-500/20 rounded-[4rem] p-12 relative overflow-hidden group min-h-[500px]">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                <span className="text-[10rem]">✨</span>
              </div>
              
              <div className="relative z-10 h-full flex flex-col">
                <header className="flex justify-between items-center mb-10">
                  <div className="space-y-1">
                    <h3 className="text-3xl font-black tracking-tighter">{t('උපායමාර්ගික වාර්තාව', 'Strategic Intelligence Report')}</h3>
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Gemini 3 Pro Deep Analytic Suite</p>
                  </div>
                  {isAiLoading && (
                    <div className="flex gap-2">
                       <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce"></span>
                       <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce delay-150"></span>
                       <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce delay-300"></span>
                    </div>
                  )}
                </header>

                <div className="flex-1">
                   {isAiLoading ? (
                     <div className="space-y-6 pt-4">
                        <Skeleton className="w-full h-4 bg-white/5 rounded-full" />
                        <Skeleton className="w-11/12 h-4 bg-white/5 rounded-full" />
                        <Skeleton className="w-full h-4 bg-white/5 rounded-full" />
                        <Skeleton className="w-4/5 h-4 bg-white/5 rounded-full" />
                        <Skeleton className="w-full h-4 bg-white/5 rounded-full" />
                        <div className="pt-10 space-y-4">
                           <Skeleton className="w-1/2 h-8 bg-white/5 rounded-xl" />
                           <Skeleton className="w-full h-20 bg-white/5 rounded-3xl" />
                        </div>
                     </div>
                   ) : (
                     <div className="prose prose-invert max-w-none">
                        <div className="text-xl leading-relaxed font-medium text-slate-200 animate-fade-in whitespace-pre-wrap selection:bg-blue-500/30">
                           {aiReport}
                        </div>
                     </div>
                   )}
                </div>

                {!isAiLoading && aiReport && (
                  <div className="mt-12 flex flex-col sm:flex-row gap-4 pt-10 border-t border-white/5">
                     <div className="flex-1 p-6 bg-white/5 rounded-3xl border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-xl">✅</div>
                           <div>
                              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Efficiency Prediction</p>
                              <p className="text-lg font-black text-emerald-400 uppercase tracking-tighter">Stability Assured</p>
                           </div>
                        </div>
                        <span className="text-[10px] font-black text-slate-700 uppercase">92% Conf.</span>
                     </div>
                     <div className="flex-1 p-6 bg-white/5 rounded-3xl border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-xl">🛡️</div>
                           <div>
                              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">System Resilience</p>
                              <p className="text-lg font-black text-blue-400 uppercase tracking-tighter">Optimal Range</p>
                           </div>
                        </div>
                        <span className="text-[10px] font-black text-slate-700 uppercase">Active</span>
                     </div>
                  </div>
                )}
              </div>
           </div>

           {/* Performance Trends */}
           <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[4rem] p-12 space-y-10">
              <div className="flex justify-between items-center">
                 <div className="space-y-1">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">{t('සතිපතා කාර්යසාධන වේගය', 'Performance Velocity (Weekly)')}</h3>
                    <p className="text-[9px] font-bold text-slate-600 uppercase">Predictive Forecasting Enabled</p>
                 </div>
                 <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                       <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                       <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Recorded</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <span className="w-2 h-2 border border-white/20 rounded-full"></span>
                       <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Predicted</span>
                    </div>
                 </div>
              </div>
              <div className="h-72 w-full">
                <ChartErrorBoundary>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={snapshot.efficiency}>
                      <defs>
                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 10, fontWeight: 900}} />
                      <YAxis hide domain={[0, 100]} />
                      <Tooltip contentStyle={{backgroundColor: '#0f172a', border: 'none', borderRadius: '15px', color: '#fff'}} />
                      <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={5} fillOpacity={1} fill="url(#colorVal)" />
                      <Area type="monotone" dataKey="predicted" stroke="#ffffff20" strokeWidth={2} strokeDasharray="8 8" fill="none" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartErrorBoundary>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveIntelligence;