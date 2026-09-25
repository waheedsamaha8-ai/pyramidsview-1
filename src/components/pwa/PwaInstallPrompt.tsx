import React, { useState } from 'react';
import { Smartphone } from 'lucide-react';

interface PwaInstallPromptProps {
  pwaInstalled: boolean;
  deferredPrompt: any;
  isIosDevice: boolean;
  buildingName: string;
  onInstall: () => void;
}

export const PwaInstallPrompt: React.FC<PwaInstallPromptProps> = ({
  pwaInstalled,
  deferredPrompt,
  isIosDevice,
  buildingName,
  onInstall
}) => {
  const [showIosGuide, setShowIosGuide] = useState(false);

  if (pwaInstalled || (!deferredPrompt && !isIosDevice)) {
    return null;
  }

  return (
    <>
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-3.5 sm:p-4 rounded-2xl flex items-center justify-between border border-blue-800/40 shadow-md">
        <div className="text-right">
          <h3 className="font-extrabold text-xs sm:text-sm mb-0.5 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span>تثبيت تطبيق "العمارة" - {buildingName}</span>
          </h3>
          <p className="text-[10px] sm:text-xs text-indigo-200">
            ثبّت التطبيق على شاشة جوالك الرئيسية لاستخدام سريع ومباشر وإمكانية العمل بدون إنترنت.
          </p>
        </div>
        {deferredPrompt ? (
          <button
            type="button"
            onClick={onInstall}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-1 shadow-sm transition cursor-pointer whitespace-nowrap"
          >
            <span>تثبيت الآن</span>
          </button>
        ) : isIosDevice ? (
          <button
            type="button"
            onClick={() => setShowIosGuide(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs flex items-center gap-1 shadow-sm transition cursor-pointer whitespace-nowrap"
          >
            <span>تثبيت على الآيفون</span>
          </button>
        ) : null}
      </div>

      {/* iOS PWA Install Guide Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4" dir="rtl">
          <div className="bg-slate-800 border border-slate-700 text-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto">
              <Smartphone className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-center text-slate-100">تثبيت التطبيق على الآيفون / الآيباد</h3>
            <div className="space-y-3 text-xs text-slate-300 bg-slate-900/60 p-4 rounded-2xl border border-slate-700/60">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 bg-blue-600 text-white font-bold rounded-full flex items-center justify-center shrink-0 text-[10px]">١</span>
                <p>اضغط على أيقونة <strong>المشاركة (Share)</strong> في شريط متصفح Safari السفلي.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 bg-blue-600 text-white font-bold rounded-full flex items-center justify-center shrink-0 text-[10px]">٢</span>
                <p>تمرير للأسفل واختيار <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold rounded-xl transition text-xs"
            >
              فهمت، إغلاق
            </button>
          </div>
        </div>
      )}
    </>
  );
};
