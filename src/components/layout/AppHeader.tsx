import React from 'react';
import { 
  Building2, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  LayoutDashboard, 
  Bell, 
  Menu, 
  X 
} from 'lucide-react';

interface AppHeaderProps {
  buildingName: string;
  firebaseStatus: 'idle' | 'syncing' | 'success' | 'error';
  onRetrySync: () => void;
  userDisplayName: string;
  userRoleLabel: string;
  isBackgroundSyncing: boolean;
  isOnline: boolean;
  syncing: boolean;
  activeTab: string;
  onNavigateTab: (tab: any) => void;
  unreadNotificationsCount: number;
  onOpenNotifications: () => void;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  buildingName,
  firebaseStatus,
  onRetrySync,
  userDisplayName,
  userRoleLabel,
  isBackgroundSyncing,
  isOnline,
  syncing,
  activeTab,
  onNavigateTab,
  unreadNotificationsCount,
  onOpenNotifications,
  isMenuOpen,
  onToggleMenu
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-[#111a2e] border-b border-slate-100 dark:border-slate-800 shadow-sm shadow-slate-100/40 dark:shadow-none">
      <div className="max-w-full mx-auto px-2 sm:px-4 h-16 flex items-center justify-between" dir="rtl">
        {/* Right Section: Building Title, User Info & Firebase Status Dot */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-900 to-indigo-900 text-white rounded-2xl flex items-center justify-center font-black shadow-xs shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex flex-col text-right">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-black text-blue-950 dark:text-white tracking-tight leading-tight">
                {buildingName}
              </h1>

              {/* Firebase Status Dot Indicator */}
              <div 
                className={`flex items-center justify-center p-1 rounded-full border transition shadow-2xs cursor-pointer select-none shrink-0 ${
                  firebaseStatus === 'success' 
                    ? 'bg-emerald-50 border-emerald-200/80 dark:bg-emerald-950/40 dark:border-emerald-800' 
                    : firebaseStatus === 'error'
                    ? 'bg-red-50 border-red-200/80 dark:bg-red-950/40 dark:border-red-800'
                    : 'bg-amber-50 border-amber-200/80 dark:bg-amber-950/40 dark:border-amber-800'
                }`}
                onClick={() => {
                  if (firebaseStatus === 'error') {
                    onRetrySync();
                  }
                }}
                title={
                  firebaseStatus === 'success'
                    ? 'جميع البيانات تُسجّل وتُحفظ على الفيربيز بنجاح'
                    : firebaseStatus === 'error'
                    ? 'توجد مشكلة في الحفظ على الفيربيز - انقر لإعادة المحاولة'
                    : 'جاري حفظ ومزامنة البيانات مع الفيربيز...'
                }
              >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  {firebaseStatus === 'success' && (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-xs shadow-emerald-500"></span>
                    </>
                  )}
                  {firebaseStatus === 'error' && (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 shadow-xs shadow-red-500"></span>
                    </>
                  )}
                  {firebaseStatus === 'syncing' && (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 shadow-xs shadow-amber-500"></span>
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                {userDisplayName}
              </span>
              <span className="text-[10px] text-slate-400 font-bold">
                ({userRoleLabel})
              </span>
            </div>
          </div>
        </div>

        {/* Left Section: The ONLY 3 buttons on the top bar + online indicator */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Background Fast Sync indicator */}
          {isBackgroundSyncing && (
            <div 
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 animate-pulse shadow-xs"
              title="جاري تحديث البيانات السحابية في الخلفية بسلاسة دون مقاطعة"
            >
              <RefreshCw className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400" />
              <span>مزامنة سريعة...</span>
            </div>
          )}

          {/* Connection/Sync status indicator badge */}
          <div 
            onClick={onRetrySync}
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition shadow-xs cursor-pointer ${
              isOnline 
                ? syncing 
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 animate-pulse' 
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' 
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
            }`}
            title={isOnline ? 'متصل بالسحابة وقاعدة البيانات' : 'وضع محلي غير متصل'}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>{syncing ? 'مزامنة...' : 'متصل'}</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>غير متصل</span>
              </>
            )}
          </div>

          {/* 1. زر الواجهة الرئيسية */}
          <button 
            type="button"
            onClick={() => onNavigateTab('dashboard')}
            className={`px-3 py-2 sm:px-3.5 sm:py-2 rounded-xl transition font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs ${
              activeTab === 'dashboard' 
                ? 'bg-blue-900 text-white shadow-md' 
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-blue-900'
            }`}
            title="الواجهة الرئيسية"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden sm:inline">الواجهة الرئيسية</span>
          </button>

          {/* 2. زر الإشعارات */}
          <button 
            type="button"
            onClick={onOpenNotifications}
            className="relative p-2 sm:p-2.5 bg-blue-50 dark:bg-slate-800 text-blue-900 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer flex items-center justify-center shadow-xs"
            title="تنبيهات وإشعارات النظام"
          >
            <Bell className="w-5 h-5 stroke-[2]" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black flex items-center justify-center rounded-full border-2 border-white dark:border-slate-800 animate-bounce">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {/* 3. زر القائمة الجانبية */}
          <button 
            type="button"
            onClick={onToggleMenu}
            className={`p-2 sm:px-3.5 sm:py-2 rounded-xl transition font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs ${
              isMenuOpen
                ? 'bg-blue-900 text-white shadow-md'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-blue-900'
            }`}
            title="القائمة الجانبية للتطبيق"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            <span className="hidden sm:inline">القائمة الجانبية</span>
          </button>
        </div>
      </div>
    </header>
  );
};
