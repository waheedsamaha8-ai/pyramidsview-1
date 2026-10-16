import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  CheckCircle2, 
  Check, 
  Calculator, 
  Plus, 
  Trash2, 
  Edit, 
  Lock, 
  Unlock, 
  Play, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle, 
  Sparkles, 
  Filter, 
  X, 
  DollarSign, 
  Wallet,
  Clock
} from 'lucide-react';
import { AppConfig, AccountingPeriod, Payment, Expense, Resident } from '../../types';
import { 
  computePeriodClosingSummary, 
  parseYearMonth, 
  getLastDayOfMonth, 
  formatPeriodDateRange, 
  arabicMonthNames 
} from '../../utils/periodUtils';

interface SettingsGeneralSectionProps {
  config: AppConfig;
  isAdmin: boolean;
  accountingStartDate: string;
  setAccountingStartDate: (date: string) => void;
  activityFees: Record<string, number>;
  setActivityFees: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  defaultFeesMap: Record<string, number>;
  handleResetDefaultActivityFees: () => void;
  savedSuccess: boolean;
  handleSaveAccountingSettings: (e?: React.FormEvent) => void;
  getElapsedMonths: () => number;
  payments?: Payment[];
  expenses?: Expense[];
  residents?: Resident[];
  onSaveConfig?: (updatedConfig: AppConfig) => void;
}

export const SettingsGeneralSection: React.FC<SettingsGeneralSectionProps> = ({
  config,
  isAdmin,
  accountingStartDate,
  setAccountingStartDate,
  activityFees,
  setActivityFees,
  defaultFeesMap,
  handleResetDefaultActivityFees,
  savedSuccess,
  handleSaveAccountingSettings,
  getElapsedMonths,
  payments = [],
  expenses = [],
  residents = [],
  onSaveConfig,
}) => {
  // Accounting Periods State
  const periods = useMemo(() => {
    return Array.isArray(config.accountingPeriods) ? config.accountingPeriods : [];
  }, [config.accountingPeriods]);

  const activePeriodId = config.activePeriodId || 'ALL';

  const [expandedClosingId, setExpandedClosingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<AccountingPeriod | null>(null);

  // Form states for adding/editing a period
  const [formName, setFormName] = useState('');
  const [formStartYear, setFormStartYear] = useState('2022');
  const [formStartMonth, setFormStartMonth] = useState('01');
  const [formEndYear, setFormEndYear] = useState('2023');
  const [formEndMonth, setFormEndMonth] = useState('12');
  const [formNotes, setFormNotes] = useState('');
  const [formActivateNow, setFormActivateNow] = useState(true);
  const [periodActionToast, setPeriodActionToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setPeriodActionToast(msg);
    setTimeout(() => setPeriodActionToast(null), 4500);
  };

  const handleOpenAddPeriod = () => {
    setEditingPeriod(null);
    setFormName('فترة جديدة');
    setFormStartYear('2024');
    setFormStartMonth('01');
    setFormEndYear('2026');
    setFormEndMonth('12');
    setFormNotes('');
    setFormActivateNow(true);
    setShowAddModal(true);
  };

  const handleOpenEditPeriod = (p: AccountingPeriod) => {
    setEditingPeriod(p);
    setFormName(p.name);
    const start = parseYearMonth(p.startDate) || { year: 2022, month: 1 };
    const end = parseYearMonth(p.endDate) || { year: 2023, month: 12 };
    setFormStartYear(String(start.year));
    setFormStartMonth(String(start.month).padStart(2, '0'));
    setFormEndYear(String(end.year));
    setFormEndMonth(String(end.month).padStart(2, '0'));
    setFormNotes(p.notes || '');
    setFormActivateNow(p.id === activePeriodId);
    setShowAddModal(true);
  };

  const handleSavePeriod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !onSaveConfig) return;

    const startM = formStartMonth.padStart(2, '0');
    const endM = formEndMonth.padStart(2, '0');
    const startY = formStartYear.trim();
    const endY = formEndYear.trim();

    // Start date is always the 1st of the starting month
    const startDate = `${startY}-${startM}-01`;
    // End date is always the exact last day of the ending month (e.g. 31 for Dec/Jan, 30 for Apr/Nov, 28/29 for Feb)
    const lastDay = getLastDayOfMonth(endY, formEndMonth);
    const endDate = `${endY}-${endM}-${String(lastDay).padStart(2, '0')}`;

    const startMonthIdx = Math.max(0, Math.min(11, parseInt(formStartMonth, 10) - 1));
    const endMonthIdx = Math.max(0, Math.min(11, parseInt(formEndMonth, 10) - 1));
    const autoPeriodName = `فترة ${arabicMonthNames[startMonthIdx]} ${startY} - ${arabicMonthNames[endMonthIdx]} ${endY}`;
    const periodName = formName.trim() || autoPeriodName;

    let updatedPeriods = [...periods];
    let targetId = editingPeriod?.id || `period_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;

    if (editingPeriod) {
      updatedPeriods = updatedPeriods.map(p => {
        if (p.id === editingPeriod.id) {
          return {
            ...p,
            name: periodName,
            startDate,
            endDate,
            notes: formNotes.trim(),
          };
        }
        return p;
      });
    } else {
      const newP: AccountingPeriod = {
        id: targetId,
        name: periodName,
        startDate,
        endDate,
        notes: formNotes.trim(),
        isClosed: false,
      };
      updatedPeriods.push(newP);
    }

    const nextActiveId = formActivateNow ? targetId : (activePeriodId === editingPeriod?.id ? targetId : activePeriodId);

    const updatedConfig: AppConfig = {
      ...config,
      accountingPeriods: updatedPeriods,
      activePeriodId: nextActiveId,
      accountingStartDate: formActivateNow ? startDate : (config.accountingStartDate || startDate),
    };

    onSaveConfig(updatedConfig);
    setShowAddModal(false);
    showToast(formActivateNow 
      ? `تم حفظ وتفعيل "${formName}" بنجاح!` 
      : `تم حفظ فترة "${formName}" بنجاح.`
    );
  };

  const handleActivatePeriod = (periodId: string) => {
    if (!isAdmin || !onSaveConfig) return;
    const target = periods.find(p => p.id === periodId);
    if (!target) return;

    const updatedConfig: AppConfig = {
      ...config,
      activePeriodId: periodId,
      accountingStartDate: target.startDate,
    };
    onSaveConfig(updatedConfig);
    setAccountingStartDate(target.startDate);
    showToast(`تم تفعيل "${target.name}"! التطبيق يعرض الآن بيانات هذه الفترة فقط.`);
  };

  const handleShowAllPeriods = () => {
    if (!isAdmin || !onSaveConfig) return;
    const updatedConfig: AppConfig = {
      ...config,
      activePeriodId: 'ALL',
    };
    onSaveConfig(updatedConfig);
    showToast('تم إلغاء التقييد: يتم الآن عرض كافة البيانات لجميع الفترات والسنوات.');
  };

  const handleDeletePeriod = (periodId: string) => {
    if (!isAdmin || !onSaveConfig) return;
    const target = periods.find(p => p.id === periodId);
    if (!target) return;

    const confirmMsg = `هل أنت متأكد من حذف فترة "${target.name}"؟ لن يتم حذف التحصيلات أو المصروفات المسجلة.`;
    if (!window.confirm(confirmMsg)) return;

    const updatedPeriods = periods.filter(p => p.id !== periodId);
    const nextActiveId = activePeriodId === periodId ? 'ALL' : activePeriodId;

    const updatedConfig: AppConfig = {
      ...config,
      accountingPeriods: updatedPeriods,
      activePeriodId: nextActiveId,
    };
    onSaveConfig(updatedConfig);
    showToast(`تم حذف فترة "${target.name}".`);
  };

  const handleToggleClosePeriod = (period: AccountingPeriod) => {
    if (!isAdmin || !onSaveConfig) return;

    const isCurrentlyClosed = Boolean(period.isClosed);
    let closingSummary = period.closingSummary;

    if (!isCurrentlyClosed) {
      // Compute live summary snapshot to record
      const summary = computePeriodClosingSummary(
        period,
        payments,
        expenses,
        residents,
        config.defaultMonthlyFee,
        config.activityDefaultFees
      );
      closingSummary = {
        ...summary,
        closedAt: new Date().toISOString(),
      };
    }

    const updatedPeriods = periods.map(p => {
      if (p.id === period.id) {
        return {
          ...p,
          isClosed: !isCurrentlyClosed,
          closingDate: !isCurrentlyClosed ? new Date().toISOString().split('T')[0] : undefined,
          closingSummary: !isCurrentlyClosed ? closingSummary : undefined,
        };
      }
      return p;
    });

    const updatedConfig: AppConfig = {
      ...config,
      accountingPeriods: updatedPeriods,
    };
    onSaveConfig(updatedConfig);
    showToast(!isCurrentlyClosed 
      ? `تم اعتماد الإقفال الختامي لفترة "${period.name}" بنجاح 🔒` 
      : `تم إلغاء إقفال فترة "${period.name}" 🔓`
    );
  };

  const handleAddDefaultTemplatePeriods = () => {
    if (!isAdmin || !onSaveConfig) return;

    const p1: AccountingPeriod = {
      id: `period_${Date.now()}_1`,
      name: 'فترة 2022 - 2023',
      startDate: '2022-01-01',
      endDate: '2023-12-31',
      notes: 'الفترة المحاسبية المالية الأولى (من يناير 2022 إلى ديسمبر 2023)',
      isClosed: true,
      closingDate: '2023-12-31',
    };

    const p2: AccountingPeriod = {
      id: `period_${Date.now()}_2`,
      name: 'فترة 2024 - 2026',
      startDate: '2024-01-01',
      endDate: '2026-12-31',
      notes: 'الفترة المحاسبية الحالية (من يناير 2024 إلى ديسمبر 2026)',
      isClosed: false,
    };

    const updatedPeriods = [...periods, p1, p2];
    const updatedConfig: AppConfig = {
      ...config,
      accountingPeriods: updatedPeriods,
      activePeriodId: p2.id,
      accountingStartDate: p2.startDate,
    };
    onSaveConfig(updatedConfig);
    setAccountingStartDate(p2.startDate);
    showToast('تمت إضافة فترتي (2022-2023) و (2024-2026) وتفعيل الفترة الحالية بنجاح!');
  };

  const currentActivePeriod = useMemo(() => {
    if (!activePeriodId || activePeriodId === 'ALL') return null;
    return periods.find(p => p.id === activePeriodId) || null;
  }, [periods, activePeriodId]);

  return (
    <div className="space-y-4 text-right">
      {/* Toast Feedback */}
      {periodActionToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center justify-between animate-fade-in shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{periodActionToast}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setPeriodActionToast(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-black px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Card 1: Accounting Periods System */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 gap-2">
          <div className="text-right">
            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center shadow-3xs">
                <Calendar className="w-4 h-4" />
              </span>
              <span>نظام الفترات المحاسبية واحتساب المديونيات والختامي</span>
            </h3>
            <p className="text-xs text-slate-500 font-bold mt-1 leading-relaxed">
              يمكنك إنشاء فترات محاسبية محددة من تاريخ إلى تاريخ (مثال: من 2022/1 إلى 2023/12 مع احتساب الختامي، وفترة أخرى من 2024/1 إلى 2026/12). عند تفعيل أي فترة، يقوم التطبيق تلقائياً بعرض بيانات وتحصيلات ومصروفات تلك الفترة فقط وإخفاء الفترات الأخرى.
            </p>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <button
                type="button"
                onClick={handleOpenAddPeriod}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-900 hover:bg-blue-950 active:scale-95 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة فترة محاسبية</span>
              </button>
            </div>
          )}
        </div>

        {/* Active Period Status Bar */}
        <div className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition ${
          currentActivePeriod 
            ? 'bg-gradient-to-r from-blue-50 via-indigo-50/60 to-emerald-50/60 border-blue-200' 
            : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            {currentActivePeriod ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>الفترة المحاسبية النشطة حالياً:</span>
                <span className="font-black text-blue-950 bg-white px-2 py-0.5 rounded-md border border-blue-200">
                  {currentActivePeriod.name}
                </span>
                <span className="text-[11px] font-mono font-bold text-slate-600 bg-white/80 px-2 py-0.5 rounded-md border border-slate-200" dir="ltr">
                  {currentActivePeriod.startDate} ➔ {currentActivePeriod.endDate}
                </span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                <span>الوضع الحالي:</span>
                <span className="font-black text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  عرض جميع الفترات والبيانات بالكامل (بدون تقييد)
                </span>
              </>
            )}
          </div>

          {isAdmin && currentActivePeriod && (
            <button
              type="button"
              onClick={handleShowAllPeriods}
              className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg text-xs font-black transition cursor-pointer self-start sm:self-auto shadow-3xs"
              title="إلغاء حصر الفترات وعرض كافة البيانات لجميع السنوات"
            >
              عرض الكل (إلغاء التقييد)
            </button>
          )}
        </div>

        {/* Empty State with Template Generator */}
        {periods.length === 0 && (
          <div className="text-center py-6 px-4 bg-slate-50/70 border border-dashed border-slate-300 rounded-2xl space-y-3">
            <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <h4 className="text-xs font-black text-slate-800">لم يتم إنشاء أي فترات محاسبية بعد</h4>
              <p className="text-[11px] text-slate-500 font-bold max-w-md mx-auto leading-relaxed">
                يمكنك إنشاء فترات مخصصة أو استخدام الفترات النموذجية المقترحة (2022 - 2023) و (2024 - 2026) لتنظيم الحسابات والختامي بسهولة.
              </p>
            </div>
            {isAdmin && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAddDefaultTemplatePeriods}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>إنشاء فترتي (2022-2023) و (2024-2026) تلقائياً</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Periods List */}
        {periods.length > 0 && (
          <div className="space-y-3">
            {periods.map((p) => {
              const isActive = p.id === activePeriodId;
              const isClosingExpanded = expandedClosingId === p.id;
              const summary = computePeriodClosingSummary(
                p,
                payments,
                expenses,
                residents,
                config.defaultMonthlyFee,
                config.activityDefaultFees
              );

              return (
                <div 
                  key={p.id}
                  className={`rounded-2xl border transition p-3.5 sm:p-4 space-y-3 ${
                    isActive 
                      ? 'bg-blue-50/50 border-blue-300 shadow-sm ring-1 ring-blue-400/20' 
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Period Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="space-y-1 text-right">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                          <span>{p.name}</span>
                        </h4>
                        
                        {isActive && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md text-[10px] font-black flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                            <span>الفترة النشطة حالياً</span>
                          </span>
                        )}

                        {p.isClosed && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-[10px] font-black flex items-center gap-1">
                            <Lock className="w-3 h-3 text-slate-600" />
                            <span>مقفلة ختامياً</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-bold flex-wrap">
                        <span className="flex items-center gap-1.5 bg-blue-50/70 border border-blue-200/60 px-2 py-0.5 rounded-lg text-blue-950 font-bold">
                          <Calendar className="w-3.5 h-3.5 text-blue-900" />
                          <span>{formatPeriodDateRange(p.startDate, p.endDate)}</span>
                        </span>
                        <span>•</span>
                        <span className="text-blue-900 font-black">({summary.monthsCount} شهر)</span>
                        {p.notes && (
                          <>
                            <span>•</span>
                            <span className="text-slate-400 truncate max-w-xs">{p.notes}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions on this period */}
                    {isAdmin && (
                      <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
                        {!isActive ? (
                          <button
                            type="button"
                            onClick={() => handleActivatePeriod(p.id)}
                            className="px-3 py-1.5 bg-blue-900 hover:bg-blue-950 active:scale-95 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-3xs flex items-center gap-1"
                            title="تفعيل هذه الفترة لعرض بياناتها فقط في التطبيق"
                          >
                            <Play className="w-3 h-3" />
                            <span>تفعيل الفترة</span>
                          </button>
                        ) : (
                          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black">
                            مفعلة ✓
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => setExpandedClosingId(isClosingExpanded ? null : p.id)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1 border border-slate-200"
                          title="عرض الحساب الختامي والأرقام المالية للفترة"
                        >
                          <Wallet className="w-3.5 h-3.5 text-blue-900" />
                          <span>الختامي</span>
                          {isClosingExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEditPeriod(p)}
                          className="p-1.5 text-slate-600 hover:text-blue-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title="تعديل الفترة"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeletePeriod(p.id)}
                          className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="حذف الفترة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Financial Closing Box (الختامي) */}
                  {isClosingExpanded && (
                    <div className="p-3.5 bg-gradient-to-b from-slate-50 to-white rounded-xl border border-slate-200 space-y-3 animate-fade-in text-right">
                      <div className="flex items-center justify-between border-b pb-2">
                        <h5 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                          <Calculator className="w-4 h-4 text-blue-900" />
                          <span>الحساب الختامي المالي لـ ({p.name})</span>
                        </h5>
                        <div className="flex items-center gap-2">
                          {p.isClosed && (
                            <span className="text-[10px] text-slate-500 font-bold">
                              تم الإقفال بتاريخ: {p.closingDate || 'معتمد'}
                            </span>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleToggleClosePeriod(p)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1 shadow-3xs ${
                                p.isClosed 
                                  ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300' 
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                            >
                              {p.isClosed ? (
                                <>
                                  <Unlock className="w-3 h-3" />
                                  <span>إلغاء إقفال الفترة</span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3" />
                                  <span>اعتماد الإقفال الختامي 🔒</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Financial KPI Numbers Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
                        <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-right">
                          <span className="text-[10px] font-bold text-emerald-800 block">إجمالي التحصيلات الفعلية</span>
                          <span className="text-sm font-black text-emerald-700">
                            {summary.totalCollections.toLocaleString()} ج.م
                          </span>
                        </div>

                        <div className="p-2.5 bg-rose-50/80 border border-rose-200 rounded-xl text-right">
                          <span className="text-[10px] font-bold text-rose-800 block">إجمالي المصروفات المنصرفة</span>
                          <span className="text-sm font-black text-rose-700">
                            {summary.totalExpenses.toLocaleString()} ج.م
                          </span>
                        </div>

                        <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl text-right">
                          <span className="text-[10px] font-bold text-blue-800 block">صافي الرصيد الختامي</span>
                          <span className={`text-sm font-black ${
                            summary.netBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'
                          }`}>
                            {summary.netBalance.toLocaleString()} ج.م
                          </span>
                        </div>

                        <div className="p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-right">
                          <span className="text-[10px] font-bold text-indigo-800 block">إجمالي المستحق المطلوب</span>
                          <span className="text-sm font-black text-indigo-900">
                            {summary.totalExpectedDues.toLocaleString()} ج.م
                          </span>
                        </div>

                        <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-right">
                          <span className="text-[10px] font-bold text-amber-800 block">إجمالي متبقي المديونيات</span>
                          <span className="text-sm font-black text-amber-700">
                            {summary.totalDebt.toLocaleString()} ج.م
                          </span>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500 font-bold leading-relaxed pt-1">
                        💡 الحساب الختامي يُحتسب بدقة لكافة التحصيلات والمصروفات المسجلة الواقعة ضمن تاريخي البداية والنهاية لهذه الفترة المحددة ({summary.monthsCount} شهر).
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Accounting Period Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4" dir="rtl">
          <div className="w-full max-w-md bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-2xl animate-scale-up text-right space-y-4">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-900" />
                <span>{editingPeriod ? 'تعديل فترة محاسبية' : 'إنشاء فترة محاسبية جديدة'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePeriod} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-700 block">اسم الفترة المحاسبية *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="مثال: فترة 2022 - 2023 أو دورة مجلس الإدارة"
                  className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-bold outline-none text-right transition"
                  required
                />
              </div>

              {/* Start Date: Month Name & Year */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 block">شهر وسنة بداية الفترة (من):</label>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    تبدأ من: 1 {arabicMonthNames[Math.max(0, parseInt(formStartMonth, 10) - 1)]} {formStartYear}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">اسم الشهر:</span>
                    <select
                      value={formStartMonth}
                      onChange={(e) => setFormStartMonth(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800 outline-none cursor-pointer"
                    >
                      {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m, idx) => (
                        <option key={m} value={m}>
                          {arabicMonthNames[idx]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">السنة:</span>
                    <input
                      type="number"
                      min="2000"
                      max="2099"
                      value={formStartYear}
                      onChange={(e) => setFormStartYear(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black outline-none text-center font-mono"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* End Date: Month Name & Year */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 block">شهر وسنة نهاية الفترة (إلى):</label>
                  <span className="text-[10px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                    تنتهي في: {getLastDayOfMonth(formEndYear, formEndMonth)} {arabicMonthNames[Math.max(0, parseInt(formEndMonth, 10) - 1)]} {formEndYear}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">اسم الشهر:</span>
                    <select
                      value={formEndMonth}
                      onChange={(e) => setFormEndMonth(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800 outline-none cursor-pointer"
                    >
                      {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m, idx) => (
                        <option key={m} value={m}>
                          {arabicMonthNames[idx]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">السنة:</span>
                    <input
                      type="number"
                      min="2000"
                      max="2099"
                      value={formEndYear}
                      onChange={(e) => setFormEndYear(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black outline-none text-center font-mono"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Day numbers removal informative tip */}
              <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center gap-2 text-right">
                <span className="text-amber-800 font-bold text-[11px] leading-relaxed">
                  💡 يتم احتساب الفترة بدون أرقام أيام: البداية تعني تلقائياً اليوم الأول من شهر البداية، والنهاية تعني تلقائياً اليوم الأخير من شهر النهاية.
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 block">ملاحظات توضيحية (اختياري)</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="أي ملاحظات حول هذه الدورة أو الإدارة..."
                  className="w-full px-3 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-medium outline-none text-right transition"
                />
              </div>

              <div className="flex items-center gap-2 p-2 bg-blue-50/70 border border-blue-200/70 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  id="activateNowCheck"
                  checked={formActivateNow}
                  onChange={(e) => setFormActivateNow(e.target.checked)}
                  className="w-4 h-4 text-blue-900 rounded cursor-pointer"
                />
                <label htmlFor="activateNowCheck" className="text-xs font-bold text-blue-950 cursor-pointer select-none">
                  تفعيل هذه الفترة مباشرة بعد الحفظ (تصفية بيانات التطبيق لها)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-950 active:scale-95 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-xs"
                >
                  {editingPeriod ? 'حفظ التعديلات' : 'إنشاء الفترة الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Card 2: Default Fees Per Activity Type */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/70 pb-2.5">
          <div>
            <h4 className="text-xs sm:text-sm font-black text-slate-900">
              قيمة الاشتراك الافتراضي حسب نوع النشاط
            </h4>
            <p className="text-[10.5px] text-slate-500 font-bold mt-0.5">
              يتم تعيين هذه المبالغ تلقائياً عند إضافة أو تعديل الشقق وفقاً لنوع النشاط المحدد لكل وحدة
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={handleResetDefaultActivityFees}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-blue-900 border border-slate-200 rounded-xl text-[11px] font-bold transition cursor-pointer self-start sm:self-auto shadow-3xs"
            >
              استعادة القيم الافتراضية المحددة
            </button>
          )}
        </div>

        {/* Grid of Activity Default Fees */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {config.activityTypes.map((act) => {
            const currentVal = activityFees[act] !== undefined 
              ? activityFees[act] 
              : (defaultFeesMap[act] || 0);

            return (
              <div
                key={act}
                className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80 space-y-1.5 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-900"></span>
                    <span>{act}</span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {act === 'سكني' ? '(الافتراضي 400)' : act === 'سكني مغلق' ? '(الافتراضي 200)' : act === 'مفروش' ? '(الافتراضي 600)' : act === 'إداري' ? '(الافتراضي 800)' : act === 'تجاري' ? '(الافتراضي 500)' : act === 'بدون تشطيب' ? '(الافتراضي 0)' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={currentVal}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setActivityFees(prev => ({ ...prev, [act]: val }));
                    }}
                    disabled={!isAdmin}
                    className="flex-1 px-2.5 py-1.5 bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-lg text-xs font-black text-slate-900 outline-none text-right transition disabled:bg-slate-100"
                    placeholder="المبلغ"
                  />
                  <span className="text-[11px] font-bold text-slate-500 shrink-0">ج.م / شهر</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Save Fees Button */}
        {isAdmin && (
          <div className="flex items-center justify-end pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => handleSaveAccountingSettings()}
              className="px-5 py-2 bg-blue-900 hover:bg-blue-950 active:scale-95 text-white text-xs font-black rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>حفظ مبالغ الاشتراكات الافتراضية</span>
            </button>
          </div>
        )}
      </div>

      {/* Educational Calculation Box */}
      <div className="bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-200/70 space-y-2 text-right">
        <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
          <Calculator className="w-4 h-4 text-blue-900" />
          <span>كيف تعمل الفترات المحاسبية واحتساب رصيد ومديونية كل شقة؟</span>
        </h4>
        <ul className="text-xs text-slate-600 font-bold space-y-1.5 list-disc list-inside leading-relaxed">
          <li>عند تفعيل أي <span className="text-blue-900 font-black">فترة محاسبية</span>، يتم حصر التحصيلات والمصروفات والشهور ضمن تاريخي البداية والنهاية لتلك الفترة فقط.</li>
          <li>يتم احتساب <span className="text-emerald-700 font-black">الحساب الختامي للفترة</span> تلقائياً بمقارنة المقبوضات بالمصروفات والمستحق والمديونيات المتبقية.</li>
          <li>يمكنك التبديل بين الفترات في أي وقت أو اختيار <span className="text-slate-800 font-black">"عرض الكل"</span> لرؤية كافة البيانات المجمعة لجميع السنوات.</li>
        </ul>
      </div>
    </div>
  );
};
