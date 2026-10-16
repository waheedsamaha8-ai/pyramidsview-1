import { AccountingPeriod, AppConfig, Payment, Expense, Resident, ActivityFeePeriod } from '../types';
import { 
  isValidPaidPayment, 
  getResidentMonthlyFee, 
  buildPaymentLookupIndex,
  parsePaymentYear,
  parsePaymentMonth,
  parseExpenseYear,
  parseExpenseMonth
} from './financialCalculations';

/**
 * Normalizes a date string like "2022-01-01" or "2022-01" into year and month (1-12).
 */
export function parseYearMonth(dateStr?: string): { year: number; month: number } | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  const parts = clean.split(/[-/]/);
  if (parts.length >= 2) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }
  return null;
}

/**
 * Checks if a specific year and month falls inside the given accounting period.
 */
export function isYearMonthInPeriod(year: number, month: number, period: AccountingPeriod): boolean {
  if (!period) return true;
  const start = parseYearMonth(period.startDate);
  const end = parseYearMonth(period.endDate);

  if (start) {
    if (year < start.year) return false;
    if (year === start.year && month < start.month) return false;
  }

  if (end) {
    if (year > end.year) return false;
    if (year === end.year && month > end.month) return false;
  }

  return true;
}

/**
 * Checks if a payment belongs to the given accounting period.
 */
export function isPaymentInPeriod(payment: Payment, period?: AccountingPeriod | null): boolean {
  if (!period || period.id === 'ALL') return true;
  
  const pYear = parsePaymentYear(payment);
  const pMonth = parsePaymentMonth(payment);

  if (pYear === null || pMonth === null) {
    if (payment.date) {
      const d = new Date(payment.date);
      if (!isNaN(d.getTime())) {
        return isYearMonthInPeriod(d.getFullYear(), d.getMonth() + 1, period);
      }
    }
    return true;
  }

  return isYearMonthInPeriod(pYear, pMonth, period);
}

/**
 * Checks if an expense belongs to the given accounting period.
 */
export function isExpenseInPeriod(expense: Expense, period?: AccountingPeriod | null): boolean {
  if (!period || period.id === 'ALL') return true;

  const eYear = parseExpenseYear(expense);
  const eMonth = parseExpenseMonth(expense);

  if (eYear === null || eMonth === null) {
    if (expense.date) {
      const d = new Date(expense.date);
      if (!isNaN(d.getTime())) {
        return isYearMonthInPeriod(d.getFullYear(), d.getMonth() + 1, period);
      }
    }
    return true;
  }

  return isYearMonthInPeriod(eYear, eMonth, period);
}

/**
 * Retrieves the currently active AccountingPeriod from config, or null if none active (or 'ALL').
 */
export function getActiveAccountingPeriod(config?: AppConfig): AccountingPeriod | null {
  if (!config || !config.accountingPeriods || config.accountingPeriods.length === 0) {
    return null;
  }
  if (!config.activePeriodId || config.activePeriodId === 'ALL') {
    return null;
  }
  const found = config.accountingPeriods.find(p => p.id === config.activePeriodId);
  return found || null;
}

/**
 * Computes financial closing metrics (الختامي) for a specific accounting period.
 */
export function computePeriodClosingSummary(
  period: AccountingPeriod,
  payments: Payment[] = [],
  expenses: Expense[] = [],
  residents: Resident[] = [],
  defaultMonthlyFee: number = 400,
  activityDefaultFees?: Record<string, number>
) {
  const periodPayments = payments.filter(p => isPaymentInPeriod(p, period) && isValidPaidPayment(p));
  const totalCollections = periodPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const periodExpenses = expenses.filter(e => isExpenseInPeriod(e, period));
  const totalExpenses = periodExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const netBalance = totalCollections - totalExpenses;

  // Calculate elapsed months in this period
  const start = parseYearMonth(period.startDate);
  const end = parseYearMonth(period.endDate);

  let monthsCount = 1;
  if (start && end) {
    monthsCount = Math.max(1, (end.year - start.year) * 12 + (end.month - start.month) + 1);
  }

  // Calculate expected dues for all units for this period
  let totalExpectedDues = 0;
  residents.forEach(res => {
    const fee = getResidentMonthlyFee(res, defaultMonthlyFee, activityDefaultFees);
    totalExpectedDues += fee * monthsCount;
  });

  const totalDebt = Math.max(0, totalExpectedDues - totalCollections);

  return {
    totalCollections,
    totalExpenses,
    netBalance,
    totalExpectedDues,
    totalDebt,
    monthsCount,
  };
}

export const arabicMonthNames = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export function getArabicMonthName(monthNumber: number): string {
  if (monthNumber >= 1 && monthNumber <= 12) {
    return arabicMonthNames[monthNumber - 1];
  }
  return '';
}

/**
 * Calculates the last day of a given month (28, 29, 30, or 31).
 */
export function getLastDayOfMonth(year: number | string, month: number | string): number {
  const y = Number(year) || 2026;
  const m = Number(month) || 12;
  return new Date(y, m, 0).getDate();
}

/**
 * Formats a period single date into "شهر [اسم الشهر] [السنة]" without day numbers.
 * E.g., "2022-01-01" -> "يناير 2022"
 */
export function formatPeriodMonthYear(dateStr?: string): string {
  const p = parseYearMonth(dateStr);
  if (!p) return dateStr || '';
  const mName = getArabicMonthName(p.month);
  return `${mName} ${p.year}`;
}

/**
 * Formats a period range into user-friendly Arabic without any day numbers.
 * E.g., "2022-01-01" and "2023-12-31" -> "من شهر يناير 2022 إلى نهاية شهر ديسمبر 2023"
 */
export function formatPeriodDateRange(startDate?: string, endDate?: string, short = false): string {
  const start = parseYearMonth(startDate);
  const end = parseYearMonth(endDate);

  if (!start && !end) return '';
  if (start && !end) {
    const sm = getArabicMonthName(start.month);
    return short ? `${sm} ${start.year}` : `من شهر ${sm} ${start.year}`;
  }
  if (!start && end) {
    const em = getArabicMonthName(end.month);
    return short ? `${em} ${end.year}` : `حتى نهاية شهر ${em} ${end.year}`;
  }

  if (start && end) {
    const sm = getArabicMonthName(start.month);
    const em = getArabicMonthName(end.month);
    if (short) {
      return `${sm} ${start.year} ➔ ${em} ${end.year}`;
    }
    return `من شهر ${sm} ${start.year} إلى نهاية شهر ${em} ${end.year}`;
  }

  return '';
}

/**
 * Calculates the date boundary across ALL existing accounting periods in config.
 */
export function getAllPeriodsDateRange(config?: AppConfig): {
  earliestStartDate: string;
  latestEndDate: string;
  earliestYear: number;
  latestYear: number;
  availableYears: number[];
} {
  const periods = (config?.accountingPeriods && config.accountingPeriods.length > 0)
    ? config.accountingPeriods
    : [];

  const currentCalYear = new Date().getFullYear();

  if (periods.length === 0) {
    const fallbackStart = config?.accountingStartDate || '2026-01-01';
    const sYear = parseYearMonth(fallbackStart)?.year || 2026;
    return {
      earliestStartDate: fallbackStart,
      latestEndDate: `${currentCalYear}-12-31`,
      earliestYear: sYear,
      latestYear: currentCalYear,
      availableYears: [sYear, currentCalYear].sort((a, b) => a - b),
    };
  }

  let minDate = periods[0].startDate || '2026-01-01';
  let maxDate = periods[0].endDate || `${currentCalYear}-12-31`;

  periods.forEach(p => {
    if (p.startDate && p.startDate < minDate) minDate = p.startDate;
    if (p.endDate && p.endDate > maxDate) maxDate = p.endDate;
  });

  const s = parseYearMonth(minDate) || { year: 2022, month: 1 };
  const e = parseYearMonth(maxDate) || { year: currentCalYear, month: 12 };

  const startY = s.year;
  const endY = Math.max(e.year, currentCalYear);

  const years: number[] = [];
  for (let y = startY; y <= endY; y++) {
    years.push(y);
  }

  return {
    earliestStartDate: minDate,
    latestEndDate: maxDate,
    earliestYear: startY,
    latestYear: endY,
    availableYears: years,
  };
}

/**
 * Finds the ActivityFeePeriod matching a given date, year-month ("YYYY-MM"), or year number.
 */
export function findMatchingActivityFeePeriod(
  targetDateOrPeriod?: string | number | { year: number; month: number } | null,
  periods: ActivityFeePeriod[] = []
): ActivityFeePeriod | undefined {
  if (!periods || periods.length === 0 || !targetDateOrPeriod) return undefined;

  let targetYM: string | null = null;
  let targetYearNum: number | null = null;

  if (typeof targetDateOrPeriod === 'object' && targetDateOrPeriod !== null) {
    const y = Number(targetDateOrPeriod.year);
    const m = Number(targetDateOrPeriod.month);
    if (!isNaN(y) && !isNaN(m)) {
      targetYM = `${y}-${String(m).padStart(2, '0')}`;
      targetYearNum = y;
    }
  } else {
    const str = String(targetDateOrPeriod).trim();
    if (!str || str === 'current' || str === 'latest') {
      const now = new Date();
      targetYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      targetYearNum = now.getFullYear();
    } else if (str.length === 4 && !isNaN(Number(str))) {
      targetYearNum = Number(str);
      targetYM = `${targetYearNum}-01`;
    } else {
      const parsed = parseYearMonth(str);
      if (parsed) {
        targetYM = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
        targetYearNum = parsed.year;
      }
    }
  }

  if (!targetYM && targetYearNum === null) return undefined;

  for (const p of periods) {
    if (!p.startDate || !p.endDate) continue;
    const sParsed = parseYearMonth(p.startDate);
    const eParsed = parseYearMonth(p.endDate);
    if (!sParsed || !eParsed) continue;

    const startYM = `${sParsed.year}-${String(sParsed.month).padStart(2, '0')}`;
    const endYM = `${eParsed.year}-${String(eParsed.month).padStart(2, '0')}`;

    if (targetYM) {
      if (targetYM >= startYM && targetYM <= endYM) {
        return p;
      }
    } else if (targetYearNum !== null) {
      if (targetYearNum >= sParsed.year && targetYearNum <= eParsed.year) {
        return p;
      }
    }
  }

  return undefined;
}

/**
 * Resolves the subscription fee for an activity type for a specific date/period from the configured ActivityFeePeriod list.
 */
export function getActivityDefaultFeeForTarget(
  activityType: string,
  targetDateOrPeriod?: string | number | { year: number; month: number } | null,
  activityFeePeriods?: ActivityFeePeriod[],
  activityDefaultFees?: Record<string, number>,
  defaultMonthlyFee: number = 400
): number {
  const cleanType = (activityType || 'سكني').trim();
  if (cleanType === 'بدون تشطيب' || cleanType === 'بدون تحصيل' || cleanType.includes('بدون تشطيب') || cleanType.includes('بدون تحصيل')) {
    return 0;
  }

  if (activityFeePeriods && activityFeePeriods.length > 0) {
    const matched = findMatchingActivityFeePeriod(targetDateOrPeriod, activityFeePeriods);
    if (matched && matched.fees && matched.fees[cleanType] !== undefined) {
      return matched.fees[cleanType];
    }
  }

  if (activityDefaultFees && activityDefaultFees[cleanType] !== undefined) {
    return activityDefaultFees[cleanType];
  }

  switch (cleanType) {
    case 'سكني': return 400;
    case 'سكني مغلق': return 200;
    case 'تحت التشطيب': return 200;
    case 'مفروش': return 600;
    case 'إداري': return 800;
    case 'تجاري': return 500;
    default: return defaultMonthlyFee || 400;
  }
}

