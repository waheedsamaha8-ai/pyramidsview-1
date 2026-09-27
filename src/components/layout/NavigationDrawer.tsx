import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  X, 
  LayoutDashboard, 
  ChevronLeft, 
  Wallet, 
  ChevronDown, 
  Users, 
  MessageSquare, 
  Settings, 
  BookOpen, 
  LogOut,
  Type,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';
import { UserRole } from '../../types';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  buildingName: string;
  activeTab: string;
  onNavigateTab: (tab: any) => void;
  onNavigatePollsTab: (subTab: 'polls') => void;
  role: UserRole;
  expandedSections: string[];
  onToggleSection: (section: string) => void;
  onOpenRules: () => void;
  userName: string;
  onLogout: () => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  buildingName,
  activeTab,
  onNavigateTab,
  onNavigatePollsTab,
  role,
  expandedSections,
  onToggleSection,
  onOpenRules,
  userName,
  onLogout
}) => {
  const [fontScale, setFontScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('app_font_scale');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 75 && val <= 130) return val;
      }
    } catch {}
    return 100;
  });

  useEffect(() => {
    try {
      const scalePercent = fontScale / 100;
      document.documentElement.style.fontSize = `${16 * scalePercent}px`;
      document.documentElement.style.setProperty('--app-font-scale', String(scalePercent));
      if (typeof document !== 'undefined' && document.body) {
        (document.body.style as any).zoom = String(scalePercent);
      }
      localStorage.setItem('app_font_scale', String(fontScale));
    } catch {}
  }, [fontScale]);

  const handleIncreaseFont = () => {
    setFontScale(prev => Math.min(130, Math.round(prev + 3)));
  };

  const handleDecreaseFont = () => {
    setFontScale(prev => Math.max(76, Math.round(prev - 3)));
  };

  const handleResetFont = () => {
    setFontScale(100);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end" onClick={onClose}>
      <div 
        className="w-80 max-w-[85vw] h-full bg-white dark:bg-[#111a2e] shadow-2xl p-5 flex flex-col justify-between animate-slide-left overflow-y-auto max-h-screen text-right"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-4">
          {/* Drawer Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-900 text-white rounded-xl flex items-center justify-center font-black">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">قائمة النظام</h3>
                <p className="text-[10px] text-slate-400 font-bold">{buildingName}</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Font Size Zoom - Prominent at the top of Sidebar */}
          <div className="bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-slate-100">
                <Type className="w-4 h-4 text-blue-900 dark:text-blue-400" />
                <span>حجم خط وتكبير الشاشة</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-mono font-black text-blue-950 dark:text-blue-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs">
                  {fontScale}%
                </span>
                {fontScale !== 100 && (
                  <button
                    type="button"
                    onClick={handleResetFont}
                    className="p-1 text-slate-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition cursor-pointer"
                    title="إعادة ضبط الحجم الافتراضي (100%)"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={handleDecreaseFont}
                disabled={fontScale <= 76}
                className="py-1.5 px-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-black border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                title="تصغير حجم الخط بدرجة صغيرة (-3%)"
              >
                <ZoomOut className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                <span>تصغير A-</span>
              </button>

              <button
                type="button"
                onClick={handleIncreaseFont}
                disabled={fontScale >= 130}
                className="py-1.5 px-2 bg-blue-900 hover:bg-blue-800 active:scale-95 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                title="تكبير حجم الخط بدرجة صغيرة (+3%)"
              >
                <ZoomIn className="w-3.5 h-3.5 text-blue-200" />
                <span>تكبير A+</span>
              </button>
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-400 font-bold text-center">
              درجات ضبط صغيرة ودقيقة (±3%)
            </p>
          </div>

          {/* Navigation Sections */}
          <div className="flex flex-col gap-2">
            {/* 1. Main Interface */}
            <button
              onClick={() => { onNavigateTab('dashboard'); onClose(); }}
              className={`flex items-center justify-between w-full py-3 px-3.5 rounded-2xl text-xs font-black transition cursor-pointer ${
                activeTab === 'dashboard' ? 'bg-blue-900 text-white shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4" />
                <span>الواجهة الرئيسية</span>
              </div>
              <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
            </button>

            {/* 2. Collection & Finance Category */}
            <div className="space-y-1">
              <button 
                onClick={() => onToggleSection('collection')}
                className="w-full flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-black text-blue-950 dark:text-white transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>قسم التحصيل والمالية</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedSections.includes('collection') ? '' : '-rotate-90'}`} />
              </button>
              {expandedSections.includes('collection') && (
                <div className="pr-3 flex flex-col gap-1 mt-1 border-r-2 border-emerald-200 dark:border-emerald-800 mr-2">
                  <button
                    onClick={() => { onNavigateTab('payments'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'payments' ? 'bg-blue-900 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    التحصيلات وسندات القبض
                  </button>
                  <button
                    onClick={() => { onNavigateTab('expenses'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'expenses' ? 'bg-blue-900 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    المصروفات والفواتير
                  </button>
                  <button
                    onClick={() => { onNavigateTab('debts-report'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'debts-report' ? 'bg-blue-900 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    كشف المديونيات
                  </button>
                  <button
                    onClick={() => { onNavigateTab('summaries'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'summaries' ? 'bg-blue-900 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    الملخصات وخريطة السداد
                  </button>
                  <button
                    onClick={() => { onNavigateTab('history'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'history' ? 'bg-blue-900 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    سجل المعاملات المالية
                  </button>
                </div>
              )}
            </div>

            {/* 3. Residents Category */}
            <div className="space-y-1">
              <button 
                onClick={() => onToggleSection('residents')}
                className="w-full flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-black text-blue-950 dark:text-white transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>قسم الوحدات والسكان</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedSections.includes('residents') ? '' : '-rotate-90'}`} />
              </button>
              {expandedSections.includes('residents') && (
                <div className="pr-3 flex flex-col gap-1 mt-1 border-r-2 border-blue-200 dark:border-blue-800 mr-2">
                  <button
                    onClick={() => { onNavigateTab('residents'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'residents' ? 'bg-blue-900 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    كشف الوحدات وهيكل العمارة
                  </button>
                </div>
              )}
            </div>

            {/* 4. Services & Communication Category */}
            <div className="space-y-1">
              <button 
                onClick={() => onToggleSection('services')}
                className="w-full flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-black text-blue-950 dark:text-white transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>الخدمات والتواصل</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedSections.includes('services') ? '' : '-rotate-90'}`} />
              </button>
              {expandedSections.includes('services') && (
                <div className="pr-3 flex flex-col gap-1 mt-1 border-r-2 border-purple-200 dark:border-purple-800 mr-2">
                  <button
                    onClick={() => { onNavigateTab('chat'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'chat' ? 'bg-blue-900 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    الدردشة والشكاوى العامة
                  </button>
                  <button
                    onClick={() => { onNavigateTab('maintenance'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'maintenance' ? 'bg-blue-900 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    طلبات الصيانة وفنيي الصيانة
                  </button>
                  <button
                    onClick={() => { onNavigatePollsTab('polls'); onNavigateTab('polls'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'polls' ? 'bg-blue-900 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    القرارات والتصويت
                  </button>
                  <button
                    onClick={() => { onNavigateTab('calendar'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'calendar' ? 'bg-blue-900 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    الأجندة والتقويم
                  </button>
                </div>
              )}
            </div>

            {/* 5. System Settings & Rules */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mt-1 space-y-1">
              {role !== 'ASSISTANT' && (
                <button
                  onClick={() => { onNavigateTab('settings'); onClose(); }}
                  className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold text-right transition cursor-pointer flex items-center justify-between ${
                    activeTab === 'settings' ? 'bg-blue-900 text-white' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>إعدادات النظام</span>
                  <Settings className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => { onOpenRules(); onClose(); }}
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-right transition text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 flex items-center justify-between cursor-pointer"
              >
                <span>تعليمات ونظام إدارة العمارة</span>
                <BookOpen className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              </button>
            </div>

            {/* Font Size Adjustment Section */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mt-1">
              <div className="bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-slate-200">
                    <Type className="w-4 h-4 text-blue-900 dark:text-blue-400" />
                    <span>حجم خط التطبيق</span>
                  </div>
                  <span className="text-[11px] font-mono font-black text-blue-950 dark:text-blue-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                    {fontScale}%
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={handleDecreaseFont}
                    disabled={fontScale <= 76}
                    className="py-1.5 px-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-black border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                    title="تصغير حجم الخط بدرجة صغيرة (-3%)"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                    <span>تصغير A-</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetFont}
                    className="py-1.5 px-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1 transition cursor-pointer shadow-2xs"
                    title="إعادة ضبط الحجم الافتراضي (100%)"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-400" />
                    <span>افتراضي</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleIncreaseFont}
                    disabled={fontScale >= 130}
                    className="py-1.5 px-2 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-black flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                    title="تكبير حجم الخط بدرجة صغيرة (+3%)"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>تكبير A+</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Logout button in drawer */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 space-y-2">
          <div className="flex items-center justify-between px-1 text-[11px] text-slate-500 font-bold">
            <span>{role === 'ASSISTANT' ? 'المساعد الفني' : userName}</span>
            {role !== 'ADMIN' && (
              <span>{role === 'ASSISTANT' ? 'المساعد الفني' : 'ساكن'}</span>
            )}
          </div>
          <button
            onClick={() => { onLogout(); onClose(); }}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 rounded-xl font-black text-xs hover:bg-red-100 dark:hover:bg-red-900/60 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </div>
  );
};
