import React, { useState, useEffect } from 'react';
import type { Officer, AppNotification } from '../types';
import { api } from '../service/api';
import { Skeleton } from '../components/Skeleton';

interface Props {
  user: Officer;
  lang: 'EN' | 'SI';
}

const NotificationsPage: React.FC<Props> = ({ user, lang }) => {
  const t = (si: string, en: string) => lang === 'SI' ? si : en;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
    requestNotificationPermission();
  }, []);

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
  };

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const response = await api.getNotifications();
      setNotifications(response || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    try {
      await api.markAllNotificationsRead();
    } catch (e) { console.error(e); }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'LEAVE': return '🏖️';
      case 'COMMUNITY': return '✨';
      case 'TASK': return '📋';
      case 'RESOURCE': return '🚐';
      default: return '🔔';
    }
  };

  const getIconBg = (type: string) => {
    switch (type) {
      case 'LEAVE': return 'bg-emerald-100';
      case 'COMMUNITY': return 'bg-pink-100';
      case 'TASK': return 'bg-blue-100';
      case 'RESOURCE': return 'bg-amber-100';
      default: return 'bg-slate-100';
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-10 animate-fade-in pb-20 px-2 md:px-0">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">{t('දැනුම්දීම්', 'Notifications')}</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">Institutional Pulse & Alerts</p>
        </div>
        <button 
          onClick={markAllAsRead}
          className="text-[10px] font-black uppercase tracking-widest text-[#1877F2] hover:underline"
        >
          {t('සියල්ල කියවන ලදී', 'Mark all as read')}
        </button>
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="p-10 space-y-6">
            <Skeleton className="w-full h-24 rounded-3xl" />
            <Skeleton className="w-full h-24 rounded-3xl" />
            <Skeleton className="w-full h-24 rounded-3xl" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-32 text-center grayscale opacity-30 flex flex-col items-center">
             <span className="text-7xl mb-6">🔕</span>
             <p className="font-black uppercase text-[10px] tracking-widest text-slate-400">All caught up</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {notifications.map(n => (
              <div 
                key={n.id} 
                className={`p-8 flex gap-6 hover:bg-slate-50/50 transition-all group relative cursor-pointer ${!n.is_read ? 'bg-[#1877F2]/[0.02]' : ''}`}
              >
                {!n.is_read && (
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-[#1877F2] rounded-full"></div>
                )}
                
                <div className={`w-14 h-14 rounded-2xl ${getIconBg(n.type)} flex items-center justify-center text-2xl flex-shrink-0 shadow-sm group-hover:scale-110 transition-transform`}>
                  {getIcon(n.type)}
                </div>

                <div className="flex-1 space-y-1.5 min-w-0">
                   <div className="flex justify-between items-start gap-4">
                      <h4 className={`text-lg font-black tracking-tight leading-tight truncate ${!n.is_read ? 'text-slate-900' : 'text-slate-600'}`}>{n.title}</h4>
                      <span className="text-[10px] font-bold text-slate-300 uppercase whitespace-nowrap">{n.timestamp}</span>
                   </div>
                   <p className={`text-sm leading-relaxed ${!n.is_read ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                      {n.message}
                   </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center py-10">
         <p className="text-slate-300 font-black uppercase text-[10px] tracking-[0.8em]">End of Notifications</p>
      </div>
    </div>
  );
};

export default NotificationsPage;
