import { useMemo } from 'react';
import { Resident, Payment, AppConfig } from '../types';
import { 
  calculateResidentFinancials, 
  buildPaymentLookupIndex,
  ResidentFinancials,
  PaymentLookupIndex 
} from '../utils/financialCalculations';
import { compareFlatNumbers } from '../utils/buildingStructure';

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
}

export function useDebtsCalculations(
  residents: Resident[],
  payments: Payment[],
  config?: AppConfig,
  currentYear: number = new Date().getFullYear(),
  selectedYearFilter?: 'all' | number
): DebtsCalculationResult {
  const accountingStartDate = config?.accountingStartDate || '2026-01-01';
  const defaultMonthlyFee = config?.defaultMonthlyFee || 400;
  const activityDefaultFees = config?.activityDefaultFees;

  const startYear = useMemo(() => {
    const s = new Date(accountingStartDate);
    return isNaN(s.getFullYear()) ? 2026 : s.getFullYear();
  }, [accountingStartDate]);

  // Available fiscal years list
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(startYear);
    years.add(currentYear);
    payments.forEach(p => {
      const y = Number(p.year) || (p.date ? new Date(p.date).getFullYear() : 0);
      if (y >= startYear) years.add(y);
    });
    years.add(currentYear + 1);
    return Array.from(years).sort((a, b) => a - b);
  }, [startYear, currentYear, payments]);

  // Fast O(1) payment index
  const paymentIndex = useMemo(() => buildPaymentLookupIndex(payments), [payments]);

  // Calculate financials for all residents
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
        accountingStartDate,
        defaultMonthlyFee,
        activityDefaultFees,
        targetYear
      );

      const carriedBal = targetYear !== undefined
        ? fin.carriedPreviousBalance
        : (res.initialBalance || 0);

      const item: ResidentDebtItem = {
        resident: res,
        financials: fin,
        carriedBalance: carriedBal,
      };

      if (fin.netBalance < 0) {
        debtors.push(item);
        const debt = Math.abs(fin.netBalance);
        debtSum += debt;
        if (!maxDebt || debt > Math.abs(maxDebt.financials.netBalance)) {
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
  }, [residents, paymentIndex, accountingStartDate, defaultMonthlyFee, activityDefaultFees, selectedYearFilter]);

  return {
    paymentIndex,
    allDebtorsList,
    allSurplusList,
    totalDebt,
    totalSurplus,
    totalDebtorsCount: allDebtorsList.length,
    maxDebtItem,
    availableYears,
  };
}
