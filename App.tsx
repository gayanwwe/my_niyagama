import React, { useState, useEffect } from 'react';
import * as ReactRouterDom from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { UserRole } from './types.ts';
import type { Officer } from './types.ts';
import { Icons } from './constants.tsx';
import { api, UNAUTHENTICATED_EVENT } from './service/api.ts';
import { translations, TranslationKey } from './service/i18n.ts';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import MainTabs from './components/MainTabs';
import { Toaster, toast } from 'react-hot-toast';

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

  // The API client clears the stored session when the server rejects a token.
  // React state has to be reset too, otherwise `token` still holds the expired
  // value, the guard below stays false, and the app keeps rendering the
  // signed-in shell over an empty dashboard instead of the login form.
  useEffect(() => {
    const handleUnauthenticated = () => {
      setUser(null);
      setToken(null);
      // Deduplicated by id: a screen that fires several requests at once would
      // otherwise stack one toast per failed request.
      toast.error('Your session has expired. Please sign in again.', { id: 'session-expired' });
    };

    // Also covers signing out in another tab: localStorage is shared, so this
    // tab would otherwise keep showing a signed-in shell with no token.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'niyagama_token' && e.newValue === null) {
        setUser(null);
        setToken(null);
      }
    };

    window.addEventListener(UNAUTHENTICATED_EVENT, handleUnauthenticated);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(UNAUTHENTICATED_EVENT, handleUnauthenticated);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  if (location.pathname === '/public-dashboard') {
    return <PublicDashboard />;
  }

  if (!token || !user) return <LoginPage onLogin={handleLogin} />;

  const isManagement = ([UserRole.EXECUTIVE, UserRole.ADMIN, UserRole.CHIEF_CLERK, UserRole.LEAVE_OFFICER, UserRole.IT, UserRole.SA, UserRole.EX] as UserRole[]).includes(user.role);
  const isAdminGroup = ([UserRole.EXECUTIVE, UserRole.ADMIN, UserRole.OPERATOR, UserRole.CHIEF_CLERK, UserRole.SA, UserRole.EX] as UserRole[]).includes(user.role);
  const isDisplayAdmin = ([UserRole.SA, UserRole.OPERATOR, UserRole.IT] as UserRole[]).includes(user.role);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col font-sans overflow-hidden transition-colors duration-300">
      <nav className="h-14 md:h-16 bg-[var(--card)] border-b border-[var(--border)] flex items-center px-4 md:px-6 sticky top-0 z-[100] shadow-sm">
        <div className={`items-center gap-2 md:gap-3 flex-none w-auto lg:min-w-[180px] ${isMobilePortrait ? 'hidden' : 'flex'}`}>
          <Link to="/" className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg hover:scale-105 transition-all flex-shrink-0 p-1.5 border border-slate-100">
            <img src="/logo.png" alt="N" className="w-full h-full object-contain" />
          </Link>
          <span className="hidden lg:block text-lg font-black text-slate-800 tracking-tighter">My Niyagama</span>
        </div>

        <div className="flex-1 min-w-0 h-full flex items-center justify-center mx-2">
          <div className="flex h-full max-w-[900px] w-full items-center justify-center">
            <MainTabs
              user={user}
              lang={lang}
              isMobilePortrait={isMobilePortrait}
              unreadCount={unreadCount}
              onToggleLang={() => setLang(lang === 'EN' ? 'SI' : 'EN')}
              onLogout={handleLogout}
            />
          </div>
        </div>

        {/* A phone header has room for the avatar and nothing else, so the
            language switch and sign-out live in the More menu there. They stay
            here on wider screens, where the row is not cramped. */}
        <div className="flex items-center gap-1 md:gap-3 flex-none w-auto justify-end lg:min-w-[180px]">
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="hidden sm:block p-2 bg-[var(--background)] rounded-full text-slate-500 hover:text-[#1877F2] transition-colors"
            title="Toggle Theme"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {!isMobilePortrait && (
            <button
              onClick={() => setLang(lang === 'EN' ? 'SI' : 'EN')}
              className="min-w-[44px] min-h-[44px] px-3 flex items-center justify-center bg-[var(--background)] rounded-xl text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors whitespace-nowrap"
              title="Switch language"
            >
              {lang === 'EN' ? 'සිං' : 'EN'}
            </button>
          )}
          <Link to="/profile" className="min-h-[44px] flex items-center gap-2 p-1 md:pl-3 bg-[var(--background)] rounded-full border border-[var(--border)] hover:bg-slate-100 active:bg-slate-200 group transition-all flex-shrink-0" title="Profile">
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest hidden xl:block pr-1">{user.name?.split(' ')[0]}</span>
            <img
              src={user.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'Officer')}&background=1877F2&color=fff`}
              className="w-8 h-8 rounded-full border-2 border-white shadow-sm group-hover:scale-110 transition-transform flex-none"
              alt="profile"
            />
          </Link>
          {!isMobilePortrait && (
            <button
              onClick={handleLogout}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-[var(--background)] text-slate-500 rounded-full hover:bg-red-50 hover:text-red-500 active:bg-red-100 transition-all flex-none"
              title="Logout"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
          )}
        </div>
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
              {isDisplayAdmin && <Route path="/admin/dashboard-control" element={<PublicDashboardControl user={user} lang={lang} />} />}
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
