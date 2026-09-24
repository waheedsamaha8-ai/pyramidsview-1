import React, { useState } from 'react';
import { Resident } from '../types';
import { 
  Share2, 
  Copy, 
  Check, 
  X, 
  Send, 
  Building2, 
  User, 
  Phone, 
  MessageSquare, 
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { formatMobileNumber, formatPhoneForDisplay, toWhatsAppNumber } from '../utils/phoneUtils';
import { getActiveFirebaseConfig } from '../services/firebaseConfig';

interface ResidentInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  residents: Resident[];
  initialResident?: Resident | null;
  onNotification?: (title: string, message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

const ResidentInviteModalContent: React.FC<{
  onClose: () => void;
  residents: Resident[];
  initialResident?: Resident | null;
  onNotification?: (title: string, message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}> = ({
  onClose,
  residents,
  initialResident,
  onNotification,
}) => {
  const [selectedFlat, setSelectedFlat] = useState<string>(
    initialResident ? String(initialResident.flatNumber) : ''
  );
  const [residentName, setResidentName] = useState<string>(
    initialResident ? initialResident.name : ''
  );
  const [residentPhone, setResidentPhone] = useState<string>(
    initialResident ? (initialResident.phone || initialResident.tenantPhone || '') : ''
  );
  const [residentType, setResidentType] = useState<'OWNER' | 'TENANT'>(
    initialResident?.ownershipType === 'إيجار' ? 'TENANT' : 'OWNER'
  );
  const [copied, setCopied] = useState(false);

  // When flat changes, auto-fill resident info if found
  const handleFlatChange = (flat: string) => {
    setSelectedFlat(flat);
    const found = residents.find(r => String(r.flatNumber) === String(flat));
    if (found) {
      setResidentName(found.name);
      setResidentPhone(found.phone || found.tenantPhone || '');
      setResidentType(found.ownershipType === 'إيجار' ? 'TENANT' : 'OWNER');
    }
  };

  // Generate invite URL
  const activeBId = (typeof window !== 'undefined' && localStorage.getItem('active_building_id')) || '';
  const activeBCode = (typeof window !== 'undefined' && localStorage.getItem('active_building_code')) || 'union';
  const foundResident = residents.find(r => String(r.flatNumber) === String(selectedFlat));
  const resEmail = foundResident?.email || `flat${selectedFlat}@${activeBCode.toLowerCase()}.com`;
  const resPassword = foundResident?.password || `pyr${selectedFlat}#2026`;

  const fbConfig = getActiveFirebaseConfig();
  const apiKeyParam = fbConfig.apiKey ? `&apiKey=${encodeURIComponent(fbConfig.apiKey)}` : '';
  const projectIdParam = fbConfig.projectId ? `&projectId=${encodeURIComponent(fbConfig.projectId)}` : '';
  const inviteUrl = `https://waheedsamaha8-ai.github.io/pyramidsview-1/?invite=true&bld=${encodeURIComponent(activeBId)}${apiKeyParam}${projectIdParam}&flat=${encodeURIComponent(selectedFlat || '')}&name=${encodeURIComponent(residentName || '')}&email=${encodeURIComponent(resEmail)}&pass=${encodeURIComponent(resPassword)}`;

  // Formatted Invitation Text
  const buildingName = (typeof window !== 'undefined' && localStorage.getItem('active_building_name')) || 'العمارة';
  const inviteMessage = `🏢 *دعوة رسمية للانضمام إلى اتحاد ملاك ${buildingName}*
━━━━━━━━━━━━━━━━━━━━
السيد/ة المحترم/ة: ${residentName || 'ساكن العمارة الكريم'}
${selectedFlat ? `الوحدة رقم: ${selectedFlat} (${residentType === 'OWNER' ? 'مالك' : 'مستأجر'})` : ''}

تحية طيبة وبعد،،
يسر مجلس إدارة اتحاد شاغلي وملاك ${buildingName} دعوتكم للانضمام إلى المنظومة الرقمية الرسمية للعمارة.

✉️ البريد الإلكتروني الخاص بك: ${resEmail}
🔑 كلمة المرور الخاصة بك: ${resPassword}

📲 *رابط الدخول التلقائي والمباشر دون الحاجة لكتابة بيانات:*
${inviteUrl}

نتشرف بانضمامكم لخدمة وتطوير عمارتنا.
*مجلس إدارة اتحاد الملاك*`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteMessage).then(() => {
      setCopied(true);
      if (onNotification) {
        onNotification('تم نسخ الدعوة', 'تم نسخ نص ورابط دعوة الانضمام إلى الحافظة بنجاح.', 'success');
      }
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const handleSendWhatsApp = () => {
    const cleanPhone = toWhatsAppNumber(residentPhone);

    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(inviteMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`;

    window.open(waUrl, '_blank');
  };

  const handleWebShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'دعوة انضمام لاتحاد ملاك بيراميدز فيو 1',
        text: inviteMessage,
        url: inviteUrl,
      }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fade-in" dir="rtl">
      <div className="bg-white dark:bg-[#111a2e] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 via-blue-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
              <Share2 className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black flex items-center gap-1.5">
                <span>دعوة ساكن للانضمام للاتحاد</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30">
                  نظام الدعوات
                </span>
              </h3>
              <p className="text-[11px] text-blue-200/80 font-medium">
                إرسال رابط انضمام مخصص للشقة عبر واتساب أو نسخ الدعوة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-right">
          {/* Quick select or input */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                رقم الشقة / الوحدة
              </label>
              <input
                type="text"
                value={selectedFlat}
                onChange={(e) => handleFlatChange(e.target.value)}
                placeholder="مثال: 204 أو 102"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/30 text-right"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                صفة الساكن
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setResidentType('OWNER')}
                  className={`flex-1 py-2 text-xs font-black rounded-xl border transition cursor-pointer ${
                    residentType === 'OWNER'
                      ? 'bg-blue-900 text-white border-blue-900 shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  مالك
                </button>
                <button
                  type="button"
                  onClick={() => setResidentType('TENANT')}
                  className={`flex-1 py-2 text-xs font-black rounded-xl border transition cursor-pointer ${
                    residentType === 'TENANT'
                      ? 'bg-blue-900 text-white border-blue-900 shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  مستأجر
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                اسم الساكن (اختياري)
              </label>
              <input
                type="text"
                value={residentName}
                onChange={(e) => setResidentName(e.target.value)}
                placeholder="اسم المالك أو المستأجر"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/30 text-right"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                رقم هاتف الواتساب
              </label>
              <input
                type="tel"
                value={residentPhone}
                onChange={(e) => setResidentPhone(e.target.value)}
                placeholder="مثال: 01012345678"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/30 text-right"
              />
            </div>
          </div>

          {/* Invitation Message Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-blue-900 dark:text-blue-400" />
                <span>معاينة نص الدعوة الموجهة</span>
              </span>
              <span className="text-[10px] text-slate-400 font-bold">
                تتضمن رابطاً ذكياً يملأ رقم الشقة تلقائياً
              </span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl text-[11.5px] font-bold text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">
              {inviteMessage}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'تم النسخ بنجاح ✓' : 'نسخ نص الدعوة'}</span>
          </button>

          <div className="flex items-center gap-2">
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                onClick={handleWebShare}
                className="px-3.5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>مشاركة</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-98"
            >
              <Send className="w-4 h-4 transform rotate-180" />
              <span>إرسال عبر WhatsApp 💬</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ResidentInviteModal: React.FC<ResidentInviteModalProps> = ({
  isOpen,
  onClose,
  residents,
  initialResident,
  onNotification,
}) => {
  if (!isOpen) return null;
  return (
    <ResidentInviteModalContent
      onClose={onClose}
      residents={residents}
      initialResident={initialResident}
      onNotification={onNotification}
    />
  );
};
