import { Resident, Payment, AppConfig } from '../types';
import { isSameFlatNumber } from './buildingStructure';

/**
 * Determines the effective monthly fee for a resident
 */
export function getResidentMonthlyFee(
  resident: Resident,
  defaultMonthlyFee: number = 400,
  activityDefaultFees?: Record<string, number>
): number {
  if (resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee > 0) {
    return resident.monthlyFee;
  }
  if (activityDefaultFees && activityDefaultFees[resident.activityType] !== undefined) {
    return activityDefaultFees[resident.activityType];
  }
  switch (resident.activityType) {
    case 'سكني': return 400;
    case 'سكني مغلق': return 200;
    case 'مفروش': return 600;
    case 'إداري': return 800;
    case 'تجاري': return 500;
    default: return defaultMonthlyFee || 400;
  }
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
 *     2) Adds all payments made in all previous years (year < targetYear)
 *     3) Subtracts all monthly dues for all elapsed months from accountingStartDate up to 31 Dec of (targetYear - 1).
 *     The result is the exact carried over balance (positive = surplus/credit, negative = debt).
 */
export function getCarriedPreviousBalance(
  resident: Resident,
  targetYear: number,
  payments: Payment[] = [],
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
  const duesPrior = elapsedMonthsPrior * fee;

  // Sum payments made before targetYear
  const paymentsPrior = payments
    .filter(p => {
      const matchUnit = isSameFlatNumber(p.flatNumber, resident.flatNumber) || (p.residentId && p.residentId === resident.id);
      if (!matchUnit) return false;
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
 */
export function calculateResidentFinancials(
  resident: Resident,
  payments: Payment[] = [],
  accountingStartDate: string = '2026-01-01',
  defaultMonthlyFee: number = 400,
  activityDefaultFees?: Record<string, number>,
  targetYear?: number
) {
  const fee = getResidentMonthlyFee(resident, defaultMonthlyFee, activityDefaultFees);

  if (targetYear !== undefined) {
    // Specific fiscal year calculation with automatic previous balance carry-over
    const carriedPreviousBalance = getCarriedPreviousBalance(
      resident,
      targetYear,
      payments,
      accountingStartDate,
      defaultMonthlyFee,
      activityDefaultFees
    );

    const now = new Date();
    const currentCalendarYear = now.getFullYear();
    const currentCalendarMonth = now.getMonth(); // 0-indexed

    let monthsInYear = 12;
    if (targetYear === currentCalendarYear) {
      monthsInYear = currentCalendarMonth + 1;
    } else if (targetYear > currentCalendarYear) {
      monthsInYear = 0;
    }

    const start = new Date(accountingStartDate || '2026-01-01');
    const startYear = isNaN(start.getFullYear()) ? 2026 : start.getFullYear();
    const startMonth = isNaN(start.getMonth()) ? 0 : start.getMonth();

    if (targetYear === startYear) {
      if (targetYear === currentCalendarYear) {
        monthsInYear = Math.max(1, currentCalendarMonth - startMonth + 1);
      } else {
        monthsInYear = Math.max(1, 12 - startMonth);
      }
    }

    // Expected dues in targetYear = (monthsInYear * fee) - carriedPreviousBalance
    const expectedDues = (monthsInYear * fee) - carriedPreviousBalance;

    // Payments in targetYear
    const totalPaid = payments
      .filter(p => {
        const matchUnit = isSameFlatNumber(p.flatNumber, resident.flatNumber) || (p.residentId && p.residentId === resident.id);
        if (!matchUnit) return false;
        const pYear = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : startYear);
        return pYear === targetYear;
      })
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const netBalance = totalPaid - expectedDues;

    return {
      monthlyFee: fee,
      monthsElapsed: monthsInYear,
      expectedDues,
      totalPaid,
      netBalance,
      carriedPreviousBalance,
      isDebt: netBalance < 0,
      isSurplus: netBalance > 0,
    };
  }

  // Cumulative all-time calculation
  let monthsElapsed = 1;
  try {
    const start = new Date(accountingStartDate || '2026-01-01');
    const now = new Date();
    const startY = isNaN(start.getFullYear()) ? 2026 : start.getFullYear();
    const startM = isNaN(start.getMonth()) ? 0 : start.getMonth();
    const currY = now.getFullYear();
    const currM = now.getMonth();
    const calculated = (currY - startY) * 12 + (currM - startM) + 1;
    monthsElapsed = Math.max(1, calculated);
  } catch {
    monthsElapsed = 1;
  }

  const initialBal = resident.initialBalance || 0;
  const expectedDues = (monthsElapsed * fee) - initialBal;

  const totalPaid = payments
    .filter(p => isSameFlatNumber(p.flatNumber, resident.flatNumber) || (p.residentId && p.residentId === resident.id))
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const netBalance = totalPaid - expectedDues;

  return {
    monthlyFee: fee,
    monthsElapsed,
    expectedDues,
    totalPaid,
    netBalance,
    carriedPreviousBalance: initialBal,
    isDebt: netBalance < 0,
    isSurplus: netBalance > 0,
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
