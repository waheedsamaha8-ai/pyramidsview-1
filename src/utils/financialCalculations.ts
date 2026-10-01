import { Resident, Payment, AppConfig } from '../types';
import { 
  isSameFlatNumber, 
  parseFlatNumber,
  getHistoricalActivityForDate, 
  getDefaultFeeForActivity,
  sortActivityRecordsChronologically,
  parseToStandardDate,
  isPeriodMatchingTarget
} from './buildingStructure';

/**
 * Determines the effective monthly fee for a resident (optionally for a specific historical date/period)
 * Hierarchy:
 * 1. Month-specific collection payment (if a payment exists for this unit in that month, its amount is the prescribed fee)
 * 2. Unit-specific fee if manually set in the units table (resident.monthlyFee)
 * 3. Default fee for the activity from Settings tab (config.activityDefaultFees or defaultMonthlyFee)
 */
export function getResidentMonthlyFee(
  resident: Resident,
  defaultMonthlyFee: number = 400,
  activityDefaultFees?: Record<string, number>,
  targetDateOrPeriod?: string | number,
  payments?: Payment[] | PaymentLookupIndex
): number {
  if (!resident) return defaultMonthlyFee || 400;

  // 1. If activity history is present on resident, determine fee from possession/activity history for target date/period
  if (resident.activityHistory && resident.activityHistory.length > 0) {
    const act = getHistoricalActivityForDate(resident, targetDateOrPeriod, defaultMonthlyFee, activityDefaultFees);
    if (act && act.monthlyFee !== undefined && !isNaN(act.monthlyFee) && act.monthlyFee >= 0) {
      return act.monthlyFee;
    }
  }

  // 2. If targetDateOrPeriod is specified and payments are provided:
  // Check if a collected payment exists for this unit in that month/year
  if (targetDateOrPeriod && payments) {
    const periodStr = String(targetDateOrPeriod);
    const parts = periodStr.split('-');
    const targetY = parts.length >= 1 ? parseInt(parts[0], 10) : 0;
    const targetM = parts.length >= 2 ? parseInt(parts[1], 10) : 0;
    if (targetY && targetM) {
      const resPayments = getPaymentsForResident(resident, payments);
      const monthPayment = resPayments.find(p => {
        const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : targetY);
        const pMonth = parseInt(String(p.month), 10);
        return pYear === targetY && pMonth === targetM && isMonthlySubscriptionType(p.paymentType) &&
          p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل' && p.status !== 'uncollected';
      });
      if (monthPayment && monthPayment.amount !== undefined && monthPayment.amount > 0) {
        return monthPayment.amount;
      }
    }
  }

  // 3. Otherwise if manually changed in the fees column in the units table
  if (resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee > 0) {
    return resident.monthlyFee;
  }

  // 4. Default fee for activity from Settings
  return getDefaultFeeForActivity(resident.activityType, defaultMonthlyFee, activityDefaultFees);
}

/**
 * Resolves the prescribed monthly subscription fee and activity type for a resident for a specific year and month:
 * Priority Rules (User Rule):
 * 1. Historical Activity Record for this month (if an explicit matching record exists in activityHistory for this month/period).
 * 2. Monthly subscription fee specified in the recorded unpaid/pending subscription payment for this month (if one exists).
 * 3. Monthly subscription fee specified for the unit in the units table (resident.monthlyFee if > 0) or default activity fee.
 */
export function getPrescribedFeeForMonth(
  resident: Resident,
  year: number,
  month: number,
  allResidentPayments: Payment[] = [],
  defaultMonthlyFee: number = 400,
  activityDefaultFees?: Record<string, number>
): { monthlyFee: number; activityType: string } {
  if (!resident) {
    return { monthlyFee: defaultMonthlyFee || 400, activityType: 'سكني' };
  }

  const mStr = String(month).padStart(2, '0');
  const periodStr = `${year}-${mStr}`;

  // 1. طبقاً للسجل التاريخي لنشاط الوحدة خلال هذا الشهر
  if (resident.activityHistory && Array.isArray(resident.activityHistory) && resident.activityHistory.length > 0) {
    const historyList = sortActivityRecordsChronologically(resident.activityHistory);
    const parsedTarget = parseToStandardDate(periodStr);
    if (parsedTarget) {
      const explicitMatch = historyList.find(rec =>
        rec.activityType && rec.activityType.trim() && isPeriodMatchingTarget(parsedTarget, rec.fromDate, rec.toDate)
      );
      if (explicitMatch) {
        const actType = explicitMatch.activityType.trim();
        const fee = (explicitMatch.monthlyFee !== undefined && !isNaN(explicitMatch.monthlyFee) && explicitMatch.monthlyFee >= 0)
          ? explicitMatch.monthlyFee
          : getDefaultFeeForActivity(actType, defaultMonthlyFee, activityDefaultFees);
        return { monthlyFee: fee, activityType: actType };
      }
    }
  }

  // 2. طبقاً للقيمة الواردة في كشف الوحدات للوحدة
  if (resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee > 0) {
    return {
      monthlyFee: resident.monthlyFee,
      activityType: resident.activityType || 'سكني',
    };
  }

  // 3. القيمة الافتراضية للنشاط من الإعدادات
  const hist = getHistoricalActivityForDate(resident, periodStr, defaultMonthlyFee, activityDefaultFees);
  return {
    monthlyFee: hist.monthlyFee,
    activityType: hist.activityType || resident.activityType || 'سكني',
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

/**
 * Unified check for whether a payment record represents a valid completed/collected payment.
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
    const y = Number(p.year);
    if (!isNaN(y) && y > 1900 && y < 2200) {
      return y;
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
    const s = String(p.month).trim();
    if (s) {
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
      // If p.month was explicitly provided but does not match any valid month,
      // it should NOT fallback to the transaction collection date!
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
  activityDefaultFees?: Record<string, number>
): number {
  const start = new Date(accountingStartDate || '2026-01-01');
  const startYear = isNaN(start.getFullYear()) ? 2026 : start.getFullYear();
  const startMonth = isNaN(start.getMonth()) ? 0 : start.getMonth(); // 0-indexed

  if (targetYear <= startYear) {
    return resident.initialBalance || 0;
  }

  const fee = getResidentMonthlyFee(resident, defaultMonthlyFee, activityDefaultFees);

  // Calculate elapsed months from accountingStartDate up to the end of (targetYear - 1)
  // End date is December of targetYear - 1
  const yearsDiff = (targetYear - 1) - startYear;
  const elapsedMonthsPrior = (yearsDiff * 12) + (12 - startMonth);
  let duesPrior = 0;

  if (resident.activityHistory && resident.activityHistory.length > 0) {
    for (let y = startYear; y < targetYear; y++) {
      const mStart = (y === startYear) ? startMonth + 1 : 1;
      for (let m = mStart; m <= 12; m++) {
        const mStr = String(m).padStart(2, '0');
        const monthFee = getResidentMonthlyFee(resident, defaultMonthlyFee, activityDefaultFees, `${y}-${mStr}`, paymentsOrIndex);
        duesPrior += monthFee;
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
  targetYear?: number
) {
  const fee = getResidentMonthlyFee(resident, defaultMonthlyFee, activityDefaultFees);
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
      activityDefaultFees
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
      const hist = getHistoricalActivityForDate(resident, `${targetYear}-${mStr}`, defaultMonthlyFee, activityDefaultFees);
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

      // Prescribed monthly fee for this unit in this month using 3-step priority logic
      const prescribed = getPrescribedFeeForMonth(resident, targetYear, m, allResidentPayments, defaultMonthlyFee, activityDefaultFees);
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

    return {
      monthlyFee: fee,
      monthsElapsed: billableMonthsCount > 0 ? billableMonthsCount : monthsInYear,
      billableMonthsCount,
      paidMonthsCount,
      unpaidMonthsCount,
      unpaidMonthsDues,
      periodExpectedDues,
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
  const currY = now.getFullYear();
  const currM = now.getMonth(); // 0-indexed

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
    const hist = getHistoricalActivityForDate(resident, `${y}-${mStr}`, defaultMonthlyFee, activityDefaultFees);
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
      const prescribed = getPrescribedFeeForMonth(resident, y, m, monthAllPayments, defaultMonthlyFee, activityDefaultFees);
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

  return {
    monthlyFee: fee,
    monthsElapsed: billableMonthsCount > 0 ? billableMonthsCount : totalCalendarMonthsElapsed,
    billableMonthsCount,
    paidMonthsCount,
    unpaidMonthsCount,
    unpaidMonthsDues,
    periodExpectedDues,
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

  // حاله الشهر الحالي
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

  // متأخرات اشتراك شهري
  monthlyDelayedMonthsCount: number;
  monthlyDelayedAmount: number;
  monthlyArrearsLineText: string;

  // متأخرات تحصيلات اخري
  otherDelayedMonthsCount: number;
  otherDelayedAmount: number;
  otherArrearsLineText: string;

  // مديونيات سابقة
  previousDebtAmount: number;
  previousDebtLineText: string;

  // اجمالي المبالغ المستحقه للسداد
  totalDueForPayment: number;
  totalDueLineText: string;

  // مستطيل التفصيل المالي
  currentMonthTotalDue: number;     // اجمالي المبالغ المستحقة عن هذا الشهر
  totalArrearsAndDebts: number;     // اجمالي المتأخرات و المديونيات
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
  activePaymentForClaim?: Payment | null
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
      subsLineText: `اشتراك شهري - شهر ${monthName} ${yNum} و قدره ${defaultMonthlyFee} ج.م - (غير مسدد ⚠️) .`,
      currentMonthOtherFee: 0,
      currentMonthOtherPaid: 0,
      currentMonthOtherStatusText: 'مسدد بالكامل ✓',
      isCurrentMonthOtherPaid: true,
      currentMonthOtherDue: 0,
      otherLineText: `تحصيلات اخري - شهر ${monthName} ${yNum} و قدره 0 ج.م - (مسدد بالكامل ✓) .`,
      monthlyDelayedMonthsCount: 0,
      monthlyDelayedAmount: 0,
      monthlyArrearsLineText: `متأخرات اشتراك شهري - لا يوجد تأخير (0 ج.م) .`,
      otherDelayedMonthsCount: 0,
      otherDelayedAmount: 0,
      otherArrearsLineText: `متأخرات تحصيلات اخري - لا توجد متأخرات (0 ج.م) .`,
      previousDebtAmount: 0,
      previousDebtLineText: `مديونيات سابقة - بقيمة (0 ج.م) .`,
      totalDueForPayment: defaultMonthlyFee,
      totalDueLineText: `اجمالي المبالغ المستحقه للسداد : ${defaultMonthlyFee} ج. م  (المبالغ المستحقة عن الشهر الحالي + المتأخرات + المديونيات)`,
      currentMonthTotalDue: defaultMonthlyFee,
      totalArrearsAndDebts: 0
    };
  }

  const allResidentPayments = getPaymentsForResident(resident, payments);

  const start = new Date(accountingStartDate || '2026-01-01');
  const startYear = isNaN(start.getFullYear()) ? 2026 : start.getFullYear();
  const startMonth = isNaN(start.getMonth()) ? 1 : (start.getMonth() + 1);

  // 1. Current Month Monthly Subscription
  const curPeriodStr = `${yNum}-${String(mNum).padStart(2, '0')}`;
  const histAct = getHistoricalActivityForDate(resident, curPeriodStr, defaultMonthlyFee, activityDefaultFees);
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
  // 1. If exempt (بدون تشطيب / بدون تحصيل): 0
  // 2. Else if resident has activityHistory for this month: use historical activity fee
  // 3. Else if resident.monthlyFee is set in units table: that is the unit's monthly subscription
  // 4. Else default for this activity from Settings tab
  let currentMonthFee = 0;
  if (isNoFee) {
    currentMonthFee = 0;
  } else {
    const prescribed = getPrescribedFeeForMonth(resident, yNum, mNum, allResidentPayments, defaultMonthlyFee, activityDefaultFees);
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

  const subsLineText = `اشتراك شهري - شهر ${monthName} ${yNum} و قدره ${Math.round(currentMonthFee).toLocaleString()} ج.م - (${currentMonthSubsStatusText}) .`;

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
    currentMonthOtherStatusText = 'مسدد بالكامل';
    isCurrentMonthOtherPaid = true;
    currentMonthOtherDue = 0;
  } else if (curMonthOtherPaid > 0) {
    currentMonthOtherStatusText = `غير مسدد (مسدد جزئياً ${Math.round(curMonthOtherPaid).toLocaleString()} من ${Math.round(currentMonthOtherFee).toLocaleString()} ج.م)`;
    isCurrentMonthOtherPaid = false;
    currentMonthOtherDue = Math.max(0, currentMonthOtherFee - curMonthOtherPaid);
  } else {
    currentMonthOtherStatusText = 'غير مسدد';
    isCurrentMonthOtherPaid = false;
    currentMonthOtherDue = currentMonthOtherFee;
  }

  const otherLineText = `تحصيلات اخري - شهر ${monthName} ${yNum} و قدره ${Math.round(currentMonthOtherFee).toLocaleString()} ج.م - (${currentMonthOtherStatusText}) .`;

  // 3. متأخرات اشتراك شهري (فقط للشهور التي لم يتم سداد اشتراك شهري لها)
  let monthlyDelayedMonthsCount = 0;
  let monthlyDelayedAmount = 0;

  // Base monthly fee for unit from units table if set, otherwise from Settings
  const residentStandardFee = (resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee > 0)
    ? resident.monthlyFee
    : getDefaultFeeForActivity(resident.activityType, defaultMonthlyFee, activityDefaultFees);

  interface PastMonthStatus {
    month: number;
    fee: number;
    hasPayment: boolean;
  }

  const pastMonthsList: PastMonthStatus[] = [];

  for (let m = 1; m < mNum; m++) {
    if (yNum === startYear && m < startMonth) {
      continue;
    }
    const mStr = String(m).padStart(2, '0');
    const pastAct = getHistoricalActivityForDate(resident, `${yNum}-${mStr}`, defaultMonthlyFee, activityDefaultFees);
    const isPastNoFee = Boolean(
      pastAct.activityType === 'بدون تشطيب' ||
      pastAct.activityType === 'بدون تحصيل' ||
      pastAct.activityType?.includes('بدون تشطيب') ||
      pastAct.activityType?.includes('بدون تحصيل')
    );

    if (isPastNoFee) {
      continue;
    }

    const monthSubsPayments = allResidentPayments.filter(p => {
      return isPaymentForYearAndMonth(p, yNum, m) && isMonthlySubscriptionType(p.paymentType) &&
        p.status !== 'cancelled' && p.status !== 'لاغي';
    });

    const hasCollected = monthSubsPayments.some(p =>
      isValidPaidPayment(p) && (p.amount > 0 || p.isManuallyPaid)
    );

    const prescribed = getPrescribedFeeForMonth(resident, yNum, m, allResidentPayments, defaultMonthlyFee, activityDefaultFees);
    let feeForMonth = prescribed.monthlyFee;

    pastMonthsList.push({
      month: m,
      fee: feeForMonth,
      hasPayment: hasCollected,
    });
  }

  // Check unassigned lump sums
  const unassignedSubsPayments = allResidentPayments.filter(p => {
    const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : yNum);
    const pMonth = parseInt(String(p.month), 10);
    const isUnassigned = !pMonth || pMonth < 1 || pMonth > 12;
    return pYear === yNum && isUnassigned && isMonthlySubscriptionType(p.paymentType) && isValidPaidPayment(p);
  });

  const unpaidPastMonths: PastMonthStatus[] = pastMonthsList.filter(pm => !pm.hasPayment);

  monthlyDelayedMonthsCount = unpaidPastMonths.length;
  monthlyDelayedAmount = unpaidPastMonths.reduce((sum, pm) => sum + pm.fee, 0);

  const monthlyArrearsLineText = monthlyDelayedMonthsCount > 0
    ? `متأخرات اشتراك شهري - تأخير ${monthlyDelayedMonthsCount} شهور بقيمة (${Math.round(monthlyDelayedAmount).toLocaleString()} ج.م) .`
    : `متأخرات اشتراك شهري - لا يوجد تأخير (0 ج.م) .`;

  // 4. متأخرات تحصيلات أخرى (الشهور السابقة في نفس السنة)
  const prevOtherPending = allResidentPayments.filter(p => {
    const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : yNum);
    const pMonth = parseInt(String(p.month), 10);
    return pYear === yNum && pMonth < mNum && 
      !isMonthlySubscriptionType(p.paymentType) && 
      !p.isAggregatedCollection && 
      !p.paymentType?.includes('مجمع') &&
      p.status !== 'cancelled' && p.status !== 'لاغي' && (p.status === 'pending' || p.status === 'لم يتم التحصيل' || p.status === 'uncollected');
  });

  const uniqueOtherMonths = new Set(prevOtherPending.map(p => parseInt(String(p.month), 10)));
  const otherDelayedMonthsCount = uniqueOtherMonths.size;
  const otherDelayedAmount = prevOtherPending.reduce((sum, p) => sum + (p.amount || 0), 0);

  const otherArrearsLineText = otherDelayedMonthsCount > 0
    ? `متأخرات تحصيلات اخري - تأخير ${otherDelayedMonthsCount} شهور بقيمة (${Math.round(otherDelayedAmount).toLocaleString()} ج.م) .`
    : `متأخرات تحصيلات اخري - لا توجد متأخرات (0 ج.م) .`;

  // 5. مديونيات سابقة
  const carriedBal = getCarriedPreviousBalance(
    resident,
    yNum,
    payments,
    accountingStartDate,
    defaultMonthlyFee,
    activityDefaultFees
  );

  let previousDebtAmount = 0;
  if (carriedBal < 0) {
    previousDebtAmount = Math.abs(carriedBal);
  } else if (resident.initialBalance && resident.initialBalance < 0 && yNum <= startYear) {
    previousDebtAmount = Math.abs(resident.initialBalance);
  }

  const previousDebtLineText = `مديونيات سابقة - بقيمة (${Math.round(previousDebtAmount).toLocaleString()} ج.م) .`;

  // 6. اجمالي المبالغ المستحقه للسداد
  const currentMonthTotalDue = Math.round(currentMonthSubsDue + currentMonthOtherDue);
  const totalArrearsAndDebts = Math.round(monthlyDelayedAmount + otherDelayedAmount + previousDebtAmount);
  const totalDueForPayment = Math.round(currentMonthTotalDue + totalArrearsAndDebts);

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
    monthlyDelayedMonthsCount,
    monthlyDelayedAmount,
    monthlyArrearsLineText,
    otherDelayedMonthsCount,
    otherDelayedAmount,
    otherArrearsLineText,
    previousDebtAmount,
    previousDebtLineText,
    totalDueForPayment,
    totalDueLineText,
    currentMonthTotalDue,
    totalArrearsAndDebts
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
    const carriedBalance = getCarriedPreviousBalance(
      res,
      newFiscalYear,
      payments,
      config.accountingStartDate,
      config.defaultMonthlyFee,
      config.activityDefaultFees
    );
    return {
      ...res,
      initialBalance: carriedBalance,
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

/**
 * Filter out deleted payments and deduplicate remaining payment records.
 * Guarantees that deleted payments NEVER resurface and eliminates duplicate payment records.
 */
export function filterAndDeduplicatePayments(list: Payment[]): Payment[] {
  if (!Array.isArray(list) || list.length === 0) return [];

  const deletedSet = getDeletedPaymentIds();

  // 1. Filter out deleted payment IDs & deleted flags
  const validList = list.filter(p => {
    if (!p) return false;
    const cleanId = String(p.id || '').trim();
    if (!cleanId) return false;
    if (deletedSet.has(cleanId)) return false;
    if (p.distributionSourceId && deletedSet.has(String(p.distributionSourceId).trim())) return false;
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
      // Merge image or prefer record with higher detail
      const merged: Payment = {
        ...existing,
        ...p,
        fileUrl: p.fileUrl || existing.fileUrl,
        receiptNumber: p.receiptNumber || existing.receiptNumber,
        notes: p.notes || existing.notes,
      };
      byIdMap.set(cleanId, merged);
    }
  }

  const uniqueByIdList = Array.from(byIdMap.values());

  // 3. Deduplicate active subscription payments by business fingerprint
  const fingerprintMap = new Map<string, Payment>();
  const duplicatesToPurgeInFirestore: string[] = [];

  for (const p of uniqueByIdList) {
    // Cancelled or non-subscription payments are preserved as-is
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

    // Business fingerprint
    const fpKey = `${flatKey}_${yearNum}_${monthNum}_${typeStr}_${amountVal}_${receiptStr}`;

    const existing = fingerprintMap.get(fpKey);
    if (!existing) {
      fingerprintMap.set(fpKey, p);
    } else {
      // If two records share the exact same business fingerprint:
      const isExistingDist = existing.isDistributed || Boolean(existing.distributionSourceId) || (Array.isArray(existing.distributedPaymentIds) && existing.distributedPaymentIds.length > 0);
      const isCurrentDist = p.isDistributed || Boolean(p.distributionSourceId) || (Array.isArray(p.distributedPaymentIds) && p.distributedPaymentIds.length > 0);

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

      duplicatesToPurgeInFirestore.push(String(loser.id));

      const mergedWinner: Payment = {
        ...winner,
        fileUrl: winner.fileUrl || loser.fileUrl,
        receiptNumber: winner.receiptNumber || loser.receiptNumber,
        notes: winner.notes ? (loser.notes && !winner.notes.includes(loser.notes) ? `${winner.notes} | ${loser.notes}` : winner.notes) : loser.notes,
      };

      fingerprintMap.set(fpKey, mergedWinner);
    }
  }

  // Purge duplicate loser IDs asynchronously in background
  if (duplicatesToPurgeInFirestore.length > 0) {
    import('../services/firestoreService').then(srv => {
      duplicatesToPurgeInFirestore.forEach(id => srv.deletePaymentFromFirestore(id).catch(() => {}));
    }).catch(() => {});
  }

  return Array.from(fingerprintMap.values());
}
