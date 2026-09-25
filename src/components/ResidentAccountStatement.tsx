import React, { useState, useMemo, useEffect, useRef } from 'react';
import { generateElementImage, generateElementImageBlob, GeneratedImageResult } from '../utils/imageExport';
import { Resident, Payment, AppConfig } from '../types';
import { calculateResidentFinancials, getCarriedPreviousBalance } from '../utils/financialCalculations';
import { compareFlatNumbers, isSameFlatNumber } from '../utils/buildingStructure';
import { formatMobileNumber, formatPhoneForDisplay, toWhatsAppNumber } from '../utils/phoneUtils';
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
  ExternalLink
} from 'lucide-react';

interface ResidentAccountStatementProps {
  resident?: Resident;
  residents: Resident[];
  payments: Payment[];
  config: AppConfig;
  currentYear: number;
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
  isResidentOnly = false,
  onSelectResidentId,
  onSelectFlatNumber,
  onPreviewImage,
  onOpenResidentsList,
}) => {
  const [monthFilter, setMonthFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
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

  const accountingStartDate = config?.accountingStartDate || '2026-01-01';
  const defaultMonthlyFee = config?.defaultMonthlyFee || 400;
  const activityDefaultFees = config?.activityDefaultFees;

  const startYear = useMemo(() => {
    const s = new Date(accountingStartDate);
    return isNaN(s.getFullYear()) ? 2026 : s.getFullYear();
  }, [accountingStartDate]);

  // Compute carried forward previous balance automatically for multi-year accounting continuity
  const effectiveCarriedBalance = useMemo(() => {
    if (!activeResident) return 0;
    return getCarriedPreviousBalance(
      activeResident,
      currentYear,
      payments,
      accountingStartDate,
      defaultMonthlyFee,
      activityDefaultFees
    );
  }, [activeResident, currentYear, payments, accountingStartDate, defaultMonthlyFee, activityDefaultFees]);

  // Calculate high-level financials
  const financials = useMemo(() => {
    if (!activeResident) {
      return {
        monthlyFee: defaultMonthlyFee,
        monthsElapsed: 1,
        expectedDues: defaultMonthlyFee,
        totalPaid: 0,
        netBalance: -defaultMonthlyFee,
      };
    }
    return calculateResidentFinancials(
      activeResident,
      payments,
      accountingStartDate,
      defaultMonthlyFee,
      activityDefaultFees
    );
  }, [activeResident, payments, accountingStartDate, defaultMonthlyFee, activityDefaultFees]);

  // All payments belonging to this unit
  const unitPayments = useMemo(() => {
    if (!activeResident) return [];
    return payments
      .filter(p => isSameFlatNumber(p.flatNumber, activeResident.flatNumber) || (p.residentId && p.residentId === activeResident.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeResident, payments]);

  // Generate detailed breakdown of all months from accounting start date up to current date
  const monthsTimeline = useMemo(() => {
    if (!activeResident) return [];

    let start = new Date(accountingStartDate);
    if (isNaN(start.getTime())) {
      start = new Date(currentYear, 0, 1);
    }
    const now = new Date();
    
    // We iterate from start month to current month
    const timeline: Array<{
      monthNum: number;
      monthStr: string;
      year: number;
      monthLabel: string;
      fee: number;
      isPaid: boolean;
      paidAmount: number;
      matchingPayments: Payment[];
      isFuture: boolean;
    }> = [];

    const startYear = start.getFullYear();
    const startMonth = start.getMonth(); // 0-indexed
    const currentY = now.getFullYear();
    const currentM = now.getMonth(); // 0-indexed

    let y = startYear;
    let m = startMonth;

    while (y < currentY || (y === currentY && m <= currentM)) {
      const monthNum = m + 1;
      const monthStr = String(monthNum).padStart(2, '0');
      const monthLabel = `${monthNamesArabic[m]} ${y}`;

      // Find matching payments for this exact month and year
      const matching = unitPayments.filter(p => {
        const pMonth = parseInt(p.month, 10);
        const pYear = Number(p.year);
        return pMonth === monthNum && pYear === y;
      });

      const validPaidMatching = matching.filter(
        p => p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل'
      );

      const paidAmount = validPaidMatching.reduce((sum, p) => sum + (p.amount || 0), 0);
      const isPaid = paidAmount >= financials.monthlyFee;

      timeline.push({
        monthNum,
        monthStr,
        year: y,
        monthLabel,
        fee: financials.monthlyFee,
        isPaid,
        paidAmount,
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
  }, [activeResident, accountingStartDate, currentYear, unitPayments, financials.monthlyFee]);

  const paidMonthsList = useMemo(() => monthsTimeline.filter(m => m.isPaid), [monthsTimeline]);
  const unpaidMonthsList = useMemo(() => monthsTimeline.filter(m => !m.isPaid), [monthsTimeline]);

  const displayedMonths = useMemo(() => {
    if (monthFilter === 'paid') return paidMonthsList;
    if (monthFilter === 'unpaid') return unpaidMonthsList;
    return monthsTimeline;
  }, [monthFilter, paidMonthsList, unpaidMonthsList, monthsTimeline]);

  // Image generation & sharing states
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageResult, setGeneratedImageResult] = useState<GeneratedImageResult | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Clear cached generated image whenever active resident or financial data changes
  useEffect(() => {
    setGeneratedImageResult(null);
  }, [activeResident?.id, activeResident?.flatNumber, payments, effectiveCarriedBalance]);

  // Builds beautifully formatted WhatsApp text summary
  const getWhatsAppSummaryText = (target: 'owner' | 'tenant' = 'owner') => {
    if (!activeResident) return '';
    const isDebt = financials.netBalance < 0;
    const isSurplus = financials.netBalance > 0;
    const targetName = target === 'owner' ? activeResident.name : (activeResident.tenantName || 'السيد المستأجر');
    const targetRole = target === 'owner' ? 'المالك' : 'المستأجر';
    const todayStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

    let text = `📋 *كشف حساب وااشتراكات الوحدة الشامل*\n`;
    text += `🏢 *اتحاد ملاك عمارة بيراميدز فيو ١*\n`;
    text += `------------------------------------\n`;
    text += `🚪 *الوحدة:* ( الوحدة ${activeResident.flatNumber} - ${activeResident.activityType} )\n`;
    text += `👤 *الاسم (${targetRole}):* ${targetName}\n`;
    if (target === 'owner' && activeResident.ownershipType === 'إيجار' && activeResident.tenantName) {
      text += `🏠 *المستأجر الحالي:* ${activeResident.tenantName}\n`;
    }
    text += `💵 *قيمة الاشتراك الشهري:* ${financials.monthlyFee.toLocaleString()} ج.م\n`;
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

    if (unpaidMonthsList.length > 0) {
      text += `\n⚠️ *الشهور غير المسددة بالتفصيل (${unpaidMonthsList.length} شهر):*\n`;
      unpaidMonthsList.forEach(m => {
        text += `• ${m.monthLabel}: ${m.paidAmount > 0 ? `سداد جزئي (${m.paidAmount.toLocaleString()} من ${m.fee.toLocaleString()} ج.م)` : `مستحق ${m.fee.toLocaleString()} ج.م`}\n`;
      });
    } else {
      text += `\n🎉 *جميع الشهور مسددة بالكامل حتى تاريخه.*\n`;
    }

    text += `\nشاكرين لكم حسن تعاونكم وحرصكم الدائم.\n`;
    text += `إدارة اتحاد ملاك عمارة بيراميدز فيو ١ 🏢`;
    return text;
  };

  // Instant direct formatted text WhatsApp sharing for account statement
  const handleSendWhatsAppText = (target: 'owner' | 'tenant') => {
    if (!activeResident) return;
    const phoneToUse = target === 'owner' ? (activeResident.phone || '') : (activeResident.tenantPhone || '');
    let cleanPhone = toWhatsAppNumber(phoneToUse);

    if (!cleanPhone) {
      const name = target === 'owner' ? activeResident.name : (activeResident.tenantName || 'المستأجر');
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
      const cleanName = activeResident.name.trim().replace(/\s+/g, '_');
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
    let img = generatedImageResult;
    if (!img) {
      img = await generateFreshImageBlob();
    }
    if (img) {
      setIsShareModalOpen(true);
    }
  };

  // Direct WhatsApp sharing with Image support
  const handleShareWhatsApp = async (target: 'owner' | 'tenant', withImage: boolean = true) => {
    if (!activeResident) return;
    const phoneToUse = target === 'owner' ? (activeResident.phone || '') : (activeResident.tenantPhone || '');
    const cleanPhone = toWhatsAppNumber(phoneToUse);
    const targetLabel = target === 'owner' ? `المالك (${activeResident.name})` : `المستأجر (${activeResident.tenantName})`;
    const text = getWhatsAppSummaryText(target);

    if (!withImage) {
      const waUrl = cleanPhone 
        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}` 
        : `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
      return;
    }

    let img = generatedImageResult;
    if (!img) {
      img = await generateFreshImageBlob();
    }
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
    document.body.classList.add('printing-statement');
    document.body.classList.remove('printing-debts');
    window.focus();

    try {
      window.print();
    } catch (err) {
      console.warn('Direct print failed, trying iframe print fallback:', err);
    }

    const elem = document.getElementById('statement-printable-area');
    if (elem) {
      let iframe = document.getElementById('print-iframe-statement') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe-statement';
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
            <title>كشف حساب وحدة ${activeResident ? activeResident.flatNumber : ''}</title>
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
              .grid-cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
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
      document.body.classList.remove('printing-statement');
    }, 1200);
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
                {residents.slice().sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber)).map(r => (
                  <option key={r.id} value={r.id}>
                    وحدة {r.flatNumber} — {r.name} {r.tenantName ? `(المستأجر: ${r.tenantName})` : ''}
                  </option>
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
                <span className="text-[8px] text-slate-400 font-bold">يمكنك اختيار أي وحدة لعرض كامل تفاصيل اشتراكاتها ومدفوعاتها ومشاركتها</span>
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
                {residents.slice().sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber)).map(r => (
                  <option key={r.id} value={r.id}>
                    وحدة {r.flatNumber} — {r.name} {r.tenantName ? `(المستأجر: ${r.tenantName})` : ''}
                  </option>
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
              {activeResident.phone && (
                <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-xl text-xs font-mono font-bold inline-flex items-center gap-1 phone-number-display" dir="ltr">
                  <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                  <span dir="ltr">{formatPhoneForDisplay(activeResident.phone)}</span>
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-950 flex items-center gap-2 mt-1">
              <span>{activeResident.name}</span>
              {activeResident.ownershipType === 'إيجار' && activeResident.tenantName && (
                <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                  المستأجر: {activeResident.tenantName}
                </span>
              )}
            </h2>
            <p className="text-[10px] text-slate-400 font-semibold">
              تاريخ بدء المحاسبة المعتمد: <span className="font-bold text-slate-600">{accountingStartDate}</span> | التقرير محدث حتى تاريخ اليوم
            </p>
          </div>

          {/* Actions Toolbar (Hidden in resident mode) */}
          {!isResidentOnly && (
            <div className="w-full pt-2 space-y-2">
              {/* Action Buttons in 1 Row */}
              <div className={`grid ${activeResident.ownershipType === 'إيجار' && activeResident.tenantPhone ? 'grid-cols-4' : 'grid-cols-3'} gap-2 w-full`}>
                {activeResident.ownershipType === 'إيجار' && activeResident.tenantPhone ? (
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
            <span className="text-[11px] font-bold text-slate-500 block">الاشتراك الشهري</span>
            <div className="flex items-baseline justify-center gap-1 font-black text-slate-800" dir="ltr">
              <span className="text-base sm:text-xl font-black">{financials.monthlyFee.toLocaleString()}</span>
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400">ج.م</span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block">بحسب فئة {activeResident.activityType}</span>
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

        {/* Notice Banner if Debt or Settled */}
        {isDebt && (
          <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-3 sm:p-3.5 flex items-start sm:items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="flex-1 text-xs">
              <span className="font-extrabold text-rose-950 block">يوجد متبقي مديونية على الوحدة بقيمة {Math.abs(financials.netBalance).toLocaleString()} ج.م</span>
              <span className="text-rose-700 text-[11px] font-semibold leading-relaxed">
                تفصيل المديونية الحالية: شهور غير مسددة ({unpaidMonthsList.length} شهر = {(unpaidMonthsList.length * financials.monthlyFee).toLocaleString()} ج.م)
                {(activeResident.initialBalance || 0) < 0 
                  ? ` بالإضافة إلى مديونية قديمة سابقة (${Math.abs(activeResident.initialBalance || 0).toLocaleString()} ج.م) تم جمعها على الحساب.`
                  : (activeResident.initialBalance || 0) > 0 
                  ? ` بعد خصم رصيد دائن سابق بقيمة (${(activeResident.initialBalance || 0).toLocaleString()} ج.م).`
                  : ' (لا يوجد رصيد سابق مرحل).'}
                {' '}يرجى التكرم بسرعة السداد لضمان استمرار أعمال الصيانة والخدمات بالعمارة.
              </span>
            </div>
          </div>
        )}

        {isSettled && (
          <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-3 sm:p-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="flex-1 text-xs">
              <span className="font-extrabold text-blue-950 block">حسابك منتظم تماماً ومسدد بالكامل حتى تاريخه!</span>
              <span className="text-blue-700 text-[11px] font-semibold">نشكر لكم حرصكم الدائم على الالتزام بسداد اشتراكات الوحدة بانتظام.</span>
            </div>
          </div>
        )}

        {isSurplus && (
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3 sm:p-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <div className="flex-1 text-xs">
              <span className="font-extrabold text-emerald-950 block">لديك رصيد إضافي مسدد مقدماً بقيمة {financials.netBalance.toLocaleString()} ج.م</span>
              <span className="text-emerald-700 text-[11px] font-semibold">سيتم خصم هذا الرصيد تلقائياً من اشتراكات الشهور القادمة.</span>
            </div>
          </div>
        )}

        {/* Section: Months Breakdown (الشهور المدفوعة وغير المدفوعة) */}
        <div className="space-y-3 pt-2 w-full">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-950 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-900" />
              <span>كشف الشهور تفصيلياً (المدفوعة وغير المدفوعة)</span>
            </h3>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
              متابعة حالة كل شهر من تاريخ بدء المحاسبة حتى الشهر الحالي
            </p>
          </div>

          {/* Filter Tabs (Full Width & Equal Button Sizes) */}
          {!isResidentOnly && (
            <div className="w-full bg-slate-100 p-1.5 rounded-2xl grid grid-cols-3 gap-1.5 text-xs font-black border border-slate-200/60 shadow-2xs">
              <button
                type="button"
                onClick={() => setMonthFilter('all')}
                className={`w-full py-2 px-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 text-center ${
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
                className={`w-full py-2 px-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 text-center ${
                  monthFilter === 'paid' 
                    ? 'bg-emerald-600 text-white shadow-xs font-black' 
                    : 'text-emerald-800 hover:text-emerald-900 bg-emerald-50/70 font-bold border border-emerald-100/80'
                }`}
              >
                <span>المدفوعة</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  monthFilter === 'paid' ? 'bg-emerald-700/60 text-white' : 'bg-emerald-200/80 text-emerald-900'
                }`}>
                  {paidMonthsList.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMonthFilter('unpaid')}
                className={`w-full py-2 px-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 text-center ${
                  monthFilter === 'unpaid' 
                    ? 'bg-rose-600 text-white shadow-xs font-black' 
                    : 'text-rose-800 hover:text-rose-900 bg-rose-50/70 font-bold border border-rose-100/80'
                }`}
              >
                <span>غير المدفوعة</span>
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
              <table className="w-full min-w-[660px] text-right border-collapse text-xs table-fixed">
                <colgroup>
                  <col className="w-14 min-w-[56px]" />
                  <col className="w-[15%]" />
                  <col className="w-[15%]" />
                  <col className="w-[14%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50/90 text-slate-600 font-extrabold text-[11px] border-b border-slate-100">
                    <th className="sticky right-0 z-20 bg-slate-50 px-1 py-2 whitespace-nowrap text-center border-l border-slate-200/80 shadow-[-2px_0_4px_rgba(0,0,0,0.03)] text-[10px] sm:text-[11px]">
                      الشهور
                    </th>
                    <th className="px-2 py-2 sm:px-2.5 sm:py-2.5 whitespace-nowrap text-right">الاشتراك</th>
                    <th className="px-2 py-2 sm:px-2.5 sm:py-2.5 whitespace-nowrap text-right">المسدد</th>
                    <th className="px-0.5 py-2 whitespace-nowrap text-center text-[9px] sm:text-[10px]">
                      فئة التحصيل
                    </th>
                    <th className="px-2 py-2 sm:px-2.5 sm:py-2.5 whitespace-nowrap text-center">حالة السداد</th>
                    <th className="px-2 py-2 sm:px-2.5 sm:py-2.5 whitespace-nowrap text-center sm:text-right">رقم الإيصال</th>
                    <th className="px-2 py-2 sm:px-2.5 sm:py-2.5 whitespace-nowrap text-center">صورة الإيصال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                  {/* Row for Old Debt / Previous Balance in all cases (negative, positive, or 0) */}
                  {(() => {
                    const initBal = effectiveCarriedBalance;
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
                        <td className={`sticky right-0 z-10 ${isNeg ? 'bg-amber-50' : isPos ? 'bg-teal-50' : 'bg-slate-50'} px-1 py-1 whitespace-nowrap leading-tight border-l border-slate-200/80 shadow-[-2px_0_4px_rgba(0,0,0,0.03)] w-12 sm:w-14 min-w-[48px] max-w-[54px] text-center`}>
                          <div className="flex flex-col items-center justify-center leading-none py-0.5">
                            <span className="font-black text-slate-900 text-[11px]">رصيد</span>
                            <span className="text-[10px] font-black text-slate-600 mt-0.5">سابق</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap font-bold text-xs sm:text-[13px]">
                          {isNeg ? `${Math.abs(initBal).toLocaleString()} ج.م` : '0 ج.م'}
                        </td>
                        <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap font-bold text-xs sm:text-[13px]">
                          {isPos ? `${initBal.toLocaleString()} ج.م` : '0 ج.م'}
                        </td>
                        <td className="px-0.5 py-1 whitespace-nowrap text-center text-xs w-14 sm:w-16 min-w-[50px] max-w-[62px]">
                          <span className="px-1 py-0.5 bg-slate-100 text-slate-700 border border-slate-200/80 rounded text-[9px] font-bold inline-block truncate max-w-[58px]" title={isCarried ? 'رصيد مرحل' : 'تسوية رصيد'}>
                            {isCarried ? 'مرحل' : 'تسوية'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap text-center">
                          {isNeg ? (
                            <span className="min-w-[70px] inline-flex items-center justify-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200/80 rounded-md text-[10px] font-black leading-none">
                              <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>{isCarried ? `مديونية من ${currentYear - 1}` : 'مديونية سابقة'}</span>
                            </span>
                          ) : isPos ? (
                            <span className="min-w-[70px] inline-flex items-center justify-center gap-1 px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200/80 rounded-md text-[10px] font-black leading-none">
                              <CheckCircle2 className="w-3 h-3 text-teal-600 shrink-0" />
                              <span>{isCarried ? `فائض من ${currentYear - 1}` : 'رصيد دائن'}</span>
                            </span>
                          ) : (
                            <span className="min-w-[70px] inline-flex items-center justify-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded-md text-[10px] font-bold leading-none">
                              <span>0 ج.م (لا يوجد)</span>
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap text-center sm:text-right text-xs">
                          <span className="font-mono px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            {isCarried ? 'مرحل تلقائياً' : (isNeg ? 'مرحل للمديونية' : isPos ? 'مرحل للرصيد' : 'رصيد مرحل')}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap text-center text-xs text-slate-300 font-normal">
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
                    displayedMonths.map((m, idx) => (
                      <tr key={idx} className={`group hover:bg-slate-50/70 transition ${!m.isPaid ? 'bg-rose-50/20' : ''}`}>
                        <td className={`sticky right-0 z-10 ${!m.isPaid ? 'bg-[#fef8f8] group-hover:bg-[#fcf2f2]' : 'bg-white group-hover:bg-slate-50'} px-1 py-1 whitespace-nowrap leading-tight border-l border-slate-200/80 shadow-[-2px_0_4px_rgba(0,0,0,0.03)] w-12 sm:w-14 min-w-[48px] max-w-[54px] text-center`}>
                          <div className="font-bold text-slate-900 text-xs">
                            {monthNamesArabic[m.monthNum - 1]}
                          </div>
                          <div className="text-[9px] font-medium text-slate-400 leading-none mt-0.5">
                            {m.year}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap text-slate-600 font-bold text-xs sm:text-[13px]">
                          {m.fee.toLocaleString()} ج.م
                        </td>
                        <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap text-xs sm:text-[13px]">
                          <span className={m.paidAmount > 0 ? 'text-emerald-600 font-black' : 'text-slate-400 font-normal'}>
                            {m.paidAmount > 0 ? `${m.paidAmount.toLocaleString()} ج.م` : '0 ج.م'}
                          </span>
                        </td>
                        <td className="px-0.5 py-1 whitespace-nowrap text-center text-xs w-14 sm:w-16 min-w-[50px] max-w-[62px]">
                          {m.matchingPayments.length > 0 ? (
                            <div className="flex items-center justify-center flex-wrap gap-0.5">
                              {Array.from(new Set(m.matchingPayments.map(p => p.paymentType || 'اشتراك شهري'))).map((type, tIdx) => (
                                <span
                                  key={tIdx}
                                  className="px-1 py-0.5 bg-blue-50 text-blue-900 border border-blue-200/80 rounded text-[9px] font-bold inline-block truncate max-w-[58px]"
                                  title={type}
                                >
                                  {type}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-300 font-normal">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap text-center">
                          {m.isPaid ? (
                            <span className="min-w-[70px] inline-flex items-center justify-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-md text-[10px] font-black leading-none">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>مدفوع</span>
                            </span>
                          ) : m.paidAmount > 0 ? (
                            <span className="min-w-[70px] inline-flex items-center justify-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200/80 rounded-md text-[10px] font-black leading-none">
                              <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>سداد جزئي</span>
                            </span>
                          ) : (
                            <span className="min-w-[70px] inline-flex items-center justify-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-200/80 rounded-md text-[10px] font-black leading-none">
                              <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                              <span>غير مدفوع</span>
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 sm:px-3 sm:py-2 whitespace-nowrap text-center sm:text-right text-xs">
                          {m.matchingPayments.length > 0 ? (
                            <div className="flex items-center justify-center sm:justify-start flex-wrap gap-1">
                              {m.matchingPayments.map(p => (
                                <span
                                  key={p.id}
                                  className="font-mono px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"
                                >
                                  {p.receiptNumber ? `#${p.receiptNumber}` : 'مسدد'}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-300 font-normal">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap text-center text-xs">
                          {m.matchingPayments.some(p => p.fileUrl) ? (
                            <div className="flex items-center justify-center flex-wrap gap-1">
                              {m.matchingPayments.filter(p => p.fileUrl).map((p, pIdx) => (
                                <button
                                  key={p.id || pIdx}
                                  type="button"
                                  onClick={() => onPreviewImage && p.fileUrl && onPreviewImage(p.fileUrl)}
                                  className="inline-flex items-center justify-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-lg text-[10px] font-bold transition cursor-pointer shadow-2xs"
                                  title="عرض صورة الإيصال"
                                >
                                  <ImageIcon className="w-3 h-3 text-blue-600 shrink-0" />
                                  <span>عرض الإيصال</span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-300 font-normal">—</span>
                          )}
                        </td>
                      </tr>
                    ))
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
              <table className="w-full min-w-[660px] text-right border-collapse text-xs table-fixed">
                <colgroup>
                  <col className="w-14 min-w-[56px]" />
                  <col className="w-[15%]" />
                  <col className="w-[15%]" />
                  <col className="w-[14%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50/90 text-slate-600 font-extrabold text-[11px] border-b border-slate-100">
                    <th className="sticky right-0 z-20 bg-slate-50 px-1 py-2 whitespace-nowrap text-center border-l border-slate-200/80 shadow-[-2px_0_4px_rgba(0,0,0,0.03)] text-[10px] sm:text-[11px]">
                      الشهور
                    </th>
                    <th className="px-2 py-2 sm:px-2.5 sm:py-2.5 whitespace-nowrap text-right">الاشتراك</th>
                    <th className="px-2 py-2 sm:px-2.5 sm:py-2.5 whitespace-nowrap text-right">المسدد</th>
                    <th className="px-0.5 py-2 whitespace-nowrap text-center text-[9px] sm:text-[10px]">
                      فئة التحصيل
                    </th>
                    <th className="px-2 py-2 sm:px-2.5 sm:py-2.5 whitespace-nowrap text-center">حالة السداد</th>
                    <th className="px-2 py-2 sm:px-2.5 sm:py-2.5 whitespace-nowrap text-center sm:text-right">رقم الإيصال</th>
                    <th className="px-2 py-2 sm:px-2.5 sm:py-2.5 whitespace-nowrap text-center">صورة الإيصال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                  {unitPayments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                        لا توجد عمليات سداد أو تحصيل مسجلة لهذه الوحدة حتى الآن.
                      </td>
                    </tr>
                  ) : (
                    unitPayments.map((p) => {
                      const mIdx = parseInt(String(p.month), 10) - 1;
                      const mName = monthNamesArabic[mIdx] || p.month;
                      return (
                        <tr key={p.id} className="group hover:bg-slate-50/70 transition">
                          <td className="sticky right-0 z-10 bg-white group-hover:bg-slate-50 px-1 py-1 whitespace-nowrap leading-tight border-l border-slate-200/80 shadow-[-2px_0_4px_rgba(0,0,0,0.03)] w-12 sm:w-14 min-w-[48px] max-w-[54px] text-center">
                            <div className="font-bold text-slate-900 text-xs">
                              {mName}
                            </div>
                            <div className="text-[9px] font-medium text-slate-400 leading-none mt-0.5">
                              {p.year}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap text-slate-600 font-bold text-xs sm:text-[13px]">
                            {financials.monthlyFee.toLocaleString()} ج.م
                          </td>
                          <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap text-xs sm:text-[13px]">
                            <span className="text-emerald-600 font-black">
                              {p.amount.toLocaleString()} ج.م
                            </span>
                          </td>
                          <td className="px-0.5 py-1 whitespace-nowrap text-center text-xs w-14 sm:w-16 min-w-[50px] max-w-[62px]">
                            <span
                              className="px-1 py-0.5 bg-blue-50 text-blue-900 border border-blue-200/80 rounded text-[9px] font-bold inline-block truncate max-w-[58px]"
                              title={p.paymentType || 'اشتراك شهري'}
                            >
                              {p.paymentType || 'اشتراك شهري'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap text-center">
                            <span className="min-w-[70px] inline-flex items-center justify-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-md text-[10px] font-black leading-none">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>مستلم ومعتمد</span>
                            </span>
                          </td>
                          <td className="px-2.5 py-1.5 sm:px-3 sm:py-2 whitespace-nowrap text-center sm:text-right text-xs">
                            <span className="font-mono px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {p.receiptNumber ? `#${p.receiptNumber}` : 'مسدد'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 sm:px-2.5 sm:py-2 whitespace-nowrap text-center text-xs">
                            {p.fileUrl ? (
                              <button
                                type="button"
                                onClick={() => onPreviewImage && p.fileUrl && onPreviewImage(p.fileUrl)}
                                className="inline-flex items-center justify-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-lg text-[10px] font-bold transition cursor-pointer shadow-2xs"
                                title="عرض صورة الإيصال"
                              >
                                <ImageIcon className="w-3 h-3 text-blue-600 shrink-0" />
                                <span>عرض الإيصال</span>
                              </button>
                            ) : (
                              <span className="text-slate-300 font-normal">—</span>
                            )}
                          </td>
                        </tr>
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
        <div id="statement-printable-area" className="printable-area hidden print:block text-right p-6 font-sans" dir="rtl">
          {/* Header */}
          <div className="text-center space-y-2 border-b-2 border-slate-800 pb-4 mb-6">
            <h1 className="text-2xl font-black text-slate-900">اتحاد ملاك عمارة بيراميدز فيو ١</h1>
            <p className="text-sm font-bold text-slate-600">
              كشف حساب ومطالبات اشتراكات - وحدة رقم ({activeResident.flatNumber})
            </p>
            <div className="flex justify-between items-center text-xs text-slate-500 pt-2 font-semibold">
              <span>تاريخ إصدار الكشف: {new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span>تاريخ بدء المحاسبة: {accountingStartDate}</span>
            </div>
          </div>

          {/* Unit & Owner Info Box */}
          <div className="border border-slate-300 rounded-xl p-4 bg-slate-50/50 mb-6 text-xs">
            <h2 className="font-black text-slate-800 text-sm border-b border-slate-200 pb-2 mb-3">
              بيانات الوحدة والشاغل
            </h2>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              <div><span className="font-bold text-slate-500">رقم الوحدة:</span> <strong className="text-slate-900">( الوحدة {activeResident.flatNumber} - {activeResident.activityType} )</strong></div>
              <div><span className="font-bold text-slate-500">اسم المالك:</span> <strong className="text-slate-900">{activeResident.name}</strong></div>
              <div><span className="font-bold text-slate-500">نوع النشاط:</span> <strong className="text-slate-900">{activeResident.activityType}</strong></div>
              <div><span className="font-bold text-slate-500">رقم هاتف المالك:</span> <strong className="text-slate-900 font-mono phone-number-display" dir="ltr">{activeResident.phone ? formatPhoneForDisplay(activeResident.phone) : '—'}</strong></div>
              <div><span className="font-bold text-slate-500">نوع الملكية:</span> <strong className="text-slate-900">{activeResident.ownershipType || 'تمليك'}</strong></div>
              {activeResident.tenantName && (
                <div><span className="font-bold text-slate-500">اسم المستأجر:</span> <strong className="text-slate-900">{activeResident.tenantName} {activeResident.tenantPhone ? <span dir="ltr" className="font-mono text-slate-700 font-bold phone-number-display">({formatPhoneForDisplay(activeResident.tenantPhone)})</span> : ''}</strong></div>
              )}
            </div>
          </div>

          {/* Financial Metrics Summary - 5 Symmetrical Metrics matching screen */}
          <div className="grid grid-cols-5 gap-2 border border-slate-300 rounded-xl p-3 bg-slate-50/50 mb-4 text-xs text-center">
            <div className="space-y-1">
              <span className="font-bold text-slate-500 block text-[11px]">الاشتراك الشهري</span>
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

          {/* Notice Banner matching on-screen status */}
          {financials.netBalance < 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-right text-xs mb-5 text-red-950 font-bold flex items-center justify-between">
              <span>⚠️ تنبيه الموقف المالي: على الوحدة مديونية متأخرة مستحقة السداد بقيمة {Math.abs(Math.round(financials.netBalance)).toLocaleString()} ج.م تشمل ({unpaidMonthsList.length}) شهر غير مدفوع {effectiveCarriedBalance < 0 ? `بالإضافة لرصيد مديونية مرحل (${Math.abs(effectiveCarriedBalance).toLocaleString()} ج.م)` : ''}.</span>
              <span className="text-red-700 font-black text-xs px-2 py-0.5 bg-red-100 rounded-lg">مطلوب السداد</span>
            </div>
          ) : financials.netBalance === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-right text-xs mb-5 text-emerald-950 font-bold flex items-center justify-between">
              <span>✨ الموقف المالي: تم سداد جميع اشتراكات ومستحقات الوحدة بالكامل حتى تاريخه ولا توجد أي مديونيات متأخرة.</span>
              <span className="text-emerald-800 font-black text-xs px-2 py-0.5 bg-emerald-100 rounded-lg">مسدد بالكامل</span>
            </div>
          ) : (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-right text-xs mb-5 text-teal-950 font-bold flex items-center justify-between">
              <span>🎉 الموقف المالي: يوجد رصيد إضافي مسدد مقدماً بقيمة {Math.round(financials.netBalance).toLocaleString()} ج.م سيتم خصمه تلقائياً من اشتراكات الشهور القادمة.</span>
              <span className="text-teal-800 font-black text-xs px-2 py-0.5 bg-teal-100 rounded-lg">رصيد دائن فائض</span>
            </div>
          )}

          {/* Monthly Accounting Timeline Table */}
          <h2 className="font-black text-slate-800 text-xs mb-2">جدول المحاسبة والمطالبات الشهري ({monthsTimeline.length} شهر)</h2>
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
                <th className="border border-slate-400 p-2 text-center font-black">قيمة الاشتراك</th>
                <th className="border border-slate-400 p-2 text-center font-black">المبلغ المسدد</th>
                <th className="border border-slate-400 p-2 text-center font-black">فئة التحصيل</th>
                <th className="border border-slate-400 p-2 text-center font-black">حالة السداد</th>
                <th className="border border-slate-400 p-2 text-center font-black">تفاصيل التحصيل ورقم الإيصال</th>
              </tr>
            </thead>
            <tbody>
              {/* Row for Carried Previous Balance */}
              {(() => {
                const initBal = effectiveCarriedBalance;
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
              {monthsTimeline.map((m) => {
                const isPartial = m.paidAmount > 0 && !m.isPaid;
                const isUnpaid = m.paidAmount === 0 && !m.isPaid;
                return (
                  <tr key={`${m.year}-${m.monthNum}`} className={`border-b border-slate-300 ${isUnpaid ? 'bg-rose-50/40' : isPartial ? 'bg-amber-50/40' : ''}`}>
                    <td className="border border-slate-300 p-2 text-center font-black text-slate-800">{m.monthLabel}</td>
                    <td className="border border-slate-300 p-2 text-center font-semibold text-slate-700">{m.fee.toLocaleString()} ج.م</td>
                    <td className="border border-slate-300 p-2 text-center font-black text-emerald-700">
                      {m.paidAmount > 0 ? `${m.paidAmount.toLocaleString()} ج.م` : '0 ج.م'}
                    </td>
                    <td className="border border-slate-300 p-2 text-center text-xs font-bold text-slate-700">
                      {m.matchingPayments.length > 0 
                        ? Array.from(new Set(m.matchingPayments.map(p => p.paymentType || 'اشتراك شهري'))).join(' ، ')
                        : '—'}
                    </td>
                    <td className="border border-slate-300 p-2 text-center font-bold">
                      {m.isPaid ? (
                        <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-800 font-black rounded-md border border-emerald-200">
                          مدفوع بالكامل
                        </span>
                      ) : isPartial ? (
                        <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-800 font-black rounded-md border border-amber-200">
                          سداد جزئي ({m.paidAmount} من {m.fee} ج.م)
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 bg-rose-50 text-rose-700 font-black rounded-md border border-rose-200">
                          غير مدفوع
                        </span>
                      )}
                    </td>
                    <td className="border border-slate-300 p-2 text-center font-mono text-[11px] font-bold text-slate-800">
                      {m.matchingPayments.length > 0 
                        ? m.matchingPayments.map(p => `إيصال #${p.receiptNumber || 'مسدد'} (${p.date})`).join(' | ')
                        : '—'}
                    </td>
                  </tr>
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
                    <th className="border border-slate-400 p-2 text-center font-black">الاشتراك</th>
                    <th className="border border-slate-400 p-2 text-center font-black">المسدد</th>
                    <th className="border border-slate-400 p-2 text-center font-black">فئة التحصيل</th>
                    <th className="border border-slate-400 p-2 text-center font-black">حالة السداد</th>
                    <th className="border border-slate-400 p-2 text-center font-black">رقم الإيصال</th>
                  </tr>
                </thead>
                <tbody>
                  {unitPayments.map((p) => {
                    const mIdx = parseInt(String(p.month), 10) - 1;
                    const mName = monthNamesArabic[mIdx] || p.month;
                    return (
                      <tr key={p.id} className="border-b border-slate-300">
                        <td className="border border-slate-300 p-2 text-center font-black text-slate-800">
                          {mName} {p.year}
                        </td>
                        <td className="border border-slate-300 p-2 text-center font-bold text-slate-700">
                          {financials.monthlyFee.toLocaleString()} ج.م
                        </td>
                        <td className="border border-slate-300 p-2 text-center font-black text-emerald-700">
                          {p.amount.toLocaleString()} ج.م
                        </td>
                        <td className="border border-slate-300 p-2 text-center text-xs font-bold text-slate-700">
                          {p.paymentType || 'اشتراك شهري'}
                        </td>
                        <td className="border border-slate-300 p-2 text-center">
                          <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-800 font-black rounded-md border border-emerald-200">
                            مستلم ومعتمد ✓
                          </span>
                        </td>
                        <td className="border border-slate-300 p-2 text-center font-mono text-xs font-bold text-slate-800">
                          {p.receiptNumber ? `إيصال #${p.receiptNumber}` : 'إيصال #مسدد'} ({p.date})
                        </td>
                      </tr>
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
                    المالك: {activeResident.name} | التقرير متزامن ومطابق تماماً لبيانات الوحدة
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
