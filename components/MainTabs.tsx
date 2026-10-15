import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Icons } from '../constants.tsx';
import { UserRole } from '../types.ts';

interface MainTabsProps {
  user: any;
  lang: 'EN' | 'SI';
  isMobilePortrait: boolean;
  unreadCount?: number;
  /** On a phone these two live in the More menu instead of the header. */
  onToggleLang?: () => void;
  onLogout?: () => void;
}

interface NavItem {
  to: string;
  key: string;
  icon: React.ReactNode;
  /** Routes that should also light this tab up, e.g. /admin/* under Admin. */
  matches?: (pathname: string) => boolean;
  badge?: number;
  /** Shown under the icon when the bar is wide; defaults to the menu label. */
  shortKey?: string;
}

const LABELS: Record<'EN' | 'SI', Record<string, string>> = {
  EN: {
    home: 'Home', admin: 'Admin', map: 'Map', circles: 'Circles', feed: 'Feed',
    media: 'Media', notifications: 'Alerts', display: 'Public Dashboard',
    displayShort: 'Public', leave: 'Leave',
    resources: 'Resources', journal: 'Journal', circulars: 'Circulars',
    directory: 'Directory', intelligence: 'Insights', profile: 'Profile', more: 'More',
    settings: 'Settings', audit: 'Audit',
    language: 'සිංහල', logout: 'Sign Out',
  },
  SI: {
    home: 'මුල් පිටුව', admin: 'පරිපාලන', map: 'සිතියම', circles: 'කව', feed: 'පුවත්',
    media: 'මාධ්‍ය', notifications: 'දැනුම්දීම්', display: 'ප්‍රසිද්ධ පුවරුව',
    displayShort: 'පුවරුව', leave: 'නිවාඩු',
    resources: 'සම්පත්', journal: 'දිනපොත', circulars: 'චක්‍රලේඛ',
    directory: 'දුරකථන', intelligence: 'විශ්ලේෂණ', profile: 'පැතිකඩ', more: 'තවත්',
    settings: 'සැකසුම්', audit: 'විගණනය',
    language: 'English', logout: 'ඉවත් වන්න',
  },
};

/**
 * Tabs share the bar rather than claiming a fixed width each. A desktop bar
 * can hold eleven items for an administrator and five on a phone; fixed
 * widths overflowed the first and left gaps in the second.
 */
const TAB_WIDTH = 'flex-1 min-w-[52px] max-w-[88px]';

const TabItem: React.FC<{ to: string; icon: React.ReactNode; active: boolean; label: string; title: string; badge?: number }> = ({
  to, icon, active, label, title, badge,
}) => (
  <Link
    to={to}
    title={title}
    className={`${TAB_WIDTH} flex flex-col items-center justify-center h-full relative transition-all group ${active ? 'text-[#1877F2]' : 'text-slate-400 hover:bg-slate-50'}`}
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

const MainTabs: React.FC<MainTabsProps> = ({ user, lang, isMobilePortrait, unreadCount, onToggleLang, onLogout }) => {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuBox, setMenuBox] = useState<{ top: number; right: number } | null>(null);
  /**
   * Eleven tabs need a real desktop to sit in. Between a phone and 1024px the
   * bar carries the essentials and the rest wait in More, rather than
   * overflowing the header.
   */
  const [isWide, setIsWide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );
  const moreRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = (key: string) => LABELS[lang][key] || key;

  const role = user?.role as UserRole | undefined;
  const isManagement = ([UserRole.EXECUTIVE, UserRole.ADMIN, UserRole.CHIEF_CLERK, UserRole.LEAVE_OFFICER, UserRole.IT, UserRole.SA, UserRole.EX] as any[]).includes(role);
  const isDisplayAdmin = ([UserRole.SA, UserRole.OPERATOR, UserRole.IT] as any[]).includes(role);

  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsWide(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /**
   * The menu is portalled to the body. Its old home was a flex cell with
   * `overflow-hidden`, and the menu hangs below the bar, so every pixel of it
   * was clipped — the More button looked dead because nothing ever appeared.
   */
  useLayoutEffect(() => {
    if (!moreOpen) return;
    const place = () => {
      const r = moreRef.current?.getBoundingClientRect();
      if (r) setMenuBox({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moreRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMoreOpen(false);
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
    { to: '/mapping', key: 'map', icon: <Icons.Map /> },
    { to: '/gallery', key: 'media', icon: <Icons.Gallery /> },
    ...(isDisplayAdmin ? [{
      to: '/admin/dashboard-control', key: 'display', shortKey: 'displayShort', icon: <Icons.Broadcast />,
    }] : []),
    { to: '/notifications', key: 'notifications', icon: <Icons.Notifications />, badge: unreadCount },
  ];

  const secondary: NavItem[] = [
    { to: '/journal', key: 'journal', icon: <Icons.Journal /> },
    { to: '/circulars', key: 'circulars', icon: <Icons.Circulars /> },
    { to: '/directory', key: 'directory', icon: <Icons.Users /> },
    ...(isManagement ? [
      { to: '/admin/intelligence', key: 'intelligence', icon: <Icons.Intelligence /> },
      // Neither of these was linked from anywhere in the UI.
      { to: '/admin/settings', key: 'settings', icon: <Icons.Settings /> },
      { to: '/admin/audit', key: 'audit', icon: <Icons.Shield /> },
    ] : []),
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
    ...(isDisplayAdmin ? [{ to: '/admin/dashboard-control', key: 'display', icon: <Icons.Broadcast /> }] : []),
    { to: '/profile', key: 'profile', icon: <Icons.Profile /> },
  ];

  // Between phone and desktop, these four step back into the More menu.
  const COMPACT_DROPS = ['/resources', '/circles', '/gallery', '/admin/dashboard-control'];

  const shown = isMobilePortrait
    ? mobilePrimary
    : isWide
      ? primary
      : primary.filter((i) => !COMPACT_DROPS.includes(i.to));

  const overflow = isMobilePortrait
    ? mobileSecondary
    : isWide
      ? secondary
      : [...primary.filter((i) => COMPACT_DROPS.includes(i.to)), ...secondary];

  const isActive = (item: NavItem) =>
    item.matches ? item.matches(location.pathname) : location.pathname === item.to;

  const overflowHasActive = overflow.some(isActive);

  // Language and sign-out are in the header on a wide screen; on a phone that
  // row had no room left, so they move in here.
  const actions = isMobilePortrait
    ? [
        onToggleLang && { key: 'language', icon: <Icons.Globe />, onClick: onToggleLang, danger: false },
        onLogout && { key: 'logout', icon: <Icons.Logout />, onClick: onLogout, danger: true },
      ].filter(Boolean) as { key: string; icon: React.ReactNode; onClick: () => void; danger: boolean }[]
    : [];

  const menu = moreOpen && menuBox && (
    <div
      ref={menuRef}
      role="menu"
      style={{ position: 'fixed', top: menuBox.top, right: menuBox.right }}
      className="w-56 max-h-[70vh] overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-xl py-2 z-[300]"
    >
      {overflow.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          role="menuitem"
          onClick={() => setMoreOpen(false)}
          className={`flex items-center gap-3 px-4 py-3 min-h-[44px] text-xs font-bold transition-colors ${isActive(item) ? 'text-[#1877F2] bg-blue-50' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          {React.cloneElement(item.icon as React.ReactElement<any>, { width: 18, height: 18, strokeWidth: 2 })}
          <span className="uppercase tracking-wider">{t(item.key)}</span>
        </Link>
      ))}

      {actions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--border)]">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              onClick={() => { setMoreOpen(false); a.onClick(); }}
              className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] text-xs font-bold transition-colors ${a.danger ? 'text-red-500 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {React.cloneElement(a.icon as React.ReactElement<any>, { width: 18, height: 18, strokeWidth: 2 })}
              <span className="uppercase tracking-wider">{t(a.key)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full w-full items-center justify-center" aria-label="Main navigation">
      {shown.map(item => (
        <TabItem
          key={item.to}
          to={item.to}
          icon={item.icon}
          label={t(item.shortKey || item.key)}
          title={t(item.key)}
          active={isActive(item)}
          badge={item.badge}
        />
      ))}

      <div className={`relative h-full ${TAB_WIDTH}`} ref={moreRef}>
        <button
          type="button"
          onClick={() => setMoreOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          title={t('more')}
          className={`w-full flex flex-col items-center justify-center h-full relative transition-all group ${overflowHasActive || moreOpen ? 'text-[#1877F2]' : 'text-slate-400 hover:bg-slate-50'}`}
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
      </div>

      {menu && createPortal(menu, document.body)}
    </div>
  );
};

export default MainTabs;
