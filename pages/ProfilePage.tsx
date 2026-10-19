import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import type { Officer, UserActivity, LeaveRequest } from '../types';
import AttendanceCalendar from '../components/AttendanceCalendar';
import { api } from '../service/api';
import { Icons } from '../constants';

interface Props {
  user: Officer;
  setUser: React.Dispatch<React.SetStateAction<Officer | null>>;
  lang: 'EN' | 'SI';
  setLang: React.Dispatch<React.SetStateAction<'EN' | 'SI'>>;
  theme: 'light' | 'dark';
  setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
}

const ProfilePage: React.FC<Props> = ({ user: currentUser, setUser, lang, setLang, theme, setTheme }) => {
  const { id } = useParams<{ id?: string }>();
  const isOwnProfile = !id || id === currentUser.id?.toString();
  const t = (si: string, en: string) => lang === 'SI' ? si : en;

  const isPrivileged = ['SA', 'IT', 'ADMIN'].includes(currentUser.role) || currentUser.post?.includes('Administrative Officer') || currentUser.post?.includes('ITO');
  const canViewProfile = isOwnProfile || isPrivileged;


  const [officer, setOfficer] = useState<Officer | null>(null);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'ATTENDANCE' | 'ACTIVITY' | 'LEAVES' | 'SETTINGS'>('DETAILS');
  // Attendance and Leave Log are not offered on your own profile any more, so
  // a tab carried over from viewing another officer would render with no way
  // back to it.
  useEffect(() => {
    if (isOwnProfile && (activeTab === 'ATTENDANCE' || activeTab === 'LEAVES')) {
      setActiveTab('DETAILS');
    }
  }, [isOwnProfile, activeTab]);
  const [isVerifyingPic, setIsVerifyingPic] = useState(false);
  
  // Edit states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [birthday, setBirthday] = useState('');
  const [joinDate, setJoinDate] = useState('');
  
  // Password states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [coverPic, setCoverPic] = useState<string | null>(null);
  const [isUpdatingCover, setIsUpdatingCover] = useState(false);
  const [leaveBalance, setLeaveBalance] = useState<any>(null);

  const calculateServiceYears = (dateStr?: string) => {
    if (!dateStr) return '0.0';
    const joined = new Date(dateStr);
    if (isNaN(joined.getTime())) return '0.0';
    const now = new Date();
    const diffMs = now.getTime() - joined.getTime();
    if (diffMs <= 0) return '0.0';
    const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
    return years.toFixed(1);
  };

  const getRemainingLeaveDays = () => {
    if (!leaveBalance) return 'N/A';
    const casualRemaining = (leaveBalance.casual_total || 21) - (leaveBalance.casual || 0);
    const sickRemaining = (leaveBalance.sick_total || 7) - (leaveBalance.sick || 0);
    // Vacation is reported uncapped now, so this can go negative; an officer
    // who is over their allowance has none remaining, not minus three.
    const vacationRemaining = Math.max(0, (leaveBalance.vacation_total || 21) - (leaveBalance.vacation || 0));
    const total = casualRemaining + sickRemaining + vacationRemaining;
    return total.toFixed(1).replace('.0', '');
  };

  useEffect(() => {
    if (canViewProfile) {
      fetchData();
      fetchSettings();
    }
  }, [id, currentUser.id]);

  useEffect(() => {
    if (activeTab === 'ACTIVITY' && canViewProfile) {
      loadActivities();
    }
  }, [activeTab, id]);

  const fetchSettings = async () => {
    try {
      const settings = await api.getDashboardSettings();
      if (settings?.default_cover_pic) {
        setCoverPic(settings.default_cover_pic);
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const targetId = id || currentUser.id;
      if (targetId) {
        const res = await api.getOfficerDetails(targetId);
        setOfficer(res);
        setLeaves(res.leaves || []);
        
        setName(res.name || '');
        setPhone(res.official_phone || '');
        setAddress(res.address || '');
        setUsername(res.username || '');
        setBio(res.bio || '');
        setBirthday(res.birthday || '');
        setJoinDate(res.join_date || '');

        try {
          const bal = await api.getLeaveBalances(targetId);
          setLeaveBalance(bal);
        } catch (err) {
          console.error("Failed to load leave balances in profile page:", err);
        }
      }
    } catch (error) {
       console.error('Failed to load profile data', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadActivities = async () => {
    setIsLoadingActivities(true);
    try {
      const data = await api.getActivityLogs();
      setActivities(data);
    } catch (error) {
      console.error('Failed to load activities', error);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  const handleUpdatePic = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsVerifyingPic(true);
    try {
      if (isPrivileged) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          const { url } = await api.uploadImage(base64);
          if (officer?.id) {
            await api.updateStaff(officer.id, { profile_pic: url, pending_profile_pic: null });
            const updated = await api.getOfficerDetails(officer.id);
            setOfficer(updated);
            if (isOwnProfile) setUser(updated);
            alert(t('පැතිකඩ පින්තූරය සෘජුවම යාවත්කාලීන කරන ලදී!', 'Profile picture updated directly!'));
          }
        };
        reader.readAsDataURL(file);
      } else {
        await api.uploadProfilePic(file);
        alert(t('පැතිකඩ පින්තූරය යාවත්කාලීන කිරීම සඳහා පරිපාලක වෙත යවන ලදී.', 'Profile picture update request sent for verification.'));
        const updatedUser = await api.getCurrentUser();
        setUser(updatedUser);
      }
    } catch (error: any) {
      alert(error.message || 'Failed to upload image');
    } finally {
      setIsVerifyingPic(false);
    }
  };

  const handleUpdateCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isPrivileged) return;

    setIsUpdatingCover(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const { url } = await api.uploadImage(base64);
        const settings = await api.getDashboardSettings();
        await api.updateDashboardSettings({ ...settings, default_cover_pic: url });
        setCoverPic(url);
        alert(t('ගෝලීය පසුබිම් රූපය යාවත්කාලීන කරන ලදී!', 'Global cover photo updated!'));
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      alert(error.message || 'Failed to update cover');
    } finally {
      setIsUpdatingCover(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const updateData = {
        name,
        username,
        birthday,
        join_date: joinDate,
        official_phone: phone,
        address,
        bio
      };

      if (isOwnProfile) {
        const updatedUser = await api.updateProfile(updateData);
        setUser(updatedUser);
        setOfficer(updatedUser);
      } else if (isPrivileged && officer?.id) {
        await api.updateStaff(officer.id, updateData);
        const updated = await api.getOfficerDetails(officer.id);
        setOfficer(updated);
      }
      
      alert(t('පැතිකඩ සුරකින ලදී!', 'Profile Saved!'));
    } catch (error: any) {
      alert(error.message || 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      alert(t('මුරපද නොගැලපේ!', 'Passwords do not match!'));
      return;
    }
    if (newPassword.length < 4) {
      alert(t('මුරපදය අවම වශයෙන් අක්ෂර 4ක් විය යුතුය.', 'Password must be at least 4 characters.'));
      return;
    }

    setIsChangingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      alert(t('මුරපදය සාර්ථකව වෙනස් කරන ලදී!', 'Password successfully changed!'));
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      alert(error.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (!canViewProfile) {
    return (
      <div className="flex flex-col items-center justify-center py-40 space-y-6">
        <div className="text-6xl animate-bounce">🛡️</div>
        <div className="text-center">
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Access Denied</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">Administrative Privilege Required</p>
        </div>
        <button onClick={() => window.history.back()} className="px-8 py-4 bg-[#003366] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all">Go Back Home</button>
      </div>
    );
  }

  if (isLoading || !officer) {
    return (
      <div className="flex items-center justify-center h-full py-40">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-20 px-4 md:px-0">
      {/* 1. Header Section */}
      <div className="bg-white rounded-[2.5rem] md:rounded-[3rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        <div 
          className="h-48 md:h-64 relative group transition-all duration-700"
          style={{ 
            background: coverPic ? `url(${coverPic}) center/cover no-repeat` : 'linear-gradient(135deg, #1877F2 0%, #003366 100%)'
          }}
        >
          {coverPic && <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />}
          
          {/* Cover Overlay Info (Optional) */}
          <div className="absolute top-4 right-4 md:top-6 md:right-8 flex gap-2">
            <span className="px-3 md:px-4 py-1.5 bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-[9px] md:text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              {officer.work_type === 'FIELD' ? t('පිටත සේවක', 'Field Duty') : t('කාර්යාල සේවක', 'Office Active')}
            </span>
            {isPrivileged && (
              <label className="p-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-white cursor-pointer hover:bg-white/40 transition-colors" title="Change Global Cover">
                <Icons.Settings width={16} height={16} />
                <input type="file" className="hidden" accept="image/*" onChange={handleUpdateCover} disabled={isUpdatingCover} />
              </label>
            )}
          </div>

          <div className="absolute -bottom-16 md:-bottom-20 left-6 md:left-12 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-8">
            <div className="relative group/pic">
              <div className="absolute inset-0 bg-blue-500 rounded-[2.5rem] md:rounded-[3rem] blur-2xl opacity-20 group-hover/pic:opacity-40 transition-opacity" />
              <img 
                src={officer.profile_pic || `https://ui-avatars.com/api/?name=${officer.name}&background=1877F2&color=fff`} 
                className={`w-32 h-32 md:w-56 md:h-56 rounded-[2.5rem] md:rounded-[3rem] border-[6px] md:border-[12px] border-white shadow-2xl object-cover relative z-10 transition-transform duration-500 group-hover/pic:scale-[1.02] ${officer.pending_profile_pic ? 'opacity-50 grayscale' : ''}`} 
                alt="profile" 
              />
              {(isOwnProfile || isPrivileged) && (
                <label className="absolute inset-0 bg-black/40 opacity-0 group-hover/pic:opacity-100 rounded-[2.5rem] md:rounded-[3rem] flex items-center justify-center text-white transition-all cursor-pointer z-20">
                  <Icons.Profile width={32} height={32} className="drop-shadow-lg" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleUpdatePic} disabled={isVerifyingPic} />
                </label>
              )}
              {officer.pending_profile_pic && (
                <div className="absolute -top-1 -right-1 bg-amber-500 text-white text-[8px] md:text-[9px] font-black px-2 md:px-3 py-1 md:py-1.5 rounded-full shadow-lg z-30 animate-bounce">
                  {t('සංශෝදනය වේ...', 'VERIFYING')}
                </div>
              )}
            </div>
            
            <div className="pb-0 md:pb-6 space-y-1 text-center md:text-left">
              <div className="flex flex-col md:flex-row items-center gap-2 md:gap-3">
                <h2 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tighter drop-shadow-sm">{officer.name}</h2>
                {isOwnProfile && <Icons.Admin width={20} height={20} className="text-blue-500" />}
              </div>
              <div className="flex items-center justify-center md:justify-start gap-4">
                <span className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.2em]">{officer.post}</span>
                <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-slate-200" />
                <span className="text-[10px] md:text-xs font-bold text-blue-600 uppercase tracking-widest">{officer.department}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Stats Bar */}
        <div className="pt-20 md:pt-28 px-6 md:px-12 pb-8 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
            <div className="group cursor-default">
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">Employee ID</p>
              <p className="text-lg md:text-xl font-black text-slate-800 tracking-tighter">#{officer.id}</p>
            </div>
            <div className="group cursor-default">
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">Join Date</p>
              <p className="text-lg md:text-xl font-black text-slate-800 tracking-tighter">{officer.join_date || 'N/A'}</p>
            </div>
            <div className="group cursor-default">
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">Leave Balance</p>
              <p className="text-lg md:text-xl font-black text-slate-800 tracking-tighter">{getRemainingLeaveDays()} <span className="text-xs text-slate-400 uppercase font-bold ml-1">Days</span></p>
            </div>
            <div className="group cursor-default">
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">Service Years</p>
              <p className="text-lg md:text-xl font-black text-slate-800 tracking-tighter">{calculateServiceYears(officer.join_date)} <span className="text-xs text-slate-400 uppercase font-bold ml-1">Years</span></p>
            </div>
        </div>
      </div>

      {/* 3. Navigation & Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar Nav */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-[2.5rem] p-4 shadow-sm border border-slate-100 space-y-1">
            <NavButton 
              active={activeTab === 'DETAILS'} 
              onClick={() => setActiveTab('DETAILS')} 
              icon={<Icons.Profile width={18} />} 
              label={t('විස්තර', 'Personnel Info')} 
            />
            {/* Your own attendance and leave log now live in Leave Management,
                where officers look for them. These stay here only when a
                privileged user is reviewing another officer, which is the one
                case Leave Management does not cover. */}
            {!isOwnProfile && (
              <>
                <NavButton 
                  active={activeTab === 'ATTENDANCE'} 
                  onClick={() => setActiveTab('ATTENDANCE')} 
                  icon={<Icons.Calendar width={18} />} 
                  label={t('පැමිණීම', 'Attendance')} 
                />
                <NavButton 
                  active={activeTab === 'LEAVES'} 
                  onClick={() => setActiveTab('LEAVES')} 
                  icon={<Icons.Leave width={18} />} 
                  label={t('නිවාඩු', 'Leave Log')} 
                />
              </>
            )}
            <NavButton 
              active={activeTab === 'ACTIVITY'} 
              onClick={() => setActiveTab('ACTIVITY')} 
              icon={<Icons.Clock width={18} />} 
              label={t('ක්‍රියාකාරකම්', 'History')} 
            />
            {isOwnProfile && (
              <NavButton 
                active={activeTab === 'SETTINGS'} 
                onClick={() => setActiveTab('SETTINGS')} 
                icon={<Icons.Settings width={18} />} 
                label={t('ආරක්ෂාව', 'Security')} 
              />
            )}
          </div>

          {isOwnProfile && (
            <Link
              to="/leave"
              className="block bg-blue-50 border border-blue-100 rounded-[2.5rem] p-6 hover:bg-blue-100 active:bg-blue-200 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#1877F2] text-white flex items-center justify-center flex-none">
                  <Icons.Leave width={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#1877F2]">
                    {t('නිවාඩු කළමනාකරණය', 'Leave Management')}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 leading-snug mt-0.5">
                    {t('ඔබගේ පැමිණීම සහ නිවාඩු ඉතිහාසය', 'Your attendance and leave history')}
                  </p>
                </div>
              </div>
            </Link>
          )}

          {!isOwnProfile && (
            <div className="bg-[#003366] rounded-[2.5rem] p-8 text-white space-y-4 relative overflow-hidden group">
              <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
                <Icons.Briefcase width={120} height={120} />
              </div>
              <h4 className="text-xs font-black uppercase tracking-[0.3em] text-blue-300">Quick Contact</h4>
              <div className="space-y-4 relative z-10">
                <a href={`tel:${officer.official_phone}`} className="flex items-center gap-3 group/link">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover/link:bg-white/20 transition-colors">
                    <Icons.Mail width={14} />
                  </div>
                  <span className="text-xs font-bold tracking-wider">{officer.official_phone || 'N/A'}</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-9">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 min-h-[600px]"
            >
              {activeTab === 'DETAILS' ? (
                <div className="space-y-10">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-50">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{t('තොරතුරු', 'Detailed Repository')}</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('සේවා වාර්තා සහ පුද්ගලික දත්ත', 'Official records & verified data')}</p>
                    </div>
                    {isOwnProfile || isPrivileged ? (
                      <span className="px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-blue-100">
                        <Icons.Shield width={12} height={12} />
                        {t('සංස්කරණය කළ හැක', 'EDIT MODE ENABLED')}
                      </span>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                    {/* Column 1: Core Identity */}
                    <div className="space-y-8">
                       <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-1 bg-blue-500 rounded-full" />
                          <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.3em]">{t('පුද්ගලික තොරතුරු', 'Core Identity')}</h4>
                       </div>

                       <div className="space-y-6">
                        <EditableField 
                          label="Full Name" 
                          value={name} 
                          onChange={setName} 
                          disabled={!isOwnProfile && !isPrivileged} 
                          placeholder="Name of Officer"
                          icon={<Icons.Profile width={16} />}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <EditableField 
                            label="Birthday" 
                            value={birthday} 
                            onChange={setBirthday} 
                            disabled={!isOwnProfile && !isPrivileged} 
                            type="date"
                            icon={<Icons.Calendar width={16} />}
                          />
                          <EditableField 
                            label="Username" 
                            value={username} 
                            onChange={setUsername} 
                            disabled={!isOwnProfile && !isPrivileged} 
                            icon={<Icons.Fingerprint width={16} />}
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <EditableField 
                            label="Join Date" 
                            value={joinDate} 
                            onChange={setJoinDate} 
                            disabled={!isOwnProfile && !isPrivileged} 
                            type="date"
                            icon={<Icons.Calendar width={16} />}
                          />
                        </div>
                        <EditableField 
                          label="Bio / Professional Profile" 
                          value={bio} 
                          onChange={setBio} 
                          disabled={!isOwnProfile && !isPrivileged} 
                          type="textarea"
                          icon={<Icons.Info width={16} />}
                        />
                       </div>
                    </div>

                    {/* Column 2: Official Hooks */}
                    <div className="space-y-8">
                       <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-1 bg-slate-300 rounded-full" />
                          <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.3em]">{t('සේවා තොරතුරු', 'Official Context')}</h4>
                       </div>

                       <div className="space-y-6">
                        <EditableField 
                          label="Official Phone" 
                          value={phone} 
                          onChange={setPhone} 
                          disabled={!isOwnProfile && !isPrivileged} 
                          icon={<Icons.Mail width={16} />}
                        />
                        <EditableField 
                          label="Residential Address" 
                          value={address} 
                          onChange={setAddress} 
                          disabled={!isOwnProfile && !isPrivileged} 
                          type="textarea"
                          icon={<Icons.MapPin width={16} />}
                        />
                        
                        {/* Readonly Badge Section */}
                        <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-4">
                           <div className="flex items-center justify-between">
                             <div className="space-y-0.5">
                               <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{t('තනතුර', 'Current Designation')}</p>
                               <p className="text-sm font-black text-slate-800 uppercase">{officer.post}</p>
                             </div>
                             <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-500 shadow-sm">
                               <Icons.Briefcase width={20} />
                             </div>
                           </div>
                           <div className="flex items-center justify-between">
                             <div className="space-y-0.5">
                               <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{t('අංශය', 'Assigned Division')}</p>
                               <p className="text-sm font-black text-slate-800 uppercase">{officer.department}</p>
                             </div>
                             <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-green-500 shadow-sm">
                               <Icons.Mapping width={20} />
                             </div>
                           </div>
                        </div>
                       </div>
                    </div>
                  </div>

                  {(isOwnProfile || isPrivileged) && (
                    <div className="pt-6">
                      <button 
                        onClick={handleSaveProfile} 
                        disabled={isSaving}
                        className="w-full py-5 bg-[#003366] hover:bg-[#002244] text-white rounded-3xl font-black uppercase text-[11px] tracking-[0.4em] shadow-2xl shadow-blue-900/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-3 group"
                      >
                        {isSaving ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Icons.Shield width={18} height={18} className="group-hover:rotate-12 transition-transform" />
                        )}
                        {isSaving ? t('තොරතුරු සුරකිමින්...', 'Synchronizing Server Data...') : t('තොරතුරු යාවත්කාලීන කරන්න', 'COMMIT SYSTEM UPDATES')}
                      </button>
                    </div>
                  )}
                </div>
              ) : activeTab === 'ATTENDANCE' ? (
                <div className="space-y-8 h-full">
                   <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{t('පැමිණීම', 'Attendance Insights')}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('මාසික පැමිණීම සහ ප්‍රමාදයන්', 'Visual attendance data for the current cycle')}</p>
                      </div>
                      <div className="flex gap-4">
                         <div className="text-right">
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Monthly Streak</p>
                           <p className="text-xl font-black text-green-600">92%</p>
                         </div>
                      </div>
                   </div>
                   <div className="flex-1 bg-slate-50/50 rounded-[2.5rem] p-2 border border-slate-100">
                    <AttendanceCalendar user={officer} lang={lang} />
                   </div>
                </div>
              ) : activeTab === 'ACTIVITY' ? (
                <div className="space-y-8">
                   <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{t('ක්‍රියාකාරකම්', 'Operation Logs')}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('පද්ධති ක්‍රියාකාරකම් පිළිබඳ ඉතිහාසය', 'Audit trail of recent platform interactions')}</p>
                      </div>
                      <Icons.Clock className="text-slate-200" width={40} height={40} />
                   </div>
                   {isLoadingActivities ? (
                     <div className="py-20 flex flex-col items-center justify-center gap-4">
                       <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('දත්ත ලබා ගනිමින්...', 'Retrieving Audit Trail...')}</span>
                     </div>
                   ) : activities.length === 0 ? (
                     <div className="py-20 text-center space-y-4">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-3xl">📭</div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{t('ක්‍රියාකාරකම් නොමැත', 'No records found for this period')}</p>
                     </div>
                   ) : (
                     <div className="space-y-4">
                       {activities.map((activity, idx) => (
                         <motion.div 
                          key={activity.id} 
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="flex gap-6 p-6 bg-slate-50/50 rounded-3xl border border-slate-100 hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all group"
                         >
                           <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm group-hover:scale-110 transition-transform flex-shrink-0">
                             {activity.type === 'POSTED' ? '📝' : activity.type === 'COMMENTED' ? '💬' : activity.type === 'LIKED' ? '❤️' : '🔔'}
                           </div>
                           <div className="flex-1 space-y-1">
                             <div className="flex items-center justify-between">
                               <h4 className="font-black text-slate-800 text-base">{activity.title}</h4>
                               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                 {activity.created_at ? new Date(activity.created_at).toLocaleString() : ''}
                               </span>
                             </div>
                             <p className="text-sm text-slate-500 font-medium leading-relaxed">{activity.description}</p>
                             <div className="pt-2 flex gap-4">
                               <span className="text-[8px] font-bold text-blue-500 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-widest">System Record</span>
                               <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-widest">Verified</span>
                             </div>
                           </div>
                         </motion.div>
                       ))}
                     </div>
                   )}
                </div>
              ) : activeTab === 'LEAVES' ? (
                <div className="space-y-8">
                   <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{t('නිවාඩු', 'Leave Repository')}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest tracking-widest">{t('පසුගිය වසර 5ක නිවාඩු ඉතිහාසය', 'Consolidated historical leave data')}</p>
                      </div>
                      <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-500">
                        <Icons.Briefcase width={24} />
                      </div>
                   </div>
                   {leaves.length === 0 ? (
                     <div className="py-20 text-center border-3 border-dashed border-slate-50 rounded-[2.5rem] space-y-4">
                       <div className="text-4xl">🏝️</div>
                       <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest uppercase tracking-widest">{t('නිවාඩු වාර්තා නොමැත', 'Clean record — no leaves found')}</p>
                     </div>
                   ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       {leaves.map((req, idx) => (
                         <motion.div 
                          key={req.id} 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.1 }}
                          className="p-6 bg-slate-50/80 rounded-[2.5rem] border border-slate-100 flex flex-col gap-4 group hover:bg-white hover:shadow-xl transition-all"
                         >
                            <div className="flex items-center justify-between">
                               <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600' : req.status === 'REJECTED' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                                 {req.status}
                               </span>
                               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Icons.Info width={12} />
                                {req.type}
                               </span>
                            </div>
                            <div className="space-y-2">
                              <p className="text-xl font-black text-slate-800 tracking-tight">
                                {new Date(req.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} 
                                <span className="mx-2 text-slate-300">→</span> 
                                {new Date(req.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                              </p>
                              <p className="text-sm font-medium text-slate-500 leading-snug line-clamp-2 italic">“{req.reason}”</p>
                            </div>
                            <div className="pt-2 border-t border-slate-100/50 flex justify-between items-center">
                               <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Document ID: REF-{req.id?.toString().slice(-4)}</span>
                               <button className="text-[9px] font-black text-blue-500 uppercase tracking-widest hover:underline">Details</button>
                            </div>
                         </motion.div>
                       ))}
                     </div>
                   )}
                </div>
              ) : activeTab === 'SETTINGS' ? (
                <div className="space-y-12 max-w-2xl mx-auto py-10">
                   <div className="text-center space-y-4">
                      <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[2.5rem] flex items-center justify-center text-4xl mx-auto shadow-2xl shadow-blue-500/20 rotate-3">🛡️</div>
                      <div>
                        <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{t('ආරක්ෂාව', 'Security Perimeter')}</h3>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">{t('පද්ධති ප්‍රවේශ සහ ආරක්ෂක සැකසුම්', 'Maintain cryptographic access integrity')}</p>
                      </div>
                   </div>
                   
                   <div className="space-y-4">
                      <button 
                        onClick={() => setShowPasswordModal(true)} 
                        className="w-full flex items-center justify-between p-8 bg-slate-50 hover:bg-white hover:shadow-2xl hover:shadow-slate-200 rounded-[2.8rem] border border-slate-100 transition-all group overflow-hidden relative"
                      >
                         <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:rotate-12 transition-transform">
                            <Icons.Fingerprint width={120} height={120} />
                         </div>
                         <div className="flex items-center gap-6 relative z-10">
                            <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-2xl shadow-sm border border-slate-50 group-hover:scale-110 transition-transform">🔑</div>
                            <div className="text-left space-y-1">
                               <span className="block text-lg font-black text-slate-800 tracking-tight">{t('පද්ධති PIN අංකය', 'Update System PIN')}</span>
                               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('ඔබේ ප්‍රමුඛ ප්‍රවේශ යතුර වෙනස් කරන්න', 'Rotate your primary authentication token')}</span>
                            </div>
                         </div>
                         <Icons.ArrowRight className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-2 transition-all" width={24} />
                      </button>

                      <div className="p-8 bg-amber-50/50 rounded-[2.8rem] border border-amber-100/50 space-y-3">
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.3em] flex items-center gap-2">
                           <Icons.AlertTriangle width={14} height={14} />
                           {t('ආරක්ෂක උපදෙස්', 'Security Protocol Violation Alert')}
                        </p>
                        <p className="text-xs font-semibold text-amber-900/70 leading-relaxed uppercase tracking-wider">
                          {t('මුරපදය අවම වශයෙන් අක්ෂර 4කින් සමන්විත විය යුතුය. ඔබගේ ආරක්ෂාව වෙනුවෙන් නිතර මෙය යාවත්කාලීන කරන්න.', 'System rules enforce a minimum 4-digit PIN. Rotation is mandatory every 90 days for administrative accounts.')}
                        </p>
                      </div>
                   </div>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {showPasswordModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl" onClick={() => !isChangingPassword && setShowPasswordModal(false)} />
           <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl p-10 relative animate-in fade-in zoom-in duration-300">
              <div className="mb-8">
                 <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Rotate PIN</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Upgrade your authentication layer</p>
              </div>
              <div className="space-y-4">
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Current PIN</label>
                    <input type="password" placeholder="••••" className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-[#1877F2]/20 rounded-2xl font-black text-2xl tracking-[0.5em] text-center outline-none transition-all" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">New PIN</label>
                    <input type="password" placeholder="••••" className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-green-300/30 rounded-2xl font-black text-2xl tracking-[0.5em] text-center outline-none transition-all" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirm New PIN</label>
                    <input type="password" placeholder="••••" className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-green-300/30 rounded-2xl font-black text-2xl tracking-[0.5em] text-center outline-none transition-all" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                 </div>
              </div>
              <div className="flex gap-4 mt-10">
                <button disabled={isChangingPassword} onClick={() => setShowPasswordModal(false)} className="flex-1 py-4 font-black text-slate-400 uppercase text-[10px] tracking-widest hover:text-slate-600 disabled:opacity-50 transition-colors">Cancel</button>
                <button disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword} onClick={handleChangePassword} className="flex-1 py-4 bg-[#003366] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
                  {isChangingPassword ? 'Processing...' : 'Apply PIN'}
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;

// Helper Components
const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick} 
    className={`w-full flex items-center gap-3 px-5 py-4 rounded-[1.8rem] transition-all duration-300 group ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-500 hover:bg-slate-50'}`}
  >
    <div className={`p-2 rounded-xl transition-all ${active ? 'bg-white/20' : 'bg-slate-100 group-hover:bg-white group-hover:scale-110 shadow-sm'}`}>
      {icon}
    </div>
    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${active ? 'opacity-100' : 'opacity-80'}`}>{label}</span>
  </button>
);

const EditableField: React.FC<{ 
  label: string; 
  value: string; 
  onChange: (val: string) => void; 
  disabled?: boolean; 
  type?: 'text' | 'textarea' | 'date';
  placeholder?: string;
  icon?: React.ReactNode;
}> = ({ label, value, onChange, disabled, type = 'text', placeholder, icon }) => (
  <div className="space-y-2 group">
    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 group-focus-within:text-blue-500 transition-colors flex items-center gap-2">
      {icon}
      {label}
    </label>
    {type === 'textarea' ? (
      <textarea 
        disabled={disabled}
        rows={3} 
        placeholder={placeholder}
        className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-3xl font-medium outline-none transition-all disabled:opacity-75 resize-none text-slate-700 leading-relaxed" 
        value={value} 
        onChange={e => onChange(e.target.value)} 
      />
    ) : (
      <input 
        disabled={disabled}
        type={type}
        placeholder={placeholder}
        className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-3xl font-black outline-none transition-all disabled:opacity-75 text-slate-800" 
        value={value} 
        onChange={e => onChange(e.target.value)} 
      />
    )}
  </div>
);
