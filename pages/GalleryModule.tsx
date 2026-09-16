import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gallery, Item } from 'react-photoswipe-gallery';
import 'photoswipe/dist/photoswipe.css';
import { UserRole } from '../types';
import type { Officer, GalleryAlbum, GalleryPhoto } from '../types';
import { AlbumSkeleton } from '../components/Skeleton';
import { translations, TranslationKey } from '../service/i18n';
import { api } from '../service/api';
import { Icons } from '../constants';

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

const GalleryModule: React.FC<Props> = ({ user, lang }) => {
  const t = (key: TranslationKey, fallback?: string) => translations[lang][key] || fallback || key;
  
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<GalleryAlbum | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string | number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [photoFilter, setPhotoFilter] = useState('');
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [photoDims, setPhotoDims] = useState<Record<string | number, {w: number, h: number}>>({});
  
  const [departments, setDepartments] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newAlbum, setNewAlbum] = useState({
    name: '',
    description: '',
    is_restricted: false,
    allowed_roles: [] as string[],
    allowed_departments: [] as string[]
  });

  const [editAlbumData, setEditAlbumData] = useState<any>(null);

  useEffect(() => {
    loadAlbums();
    api.getDepartments().then(setDepartments).catch(console.error);
  }, []);

  const loadAlbums = async () => {
    setIsLoading(true);
    try {
      const data = await api.getAlbums();
      setAlbums(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAlbumDetails = async (id: string | number) => {
    setIsLoading(true);
    try {
      const data = await api.getAlbum(id);
      setSelectedAlbum(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createAlbum(newAlbum);
      setIsModalOpen(false);
      setNewAlbum({ name: '', description: '', is_restricted: false, allowed_roles: [], allowed_departments: [] });
      loadAlbums();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleUpdateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAlbumData) return;
    try {
      await api.updateAlbum(editAlbumData.id, editAlbumData);
      setIsEditModalOpen(false);
      if (selectedAlbum?.id === editAlbumData.id) {
        loadAlbumDetails(editAlbumData.id);
      } else {
        loadAlbums();
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteAlbum = async (id: string | number) => {
    if (!window.confirm('Are you sure you want to delete this entire album? This action cannot be undone.')) return;
    try {
      await api.deleteAlbum(id);
      setSelectedAlbum(null);
      loadAlbums();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selectedAlbum || isUploading) return;

    const isAdminPrivilege = ['SA', 'ADMIN', 'IT'].includes(user.role);
    const limit = isAdminPrivilege ? 30 : 12;

    if (files.length > limit) {
      alert(`Access Restricted: You can only upload up to ${limit} images at once.`);
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(prev => ({ ...prev, current: i + 1 }));
        
        try {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const base64 = await base64Promise;
            const { url } = await api.uploadImage(base64, file.name);
            await api.uploadAlbumPhoto(selectedAlbum.id, url);
        } catch (err: any) {
            console.error(`Failed to upload ${file.name}`, err);
        }
    }

    setIsUploading(false);
    loadAlbumDetails(selectedAlbum.id);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeletePhoto = async (photoId: string | number) => {
    if (!selectedAlbum) return;
    if (!window.confirm('Remove this memory from the archive?')) return;
    try {
      await api.deleteAlbumPhoto(selectedAlbum.id, photoId);
      loadAlbumDetails(selectedAlbum.id);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSetThumbnail = async (url: string) => {
    if (!selectedAlbum) return;
    try {
      await api.setAlbumThumbnail(selectedAlbum.id, url);
      loadAlbumDetails(selectedAlbum.id);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const toggleRole = (role: string, target: 'new' | 'edit') => {
    const setter = target === 'new' ? setNewAlbum : setEditAlbumData;
    setter((prev: any) => ({
      ...prev,
      allowed_roles: prev.allowed_roles.includes(role) 
        ? prev.allowed_roles.filter((r: any) => r !== role)
        : [...prev.allowed_roles, role]
    }));
  };

  const toggleDept = (dept: string, target: 'new' | 'edit') => {
    const setter = target === 'new' ? setNewAlbum : setEditAlbumData;
    setter((prev: any) => ({
      ...prev,
      allowed_departments: prev.allowed_departments.includes(dept)
        ? prev.allowed_departments.filter((d: any) => d !== dept)
        : [...prev.allowed_departments, dept]
    }));
  };

  const togglePhotoSelection = (photoId: string | number) => {
    setSelectedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const handleBatchDownload = async () => {
    if (selectedPhotos.size === 0 || !selectedAlbum) return;
    
    selectedAlbum.photos?.forEach(photo => {
      if (selectedPhotos.has(photo.id)) {
        const link = document.createElement('a');
        link.href = photo.url;
        link.download = `photo-${photo.id}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });

    setIsSelectionMode(false);
    setSelectedPhotos(new Set());
  };

  const handleImageLoad = (photoId: string | number, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setPhotoDims(prev => ({
        ...prev,
        [photoId]: { w: img.naturalWidth, h: img.naturalHeight }
      }));
    }
  };

  const isPrivileged = ['SA', 'ADMIN', 'IT'].includes(user.role);
  const canManageAlbum = (albumId?: string | number, creatorId?: string | number) => {
    if (isPrivileged) return true;
    if (creatorId && creatorId.toString() === user.id.toString()) return true;
    return false;
  };

  const canManagePhoto = (photo: GalleryPhoto) => {
    if (isPrivileged) return true;
    if (selectedAlbum?.officer_id?.toString() === user.id.toString()) return true;
    if (photo.officer_id?.toString() === user.id.toString()) return true;
    return false;
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-4">
      <AnimatePresence mode="wait">
        {!selectedAlbum ? (
          <motion.div 
            key="album-list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-8"
          >
            {/* Minimal Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-100 pb-4 text-center md:text-left">
              <div>
                <h1 className="text-4xl md:text-5xl font-extralight tracking-tight text-slate-900">
                  {t('media', 'Photo Album')}
                </h1>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-widest mt-2">
                  Institutional Archive & Asset Repository
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="px-6 py-2.5 bg-[#1976D2] text-white font-bold rounded shadow-lg transition-all text-[10px] uppercase tracking-widest"
                >
                  Create New Album
                </button>
              </div>
            </div>

            {/* Album Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
              {isLoading ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] bg-slate-100 animate-pulse rounded-lg" />
              )) : albums.length === 0 ? (
                <div className="col-span-full py-32 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                   <p className="text-slate-400 font-medium italic">No archival collections initialized yet.</p>
                </div>
              ) : (
                albums.map((album, idx) => (
                  <motion.div 
                    key={album.id} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    onClick={() => loadAlbumDetails(album.id)}
                    className="bg-white rounded shadow-sm border border-slate-100 overflow-hidden flex flex-col group h-full cursor-pointer relative"
                  >
                    {canManageAlbum(album.id, album.officer_id) && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditAlbumData(album); setIsEditModalOpen(true); }}
                        className="absolute top-3 right-3 z-10 w-8 h-8 bg-white/80 backdrop-blur-md border border-slate-200 rounded-full flex items-center justify-center text-slate-600 hover:bg-white hover:text-blue-500 shadow-lg transition-all"
                      >
                        <Icons.Settings width={14} />
                      </button>
                    )}
                    <div className="aspect-[16/7] overflow-hidden">
                      <img 
                        src={album.cover_url || 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&q=80'} 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                        alt={album.name} 
                      />
                    </div>
                    <div className="p-6 space-y-3 flex-1">
                      <div>
                        <h3 className="text-lg font-normal text-slate-800">{album.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                           <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                             By {album.creator?.name || 'Authorized'}
                           </span>
                           <span className="w-1 h-1 bg-slate-300 rounded-full" />
                           <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                             {album.photos_count || album.photos?.length || 0} Assets
                           </span>
                        </div>
                      </div>
                      <p className="text-slate-500 text-xs leading-relaxed line-clamp-2 font-light">
                        {album.description || "Archived media collection from the repository."}
                      </p>
                    </div>
                    <div className="px-6 py-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">
                        {album.created_at ? new Date(album.created_at).toLocaleDateString(lang === 'SI' ? 'si-LK' : 'en-US', { year: 'numeric', month: 'short' }) : 'Archive Node'}
                      </span>
                      <Icons.ArrowRight className="text-slate-300 group-hover:text-blue-500 transition-colors" width={14} />
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="album-detail"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-6"
          >
            {/* Simplified Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-6">
                 <button 
                  onClick={() => { setSelectedAlbum(null); setIsSelectionMode(false); setSelectedPhotos(new Set()); }}
                  className="w-10 h-10 border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors"
                 >
                   <Icons.ArrowRight className="rotate-180" width={16} />
                 </button>
                 <div>
                    <h2 className="text-3xl font-light tracking-tight text-slate-900 uppercase">
                      {selectedAlbum.name}
                    </h2>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">
                      {selectedAlbum.photos?.length || 0} Assets Archived
                    </p>
                 </div>
              </div>

              <div className="flex items-center gap-3">
                 {isPrivileged && (
                   <button 
                    onClick={() => setIsSelectionMode(!isSelectionMode)}
                    className={`px-5 py-2.5 rounded text-[10px] font-bold uppercase tracking-widest transition-all border ${isSelectionMode ? 'bg-blue-600 text-white border-blue-600' : 'text-slate-400 border-slate-200 hover:text-slate-900'}`}
                   >
                     Selection Mode
                   </button>
                 )}

                 {selectedPhotos.size > 0 && (
                   <button 
                     onClick={handleBatchDownload}
                     className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl"
                   >
                     <Icons.Download width={12} />
                     Download ({selectedPhotos.size})
                   </button>
                 )}

                 <div className="flex items-center gap-2">
                   <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
                   <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="p-3 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 transition-colors border border-slate-200"
                    >
                      <Icons.Upload width={18} />
                    </button>
                 </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              <Gallery
                onBeforeOpen={(ps: any) => {
                  ps.on('uiRegister', () => {
                    const ui = ps.ui;
                    if (!ui) return;

                    // Helper to add if method exists
                    const addButton = (config: any) => {
                      if (typeof ui.add === 'function') {
                        ui.add(config);
                      } else if (typeof ps.addControl === 'function') {
                        ps.addControl(config);
                      }
                    };

                    // Fullscreen
                    addButton({
                      name: 'fullscreen',
                      order: 8,
                      isPrimary: true,
                      html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
                      onClick: () => {
                        if (document.fullscreenElement) {
                          document.exitFullscreen();
                        } else {
                          document.documentElement.requestFullscreen();
                        }
                      }
                    });

                    // Download
                    addButton({
                      name: 'download',
                      order: 9,
                      isPrimary: true,
                      html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
                      onClick: (event: any, el: any, pswp: any) => {
                        const curr = pswp.currSlide.data;
                        if (curr && curr.src) {
                          const link = document.createElement('a');
                          link.href = curr.src;
                          link.download = `archive-${Date.now()}.jpg`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }
                      }
                    });
                  });
                }}
                options={{
                  showHideAnimationType: 'zoom',
                  bgOpacity: 0.98,
                  padding: { top: 20, bottom: 20, left: 20, right: 20 },
                  closeOnVerticalDrag: true,
                  arrowPrev: true,
                  arrowNext: true,
                  zoom: true,
                  counter: true,
                  preload: [1, 3],
                }}
              >
                  {(selectedAlbum.photos || [])
                    .filter(p => !photoFilter || p.uploader?.name.toLowerCase().includes(photoFilter.toLowerCase()))
                    .map((photo: GalleryPhoto, idx) => (
                    <Item
                      key={photo.id}
                      original={photo.url}
                      thumbnail={photo.url}
                      width={photoDims[photo.id]?.w || 1600}
                      height={photoDims[photo.id]?.h || 1200}
                    >
                      {({ ref, open }) => (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.05 }}
                          className={`group relative aspect-square rounded overflow-hidden cursor-pointer transition-all ${
                            selectedPhotos.has(photo.id) ? 'ring-4 ring-offset-4 ring-slate-900' : 'hover:shadow-xl'
                          }`}
                        >
                          <img 
                            ref={ref as any}
                            onLoad={(e) => handleImageLoad(photo.id, e)}
                            onClick={(e) => {
                                if (isSelectionMode) togglePhotoSelection(photo.id);
                                else open(e);
                            }}
                            src={photo.url} 
                            className="w-full h-full object-cover grayscale-[0.2] hover:grayscale-0 transition-all duration-[2000ms] group-hover:scale-110" 
                            alt="archive" 
                          />
                          
                          {isSelectionMode && (
                            <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-colors ${selectedPhotos.has(photo.id) ? 'bg-slate-900/40' : 'bg-transparent'}`}>
                               <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${
                                 selectedPhotos.has(photo.id) ? 'bg-white text-slate-900 border-white' : 'text-transparent border-white bg-black/10'
                               }`}>
                                 <Icons.Check width={24} className="stroke-[3]" />
                               </div>
                            </div>
                          )}

                          {!isSelectionMode && (
                            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity p-6 flex flex-col justify-between pointer-events-none">
                                <div className="flex justify-end gap-2 pointer-events-auto">
                                  {canManageAlbum(selectedAlbum.id, selectedAlbum.officer_id) && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleSetThumbnail(photo.url); }} 
                                      className={`w-8 h-8 rounded flex items-center justify-center text-white transition-all ${selectedAlbum.cover_url === photo.url ? 'bg-amber-500 hover:bg-amber-600' : 'bg-white/30 hover:bg-amber-500'}`}
                                      title={selectedAlbum.cover_url === photo.url ? "Current Album Cover" : "Set as Album Cover"}
                                    >
                                      ★
                                    </button>
                                  )}
                                  {canManagePhoto(photo) && (
                                    <button onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id); }} className="w-8 h-8 bg-white/20 rounded flex items-center justify-center text-white hover:bg-red-500">
                                      <Icons.Trash width={14} />
                                    </button>
                                  )}
                                </div>
                                <div className="text-center">
                                   <Icons.ZoomIn className="text-white mx-auto mb-2 opacity-50" width={24} />
                                   <p className="text-[8px] font-bold text-white uppercase tracking-widest">{photo.uploader?.name}</p>
                                </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </Item>
                  ))}
              </Gallery>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 40 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 40 }}
               className="bg-white w-full max-w-4xl rounded-[4rem] shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]"
            >
              <header className="px-12 py-10 bg-slate-50 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic line-none">New Collective Memory</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em] mt-2">Initialize a collaborative cryptographic asset vault</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="w-14 h-14 bg-white shadow-sm border border-slate-100 rounded-full flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all">
                  <Icons.Trash width={24} />
                </button>
              </header>
              
              <form onSubmit={handleCreateAlbum} className="p-12 space-y-10 overflow-y-auto no-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Archive Title</label>
                      <input required type="text" value={newAlbum.name} onChange={(e) => setNewAlbum({ ...newAlbum, name: e.target.value })} placeholder="Mission Critical Assets..." className="w-full p-6 bg-slate-50 border-2 border-transparent rounded-[2rem] font-black text-slate-800 outline-none focus:border-blue-200 focus:bg-white transition-all shadow-inner" />
                    </div>
                    
                    <div className="space-y-2">
                       <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Narrative Description</label>
                       <textarea required rows={5} value={newAlbum.description} onChange={(e) => setNewAlbum({ ...newAlbum, description: e.target.value })} placeholder="Document the context of this acquisition..." className="w-full p-6 bg-slate-50 border-2 border-transparent rounded-[2.5rem] font-medium text-slate-700 outline-none focus:border-blue-200 focus:bg-white transition-all shadow-inner resize-none" />
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="p-8 bg-slate-900 rounded-[3rem] border border-white/5 space-y-8">
                      <div className="flex items-center justify-between">
                        <div>
                           <h4 className="text-sm font-black text-white uppercase tracking-widest">Visibility Logic</h4>
                           <p className="text-[9px] text-white/30 uppercase font-black mt-1">Node Access Restriction</p>
                        </div>
                        <button type="button" onClick={() => setNewAlbum({ ...newAlbum, is_restricted: !newAlbum.is_restricted })} className={`w-16 h-8 rounded-full relative transition-colors ${newAlbum.is_restricted ? 'bg-amber-500' : 'bg-white/10'}`}>
                          <motion.div 
                            animate={{ left: newAlbum.is_restricted ? '32px' : '4px' }}
                            className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg" 
                          />
                        </button>
                      </div>

                      {newAlbum.is_restricted && (
                        <div className="space-y-8 animate-fade-in pb-4">
                          <div className="space-y-4">
                             <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Authorized Clearance Roles</p>
                             <div className="flex flex-wrap gap-2">
                              {Object.entries(UserRole).map(([key, role]) => (
                                <button key={role} type="button" onClick={() => toggleRole(role as any, 'new')} className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${newAlbum.allowed_roles.includes(role as any) ? 'bg-white text-slate-900 border-white shadow-xl shadow-white/10' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>{key}</button>
                              ))}
                             </div>
                          </div>
                          <div className="space-y-4">
                             <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Authorized Unit Mapping</p>
                             <div className="flex flex-wrap gap-2">
                              {departments.map(dept => (
                                <button key={dept.id} type="button" onClick={() => toggleDept(dept.name, 'new')} className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${newAlbum.allowed_departments.includes(dept.name) ? 'bg-white text-slate-900 border-white shadow-xl shadow-white/10' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>{dept.name}</button>
                              ))}
                             </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button type="submit" className="w-full py-6 bg-blue-600 text-white rounded-[2.5rem] font-black uppercase text-xs tracking-[0.4em] shadow-2xl shadow-blue-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all">Synchronize to Global Archives</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && editAlbumData && (
          <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="bg-white w-full max-w-4xl rounded-[4rem] shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]"
            >
              <header className="px-12 py-10 bg-slate-50 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Configure Collective</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em] mt-2">Update node properties in the vault</p>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="w-14 h-14 bg-white shadow-sm border border-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-all">
                  <Icons.ArrowRight className="rotate-180" width={24} />
                </button>
              </header>
              
              <form onSubmit={handleUpdateAlbum} className="p-12 space-y-10 overflow-y-auto no-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Archive Title</label>
                      <input required type="text" value={editAlbumData.name} onChange={(e) => setEditAlbumData({ ...editAlbumData, name: e.target.value })} className="w-full p-6 bg-slate-50 border-2 border-transparent rounded-[2rem] font-black text-slate-800 outline-none focus:border-blue-200 focus:bg-white transition-all shadow-inner" />
                    </div>
                    
                    <div className="space-y-2">
                       <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Narrative Description</label>
                       <textarea required rows={5} value={editAlbumData.description} onChange={(e) => setEditAlbumData({ ...editAlbumData, description: e.target.value })} className="w-full p-6 bg-slate-50 border-2 border-transparent rounded-[2.5rem] font-medium text-slate-700 outline-none focus:border-blue-200 focus:bg-white transition-all shadow-inner resize-none" />
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="p-8 bg-slate-900 rounded-[3rem] border border-white/5 space-y-8">
                      <div className="flex items-center justify-between">
                        <div>
                           <h4 className="text-sm font-black text-white uppercase tracking-widest">Visibility Logic</h4>
                           <p className="text-[9px] text-white/30 uppercase font-black mt-1">Node Access Restriction</p>
                        </div>
                        <button type="button" onClick={() => setEditAlbumData({ ...editAlbumData, is_restricted: !editAlbumData.is_restricted })} className={`w-16 h-8 rounded-full relative transition-colors ${editAlbumData.is_restricted ? 'bg-amber-500' : 'bg-white/10'}`}>
                          <motion.div 
                            animate={{ left: editAlbumData.is_restricted ? '32px' : '4px' }}
                            className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg" 
                          />
                        </button>
                      </div>

                      {editAlbumData.is_restricted && (
                        <div className="space-y-8 animate-fade-in pb-4">
                          <div className="space-y-4">
                             <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Authorized Clearance Roles</p>
                             <div className="flex flex-wrap gap-2">
                              {Object.entries(UserRole).map(([key, role]) => (
                                <button key={role} type="button" onClick={() => toggleRole(role as any, 'edit')} className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${editAlbumData.allowed_roles.includes(role as any) ? 'bg-white text-slate-900 border-white shadow-xl' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>{key}</button>
                              ))}
                             </div>
                          </div>
                          <div className="space-y-4">
                             <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Authorized Unit Mapping</p>
                             <div className="flex flex-wrap gap-2">
                              {departments.map(dept => (
                                <button key={dept.id} type="button" onClick={() => toggleDept(dept.name, 'edit')} className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${editAlbumData.allowed_departments.includes(dept.name) ? 'bg-white text-slate-900 border-white shadow-xl' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>{dept.name}</button>
                              ))}
                             </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-6 flex gap-4">
                  {canManageAlbum(editAlbumData.id, editAlbumData.officer_id) && (
                    <button 
                      type="button" 
                      onClick={() => { handleDeleteAlbum(editAlbumData.id); setIsEditModalOpen(false); }}
                      className="px-8 py-6 bg-red-600 text-white rounded-[2.5rem] font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-red-700 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      Delete Album
                    </button>
                  )}
                  <button type="submit" className="flex-1 py-6 bg-[#003366] text-white rounded-[2.5rem] font-black uppercase text-xs tracking-[0.4em] shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all">Commit Configuration Updates</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GalleryModule;