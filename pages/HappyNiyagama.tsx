
import React, { useState, useEffect, useRef } from 'react';
import type { Officer } from '../types';
import { api } from '../service/api';
import { translations, TranslationKey } from '../service/i18n';
import { Skeleton } from '../components/Skeleton';
import { generateContent } from '../service/ai';

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

interface Comment {
  id: string | number;
  author: string;
  author_id?: number | string;
  content: string;
  time: string;
}

interface Post {
  id: number | string;
  author: string;
  author_id: number | string;
  post: string;
  content: string;
  image?: string; // Legacy
  images?: string[];
  likes: number;
  isLiked: boolean;
  comments_count: number;
  comments?: Comment[];
  time: string;
  isLocal?: boolean;
}

const STORAGE_KEY = 'niyagama_community_cache';

const HappyNiyagama: React.FC<Props> = ({ user, lang }) => {
  const t = (key: TranslationKey) => translations[lang][key];
  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [isAiPolishing, setIsAiPolishing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeCommentPostId, setActiveCommentPostId] = useState<number | string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  
  const isAdmin = ['IT', 'SA', 'ADMIN', 'EXECUTIVE', 'EX'].includes(user.role);
  const maxPhotos = isAdmin ? 12 : 3;

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    setIsLoading(true);
    try {
      const response: any = await api.getCommunityPosts();
      if (response && response.status === 'error') throw new Error(response.message);
      
      // The API returns the raw data array directly if successful, or {status, data} 
      // depending on how it was implemented in turn 0.
      setPosts(Array.isArray(response) ? response : (response.data || []));
      setServerError(null);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(response) ? response : (response.data || [])));
    } catch (e: any) {
      setServerError(e.message);
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) setPosts(JSON.parse(cached));
    } finally {
      setIsLoading(false);
    }
  };

  const syncLocal = (updatedPosts: Post[]) => {
    setPosts(updatedPosts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPosts));
  };

  const handlePolishWithAi = async () => {
    if (!postText.trim() || isAiPolishing) return;
    setIsAiPolishing(true);
    try {
      const model = 'gemini-3-flash-preview';
      const prompt = `Act as an inspirational workplace communications expert. Rewrite this raw note into a professional, uplifting, and community-focused broadcast for a government divisional secretariat system. Keep it concise (max 3 sentences). 
      Original text: ${postText}
      Output in ${lang === 'SI' ? 'Sinhala' : 'English'}:`;

      const text = await generateContent({ model, contents: prompt });
      if (text) setPostText(text.trim());
    } catch (e) {
      console.error("AI Polish failed", e);
    } finally {
      setIsAiPolishing(false);
    }
  };

  const handleLike = async (id: number | string) => {
    // Optimistic Update
    const originalPosts = [...posts];
    const updated = posts.map(p => {
      if (p.id === id) {
        const nextIsLiked = !p.isLiked;
        return { 
          ...p, 
          isLiked: nextIsLiked, 
          likes: nextIsLiked ? p.likes + 1 : Math.max(0, p.likes - 1) 
        };
      }
      return p;
    });
    setPosts(updated);

    try {
      await api.togglePostLike(id);
    } catch (err) {
      setPosts(originalPosts); // Rollback
    }
  };

  const handlePost = async () => {
    if (!postText.trim() || isPosting) return;
    
    if (!isAdmin && attachedImages.length > 3) {
      alert(`Standard officers are only allowed up to 3 photos per post.`);
      return;
    }

    setIsPosting(true);
    try {
      const response: any = await api.saveCommunityPost(postText, attachedImages);
      if (response && response.status === 'error') throw new Error(response.message);
      
      await loadPosts();
      setPostText('');
      setAttachedImages([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setServerError(null);
    } catch (err: any) {
      setServerError(err.message);
      alert(err.message);
    } finally {
      setIsPosting(false);
    }
  };

  const handleDeletePost = async (id: number | string) => {
    if (!window.confirm("Are you sure you want to remove this post?")) return;
    try {
      await api.deleteCommunityPost(id);
      setPosts(posts.filter(p => p.id !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteComment = async (commentId: number | string, postId: number | string) => {
    if (!window.confirm("Are you sure you want to remove this comment?")) return;
    try {
      await api.deletePostComment(commentId);
      setPosts(posts.map(p => {
        if (p.id === postId) {
          return {
            ...p,
            comments_count: Math.max(0, p.comments_count - 1),
            comments: p.comments?.filter(c => c.id !== commentId)
          };
        }
        return p;
      }));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const submitComment = async (postId: number | string) => {
    if (!commentInput.trim()) return;
    const originalPosts = [...posts];
    
    // Optimistic Update
    const updated = posts.map(p => {
        if (p.id === postId) {
            return {
                ...p,
                comments_count: p.comments_count + 1,
                comments: [...(p.comments || []), { id: Date.now(), author: user.name, author_id: user.id, content: commentInput, time: 'Just now' }]
            };
        }
        return p;
    });
    setPosts(updated);
    const textToSubmit = commentInput;
    setCommentInput('');

    try {
      const response: any = await api.addPostComment(postId, textToSubmit);
      if (response && response.status === 'error') throw new Error(response.message);
      loadPosts(); 
    } catch (err: any) {
      setPosts(originalPosts);
      setCommentInput(textToSubmit);
      alert(err.message);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 pb-20 animate-fade-in px-4">
      
      {/* Left Sidebar: Community Pulse (Desktop) */}
      <aside className="hidden lg:block lg:col-span-3 space-y-8">
        <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
           <h3 className="text-xl font-black text-slate-900 tracking-tighter mb-8 flex items-center gap-3">
             <span className="w-2.5 h-7 bg-[#1877F2] rounded-full"></span>
             {t('communityPulse')}
           </h3>
           <div className="space-y-6">
              <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('trendingNow')}</p>
                 <p className="text-sm font-bold text-slate-700">#DigitalExcellence</p>
                 <div className="mt-2 flex -space-x-2">
                    {[1,2,3].map(i => <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-slate-300" />)}
                    <span className="text-[9px] font-black text-slate-400 ml-4 flex items-center">+12 joined</span>
                 </div>
              </div>
              <div className="space-y-4">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('topContributors')}</p>
                 {posts.slice(0, 3).map((p, i) => (
                   <div key={i} className="flex items-center gap-3 group cursor-pointer">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 group-hover:scale-110 transition-transform">
                         <img src={`https://ui-avatars.com/api/?name=${p.author}&background=random&color=fff`} className="w-full h-full object-cover" alt="c" />
                      </div>
                      <div className="min-w-0">
                         <p className="text-xs font-black text-slate-800 truncate">{p.author}</p>
                         <p className="text-[8px] font-bold text-slate-400 uppercase">{p.post}</p>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </aside>

      {/* Main Feed Area */}
      <main className="lg:col-span-6 space-y-10">
        <div className="text-center space-y-3">
           <h2 className="text-5xl font-black text-slate-900 tracking-tighter">Happy Niyagama</h2>
           <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.5em]">Workplace Achievements & Collective Pride</p>
        </div>

        {/* Cinematic Post Creator */}
        <div className="bg-white p-5 md:p-8 rounded-[2.5rem] md:rounded-[3.5rem] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.05)] border border-slate-100 ring-1 ring-slate-200/50 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#1877F2]/5 rounded-bl-[4rem] -mr-10 -mt-10 group-hover:bg-[#1877F2]/10 transition-colors"></div>
          <div className="flex flex-col sm:flex-row gap-4 md:gap-6 relative z-10">
            <img src={user.profile_pic || `https://ui-avatars.com/api/?name=${user.name}&background=1877F2&color=fff`} className="w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-[1.8rem] border-4 border-slate-50 object-cover shadow-sm flex-shrink-0" alt="me" />
            <div className="flex-1 space-y-4 md:space-y-5">
               <div className="relative">
                 <textarea 
                   value={postText}
                   onChange={e => setPostText(e.target.value)}
                   placeholder={t('broadcastPlaceholder')} 
                   className="w-full p-5 md:p-8 bg-slate-50 border-none rounded-[1.5rem] md:rounded-[2.5rem] focus:ring-4 focus:ring-[#1877F2]/5 outline-none transition-all min-h-[120px] md:min-h-[160px] font-medium text-slate-700 placeholder:text-slate-300 shadow-inner resize-none text-sm md:text-base"
                 />
                 <button 
                  onClick={handlePolishWithAi}
                  disabled={!postText.trim() || isAiPolishing}
                  className={`absolute bottom-4 right-4 md:bottom-6 md:right-6 p-3 md:p-4 rounded-xl md:rounded-2xl shadow-xl transition-all flex items-center gap-2 border ${isAiPolishing ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 hover:bg-slate-900 hover:text-white border-slate-100'}`}
                  title={t('polishPost')}
                 >
                   <span className="text-base md:text-lg">✨</span>
                   {isAiPolishing && <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest">{t('polishing')}</span>}
                 </button>
               </div>

               {attachedImages.length > 0 && (
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
                    {attachedImages.map((img, idx) => (
                      <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 shadow-sm group/thumb">
                        <img src={img} className="w-full h-full object-cover" alt="Preview" />
                        <button 
                          onClick={() => setAttachedImages(attachedImages.filter((_, i) => i !== idx))} 
                          className="absolute top-1 right-1 bg-black/60 text-white w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors text-xs"
                        >✕</button>
                      </div>
                    ))}
                    {attachedImages.length < maxPhotos && (
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-all bg-slate-50"
                      >
                        <span className="text-xl">+</span>
                        <span className="text-[8px] font-black">{attachedImages.length}/{maxPhotos}</span>
                      </button>
                    )}
                 </div>
               )}

               <div className="flex justify-between items-center px-1 md:px-2">
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple={isAdmin} onChange={async (e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                        setIsPosting(true);
                        const newImages = [...attachedImages];
                        
                        for (let i = 0; i < files.length; i++) {
                          if (newImages.length >= maxPhotos) break;
                          const file = files[i];
                          const reader = new FileReader();
                          const promise = new Promise<string>((resolve) => {
                            reader.onloadend = () => resolve(reader.result as string);
                          });
                          reader.readAsDataURL(file);
                          const base64 = await promise;
                          try {
                            const { url } = await api.uploadImage(base64, file.name);
                            newImages.push(url);
                          } catch (err) {
                            console.error("Upload failed", err);
                          }
                        }
                        setAttachedImages(newImages);
                        setIsPosting(false);
                    }
                  }} />
                  <div className="flex items-center gap-2">
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2 md:py-3 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 rounded-xl md:rounded-2xl transition-all">
                      <span className="text-lg md:text-xl">🖼️</span> {lang === 'SI' ? 'පින්තූරය' : 'Media'}
                    </button>
                    {!isAdmin && (
                       <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${posts.some(p => p.author_id === user.id && p.time.includes('Today')) ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}`}>
                         1 Daily Post Limit
                       </span>
                    )}
                  </div>
                  <button 
                    onClick={handlePost}
                    disabled={!postText.trim() || isPosting}
                    className="bg-slate-900 text-white px-6 md:px-12 py-3 md:py-5 rounded-xl md:rounded-[1.8rem] font-black uppercase text-[9px] md:text-[10px] tracking-[0.1em] md:tracking-[0.2em] shadow-2xl hover:bg-[#1877F2] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30"
                  >
                    {isPosting ? t('polishing') : t('broadcast')}
                  </button>
               </div>
            </div>
          </div>
        </div>

        {/* Feed */}
        <div className="space-y-10">
          {isLoading ? (
             Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white p-10 rounded-[3.5rem] border border-slate-100 space-y-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-14 h-14 rounded-[1.2rem]" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="w-1/3 h-5" />
                    <Skeleton className="w-1/4 h-3" />
                  </div>
                </div>
                <Skeleton className="w-full h-32 rounded-[2rem]" />
              </div>
            ))
          ) : posts.map(post => (
            <article key={post.id} className="bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-all duration-300">
              {/* Header */}
              <div className="p-4 md:p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full ring-2 ring-blue-50 p-0.5 shadow-sm">
                    <img src={`https://ui-avatars.com/api/?name=${post.author}&background=random&color=fff`} className="w-full h-full rounded-full object-cover" alt="avatar" />
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-900 text-sm md:text-base leading-tight">{post.author}</h5>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{post.post}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{post.time}</span>
                  {(isAdmin || post.author_id === user.id) && (
                    <button 
                      onClick={() => handleDeletePost(post.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-1"
                      title="Remove post"
                    >
                      <span className="text-lg">⋮</span>
                    </button>
                  )}
                </div>
              </div>
              
              {/* Image Grid */}
              {post.images && post.images.length > 0 && (
                <div className={`grid gap-0.5 bg-slate-100 border-y border-slate-50 ${
                  post.images.length === 1 ? 'grid-cols-1' : 
                  post.images.length === 2 ? 'grid-cols-2' : 
                  'grid-cols-4 grid-rows-2'
                } aspect-video md:aspect-[4/3] overflow-hidden`}>
                  {post.images.length === 1 ? (
                    <img src={post.images[0]} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" alt="content" />
                  ) : post.images.length === 2 ? (
                    post.images.map((img, i) => <img key={i} src={img} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" alt="content" />)
                  ) : (
                    <>
                      <div className="col-span-2 row-span-2">
                        <img src={post.images[0]} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" alt="content" />
                      </div>
                      <div className="col-span-2 row-span-1">
                        <img src={post.images[1]} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" alt="content" />
                      </div>
                      <div className="col-span-1 row-span-1">
                        <img src={post.images[2]} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" alt="content" />
                      </div>
                      <div className="col-span-1 row-span-1 relative">
                        <img src={post.images[3] || post.images[0]} className="w-full h-full object-cover blur-[2px]" alt="content" />
                        {post.images.length > 4 && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white font-black text-xl">
                            +{post.images.length - 3}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              
              {/* Action Buttons */}
              <div className="px-4 md:px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <button 
                    onClick={() => handleLike(post.id)}
                    className={`transition-all hover:scale-125 ${post.isLiked ? 'text-red-500 animate-pulse' : 'text-slate-700 hover:text-red-500'}`}
                  >
                     <span className="text-2xl">{post.isLiked ? '❤️' : '♡'}</span> 
                  </button>
                  <button 
                    onClick={() => setActiveCommentPostId(activeCommentPostId === post.id ? null : post.id)}
                    className="text-slate-700 hover:text-blue-500 transition-all hover:scale-125"
                  >
                     <span className="text-2xl">💬</span> 
                  </button>
                  <button className="text-slate-700 hover:text-blue-500 transition-all hover:scale-125">
                     <span className="text-2xl">✈️</span> 
                  </button>
                </div>
                <button className="text-slate-700 hover:text-blue-500 transition-all hover:scale-125">
                   <span className="text-2xl">🔖</span> 
                </button>
              </div>

              {/* Engagement Info */}
              <div className="px-5 md:px-7 pb-2 space-y-1">
                <p className="text-xs font-black text-slate-900 tabular-nums">{post.likes.toLocaleString()} likes</p>
                <div className="flex gap-2 text-sm leading-tight">
                  <span className="font-black text-slate-900 flex-shrink-0">{post.author}</span>
                  <span className="text-slate-600 font-medium whitespace-pre-wrap">{post.content}</span>
                </div>
                {post.comments_count > 0 && !activeCommentPostId && (
                  <button 
                    onClick={() => setActiveCommentPostId(post.id)}
                    className="text-xs font-bold text-slate-400 hover:text-slate-600 mt-1"
                  >
                    View all {post.comments_count} comments
                  </button>
                )}
              </div>
              
              {activeCommentPostId === post.id && (
                <div className="p-4 md:p-6 bg-slate-50/50 border-t border-slate-100 animate-fade-in space-y-4">
                   <div className="space-y-3">
                      {post.comments?.map(comment => (
                         <div key={comment.id} className="flex gap-3 group/comment">
                            <img src={`https://ui-avatars.com/api/?name=${comment.author}&background=random&color=fff`} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="v" />
                            <div className="flex-1 min-w-0">
                               <p className="text-xs">
                                 <span className="font-black text-slate-900 mr-2">{comment.author}</span>
                                 <span className="text-slate-700 font-medium">{comment.content}</span>
                               </p>
                               <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase">{comment.time}</span>
                                  {(isAdmin || comment.author_id === user.id) && (
                                    <button 
                                      onClick={() => handleDeleteComment(comment.id, post.id)}
                                      className="text-[8px] font-black text-slate-300 hover:text-red-500 opacity-0 group-hover/comment:opacity-100 transition-all uppercase"
                                    >Delete</button>
                                  )}
                               </div>
                            </div>
                         </div>
                      ))}
                   </div>

                   <div className="flex gap-3 items-center pt-2 border-t border-slate-100">
                      <img src={user.profile_pic || `https://ui-avatars.com/api/?name=${user.name}&background=1877F2&color=fff`} className="w-8 h-8 rounded-full object-cover shadow-sm" alt="me" />
                      <div className="flex-1 flex gap-2">
                         <input 
                           type="text" 
                           value={commentInput}
                           onChange={e => setCommentInput(e.target.value)}
                           onKeyPress={e => e.key === 'Enter' && submitComment(post.id)}
                           placeholder="Add a comment..." 
                           className="flex-1 bg-transparent border-none text-xs md:text-sm font-bold outline-none focus:ring-0 focus:border-none py-1 placeholder:text-slate-300"
                         />
                         <button onClick={() => submitComment(post.id)} disabled={!commentInput.trim()} className="text-blue-500 font-black text-[10px] uppercase tracking-widest hover:text-blue-700 transition-colors disabled:opacity-30">Post</button>
                      </div>
                   </div>
                </div>
              )}
              <div className="h-4"></div>
            </article>
          ))}
        </div>
      </main>

      {/* Right Sidebar: Quick Stats */}
      <aside className="hidden xl:block lg:col-span-3 space-y-8">
        <div className="bg-slate-900 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform text-7xl">🏆</div>
           <div className="relative z-10 space-y-8">
              <div>
                <h3 className="text-2xl font-black tracking-tighter">Impact Score</h3>
                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mt-1">Institutional Connectivity</p>
              </div>
              <div className="flex items-end gap-3">
                 <span className="text-6xl font-black text-blue-500 tracking-tighter">8.4</span>
                 <span className="text-[10px] font-black text-slate-500 uppercase mb-2">/ 10</span>
              </div>
              <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                 <p className="text-[11px] font-medium text-slate-400 leading-relaxed italic">
                   "Our community engagement has risen by 12% this week through collaborative broadcasting."
                 </p>
              </div>
           </div>
        </div>
        
        <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
           <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Upcoming Milestones</h4>
           <div className="space-y-5">
              {[
                { label: 'DS Birthday', date: 'TOMORROW', icon: '🎂' },
                { label: 'Annual Sports', date: 'IN 12 DAYS', icon: '🏃' }
              ].map((m, i) => (
                <div key={i} className="flex items-center gap-4 group cursor-pointer">
                   <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-xl group-hover:bg-blue-50 transition-colors">{m.icon}</div>
                   <div>
                      <p className="text-xs font-black text-slate-800">{m.label}</p>
                      <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest">{m.date}</p>
                   </div>
                </div>
              ))}
           </div>
        </div>
      </aside>

      {/* Global Bottom Banner */}
      <div className="col-span-full py-20 text-center border-t border-slate-200 border-dashed">
         <p className="text-slate-300 font-black uppercase text-[10px] tracking-[1em]">Cultivating Divisional Pride since 2024</p>
      </div>
    </div>
  );
};

export default HappyNiyagama;
