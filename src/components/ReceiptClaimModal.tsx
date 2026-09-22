import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Resident } from '../types';
import { shareImageViaWhatsApp } from '../utils/shareImageViaWhatsApp';
import { generateElementImageBlob } from '../utils/imageExport';
import { formatMobileNumber, formatPhoneForDisplay, normalizePhoneInput, toWhatsAppNumber } from '../utils/phoneUtils';
import {
  X,
  Share2,
  Download,
  Copy,
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
  PhoneCall
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
  
  const docNumber = isReceipt 
    ? (data.receiptNumber ? `#${data.receiptNumber}` : `REC-${data.unitNumber}-${data.month}${data.year}`)
    : (data.claimNumber ? `#${data.claimNumber}` : `CLM-${data.unitNumber}-${data.month}${data.year}`);

  // Recipient selection state
  const hasTenant = Boolean(data.tenantName || data.tenantPhone);
  const [recipientChoice, setRecipientChoice] = useState<'owner' | 'tenant' | 'other' | 'custom'>(
    hasTenant && data.tenantPhone ? 'tenant' : (data.phone ? 'owner' : (residents.length > 0 ? 'owner' : 'custom'))
  );
  const [selectedOtherResidentId, setSelectedOtherResidentId] = useState<string>('');
  const [customPhone, setCustomPhone] = useState<string>('');
  const [customRecipientName, setCustomRecipientName] = useState<string>('');
  
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
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
    if (recipientChoice === 'owner') return `شقة ${data.unitNumber} (${data.residentName})`;
    if (recipientChoice === 'tenant') return `مستأجر شقة ${data.unitNumber} (${data.tenantName || 'المستأجر'})`;
    if (recipientChoice === 'other') {
      return selectedOtherResident ? `شقة ${selectedOtherResident.flatNumber} (${selectedOtherResident.name})` : 'وحدة أخرى';
    }
    return customRecipientName || `شقة ${data.unitNumber}`;
  }, [recipientChoice, data, selectedOtherResident, customRecipientName]);

  const fileName = isReceipt
    ? `إيصال_سداد_شقة_${data.unitNumber}_شهر_${data.month}_${data.year}.png`
    : `إشعار_مطالبة_شقة_${data.unitNumber}_شهر_${data.month}_${data.year}.png`;

  // Pre-generate printable image as soon as modal opens or data changes
  const printableRef = useRef<HTMLDivElement>(null);

  const generateImage = async () => {
    try {
      setIsGeneratingImage(true);
      const res = await generateElementImageBlob('receipt-claim-printable-container', fileName, 680);
      setImageBlob(res.blob);
      setImageDataUrl(res.dataUrl);
    } catch (err) {
      console.warn('Fast image generation warning, falling back to direct canvas:', err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  useEffect(() => {
    // Generate image after brief DOM render tick
    const t = setTimeout(() => {
      generateImage();
    }, 120);
    return () => clearTimeout(t);
  }, [data]);

  // Construct formatted RTL text for WhatsApp
  const shareText = useMemo(() => {
    if (isReceipt) {
      let t = `🏢 *اتحاد ملاك عمارة بيراميدز فيو ١*\n`;
      t += `💐 *إيصال سداد واستلام مالي معتمد*\n`;
      t += `-----------------------------------\n`;
      t += `🚪 *الوحدة:* شقة ${data.unitNumber}\n`;
      t += `👤 *الساكن / الشاغل:* ${data.residentName}\n`;
      if (hasTenant && data.tenantName) {
        t += `🔑 *المستأجر:* ${data.tenantName}\n`;
      }
      t += `💰 *المبلغ المسدد:* *${Math.round(data.amount).toLocaleString()} جنيه مصري* ✓\n`;
      t += `🗓 *بيان الاشتراك:* شهر ${monthName} (${data.year})\n`;
      if (data.paymentType) {
        t += `🏷 *فئة التحصيل:* ${data.paymentType}\n`;
      }
      t += `🔢 *رقم الإيصال:* ${docNumber}\n`;
      t += `📅 *تاريخ التحصيل:* ${data.date || `${data.year}-${data.month}`}\n`;
      if (data.notes) {
        t += `📝 *ملاحظات:* ${data.notes}\n`;
      }
      t += `-----------------------------------\n`;
      t += `شاكرين لكم حسن تعاونكم الدائم في الحفاظ على العمارة وتطوير خدماتها.\n`;
      t += `إدارة اتحاد ملاك بيراميدز فيو ١`;
      return t;
    } else {
      let t = `🏢 *اتحاد ملاك عمارة بيراميدز فيو ١*\n`;
      t += `🏛️ *إشعار مطالبة وبيان مستحقات شهرية*\n`;
      t += `-----------------------------------\n`;
      t += `تحية طيبة،\n`;
      t += `نحيط سيادتكم علماً ببيان مستحقات الوحدة السكنية رقم (*شقة ${data.unitNumber}*) - ${data.residentName}:\n\n`;
      if (data.monthlyFee) {
        t += `• *الاشتراك الشهري:* ${Math.round(data.monthlyFee).toLocaleString()} ج.م (عن شهر ${monthName} ${data.year})\n`;
      }
      if (data.carriedBalance !== undefined && data.carriedBalance !== 0) {
        t += `• *رصيد سابق مرحل:* ${data.carriedBalance < 0 ? `مديونية سابقة (-${Math.abs(data.carriedBalance).toLocaleString()} ج.م)` : `فائض سابق (+${data.carriedBalance.toLocaleString()} ج.م)`}\n`;
      }
      t += `💰 *إجمالي المبلغ المطلوب سداده:* *${Math.round(data.amount).toLocaleString()} جنيه مصري*\n`;
      t += `🔢 *رقم المطالبة:* ${docNumber}\n`;
      t += `📅 *تاريخ الإصدار:* ${data.date || new Date().toISOString().split('T')[0]}\n`;
      if (data.notes) {
        t += `📝 *ملاحظات:* ${data.notes}\n`;
      }
      t += `-----------------------------------\n`;
      t += `يرجى التكرم بسرعة سداد المستحقات لتغطية مصروفات الصيانة الدورية ومستحقات الخدمات المشتركة.\n`;
      t += `شاكرين ومقدرين حسن تعاونكم الدائم.\n`;
      t += `إدارة اتحاد ملاك بيراميدز فيو ١`;
      return t;
    }
  }, [data, isReceipt, monthName, docNumber, hasTenant]);

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

  const handleCopyImage = async () => {
    if (!imageBlob) return;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': imageBlob }),
        ]);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2500);
      } else {
        alert('المتصفح لا يدعم نسخ الصور مباشرة، يمكنك الضغط على زر تحميل الصورة.');
      }
    } catch (e) {
      console.warn('Clipboard write error:', e);
      alert('تعذر نسخ الصورة للحافظة، يمكنك الضغط على تحميل الصورة.');
    }
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
        title: isReceipt ? `إيصال سداد شقة ${data.unitNumber}` : `إشعار مطالبة شقة ${data.unitNumber}`,
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
                <span>{isReceipt ? 'إيصال سداد واستلام مالي' : 'إشعار مطالبة شهرية'}</span>
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-lg">شقة {data.unitNumber}</span>
              </h3>
              <p className="text-[11px] text-white/80 font-bold">
                {isReceipt ? 'مستند تحصيل معتمد' : 'بيان مستحقات ومطالبة رسمية'} • {monthName} {data.year}
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
                      شقة {r.flatNumber} - {r.name} {r.phone ? `(${formatMobileNumber(r.phone)})` : ''}
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
              <span className="text-[11px] text-emerald-700 font-bold">جاهز للإرسال الفوري</span>
            </div>

            {/* Scrollable Container with generated image or direct rendered card */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-72 sm:max-h-96 overflow-y-auto bg-slate-100 flex items-center justify-center p-2.5 shadow-inner">
              {imageDataUrl ? (
                <img 
                  src={imageDataUrl} 
                  alt="معاينة المستند" 
                  className="w-full max-w-lg h-auto object-contain rounded-xl border border-slate-300 shadow-xs bg-white"
                />
              ) : (
                <div className="py-14 text-slate-400 text-xs font-bold flex flex-col items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full border-3 border-emerald-600 border-t-transparent animate-spin" />
                  <span>جاري معالجة وتجهيز صورة المستند عالية الدقة...</span>
                </div>
              )}
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
              onClick={handleCopyImage}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
              title="نسخ الصورة للحافظة"
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">تم النسخ ✓</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-600" />
                  <span>نسخ الصورة</span>
                </>
              )}
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
          width: '680px',
          maxWidth: '680px',
          padding: '24px',
          backgroundColor: '#ffffff',
          color: '#0f172a',
          borderRadius: '16px',
          border: isReceipt ? '2px solid #059669' : '2px solid #2563eb',
          boxSizing: 'border-box',
          fontFamily: 'Cairo, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Card Header */}
        <div
          style={{
            backgroundColor: isReceipt ? '#047857' : '#1e3a8a',
            color: '#ffffff',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div>
            <div style={{ fontSize: '18px', fontWeight: '900', letterSpacing: 'normal' }}>
              اتحاد ملاك عمارة بيراميدز فيو ١
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: '700', color: isReceipt ? '#a7f3d0' : '#bfdbfe', marginTop: '3px' }}>
              {isReceipt ? '💐 إيصال سداد واستلام مالي معتمد' : '🏛️ إشعار مطالبة وبيان مستحقات شهرية'}
            </div>
          </div>
          <div
            style={{
              backgroundColor: isReceipt ? '#065f46' : '#172554',
              borderRadius: '8px',
              padding: '6px 14px',
              textAlign: 'center',
              border: isReceipt ? '1px solid #10b981' : '1px solid #3b82f6',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: '800', color: isReceipt ? '#a7f3d0' : '#93c5fd' }}>
              {isReceipt ? 'رقم الإيصال الرسمي' : 'رقم المطالبة'}
            </div>
            <div style={{ fontSize: '13.5px', fontWeight: '900', color: '#ffffff', fontFamily: 'monospace' }}>
              {docNumber}
            </div>
          </div>
        </div>

        {/* Details Table / Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>الوحدة السكنية:</span>
            <span style={{ fontSize: '14px', fontWeight: '900', color: '#0f172a' }}>شقة رقم ({data.unitNumber})</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>اسم الساكن / الشاغل:</span>
            <span style={{ fontSize: '14px', fontWeight: '900', color: '#0f172a' }}>{data.residentName}</span>
          </div>

          {hasTenant && data.tenantName && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>المستأجر الحالي:</span>
              <span style={{ fontSize: '14px', fontWeight: '900', color: '#1e3a8a' }}>{data.tenantName}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>بيان الاشتراك:</span>
            <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#0f172a' }}>اشتراك شهر {monthName} ({data.year})</span>
          </div>

          {data.paymentType && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>فئة المعاملة:</span>
              <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#0f172a' }}>{data.paymentType}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>
              {isReceipt ? 'تاريخ السداد والتحصيل:' : 'تاريخ إصدار المطالبة:'}
            </span>
            <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#0f172a' }}>
              {data.date || `${data.year}-${data.month}`}
            </span>
          </div>

          {/* Breakdown Items if provided */}
          {data.breakdown && data.breakdown.map((item, bIdx) => (
            <div key={bIdx} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>{item.label}:</span>
              <span style={{ fontSize: '13.5px', fontWeight: item.isHighlight ? '900' : '700', color: item.color || '#0f172a' }}>{item.value}</span>
            </div>
          ))}

          {/* Big Amount Highlight Banner */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 18px',
              backgroundColor: isReceipt ? '#ecfdf5' : '#eff6ff',
              borderRadius: '10px',
              border: isReceipt ? '2px solid #10b981' : '2px solid #3b82f6',
              marginTop: '6px',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: '900', color: isReceipt ? '#065f46' : '#1e3a8a' }}>
              {isReceipt ? 'المبلغ المستلم والمسدد:' : 'إجمالي المبلغ المطلوب:'}
            </span>
            <span
              style={{
                fontSize: '20px',
                fontWeight: '900',
                color: isReceipt ? '#047857' : '#1e40af',
                letterSpacing: 'normal',
              }}
            >
              {Math.round(data.amount).toLocaleString()} جنيه مصري
            </span>
          </div>

          {data.notes && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fef3c7' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#92400e' }}>ملاحظات:</span>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#78350f' }}>{data.notes}</span>
            </div>
          )}
        </div>

        {/* Footer & Watermark */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '12px',
            borderTop: '1px dashed #cbd5e1',
            fontSize: '11px',
            fontWeight: '700',
            color: '#64748b',
          }}
        >
          <span>إدارة اتحاد ملاك عمارة بيراميدز فيو ١</span>
          <span style={{ color: '#94a3b8' }}>مستند إلكتروني رسمي وموثق بالسجلات المالية ✓</span>
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
