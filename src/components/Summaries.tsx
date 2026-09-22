import React, { useMemo, useState, useRef } from 'react';
import { Resident, Payment, Expense, UserRole, FloorConfig, AppConfig } from '../types';
import { Calendar, Check, AlertCircle, RefreshCw, X, ExternalLink, Trash2, PlusCircle, CreditCard, Clock, Layers, Receipt, Edit, Save } from 'lucide-react';
import { BuildingMap } from './BuildingMap';
import { deriveFloorConfigsFromResidents, getUnitNumbersForFloor, compareFlatNumbers, isSameFlatNumber } from '../utils/buildingStructure';

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
  onDeletePayment?: (id: string) => void;
  onAddPayment?: (payment: Payment, base64Image?: string) => void;
  activityDefaultFees?: Record<string, number>;
  defaultMonthlyFee?: number;
  paymentTypes?: string[];
  config?: AppConfig;
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
  onDeletePayment,
  onAddPayment,
  activityDefaultFees,
  defaultMonthlyFee,
  paymentTypes,
  config,
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
  const [editReceiptNumber, setEditReceiptNumber] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
        .filter((p) => p.year === currentYear && p.month === m)
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
    if (floorConfigs && floorConfigs.length > 0) {
      return floorConfigs;
    }
    if (floorConfigs && floorConfigs.length === 0) {
      return [];
    }
    return deriveFloorConfigsFromResidents(residents);
  }, [floorConfigs, residents]);

  const floorResidentGroups = useMemo(() => {
    const assignedResidentIds = new Set<string>();
    const groups: { floor: FloorConfig; residents: Resident[] }[] = [];

    effectiveFloorConfigs.forEach((floor) => {
      const unitNumbers = getUnitNumbersForFloor(floor, residents);
      const floorResidents = sortedResidents.filter(r => unitNumbers.some(u => isSameFlatNumber(u, r.flatNumber)));
      floorResidents.forEach(r => assignedResidentIds.add(r.id));
      if (floorResidents.length > 0) {
        groups.push({ floor, residents: floorResidents });
      }
    });

    const unassigned = sortedResidents.filter(r => !assignedResidentIds.has(r.id));
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
  const categoryList = useMemo(() => {
    const currentYearExpenses = expenses.filter(e => e.year === currentYear);
    const fromExpenses = currentYearExpenses.map(e => e.expenseType).filter(Boolean);
    const defaultList = expenseTypes && expenseTypes.length > 0
      ? expenseTypes
      : ['كهرباء', 'صيانة المصعد', 'نظافة', 'أمن وحراسة', 'سباكة ومياه', 'صيانة عامة', 'أخرى'];
    
    const set = new Set<string>([...fromExpenses, ...defaultList]);
    return Array.from(set);
  }, [expenses, currentYear, expenseTypes]);

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

  // 4. Map and aggregate all payments for grid display in that month
  const getSubscriptionStatus = (residentId: string, month: string) => {
    const matchingPayments = payments.filter(
      (p) =>
        p.residentId === residentId &&
        p.month === month &&
        p.year === currentYear
    );

    const totalAmount = matchingPayments.reduce((sum, p) => sum + p.amount, 0);
    const isPaid = totalAmount > 0 || matchingPayments.some(p => p.isManuallyPaid);

    return {
      paid: isPaid,
      amount: totalAmount,
      paymentsList: matchingPayments,
    };
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
          <table className="w-full text-center border-collapse table-fixed min-w-[960px] sm:min-w-[1060px]">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 font-extrabold text-[11px] sm:text-xs border-b border-slate-100">
                <th className="w-[76px] min-w-[76px] sm:w-28 px-1 sm:px-2 py-2.5 sticky right-0 bg-white shadow-xs z-10 border-l border-slate-100 text-center sm:text-right">
                  البيان / البند
                </th>
                {monthNamesArabic.map((name, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <th 
                      key={idx} 
                      className={`w-[68px] min-w-[68px] sm:w-20 px-1 py-2.5 ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200 font-extrabold text-slate-800' : ''
                      }`}
                    >
                      {name}
                    </th>
                  );
                })}
                <th className="w-[68px] min-w-[68px] sm:w-24 px-1 py-2.5 bg-slate-100/60 border-r border-slate-100 text-slate-800 font-black">
                  المجموع
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] sm:text-xs font-bold text-slate-800">
              {/* Row 1: Total Collections */}
              <tr className="hover:bg-slate-50/20 transition">
                <td className="px-1 sm:px-2 py-2 sticky right-0 bg-white shadow-xs z-10 text-center sm:text-right border-l border-slate-100 font-black text-emerald-800">
                  <span className="text-[11.5px] sm:text-[12.5px] block">التحصيل</span>
                </td>
                {monthlyData.map((d, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <td 
                      key={d.month} 
                      className={`px-1 py-2 border-x border-slate-50 text-emerald-700 font-black ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200' : ''
                      }`}
                    >
                      <span className="text-[10.5px] sm:text-xs block leading-tight">
                        {Math.round(d.payments).toLocaleString()}
                      </span>
                      <span className="text-[8px] sm:text-[9px] text-emerald-600/80 font-bold block">ج.م</span>
                    </td>
                  );
                })}
                <td className="px-1 py-2 bg-emerald-50/40 border-r border-slate-100 text-emerald-900 font-black">
                  <span className="text-[11px] sm:text-[12.5px] block leading-tight">
                    {Math.round(grandPaymentsTotal).toLocaleString()}
                  </span>
                  <span className="text-[8px] sm:text-[9px] text-emerald-700 font-bold block">ج.م</span>
                </td>
              </tr>

              {/* Row 2: Total Expenses */}
              <tr className="hover:bg-slate-50/20 transition">
                <td className="px-1 sm:px-2 py-2 sticky right-0 bg-white shadow-xs z-10 text-center sm:text-right border-l border-slate-100 font-black text-red-800">
                  <span className="text-[11.5px] sm:text-[12.5px] block">المصروفات</span>
                </td>
                {monthlyData.map((d, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <td 
                      key={d.month} 
                      className={`px-1 py-2 border-x border-slate-50 text-red-600 font-black ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200' : ''
                      }`}
                    >
                      <span className="text-[10.5px] sm:text-xs block leading-tight">
                        {Math.round(d.expenses).toLocaleString()}
                      </span>
                      <span className="text-[8px] sm:text-[9px] text-red-500/80 font-bold block">ج.م</span>
                    </td>
                  );
                })}
                <td className="px-1 py-2 bg-red-50/40 border-r border-slate-100 text-red-900 font-black">
                  <span className="text-[11px] sm:text-[12.5px] block leading-tight">
                    {Math.round(grandExpensesTotal).toLocaleString()}
                  </span>
                  <span className="text-[8px] sm:text-[9px] text-red-700 font-bold block">ج.م</span>
                </td>
              </tr>

              {/* Row 3: Net Balance / Cashflow */}
              <tr className="hover:bg-slate-50/30 transition bg-slate-50/40 font-black">
                <td className="px-1 sm:px-2 py-2 sticky right-0 bg-slate-50 shadow-xs z-10 text-center sm:text-right border-l border-slate-100 text-blue-950 font-black">
                  <span className="text-[11.5px] sm:text-[12.5px] block">الرصيد</span>
                </td>
                {monthlyData.map((d, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <td
                      key={d.month}
                      className={`px-1 py-2 border-x border-slate-100 font-black ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200' : ''
                      } ${
                        d.balance >= 0 ? 'text-blue-900' : 'text-amber-700'
                      }`}
                    >
                      <span className="text-[10.5px] sm:text-xs block leading-tight">
                        {Math.round(d.balance).toLocaleString()}
                      </span>
                      <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold block">ج.م</span>
                    </td>
                  );
                })}
                <td
                  className={`px-1 py-2 border-r border-slate-100 font-black ${
                    grandBalanceTotal >= 0 ? 'bg-blue-50/60 text-blue-950' : 'bg-amber-50/60 text-amber-900'
                  }`}
                >
                  <span className="text-[11px] sm:text-[12.5px] block leading-tight">
                    {Math.round(grandBalanceTotal).toLocaleString()}
                  </span>
                  <span className="text-[8px] sm:text-[9px] text-slate-500 font-bold block">ج.م</span>
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
          <table className="w-full text-center border-collapse table-fixed min-w-[960px] sm:min-w-[1060px]">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 font-extrabold text-[11px] sm:text-xs border-b border-slate-100">
                <th className="w-[76px] min-w-[76px] sm:w-28 px-1 sm:px-2 py-2.5 sticky right-0 bg-white shadow-xs z-10 border-l border-slate-100 text-center sm:text-right">
                  فئة المصروف
                </th>
                {monthNamesArabic.map((name, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <th 
                      key={idx} 
                      className={`w-[68px] min-w-[68px] sm:w-20 px-1 py-2.5 ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200 font-extrabold text-slate-800' : ''
                      }`}
                    >
                      {name}
                    </th>
                  );
                })}
                <th className="w-[68px] min-w-[68px] sm:w-24 px-1 py-2.5 bg-slate-100/60 border-r border-slate-100 text-slate-800 font-black">
                  المجموع
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] sm:text-xs font-bold text-slate-800">
              {categoryMonthlyData.map((catData) => (
                <tr key={catData.category} className="hover:bg-slate-50/30 transition">
                  <td className="px-1 sm:px-2 py-2 sticky right-0 bg-white shadow-xs z-10 text-center sm:text-right border-l border-slate-100 font-black text-slate-800">
                    <span className="text-[11px] sm:text-[12px] block truncate max-w-[74px] sm:max-w-none">
                      {catData.category}
                    </span>
                  </td>
                  {catData.monthAmounts.map((amount, idx) => {
                    const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                    return (
                      <td 
                        key={idx} 
                        className={`px-1 py-2 border-x border-slate-50 text-center font-bold ${
                          isQuarterEnd ? 'border-l-2 border-l-slate-200' : ''
                        }`}
                      >
                        {amount > 0 ? (
                          <div>
                            <span className="text-[10px] sm:text-[11.5px] font-black text-red-600 block leading-tight">
                              {Math.round(amount).toLocaleString()}
                            </span>
                            <span className="text-[7.5px] sm:text-[8.5px] text-red-400 font-bold block">ج.م</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 font-bold">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-1 py-2 bg-red-50/30 border-r border-slate-100 text-red-900 font-black">
                    <span className="text-[10.5px] sm:text-xs block leading-tight">
                      {Math.round(catData.totalYear).toLocaleString()}
                    </span>
                    <span className="text-[7.5px] sm:text-[8.5px] text-red-700 font-bold block">ج.م</span>
                  </td>
                </tr>
              ))}

              {/* Total Expenses Row */}
              <tr className="bg-slate-100/80 font-black text-[11px] sm:text-xs border-t-2 border-slate-200">
                <td className="px-1 sm:px-2 py-2.5 sticky right-0 bg-slate-100 shadow-xs z-10 text-center sm:text-right border-l border-slate-200 text-slate-900 font-black">
                  إجمالي المصروفات
                </td>
                {monthlyData.map((d, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <td 
                      key={d.month} 
                      className={`px-1 py-2.5 border-x border-slate-200/60 text-red-700 font-black ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200' : ''
                      }`}
                    >
                      <span className="text-[10.5px] sm:text-xs block leading-tight">
                        {Math.round(d.expenses).toLocaleString()}
                      </span>
                      <span className="text-[7.5px] sm:text-[8.5px] text-red-500 font-bold block">ج.م</span>
                    </td>
                  );
                })}
                <td className="px-1 py-2.5 bg-red-100/60 border-r border-slate-200 text-red-950 font-black">
                  <span className="text-[11px] sm:text-[12.5px] block leading-tight">
                    {Math.round(grandExpensesTotal).toLocaleString()}
                  </span>
                  <span className="text-[7.5px] sm:text-[8.5px] text-red-800 font-bold block">ج.م</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Interactive Collections Table Grouped by Floor */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-slate-50 flex flex-col sm:flex-row items-center justify-between gap-2 bg-slate-50/50">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 font-bold">
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

        <div 
          ref={table3Ref} 
          onScroll={handleTableScroll} 
          onTouchStart={handleScrollerInteraction}
          onPointerDown={handleScrollerInteraction}
          onWheel={handleScrollerInteraction}
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 overscroll-x-contain"
        >
          <table className="w-full text-center border-collapse table-fixed min-w-[960px] sm:min-w-[1060px]">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 font-extrabold text-[11px] sm:text-xs border-b border-slate-100">
                <th className="w-[76px] min-w-[76px] sm:w-28 px-1 sm:px-2 py-2.5 sticky right-0 bg-white shadow-xs z-10 border-l border-slate-100 text-center sm:text-right">
                  الوحدة / الساكن
                </th>
                {monthNamesArabic.map((name, idx) => {
                  const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                  return (
                    <th 
                      key={idx} 
                      className={`w-[68px] min-w-[68px] sm:w-20 px-1 py-2.5 ${
                        isQuarterEnd ? 'border-l-2 border-l-slate-200 font-extrabold text-slate-800' : ''
                      }`}
                    >
                      {name}
                    </th>
                  );
                })}
                <th className="w-[68px] min-w-[68px] sm:w-24 px-1 py-2.5 bg-slate-100/60 border-r border-slate-100 text-slate-800 font-black">
                  المجموع
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] sm:text-xs font-bold text-slate-800">
              {floorResidentGroups.map((group) => (
                <React.Fragment key={group.floor.id}>
                  {/* Floor Divider / Separator Header */}
                  <tr className="bg-slate-100/90 border-y-2 border-slate-200/80">
                    <td colSpan={14} className="py-2 px-3 text-right sticky right-0 bg-slate-100/95 z-5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-900 inline-block shadow-xs"></span>
                          <span className="text-[11.5px] sm:text-xs font-black text-blue-950">{group.floor.floorLabel}</span>
                          <span className="text-[9.5px] sm:text-[10.5px] font-bold text-slate-500">
                            ({group.residents.length} {group.residents.length === 1 ? 'وحدة' : 'وحدات'})
                          </span>
                        </div>
                        <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-600 bg-white/90 px-2 py-0.5 rounded-md border border-slate-200/70">
                          {group.floor.activityType || 'سكني'}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Residents of this floor */}
                  {group.residents.map((res) => {
                    const residentYearTotal = payments
                      .filter((p) => p.residentId === res.id && p.year === currentYear)
                      .reduce((s, p) => s + p.amount, 0);

                    return (
                      <tr key={res.id} className="hover:bg-slate-50/30 transition">
                        <td className="px-1 sm:px-2 py-2 sticky right-0 bg-white shadow-xs z-10 text-center sm:text-right border-l border-slate-100">
                          <div className="flex flex-col leading-tight items-center sm:items-start">
                            <span className="font-black text-blue-900 text-[11.5px] sm:text-xs">وحدة {res.flatNumber}</span>
                            <span className="text-slate-500 truncate max-w-[70px] sm:max-w-[95px] text-[9.5px] sm:text-[10.5px]">
                              {res.name.split(' ')[0]}
                            </span>
                          </div>
                        </td>
                        {months.map((m, idx) => {
                          const status = getSubscriptionStatus(res.id, m);
                          const isMulti = status.paymentsList.length > 1;
                          const isQuarterEnd = idx === 2 || idx === 5 || idx === 8;
                          return (
                            <td
                              key={m}
                              onClick={() => {
                                const monthName = monthNamesArabic[idx];
                                const defaultAmt = getDefaultFeeForResident(res);
                                setNewAmount(String(defaultAmt));
                                setNewPaymentType('اشتراك شهري');
                                setEditingPaymentId(null);
                                setDeleteConfirmId(null);
                                setSelectedCell({
                                  resident: res,
                                  month: m,
                                  monthName: monthName,
                                  payments: status.paymentsList,
                                });
                              }}
                              className={`px-1 py-1 text-center border-x border-slate-50 ${
                                isQuarterEnd ? 'border-l-2 border-l-slate-200' : ''
                              } cursor-pointer ${
                                status.paid
                                  ? 'bg-emerald-50/40 text-emerald-700 hover:bg-emerald-100/50'
                                  : 'bg-red-50/40 text-red-600 hover:bg-red-100/50'
                              } transition`}
                            >
                              <div className="flex flex-col items-center justify-center gap-0.5 min-h-[30px]">
                                {status.paid ? (
                                  <>
                                    <div className="flex items-center gap-0.5">
                                      <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 stroke-[3]" />
                                      {isMulti && (
                                        <span className="text-[7.5px] sm:text-[8.5px] font-black px-0.5 py-0.2 bg-blue-100 text-blue-800 rounded-xs">
                                          {status.paymentsList.length}
                                        </span>
                                      )}
                                    </div>
                                    {status.amount > 0 && (
                                      <span className="text-[9px] sm:text-[10px] font-black text-emerald-800 leading-none">
                                        {status.amount}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-400 stroke-[2]" />
                                    <span className="text-[8px] sm:text-[9px] font-bold text-red-400">غير مسدد</span>
                                  </>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-1 py-2 bg-slate-50/70 border-r border-slate-100 text-center font-black">
                          <span className="text-[10.5px] sm:text-xs text-blue-950 block leading-tight">
                            {Math.round(residentYearTotal).toLocaleString()}
                          </span>
                          <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold block">ج.م</span>
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
      {selectedCell && (
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
                    {selectedCell.payments.reduce((sum, p) => sum + p.amount, 0)} ج.م
                  </span>
                </div>
              </div>

              {/* Payments List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-slate-500">الدفعات المسجلة ({selectedCell.payments.length}):</h4>
                </div>
                
                {selectedCell.payments.length === 0 ? (
                  <div className="text-center py-4 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center gap-1 bg-slate-50/30">
                    <Clock className="w-5 h-5 text-slate-300" />
                    <p className="text-[10.5px] text-slate-400 font-bold">لا توجد دفعات مسجلة لهذا الشهر حالياً.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[36vh] overflow-y-auto pr-0.5">
                    {selectedCell.payments.map((pay) => {
                      const isEditing = editingPaymentId === pay.id;

                      return (
                        <div 
                          key={pay.id} 
                          className="px-2.5 py-1.5 bg-slate-50/70 border border-slate-200/80 rounded-lg shadow-2xs hover:bg-slate-100/60 transition"
                        >
                          {isEditing ? (
                            /* Inline Edit Form */
                            <div className="space-y-1.5 w-full text-right" dir="rtl">
                              <h5 className="text-[9.5px] font-black text-blue-900 border-b border-slate-200 pb-0.5">تعديل الدفعة:</h5>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-0.5">
                                  <label className="text-[8.5px] font-bold text-slate-500 block">المبلغ (ج.م)</label>
                                  <input
                                    type="number"
                                    value={editAmount}
                                    onChange={(e) => setEditAmount(e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs text-right font-bold focus:border-blue-500 outline-none"
                                  />
                                </div>
                                <div className="space-y-0.5">
                                  <label className="text-[8.5px] font-bold text-slate-500 block">نوع الدفعة</label>
                                  <select
                                    value={editPaymentType}
                                    onChange={(e) => setEditPaymentType(e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs text-right font-bold focus:border-blue-500 outline-none"
                                  >
                                    {(paymentTypes && paymentTypes.length > 0 ? paymentTypes : ['اشتراك شهري', 'صيانة طارئة', 'تحصيلات اخرى']).map(type => (
                                      <option key={type} value={type}>{type}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="flex justify-end gap-1.5 pt-1 border-t border-slate-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const parsedAmount = parseFloat(editAmount);
                                    if (isNaN(parsedAmount) || parsedAmount <= 0) {
                                      alert('يرجى إدخال مبلغ صحيح أكبر من الصفر.');
                                      return;
                                    }
                                    if (onEditPayment) {
                                      const updatedPayment: Payment = {
                                        ...pay,
                                        amount: parsedAmount,
                                        paymentType: editPaymentType,
                                      };
                                      onEditPayment(updatedPayment);
                                      setSelectedCell(prev => prev ? {
                                        ...prev,
                                        payments: prev.payments.map(p => p.id === pay.id ? updatedPayment : p)
                                      } : null);
                                    }
                                    setEditingPaymentId(null);
                                  }}
                                  className="px-2 py-0.5 bg-blue-900 hover:bg-blue-950 text-white font-bold text-[9.5px] rounded flex items-center gap-1 shadow-2xs cursor-pointer"
                                >
                                  <Save className="w-2.5 h-2.5" />
                                  <span>حفظ</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPaymentId(null)}
                                  className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[9.5px] rounded cursor-pointer"
                                >
                                  إلغاء
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Regular Compact View */
                            <div className="flex items-center justify-between gap-2 w-full">
                              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                                <span className="px-1.5 py-0.5 bg-emerald-100/90 text-emerald-800 text-[9.5px] font-black rounded">
                                  {pay.paymentType || 'اشتراك شهري'}
                                </span>
                                <span className="text-xs font-black text-slate-900">
                                  {pay.amount} ج.م
                                </span>
                                <span className="text-[9.5px] text-slate-400 font-semibold">
                                  {pay.date}
                                </span>
                                {pay.receiptNumber && (
                                  <span className="text-[8.5px] text-slate-500 font-bold bg-slate-200/70 px-1.5 py-0.5 rounded">
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
                                    <button
                                      onClick={() => {
                                        setEditingPaymentId(pay.id);
                                        setEditAmount(String(pay.amount));
                                        setEditPaymentType(pay.paymentType || 'اشتراك شهري');
                                        setEditReceiptNumber(pay.receiptNumber || '');
                                      }}
                                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded transition cursor-pointer"
                                      title="تعديل"
                                    >
                                      <Edit className="w-3 h-3" />
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
                                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                                        title="حذف"
                                      >
                                        <Trash2 className="w-3 h-3" />
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
      )}
    </div>
  );
};
