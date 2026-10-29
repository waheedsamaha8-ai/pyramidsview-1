import React, { useState, useMemo, useEffect, useRef } from 'react';
import { generateElementImage, generateElementImageBlob, GeneratedImageResult } from '../utils/imageExport';
import { printReportElement } from '../utils/printReport';
import { Resident, Payment, AppConfig, FloorConfig } from '../types';
import { calculateResidentFinancials, getCarriedPreviousBalance, isMonthlySubscriptionType, getPrescribedFeeForMonth, isValidPaidPayment, isPendingUnpaidPayment, isPaymentForYearAndMonth, parsePaymentYear, parsePaymentMonth, calculateUnitClaimBreakdown } from '../utils/financialCalculations';
import { compareFlatNumbers, isSameFlatNumber, deriveFloorConfigsFromResidents, getUnitNumbersForFloor, getLatestOccupantFromHistory, getHistoricalActivityForDate, formatResidentOptionLabel, parseToStandardDate } from '../utils/buildingStructure';
import { formatMobileNumber, formatPhoneForDisplay, toWhatsAppNumber } from '../utils/phoneUtils';
import { getActiveAccountingPeriod, parseYearMonth, formatPeriodDateRange } from '../utils/periodUtils';
import { 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  DollarSign, 
  CreditCard, 
  Eye, 
  Printer, 
  Share2, 
  Building2, 
  User, 
  Phone, 
  ArrowDownRight, 
  ArrowUpRight,
  HelpCircle,
  Clock,
  Filter,
  Image as ImageIcon,
  Download,
  RefreshCw,
  Sparkles,
  Copy,
  Check,
  Send,
  X,
  ExternalLink,
  AlertCircle,
  Minus
} from 'lucide-react';

export const getPaymentStatusDisplay = (status?: string) => {
  const s = (status || '').trim().toLowerCase();
  if (s === 'cancelled' || s === 'لاغي' || s === 'ملغي') {
    return {
      type: 'cancelled' as const,
      label: 'لاغي',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200/80',
      textClass: 'text-rose-600',
      amountClass: 'line-through text-rose-500 font-bold',
      icon: X,
    };
  }
  if (s === 'exempt' || s === 'معفي' || s === 'معفاه' || s === 'معفاة') {
    return {
      type: 'exempt' as const,
      label: 'معفي',
      badgeClass: 'bg-slate-200 text-slate-800 border-slate-300 font-black',
      textClass: 'text-slate-800',
      amountClass: 'text-slate-600 font-bold',
      icon: Minus,
    };
  }
  if (s === 'pending' || s === 'لم يتم التحصيل' || s === 'uncollected' || s === 'معلق' || s === 'غير محصل' || s === 'غير مسدد') {
    return {
      type: 'pending' as const,
      label: 'غير مسدد',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/80',
      textClass: 'text-amber-700',
      amountClass: 'text-amber-600 font-bold',
      icon: Clock,
    };
  }
  return {
    type: 'collected' as const,
    label: 'مسدد',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    textClass: 'text-emerald-700',
    amountClass: 'text-emerald-700 font-black',
    icon: CheckCircle2,
  };
};

interface ResidentAccountStatementProps {
  resident?: Resident;
  residents: Resident[];
  payments: Payment[];
  config: AppConfig;
  currentYear: number;
  currentMonth?: number; // 0-indexed (0 to 11)
  viewMode?: 'month' | 'year';
  floorConfigs?: FloorConfig[];
  isResidentOnly?: boolean;
  onSelectResidentId?: (residentId: string) => void;
  onSelectFlatNumber?: (flatNumber: number | string) => void;
  onPreviewImage: (url: string) => void;
  onOpenResidentsList?: () => void;
}

const monthNamesArabic = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export const ResidentAccountStatement: React.FC<ResidentAccountStatementProps> = ({
  resident,
  residents,
  payments,
  config,
  currentYear,
  currentMonth,
  viewMode = 'month',
  floorConfigs,
  isResidentOnly = false,
  onSelectResidentId,
  onSelectFlatNumber,
  onPreviewImage,
  onOpenResidentsList,
}) => {
  const [monthFilter, setMonthFilter] = useState<'all' | 'paid' | 'unpaid' | 'exempt'>('all');
  const [selectedLocalId, setSelectedLocalId] = useState<string>(resident?.id || '');

  // Synchronized horizontal scrolling refs between monthly breakdown and payments log tables
  const table1Ref = useRef<HTMLDivElement>(null);
  const table2Ref = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef<boolean>(false);

  const handleScroll1 = () => {
    if (isSyncingScrollRef.current) return;
    if (table1Ref.current && table2Ref.current) {
      isSyncingScrollRef.current = true;
      table2Ref.current.scrollLeft = table1Ref.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false;
      });
    }
  };

  const handleScroll2 = () => {
    if (isSyncingScrollRef.current) return;
    if (table1Ref.current && table2Ref.current) {
      isSyncingScrollRef.current = true;
      table1Ref.current.scrollLeft = table2Ref.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false;
      });
    }
  };

  // Keep internal selection synced when parent changes resident prop
  React.useEffect(() => {
    if (resident?.id && resident.id !== selectedLocalId) {
      setSelectedLocalId(resident.id);
    }
  }, [resident?.id]);

  // When in resident only mode, strictly display the resident's own unit or admin profile
  const activeResident = useMemo(() => {
    if (isResidentOnly) {
      if (resident) return resident;
      if (config?.adminResidentProfile) {
        const p = config.adminResidentProfile;
        const foundInList = residents.find(r => isSameFlatNumber(r.flatNumber, p.flatNumber));
        if (foundInList) return foundInList;
        return {
          id: `res_admin_${p.flatNumber || 101}`,
          flatNumber: p.flatNumber || 101,
          name: (p.name || 'وحيد سماحة').replace(/\s*\(رئيس الاتحاد\)/g, '').trim(),
          phone: p.phone || '',
          activityType: p.activityType || 'سكني',
          ownershipType: p.ownershipType || 'تمليك',
          monthlyFee: p.monthlyFee !== undefined && p.monthlyFee > 0 ? p.monthlyFee : (config.defaultMonthlyFee || 400),
          initialBalance: p.initialBalance || 0,
          notes: p.notes || 'رئيس اتحاد الملاك',
        } as Resident;
      }
      return residents.length > 0 ? residents[0] : null;
    }

    // In admin/manager/assistant mode:
    if (selectedLocalId) {
      const found = residents.find(r => r.id === selectedLocalId || isSameFlatNumber(r.flatNumber, selectedLocalId));
      if (found) return found;
    }

    if (resident) return resident;
    return null;
  }, [resident, selectedLocalId, isResidentOnly, config, residents]);

  // Group residents floor by floor based on building layout configuration and ascending unit numbers
  const floorGroups = useMemo(() => {
    const configs = (floorConfigs && floorConfigs.length > 0)
      ? floorConfigs
      : (config?.buildingLayout && config.buildingLayout.length > 0)
        ? config.buildingLayout
        : deriveFloorConfigsFromResidents(residents);

    const sortedConfigs = [...configs].sort((a, b) => {
      const startA = a.startUnitNumber ?? (a.unitNumbers?.[0] ?? 101);
      const startB = b.startUnitNumber ?? (b.unitNumbers?.[0] ?? 101);
      return compareFlatNumbers(startA, startB);
    });

    const assigned = new Set<string>();
    const groups: { floorLabel: string; residents: Resident[] }[] = [];

    sortedConfigs.forEach(cfg => {
      const units = getUnitNumbersForFloor(cfg, residents);
      const floorResidents = residents
        .filter(r => units.some(u => isSameFlatNumber(u, r.flatNumber)))
        .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));

      floorResidents.forEach(r => assigned.add(r.id));
      if (floorResidents.length > 0) {
        groups.push({
          floorLabel: cfg.floorLabel || 'دور العمارة',
          residents: floorResidents,
        });
      }
    });

    const remaining = residents
      .filter(r => !assigned.has(r.id))
      .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));

    if (remaining.length > 0) {
      groups.push({
        floorLabel: 'وحدات إضافية',
        residents: remaining,
      });
    }

    return groups;
  }, [floorConfigs, config?.buildingLayout, residents]);

  const activePeriod = useMemo(() => getActiveAccountingPeriod(config), [config]);
  const accountingStartDate = config?.accountingStartDate || '2026-01-01';
  const defaultMonthlyFee = config?.defaultMonthlyFee || 400;
  const activityDefaultFees = config?.activityDefaultFees;
  const activityFeePeriods = config?.activityFeePeriods;

  const calculatedEndDate = useMemo(() => {
    if (viewMode === 'month' && currentMonth !== undefined) {
      const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
      const monthEndStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      if (activePeriod?.endDate && activePeriod.endDate < monthEndStr) {
        return activePeriod.endDate;
      }
      return monthEndStr;
    }
    if (viewMode === 'year') {
      const yearEndStr = `${currentYear}-12-31`;
      if (activePeriod?.endDate && activePeriod.endDate < yearEndStr) {
        return activePeriod.endDate;
      }
      return yearEndStr;
    }
    return activePeriod ? activePeriod.endDate : undefined;
  }, [viewMode, currentMonth, currentYear, activePeriod]);

  const calculatedStartDate = useMemo(() => {
    if (viewMode === 'year') {
      const baseStart = activePeriod ? activePeriod.startDate : accountingStartDate;
      const s = parseYearMonth(baseStart) || { year: currentYear, month: 1 };
      if (s.year === currentYear) {
        return baseStart;
      }
      return `${currentYear}-01-01`;
    }
    return activePeriod ? activePeriod.startDate : accountingStartDate;
  }, [viewMode, currentYear, activePeriod, accountingStartDate]);

  const effectiveStartDate = calculatedStartDate;
  const effectiveEndDate = calculatedEndDate;

  const startYear = useMemo(() => {
    const s = new Date(effectiveStartDate);
    return isNaN(s.getFullYear()) ? 2026 : s.getFullYear();
  }, [effectiveStartDate]);

  // Calculate high-level financials matching Debts page logic & synchronized with monthsTimeline
  const rawFinancials = useMemo(() => {
    if (!activeResident) {
      return {
        monthlyFee: defaultMonthlyFee,
        monthsElapsed: 1,
        billableMonthsCount: 1,
        paidMonthsCount: 0,
        unpaidMonthsCount: 1,
        unpaidMonthsDues: defaultMonthlyFee,
        periodExpectedDues: defaultMonthlyFee,
        oldDebtAmount: 0,
        expectedDues: defaultMonthlyFee,
        totalPaid: 0,
        monthlyPaid: 0,
        otherCollectionsPaid: 0,
        otherCollectionsDebt: 0,
        netBalance: -defaultMonthlyFee,
        carriedPreviousBalance: 0,
        isDebt: true,
        isSurplus: false,
      };
    }
    return calculateResidentFinancials(
      activeResident,
      payments,
      effectiveStartDate,
      defaultMonthlyFee,
      activityDefaultFees,
      viewMode === 'year' ? currentYear : undefined,
      effectiveEndDate,
      activityFeePeriods,
      config?.customUnitFeePeriods
    );
  }, [activeResident, payments, effectiveStartDate, effectiveEndDate, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, config?.customUnitFeePeriods, viewMode, currentYear]);

  // All payments belonging to this unit (excluding zero-value distribution payments, ordered Jan to Dec)
  const unitPayments = useMemo(() => {
    if (!activeResident) return [];
    return payments
      .filter(p => {
        const matchesUnit = isSameFlatNumber(p.flatNumber, activeResident.flatNumber) || (p.residentId && p.residentId === activeResident.id);
        if (!matchesUnit) return false;
        
        // Exclude zero-value distribution payments or zero amount records
        if (p.amount === 0 || !p.amount) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const yearA = Number(a.year) || 2026;
        const yearB = Number(b.year) || 2026;
        if (yearA !== yearB) return yearA - yearB;

        const monthA = parseInt(String(a.month), 10) || 1;
        const monthB = parseInt(String(b.month), 10) || 1;
        if (monthA !== monthB) return monthA - monthB; // Jan (1) to Dec (12)

        // Monthly Subscription first, Other Collections second
        const isSubA = isMonthlySubscriptionType(a.paymentType) || !a.paymentType || a.paymentType === 'اشتراك شهري';
        const isSubB = isMonthlySubscriptionType(b.paymentType) || !b.paymentType || b.paymentType === 'اشتراك شهري';
        if (isSubA && !isSubB) return -1;
        if (!isSubA && isSubB) return 1;

        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
  }, [activeResident, payments]);

  // Group unit payments by Month and Year, separating Monthly Subscriptions and Other Collections
  // to achieve identical month row splitting and formatting as the detailed months timeline table
  const groupedUnitPayments = useMemo(() => {
    if (!activeResident || unitPayments.length === 0) return [];

    const groupsMap = new Map<string, {
      year: number;
      monthNum: number;
      monthLabel: string;
      monthlySubPayments: Payment[];
      otherCollectionPayments: Payment[];
    }>();

    for (const p of unitPayments) {
      const y = parsePaymentYear(p, currentYear) || Number(p.year) || currentYear;
      const m = parsePaymentMonth(p) || parseInt(String(p.month), 10) || 1;
      const key = `${y}-${m}`;

      let grp = groupsMap.get(key);
      if (!grp) {
        grp = {
          year: y,
          monthNum: m,
          monthLabel: `${monthNamesArabic[m - 1] || m} ${y}`,
          monthlySubPayments: [],
          otherCollectionPayments: [],
        };
        groupsMap.set(key, grp);
      }

      const isSub = isMonthlySubscriptionType(p.paymentType) || !p.paymentType || p.paymentType === 'اشتراك شهري';
      if (isSub) {
        grp.monthlySubPayments.push(p);
      } else {
        grp.otherCollectionPayments.push(p);
      }
    }

    const groups = Array.from(groupsMap.values()).map(grp => {
      const prescribed = getPrescribedFeeForMonth(
        activeResident,
        grp.year,
        grp.monthNum,
        unitPayments,
        defaultMonthlyFee,
        activityDefaultFees,
        activityFeePeriods,
        config?.customUnitFeePeriods
      );

      const subRowsCount = grp.monthlySubPayments.length;
      const otherRowsCount = grp.otherCollectionPayments.length;
      const totalRows = Math.max(1, subRowsCount + otherRowsCount);

      return {
        ...grp,
        prescribedFee: prescribed.monthlyFee,
        prescribedActivity: prescribed.activityType,
        totalRows,
      };
    });

    // Sort chronologically by year ascending, then month ascending
    groups.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.monthNum - b.monthNum;
    });

    return groups;
  }, [activeResident, unitPayments, currentYear, defaultMonthlyFee, activityDefaultFees]);

  // Generate detailed breakdown of all months from accounting start date up to current date (or strictly scoped to active accounting period)
  const monthsTimeline = useMemo(() => {
    if (!activeResident) return [];

    let startYear: number;
    let startMonth: number; // 0-indexed
    let endYear: number;
    let endMonth: number; // 0-indexed

    if (viewMode === 'month' && currentMonth !== undefined) {
      // Filter on specific month: from accounting start date / active period start UP TO the specified month
      if (activePeriod) {
        const s = parseYearMonth(activePeriod.startDate) || { year: currentYear, month: 1 };
        startYear = s.year;
        startMonth = s.month - 1;
      } else {
        const s = new Date(accountingStartDate);
        startYear = isNaN(s.getFullYear()) ? currentYear : s.getFullYear();
        startMonth = isNaN(s.getMonth()) ? 0 : s.getMonth();
      }
      endYear = currentYear;
      endMonth = currentMonth;

      // Safety check if currentMonth/currentYear is prior to start:
      if (endYear < startYear || (endYear === startYear && endMonth < startMonth)) {
        startYear = endYear;
        startMonth = endMonth;
      }
    } else if (viewMode === 'year') {
      // Annual account statement for currentYear
      if (activePeriod) {
        const s = parseYearMonth(activePeriod.startDate) || { year: currentYear, month: 1 };
        const e = parseYearMonth(activePeriod.endDate) || { year: currentYear, month: 12 };
        startYear = currentYear;
        startMonth = (s.year === currentYear ? (s.month - 1) : 0);
        endYear = currentYear;
        endMonth = (e.year === currentYear ? (e.month - 1) : 11);
      } else {
        const s = new Date(accountingStartDate);
        const sYear = isNaN(s.getFullYear()) ? currentYear : s.getFullYear();
        const sMonth = isNaN(s.getMonth()) ? 0 : s.getMonth();
        startYear = currentYear;
        startMonth = (sYear === currentYear ? sMonth : 0);
        endYear = currentYear;
        endMonth = 11;
      }
    } else {
      if (activePeriod) {
        const s = parseYearMonth(activePeriod.startDate) || { year: 2022, month: 1 };
        const e = parseYearMonth(activePeriod.endDate) || { year: 2023, month: 12 };
        startYear = s.year;
        startMonth = s.month - 1;
        endYear = e.year;
        endMonth = e.month - 1;
      } else {
        let start = new Date(accountingStartDate);
        if (isNaN(start.getTime())) {
          start = new Date(currentYear, 0, 1);
        }
        const now = new Date();
        startYear = start.getFullYear();
        startMonth = start.getMonth();
        endYear = now.getFullYear();
        endMonth = now.getMonth();
      }
    }
    
    // We iterate from start month to end month
    const timeline: Array<{
      monthNum: number;
      monthStr: string;
      year: number;
      monthLabel: string;
      fee: number;
      activityType?: string;
      isPaid: boolean;
      isExempt?: boolean;
      paidAmount: number;
      matchingPayments: Payment[];
      isFuture: boolean;
    }> = [];

    let y = startYear;
    let m = startMonth;

    while (y < endYear || (y === endYear && m <= endMonth)) {
      const monthNum = m + 1;
      const monthStr = String(monthNum).padStart(2, '0');
      const monthLabel = `${monthNamesArabic[m]} ${y}`;

      // Find matching payments for this exact month and year
      const matching = unitPayments.filter(p => isPaymentForYearAndMonth(p, y, monthNum));

      // Subscription payments only for evaluating monthly subscription status and subscription paid amount
      const matchingSubPayments = matching.filter(
        p => isMonthlySubscriptionType(p.paymentType) || !p.paymentType || p.paymentType === 'اشتراك شهري'
      );

      const validPaidSubsMatching = matchingSubPayments.filter(isValidPaidPayment);
      const pendingSubsMatching = matchingSubPayments.filter(isPendingUnpaidPayment);

      const paidSubAmount = validPaidSubsMatching.reduce((sum, p) => sum + (p.amount || 0), 0);
      const prescribed = getPrescribedFeeForMonth(activeResident, y, monthNum, unitPayments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, config?.customUnitFeePeriods);
      const effectiveFee = prescribed.monthlyFee;
      const effectiveActivityType = prescribed.activityType;
      const hasValidPaidPayment = validPaidSubsMatching.some(p => ((p.amount || 0) > 0 || p.isManuallyPaid));

      const act = (effectiveActivityType || activeResident.activityType || '').trim();
      const isExempt = 
        Boolean(activeResident.isExempt) ||
        act.includes('تشطيب') || 
        act.includes('مغلق') || 
        act.includes('مغلقة') || 
        act.includes('معفي') || 
        act.includes('معفاه') || 
        act.includes('معفاة') ||
        effectiveFee === 0;

      const isPaid = !isExempt && pendingSubsMatching.length === 0 && hasValidPaidPayment;

      timeline.push({
        monthNum,
        monthStr,
        year: y,
        monthLabel,
        fee: effectiveFee,
        activityType: effectiveActivityType,
        isPaid,
        isExempt,
        paidAmount: paidSubAmount,
        matchingPayments: matching,
        isFuture: false,
      });

      // advance to next month
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }

    return timeline;
  }, [activeResident, activePeriod, accountingStartDate, currentYear, currentMonth, viewMode, unitPayments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, config?.customUnitFeePeriods]);

  const paidMonthsList = useMemo(() => monthsTimeline.filter(m => m.isPaid), [monthsTimeline]);
  const unpaidMonthsList = useMemo(() => monthsTimeline.filter(m => !m.isPaid && !m.isExempt && !m.isFuture), [monthsTimeline]);
  const exemptMonthsList = useMemo(() => monthsTimeline.filter(m => m.isExempt), [monthsTimeline]);

  // Unit prescribed fee and activity type for the target period/year
  const unitPrescribedInfo = useMemo(() => {
    if (!activeResident) return { monthlyFee: defaultMonthlyFee, activityType: 'سكني' };
    const tYear = currentYear;
    const tMonth = (viewMode === 'month' && currentMonth !== undefined)
      ? (currentMonth + 1)
      : (monthsTimeline.length > 0 ? monthsTimeline[monthsTimeline.length - 1].monthNum : 1);

    const matchingInTimeline = monthsTimeline.find(m => m.year === tYear && m.monthNum === tMonth)
      || monthsTimeline.find(m => m.year === tYear)
      || (monthsTimeline.length > 0 ? monthsTimeline[monthsTimeline.length - 1] : null);

    if (matchingInTimeline && matchingInTimeline.fee !== undefined) {
      return {
        monthlyFee: matchingInTimeline.fee,
        activityType: matchingInTimeline.activityType || activeResident.activityType || 'سكني',
      };
    }

    return getPrescribedFeeForMonth(
      activeResident,
      tYear,
      tMonth,
      unitPayments,
      defaultMonthlyFee,
      activityDefaultFees,
      activityFeePeriods,
      config?.customUnitFeePeriods
    );
  }, [activeResident, currentYear, viewMode, currentMonth, monthsTimeline, unitPayments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, config?.customUnitFeePeriods]);

  // 📋 بيان وتفصيل المبالغ المستحقة على الوحدة (6 أجزاء كاملة تماماً كما هي في صفحة بيانات وإيصال الوحدة)
  const targetClaimYear = currentYear;
  const targetClaimMonth = (viewMode === 'month' && currentMonth !== undefined)
    ? (currentMonth + 1)
    : (monthsTimeline.length > 0 ? monthsTimeline[monthsTimeline.length - 1].monthNum : (new Date().getMonth() + 1));

  const claimBreakdown = useMemo(() => {
    if (!activeResident) return null;
    return calculateUnitClaimBreakdown(
      activeResident,
      payments,
      targetClaimYear,
      targetClaimMonth,
      calculatedStartDate,
      unitPrescribedInfo.monthlyFee || defaultMonthlyFee,
      activityDefaultFees,
      null,
      config?.customUnitFeePeriods,
      activityFeePeriods
    );
  }, [activeResident, payments, targetClaimYear, targetClaimMonth, calculatedStartDate, unitPrescribedInfo, defaultMonthlyFee, activityDefaultFees, config?.customUnitFeePeriods, activityFeePeriods]);

  // Compute carried forward previous balance automatically for multi-year accounting continuity
  const effectiveCarriedBalance = useMemo(() => {
    if (!activeResident) return 0;

    // 1. If claimBreakdown has calculated previous debt/surplus
    if (claimBreakdown?.previousDebtAmount && claimBreakdown.previousDebtAmount > 0) {
      return -claimBreakdown.previousDebtAmount;
    }
    if (claimBreakdown?.previousSurplusAmount && claimBreakdown.previousSurplusAmount > 0) {
      return claimBreakdown.previousSurplusAmount;
    }

    // 2. Check explicit exportedYearBalances for currentYear
    if (activeResident.exportedYearBalances && (activeResident.exportedYearBalances[currentYear] !== undefined || activeResident.exportedYearBalances[String(currentYear)] !== undefined)) {
      const val = activeResident.exportedYearBalances[currentYear] ?? activeResident.exportedYearBalances[String(currentYear)];
      if (val !== undefined && !isNaN(val)) return val;
    }

    // 3. If rawFinancials has carriedPreviousBalance
    if (rawFinancials?.carriedPreviousBalance !== undefined && rawFinancials.carriedPreviousBalance !== 0) {
      return rawFinancials.carriedPreviousBalance;
    }

    // 4. Calculate carried balance using calculatedStartDate or accountingStartDate
    const bal = getCarriedPreviousBalance(
      activeResident,
      currentYear,
      payments,
      calculatedStartDate || accountingStartDate,
      defaultMonthlyFee,
      activityDefaultFees,
      activityFeePeriods,
      config?.customUnitFeePeriods
    );
    if (bal !== 0) return bal;

    // 5. Fallback to resident.initialBalance
    if (activeResident.initialBalance) {
      return activeResident.initialBalance;
    }

    return 0;
  }, [activeResident, currentYear, payments, calculatedStartDate, accountingStartDate, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, config?.customUnitFeePeriods, claimBreakdown?.previousDebtAmount, claimBreakdown?.previousSurplusAmount, rawFinancials?.carriedPreviousBalance]);

  // Synchronize top-level summary financials with monthsTimeline
  const financials = useMemo(() => {
    const timelineDues = monthsTimeline.reduce((sum, m) => sum + m.fee, 0);

    if (monthsTimeline.length === 0) {
      return {
        ...rawFinancials,
        monthlyFee: unitPrescribedInfo.monthlyFee,
      };
    }

    const timelineUnpaidCount = unpaidMonthsList.length;
    const timelineUnpaidDues = unpaidMonthsList.reduce((sum, m) => sum + m.fee, 0);

    const prevDebt = effectiveCarriedBalance < 0 ? Math.abs(effectiveCarriedBalance) : 0;
    const prevSurplus = effectiveCarriedBalance > 0 ? effectiveCarriedBalance : 0;
    const totalArrears = timelineUnpaidDues + rawFinancials.otherCollectionsDebt;
    const totalDueForPayment = Math.max(0, totalArrears + prevDebt - prevSurplus);
    const netBal = (prevSurplus > totalArrears) ? (prevSurplus - totalArrears) : -totalDueForPayment;

    return {
      ...rawFinancials,
      monthlyFee: unitPrescribedInfo.monthlyFee,
      expectedDues: timelineDues,
      monthsElapsed: monthsTimeline.length,
      unpaidMonthsCount: timelineUnpaidCount,
      unpaidMonthsDues: timelineUnpaidDues,
      totalArrears,
      totalDueForPayment,
      netBalance: netBal,
      isDebt: netBal < 0,
      isSurplus: netBal > 0,
    };
  }, [rawFinancials, monthsTimeline, unpaidMonthsList, effectiveCarriedBalance, unitPrescribedInfo]);

  const displayedMonths = useMemo(() => {
    if (monthFilter === 'paid') return paidMonthsList;
    if (monthFilter === 'unpaid') return unpaidMonthsList;
    if (monthFilter === 'exempt') return exemptMonthsList;
    return monthsTimeline;
  }, [monthFilter, paidMonthsList, unpaidMonthsList, exemptMonthsList, monthsTimeline]);

  // Image generation & sharing states
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageResult, setGeneratedImageResult] = useState<GeneratedImageResult | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Accurate dynamic accounting period label matching active month / year filter
  const accountingPeriodDisplay = useMemo(() => {
    // Determine start label
    let startLabel = '';
    if (activePeriod) {
      const s = parseYearMonth(activePeriod.startDate);
      if (s) {
        startLabel = `شهر ${monthNamesArabic[s.month - 1]} ${s.year}`;
      } else {
        startLabel = activePeriod.startDate;
      }
    } else {
      const s = parseToStandardDate(accountingStartDate);
      if (s && s.year) {
        const mIdx = s.month ? parseInt(s.month.slice(5, 7), 10) - 1 : 0;
        startLabel = `شهر ${monthNamesArabic[Math.max(0, Math.min(11, mIdx))]} ${s.year}`;
      } else {
        startLabel = accountingStartDate;
      }
    }

    if (viewMode === 'month' && currentMonth !== undefined) {
      const endLabel = `شهر ${monthNamesArabic[currentMonth]} ${currentYear}`;
      return `من ${startLabel} وإلى ${endLabel}`;
    }

    if (viewMode === 'year') {
      let endMonthName = 'شهر ديسمبر';
      let endYear = currentYear;
      if (activePeriod) {
        const e = parseYearMonth(activePeriod.endDate);
        if (e && e.year === currentYear) {
          endMonthName = `شهر ${monthNamesArabic[e.month - 1]}`;
          endYear = e.year;
        }
      }
      return `من ${startLabel} وإلى ${endMonthName} ${endYear} (السنة المحاسبية ${currentYear})`;
    }

    // Default fallback
    if (activePeriod) {
      return `من ${startLabel} وإلى ${formatPeriodDateRange(activePeriod.startDate, activePeriod.endDate)}`;
    }
    return `من ${startLabel} حتى تاريخ اليوم`;
  }, [activePeriod, accountingStartDate, viewMode, currentMonth, currentYear]);

  // Clear cached generated image whenever active resident or financial data or filter changes
  useEffect(() => {
    setGeneratedImageResult(null);
  }, [activeResident?.id, activeResident?.flatNumber, payments, effectiveCarriedBalance, currentYear, currentMonth, viewMode, claimBreakdown]);

  const activeOccupant = useMemo(() => {
    if (!activeResident) return { ownerName: '', tenantName: undefined, occupantName: '' };
    if (viewMode === 'month' && currentMonth !== undefined) {
      const mStr = String(currentMonth + 1).padStart(2, '0');
      return getLatestOccupantFromHistory(activeResident, `${currentYear}-${mStr}`);
    }
    if (viewMode === 'year') {
      return getLatestOccupantFromHistory(activeResident, currentYear);
    }
    if (activePeriod) {
      return getLatestOccupantFromHistory(activeResident, activePeriod);
    }
    return getLatestOccupantFromHistory(activeResident, currentYear);
  }, [activeResident, currentYear, currentMonth, viewMode, activePeriod]);

  const hasHistory = Boolean(activeResident?.history && Array.isArray(activeResident.history) && activeResident.history.length > 0);
  const activeOwnerName = activeOccupant.ownerName || activeResident?.name || '';
  const activeOwnerPhone = hasHistory 
    ? activeOccupant.ownerPhone 
    : (activeOccupant.ownerPhone || activeResident?.phone);
  const activeTenantName = hasHistory 
    ? activeOccupant.tenantName 
    : (activeOccupant.tenantName !== undefined ? activeOccupant.tenantName : activeResident?.tenantName);
  const activeTenantPhone = activeTenantName 
    ? (activeOccupant.tenantPhone || (hasHistory ? undefined : activeResident?.tenantPhone)) 
    : undefined;

  // Builds beautifully formatted WhatsApp text summary
  const getWhatsAppSummaryText = (target: 'owner' | 'tenant' = 'owner') => {
    if (!activeResident) return '';
    const isDebt = financials.netBalance < 0;
    const isSurplus = financials.netBalance > 0;
    const targetName = target === 'owner' ? activeOwnerName : (activeTenantName || 'السيد المستأجر');
    const targetRole = target === 'owner' ? 'المالك' : 'المستأجر';
    const todayStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

    let text = `📋 *كشف حساب وااشتراكات الوحدة الشامل*\n`;
    text += `🏢 *اتحاد ملاك عمارة بيراميدز فيو ١*\n`;
    text += `------------------------------------\n`;
    text += `🚪 *الوحدة:* ( الوحدة ${activeResident.flatNumber} - ${activeResident.activityType} )\n`;
    text += `👤 *الاسم (${targetRole}):* ${targetName}\n`;
    if (target === 'owner' && activeTenantName) {
      text += `🏠 *المستأجر:* ${activeTenantName}\n`;
    }
    text += `💵 *قيمة اشتراك شهري:* ${financials.monthlyFee.toLocaleString()} ج.م\n`;
    text += `📅 *تاريخ بدء المحاسبة:* ${accountingStartDate}\n`;
    text += `🗓 *تاريخ التقرير:* ${todayStr}\n`;
    text += `------------------------------------\n`;
    text += `📊 *ملخص الموقف المالي والتسويات:*\n`;
    
    const initBal = effectiveCarriedBalance;
    if (initBal < 0) {
      text += `• *رصيد سابق مرحل:* ⚠️ مديونية سابقة (-${Math.abs(initBal).toLocaleString()} ج.م)\n`;
    } else if (initBal > 0) {
      text += `• *رصيد سابق مرحل:* ✨ رصيد دائن فائض (+${initBal.toLocaleString()} ج.م)\n`;
    } else {
      text += `• *رصيد سابق:* لا يوجد (0 ج.م)\n`;
    }
    text += `• *الشهور المستحقة:* ${financials.monthsElapsed} شهر\n`;
    text += `• *إجمالي المطلوب حتى تاريخه:* ${financials.expectedDues.toLocaleString()} ج.م\n`;
    text += `• *إجمالي المسدد فعلياً:* ${financials.totalPaid.toLocaleString()} ج.م (${unitPayments.length} عملية سداد)\n`;
    text += `------------------------------------\n`;
    text += `💰 *الرصيد الختامي حتى تاريخه:*\n`;
    text += isDebt 
      ? `🔴 *المطلوب سداده (مديونية متأخرة):* (-${Math.abs(Math.round(financials.netBalance)).toLocaleString()} ج.م)\n` 
      : isSurplus 
      ? `🟢 *رصيد دائن فائض لصالحكم:* (+${Math.round(financials.netBalance).toLocaleString()} ج.م)\n` 
      : `✨ *الحساب مسدد بالكامل (0 ج.م)*\n`;

    if (unpaidMonthsList.length > 0 || financials.otherCollectionsDebt > 0) {
      text += `\n⚠️ *تفاصيل المتأخرات والشهور غير المسددة:*\n`;
      if (financials.unpaidMonthsCount > 0) {
        text += `• *شهور اشتراك شهري غير المسددة (${financials.unpaidMonthsCount} شهر):* ${financials.unpaidMonthsDues.toLocaleString()} ج.م\n`;
        unpaidMonthsList.forEach(m => {
          text += `  - ${m.monthLabel}: ${m.paidAmount > 0 ? `سداد جزئي (${m.paidAmount.toLocaleString()} من ${m.fee.toLocaleString()} ج.م)` : `مستحق ${m.fee.toLocaleString()} ج.م`}\n`;
        });
      }
      if (financials.otherCollectionsDebt > 0) {
        text += `• *التحصيلات الأخرى غير المسددة:* ${financials.otherCollectionsDebt.toLocaleString()} ج.م\n`;
      }
    } else {
      text += `\n🎉 *جميع الشهور والاشتراكات مسددة بالكامل حتى تاريخه.*\n`;
    }

    text += `\nشاكرين لكم حسن تعاونكم وحرصكم الدائم.\n`;
    text += `إدارة اتحاد ملاك عمارة بيراميدز فيو ١ 🏢`;
    return text;
  };

  // Instant direct formatted text WhatsApp sharing for account statement
  const handleSendWhatsAppText = (target: 'owner' | 'tenant') => {
    if (!activeResident) return;
    const phoneToUse = target === 'owner' ? (activeOwnerPhone || '') : (activeTenantPhone || '');
    let cleanPhone = toWhatsAppNumber(phoneToUse);

    if (!cleanPhone) {
      const name = target === 'owner' ? activeOwnerName : (activeTenantName || 'المستأجر');
      const userEntered = window.prompt(`رقم هاتف (${name}) غير مسجل بالنظام.\nيرجى إدخال رقم الواتساب لإرسال كشف الحساب إليه مباشرة:`);
      if (userEntered && userEntered.trim()) {
        cleanPhone = toWhatsAppNumber(userEntered.trim());
      } else {
        alert('يرجى إدخال رقم هاتف صالح للتمكن من إرسال كشف الحساب عبر الواتساب.');
        return;
      }
    }

    const text = getWhatsAppSummaryText(target);
    const waUrl = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}` 
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

    try {
      const link = document.createElement('a');
      link.href = waUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }

    setToastMessage(`تم فتح محادثة الواتساب لإرسال كشف الحساب النصي المنسق لشقة ${activeResident.flatNumber} ✓`);
    setTimeout(() => setToastMessage(null), 6000);
  };

  // Ultra-fast client-side image generator returning Blob & File for sharing
  const generateFreshImageBlob = async (): Promise<GeneratedImageResult | null> => {
    if (!activeResident) return null;
    setIsGeneratingImage(true);
    try {
      const cleanName = (activeOwnerName || activeResident.name).trim().replace(/\s+/g, '_');
      const fileName = `كشف_حساب_وحدة_${activeResident.flatNumber}_${cleanName}.png`;
      const res = await generateElementImageBlob('statement-printable-area', fileName);
      setGeneratedImageResult(res);
      return res;
    } catch (e) {
      console.error('Image generation error:', e);
      alert('حدث خطأ أثناء توليد صورة كشف الحساب، يُرجى المحاولة مرة أخرى.');
      return null;
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Opens the visual image preview and direct sharing modal
  const handleOpenShareModal = async () => {
    const img = await generateFreshImageBlob();
    if (img) {
      setIsShareModalOpen(true);
    }
  };

  // Direct WhatsApp sharing with Image support
  const handleShareWhatsApp = async (target: 'owner' | 'tenant', withImage: boolean = true) => {
    if (!activeResident) return;
    const phoneToUse = target === 'owner' ? (activeOwnerPhone || '') : (activeTenantPhone || '');
    const cleanPhone = toWhatsAppNumber(phoneToUse);
    const targetLabel = target === 'owner' ? `المالك (${activeOwnerName})` : `المستأجر (${activeTenantName || 'المستأجر'})`;
    const text = getWhatsAppSummaryText(target);

    if (!withImage) {
      const waUrl = cleanPhone 
        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}` 
        : `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
      return;
    }

    const img = await generateFreshImageBlob();
    if (!img) return;

    // 1. Try Native Web Share API with File (Mobile devices send image directly to WhatsApp recipient!)
    if (navigator.canShare && navigator.canShare({ files: [img.file] })) {
      try {
        await navigator.share({
          files: [img.file],
          title: `كشف حساب وحدة ${activeResident.flatNumber}`,
          text: text,
        });
        return;
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError') return;
        console.warn('Native file share failed or cancelled, using fallback:', shareErr);
      }
    }

    // 2. Desktop / browser fallback: copy image to clipboard + download PNG + open WhatsApp Web/URL
    let copied = false;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': img.blob })
        ]);
        copied = true;
      }
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }

    img.download();

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const waUrl = isMobile
      ? (cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`)
      : (cleanPhone ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}` : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`);

    window.open(waUrl, '_blank');

    setToastMessage(
      copied
        ? `تم نسخ صورة كشف الحساب للحافظة وتحميلها لجهازك، وجاري فتح محادثة ${targetLabel} على واتساب — اضغط (لصق / Ctrl+V) في الشات لإرسال الصورة فوراً!`
        : `تم تحميل صورة كشف الحساب لجهازك وفتح محادثة ${targetLabel} على واتساب — يمكنك إرفاق الصورة المحفوظة في الشات الآن.`
    );
    setTimeout(() => setToastMessage(null), 8000);
  };

  // Copy Image to Clipboard
  const handleCopyImageToClipboard = async () => {
    let img = generatedImageResult;
    if (!img) {
      img = await generateFreshImageBlob();
    }
    if (!img) return;

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': img.blob })
        ]);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 3000);
      } else {
        alert('المتصفح لا يدعم نسخ الصور مباشرة، يُرجى الضغط على تحميل الصورة.');
      }
    } catch (e) {
      console.error('Clipboard copy error:', e);
      alert('تعذر نسخ الصورة للحافظة، يمكنك تحميل الصورة بدلاً من ذلك.');
    }
  };

  const handlePrint = () => {
    printReportElement('statement-printable-area');
  };

  if (!activeResident) {
    if (!isResidentOnly) {
      return (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-md text-right space-y-3" dir="rtl">
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3 text-right">
              <div className="w-9 h-9 rounded-xl bg-blue-900 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <User className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-black text-slate-800 block">كشف حساب واشتراكات الوحدة</span>
                <span className="text-[11px] text-slate-400 font-bold">اختر رقم الوحدة واسم الساكن للاطلاع على كشف الحساب والمديونيات</span>
              </div>
            </div>
            
            <div className="w-full sm:w-auto flex items-center gap-2 max-w-full">
              <select
                value=""
                onChange={(e) => {
                  const chosenId = e.target.value;
                  setSelectedLocalId(chosenId);
                  const found = residents.find(r => r.id === chosenId || isSameFlatNumber(r.flatNumber, chosenId));
                  if (found) {
                    onSelectResidentId?.(found.id);
                    onSelectFlatNumber?.(found.flatNumber);
                  } else {
                    onSelectResidentId?.('');
                  }
                }}
                className="w-full sm:w-64 min-w-0 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-blue-950 outline-none cursor-pointer hover:border-blue-500 transition shadow-xs"
              >
                <option value="">اختار وحدة</option>
                {floorGroups.map((group, idx) => (
                  <optgroup key={idx} label={`📍 ${group.floorLabel}`}>
                    {group.residents.map(r => (
                      <option key={r.id} value={r.id}>
                        {formatResidentOptionLabel(r, 'latest')}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm text-center">
        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-extrabold text-slate-800">جاري تحميل كشف حساب واشتراكات وحدتك...</h3>
        <p className="text-xs text-slate-500 mt-1">إذا لم تظهر بيانات وحدتك، يرجى مراجعة إدارة الاتحاد للتأكد من ربط وتفعيل رقم وحدتك على النظام.</p>
      </div>
    );
  }

  const isDebt = financials.netBalance < 0;
  const isSurplus = financials.netBalance > 0;
  const isSettled = financials.netBalance === 0;

  return (
    <div className="space-y-4 sm:space-y-6 text-right w-full" dir="rtl">
      {/* Main Statement Container */}
      <div className={`bg-white rounded-3xl ${isResidentOnly ? 'p-2.5 sm:p-5' : 'p-5 sm:p-7'} border border-slate-100 shadow-xl shadow-slate-100/50 space-y-5 sm:space-y-6 w-full`}>
        
        {/* Prominent Unit & Resident Selector for Admin Mode */}
        {!isResidentOnly && (
          <div className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2 text-right">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-950 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-black text-slate-800 block">اختر رقم الوحدة واسم الساكن لعرض كشف الحساب:</span>
                {activeResident ? (
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold text-slate-600 mt-0.5">
                    <span className="text-blue-900 font-black">وحدة {activeResident.flatNumber}:</span>
                    <span className="text-slate-800 font-extrabold">المالك: {activeOwnerName}</span>
                    {activeTenantName ? (
                      <span className="text-amber-800 font-black bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[10px]">
                        المستأجر: {activeTenantName}
                      </span>
                    ) : (
                      <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[10px]">
                        الشاغل: المالك (بدون مستأجر لهذه الفترة)
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[8px] text-slate-400 font-bold">يمكنك اختيار أي وحدة لعرض كامل تفاصيل اشتراكاتها ومدفوعاتها ومشاركتها</span>
                )}
              </div>
            </div>
            
            <div className="w-full sm:w-auto flex items-center gap-2 max-w-full">
              <select
                value={activeResident?.id || ''}
                onChange={(e) => {
                  const chosenId = e.target.value;
                  setSelectedLocalId(chosenId);
                  const found = residents.find(r => r.id === chosenId || isSameFlatNumber(r.flatNumber, chosenId));
                  if (found) {
                    onSelectResidentId?.(found.id);
                    onSelectFlatNumber?.(found.flatNumber);
                  } else {
                    onSelectResidentId?.('');
                  }
                }}
                className="w-full sm:w-60 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-blue-950 outline-none cursor-pointer hover:border-blue-300 transition shadow-xs"
              >
                <option value="">اختار وحدة</option>
                {floorGroups.map((group, idx) => (
                  <optgroup key={idx} label={`📍 ${group.floorLabel}`}>
                    {group.residents.map(r => (
                      <option key={r.id} value={r.id}>
                        {formatResidentOptionLabel(r, 'latest')}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {activeResident && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLocalId('');
                    onSelectResidentId?.('');
                  }}
                  className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl border border-rose-200 transition cursor-pointer shrink-0 flex items-center justify-center"
                  title="إغلاق كشف الحساب والعودة للوضع الافتراضي"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        )}
        
        {/* Header Bar & Unit Switcher */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4 sm:pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 bg-blue-900 text-white rounded-xl text-xs font-black">
                كشف حساب واشتراكات الوحدة
              </span>
              <span className="px-2.5 py-1 bg-blue-50 text-blue-900 border border-blue-200/60 rounded-xl text-xs font-extrabold">
                وحدة {activeResident.flatNumber}
              </span>
              <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">
                {activeResident.activityType}
              </span>
              {activeOwnerPhone && (
                <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-xl text-xs font-mono font-bold inline-flex items-center gap-1 phone-number-display" dir="ltr">
                  <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                  <span dir="ltr">{formatPhoneForDisplay(activeOwnerPhone)}</span>
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-950 flex items-center gap-2 mt-1">
              <span>{activeOwnerName}</span>
              {activeTenantName && (
                <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 inline-flex items-center gap-1">
                  <span>المستأجر: {activeTenantName}</span>
                  {activeTenantPhone && (
                    <span dir="ltr" className="font-mono text-[10px] text-amber-900 font-bold phone-number-display">({formatPhoneForDisplay(activeTenantPhone)})</span>
                  )}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              الفترة المحاسبية: <span className="font-black text-slate-800">{accountingPeriodDisplay}</span> | التقرير محدث ومطابق لحالة الوحدة
            </p>
          </div>

          {/* Actions Toolbar (Hidden in resident mode) */}
          {!isResidentOnly && (
            <div className="w-full pt-2 space-y-2">
              {/* Action Buttons in 1 Row */}
              <div className={`grid ${activeTenantName && activeTenantPhone ? 'grid-cols-4' : 'grid-cols-3'} gap-2 w-full`}>
                {activeTenantName && activeTenantPhone ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSendWhatsAppText('owner')}
                      className="w-full py-2.5 px-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 text-center"
                      title="إرسال رسالة نصية منسقة بكشف الحساب عبر واتساب المالك"
                    >
                      <Send className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">واتساب المالك (نص)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendWhatsAppText('tenant')}
                      className="w-full py-2.5 px-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 text-center"
                      title="إرسال رسالة نصية منسقة بكشف الحساب عبر واتساب المستأجر"
                    >
                      <Send className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">واتساب المستأجر (نص)</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendWhatsAppText('owner')}
                    className="w-full py-2.5 px-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 text-center"
                    title="إرسال رسالة نصية منسقة ومجملة بكشف الحساب عبر واتساب الوحدة"
                  >
                    <Send className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">إرسال كشف الحساب نصياً</span>
                  </button>
                )}

                <button
                  onClick={handleOpenShareModal}
                  disabled={isGeneratingImage}
                  className="w-full py-2.5 px-1 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  title="توليد صورة كشف الحساب ومعاينتها ومشاركتها مباشرة"
                >
                  {isGeneratingImage ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-200 shrink-0" />
                      <span className="truncate">جاري التوليد...</span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      <span className="truncate">معاينة ومشاركة الصورة</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handlePrint}
                  className="w-full py-2.5 px-1 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  title="طباعة كشف الحساب"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">طباعة</span>
                </button>
              </div>

              {/* Toast Guidance Notification */}
              {toastMessage && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-xl text-xs font-bold flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="flex-1">{toastMessage}</div>
                  <button 
                    onClick={() => setToastMessage(null)}
                    className="text-emerald-700 hover:text-emerald-950 cursor-pointer p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Financial Key Metric Cards - Centered & Uniform */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          
          {/* 1. Monthly Fee */}
          <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3 sm:p-4 text-center flex flex-col items-center justify-center space-y-1 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 block">اشتراك شهري</span>
            <div className="flex items-baseline justify-center gap-1 font-black text-slate-800" dir="ltr">
              <span className="text-base sm:text-xl font-black">{unitPrescribedInfo.monthlyFee.toLocaleString()}</span>
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400">ج.م</span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block">بحسب فئة {unitPrescribedInfo.activityType || activeResident.activityType || 'سكني'}</span>
          </div>

          {/* 2. Previous Balance Card */}
          {(() => {
            const initBal = effectiveCarriedBalance;
            const isCarriedFromPriorYear = currentYear > startYear;
            return (
              <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3 sm:p-4 text-center flex flex-col items-center justify-center space-y-1 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 block">
                  {isCarriedFromPriorYear ? `رصيد سابق مرحل (${currentYear - 1})` : 'رصيد سابق مرحل'}
                </span>
                <div className="flex items-baseline justify-center gap-1 font-black" dir="ltr">
                  <span className={`text-base sm:text-xl font-black ${
                    initBal < 0 ? 'text-amber-700' : initBal > 0 ? 'text-teal-700' : 'text-slate-800'
                  }`}>
                    {initBal < 0 
                      ? `-${Math.abs(initBal).toLocaleString()}` 
                      : initBal > 0 
                      ? `+${initBal.toLocaleString()}` 
                      : '0'}
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-400">ج.م</span>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold block">
                  {initBal < 0 
                    ? (isCarriedFromPriorYear ? `مديونية مرحلة من ${currentYear - 1}` : 'مديونية سابقة') 
                    : initBal > 0 
                    ? (isCarriedFromPriorYear ? `فائض مرحل من ${currentYear - 1}` : 'فائض مرحل') 
                    : 'لا يوجد رصيد سابق'}
                </span>
              </div>
            );
          })()}

          {/* 3. Expected Dues */}
          <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3 sm:p-4 text-center flex flex-col items-center justify-center space-y-1 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 block">إجمالي المطلوب حتى تاريخه</span>
            <div className="flex items-baseline justify-center gap-1 font-black text-slate-800" dir="ltr">
              <span className="text-base sm:text-xl font-black">{financials.expectedDues.toLocaleString()}</span>
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400">ج.م</span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block">
              {financials.monthsElapsed} شهر حتى تاريخه
            </span>
          </div>

          {/* 4. Total Paid */}
          <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3 sm:p-4 text-center flex flex-col items-center justify-center space-y-1 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 block">إجمالي المسدد فعلياً</span>
            <div className="flex items-baseline justify-center gap-1 font-black text-emerald-700" dir="ltr">
              <span className="text-base sm:text-xl font-black">{financials.totalPaid.toLocaleString()}</span>
              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-600">ج.م</span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block">
              {unitPayments.length} عمليات سداد
            </span>
          </div>

        </div>

        {/* 📋 بيان وتفصيل المبالغ المستحقة (6 أجزاء كاملة تماماً كما هي في بيانات وإيصال الوحدة) */}
        {claimBreakdown && (
          <div className={`p-3.5 sm:p-4 rounded-2xl text-slate-900 text-xs font-black space-y-3 shadow-xs border ${
            claimBreakdown.totalArrearsAndDebts === 0
              ? 'bg-gradient-to-b from-emerald-50/70 to-slate-50 border-emerald-300'
              : 'bg-gradient-to-b from-rose-50/80 to-slate-50 border-rose-300'
          }`}>
            {/* Header Banner */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm">
                {claimBreakdown.totalArrearsAndDebts === 0 ? (
                  <div className="flex items-center gap-1.5 text-emerald-900">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>📋 بيان وتفصيل المبالغ المستحقة (الحساب مسدد بالكامل ✓):</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>📋 بيان وتفصيل المبالغ المستحقة على الوحدة:</span>
                  </div>
                )}
              </div>
              <span className="text-[11px] bg-white font-black px-2.5 py-0.5 rounded-lg border border-slate-200 text-slate-800">
                الوحدة {activeResident.flatNumber}
              </span>
            </div>

            {/* 1️⃣ الجزء الأول: حالة الشهر الحالي كما هي بدون تعديل مع كتابة قيمة المسدد عن التحصيلات الشهرية */}
            <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5">
              <div className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
                <span>1️⃣ حالة الشهر الحالي ({claimBreakdown.monthName} {claimBreakdown.targetYear}):</span>
              </div>
              <div className="text-xs text-slate-800 pr-3 space-y-1 font-bold">
                <div>• {claimBreakdown.subsLineText}</div>
                <div>• {claimBreakdown.otherLineText}</div>
              </div>
            </div>

            {/* 2️⃣ الجزء الثاني: إجمالي المبالغ المستحقة للاشتراك الشهري */}
            <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-2">
              <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block"></span>
                <span>2️⃣ الاشتراكات الشهرية:</span>
              </div>
              <div className="text-xs text-slate-800 pr-3 space-y-1.5 font-bold">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">• إجمالي المستحق:</span>
                  <span className="font-black text-slate-900">{claimBreakdown.priorSubsDue.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between items-center text-emerald-800">
                  <span>• المسدد:</span>
                  <span className="font-black">{claimBreakdown.priorSubsPaid.toLocaleString()} ج.م</span>
                </div>
                <div className={`flex justify-between items-center pt-1 border-t border-dashed border-slate-200 font-black ${
                  claimBreakdown.priorSubsDiff > 0 ? 'text-rose-700' : claimBreakdown.priorSubsDiff < 0 ? 'text-emerald-700' : 'text-slate-600'
                }`}>
                  <span>• الفرق بينهما:</span>
                  <span className="underline">{claimBreakdown.priorSubsStatusText}</span>
                </div>
              </div>
            </div>

            {/* 3️⃣ الجزء الثالث: إجمالي المبالغ المستحقة عن التحصيلات الأخرى */}
            <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-2">
              <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block"></span>
                <span>3️⃣ التحصيلات الأخرى:</span>
              </div>
              <div className="text-xs text-slate-800 pr-3 space-y-1.5 font-bold">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">• إجمالي المستحق:</span>
                  <span className="font-black text-slate-900">{claimBreakdown.priorOtherDue.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between items-center text-emerald-800">
                  <span>• المسدد:</span>
                  <span className="font-black">{claimBreakdown.priorOtherPaid.toLocaleString()} ج.م</span>
                </div>
                <div className={`flex justify-between items-center pt-1 border-t border-dashed border-slate-200 font-black ${
                  claimBreakdown.priorOtherDiff > 0 ? 'text-rose-700' : claimBreakdown.priorOtherDiff < 0 ? 'text-emerald-700' : 'text-slate-600'
                }`}>
                  <span>• الفرق بينهما:</span>
                  <span className="underline">{claimBreakdown.priorOtherStatusText}</span>
                </div>
              </div>
            </div>

            {/* 4️⃣ الجزء الرابع: مديونيات سابقة */}
            <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5">
              <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block"></span>
                <span>4️⃣ مديونيات سابقة:</span>
              </div>
              <div className="text-xs text-slate-800 pr-3 font-bold flex justify-between items-center">
                <span className="text-slate-600">• القيمة:</span>
                <span className={`font-black ${
                  claimBreakdown.previousDebtAmount > 0 
                    ? 'text-rose-700 underline' 
                    : claimBreakdown.previousSurplusAmount > 0 
                    ? 'text-emerald-700 underline' 
                    : 'text-slate-700'
                }`}>
                  {claimBreakdown.previousDebtAmount > 0
                    ? `${claimBreakdown.previousDebtAmount.toLocaleString()} ج.م (مديونيات سابقة)`
                    : (claimBreakdown.previousSurplusAmount > 0
                        ? `+${claimBreakdown.previousSurplusAmount.toLocaleString()} ج.م (رصيد موجب دائن مرحل)`
                        : '0 ج.م (لا توجد مديونيات سابقة)')}
                </span>
              </div>
            </div>

            {/* 5️⃣ & 6️⃣ المستطيل المالي المطلوب للتفصيل */}
            <div className="p-3.5 bg-white rounded-xl border-2 border-amber-400/90 shadow-2xs space-y-2.5 text-xs">
              {/* الجزء الخامس */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-slate-900 font-black">
                <span>5️⃣ إجمالي المستحق عن هذا الشهر:</span>
                <span className="text-blue-900 font-black text-xs sm:text-sm bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 self-start sm:self-auto">
                  {claimBreakdown.currentMonthTotalDue.toLocaleString()} ج.م
                </span>
              </div>

              {/* الجزء السادس */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-slate-900 font-black pt-2.5 border-t border-dashed border-amber-300">
                <span>6️⃣ إجمالي المتأخرات والمديونيات:</span>
                <span className={`font-black text-xs sm:text-sm px-2.5 py-1 rounded-lg border self-start sm:self-auto ${
                  claimBreakdown.totalArrearsAndDebts > 0
                    ? 'text-rose-900 bg-rose-50 border-rose-200'
                    : 'text-emerald-900 bg-emerald-50 border-emerald-200'
                }`}>
                  {claimBreakdown.totalArrearsAndDebts > 0
                    ? `${claimBreakdown.totalArrearsAndDebts.toLocaleString()} ج.م`
                    : '0 ج.م (خالص بالكامل)'}
                </span>
              </div>
            </div>

            {/* Encouraging / Thanking Note */}
            {claimBreakdown.totalArrearsAndDebts === 0 ? (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-[11px] font-bold text-center leading-relaxed shadow-2xs">
                🌺 نشكركم جزيل الشكر والتقدير على حرصكم الدائم وسدادكم المنتظم، مما يساهم مباشرةً في الحفاظ على العمارة وتطوير خدماتها.
              </div>
            ) : (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] font-bold text-center leading-relaxed shadow-2xs">
                🤝 نأمل من سيادتكم التكرم بالمبادرة بسداد المستحقات في أقرب وقت لضمان استمرار خدمات النظافة، الحراسة، الصيانة، وتشغيل المصاعد بكفاءة لراحة جميع السكّان.
              </div>
            )}
          </div>
        )}

        {/* Section: Months Breakdown (الشهور المسددة وغير المسددة) */}
        <div className="space-y-3 pt-2 w-full">
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-950 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-900" />
                <span>كشف الشهور تفصيلياً (الشهور المسددة وغير المسددة)</span>
              </h3>
              {viewMode === 'month' && currentMonth !== undefined ? (
                <span className="px-2.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-900 text-[11px] font-black rounded-lg">
                  الفلتر: حتى شهر {monthNamesArabic[currentMonth]} {currentYear}
                </span>
              ) : viewMode === 'year' ? (
                <span className="px-2.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-black rounded-lg">
                  الفلتر: كشف حساب سنوي لسنة {currentYear}
                </span>
              ) : activePeriod ? (
                <span className="px-2.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-900 text-[11px] font-black rounded-lg">
                  فترة: {activePeriod.name} ({formatPeriodDateRange(activePeriod.startDate, activePeriod.endDate)})
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
              {viewMode === 'month' && currentMonth !== undefined
                ? `متابعة حالة الحساب في الفترة المحاسبية حتى شهر ${monthNamesArabic[currentMonth]} ${currentYear}`
                : viewMode === 'year'
                ? `متابعة كشف الحساب السنوي للوحدة لسنة ${currentYear}`
                : activePeriod
                ? `متابعة حالة كل شهر للفترة المحاسبية النشطة (${formatPeriodDateRange(activePeriod.startDate, activePeriod.endDate)})`
                : 'متابعة حالة كل شهر من تاريخ بدء المحاسبة حتى الشهر الحالي'}
            </p>
          </div>

          {/* Filter Tabs (Full Width & Equal Button Sizes) */}
          {!isResidentOnly && (
            <div className={`w-full bg-slate-100 p-1.5 rounded-2xl grid ${exemptMonthsList.length > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-1.5 text-xs font-black border border-slate-200/60 shadow-2xs`}>
              <button
                type="button"
                onClick={() => setMonthFilter('all')}
                className={`w-full py-2 px-1.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-center ${
                  monthFilter === 'all' 
                    ? 'bg-white text-blue-950 shadow-xs font-black border border-slate-200/80' 
                    : 'text-slate-600 hover:text-slate-900 font-bold'
                }`}
              >
                <span>الكل</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  monthFilter === 'all' ? 'bg-blue-100 text-blue-950' : 'bg-slate-200 text-slate-700'
                }`}>
                  {monthsTimeline.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMonthFilter('paid')}
                className={`w-full py-2 px-1.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-center ${
                  monthFilter === 'paid' 
                    ? 'bg-emerald-600 text-white shadow-xs font-black' 
                    : 'text-emerald-800 hover:text-emerald-900 bg-emerald-50/70 font-bold border border-emerald-100/80'
                }`}
              >
                <span>المسددة</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  monthFilter === 'paid' ? 'bg-emerald-700/60 text-white' : 'bg-emerald-200/80 text-emerald-900'
                }`}>
                  {paidMonthsList.length}
                </span>
              </button>

              {exemptMonthsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMonthFilter('exempt')}
                  className={`w-full py-2 px-1.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-center ${
                    monthFilter === 'exempt' 
                      ? 'bg-slate-700 text-white shadow-xs font-black' 
                      : 'text-slate-800 hover:text-slate-900 bg-slate-200/80 font-bold border border-slate-300'
                  }`}
                >
                  <span>معفي</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    monthFilter === 'exempt' ? 'bg-slate-800 text-white' : 'bg-slate-300 text-slate-800'
                  }`}>
                    {exemptMonthsList.length}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setMonthFilter('unpaid')}
                className={`w-full py-2 px-1.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-center ${
                  monthFilter === 'unpaid' 
                    ? 'bg-rose-600 text-white shadow-xs font-black' 
                    : 'text-rose-800 hover:text-rose-900 bg-rose-50/70 font-bold border border-rose-100/80'
                }`}
              >
                <span>غير المسددة</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  monthFilter === 'unpaid' ? 'bg-rose-700/60 text-white' : 'bg-rose-200/80 text-rose-900'
                }`}>
                  {unpaidMonthsList.length}
                </span>
              </button>
            </div>
          )}

          {/* Months Table - Full Width with Compact Columns & Sticky First Column */}
          <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-2xs w-full bg-white">
            <div className="overflow-x-auto w-full" ref={table1Ref} onScroll={handleScroll1}>
              <table className="w-full min-w-[480px] sm:min-w-[520px] text-right border-collapse text-[11px] sm:text-xs table-fixed">
                <colgroup>
                  <col className="w-[11%] min-w-[46px]" />
                  <col className="w-[13%] min-w-[56px]" />
                  <col className="w-[16%] min-w-[66px]" />
                  <col className="w-[15%] min-w-[64px]" />
                  <col className="w-[17%] min-w-[70px]" />
                  <col className="w-[15%] min-w-[60px]" />
                  <col className="w-[13%] min-w-[54px]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50/90 text-slate-600 font-extrabold text-[10.5px] sm:text-[11px] border-b border-slate-100">
                    <th className="sticky right-0 z-20 bg-slate-50 px-1 py-1.5 whitespace-nowrap text-center border-l border-slate-200/80 shadow-[-2px_0_4px_rgba(0,0,0,0.03)] text-[10px] sm:text-[11px]">
                      الشهور
                    </th>
                    <th className="px-1.5 py-1.5 sm:px-2 whitespace-nowrap text-right">المستحق</th>
                    <th className="px-1.5 py-1.5 sm:px-2 whitespace-nowrap text-right">المسدد</th>
                    <th className="px-1 py-1.5 whitespace-nowrap text-center text-[9.5px] sm:text-[10px]">
                      فئة التحصيل
                    </th>
                    <th className="px-1.5 py-1.5 sm:px-2 whitespace-nowrap text-center">حالة السداد</th>
                    <th className="px-1.5 py-1.5 sm:px-2 whitespace-nowrap text-center sm:text-right">رقم الإيصال</th>
                    <th className="px-1.5 py-1.5 sm:px-2 whitespace-nowrap text-center">صورة الإيصال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                  {/* Row for Old Debt / Previous Balance in all cases (negative, positive, or 0) */}
                  {(() => {
                    const initBal = effectiveCarriedBalance !== 0 
                      ? effectiveCarriedBalance 
                      : (claimBreakdown?.previousDebtAmount && claimBreakdown.previousDebtAmount > 0)
                        ? -claimBreakdown.previousDebtAmount
                        : (claimBreakdown?.previousSurplusAmount && claimBreakdown.previousSurplusAmount > 0)
                          ? claimBreakdown.previousSurplusAmount
                          : (activeResident?.initialBalance || 0);
                    const isNeg = initBal < 0;
                    const isPos = initBal > 0;
                    const isCarried = currentYear > startYear;
                    const rowBg = isNeg 
                      ? 'bg-amber-50/60 border-b border-amber-200/70 text-amber-950' 
                      : isPos 
                      ? 'bg-teal-50/60 border-b border-teal-200/70 text-teal-950' 
                      : 'bg-slate-50/40 border-b border-slate-100 text-slate-700';

                    return (
                      <tr className={rowBg}>
                        <td className={`sticky right-0 z-10 ${isNeg ? 'bg-amber-50' : isPos ? 'bg-teal-50' : 'bg-slate-50'} px-1 py-1 whitespace-nowrap leading-tight border-l border-slate-200/80 shadow-[-2px_0_4px_rgba(0,0,0,0.03)] text-center`}>
                          <div className="flex flex-col items-center justify-center leading-none py-0.5">
                            <span className="font-black text-slate-900 text-[10px] sm:text-[11px]">رصيد</span>
                            <span className="text-[9px] sm:text-[10px] font-black text-slate-600 mt-0.5">سابق</span>
                          </div>
                        </td>
                        <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap font-bold text-[11px] sm:text-xs">
                          {isNeg ? `${Math.abs(initBal).toLocaleString()} ج.م` : '0 ج.م'}
                        </td>
                        <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap font-bold text-[11px] sm:text-xs">
                          {isPos ? `${initBal.toLocaleString()} ج.م` : '0 ج.م'}
                        </td>
                        <td className="px-1 py-1 whitespace-nowrap text-center text-[10px] sm:text-[11px]">
                          <span className="px-1 py-0.5 bg-slate-100 text-slate-700 border border-slate-200/80 rounded text-[9px] font-bold inline-block truncate max-w-[54px]" title={isCarried ? 'رصيد مرحل' : 'تسوية رصيد'}>
                            {isCarried ? 'مرحل' : 'تسوية'}
                          </span>
                        </td>
                        <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center">
                          {isNeg ? (
                            <span className="min-w-[62px] inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200/80 rounded-md text-[9.5px] font-black leading-none">
                              <Clock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                              <span>{isCarried ? `مديونية ${currentYear - 1}` : 'مديونية'}</span>
                            </span>
                          ) : isPos ? (
                            <span className="min-w-[62px] inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-200/80 rounded-md text-[9.5px] font-black leading-none">
                              <CheckCircle2 className="w-2.5 h-2.5 text-teal-600 shrink-0" />
                              <span>{isCarried ? `فائض ${currentYear - 1}` : 'رصيد دائن'}</span>
                            </span>
                          ) : (
                            <span className="min-w-[62px] inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded-md text-[9.5px] font-bold leading-none">
                              <span>0 ج.م</span>
                            </span>
                          )}
                        </td>
                        <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center text-[10.5px]">
                          <span className="font-mono px-1 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-600">
                            {isCarried ? 'مرحل' : (isNeg ? 'مديونية' : isPos ? 'رصيد' : '—')}
                          </span>
                        </td>
                        <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center text-[10.5px] text-slate-300 font-normal">
                          —
                        </td>
                      </tr>
                    );
                  })()}

                  {displayedMonths.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                        لا توجد شهور مسجلة.
                      </td>
                    </tr>
                  ) : (
                    displayedMonths.map((m, idx) => {
                      const monthlySubPayments = m.matchingPayments.filter(p =>
                        isMonthlySubscriptionType(p.paymentType) || !p.paymentType || p.paymentType === 'اشتрак شهري'
                      );
                      const otherCollectionPayments = m.matchingPayments.filter(p =>
                        !isMonthlySubscriptionType(p.paymentType) && p.paymentType && p.paymentType !== 'اشتراك شهري'
                      );

                      const totalSubRows = 1 + otherCollectionPayments.length;

                      const validMonthlySubPayments = monthlySubPayments.filter(
                        p => p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل'
                      );
                      const monthlySubPaidAmount = validMonthlySubPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
                      const isMonthlySubPaid = validMonthlySubPayments.length > 0 && (monthlySubPaidAmount >= m.fee || validMonthlySubPayments.some(p => p.isManuallyPaid));
                      const isMonthlySubPartial = monthlySubPaidAmount > 0 && monthlySubPaidAmount < m.fee && !validMonthlySubPayments.some(p => p.isManuallyPaid);

                      const act = (m.activityType || activeResident.activityType || '').trim();
                      const isMonthExempt = m.isExempt || 
                        Boolean(activeResident.isExempt) || 
                        act.includes('تشطيب') || 
                        act.includes('مغلق') || 
                        act.includes('مغلقة') || 
                        act.includes('معفي') || 
                        act.includes('معفاه') || 
                        act.includes('معفاة') || 
                        (m.fee === 0 && !isMonthlySubPaid && monthlySubPaidAmount === 0);

                      let subStatusInfo;
                      if (isMonthlySubPaid) {
                        subStatusInfo = getPaymentStatusDisplay('collected');
                      } else if (isMonthExempt) {
                        subStatusInfo = {
                          type: 'exempt' as const,
                          label: 'معفي',
                          badgeClass: 'bg-slate-200 text-slate-800 border-slate-300 font-black',
                          textClass: 'text-slate-800',
                          amountClass: 'text-slate-600 font-bold',
                          icon: Minus,
                        };
                      } else if (isMonthlySubPartial) {
                        subStatusInfo = {
                          type: 'pending' as const,
                          label: 'سداد جزئي',
                          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
                          textClass: 'text-amber-800',
                          amountClass: 'text-amber-700 font-bold',
                          icon: Clock,
                        };
                      } else if (validMonthlySubPayments.length > 0) {
                        subStatusInfo = getPaymentStatusDisplay(validMonthlySubPayments[0].status);
                      } else {
                        subStatusInfo = {
                          type: 'pending' as const,
                          label: 'غير مسدد',
                          badgeClass: 'bg-rose-50 text-rose-700 border-rose-200/80',
                          textClass: 'text-rose-700',
                          amountClass: 'text-rose-600 font-bold',
                          icon: AlertTriangle,
                        };
                      }

                      const firstMonthlySubPay = monthlySubPayments[0];

                      return (
                        <React.Fragment key={`sub-${m.year}-${m.monthNum}-${idx}`}>
                          {/* Main Row: Monthly Subscription (Present for every month) */}
                          <tr className={`group hover:bg-slate-50/70 transition ${isMonthExempt ? 'bg-slate-50/40' : !isMonthlySubPaid ? 'bg-rose-50/20' : ''} ${totalSubRows === 1 ? 'border-b border-slate-100' : ''}`}>
                            <td
                              rowSpan={totalSubRows}
                              className={`sticky right-0 z-10 ${isMonthExempt ? 'bg-slate-50/70 group-hover:bg-slate-100/80' : !isMonthlySubPaid ? 'bg-[#fef8f8] group-hover:bg-[#fcf2f2]' : 'bg-white group-hover:bg-slate-50'} px-1 py-1 whitespace-nowrap leading-tight border-l border-slate-200/80 shadow-[-2px_0_4px_rgba(0,0,0,0.03)] text-center align-middle`}
                            >
                              <div className="font-bold text-slate-900 text-[11px] sm:text-xs">
                                {monthNamesArabic[m.monthNum - 1]}
                              </div>
                              <div className="text-[9px] font-medium text-slate-400 leading-none mt-0.5">
                                {m.year}
                              </div>
                            </td>
                            <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-slate-600 font-bold text-[11px] sm:text-xs align-middle">
                              <div>{m.fee.toLocaleString()} ج.م</div>
                              {m.activityType && (
                                <div className="text-[9px] text-slate-400 font-normal">{m.activityType}</div>
                              )}
                            </td>
                            <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-[11px] sm:text-xs align-middle">
                              <span className={monthlySubPaidAmount > 0 ? subStatusInfo.amountClass : 'text-slate-400 font-normal'}>
                                {monthlySubPaidAmount.toLocaleString()} ج.م
                              </span>
                            </td>
                            <td className="px-1 py-1 whitespace-nowrap text-center text-[10px] sm:text-[11px] align-middle">
                              <span
                                className="px-1 py-0.5 bg-blue-50 text-blue-900 border border-blue-200/80 rounded text-[9px] font-bold inline-block truncate max-w-[70px]"
                                title="اشتراك شهري"
                              >
                                اشتراك شهري
                              </span>
                            </td>
                            <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center align-middle">
                              <span className={`min-w-[64px] inline-flex items-center justify-center gap-1 px-1.5 py-0.5 ${subStatusInfo.badgeClass} rounded-md text-[9.5px] font-black leading-none`}>
                                <subStatusInfo.icon className="w-2.5 h-2.5 shrink-0" />
                                <span>{subStatusInfo.label}</span>
                              </span>
                            </td>
                            <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center sm:text-right text-[10.5px] align-middle">
                              {firstMonthlySubPay ? (
                                <span
                                  className="font-mono px-1 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[75px]"
                                  title={firstMonthlySubPay.receiptNumber ? `#${firstMonthlySubPay.receiptNumber}` : 'مسدد'}
                                >
                                  {firstMonthlySubPay.receiptNumber ? `#${firstMonthlySubPay.receiptNumber}` : 'مسدد'}
                                </span>
                              ) : (
                                <span className="text-slate-300 font-normal">—</span>
                              )}
                            </td>
                            <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center text-xs align-middle">
                              {firstMonthlySubPay?.fileUrl ? (
                                <button
                                  type="button"
                                  onClick={() => onPreviewImage && firstMonthlySubPay.fileUrl && onPreviewImage(firstMonthlySubPay.fileUrl!)}
                                  className="inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-md text-[9px] font-bold transition cursor-pointer shadow-2xs"
                                  title="عرض صورة الإيصال"
                                >
                                  <ImageIcon className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                  <span>عرض</span>
                                </button>
                              ) : (
                                <span className="text-slate-300 font-normal">—</span>
                              )}
                            </td>
                          </tr>

                          {/* Sub-Rows: Other Collections (Appears only if there are other collection payments for this month) */}
                          {otherCollectionPayments.map((op, opIdx) => {
                            const opStatusInfo = getPaymentStatusDisplay(op.status);
                            const isLastSubRow = opIdx === otherCollectionPayments.length - 1;
                            return (
                              <tr
                                key={op.id || opIdx}
                                className={`group hover:bg-slate-50/70 transition bg-purple-50/10 ${isLastSubRow ? 'border-b border-slate-200' : ''}`}
                              >
                                <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-slate-400 font-normal text-[11px] sm:text-xs align-middle">
                                  —
                                </td>
                                <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-[11px] sm:text-xs align-middle">
                                  <span className={opStatusInfo.amountClass}>
                                    {op.amount.toLocaleString()} ج.م
                                  </span>
                                </td>
                                <td className="px-1 py-1 whitespace-nowrap text-center text-[10px] sm:text-[11px] align-middle">
                                  <span
                                    className="px-1 py-0.5 bg-purple-50 text-purple-900 border border-purple-200/80 rounded text-[9px] font-bold inline-block truncate max-w-[70px]"
                                    title={op.paymentType || 'تحصيلات أخرى'}
                                  >
                                    {op.paymentType || 'تحصيلات أخرى'}
                                  </span>
                                </td>
                                <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center align-middle">
                                  <span className={`min-w-[64px] inline-flex items-center justify-center gap-1 px-1.5 py-0.5 ${opStatusInfo.badgeClass} rounded-md text-[9.5px] font-black leading-none`}>
                                    <opStatusInfo.icon className="w-2.5 h-2.5 shrink-0" />
                                    <span>{opStatusInfo.label}</span>
                                  </span>
                                </td>
                                <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center sm:text-right text-[10.5px] align-middle">
                                  <span
                                    className="font-mono px-1 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[75px]"
                                    title={op.receiptNumber ? `#${op.receiptNumber}` : 'مسدد'}
                                  >
                                    {op.receiptNumber ? `#${op.receiptNumber}` : 'مسدد'}
                                  </span>
                                </td>
                                <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center text-xs align-middle">
                                  {op.fileUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => onPreviewImage && op.fileUrl && onPreviewImage(op.fileUrl!)}
                                      className="inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-md text-[9px] font-bold transition cursor-pointer shadow-2xs"
                                      title="عرض صورة الإيصال"
                                    >
                                      <ImageIcon className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                      <span>عرض</span>
                                    </button>
                                  ) : (
                                    <span className="text-slate-300 font-normal">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Section: Unit Payments & Collections Log (سجل مدفوعات وتحصيلات الوحدة) */}
        <div className="space-y-3 pt-4 w-full">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-950 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-700" />
                <span>سجل مدفوعات وتحصيلات الوحدة ({unitPayments.length} عملية تحصيل)</span>
              </h3>
              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                سجل كافة عمليات السداد والتحصيل المقيدة للوحدة تفصيلياً بنفس هضم وتنسيق الأعمدة
              </p>
            </div>
          </div>

          <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-2xs w-full bg-white">
            <div className="overflow-x-auto w-full" ref={table2Ref} onScroll={handleScroll2}>
              <table className="w-full min-w-[480px] sm:min-w-[520px] text-right border-collapse text-[11px] sm:text-xs table-fixed">
                <colgroup>
                  <col className="w-[11%] min-w-[46px]" />
                  <col className="w-[13%] min-w-[56px]" />
                  <col className="w-[16%] min-w-[66px]" />
                  <col className="w-[15%] min-w-[64px]" />
                  <col className="w-[17%] min-w-[70px]" />
                  <col className="w-[15%] min-w-[60px]" />
                  <col className="w-[13%] min-w-[54px]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50/90 text-slate-600 font-extrabold text-[10.5px] sm:text-[11px] border-b border-slate-100">
                    <th className="sticky right-0 z-20 bg-slate-50 px-1 py-1.5 whitespace-nowrap text-center border-l border-slate-200/80 shadow-[-2px_0_4px_rgba(0,0,0,0.03)] text-[10px] sm:text-[11px]">
                      الشهور
                    </th>
                    <th className="px-1.5 py-1.5 sm:px-2 whitespace-nowrap text-right">المستحق</th>
                    <th className="px-1.5 py-1.5 sm:px-2 whitespace-nowrap text-right">المسدد</th>
                    <th className="px-1 py-1.5 whitespace-nowrap text-center text-[9.5px] sm:text-[10px]">
                      فئة التحصيل
                    </th>
                    <th className="px-1.5 py-1.5 sm:px-2 whitespace-nowrap text-center">حالة السداد</th>
                    <th className="px-1.5 py-1.5 sm:px-2 whitespace-nowrap text-center sm:text-right">رقم الإيصال</th>
                    <th className="px-1.5 py-1.5 sm:px-2 whitespace-nowrap text-center">صورة الإيصال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                  {groupedUnitPayments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                        لا توجد عمليات سداد أو تحصيل مسجلة لهذه الوحدة حتى الآن.
                      </td>
                    </tr>
                  ) : (
                    groupedUnitPayments.map((grp, grpIdx) => {
                      if (grp.monthlySubPayments.length > 0) {
                        const firstSub = grp.monthlySubPayments[0];
                        const subStatusInfo = getPaymentStatusDisplay(firstSub.status);
                        const extraSubs = grp.monthlySubPayments.slice(1);

                        return (
                          <React.Fragment key={`grp-${grp.year}-${grp.monthNum}-${grpIdx}`}>
                            {/* Main Row: Monthly Subscription Collection */}
                            <tr className={`group hover:bg-slate-50/70 transition ${grp.totalRows === 1 ? 'border-b border-slate-100' : ''}`}>
                              <td
                                rowSpan={grp.totalRows}
                                className="sticky right-0 z-10 bg-white group-hover:bg-slate-50 px-1 py-1 whitespace-nowrap leading-tight border-l border-slate-200/80 shadow-[-2px_0_4px_rgba(0,0,0,0.03)] text-center align-middle"
                              >
                                <div className="font-bold text-slate-900 text-[11px] sm:text-xs">
                                  {monthNamesArabic[grp.monthNum - 1]}
                                </div>
                                <div className="text-[9px] font-medium text-slate-400 leading-none mt-0.5">
                                  {grp.year}
                                </div>
                              </td>
                              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-slate-600 font-bold text-[11px] sm:text-xs align-middle">
                                <div>{grp.prescribedFee.toLocaleString()} ج.م</div>
                                {grp.prescribedActivity && (
                                  <div className="text-[9px] text-slate-400 font-normal">{grp.prescribedActivity}</div>
                                )}
                              </td>
                              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-[11px] sm:text-xs align-middle">
                                <span className={subStatusInfo.amountClass}>
                                  {firstSub.amount.toLocaleString()} ج.م
                                </span>
                              </td>
                              <td className="px-1 py-1 whitespace-nowrap text-center text-[10px] sm:text-[11px] align-middle">
                                <span
                                  className="px-1 py-0.5 bg-blue-50 text-blue-900 border border-blue-200/80 rounded text-[9px] font-bold inline-block truncate max-w-[70px]"
                                  title="اشتراك شهري"
                                >
                                  اشتراك شهري
                                </span>
                              </td>
                              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center align-middle">
                                <span className={`min-w-[64px] inline-flex items-center justify-center gap-1 px-1.5 py-0.5 ${subStatusInfo.badgeClass} rounded-md text-[9.5px] font-black leading-none`}>
                                  <subStatusInfo.icon className="w-2.5 h-2.5 shrink-0" />
                                  <span>{subStatusInfo.label}</span>
                                </span>
                              </td>
                              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center sm:text-right text-[10.5px] align-middle">
                                <span
                                  className="font-mono px-1 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[75px]"
                                  title={firstSub.receiptNumber ? `#${firstSub.receiptNumber}` : 'مسدد'}
                                >
                                  {firstSub.receiptNumber ? `#${firstSub.receiptNumber}` : 'مسدد'}
                                </span>
                              </td>
                              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center text-xs align-middle">
                                {firstSub.fileUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => onPreviewImage && firstSub.fileUrl && onPreviewImage(firstSub.fileUrl)}
                                    className="inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-md text-[9px] font-bold transition cursor-pointer shadow-2xs"
                                    title="عرض صورة الإيصال"
                                  >
                                    <ImageIcon className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                    <span>عرض</span>
                                  </button>
                                ) : (
                                  <span className="text-slate-300 font-normal">—</span>
                                )}
                              </td>
                            </tr>

                            {/* Extra Subscription Payments for the same month (if any) */}
                            {extraSubs.map((es, esIdx) => {
                              const esStatusInfo = getPaymentStatusDisplay(es.status);
                              const isLastSubRow = esIdx === extraSubs.length - 1 && grp.otherCollectionPayments.length === 0;
                              return (
                                <tr
                                  key={es.id || esIdx}
                                  className={`group hover:bg-slate-50/70 transition ${isLastSubRow ? 'border-b border-slate-200' : ''}`}
                                >
                                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-slate-400 font-normal text-[11px] sm:text-xs align-middle">
                                    —
                                  </td>
                                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-[11px] sm:text-xs align-middle">
                                    <span className={esStatusInfo.amountClass}>
                                      {es.amount.toLocaleString()} ج.م
                                    </span>
                                  </td>
                                  <td className="px-1 py-1 whitespace-nowrap text-center text-[10px] sm:text-[11px] align-middle">
                                    <span
                                      className="px-1 py-0.5 bg-blue-50 text-blue-900 border border-blue-200/80 rounded text-[9px] font-bold inline-block truncate max-w-[70px]"
                                      title="اشتراك شهري"
                                    >
                                      اشتراك شهري
                                    </span>
                                  </td>
                                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center align-middle">
                                    <span className={`min-w-[64px] inline-flex items-center justify-center gap-1 px-1.5 py-0.5 ${esStatusInfo.badgeClass} rounded-md text-[9.5px] font-black leading-none`}>
                                      <esStatusInfo.icon className="w-2.5 h-2.5 shrink-0" />
                                      <span>{esStatusInfo.label}</span>
                                    </span>
                                  </td>
                                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center sm:text-right text-[10.5px] align-middle">
                                    <span
                                      className="font-mono px-1 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[75px]"
                                      title={es.receiptNumber ? `#${es.receiptNumber}` : 'مسدد'}
                                    >
                                      {es.receiptNumber ? `#${es.receiptNumber}` : 'مسدد'}
                                    </span>
                                  </td>
                                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center text-xs align-middle">
                                    {es.fileUrl ? (
                                      <button
                                        type="button"
                                        onClick={() => onPreviewImage && es.fileUrl && onPreviewImage(es.fileUrl)}
                                        className="inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-md text-[9px] font-bold transition cursor-pointer shadow-2xs"
                                        title="عرض صورة الإيصال"
                                      >
                                        <ImageIcon className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                        <span>عرض</span>
                                      </button>
                                    ) : (
                                      <span className="text-slate-300 font-normal">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}

                            {/* Sub-Rows: Other Collections underneath monthly subscription */}
                            {grp.otherCollectionPayments.map((op, opIdx) => {
                              const opStatusInfo = getPaymentStatusDisplay(op.status);
                              const isLastSubRow = opIdx === grp.otherCollectionPayments.length - 1;
                              return (
                                <tr
                                  key={op.id || opIdx}
                                  className={`group hover:bg-slate-50/70 transition bg-purple-50/10 ${isLastSubRow ? 'border-b border-slate-200' : ''}`}
                                >
                                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-slate-400 font-normal text-[11px] sm:text-xs align-middle">
                                    —
                                  </td>
                                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-[11px] sm:text-xs align-middle">
                                    <span className={opStatusInfo.amountClass}>
                                      {op.amount.toLocaleString()} ج.م
                                    </span>
                                  </td>
                                  <td className="px-1 py-1 whitespace-nowrap text-center text-[10px] sm:text-[11px] align-middle">
                                    <span
                                      className="px-1 py-0.5 bg-purple-50 text-purple-900 border border-purple-200/80 rounded text-[9px] font-bold inline-block truncate max-w-[70px]"
                                      title={op.paymentType || 'تحصيلات أخرى'}
                                    >
                                      {op.paymentType || 'تحصيلات أخرى'}
                                    </span>
                                  </td>
                                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center align-middle">
                                    <span className={`min-w-[64px] inline-flex items-center justify-center gap-1 px-1.5 py-0.5 ${opStatusInfo.badgeClass} rounded-md text-[9.5px] font-black leading-none`}>
                                      <opStatusInfo.icon className="w-2.5 h-2.5 shrink-0" />
                                      <span>{opStatusInfo.label}</span>
                                    </span>
                                  </td>
                                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center sm:text-right text-[10.5px] align-middle">
                                    <span
                                      className="font-mono px-1 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[75px]"
                                      title={op.receiptNumber ? `#${op.receiptNumber}` : 'مسدد'}
                                    >
                                      {op.receiptNumber ? `#${op.receiptNumber}` : 'مسدد'}
                                    </span>
                                  </td>
                                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center text-xs align-middle">
                                    {op.fileUrl ? (
                                      <button
                                        type="button"
                                        onClick={() => onPreviewImage && op.fileUrl && onPreviewImage(op.fileUrl)}
                                        className="inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-md text-[9px] font-bold transition cursor-pointer shadow-2xs"
                                        title="عرض صورة الإيصال"
                                      >
                                        <ImageIcon className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                        <span>عرض</span>
                                      </button>
                                    ) : (
                                      <span className="text-slate-300 font-normal">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      }

                      // If no monthly subscription was recorded for this month, only other collections:
                      const firstOp = grp.otherCollectionPayments[0];
                      const firstOpStatus = getPaymentStatusDisplay(firstOp.status);
                      const extraOps = grp.otherCollectionPayments.slice(1);

                      return (
                        <React.Fragment key={`grp-no-sub-${grp.year}-${grp.monthNum}-${grpIdx}`}>
                          <tr className={`group hover:bg-slate-50/70 transition bg-purple-50/10 ${grp.totalRows === 1 ? 'border-b border-slate-100' : ''}`}>
                            <td
                              rowSpan={grp.totalRows}
                              className="sticky right-0 z-10 bg-white group-hover:bg-slate-50 px-1 py-1 whitespace-nowrap leading-tight border-l border-slate-200/80 shadow-[-2px_0_4px_rgba(0,0,0,0.03)] text-center align-middle"
                            >
                              <div className="font-bold text-slate-900 text-[11px] sm:text-xs">
                                {monthNamesArabic[grp.monthNum - 1]}
                              </div>
                              <div className="text-[9px] font-medium text-slate-400 leading-none mt-0.5">
                                {grp.year}
                              </div>
                            </td>
                            <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-slate-400 font-normal text-[11px] sm:text-xs align-middle">
                              —
                            </td>
                            <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-[11px] sm:text-xs align-middle">
                              <span className={firstOpStatus.amountClass}>
                                {firstOp.amount.toLocaleString()} ج.م
                              </span>
                            </td>
                            <td className="px-1 py-1 whitespace-nowrap text-center text-[10px] sm:text-[11px] align-middle">
                              <span
                                className="px-1 py-0.5 bg-purple-50 text-purple-900 border border-purple-200/80 rounded text-[9px] font-bold inline-block truncate max-w-[70px]"
                                title={firstOp.paymentType || 'تحصيلات أخرى'}
                              >
                                {firstOp.paymentType || 'تحصيلات أخرى'}
                              </span>
                            </td>
                            <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center align-middle">
                              <span className={`min-w-[64px] inline-flex items-center justify-center gap-1 px-1.5 py-0.5 ${firstOpStatus.badgeClass} rounded-md text-[9.5px] font-black leading-none`}>
                                <firstOpStatus.icon className="w-2.5 h-2.5 shrink-0" />
                                <span>{firstOpStatus.label}</span>
                              </span>
                            </td>
                            <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center sm:text-right text-[10.5px] align-middle">
                              <span
                                className="font-mono px-1 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[75px]"
                                title={firstOp.receiptNumber ? `#${firstOp.receiptNumber}` : 'مسدد'}
                              >
                                {firstOp.receiptNumber ? `#${firstOp.receiptNumber}` : 'مسدد'}
                              </span>
                            </td>
                            <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center text-xs align-middle">
                              {firstOp.fileUrl ? (
                                <button
                                  type="button"
                                  onClick={() => onPreviewImage && firstOp.fileUrl && onPreviewImage(firstOp.fileUrl)}
                                  className="inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-md text-[9px] font-bold transition cursor-pointer shadow-2xs"
                                  title="عرض صورة الإيصال"
                                >
                                  <ImageIcon className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                  <span>عرض</span>
                                </button>
                              ) : (
                                <span className="text-slate-300 font-normal">—</span>
                              )}
                            </td>
                          </tr>
                          {extraOps.map((op, opIdx) => {
                            const opStatusInfo = getPaymentStatusDisplay(op.status);
                            const isLastSubRow = opIdx === extraOps.length - 1;
                            return (
                              <tr
                                key={op.id || opIdx}
                                className={`group hover:bg-slate-50/70 transition bg-purple-50/10 ${isLastSubRow ? 'border-b border-slate-200' : ''}`}
                              >
                                <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-slate-400 font-normal text-[11px] sm:text-xs align-middle">
                                  —
                                </td>
                                <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-[11px] sm:text-xs align-middle">
                                  <span className={opStatusInfo.amountClass}>
                                    {op.amount.toLocaleString()} ج.م
                                  </span>
                                </td>
                                <td className="px-1 py-1 whitespace-nowrap text-center text-[10px] sm:text-[11px] align-middle">
                                  <span
                                    className="px-1 py-0.5 bg-purple-50 text-purple-900 border border-purple-200/80 rounded text-[9px] font-bold inline-block truncate max-w-[70px]"
                                    title={op.paymentType || 'تحصيلات أخرى'}
                                  >
                                    {op.paymentType || 'تحصيلات أخرى'}
                                  </span>
                                </td>
                                <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center align-middle">
                                  <span className={`min-w-[64px] inline-flex items-center justify-center gap-1 px-1.5 py-0.5 ${opStatusInfo.badgeClass} rounded-md text-[9.5px] font-black leading-none`}>
                                    <opStatusInfo.icon className="w-2.5 h-2.5 shrink-0" />
                                    <span>{opStatusInfo.label}</span>
                                  </span>
                                </td>
                                <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center sm:text-right text-[10.5px] align-middle">
                                  <span
                                    className="font-mono px-1 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[75px]"
                                    title={op.receiptNumber ? `#${op.receiptNumber}` : 'مسدد'}
                                  >
                                    {op.receiptNumber ? `#${op.receiptNumber}` : 'مسدد'}
                                  </span>
                                </td>
                                <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 whitespace-nowrap text-center text-xs align-middle">
                                  {op.fileUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => onPreviewImage && op.fileUrl && onPreviewImage(op.fileUrl)}
                                      className="inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-md text-[9px] font-bold transition cursor-pointer shadow-2xs"
                                      title="عرض صورة الإيصال"
                                    >
                                      <ImageIcon className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                      <span>عرض</span>
                                    </button>
                                  ) : (
                                    <span className="text-slate-300 font-normal">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {/* Printable Area for Unit Account Statement (Hidden on screen, Visible only during printing) */}
      {activeResident && (
        <div id="statement-printable-area" className="printable-area hidden text-right p-6 font-sans" dir="rtl">
          {/* Header */}
          <div className="text-center space-y-2 border-b-2 border-slate-800 pb-4 mb-6">
            <h1 className="text-2xl font-black text-slate-900">اتحاد ملاك عمارة بيراميدز فيو ١</h1>
            <p className="text-sm font-bold text-slate-700">
              كشف حساب ومطالبات اشتراكات - وحدة رقم ({activeResident.flatNumber})
            </p>
            <div className="flex justify-between items-center text-xs text-slate-800 pt-2 font-bold border-t border-slate-200">
              <span>تاريخ إصدار الكشف: {new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span className="font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-300">
                تاريخ بدء المحاسبة: {accountingPeriodDisplay}
              </span>
            </div>
          </div>

          {/* Unit & Owner Info Box */}
          <div className="border border-slate-300 rounded-xl p-4 bg-slate-50/50 mb-6 text-xs">
            <h2 className="font-black text-slate-800 text-sm border-b border-slate-200 pb-2 mb-3">
              بيانات الوحدة والشاغل
            </h2>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              <div><span className="font-bold text-slate-500">رقم الوحدة:</span> <strong className="text-slate-900">( الوحدة {activeResident.flatNumber} - {activeResident.activityType} )</strong></div>
              <div><span className="font-bold text-slate-500">اسم المالك:</span> <strong className="text-slate-900">{activeOwnerName}</strong></div>
              <div><span className="font-bold text-slate-500">نوع النشاط:</span> <strong className="text-slate-900">{activeResident.activityType}</strong></div>
              <div><span className="font-bold text-slate-500">رقم هاتف المالك:</span> <strong className="text-slate-900 font-mono phone-number-display" dir="ltr">{activeOwnerPhone ? formatPhoneForDisplay(activeOwnerPhone) : '—'}</strong></div>
              <div><span className="font-bold text-slate-500">نوع الملكية:</span> <strong className="text-slate-900">{activeTenantName ? 'إيجار' : (hasHistory ? 'تمليك' : (activeResident.ownershipType || 'تمليك'))}</strong></div>
              {activeTenantName && (
                <div><span className="font-bold text-slate-500">اسم المستأجر:</span> <strong className="text-slate-900">{activeTenantName} {activeTenantPhone ? <span dir="ltr" className="font-mono text-slate-700 font-bold phone-number-display">({formatPhoneForDisplay(activeTenantPhone)})</span> : ''}</strong></div>
              )}
            </div>
          </div>

          {/* Financial Metrics Summary - 5 Symmetrical Metrics matching screen */}
          <div className="grid grid-cols-5 gap-2 border border-slate-300 rounded-xl p-3 bg-slate-50/50 mb-4 text-xs text-center">
            <div className="space-y-1">
              <span className="font-bold text-slate-500 block text-[11px]">اشتراك شهري</span>
              <div className="text-sm font-black text-slate-800">{financials.monthlyFee.toLocaleString()} ج.م</div>
              <span className="text-[9px] text-slate-400 block font-semibold">مبلغ الاشتراك المعتمد</span>
            </div>
            <div className="space-y-1 border-r border-slate-300">
              <span className="font-bold text-slate-500 block text-[11px]">رصيد سابق مرحل</span>
              <div className="text-sm font-black text-slate-800">
                {effectiveCarriedBalance < 0 
                  ? `-${Math.abs(effectiveCarriedBalance).toLocaleString()} ج.م` 
                  : effectiveCarriedBalance > 0 
                  ? `+${effectiveCarriedBalance.toLocaleString()} ج.م` 
                  : '0 ج.م'}
              </div>
              <span className="text-[9px] text-slate-400 block font-semibold">
                {effectiveCarriedBalance < 0 ? 'مديونية سابقة' : effectiveCarriedBalance > 0 ? 'رصيد دائن فائض' : 'لا يوجد رصيد سابق'}
              </span>
            </div>
            <div className="space-y-1 border-r border-slate-300">
              <span className="font-bold text-slate-500 block text-[11px]">إجمالي المطلوب حتى تاريخه</span>
              <div className="text-sm font-black text-blue-900">{financials.expectedDues.toLocaleString()} ج.م</div>
              <span className="text-[9px] text-slate-400 block font-semibold">{financials.monthsElapsed} شهر حتى اليوم</span>
            </div>
            <div className="space-y-1 border-r border-slate-300">
              <span className="font-bold text-slate-500 block text-[11px]">إجمالي المسدد فعلياً</span>
              <div className="text-sm font-black text-emerald-700">{financials.totalPaid.toLocaleString()} ج.م</div>
              <span className="text-[9px] text-slate-400 block font-semibold">{unitPayments.length} عملية سداد</span>
            </div>
            <div className="space-y-1 border-r border-slate-300">
              <span className="font-bold text-slate-500 block text-[11px]">الموقف المالي الختامي</span>
              <div className={`text-sm font-black ${financials.netBalance < 0 ? 'text-red-700' : financials.netBalance > 0 ? 'text-emerald-700' : 'text-blue-900'}`}>
                {financials.netBalance < 0 
                  ? `مديونية: -${Math.round(Math.abs(financials.netBalance)).toLocaleString()} ج.م` 
                  : financials.netBalance > 0 
                  ? `رصيد دائن: +${Math.round(financials.netBalance).toLocaleString()} ج.م` 
                  : 'مسدد بالكامل ✨'}
              </div>
              <span className="text-[9px] text-slate-400 block font-semibold">الرصيد الصافي للوحدة</span>
            </div>
          </div>

          {/* 📋 بيان وتفصيل المبالغ المستحقة للفترة المحاسبية (6 أجزاء كاملة تماماً كما هي معروضة على الشاشة) */}
          {claimBreakdown && (
            <div className={`p-3.5 rounded-2xl text-slate-900 text-xs font-black space-y-3 shadow-xs border mb-5 ${
              claimBreakdown.totalArrearsAndDebts === 0
                ? 'bg-gradient-to-b from-emerald-50/70 to-slate-50 border-emerald-300'
                : 'bg-gradient-to-b from-rose-50/80 to-slate-50 border-rose-300'
            }`}>
              {/* Header Banner */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm">
                  {claimBreakdown.totalArrearsAndDebts === 0 ? (
                    <div className="flex items-center gap-1.5 text-emerald-900">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>📋 بيان وتفصيل المبالغ المستحقة (الحساب مسدد بالكامل ✓):</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>📋 بيان وتفصيل المبالغ المستحقة على الوحدة:</span>
                    </div>
                  )}
                </div>
                <span className="text-[11px] bg-white font-black px-2.5 py-0.5 rounded-lg border border-slate-200 text-slate-800">
                  الوحدة {activeResident.flatNumber}
                </span>
              </div>

              {/* 1️⃣ الجزء الأول: حالة الشهر الحالي كما هي بدون تعديل مع كتابة قيمة المسدد عن التحصيلات الشهرية */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5">
                <div className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
                  <span>1️⃣ حالة الشهر الحالي ({claimBreakdown.monthName} {claimBreakdown.targetYear}):</span>
                </div>
                <div className="text-xs text-slate-800 pr-3 space-y-1 font-bold">
                  <div>• {claimBreakdown.subsLineText}</div>
                  <div>• {claimBreakdown.otherLineText}</div>
                </div>
              </div>

              {/* 2️⃣ الجزء الثاني: إجمالي المبالغ المستحقة للاشتراك الشهري */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-2">
                <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block"></span>
                  <span>2️⃣ الاشتراكات الشهرية:</span>
                </div>
                <div className="text-xs text-slate-800 pr-3 space-y-1.5 font-bold">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">• إجمالي المستحق:</span>
                    <span className="font-black text-slate-900">{claimBreakdown.priorSubsDue.toLocaleString()} ج.م</span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-800">
                    <span>• المسدد:</span>
                    <span className="font-black">{claimBreakdown.priorSubsPaid.toLocaleString()} ج.م</span>
                  </div>
                  <div className={`flex justify-between items-center pt-1 border-t border-dashed border-slate-200 font-black ${
                    claimBreakdown.priorSubsDiff > 0 ? 'text-rose-700' : claimBreakdown.priorSubsDiff < 0 ? 'text-emerald-700' : 'text-slate-600'
                  }`}>
                    <span>• الفرق بينهما:</span>
                    <span className="underline">{claimBreakdown.priorSubsStatusText}</span>
                  </div>
                </div>
              </div>

              {/* 3️⃣ الجزء الثالث: إجمالي المبالغ المستحقة عن التحصيلات الأخرى */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-2">
                <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block"></span>
                  <span>3️⃣ التحصيلات الأخرى:</span>
                </div>
                <div className="text-xs text-slate-800 pr-3 space-y-1.5 font-bold">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">• إجمالي المستحق:</span>
                    <span className="font-black text-slate-900">{claimBreakdown.priorOtherDue.toLocaleString()} ج.م</span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-800">
                    <span>• المسدد:</span>
                    <span className="font-black">{claimBreakdown.priorOtherPaid.toLocaleString()} ج.م</span>
                  </div>
                  <div className={`flex justify-between items-center pt-1 border-t border-dashed border-slate-200 font-black ${
                    claimBreakdown.priorOtherDiff > 0 ? 'text-rose-700' : claimBreakdown.priorOtherDiff < 0 ? 'text-emerald-700' : 'text-slate-600'
                  }`}>
                    <span>• الفرق بينهما:</span>
                    <span className="underline">{claimBreakdown.priorOtherStatusText}</span>
                  </div>
                </div>
              </div>

              {/* 4️⃣ الجزء الرابع: مديونيات سابقة */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5">
                <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block"></span>
                  <span>4️⃣ مديونيات سابقة:</span>
                </div>
                <div className="text-xs text-slate-800 pr-3 font-bold flex justify-between items-center">
                  <span className="text-slate-600">• القيمة:</span>
                  <span className={`font-black ${
                    claimBreakdown.previousDebtAmount > 0 
                      ? 'text-rose-700 underline' 
                      : claimBreakdown.previousSurplusAmount > 0 
                      ? 'text-emerald-700 underline' 
                      : 'text-slate-700'
                  }`}>
                    {claimBreakdown.previousDebtAmount > 0
                      ? `${claimBreakdown.previousDebtAmount.toLocaleString()} ج.م (مديونيات سابقة)`
                      : (claimBreakdown.previousSurplusAmount > 0
                          ? `+${claimBreakdown.previousSurplusAmount.toLocaleString()} ج.م (رصيد موجب دائن مرحل)`
                          : '0 ج.م (لا توجد مديونيات سابقة)')}
                  </span>
                </div>
              </div>

              {/* 5️⃣ & 6️⃣ المستطيل المالي المطلوب للتفصيل */}
              <div className="p-3.5 bg-white rounded-xl border-2 border-amber-400/90 shadow-2xs space-y-2.5 text-xs">
                {/* الجزء الخامس */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-slate-900 font-black">
                  <span>5️⃣ إجمالي المستحق عن هذا الشهر:</span>
                  <span className="text-blue-900 font-black text-xs sm:text-sm bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 self-start sm:self-auto">
                    {claimBreakdown.currentMonthTotalDue.toLocaleString()} ج.م
                  </span>
                </div>

                {/* الجزء السادس */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-slate-900 font-black pt-2.5 border-t border-dashed border-amber-300">
                  <span>6️⃣ إجمالي المتأخرات والمديونيات:</span>
                  <span className={`font-black text-xs sm:text-sm px-2.5 py-1 rounded-lg border self-start sm:self-auto ${
                    claimBreakdown.totalArrearsAndDebts > 0
                      ? 'text-rose-900 bg-rose-50 border-rose-200'
                      : 'text-emerald-900 bg-emerald-50 border-emerald-200'
                  }`}>
                    {claimBreakdown.totalArrearsAndDebts > 0
                      ? `${claimBreakdown.totalArrearsAndDebts.toLocaleString()} ج.م`
                      : '0 ج.م (خالص بالكامل)'}
                  </span>
                </div>
              </div>

              {/* Encouraging / Thanking Note */}
              {claimBreakdown.totalArrearsAndDebts === 0 ? (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-[11px] font-bold text-center leading-relaxed shadow-2xs">
                  🌺 نشكركم جزيل الشكر والتقدير على حرصكم الدائم وسدادكم المنتظم، مما يساهم مباشرةً في الحفاظ على العمارة وتطوير خدماتها.
                </div>
              ) : (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] font-bold text-center leading-relaxed shadow-2xs">
                  🤝 نأمل من سيادتكم التكرم بالمبادرة بسداد المستحقات في أقرب وقت لضمان استمرار خدمات النظافة، الحراسة، الصيانة، وتشغيل المصاعد بكفاءة لراحة جميع السكّان.
                </div>
              )}
            </div>
          )}

          {/* Monthly Accounting Timeline Table */}
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-black text-slate-800 text-xs">جدول المحاسبة والمطالبات الشهري ({monthsTimeline.length} شهر)</h2>
            <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
              {accountingPeriodDisplay}
            </span>
          </div>
          <table className="w-full text-right border-collapse border border-slate-400 text-xs mb-6 table-fixed">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[18%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-400 text-[11px]">
                <th className="border border-slate-400 p-2 text-center font-black">الشهر</th>
                <th className="border border-slate-400 p-2 text-center font-black">المستحق</th>
                <th className="border border-slate-400 p-2 text-center font-black">المبلغ المسدد</th>
                <th className="border border-slate-400 p-2 text-center font-black">فئة التحصيل</th>
                <th className="border border-slate-400 p-2 text-center font-black">حالة السداد</th>
                <th className="border border-slate-400 p-2 text-center font-black">تفاصيل التحصيل ورقم الإيصال</th>
              </tr>
            </thead>
            <tbody>
              {/* Row for Carried Previous Balance */}
              {(() => {
                const initBal = effectiveCarriedBalance !== 0 
                  ? effectiveCarriedBalance 
                  : (claimBreakdown?.previousDebtAmount && claimBreakdown.previousDebtAmount > 0)
                    ? -claimBreakdown.previousDebtAmount
                    : (claimBreakdown?.previousSurplusAmount && claimBreakdown.previousSurplusAmount > 0)
                      ? claimBreakdown.previousSurplusAmount
                      : (activeResident?.initialBalance || 0);
                const isNeg = initBal < 0;
                const isPos = initBal > 0;
                const isCarried = currentYear > startYear;
                return (
                  <tr className={isNeg ? 'bg-amber-50/70 font-bold' : isPos ? 'bg-teal-50/70 font-bold' : 'bg-slate-50/70'}>
                    <td className="border border-slate-400 p-2 text-center font-black text-slate-800 leading-tight">
                      <div>رصيد</div>
                      <div className="text-[10px] text-slate-700">سابق</div>
                    </td>
                    <td className="border border-slate-400 p-2 text-center font-bold">
                      {isNeg ? `${Math.abs(initBal).toLocaleString()} ج.م` : '0 ج.م'}
                    </td>
                    <td className="border border-slate-400 p-2 text-center font-bold text-teal-700">
                      {isPos ? `${initBal.toLocaleString()} ج.م` : '0 ج.م'}
                    </td>
                    <td className="border border-slate-400 p-2 text-center text-xs font-bold text-slate-700">
                      {isCarried ? 'مرحل' : 'تسوية'}
                    </td>
                    <td className="border border-slate-400 p-2 text-center font-bold">
                      {isNeg ? (
                        <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-900 font-black rounded-md border border-amber-300">مديونية سابقة</span>
                      ) : isPos ? (
                        <span className="inline-block px-2 py-0.5 bg-teal-100 text-teal-900 font-black rounded-md border border-teal-300">رصيد دائن فائض</span>
                      ) : (
                        <span className="text-slate-500 font-semibold">لا يوجد (0 ج.م)</span>
                      )}
                    </td>
                    <td className="border border-slate-400 p-2 text-center text-slate-600 font-medium text-[11px]">
                      {isCarried ? 'مرحل تلقائياً من السنة السابقة' : (isNeg ? 'مديونية سابقة معتمدة' : isPos ? 'رصيد دائن مرحل' : '—')}
                    </td>
                  </tr>
                );
              })()}

              {/* Monthly breakdown rows */}
              {monthsTimeline.map((m, idx) => {
                const monthlySubPayments = m.matchingPayments.filter(p =>
                  isMonthlySubscriptionType(p.paymentType) || !p.paymentType || p.paymentType === 'اشتراك شهري'
                );
                const otherCollectionPayments = m.matchingPayments.filter(p =>
                  !isMonthlySubscriptionType(p.paymentType) && p.paymentType && p.paymentType !== 'اشتراك شهري'
                );

                const totalSubRows = 1 + otherCollectionPayments.length;

                const validMonthlySubPayments = monthlySubPayments.filter(
                  p => p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل'
                );
                const monthlySubPaidAmount = validMonthlySubPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
                const isMonthlySubPaid = validMonthlySubPayments.length > 0 && (monthlySubPaidAmount >= m.fee || validMonthlySubPayments.some(p => p.isManuallyPaid));
                const isMonthlySubPartial = monthlySubPaidAmount > 0 && monthlySubPaidAmount < m.fee && !validMonthlySubPayments.some(p => p.isManuallyPaid);

                const act = (m.activityType || activeResident.activityType || '').trim();
                const isMonthExempt = m.isExempt || 
                  Boolean(activeResident.isExempt) || 
                  act.includes('تشطيب') || 
                  act.includes('مغلق') || 
                  act.includes('مغلقة') || 
                  act.includes('معفي') || 
                  act.includes('معفاه') || 
                  act.includes('معفاة') || 
                  (m.fee === 0 && !isMonthlySubPaid && monthlySubPaidAmount === 0);

                let subStatusInfo;
                if (isMonthlySubPaid) {
                  subStatusInfo = getPaymentStatusDisplay('collected');
                } else if (isMonthExempt) {
                  subStatusInfo = {
                    type: 'exempt' as const,
                    label: 'معفي',
                    badgeClass: 'bg-slate-200 text-slate-800 border-slate-300 font-black',
                    textClass: 'text-slate-800',
                    amountClass: 'text-slate-600 font-bold',
                    icon: Minus,
                  };
                } else if (isMonthlySubPartial) {
                  subStatusInfo = {
                    type: 'pending' as const,
                    label: 'سداد جزئي',
                    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
                    textClass: 'text-amber-800',
                    amountClass: 'text-amber-700 font-bold',
                    icon: Clock,
                  };
                } else if (validMonthlySubPayments.length > 0) {
                  subStatusInfo = getPaymentStatusDisplay(validMonthlySubPayments[0].status);
                } else {
                  subStatusInfo = {
                    type: 'pending' as const,
                    label: 'غير مسدد',
                    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
                    textClass: 'text-rose-700',
                    amountClass: 'text-rose-600 font-bold',
                    icon: AlertTriangle,
                  };
                }

                const firstMonthlySubPay = monthlySubPayments[0];

                return (
                  <React.Fragment key={`print-${m.year}-${m.monthNum}-${idx}`}>
                    <tr className={`border-b border-slate-300 ${isMonthExempt ? 'bg-slate-50' : !isMonthlySubPaid ? 'bg-rose-50/40' : ''}`}>
                      <td rowSpan={totalSubRows} className="border border-slate-300 p-2 text-center font-black text-slate-800 align-middle">
                        {m.monthLabel}
                      </td>
                      <td className="border border-slate-300 p-2 text-center font-semibold text-slate-700 align-middle">
                        {m.fee.toLocaleString()} ج.م
                      </td>
                      <td className="border border-slate-300 p-2 text-center align-middle font-bold">
                        <span className={monthlySubPaidAmount > 0 ? subStatusInfo.amountClass : 'text-slate-400 font-normal'}>
                          {monthlySubPaidAmount.toLocaleString()} ج.م
                        </span>
                      </td>
                      <td className="border border-slate-300 p-2 text-center text-xs font-bold text-slate-700 align-middle">
                        <span>اشتراك شهري</span>
                      </td>
                      <td className="border border-slate-300 p-2 text-center font-bold align-middle">
                        <span className={`inline-block px-2 py-0.5 rounded-md border font-black text-[10px] ${
                          isMonthlySubPaid
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : isMonthlySubPartial
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {subStatusInfo.label}
                        </span>
                      </td>
                      <td className="border border-slate-300 p-2 text-center font-mono text-[11px] font-bold text-slate-800 align-middle">
                        {firstMonthlySubPay ? (
                          <span>{firstMonthlySubPay.receiptNumber ? `#${firstMonthlySubPay.receiptNumber}` : 'مسدد'} ({firstMonthlySubPay.date})</span>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                    </tr>

                    {otherCollectionPayments.map((op, opIdx) => {
                      const opStatusInfo = getPaymentStatusDisplay(op.status);
                      return (
                        <tr key={`print-op-${op.id || opIdx}`} className="border-b border-slate-300 bg-purple-50/20">
                          <td className="border border-slate-300 p-2 text-center font-semibold text-slate-400 align-middle">
                            —
                          </td>
                          <td className="border border-slate-300 p-2 text-center align-middle font-bold">
                            <span className={opStatusInfo.amountClass}>
                              {op.amount.toLocaleString()} ج.م
                            </span>
                          </td>
                          <td className="border border-slate-300 p-2 text-center text-xs font-bold text-purple-900 align-middle">
                            <span>{op.paymentType || 'تحصيلات أخرى'}</span>
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-bold align-middle">
                            <span className={`inline-block px-2 py-0.5 rounded-md border font-black text-[10px] ${
                              opStatusInfo.type === 'cancelled'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : opStatusInfo.type === 'pending'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}>
                              {opStatusInfo.label}
                            </span>
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-mono text-[11px] font-bold text-slate-800 align-middle">
                            <span>{op.receiptNumber ? `#${op.receiptNumber}` : 'مسدد'} ({op.date})</span>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {/* Payments & Receipts Log Table - Matching Monthly Table Columns & Styling */}
          {unitPayments.length > 0 && (
            <>
              <h2 className="font-black text-slate-800 text-xs mb-2 mt-4">سجل مدفوعات وتحصيلات الوحدة ({unitPayments.length} عملية تحصيل)</h2>
              <table className="w-full text-right border-collapse border border-slate-400 text-xs mb-6 table-fixed">
                <colgroup>
                  <col className="w-[14%]" />
                  <col className="w-[16%]" />
                  <col className="w-[16%]" />
                  <col className="w-[16%]" />
                  <col className="w-[18%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-400 text-[11px]">
                    <th className="border border-slate-400 p-2 text-center font-black">الشهر</th>
                    <th className="border border-slate-400 p-2 text-center font-black">المستحق</th>
                    <th className="border border-slate-400 p-2 text-center font-black">المسدد</th>
                    <th className="border border-slate-400 p-2 text-center font-black">فئة التحصيل</th>
                    <th className="border border-slate-400 p-2 text-center font-black">حالة السداد</th>
                    <th className="border border-slate-400 p-2 text-center font-black">رقم الإيصال</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedUnitPayments.map((grp, grpIdx) => {
                    if (grp.monthlySubPayments.length > 0) {
                      const firstSub = grp.monthlySubPayments[0];
                      const subStatusInfo = getPaymentStatusDisplay(firstSub.status);
                      const extraSubs = grp.monthlySubPayments.slice(1);

                      return (
                        <React.Fragment key={`print-grp-${grp.year}-${grp.monthNum}-${grpIdx}`}>
                          <tr className="border-b border-slate-300">
                            <td rowSpan={grp.totalRows} className="border border-slate-300 p-2 text-center font-black text-slate-800 align-middle">
                              {grp.monthLabel}
                            </td>
                            <td className="border border-slate-300 p-2 text-center font-semibold text-slate-700 align-middle">
                              {grp.prescribedFee.toLocaleString()} ج.م
                            </td>
                            <td className="border border-slate-300 p-2 text-center align-middle font-bold">
                              <span className={subStatusInfo.amountClass}>
                                {firstSub.amount.toLocaleString()} ج.م
                              </span>
                            </td>
                            <td className="border border-slate-300 p-2 text-center text-xs font-bold text-slate-700 align-middle">
                              <span>اشتراك شهري</span>
                            </td>
                            <td className="border border-slate-300 p-2 text-center font-bold align-middle">
                              <span className={`inline-block px-2 py-0.5 rounded-md border font-black text-[10px] ${
                                subStatusInfo.type === 'cancelled'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : subStatusInfo.type === 'pending'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}>
                                {subStatusInfo.label}
                              </span>
                            </td>
                            <td className="border border-slate-300 p-2 text-center font-mono text-[11px] font-bold text-slate-800 align-middle">
                              <span>{firstSub.receiptNumber ? `#${firstSub.receiptNumber}` : 'مسدد'} ({firstSub.date})</span>
                            </td>
                          </tr>

                          {extraSubs.map((es, esIdx) => {
                            const esStatus = getPaymentStatusDisplay(es.status);
                            return (
                              <tr key={`print-es-${es.id || esIdx}`} className="border-b border-slate-300">
                                <td className="border border-slate-300 p-2 text-center font-semibold text-slate-400 align-middle">—</td>
                                <td className="border border-slate-300 p-2 text-center align-middle font-bold">
                                  <span className={esStatus.amountClass}>{es.amount.toLocaleString()} ج.م</span>
                                </td>
                                <td className="border border-slate-300 p-2 text-center text-xs font-bold text-slate-700 align-middle">
                                  <span>اشتراك شهري</span>
                                </td>
                                <td className="border border-slate-300 p-2 text-center font-bold align-middle">
                                  <span className={`inline-block px-2 py-0.5 rounded-md border font-black text-[10px] ${
                                    esStatus.type === 'cancelled'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : esStatus.type === 'pending'
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  }`}>
                                    {esStatus.label}
                                  </span>
                                </td>
                                <td className="border border-slate-300 p-2 text-center font-mono text-[11px] font-bold text-slate-800 align-middle">
                                  <span>{es.receiptNumber ? `#${es.receiptNumber}` : 'مسدد'} ({es.date})</span>
                                </td>
                              </tr>
                            );
                          })}

                          {grp.otherCollectionPayments.map((op, opIdx) => {
                            const opStatusInfo = getPaymentStatusDisplay(op.status);
                            return (
                              <tr key={`print-grp-op-${op.id || opIdx}`} className="border-b border-slate-300 bg-purple-50/20">
                                <td className="border border-slate-300 p-2 text-center font-semibold text-slate-400 align-middle">
                                  —
                                </td>
                                <td className="border border-slate-300 p-2 text-center align-middle font-bold">
                                  <span className={opStatusInfo.amountClass}>
                                    {op.amount.toLocaleString()} ج.م
                                  </span>
                                </td>
                                <td className="border border-slate-300 p-2 text-center text-xs font-bold text-purple-900 align-middle">
                                  <span>{op.paymentType || 'تحصيلات أخرى'}</span>
                                </td>
                                <td className="border border-slate-300 p-2 text-center font-bold align-middle">
                                  <span className={`inline-block px-2 py-0.5 rounded-md border font-black text-[10px] ${
                                    opStatusInfo.type === 'cancelled'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : opStatusInfo.type === 'pending'
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  }`}>
                                    {opStatusInfo.label}
                                  </span>
                                </td>
                                <td className="border border-slate-300 p-2 text-center font-mono text-[11px] font-bold text-slate-800 align-middle">
                                  <span>{op.receiptNumber ? `#${op.receiptNumber}` : 'مسدد'} ({op.date})</span>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    }

                    // If no monthly subscription, only other collections
                    const firstOp = grp.otherCollectionPayments[0];
                    const firstOpStatus = getPaymentStatusDisplay(firstOp.status);
                    const extraOps = grp.otherCollectionPayments.slice(1);

                    return (
                      <React.Fragment key={`print-grp-no-sub-${grp.year}-${grp.monthNum}-${grpIdx}`}>
                        <tr className="border-b border-slate-300 bg-purple-50/20">
                          <td rowSpan={grp.totalRows} className="border border-slate-300 p-2 text-center font-black text-slate-800 align-middle">
                            {grp.monthLabel}
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-semibold text-slate-400 align-middle">
                            —
                          </td>
                          <td className="border border-slate-300 p-2 text-center align-middle font-bold">
                            <span className={firstOpStatus.amountClass}>
                              {firstOp.amount.toLocaleString()} ج.م
                            </span>
                          </td>
                          <td className="border border-slate-300 p-2 text-center text-xs font-bold text-purple-900 align-middle">
                            <span>{firstOp.paymentType || 'تحصيلات أخرى'}</span>
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-bold align-middle">
                            <span className={`inline-block px-2 py-0.5 rounded-md border font-black text-[10px] ${
                              firstOpStatus.type === 'cancelled'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : firstOpStatus.type === 'pending'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}>
                              {firstOpStatus.label}
                            </span>
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-mono text-[11px] font-bold text-slate-800 align-middle">
                            <span>{firstOp.receiptNumber ? `#${firstOp.receiptNumber}` : 'مسدد'} ({firstOp.date})</span>
                          </td>
                        </tr>
                        {extraOps.map((op, opIdx) => {
                          const opStatus = getPaymentStatusDisplay(op.status);
                          return (
                            <tr key={`print-extra-op-${op.id || opIdx}`} className="border-b border-slate-300 bg-purple-50/20">
                              <td className="border border-slate-300 p-2 text-center font-semibold text-slate-400 align-middle">—</td>
                              <td className="border border-slate-300 p-2 text-center align-middle font-bold">
                                <span className={opStatus.amountClass}>{op.amount.toLocaleString()} ج.م</span>
                              </td>
                              <td className="border border-slate-300 p-2 text-center text-xs font-bold text-purple-900 align-middle">
                                <span>{op.paymentType || 'تحصيلات أخرى'}</span>
                              </td>
                              <td className="border border-slate-300 p-2 text-center font-bold align-middle">
                                <span className={`inline-block px-2 py-0.5 rounded-md border font-black text-[10px] ${
                                  opStatus.type === 'cancelled'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : opStatus.type === 'pending'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }`}>
                                  {opStatus.label}
                                </span>
                              </td>
                              <td className="border border-slate-300 p-2 text-center font-mono text-[11px] font-bold text-slate-800 align-middle">
                                <span>{op.receiptNumber ? `#${op.receiptNumber}` : 'مسدد'} ({op.date})</span>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          {/* Signatures Area */}
          <div className="grid grid-cols-3 gap-8 mt-10 text-center text-xs font-bold text-slate-800 pt-6 border-t border-dashed border-slate-300">
            <div className="space-y-10">
              <span>أمين الصندوق</span>
              <div className="border-b border-slate-400 w-32 mx-auto"></div>
            </div>
            <div className="space-y-10">
              <span>رئيس اتحاد الملاك</span>
              <div className="border-b border-slate-400 w-32 mx-auto"></div>
            </div>
            <div className="space-y-10">
              <span>خاتم الاتحاد والتاريخ</span>
              <div className="border-b border-slate-400 w-32 mx-auto"></div>
            </div>
          </div>

          {/* Page Footer */}
          <div className="mt-12 text-center text-[10px] text-slate-400 font-semibold">
            تم إنشاء هذا التقرير تلقائياً بواسطة نظام إدارة عمارة بيراميدز فيو ١
          </div>
        </div>
      )}

      {/* Statement Image Preview & Direct Sharing Modal */}
      {isShareModalOpen && generatedImageResult && activeResident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-900 text-white flex items-center justify-center shrink-0">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    صورة كشف حساب واشتراكات الوحدة ({activeResident.flatNumber})
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    المالك: {activeOwnerName} {activeTenantName ? `| المستأجر: ${activeTenantName}` : ''} | التقرير متزامن ومطابق تماماً لبيانات الوحدة
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image Preview Area */}
            <div className="p-4 sm:p-5 max-h-[50vh] overflow-y-auto bg-slate-100/70 text-center border-b border-slate-100">
              <img
                src={generatedImageResult.dataUrl}
                alt={`كشف حساب وحدة ${activeResident.flatNumber}`}
                className="mx-auto rounded-xl shadow-md border border-slate-300 max-w-full h-auto"
              />
            </div>

            {/* Action Buttons */}
            <div className="p-4 sm:p-5 bg-white space-y-3">
              <div className="text-xs font-black text-slate-700 mb-1">
                خيارات المشاركة والحفظ المباشر:
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Share to Owner WhatsApp */}
                <button
                  onClick={() => handleShareWhatsApp('owner', true)}
                  className="w-full py-3 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Share2 className="w-4 h-4 shrink-0" />
                  <span>مشاركة الصورة عبر واتساب المالك</span>
                </button>

                {/* Share to Tenant WhatsApp (if rental) or Copy Button */}
                {activeResident.ownershipType === 'إيجار' && activeResident.tenantPhone ? (
                  <button
                    onClick={() => handleShareWhatsApp('tenant', true)}
                    className="w-full py-3 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Share2 className="w-4 h-4 shrink-0" />
                    <span>مشاركة الصورة عبر واتساب المستأجر</span>
                  </button>
                ) : (
                  <button
                    onClick={handleCopyImageToClipboard}
                    className="w-full py-3 px-3 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>تم نسخ الصورة للحافظة!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 shrink-0" />
                        <span>نسخ الصورة للحافظة (لصق في الواتساب)</span>
                      </>
                    )}
                  </button>
                )}

                {/* Copy Image Button if tenant exists */}
                {activeResident.ownershipType === 'إيجار' && activeResident.tenantPhone && (
                  <button
                    onClick={handleCopyImageToClipboard}
                    className="w-full py-3 px-3 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>تم نسخ الصورة للحافظة!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 shrink-0" />
                        <span>نسخ الصورة للحافظة (لصق في الواتساب)</span>
                      </>
                    )}
                  </button>
                )}

                {/* Download Image Button */}
                <button
                  onClick={() => generatedImageResult.download()}
                  className="w-full py-3 px-3 bg-slate-900 hover:bg-slate-950 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Download className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>تحميل الصورة لجهازك (PNG)</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 font-medium text-center pt-1">
                💡 يمكنك النقر على &quot;مشاركة عبر الواتساب&quot; لإرسال الصورة وتفاصيل الحساب مباشرة لرقم هاتف الوحدة، أو نسخها ولصقها في أي محادثة فوراً.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
