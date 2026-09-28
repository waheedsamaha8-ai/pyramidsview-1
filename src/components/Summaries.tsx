import React, { useMemo, useState, useRef } from 'react';
import { Resident, Payment, Expense, UserRole, FloorConfig, AppConfig } from '../types';
import { Calendar, Check, AlertCircle, RefreshCw, X, ExternalLink, Trash2, PlusCircle, CreditCard, Clock, Layers, Receipt, Edit, Save, Minus, Sparkles, RotateCcw } from 'lucide-react';
import { BuildingMap } from './BuildingMap';
import { deriveFloorConfigsFromResidents, getUnitNumbersForFloor, compareFlatNumbers, isSameFlatNumber, getHistoricalOccupantForDate } from '../utils/buildingStructure';

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
  activityDefaultFees?: Record<string, number>;
  defaultMonthlyFee?: number;
  paymentTypes?: string[];
  config?: AppConfig;
  currentMonth?: number;
  setCurrentMonth?: React.Dispatch<React.SetStateAction<number>>;
}

export const Summaries: React.FC<SummariesProps> = ({
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
  activityDefaultFees,
  defaultMonthlyFee,
  paymentTypes,
  config,
  currentMonth,
  setCurrentMonth,
}) => {
  const [selectedCell, setSelectedCell] = useState<{
    resident: Resident;
    month: string;
    monthName: string;
    payments: Payment[];
  } | null>(null);

  const [newAmount, setNewAmount] = useState<string>('200');
  const [newPaymentType, setNewPaymentType] = useState<string>('اشتراك شهري');
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editPaymentType, setEditPaymentType] = useState<string>('');
  const [editPaymentStatus, setEditPaymentStatus] = useState<string>('collected');
  const [editReceiptNumber, setEditReceiptNumber] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  // States for aggregated payment distribution across months
  const [isDistributing, setIsDistributing] = useState<boolean>(false);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [editNotes, setEditNotes] = useState<string>('');

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

  const getDefaultFeeForResident = (resident: Resident) => {
    let fee = defaultMonthlyFee || 400;
    if (resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee > 0) {
      fee = resident.monthlyFee;
    } else if (activityDefaultFees && activityDefaultFees[resident.activityType] !== undefined) {
      fee = activityDefaultFees[resident.activityType];
    } else {
      switch (resident.activityType) {
        case 'سكني': fee = 400; break;
        case 'سكني مغلق': fee = 200; break;
        case 'مفروش': fee = 600; break;
        case 'إداري': fee = 800; break;
        case 'تجاري': fee = 500; break;
        default: fee = defaultMonthlyFee || 400;
      }
    }
    return fee;
  };

  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const monthNamesArabic = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

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
  }, [payments, expenses, currentYear, months]);

  const grandPaymentsTotal = monthlyData.reduce((sum, d) => sum + d.payments, 0);
  const grandExpensesTotal = monthlyData.reduce((sum, d) => sum + d.expenses, 0);
  const grandBalanceTotal = grandPaymentsTotal - grandExpensesTotal;

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
      return {
        category: cat,
        monthAmounts,
        totalYear,
      };
    });
  }, [categoryList, expenses, currentYear, months]);

  const isChildDistributedPayment = (pay: Payment): boolean => {
    if (pay.distributionSourceId && String(pay.distributionSourceId) !== String(pay.id)) return true;
    if (payments.some(p => String(p.id) !== String(pay.id) && p.distributedPaymentIds && p.distributedPaymentIds.map(String).includes(String(pay.id)))) {
      return true;
    }
    return false;
  };

  const isMasterDistributionPayment = (pay: Payment): boolean => {
    if (isChildDistributedPayment(pay)) return false;
    if (pay.isDistributed) return true;
    if (pay.distributedPaymentIds && pay.distributedPaymentIds.length > 0) return true;
    if (payments.some(p => String(p.id) !== String(pay.id) && String(p.distributionSourceId || '') === String(pay.id))) return true;
    return false;
  };

  const isOriginalAggregatedPayment = (pay: Payment): boolean => {
    if (isChildDistributedPayment(pay)) return false;
    return Boolean(pay.isAggregatedCollection || isMasterDistributionPayment(pay));
  };

  const findMasterPayment = (pay: Payment): Payment => {
    if (pay.distributionSourceId) {
      const found = payments.find(p => String(p.id) === String(pay.distributionSourceId));
      if (found) return found;
    }
    const foundByChildId = payments.find(p => p.distributedPaymentIds && p.distributedPaymentIds.map(String).includes(String(pay.id)));
    if (foundByChildId) return foundByChildId;
    return pay;
  };

  // 4. Map and aggregate all payments for grid display in that month
  const getSubscriptionStatus = (residentId: string, month: string) => {
    const matchingPayments = payments.filter(
      (p) =>
        p.residentId === residentId &&
        p.month === month &&
        p.year === currentYear
    );

    const validCollectedPayments = matchingPayments.filter(
      (p) => p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل'
    );

    const pendingPayments = matchingPayments.filter(
      (p) => p.status === 'pending' || p.status === 'لم يتم التحصيل'
    );

    const totalAmount = validCollectedPayments.reduce((sum, p) => sum + p.amount, 0);
    const isPaid = totalAmount > 0 || validCollectedPayments.some(p => p.isManuallyPaid);
    const isPending = !isPaid && pendingPayments.length > 0;
    const pendingAmount = pendingPayments.reduce((sum, p) => sum + p.amount, 0);

    const isAggregated = validCollectedPayments.some(p => isOriginalAggregatedPayment(p));
    const isDistributed = validCollectedPayments.some(p => isMasterDistributionPayment(p));

    return {
      paid: isPaid,
      pending: isPending,
      pendingAmount: pendingAmount,
      amount: totalAmount,
      paymentsList: matchingPayments,
      isAggregated,
      isDistributed,
    };
  };

  const handleStartEdit = (pay: Payment, forceDistribute = false) => {
    setEditingPaymentId(pay.id);
    setEditPaymentType(pay.paymentType || 'اشتراك شهري');
    setEditPaymentStatus(pay.status || 'collected');
    setEditReceiptNumber(pay.receiptNumber || '');
    setEditNotes(pay.notes || '');
    setConfirmCancelId(null);

    const fee = selectedCell ? getDefaultFeeForResident(selectedCell.resident) : 400;
    const currentMonthNum = parseInt(pay.month, 10) || 1;
    const normalizedMonth = String(currentMonthNum).padStart(2, '0');

    const isDist = isMasterDistributionPayment(pay);
    const masterPay = findMasterPayment(pay);

    if (isDist) {
      // Find all distributed child payments from this source
      const masterId = String(masterPay.id);
      const childPayments = payments.filter(p => 
        String(p.id) !== masterId && (
          String(p.distributionSourceId || '') === masterId ||
          (masterPay.distributedPaymentIds && masterPay.distributedPaymentIds.map(String).includes(String(p.id)))
        )
      );
      const totalAmount = masterPay.originalAmountBeforeDistribution || (masterPay.amount + childPayments.reduce((s, c) => s + (Number(c.amount) || 0), 0));
      setEditAmount(String(totalAmount));

      const allDistributedMonths = Array.from(new Set([masterPay.month, ...childPayments.map(c => c.month)]))
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      setSelectedMonths(allDistributedMonths.length > 0 ? allDistributedMonths : [normalizedMonth]);
      setIsDistributing(true);
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

    // Find ALL child payments belonging to this master payment
    const relatedChildPayments = payments.filter((p) => {
      if (String(p.id) === masterId) return false;
      if (String(p.distributionSourceId || '') === masterId) return true;
      if (
        masterPay.distributedPaymentIds &&
        masterPay.distributedPaymentIds.map(String).includes(String(p.id))
      ) {
        return true;
      }
      // Also match if same resident, same year, same receipt number and notes mentions distribution
      const sameResident = p.residentId === masterPay.residentId;
      const sameYear = Number(p.year) === Number(masterPay.year);
      const sameReceipt = Boolean(
        masterPay.receiptNumber &&
          p.receiptNumber &&
          masterPay.receiptNumber.trim() === p.receiptNumber.trim()
      );
      const hasDistributedNote = Boolean(
        (p.notes && p.notes.includes('سداد مجمع')) ||
          (masterPay.notes && masterPay.notes.includes('سداد مجمع'))
      );
      if (sameResident && sameYear && sameReceipt && hasDistributedNote) return true;
      return false;
    });

    const childIdsToDelete = relatedChildPayments.map((c) => String(c.id));
    const childrenTotal = relatedChildPayments.reduce(
      (sum, c) => sum + (Number(c.amount) || 0),
      0
    );

    const restoredAmount =
      masterPay.originalAmountBeforeDistribution &&
      masterPay.originalAmountBeforeDistribution > masterPay.amount
        ? masterPay.originalAmountBeforeDistribution
        : (Number(masterPay.amount) || 0) + childrenTotal;

    const cleanNotes = (masterPay.notes || '')
      .replace(/\(سداد مجمع موزع على \d+ شهور.*?\)/g, '')
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
      if (m === currentPayMonth) return true;
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

    if (isDistributing && selectedMonths.length > 1) {
      const count = selectedMonths.length;
      const basePerMonth = Math.floor(parsedAmount / count);
      const remainder = parsedAmount - basePerMonth * count;

      const sortedMonths = [...selectedMonths].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      const masterMonth = sortedMonths.includes(pay.month) ? pay.month : sortedMonths[0];

      const childIds: string[] = [];
      const distributedPayments: Payment[] = sortedMonths.map((m, idx) => {
        const isMaster = (m === masterMonth);
        const hist = selectedCell ? getHistoricalOccupantForDate(selectedCell.resident, `${currentYear}-${m}`) : null;
        const occupant = hist?.occupantName || selectedCell?.resident.name || pay.residentName;

        const useOriginalId = isMaster;
        const newId = useOriginalId ? pay.id : `pay_${Date.now()}_${m}_${idx}_${Math.random().toString(36).substr(2, 4)}`;
        if (!isMaster) {
          childIds.push(newId);
        }

        const isRemainderMonth = (idx === 0);
        const monthAmount = isRemainderMonth ? (basePerMonth + remainder) : basePerMonth;

        return {
          id: newId,
          year: currentYear,
          month: m,
          residentId: pay.residentId,
          residentName: occupant,
          flatNumber: pay.flatNumber,
          paymentType: editPaymentType || pay.paymentType || 'اشتراك شهري',
          amount: monthAmount,
          receiptNumber: (editReceiptNumber || pay.receiptNumber || '').trim(),
          notes: (editNotes || '').trim()
            ? `${editNotes} (سداد مجمع موزع على ${count} شهور)`
            : `سداد مجمع موزع على شهور: ${sortedMonths.map((x) => monthNamesArabic[parseInt(x, 10) - 1]).join('، ')}`,
          fileId: pay.fileId || '',
          fileUrl: pay.fileUrl || '',
          date: pay.date || new Date().toISOString().split('T')[0],
          isManuallyPaid: false,
          status: (editPaymentStatus as any) || 'collected',
          isAggregatedCollection: isMaster,
          isDistributed: isMaster,
          distributedPaymentIds: isMaster ? childIds : undefined,
          distributionSourceId: isMaster ? undefined : pay.id,
          originalAmountBeforeDistribution: isMaster ? parsedAmount : undefined,
        };
      });

      if (onDistributePayment) {
        onDistributePayment(pay.id, distributedPayments);
      } else {
        if (onEditPayment) onEditPayment(distributedPayments[0]);
        if (onAddPayment) {
          for (let i = 1; i < distributedPayments.length; i++) {
            onAddPayment(distributedPayments[i]);
          }
        }
      }

      // Update the currently viewed modal cell with any payments remaining in it
      const thisMonthPayments = distributedPayments.filter((p) => p.month === selectedCell?.month);
      setSelectedCell((prev) =>
        prev
          ? {
              ...prev,
              payments: [
                ...prev.payments.filter((p) => p.id !== pay.id && p.distributionSourceId !== pay.id),
                ...thisMonthPayments,
              ],
            }
          : null
      );

      setEditingPaymentId(null);
      setIsDistributing(false);
    } else {
      const updatedPayment: Payment = {
        ...pay,
        amount: parsedAmount,
        paymentType: editPaymentType,
        status: (editPaymentStatus as any) || 'collected',
        receiptNumber: (editReceiptNumber || '').trim(),
        notes: (editNotes || '').trim(),
      };

      if (onEditPayment) {
        onEditPayment(updatedPayment);
      }
      setSelectedCell((prev) =>
        prev
          ? {
              ...prev,
              payments: prev.payments.map((p) => (p.id === pay.id ? updatedPayment : p)),
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
          <table className="w-full text-center border-collapse table-fixed min-w-[690px] sm:min-w-[1060px]">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 font-extrabold text-[10px] sm:text-xs border-b border-slate-100">
                <th className="w-[58px] min-w-[58px] sm:w-28 sm:min-w-28 px-0.5 sm:px-2 py-2 sm:py-2.5 sticky right-0 bg-white shadow-xs z-10 border-l border-slate-100 text-center sm:text-right">
                  <span className="block sm:hidden text-[10px]">البيان</span>
                  <span className="hidden sm:block">البيان / البند</span>
                </th>
                {monthNamesArabic.map((name, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <th 
                      key={idx} 
                      className={`w-[48px] min-w-[48px] sm:w-20 sm:min-w-20 px-0.5 py-2 sm:py-2.5 ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200 font-extrabold text-slate-800' : ''
                      }`}
                    >
                      {name}
                    </th>
                  );
                })}
                <th className="w-[56px] min-w-[56px] sm:w-24 sm:min-w-24 px-0.5 py-2 sm:py-2.5 bg-slate-100/60 border-r border-slate-100 text-slate-800 font-black">
                  المجموع
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs font-bold text-slate-800">
              {/* Row 1: Total Collections */}
              <tr className="hover:bg-slate-50/20 transition">
                <td className="px-0.5 sm:px-2 py-1.5 sm:py-2 sticky right-0 bg-white shadow-xs z-10 text-center sm:text-right border-l border-slate-100 font-black text-emerald-800">
                  <span className="text-[10px] sm:text-[12.5px] block">التحصيل</span>
                </td>
                {monthlyData.map((d, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <td 
                      key={d.month} 
                      className={`px-0.5 py-1.5 sm:py-2 border-x border-slate-50 text-emerald-700 font-black ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200' : ''
                      }`}
                    >
                      <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                        {Math.round(d.payments).toLocaleString()}
                      </span>
                      <span className="text-[7px] sm:text-[9px] text-emerald-600/80 font-bold block leading-none">ج.م</span>
                    </td>
                  );
                })}
                <td className="px-0.5 sm:px-1 py-1.5 sm:py-2 bg-emerald-50/40 border-r border-slate-100 text-emerald-900 font-black">
                  <span className="text-[10px] sm:text-[12.5px] block leading-tight font-black">
                    {Math.round(grandPaymentsTotal).toLocaleString()}
                  </span>
                  <span className="text-[7px] sm:text-[9px] text-emerald-700 font-bold block leading-none">ج.م</span>
                </td>
              </tr>

              {/* Row 2: Total Expenses */}
              <tr className="hover:bg-slate-50/20 transition">
                <td className="px-0.5 sm:px-2 py-1.5 sm:py-2 sticky right-0 bg-white shadow-xs z-10 text-center sm:text-right border-l border-slate-100 font-black text-red-800">
                  <span className="text-[10px] sm:text-[12.5px] block">المصروفات</span>
                </td>
                {monthlyData.map((d, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <td 
                      key={d.month} 
                      className={`px-0.5 py-1.5 sm:py-2 border-x border-slate-50 text-red-600 font-black ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200' : ''
                      }`}
                    >
                      <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                        {Math.round(d.expenses).toLocaleString()}
                      </span>
                      <span className="text-[7px] sm:text-[9px] text-red-500/80 font-bold block leading-none">ج.م</span>
                    </td>
                  );
                })}
                <td className="px-0.5 sm:px-1 py-1.5 sm:py-2 bg-red-50/40 border-r border-slate-100 text-red-900 font-black">
                  <span className="text-[10px] sm:text-[12.5px] block leading-tight font-black">
                    {Math.round(grandExpensesTotal).toLocaleString()}
                  </span>
                  <span className="text-[7px] sm:text-[9px] text-red-800 font-bold block leading-none">ج.م</span>
                </td>
              </tr>

              {/* Row 3: Net Balance / Cashflow */}
              <tr className="hover:bg-slate-50/30 transition bg-slate-50/40 font-black">
                <td className="px-0.5 sm:px-2 py-1.5 sm:py-2 sticky right-0 bg-slate-50 shadow-xs z-10 text-center sm:text-right border-l border-slate-100 text-blue-950 font-black">
                  <span className="text-[10px] sm:text-[12.5px] block">الرصيد</span>
                </td>
                {monthlyData.map((d, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <td
                      key={d.month}
                      className={`px-0.5 py-1.5 sm:py-2 border-x border-slate-100 font-black ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200' : ''
                      } ${
                        d.balance >= 0 ? 'text-blue-900' : 'text-amber-700'
                      }`}
                    >
                      <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                        {Math.round(d.balance).toLocaleString()}
                      </span>
                      <span className="text-[7px] sm:text-[9px] text-slate-400 font-bold block leading-none">ج.م</span>
                    </td>
                  );
                })}
                <td
                  className={`px-0.5 sm:px-1 py-1.5 sm:py-2 border-r border-slate-100 font-black ${
                    grandBalanceTotal >= 0 ? 'bg-blue-50/60 text-blue-950' : 'bg-amber-50/60 text-amber-900'
                  }`}
                >
                  <span className="text-[10px] sm:text-[12.5px] block leading-tight font-black">
                    {Math.round(grandBalanceTotal).toLocaleString()}
                  </span>
                  <span className="text-[7px] sm:text-[9px] text-slate-500 font-bold block leading-none">ج.م</span>
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
          <table className="w-full text-center border-collapse table-fixed min-w-[690px] sm:min-w-[1060px]">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 font-extrabold text-[10px] sm:text-xs border-b border-slate-100">
                <th className="w-[58px] min-w-[58px] sm:w-28 sm:min-w-28 px-0.5 sm:px-2 py-2 sm:py-2.5 sticky right-0 bg-white shadow-xs z-10 border-l border-slate-100 text-center sm:text-right">
                  <span className="block sm:hidden text-[10px]">البند</span>
                  <span className="hidden sm:block">فئة المصروف</span>
                </th>
                {monthNamesArabic.map((name, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <th 
                      key={idx} 
                      className={`w-[48px] min-w-[48px] sm:w-20 sm:min-w-20 px-0.5 py-2 sm:py-2.5 ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200 font-extrabold text-slate-800' : ''
                      }`}
                    >
                      {name}
                    </th>
                  );
                })}
                <th className="w-[56px] min-w-[56px] sm:w-24 sm:min-w-24 px-0.5 py-2 sm:py-2.5 bg-slate-100/60 border-r border-slate-100 text-slate-800 font-black">
                  المجموع
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs font-bold text-slate-800">
              {categoryMonthlyData.map((catData) => (
                <tr key={catData.category} className="hover:bg-slate-50/30 transition">
                  <td className="px-0.5 sm:px-2 py-1.5 sm:py-2 sticky right-0 bg-white shadow-xs z-10 text-center sm:text-right border-l border-slate-100 font-black text-slate-800">
                    <span className="text-[9.5px] sm:text-[12px] block truncate max-w-[54px] sm:max-w-none" title={catData.category}>
                      {catData.category}
                    </span>
                  </td>
                  {catData.monthAmounts.map((amount, idx) => {
                    const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                    return (
                      <td 
                        key={idx} 
                        className={`px-0.5 py-1.5 sm:py-2 border-x border-slate-50 text-center font-bold ${
                          isQuarterEnd ? 'border-l-2 border-l-slate-200' : ''
                        }`}
                      >
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
                    );
                  })}
                  <td className="px-0.5 sm:px-1 py-1.5 sm:py-2 bg-red-50/30 border-r border-slate-100 text-red-900 font-black">
                    <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                      {Math.round(catData.totalYear).toLocaleString()}
                    </span>
                    <span className="text-[6.5px] sm:text-[8.5px] text-red-700 font-bold block leading-none">ج.م</span>
                  </td>
                </tr>
              ))}

              {/* Total Expenses Row */}
              <tr className="bg-slate-100/80 font-black text-[10px] sm:text-xs border-t-2 border-slate-200">
                <td className="px-0.5 sm:px-2 py-2 sm:py-2.5 sticky right-0 bg-slate-100 shadow-xs z-10 text-center sm:text-right border-l border-slate-200 text-slate-900 font-black">
                  <span className="block sm:hidden text-[9.5px]">الإجمالي</span>
                  <span className="hidden sm:block">إجمالي المصروفات</span>
                </td>
                {monthlyData.map((d, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <td 
                      key={d.month} 
                      className={`px-0.5 py-2 sm:py-2.5 border-x border-slate-200/60 text-red-700 font-black ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200' : ''
                      }`}
                    >
                      <span className="text-[9.5px] sm:text-xs block leading-tight font-black">
                        {Math.round(d.expenses).toLocaleString()}
                      </span>
                      <span className="text-[6.5px] sm:text-[8.5px] text-red-500 font-bold block leading-none">ج.م</span>
                    </td>
                  );
                })}
                <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 bg-red-100/60 border-r border-slate-200 text-red-950 font-black">
                  <span className="text-[10px] sm:text-[12.5px] block leading-tight font-black">
                    {Math.round(grandExpensesTotal).toLocaleString()}
                  </span>
                  <span className="text-[6.5px] sm:text-[8.5px] text-red-800 font-bold block leading-none">ج.م</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Interactive Collections Table Grouped by Floor */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 bg-slate-50/70">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-500 font-bold">
            <RefreshCw className="w-3.5 h-3.5 text-blue-900" />
            <span>
              {role === 'ASSISTANT'
                ? '* انقر على أي خانة لعرض التفاصيل وتوليد الإيصالات والإشعارات'
                : '* انقر على أي خانة لعرض تفاصيل وكشف المتحصلات المجمعة لهذا الشهر'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-900" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">جدول كشف التحصيل الشهري للاشتراكات لعام {currentYear}</h3>
          </div>
        </div>

        {/* Status Legend Bar - Compact to stay strictly within screen boundaries */}
        <div className="px-1 sm:px-3 py-1 bg-slate-100/80 border-b border-slate-200 overflow-x-auto scrollbar-none flex items-center justify-between sm:justify-start gap-1 sm:gap-2 text-[7.5px] min-[360px]:text-[8px] min-[400px]:text-[9px] sm:text-[10.5px] font-black whitespace-nowrap">
          <span className="text-slate-500 font-bold shrink-0 hidden md:inline ml-1">دليل الألوان:</span>
          <div className="flex items-center justify-between sm:justify-start gap-0.5 sm:gap-1.5 w-full sm:w-auto">
            <span className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs shrink-0">
              <Check className="w-2 h-2 sm:w-2.5 sm:h-2.5 stroke-[3.5]" /> مسدد (أخضر)
            </span>
            <span className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs shrink-0">
              <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5 stroke-[2.5]" /> لم يحصل (برتقالي)
            </span>
            <span className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-300 shadow-2xs shrink-0">
              <Minus className="w-2 h-2 sm:w-2.5 sm:h-2.5 stroke-[3]" /> غير مطالبة (رمادي)
            </span>
            <span className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300 shadow-2xs shrink-0">
              <AlertCircle className="w-2 h-2 sm:w-2.5 sm:h-2.5 stroke-[2.5]" /> غير مسدد (أحمر)
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
          <table className="w-full text-center border-collapse table-fixed min-w-[690px] sm:min-w-[1060px]">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 font-extrabold text-[10px] sm:text-xs border-b border-slate-100">
                <th className="w-[58px] min-w-[58px] sm:w-28 sm:min-w-28 px-0.5 sm:px-2 py-2 sm:py-2.5 sticky right-0 bg-white shadow-xs z-10 border-l border-slate-100 text-center sm:text-right">
                  <span className="block sm:hidden text-[10px]">الوحدة</span>
                  <span className="hidden sm:block">الوحدة / الساكن</span>
                </th>
                {monthNamesArabic.map((name, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <th 
                      key={idx} 
                      className={`w-[48px] min-w-[48px] sm:w-20 sm:min-w-20 px-0.5 py-2 sm:py-2.5 ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200 font-extrabold text-slate-800' : ''
                      }`}
                    >
                      {name}
                    </th>
                  );
                })}
                <th className="w-[56px] min-w-[56px] sm:w-24 sm:min-w-24 px-0.5 py-2 sm:py-2.5 bg-slate-100/60 border-r border-slate-100 text-slate-800 font-black">
                  المجموع
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs font-bold text-slate-800">
              {floorResidentGroups.map((group) => (
                <React.Fragment key={group.floor.id}>
                  {/* Floor Divider / Separator Header */}
                  <tr className="bg-slate-100/90 border-y-2 border-slate-200/80">
                    <td colSpan={14} className="py-1.5 sm:py-2 px-2 sm:px-3 text-right sticky right-0 bg-slate-100/95 z-5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 sm:gap-2">
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
                  {group.residents.map((res) => {
                    const historical = getHistoricalOccupantForDate(res, `${currentYear}`);
                    const occupantName = historical.tenantName || historical.ownerName || res.name;
                    const residentYearTotal = payments
                      .filter((p) => p.residentId === res.id && p.year === currentYear && p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل')
                      .reduce((s, p) => s + p.amount, 0);

                    return (
                      <tr key={res.id} className="hover:bg-slate-50/30 transition">
                        <td className="px-0.5 sm:px-2 py-1.5 sm:py-2 sticky right-0 bg-white shadow-xs z-10 text-center sm:text-right border-l border-slate-100">
                          <div className="flex flex-col leading-tight items-center sm:items-start justify-center">
                            <span className="font-black text-blue-900 text-[10px] sm:text-xs">وحدة {res.flatNumber}</span>
                            <span className="text-slate-500 truncate max-w-[54px] sm:max-w-[95px] text-[8.5px] sm:text-[10.5px]" title={occupantName}>
                              {occupantName.split(' ')[0]}
                            </span>
                          </div>
                        </td>
                        {months.map((m, idx) => {
                          const status = getSubscriptionStatus(res.id, m);
                          const isMulti = status.paymentsList.length > 1;
                          const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                          const isNoFeeActivity = Boolean(
                            res.activityType === 'بدون تحصيل' ||
                            res.activityType === 'بدون تشطيب' ||
                            res.activityType?.includes('بدون تحصيل') ||
                            res.activityType?.includes('بدون تشطيب') ||
                            (res.monthlyFee === 0)
                          );

                          let cellBgClass = 'bg-red-100/90 text-red-950 hover:bg-red-200 border-red-200/70';
                          if (status.paid) {
                            cellBgClass = 'bg-emerald-100/90 text-emerald-950 hover:bg-emerald-200 border-emerald-200/70';
                          } else if (status.pending) {
                            cellBgClass = 'bg-amber-100/95 text-amber-950 hover:bg-amber-200 border-amber-300';
                          } else if (isNoFeeActivity) {
                            cellBgClass = 'bg-slate-200/90 text-slate-800 hover:bg-slate-300 border-slate-300';
                          }

                          return (
                            <td
                              key={m}
                              onClick={() => {
                                const monthName = monthNamesArabic[idx];
                                const defaultAmt = getDefaultFeeForResident(res);
                                setNewAmount(String(defaultAmt));
                                setNewPaymentType(isNoFeeActivity ? 'تحصيلات اخرى' : 'اشتراك شهري');
                                setEditingPaymentId(null);
                                setDeleteConfirmId(null);
                                setSelectedCell({
                                  resident: res,
                                  month: m,
                                  monthName: monthName,
                                  payments: status.paymentsList,
                                });
                              }}
                              className={`px-0.5 py-1 text-center border-x border-slate-50 ${
                                isQuarterEnd ? 'border-l-2 border-l-slate-300' : ''
                              } cursor-pointer ${cellBgClass} transition font-bold`}
                            >
                              <div className="flex flex-col items-center justify-center gap-0.5 min-h-[30px] sm:min-h-[32px]">
                                {status.paid ? (
                                  <>
                                    <div className="flex items-center gap-0.5">
                                      <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-700 stroke-[3.5]" />
                                      {status.isDistributed && (
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-300 animate-pulse" title="تم التوزيع من هذه الدفعة" />
                                      )}
                                      {!status.isDistributed && status.isAggregated && (
                                        <span className="text-[7px] sm:text-[7.5px] font-black px-1 py-0.2 bg-amber-200 text-amber-950 rounded-xs" title="تحصيل مجمع">
                                          مجمع ⚡
                                        </span>
                                      )}
                                      {isMulti && (
                                        <span className="text-[7.5px] sm:text-[9px] font-black px-0.5 py-0.2 bg-blue-200 text-blue-900 rounded-xs">
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
                                    <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-700 stroke-[2.5]" />
                                    <span className="text-[8.5px] sm:text-[10px] font-black text-amber-950 whitespace-nowrap leading-none">لم يحصل</span>
                                    {status.pendingAmount > 0 && (
                                      <span className="text-[9px] sm:text-[11px] font-black text-amber-950 leading-none">
                                        {Math.round(status.pendingAmount).toLocaleString()}
                                      </span>
                                    )}
                                  </>
                                ) : isNoFeeActivity ? (
                                  <>
                                    <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-600 stroke-[3]" />
                                    <span className="text-[9px] sm:text-[11px] font-black text-slate-800 whitespace-nowrap leading-none">
                                      معفي
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-600 stroke-[2.5]" />
                                    <span className="text-[9px] sm:text-[11px] font-black text-red-700 leading-none whitespace-nowrap">
                                      غير مسدد
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-0.5 sm:px-1 py-1.5 sm:py-2 bg-slate-50/70 border-r border-slate-100 text-center font-black">
                          <span className="text-[10px] sm:text-xs text-blue-950 block leading-tight font-black">
                            {Math.round(residentYearTotal).toLocaleString()}
                          </span>
                          <span className="text-[7.5px] sm:text-[9.5px] text-slate-400 font-bold block leading-none">ج.م</span>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Aggregated Collections Details Overlay Modal */}
      {selectedCell && (() => {
        const activeCellPayments = payments.filter(
          (p) =>
            p.residentId === selectedCell.resident.id &&
            p.month === selectedCell.month &&
            p.year === currentYear
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto" dir="rtl">
            <div className="w-full max-w-lg bg-white rounded-xl sm:rounded-2xl border border-slate-100 shadow-xl animate-scale-up text-right flex flex-col max-h-[88vh] overflow-hidden my-auto">
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
                <div className="bg-blue-50/50 px-3 py-1.5 rounded-lg border border-blue-100/60 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 font-bold">الساكن:</span>
                    <span className="text-xs font-black text-slate-800">{selectedCell.resident.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 font-bold">الإجمالي:</span>
                    <span className="text-xs font-black text-emerald-600 bg-emerald-50/80 px-2 py-0.5 rounded">
                      {activeCellPayments.reduce((sum, p) => sum + p.amount, 0)} ج.م
                    </span>
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
                        <div className="space-y-1.5 max-h-[36vh] overflow-y-auto pr-0.5">
                          {activeCellPayments.map((pay) => {
                            const isEditing = editingPaymentId === pay.id;
                      const isCancelled = pay.status === 'cancelled' || pay.status === 'لاغي';
                      const isPending = !isCancelled && (pay.status === 'pending' || pay.status === 'لم يتم التحصيل');
                      const isCollected = !isCancelled && !isPending;

                      let cardThemeClass = 'bg-emerald-50/70 border-emerald-300 hover:bg-emerald-100/60 text-emerald-950';
                      let statusBadge = (
                        <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 text-[9px] font-black rounded flex items-center gap-0.5 shadow-2xs">
                          <Check className="w-2.5 h-2.5 stroke-[3.5]" />
                          <span>مسدد</span>
                        </span>
                      );

                      if (isCancelled) {
                        cardThemeClass = 'bg-rose-50/70 border-rose-300 hover:bg-rose-100/60 text-rose-950 opacity-80';
                        statusBadge = (
                          <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 text-[9px] font-black rounded flex items-center gap-0.5 shadow-2xs">
                            <X className="w-2.5 h-2.5 stroke-[3]" />
                            <span>لاغي</span>
                          </span>
                        );
                      } else if (isPending) {
                        cardThemeClass = 'bg-amber-50/80 border-amber-300 hover:bg-amber-100/70 text-amber-950';
                        statusBadge = (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black rounded flex items-center gap-0.5 shadow-2xs">
                            <Clock className="w-2.5 h-2.5 stroke-[2.5]" />
                            <span>لم يحصل</span>
                          </span>
                        );
                      }

                      return (
                        <div 
                          key={pay.id} 
                          className={`px-2.5 py-1.5 border rounded-lg shadow-2xs transition ${cardThemeClass}`}
                        >
                          {isEditing ? (
                            /* Inline Edit & Distribution Form */
                            <div className="space-y-2.5 w-full text-right bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-sm" dir="rtl">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                <h5 className="text-[11px] font-black text-blue-950 flex items-center gap-1.5">
                                  <Edit className="w-3.5 h-3.5 text-blue-900" />
                                  <span>تعديل بيانات الدفعة:</span>
                                </h5>
                                <span className="text-[9.5px] font-bold text-slate-500">
                                  شهر {pay.month} ({monthNamesArabic[parseInt(pay.month, 10) - 1]})
                                </span>
                              </div>

                              {/* Basic Inputs */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="space-y-0.5">
                                  <label className="text-[9px] font-black text-slate-600 block">المبلغ الإجمالي (ج.م) *</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={editAmount}
                                    onChange={(e) => setEditAmount(e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-right font-black focus:border-blue-500 outline-none"
                                  />
                                </div>
                                <div className="space-y-0.5">
                                  <label className="text-[9px] font-bold text-slate-600 block">نوع الدفعة</label>
                                  <select
                                    value={editPaymentType}
                                    onChange={(e) => setEditPaymentType(e.target.value)}
                                    className="w-full px-1.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-right font-bold focus:border-blue-500 outline-none cursor-pointer"
                                  >
                                    {(paymentTypes && paymentTypes.length > 0 ? paymentTypes : ['اشتراك شهري', 'صيانة طارئة', 'تحصيلات اخرى']).map(type => (
                                      <option key={type} value={type}>{type}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-0.5">
                                  <label className="text-[9px] font-bold text-slate-600 block">حالة الدفعة</label>
                                  <select
                                    value={editPaymentStatus}
                                    onChange={(e) => setEditPaymentStatus(e.target.value)}
                                    className="w-full px-1.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-right font-bold focus:border-blue-500 outline-none cursor-pointer"
                                  >
                                    <option value="collected">مسدد</option>
                                    <option value="pending">لم يحصل</option>
                                    <option value="cancelled">لاغي</option>
                                  </select>
                                </div>
                                <div className="space-y-0.5">
                                  <label className="text-[9px] font-bold text-slate-600 block">رقم الإيصال</label>
                                  <input
                                    type="text"
                                    placeholder="اختياري"
                                    value={editReceiptNumber}
                                    onChange={(e) => setEditReceiptNumber(e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-right font-bold focus:border-blue-500 outline-none font-mono"
                                  />
                                </div>
                              </div>

                              {/* Multi-Month Aggregated Distribution Section */}
                              {(() => {
                                const fee = selectedCell ? getDefaultFeeForResident(selectedCell.resident) : 400;
                                const parsedAmt = parseFloat(editAmount) || pay.amount;
                                const coveredCount = fee > 0 ? Math.max(1, Math.round(parsedAmt / fee)) : 1;

                                const count = selectedMonths.length || 1;
                                const basePerMonth = Math.floor(parsedAmt / count);
                                const remainder = parsedAmt - (basePerMonth * count);
                                const sortedSelected = [...selectedMonths].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

                                return (
                                  <div className="space-y-2 pt-1 border-t border-slate-100">
                                    {/* Toggle Distribution Button */}
                                    <button
                                      type="button"
                                      onClick={() => setIsDistributing(!isDistributing)}
                                      className={`w-full py-1.5 px-3 rounded-xl font-black text-xs flex items-center justify-between border transition shadow-xs cursor-pointer ${
                                        isDistributing
                                          ? 'bg-blue-900 text-white border-blue-900 shadow-blue-900/10'
                                          : 'bg-blue-50/80 text-blue-900 border-blue-200 hover:bg-blue-100/70'
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                                        <span>توزيع هذا المبلغ المجمع على شهور السنة ({currentYear})</span>
                                      </span>
                                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                        isDistributing ? 'bg-white text-blue-900' : 'bg-blue-200 text-blue-950'
                                      }`}>
                                        {isDistributing ? `مفعل (${selectedMonths.length} شهور)` : 'انقر لتوزيع المبلغ ⚡'}
                                      </span>
                                    </button>

                                    {/* Interactive Month Selection Grid */}
                                    {isDistributing && (
                                      <div className="p-3 bg-gradient-to-b from-blue-50/90 to-slate-50 border border-blue-200/80 rounded-xl space-y-2.5">
                                        {/* Status & Advice Header */}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-2.5 rounded-lg border border-blue-100 shadow-2xs">
                                          <div className="space-y-0.5 text-right">
                                            <div className="font-black text-blue-950 text-xs flex items-center gap-1.5">
                                              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                              <span>اشتراك الوحدة: <span className="text-emerald-700">{fee} ج.م/شهر</span></span>
                                              <span className="text-slate-300">|</span>
                                              <span>المبلغ المراد توزيعه: <span className="text-blue-900">{parsedAmt} ج.م</span></span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 font-bold">
                                              هذا المبلغ يغطي <span className="font-black text-blue-900 underline">{coveredCount} شهور</span> بالكامل. اختر الشهور المراد تحويلها إلى مسددة:
                                            </p>
                                          </div>

                                          {/* Quick Selection Buttons */}
                                          <div className="flex items-center gap-1 flex-wrap shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => selectAutoCoveredMonths(pay.month, parsedAmt, fee)}
                                              className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-md text-[9.5px] font-black cursor-pointer transition shadow-2xs"
                                              title={`تحديد ${coveredCount} شهور تلقائياً`}
                                            >
                                              تلقائي ({coveredCount} شهور)
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => selectUnpaidMonths(selectedCell.resident.id, pay.month)}
                                              className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-md text-[9.5px] font-black cursor-pointer transition shadow-2xs"
                                              title="تحديد كل الشهور غير المسددة"
                                            >
                                              الشهور غير المسددة
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setSelectedMonths([...months])}
                                              className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-md text-[9.5px] font-black cursor-pointer transition shadow-2xs"
                                            >
                                              كامل السنة (12)
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setSelectedMonths([pay.month])}
                                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-[9.5px] font-bold cursor-pointer transition"
                                            >
                                              شهر واحد
                                            </button>
                                          </div>
                                        </div>

                                        {/* 12 Months Grid */}
                                        <div className="grid grid-cols-2 min-[400px]:grid-cols-3 sm:grid-cols-4 gap-1.5">
                                          {months.map((m, idx) => {
                                            const isChecked = selectedMonths.includes(m);
                                            const status = getSubscriptionStatus(selectedCell.resident.id, m);
                                            const isCurrentPayMonth = (m === pay.month);
                                            const hasOtherPayment = status.paid && !isCurrentPayMonth;

                                            const isFirstInSorted = (sortedSelected.length > 0 && m === sortedSelected[0]);
                                            const monthAllocated = isFirstInSorted ? (basePerMonth + remainder) : basePerMonth;

                                            return (
                                              <div
                                                key={m}
                                                onClick={() => toggleMonthSelection(m)}
                                                className={`p-2 rounded-lg border text-right transition cursor-pointer select-none flex flex-col justify-between gap-1 shadow-2xs ${
                                                  isChecked
                                                    ? 'bg-emerald-50/95 border-emerald-400 ring-2 ring-emerald-500/20 text-emerald-950'
                                                    : hasOtherPayment
                                                    ? 'bg-slate-50/80 border-slate-200 text-slate-500 opacity-80'
                                                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                                }`}
                                              >
                                                <div className="flex items-center justify-between">
                                                  <span className="text-[11px] font-black truncate">
                                                    {m} - {monthNamesArabic[idx]}
                                                  </span>
                                                  <div className={`w-4 h-4 rounded flex items-center justify-center border transition shrink-0 ${
                                                    isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                                                  }`}>
                                                    {isChecked && <Check className="w-3 h-3 stroke-[3.5]" />}
                                                  </div>
                                                </div>

                                                <div className="flex items-center justify-between text-[9px] pt-1 border-t border-slate-100">
                                                  {isChecked ? (
                                                    <span className="font-black text-emerald-800">
                                                      نصيب: {monthAllocated} ج.م
                                                    </span>
                                                  ) : hasOtherPayment ? (
                                                    <span className="font-bold text-blue-700 bg-blue-50 px-1 rounded text-[8px]">
                                                      مسدد سابقاً ✓
                                                    </span>
                                                  ) : (
                                                    <span className="font-bold text-red-700 bg-red-50 px-1 rounded text-[8px]">
                                                      غير مسدد ⚠️
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>

                                        {/* Summary & Live Preview */}
                                        {selectedMonths.length > 0 && (
                                          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-xs text-emerald-950 space-y-1">
                                            <div className="flex items-center justify-between font-black">
                                              <span>عدد الشهور المختارة: <span className="underline">{selectedMonths.length} شهور</span></span>
                                              <span>نصيب كل شهر: <span className="underline">{basePerMonth} ج.م</span> {remainder > 0 && `(+${remainder} ج.م للشهر الأول)`}</span>
                                            </div>
                                            <p className="text-[10px] text-emerald-800 font-bold leading-relaxed">
                                              ✓ ستتحول الشهور المحددة فوراً إلى <span className="font-black text-emerald-950 underline">مسددة باللون الأخضر</span> في جدول كشف التحصيل وخريطة السداد التفاعلية.
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Edit Action Buttons */}
                              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                                {isMasterDistributionPayment(pay) && (
                                  confirmCancelId === pay.id ? (
                                    <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-300 p-1.5 rounded-lg">
                                      <span className="text-[10px] font-black text-rose-900">تأكيد استعادة كامل المبلغ وإلغاء التوزيع؟</span>
                                      <button
                                        type="button"
                                        onClick={() => handleCancelDistribution(pay)}
                                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded cursor-pointer transition shadow-2xs"
                                      >
                                        تأكيد الإلغاء ↩️
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmCancelId(null)}
                                        className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded cursor-pointer transition"
                                      >
                                        تراجع
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmCancelId(pay.id)}
                                      className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-850 border border-rose-200 rounded-lg text-xs font-black cursor-pointer transition flex items-center gap-1.5 active:scale-95 shadow-2xs"
                                      title="إلغاء توزيع هذا السداد وحذف الدفعات التابعة وإرجاع كامل المبلغ لهذا الشهر"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 text-rose-700" />
                                      <span>إلغاء التوزيع واستعادة المبلغ ↩️</span>
                                    </button>
                                  )
                                )}
                                <div className="flex items-center gap-2 mr-auto">
                                  <button
                                    type="button"
                                    onClick={() => handleSavePayment(pay)}
                                    className="px-3 py-1.5 bg-blue-900 hover:bg-blue-950 active:scale-95 text-white font-black text-xs rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>
                                      {isDistributing && selectedMonths.length > 1
                                        ? `تطبيق وتوزيع المبلغ على (${selectedMonths.length}) شهور (حفظ) 💾`
                                        : 'حفظ التعديل'}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingPaymentId(null);
                                      setIsDistributing(false);
                                      setConfirmCancelId(null);
                                    }}
                                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-lg cursor-pointer transition"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* Regular Compact View */
                            <div className="flex items-center justify-between gap-2 w-full">
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
                                      <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[8px] font-bold">
                                        <span>موزع من سداد مجمع</span>
                                      </span>
                                    );
                                  }
                                  if (isOriginalAggregatedPayment(pay)) {
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

                              <div className="flex items-center gap-1 shrink-0">
                                {pay.fileUrl && (
                                  <a 
                                    href={pay.fileUrl} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="p-1 text-blue-900 hover:bg-blue-50 rounded transition"
                                    title="عرض الإيصال"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}

                                {!isReadOnly && role !== 'ASSISTANT' && (
                                  <>
                                    {/* Dedicated Multi-Month Distribute Button: ONLY for original aggregated collection or master payment */}
                                    {isOriginalAggregatedPayment(pay) && (
                                      <button
                                        type="button"
                                        onClick={() => handleStartEdit(pay, true)}
                                        className={`px-2 py-1 rounded-md transition cursor-pointer flex items-center gap-1.5 text-[9.5px] font-black shadow-2xs active:scale-95 border ${
                                          isMasterDistributionPayment(pay)
                                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-400 ring-2 ring-emerald-500/20'
                                            : 'bg-blue-100 hover:bg-blue-200 text-blue-900 border-blue-200'
                                        }`}
                                        title={
                                          isMasterDistributionPayment(pay)
                                            ? 'تم التوزيع من هذه الدفعة - انقر لتعديل التوزيع'
                                            : 'تحصيل مجمع - انقر لتوزيع المبلغ على شهور السنة'
                                        }
                                      >
                                        {/* Green dot on the original button that distributed the payment */}
                                        {isMasterDistributionPayment(pay) && (
                                          <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-300 animate-pulse shrink-0" />
                                        )}
                                        <Calendar className={`w-3 h-3 shrink-0 ${isMasterDistributionPayment(pay) ? 'text-emerald-700' : 'text-blue-700'}`} />
                                        <span>{isMasterDistributionPayment(pay) ? 'توزيع مجمع (موزع)' : 'توزيع مجمع'}</span>
                                      </button>
                                    )}

                                    {/* Dedicated Direct Cancel Distribution Button: ONLY on original master payment with green dot */}
                                    {isMasterDistributionPayment(pay) && (
                                      confirmCancelId === pay.id ? (
                                        <div className="flex items-center gap-1 bg-rose-50 border border-rose-300 px-1.5 py-0.5 rounded-lg animate-in fade-in">
                                          <span className="text-[9px] font-black text-rose-900">تأكيد؟</span>
                                          <button
                                            type="button"
                                            onClick={() => handleCancelDistribution(pay)}
                                            className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[9px] font-black cursor-pointer transition shadow-2xs"
                                          >
                                            نعم، استعادة ↩️
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmCancelId(null)}
                                            className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[9px] font-bold cursor-pointer transition"
                                          >
                                            تراجع
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmCancelId(pay.id)}
                                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-md transition cursor-pointer flex items-center gap-1 text-[9.5px] font-black shadow-2xs active:scale-95"
                                          title="إلغاء توزيع هذا السداد واستعادة المبلغ بالكامل في هذا الشهر الأصلي"
                                        >
                                          <RotateCcw className="w-3 h-3 text-rose-700 shrink-0" />
                                          <span>إلغاء التوزيع ↩️</span>
                                        </button>
                                      )
                                    )}

                                    {/* Edit Button */}
                                    <button
                                      onClick={() => handleStartEdit(pay, false)}
                                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-white/80 rounded transition cursor-pointer"
                                      title="تعديل"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>

                                    {deleteConfirmId === pay.id ? (
                                      <div className="flex items-center gap-1 bg-red-50 px-1 py-0.5 rounded border border-red-100">
                                        <span className="text-[8px] text-red-700 font-extrabold">تأكيد؟</span>
                                        <button
                                          onClick={() => {
                                            if (onDeletePayment) {
                                              onDeletePayment(pay.id);
                                            } else {
                                              onCellClick(selectedCell.resident.id, selectedCell.month, true, pay.id);
                                            }
                                            setSelectedCell(prev => prev ? {
                                              ...prev,
                                              payments: prev.payments.filter(p => p.id !== pay.id)
                                            } : null);
                                            setDeleteConfirmId(null);
                                          }}
                                          className="px-1 py-0.5 bg-red-600 text-white font-bold text-[7.5px] rounded hover:bg-red-700 transition cursor-pointer"
                                        >
                                          نعم
                                        </button>
                                        <button
                                          onClick={() => setDeleteConfirmId(null)}
                                          className="px-1 py-0.5 bg-slate-200 text-slate-700 font-bold text-[7.5px] rounded hover:bg-slate-300 transition cursor-pointer"
                                        >
                                          لا
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setDeleteConfirmId(pay.id)}
                                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                                        title="حذف"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Payment Input Form (Amount next to Payment Type next to Submit Button) */}
            {!isReadOnly && role !== 'ASSISTANT' && (
              <div className="px-3 py-2 bg-emerald-50/50 border-t border-slate-100 space-y-1.5 shrink-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10.5px] font-black text-emerald-950 flex items-center gap-1">
                    <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>تسجيل دفعة جديدة لشهر {selectedCell.monthName} {currentYear}:</span>
                  </h4>
                  <span className="text-[9.5px] text-emerald-700 font-bold bg-emerald-100/70 px-1.5 py-0.5 rounded">
                    وحدة {selectedCell.resident.flatNumber}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                  <div className="space-y-0.5">
                    <label className="text-[9px] font-bold text-slate-500 block">المبلغ (ج.م) *</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        placeholder="المبلغ"
                        value={newAmount}
                        onChange={(e) => setNewAmount(e.target.value)}
                        className="w-full pl-7 pr-2.5 py-1 bg-white border border-slate-200 focus:border-emerald-500 rounded-lg text-xs font-bold text-right outline-none transition"
                      />
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9.5px] text-slate-400 font-bold">ج.م</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <label className="text-[9px] font-bold text-slate-500 block">نوع الدفعة</label>
                    <select
                      value={newPaymentType}
                      onChange={(e) => setNewPaymentType(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 focus:border-emerald-500 rounded-lg text-xs font-bold text-right outline-none transition cursor-pointer"
                    >
                      {(paymentTypes && paymentTypes.length > 0 ? paymentTypes : ['اشتراك شهري', 'صيانة طارئة', 'تحصيلات اخرى']).map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        const parsedAmount = parseFloat(newAmount);
                        if (isNaN(parsedAmount) || parsedAmount <= 0) {
                          alert('يرجى إدخال قيمة دفعة صالحة أكبر من الصفر.');
                          return;
                        }

                        const pType = newPaymentType || 'اشتراك شهري';
                        const payDate = new Date().toISOString().split('T')[0];
                        const notesText = `سداد اشتراك شهر ${selectedCell.monthName} ${currentYear}`;

                        const newPay: Payment = {
                          id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                          year: currentYear,
                          month: selectedCell.month,
                          residentId: selectedCell.resident.id,
                          residentName: selectedCell.resident.name,
                          flatNumber: selectedCell.resident.flatNumber,
                          paymentType: pType,
                          amount: parsedAmount,
                          notes: notesText,
                          date: payDate,
                          isManuallyPaid: true,
                        };

                        if (onAddPayment) {
                          onAddPayment(newPay);
                        } else {
                          onCellClick(selectedCell.resident.id, selectedCell.month, false, undefined, parsedAmount, pType);
                        }

                        // Update local modal list dynamically so the user immediately sees it
                        setSelectedCell(prev => prev ? {
                          ...prev,
                          payments: [...prev.payments, newPay],
                        } : null);

                        // Reset inputs
                        const defaultAmt = getDefaultFeeForResident(selectedCell.resident);
                        setNewAmount(String(defaultAmt));
                      }}
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>تسجيل الدفعة الآن</span>
                    </button>
                  </div>
                </div>
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
    </div>
  );
};
