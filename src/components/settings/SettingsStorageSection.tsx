import React, { useState, useRef } from 'react';
import { Server, HardDrive, FileSpreadsheet, Download, Upload, CheckCircle2 } from 'lucide-react';
import { AppConfig } from '../../types';
import * as backupService from '../../services/backupService';
import * as firestoreService from '../../services/firestoreService';

interface SettingsStorageSectionProps {
  config: AppConfig;
  onNotification?: (title: string, message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
  onRefreshAllData?: () => void;
}

export const SettingsStorageSection: React.FC<SettingsStorageSectionProps> = ({
  config,
  onNotification,
  onRefreshAllData,
}) => {
  // Monthly Excel Backup States
  const [selectedExcelYear, setSelectedExcelYear] = useState<number>(new Date().getFullYear());
  const [selectedExcelMonth, setSelectedExcelMonth] = useState<number>(new Date().getMonth() + 1);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  // Local Restore States
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  // Custom Firebase Project Override States
  const [customFbConfig, setCustomFbConfig] = useState(() => firestoreService.getActiveFirebaseConfig());
  const [isUsingCustomFb, setIsUsingCustomFb] = useState(() => firestoreService.isUsingCustomFirebase());

  const handleSaveCustomFb = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFbConfig.apiKey || !customFbConfig.projectId) {
      onNotification?.('بيانات ناقصة ⚠️', 'يرجى إدخال مفتاح API ومعرف المشروع (Project ID) على الأقل.', 'warning');
      return;
    }
    try {
      firestoreService.applyCustomFirebaseConfig(customFbConfig);
      setIsUsingCustomFb(true);
      onNotification?.('تم التفعيل', 'تم تطبيق إعدادات مشروع Firebase المخصص بنجاح.', 'success');
    } catch (err: any) {
      onNotification?.('خطأ', 'تعذر تطبيق الإعدادات المخصصة: ' + (err.message || ''), 'error');
    }
  };

  const handleResetDefaultFb = () => {
    if (window.confirm('هل تريد إلغاء ربط الفيربيز المخصص والعودة بالفيربيز السحابي التلقائي الموحد؟')) {
      firestoreService.applyCustomFirebaseConfig(null);
      setIsUsingCustomFb(false);
      setCustomFbConfig(firestoreService.getActiveFirebaseConfig());
      onNotification?.('استعادة الفيربيز الموحد', 'تمت العودة بنجاح إلى مشروع Firebase التلقائي الموحد.', 'info');
    }
  };

  const handleExportMonthlyExcel = async () => {
    setIsExportingExcel(true);
    try {
      const [residents, payments, expenses] = await Promise.all([
        firestoreService.getResidentsFromFirestore(),
        firestoreService.getPaymentsFromFirestore(),
        firestoreService.getExpensesFromFirestore(),
      ]);
      const fileName = backupService.exportMonthlyExcelBackup(
        selectedExcelYear,
        selectedExcelMonth,
        residents,
        payments,
        expenses,
        config
      );
      onNotification?.('تم تصدير الإكسل بنجاح 📊', `تم إنشاء وتنزيل ملف "${fileName}" بنجاح على جهازك.`, 'success');
    } catch (err: any) {
      onNotification?.('خطأ التصدير', 'تعذر تصدير ملف الإكسل: ' + (err.message || ''), 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleDownloadLocalBackup = async () => {
    try {
      await backupService.downloadLocalJsonBackup();
      onNotification?.('تصدير نسخة احتياطية', 'تم تجهيز وتحميل ملف النسخة الاحتياطية بصيغة JSON على جهازك.', 'success');
    } catch (err: any) {
      onNotification?.('خطأ في التصدير', 'تعذر تحميل النسخة الاحتياطية: ' + (err.message || ''), 'error');
    }
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsRestoring(true);
    setRestoreStatus('جاري قراءة ملف النسخة الاحتياطية...');
    try {
      const text = await file.text();
      await backupService.restoreFromJsonBackup(text, (msg) => {
        setRestoreStatus(msg);
      });
      setRestoreStatus('تمت استعادة البيانات بنجاح إلى قاعدة بيانات Firebase Firestore!');
      onNotification?.('استعادة البيانات', 'تم استيراد كافة السجلات بنجاح وتحديث قاعدة البيانات.', 'success');
      if (onRefreshAllData) {
        onRefreshAllData();
      }
    } catch (err: any) {
      setRestoreStatus('تعذر استعادة الملف: ' + (err.message || 'ملف غير صالح'));
      onNotification?.('فشل الاستعادة', err.message || 'ملف النسخة الاحتياطية غير صالح', 'error');
    } finally {
      setIsRestoring(false);
      if (restoreFileInputRef.current) {
        restoreFileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-4 text-right">
      {/* Real-time Firebase Firestore Status Card */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-white/10 text-amber-300 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </span>
            <div>
              <h4 className="text-xs sm:text-sm font-black flex items-center gap-1.5">
                <span>قاعدة بيانات Firebase Firestore السحابية</span>
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              </h4>
              <p className="text-[11px] text-blue-200 font-bold mt-0.5">
                نظام التخزين السحابي الفوري الآمن - متصل ويغطي 100% من بيانات التطبيق
              </p>
            </div>
          </div>

          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-xl text-[11px] font-black self-start sm:self-auto">
            مزامنة فورية حية (Realtime)
          </span>
        </div>

        <p className="text-[11px] text-blue-100 font-medium leading-relaxed">
          جميع العمليات السكنية والتحصيلات والمصروفات والرسائل تُسجل وتُزامن فوراً في قاعدة بيانات Firebase Firestore السحابية بشكل آمن ودائم دون الحاجة لأي حسابات خارجية أو إعدادات إضافية.
        </p>
      </div>

      {/* Backup & Export Suite (Monthly Excel & JSON Backup) */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
          <div>
            <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-blue-900" />
              <span>النسخ الاحتياطي وتصدير التقارير (Excel & JSON)</span>
            </h3>
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              حفظ نسخة إكسل شهرية شاملة للجداول الماليـة وتنزيل ملفات الـ JSON للاحتفاظ المستقل.
            </p>
          </div>

          <span className="text-[10px] text-emerald-800 font-extrabold bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
            قاعدة البيانات: Firebase Firestore (سحابية 100%)
          </span>
        </div>

        {/* 1. Monthly Excel Backup Section */}
        <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-xs font-black text-emerald-950 flex items-center gap-2">
                <FileSpreadsheet className="w-4.5 h-4.5 text-emerald-700" />
                <span>تصدير النسخة الاحتياطية الشهرية بصيغة إكسل (Excel) 📊</span>
              </h4>
              <p className="text-[11px] text-slate-600 font-medium">
                يتضمن التقرير أربعة جداول مستقلة (الملخص المالي، تحصيلات الشهر، مصروفات الشهر، وكشف مديونيات السكان).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedExcelYear}
                onChange={(e) => setSelectedExcelYear(Number(e.target.value))}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none cursor-pointer"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <select
                value={selectedExcelMonth}
                onChange={(e) => setSelectedExcelMonth(Number(e.target.value))}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none cursor-pointer"
              >
                {[
                  { id: 1, name: 'يناير' },
                  { id: 2, name: 'فبراير' },
                  { id: 3, name: 'مارس' },
                  { id: 4, name: 'أبريل' },
                  { id: 5, name: 'مايو' },
                  { id: 6, name: 'يونيو' },
                  { id: 7, name: 'يوليو' },
                  { id: 8, name: 'أغسطس' },
                  { id: 9, name: 'سبتمبر' },
                  { id: 10, name: 'أكتوبر' },
                  { id: 11, name: 'نوفمبر' },
                  { id: 12, name: 'ديسمبر' },
                ].map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleExportMonthlyExcel}
                disabled={isExportingExcel}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{isExportingExcel ? 'جاري التصدير...' : 'تنزيل إكسل الشهر 📊'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. On-Demand Local JSON Backup & Restore Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <Download className="w-4 h-4 text-slate-700" />
                <span>تنزيل نسخة احتياطية (ملف JSON شامل)</span>
              </h4>
              <p className="text-[10px] text-slate-500 font-medium">
                تنزيل ملف كامـل يحتوي على جميع بيانات وقواعد وسجلات ورسائل الاتحاد لحفظه محلياً على جهازك.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadLocalBackup}
              className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-blue-900" />
              <span>تحميل ملف النسخة الاحتياطية (JSON) 💾</span>
            </button>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-slate-700" />
                <span>استرجاع البيانات من نسخة احتياطية</span>
              </h4>
              <p className="text-[10px] text-slate-500 font-medium">
                رفع ملف JSON واستعادة كافة السجلات مباشرة إلى قاعدة بيانات Firebase السحابية.
              </p>
            </div>

            <input
              type="file"
              ref={restoreFileInputRef}
              onChange={handleRestoreFileChange}
              accept=".json,application/json"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => restoreFileInputRef.current?.click()}
              disabled={isRestoring}
              className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-700" />
              <span>{isRestoring ? 'جاري الاسترجاع...' : 'اختيار ملف النسخة واسترجاعه 📥'}</span>
            </button>
          </div>
        </div>

        {restoreStatus && (
          <div className="p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{restoreStatus}</span>
          </div>
        )}
      </div>

      {/* Custom Firebase Project Setup Section */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-orange-600" />
              <span>ربط مشروع الفيربيز الخاص بايميلك (Custom Firebase Project)</span>
            </h3>
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              خيار تجاري مخصص: يتيح لك ربط التطبيق مباشرة بمشروع الفيربيز المسجل على كونسول جوجل الخاص ببريدك الإلكتروني لتخزين قواعد البيانات فيه مباشرة.
            </p>
          </div>

          <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border shrink-0 ${
            isUsingCustomFb 
              ? 'bg-amber-100 text-amber-900 border-amber-300' 
              : 'bg-blue-100 text-blue-900 border-blue-200'
          }`}>
            {isUsingCustomFb ? 'مشروع مخصص' : 'الفيربيز الموحد (تلقائي)'}
          </span>
        </div>

        <form onSubmit={handleSaveCustomFb} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-black text-slate-700 mb-1">
                معرف المشروع (Project ID) *
              </label>
              <input
                type="text"
                placeholder="مثال: eskan-36079"
                value={customFbConfig.projectId || ''}
                onChange={(e) => setCustomFbConfig({ ...customFbConfig, projectId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-xs font-mono font-bold outline-none text-left"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 mb-1">
                مفتاح API الخاص بك (API Key) *
              </label>
              <input
                type="text"
                placeholder="AIzaSy..."
                value={customFbConfig.apiKey || ''}
                onChange={(e) => setCustomFbConfig({ ...customFbConfig, apiKey: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-xs font-mono font-bold outline-none text-left"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-black text-xs rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>حفظ وتفعيل مشروع الفيربيز الخاص بك</span>
              </button>

              {isUsingCustomFb && (
                <button
                  type="button"
                  onClick={handleResetDefaultFb}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  العودة للفيربيز الموحد
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
