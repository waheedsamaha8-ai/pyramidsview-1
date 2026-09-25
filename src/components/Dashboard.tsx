import React from 'react';
import { 
  Building2, 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Users, 
  MessageCircle, 
  Wrench, 
  HardHat, 
  Scale, 
  AlertTriangle, 
  Vote, 
  Calendar 
} from 'lucide-react';
import { 
  Resident, 
  Payment, 
  Expense, 
  AppConfig, 
  UserRole, 
  MaintenanceRequest, 
  Craftsman, 
  AdminDecision, 
  PublicComplaint, 
  Poll, 
  BuildingEvent, 
  ChatMessage 
} from '../types';
import { ResidentAccountStatement } from './ResidentAccountStatement';
import { isSameFlatNumber } from '../utils/buildingStructure';

interface DashboardProps {
  currentYear: number;
  setCurrentYear: React.Dispatch<React.SetStateAction<number>>;
  currentMonth: number;
  setCurrentMonth: React.Dispatch<React.SetStateAction<number>>;
  viewMode: 'year' | 'month';
  setViewMode: React.Dispatch<React.SetStateAction<'year' | 'month'>>;
  residents: Resident[];
  payments: Payment[];
  expenses: Expense[];
  config: AppConfig;
  role: UserRole;
  currentResidentObj?: Resident;
  reportResidentId: string;
  setReportResidentId: (id: string) => void;
  unitActivityStats: {
    totalUnits: number;
    breakdown: Array<{ activity: string; count: number; percentage: number }>;
  };
  getActivityTheme: (activity: string, index: number) => {
    barBg: string;
    badgeBg: string;
    dotBg: string;
    textColor: string;
  };
  totalReceived: number;
  totalSpent: number;
  currentSafeBalance: number;
  messages: ChatMessage[];
  maintenanceRequests: MaintenanceRequest[];
  craftsmen: Craftsman[];
  decisions: AdminDecision[];
  complaints: PublicComplaint[];
  polls: Poll[];
  events: BuildingEvent[];
  onNavigateTab: (tab: any) => void;
  onSetChatSubTab: (subTab: 'room' | 'complaints') => void;
  onSetMaintenanceSubTab: (subTab: 'requests' | 'directory') => void;
  onSetPollsSubTab: (subTab: 'polls' | 'decisions') => void;
  onSelectActivityModal: (activity: string) => void;
  onPreviewImage: (url: string) => void;
}

const monthNamesArabic = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export const Dashboard: React.FC<DashboardProps> = ({
  currentYear,
  setCurrentYear,
  currentMonth,
  setCurrentMonth,
  viewMode,
  setViewMode,
  residents,
  payments,
  expenses,
  config,
  role,
  currentResidentObj,
  reportResidentId,
  setReportResidentId,
  unitActivityStats,
  getActivityTheme,
  totalReceived,
  totalSpent,
  currentSafeBalance,
  messages,
  maintenanceRequests,
  craftsmen,
  decisions,
  complaints,
  polls,
  events,
  onNavigateTab,
  onSetChatSubTab,
  onSetMaintenanceSubTab,
  onSetPollsSubTab,
  onSelectActivityModal,
  onPreviewImage,
}) => {
  return (
    <div className="space-y-4 animate-fade-in text-right">
      
      {/* Filter Toggle Year/Month */}
      <div className="flex flex-col items-center justify-center space-y-2 py-2">
        <div className="flex items-center gap-6 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm">
          <button 
            type="button"
            onClick={() => {
              if (viewMode === 'year') {
                setCurrentYear(prev => prev - 1);
              } else {
                if (currentMonth === 0) {
                  setCurrentMonth(11);
                  setCurrentYear(prev => prev - 1);
                } else {
                  setCurrentMonth(prev => prev - 1);
                }
              }
            }}
            className="p-1.5 hover:bg-white/50 rounded-lg text-slate-600 hover:text-blue-900 transition cursor-pointer"
            title="السابق"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div 
            onClick={() => setViewMode(prev => prev === 'year' ? 'month' : 'year')}
            className="flex flex-col items-center cursor-pointer select-none min-w-[120px]"
          >
            <span className="text-[10px] text-slate-400 font-extrabold">{viewMode === 'year' ? 'السنة المالية' : 'الفلتر الشهري'}</span>
            <span className="text-xl font-black text-blue-950">
              {viewMode === 'year' ? currentYear : `${monthNamesArabic[currentMonth]} ${currentYear}`}
            </span>
          </div>

          <button 
            type="button"
            onClick={() => {
              if (viewMode === 'year') {
                setCurrentYear(prev => prev + 1);
              } else {
                if (currentMonth === 11) {
                  setCurrentMonth(0);
                  setCurrentYear(prev => prev + 1);
                } else {
                  setCurrentMonth(prev => prev + 1);
                }
              }
            }}
            className="p-1.5 hover:bg-white/50 rounded-lg text-slate-600 hover:text-blue-900 transition cursor-pointer"
            title="التالي"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[9px] text-slate-400 font-bold">انقر على الرقم للتبديل بين الفلتر السنوي والشهري</p>
      </div>
      
      {/* Interactive Unit Activities Distribution Bar & Statistical Counters */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-100 shadow-xs space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center shrink-0">
              <Building2 className="w-4.5 h-4.5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-blue-950 leading-tight">
                إحصائيات العمارة
              </h3>
              <p className="text-[10px] text-slate-400 font-bold">
                عداد تفاعلي يتغير حسب النشاط
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50/80 rounded-xl border border-blue-100 text-xs font-black text-blue-950 shrink-0 dir-rtl">
            <span className="text-[10px] text-slate-500 font-extrabold">إجمالي العمارة:</span>
            <span className="text-blue-900 font-black">{unitActivityStats.totalUnits} وحدة</span>
          </div>
        </div>

        {/* Dynamic Stacked Bar */}
        <div className="relative pt-0.5">
          <div className="flex h-4 sm:h-5 w-full rounded-xl overflow-hidden bg-slate-100 p-0.5 gap-0.5 border border-slate-200/70 shadow-xs">
            {unitActivityStats.breakdown.map((item, idx) => {
              const theme = getActivityTheme(item.activity, idx);
              return (
                <div
                  key={item.activity}
                  style={{ width: `${Math.max(item.percentage, 1.5)}%` }}
                  className={`${theme.barBg} h-full rounded-md transition-all duration-500 hover:brightness-110 cursor-pointer relative group`}
                  title={`${item.activity}: ${item.count} وحدة (${item.percentage.toFixed(1)}%)`}
                  onClick={() => onSelectActivityModal(item.activity)}
                >
                  <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-30 pointer-events-none">
                    <div className="bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg whitespace-nowrap">
                      {item.activity}: {item.count} وحدة ({item.percentage.toFixed(1)}%)
                    </div>
                    <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-1"></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Counters List */}
        <div className="flex flex-col gap-1.5 pt-1">
          {unitActivityStats.breakdown.map((item, idx) => {
            const theme = getActivityTheme(item.activity, idx);
            return (
              <div
                key={item.activity}
                onClick={() => onSelectActivityModal(item.activity)}
                className={`px-3 py-1.5 sm:py-2 rounded-xl border transition-all cursor-pointer hover:shadow-xs hover:scale-[1.005] active:scale-[0.99] flex items-center justify-between w-full min-h-0 gap-2 ${theme.badgeBg}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full ${theme.dotBg} shrink-0`} />
                  <span className="text-xs font-black truncate">{item.activity}</span>
                  <span className="text-[10px] font-extrabold opacity-75 bg-white/60 px-1.5 py-0.5 rounded-md border border-black/5">
                    {item.percentage.toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0 dir-rtl">
                  <span className="text-xs sm:text-sm font-black tracking-tight">{item.count}</span>
                  <span className="text-[10px] font-extrabold opacity-80">وحدة</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* High level financial stats metrics */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div 
          onClick={() => onNavigateTab('payments')}
          className="bg-white rounded-2xl px-2.5 py-3 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-blue-200 hover:shadow-md transition active:scale-[0.99]"
        >
          <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-5 h-5 stroke-[2]" />
          </div>
          <div className="text-center">
            <span className="text-[9px] text-slate-400 font-extrabold block">الإيرادات</span>
            <span className="text-sm sm:text-lg font-black text-emerald-600 leading-tight">
              {Math.round(totalReceived)} <span className="text-[10px]">ج.م</span>
            </span>
          </div>
        </div>

        <div 
          onClick={() => onNavigateTab('expenses')}
          className="bg-white rounded-2xl px-2.5 py-3 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-blue-200 hover:shadow-md transition active:scale-[0.99]"
        >
          <div className="w-9 h-9 bg-red-50 text-red-500 rounded-xl flex items-center justify-center">
            <TrendingDown className="w-5 h-5 stroke-[2]" />
          </div>
          <div className="text-center">
            <span className="text-[9px] text-slate-400 font-extrabold block">المصروفات</span>
            <span className="text-sm sm:text-lg font-black text-red-500 leading-tight">
              {Math.round(totalSpent)} <span className="text-[10px]">ج.م</span>
            </span>
          </div>
        </div>

        <div 
          onClick={() => onNavigateTab('summaries')}
          className="bg-white rounded-2xl px-2.5 py-3 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-blue-200 hover:shadow-md transition active:scale-[0.99]"
        >
          <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
            <Wallet className="w-5 h-5 stroke-[2]" />
          </div>
          <div className="text-center">
            <span className="text-[9px] text-slate-400 font-extrabold block">الرصيد</span>
            <span className={`text-sm sm:text-lg font-black leading-tight ${currentSafeBalance >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
              {Math.round(currentSafeBalance)} <span className="text-[10px]">ج.م</span>
            </span>
          </div>
        </div>
      </div>

      {/* Residents Directory Link */}
      <div 
        onClick={() => onNavigateTab('residents')}
        className="bg-white rounded-2xl px-4 py-2.5 border border-slate-100 shadow-xs flex items-center justify-between cursor-pointer hover:border-blue-200 hover:shadow-md transition active:scale-[0.99] leading-[25px]"
      >
        <div className="text-right">
          <span className="text-[10px] text-slate-400 font-extrabold block mb-0.5">كشف ودليل الوحدات والسكان (بيانات وأرقام الهواتف)</span>
          <span className="text-xl font-black text-slate-900">{residents.length} <span className="text-xs">وحدة بعمارة الاتحاد</span></span>
        </div>
        <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center">
          <Users className="w-5 h-5 stroke-[1.5]" />
        </div>
      </div>

      {/* Quick Access Communication & Services Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-slate-400 font-extrabold">الوصول السريع للخدمات والمجتمع</span>
          <h3 className="text-xs font-black text-slate-900">قسم التواصل والخدمات</h3>
        </div>

        {/* Row 1: Residents Chat spanning full width */}
        <button
          type="button"
          onClick={() => {
            onSetChatSubTab('room');
            onNavigateTab('chat');
          }}
          className="w-full bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-100 shadow-xs flex items-center justify-between cursor-pointer hover:border-indigo-300 hover:shadow-md transition active:scale-[0.99] group relative"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition shrink-0">
              <MessageCircle className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="text-right">
              <span className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-indigo-600 transition block">
                دردشة السكان
              </span>
              <span className="text-[8px] leading-[15px] text-slate-400 font-bold block">
                غرفة النقاش والمحادثات المباشرة بين سكان وملاك العمارة والمساعد الفني
              </span>
            </div>
          </div>

          {messages.length > 0 ? (
            <span className="text-[9px] sm:text-[10px] font-black px-2.5 py-1 bg-indigo-100/70 text-indigo-700 rounded-full shrink-0">
              {messages.length} رسالة
            </span>
          ) : (
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 px-2.5 py-1 bg-slate-50 rounded-full shrink-0">
              غرفة المناقشة
            </span>
          )}
        </button>

        {/* Grid of Service Buttons */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          
          {/* 1. Maintenance Requests */}
          <button
            type="button"
            onClick={() => {
              onSetMaintenanceSubTab('requests');
              onNavigateTab('maintenance');
            }}
            className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer hover:border-amber-300 hover:shadow-md transition active:scale-[0.98] group relative"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition">
              <Wrench className="w-5 h-5 stroke-[2]" />
            </div>
            <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 group-hover:text-amber-600 transition leading-tight">
              طلبات الصيانة
            </span>
            {maintenanceRequests.filter(r => r.status !== 'COMPLETED' && (r as any).status !== 'DONE').length > 0 ? (
              <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-amber-100/70 text-amber-700 rounded-full">
                {maintenanceRequests.filter(r => r.status !== 'COMPLETED' && (r as any).status !== 'DONE').length} قيد المتابعة
              </span>
            ) : (
              <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">
                متابعة وإضافة
              </span>
            )}
          </button>

          {/* 2. Craftsmen Directory */}
          <button
            type="button"
            onClick={() => {
              onSetMaintenanceSubTab('directory');
              onNavigateTab('maintenance');
            }}
            className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer hover:border-blue-300 hover:shadow-md transition active:scale-[0.98] group relative"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition">
              <HardHat className="w-5 h-5 stroke-[2]" />
            </div>
            <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 group-hover:text-blue-600 transition leading-tight">
              دليل الصنايعية
            </span>
            {craftsmen.length > 0 ? (
              <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-blue-100/70 text-blue-700 rounded-full">
                {craftsmen.length} صنايعي معتمد
              </span>
            ) : (
              <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">
                دليل الفنيين
              </span>
            )}
          </button>

          {/* 3. Administrative Decisions */}
          <button
            type="button"
            onClick={() => {
              onSetPollsSubTab('decisions');
              onNavigateTab('polls');
            }}
            className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer hover:border-emerald-300 hover:shadow-md transition active:scale-[0.98] group relative"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition">
              <Scale className="w-5 h-5 stroke-[2]" />
            </div>
            <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 group-hover:text-emerald-600 transition leading-tight">
              القرارات الإدارية
            </span>
            {decisions.length > 0 ? (
              <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-emerald-100/70 text-emerald-700 rounded-full">
                {decisions.length} قرار إداري
              </span>
            ) : (
              <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">
                قرارات الإدارة
              </span>
            )}
          </button>

          {/* 4. Complaints & Suggestions */}
          <button
            type="button"
            onClick={() => {
              onSetChatSubTab('complaints');
              onNavigateTab('chat');
            }}
            className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer hover:border-rose-300 hover:shadow-md transition active:scale-[0.98] group relative"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition">
              <AlertTriangle className="w-5 h-5 stroke-[2]" />
            </div>
            <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 group-hover:text-rose-600 transition leading-tight">
              الشكاوى والمقترحات
            </span>
            {complaints.length > 0 ? (
              <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-rose-100/70 text-rose-700 rounded-full">
                {complaints.length} شكوى ومقترح
              </span>
            ) : (
              <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">
                صندوق المقترحات
              </span>
            )}
          </button>

          {/* 5. Voting & Polls */}
          <button
            type="button"
            onClick={() => {
              onSetPollsSubTab('polls');
              onNavigateTab('polls');
            }}
            className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer hover:border-purple-300 hover:shadow-md transition active:scale-[0.98] group relative"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition">
              <Vote className="w-5 h-5 stroke-[2]" />
            </div>
            <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 group-hover:text-purple-600 transition leading-tight">
              التصويت والاستبيانات
            </span>
            {polls.length > 0 ? (
              <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-purple-100/70 text-purple-700 rounded-full">
                {polls.filter(p => p.status === 'ACTIVE').length} استبيان مفتوح
              </span>
            ) : (
              <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">
                استطلاعات الرأي
              </span>
            )}
          </button>

          {/* 6. Agenda & Calendar */}
          <button
            type="button"
            onClick={() => {
              onNavigateTab('calendar');
            }}
            className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer hover:border-cyan-300 hover:shadow-md transition active:scale-[0.98] group relative"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition">
              <Calendar className="w-5 h-5 stroke-[2]" />
            </div>
            <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 group-hover:text-cyan-600 transition leading-tight">
              الأجندة والتقويم
            </span>
            {events.length > 0 ? (
              <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-cyan-100/70 text-cyan-700 rounded-full">
                {events.length} موعد وحدث
              </span>
            ) : (
              <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">
                مواعيد العمارة
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Resident Account Statement */}
      {role === 'RESIDENT' ? (
        <div className="pt-2">
          <ResidentAccountStatement
            resident={currentResidentObj}
            residents={residents}
            payments={payments}
            config={config}
            currentYear={currentYear}
            isResidentOnly={true}
            onPreviewImage={onPreviewImage}
            onOpenResidentsList={() => onNavigateTab('residents')}
          />
        </div>
      ) : (
        <div className="pt-2">
          <ResidentAccountStatement
            resident={residents.find(r => r.id === reportResidentId) || residents.find(r => isSameFlatNumber(r.flatNumber, reportResidentId)) || residents[0]}
            residents={residents}
            payments={payments}
            config={config}
            currentYear={currentYear}
            isResidentOnly={false}
            onSelectResidentId={(id) => setReportResidentId(id)}
            onSelectFlatNumber={(flatNum) => {
              const found = residents.find(r => isSameFlatNumber(r.flatNumber, flatNum) || String(r.flatNumber) === String(flatNum));
              if (found) setReportResidentId(found.id);
            }}
            onPreviewImage={onPreviewImage}
            onOpenResidentsList={() => onNavigateTab('residents')}
          />
        </div>
      )}

    </div>
  );
};
