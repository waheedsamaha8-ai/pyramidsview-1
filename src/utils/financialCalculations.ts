import { Resident, Payment, Expense, AppConfig, ActivityFeePeriod, CustomUnitFeePeriod } from '../types';
import { 
  isSameFlatNumber, 
  parseFlatNumber,
  getHistoricalActivityForDate, 
  getDefaultFeeForActivity,
  sortActivityRecordsChronologically,
  parseToStandardDate,
  isPeriodMatchingTarget
} from './buildingStructure';
import { findMatchingActivityFeePeriod } from './periodUtils';

/**
 * Determines the effective monthly fee for a resident (optionally for a specific historical date/period)
 * Hierarchy:
 * 1. Month-specific collection payment (if a payment exists for this unit in that month, its amount is the prescribed fee)
 * 2. Activity fee defined for the period covering targetDateOrPeriod (ActivityFeePeriod)
 * 3. Unit-specific fee if manually set in the units table (resident.monthlyFee)
 * 4. Default fee for the activity from Settings tab (config.activityDefaultFees or defaultMonthlyFee)
 */
export function getResidentMonthlyFee(
  resident: Resident,
  defaultMonthlyFee: number = 400,
  activityDefaultFees?: Record<string, number>,
  targetDateOrPeriod?: string | number,
  payments?: Payment[] | PaymentLookupIndex,
  activityFeePeriods?: ActivityFeePeriod[],
  customUnitFeePeriods?: CustomUnitFeePeriod[]
): number {
  if (!resident) return defaultMonthlyFee || 400;

  const flatKey = String(resident.flatNumber);
  const cleanAct = (resident.activityType || 'سكني').trim();
  if (cleanAct === 'بدون تشطيب' || cleanAct === 'بدون تحصيل' || cleanAct.includes('بدون تشطيب') || cleanAct.includes('بدون تحصيل')) {
    return 0;
  }

  // 1. أولاً: التعديل اليدوي على قيمة المبلغ المستحق في دفعة التحصيل أو الاستحقاق (المصدر الأول للمبلغ المستحق)
  if (targetDateOrPeriod && payments) {
    const resPayments = getPaymentsForResident(resident, payments);
    const periodStr = String(targetDateOrPeriod);
    const parts = periodStr.split('-');
    const targetY = parts.length >= 1 ? parseInt(parts[0], 10) : 0;
    const targetM = parts.length >= 2 ? parseInt(parts[1], 10) : 0;

    if (targetY && targetM) {
      const monthPayment = resPayments.find(p => {
        const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : targetY);
        const pMonth = parseInt(String(p.month), 10);
        if (pYear !== targetY || pMonth !== targetM || !isMonthlySubscriptionType(p.paymentType) || p.status === 'cancelled' || p.status === 'لاغي') return false;
        return (p.expectedAmount !== undefined && !isNaN(p.expectedAmount) && p.expectedAmount > 0) ||
               (p.dueAmount !== undefined && !isNaN(p.dueAmount) && p.dueAmount > 0);
      });
      if (monthPayment) {
        if (monthPayment.expectedAmount !== undefined && !isNaN(monthPayment.expectedAmount) && monthPayment.expectedAmount > 0) {
          return monthPayment.expectedAmount;
        }
        if (monthPayment.dueAmount !== undefined && !isNaN(monthPayment.dueAmount) && monthPayment.dueAmount > 0) {
          return monthPayment.dueAmount;
        }
      }
    }
  }

  // 2. ثانياً: سجل الوحدة الشامل (تسلسل النشاط والاستخدام طبقا للفترة الزمنية التي يوجد بها شهر التحصيل)
  if (resident.activityHistory && resident.activityHistory.length > 0) {
    const act = getHistoricalActivityForDate(resident, targetDateOrPeriod, defaultMonthlyFee, activityDefaultFees, activityFeePeriods);
    if (act && act.monthlyFee !== undefined && !isNaN(act.monthlyFee) && act.monthlyFee >= 0) {
      return act.monthlyFee;
    }
  }

  // 3. ثالثاً: عمود فترة التسعير الموجود في إدارة اشتراكات الوحدة إذا لم يكن هناك تسلسل نشاط واستخدام في السجل
  if (customUnitFeePeriods && customUnitFeePeriods.length > 0) {
    if (targetDateOrPeriod) {
      const periodStr = String(targetDateOrPeriod);
      const parts = periodStr.split('-');
      const tY = parts.length >= 1 ? parseInt(parts[0], 10) : 0;
      const tM = parts.length >= 2 ? parseInt(parts[1], 10) : 0;
      if (tY && tM) {
        for (const p of customUnitFeePeriods) {
          const isMatch = p.isCurrent
            ? (tY > p.startYear || (tY === p.startYear && tM >= p.startMonth))
            : (
                (tY > p.startYear || (tY === p.startYear && tM >= p.startMonth)) &&
                (tY < (p.endYear ?? 9999) || (tY === p.endYear && tM <= (p.endMonth ?? 12)))
              );
          if (isMatch && p.unitFees && p.unitFees[flatKey] !== undefined && !isNaN(p.unitFees[flatKey])) {
            return p.unitFees[flatKey];
          }
        }
      }
    } else {
      const currentPeriod = customUnitFeePeriods.find(p => p.isCurrent || p.title === 'الحالي');
      if (currentPeriod && currentPeriod.unitFees && currentPeriod.unitFees[flatKey] !== undefined && !isNaN(currentPeriod.unitFees[flatKey])) {
        return currentPeriod.unitFees[flatKey];
      }
    }
  }

  // 4. رابعاً: القيمة المحددة بالوحدة (resident.monthlyFee)
  if (resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee > 0) {
    return resident.monthlyFee;
  }

  // 5. خامساً: طبقاً لقيمة التحصيل الشهري المسجل للفترات المحاسبية (activityFeePeriods)
  if (targetDateOrPeriod && activityFeePeriods && activityFeePeriods.length > 0) {
    const matched = findMatchingActivityFeePeriod(targetDateOrPeriod, activityFeePeriods);
    if (matched && matched.fees && matched.fees[cleanAct] !== undefined) {
      return matched.fees[cleanAct];
    }
  }

  // 6. القيمة الافتراضية للنشاط من الإعدادات
  return getDefaultFeeForActivity(resident.activityType, defaultMonthlyFee, activityDefaultFees, targetDateOrPeriod, activityFeePeriods);
}

/**
 * Resolves the prescribed monthly subscription fee and activity type for a resident for a specific year and month:
 * الترتيب المعتمد لمصادر المبلغ المستحق:
 * 1. المصدر الأول: التعديل اليدوي على قيمة المبلغ المستحق في دفعة التحصيل أو الاستحقاق (expectedAmount أو dueAmount).
 * 2. المصدر الثاني: سجل الوحدة الشامل من قيمة الاشتراك الشهري المعتمد من تبويب تسلسل النشاط والاستخدام طبقا للفترة الزمنية التي يوجد بها شهر التحصيل.
 * 3. المصدر الثالث: عمود فترة التسعير الموجود في إدارة اشتراكات الوحدة (customUnitFeePeriods) إذا لم يكن هناك تسلسل للنشاط والاستخدام بسجل الوحدة.
 * 4. القيمة المحددة بالوحدة أو activityFeePeriods أو القيمة الافتراضية للنشاط.
 */
export function getPrescribedFeeForMonth(
  resident: Resident,
  year: number,
  month: number,
  allResidentPayments: Payment[] = [],
  defaultMonthlyFee: number = 400,
  activityDefaultFees?: Record<string, number>,
  activityFeePeriods?: ActivityFeePeriod[],
  customUnitFeePeriods?: CustomUnitFeePeriod[]
): { monthlyFee: number; activityType: string } {
  if (!resident) {
    return { monthlyFee: 0, activityType: 'سكني' };
  }

  const cleanAct = (resident.activityType || 'سكني').trim();
  if (cleanAct === 'بدون تشطيب' || cleanAct === 'بدون تحصيل' || cleanAct.includes('بدون تشطيب') || cleanAct.includes('بدون تحصيل')) {
    return { monthlyFee: 0, activityType: cleanAct };
  }

  const mNum = Number(month);
  const yNum = Number(year);
  const mStr = String(month).padStart(2, '0');
  const periodStr = `${year}-${mStr}`;

  // 1. أولاً: التعديل اليدوي على قيمة المبلغ المستحق في دفعة التحصيل أو الاستحقاق (المصدر الأول للمبلغ المستحق)
  if (allResidentPayments && allResidentPayments.length > 0) {
    const monthPayment = allResidentPayments.find(p => {
      if (p.status === 'cancelled' || p.status === 'لاغي') return false;
      const isMatchUnit = (resident.id && String(p.residentId || '').trim() === String(resident.id).trim()) ||
        isSameFlatNumber(p.flatNumber, resident.flatNumber);
      if (!isMatchUnit) return false;
      const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : yNum);
      const pMonth = parseInt(String(p.month), 10);
      if (pYear !== yNum || pMonth !== mNum || !isMonthlySubscriptionType(p.paymentType)) return false;

      return (p.expectedAmount !== undefined && !isNaN(p.expectedAmount) && p.expectedAmount > 0) ||
             (p.dueAmount !== undefined && !isNaN(p.dueAmount) && p.dueAmount > 0);
    });

    if (monthPayment) {
      const manualDue = (monthPayment.expectedAmount !== undefined && !isNaN(monthPayment.expectedAmount) && monthPayment.expectedAmount > 0)
        ? monthPayment.expectedAmount
        : monthPayment.dueAmount;
      if (manualDue !== undefined) {
        return {
          monthlyFee: manualDue,
          activityType: resident.activityType || 'سكني',
        };
      }
    }
  }

  // 2. ثانياً: سجل الوحدة الشامل من قيمة الاشتراك الشهري المعتمد من تبويب تسلسل النشاط والاستخدام طبقاً للفترة الزمنية لشهر التحصيل (المصدر الثاني)
  if (resident.activityHistory && Array.isArray(resident.activityHistory) && resident.activityHistory.length > 0) {
    const historyList = sortActivityRecordsChronologically(resident.activityHistory);
    const parsedTarget = parseToStandardDate(periodStr);
    if (parsedTarget) {
      const explicitMatch = historyList.find(rec =>
        isPeriodMatchingTarget(parsedTarget, rec.fromDate, rec.toDate)
      );
      if (explicitMatch) {
        const matchAct = (explicitMatch.activityType || resident.activityType || 'سكني').trim();
        if (matchAct === 'بدون تشطيب' || matchAct === 'بدون تحصيل' || matchAct.includes('بدون تشطيب') || matchAct.includes('بدون تحصيل')) {
          return { monthlyFee: 0, activityType: matchAct };
        }
        if (explicitMatch.monthlyFee !== undefined && !isNaN(explicitMatch.monthlyFee) && explicitMatch.monthlyFee >= 0) {
          return {
            monthlyFee: explicitMatch.monthlyFee,
            activityType: matchAct,
          };
        }
      }
    }
  }

  // 3. ثالثاً: عمود فترة التسعير الموجود في إدارة اشتراكات الوحدة إذا لم يكن هناك تسلسل للنشاط والاستخدام بسجل الوحدة (المصدر الثالث)
  if (customUnitFeePeriods && customUnitFeePeriods.length > 0) {
    const flatKey = String(resident.flatNumber).trim();
    const targetTotal = year * 12 + month;

    const matchesPeriod = (p: CustomUnitFeePeriod) => {
      const startTotal = (p.startYear ?? 0) * 12 + (p.startMonth ?? 1);
      const endTotal = (p.endYear ?? 9999) * 12 + (p.endMonth ?? 12);
      return targetTotal >= startTotal && targetTotal <= endTotal;
    };

    const getFeeFromPeriod = (p: CustomUnitFeePeriod): number | undefined => {
      if (!p.unitFees) return undefined;
      if (p.unitFees[flatKey] !== undefined && !isNaN(p.unitFees[flatKey]) && p.unitFees[flatKey] >= 0) {
        return p.unitFees[flatKey];
      }
      if (resident.id && p.unitFees[resident.id] !== undefined && !isNaN(p.unitFees[resident.id]) && p.unitFees[resident.id] >= 0) {
        return p.unitFees[resident.id];
      }
      const matchedKey = Object.keys(p.unitFees).find(k => isSameFlatNumber(k, flatKey));
      if (matchedKey && p.unitFees[matchedKey] !== undefined && !isNaN(p.unitFees[matchedKey]) && p.unitFees[matchedKey] >= 0) {
        return p.unitFees[matchedKey];
      }
      return undefined;
    };

    // أ. فترات التسعير المحصورة بالتاريخ أولاً (مثل من 1/2022 إلى 12/2022)
    const boundedPeriods = customUnitFeePeriods.filter(p => !p.isCurrent && p.startYear !== undefined && p.startMonth !== undefined);
    for (const p of boundedPeriods) {
      if (matchesPeriod(p)) {
        const fee = getFeeFromPeriod(p);
        if (fee !== undefined) {
          return {
            monthlyFee: fee,
            activityType: resident.activityType || 'سكني',
          };
        }
      }
    }

    // ب. فترة التسعير الحالية (المستمرة حتى تاريخه)
    const currentPeriods = customUnitFeePeriods.filter(p => p.isCurrent || p.endYear === undefined || p.endMonth === undefined);
    for (const p of currentPeriods) {
      const startTotal = (p.startYear ?? 0) * 12 + (p.startMonth ?? 1);
      const isMatch = p.isCurrent ? (targetTotal >= startTotal) : matchesPeriod(p);
      if (isMatch) {
        const fee = getFeeFromPeriod(p);
        if (fee !== undefined) {
          return {
            monthlyFee: fee,
            activityType: resident.activityType || 'سكني',
          };
        }
      }
    }
  }

  // 4. رابعاً: القيمة المحددة في سجل الوحدة (resident.monthlyFee)
  if (resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee > 0) {
    return {
      monthlyFee: resident.monthlyFee,
      activityType: resident.activityType || 'سكني',
    };
  }

  // 4. رابعاً: طبقاً لفترات النشاط العامة (activityFeePeriods)
  if (activityFeePeriods && activityFeePeriods.length > 0) {
    const matched = findMatchingActivityFeePeriod(periodStr, activityFeePeriods);
    if (matched && matched.fees && matched.fees[cleanAct] !== undefined) {
      return {
        monthlyFee: matched.fees[cleanAct],
        activityType: resident.activityType || 'سكني',
      };
    }
  }

  // 5. خامساً: القيمة الافتراضية للنشاط من الإعدادات
  const defaultFee = getDefaultFeeForActivity(resident.activityType, defaultMonthlyFee, activityDefaultFees, periodStr, activityFeePeriods);
  return {
    monthlyFee: defaultFee,
    activityType: resident.activityType || 'سكني',
  };
}

export interface PaymentLookupIndex {
  byFlat: Map<string, Payment[]>;
  byId: Map<string, Payment[]>;
  all: Payment[];
}

/**
 * Builds an O(1) indexed lookup table for payments by resident ID and flat number.
 * Dramatically speeds up resident dues calculations across large sets.
 */
export function buildPaymentLookupIndex(payments: Payment[] = []): PaymentLookupIndex {
  const byFlat = new Map<string, Payment[]>();
  const byId = new Map<string, Payment[]>();

  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    if (!p) continue;

    if (p.residentId) {
      const rId = String(p.residentId).trim();
      let list = byId.get(rId);
      if (!list) {
        list = [];
        byId.set(rId, list);
      }
      list.push(p);
    }

    if (p.flatNumber !== undefined && p.flatNumber !== null) {
      const parsed = parseFlatNumber(p.flatNumber);
      const flatKey = parsed.main !== 999999 ? `${parsed.main}-${parsed.sub}` : String(p.flatNumber).trim();
      let list = byFlat.get(flatKey);
      if (!list) {
        list = [];
        byFlat.set(flatKey, list);
      }
      list.push(p);

      const rawKey = String(p.flatNumber).trim();
      if (rawKey && rawKey !== flatKey) {
        let rawList = byFlat.get(rawKey);
        if (!rawList) {
          rawList = [];
          byFlat.set(rawKey, rawList);
        }
        rawList.push(p);
      }
    }
  }

  return { byFlat, byId, all: payments };
}

/**
 * Fast lookup of payments associated with a specific resident.
 */
export function getPaymentsForResident(
  resident: Resident,
  paymentsOrIndex: Payment[] | PaymentLookupIndex = []
): Payment[] {
  if (!Array.isArray(paymentsOrIndex)) {
    // Using PaymentLookupIndex for instant retrieval
    const index = paymentsOrIndex;
    const rId = resident.id ? String(resident.id).trim() : '';
    const resParsed = parseFlatNumber(resident.flatNumber);
    const flatKey = resParsed.main !== 999999 ? `${resParsed.main}-${resParsed.sub}` : (resident.flatNumber !== undefined && resident.flatNumber !== null ? String(resident.flatNumber).trim() : '');
    const rawKey = resident.flatNumber !== undefined && resident.flatNumber !== null ? String(resident.flatNumber).trim() : '';
    
    const byIdList = rId ? index.byId.get(rId) : undefined;
    const byFlatList = flatKey ? index.byFlat.get(flatKey) : (rawKey ? index.byFlat.get(rawKey) : undefined);

    if (byIdList || byFlatList) {
      const seen = new Set<string>();
      const merged: Payment[] = [];
      if (byIdList) {
        for (let i = 0; i < byIdList.length; i++) {
          const item = byIdList[i];
          seen.add(item.id);
          merged.push(item);
        }
      }
      if (byFlatList) {
        for (let i = 0; i < byFlatList.length; i++) {
          const item = byFlatList[i];
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
      }
      return merged;
    }

    // Fallback in case of non-exact flat number format (e.g. 502 vs 502-1)
    return index.all.filter(p => 
      isSameFlatNumber(p.flatNumber, resident.flatNumber) ||
      (rId && p.residentId && String(p.residentId).trim() === rId)
    );
  }

  // Fallback to array filtering
  return paymentsOrIndex.filter(p => 
    isSameFlatNumber(p.flatNumber, resident.flatNumber) || 
    (resident.id && p.residentId && String(p.residentId).trim() === String(resident.id).trim())
  );
}

/**
 * Checks whether a payment type represents the regular recurring monthly subscription
 */
export function isMonthlySubscriptionType(paymentType?: string): boolean {
  if (!paymentType) return true;
  const t = paymentType.trim();

  // If it explicitly says subscription or monthly, it is ALWAYS a monthly subscription
  if (t === 'اشتراك شهري' || t === 'اشتراك' || t.includes('اشتراك') || t.includes('شهري')) {
    return true;
  }

  // Explicit check for non-subscription other collection categories
  if (
    t.includes('أخرى') ||
    t.includes('أخري') ||
    t.includes('اخرى') ||
    t.includes('اخري') ||
    t.includes('صيانة') ||
    t.includes('مصعد') ||
    t.includes('حراسة') ||
    t.includes('انتركم') ||
    t.includes('خدمات') ||
    t.includes('وديعة') ||
    t.includes('كهرباء') ||
    t.includes('مياه') ||
    t.includes('غرامة') ||
    t.includes('مرافق')
  ) {
    return false;
  }

  return (
    t.includes('توزيع مجمع') ||
    t.includes('مجمع') ||
    t === 'تحصيل' ||
    t === 'تحصيل مجمع' ||
    t === 'تحصيل شهري'
  );
}

/**
 * Unified check for whether a payment record represents an unpaid/pending payment.
 */
export function isPendingUnpaidPayment(p: Payment): boolean {
  if (!p) return false;
  if ((p as any).isDeleted || p.status === 'deleted') return false;
  const s = p.status ? String(p.status).trim().toLowerCase() : '';
  if (!s) return false;
  return (
    s === 'pending' ||
    s === 'unpaid' ||
    s === 'uncollected' ||
    s.includes('معلق') ||
    s.includes('غير مسدد') ||
    s.includes('لم يسدد') ||
    s.includes('لم تسدد') ||
    s.includes('لم يتم') ||
    s.includes('غير محصل') ||
    s.includes('غير مدفوع') ||
    s.includes('قيد التحصيل') ||
    s.includes('تحت التحصيل')
  );
}

export function isDistributedChildPayment(p: Payment): boolean {
  if (!p) return false;
  if (p.distributionSourceId && String(p.distributionSourceId) !== String(p.id)) return true;
  if (p.notes && (p.notes.includes('تم السداد في شهر') || p.notes.includes('القيمة الموزعة للشهر'))) {
    return true;
  }
  return false;
}

export function isMasterDistributionPayment(p: Payment, allPayments?: Payment[]): boolean {
  if (!p) return false;
  if (isDistributedChildPayment(p)) return false;
  if (p.isDistributed) return true;
  if (Array.isArray(p.distributedPaymentIds) && p.distributedPaymentIds.length > 0) return true;
  if (allPayments && allPayments.some(other => String(other.id) !== String(p.id) && String(other.distributionSourceId || '') === String(p.id))) return true;
  return false;
}

/**
 * Unified check for whether a payment record represents a valid completed/collected payment.
 * Note: A distributed master payment represents the active, valid collection for its own designated month
 * with its allocated monthly amount, and MUST be counted as a valid paid payment.
 */
export function isValidPaidPayment(p: Payment): boolean {
  if (!p) return false;
  if ((p as any).isDeleted || p.status === 'deleted') return false;
  const s = p.status ? String(p.status).trim().toLowerCase() : '';

  // Cancelled or void
  if (s === 'cancelled' || s.includes('لاغي') || s.includes('ملغي') || s.includes('ملغية')) {
    return false;
  }

  // Pending / Uncollected / Unpaid / Suspended
  if (isPendingUnpaidPayment(p)) {
    return false;
  }

  return true;
}

/**
 * Extracts and normalizes the target accounting year of a payment.
 */
export function parsePaymentYear(p: Payment, defaultYear?: number): number | null {
  if (!p) return null;
  if (p.year !== undefined && p.year !== null) {
    const s = String(p.year).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()).trim();
    const y = Number(s);
    if (!isNaN(y) && y > 1900 && y < 2200) {
      return y;
    }
  }
  // Also check if p.month has YYYY-MM
  if (p.month !== undefined && p.month !== null) {
    const ymMatch = String(p.month).match(/((?:19|20)\d{2})[-\/\.]\d{1,2}/);
    if (ymMatch) {
      const y = parseInt(ymMatch[1], 10);
      if (y > 1900 && y < 2200) return y;
    }
  }
  if (p.date) {
    const d = new Date(p.date);
    if (!isNaN(d.getTime())) {
      return d.getFullYear();
    }
  }
  return defaultYear ?? null;
}

/**
 * Robustly extracts the target accounting month (1-12) of a payment.
 * Prioritizes p.month and NEVER falls back to p.date if p.month was already specified.
 */
export function parsePaymentMonth(p: Payment): number | null {
  if (!p) return null;

  if (p.month !== undefined && p.month !== null) {
    const raw = String(p.month).trim();
    if (raw) {
      const s = raw.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());

      // 1. Check for YYYY-MM or YYYY/MM (e.g. "2026-01" or "2026-1")
      const ymMatch = s.match(/(?:19|20)\d{2}[-\/\.](\d{1,2})/);
      if (ymMatch) {
        const m = parseInt(ymMatch[1], 10);
        if (m >= 1 && m <= 12) return m;
      }

      // 2. Direct integer check (handles '1', '01', '12', etc.)
      const parsedInt = parseInt(s, 10);
      if (!isNaN(parsedInt) && parsedInt >= 1 && parsedInt <= 12) {
        return parsedInt;
      }

      // 3. Arabic months
      const arabicMonths = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
      ];
      for (let i = 0; i < arabicMonths.length; i++) {
        if (s === arabicMonths[i] || s.includes(arabicMonths[i])) {
          return i + 1;
        }
      }

      // 4. Regex for month number with or without leading zero
      const numMatch = s.match(/\b0?([1-9]|1[0-2])\b/);
      if (numMatch) {
        const m = parseInt(numMatch[1], 10);
        if (m >= 1 && m <= 12) return m;
      }

      return null;
    }
  }

  // Fallback to transaction date ONLY if p.month was completely empty or undefined
  if (p.date) {
    const d = new Date(p.date);
    if (!isNaN(d.getTime())) {
      return d.getMonth() + 1;
    }
  }

  return null;
}

/**
 * Robustly checks if a payment record matches a specific year and month.
 */
export function isPaymentForYearAndMonth(p: Payment, yNum: number, mNum: number): boolean {
  if (!p) return false;

  const pYear = parsePaymentYear(p, yNum);
  if (pYear !== yNum) return false;

  const pMonth = parsePaymentMonth(p);
  return pMonth === mNum;
}

/**
 * Extracts and normalizes the target accounting year of an expense.
 */
export function parseExpenseYear(e: Expense, defaultYear?: number): number | null {
  if (!e) return null;
  if (e.year !== undefined && e.year !== null) {
    const s = String(e.year).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()).trim();
    const y = Number(s);
    if (!isNaN(y) && y > 1900 && y < 2200) {
      return y;
    }
  }
  if (e.date) {
    const d = new Date(e.date);
    if (!isNaN(d.getTime())) {
      return d.getFullYear();
    }
  }
  return defaultYear ?? null;
}

/**
 * Robustly extracts the target accounting month (1-12) of an expense.
 * Strictly uses e.month (the designated accounting month) and NEVER falls back
 * to transaction/recording date if e.month is specified.
 */
export function parseExpenseMonth(e: Expense): number | null {
  if (!e) return null;

  if (e.month !== undefined && e.month !== null) {
    const raw = String(e.month).trim();
    if (raw) {
      const s = raw.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
      const parsedInt = parseInt(s, 10);
      if (!isNaN(parsedInt) && parsedInt >= 1 && parsedInt <= 12) {
        return parsedInt;
      }
      const arabicMonths = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
      ];
      for (let i = 0; i < arabicMonths.length; i++) {
        if (s === arabicMonths[i] || s.includes(arabicMonths[i])) {
          return i + 1;
        }
      }
      const numMatch = s.match(/\b([1-9]|1[0-2])\b/);
      if (numMatch) {
        const m = parseInt(numMatch[1], 10);
        if (m >= 1 && m <= 12) return m;
      }
      return null;
    }
  }

  // Fallback to invoice date ONLY if e.month was completely absent
  if (e.date) {
    const d = new Date(e.date);
    if (!isNaN(d.getTime())) {
      return d.getMonth() + 1;
    }
  }
  return null;
}

/**
 * Robustly checks if an expense record matches a specific accounting year and month.
 */
export function isExpenseForYearAndMonth(e: Expense, yNum: number, mNum: number): boolean {
  if (!e) return false;
  const eYear = parseExpenseYear(e, yNum);
  if (eYear !== yNum) return false;
  const eMonth = parseExpenseMonth(e);
  return eMonth === mNum;
}

/**
 * Calculates the carried forward previous balance for a resident up to the start of targetYear.
 * 
 * Automatic Rollover Logic:
 * - Start year is derived from config.accountingStartDate (e.g. 2026).
 * - For targetYear <= startYear:
 *     Returns resident.initialBalance || 0 (the balance from before the system started).
 * - For targetYear > startYear:
 *     1) Starts with resident.initialBalance || 0
 *     2) Adds all monthly subscription payments made in all previous years (year < targetYear)
 *     3) Subtracts all monthly dues for all elapsed months from accountingStartDate up to 31 Dec of (targetYear - 1).
 *     The result is the exact carried over balance (positive = surplus/credit, negative = debt).
 */
export function getCarriedPreviousBalance(
  resident: Resident,
  targetYear: number,
  paymentsOrIndex: Payment[] | PaymentLookupIndex = [],
  accountingStartDate: string = '2026-01-01',
  defaultMonthlyFee: number = 400,
  activityDefaultFees?: Record<string, number>,
  activityFeePeriods?: ActivityFeePeriod[],
  customUnitFeePeriods?: CustomUnitFeePeriod[]
): number {
  if (!resident) return 0;

  // 1. Check if an explicit exported balance exists for this target year / period
  if (resident.exportedYearBalances && (resident.exportedYearBalances[targetYear] !== undefined || resident.exportedYearBalances[String(targetYear)] !== undefined)) {
    const val = resident.exportedYearBalances[targetYear] ?? resident.exportedYearBalances[String(targetYear)];
    if (val !== undefined && !isNaN(val)) {
      return val;
    }
  }

  const start = new Date(accountingStartDate || '2026-01-01');
  const startYear = isNaN(start.getFullYear()) ? 2026 : start.getFullYear();
  const startMonth = isNaN(start.getMonth()) ? 0 : start.getMonth(); // 0-indexed

  if (targetYear <= startYear) {
    return resident.initialBalance || 0;
  }

  const fee = getResidentMonthlyFee(resident, defaultMonthlyFee, activityDefaultFees, undefined, undefined, activityFeePeriods, customUnitFeePeriods);

  // Calculate elapsed months from accountingStartDate up to the end of (targetYear - 1)
  // End date is December of targetYear - 1
  const yearsDiff = (targetYear - 1) - startYear;
  const elapsedMonthsPrior = (yearsDiff * 12) + (12 - startMonth);
  let duesPrior = 0;

  if ((resident.activityHistory && resident.activityHistory.length > 0) || (activityFeePeriods && activityFeePeriods.length > 0) || (customUnitFeePeriods && customUnitFeePeriods.length > 0)) {
    for (let y = startYear; y < targetYear; y++) {
      const mStart = (y === startYear) ? startMonth + 1 : 1;
      for (let m = mStart; m <= 12; m++) {
        const prescribed = getPrescribedFeeForMonth(resident, y, m, [], defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
        duesPrior += prescribed.monthlyFee;
      }
    }
  } else {
    duesPrior = elapsedMonthsPrior * fee;
  }

  // Retrieve only this resident's valid paid monthly payments (excluding cancelled and pending/uncollected ones)
  const allResidentPayments = getPaymentsForResident(resident, paymentsOrIndex);
  const residentMonthlyPayments = allResidentPayments
    .filter(p => isValidPaidPayment(p) && isMonthlySubscriptionType(p.paymentType));

  // Sum monthly subscription payments made before targetYear
  const paymentsPrior = residentMonthlyPayments
    .filter(p => {
      const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : startYear);
      return pYear < targetYear;
    })
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  // Carried balance = (initialBalance + paymentsPrior) - duesPrior
  const initialBal = resident.initialBalance || 0;
  return Math.round(initialBal + paymentsPrior - duesPrior);
}

/**
 * Calculates resident financials.
 * If targetYear is provided:
 *   Calculates previous balance carried over into targetYear, plus dues and payments inside targetYear.
 * If targetYear is undefined:
 *   Calculates cumulative all-time financials from accountingStartDate to today.
 *
 * Rules:
 * - "الاشتراك الشهري": pays for regular monthly dues, calculates unpaid months and monthly delay amount.
 * - "تحصيلات أخرى": special assessments/other collections calculated independently; paid amounts don't reduce monthly delay, unpaid amounts count as other collections debt.
 */
export function calculateResidentFinancials(
  resident: Resident,
  paymentsOrIndex: Payment[] | PaymentLookupIndex = [],
  accountingStartDate: string = '2026-01-01',
  defaultMonthlyFee: number = 400,
  activityDefaultFees?: Record<string, number>,
  targetYear?: number,
  accountingEndDate?: string,
  activityFeePeriods?: ActivityFeePeriod[],
  customUnitFeePeriods?: CustomUnitFeePeriod[]
) {
  const fee = getResidentMonthlyFee(resident, defaultMonthlyFee, activityDefaultFees, undefined, undefined, activityFeePeriods, customUnitFeePeriods);
  const allResidentPayments = getPaymentsForResident(resident, paymentsOrIndex);

  const validPayments = allResidentPayments.filter(isValidPaidPayment);
  const pendingPayments = allResidentPayments.filter(isPendingUnpaidPayment);

  if (targetYear !== undefined) {
    // Specific fiscal year calculation with automatic previous balance carry-over
    const carriedPreviousBalance = getCarriedPreviousBalance(
      resident,
      targetYear,
      paymentsOrIndex,
      accountingStartDate,
      defaultMonthlyFee,
      activityDefaultFees,
      activityFeePeriods,
      customUnitFeePeriods
    );

    const now = new Date();
    const currentCalendarYear = now.getFullYear();
    const currentCalendarMonth = now.getMonth(); // 0-indexed

    const start = new Date(accountingStartDate || '2026-01-01');
    const startYear = isNaN(start.getFullYear()) ? 2026 : start.getFullYear();
    const startMonth = isNaN(start.getMonth()) ? 0 : start.getMonth(); // 0-indexed

    let loopStartMonth = 1;
    let loopEndMonth = 12;

    if (targetYear === startYear) {
      loopStartMonth = startMonth + 1; // 1-indexed
    }
    if (targetYear === currentCalendarYear) {
      loopEndMonth = currentCalendarMonth + 1; // 1-indexed
    } else if (targetYear > currentCalendarYear) {
      loopEndMonth = 0;
    }

    if (accountingEndDate) {
      const end = new Date(accountingEndDate);
      const endYear = !isNaN(end.getFullYear()) ? end.getFullYear() : 9999;
      const endMonth = !isNaN(end.getMonth()) ? end.getMonth() : 11;
      if (targetYear === endYear) {
        loopEndMonth = Math.min(loopEndMonth, endMonth + 1);
      } else if (targetYear > endYear) {
        loopEndMonth = 0;
      }
    }

    const monthsInYear = Math.max(0, loopEndMonth - loopStartMonth + 1);

    // Filter payments in targetYear
    const validPaymentsInYear = validPayments.filter(p => {
      const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : startYear);
      return pYear === targetYear;
    });

    const pendingPaymentsInYear = pendingPayments.filter(p => {
      const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : startYear);
      return pYear === targetYear;
    });

    // Monthly subscription payments in targetYear
    const validSubsPaymentsInYear = validPaymentsInYear.filter(p => isMonthlySubscriptionType(p.paymentType));
    const monthlyPaid = validSubsPaymentsInYear.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Other collections paid in targetYear (e.g. maintenance, elevator, etc.)
    const otherCollectionsPaid = validPaymentsInYear
      .filter(p => !isMonthlySubscriptionType(p.paymentType))
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    // Other collections unpaid/pending in targetYear (EXCLUDING subscription & aggregated collections)
    const otherCollectionsDebt = pendingPaymentsInYear
      .filter(p => 
        !isMonthlySubscriptionType(p.paymentType) && 
        !p.isAggregatedCollection && 
        !p.paymentType?.includes('مجمع')
      )
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const totalPaid = monthlyPaid + otherCollectionsPaid;

    // Detailed month-by-month calculation for billable subscription months
    interface BillableMonthInfo {
      month: number;
      fee: number;
      directPaid: number;
      hasExplicitPendingUnpaid: boolean;
      isFullyPaid: boolean;
    }

    const billableMonths: BillableMonthInfo[] = [];
    let periodExpectedDues = 0;

    for (let m = loopStartMonth; m <= loopEndMonth; m++) {
      const mStr = String(m).padStart(2, '0');
      const hist = getHistoricalActivityForDate(resident, `${targetYear}-${mStr}`, defaultMonthlyFee, activityDefaultFees, activityFeePeriods);
      const isExempt = Boolean(
        hist.activityType === 'بدون تشطيب' ||
        hist.activityType === 'بدون تحصيل' ||
        hist.activityType?.includes('بدون تشطيب') ||
        hist.activityType?.includes('بدون تحصيل')
      );

      if (isExempt) {
        continue;
      }

      // Check payments for this specific month
      const monthValidSubs = validSubsPaymentsInYear.filter(p => isPaymentForYearAndMonth(p, targetYear, m));
      const monthPendingSubs = pendingPaymentsInYear.filter(p => isMonthlySubscriptionType(p.paymentType) && isPaymentForYearAndMonth(p, targetYear, m));

      // Prescribed monthly fee for this unit in this month using priority logic (period fee, history, or default)
      const prescribed = getPrescribedFeeForMonth(resident, targetYear, m, allResidentPayments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
      let mFee = prescribed.monthlyFee;

      if (mFee <= 0) continue;

      const directPaid = monthValidSubs.reduce((s, p) => s + (p.amount || 0), 0);
      const hasExplicitPendingUnpaid = monthPendingSubs.length > 0;
      const hasValidPaidPayment = monthValidSubs.some(p => isValidPaidPayment(p) && ((p.amount || 0) > 0 || p.isManuallyPaid));
      const isPaid = !hasExplicitPendingUnpaid && hasValidPaidPayment;

      periodExpectedDues += mFee;
      billableMonths.push({
        month: m,
        fee: mFee,
        directPaid,
        hasExplicitPendingUnpaid,
        isFullyPaid: isPaid,
      });
    }

    const billableMonthsCount = billableMonths.length;

    const paidMonthsCount = billableMonths.filter(bm => bm.isFullyPaid).length;
    const unpaidMonthsCount = Math.max(0, billableMonthsCount - paidMonthsCount);

    let unpaidMonthsDues = 0;
    if (unpaidMonthsCount === 0) {
      unpaidMonthsDues = 0;
    } else {
      unpaidMonthsDues = billableMonths
        .filter(bm => !bm.isFullyPaid)
        .reduce((sum, bm) => sum + bm.fee, 0);
    }

    const expectedDues = periodExpectedDues - carriedPreviousBalance;
    const oldDebtAmount = carriedPreviousBalance < 0 ? Math.abs(carriedPreviousBalance) : 0;

    // Net debt & arrears calculation according to user rule:
    // Arrears = (Monthly Fee * Elapsed Months) - Monthly Subscription Paid + Other Unpaid Collections
    // Previous Debt = Carried Previous Balance if negative
    // Total Due for Payment = Arrears + Previous Debt - Previous Surplus
    const previousDebt = carriedPreviousBalance < 0 ? Math.abs(carriedPreviousBalance) : 0;
    const previousSurplus = carriedPreviousBalance > 0 ? carriedPreviousBalance : 0;
    const totalArrears = unpaidMonthsDues + otherCollectionsDebt;
    const totalDueForPayment = Math.max(0, totalArrears + previousDebt - previousSurplus);
    const netBalance = (previousSurplus > totalArrears) ? (previousSurplus - totalArrears) : -totalDueForPayment;

    // Breakdown of expected monthly subscription fees
    const feeCountMap: Record<number, number> = {};
    for (const bm of billableMonths) {
      if (bm.fee > 0) {
        feeCountMap[bm.fee] = (feeCountMap[bm.fee] || 0) + 1;
      }
    }
    const breakdownParts = Object.entries(feeCountMap)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([fStr, cnt]) => `${cnt} شهر × ${Number(fStr).toLocaleString()} ج.م`);
    const expectedDuesBreakdownText = breakdownParts.length > 0
      ? breakdownParts.join(' + ')
      : `${billableMonthsCount} شهر`;

    return {
      monthlyFee: fee,
      monthsElapsed: billableMonthsCount > 0 ? billableMonthsCount : monthsInYear,
      billableMonthsCount,
      paidMonthsCount,
      unpaidMonthsCount,
      unpaidMonthsDues,
      periodExpectedDues,
      expectedDuesBreakdownText,
      oldDebtAmount,
      expectedDues,
      totalPaid,
      monthlyPaid,
      otherCollectionsPaid,
      otherCollectionsDebt,
      totalArrears,
      previousDebt,
      previousSurplus,
      totalDueForPayment,
      netBalance,
      carriedPreviousBalance,
      isDebt: netBalance < 0,
      isSurplus: netBalance > 0,
    };
  }

  // Cumulative all-time calculation
  const start = new Date(accountingStartDate || '2026-01-01');
  const now = new Date();
  const startYear = isNaN(start.getFullYear()) ? 2026 : start.getFullYear();
  const startMonth = isNaN(start.getMonth()) ? 0 : start.getMonth(); // 0-indexed
  let currY = now.getFullYear();
  let currM = now.getMonth(); // 0-indexed

  if (accountingEndDate) {
    const end = new Date(accountingEndDate);
    if (!isNaN(end.getFullYear()) && !isNaN(end.getMonth())) {
      currY = end.getFullYear();
      currM = end.getMonth();
    }
  }

  interface CumulativeMonthInfo {
    year: number;
    month: number;
    fee: number;
    directPaid: number;
    hasExplicitPendingUnpaid: boolean;
    isFullyPaid: boolean;
  }

  const validSubsPayments = validPayments.filter(p => isMonthlySubscriptionType(p.paymentType));
  const cumulativeBillableMonths: CumulativeMonthInfo[] = [];
  let periodExpectedDues = 0;
  let totalCalendarMonthsElapsed = 0;

  let y = startYear;
  let m = startMonth + 1; // 1-indexed

  while (y < currY || (y === currY && m <= currM + 1)) {
    totalCalendarMonthsElapsed++;
    const mStr = String(m).padStart(2, '0');
    const hist = getHistoricalActivityForDate(resident, `${y}-${mStr}`, defaultMonthlyFee, activityDefaultFees, activityFeePeriods);
    const isExempt = Boolean(
      hist.activityType === 'بدون تشطيب' ||
      hist.activityType === 'بدون تحصيل' ||
      hist.activityType?.includes('بدون تشطيب') ||
      hist.activityType?.includes('بدون تحصيل')
    );

    if (!isExempt) {
      const monthValidSubs = validSubsPayments.filter(p => isPaymentForYearAndMonth(p, y, m));
      const monthPendingSubs = pendingPayments.filter(p => isMonthlySubscriptionType(p.paymentType) && isPaymentForYearAndMonth(p, y, m));

      const monthAllPayments = validPayments.concat(pendingPayments);
      const prescribed = getPrescribedFeeForMonth(resident, y, m, monthAllPayments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
      let mFee = prescribed.monthlyFee;

      if (mFee > 0) {
        const directPaid = monthValidSubs.reduce((s, p) => s + (p.amount || 0), 0);
        const hasExplicitPendingUnpaid = monthPendingSubs.length > 0;
        const hasValidPaidPayment = monthValidSubs.some(p => isValidPaidPayment(p) && ((p.amount || 0) > 0 || p.isManuallyPaid));
        const isPaid = !hasExplicitPendingUnpaid && hasValidPaidPayment;

        periodExpectedDues += mFee;
        cumulativeBillableMonths.push({
          year: y,
          month: m,
          fee: mFee,
          directPaid,
          hasExplicitPendingUnpaid,
          isFullyPaid: isPaid,
        });
      }
    }

    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  const billableMonthsCount = cumulativeBillableMonths.length;

  const monthlyPaid = validSubsPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  const otherCollectionsPaid = validPayments
    .filter(p => !isMonthlySubscriptionType(p.paymentType))
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const otherCollectionsDebt = pendingPayments
    .filter(p => 
      !isMonthlySubscriptionType(p.paymentType) && 
      !p.isAggregatedCollection && 
      !p.paymentType?.includes('مجمع')
    )
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalPaid = monthlyPaid + otherCollectionsPaid;

  // Direct matching by year and month
  const paidMonthsCount = cumulativeBillableMonths.filter(bm => bm.isFullyPaid).length;
  const unpaidMonthsCount = Math.max(0, billableMonthsCount - paidMonthsCount);

  let unpaidMonthsDues = 0;
  if (unpaidMonthsCount === 0) {
    unpaidMonthsDues = 0;
  } else {
    unpaidMonthsDues = cumulativeBillableMonths
      .filter(bm => !bm.isFullyPaid)
      .reduce((sum, bm) => sum + bm.fee, 0);
  }

  const initialBal = resident.initialBalance || 0;
  const expectedDues = periodExpectedDues - initialBal;
  const oldDebtAmount = initialBal < 0 ? Math.abs(initialBal) : 0;

  // Net debt calculation according to the exact user rule:
  // (Previous Balance / Debt) + (Late Amount for unpaid months) + (Other uncollected receipts)
  const previousDebt = initialBal < 0 ? Math.abs(initialBal) : 0;
  const previousSurplus = initialBal > 0 ? initialBal : 0;
  const totalArrears = unpaidMonthsDues + otherCollectionsDebt;
  const totalDueForPayment = Math.max(0, totalArrears + previousDebt - previousSurplus);
  const netBalance = (previousSurplus > totalArrears) ? (previousSurplus - totalArrears) : -totalDueForPayment;

  // Breakdown of expected monthly subscription fees
  const feeCountMap: Record<number, number> = {};
  for (const bm of cumulativeBillableMonths) {
    if (bm.fee > 0) {
      feeCountMap[bm.fee] = (feeCountMap[bm.fee] || 0) + 1;
    }
  }
  const breakdownParts = Object.entries(feeCountMap)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([fStr, cnt]) => `${cnt} شهر × ${Number(fStr).toLocaleString()} ج.م`);
  const expectedDuesBreakdownText = breakdownParts.length > 0
    ? breakdownParts.join(' + ')
    : `${billableMonthsCount} شهر`;

  return {
    monthlyFee: fee,
    monthsElapsed: billableMonthsCount > 0 ? billableMonthsCount : totalCalendarMonthsElapsed,
    billableMonthsCount,
    paidMonthsCount,
    unpaidMonthsCount,
    unpaidMonthsDues,
    periodExpectedDues,
    expectedDuesBreakdownText,
    oldDebtAmount,
    expectedDues,
    totalPaid,
    monthlyPaid,
    otherCollectionsPaid,
    otherCollectionsDebt,
    totalArrears,
    previousDebt,
    previousSurplus,
    totalDueForPayment,
    netBalance,
    carriedPreviousBalance: initialBal,
    isDebt: netBalance < 0,
    isSurplus: netBalance > 0,
  };
}

export type ResidentFinancials = ReturnType<typeof calculateResidentFinancials>;

export interface UnitClaimBreakdown {
  targetYear: number;
  targetMonth: number;
  monthName: string;
  unitNumber: number | string;

  // 1️⃣ حالة الشهر الحالي
  currentMonthFee: number;
  currentMonthSubsPaid: number;
  currentMonthSubsStatusText: string;
  isCurrentMonthSubsPaid: boolean;
  currentMonthSubsDue: number;
  subsLineText: string;

  currentMonthOtherFee: number;
  currentMonthOtherPaid: number;
  currentMonthOtherStatusText: string;
  isCurrentMonthOtherPaid: boolean;
  currentMonthOtherDue: number;
  otherLineText: string;

  // 2️⃣ الاشتراكات الشهرية من بداية الفترة المحاسبية حتى الشهر السابق
  priorSubsDue: number;
  priorSubsPaid: number;
  priorSubsDiff: number;
  priorSubsDiffType: 'arrears' | 'surplus' | 'zero';
  priorSubsStatusText: string;
  priorSubsMonthsCount?: number;

  // متأخرات اشتراك شهري (للتوافق مع الواجهات القائمة)
  monthlyDelayedMonthsCount: number;
  monthlyDelayedAmount: number;
  monthlyArrearsLineText: string;

  // 3️⃣ التحصيلات الأخرى من بداية الفترة المحاسبية حتى الشهر السابق
  priorOtherDue: number;
  priorOtherPaid: number;
  priorOtherDiff: number;
  priorOtherDiffType: 'arrears' | 'surplus' | 'zero';
  priorOtherStatusText: string;

  // متأخرات تحصيلات اخري (للتوافق مع الواجهات القائمة)
  otherDelayedMonthsCount: number;
  otherDelayedAmount: number;
  otherArrearsLineText: string;

  // 4️⃣ مديونيات سابقة أو مرحل من فترات محاسبية سابقة أو رصيد افتتاحي
  previousDebtAmount: number;
  previousSurplusAmount: number;
  previousDebtLineText: string;

  // 5️⃣ إجمالي المستحق عن هذا الشهر
  currentMonthTotalDue: number;

  // 6️⃣ إجمالي المتأخرات والمديونيات
  totalArrearsAndDebts: number;

  // إجمالي المبالغ المستحقة للسداد
  totalDueForPayment: number;
  totalDueLineText: string;
}

const monthNamesArabicList = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

/**
 * Computes exact monthly claim breakdown according to building management rules:
 * - Current month status for both regular monthly fee and any other collections
 * - Arrears: strictly previous months in the same year that were due and not paid (exempting non-finishing/no-fee months)
 * - Previous debts: carried over from previous fiscal years or registered as initial debt
 * - Summary rectangle: separation of current month dues vs total arrears & debts
 */
export function calculateUnitClaimBreakdown(
  resident: Resident | null | undefined,
  payments: Payment[] = [],
  targetYear: number | string = 2026,
  targetMonth: number | string = 1,
  accountingStartDate: string = '2026-01-01',
  defaultMonthlyFee: number = 400,
  activityDefaultFees?: Record<string, number>,
  activePaymentForClaim?: Payment | null,
  customUnitFeePeriods?: CustomUnitFeePeriod[],
  activityFeePeriods?: ActivityFeePeriod[]
): UnitClaimBreakdown {
  const yNum = Number(targetYear) || new Date().getFullYear();
  const mNum = parseInt(String(targetMonth), 10) || (new Date().getMonth() + 1);
  const mIndex = Math.max(0, Math.min(11, mNum - 1));
  const monthName = monthNamesArabicList[mIndex] || `شهر ${mNum}`;

  if (!resident) {
    return {
      targetYear: yNum,
      targetMonth: mNum,
      monthName,
      unitNumber: '',
      currentMonthFee: defaultMonthlyFee,
      currentMonthSubsPaid: 0,
      currentMonthSubsStatusText: 'غير مسدد ⚠️',
      isCurrentMonthSubsPaid: false,
      currentMonthSubsDue: defaultMonthlyFee,
      subsLineText: `اشتراك شهري: ${defaultMonthlyFee} ج.م • المسدد: 0 ج.م - (غير مسدد ⚠️) .`,
      currentMonthOtherFee: 0,
      currentMonthOtherPaid: 0,
      currentMonthOtherStatusText: 'مسدد بالكامل ✓',
      isCurrentMonthOtherPaid: true,
      currentMonthOtherDue: 0,
      otherLineText: `تحصيلات اخري: لا توجد تحصيلات أخرى .`,
      priorSubsDue: 0,
      priorSubsPaid: 0,
      priorSubsDiff: 0,
      priorSubsDiffType: 'zero',
      priorSubsStatusText: 'لا توجد متأخرات (0 ج.م)',
      monthlyDelayedMonthsCount: 0,
      monthlyDelayedAmount: 0,
      monthlyArrearsLineText: `متأخرات اشتراك شهري - لا يوجد تأخير (0 ج.م) .`,
      priorOtherDue: 0,
      priorOtherPaid: 0,
      priorOtherDiff: 0,
      priorOtherDiffType: 'zero',
      priorOtherStatusText: 'لا توجد متأخرات (0 ج.م)',
      otherDelayedMonthsCount: 0,
      otherDelayedAmount: 0,
      otherArrearsLineText: `متأخرات تحصيلات اخري - لا توجد متأخرات (0 ج.م) .`,
      previousDebtAmount: 0,
      previousSurplusAmount: 0,
      previousDebtLineText: `مديونيات سابقة - بقيمة (0 ج.م) .`,
      currentMonthTotalDue: defaultMonthlyFee,
      totalArrearsAndDebts: 0,
      totalDueForPayment: defaultMonthlyFee,
      totalDueLineText: `اجمالي المبالغ المستحقه للسداد : ${defaultMonthlyFee} ج. م  (المبالغ المستحقة عن الشهر الحالي + المتأخرات + المديونيات)`
    };
  }

  let allResidentPayments = getPaymentsForResident(resident, payments);
  if (activePaymentForClaim) {
    const exists = allResidentPayments.some(p => p.id && String(p.id) === String(activePaymentForClaim.id));
    if (!exists) {
      allResidentPayments = [activePaymentForClaim, ...allResidentPayments];
    } else {
      allResidentPayments = allResidentPayments.map(p => 
        p.id && String(p.id) === String(activePaymentForClaim.id) ? activePaymentForClaim : p
      );
    }
  }

  let startYear = 2026;
  let startMonth = 1;
  if (accountingStartDate) {
    const p = parseToStandardDate(accountingStartDate);
    if (p) {
      startYear = parseInt(p.year, 10) || 2026;
      startMonth = p.month ? parseInt(p.month.slice(5, 7), 10) || 1 : 1;
    }
  }

  // 1. Current Month Monthly Subscription
  const curPeriodStr = `${yNum}-${String(mNum).padStart(2, '0')}`;
  const histAct = getHistoricalActivityForDate(resident, curPeriodStr, defaultMonthlyFee, activityDefaultFees, activityFeePeriods);
  const isNoFee = Boolean(
    histAct.activityType === 'بدون تشطيب' ||
    histAct.activityType === 'بدون تحصيل' ||
    histAct.activityType?.includes('بدون تشطيب') ||
    histAct.activityType?.includes('بدون تحصيل')
  );

  const curMonthSubsPayments = allResidentPayments.filter(p => {
    return isPaymentForYearAndMonth(p, yNum, mNum) && isMonthlySubscriptionType(p.paymentType);
  });

  const curMonthSubsValidPaid = curMonthSubsPayments
    .filter(isValidPaidPayment)
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const hasCurMonthManuallyPaid = curMonthSubsPayments.some(p => 
    p.isManuallyPaid && isValidPaidPayment(p)
  );

  const curMonthSubsPending = curMonthSubsPayments
    .filter(isPendingUnpaidPayment)
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  // Determine prescribed monthly fee for this unit in this month:
  let currentMonthFee = 0;
  if (isNoFee) {
    currentMonthFee = 0;
  } else {
    const prescribed = getPrescribedFeeForMonth(resident, yNum, mNum, allResidentPayments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
    currentMonthFee = prescribed.monthlyFee;
  }

  let currentMonthSubsStatusText = '';
  let isCurrentMonthSubsPaid = false;
  let currentMonthSubsDue = 0;

  if (isNoFee || currentMonthFee === 0) {
    currentMonthSubsStatusText = 'معفي / غير مطالبة ✓';
    isCurrentMonthSubsPaid = true;
    currentMonthSubsDue = 0;
  } else if (hasCurMonthManuallyPaid || curMonthSubsValidPaid >= currentMonthFee) {
    currentMonthSubsStatusText = 'مسدد بالكامل ✓';
    isCurrentMonthSubsPaid = true;
    currentMonthSubsDue = 0;
  } else if (curMonthSubsValidPaid > 0) {
    currentMonthSubsStatusText = `سداد جزئي (${Math.round(curMonthSubsValidPaid).toLocaleString()} من ${Math.round(currentMonthFee).toLocaleString()} ج.م)`;
    isCurrentMonthSubsPaid = false;
    currentMonthSubsDue = Math.max(0, currentMonthFee - curMonthSubsValidPaid);
  } else {
    currentMonthSubsStatusText = 'غير مسدد ⚠️';
    isCurrentMonthSubsPaid = false;
    currentMonthSubsDue = currentMonthFee;
  }

  const subsStatusExtra = (currentMonthSubsStatusText && currentMonthSubsStatusText !== 'مسدد بالكامل ✓')
    ? ` - (${currentMonthSubsStatusText})`
    : '';
  const subsLineText = `اشتراك شهري: ${Math.round(currentMonthFee).toLocaleString()} ج.م • المسدد: ${Math.round(curMonthSubsValidPaid).toLocaleString()} ج.م${subsStatusExtra} .`;

  // 2. Current Month Other Collections
  const curMonthOtherPayments = allResidentPayments.filter(p => {
    const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : yNum);
    const pMonth = parseInt(String(p.month), 10);
    return pYear === yNum && pMonth === mNum && !isMonthlySubscriptionType(p.paymentType) && p.status !== 'cancelled' && p.status !== 'لاغي';
  });

  const curMonthOtherPaid = curMonthOtherPayments
    .filter(isValidPaidPayment)
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const curMonthOtherPending = curMonthOtherPayments
    .filter(isPendingUnpaidPayment)
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  let currentMonthOtherFee = curMonthOtherPaid + curMonthOtherPending;
  if (activePaymentForClaim && !isMonthlySubscriptionType(activePaymentForClaim.paymentType) && (activePaymentForClaim.amount || 0) > currentMonthOtherFee) {
    currentMonthOtherFee = activePaymentForClaim.amount;
  }

  let currentMonthOtherStatusText = '';
  let isCurrentMonthOtherPaid = false;
  let currentMonthOtherDue = 0;

  if (currentMonthOtherFee === 0 || (curMonthOtherPaid === 0 && curMonthOtherPending === 0 && (!activePaymentForClaim || isMonthlySubscriptionType(activePaymentForClaim.paymentType)))) {
    currentMonthOtherStatusText = 'لا يوجد تحصيلات اخري';
    isCurrentMonthOtherPaid = true;
    currentMonthOtherDue = 0;
  } else if (curMonthOtherPaid >= currentMonthOtherFee && currentMonthOtherFee > 0) {
    currentMonthOtherStatusText = 'مسدد بالكامل ✓';
    isCurrentMonthOtherPaid = true;
    currentMonthOtherDue = 0;
  } else if (curMonthOtherPaid > 0) {
    currentMonthOtherStatusText = `غير مسدد (مسدد جزئياً ${Math.round(curMonthOtherPaid).toLocaleString()} من ${Math.round(currentMonthOtherFee).toLocaleString()} ج.م)`;
    isCurrentMonthOtherPaid = false;
    currentMonthOtherDue = Math.max(0, currentMonthOtherFee - curMonthOtherPaid);
  } else {
    currentMonthOtherStatusText = 'غير مسدد ⚠️';
    isCurrentMonthOtherPaid = false;
    currentMonthOtherDue = currentMonthOtherFee;
  }

  const otherStatusExtra = (currentMonthOtherStatusText && currentMonthOtherStatusText !== 'مسدد بالكامل ✓' && currentMonthOtherStatusText !== 'لا يوجد تحصيلات اخري')
    ? ` - (${currentMonthOtherStatusText})`
    : '';
  const otherLineText = currentMonthOtherFee > 0
    ? `تحصيلات اخري: ${Math.round(currentMonthOtherFee).toLocaleString()} ج.م • المسدد: ${Math.round(curMonthOtherPaid).toLocaleString()} ج.م${otherStatusExtra} .`
    : `تحصيلات اخري: لا توجد تحصيلات أخرى .`;

  // 2️⃣ الاشتراكات الشهرية من بداية الفترة المحاسبية وحتى الشهر الحالي
  let priorSubsDue = 0;
  let priorSubsPaid = 0;
  let priorSubsMonthsCount = 0;
  const pastMonthsList: { month: number; year: number; fee: number; hasPayment: boolean }[] = [];

  for (let y = startYear; y <= yNum; y++) {
    const mStart = (y === startYear) ? startMonth : 1;
    const mEnd = (y === yNum) ? mNum : 12; // وحتى الشهر الحالي
    for (let m = mStart; m <= mEnd; m++) {
      const mStr = String(m).padStart(2, '0');
      const pastAct = getHistoricalActivityForDate(resident, `${y}-${mStr}`, defaultMonthlyFee, activityDefaultFees, activityFeePeriods);
      const isPastNoFee = Boolean(
        pastAct.activityType === 'بدون تشطيب' ||
        pastAct.activityType === 'بدون تحصيل' ||
        pastAct.activityType?.includes('بدون تشطيب') ||
        pastAct.activityType?.includes('بدون تحصيل')
      );

      let feeForMonth = 0;
      if (!isPastNoFee) {
        const prescribed = getPrescribedFeeForMonth(resident, y, m, allResidentPayments, defaultMonthlyFee, activityDefaultFees, activityFeePeriods, customUnitFeePeriods);
        feeForMonth = prescribed.monthlyFee || 0;
        priorSubsDue += feeForMonth;
        priorSubsMonthsCount++;
      }

      const monthSubsPayments = allResidentPayments.filter(p => {
        const matchesTarget = (y === yNum && m === mNum && activePaymentForClaim && String(p.id) === String(activePaymentForClaim.id)) ||
          isPaymentForYearAndMonth(p, y, m);
        return matchesTarget && isMonthlySubscriptionType(p.paymentType) &&
          p.status !== 'cancelled' && p.status !== 'لاغي';
      });

      let hasCollected = monthSubsPayments.some(p =>
        isValidPaidPayment(p) && (p.amount > 0 || p.isManuallyPaid)
      );

      let subsCollected = monthSubsPayments
        .filter(isValidPaidPayment)
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      // التأكد التام من شمول تحصيل الشهر الحالي في المبالغ المسددة وحتى الشهر الحالي
      if (y === yNum && m === mNum) {
        if (isCurrentMonthSubsPaid) {
          subsCollected = Math.max(subsCollected, feeForMonth, curMonthSubsValidPaid);
          hasCollected = true;
        } else if (curMonthSubsValidPaid > subsCollected) {
          subsCollected = curMonthSubsValidPaid;
        } else if (subsCollected === 0 && (hasCurMonthManuallyPaid || (activePaymentForClaim?.isManuallyPaid && isValidPaidPayment(activePaymentForClaim)))) {
          subsCollected = feeForMonth;
          hasCollected = true;
        } else if (activePaymentForClaim && isValidPaidPayment(activePaymentForClaim) && (activePaymentForClaim.amount > 0 || activePaymentForClaim.isManuallyPaid)) {
          subsCollected = Math.max(subsCollected, activePaymentForClaim.amount || feeForMonth);
          hasCollected = true;
        }
      }

      priorSubsPaid += subsCollected;

      if (!isPastNoFee) {
        pastMonthsList.push({
          year: y,
          month: m,
          fee: feeForMonth,
          hasPayment: hasCollected,
        });
      }
    }
  }

  // المدفوعات غير المحددة لشهر بعينه من بداية الفترة وحتى الشهر الحالي
  const unassignedSubsPayments = allResidentPayments.filter(p => {
    const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : 0);
    const pMonth = parseInt(String(p.month), 10);
    const isUpToCurrent = pYear < yNum || (pYear === yNum && (!pMonth || pMonth <= mNum));
    const isUnassigned = !pMonth || pMonth < 1 || pMonth > 12;
    return isUpToCurrent && isUnassigned && isMonthlySubscriptionType(p.paymentType) && isValidPaidPayment(p);
  });
  const unassignedSubsAmt = unassignedSubsPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  priorSubsPaid += unassignedSubsAmt;

  // التحقق من الشهور غير المسددة
  const unpaidPastMonths = pastMonthsList.filter(pm => !pm.hasPayment);
  const unpaidPriorMonthsBeforeCurrent = pastMonthsList.filter(pm => !(pm.year === yNum && pm.month === mNum) && !pm.hasPayment);

  // إذا كانت الوحدة مسددة للشهر الحالي ومسددة لجميع الشهور السابقة حتى الشهر الحالي،
  // فإن المبالغ المسددة حتى الشهر الحالي تساوي بالضرورة إجمالي المبالغ المستحقة حتى الشهر الحالي
  if (isCurrentMonthSubsPaid && unpaidPriorMonthsBeforeCurrent.length === 0) {
    if (priorSubsPaid < priorSubsDue) {
      priorSubsPaid = priorSubsDue;
    }
  }

  const priorSubsDiff = Math.round(priorSubsDue - priorSubsPaid);
  let priorSubsDiffType: 'arrears' | 'surplus' | 'zero' = 'zero';
  let priorSubsStatusText = '';

  if (priorSubsDiff > 0) {
    priorSubsDiffType = 'arrears';
    priorSubsStatusText = `متأخرات اشتراك شهري بقيمة (${priorSubsDiff.toLocaleString()} ج.م)`;
  } else if (priorSubsDiff < 0) {
    priorSubsDiffType = 'surplus';
    priorSubsStatusText = `رصيد موجب (فائض مسدد) بقيمة (+${Math.abs(priorSubsDiff).toLocaleString()} ج.م)`;
  } else {
    priorSubsDiffType = 'zero';
    priorSubsStatusText = 'لا توجد متأخرات (0 ج.م)';
  }

  const monthlyDelayedMonthsCount = priorSubsDiff > 0 ? unpaidPastMonths.length : 0;
  const monthlyDelayedAmount = priorSubsDiff > 0 ? priorSubsDiff : 0;
  const monthlyArrearsLineText = monthlyDelayedAmount > 0
    ? `متأخرات اشتراك شهري - بقيمة (${Math.round(monthlyDelayedAmount).toLocaleString()} ج.م) .`
    : `متأخرات اشتراك شهري - لا يوجد تأخير (0 ج.م) .`;

  // 3️⃣ التحصيلات الأخرى من بداية الفترة المحاسبية حتى الشهر الحالي
  let priorOtherDue = 0;
  let priorOtherPaid = 0;

  allResidentPayments.forEach(p => {
    if (isMonthlySubscriptionType(p.paymentType)) return;
    if (p.status === 'cancelled' || p.status === 'لاغي') return;
    const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : 0);
    const pMonth = parseInt(String(p.month), 10) || 0;

    // التحقق من الوقوع ضمن الفترة المحاسبية وحتى الشهر الحالي
    const isAfterOrAtStart = (pYear > startYear) || (pYear === startYear && (pMonth === 0 || pMonth >= startMonth));
    const isUpToTarget = (pYear < yNum) || (pYear === yNum && (pMonth === 0 || pMonth <= mNum));

    if (isAfterOrAtStart && isUpToTarget) {
      const itemDue = (p.expectedAmount && p.expectedAmount > 0) ? p.expectedAmount : (p.amount || 0);
      priorOtherDue += itemDue;
      if (isValidPaidPayment(p)) {
        priorOtherPaid += (p.amount || 0);
      }
    }
  });

  // التأكد من شمول التحصيلات الأخرى للشهر الحالي ضمن إجمالي المسدد للتحصيلات الأخرى
  if (curMonthOtherPaid > 0) {
    const curMonthOtherAlreadyCounted = allResidentPayments.filter(p => {
      const pYear = parsePaymentYear(p, yNum);
      const pMonth = parsePaymentMonth(p);
      return pYear === yNum && pMonth === mNum && !isMonthlySubscriptionType(p.paymentType) && isValidPaidPayment(p);
    }).reduce((s, p) => s + (p.amount || 0), 0);

    if (curMonthOtherPaid > curMonthOtherAlreadyCounted) {
      const diff = curMonthOtherPaid - curMonthOtherAlreadyCounted;
      priorOtherPaid += diff;
      priorOtherDue += diff;
    }
  }

  const priorOtherDiff = Math.round(priorOtherDue - priorOtherPaid);
  let priorOtherDiffType: 'arrears' | 'surplus' | 'zero' = 'zero';
  let priorOtherStatusText = '';

  if (priorOtherDiff > 0) {
    priorOtherDiffType = 'arrears';
    priorOtherStatusText = `متأخرات تحصيلات أخرى بقيمة (${priorOtherDiff.toLocaleString()} ج.م)`;
  } else if (priorOtherDiff < 0) {
    priorOtherDiffType = 'surplus';
    priorOtherStatusText = `رصيد موجب بقيمة (+${Math.abs(priorOtherDiff).toLocaleString()} ج.م)`;
  } else {
    priorOtherDiffType = 'zero';
    priorOtherStatusText = 'لا توجد متأخرات (0 ج.م)';
  }

  const prevOtherPending = allResidentPayments.filter(p => {
    const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : yNum);
    const pMonth = parseInt(String(p.month), 10);
    const isPrior = (pYear < yNum) || (pYear === yNum && pMonth <= mNum);
    return isPrior && 
      !isMonthlySubscriptionType(p.paymentType) && 
      !p.isAggregatedCollection && 
      !p.paymentType?.includes('مجمع') &&
      p.status !== 'cancelled' && p.status !== 'لاغي' && (p.status === 'pending' || p.status === 'لم يتم التحصيل' || p.status === 'uncollected');
  });

  const uniqueOtherMonths = new Set(prevOtherPending.map(p => parseInt(String(p.month), 10)));
  const otherDelayedMonthsCount = uniqueOtherMonths.size;
  const otherDelayedAmount = priorOtherDiff > 0 ? priorOtherDiff : 0;
  const otherArrearsLineText = priorOtherDiff > 0
    ? `متأخرات تحصيلات اخري بقيمة (${Math.round(priorOtherDiff).toLocaleString()} ج.م) .`
    : `متأخرات تحصيلات اخري - لا توجد متأخرات (0 ج.م) .`;

  // 4️⃣ مديونيات سابقة أو مرحل من فترات محاسبية سابقة أو رصيد افتتاحي للوحدة
  const carriedBal = getCarriedPreviousBalance(
    resident,
    startYear,
    payments,
    accountingStartDate,
    defaultMonthlyFee,
    activityDefaultFees
  );

  let previousDebtAmount = 0;
  let previousSurplusAmount = 0;
  if (carriedBal < 0) {
    previousDebtAmount = Math.abs(carriedBal);
  } else if (carriedBal > 0) {
    previousSurplusAmount = carriedBal;
  } else if (resident.initialBalance && resident.initialBalance < 0 && yNum <= startYear) {
    previousDebtAmount = Math.abs(resident.initialBalance);
  } else if (resident.initialBalance && resident.initialBalance > 0 && yNum <= startYear) {
    previousSurplusAmount = resident.initialBalance;
  }

  const previousDebtLineText = previousDebtAmount > 0
    ? `مديونيات سابقة مرحلة من فترات سابقة أو رصيد افتتاحي: بقيمة (${Math.round(previousDebtAmount).toLocaleString()} ج.م)`
    : (previousSurplusAmount > 0
        ? `رصيد موجب دائن مرحل من فترات سابقة أو رصيد افتتاحي: بقيمة (+${Math.round(previousSurplusAmount).toLocaleString()} ج.م)`
        : `مديونيات سابقة مرحلة أو رصيد افتتاحي: (0 ج.م)`);

  // 5️⃣ إجمالي المستحق عن هذا الشهر
  const currentMonthTotalDue = Math.round(currentMonthFee + currentMonthOtherFee);

  // 6️⃣ إجمالي المتأخرات والمديونيات
  const step2Arrears = priorSubsDiff > 0 ? priorSubsDiff : 0;
  const step3Arrears = priorOtherDiff > 0 ? priorOtherDiff : 0;
  const step4Debt = previousDebtAmount;
  const totalArrearsAndDebts = Math.round(step2Arrears + step3Arrears + step4Debt);

  const step2Credit = priorSubsDiff < 0 ? Math.abs(priorSubsDiff) : 0;
  const step3Credit = priorOtherDiff < 0 ? Math.abs(priorOtherDiff) : 0;
  const totalCredits = step2Credit + step3Credit + previousSurplusAmount;

  // صافي المستحق المطلوب سداده
  const netTotalArrearsAndDebts = Math.round((priorSubsDiff + priorOtherDiff + (previousDebtAmount - previousSurplusAmount)));
  const totalDueForPayment = Math.max(0, netTotalArrearsAndDebts > 0 ? netTotalArrearsAndDebts : 0);

  const totalDueLineText = `اجمالي المبالغ المستحقه للسداد : ${totalDueForPayment.toLocaleString()} ج. م  (المبالغ المستحقة عن الشهر الحالي + المتأخرات + المديونيات)`;

  return {
    targetYear: yNum,
    targetMonth: mNum,
    monthName,
    unitNumber: resident.flatNumber,
    currentMonthFee,
    currentMonthSubsPaid: curMonthSubsValidPaid,
    currentMonthSubsStatusText,
    isCurrentMonthSubsPaid,
    currentMonthSubsDue,
    subsLineText,
    currentMonthOtherFee,
    currentMonthOtherPaid: curMonthOtherPaid,
    currentMonthOtherStatusText,
    isCurrentMonthOtherPaid,
    currentMonthOtherDue,
    otherLineText,
    priorSubsDue,
    priorSubsPaid,
    priorSubsDiff,
    priorSubsDiffType,
    priorSubsStatusText,
    priorSubsMonthsCount,
    monthlyDelayedMonthsCount,
    monthlyDelayedAmount,
    monthlyArrearsLineText,
    priorOtherDue,
    priorOtherPaid,
    priorOtherDiff,
    priorOtherDiffType,
    priorOtherStatusText,
    otherDelayedMonthsCount,
    otherDelayedAmount,
    otherArrearsLineText,
    previousDebtAmount,
    previousSurplusAmount,
    previousDebtLineText,
    currentMonthTotalDue,
    totalArrearsAndDebts,
    totalDueForPayment,
    totalDueLineText
  };
}

/**
 * Automatically exports and synchronizes the carried forward previous balances
 * for all residents for a new fiscal year.
 */
export function exportCarriedBalancesForYear(
  residents: Resident[],
  payments: Payment[],
  newFiscalYear: number,
  config: AppConfig
): Resident[] {
  return residents.map(res => {
    // Calculate net carried balance up to start of newFiscalYear
    const allResidentPayments = getPaymentsForResident(res, payments);
    const validPayments = allResidentPayments.filter(isValidPaidPayment);
    const pendingPayments = allResidentPayments.filter(isPendingUnpaidPayment);

    const start = new Date(config?.accountingStartDate || '2026-01-01');
    const startYear = isNaN(start.getFullYear()) ? 2026 : start.getFullYear();
    const startMonth = isNaN(start.getMonth()) ? 0 : start.getMonth();

    let duesPrior = 0;
    for (let y = startYear; y < newFiscalYear; y++) {
      const mStart = (y === startYear) ? startMonth + 1 : 1;
      for (let m = mStart; m <= 12; m++) {
        const prescribed = getPrescribedFeeForMonth(res, y, m, allResidentPayments, config?.defaultMonthlyFee || 400, config?.activityDefaultFees, config?.activityFeePeriods, config?.customUnitFeePeriods);
        duesPrior += prescribed.monthlyFee;
      }
    }

    const subsPaidPrior = validPayments
      .filter(p => isMonthlySubscriptionType(p.paymentType) && ((Number(p.year) || (p.date ? new Date(p.date).getFullYear() : startYear)) < newFiscalYear))
      .reduce((s, p) => s + (p.amount || 0), 0);

    const otherUnpaidPrior = pendingPayments
      .filter(p => !isMonthlySubscriptionType(p.paymentType) && !p.isAggregatedCollection && !p.paymentType?.includes('مجمع') && ((Number(p.year) || (p.date ? new Date(p.date).getFullYear() : startYear)) < newFiscalYear))
      .reduce((s, p) => s + (p.amount || 0), 0);

    const initBal = res.initialBalance || 0;
    // Net carried balance: positive = surplus (+), negative = debt (-)
    const netCarried = Math.round((initBal + subsPaidPrior) - duesPrior - otherUnpaidPrior);

    const existingExports = res.exportedYearBalances || {};

    return {
      ...res,
      initialBalance: newFiscalYear <= startYear ? netCarried : res.initialBalance,
      exportedYearBalances: {
        ...existingExports,
        [newFiscalYear]: netCarried,
        [String(newFiscalYear)]: netCarried,
      },
    };
  });
}

// ----------------------------------------------------
// PERSISTENT DELETED PAYMENTS & DEDUPLICATION REGISTRY
// ----------------------------------------------------
const DELETED_PAYMENTS_KEY = 'deleted_payment_ids_v2';

export function getDeletedPaymentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_PAYMENTS_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set<string>(parsed.map(id => String(id).trim()).filter(Boolean));
    }
    return new Set<string>();
  } catch {
    return new Set<string>();
  }
}

export function registerDeletedPaymentIds(ids: string | string[]): void {
  if (!ids) return;
  const list = Array.isArray(ids) ? ids : [ids];
  const set = getDeletedPaymentIds();
  let added = false;
  for (const id of list) {
    if (!id) continue;
    const clean = String(id).trim();
    if (clean && !set.has(clean)) {
      set.add(clean);
      added = true;
    }
  }
  if (added) {
    try {
      localStorage.setItem(DELETED_PAYMENTS_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  }
}

export function unregisterDeletedPaymentIds(ids: string | string[]): void {
  if (!ids) return;
  const list = (Array.isArray(ids) ? ids : [ids]).map(id => String(id).trim()).filter(Boolean);
  if (list.length === 0) return;

  const set = getDeletedPaymentIds();
  let removed = false;
  for (const id of list) {
    if (set.has(id)) {
      set.delete(id);
      removed = true;
    }
  }
  if (removed) {
    try {
      localStorage.setItem(DELETED_PAYMENTS_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  }
}

export function restoreActivePaymentsFromDeletedSet(activePayments: Payment[]): void {
  if (!Array.isArray(activePayments) || activePayments.length === 0) return;
  const activeIds = activePayments
    .map(p => p ? String(p.id).trim() : '')
    .filter(Boolean);
  if (activeIds.length > 0) {
    unregisterDeletedPaymentIds(activeIds);
  }
}

/**
 * Filter out deleted payments and deduplicate remaining payment records safely.
 * Guarantees that active and distributed payments are NEVER accidentally deleted or hidden.
 */
export function filterAndDeduplicatePayments(list: Payment[]): Payment[] {
  if (!Array.isArray(list) || list.length === 0) return [];

  const deletedSet = getDeletedPaymentIds();

  // 1. Filter out explicitly deleted payment IDs & deleted flags
  const validList = list.filter(p => {
    if (!p) return false;
    const cleanId = String(p.id || '').trim();
    if (!cleanId) return false;
    if (deletedSet.has(cleanId)) return false;
    if ((p as any).isDeleted || p.status === 'deleted') return false;
    return true;
  });

  // 2. Deduplicate by unique payment ID first
  const byIdMap = new Map<string, Payment>();
  for (const p of validList) {
    const cleanId = String(p.id).trim();
    const existing = byIdMap.get(cleanId);
    if (!existing) {
      byIdMap.set(cleanId, p);
    } else {
      // Merge properties safely
      const merged: Payment = {
        ...existing,
        ...p,
        fileUrl: p.fileUrl || existing.fileUrl,
        receiptNumber: p.receiptNumber || existing.receiptNumber,
        notes: p.notes || existing.notes,
        isDistributed: existing.isDistributed || p.isDistributed,
        distributedPaymentIds: (Array.isArray(existing.distributedPaymentIds) && existing.distributedPaymentIds.length > 0)
          ? existing.distributedPaymentIds
          : p.distributedPaymentIds,
        distributionSourceId: existing.distributionSourceId || p.distributionSourceId,
      };
      byIdMap.set(cleanId, merged);
    }
  }

  const uniqueByIdList = Array.from(byIdMap.values());

  // 3. Deduplicate active subscription payments by business fingerprint
  const fingerprintMap = new Map<string, Payment>();

  for (const p of uniqueByIdList) {
    // Cancelled or non-subscription payments are preserved as-is by unique ID
    if (p.status === 'cancelled' || p.status === 'لاغي' || !p.flatNumber) {
      fingerprintMap.set(String(p.id), p);
      continue;
    }

    const flatKey = String(p.flatNumber).trim();
    const monthNum = parseInt(String(p.month), 10) || 0;
    const yearNum = Number(p.year) || 0;
    const typeStr = (p.paymentType || 'اشتراك شهري').trim();
    const receiptStr = (p.receiptNumber || '').trim();
    const amountVal = Math.round(Number(p.amount) || 0);

    // Differentiate master vs child vs single records to prevent accidental collisions
    const distTag = p.isDistributed 
      ? 'master' 
      : (p.distributionSourceId ? `child_${p.distributionSourceId}` : `single_${p.id}`);

    const fpKey = `${flatKey}_${yearNum}_${monthNum}_${typeStr}_${amountVal}_${receiptStr}_${distTag}`;

    const existing = fingerprintMap.get(fpKey);
    if (!existing) {
      fingerprintMap.set(fpKey, p);
    } else {
      const isExistingDist = existing.isDistributed || Boolean(existing.distributionSourceId);
      const isCurrentDist = p.isDistributed || Boolean(p.distributionSourceId);

      let winner = existing;
      let loser = p;

      if (isCurrentDist && !isExistingDist) {
        winner = p;
        loser = existing;
      } else if (!isCurrentDist && isExistingDist) {
        winner = existing;
        loser = p;
      } else {
        if (!existing.fileUrl && p.fileUrl) {
          winner = p;
          loser = existing;
        }
      }

      const mergedWinner: Payment = {
        ...winner,
        fileUrl: winner.fileUrl || loser.fileUrl,
        receiptNumber: winner.receiptNumber || loser.receiptNumber,
        notes: winner.notes ? (loser.notes && !winner.notes.includes(loser.notes) ? `${winner.notes} | ${loser.notes}` : winner.notes) : loser.notes,
      };

      fingerprintMap.set(fpKey, mergedWinner);
    }
  }

  return Array.from(fingerprintMap.values());
}
