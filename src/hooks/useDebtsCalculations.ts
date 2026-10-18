import { useMemo } from 'react';
import { Resident, Payment, AppConfig } from '../types';
import { 
  calculateResidentFinancials, 
  buildPaymentLookupIndex,
  getCarriedPreviousBalance,
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
        activityFeePeriods,
        config?.customUnitFeePeriods
      );

      // Determine carried balance from prior accounting periods or unit's initial starting balance
      let carriedBal = 0;
      if (targetYear !== undefined) {
        carriedBal = fin.carriedPreviousBalance;
      } else if (activePeriod) {
        const sYear = parseYearMonth(activePeriod.startDate)?.year || new Date(effectiveStartDate).getFullYear();
        carriedBal = getCarriedPreviousBalance(
          res,
          sYear,
          paymentIndex,
          config?.accountingStartDate,
          defaultMonthlyFee,
          activityDefaultFees,
          activityFeePeriods,
          config?.customUnitFeePeriods
        );
      } else {
        carriedBal = res.initialBalance || 0;
      }

      // Net Debt formula:
      // صافي الدين = (المستحق - المسدد) + تحصيلات أخرى غير مسددة + الرصيد السابق (سواء كان بالموجب أو بالسالب)
      const periodNetDebt = (fin.periodExpectedDues || 0) - (fin.monthlyPaid || 0) + (fin.otherCollectionsDebt || 0);
      const calculatedTotalNetDebt = periodNetDebt - carriedBal;
      const debt = calculatedTotalNetDebt > 0 ? Math.round(calculatedTotalNetDebt) : 0;
      const hasDebt = calculatedTotalNetDebt > 0 || fin.otherCollectionsDebt > 0 || carriedBal < 0;
      const isSurplus = calculatedTotalNetDebt < 0 || (fin.monthlyPaid > fin.periodExpectedDues && fin.otherCollectionsDebt === 0 && carriedBal >= 0);
      const isVisible = hasDebt || isSurplus || (fin.periodExpectedDues > 0 || fin.monthlyPaid > 0 || carriedBal !== 0);

      const item: ResidentDebtItem = {
        resident: res,
        financials: fin,
        carriedBalance: carriedBal,
      };

      // Push all building units unconditionally so all units appear on the report
      debtors.push(item);

      if (debt > 0) {
        debtSum += debt;
        if (!maxDebt || debt > (maxDebt.financials.totalDueForPayment || Math.abs(maxDebt.financials.netBalance))) {
          maxDebt = item;
        }
      }

      if (calculatedTotalNetDebt < 0) {
        surplus.push(item);
        surplusSum += Math.abs(calculatedTotalNetDebt);
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
