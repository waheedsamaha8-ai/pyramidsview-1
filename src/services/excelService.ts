import * as XLSX from 'xlsx';
import { Resident, Payment, Expense, AppConfig } from '../types';

export function exportMonthlyExcelBackup(
  year: number,
  month: number, // 1-12
  residents: Resident[],
  payments: Payment[],
  expenses: Expense[],
  config: AppConfig
) {
  const monthNamesArabic = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  const monthName = monthNamesArabic[month - 1] || `شهر_${month}`;
  const monthPad = String(month).padStart(2, '0');
  const targetYearMonth = `${year}-${monthPad}`;

  // Filter payments and expenses for target month
  const monthlyPayments = payments.filter(p => (p.date || '').startsWith(targetYearMonth));
  const monthlyExpenses = expenses.filter(e => (e.date || '').startsWith(targetYearMonth));

  const totalPaymentsAmount = monthlyPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalExpensesAmount = monthlyExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netBalance = totalPaymentsAmount - totalExpensesAmount;

  // 1. Summary Sheet Data
  const summaryData = [
    ['تقرير النسخة الاحتياطية الشاملة - اتحاد ملاك عمارة ' + (config?.buildingName || 'بيراميدز فيو 1')],
    ['تاريخ الإصدار:', new Date().toLocaleDateString('ar-EG')],
    ['الفترة المالية:', `${monthName} ${year}`],
    [''],
    ['المؤشر المالي', 'المبلغ (جنيه مصري)'],
    ['إجمالي التحصيلات والشواغل', totalPaymentsAmount],
    ['إجمالي المصروفات والنفقات', totalExpensesAmount],
    ['صافي الفائض / العجز للشهر', netBalance],
    ['عدد عمليات التحصيل', monthlyPayments.length],
    ['عدد الفواتير والمصروفات', monthlyExpenses.length],
    ['عدد الشقق المسجلة', residents.length],
  ];

  // 2. Monthly Payments Sheet Data
  const paymentsHeader = ['رقم الإيصال', 'رقم الشقة', 'اسم الساكن', 'فئة التحصيل', 'المبلغ (ج.م)', 'تاريخ التحصيل', 'ملاحظات'];
  const paymentsRows = monthlyPayments.map(p => {
    const res = residents.find(r => r.id === p.residentId || String(r.flatNumber) === String(p.flatNumber));
    return [
      p.receiptNumber || p.id,
      p.flatNumber || res?.flatNumber || '',
      res?.name || p.residentName || '',
      p.paymentType || 'اشتراك شهري',
      Number(p.amount) || 0,
      p.date || '',
      p.notes || ''
    ];
  });

  // 3. Monthly Expenses Sheet Data
  const expensesHeader = ['رقم المعاملة', 'بند المصروف', 'المبلغ (ج.م)', 'التاريخ', 'ملاحظات'];
  const expensesRows = monthlyExpenses.map(e => [
    e.id,
    e.expenseType || 'مصروف عام',
    Number(e.amount) || 0,
    e.date || '',
    e.notes || ''
  ]);

  // 4. Residents & Balance Sheet Data
  const residentsHeader = ['رقم الشقة', 'اسم المالك / الساكن', 'رقم الهاتف', 'النشاط', 'نوع الملكية', 'قيمة الاشتراك الشهري', 'الرصيد الابتدائي'];
  const residentsRows = residents.map(r => [
    r.flatNumber,
    r.name,
    r.phone || r.tenantPhone || '',
    r.activityType || 'سكني',
    r.ownershipType || 'تمليك',
    Number(r.monthlyFee) || Number(config?.defaultMonthlyFee) || 0,
    Number(r.initialBalance) || 0
  ]);

  // Create Workbook
  const wb = XLSX.utils.book_new();

  // Add Summary Sheet
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص المالي');

  // Add Payments Sheet
  const wsPayments = XLSX.utils.aoa_to_sheet([paymentsHeader, ...paymentsRows]);
  XLSX.utils.book_append_sheet(wb, wsPayments, 'تحصيلات الشهر');

  // Add Expenses Sheet
  const wsExpenses = XLSX.utils.aoa_to_sheet([expensesHeader, ...expensesRows]);
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'مصروفات الشهر');

  // Add Residents Sheet
  const wsResidents = XLSX.utils.aoa_to_sheet([residentsHeader, ...residentsRows]);
  XLSX.utils.book_append_sheet(wb, wsResidents, 'السكان والوحدات');

  // Write and download Excel File
  const buildingName = (config?.buildingName || 'بيراميدز_فيو_1').replace(/\s+/g, '_');
  const fileName = `تقرير_إكسل_${buildingName}_${year}_${monthPad}.xlsx`;
  XLSX.writeFile(wb, fileName);

  // Record last backup date in localStorage
  localStorage.setItem(`pyramids_excel_backup_${year}_${monthPad}`, new Date().toISOString());
  return fileName;
}
