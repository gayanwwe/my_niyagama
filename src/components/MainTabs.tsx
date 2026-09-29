import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface MainTabsProps {
  user: any;
  lang: 'EN' | 'SI';
  isMobilePortrait: boolean;
  navigate: any;
  unreadCount?: number;
}

// Simplified tab labels - key only, UI shows translated text
const TAB_CONFIG = {
  mobile: {
    admin: ['/', '/community', '/mapping', '/notifications', '/executive'],
    default: ['/', '/community', '/gallery', '/notifications', '/profile'],
    displayAdmin: ['/', '/community', '/mapping', '/notifications', '/executive'],
  },
  desktop: {
    admin: ['/', '/executive', '/mapping', '/circles', '/community', '/gallery', '/notifications'],
    default: ['/', '/executive', '/mapping', '/circles', '/community', '/gallery', '/notifications'],
    displayAdmin: ['/', '/executive', '/mapping', '/circles', '/community', '/gallery', '/notifications'],
  },
};

const getTranslatedLabel = (key: string, lang: 'EN' | 'SI') => {
  const en: Record<string, string> = {
    home: 'Home', feed: 'Feed', map: 'Map', notifications: 'Notifications',
    admin: 'Admin', media: 'Media', profile: 'Profile', circles: 'Circles',
    logout: 'Logout',
  };
  const si: Record<string, string> = {
    home: 'මුල් පිටුව', feed: 'පුවත්', map: 'සිතියම', notifications: 'දැනුම්දීම්',
    admin: 'පරිපාලන', media: 'මාධ්‍ය', profile: 'පැතිකඩ', circles: 'කව', logout: 'පිටවීම',
  };
  const dict = lang === 'SI' ? si : en;
  return dict[key] || key;
};

const getTabConfig = (isMobilePortrait: boolean, userRole: string | undefined) => {
  const isExeAndAdmin = ['EXECUTIVE', 'ADMIN', 'IT', 'CHIEF_CLERK', 'SA', 'EX'].includes(userRole || '');
  const isAdmin = ['EXECUTIVE', 'ADMIN', 'OPERATOR', 'CHIEF_CLERK', 'SA', 'EX'].includes(userRole || '');
  const isDisplayAdmin = ['SA', 'OPERATOR', 'IT'].includes(userRole || '');

  if (isMobilePortrait) {
    if (isExeAndAdmin) return { tabs: TAB_CONFIG.mobile.admin, maxTabs: 5 };
    if (isAdmin) return { tabs: TAB_CONFIG.mobile.default, maxTabs: 6 };
    if (isDisplayAdmin) return { tabs: TAB_CONFIG.mobile.displayAdmin, maxTabs: 5 };
    return { tabs: TAB_CONFIG.mobile.default, maxTabs: 5 };
  } else {
    if (isExeAndAdmin) return { tabs: TAB_CONFIG.desktop.admin, maxTabs: 7 };
    if (isAdmin) return { tabs: TAB_CONFIG.desktop.default.filter(p => p !== '/executive'), maxTabs: 6 };
    if (isDisplayAdmin) return { tabs: TAB_CONFIG.desktop.displayAdmin, maxTabs: 7 };
    return { tabs: TAB_CONFIG.desktop.default, maxTabs: 7 };
  }
};

const MainTabs: React.FC<MainTabsProps> = ({
  user,
  lang,
  isMobilePortrait,
  navigate,
  unreadCount,
}) => {
  const location = useLocation();
  const userRole = user?.role;
  const { tabs, maxTabs } = getTabConfig(isMobilePortrait, userRole);

  // Show only up to maxTabs
  const visibleTabs = tabs.slice(0, maxTabs);

  const activeIndex = visibleTabs.indexOf(location.pathname);

  return (
    <div
      className="hidden lg:flex items-center px-4 py-2 transition-all flex-shrink min-w-0"
      aria-label="Main navigation"
    >
      <span className="text-lg font-black text-slate-800 tracking-tighter">
        My Niyagama
      </span>
    </div>
  );
};

export default MainTabs;