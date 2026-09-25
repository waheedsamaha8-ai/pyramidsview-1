import React, { useState, useEffect } from 'react';
import { Resident } from '../../types';
import { X, AlertCircle, Phone, Plus, Trash2, KeyRound, Smartphone } from 'lucide-react';
import { pickContactFromDevice, formatMobileNumber } from '../../utils/phoneUtils';
import { parseFlatNumber, isSameFlatNumber, getCanonicalFlatKey } from '../../utils/buildingStructure';

interface AddEditResidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  resident: Resident | null;
  residents: Resident[];
  activityTypes: string[];
  defaultMonthlyFee: number;
  activityDefaultFees?: Record<string, number>;
  onSubmit: (residentData: Resident, isEdit: boolean) => void;
}

export const AddEditResidentModal: React.FC<AddEditResidentModalProps> = ({
  isOpen,
  onClose,
  resident,
  residents,
  activityTypes,
  defaultMonthlyFee,
  activityDefaultFees,
  onSubmit,
}) => {
  const getDefaultFeeForActivity = (act: string): number => {
    if (activityDefaultFees && activityDefaultFees[act] !== undefined) {
      return activityDefaultFees[act];
    }
    switch (act) {
      case 'سكني': return defaultMonthlyFee || 400;
      case 'سكني مغلق': return 200;
      case 'مفروش': return 500;
      case 'إداري': return 600;
      case 'تجاري': return 800;
      default: return defaultMonthlyFee || 400;
    }
  };

  const [flatNumber, setFlatNumber] = useState('');
  const [name, setName] = useState('');
  const [activityType, setActivityType] = useState('سكني');
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>(['']);
  const [notes, setNotes] = useState('');
  const [ownershipType, setOwnershipType] = useState<'تمليك' | 'إيجار'>('تمليك');
  const [tenantName, setTenantName] = useState('');
  const [tenantPhoneNumbers, setTenantPhoneNumbers] = useState<string[]>(['']);
  const [monthlyFee, setMonthlyFee] = useState<number | ''>(defaultMonthlyFee || 400);
  const [initialBalanceType, setInitialBalanceType] = useState<'none' | 'debt' | 'surplus'>('none');
  const [initialBalanceVal, setInitialBalanceVal] = useState<number | ''>('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [tenantPassword, setTenantPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resident) {
      setFlatNumber(String(resident.flatNumber));
      setName(resident.name);
      setActivityType(resident.activityType || 'سكني');
      const parts = (resident.phone || '').split(/[,/;|\n]+/).map(p => p.trim()).filter(Boolean);
      setPhoneNumbers(parts.length > 0 ? parts : ['']);

      const cleanNotes = (resident.notes || '').includes('توليد تلقائي') ? '' : (resident.notes || '');
      setNotes(cleanNotes);
      setOwnershipType((resident.ownershipType as any) === 'إيجار' ? 'إيجار' : 'تمليك');
      setTenantName(resident.tenantName || '');
      const partsTenant = (resident.tenantPhone || '').split(/[,/;|\n]+/).map(p => p.trim()).filter(Boolean);
      setTenantPhoneNumbers(partsTenant.length > 0 ? partsTenant : ['']);

      const fee = resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee > 0
        ? resident.monthlyFee 
        : getDefaultFeeForActivity(resident.activityType || 'سكني');
      setMonthlyFee(fee);

      const initBal = resident.initialBalance || 0;
      if (initBal < 0) {
        setInitialBalanceType('debt');
        setInitialBalanceVal(Math.abs(initBal));
      } else if (initBal > 0) {
        setInitialBalanceType('surplus');
        setInitialBalanceVal(initBal);
      } else {
        setInitialBalanceType('none');
        setInitialBalanceVal('');
      }

      setEmail(resident.email || `flat${resident.flatNumber}@pyramids.com`);
      setPassword(resident.password || `pyr${resident.flatNumber}#2026`);
      setTenantEmail(resident.tenantEmail || `tenant${resident.flatNumber}@pyramids.com`);
      setTenantPassword(resident.tenantPassword || `pyr${resident.flatNumber}#2026`);
      setError(null);
    } else {
      const defaultAct = activityTypes[0] || 'سكني';
      setFlatNumber('');
      setName('');
      setActivityType(defaultAct);
      setPhoneNumbers(['']);
      setNotes('');
      setOwnershipType('تمليك');
      setTenantName('');
      setTenantPhoneNumbers(['']);
      setMonthlyFee(getDefaultFeeForActivity(defaultAct));
      setInitialBalanceType('none');
      setInitialBalanceVal('');
      setEmail('');
      setPassword('');
      setTenantEmail('');
      setTenantPassword('');
      setError(null);
    }
  }, [resident, isOpen]);

  const handlePickContactForOwner = async (index: number) => {
    const res = await pickContactFromDevice();
    if (res && res.supported === false) {
      alert('خاصية استيراد الأرقام من جهات الاتصال مدعومة على متصفحات الهواتف المحمولة (مثل Google Chrome على Android).');
      return;
    }
    if (res && res.tel) {
      const updated = [...phoneNumbers];
      updated[index] = res.tel;
      setPhoneNumbers(updated);
      if (!name.trim() && res.name) {
        setName(res.name);
      }
    }
  };

  const handlePickContactForTenant = async (index: number) => {
    const res = await pickContactFromDevice();
    if (res && res.supported === false) {
      alert('خاصية استيراد الأرقام من جهات الاتصال مدعومة على متصفحات الهواتف المحمولة (مثل Google Chrome على Android).');
      return;
    }
    if (res && res.tel) {
      const updated = [...tenantPhoneNumbers];
      updated[index] = res.tel;
      setTenantPhoneNumbers(updated);
      if (!tenantName.trim() && res.name) {
        setTenantName(res.name);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const flatStr = String(flatNumber).trim();
    if (!flatStr || !name.trim()) {
      setError('يرجى ملء جميع الحقول المطلوبة (رقم الوحدة، اسم الساكن/المالك).');
      return;
    }

    const parsed = parseFlatNumber(flatStr);
    if (!flatStr || parsed.main >= 99999) {
      setError('يرجى إدخال رقم وحدة صحيح (مثل 207 أو 502).');
      return;
    }

    const isDuplicate = residents.some(
      (r) => (isSameFlatNumber(r.flatNumber, flatStr) || getCanonicalFlatKey(r.flatNumber) === getCanonicalFlatKey(flatStr)) && (!resident || resident.id !== r.id)
    );
    if (isDuplicate) {
      setError(`رقم الوحدة (${flatStr}) مسجل بالفعل في كشف الوحدات. كل وحدة لها رقم مميز ولا يمكن تكرار الوحدات نهائياً.`);
      return;
    }

    if (monthlyFee !== '' && (isNaN(Number(monthlyFee)) || Number(monthlyFee) < 0)) {
      setError('قيمة الاشتراك الشهري لا يمكن أن تكون سالبة.');
      return;
    }

    if (initialBalanceVal !== '' && isNaN(Number(initialBalanceVal))) {
      setError('يرجى إدخال قيمة عددية صحيحة للرصيد الافتتاحي.');
      return;
    }

    for (const p of phoneNumbers) {
      const clean = p.trim();
      if (clean && clean.replace(/\D/g, '').length < 7) {
        setError(`رقم الهاتف (${clean}) غير مكتمل، يرجى التأكد من كتابة الرقم كاملاً.`);
        return;
      }
    }

    if (ownershipType === 'إيجار') {
      for (const p of tenantPhoneNumbers) {
        const clean = p.trim();
        if (clean && clean.replace(/\D/g, '').length < 7) {
          setError(`رقم هاتف المستأجر (${clean}) غير مكتمل، يرجى التأكد من كتابة الرقم كاملاً.`);
          return;
        }
      }
    }

    let finalInitialBalance = 0;
    if (initialBalanceType === 'debt' && initialBalanceVal !== '') {
      finalInitialBalance = -Math.abs(Number(initialBalanceVal));
    } else if (initialBalanceType === 'surplus' && initialBalanceVal !== '') {
      finalInitialBalance = Math.abs(Number(initialBalanceVal));
    }

    const finalPhone = phoneNumbers
      .map(p => formatMobileNumber(p.trim()))
      .filter(Boolean)
      .join(', ');

    const finalTenantPhone = ownershipType === 'إيجار'
      ? tenantPhoneNumbers.map(p => formatMobileNumber(p.trim())).filter(Boolean).join(', ')
      : '';

    const isEditMode = Boolean(resident && resident.id);
    const residentData: Resident = {
      id: isEditMode ? resident!.id : `res_${Date.now()}`,
      flatNumber: flatStr,
      name: name.trim(),
      activityType,
      phone: finalPhone,
      notes: notes.trim(),
      ownershipType,
      tenantName: ownershipType === 'إيجار' ? tenantName.trim() : '',
      tenantPhone: finalTenantPhone,
      monthlyFee: monthlyFee !== '' ? Number(monthlyFee) : (defaultMonthlyFee || 400),
      initialBalance: finalInitialBalance,
      email: email.trim() || `flat${flatStr}@pyramids.com`,
      password: password.trim() || `pyr${flatStr}#2026`,
      accountStatus: resident?.accountStatus || 'ACTIVE',
      tenantEmail: ownershipType === 'إيجار' ? (tenantEmail.trim() || `tenant${flatStr}@pyramids.com`) : '',
      tenantPassword: ownershipType === 'إيجار' ? (tenantPassword.trim() || `pyr${flatStr}#2026`) : '',
      tenantAccountStatus: resident?.tenantAccountStatus || 'ACTIVE',
    };

    onSubmit(residentData, isEditMode);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-2xl animate-scale-up text-right max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <h3 className="text-sm sm:text-base font-black text-slate-950">
            {resident ? 'تعديل بيانات الوحدة والساكن' : 'إضافة وحدة وساكن جديد'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl transition cursor-pointer">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-100 text-rose-600 text-[11px] p-3 rounded-xl mb-4 font-bold flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Row 1: Flat Number & Activity Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-600">رقم الوحدة *</label>
              <input
                type="text"
                placeholder="مثال: 502 أو 502-2"
                value={flatNumber}
                onChange={(e) => setFlatNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-right font-bold transition"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-600">نوع النشاط</label>
              <select
                value={activityType}
                onChange={(e) => {
                  const newAct = e.target.value;
                  setActivityType(newAct);
                  if (!resident || monthlyFee === '' || monthlyFee === 0 || monthlyFee === 200 || monthlyFee === 400 || monthlyFee === 500 || monthlyFee === 600 || monthlyFee === 800) {
                    setMonthlyFee(getDefaultFeeForActivity(newAct));
                  }
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-right font-bold transition cursor-pointer"
              >
                {activityTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Owner/Resident Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-600">اسم المالك / الشاغل الأساسي *</label>
              <input
                type="text"
                placeholder="اسم المالك أو الساكن"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-right font-bold transition"
                required
              />
            </div>

            <div className="space-y-1.5 min-w-0">
              <label className="text-[10px] font-black text-slate-600 block">أرقام هواتف المالك / الساكن</label>
              <div className="space-y-2">
                {phoneNumbers.map((num, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="01xxxxxxxxx"
                      value={num}
                      onChange={(e) => {
                        const updated = [...phoneNumbers];
                        updated[index] = e.target.value;
                        setPhoneNumbers(updated);
                      }}
                      dir="ltr"
                      className="flex-1 min-w-0 w-0 px-2 py-1.5 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-left font-bold transition"
                    />
                    <button
                      type="button"
                      onClick={() => handlePickContactForOwner(index)}
                      className="px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-[10px] font-extrabold flex items-center gap-1 transition shrink-0 cursor-pointer shadow-2xs"
                      title="سحب الرقم من سجل جهات الاتصال على الموبايل"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="hidden sm:inline">من السجل</span>
                    </button>
                    {phoneNumbers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPhoneNumbers(phoneNumbers.filter((_, i) => i !== index))}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition shrink-0 cursor-pointer"
                        title="حذف هذا الرقم"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPhoneNumbers([...phoneNumbers, ''])}
                  className="w-full py-1 text-[11px] font-black text-blue-900 bg-blue-50/70 hover:bg-blue-100 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer border border-blue-200/50"
                >
                  <Plus className="w-3 h-3" />
                  <span>إضافة رقم هاتف آخر للمالك</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tenant details if Rental */}
          {ownershipType === 'إيجار' && (
            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-3">
              <div className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                <span>بيانات المستأجر الحالي للوحدة</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-700">اسم المستأجر</label>
                  <input
                    type="text"
                    placeholder="اسم المستأجر"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-200 focus:border-amber-500 rounded-xl text-xs outline-none text-right font-bold transition"
                  />
                </div>

                <div className="space-y-1.5 min-w-0">
                  <label className="text-[10px] font-black text-slate-700 block">أرقام هواتف المستأجر</label>
                  <div className="space-y-2">
                    {tenantPhoneNumbers.map((num, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="01xxxxxxxxx"
                          value={num}
                          onChange={(e) => {
                            const updated = [...tenantPhoneNumbers];
                            updated[index] = e.target.value;
                            setTenantPhoneNumbers(updated);
                          }}
                          dir="ltr"
                          className="flex-1 min-w-0 w-0 px-2 py-1.5 bg-white border border-amber-200 focus:border-amber-500 rounded-xl text-xs outline-none text-left font-bold transition"
                        />
                        <button
                          type="button"
                          onClick={() => handlePickContactForTenant(index)}
                          className="px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-[10px] font-extrabold flex items-center gap-1 transition shrink-0 cursor-pointer shadow-2xs"
                          title="سحب الرقم من سجل جهات الاتصال على الموبايل"
                        >
                          <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="hidden sm:inline">من السجل</span>
                        </button>
                        {tenantPhoneNumbers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setTenantPhoneNumbers(tenantPhoneNumbers.filter((_, i) => i !== index))}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition shrink-0 cursor-pointer"
                            title="حذف هذا الرقم"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTenantPhoneNumbers([...tenantPhoneNumbers, ''])}
                      className="w-full py-1 text-[11px] font-black text-amber-900 bg-amber-100/70 hover:bg-amber-200/70 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer border border-amber-300/50"
                    >
                      <Plus className="w-3 h-3" />
                      <span>إضافة رقم هاتف آخر للمستأجر</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Row 3: Monthly Fee & Initial Balance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-600">قيمة الاشتراك الشهري (ج.م) *</label>
              <input
                type="number"
                min="0"
                placeholder="400"
                value={monthlyFee}
                onChange={(e) => setMonthlyFee(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-right font-bold transition"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-600">الرصيد الافتتاحي السابق للوحدة</label>
              <div className="flex gap-1.5">
                <select
                  value={initialBalanceType}
                  onChange={(e) => setInitialBalanceType(e.target.value as any)}
                  className="w-24 px-2 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs font-bold outline-none cursor-pointer"
                >
                  <option value="none">خالص (0)</option>
                  <option value="debt">مديونية (-)</option>
                  <option value="surplus">رصيد دائن (+)</option>
                </select>
                {initialBalanceType !== 'none' && (
                  <input
                    type="number"
                    min="0"
                    placeholder="المبلغ"
                    value={initialBalanceVal}
                    onChange={(e) => setInitialBalanceVal(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-right font-bold transition"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Row 4: Ownership Type & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-600">حالة الوحدة (تمليك / إيجار) *</label>
              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setOwnershipType('تمليك')}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition border cursor-pointer ${ownershipType === 'تمليك' ? 'bg-blue-900 text-white border-blue-900 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                >
                  تمليك (مالك)
                </button>
                <button
                  type="button"
                  onClick={() => setOwnershipType('إيجار')}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition border cursor-pointer ${ownershipType === 'إيجار' ? 'bg-amber-600 text-white border-amber-600 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                >
                  مستأجرة
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-600">ملاحظات</label>
              <input
                type="text"
                placeholder="اكتب ملاحظات إن وجدت..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-right font-bold transition"
              />
            </div>
          </div>

          {/* Login Credentials Section */}
          <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-blue-200/60 pb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-blue-900">
                <KeyRound className="w-3.5 h-3.5 text-blue-700" />
                <span>بيانات تسجيل الدخول للساكن</span>
              </div>
              <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                توليد تلقائي
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-700">البريد الإلكتروني لدخول الساكن</label>
                <input
                  type="email"
                  placeholder={`flat${flatNumber || 'X'}@pyramids.com`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  className="w-full px-3 py-2 bg-white border border-blue-200 focus:border-blue-500 rounded-xl text-xs font-mono font-bold outline-none text-left transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-700">كلمة المرور لدخول الساكن</label>
                <input
                  type="text"
                  placeholder={`pyr${flatNumber || 'X'}#2026`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                  className="w-full px-3 py-2 bg-white border border-blue-200 focus:border-blue-500 rounded-xl text-xs font-mono font-bold outline-none text-left transition"
                />
              </div>
            </div>

            {ownershipType === 'إيجار' && (
              <div className="pt-2 border-t border-blue-200/60">
                <div className="text-[10px] font-black text-amber-900 mb-1.5">بيانات دخول المستأجر الخاص بالوحدة</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-700">البريد الإلكتروني للمستأجر</label>
                    <input
                      type="email"
                      placeholder={`tenant${flatNumber || 'X'}@pyramids.com`}
                      value={tenantEmail}
                      onChange={(e) => setTenantEmail(e.target.value)}
                      dir="ltr"
                      className="w-full px-3 py-2 bg-white border border-amber-200 focus:border-amber-500 rounded-xl text-xs font-mono font-bold outline-none text-left transition"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-700">كلمة المرور للمستأجر</label>
                    <input
                      type="text"
                      placeholder={`pyr${flatNumber || 'X'}#2026`}
                      value={tenantPassword}
                      onChange={(e) => setTenantPassword(e.target.value)}
                      dir="ltr"
                      className="w-full px-3 py-2 bg-white border border-amber-200 focus:border-amber-500 rounded-xl text-xs font-mono font-bold outline-none text-left transition"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-900 text-white rounded-xl text-xs font-black hover:bg-blue-950 active:scale-[0.98] transition shadow-xs cursor-pointer"
            >
              {resident ? 'حفظ التعديلات' : 'إضافة الوحدة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
