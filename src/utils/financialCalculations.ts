import { Resident, Payment, AppConfig } from '../types';
import { isSameFlatNumber, getHistoricalActivityForDate, getDefaultFeeForActivity } from './buildingStructure';

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
      const flatKey = String(p.flatNumber).trim();
      let list = byFlat.get(flatKey);
      if (!list) {
        list = [];
        byFlat.set(flatKey, list);
      }
      list.push(p);
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
    const flatKey = resident.flatNumber !== undefined && resident.flatNumber !== null ? String(resident.flatNumber).trim() : '';
    
    const byIdList = rId ? index.byId.get(rId) : undefined;
    const byFlatList = flatKey ? index.byFlat.get(flatKey) : undefined;

    if (!byIdList && !byFlatList) {
      // Fallback in case of non-exact flat number format (e.g. 502 vs 502-1)
      return index.all.filter(p => isSameFlatNumber(p.flatNumber, resident.flatNumber));
    }

    if (byIdList && !byFlatList) return byIdList;
    if (!byIdList && byFlatList) return byFlatList;

    // Merge unique payments from both lists
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
  return (
    t === 'اشتراك شهري' ||
    t.includes('اشتراك') ||
    t.includes('شهري') ||
    t.includes('شهر') ||
    t.includes('مجمع') ||
    t.includes('تجميع') ||
    t.includes('مجمعة') ||
    t === 'تحصيل'
  );
}

/**
 * Robustly checks if a payment record matches a specific year and month.
 */
export function isPaymentForYearAndMonth(p: Payment, yNum: number, mNum: number): boolean {
  if (!p) return false;

  // Year check
  let pYear = Number(p.year);
  if (!pYear && p.date) {
    const d = new Date(p.date);
    if (!isNaN(d.getFullYear())) pYear = d.getFullYear();
  }
  if (pYear && pYear !== yNum) return false;

  // Month check
  if (p.month !== undefined && p.month !== null) {
    const mInt = parseInt(String(p.month), 10);
    if (!isNaN(mInt) && mInt > 0) {
      if (mInt === mNum) return true;
    }
    const mStr = String(p.month).trim();
    if (mStr) {
      const arabicNames = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
      ];
      const arabicName = arabicNames[mNum - 1];
      if (arabicName && (mStr === arabicName || mStr.includes(arabicName))) return true;
    }
  }

  if (p.date) {
    const d = new Date(p.date);
    if (!isNaN(d.getMonth())) {
      if (d.getFullYear() === yNum && (d.getMonth() + 1) === mNum) return true;
    }
  }

  return false;
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
    .filter(p => p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل')
    .filter(p => isMonthlySubscriptionType(p.paymentType));

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

  const validPayments = allResidentPayments
    .filter(p => p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل');

  const pendingPayments = allResidentPayments
    .filter(p => p.status === 'pending' || p.status === 'لم يتم التحصيل' || p.status === 'uncollected');

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

      // Prescribed monthly fee for this unit in this month:
      // 1. If activity history is set: use activity history fee for this period
      // 2. Else if resident.monthlyFee in units table is set (>0): use resident.monthlyFee
      // 3. Else default for this activity from Settings
      let mFee = 0;
      if (resident.activityHistory && resident.activityHistory.length > 0 && hist.monthlyFee !== undefined) {
        mFee = hist.monthlyFee;
      } else if (resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee > 0) {
        mFee = resident.monthlyFee;
      } else {
        mFee = getDefaultFeeForActivity(hist.activityType || resident.activityType, defaultMonthlyFee, activityDefaultFees);
      }

      if (mFee <= 0) continue;

      const directPaid = monthValidSubs.reduce((s, p) => s + (p.amount || 0), 0);
      const isPaid = monthValidSubs.length > 0 && (directPaid >= mFee || monthValidSubs.some(p => p.isManuallyPaid));

      periodExpectedDues += mFee;
      billableMonths.push({
        month: m,
        fee: mFee,
        directPaid,
        isFullyPaid: isPaid,
      });
    }

    const billableMonthsCount = billableMonths.length;

    // Direct month matching
    let unassignedOrSurplus = 0;
    validSubsPaymentsInYear.forEach(p => {
      const m = parseInt(String(p.month), 10);
      if (!m || m < 1 || m > 12) {
        unassignedOrSurplus += (p.amount || 0);
      }
    });

    // Allocate unassigned or surplus credit to unpaid billable months
    billableMonths.forEach(bm => {
      if (!bm.isFullyPaid) {
        const needed = bm.fee - bm.directPaid;
        if (unassignedOrSurplus >= needed) {
          unassignedOrSurplus -= needed;
          bm.isFullyPaid = true;
        }
      }
    });

    const paidMonthsCount = billableMonths.filter(bm => bm.isFullyPaid).length;
    const unpaidMonthsCount = Math.max(0, billableMonthsCount - paidMonthsCount);

    let unpaidMonthsDues = 0;
    if (unpaidMonthsCount === 0) {
      unpaidMonthsDues = 0;
    } else {
      unpaidMonthsDues = billableMonths
        .filter(bm => !bm.isFullyPaid)
        .reduce((sum, bm) => sum + Math.max(0, bm.fee - bm.directPaid), 0);
      unpaidMonthsDues = Math.max(0, unpaidMonthsDues - unassignedOrSurplus);
    }

    const expectedDues = periodExpectedDues - carriedPreviousBalance;
    const oldDebtAmount = carriedPreviousBalance < 0 ? Math.abs(carriedPreviousBalance) : 0;

    // Net debt calculation according to the exact user rule:
    // (Previous Balance / Debt) + (Late Amount for unpaid months) + (Other uncollected receipts)
    const prevDebt = carriedPreviousBalance < 0 
      ? Math.abs(carriedPreviousBalance) 
      : (carriedPreviousBalance > 0 ? -carriedPreviousBalance : 0);
    const lateDues = unpaidMonthsDues;
    const otherDebt = otherCollectionsDebt;

    // Any advance surplus from unassigned credit (when all months are paid)
    const advanceSurplus = (unpaidMonthsCount === 0 && unassignedOrSurplus > 0) ? unassignedOrSurplus : 0;
    const totalDebtAmount = prevDebt + lateDues + otherDebt - advanceSurplus;
    const netBalance = -totalDebtAmount;

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

      let mFee = 0;
      if (resident.activityHistory && resident.activityHistory.length > 0 && hist.monthlyFee !== undefined) {
        mFee = hist.monthlyFee;
      } else if (resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee > 0) {
        mFee = resident.monthlyFee;
      } else {
        mFee = getDefaultFeeForActivity(hist.activityType || resident.activityType, defaultMonthlyFee, activityDefaultFees);
      }

      if (mFee > 0) {
        const directPaid = monthValidSubs.reduce((s, p) => s + (p.amount || 0), 0);
        const isPaid = monthValidSubs.length > 0 && (directPaid >= mFee || monthValidSubs.some(p => p.isManuallyPaid));

        periodExpectedDues += mFee;
        cumulativeBillableMonths.push({
          year: y,
          month: m,
          fee: mFee,
          directPaid,
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
  let unassignedOrSurplus = 0;
  validSubsPayments.forEach(p => {
    const pMonth = parseInt(String(p.month), 10);
    if (!pMonth || pMonth < 1 || pMonth > 12) {
      unassignedOrSurplus += (p.amount || 0);
    }
  });

  cumulativeBillableMonths.forEach(bm => {
    if (!bm.isFullyPaid) {
      const needed = bm.fee - bm.directPaid;
      if (unassignedOrSurplus >= needed) {
        unassignedOrSurplus -= needed;
        bm.isFullyPaid = true;
      }
    }
  });

  const paidMonthsCount = cumulativeBillableMonths.filter(bm => bm.isFullyPaid).length;
  const unpaidMonthsCount = Math.max(0, billableMonthsCount - paidMonthsCount);

  let unpaidMonthsDues = 0;
  if (unpaidMonthsCount === 0) {
    unpaidMonthsDues = 0;
  } else {
    unpaidMonthsDues = cumulativeBillableMonths
      .filter(bm => !bm.isFullyPaid)
      .reduce((sum, bm) => sum + Math.max(0, bm.fee - bm.directPaid), 0);
    unpaidMonthsDues = Math.max(0, unpaidMonthsDues - unassignedOrSurplus);
  }

  const initialBal = resident.initialBalance || 0;
  const expectedDues = periodExpectedDues - initialBal;
  const oldDebtAmount = initialBal < 0 ? Math.abs(initialBal) : 0;

  // Net debt calculation according to the exact user rule:
  // (Previous Balance / Debt) + (Late Amount for unpaid months) + (Other uncollected receipts)
  const prevDebt = initialBal < 0 
    ? Math.abs(initialBal) 
    : (initialBal > 0 ? -initialBal : 0);
  const lateDues = unpaidMonthsDues;
  const otherDebt = otherCollectionsDebt;

  // Any advance surplus from unassigned credit (when all months are paid)
  const advanceSurplus = (unpaidMonthsCount === 0 && unassignedOrSurplus > 0) ? unassignedOrSurplus : 0;
  const totalDebtAmount = prevDebt + lateDues + otherDebt - advanceSurplus;
  const netBalance = -totalDebtAmount;

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
    .filter(p => p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل' && p.status !== 'uncollected')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const hasCurMonthManuallyPaid = curMonthSubsPayments.some(p => 
    p.isManuallyPaid && p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل' && p.status !== 'uncollected'
  );

  const curMonthSubsPending = curMonthSubsPayments
    .filter(p => p.status === 'pending' || p.status === 'لم يتم التحصيل' || p.status === 'uncollected')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  // Determine prescribed monthly fee for this unit in this month:
  // 1. If exempt (بدون تشطيب / بدون تحصيل): 0
  // 2. Else if resident has activityHistory for this month: use historical activity fee
  // 3. Else if resident.monthlyFee is set in units table: that is the unit's monthly subscription
  // 4. Else default for this activity from Settings tab
  let currentMonthFee = 0;
  if (isNoFee) {
    currentMonthFee = 0;
  } else if (resident.activityHistory && resident.activityHistory.length > 0 && histAct.monthlyFee !== undefined) {
    currentMonthFee = histAct.monthlyFee;
  } else if (resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee > 0) {
    currentMonthFee = resident.monthlyFee;
  } else {
    currentMonthFee = getDefaultFeeForActivity(histAct.activityType || resident.activityType, defaultMonthlyFee, activityDefaultFees);
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
    .filter(p => p.status !== 'pending' && p.status !== 'لم يتم التحصيل' && p.status !== 'uncollected')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const curMonthOtherPending = curMonthOtherPayments
    .filter(p => p.status === 'pending' || p.status === 'لم يتم التحصيل' || p.status === 'uncollected')
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
      p.status !== 'pending' && p.status !== 'لم يتم التحصيل' && p.status !== 'uncollected' && (p.amount > 0 || p.isManuallyPaid)
    );

    let feeForMonth = (resident.activityHistory && resident.activityHistory.length > 0 && pastAct.monthlyFee !== undefined)
      ? pastAct.monthlyFee
      : residentStandardFee;

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
    return pYear === yNum && isUnassigned && isMonthlySubscriptionType(p.paymentType) &&
      p.status !== 'cancelled' && p.status !== 'لاغي' && p.status !== 'pending' && p.status !== 'لم يتم التحصيل';
  });

  let lumpSumCredit = unassignedSubsPayments.reduce((s, p) => s + (p.amount || 0), 0);

  const unpaidPastMonths: PastMonthStatus[] = [];
  pastMonthsList.forEach(pm => {
    if (pm.hasPayment) {
      // Month had a payment recorded -> fully satisfied, not delayed
    } else {
      if (lumpSumCredit >= pm.fee && pm.fee > 0) {
        lumpSumCredit -= pm.fee;
      } else {
        unpaidPastMonths.push(pm);
      }
    }
  });

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
