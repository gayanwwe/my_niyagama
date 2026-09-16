import React, { useState, useEffect, useRef } from 'react';
import type { Officer, Circular } from '../types';
import { api } from '../service/api';
import { Skeleton } from '../components/Skeleton';
import { generateContent } from '../service/ai';

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

interface Message {
  role: 'USER' | 'AI';
  content: string;
}

const CircularIntelligence: React.FC<Props> = ({ user, lang }) => {
  const t = (si: string, en: string) => lang === 'SI' ? si : en;

  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [selectedCircular, setSelectedCircular] = useState<Circular | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  
  // Fix: Explicitly type the newCircular state to ensure 'category' matches the Circular interface's union type
  const [newCircular, setNewCircular] = useState<{
    title: string;
    category: Circular['category'];
    document_number: string;
    content: string;
    issued_date: string;
  }>({
    title: '',
    category: 'GENERAL',
    document_number: '',
    content: '',
    issued_date: new Date().toISOString().split('T')[0]
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCirculars();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const loadCirculars = async () => {
    setIsLoading(true);
    try {
      const data = await api.getCirculars();
      setCirculars(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAskAi = async () => {
    if (!input.trim()) return;
    
    const userMsg: Message = { role: 'USER', content: input };
    setChatHistory(prev => [...prev, userMsg]);
    setInput('');
    setIsAiLoading(true);

    try {
      // Using gemini-3-pro-preview for deep administrative reasoning
      const model = 'gemini-3-pro-preview';
      
      const context = selectedCircular 
        ? `Use ONLY the following circular text to answer the question. If the information isn't in the text, say you don't know based on official documents.\n\nCircular Title: ${selectedCircular.title}\nContent: ${selectedCircular.content}`
        : `Answer based on general Sri Lankan Government administrative and financial regulations. Be formal and precise. Document categories: ${circulars.map(c => c.title).join(', ')}`;

      const prompt = `${context}\n\nQuestion: ${userMsg.content}\n\nAnswer in ${lang === 'SI' ? 'Sinhala' : 'English'}:`;

      const text = await generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.1, // Low temperature for high accuracy in official rules
          topK: 1,
          topP: 1
        }
      });

      const aiMsg: Message = { role: 'AI', content: text || 'Error generating response.' };
      setChatHistory(prev => [...prev, aiMsg]);
    } catch (e: any) {
      const errorMsg: Message = { role: 'AI', content: `Intelligence Service Error: ${e.message}` };
      setChatHistory(prev => [...prev, errorMsg]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCreateCircular = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.createCircular(newCircular);
      await loadCirculars();
      setIsModalOpen(false);
      setNewCircular({
        title: '',
        category: 'GENERAL',
        document_number: '',
        content: '',
        issued_date: new Date().toISOString().split('T')[0]
      });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCircular = async (id: string | number) => {
    if (!window.confirm(t('මෙම ලේඛනය ඉවත් කිරීමට ඔබට විශ්වාසද?', 'Are you sure you want to remove this document?'))) return;
    try {
      await api.deleteCircular(id);
      setCirculars(prev => prev.filter(c => c.id !== id));
      if (selectedCircular?.id === id) setSelectedCircular(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSignOff = async () => {
    if (!selectedCircular) return;
    try {
      await api.signOffCircular(selectedCircular.id);
      const updatedCircular = { 
        ...selectedCircular, 
        read_by: [...(selectedCircular.read_by || []), user.id] 
      };
      setSelectedCircular(updatedCircular);
      setCirculars(prev => prev.map(c => c.id === selectedCircular.id ? updatedCircular : c));
      alert(t('ලේඛනය කියවූ බව සටහන් කරන ලදී', 'Document sign-off recorded successfully.'));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const categories = [
    { id: 'ESTABLISHMENT', label: 'Establishment Code', color: 'bg-indigo-500' },
    { id: 'FINANCIAL', label: 'Financial Regulations', color: 'bg-emerald-500' },
    { id: 'GENERAL', label: 'General Circulars', color: 'bg-blue-500' },
    { id: 'PROCUREMENT', label: 'Procurement Guidelines', color: 'bg-amber-500' },
  ];

  if (isLoading && circulars.length === 0) {
    return (
      <div className="space-y-10 p-10">
        <Skeleton className="w-1/3 h-12 rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Skeleton className="h-64 rounded-[3rem]" />
          <Skeleton className="h-64 rounded-[3rem]" />
          <Skeleton className="h-64 rounded-[3rem]" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-5xl font-black text-[#003366] tracking-tighter">Circular Intelligence</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">Institutional Knowledge Base & AI Consulting</p>
        </div>
        {(user.role === 'SA' || user.role === 'EX') && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-10 py-5 bg-[#003366] text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all"
          >
            {t('ලේඛනයක් එක් කරන්න', 'Add Official Document')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[700px]">
        {/* Left Sidebar: Library */}
        <div className="lg:col-span-4 bg-white rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col overflow-hidden">
          <div className="p-8 border-b bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Circular Library</h3>
            <span className="bg-slate-200 px-3 py-1 rounded-full text-[9px] font-black">{circulars.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {circulars.map(circular => (
              <div 
                key={circular.id}
                onClick={() => setSelectedCircular(selectedCircular?.id === circular.id ? null : circular)}
                className={`p-5 rounded-[2rem] border transition-all cursor-pointer group relative overflow-hidden ${selectedCircular?.id === circular.id ? 'bg-[#003366] text-white border-transparent' : 'bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200 shadow-sm'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${selectedCircular?.id === circular.id ? 'bg-white/10' : 'bg-slate-100 text-slate-500'}`}>{circular.category}</span>
                  <span className={`text-[8px] font-black ${selectedCircular?.id === circular.id ? 'text-white/40' : 'text-slate-300'}`}>{circular.document_number}</span>
                </div>
                <h4 className="font-black text-sm tracking-tight leading-snug">{circular.title}</h4>
                <p className={`text-[9px] mt-2 font-bold uppercase ${selectedCircular?.id === circular.id ? 'text-white/40' : 'text-slate-400'}`}>{circular.issued_date}</p>
                
                {(user.role === 'SA' || user.role === 'EX') && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteCircular(circular.id); }}
                    className="absolute bottom-4 right-4 p-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-500 transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Main Area: AI Suite */}
        <div className="lg:col-span-8 bg-white rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col overflow-hidden">
          <div className="p-8 border-b bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-[#003366] rounded-xl flex items-center justify-center text-white text-xl">✨</div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Intelligence Advisor</h3>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Powered by Gemini 3 Pro</p>
              </div>
            </div>
            {selectedCircular && (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-full border border-emerald-100 animate-fade-in">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="text-[9px] font-black uppercase tracking-widest">Context: {selectedCircular.document_number}</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-10 space-y-8 no-scrollbar bg-slate-50/30">
            {selectedCircular && (
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6 animate-fade-in">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-2xl font-black text-slate-900 tracking-tighter">{selectedCircular.title}</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{selectedCircular.document_number} · {selectedCircular.issued_date}</p>
                  </div>
                  {selectedCircular.read_by?.includes(user.id) ? (
                    <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-full border border-emerald-100">
                      <span className="text-[9px] font-black uppercase tracking-widest">Signed Off ✅</span>
                    </div>
                  ) : (
                    <button 
                      onClick={handleSignOff}
                      className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-black uppercase text-[9px] tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all"
                    >
                      Sign Off
                    </button>
                  )}
                </div>
                <div className="p-6 bg-slate-50 rounded-2xl text-sm font-medium leading-relaxed text-slate-700 whitespace-pre-wrap border border-slate-100">
                  {selectedCircular.content}
                </div>
                {selectedCircular.read_by && selectedCircular.read_by.length > 0 && (
                  <div className="pt-6 border-t border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Acknowledged By ({selectedCircular.read_by.length})</p>
                    <div className="flex flex-wrap gap-2">
                       {selectedCircular.read_by.map(uid => (
                         <div key={uid} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-200" title={`User ID: ${uid}`}>
                           {String(uid).substring(0, 2).toUpperCase()}
                         </div>
                       ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {chatHistory.length === 0 && !selectedCircular && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40 grayscale">
                 <div className="text-6xl">🏛️</div>
                 <div className="max-w-xs space-y-2">
                    <p className="font-black uppercase text-[10px] tracking-widest">Awaiting Inquiry</p>
                    <p className="text-xs font-medium italic">Ask questions regarding institutional leave policies, procurement rules, or establishment procedures.</p>
                 </div>
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div className={`max-w-[80%] p-6 rounded-[2.5rem] shadow-sm ${msg.role === 'USER' ? 'bg-[#1877F2] text-white rounded-tr-none' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'}`}>
                  <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isAiLoading && (
              <div className="flex justify-start animate-pulse">
                <div className="bg-slate-100 p-6 rounded-[2rem] rounded-tl-none flex items-center gap-3">
                   <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                   </div>
                   <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Analyzing Regulations...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-8 border-t bg-white">
            <div className="flex gap-4">
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleAskAi()}
                placeholder={t('නීති රීති පිළිබඳව විමසන්න...', 'Ask a question about administrative rules...')}
                className="flex-1 p-5 bg-slate-50 border-2 border-transparent focus:border-blue-100 rounded-2xl font-bold outline-none transition-all shadow-inner"
              />
              <button 
                onClick={handleAskAi}
                disabled={isAiLoading || !input.trim()}
                className="px-10 bg-[#003366] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-900/10 hover:scale-105 active:scale-95 transition-all"
              >
                Consult
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Circular Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col my-auto border border-white/20">
            <header className="px-10 py-8 bg-slate-50 border-b flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Add Knowledge Asset</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Register Official Administrative Document</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </header>

            <form onSubmit={handleCreateCircular} className="p-10 space-y-6 overflow-y-auto max-h-[70vh] no-scrollbar">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Document Title</label>
                    <input required value={newCircular.title} onChange={e => setNewCircular({...newCircular, title: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Circular Number</label>
                    <input required value={newCircular.document_number} onChange={e => setNewCircular({...newCircular, document_number: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100" />
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</label>
                    <select value={newCircular.category} onChange={e => setNewCircular({...newCircular, category: e.target.value as any})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100">
                      {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Issued Date</label>
                    <input type="date" value={newCircular.issued_date} onChange={e => setNewCircular({...newCircular, issued_date: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100" />
                  </div>
               </div>

               <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Document Text Content</label>
                  <textarea required value={newCircular.content} onChange={e => setNewCircular({...newCircular, content: e.target.value})} rows={10} className="w-full p-6 bg-slate-50 rounded-[2rem] font-medium text-sm leading-relaxed border-none outline-none focus:ring-2 focus:ring-blue-100 shadow-inner" placeholder="Paste the text content of the circular here for AI analysis..." />
               </div>

               <button 
                 disabled={isLoading}
                 className="w-full py-5 bg-[#003366] text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl mt-4"
               >
                 Register Document
               </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CircularIntelligence;