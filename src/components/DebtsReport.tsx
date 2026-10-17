import React, { useMemo, useState } from 'react';
import { generateElementImage } from '../utils/imageExport';
import { printReportElement } from '../utils/printReport';
import { Resident, Payment, AppConfig, UserRole, FloorConfig } from '../types';
import { ReceiptClaimModal, ReceiptClaimData } from './ReceiptClaimModal';
import { useDebtsCalculations } from '../hooks/useDebtsCalculations';
import { deriveFloorConfigsFromResidents, getUnitNumbersForFloor, compareFlatNumbers, isSameFlatNumber, getHistoricalOccupantForDate, getHistoricalActivityForDate } from '../utils/buildingStructure';
import { 
  calculateResidentFinancials, 
  getCarriedPreviousBalance, 
  exportCarriedBalancesForYear,
  buildPaymentLookupIndex,
  isMonthlySubscriptionType,
  calculateUnitClaimBreakdown
} from '../utils/financialCalculations';
import { getActiveAccountingPeriod, formatPeriodDateRange } from '../utils/periodUtils';
import { formatMobileNumber, formatPhoneForDisplay, formatPhoneForText, toWhatsAppNumber } from '../utils/phoneUtils';
import { monthNamesArabic } from '../utils/receiptClaimGenerator';
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
  Download,
  Filter,
  Eye,
  EyeOff
} from 'lucide-react';

interface DebtsReportProps {
  residents: Resident[];
  payments: Payment[];
  config: AppConfig;
  role: UserRole;
  floorConfigs?: FloorConfig[];
  currentYear?: number;
  onSetAllResidents?: (residents: Resident[]) => void;
  onRefreshAllData?: () => Promise<void> | void;
}

export const DebtsReport: React.FC<DebtsReportProps> = ({
  residents,
  payments,
  config,
  role,
  floorConfigs,
  currentYear = new Date().getFullYear(),
  onSetAllResidents,
  onRefreshAllData,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActivity, setSelectedActivity] = useState<string>('all');
  const [copied, setCopied] = useState(false);
  const [sortBy, setSortBy] = useState<'flat' | 'amount' | 'name'>('flat');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<string>(() => {
    return new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  });

  const handleInstantRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefreshAllData) {
        await onRefreshAllData();
      }
      setLastRefreshTime(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e) {
      console.error('Instant refresh error:', e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 350);
    }
  };
  
  // Year selector for multi-year accounting rollover
  const [selectedYearFilter, setSelectedYearFilter] = useState<'all' | number>('all');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  const [hideCarriedBalance, setHideCarriedBalance] = useState<boolean>(false);

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

  // Dynamic activity types connected to config.activityTypes and residents
  const availableActivityTypes = useMemo(() => {
    const configured = (config?.activityTypes && config.activityTypes.length > 0)
      ? config.activityTypes
      : ['سكني', 'سكني مغلق', 'مفروش', 'إداري', 'تجاري', 'تحت التشطيب'];
    const fromResidents = residents.map(r => r.activityType).filter(Boolean) as string[];
    return Array.from(new Set([...configured, ...fromResidents])).filter(Boolean);
  }, [config?.activityTypes, residents]);

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
    printReportElement('debts-printable-area');
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
    activePeriodTitle,
  } = useDebtsCalculations(
    residents,
    payments,
    config,
    currentYear,
    selectedYearFilter
  );

  const activePeriod = useMemo(() => getActiveAccountingPeriod(config), [config]);

  // Ensure year filter resets if switching to a period with different years
  React.useEffect(() => {
    if (selectedYearFilter !== 'all' && availableYears.length > 0 && !availableYears.includes(Number(selectedYearFilter))) {
      setSelectedYearFilter('all');
    }
  }, [availableYears, selectedYearFilter]);

  const stats = useMemo(() => {
    let debtSum = 0;
    let debtorsCount = 0;
    let maxItem: typeof allDebtorsList[0] | null = null;
    let maxVal = -1;

    allDebtorsList.forEach((item) => {
      const cBal = hideCarriedBalance ? 0 : (item.carriedBalance || 0);
      const netPeriodDebt = (item.financials.periodExpectedDues || 0) - (item.financials.monthlyPaid || 0) + (item.financials.otherCollectionsDebt || 0);
      const calculatedNetDebt = netPeriodDebt - cBal;
      const debt = calculatedNetDebt > 0 ? Math.round(calculatedNetDebt) : 0;

      if (debt > 0) {
        debtSum += debt;
        debtorsCount += 1;
        if (debt > maxVal) {
          maxVal = debt;
          maxItem = item;
        }
      }
    });

    return {
      totalDebt: debtSum,
      totalDebtorsCount: debtorsCount,
      maxDebtItem: maxItem,
    };
  }, [allDebtorsList, hideCarriedBalance]);



  const recordedDebtMonthsCount = useMemo(() => {
    if (selectedYearFilter === 'all') {
      try {
        const start = new Date(accountingStartDate || '2026-01-01');
        const now = new Date();
        const startY = isNaN(start.getFullYear()) ? 2026 : start.getFullYear();
        const startM = isNaN(start.getMonth()) ? 0 : start.getMonth();
        const currY = now.getFullYear();
        const currM = now.getMonth();
        return Math.max(1, (currY - startY) * 12 + (currM - startM) + 1);
      } catch {
        return 1;
      }
    } else {
      const targetYear = Number(selectedYearFilter);
      const now = new Date();
      const currentCalendarYear = now.getFullYear();
      const currentCalendarMonth = now.getMonth();
      const start = new Date(accountingStartDate || '2026-01-01');
      const startYear = isNaN(start.getFullYear()) ? 2026 : start.getFullYear();
      const startMonth = isNaN(start.getMonth()) ? 0 : start.getMonth();

      if (targetYear < startYear) return 12;
      if (targetYear === startYear) {
        if (targetYear === currentCalendarYear) {
          return Math.max(1, currentCalendarMonth - startMonth + 1);
        } else {
          return Math.max(1, 12 - startMonth);
        }
      }
      if (targetYear === currentCalendarYear) {
        return Math.max(1, currentCalendarMonth + 1);
      }
      return 12;
    }
  }, [selectedYearFilter, accountingStartDate]);

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
          const getNetDebt = (item: typeof a) => {
            const cBal = hideCarriedBalance ? 0 : (item.carriedBalance || 0);
            const netPeriodDebt = (item.financials.periodExpectedDues || 0) - (item.financials.monthlyPaid || 0) + (item.financials.otherCollectionsDebt || 0);
            return netPeriodDebt - cBal;
          };
          return sortOrder === 'asc'
            ? getNetDebt(a) - getNetDebt(b)
            : getNetDebt(b) - getNetDebt(a);
        }
      });
  }, [allDebtorsList, searchTerm, selectedActivity, sortBy, sortOrder, hideCarriedBalance]);

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

  // Screen floor groups (respects filters and strictly sorts units ascendingly)
  const floorDebtorGroups = useMemo(() => {
    const assignedResidentIds = new Set<string>();
    const groups: { floor: FloorConfig; debtors: typeof residentsWithDebt }[] = [];

    effectiveFloorConfigs.forEach((floor) => {
      const unitNumbers = getUnitNumbersForFloor(floor, residents);
      const floorDebtors = residentsWithDebt
        .filter(item => unitNumbers.some(u => isSameFlatNumber(u, item.resident.flatNumber)))
        .sort((a, b) => {
          if (sortBy === 'flat') {
            return sortOrder === 'asc'
              ? compareFlatNumbers(a.resident.flatNumber, b.resident.flatNumber)
              : compareFlatNumbers(b.resident.flatNumber, a.resident.flatNumber);
          }
          return 0; // maintain chosen sort if sorting by amount or name
        });
      floorDebtors.forEach(item => assignedResidentIds.add(item.resident.id));
      if (floorDebtors.length > 0) {
        groups.push({ floor, debtors: floorDebtors });
      }
    });

    const unassigned = residentsWithDebt
      .filter(item => !assignedResidentIds.has(item.resident.id))
      .sort((a, b) => {
        if (sortBy === 'flat') {
          return sortOrder === 'asc'
            ? compareFlatNumbers(a.resident.flatNumber, b.resident.flatNumber)
            : compareFlatNumbers(b.resident.flatNumber, a.resident.flatNumber);
        }
        return 0;
      });
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
  }, [effectiveFloorConfigs, residents, residentsWithDebt, sortBy, sortOrder]);

  // Complete floor groups for print (contains debtors for report, grouped by floor and strictly sorted ascending by unit)
  const allPrintFloorDebtorGroups = useMemo(() => {
    const assignedResidentIds = new Set<string>();
    const sourceDebtors = (selectedActivity !== 'all' || searchTerm.trim()) ? residentsWithDebt : allDebtorsList;
    const groups: { floor: FloorConfig; debtors: typeof sourceDebtors }[] = [];

    effectiveFloorConfigs.forEach((floor) => {
      const unitNumbers = getUnitNumbersForFloor(floor, residents);
      const floorDebtors = sourceDebtors
        .filter(item => unitNumbers.some(u => isSameFlatNumber(u, item.resident.flatNumber)))
        .sort((a, b) => compareFlatNumbers(a.resident.flatNumber, b.resident.flatNumber));
      floorDebtors.forEach(item => assignedResidentIds.add(item.resident.id));
      if (floorDebtors.length > 0) {
        groups.push({ floor, debtors: floorDebtors });
      }
    });

    const unassigned = sourceDebtors
      .filter(item => !assignedResidentIds.has(item.resident.id))
      .sort((a, b) => compareFlatNumbers(a.resident.flatNumber, b.resident.flatNumber));
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
  }, [effectiveFloorConfigs, residents, selectedActivity, searchTerm, residentsWithDebt, allDebtorsList]);

  const handleCopyConsolidatedReport = () => {
    if (residentsWithDebt.length === 0) return;

    const yearLabel = selectedYearFilter === 'all' 
      ? (activePeriod ? `للفترة المحاسبية: ${activePeriod.name} (${formatPeriodDateRange(activePeriod.startDate, activePeriod.endDate)})` : 'شامل لكافة الفترات المحاسبية المقيدة') 
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
      if (item.financials.unpaidMonthsCount > 0) {
        text += `\n   • متأخرات اشتراك شهري: تأخير ${item.financials.unpaidMonthsCount} شهور (${Math.round(item.financials.unpaidMonthsDues).toLocaleString()} ج.م)`;
      } else {
        text += `\n   • الاشتراكات الشهرية: مسددة بالكامل (لا توجد متأخرات اشتراك شهري)`;
      }
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
    defaultText += `نحيط سيادتكم علماً ببيان وتفصيل المبالغ المتأخرة على الوحدة رقم (${flatNumber}):\n`;
    if (unpaidMonthsCount > 0) {
      defaultText += `• متأخرات اشتراك شهري: تأخير ${unpaidMonthsCount} شهور (المبلغ المتأخر: ${Math.round(unpaidMonthsDues).toLocaleString()} ج.م - اشتراك شهري: ${monthlyFee} ج.م)\n`;
    } else {
      defaultText += `• الاشتراكات الشهرية: مسددة بالكامل حتى تاريخه ✓\n`;
    }
    if (oldDebt > 0) {
      defaultText += `• مديونيات قديمة ومرحلة: ${oldDebt.toLocaleString()} ج.م\n`;
    }
    defaultText += `💰 *إجمالي المبالغ المتأخرة المستحقة للسداد:* *${debtAmount.toLocaleString()} جنيه مصري* (مجموع المتأخرات الحالية + مجموع المديونيات القديمة)\n\n`;
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
    const prevDebt = carriedBalance < 0 ? Math.abs(carriedBalance) : (carriedBalance > 0 ? -carriedBalance : 0);
    const rowDebt = Math.max(0, prevDebt + (financials.unpaidMonthsDues || 0) + (financials.otherCollectionsDebt || 0));
    const debtAmount = Math.round(rowDebt || Math.abs(financials.netBalance));
    const currentMonthNum = new Date().getMonth() + 1;
    const currentYearNum = currentYear || new Date().getFullYear();
    const oldDebt = carriedBalance < 0 ? Math.abs(carriedBalance) : 0;

    const claimBreakdown = calculateUnitClaimBreakdown(
      resident,
      payments,
      currentYearNum,
      currentMonthNum,
      activePeriod?.startDate || accountingStartDate,
      config?.defaultMonthlyFee,
      config?.activityDefaultFees
    );

    const isCurrentMonthSubscriptionPaid = claimBreakdown.isCurrentMonthSubsPaid;
    const currentMonthStatusText = claimBreakdown.currentMonthSubsStatusText;
    const delayedMonthsCount = claimBreakdown.monthlyDelayedMonthsCount;
    const delayedMonthsDues = claimBreakdown.monthlyDelayedAmount;

    // Check unpaid other collections
    const unitOtherPayments = payments.filter(p => 
      (isSameFlatNumber(p.flatNumber, resident.flatNumber) || p.residentId === resident.id) &&
      !isMonthlySubscriptionType(p.paymentType)
    );

    const unpaidOtherPayments = unitOtherPayments.filter(p => 
      p.status === 'pending' || p.status === 'لم يتم التحصيل' || p.status === 'uncollected'
    );

    const otherDebtTotal = Math.round(financials.otherCollectionsDebt || unpaidOtherPayments.reduce((s, p) => s + (p.amount || 0), 0));

    const breakdownList = [
      { label: 'اشتراك شهري للوحدة', value: `${Math.round(claimBreakdown.currentMonthFee || financials.monthlyFee).toLocaleString()} ج.م` },
      { 
        label: `اشتراك الشهر الحالي (${monthNamesArabic[currentMonthNum - 1]} ${currentYearNum})`, 
        value: currentMonthStatusText,
        color: isCurrentMonthSubscriptionPaid ? '#047857' : '#b91c1c'
      },
      { 
        label: 'الشهور المتأخرة للاشتراك الشهري', 
        value: delayedMonthsCount > 0 
          ? `${delayedMonthsCount} شهور (المبلغ المتأخر: ${Math.round(delayedMonthsDues).toLocaleString()} ج.م)`
          : 'لا يوجد (مسدد بالكامل)'
      },
      ...(otherDebtTotal > 0 ? [{
        label: `مديونية تحصيلات أخرى (غير مسددة)${unpaidOtherPayments.length > 0 ? ` [${Array.from(new Set(unpaidOtherPayments.map(p => p.paymentType || 'بند مخصص'))).join('، ')}]` : ''}`,
        value: `${otherDebtTotal.toLocaleString()} ج.م`,
        color: '#b91c1c'
      }] : []),
      ...(oldDebt > 0 ? [{
        label: 'مديونية سابقة مرحلة',
        value: `${Math.round(oldDebt).toLocaleString()} ج.م`,
        color: '#b91c1c'
      }] : []),
      { label: 'إجمالي المسدد بالسنة', value: `${Math.round(financials.totalPaid).toLocaleString()} ج.م`, color: '#047857' },
      { label: 'إجمالي المبلغ المتأخر المطلوب', value: `${Math.round(debtAmount).toLocaleString()} ج.م`, isHighlight: true, color: '#b91c1c' }
    ];

    const histAct = getHistoricalActivityForDate(resident, `${currentYearNum}-${currentMonthNum}`, config?.defaultMonthlyFee, config?.activityDefaultFees, config?.activityFeePeriods);
    const historical = getHistoricalOccupantForDate(resident, `${currentYearNum}-${currentMonthNum}`);

    setClaimModalData({
      type: 'claim',
      unitNumber: resident.flatNumber,
      residentName: historical.ownerName || resident.name,
      tenantName: historical.tenantName !== undefined ? historical.tenantName : resident.tenantName,
      phone: historical.ownerPhone || resident.phone,
      tenantPhone: historical.tenantPhone || resident.tenantPhone,
      activityType: histAct.activityType || resident.activityType || 'سكني',
      occupancyType: (historical.tenantName || resident.tenantName) ? 'إيجار' : (resident.ownershipType || 'تمليك'),
      amount: debtAmount,
      month: currentMonthNum,
      year: currentYearNum,
      carriedBalance: carriedBalance,
      oldDebtAmount: oldDebt,
      monthlyFee: financials.monthlyFee,
      totalDues: financials.expectedDues,
      totalPaid: financials.totalPaid,
      unpaidMonthsCount: financials.unpaidMonthsCount,
      unpaidMonthsDues: financials.unpaidMonthsDues,
      currentMonthStatus: currentMonthStatusText,
      remainingBalance: debtAmount,
      breakdown: breakdownList,
      claimBreakdown: claimBreakdown
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
    <div className="space-y-4 sm:space-y-5 text-right" dir="rtl">
      {/* Active Accounting Period Scope Indicator in Debts Page */}
      <div className={`p-3 sm:p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs transition ${
        activePeriod 
          ? 'bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950 text-white border-blue-700' 
          : 'bg-white border-slate-200 text-slate-800'
      }`}>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`w-2.5 h-2.5 rounded-full ${activePeriod ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></span>
          <span className="text-xs font-bold opacity-90">نطاق احتساب المديونيات المعروضة:</span>
          <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black ${activePeriod ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-950 border border-blue-200'}`}>
            {activePeriod ? activePeriod.name : 'جميع الفترات المحاسبية (كافة السنوات المقيدة)'}
          </span>
          <span className={`text-[11px] font-bold ${activePeriod ? 'text-amber-300' : 'text-slate-500'}`}>
            {activePeriod 
              ? `(تظهر مديونيات ${formatPeriodDateRange(activePeriod.startDate, activePeriod.endDate)} فقط)`
              : '(تظهر مديونيات كافة الفترات والسنوات مجمعة)'}
          </span>
        </div>

        {activePeriod && (
          <span className="text-[11px] font-mono text-blue-200 bg-white/10 px-2 py-0.5 rounded-md self-start sm:self-auto" dir="rtl">
            {formatPeriodDateRange(activePeriod.startDate, activePeriod.endDate, true)}
          </span>
        )}
      </div>

      {/* Top Banner Stats - 3 Compact Cards in 1 Single Row */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
        {/* Card 1: Total Debt */}
        <div className="bg-red-50/90 border border-red-100 rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[9px] sm:text-xs font-black text-red-950 truncate">إجمالي المديونيات</span>
            <div className="w-5 h-5 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <TrendingDown className="w-3 h-3 sm:w-5 sm:h-5 stroke-[2.5]" />
            </div>
          </div>
          <div>
            <span className="text-[11px] sm:text-2xl font-black text-red-700 block truncate" dir="ltr">
              {Math.round(stats.totalDebt).toLocaleString()} <span className="text-[8px] sm:text-xs font-bold text-red-900">ج.م</span>
            </span>
            <span className="text-[8px] sm:text-[10px] text-red-900/90 font-bold block truncate mt-0.5">
              {selectedYearFilter === 'all' 
                ? (activePeriod ? `فترة: ${activePeriod.name}` : 'كافة الفترات والسنوات') 
                : `سنة ${selectedYearFilter}`}
            </span>
          </div>
        </div>

        {/* Card 2: Debtors Count */}
        <div className="bg-amber-50/90 border border-amber-100 rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[9px] sm:text-xs font-black text-amber-950 truncate">الوحدات المدينة</span>
            <div className="w-5 h-5 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-3 h-3 sm:w-5 sm:h-5 stroke-[2.5]" />
            </div>
          </div>
          <div>
            <span className="text-[11px] sm:text-2xl font-black text-amber-800 block truncate">
              {stats.totalDebtorsCount} <span className="text-[8px] sm:text-xs font-bold text-amber-950">وحدة</span>
            </span>
            <span className="text-[8px] sm:text-[10px] text-amber-900/90 font-bold block truncate mt-0.5">
              من {residents.length} وحدة
            </span>
          </div>
        </div>

        {/* Card 3: Highest Debtor */}
        <div className="bg-blue-50/90 border border-blue-100 rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[9px] sm:text-xs font-black text-blue-950 truncate">أعلى مديونية</span>
            <div className="w-5 h-5 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
              <Building className="w-3 h-3 sm:w-5 sm:h-5 stroke-[2.5]" />
            </div>
          </div>
          <div>
            {stats.maxDebtItem ? (
              <>
                <span className="text-[11px] sm:text-xl font-black text-blue-900 block truncate" dir="ltr">
                  {Math.round(Math.abs(stats.maxDebtItem.financials.netBalance)).toLocaleString()} <span className="text-[8px] sm:text-xs font-bold text-blue-800">ج.م</span>
                </span>
                <span className="text-[8px] sm:text-[10px] text-blue-900/90 font-black block truncate mt-0.5">
                  وحدة {stats.maxDebtItem.resident.flatNumber}
                </span>
              </>
            ) : (
              <>
                <span className="text-[11px] sm:text-base font-black text-emerald-700 block">0 ج.م</span>
                <span className="text-[8px] sm:text-[10px] text-slate-400 font-bold block">لا توجد</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Automatic Carried Balance Notice Bar - Sleek & Compact */}
      <div className="bg-gradient-to-l from-blue-900 via-indigo-900 to-blue-950 text-white px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl shadow-xs flex flex-row items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 sm:w-7 sm:h-7 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs sm:text-sm font-black truncate">ترحيل الأرصدة السابقة</span>
              <span className="bg-emerald-500 text-white text-[8px] sm:text-[9px] font-black px-1.5 py-0.2 rounded-md">آلي مفعل</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setHideCarriedBalance(!hideCarriedBalance)}
            className={`p-2 active:scale-95 rounded-xl transition flex items-center justify-center cursor-pointer shrink-0 shadow-2xs border ${
              hideCarriedBalance 
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-400' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500'
            }`}
            title={hideCarriedBalance ? 'إظهار الرصيد السابق وحساب التراكمي' : 'إخفاء الرصيد السابق وحساب الفترة الحالية فقط'}
          >
            {hideCarriedBalance ? (
              <Eye className="w-4 h-4 text-slate-950" />
            ) : (
              <EyeOff className="w-4 h-4 text-white" />
            )}
          </button>

          {role === 'ADMIN' && onSetAllResidents && (
            <button
              onClick={() => setShowExportModal(true)}
              className="px-2.5 py-1.5 bg-white/15 hover:bg-white/25 active:scale-95 text-white border border-white/20 rounded-xl text-[10px] sm:text-xs font-black transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs whitespace-nowrap"
              title="تثبيت تصدير الأرصدة لسنة مالية قادمة"
            >
              <RefreshCw className="w-3 h-3 text-amber-300" />
              <span>تثبيت التصدير</span>
            </button>
          )}
        </div>
      </div>

      {/* Search, View Modes, Activity Dropdown & Year Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-100 p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-2.5">
          
          {/* Right: Search Input + View Mode Toggle */}
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
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
                title="عرض جدول مفصل"
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

          {/* Activity Dropdown Filter & Fiscal Year Selector (Always in 1 Row) */}
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2 w-full lg:w-auto items-center">
            {/* Activity Dropdown Filter */}
            <div className="flex items-center justify-between gap-1 bg-slate-50 border border-slate-200/80 rounded-xl px-2 py-1.5 text-xs min-w-0">
              <div className="flex items-center gap-1 text-slate-500 shrink-0">
                <Filter className="w-3 h-3 text-blue-900 shrink-0" />
                <span className="text-[9px] sm:text-[10px] font-black shrink-0">النشاط:</span>
              </div>
              <select
                value={selectedActivity}
                onChange={(e) => setSelectedActivity(e.target.value)}
                className="bg-transparent text-slate-800 text-[10.5px] sm:text-xs font-black outline-none cursor-pointer truncate w-full pr-0.5 text-left"
              >
                <option value="all">الكل ({allDebtorsList.length})</option>
                {availableActivityTypes.map((act) => {
                  const count = allDebtorsList.filter(d => d.resident.activityType === act).length;
                  return (
                    <option key={act} value={act}>
                      {act} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Fiscal Year Selector */}
            <div className="flex items-center justify-between gap-1 bg-slate-50 border border-slate-200/80 rounded-xl p-1 text-xs min-w-0 overflow-x-auto">
              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 px-1 flex items-center gap-0.5 shrink-0">
                <Calendar className="w-3 h-3 text-blue-900 shrink-0" />
                <span>السنة:</span>
              </span>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => setSelectedYearFilter('all')}
                  className={`px-1.5 py-1 rounded-lg text-[9.5px] sm:text-[10px] font-black transition cursor-pointer shrink-0 ${
                    selectedYearFilter === 'all'
                      ? 'bg-blue-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  الكل
                </button>

                {availableYears.map(yr => (
                  <button
                    key={yr}
                    onClick={() => setSelectedYearFilter(yr)}
                    className={`px-1.5 py-1 rounded-lg text-[9.5px] sm:text-[10px] font-black transition cursor-pointer shrink-0 ${
                      selectedYearFilter === yr
                        ? 'bg-blue-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions - 4 Equal Width Buttons in 1 Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full pt-2 border-t border-slate-100">
          {/* Instant Recalculate & Refresh */}
          <button
            onClick={handleInstantRefresh}
            disabled={isRefreshing}
            className={`w-full py-2 px-1 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs ${
              isRefreshing 
                ? 'bg-blue-100 text-blue-900 border border-blue-300' 
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}
            title="تحديث كشف المديونيات وإعادة احتساب حالات السداد والمتأخرات فورياً"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin text-blue-700' : 'text-emerald-600'}`} />
            <span className="truncate">{isRefreshing ? 'جاري الاحتساب...' : 'تحديث واحتساب فوري'}</span>
          </button>

          {/* WhatsApp Group Report */}
          <button
            onClick={handleCopyConsolidatedReport}
            disabled={residentsWithDebt.length === 0}
            className={`w-full py-2 px-1 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs ${copied ? 'bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
          >
            {copied ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">تم النسخ!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">نسخ الكشف</span>
              </>
            )}
          </button>

          {/* Generate Image Button */}
          <button
            onClick={handleGenerateImage}
            disabled={residentsWithDebt.length === 0 || isGeneratingImage}
            className="w-full py-2 px-1 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
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
            className="w-full py-2 px-1 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">طباعة الكشف</span>
          </button>
        </div>
      </div>

      {/* Main Table View (Exactly matching ResidentsList table columns + Debts columns) */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse min-w-[620px]">
              <thead>
                <tr className="bg-slate-50/90 text-slate-500 font-extrabold text-[10px] border-b border-slate-200">
                  {/* Unit Number - Sticky */}
                  <th 
                    onClick={() => toggleSort('flat')}
                    className="w-12 sm:w-14 px-1 py-1.5 sticky right-0 bg-slate-50 shadow-xs z-10 border-l border-slate-200 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap text-center text-[10px]"
                  >
                    <div className="flex items-center gap-0.5 justify-center">
                      <span>الوحدة</span>
                      <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                    </div>
                  </th>
                  
                  {/* Owner & Tenant Combined */}
                  <th 
                    onClick={() => toggleSort('name')}
                    className="min-w-[95px] max-w-[130px] px-1.5 py-1.5 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap text-[10px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>المالك / المستأجر</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  {/* Activity Type */}
                  <th className="w-14 sm:w-16 px-1 py-1.5 text-center whitespace-nowrap text-[10px]">النشاط</th>

                  {/* Carried Previous Balance (Exported from previous years) */}
                  {!hideCarriedBalance && (
                    <th className="w-16 sm:w-20 px-1 py-1.5 text-center whitespace-nowrap text-[10px]">
                      {selectedYearFilter !== 'all' && selectedYearFilter > startYear 
                        ? `رصيد (${selectedYearFilter - 1})` 
                        : 'رصيد سابق'}
                    </th>
                  )}

                  {/* المستحقات - إجمالي الاشتراكات الشهرية المستحقة خلال الفترة */}
                  <th className="min-w-[95px] max-w-[130px] px-1.5 py-1.5 text-center whitespace-nowrap text-[10px]">
                    المستحقات
                  </th>

                  {/* المسدد - مجموع الاشتراكات الشهرية المسددة */}
                  <th className="w-16 sm:w-20 px-1 py-1.5 text-center whitespace-nowrap text-[10px]">
                    المسدد
                  </th>

                  {/* تحصيلات أخرى (مسدد وغير مسدد) */}
                  <th className="min-w-[90px] max-w-[125px] px-1.5 py-1.5 text-center whitespace-nowrap text-[10px]">
                    تحصيلات أخرى
                  </th>

                  {/* Net Debt (Sorted) */}
                  <th 
                    onClick={() => toggleSort('amount')}
                    className="w-20 sm:w-22 px-1 py-1.5 text-center cursor-pointer hover:bg-slate-100 transition text-red-900 whitespace-nowrap text-[10px]"
                  >
                    <div className="flex items-center justify-center gap-0.5 font-black">
                      <span>صافي الدين</span>
                      <ArrowUpDown className="w-2.5 h-2.5 text-red-500" />
                    </div>
                  </th>

                  {/* Notes */}
                  <th className="min-w-[70px] max-w-[100px] px-1.5 py-1.5 whitespace-nowrap text-[10px]">ملاحظات</th>

                  {/* Quick Contact & Reminders */}
                  {role !== 'RESIDENT' && (
                    <th className="w-16 sm:w-20 px-0.5 py-1 text-center whitespace-nowrap text-[10px]">تواصل</th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                {residentsWithDebt.length === 0 ? (
                  <tr>
                    <td colSpan={role !== 'RESIDENT' ? (hideCarriedBalance ? 9 : 10) : (hideCarriedBalance ? 8 : 9)} className="px-4 py-12 text-center text-slate-400 font-bold">
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
                        <td colSpan={role !== 'RESIDENT' ? (hideCarriedBalance ? 9 : 10) : (hideCarriedBalance ? 8 : 9)} className="py-2.5 px-4 text-right border-r-4 border-r-blue-700 dark:border-r-blue-400 sticky right-0 z-5 bg-slate-200/95 dark:bg-[#16223b]/95">
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
                        const cBal = hideCarriedBalance ? 0 : (carriedBalance || 0);
                        const netPeriodDebt = (financials.periodExpectedDues || 0) - (financials.monthlyPaid || 0) + (financials.otherCollectionsDebt || 0);
                        const calculatedNetDebt = netPeriodDebt - cBal;
                        const isSurplus = calculatedNetDebt < 0 || (financials.monthlyPaid > financials.periodExpectedDues && financials.otherCollectionsDebt === 0 && cBal >= 0);
                        const debtAmount = Math.max(0, Math.round(calculatedNetDebt));
                        const surplusAmount = Math.max(0, Math.round(-calculatedNetDebt));

                        const displayNotes = (resident.notes || '').includes('توليد تلقائي') ? '' : (resident.notes || '');
                        const historical = getHistoricalOccupantForDate(resident, selectedYearFilter === 'all' ? currentYear : selectedYearFilter);
                        const histAct = getHistoricalActivityForDate(resident, selectedYearFilter === 'all' ? currentYear : selectedYearFilter, config?.defaultMonthlyFee, config?.activityDefaultFees, config?.activityFeePeriods);
                        const ownerName = historical.ownerName || resident.name;
                        const tenantName = historical.tenantName !== undefined ? historical.tenantName : (resident.ownershipType === 'إيجار' ? resident.tenantName : '');
                        const hasTenant = Boolean(tenantName && tenantName.trim());

                        const isSelected = selectedItemId === resident.id;

                        return (
                          <tr 
                            key={resident.id} 
                            onClick={() => setSelectedItemId(isSelected ? null : resident.id)}
                            className={`group transition cursor-pointer ${
                              isSelected 
                                ? 'bg-yellow-200 hover:bg-yellow-200/90 border-y-2 border-yellow-400 font-semibold text-slate-900' 
                                : isSurplus
                                ? 'bg-emerald-50/80 hover:bg-emerald-100/90 border-y border-emerald-200/80 text-slate-900'
                                : 'hover:bg-red-50/20'
                            }`}
                          >
                            {/* Unit Number - Sticky */}
                            <td className={`w-12 sm:w-14 px-1 py-1.5 font-black whitespace-nowrap sticky right-0 z-5 border-l border-slate-100 shadow-xs text-center transition ${
                              isSelected 
                                ? 'bg-yellow-200 text-amber-950 font-black' 
                                : isSurplus
                                ? 'bg-emerald-100/90 text-emerald-950 font-black'
                                : 'bg-white group-hover:bg-slate-50 text-blue-900'
                            }`}>
                              <span className="text-[10px] sm:text-xs">وحدة {resident.flatNumber}</span>
                            </td>

                            {/* Owner & Tenant Combined (No phone numbers) */}
                            <td className="min-w-[95px] max-w-[130px] px-1.5 py-1.5 whitespace-nowrap">
                              <div className="flex flex-col gap-0.5 justify-center">
                                <div className="flex items-center gap-1">
                                  <span className="font-bold text-slate-900 text-xs truncate max-w-[110px]">{ownerName}</span>
                                </div>
                                {hasTenant && (
                                  <div className="flex items-center gap-1 text-amber-950 font-bold text-[9.5px] pt-0.5 border-t border-slate-100">
                                    <span className="text-[7.5px] font-black bg-amber-100 text-amber-900 px-1 py-0.2 rounded border border-amber-200/80">مستأجر</span>
                                    <span className="truncate max-w-[95px]">{tenantName}</span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Activity Type */}
                            <td className="w-14 sm:w-16 px-1 py-1.5 text-center whitespace-nowrap">
                              <span className="px-1.5 py-0.2 bg-slate-50 text-slate-700 rounded text-[8.5px] font-extrabold border border-slate-200">
                                {histAct.activityType || resident.activityType}
                              </span>
                            </td>

                            {/* Carried Previous Balance */}
                            {!hideCarriedBalance && (
                              <td className="w-16 sm:w-20 px-1 py-1.5 text-center whitespace-nowrap">
                                {carriedBalance < 0 ? (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.2 bg-rose-50 text-rose-700 border border-rose-200 rounded font-black text-[10px]" dir="ltr">
                                    <ArrowDownRight className="w-2.5 h-2.5" />
                                    <span>-{Math.abs(carriedBalance).toLocaleString()} ج.م</span>
                                  </span>
                                ) : carriedBalance > 0 ? (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-black text-[10px]" dir="ltr">
                                    <ArrowUpRight className="w-2.5 h-2.5" />
                                    <span>+{carriedBalance.toLocaleString()} ج.م</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-300 font-normal text-xs">—</span>
                                )}
                              </td>
                            )}

                            {/* المستحقات - إجمالي الاشتراكات الشهرية المستحقة خلال الفترة مع التفصيل */}
                            <td className="min-w-[95px] max-w-[130px] px-1.5 py-1.5 text-center whitespace-nowrap">
                              <div className="flex flex-col items-center">
                                <span className="font-black text-slate-800 text-xs">
                                  {Math.round(financials.periodExpectedDues || 0).toLocaleString()} ج.م
                                </span>
                                <span className="text-[8.5px] font-semibold text-slate-500 whitespace-nowrap" dir="rtl">
                                  {financials.expectedDuesBreakdownText}
                                </span>
                              </div>
                            </td>

                            {/* المسدد - مجموع الاشتراكات الشهرية المسددة */}
                            <td className="w-16 sm:w-20 px-1 py-1.5 text-center whitespace-nowrap">
                              <span className="text-emerald-700 font-black text-xs">
                                {Math.round(financials.monthlyPaid || 0).toLocaleString()} ج.م
                              </span>
                            </td>

                            {/* تحصيلات أخرى (المسدد وتحته باللون الأحمر غير المسدد) */}
                            <td className="min-w-[90px] max-w-[125px] px-1.5 py-1.5 text-center whitespace-nowrap">
                              <div className="flex flex-col items-center">
                                <span className="text-blue-900 dark:text-blue-400 font-black text-xs">
                                  {financials.otherCollectionsPaid > 0
                                    ? `${Math.round(financials.otherCollectionsPaid).toLocaleString()} ج.م`
                                    : '0 ج.م'}
                                </span>
                                {financials.otherCollectionsDebt > 0 ? (
                                  <span className="text-[8.5px] font-bold text-rose-600 whitespace-nowrap">
                                    {Math.round(financials.otherCollectionsDebt).toLocaleString()} ج.م غير مسدد
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-medium text-slate-400">
                                    لا يوجد غير مسدد
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* صافي الدين */}
                            <td className={`w-20 sm:w-22 px-1 py-1.5 text-center font-black transition-all text-xs whitespace-nowrap border-x ${
                              isSelected 
                                ? 'bg-yellow-300/60 border-yellow-400 text-slate-950' 
                                : isSurplus
                                ? 'text-emerald-700 bg-emerald-100/90 group-hover:bg-emerald-200/90 border-emerald-200'
                                : 'text-rose-700 bg-rose-50/70 group-hover:bg-rose-100/80 border-rose-100'
                            }`}>
                              {isSurplus ? (
                                <span dir="ltr">+{surplusAmount.toLocaleString()} ج.م</span>
                              ) : (
                                <span dir="ltr">-{debtAmount.toLocaleString()} ج.م</span>
                              )}
                            </td>

                            {/* Notes */}
                            <td className="min-w-[70px] max-w-[100px] px-1.5 py-1.5 text-slate-500 font-semibold text-[10.5px] truncate" title={displayNotes}>
                              {displayNotes || '—'}
                            </td>

                            {/* Actions & Quick Contact */}
                            {role !== 'RESIDENT' && (
                              <td className="w-16 sm:w-20 px-0.5 py-1 text-center whitespace-nowrap">
                                {(() => {
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
                  <tr className="bg-red-50/90 border-t-2 border-red-300 font-extrabold text-slate-900">
                    <td className="px-3 py-3.5 text-blue-900 font-black whitespace-nowrap sticky right-0 z-5 bg-red-50 shadow-xs border-l border-slate-100">
                      الإجمالي
                    </td>
                    <td className="px-3 py-3.5 font-black text-slate-800 whitespace-nowrap">
                      ({residentsWithDebt.length} وحدة متأخرة)
                    </td>
                    <td className="px-3 py-3.5 text-center text-slate-400 font-bold whitespace-nowrap">—</td>
                    {/* رصيد سابق مرحل */}
                    {!hideCarriedBalance && (
                      <td className="px-3 py-3.5 text-center font-black whitespace-nowrap">
                        {(() => {
                          const totalCarried = residentsWithDebt.reduce((s, r) => s + (r.carriedBalance || 0), 0);
                          if (totalCarried < 0) return <span className="text-rose-700" dir="ltr">-{Math.abs(Math.round(totalCarried)).toLocaleString()} ج.م</span>;
                          if (totalCarried > 0) return <span className="text-emerald-700" dir="ltr">+{Math.round(totalCarried).toLocaleString()} ج.م</span>;
                          return <span className="text-slate-300">—</span>;
                        })()}
                      </td>
                    )}
                    {/* المستحقات */}
                    <td className="px-3 py-3.5 text-center text-slate-800 font-black whitespace-nowrap">
                      {Math.round(residentsWithDebt.reduce((s, r) => s + (r.financials.periodExpectedDues || 0), 0)).toLocaleString()} ج.م
                    </td>
                    {/* المسدد */}
                    <td className="px-3 py-3.5 text-center text-emerald-700 font-black whitespace-nowrap">
                      {Math.round(residentsWithDebt.reduce((s, r) => s + (r.financials.monthlyPaid || 0), 0)).toLocaleString()} ج.م
                    </td>
                    {/* تحصيلات أخرى */}
                    <td className="px-3 py-3.5 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center">
                        <span className="text-blue-900 font-black text-xs">
                          {Math.round(residentsWithDebt.reduce((s, r) => s + (r.financials.otherCollectionsPaid || 0), 0)).toLocaleString()} ج.م
                        </span>
                        <span className="text-[9px] font-bold text-rose-600">
                          {Math.round(residentsWithDebt.reduce((s, r) => s + (r.financials.otherCollectionsDebt || 0), 0)).toLocaleString()} غير مسدد
                        </span>
                      </div>
                    </td>
                    {/* صافي الدين */}
                    <td className="px-3 py-3.5 text-center text-rose-700 font-black text-xs sm:text-sm whitespace-nowrap bg-rose-100/90 shadow-2xs border-x border-rose-200" dir="ltr">
                      -{Math.round(residentsWithDebt.reduce((sum, item) => {
                        const cB = hideCarriedBalance ? 0 : (item.carriedBalance || 0);
                        const nP = (item.financials.periodExpectedDues || 0) - (item.financials.monthlyPaid || 0) + (item.financials.otherCollectionsDebt || 0);
                        return sum + Math.max(0, nP - cB);
                      }, 0)).toLocaleString()} ج.م
                    </td>
                    <td className="px-3 py-3.5 text-center text-slate-400 whitespace-nowrap">—</td>
                    {role !== 'RESIDENT' && (
                      <td className="px-3 py-3.5 text-center text-slate-400 whitespace-nowrap">—</td>
                    )}
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
                    const cBal = hideCarriedBalance ? 0 : (carriedBalance || 0);
                    const netPeriodDebt = (financials.periodExpectedDues || 0) - (financials.monthlyPaid || 0) + (financials.otherCollectionsDebt || 0);
                    const calculatedNetDebt = netPeriodDebt - cBal;
                    const isSurplus = calculatedNetDebt < 0 || (financials.monthlyPaid > financials.periodExpectedDues && financials.otherCollectionsDebt === 0 && cBal >= 0);
                    const debtAmount = Math.max(0, Math.round(calculatedNetDebt));
                    const surplusAmount = Math.max(0, Math.round(-calculatedNetDebt));

                    const displayNotes = (resident.notes || '').includes('توليد تلقائي') ? '' : (resident.notes || '');
                    const histAct = getHistoricalActivityForDate(resident, selectedYearFilter === 'all' ? currentYear : selectedYearFilter, config?.defaultMonthlyFee, config?.activityDefaultFees, config?.activityFeePeriods);
                    const isSelected = selectedItemId === resident.id;

                    return (
                      <div
                        key={resident.id}
                        onClick={() => setSelectedItemId(isSelected ? null : resident.id)}
                        className={`rounded-2xl p-4 shadow-xs space-y-3 transition flex flex-col justify-between cursor-pointer ${
                          isSelected 
                            ? 'bg-yellow-200 border-2 border-yellow-400 shadow-md ring-2 ring-yellow-400 text-slate-900' 
                            : isSurplus
                            ? 'bg-white border-2 border-emerald-200 hover:border-emerald-300'
                            : 'bg-white border-2 border-red-100 hover:border-red-200'
                        }`}
                      >
                        <div className="space-y-2.5">
                          {/* Unit Number & Activity */}
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                            <span className="text-sm font-black text-blue-950 bg-blue-50 px-3 py-1 rounded-xl border border-blue-100">
                              وحدة {resident.flatNumber}
                            </span>
                            <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-slate-50 text-slate-700 rounded-lg border border-slate-100">
                              {histAct.activityType || resident.activityType} ({resident.ownershipType || 'تمليك'})
                            </span>
                          </div>

                          {/* Owner Details */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500 font-bold">المالك:</span>
                              <span className="font-black text-slate-900">{resident.name}</span>
                            </div>
                          </div>

                          {/* Tenant Details (if rental) */}
                          {resident.ownershipType === 'إيجار' && resident.tenantName && (
                            <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-100/80 space-y-1 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-amber-900 font-bold text-[11px]">المستأجر:</span>
                                <span className="font-black text-amber-950">{resident.tenantName}</span>
                              </div>
                            </div>
                          )}

                          {/* Financial Breakdown Box */}
                          <div className="p-2.5 bg-slate-50/90 rounded-xl border border-slate-100 space-y-1.5 text-[11px]">
                            {/* المستحقات */}
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-bold">المستحقات (اشتراكات):</span>
                              <div className="text-left">
                                <span className="font-black text-slate-800">{Math.round(financials.periodExpectedDues || 0).toLocaleString()} ج.م</span>
                                <span className="block text-[8.5px] text-slate-500 font-medium" dir="rtl">{financials.expectedDuesBreakdownText}</span>
                              </div>
                            </div>

                            {/* المسدد */}
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-bold">المسدد (اشتراكات):</span>
                              <span className="font-bold text-emerald-700" dir="ltr">
                                {Math.round(financials.monthlyPaid || 0).toLocaleString()} ج.م {financials.paidMonthsCount > 0 ? `(${financials.paidMonthsCount} شهر)` : ''}
                              </span>
                            </div>

                            {/* رصيد سابق مرحل */}
                            {!hideCarriedBalance && (
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
                            )}

                            {/* تحصيلات أخرى */}
                            <div className="flex items-center justify-between text-blue-950 bg-blue-50/80 px-2 py-1 rounded-lg border border-blue-200/70">
                              <span className="font-bold">تحصيلات أخرى:</span>
                              <div className="text-left">
                                <span className="font-black text-blue-900">{Math.round(financials.otherCollectionsPaid || 0).toLocaleString()} ج.م مسدد</span>
                                {financials.otherCollectionsDebt > 0 && (
                                  <span className="block text-[9.5px] font-bold text-rose-600">
                                    {Math.round(financials.otherCollectionsDebt).toLocaleString()} ج.م غير مسدد
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Net Debt Highlight */}
                            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/80">
                              <span className={isSurplus ? "text-emerald-950 font-black text-xs" : "text-rose-950 font-black text-xs"}>
                                {isSurplus ? 'صافي الرصيد (فائض):' : 'صافي المديونية:'}
                              </span>
                              {isSurplus ? (
                                <span className="inline-flex items-center gap-0.5 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-black text-xs" dir="ltr">
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                  <span>+{surplusAmount.toLocaleString()} ج.م</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-black text-xs" dir="ltr">
                                  <ArrowDownRight className="w-3.5 h-3.5" />
                                  <span>-{debtAmount.toLocaleString()} ج.م</span>
                                </span>
                              )}
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

      {/* Explanatory Note on Calculations and Collection Types */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-2xs">
        <HelpCircle className="w-5 h-5 text-blue-900 shrink-0 mt-0.5" />
        <div className="text-[11px] text-slate-700 font-semibold leading-relaxed text-right space-y-2 flex-1">
          <p className="font-black text-slate-900 text-xs sm:text-sm">
            📌 توضيح أنواع التحصيل وقواعد احتساب المديونيات والأرصدة:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="bg-white p-3 rounded-xl border border-blue-100 space-y-1">
              <span className="text-blue-950 font-black block text-xs">١. المستحقات والمسدد (اشتراكات):</span>
              <p className="text-slate-600 leading-normal">
                عمود <span className="text-blue-900 font-black">المستحقات</span> هو إجمالي الاشتراكات الشهرية المستحقة للفترة مع تفصيل الشهور والتسعير، وعمود <span className="text-emerald-700 font-black">المسدد</span> هو مجموع الاشتراكات الشهرية المسددة فعلياً.
              </p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-amber-100 space-y-1">
              <span className="text-amber-950 font-black block text-xs">٢. تحصيلات أخرى (مسدد / غير مسدد):</span>
              <p className="text-slate-600 leading-normal">
                تشمل المصعد والصيانة والطوارئ؛ يظهر <span className="text-blue-900 font-black">المسدد</span> منها بالأعلى، وتحته باللون الأحمر <span className="text-rose-700 font-black">غير المسدد</span> كمديونية إضافية مستقلة.
              </p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-rose-100 space-y-1">
              <span className="text-rose-950 font-black block text-xs">٣. معادلة صافي الدين:</span>
              <p className="text-slate-600 leading-normal">
                صافي الدين = (<span className="text-blue-900 font-black">المستحق</span> - <span className="text-emerald-700 font-black">المسدد</span>) + <span className="text-rose-700 font-black">تحصيلات أخرى غير مسددة</span> (+ رصيد سابق مرحل إن وُجد).
              </p>
            </div>
          </div>
          <p className="text-[10.5px] text-slate-500 pt-1">
            • <span className="font-bold text-slate-700">الترحيل والتصدير التلقائي:</span> يتم ترحيل صافي الرصيد الختامي لكل وحدة تلقائياً كرصيد سابق مرحل في السنوات المالية التالية لضمان دقة واستمرارية السجلات.
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
      <div id="debts-printable-area" className="printable-area hidden text-right p-6 font-sans" dir="rtl">
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
        {(() => {
          const printSourceDebtors = (selectedActivity !== 'all' || searchTerm.trim()) ? residentsWithDebt : allDebtorsList;
          const printReportDebtTotal = printSourceDebtors.reduce((sum, item) => {
            const cB = hideCarriedBalance ? 0 : (item.carriedBalance || 0);
            const nP = (item.financials.periodExpectedDues || 0) - (item.financials.monthlyPaid || 0) + (item.financials.otherCollectionsDebt || 0);
            return sum + Math.max(0, nP - cB);
          }, 0);
          const printReportDebtorsCount = printSourceDebtors.filter(item => {
            const cB = hideCarriedBalance ? 0 : (item.carriedBalance || 0);
            const nP = (item.financials.periodExpectedDues || 0) - (item.financials.monthlyPaid || 0) + (item.financials.otherCollectionsDebt || 0);
            return (nP - cB) > 0;
          }).length;

          return (
            <div className="grid grid-cols-3 gap-4 border border-slate-300 rounded-xl p-4 bg-slate-50/50 mb-6 text-xs">
              <div className="text-center space-y-1">
                <span className="font-extrabold text-slate-500">إجمالي المديونيات المستحقة</span>
                <div className="text-base font-black text-red-700">{Math.round(printReportDebtTotal).toLocaleString()} ج.م</div>
              </div>
              <div className="text-center space-y-1 border-x border-slate-300">
                <span className="font-extrabold text-slate-500">عدد الشقق والوحدات المتأخرة</span>
                <div className="text-base font-black text-slate-800">{printReportDebtorsCount} وحدة</div>
              </div>
              <div className="text-center space-y-1">
                <span className="font-extrabold text-slate-500">متوسط المديونية الشهري</span>
                <div className="text-base font-black text-blue-950">
                  {recordedDebtMonthsCount > 0 ? Math.round(printReportDebtTotal / recordedDebtMonthsCount).toLocaleString() : 0} ج.م
                </div>
              </div>
            </div>
          );
        })()}

        {/* Detailed Table for Print */}
        <table className="w-full text-right border-collapse border border-slate-400 text-xs mb-8">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-400">
              <th className="border border-slate-400 p-2 text-center">الوحدة</th>
              <th className="border border-slate-400 p-2">المالك / المستأجر</th>
              <th className="border border-slate-400 p-2 text-center">النشاط</th>
              {!hideCarriedBalance && (
                <th className="border border-slate-400 p-2 text-center">رصيد سابق مرحل</th>
              )}
              <th className="border border-slate-400 p-2 text-center">المستحقات</th>
              <th className="border border-slate-400 p-2 text-center">المسدد</th>
              <th className="border border-slate-400 p-2 text-center">تحصيلات أخرى</th>
              <th className="border border-slate-400 p-2 text-center bg-red-50 text-red-900 font-extrabold">صافي المديونية</th>
            </tr>
          </thead>
          <tbody>
            {allPrintFloorDebtorGroups.length === 0 ? (
              <tr>
                <td colSpan={hideCarriedBalance ? 7 : 8} className="border border-slate-400 p-6 text-center text-slate-400 font-bold">
                  لا توجد أي مديونيات متأخرة على الوحدات.
                </td>
              </tr>
            ) : (
              allPrintFloorDebtorGroups.map((group) => (
                <React.Fragment key={group.floor.id}>
                  <tr className="bg-slate-200 border-y border-slate-400">
                    <td colSpan={hideCarriedBalance ? 7 : 8} className="p-2 border border-slate-400 bg-slate-100 font-extrabold text-slate-900">
                      🏢 {group.floor.floorLabel} ({group.debtors.length} {group.debtors.length === 1 ? 'وحدة متأخرة' : 'وحدات متأخرة'})
                    </td>
                  </tr>
                  {group.debtors.map(({ resident, financials, carriedBalance }) => {
                    const historical = getHistoricalOccupantForDate(resident, selectedYearFilter === 'all' ? currentYear : selectedYearFilter);
                    const histAct = getHistoricalActivityForDate(resident, selectedYearFilter === 'all' ? currentYear : selectedYearFilter, config?.defaultMonthlyFee, config?.activityDefaultFees, config?.activityFeePeriods);
                    const activeOwner = historical.ownerName || resident.name;
                    const activeTenant = historical.tenantName !== undefined ? historical.tenantName : resident.tenantName;
                    const hasTenant = Boolean(activeTenant && activeTenant.trim());
                    const cBal = hideCarriedBalance ? 0 : (carriedBalance || 0);
                    const netPeriodDebt = (financials.periodExpectedDues || 0) - (financials.monthlyPaid || 0) + (financials.otherCollectionsDebt || 0);
                    const calculatedNetDebt = netPeriodDebt - cBal;
                    const isSurplus = calculatedNetDebt < 0 || (financials.monthlyPaid > financials.periodExpectedDues && financials.otherCollectionsDebt === 0 && cBal >= 0);
                    const debtAmount = Math.max(0, Math.round(calculatedNetDebt));
                    const surplusAmount = Math.max(0, Math.round(-calculatedNetDebt));

                    return (
                      <tr key={resident.id} className={`border-b border-slate-300 ${isSurplus ? 'bg-emerald-50/50' : ''}`}>
                        <td className="border border-slate-300 p-2 text-center font-bold text-blue-900">وحدة {resident.flatNumber}</td>
                        <td className="border border-slate-300 p-2 font-bold text-slate-800">
                          <div>
                            <div>{activeOwner}</div>
                            {hasTenant && (
                              <div className="text-[10px] text-amber-900 font-normal">
                                مستأجر: {activeTenant}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="border border-slate-300 p-2 text-center">{histAct.activityType || resident.activityType}</td>
                        {!hideCarriedBalance && (
                          <td className="border border-slate-300 p-2 text-center font-semibold">
                            {carriedBalance < 0 
                              ? `-${Math.abs(carriedBalance).toLocaleString()} ج.م` 
                              : carriedBalance > 0 
                              ? `+${carriedBalance.toLocaleString()} ج.م` 
                              : '—'}
                          </td>
                        )}
                        <td className="border border-slate-300 p-2 text-center font-semibold">
                          <div>{Math.round(financials.periodExpectedDues || 0).toLocaleString()} ج.م</div>
                          <div className="text-[9px] text-slate-500 font-normal" dir="rtl">{financials.expectedDuesBreakdownText}</div>
                        </td>
                        <td className="border border-slate-300 p-2 text-center text-emerald-700 font-semibold">
                          {Math.round(financials.monthlyPaid || 0).toLocaleString()} ج.م
                        </td>
                        <td className="border border-slate-300 p-2 text-center font-semibold">
                          <div>{financials.otherCollectionsPaid > 0 ? `${Math.round(financials.otherCollectionsPaid).toLocaleString()} ج.م` : '0 ج.م'}</div>
                          {financials.otherCollectionsDebt > 0 && (
                            <div className="text-[9px] text-red-600 font-bold">
                              {Math.round(financials.otherCollectionsDebt).toLocaleString()} ج.م غير مسدد
                            </div>
                          )}
                        </td>
                        <td className={`border border-slate-300 p-2 text-center font-black ${isSurplus ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {isSurplus ? `+${surplusAmount.toLocaleString()} ج.م` : `-${debtAmount.toLocaleString()} ج.م`}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))
            )}
            <tr className="bg-slate-100 font-black border-t-2 border-slate-500">
              <td colSpan={2} className="border border-slate-400 p-3 text-right text-slate-900">إجمالي المديونيات المتأخرة:</td>
              <td colSpan={hideCarriedBalance ? 4 : 5} className="border border-slate-400 p-3"></td>
              <td className="border border-slate-400 p-3 text-center text-red-700 text-sm font-black bg-red-100" dir="ltr">
                -{Math.round(((selectedActivity !== 'all' || searchTerm.trim()) ? residentsWithDebt : allDebtorsList).reduce((sum, item) => {
                  const cB = hideCarriedBalance ? 0 : (item.carriedBalance || 0);
                  const nP = (item.financials.periodExpectedDues || 0) - (item.financials.monthlyPaid || 0) + (item.financials.otherCollectionsDebt || 0);
                  return sum + Math.max(0, nP - cB);
                }, 0)).toLocaleString()} ج.م
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
