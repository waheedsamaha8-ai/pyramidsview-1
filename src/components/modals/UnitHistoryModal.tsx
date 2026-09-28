import React, { useState, useEffect, useMemo } from 'react';
import { Resident, UnitHistoryRecord } from '../../types';
import { X, Plus, History, Calendar, User, Edit, Trash2, CheckCircle2, Clock, Phone, Save, Contact, Sparkles, RefreshCw, AlertTriangle } from 'lucide-react';
import { formatMobileNumber, formatPhoneForDisplay, pickContactFromDevice } from '../../utils/phoneUtils';
import { parseToStandardDate, sortHistoryRecordsChronologically, getLatestOccupantFromHistory } from '../../utils/buildingStructure';

const monthNamesArabicList = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const MonthYearPicker: React.FC<{
  value: string;
  onChange: (val: string) => void;
  label?: string;
}> = ({ value, onChange, label }) => {
  const parsed = useMemo(() => {
    return parseToStandardDate(value);
  }, [value]);

  const [month, setMonth] = useState<string>(() => {
    if (parsed?.month) {
      const parts = parsed.month.split('-');
      if (parts[1]) return parts[1];
    }
    return '01';
  });

  const [year, setYear] = useState<number>(() => {
    if (parsed?.year) {
      const y = parseInt(parsed.year, 10);
      if (!isNaN(y)) return y;
    }
    return new Date().getFullYear();
  });

  useEffect(() => {
    if (parsed?.month) {
      const parts = parsed.month.split('-');
      if (parts[1]) setMonth(parts[1]);
    }
    if (parsed?.year) {
      const y = parseInt(parsed.year, 10);
      if (!isNaN(y)) setYear(y);
    }
  }, [value]);

  const updateVal = (m: string, y: number) => {
    setMonth(m);
    setYear(y);
    const mIdx = parseInt(m, 10) - 1;
    const mName = monthNamesArabicList[mIdx] || m;
    onChange(`${mName} ${y}`);
  };

  return (
    <div className="space-y-0.5">
      {label && <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">{label}</span>}
      <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
        <select
          value={month}
          onChange={(e) => updateVal(e.target.value, year)}
          className="px-1.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-bold text-slate-900 dark:text-white outline-none cursor-pointer flex-1"
        >
          {monthNamesArabicList.map((name, idx) => {
            const val = String(idx + 1).padStart(2, '0');
            return (
              <option key={val} value={val}>
                {name}
              </option>
            );
          })}
        </select>

        <div className="flex items-center gap-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-0.5 shrink-0">
          <button
            type="button"
            onClick={() => updateVal(month, year - 1)}
            className="w-5 h-5 flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded text-slate-800 dark:text-slate-100 font-black text-xs transition cursor-pointer select-none active:scale-95"
            title="السنة السابقة"
          >
            -
          </button>
          <span className="text-[11px] font-black text-blue-900 dark:text-blue-300 font-mono px-1 min-w-[34px] text-center">
            {year}
          </span>
          <button
            type="button"
            onClick={() => updateVal(month, year + 1)}
            className="w-5 h-5 flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded text-slate-800 dark:text-slate-100 font-black text-xs transition cursor-pointer select-none active:scale-95"
            title="السنة التالية"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

interface UnitHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  resident: Resident | null;
  onUpdateResident: (updatedResident: Resident) => void;
}

export const UnitHistoryModal: React.FC<UnitHistoryModalProps> = ({
  isOpen,
  onClose,
  resident,
  onUpdateResident,
}) => {
  const [historyList, setHistoryList] = useState<UnitHistoryRecord[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form State
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerFromDate, setOwnerFromDate] = useState('');
  const [ownerToDate, setOwnerToDate] = useState('');
  const [isCurrentOwner, setIsCurrentOwner] = useState(true);

  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantFromDate, setTenantFromDate] = useState('');
  const [tenantToDate, setTenantToDate] = useState('');
  const [isCurrentTenant, setIsCurrentTenant] = useState(true);

  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Synchronize historyList when resident changes or modal opens
  useEffect(() => {
    if (resident && resident.history && Array.isArray(resident.history)) {
      setHistoryList(sortHistoryRecordsChronologically([...resident.history]));
    } else {
      setHistoryList([]);
    }
    setIsAdding(false);
    setEditingId(null);
    setDeleteConfirmId(null);
    setErrorMsg('');
  }, [resident?.id, resident?.history, isOpen]);

  if (!isOpen || !resident) return null;

  // Auto-Fill Form from Current Resident Directory Data
  const handleAutoFillFromCurrentResident = () => {
    setOwnerName(resident.name || '');
    setOwnerPhone(resident.phone || '');
    if (resident.tenantName) {
      setTenantName(resident.tenantName || '');
      setTenantPhone(resident.tenantPhone || '');
    }
  };

  // Pick Phone from Device Contacts
  const handlePickPhone = async (target: 'owner' | 'tenant') => {
    try {
      const contact = await pickContactFromDevice();
      if (contact) {
        const phoneVal = contact.tel || (contact as any).phone || '';
        if (target === 'owner') {
          if (contact.name && !ownerName) setOwnerName(contact.name);
          if (phoneVal) setOwnerPhone(formatMobileNumber(phoneVal));
        } else {
          if (contact.name && !tenantName) setTenantName(contact.name);
          if (phoneVal) setTenantPhone(formatMobileNumber(phoneVal));
        }
      }
    } catch (e) {
      console.error('Failed to pick contact:', e);
    }
  };

  // Start Add Form
  const handleStartAdd = () => {
    setEditingId(null);
    setOwnerName(resident.name || '');
    setOwnerPhone(resident.phone || '');
    setOwnerFromDate('');
    setOwnerToDate('');
    setIsCurrentOwner(true);

    setTenantName(resident.tenantName || '');
    setTenantPhone(resident.tenantPhone || '');
    setTenantFromDate('');
    setTenantToDate('');
    setIsCurrentTenant(true);

    setNotes('');
    setErrorMsg('');
    setIsAdding(true);
  };

  // Start Edit Form
  const handleStartEdit = (rec: UnitHistoryRecord) => {
    setEditingId(rec.id);
    setOwnerName(rec.ownerName || '');
    setOwnerPhone(rec.ownerPhone || (rec.ownerName === resident.name ? resident.phone || '' : ''));
    setOwnerFromDate(rec.ownerFromDate || '');
    setOwnerToDate(rec.ownerToDate || '');
    setIsCurrentOwner(!rec.ownerToDate || rec.ownerToDate === 'حتى الآن');

    setTenantName(rec.tenantName || '');
    setTenantPhone(rec.tenantPhone || (rec.tenantName === resident.tenantName ? resident.tenantPhone || '' : ''));
    setTenantFromDate(rec.tenantFromDate || '');
    setTenantToDate(rec.tenantToDate || '');
    setIsCurrentTenant(!rec.tenantToDate || rec.tenantToDate === 'حتى الآن');

    setNotes(rec.notes || '');
    setErrorMsg('');
    setIsAdding(true);
  };

  const handleCancelForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setErrorMsg('');
  };

  // Save Record (Add or Edit)
  const handleSaveRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerName.trim()) {
      setErrorMsg('يرجى كتابة اسم المالك');
      return;
    }

    const cleanOwnerPhone = ownerPhone.trim() ? formatMobileNumber(ownerPhone) : undefined;
    const cleanTenantPhone = tenantPhone.trim() ? formatMobileNumber(tenantPhone) : undefined;

    const newRecord: UnitHistoryRecord = {
      id: editingId || `hist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      ownerName: ownerName.trim(),
      ownerPhone: cleanOwnerPhone,
      ownerFromDate: ownerFromDate || undefined,
      ownerToDate: isCurrentOwner ? 'حتى الآن' : (ownerToDate || undefined),
      tenantName: tenantName.trim() || undefined,
      tenantPhone: tenantName.trim() ? cleanTenantPhone : undefined,
      tenantFromDate: tenantName.trim() ? tenantFromDate || undefined : undefined,
      tenantToDate: tenantName.trim() ? (isCurrentTenant ? 'حتى الآن' : (tenantToDate || undefined)) : undefined,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    let updatedList: UnitHistoryRecord[];
    if (editingId) {
      updatedList = historyList.map(item => item.id === editingId ? newRecord : item);
    } else {
      updatedList = [...historyList, newRecord];
    }

    // Sort chronologically from oldest to newest (records marked "حتى الآن" sort to the end)
    updatedList = sortHistoryRecordsChronologically(updatedList);
    setHistoryList(updatedList);

    // Get the latest occupant from history for the current period
    const latestOccupant = getLatestOccupantFromHistory({ ...resident, history: updatedList });
    const isTenantNum = (p?: string) => {
      if (!p) return false;
      const digits = p.replace(/\D/g, '');
      return digits.length >= 6 && updatedList.some(rec => rec.tenantPhone && rec.tenantPhone.replace(/\D/g, '').includes(digits));
    };
    const cleanPhone = latestOccupant.ownerPhone !== undefined 
      ? (latestOccupant.ownerPhone || '') 
      : (isTenantNum(resident.phone) ? '' : (resident.phone || ''));

    let updatedResident: Resident = {
      ...resident,
      history: updatedList,
      name: latestOccupant.ownerName || resident.name,
      phone: cleanPhone,
      tenantName: latestOccupant.tenantName || '',
      tenantPhone: latestOccupant.tenantPhone || '',
      ownershipType: latestOccupant.tenantName ? 'إيجار' : 'تمليك',
    };

    onUpdateResident(updatedResident);
    setIsAdding(false);
    setEditingId(null);
  };

  // Delete Record
  const confirmDeleteRecord = (id: string) => {
    const updatedList = sortHistoryRecordsChronologically(historyList.filter(item => item.id !== id));
    setHistoryList(updatedList);
    setDeleteConfirmId(null);

    let updatedResident: Resident = {
      ...resident,
      history: updatedList,
    };

    // If deleting active record and other history items exist, revert to latest remaining
    if (updatedList.length > 0) {
      const latestOccupant = getLatestOccupantFromHistory({ ...resident, history: updatedList });
      const isTenantNum = (p?: string) => {
        if (!p) return false;
        const digits = p.replace(/\D/g, '');
        return digits.length >= 6 && updatedList.some(rec => rec.tenantPhone && rec.tenantPhone.replace(/\D/g, '').includes(digits));
      };
      const cleanPhone = latestOccupant.ownerPhone !== undefined 
        ? (latestOccupant.ownerPhone || '') 
        : (isTenantNum(resident.phone) ? '' : (resident.phone || ''));

      updatedResident = {
        ...updatedResident,
        name: latestOccupant.ownerName || resident.name,
        phone: cleanPhone,
        tenantName: latestOccupant.tenantName || '',
        tenantPhone: latestOccupant.tenantPhone || '',
        ownershipType: latestOccupant.tenantName ? 'إيجار' : 'تمليك',
      };
    } else {
      updatedResident = {
        ...updatedResident,
        tenantName: '',
        tenantPhone: '',
        ownershipType: 'تمليك',
      };
    }

    onUpdateResident(updatedResident);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-3 overflow-y-auto" dir="rtl" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#111a2e] rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-xl max-h-[80vh] sm:max-h-[82vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Modal Header */}
        <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md shrink-0">
              <History className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-amber-400 text-blue-950 text-[9.5px] font-black px-2 py-0.5 rounded-full">
                  وحدة {resident.flatNumber}
                </span>
                <h3 className="font-extrabold text-xs sm:text-sm text-white">سجل وحيازة الوحدة</h3>
              </div>
              <p className="text-[10px] text-blue-200/90 font-medium">
                تسلسل الملاك والمستأجرين المتعاقبين وأرقام التليفونات
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Compact Current Info Banner */}
        <div className="bg-slate-50 dark:bg-slate-800/80 px-3 py-2 border-b border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-blue-900 dark:text-blue-400 shrink-0" />
              <span className="font-bold text-slate-500 dark:text-slate-400">المالك:</span>
              <span className="font-black text-slate-900 dark:text-white">{resident.name}</span>
            </div>
            {resident.tenantName && (
              <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800 text-[10px]">
                <span className="font-bold text-amber-800 dark:text-amber-300">المستأجر:</span>
                <span className="font-black text-amber-950 dark:text-amber-100">{resident.tenantName}</span>
              </div>
            )}
          </div>

          {!isAdding && (
            <button
              type="button"
              onClick={handleStartAdd}
              className="mr-auto inline-flex items-center gap-1 px-2.5 py-1 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-[10.5px] font-black shadow-2xs transition transform hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة تسلسل جديد</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-3 flex-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">

          {/* Add / Edit Form */}
          {isAdding && (
            <form onSubmit={handleSaveRecord} className="p-3 bg-blue-50/70 dark:bg-slate-800/90 border-2 border-blue-200 dark:border-blue-800 rounded-xl space-y-3 animate-fade-in text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-blue-200/60 dark:border-slate-700">
                <h4 className="font-extrabold text-xs text-blue-950 dark:text-blue-300 flex items-center gap-1.5">
                  <Edit className="w-3.5 h-3.5 text-blue-900 dark:text-blue-400" />
                  <span>{editingId ? 'تعديل سجل الملكية / الإشغال' : 'إضافة سجل ملكية / إشغال جديد'}</span>
                </h4>
                <button
                  type="button"
                  onClick={handleAutoFillFromCurrentResident}
                  className="text-[9.5px] font-black text-blue-900 dark:text-blue-300 bg-white dark:bg-slate-700 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-slate-600 transition flex items-center gap-1 cursor-pointer"
                  title="تعبئة حقول الاسم والتليفون تلقائياً من بيانات الساكن الحالية بالدليل"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>تعبئة تلقائية من الدليل</span>
                </button>
              </div>

              {errorMsg && (
                <div className="p-2 bg-rose-50 text-rose-700 text-[11px] font-bold rounded-lg border border-rose-200">
                  {errorMsg}
                </div>
              )}

              {/* Owner Block */}
              <div className="bg-white dark:bg-[#16223b] p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                    <span>بيانات المالك</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">اسم المالك:</span>
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="مثال: أحمد عبد الفتاح"
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-slate-900 dark:text-white"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">تليفون المالك:</span>
                      <button
                        type="button"
                        onClick={() => handlePickPhone('owner')}
                        className="text-[9px] font-bold text-blue-800 dark:text-blue-300 hover:underline flex items-center gap-0.5"
                      >
                        <Contact className="w-2.5 h-2.5" />
                        <span>من الأسماء</span>
                      </button>
                    </div>
                    <input
                      type="tel"
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      placeholder="مثال: 01007911777"
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold outline-none text-slate-900 dark:text-white"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <MonthYearPicker
                        label="فترة الملكية من:"
                        value={ownerFromDate}
                        onChange={setOwnerFromDate}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">إلى:</span>
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isCurrentOwner}
                            onChange={(e) => setIsCurrentOwner(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                          />
                          <span className="text-[10px] font-bold text-blue-900 dark:text-blue-300">حتى الآن</span>
                        </label>
                      </div>
                      {!isCurrentOwner && (
                        <MonthYearPicker
                          value={ownerToDate}
                          onChange={setOwnerToDate}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tenant Block */}
              <div className="bg-white dark:bg-[#16223b] p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    <span>بيانات المستأجر (اختياري)</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">اسم المستأجر:</span>
                    <input
                      type="text"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      placeholder="اسم المستأجر إن وجد"
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">تليفون المستأجر:</span>
                      <button
                        type="button"
                        onClick={() => handlePickPhone('tenant')}
                        className="text-[9px] font-bold text-amber-800 dark:text-amber-300 hover:underline flex items-center gap-0.5"
                      >
                        <Contact className="w-2.5 h-2.5" />
                        <span>من الأسماء</span>
                      </button>
                    </div>
                    <input
                      type="tel"
                      value={tenantPhone}
                      onChange={(e) => setTenantPhone(e.target.value)}
                      placeholder="رقم تليفون المستأجر"
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold outline-none text-slate-900 dark:text-white"
                      dir="ltr"
                    />
                  </div>
                </div>

                {tenantName.trim() && (
                  <div className="pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <MonthYearPicker
                          label="فترة الإيجار من:"
                          value={tenantFromDate}
                          onChange={setTenantFromDate}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">إلى:</span>
                          <label className="inline-flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isCurrentTenant}
                              onChange={(e) => setIsCurrentTenant(e.target.checked)}
                              className="rounded text-amber-600 focus:ring-0 cursor-pointer"
                            />
                            <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300">حتى الآن</span>
                          </label>
                        </div>
                        {!isCurrentTenant && (
                          <MonthYearPicker
                            value={tenantToDate}
                            onChange={setTenantToDate}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes Input */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-0.5">ملاحظات والتفاصيل</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: عقد إيجار سنتين / عقد بيع شقة..."
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold outline-none text-slate-900 dark:text-white"
                />
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-blue-200/60 dark:border-slate-700">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black shadow-md transition flex items-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ وتسجيل السجل</span>
                </button>
              </div>
            </form>
          )}

          {/* Records Timeline (Oldest to Newest) */}
          {historyList.length === 0 ? (
            <div className="text-center py-8 px-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
              <History className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <div>
                <h4 className="font-extrabold text-xs text-slate-700 dark:text-slate-300">لا يوجد تسلسل ملكية مسجل لـ (وحدة {resident.flatNumber})</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">اضغط على إضافة تسلسل لتوثيق تاريخ وحيازة الوحدة وأرقام التليفونات المتعاقبة</p>
              </div>
              {!isAdding && (
                <button
                  type="button"
                  onClick={handleStartAdd}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black shadow-2xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة أول تسلسل للوحدة</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5 relative before:absolute before:right-5 before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
              {historyList.map((rec, index) => {
                const isLatest = index === historyList.length - 1;
                return (
                  <div key={rec.id} className="relative pr-8">
                    {/* Timeline Node Badge */}
                    <div className={`absolute right-2 top-2.5 w-5 h-5 rounded-full flex items-center justify-center font-black text-[9px] text-white shadow-2xs z-10 ${
                      isLatest ? 'bg-amber-500 ring-2 ring-amber-100 dark:ring-amber-950/60' : 'bg-blue-900'
                    }`}>
                      #{index + 1}
                    </div>

                    {/* Card Content */}
                    <div className="p-3 bg-white dark:bg-[#16223b] rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:border-blue-300 dark:hover:border-blue-600 transition space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/80 pb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-[11px] text-slate-900 dark:text-white">
                            السجل #{index + 1}
                          </span>
                          {(() => {
                            const now = new Date();
                            const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                            const parsedTenantStart = parseToStandardDate(rec.tenantFromDate);
                            const isFutureTenant = Boolean(rec.tenantName && parsedTenantStart?.month && parsedTenantStart.month > currentMonthStr);

                            if (isFutureTenant) {
                              return (
                                <span className="text-[8.5px] font-black bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-1.5 py-0.2 rounded border border-purple-200 dark:border-purple-800">
                                  عقد قادم (يبدأ {rec.tenantFromDate})
                                </span>
                              );
                            }

                            if (isLatest) {
                              return (
                                <span className="text-[8.5px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800">
                                  السجل الحالي النشط
                                </span>
                              );
                            }

                            return null;
                          })()}
                        </div>

                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStartEdit(rec); }}
                            className="p-1 text-slate-500 hover:text-blue-900 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition cursor-pointer"
                            title="تعديل السجل"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteConfirmId(rec.id); }}
                            className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition cursor-pointer"
                            title="حذف السجل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Delete Confirmation Box */}
                      {deleteConfirmId === rec.id && (
                        <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl space-y-2 animate-fade-in text-right">
                          <div className="flex items-center gap-1.5 text-xs font-black text-rose-950 dark:text-rose-200">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>تأكيد حذف سجل الحيازة رقم #{index + 1}؟</span>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteConfirmId(null); }}
                              className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 text-[10.5px] font-bold rounded-lg transition cursor-pointer"
                            >
                              إلغاء
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); confirmDeleteRecord(rec.id); }}
                              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10.5px] font-black rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>نعم، تأكيد الحذف</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Owner & Tenant Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {/* Owner Box */}
                        <div className="p-2 bg-blue-50/50 dark:bg-slate-800/60 rounded-lg border border-blue-100 dark:border-slate-700 space-y-0.5">
                          <div className="text-[10px] font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>المالك: {rec.ownerName}</span>
                          </div>
                          {rec.ownerPhone && (
                            <div className="flex items-center gap-1 font-mono text-[10px] pt-0.5" dir="ltr">
                              <a
                                href={`tel:${formatMobileNumber(rec.ownerPhone)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-blue-900 dark:text-blue-300 hover:underline font-bold px-1 bg-blue-100/60 rounded"
                                dir="ltr"
                              >
                                <Phone className="w-2.5 h-2.5 text-blue-700 shrink-0" />
                                <span>{formatPhoneForDisplay(rec.ownerPhone)}</span>
                              </a>
                            </div>
                          )}
                          <div className="text-[9.5px] text-slate-500 dark:text-slate-400 font-mono font-bold pt-0.5">
                            الفترة: {rec.ownerFromDate || 'غير محدد'} ⬅️ {rec.ownerToDate || 'حتى الآن'}
                          </div>
                        </div>

                        {/* Tenant Box */}
                        {rec.tenantName ? (
                          <div className="p-2 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/80 dark:border-amber-800/60 space-y-0.5">
                            <div className="text-[10px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                              <User className="w-3 h-3" />
                              <span>المستأجر: {rec.tenantName}</span>
                            </div>
                            {rec.tenantPhone && (
                              <div className="flex items-center gap-1 font-mono text-[10px] pt-0.5" dir="ltr">
                                <a
                                  href={`tel:${formatMobileNumber(rec.tenantPhone)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-amber-900 dark:text-amber-300 hover:underline font-bold px-1 bg-amber-100/60 rounded"
                                  dir="ltr"
                                >
                                  <Phone className="w-2.5 h-2.5 text-amber-800 shrink-0" />
                                  <span>{formatPhoneForDisplay(rec.tenantPhone)}</span>
                                </a>
                              </div>
                            )}
                            <div className="text-[9.5px] text-amber-800/80 dark:text-amber-300/80 font-mono font-bold pt-0.5">
                              الفترة: {rec.tenantFromDate || 'غير محدد'} ⬅️ {rec.tenantToDate || 'حتى الآن'}
                            </div>
                          </div>
                        ) : (
                          <div className="p-2 bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-slate-100 dark:border-slate-700 flex items-center justify-center text-[9.5px] text-slate-400 font-semibold">
                            لا يوجد مستأجر (المالك هو الشاغل)
                          </div>
                        )}
                      </div>

                      {/* Notes if present */}
                      {rec.notes && (
                        <div className="text-[10px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-md border border-slate-100 dark:border-slate-700/80">
                          <span className="font-bold text-slate-400 ml-1">ملاحظات:</span>
                          {rec.notes}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Compact Modal Footer */}
        <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-500 font-bold text-[11px]">
            إجمالي السجلات: <strong className="text-slate-800 dark:text-white font-black">{historyList.length}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
