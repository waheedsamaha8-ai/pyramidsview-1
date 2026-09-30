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
    currentMonthSubsDue: isReceipt ? 0 : displayMonthlyFee,
    subsLineText: `اشتراك شهري - شهر ${monthName} ${data.year} و قدره ${Math.round(displayMonthlyFee).toLocaleString()} ج.م - (${isReceipt ? 'مسدد بالكامل ✓' : 'غير مسدد ⚠️'}) .`,
    currentMonthOtherFee: 0,
    currentMonthOtherPaid: 0,
    currentMonthOtherStatusText: 'مسدد بالكامل ✓',
    isCurrentMonthOtherPaid: true,
    currentMonthOtherDue: 0,
    otherLineText: `تحصيلات اخري - شهر ${monthName} ${data.year} و قدره 0 ج.م - (مسدد بالكامل ✓) .`,
    monthlyDelayedMonthsCount: unpaidMonthsCount,
    monthlyDelayedAmount: unpaidMonthsDues,
    monthlyArrearsLineText: unpaidMonthsCount > 0 ? `متأخرات اشتراك شهري - تأخير ${unpaidMonthsCount} شهور بقيمة (${Math.round(unpaidMonthsDues).toLocaleString()} ج.م) .` : `متأخرات اشتراك شهري - لا يوجد تأخير (0 ج.م) .`,
    otherDelayedMonthsCount: 0,
    otherDelayedAmount: 0,
    otherArrearsLineText: `متأخرات تحصيلات اخري - لا توجد متأخرات (0 ج.م) .`,
    previousDebtAmount: carriedDebt,
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
  const height = (isReceipt 
    ? (showCarriedDebt ? 740 : 680) 
    : 810) + occupantExtraHeight;

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

    const payDate = data.date || `${data.year}-${String(data.month).padStart(2, '0')}`;
    const payMethod = data.notes?.includes('تحويل') ? 'تحويل بنكي / محفظة' : 'سداد نقدي';
    drawTableRow(3, 'تاريخ السداد:', payDate, 'طريقة السداد:', payMethod, '#047857');
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

  // 5. Debt Notice Box (Detailed unified categorization)
  if (isReceipt) {
    if (meta.totalUnitDebt > 0) {
      const debtBoxHeight = 66;
      drawRoundRect(padding, currentY, contentWidth, debtBoxHeight, 14, '#fef2f2', '#fecaca', 1);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#991b1b';
      ctx.font = `bold 11.5px ${fontFamily}`;
      ctx.fillText('⚠️ بيان تفصيلي بالمديونيات والمتأخرات المتبقية على الوحدة:', width - padding - 16, currentY + 20);

      ctx.font = `bold 11px ${fontFamily}`;
      const delayedMonthsText = meta.unpaidMonthsCount === 1
        ? 'تأخير شهر واحد'
        : meta.unpaidMonthsCount === 2
        ? 'تأخير شهرين'
        : meta.unpaidMonthsCount <= 10
        ? `تأخير ${meta.unpaidMonthsCount} أشهر`
        : `تأخير ${meta.unpaidMonthsCount} شهراً`;

      let detailLine = `• متأخرات ${meta.paymentCategory}: ${delayedMonthsText} (${Math.round(meta.currentArrears).toLocaleString()} ج.م)`;
      if (meta.oldCarriedDebts > 0) {
        detailLine += ` + مديونية قديمة مرحلة (${Math.round(meta.oldCarriedDebts).toLocaleString()} ج.م)`;
      }
      ctx.fillText(detailLine, width - padding - 16, currentY + 38);

      ctx.fillText(
        `• إجمالي المديونية المتبقية على الوحدة: ${Math.round(meta.totalUnitDebt).toLocaleString()} ج.م (المتأخرات الحالية + المديونيات القديمة)`,
        width - padding - 16,
        currentY + 54
      );

      currentY += debtBoxHeight + 12;
    } else {
      const debtBoxHeight = 44;
      drawRoundRect(padding, currentY, contentWidth, debtBoxHeight, 14, '#f0fdf4', '#bbf7d0', 1);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#166534';
      ctx.font = `bold 11.5px ${fontFamily}`;
      ctx.fillText('✨ موقف المديونيات: لا توجد أي مديونيات قديمة أو متأخرات على الوحدة، والحساب مسدد بالكامل حتى تاريخه 👍', width - padding - 16, currentY + 27);

      currentY += debtBoxHeight + 12;
    }
  } else {
    // Detailed Claim Breakdown
    const cb = meta.claimBreakdown;
    const debtBoxHeight = 188;
    drawRoundRect(padding, currentY, contentWidth, debtBoxHeight, 14, '#fef2f2', '#fecaca', 1);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#991b1b';
    ctx.font = `bold 12px ${fontFamily}`;
    ctx.fillText('⚠️ بيان وتفصيل المبالغ المستحقة على الوحدة:', width - padding - 16, currentY + 20);

    ctx.font = `bold 10px ${fontFamily}`;
    ctx.fillStyle = '#0f172a';
    ctx.fillText('حالة الشهر الحالي:', width - padding - 16, currentY + 36);

    ctx.font = `bold 9.5px ${fontFamily}`;
    ctx.fillStyle = '#7f1d1d';
    ctx.fillText(`• ${cb.subsLineText}`, width - padding - 16, currentY + 50);
    ctx.fillText(`• ${cb.otherLineText}`, width - padding - 16, currentY + 64);
    ctx.fillText(`• ${cb.monthlyArrearsLineText}`, width - padding - 16, currentY + 78);
    ctx.fillText(`• ${cb.otherArrearsLineText}`, width - padding - 16, currentY + 92);
    ctx.fillText(`• ${cb.previousDebtLineText}`, width - padding - 16, currentY + 106);

    ctx.font = `bold 10px ${fontFamily}`;
    ctx.fillStyle = '#991b1b';
    ctx.fillText(`• ${cb.totalDueLineText}`, width - padding - 16, currentY + 122);

    // Inner rectangle for the two totals requested by the user
    const rectX = padding + 12;
    const rectY = currentY + 132;
    const rectW = contentWidth - 24;
    const rectH = 46;
    drawRoundRect(rectX, rectY, rectW, rectH, 8, '#ffffff', '#f87171', 1.5);

    ctx.font = `bold 10px ${fontFamily}`;
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'right';
    ctx.fillText('اجمالي المبالغ المستحقة عن هذا الشهر :', rectX + rectW - 10, rectY + 18);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1e3a8a';
    ctx.fillText(`${cb.currentMonthTotalDue.toLocaleString()} ج.م`, rectX + 10, rectY + 18);

    // Dashed divider line in rectangle
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(rectX + 8, rectY + 26);
    ctx.lineTo(rectX + rectW - 8, rectY + 26);
    ctx.strokeStyle = '#fca5a5';
    ctx.stroke();
    ctx.restore();

    ctx.font = `bold 10px ${fontFamily}`;
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'right';
    ctx.fillText('احمالي المتأخرات و المديونيات :', rectX + rectW - 10, rectY + 38);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#b91c1c';
    ctx.fillText(`${cb.totalArrearsAndDebts.toLocaleString()} ج.م`, rectX + 10, rectY + 38);

    currentY += debtBoxHeight + 12;
  }

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

  const headerBg = isReceipt ? '#047857' : '#1d4ed8';
  const alertBg = isReceipt || isCurrentMonthPaid ? '#ecfdf5' : '#fffbeb';
  const alertBorder = isReceipt || isCurrentMonthPaid ? '#a7f3d0' : '#fde68a';
  const alertColor = isReceipt || isCurrentMonthPaid ? '#047857' : '#92400e';
  const badgeBg = isReceipt || isCurrentMonthPaid ? '#d1fae5' : '#fef3c7';

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
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 12px;
      padding: 12px 16px;
      color: #991b1b;
      font-size: 12px;
      margin-bottom: 14px;
      font-weight: 800;
      line-height: 1.6;
    }
    .note-box {
      background: ${isReceipt ? '#f0fdf4' : '#eff6ff'};
      border: 1px solid ${isReceipt ? '#bbf7d0' : '#bfdbfe'};
      border-radius: 12px;
      padding: 11px 14px;
      color: ${isReceipt ? '#166534' : '#1e40af'};
      font-size: 11.5px;
      font-weight: 800;
      line-height: 1.6;
      margin-bottom: 14px;
    }
    .total-banner {
      background: ${isReceipt ? '#ecfdf5' : '#ffffff'};
      border: 2px solid ${isReceipt ? '#059669' : '#e11d48'};
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
      color: ${isReceipt ? '#047857' : '#be123c'};
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
        <div class="header-title">${isReceipt ? `💐 إيصال سداد: ${meta.paymentDescription}` : `🏛️ إشعار مطالبة وبيان مستحقات (${meta.paymentCategory})`}</div>
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
        : isCurrentMonthPaid
        ? `✓ حالة سداد الشهر الحالي: اشتراك شهر ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م) مسدد بالكامل`
        : `⚠️ تنويه هام: اشتراك شهر ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م) غير مسدد حتى تاريخه`
      }</div>
      <div class="status-badge">${isReceipt || isCurrentMonthPaid ? 'مسدد بالكامل ✓' : '⏳ غير مسدد'}</div>
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
          <span class="label">تاريخ السداد:</span>
          <span class="value">${data.date || `${data.year}-${String(data.month).padStart(2, '0')}`}</span>
        </div>
        <div class="info-col">
          <span class="label">طريقة السداد:</span>
          <span class="value" style="color: #047857;">${data.notes?.includes('تحويل') ? 'تحويل بنكي / محفظة' : 'سداد نقدي'}</span>
        </div>
      </div>
      ` : `
      <div class="info-row">
        <div class="info-col">
          <span class="label">عن شهر:</span>
          <span class="value">اشتراك ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م)</span>
        </div>
        <div class="info-col">
          <span class="label">حالة الشهر الحالي:</span>
          <span class="value" style="color: ${isCurrentMonthPaid ? '#047857' : '#be123c'};">${isCurrentMonthPaid ? 'مسدد بالكامل ✓' : 'غير مسدد ⚠️'}</span>
        </div>
      </div>
      `}
    </div>

    ${isReceipt ? (
      meta.totalUnitDebt > 0 ? `
      <div class="debt-box">
        <div style="font-weight: 900; margin-bottom: 4px;">⚠️ بيان تفصيلي بالمديونيات والمتأخرات المتبقية على الوحدة:</div>
        <div>• متأخرات ${meta.paymentCategory}: تأخير ${meta.unpaidMonthsCount} شهور (${Math.round(meta.currentArrears).toLocaleString()} ج.م)${meta.oldCarriedDebts > 0 ? ` + مديونية قديمة مرحلة (${Math.round(meta.oldCarriedDebts).toLocaleString()} ج.م)` : ''}</div>
        <div style="font-weight: 900; margin-top: 4px; color: #7f1d1d;">• إجمالي المديونية المتبقية على الوحدة: <u>${Math.round(meta.totalUnitDebt).toLocaleString()} ج.م</u> (المتأخرات الحالية + المديونيات القديمة)</div>
      </div>
      ` : `
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 10px 14px; color: #166534; font-size: 12px; margin-bottom: 14px; font-weight: 800;">
        ✨ موقف المديونيات: لا توجد أي مديونيات قديمة أو متأخرات على الوحدة، والحساب مسدد بالكامل حتى تاريخه 👍
      </div>
      `
    ) : `
      <div class="debt-box" style="background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px;">
        <div style="font-weight: 900; margin-bottom: 6px; font-size: 13px; color: #991b1b;">⚠️ بيان وتفصيل المبالغ المستحقة على الوحدة:</div>
        <div style="font-size: 11.5px; line-height: 1.6; color: #7f1d1d;">
          <div style="font-weight: 900; color: #0f172a;">حالة الشهر الحالي:</div>
          <div>• ${meta.claimBreakdown.subsLineText}</div>
          <div>• ${meta.claimBreakdown.otherLineText}</div>
          <div>• ${meta.claimBreakdown.monthlyArrearsLineText}</div>
          <div>• ${meta.claimBreakdown.otherArrearsLineText}</div>
          <div>• ${meta.claimBreakdown.previousDebtLineText}</div>
          <div style="font-weight: 900; margin-top: 5px; padding-top: 5px; border-top: 1px dashed #fca5a5; color: #7f1d1d;">• ${meta.claimBreakdown.totalDueLineText}</div>
        </div>

        <div style="margin-top: 8px; background: #ffffff; border: 2px solid #f87171; border-radius: 8px; padding: 8px 12px; font-size: 11.5px; font-weight: 900;">
          <div style="display: flex; justify-content: space-between; align-items: center; color: #0f172a;">
            <span>اجمالي المبالغ المستحقة عن هذا الشهر :</span>
            <span style="color: #1e3a8a; font-weight: 900;">${meta.claimBreakdown.currentMonthTotalDue.toLocaleString()} ج.م</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; color: #0f172a; margin-top: 4px; padding-top: 4px; border-top: 1px dashed #fecaca;">
            <span>احمالي المتأخرات و المديونيات :</span>
            <span style="color: #b91c1c; font-weight: 900;">${meta.claimBreakdown.totalArrearsAndDebts.toLocaleString()} ج.م</span>
          </div>
        </div>
      </div>
    `}

    <div class="note-box">
      ${isReceipt 
        ? '🌺 نشكركم على حسن تعاونكم والتزامكم بالسداد لدعم نظافة وصيانة وخدمات العمارة، ونرجو التكرم بسرعة سداد وتصفية أي مبالغ متبقية للحفاظ على استمرار تقديم الخدمات المشتركة بأفضل صورة لراحة الجميع.'
        : '🤝 نأمل من سيادتكم التكرم بالمبادرة بسرعة سداد المستحقات لتغطية مصروفات الصيانة الدورية والنظافة والأمن وتشغيل المصاعد بكفاءة لراحة وسلامة جميع سكان ورواد العمارة.'
      }
    </div>

    <div class="total-banner">
      <span class="total-label">${isReceipt ? 'إجمالي المبلغ المسدد معتمداً:' : 'إجمالي المبلغ المستحق للسداد:'}</span>
      <span class="total-val">${Math.round(isReceipt ? data.amount : meta.claimBreakdown.totalDueForPayment).toLocaleString()} ج.م</span>
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
