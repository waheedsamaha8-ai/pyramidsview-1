import React from 'react';
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
  LogOut
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
                <span>الرئيسية (لوحة التحكم)</span>
              </div>
              <ChevronLeft className="w-4 h-4 opacity-70" />
            </button>

            {/* 2. Financial Management Category */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <button
                onClick={() => onToggleSection('finances')}
                className="w-full flex items-center justify-between p-3 text-xs font-black text-slate-800 dark:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5 text-emerald-800 dark:text-emerald-400 font-black">
                  <Wallet className="w-4 h-4" />
                  <span>الإدارة المالية والمصروفات</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expandedSections.includes('finances') ? 'rotate-180' : ''}`} />
              </button>

              {expandedSections.includes('finances') && (
                <div className="px-2 pb-2 space-y-1">
                  <button
                    onClick={() => { onNavigateTab('payments'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold text-right transition flex items-center justify-between cursor-pointer ${
                      activeTab === 'payments' ? 'bg-emerald-700 text-white font-black' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>سجل التحصيلات والاشتراكات</span>
                    <span className="text-[10px] opacity-70">إيرادات</span>
                  </button>
                  <button
                    onClick={() => { onNavigateTab('expenses'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold text-right transition flex items-center justify-between cursor-pointer ${
                      activeTab === 'expenses' ? 'bg-emerald-700 text-white font-black' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>سجل المصروفات وفواتير الصيانة</span>
                    <span className="text-[10px] opacity-70">مصروفات</span>
                  </button>
                  <button
                    onClick={() => { onNavigateTab('summaries'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold text-right transition flex items-center justify-between cursor-pointer ${
                      activeTab === 'summaries' ? 'bg-emerald-700 text-white font-black' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>كشف التحصيل الشهري والحساب الختامي</span>
                    <span className="text-[10px] opacity-70">ملخصات</span>
                  </button>
                  <button
                    onClick={() => { onNavigateTab('debts-report'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold text-right transition flex items-center justify-between cursor-pointer ${
                      activeTab === 'debts-report' ? 'bg-emerald-700 text-white font-black' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>تقرير المديونيات والمستحقات الشامل</span>
                    <span className="text-[10px] opacity-70">تأخيرات</span>
                  </button>
                </div>
              )}
            </div>

            {/* 3. Building & Residents */}
            <button
              onClick={() => { onNavigateTab('residents'); onClose(); }}
              className={`flex items-center justify-between w-full py-3 px-3.5 rounded-2xl text-xs font-black transition cursor-pointer ${
                activeTab === 'residents' ? 'bg-blue-900 text-white shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className={`w-4 h-4 ${activeTab === 'residents' ? 'text-white' : 'text-blue-900 dark:text-blue-400'}`} />
                <span>شقق وسكان العمارة</span>
              </div>
              <ChevronLeft className="w-4 h-4 opacity-70" />
            </button>

            {/* 4. Community & Services Category */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <button
                onClick={() => onToggleSection('services')}
                className="w-full flex items-center justify-between p-3 text-xs font-black text-slate-800 dark:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5 text-indigo-900 dark:text-indigo-400 font-black">
                  <MessageSquare className="w-4 h-4" />
                  <span>الخدمات ومجتمع العمارة</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expandedSections.includes('services') ? 'rotate-180' : ''}`} />
              </button>

              {expandedSections.includes('services') && (
                <div className="px-2 pb-2 space-y-1">
                  <button
                    onClick={() => { onNavigateTab('maintenance'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold text-right transition flex items-center justify-between cursor-pointer ${
                      activeTab === 'maintenance' ? 'bg-indigo-900 text-white font-black' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>الصيانة ودليل الفنيين</span>
                    <span className="text-[10px] opacity-70">صيانة</span>
                  </button>
                  <button
                    onClick={() => { onNavigateTab('chat'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold text-right transition flex items-center justify-between cursor-pointer ${
                      activeTab === 'chat' ? 'bg-indigo-900 text-white font-black' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>غرفة دردشة ونقاشات الجيران</span>
                    <span className="text-[10px] opacity-70">تواصل</span>
                  </button>
                  <button
                    onClick={() => { onNavigateTab('polls'); onNavigatePollsTab('polls'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold text-right transition flex items-center justify-between cursor-pointer ${
                      activeTab === 'polls' ? 'bg-indigo-900 text-white font-black' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>القرارات الإدارية واستبيانات التصويت</span>
                    <span className="text-[10px] opacity-70">تصويت</span>
                  </button>
                  <button
                    onClick={() => { onNavigateTab('calendar'); onClose(); }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold text-right transition flex items-center justify-between cursor-pointer ${
                      activeTab === 'calendar' ? 'bg-indigo-900 text-white font-black' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>التقويم ومواعيد الصيانة</span>
                    <span className="text-[10px] opacity-70">جدول</span>
                  </button>
                </div>
              )}
            </div>

            {/* 5. System Settings (Admin only) */}
            {role === 'ADMIN' && (
              <button
                onClick={() => { onNavigateTab('settings'); onClose(); }}
                className={`flex items-center justify-between w-full py-3 px-3.5 rounded-2xl text-xs font-black transition cursor-pointer ${
                  activeTab === 'settings' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span>إعدادات النظام والاتحاد</span>
                </div>
                <ChevronLeft className="w-4 h-4 opacity-70" />
              </button>
            )}

            {/* 6. Building Rules & Regulations Link */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mt-1">
              <button
                onClick={() => { onOpenRules(); onClose(); }}
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-right transition text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 flex items-center justify-between cursor-pointer"
              >
                <span>تعليمات ونظام إدارة العمارة</span>
                <BookOpen className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              </button>
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
