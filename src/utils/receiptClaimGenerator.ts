import { ReceiptClaimData } from '../components/ReceiptClaimModal';
import { Resident } from '../types';
import { getHistoricalOccupantForDate } from './buildingStructure';
import { 
  formatMobileNumber, 
  formatPhoneForDisplay, 
  formatFullOccupantDescription,
  getOccupantStructuredInfo,
  OccupantStructuredInfo 
} from './phoneUtils';

export const monthNamesArabic = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

/**
 * Returns formatted metadata for receipt or claim notice
 */
export function getReceiptClaimMetadata(data: ReceiptClaimData, residents: Resident[] = []) {
  const isReceipt = data.type === 'receipt';
  const monthIndex = typeof data.month === 'number' ? data.month - 1 : parseInt(String(data.month), 10) - 1;
  const monthName = monthNamesArabic[monthIndex] || String(data.month);

  const docNumber = (() => {
    if (isReceipt && data.receiptNumber) return data.receiptNumber;
    if (!isReceipt && data.claimNumber) return data.claimNumber;
    const prefix = isReceipt ? 'REC' : 'CLM';
    const mPadded = String(data.month).padStart(2, '0');
    return `${prefix}-${data.unitNumber}-${mPadded}${data.year}`;
  })();

  const displayFormattedDate = (() => {
    if (data.date) {
      const parts = data.date.split('-');
      if (parts.length === 3) {
        const y = parts[0];
        const mIdx = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (mIdx >= 0 && mIdx < 12) {
          return `${d} ${monthNamesArabic[mIdx]} ${y}`;
        }
      }
      return data.date;
    }
    const mIdx = (typeof data.month === 'number' ? data.month : parseInt(String(data.month), 10)) - 1;
    const monthStr = (mIdx >= 0 && mIdx < 12) ? monthNamesArabic[mIdx] : data.month;
    return `21 ${monthStr} ${data.year}`;
  })();

  const residentRecord = residents.find(r => String(r.flatNumber) === String(data.unitNumber)) || null;
  const historicalOccupant = residentRecord ? getHistoricalOccupantForDate(residentRecord, `${data.year}-${data.month}`) : null;
  const resolvedOwnerName = historicalOccupant?.ownerName || data.residentName;
  const resolvedOwnerPhone = historicalOccupant?.ownerPhone || data.phone;
  const resolvedTenantName = historicalOccupant?.tenantName !== undefined ? historicalOccupant.tenantName : data.tenantName;
  const resolvedTenantPhone = historicalOccupant?.tenantPhone || data.tenantPhone;

  const rawPhone = resolvedOwnerPhone || data.phone || residentRecord?.phone || '';
  const formattedPhone = rawPhone ? formatMobileNumber(rawPhone) : '';

  const activityType = data.activityType || residentRecord?.activityType || 'سكني';
  const occupancyType = data.occupancyType || residentRecord?.ownershipType || 'تمليك';
  const displayMonthlyFee = data.monthlyFee || residentRecord?.monthlyFee || (activityType === 'إداري' ? 800 : activityType === 'تحت التشطيب' ? 200 : 400);

  const carriedDebt = (() => {
    if (data.oldDebtAmount !== undefined && data.oldDebtAmount > 0) return data.oldDebtAmount;
    if (data.carriedBalance !== undefined && data.carriedBalance < 0) return Math.abs(data.carriedBalance);
    if (data.carriedBalance !== undefined && data.carriedBalance > 0) return 0;
    if (residentRecord?.initialBalance !== undefined && residentRecord.initialBalance < 0) return Math.abs(residentRecord.initialBalance);
    return 0;
  })();

  const showCarriedDebt = carriedDebt > 0;

  const occupantInfo = getOccupantStructuredInfo(
    {
      residentName: resolvedOwnerName,
      tenantName: resolvedTenantName,
      phone: resolvedOwnerPhone,
      tenantPhone: resolvedTenantPhone,
      occupancyType: occupancyType,
      unitNumber: data.unitNumber,
      period: `${data.year}-${data.month}`,
      year: data.year,
      month: data.month
    },
    residentRecord
  );

  const unpaidMonthsCount = data.unpaidMonthsCount !== undefined
    ? data.unpaidMonthsCount
    : (data.amount && displayMonthlyFee ? Math.max(1, Math.round(data.amount / displayMonthlyFee)) : 1);

  const unpaidMonthsDues = data.unpaidMonthsDues !== undefined
    ? data.unpaidMonthsDues
    : (unpaidMonthsCount * displayMonthlyFee);

  const currentMonthStatus = data.currentMonthStatus || (isReceipt ? 'مسدد ✓' : 'غير مسدد ⚠️');

  const paymentCategory = data.paymentType || 'تحصيلات شهرية';
  const paymentDescription = isReceipt
    ? `مبلغ مسدد (${paymentCategory}) - عن شهر ${monthName} ${data.year}`
    : `مطالبة (${paymentCategory}) - عن شهر ${monthName} ${data.year}`;

  const oldCarriedDebts = carriedDebt;
  const currentArrears = unpaidMonthsDues;
  const totalUnitDebt = oldCarriedDebts + currentArrears;

  const claimBreakdown = data.claimBreakdown || {
    targetYear: Number(data.year) || 2026,
    targetMonth: typeof data.month === 'number' ? data.month : parseInt(String(data.month), 10) || 1,
    monthName,
    unitNumber: data.unitNumber,
    currentMonthFee: displayMonthlyFee,
    currentMonthSubsPaid: isReceipt ? data.amount : 0,
    currentMonthSubsStatusText: isReceipt ? 'مسدد بالكامل ✓' : 'غير مسدد ⚠️',
    isCurrentMonthSubsPaid: isReceipt,
    subsLineText: isReceipt
      ? `اشتراك شهري: ${Math.round(displayMonthlyFee).toLocaleString()} ج.م • المسدد: ${Math.round(data.amount || displayMonthlyFee).toLocaleString()} ج.م .`
      : `اشتراك شهري: ${Math.round(displayMonthlyFee).toLocaleString()} ج.م • المسدد: 0 ج.م - (غير مسدد ⚠️) .`,
    currentMonthOtherFee: 0,
    currentMonthOtherPaid: 0,
    currentMonthOtherStatusText: 'مسدد بالكامل ✓',
    isCurrentMonthOtherPaid: true,
    currentMonthOtherDue: 0,
    otherLineText: `تحصيلات اخري: لا توجد تحصيلات أخرى .`,
    priorSubsDue: isReceipt ? (data.amount || displayMonthlyFee) : displayMonthlyFee,
    priorSubsPaid: isReceipt ? (data.amount || displayMonthlyFee) : 0,
    priorSubsDiff: isReceipt ? 0 : unpaidMonthsDues,
    priorSubsDiffType: (isReceipt ? 'zero' : 'arrears') as 'zero' | 'arrears' | 'surplus',
    priorSubsStatusText: isReceipt ? 'لا توجد متأخرات (0 ج.م)' : (unpaidMonthsDues > 0 ? `متأخرات اشتراك شهري بقيمة (${unpaidMonthsDues.toLocaleString()} ج.م)` : 'لا توجد متأخرات (0 ج.م)'),
    priorOtherDue: 0,
    priorOtherPaid: 0,
    priorOtherDiff: 0,
    priorOtherDiffType: 'zero' as 'zero' | 'arrears' | 'surplus',
    priorOtherStatusText: 'لا توجد متأخرات (0 ج.م)',
    monthlyDelayedMonthsCount: unpaidMonthsCount,
    monthlyDelayedAmount: unpaidMonthsDues,
    monthlyArrearsLineText: unpaidMonthsCount > 0 ? `متأخرات اشتراك شهري - تأخير ${unpaidMonthsCount} شهور بقيمة (${Math.round(unpaidMonthsDues).toLocaleString()} ج.م) .` : `متأخرات اشتراك شهري - لا يوجد تأخير (0 ج.م) .`,
    otherDelayedMonthsCount: 0,
    otherDelayedAmount: 0,
    otherArrearsLineText: `متأخرات تحصيلات اخري - لا توجد متأخرات (0 ج.م) .`,
    previousDebtAmount: carriedDebt,
    previousSurplusAmount: 0,
    previousDebtLineText: `مديونيات سابقة - بقيمة (${Math.round(carriedDebt).toLocaleString()} ج.م) .`,
    totalDueForPayment: isReceipt ? data.amount : (unpaidMonthsDues + carriedDebt),
    totalDueLineText: `اجمالي المبالغ المستحقه للسداد : ${Math.round(isReceipt ? data.amount : (unpaidMonthsDues + carriedDebt)).toLocaleString()} ج. م  (المبالغ المستحقة عن الشهر الحالي + المتأخرات + المديونيات)`,
    currentMonthTotalDue: isReceipt ? 0 : displayMonthlyFee,
    totalArrearsAndDebts: unpaidMonthsDues + carriedDebt
  };

  return {
    isReceipt,
    monthName,
    docNumber,
    displayFormattedDate,
    residentRecord,
    formattedPhone,
    occupantInfo,
    occupantDisplay: occupantInfo.singleLine,
    activityType,
    occupancyType,
    displayMonthlyFee,
    carriedDebt,
    showCarriedDebt,
    unpaidMonthsCount,
    unpaidMonthsDues,
    currentMonthStatus,
    paymentCategory,
    paymentDescription,
    oldCarriedDebts,
    currentArrears,
    totalUnitDebt,
    claimBreakdown,
  };
}

/**
 * Ultra-Fast Canvas 2D Generator for Receipt & Claim Notices.
 * Takes 3-8 milliseconds, produces crisp 2x Retina PNG without any DOM cloning or CSS scanning.
 */
export function generateReceiptClaimCanvas(
  data: ReceiptClaimData,
  residents: Resident[] = [],
  customWidth: number = 720
): HTMLCanvasElement {
  const meta = getReceiptClaimMetadata(data, residents);
  const {
    isReceipt,
    monthName,
    docNumber,
    displayFormattedDate,
    occupantDisplay,
    activityType,
    occupancyType,
    displayMonthlyFee,
    carriedDebt,
    showCarriedDebt
  } = meta;

  const hasTenant = meta.occupantInfo.hasTenant;
  const occupantExtraHeight = hasTenant ? 24 : 0;
  const height = 980 + occupantExtraHeight;

  const canvas = document.createElement('canvas');
  const dpr = 2; // High-resolution Retina
  const width = customWidth;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(dpr, dpr);

  // Helper for drawing rounded rectangles with fallback
  const drawRoundRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill?: string,
    stroke?: string,
    lineWidth: number = 1
  ) => {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  };

  // Font helper
  const fontFamily = 'Cairo, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // 1. Base Canvas Background & Card Frame
  drawRoundRect(0, 0, width, height, 24, '#ffffff', '#e2e8f0', 1.5);

  const padding = 22;
  const contentWidth = width - padding * 2;
  let currentY = padding;
  const periodName = data.periodName || 'الفترة المحاسبية النشطة';

  // 2. Header Banner
  const bannerHeight = 84;
  const bannerBg = isReceipt ? '#047857' : '#1d4ed8';
  drawRoundRect(padding, currentY, contentWidth, bannerHeight, 16, bannerBg);

  // Right side: Title & Union name
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 15px ${fontFamily}`;
  const titleText = isReceipt 
    ? `💐 إيصال سداد: مبلغ مسدد (${meta.paymentCategory}) - عن شهر ${monthName} ${data.year}` 
    : `🏛️ إشعار مطالبة وبيان مستحقات (${meta.paymentCategory})`;
  ctx.fillText(titleText, width - padding - 18, currentY + 35);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 12px ${fontFamily}`;
  ctx.globalAlpha = 0.92;
  ctx.fillText('اتحاد ملاك عمارة بيراميدز فيو ١', width - padding - 18, currentY + 62);
  ctx.globalAlpha = 1.0;

  // Left side: Date & Reference Number
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 11px ${fontFamily}`;
  ctx.fillText(`التاريخ: ${displayFormattedDate}`, padding + 18, currentY + 34);
  ctx.fillText(`المرجع: ${docNumber}`, padding + 18, currentY + 60);

  currentY += bannerHeight + 14;

  const isCurrentMonthPaid = data.currentMonthStatus 
    ? (data.currentMonthStatus.includes('مسدد') && !data.currentMonthStatus.includes('غير'))
    : isReceipt;

  // 3. Status Alert Bar
  const alertHeight = 40;
  const alertBg = isReceipt || isCurrentMonthPaid ? '#ecfdf5' : '#fffbeb';
  const alertBorder = isReceipt || isCurrentMonthPaid ? '#a7f3d0' : '#fde68a';
  const alertColor = isReceipt || isCurrentMonthPaid ? '#047857' : '#92400e';
  drawRoundRect(padding, currentY, contentWidth, alertHeight, 14, alertBg, alertBorder, 1);

  // Status message
  ctx.textAlign = 'right';
  ctx.fillStyle = alertColor;
  ctx.font = `bold 12px ${fontFamily}`;
  const alertMsg = isReceipt
    ? `✓ تم استلام ${meta.paymentDescription} بنجاح وتوثيقه في السجل المالي`
    : isCurrentMonthPaid
    ? `✓ حالة سداد الشهر الحالي: اشتراك شهر ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م) مسدد بالكامل`
    : `⚠️ تنويه هام: اشتراك شهر ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م) غير مسدد حتى تاريخه`;
  ctx.fillText(alertMsg, width - padding - 16, currentY + 25);

  // Status Badge Pill on left
  const badgeW = isReceipt || isCurrentMonthPaid ? 96 : 98;
  const badgeH = 26;
  const badgeX = padding + 14;
  const badgeY = currentY + 7;
  const badgeBg = isReceipt || isCurrentMonthPaid ? '#d1fae5' : '#fef3c7';
  drawRoundRect(badgeX, badgeY, badgeW, badgeH, 13, badgeBg);

  ctx.textAlign = 'center';
  ctx.fillStyle = isReceipt || isCurrentMonthPaid ? '#047857' : '#92400e';
  ctx.font = `bold 11.5px ${fontFamily}`;
  ctx.fillText(isReceipt || isCurrentMonthPaid ? 'مسدد بالكامل ✓' : '⏳ غير مسدد', badgeX + badgeW / 2, badgeY + 17);

  currentY += alertHeight + 14;

  // 4. Structured Table
  const baseRowHeight = 38;
  const row0Height = hasTenant ? (baseRowHeight + 22) : baseRowHeight;
  const rowCount = isReceipt ? 4 : 3;
  const tableHeight = (rowCount - 1) * baseRowHeight + row0Height;
  drawRoundRect(padding, currentY, contentWidth, tableHeight, 16, '#f8fafc', '#e2e8f0', 1);

  const colMid = padding + contentWidth / 2;

  const getRowY = (rIdx: number) => {
    if (rIdx === 0) return currentY;
    return currentY + row0Height + (rIdx - 1) * baseRowHeight;
  };

  // Draw Row 0 (Occupant details with Owner on top and Tenant directly underneath)
  ctx.textAlign = 'right';
  ctx.font = `bold 12px ${fontFamily}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText('اسم الشاغل:', width - padding - 14, currentY + 24);

  const occLabelWidth = ctx.measureText('اسم الشاغل:').width;
  const occValX = width - padding - 14 - occLabelWidth - 8;

  if (hasTenant) {
    // Owner line on top
    ctx.font = `bold 11.5px ${fontFamily}`;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(meta.occupantInfo.ownerLine, occValX, currentY + 22);

    // Tenant line directly underneath
    ctx.font = `bold 11.5px ${fontFamily}`;
    ctx.fillStyle = '#78350f'; // Dark amber
    ctx.fillText(meta.occupantInfo.tenantLine, occValX, currentY + 44);
  } else {
    ctx.font = `bold 12px ${fontFamily}`;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(meta.occupantInfo.singleLine, occValX, currentY + 24);
  }

  // 2-Column Table row drawing helper
  const drawTableRow = (
    rowIdx: number,
    col1Label: string,
    col1Val: string,
    col2Label: string,
    col2Val: string,
    col2ValColor: string = '#0f172a'
  ) => {
    const y = getRowY(rowIdx);

    // Divider line between rows
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Right Column (col1)
    ctx.textAlign = 'right';
    ctx.font = `bold 12px ${fontFamily}`;
    ctx.fillStyle = '#64748b';
    ctx.fillText(col1Label, width - padding - 14, y + 24);

    const col1LabelWidth = ctx.measureText(col1Label).width;
    ctx.font = `bold 12px ${fontFamily}`;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(col1Val, width - padding - 14 - col1LabelWidth - 8, y + 24);

    // Left Column (col2)
    if (col2Label) {
      ctx.textAlign = 'right';
      ctx.font = `bold 12px ${fontFamily}`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(col2Label, colMid - 10, y + 24);

      const col2LabelWidth = ctx.measureText(col2Label).width;
      ctx.font = `bold 12px ${fontFamily}`;
      ctx.fillStyle = col2ValColor;
      ctx.fillText(col2Val, colMid - 10 - col2LabelWidth - 8, y + 24);
    }
  };

  // Row 1: Unit Number & Occupancy Type
  const unitStr = `( الوحدة ${data.unitNumber} - ${activityType} )`;
  drawTableRow(1, 'رقم الوحدة:', unitStr, 'نوع الإشغال:', `${occupancyType}`, '#1e3a8a');

  // Row 2 & Row 3
  if (isReceipt) {
    const receiptLine = meta.paymentDescription;
    drawTableRow(2, 'بيان الإيصال:', receiptLine, 'نوع التحصيل:', meta.paymentCategory, '#047857');

    const payMethod = data.notes?.includes('تحويل') ? 'تحويل بنكي / محفظة' : 'سداد نقدي';
    drawTableRow(3, 'الفترة المحاسبية:', periodName, 'طريقة السداد:', payMethod, '#047857');
  } else {
    const monthStr = `اشتراك ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م)`;
    drawTableRow(
      2, 
      'عن شهر:', 
      monthStr, 
      'حالة السداد:', 
      isCurrentMonthPaid ? 'مسدد بالكامل ✓' : 'غير مسدد ⚠️', 
      isCurrentMonthPaid ? '#047857' : '#be123c'
    );
  }

  currentY += tableHeight + 14;

  // 5. Complete 6-Part Breakdown Box (Mirroring the screen completely)
  const cb = meta.claimBreakdown;
  const debtBoxHeight = 310;
  const isAllPaidZero = isReceipt && cb.totalArrearsAndDebts === 0;

  const boxBg = isReceipt 
    ? (isAllPaidZero ? '#f0fdf4' : '#fffbeb')
    : (cb.totalArrearsAndDebts > 0 ? '#fef2f2' : '#f0fdf4');
  const boxBorder = isReceipt
    ? (isAllPaidZero ? '#86efac' : '#fde68a')
    : (cb.totalArrearsAndDebts > 0 ? '#fca5a5' : '#86efac');

  drawRoundRect(padding, currentY, contentWidth, debtBoxHeight, 16, boxBg, boxBorder, 1.5);

  // Header inside Box
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold 12.5px ${fontFamily}`;
  const boxTitle = isReceipt && isAllPaidZero
    ? '📋 بيان وتفصيل المبالغ المستحقة (الحساب مسدد بالكامل ✓):'
    : '📋 بيان وتفصيل المبالغ المستحقة على الوحدة:';
  ctx.fillText(boxTitle, width - padding - 16, currentY + 22);

  // Badge on the left of Header
  ctx.textAlign = 'left';
  ctx.font = `bold 11px ${fontFamily}`;
  ctx.fillStyle = '#334155';
  ctx.fillText(`الوحدة ${data.unitNumber}`, padding + 16, currentY + 22);

  let innerY = currentY + 34;

  // Row 1: حالة الشهر الحالي
  drawRoundRect(padding + 10, innerY, contentWidth - 20, 48, 10, '#ffffff', '#e2e8f0', 1);
  ctx.textAlign = 'right';
  ctx.font = `bold 11px ${fontFamily}`;
  ctx.fillStyle = '#1e3a8a';
  ctx.fillText(`1️⃣ حالة الشهر الحالي (${monthName} ${data.year}):`, width - padding - 22, innerY + 16);
  ctx.font = `normal 10px ${fontFamily}`;
  ctx.fillStyle = '#1e293b';
  ctx.fillText(`• ${cb.subsLineText}`, width - padding - 24, innerY + 31);
  ctx.fillText(`• ${cb.otherLineText}`, width - padding - 24, innerY + 43);
  innerY += 54;

  // Row 2: الاشتراكات الشهرية
  drawRoundRect(padding + 10, innerY, contentWidth - 20, 52, 10, '#ffffff', '#e2e8f0', 1);
  ctx.textAlign = 'right';
  ctx.font = `bold 11px ${fontFamily}`;
  ctx.fillStyle = '#b45309';
  ctx.fillText(`2️⃣ الاشتراكات الشهرية:`, width - padding - 22, innerY + 16);
  ctx.font = `normal 10px ${fontFamily}`;
  ctx.fillStyle = '#475569';
  ctx.fillText(`• إجمالي المستحق: ${cb.priorSubsDue.toLocaleString()} ج.م  |  المسدد: ${cb.priorSubsPaid.toLocaleString()} ج.م`, width - padding - 24, innerY + 31);
  ctx.fillStyle = cb.priorSubsDiff > 0 ? '#b91c1c' : (cb.priorSubsDiff < 0 ? '#047857' : '#475569');
  ctx.font = `bold 10px ${fontFamily}`;
  ctx.fillText(`• الفرق بينهما: ${cb.priorSubsStatusText}`, width - padding - 24, innerY + 45);
  innerY += 58;

  // Row 3: التحصيلات الأخرى
  drawRoundRect(padding + 10, innerY, contentWidth - 20, 52, 10, '#ffffff', '#e2e8f0', 1);
  ctx.textAlign = 'right';
  ctx.font = `bold 11px ${fontFamily}`;
  ctx.fillStyle = '#7e22ce';
  ctx.fillText(`3️⃣ التحصيلات الأخرى:`, width - padding - 22, innerY + 16);
  ctx.font = `normal 10px ${fontFamily}`;
  ctx.fillStyle = '#475569';
  ctx.fillText(`• إجمالي المستحق: ${cb.priorOtherDue.toLocaleString()} ج.م  |  المسدد: ${cb.priorOtherPaid.toLocaleString()} ج.م`, width - padding - 24, innerY + 31);
  ctx.fillStyle = cb.priorOtherDiff > 0 ? '#b91c1c' : (cb.priorOtherDiff < 0 ? '#047857' : '#475569');
  ctx.font = `bold 10px ${fontFamily}`;
  ctx.fillText(`• الفرق بينهما: ${cb.priorOtherStatusText}`, width - padding - 24, innerY + 45);
  innerY += 58;

  // Row 4: مديونيات سابقة
  drawRoundRect(padding + 10, innerY, contentWidth - 20, 34, 10, '#ffffff', '#e2e8f0', 1);
  ctx.textAlign = 'right';
  ctx.font = `bold 11px ${fontFamily}`;
  ctx.fillStyle = '#334155';
  ctx.fillText(`4️⃣ مديونيات سابقة:`, width - padding - 22, innerY + 21);
  ctx.textAlign = 'left';
  ctx.font = `bold 10.5px ${fontFamily}`;
  ctx.fillStyle = cb.previousDebtAmount > 0 ? '#b91c1c' : (cb.previousSurplusAmount > 0 ? '#047857' : '#475569');
  const prevText = cb.previousDebtAmount > 0 
    ? `${cb.previousDebtAmount.toLocaleString()} ج.م (مديونيات سابقة)` 
    : (cb.previousSurplusAmount > 0 ? `+${cb.previousSurplusAmount.toLocaleString()} ج.م (رصيد دائن مرحل)` : '0 ج.م (لا توجد مديونيات)');
  ctx.fillText(prevText, padding + 22, innerY + 21);
  innerY += 40;

  // Rows 5 & 6: Summary Rectangle
  drawRoundRect(padding + 10, innerY, contentWidth - 20, 52, 10, '#ffffff', '#f59e0b', 1.5);
  ctx.textAlign = 'right';
  ctx.font = `bold 11px ${fontFamily}`;
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`5️⃣ إجمالي المستحق عن هذا الشهر:`, width - padding - 22, innerY + 18);
  ctx.textAlign = 'left';
  const isZeroDue = cb.currentMonthTotalDue === 0;
  const isMonthPaid = (cb.isCurrentMonthSubsPaid && cb.isCurrentMonthOtherPaid) || ((cb.currentMonthSubsPaid + cb.currentMonthOtherPaid) >= cb.currentMonthTotalDue);
  const statusBadgeText = isZeroDue ? '(غير مطالب ✓)' : (isMonthPaid ? '(مسدد ✓)' : '(غير مسدد ⚠️)');
  ctx.fillStyle = (isZeroDue || isMonthPaid) ? '#047857' : '#be123c';
  ctx.font = `bold 11px ${fontFamily}`;
  ctx.fillText(`${cb.currentMonthTotalDue.toLocaleString()} ج.م  ${statusBadgeText}`, padding + 22, innerY + 18);

  // Dashed line
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([3, 3]);
  ctx.moveTo(padding + 18, innerY + 26);
  ctx.lineTo(width - padding - 18, innerY + 26);
  ctx.strokeStyle = '#fcd34d';
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`6️⃣ إجمالي المتأخرات والمديونيات:`, width - padding - 22, innerY + 42);
  ctx.textAlign = 'left';
  ctx.fillStyle = cb.totalArrearsAndDebts > 0 ? '#b91c1c' : '#047857';
  ctx.fillText(`${cb.totalArrearsAndDebts > 0 ? `${cb.totalArrearsAndDebts.toLocaleString()} ج.م` : '0 ج.م (خالص بالكامل)'}`, padding + 22, innerY + 42);

  currentY += debtBoxHeight + 14;

  // 6. Encouraging / Thanking Note Box
  const noteHeight = 52;
  const noteBg = isReceipt ? '#f0fdf4' : '#eff6ff';
  const noteBorder = isReceipt ? '#bbf7d0' : '#bfdbfe';
  drawRoundRect(padding, currentY, contentWidth, noteHeight, 14, noteBg, noteBorder, 1);

  ctx.textAlign = 'right';
  ctx.fillStyle = isReceipt ? '#166534' : '#1e40af';
  ctx.font = `bold 11px ${fontFamily}`;
  if (isReceipt) {
    ctx.fillText('🌺 نشكركم جزيل الشكر على التزامكم الدائم بالسداد وحرصكم المستمر على الوفاء بالمستحقات،', width - padding - 16, currentY + 22);
    ctx.fillText('فمساهمتكم هي الركيزة الأساسية لصيانة وتطوير ونظافة وأمن العمارة وراحة جميع السكان.', width - padding - 16, currentY + 39);
  } else {
    ctx.fillText('🤝 نأمل من سيادتكم التكرم بالمبادرة بسرعة سداد المستحقات لتغطية مصروفات الصيانة الدورية والنظافة،', width - padding - 16, currentY + 22);
    ctx.fillText('وتشغيل المصاعد والخدمات بكفاءة وراحة تامة لجميع سكان ورواد العمارة الكرام.', width - padding - 16, currentY + 39);
  }

  currentY += noteHeight + 14;

  // 7. Total Amount Banner
  const totalHeight = 54;
  const totalBg = isReceipt ? '#ecfdf5' : '#ffffff';
  const totalBorder = isReceipt ? '#059669' : '#e11d48';
  drawRoundRect(padding, currentY, contentWidth, totalHeight, 16, totalBg, totalBorder, 2);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold 13.5px ${fontFamily}`;
  const totalLabel = isReceipt ? 'المبلغ المستلم والموثق بالإيصال:' : 'إجمالي المبلغ المطلوب سداده:';
  ctx.fillText(totalLabel, width - padding - 16, currentY + 34);

  ctx.textAlign = 'left';
  ctx.fillStyle = isReceipt ? '#047857' : '#be123c';
  ctx.font = `bold 20px ${fontFamily}`;
  const formattedAmount = `${Math.round(isReceipt ? data.amount : meta.claimBreakdown.totalDueForPayment).toLocaleString()} ج.م`;
  ctx.fillText(formattedAmount, padding + 18, currentY + 35);

  currentY += totalHeight + 14;

  // 8. Footer Notes & Stamp Line
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = `bold 10.5px ${fontFamily}`;
  ctx.fillText('إدارة اتحاد ملاك عمارة بيراميدز فيو ١ • مستند معتمد صادر إلكترونياً', width - padding, currentY + 12);

  ctx.textAlign = 'left';
  ctx.fillText('معتمد مالياً ✓', padding, currentY + 12);

  return canvas;
}

/**
 * Generates PNG Blob and Data URL for Receipt/Claim in < 15ms.
 */
export async function generateReceiptClaimFast(
  data: ReceiptClaimData,
  residents: Resident[] = [],
  fileName?: string
): Promise<{ blob: Blob; dataUrl: string; file: File; download: () => void }> {
  const meta = getReceiptClaimMetadata(data, residents);
  const canvas = generateReceiptClaimCanvas(data, residents);
  const dataUrl = canvas.toDataURL('image/png', 1.0);

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => {
      resolve(b || new Blob([], { type: 'image/png' }));
    }, 'image/png', 1.0);
  });

  const safeFileName = fileName || (data.type === 'receipt'
    ? `إيصال_سداد_وحدة_${data.unitNumber}_شهر_${meta.monthName}_${data.year}.png`
    : `إشعار_مطالبة_وحدة_${data.unitNumber}_شهر_${meta.monthName}_${data.year}.png`);

  const file = new File([blob], safeFileName, { type: 'image/png' });

  const download = () => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = safeFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return { blob, dataUrl, file, download };
}

/**
 * Returns self-contained printable HTML with identical visual styling.
 */
export function getReceiptClaimPrintHtml(data: ReceiptClaimData, residents: Resident[] = []): string {
  const meta = getReceiptClaimMetadata(data, residents);
  const {
    isReceipt,
    monthName,
    docNumber,
    displayFormattedDate,
    occupantDisplay,
    activityType,
    occupancyType,
    displayMonthlyFee,
    carriedDebt,
    showCarriedDebt
  } = meta;

  const isCurrentMonthPaid = data.currentMonthStatus 
    ? (data.currentMonthStatus.includes('مسدد') && !data.currentMonthStatus.includes('غير'))
    : isReceipt;

  const netVal = data.netDebt !== undefined ? data.netDebt : (data.amount || 0);
  const isDebt = netVal > 0;
  const isZeroDebt = netVal === 0;
  const isSurplus = netVal < 0;

  const headerBg = isReceipt ? '#047857' : (isDebt ? '#b91c1c' : (isZeroDebt ? '#1d4ed8' : '#047857'));
  const alertBg = isReceipt ? '#ecfdf5' : (isDebt ? '#fef2f2' : (isZeroDebt ? '#eff6ff' : '#f0fdf4'));
  const alertBorder = isReceipt ? '#a7f3d0' : (isDebt ? '#fecaca' : (isZeroDebt ? '#bfdbfe' : '#bbf7d0'));
  const alertColor = isReceipt ? '#047857' : (isDebt ? '#991b1b' : (isZeroDebt ? '#1e40af' : '#166534'));
  const badgeBg = isReceipt ? '#d1fae5' : (isDebt ? '#fee2e2' : (isZeroDebt ? '#dbeafe' : '#d1fae5'));

  const periodName = data.periodName || 'الفترة المحاسبية النشطة';
  const hideCarried = Boolean(data.hideCarriedBalance);
  const cBal = hideCarried ? 0 : (data.carriedBalance || 0);
  const cb = meta.claimBreakdown;

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${isReceipt ? `إيصال سداد وحدة ${data.unitNumber}` : `إشعار مطالبة وحدة ${data.unitNumber}`}</title>
  <style>
    @media print {
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @page {
        margin: 8mm;
        size: A4 portrait;
      }
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Cairo', system-ui, -apple-system, sans-serif;
      direction: rtl;
      background: #ffffff;
      color: #0f172a;
      display: flex;
      justify-content: center;
      padding: 20px;
    }
    .print-card {
      width: 100%;
      max-width: 720px;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 22px;
      background: #ffffff;
    }
    .header-banner {
      background: ${headerBg};
      color: #ffffff;
      border-radius: 14px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .header-title {
      font-size: 17px;
      font-weight: 900;
    }
    .header-sub {
      font-size: 13px;
      font-weight: 700;
      opacity: 0.95;
      margin-top: 3px;
    }
    .header-meta {
      text-align: left;
      font-size: 11.5px;
      font-weight: 800;
      line-height: 1.5;
    }
    .status-bar {
      background: ${alertBg};
      border: 1px solid ${alertBorder};
      border-radius: 12px;
      padding: 9px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      color: ${alertColor};
      font-size: 12px;
      font-weight: 800;
    }
    .status-badge {
      background: ${badgeBg};
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 900;
    }
    .info-table {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 14px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 16px;
      font-size: 12.5px;
      border-bottom: 1px solid #e2e8f0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-col {
      display: flex;
      gap: 6px;
      flex: 1;
    }
    .label {
      color: #64748b;
      font-weight: 700;
    }
    .value {
      color: #0f172a;
      font-weight: 900;
    }
    .highlight {
      color: #1e3a8a;
    }
    .debt-box {
      background: ${isDebt ? '#fef2f2' : (isZeroDebt ? '#eff6ff' : '#f0fdf4')};
      border: 1.5px solid ${isDebt ? '#fecaca' : (isZeroDebt ? '#bfdbfe' : '#bbf7d0')};
      border-radius: 12px;
      padding: 12px 16px;
      color: ${isDebt ? '#991b1b' : (isZeroDebt ? '#1e40af' : '#166534')};
      font-size: 12px;
      margin-bottom: 14px;
      font-weight: 800;
      line-height: 1.6;
    }
    .note-box {
      background: ${isReceipt ? '#f0fdf4' : (isDebt ? '#fef2f2' : (isZeroDebt ? '#eff6ff' : '#f0fdf4'))};
      border: 1px solid ${isReceipt ? '#bbf7d0' : (isDebt ? '#fecaca' : (isZeroDebt ? '#bfdbfe' : '#bbf7d0'))};
      border-radius: 12px;
      padding: 11px 14px;
      color: ${isReceipt ? '#166534' : (isDebt ? '#991b1b' : (isZeroDebt ? '#1e40af' : '#166534'))};
      font-size: 11.5px;
      font-weight: 800;
      line-height: 1.6;
      margin-bottom: 14px;
    }
    .total-banner {
      background: ${isReceipt ? '#ecfdf5' : (isDebt ? '#fef2f2' : (isZeroDebt ? '#eff6ff' : '#f0fdf4'))};
      border: 2px solid ${isReceipt ? '#059669' : (isDebt ? '#b91c1c' : (isZeroDebt ? '#1d4ed8' : '#047857'))};
      border-radius: 14px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .total-label {
      font-size: 14px;
      font-weight: 900;
      color: #0f172a;
    }
    .total-val {
      font-size: 22px;
      font-weight: 900;
      color: ${isReceipt ? '#047857' : (isDebt ? '#b91c1c' : (isZeroDebt ? '#1d4ed8' : '#047857'))};
    }
    .footer {
      border-top: 1px dashed #cbd5e1;
      padding-top: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10.5px;
      color: #64748b;
      font-weight: 700;
    }
    .cert-badge {
      border: 1px solid #94a3b8;
      border-radius: 6px;
      padding: 3px 8px;
      font-weight: 800;
      color: #334155;
    }
  </style>
</head>
<body>
  <div class="print-card">
    <div class="header-banner">
      <div>
        <div class="header-title">${isReceipt ? `💐 إيصال سداد: ${meta.paymentDescription}` : `🏛️ إشعار مطالبة وبيان مستحقات (${periodName})`}</div>
        <div class="header-sub">اتحاد ملاك عمارة بيراميدز فيو ١</div>
      </div>
      <div class="header-meta">
        <div>التاريخ: ${displayFormattedDate}</div>
        <div>المرجع: ${docNumber}</div>
      </div>
    </div>

    <div class="status-bar">
      <div>${isReceipt 
        ? `✓ تم استلام ${meta.paymentDescription} بنجاح وتوثيقه في السجل المالي` 
        : isDebt
        ? `⚠️ تنويه هام: توجد مديونية مستحقة على الوحدة بقيمة (${Math.round(netVal).toLocaleString()} ج.م) عن ${periodName}`
        : isZeroDebt
        ? `✨ الحساب خالص بالكامل: لا توجد أي مديونيات أو متأخرات على الوحدة عن ${periodName}`
        : `🎉 يوجد رصيد دائن لصالح الوحدة بقيمة (${Math.round(Math.abs(netVal)).toLocaleString()} ج.م) عن ${periodName}`
      }</div>
      <div class="status-badge">${isReceipt ? 'مسدد بالكامل ✓' : (isDebt ? '⏳ عليه مديونية' : (isZeroDebt ? '✓ الحساب خالص' : '🎉 رصيد دائن'))}</div>
    </div>

    <div class="info-table">
      <div class="info-row">
        <div class="info-col" style="flex: 1; display: flex; align-items: flex-start; gap: 8px;">
          <span class="label" style="margin-top: 2px;">اسم الشاغل:</span>
          <div style="display: flex; flex-direction: column; gap: 3px;">
            ${meta.occupantInfo.hasTenant ? `
              <span class="value">${meta.occupantInfo.ownerLine}</span>
              <span class="value" style="color: #78350f;">${meta.occupantInfo.tenantLine}</span>
            ` : `
              <span class="value">${meta.occupantInfo.singleLine}</span>
            `}
          </div>
        </div>
      </div>

      <div class="info-row">
        <div class="info-col">
          <span class="label">رقم الوحدة:</span>
          <span class="value highlight">( الوحدة ${data.unitNumber} - ${activityType} )</span>
        </div>
        <div class="info-col">
          <span class="label">نوع الإشغال:</span>
          <span class="value">${occupancyType}</span>
        </div>
      </div>

      ${isReceipt ? `
      <div class="info-row">
        <div class="info-col" style="flex: 2;">
          <span class="label">بيان الإيصال:</span>
          <span class="value" style="color: #047857;">${meta.paymentDescription}</span>
        </div>
        <div class="info-col">
          <span class="label">نوع التحصيل:</span>
          <span class="value" style="color: #047857;">${meta.paymentCategory}</span>
        </div>
      </div>
      <div class="info-row">
        <div class="info-col">
          <span class="label">الفترة المحاسبية:</span>
          <span class="value">${periodName}</span>
        </div>
        <div class="info-col">
          <span class="label">طريقة السداد:</span>
          <span class="value" style="color: #047857;">${data.notes?.includes('تحويل') ? 'تحويل بنكي / محفظة' : 'سداد نقدي'}</span>
        </div>
      </div>
      ` : `
      <div class="info-row">
        <div class="info-col">
          <span class="label">الفترة المحاسبية:</span>
          <span class="value">${periodName}</span>
        </div>
        <div class="info-col">
          <span class="label">حالة الحساب:</span>
          <span class="value" style="color: ${isDebt ? '#b91c1c' : (isZeroDebt ? '#1d4ed8' : '#047857')};">
            ${isDebt ? 'عليه مديونية ⚠️' : (isZeroDebt ? 'الحساب خالص ✓' : 'رصيد دائن 🎉')}
          </span>
        </div>
      </div>
      `}
    </div>

    ${isReceipt ? `
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 10px 14px; color: #166534; font-size: 12px; margin-bottom: 12px; font-weight: 800; display: flex; justify-content: space-between; align-items: center;">
        <span>✓ تم استلام مبلغ الإيصال وتوثيقه في السجل المالي المعتمد</span>
        <span>المسدد: ${Math.round(data.amount).toLocaleString()} ج.م</span>
      </div>
    ` : ''}

    <div class="debt-box" style="margin-bottom: 14px;">
      <div style="font-weight: 900; margin-bottom: 8px; font-size: 13px;">📊 بيان وتفصيل المبالغ المستحقة للفترة المحاسبية:</div>
      <div style="font-size: 11.5px; line-height: 1.8;">
        <!-- 1️⃣ حالة الشهر الحالي -->
        <div style="border-bottom: 1px dashed ${isDebt ? '#fca5a5' : '#cbd5e1'}; padding: 4px 0;">
          <div style="font-weight: 900; color: #1e3a8a;">1️⃣ حالة الشهر الحالي (${monthName} ${data.year}):</div>
          <div style="font-size: 10.5px; color: #334155; font-weight: 700; padding-right: 12px;">
            • ${cb.subsLineText || `اشتراك شهري قدره ${Math.round(meta.displayMonthlyFee).toLocaleString()} ج.م`}<br/>
            • ${cb.otherLineText || 'تحصيلات أخرى'}
          </div>
        </div>

        <!-- 2️⃣ الاشتراكات الشهرية -->
        <div style="border-bottom: 1px dashed ${isDebt ? '#fca5a5' : '#cbd5e1'}; padding: 4px 0;">
          <div style="font-weight: 900; color: #b45309;">2️⃣ الاشتراكات الشهرية:</div>
          <div style="font-size: 10.5px; padding-right: 12px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #475569;">- إجمالي المستحق:</span>
              <span style="font-weight: 900;">${(cb.priorSubsDue || 0).toLocaleString()} ج.م</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: #047857;">
              <span>- المسدد:</span>
              <span style="font-weight: 900;">${(cb.priorSubsPaid || 0).toLocaleString()} ج.م</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: 900; color: ${(cb.priorSubsDiff || 0) > 0 ? '#b91c1c' : '#047857'};">
              <span>- الفرق بينهما:</span>
              <span style="text-decoration: underline;">${cb.priorSubsStatusText || '0 ج.م'}</span>
            </div>
          </div>
        </div>

        <!-- 3️⃣ التحصيلات الأخرى -->
        <div style="border-bottom: 1px dashed ${isDebt ? '#fca5a5' : '#cbd5e1'}; padding: 4px 0;">
          <div style="font-weight: 900; color: #7e22ce;">3️⃣ التحصيلات الأخرى:</div>
          <div style="font-size: 10.5px; padding-right: 12px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #475569;">- إجمالي المستحق:</span>
              <span style="font-weight: 900;">${(cb.priorOtherDue || 0).toLocaleString()} ج.م</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: #047857;">
              <span>- المسدد:</span>
              <span style="font-weight: 900;">${(cb.priorOtherPaid || 0).toLocaleString()} ج.م</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: 900; color: ${(cb.priorOtherDiff || 0) > 0 ? '#b91c1c' : '#047857'};">
              <span>- الفرق بينهما:</span>
              <span style="text-decoration: underline;">${cb.priorOtherStatusText || '0 ج.م'}</span>
            </div>
          </div>
        </div>

        <!-- 4️⃣ مديونيات سابقة -->
        <div style="border-bottom: 1px dashed ${isDebt ? '#fca5a5' : '#cbd5e1'}; padding: 4px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 900; color: #334155;">4️⃣ مديونيات سابقة:</span>
            <span style="font-weight: 900; color: ${(cb.previousDebtAmount || 0) > 0 ? '#b91c1c' : '#047857'};">
              ${(cb.previousDebtAmount || 0) > 0
                ? `${(cb.previousDebtAmount || 0).toLocaleString()} ج.م (مديونيات سابقة)`
                : ((cb.previousSurplusAmount || 0) > 0
                    ? `+${(cb.previousSurplusAmount || 0).toLocaleString()} ج.م (رصيد موجب دائن مرحل)`
                    : '0 ج.م (لا توجد مديونيات سابقة)')}
            </span>
          </div>
        </div>

        <!-- 5️⃣ & 6️⃣ مستطيل ملخص المبالغ المستحقة -->
        <div style="margin-top: 8px; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 6px 10px; font-size: 11px; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; font-weight: 900;">
            <span>5️⃣ إجمالي المستحق عن هذا الشهر:</span>
            <span style="color: #1e3a8a;">${(cb.currentMonthTotalDue || 0).toLocaleString()} ج.م</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: 900; border-top: 1px dashed #e2e8f0; paddingTop: 4px;">
            <span>6️⃣ إجمالي المتأخرات والمديونيات:</span>
            <span style="color: ${(cb.totalArrearsAndDebts || 0) > 0 ? '#b91c1c' : '#047857'};">
              ${(cb.totalArrearsAndDebts || 0) > 0
                ? `${(cb.totalArrearsAndDebts || 0).toLocaleString()} ج.م`
                : '0 ج.م (خالص بالكامل)'}
            </span>
          </div>
        </div>
      </div>

      <div style="margin-top: 8px; background: #ffffff; border: 2px solid ${isDebt ? '#f87171' : (isZeroDebt ? '#60a5fa' : '#34d399')}; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 900;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>صافي الدين / الحساب النهائي:</span>
          <span style="color: ${isDebt ? '#b91c1c' : (isZeroDebt ? '#1d4ed8' : '#047857')}; font-size: 15px;">
            ${isDebt ? `${Math.round(netVal).toLocaleString()} ج.م (عليها مديونية)` : isZeroDebt ? '0 ج.م (الحساب خالص)' : `+${Math.round(Math.abs(netVal)).toLocaleString()} ج.م (رصيد دائن)`}
          </span>
        </div>
      </div>
    </div>

    <div class="note-box">
      ${isReceipt 
        ? '🌺 نشكركم على حسن تعاونكم والتزامكم بالسداد لدعم نظافة وصيانة وخدمات العمارة، ونرجو التكرم بسرعة سداد وتصفية أي مبالغ متبقية للحفاظ على استمرار تقديم الخدمات المشتركة بأفضل صورة لراحة الجميع.'
        : isDebt
        ? '🤝 نأمل من سيادتكم التكرم بالمبادرة بسرعة سداد المستحقات لتغطية مصروفات الصيانة الدورية والنظافة والأمن وتشغيل المصاعد بكفاءة لراحة وسلامة جميع سكان ورواد العمارة.'
        : isZeroDebt
        ? '✨ نشكر سيادتكم على الانتظام بالسداد والحفاظ على تصفية المستحقات أولاً بأول. يسعدنا خلو حسابكم من أي مديونيات متأخرة.'
        : '🎉 نشكر سيادتكم على السداد المبكر والتفوق المالي. تم قيد الرصيد الدائن المتبقي لصالح حسابكم للفترات القادمة.'
      }
    </div>

    <div class="total-banner">
      <span class="total-label">${isReceipt ? 'إجمالي المبلغ المسدد معتمداً:' : 'صافي الدين / الحساب النهائي:'}</span>
      <span class="total-val">
        ${isReceipt 
          ? `${Math.round(data.amount).toLocaleString()} ج.م`
          : isDebt
          ? `${Math.round(netVal).toLocaleString()} ج.م`
          : isZeroDebt
          ? '0 ج.م (خالص)'
          : `+${Math.round(Math.abs(netVal)).toLocaleString()} ج.م (دائن)`
        }
      </span>
    </div>

    <div class="footer">
      <div class="cert-badge">معتمد إلكترونياً ✓ اتحاد ملاك بيراميدز فيو ١</div>
      <span>تم استخراج هذا المستند إلكترونياً ومطابق للسجلات المالية الرسمية</span>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Triggers native browser print dialog for Receipt or Claim Notice.
 * Clean, instant, and compatible across desktop and mobile.
 */
export function printReceiptClaim(data: ReceiptClaimData, residents: Resident[] = []): void {
  let iframe = document.getElementById('print-receipt-claim-iframe') as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'print-receipt-claim-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);
  }

  const html = getReceiptClaimPrintHtml(data, residents);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.warn('Iframe print error, falling back to window.print():', err);
      window.print();
    }
  }, 200);
}
