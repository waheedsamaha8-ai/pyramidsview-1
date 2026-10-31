import React, { useMemo, useState, useRef } from 'react';
import { Resident, Payment, Expense, UserRole, FloorConfig, AppConfig } from '../types';
import { Calendar, Check, AlertCircle, RefreshCw, X, ExternalLink, Trash2, PlusCircle, Plus, CreditCard, Clock, Layers, Receipt, Edit, Save, Minus, Sparkles, RotateCcw, FileText, Filter, History, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { BuildingMap } from './BuildingMap';
import { UnitHistoryModal } from './modals/UnitHistoryModal';
import { PaymentFormModal } from './modals/PaymentFormModal';
import { deriveFloorConfigsFromResidents, getUnitNumbersForFloor, compareFlatNumbers, isSameFlatNumber, getHistoricalOccupantForDate, getHistoricalActivityForDate } from '../utils/buildingStructure';
import { getPrescribedFeeForMonth, isPaymentForYearAndMonth, isMonthlySubscriptionType, registerDeletedPaymentIds, getDeletedPaymentIds, formatLatestDistributionNotes } from '../utils/financialCalculations';

interface SummariesProps {
  residents: Resident[];
  payments: Payment[];
  expenses: Expense[];
  currentYear: number;
  role: UserRole;
  onCellClick: (residentId: string, month: string, currentStatus: boolean, paymentId?: string, customAmount?: number, paymentType?: string) => void;
  floorConfigs: FloorConfig[];
  expenseTypes?: string[];
  onEditPayment?: (payment: Payment, base64Image?: string) => void;
  onDistributePayment?: (originalPaymentId: string, distributedPayments: Payment[], deletedPaymentIds?: string[]) => void;
  onDeletePayment?: (id: string) => void;
  onAddPayment?: (payment: Payment, base64Image?: string) => void;
  onPreviewImage?: (url: string) => void;
  onEditResident?: (resident: Resident) => void;
  activityDefaultFees?: Record<string, number>;
  defaultMonthlyFee?: number;
  paymentTypes?: string[];
  config?: AppConfig;
  currentMonth?: number;
  setCurrentMonth?: React.Dispatch<React.SetStateAction<number>>;
}

const STATIC_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const STATIC_MONTH_NAMES_ARABIC = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const SummariesComponent: React.FC<SummariesProps> = ({
  residents,
  payments,
  expenses,
  currentYear,
  role,
  onCellClick,
  floorConfigs,
  expenseTypes,
  onEditPayment,
  onDistributePayment,
  onDeletePayment,
  onAddPayment,
  onPreviewImage,
  activityDefaultFees,
  defaultMonthlyFee,
  paymentTypes,
  config,
  currentMonth,
  setCurrentMonth,
  onEditResident,
}) => {
  const [historyModalResident, setHistoryModalResident] = useState<Resident | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    resident: Resident;
    month: string;
    monthName: string;
    payments: Payment[];
  } | null>(null);

  const [paymentModalState, setPaymentModalState] = useState<{
    isOpen: boolean;
    payment?: Payment | null;
    resident?: Resident | null;
    month?: string;
  }>({ isOpen: false });

  const [localDeletedPaymentIds, setLocalDeletedPaymentIds] = useState<Set<string>>(() => new Set());

  const [newAmount, setNewAmount] = useState<string>('200');
  const [newDueAmount, setNewDueAmount] = useState<string>('');
  const [newPaymentType, setNewPaymentType] = useState<string>('اشتراك شهري');
  const [newNotes, setNewNotes] = useState<string>('');
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editDueAmount, setEditDueAmount] = useState<string>('');
  const [editPaymentType, setEditPaymentType] = useState<string>('');
  const [editPaymentStatus, setEditPaymentStatus] = useState<string>('collected');
  const [editReceiptNumber, setEditReceiptNumber] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [actionConfirm, setActionConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    confirmClass: string;
    onConfirm: () => void;
  } | null>(null);

  // States for aggregated payment distribution across months
  const [isDistributing, setIsDistributing] = useState<boolean>(false);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [editNotes, setEditNotes] = useState<string>('');

  // Filter for Section 3 (Monthly collection table) - defaults to 'اشتراك شهري'
  const [selectedPaymentTypeFilter, setSelectedPaymentTypeFilter] = useState<string>('اشتراك شهري');

  // Available Payment Types list - ONLY from config.paymentTypes (إدارة أنواع التحصيل) without duplicates
  const availablePaymentTypes = useMemo(() => {
    const configured = (config?.paymentTypes && config.paymentTypes.length > 0)
      ? config.paymentTypes
      : (paymentTypes && paymentTypes.length > 0)
        ? paymentTypes
        : ['اشتراك شهري', 'صيانة طارئة', 'تحصيلات اخرى'];

    const seen = new Set<string>();
    const result: string[] = [];
    for (const type of configured) {
      const trimmed = type?.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
    return result;
  }, [config?.paymentTypes, paymentTypes]);

  const matchesPaymentType = (payType: string | undefined, filterType: string) => {
    if (!filterType || filterType === 'all' || filterType === 'الكل' || filterType === 'الجميع') return true;
    const cleanPay = (payType || 'اشتراك شهري').trim();
    const cleanFilter = filterType.trim();
    if (cleanPay === cleanFilter) return true;
    
    // Arabic normalization
    const normPay = cleanPay.replace(/ي$/g, 'ى').replace(/[أإآ]/g, 'ا');
    const normFilter = cleanFilter.replace(/ي$/g, 'ى').replace(/[أإآ]/g, 'ا');
    if (normPay === normFilter) return true;
    
    if (normFilter.includes('اشتراك') && (normPay.includes('اشتراك') || normPay.includes('شهر'))) return true;
    return false;
  };

  // Synchronized horizontal scroll for the 3 summary tables
  const table1Ref = useRef<HTMLDivElement>(null);
  const table2Ref = useRef<HTMLDivElement>(null);
  const table3Ref = useRef<HTMLDivElement>(null);
  const activeScrollerRef = useRef<HTMLDivElement | null>(null);

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (activeScrollerRef.current && activeScrollerRef.current !== target) {
      return;
    }
    activeScrollerRef.current = target;

    const scrollLeft = target.scrollLeft;
    const refs = [table1Ref, table2Ref, table3Ref];
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      if (ref.current && ref.current !== target) {
        ref.current.scrollLeft = scrollLeft;
      }
    }
  };

  const handleScrollerInteraction = (e: React.SyntheticEvent<HTMLDivElement>) => {
    activeScrollerRef.current = e.currentTarget;
  };

  const getDefaultFeeForResident = (resident: Resident, targetMonth?: string, targetYear?: number) => {
    if (!resident) return defaultMonthlyFee || 400;
    const yr = targetYear ?? currentYear;
    const mStr = targetMonth ?? (selectedCell ? selectedCell.month : '01');
    const mNum = parseInt(mStr, 10) || 1;
    const prescribed = getPrescribedFeeForMonth(
      resident,
      yr,
      mNum,
      payments,
      defaultMonthlyFee,
      activityDefaultFees,
      config?.activityFeePeriods,
      config?.customUnitFeePeriods
    );
    return prescribed.monthlyFee;
  };

  const months = STATIC_MONTHS;
  const monthNamesArabic = STATIC_MONTH_NAMES_ARABIC;

  const sortedResidents = useMemo(() => {
    return [...residents].sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
  }, [residents]);

  // 1. Calculations for Monthly Financial Balance (Table 1)
  const monthlyData = useMemo(() => {
    return months.map((m) => {
      const monthPayments = payments
        .filter((p) => p.year === currentYear && p.month === m && p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل')
        .reduce((sum, p) => sum + p.amount, 0);

      const monthExpenses = expenses
        .filter((e) => e.year === currentYear && e.month === m)
        .reduce((sum, e) => sum + e.amount, 0);

      return {
        month: m,
        payments: monthPayments,
        expenses: monthExpenses,
        balance: monthPayments - monthExpenses,
      };
    });
  }, [payments, expenses, currentYear]);

  const grandPaymentsTotal = monthlyData.reduce((sum, d) => sum + d.payments, 0);
  const grandExpensesTotal = monthlyData.reduce((sum, d) => sum + d.expenses, 0);
  const grandBalanceTotal = grandPaymentsTotal - grandExpensesTotal;

  const firstHalfPayments = monthlyData.slice(0, 6).reduce((sum, d) => sum + d.payments, 0);
  const secondHalfPayments = monthlyData.slice(6, 12).reduce((sum, d) => sum + d.payments, 0);

  const firstHalfExpenses = monthlyData.slice(0, 6).reduce((sum, d) => sum + d.expenses, 0);
  const secondHalfExpenses = monthlyData.slice(6, 12).reduce((sum, d) => sum + d.expenses, 0);

  const firstHalfBalance = firstHalfPayments - firstHalfExpenses;
  const secondHalfBalance = secondHalfPayments - secondHalfExpenses;

  // 2. Derive Floor Configs and group residents by Floor for Table 3
  const effectiveFloorConfigs = useMemo(() => {
    let base: FloorConfig[] = [];
    if (floorConfigs && floorConfigs.length > 0) {
      base = floorConfigs;
    } else if (residents && residents.length > 0) {
      base = deriveFloorConfigsFromResidents(residents);
    }
    // Strictly sort floors ascendingly by unit numbers (Ground -> 1st -> 2nd -> 3rd -> ...)
    return [...base].sort((a, b) => {
      const unitsA = getUnitNumbersForFloor(a, residents);
      const unitsB = getUnitNumbersForFloor(b, residents);
      const minA = unitsA.length > 0 ? unitsA[0] : a.startUnitNumber;
      const minB = unitsB.length > 0 ? unitsB[0] : b.startUnitNumber;
      return compareFlatNumbers(minA, minB);
    });
  }, [floorConfigs, residents]);

  const floorResidentGroups = useMemo(() => {
    const assignedResidentIds = new Set<string>();
    const groups: { floor: FloorConfig; residents: Resident[] }[] = [];

    effectiveFloorConfigs.forEach((floor) => {
      const unitNumbers = getUnitNumbersForFloor(floor, residents);
      const floorResidents = sortedResidents
        .filter(r => unitNumbers.some(u => isSameFlatNumber(u, r.flatNumber)))
        .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
      floorResidents.forEach(r => assignedResidentIds.add(r.id));
      if (floorResidents.length > 0) {
        groups.push({ floor, residents: floorResidents });
      }
    });

    const unassigned = sortedResidents
      .filter(r => !assignedResidentIds.has(r.id))
      .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
    if (unassigned.length > 0) {
      groups.push({
        floor: {
          id: 'unassigned_floor',
          type: 'typical',
          floorLabel: 'وحدات إضافية / أخرى',
          unitsCount: unassigned.length,
          activityType: 'عام',
        },
        residents: unassigned,
      });
    }

    return groups;
  }, [effectiveFloorConfigs, residents, sortedResidents]);

  // Floor collapse state for Section 3 (Monthly subscription matrix)
  const [collapsedFloorIds, setCollapsedFloorIds] = useState<Set<string>>(() => new Set());

  const toggleFloor = (floorId: string) => {
    setCollapsedFloorIds((prev) => {
      const next = new Set(prev);
      if (next.has(floorId)) {
        next.delete(floorId);
      } else {
        next.add(floorId);
      }
      return next;
    });
  };

  const toggleAllFloors = () => {
    if (collapsedFloorIds.size === floorResidentGroups.length) {
      setCollapsedFloorIds(new Set());
    } else {
      setCollapsedFloorIds(new Set(floorResidentGroups.map(g => g.floor.id)));
    }
  };

  // 3. Category Expenses Breakdown (Table 2)
  // Category list is fully dynamic and controlled by expenseTypes in Expense Management (config.expenseTypes)
  const categoryList = useMemo(() => {
    const configuredTypes = (expenseTypes && expenseTypes.length > 0)
      ? expenseTypes
      : (config?.expenseTypes && config.expenseTypes.length > 0)
        ? config.expenseTypes
        : ['كهرباء', 'صيانة المصعد', 'نظافة', 'أمن وحراسة', 'سباكة ومياه', 'صيانة عامة', 'أخرى'];

    const list: string[] = [];
    const seen = new Set<string>();
    for (const cat of configuredTypes) {
      const trimmed = cat?.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        list.push(trimmed);
      }
    }
    return list;
  }, [expenseTypes, config?.expenseTypes]);

  const categoryMonthlyData = useMemo(() => {
    return categoryList.map(cat => {
      const monthAmounts = months.map(m => {
        return expenses
          .filter(e => e.year === currentYear && e.month === m && e.expenseType === cat)
          .reduce((sum, e) => sum + e.amount, 0);
      });
      const totalYear = monthAmounts.reduce((a, b) => a + b, 0);
      const firstHalfTotal = monthAmounts.slice(0, 6).reduce((a, b) => a + b, 0);
      const secondHalfTotal = monthAmounts.slice(6, 12).reduce((a, b) => a + b, 0);
      return {
        category: cat,
        monthAmounts,
        firstHalfTotal,
        secondHalfTotal,
        totalYear,
      };
    });
  }, [categoryList, expenses, currentYear]);

  // Precompute occupant names for fast display
  const occupantNamesMap = useMemo(() => {
    const map = new Map<string, string>();
    sortedResidents.forEach(res => {
      const historical = getHistoricalOccupantForDate(res, `${currentYear}`);
      const occupantName = historical.tenantName || historical.ownerName || res.name;
      map.set(res.id, occupantName);
    });
    return map;
  }, [sortedResidents, currentYear]);

  // Precompute historical activity for each resident and month
  const historicalActivitiesMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getHistoricalActivityForDate>>();
    sortedResidents.forEach(res => {
      months.forEach(m => {
        const hist = getHistoricalActivityForDate(res, `${currentYear}-${m}`, defaultMonthlyFee, activityDefaultFees, config?.activityFeePeriods);
        map.set(`${res.id}_${m}`, hist);
      });
    });
    return map;
  }, [sortedResidents, currentYear, defaultMonthlyFee, activityDefaultFees, config?.activityFeePeriods]);

  const residentYearTotalsMap = useMemo(() => {
    const map = new Map<string, number>();
    const globallyDeleted = getDeletedPaymentIds();
    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      if (!p || !p.id || localDeletedPaymentIds.has(String(p.id)) || globallyDeleted.has(String(p.id))) continue;
      if (
        p.residentId &&
        Number(p.year) === Number(currentYear) &&
        p.status !== 'cancelled' &&
        p.status !== 'لاغي' &&
        p.status !== 'pending' &&
        p.status !== 'لم يتم التحصيل' &&
        matchesPaymentType(p.paymentType, selectedPaymentTypeFilter)
      ) {
        map.set(p.residentId, (map.get(p.residentId) || 0) + (Number(p.amount) || 0));
      }
    }
    return map;
  }, [payments, currentYear, selectedPaymentTypeFilter, localDeletedPaymentIds]);

  const residentHalfTotals = useMemo(() => {
    const firstHalf = new Map<string, number>();
    const secondHalf = new Map<string, number>();
    const globallyDeleted = getDeletedPaymentIds();
    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      if (!p || !p.id || localDeletedPaymentIds.has(String(p.id)) || globallyDeleted.has(String(p.id))) continue;
      if (
        p.residentId &&
        Number(p.year) === Number(currentYear) &&
        p.status !== 'cancelled' &&
        p.status !== 'لاغي' &&
        p.status !== 'pending' &&
        p.status !== 'لم يتم التحصيل' &&
        matchesPaymentType(p.paymentType, selectedPaymentTypeFilter)
      ) {
        const mNum = parseInt(p.month, 10);
        const amt = Number(p.amount) || 0;
        if (mNum >= 1 && mNum <= 6) {
          firstHalf.set(p.residentId, (firstHalf.get(p.residentId) || 0) + amt);
        } else if (mNum >= 7 && mNum <= 12) {
          secondHalf.set(p.residentId, (secondHalf.get(p.residentId) || 0) + amt);
        }
      }
    }
    return { firstHalf, secondHalf };
  }, [payments, currentYear, selectedPaymentTypeFilter, localDeletedPaymentIds]);

  // 4. Pre-index payments by resident and month for lightning-fast O(1) table rendering and instant modal opening
  const precomputedData = useMemo(() => {
    // 1. Build Sets of master and child distributed payments in a single O(N) pass
    const childSet = new Set<string>();
    const masterSet = new Set<string>();
    const originalAggregatedSet = new Set<string>();

    const globallyDeleted = getDeletedPaymentIds();
    const isPaymentDeleted = (p: Payment) => {
      if (!p || !p.id) return true;
      const isCancelled = p.status === 'cancelled' || p.status === 'لاغي' || p.status === 'VOID' || p.status === 'ملغي' || p.status === 'مرفوض';
      if (isCancelled) return false;
      return localDeletedPaymentIds.has(String(p.id)) || globallyDeleted.has(String(p.id));
    };

    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      if (!p || !p.id || isPaymentDeleted(p)) continue;
      if (p.distributionSourceId && String(p.distributionSourceId) !== String(p.id)) {
        childSet.add(String(p.id));
      }
      if (Array.isArray(p.distributedPaymentIds) && p.distributedPaymentIds.length > 0) {
        masterSet.add(String(p.id));
        for (let j = 0; j < p.distributedPaymentIds.length; j++) {
          childSet.add(String(p.distributedPaymentIds[j]));
        }
      }
      if (p.isDistributed) {
        masterSet.add(String(p.id));
      }
      if (p.isAggregatedCollection || (p.notes && p.notes.includes('سداد مجمع'))) {
        originalAggregatedSet.add(String(p.id));
      }
    }

    // 2. Map payments by (residentKey, month) and (flatKey, month)
    const paymentsByResidentAndMonth = new Map<string, Payment[]>();
    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      if (!p || !p.id || isPaymentDeleted(p)) continue;
      if (Number(p.year) !== Number(currentYear)) continue;
      const mStr = String(parseInt(p.month, 10)).padStart(2, '0');
      
      if (p.residentId) {
        const resIdKey = `${p.residentId}_${mStr}`;
        let list = paymentsByResidentAndMonth.get(resIdKey);
        if (!list) { list = []; paymentsByResidentAndMonth.set(resIdKey, list); }
        list.push(p);
      }
      if (p.flatNumber !== undefined && p.flatNumber !== null) {
        const flatKey = `flat_${String(p.flatNumber).trim()}_${mStr}`;
        let list = paymentsByResidentAndMonth.get(flatKey);
        if (!list) { list = []; paymentsByResidentAndMonth.set(flatKey, list); }
        list.push(p);
      }
    }

    return { childSet, masterSet, originalAggregatedSet, paymentsByResidentAndMonth };
  }, [payments, currentYear, localDeletedPaymentIds]);

  const isChildDistributedPayment = (pay: Payment): boolean => {
    return precomputedData.childSet.has(String(pay.id));
  };

  const isMasterDistributionPayment = (pay: Payment): boolean => {
    return precomputedData.masterSet.has(String(pay.id));
  };

  const isOriginalAggregatedPayment = (pay: Payment): boolean => {
    return precomputedData.originalAggregatedSet.has(String(pay.id)) || Boolean(pay.isAggregatedCollection);
  };

  const findMasterPayment = (pay: Payment): Payment => {
    if (pay.distributionSourceId) {
      const found = payments.find(p => String(p.id) === String(pay.distributionSourceId));
      if (found) return found;
    }
    const foundByChildId = payments.find(p => Array.isArray(p.distributedPaymentIds) && p.distributedPaymentIds.map(String).includes(String(pay.id)));
    if (foundByChildId) return foundByChildId;
    return pay;
  };

  // Precompute all cell statuses once per render to guarantee instant 0ms modal opening and table responsiveness
  const cellStatusMap = useMemo(() => {
    const map = new Map<string, {
      hasNoPayments: boolean;
      paid: boolean;
      pending: boolean;
      hasPendingWithReceipt: boolean;
      isBulkGeneratedPending: boolean;
      pendingAmount: number;
      isCancelled: boolean;
      amount: number;
      paymentsList: Payment[];
      isAggregated: boolean;
      isDistributed: boolean;
    }>();

    const { childSet, masterSet, originalAggregatedSet, paymentsByResidentAndMonth } = precomputedData;

    sortedResidents.forEach(res => {
      const resFlatKey = String(res.flatNumber).trim();
      months.forEach(m => {
        const idKey = `${res.id}_${m}`;
        const flatKey = `flat_${resFlatKey}_${m}`;
        const rawList1 = paymentsByResidentAndMonth.get(idKey) || [];
        const rawList2 = paymentsByResidentAndMonth.get(flatKey) || [];

        const seen = new Set<string>();
        const matchingPayments: Payment[] = [];
        const processP = (p: Payment) => {
          if (!seen.has(p.id) && matchesPaymentType(p.paymentType, selectedPaymentTypeFilter)) {
            seen.add(p.id);
            matchingPayments.push(p);
          }
        };
        rawList1.forEach(processP);
        rawList2.forEach(processP);

        const cancelledPayments = matchingPayments.filter(
          (p) => p.status === 'cancelled' || p.status === 'لاغي' || p.status === 'VOID' || p.status === 'ملغي' || p.status === 'مرفوض'
        );

        const isExplicitPaidStatus = (p: Payment) =>
          p.status === 'collected' ||
          p.status === 'paid' ||
          p.status === 'تم التحصيل' ||
          p.status === 'مسدد' ||
          p.isManuallyPaid === true;

        const isUncollectedPayment = (p: Payment) => {
          if (isExplicitPaidStatus(p)) return false;
          return (
            p.status === 'pending' ||
            p.status === 'لم يتم التحصيل' ||
            p.status === 'uncollected' ||
            p.status === 'unpaid' ||
            p.status === 'غير مسدد' ||
            p.status === 'معلق'
          );
        };

        const validCollectedPayments = matchingPayments.filter(
          (p) => !cancelledPayments.includes(p) && !isUncollectedPayment(p)
        );

        const pendingPayments = matchingPayments.filter(
          (p) => !cancelledPayments.includes(p) && isUncollectedPayment(p)
        );

        const totalAmount = validCollectedPayments.reduce((sum, p) => sum + p.amount, 0);
        const isPaid = totalAmount > 0 || validCollectedPayments.some(p => (p.isManuallyPaid || p.status === 'collected' || p.status === 'paid' || p.status === 'تم التحصيل') && p.amount > 0);
        const isPending = !isPaid && pendingPayments.length > 0;
        const pendingAmount = pendingPayments.reduce((sum, p) => sum + p.amount, 0);

        const hasPendingWithReceipt = isPending && pendingPayments.some(p => Boolean(p.receiptNumber && p.receiptNumber.trim() !== ''));

        const isBulkGeneratedPending = isPending && pendingPayments.some(p =>
          p.isManuallyPaid !== true && ((p.isManuallyPaid === false) || (p.notes && (p.notes.includes('استحقاق اشتراك شهر') || p.notes.includes('توليد تلقائي'))))
        );

        const isOnlyCancelled = !isPaid && !isPending && cancelledPayments.length > 0;
        const hasNoPayments = matchingPayments.length === 0;

        const isAggregated = matchingPayments.some(p => 
          p.status !== 'cancelled' && p.status !== 'لاغي' && (
            originalAggregatedSet.has(String(p.id)) || 
            Boolean(p.isAggregatedCollection) ||
            childSet.has(String(p.id)) ||
            Boolean(p.distributionSourceId) ||
            (p.notes && (p.notes.includes('سداد مجمع') || p.notes.includes('تم السداد في شهر') || p.notes.includes('القيمة الموزعة للشهر')))
          )
        );
        const isDistributed = matchingPayments.some(p => 
          p.status !== 'cancelled' && p.status !== 'لاغي' && (
            masterSet.has(String(p.id)) || Boolean(p.isDistributed)
          )
        );

        map.set(`${res.id}_${m}`, {
          hasNoPayments,
          paid: isPaid,
          pending: isPending,
          hasPendingWithReceipt,
          isBulkGeneratedPending,
          pendingAmount,
          isCancelled: isOnlyCancelled,
          amount: totalAmount,
          paymentsList: matchingPayments,
          isAggregated,
          isDistributed,
        });
      });
    });

    return map;
  }, [sortedResidents, precomputedData, selectedPaymentTypeFilter]);

  // Fast O(1) reader for grid display in that month
  const getSubscriptionStatus = (residentId: string, month: string, filterType = selectedPaymentTypeFilter) => {
    if (filterType === selectedPaymentTypeFilter) {
      const cached = cellStatusMap.get(`${residentId}_${month}`);
      if (cached) return cached;
    }
    const monthList = precomputedData.paymentsByResidentAndMonth.get(`${residentId}_${month}`) || [];
    const matchingPayments = monthList.filter((p) => matchesPaymentType(p.paymentType, filterType));
    const totalAmount = matchingPayments.filter(p => p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل').reduce((sum, p) => sum + p.amount, 0);
    const pendingList = matchingPayments.filter(p => p.status === 'pending' || p.status === 'لم يتم التحصيل');
    const hasPendingWithReceipt = pendingList.some(p => Boolean(p.receiptNumber && p.receiptNumber.trim() !== ''));
    return {
      hasNoPayments: matchingPayments.length === 0,
      paid: totalAmount > 0,
      pending: pendingList.length > 0,
      hasPendingWithReceipt,
      isBulkGeneratedPending: pendingList.length > 0,
      pendingAmount: pendingList.reduce((sum, p) => sum + p.amount, 0),
      isCancelled: false,
      amount: totalAmount,
      paymentsList: matchingPayments,
      isAggregated: false,
      isDistributed: false,
    };
  };

  const handleStartEdit = (pay: Payment, forceDistribute = false) => {
    setEditingPaymentId(pay.id);
    setEditPaymentType(pay.paymentType || 'اشتراك شهري');
    setEditPaymentStatus(pay.status || 'collected');
    setEditReceiptNumber(pay.receiptNumber || '');
    setEditNotes(pay.notes || '');
    setConfirmCancelId(null);

    const fee = selectedCell ? getDefaultFeeForResident(selectedCell.resident, pay.month, currentYear) : (defaultMonthlyFee || 400);
    const initialDue = (pay.expectedAmount !== undefined && pay.expectedAmount > 0)
      ? pay.expectedAmount
      : ((pay as any).dueAmount !== undefined && (pay as any).dueAmount > 0)
        ? (pay as any).dueAmount
        : fee;
    setEditDueAmount(String(initialDue));

    const currentMonthNum = parseInt(pay.month, 10) || 1;
    const normalizedMonth = String(currentMonthNum).padStart(2, '0');

    const masterPay = findMasterPayment(pay);
    const masterId = String(masterPay.id);
    const isMaster = isMasterDistributionPayment(pay) || Boolean(pay.isDistributed) || (Array.isArray(masterPay.distributedPaymentIds) && masterPay.distributedPaymentIds.length > 0);
    const isChild = isChildDistributedPayment(pay) || Boolean(pay.distributionSourceId);
    const isDistGroup = isMaster || isChild;

    if (isDistGroup) {
      // Find all distributed child payments from this source
      const childPayments = payments.filter(p => 
        String(p.id) !== masterId && (
          String(p.distributionSourceId || '') === masterId ||
          (Array.isArray(masterPay.distributedPaymentIds) && masterPay.distributedPaymentIds.map(String).includes(String(p.id)))
        )
      );
      const totalAmount = masterPay.originalAmountBeforeDistribution || (masterPay.amount + childPayments.reduce((s, c) => s + (Number(c.amount) || 0), 0));
      setEditAmount(String(totalAmount));

      const allDistributedMonths = Array.from(new Set([masterPay.month, ...childPayments.map(c => c.month)]))
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      setSelectedMonths(allDistributedMonths.length > 0 ? allDistributedMonths : [normalizedMonth]);
      setIsDistributing(true);

      // Load master payment status and receipt details for unified group editing
      setEditPaymentStatus(masterPay.status || pay.status || 'collected');
      setEditReceiptNumber(masterPay.receiptNumber || pay.receiptNumber || '');
      setEditNotes(masterPay.notes ? masterPay.notes.replace(/\(سداد مجمع.*?\)/g, '').replace(/\(تم التحصيل.*?\)/g, '').replace(/\(استحقاق.*?\)/g, '').trim() : (pay.notes || ''));
    } else {
      setEditAmount(String(pay.amount));
      const coveredMonthsCount = fee > 0 ? Math.max(1, Math.round(pay.amount / fee)) : 1;
      const shouldDistribute = forceDistribute || coveredMonthsCount > 1;
      setIsDistributing(shouldDistribute);

      if (shouldDistribute) {
        const initialMonths: string[] = [];
        for (let i = 0; i < coveredMonthsCount; i++) {
          const mNum = currentMonthNum + i;
          if (mNum <= 12) {
            initialMonths.push(String(mNum).padStart(2, '0'));
          }
        }
        setSelectedMonths(initialMonths.length > 0 ? initialMonths : [normalizedMonth]);
      } else {
        setSelectedMonths([normalizedMonth]);
      }
    }
  };

  const handleCancelDistribution = (targetPay: Payment) => {
    const masterPay = findMasterPayment(targetPay);
    const masterId = String(masterPay.id);

    // Find ALL child payments belonging strictly to this master payment
    const relatedChildPayments = payments.filter((p) => {
      if (String(p.id) === masterId) return false;
      if (String(p.distributionSourceId || '') === masterId) return true;
      if (
        masterPay.distributedPaymentIds &&
        masterPay.distributedPaymentIds.map(String).includes(String(p.id))
      ) {
        return true;
      }
      return false;
    });

    const childIdsToDelete = relatedChildPayments.map((c) => String(c.id));
    const childrenTotal = relatedChildPayments.reduce(
      (sum, c) => sum + (Number(c.amount) || 0),
      0
    );

    // Exact restored amount: use originalAmountBeforeDistribution if set and positive,
    // otherwise master amount + children total. This prevents any inflation or duplication!
    const restoredAmount =
      masterPay.originalAmountBeforeDistribution &&
      masterPay.originalAmountBeforeDistribution > 0
        ? masterPay.originalAmountBeforeDistribution
        : (Number(masterPay.amount) || 0) + childrenTotal;

    const cleanNotes = (masterPay.notes || '')
      .replace(/\(سداد مجمع موزع على \d+ شهور.*?\)/g, '')
      .replace(/سداد مجمع موزع على شهور:.*?(?=$|\n)/g, '')
      .replace(/\(سداد مجمع \d+ شهور.*?\)/g, '')
      .trim();

    const restoredPayment: Payment = {
      ...masterPay,
      amount: restoredAmount,
      isAggregatedCollection: true,
      isDistributed: false,
      distributedPaymentIds: [],
      originalAmountBeforeDistribution: undefined,
      distributionSourceId: undefined,
      notes: cleanNotes || undefined,
    };

    if (onDistributePayment) {
      onDistributePayment(masterPay.id, [restoredPayment], childIdsToDelete);
    } else {
      if (onEditPayment) onEditPayment(restoredPayment);
      if (onDeletePayment) {
        childIdsToDelete.forEach((cid) => onDeletePayment(cid));
      }
    }

    // Immediately update local modal view without waiting for re-render
    setSelectedCell((prev) => {
      if (!prev) return null;
      const remaining = prev.payments.filter(
        (p) => !childIdsToDelete.includes(String(p.id)) && String(p.id) !== masterId
      );
      if (prev.month === masterPay.month) {
        remaining.push(restoredPayment);
      }
      return {
        ...prev,
        payments: remaining,
      };
    });

    setEditingPaymentId(null);
    setIsDistributing(false);
    setConfirmCancelId(null);
  };

  const toggleMonthSelection = (m: string) => {
    setSelectedMonths((prev) => {
      if (prev.includes(m)) {
        if (prev.length <= 1) return prev; // Keep at least one selected month
        return prev.filter((x) => x !== m);
      } else {
        return [...prev, m].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      }
    });
  };

  const selectAutoCoveredMonths = (payMonth: string, amount: number, fee: number) => {
    const count = fee > 0 ? Math.max(1, Math.round(amount / fee)) : 1;
    const startM = parseInt(payMonth, 10) || 1;
    const list: string[] = [];
    for (let i = 0; i < count; i++) {
      const mNum = startM + i;
      if (mNum <= 12) {
        list.push(String(mNum).padStart(2, '0'));
      }
    }
    setSelectedMonths(list.length > 0 ? list : [String(startM).padStart(2, '0')]);
  };

  const selectUnpaidMonths = (residentId: string, currentPayMonth: string) => {
    const unpaid = months.filter((m) => {
      const status = getSubscriptionStatus(residentId, m);
      return !status.paid;
    });
    setSelectedMonths(unpaid.length > 0 ? unpaid : [currentPayMonth]);
  };

  const handleSavePayment = (pay: Payment) => {
    const parsedAmount = parseFloat(editAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('يرجى إدخال مبلغ صحيح أكبر من الصفر.');
      return;
    }

    setActionConfirm({
      title: 'تأكيد حفظ تعديل الدفعة',
      message: `هل أنت متأكد من حفظ تعديل الدفعة بقيمة ${parsedAmount.toLocaleString()} ج.م للوحدة ${selectedCell?.resident.flatNumber}؟`,
      confirmLabel: 'تأكيد التعديل الآن',
      confirmClass: 'bg-blue-900 hover:bg-blue-950 text-white',
      onConfirm: () => {
        executeSavePayment(pay, parsedAmount);
        setActionConfirm(null);
      }
    });
  };

  const executeSavePayment = (pay: Payment, parsedAmount: number) => {
    const masterPay = findMasterPayment(pay);
    const masterId = String(masterPay.id);

    const parsedDue = parseFloat(editDueAmount);
    const dueToSave = (!isNaN(parsedDue) && parsedDue >= 0) ? parsedDue : undefined;

    // Identify any existing child payments from previous distribution
    const existingChildPayments = payments.filter((p) =>
      String(p.id) !== masterId && (
        String(p.distributionSourceId || '') === masterId ||
        (masterPay.distributedPaymentIds && masterPay.distributedPaymentIds.map(String).includes(String(p.id)))
      )
    );
    const existingChildIds = existingChildPayments.map((p) => String(p.id));

    // Determine target payment status and manual collection flag
    const isPendingStatus = editPaymentStatus === 'pending' || editPaymentStatus === 'لم يتم التحصيل';
    const isCancelledStatus = editPaymentStatus === 'cancelled' || editPaymentStatus === 'لاغي';
    const paymentStatusToUse = isPendingStatus ? 'pending' : (isCancelledStatus ? 'cancelled' : (editPaymentStatus || 'collected'));
    const isManuallyPaidToUse = paymentStatusToUse === 'collected';

    if (isDistributing && (selectedMonths.length > 1 || (selectedMonths.length === 1 && selectedMonths[0] !== pay.month))) {
      const count = selectedMonths.length;
      const basePerMonth = Math.floor(parsedAmount / count);
      const remainder = parsedAmount - basePerMonth * count;

      const sortedMonths = [...selectedMonths].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      // Anchor master to the clicked cell month if included in selection, otherwise original master month if included, otherwise first month in sorted selection
      const masterMonth = (selectedCell && sortedMonths.includes(selectedCell.month))
        ? selectedCell.month
        : (sortedMonths.includes(masterPay.month) ? masterPay.month : sortedMonths[0]);

      const otherMonths = sortedMonths.filter(m => m !== masterMonth);

      const childIds: string[] = [];
      const distributedPayments: Payment[] = sortedMonths.map((m, idx) => {
        const isMaster = (m === masterMonth);
        const hist = selectedCell ? getHistoricalOccupantForDate(selectedCell.resident, `${currentYear}-${m}`) : null;
        const occupant = hist?.occupantName || selectedCell?.resident.name || masterPay.residentName;

        const prevLinkedChild = existingChildPayments.find(p => p.month === m);
        const existingPaymentInMonth = payments.find(p => {
          const isSameUnit = (p.residentId && p.residentId === masterPay.residentId) || isSameFlatNumber(p.flatNumber, masterPay.flatNumber);
          if (!isSameUnit) return false;
          if (!isPaymentForYearAndMonth(p, currentYear, parseInt(m, 10))) return false;
          if (p.status === 'cancelled' || p.status === 'لاغي') return false;
          if (String(p.id) === String(masterPay.id)) return false;
          return isMonthlySubscriptionType(p.paymentType) || String(p.distributionSourceId || '') === String(masterPay.id);
        });

        const useOriginalId = isMaster;
        const newId = useOriginalId
          ? masterPay.id
          : (prevLinkedChild?.id || existingPaymentInMonth?.id || `pay_${Date.now()}_${m}_${idx}_${Math.random().toString(36).substr(2, 4)}`);
        if (!isMaster) {
          childIds.push(newId);
        }

        const cleanCustomNote = (editNotes || '').trim();
        const primaryMonthName = monthNamesArabic[parseInt(pay.month || masterPay.month, 10) - 1];
        const recNum = (editReceiptNumber || masterPay.receiptNumber || '').trim();
        const allocatedAmount = isMaster ? (basePerMonth + remainder) : basePerMonth;
        const statusNoteSuffix = isPendingStatus ? ' (غير محصل / معلق)' : '';

        const noteText = isMaster
          ? (sortedMonths.length === 1
              ? (cleanCustomNote
                  ? `${cleanCustomNote} (${isPendingStatus ? 'استحقاق' : 'سداد'} عن شهر ${monthNamesArabic[parseInt(masterMonth, 10) - 1]}${masterMonth !== pay.month ? ` - تم التسجيل في شهر ${primaryMonthName} ${currentYear}` : ''}${statusNoteSuffix})`
                  : `${isPendingStatus ? 'استحقاق' : 'سداد'} عن شهر ${monthNamesArabic[parseInt(masterMonth, 10) - 1]}${masterMonth !== pay.month ? ` (تم التسجيل في شهر ${primaryMonthName} ${currentYear})` : ''}${statusNoteSuffix}`)
              : (cleanCustomNote
                  ? `${cleanCustomNote} (${isPendingStatus ? 'استحقاق' : 'سداد'} مجمع عن شهور: ${sortedMonths.map(x => monthNamesArabic[parseInt(x, 10) - 1]).join('، ')}${!sortedMonths.includes(pay.month) ? ` - تم التسجيل في شهر ${primaryMonthName} ${currentYear}` : ''} - القيمة الموزعة للشهر: ${allocatedAmount.toLocaleString()} ج.م${statusNoteSuffix})`
                  : `${isPendingStatus ? 'استحقاق' : 'سداد'} مجمع عن شهور: ${sortedMonths.map(x => monthNamesArabic[parseInt(x, 10) - 1]).join('، ')}${!sortedMonths.includes(pay.month) ? ` (تم التسجيل في شهر ${primaryMonthName} ${currentYear})` : ''} (القيمة الموزعة للشهر: ${allocatedAmount.toLocaleString()} ج.م${statusNoteSuffix})`))
          : `${isPendingStatus ? 'مستحق غير محصل مسجل' : 'تم السداد'} في شهر ${primaryMonthName} ${currentYear} بإيصال رقم ${recNum || '—'} (القيمة الموزعة للشهر: ${allocatedAmount.toLocaleString()} ج.م)${cleanCustomNote ? ` (${cleanCustomNote})` : ''}`;

        return {
          id: newId,
          year: currentYear,
          month: m,
          residentId: masterPay.residentId,
          residentName: occupant,
          flatNumber: masterPay.flatNumber,
          paymentType: editPaymentType || masterPay.paymentType || 'اشتراك شهري',
          amount: allocatedAmount,
          expectedAmount: dueToSave,
          dueAmount: dueToSave,
          receiptNumber: recNum,
          notes: noteText,
          fileId: masterPay.fileId || '',
          fileUrl: masterPay.fileUrl || '',
          date: masterPay.date || new Date().toISOString().split('T')[0],
          isManuallyPaid: isManuallyPaidToUse,
          isManuallyEdited: true,
          status: paymentStatusToUse as any,
          isAggregatedCollection: isMaster,
          isDistributed: isMaster && otherMonths.length > 0,
          distributedPaymentIds: (isMaster && otherMonths.length > 0) ? childIds : undefined,
          distributionSourceId: isMaster ? undefined : masterPay.id,
          originalAmountBeforeDistribution: isMaster ? parsedAmount : undefined,
        };
      });

      // Child IDs that are no longer needed
      const childIdsToDelete = existingChildIds.filter((cid) => !childIds.includes(cid));

      if (onDistributePayment) {
        onDistributePayment(masterPay.id, distributedPayments, childIdsToDelete);
      } else {
        if (onEditPayment) onEditPayment(distributedPayments[0]);
        if (onAddPayment) {
          for (let i = 1; i < distributedPayments.length; i++) {
            onAddPayment(distributedPayments[i]);
          }
        }
        if (onDeletePayment) {
          childIdsToDelete.forEach((cid) => onDeletePayment(cid));
        }
      }

      // Update the currently viewed modal cell immediately
      const thisMonthPayments = distributedPayments.filter((p) => p.month === selectedCell?.month);
      setSelectedCell((prev) =>
        prev
          ? {
              ...prev,
              payments: [
                ...prev.payments.filter((p) => String(p.id) !== masterId && !existingChildIds.includes(String(p.id))),
                ...thisMonthPayments,
              ],
            }
          : null
      );

      setEditingPaymentId(null);
      setIsDistributing(false);
    } else if (existingChildIds.length > 0) {
      // Payment has existing child payments; propagate status, receipt, and notes to ALL slots in the distributed group
      const cleanCustomNote = (editNotes || '').trim();
      const recNum = (editReceiptNumber || masterPay.receiptNumber || '').trim();

      const updatedMaster: Payment = {
        ...masterPay,
        amount: parsedAmount,
        expectedAmount: dueToSave !== undefined ? dueToSave : masterPay.expectedAmount,
        dueAmount: dueToSave !== undefined ? dueToSave : (masterPay as any).dueAmount,
        paymentType: editPaymentType || masterPay.paymentType || 'اشتراك شهري',
        status: paymentStatusToUse as any,
        receiptNumber: recNum,
        notes: cleanCustomNote || masterPay.notes,
        isManuallyPaid: isManuallyPaidToUse,
        isManuallyEdited: true,
      };

      const updatedChildren: Payment[] = existingChildPayments.map((child) => ({
        ...child,
        paymentType: editPaymentType || child.paymentType || 'اشتراك شهري',
        status: paymentStatusToUse as any,
        receiptNumber: recNum,
        isManuallyPaid: isManuallyPaidToUse,
        isManuallyEdited: true,
      }));

      const allUpdated = [updatedMaster, ...updatedChildren];

      if (onDistributePayment) {
        onDistributePayment(masterPay.id, allUpdated, []);
      } else if (onEditPayment) {
        allUpdated.forEach((p) => onEditPayment(p));
      }

      // Update currently viewed modal cell immediately
      const thisMonthPayments = allUpdated.filter((p) => p.month === selectedCell?.month);
      setSelectedCell((prev) =>
        prev
          ? {
              ...prev,
              payments: [
                ...prev.payments.filter((p) => String(p.id) !== masterId && !existingChildIds.includes(String(p.id))),
                ...thisMonthPayments,
              ],
            }
          : null
      );

      setEditingPaymentId(null);
      setIsDistributing(false);
    } else {
      // Single payment update (or undistributed single payment)
      const cleanCustomNote = (editNotes || '').trim();
      const updatedPayment: Payment = {
        ...pay,
        amount: parsedAmount,
        expectedAmount: dueToSave,
        dueAmount: dueToSave,
        paymentType: editPaymentType,
        status: paymentStatusToUse as any,
        receiptNumber: (editReceiptNumber || '').trim(),
        notes: cleanCustomNote || undefined,
        isManuallyPaid: isManuallyPaidToUse,
        isManuallyEdited: true,
        isDistributed: false,
        distributedPaymentIds: [],
        originalAmountBeforeDistribution: undefined,
      };

      if (existingChildIds.length > 0 && onDistributePayment) {
        // If it was previously distributed and now saved as single month, delete old child payments
        onDistributePayment(masterPay.id, [updatedPayment], existingChildIds);
      } else {
        if (onEditPayment) {
          onEditPayment(updatedPayment);
        }
        if (existingChildIds.length > 0 && onDeletePayment) {
          existingChildIds.forEach((cid) => onDeletePayment(cid));
        }
      }

      setSelectedCell((prev) =>
        prev
          ? {
              ...prev,
              payments: prev.payments
                .filter((p) => !existingChildIds.includes(String(p.id)))
                .map((p) => (p.id === pay.id ? updatedPayment : p)),
            }
          : null
      );

      setEditingPaymentId(null);
      setIsDistributing(false);
    }
  };

  const isReadOnly = role === 'RESIDENT';

  return (
    <div className="space-y-4 sm:space-y-6 text-right">
      {/* Section 0: Building Status Map (Visual) */}
      <section>
        <BuildingMap 
          residents={residents} 
          payments={payments} 
          floorConfigs={floorConfigs} 
          currentYear={currentYear} 
          config={config}
          currentMonth={currentMonth}
          setCurrentMonth={setCurrentMonth}
          onEditResident={onEditResident}
        />
      </section>

      {/* Section 1: Financial Balance Sheet & Cash Flow */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-900" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">الملخص المالي والتدفق النقدي الشهري لعام {currentYear}</h3>
          </div>
          <span className="text-[10px] sm:text-xs font-bold text-slate-400">إجمالي التحصيلات والمصروفات وصافي الفارق</span>
        </div>

        <div 
          ref={table1Ref} 
          onScroll={handleTableScroll} 
          onTouchStart={handleScrollerInteraction}
          onPointerDown={handleScrollerInteraction}
          onWheel={handleScrollerInteraction}
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 overscroll-x-contain"
        >
          <table className="w-[118%] sm:w-full text-center border-collapse table-fixed min-w-[340px] sm:min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 font-extrabold text-[10px] sm:text-xs border-b border-slate-200">
                <th className="w-[16%] min-w-[48px] sm:w-36 sm:min-w-36 px-0.5 sm:px-2 py-2 sm:py-2.5 sticky right-0 bg-white shadow-xs z-10 border-l border-slate-200 text-center sm:text-right">
                  <span className="block sm:hidden text-[10px]">البيان</span>
                  <span className="hidden sm:block">البيان / البند</span>
                </th>
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <th key={idx} className="w-[14%] min-w-[42px] sm:w-24 sm:min-w-24 px-0.5 py-1.5 bg-slate-50/80 border-x border-slate-200 font-extrabold text-slate-800">
                    <div className="flex flex-col items-center justify-center leading-tight">
                      <span className="text-[10px] sm:text-xs text-emerald-800 font-black">{STATIC_MONTH_NAMES_ARABIC[idx]}</span>
                      <span className="text-[8px] sm:text-[9.5px] text-indigo-700 font-bold">{STATIC_MONTH_NAMES_ARABIC[idx + 6]}</span>
                    </div>
                  </th>
                ))}
                <th className="w-[18%] min-w-[55px] sm:w-28 sm:min-w-28 px-0.5 py-2 sm:py-2.5 bg-slate-100/60 border-r border-slate-200 text-slate-800 font-black">
                  مجموع 6 شهور
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs font-bold text-slate-800">
              {/* Row 1: Total Collections */}
              <tr key="collections_row1" className="hover:bg-slate-50/20 transition">
                <td rowSpan={2} className="px-0.5 sm:px-2 py-1.5 sm:py-2 sticky right-0 bg-white shadow-xs z-10 text-center sm:text-right border-l border-slate-200 font-black text-emerald-800">
                  <div className="flex flex-col items-center sm:items-start justify-center gap-1">
                    <span className="text-[10px] sm:text-[12.5px] block">التحصيل</span>
                    <div className="flex flex-col gap-0.5 text-[7.5px] sm:text-[8.5px] font-extrabold">
                      <span className="text-emerald-700 bg-emerald-50 px-1 rounded">1-6: يناير-يونيو</span>
                      <span className="text-indigo-800 bg-indigo-50 px-1 rounded">7-12: يوليو-ديسمبر</span>
                    </div>
                  </div>
                </td>
                {monthlyData.slice(0, 6).map((d) => (
                  <td key={d.month} className="px-0.5 py-1.5 sm:py-2 border-x border-slate-100 text-emerald-700 font-black">
                    <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                      {Math.round(d.payments).toLocaleString()}
                    </span>
                    <span className="text-[7px] sm:text-[9px] text-emerald-600/80 font-bold block leading-none">ج.م</span>
                  </td>
                ))}
                <td className="px-0.5 sm:px-1 py-1.5 sm:py-2 bg-emerald-100/50 border-r border-slate-100 text-emerald-950 font-black">
                  <span className="text-[10px] sm:text-[12.5px] block leading-tight font-black">
                    {Math.round(firstHalfPayments).toLocaleString()}
                  </span>
                  <span className="text-[7px] sm:text-[9px] text-emerald-800 font-bold block leading-none">ج.م</span>
                </td>
              </tr>
              <tr key="collections_row2" className="hover:bg-slate-50/20 transition border-b-2 border-b-slate-400">
                {monthlyData.slice(6, 12).map((d) => (
                  <td key={d.month} className="px-0.5 py-1.5 sm:py-2 border-x border-slate-100 text-emerald-800 font-black bg-indigo-50/10">
                    <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                      {Math.round(d.payments).toLocaleString()}
                    </span>
                    <span className="text-[7px] sm:text-[9px] text-emerald-700/80 font-bold block leading-none">ج.م</span>
                  </td>
                ))}
                <td className="px-0.5 sm:px-1 py-1.5 sm:py-2 bg-emerald-200/50 border-r border-slate-100 text-emerald-950 font-black">
                  <span className="text-[10px] sm:text-[12.5px] block leading-tight font-black">
                    {Math.round(secondHalfPayments).toLocaleString()}
                  </span>
                  <span className="text-[7px] sm:text-[9px] text-emerald-900 font-bold block leading-none">ج.م</span>
                </td>
              </tr>

              {/* Row 2: Total Expenses */}
              <tr key="expenses_row1" className="hover:bg-slate-50/20 transition">
                <td rowSpan={2} className="px-0.5 sm:px-2 py-1.5 sm:py-2 sticky right-0 bg-white shadow-xs z-10 text-center sm:text-right border-l border-slate-200 font-black text-red-800">
                  <div className="flex flex-col items-center sm:items-start justify-center gap-1">
                    <span className="text-[10px] sm:text-[12.5px] block">المصروفات</span>
                    <div className="flex flex-col gap-0.5 text-[7.5px] sm:text-[8.5px] font-extrabold">
                      <span className="text-rose-700 bg-rose-50 px-1 rounded">1-6: يناير-يونيو</span>
                      <span className="text-red-900 bg-red-100/60 px-1 rounded">7-12: يوليو-ديسمبر</span>
                    </div>
                  </div>
                </td>
                {monthlyData.slice(0, 6).map((d) => (
                  <td key={d.month} className="px-0.5 py-1.5 sm:py-2 border-x border-slate-100 text-red-600 font-black">
                    <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                      {Math.round(d.expenses).toLocaleString()}
                    </span>
                    <span className="text-[7px] sm:text-[9px] text-red-500/80 font-bold block leading-none">ج.م</span>
                  </td>
                ))}
                <td className="px-0.5 sm:px-1 py-1.5 sm:py-2 bg-red-100/50 border-r border-slate-100 text-red-950 font-black">
                  <span className="text-[10px] sm:text-[12.5px] block leading-tight font-black">
                    {Math.round(firstHalfExpenses).toLocaleString()}
                  </span>
                  <span className="text-[7px] sm:text-[9px] text-red-800 font-bold block leading-none">ج.م</span>
                </td>
              </tr>
              <tr key="expenses_row2" className="hover:bg-slate-50/20 transition border-b-2 border-b-slate-400">
                {monthlyData.slice(6, 12).map((d) => (
                  <td key={d.month} className="px-0.5 py-1.5 sm:py-2 border-x border-slate-100 text-red-700 font-black bg-indigo-50/10">
                    <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                      {Math.round(d.expenses).toLocaleString()}
                    </span>
                    <span className="text-[7px] sm:text-[9px] text-red-600/80 font-bold block leading-none">ج.م</span>
                  </td>
                ))}
                <td className="px-0.5 sm:px-1 py-1.5 sm:py-2 bg-red-200/50 border-r border-slate-100 text-red-950 font-black">
                  <span className="text-[10px] sm:text-[12.5px] block leading-tight font-black">
                    {Math.round(secondHalfExpenses).toLocaleString()}
                  </span>
                  <span className="text-[7px] sm:text-[9px] text-red-900 font-bold block leading-none">ج.م</span>
                </td>
              </tr>

              {/* Row 3: Net Balance / Cashflow */}
              <tr key="balance_row1" className="hover:bg-slate-50/30 transition bg-slate-50/40 font-black">
                <td rowSpan={2} className="px-0.5 sm:px-2 py-1.5 sm:py-2 sticky right-0 bg-slate-50 shadow-xs z-10 text-center sm:text-right border-l border-slate-200 text-blue-950 font-black">
                  <div className="flex flex-col items-center sm:items-start justify-center gap-1">
                    <span className="text-[10px] sm:text-[12.5px] block">الرصيد</span>
                    <div className="flex flex-col gap-0.5 text-[7.5px] sm:text-[8.5px] font-extrabold">
                      <span className="text-blue-800 bg-blue-100/60 px-1 rounded">1-6: يناير-يونيو</span>
                      <span className="text-indigo-900 bg-indigo-100 px-1 rounded">7-12: يوليو-ديسمبر</span>
                    </div>
                  </div>
                </td>
                {monthlyData.slice(0, 6).map((d) => (
                  <td key={d.month} className={`px-0.5 py-1.5 sm:py-2 border-x border-slate-100 font-black ${d.balance >= 0 ? 'text-blue-900' : 'text-amber-700'}`}>
                    <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                      {Math.round(d.balance).toLocaleString()}
                    </span>
                    <span className="text-[7px] sm:text-[9px] text-slate-400 font-bold block leading-none">ج.م</span>
                  </td>
                ))}
                <td className={`px-0.5 sm:px-1 py-1.5 sm:py-2 border-r border-slate-100 font-black ${firstHalfBalance >= 0 ? 'bg-blue-100/60 text-blue-950' : 'bg-amber-100/60 text-amber-900'}`}>
                  <span className="text-[10px] sm:text-[12.5px] block leading-tight font-black">
                    {Math.round(firstHalfBalance).toLocaleString()}
                  </span>
                  <span className="text-[7px] sm:text-[9px] text-slate-500 font-bold block leading-none">ج.م</span>
                </td>
              </tr>
              <tr key="balance_row2" className="hover:bg-slate-50/30 transition bg-slate-50/40 font-black border-b-2 border-b-slate-400">
                {monthlyData.slice(6, 12).map((d) => (
                  <td key={d.month} className={`px-0.5 py-1.5 sm:py-2 border-x border-slate-100 font-black bg-indigo-50/10 ${d.balance >= 0 ? 'text-blue-950' : 'text-amber-800'}`}>
                    <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                      {Math.round(d.balance).toLocaleString()}
                    </span>
                    <span className="text-[7px] sm:text-[9px] text-slate-400 font-bold block leading-none">ج.م</span>
                  </td>
                ))}
                <td className={`px-0.5 sm:px-1 py-1.5 sm:py-2 border-r border-slate-100 font-black ${secondHalfBalance >= 0 ? 'bg-blue-200/60 text-blue-950' : 'bg-amber-200/60 text-amber-900'}`}>
                  <span className="text-[10px] sm:text-[12.5px] block leading-tight font-black">
                    {Math.round(secondHalfBalance).toLocaleString()}
                  </span>
                  <span className="text-[7px] sm:text-[9px] text-slate-600 font-bold block leading-none">ج.م</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: Expense Categories Breakdown Table */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-slate-50 flex flex-col sm:flex-row items-center justify-between gap-1.5 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-red-600" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">جدول توزيع المصروفات حسب الفئات لعام {currentYear}</h3>
          </div>
          <span className="text-[10px] sm:text-xs font-bold text-slate-400">تتبع تفصيلي لقيمة مصروفات كل بند وفئة على مدار شهور السنة</span>
        </div>

        <div 
          ref={table2Ref} 
          onScroll={handleTableScroll} 
          onTouchStart={handleScrollerInteraction}
          onPointerDown={handleScrollerInteraction}
          onWheel={handleScrollerInteraction}
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 overscroll-x-contain"
        >
          <table className="w-[118%] sm:w-full text-center border-collapse table-fixed min-w-[340px] sm:min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 font-extrabold text-[10px] sm:text-xs border-b border-slate-200">
                <th className="w-[16%] min-w-[48px] sm:w-36 sm:min-w-36 px-0.5 sm:px-2 py-2 sm:py-2.5 sticky right-0 bg-white shadow-xs z-10 border-l border-slate-200 text-center sm:text-right">
                  <span className="block sm:hidden text-[10px]">البند</span>
                  <span className="hidden sm:block">فئة المصروف</span>
                </th>
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <th key={idx} className="w-[14%] min-w-[42px] sm:w-24 sm:min-w-24 px-0.5 py-1.5 bg-slate-50/80 border-x border-slate-200 font-extrabold text-slate-800">
                    <div className="flex flex-col items-center justify-center leading-tight">
                      <span className="text-[10px] sm:text-xs text-emerald-800 font-black">{STATIC_MONTH_NAMES_ARABIC[idx]}</span>
                      <span className="text-[8px] sm:text-[9.5px] text-indigo-700 font-bold">{STATIC_MONTH_NAMES_ARABIC[idx + 6]}</span>
                    </div>
                  </th>
                ))}
                <th className="w-[18%] min-w-[55px] sm:w-28 sm:min-w-28 px-0.5 py-2 sm:py-2.5 bg-slate-100/60 border-r border-slate-200 text-slate-800 font-black">
                  مجموع 6 شهور
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs font-bold text-slate-800">
              {categoryMonthlyData.map((catData) => (
                <React.Fragment key={catData.category}>
                  <tr key={`${catData.category}_row1`} className="hover:bg-slate-50/30 transition">
                    <td rowSpan={2} className="px-0.5 sm:px-2 py-1.5 sm:py-2 sticky right-0 bg-white shadow-xs z-10 text-center sm:text-right border-l border-slate-200 font-black text-slate-800">
                      <div className="flex flex-col items-center sm:items-start justify-center gap-1">
                        <span className="text-[9.5px] sm:text-[12px] block truncate max-w-[70px] sm:max-w-none" title={catData.category}>
                          {catData.category}
                        </span>
                        <div className="flex flex-col gap-0.5 text-[7px] sm:text-[8px] font-bold">
                          <span className="text-slate-600 bg-slate-100 px-1 rounded">1-6</span>
                          <span className="text-indigo-800 bg-indigo-50 px-1 rounded">7-12</span>
                        </div>
                      </div>
                    </td>
                    {catData.monthAmounts.slice(0, 6).map((amount, idx) => (
                      <td key={idx} className="px-0.5 py-1.5 sm:py-2 border-x border-slate-100 text-center font-bold">
                        {amount > 0 ? (
                          <div>
                            <span className="text-[9px] sm:text-[11.5px] font-black text-red-600 block leading-tight">
                              {Math.round(amount).toLocaleString()}
                            </span>
                            <span className="text-[6.5px] sm:text-[8.5px] text-red-400 font-bold block leading-none">ج.م</span>
                          </div>
                        ) : (
                          <span className="text-[10px] sm:text-xs text-slate-300 font-bold">-</span>
                        )}
                      </td>
                    ))}
                    <td className="px-0.5 sm:px-1 py-1.5 sm:py-2 bg-red-50/40 border-r border-slate-100 text-red-900 font-black">
                      <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                        {Math.round(catData.firstHalfTotal).toLocaleString()}
                      </span>
                      <span className="text-[6.5px] sm:text-[8.5px] text-red-700 font-bold block leading-none">ج.م</span>
                    </td>
                  </tr>
                  <tr key={`${catData.category}_row2`} className="hover:bg-slate-50/30 transition border-b-2 border-b-slate-400">
                    {catData.monthAmounts.slice(6, 12).map((amount, idx) => (
                      <td key={idx + 6} className="px-0.5 py-1.5 sm:py-2 border-x border-slate-100 text-center font-bold bg-indigo-50/10">
                        {amount > 0 ? (
                          <div>
                            <span className="text-[9px] sm:text-[11.5px] font-black text-red-700 block leading-tight">
                              {Math.round(amount).toLocaleString()}
                            </span>
                            <span className="text-[6.5px] sm:text-[8.5px] text-red-400 font-bold block leading-none">ج.م</span>
                          </div>
                        ) : (
                          <span className="text-[10px] sm:text-xs text-slate-300 font-bold">-</span>
                        )}
                      </td>
                    ))}
                    <td className="px-0.5 sm:px-1 py-1.5 sm:py-2 bg-red-100/40 border-r border-slate-100 text-red-950 font-black">
                      <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                        {Math.round(catData.secondHalfTotal).toLocaleString()}
                      </span>
                      <span className="text-[6.5px] sm:text-[8.5px] text-red-800 font-bold block leading-none">ج.م</span>
                    </td>
                  </tr>
                </React.Fragment>
              ))}

              {/* Total Expenses Row */}
              <tr key="tot_expenses_row1" className="bg-slate-100/80 font-black text-[10px] sm:text-xs border-t-2 border-slate-200">
                <td rowSpan={2} className="px-0.5 sm:px-2 py-2 sm:py-2.5 sticky right-0 bg-slate-100 shadow-xs z-10 text-center sm:text-right border-l border-slate-200 text-slate-900 font-black">
                  <div className="flex flex-col items-center sm:items-start justify-center gap-1">
                    <span className="block text-[9.5px] sm:text-[12px]">إجمالي المصروفات</span>
                    <div className="flex flex-col gap-0.5 text-[7px] sm:text-[8px] font-bold">
                      <span className="text-red-800 bg-red-100 px-1 rounded">1-6</span>
                      <span className="text-red-950 bg-red-200 px-1 rounded">7-12</span>
                    </div>
                  </div>
                </td>
                {monthlyData.slice(0, 6).map((d) => (
                  <td key={d.month} className="px-0.5 py-2 sm:py-2.5 border-x border-slate-200/60 text-red-700 font-black">
                    <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                      {Math.round(d.expenses).toLocaleString()}
                    </span>
                    <span className="text-[6.5px] sm:text-[8.5px] text-red-500 font-bold block leading-none">ج.م</span>
                  </td>
                ))}
                <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 bg-red-100/60 border-r border-slate-200 text-red-950 font-black">
                  <span className="text-[10px] sm:text-[12.5px] block leading-tight font-black">
                    {Math.round(firstHalfExpenses).toLocaleString()}
                  </span>
                  <span className="text-[6.5px] sm:text-[8.5px] text-red-800 font-bold block leading-none">ج.م</span>
                </td>
              </tr>
              <tr key="tot_expenses_row2" className="bg-slate-100/80 font-black text-[10px] sm:text-xs border-b-2 border-b-slate-400">
                {monthlyData.slice(6, 12).map((d) => (
                  <td key={d.month} className="px-0.5 py-2 sm:py-2.5 border-x border-slate-200/60 text-red-800 font-black bg-indigo-50/10">
                    <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                      {Math.round(d.expenses).toLocaleString()}
                    </span>
                    <span className="text-[6.5px] sm:text-[8.5px] text-red-600 font-bold block leading-none">ج.م</span>
                  </td>
                ))}
                <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 bg-red-200/60 border-r border-slate-200 text-red-950 font-black">
                  <span className="text-[10px] sm:text-[12.5px] block leading-tight font-black">
                    {Math.round(secondHalfExpenses).toLocaleString()}
                  </span>
                  <span className="text-[6.5px] sm:text-[8.5px] text-red-900 font-bold block leading-none">ج.م</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Interactive Collections Table Grouped by Floor */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-slate-50/70">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-500 font-bold">
            <RefreshCw className="w-3.5 h-3.5 text-blue-900" />
            <span>
              {role === 'ASSISTANT'
                ? '* انقر على أي خانة لعرض التفاصيل وتوليد الإيصالات والإشعارات'
                : '* انقر على أي خانة لعرض تفاصيل وكشف المتحصلات المجمعة لهذا الشهر'}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end w-full sm:w-auto">
            {/* Global Collapse/Expand All Floors Button */}
            <button
              type="button"
              onClick={toggleAllFloors}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-900 text-white hover:bg-blue-950 text-xs font-black shadow-2xs transition active:scale-95 cursor-pointer"
            >
              {collapsedFloorIds.size === floorResidentGroups.length ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5 stroke-[3]" />
                  <span>فتح كل الأدوار</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5 stroke-[3]" />
                  <span>غلق كل الأدوار</span>
                </>
              )}
            </button>

            {/* Payment Type Filter Selector */}
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
              <Filter className="w-3.5 h-3.5 text-blue-900 shrink-0" />
              <label htmlFor="summaryPaymentTypeFilter" className="text-[10px] sm:text-xs font-bold text-slate-600 whitespace-nowrap">
                نوع التحصيل:
              </label>
              <select
                id="summaryPaymentTypeFilter"
                value={selectedPaymentTypeFilter}
                onChange={(e) => setSelectedPaymentTypeFilter(e.target.value)}
                className="bg-transparent text-[10.5px] sm:text-xs font-black text-blue-950 focus:outline-hidden cursor-pointer pr-1"
              >
                <option value="اشتراك شهري">اشتراك شهري (افتراضي)</option>
                {availablePaymentTypes
                  .filter((t) => !matchesPaymentType(t, 'اشتراك شهري'))
                  .map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                <option value="all">جميع أنواع التحصيل (الجميع)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-900 shrink-0" />
              <h3 className="text-xs sm:text-sm font-black text-slate-900 whitespace-nowrap">
                {selectedPaymentTypeFilter === 'all'
                  ? `جدول كشف اشتراك شهري لكافة الأنواع لعام ${currentYear}`
                  : selectedPaymentTypeFilter === 'اشتراك شهري'
                  ? `جدول كشف اشتراك شهري للاشتراكات لعام ${currentYear}`
                  : `جدول كشف اشتراك شهري (${selectedPaymentTypeFilter}) لعام ${currentYear}`}
              </h3>
            </div>
          </div>
        </div>

        {/* Status Legend Bar - Matches PaymentsList row colors */}
        <div className="px-1 sm:px-3 py-1 bg-slate-100/90 border-b border-slate-200 overflow-x-auto scrollbar-none flex items-center justify-between sm:justify-start gap-1 sm:gap-2 text-[7.5px] min-[360px]:text-[8px] min-[400px]:text-[9px] sm:text-[10.5px] font-black whitespace-nowrap">
          <span className="text-slate-600 font-extrabold shrink-0 hidden md:inline ml-1">دليل الألوان:</span>
          <div className="flex items-center justify-between sm:justify-start gap-0.5 sm:gap-1.5 w-full sm:w-auto">
            <span className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0.5 rounded bg-emerald-200 text-emerald-950 border border-emerald-400 shadow-2xs shrink-0 font-black">
              <Check className="w-2 h-2 sm:w-2.5 sm:h-2.5 stroke-[3.5] text-emerald-800" /> مسدد
            </span>
            <span className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0.5 rounded bg-rose-200 text-rose-950 border border-rose-400 shadow-2xs shrink-0 font-black">
              <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5 stroke-[2.5] text-rose-800" /> استحقاق معلق
            </span>
            <span className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0.5 rounded bg-red-900 text-white border border-red-950 shadow-2xs shrink-0 font-black">
              <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5 stroke-[2.5] text-amber-300" /> معلق برقم إيصال
            </span>
            <span className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-300 shadow-2xs shrink-0 font-black">
              <Minus className="w-2 h-2 sm:w-2.5 sm:h-2.5 stroke-[3] text-slate-700" /> معفي
            </span>
            <span className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0.5 rounded bg-slate-400 text-slate-950 border border-slate-600 shadow-2xs shrink-0 font-black">
              <X className="w-2 h-2 sm:w-2.5 sm:h-2.5 stroke-[3] text-slate-950" /> لاغي
            </span>
            <span className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0.5 rounded bg-white text-slate-500 border border-slate-300 shadow-2xs shrink-0 font-black">
              بدون دفعات مسجلة
            </span>
          </div>
        </div>

        <div 
          ref={table3Ref} 
          onScroll={handleTableScroll} 
          onTouchStart={handleScrollerInteraction}
          onPointerDown={handleScrollerInteraction}
          onWheel={handleScrollerInteraction}
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 overscroll-x-contain"
        >
          <table className="w-[118%] sm:w-full text-center border-collapse table-fixed min-w-[340px] sm:min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 font-extrabold text-[10px] sm:text-xs border-b border-slate-200">
                <th className="w-[16%] min-w-[48px] sm:w-36 sm:min-w-36 px-0.5 sm:px-1.5 py-1.5 sm:py-2 sticky right-0 bg-white shadow-xs z-10 border-l border-slate-200 text-center">
                  <div className="flex flex-col items-center justify-center leading-tight">
                    <span className="text-[10px] sm:text-xs font-black text-slate-800">الوحدة</span>
                    <span className="text-[8.5px] sm:text-[9.5px] font-bold text-slate-400">الاسم</span>
                  </div>
                </th>
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <th key={idx} className="w-[14%] min-w-[42px] sm:w-24 sm:min-w-24 px-0.5 py-1.5 bg-slate-50/80 border-x border-slate-200 font-extrabold text-slate-800">
                    <div className="flex flex-col items-center justify-center leading-tight">
                      <span className="text-[10px] sm:text-xs text-emerald-800 font-black">{STATIC_MONTH_NAMES_ARABIC[idx]}</span>
                      <span className="text-[8px] sm:text-[9.5px] text-indigo-700 font-bold">{STATIC_MONTH_NAMES_ARABIC[idx + 6]}</span>
                    </div>
                  </th>
                ))}
                <th className="w-[18%] min-w-[55px] sm:w-28 sm:min-w-28 px-0.5 py-2 sm:py-2.5 bg-slate-100/60 border-r border-slate-200 text-slate-800 font-black">
                  مجموع 6 شهور
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs font-bold text-slate-800">
              {floorResidentGroups.map((group) => {
                const isFloorCollapsed = collapsedFloorIds.has(group.floor.id);
                return (
                  <React.Fragment key={group.floor.id}>
                    {/* Floor Divider / Separator Header */}
                    <tr className="bg-slate-100/90 border-y-2 border-slate-200/80">
                      <td colSpan={8} className="py-1.5 sm:py-2 px-2 sm:px-3 text-right sticky right-0 bg-slate-100/95 z-5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <button
                              type="button"
                              onClick={() => toggleFloor(group.floor.id)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-900 text-white hover:bg-blue-950 font-black text-[10px] sm:text-xs shadow-2xs transition active:scale-95 cursor-pointer"
                            >
                              {isFloorCollapsed ? (
                                <>
                                  <ChevronDown className="w-3.5 h-3.5 stroke-[3]" />
                                  <span>فتح صفوف الدور</span>
                                </>
                              ) : (
                                <>
                                  <ChevronUp className="w-3.5 h-3.5 stroke-[3]" />
                                  <span>غلق صفوف الدور</span>
                                </>
                              )}
                            </button>
                            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-blue-900 inline-block shadow-xs"></span>
                            <span className="text-[11px] sm:text-xs font-black text-blue-950">{group.floor.floorLabel}</span>
                            <span className="text-[9px] sm:text-[10.5px] font-bold text-slate-500">
                              ({group.residents.length} {group.residents.length === 1 ? 'وحدة' : 'وحدات'})
                            </span>
                          </div>
                          <span className="text-[8.5px] sm:text-[10px] font-extrabold text-slate-600 bg-white/90 px-1.5 sm:px-2 py-0.5 rounded-md border border-slate-200/70">
                            {group.floor.activityType || 'سكني'}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Residents of this floor */}
                    {!isFloorCollapsed && group.residents.map((res) => {
                      const occupantName = occupantNamesMap.get(res.id) || res.name;
                      const firstHalfTotal = residentHalfTotals.firstHalf.get(res.id) || 0;
                      const secondHalfTotal = residentHalfTotals.secondHalf.get(res.id) || 0;

                      const renderCell = (m: string, idx: number) => {
                        const status = getSubscriptionStatus(res.id, m);
                        const isMulti = status.paymentsList.length > 1;
                        const histAct = historicalActivitiesMap.get(`${res.id}_${m}`) || { activityType: res.activityType || 'سكني', monthlyFee: defaultMonthlyFee || 400 };
                        const isNoFeeActivity = Boolean(
                          histAct.activityType === 'بدون تحصيل' ||
                          histAct.activityType === 'بدون تشطيب' ||
                          histAct.activityType?.includes('بدون تحصيل') ||
                          histAct.activityType?.includes('بدون تشطيب') ||
                          (histAct.monthlyFee === 0)
                        );

                        let cellBgClass = 'bg-white hover:bg-slate-100/70 text-slate-300 border border-slate-200';
                        if (status.paid) {
                          cellBgClass = 'bg-emerald-200/90 text-emerald-950 hover:bg-emerald-300/90 border border-emerald-400 shadow-2xs font-black';
                        } else if (status.pending) {
                          if (status.hasPendingWithReceipt) {
                            cellBgClass = 'bg-red-900 text-white hover:bg-red-950 border border-red-950 shadow-2xs font-black';
                          } else {
                            cellBgClass = 'bg-rose-200/90 text-rose-950 hover:bg-rose-300/90 border border-rose-400 shadow-2xs font-black';
                          }
                        } else if (status.isCancelled) {
                          cellBgClass = 'bg-slate-400/80 text-slate-950 hover:bg-slate-400 border border-slate-600 shadow-2xs font-black';
                        } else if (isNoFeeActivity || histAct.monthlyFee === 0) {
                          cellBgClass = 'bg-slate-200/90 text-slate-800 hover:bg-slate-200 border border-slate-300 shadow-2xs font-black';
                        } else {
                          cellBgClass = 'bg-white hover:bg-slate-100/70 text-slate-300 border border-slate-200 font-bold';
                        }

                        return (
                          <td
                            key={m}
                            onClick={() => {
                              const monthName = STATIC_MONTH_NAMES_ARABIC[idx];
                              const prescribedFee = getDefaultFeeForResident(res, m, currentYear);
                              setNewAmount(String(prescribedFee));
                              setNewDueAmount(String(prescribedFee));
                              setNewNotes('');
                              setNewPaymentType(
                                selectedPaymentTypeFilter !== 'all'
                                  ? selectedPaymentTypeFilter
                                  : (isNoFeeActivity ? 'تحصيلات اخرى' : 'اشتراك شهري')
                              );
                              setEditingPaymentId(null);
                              setDeleteConfirmId(null);
                              setSelectedCell({
                                resident: res,
                                month: m,
                                monthName: monthName,
                                payments: status.paymentsList,
                              });
                            }}
                            className={`px-0.5 py-1 text-center border-x border-slate-100 cursor-pointer ${cellBgClass} transition font-bold`}
                          >
                            <div className="flex flex-col items-center justify-center gap-0.5 min-h-[28px] sm:min-h-[30px]">
                              {status.paid ? (
                                <>
                                  <div className="flex items-center gap-0.5">
                                    <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-800 stroke-[3.5]" />
                                    {status.isDistributed && (
                                      <span className="w-2 h-2 rounded-full bg-emerald-600 ring-2 ring-emerald-300 animate-pulse" title="تم التوزيع من هذه الدفعة" />
                                    )}
                                    {!status.isDistributed && status.isAggregated && (
                                      <span className="text-[7px] sm:text-[7.5px] font-black px-1 py-0.2 bg-amber-300 text-amber-950 rounded-xs shadow-2xs" title="دفعة موزعة من تحصيل مجمع">
                                        موزع
                                      </span>
                                    )}
                                    {isMulti && (
                                      <span className="text-[7.5px] sm:text-[9px] font-black px-0.5 py-0.2 bg-blue-300 text-blue-900 rounded-xs">
                                        {status.paymentsList.length}
                                      </span>
                                    )}
                                  </div>
                                  {status.amount > 0 && (
                                    <span className="text-[9.5px] sm:text-[11.5px] font-black text-emerald-950 leading-none">
                                      {Math.round(status.amount).toLocaleString()}
                                    </span>
                                  )}
                                </>
                              ) : status.pending ? (
                                <>
                                  <div className="flex items-center gap-0.5">
                                    <Clock className={`w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5] ${status.hasPendingWithReceipt ? 'text-amber-300' : 'text-rose-800'}`} />
                                    {status.isDistributed && (
                                      <span className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-300 animate-pulse" title="تم التوزيع من هذه الدفعة" />
                                    )}
                                    {!status.isDistributed && status.isAggregated && (
                                      <span className="text-[7px] sm:text-[7.5px] font-black px-1 py-0.2 bg-amber-300 text-amber-950 rounded-xs" title="دفعة موزعة من تحصيل مجمع">
                                        موزع
                                      </span>
                                    )}
                                    {isMulti && (
                                      <span className={`text-[7.5px] sm:text-[9px] font-black px-0.5 py-0.2 rounded-xs ${status.hasPendingWithReceipt ? 'bg-red-950 text-amber-200' : 'bg-rose-300 text-rose-950'}`}>
                                        {status.paymentsList.length}
                                      </span>
                                    )}
                                  </div>
                                  <span className={`text-[8.5px] sm:text-[10px] font-black whitespace-nowrap leading-none ${status.hasPendingWithReceipt ? 'text-white' : 'text-rose-950'}`}>
                                    {status.hasPendingWithReceipt ? 'إيصال معلق' : 'استحقاق'}
                                  </span>
                                  {status.pendingAmount > 0 && (
                                    <span className={`text-[9px] sm:text-[11px] font-black leading-none ${status.hasPendingWithReceipt ? 'text-amber-200' : 'text-rose-950'}`}>
                                      {Math.round(status.pendingAmount).toLocaleString()}
                                    </span>
                                  )}
                                </>
                              ) : status.isCancelled ? (
                                <>
                                  <div className="flex items-center gap-0.5">
                                    <X className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-900 stroke-[3]" />
                                  </div>
                                  <span className="text-[8.5px] sm:text-[10px] font-black text-slate-950 whitespace-nowrap leading-none line-through">
                                    لاغي
                                  </span>
                                </>
                              ) : (isNoFeeActivity || histAct.monthlyFee === 0) ? (
                                <>
                                  <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-700 stroke-[3]" />
                                  <span className="text-[9px] sm:text-[11px] font-black text-slate-800 whitespace-nowrap leading-none">
                                    معفي
                                  </span>
                                </>
                              ) : (
                                <span className="text-slate-300 font-bold text-xs select-none">—</span>
                              )}
                            </div>
                          </td>
                        );
                      };

                      return (
                        <React.Fragment key={res.id}>
                          {/* Sub-row 1: Jan - Jun */}
                          <tr className="hover:bg-slate-50/30 transition">
                            <td rowSpan={2} className="px-0.5 sm:px-1.5 py-1.5 sm:py-2 sticky right-0 bg-white shadow-xs z-10 text-center border-l border-slate-200 overflow-hidden">
                              <div className="flex flex-col leading-tight items-center justify-center w-full">
                                <span className="font-black text-blue-900 text-[10px] sm:text-xs whitespace-nowrap">وحدة {res.flatNumber}</span>
                                <span 
                                  className="text-slate-600 font-bold truncate max-w-[54px] sm:max-w-[95px] text-[8.5px] sm:text-[10px] leading-tight mt-0.5 block" 
                                  title={occupantName}
                                >
                                  {occupantName}
                                </span>
                                <div className="flex flex-col gap-0.5 text-[7px] sm:text-[8px] font-black mt-1">
                                  <span className="px-1 py-0.2 bg-emerald-50 text-emerald-800 rounded border border-emerald-200">1-6</span>
                                  <span className="px-1 py-0.2 bg-indigo-50 text-indigo-800 rounded border border-indigo-200">7-12</span>
                                </div>
                              </div>
                            </td>
                            {STATIC_MONTHS.slice(0, 6).map((m, idx) => renderCell(m, idx))}
                            <td className="px-0.5 sm:px-1 py-1.5 sm:py-2 bg-emerald-50/50 border-r border-slate-100 text-center font-black">
                              <span className="text-[10px] sm:text-xs text-emerald-950 block leading-tight font-black">
                                {Math.round(firstHalfTotal).toLocaleString()}
                              </span>
                              <span className="text-[7.5px] sm:text-[9.5px] text-emerald-700 font-bold block leading-none">ج.م</span>
                            </td>
                          </tr>

                          {/* Sub-row 2: Jul - Dec */}
                          <tr className="hover:bg-slate-50/30 transition border-b-2 border-b-slate-400">
                            {STATIC_MONTHS.slice(6, 12).map((m, idx) => renderCell(m, idx + 6))}
                            <td className="px-0.5 sm:px-1 py-1.5 sm:py-2 bg-indigo-50/50 border-r border-slate-100 text-center font-black">
                              <span className="text-[10px] sm:text-xs text-indigo-950 block leading-tight font-black">
                                {Math.round(secondHalfTotal).toLocaleString()}
                              </span>
                              <span className="text-[7.5px] sm:text-[9.5px] text-indigo-700 font-bold block leading-none">ج.م</span>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Aggregated Collections Details Overlay Modal */}
      {selectedCell && (() => {
        // Instant optimistic merge: combines parent payments state with local optimistic cell updates to eliminate lag & flickering
        const activeCellPayments = (() => {
          const deletedIds = getDeletedPaymentIds();
          const map = new Map<string, Payment>();
          payments.forEach((p) => {
            const pId = String(p.id);
            if (
              !localDeletedPaymentIds.has(pId) &&
              !deletedIds.has(pId) &&
              p.residentId === selectedCell.resident.id &&
              p.month === selectedCell.month &&
              p.year === currentYear
            ) {
              map.set(pId, p);
            }
          });
          (selectedCell.payments || []).forEach((p) => {
            const pId = String(p.id);
            if (
              !localDeletedPaymentIds.has(pId) &&
              !deletedIds.has(pId) &&
              p.residentId === selectedCell.resident.id &&
              p.month === selectedCell.month &&
              p.year === currentYear
            ) {
              map.set(pId, p);
            }
          });
          return Array.from(map.values());
        })();

        const cellPrescribed = getPrescribedFeeForMonth(
          selectedCell.resident,
          currentYear,
          parseInt(selectedCell.month, 10),
          payments,
          defaultMonthlyFee,
          activityDefaultFees,
          config?.activityFeePeriods,
          config?.customUnitFeePeriods
        );

        const isCancelledPayment = (p: Payment) =>
          p.status === 'cancelled' ||
          p.status === 'لاغي' ||
          p.status === 'VOID' ||
          p.status === 'ملغي' ||
          p.status === 'مرفوض';

        const isExplicitPaidStatus = (p: Payment) =>
          p.status === 'collected' ||
          p.status === 'paid' ||
          p.status === 'تم التحصيل' ||
          p.status === 'مسدد' ||
          p.isManuallyPaid === true;

        const isUncollectedPayment = (p: Payment) => {
          if (isExplicitPaidStatus(p)) return false;
          return (
            p.status === 'pending' ||
            p.status === 'لم يتم التحصيل' ||
            p.status === 'uncollected' ||
            p.status === 'unpaid' ||
            p.status === 'غير مسدد' ||
            p.status === 'معلق' ||
            (p.isManuallyPaid === false && !p.receiptNumber && (!p.status || p.status === 'pending'))
          );
        };

        const isExemptPayment = (p: Payment) =>
          p.status === 'معفي' ||
          p.status === 'exempt' ||
          p.status === 'إعفاء' ||
          (p.amount === 0 && (p.status === 'pending' || p.status === 'لم يتم التحصيل' || (p.notes && p.notes.includes('استحقاق'))));

        const validCollectedPayments = activeCellPayments.filter(
          (p) => !isCancelledPayment(p) && !isUncollectedPayment(p) && !isExemptPayment(p)
        );

        const activeCellTotal = validCollectedPayments.reduce(
          (sum, p) => sum + (Number(p.amount) || 0),
          0
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto" dir="rtl">
            <div className="w-full max-w-lg bg-white rounded-xl sm:rounded-2xl border border-slate-100 shadow-xl animate-scale-up text-right flex flex-col h-[92vh] max-h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-hidden my-auto">
              {/* Header */}
              <div className="px-3.5 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-blue-900" />
                  <h3 className="text-xs font-black text-slate-900">
                    تفاصيل متحصلات وحدة {selectedCell.resident.flatNumber} لشهر {selectedCell.monthName} {currentYear}
                  </h3>
                </div>
                <button 
                  onClick={() => setSelectedCell(null)} 
                  className="p-1 hover:bg-slate-200/60 rounded-lg transition"
                  title="إغلاق"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {/* Content Body */}
              <div className="p-3 space-y-2 overflow-y-auto flex-1 min-h-0">
                {/* Resident Summary Bar */}
                <div className="bg-blue-50/50 p-2 sm:p-2.5 rounded-xl border border-blue-100/70 flex items-center justify-between gap-2 shrink-0">
                  {/* Right side: Occupant & Total */}
                  <div className="space-y-1 text-right">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 font-bold">الساكن:</span>
                      <span className="text-xs font-black text-slate-800">{selectedCell.resident.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 font-bold">الإجمالي:</span>
                      <span className="text-xs font-black text-emerald-600 bg-emerald-50/80 px-2 py-0.5 rounded">
                        {activeCellTotal.toLocaleString()} ج.م
                      </span>
                    </div>
                  </div>

                  {/* Left side: Activity Badge & Unit History Button (as circled in screenshot 2) */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-1 bg-purple-100 text-purple-900 px-2 py-0.5 rounded text-[10px] font-black border border-purple-200">
                      <span>النشاط: {cellPrescribed.activityType} ({cellPrescribed.monthlyFee.toLocaleString()} ج.م)</span>
                    </div>
                    {role === 'ADMIN' && (
                      <button
                        type="button"
                        onClick={() => setHistoryModalResident(selectedCell.resident)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-purple-100/90 hover:bg-purple-200 text-purple-950 border border-purple-300 rounded-lg text-[10px] sm:text-xs font-black transition active:scale-95 shadow-2xs cursor-pointer"
                        title="فتح سجل الوحدة والشاغلين وتاريخ النشاط"
                      >
                        <History className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                        <span>سجل الوحدة</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Payments List */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-slate-500">الدفعات المسجلة ({activeCellPayments.length}):</h4>
                  </div>
                      
                      {activeCellPayments.length === 0 ? (
                        <div className="text-center py-4 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center gap-1 bg-slate-50/30">
                          <Clock className="w-5 h-5 text-slate-300" />
                          <p className="text-[10.5px] text-slate-400 font-bold">لا توجد دفعات مسجلة لهذا الشهر حالياً.</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-[50vh] sm:max-h-[42vh] overflow-y-auto pr-0.5">
                          {activeCellPayments.map((pay) => {
                            const isEditing = editingPaymentId === pay.id;
                      const isCancelled = pay.status === 'cancelled' || pay.status === 'لاغي' || pay.status === 'VOID' || pay.status === 'ملغي' || pay.status === 'مرفوض';
                      const isExempt = !isCancelled && (pay.status === 'معفي' || pay.status === 'exempt' || pay.status === 'إعفاء' || (pay.amount === 0 && (pay.status === 'pending' || pay.status === 'لم يتم التحصيل' || (pay.notes && pay.notes.includes('استحقاق')))));
                      const isExplicitCollected =
                        pay.status === 'collected' ||
                        pay.status === 'paid' ||
                        pay.status === 'تم التحصيل' ||
                        pay.status === 'مسدد' ||
                        pay.isManuallyPaid === true;

                      const isPending =
                        !isCancelled &&
                        !isExempt &&
                        !isExplicitCollected &&
                        (pay.status === 'pending' ||
                          pay.status === 'لم يتم التحصيل' ||
                          pay.status === 'uncollected' ||
                          pay.status === 'unpaid' ||
                          pay.status === 'غير مسدد' ||
                          pay.status === 'معلق' ||
                          (pay.isManuallyPaid === false && !pay.receiptNumber && (!pay.status || pay.status === 'pending')));

                      const isCollected = !isCancelled && !isExempt && !isPending;
                      const hasReceipt = Boolean(pay.receiptNumber && pay.receiptNumber.trim() !== '');

                      let cardThemeClass = 'bg-emerald-200/90 border-emerald-400 hover:bg-emerald-300/80 text-emerald-950 shadow-2xs';
                      let statusBadge = (
                        <span className="px-1.5 py-0.5 bg-emerald-300 text-emerald-950 border border-emerald-500 text-[9px] font-black rounded flex items-center gap-0.5 shadow-2xs">
                          <Check className="w-2.5 h-2.5 stroke-[3.5]" />
                          <span>مسدد</span>
                        </span>
                      );

                      if (isExempt) {
                        cardThemeClass = 'bg-slate-200/90 border-slate-400 hover:bg-slate-300/80 text-slate-900 shadow-2xs';
                        statusBadge = (
                          <span className="px-1.5 py-0.5 bg-slate-300 text-slate-900 border border-slate-400 text-[9px] font-black rounded flex items-center gap-0.5 shadow-2xs">
                            <Minus className="w-2.5 h-2.5 stroke-[3]" />
                            <span>معفي</span>
                          </span>
                        );
                      } else if (isCancelled) {
                        cardThemeClass = 'bg-slate-400/80 border-slate-600 hover:bg-slate-400 text-slate-950 opacity-90 shadow-2xs';
                        statusBadge = (
                          <span className="px-1.5 py-0.5 bg-slate-500 text-white border border-slate-600 text-[9px] font-black rounded flex items-center gap-0.5 shadow-2xs">
                            <X className="w-2.5 h-2.5 stroke-[3]" />
                            <span>لاغي</span>
                          </span>
                        );
                      } else if (isPending) {
                        if (hasReceipt) {
                          cardThemeClass = 'bg-red-900 border-red-950 hover:bg-red-950 text-white shadow-xs';
                          statusBadge = (
                            <span className="px-1.5 py-0.5 bg-red-950 text-amber-200 border border-amber-400 text-[9px] font-black rounded flex items-center gap-0.5 shadow-2xs">
                              <Clock className="w-2.5 h-2.5 stroke-[2.5]" />
                              <span>معلق برقم إيصال</span>
                            </span>
                          );
                        } else {
                          cardThemeClass = 'bg-rose-200/90 border-rose-400 hover:bg-rose-300/80 text-rose-950 shadow-2xs';
                          statusBadge = (
                            <span className="px-1.5 py-0.5 bg-rose-300 text-rose-950 border border-rose-400 text-[9px] font-black rounded flex items-center gap-0.5 shadow-2xs">
                              <Clock className="w-2.5 h-2.5 stroke-[2.5]" />
                              <span>استحقاق معلق</span>
                            </span>
                          );
                        }
                      }

                      return (
                        <div 
                          key={pay.id} 
                          className={`px-2.5 py-1.5 border rounded-lg shadow-2xs transition ${cardThemeClass}`}
                        >
                            <div className="flex flex-col gap-1 w-full">
                              <div className="flex items-center justify-between gap-2 w-full flex-wrap sm:flex-nowrap">
                                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                                  {statusBadge}
                                  <span className="px-1.5 py-0.5 bg-white/80 text-slate-800 text-[9.5px] font-black rounded border border-slate-200/80">
                                    {pay.paymentType || 'اشتراك شهري'}
                                  </span>
                                  <span className="text-xs font-black text-slate-900">
                                    {pay.amount} ج.م
                                  </span>
                                  {(() => {
                                    const isMaster = isMasterDistributionPayment(pay);
                                    const isChild = isChildDistributedPayment(pay);
                                    if (isMaster) {
                                      return (
                                        <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded text-[8px] font-black flex items-center gap-1">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                          <span>تم التوزيع منه</span>
                                        </span>
                                      );
                                    }
                                    if (isChild) {
                                      return (
                                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[8px] font-black flex items-center gap-0.5 shadow-2xs">
                                          <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                                          <span>موزع من تحصيل مجمع</span>
                                        </span>
                                      );
                                    }
                                    if (isOriginalAggregatedPayment(pay) || Boolean(pay.isAggregatedCollection)) {
                                      return (
                                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[8px] font-black flex items-center gap-0.5">
                                          <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                                          <span>تحصيل مجمع</span>
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                  <span className="text-[9px] text-slate-500 font-semibold">
                                    {pay.date}
                                  </span>
                                  {pay.receiptNumber && (
                                    <span className="text-[8.5px] text-slate-600 font-bold bg-white/90 px-1.5 py-0.5 rounded border border-slate-200/60 font-mono">
                                      #{pay.receiptNumber}
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-col items-end justify-center gap-1 shrink-0">
                                  {/* Row 1: Edit & Delete buttons */}
                                  {!isReadOnly && (
                                    <div className="flex items-center gap-1">
                                      {/* Edit Button for ALL registered payments */}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPaymentModalState({
                                            isOpen: true,
                                            payment: pay,
                                            resident: selectedCell.resident,
                                            month: pay.month || selectedCell.month,
                                          });
                                        }}
                                        className="px-2 py-0.5 text-blue-900 hover:text-blue-950 hover:bg-blue-100/70 rounded-lg transition cursor-pointer flex items-center gap-1 text-[9.5px] font-black border border-blue-200 bg-blue-50/80 shadow-3xs active:scale-95 whitespace-nowrap"
                                        title="تعديل الدفعة والملاحظات"
                                      >
                                        <Edit className="w-3 h-3 text-blue-900 shrink-0" />
                                        <span>تعديل</span>
                                      </button>

                                      {/* Delete Button for ALL registered payments */}
                                      {deleteConfirmId === pay.id ? (
                                        <div className="flex items-center gap-1 bg-red-50 px-1.5 py-0.5 rounded-lg border border-red-200 whitespace-nowrap">
                                          <span className="text-[8.5px] text-red-700 font-extrabold">تأكيد؟</span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const cleanId = String(pay.id);
                                              registerDeletedPaymentIds(cleanId);
                                              setLocalDeletedPaymentIds(prev => new Set(prev).add(cleanId));
                                              if (onDeletePayment) {
                                                onDeletePayment(cleanId);
                                              } else {
                                                onCellClick(selectedCell.resident.id, selectedCell.month, true, cleanId);
                                              }
                                              setSelectedCell(prev => prev ? {
                                                ...prev,
                                                payments: (prev.payments || []).filter(p => String(p.id) !== cleanId)
                                              } : null);
                                              setDeleteConfirmId(null);
                                            }}
                                            className="px-1.5 py-0.5 bg-red-600 text-white font-black text-[8.5px] rounded hover:bg-red-700 transition cursor-pointer"
                                          >
                                            نعم
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setDeleteConfirmId(null)}
                                            className="px-1.5 py-0.5 bg-slate-200 text-slate-700 font-bold text-[8.5px] rounded hover:bg-slate-300 transition cursor-pointer"
                                          >
                                            لا
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActionConfirm({
                                              title: 'تأكيد حذف الدفعة',
                                              message: `هل أنت متأكد من حذف هذه الدفعة نهائياً بقيمة ${pay.amount.toLocaleString()} ج.م للوحدة ${selectedCell?.resident.flatNumber} (${pay.paymentType || 'اشتراك شهري'})؟ لا يمكن التراجع عن هذا الإجراء.`,
                                              confirmLabel: 'تأكيد الحذف نهائياً',
                                              confirmClass: 'bg-rose-600 hover:bg-rose-700 text-white',
                                              onConfirm: () => {
                                                const cleanId = String(pay.id);
                                                registerDeletedPaymentIds(cleanId);
                                                setLocalDeletedPaymentIds(prev => new Set(prev).add(cleanId));
                                                if (onDeletePayment) {
                                                  onDeletePayment(cleanId);
                                                } else {
                                                  onCellClick(selectedCell!.resident.id, selectedCell!.month, true, cleanId);
                                                }
                                                setSelectedCell(prev => prev ? {
                                                  ...prev,
                                                  payments: (prev.payments || []).filter(p => String(p.id) !== cleanId)
                                                } : null);
                                                setActionConfirm(null);
                                              }
                                            });
                                          }}
                                          className="px-2 py-0.5 text-rose-700 hover:text-rose-900 hover:bg-rose-100/70 rounded-lg transition cursor-pointer flex items-center gap-1 text-[9.5px] font-black border border-rose-200 bg-rose-50/80 shadow-3xs active:scale-95 whitespace-nowrap"
                                          title="حذف الدفعة"
                                        >
                                          <Trash2 className="w-3 h-3 text-rose-700 shrink-0" />
                                          <span>حذف</span>
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Row 2: Receipt Image & Edit Distribution buttons */}
                                  {(pay.fileUrl || (!isReadOnly && isMasterDistributionPayment(pay) && isCollected && role !== 'ASSISTANT')) && (
                                    <div className="flex items-center gap-1 justify-end">
                                      {pay.fileUrl && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (onPreviewImage) {
                                              onPreviewImage(pay.fileUrl!);
                                            } else {
                                              window.open(pay.fileUrl, '_blank');
                                            }
                                          }}
                                          className="px-2 py-0.5 text-purple-900 hover:text-purple-950 hover:bg-purple-100 rounded-lg transition cursor-pointer flex items-center gap-1 text-[9.5px] font-black border border-purple-200 bg-purple-50/90 shadow-3xs active:scale-95 whitespace-nowrap"
                                          title="فتح وعرض صورة الإيصال"
                                        >
                                          <ImageIcon className="w-3 h-3 text-purple-700 shrink-0" />
                                          <span>صورة الإيصال</span>
                                        </button>
                                      )}

                                      {!isReadOnly && isMasterDistributionPayment(pay) && isCollected && role !== 'ASSISTANT' && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPaymentModalState({
                                              isOpen: true,
                                              payment: pay,
                                              resident: selectedCell.resident,
                                              month: pay.month || selectedCell.month,
                                            });
                                          }}
                                          className="px-2 py-0.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-[9.5px] font-black shadow-2xs active:scale-95 border bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-400 ring-2 ring-emerald-500/20 whitespace-nowrap"
                                          title="دفعة تحصيل مجمع رئيسية - انقر لتعديل الشهور الموزعة"
                                        >
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-300 animate-pulse shrink-0" />
                                          <Calendar className="w-3 h-3 shrink-0 text-emerald-700" />
                                          <span>تعديل التوزيع</span>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                            </div>

                            {/* Prominently Display Notes in registered payment card */}
                            {pay.notes && pay.notes.trim() && (
                              <div className="w-full mt-1 pt-1 border-t border-slate-200/60 flex items-start gap-1.5 text-[10px] text-slate-700 bg-white/70 px-2 py-1 rounded-md font-medium">
                                <FileText className="w-3.5 h-3.5 text-blue-900 shrink-0 mt-0.5" />
                                <span className="font-black text-slate-500 shrink-0">ملاحظات:</span>
                                <span className="font-semibold text-slate-800 break-words leading-relaxed">
                                  {formatLatestDistributionNotes(pay.notes)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Add Payment Button (replaces bottom quick input form) */}
            {!isReadOnly && role !== 'ASSISTANT' && (
              <div className="p-2.5 sm:p-3 bg-slate-50 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentModalState({
                      isOpen: true,
                      payment: null,
                      resident: selectedCell.resident,
                      month: selectedCell.month,
                    });
                  }}
                  className="w-full py-2.5 px-3 bg-blue-900 hover:bg-blue-950 active:scale-98 text-white rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>إضافة تحصيل</span>
                </button>
              </div>
            )}

            {/* Footer */}
            <div className="px-3.5 py-1.5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end shrink-0">
              <button 
                onClick={() => setSelectedCell(null)} 
                className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      );
    })()}

      {/* Global Confirmation Dialog for Registration / Edit / Deletion */}
      {actionConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 sm:p-5 text-right space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-black text-slate-900">{actionConfirm.title}</h4>
            </div>
            <p className="text-xs font-bold text-slate-700 leading-relaxed">
              {actionConfirm.message}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActionConfirm(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={actionConfirm.onConfirm}
                className={`px-4 py-1.5 rounded-xl text-xs font-black transition cursor-pointer shadow-sm active:scale-95 ${actionConfirm.confirmClass}`}
              >
                {actionConfirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unit History Modal */}
      <UnitHistoryModal
        isOpen={historyModalResident !== null}
        resident={historyModalResident}
        activityTypes={config?.activityTypes || ['سكني', 'تجاري', 'إداري', 'عيادة', 'تحت التشطيب', 'مغلقة', 'بدون تحصيل']}
        config={config}
        onClose={() => setHistoryModalResident(null)}
        onUpdateResident={(updatedResident) => {
          setHistoryModalResident(updatedResident);
          setSelectedCell(prev => prev && prev.resident.id === updatedResident.id ? { ...prev, resident: updatedResident } : prev);
          if (onEditResident) {
            onEditResident(updatedResident);
          }
        }}
      />

      {/* Payment Form Modal (Add / Edit / Multi-month distribution dialog) */}
      <PaymentFormModal
        isOpen={paymentModalState.isOpen}
        onClose={() => setPaymentModalState({ isOpen: false, payment: null })}
        initialPayment={paymentModalState.payment}
        initialResident={paymentModalState.resident || (selectedCell ? selectedCell.resident : null)}
        initialMonth={paymentModalState.month || (selectedCell ? selectedCell.month : undefined)}
        residents={residents}
        payments={payments}
        paymentTypes={availablePaymentTypes}
        role={role}
        currentYear={currentYear}
        floorConfigs={effectiveFloorConfigs}
        config={config}
        defaultMonthlyFee={defaultMonthlyFee}
        activityDefaultFees={activityDefaultFees}
        onAdd={(payment, base64Image) => {
          if (onAddPayment) {
            onAddPayment(payment, base64Image);
          }
          if (selectedCell && payment.residentId === selectedCell.resident.id && payment.month === selectedCell.month) {
            setSelectedCell(prev => prev ? {
              ...prev,
              payments: [...(prev.payments || []).filter(p => String(p.id) !== String(payment.id)), payment],
            } : null);
          }
        }}
        onEdit={(payment, base64Image) => {
          if (onEditPayment) {
            onEditPayment(payment, base64Image);
          }
          if (selectedCell) {
            setSelectedCell(prev => prev ? {
              ...prev,
              payments: (prev.payments || []).map(p => String(p.id) === String(payment.id) ? payment : p),
            } : null);
          }
        }}
        onDistributePayment={(originalPaymentId, distributedPayments, deletedPaymentIds) => {
          if (deletedPaymentIds && deletedPaymentIds.length > 0) {
            deletedPaymentIds.forEach(id => {
              const cleanId = String(id);
              registerDeletedPaymentIds(cleanId);
              setLocalDeletedPaymentIds(prev => new Set(prev).add(cleanId));
            });
          }
          if (onDistributePayment) {
            onDistributePayment(originalPaymentId, distributedPayments, deletedPaymentIds);
          }
          if (selectedCell) {
            const deletedSet = new Set((deletedPaymentIds || []).map(String));
            deletedSet.add(String(originalPaymentId));
            setSelectedCell(prev => {
              if (!prev) return null;
              const kept = (prev.payments || []).filter(p => !deletedSet.has(String(p.id)));
              const added = distributedPayments.filter(p => p.residentId === prev.resident.id && p.month === prev.month && p.year === currentYear);
              return {
                ...prev,
                payments: [...kept, ...added],
              };
            });
          }
        }}
        onEditResident={onEditResident}
        onPreviewImage={onPreviewImage}
      />
    </div>
  );
};

export const Summaries = React.memo(SummariesComponent);
