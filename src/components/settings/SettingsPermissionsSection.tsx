import React, { useState } from 'react';
import { 
  BookOpen, Edit3, Plus, Trash2, Shield, Briefcase, Check, X, 
  UserCheck, AlertTriangle 
} from 'lucide-react';
import { AppConfig } from '../../types';
import * as firestoreService from '../../services/firestoreService';
import { getActiveBuilding, deleteBuilding, deleteAllBuildings } from '../../services/buildingStore';
import { logoutUser } from '../../services/firebaseConfig';

interface SettingsPermissionsSectionProps {
  config: AppConfig;
  isAdmin: boolean;
  rules: string[];
  onAddRule?: (ruleText: string) => void;
  onDeleteRule?: (index: number) => void;
  onOpenEditRulesModal?: () => void;
  newRuleInput: string;
  setNewRuleInput: (val: string) => void;
  handleAddNewRule: (e: React.FormEvent) => void;
  allBuildings: any[];
  selectedBuildingId: string;
  setSelectedBuildingId: (id: string) => void;
  onSaveConfig: (updatedConfig: AppConfig) => void;
  onNotification?: (title: string, message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

export const SettingsPermissionsSection: React.FC<SettingsPermissionsSectionProps> = ({
  config,
  isAdmin,
  rules,
  onDeleteRule,
  onOpenEditRulesModal,
  newRuleInput,
  setNewRuleInput,
  handleAddNewRule,
  allBuildings,
  selectedBuildingId,
  setSelectedBuildingId,
  onSaveConfig,
  onNotification,
}) => {
  // Input states for admins and assistant
  const [newAdminEmail, setNewAdminEmail] = useState('');
  
  // Technical Assistant state
  const [assistantEmail, setAssistantEmail] = useState(config.assistantConfig?.email || '');
  const [assistantPassword, setAssistantPassword] = useState(config.assistantConfig?.password || '');
  const [assistantName, setAssistantName] = useState(config.assistantConfig?.name || 'المساعد الفني');
  const [assistantSavedSuccess, setAssistantSavedSuccess] = useState(false);
  const [assistantPhone, setAssistantPhone] = useState('');

  // Building Management Delete State
  const [buildingDeleteModal, setBuildingDeleteModal] = useState<{
    isOpen: boolean;
    type: 'single' | 'all';
    buildingName?: string;
  }>({ isOpen: false, type: 'single' });
  const [isDeletingBuilding, setIsDeletingBuilding] = useState(false);

  const activeBuilding = getActiveBuilding();
  const primaryAdminEmail = (activeBuilding?.presidentEmail || config.presidentEmail || '').trim().toLowerCase();
  const effectiveAdmins = Array.from(new Set([
    ...(primaryAdminEmail ? [primaryAdminEmail] : []),
    ...(config.admins || []).map(a => a.trim().toLowerCase())
  ])).filter(Boolean);

  const handleAddAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    const email = newAdminEmail.trim().toLowerCase();
    if (!email || effectiveAdmins.includes(email)) return;
    const updated = {
      ...config,
      admins: [...effectiveAdmins, email],
    };
    onSaveConfig(updated);
    setNewAdminEmail('');
  };

  const handleDeleteAdmin = (email: string) => {
    if (!isAdmin) return;
    if (primaryAdminEmail && email.trim().toLowerCase() === primaryAdminEmail) {
      alert('لا يمكن إلغاء تفويض الأدمن الرئيسي (البريد الإلكتروني المسجل به الاتحاد).');
      return;
    }
    const filtered = (config.admins || []).filter((x) => x.toLowerCase() !== email.toLowerCase());
    const updated = {
      ...config,
      admins: filtered,
    };
    onSaveConfig(updated);
  };

  const handleSaveAssistantConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!assistantEmail.trim() || !assistantPassword.trim()) return;

    const updated: AppConfig = {
      ...config,
      assistantConfig: {
        email: assistantEmail.trim().toLowerCase(),
        password: assistantPassword.trim(),
        name: assistantName.trim() || 'المساعد الفني',
      },
    };
    onSaveConfig(updated);
    setAssistantSavedSuccess(true);
    setTimeout(() => setAssistantSavedSuccess(false), 3000);
  };

  const handleRemoveAssistantConfig = () => {
    if (!isAdmin) return;
    const updated: AppConfig = {
      ...config,
    };
    delete updated.assistantConfig;
    onSaveConfig(updated);
    setAssistantEmail('');
    setAssistantPassword('');
    setAssistantName('المساعد الفني');
  };

  const handleSendAssistantWhatsAppInvite = () => {
    if (!assistantEmail.trim() || !assistantPassword.trim()) {
      alert('يرجى حفظ تفويض المساعد الفني وتعبئة البريد الإلكتروني وكلمة المرور أولاً.');
      return;
    }
    if (!assistantPhone.trim()) {
      alert('يرجى إدخال رقم موبايل المساعد الفني لإرسال الدعوة.');
      return;
    }

    const cleanPhone = assistantPhone.trim().replace(/[^\d+]/g, '');
    const activeBId = (typeof window !== 'undefined' && localStorage.getItem('active_building_id')) || '';
    const fbConfig = firestoreService.getActiveFirebaseConfig();
    const apiKeyParam = fbConfig.apiKey ? `&apiKey=${encodeURIComponent(fbConfig.apiKey)}` : '';
    const projectIdParam = fbConfig.projectId ? `&projectId=${encodeURIComponent(fbConfig.projectId)}` : '';

    const appUrl = `https://waheedsamaha8-ai.github.io/pyramidsview-1/?invite_assistant=true&bld=${encodeURIComponent(activeBId)}${apiKeyParam}${projectIdParam}&name=${encodeURIComponent(assistantName || '')}&email=${encodeURIComponent(assistantEmail.trim())}&pass=${encodeURIComponent(assistantPassword.trim())}`;

    const message = `مرحباً بك أستاذ/ة ${assistantName} 👋

يسرنا دعوتكم للانضمام إلى تطبيق اتحاد الملاك للعمل بصفة (مساعد فني).

بيانات دخولك المخصصة للتطبيق:
👤 الاسم: ${assistantName}
✉️ البريد الإلكتروني: ${assistantEmail}
🔑 كلمة المرور: ${assistantPassword}

رابط دخول التطبيق المباشر (مفعل بالكامل لمبنى سيادتكم بصفة مساعد فني):
${appUrl}

نتمنى لك تجربة متميزة بالتطبيق!`;

    if (cleanPhone) {
      let formatted = cleanPhone;
      if (formatted.startsWith('01') && formatted.length === 11) {
        formatted = '2' + formatted; // Egypt code
      }
      const waUrl = `https://wa.me/${formatted.startsWith('+') ? formatted.slice(1) : formatted}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
    } else {
      navigator.clipboard.writeText(message);
      alert('تم نسخ رسالة الدعوة للمساعد الفني بنجاح! يمكنك إرسالها يدوياً.');
    }
  };

  const handleConfirmDeleteBuilding = async () => {
    setIsDeletingBuilding(true);
    try {
      if (buildingDeleteModal.type === 'single') {
        const targetId = selectedBuildingId;
        const targetB = allBuildings.find(b => b.id === targetId);
        const bName = targetB?.name || config.buildingName || 'هذا الاتحاد';
        
        if (targetId) {
          await deleteBuilding(targetId);
          onNotification?.('تم الحذف بنجاح 🗑️', `تم حذف اتحاد "${bName}" وكافة سجلاته المالية وسكاناته بنجاح.`, 'success');
          
          const currentBuilding = getActiveBuilding();
          if (currentBuilding && currentBuilding.id === targetId) {
            try {
              await logoutUser();
            } catch (e) {
              console.warn('Logout error ignored during building deletion:', e);
            }
            localStorage.removeItem('custom_user_session');
            localStorage.removeItem('user_role');
            localStorage.removeItem('app_user_role');
            localStorage.removeItem('google_access_token');
            localStorage.removeItem('active_president_email');
            localStorage.removeItem('active_building_v1');
            setTimeout(() => {
              window.location.reload();
            }, 400);
          } else {
            setTimeout(() => {
              window.location.reload();
            }, 400);
          }
        }
      } else {
        await deleteAllBuildings();
        onNotification?.('تم الحذف النهائي ⚠️', 'تم حذف كافة الاتحادات والعمارات المسجلة نهائياً. التطبيق جاهز تماماً بحالة المصنع لتسجيل اتحاد جديد.', 'success');
        localStorage.removeItem('custom_user_session');
        localStorage.removeItem('user_role');
        localStorage.removeItem('app_user_role');
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    } catch (err: any) {
      onNotification?.('خطأ في الحذف', err.message || 'تعذر إتمام عملية الحذف', 'error');
    } finally {
      setIsDeletingBuilding(false);
      setBuildingDeleteModal({ isOpen: false, type: 'single' });
    }
  };

  return (
    <div className="space-y-3 text-right">
      {/* Rules Management Card inside Permissions */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3 text-right">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-2.5 gap-2">
          <div className="text-right">
            <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-yellow-700" />
              <span>تعديل وصياغة لائحة وتعليمات إدارة العمارة ({rules.length})</span>
            </h3>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              يمكن لرئيس الاتحاد إضافة وتعديل وحذف بنود وقواعد حسن الجوار المنظمة للعقار ليطلع عليها جميع السكان.
            </p>
          </div>
          {onOpenEditRulesModal && isAdmin && (
            <button
              onClick={onOpenEditRulesModal}
              className="px-3 py-1.5 bg-blue-50 text-blue-900 hover:bg-blue-100 rounded-xl text-xs font-bold transition flex items-center gap-1.5 self-start cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>فتح نافذة التعديل المنفصلة</span>
            </button>
          )}
        </div>

        {isAdmin && (
          <form onSubmit={handleAddNewRule} className="flex gap-1.5">
            <button
              type="submit"
              className="px-3.5 py-2 bg-blue-900 text-white rounded-xl font-bold text-xs hover:bg-blue-950 active:scale-[0.98] transition flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة مادة للائحة</span>
            </button>
            <input
              type="text"
              placeholder="اكتب نص المادة أو التعليمات الجديدة (مثال: يمنع استخدام المصعد لنقل مواد البناء الثقيلة)..."
              value={newRuleInput}
              onChange={(e) => setNewRuleInput(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-xl text-xs outline-none text-right font-bold transition"
              required
            />
          </form>
        )}

        {/* List of rules */}
        <div className="space-y-2">
          {rules.length === 0 ? (
            <p className="text-center text-xs text-slate-400 font-bold py-4">لا توجد مواد تعليمات مسجلة حالياً.</p>
          ) : (
            rules.map((rule, idx) => (
              <div key={idx} className="flex items-start justify-between gap-2.5 p-2.5 bg-slate-50/60 hover:bg-slate-50 border border-slate-100 rounded-xl transition">
                {isAdmin && onDeleteRule && (
                  <button
                    onClick={() => onDeleteRule(idx)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer shrink-0"
                    title="حذف البند"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="flex-1 text-right">
                  <span className="inline-block px-1.5 py-0.5 bg-yellow-50 text-yellow-900 border border-yellow-200/50 text-[10px] font-black rounded-md ml-2">
                    مادة {idx + 1}
                  </span>
                  <span className="text-xs text-slate-800 font-bold leading-relaxed">{rule}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Split roles comparison grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 1. Admin/President Capabilities */}
        <div className="bg-white p-3.5 sm:p-4.5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b pb-2 mb-1">
            <span className="px-2.5 py-0.5 bg-blue-900 text-white text-[10px] font-black rounded-md">رئيس الاتحاد (المدير الإداري)</span>
            <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <span>صلاحيات رئيس الاتحاد</span>
              <Shield className="w-3.5 h-3.5 text-blue-950 fill-blue-50" />
            </h3>
          </div>

          <p className="text-xs text-slate-500 font-bold leading-relaxed">يتمتع رئيس الاتحاد بكامل الصلاحيات الإدارية والرقابية والمالية لضمان سلامة تشغيل العقار ومصالح الملاك العليا.</p>

          <div className="space-y-2">
            {[
              'إدارة وإضافة وحذف وحساب شؤون السكان',
              'تسجيل، تعديل، وحذف كشوفات التحصيلات والاشتراكات المعتمدة',
              'تسجيل وتحديث وفلترة وحذف فواتير المصروفات والنفقات',
              'صياغة وإدارة اللائحة الداخلية وجدول العقوبات للعمارة',
              'صياغة ونشر القرارات والاستبيانات التفاعلية وتصفية الأصوات',
              'تنسيق وإقرار الأجندة والأحداث في تقويم العمارة التفاعلي',
              'إرسال التنبيهات والإشعارات العامة لكافة السكان دفعة واحدة',
              'تعديل وإعادة تهيئة إعدادات النظام ومصنفات الوحدات والتحصيلات',
            ].map((cap, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="mt-0.5 w-3.5 h-3.5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
                <span className="text-xs text-slate-700 font-bold leading-normal">{cap}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Resident Capabilities */}
        <div className="bg-white p-3.5 sm:p-4.5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b pb-2 mb-1">
            <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-black rounded-md">ساكن / مالك وحدة</span>
            <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <span>صلاحيات الساكن والشفافية المتاحة</span>
              <Briefcase className="w-3.5 h-3.5 text-amber-600" />
            </h3>
          </div>

          <p className="text-xs text-slate-500 font-bold leading-relaxed">يستمتع الساكن بنظام كامل من الشفافية لتبادل الآراء والمشاركة المجتمعية مع حماية الخصوصية الشخصية.</p>

          <div className="space-y-2 border-b pb-3 mb-2">
            {[
              'الاطلاع الشامل على كشوف المبالغ المحصلة والتحققات المالية (للقراءة فقط)',
              'الاطلاع التفصيلي على فواتير ومستندات المصروفات (للقراءة فقط)',
              'المشاركة والتصويت الفعال في استبيانات القرارات العامة والجمعية العمومية',
              'كتابة ونشر الشكاوى والتعليقات والتحذيرات على لوحة النقاشات المفتوحة',
              'المحادثة والتفاعل الفوري مع الجيران في صفحة الدردشة الفورية',
              'الاطلاع على لوائح وتعليمات العمارة للقراءة فقط',
              'تقديم ومتابعة طلبات الصيانة الخاصة بالوحدة وتلقي الإشعار فور إصلاحها',
            ].map((cap, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="mt-0.5 w-3.5 h-3.5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
                <span className="text-xs text-slate-700 font-bold leading-normal">{cap}</span>
              </div>
            ))}
          </div>

          {/* Explicit Restrictions */}
          <div className="space-y-1.5">
            <h4 className="text-[11px] font-extrabold text-red-600 mb-1">🚫 يمنع تماماً على الساكن:</h4>
            {[
              'إضافة أو حذف أو تعديل بيانات وحسابات شقق الجيران الآخرين',
              'إضافة أو تعديل أو إلغاء قيود التحصيل أو إيصالات الدفع الرسمية',
              'تسجيل أو تعديل أو إلغاء فواتير ومصروفات العقار الموحدة',
              'تعديل أو حذف أو تلاعب بلوائح وتعليمات اتحاد الملاك الأساسية',
            ].map((cap, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="mt-0.5 w-3.5 h-3.5 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                  <X className="w-2.5 h-2.5 stroke-[3]" />
                </span>
                <span className="text-xs text-slate-500 font-semibold leading-normal">{cap}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Executive users configuration (admins and managers list) */}
      {isAdmin && (
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Admins Emails config */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-black text-slate-800 border-b pb-1.5">تفويض بريد إلكتروني لرئاسة الاتحاد (الأدمن)</h4>
            <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">أدخل بريد جوجل الإلكتروني الخاص برئيس اتحاد الملاك لمنحه كل الصلاحيات.</p>
            
            <form onSubmit={handleAddAdmin} className="flex gap-1.5">
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-900 text-white text-xs font-bold rounded-lg hover:bg-blue-950 transition cursor-pointer"
              >
                تفعيل تفويض أدمن
              </button>
              <input
                type="email"
                placeholder="email@gmail.com"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-100 focus:bg-white rounded-lg text-xs outline-none text-left font-bold transition"
                required
              />
            </form>

            <div className="space-y-1 max-h-32 overflow-y-auto">
              {effectiveAdmins.map((email) => {
                const isPrimary = primaryAdminEmail && email.toLowerCase() === primaryAdminEmail;
                return (
                  <div key={email} className="flex items-center justify-between p-1.5 bg-slate-50 rounded-lg border border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleDeleteAdmin(email)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded-md transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      title={isPrimary ? 'الأدمن الرئيسي المسجل به الاتحاد (لا يمكن حذفه)' : 'إلغاء التفويض'}
                      disabled={isPrimary || effectiveAdmins.length <= 1}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <div className="flex items-center gap-1.5 dir-ltr">
                      <span className="text-[10px] font-bold text-slate-700">{email}</span>
                      {isPrimary && (
                        <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          (الأدمن الرئيسي - إيميل الاتحاد)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Technical Assistant Config */}
          <div className="space-y-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200/80 col-span-1 md:col-span-1">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <div>
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  <span>تفويض مساعد فني</span>
                </h4>
                <p className="text-[10px] text-slate-500 font-semibold leading-relaxed mt-0.5">
                  تحديد إيميل وباسورد المساعد الفني لتسجيل التحصيل والمصروفات ومتابعة الصيانة والدليل والتقويم دون صلاحيات التعديل أو الحذف.
                </p>
              </div>
              {config.assistantConfig?.email && (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md border border-emerald-200 shrink-0">
                  تفويض مفعل
                </span>
              )}
            </div>

            <form onSubmit={handleSaveAssistantConfig} className="space-y-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">البريد الإلكتروني (Email)</label>
                  <input
                    type="email"
                    placeholder="assistant@pyramids.com"
                    value={assistantEmail}
                    onChange={(e) => setAssistantEmail(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-left"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">كلمة المرور (Password)</label>
                  <input
                    type="text"
                    placeholder="كلمة المرور"
                    value={assistantPassword}
                    onChange={(e) => setAssistantPassword(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-left"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">اسم المساعد الفني (اختياري)</label>
                  <input
                    type="text"
                    placeholder="مثال: المساعد الفني"
                    value={assistantName}
                    onChange={(e) => setAssistantName(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-right"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">رقم موبايل المساعد الفني</label>
                  <input
                    type="tel"
                    placeholder="مثال: 01012345678"
                    value={assistantPhone}
                    onChange={(e) => setAssistantPhone(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-left"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {config.assistantConfig?.email ? (
                  <button
                    type="button"
                    onClick={handleRemoveAssistantConfig}
                    className="px-1 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-[10px] sm:text-xs font-extrabold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 shrink-0"
                  >
                    <Trash2 className="w-3 h-3 shrink-0" />
                    <span className="whitespace-nowrap">إلغاء التفويض</span>
                  </button>
                ) : (
                  <div className="bg-slate-100 text-slate-400 text-[10px] sm:text-xs font-bold rounded-lg flex items-center justify-center border border-slate-200/40 select-none opacity-50 whitespace-nowrap">
                    لا يوجد تفويض
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSendAssistantWhatsAppInvite}
                  className="px-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] sm:text-xs font-extrabold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 shrink-0"
                >
                  <span className="whitespace-nowrap">إرسال دعوة</span>
                </button>

                <button
                  type="submit"
                  className="px-1 py-1.5 bg-blue-900 hover:bg-blue-950 text-white text-[10px] sm:text-xs font-extrabold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 shadow-2xs shrink-0"
                >
                  <Check className="w-3 h-3 shrink-0" />
                  <span className="whitespace-nowrap">حفظ التفويض</span>
                </button>
              </div>

              {assistantSavedSuccess && (
                <div className="bg-emerald-50 text-emerald-800 text-[10px] font-bold p-2 rounded-lg border border-emerald-200 text-center">
                  تم تفعيل وحفظ تفويض المساعد الفني بنجاح!
                </div>
              )}
            </form>
          </div>

          {/* Building Management & Union Deletion Section */}
          <div className="bg-red-50/50 border-2 border-red-200 p-4 rounded-2xl col-span-1 md:col-span-2 space-y-3.5 text-right">
            <div className="flex items-center justify-between border-b border-red-200 pb-2.5">
              <span className="px-2.5 py-0.5 bg-red-100 text-red-800 text-[10px] font-black rounded-md border border-red-200">
                صلاحيات الإدارة العليا
              </span>
              <h4 className="text-xs font-black text-red-950 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>إدارة وإلغاء الاتحادات المسجلة (للرئيس فقط)</span>
              </h4>
            </div>

            <p className="text-[11px] text-red-800 font-bold leading-relaxed">
              يمكن لرئيس الاتحاد الإداري تحديد أي اتحاد ملاك مسجل (بما في ذلك الاتحادات التجريبية) من القائمة المنسدلة أدناه وحذفه نهائياً من هذا الجهاز وقاعدة البيانات.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-black text-slate-700">
                اختر الاتحاد المراد إدارته وحذفه:
              </label>
              <select
                value={selectedBuildingId}
                onChange={(e) => setSelectedBuildingId(e.target.value)}
                className="w-full sm:w-80 py-2 px-3 text-xs bg-white border border-red-200 rounded-xl font-black text-slate-800 focus:outline-none focus:border-red-600"
              >
                {allBuildings.map((b) => {
                  const isActive = b.id === getActiveBuilding()?.id;
                  return (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code}){isActive ? ' - [الاتحاد النشط الحالي 🌟]' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1.5 border-t border-red-200/50">
              <button
                type="button"
                disabled={!selectedBuildingId}
                onClick={() => {
                  const targetId = selectedBuildingId;
                  const targetB = allBuildings.find(b => b.id === targetId);
                  setBuildingDeleteModal({
                    isOpen: true,
                    type: 'single',
                    buildingName: targetB?.name || 'هذا الاتحاد',
                  });
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف الاتحاد المختار</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBuildingDeleteModal({
                    isOpen: true,
                    type: 'all',
                  });
                }}
                className="px-4 py-2 bg-red-950 hover:bg-black text-white text-xs font-black rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-sm border border-red-900"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>حذف جميع الاتحادات وبدء تطبيق جديد ✨</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete Union Confirmation */}
      {buildingDeleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 mx-auto bg-red-100 rounded-2xl flex items-center justify-center text-red-600 shadow-inner">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-black text-slate-900">
                {buildingDeleteModal.type === 'all' 
                  ? 'حذف جميع الاتحادات المسجلة' 
                  : `حذف اتحاد "${buildingDeleteModal.buildingName || config.buildingName || 'العمارة'}"`}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                {buildingDeleteModal.type === 'all'
                  ? 'هل أنت متأكد من حذف كافة الاتحادات المسجلة نهائياً؟ سيتم تفريغ كافة البيانات والبدء بحالة المصنع لتسجيل اتحاد جديد.'
                  : 'هل أنت متأكد من حذف هذا الاتحاد وكافة سجلاته المالية وسكاناته نهائياً من النظام والسحابة؟'}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmDeleteBuilding}
                disabled={isDeletingBuilding}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-md shadow-red-600/20 disabled:opacity-50"
              >
                {isDeletingBuilding ? 'جاري الحذف...' : 'نعم، حذف نهائي'}
              </button>
              <button
                type="button"
                onClick={() => setBuildingDeleteModal({ isOpen: false, type: 'single' })}
                disabled={isDeletingBuilding}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
