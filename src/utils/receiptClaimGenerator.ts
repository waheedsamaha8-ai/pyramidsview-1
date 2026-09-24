import { ReceiptClaimData } from '../components/ReceiptClaimModal';
import { Resident } from '../types';
import { formatMobileNumber, formatPhoneForDisplay } from './phoneUtils';

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
  const rawPhone = data.phone || residentRecord?.phone || '';
  const formattedPhone = rawPhone ? formatMobileNumber(rawPhone) : '';

  const activityType = data.activityType || residentRecord?.activityType || 'سكني';
  const occupancyType = data.occupancyType || residentRecord?.ownershipType || 'تمليك';
  const displayMonthlyFee = data.monthlyFee || residentRecord?.monthlyFee || (activityType === 'إداري' ? 800 : activityType === 'تحت التشطيب' ? 200 : 400);

  const carriedDebt = (() => {
    if (data.carriedBalance !== undefined && data.carriedBalance < 0) return Math.abs(data.carriedBalance);
    if (data.carriedBalance !== undefined && data.carriedBalance > 0) return 0;
    if (residentRecord?.initialBalance !== undefined && residentRecord.initialBalance < 0) return Math.abs(residentRecord.initialBalance);
    return 0;
  })();

  const showCarriedDebt = carriedDebt > 0;

  return {
    isReceipt,
    monthName,
    docNumber,
    displayFormattedDate,
    residentRecord,
    formattedPhone,
    activityType,
    occupancyType,
    displayMonthlyFee,
    carriedDebt,
    showCarriedDebt
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
    formattedPhone,
    activityType,
    occupancyType,
    displayMonthlyFee,
    carriedDebt,
    showCarriedDebt
  } = meta;

  const canvas = document.createElement('canvas');
  const dpr = 2; // High-resolution Retina
  const width = customWidth;
  // Calculate height dynamically based on content
  const height = isReceipt 
    ? (showCarriedDebt ? 690 : 610) 
    : (showCarriedDebt ? 620 : 540);

  canvas.width = width * dpr;
  canvas.height = height * dpr;
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
  ctx.font = `bold 18px ${fontFamily}`;
  const titleText = isReceipt ? '💐 إيصال سداد واستلام مالي معتمد' : '🏛️ إشعار مطالبة وبيان مستحقات شهرية';
  ctx.fillText(titleText, width - padding - 18, currentY + 35);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 12.5px ${fontFamily}`;
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

  // 3. Status Alert Bar
  const alertHeight = 40;
  const alertBg = isReceipt ? '#ecfdf5' : '#fffbeb';
  const alertBorder = isReceipt ? '#a7f3d0' : '#fde68a';
  drawRoundRect(padding, currentY, contentWidth, alertHeight, 14, alertBg, alertBorder, 1);

  // Status message
  ctx.textAlign = 'right';
  ctx.fillStyle = isReceipt ? '#047857' : '#92400e';
  ctx.font = `bold 12px ${fontFamily}`;
  const alertMsg = isReceipt
    ? '✓ تم استلام مبلغ الاشتراك بنجاح وتوثيقه في السجل المالي المعتمد'
    : '⏳ نأمل المبادرة بالسداد لدعم استمرار خدمات وصيانة العمارة';
  ctx.fillText(alertMsg, width - padding - 16, currentY + 25);

  // Status Badge Pill on left
  const badgeW = isReceipt ? 86 : 98;
  const badgeH = 26;
  const badgeX = padding + 14;
  const badgeY = currentY + 7;
  const badgeBg = isReceipt ? '#d1fae5' : '#fef3c7';
  drawRoundRect(badgeX, badgeY, badgeW, badgeH, 13, badgeBg);

  ctx.textAlign = 'center';
  ctx.fillStyle = isReceipt ? '#047857' : '#92400e';
  ctx.font = `bold 11.5px ${fontFamily}`;
  ctx.fillText(isReceipt ? 'تم السداد ✓' : '⏳ مطالبة بالسداد', badgeX + badgeW / 2, badgeY + 17);

  currentY += alertHeight + 14;

  // 4. Structured Table
  const rowHeight = 38;
  const rowCount = isReceipt ? 4 : 2;
  const tableHeight = rowHeight * rowCount;
  drawRoundRect(padding, currentY, contentWidth, tableHeight, 16, '#f8fafc', '#e2e8f0', 1);

  const colMid = padding + contentWidth / 2;

  // Table row drawing helper
  const drawTableRow = (
    rowIdx: number,
    col1Label: string,
    col1Val: string,
    col2Label: string,
    col2Val: string,
    col2ValColor: string = '#0f172a'
  ) => {
    const y = currentY + rowIdx * rowHeight;

    // Divider line between rows
    if (rowIdx > 0) {
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Right Column (col1)
    ctx.textAlign = 'right';
    ctx.font = `bold 12px ${fontFamily}`;
    ctx.fillStyle = '#64748b';
    ctx.fillText(col1Label, width - padding - 14, y + 24);

    const col1LabelWidth = ctx.measureText(col1Label).width;
    ctx.font = `bold 12.5px ${fontFamily}`;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(col1Val, width - padding - 14 - col1LabelWidth - 8, y + 24);

    // Left Column (col2)
    if (col2Label) {
      ctx.textAlign = 'right';
      ctx.font = `bold 12px ${fontFamily}`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(col2Label, colMid - 10, y + 24);

      const col2LabelWidth = ctx.measureText(col2Label).width;
      ctx.font = `bold 12.5px ${fontFamily}`;
      ctx.fillStyle = col2ValColor;
      ctx.fillText(col2Val, colMid - 10 - col2LabelWidth - 8, y + 24);
    }
  };

  // Row 1
  const residentNameFull = `${data.residentName} ${formattedPhone ? `(${formattedPhone})` : ''}`;
  const unitStr = `شقة ${data.unitNumber} (${activityType})`;
  drawTableRow(0, 'اسم الشاغل:', residentNameFull, 'رقم الوحدة:', unitStr, '#1e3a8a');

  // Row 2
  const monthStr = `اشتراك ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م)`;
  const occStr = `${occupancyType}${activityType ? ` / ${activityType}` : ''}`;
  drawTableRow(1, 'عن شهر:', monthStr, 'نوع الإشغال:', occStr);

  if (isReceipt) {
    // Row 3
    const payDate = data.date || `${data.year}-${String(data.month).padStart(2, '0')}`;
    const payCat = data.paymentType || 'اشتراك شهري';
    drawTableRow(2, 'تاريخ السداد:', payDate, 'نوع التحصيل:', payCat, '#047857');

    // Row 4
    const payMethod = data.notes?.includes('تحويل') ? 'تحويل بنكي / محفظة' : 'سداد نقدي';
    drawTableRow(3, 'طريقة السداد:', payMethod, '', '');
  }

  currentY += tableHeight + 14;

  // 5. Debt Notice Box (if any)
  if (showCarriedDebt) {
    const debtBoxHeight = 54;
    drawRoundRect(padding, currentY, contentWidth, debtBoxHeight, 14, '#fef2f2', '#fecaca', 1);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#991b1b';
    ctx.font = `bold 12px ${fontFamily}`;
    ctx.fillText('⚠️ تنبيه بوجود مديونية قديمة مرحلة:', width - padding - 16, currentY + 22);

    ctx.font = `bold 12.5px ${fontFamily}`;
    ctx.fillText(
      `توجد مديونية قديمة مرحلة على الوحدة قدرها: ${Math.round(carriedDebt).toLocaleString()} ج.م`,
      width - padding - 16,
      currentY + 41
    );

    currentY += debtBoxHeight + 12;
  }

  // 6. Encouraging / Thanking Note Box
  const noteHeight = 52;
  const noteBg = isReceipt ? '#f0fdf4' : '#eff6ff';
  const noteBorder = isReceipt ? '#bbf7d0' : '#bfdbfe';
  drawRoundRect(padding, currentY, contentWidth, noteHeight, 14, noteBg, noteBorder, 1);

  ctx.textAlign = 'right';
  ctx.fillStyle = isReceipt ? '#166534' : '#1e40af';
  ctx.font = `bold 11.5px ${fontFamily}`;
  if (isReceipt) {
    ctx.fillText(
      '🌺 نشكركم جزيل الشكر والتقدير على حرصكم الدائم وسدادكم المنتظم،',
      width - padding - 16,
      currentY + 22
    );
    ctx.fillText(
      'مما يساهم مباشرةً في الحفاظ على العمارة وتطوير صيانتها وخدماتها لراحة الجميع.',
      width - padding - 16,
      currentY + 39
    );
  } else {
    ctx.fillText(
      '🤝 نأمل من سيادتكم التكرم بالمبادرة بسداد المستحقات والمديونيات في أقرب وقت',
      width - padding - 16,
      currentY + 22
    );
    ctx.fillText(
      'لضمان استمرار خدمات النظافة، الحراسة، الصيانة، وتشغيل المصاعد بكفاءة لراحة جميع السكّان.',
      width - padding - 16,
      currentY + 39
    );
  }

  currentY += noteHeight + 14;

  // 7. Grand Total Amount Banner
  const totalHeight = 56;
  const totalBg = isReceipt ? '#ecfdf5' : '#ffffff';
  const totalBorder = isReceipt ? '#059669' : '#e11d48';
  drawRoundRect(padding, currentY, contentWidth, totalHeight, 16, totalBg, totalBorder, 2);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold 14px ${fontFamily}`;
  const totalLabel = isReceipt ? 'إجمالي المبلغ المسدد معتمداً:' : 'إجمالي المبلغ المستحق للسداد:';
  ctx.fillText(totalLabel, width - padding - 18, currentY + 34);

  ctx.textAlign = 'left';
  ctx.fillStyle = isReceipt ? '#047857' : '#be123c';
  ctx.font = `900 22px ${fontFamily}`;
  ctx.fillText(`${Math.round(data.amount).toLocaleString()} ج.م`, padding + 18, currentY + 36);

  currentY += totalHeight + 14;

  // 8. Certified Footer
  ctx.beginPath();
  ctx.moveTo(padding, currentY);
  ctx.lineTo(width - padding, currentY);
  ctx.strokeStyle = '#cbd5e1';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  // Footer text
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = `bold 10px ${fontFamily}`;
  ctx.fillText('تم استخراج هذا الإيصال إلكترونياً ومطابق للسجلات المالية الرسمية', width - padding, currentY + 18);

  // Certified badge on left
  drawRoundRect(padding, currentY + 6, 175, 20, 6, '#f1f5f9', '#94a3b8', 1);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#334155';
  ctx.font = `bold 9.5px ${fontFamily}`;
  ctx.fillText('معتمد إلكترونياً ✓ اتحاد ملاك بيراميدز فيو ١', padding + 175 / 2, currentY + 19);

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
  const canvas = generateReceiptClaimCanvas(data, residents);
  const dataUrl = canvas.toDataURL('image/png', 1.0);

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => {
      resolve(b || new Blob([], { type: 'image/png' }));
    }, 'image/png', 1.0);
  });

  const safeFileName = fileName || (data.type === 'receipt'
    ? `إيصال_سداد_شقة_${data.unitNumber}_شهر_${data.month}_${data.year}.png`
    : `إشعار_مطالبة_شقة_${data.unitNumber}_شهر_${data.month}_${data.year}.png`);

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
    formattedPhone,
    activityType,
    occupancyType,
    displayMonthlyFee,
    carriedDebt,
    showCarriedDebt
  } = meta;

  const headerBg = isReceipt ? '#047857' : '#1d4ed8';
  const alertBg = isReceipt ? '#ecfdf5' : '#fffbeb';
  const alertBorder = isReceipt ? '#a7f3d0' : '#fde68a';
  const alertColor = isReceipt ? '#047857' : '#92400e';
  const badgeBg = isReceipt ? '#d1fae5' : '#fef3c7';

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${isReceipt ? `إيصال سداد شقة ${data.unitNumber}` : `إشعار مطالبة شقة ${data.unitNumber}`}</title>
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
      font-size: 18px;
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
      padding: 10px 14px;
      color: #991b1b;
      font-size: 12px;
      margin-bottom: 14px;
      font-weight: 800;
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
        <div class="header-title">${isReceipt ? '💐 إيصال سداد واستلام مالي معتمد' : '🏛️ إشعار مطالبة وبيان مستحقات شهرية'}</div>
        <div class="header-sub">اتحاد ملاك عمارة بيراميدز فيو ١</div>
      </div>
      <div class="header-meta">
        <div>التاريخ: ${displayFormattedDate}</div>
        <div>المرجع: ${docNumber}</div>
      </div>
    </div>

    <div class="status-bar">
      <div>${isReceipt ? '✓ تم استلام مبلغ الاشتراك بنجاح وتوثيقه في السجل المالي المعتمد' : '⏳ نأمل المبادرة بالسداد لدعم استمرار خدمات وصيانة العمارة'}</div>
      <div class="status-badge">${isReceipt ? 'تم السداد ✓' : '⏳ مطالبة بالسداد'}</div>
    </div>

    <div class="info-table">
      <div class="info-row">
        <div class="info-col">
          <span class="label">اسم الشاغل:</span>
          <span class="value">${data.residentName} ${formattedPhone ? `(${formattedPhone})` : ''}</span>
        </div>
        <div class="info-col">
          <span class="label">رقم الوحدة:</span>
          <span class="value highlight">شقة ${data.unitNumber} (${activityType})</span>
        </div>
      </div>

      <div class="info-row">
        <div class="info-col">
          <span class="label">عن شهر:</span>
          <span class="value">اشتراك ${monthName} ${data.year} (${Math.round(displayMonthlyFee).toLocaleString()} ج.م)</span>
        </div>
        <div class="info-col">
          <span class="label">نوع الإشغال:</span>
          <span class="value">${occupancyType}${activityType ? ` / ${activityType}` : ''}</span>
        </div>
      </div>

      ${isReceipt ? `
      <div class="info-row">
        <div class="info-col">
          <span class="label">تاريخ السداد:</span>
          <span class="value">${data.date || `${data.year}-${String(data.month).padStart(2, '0')}`}</span>
        </div>
        <div class="info-col">
          <span class="label">نوع التحصيل:</span>
          <span class="value" style="color: #047857;">${data.paymentType || 'اشتراك شهري'}</span>
        </div>
      </div>

      <div class="info-row">
        <div class="info-col">
          <span class="label">طريقة السداد:</span>
          <span class="value" style="color: #047857;">${data.notes?.includes('تحويل') ? 'تحويل بنكي / محفظة' : 'سداد نقدي'}</span>
        </div>
        <div class="info-col"></div>
      </div>
      ` : ''}
    </div>

    ${showCarriedDebt ? `
    <div class="debt-box">
      <div>⚠️ تنبيه بوجود مديونية قديمة مرحلة:</div>
      <div style="margin-top: 3px;">توجد مديونية قديمة مرحلة على الوحدة قدرها: <u>${Math.round(carriedDebt).toLocaleString()} ج.م</u></div>
    </div>
    ` : ''}

    <div class="note-box">
      ${isReceipt 
        ? '🌺 نشكركم جزيل الشكر والتقدير على حرصكم الدائم وسدادكم المنتظم، مما يساهم مباشرةً في الحفاظ على العمارة وتطوير خدماتها لراحة الجميع.'
        : '🤝 نأمل من سيادتكم التكرم بالمبادرة بسداد المستحقات والمديونيات في أقرب وقت لضمان استمرار خدمات النظافة، الحراسة، الصيانة، وتشغيل المصاعد بكفاءة لراحة جميع السكّان.'
      }
    </div>

    <div class="total-banner">
      <span class="total-label">${isReceipt ? 'إجمالي المبلغ المسدد معتمداً:' : 'إجمالي المبلغ المستحق للسداد:'}</span>
      <span class="total-val">${Math.round(data.amount).toLocaleString()} ج.م</span>
    </div>

    <div class="footer">
      <div class="cert-badge">معتمد إلكترونياً ✓ اتحاد ملاك بيراميدز فيو ١</div>
      <span>تم استخراج هذا الإيصال إلكترونياً ومطابق للسجلات المالية الرسمية</span>
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
