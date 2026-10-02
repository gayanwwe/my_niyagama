import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Icons } from '../constants.tsx';
import { UserRole } from '../types.ts';

interface MainTabsProps {
  user: any;
  lang: 'EN' | 'SI';
  isMobilePortrait: boolean;
  unreadCount?: number;
}

interface NavItem {
  to: string;
  key: string;
  icon: React.ReactNode;
  /** Routes that should also light this tab up, e.g. /admin/* under Admin. */
  matches?: (pathname: string) => boolean;
  badge?: number;
}

const LABELS: Record<'EN' | 'SI', Record<string, string>> = {
  EN: {
    home: 'Home', admin: 'Admin', map: 'Map', circles: 'Circles', feed: 'Feed',
    media: 'Media', notifications: 'Alerts', display: 'Display', leave: 'Leave',
    resources: 'Resources', journal: 'Journal', circulars: 'Circulars',
    directory: 'Directory', intelligence: 'Insights', profile: 'Profile', more: 'More',
    settings: 'Settings', audit: 'Audit',
  },
  SI: {
    home: 'මුල් පිටුව', admin: 'පරිපාලන', map: 'සිතියම', circles: 'කව', feed: 'පුවත්',
    media: 'මාධ්‍ය', notifications: 'දැනුම්දීම්', display: 'සංදර්ශනය', leave: 'නිවාඩු',
    resources: 'සම්පත්', journal: 'දිනපොත', circulars: 'චක්‍රලේඛ',
    directory: 'දුරකථන', intelligence: 'විශ්ලේෂණ', profile: 'පැතිකඩ', more: 'තවත්',
    settings: 'සැකසුම්', audit: 'විගණනය',
  },
};

const TabItem: React.FC<{ to: string; icon: React.ReactNode; active: boolean; label: string; badge?: number }> = ({
  to, icon, active, label, badge,
}) => (
  <Link
    to={to}
    title={label}
    className={`w-14 sm:w-16 md:w-20 lg:w-[88px] flex flex-col items-center justify-center h-full relative transition-all group ${active ? 'text-[#1877F2]' : 'text-slate-400 hover:bg-slate-50'}`}
  >
    <div className={`transition-all duration-300 relative flex flex-col items-center ${active ? 'scale-105' : 'group-hover:scale-105 group-hover:text-slate-600'}`}>
      {React.cloneElement(icon as React.ReactElement<any>, {
        width: 22,
        height: 22,
        strokeWidth: active ? 2.5 : 2,
        className: active ? 'drop-shadow-[0_0_8px_rgba(24,119,242,0.4)]' : '',
      })}
      {badge ? (
        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[7px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center ring-2 ring-white">
          {badge}
        </span>
      ) : null}
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

const MainTabs: React.FC<MainTabsProps> = ({ user, lang, isMobilePortrait, unreadCount }) => {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const t = (key: string) => LABELS[lang][key] || key;

  const role = user?.role as UserRole | undefined;
  const isManagement = ([UserRole.EXECUTIVE, UserRole.ADMIN, UserRole.CHIEF_CLERK, UserRole.LEAVE_OFFICER, UserRole.IT, UserRole.SA, UserRole.EX] as any[]).includes(role);
  const isDisplayAdmin = ([UserRole.SA, UserRole.OPERATOR, UserRole.IT] as any[]).includes(role);

  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  // Every page an officer can actually reach. Leave, Resources, Journal,
  // Circulars and Directory are real routes that previously had no button
  // anywhere in the UI, so they could only be reached by typing the URL.
  const primary: NavItem[] = [
    { to: '/', key: 'home', icon: <Icons.Dashboard /> },
    ...(isManagement ? [{
      to: '/executive', key: 'admin', icon: <Icons.Admin />,
      matches: (p: string) => p === '/executive' || p.startsWith('/admin'),
    }] : []),
    { to: '/leave', key: 'leave', icon: <Icons.Leave /> },
    { to: '/resources', key: 'resources', icon: <Icons.Briefcase /> },
    { to: '/circles', key: 'circles', icon: <Icons.Circles /> },
    { to: '/community', key: 'feed', icon: <Icons.Community /> },
    { to: '/notifications', key: 'notifications', icon: <Icons.Notifications />, badge: unreadCount },
  ];

  const secondary: NavItem[] = [
    { to: '/mapping', key: 'map', icon: <Icons.Map /> },
    { to: '/gallery', key: 'media', icon: <Icons.Gallery /> },
    { to: '/journal', key: 'journal', icon: <Icons.Journal /> },
    { to: '/circulars', key: 'circulars', icon: <Icons.Circulars /> },
    { to: '/directory', key: 'directory', icon: <Icons.Users /> },
    ...(isManagement ? [
      { to: '/admin/intelligence', key: 'intelligence', icon: <Icons.Intelligence /> },
      // Neither of these was linked from anywhere in the UI.
      { to: '/admin/settings', key: 'settings', icon: <Icons.Settings /> },
      { to: '/admin/audit', key: 'audit', icon: <Icons.Shield /> },
    ] : []),
    ...(isDisplayAdmin ? [{ to: '/admin/dashboard-control', key: 'display', icon: <Icons.Broadcast /> }] : []),
    { to: '/profile', key: 'profile', icon: <Icons.Profile /> },
  ];

  // On a phone the bar holds five; everything else moves into More.
  const mobilePrimary: NavItem[] = [
    { to: '/', key: 'home', icon: <Icons.Dashboard /> },
    { to: '/leave', key: 'leave', icon: <Icons.Leave /> },
    { to: '/community', key: 'feed', icon: <Icons.Community /> },
    { to: '/notifications', key: 'notifications', icon: <Icons.Notifications />, badge: unreadCount },
  ];
  const mobileSecondary: NavItem[] = [
    { to: '/resources', key: 'resources', icon: <Icons.Briefcase /> },
    { to: '/circles', key: 'circles', icon: <Icons.Circles /> },
    { to: '/gallery', key: 'media', icon: <Icons.Gallery /> },
    { to: '/mapping', key: 'map', icon: <Icons.Map /> },
    { to: '/journal', key: 'journal', icon: <Icons.Journal /> },
    { to: '/circulars', key: 'circulars', icon: <Icons.Circulars /> },
    { to: '/directory', key: 'directory', icon: <Icons.Users /> },
    ...(isManagement ? [
      { to: '/executive', key: 'admin', icon: <Icons.Admin /> },
      { to: '/admin/intelligence', key: 'intelligence', icon: <Icons.Intelligence /> },
      { to: '/admin/settings', key: 'settings', icon: <Icons.Settings /> },
      { to: '/admin/audit', key: 'audit', icon: <Icons.Shield /> },
    ] : []),
    ...(isDisplayAdmin ? [{ to: '/admin/dashboard-control', key: 'display', icon: <Icons.Settings /> }] : []),
    { to: '/profile', key: 'profile', icon: <Icons.Profile /> },
  ];

  const shown = isMobilePortrait ? mobilePrimary : primary;
  const overflow = isMobilePortrait ? mobileSecondary : secondary;

  const isActive = (item: NavItem) =>
    item.matches ? item.matches(location.pathname) : location.pathname === item.to;

  const overflowHasActive = overflow.some(isActive);

  return (
    <div className="flex h-full w-full items-center justify-center" aria-label="Main navigation">
      {shown.map(item => (
        <TabItem
          key={item.to}
          to={item.to}
          icon={item.icon}
          label={t(item.key)}
          active={isActive(item)}
          badge={item.badge}
        />
      ))}

      <div className="relative h-full" ref={moreRef}>
        <button
          type="button"
          onClick={() => setMoreOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          title={t('more')}
          className={`w-14 sm:w-16 md:w-20 lg:w-[88px] flex flex-col items-center justify-center h-full relative transition-all group ${overflowHasActive || moreOpen ? 'text-[#1877F2]' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          <div className="flex flex-col items-center">
            <Icons.MoreVertical width={22} height={22} strokeWidth={overflowHasActive ? 2.5 : 2} />
            <span className={`hidden lg:block text-[8px] font-black uppercase tracking-tighter mt-1.5 ${overflowHasActive || moreOpen ? 'text-[#1877F2]' : 'text-slate-400 group-hover:text-slate-600'}`}>
              {t('more')}
            </span>
          </div>
          {overflowHasActive && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-1 bg-[#1877F2] rounded-t-full shadow-[0_-2px_8px_rgba(24,119,242,0.4)]"
            />
          )}
        </button>

        {moreOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-56 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-xl py-2 z-[200]"
          >
            {overflow.map(item => (
              <Link
                key={item.to}
                to={item.to}
                role="menuitem"
                className={`flex items-center gap-3 px-4 py-2.5 text-xs font-bold transition-colors ${isActive(item) ? 'text-[#1877F2] bg-blue-50' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {React.cloneElement(item.icon as React.ReactElement<any>, { width: 18, height: 18, strokeWidth: 2 })}
                <span className="uppercase tracking-wider">{t(item.key)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MainTabs;
