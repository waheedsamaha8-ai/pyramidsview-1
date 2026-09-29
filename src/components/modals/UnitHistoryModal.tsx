import React, { useState, useEffect, useMemo } from 'react';
import { Resident, UnitHistoryRecord, UnitActivityRecord, AppConfig } from '../../types';
import { 
  X, Plus, History, Calendar, User, Edit, Trash2, CheckCircle2, Clock, Phone, 
  Save, Contact, Sparkles, RefreshCw, AlertTriangle, Layers, Building2, Tag, 
  Coins, ArrowRightLeft, DollarSign, Check, Activity, ShieldCheck, Home 
} from 'lucide-react';
import { formatMobileNumber, formatPhoneForDisplay, pickContactFromDevice } from '../../utils/phoneUtils';
import { 
  parseToStandardDate, 
  sortHistoryRecordsChronologically, 
  getLatestOccupantFromHistory,
  sortActivityRecordsChronologically,
  getLatestActivityFromHistory,
  getDefaultFeeForActivity,
  syncResidentCurrentActivity 
} from '../../utils/buildingStructure';

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
  activityTypes?: string[];
  config?: AppConfig;
}

export const UnitHistoryModal: React.FC<UnitHistoryModalProps> = ({
  isOpen,
  onClose,
  resident,
  onUpdateResident,
  activityTypes,
  config,
}) => {
  // Tabs: 'occupancy' (سجل الحيازة والشاغلين) | 'activity' (تسلسل النشاط والاستخدام)
  const [activeTab, setActiveTab] = useState<'occupancy' | 'activity'>('occupancy');

  // --- Occupancy History State ---
  const [historyList, setHistoryList] = useState<UnitHistoryRecord[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Occupancy Form State
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

  // --- Activity Timeline State ---
  const [activityList, setActivityList] = useState<UnitActivityRecord[]>([]);
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [deleteConfirmActivityId, setDeleteConfirmActivityId] = useState<string | null>(null);

  // Activity Form State
  const [formActivityType, setFormActivityType] = useState('سكني');
  const [formActivityFee, setFormActivityFee] = useState<string>('400');
  const [formActivityFromDate, setFormActivityFromDate] = useState('');
  const [formActivityToDate, setFormActivityToDate] = useState('');
  const [formIsCurrentActivity, setFormIsCurrentActivity] = useState(true);
  const [formActivityNotes, setFormActivityNotes] = useState('');
  const [activityErrorMsg, setActivityErrorMsg] = useState('');

  // Available activity types
  const availableActivityTypes = useMemo(() => {
    const list = activityTypes && activityTypes.length > 0
      ? activityTypes
      : ['سكني', 'بدون تشطيب', 'تحت التشطيب', 'سكني مغلق', 'إداري', 'تجاري', 'مفروش', 'بدون تحصيل'];
    const standard = ['سكني', 'بدون تشطيب', 'تحت التشطيب', 'سكني مغلق', 'إداري', 'تجاري', 'مفروش'];
    return Array.from(new Set([...list, ...standard])).filter(Boolean);
  }, [activityTypes]);

  // Synchronize historyList and activityList when resident changes or modal opens
  useEffect(() => {
    if (resident) {
      if (resident.history && Array.isArray(resident.history)) {
        setHistoryList(sortHistoryRecordsChronologically([...resident.history]));
      } else {
        setHistoryList([]);
      }

      if (resident.activityHistory && Array.isArray(resident.activityHistory)) {
        setActivityList(sortActivityRecordsChronologically([...resident.activityHistory]));
      } else {
        setActivityList([]);
      }
    } else {
      setHistoryList([]);
      setActivityList([]);
    }
    setIsAdding(false);
    setEditingId(null);
    setDeleteConfirmId(null);
    setIsAddingActivity(false);
    setEditingActivityId(null);
    setDeleteConfirmActivityId(null);
    setErrorMsg('');
    setActivityErrorMsg('');
  }, [resident?.id, resident?.history, resident?.activityHistory, isOpen]);

  if (!isOpen || !resident) return null;

  // --- Occupancy Helpers ---
  const handleAutoFillFromCurrentResident = () => {
    setOwnerName(resident.name || '');
    setOwnerPhone(resident.phone || '');
    if (resident.tenantName) {
      setTenantName(resident.tenantName || '');
      setTenantPhone(resident.tenantPhone || '');
    }
  };

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

  const handleStartAdd = () => {
    setOwnerName(resident.name || '');
    setOwnerPhone(resident.phone || '');
    setOwnerFromDate('');
    setOwnerToDate('');
    setIsCurrentOwner(true);

    setTenantName('');
    setTenantPhone('');
    setTenantFromDate('');
    setTenantToDate('');
    setIsCurrentTenant(true);

    setNotes('');
    setEditingId(null);
    setErrorMsg('');
    setIsAdding(true);
  };

  const handleStartEdit = (rec: UnitHistoryRecord) => {
    setOwnerName(rec.ownerName || '');
    setOwnerPhone(rec.ownerPhone || '');
    setOwnerFromDate(rec.ownerFromDate || '');
    setOwnerToDate(rec.ownerToDate || '');
    setIsCurrentOwner(!rec.ownerToDate || rec.ownerToDate.includes('حتى الآن') || rec.ownerToDate.includes('الان'));

    setTenantName(rec.tenantName || '');
    setTenantPhone(rec.tenantPhone || '');
    setTenantFromDate(rec.tenantFromDate || '');
    setTenantToDate(rec.tenantToDate || '');
    setIsCurrentTenant(!rec.tenantToDate || rec.tenantToDate.includes('حتى الآن') || rec.tenantToDate.includes('الان'));

    setNotes(rec.notes || '');
    setEditingId(rec.id);
    setErrorMsg('');
    setIsAdding(true);
  };

  const handleSaveRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resident) return;

    if (!ownerName.trim()) {
      setErrorMsg('يرجى إدخال اسم المالك');
      return;
    }

    const cleanOwnerPhone = ownerPhone ? formatMobileNumber(ownerPhone) : undefined;
    const cleanTenantPhone = tenantPhone ? formatMobileNumber(tenantPhone) : undefined;

    const record: UnitHistoryRecord = {
      id: editingId || `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      ownerName: ownerName.trim(),
      ownerPhone: cleanOwnerPhone,
      ownerFromDate: ownerFromDate || undefined,
      ownerToDate: isCurrentOwner ? undefined : (ownerToDate || undefined),
      tenantName: tenantName.trim() || undefined,
      tenantPhone: cleanTenantPhone,
      tenantFromDate: tenantName.trim() ? (tenantFromDate || undefined) : undefined,
      tenantToDate: tenantName.trim() ? (isCurrentTenant ? undefined : (tenantToDate || undefined)) : undefined,
      notes: notes.trim() || undefined,
      createdAt: editingId ? (historyList.find(h => h.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    };

    let updatedList: UnitHistoryRecord[];
    if (editingId) {
      updatedList = historyList.map(h => h.id === editingId ? record : h);
    } else {
      updatedList = [...historyList, record];
    }

    const sorted = sortHistoryRecordsChronologically(updatedList);
    setHistoryList(sorted);

    const latestOccupant = getLatestOccupantFromHistory({ ...resident, history: sorted });
    const isTenantNum = (p?: string) => {
      if (!p) return false;
      const digits = p.replace(/\D/g, '');
      return digits.length >= 6 && sorted.some(rec => rec.tenantPhone && rec.tenantPhone.replace(/\D/g, '').includes(digits));
    };
    const cleanPhone = latestOccupant.ownerPhone !== undefined 
      ? (latestOccupant.ownerPhone || '') 
      : (isTenantNum(resident.phone) ? '' : (resident.phone || ''));

    const updatedResident: Resident = {
      ...resident,
      history: sorted,
      name: latestOccupant.ownerName || resident.name,
      phone: cleanPhone,
      tenantName: latestOccupant.tenantName || '',
      tenantPhone: latestOccupant.tenantPhone || '',
      ownershipType: latestOccupant.tenantName ? 'إيجار' : 'تمليك',
    };

    onUpdateResident(updatedResident);
    setIsAdding(false);
    setEditingId(null);
    setErrorMsg('');
  };

  const confirmDeleteRecord = (id: string) => {
    if (!resident) return;
    const updatedList = historyList.filter(h => h.id !== id);
    const sorted = sortHistoryRecordsChronologically(updatedList);
    setHistoryList(sorted);

    let updatedResident: Resident = {
      ...resident,
      history: sorted,
    };

    if (sorted.length > 0) {
      const latestOccupant = getLatestOccupantFromHistory({ ...resident, history: sorted });
      const isTenantNum = (p?: string) => {
        if (!p) return false;
        const digits = p.replace(/\D/g, '');
        return digits.length >= 6 && sorted.some(rec => rec.tenantPhone && rec.tenantPhone.replace(/\D/g, '').includes(digits));
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
    setDeleteConfirmId(null);
  };

  // --- Activity Timeline Helpers ---
  const handleSelectActivityType = (type: string) => {
    setFormActivityType(type);
    const defFee = getDefaultFeeForActivity(type, config?.defaultMonthlyFee || 400, config?.activityDefaultFees);
    setFormActivityFee(String(defFee));
  };

  const handleStartAddActivity = () => {
    const initialType = resident.activityType || 'سكني';
    setFormActivityType(initialType);
    const defFee = resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee >= 0
      ? resident.monthlyFee
      : getDefaultFeeForActivity(initialType, config?.defaultMonthlyFee || 400, config?.activityDefaultFees);
    setFormActivityFee(String(defFee));
    setFormActivityFromDate('');
    setFormActivityToDate('');
    setFormIsCurrentActivity(true);
    setFormActivityNotes('');
    setEditingActivityId(null);
    setActivityErrorMsg('');
    setIsAddingActivity(true);
  };

  const handleStartEditActivity = (rec: UnitActivityRecord) => {
    setFormActivityType(rec.activityType || 'سكني');
    const defFee = rec.monthlyFee !== undefined && !isNaN(rec.monthlyFee) && rec.monthlyFee >= 0
      ? rec.monthlyFee
      : getDefaultFeeForActivity(rec.activityType, config?.defaultMonthlyFee || 400, config?.activityDefaultFees);
    setFormActivityFee(String(defFee));
    setFormActivityFromDate(rec.fromDate || '');
    setFormActivityToDate(rec.toDate || '');
    setFormIsCurrentActivity(!rec.toDate || rec.toDate.includes('حتى الآن') || rec.toDate.includes('الان'));
    setFormActivityNotes(rec.notes || '');
    setEditingActivityId(rec.id);
    setActivityErrorMsg('');
    setIsAddingActivity(true);
  };

  const handleSaveActivityRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resident) return;

    if (!formActivityType.trim()) {
      setActivityErrorMsg('يرجى تحديد نوع النشاط');
      return;
    }

    const feeNum = parseFloat(formActivityFee);
    const parsedFee = isNaN(feeNum) ? undefined : Math.max(0, feeNum);

    const record: UnitActivityRecord = {
      id: editingActivityId || `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      activityType: formActivityType.trim(),
      monthlyFee: parsedFee,
      fromDate: formActivityFromDate || undefined,
      toDate: formIsCurrentActivity ? undefined : (formActivityToDate || undefined),
      notes: formActivityNotes.trim() || undefined,
      createdAt: editingActivityId ? (activityList.find(a => a.id === editingActivityId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    };

    let updatedList: UnitActivityRecord[];
    if (editingActivityId) {
      updatedList = activityList.map(a => a.id === editingActivityId ? record : a);
    } else {
      updatedList = [...activityList, record];
    }

    const sorted = sortActivityRecordsChronologically(updatedList);
    setActivityList(sorted);

    // Synchronize top-level resident activityType & monthlyFee
    const latestAct = getLatestActivityFromHistory({ ...resident, activityHistory: sorted }, undefined, config?.defaultMonthlyFee, config?.activityDefaultFees);
    const updatedResident: Resident = {
      ...resident,
      activityHistory: sorted,
      activityType: latestAct.activityType || resident.activityType,
      monthlyFee: latestAct.monthlyFee !== undefined ? latestAct.monthlyFee : resident.monthlyFee,
    };

    onUpdateResident(updatedResident);
    setIsAddingActivity(false);
    setEditingActivityId(null);
    setActivityErrorMsg('');
  };

  const confirmDeleteActivityRecord = (id: string) => {
    if (!resident) return;
    const updatedList = activityList.filter(a => a.id !== id);
    const sorted = sortActivityRecordsChronologically(updatedList);
    setActivityList(sorted);

    const latestAct = getLatestActivityFromHistory({ ...resident, activityHistory: sorted }, undefined, config?.defaultMonthlyFee, config?.activityDefaultFees);
    const updatedResident: Resident = {
      ...resident,
      activityHistory: sorted,
      activityType: latestAct.activityType || resident.activityType,
      monthlyFee: latestAct.monthlyFee !== undefined ? latestAct.monthlyFee : resident.monthlyFee,
    };

    onUpdateResident(updatedResident);
    setDeleteConfirmActivityId(null);
  };

  // Helper color tags for activity types
  const getActivityBadgeColor = (type: string) => {
    if (type.includes('بدون تشطيب') || type.includes('بدون تحصيل')) {
      return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700';
    }
    if (type.includes('تشطيب')) {
      return 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700';
    }
    if (type.includes('سكني مغلق')) {
      return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700';
    }
    if (type.includes('إداري')) {
      return 'bg-purple-100 dark:bg-purple-950/70 text-purple-900 dark:text-purple-300 border-purple-300 dark:border-purple-700';
    }
    if (type.includes('تجاري')) {
      return 'bg-cyan-100 dark:bg-cyan-950/70 text-cyan-950 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700';
    }
    if (type.includes('مفروش')) {
      return 'bg-rose-100 dark:bg-rose-950/70 text-rose-900 dark:text-rose-300 border-rose-300 dark:border-rose-700';
    }
    return 'bg-blue-100 dark:bg-blue-950/70 text-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-700';
  };

  const currentActivityInfo = getLatestActivityFromHistory(resident, undefined, config?.defaultMonthlyFee, config?.activityDefaultFees);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-3 overflow-y-auto" dir="rtl" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#111a2e] rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-xl max-h-[85vh] sm:max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
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
                <h3 className="font-extrabold text-xs sm:text-sm text-white">سجل الوحدة الشامل</h3>
              </div>
              <p className="text-[10px] text-blue-200/90 font-medium">
                تسلسل الحيازة (الملاك والمستأجرين) وتاريخ النشاط والاستخدام الزمني
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

        {/* Tab Navigation Switcher */}
        <div className="flex items-center gap-1.5 px-3 pt-2 bg-slate-100 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700/80 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('occupancy')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-black rounded-t-xl transition cursor-pointer border-t border-x ${
              activeTab === 'occupancy'
                ? 'bg-white dark:bg-[#111a2e] text-blue-900 dark:text-blue-300 border-slate-200 dark:border-slate-700 -mb-[1px] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 border-transparent hover:bg-slate-200/50'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>سجل الحيازة والشاغلين</span>
            {historyList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                {historyList.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-black rounded-t-xl transition cursor-pointer border-t border-x ${
              activeTab === 'activity'
                ? 'bg-white dark:bg-[#111a2e] text-purple-900 dark:text-purple-300 border-slate-200 dark:border-slate-700 -mb-[1px] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 border-transparent hover:bg-slate-200/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-purple-600" />
            <span>تسلسل النشاط والاستخدام</span>
            {activityList.length > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-mono">
                {activityList.length}
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded-full text-[8.5px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                جديد
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: OCCUPANCY HISTORY (سجل الحيازة والشاغلين) */}
        {activeTab === 'occupancy' && (
          <>
            {/* Occupancy Banner */}
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
                  <span>إضافة تسلسل حيازة</span>
                </button>
              )}
            </div>

            {/* Occupancy Body */}
            <div className="p-3 sm:p-4 overflow-y-auto space-y-3 flex-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
              {/* Add / Edit Occupancy Form */}
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
                        <span>بيانات المستأجر (اختياري - يترك فارغاً في حالة التمليك)</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">اسم المستأجر:</span>
                        <input
                          type="text"
                          value={tenantName}
                          onChange={(e) => setTenantName(e.target.value)}
                          placeholder="مثال: يوسف إبراهيم (أو يترك فارغاً)"
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
                          placeholder="مثال: 01111900000"
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
                                <span className="text-[10px] font-bold text-amber-900 dark:text-amber-300">حتى الآن</span>
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

                  {/* Notes Block */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">ملاحظات عن هذا السجل:</span>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="مثال: تم شراء الوحدة في يناير ٢٠٢٥ وتأجيرها ابتداء من فبراير"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-slate-900 dark:text-white"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => { setIsAdding(false); setEditingId(null); setErrorMsg(''); }}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black transition flex items-center gap-1 cursor-pointer shadow-xs"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{editingId ? 'حفظ التعديل' : 'إضافة السجل'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Occupancy Timeline List */}
              {historyList.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                  <Clock className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    لا يوجد تسلسل ملكية أو حيازة مسجل لهذه الوحدة بعد.
                  </p>
                  <p className="text-[10px] text-slate-400">
                    يمكنك تسجيل الملاك المتعاقبين وتفاصيل المستأجرين مع تواريخ بداية ونهاية كل فترة.
                  </p>
                  <button
                    type="button"
                    onClick={handleStartAdd}
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-blue-900 text-white rounded-xl text-xs font-black hover:bg-blue-800 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>تسجيل السجل الأول الآن</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {historyList.map((rec, idx) => {
                    const isDeleting = deleteConfirmId === rec.id;
                    const isLatest = idx === historyList.length - 1;

                    return (
                      <div 
                        key={rec.id}
                        className={`p-3 rounded-2xl border transition ${
                          isLatest 
                            ? 'bg-blue-50/40 dark:bg-slate-800/80 border-blue-200 dark:border-blue-800 shadow-2xs' 
                            : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full font-mono">
                                #{idx + 1}
                              </span>
                              {isLatest && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded-md border border-emerald-200">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>السجل الساري حالياً</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              {isDeleting ? (
                                <div className="flex items-center gap-1 animate-fade-in">
                                  <span className="text-[10px] font-black text-rose-600">تأكيد الحذف؟</span>
                                  <button
                                    type="button"
                                    onClick={() => confirmDeleteRecord(rec.id)}
                                    className="px-2 py-0.5 bg-rose-600 text-white rounded text-[10px] font-bold hover:bg-rose-700 cursor-pointer"
                                  >
                                    نعم
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-bold hover:bg-slate-300 cursor-pointer"
                                  >
                                    لا
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(rec)}
                                    className="p-1 text-slate-500 hover:text-blue-900 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-md transition cursor-pointer"
                                    title="تعديل السجل"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(rec.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 rounded-md transition cursor-pointer"
                                    title="حذف السجل"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            {/* Owner Box */}
                            <div className="p-2 bg-blue-50/50 dark:bg-slate-800/60 rounded-xl border border-blue-100 dark:border-blue-900/40 space-y-1">
                              <div className="flex items-center gap-1 text-[11px] font-black text-blue-950 dark:text-blue-200">
                                <User className="w-3 h-3 text-blue-700" />
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
                                    <Phone className="w-2.5 h-2.5 text-blue-800 shrink-0" />
                                    <span>{formatPhoneForDisplay(rec.ownerPhone)}</span>
                                  </a>
                                </div>
                              )}
                              <div className="text-[9.5px] text-blue-800/80 dark:text-blue-300/80 font-mono font-bold pt-0.5">
                                الفترة: {rec.ownerFromDate || 'غير محدد'} ⬅️ {rec.ownerToDate || 'حتى الآن'}
                              </div>
                            </div>

                            {/* Tenant Box */}
                            {rec.tenantName ? (
                              <div className="p-2 bg-amber-50/50 dark:bg-slate-800/60 rounded-xl border border-amber-100 dark:border-amber-900/40 space-y-1">
                                <div className="flex items-center gap-1 text-[11px] font-black text-amber-950 dark:text-amber-200">
                                  <User className="w-3 h-3 text-amber-700" />
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
                              <div className="p-2 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-center text-[9.5px] text-slate-400 font-semibold">
                                لا يوجد مستأجر (المالك هو الشاغل)
                              </div>
                            )}
                          </div>

                          {rec.notes && (
                            <div className="text-[10px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-lg border border-slate-100 dark:border-slate-700/80">
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
          </>
        )}

        {/* TAB 2: ACTIVITY TIMELINE (تسلسل النشاط والاستخدام) */}
        {activeTab === 'activity' && (
          <>
            {/* Current Activity Banner */}
            <div className="bg-purple-50/70 dark:bg-slate-800/80 px-3 py-2 border-b border-purple-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400 shrink-0" />
                  <span className="font-bold text-slate-500 dark:text-slate-400">النشاط الساري:</span>
                  <span className={`px-2 py-0.5 rounded-lg font-black text-xs border ${getActivityBadgeColor(currentActivityInfo.activityType)}`}>
                    {currentActivityInfo.activityType}
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-purple-200 dark:border-purple-800 font-bold text-slate-700 dark:text-slate-300">
                  <Coins className="w-3 h-3 text-amber-600 shrink-0" />
                  <span>الاشتراك: <strong>{currentActivityInfo.monthlyFee.toLocaleString()} ج.م</strong> / شهر</span>
                </div>
              </div>

              {!isAddingActivity && (
                <button
                  type="button"
                  onClick={handleStartAddActivity}
                  className="mr-auto inline-flex items-center gap-1 px-2.5 py-1 bg-purple-900 hover:bg-purple-800 text-white rounded-xl text-[10.5px] font-black shadow-2xs transition transform hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة مرحلة نشاط جديدة</span>
                </button>
              )}
            </div>

            {/* Activity Body */}
            <div className="p-3 sm:p-4 overflow-y-auto space-y-3 flex-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
              {/* Add / Edit Activity Form */}
              {isAddingActivity && (
                <form onSubmit={handleSaveActivityRecord} className="p-3 bg-purple-50/60 dark:bg-slate-800/90 border-2 border-purple-200 dark:border-purple-800 rounded-xl space-y-3 animate-fade-in text-xs">
                  <div className="flex items-center justify-between pb-1.5 border-b border-purple-200/60 dark:border-slate-700">
                    <h4 className="font-extrabold text-xs text-purple-950 dark:text-purple-300 flex items-center gap-1.5">
                      <Edit className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
                      <span>{editingActivityId ? 'تعديل مرحلة النشاط' : 'إضافة مرحلة نشاط وتغير استخدام جديدة'}</span>
                    </h4>
                  </div>

                  {activityErrorMsg && (
                    <div className="p-2 bg-rose-50 text-rose-700 text-[11px] font-bold rounded-lg border border-rose-200">
                      {activityErrorMsg}
                    </div>
                  )}

                  {/* Activity Type Selection Chips */}
                  <div className="bg-white dark:bg-[#16223b] p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <label className="text-[11px] font-black text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-purple-700" />
                      <span>نوع النشاط والاستخدام خلال هذه الفترة:</span>
                    </label>

                    {/* Quick selection chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {availableActivityTypes.map((type) => {
                        const isSelected = formActivityType === type;
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => handleSelectActivityType(type)}
                            className={`px-2.5 py-1 rounded-lg text-[10.5px] font-black transition cursor-pointer border ${
                              isSelected
                                ? 'bg-purple-900 text-white border-purple-950 shadow-2xs'
                                : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {type}
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom input or selection */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">نوع النشاط (مخصص أو محدد):</span>
                        <input
                          type="text"
                          value={formActivityType}
                          onChange={(e) => setFormActivityType(e.target.value)}
                          placeholder="مثال: بدون تشطيب أو تحت التشطيب"
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-slate-900 dark:text-white"
                          required
                        />
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">قيمة الاشتراك الشهري لهذه الفترة (ج.م):</span>
                        <input
                          type="number"
                          value={formActivityFee}
                          onChange={(e) => setFormActivityFee(e.target.value)}
                          placeholder="0 أو 400"
                          min="0"
                          step="1"
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-black outline-none text-slate-900 dark:text-white"
                          required
                        />
                        <span className="text-[9px] text-slate-400 block mt-0.5">
                          تُطبق هذه القيمة على التحصيلات الشهرية للوحدة طوال هذه الفترة المحددة.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dates Range */}
                  <div className="bg-white dark:bg-[#16223b] p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <label className="text-[11px] font-black text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-purple-700" />
                      <span>فترة سريان هذا النشاط:</span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <MonthYearPicker
                          label="تاريخ بداية النشاط من:"
                          value={formActivityFromDate}
                          onChange={setFormActivityFromDate}
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">إلى تاريخ:</span>
                          <label className="inline-flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formIsCurrentActivity}
                              onChange={(e) => setFormIsCurrentActivity(e.target.checked)}
                              className="rounded text-purple-600 focus:ring-0 cursor-pointer"
                            />
                            <span className="text-[10px] font-bold text-purple-900 dark:text-purple-300">حتى الآن (سارٍ حالياً)</span>
                          </label>
                        </div>
                        {!formIsCurrentActivity && (
                          <MonthYearPicker
                            value={formActivityToDate}
                            onChange={setFormActivityToDate}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Notes Block */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">ملاحظات عن هذه المرحلة:</span>
                    <input
                      type="text"
                      value={formActivityNotes}
                      onChange={(e) => setFormActivityNotes(e.target.value)}
                      placeholder="مثال: كانت الشقة على المحارة ثم بدأ التشطيب في مارس ٢٠٢٦"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-slate-900 dark:text-white"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => { setIsAddingActivity(false); setEditingActivityId(null); setActivityErrorMsg(''); }}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-purple-900 hover:bg-purple-800 text-white rounded-xl text-xs font-black transition flex items-center gap-1 cursor-pointer shadow-xs"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{editingActivityId ? 'حفظ تعديل النشاط' : 'إضافة مرحلة النشاط'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Activity Timeline List */}
              {activityList.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 space-y-2.5">
                  <Layers className="w-8 h-8 text-purple-400 mx-auto" />
                  <p className="text-xs font-black text-slate-700 dark:text-slate-200">
                    لا يوجد تسلسل زمني لتغير النشاط مسجل لهذه الوحدة بعد.
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
                    تعمل الوحدة حالياً بالنشاط المسجل بالدليل (<strong>{resident.activityType || 'سكني'}</strong>) باشتراك شهري (<strong>{(resident.monthlyFee ?? getDefaultFeeForActivity(resident.activityType || 'سكني')).toLocaleString()} ج.م</strong>).
                    <br />
                    يمكنك تسجيل التدرج الزمني لنشاط الوحدة (مثال: من بدون تشطيب إلى تحت التشطيب ثم إلى سكني أو إداري) مع تحديد الفترة الزمنية والاشتراك الشهري لكل مرحلة.
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleStartAddActivity}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-900 hover:bg-purple-800 text-white rounded-xl text-xs font-black transition shadow-2xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة مرحلة نشاط جديدة</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activityList.map((rec, idx) => {
                    const isDeleting = deleteConfirmActivityId === rec.id;
                    const isLatest = idx === activityList.length - 1;
                    const fee = rec.monthlyFee !== undefined && !isNaN(rec.monthlyFee) && rec.monthlyFee >= 0
                      ? rec.monthlyFee
                      : getDefaultFeeForActivity(rec.activityType, config?.defaultMonthlyFee || 400, config?.activityDefaultFees);

                    return (
                      <div 
                        key={rec.id}
                        className={`p-3 rounded-2xl border transition ${
                          isLatest 
                            ? 'bg-purple-50/40 dark:bg-slate-800/80 border-purple-200 dark:border-purple-800 shadow-2xs' 
                            : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-black bg-purple-100 dark:bg-purple-950 text-purple-900 dark:text-purple-300 px-2 py-0.5 rounded-full font-mono">
                                المرحلة #{idx + 1}
                              </span>
                              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black border ${getActivityBadgeColor(rec.activityType)}`}>
                                {rec.activityType}
                              </span>
                              {isLatest && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded-md border border-emerald-200">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>النشاط الساري حالياً</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              {isDeleting ? (
                                <div className="flex items-center gap-1 animate-fade-in">
                                  <span className="text-[10px] font-black text-rose-600">تأكيد الحذف؟</span>
                                  <button
                                    type="button"
                                    onClick={() => confirmDeleteActivityRecord(rec.id)}
                                    className="px-2 py-0.5 bg-rose-600 text-white rounded text-[10px] font-bold hover:bg-rose-700 cursor-pointer"
                                  >
                                    نعم
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmActivityId(null)}
                                    className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-bold hover:bg-slate-300 cursor-pointer"
                                  >
                                    لا
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditActivity(rec)}
                                    className="p-1 text-slate-500 hover:text-purple-900 hover:bg-purple-50 dark:hover:bg-slate-700 rounded-md transition cursor-pointer"
                                    title="تعديل مرحلة النشاط"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmActivityId(rec.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 rounded-md transition cursor-pointer"
                                    title="حذف هذا النشاط"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Fee and Date Details */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-150 dark:border-slate-700/60 flex items-center justify-between">
                              <span className="text-slate-500 dark:text-slate-400 font-bold text-[10.5px]">الاشتراك الشهري المعتمد:</span>
                              <span className="font-black text-xs text-slate-900 dark:text-white font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                {fee > 0 ? `${fee.toLocaleString()} ج.م / شهر` : '0 ج.م (بدون تحصيل)'}
                              </span>
                            </div>

                            <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-150 dark:border-slate-700/60 flex items-center justify-between">
                              <span className="text-slate-500 dark:text-slate-400 font-bold text-[10.5px]">الفترة الزمنية:</span>
                              <span className="font-bold text-[10.5px] text-purple-900 dark:text-purple-300 font-mono">
                                {rec.fromDate || 'غير محدد'} ⬅️ {rec.toDate || 'حتى الآن'}
                              </span>
                            </div>
                          </div>

                          {rec.notes && (
                            <div className="text-[10px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-lg border border-slate-100 dark:border-slate-700/80">
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
          </>
        )}

        {/* Modal Footer */}
        <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-3 text-slate-500 font-bold text-[11px]">
            <span>
              {activeTab === 'occupancy' 
                ? <>إجمالي سجلات الحيازة: <strong className="text-slate-800 dark:text-white font-black">{historyList.length}</strong></> 
                : <>إجمالي مراحل النشاط: <strong className="text-purple-900 dark:text-purple-300 font-black">{activityList.length}</strong></>}
            </span>
          </div>
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
