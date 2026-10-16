import { useMemo } from 'react';
import { Resident, Payment, AppConfig } from '../types';
import { 
  calculateResidentFinancials, 
  buildPaymentLookupIndex,
  ResidentFinancials,
  PaymentLookupIndex 
} from '../utils/financialCalculations';
import { compareFlatNumbers } from '../utils/buildingStructure';
import { 
  getActiveAccountingPeriod, 
  getAllPeriodsDateRange, 
  parseYearMonth 
} from '../utils/periodUtils';

export interface ResidentDebtItem {
  resident: Resident;
  financials: ResidentFinancials;
  carriedBalance: number;
}

export interface DebtsCalculationResult {
  paymentIndex: PaymentLookupIndex;
  allDebtorsList: ResidentDebtItem[];
  allSurplusList: ResidentDebtItem[];
  totalDebt: number;
  totalSurplus: number;
  totalDebtorsCount: number;
  maxDebtItem: ResidentDebtItem | null;
  availableYears: number[];
  activePeriodTitle: string;
}

export function useDebtsCalculations(
  residents: Resident[],
  payments: Payment[],
  config?: AppConfig,
  currentYear: number = new Date().getFullYear(),
  selectedYearFilter?: 'all' | number
): DebtsCalculationResult {
  const activePeriod = useMemo(() => getActiveAccountingPeriod(config), [config]);
  const defaultMonthlyFee = config?.defaultMonthlyFee || 400;
  const activityDefaultFees = config?.activityDefaultFees;
  const activityFeePeriods = config?.activityFeePeriods;

  // Determine effective start/end dates and boundaries based on active period vs all periods
  const { 
    effectiveStartDate, 
    effectiveEndDate, 
    availableYears, 
    activePeriodTitle 
  } = useMemo(() => {
    if (activePeriod) {
      const s = parseYearMonth(activePeriod.startDate) || { year: 2022, month: 1 };
      const e = parseYearMonth(activePeriod.endDate) || { year: 2023, month: 12 };
      const yrs: number[] = [];
      for (let y = s.year; y <= e.year; y++) {
        yrs.push(y);
      }
      return {
        effectiveStartDate: activePeriod.startDate,
        effectiveEndDate: activePeriod.endDate,
        availableYears: yrs.length > 0 ? yrs : [s.year],
        activePeriodTitle: activePeriod.name,
      };
    }

    // All Periods Mode: calculate boundaries across all existing periods in config
    const allRange = getAllPeriodsDateRange(config);
    return {
      effectiveStartDate: allRange.earliestStartDate,
      effectiveEndDate: allRange.latestEndDate,
      availableYears: allRange.availableYears,
      activePeriodTitle: 'جميع الفترات المحاسبية',
    };
  }, [activePeriod, config]);

  // Fast O(1) payment index
  const paymentIndex = useMemo(() => buildPaymentLookupIndex(payments), [payments]);

  // Calculate financials for all residents strictly scoped to the active period or all periods
  const { allDebtorsList, allSurplusList, totalDebt, totalSurplus, maxDebtItem } = useMemo(() => {
    const targetYear = selectedYearFilter === 'all' ? undefined : selectedYearFilter;
    const debtors: ResidentDebtItem[] = [];
    const surplus: ResidentDebtItem[] = [];
    let debtSum = 0;
    let surplusSum = 0;
    let maxDebt: ResidentDebtItem | null = null;

    residents.forEach(res => {
      const fin = calculateResidentFinancials(
        res,
        paymentIndex,
        effectiveStartDate,
        defaultMonthlyFee,
        activityDefaultFees,
        targetYear,
        effectiveEndDate,
        activityFeePeriods
      );

      // When scoped to a single active period, prior outside debt is not added to this period's debt
      const carriedBal = targetYear !== undefined
        ? fin.carriedPreviousBalance
        : (activePeriod ? 0 : (res.initialBalance || 0));

      const item: ResidentDebtItem = {
        resident: res,
        financials: fin,
        carriedBalance: carriedBal,
      };

      const prevDebt = carriedBal < 0 ? Math.abs(carriedBal) : 0;
      const rowDebt = Math.max(0, prevDebt + (fin.unpaidMonthsDues || 0) + (fin.otherCollectionsDebt || 0));
      const hasDebt = fin.netBalance < 0 || fin.totalDueForPayment > 0 || fin.unpaidMonthsCount > 0 || fin.totalArrears > 0 || rowDebt > 0;

      if (hasDebt) {
        debtors.push(item);
        const debt = rowDebt > 0 ? rowDebt : (fin.totalDueForPayment > 0 ? fin.totalDueForPayment : Math.abs(fin.netBalance));
        debtSum += debt;
        if (!maxDebt || debt > (maxDebt.financials.totalDueForPayment || Math.abs(maxDebt.financials.netBalance))) {
          maxDebt = item;
        }
      } else if (fin.netBalance > 0) {
        surplus.push(item);
        surplusSum += fin.netBalance;
      }
    });

    debtors.sort((a, b) => compareFlatNumbers(a.resident.flatNumber, b.resident.flatNumber));
    surplus.sort((a, b) => compareFlatNumbers(a.resident.flatNumber, b.resident.flatNumber));

    return {
      allDebtorsList: debtors,
      allSurplusList: surplus,
      totalDebt: debtSum,
      totalSurplus: surplusSum,
      maxDebtItem: maxDebt,
    };
  }, [
    residents, 
    paymentIndex, 
    effectiveStartDate, 
    effectiveEndDate, 
    defaultMonthlyFee, 
    activityDefaultFees, 
    activityFeePeriods,
    selectedYearFilter, 
    activePeriod
  ]);

  return {
    paymentIndex,
    allDebtorsList,
    allSurplusList,
    totalDebt,
    totalSurplus,
    totalDebtorsCount: allDebtorsList.length,
    maxDebtItem,
    availableYears,
    activePeriodTitle,
  };
}
