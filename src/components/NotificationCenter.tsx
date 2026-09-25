import React, { useState } from 'react';
import { AppNotification, UserRole } from '../types';
import { Bell, CheckCircle2, AlertTriangle, Info, X, Trash2, MessageSquare, UserPlus, HelpCircle, Wrench } from 'lucide-react';

interface NotificationCenterProps {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  onSelectNotification?: (notification: AppNotification) => void;
  role?: UserRole;
  flatNumber?: number | string;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  onDismiss,
  onClearAll,
  onClose,
  onSelectNotification,
  role,
  flatNumber,
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'chat' | 'registration' | 'communication' | 'services'>('all');

  // Strictly filter to only the allowed categories and target audience
  const allowedNotifications = notifications.filter((n) => {
    if (!n.category) return false;

    // Check targetRole: non-admins only see if role matches
    if (n.targetRole && role !== 'ADMIN' && n.targetRole !== role) {
      return false;
    }

    // Check targetFlat: non-admins only see if flat matches
    if (n.targetFlat !== undefined && n.targetFlat !== null && n.targetFlat !== '' && role !== 'ADMIN') {
      if (String(flatNumber) !== String(n.targetFlat)) {
        return false;
      }
    }

    if (role === 'ASSISTANT') {
      return ['registration', 'services', 'chat', 'communication'].includes(n.category);
    }
    return ['chat', 'registration', 'communication', 'services'].includes(n.category);
  });

  const displayedNotifications = activeCategory === 'all'
    ? allowedNotifications
    : allowedNotifications.filter(n => n.category === activeCategory);

  const getIcon = (type: AppNotification['type'], category?: AppNotification['category']) => {
    if (category === 'chat') {
      return <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />;
    }
    if (category === 'registration') {
      return <UserPlus className="w-4 h-4 text-emerald-600 shrink-0" />;
    }
    if (category === 'services') {
      return <Wrench className="w-4 h-4 text-amber-600 shrink-0" />;
    }
    if (category === 'communication') {
      return <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0" />;
    }

    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'error':
        return <X className="w-4 h-4 text-red-500 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-500 shrink-0" />;
    }
  };

  const getCategoryLabel = (category?: AppNotification['category']) => {
    switch (category) {
      case 'chat':
        return 'الدردشة والرسائل';
      case 'registration':
        return 'طلبات وتسجيل السكان';
      case 'communication':
        return 'التواصل والمقترحات';
      case 'services':
        return 'الخدمات والصيانة';
      default:
        return 'عام';
    }
  };

  const getTypeStyle = (type: AppNotification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-emerald-50/60 border-emerald-200/80';
      case 'warning':
        return 'bg-amber-50/60 border-amber-200/80';
      case 'error':
        return 'bg-red-50/60 border-red-200/80';
      default:
        return 'bg-blue-50/60 border-blue-200/80';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-left text-right">
        {/* Header */}
        <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-black text-slate-900">مركز التنبيهات والرسائل</h2>
              <div className="relative">
                <Bell className="w-4 h-4 text-blue-900" />
                {allowedNotifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[9px] font-black flex items-center justify-center">
                    {allowedNotifications.filter(n => !n.read).length}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Filter Categories Chips */}
          <div className="flex items-center gap-1 overflow-x-auto pt-2 pb-0.5 no-scrollbar text-xs">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-blue-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              الكل ({allowedNotifications.length})
            </button>
            {role !== 'ASSISTANT' && (
              <>
                <button
                  onClick={() => setActiveCategory('chat')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                    activeCategory === 'chat'
                      ? 'bg-blue-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  الدردشة ({allowedNotifications.filter(n => n.category === 'chat').length})
                </button>
                <button
                  onClick={() => setActiveCategory('communication')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                    activeCategory === 'communication'
                      ? 'bg-blue-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  التواصل ({allowedNotifications.filter(n => n.category === 'communication').length})
                </button>
              </>
            )}
            <button
              onClick={() => setActiveCategory('services')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                activeCategory === 'services'
                  ? 'bg-blue-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              الخدمات ({allowedNotifications.filter(n => n.category === 'services').length})
            </button>
            <button
              onClick={() => setActiveCategory('registration')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                activeCategory === 'registration'
                  ? 'bg-blue-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              السكان ({allowedNotifications.filter(n => n.category === 'registration').length})
            </button>
          </div>
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-2.5 py-2 space-y-1.5">
          {displayedNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
              <Bell className="w-8 h-8 stroke-[1.5] text-slate-300" />
              <p className="text-xs font-bold">لا توجد تنبيهات أو رسائل جديدة في هذا القسم.</p>
            </div>
          ) : (
            displayedNotifications.map((notif) => (
              <div
                key={notif.id}
                className={`px-2.5 py-1.5 border rounded-xl flex items-start gap-2 transition-all duration-150 shadow-2xs hover:shadow-xs hover:border-blue-400/80 cursor-pointer ${getTypeStyle(notif.type)}`}
                onClick={() => {
                  if (onSelectNotification) {
                    onSelectNotification(notif);
                  }
                  onClose();
                }}
              >
                {/* Dismiss button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(notif.id);
                  }}
                  className="text-slate-400 hover:text-red-500 hover:bg-red-50/80 rounded-md p-1 transition cursor-pointer shrink-0 mt-0.5"
                  title="حذف التنبيه"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* Message info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] text-slate-500 font-bold">
                        {new Date(notif.timestamp).toLocaleTimeString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-white/90 text-slate-600 border border-slate-200/70 shrink-0">
                        {getCategoryLabel(notif.category)}
                      </span>
                      {notif.targetRole === 'ADMIN' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                          👑 للإدارة
                        </span>
                      )}
                      {notif.targetRole === 'ASSISTANT' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-300 shrink-0">
                          🔧 للمساعد
                        </span>
                      )}
                      {notif.targetFlat !== undefined && notif.targetFlat !== null && notif.targetFlat !== '' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 border border-blue-300 shrink-0">
                          🏠 وحدة {notif.targetFlat}
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-black text-slate-900 truncate text-right">{notif.title}</h4>
                  </div>
                  <p className="text-[11px] text-slate-700 font-semibold leading-snug mt-0.5 text-right">{notif.message}</p>
                </div>

                {/* Icon */}
                <div className="pt-0.5 shrink-0">
                  {getIcon(notif.type, notif.category)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {allowedNotifications.length > 0 && (
          <div className="p-2 sm:p-2.5 border-t border-slate-100 bg-slate-50/50 flex justify-center">
            <button
              onClick={onClearAll}
              className="flex items-center gap-1.5 text-red-600 hover:text-red-700 text-xs font-bold transition px-3 py-1.5 rounded-lg hover:bg-red-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح جميع التنبيهات</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
