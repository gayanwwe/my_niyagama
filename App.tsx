import React, { useState, useEffect } from 'react';
import * as ReactRouterDom from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { UserRole } from './types.ts';
import type { Officer } from './types.ts';
import { Icons } from './constants.tsx';
import { api } from './service/api.ts';
import { translations, TranslationKey } from './service/i18n.ts';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import MainTabs from './components/MainTabs';
import { Toaster } from 'react-hot-toast';

import DashboardOfficer from './pages/DashboardOfficer';
import DashboardExecutive from './pages/DashboardExecutive';
import CirclesModule from './pages/CirclesModule';
import HappyNiyagama from './pages/HappyNiyagama';
import PhoneBook from './pages/PhoneBook';
import GalleryModule from './pages/GalleryModule';
import ProfilePage from './pages/ProfilePage.tsx';
import OfficialJournal from './pages/OfficialJournal';
import StaffManagement from './pages/StaffManagement';
import DivisionalSettings from './pages/DivisionalSettings';
import SecurityAudit from './pages/SecurityAudit';
import CircularIntelligence from './pages/CircularIntelligence';
import LeaveModule from './pages/LeaveModule';
import ResourceBooking from './pages/ResourceBooking';
import ExecutiveIntelligence from './pages/ExecutiveIntelligence';
import NotificationsPage from './pages/NotificationsPage';
import BiometricManagement from './pages/BiometricManagement';
import DepartmentMapping from './pages/DepartmentMapping';
import PublicDashboard from './pages/PublicDashboard';
import PublicDashboardControl from './pages/PublicDashboardControl';

// Destructure from namespace import to resolve "no exported member" errors
const { HashRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } = ReactRouterDom;

const LoginPage: React.FC<{ onLogin: (user: Officer, token: string) => void }> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.login(username, pin);
      onLogin(data.user, data.token);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[3.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden border border-slate-100">
        <div className="p-12 text-center space-y-10">
          <div className="w-24 h-24 bg-white rounded-[2rem] mx-auto flex items-center justify-center shadow-xl border border-slate-100 p-4">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">My Niyagama</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-3">Informative only System</p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
               <div className="p-5 bg-red-50 text-red-600 rounded-3xl text-[11px] font-bold leading-relaxed border border-red-100 animate-shake">
                 <span className="block font-black uppercase tracking-widest mb-1 text-[9px]">Server Diagnostic:</span>
                 {error}
               </div>
            )}
            <div className="space-y-3">
              <input required placeholder="Username" className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-[#1877F2]/20 focus:bg-white rounded-2xl font-bold outline-none transition-all" value={username} onChange={e => setUsername(e.target.value)} />
              <input required type="password" placeholder="System PIN" className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-[#1877F2]/20 focus:bg-white rounded-2xl font-bold outline-none transition-all" value={pin} onChange={e => setPin(e.target.value)} />
            </div>
            <button disabled={isLoading} className="w-full py-5 bg-[#1877F2] text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 mt-4">
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const TabItem: React.FC<{ to: string; icon: React.ReactNode; active: boolean; label: string; badge?: number }> = ({ to, icon, active, label, badge }) => (
  <Link
    to={to}
    title={label}
    className={`w-14 sm:w-16 md:w-20 lg:w-24 xl:w-28 flex flex-col items-center justify-center h-full relative transition-all group ${active ? 'text-[#1877F2]' : 'text-slate-400 hover:bg-slate-50'}`}
  >
    <div className={`transition-all duration-300 relative flex flex-col items-center ${active ? 'scale-105' : 'group-hover:scale-105 group-hover:text-slate-600'}`}>
      {React.cloneElement(icon as React.ReactElement<any>, { 
        width: 22, 
        height: 22, 
        strokeWidth: active ? 2.5 : 2,
        className: active ? 'drop-shadow-[0_0_8px_rgba(24,119,242,0.4)]' : ''
      })}
      {badge ? (
        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[7px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center ring-2 ring-white">
          {badge}
        </span>
      ) : null}
      {/* Page Name Label - Visible only on Desktop (LG+) */}
      <span className={`hidden lg:block text-[8px] font-black uppercase tracking-tighter mt-1.5 whitespace-nowrap transition-colors ${active ? 'text-[#1877F2]' : 'text-slate-400 group-hover:text-slate-600'}`}>
        {label}
      </span>
    </div>
    {active && (
      <motion.div 
        layoutId="activeTab"
        className="absolute bottom-0 left-0 right-0 h-1 bg-[#1877F2] rounded-t-full shadow-[0_-2px_8px_rgba(24,119,242,0.4)]" 
      />
    )}
  </Link>
);

const AppContent: React.FC = () => {
  const [user, setUser] = useState<Officer | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('niyagama_token'));
  const [lang, setLang] = useState<'EN' | 'SI'>('EN');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('niyagama_theme') as 'light' | 'dark') || 'light');
  const [unreadCount, setUnreadCount] = useState(2); 
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const t = (key: TranslationKey) => translations[lang][key];

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('niyagama_theme', theme);
  }, [theme]);

  useEffect(() => {
    const checkOrientation = () => {
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      const isSmallScreen = window.innerWidth < 640; 
      setIsMobilePortrait(isPortrait && isSmallScreen);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('niyagama_user');
    if (savedUser && savedUser !== "undefined" && token) {
      try { 
        const parsed = JSON.parse(savedUser);
        if (parsed) setUser(parsed);
      } catch (e) { 
        localStorage.removeItem('niyagama_user');
      }
    }
  }, [token]);

  const handleLogin = (newUser: Officer, newToken: string) => {
    localStorage.setItem('niyagama_token', newToken);
    localStorage.setItem('niyagama_user', JSON.stringify(newUser));
    setUser(newUser);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('niyagama_token');
    localStorage.removeItem('niyagama_user');
    setUser(null);
    setToken(null);
  };

  if (location.pathname === '/public-dashboard') {
    return <PublicDashboard />;
  }

  if (!token || !user) return <LoginPage onLogin={handleLogin} />;

  const isManagement = ([UserRole.EXECUTIVE, UserRole.ADMIN, UserRole.CHIEF_CLERK, UserRole.LEAVE_OFFICER, UserRole.IT, UserRole.SA, UserRole.EX] as UserRole[]).includes(user.role);
  const isAdminGroup = ([UserRole.EXECUTIVE, UserRole.ADMIN, UserRole.OPERATOR, UserRole.CHIEF_CLERK, UserRole.SA, UserRole.EX] as UserRole[]).includes(user.role);
  const isDisplayAdmin = ([UserRole.SA, UserRole.OPERATOR, UserRole.IT] as UserRole[]).includes(user.role);

  const mainTabs = isMobilePortrait ? (
    isAdminGroup ? ['/', '/community', '/mapping', '/notifications', '/executive'] : ['/', '/community', '/gallery', '/notifications', '/profile']
  ) : (
    ['/', '/executive', '/mapping', '/circles', '/community', '/gallery', '/notifications'].filter(path => path !== '/executive' || isManagement)
  );

  const handleDragEnd = (event: any, info: any) => {
    // Drag navigation handled by MainTabs component
    if (!isMobilePortrait) return;
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col font-sans overflow-hidden transition-colors duration-300">
      <nav className="h-14 md:h-16 bg-[var(--card)] border-b border-[var(--border)] flex items-center px-4 md:px-6 sticky top-0 z-[100] shadow-sm">
        <MainTabs
          user={user}
          lang={lang}
          isMobilePortrait={isMobilePortrait}
          navigate={navigate}
          unreadCount={unreadCount}
        />
      </nav>
      <main className="flex-1 relative overflow-hidden">
        <div className="h-full overflow-x-hidden overflow-y-auto p-4 md:p-8 lg:p-12 max-w-[1600px] w-full mx-auto">
          <ErrorBoundary>
            <Routes location={location}>
              <Route path="/" element={<DashboardOfficer user={user} lang={lang} />} />
              <Route path="/executive" element={<DashboardExecutive user={user} lang={lang} />} />
              <Route path="/mapping" element={<DepartmentMapping user={user} lang={lang} />} />
              <Route path="/admin/intelligence" element={<ExecutiveIntelligence user={user} lang={lang} />} />
              <Route path="/circles" element={<CirclesModule user={user} lang={lang} />} />
              <Route path="/community" element={<HappyNiyagama user={user} lang={lang} />} />
              <Route path="/notifications" element={<NotificationsPage user={user} lang={lang} />} />
              <Route path="/directory" element={<PhoneBook lang={lang} user={user} />} />
              <Route path="/gallery" element={<GalleryModule user={user} lang={lang} />} />
              <Route path="/profile" element={user ? <ProfilePage user={user} setUser={setUser} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} /> : <Navigate to="/" />} />
              <Route path="/profile/:id" element={user ? <ProfilePage user={user} setUser={setUser} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} /> : <Navigate to="/" />} />
              <Route path="/journal" element={<OfficialJournal user={user} lang={lang} />} />
              <Route path="/circulars" element={<CircularIntelligence user={user} lang={lang} />} />
              <Route path="/leave" element={<LeaveModule user={user} lang={lang} />} />
              <Route path="/resources" element={<ResourceBooking user={user} lang={lang} />} />
              {isManagement && <Route path="/admin/staff" element={<StaffManagement user={user} lang={lang} />} />}
              {isManagement && <Route path="/admin/settings" element={<DivisionalSettings user={user} lang={lang} />} />}
              {isManagement && <Route path="/admin/audit" element={<SecurityAudit user={user} lang={lang} />} />}
              {isManagement && <Route path="/admin/biometric" element={<BiometricManagement user={user} lang={lang} />} />}
              {isManagement && <Route path="/admin/dashboard-control" element={<PublicDashboardControl user={user} lang={lang} />} />}
              <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </main>
    </div>
  );
};

const App: React.FC = () => (
  <HashRouter>
    <AppContent />
    {/* Required for react-hot-toast to render anything. Without it every
        toast.success / toast.error call in the app is silently discarded. */}
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 4000,
        style: { borderRadius: '1rem', fontWeight: 700, fontSize: '0.8rem' },
        success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
        error: { duration: 6000, iconTheme: { primary: '#ef4444', secondary: '#fff' } },
      }}
    />
  </HashRouter>
);

export default App;
