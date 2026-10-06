import React, { useMemo } from 'react';
import { 
  X, 
  Printer, 
  Building2, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  DollarSign, 
  Phone,
  FileText
} from 'lucide-react';
import { Resident, Payment, Expense, AppConfig } from '../types';
import { 
  buildPaymentLookupIndex, 
  getPaymentsForResident, 
  getPrescribedFeeForMonth, 
  isMonthlySubscriptionType, 
  isValidPaidPayment, 
  isPendingUnpaidPayment, 
  isPaymentForYearAndMonth,
  isExpenseForYearAndMonth,
  parseExpenseYear,
  parsePaymentYear
} from '../utils/financialCalculations';
import { compareFlatNumbers, isSameFlatNumber, getHistoricalOccupantForDate } from '../utils/buildingStructure';
import { formatPhoneForDisplay } from '../utils/phoneUtils';

interface DashboardReportsModalProps {
  isOpen: boolean;
  reportType: 'financial' | 'unpaid' | null;
  onClose: () => void;
  viewMode: 'year' | 'month';
  currentYear: number;
  currentMonth: number; // 0-indexed (0 = يناير, 11 = ديسمبر)
  residents: Resident[];
  payments: Payment[];
  expenses: Expense[];
  config: AppConfig;
}

const monthNamesArabic = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export const DashboardReportsModal: React.FC<DashboardReportsModalProps> = ({
  isOpen,
  reportType,
  onClose,
  viewMode,
  currentYear,
  currentMonth,
  residents,
  payments,
  expenses,
  config,
}) => {
  if (!isOpen || !reportType) return null;

  const targetMonthNum = currentMonth + 1; // 1-12
  const targetMonthName = monthNamesArabic[currentMonth];
  const buildingName = config.buildingName || 'اتحاد ملاك عمارة بيراميدز فيو ١';
  const defaultMonthlyFee = config.defaultMonthlyFee || 400;
  const activityDefaultFees = config.activityDefaultFees;

  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  // 1. Data for Financial Report (Monthly / Annual)
  const financialData = useMemo(() => {
    if (reportType !== 'financial') return null;

    if (viewMode === 'month') {
      // Month Collections - strictly by financial accounting month and year (شهر المحاسبة)
      const monthPayments = payments
        .filter(p => isPaymentForYearAndMonth(p, currentYear, targetMonthNum) && isValidPaidPayment(p) && ((p.amount || 0) > 0))
        .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));

      const totalReceived = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

      // Month Expenses - strictly by financial accounting month and year (شهر المحاسبة)
      // Never filter by registration/entry date because expenses may be entered in a later month
      const monthExpenses = expenses
        .filter(e => isExpenseForYearAndMonth(e, currentYear, targetMonthNum))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const totalSpent = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const netCashflow = totalReceived - totalSpent;

      // Group payments by category
      const paymentsByCategory: Record<string, number> = {};
      monthPayments.forEach(p => {
        const cat = (p.paymentType || 'اشتراك شهري').trim();
        paymentsByCategory[cat] = (paymentsByCategory[cat] || 0) + (p.amount || 0);
      });

      // Group expenses by category
      const expensesByCategory: Record<string, number> = {};
      monthExpenses.forEach(e => {
        const cat = (e.expenseType || 'مصروفات عامة').trim();
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + (e.amount || 0);
      });

      return {
        mode: 'month' as const,
        monthName: targetMonthName,
        year: currentYear,
        monthPayments,
        monthExpenses,
        totalReceived,
        totalSpent,
        netCashflow,
        paymentsByCategory,
        expensesByCategory,
      };
    } else {
      // Annual Financial Report (12 months breakdown)
      const monthlyBreakdown: Array<{
        monthNum: number;
        monthName: string;
        received: number;
        spent: number;
        net: number;
      }> = [];

      let annualReceived = 0;
      let annualSpent = 0;

      for (let m = 1; m <= 12; m++) {
        const mPayments = payments.filter(p => isPaymentForYearAndMonth(p, currentYear, m) && isValidPaidPayment(p) && ((p.amount || 0) > 0));
        const mSpentExpenses = expenses.filter(e => isExpenseForYearAndMonth(e, currentYear, m));

        const mRec = mPayments.reduce((s, p) => s + (p.amount || 0), 0);
        const mSp = mSpentExpenses.reduce((s, e) => s + (e.amount || 0), 0);

        annualReceived += mRec;
        annualSpent += mSp;

        monthlyBreakdown.push({
          monthNum: m,
          monthName: monthNamesArabic[m - 1],
          received: mRec,
          spent: mSp,
          net: mRec - mSp,
        });
      }

      // Annual expenses by category
      const expensesByCategory: Record<string, number> = {};
      expenses.filter(e => parseExpenseYear(e, currentYear) === currentYear).forEach(e => {
        const cat = (e.expenseType || 'مصروفات عامة').trim();
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + (e.amount || 0);
      });

      // Annual collections by category
      const paymentsByCategory: Record<string, number> = {};
      payments.filter(p => parsePaymentYear(p, currentYear) === currentYear && isValidPaidPayment(p) && ((p.amount || 0) > 0)).forEach(p => {
        const cat = (p.paymentType || 'اشتراك شهري').trim();
        paymentsByCategory[cat] = (paymentsByCategory[cat] || 0) + (p.amount || 0);
      });

      return {
        mode: 'year' as const,
        year: currentYear,
        monthlyBreakdown,
        annualReceived,
        annualSpent,
        netCashflow: annualReceived - annualSpent,
        expensesByCategory,
        paymentsByCategory,
      };
    }
  }, [reportType, viewMode, currentYear, targetMonthNum, targetMonthName, payments, expenses]);

  // 2. Data for Unpaid / Delinquent Report (Monthly / Annual)
  const unpaidData = useMemo(() => {
    if (reportType !== 'unpaid') return null;

    const paymentIndex = buildPaymentLookupIndex(payments);

    if (viewMode === 'month') {
      // Unpaid report for the specific month
      const unpaidResidents: Array<{
        resident: Resident;
        prescribedFee: number;
        paidAmount: number;
        unpaidSubscriptionDues: number;
        pendingOtherDues: number;
        totalDue: number;
        statusText: string;
      }> = [];

      let totalUnpaidAmount = 0;

      residents.forEach(res => {
        const resPayments = getPaymentsForResident(res, paymentIndex);
        const prescribed = getPrescribedFeeForMonth(
          res,
          currentYear,
          targetMonthNum,
          resPayments,
          defaultMonthlyFee,
          activityDefaultFees
        );

        const matching = resPayments.filter(p => isPaymentForYearAndMonth(p, currentYear, targetMonthNum));
        const validSubs = matching.filter(p => isMonthlySubscriptionType(p.paymentType) && isValidPaidPayment(p));
        const pendingSubs = matching.filter(p => isMonthlySubscriptionType(p.paymentType) && isPendingUnpaidPayment(p));

        const paidAmount = validSubs.reduce((sum, p) => sum + (p.amount || 0), 0);
        const isPaid = pendingSubs.length === 0 && (paidAmount >= prescribed.monthlyFee || validSubs.some(p => p.isManuallyPaid));

        const unpaidSubDues = isPaid ? 0 : Math.max(0, prescribed.monthlyFee - paidAmount);

        // Pending other collections for this month
        const pendingOther = matching.filter(p => !isMonthlySubscriptionType(p.paymentType) && isPendingUnpaidPayment(p));
        const pendingOtherDues = pendingOther.reduce((sum, p) => sum + (p.amount || 0), 0);

        const totalDue = unpaidSubDues + pendingOtherDues;

        if (totalDue > 0) {
          totalUnpaidAmount += totalDue;
          const statusText = isPaid
            ? (pendingOtherDues > 0 ? 'تحصيل آخر معلق' : 'مسدد')
            : (paidAmount > 0 ? 'سداد جزئي' : (pendingSubs.length > 0 ? 'معلق / لم يحصل' : 'غير مسدد'));

          unpaidResidents.push({
            resident: res,
            prescribedFee: prescribed.monthlyFee,
            paidAmount,
            unpaidSubscriptionDues: unpaidSubDues,
            pendingOtherDues,
            totalDue,
            statusText,
          });
        }
      });

      unpaidResidents.sort((a, b) => compareFlatNumbers(a.resident.flatNumber, b.resident.flatNumber));

      const totalUnits = residents.length;
      const unpaidCount = unpaidResidents.length;
      const paidCount = totalUnits - unpaidCount;
      const collectionRate = totalUnits > 0 ? Math.round((paidCount / totalUnits) * 100) : 100;

      return {
        mode: 'month' as const,
        monthName: targetMonthName,
        year: currentYear,
        unpaidResidents,
        totalUnpaidAmount,
        totalUnits,
        unpaidCount,
        paidCount,
        collectionRate,
      };
    } else {
      // Annual Unpaid Report
      const now = new Date();
      const currentCalendarYear = now.getFullYear();
      const currentCalendarMonth = now.getMonth() + 1; // 1-12

      // Elapsed months to consider for this year
      let maxMonthToCheck = 12;
      if (currentYear === currentCalendarYear) {
        maxMonthToCheck = Math.min(12, currentCalendarMonth);
      } else if (currentYear > currentCalendarYear) {
        maxMonthToCheck = 0; // Future year
      }

      const delinquentResidents: Array<{
        resident: Resident;
        unpaidMonthsCount: number;
        unpaidMonthNames: string[];
        totalUnpaidSubDues: number;
        totalPendingOtherDues: number;
        totalDue: number;
      }> = [];

      let totalAnnualUnpaidAmount = 0;
      let totalUnpaidMonthsAcrossBuilding = 0;

      residents.forEach(res => {
        const resPayments = getPaymentsForResident(res, paymentIndex);
        const unpaidMonthNames: string[] = [];
        let residentUnpaidSubDues = 0;

        for (let m = 1; m <= maxMonthToCheck; m++) {
          const prescribed = getPrescribedFeeForMonth(
            res,
            currentYear,
            m,
            resPayments,
            defaultMonthlyFee,
            activityDefaultFees
          );

          const matching = resPayments.filter(p => isPaymentForYearAndMonth(p, currentYear, m));
          const validSubs = matching.filter(p => isMonthlySubscriptionType(p.paymentType) && isValidPaidPayment(p));
          const pendingSubs = matching.filter(p => isMonthlySubscriptionType(p.paymentType) && isPendingUnpaidPayment(p));

          const paidAmount = validSubs.reduce((sum, p) => sum + (p.amount || 0), 0);
          const isPaid = pendingSubs.length === 0 && (paidAmount >= prescribed.monthlyFee || validSubs.some(p => p.isManuallyPaid));

          if (!isPaid) {
            unpaidMonthNames.push(monthNamesArabic[m - 1]);
            residentUnpaidSubDues += Math.max(0, prescribed.monthlyFee - paidAmount);
          }
        }

        // Pending other collections for the year
        const pendingOther = resPayments.filter(p => {
          if (p.year !== currentYear) return false;
          return !isMonthlySubscriptionType(p.paymentType) && isPendingUnpaidPayment(p);
        });
        const residentPendingOtherDues = pendingOther.reduce((sum, p) => sum + (p.amount || 0), 0);

        const totalDue = residentUnpaidSubDues + residentPendingOtherDues;

        if (totalDue > 0 || unpaidMonthNames.length > 0) {
          totalAnnualUnpaidAmount += totalDue;
          totalUnpaidMonthsAcrossBuilding += unpaidMonthNames.length;

          delinquentResidents.push({
            resident: res,
            unpaidMonthsCount: unpaidMonthNames.length,
            unpaidMonthNames,
            totalUnpaidSubDues: residentUnpaidSubDues,
            totalPendingOtherDues: residentPendingOtherDues,
            totalDue,
          });
        }
      });

      delinquentResidents.sort((a, b) => compareFlatNumbers(a.resident.flatNumber, b.resident.flatNumber));

      return {
        mode: 'year' as const,
        year: currentYear,
        maxMonthChecked: maxMonthToCheck,
        delinquentResidents,
        totalAnnualUnpaidAmount,
        totalUnpaidMonthsAcrossBuilding,
        delinquentCount: delinquentResidents.length,
        totalUnits: residents.length,
      };
    }
  }, [reportType, viewMode, currentYear, targetMonthNum, targetMonthName, residents, payments, defaultMonthlyFee, activityDefaultFees]);

  // Manage body class while modal is open to ensure clean, isolated print layout
  React.useEffect(() => {
    if (isOpen) {
      document.body.classList.add('dashboard-report-open');
      return () => {
        document.body.classList.remove('dashboard-report-open');
        document.body.classList.remove('printing-dashboard-report');
      };
    }
  }, [isOpen]);

  // Robust printing execution with afterprint listener
  const handlePrint = () => {
    document.body.classList.add('printing-dashboard-report');
    window.focus();

    const cleanUp = () => {
      document.body.classList.remove('printing-dashboard-report');
      window.removeEventListener('afterprint', cleanUp);
    };

    window.addEventListener('afterprint', cleanUp);
    // Safe fallback timeout (15s instead of premature 1.2s)
    setTimeout(cleanUp, 15000);

    try {
      window.print();
    } catch (err) {
      console.warn('Direct print error:', err);
    }
  };

  const reportHeaderTitle = useMemo(() => {
    if (reportType === 'financial') {
      return viewMode === 'month'
        ? `التقرير المالي الشهري للتحصيلات والمصروفات - لشهر ${targetMonthName} ${currentYear}`
        : `التقرير المالي السنوي الشامل للتحصيلات والمصروفات - لسنة ${currentYear}`;
    } else {
      return viewMode === 'month'
        ? `تقرير الدفعات غير المسددة والمتأخرات - لشهر ${targetMonthName} ${currentYear}`
        : `تقرير الدفعات غير المسددة والمتأخرات السنوي - لسنة ${currentYear}`;
    }
  }, [reportType, viewMode, targetMonthName, currentYear]);

  return (
    <div className="dashboard-report-modal-overlay fixed inset-0 z-50 w-full h-full flex flex-col bg-slate-100 overflow-hidden text-right animate-in fade-in duration-200">
      
      {/* Modal Toolbar (Screen only) */}
      <div className="dashboard-report-toolbar print:hidden px-3 sm:px-6 py-2.5 sm:py-3.5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0 shadow-2xs z-20">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shrink-0 ${
            reportType === 'financial' ? 'bg-blue-900 text-amber-300' : 'bg-rose-700 text-white'
          }`}>
            {reportType === 'financial' ? <TrendingUp className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
              {reportHeaderTitle}
            </h2>
            <p className="text-[10px] sm:text-[11px] text-slate-500 font-semibold mt-0.5">
              {buildingName} | {viewMode === 'month' ? `شهر ${targetMonthName} ${currentYear}` : `سنة ${currentYear} م`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-black shadow-xs hover:shadow-md transition active:scale-95 cursor-pointer"
            title="طباعة التقرير"
          >
            <Printer className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="hidden xs:inline">طباعة التقرير</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 sm:p-2.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            title="إغلاق التقرير"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Modal Body & Printable Area */}
      <div className="dashboard-report-modal-scroll flex-1 overflow-y-auto px-1 sm:px-3 md:px-5 py-2 sm:py-4 bg-slate-100/80 text-right print:p-0 print:bg-white print:overflow-visible">
        <div id="dashboard-report-printable-area" className="printable-area dashboard-report-paper bg-white p-3 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-2xs space-y-6 w-full max-w-none print:p-0 print:border-none print:shadow-none print:rounded-none">
            
            {/* Official Report Header */}
            <div className="border-b-2 border-slate-800 pb-4 flex items-center justify-between gap-4 print-avoid-break">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                  <Building2 className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-black text-slate-950">
                    {buildingName}
                  </h1>
                  <p className="text-xs font-bold text-slate-600">
                    إدارة اتحاد الشاغلين والملاك | تقرير رسمي معتمد
                  </p>
                </div>
              </div>

              <div className="text-left text-xs font-bold text-slate-700">
                <div className="inline-block px-3 py-1 rounded-lg bg-slate-100 text-slate-900 font-black text-xs sm:text-sm border border-slate-300">
                  {viewMode === 'month' ? `شهر المحاسبة: ${targetMonthName} ${currentYear}` : `السنة المالية: ${currentYear} م`}
                </div>
              </div>
            </div>

            {/* Document Title Banner */}
            <div className="text-center py-2 bg-slate-100/80 rounded-xl border border-slate-200/80 print-avoid-break">
              <h2 className="text-sm sm:text-base font-black text-slate-900">
                {reportHeaderTitle}
              </h2>
            </div>

            {/* REPORT TYPE 1: FINANCIAL REPORT (تحصيلات ومصروفات) */}
            {reportType === 'financial' && financialData && (
              <div className="space-y-6">
                
                {/* Executive Metric Cards */}
                <div className="grid grid-cols-3 gap-3 print-avoid-break">
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3 text-center">
                    <span className="text-[11px] font-extrabold text-emerald-800 block mb-1">
                      {financialData.mode === 'month' ? 'إجمالي التحصيلات للشهر' : 'إجمالي التحصيلات السنوية'}
                    </span>
                    <span className="text-base sm:text-xl font-black text-emerald-700" dir="ltr">
                      {financialData.mode === 'month' 
                        ? financialData.totalReceived.toLocaleString() 
                        : financialData.annualReceived.toLocaleString()} ج.م
                    </span>
                  </div>

                  <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-3 text-center">
                    <span className="text-[11px] font-extrabold text-rose-800 block mb-1">
                      {financialData.mode === 'month' ? 'إجمالي المصروفات للشهر' : 'إجمالي المصروفات السنوية'}
                    </span>
                    <span className="text-base sm:text-xl font-black text-rose-700" dir="ltr">
                      {financialData.mode === 'month' 
                        ? financialData.totalSpent.toLocaleString() 
                        : financialData.annualSpent.toLocaleString()} ج.م
                    </span>
                  </div>

                  <div className={`border rounded-2xl p-3 text-center ${
                    financialData.netCashflow >= 0 
                      ? 'bg-blue-50/80 border-blue-200 text-blue-900' 
                      : 'bg-amber-50/80 border-amber-200 text-amber-900'
                  }`}>
                    <span className="text-[11px] font-extrabold block mb-1">
                      {financialData.netCashflow >= 0 ? 'صافي الفائض النقدي (+)' : 'صافي العجز النقدي (-)'}
                    </span>
                    <span className="text-base sm:text-xl font-black" dir="ltr">
                      {Math.abs(financialData.netCashflow).toLocaleString()} ج.م
                    </span>
                  </div>
                </div>

                {/* MONTHLY VIEW DETAILS */}
                {financialData.mode === 'month' && (
                  <div className="space-y-6">
                    {/* Collections Table */}
                    <div className="space-y-2">
                      <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-emerald-600" />
                          <span>بيان التحصيلات المسددة لشهر المحاسبة {financialData.monthName} {financialData.year} ({financialData.monthPayments.length} عملية تحصيل)</span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                          حسب شهر الاستحقاق المحاسبي
                        </span>
                      </h3>

                      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                        <table className="w-full min-w-[700px] text-right border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-200 text-[11px]">
                              <th className="p-2 text-center w-10">م</th>
                              <th className="p-2 text-center">الوحدة</th>
                              <th className="p-2">الساكن / المالك</th>
                              <th className="p-2 text-center">فئة التحصيل</th>
                              <th className="p-2 text-center">المبلغ</th>
                              <th className="p-2 text-center">رقم الإيصال</th>
                              <th className="p-2 text-center">تاريخ السداد</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-bold text-slate-800">
                            {financialData.monthPayments.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-4 text-center text-slate-400 font-semibold">
                                  لا توجد تحصيلات مسجلة لهذا الشهر حتى الآن.
                                </td>
                              </tr>
                            ) : (
                              financialData.monthPayments.map((p, idx) => {
                                const resObj = residents.find(r => (p.residentId && r.id === p.residentId) || isSameFlatNumber(r.flatNumber, p.flatNumber));
                                const hist = resObj ? getHistoricalOccupantForDate(resObj, `${p.year}-${p.month}`) : null;
                                const ownerName = hist?.ownerName || p.residentName || resObj?.name || '—';
                                const tenantName = hist?.tenantName || (resObj?.ownershipType === 'إيجار' ? resObj?.tenantName : undefined);
                                return (
                                  <tr key={p.id || idx} className="hover:bg-slate-50">
                                    <td className="p-2 text-center text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                                    <td className="p-2 text-center font-black text-blue-950">شقة {p.flatNumber}</td>
                                    <td className="p-2 text-slate-900 font-bold">
                                      <div className="font-black text-slate-900">{ownerName}</div>
                                      {tenantName && tenantName.trim() && (
                                        <div className="text-[10px] text-amber-800 font-bold flex items-center gap-1 mt-0.5">
                                          <span className="text-slate-400 font-medium">المستأجر:</span>
                                          <span className="text-amber-900 font-black">{tenantName.trim()}</span>
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-2 text-center">
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-900 border border-blue-200">
                                        {p.paymentType || 'اشتراك شهري'}
                                      </span>
                                    </td>
                                    <td className="p-2 text-center font-black text-emerald-700 font-mono">
                                      {p.amount.toLocaleString()} ج.م
                                    </td>
                                    <td className="p-2 text-center font-mono text-[11px] text-slate-600">
                                      {p.receiptNumber ? `#${p.receiptNumber}` : 'مسدد'}
                                    </td>
                                    <td className="p-2 text-center font-mono text-[11px] text-slate-500">
                                      {p.date || '—'}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                          {financialData.monthPayments.length > 0 && (
                            <tfoot>
                              <tr className="bg-slate-100/90 font-black text-slate-900 border-t border-slate-300">
                                <td colSpan={4} className="p-2 text-center">إجمالي التحصيلات للشهر</td>
                                <td className="p-2 text-center text-emerald-800 font-mono text-xs">
                                  {financialData.totalReceived.toLocaleString()} ج.م
                                </td>
                                <td colSpan={2} className="p-2 text-center text-slate-500 text-[10px]">
                                  {financialData.monthPayments.length} حركة تحصيل
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>

                    {/* Expenses Table */}
                    <div className="space-y-2">
                      <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="w-4 h-4 text-rose-600" />
                          <span>بيان المصروفات المنصرفة لشهر المحاسبة {financialData.monthName} {financialData.year} ({financialData.monthExpenses.length} بند مصروف)</span>
                        </div>
                        <span className="text-[10px] font-bold text-rose-800 bg-rose-50 px-2.5 py-0.5 rounded-lg border border-rose-200">
                          حسب شهر الاستحقاق المحاسبي
                        </span>
                      </h3>

                      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                        <table className="w-full min-w-[700px] text-right border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-200 text-[11px]">
                              <th className="p-2 text-center w-10">م</th>
                              <th className="p-2 text-center">نوع المصروف / البند</th>
                              <th className="p-2">البيان والتفاصيل والملاحظات</th>
                              <th className="p-2 text-center">المبلغ</th>
                              <th className="p-2 text-center">تاريخ السند / التسجيل</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-bold text-slate-800">
                            {financialData.monthExpenses.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="p-4 text-center text-slate-400 font-semibold">
                                  لا توجد مصروفات مسجلة لهذا الشهر.
                                </td>
                              </tr>
                            ) : (
                              financialData.monthExpenses.map((e, idx) => (
                                <tr key={e.id || idx} className="hover:bg-slate-50">
                                  <td className="p-2 text-center text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                                  <td className="p-2 text-center">
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-900 border border-rose-200">
                                      {e.expenseType || 'مصروف عام'}
                                    </span>
                                  </td>
                                  <td className="p-2 text-slate-900">{e.notes || e.expenseType || 'مصروف'}</td>
                                  <td className="p-2 text-center font-black text-rose-700 font-mono">
                                    {e.amount.toLocaleString()} ج.م
                                  </td>
                                  <td className="p-2 text-center font-mono text-[11px] text-slate-500">
                                    {e.date || '—'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          {financialData.monthExpenses.length > 0 && (
                            <tfoot>
                              <tr className="bg-slate-100/90 font-black text-slate-900 border-t border-slate-300">
                                <td colSpan={3} className="p-2 text-center">إجمالي المصروفات للشهر</td>
                                <td className="p-2 text-center text-rose-800 font-mono text-xs">
                                  {financialData.totalSpent.toLocaleString()} ج.م
                                </td>
                                <td className="p-2 text-center text-slate-500 text-[10px]">
                                  {financialData.monthExpenses.length} بنود
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ANNUAL VIEW DETAILS (12 Months Grid) */}
                {financialData.mode === 'year' && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h3 className="text-xs sm:text-sm font-black text-slate-900">
                        جدول الحركة المالية الشهرية التفصيلي لسنة {financialData.year}
                      </h3>

                      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                        <table className="w-full min-w-[680px] text-right border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-200 text-[11px]">
                              <th className="p-2 text-center w-12">الشهر</th>
                              <th className="p-2">اسم الشهر</th>
                              <th className="p-2 text-center">إجمالي التحصيلات</th>
                              <th className="p-2 text-center">إجمالي المصروفات</th>
                              <th className="p-2 text-center">الفارق (فائض / عجز)</th>
                              <th className="p-2 text-center">حالة الشهر</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-bold text-slate-800">
                            {financialData.monthlyBreakdown.map(row => (
                              <tr key={row.monthNum} className="hover:bg-slate-50">
                                <td className="p-2 text-center font-mono text-[11px] text-slate-500">{row.monthNum}</td>
                                <td className="p-2 font-black text-slate-900">{row.monthName}</td>
                                <td className="p-2 text-center font-mono font-bold text-emerald-700">
                                  {row.received.toLocaleString()} ج.م
                                </td>
                                <td className="p-2 text-center font-mono font-bold text-rose-700">
                                  {row.spent.toLocaleString()} ج.م
                                </td>
                                <td className={`p-2 text-center font-mono font-black ${
                                  row.net > 0 ? 'text-teal-700' : row.net < 0 ? 'text-amber-700' : 'text-slate-500'
                                }`}>
                                  {row.net > 0 ? `+${row.net.toLocaleString()}` : row.net < 0 ? `-${Math.abs(row.net).toLocaleString()}` : '0'} ج.م
                                </td>
                                <td className="p-2 text-center text-[10px]">
                                  {row.net > 0 ? (
                                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">فائض</span>
                                  ) : row.net < 0 ? (
                                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-bold border border-amber-200">عجز</span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 font-bold border border-slate-200">متوازن</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-100 text-slate-900 font-black border-t-2 border-slate-300 text-xs">
                              <td colSpan={2} className="p-2 text-center">الإجمالي السنوي العام لسنة {financialData.year}</td>
                              <td className="p-2 text-center text-emerald-800 font-mono font-black">
                                {financialData.annualReceived.toLocaleString()} ج.م
                              </td>
                              <td className="p-2 text-center text-rose-800 font-mono font-black">
                                {financialData.annualSpent.toLocaleString()} ج.م
                              </td>
                              <td className={`p-2 text-center font-mono font-black ${
                                financialData.netCashflow >= 0 ? 'text-teal-900' : 'text-amber-900'
                              }`}>
                                {financialData.netCashflow >= 0 
                                  ? `+${financialData.netCashflow.toLocaleString()}` 
                                  : `-${Math.abs(financialData.netCashflow).toLocaleString()}`} ج.م
                              </td>
                              <td className="p-2 text-center text-[10px] text-slate-600">
                                {financialData.netCashflow >= 0 ? 'فائض سنوي' : 'عجز سنوي'}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* REPORT TYPE 2: UNPAID / DELINQUENT DUES REPORT (غير المسدد والمتأخرات) */}
            {reportType === 'unpaid' && unpaidData && (
              <div className="space-y-6">
                
                {/* Executive Summary Cards */}
                <div className="grid grid-cols-3 gap-3 print-avoid-break">
                  <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-3 text-center">
                    <span className="text-[11px] font-extrabold text-rose-800 block mb-1">
                      {unpaidData.mode === 'month' ? 'إجمالي المتأخرات للشهر' : 'إجمالي متأخرات السنة'}
                    </span>
                    <span className="text-base sm:text-xl font-black text-rose-700" dir="ltr">
                      {unpaidData.mode === 'month' 
                        ? unpaidData.totalUnpaidAmount.toLocaleString() 
                        : unpaidData.totalAnnualUnpaidAmount.toLocaleString()} ج.م
                    </span>
                  </div>

                  <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 text-center">
                    <span className="text-[11px] font-extrabold text-amber-800 block mb-1">
                      عدد الوحدات غير المسددة
                    </span>
                    <span className="text-base sm:text-xl font-black text-amber-900">
                      {unpaidData.mode === 'month' ? unpaidData.unpaidCount : unpaidData.delinquentCount} وحدة
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                      من أصل {unpaidData.totalUnits} وحدة بالعمارة
                    </span>
                  </div>

                  <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-3 text-center">
                    <span className="text-[11px] font-extrabold text-blue-900 block mb-1">
                      {unpaidData.mode === 'month' ? 'نسبة التحصيل للشهر' : 'إجمالي شهور التأخير'}
                    </span>
                    <span className="text-base sm:text-xl font-black text-blue-950">
                      {unpaidData.mode === 'month' ? `${unpaidData.collectionRate}%` : `${unpaidData.totalUnpaidMonthsAcrossBuilding} شهر`}
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                      {unpaidData.mode === 'month' ? `${unpaidData.paidCount} وحدة مسددة` : `خلال سنة ${unpaidData.year}`}
                    </span>
                  </div>
                </div>

                {/* MONTHLY UNPAID TABLE */}
                {unpaidData.mode === 'month' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs sm:text-sm font-black text-slate-900">
                        كشف الوحدات غير المسددة لشهر {unpaidData.monthName} {unpaidData.year} ({unpaidData.unpaidResidents.length} وحدة)
                      </h3>
                      <span className="text-[11px] text-slate-500 font-bold">
                        مطلوب المتابعة والتحصيل
                      </span>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                      <table className="w-full min-w-[800px] text-right border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-200 text-[11px]">
                            <th className="p-2 text-center w-10">م</th>
                            <th className="p-2 text-center">الوحدة</th>
                            <th className="p-2">الساكن / المالك</th>
                            <th className="p-2 text-center">النشاط</th>
                            <th className="p-2 text-center">الاشتراك المستحق</th>
                            <th className="p-2 text-center">المسدد</th>
                            <th className="p-2 text-center">المتبقي المطلوب</th>
                            <th className="p-2 text-center">الحالة</th>
                            <th className="p-2 text-center">الهاتف</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold text-slate-800">
                          {unpaidData.unpaidResidents.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="p-6 text-center text-emerald-700 font-bold bg-emerald-50/40">
                                🎉 رائع! تم تحصيل وسداد جميع اشتراكات شهر {unpaidData.monthName} بالكامل. لا توجد أي متأخرات على أي وحدة.
                              </td>
                            </tr>
                          ) : (
                            unpaidData.unpaidResidents.map((item, idx) => {
                              const hist = getHistoricalOccupantForDate(item.resident, `${currentYear}-${targetMonthNum}`);
                              const ownerName = hist?.ownerName || item.resident.name;
                              const tenantName = hist?.tenantName || (item.resident.ownershipType === 'إيجار' ? item.resident.tenantName : undefined);
                              return (
                                <tr key={item.resident.id || idx} className="hover:bg-rose-50/20">
                                  <td className="p-2 text-center text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                                  <td className="p-2 text-center font-black text-rose-950">شقة {item.resident.flatNumber}</td>
                                  <td className="p-2 text-slate-900 font-bold">
                                    <div className="font-black text-slate-900">{ownerName}</div>
                                    {tenantName && tenantName.trim() && (
                                      <div className="text-[10px] text-amber-800 font-bold flex items-center gap-1 mt-0.5">
                                        <span className="text-slate-400 font-medium">المستأجر:</span>
                                        <span className="text-amber-900 font-black">{tenantName.trim()}</span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-2 text-center text-[10px] text-slate-600">
                                    {item.resident.activityType || 'سكني'}
                                  </td>
                                  <td className="p-2 text-center font-mono font-bold text-slate-700">
                                    {item.prescribedFee.toLocaleString()} ج.م
                                  </td>
                                  <td className="p-2 text-center font-mono font-bold text-slate-500">
                                    {item.paidAmount > 0 ? `${item.paidAmount.toLocaleString()} ج.م` : '0'}
                                  </td>
                                  <td className="p-2 text-center font-mono font-black text-rose-700 text-xs">
                                    {item.totalDue.toLocaleString()} ج.م
                                  </td>
                                  <td className="p-2 text-center">
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                                      item.statusText === 'سداد جزئي' 
                                        ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                        : 'bg-rose-50 text-rose-800 border-rose-200'
                                    }`}>
                                      {item.statusText}
                                    </span>
                                  </td>
                                  <td className="p-2 text-center font-mono text-[10px] text-slate-600" dir="ltr">
                                    {item.resident.phone ? formatPhoneForDisplay(item.resident.phone) : '—'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {unpaidData.unpaidResidents.length > 0 && (
                          <tfoot>
                            <tr className="bg-rose-50/70 font-black text-rose-950 border-t border-rose-200">
                              <td colSpan={6} className="p-2 text-center font-black">
                                إجمالي المتأخرات غير المسددة لشهر {unpaidData.monthName}
                              </td>
                              <td className="p-2 text-center text-rose-800 font-mono font-black text-xs">
                                {unpaidData.totalUnpaidAmount.toLocaleString()} ج.م
                              </td>
                              <td colSpan={2} className="p-2 text-center text-[11px] text-rose-700 font-bold">
                                {unpaidData.unpaidResidents.length} وحدة متأخرة
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}

                {/* ANNUAL UNPAID TABLE */}
                {unpaidData.mode === 'year' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs sm:text-sm font-black text-slate-900">
                        كشف المتأخرات السنوي والشهور غير المسددة لسنة {unpaidData.year} ({unpaidData.delinquentResidents.length} وحدة)
                      </h3>
                      <span className="text-[11px] text-slate-500 font-bold">
                        فترة الفحص: حتى شهر {monthNamesArabic[unpaidData.maxMonthChecked - 1] || 'ديسمبر'} {unpaidData.year}
                      </span>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                      <table className="w-full min-w-[850px] text-right border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-200 text-[11px]">
                            <th className="p-2 text-center w-10">م</th>
                            <th className="p-2 text-center">الوحدة</th>
                            <th className="p-2">الساكن / المالك</th>
                            <th className="p-2 text-center">النشاط</th>
                            <th className="p-2 text-center">الشهور المتأخرة</th>
                            <th className="p-2">تفصيل الشهور غير المسددة</th>
                            <th className="p-2 text-center">متأخرات الاشتراكات</th>
                            <th className="p-2 text-center">إجمالي المطلوب</th>
                            <th className="p-2 text-center">الهاتف</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold text-slate-800">
                          {unpaidData.delinquentResidents.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="p-6 text-center text-emerald-700 font-bold bg-emerald-50/40">
                                🎉 ممتاز! جميع وحدات وسكان العمارة مسددين لاشتراكات سنة {unpaidData.year} بالكامل بدون أي متأخرات.
                              </td>
                            </tr>
                          ) : (
                            unpaidData.delinquentResidents.map((item, idx) => {
                              const hist = getHistoricalOccupantForDate(item.resident, currentYear);
                              const ownerName = hist?.ownerName || item.resident.name;
                              const tenantName = hist?.tenantName || (item.resident.ownershipType === 'إيجار' ? item.resident.tenantName : undefined);
                              return (
                                <tr key={item.resident.id || idx} className="hover:bg-rose-50/20">
                                  <td className="p-2 text-center text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                                  <td className="p-2 text-center font-black text-rose-950">شقة {item.resident.flatNumber}</td>
                                  <td className="p-2 text-slate-900 font-bold">
                                    <div className="font-black text-slate-900">{ownerName}</div>
                                    {tenantName && tenantName.trim() && (
                                      <div className="text-[10px] text-amber-800 font-bold flex items-center gap-1 mt-0.5">
                                        <span className="text-slate-400 font-medium">المستأجر:</span>
                                        <span className="text-amber-900 font-black">{tenantName.trim()}</span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-2 text-center text-[10px] text-slate-600">
                                    {item.resident.activityType || 'سكني'}
                                  </td>
                                  <td className="p-2 text-center font-mono font-black text-rose-700">
                                    {item.unpaidMonthsCount} شهر
                                  </td>
                                  <td className="p-2 text-[11px] text-slate-700 leading-relaxed font-semibold">
                                    {item.unpaidMonthNames.join('، ') || '—'}
                                  </td>
                                  <td className="p-2 text-center font-mono font-bold text-slate-700">
                                    {item.totalUnpaidSubDues.toLocaleString()} ج.م
                                  </td>
                                  <td className="p-2 text-center font-mono font-black text-rose-700 text-xs">
                                    {item.totalDue.toLocaleString()} ج.م
                                  </td>
                                  <td className="p-2 text-center font-mono text-[10px] text-slate-600" dir="ltr">
                                    {item.resident.phone ? formatPhoneForDisplay(item.resident.phone) : '—'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {unpaidData.delinquentResidents.length > 0 && (
                          <tfoot>
                            <tr className="bg-rose-50/70 font-black text-rose-950 border-t border-rose-200">
                              <td colSpan={4} className="p-2 text-center font-black">
                                الإجمالي السنوي العام للمتأخرات لسنة {unpaidData.year}
                              </td>
                              <td className="p-2 text-center font-mono font-black text-rose-800">
                                {unpaidData.totalUnpaidMonthsAcrossBuilding} شهر
                              </td>
                              <td></td>
                              <td colSpan={2} className="p-2 text-center text-rose-800 font-mono font-black text-xs">
                                {unpaidData.totalAnnualUnpaidAmount.toLocaleString()} ج.م
                              </td>
                              <td className="p-2 text-center text-[10px] text-rose-700 font-bold">
                                {unpaidData.delinquentResidents.length} وحدة متأخرة
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* Official Signatures */}
            <div className="signatures-section print-avoid-break grid grid-cols-2 gap-8 sm:gap-24 pt-6 border-t-2 border-slate-300 text-center text-xs font-black text-slate-800 max-w-xl mx-auto print:pt-4 print:gap-12">
              <div className="space-y-6">
                <span>أمين الصندوق</span>
                <div className="border-b border-slate-400 w-32 sm:w-44 mx-auto"></div>
              </div>

              <div className="space-y-6">
                <span>رئيس اتحاد الملاك</span>
                <div className="border-b border-slate-400 w-32 sm:w-44 mx-auto"></div>
              </div>
            </div>

            {/* Official Footer */}
            <div className="print-avoid-break text-center text-[10px] text-slate-400 font-semibold pt-2">
              تم استخراج هذا التقرير رسمياً بواسطة نظام إدارة {buildingName} | صالح للاستخدام والاعتماد
            </div>

          </div>
        </div>

      </div>
    );
  };
