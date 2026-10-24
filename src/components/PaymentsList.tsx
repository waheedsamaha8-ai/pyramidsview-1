import React, { useState, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Payment, Resident, UserRole, FloorConfig, AppConfig } from '../types';
import { Search, Plus, Calendar, FileText, Image as ImageIcon, Camera, Trash2, Edit, AlertCircle, Eye, User, LayoutGrid, List, Building, ArrowUpDown, Upload, X, ZoomIn, Download, RefreshCw, Share2, CheckCircle2, Receipt, Printer, Users, Sparkles, History } from 'lucide-react';
import { deriveFloorConfigsFromResidents, getUnitNumbersForFloor, compareFlatNumbers, isSameFlatNumber, getHistoricalOccupantForDate, formatResidentOptionLabel, getDefaultFeeForActivity } from '../utils/buildingStructure';
import { getResidentMonthlyFee, calculateResidentFinancials, calculateUnitClaimBreakdown, getPrescribedFeeForMonth, isPaymentForYearAndMonth, isMonthlySubscriptionType } from '../utils/financialCalculations';
import { generateElementImageBlob, GeneratedImageResult } from '../utils/imageExport';
import { shareImageViaWhatsApp } from '../utils/shareImageViaWhatsApp';
import { ShareReportModal } from './ShareReportModal';
import { ReceiptClaimModal, ReceiptClaimData } from './ReceiptClaimModal';
import { UnitHistoryModal } from './modals/UnitHistoryModal';
import { compressImageFile, compressBase64Image } from '../utils/imageCompressor';
import { getImageFromIndexedDB, saveImageToIndexedDB } from '../services/imageStorage';
import { printReportElement } from '../utils/printReport';

interface PaymentsListProps {
  payments: Payment[];
  residents: Resident[];
  paymentTypes: string[];
  role: UserRole;
  currentYear: number;
  currentMonth?: number;
  setCurrentMonth?: React.Dispatch<React.SetStateAction<number>>;
  floorConfigs?: FloorConfig[];
  config?: AppConfig;
  onAdd: (payment: Payment, base64Image?: string) => void;
  onEdit: (payment: Payment, base64Image?: string) => void;
  onDelete: (id: string) => void;
  onPreviewImage: (url: string) => void;
  onEditResident?: (resident: Resident) => void;
  onDistributePayment?: (originalPaymentId: string, distributedPayments: Payment[], deletedPaymentIds?: string[]) => void;
  onAddBatchPayments?: (payments: Payment[]) => void;
  onDeleteBatchPayments?: (ids: string[]) => void;
  onUpdateBatchPayments?: (payments: Payment[]) => void;
}

export const PaymentsList: React.FC<PaymentsListProps> = ({
  payments,
  residents,
  paymentTypes,
  role,
  currentYear,
  currentMonth,
  setCurrentMonth,
  floorConfigs,
  config,
  onAdd,
  onEdit,
  onDelete,
  onPreviewImage,
  onEditResident,
  onDistributePayment,
  onAddBatchPayments,
  onDeleteBatchPayments,
  onUpdateBatchPayments,
}) => {
  const [filterResident, setFilterResident] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterType, setFilterType] = useState('');
  const [onlyCurrentMonth, setOnlyCurrentMonth] = useState(true);
  const [distributionFilter, setDistributionFilter] = useState<'with_distributed' | 'without_distributed'>('with_distributed');

  const isDistributedChildPayment = (p: Payment): boolean => {
    if (p.distributionSourceId) return true;
    if (p.notes && (p.notes.includes('تم السداد في شهر') || p.notes.includes('القيمة الموزعة للشهر'))) {
      return true;
    }
    return false;
  };
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [receiptSort, setReceiptSort] = useState<'none' | 'desc' | 'asc'>('none');

  const actualCurrentMonth = currentMonth !== undefined 
    ? String(currentMonth + 1).padStart(2, '0') 
    : String(new Date().getMonth() + 1).padStart(2, '0');

  const toggleReceiptSort = () => {
    if (receiptSort === 'none') {
      setReceiptSort('desc');
    } else if (receiptSort === 'desc') {
      setReceiptSort('asc');
    } else {
      setReceiptSort('none');
    }
  };
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [historyModalResident, setHistoryModalResident] = useState<Resident | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [confirmData, setConfirmData] = useState<{
    type: 'add' | 'edit' | 'delete' | 'deleteMonthDues';
    paymentData?: Payment;
    multiplePayments?: Payment[];
    deletedPaymentIds?: string[];
    residentToUpdate?: Resident;
    base64Image?: string;
    deleteId?: string;
    deleteIds?: string[];
    monthName?: string;
    year?: number;
    count?: number;
  } | null>(null);

  // Form states
  const [residentId, setResidentId] = useState('');
  const [month, setMonth] = useState(actualCurrentMonth);
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const [excelPreviewPayments, setExcelPreviewPayments] = useState<Array<{
    flatNumber: string;
    amount: number;
    month: string;
    receiptNumber: string;
    paymentType: string;
    notes: string;
    residentId: string;
    residentName: string;
    isValid: boolean;
    errorMessage?: string;
  }> | null>(null);
  const [showExcelPreviewModal, setShowExcelPreviewModal] = useState(false);

  const monthNamesArabic = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  const handleExcelCollectionsFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        alert('ملف إكسل لا يحتوي على أوراق عمل.');
        return;
      }
      const worksheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

      if (rawRows.length === 0) {
        alert('ملف إكسل فارغ ولا يحتوي على بيانات.');
        return;
      }

      const arabicMonthMap: Record<string, string> = {
        'يناير': '01', 'فبراير': '02', 'مارس': '03', 'أبريل': '04', 'ابريل': '04',
        'مايو': '05', 'يونيو': '06', 'يوليو': '07', 'أغسطس': '08', 'اغسطس': '08',
        'سبتمبر': '09', 'أكتوبر': '10', 'اكتوبر': '10', 'نوفمبر': '11', 'ديسمبر': '12'
      };

      const findVal = (row: Record<string, any>, keywords: string[]) => {
        const keys = Object.keys(row);
        for (const kw of keywords) {
          const matchedKey = keys.find(k => String(k).trim().toLowerCase().includes(kw.toLowerCase()));
          if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null && String(row[matchedKey]).trim() !== '') {
            return String(row[matchedKey]).trim();
          }
        }
        return '';
      };

      const defaultType = (paymentTypes && paymentTypes.length > 0) ? paymentTypes[0] : 'اشتراك شهري';

      const parsedItems = rawRows.map((row, index) => {
        const rawFlat = findVal(row, ['وحدة', 'الوحدة', 'شقة', 'الشقة', 'flat', 'unit', 'رقم']);
        const rawAmount = findVal(row, ['مبلغ', 'المبلغ', 'قيمة', 'القيمة', 'amount', 'price', 'تحصيل']);
        const rawMonth = findVal(row, ['شهر', 'الشهر', 'تاريخ', 'month', 'date']);
        const rawReceipt = findVal(row, ['إيصال', 'ايصال', 'الإيصال', 'الايصال', 'receipt', 'rec']);
        const rawType = findVal(row, ['نوع', 'النوع', 'فئة', 'الفئة', 'type', 'cat']);
        const rawNotes = findVal(row, ['ملاحظات', 'الملاحظات', 'بيان', 'البيان', 'notes']);

        // Clean flat number
        let cleanFlat = rawFlat.replace(/[^0-9a-zA-Z\u0621-\u064A]/g, '').trim();
        if (!cleanFlat && rawFlat) cleanFlat = rawFlat.trim();

        const resident = residents.find(r => isSameFlatNumber(r.flatNumber, cleanFlat) || isSameFlatNumber(r.flatNumber, rawFlat));

        // Parse amount
        const numAmount = parseFloat(rawAmount.replace(/[^0-9.]/g, '')) || 0;

        // Parse month
        let parsedMonth = month || actualCurrentMonth;
        if (rawMonth) {
          const trimmedMonth = rawMonth.trim();
          if (arabicMonthMap[trimmedMonth]) {
            parsedMonth = arabicMonthMap[trimmedMonth];
          } else {
            const numM = parseInt(trimmedMonth.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(numM) && numM >= 1 && numM <= 12) {
              parsedMonth = String(numM).padStart(2, '0');
            }
          }
        }

        const itemType = rawType && paymentTypes.includes(rawType) ? rawType : defaultType;
        const isValid = Boolean(resident && numAmount > 0);
        let errorMessage = '';
        if (!resident) errorMessage = `الوحدة "${rawFlat || 'غير المحددة'}" غير موجودة بالسكان`;
        else if (numAmount <= 0) errorMessage = 'المبلغ يساوى 0 أو غير صحيح';

        return {
          flatNumber: String(resident ? resident.flatNumber : (cleanFlat || rawFlat || `سطر ${index + 1}`)),
          amount: numAmount,
          month: parsedMonth,
          receiptNumber: rawReceipt,
          paymentType: itemType,
          notes: rawNotes,
          residentId: resident ? resident.id : '',
          residentName: resident ? resident.name : 'غير معروف',
          isValid,
          errorMessage,
        };
      });

      setExcelPreviewPayments(parsedItems);
      setShowExcelPreviewModal(true);
    } catch (err) {
      console.error('Error reading Excel file:', err);
      alert('حدث خطأ أثناء قراءة ملف إكسل. يرجى التأكد من أن الملف بصيغة Excel صالحة.');
    } finally {
      if (excelFileInputRef.current) {
        excelFileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmExcelImport = () => {
    if (!excelPreviewPayments || excelPreviewPayments.length === 0) return;

    const validPayments = excelPreviewPayments.filter(p => p.isValid);
    if (validPayments.length === 0) {
      alert('لا توجد بيانات صالحة للاستيراد من هذا الملف.');
      return;
    }

    const newPayments: Payment[] = validPayments.map((item, idx) => ({
      id: `pay_excel_${Date.now()}__${idx}_${Math.random().toString(36).substring(2, 5)}`,
      year: currentYear,
      month: item.month,
      residentId: item.residentId,
      residentName: item.residentName,
      flatNumber: item.flatNumber,
      paymentType: item.paymentType,
      amount: item.amount,
      receiptNumber: item.receiptNumber,
      notes: item.notes || `استيراد من إكسل - شهر ${monthNamesArabic[parseInt(item.month, 10) - 1]} ${currentYear}`,
      date: new Date().toISOString().split('T')[0],
      isManuallyPaid: true,
      status: 'collected',
    }));

    try {
      localStorage.setItem('pyramids_last_excel_imported_payments', JSON.stringify(newPayments));
    } catch (e) {
      console.warn('LocalStorage backup error:', e);
    }

    if (onAddBatchPayments) {
      onAddBatchPayments(newPayments);
    } else {
      newPayments.forEach(p => onAdd(p));
    }

    setToastMsg(`تم استيراد ${newPayments.length} عملية تحصيل بنجاح من ملف إكسل ✨`);
    setShowExcelPreviewModal(false);
    setExcelPreviewPayments(null);
    setShowModal(false);
  };

  const handleRestoreExcelImport = () => {
    try {
      const raw = localStorage.getItem('pyramids_last_excel_imported_payments');
      if (!raw) {
        alert('لا توجد نسخة سابقة من تحصيلات الإكسل المحفوظة لاستعادتها.');
        return;
      }
      const restoredPayments: Payment[] = JSON.parse(raw);
      if (!Array.isArray(restoredPayments) || restoredPayments.length === 0) {
        alert('سجل تحصيلات الإكسل المحفوظ فارغ.');
        return;
      }

      if (onAddBatchPayments) {
        onAddBatchPayments(restoredPayments);
      } else {
        restoredPayments.forEach(p => onAdd(p));
      }

      setToastMsg(`تم بنجاح استعادة (${restoredPayments.length}) عملية تحصيل مستوردة من ملف الإكسل! 🎉`);
    } catch (err) {
      console.error('Error restoring Excel payments:', err);
      alert('حدث خطأ أثناء استعادة تحصيلات الإكسل.');
    }
  };

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [receiptModalData, setReceiptModalData] = useState<ReceiptClaimData | null>(null);
  const [shareReportModal, setShareReportModal] = useState<{
    isOpen: boolean;
    imageBlob: Blob | null;
    imageDataUrl: string | null;
    fileName: string;
    reportPeriodText: string;
    reportStatsText: string;
    initialResidentId?: string;
  }>({
    isOpen: false,
    imageBlob: null,
    imageDataUrl: null,
    fileName: '',
    reportPeriodText: '',
    reportStatsText: '',
    initialResidentId: '',
  });

  // State for bulk generating monthly dues for all units
  // State for bulk generating monthly dues for all units
  const [bulkGenerateModal, setBulkGenerateModal] = useState<{
    isOpen: boolean;
    monthStr: string;
    yearNum: number;
  } | null>(null);
  const [bulkModalActiveTab, setBulkModalActiveTab] = useState<'pending' | 'existing'>('pending');
  const [isUpdatingDues, setIsUpdatingDues] = useState(false);
  const [isDeletingDues, setIsDeletingDues] = useState(false);

  const bulkTargetMonthNum = bulkGenerateModal ? parseInt(bulkGenerateModal.monthStr, 10) : parseInt(actualCurrentMonth, 10);
  const bulkTargetYearNum = bulkGenerateModal ? bulkGenerateModal.yearNum : currentYear;

  // Helper to determine if a payment is an unmodified bulk-generated due
  const isUnmodifiedGeneratedDue = useCallback((p: Payment): boolean => {
    // 1. If marked as manually edited, it is protected
    if ((p as any).isManuallyEdited === true) return false;

    // 2. If marked isManuallyPaid, it is either manually created or was edited
    if (p.isManuallyPaid === true) return false;

    // 3. If it has a receipt number, it was collected or edited
    if (p.receiptNumber && p.receiptNumber.trim() !== '') return false;

    // 4. If status is collected / paid / partial, it is protected
    const st = (p.status || '').trim();
    if (st === 'collected' || st === 'مسدد' || st === 'paid' || st === 'جزئي' || st === 'cancelled' || st === 'لاغي') return false;

    // 5. If it has receipt image or is distributed, it is protected
    if (p.fileUrl || p.fileId || p.isDistributed || p.distributionSourceId) return false;

    // 6. Must be monthly subscription
    if (!isMonthlySubscriptionType(p.paymentType)) return false;

    // 7. Must have been automatically generated (isAutoGenerated flag, isManuallyPaid === false, or has generated notes)
    const hasGeneratedNotes = Boolean(p.notes && (p.notes.includes('استحقاق اشتراك شهر') || p.notes.includes('توليد تلقائي')));
    const isGenerated = (p as any).isAutoGenerated === true || p.isManuallyPaid === false || hasGeneratedNotes;

    return Boolean(isGenerated);
  }, []);

  // Existing monthly subscription payments recorded for this month & year
  const bulkExistingPayments = useMemo(() => {
    if (!bulkGenerateModal) return [];
    return payments.filter(p => {
      if (!isPaymentForYearAndMonth(p, bulkTargetYearNum, bulkTargetMonthNum)) return false;
      if (!isMonthlySubscriptionType(p.paymentType)) return false;
      if (p.status === 'cancelled' || p.status === 'لاغي' || (p as any).isDeleted) return false;
      return true;
    });
  }, [payments, bulkGenerateModal, bulkTargetYearNum, bulkTargetMonthNum]);

  // Dues that were generated automatically and have NOT been modified/collected (eligible for bulk update & delete actions)
  const bulkGeneratedModifiablePayments = useMemo(() => {
    return bulkExistingPayments.filter(p => isUnmodifiedGeneratedDue(p));
  }, [bulkExistingPayments, isUnmodifiedGeneratedDue]);

  // Existing payments with recalculated fee according to unit record and pricing period
  const bulkExistingWithRecalc = useMemo(() => {
    if (!bulkGenerateModal || bulkExistingPayments.length === 0) return [];
    const defaultFee = config?.defaultMonthlyFee || 400;
    const actFees = config?.activityDefaultFees;

    return bulkExistingPayments.map(p => {
      const resObj = residents.find(r => r.id === p.residentId || isSameFlatNumber(r.flatNumber, p.flatNumber));
      const prescribed = resObj ? getPrescribedFeeForMonth(
        resObj,
        bulkTargetYearNum,
        bulkTargetMonthNum,
        payments,
        defaultFee,
        actFees,
        config?.activityFeePeriods,
        config?.customUnitFeePeriods
      ) : { monthlyFee: p.amount };

      const historical = resObj ? getHistoricalOccupantForDate(resObj, `${bulkTargetYearNum}-${bulkGenerateModal.monthStr}`) : { ownerName: p.residentName, tenantName: undefined };

      return {
        payment: p,
        resident: resObj,
        prescribedFee: prescribed.monthlyFee,
        currentFee: p.amount,
        isDifferent: prescribed.monthlyFee !== p.amount,
        isModifiableGenerated: isUnmodifiedGeneratedDue(p),
        displayOwner: historical.ownerName || resObj?.name || p.residentName,
        displayTenant: historical.tenantName,
      };
    });
  }, [bulkGenerateModal, bulkExistingPayments, residents, config, bulkTargetYearNum, bulkTargetMonthNum, payments, isUnmodifiedGeneratedDue]);

  // Units that do not have monthly subscription payment for this month yet
  const bulkPendingItems = useMemo(() => {
    if (!bulkGenerateModal) return [];
    const defaultFee = config?.defaultMonthlyFee || 400;
    const actFees = config?.activityDefaultFees;
    const items: Payment[] = [];

    const sortedResidents = [...residents].sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));

    sortedResidents.forEach((r) => {
      const alreadyHas = bulkExistingPayments.some(p => 
        (p.residentId && p.residentId === r.id) || isSameFlatNumber(p.flatNumber, r.flatNumber)
      );
      if (!alreadyHas) {
        const prescribed = getPrescribedFeeForMonth(
          r,
          bulkTargetYearNum,
          bulkTargetMonthNum,
          [],
          defaultFee,
          actFees,
          config?.activityFeePeriods,
          config?.customUnitFeePeriods
        );
        const mName = monthNamesArabic[bulkTargetMonthNum - 1] || bulkGenerateModal.monthStr;
        items.push({
          id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${r.id}`,
          year: bulkTargetYearNum,
          month: bulkGenerateModal.monthStr,
          residentId: r.id,
          residentName: r.name,
          flatNumber: r.flatNumber,
          paymentType: 'اشتراك شهري',
          amount: prescribed.monthlyFee,
          expectedAmount: prescribed.monthlyFee,
          status: prescribed.monthlyFee === 0 ? 'معفي' : 'pending',
          isManuallyPaid: false,
          isAutoGenerated: true,
          isManuallyEdited: false,
          date: new Date().toISOString().split('T')[0],
          notes: `استحقاق اشتراك شهر ${mName} ${bulkTargetYearNum}`,
        });
      }
    });
    return items;
  }, [bulkGenerateModal, bulkExistingPayments, residents, config, bulkTargetYearNum, bulkTargetMonthNum]);

  const bulkTotalPendingDue = useMemo(() => {
    return bulkPendingItems.reduce((sum, p) => sum + p.amount, 0);
  }, [bulkPendingItems]);

  const bulkTotalExistingDue = useMemo(() => {
    return bulkExistingPayments.reduce((sum, p) => sum + p.amount, 0);
  }, [bulkExistingPayments]);

  const handleOpenGenerateMonthlyDuesModal = (customMonthStr?: string) => {
    const selectedMonth = customMonthStr || month || actualCurrentMonth;
    setBulkGenerateModal({
      isOpen: true,
      monthStr: selectedMonth,
      yearNum: currentYear,
    });
    setBulkModalActiveTab('pending');
  };

  const handleConfirmBulkGenerate = () => {
    if (!bulkGenerateModal || bulkPendingItems.length === 0) {
      setBulkGenerateModal(null);
      return;
    }

    // Safety check against the latest payments state to strictly prevent any duplicate payments
    const cleanItems = bulkPendingItems.filter(item => {
      const alreadyHas = payments.some(p => 
        isPaymentForYearAndMonth(p, bulkTargetYearNum, bulkTargetMonthNum) &&
        isMonthlySubscriptionType(p.paymentType) &&
        p.status !== 'cancelled' && p.status !== 'لاغي' && !(p as any).isDeleted &&
        ((p.residentId && p.residentId === item.residentId) || isSameFlatNumber(p.flatNumber, item.flatNumber))
      );
      return !alreadyHas;
    });

    if (cleanItems.length === 0) {
      setToastMsg('جميع الوحدات لديها دفعات اشتراك مسجلة بالفعل لهذا الشهر.');
      setBulkGenerateModal(null);
      return;
    }

    const items = cleanItems;
    const monthName = monthNamesArabic[bulkTargetMonthNum - 1];

    if (onAddBatchPayments) {
      onAddBatchPayments(items);
    } else {
      items.forEach(p => onAdd(p));
    }

    setToastMsg(`تم بنجاح توليد ${items.length} دفعات اشتراك شهري للوحدات المتبقية فقط لشهر ${monthName} ${bulkTargetYearNum} دون تكرار.`);
    setBulkGenerateModal(null);
  };

  // 1. Delete dues/payments for this month: strictly limited to unmodified bulk-generated dues!
  const handleDeleteExistingMonthDues = () => {
    if (!bulkGenerateModal || bulkGeneratedModifiablePayments.length === 0) {
      setToastMsg('لا توجد دفعات استحقاق مولدة غير معدلة لحذفها (الدفعات اليدوية أو المعدلة محمية تماماً).');
      return;
    }
    const monthName = monthNamesArabic[bulkTargetMonthNum - 1];
    setConfirmData({
      type: 'deleteMonthDues',
      deleteIds: bulkGeneratedModifiablePayments.map(p => String(p.id)),
      monthName,
      year: bulkTargetYearNum,
      count: bulkGeneratedModifiablePayments.length
    });
  };

  // 2. Update existing dues/payments for this month: strictly limited to unmodified bulk-generated dues!
  const handleUpdateExistingMonthDues = () => {
    if (!bulkGenerateModal || bulkGeneratedModifiablePayments.length === 0) {
      setToastMsg('لا توجد دفعات استحقاق مولدة غير معدلة لتحديثها (الدفعات اليدوية أو المعدلة محمية تماماً).');
      return;
    }
    setIsUpdatingDues(true);
    const defaultFee = config?.defaultMonthlyFee || 400;
    const actFees = config?.activityDefaultFees;

    const updatedPayments: Payment[] = [];
    let updatedCount = 0;

    bulkGeneratedModifiablePayments.forEach(p => {
      const resObj = residents.find(r => r.id === p.residentId || isSameFlatNumber(r.flatNumber, p.flatNumber));
      if (resObj) {
        const prescribed = getPrescribedFeeForMonth(
          resObj,
          bulkTargetYearNum,
          bulkTargetMonthNum,
          payments,
          defaultFee,
          actFees,
          config?.activityFeePeriods,
          config?.customUnitFeePeriods
        );

        const targetFee = prescribed.monthlyFee;
        const isUncollected = p.status === 'pending' || p.status === 'لم يتم التحصيل' || p.status === 'uncollected' || p.status === 'معلق';
        const newStatus = targetFee === 0 ? 'معفي' : (isUncollected ? 'pending' : (p.status || 'pending'));

        const historical = getHistoricalOccupantForDate(resObj, `${bulkTargetYearNum}-${bulkGenerateModal.monthStr}`);
        const updatedResidentName = historical.ownerName || resObj.name || p.residentName;

        updatedPayments.push({
          ...p,
          amount: targetFee,
          expectedAmount: targetFee,
          status: newStatus,
          residentName: updatedResidentName,
          isAutoGenerated: true,
          isManuallyPaid: false,
          isManuallyEdited: false,
        });
        updatedCount++;
      }
    });

    if (updatedPayments.length > 0) {
      if (onUpdateBatchPayments) {
        onUpdateBatchPayments(updatedPayments);
      } else {
        updatedPayments.forEach(p => onEdit(p));
      }
    }

    const monthName = monthNamesArabic[bulkTargetMonthNum - 1];
    setToastMsg(`تم بنجاح تحديث وتعديل مبالغ (${updatedCount}) دفعة استحقاق مولدة غير معدلة لشهر ${monthName} ${bulkTargetYearNum} وفقاً لسجل الوحدات وفترة التسعير (دون المساس بالدفعات اليدوية أو المعدلة).`);
    setIsUpdatingDues(false);
  };

  const isMasterDistributionPayment = (p: Payment): boolean => {
    if (isDistributedChildPayment(p)) return false;
    if (p.isDistributed) return true;
    if (Array.isArray(p.distributedPaymentIds) && p.distributedPaymentIds.length > 0) return true;
    if (payments.some(other => String(other.id) !== String(p.id) && String(other.distributionSourceId || '') === String(p.id))) return true;
    return false;
  };

  const isDistributedFromAnotherMonth = (p: Payment): boolean => {
    if (!isDistributedChildPayment(p)) return false;
    if (p.distributionSourceId) {
      const master = payments.find(m => String(m.id) === String(p.distributionSourceId));
      if (master) {
        const masterMonth = parseInt(String(master.month), 10);
        const childMonth = parseInt(String(p.month), 10);
        const masterYear = Number(master.year) || 0;
        const childYear = Number(p.year) || 0;
        if (masterMonth !== childMonth || masterYear !== childYear) {
          return true;
        }
      }
    }
    return false;
  };

  const getEffectiveDisplayAmount = (p: Payment): number => {
    if (distributionFilter === 'without_distributed') {
      if (p.isDistributed || (p as any).originalAmountBeforeDistribution) {
        return (p as any).originalAmountBeforeDistribution || p.amount;
      }
    }
    return p.amount;
  };

  const filteredPayments = payments
    .filter((p) => p.year === currentYear)
    .filter((p) => (filterResident ? p.residentId === filterResident : true))
    .filter((p) => {
      if (onlyCurrentMonth) {
        return parseInt(p.month, 10) === parseInt(actualCurrentMonth, 10);
      }
      return filterMonth ? parseInt(p.month, 10) === parseInt(filterMonth, 10) : true;
    })
    .filter((p) => (filterType ? p.paymentType === filterType : true))
    .filter((p) => {
      if (distributionFilter === 'without_distributed') {
        return !isDistributedFromAnotherMonth(p);
      }
      return true;
    });

  const currentMonthPayments = useMemo(() => {
    return payments
      .filter((p) => p.year === currentYear)
      .filter((p) => parseInt(p.month, 10) === parseInt(actualCurrentMonth, 10))
      .filter((p) => (filterResident ? p.residentId === filterResident : true))
      .filter((p) => (filterType ? p.paymentType === filterType : true))
      .filter((p) => {
        if (distributionFilter === 'without_distributed') {
          return !isDistributedFromAnotherMonth(p);
        }
        return true;
      })
      .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber) || a.id.localeCompare(b.id));
  }, [payments, currentYear, actualCurrentMonth, filterResident, filterType, distributionFilter]);

  const sortedFilteredPayments = useMemo(() => {
    if (receiptSort === 'none') {
      return filteredPayments;
    }

    return [...filteredPayments].sort((a, b) => {
      const numA = a.receiptNumber ? a.receiptNumber.trim() : '';
      const numB = b.receiptNumber ? b.receiptNumber.trim() : '';

      if (!numA && !numB) return 0;
      if (!numA) return 1;
      if (!numB) return -1;

      const isNumA = /^\d+$/.test(numA);
      const isNumB = /^\d+$/.test(numB);

      if (isNumA && isNumB) {
        const valA = parseInt(numA, 10);
        const valB = parseInt(numB, 10);
        return receiptSort === 'asc' ? valA - valB : valB - valA;
      }

      return receiptSort === 'asc' 
        ? numA.localeCompare(numB, 'ar-EG', { numeric: true })
        : numB.localeCompare(numA, 'ar-EG', { numeric: true });
    });
  }, [filteredPayments, receiptSort]);

  // Synchronized Monthly/Filtered Report Generation & Direct WhatsApp Share
  const handleGenerateMonthlyReportImage = async () => {
    setIsGeneratingImage(true);
    try {
      let periodLabel = '';
      if (onlyCurrentMonth) {
        periodLabel = `شهر_${monthNamesArabic[parseInt(actualCurrentMonth, 10) - 1]}_${currentYear}`;
      } else if (filterMonth) {
        periodLabel = `شهر_${monthNamesArabic[parseInt(filterMonth, 10) - 1]}_${currentYear}`;
      } else {
        periodLabel = `إجمالي_التحصيلات_${currentYear}`;
      }

      if (distributionFilter === 'without_distributed') {
        periodLabel += '_بدون_الموزعة';
      }

      const activeResidentObj = filterResident ? residents.find((r) => r.id === filterResident) : null;
      if (activeResidentObj) {
        periodLabel += `_وحدة_${activeResidentObj.flatNumber}`;
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `تقرير_تحصيلات_${periodLabel}_${dateStr}.png`;

      const result = await generateElementImageBlob('payments-monthly-printable-area', fileName);

      const isUncollectedPayment = (p: Payment) => 
        p.status === 'pending' || p.status === 'لم يتم التحصيل' || p.status === 'uncollected' || p.status === 'unpaid' || p.status === 'غير مسدد' || p.status === 'لم يسدد' || p.status === 'معلق';
      const isCancelledPayment = (p: Payment) => 
        p.status === 'cancelled' || p.status === 'لاغي' || p.status === 'VOID' || p.status === 'ملغي' || p.status === 'مرفوض';

      const validCollectedList = sortedFilteredPayments.filter(p => !isUncollectedPayment(p) && !isCancelledPayment(p));
      const totalAmt = validCollectedList.reduce((s, p) => s + getEffectiveDisplayAmount(p), 0);
      const count = validCollectedList.length;
      const distSuffix = distributionFilter === 'without_distributed' ? ' (بدون المبالغ الموزعة من شهور أخرى)' : '';
      const periodText = (onlyCurrentMonth
        ? `تحصيلات شهر ${monthNamesArabic[parseInt(actualCurrentMonth, 10) - 1]} ${currentYear}`
        : filterMonth
        ? `تحصيلات شهر ${monthNamesArabic[parseInt(filterMonth, 10) - 1]} ${currentYear}`
        : `إجمالي تحصيلات السنة المالية ${currentYear}`) + distSuffix;

      const statsText = `إجمالي المقبوض المستلم: ${totalAmt.toLocaleString()} ج.م | عدد العمليات المقبوضة: ${count}`;

      // If a specific unit/resident filter is active on screen, share directly to that unit's WhatsApp!
      if (activeResidentObj) {
        const targetPhone = activeResidentObj.phone || activeResidentObj.tenantPhone;
        const targetName = `( الوحدة ${activeResidentObj.flatNumber} - ${activeResidentObj.activityType || 'سكني'} ) - ${activeResidentObj.name}`;
        const shareText = `🏢 *اتحاد ملاك عمارة بيراميدز فيو ١*\n📊 *تقرير تحصيلات معتمد طبقاً للبيانات المعروضة*\n🚪 *الوحدة:* ${targetName}\n🗓 *الفترة:* ${periodText}\n💰 *${statsText}*\n-----------------------------------\nمرفق صورة تقرير التحصيلات المتزامنة تماماً مع بيانات الشاشة.\nاتحاد ملاك بيراميدز فيو ١`;

        await shareImageViaWhatsApp({
          imageBlob: result.blob,
          fileName,
          phone: targetPhone,
          recipientName: targetName,
          title: `تقرير تحصيلات ${targetName}`,
          text: shareText,
          onSuccessToast: (msg) => {
            setToastMsg(msg);
            setTimeout(() => setToastMsg(null), 8000);
          },
          onErrorToast: (err) => {
            alert(err);
          },
        });
      } else {
        // No specific unit filtered -> Open ShareReportModal allowing selection of any unit's WhatsApp or general share
        setShareReportModal({
          isOpen: true,
          imageBlob: result.blob,
          imageDataUrl: result.dataUrl,
          fileName,
          reportPeriodText: periodText,
          reportStatsText: statsText,
          initialResidentId: filterResident || '',
        });
      }
    } catch (e) {
      console.error('Image generation error:', e);
      alert('حدث خطأ أثناء توليد صورة تقرير التحصيل، يُرجى المحاولة مرة أخرى.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Print Collection Report Handler
  const handlePrintPaymentsReport = () => {
    printReportElement('payments-monthly-printable-area');
  };

  // Generate High-Resolution Single Payment Official Receipt Canvas
  const generateNativePaymentReceiptCanvas = (payment: Payment): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    const res = residents.find((r) => r.id === payment.residentId || r.flatNumber === payment.flatNumber);
    const dpr = 2;
    const width = 600;
    const height = 660;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.scale(dpr, dpr);

    // Canvas Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // Double Border
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#047857';
    ctx.strokeRect(12, 12, width - 24, height - 24);

    ctx.lineWidth = 1;
    ctx.strokeStyle = '#a7f3d0';
    ctx.strokeRect(16, 16, width - 32, height - 32);

    // Header Banner
    ctx.fillStyle = '#047857';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(24, 24, width - 48, 80, 12);
    else ctx.rect(24, 24, width - 48, 80);
    ctx.fill();

    // Header Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('اتحاد ملاك عمارة بيراميدز فيو ١', width - 45, 54);

    ctx.font = 'normal 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#d1fae5';
    ctx.fillText('💐 إيصال سداد واستلام مالي معتمد', width - 45, 80);

    // Receipt Badge
    const receiptNum = payment.receiptNumber ? `#${payment.receiptNumber}` : `REC-${payment.flatNumber}-${payment.month}${payment.year}`;
    ctx.fillStyle = '#065f46';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(40, 42, 160, 44, 8);
    else ctx.rect(40, 42, 160, 44);
    ctx.fill();

    ctx.fillStyle = '#a7f3d0';
    ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('رقم الإيصال الرسمي', 120, 58);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(receiptNum, 120, 77);

    // Details List
    let y = 135;
    const drawRow = (label: string, value: string, isHighlight: boolean = false, color: string = '#0f172a') => {
      ctx.fillStyle = isHighlight ? '#ecfdf5' : (y % 2 === 0 ? '#ffffff' : '#f8fafc');
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(30, y, width - 60, 42, 8);
      else ctx.rect(30, y, width - 60, 42);
      ctx.fill();

      ctx.lineWidth = 1;
      ctx.strokeStyle = isHighlight ? '#6ee7b7' : '#e2e8f0';
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(label, width - 50, y + 26);

      ctx.fillStyle = color;
      ctx.font = isHighlight ? 'bold 16px system-ui, -apple-system, sans-serif' : 'bold 13.5px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(value, 50, y + 26);

      y += 50;
    };

    const subPeriod = `${payment.year}-${String(payment.month).padStart(2, '0')}`;
    const historical = res ? getHistoricalOccupantForDate(res, subPeriod) : null;
    const activeOwnerName = historical?.ownerName || payment.residentName;
    const activeTenantName = historical?.tenantName !== undefined ? historical.tenantName : res?.tenantName;

    const resActivity = res?.activityType || 'سكني';
    drawRow('رقم الوحدة:', `( الوحدة ${payment.flatNumber} - ${resActivity} )`);
    drawRow('اسم المالك / الشاغل:', activeOwnerName);
    if (activeTenantName) {
      drawRow('المستأجر في هذه الفترة:', activeTenantName);
    }
    const monthName = monthNamesArabic[parseInt(payment.month, 10) - 1] || payment.month;
    drawRow('بيان الاشتراك المسدد:', `إيصال سداد شهر ${monthName} ${payment.year} - ${payment.paymentType || 'اشتراك شهري'}`);
    drawRow('فئة التحصيل:', payment.paymentType);
    drawRow('تاريخ السداد / التحصيل:', payment.date || `${payment.year}-${payment.month}`);
    drawRow('المبلغ المستلم والمسدد:', `${Math.round(payment.amount).toLocaleString()} جنيه مصري`, true, '#047857');
    if (payment.notes) {
      drawRow('ملاحظات إضافية:', payment.notes);
    }

    // Bottom Watermark
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('تم إصدار هذا الإيصال إلكترونياً وموثق بنظام إدارة اتحاد ملاك عمارة بيراميدز فيو ١', width / 2, y + 24);

    return canvas;
  };

  // Generate & Share Single Payment Receipt via Preview Modal & WhatsApp
  const handleGenerateSinglePaymentReceipt = (payment: Payment) => {
    const res = residents.find((r) => r.id === payment.residentId || isSameFlatNumber(r.flatNumber, payment.flatNumber));
    const accountingStartDate = config?.accountingStartDate || '2026-01-01';
    const defaultMonthlyFee = config?.defaultMonthlyFee || 400;
    const activityDefaultFees = config?.activityDefaultFees;

    const financials = res
      ? calculateResidentFinancials(
          res,
          payments,
          accountingStartDate,
          defaultMonthlyFee,
          activityDefaultFees,
          undefined,
          undefined,
          activityFeePeriods,
          config?.customUnitFeePeriods
        )
      : null;

    const carriedBalance = res?.initialBalance || 0;
    const oldDebtAmount = carriedBalance < 0 ? Math.abs(carriedBalance) : 0;
    const monthlyFee = financials ? financials.monthlyFee : (res?.monthlyFee || defaultMonthlyFee);
    const unpaidMonthsCount = financials ? financials.unpaidMonthsCount : 0;
    const unpaidMonthsDues = financials ? financials.unpaidMonthsDues : 0;
    const remainingBalance = financials ? financials.netBalance : 0;

    const isUncollected = payment.status === 'pending' || payment.status === 'لم يتم التحصيل';
    const isCancelled = payment.status === 'cancelled' || payment.status === 'لاغي';

    const claimBreakdown = calculateUnitClaimBreakdown(
      res,
      payments,
      payment.year,
      payment.month,
      accountingStartDate,
      monthlyFee,
      activityDefaultFees,
      payment
    );

    const subPeriod = `${payment.year}-${String(payment.month).padStart(2, '0')}`;
    const historical = res ? getHistoricalOccupantForDate(res, subPeriod) : null;

    setReceiptModalData({
      type: isUncollected ? 'claim' : 'receipt',
      unitNumber: payment.flatNumber,
      residentName: historical?.ownerName || payment.residentName,
      tenantName: historical?.tenantName !== undefined ? historical.tenantName : res?.tenantName,
      phone: historical?.ownerPhone || res?.phone,
      tenantPhone: historical?.tenantPhone || res?.tenantPhone,
      amount: isUncollected ? claimBreakdown.totalDueForPayment : payment.amount,
      month: payment.month,
      year: payment.year,
      date: payment.date,
      receiptNumber: isUncollected ? undefined : payment.receiptNumber,
      claimNumber: isUncollected ? (payment.receiptNumber || `CLM-${payment.flatNumber}-${payment.month}${payment.year}`) : undefined,
      paymentType: payment.paymentType,
      activityType: res?.activityType || 'سكني',
      occupancyType: res?.ownershipType || 'تمليك',
      monthlyFee: monthlyFee,
      carriedBalance: carriedBalance,
      oldDebtAmount: oldDebtAmount,
      unpaidMonthsCount: isUncollected ? claimBreakdown.monthlyDelayedMonthsCount : unpaidMonthsCount,
      unpaidMonthsDues: isUncollected ? claimBreakdown.monthlyDelayedAmount : unpaidMonthsDues,
      remainingBalance: remainingBalance,
      claimBreakdown: isUncollected ? claimBreakdown : undefined,
      notes: isCancelled ? `(إيصال لاغي) ${payment.notes || ''}` : isUncollected ? `(لم يتم التحصيل بعد) ${payment.notes || ''}` : payment.notes,
    });
  };

  const totalAmount = filteredPayments
    .filter(p => p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل')
    .reduce((sum, p) => sum + getEffectiveDisplayAmount(p), 0);

  const effectiveFloorConfigs = useMemo(() => {
    let base: FloorConfig[] = [];
    if (floorConfigs && floorConfigs.length > 0) {
      base = floorConfigs;
    } else if (residents && residents.length > 0) {
      base = deriveFloorConfigsFromResidents(residents);
    }
    // Strictly sort floors ascendingly by unit numbers (Ground -> 1st -> 2nd -> 3rd -> ...)
    return [...base].sort((a, b) => {
      const unitsA = getUnitNumbersForFloor(a, residents);
      const unitsB = getUnitNumbersForFloor(b, residents);
      const minA = unitsA.length > 0 ? unitsA[0] : a.startUnitNumber;
      const minB = unitsB.length > 0 ? unitsB[0] : b.startUnitNumber;
      return compareFlatNumbers(minA, minB);
    });
  }, [floorConfigs, residents]);

  const floorPaymentGroups = useMemo(() => {
    // Sort all payments strictly ascending by flat number, then by month
    const sortedFiltered = [...filteredPayments].sort((a, b) => {
      const flatCompare = compareFlatNumbers(a.flatNumber, b.flatNumber);
      if (flatCompare !== 0) return flatCompare;
      const monthA = parseInt(a.month, 10) || 0;
      const monthB = parseInt(b.month, 10) || 0;
      if (monthA !== monthB) return monthA - monthB;
      return a.id.localeCompare(b.id);
    });

    const assignedPaymentIds = new Set<string>();
    const groups: { floor: FloorConfig; payments: Payment[] }[] = [];

    effectiveFloorConfigs.forEach((floor) => {
      const unitNumbers = getUnitNumbersForFloor(floor, residents);
      const floorPayments = sortedFiltered
        .filter(p => unitNumbers.some(u => isSameFlatNumber(u, p.flatNumber)))
        .sort((a, b) => {
          const flatCompare = compareFlatNumbers(a.flatNumber, b.flatNumber);
          if (flatCompare !== 0) return flatCompare;
          const monthA = parseInt(a.month, 10) || 0;
          const monthB = parseInt(b.month, 10) || 0;
          return monthA - monthB;
        });
      floorPayments.forEach(p => assignedPaymentIds.add(p.id));
      if (floorPayments.length > 0) {
        groups.push({ floor, payments: floorPayments });
      }
    });

    const unassigned = sortedFiltered
      .filter(p => !assignedPaymentIds.has(p.id))
      .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
    if (unassigned.length > 0) {
      groups.push({
        floor: {
          id: 'unassigned_floor',
          type: 'typical',
          floorLabel: 'وحدات إضافية / أخرى',
          unitsCount: unassigned.length,
          activityType: 'عام',
        },
        payments: unassigned,
      });
    }

    return groups;
  }, [effectiveFloorConfigs, filteredPayments, residents]);

  const residentFloorGroups = useMemo(() => {
    const configs = effectiveFloorConfigs;
    const sortedConfigs = [...configs].sort((a, b) => {
      const startA = a.startUnitNumber ?? (a.unitNumbers?.[0] ?? 101);
      const startB = b.startUnitNumber ?? (b.unitNumbers?.[0] ?? 101);
      return compareFlatNumbers(startA, startB);
    });

    const assigned = new Set<string>();
    const groups: { floorLabel: string; residents: Resident[] }[] = [];

    sortedConfigs.forEach(cfg => {
      const units = getUnitNumbersForFloor(cfg, residents);
      const floorResidents = residents
        .filter(r => units.some(u => isSameFlatNumber(u, r.flatNumber)))
        .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));

      floorResidents.forEach(r => assigned.add(r.id));
      if (floorResidents.length > 0) {
        groups.push({
          floorLabel: cfg.floorLabel || 'دور العمارة',
          residents: floorResidents,
        });
      }
    });

    const remaining = residents
      .filter(r => !assigned.has(r.id))
      .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));

    if (remaining.length > 0) {
      groups.push({
        floorLabel: 'وحدات إضافية',
        residents: remaining,
      });
    }

    return groups;
  }, [effectiveFloorConfigs, residents]);

  const defaultMonthlyFee = config?.defaultMonthlyFee || 400;
  const activityDefaultFees = config?.activityDefaultFees;
  const activityFeePeriods = config?.activityFeePeriods;
  const customUnitFeePeriods = config?.customUnitFeePeriods;

  const allAvailableActivityTypes = useMemo(() => {
    const fromConfig = config?.activityTypes || [];
    const defaults = ['سكني', 'سكني مغلق', 'مفروش', 'إداري', 'تجاري', 'بدون تشطيب', 'بدون تحصيل'];
    return Array.from(new Set([...defaults, ...fromConfig]));
  }, [config?.activityTypes]);

  const getActivityDefaultFee = (act: string, targetDateOrPeriod?: string | number): number => {
    return getDefaultFeeForActivity(
      act,
      defaultMonthlyFee,
      activityDefaultFees,
      targetDateOrPeriod || `${currentYear}-${String(month).padStart(2, '0')}`,
      activityFeePeriods
    );
  };

  const handleResidentSelect = (newResidentId: string) => {
    setResidentId(newResidentId);
    const selectedRes = residents.find(r => r.id === newResidentId);
    if (selectedRes) {
      setTargetActivityType(selectedRes.activityType || 'سكني');
      const targetYearNum = Number(currentYear) || new Date().getFullYear();
      const targetMonthNum = parseInt(month, 10) || 1;
      const prescribed = getPrescribedFeeForMonth(selectedRes, targetYearNum, targetMonthNum, payments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
      const fee = prescribed.monthlyFee;
      // Due amount is strictly for the collection month
      setDueAmount(fee);
      if (!selectedPayment) {
        const totalMonthsCount = (isAggregatedCollection && coveredMonths.length > 0) ? coveredMonths.length : 1;
        setAmount(fee * totalMonthsCount);
      }
    }
  };

  const handleActivityTypeChange = (newAct: string) => {
    setTargetActivityType(newAct);
    const selectedRes = residents.find(r => r.id === residentId);
    if (selectedRes) {
      const targetYearNum = Number(currentYear) || new Date().getFullYear();
      const targetMonthNum = parseInt(month, 10) || 1;
      const prescribed = getPrescribedFeeForMonth(selectedRes, targetYearNum, targetMonthNum, payments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
      const fee = prescribed.monthlyFee;
      // Due amount is for the single collection month
      setDueAmount(fee);
      if (!selectedPayment) {
        const totalMonthsCount = (isAggregatedCollection && coveredMonths.length > 0) ? coveredMonths.length : 1;
        setAmount(fee * totalMonthsCount);
      }
    }
  };

  const applyDefaultFeeForActivity = (act: string) => {
    const selectedRes = residents.find(r => r.id === residentId);
    if (selectedRes) {
      const targetYearNum = Number(currentYear) || new Date().getFullYear();
      const targetMonthNum = parseInt(month, 10) || 1;
      const prescribed = getPrescribedFeeForMonth(selectedRes, targetYearNum, targetMonthNum, payments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
      const fee = prescribed.monthlyFee > 0 ? prescribed.monthlyFee : (getActivityDefaultFee(act, `${targetYearNum}-${targetMonthNum}`) || defaultMonthlyFee || 400);
      // Due amount is for the single collection month
      setDueAmount(fee);
      if (!selectedPayment) {
        const totalMonthsCount = (isAggregatedCollection && coveredMonths.length > 0) ? coveredMonths.length : 1;
        setAmount(fee * totalMonthsCount);
      }
    }
  };

  const toggleCoveredMonth = (m: string) => {
    const mNorm = String(parseInt(m, 10)).padStart(2, '0');
    let updated: string[];
    if (coveredMonths.some(x => String(parseInt(x, 10)).padStart(2, '0') === mNorm)) {
      updated = coveredMonths.filter(x => String(parseInt(x, 10)).padStart(2, '0') !== mNorm);
    } else {
      updated = [...coveredMonths, mNorm].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }
    setCoveredMonths(updated);

    // CRITICAL: Do NOT change dueAmount when selecting/toggling months!
    // dueAmount represents the single collection month fee and is only changed manually.
    const selectedRes = residents.find(r => r.id === residentId);
    if (selectedRes && (!paymentType || paymentType === 'اشتراك شهري' || paymentType.includes('اشتراك'))) {
      const targetYearNum = Number(currentYear) || new Date().getFullYear();
      const targetMonthNum = parseInt(month, 10) || 1;
      const prescribed = getPrescribedFeeForMonth(selectedRes, targetYearNum, targetMonthNum, payments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
      const baseFee = prescribed.monthlyFee > 0 ? prescribed.monthlyFee : (defaultMonthlyFee || 400);
      const totalMonthsCount = updated.length > 0 ? updated.length : 1;
      const calcAmt = baseFee * totalMonthsCount;
      if (!selectedPayment) {
        if (calcAmt > 0) setAmount(calcAmt);
      } else {
        if (amount === '' || Number(amount) <= 0) {
          if (calcAmt > 0) setAmount(calcAmt);
        }
      }
    }
  };

  const setQuickCoveredMonths = (monthsList: string[]) => {
    const uniqueSorted = Array.from(new Set(
      monthsList.map(m => String(parseInt(m, 10)).padStart(2, '0'))
    )).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    setCoveredMonths(uniqueSorted);

    // CRITICAL: Do NOT change dueAmount when selecting months count!
    const selectedRes = residents.find(r => r.id === residentId);
    if (selectedRes && (!paymentType || paymentType === 'اشتراك شهري' || paymentType.includes('اشتراك'))) {
      const targetYearNum = Number(currentYear) || new Date().getFullYear();
      const targetMonthNum = parseInt(month, 10) || 1;
      const prescribed = getPrescribedFeeForMonth(selectedRes, targetYearNum, targetMonthNum, payments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
      const baseFee = prescribed.monthlyFee > 0 ? prescribed.monthlyFee : (defaultMonthlyFee || 400);
      const totalMonthsCount = uniqueSorted.length > 0 ? uniqueSorted.length : 1;
      const calcAmt = baseFee * totalMonthsCount;
      if (!selectedPayment) {
        if (calcAmt > 0) setAmount(calcAmt);
      } else {
        if (amount === '' || Number(amount) <= 0) {
          if (calcAmt > 0) setAmount(calcAmt);
        }
      }
    }
  };

  const handleSelectSameMonthOnly = () => {
    const curMonthNorm = String(parseInt(month, 10)).padStart(2, '0');
    setQuickCoveredMonths([curMonthNorm]);
  };

  const handleSelectQuarter = () => {
    const curM = parseInt(month, 10);
    const targets: string[] = [];
    for (let i = 0; i < 3; i++) {
      let m = curM + i;
      if (m <= 12) targets.push(String(m));
    }
    setQuickCoveredMonths(targets);
  };

  const handleSelectHalfYear = () => {
    const curM = parseInt(month, 10);
    const targets: string[] = [];
    for (let i = 0; i < 6; i++) {
      let m = curM + i;
      if (m <= 12) targets.push(String(m));
    }
    setQuickCoveredMonths(targets);
  };

  const handleSelectRestOfYear = () => {
    const curM = parseInt(month, 10);
    const targets: string[] = [];
    for (let m = curM; m <= 12; m++) {
      targets.push(String(m));
    }
    setQuickCoveredMonths(targets);
  };

  const handleSelectAllYear = () => {
    const targets: string[] = [];
    for (let m = 1; m <= 12; m++) {
      targets.push(String(m));
    }
    setQuickCoveredMonths(targets);
  };

  const handlePaymentTypeSelect = (newType: string) => {
    setPaymentType(newType);
    if (!selectedPayment) {
      const selectedRes = residents.find(r => r.id === residentId);
      if (selectedRes) {
        if (newType === 'اشتراك شهري' || newType.includes('اشتراك') || newType.includes('شهري')) {
          const targetYearNum = Number(currentYear) || new Date().getFullYear();
          const targetMonthNum = parseInt(month, 10) || 1;
          const prescribed = getPrescribedFeeForMonth(selectedRes, targetYearNum, targetMonthNum, payments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
          const fee = prescribed.monthlyFee;
          // Due amount is strictly for the single collection month
          setDueAmount(fee);
          const totalMonthsCount = (isAggregatedCollection && coveredMonths.length > 0) ? coveredMonths.length : 1;
          setAmount(fee * totalMonthsCount);
        } else {
          // For "تحصيلات اخرى" and other non-subscription collection types
          if (dueAmount === '' || dueAmount === 0 || typeof dueAmount !== 'number') {
            const fallbackVal = (typeof amount === 'number' && amount > 0) ? amount : '';
            setDueAmount(fallbackVal);
          }
        }
      }
    }
  };

  const openAddModal = () => {
    setSelectedPayment(null);
    const sortedRes = [...residents].sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
    const firstRes = sortedRes[0] || residents[0];
    const initialResId = (filterResident && residents.some(r => r.id === filterResident)) 
      ? filterResident 
      : (firstRes?.id || '');
    const initialRes = residents.find(r => r.id === initialResId) || firstRes;
    const initialType = paymentTypes[0] || 'اشتراك شهري';

    const defaultTargetMonth = (filterMonth && filterMonth.trim()) 
      ? filterMonth 
      : actualCurrentMonth;

    const targetYearNum = Number(currentYear) || new Date().getFullYear();
    const targetMonthNum = parseInt(defaultTargetMonth, 10) || 1;
    const initialPrescribed = initialRes 
      ? getPrescribedFeeForMonth(initialRes, targetYearNum, targetMonthNum, payments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods)
      : null;
    const initialFee = initialPrescribed ? initialPrescribed.monthlyFee : 0;

    setResidentId(initialResId);
    setMonth(defaultTargetMonth);
    setIsAggregatedCollection(false);
    setCoveredMonths([defaultTargetMonth]);
    setShowMultiMonthPicker(false);
    setTargetActivityType(initialRes?.activityType || 'سكني');
    setPaymentType(initialType);
    setDueAmount(initialFee);
    setAmount(initialFee);
    setReceiptNumber('');
    setPaymentStatus('collected');
    setNotes('');
    setImageName('');
    setBase64Image('');
    setExistingFileUrl('');
    setError(null);
    setShowModal(true);
  };

  const openEditModal = (payment: Payment) => {
    try {
      setSelectedPayment(payment);

      const foundRes = residents.find(r => r.id === payment.residentId)
        || residents.find(r => isSameFlatNumber(r.flatNumber, payment.flatNumber));

      if (foundRes) {
        setResidentId(foundRes.id);
        setTargetActivityType(foundRes.activityType || 'سكني');
      } else {
        setResidentId(payment.residentId);
        setTargetActivityType('سكني');
      }

      // Find master payment if this was a child distributed payment
      const cleanPaymentId = String(payment.id);
      const sourceId = payment.distributionSourceId ? String(payment.distributionSourceId) : null;
      let masterPayment = sourceId 
        ? (payments.find(p => String(p.id) === sourceId) || payment)
        : payment;

      // If this payment has note saying "تم السداد في شهر X بإيصال رقم Y", find the master payment by receipt / resident / year
      if (masterPayment === payment && payment.notes?.includes('تم السداد في شهر')) {
        const matchingMaster = payments.find(p => 
          String(p.id) !== cleanPaymentId &&
          (isSameFlatNumber(p.flatNumber, payment.flatNumber) || p.residentId === payment.residentId) &&
          Number(p.year) === Number(payment.year) &&
          (p.isAggregatedCollection || p.isDistributed || (p.notes && p.notes.includes('سداد مجمع')) || (payment.receiptNumber && p.receiptNumber === payment.receiptNumber))
        );
        if (matchingMaster) {
          masterPayment = matchingMaster;
        }
      }

      const targetMasterId = String(masterPayment.id);
      const masterMonthNorm = String(parseInt(String(masterPayment.month || payment.month), 10)).padStart(2, '0');

      // Find all linked child payments for this aggregated collection
      const linkedChildren = payments.filter(p => {
        if (String(p.id) === targetMasterId) return false;
        if (String(p.distributionSourceId || '') === targetMasterId) return true;
        if (Array.isArray(masterPayment.distributedPaymentIds) && masterPayment.distributedPaymentIds.map(String).includes(String(p.id))) return true;
        if (
          masterPayment.receiptNumber && 
          masterPayment.receiptNumber.trim() && 
          p.receiptNumber && 
          p.receiptNumber.trim() === masterPayment.receiptNumber.trim() &&
          (isSameFlatNumber(p.flatNumber, masterPayment.flatNumber) || p.residentId === masterPayment.residentId) &&
          Number(p.year) === Number(masterPayment.year) &&
          (p.notes?.includes('تم السداد في شهر') || p.notes?.includes('سداد مجمع') || p.amount === 0)
        ) {
          return true;
        }
        return false;
      });

      // Collect all covered months involved in this collection (normalized to 2-digit format)
      const coveredSet = new Set<string>();
      linkedChildren.forEach(p => {
        const m = String(parseInt(String(p.month), 10)).padStart(2, '0');
        if (!isNaN(parseInt(m, 10))) {
          coveredSet.add(m);
        }
      });

      // Check notes for any mentioned months (e.g. "سداد مجمع عن شهور: أبريل، مايو، يونيو..." or "سداد عن شهر يناير")
      const combinedNotes = `${masterPayment.notes || ''} ${payment.notes || ''}`;
      if (combinedNotes.includes('سداد مجمع') || combinedNotes.includes('سداد عن شهر') || combinedNotes.includes('تم السداد في شهر')) {
        monthNamesArabic.forEach((mName, idx) => {
          if (combinedNotes.includes(mName)) {
            const mStr = String(idx + 1).padStart(2, '0');
            coveredSet.add(mStr);
          }
        });
      }

      const isSingleDifferent = combinedNotes.includes('سداد عن شهر') && !combinedNotes.includes('سداد مجمع عن شهور');
      const masterName = monthNamesArabic[parseInt(masterMonthNorm, 10) - 1];
      if (!isSingleDifferent && (combinedNotes.includes(masterName) || linkedChildren.length > 0)) {
        if (linkedChildren.length > 0 && !combinedNotes.includes('سداد عن شهر')) {
          coveredSet.add(masterMonthNorm);
        }
      }
      if (coveredSet.size === 0) {
        coveredSet.add(masterMonthNorm);
      }

      const recoveredCoveredMonths = Array.from(coveredSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

      const isAggregated = Boolean(
        payment.isAggregatedCollection || 
        masterPayment.isAggregatedCollection || 
        payment.isDistributed ||
        masterPayment.isDistributed ||
        (Array.isArray(masterPayment.distributedPaymentIds) && masterPayment.distributedPaymentIds.length > 0) ||
        sourceId ||
        linkedChildren.length > 0 ||
        (recoveredCoveredMonths.length === 1 && recoveredCoveredMonths[0] !== masterMonthNorm) ||
        recoveredCoveredMonths.length > 1 ||
        combinedNotes.includes('سداد مجمع') ||
        combinedNotes.includes('سداد عن شهر') ||
        combinedNotes.includes('تم السداد في شهر')
      );

      setIsAggregatedCollection(isAggregated);
      setCoveredMonths(recoveredCoveredMonths);
      setShowMultiMonthPicker(isAggregated);

      // Calculate total collection amount
      let initialTotalAmount: number | '' = payment.amount;
      if (isAggregated) {
        if (masterPayment.originalAmountBeforeDistribution && masterPayment.originalAmountBeforeDistribution > 0) {
          initialTotalAmount = masterPayment.originalAmountBeforeDistribution;
        } else if (linkedChildren.length > 0) {
          initialTotalAmount = (Number(masterPayment.amount) || 0) + linkedChildren.reduce((s, cp) => s + (Number(cp.amount) || 0), 0);
        } else {
          initialTotalAmount = masterPayment.amount;
        }
      }

      if (!initialTotalAmount || initialTotalAmount <= 0) {
        if (payment.originalAmountBeforeDistribution && payment.originalAmountBeforeDistribution > 0) {
          initialTotalAmount = payment.originalAmountBeforeDistribution;
        } else if (payment.amount && payment.amount > 0) {
          initialTotalAmount = payment.amount;
        } else if (linkedChildren.length > 0) {
          const sumL = (Number(masterPayment.amount) || 0) + linkedChildren.reduce((s, cp) => s + (Number(cp.amount) || 0), 0);
          if (sumL > 0) initialTotalAmount = sumL;
        }
      }

      // Set month to master payment's month (normalized)
      setMonth(masterMonthNorm);

      setPaymentType(payment.paymentType || masterPayment.paymentType || 'اشتراك شهري');

      const editYear = Number(payment.year) || currentYear;
      const editMonthNum = parseInt(String(payment.month || masterPayment.month), 10) || 1;
      const editPrescribed = foundRes
        ? getPrescribedFeeForMonth(foundRes, editYear, editMonthNum, payments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods)
        : null;
      const defaultCalculatedDue = editPrescribed ? editPrescribed.monthlyFee : '';

      if (!initialTotalAmount || initialTotalAmount <= 0) {
        const baseFee = defaultCalculatedDue || defaultMonthlyFee || 400;
        initialTotalAmount = baseFee * (recoveredCoveredMonths.length || 1);
      }
      setAmount(initialTotalAmount);
      let initialDueAmount: number | '' = (payment.expectedAmount !== undefined && payment.expectedAmount !== null)
        ? Number(payment.expectedAmount)
        : ((masterPayment.expectedAmount !== undefined && masterPayment.expectedAmount !== null) 
            ? Number(masterPayment.expectedAmount) 
            : (typeof defaultCalculatedDue === 'number' ? defaultCalculatedDue : ''));

      if (recoveredCoveredMonths.length > 1 && typeof defaultCalculatedDue === 'number' && defaultCalculatedDue > 0) {
        if (typeof initialDueAmount === 'number' && initialDueAmount >= defaultCalculatedDue * recoveredCoveredMonths.length) {
          initialDueAmount = defaultCalculatedDue;
        }
      }
      setDueAmount(initialDueAmount);

      setReceiptNumber(payment.receiptNumber || masterPayment.receiptNumber || '');
      setPaymentStatus(((payment.status || masterPayment.status) as any) || 'collected');
      setNotes(masterPayment.notes || payment.notes || '');

      const immediateUrl = payment.fileUrl || masterPayment.fileUrl || '';
      setImageName(immediateUrl || payment.fileId ? 'صورة إيصال مرفوعة مسبقاً' : '');
      setExistingFileUrl(immediateUrl);
      setBase64Image('');
      setError(null);
      setShowModal(true);

      // Asynchronously fetch image from IndexedDB in the background if not present on payment object
      if (!immediateUrl) {
        (async () => {
          try {
            const timeoutPromise = new Promise<null>(r => setTimeout(() => r(null), 1200));
            const dbUrl = await Promise.race([
              (async () => {
                const u1 = await getImageFromIndexedDB(String(payment.id));
                if (u1) return u1;
                const u2 = await getImageFromIndexedDB(`${payment.id}_fileUrl`);
                if (u2) return u2;
                return await getImageFromIndexedDB(`${payment.id}_receiptImage`);
              })(),
              timeoutPromise
            ]);
            if (dbUrl) {
              setExistingFileUrl(dbUrl);
              setImageName('صورة إيصال مرفوعة مسبقاً');
            }
          } catch (err) {
            console.warn('Background image lookup error:', err);
          }
        })();
      }
    } catch (err) {
      console.error('Error in openEditModal:', err);
      // Fallback: still show modal so user can always edit
      setSelectedPayment(payment);
      setResidentId(payment.residentId);
      setAmount(payment.amount);
      setMonth(payment.month);
      setPaymentType(payment.paymentType);
      setNotes(payment.notes || '');
      setError(null);
      setShowModal(true);
    }
  };

  const handleRemoveImage = () => {
    setImageName('');
    setBase64Image('');
    setExistingFileUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('يرجى اختيار ملف صورة صالح.');
      return;
    }

    setImageName(file.name);
    try {
      const dataUrl = await compressImageFile(file, { maxWidth: 550, maxHeight: 550, quality: 0.48 });
      setBase64Image(dataUrl);
    } catch {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const raw = reader.result as string;
          const compressed = await compressBase64Image(raw, { maxWidth: 550, maxHeight: 550, quality: 0.48 });
          setBase64Image(compressed);
        } catch {
          setBase64Image(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileSelection = (capture: boolean) => {
    if (fileInputRef.current) {
      // Reset input value to allow re-selection of the same file
      fileInputRef.current.value = '';
      if (capture) {
        fileInputRef.current.setAttribute('capture', 'environment');
      } else {
        fileInputRef.current.removeAttribute('capture');
      }
      fileInputRef.current.click();
    }
  };

  const handleApplyDistributionDirect = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setError(null);

    let effectiveAmount = Number(amount);
    if (isNaN(effectiveAmount) || effectiveAmount <= 0) {
      if (selectedPayment) {
        effectiveAmount = Number(selectedPayment.originalAmountBeforeDistribution) || Number(selectedPayment.amount) || 0;
        if (effectiveAmount <= 0) {
          const srcId = selectedPayment.distributionSourceId ? String(selectedPayment.distributionSourceId) : String(selectedPayment.id);
          const linked = payments.filter(p => String(p.id) !== srcId && (String(p.distributionSourceId || '') === srcId || (selectedPayment.distributedPaymentIds && selectedPayment.distributedPaymentIds.map(String).includes(String(p.id)))));
          const sumL = (Number(selectedPayment.amount) || 0) + linked.reduce((s, cp) => s + (Number(cp.amount) || 0), 0);
          if (sumL > 0) effectiveAmount = sumL;
        }
      }
      if (!effectiveAmount || effectiveAmount <= 0) {
        const targetMonthsCount = coveredMonths.length > 0 ? coveredMonths.length : 1;
        effectiveAmount = (Number(dueAmount) > 0 ? Number(dueAmount) : 0) || ((defaultMonthlyFee || 400) * targetMonthsCount);
      }
      if (effectiveAmount > 0) {
        setAmount(effectiveAmount);
      }
    }

    const effectiveResidentId = residentId || selectedPayment?.residentId || (selectedPayment ? residents.find(r => isSameFlatNumber(r.flatNumber, selectedPayment.flatNumber))?.id : '');
    const resident = residents.find((r) => r.id === effectiveResidentId)
      || (selectedPayment ? residents.find(r => isSameFlatNumber(r.flatNumber, selectedPayment.flatNumber)) : undefined);
    if (!resident) {
      setError('الساكن المختار غير موجود.');
      return;
    }

    if (!effectiveAmount || effectiveAmount <= 0) {
      setError('يرجى تحديد مبلغ صحيح للتوزيع.');
      return;
    }

    const targetType = paymentType || selectedPayment?.paymentType || 'اشتراك شهري';
    const masterMonthNorm = String(parseInt(month, 10)).padStart(2, '0');
    const targetCoveredMonths = coveredMonths.length > 0
      ? Array.from(new Set(coveredMonths.map(m => String(parseInt(m, 10)).padStart(2, '0')))).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      : [masterMonthNorm];

    const numDueAmount = (dueAmount !== '' && !isNaN(Number(dueAmount))) ? Number(dueAmount) : (effectiveAmount > 0 ? effectiveAmount : undefined);
    const primaryMonthName = monthNamesArabic[parseInt(masterMonthNorm, 10) - 1];

    const sourceId = selectedPayment?.distributionSourceId ? String(selectedPayment.distributionSourceId) : null;
    const masterPaymentId = sourceId || String(selectedPayment?.id || `pay_${Date.now()}`);

    const existingChildPayments = payments.filter(p => 
      String(p.id) !== masterPaymentId && (
        String(p.distributionSourceId || '') === masterPaymentId ||
        (selectedPayment?.distributedPaymentIds && selectedPayment.distributedPaymentIds.map(String).includes(String(p.id)))
      )
    );
    const existingChildIds = existingChildPayments.map(p => String(p.id));

    const masterMonth = targetCoveredMonths.includes(masterMonthNorm)
      ? masterMonthNorm
      : targetCoveredMonths[0];
    const otherMonths = targetCoveredMonths.filter(m => m !== masterMonth);
    const otherIds = otherMonths.map((m, idx) => {
      if (existingChildIds[idx]) return existingChildIds[idx];
      const existingInMonth = payments.find(p => {
        const isSameUnit = (p.residentId && p.residentId === resident.id) || isSameFlatNumber(p.flatNumber, resident.flatNumber);
        if (!isSameUnit) return false;
        if (!isPaymentForYearAndMonth(p, currentYear, parseInt(m, 10))) return false;
        if (p.status === 'cancelled' || p.status === 'لاغي') return false;
        if (String(p.id) === String(masterPaymentId)) return false;
        return isMonthlySubscriptionType(p.paymentType) || String(p.distributionSourceId || '') === String(masterPaymentId);
      });
      return existingInMonth ? String(existingInMonth.id) : `pay_${Date.now()}_${m}_${idx + 1}`;
    });
    const deletedPaymentIds = existingChildIds.filter(id => !otherIds.includes(id));

    const hist0 = getHistoricalOccupantForDate(resident, `${currentYear}-${masterMonth}`);
    const coveredNames = targetCoveredMonths
      .map(x => monthNamesArabic[parseInt(x, 10) - 1])
      .join('، ');

    const noteHeader = targetCoveredMonths.length === 1
      ? `سداد عن شهر ${coveredNames}${masterMonth !== masterMonthNorm ? ` (تم التحصيل في شهر ${primaryMonthName} ${currentYear})` : ''}`
      : `سداد مجمع عن شهور: ${coveredNames}${!targetCoveredMonths.includes(masterMonthNorm) ? ` (تم التحصيل في شهر ${primaryMonthName} ${currentYear})` : ''}`;

    const cleanNotes = (notes || '').trim()
      ? (notes.includes('سداد عن شهر') || notes.includes('سداد مجمع عن شهور') ? notes : `${notes} (${noteHeader})`)
      : noteHeader;

    const totalCoveredCount = targetCoveredMonths.length;
    const basePerMonth = Math.floor(effectiveAmount / totalCoveredCount);
    const remainder = effectiveAmount - (basePerMonth * totalCoveredCount);
    const masterAmountAllocated = otherMonths.length > 0 ? (basePerMonth + remainder) : effectiveAmount;

    const masterPaymentData: Payment = {
      id: masterPaymentId,
      year: currentYear,
      month: masterMonth,
      residentId: resident.id,
      residentName: hist0.occupantName || resident.name,
      flatNumber: resident.flatNumber,
      paymentType: targetType,
      amount: masterAmountAllocated,
      expectedAmount: numDueAmount,
      receiptNumber: (receiptNumber || '').trim(),
      notes: cleanNotes,
      fileId: base64Image ? '' : (existingFileUrl ? (selectedPayment?.fileId || '') : ''),
      fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
      date: selectedPayment ? selectedPayment.date : new Date().toISOString().split('T')[0],
      isManuallyPaid: true,
      isManuallyEdited: true,
      isAutoGenerated: false,
      status: paymentStatus,
      isAggregatedCollection: true,
      isDistributed: otherMonths.length > 0,
      distributedPaymentIds: otherMonths.length > 0 ? otherIds : undefined,
      distributionSourceId: undefined,
      originalAmountBeforeDistribution: effectiveAmount,
    };

    const childPayments: Payment[] = otherMonths.map((m, idx) => {
      const hist = getHistoricalOccupantForDate(resident, `${currentYear}-${m}`);
      const recNum = (receiptNumber || '').trim();
      const baseUserNotes = notes ? notes.replace(/\(سداد.*?\)/g, '').trim() : '';
      const noteText = `تم السداد في شهر ${primaryMonthName} ${currentYear} بإيصال رقم ${recNum || '—'} (القيمة الموزعة للشهر: ${basePerMonth.toLocaleString()} ج.م)${baseUserNotes ? ` (${baseUserNotes})` : ''}`;
      const childPrescribed = getPrescribedFeeForMonth(resident, Number(currentYear) || new Date().getFullYear(), parseInt(m, 10) || 1, payments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
      const childDue = (numDueAmount !== undefined && numDueAmount > 0) ? numDueAmount : childPrescribed.monthlyFee;
      return {
        id: otherIds[idx],
        year: currentYear,
        month: m,
        residentId: resident.id,
        residentName: hist.occupantName || resident.name,
        flatNumber: resident.flatNumber,
        paymentType: targetType,
        amount: basePerMonth,
        expectedAmount: childDue,
        receiptNumber: recNum,
        notes: noteText,
        fileId: base64Image ? '' : (existingFileUrl ? (selectedPayment?.fileId || '') : ''),
        fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
        date: selectedPayment ? selectedPayment.date : new Date().toISOString().split('T')[0],
        isManuallyPaid: true,
        isManuallyEdited: true,
        isAutoGenerated: false,
        status: paymentStatus,
        isAggregatedCollection: false,
        isDistributed: false,
        distributionSourceId: masterPaymentId,
        originalAmountBeforeDistribution: undefined,
      };
    });

    const allPaymentsToSave = [masterPaymentData, ...childPayments];

    if (onDistributePayment) {
      onDistributePayment(masterPaymentId, allPaymentsToSave, deletedPaymentIds.length > 0 ? deletedPaymentIds : undefined);
    } else {
      allPaymentsToSave.forEach(p => {
        if (payments.some(existing => String(existing.id) === String(p.id))) {
          onEdit(p, base64Image || undefined);
        } else {
          onAdd(p, base64Image || undefined);
        }
      });
      if (deletedPaymentIds.length > 0) {
        deletedPaymentIds.forEach(id => onDelete(id));
      }
    }

    if (targetActivityType && targetActivityType !== resident.activityType && onEditResident) {
      onEditResident({ ...resident, activityType: targetActivityType });
    }

    setShowModal(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      if (selectedPayment) {
        numAmount = Number(selectedPayment.originalAmountBeforeDistribution) || Number(selectedPayment.amount) || 0;
        if (numAmount <= 0) {
          const srcId = selectedPayment.distributionSourceId ? String(selectedPayment.distributionSourceId) : String(selectedPayment.id);
          const linked = payments.filter(p => String(p.id) !== srcId && (String(p.distributionSourceId || '') === srcId || (selectedPayment.distributedPaymentIds && selectedPayment.distributedPaymentIds.map(String).includes(String(p.id)))));
          const sumL = (Number(selectedPayment.amount) || 0) + linked.reduce((s, cp) => s + (Number(cp.amount) || 0), 0);
          if (sumL > 0) numAmount = sumL;
        }
      }
      if (!numAmount || numAmount <= 0) {
        const targetMonthsCount = (isAggregatedCollection && coveredMonths.length > 0) ? coveredMonths.length : 1;
        numAmount = (Number(dueAmount) > 0 ? Number(dueAmount) : 0) || ((defaultMonthlyFee || 400) * targetMonthsCount);
      }
      if (numAmount > 0) {
        setAmount(numAmount);
      }
    }

    const effectivePaymentType = paymentType || selectedPayment?.paymentType || 'اشتراك شهري';
    if (!paymentType && effectivePaymentType) {
      setPaymentType(effectivePaymentType);
    }

    const effectiveResidentId = residentId || selectedPayment?.residentId || (selectedPayment ? residents.find(r => isSameFlatNumber(r.flatNumber, selectedPayment.flatNumber))?.id : '');
    if (!residentId && effectiveResidentId) {
      setResidentId(effectiveResidentId);
    }

    const numDueAmount = (dueAmount !== '' && !isNaN(Number(dueAmount))) ? Number(dueAmount) : (numAmount > 0 ? numAmount : undefined);
    if (!effectiveResidentId || !effectivePaymentType || isNaN(numAmount) || numAmount <= 0) {
      setError('يرجى ملء جميع الحقول المطلوبة (الساكن، نوع التحصيل، مبلغ صحيح وموجب).');
      return;
    }

    if (numAmount > 10000000) {
      setError('المبلغ المدخل كبير جداً، يرجى التأكد من كتابة المبلغ الصحيح.');
      return;
    }

    const resident = residents.find((r) => r.id === effectiveResidentId)
      || (selectedPayment ? residents.find(r => isSameFlatNumber(r.flatNumber, selectedPayment.flatNumber)) : undefined);
    if (!resident) {
      setError('الساكن المختار غير موجود.');
      return;
    }

    const masterMonthNorm = String(parseInt(month, 10)).padStart(2, '0');
    const targetCoveredMonths = (isAggregatedCollection && coveredMonths.length > 0)
      ? Array.from(new Set(coveredMonths.map(m => String(parseInt(m, 10)).padStart(2, '0')))).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      : [masterMonthNorm];

    const isSameSingleMonth = targetCoveredMonths.length === 1 && targetCoveredMonths[0] === masterMonthNorm;

    const residentToUpdate = (targetActivityType && targetActivityType !== resident.activityType)
      ? { ...resident, activityType: targetActivityType }
      : undefined;

    const primaryMonthName = monthNamesArabic[parseInt(masterMonthNorm, 10) - 1];

    // If EDITING an existing payment
    if (selectedPayment) {
      const sourceId = selectedPayment.distributionSourceId ? String(selectedPayment.distributionSourceId) : null;
      const masterPaymentId = sourceId || String(selectedPayment.id);

      const existingChildPayments = payments.filter(p => 
        String(p.id) !== masterPaymentId && (
          String(p.distributionSourceId || '') === masterPaymentId ||
          (selectedPayment.distributedPaymentIds && selectedPayment.distributedPaymentIds.map(String).includes(String(p.id)))
        )
      );
      const existingChildIds = existingChildPayments.map(p => String(p.id));

      if (!isSameSingleMonth) {
        // Multi-month or different-month distribution on edit
        const masterMonth = targetCoveredMonths.includes(masterMonthNorm)
          ? masterMonthNorm
          : targetCoveredMonths[0];
        const otherMonths = targetCoveredMonths.filter(m => m !== masterMonth);
        const otherIds = otherMonths.map((m, idx) => {
          if (existingChildIds[idx]) return existingChildIds[idx];
          const existingInMonth = payments.find(p => {
            const isSameUnit = (p.residentId && p.residentId === residentId) || isSameFlatNumber(p.flatNumber, resident.flatNumber);
            if (!isSameUnit) return false;
            if (!isPaymentForYearAndMonth(p, currentYear, parseInt(m, 10))) return false;
            if (p.status === 'cancelled' || p.status === 'لاغي') return false;
            if (String(p.id) === String(masterPaymentId)) return false;
            return isMonthlySubscriptionType(p.paymentType) || String(p.distributionSourceId || '') === String(masterPaymentId);
          });
          return existingInMonth ? String(existingInMonth.id) : `pay_${Date.now()}_${m}_${idx + 1}`;
        });
        const deletedPaymentIds = existingChildIds.filter(id => !otherIds.includes(id));

        const hist0 = getHistoricalOccupantForDate(resident, `${currentYear}-${masterMonth}`);
        const coveredNames = targetCoveredMonths
          .map(x => monthNamesArabic[parseInt(x, 10) - 1])
          .join('، ');

        const isCollected = paymentStatus === 'collected';
        const noteHeader = targetCoveredMonths.length === 1
          ? `${isCollected ? 'سداد' : 'استحقاق'} عن شهر ${coveredNames}${masterMonth !== masterMonthNorm ? ` (${isCollected ? 'تم التحصيل' : 'تم التسجيل'} في شهر ${primaryMonthName} ${currentYear})` : ''}`
          : `${isCollected ? 'سداد' : 'استحقاق'} مجمع عن شهور: ${coveredNames}${!targetCoveredMonths.includes(masterMonthNorm) ? ` (${isCollected ? 'تم التحصيل' : 'تم التسجيل'} في شهر ${primaryMonthName} ${currentYear})` : ''}`;

        const cleanNotes = (notes || '').trim()
          ? (notes.includes('سداد عن شهر') || notes.includes('سداد مجمع عن شهور') || notes.includes('استحقاق عن شهر') || notes.includes('استحقاق مجمع عن شهور') ? notes : `${notes} (${noteHeader})`)
          : noteHeader;

        const totalCoveredCount = targetCoveredMonths.length;
        const basePerMonth = Math.floor(numAmount / totalCoveredCount);
        const remainder = numAmount - (basePerMonth * totalCoveredCount);
        const masterAmountAllocated = otherMonths.length > 0 ? (basePerMonth + remainder) : numAmount;

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
          receiptNumber: (receiptNumber || '').trim(),
          notes: cleanNotes,
          fileId: base64Image ? '' : (existingFileUrl ? (selectedPayment?.fileId || '') : ''),
          fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
          date: selectedPayment ? selectedPayment.date : new Date().toISOString().split('T')[0],
          isManuallyPaid: isCollected,
          isManuallyEdited: true,
          isAutoGenerated: false,
          status: paymentStatus,
          isAggregatedCollection: true,
          isDistributed: otherMonths.length > 0,
          distributedPaymentIds: otherMonths.length > 0 ? otherIds : undefined,
          distributionSourceId: undefined,
          originalAmountBeforeDistribution: numAmount,
        };

        const childPayments: Payment[] = otherMonths.map((m, idx) => {
          const hist = getHistoricalOccupantForDate(resident, `${currentYear}-${m}`);
          const recNum = (receiptNumber || '').trim();
          const baseUserNotes = notes ? notes.replace(/\(سداد.*?\)/g, '').replace(/\(استحقاق.*?\)/g, '').trim() : '';
          const noteText = `${isCollected ? 'تم السداد' : 'مستحق غير محصل مسجل'} في شهر ${primaryMonthName} ${currentYear} بإيصال رقم ${recNum || '—'} (القيمة الموزعة للشهر: ${basePerMonth.toLocaleString()} ج.م)${baseUserNotes ? ` (${baseUserNotes})` : ''}`;
          return {
            id: otherIds[idx],
            year: currentYear,
            month: m,
            residentId,
            residentName: hist.occupantName || resident.name,
            flatNumber: resident.flatNumber,
            paymentType,
            amount: basePerMonth,
            receiptNumber: recNum,
            notes: noteText,
            fileId: base64Image ? '' : (existingFileUrl ? (selectedPayment?.fileId || '') : ''),
            fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
            date: selectedPayment ? selectedPayment.date : new Date().toISOString().split('T')[0],
            isManuallyPaid: isCollected,
            isManuallyEdited: true,
            isAutoGenerated: false,
            status: paymentStatus,
            isAggregatedCollection: false,
            isDistributed: false,
            distributionSourceId: masterPaymentId,
            originalAmountBeforeDistribution: undefined,
          };
        });

        if (otherMonths.length > 0) {
          setConfirmData({
            type: 'edit',
            multiplePayments: [masterPaymentData, ...childPayments],
            deletedPaymentIds: deletedPaymentIds.length > 0 ? deletedPaymentIds : undefined,
            residentToUpdate,
            base64Image: base64Image || undefined
          });
        } else {
          setConfirmData({
            type: 'edit',
            paymentData: masterPaymentData,
            deletedPaymentIds: existingChildIds.length > 0 ? existingChildIds : undefined,
            residentToUpdate,
            base64Image: base64Image || undefined
          });
        }
      } else {
        // Single month collection in same month on edit
        const hist = getHistoricalOccupantForDate(resident, `${currentYear}-${masterMonthNorm}`);
        const isPreviouslyPurple = selectedPayment && (selectedPayment.status === 'pending' || selectedPayment.status === 'لم يتم التحصيل' || selectedPayment.isManuallyPaid === false || (selectedPayment.notes && (selectedPayment.notes.includes('استحقاق اشتراك') || selectedPayment.notes.includes('توليد تلقائي'))));
        const finalStatus = paymentStatus;
        const finalIsManuallyPaid = paymentStatus === 'collected';

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
          receiptNumber: (receiptNumber || '').trim(),
          notes: (notes || '').trim(),
          fileId: base64Image ? '' : (existingFileUrl ? (selectedPayment?.fileId || '') : ''),
          fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
          date: selectedPayment ? selectedPayment.date : new Date().toISOString().split('T')[0],
          isManuallyPaid: finalIsManuallyPaid,
          isManuallyEdited: true,
          isAutoGenerated: false,
          status: finalStatus,
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
      // Adding a NEW payment
      if (!isSameSingleMonth) {
        const masterMonth = targetCoveredMonths.includes(masterMonthNorm)
          ? masterMonthNorm
          : targetCoveredMonths[0];
        const otherMonths = targetCoveredMonths.filter(m => m !== masterMonth);
        const masterId = `pay_${Date.now()}_${masterMonth}_0`;
        const otherIds = otherMonths.map((m, idx) => {
          const existingInMonth = payments.find(p => {
            const isSameUnit = (p.residentId && p.residentId === residentId) || isSameFlatNumber(p.flatNumber, resident.flatNumber);
            if (!isSameUnit) return false;
            if (!isPaymentForYearAndMonth(p, currentYear, parseInt(m, 10))) return false;
            if (p.status === 'cancelled' || p.status === 'لاغي') return false;
            return isMonthlySubscriptionType(p.paymentType);
          });
          return existingInMonth ? String(existingInMonth.id) : `pay_${Date.now()}_${m}_${idx + 1}`;
        });

        const histMaster = getHistoricalOccupantForDate(resident, `${currentYear}-${masterMonth}`);
        const coveredNames = targetCoveredMonths
          .map(x => monthNamesArabic[parseInt(x, 10) - 1])
          .join('، ');

        const noteHeader = targetCoveredMonths.length === 1
          ? `سداد عن شهر ${coveredNames}${masterMonth !== masterMonthNorm ? ` (تم التحصيل في شهر ${primaryMonthName} ${currentYear})` : ''}`
          : `سداد مجمع عن شهور: ${coveredNames}${!targetCoveredMonths.includes(masterMonthNorm) ? ` (تم التحصيل في شهر ${primaryMonthName} ${currentYear})` : ''}`;

        const cleanNotes = (notes || '').trim()
          ? (notes.includes('سداد عن شهر') || notes.includes('سداد مجمع عن شهور') ? notes : `${notes} (${noteHeader})`)
          : noteHeader;

        const totalCoveredCount = targetCoveredMonths.length;
        const basePerMonth = Math.floor(numAmount / totalCoveredCount);
        const remainder = numAmount - (basePerMonth * totalCoveredCount);
        const masterAmountAllocated = otherMonths.length > 0 ? (basePerMonth + remainder) : numAmount;

        const masterPayment: Payment = {
          id: masterId,
          year: currentYear,
          month: masterMonth,
          residentId,
          residentName: histMaster.occupantName || resident.name,
          flatNumber: resident.flatNumber,
          paymentType,
          amount: masterAmountAllocated,
          expectedAmount: numDueAmount,
          receiptNumber: (receiptNumber || '').trim(),
          notes: cleanNotes,
          fileId: base64Image ? '' : (existingFileUrl ? (selectedPayment?.fileId || '') : ''),
          fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
          date: new Date().toISOString().split('T')[0],
          isManuallyPaid: true,
          status: paymentStatus,
          isAggregatedCollection: true,
          isDistributed: otherMonths.length > 0,
          distributedPaymentIds: otherMonths.length > 0 ? otherIds : undefined,
          distributionSourceId: undefined,
          originalAmountBeforeDistribution: numAmount,
        };

        const childPayments: Payment[] = otherMonths.map((m, idx) => {
          const hist = getHistoricalOccupantForDate(resident, `${currentYear}-${m}`);
          const recNum = (receiptNumber || '').trim();
          const baseUserNotes = notes ? notes.replace(/\(سداد.*?\)/g, '').trim() : '';
          const noteText = `تم السداد في شهر ${primaryMonthName} ${currentYear} بإيصال رقم ${recNum || '—'} (القيمة الموزعة للشهر: ${basePerMonth.toLocaleString()} ج.م)${baseUserNotes ? ` (${baseUserNotes})` : ''}`;
          const childPrescribed = getPrescribedFeeForMonth(resident, Number(currentYear) || new Date().getFullYear(), parseInt(m, 10) || 1, payments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
          const childDue = (numDueAmount !== undefined && numDueAmount > 0) ? numDueAmount : childPrescribed.monthlyFee;
          return {
            id: otherIds[idx],
            year: currentYear,
            month: m,
            residentId,
            residentName: hist.occupantName || resident.name,
            flatNumber: resident.flatNumber,
            paymentType,
            amount: basePerMonth,
            expectedAmount: childDue,
            receiptNumber: recNum,
            notes: noteText,
            fileId: base64Image ? '' : (existingFileUrl ? (selectedPayment?.fileId || '') : ''),
            fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
            date: new Date().toISOString().split('T')[0],
            isManuallyPaid: true,
            status: paymentStatus,
            isAggregatedCollection: false,
            isDistributed: false,
            distributionSourceId: masterId,
            originalAmountBeforeDistribution: undefined,
          };
        });

        if (otherMonths.length > 0) {
          setConfirmData({
            type: 'add',
            multiplePayments: [masterPayment, ...childPayments],
            residentToUpdate,
            base64Image: base64Image || undefined
          });
        } else {
          setConfirmData({
            type: 'add',
            paymentData: masterPayment,
            residentToUpdate,
            base64Image: base64Image || undefined
          });
        }
      } else {
        const hist = getHistoricalOccupantForDate(resident, `${currentYear}-${masterMonthNorm}`);
        const paymentData: Payment = {
          id: `pay_${Date.now()}`,
          year: currentYear,
          month: masterMonthNorm,
          residentId,
          residentName: hist.occupantName || resident.name,
          flatNumber: resident.flatNumber,
          paymentType,
          amount: numAmount,
          expectedAmount: numDueAmount,
          receiptNumber: (receiptNumber || '').trim(),
          notes: (notes || '').trim(),
          fileId: base64Image ? '' : (existingFileUrl ? (selectedPayment?.fileId || '') : ''),
          fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
          date: new Date().toISOString().split('T')[0],
          isManuallyPaid: true,
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

  const handleDelete = (id: string) => {
    setConfirmData({
      type: 'delete',
      deleteId: id
    });
  };

  const getPaymentStatusStyles = (p: Payment, isSelected: boolean) => {
    const isCancelled = 
      p.status === 'cancelled' || 
      p.status === 'لاغي' || 
      p.status === 'VOID' || 
      p.status === 'ملغي' || 
      p.status === 'مرفوض';

    const isExempt = 
      p.status === 'معفي' || 
      p.status === 'exempt' || 
      (p.amount === 0 && (
        p.notes?.includes('معفي') || 
        p.paymentType?.includes('معفي') || 
        p.status === 'pending' || 
        p.status === 'لم يتم التحصيل' ||
        p.status === 'uncollected'
      ));

    const isUncollected = !isCancelled && !isExempt && (
      p.status === 'pending' || 
      p.status === 'لم يتم التحصيل' || 
      p.status === 'uncollected' ||
      p.status === 'unpaid' ||
      p.status === 'غير مسدد' ||
      p.status === 'لم يسدد' ||
      p.status === 'معلق'
    );

    const isPaid = !isCancelled && !isExempt && !isUncollected;

    if (isSelected) {
      return {
        rowClass: 'bg-amber-100 hover:bg-amber-200/90 border-y-2 border-amber-400 font-semibold text-slate-900 shadow-2xs',
        stickyCellClass: 'bg-amber-100 text-amber-950 font-black border-l border-amber-300',
        unitBadgeClass: 'bg-amber-200 text-amber-950 border border-amber-400 font-black',
        amountClass: 'text-amber-900 font-black',
        cardClass: 'bg-amber-50 border-2 border-amber-400 shadow-md ring-2 ring-amber-400 text-slate-900',
        isPaid,
        isUncollected,
        isCancelled,
        isExempt,
        isDarkRed: false,
      };
    }

    if (isCancelled) {
      // لاغي: باللون الرمادي الغامق (بدلاً من الأحمر سابقاً)
      return {
        rowClass: 'bg-slate-400/80 hover:bg-slate-400 border-y border-slate-600 text-slate-950 font-bold',
        stickyCellClass: 'bg-slate-400/90 text-slate-950 group-hover:bg-slate-400 border-l border-slate-600',
        unitBadgeClass: 'bg-slate-500 text-white border border-slate-700 font-black',
        amountClass: 'line-through text-slate-950 font-black',
        cardClass: 'bg-slate-400/75 border-slate-600 hover:border-slate-700 text-slate-950 shadow-xs',
        isPaid,
        isUncollected,
        isCancelled,
        isExempt,
        isDarkRed: false,
      };
    }

    if (isExempt) {
      // معفي: باللون الرمادي المحايد
      return {
        rowClass: 'bg-slate-200/90 hover:bg-slate-200 border-y border-slate-300 text-slate-800 font-bold',
        stickyCellClass: 'bg-slate-200/95 text-slate-800 group-hover:bg-slate-200 border-l border-slate-300',
        unitBadgeClass: 'bg-slate-300 text-slate-800 border border-slate-400 font-black',
        amountClass: 'text-slate-800 font-black',
        cardClass: 'bg-slate-200/90 border-slate-300 hover:border-slate-400 text-slate-800 shadow-xs',
        isPaid,
        isUncollected,
        isCancelled,
        isExempt,
        isDarkRed: false,
      };
    }

    if (isUncollected) {
      const hasReceiptNumber = Boolean(p.receiptNumber && p.receiptNumber.trim() !== '');

      if (hasReceiptNumber) {
        // أي دفعة معلقة (لم يتم التحصيل) تم تعديلها بكتابة رقم إيصال: تكون باللون الأحمر الغامق المميز
        return {
          rowClass: 'bg-red-900 text-white hover:bg-red-950 border-y border-red-950 font-bold',
          stickyCellClass: 'bg-red-900 text-white group-hover:bg-red-950 border-l border-red-950',
          unitBadgeClass: 'bg-red-950 text-amber-300 border border-red-700 font-black',
          amountClass: 'text-amber-200 font-black',
          cardClass: 'bg-red-900 border-2 border-red-950 text-white shadow-sm',
          isPaid,
          isUncollected,
          isCancelled,
          isExempt,
          isDarkRed: true,
        };
      }

      // أي استحقاق أو تحصيل معلق آخر بدون رقم إيصال: باللون الأحمر (rose) مع الغاء اللون الأزرق تماماً
      return {
        rowClass: 'bg-rose-200/90 hover:bg-rose-300/90 border-y border-rose-400 text-rose-950 font-bold',
        stickyCellClass: 'bg-rose-200/95 text-rose-950 group-hover:bg-rose-300/90 border-l border-rose-400',
        unitBadgeClass: 'bg-rose-300 text-rose-950 border border-rose-500 font-black',
        amountClass: 'text-rose-900 font-black',
        cardClass: 'bg-rose-200/90 border-rose-400 hover:border-rose-500 text-rose-950 shadow-xs',
        isPaid,
        isUncollected,
        isCancelled,
        isExempt,
        isDarkRed: false,
      };
    }

    // مسددة: باللون الأخضر المشبع
    return {
      rowClass: 'bg-emerald-200/80 hover:bg-emerald-300/80 border-y border-emerald-400 text-emerald-950 font-bold',
      stickyCellClass: 'bg-emerald-200/90 text-emerald-950 group-hover:bg-emerald-300/90 border-l border-emerald-400',
      unitBadgeClass: 'bg-emerald-300 text-emerald-950 border border-emerald-500 font-black',
      amountClass: 'text-emerald-900 font-black',
      cardClass: 'bg-emerald-200/80 border-emerald-400 hover:border-emerald-500 text-emerald-950 shadow-xs',
      isPaid,
      isUncollected,
      isCancelled,
      isExempt,
      isDarkRed: false,
    };
  };

  const isReadOnly = role === 'RESIDENT';

  return (
    <div className="space-y-4 text-right">
      {/* Toast Feedback for WhatsApp Sharing */}
      {toastMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-start gap-2 animate-fade-in shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">{toastMsg}</div>
          <button 
            type="button"
            onClick={() => setToastMsg(null)} 
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="relative flex-1 md:flex-none">
            <select
              value={filterResident}
              onChange={(e) => setFilterResident(e.target.value)}
              className="w-full md:w-44 px-2.5 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/10 outline-none rtl:text-right cursor-pointer"
            >
              <option value="">كل السكان</option>
              {residentFloorGroups.map((group, idx) => (
                <optgroup key={idx} label={`📍 ${group.floorLabel}`}>
                  {group.residents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {formatResidentOptionLabel(r, 'latest')}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="relative flex-1 md:flex-none">
            <select
              value={onlyCurrentMonth ? actualCurrentMonth : filterMonth}
              onChange={(e) => {
                const val = e.target.value;
                setFilterMonth(val);
                setOnlyCurrentMonth(false);
                if (val && setCurrentMonth) {
                  const mIdx = parseInt(val, 10) - 1;
                  if (!isNaN(mIdx)) {
                    setCurrentMonth(mIdx);
                  }
                }
              }}
              className="w-full md:w-32 px-2.5 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/10 outline-none rtl:text-right cursor-pointer"
            >
              <option value="">كل الشهور</option>
              {monthNamesArabic.map((name, idx) => (
                <option key={idx} value={String(idx + 1).padStart(2, '0')}>
                  {name} {currentYear}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 md:flex-none">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full md:w-36 px-2.5 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/10 outline-none rtl:text-right cursor-pointer"
            >
              <option value="">كل أنواع التحصيل</option>
              {paymentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 md:flex-none">
            <select
              value={distributionFilter}
              onChange={(e) => setDistributionFilter(e.target.value as 'with_distributed' | 'without_distributed')}
              className={`w-full md:w-56 px-2.5 py-2 bg-white border rounded-xl text-xs font-bold outline-none rtl:text-right cursor-pointer transition ${
                distributionFilter === 'without_distributed'
                  ? 'border-amber-400 bg-amber-50/70 text-amber-950 font-black ring-2 ring-amber-400/20'
                  : 'border-slate-100 text-slate-700 focus:ring-2 focus:ring-blue-500/10'
              }`}
              title="فلترة المبالغ الموزعة من شهور أخرى"
            >
              <option value="with_distributed">بالمبالغ الموزعة (افتراضي)</option>
              <option value="without_distributed">بدون المبالغ الموزعة من شهور أخرى</option>
            </select>
          </div>



          {/* View switcher buttons */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'}`}
              title="عرض كروت"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'}`}
              title="عرض جدول"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Action Controls: Toggle current month, Generate Report Image, Print Report, Add Payment */}
        <div className={`grid ${isReadOnly ? 'grid-cols-3' : 'grid-cols-4'} gap-1 sm:gap-2 w-full lg:w-auto pt-2 border-t border-slate-100 lg:border-t-0 lg:pt-0`}>
          {/* Toggle Button for Current Month Only */}
          <button
            type="button"
            onClick={() => setOnlyCurrentMonth(!onlyCurrentMonth)}
            className={`w-full py-2 px-1 sm:px-2.5 rounded-xl text-[10px] sm:text-xs font-black transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs border text-center ${
              onlyCurrentMonth
                ? 'bg-blue-900 text-white border-blue-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="عند التفعيل يتم عرض تحصيل الشهر الحالي فقط، وعند الإلغاء يتم عرض تحصيل جميع الشهور"
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">الشهر الحالي</span>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                onlyCurrentMonth ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'
              }`}
            />
          </button>

          {/* Generate Collection Report Image & Direct WhatsApp Share Button */}
          <button
            type="button"
            onClick={handleGenerateMonthlyReportImage}
            disabled={isGeneratingImage}
            className="w-full py-2 px-1 sm:px-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white rounded-xl text-[10px] sm:text-xs font-black transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs disabled:opacity-50 text-center"
            title="توليد تقرير التحصيلات المتزامن تماماً مع البيانات المعروضة ومشاركته مباشرة عبر واتساب"
          >
            {isGeneratingImage ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-200 shrink-0" />
                <span className="truncate">جاري التوليد...</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
                <span className="truncate">توليد تقرير</span>
              </>
            )}
          </button>

          {/* Print Collection Report Button */}
          <button
            type="button"
            onClick={handlePrintPaymentsReport}
            className="w-full py-2 px-1 sm:px-2.5 bg-indigo-800 hover:bg-indigo-900 active:scale-95 text-white rounded-xl text-[10px] sm:text-xs font-black transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs text-center"
            title="طباعة تقرير التحصيلات المعتمد المعروض حالياً"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
            <span className="truncate">طباعة تقرير</span>
          </button>

          {!isReadOnly && (
            <button
              onClick={openAddModal}
              className="w-full py-2 px-1 sm:px-2.5 flex items-center justify-center gap-1 bg-blue-900 text-white rounded-xl font-bold text-[10px] sm:text-xs hover:bg-blue-950 active:scale-[0.98] transition shadow-xs cursor-pointer text-center"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">إضافة تحصيل</span>
            </button>
          )}
        </div>
      </div>

      {viewMode === 'table' ? (
        /* Table View */
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-extrabold text-[10px] sm:text-[10.5px] border-b border-slate-100">
                  <th className="w-12 sm:w-14 px-1 py-1.5 sticky right-0 bg-slate-50 shadow-xs z-10 border-l border-slate-100 text-center whitespace-nowrap">الوحدة</th>
                  <th className="min-w-[95px] max-w-[130px] px-1.5 py-1.5 whitespace-nowrap">الساكن</th>
                  <th className="w-16 sm:w-20 px-1 py-1.5 text-center whitespace-nowrap">المبلغ المستلم</th>
                  <th className="w-20 sm:w-22 px-1 py-1.5 text-center whitespace-nowrap">الفئة / الشهر</th>
                  <th 
                    onClick={toggleReceiptSort}
                    className="w-14 sm:w-16 px-1 py-1.5 cursor-pointer hover:bg-slate-100 transition select-none text-center whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1 justify-center">
                      <span>الإيصال</span>
                      <ArrowUpDown className={`w-3 h-3 ${receiptSort !== 'none' ? 'text-blue-900 font-bold' : 'text-slate-400'}`} />
                      {receiptSort !== 'none' && (
                        <span className="text-[8px] px-1 py-0.2 bg-blue-50 text-blue-700 rounded-md font-black">
                          {receiptSort === 'desc' ? 'تنازلي' : 'تصاعدي'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="min-w-[70px] max-w-[100px] px-1 py-1.5 whitespace-nowrap">الملاحظات</th>
                  {!isReadOnly && <th className="w-24 sm:w-28 px-1 py-1.5 text-center whitespace-nowrap">الإجراءات</th>}
                  <th className="w-20 sm:w-22 px-0.5 py-1 text-center whitespace-nowrap">الإيصال الصادر</th>
                </tr>
              </thead>
               <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={!isReadOnly ? 8 : 7} className="px-3 py-8 text-center text-slate-400 font-bold">
                      <div className="flex flex-col items-center gap-1.5">
                        <FileText className="w-7 h-7 stroke-[1.5]" />
                        <span>لا توجد عمليات تحصيل مسجلة تطابق هذه الشروط في {currentYear}</span>
                      </div>
                    </td>
                  </tr>
                ) : receiptSort !== 'none' ? (
                  /* Flat sorted list by receipt number */
                  sortedFilteredPayments.map((p) => {
                    const isSelected = selectedItemId === p.id;
                    const resObj = residents.find(r => r.id === p.residentId || isSameFlatNumber(r.flatNumber, p.flatNumber));
                    const historical = resObj ? getHistoricalOccupantForDate(resObj, `${p.year}-${p.month}`) : { ownerName: p.residentName, tenantName: undefined };
                    const ownerName = historical.ownerName || resObj?.name || p.residentName;
                    const tenantName = historical.tenantName !== undefined ? historical.tenantName : (resObj?.ownershipType === 'إيجار' ? resObj?.tenantName : '');
                    const hasTenant = Boolean(tenantName && tenantName.trim());

                    const { rowClass, stickyCellClass, unitBadgeClass, amountClass, isCancelled, isExempt, isUncollected, isDarkRed } = getPaymentStatusStyles(p, isSelected);

                    return (
                      <tr 
                        key={p.id} 
                        onClick={() => setSelectedItemId(isSelected ? null : p.id)}
                        className={`group transition cursor-pointer ${rowClass}`}
                      >
                        <td className={`w-12 sm:w-14 px-1 py-1.5 sticky right-0 z-5 shadow-xs transition text-center ${stickyCellClass}`}>
                          <span className={`px-1 py-0.5 rounded text-[9px] ${unitBadgeClass}`}>
                            وحدة {p.flatNumber}
                          </span>
                        </td>

                        {/* Resident: Owner & Tenant */}
                        <td className="min-w-[95px] max-w-[130px] px-1 py-1.5 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5 justify-center">
                            <div className="flex items-center gap-1">
                              <span className={`font-bold text-xs truncate max-w-[110px] ${isDarkRed ? 'text-amber-300 font-black' : 'text-slate-900'}`}>{ownerName}</span>
                              {hasTenant && (
                                <span className={`text-[8px] font-bold px-1 py-0.2 rounded ${isDarkRed ? 'text-white bg-red-950 border border-red-700 font-extrabold' : 'text-slate-500 bg-slate-100'}`}>مالك</span>
                              )}
                            </div>
                            {hasTenant && (
                              <div className={`flex items-center gap-1 font-black text-[9.5px] pt-0.5 border-t ${isDarkRed ? 'text-amber-200 border-red-800' : 'text-amber-950 border-slate-100'}`}>
                                <span className={`text-[7.5px] font-extrabold px-1 py-0.2 rounded border ${isDarkRed ? 'bg-amber-400 text-amber-950 border-amber-300 font-black' : 'bg-amber-100 text-amber-900 border-amber-200/80'}`}>مستأجر</span>
                                <span className="truncate max-w-[95px]">{tenantName}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="w-16 sm:w-20 px-1 py-1.5 whitespace-nowrap text-center">
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-black ${amountClass}`}>
                              {Math.round(getEffectiveDisplayAmount(p))} ج.م
                            </span>
                            {isExempt && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-slate-300 text-slate-800 border border-slate-400 rounded text-[8px] font-black w-fit mt-0.5">
                                ⚪ معفي
                              </span>
                            )}
                            {isUncollected && !isExempt && (
                              <span className={`inline-flex items-center gap-0.5 px-1 py-0.2 border rounded text-[8px] font-black w-fit mt-0.5 ${
                                isDarkRed ? 'bg-red-950 text-amber-300 border-red-700' : 'bg-orange-100 text-orange-900 border-orange-300'
                              }`}>
                                ⏳ معلق
                              </span>
                            )}
                            {isCancelled && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.2 bg-red-200 text-red-950 border border-red-400 rounded text-[8px] font-black w-fit mt-0.5">
                                🚫 لاغي
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Type & Month combined */}
                        <td className="w-20 sm:w-22 px-1 py-1.5 whitespace-nowrap text-center">
                          <div className="flex flex-col gap-0.5 items-center justify-center">
                            <span className={`px-1 py-0.2 rounded text-[9px] font-extrabold w-fit truncate max-w-[90px] ${
                              isDarkRed 
                                ? 'bg-red-950 text-amber-300 border border-red-700 font-black' 
                                : 'border border-slate-100 bg-slate-50 text-slate-700'
                            }`}>
                              {p.paymentType}
                            </span>
                            <span className={`text-[9.5px] font-bold ${isDarkRed ? 'text-red-100 font-extrabold' : 'text-slate-500'}`}>
                              {monthNamesArabic[parseInt(p.month, 10) - 1]} {p.year}
                            </span>
                          </div>
                        </td>

                        {/* Receipt Number */}
                        <td className={`w-14 sm:w-16 px-1 py-1.5 font-mono whitespace-nowrap text-center text-xs ${
                          isDarkRed ? 'text-amber-300 font-black' : 'text-slate-500 font-semibold'
                        }`}>{p.receiptNumber || '—'}</td>

                        {/* Notes */}
                        <td className={`min-w-[70px] max-w-[100px] px-1 py-1.5 text-[10.5px] truncate ${
                          isDarkRed ? 'text-red-100 font-bold' : 'text-slate-500 font-semibold'
                        }`} title={p.notes || ''}>
                          {p.notes || '—'}
                        </td>

                        {/* Actions */}
                        {!isReadOnly && (
                          <td className="w-24 sm:w-28 px-1 py-1.5 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditModal(p); }}
                                className={`p-1.5 border rounded-lg transition transform hover:scale-110 active:scale-95 cursor-pointer shadow-2xs ${
                                  isDarkRed 
                                    ? 'text-amber-300 hover:text-white hover:bg-red-800 border-red-700' 
                                    : 'text-slate-600 hover:text-blue-900 hover:bg-blue-50 border-slate-200/80'
                                }`}
                                title={role === 'ASSISTANT' ? 'تعديل الملاحظات' : 'تعديل'}
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              {role !== 'ASSISTANT' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                                  className={`p-1.5 border rounded-lg transition transform hover:scale-110 active:scale-95 cursor-pointer shadow-2xs ${
                                    isDarkRed 
                                      ? 'text-rose-300 hover:text-white hover:bg-rose-900 border-rose-800' 
                                      : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200'
                                  }`}
                                  title="حذف"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                              {role === 'ADMIN' && (resObj || residents.find(r => isSameFlatNumber(r.flatNumber, p.flatNumber))) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const targetRes = resObj || residents.find(r => isSameFlatNumber(r.flatNumber, p.flatNumber));
                                    if (targetRes) setHistoryModalResident(targetRes);
                                  }}
                                  className={`p-1.5 border rounded-lg transition transform hover:scale-110 active:scale-95 cursor-pointer shadow-2xs ${
                                    isDarkRed 
                                      ? 'text-amber-200 hover:text-white hover:bg-red-800 border-red-700' 
                                      : 'text-purple-700 hover:text-purple-900 hover:bg-purple-50 border-purple-200'
                                  }`}
                                  title="سجل الوحدة"
                                >
                                  <History className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Receipt Generation & Preview (Last Column) */}
                        <td className="w-20 sm:w-22 px-0.5 py-1 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleGenerateSinglePaymentReceipt(p); }}
                              className={`p-1 px-1.5 rounded-lg transition inline-flex items-center gap-0.5 text-[9px] cursor-pointer font-black border ${
                                isDarkRed
                                  ? 'text-amber-300 hover:bg-red-800 border-red-700 bg-red-950'
                                  : (p.status === 'pending' || p.status === 'لم يتم التحصيل'
                                      ? 'text-rose-800 hover:bg-rose-100 border-rose-300 bg-rose-50/90'
                                      : 'text-emerald-800 hover:bg-emerald-100 border-emerald-200 bg-emerald-50/70')
                              }`}
                              title={p.status === 'pending' || p.status === 'لم يتم التحصيل' ? 'توليد إشعار مطالبة شهرية ومشاركتها مباشرة لواتساب الوحدة' : 'توليد صورة إيصال سداد ومشاركتها مباشرة لواتساب الوحدة'}
                            >
                              <Share2 className={`w-3 h-3 ${isDarkRed ? 'text-amber-300' : (p.status === 'pending' || p.status === 'لم يتم التحصيل' ? 'text-rose-600' : 'text-emerald-600')}`} />
                              <span>{p.status === 'pending' || p.status === 'لم يتم التحصيل' ? 'مطالبة' : 'إيصال'}</span>
                            </button>
                            {p.fileUrl && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onPreviewImage(p.fileUrl!); }}
                                className={`p-1 px-1.5 rounded-lg transition inline-flex items-center gap-0.5 text-[9px] cursor-pointer font-bold border ${
                                  isDarkRed
                                    ? 'text-amber-200 hover:bg-red-800 border-red-700'
                                    : 'text-blue-600 hover:bg-blue-50 border-blue-100'
                                }`}
                                title="معاينة المرفق"
                              >
                                <Eye className="w-3 h-3" />
                                <span>مرفق</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  /* Grouped by Floor (Default) */
                  floorPaymentGroups.map((group) => (
                    <React.Fragment key={group.floor.id}>
                      {/* Floor Separator Row */}
                      <tr className="bg-slate-100/90 border-y border-slate-200">
                        <td colSpan={!isReadOnly ? 8 : 7} className="py-2 px-3 text-right border-r-4 border-r-blue-800 sticky right-0 z-5 bg-slate-100/95 shadow-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Building className="w-4 h-4 text-blue-900" />
                              <span className="text-xs sm:text-sm font-black text-slate-900">
                                {group.floor.floorLabel}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                                {group.payments.length} {group.payments.length === 1 ? 'دفعة' : 'دفعات'}
                              </span>
                            </div>
                            <span className="text-[10px] font-extrabold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shadow-2xs">
                              {group.floor.activityType || 'سكني'}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {group.payments.map((p) => {
                        const isSelected = selectedItemId === p.id;
                        const resObj = residents.find(r => r.id === p.residentId || isSameFlatNumber(r.flatNumber, p.flatNumber));
                        const historical = resObj ? getHistoricalOccupantForDate(resObj, `${p.year}-${p.month}`) : { ownerName: p.residentName, tenantName: undefined };
                        const ownerName = historical.ownerName || resObj?.name || p.residentName;
                        const tenantName = historical.tenantName !== undefined ? historical.tenantName : (resObj?.ownershipType === 'إيجار' ? resObj?.tenantName : '');
                        const hasTenant = Boolean(tenantName && tenantName.trim());

                        const { rowClass, stickyCellClass, unitBadgeClass, amountClass, isCancelled, isExempt, isUncollected, isDarkRed } = getPaymentStatusStyles(p, isSelected);

                        return (
                          <tr 
                            key={p.id} 
                            onClick={() => setSelectedItemId(isSelected ? null : p.id)}
                            className={`group transition cursor-pointer ${rowClass}`}
                          >
                            <td className={`w-12 sm:w-14 px-1 py-1.5 sticky right-0 z-5 shadow-xs transition text-center ${stickyCellClass}`}>
                              <span className={`px-1 py-0.5 rounded text-[9px] ${unitBadgeClass}`}>
                                وحدة {p.flatNumber}
                              </span>
                            </td>

                            {/* Resident: Owner & Tenant */}
                            <td className="min-w-[95px] max-w-[130px] px-1 py-1.5 whitespace-nowrap">
                              <div className="flex flex-col gap-0.5 justify-center">
                                <div className="flex items-center gap-1">
                                  <span className={`font-bold text-xs truncate max-w-[110px] ${isDarkRed ? 'text-amber-300 font-black' : 'text-slate-900'}`}>{ownerName}</span>
                                  {hasTenant && (
                                    <span className={`text-[8px] font-bold px-1 py-0.2 rounded ${isDarkRed ? 'text-white bg-red-950 border border-red-700 font-extrabold' : 'text-slate-500 bg-slate-100'}`}>مالك</span>
                                  )}
                                </div>
                                {hasTenant && (
                                  <div className={`flex items-center gap-1 font-black text-[9.5px] pt-0.5 border-t ${isDarkRed ? 'text-amber-200 border-red-800' : 'text-amber-950 border-slate-100'}`}>
                                    <span className={`text-[7.5px] font-extrabold px-1 py-0.2 rounded border ${isDarkRed ? 'bg-amber-400 text-amber-950 border-amber-300 font-black' : 'bg-amber-100 text-amber-900 border-amber-200/80'}`}>مستأجر</span>
                                    <span className="truncate max-w-[95px]">{tenantName}</span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Amount */}
                            <td className="w-16 sm:w-20 px-1 py-1.5 whitespace-nowrap text-center">
                              <div className="flex flex-col items-center">
                                <span className={`text-xs font-black ${amountClass}`}>
                                  {Math.round(getEffectiveDisplayAmount(p))} ج.م
                                </span>
                                {isExempt && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-slate-300 text-slate-800 border border-slate-400 rounded text-[8px] font-black w-fit mt-0.5">
                                    ⚪ معفي
                                  </span>
                                )}
                                {isUncollected && !isExempt && (
                                  <span className={`inline-flex items-center gap-0.5 px-1 py-0.2 border rounded text-[8px] font-black w-fit mt-0.5 ${
                                    isDarkRed ? 'bg-red-950 text-amber-300 border-red-700' : 'bg-orange-100 text-orange-900 border-orange-300'
                                  }`}>
                                    ⏳ معلق
                                  </span>
                                )}
                                {isCancelled && (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.2 bg-red-200 text-red-950 border border-red-400 rounded text-[8px] font-black w-fit mt-0.5">
                                    🚫 لاغي
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Type & Month combined */}
                            <td className="w-20 sm:w-22 px-1 py-1.5 whitespace-nowrap text-center">
                              <div className="flex flex-col gap-0.5 items-center justify-center">
                                <span className={`px-1 py-0.2 rounded text-[9px] font-extrabold w-fit truncate max-w-[90px] ${
                                  isDarkRed 
                                    ? 'bg-red-950 text-amber-300 border border-red-700 font-black' 
                                    : 'border border-slate-100 bg-slate-50 text-slate-700'
                                }`}>
                                  {p.paymentType}
                                </span>
                                {Boolean(p.isAggregatedCollection || p.isDistributed || p.distributionSourceId) && (
                                  <span className={`text-[7.5px] font-black px-1 py-0.2 rounded border leading-none ${
                                    isDarkRed 
                                      ? 'bg-red-950 text-emerald-300 border-emerald-500/80' 
                                      : 'text-emerald-800 bg-emerald-50 border-emerald-200/80'
                                  }`}>
                                    تحصيل مجمع
                                  </span>
                                )}
                                <span className={`text-[9.5px] font-bold ${isDarkRed ? 'text-red-100 font-extrabold' : 'text-slate-500'}`}>
                                  {monthNamesArabic[parseInt(p.month, 10) - 1]} {p.year}
                                </span>
                              </div>
                            </td>

                            {/* Receipt Number */}
                            <td className={`w-14 sm:w-16 px-1 py-1.5 font-mono whitespace-nowrap text-center text-xs ${
                              isDarkRed ? 'text-amber-300 font-black' : 'text-slate-500 font-semibold'
                            }`}>{p.receiptNumber || '—'}</td>

                            {/* Notes */}
                            <td className={`min-w-[70px] max-w-[100px] px-1 py-1.5 text-[10.5px] truncate ${
                              isDarkRed ? 'text-red-100 font-bold' : 'text-slate-500 font-semibold'
                            }`} title={p.notes || ''}>
                              {p.notes || '—'}
                            </td>

                            {/* Actions */}
                            {!isReadOnly && (
                              <td className="w-24 sm:w-28 px-1 py-1.5 whitespace-nowrap text-center">
                                <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEditModal(p); }}
                                    className={`p-1.5 border rounded-lg transition transform hover:scale-110 active:scale-95 cursor-pointer shadow-2xs ${
                                      isDarkRed 
                                        ? 'text-amber-300 hover:text-white hover:bg-red-800 border-red-700' 
                                        : 'text-slate-600 hover:text-blue-900 hover:bg-blue-50 border-slate-200/80'
                                    }`}
                                    title={role === 'ASSISTANT' ? 'تعديل الملاحظات' : 'تعديل'}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  {role !== 'ASSISTANT' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                                      className={`p-1.5 border rounded-lg transition transform hover:scale-110 active:scale-95 cursor-pointer shadow-2xs ${
                                        isDarkRed 
                                          ? 'text-rose-300 hover:text-white hover:bg-rose-900 border-rose-800' 
                                          : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200'
                                      }`}
                                      title="حذف"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                  {(resObj || residents.find(r => isSameFlatNumber(r.flatNumber, p.flatNumber))) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const targetRes = resObj || residents.find(r => isSameFlatNumber(r.flatNumber, p.flatNumber));
                                        if (targetRes) setHistoryModalResident(targetRes);
                                      }}
                                      className={`p-1.5 border rounded-lg transition transform hover:scale-110 active:scale-95 cursor-pointer shadow-2xs ${
                                        isDarkRed 
                                          ? 'text-amber-200 hover:text-white hover:bg-red-800 border-red-700' 
                                          : 'text-purple-700 hover:text-purple-900 hover:bg-purple-50 border-purple-200'
                                      }`}
                                      title="سجل الوحدة"
                                    >
                                      <History className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}

                            {/* Receipt Generation & Preview (Last Column) */}
                            <td className="w-20 sm:w-22 px-0.5 py-1 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1 flex-wrap">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleGenerateSinglePaymentReceipt(p); }}
                                  className={`p-1 px-1.5 rounded-lg transition inline-flex items-center gap-0.5 text-[9px] cursor-pointer font-black border ${
                                    isDarkRed
                                      ? 'text-amber-300 hover:bg-red-800 border-red-700 bg-red-950'
                                      : (p.status === 'pending' || p.status === 'لم يتم التحصيل'
                                          ? 'text-rose-800 hover:bg-rose-100 border-rose-300 bg-rose-50/90'
                                          : 'text-emerald-800 hover:bg-emerald-100 border-emerald-200 bg-emerald-50/70')
                                  }`}
                                  title={p.status === 'pending' || p.status === 'لم يتم التحصيل' ? 'توليد إشعار مطالبة شهرية ومشاركتها مباشرة لواتساب الوحدة' : 'توليد صورة إيصال سداد ومشاركتها مباشرة لواتساب الوحدة'}
                                >
                                  <Share2 className={`w-3 h-3 ${isDarkRed ? 'text-amber-300' : (p.status === 'pending' || p.status === 'لم يتم التحصيل' ? 'text-rose-600' : 'text-emerald-600')}`} />
                                  <span>{p.status === 'pending' || p.status === 'لم يتم التحصيل' ? 'مطالبة' : 'إيصال'}</span>
                                </button>
                                {p.fileUrl && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onPreviewImage(p.fileUrl!); }}
                                    className={`p-1 px-1.5 rounded-lg transition inline-flex items-center gap-0.5 text-[9px] cursor-pointer font-bold border ${
                                      isDarkRed
                                        ? 'text-amber-200 hover:bg-red-800 border-red-700'
                                        : 'text-blue-600 hover:bg-blue-50 border-blue-100'
                                    }`}
                                    title="معاينة المرفق"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>مرفق</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
                {filteredPayments.length > 0 && (
                  <tr className="bg-emerald-50/90 border-t-2 border-emerald-300 font-extrabold text-slate-900 text-xs">
                    <td className="px-1.5 py-2 text-right font-black text-emerald-950 sticky right-0 z-5 bg-emerald-50 shadow-xs border-l border-slate-100 whitespace-nowrap">
                      الإجمالي
                    </td>
                    <td className="px-1.5 py-2 text-slate-700 font-black whitespace-nowrap">
                      ({filteredPayments.length} عملية)
                    </td>
                    <td className="px-1.5 py-2 text-emerald-700 text-xs sm:text-sm font-black whitespace-nowrap bg-emerald-100/70 border-x border-emerald-200" dir="ltr">
                      {Math.round(totalAmount).toLocaleString()} ج.م
                    </td>
                    <td className="px-1 py-2 text-center text-slate-400 font-bold whitespace-nowrap">—</td>
                    <td className="px-1 py-2 text-center text-slate-400 font-bold whitespace-nowrap">—</td>
                    <td className="px-1 py-2 text-center text-slate-400 font-bold whitespace-nowrap">—</td>
                    {!isReadOnly && (
                      <td className="px-0.5 py-2 text-center text-slate-400 font-bold whitespace-nowrap">—</td>
                    )}
                    <td className="px-0.5 py-2 text-center text-slate-400 font-bold whitespace-nowrap">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Cards View */
        <div className="space-y-6">
          {filteredPayments.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-2xl py-10 flex flex-col items-center justify-center text-slate-400 gap-2">
              <FileText className="w-8 h-8 stroke-[1.5]" />
              <p className="text-xs font-bold">لا توجد عمليات تحصيل مسجلة تطابق هذه الشروط في {currentYear}</p>
            </div>
          ) : (
            floorPaymentGroups.map((group) => (
              <div key={group.floor.id} className="space-y-3 pt-2">
                {/* Floor Divider Banner */}
                <div className="flex items-center justify-between bg-slate-100/85 px-4 py-2.5 rounded-2xl border border-slate-200 border-r-4 border-r-blue-800 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-blue-900" />
                    <span className="text-xs font-black text-slate-900">
                      {group.floor.floorLabel}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                      {group.payments.length} {group.payments.length === 1 ? 'دفعة' : 'دفعات'}
                    </span>
                  </div>
                  <span className="text-[10px] font-extrabold text-blue-900 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-100 shadow-2xs">
                    {group.floor.activityType || 'سكني'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.payments.map((p) => {
                    const isSelected = selectedItemId === p.id;
                    const resObj = residents.find(r => r.id === p.residentId || isSameFlatNumber(r.flatNumber, p.flatNumber));
                    const historical = resObj ? getHistoricalOccupantForDate(resObj, p.date || `${p.year}-${p.month}`) : { ownerName: p.residentName, tenantName: undefined };
                    const ownerName = historical.ownerName || resObj?.name || p.residentName;
                    const tenantName = historical.tenantName !== undefined ? historical.tenantName : (resObj?.ownershipType === 'إيجار' ? resObj?.tenantName : '');
                    const hasTenant = Boolean(tenantName && tenantName.trim());

                    const { cardClass, amountClass, unitBadgeClass, isCancelled, isExempt, isUncollected, isDarkRed } = getPaymentStatusStyles(p, isSelected);

                    return (
                      <div 
                        key={p.id} 
                        onClick={() => setSelectedItemId(isSelected ? null : p.id)}
                        className={`rounded-2xl px-3.5 py-2.5 border shadow-sm flex flex-col justify-between transition duration-200 cursor-pointer ${cardClass}`}
                      >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${unitBadgeClass}`}>
                            وحدة {p.flatNumber}
                          </span>
                          <div className="flex items-center gap-1">
                            {Boolean(p.isAggregatedCollection || p.isDistributed || p.distributionSourceId) && (
                              <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black border ${
                                isDarkRed 
                                  ? 'bg-red-950 text-emerald-300 border-emerald-500/80' 
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}>
                                تحصيل مجمع
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                              isDarkRed 
                                ? 'bg-red-950 text-amber-300 border-red-700 font-black' 
                                : 'bg-slate-50 text-slate-600 border-slate-100'
                            }`}>
                              {p.paymentType}
                            </span>
                          </div>
                        </div>
                        
                        <div className="mb-1.5">
                          <h4 className={`text-xs font-black ${isDarkRed ? 'text-amber-300' : 'text-slate-900'}`}>{ownerName}</h4>
                          {hasTenant && (
                            <div className={`text-[10px] font-extrabold flex items-center gap-1 mt-0.5 ${isDarkRed ? 'text-amber-200' : 'text-amber-900'}`}>
                              <span className={`text-[8.5px] px-1 py-0.2 rounded font-black ${isDarkRed ? 'bg-amber-400 text-amber-950' : 'bg-amber-100 text-amber-900'}`}>مستأجر</span>
                              <span>{tenantName}</span>
                            </div>
                          )}
                        </div>

                        <div className={`text-[11px] font-bold mb-2 ${isDarkRed ? 'text-red-100 font-extrabold' : 'text-slate-500'}`}>
                          شهر: {monthNamesArabic[parseInt(p.month, 10) - 1]} {p.year}
                        </div>
                        
                        <div className={`flex items-center justify-between border-t pt-2 mb-2 ${isDarkRed ? 'border-red-800' : 'border-slate-100/80'}`}>
                          <span className={`text-[11px] font-bold ${isDarkRed ? 'text-red-200 font-black' : 'text-slate-400'}`}>المبلغ المستلم</span>
                          <div className="text-left">
                            <span className={`text-sm font-black ${amountClass}`}>
                              {Math.round(getEffectiveDisplayAmount(p))} ج.م
                            </span>
                            {isExempt && (
                              <span className="block text-[9.5px] font-black text-slate-800 bg-slate-300 border border-slate-400 px-1.5 py-0.5 rounded mt-0.5">
                                ⚪ معفي
                              </span>
                            )}
                            {isUncollected && !isExempt && (
                              <span className={`block text-[9.5px] font-black border px-1.5 py-0.5 rounded mt-0.5 ${
                                isDarkRed ? 'text-amber-300 bg-red-950 border-red-700' : 'text-orange-950 bg-orange-100 border-orange-300'
                              }`}>
                                ⏳ لم يتم التحصيل
                              </span>
                            )}
                            {isCancelled && (
                              <span className="block text-[9.5px] font-black text-red-950 bg-red-200 border border-red-400 px-1.5 py-0.5 rounded mt-0.5">
                                🚫 إيصال لاغي
                              </span>
                            )}
                          </div>
                        </div>

                        {p.receiptNumber && (
                          <div className={`text-[10px] font-semibold mb-1 ${isDarkRed ? 'text-red-200' : 'text-slate-400'}`}>
                            رقم الإيصال: <span className={`font-mono ${isDarkRed ? 'text-amber-300 font-black' : 'text-slate-600'}`}>{p.receiptNumber}</span>
                          </div>
                        )}
                        
                        {p.fileUrl && (
                          <div 
                            onClick={(e) => { e.stopPropagation(); onPreviewImage(p.fileUrl!); }}
                            className="flex items-center gap-2.5 p-2 bg-blue-50/60 hover:bg-blue-100/60 border border-blue-100 rounded-xl mb-2 cursor-pointer group/img transition shadow-2xs"
                            title="اضغط لمعاينة الإيصال بالحجم الكامل"
                          >
                            <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-blue-200 shrink-0 bg-slate-200">
                              <img src={p.fileUrl} alt="إيصال" className="w-full h-full object-cover group-hover/img:scale-110 transition duration-200" />
                              <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center text-white">
                                <Eye className="w-3.5 h-3.5" />
                              </div>
                            </div>
                            <div className="text-right flex-1 min-w-0">
                              <span className="text-[10.5px] font-black text-blue-900 block truncate">إيصال تحصيل مرفق</span>
                              <span className="text-[9.5px] text-blue-700 font-extrabold flex items-center gap-1">
                                <Eye className="w-3 h-3 text-blue-600" />
                                <span>اضغط للاطلاع على التفاصيل</span>
                              </span>
                            </div>
                          </div>
                        )}

                        {p.notes && (
                          <p className="text-[10px] text-slate-500 font-bold bg-slate-50 p-2 rounded border border-slate-100 mb-2">{p.notes}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 border-t border-slate-50 pt-3 mt-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleGenerateSinglePaymentReceipt(p); }}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-[10px] font-black transition cursor-pointer ${
                            p.status === 'pending' || p.status === 'لم يتم التحصيل'
                              ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          }`}
                          title={p.status === 'pending' || p.status === 'لم يتم التحصيل' ? 'توليد إشعار مطالبة شهرية ومشاركتها مباشرة لواتساب الوحدة' : 'توليد صورة إيصال سداد ومشاركتها مباشرة لواتساب الوحدة'}
                        >
                          <Share2 className={`w-3.5 h-3.5 shrink-0 ${p.status === 'pending' || p.status === 'لم يتم التحصيل' ? 'text-rose-600' : 'text-emerald-600'}`} />
                          <span>{p.status === 'pending' || p.status === 'لم يتم التحصيل' ? 'توليد إشعار مطالبة' : 'توليد صورة إيصال'}</span>
                        </button>

                        {p.fileUrl && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onPreviewImage(p.fileUrl!); }}
                            className="p-1.5 px-2 border border-blue-100 text-blue-700 hover:bg-blue-50 rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1 shrink-0"
                            title="عرض الإيصال المرفق"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>المرفق</span>
                          </button>
                        )}
                        {!p.fileUrl && (
                          <span className="text-[10px] text-slate-300 font-bold py-1.5 px-1">بدون مرفق</span>
                        )}

                        {!isReadOnly && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditModal(p); }}
                              className="p-2 text-slate-600 hover:text-blue-900 hover:bg-blue-50 border border-slate-200 rounded-xl transition transform hover:scale-110 active:scale-95 cursor-pointer shadow-2xs"
                              title={role === 'ASSISTANT' ? 'تعديل الملاحظات' : 'تعديل'}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {role !== 'ASSISTANT' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                                className="p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition transform hover:scale-110 active:scale-95 cursor-pointer shadow-2xs"
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            {(resObj || residents.find(r => isSameFlatNumber(r.flatNumber, p.flatNumber))) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const targetRes = resObj || residents.find(r => isSameFlatNumber(r.flatNumber, p.flatNumber));
                                  if (targetRes) setHistoryModalResident(targetRes);
                                }}
                                className="p-2 text-purple-700 hover:text-purple-900 hover:bg-purple-50 border border-purple-200 rounded-xl transition transform hover:scale-110 active:scale-95 cursor-pointer shadow-2xs"
                                title="سجل الوحدة"
                              >
                                <History className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            ))
          )}
          {filteredPayments.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between text-emerald-950 shadow-3xs mt-2">
              <span className="text-xs font-black">إجمالي التحصيلات الكلي:</span>
              <span className="text-base font-black text-emerald-700">{Math.round(totalAmount)} ج.م</span>
            </div>
          )}
        </div>
      )}


      {/* Add/Edit Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[94vh] overflow-y-auto bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-2xl animate-scale-up text-right">
            <h3 className="text-base sm:text-lg font-black text-slate-950 border-b pb-2.5 mb-3 flex items-center justify-between">
              <span>{selectedPayment ? (role === 'ASSISTANT' ? 'تعديل ملاحظات التحصيل' : 'تعديل التحصيل') : 'إضافة تحصيل جديد'}</span>
              
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* زر استيراد من إكسل */}
                {!selectedPayment && (role === 'ADMIN' || role === 'MANAGER') && (
                  <>
                    <button
                      type="button"
                      onClick={() => excelFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer shadow-3xs"
                      title="استيراد بيانات التحصيل لشهر أو سنة من ملف Excel (.xlsx)"
                    >
                      <Upload className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>استيراد إكسل</span>
                    </button>
                    <input
                      type="file"
                      ref={excelFileInputRef}
                      onChange={handleExcelCollectionsFileUpload}
                      accept=".xlsx, .xls, .csv"
                      className="hidden"
                    />
                  </>
                )}

                {/* زر توليد دفعة لكل الوحدات المستحقة */}
                {!selectedPayment && (role === 'ADMIN' || role === 'MANAGER') && (
                  <button
                    type="button"
                    onClick={() => handleOpenGenerateMonthlyDuesModal()}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer shadow-3xs"
                    title={`توليد دفعات اشتراك شهر ${monthNamesArabic[parseInt(month, 10) - 1]} ${currentYear} لجميع الوحدات المستحقة بحالة "لم يتم التحصيل"`}
                  >
                    <Users className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                    <span>توليد الكل</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </h3>

            {role === 'ASSISTANT' && selectedPayment && (
              <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-2.5 rounded-xl mb-3 font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-blue-600" />
                <span>صلاحية المساعد الفني تتيح لك التعديل في "خانة الملاحظات" فقط.</span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-xs p-2.5 rounded-xl mb-3 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-2.5 sm:space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500">الساكن / الوحدة <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 w-full">
                  <select
                    value={residentId}
                    onChange={(e) => handleResidentSelect(e.target.value)}
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
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
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
                    onClick={() => {
                      const nextState = !isAggregatedCollection;
                      setIsAggregatedCollection(nextState);
                      if (!nextState) {
                        setCoveredMonths([month]);
                        setShowMultiMonthPicker(false);
                        const selectedRes = residents.find(r => r.id === residentId);
                        if (selectedRes && (!paymentType || paymentType === 'اشتراك شهري' || paymentType.includes('اشتراك'))) {
                          const fee = targetActivityType !== selectedRes.activityType
                            ? getActivityDefaultFee(targetActivityType, `${currentYear}-${month}`)
                            : getResidentMonthlyFee(selectedRes, defaultMonthlyFee, activityDefaultFees, `${currentYear}-${month}`, payments, activityFeePeriods);
                          setAmount(fee);
                        }
                      } else {
                        setShowMultiMonthPicker(true);
                        if (coveredMonths.length === 0) {
                          setCoveredMonths([month]);
                        }
                        const selectedRes = residents.find(r => r.id === residentId);
                        if (selectedRes && (!paymentType || paymentType === 'اشتراك شهري' || paymentType.includes('اشتراك'))) {
                          const fee = targetActivityType !== selectedRes.activityType
                            ? getActivityDefaultFee(targetActivityType, `${currentYear}-${month}`)
                            : getResidentMonthlyFee(selectedRes, defaultMonthlyFee, activityDefaultFees, `${currentYear}-${month}`, payments, activityFeePeriods);
                          const totalMonthsCount = coveredMonths.length > 0 ? coveredMonths.length : 1;
                          setAmount(fee * totalMonthsCount);
                        }
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

              {/* Row 1: Target Month & Payment Type in EXACT SAME ROW */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3 items-start">
                {/* Target Month */}
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
                      if (newM && setCurrentMonth) {
                        const mIdx = parseInt(newM, 10) - 1;
                        if (!isNaN(mIdx)) {
                          setCurrentMonth(mIdx);
                        }
                      }
                      const selectedRes = residents.find(r => r.id === residentId);
                      if (selectedRes && (!paymentType || paymentType === 'اشتراك شهري' || isMonthlySubscriptionType(paymentType))) {
                        const targetYearNum = Number(currentYear) || new Date().getFullYear();
                        const targetMonthNum = parseInt(newM, 10) || 1;
                        const prescribed = getPrescribedFeeForMonth(selectedRes, targetYearNum, targetMonthNum, payments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
                        const fee = prescribed.monthlyFee > 0 ? prescribed.monthlyFee : (defaultMonthlyFee || 400);
                        // Due amount is for THIS single collection month (never multiplied by covered months!)
                        if (fee > 0) {
                          setDueAmount(fee);
                        }
                        const totalMonthsCount = (isAggregatedCollection && coveredMonths.length > 0) ? coveredMonths.length : 1;
                        const calcAmt = fee * totalMonthsCount;
                        if (!selectedPayment) {
                          if (calcAmt > 0) setAmount(calcAmt);
                        } else {
                          if (amount === '' || Number(amount) <= 0) {
                            if (calcAmt > 0) setAmount(calcAmt);
                          }
                        }
                      }
                    }}
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-bold transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {monthNamesArabic.map((name, idx) => (
                      <option key={idx} value={String(idx + 1).padStart(2, '0')}>
                        {name} {currentYear}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Payment Type */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500">نوع التحصيل <span className="text-red-500">*</span></label>
                  <select
                    value={paymentType}
                    onChange={(e) => handlePaymentTypeSelect(e.target.value)}
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-bold transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {paymentTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Distribution Action Buttons for Edit Mode: Apply Distribution & Cancel Distribution */}
                {selectedPayment && (isAggregatedCollection || coveredMonths.length > 1) && (
                  <div className="col-span-2 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Apply Distribution Button */}
                    <button
                      type="button"
                      onClick={(e) => handleApplyDistributionDirect(e)}
                      className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white border border-emerald-600 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                      title="تطبيق توزيع المبلغ المجمع على الشهور المحددة وحفظ التعديل فوراً"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
                      <span>تطبيق التوزيع ({coveredMonths.length > 0 ? `${coveredMonths.length} شهور` : 'المحدد'}) 💾</span>
                    </button>

                    {/* Cancel Distribution & Restore Full Amount Button */}
                    <button
                      type="button"
                      onClick={() => {
                        let totalRestoredAmount = typeof amount === 'number' && amount > 0 ? amount : selectedPayment.amount;
                        const cleanPaymentId = String(selectedPayment.id);
                        const sourceId = selectedPayment.distributionSourceId ? String(selectedPayment.distributionSourceId) : null;
                        const masterPayment = sourceId ? (payments.find(p => String(p.id) === sourceId) || selectedPayment) : selectedPayment;
                        const targetMasterId = String(masterPayment.id);

                        const linkedChildren = payments.filter(p => 
                          String(p.id) !== targetMasterId && (
                            String(p.distributionSourceId || '') === targetMasterId ||
                            (Array.isArray(masterPayment.distributedPaymentIds) && masterPayment.distributedPaymentIds.map(String).includes(String(p.id)))
                          )
                        );

                        if (masterPayment.originalAmountBeforeDistribution && masterPayment.originalAmountBeforeDistribution > 0) {
                          totalRestoredAmount = masterPayment.originalAmountBeforeDistribution;
                        } else {
                          totalRestoredAmount = (Number(masterPayment.amount) || 0) + linkedChildren.reduce((s, cp) => s + (Number(cp.amount) || 0), 0);
                        }

                        if (!totalRestoredAmount || totalRestoredAmount <= 0) {
                          totalRestoredAmount = (Number(selectedPayment.amount) || 0) || (Number(dueAmount) || 0) || (defaultMonthlyFee || 400);
                        }

                        setIsAggregatedCollection(false);
                        setCoveredMonths([month]);
                        setShowMultiMonthPicker(false);
                        setAmount(totalRestoredAmount);

                        const cleanUserNotes = (notes || masterPayment.notes || '')
                          .replace(/\(سداد مجمع عن شهور:.*?\)/g, '')
                          .replace(/سداد مجمع عن شهور:.*$/g, '')
                          .replace(/تم السداد في شهر.*?إيصال رقم [^\s)]*/g, '')
                          .trim();
                        setNotes(cleanUserNotes);
                      }}
                      className="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 active:scale-98 text-amber-900 border border-amber-300 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                      title="إلغاء توزيع الشهور واستعادة إجمالي المبلغ المجمع كاملاً في شهر التحصيل الفعلي"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>🔄 إلغاء التوزيع واستعادة المبلغ ({(() => {
                        const disp = (typeof amount === 'number' && amount > 0)
                          ? amount
                          : (selectedPayment?.originalAmountBeforeDistribution || selectedPayment?.amount || dueAmount || defaultMonthlyFee || 400);
                        return disp ? Number(disp).toLocaleString() : '—';
                      })()} ج.م)</span>
                    </button>
                  </div>
                )}

                {/* Multi-Month Expandable Selector & Badges (Spans Full Width across 2 columns) */}
                {isAggregatedCollection && showMultiMonthPicker && (
                  <div className="col-span-2 p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2 animate-scale-up">
                    <div className="flex items-center justify-between text-[10.5px] font-black text-blue-950">
                      <span className="flex items-center gap-1.5">
                        <span>📅 اختر الشهور المستحقة المسددة بهذه الدفعة:</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowMultiMonthPicker(false)}
                          className="text-[10px] text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                        >
                          طي ✕
                        </button>
                      </div>
                    </div>

                    {/* Fast Presets for Quick Aggregated Months Selection (Single Horizontal Row) */}
                    <div className="flex items-center gap-1 sm:gap-1.5 w-full flex-nowrap overflow-x-auto pt-0.5 pb-1 border-b border-blue-200/60 no-scrollbar">
                      <span className="text-[9px] sm:text-[9.5px] font-black text-blue-900 shrink-0 whitespace-nowrap">اختيار سريع:</span>
                      <button
                        type="button"
                        onClick={handleSelectSameMonthOnly}
                        className="px-1.5 sm:px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-md text-[8.5px] sm:text-[9.5px] font-bold transition cursor-pointer shadow-3xs active:scale-95 shrink-0 whitespace-nowrap flex-1 text-center"
                        title="تحديد شهر التحصيل فقط"
                      >
                        ⚡ شهر التحصيل فقط
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectQuarter}
                        className="px-1.5 sm:px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-md text-[8.5px] sm:text-[9.5px] font-bold transition cursor-pointer shadow-3xs active:scale-95 shrink-0 whitespace-nowrap flex-1 text-center"
                        title="تحديد 3 شهور متتالية من شهر التحصيل"
                      >
                        ⚡ 3 شهور
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectHalfYear}
                        className="px-1.5 sm:px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-md text-[8.5px] sm:text-[9.5px] font-bold transition cursor-pointer shadow-3xs active:scale-95 shrink-0 whitespace-nowrap flex-1 text-center"
                        title="تحديد 6 شهور متتالية من شهر التحصيل"
                      >
                        ⚡ 6 شهور
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectRestOfYear}
                        className="px-1.5 sm:px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-md text-[8.5px] sm:text-[9.5px] font-bold transition cursor-pointer shadow-3xs active:scale-95 shrink-0 whitespace-nowrap flex-1 text-center"
                        title="تحديد كافة الشهور المتبقية من السنة الحالية"
                      >
                        ⚡ باقي السنة
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectAllYear}
                        className="px-1.5 sm:px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-md text-[8.5px] sm:text-[9.5px] font-bold transition cursor-pointer shadow-3xs active:scale-95 shrink-0 whitespace-nowrap flex-1 text-center"
                        title="تحديد كامل شهور السنة (12 شهر)"
                      >
                        ⚡ السنة كاملة (12 شهر)
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
                            disabled={role === 'ASSISTANT' && !!selectedPayment}
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
                            title={isCollectionMonth ? `شهر التحصيل الفعلي: ${name}` : `سداد شهر ${name}`}
                          >
                            {name}
                            {isCovered && isCollectionMonth && <span className="block text-[7.5px] opacity-90">✓ (التحصيل الرئيسي)</span>}
                            {isCovered && !isCollectionMonth && <span className="block text-[7.5px] opacity-90">✓ (قيمة موزعة)</span>}
                            {!isCovered && isCollectionMonth && <span className="block text-[7.5px] opacity-80">(شهر التحصيل)</span>}
                          </button>
                        );
                      })}
                    </div>

                    <div className="text-[10px] text-blue-900 font-bold bg-white/95 px-2.5 py-1.5 rounded-lg border border-blue-200/60 space-y-1">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span>شهر التحصيل: <strong className="text-blue-900 font-black">{monthNamesArabic[parseInt(month, 10) - 1]} {currentYear}</strong></span>
                        <span>إجمالي الشهور المسددة: <strong className="text-emerald-700 font-black">{coveredMonths.length} شهور</strong> ({coveredMonths.map(x => monthNamesArabic[parseInt(x,10)-1]).join('، ')})</span>
                      </div>
                      <p className="text-slate-500 text-[9.5px] font-semibold">
                        💡 يتم تقسيم وتوزيع القيمة المسددة بالتساوي على الشهور المختارة ({coveredMonths.length} شهور) مع توثيق إيصال السداد لجميع الشهور.
                      </p>
                    </div>
                  </div>
                )}

                {/* Expand Toggle Button if Picker is Collapsed but Aggregated Collection is Active */}
                {isAggregatedCollection && !showMultiMonthPicker && (
                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={() => setShowMultiMonthPicker(true)}
                      className="w-full py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl text-[10.5px] font-black transition flex items-center justify-between cursor-pointer shadow-2xs"
                    >
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        <span>توزيع السداد مفعل:</span>
                        <strong className="text-emerald-800">{coveredMonths.length > 0 ? `${coveredMonths.length} شهور (${coveredMonths.map(x => monthNamesArabic[parseInt(x,10)-1]).join('، ')})` : 'انقر لتحديد الشهور'}</strong>
                      </span>
                      <span className="text-[9.5px] text-emerald-700 underline font-bold">تعديل الشهور ▾</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Unit Activity Change & Default Subscription Fee Box (Below Payment Type) */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-2.5 space-y-1.5 text-right">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                    <Building className="w-3 h-3 text-blue-900" />
                    <span>تغيير نوع نشاط الوحدة في هذا الشهر:</span>
                  </label>
                  {targetActivityType !== (residents.find(r => r.id === residentId)?.activityType || 'سكني') && (
                    <span className="text-[9.5px] font-black text-blue-900 bg-blue-100 px-1.5 py-0.2 rounded border border-blue-200">
                      نشاط جديد
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 items-center">
                  {/* Activity Type Dropdown */}
                  <div>
                    <select
                      value={targetActivityType}
                      onChange={(e) => handleActivityTypeChange(e.target.value)}
                      disabled={role === 'ASSISTANT' && !!selectedPayment}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:border-blue-500 rounded-lg text-xs font-bold outline-none cursor-pointer"
                    >
                      {allAvailableActivityTypes.map((act) => (
                        <option key={act} value={act}>
                          {act}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Apply Default Fee for this Activity Button */}
                  <div>
                    <button
                      type="button"
                      onClick={() => applyDefaultFeeForActivity(targetActivityType)}
                      disabled={role === 'ASSISTANT' && !!selectedPayment}
                      className="w-full px-2 py-1.5 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-[10.5px] sm:text-[11px] font-black transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs truncate"
                      title="تطبيق قيمة الاشتراك الافتراضية للوحدة بهذا النشاط"
                    >
                      <RefreshCw className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">تطبيق اشتراك النشاط ({getActivityDefaultFee(targetActivityType) * ((isAggregatedCollection && coveredMonths.length > 0) ? coveredMonths.length : 1)} ج.م)</span>
                    </button>
                  </div>
                </div>

                <p className="text-[9.5px] text-slate-400 font-semibold">
                  * الافتراضي: <strong className="text-slate-700">{residents.find(r => r.id === residentId)?.activityType || 'سكني'}</strong> (يتم حفظ النشاط وتحديث خريطة السداد تلقائياً).
                </p>
              </div>

              {/* Amounts and Receipt Number Row - Universal 3 Columns */}
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {/* 1. المبلغ المستحق */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 block truncate" title="المبلغ المستحق من سجل الوحدة ثم من فترة التسعير في إدارة اشتراكات الوحدات">
                    المبلغ المستحق
                  </label>
                  <input
                    type="number"
                    placeholder="المستحق"
                    value={dueAmount === '' || isNaN(Number(dueAmount)) ? '' : dueAmount}
                    onChange={(e) => setDueAmount(e.target.value !== '' ? Number(e.target.value) : '')}
                    className="w-full px-2 sm:px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-bold transition text-blue-950"
                    title="قيمة الاشتراك المستحق من سجل الوحدة ثم من فترة التسعير في إدارة اشتراكات الوحدات (يمكن تعديلها يدوياً)"
                  />
                </div>

                {/* 2. المبلغ المستلم */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 block truncate">
                    المبلغ المستلم <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    placeholder="المستلم"
                    value={amount === '' || isNaN(Number(amount)) ? '' : amount}
                    onChange={(e) => setAmount(e.target.value !== '' ? Number(e.target.value) : '')}
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
                    className="w-full px-2 sm:px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-bold transition disabled:opacity-60 disabled:cursor-not-allowed"
                    required
                  />
                </div>

                {/* 3. رقم الإيصال */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 block truncate">
                    رقم الإيصال
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 4501"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
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
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
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
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
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
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
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

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-blue-900 flex items-center justify-between">
                  <span>ملاحظات {role === 'ASSISTANT' && selectedPayment && <span className="text-emerald-700 font-extrabold">(مسموح للتعديل)</span>}</span>
                </label>
                <input
                  type="text"
                  placeholder="ملاحظات (مثال: تم الاستلام نقداً)"
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

                {/* If an image is selected or exists */}
                {(base64Image || existingFileUrl) ? (
                  <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-2 flex items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {/* Image Thumbnail with zoom overlay */}
                      <div 
                        onClick={() => onPreviewImage(base64Image || existingFileUrl)}
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
                        <button
                          type="button"
                          onClick={() => onPreviewImage(base64Image || existingFileUrl)}
                          className="text-[10px] text-blue-900 hover:text-blue-950 font-black flex items-center gap-1 cursor-pointer bg-blue-50/80 px-1.5 py-0.2 rounded border border-blue-100/60 w-fit"
                        >
                          <Eye className="w-2.5 h-2.5 text-blue-700" />
                          <span>معاينة الصورة</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => triggerFileSelection(false)}
                        className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-black transition cursor-pointer shadow-2xs"
                        title="تغيير الصورة"
                      >
                        تغيير
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="p-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-lg transition cursor-pointer shadow-2xs"
                        title="حذف الصورة"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* No image selected: Choice between Camera and File Upload */
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

              <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-black transition shadow-sm cursor-pointer"
                >
                  {selectedPayment ? 'حفظ التعديلات' : 'إضافة التحصيل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Generate & Manage Monthly Dues Modal */}
      {bulkGenerateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-2.5 sm:p-4 text-right animate-fade-in overflow-y-auto" dir="rtl">
          <div className="w-full max-w-lg bg-white rounded-3xl p-3.5 sm:p-5 border border-slate-100 shadow-2xl animate-scale-up space-y-2.5 my-auto max-h-[92vh] flex flex-col">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center shrink-0 shadow-2xs">
                  <Users className="w-4 h-4 text-blue-800" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-950">
                    توليد وإدارة استحقاقات الاشتراك الشهري
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold">
                    إدارة استحقاقات جميع الوحدات لشهر {monthNamesArabic[bulkTargetMonthNum - 1]} {bulkTargetYearNum}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setBulkGenerateModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Month & Year Selection Bar */}
            <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-900 shrink-0" />
                <span className="text-[11px] font-black text-slate-800">تحديد الشهر:</span>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={bulkGenerateModal.monthStr}
                  onChange={(e) => setBulkGenerateModal(prev => prev ? { ...prev, monthStr: e.target.value } : null)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-[11px] font-black text-blue-950 outline-none cursor-pointer shadow-2xs"
                >
                  {monthNamesArabic.map((mName, idx) => {
                    const mNumStr = String(idx + 1).padStart(2, '0');
                    return (
                      <option key={mNumStr} value={mNumStr}>
                        شهر {idx + 1} - {mName}
                      </option>
                    );
                  })}
                </select>
                <span className="text-[11px] font-black font-mono text-slate-700 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  {bulkTargetYearNum}
                </span>
              </div>
            </div>

            {/* Quick Stats Cards */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs shrink-0">
              <div className="p-2 bg-emerald-50/90 rounded-xl border border-emerald-200 shadow-2xs">
                <span className="text-[10px] text-emerald-800 font-bold block mb-0.2">الدفعات المسجلة حالياً</span>
                <span className="text-sm font-black text-emerald-950 font-mono">{bulkExistingPayments.length} دفعة</span>
                <span className="text-[9.5px] text-emerald-700 block font-bold font-mono">
                  ({bulkTotalExistingDue.toLocaleString()} ج.م)
                </span>
              </div>
              <div className="p-2 bg-blue-50/90 rounded-xl border border-blue-200 shadow-2xs">
                <span className="text-[10px] text-blue-800 font-bold block mb-0.2">الوحدات المتبقية للتوليد</span>
                <span className="text-sm font-black text-blue-950 font-mono">{bulkPendingItems.length} وحدة</span>
                <span className="text-[9.5px] text-blue-700 block font-bold font-mono">
                  ({bulkTotalPendingDue.toLocaleString()} ج.م)
                </span>
              </div>
            </div>

            {/* Main Action Buttons: Update dues, Delete dues, Generate dues */}
            <div className="space-y-1.5 shrink-0">
              {/* Operations on Existing Dues */}
              {bulkExistingPayments.length > 0 && (
                <div className="p-2 bg-amber-50/90 border border-amber-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 text-[11px] font-black text-amber-950">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>إجراءات على استحقاقات شهر {monthNamesArabic[bulkTargetMonthNum - 1]} المولدة:</span>
                    </div>
                    <span className="text-[9.5px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 font-mono">
                      المتاح: {bulkGeneratedModifiablePayments.length} من {bulkExistingPayments.length}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* 1. Update Dues Button */}
                    <button
                      type="button"
                      onClick={handleUpdateExistingMonthDues}
                      disabled={isUpdatingDues || bulkGeneratedModifiablePayments.length === 0}
                      className="py-1.5 px-2 bg-indigo-700 hover:bg-indigo-800 active:scale-95 text-white rounded-lg text-[11px] font-black transition flex items-center justify-center gap-1 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      title="تحديث مبالغ دفعات الاستحقاق المولدة غير المعدلة طبقا لسجل الوحدة وفترة التسعير"
                    >
                      <RefreshCw className={`w-3 h-3 text-indigo-200 shrink-0 ${isUpdatingDues ? 'animate-spin' : ''}`} />
                      <span>تحديث الاستحقاقات المولدة ({bulkGeneratedModifiablePayments.length})</span>
                    </button>

                    {/* 2. Delete Dues Button */}
                    <button
                      type="button"
                      onClick={handleDeleteExistingMonthDues}
                      disabled={isDeletingDues || bulkGeneratedModifiablePayments.length === 0}
                      className="py-1.5 px-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-lg text-[11px] font-black transition flex items-center justify-center gap-1 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      title="حذف دفعات الاستحقاق المولدة غير المعدلة لهذا الشهر لتتمكن من إعادة التوليد"
                    >
                      <Trash2 className="w-3 h-3 text-rose-200 shrink-0" />
                      <span>حذف الاستحقاقات المولدة ({bulkGeneratedModifiablePayments.length})</span>
                    </button>
                  </div>
                  <div className="text-[9.5px] text-amber-900 font-bold leading-tight space-y-0.5">
                    <p>* يقتصر التحديث والحذف حصرياً على الدفعات التي تم توليدها تلقائياً ولم يتم إجراء أي تعديل أو سداد عليها.</p>
                    {bulkExistingPayments.length > bulkGeneratedModifiablePayments.length && (
                      <p className="text-emerald-800 font-black">
                        🛡️ تم حماية ({bulkExistingPayments.length - bulkGeneratedModifiablePayments.length}) دفعة مسجلة يدوياً أو معدلة/مسددة ولن تتأثر بالتحديث أو الحذف.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 3. Confirm Generate Remaining Units Button */}
              {bulkPendingItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleConfirmBulkGenerate}
                  className="w-full py-1.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5 text-emerald-200" />
                  <span>تأكيد توليد ({bulkPendingItems.length}) دفعات استحقاق متبقية الآن</span>
                </button>
              )}

              {bulkPendingItems.length === 0 && bulkExistingPayments.length > 0 && (
                <div className="p-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-center text-[10.5px] font-black text-emerald-900 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>جميع وحدات العمارة لديها دفعات اشتراك مسجلة لهذا الشهر! يمكنك تحديثها أو حذفها أعلاه.</span>
                </div>
              )}
            </div>

            {/* Dual Tabs for Preview & List Scrolling */}
            <div className="flex-1 flex flex-col min-h-0 pt-0.5 border-t border-slate-100">
              <div className="flex items-center gap-1 border-b border-slate-200 pb-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setBulkModalActiveTab('pending')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer flex items-center gap-1 ${
                    bulkModalActiveTab === 'pending'
                      ? 'bg-blue-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>الوحدات المستحقة للتوليد</span>
                  <span className="font-mono text-[9.5px] px-1.5 py-0.2 bg-white/20 rounded font-bold">
                    {bulkPendingItems.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBulkModalActiveTab('existing')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer flex items-center gap-1 ${
                    bulkModalActiveTab === 'existing'
                      ? 'bg-blue-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>الدفعات المسجلة حالياً</span>
                  <span className="font-mono text-[9.5px] px-1.5 py-0.2 bg-white/20 rounded font-bold">
                    {bulkExistingPayments.length}
                  </span>
                </button>
              </div>

              {/* Tab Content with dedicated scroll area */}
              <div className="flex-1 overflow-y-auto mt-1.5 pr-0.5 min-h-[180px] max-h-[360px] scrollbar-thin">
                {bulkModalActiveTab === 'pending' ? (
                  bulkPendingItems.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 font-bold">
                      لا توجد وحدات مستحقة جديدة بحاجة للتوليد لشهر {monthNamesArabic[bulkTargetMonthNum - 1]} {bulkTargetYearNum}.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/50 p-1 text-xs">
                      {bulkPendingItems.map((p, idx) => (
                        <div key={p.id || idx} className="py-1 px-2 flex items-center justify-between hover:bg-white rounded-lg transition">
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-mono text-[10px] text-slate-400 w-4">{idx + 1}.</span>
                            <span className="font-black text-slate-900">شقة {p.flatNumber}</span>
                            <span className="text-[11px] text-slate-500 truncate">- {p.residentName}</span>
                          </div>
                          <span className="font-black font-mono text-blue-900 shrink-0">{p.amount.toLocaleString()} ج.م</span>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  bulkExistingWithRecalc.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 font-bold">
                      لا توجد دفعات اشتراك مسجلة حتى الآن لهذا الشهر.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/50 p-1 text-xs">
                      {bulkExistingWithRecalc.map(({ payment: p, prescribedFee, currentFee, isDifferent, isModifiableGenerated, displayOwner }, idx) => (
                        <div key={p.id || idx} className="py-1 px-2 flex items-center justify-between hover:bg-white rounded-lg transition">
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-mono text-[10px] text-slate-400 w-4">{idx + 1}.</span>
                            <span className="font-black text-slate-900">شقة {p.flatNumber}</span>
                            <span className="text-[11px] text-slate-500 truncate">- {displayOwner}</span>
                            <span className={`text-[8px] font-black px-1.5 py-0.2 rounded border ${
                              isModifiableGenerated
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}>
                              {isModifiableGenerated ? 'استحقاق مولد' : 'محمي (يدوي/معدل)'}
                            </span>
                            <span className={`text-[8px] font-black px-1 py-0.2 rounded ${
                              p.status === 'pending' || p.status === 'لم يتم التحصيل'
                                ? 'bg-orange-100 text-orange-900'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}>
                              {p.status === 'pending' || p.status === 'لم يتم التحصيل' ? 'معلق' : 'مسدد'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-left font-mono">
                              <span className="font-black text-slate-900">{currentFee.toLocaleString()} ج.م</span>
                              {isDifferent && (
                                <span className="block text-[9px] text-indigo-700 font-bold">
                                  ← أحدث تسعير: {prescribedFee.toLocaleString()} ج.م
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end pt-1.5 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setBulkGenerateModal(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Custom Confirmation Dialog */}
      {confirmData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in text-right">
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 border border-slate-100 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-center gap-3 mb-3 text-amber-500">
              <AlertCircle className="w-10 h-10 stroke-[1.5]" />
            </div>
            <h3 className="text-xs font-black text-slate-900 text-center mb-2">
              {confirmData.type === 'delete' || confirmData.type === 'deleteMonthDues' ? 'تأكيد عملية الحذف' : 'تأكيد حفظ البيانات والعمليات'}
            </h3>
            <p className="text-[11px] text-slate-600 text-center font-bold leading-relaxed mb-4 whitespace-pre-line">
              {confirmData.type === 'deleteMonthDues'
                ? `هل أنت متأكد من حذف دفعات الاستحقاق المولدة تلقائياً لشهر ${confirmData.monthName} ${confirmData.year}؟\nسيتم مسح (${confirmData.count}) دفعة استحقاق مولدة غير معدلة لهذا الشهر.\n(ملاحظة: الدفعات المسجلة يدوياً أو المسددة أو التي تم تعديلها لن تتأثر ومحمية تماماً).`
                : confirmData.type === 'delete' 
                ? 'هل أنت متأكد من حذف هذه العملية؟ سيؤدي هذا إلى مسح سجل التحصيل المحدد بالكامل ولا يمكن التراجع عن هذا الإجراء.'
                : confirmData.multiplePayments && confirmData.multiplePayments.length > 0
                ? `أنت على وشك ${confirmData.type === 'edit' ? 'حفظ تعديل' : 'تسجيل'} سداد مجمع للوحدة ${confirmData.multiplePayments[0]?.flatNumber} وتوزيع القيمة بالتساوي بقيمة (${confirmData.multiplePayments[0]?.amount} ج.م لكل شهر) على ${confirmData.multiplePayments.length} شهور (${confirmData.multiplePayments.map(p => monthNamesArabic[parseInt(p.month, 10) - 1]).join('، ')}).${confirmData.residentToUpdate ? ` (مع حفظ نشاط الوحدة الجديد: ${confirmData.residentToUpdate.activityType})` : ''} هل تود التأكيد؟`
                : `أنت على وشك ${confirmData.type === 'edit' ? 'حفظ تعديل' : 'إضافة'} عملية تحصيل للوحدة ${confirmData.paymentData?.flatNumber} بمبلغ ${confirmData.paymentData?.amount} ج.م في شهر ${monthNamesArabic[parseInt(confirmData.paymentData?.month || '1', 10) - 1]}.${confirmData.residentToUpdate ? ` (مع حفظ نشاط الوحدة الجديد: ${confirmData.residentToUpdate.activityType})` : ''} هل تود التأكيد؟`}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmData(null)}
                className="flex-1 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 border border-slate-100 rounded-lg transition"
              >
                تراجع وإلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmData.residentToUpdate && onEditResident) {
                    onEditResident(confirmData.residentToUpdate);
                  }

                  if (confirmData.type === 'deleteMonthDues' && confirmData.deleteIds) {
                    if (onDeleteBatchPayments) {
                      onDeleteBatchPayments(confirmData.deleteIds);
                    } else {
                      confirmData.deleteIds.forEach(id => onDelete(id));
                    }
                    setToastMsg(`تم بنجاح حذف (${confirmData.deleteIds.length}) دفعة استحقاق مولدة غير معدلة لشهر ${confirmData.monthName} ${confirmData.year} دون المساس بالدفعات اليدوية أو المعدلة.`);
                    setBulkModalActiveTab('pending');
                  } else if (confirmData.type === 'delete' && confirmData.deleteId) {
                    onDelete(confirmData.deleteId);
                  } else if (confirmData.multiplePayments && confirmData.multiplePayments.length > 0) {
                    if (confirmData.type === 'edit') {
                      if (onDistributePayment) {
                        const origId = confirmData.multiplePayments[0].id;
                        onDistributePayment(origId, confirmData.multiplePayments, confirmData.deletedPaymentIds);
                      } else {
                        if (confirmData.deletedPaymentIds) {
                          confirmData.deletedPaymentIds.forEach(id => onDelete(id));
                        }
                        onEdit(confirmData.multiplePayments[0], confirmData.base64Image);
                        confirmData.multiplePayments.slice(1).forEach(p => {
                          if (payments.some(existing => existing.id === p.id)) {
                            onEdit(p, confirmData.base64Image);
                          } else {
                            onAdd(p, confirmData.base64Image);
                          }
                        });
                      }
                    } else {
                      if (onDistributePayment) {
                        const origId = confirmData.multiplePayments[0].id;
                        onDistributePayment(origId, confirmData.multiplePayments);
                      } else {
                        confirmData.multiplePayments.forEach((p) => {
                          if (payments.some(existing => String(existing.id) === String(p.id))) {
                            onEdit(p, confirmData.base64Image);
                          } else {
                            onAdd(p, confirmData.base64Image);
                          }
                        });
                      }
                    }
                    setShowModal(false);
                  } else if (confirmData.paymentData) {
                    if (confirmData.type === 'edit') {
                      if (confirmData.deletedPaymentIds && confirmData.deletedPaymentIds.length > 0) {
                        if (onDistributePayment) {
                          onDistributePayment(confirmData.paymentData.id, [confirmData.paymentData], confirmData.deletedPaymentIds);
                        } else {
                          confirmData.deletedPaymentIds.forEach(id => onDelete(id));
                          onEdit(confirmData.paymentData, confirmData.base64Image);
                        }
                      } else {
                        onEdit(confirmData.paymentData, confirmData.base64Image);
                      }
                    } else {
                      onAdd(confirmData.paymentData, confirmData.base64Image);
                    }
                    setShowModal(false);
                  }
                  setConfirmData(null);
                }}
                className={`flex-1 py-2 text-[10px] font-bold text-white rounded-lg transition ${confirmData.type === 'delete' || confirmData.type === 'deleteMonthDues' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-900 hover:bg-blue-950'}`}
              >
                {confirmData.type === 'delete' || confirmData.type === 'deleteMonthDues' ? 'نعم، حذف' : 'نعم، حفظ وتأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Monthly Payments Printable Report Area */}
      <div
        id="payments-monthly-printable-area"
        className="printable-area hidden text-right p-6 font-sans bg-white text-slate-900"
        dir="rtl"
      >
        {/* Header */}
        <div className="text-center space-y-2 border-b-2 border-slate-800 pb-4 mb-5">
          <h1 className="text-2xl font-black text-slate-900">اتحاد ملاك عمارة بيراميدز فيو ١</h1>
          <h2 className="text-base font-bold text-slate-700">
            {onlyCurrentMonth
              ? `تقرير تحصيلات شهر ${monthNamesArabic[parseInt(actualCurrentMonth, 10) - 1]} (السنة المالية ${currentYear})`
              : filterMonth
              ? `تقرير تحصيلات شهر ${monthNamesArabic[parseInt(filterMonth, 10) - 1]} (السنة المالية ${currentYear})`
              : `تقرير إجمالي التحصيلات (السنة المالية ${currentYear})`}
          </h2>
          <div className="flex justify-between items-center text-xs text-slate-500 pt-2 font-semibold">
            <span>تاريخ إصدار التقرير: {new Date().toLocaleDateString('ar-EG')}</span>
            <span>إجمالي المعاملات بالتقرير: {sortedFilteredPayments.length} عملية تحصيل</span>
          </div>

          {/* Active Filter Indicators on Report */}
          {(filterResident || filterType || !onlyCurrentMonth || receiptSort !== 'none' || distributionFilter === 'without_distributed') && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-dashed border-slate-200 text-[11px] text-slate-600 font-bold">
              <span className="text-slate-400">الفلاتر المطبقة:</span>
              {filterResident && (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded border border-blue-200">
                  الوحدة: ( الوحدة {residents.find((r) => r.id === filterResident)?.flatNumber} - {residents.find((r) => r.id === filterResident)?.activityType || 'سكني'} ) ({residents.find((r) => r.id === filterResident)?.name})
                </span>
              )}
              {filterType && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-300">
                  فئة التحصيل: {filterType}
                </span>
              )}
              {filterMonth && !onlyCurrentMonth && (
                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded border border-amber-200">
                  شهر: {monthNamesArabic[parseInt(filterMonth, 10) - 1]}
                </span>
              )}
              {!onlyCurrentMonth && !filterMonth && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                  عرض كل الشهور
                </span>
              )}
              {distributionFilter === 'without_distributed' && (
                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded border border-amber-200 font-black">
                  بدون المبالغ الموزعة من شهور أخرى
                </span>
              )}
              {receiptSort !== 'none' && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                  ترتيب أرقام الإيصالات: {receiptSort === 'asc' ? 'تصاعدي' : 'تنازلي'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Stats Summary Bar */}
        {(() => {
          const isUncollected = (p: Payment) => 
            p.status === 'pending' || p.status === 'لم يتم التحصيل' || p.status === 'uncollected' || p.status === 'unpaid' || p.status === 'غير مسدد' || p.status === 'لم يسدد' || p.status === 'معلق';
          const isCancelled = (p: Payment) => 
            p.status === 'cancelled' || p.status === 'لاغي' || p.status === 'VOID' || p.status === 'ملغي' || p.status === 'مرفوض';

          const validCollectedPayments = sortedFilteredPayments.filter(p => !isUncollected(p) && !isCancelled(p));
          const uncollectedPayments = sortedFilteredPayments.filter(p => isUncollected(p));
          const cancelledPayments = sortedFilteredPayments.filter(p => isCancelled(p));

          const totalCollectedAmt = validCollectedPayments.reduce((sum, p) => sum + getEffectiveDisplayAmount(p), 0);
          const totalUncollectedAmt = uncollectedPayments.reduce((sum, p) => sum + getEffectiveDisplayAmount(p), 0);

          // Calculate average monthly collection = (Sum of monthly collections for all registered months) / (number of registered months)
          const validPaymentsInScope = payments.filter(p => p.year === currentYear && !isUncollected(p) && !isCancelled(p));
          const registeredMonthsSet = new Set(validPaymentsInScope.map(p => p.month));
          const registeredMonthsCount = Math.max(1, registeredMonthsSet.size);

          const totalYearCollectedAmt = validPaymentsInScope.reduce((sum, p) => sum + p.amount, 0);
          const monthlyAverage = Math.round(totalYearCollectedAmt / registeredMonthsCount);

          return (
            <div className="grid grid-cols-3 gap-4 border border-slate-300 rounded-xl p-4 bg-slate-50 mb-6 text-xs">
              <div className="text-center space-y-1">
                <span className="font-extrabold text-slate-500">إجمالي المقبوض المستلم</span>
                <div className="text-base font-black text-emerald-700">
                  {totalCollectedAmt.toLocaleString()} ج.م
                </div>
                <div className="text-[10px] text-slate-500 font-semibold">
                  ({validCollectedPayments.length} عملية مقبوضة)
                  {uncollectedPayments.length > 0 && <span className="text-amber-800 font-bold block mt-0.5">({uncollectedPayments.length} معلقة: {totalUncollectedAmt.toLocaleString()} ج.م)</span>}
                  {cancelledPayments.length > 0 && <span className="text-rose-700 font-bold block mt-0.5">({cancelledPayments.length} ملغاة)</span>}
                </div>
              </div>
              <div className="text-center space-y-1 border-x border-slate-300">
                <span className="font-extrabold text-slate-500">عدد المعاملات بالتقرير</span>
                <div className="text-base font-black text-slate-800">{sortedFilteredPayments.length} معاملة</div>
                <div className="text-[10px] text-slate-500 font-semibold">
                  {validCollectedPayments.length} مقبوض | {uncollectedPayments.length} معلق | {cancelledPayments.length} ملغى
                </div>
              </div>
              <div className="text-center space-y-1">
                <span className="font-extrabold text-slate-500">متوسط اشتراك شهري</span>
                <div className="text-base font-black text-blue-900">
                  {monthlyAverage.toLocaleString()} ج.م
                </div>
                <div className="text-[10px] text-slate-500 font-semibold">
                  ({totalYearCollectedAmt.toLocaleString()} ج.م ÷ {registeredMonthsCount} شهور مسجلة)
                </div>
              </div>
            </div>
          );
        })()}

        {/* Payments Table */}
        <table className="w-full text-right border-collapse text-xs border border-slate-300">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-300">
              <th className="border border-slate-300 p-2 text-center w-12">#</th>
              <th className="border border-slate-300 p-2 text-center">الوحدة</th>
              <th className="border border-slate-300 p-2">المالك / المستأجر</th>
              <th className="border border-slate-300 p-2 text-center">فئة الاشتراك</th>
              <th className="border border-slate-300 p-2 text-center">شهر الاشتراك</th>
              <th className="border border-slate-300 p-2 text-center">تاريخ التحصيل</th>
              <th className="border border-slate-300 p-2 text-center">المبلغ</th>
              <th className="border border-slate-300 p-2 text-center">حالة الدفعة / الإيصال</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.length === 0 || floorPaymentGroups.every(g => g.payments.length === 0) ? (
              <tr>
                <td colSpan={8} className="text-center p-6 text-slate-400 font-bold border border-slate-300">
                  لا توجد عمليات تحصيل مسجلة تطابق هذه الشروط المحددة.
                </td>
              </tr>
            ) : (
              (() => {
                let rowCounter = 0;
                return floorPaymentGroups.map((group) => (
                  <React.Fragment key={group.floor.id}>
                    <tr className="bg-slate-200 border-y border-slate-400">
                      <td colSpan={8} className="p-2 border border-slate-400 bg-slate-100 font-extrabold text-slate-900">
                        🏢 {group.floor.floorLabel} ({group.payments.length} {group.payments.length === 1 ? 'عملیة تحصيل' : 'عمليات تحصيل'})
                      </td>
                    </tr>
                    {group.payments.map((p) => {
                      rowCounter++;
                      const res = residents.find((r) => r.id === p.residentId) || residents.find((r) => isSameFlatNumber(r.flatNumber, p.flatNumber));
                      const subPeriod = `${p.year}-${p.month}`;
                      const historical = res ? getHistoricalOccupantForDate(res, subPeriod) : { ownerName: p.residentName, tenantName: undefined };
                      const ownerName = historical.ownerName || res?.name || p.residentName;
                      const tenantName = historical.tenantName !== undefined ? historical.tenantName : (res?.ownershipType === 'إيجار' ? res?.tenantName : '');

                      const isUncollected = 
                        p.status === 'pending' || 
                        p.status === 'لم يتم التحصيل' || 
                        p.status === 'uncollected' ||
                        p.status === 'unpaid' ||
                        p.status === 'غير مسدد' ||
                        p.status === 'لم يسدد' ||
                        p.status === 'معلق';
                      const isCancelled = 
                        p.status === 'cancelled' || 
                        p.status === 'لاغي' || 
                        p.status === 'VOID' || 
                        p.status === 'ملغي' || 
                        p.status === 'مرفوض';

                      return (
                        <tr key={p.id} className={`border-b border-slate-200 ${isCancelled ? 'bg-slate-200/80 text-slate-700' : (isUncollected && p.amount === 0) ? 'bg-slate-100/80 text-slate-600' : isUncollected ? 'bg-rose-50/70' : ''}`}>
                          <td className="border border-slate-300 p-2 text-center font-bold text-slate-500">{rowCounter}</td>
                          <td className="border border-slate-300 p-2 text-center font-black text-blue-900">وحدة {p.flatNumber}</td>
                          <td className="border border-slate-300 p-2 font-bold text-slate-900">
                            <div>
                              <div>{ownerName}</div>
                              {tenantName && (
                                <div className="text-[10px] text-amber-900 font-normal">
                                  مستأجر: {tenantName}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="border border-slate-300 p-2 text-center text-slate-700">{p.paymentType}</td>
                          <td className="border border-slate-300 p-2 text-center text-slate-600 font-semibold">
                            {monthNamesArabic[parseInt(p.month, 10) - 1] || p.month} {p.year}
                          </td>
                          <td className="border border-slate-300 p-2 text-center text-slate-600">{p.date || p.month}</td>
                          <td className={`border border-slate-300 p-2 text-center font-black ${
                            isCancelled
                              ? 'text-slate-600 line-through opacity-80'
                              : (isUncollected && p.amount === 0)
                              ? 'text-slate-600'
                              : isUncollected
                              ? 'text-rose-900'
                              : 'text-emerald-700'
                          }`}>
                            {Math.round(getEffectiveDisplayAmount(p)).toLocaleString()} ج.م
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-mono font-bold text-xs">
                            {isCancelled ? (
                              <span className="px-1.5 py-0.5 bg-slate-300 text-slate-800 rounded font-black border border-slate-400">🚫 لاغي</span>
                            ) : isUncollected ? (
                              p.amount === 0 ? (
                                <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded font-black border border-slate-300">⚪ معفي</span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded font-black border border-amber-200">⏳ معلق</span>
                              )
                            ) : p.receiptNumber ? (
                              `#${p.receiptNumber}`
                            ) : (
                              <span className="text-emerald-800 font-black">✓ مسدد</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ));
              })()
            )}
          </tbody>
          {sortedFilteredPayments.length > 0 && (() => {
            const isUncollected = (p: Payment) => p.status === 'pending' || p.status === 'لم يتم التحصيل' || p.status === 'uncollected' || p.status === 'unpaid' || p.status === 'غير مسدد' || p.status === 'لم يسدد' || p.status === 'معلق';
            const isCancelled = (p: Payment) => p.status === 'cancelled' || p.status === 'لاغي' || p.status === 'VOID' || p.status === 'ملغي' || p.status === 'مرفوض';

            const validCollected = sortedFilteredPayments.filter(p => !isUncollected(p) && !isCancelled(p));
            const uncollectedList = sortedFilteredPayments.filter(p => isUncollected(p));

            const totalCollected = validCollected.reduce((sum, p) => sum + getEffectiveDisplayAmount(p), 0);
            const totalUncollected = uncollectedList.reduce((sum, p) => sum + getEffectiveDisplayAmount(p), 0);

            return (
              <tfoot>
                <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-800">
                  <td colSpan={6} className="border border-slate-300 p-2.5 text-left pl-4 font-black">
                    إجمالي التحصيلات المقبوضة المستلمة فعلياً:
                  </td>
                  <td className="border border-slate-300 p-2.5 text-center text-emerald-800 text-sm font-black">
                    {totalCollected.toLocaleString()} ج.م
                  </td>
                  <td className="border border-slate-300 p-2.5 text-center text-xs font-bold text-emerald-800">
                    ({validCollected.length} مقبوض)
                  </td>
                </tr>
                {uncollectedList.length > 0 && (
                  <tr className="bg-amber-50 font-bold text-amber-950 border-t border-amber-300 text-xs">
                    <td colSpan={6} className="border border-slate-300 p-2 text-left pl-4 font-bold">
                      إجمالي المبالغ المعلقة (قيد التحصيل):
                    </td>
                    <td className="border border-slate-300 p-2 text-center text-amber-900 font-black">
                      {totalUncollected.toLocaleString()} ج.م
                    </td>
                    <td className="border border-slate-300 p-2 text-center text-xs font-bold text-amber-800">
                      ({uncollectedList.length} معلق)
                    </td>
                  </tr>
                )}
              </tfoot>
            );
          })()}
        </table>

        <div className="mt-4 pt-3 border-t border-slate-200 text-center text-[11px] text-slate-400 font-semibold">
          تم استخراج هذا التقرير تلقائياً ومطابق تماماً للبيانات والشروط النشطة على الشاشة • اتحاد ملاك عمارة بيراميدز فيو ١
        </div>
      </div>

      {/* Share Report Modal */}
      <ShareReportModal
        isOpen={shareReportModal.isOpen}
        onClose={() => setShareReportModal((prev) => ({ ...prev, isOpen: false }))}
        imageBlob={shareReportModal.imageBlob}
        imageDataUrl={shareReportModal.imageDataUrl}
        fileName={shareReportModal.fileName}
        reportTitle="تقرير تحصيلات معتمد"
        reportPeriodText={shareReportModal.reportPeriodText}
        reportStatsText={shareReportModal.reportStatsText}
        residents={residents}
        initialResidentId={shareReportModal.initialResidentId}
        onSuccessToast={(msg) => {
          setToastMsg(msg);
          setTimeout(() => setToastMsg(null), 8000);
        }}
      />

      {/* Single Receipt Preview & WhatsApp Share Modal */}
      <ReceiptClaimModal
        isOpen={Boolean(receiptModalData)}
        onClose={() => setReceiptModalData(null)}
        data={receiptModalData}
        residents={residents}
        payments={payments}
        config={config}
        onSuccessToast={(msg) => {
          setToastMsg(msg);
          setTimeout(() => setToastMsg(null), 8000);
        }}
      />

      {/* Excel Collections Import Preview Modal */}
      {showExcelPreviewModal && excelPreviewPayments && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4" dir="rtl">
          <div className="w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-2xl animate-scale-up text-right flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b pb-3 mb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-emerald-600" />
                  <span>معاينة استيراد بيانات التحصيل من ملف إكسل</span>
                </h3>
                <p className="text-xs text-slate-500 font-bold mt-0.5">
                  إجمالي البنود: {excelPreviewPayments.length} | المقبولة: <span className="text-emerald-700 font-black">{excelPreviewPayments.filter(p => p.isValid).length}</span> | غير المقبولة: <span className="text-rose-600 font-black">{excelPreviewPayments.filter(p => !p.isValid).length}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowExcelPreviewModal(false); setExcelPreviewPayments(null); }}
                className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 border border-slate-100 rounded-xl mb-4">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-black sticky top-0 border-b border-slate-100">
                  <tr>
                    <th className="p-2 border-l border-slate-100 text-center">الوحدة</th>
                    <th className="p-2 border-l border-slate-100">اسم الساكن</th>
                    <th className="p-2 border-l border-slate-100 text-center">المبلغ</th>
                    <th className="p-2 border-l border-slate-100 text-center">الشهر</th>
                    <th className="p-2 border-l border-slate-100 text-center">الإيصال</th>
                    <th className="p-2 border-l border-slate-100">نوع التحصيل</th>
                    <th className="p-2 border-l border-slate-100">الملاحظات</th>
                    <th className="p-2 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold">
                  {excelPreviewPayments.map((item, idx) => (
                    <tr key={idx} className={item.isValid ? 'hover:bg-emerald-50/30' : 'bg-rose-50/50 text-rose-900'}>
                      <td className="p-2 text-center font-black border-l border-slate-100">وحدة {item.flatNumber}</td>
                      <td className="p-2 border-l border-slate-100">{item.residentName}</td>
                      <td className="p-2 text-center font-black text-emerald-700 border-l border-slate-100">{item.amount.toLocaleString()} ج.م</td>
                      <td className="p-2 text-center border-l border-slate-100">{item.month} ({monthNamesArabic[parseInt(item.month, 10) - 1]})</td>
                      <td className="p-2 text-center font-mono border-l border-slate-100">{item.receiptNumber || '—'}</td>
                      <td className="p-2 border-l border-slate-100">{item.paymentType}</td>
                      <td className="p-2 border-l border-slate-100 truncate max-w-[120px]" title={item.notes}>{item.notes || '—'}</td>
                      <td className="p-2 text-center">
                        {item.isValid ? (
                          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-black">جاهز للاستيراد ✓</span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px] font-black" title={item.errorMessage}>⚠️ {item.errorMessage}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="text-xs font-black text-slate-800">
                إجمالي المبلغ المقبول: <span className="text-emerald-700 text-sm">{excelPreviewPayments.filter(p => p.isValid).reduce((sum, p) => sum + p.amount, 0).toLocaleString()} ج.م</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setShowExcelPreviewModal(false); setExcelPreviewPayments(null); }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExcelImport}
                  disabled={excelPreviewPayments.filter(p => p.isValid).length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تأكيد واستيراد ({excelPreviewPayments.filter(p => p.isValid).length}) عملية تحصيل</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unit Ownership, Occupancy & Activity History Modal */}
      <UnitHistoryModal
        isOpen={historyModalResident !== null}
        resident={historyModalResident}
        activityTypes={config?.activityTypes || ['سكني', 'تجاري', 'إداري', 'عيادة', 'تحت التشطيب', 'مغلقة', 'بدون تحصيل']}
        config={config}
        onClose={() => setHistoryModalResident(null)}
        onUpdateResident={(updatedResident) => {
          setHistoryModalResident(updatedResident);
          if (onEditResident) {
            onEditResident(updatedResident);
          }
        }}
      />
    </div>
  );
};
