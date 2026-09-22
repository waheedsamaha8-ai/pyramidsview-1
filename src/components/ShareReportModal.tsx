import React, { useState, useMemo } from 'react';
import { Resident } from '../types';
import { shareImageViaWhatsApp } from '../utils/shareImageViaWhatsApp';
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
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface ShareReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  reportTitle?: string;
  reportType?: 'payments' | 'expenses';
  reportPeriodText: string;
  reportStatsText: string;
  imageBlob: Blob | null;
  imageDataUrl: string | null;
  fileName: string;
  residents?: Resident[];
  initialResidentId?: string;
  defaultPhone?: string;
  defaultRecipientName?: string;
  onSuccessToast?: (msg: string) => void;
}

export const ShareReportModal: React.FC<ShareReportModalProps> = ({
  isOpen,
  onClose,
  title,
  reportTitle,
  reportType = 'payments',
  reportPeriodText,
  reportStatsText,
  imageBlob,
  imageDataUrl,
  fileName,
  residents = [],
  initialResidentId = '',
  defaultPhone = '',
  defaultRecipientName = '',
  onSuccessToast,
}) => {
  const displayTitle = reportTitle || title || (reportType === 'payments' ? 'تقرير تحصيلات معتمد' : 'تقرير مصروفات معتمد');
  const [selectedResidentId, setSelectedResidentId] = useState(initialResidentId);
  const [customPhone, setCustomPhone] = useState(defaultPhone);
  const [targetType, setTargetType] = useState<'resident' | 'custom'>('resident');
  const [isCopied, setIsCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync when props change
  React.useEffect(() => {
    if (initialResidentId) {
      setSelectedResidentId(initialResidentId);
      setTargetType('resident');
    }
  }, [initialResidentId, isOpen]);

  const activeResident = useMemo(() => {
    if (!selectedResidentId) return null;
    return residents.find(r => r.id === selectedResidentId) || null;
  }, [selectedResidentId, residents]);

  const targetPhone = useMemo(() => {
    if (targetType === 'resident') {
      return activeResident?.phone || activeResident?.tenantPhone || '';
    }
    return customPhone;
  }, [targetType, activeResident, customPhone]);

  const targetRecipientName = useMemo(() => {
    if (targetType === 'resident') {
      return activeResident ? `شقة ${activeResident.flatNumber} (${activeResident.name})` : defaultRecipientName;
    }
    return defaultRecipientName || 'مجموعة العمارة / الإدارة';
  }, [targetType, activeResident, defaultRecipientName]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!imageDataUrl && !imageBlob) return;
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

  const handleCopy = async () => {
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
    }
  };

  const handleShare = async () => {
    if (!imageBlob) {
      alert('لم يتم توليد الصورة بعد، يُرجى الانتظار أو إعادة المحاولة.');
      return;
    }

    setIsSharing(true);
    try {
      const typeLabel = reportType === 'payments' ? 'تقرير التحصيلات' : 'تقرير المصروفات';
      const cleanPhone = toWhatsAppNumber(targetPhone);

      let shareText = `🏢 *اتحاد ملاك عمارة بيراميدز فيو ١*\n`;
      shareText += `📊 *${typeLabel} معتمد*\n`;
      shareText += `🗓 ${reportPeriodText}\n`;
      shareText += `📌 ${reportStatsText}\n`;
      if (activeResident) {
        shareText += `🚪 *الوحدة:* شقة ${activeResident.flatNumber} (${activeResident.name})\n`;
      }
      shareText += `-----------------------------------\n`;
      shareText += `مرفق صورة التقرير الرسمية بدقة عالية ومطابقة للبيانات الحالية.\n`;
      shareText += `إدارة اتحاد ملاك بيراميدز فيو ١`;

      await shareImageViaWhatsApp({
        imageBlob,
        fileName,
        phone: targetPhone,
        recipientName: targetRecipientName,
        title: `${typeLabel} - بيراميدز فيو ١`,
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
      console.error('Error sharing image via whatsapp:', err);
      alert('حدث خطأ أثناء محاولة المشاركة، تم حفظ الصورة على جهازك.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-100 shadow-2xl overflow-hidden text-right flex flex-col max-h-[92vh] animate-scale-up">
        
        {/* Header */}
        <div className="bg-slate-50 px-5 py-4 flex items-center justify-between border-b border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 text-slate-500 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900">{displayTitle}</h3>
              <p className="text-[11px] text-slate-500 font-bold">{reportPeriodText}</p>
            </div>
            <div className="w-9 h-9 bg-emerald-700 text-white rounded-xl flex items-center justify-center shadow-xs">
              <Share2 className="w-4.5 h-4.5" />
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-right">
          
          {/* Toast Notification Banner */}
          {toastMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-start gap-2 animate-fade-in">
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

          {/* Report Summary Pill */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-extrabold text-slate-700">بيانات التقرير المتزامنة مع الشاشة:</span>
            </div>
            <span className="font-black text-slate-900 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
              {reportStatsText}
            </span>
          </div>

          {/* Recipient Selection Section */}
          <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3">
            <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-blue-900" />
              <span>مشاركة التقرير مباشرة لرقم الواتساب:</span>
            </label>

            {/* Target Options */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setTargetType('resident')}
                className={`py-2 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                  targetType === 'resident'
                    ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>إرسال لوحدة معينة</span>
              </button>

              <button
                type="button"
                onClick={() => setTargetType('custom')}
                className={`py-2 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                  targetType === 'custom'
                    ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>رقم مخصص / عام</span>
              </button>
            </div>

            {targetType === 'resident' ? (
              <div className="space-y-2 pt-1">
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={selectedResidentId}
                    onChange={(e) => setSelectedResidentId(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="">-- اختر الوحدة المرتبطة لإرسال التقرير إليها --</option>
                    {residents.map(r => (
                      <option key={r.id} value={r.id}>
                        شقة {r.flatNumber} - {r.name} {r.phone ? `(${formatMobileNumber(r.phone)})` : '(بدون هاتف)'}
                      </option>
                    ))}
                  </select>
                </div>

                {activeResident ? (
                  <div className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-bold">الرقم المسجل للوحدة:</span>
                    <span className="font-mono font-black text-emerald-800 phone-number-display" dir="ltr">
                      {activeResident.phone || activeResident.tenantPhone 
                        ? formatPhoneForDisplay(activeResident.phone || activeResident.tenantPhone) 
                        : 'غير مسجل رقم هاتف'}
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    اختر وحدة من القائمة لإرسال التقرير فوراً إلى رقم الواتساب الخاص بها.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="relative">
                  <input
                    type="tel"
                    placeholder="رقم الهاتف (مثال: 01007911777 أو +966539313467 أو اتركه فارغاً لمجموعة واتساب)"
                    value={customPhone}
                    onChange={(e) => setCustomPhone(normalizePhoneInput(e.target.value))}
                    onBlur={() => setCustomPhone(formatMobileNumber(customPhone))}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-bold outline-none text-left font-mono placeholder:text-right placeholder:font-sans"
                    dir="ltr"
                  />
                </div>
                <p className="text-[10.5px] text-slate-500">
                  إذا تركت الحقل فارغاً، سيتم فتح تطبيق واتساب لتختار المحادثة أو المجموعة المراد إرسال التقرير إليها مباشرة.
                </p>
              </div>
            )}
          </div>

          {/* Generated Image Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 font-bold">
              <span className="flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-blue-900" />
                <span>معاينة صورة التقرير المتزامن:</span>
              </span>
              <span className="text-[10.5px] text-slate-400">دقة فائقة جاهزة للإرسال</span>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-64 sm:max-h-80 overflow-y-auto bg-slate-100 flex items-center justify-center p-2 shadow-inner">
              {imageDataUrl ? (
                <img 
                  src={imageDataUrl} 
                  alt="معاينة التقرير" 
                  className="w-full h-auto object-contain rounded-xl border border-slate-300 shadow-xs bg-white"
                />
              ) : (
                <div className="py-12 text-slate-400 text-xs font-bold flex flex-col items-center gap-2">
                  <ImageIcon className="w-8 h-8 opacity-40 animate-pulse" />
                  <span>جاري معالجة صورة التقرير...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          
          {/* Secondary Actions */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDownload}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              title="تنزيل صورة التقرير على الجهاز"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>تحميل الصورة</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              title="نسخ صورة التقرير للحافظة"
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">تم النسخ ✓</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-600" />
                  <span>نسخ للحافظة</span>
                </>
              )}
            </button>
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            disabled={isSharing || !imageBlob}
            onClick={handleShare}
            className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
          >
            <Share2 className="w-4 h-4 text-emerald-200" />
            <span>
              {isSharing
                ? 'جاري المشاركة...'
                : (targetPhone ? `مشاركة على واتساب ${targetRecipientName}` : 'مشاركة التقرير عبر واتساب')}
            </span>
          </button>

        </div>
      </div>
    </div>
  );
};
