import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Payment, Resident, UserRole, FloorConfig, AppConfig } from '../../types';
import { 
  X, CheckCircle2, AlertCircle, Calendar, Plus, Building, RefreshCw, 
  Trash2, Camera, Upload, Eye, Image as ImageIcon, Sparkles, Layers 
} from 'lucide-react';
import { 
  groupResidentsByFloor,
  formatResidentOptionLabel, 
  getHistoricalOccupantForDate, 
  getHistoricalActivityForDate,
  getDefaultFeeForActivity, 
  isSameFlatNumber 
} from '../../utils/buildingStructure';
import { 
  getResidentMonthlyFee, 
  getPrescribedFeeForMonth, 
  isPaymentForYearAndMonth, 
  isMonthlySubscriptionType 
} from '../../utils/financialCalculations';
import { compressImageFile, compressBase64Image } from '../../utils/imageCompressor';
import { saveImageToIndexedDB } from '../../services/imageStorage';

const monthNamesArabic = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export interface PaymentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPayment?: Payment | null;
  initialResident?: Resident | null;
  initialMonth?: string;
  residents: Resident[];
  payments: Payment[];
  paymentTypes: string[];
  role: UserRole;
  currentYear: number;
  floorConfigs?: FloorConfig[];
  config?: AppConfig;
  defaultMonthlyFee?: number;
  activityDefaultFees?: Record<string, number>;
  onAdd?: (payment: Payment, base64Image?: string) => void;
  onEdit?: (payment: Payment, base64Image?: string) => void;
  onDistributePayment?: (originalPaymentId: string, distributedPayments: Payment[], deletedPaymentIds?: string[]) => void;
  onEditResident?: (resident: Resident) => void;
  onPreviewImage?: (url: string) => void;
}

export const PaymentFormModal: React.FC<PaymentFormModalProps> = ({
  isOpen,
  onClose,
  initialPayment,
  initialResident,
  initialMonth,
  residents,
  payments,
  paymentTypes,
  role,
  currentYear,
  floorConfigs,
  config,
  defaultMonthlyFee = 400,
  activityDefaultFees,
  onAdd,
  onEdit,
  onDistributePayment,
  onEditResident,
  onPreviewImage,
}) => {
  if (!isOpen) return null;

  const defaultMonthStr = initialMonth 
    ? String(parseInt(initialMonth, 10)).padStart(2, '0')
    : String(new Date().getMonth() + 1).padStart(2, '0');

  // Form states
  const [residentId, setResidentId] = useState('');
  const [month, setMonth] = useState(defaultMonthStr);
  const [isAggregatedCollection, setIsAggregatedCollection] = useState<boolean>(false);
  const [coveredMonths, setCoveredMonths] = useState<string[]>([]);
  const [showMultiMonthPicker, setShowMultiMonthPicker] = useState<boolean>(false);
  const [targetActivityType, setTargetActivityType] = useState<string>('سكني');
  const [paymentType, setPaymentType] = useState('');
  const [dueAmount, setDueAmount] = useState<number | ''>('');
  const [amount, setAmount] = useState<number | ''>('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'collected' | 'pending' | 'cancelled'>('collected');
  const [notes, setNotes] = useState('');
  const [imageName, setImageName] = useState('');
  const [base64Image, setBase64Image] = useState<string>('');
  const [existingFileUrl, setExistingFileUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [confirmData, setConfirmData] = useState<{
    type: 'add' | 'edit';
    paymentData?: Payment;
    multiplePayments?: Payment[];
    deletedPaymentIds?: string[];
    residentToUpdate?: Resident;
    base64Image?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const residentFloorGroups = useMemo(() => {
    return groupResidentsByFloor(residents, floorConfigs);
  }, [residents, floorConfigs]);

  const allAvailableActivityTypes = useMemo(() => {
    const list = ['سكني', 'تجاري', 'إداري', 'عيادة', 'تحت التشطيب', 'مغلقة', 'بدون تحصيل'];
    if (config?.activityTypes && Array.isArray(config.activityTypes)) {
      config.activityTypes.forEach(t => {
        if (!list.includes(t)) list.push(t);
      });
    }
    return list;
  }, [config?.activityTypes]);

  const getActivityDefaultFee = (activityName: string, dateStr?: string) => {
    return getDefaultFeeForActivity(
      activityName,
      defaultMonthlyFee,
      activityDefaultFees,
      dateStr || `${currentYear}-${month}`,
      config?.activityFeePeriods
    );
  };

  // Helper to find master payment if initialPayment is child
  const findMasterPayment = (pay: Payment): Payment => {
    if (pay.distributionSourceId) {
      const found = payments.find(p => String(p.id) === String(pay.distributionSourceId));
      if (found) return found;
    }
    const foundByChildId = payments.find(p => Array.isArray(p.distributedPaymentIds) && p.distributedPaymentIds.map(String).includes(String(pay.id)));
    if (foundByChildId) return foundByChildId;
    return pay;
  };

  // Populate state on open
  useEffect(() => {
    setError(null);
    setConfirmData(null);

    if (initialPayment) {
      // EDIT MODE
      const masterPay = findMasterPayment(initialPayment);
      const masterId = String(masterPay.id);

      const isMaster = Boolean(masterPay.isDistributed) || (Array.isArray(masterPay.distributedPaymentIds) && masterPay.distributedPaymentIds.length > 0);
      const isChild = Boolean(initialPayment.distributionSourceId);
      const isDistGroup = isMaster || isChild;

      const childPayments = payments.filter(p => 
        String(p.id) !== masterId && (
          String(p.distributionSourceId || '') === masterId ||
          (Array.isArray(masterPay.distributedPaymentIds) && masterPay.distributedPaymentIds.map(String).includes(String(p.id)))
        )
      );

      const resObj = residents.find(r => r.id === (masterPay.residentId || initialPayment.residentId)) ||
                     residents.find(r => isSameFlatNumber(r.flatNumber, masterPay.flatNumber || initialPayment.flatNumber));

      setResidentId(resObj ? resObj.id : (masterPay.residentId || initialPayment.residentId || ''));
      setMonth(String(parseInt(initialPayment.month || masterPay.month || defaultMonthStr, 10)).padStart(2, '0'));
      setPaymentType(initialPayment.paymentType || masterPay.paymentType || paymentTypes[0] || 'اشتراك شهري');
      setReceiptNumber(masterPay.receiptNumber || initialPayment.receiptNumber || '');
      setPaymentStatus((masterPay.status as any) || (initialPayment.status as any) || 'collected');

      const cleanNotes = (masterPay.notes || initialPayment.notes || '')
        .replace(/\(سداد مجمع.*?\)/g, '')
        .replace(/\(استحقاق مجمع.*?\)/g, '')
        .replace(/\(تم التسجيل.*?\)/g, '')
        .replace(/\(تم التحصيل.*?\)/g, '')
        .trim();
      setNotes(cleanNotes);

      const rawDue = initialPayment.expectedAmount ?? initialPayment.dueAmount ?? masterPay.expectedAmount ?? (masterPay as any).dueAmount;
      const prescribedFee = resObj ? getPrescribedFeeForMonth(
        resObj,
        currentYear,
        parseInt(initialPayment.month || defaultMonthStr, 10),
        payments,
        defaultMonthlyFee,
        activityDefaultFees,
        config?.activityFeePeriods,
        config?.customUnitFeePeriods
      ).monthlyFee : (defaultMonthlyFee || 400);

      let initialDue = (rawDue !== undefined && !isNaN(Number(rawDue)) && Number(rawDue) > 0)
        ? Number(rawDue)
        : (prescribedFee > 0 ? prescribedFee : (defaultMonthlyFee || 400));

      if (isDistGroup && childPayments.length > 0 && prescribedFee > 0 && initialDue >= prescribedFee * (childPayments.length + 1)) {
        initialDue = prescribedFee;
      }
      setDueAmount(initialDue);

      if (isDistGroup) {
        const totalAmount = masterPay.originalAmountBeforeDistribution || (masterPay.amount + childPayments.reduce((s, c) => s + (Number(c.amount) || 0), 0));
        setAmount(totalAmount);

        const allMonths = Array.from(new Set([masterPay.month, ...childPayments.map(c => c.month)]))
          .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        setCoveredMonths(allMonths.length > 0 ? allMonths : [initialPayment.month]);
        setIsAggregatedCollection(true);
        setShowMultiMonthPicker(true);
      } else {
        setAmount(initialPayment.amount);
        setCoveredMonths([String(parseInt(initialPayment.month, 10)).padStart(2, '0')]);
        setIsAggregatedCollection(false);
        setShowMultiMonthPicker(false);
      }

      setExistingFileUrl(masterPay.fileUrl || initialPayment.fileUrl || '');
      setBase64Image('');
      setImageName('');

      const hist = resObj ? getHistoricalActivityForDate(resObj, `${currentYear}-${initialPayment.month || defaultMonthStr}`, defaultMonthlyFee, activityDefaultFees, config?.activityFeePeriods) : null;
      setTargetActivityType(hist?.activityType || resObj?.activityType || 'سكني');

    } else {
      // ADD MODE
      const targetRes = initialResident || (residents.length > 0 ? residents[0] : null);
      const resId = targetRes ? targetRes.id : '';
      setResidentId(resId);
      setMonth(defaultMonthStr);
      setPaymentType(paymentTypes[0] || 'اشتراك شهري');
      setReceiptNumber('');
      setPaymentStatus('collected');
      setNotes('');
      setExistingFileUrl('');
      setBase64Image('');
      setImageName('');
      setIsAggregatedCollection(false);
      setCoveredMonths([defaultMonthStr]);
      setShowMultiMonthPicker(false);

      if (targetRes) {
        const prescribed = getPrescribedFeeForMonth(
          targetRes,
          currentYear,
          parseInt(defaultMonthStr, 10),
          payments,
          defaultMonthlyFee,
          activityDefaultFees,
          config?.activityFeePeriods,
          config?.customUnitFeePeriods
        );
        const fee = prescribed.monthlyFee > 0 ? prescribed.monthlyFee : (defaultMonthlyFee || 400);
        setDueAmount(fee);
        setAmount(fee);
        setTargetActivityType(prescribed.activityType || targetRes.activityType || 'سكني');
      } else {
        setDueAmount(defaultMonthlyFee || 400);
        setAmount(defaultMonthlyFee || 400);
        setTargetActivityType('سكني');
      }
    }
  }, [isOpen, initialPayment, initialResident, initialMonth]);

  const handleResidentSelect = (selectedId: string) => {
    setResidentId(selectedId);
    const selectedRes = residents.find(r => r.id === selectedId);
    if (!selectedRes) return;

    const prescribed = getPrescribedFeeForMonth(
      selectedRes,
      currentYear,
      parseInt(month, 10),
      payments,
      defaultMonthlyFee,
      activityDefaultFees,
      config?.activityFeePeriods,
      config?.customUnitFeePeriods
    );
    const fee = prescribed.monthlyFee > 0 ? prescribed.monthlyFee : (defaultMonthlyFee || 400);
    setTargetActivityType(prescribed.activityType || selectedRes.activityType || 'سكني');

    // Due amount is strictly for the collection month (never multiplied by covered months)
    setDueAmount(fee);
    if (!initialPayment) {
      const totalMonthsCount = (isAggregatedCollection && coveredMonths.length > 0) ? coveredMonths.length : 1;
      setAmount(fee * totalMonthsCount);
    }
  };

  const handleActivityTypeChange = (newAct: string) => {
    setTargetActivityType(newAct);
    const fee = getActivityDefaultFee(newAct, `${currentYear}-${month}`);
    // Due amount is for the single collection month
    setDueAmount(fee);
    if (!initialPayment) {
      const totalMonthsCount = (isAggregatedCollection && coveredMonths.length > 0) ? coveredMonths.length : 1;
      setAmount(fee * totalMonthsCount);
    }
  };

  const applyDefaultFeeForActivity = (actType: string) => {
    const fee = getActivityDefaultFee(actType, `${currentYear}-${month}`);
    // Due amount is for the single collection month
    setDueAmount(fee);
    if (!initialPayment) {
      const totalMonthsCount = (isAggregatedCollection && coveredMonths.length > 0) ? coveredMonths.length : 1;
      setAmount(fee * totalMonthsCount);
    }
  };

  const toggleCoveredMonth = (mStr: string) => {
    const cleanM = String(parseInt(mStr, 10)).padStart(2, '0');
    let next: string[];
    if (coveredMonths.includes(cleanM)) {
      if (coveredMonths.length === 1) return; // Must keep at least one month
      next = coveredMonths.filter(x => x !== cleanM);
    } else {
      next = [...coveredMonths, cleanM].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }
    setCoveredMonths(next);

    // CRITICAL: Do NOT change dueAmount when selecting/toggling months!
    // dueAmount represents the single collection month fee and is only changed manually.
    if (!initialPayment) {
      const selectedRes = residents.find(r => r.id === residentId);
      if (selectedRes) {
        const prescribed = getPrescribedFeeForMonth(
          selectedRes,
          currentYear,
          parseInt(month, 10),
          payments,
          defaultMonthlyFee,
          activityDefaultFees,
          config?.activityFeePeriods,
          config?.customUnitFeePeriods
        );
        const fee = prescribed.monthlyFee > 0 ? prescribed.monthlyFee : (defaultMonthlyFee || 400);
        setAmount(fee * next.length);
      }
    }
  };

  // Quick multi-month presets
  const handleSelectSameMonthOnly = () => {
    setCoveredMonths([month]);
    updateAmountForMonthsCount(1);
  };

  const handleSelectQuarter = () => {
    const startM = parseInt(month, 10) || 1;
    const mList: string[] = [];
    for (let i = 0; i < 3; i++) {
      const mVal = startM + i;
      if (mVal <= 12) mList.push(String(mVal).padStart(2, '0'));
    }
    setCoveredMonths(mList);
    updateAmountForMonthsCount(mList.length);
  };

  const handleSelectHalfYear = () => {
    const startM = parseInt(month, 10) || 1;
    const mList: string[] = [];
    for (let i = 0; i < 6; i++) {
      const mVal = startM + i;
      if (mVal <= 12) mList.push(String(mVal).padStart(2, '0'));
    }
    setCoveredMonths(mList);
    updateAmountForMonthsCount(mList.length);
  };

  const handleSelectRestOfYear = () => {
    const startM = parseInt(month, 10) || 1;
    const mList: string[] = [];
    for (let i = startM; i <= 12; i++) {
      mList.push(String(i).padStart(2, '0'));
    }
    setCoveredMonths(mList);
    updateAmountForMonthsCount(mList.length);
  };

  const handleSelectAllYear = () => {
    const all = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    setCoveredMonths(all);
    updateAmountForMonthsCount(12);
  };

  const updateAmountForMonthsCount = (count: number) => {
    // CRITICAL: Do NOT change dueAmount when selecting months count!
    if (!initialPayment) {
      const selectedRes = residents.find(r => r.id === residentId);
      if (selectedRes) {
        const prescribed = getPrescribedFeeForMonth(
          selectedRes,
          currentYear,
          parseInt(month, 10),
          payments,
          defaultMonthlyFee,
          activityDefaultFees,
          config?.activityFeePeriods,
          config?.customUnitFeePeriods
        );
        const fee = prescribed.monthlyFee > 0 ? prescribed.monthlyFee : (defaultMonthlyFee || 400);
        setAmount(fee * count);
      }
    }
  };

  // Image handling
  const triggerFileSelection = (useCamera: boolean) => {
    if (!fileInputRef.current) return;
    if (useCamera) {
      fileInputRef.current.setAttribute('capture', 'environment');
    } else {
      fileInputRef.current.removeAttribute('capture');
    }
    fileInputRef.current.click();
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedBase64 = await compressImageFile(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.7 });
        setBase64Image(compressedBase64);
        setImageName(file.name);
      } catch (err) {
        console.error('Image compression error:', err);
        const reader = new FileReader();
        reader.onloadend = () => {
          setBase64Image(reader.result as string);
          setImageName(file.name);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleRemoveImage = () => {
    setBase64Image('');
    setExistingFileUrl('');
    setImageName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Submission handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!residentId) {
      setError('يرجى تحديد الساكن / الوحدة.');
      return;
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      setError('يرجى إدخال مبلغ صحيح.');
      return;
    }

    const numDueAmount = dueAmount !== '' && !isNaN(Number(dueAmount)) ? Number(dueAmount) : undefined;
    const resident = residents.find(r => r.id === residentId);
    if (!resident) {
      setError('تعذر العثور على بيانات الوحدة المحددة.');
      return;
    }

    let residentToUpdate: Resident | undefined = undefined;
    if (targetActivityType && targetActivityType !== resident.activityType) {
      residentToUpdate = {
        ...resident,
        activityType: targetActivityType,
      };
    }

    const targetCoveredMonths = (isAggregatedCollection && coveredMonths.length > 0)
      ? Array.from(new Set(coveredMonths.map(x => String(parseInt(x, 10)).padStart(2, '0')))).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      : [String(parseInt(month, 10)).padStart(2, '0')];

    const masterMonthNorm = String(parseInt(month, 10)).padStart(2, '0');
    const primaryMonthName = monthNamesArabic[parseInt(masterMonthNorm, 10) - 1];

    const isCollected = paymentStatus === 'collected';
    const isPending = paymentStatus === 'pending';

    if (initialPayment) {
      // EDIT MODE
      const masterPayment = findMasterPayment(initialPayment);
      const masterPaymentId = String(masterPayment.id);

      const existingChildPayments = payments.filter(p => 
        String(p.id) !== masterPaymentId && (
          String(p.distributionSourceId || '') === masterPaymentId ||
          (Array.isArray(masterPayment.distributedPaymentIds) && masterPayment.distributedPaymentIds.map(String).includes(String(p.id)))
        )
      );
      const existingChildIds = existingChildPayments.map(p => String(p.id));

      if (targetCoveredMonths.length > 1 || (targetCoveredMonths.length === 1 && targetCoveredMonths[0] !== masterMonthNorm)) {
        // Multi-month distribution or cross-month distribution
        const isMasterInCovered = targetCoveredMonths.includes(masterMonthNorm);
        const masterMonth = masterMonthNorm;
        const otherMonths = isMasterInCovered
          ? targetCoveredMonths.filter(m => m !== masterMonthNorm)
          : targetCoveredMonths;

        const otherIds = otherMonths.map((m, idx) => {
          if (existingChildIds[idx]) return existingChildIds[idx];
          return `pay_${Date.now()}_${m}_${idx + 1}`;
        });
        const deletedPaymentIds = existingChildIds.filter(id => !otherIds.includes(id));

        const hist0 = getHistoricalOccupantForDate(resident, `${currentYear}-${masterMonth}`);
        const coveredNames = targetCoveredMonths.map(x => monthNamesArabic[parseInt(x, 10) - 1]).join('، ');

        const noteHeader = targetCoveredMonths.length === 1
          ? `${isCollected ? 'سداد' : 'استحقاق'} عن شهر ${coveredNames}${!isMasterInCovered ? ` (${isCollected ? 'تم التحصيل' : 'تم التسجيل'} في شهر ${primaryMonthName} ${currentYear} وموزع بالكامل إلى شهر ${coveredNames})` : ''}`
          : `${isCollected ? 'سداد' : 'استحقاق'} مجمع عن شهور: ${coveredNames}${!isMasterInCovered ? ` (${isCollected ? 'تم التحصيل' : 'تم التسجيل'} في شهر ${primaryMonthName} ${currentYear})` : ''}`;

        const cleanNotes = (notes || '').trim()
          ? (notes.includes('سداد عن شهر') || notes.includes('سداد مجمع عن شهور') || notes.includes('استحقاق عن شهر') || notes.includes('استحقاق مجمع عن شهور') ? notes : `${notes} (${noteHeader})`)
          : noteHeader;

        const totalCoveredCount = targetCoveredMonths.length;
        const basePerMonth = Math.floor(numAmount / totalCoveredCount);
        const remainder = numAmount - (basePerMonth * totalCoveredCount);
        const masterAmountAllocated = isMasterInCovered ? (basePerMonth + remainder) : 0;

        const masterPaymentData: Payment = {
          id: masterPaymentId,
          year: currentYear,
          month: masterMonth,
          residentId,
          residentName: hist0.occupantName || resident.name,
          flatNumber: resident.flatNumber,
          paymentType,
          amount: masterAmountAllocated,
          expectedAmount: numDueAmount,
          dueAmount: numDueAmount,
          receiptNumber: (receiptNumber || '').trim(),
          notes: cleanNotes,
          fileId: base64Image ? '' : (existingFileUrl ? (initialPayment.fileId || '') : ''),
          fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
          date: initialPayment.date || new Date().toISOString().split('T')[0],
          isManuallyPaid: isCollected,
          isManuallyEdited: true,
          status: paymentStatus,
          isAggregatedCollection: true,
          isDistributed: true,
          distributedPaymentIds: otherIds,
          distributionSourceId: undefined,
          originalAmountBeforeDistribution: numAmount,
        };

        const childPayments: Payment[] = otherMonths.map((m, idx) => {
          const hist = getHistoricalOccupantForDate(resident, `${currentYear}-${m}`);
          const recNum = (receiptNumber || '').trim();
          const baseUserNotes = notes ? notes.replace(/\(سداد.*?\)/g, '').replace(/\(استحقاق.*?\)/g, '').trim() : '';
          const allocatedChildAmount = (!isMasterInCovered && idx === 0) ? (basePerMonth + remainder) : basePerMonth;
          const noteText = `${isCollected ? 'تم السداد' : 'مستحق غير محصل مسجل'} في شهر ${primaryMonthName} ${currentYear} بإيصال رقم ${recNum || '—'} (القيمة الموزعة للشهر: ${allocatedChildAmount.toLocaleString()} ج.م)${baseUserNotes ? ` (${baseUserNotes})` : ''}`;
          const childPrescribed = getPrescribedFeeForMonth(
            resident,
            currentYear,
            parseInt(m, 10),
            payments,
            defaultMonthlyFee,
            activityDefaultFees,
            config?.activityFeePeriods,
            config?.customUnitFeePeriods
          );
          const childDue = (numDueAmount !== undefined && numDueAmount > 0) ? numDueAmount : (childPrescribed.monthlyFee || defaultMonthlyFee || 400);
          return {
            id: otherIds[idx],
            year: currentYear,
            month: m,
            residentId,
            residentName: hist.occupantName || resident.name,
            flatNumber: resident.flatNumber,
            paymentType,
            amount: allocatedChildAmount,
            expectedAmount: childDue,
            dueAmount: childDue,
            receiptNumber: recNum,
            notes: noteText,
            fileId: base64Image ? '' : (existingFileUrl ? (initialPayment.fileId || '') : ''),
            fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
            date: initialPayment.date || new Date().toISOString().split('T')[0],
            isManuallyPaid: isCollected,
            isManuallyEdited: true,
            status: paymentStatus,
            isAggregatedCollection: false,
            isDistributed: false,
            distributionSourceId: masterPaymentId,
            originalAmountBeforeDistribution: undefined,
          };
        });

        setConfirmData({
          type: 'edit',
          multiplePayments: [masterPaymentData, ...childPayments],
          deletedPaymentIds: deletedPaymentIds.length > 0 ? deletedPaymentIds : undefined,
          residentToUpdate,
          base64Image: base64Image || undefined
        });
      } else {
        // Single month edit
        const hist = getHistoricalOccupantForDate(resident, `${currentYear}-${masterMonthNorm}`);
        const paymentData: Payment = {
          id: masterPaymentId,
          year: currentYear,
          month: masterMonthNorm,
          residentId,
          residentName: hist.occupantName || resident.name,
          flatNumber: resident.flatNumber,
          paymentType,
          amount: numAmount,
          expectedAmount: numDueAmount,
          dueAmount: numDueAmount,
          receiptNumber: (receiptNumber || '').trim(),
          notes: (notes || '').trim(),
          fileId: base64Image ? '' : (existingFileUrl ? (initialPayment.fileId || '') : ''),
          fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
          date: initialPayment.date || new Date().toISOString().split('T')[0],
          isManuallyPaid: isCollected,
          isManuallyEdited: true,
          status: paymentStatus,
          isAggregatedCollection: false,
          isDistributed: false,
          distributionSourceId: undefined,
          distributedPaymentIds: undefined,
          originalAmountBeforeDistribution: undefined,
        };

        setConfirmData({
          type: 'edit',
          paymentData,
          deletedPaymentIds: existingChildIds.length > 0 ? existingChildIds : undefined,
          residentToUpdate,
          base64Image: base64Image || undefined
        });
      }

    } else {
      // ADD MODE
      const masterPaymentId = `pay_${Date.now()}`;

      if (targetCoveredMonths.length > 1 || (targetCoveredMonths.length === 1 && targetCoveredMonths[0] !== masterMonthNorm)) {
        const isMasterInCovered = targetCoveredMonths.includes(masterMonthNorm);
        const masterMonth = masterMonthNorm;
        const otherMonths = isMasterInCovered
          ? targetCoveredMonths.filter(m => m !== masterMonthNorm)
          : targetCoveredMonths;
        const otherIds = otherMonths.map((m, idx) => `pay_${Date.now()}_${m}_${idx + 1}`);

        const histMaster = getHistoricalOccupantForDate(resident, `${currentYear}-${masterMonth}`);
        const coveredNames = targetCoveredMonths.map(x => monthNamesArabic[parseInt(x, 10) - 1]).join('، ');

        const noteHeader = targetCoveredMonths.length === 1
          ? `${isCollected ? 'سداد' : 'استحقاق'} عن شهر ${coveredNames}${!isMasterInCovered ? ` (${isCollected ? 'تم التحصيل' : 'تم التسجيل'} في شهر ${primaryMonthName} ${currentYear} وموزع بالكامل إلى شهر ${coveredNames})` : ''}`
          : `${isCollected ? 'سداد' : 'استحقاق'} مجمع عن شهور: ${coveredNames}${!isMasterInCovered ? ` (${isCollected ? 'تم التحصيل' : 'تم التسجيل'} في شهر ${primaryMonthName} ${currentYear})` : ''}`;

        const cleanNotes = (notes || '').trim()
          ? (notes.includes('سداد عن شهر') || notes.includes('سداد مجمع عن شهور') ? notes : `${notes} (${noteHeader})`)
          : noteHeader;

        const totalCoveredCount = targetCoveredMonths.length;
        const basePerMonth = Math.floor(numAmount / totalCoveredCount);
        const remainder = numAmount - (basePerMonth * totalCoveredCount);
        const masterAmountAllocated = isMasterInCovered ? (basePerMonth + remainder) : 0;

        const masterPayment: Payment = {
          id: masterPaymentId,
          year: currentYear,
          month: masterMonth,
          residentId,
          residentName: histMaster.occupantName || resident.name,
          flatNumber: resident.flatNumber,
          paymentType,
          amount: masterAmountAllocated,
          expectedAmount: numDueAmount,
          dueAmount: numDueAmount,
          receiptNumber: (receiptNumber || '').trim(),
          notes: cleanNotes,
          fileId: '',
          fileUrl: base64Image || existingFileUrl || '',
          date: new Date().toISOString().split('T')[0],
          isManuallyPaid: isCollected,
          isManuallyEdited: true,
          status: paymentStatus,
          isAggregatedCollection: true,
          isDistributed: true,
          distributedPaymentIds: otherIds,
          distributionSourceId: undefined,
          originalAmountBeforeDistribution: numAmount,
        };

        const childPayments: Payment[] = otherMonths.map((m, idx) => {
          const hist = getHistoricalOccupantForDate(resident, `${currentYear}-${m}`);
          const recNum = (receiptNumber || '').trim();
          const baseUserNotes = notes ? notes.replace(/\(سداد.*?\)/g, '').replace(/\(استحقاق.*?\)/g, '').trim() : '';
          const allocatedChildAmount = (!isMasterInCovered && idx === 0) ? (basePerMonth + remainder) : basePerMonth;
          const noteText = `${isCollected ? 'تم السداد' : 'مستحق غير محصل مسجل'} في شهر ${primaryMonthName} ${currentYear} بإيصال رقم ${recNum || '—'} (القيمة الموزعة للشهر: ${allocatedChildAmount.toLocaleString()} ج.م)${baseUserNotes ? ` (${baseUserNotes})` : ''}`;
          const childPrescribed = getPrescribedFeeForMonth(
            resident,
            currentYear,
            parseInt(m, 10),
            payments,
            defaultMonthlyFee,
            activityDefaultFees,
            config?.activityFeePeriods,
            config?.customUnitFeePeriods
          );
          const childDue = (numDueAmount !== undefined && numDueAmount > 0) ? numDueAmount : (childPrescribed.monthlyFee || defaultMonthlyFee || 400);
          return {
            id: otherIds[idx],
            year: currentYear,
            month: m,
            residentId,
            residentName: hist.occupantName || resident.name,
            flatNumber: resident.flatNumber,
            paymentType,
            amount: allocatedChildAmount,
            expectedAmount: childDue,
            dueAmount: childDue,
            receiptNumber: recNum,
            notes: noteText,
            fileId: '',
            fileUrl: base64Image || existingFileUrl || '',
            date: new Date().toISOString().split('T')[0],
            isManuallyPaid: isCollected,
            isManuallyEdited: true,
            status: paymentStatus,
            isAggregatedCollection: false,
            isDistributed: false,
            distributionSourceId: masterPaymentId,
            originalAmountBeforeDistribution: undefined,
          };
        });

        setConfirmData({
          type: 'add',
          multiplePayments: [masterPayment, ...childPayments],
          residentToUpdate,
          base64Image: base64Image || undefined
        });
      } else {
        const hist = getHistoricalOccupantForDate(resident, `${currentYear}-${masterMonthNorm}`);
        const paymentData: Payment = {
          id: masterPaymentId,
          year: currentYear,
          month: masterMonthNorm,
          residentId,
          residentName: hist.occupantName || resident.name,
          flatNumber: resident.flatNumber,
          paymentType,
          amount: numAmount,
          expectedAmount: numDueAmount,
          dueAmount: numDueAmount,
          receiptNumber: (receiptNumber || '').trim(),
          notes: (notes || '').trim(),
          fileId: '',
          fileUrl: base64Image || existingFileUrl || '',
          date: new Date().toISOString().split('T')[0],
          isManuallyPaid: isCollected,
          isManuallyEdited: true,
          status: paymentStatus,
          isAggregatedCollection: false,
          isDistributed: false,
          distributionSourceId: undefined,
          distributedPaymentIds: undefined,
          originalAmountBeforeDistribution: undefined,
        };

        setConfirmData({
          type: 'add',
          paymentData,
          residentToUpdate,
          base64Image: base64Image || undefined
        });
      }
    }
  };

  const handleExecuteConfirm = () => {
    if (!confirmData) return;

    if (confirmData.residentToUpdate && onEditResident) {
      onEditResident(confirmData.residentToUpdate);
    }

    if (confirmData.multiplePayments && confirmData.multiplePayments.length > 0) {
      if (confirmData.type === 'edit') {
        if (onDistributePayment) {
          const origId = confirmData.multiplePayments[0].id;
          onDistributePayment(origId, confirmData.multiplePayments, confirmData.deletedPaymentIds);
        } else if (onEdit) {
          confirmData.multiplePayments.forEach(p => onEdit(p, confirmData.base64Image));
        }
      } else {
        if (onDistributePayment) {
          const origId = confirmData.multiplePayments[0].id;
          onDistributePayment(origId, confirmData.multiplePayments, []);
        } else if (onAdd) {
          confirmData.multiplePayments.forEach(p => onAdd(p, confirmData.base64Image));
        }
      }
    } else if (confirmData.paymentData) {
      if (confirmData.type === 'edit') {
        if (confirmData.deletedPaymentIds && confirmData.deletedPaymentIds.length > 0 && onDistributePayment) {
          onDistributePayment(confirmData.paymentData.id, [confirmData.paymentData], confirmData.deletedPaymentIds);
        } else if (onEdit) {
          onEdit(confirmData.paymentData, confirmData.base64Image);
        }
      } else if (onAdd) {
        onAdd(confirmData.paymentData, confirmData.base64Image);
      }
    }

    setConfirmData(null);
    onClose();
  };

  const isReadOnly = role === 'RESIDENT';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-xs p-2 sm:p-4 animate-fade-in" dir="rtl">
      <div className="w-full max-w-md max-h-[94vh] overflow-y-auto bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-2xl animate-scale-up text-right">
        
        {/* Header */}
        <h3 className="text-base sm:text-lg font-black text-slate-950 border-b pb-2.5 mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-900" />
            <span>{initialPayment ? (role === 'ASSISTANT' ? 'تعديل ملاحظات التحصيل' : 'تعديل التحصيل') : 'إضافة تحصيل جديد'}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </h3>

        {role === 'ASSISTANT' && initialPayment && (
          <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-2.5 rounded-xl mb-3 font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-blue-600" />
            <span>صلاحية المساعد الفني تتيح لك التعديل في "خانة الملاحظات" فقط.</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-xs p-2.5 rounded-xl mb-3 font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-2.5 sm:space-y-3">
          
          {/* Unit / Resident Dropdown with Multi-Month Toggle */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500">الساكن / الوحدة <span className="text-red-500">*</span></label>
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 w-full">
              <select
                value={residentId}
                onChange={(e) => handleResidentSelect(e.target.value)}
                disabled={role === 'ASSISTANT' && !!initialPayment}
                className="flex-1 min-w-0 px-2 sm:px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-bold transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed h-[38px] truncate"
                required
              >
                {residentFloorGroups.map((group, idx) => (
                  <optgroup key={idx} label={`📍 ${group.floorLabel}`}>
                    {group.residents.map((r) => (
                      <option key={r.id} value={r.id}>
                        {formatResidentOptionLabel(r, `${currentYear}-${month}`)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <button
                type="button"
                disabled={role === 'ASSISTANT' && !!initialPayment}
                onClick={() => {
                  const nextState = !isAggregatedCollection;
                  setIsAggregatedCollection(nextState);
                  if (!nextState) {
                    setCoveredMonths([month]);
                    setShowMultiMonthPicker(false);
                    updateAmountForMonthsCount(1);
                  } else {
                    setShowMultiMonthPicker(true);
                    if (coveredMonths.length === 0) {
                      setCoveredMonths([month]);
                    }
                    updateAmountForMonthsCount(coveredMonths.length > 0 ? coveredMonths.length : 1);
                  }
                }}
                className={`h-[38px] px-2.5 sm:px-3 text-xs font-black rounded-xl border transition flex items-center justify-center gap-1 shrink-0 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap ${
                  isAggregatedCollection
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 ring-2 ring-emerald-500/20 shadow-emerald-600/10'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
                title={isAggregatedCollection ? 'سداد مجمع مفعل (انقر لإلغاء التفعيل أو تعديل الشهور)' : 'انقر لتفعيل سداد مجمع على عدة شهور'}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isAggregatedCollection ? 'bg-white animate-pulse' : 'bg-slate-400'}`}></span>
                <span>مجمع</span>
                {isAggregatedCollection && (
                  <span className="text-[9px] bg-white/25 px-1 py-0.2 rounded font-black">
                    {coveredMonths.length > 0 ? `(${coveredMonths.length})` : '✓'}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Target Month & Payment Type */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 items-start">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500">شهر التحصيل الفعلي</label>
              <select
                value={month}
                onChange={(e) => {
                  const newM = e.target.value;
                  setMonth(newM);
                  if (!isAggregatedCollection) {
                    setCoveredMonths([newM]);
                  }
                  const selectedRes = residents.find(r => r.id === residentId);
                  if (selectedRes) {
                    const prescribed = getPrescribedFeeForMonth(
                      selectedRes,
                      currentYear,
                      parseInt(newM, 10),
                      payments,
                      defaultMonthlyFee,
                      activityDefaultFees,
                      config?.activityFeePeriods,
                      config?.customUnitFeePeriods
                    );
                    const fee = prescribed.monthlyFee > 0 ? prescribed.monthlyFee : (defaultMonthlyFee || 400);
                    // Due amount is for THIS single collection month (never multiplied by covered months!)
                    setDueAmount(fee);
                    if (!initialPayment) {
                      const totalCount = (isAggregatedCollection && coveredMonths.length > 0) ? coveredMonths.length : 1;
                      setAmount(fee * totalCount);
                    }
                  }
                }}
                disabled={role === 'ASSISTANT' && !!initialPayment}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-bold transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {monthNamesArabic.map((name, idx) => (
                  <option key={idx} value={String(idx + 1).padStart(2, '0')}>
                    {name} {currentYear}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500">نوع التحصيل <span className="text-red-500">*</span></label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                disabled={role === 'ASSISTANT' && !!initialPayment}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-bold transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {paymentTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Multi-Month Expandable Selector & Badges */}
            {isAggregatedCollection && showMultiMonthPicker && (
              <div className="col-span-2 p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2 animate-scale-up">
                <div className="flex items-center justify-between text-[10.5px] font-black text-blue-950">
                  <span className="flex items-center gap-1.5">
                    <span>📅 اختر الشهور المستحقة المسددة بهذه الدفعة:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMultiMonthPicker(false)}
                    className="text-[10px] text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                  >
                    طي ✕
                  </button>
                </div>

                {/* Fast Presets */}
                <div className="flex items-center gap-1 sm:gap-1.5 w-full flex-nowrap overflow-x-auto pt-0.5 pb-1 border-b border-blue-200/60 no-scrollbar">
                  <span className="text-[9px] sm:text-[9.5px] font-black text-blue-900 shrink-0 whitespace-nowrap">اختيار سريع:</span>
                  <button
                    type="button"
                    onClick={handleSelectSameMonthOnly}
                    className="px-1.5 sm:px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-md text-[8.5px] sm:text-[9.5px] font-bold transition cursor-pointer shadow-3xs active:scale-95 shrink-0 whitespace-nowrap flex-1 text-center"
                  >
                    ⚡ شهر التحصيل فقط
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectQuarter}
                    className="px-1.5 sm:px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-md text-[8.5px] sm:text-[9.5px] font-bold transition cursor-pointer shadow-3xs active:scale-95 shrink-0 whitespace-nowrap flex-1 text-center"
                  >
                    ⚡ 3 شهور
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectHalfYear}
                    className="px-1.5 sm:px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-md text-[8.5px] sm:text-[9.5px] font-bold transition cursor-pointer shadow-3xs active:scale-95 shrink-0 whitespace-nowrap flex-1 text-center"
                  >
                    ⚡ 6 شهور
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectRestOfYear}
                    className="px-1.5 sm:px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-md text-[8.5px] sm:text-[9.5px] font-bold transition cursor-pointer shadow-3xs active:scale-95 shrink-0 whitespace-nowrap flex-1 text-center"
                  >
                    ⚡ باقي السنة
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllYear}
                    className="px-1.5 sm:px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-md text-[8.5px] sm:text-[9.5px] font-bold transition cursor-pointer shadow-3xs active:scale-95 shrink-0 whitespace-nowrap flex-1 text-center"
                  >
                    ⚡ السنة كاملة
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-1">
                  {monthNamesArabic.map((name, idx) => {
                    const mStr = String(idx + 1).padStart(2, '0');
                    const isCollectionMonth = String(parseInt(mStr, 10)) === String(parseInt(month, 10));
                    const isCovered = coveredMonths.some(x => String(parseInt(x, 10)) === String(parseInt(mStr, 10)));

                    return (
                      <button
                        key={mStr}
                        type="button"
                        disabled={role === 'ASSISTANT' && !!initialPayment}
                        onClick={() => toggleCoveredMonth(mStr)}
                        className={`py-1.5 px-0.5 rounded-lg text-[10px] font-black transition cursor-pointer text-center disabled:opacity-60 disabled:cursor-not-allowed ${
                          isCovered
                            ? isCollectionMonth
                              ? 'bg-blue-900 text-white shadow-2xs ring-2 ring-blue-500'
                              : 'bg-emerald-600 text-white shadow-2xs ring-1 ring-emerald-400'
                            : isCollectionMonth
                            ? 'bg-blue-50 text-blue-900 border-2 border-dashed border-blue-400 hover:bg-blue-100'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-blue-100/50'
                        }`}
                      >
                        {name}
                        {isCovered && isCollectionMonth && <span className="block text-[7.5px] opacity-90">✓ (الرئيسي)</span>}
                        {isCovered && !isCollectionMonth && <span className="block text-[7.5px] opacity-90">✓ (موزع)</span>}
                        {!isCovered && isCollectionMonth && <span className="block text-[7.5px] opacity-80">(التحصيل)</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="text-[10px] text-blue-900 font-bold bg-white/95 px-2.5 py-1.5 rounded-lg border border-blue-200/60 space-y-1">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span>شهر التحصيل: <strong className="text-blue-900 font-black">{monthNamesArabic[parseInt(month, 10) - 1]} {currentYear}</strong></span>
                    <span>الشهور المسددة: <strong className="text-emerald-700 font-black">{coveredMonths.length} شهور</strong></span>
                  </div>
                  <p className="text-slate-500 text-[9.5px] font-semibold">
                    💡 يتم تقسيم القيمة المسددة بالتساوي على الشهور المختارة ({coveredMonths.length} شهور) مع توثيق إيصال السداد.
                  </p>
                </div>
              </div>
            )}

            {isAggregatedCollection && !showMultiMonthPicker && (
              <div className="col-span-2">
                <button
                  type="button"
                  onClick={() => setShowMultiMonthPicker(true)}
                  className="w-full py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl text-[10.5px] font-black transition flex items-center justify-between cursor-pointer shadow-2xs"
                >
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    <span>توزيع السداد مفعل ({coveredMonths.length} شهور)</span>
                  </span>
                  <span className="text-[9.5px] text-emerald-700 underline font-bold">تعديل الشهور ▾</span>
                </button>
              </div>
            )}
          </div>

          {/* Unit Activity Change & Default Subscription Fee Box */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-2.5 space-y-1.5 text-right">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                <Building className="w-3 h-3 text-blue-900" />
                <span>نوع نشاط الوحدة في هذا الشهر:</span>
              </label>
              {targetActivityType !== (residents.find(r => r.id === residentId)?.activityType || 'سكني') && (
                <span className="text-[9.5px] font-black text-blue-900 bg-blue-100 px-1.5 py-0.2 rounded border border-blue-200">
                  نشاط جديد
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 items-center">
              <select
                value={targetActivityType}
                onChange={(e) => handleActivityTypeChange(e.target.value)}
                disabled={role === 'ASSISTANT' && !!initialPayment}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:border-blue-500 rounded-lg text-xs font-bold outline-none cursor-pointer"
              >
                {allAvailableActivityTypes.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => applyDefaultFeeForActivity(targetActivityType)}
                disabled={role === 'ASSISTANT' && !!initialPayment}
                className="w-full px-2 py-1.5 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-[10px] sm:text-[10.5px] font-black transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs truncate"
              >
                <RefreshCw className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">تطبيق اشتراك النشاط ({getActivityDefaultFee(targetActivityType) * ((isAggregatedCollection && coveredMonths.length > 0) ? coveredMonths.length : 1)} ج.م)</span>
              </button>
            </div>
          </div>

          {/* Amounts and Receipt Number Row - Universal 3 Columns */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 block truncate">المبلغ المستحق</label>
              <input
                type="number"
                placeholder="المستحق"
                value={dueAmount === '' || isNaN(Number(dueAmount)) ? '' : dueAmount}
                onChange={(e) => setDueAmount(e.target.value !== '' ? Number(e.target.value) : '')}
                className="w-full px-2 sm:px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-bold transition text-blue-950"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 block truncate">المبلغ المستلم <span className="text-red-500">*</span></label>
              <input
                type="number"
                placeholder="المستلم"
                value={amount === '' || isNaN(Number(amount)) ? '' : amount}
                onChange={(e) => setAmount(e.target.value !== '' ? Number(e.target.value) : '')}
                disabled={role === 'ASSISTANT' && !!initialPayment}
                className="w-full px-2 sm:px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-bold transition disabled:opacity-60 disabled:cursor-not-allowed"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 block truncate">رقم الإيصال</label>
              <input
                type="text"
                placeholder="مثال: 4501"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                disabled={role === 'ASSISTANT' && !!initialPayment}
                className="w-full px-2 sm:px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-bold transition disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* 3 Buttons for Payment/Receipt Status */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500">حالة السداد / الإيصال</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setPaymentStatus('collected')}
                disabled={role === 'ASSISTANT' && !!initialPayment}
                className={`py-1.5 px-1 rounded-xl text-[11px] font-black transition flex items-center justify-center gap-1 border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  paymentStatus === 'collected'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs ring-1 ring-emerald-600/30'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>تم التحصيل</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentStatus('pending')}
                disabled={role === 'ASSISTANT' && !!initialPayment}
                className={`py-1.5 px-1 rounded-xl text-[11px] font-black transition flex items-center justify-center gap-1 border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  paymentStatus === 'pending'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-2xs ring-1 ring-amber-500/30'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <AlertCircle className="w-3 h-3" />
                <span>لم يتم</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentStatus('cancelled')}
                disabled={role === 'ASSISTANT' && !!initialPayment}
                className={`py-1.5 px-1 rounded-xl text-[11px] font-black transition flex items-center justify-center gap-1 border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  paymentStatus === 'cancelled'
                    ? 'bg-rose-700 text-white border-rose-700 shadow-2xs ring-1 ring-rose-600/30'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <X className="w-3 h-3" />
                <span>لاغي</span>
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-blue-900 flex items-center justify-between">
              <span>ملاحظات {role === 'ASSISTANT' && initialPayment && <span className="text-emerald-700 font-extrabold">(مسموح للتعديل)</span>}</span>
            </label>
            <input
              type="text"
              placeholder="ملاحظات (مثال: تم الاستلام نقداً، سداد مجمع، إلخ)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-blue-200 focus:border-blue-600 rounded-xl text-xs sm:text-sm outline-none text-right font-medium transition"
            />
          </div>

          {/* Receipt Image Upload & Interactive Preview */}
          <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-slate-700 flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-blue-900" />
                <span>صورة الإيصال أو سند التحصيل</span>
              </label>
              {(base64Image || existingFileUrl) && (
                <span className="text-[9.5px] text-emerald-700 bg-emerald-50 font-black px-1.5 py-0.2 rounded border border-emerald-200/60">
                  {base64Image ? 'صورة جديدة' : 'صورة محفوظة'}
                </span>
              )}
            </div>

            {(base64Image || existingFileUrl) ? (
              <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-2 flex items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div 
                    onClick={() => onPreviewImage && onPreviewImage(base64Image || existingFileUrl)}
                    className="relative w-11 h-11 rounded-lg overflow-hidden border border-slate-200 cursor-pointer shadow-2xs shrink-0 group bg-slate-200 flex items-center justify-center"
                    title="انقر لمشاهدة تفاصيل الصورة بالحجم الكامل"
                  >
                    <img 
                      src={base64Image || existingFileUrl} 
                      alt="صورة الإيصال" 
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                    />
                    <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                      <Eye className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <div className="space-y-0.5 text-right min-w-0">
                    <p className="text-[11px] font-black text-slate-800 truncate">
                      {imageName || (base64Image ? 'صورة إيصال جديدة' : 'صورة الإيصال المسجلة')}
                    </p>
                    {onPreviewImage && (
                      <button
                        type="button"
                        onClick={() => onPreviewImage(base64Image || existingFileUrl)}
                        className="text-[10px] text-blue-900 hover:text-blue-950 font-black flex items-center gap-1 cursor-pointer bg-blue-50/80 px-1.5 py-0.2 rounded border border-blue-100/60 w-fit"
                      >
                        <Eye className="w-2.5 h-2.5 text-blue-700" />
                        <span>معاينة الصورة</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => triggerFileSelection(false)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-black transition cursor-pointer shadow-2xs"
                  >
                    تغيير
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="p-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-lg transition cursor-pointer shadow-2xs"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => triggerFileSelection(true)}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-2 bg-blue-50/80 hover:bg-blue-100 text-blue-900 border border-blue-200/70 rounded-xl text-xs font-black transition cursor-pointer active:scale-[0.98]"
                >
                  <Camera className="w-3.5 h-3.5 text-blue-800" />
                  <span>التقاط صورة</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerFileSelection(false)}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-black transition cursor-pointer active:scale-[0.98]"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  <span>رفع صورة</span>
                </button>
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageChange}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-100 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-black transition shadow-sm cursor-pointer active:scale-95"
            >
              {initialPayment ? 'حفظ التعديلات' : 'إضافة التحصيل'}
            </button>
          </div>
        </form>

        {/* Confirmation Modal */}
        {confirmData && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
            <div className="w-full max-w-sm bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xl text-right animate-scale-up space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-black text-slate-900">
                  {confirmData.type === 'edit' ? 'تأكيد تعديل التحصيل' : 'تأكيد إضافة التحصيل'}
                </h4>
              </div>

              <div className="text-xs text-slate-700 leading-relaxed space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-500">الوحدة:</span>
                  <span className="font-black text-slate-900">وحدة {residents.find(r => r.id === residentId)?.flatNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الساكن:</span>
                  <span className="font-black text-slate-900">{residents.find(r => r.id === residentId)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">المبلغ الإجمالي:</span>
                  <span className="font-black text-emerald-700">{Number(amount).toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الشهور المستهدفة:</span>
                  <span className="font-black text-blue-900">
                    {confirmData.multiplePayments ? `${confirmData.multiplePayments.length} شهور (${confirmData.multiplePayments.map(p => monthNamesArabic[parseInt(p.month, 10) - 1]).join('، ')})` : `${monthNamesArabic[parseInt(month, 10) - 1]} ${currentYear}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">حالة السداد:</span>
                  <span className={`font-black ${paymentStatus === 'collected' ? 'text-emerald-700' : paymentStatus === 'pending' ? 'text-amber-700' : 'text-rose-700'}`}>
                    {paymentStatus === 'collected' ? 'تم التحصيل (مسدد)' : paymentStatus === 'pending' ? 'لم يتم التحصيل (معلق)' : 'لاغي'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfirmData(null)}
                  className="flex-1 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={handleExecuteConfirm}
                  className="flex-1 py-2 text-xs font-black text-white bg-blue-900 hover:bg-blue-950 rounded-xl transition cursor-pointer shadow-xs active:scale-95"
                >
                  تأكيد وحفظ 💾
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
