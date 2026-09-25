import React, { useState, useRef, useMemo } from 'react';
import { Payment, Resident, UserRole, FloorConfig, AppConfig } from '../types';
import { Search, Plus, Calendar, FileText, Image as ImageIcon, Camera, Trash2, Edit, AlertCircle, Eye, User, LayoutGrid, List, Building, ArrowUpDown, Upload, X, ZoomIn, Download, RefreshCw, Share2, CheckCircle2, Receipt, Printer } from 'lucide-react';
import { deriveFloorConfigsFromResidents, getUnitNumbersForFloor, compareFlatNumbers, isSameFlatNumber } from '../utils/buildingStructure';
import { getResidentMonthlyFee, calculateResidentFinancials } from '../utils/financialCalculations';
import { generateElementImageBlob, GeneratedImageResult } from '../utils/imageExport';
import { shareImageViaWhatsApp } from '../utils/shareImageViaWhatsApp';
import { ShareReportModal } from './ShareReportModal';
import { ReceiptClaimModal, ReceiptClaimData } from './ReceiptClaimModal';
import { compressImageFile } from '../utils/imageCompressor';

interface PaymentsListProps {
  payments: Payment[];
  residents: Resident[];
  paymentTypes: string[];
  role: UserRole;
  currentYear: number;
  floorConfigs?: FloorConfig[];
  config?: AppConfig;
  onAdd: (payment: Payment, base64Image?: string) => void;
  onEdit: (payment: Payment, base64Image?: string) => void;
  onDelete: (id: string) => void;
  onPreviewImage: (url: string) => void;
}

export const PaymentsList: React.FC<PaymentsListProps> = ({
  payments,
  residents,
  paymentTypes,
  role,
  currentYear,
  floorConfigs,
  config,
  onAdd,
  onEdit,
  onDelete,
  onPreviewImage,
}) => {
  const [filterResident, setFilterResident] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterType, setFilterType] = useState('');
  const [onlyCurrentMonth, setOnlyCurrentMonth] = useState(true);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [receiptSort, setReceiptSort] = useState<'none' | 'desc' | 'asc'>('none');

  const actualCurrentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

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
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [confirmData, setConfirmData] = useState<{ type: 'add' | 'edit' | 'delete'; paymentData?: Payment; base64Image?: string; deleteId?: string } | null>(null);

  // Form states
  const [residentId, setResidentId] = useState('');
  const [month, setMonth] = useState(actualCurrentMonth);
  const [paymentType, setPaymentType] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'collected' | 'pending' | 'cancelled'>('collected');
  const [notes, setNotes] = useState('');
  const [imageName, setImageName] = useState('');
  const [base64Image, setBase64Image] = useState<string>('');
  const [existingFileUrl, setExistingFileUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const monthNamesArabic = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

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

  const filteredPayments = payments
    .filter((p) => p.year === currentYear)
    .filter((p) => (filterResident ? p.residentId === filterResident : true))
    .filter((p) => {
      if (onlyCurrentMonth) {
        return parseInt(p.month, 10) === parseInt(actualCurrentMonth, 10);
      }
      return filterMonth ? parseInt(p.month, 10) === parseInt(filterMonth, 10) : true;
    })
    .filter((p) => (filterType ? p.paymentType === filterType : true));

  const currentMonthPayments = useMemo(() => {
    return payments
      .filter((p) => p.year === currentYear)
      .filter((p) => parseInt(p.month, 10) === parseInt(actualCurrentMonth, 10))
      .filter((p) => (filterResident ? p.residentId === filterResident : true))
      .filter((p) => (filterType ? p.paymentType === filterType : true))
      .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber) || a.id.localeCompare(b.id));
  }, [payments, currentYear, actualCurrentMonth, filterResident, filterType]);

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

      const activeResidentObj = filterResident ? residents.find((r) => r.id === filterResident) : null;
      if (activeResidentObj) {
        periodLabel += `_وحدة_${activeResidentObj.flatNumber}`;
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `تقرير_تحصيلات_${periodLabel}_${dateStr}.png`;

      const result = await generateElementImageBlob('payments-monthly-printable-area', fileName);

      const totalAmt = sortedFilteredPayments.reduce((s, p) => s + p.amount, 0);
      const count = sortedFilteredPayments.length;
      const periodText = onlyCurrentMonth
        ? `تحصيلات شهر ${monthNamesArabic[parseInt(actualCurrentMonth, 10) - 1]} ${currentYear}`
        : filterMonth
        ? `تحصيلات شهر ${monthNamesArabic[parseInt(filterMonth, 10) - 1]} ${currentYear}`
        : `إجمالي تحصيلات السنة المالية ${currentYear}`;

      const statsText = `الإجمالي: ${totalAmt.toLocaleString()} ج.م | عدد العمليات: ${count}`;

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
    document.body.classList.remove('printing-statement', 'printing-debts');
    window.focus();

    try {
      window.print();
    } catch (err) {
      console.warn('Direct print failed, trying iframe print fallback:', err);
    }

    const elem = document.getElementById('payments-monthly-printable-area');
    if (elem) {
      let iframe = document.getElementById('print-iframe-payments') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe-payments';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
      }
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <title>طباعة تقرير التحصيلات</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; background: white; color: black; direction: rtl; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { border: 1px solid #334155; padding: 6px 8px; text-align: right; font-size: 12px; }
              th { background-color: #f1f5f9; font-weight: bold; }
            </style>
          </head>
          <body>
            ${elem.innerHTML}
          </body>
          </html>
        `);
        doc.close();
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        }, 400);
      }
    }
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

    const resActivity = res?.activityType || 'سكني';
    drawRow('رقم الوحدة:', `( الوحدة ${payment.flatNumber} - ${resActivity} )`);
    drawRow('اسم الساكن / الشاغل:', payment.residentName);
    if (res?.ownershipType === 'إيجار' && res?.tenantName) {
      drawRow('المستأجر الحالي:', res.tenantName);
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
          activityDefaultFees
        )
      : null;

    const carriedBalance = res?.initialBalance || 0;
    const oldDebtAmount = carriedBalance < 0 ? Math.abs(carriedBalance) : 0;
    const monthlyFee = financials ? financials.monthlyFee : (res?.monthlyFee || defaultMonthlyFee);
    const unpaidMonthsCount = financials ? financials.unpaidMonthsCount : 0;
    const unpaidMonthsDues = financials ? financials.unpaidMonthsDues : 0;
    const remainingBalance = financials ? financials.netBalance : 0;

    setReceiptModalData({
      type: 'receipt',
      unitNumber: payment.flatNumber,
      residentName: res?.name || payment.residentName,
      tenantName: res?.tenantName,
      phone: res?.phone,
      tenantPhone: res?.tenantPhone,
      amount: payment.amount,
      month: payment.month,
      year: payment.year,
      date: payment.date,
      receiptNumber: payment.receiptNumber,
      paymentType: payment.paymentType,
      activityType: res?.activityType || 'سكني',
      occupancyType: res?.ownershipType || 'تمليك',
      monthlyFee: monthlyFee,
      carriedBalance: carriedBalance,
      oldDebtAmount: oldDebtAmount,
      unpaidMonthsCount: unpaidMonthsCount,
      unpaidMonthsDues: unpaidMonthsDues,
      remainingBalance: remainingBalance,
      notes: payment.notes,
    });
  };

  const totalAmount = filteredPayments
    .filter(p => p.status !== 'cancelled' && p.status !== 'لاغي')
    .reduce((sum, p) => sum + p.amount, 0);

  const effectiveFloorConfigs = useMemo(() => {
    if (floorConfigs && floorConfigs.length > 0) {
      return floorConfigs;
    }
    if (residents && residents.length > 0) {
      return deriveFloorConfigsFromResidents(residents);
    }
    return [];
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
      const floorPayments = sortedFiltered.filter(p => unitNumbers.some(u => isSameFlatNumber(u, p.flatNumber)));
      floorPayments.forEach(p => assignedPaymentIds.add(p.id));
      if (floorPayments.length > 0) {
        groups.push({ floor, payments: floorPayments });
      }
    });

    const unassigned = sortedFiltered.filter(p => !assignedPaymentIds.has(p.id));
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

  const defaultMonthlyFee = config?.defaultMonthlyFee || 400;
  const activityDefaultFees = config?.activityDefaultFees;

  const handleResidentSelect = (newResidentId: string) => {
    setResidentId(newResidentId);
    if (!selectedPayment) {
      const selectedRes = residents.find(r => r.id === newResidentId);
      if (selectedRes) {
        const fee = getResidentMonthlyFee(selectedRes, defaultMonthlyFee, activityDefaultFees);
        setAmount(fee);
      }
    }
  };

  const handlePaymentTypeSelect = (newType: string) => {
    setPaymentType(newType);
    if (!selectedPayment) {
      const selectedRes = residents.find(r => r.id === residentId);
      if (selectedRes) {
        if (newType === 'اشتراك شهري' || newType.includes('اشتراك') || newType.includes('شهري')) {
          const fee = getResidentMonthlyFee(selectedRes, defaultMonthlyFee, activityDefaultFees);
          setAmount(fee);
        }
      }
    }
  };

  const openAddModal = () => {
    setSelectedPayment(null);
    const sortedRes = [...residents].sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
    const firstRes = sortedRes[0] || residents[0];
    const initialResId = firstRes?.id || '';
    const initialType = paymentTypes[0] || 'اشتراك شهري';
    const initialFee = firstRes ? getResidentMonthlyFee(firstRes, defaultMonthlyFee, activityDefaultFees) : '';

    setResidentId(initialResId);
    setMonth(String(new Date().getMonth() + 1).padStart(2, '0'));
    setPaymentType(initialType);
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
    setSelectedPayment(payment);
    setResidentId(payment.residentId);
    setMonth(payment.month);
    setPaymentType(payment.paymentType);
    setAmount(payment.amount);
    setReceiptNumber(payment.receiptNumber || '');
    setPaymentStatus((payment.status as any) || 'collected');
    setNotes(payment.notes || '');
    setImageName(payment.fileUrl || payment.fileId ? 'صورة إيصال مرفوعة مسبقاً' : '');
    setExistingFileUrl(payment.fileUrl || '');
    setBase64Image('');
    setError(null);
    setShowModal(true);
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
      const dataUrl = await compressImageFile(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.72 });
      setBase64Image(dataUrl);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        setBase64Image(reader.result as string);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numAmount = Number(amount);
    if (!residentId || !paymentType || !amount || isNaN(numAmount) || numAmount <= 0) {
      setError('يرجى ملء جميع الحقول المطلوبة (الساكن، نوع التحصيل، مبلغ صحيح وموجب).');
      return;
    }

    if (numAmount > 10000000) {
      setError('المبلغ المدخل كبير جداً، يرجى التأكد من كتابة المبلغ الصحيح.');
      return;
    }

    const resident = residents.find((r) => r.id === residentId);
    if (!resident) {
      setError('الساكن المختار غير موجود.');
      return;
    }

    const paymentData: Payment = {
      id: selectedPayment ? selectedPayment.id : `pay_${Date.now()}`,
      year: currentYear,
      month,
      residentId,
      residentName: resident.name,
      flatNumber: resident.flatNumber,
      paymentType,
      amount: numAmount,
      receiptNumber: (receiptNumber || '').trim(),
      notes: (notes || '').trim(),
      fileId: base64Image ? '' : (existingFileUrl ? (selectedPayment?.fileId || '') : ''),
      fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
      date: selectedPayment ? selectedPayment.date : new Date().toISOString().split('T')[0],
      isManuallyPaid: false,
      status: paymentStatus,
    };

    setConfirmData({
      type: selectedPayment ? 'edit' : 'add',
      paymentData,
      base64Image: base64Image || undefined
    });
  };

  const handleDelete = (id: string) => {
    setConfirmData({
      type: 'delete',
      deleteId: id
    });
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
              {residents
                .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    وحدة {r.flatNumber} - {r.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="relative flex-1 md:flex-none">
            <select
              value={onlyCurrentMonth ? actualCurrentMonth : filterMonth}
              onChange={(e) => {
                setFilterMonth(e.target.value);
                setOnlyCurrentMonth(false);
              }}
              className="w-full md:w-32 px-2.5 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/10 outline-none rtl:text-right cursor-pointer"
            >
              <option value="">كل الشهور</option>
              {monthNamesArabic.map((name, idx) => (
                <option key={idx} value={String(idx + 1).padStart(2, '0')}>
                  {name}
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
                <tr className="bg-slate-50 text-slate-400 font-extrabold text-[11px] border-b border-slate-100">
                  <th className="px-4 py-3 sticky right-0 bg-slate-50 shadow-xs z-10 border-l border-slate-100">الوحدة</th>
                  <th className="px-4 py-3">الساكن</th>
                  <th className="px-4 py-3">فئة الاشتراك</th>
                  <th className="px-4 py-3">الشهر</th>
                  <th className="px-4 py-3">المبلغ المستلم</th>
                  <th 
                    onClick={toggleReceiptSort}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition select-none"
                  >
                    <div className="flex items-center gap-1.5 justify-start">
                      <span>رقم الإيصال</span>
                      <ArrowUpDown className={`w-3.5 h-3.5 ${receiptSort !== 'none' ? 'text-blue-900 font-bold' : 'text-slate-400'}`} />
                      {receiptSort !== 'none' && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-md font-black">
                          {receiptSort === 'desc' ? 'تنازلي' : 'تصاعدي'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center">الإيصال الصادر</th>
                  <th className="px-4 py-3">الملاحظات</th>
                  {!isReadOnly && role !== 'ASSISTANT' && <th className="px-4 py-3 text-center">الإجراءات</th>}
                </tr>
              </thead>
               <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={!isReadOnly && role !== 'ASSISTANT' ? 9 : 8} className="px-4 py-10 text-center text-slate-400 font-bold">
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
                    return (
                      <tr 
                        key={p.id} 
                        onClick={() => setSelectedItemId(isSelected ? null : p.id)}
                        className={`group transition cursor-pointer ${
                          isSelected 
                            ? 'bg-yellow-50/90 border-y border-yellow-400' 
                            : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <td className={`px-4 py-3 sticky right-0 z-5 border-l border-slate-100 shadow-xs transition ${
                          isSelected 
                            ? 'bg-yellow-50 text-amber-950' 
                            : 'bg-white group-hover:bg-slate-50'
                        }`}>
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-black">
                            وحدة {p.flatNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-900">{p.residentName}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 border border-slate-100 bg-slate-50 text-slate-600 rounded text-[10px]">
                            {p.paymentType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-semibold">
                          {monthNamesArabic[parseInt(p.month) - 1]} {p.year}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className={`text-xs font-black ${
                              p.status === 'cancelled' ? 'line-through text-rose-500' : p.status === 'pending' ? 'text-amber-600' : 'text-emerald-600'
                            }`}>
                              {Math.round(p.amount)} ج.م
                            </span>
                            {p.status === 'pending' && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-black w-fit mt-0.5">
                                ⏳ لم يتم التحصيل
                              </span>
                            )}
                            {p.status === 'cancelled' && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[9px] font-black w-fit mt-0.5">
                                🚫 لاغي
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono">{p.receiptNumber || 'بدون إيصال'}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleGenerateSinglePaymentReceipt(p); }}
                              className="p-1 px-1.5 text-emerald-800 hover:bg-emerald-100 rounded-lg transition inline-flex items-center gap-1 text-[10px] cursor-pointer font-black border border-emerald-200 bg-emerald-50/70"
                              title="توليد صورة إيصال سداد ومشاركتها مباشرة لواتساب الوحدة"
                            >
                              <Share2 className="w-3 h-3 text-emerald-600" />
                              <span>توليد صورة إيصال</span>
                            </button>
                            {p.fileUrl && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onPreviewImage(p.fileUrl!); }}
                                className="p-1 px-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition inline-flex items-center gap-1 text-[10px] cursor-pointer font-bold border border-blue-100"
                                title="معاينة المرفق"
                              >
                                <Eye className="w-3 h-3" />
                                <span>المرفق</span>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-semibold text-xs max-w-[180px] truncate" title={p.notes || ''}>
                          {p.notes || '—'}
                        </td>
                        {!isReadOnly && role !== 'ASSISTANT' && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditModal(p); }}
                                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded transition"
                                title="تعديل"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                                title="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  /* Grouped by Floor (Default) */
                  floorPaymentGroups.map((group) => (
                    <React.Fragment key={group.floor.id}>
                      {/* Floor Separator Row */}
                      <tr className="bg-slate-100/90 border-y border-slate-200">
                        <td colSpan={!isReadOnly && role !== 'ASSISTANT' ? 9 : 8} className="py-2.5 px-4 text-right border-r-4 border-r-blue-800 sticky right-0 z-5 bg-slate-100/95 shadow-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <Building className="w-5 h-5 text-blue-900" />
                              <span className="text-xs sm:text-sm font-black text-slate-900">
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
                        </td>
                      </tr>

                      {group.payments.map((p) => {
                        const isSelected = selectedItemId === p.id;
                        return (
                          <tr 
                            key={p.id} 
                            onClick={() => setSelectedItemId(isSelected ? null : p.id)}
                            className={`group transition cursor-pointer ${
                              isSelected 
                                ? 'bg-yellow-50/90 border-y border-yellow-400' 
                                : 'hover:bg-slate-50/50'
                            }`}
                          >
                            <td className={`px-4 py-3 sticky right-0 z-5 border-l border-slate-100 shadow-xs transition ${
                              isSelected 
                                ? 'bg-yellow-50 text-amber-950' 
                                : 'bg-white group-hover:bg-slate-50'
                            }`}>
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-black">
                                وحدة {p.flatNumber}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-900">{p.residentName}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 border border-slate-100 bg-slate-50 text-slate-600 rounded text-[10px]">
                                {p.paymentType}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500 font-semibold">
                              {monthNamesArabic[parseInt(p.month) - 1]} {p.year}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className={`text-xs font-black ${
                                  p.status === 'cancelled' ? 'line-through text-rose-500' : p.status === 'pending' ? 'text-amber-600' : 'text-emerald-600'
                                }`}>
                                  {Math.round(p.amount)} ج.م
                                </span>
                                {p.status === 'pending' && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-black w-fit mt-0.5">
                                    ⏳ لم يتم التحصيل
                                  </span>
                                )}
                                {p.status === 'cancelled' && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[9px] font-black w-fit mt-0.5">
                                    🚫 لاغي
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-500 font-mono">{p.receiptNumber || 'بدون إيصال'}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleGenerateSinglePaymentReceipt(p); }}
                                  className="p-1 px-1.5 text-emerald-800 hover:bg-emerald-100 rounded-lg transition inline-flex items-center gap-1 text-[10px] cursor-pointer font-black border border-emerald-200 bg-emerald-50/70"
                                  title="توليد صورة إيصال سداد ومشاركتها مباشرة لواتساب الوحدة"
                                >
                                  <Share2 className="w-3 h-3 text-emerald-600" />
                                  <span>توليد صورة إيصال</span>
                                </button>
                                {p.fileUrl && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onPreviewImage(p.fileUrl!); }}
                                    className="p-1 px-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition inline-flex items-center gap-1 text-[10px] cursor-pointer font-bold border border-blue-100"
                                    title="معاينة المرفق"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>المرفق</span>
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-500 font-semibold text-xs max-w-[180px] truncate" title={p.notes || ''}>
                              {p.notes || '—'}
                            </td>
                            {!isReadOnly && role !== 'ASSISTANT' && (
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEditModal(p); }}
                                    className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded transition"
                                    title="تعديل"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                                    title="حذف"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
                {filteredPayments.length > 0 && (
                  <tr className="bg-emerald-50/90 border-t-2 border-emerald-200 font-extrabold text-slate-900">
                    <td colSpan={4} className="px-4 py-3.5 text-right font-black text-emerald-950 text-xs sm:text-sm sticky right-0 z-5 bg-emerald-50/95 shadow-xs border-l border-slate-100">
                      إجمالي التحصيلات الكلي:
                    </td>
                    <td className="px-4 py-3.5 text-emerald-700 text-sm font-black whitespace-nowrap">
                      {Math.round(totalAmount)} ج.م
                    </td>
                    <td colSpan={!isReadOnly && role !== 'ASSISTANT' ? 4 : 3} className="px-4 py-3.5"></td>
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
                    return (
                      <div 
                        key={p.id} 
                        onClick={() => setSelectedItemId(isSelected ? null : p.id)}
                        className={`rounded-2xl px-3.5 py-2.5 border shadow-sm flex flex-col justify-between transition duration-200 cursor-pointer ${
                          isSelected 
                            ? 'bg-yellow-50/90 border-yellow-400 shadow-md ring-2 ring-yellow-400/20' 
                            : 'bg-white border-slate-100 hover:border-blue-100'
                        }`}
                      >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black">
                            وحدة {p.flatNumber}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-100 rounded-md text-[10px] font-extrabold">
                            {p.paymentType}
                          </span>
                        </div>
                        <h4 className="text-xs font-black text-slate-900 mb-1">{p.residentName}</h4>
                        <div className="text-[11px] text-slate-500 font-bold mb-2">
                          شهر: {monthNamesArabic[parseInt(p.month) - 1]} {p.year}
                        </div>
                        
                        <div className="flex items-center justify-between border-t border-slate-50 pt-2 mb-2">
                          <span className="text-[11px] text-slate-400 font-bold">المبلغ المستلم</span>
                          <div className="text-left">
                            <span className={`text-sm font-black ${
                              p.status === 'cancelled' ? 'line-through text-rose-500' : p.status === 'pending' ? 'text-amber-600' : 'text-emerald-600'
                            }`}>
                              {Math.round(p.amount)} ج.م
                            </span>
                            {p.status === 'pending' && (
                              <span className="block text-[9.5px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded mt-0.5">
                                ⏳ لم يتم التحصيل
                              </span>
                            )}
                            {p.status === 'cancelled' && (
                              <span className="block text-[9.5px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded mt-0.5">
                                🚫 إيصال لاغي
                              </span>
                            )}
                          </div>
                        </div>

                        {p.receiptNumber && (
                          <div className="text-[10px] text-slate-400 font-semibold mb-1">
                            رقم الإيصال: <span className="font-mono text-slate-600">{p.receiptNumber}</span>
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
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 rounded-lg text-[10px] font-black transition cursor-pointer"
                          title="توليد صورة إيصال سداد ومشاركتها مباشرة لواتساب الوحدة"
                        >
                          <Share2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>توليد صورة إيصال</span>
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

                        {!isReadOnly && role !== 'ASSISTANT' && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditModal(p); }}
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-100 rounded-lg transition cursor-pointer"
                              title="تعديل"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-55 rounded-lg transition cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-slate-100 shadow-2xl animate-scale-up text-right">
            <h3 className="text-lg font-extrabold text-slate-950 border-b pb-3 mb-5">
              {selectedPayment ? (role === 'ASSISTANT' ? 'تعديل ملاحظات التحصيل' : 'تعديل التحصيل') : 'إضافة تحصيل جديد'}
            </h3>

            {role === 'ASSISTANT' && selectedPayment && (
              <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-3 rounded-xl mb-4 font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-blue-600" />
                <span>صلاحية المساعد الفني تتيح لك التعديل في "خانة الملاحظات" فقط.</span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-xs p-4 rounded-xl mb-4 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">الساكن / الوحدة <span className="text-red-500">*</span></label>
                <select
                  value={residentId}
                  onChange={(e) => handleResidentSelect(e.target.value)}
                  disabled={role === 'ASSISTANT' && !!selectedPayment}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:bg-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-medium transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  required
                >
                  {residents
                    .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        وحدة {r.flatNumber} - {r.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">الشهر المستهدف</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:bg-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-medium transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {monthNamesArabic.map((name, idx) => (
                      <option key={idx} value={String(idx + 1).padStart(2, '0')}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">نوع التحصيل <span className="text-red-500">*</span></label>
                  <select
                    value={paymentType}
                    onChange={(e) => handlePaymentTypeSelect(e.target.value)}
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:bg-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-medium transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {paymentTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">المبلغ المستلم بالجنيه <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    placeholder="مثال: 200"
                    value={amount === '' || isNaN(Number(amount)) ? '' : amount}
                    onChange={(e) => setAmount(e.target.value !== '' ? Number(e.target.value) : '')}
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:bg-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">رقم الإيصال</label>
                  <input
                    type="text"
                    placeholder="مثال: 4501"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:bg-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* 3 Buttons for Payment/Receipt Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">حالة السداد / الإيصال</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentStatus('collected')}
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
                    className={`py-2 px-1 sm:px-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                      paymentStatus === 'collected'
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-600/30'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تم التحصيل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentStatus('pending')}
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
                    className={`py-2 px-1 sm:px-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                      paymentStatus === 'pending'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs ring-2 ring-amber-500/30'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>لم يتم التحصيل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentStatus('cancelled')}
                    disabled={role === 'ASSISTANT' && !!selectedPayment}
                    className={`py-2 px-1 sm:px-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                      paymentStatus === 'cancelled'
                        ? 'bg-rose-700 text-white border-rose-700 shadow-xs ring-2 ring-rose-600/30'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>لاغي</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-blue-900 flex items-center justify-between">
                  <span>ملاحظات {role === 'ASSISTANT' && selectedPayment && <span className="text-emerald-700 font-extrabold">(مسموح للتعديل)</span>}</span>
                </label>
                <input
                  type="text"
                  placeholder="ملاحظات (مثال: تم الاستلام نقداً)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-3 bg-white border-2 border-blue-200 focus:border-blue-600 rounded-xl text-sm outline-none text-right font-medium transition"
                />
              </div>

              {/* Receipt Image Upload & Interactive Preview */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-900" />
                    <span>صورة الإيصال أو سند التحصيل</span>
                  </label>
                  {(base64Image || existingFileUrl) && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 font-black px-2 py-0.5 rounded-md border border-emerald-200/60">
                      {base64Image ? 'صورة جديدة جاهزة للحفظ' : 'صورة محفوظة مسبقاً'}
                    </span>
                  )}
                </div>

                {/* If an image is selected or exists */}
                {(base64Image || existingFileUrl) ? (
                  <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-2.5 flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      {/* Image Thumbnail with zoom overlay */}
                      <div 
                        onClick={() => onPreviewImage(base64Image || existingFileUrl)}
                        className="relative w-14 h-14 rounded-xl overflow-hidden border border-slate-200 cursor-pointer shadow-2xs shrink-0 group bg-slate-200 flex items-center justify-center"
                        title="انقر لمشاهدة تفاصيل الصورة بالحجم الكامل"
                      >
                        <img 
                          src={base64Image || existingFileUrl} 
                          alt="صورة الإيصال" 
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                        />
                        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                          <Eye className="w-4 h-4" />
                        </div>
                      </div>

                      <div className="space-y-1 text-right min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">
                          {imageName || (base64Image ? 'صورة إيصال جديدة' : 'صورة الإيصال المسجلة')}
                        </p>
                        <button
                          type="button"
                          onClick={() => onPreviewImage(base64Image || existingFileUrl)}
                          className="text-[10.5px] text-blue-900 hover:text-blue-950 font-black flex items-center gap-1 cursor-pointer bg-blue-50/80 px-2 py-0.5 rounded-md border border-blue-100/60 w-fit"
                        >
                          <Eye className="w-3 h-3 text-blue-700" />
                          <span>معاينة الصورة كاملة</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => triggerFileSelection(false)}
                        className="px-2 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-black transition cursor-pointer shadow-2xs"
                        title="تغيير الصورة"
                      >
                        تغيير
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-lg transition cursor-pointer shadow-2xs"
                        title="حذف الصورة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* No image selected: Choice between Camera and File Upload */
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => triggerFileSelection(true)}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-50/80 hover:bg-blue-100 text-blue-900 border border-blue-200/70 rounded-xl text-xs font-black transition cursor-pointer active:scale-[0.98]"
                    >
                      <Camera className="w-4 h-4 text-blue-800" />
                      <span>التقاط صورة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerFileSelection(false)}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-black transition cursor-pointer active:scale-[0.98]"
                    >
                      <Upload className="w-4 h-4 text-slate-500" />
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

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-50 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg text-sm font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-900 text-white rounded-lg text-sm font-bold hover:bg-blue-950 active:scale-[0.98] transition shadow-md shadow-blue-900/10"
                >
                  {selectedPayment ? 'حفظ التعديلات' : 'إضافة'}
                </button>
              </div>
            </form>
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
              {confirmData.type === 'delete' ? 'تأكيد عملية الحذف' : 'تأكيد حفظ البيانات والعمليات'}
            </h3>
            <p className="text-[11px] text-slate-600 text-center font-bold leading-relaxed mb-4">
              {confirmData.type === 'delete' 
                ? 'هل أنت متأكد من حذف هذه العملية؟ سيؤدي هذا إلى مسح سجل التحصيل المحدد بالكامل ولا يمكن التراجع عن هذا الإجراء.'
                : confirmData.type === 'edit'
                ? `هل تود حفظ التعديلات الجديدة على عملية التحصيل الخاصة بالوحدة ${confirmData.paymentData?.flatNumber} بمبلغ ${confirmData.paymentData?.amount} ج.م؟`
                : `أنت على وشك إضافة عملية تحصيل جديدة للوحدة ${confirmData.paymentData?.flatNumber} بمبلغ ${confirmData.paymentData?.amount} ج.م. هل تود التأكيد؟`}
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
                  if (confirmData.type === 'delete' && confirmData.deleteId) {
                    onDelete(confirmData.deleteId);
                  } else if (confirmData.paymentData) {
                    if (confirmData.type === 'edit') {
                      onEdit(confirmData.paymentData, confirmData.base64Image);
                    } else {
                      onAdd(confirmData.paymentData, confirmData.base64Image);
                    }
                    setShowModal(false);
                  }
                  setConfirmData(null);
                }}
                className={`flex-1 py-2 text-[10px] font-bold text-white rounded-lg transition ${confirmData.type === 'delete' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-900 hover:bg-blue-950'}`}
              >
                {confirmData.type === 'delete' ? 'نعم، حذف' : 'نعم، حفظ وتأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Monthly Payments Printable Report Area */}
      <div
        id="payments-monthly-printable-area"
        className="printable-area hidden print:block text-right p-6 font-sans bg-white text-slate-900"
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
          {(filterResident || filterType || !onlyCurrentMonth || receiptSort !== 'none') && (
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
              {receiptSort !== 'none' && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                  ترتيب أرقام الإيصالات: {receiptSort === 'asc' ? 'تصاعدي' : 'تنازلي'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Stats Summary Bar */}
        <div className="grid grid-cols-3 gap-4 border border-slate-300 rounded-xl p-4 bg-slate-50 mb-6 text-xs">
          <div className="text-center space-y-1">
            <span className="font-extrabold text-slate-500">إجمالي المبلغ المحصل</span>
            <div className="text-base font-black text-emerald-700">
              {sortedFilteredPayments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()} ج.م
            </div>
          </div>
          <div className="text-center space-y-1 border-x border-slate-300">
            <span className="font-extrabold text-slate-500">عدد عمليات التحصيل</span>
            <div className="text-base font-black text-slate-800">{sortedFilteredPayments.length} إيصال</div>
          </div>
          <div className="text-center space-y-1">
            <span className="font-extrabold text-slate-500">متوسط قيمة التحصيل</span>
            <div className="text-base font-black text-blue-900">
              {sortedFilteredPayments.length > 0
                ? Math.round(sortedFilteredPayments.reduce((sum, p) => sum + p.amount, 0) / sortedFilteredPayments.length).toLocaleString()
                : 0}{' '}
              ج.م
            </div>
          </div>
        </div>

        {/* Payments Table */}
        <table className="w-full text-right border-collapse text-xs border border-slate-300">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-300">
              <th className="border border-slate-300 p-2 text-center w-12">#</th>
              <th className="border border-slate-300 p-2 text-center">الوحدة</th>
              <th className="border border-slate-300 p-2">اسم الساكن</th>
              <th className="border border-slate-300 p-2 text-center">فئة الاشتراك</th>
              <th className="border border-slate-300 p-2 text-center">شهر الاشتراك</th>
              <th className="border border-slate-300 p-2 text-center">تاريخ التحصيل</th>
              <th className="border border-slate-300 p-2 text-center">المبلغ المستلم</th>
              <th className="border border-slate-300 p-2 text-center">رقم الإيصال</th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredPayments.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center p-6 text-slate-400 font-bold">
                  لا توجد عمليات تحصيل مسجلة تطابق هذه الشروط المحددة.
                </td>
              </tr>
            ) : (
              sortedFilteredPayments.map((p, idx) => (
                <tr key={p.id} className="border-b border-slate-200">
                  <td className="border border-slate-300 p-2 text-center font-bold text-slate-500">{idx + 1}</td>
                  <td className="border border-slate-300 p-2 text-center font-black">وحدة {p.flatNumber}</td>
                  <td className="border border-slate-300 p-2 font-bold text-slate-900">{p.residentName}</td>
                  <td className="border border-slate-300 p-2 text-center text-slate-700">{p.paymentType}</td>
                  <td className="border border-slate-300 p-2 text-center text-slate-600 font-semibold">
                    {monthNamesArabic[parseInt(p.month, 10) - 1] || p.month} {p.year}
                  </td>
                  <td className="border border-slate-300 p-2 text-center text-slate-600">{p.date || p.month}</td>
                  <td className="border border-slate-300 p-2 text-center font-black text-emerald-700">
                    {Math.round(p.amount).toLocaleString()} ج.م
                  </td>
                  <td className="border border-slate-300 p-2 text-center font-mono text-slate-700 font-bold">
                    {p.receiptNumber ? `#${p.receiptNumber}` : 'مسدد'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {sortedFilteredPayments.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-800">
                <td colSpan={6} className="border border-slate-300 p-2.5 text-left pl-4 font-black">
                  إجمالي التحصيلات المقبوضة:
                </td>
                <td className="border border-slate-300 p-2.5 text-center text-emerald-800 text-sm font-black">
                  {sortedFilteredPayments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()} ج.م
                </td>
                <td className="border border-slate-300 p-2.5"></td>
              </tr>
            </tfoot>
          )}
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
        onSuccessToast={(msg) => {
          setToastMsg(msg);
          setTimeout(() => setToastMsg(null), 8000);
        }}
      />
    </div>
  );
};
