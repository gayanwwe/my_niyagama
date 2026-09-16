
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import type { Officer, Circle, CircleProject, ProjectTask, TaskUpdate, TaskPriority } from '../types';
import { api } from '../service/api';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Radar as ReRadar } from 'recharts';
import { CardSkeleton } from '../components/Skeleton';
import { translations, TranslationKey } from '../service/i18n';
import ChartErrorBoundary from '../components/ChartErrorBoundary';

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

const PRESET_COLORS = ['#10b981', '#1877F2', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];
const PRESET_LOGOS = ['🌳', '🎯', '📄', '💡', '🤝', '🚀', '♻️', '📊'];

const CirclesModule: React.FC<Props> = ({ user, lang }) => {
  const t = (key: TranslationKey) => translations[lang][key];
  
  const [circles, setCircles] = useState<Circle[]>([]);
  const [projects, setProjects] = useState<CircleProject[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [staff, setStaff] = useState<Officer[]>([]);
  
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCreateCircleModalOpen, setIsCreateCircleModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  const [newProject, setNewProject] = useState({ title: '', description: '', goal: '', mission: '', vision: '' });
  const [newTask, setNewTask] = useState<{title: string, assignedOfficerId: string, priority: TaskPriority}>({ title: '', assignedOfficerId: '', priority: 'MEDIUM' });
  const [newCircle, setNewCircle] = useState({ name: '', description: '', color: PRESET_COLORS[0], logo: PRESET_LOGOS[0] });
  const [updateText, setUpdateText] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCircles();
    api.getAllStaff().then(setStaff).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedCircleId) loadProjects(selectedCircleId);
    else setProjects([]);
  }, [selectedCircleId]);

  useEffect(() => {
    if (selectedProjectId) loadTasks(selectedProjectId);
    else setTasks([]);
  }, [selectedProjectId]);

  const loadCircles = async () => {
    setIsLoading(true);
    try {
      const data = await api.getCircles();
      setCircles(data);
    } catch (e) { 
      console.error(e); 
    } finally { 
      setIsLoading(false); 
    }
  };

  const loadProjects = async (id: string) => {
    try {
      const data = await api.getProjects(id);
      setProjects(data);
    } catch (e) { 
      console.error(e); 
    }
  };

  const loadTasks = async (id: string) => {
    try {
      const data = await api.getTasks(id);
      setTasks(data);
    } catch (e) { 
      console.error(e); 
    }
  };

  // Dynamic Metrics Engine
  const circleMetrics = useMemo(() => {
    if (!selectedCircleId) return null;
    
    // Calculate metrics for current circle based on tasks and projects
    const circleProjects = projects.filter(p => String(p.circle_id) === String(selectedCircleId));
    const circleTasks = tasks.filter(t => circleProjects.some(p => String(p.id) === String(t.project_id)));
    
    if (circleTasks.length === 0) {
      return { finishing: 1, usability: 1, teamwork: 1, proactivity: 1, impact: 1 };
    }

    const completed = circleTasks.filter(t => t.status === 'COMPLETED').length;
    const finishing = (completed / circleTasks.length) * 5;
    
    const totalUpdates = circleTasks.reduce((acc, t) => acc + (t.updates?.length || 0), 0);
    const proactivity = Math.min(5, (totalUpdates / (circleTasks.length || 1)) * 1.5);
    
    const uniqueAuthors = new Set();
    circleTasks.forEach(t => t.updates?.forEach(u => uniqueAuthors.add(String(u.author_id))));
    const teamwork = Math.min(5, (uniqueAuthors.size / Math.max(1, staff.length / 5)) * 5); 

    const highPriorityCount = circleTasks.filter(t => t.priority === 'HIGH').length;
    const impact = Math.min(5, (highPriorityCount / circleTasks.length) * 5 + (circleProjects.length * 0.5));
    
    const usability = 4; 

    return { 
      finishing: Math.max(1, Math.round(finishing)), 
      usability: Math.round(usability), 
      teamwork: Math.max(1, Math.round(teamwork)), 
      proactivity: Math.max(1, Math.round(proactivity)), 
      impact: Math.max(1, Math.round(impact)) 
    };
  }, [selectedCircleId, projects, tasks, staff]);

  const selectedCircle = useMemo(() => circles.find(c => String(c.id) === String(selectedCircleId)), [circles, selectedCircleId]);
  const activeProject = useMemo(() => projects.find(p => String(p.id) === String(selectedProjectId)), [projects, selectedProjectId]);
  const activeTask = useMemo(() => tasks.find(t => String(t.id) === String(selectedTaskId)), [tasks, selectedTaskId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeTask?.updates]);

  const handleCreateCircle = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.createCircle(newCircle);
      await loadCircles();
      setIsCreateCircleModalOpen(false);
      setNewCircle({ name: '', description: '', color: PRESET_COLORS[0], logo: PRESET_LOGOS[0] });
    } catch (e) { 
      alert(e); 
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCircleId) return;
    setIsLoading(true);
    try {
      await api.createProject(selectedCircleId, newProject);
      await loadProjects(selectedCircleId);
      setIsProjectModalOpen(false);
      setNewProject({ title: '', description: '', goal: '', mission: '', vision: '' });
    } catch (e) { 
      alert(e); 
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    setIsLoading(true);
    try {
      await api.createTask(selectedProjectId, {
        title: newTask.title,
        assigned_officer_id: newTask.assignedOfficerId,
        priority: newTask.priority
      });
      await loadTasks(selectedProjectId);
      setIsTaskModalOpen(false);
      setNewTask({ title: '', assignedOfficerId: '', priority: 'MEDIUM' });
    } catch (e) { 
      alert(e); 
    } finally { 
      setIsLoading(false); 
    }
  };

  const handlePostUpdate = async () => {
    if (!selectedTaskId || !updateText.trim()) return;
    try {
      await api.addTaskUpdate(selectedTaskId, updateText);
      await loadTasks(selectedProjectId!);
      setUpdateText('');
    } catch (e) { 
      alert(e); 
    }
  };

  const getAiSummary = async () => {
    if (!activeTask || activeTask.updates.length === 0) return;
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Act as a senior divisional secretariat administrator. Analyze task updates for: ${activeTask.title}. Provide Summary, Challenges, and Next Steps in ${lang === 'SI' ? 'Sinhala' : 'English'}. Log: ${JSON.stringify(activeTask.updates.map(u => u.content))}`;
      const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
      alert(response.text || "AI analysis unavailable."); 
    } catch (e) {
      alert("AI Service Error.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const radarData = (metrics: any) => {
    const m = metrics || { finishing: 0, usability: 0, teamwork: 0, proactivity: 0, impact: 0 };
    return [
      { subject: t('finish'), A: m.finishing, fullMark: 5 },
      { subject: t('usability'), A: m.usability, fullMark: 5 },
      { subject: t('teamwork'), A: m.teamwork, fullMark: 5 },
      { subject: t('proactive'), A: m.proactivity, fullMark: 5 },
      { subject: t('impact'), A: m.impact, fullMark: 5 },
    ];
  };

  if (selectedCircle && activeProject && selectedTaskId) {
    return (
      <div className="space-y-6 animate-fade-in flex flex-col h-[calc(100vh-140px)]">
        <div className="flex bg-white p-6 rounded-[2.5rem] border border-slate-100 items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedTaskId(null)} className="p-3 hover:bg-slate-100 rounded-2xl transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Task Stream</p>
              <h2 className="text-xl font-black text-slate-800 tracking-tighter">{activeTask?.title}</h2>
            </div>
          </div>
          <button onClick={getAiSummary} disabled={isAiLoading} className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl">✨ AI Briefing</button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-white rounded-[3rem] border border-slate-50 no-scrollbar" ref={scrollRef}>
          {activeTask?.updates.map(update => (
            <div key={update.id} className={`flex flex-col ${String(update.author_id) === String(user.id) ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[75%] p-5 rounded-[2rem] shadow-sm ${String(update.author_id) === String(user.id) ? 'bg-[#1877F2] text-white rounded-tr-none' : 'bg-slate-50 border text-slate-800 rounded-tl-none'}`}>
                <p className="text-[9px] font-black opacity-50 mb-1 uppercase tracking-widest">@{update.author?.name || update.author_id}</p>
                <p className="text-sm font-bold leading-relaxed">{update.content}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-white rounded-[2.5rem] border border-slate-100 shadow-lg">
          <div className="flex gap-4">
            <textarea value={updateText} onChange={e => setUpdateText(e.target.value)} placeholder={t('broadcastPlaceholder')} className="flex-1 p-5 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none min-h-[60px]" />
            <button onClick={handlePostUpdate} className="px-10 bg-[#1877F2] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest">Send</button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedCircleId) {
    return (
      <div className="space-y-10 animate-fade-in pb-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button onClick={() => setSelectedCircleId(null)} className="p-3 bg-white border border-slate-100 rounded-2xl shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
            <div className="flex items-center gap-4">
              <span className="text-5xl">{selectedCircle?.logo}</span>
              <div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter">{selectedCircle?.name}</h2>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Active Circle</p>
              </div>
            </div>
          </div>
          <button onClick={() => setIsProjectModalOpen(true)} className="px-8 py-4 bg-[#1877F2] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">New Initiative</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
           <div className="lg:col-span-8 space-y-8">
              {projects.length === 0 ? (
                <div className="p-20 text-center bg-white rounded-[3rem] border border-slate-100">
                  <p className="text-slate-300 font-bold italic">No active initiatives found for this circle.</p>
                </div>
              ) : projects.map(project => (
                <div key={project.id} className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm">
                  <h4 className="text-2xl font-black text-slate-900 tracking-tighter">{project.title}</h4>
                  <p className="text-sm text-slate-500 mt-2 font-medium italic">"{project.description}"</p>
                  <div className="mt-8 space-y-3">
                     <div className="flex justify-between items-center px-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tasks</p>
                        <button onClick={() => { setSelectedProjectId(String(project.id)); setIsTaskModalOpen(true); }} className="text-[10px] font-black text-[#1877F2] uppercase tracking-widest">+ New Task</button>
                     </div>
                     {tasks.filter(t => String(t.project_id) === String(project.id)).map(task => (
                        <div key={task.id} onClick={() => { setSelectedProjectId(String(project.id)); setSelectedTaskId(String(task.id)); }} className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 flex justify-between items-center cursor-pointer hover:bg-white transition-all group">
                           <span className="text-sm font-bold text-slate-700 group-hover:text-[#1877F2]">{task.title}</span>
                           <span className="text-[9px] font-black uppercase text-blue-500">{task.status}</span>
                        </div>
                     ))}
                  </div>
                </div>
              ))}
           </div>
           <div className="lg:col-span-4 space-y-8">
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Performance Scorecard</h3>
                 <div className="h-64 w-full">
                    <ChartErrorBoundary>
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData(circleMetrics)}>
                          <PolarGrid stroke="#f1f5f9" />
                          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8' }} />
                          <ReRadar name="Score" dataKey="A" stroke={selectedCircle?.color || '#1877F2'} fill={selectedCircle?.color || '#1877F2'} fillOpacity={0.15} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </ChartErrorBoundary>
                 </div>
                 <div className="mt-6 space-y-3">
                    <div className="flex justify-between items-center px-2">
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Calculated Health</span>
                       <span className="text-sm font-black text-emerald-500">{((Object.values(circleMetrics || {}) as number[]).reduce((a: number, b: number) => a + b, 0) / 5).toFixed(1)} / 5.0</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
        
        {/* Project Modal */}
        {isProjectModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
            <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-fade-in">
               <div className="p-8 border-b bg-slate-50 flex items-center justify-between">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tighter">New Initiative</h3>
                  <button onClick={() => setIsProjectModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
               </div>
               <form onSubmit={handleCreateProject} className="p-10 space-y-6">
                 <input required value={newProject.title} onChange={e => setNewProject({...newProject, title: e.target.value})} placeholder="Project Title" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" />
                 <textarea required value={newProject.description} onChange={e => setNewProject({...newProject, description: e.target.value})} placeholder="Description" className="w-full p-4 bg-slate-50 border rounded-2xl font-medium" rows={3} />
                 <button disabled={isLoading} className="w-full py-5 bg-[#1877F2] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">Launch Initiative</button>
               </form>
            </div>
          </div>
        )}

        {/* Task Modal */}
        {isTaskModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
            <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden animate-fade-in">
               <div className="p-8 border-b bg-slate-50 flex items-center justify-between">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Assign Task</h3>
                  <button onClick={() => setIsTaskModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
               </div>
               <form onSubmit={handleAddTask} className="p-10 space-y-6">
                 <input required value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} placeholder="Task Summary" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" />
                 <select required value={newTask.assignedOfficerId} onChange={e => setNewTask({...newTask, assignedOfficerId: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold">
                   <option value="">Select Assignee</option>
                   {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                 </select>
                 <button disabled={isLoading} className="w-full py-5 bg-[#1877F2] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">Assign Task</button>
               </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-fade-in pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h2 className="text-5xl font-black text-[#003366] tracking-tighter">{t('circles')}</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Collective Strategy & Quality Circles</p>
        </div>
        <button onClick={() => setIsCreateCircleModalOpen(true)} className="px-10 py-5 bg-[#1877F2] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">Form New Circle</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          circles.map(circle => (
            <div key={circle.id} onClick={() => setSelectedCircleId(String(circle.id))} className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 p-10 cursor-pointer group hover:shadow-2xl hover:border-[#1877F2]/20 transition-all hover:-translate-y-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[4rem] -mr-10 -mt-10 group-hover:bg-[#1877F2]/5 transition-colors"></div>
                <div className="relative z-10">
                  <span className="text-6xl mb-8 block transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12">{circle.logo}</span>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tighter group-hover:text-[#1877F2] transition-colors">{circle.name}</h3>
                  <p className="text-sm text-slate-500 mt-4 line-clamp-2 font-medium leading-relaxed italic">"{circle.description}"</p>
                </div>
            </div>
          ))
        )}
      </div>

      {isCreateCircleModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
           <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden animate-fade-in">
             <div className="p-8 border-b bg-slate-50 flex items-center justify-between">
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Form Productivity Circle</h3>
                <button onClick={() => setIsCreateCircleModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
             </div>
             <form onSubmit={handleCreateCircle} className="p-10 space-y-8">
               <div className="flex gap-4 items-center mb-4">
                  <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center text-4xl border border-slate-100">{newCircle.logo}</div>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_LOGOS.map(l => (
                      <button key={l} type="button" onClick={() => setNewCircle({...newCircle, logo: l})} className="text-2xl hover:scale-110 transition-transform">{l}</button>
                    ))}
                  </div>
               </div>
               <input required value={newCircle.name} onChange={e => setNewCircle({...newCircle, name: e.target.value})} placeholder="Circle Name" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" />
               <textarea required value={newCircle.description} onChange={e => setNewCircle({...newCircle, description: e.target.value})} placeholder="Mission Statement" className="w-full p-4 bg-slate-50 border rounded-2xl font-medium" rows={3} />
               <button disabled={isLoading} className="w-full py-5 bg-[#1877F2] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">Establish Circle</button>
             </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default CirclesModule;
