import React, { useState } from 'react';
import { BookOpen, X, Plus, Trash2 } from 'lucide-react';
import { UserRole } from '../../types';

interface BuildingRulesModalProps {
  isOpen: boolean;
  mode: 'view' | 'edit';
  rules: string[];
  role: UserRole;
  onClose: () => void;
  onAddRule?: (text: string) => void;
  onDeleteRule?: (index: number) => void;
}

export const BuildingRulesModal: React.FC<BuildingRulesModalProps> = ({
  isOpen,
  mode,
  rules,
  role,
  onClose,
  onAddRule,
  onDeleteRule,
}) => {
  const [newRuleText, setNewRuleText] = useState('');

  if (!isOpen) return null;

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleText.trim() || !onAddRule) return;
    onAddRule(newRuleText.trim());
    setNewRuleText('');
  };

  const isEditMode = mode === 'edit' && role !== 'RESIDENT';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 overflow-y-auto" dir="rtl">
      <div className="w-full max-w-xl bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-xl animate-scale-up text-right my-auto">
        <div className="flex items-center justify-between border-b pb-2.5 mb-3">
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 hover:bg-slate-50 rounded-lg transition cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <h3 className="text-sm font-black text-slate-900">
                {isEditMode ? 'تعديل وصياغة لوائح وتعليمات العمارة' : 'تعليمات ونظام إدارة العمارة'}
              </h3>
              <p className="text-[10px] text-slate-400 font-bold">
                {isEditMode ? 'لوحة تحكم إدارة الاتحاد لإضافة وتعديل وحذف بنود اللائحة' : 'اللائحة الداخلية المنظمة للعقار وقواعد حسن الجوار'}
              </p>
            </div>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isEditMode ? 'bg-blue-50 text-blue-900' : 'bg-yellow-50 text-yellow-700 border border-yellow-200/50'}`}>
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Notice banner */}
        {!isEditMode && (
          <div className="bg-yellow-50/60 border border-yellow-200/60 rounded-xl p-2.5 text-yellow-900 text-xs font-bold text-right leading-relaxed mb-3">
            <span className="text-[11px] font-bold">هذه اللائحة معتمدة من مجلس إدارة اتحاد الملاك للاطلاع والالتزام لكافة الملاك والسكان.</span>
          </div>
        )}

        {/* Form to add rules (only in edit mode) */}
        {isEditMode && onAddRule && (
          <form onSubmit={handleAddSubmit} className="flex gap-1.5 mb-4">
            <button
              type="submit"
              className="px-3.5 py-2 bg-blue-900 text-white font-bold text-xs rounded-xl hover:bg-blue-950 transition flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة بند</span>
            </button>
            <input
              type="text"
              placeholder="صياغة مادة جديدة في اللائحة..."
              value={newRuleText}
              onChange={(e) => setNewRuleText(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-100 focus:bg-white rounded-xl text-xs outline-none text-right font-bold transition"
              required
            />
          </form>
        )}

        {/* Rules list */}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {rules.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-100 rounded-xl flex flex-col items-center justify-center gap-1.5">
              <BookOpen className="w-6 h-6 text-slate-300" />
              <p className="text-xs text-slate-400 font-bold">لا توجد مواد تعليمات مسجلة حالياً في اللائحة.</p>
            </div>
          ) : (
            rules.map((rule, idx) => (
              <div 
                key={idx} 
                className={`p-2.5 rounded-xl flex items-start gap-2.5 ${isEditMode ? 'bg-slate-50/60 border border-slate-100 justify-between' : 'bg-slate-50/60 border border-slate-100'}`}
              >
                {isEditMode && onDeleteRule && (
                  <button
                    type="button"
                    onClick={() => onDeleteRule(idx)}
                    className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded-lg transition cursor-pointer shrink-0"
                    title="إزالة هذا البند"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="flex items-start gap-2 flex-1 text-right">
                  <span className="inline-flex items-center justify-center px-2 py-0.5 bg-yellow-50 text-yellow-900 border border-yellow-200/50 text-[10px] font-black rounded-md shrink-0 mt-0.5">
                    مادة {idx + 1}
                  </span>
                  <p className="text-xs text-slate-700 font-bold leading-relaxed flex-1 text-right">
                    {rule}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
