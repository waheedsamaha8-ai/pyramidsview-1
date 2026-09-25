import React, { useMemo, useState } from 'react';
import { generateElementImage } from '../utils/imageExport';
import { Resident, Payment, AppConfig, UserRole, FloorConfig } from '../types';
import { ReceiptClaimModal, ReceiptClaimData } from './ReceiptClaimModal';
import { useDebtsCalculations } from '../hooks/useDebtsCalculations';
import { deriveFloorConfigsFromResidents, getUnitNumbersForFloor, compareFlatNumbers, isSameFlatNumber } from '../utils/buildingStructure';
import { 
  calculateResidentFinancials, 
  getCarriedPreviousBalance, 
  exportCarriedBalancesForYear,
  buildPaymentLookupIndex 
} from '../utils/financialCalculations';
import { formatMobileNumber, formatPhoneForDisplay, formatPhoneForText, toWhatsAppNumber } from '../utils/phoneUtils';
import { 
  TrendingDown, 
  Search, 
  Printer, 
  MessageSquare, 
  DollarSign, 
  AlertTriangle, 
  Building,
  Building2,
  HelpCircle,
  Copy,
  CheckCircle,
  ArrowUpDown,
  Phone,
  List,
  LayoutGrid,
  Calendar,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Clock,
  Sparkles,
  Download
} from 'lucide-react';

interface DebtsReportProps {
  residents: Resident[];
  payments: Payment[];
  config: AppConfig;
  role: UserRole;
  floorConfigs?: FloorConfig[];
  currentYear?: number;
  onSetAllResidents?: (residents: Resident[]) => void;
}

export const DebtsReport: React.FC<DebtsReportProps> = ({
  residents,
  payments,
  config,
  role,
  floorConfigs,
  currentYear = new Date().getFullYear(),
  onSetAllResidents,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActivity, setSelectedActivity] = useState<string>('all');
  const [copied, setCopied] = useState(false);
  const [sortBy, setSortBy] = useState<'flat' | 'amount' | 'name'>('flat');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  
  // Year selector for multi-year accounting rollover
  const [selectedYearFilter, setSelectedYearFilter] = useState<'all' | number>('all');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // Track sent WhatsApp reminders
  const [remindedTargets, setRemindedTargets] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('debts_reminded_targets');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const markReminded = (key: string) => {
    setRemindedTargets((prev) => {
      const updated = { ...prev, [key]: true };
      try {
        localStorage.setItem('debts_reminded_targets', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Image generation loading state
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [claimModalData, setClaimModalData] = useState<ReceiptClaimData | null>(null);

  // Ultra-fast client-side image generation for Debts Report
  const handleGenerateImage = async () => {
    setIsGeneratingImage(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const buildingSlug = (config.buildingName || 'اتحاد_الملاك').replace(/\s+/g, '_');
      await generateElementImage('debts-printable-area', `كشف_مديونيات_${buildingSlug}_${dateStr}.png`);
    } catch (e) {
      console.error('Image generation error:', e);
      alert('حدث خطأ أثناء توليد صورة الكشف، يُرجى المحاولة مرة أخرى.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Printing handler
  const handlePrint = () => {
    document.body.classList.add('printing-debts');
    document.body.classList.remove('printing-statement');
    window.focus();

    try {
      window.print();
    } catch (err) {
      console.warn('Direct print failed, trying iframe print fallback:', err);
    }

    const elem = document.getElementById('debts-printable-area');
    if (elem) {
      let iframe = document.getElementById('print-iframe-debts') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe-debts';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
      }
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <title>كشف مديونيات ومستحقات الشواغل المتأخرة</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; direction: rtl; padding: 20px; color: black; background: white; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
              th, td { border: 1px solid #334155; padding: 6px 8px; text-align: right; font-size: 11px; }
              th { background-color: #f1f5f9; font-weight: bold; }
              .bg-slate-100 { background-color: #f1f5f9 !important; }
              .bg-slate-200 { background-color: #e2e8f0 !important; }
              .bg-red-50 { background-color: #fef2f2 !important; }
              .bg-red-100 { background-color: #fee2e2 !important; }
              .bg-emerald-50 { background-color: #ecfdf5 !important; }
              .text-center { text-align: center; }
              .text-right { text-align: right; }
              .font-bold { font-weight: bold; }
              .font-black { font-weight: 900; }
              .grid { display: grid; }
              .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
              .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
              .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
              .gap-3 { gap: 0.75rem; }
              .gap-8 { gap: 2rem; }
              .mb-6 { margin-bottom: 1.5rem; }
              .mt-12 { margin-top: 3rem; }
              .p-4 { padding: 1rem; }
              .border { border: 1px solid #cbd5e1; }
              .rounded-xl { border-radius: 0.75rem; }
              @page { size: A4 portrait; margin: 1cm; }
            </style>
          </head>
          <body>
            ${elem.innerHTML}
          </body>
          </html>
        `);
        doc.close();
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.error('Iframe print error:', e);
          }
        }, 300);
      }
    }

    setTimeout(() => {
      document.body.classList.remove('printing-debts');
    }, 1200);
  };

  const accountingStartDate = config?.accountingStartDate || '2026-01-01';
  const startYear = new Date(accountingStartDate).getFullYear() || 2026;

  // Calculate current date info
  const currentDateStr = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const {
    paymentIndex,
    allDebtorsList,
    totalDebt,
    totalDebtorsCount,
    maxDebtItem,
    availableYears,
  } = useDebtsCalculations(
    residents,
    payments,
    config,
    currentYear,
    selectedYearFilter
  );

  const stats = useMemo(() => ({
    totalDebt,
    totalDebtorsCount,
    maxDebtItem,
  }), [totalDebt, totalDebtorsCount, maxDebtItem]);

  // Screen filtered residents with debt (based on search term, activity filter, sort order)
  const residentsWithDebt = useMemo(() => {
    return allDebtorsList
      .filter((item) => {
        // Search term filter (unit number, owner name, owner phone, tenant name, tenant phone)
        const s = searchTerm.toLowerCase().trim();
        const matchSearch = 
          !s ||
          item.resident.name.toLowerCase().includes(s) ||
          String(item.resident.flatNumber).includes(s) ||
          (item.resident.phone && item.resident.phone.includes(s)) ||
          (item.resident.tenantName && item.resident.tenantName.toLowerCase().includes(s)) ||
          (item.resident.tenantPhone && item.resident.tenantPhone.includes(s));
          
        // Activity filter
        const matchActivity = selectedActivity === 'all' || item.resident.activityType === selectedActivity;
        
        return matchSearch && matchActivity;
      })
      .sort((a, b) => {
        if (sortBy === 'flat') {
          return sortOrder === 'asc' 
            ? compareFlatNumbers(a.resident.flatNumber, b.resident.flatNumber)
            : compareFlatNumbers(b.resident.flatNumber, a.resident.flatNumber);
        } else if (sortBy === 'name') {
          return sortOrder === 'asc'
            ? a.resident.name.localeCompare(b.resident.name, 'ar')
            : b.resident.name.localeCompare(a.resident.name, 'ar');
        } else {
          // Debt is netBalance (negative). Largest debt = smallest netBalance
          return sortOrder === 'asc'
            ? b.financials.netBalance - a.financials.netBalance // smallest debt first
            : a.financials.netBalance - b.financials.netBalance; // largest debt first
        }
      });
  }, [allDebtorsList, searchTerm, selectedActivity, sortBy, sortOrder]);

  const effectiveFloorConfigs = useMemo(() => {
    if (floorConfigs && floorConfigs.length > 0) {
      return floorConfigs;
    }
    if (residents && residents.length > 0) {
      return deriveFloorConfigsFromResidents(residents);
    }
    return [];
  }, [floorConfigs, residents]);

  // Screen floor groups (respects filters)
  const floorDebtorGroups = useMemo(() => {
    const assignedResidentIds = new Set<string>();
    const groups: { floor: FloorConfig; debtors: typeof residentsWithDebt }[] = [];

    effectiveFloorConfigs.forEach((floor) => {
      const unitNumbers = getUnitNumbersForFloor(floor, residents);
      const floorDebtors = residentsWithDebt.filter(item => unitNumbers.some(u => isSameFlatNumber(u, item.resident.flatNumber)));
      floorDebtors.forEach(item => assignedResidentIds.add(item.resident.id));
      if (floorDebtors.length > 0) {
        groups.push({ floor, debtors: floorDebtors });
      }
    });

    const unassigned = residentsWithDebt.filter(item => !assignedResidentIds.has(item.resident.id));
    if (unassigned.length > 0) {
      groups.push({
        floor: {
          id: 'unassigned_floor',
          type: 'typical',
          floorLabel: 'وحدات إضافية / أخرى',
          unitsCount: unassigned.length,
          activityType: 'عام',
        },
        debtors: unassigned,
      });
    }

    return groups;
  }, [effectiveFloorConfigs, residents, residentsWithDebt]);

  // Complete floor groups for print (contains ALL building debtors)
  const allPrintFloorDebtorGroups = useMemo(() => {
    const assignedResidentIds = new Set<string>();
    const groups: { floor: FloorConfig; debtors: typeof allDebtorsList }[] = [];

    effectiveFloorConfigs.forEach((floor) => {
      const unitNumbers = getUnitNumbersForFloor(floor, residents);
      const floorDebtors = allDebtorsList.filter(item => unitNumbers.some(u => isSameFlatNumber(u, item.resident.flatNumber)));
      floorDebtors.forEach(item => assignedResidentIds.add(item.resident.id));
      if (floorDebtors.length > 0) {
        groups.push({ floor, debtors: floorDebtors });
      }
    });

    const unassigned = allDebtorsList.filter(item => !assignedResidentIds.has(item.resident.id));
    if (unassigned.length > 0) {
      groups.push({
        floor: {
          id: 'unassigned_floor',
          type: 'typical',
          floorLabel: 'وحدات إضافية / أخرى',
          unitsCount: unassigned.length,
          activityType: 'عام',
        },
        debtors: unassigned,
      });
    }

    return groups;
  }, [effectiveFloorConfigs, residents, allDebtorsList]);

  const handleCopyConsolidatedReport = () => {
    if (residentsWithDebt.length === 0) return;

    const yearLabel = selectedYearFilter === 'all' 
      ? 'تراكمي شامل حتى تاريخه' 
      : `للسنة المالية ${selectedYearFilter}`;

    let text = `📋 *كشف مديونيات شواغل عمارة بيراميدز فيو ١ (${yearLabel})*\n`;
    text += `📅 *تاريخ إصدار الكشف:* ${currentDateStr}\n`;
    text += `⚙️ *تاريخ بدء المحاسبة:* ${accountingStartDate}\n`;
    text += `💰 *إجمالي المديونيات المستحقة:* ${Math.round(stats.totalDebt).toLocaleString()} ج.م\n`;
    text += `👥 *عدد الوحدات المتأخرة:* ${stats.totalDebtorsCount} وحدة\n`;
    text += `------------------------------------\n\n`;

    residentsWithDebt.forEach((item, index) => {
      const debtAmount = Math.round(Math.abs(item.financials.netBalance));
      const oldDebt = item.carriedBalance < 0 ? Math.abs(item.carriedBalance) : 0;
      text += `${index + 1}. *وحدة ${item.resident.flatNumber}* - المالك: ${item.resident.name}`;
      if (item.resident.phone) text += ` (${formatPhoneForText(item.resident.phone)})`;
      if (item.resident.ownershipType === 'إيجار' && item.resident.tenantName) {
        text += `\n   المستأجر: ${item.resident.tenantName}`;
        if (item.resident.tenantPhone) text += ` (${formatPhoneForText(item.resident.tenantPhone)})`;
      }
      text += `\n   • متأخرات تحصيلات شهرية: تأخير ${item.financials.unpaidMonthsCount} شهور (${Math.round(item.financials.unpaidMonthsDues).toLocaleString()} ج.م)`;
      if (oldDebt > 0) {
        text += ` + مديونية قديمة مرحلة (${oldDebt.toLocaleString()} ج.م)`;
      }
      text += `\n   • إجمالي المديونية المستحقة: *${debtAmount.toLocaleString()} ج.م* (المتأخرات الحالية + المديونيات القديمة)\n\n`;
    });

    text += `🏢 *إدارة اتحاد ملاك بيراميدز فيو ١*`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const sendSingleWhatsApp = (
    recipientName: string,
    phoneToUse: string,
    flatNumber: number | string,
    debtAmount: number,
    carriedBalance: number,
    monthlyFee: number,
    unpaidMonthsCount: number,
    unpaidMonthsDues: number
  ) => {
    const oldDebt = carriedBalance < 0 ? Math.abs(carriedBalance) : 0;
    let defaultText = `مساء الخير أستاذ/ ${recipientName}،\nتحية طيبة من إدارة اتحاد ملاك عمارة بيراميدز فيو ١ 🏢\n\n`;
    defaultText += `نحيط سيادتكم علماً ببيان وتفصيل المبالغ المستحقة على الوحدة رقم (${flatNumber}):\n`;
    defaultText += `• متأخرات تحصيلات شهرية: تأخير ${unpaidMonthsCount} شهور (${Math.round(unpaidMonthsDues).toLocaleString()} ج.م - الاشتراك الشهري: ${monthlyFee} ج.م)\n`;
    if (oldDebt > 0) {
      defaultText += `• مديونيات قديمة ومرحلة: ${oldDebt.toLocaleString()} ج.م\n`;
    }
    defaultText += `💰 *إجمالي المبالغ المستحقة للسداد:* *${debtAmount.toLocaleString()} جنيه مصري* (مجموع المتأخرات الحالية + مجموع المديونيات القديمة)\n\n`;
    defaultText += `نرجو من سيادتكم التكرم بالمبادرة بسرعة سداد المستحقات لتغطية التزامات العمارة والصيانة الدورية ومستحقات الخدمات المشتركة.\nشاكرين ومقدرين حسن تعاونكم دائماً.`;

    const encodedText = encodeURIComponent(defaultText);
    const cleanPhone = toWhatsAppNumber(phoneToUse);
    
    if (cleanPhone) {
      window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, '_blank');
    } else {
      navigator.clipboard.writeText(defaultText);
      alert(`تم نسخ نص رسالة التذكير (${recipientName}) بنجاح لعدم توفر رقم هاتف مسجل.`);
    }
  };

  const handleSendReminder = (item: typeof residentsWithDebt[0], target: 'owner' | 'tenant' | 'both' = 'owner') => {
    const { resident, financials, carriedBalance } = item;
    const debtAmount = Math.round(Math.abs(financials.netBalance));
    const currentMonthNum = new Date().getMonth() + 1;
    const oldDebt = carriedBalance < 0 ? Math.abs(carriedBalance) : 0;

    setClaimModalData({
      type: 'claim',
      unitNumber: resident.flatNumber,
      residentName: resident.name,
      tenantName: resident.tenantName,
      phone: resident.phone,
      tenantPhone: resident.tenantPhone,
      activityType: resident.activityType || 'سكني',
      occupancyType: resident.ownershipType || 'تمليك',
      amount: debtAmount,
      month: currentMonthNum,
      year: currentYear || new Date().getFullYear(),
      carriedBalance: carriedBalance,
      oldDebtAmount: oldDebt,
      monthlyFee: financials.monthlyFee,
      totalDues: financials.expectedDues,
      totalPaid: financials.totalPaid,
      unpaidMonthsCount: financials.unpaidMonthsCount,
      unpaidMonthsDues: financials.unpaidMonthsDues,
      currentMonthStatus: 'غير مسدد ⚠️',
      remainingBalance: debtAmount,
      breakdown: [
        { label: 'الاشتراك الشهري للوحدة', value: `${Math.round(financials.monthlyFee).toLocaleString()} ج.م` },
        { label: 'عدد الشهور المستحقة', value: `${financials.unpaidMonthsCount} شهور (${Math.round(financials.unpaidMonthsDues).toLocaleString()} ج.م)` },
        ...(oldDebt > 0 ? [{
          label: 'مديونية سابقة مرحلة',
          value: `${Math.round(oldDebt).toLocaleString()} ج.م`,
          color: '#b91c1c'
        }] : []),
        { label: 'إجمالي المسدد بالسنة', value: `${Math.round(financials.totalPaid).toLocaleString()} ج.م` },
        { label: 'إجمالي المستحق المطلوب', value: `${Math.round(debtAmount).toLocaleString()} ج.م`, isHighlight: true, color: '#b91c1c' }
      ]
    });

    markReminded(`${resident.id}_${target}`);
  };

  const toggleSort = (field: 'flat' | 'amount' | 'name') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder(field === 'amount' ? 'desc' : 'asc');
    }
  };

  // Perform automatic export of carried balances to next fiscal year
  const handlePerformExportCarriedBalances = (targetNewYear: number) => {
    if (!onSetAllResidents) return;
    const updatedResidents = exportCarriedBalancesForYear(
      residents,
      payments,
      targetNewYear,
      config
    );
    onSetAllResidents(updatedResidents);
    setExportSuccessMsg(`تم تصدير وترحيل الأرصدة السابقة لجميع الوحدات (${updatedResidents.length} وحدة) للسنة المالية ${targetNewYear} بنجاح!`);
    setTimeout(() => {
      setExportSuccessMsg(null);
      setShowExportModal(false);
    }, 3500);
  };

  return (
    <div className="space-y-5 sm:space-y-6 text-right" dir="rtl">
      {/* Top Banner Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
        {/* Card 1: Total Debt */}
        <div className="bg-red-50/90 border border-red-100 rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-xs">
          <div className="space-y-1 text-right">
            <span className="text-[10px] font-black text-red-950 uppercase tracking-wider block">إجمالي المديونيات القائمة</span>
            <span className="text-xl sm:text-2xl font-black text-red-700 block" dir="ltr">
              {Math.round(stats.totalDebt).toLocaleString()} <span className="text-xs font-bold text-red-900">ج.م</span>
            </span>
            <span className="text-[9px] text-red-900/90 font-bold block">
              {selectedYearFilter === 'all' 
                ? `مستحقة تراكمياً منذ بدء المحاسبة ${accountingStartDate}`
                : `مستحقة عن السنة المالية ${selectedYearFilter} متضمنة الرصيد السابق`}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shadow-2xs shrink-0">
            <TrendingDown className="w-6 h-6 stroke-[2]" />
          </div>
        </div>

        {/* Card 2: Debtors Count */}
        <div className="bg-amber-50/90 border border-amber-100 rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-xs">
          <div className="space-y-1 text-right">
            <span className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">عدد الوحدات المدينة</span>
            <span className="text-xl sm:text-2xl font-black text-amber-800 block">
              {stats.totalDebtorsCount} <span className="text-xs font-bold text-amber-950">وحدة متأخرة</span>
            </span>
            <span className="text-[9px] text-amber-900/90 font-bold block">من إجمالي {residents.length} وحدة مسجلة بالعمارة</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-2xs shrink-0">
            <AlertTriangle className="w-6 h-6 stroke-[2]" />
          </div>
        </div>

        {/* Card 3: Highest Debtor */}
        <div className="bg-blue-50/90 border border-blue-100 rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-xs">
          <div className="space-y-1 text-right">
            <span className="text-[10px] font-black text-blue-950 uppercase tracking-wider block">أعلى مديونية مسجلة</span>
            {stats.maxDebtItem ? (
              <>
                <span className="text-sm sm:text-base font-black text-blue-900 block truncate max-w-[200px]">
                  وحدة {stats.maxDebtItem.resident.flatNumber} - {stats.maxDebtItem.resident.name}
                </span>
                <span className="text-xs font-bold text-blue-800 block" dir="ltr">
                  المبلغ: {Math.round(Math.abs(stats.maxDebtItem.financials.netBalance)).toLocaleString()} ج.م
                </span>
              </>
            ) : (
              <span className="text-xs font-bold text-slate-400 block">لا توجد أي مديونيات مسجلة ✨</span>
            )}
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center shadow-2xs shrink-0">
            <Building className="w-6 h-6 stroke-[2]" />
          </div>
        </div>
      </div>

      {/* Automatic Carried Balance Notice Bar */}
      <div className="bg-gradient-to-l from-blue-900 via-indigo-900 to-blue-950 text-white p-3.5 sm:p-4 rounded-2xl shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="w-4.5 h-4.5 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-black">ترحيل وتصدير الأرصدة السابقة تلقائياً للسنوات المالية</h3>
              <span className="bg-emerald-500 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full">نظام آلي مفعل</span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-blue-200/90 font-semibold mt-0.5">
              يقوم النظام تلقائياً بتصدير الأرصدة السابقة (عجز سداد أو فائض دائن) لكل وحدة من سنة إلى أخرى دون أي تدخل يدوي، وضمان عدم سقوط أي مستحقات.
            </p>
          </div>
        </div>

        {role === 'ADMIN' && onSetAllResidents && (
          <button
            onClick={() => setShowExportModal(true)}
            className="self-end md:self-auto px-3.5 py-2 bg-white/15 hover:bg-white/25 active:scale-95 text-white border border-white/20 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-300" />
            <span>تثبيت تصدير الأرصدة لسنة تالية</span>
          </button>
        )}
      </div>

      {/* Search, View Modes & Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-xs space-y-3.5">
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
          
          {/* Right: Search Input + View Mode Toggle */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="البحث برقم الوحدة، المالك، المستأجر، أو التليفون..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-bold focus:border-blue-500 focus:bg-white outline-none transition text-right"
              />
            </div>

            {/* View Mode Switcher (Table vs Cards) */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl shrink-0">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'table' ? 'bg-white text-blue-900 shadow-2xs' : 'text-slate-400 hover:text-slate-600'}`}
                title="عرض جدول مفصل (مطابق لكشف الوحدات)"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'cards' ? 'bg-white text-blue-900 shadow-2xs' : 'text-slate-400 hover:text-slate-600'}`}
                title="عرض كروت الشقق"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Middle: Fiscal Year Selector for Continuous Multi-Year Accounting */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <span className="text-[10px] font-black text-slate-400 shrink-0 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-900" />
              <span>السنة المالية:</span>
            </span>

            <button
              onClick={() => setSelectedYearFilter('all')}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black transition cursor-pointer shrink-0 ${
                selectedYearFilter === 'all'
                  ? 'bg-blue-900 text-white shadow-2xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
              }`}
            >
              الكل (تراكمي شامل)
            </button>

            {availableYears.map(yr => (
              <button
                key={yr}
                onClick={() => setSelectedYearFilter(yr)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black transition cursor-pointer shrink-0 ${
                  selectedYearFilter === yr
                    ? 'bg-blue-900 text-white shadow-2xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                }`}
              >
                سنة {yr}
              </button>
            ))}
          </div>

          {/* Left: Quick Actions - 3 Equal Width Buttons in 1 Row */}
          <div className="grid grid-cols-3 gap-2 w-full pt-2 border-t border-slate-100">
            {/* WhatsApp Group Report */}
            <button
              onClick={handleCopyConsolidatedReport}
              disabled={residentsWithDebt.length === 0}
              className={`w-full py-2.5 px-1 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs ${copied ? 'bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
            >
              {copied ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">تم النسخ!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">نسخ الكشف (واتساب)</span>
                </>
              )}
            </button>

            {/* Generate Image Button */}
            <button
              onClick={handleGenerateImage}
              disabled={residentsWithDebt.length === 0 || isGeneratingImage}
              className="w-full py-2.5 px-1 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
              title="توليد صورة عالية الدقة لكشف المديونيات وحفظها بسرعة"
            >
              {isGeneratingImage ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-200 shrink-0" />
                  <span className="truncate">جاري التوليد...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span className="truncate">توليد صورة الكشف</span>
                </>
              )}
            </button>

            {/* Print button */}
            <button
              onClick={handlePrint}
              disabled={residentsWithDebt.length === 0}
              className="w-full py-2.5 px-1 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">طباعة الكشف</span>
            </button>
          </div>
        </div>

        {/* Activity Category Filters */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
          <button
            onClick={() => setSelectedActivity('all')}
            className={`px-3 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${selectedActivity === 'all' ? 'bg-blue-900 text-white shadow-2xs' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            كل الأنشطة ({allDebtorsList.length})
          </button>
          {(config?.activityTypes || ['سكني', 'سكني مغلق', 'مفروش', 'إداري', 'تجاري']).map((act) => {
            const count = allDebtorsList.filter(d => d.resident.activityType === act).length;
            if (count === 0) return null;
            return (
              <button
                key={act}
                onClick={() => setSelectedActivity(act)}
                className={`px-3 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${selectedActivity === act ? 'bg-blue-900 text-white shadow-2xs' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
              >
                {act} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Table View (Exactly matching ResidentsList table columns + Debts columns) */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-50/90 text-slate-500 font-extrabold text-[10px] border-b border-slate-200">
                  {/* Unit Number - Sticky */}
                  <th 
                    onClick={() => toggleSort('flat')}
                    className="px-3 py-3 sticky right-0 bg-slate-50 shadow-xs z-10 border-l border-slate-200 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>رقم الوحدة</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  
                  {/* Owner Name */}
                  <th 
                    onClick={() => toggleSort('name')}
                    className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>اسم المالك / الساكن</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  {/* Tenant Name */}
                  <th className="px-3 py-3 whitespace-nowrap">اسم المستأجر</th>

                  {/* Activity Type */}
                  <th className="px-3 py-3 whitespace-nowrap">نوع النشاط</th>

                  {/* Monthly Fee */}
                  <th className="px-3 py-3 text-center whitespace-nowrap">الاشتراك الشهري</th>

                  {/* Carried Previous Balance (Exported from previous years) */}
                  <th className="px-3 py-3 text-center whitespace-nowrap">
                    {selectedYearFilter !== 'all' && selectedYearFilter > startYear 
                      ? `رصيد مرحل (${selectedYearFilter - 1})` 
                      : 'رصيد سابق مرحل'}
                  </th>

                  {/* Months Elapsed & Due */}
                  <th className="px-3 py-3 text-center whitespace-nowrap">الشهور المستحقة</th>

                  {/* Due Amount for Unpaid Months */}
                  <th className="px-3 py-3 text-center whitespace-nowrap">المبلغ المستحق</th>

                  {/* Total Paid */}
                  <th className="px-3 py-3 text-center whitespace-nowrap">المبلغ المدفوع</th>

                  {/* Net Debt (Sorted) */}
                  <th 
                    onClick={() => toggleSort('amount')}
                    className="px-3 py-3 text-center cursor-pointer hover:bg-slate-100 transition text-red-900 whitespace-nowrap"
                  >
                    <div className="flex items-center justify-center gap-1 font-black">
                      <span>صافي المديونية</span>
                      <ArrowUpDown className="w-3 h-3 text-red-500" />
                    </div>
                  </th>

                  {/* Notes */}
                  <th className="px-3 py-3 whitespace-nowrap">ملاحظات</th>

                  {/* Quick Contact & Reminders */}
                  {role !== 'RESIDENT' && (
                    <th className="px-3 py-3 text-center whitespace-nowrap">تواصل وتذكير</th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                {residentsWithDebt.length === 0 ? (
                  <tr>
                    <td colSpan={role !== 'RESIDENT' ? 12 : 11} className="px-4 py-12 text-center text-slate-400 font-bold">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CheckCircle className="w-10 h-10 text-emerald-500" />
                        <p className="text-sm font-black text-slate-800">لا توجد أي مديونيات متأخرة على هذه الوحدات!</p>
                        <p className="text-[10px] text-slate-400">جميع الوحدات سددت التزاماتها المالية بالكامل وفقاً لمعايير البحث المحددة.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  floorDebtorGroups.map((group) => (
                    <React.Fragment key={group.floor.id}>
                      {/* Floor Separator Row (Matching ResidentsList) */}
                      <tr className="bg-slate-200/90 dark:bg-[#16223b] border-y-2 border-slate-300 dark:border-slate-700">
                        <td colSpan={role !== 'RESIDENT' ? 12 : 11} className="py-2.5 px-4 text-right border-r-4 border-r-blue-700 dark:border-r-blue-400 sticky right-0 z-5 bg-slate-200/95 dark:bg-[#16223b]/95">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-lg bg-blue-900 dark:bg-blue-600 text-white flex items-center justify-center shadow-2xs">
                                <Building2 className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                                {group.floor.floorLabel}
                              </span>
                              <span className="text-[10px] sm:text-xs font-bold text-slate-600 dark:text-slate-300 bg-white/90 dark:bg-slate-900/90 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs">
                                {group.debtors.length} {group.debtors.length === 1 ? 'وحدة متأخرة' : 'وحدات متأخرة'}
                              </span>
                            </div>
                            <span className="text-[10px] font-extrabold text-blue-900 dark:text-blue-300 bg-white/90 dark:bg-slate-900/90 px-3 py-1 rounded-lg border border-slate-200/80 dark:border-slate-700 shadow-2xs">
                              {group.floor.activityType || 'سكني'}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Floor Residents */}
                      {group.debtors.map(({ resident, financials, carriedBalance }) => {
                        const debtAmount = Math.round(Math.abs(financials.netBalance));
                        const displayNotes = (resident.notes || '').includes('توليد تلقائي') ? '' : (resident.notes || '');

                        return (
                          <tr key={resident.id} className="group hover:bg-red-50/20 transition">
                            {/* Unit Number - Sticky */}
                            <td className="px-3 py-3 text-blue-900 font-black whitespace-nowrap sticky right-0 bg-white group-hover:bg-slate-50 z-5 border-l border-slate-100 shadow-xs">
                              وحدة {resident.flatNumber}
                            </td>

                            {/* Owner Name */}
                            <td className="px-3 py-3 text-slate-900 font-black whitespace-nowrap">
                              {resident.name}
                            </td>

                            {/* Tenant Name */}
                            <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                              {resident.ownershipType === 'إيجار' && resident.tenantName ? (
                                <span className="text-amber-950 font-black">{resident.tenantName}</span>
                              ) : (
                                <span className="text-slate-300 font-normal">—</span>
                              )}
                            </td>

                            {/* Activity Type */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="px-2.5 py-0.5 bg-slate-50 text-slate-700 rounded-md text-[10px] font-extrabold border border-slate-200">
                                {resident.activityType}
                              </span>
                            </td>

                            {/* Monthly Fee */}
                            <td className="px-3 py-3 text-center font-bold text-slate-700 whitespace-nowrap">
                              {financials.monthlyFee} ج.م
                            </td>

                            {/* Carried Previous Balance */}
                            <td className="px-3 py-3 text-center whitespace-nowrap">
                              {carriedBalance < 0 ? (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-black text-[11px]" dir="ltr">
                                  <ArrowDownRight className="w-3 h-3" />
                                  <span>-{Math.abs(carriedBalance).toLocaleString()} ج.م</span>
                                </span>
                              ) : carriedBalance > 0 ? (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-black text-[11px]" dir="ltr">
                                  <ArrowUpRight className="w-3 h-3" />
                                  <span>+{carriedBalance.toLocaleString()} ج.م</span>
                                </span>
                              ) : (
                                <span className="text-slate-300 font-normal">—</span>
                              )}
                            </td>

                            {/* Unpaid Months Due */}
                            <td className="px-3 py-3 text-center font-black text-rose-700 whitespace-nowrap">
                              <span>{financials.unpaidMonthsCount} شهر</span>
                              {financials.paidMonthsCount > 0 && (
                                <span className="block text-[9.5px] font-bold text-slate-400">
                                  (مسدد {financials.paidMonthsCount} من {financials.monthsElapsed})
                                </span>
                              )}
                            </td>

                            {/* Due Amount for Unpaid Months */}
                            <td className="px-3 py-3 text-center text-slate-900 font-black whitespace-nowrap">
                              {Math.round(financials.unpaidMonthsDues).toLocaleString()} ج.م
                            </td>

                            {/* Total Paid */}
                            <td className="px-3 py-3 text-center text-emerald-700 font-black whitespace-nowrap">
                              {Math.round(financials.totalPaid).toLocaleString()} ج.م
                            </td>

                            {/* Net Remaining Debt in Red */}
                            <td className="px-3 py-3 text-center font-black text-rose-700 bg-rose-50/70 group-hover:bg-rose-100/80 transition-all text-xs sm:text-sm whitespace-nowrap border-x border-rose-100">
                              <span dir="ltr">-{debtAmount.toLocaleString()} ج.م</span>
                            </td>

                            {/* Notes */}
                            <td className="px-3 py-3 text-slate-500 font-semibold text-[11px] max-w-[150px] truncate" title={displayNotes}>
                              {displayNotes || '—'}
                            </td>

                            {/* Actions & Quick Contact */}
                            {role !== 'RESIDENT' && (
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                {(() => {
                                  const hasTenant = resident.ownershipType === 'إيجار' && Boolean(resident.tenantName || resident.tenantPhone);
                                  const isOwnerReminded = Boolean(remindedTargets[`${resident.id}_owner`]);
                                  const isTenantReminded = Boolean(remindedTargets[`${resident.id}_tenant`]);
                                  const isBothReminded = Boolean(remindedTargets[`${resident.id}_both`]) || (isOwnerReminded && isTenantReminded);

                                  if (hasTenant) {
                                    return (
                                      <div className="flex flex-col gap-1 items-center justify-center">
                                        {/* Both button */}
                                        <button
                                          onClick={() => handleSendReminder({ resident, financials, carriedBalance }, 'both')}
                                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition shadow-2xs border cursor-pointer inline-flex items-center gap-1 ${
                                            isBothReminded
                                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700'
                                              : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                                          }`}
                                          title="إرسال رسالة تذكير بالمديونية للمالك والمستأجر معاً"
                                        >
                                          {isBothReminded ? (
                                            <CheckCircle className="w-3 h-3 text-white" />
                                          ) : (
                                            <MessageSquare className="w-3 h-3 text-white" />
                                          )}
                                          <span>{isBothReminded ? 'تم تذكير الاثنين ✓' : 'إرسال للكل (مالك ومستأجر)'}</span>
                                        </button>

                                        {/* Individual buttons */}
                                        <div className="inline-flex items-center gap-1">
                                          <button
                                            onClick={() => handleSendReminder({ resident, financials, carriedBalance }, 'owner')}
                                            className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold transition border cursor-pointer inline-flex items-center gap-0.5 ${
                                              isOwnerReminded
                                                ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                                            }`}
                                            title="تذكير المالك فقط"
                                          >
                                            {isOwnerReminded ? <CheckCircle className="w-2.5 h-2.5 text-indigo-700" /> : <MessageSquare className="w-2.5 h-2.5 text-emerald-600" />}
                                            <span>مالك</span>
                                          </button>

                                          <button
                                            onClick={() => handleSendReminder({ resident, financials, carriedBalance }, 'tenant')}
                                            className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold transition border cursor-pointer inline-flex items-center gap-0.5 ${
                                              isTenantReminded
                                                ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                                                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                                            }`}
                                            title="تذكير المستأجر فقط"
                                          >
                                            {isTenantReminded ? <CheckCircle className="w-2.5 h-2.5 text-indigo-700" /> : <MessageSquare className="w-2.5 h-2.5 text-amber-700" />}
                                            <span>مستأجر</span>
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  }

                                  // Owner only
                                  return (
                                    <button
                                      onClick={() => handleSendReminder({ resident, financials, carriedBalance }, 'owner')}
                                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition shadow-2xs border cursor-pointer inline-flex items-center gap-1.5 ${
                                        isOwnerReminded
                                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700'
                                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200/80'
                                      }`}
                                      title="إرسال تذكير بالمديونية للمالك عبر واتساب"
                                    >
                                      {isOwnerReminded ? (
                                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                                      ) : (
                                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                      )}
                                      <span>{isOwnerReminded ? 'تم التذكير ✓' : 'تذكير المالك'}</span>
                                    </button>
                                  );
                                })()}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}

                {/* Total Row */}
                {residentsWithDebt.length > 0 && (
                  <tr className="bg-red-50/80 border-t-2 border-red-200 font-extrabold text-slate-900">
                    <td colSpan={2} className="px-3 py-3.5 text-right font-black text-red-950 sticky right-0 z-5 bg-red-50 shadow-xs border-l border-slate-100">
                      إجمالي مديونيات الكشف:
                    </td>
                    <td colSpan={7} className="px-3 py-3.5 text-left text-slate-500 font-bold text-[11px]">
                      ({residentsWithDebt.length} وحدة متأخرة)
                    </td>
                    <td className="px-3 py-3.5 text-center text-red-700 text-sm sm:text-base font-black whitespace-nowrap bg-red-100/70 shadow-2xs" dir="ltr">
                      -{Math.round(residentsWithDebt.reduce((sum, item) => sum + Math.abs(item.financials.netBalance), 0)).toLocaleString()} ج.م
                    </td>
                    <td colSpan={role !== 'RESIDENT' ? 2 : 1} className="px-3 py-3.5"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Cards View (Matching ResidentsList card design) */
        <div className="space-y-6">
          {residentsWithDebt.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
              <p className="text-xs font-bold text-slate-500">لا توجد أي مديونيات متأخرة على الوحدات.</p>
            </div>
          ) : (
            floorDebtorGroups.map((group) => (
              <div key={group.floor.id} className="space-y-3 pt-2">
                {/* Floor Divider Banner */}
                <div className="flex items-center justify-between bg-slate-200/70 dark:bg-[#16223b] px-4 py-2.5 rounded-2xl border border-slate-300/80 dark:border-slate-700 border-r-4 border-r-blue-700 dark:border-r-blue-400 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-blue-900 dark:bg-blue-600 text-white flex items-center justify-center shadow-xs">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                        {group.floor.floorLabel}
                      </span>
                      <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        {group.debtors.length} {group.debtors.length === 1 ? 'وحدة متأخرة' : 'وحدات متأخرة'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold text-blue-900 dark:text-blue-300 bg-white dark:bg-slate-900 px-3 py-1 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-2xs">
                    {group.floor.activityType || 'سكني'}
                  </span>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {group.debtors.map(({ resident, financials, carriedBalance }) => {
                    const debtAmount = Math.round(Math.abs(financials.netBalance));
                    const displayNotes = (resident.notes || '').includes('توليد تلقائي') ? '' : (resident.notes || '');

                    return (
                      <div
                        key={resident.id}
                        className="bg-white border-2 border-red-100 hover:border-red-200 rounded-2xl p-4 shadow-xs space-y-3 transition flex flex-col justify-between"
                      >
                        <div className="space-y-2.5">
                          {/* Unit Number & Activity */}
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                            <span className="text-sm font-black text-blue-950 bg-blue-50 px-3 py-1 rounded-xl border border-blue-100">
                              وحدة {resident.flatNumber}
                            </span>
                            <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-slate-50 text-slate-700 rounded-lg border border-slate-100">
                              {resident.activityType} ({resident.ownershipType || 'تمليك'})
                            </span>
                          </div>

                          {/* Owner Details */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500 font-bold">المالك:</span>
                              <span className="font-black text-slate-900">{resident.name}</span>
                            </div>
                            {resident.phone && (
                              <div className="flex items-center justify-between text-xs phone-number-display" dir="ltr">
                                <span className="text-slate-400 text-[10px] font-bold">الهاتف:</span>
                                <a
                                  href={`tel:${formatMobileNumber(resident.phone)}`}
                                  className="inline-flex items-center gap-1 text-blue-900 hover:text-blue-700 font-bold text-[11px] font-mono tracking-wider phone-number-display"
                                  dir="ltr"
                                >
                                  <Phone className="w-3 h-3 text-blue-900" />
                                  <span dir="ltr">{formatPhoneForDisplay(resident.phone)}</span>
                                </a>
                              </div>
                            )}
                          </div>

                          {/* Tenant Details (if rental) */}
                          {resident.ownershipType === 'إيجار' && resident.tenantName && (
                            <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-100/80 space-y-1 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-amber-900 font-bold text-[11px]">المستأجر:</span>
                                <span className="font-black text-amber-950">{resident.tenantName}</span>
                              </div>
                              {resident.tenantPhone && (
                                <div className="flex items-center justify-between phone-number-display" dir="ltr">
                                  <span className="text-amber-800 text-[10px] font-bold">هاتف المستأجر:</span>
                                  <a
                                    href={`tel:${formatMobileNumber(resident.tenantPhone)}`}
                                    className="inline-flex items-center gap-1 text-amber-900 hover:text-amber-950 font-bold text-[11px] font-mono tracking-wider phone-number-display"
                                    dir="ltr"
                                  >
                                    <Phone className="w-3 h-3 text-amber-800" />
                                    <span dir="ltr">{formatPhoneForDisplay(resident.tenantPhone)}</span>
                                  </a>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Financial Breakdown Box */}
                          <div className="p-2.5 bg-slate-50/90 rounded-xl border border-slate-100 space-y-1.5 text-[11px]">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-bold">الاشتراك الشهري:</span>
                              <span className="font-black text-slate-800">{financials.monthlyFee} ج.م</span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-bold">رصيد سابق مرحل:</span>
                              {carriedBalance < 0 ? (
                                <span className="text-rose-600 font-black" dir="ltr">-{Math.abs(carriedBalance).toLocaleString()} ج.م (مديونية)</span>
                              ) : carriedBalance > 0 ? (
                                <span className="text-emerald-700 font-black" dir="ltr">+{carriedBalance.toLocaleString()} ج.م (فائض)</span>
                              ) : (
                                <span className="text-slate-400">0 ج.م</span>
                              )}
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-bold">الشهور المستحقة / المطلوب:</span>
                              <span className="font-black text-rose-700">
                                {financials.unpaidMonthsCount} شهر ({Math.round(financials.unpaidMonthsDues).toLocaleString()} ج.م)
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-bold">المبلغ المدفوع:</span>
                              <span className="font-bold text-emerald-700" dir="ltr">
                                {Math.round(financials.totalPaid).toLocaleString()} ج.م {financials.paidMonthsCount > 0 ? `(${financials.paidMonthsCount} شهر)` : ''}
                              </span>
                            </div>

                            {/* Net Debt Highlight */}
                            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/80">
                              <span className="text-rose-950 font-black text-xs">صافي المديونية:</span>
                              <span className="inline-flex items-center gap-0.5 px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-black text-xs" dir="ltr">
                                <ArrowDownRight className="w-3.5 h-3.5" />
                                <span>-{debtAmount.toLocaleString()} ج.م</span>
                              </span>
                            </div>
                          </div>

                          {displayNotes && (
                            <p className="text-[10px] text-slate-400 font-semibold bg-slate-50/60 p-2 rounded-lg border border-slate-100 line-clamp-2">
                              {displayNotes}
                            </p>
                          )}
                        </div>

                        {/* Card Action Buttons */}
                        {role !== 'RESIDENT' && (
                          <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100">
                            {(() => {
                              const hasTenant = resident.ownershipType === 'إيجار' && Boolean(resident.tenantName || resident.tenantPhone);
                              const isOwnerReminded = Boolean(remindedTargets[`${resident.id}_owner`]);
                              const isTenantReminded = Boolean(remindedTargets[`${resident.id}_tenant`]);
                              const isBothReminded = Boolean(remindedTargets[`${resident.id}_both`]) || (isOwnerReminded && isTenantReminded);

                              if (hasTenant) {
                                return (
                                  <>
                                    <button
                                      onClick={() => handleSendReminder({ resident, financials, carriedBalance }, 'both')}
                                      className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-black border transition cursor-pointer shadow-2xs ${
                                        isBothReminded
                                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700'
                                          : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                                      }`}
                                    >
                                      {isBothReminded ? <CheckCircle className="w-3.5 h-3.5 text-white" /> : <MessageSquare className="w-3.5 h-3.5 text-white" />}
                                      <span>{isBothReminded ? 'تم تذكير الاثنين ✓' : 'إرسال للجميع (مالك ومستأجر)'}</span>
                                    </button>

                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => handleSendReminder({ resident, financials, carriedBalance }, 'owner')}
                                        className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                                          isOwnerReminded
                                            ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-extrabold'
                                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                        }`}
                                      >
                                        {isOwnerReminded ? <CheckCircle className="w-3 h-3 text-indigo-700" /> : <MessageSquare className="w-3 h-3 text-emerald-600" />}
                                        <span>المالك</span>
                                      </button>

                                      <button
                                        onClick={() => handleSendReminder({ resident, financials, carriedBalance }, 'tenant')}
                                        className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                                          isTenantReminded
                                            ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-extrabold'
                                            : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                                        }`}
                                      >
                                        {isTenantReminded ? <CheckCircle className="w-3 h-3 text-indigo-700" /> : <MessageSquare className="w-3 h-3 text-amber-700" />}
                                        <span>المستأجر</span>
                                      </button>
                                    </div>
                                  </>
                                );
                              }

                              return (
                                <button
                                  onClick={() => handleSendReminder({ resident, financials, carriedBalance }, 'owner')}
                                  className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-black border transition cursor-pointer ${
                                    isOwnerReminded
                                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700 shadow-2xs'
                                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                  }`}
                                >
                                  {isOwnerReminded ? <CheckCircle className="w-3.5 h-3.5 text-white" /> : <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />}
                                  <span>{isOwnerReminded ? 'تم التذكير ✓' : 'تذكير المالك'}</span>
                                </button>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Explanatory Note */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-start gap-3">
        <HelpCircle className="w-5 h-5 text-blue-900 shrink-0 mt-0.5" />
        <div className="text-[11px] text-slate-600 font-semibold leading-relaxed text-right space-y-1.5">
          <p className="font-extrabold text-slate-900 text-xs">ℹ️ قواعد احتساب المديونيات وتصدير الأرصدة السابقة بين السنوات المالية:</p>
          <p>
            • <span className="text-blue-950 font-black">الترحيل والتصدير التلقائي:</span> في حالة استمرار الحسابات لسنة أو سنوات مالية تالية، يتم تصدير الرصيد الختامي لكل وحدة (عجز سداد أو رصيد دائن) تلقائياً ليصبح هو <span className="text-blue-900 font-black">الرصيد السابق المرحل</span> في السنة المالية الجديدة، بحيث تضاف المديونية السابقة فوراً إلى مطالبات السنة الجديدة دون الحاجة لإعادة الإدخال.
          </p>
          <p>
            • <span className="text-slate-800 font-black">تاريخ بدء المحاسبة:</span> تاريخ الانطلاق المعتمد في النظام هو <span className="text-blue-900 font-black">({accountingStartDate})</span>، ويتم احتساب الشهور ومطالبات الاشتراكات بناءً عليه وعلى النشاط المسجل للوحدة.
          </p>
        </div>
      </div>

      {/* Export Carried Balances Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 border border-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  تثبيت وتصدير الأرصدة السابقة للسنة المالية
                </h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs font-semibold text-slate-600 leading-relaxed">
              <p>
                يقوم هذا الإجراء بحساب صافي الأرصدة الختامية لجميع الوحدات السكنية والتجارية وتصديرها كـ <span className="text-blue-900 font-black">رصيد افتتاحي سابق</span> في سجلات السكان للسنة المالية الجديدة.
              </p>
              
              <div className="bg-blue-50/80 p-3.5 rounded-2xl border border-blue-100 space-y-2">
                <span className="text-[11px] font-black text-blue-950 block">اختر السنة المالية المستهدفة للترحيل:</span>
                <div className="flex gap-2">
                  {[currentYear, currentYear + 1].map(y => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => handlePerformExportCarriedBalances(y)}
                      className="flex-1 py-2.5 bg-blue-900 hover:bg-blue-950 active:scale-98 text-white rounded-xl font-black text-xs transition shadow-xs cursor-pointer flex items-center justify-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>تصدير أرصدة سنة {y}</span>
                    </button>
                  ))}
                </div>
              </div>

              {exportSuccessMsg && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-black text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{exportSuccessMsg}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Area (Hidden on screen, Visible only during printing) */}
      <div id="debts-printable-area" className="printable-area hidden print:block text-right p-6 font-sans" dir="rtl">
        {/* Document Header */}
        <div className="text-center space-y-2 border-b-2 border-slate-800 pb-4 mb-6">
          <h1 className="text-2xl font-black text-slate-900">اتحاد ملاك عمارة بيراميدز فيو ١</h1>
          <p className="text-sm font-bold text-slate-600">
            كشف بمديونيات ومستحقات الشواغل المتأخرة {selectedYearFilter === 'all' ? '(شامل تراكمي)' : `(للسنة المالية ${selectedYearFilter})`}
          </p>
          <div className="flex justify-between items-center text-xs text-slate-500 pt-2 font-semibold">
            <span>تاريخ إصدار الكشف: {currentDateStr}</span>
            <span>تاريخ بدء المحاسبة: {accountingStartDate}</span>
          </div>
        </div>

        {/* Aggregate Stats Bar */}
        <div className="grid grid-cols-3 gap-4 border border-slate-300 rounded-xl p-4 bg-slate-50/50 mb-6 text-xs">
          <div className="text-center space-y-1">
            <span className="font-extrabold text-slate-500">إجمالي المديونيات المستحقة</span>
            <div className="text-base font-black text-red-700">{Math.round(stats.totalDebt).toLocaleString()} ج.م</div>
          </div>
          <div className="text-center space-y-1 border-x border-slate-300">
            <span className="font-extrabold text-slate-500">عدد الشقق والوحدات المتأخرة</span>
            <div className="text-base font-black text-slate-800">{stats.totalDebtorsCount} وحدة</div>
          </div>
          <div className="text-center space-y-1">
            <span className="font-extrabold text-slate-500">متوسط مديونية الوحدة</span>
            <div className="text-base font-black text-blue-950">
              {stats.totalDebtorsCount > 0 ? Math.round(stats.totalDebt / stats.totalDebtorsCount).toLocaleString() : 0} ج.م
            </div>
          </div>
        </div>

        {/* Detailed Table for Print */}
        <table className="w-full text-right border-collapse border border-slate-400 text-xs mb-8">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-400">
              <th className="border border-slate-400 p-2 text-center">الوحدة</th>
              <th className="border border-slate-400 p-2">اسم المالك / الساكن</th>
              <th className="border border-slate-400 p-2">اسم المستأجر</th>
              <th className="border border-slate-400 p-2 text-center">النشاط</th>
              <th className="border border-slate-400 p-2 text-center">الاشتراك</th>
              <th className="border border-slate-400 p-2 text-center">رصيد سابق مرحل</th>
              <th className="border border-slate-400 p-2 text-center">الشهور المستحقة</th>
              <th className="border border-slate-400 p-2 text-center">المبلغ المستحق</th>
              <th className="border border-slate-400 p-2 text-center">المبلغ المدفوع</th>
              <th className="border border-slate-400 p-2 text-center bg-red-50 text-red-900 font-extrabold">صافي المديونية</th>
            </tr>
          </thead>
          <tbody>
            {allPrintFloorDebtorGroups.map((group) => (
              <React.Fragment key={group.floor.id}>
                <tr className="bg-slate-200 border-y border-slate-400">
                  <td colSpan={10} className="p-2 border border-slate-400 bg-slate-100 font-extrabold text-slate-900">
                    🏢 {group.floor.floorLabel} ({group.debtors.length} {group.debtors.length === 1 ? 'وحدة متأخرة' : 'وحدات متأخرة'})
                  </td>
                </tr>
                {group.debtors.map(({ resident, financials, carriedBalance }) => {
                  const debtAmount = Math.round(Math.abs(financials.netBalance));
                  return (
                    <tr key={resident.id} className="border-b border-slate-300">
                      <td className="border border-slate-300 p-2 text-center font-bold text-blue-900">وحدة {resident.flatNumber}</td>
                      <td className="border border-slate-300 p-2 font-bold text-slate-800">{resident.name}</td>
                      <td className="border border-slate-300 p-2 text-slate-700">{resident.tenantName || '—'}</td>
                      <td className="border border-slate-300 p-2 text-center">{resident.activityType}</td>
                      <td className="border border-slate-300 p-2 text-center font-semibold">{financials.monthlyFee} ج.م</td>
                      <td className="border border-slate-300 p-2 text-center font-semibold">
                        {carriedBalance < 0 
                          ? `-${Math.abs(carriedBalance).toLocaleString()} ج.م` 
                          : carriedBalance > 0 
                          ? `+${carriedBalance.toLocaleString()} ج.م` 
                          : '—'}
                      </td>
                      <td className="border border-slate-300 p-2 text-center font-bold text-rose-700">{financials.unpaidMonthsCount} شهر</td>
                      <td className="border border-slate-300 p-2 text-center font-semibold">{Math.round(financials.unpaidMonthsDues).toLocaleString()} ج.م</td>
                      <td className="border border-slate-300 p-2 text-center text-emerald-700 font-semibold">{Math.round(financials.totalPaid).toLocaleString()} ج.م</td>
                      <td className="border border-slate-300 p-2 text-center bg-red-50 text-red-700 font-black">-{debtAmount.toLocaleString()} ج.م</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
            <tr className="bg-slate-100 font-black border-t-2 border-slate-500">
              <td colSpan={2} className="border border-slate-400 p-3 text-right text-slate-900">إجمالي المديونيات المتأخرة:</td>
              <td colSpan={7} className="border border-slate-400 p-3"></td>
              <td className="border border-slate-400 p-3 text-center text-red-700 text-sm font-black bg-red-100" dir="ltr">
                -{Math.round(allDebtorsList.reduce((sum, item) => sum + Math.abs(item.financials.netBalance), 0)).toLocaleString()} ج.م
              </td>
            </tr>
          </tbody>
        </table>

        {/* Signatures Area */}
        <div className="grid grid-cols-3 gap-8 mt-12 text-center text-xs font-bold text-slate-800 pt-6 border-t border-dashed border-slate-300">
          <div className="space-y-12">
            <span>أمين الصندوق</span>
            <div className="border-b border-slate-400 w-32 mx-auto"></div>
          </div>
          <div className="space-y-12">
            <span>رئيس اتحاد الملاك</span>
            <div className="border-b border-slate-400 w-32 mx-auto"></div>
          </div>
          <div className="space-y-12">
            <span>خاتم الاتحاد والتاريخ</span>
            <div className="border-b border-slate-400 w-32 mx-auto"></div>
          </div>
        </div>

        {/* Page Footer */}
        <div className="mt-16 text-center text-[10px] text-slate-400 font-semibold">
          تم إنشاء هذا التقرير تلقائياً بواسطة نظام إدارة عمارة بيراميدز فيو ١
        </div>
      </div>

      {/* Claim Notice Preview & WhatsApp Share Modal */}
      <ReceiptClaimModal
        isOpen={Boolean(claimModalData)}
        onClose={() => setClaimModalData(null)}
        data={claimModalData}
        residents={residents}
        onSuccessToast={(msg) => {
          alert(msg);
        }}
      />
    </div>
  );
};
