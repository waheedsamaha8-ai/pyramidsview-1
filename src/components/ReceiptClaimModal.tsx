import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Resident } from '../types';
import { shareImageViaWhatsApp } from '../utils/shareImageViaWhatsApp';
import { generateElementImageBlob } from '../utils/imageExport';
import { generateReceiptClaimFast, printReceiptClaim } from '../utils/receiptClaimGenerator';
import { 
  formatMobileNumber, 
  formatPhoneForDisplay, 
  normalizePhoneInput, 
  toWhatsAppNumber, 
  formatFullOccupantDescription,
  getOccupantStructuredInfo 
} from '../utils/phoneUtils';
import {
  X,
  Share2,
  Download,
  Check,
  Send,
  Smartphone,
  Building2,
  Receipt,
  FileText,
  User,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  ExternalLink,
  PhoneCall,
  Printer
} from 'lucide-react';

export interface ReceiptClaimData {
  type: 'receipt' | 'claim';
  title?: string;
  unitNumber: number | string;
  residentName: string;
  tenantName?: string;
  phone?: string;
  tenantPhone?: string;
  amount: number;
  month: string | number;
  year: string | number;
  date?: string;
  receiptNumber?: string;
  claimNumber?: string;
  paymentType?: string;
  notes?: string;
  carriedBalance?: number;
  monthlyFee?: number;
  totalDues?: number;
  totalPaid?: number;
  remainingBalance?: number;
  unpaidMonthsCount?: number;
  unpaidMonthsDues?: number;
  oldDebtAmount?: number;
  currentMonthStatus?: string;
  activityType?: string;
  occupancyType?: string;
  breakdown?: { label: string; value: string; isHighlight?: boolean; color?: string }[];
}

interface ReceiptClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ReceiptClaimData | null;
  residents?: Resident[];
  onSuccessToast?: (msg: string) => void;
}

const monthNamesArabic = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const ReceiptClaimModalContent: React.FC<{
  onClose: () => void;
  data: ReceiptClaimData;
  residents: Resident[];
  onSuccessToast?: (msg: string) => void;
}> = ({
  onClose,
  data,
  residents,
  onSuccessToast,
}) => {
  const isReceipt = data.type === 'receipt';
  const monthIndex = typeof data.month === 'number' ? data.month - 1 : parseInt(data.month, 10) - 1;
  const monthName = monthNamesArabic[monthIndex] || String(data.month);
  
  const docNumber = useMemo(() => {
    if (isReceipt && data.receiptNumber) return data.receiptNumber;
    if (!isReceipt && data.claimNumber) return data.claimNumber;
    const prefix = isReceipt ? 'REC' : 'CLM';
    const mPadded = String(data.month).padStart(2, '0');
    return `${prefix}-${data.unitNumber}-${mPadded}${data.year}`;
  }, [data, isReceipt]);

  const displayFormattedDate = useMemo(() => {
    if (data.date) {
      const parts = data.date.split('-');
      if (parts.length === 3) {
        const y = parts[0];
        const mIdx = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (mIdx >= 0 && mIdx < 12) {
          return `${d} ${monthNamesArabic[mIdx]} ${y}`;
        }
      }
      return data.date;
    }
    const mIdx = (typeof data.month === 'number' ? data.month : parseInt(String(data.month), 10)) - 1;
    const monthStr = (mIdx >= 0 && mIdx < 12) ? monthNamesArabic[mIdx] : data.month;
    return `21 ${monthStr} ${data.year}`;
  }, [data.date, data.month, data.year]);

  const residentRecord = useMemo(() => {
    if (!data.unitNumber) return null;
    return residents.find(r => String(r.flatNumber) === String(data.unitNumber)) || null;
  }, [residents, data.unitNumber]);

  const formattedPhone = useMemo(() => {
    const raw = data.phone || residentRecord?.phone || '';
    if (!raw) return '';
    return formatMobileNumber(raw);
  }, [data.phone, residentRecord]);

  const activityType = data.activityType || residentRecord?.activityType || 'سكني';
  const occupancyType = data.occupancyType || residentRecord?.ownershipType || 'تمليك';
  const displayMonthlyFee = data.monthlyFee || residentRecord?.monthlyFee || (activityType === 'إداري' ? 800 : activityType === 'تحت التشطيب' ? 200 : 400);

  const carriedDebt = useMemo(() => {
    if (data.oldDebtAmount !== undefined && data.oldDebtAmount > 0) return data.oldDebtAmount;
    if (data.carriedBalance !== undefined && data.carriedBalance < 0) return Math.abs(data.carriedBalance);
    if (data.carriedBalance !== undefined && data.carriedBalance > 0) return 0;
    if (residentRecord?.initialBalance !== undefined && residentRecord.initialBalance < 0) return Math.abs(residentRecord.initialBalance);
    return 0;
  }, [data.oldDebtAmount, data.carriedBalance, residentRecord]);

  const showCarriedDebt = carriedDebt > 0;

  const occupantInfo = useMemo(() => {
    return getOccupantStructuredInfo(
      {
        residentName: data.residentName,
        tenantName: data.tenantName,
        phone: data.phone,
        tenantPhone: data.tenantPhone,
        occupancyType: occupancyType,
        unitNumber: data.unitNumber
      },
      residentRecord
    );
  }, [data, occupancyType, residentRecord]);

  const occupantDisplay = occupantInfo.singleLine;

  const unpaidMonthsCount = useMemo(() => {
    if (data.unpaidMonthsCount !== undefined) return data.unpaidMonthsCount;
    if (data.amount && displayMonthlyFee) return Math.max(1, Math.round(data.amount / displayMonthlyFee));
    return 1;
  }, [data.unpaidMonthsCount, data.amount, displayMonthlyFee]);

  const unpaidMonthsDues = useMemo(() => {
    if (data.unpaidMonthsDues !== undefined) return data.unpaidMonthsDues;
    return unpaidMonthsCount * displayMonthlyFee;
  }, [data.unpaidMonthsDues, unpaidMonthsCount, displayMonthlyFee]);

  const paymentCategory = data.paymentType || 'تحصيلات شهرية';
  const paymentDescription = isReceipt
    ? `مبلغ مسدد (${paymentCategory}) - عن شهر ${monthName} ${data.year}`
    : `مطالبة (${paymentCategory}) - عن شهر ${monthName} ${data.year}`;

  const oldCarriedDebts = carriedDebt;
  const currentArrears = unpaidMonthsDues;
  const totalUnitDebt = oldCarriedDebts + currentArrears;

  // Recipient selection state
  const hasTenant = occupantInfo.hasTenant;
  const [recipientChoice, setRecipientChoice] = useState<'owner' | 'tenant' | 'other' | 'custom'>(
    hasTenant && data.tenantPhone ? 'tenant' : (data.phone ? 'owner' : (residents.length > 0 ? 'owner' : 'custom'))
  );
  const [selectedOtherResidentId, setSelectedOtherResidentId] = useState<string>('');
  const [customPhone, setCustomPhone] = useState<string>('');
  const [customRecipientName, setCustomRecipientName] = useState<string>('');
  
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll modal overlay to top when opened
    if (modalContainerRef.current) {
      modalContainerRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // Determine active target phone & recipient name based on selection
  const selectedOtherResident = useMemo(() => {
    if (!selectedOtherResidentId) return null;
    return residents.find(r => r.id === selectedOtherResidentId) || null;
  }, [selectedOtherResidentId, residents]);

  const activePhone = useMemo(() => {
    if (recipientChoice === 'owner') return data.phone || '';
    if (recipientChoice === 'tenant') return data.tenantPhone || '';
    if (recipientChoice === 'other') return selectedOtherResident?.phone || selectedOtherResident?.tenantPhone || '';
    return customPhone;
  }, [recipientChoice, data.phone, data.tenantPhone, selectedOtherResident, customPhone]);

  const activeRecipientName = useMemo(() => {
    if (recipientChoice === 'owner') return `وحدة ${data.unitNumber} (${data.residentName})`;
    if (recipientChoice === 'tenant') return `مستأجر وحدة ${data.unitNumber} (${data.tenantName || 'المستأجر'})`;
    if (recipientChoice === 'other') {
      return selectedOtherResident ? `وحدة ${selectedOtherResident.flatNumber} (${selectedOtherResident.name})` : 'وحدة أخرى';
    }
    return customRecipientName || `وحدة ${data.unitNumber}`;
  }, [recipientChoice, data, selectedOtherResident, customRecipientName]);

  const fileName = isReceipt
    ? `إيصال_سداد_وحدة_${data.unitNumber}_شهر_${monthName}_${data.year}.png`
    : `إشعار_مطالبة_وحدة_${data.unitNumber}_شهر_${monthName}_${data.year}.png`;

  // Pre-generate printable image as soon as modal opens or data changes
  const printableRef = useRef<HTMLDivElement>(null);

  const generateImage = async () => {
    try {
      setIsGeneratingImage(true);
      // Ultra-Fast Canvas generation (< 15ms on mobile)
      const res = await generateReceiptClaimFast(data, residents, fileName);
      setImageBlob(res.blob);
      setImageDataUrl(res.dataUrl);
    } catch (err) {
      console.warn('Fast image generation warning, falling back to DOM generator:', err);
      try {
        const fallbackRes = await generateElementImageBlob('receipt-claim-printable-container', fileName, 680);
        setImageBlob(fallbackRes.blob);
        setImageDataUrl(fallbackRes.dataUrl);
      } catch (fallbackErr) {
        console.error('All image generators failed:', fallbackErr);
      }
    } finally {
      setIsGeneratingImage(false);
    }
  };

  useEffect(() => {
    // Generate image immediately with ultra-fast generator
    generateImage();
  }, [data, residents]);

  const isCurrentMonthPaid = useMemo(() => {
    if (data.currentMonthStatus) {
      return data.currentMonthStatus.includes('مسدد') && !data.currentMonthStatus.includes('غير');
    }
    return isReceipt;
  }, [data.currentMonthStatus, isReceipt]);

  // Construct formatted RTL text for WhatsApp
  const shareText = useMemo(() => {
    if (isReceipt) {
      let t = `🏢 *اتحاد ملاك عمارة بيراميدز فيو ١*\n`;
      t += `💐 *إيصال سداد: ${paymentDescription}*\n`;
      t += `-----------------------------------\n`;
      t += `🚪 *الوحدة:* ( الوحدة ${data.unitNumber} - ${activityType} )\n`;
      t += `👤 *بيانات الشاغل:*\n`;
      if (occupantInfo.hasTenant) {
        t += `• ${occupantInfo.ownerLine}\n• ${occupantInfo.tenantLine}\n`;
      } else {
        t += `• ${occupantInfo.singleLine}\n`;
      }
      t += `💰 *المبلغ المسدد معتمداً:* *${Math.round(data.amount).toLocaleString()} جنيه مصري* ✓\n`;
      t += `🗓 *بيان الإيصال:* ${paymentDescription}\n`;
      t += `🏷 *نوع التحصيل:* ${paymentCategory}\n`;
      t += `🔢 *رقم الإيصال:* ${docNumber}\n`;
      t += `📅 *تاريخ السداد:* ${data.date || `${data.year}-${data.month}`}\n`;

      t += `-----------------------------------\n`;
      if (totalUnitDebt > 0) {
        const delayedMonthsText = unpaidMonthsCount === 1 ? 'تأخير شهر واحد' : unpaidMonthsCount === 2 ? 'تأخير شهرين' : unpaidMonthsCount <= 10 ? `تأخير ${unpaidMonthsCount} أشهر` : `تأخير ${unpaidMonthsCount} شهراً`;
        t += `⚠️ *بيان تفصيلي بالمديونيات والمتأخرات المتبقية على الوحدة:*\n`;
        t += `• متأخرات ${paymentCategory}: ${delayedMonthsText} (${Math.round(unpaidMonthsDues).toLocaleString()} ج.م)\n`;
        if (oldCarriedDebts > 0) {
          t += `• مديونيات قديمة ومرحلة: ${Math.round(oldCarriedDebts).toLocaleString()} ج.م\n`;
        }
        t += `• إجمالي المديونية المتبقية: *${Math.round(totalUnitDebt).toLocaleString()} جنيه مصري* (المتأخرات الحالية + المديونيات القديمة)\n`;
        t += `🌺 *نشكركم على حسن تعاونكم والتزامكم بالسداد لدعم نظافة وصيانة وخدمات العمارة، ونرجو التكرم بسرعة سداد وتصفية المبالغ المتبقية للحفاظ على استمرار تقديم الخدمات المشتركة بأفضل صورة لراحة الجميع.*\n`;
      } else {
        t += `✨ *موقف المديونيات:*\n`;
        t += `لا توجد أي مديونيات قديمة أو متأخرات على الوحدة، والحساب مسدد بالكامل حتى تاريخه 👍\n`;
        t += `🌺 *نشكركم جزيل الشكر والتقدير على التزامكم الدائم بالسداد في المواعيد المحددة، مما يسهم بشكل مباشر في استمرار خدمات ونظافة وتطوير العمارة.*\n`;
      }

      if (data.notes) {
        t += `📝 *ملاحظات:* ${data.notes}\n`;
      }
      t += `-----------------------------------\n`;
      t += `شاكرين لكم حسن تعاونكم الدائم في الحفاظ على العمارة وتطوير خدماتها.\n`;
      t += `إدارة اتحاد ملاك بيراميدز فيو ١`;
      return t;
    } else {
      let t = `🏢 *اتحاد ملاك عمارة بيراميدز فيو ١*\n`;
      t += `🏛️ *إشعار مطالبة وبيان مستحقات (${paymentCategory})*\n`;
      t += `-----------------------------------\n`;
      t += `تحية طيبة،\n`;
      t += `نحيط سيادتكم علماً ببيان مستحقات ( *الوحدة ${data.unitNumber} - ${activityType}* ):\n`;
      t += `👤 *بيانات الشاغل:*\n`;
      if (occupantInfo.hasTenant) {
        t += `• ${occupantInfo.ownerLine}\n• ${occupantInfo.tenantLine}\n\n`;
      } else {
        t += `• ${occupantInfo.singleLine}\n\n`;
      }
      if (isCurrentMonthPaid) {
        t += `✓ *حالة سداد الشهر الحالي:* اشتراك شهر ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م) مسدد بالكامل ✓\n\n`;
      } else {
        t += `⚠️ *حالة سداد الشهر الحالي:* اشتراك شهر ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م) غير مسدد حتى تاريخه.\n\n`;
      }
      t += `📋 *بيان وتفصيل المبالغ المستحقة على الوحدة:*\n`;
      const delayedMonthsText = unpaidMonthsCount === 1 ? 'تأخير شهر واحد' : unpaidMonthsCount === 2 ? 'تأخير شهرين' : unpaidMonthsCount <= 10 ? `تأخير ${unpaidMonthsCount} أشهر` : `تأخير ${unpaidMonthsCount} شهراً`;
      if (unpaidMonthsCount > 0) {
        t += `• متأخرات ${paymentCategory}: ${delayedMonthsText} بقيمة ${Math.round(unpaidMonthsDues).toLocaleString()} ج.م (الاشتراك الشهري: ${Math.round(displayMonthlyFee).toLocaleString()} ج.م)\n`;
      }

      if (data.breakdown && data.breakdown.length > 0) {
        data.breakdown.forEach(b => {
          if (b.label.includes('تحصيلات أخرى') || b.label.includes('مديونية سابقة')) {
            t += `• ${b.label}: ${b.value}\n`;
          }
        });
      } else if (oldCarriedDebts > 0) {
        t += `• مديونية قديمة ومرحلة على الوحدة: ${Math.round(oldCarriedDebts).toLocaleString()} ج.م\n`;
      }

      t += `💰 *إجمالي المبلغ المطلوب سداده:* *${Math.round(data.amount).toLocaleString()} جنيه مصري* (مجموع المتأخرات الحالية + مجموع المديونيات القديمة)\n`;
      t += `🔢 *رقم المطالبة:* ${docNumber}\n`;
      t += `📅 *تاريخ الإصدار:* ${data.date || new Date().toISOString().split('T')[0]}\n`;
      t += `\n🤝 *نأمل من سيادتكم التكرم بالمبادرة بسرعة سداد المستحقات لتغطية مصروفات الصيانة الدورية والنظافة والأمن وتشغيل المصاعد بكفاءة لراحة وسلامة جميع سكان ورواد العمارة.*\n`;
      if (data.notes) {
        t += `📝 *ملاحظات:* ${data.notes}\n`;
      }
      t += `-----------------------------------\n`;
      t += `شاكرين ومقدرين حسن تعاونكم الدائم.\n`;
      t += `إدارة اتحاد ملاك بيراميدز فيو ١`;
      return t;
    }
  }, [data, isReceipt, isCurrentMonthPaid, monthName, docNumber, hasTenant, occupantInfo, carriedDebt, activityType, displayMonthlyFee, unpaidMonthsCount, unpaidMonthsDues, paymentCategory, paymentDescription, totalUnitDebt, oldCarriedDebts]);

  const handleDownloadImage = () => {
    if (!imageBlob && !imageDataUrl) return;
    const link = document.createElement('a');
    link.download = fileName;
    if (imageDataUrl) {
      link.href = imageDataUrl;
    } else if (imageBlob) {
      link.href = URL.createObjectURL(imageBlob);
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintDocument = () => {
    printReceiptClaim(data, residents);
  };

  const handleSendDirectWhatsAppText = () => {
    const cleanPhone = toWhatsAppNumber(activePhone);
    const waUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(shareText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

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
  };

  const handleShareImageAndText = async () => {
    if (!imageBlob) {
      alert('جاري معالجة الصورة، يُرجى المحاولة بعد ثانية واحدة...');
      return;
    }

    setIsSharing(true);
    try {
      await shareImageViaWhatsApp({
        imageBlob,
        fileName,
        phone: activePhone,
        recipientName: activeRecipientName,
        title: isReceipt ? `إيصال سداد الوحدة ${data.unitNumber}` : `إشعار مطالبة الوحدة ${data.unitNumber}`,
        text: shareText,
        onSuccessToast: (msg) => {
          setToastMessage(msg);
          if (onSuccessToast) onSuccessToast(msg);
        },
        onErrorToast: (err) => {
          alert(err);
        }
      });
    } catch (err) {
      console.error('Error sharing receipt:', err);
      alert('حدث خطأ أثناء المشاركة، تم حفظ الصورة على جهازك.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div 
      ref={modalContainerRef}
      className="fixed inset-0 z-[9999] bg-slate-900/75 backdrop-blur-sm flex items-start sm:items-center justify-center p-2.5 sm:p-4 overflow-y-auto pt-4 sm:pt-6"
    >
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-100 shadow-2xl overflow-hidden text-right flex flex-col max-h-[92vh] my-auto animate-scale-up">
        
        {/* Header */}
        <div className={`px-5 py-3.5 flex items-center justify-between border-b shrink-0 ${
          isReceipt 
            ? 'bg-gradient-to-r from-emerald-800 to-teal-900 text-white border-emerald-700' 
            : 'bg-gradient-to-r from-blue-900 to-slate-900 text-white border-blue-800'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 text-white/80 hover:text-white rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2.5">
            <div className="text-right">
              <h3 className="text-sm sm:text-base font-black flex items-center gap-1.5 justify-end">
                <span>{isReceipt ? `إيصال سداد شهر ${monthName} ${data.year} - ${data.paymentType || 'اشتراك شهري'}` : 'إشعار مطالبة وبيان مستحقات شهرية'}</span>
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-lg">( الوحدة {data.unitNumber} - {activityType} )</span>
              </h3>
              <p className="text-[11px] text-white/80 font-bold">
                {isReceipt ? 'مستند تحصيل واستلام مالي معتمد' : 'بيان مستحقات ومطالبة رسمية'} • {monthName} {data.year}
              </p>
            </div>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs ${
              isReceipt ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
            }`}>
              {isReceipt ? <Receipt className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-3.5 sm:p-5 space-y-3.5 overflow-y-auto flex-1 text-right bg-slate-50/50">

          {/* Toast Notification */}
          {toastMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-start gap-2 animate-fade-in shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{toastMessage}</div>
              <button 
                onClick={() => setToastMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 font-bold text-xs"
              >
                إغلاق
              </button>
            </div>
          )}

          {/* Recipient Selector Card */}
          <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-blue-900" />
                <span>إرسال وتوجيه المستند عبر الواتساب إلى:</span>
              </span>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                {activePhone ? formatPhoneForDisplay(activePhone) : 'غير مسجل رقم (اختر أو اكتب بالأسفل)'}
              </span>
            </div>

            {/* Recipient Type Options */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setRecipientChoice('owner')}
                className={`py-2 px-2.5 rounded-xl font-bold transition flex items-center justify-center gap-1 cursor-pointer border text-center ${
                  recipientChoice === 'owner'
                    ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">المالك ({data.residentName.split(' ')[0]})</span>
              </button>

              {hasTenant ? (
                <button
                  type="button"
                  onClick={() => setRecipientChoice('tenant')}
                  className={`py-2 px-2.5 rounded-xl font-bold transition flex items-center justify-center gap-1 cursor-pointer border text-center ${
                    recipientChoice === 'tenant'
                      ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">المستأجر ({data.tenantName ? data.tenantName.split(' ')[0] : 'الشاغل'})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRecipientChoice('other')}
                  className={`py-2 px-2.5 rounded-xl font-bold transition flex items-center justify-center gap-1 cursor-pointer border text-center ${
                    recipientChoice === 'other'
                      ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span>وحدة أخرى</span>
                </button>
              )}

              {hasTenant && (
                <button
                  type="button"
                  onClick={() => setRecipientChoice('other')}
                  className={`py-2 px-2.5 rounded-xl font-bold transition flex items-center justify-center gap-1 cursor-pointer border text-center ${
                    recipientChoice === 'other'
                      ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span>وحدة أخرى</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setRecipientChoice('custom')}
                className={`py-2 px-2.5 rounded-xl font-bold transition flex items-center justify-center gap-1 cursor-pointer border text-center ${
                  recipientChoice === 'custom'
                    ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span>رقم مخصص / عام</span>
              </button>
            </div>

            {/* Dynamic Recipient Details / Inputs */}
            {recipientChoice === 'owner' && (
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">اسم المالك: {data.residentName}</span>
                <span className="font-mono font-black text-emerald-800" dir="ltr">
                  {data.phone ? formatPhoneForDisplay(data.phone) : 'لا يوجد رقم مسجل للمالك'}
                </span>
              </div>
            )}

            {recipientChoice === 'tenant' && (
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">اسم المستأجر: {data.tenantName || 'غير محدد'}</span>
                <span className="font-mono font-black text-emerald-800" dir="ltr">
                  {data.tenantPhone ? formatPhoneForDisplay(data.tenantPhone) : 'لا يوجد رقم مسجل للمستأجر'}
                </span>
              </div>
            )}

            {recipientChoice === 'other' && (
              <div className="space-y-2 pt-1">
                <select
                  value={selectedOtherResidentId}
                  onChange={(e) => setSelectedOtherResidentId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer"
                >
                  <option value="">-- اختر الوحدة المراد إرسال المستند إليها --</option>
                  {residents.map(r => (
                    <option key={r.id} value={r.id}>
                      الوحدة {r.flatNumber} - {r.name} {r.phone ? `(${formatMobileNumber(r.phone)})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {recipientChoice === 'custom' && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="tel"
                    placeholder="رقم الواتساب (مثال: 01007911777 أو +966...)"
                    value={customPhone}
                    onChange={(e) => setCustomPhone(normalizePhoneInput(e.target.value))}
                    onBlur={() => setCustomPhone(formatMobileNumber(customPhone))}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-bold outline-none text-left font-mono placeholder:text-right placeholder:font-sans"
                    dir="ltr"
                  />
                  <input
                    type="text"
                    placeholder="اسم المستلم (اختياري)"
                    value={customRecipientName}
                    onChange={(e) => setCustomRecipientName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-bold outline-none text-right"
                  />
                </div>
                <p className="text-[10.5px] text-slate-500">
                  إذا تركت حقل الرقم فارغاً، سيفتح تطبيق الواتساب لتختار أي محادثة أو مجموعة لإرسال المستند إليها فوراً.
                </p>
              </div>
            )}
          </div>

          {/* Card Preview Visual Area */}
          <div className="bg-white p-3 border border-slate-200 rounded-2xl shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-700 font-bold px-1">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>معاينة المستند الرسمي المعتمد:</span>
              </span>
              <span className="text-[11px] text-emerald-700 font-bold">عرض حي فوري ⚡</span>
            </div>

            {/* Scrollable Container with live HTML preview */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-72 sm:max-h-96 overflow-y-auto bg-slate-100 p-2.5 shadow-inner flex flex-col items-center w-full">
              {/* Live instant HTML preview of the receipt/claim */}
              <div 
                className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 p-4 text-slate-900 font-sans shadow-xs text-right relative" 
                dir="rtl"
              >
                {/* Header Banner */}
                <div className={`p-4 rounded-xl text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 ${
                  isReceipt ? 'bg-emerald-700' : 'bg-blue-700'
                }`}>
                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold flex items-center gap-1.5">
                      <span>{isReceipt ? `💐 إيصال سداد: ${paymentDescription}` : `🏛️ إشعار مطالبة وبيان مستحقات (${paymentCategory})`}</span>
                    </h4>
                    <p className="text-[11px] text-white/90 font-bold mt-1">اتحاد ملاك عمارة بيراميدز فيو ١</p>
                  </div>
                  <div className="text-[11px] font-bold opacity-90 sm:text-left space-y-0.5" dir="rtl">
                    <div>التاريخ: {displayFormattedDate}</div>
                    <div>المرجع: {docNumber}</div>
                  </div>
                </div>

                {/* Status Bar */}
                <div className={`p-2.5 rounded-lg border flex items-center justify-between text-[11px] font-extrabold mb-4 gap-2 ${
                  isReceipt 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : isCurrentMonthPaid
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  <span>
                    {isReceipt 
                      ? `✓ تم استلام ${paymentDescription} بنجاح وتوثيقه في السجل المالي` 
                      : isCurrentMonthPaid
                      ? `✓ حالة سداد الشهر الحالي: اشتراك شهر ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م) مسدد بالكامل`
                      : `⚠️ تنويه هام: اشتراك شهر ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م) غير مسدد حتى تاريخه`}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] shrink-0 ${
                    isReceipt || isCurrentMonthPaid ? 'bg-emerald-200 text-emerald-950' : 'bg-amber-200 text-amber-950'
                  }`}>
                    {isReceipt || isCurrentMonthPaid ? 'مسدد بالكامل ✓' : '⏳ غير مسدد'}
                  </span>
                </div>

                {/* Data Fields */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden text-xs mb-4 divide-y divide-slate-200">
                  <div className="flex justify-between items-start p-2.5 font-bold">
                    <span className="text-slate-500 shrink-0 ml-2 mt-0.5">اسم الشاغل:</span>
                    <div className="flex flex-col gap-0.5 text-left sm:text-right font-black leading-relaxed">
                      {occupantInfo.hasTenant ? (
                        <>
                          <span className="text-slate-900">{occupantInfo.ownerLine}</span>
                          <span className="text-amber-950">{occupantInfo.tenantLine}</span>
                        </>
                      ) : (
                        <span className="text-slate-900">{occupantInfo.singleLine}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center p-2.5 font-bold">
                    <span className="text-slate-500">رقم الوحدة:</span>
                    <span className="text-blue-900 font-black">( الوحدة {data.unitNumber} - {activityType} )</span>
                  </div>
                  {isReceipt ? (
                    <div className="flex justify-between items-center p-2.5 font-bold">
                      <span className="text-slate-500">بيان الإيصال:</span>
                      <span className="text-slate-900 font-black text-emerald-800">{paymentDescription}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center p-2.5 font-bold">
                        <span className="text-slate-500">عن شهر:</span>
                        <span className="text-slate-900">اشتراك {monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م)</span>
                      </div>
                      <div className="flex justify-between items-center p-2.5 font-bold">
                        <span className="text-slate-500">حالة الشهر الحالي:</span>
                        <span className={`font-black ${isCurrentMonthPaid ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {isCurrentMonthPaid ? 'مسدد بالكامل ✓' : 'غير مسدد ⚠️'}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between items-center p-2.5 font-bold">
                    <span className="text-slate-500">نوع الإشغال:</span>
                    <span className="text-slate-900">{occupancyType}</span>
                  </div>
                  {isReceipt && (
                    <>
                      <div className="flex justify-between items-center p-2.5 font-bold">
                        <span className="text-slate-500">تاريخ السداد:</span>
                        <span className="text-slate-900">{data.date || `${data.year}-${String(data.month).padStart(2, '0')}`}</span>
                      </div>
                      <div className="flex justify-between items-center p-2.5 font-bold">
                        <span className="text-slate-500">نوع التحصيل:</span>
                        <span className="text-emerald-800">{paymentCategory}</span>
                      </div>
                      <div className="flex justify-between items-center p-2.5 font-bold">
                        <span className="text-slate-500">طريقة السداد:</span>
                        <span className="text-emerald-800">{data.notes?.includes('تحويل') ? 'تحويل بنكي / محفظة' : 'سداد نقدي'}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Debt Notification Section */}
                {isReceipt ? (
                  totalUnitDebt > 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 text-xs font-bold mb-4">
                      <div className="flex items-center gap-1.5 text-amber-900 font-black mb-1">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>⚠️ بيان تفصيلي بالمديونيات والمتأخرات المتبقية على الوحدة:</span>
                      </div>
                      <div className="text-[11.5px] leading-relaxed space-y-0.5">
                        <div>• متأخرات {paymentCategory}: {unpaidMonthsCount === 1 ? 'تأخير شهر واحد' : unpaidMonthsCount === 2 ? 'تأخير شهرين' : unpaidMonthsCount <= 10 ? `تأخير ${unpaidMonthsCount} أشهر` : `تأخير ${unpaidMonthsCount} شهراً`} ({Math.round(unpaidMonthsDues).toLocaleString()} ج.م){oldCarriedDebts > 0 ? ` + مديونية قديمة مرحلة (${Math.round(oldCarriedDebts).toLocaleString()} ج.م)` : ''}</div>
                        <div className="font-black text-rose-800">• إجمالي المديونية المتبقية على الوحدة: <span className="underline">{Math.round(totalUnitDebt).toLocaleString()} ج.م</span> (المتأخرات الحالية + المديونيات القديمة)</div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 text-xs font-bold mb-4">
                      <div className="flex items-center gap-1.5 text-emerald-900 font-black mb-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>✨ موقف المديونيات:</span>
                      </div>
                      <div className="text-[11.5px] leading-relaxed">
                        لا توجد أي مديونيات قديمة أو متأخرات على الوحدة، والحساب مسدد بالكامل حتى تاريخه 👍
                      </div>
                    </div>
                  )
                ) : (
                  <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-950 text-xs font-bold mb-4">
                    <div className="flex items-center gap-1.5 text-rose-900 font-black mb-1">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>⚠️ بيان وتفصيل المبالغ المستحقة على الوحدة:</span>
                    </div>
                    <div className="text-[11.5px] leading-relaxed space-y-1">
                      <div>
                        • حالة الشهر الحالي: اشتراك شهر {monthName} {data.year} وقدره <span className="underline font-black">{Math.round(displayMonthlyFee).toLocaleString()} ج.م</span>{' '}
                        <span className={`font-black ${isCurrentMonthPaid ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {isCurrentMonthPaid ? 'مسدد بالكامل ✓' : 'غير مسدد حتى تاريخه ⚠️'}
                        </span>
                      </div>
                      {unpaidMonthsCount > 0 && (
                        <div className="font-bold text-slate-800">
                          • متأخرات {paymentCategory}: تأخير {unpaidMonthsCount} شهور ({Math.round(unpaidMonthsDues).toLocaleString()} ج.م)
                        </div>
                      )}
                      {data.breakdown && data.breakdown.length > 0 ? (
                        data.breakdown.map((b, idx) => (
                          (b.label.includes('تحصيلات أخرى') || b.label.includes('مديونية سابقة')) ? (
                            <div key={idx} className="font-bold text-rose-900">
                              • {b.label}: <span className="font-black">{b.value}</span>
                            </div>
                          ) : null
                        ))
                      ) : (
                        oldCarriedDebts > 0 && (
                          <div className="font-bold text-rose-900">
                            • مديونية قديمة مرحلة: <span className="font-black">{Math.round(oldCarriedDebts).toLocaleString()} ج.م</span>
                          </div>
                        )
                      )}
                      <div className="font-black text-rose-800 pt-1 border-t border-rose-200">
                        • إجمالي المبالغ المستحقة للسداد: <span className="underline">{Math.round(data.amount).toLocaleString()} ج.م</span> (مجموع المتأخرات الحالية + مجموع المديونيات القديمة)
                      </div>
                    </div>
                  </div>
                )}

                {/* Encouraging Note Box */}
                <div className={`p-3 rounded-xl border text-[11px] font-bold leading-relaxed mb-4 text-center ${
                  isReceipt ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-blue-50 border-blue-100 text-blue-800'
                }`}>
                  {isReceipt ? (
                    <span>
                      🌺 نشكركم على حسن تعاونكم والتزامكم بالسداد لدعم نظافة وصيانة وخدمات العمارة، ونرجو التكرم بسرعة سداد وتصفية المبالغ المتبقية للحفاظ على استمرار تقديم الخدمات المشتركة بأفضل صورة لراحة الجميع.
                    </span>
                  ) : (
                    <span>
                      🤝 نأمل من سيادتكم التكرم بالمبادرة بسرعة سداد المستحقات لتغطية مصروفات الصيانة الدورية والنظافة والأمن وتشغيل المصاعد بكفاءة لراحة وسلامة جميع سكان ورواد العمارة.
                    </span>
                  )}
                </div>

                {/* Big Total Banner */}
                <div className={`p-3.5 rounded-xl border-2 flex items-center justify-between font-black ${
                  isReceipt ? 'bg-emerald-50/50 border-emerald-600' : 'bg-white border-rose-600'
                }`}>
                  <span className="text-xs text-slate-850">
                    {isReceipt ? 'إجمالي المبلغ المسدد معتمداً:' : 'إجمالي المبلغ المستحق للسداد:'}
                  </span>
                  <span className={`text-lg sm:text-xl ${isReceipt ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {Math.round(data.amount).toLocaleString()} ج.م
                  </span>
                </div>

                {/* Footer certified badge */}
                <div className="mt-4 pt-3 border-t border-dashed border-slate-350 flex items-center justify-between text-[9px] font-bold text-slate-500">
                  <div className="border border-slate-400 rounded px-1.5 py-0.5 text-slate-700 font-black">
                    معتمد إلكترونياً ✓ اتحاد ملاك بيراميدز فيو ١
                  </div>
                  <span>تم استخراج هذا الإيصال إلكترونياً ومطابق للسجلات المالية الرسمية</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer Controls */}
        <div className="bg-white px-4 sm:px-5 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          
          {/* Secondary Actions (Download / Copy) */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDownloadImage}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
              title="تحميل صورة المستند لجهازك"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>تحميل الصورة</span>
            </button>

            <button
              type="button"
              onClick={handlePrintDocument}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
              title={isReceipt ? 'طباعة إيصال السداد المعتمد' : 'طباعة إشعار المطالبة'}
            >
              <Printer className="w-3.5 h-3.5 text-blue-900" />
              <span>{isReceipt ? 'طباعة إيصال' : 'طباعة إشعار مطالبة'}</span>
            </button>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleSendDirectWhatsAppText}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
              title="إرسال نص المطالبة / الإيصال مباشرة عبر الواتساب"
            >
              <Send className="w-3.5 h-3.5 text-emerald-300" />
              <span>إرسال نص الواتس</span>
            </button>

            <button
              type="button"
              disabled={isSharing || isGeneratingImage}
              onClick={handleShareImageAndText}
              className={`flex-1 sm:flex-none px-5 py-2.5 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95 disabled:opacity-50 ${
                isReceipt 
                  ? 'bg-emerald-600 hover:bg-emerald-700' 
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <Share2 className="w-4 h-4 text-emerald-100" />
              <span>
                {isSharing 
                  ? 'جاري المشاركة...' 
                  : (activePhone ? `مشاركة عبر الواتساب` : 'مشاركة عبر واتساب')}
              </span>
            </button>
          </div>

        </div>
      </div>

      {/* Hidden Pristine Printable DOM Element for html2canvas Ultra-Fast Generation */}
      <div
        id="receipt-claim-printable-container"
        ref={printableRef}
        className="printable-area hidden print:block text-right font-sans bg-white"
        dir="rtl"
        style={{
          width: '720px',
          maxWidth: '720px',
          padding: '24px',
          backgroundColor: '#ffffff',
          color: '#0f172a',
          borderRadius: '24px',
          border: '1px solid #e2e8f0',
          boxSizing: 'border-box',
          fontFamily: 'Cairo, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          letterSpacing: 'normal',
        }}
      >
        {/* Card Header Banner */}
        <div
          style={{
            backgroundColor: isReceipt ? '#047857' : '#1d4ed8',
            color: '#ffffff',
            borderRadius: '16px',
            padding: '18px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div>
            <div style={{ fontSize: '19px', fontWeight: '900', letterSpacing: 'normal', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{isReceipt ? `💐 إيصال سداد شهر ${monthName} ${data.year} - ${data.paymentType || 'اشتراك شهري'}` : '🏛️ إشعار مطالبة وبيان مستحقات شهرية'}</span>
            </div>
            <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#ffffff', marginTop: '4px', opacity: 0.95 }}>
              اتحاد ملاك عمارة بيراميدز فيو ١
            </div>
          </div>
          <div
            style={{
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: '800', color: '#ffffff' }}>
              التاريخ: {displayFormattedDate}
            </div>
            <div style={{ fontSize: '12px', fontWeight: '800', color: '#ffffff' }}>
              المرجع: {docNumber}
            </div>
          </div>
        </div>

        {/* Status Alert Bar */}
        <div
          style={{
            backgroundColor: isReceipt ? '#ecfdf5' : '#fffbeb',
            border: isReceipt ? '1px solid #a7f3d0' : '1px solid #fde68a',
            borderRadius: '14px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div style={{ fontSize: '12.5px', fontWeight: '800', color: isReceipt ? '#047857' : '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>
              {isReceipt 
                ? '✓ تم استلام مبلغ الاشتراك بنجاح وتوثيقه في السجل المالي المعتمد' 
                : `⚠️ تنويه هام: اشتراك شهر ${monthName} ${data.year} غير مسدد حتى تاريخه`}
            </span>
          </div>
          <div
            style={{
              backgroundColor: isReceipt ? '#d1fae5' : '#fef3c7',
              color: isReceipt ? '#047857' : '#92400e',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '11.5px',
              fontWeight: '900',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>{isReceipt ? 'تم السداد ✓' : '⏳ غير مسدد'}</span>
          </div>
        </div>

        {/* Structured Grid Table */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            overflow: 'hidden',
            marginBottom: '16px',
          }}
        >
          {/* Row 1 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              borderBottom: '1px solid #e2e8f0',
              padding: '12px 18px',
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ color: '#64748b', fontWeight: '700', marginTop: '2px' }}>اسم الشاغل:</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {occupantInfo.hasTenant ? (
                  <>
                    <span style={{ color: '#0f172a', fontWeight: '900' }}>{occupantInfo.ownerLine}</span>
                    <span style={{ color: '#78350f', fontWeight: '900' }}>{occupantInfo.tenantLine}</span>
                  </>
                ) : (
                  <span style={{ color: '#0f172a', fontWeight: '900' }}>{occupantInfo.singleLine}</span>
                )}
              </div>
            </div>
            <div style={{ fontSize: '13.5px', display: 'flex', gap: '8px' }}>
              <span style={{ color: '#64748b', fontWeight: '700' }}>رقم الوحدة:</span>
              <span style={{ color: '#1e3a8a', fontWeight: '900' }}>
                ( الوحدة {data.unitNumber} - {activityType} )
              </span>
            </div>
          </div>

          {/* Row 2 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              borderBottom: isReceipt ? '1px solid #e2e8f0' : 'none',
              padding: '12px 18px',
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: '13.5px', display: 'flex', gap: '8px' }}>
              <span style={{ color: '#64748b', fontWeight: '700' }}>{isReceipt ? 'بيان الإيصال:' : 'عن شهر:'}</span>
              <span style={{ color: '#0f172a', fontWeight: '900' }}>
                {isReceipt 
                  ? paymentDescription
                  : `اشتراك ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م)`
                }
              </span>
            </div>
            <div style={{ fontSize: '13.5px', display: 'flex', gap: '8px' }}>
              <span style={{ color: '#64748b', fontWeight: '700' }}>{isReceipt ? 'نوع الإشغال:' : 'حالة الشهر الحالي:'}</span>
              <span style={{ color: isReceipt ? '#0f172a' : '#be123c', fontWeight: '800' }}>
                {isReceipt ? occupancyType : 'غير مسدد ⚠️'}
              </span>
            </div>
          </div>

          {/* Row 3 (Receipt Specifics) */}
          {isReceipt && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                borderBottom: '1px solid #e2e8f0',
                padding: '12px 18px',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: '13.5px', display: 'flex', gap: '8px' }}>
                <span style={{ color: '#64748b', fontWeight: '700' }}>تاريخ السداد:</span>
                <span style={{ color: '#0f172a', fontWeight: '900', fontFamily: 'monospace' }}>
                  {data.date || `${data.year}-${String(data.month).padStart(2, '0')}`}
                </span>
              </div>
              <div style={{ fontSize: '13.5px', display: 'flex', gap: '8px' }}>
                <span style={{ color: '#64748b', fontWeight: '700' }}>نوع التحصيل:</span>
                <span style={{ color: '#047857', fontWeight: '800' }}>
                  {paymentCategory}
                </span>
              </div>
            </div>
          )}

          {/* Row 4 (Payment Method) */}
          {isReceipt && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '12px 18px',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: '13.5px', display: 'flex', gap: '8px' }}>
                <span style={{ color: '#64748b', fontWeight: '700' }}>طريقة السداد:</span>
                <span style={{ color: '#047857', fontWeight: '800' }}>
                  {data.notes?.includes('تحويل') ? 'تحويل بنكي / محفظة' : 'سداد نقدي'}
                </span>
              </div>
              <div></div>
            </div>
          )}
        </div>

        {/* Debt Notice Box */}
        {isReceipt ? (
          totalUnitDebt > 0 ? (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '14px',
                padding: '12px 16px',
                marginBottom: '16px',
                color: '#991b1b',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: '900', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚠️ بيان تفصيلي بالمديونيات والمتأخرات المتبقية على الوحدة:</span>
              </div>
              <div style={{ fontSize: '12.5px', fontWeight: '800', lineHeight: '1.6' }}>
                <div>• متأخرات {paymentCategory}: تأخير {unpaidMonthsCount} شهور ({Math.round(unpaidMonthsDues).toLocaleString()} ج.م){oldCarriedDebts > 0 ? ` + مديونية قديمة مرحلة (${Math.round(oldCarriedDebts).toLocaleString()} ج.م)` : ''}</div>
                <div style={{ fontWeight: '900', marginTop: '2px', color: '#7f1d1d' }}>• إجمالي المديونية المتبقية على الوحدة: <span style={{ textDecoration: 'underline' }}>{Math.round(totalUnitDebt).toLocaleString()} ج.م</span> (المتأخرات الحالية + المديونيات القديمة)</div>
              </div>
            </div>
          ) : (
            <div
              style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '14px',
                padding: '12px 16px',
                marginBottom: '16px',
                color: '#166534',
                fontSize: '12.5px',
                fontWeight: '800',
              }}
            >
              ✨ موقف المديونيات: لا توجد أي مديونيات قديمة أو متأخرات على الوحدة، والحساب مسدد بالكامل حتى تاريخه 👍
            </div>
          )
        ) : (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '14px',
              padding: '12px 16px',
              marginBottom: '16px',
              color: '#991b1b',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: '900', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⚠️ بيان وتفصيل المبالغ المستحقة على الوحدة:</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: '800', lineHeight: '1.6' }}>
              <div>• حالة الشهر الحالي: اشتراك شهر {monthName} {data.year} وقدره <span style={{ textDecoration: 'underline', fontWeight: '900' }}>{Math.round(displayMonthlyFee).toLocaleString()} ج.م</span> غير مسدد حتى تاريخه.</div>
              <div>• متأخرات {paymentCategory}: تأخير {unpaidMonthsCount} شهور ({Math.round(unpaidMonthsDues).toLocaleString()} ج.م){oldCarriedDebts > 0 ? ` + مديونية قديمة مرحلة (${Math.round(oldCarriedDebts).toLocaleString()} ج.م)` : ''}</div>
              <div style={{ fontWeight: '900', marginTop: '2px', color: '#7f1d1d' }}>• إجمالي المبالغ المستحقة للسداد: <span style={{ textDecoration: 'underline' }}>{Math.round(data.amount).toLocaleString()} ج.م</span> (مجموع المتأخرات الحالية + مجموع المديونيات القديمة)</div>
            </div>
          </div>
        )}

        {/* Thank You / Friendly Encouragement Box */}
        <div
          style={{
            backgroundColor: isReceipt ? '#f0fdf4' : '#eff6ff',
            border: isReceipt ? '1px solid #bbf7d0' : '1px solid #bfdbfe',
            borderRadius: '14px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '12.5px',
            fontWeight: '800',
            color: isReceipt ? '#166534' : '#1e40af',
            lineHeight: '1.6',
          }}
        >
          {isReceipt ? (
            <span>
              🌺 نشكركم على حسن تعاونكم والتزامكم بالسداد لدعم نظافة وصيانة وخدمات العمارة، ونرجو التكرم بسرعة سداد وتصفية المبالغ المتبقية للحفاظ على استمرار تقديم الخدمات المشتركة بأفضل صورة لراحة وسلامة الجميع.
            </span>
          ) : (
            <span>
              🤝 نأمل من سيادتكم التكرم بالمبادرة بسرعة سداد المستحقات لتغطية مصروفات الصيانة الدورية والنظافة والأمن وتشغيل المصاعد بكفاءة لراحة وسلامة جميع سكان ورواد العمارة.
            </span>
          )}
        </div>

        {/* Big Total Amount Banner */}
        <div
          style={{
            backgroundColor: isReceipt ? '#ecfdf5' : '#ffffff',
            border: isReceipt ? '2px solid #059669' : '2px solid #e11d48',
            borderRadius: '16px',
            padding: '16px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: '900', color: '#0f172a' }}>
            {isReceipt ? 'إجمالي المبلغ المسدد معتمداً:' : 'إجمالي المبلغ المستحق للسداد:'}
          </span>
          <span
            style={{
              fontSize: '26px',
              fontWeight: '900',
              color: isReceipt ? '#047857' : '#be123c',
              letterSpacing: 'normal',
            }}
          >
            {Math.round(data.amount).toLocaleString()} ج.م
          </span>
        </div>

        {/* Footer with dashed line */}
        <div
          style={{
            borderTop: '1px dashed #cbd5e1',
            paddingTop: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            fontWeight: '700',
            color: '#64748b',
          }}
        >
          <div
            style={{
              border: '1px solid #94a3b8',
              borderRadius: '8px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: '800',
              color: '#334155',
            }}
          >
            معتمد إلكترونياً ✓ اتحاد ملاك بيراميدز فيو ١
          </div>
          <span>تم استخراج هذا الإيصال إلكترونياً ومطابق للسجلات المالية الرسمية</span>
        </div>
      </div>

    </div>
  );
};

export const ReceiptClaimModal: React.FC<ReceiptClaimModalProps> = ({
  isOpen,
  onClose,
  data,
  residents = [],
  onSuccessToast,
}) => {
  if (!isOpen || !data) return null;
  return (
    <ReceiptClaimModalContent
      onClose={onClose}
      data={data}
      residents={residents}
      onSuccessToast={onSuccessToast}
    />
  );
};
