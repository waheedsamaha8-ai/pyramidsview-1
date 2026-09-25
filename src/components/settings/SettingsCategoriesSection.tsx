import React, { useState } from 'react';
import { Users, CreditCard, DollarSign, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { AppConfig } from '../../types';

interface SettingsCategoriesSectionProps {
  config: AppConfig;
  isAdmin: boolean;
  activityFees: Record<string, number>;
  setActivityFees: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  defaultFeesMap: Record<string, number>;
  onSaveConfig: (updatedConfig: AppConfig) => void;
  onNotification?: (title: string, message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

export const SettingsCategoriesSection: React.FC<SettingsCategoriesSectionProps> = ({
  config,
  isAdmin,
  activityFees,
  setActivityFees,
  defaultFeesMap,
  onSaveConfig,
  onNotification,
}) => {
  const [newActivityType, setNewActivityType] = useState('');
  const [newPaymentType, setNewPaymentType] = useState('');
  const [newExpenseType, setNewExpenseType] = useState('');

  const [editingModal, setEditingModal] = useState<{
    key: 'activityTypes' | 'paymentTypes' | 'expenseTypes';
    originalValue: string;
    newValue: string;
    fee: number;
    error?: string;
  } | null>(null);

  const openEditModal = (key: 'activityTypes' | 'paymentTypes' | 'expenseTypes', value: string) => {
    const currentFee = activityFees[value] !== undefined ? activityFees[value] : (defaultFeesMap[value] ?? 400);
    setEditingModal({
      key,
      originalValue: value,
      newValue: value,
      fee: currentFee,
      error: undefined,
    });
  };

  const handleConfirmEditModal = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingModal) return;
    const trimmedVal = editingModal.newValue.trim();
    if (!trimmedVal) {
      setEditingModal(prev => prev ? { ...prev, error: 'يرجى إدخال اسم النوع' } : null);
      return;
    }

    const key = editingModal.key;
    const isDuplicate = config[key].some(item => item === trimmedVal && item !== editingModal.originalValue);
    if (isDuplicate) {
      setEditingModal(prev => prev ? { ...prev, error: 'هذا الاسم مستخدم بالفعل في القائمة' } : null);
      return;
    }

    const updatedList = config[key].map(item => item === editingModal.originalValue ? trimmedVal : item);
    
    let updatedActivityFees = { ...defaultFeesMap, ...(config.activityDefaultFees || {}), ...activityFees };
    if (key === 'activityTypes') {
      delete updatedActivityFees[editingModal.originalValue];
      updatedActivityFees[trimmedVal] = Number(editingModal.fee) >= 0 ? Number(editingModal.fee) : 0;
      setActivityFees(updatedActivityFees);
    }

    const updated: AppConfig = {
      ...config,
      [key]: updatedList,
      ...(key === 'activityTypes' ? { activityDefaultFees: updatedActivityFees } : {})
    };

    onSaveConfig(updated);
    if (onNotification) {
      const typeLabel = key === 'activityTypes' ? 'نوع الوحدة' : key === 'paymentTypes' ? 'نوع التحصيل' : 'نوع المصروف';
      onNotification('تم تعديل النوع بنجاح', `تم تحديث ${typeLabel} إلى "${trimmedVal}" بنجاح.`, 'success');
    }
    setEditingModal(null);
  };

  const updateConfig = (key: keyof AppConfig, updatedList: string[]) => {
    if (!isAdmin) return;
    const updated = {
      ...config,
      [key]: updatedList,
    };
    onSaveConfig(updated);
  };

  const handleAddActivityType = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newActivityType.trim();
    if (!trimmed || config.activityTypes.includes(trimmed)) return;
    
    const updatedActivityFees = {
      ...config.activityDefaultFees,
      [trimmed]: 0
    };
    setActivityFees(updatedActivityFees);
    
    const updated = {
      ...config,
      activityTypes: [...config.activityTypes, trimmed],
      activityDefaultFees: updatedActivityFees
    };
    onSaveConfig(updated);
    setNewActivityType('');
  };

  const handleAddPaymentType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPaymentType.trim() || config.paymentTypes.includes(newPaymentType.trim())) return;
    updateConfig('paymentTypes', [...config.paymentTypes, newPaymentType.trim()]);
    setNewPaymentType('');
  };

  const handleAddExpenseType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpenseType.trim() || config.expenseTypes.includes(newExpenseType.trim())) return;
    updateConfig('expenseTypes', [...config.expenseTypes, newExpenseType.trim()]);
    setNewExpenseType('');
  };

  const handleDeleteItem = (key: keyof AppConfig, item: string) => {
    if (!isAdmin) return;
    const currentVal = config[key];
    if (!Array.isArray(currentVal)) return;
    const filtered = currentVal.filter((x) => x !== item);
    
    let updatedActivityFees = { ...config.activityDefaultFees };
    if (key === 'activityTypes') {
      delete updatedActivityFees[item];
      setActivityFees(updatedActivityFees);
    }
    
    const updated = {
      ...config,
      [key]: filtered as string[],
      ...(key === 'activityTypes' ? { activityDefaultFees: updatedActivityFees } : {})
    };
    onSaveConfig(updated);
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-right">
        {/* 1. Apartment Types */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-3.5 h-3.5" />
            </span>
            <h3 className="text-xs font-black text-slate-900">إدارة أنواع الوحدات</h3>
          </div>
          
          <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">تعريف الأنشطة المخصصة للشقق والمنشآت وتصنيفها.</p>

          {isAdmin && (
            <form onSubmit={handleAddActivityType} className="flex gap-1">
              <button
                type="submit"
                className="px-2.5 bg-blue-900 text-white rounded-lg font-bold text-xs hover:bg-blue-950 transition flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <input
                type="text"
                placeholder="نوع جديد (مثال: عيادة)"
                value={newActivityType}
                onChange={(e) => setNewActivityType(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-100 focus:bg-white rounded-lg text-xs outline-none text-right font-bold transition"
                required
              />
            </form>
          )}

          <div className="space-y-1.5">
            {config.activityTypes.map((type) => {
              const fee = activityFees[type] !== undefined ? activityFees[type] : (defaultFeesMap[type] ?? 400);
              return (
                <div key={type} className="flex items-center justify-between p-2 bg-slate-50/70 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl transition gap-2">
                  {isAdmin ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDeleteItem('activityTypes', type)}
                        className="p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition cursor-pointer"
                        title="حذف هذا النوع"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal('activityTypes', type)}
                        className="p-1.5 text-blue-700 hover:bg-blue-100/70 hover:text-blue-900 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-bold bg-blue-50/80 px-2"
                        title="تعديل هذا النوع والاشتراك"
                      >
                        <Pencil className="w-3 h-3 text-blue-800" />
                        <span>تعديل</span>
                      </button>
                    </div>
                  ) : (
                    <span className="w-4" />
                  )}

                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                      {fee} ج.م
                    </span>
                    <span className="text-xs font-black text-indigo-950 truncate">{type}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Payment Types */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5" />
            </span>
            <h3 className="text-xs font-black text-slate-900">إدارة أنواع التحصيلات</h3>
          </div>

          <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">تحديد فئات الإيرادات والاشتراكات المقررة على سكان العمارة بانتظام.</p>

          {isAdmin && (
            <form onSubmit={handleAddPaymentType} className="flex gap-1">
              <button
                type="submit"
                className="px-2.5 bg-blue-900 text-white rounded-lg font-bold text-xs hover:bg-blue-950 transition flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <input
                type="text"
                placeholder="نوع تحصيل (مثال: صيانة غاز)"
                value={newPaymentType}
                onChange={(e) => setNewPaymentType(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-100 focus:bg-white rounded-lg text-xs outline-none text-right font-bold transition"
                required
              />
            </form>
          )}

          <div className="space-y-1.5">
            {config.paymentTypes.map((type) => {
              return (
                <div key={type} className="flex items-center justify-between p-2 bg-slate-50/70 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl transition gap-2">
                  {isAdmin ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDeleteItem('paymentTypes', type)}
                        className="p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition cursor-pointer"
                        title="حذف هذا النوع"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal('paymentTypes', type)}
                        className="p-1.5 text-emerald-800 hover:bg-emerald-100/70 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-bold bg-emerald-50/80 px-2"
                        title="تعديل هذا النوع"
                      >
                        <Pencil className="w-3 h-3 text-emerald-800" />
                        <span>تعديل</span>
                      </button>
                    </div>
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className="text-xs font-black text-emerald-950 truncate">{type}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Expense Types */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5" />
            </span>
            <h3 className="text-xs font-black text-slate-900">إدارة أنواع المصروفات</h3>
          </div>

          <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">تعريف بنود الصرف وأوجه النفقات المسموح بها من قبل اتحاد الملاك.</p>

          {isAdmin && (
            <form onSubmit={handleAddExpenseType} className="flex gap-1">
              <button
                type="submit"
                className="px-2.5 bg-blue-900 text-white rounded-lg font-bold text-xs hover:bg-blue-950 transition flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <input
                type="text"
                placeholder="بند مصروف (مثال: صيانة جراج)"
                value={newExpenseType}
                onChange={(e) => setNewExpenseType(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-100 focus:bg-white rounded-lg text-xs outline-none text-right font-bold transition"
                required
              />
            </form>
          )}

          <div className="space-y-1.5">
            {config.expenseTypes.map((type) => {
              return (
                <div key={type} className="flex items-center justify-between p-2 bg-slate-50/70 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl transition gap-2">
                  {isAdmin ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDeleteItem('expenseTypes', type)}
                        className="p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition cursor-pointer"
                        title="حذف هذا النوع"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal('expenseTypes', type)}
                        className="p-1.5 text-amber-900 hover:bg-amber-100/70 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-bold bg-amber-50/80 px-2"
                        title="تعديل هذا النوع"
                      >
                        <Pencil className="w-3 h-3 text-amber-800" />
                        <span>تعديل</span>
                      </button>
                    </div>
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className="text-xs font-black text-amber-950 truncate">{type}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal: Edit Type Dialog */}
      {editingModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" dir="rtl">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {editingModal.key === 'activityTypes' ? 'تعديل نوع الوحدة' : editingModal.key === 'paymentTypes' ? 'تعديل نوع التحصيل' : 'تعديل نوع المصروف'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-bold">
                    الاسم الحالي: <span className="text-slate-800 font-black">{editingModal.originalValue}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmEditModal} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-800">
                  الاسم الجديد:
                </label>
                <input
                  type="text"
                  value={editingModal.newValue}
                  onChange={(e) => setEditingModal(prev => prev ? { ...prev, newValue: e.target.value, error: undefined } : null)}
                  className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-black text-slate-900 outline-none text-right transition"
                  placeholder="أدخل الاسم الجديد"
                  autoFocus
                  required
                />
              </div>

              {editingModal.key === 'activityTypes' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-800">
                    الاشتراك الشهري الافتراضي لهذا النشاط:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={editingModal.fee}
                      onChange={(e) => setEditingModal(prev => prev ? { ...prev, fee: Number(e.target.value) || 0 } : null)}
                      className="flex-1 px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-black text-slate-900 outline-none text-right transition"
                    />
                    <span className="text-xs font-bold text-slate-500 shrink-0">ج.م / شهر</span>
                  </div>
                </div>
              )}

              {editingModal.error && (
                <p className="text-xs text-red-600 font-bold bg-red-50 p-2.5 rounded-xl border border-red-100">
                  {editingModal.error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white text-xs font-black rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>حفظ التعديل</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
