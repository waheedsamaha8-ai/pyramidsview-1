import React, { useState, useMemo } from 'react';
import { 
  X, 
  Building2, 
  Search, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  ChevronLeft,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { Resident, Payment, AppConfig, FloorConfig } from '../../types';
import { 
  getPrescribedFeeForMonth, 
  isValidPaidPayment, 
  isMonthlySubscriptionType, 
  parsePaymentYear, 
  parsePaymentMonth 
} from '../../utils/financialCalculations';
import { 
  deriveFloorConfigsFromResidents, 
  getUnitNumbersForFloor, 
  isSameFlatNumber 
} from '../../utils/buildingStructure';

interface AnnualBuildingMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  residents: Resident[];
  payments: Payment[];
  config: AppConfig;
  floorConfigs?: FloorConfig[];
}

const MONTH_NAMES = [
  'يناير (01)',
  'فبراير (02)',
  'مارس (03)',
  'أبريل (04)',
  'مايو (05)',
  'يونيو (06)',
  'يوليو (07)',
  'أغسطس (08)',
  'سبتمبر (09)',
  'أكتوبر (10)',
  'نوفمبر (11)',
  'ديسمبر (12)'
];

export const AnnualBuildingMapModal: React.FC<AnnualBuildingMapModalProps> = ({
  isOpen,
  onClose,
  residents,
  payments,
  config,
  floorConfigs,
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [collapsedFloors, setCollapsedFloors] = useState<Record<string, boolean>>({});

  const toggleFloorCollapse = (floorId: string) => {
    setCollapsedFloors(prev => ({
      ...prev,
      [floorId]: !prev[floorId]
    }));
  };

  // Available years for selection
  const availableYears = useMemo(() => {
    const currentYr = new Date().getFullYear();
    const yearsSet = new Set<number>([currentYr, currentYr - 1, currentYr - 2, 2026, 2025, 2024]);
    payments.forEach(p => {
      const y = parsePaymentYear(p);
      if (y && y > 2000 && y < 2100) yearsSet.add(y);
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [payments]);

  // Derived effective floor configurations
  const effectiveFloorConfigs = useMemo(() => {
    return (floorConfigs && floorConfigs.length > 0)
      ? floorConfigs
      : deriveFloorConfigsFromResidents(residents);
  }, [floorConfigs, residents]);

  // Floor groups containing resolved residents for each unit
  const floorGroups = useMemo(() => {
    return effectiveFloorConfigs.map(floor => {
      const unitNums = getUnitNumbersForFloor(floor, residents);
      const floorResidents: Resident[] = unitNums.map(u => {
        const found = residents.find(r => isSameFlatNumber(r.flatNumber, u));
        if (found) return found;
        return {
          id: `res_temp_${u}`,
          flatNumber: u,
          name: `شقة ${u}`,
          activityType: floor.activityType || 'سكني',
          monthlyFee: config.defaultMonthlyFee || 400
        } as Resident;
      });
      return {
        floorConfig: floor,
        residents: floorResidents
      };
    });
  }, [effectiveFloorConfigs, residents, config]);

  // Filter residents by search query if present
  const filteredFloorGroups = useMemo(() => {
    if (!searchTerm.trim()) return floorGroups;
    const query = searchTerm.trim().toLowerCase();
    
    return floorGroups.map(fg => {
      const matchedResidents = fg.residents.filter(r => 
        String(r.flatNumber).includes(query) || 
        r.name.toLowerCase().includes(query) ||
        (r.phone && r.phone.includes(query))
      );
      return {
        ...fg,
        residents: matchedResidents
      };
    }).filter(fg => fg.residents.length > 0);
  }, [floorGroups, searchTerm]);

  // Helper to compute individual resident metrics for the selected year
  const getResidentYearMetrics = (res: Resident) => {
    let prescribed = 0;
    const monthsData = [];

    for (let m = 1; m <= 12; m++) {
      const feeRes = getPrescribedFeeForMonth(
        res, 
        selectedYear, 
        m, 
        payments, 
        config.defaultMonthlyFee || 400, 
        config.activityDefaultFees, 
        config.activityFeePeriods, 
        config.customUnitFeePeriods
      );
      const monthlyPrescribed = feeRes.monthlyFee;
      prescribed += monthlyPrescribed;

      // Find payments for this specific month & year
      const monthPayments = payments.filter(p => 
        isSameFlatNumber(p.flatNumber, res.flatNumber) &&
        isValidPaidPayment(p) &&
        isMonthlySubscriptionType(p.paymentType) &&
        parsePaymentYear(p) === selectedYear &&
        parsePaymentMonth(p) === m
      );

      const paidForMonth = monthPayments.reduce((acc, p) => acc + (p.amount || 0), 0);

      let status: 'EXEMPT' | 'PAID' | 'PARTIAL' | 'UNPAID' = 'UNPAID';
      
      if (res.activityType === 'بدون تشطيب' || monthlyPrescribed === 0) {
        status = 'EXEMPT';
      } else if (paidForMonth >= monthlyPrescribed) {
        status = 'PAID';
      } else if (paidForMonth > 0) {
        status = 'PARTIAL';
      } else {
        status = 'UNPAID';
      }

      monthsData.push({
        monthNumber: m,
        monthName: MONTH_NAMES[m - 1],
        prescribed: monthlyPrescribed,
        paid: paidForMonth,
        balance: Math.max(0, monthlyPrescribed - paidForMonth),
        status,
        payments: monthPayments
      });
    }

    // Total year payments for this resident
    const totalPaidYear = monthsData.reduce((acc, m) => acc + m.paid, 0);

    let yearStatus: 'EXEMPT' | 'PAID' | 'PARTIAL' | 'UNPAID' = 'UNPAID';
    if (res.activityType === 'بدون تشطيب' || prescribed === 0) {
      yearStatus = 'EXEMPT';
    } else if (totalPaidYear >= prescribed) {
      yearStatus = 'PAID';
    } else if (totalPaidYear > 0) {
      yearStatus = 'PARTIAL';
    } else {
      yearStatus = 'UNPAID';
    }

    return {
      prescribed,
      paid: totalPaidYear,
      balance: Math.max(0, prescribed - totalPaidYear),
      yearStatus,
      monthsData
    };
  };

  // Summary financials for the entire building in the selected year
  const buildingYearSummary = useMemo(() => {
    let totalPrescribed = 0;
    let totalPaid = 0;
    let totalExemptUnits = 0;
    let totalPaidUnits = 0;

    residents.forEach(res => {
      const metrics = getResidentYearMetrics(res);
      totalPrescribed += metrics.prescribed;
      totalPaid += metrics.paid;

      if (metrics.yearStatus === 'EXEMPT') {
        totalExemptUnits++;
      } else if (metrics.yearStatus === 'PAID') {
        totalPaidUnits++;
      }
    });

    const totalArrears = Math.max(0, totalPrescribed - totalPaid);

    return {
      totalUnits: residents.length,
      totalPrescribed,
      totalPaid,
      totalArrears,
      totalExemptUnits,
      totalPaidUnits
    };
  }, [residents, payments, selectedYear, config]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex flex-col overflow-hidden animate-fade-in" dir="rtl">
      
      {/* Top Fixed Header */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white px-4 sm:px-6 py-3.5 border-b border-slate-800 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300 shadow-inner">
            <Building2 className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span>خريطة العمارة التفاعلية السنوية</span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                عام {selectedYear}
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              متابعة موقف جميع وحدات العمارة ونسبة التحصيل السنوي بالتفصيل
            </p>
          </div>
        </div>

        {/* Controls: Year selector, search, close button */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Year selector */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded-xl px-2.5 py-1.5 shadow-inner">
            <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-xs font-black text-white focus:outline-none cursor-pointer"
            >
              {availableYears.map(yr => (
                <option key={yr} value={yr} className="bg-slate-900 text-white font-bold">
                  عام {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Search box */}
          <div className="relative hidden md:block w-48 lg:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث برقم الوحدة أو المالك..."
              className="w-full pl-3 pr-9 py-1.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs font-bold text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-red-900/40 hover:text-red-300 text-slate-300 rounded-xl border border-slate-700 transition cursor-pointer flex items-center justify-center shadow-xs"
            title="إغلاق الخريطة التفاعلية"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Stats KPI Bar */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-4 sm:px-6 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0 text-white text-xs font-bold">
        <div className="bg-slate-800/60 p-2 rounded-xl border border-slate-700/60 flex items-center justify-between">
          <span className="text-slate-400 text-[11px]">إجمالي شقق العمارة:</span>
          <span className="text-white font-black text-sm">{buildingYearSummary.totalUnits} وحدة</span>
        </div>
        <div className="bg-blue-950/40 p-2 rounded-xl border border-blue-900/50 flex items-center justify-between">
          <span className="text-blue-300 text-[11px]">المستحق لعام {selectedYear}:</span>
          <span className="text-blue-200 font-black text-sm">{buildingYearSummary.totalPrescribed.toLocaleString()} ج.م</span>
        </div>
        <div className="bg-emerald-950/40 p-2 rounded-xl border border-emerald-900/50 flex items-center justify-between">
          <span className="text-emerald-300 text-[11px]">إجمالي المحصل:</span>
          <span className="text-emerald-300 font-black text-sm">{buildingYearSummary.totalPaid.toLocaleString()} ج.م</span>
        </div>
        <div className="bg-rose-950/40 p-2 rounded-xl border border-rose-900/50 flex items-center justify-between">
          <span className="text-rose-300 text-[11px]">المتبقي والمديونية:</span>
          <span className="text-rose-300 font-black text-sm">{buildingYearSummary.totalArrears.toLocaleString()} ج.م</span>
        </div>
      </div>

      {/* Main Content Area: 6 Columns Grid grouped by Floors */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-6 bg-slate-950">
        
        {/* Mobile Search Input */}
        <div className="block md:hidden mb-2">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث برقم الوحدة أو المالك..."
              className="w-full pl-3 pr-9 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {filteredFloorGroups.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-slate-800 text-slate-400">
            <Building2 className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <p className="text-sm font-bold">لا توجد وحدات سكنية مطابقة لنتيجة البحث</p>
          </div>
        ) : (
          filteredFloorGroups.map((group) => {
            const floor = group.floorConfig;
            const isCollapsed = Boolean(collapsedFloors[floor.id]);

            return (
              <div key={floor.id} className="space-y-3">
                
                {/* Floor Divider Banner مع زر فتح وغلق صفوف الدور */}
                <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 via-blue-950/70 to-slate-900 border-y border-slate-800/80 px-4 py-2 rounded-xl shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                    <h3 className="text-xs sm:text-sm font-black text-blue-200 tracking-wide flex items-center gap-2">
                      <span>🏢 {floor.floorLabel}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                        ({group.residents.length} وحدات)
                      </span>
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleFloorCollapse(floor.id)}
                    className={`flex items-center gap-1.5 text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-lg border transition cursor-pointer active:scale-95 shadow-2xs ${
                      isCollapsed
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500'
                        : 'bg-blue-900 hover:bg-blue-800 text-white border-blue-700'
                    }`}
                    title={isCollapsed ? 'فتح صفوف وحدات الدور' : 'غلق صفوف وحدات الدور'}
                  >
                    {isCollapsed ? (
                      <>
                        <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>فتح صفوف الدور</span>
                        <span className="opacity-80 font-mono text-[9px]">({group.residents.length})</span>
                      </>
                    ) : (
                      <>
                        <ChevronUp className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>غلق صفوف الدور</span>
                        <span className="opacity-80 font-mono text-[9px]">({group.residents.length})</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 6 Columns Grid across screen for units */}
                {!isCollapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {group.residents.map((res) => {
                      const metrics = getResidentYearMetrics(res);

                      // Color theme based on year status
                      let statusBg = 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700';
                      let badgeBg = 'bg-slate-800 text-slate-400 border-slate-700';
                      let statusIcon = <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />;
                      let statusLabel = 'معفي';

                      if (metrics.yearStatus === 'PAID') {
                        statusBg = 'bg-emerald-950/30 border-emerald-800/60 hover:border-emerald-500/80 shadow-emerald-950/20';
                        badgeBg = 'bg-emerald-900/50 text-emerald-300 border-emerald-700/60';
                        statusIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
                        statusLabel = 'مسدد بالكامل';
                      } else if (metrics.yearStatus === 'PARTIAL') {
                        statusBg = 'bg-amber-950/30 border-amber-800/60 hover:border-amber-500/80 shadow-amber-950/20';
                        badgeBg = 'bg-amber-900/50 text-amber-300 border-amber-700/60';
                        statusIcon = <Clock className="w-3.5 h-3.5 text-amber-400" />;
                        statusLabel = 'سداد جزئي';
                      } else if (metrics.yearStatus === 'UNPAID') {
                        statusBg = 'bg-rose-950/30 border-rose-800/60 hover:border-rose-500/80 shadow-rose-950/20';
                        badgeBg = 'bg-rose-900/50 text-rose-300 border-rose-700/60';
                        statusIcon = <AlertCircle className="w-3.5 h-3.5 text-rose-400" />;
                        statusLabel = 'غير مسدد';
                      } else if (metrics.yearStatus === 'EXEMPT') {
                        statusBg = 'bg-slate-900/80 border-slate-800 hover:border-slate-700';
                        badgeBg = 'bg-slate-800/80 text-slate-400 border-slate-700';
                        statusIcon = <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />;
                        statusLabel = 'معفي';
                      }

                      return (
                        <div
                          key={res.id}
                          onClick={() => setSelectedResident(res)}
                          className={`p-3 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-md hover:scale-[1.02] ${statusBg}`}
                        >
                          {/* Card Header: Unit Number & Status Badge */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-black text-white px-2 py-0.5 rounded-lg bg-blue-900/60 border border-blue-700/50 shadow-2xs">
                                شقة {res.flatNumber}
                              </span>
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border flex items-center gap-1 shrink-0 ${badgeBg}`}>
                                {statusIcon}
                                <span>{statusLabel}</span>
                              </span>
                            </div>

                            {/* Owner Name */}
                            <div className="pt-1">
                              <h4 className="text-xs font-extrabold text-slate-100 truncate" title={res.name}>
                                {res.name}
                              </h4>
                              <p className="text-[10px] font-bold text-slate-400 truncate">
                                {res.activityType || 'سكني'} {res.ownershipType ? `(${res.ownershipType})` : ''}
                              </p>
                            </div>
                          </div>

                          {/* Financial Metrics Row: Required Due Amount & Collected Paid Amount */}
                          <div className="mt-3 pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-1.5 text-[10px]">
                            <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800 text-center">
                              <span className="text-slate-400 block text-[9px]">المستحق:</span>
                              <span className="font-black text-slate-200 text-[11px]">{metrics.prescribed.toLocaleString()}</span>
                            </div>
                            <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800 text-center">
                              <span className="text-emerald-400 block text-[9px]">المحصل:</span>
                              <span className="font-black text-emerald-400 text-[11px]">{metrics.paid.toLocaleString()}</span>
                            </div>
                          </div>

                          {/* Interactive Hint */}
                          <div className="mt-2 text-center text-[9px] font-extrabold text-blue-400 flex items-center justify-center gap-1 group-hover:underline">
                            <span>عرض كشف الـ 12 شهراً</span>
                            <ChevronLeft className="w-3 h-3" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* NESTED UNIT DETAIL MODAL: 4 Rows x 3 Columns Month Grid */}
      {selectedResident && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 font-black text-lg shadow-inner">
                  {selectedResident.flatNumber}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <span>كشف شقة {selectedResident.flatNumber} - {selectedResident.name}</span>
                  </h3>
                  <p className="text-xs text-slate-400 font-bold mt-0.5">
                    البيانات التفصيلية وموقف التحصيل السنوي لشهور عام {selectedYear}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedResident(null)}
                className="p-2 bg-slate-800 hover:bg-red-900/40 hover:text-red-300 text-slate-300 rounded-xl border border-slate-700 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resident Info & Year Summary */}
            {(() => {
              const resMetrics = getResidentYearMetrics(selectedResident);
              return (
                <>
                  <div className="bg-slate-950/80 p-3 sm:p-4 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-bold">
                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-right">
                      <span className="text-slate-400 text-[10px] block">نوع النشاط:</span>
                      <span className="text-white font-extrabold">{selectedResident.activityType || 'سكني'}</span>
                    </div>
                    <div className="bg-blue-950/30 p-2.5 rounded-xl border border-blue-900/50 text-right">
                      <span className="text-blue-300 text-[10px] block">إجمالي مستحق {selectedYear}:</span>
                      <span className="text-blue-200 font-black text-sm">{resMetrics.prescribed.toLocaleString()} ج.م</span>
                    </div>
                    <div className="bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-900/50 text-right">
                      <span className="text-emerald-300 text-[10px] block">إجمالي المحصل:</span>
                      <span className="text-emerald-300 font-black text-sm">{resMetrics.paid.toLocaleString()} ج.م</span>
                    </div>
                    <div className="bg-rose-950/30 p-2.5 rounded-xl border border-rose-900/50 text-right">
                      <span className="text-rose-300 text-[10px] block">المتبقي لعام {selectedYear}:</span>
                      <span className="text-rose-300 font-black text-sm">{resMetrics.balance.toLocaleString()} ج.م</span>
                    </div>
                  </div>

                  {/* 4 Rows x 3 Columns Grid for 12 Months */}
                  <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-950 space-y-3">
                    <div className="text-xs font-extrabold text-slate-300 mb-2 flex items-center justify-between">
                      <span>جدول موقف السداد التفصيلي للشهور الـ 12 (4 صفوف × 3 أعمدة):</span>
                      <span className="text-slate-400 text-[11px] font-semibold">عام {selectedYear}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {resMetrics.monthsData.map((m) => {
                        // Month card styling & state
                        let cardBg = 'bg-slate-900 border-slate-800 text-slate-300';
                        let badgeStyle = 'bg-slate-800 text-slate-400 border-slate-700';
                        let statusText = 'معفي';
                        let icon = <ShieldCheck className="w-4 h-4 text-slate-400" />;

                        if (m.status === 'PAID') {
                          cardBg = 'bg-emerald-950/25 border-emerald-800/70 text-emerald-200';
                          badgeStyle = 'bg-emerald-900/60 text-emerald-300 border-emerald-700';
                          statusText = 'مسدد ✓';
                          icon = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
                        } else if (m.status === 'PARTIAL') {
                          cardBg = 'bg-amber-950/25 border-amber-800/70 text-amber-200';
                          badgeStyle = 'bg-amber-900/60 text-amber-300 border-amber-700';
                          statusText = 'سداد جزئي ⏱️';
                          icon = <Clock className="w-4 h-4 text-amber-400" />;
                        } else if (m.status === 'UNPAID') {
                          cardBg = 'bg-rose-950/25 border-rose-800/70 text-rose-200';
                          badgeStyle = 'bg-rose-900/60 text-rose-300 border-rose-700';
                          statusText = 'غير مسدد ⚠️';
                          icon = <AlertCircle className="w-4 h-4 text-rose-400" />;
                        } else if (m.status === 'EXEMPT') {
                          cardBg = 'bg-slate-900/90 border-slate-800 text-slate-400';
                          badgeStyle = 'bg-slate-800 text-slate-400 border-slate-700';
                          statusText = 'معفي ⚪';
                          icon = <ShieldCheck className="w-4 h-4 text-slate-400" />;
                        }

                        return (
                          <div
                            key={m.monthNumber}
                            className={`p-3.5 rounded-2xl border flex flex-col justify-between shadow-sm ${cardBg}`}
                          >
                            {/* Month Header */}
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                              <span className="text-xs font-black text-white flex items-center gap-1.5">
                                {icon}
                                <span>{m.monthName}</span>
                              </span>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${badgeStyle}`}>
                                {statusText}
                              </span>
                            </div>

                            {/* Month Dues and Payments */}
                            <div className="py-2.5 space-y-1 text-xs">
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-[11px]">المستحق:</span>
                                <span className="font-bold text-slate-200">{m.prescribed.toLocaleString()} ج.م</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-emerald-400 text-[11px]">المحصل:</span>
                                <span className="font-black text-emerald-400">{m.paid.toLocaleString()} ج.م</span>
                              </div>
                              {m.prescribed > 0 && m.balance > 0 && (
                                <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
                                  <span className="text-rose-400 text-[11px]">المتبقي:</span>
                                  <span className="font-black text-rose-400">{m.balance.toLocaleString()} ج.م</span>
                                </div>
                              )}
                            </div>

                            {/* Payment Receipts/Date details if paid */}
                            {m.payments.length > 0 && (
                              <div className="mt-1 pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-400 space-y-1">
                                {m.payments.map(p => (
                                  <div key={p.id} className="flex items-center justify-between bg-slate-950/60 p-1 rounded-md">
                                    <span>إيصال #{p.receiptNumber || p.id.slice(-4)}</span>
                                    <span className="text-emerald-400 font-bold">{p.date ? p.date.split('T')[0] : ''}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Modal Footer */}
            <div className="bg-slate-900 p-3.5 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold">
                اتحاد ملاك {config?.buildingName || 'بيراميدز فيو ١'} - كشف الحساب السنوي
              </span>
              <button
                onClick={() => setSelectedResident(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                إغلاق الكشف
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
