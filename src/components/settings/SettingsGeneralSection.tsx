import React from 'react';
import { Calendar, CheckCircle2, Check, Calculator } from 'lucide-react';
import { AppConfig } from '../../types';

interface SettingsGeneralSectionProps {
  config: AppConfig;
  isAdmin: boolean;
  accountingStartDate: string;
  setAccountingStartDate: (date: string) => void;
  activityFees: Record<string, number>;
  setActivityFees: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  defaultFeesMap: Record<string, number>;
  handleResetDefaultActivityFees: () => void;
  savedSuccess: boolean;
  handleSaveAccountingSettings: (e: React.FormEvent) => void;
  getElapsedMonths: () => number;
}

export const SettingsGeneralSection: React.FC<SettingsGeneralSectionProps> = ({
  config,
  isAdmin,
  accountingStartDate,
  setAccountingStartDate,
  activityFees,
  setActivityFees,
  defaultFeesMap,
  handleResetDefaultActivityFees,
  savedSuccess,
  handleSaveAccountingSettings,
  getElapsedMonths,
}) => {
  return (
    <div className="space-y-3.5 text-right">
      {/* Card: Accounting start date and fee defaults */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 gap-2">
          <div className="text-right">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </span>
              <span>تاريخ بدء المحاسبة واحتساب المديونيات والسداد</span>
            </h3>
            <p className="text-xs text-slate-500 font-bold mt-1 leading-relaxed">
              حدد التاريخ الذي يبدأ منه التطبيق احتساب الشهور المستحقة والمديونيات على الوحدات السكنية ومقارنتها بما تم سداده.
            </p>
          </div>

          {savedSuccess && (
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black animate-fade-in self-start sm:self-auto">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>تم حفظ وتطبيق الإعدادات بنجاح!</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSaveAccountingSettings} className="space-y-4">
          {/* 1. Start Date Picker and Preset Buttons in One Row */}
          <div className="p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-2.5">
            <label className="block text-xs font-black text-slate-800">
              تاريخ بدء المحاسبة (سنة - شهر - يوم):
            </label>
            
            <div className="flex flex-row items-center gap-2 w-full">
              <input
                type="date"
                value={accountingStartDate}
                onChange={(e) => setAccountingStartDate(e.target.value)}
                disabled={!isAdmin}
                className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs font-black text-slate-800 outline-none transition disabled:bg-slate-100 cursor-pointer text-center"
                required
              />

              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => setAccountingStartDate('2026-01-01')}
                    className={`px-2.5 sm:px-3 py-2 text-[10.5px] sm:text-[11px] font-bold rounded-xl transition border cursor-pointer shrink-0 whitespace-nowrap shadow-2xs ${
                      accountingStartDate === '2026-01-01' 
                        ? 'bg-blue-900 text-white border-blue-900' 
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    بداية عام 2026 (2026-01-01)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const y = now.getFullYear();
                      const m = String(now.getMonth() + 1).padStart(2, '0');
                      setAccountingStartDate(`${y}-${m}-01`);
                    }}
                    className={`px-2.5 sm:px-3 py-2 text-[10.5px] sm:text-[11px] font-bold rounded-xl transition border cursor-pointer shrink-0 whitespace-nowrap shadow-2xs ${
                      (() => {
                        const now = new Date();
                        const y = now.getFullYear();
                        const m = String(now.getMonth() + 1).padStart(2, '0');
                        return accountingStartDate === `${y}-${m}-01`;
                      })()
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    أول الشهر الحالي
                  </button>
                </>
              )}
            </div>

            <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
              * تاريخ البدء الحالي المعتمد: <span className="text-blue-900 font-black">{accountingStartDate}</span> (يتم احتساب <span className="text-slate-900 font-black">{getElapsedMonths()}</span> شهر حتى تاريخ اليوم).
            </p>
          </div>

          {/* 2. Default Fees Per Activity Type */}
          <div className="p-4 bg-slate-50/90 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/70 pb-2.5">
              <div>
                <h4 className="text-xs font-black text-slate-900">
                  قيمة الاشتراك الافتراضي حسب نوع النشاط
                </h4>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                  يتم تعيين هذه المبالغ تلقائياً عند إضافة أو تعديل الشقق وفقاً لنوع النشاط المحدد لكل وحدة
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleResetDefaultActivityFees}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-blue-900 border border-slate-200 rounded-xl text-[11px] font-bold transition cursor-pointer self-start sm:self-auto"
                >
                  استعادة القيم الافتراضية المحددة
                </button>
              )}
            </div>

            {/* Grid of Activity Default Fees */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              {config.activityTypes.map((act) => {
                const currentVal = activityFees[act] !== undefined 
                  ? activityFees[act] 
                  : (defaultFeesMap[act] || 0);

                return (
                  <div
                    key={act}
                    className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-900"></span>
                        <span>{act}</span>
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {act === 'سكني' ? '(الافتراضي 400)' : act === 'سكني مغلق' ? '(الافتراضي 200)' : act === 'مفروش' ? '(الافتراضي 600)' : act === 'إداري' ? '(الافتراضي 800)' : act === 'تجاري' ? '(الافتراضي 500)' : act === 'بدون تشطيب' ? '(الافتراضي 0)' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={currentVal}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setActivityFees(prev => ({ ...prev, [act]: val }));
                        }}
                        disabled={!isAdmin}
                        className="flex-1 px-2.5 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-lg text-xs font-black text-slate-900 outline-none text-right transition disabled:bg-slate-100"
                        placeholder="المبلغ"
                      />
                      <span className="text-[11px] font-bold text-slate-500 shrink-0">ج.م / شهر</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          {isAdmin && (
            <div className="flex flex-col sm:flex-row items-center justify-between pt-3 gap-2 border-t border-slate-100">
              {savedSuccess ? (
                <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black animate-fade-in w-full sm:w-auto">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>تم حفظ وتطبيق تاريخ بدء المحاسبة والاشتراكات بنجاح!</span>
                </div>
              ) : (
                <span className="text-[11px] text-slate-400 font-bold hidden sm:inline">
                  يتم حفظ وتطبيق الإعدادات على كشوف الحسابات فور الضغط.
                </span>
              )}

              <button
                type="submit"
                className={`w-full sm:w-auto px-5 py-2.5 text-xs font-black rounded-xl shadow-sm hover:shadow transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 ${
                  savedSuccess
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-blue-900 hover:bg-blue-950 text-white'
                }`}
              >
                {savedSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تم الحفظ بنجاح ✓</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>حفظ وتطبيق تاريخ بدء المحاسبة والاشتراكات</span>
                  </>
                )}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Educational Calculation Box */}
      <div className="bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-200/70 space-y-2">
        <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
          <Calculator className="w-4 h-4 text-blue-900" />
          <span>كيف يعمل احتساب رصيد ومديونية كل شقة؟</span>
        </h4>
        <ul className="text-xs text-slate-600 font-bold space-y-1.5 list-disc list-inside leading-relaxed">
          <li>يقوم النظام بعدّ الأشهر المنقضية من <span className="text-blue-900 font-black">تاريخ بدء المحاسبة</span> المحدد أعلاه حتى الشهر الحالي.</li>
          <li>يتم ضرب عدد الأشهر في <span className="text-slate-800 font-black">الرسوم الشهرية</span> المقررة للشقة لمعرفة إجمالي المبالغ المستحقة.</li>
          <li>يقوم النظام بجمع كل المبالغ المسددة في كشف التحصيلات لنفس الوحدة ومقارنتها بإجمالي المستحقات.</li>
          <li>إذا كان هناك عجز في السداد، يظهر الرصيد <span className="text-red-600 font-black">بالسالب وباللون الأحمر</span> (مديونية مستحقة). وإذا سدد الساكن مقدماً، يظهر الرصيد <span className="text-emerald-700 font-black">بالموجب وباللون الأخضر</span>.</li>
        </ul>
      </div>
    </div>
  );
};
