import React, { useState, useRef, useMemo } from 'react';
import { Expense, UserRole, Resident } from '../types';
import { Search, Plus, Filter, Calendar, FileText, Image as ImageIcon, Camera, Trash2, Edit, AlertCircle, Eye, LayoutGrid, List, Upload, Download, RefreshCw, Share2, CheckCircle2, Printer } from 'lucide-react';
import { generateElementImageBlob, GeneratedImageResult } from '../utils/imageExport';
import { shareImageViaWhatsApp } from '../utils/shareImageViaWhatsApp';
import { ShareReportModal } from './ShareReportModal';
import { compressImageFile } from '../utils/imageCompressor';

interface ExpensesListProps {
  expenses: Expense[];
  expenseTypes: string[];
  role: UserRole;
  currentYear: number;
  residents?: Resident[];
  onAdd: (expense: Expense, base64Image?: string) => void;
  onEdit: (expense: Expense, base64Image?: string) => void;
  onDelete: (id: string) => void;
  onPreviewImage: (url: string) => void;
}

export const ExpensesList: React.FC<ExpensesListProps> = ({
  expenses,
  expenseTypes,
  role,
  currentYear,
  residents = [],
  onAdd,
  onEdit,
  onDelete,
  onPreviewImage,
}) => {
  const [filterMonth, setFilterMonth] = useState('');
  const [filterType, setFilterType] = useState('');
  const [onlyCurrentMonth, setOnlyCurrentMonth] = useState(true);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [confirmData, setConfirmData] = useState<{ type: 'add' | 'edit' | 'delete'; expenseData?: Expense; base64Image?: string; deleteId?: string } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [shareReportModal, setShareReportModal] = useState<{
    isOpen: boolean;
    imageBlob: Blob | null;
    imageDataUrl: string | null;
    fileName: string;
    reportPeriodText: string;
    reportStatsText: string;
  }>({
    isOpen: false,
    imageBlob: null,
    imageDataUrl: null,
    fileName: '',
    reportPeriodText: '',
    reportStatsText: '',
  });

  const actualCurrentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

  // Form states
  const [month, setMonth] = useState(actualCurrentMonth);
  const [expenseType, setExpenseType] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [imageName, setImageName] = useState('');
  const [base64Image, setBase64Image] = useState<string>('');
  const [existingFileUrl, setExistingFileUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const monthNamesArabic = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  const handleGenerateMonthlyReportImage = async () => {
    setIsGeneratingImage(true);
    try {
      let periodLabel = '';
      if (onlyCurrentMonth) {
        periodLabel = `شهر_${monthNamesArabic[parseInt(actualCurrentMonth, 10) - 1]}_${currentYear}`;
      } else if (filterMonth) {
        periodLabel = `شهر_${monthNamesArabic[parseInt(filterMonth, 10) - 1]}_${currentYear}`;
      } else {
        periodLabel = `إجمالي_المصروفات_${currentYear}`;
      }

      if (filterType) {
        periodLabel += `_فئة_${filterType}`;
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `تقرير_مصروفات_${periodLabel}_${dateStr}.png`;

      const result = await generateElementImageBlob('expenses-monthly-printable-area', fileName);

      const totalAmt = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
      const count = filteredExpenses.length;
      const periodText = onlyCurrentMonth
        ? `مصروفات شهر ${monthNamesArabic[parseInt(actualCurrentMonth, 10) - 1]} ${currentYear}`
        : filterMonth
        ? `مصروفات شهر ${monthNamesArabic[parseInt(filterMonth, 10) - 1]} ${currentYear}`
        : `إجمالي مصروفات السنة المالية ${currentYear}`;

      const statsText = `الإجمالي: ${totalAmt.toLocaleString()} ج.م | عدد البنود: ${count}`;

      setShareReportModal({
        isOpen: true,
        imageBlob: result.blob,
        imageDataUrl: result.dataUrl,
        fileName,
        reportPeriodText: periodText,
        reportStatsText: statsText,
      });
    } catch (e) {
      console.error('Image generation error:', e);
      alert('حدث خطأ أثناء توليد صورة تقرير المصروفات، يُرجى المحاولة مرة أخرى.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Print Expenses Report Handler
  const handlePrintExpensesReport = () => {
    document.body.classList.remove('printing-statement', 'printing-debts');
    window.focus();

    try {
      window.print();
    } catch (err) {
      console.warn('Direct print failed, trying iframe print fallback:', err);
    }

    const elem = document.getElementById('expenses-monthly-printable-area');
    if (elem) {
      let iframe = document.getElementById('print-iframe-expenses') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe-expenses';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
      }
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <title>طباعة تقرير المصروفات</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; background: white; color: black; direction: rtl; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { border: 1px solid #334155; padding: 6px 8px; text-align: right; font-size: 12px; }
              th { background-color: #f1f5f9; font-weight: bold; }
            </style>
          </head>
          <body>
            ${elem.innerHTML}
          </body>
          </html>
        `);
        doc.close();
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        }, 400);
      }
    }
  };

  const filteredExpenses = expenses
    .filter((e) => e.year === currentYear)
    .filter((e) => {
      if (onlyCurrentMonth) {
        return parseInt(e.month, 10) === parseInt(actualCurrentMonth, 10);
      }
      return filterMonth ? parseInt(e.month, 10) === parseInt(filterMonth, 10) : true;
    })
    .filter((e) => (filterType ? e.expenseType === filterType : true));

  const currentMonthExpenses = useMemo(() => {
    return expenses
      .filter((e) => e.year === currentYear)
      .filter((e) => parseInt(e.month, 10) === parseInt(actualCurrentMonth, 10))
      .filter((e) => (filterType ? e.expenseType === filterType : true))
      .sort((a, b) => a.expenseType.localeCompare(b.expenseType) || b.amount - a.amount);
  }, [expenses, currentYear, actualCurrentMonth, filterType]);

  const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const openAddModal = () => {
    setSelectedExpense(null);
    setMonth(String(new Date().getMonth() + 1).padStart(2, '0'));
    setExpenseType(expenseTypes[0] || 'كهرباء');
    setAmount('');
    setNotes('');
    setImageName('');
    setBase64Image('');
    setExistingFileUrl('');
    setError(null);
    setShowModal(true);
  };

  const openEditModal = (expense: Expense) => {
    setSelectedExpense(expense);
    setMonth(expense.month);
    setExpenseType(expense.expenseType);
    setAmount(expense.amount);
    setNotes(expense.notes || '');
    setImageName(expense.fileUrl || expense.fileId ? 'صورة فاتورة مرفوعة مسبقاً' : '');
    setExistingFileUrl(expense.fileUrl || '');
    setBase64Image('');
    setError(null);
    setShowModal(true);
  };

  const handleRemoveImage = () => {
    setImageName('');
    setBase64Image('');
    setExistingFileUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Convert File to Base64 with compression
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('يرجى اختيار ملف صورة صالح.');
      return;
    }

    setImageName(file.name);
    try {
      const dataUrl = await compressImageFile(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.72 });
      setBase64Image(dataUrl);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        setBase64Image(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileSelection = (capture: boolean) => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      if (capture) {
        fileInputRef.current.setAttribute('capture', 'environment');
      } else {
        fileInputRef.current.removeAttribute('capture');
      }
      fileInputRef.current.click();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numAmount = Number(amount);
    if (!expenseType || !amount || isNaN(numAmount) || numAmount <= 0) {
      setError('يرجى تعبئة جميع الحقول المطلوبة بمبلغ صحيح وموجب.');
      return;
    }

    if (numAmount > 10000000) {
      setError('المبلغ المدخل كبير جداً، يرجى التأكد من كتابة المبلغ الصحيح.');
      return;
    }

    const expenseData: Expense = {
      id: selectedExpense ? selectedExpense.id : `exp_${Date.now()}`,
      year: currentYear,
      month,
      expenseType: expenseType.trim(),
      amount: numAmount,
      notes: (notes || '').trim(),
      fileId: base64Image ? '' : (existingFileUrl ? (selectedExpense?.fileId || '') : ''),
      fileUrl: base64Image ? base64Image : (existingFileUrl || ''),
      date: selectedExpense ? selectedExpense.date : new Date().toISOString().split('T')[0],
    };

    setConfirmData({
      type: selectedExpense ? 'edit' : 'add',
      expenseData,
      base64Image: base64Image || undefined
    });
  };

  const handleDelete = (id: string) => {
    setConfirmData({
      type: 'delete',
      deleteId: id
    });
  };

  const isReadOnly = role === 'RESIDENT';

  return (
    <div className="space-y-4 text-right">
      {/* Toast Feedback for WhatsApp Sharing */}
      {toastMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-start gap-2 animate-fade-in shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">{toastMsg}</div>
          <button 
            type="button"
            onClick={() => setToastMsg(null)} 
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top controls & stats */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="relative flex-1 md:flex-none">
            <select
              value={onlyCurrentMonth ? actualCurrentMonth : filterMonth}
              onChange={(e) => {
                setFilterMonth(e.target.value);
                setOnlyCurrentMonth(false);
              }}
              className="w-full md:w-36 px-2.5 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/10 outline-none rtl:text-right cursor-pointer"
            >
              <option value="">كل الشهور</option>
              {monthNamesArabic.map((name, idx) => (
                <option key={idx} value={String(idx + 1).padStart(2, '0')}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 md:flex-none">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full md:w-36 px-2.5 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/10 outline-none rtl:text-right cursor-pointer"
            >
              <option value="">كل الفئات</option>
              {expenseTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>



          {/* View switcher buttons */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'}`}
              title="عرض كروت"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'}`}
              title="عرض جدول"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Action Controls: Toggle current month, Generate Report Image, Print Report, Add Expense */}
        <div className={`grid ${isReadOnly ? 'grid-cols-3' : 'grid-cols-4'} gap-1 sm:gap-2 w-full lg:w-auto pt-2 border-t border-slate-100 lg:border-t-0 lg:pt-0`}>
          {/* Toggle Button for Current Month Only */}
          <button
            type="button"
            onClick={() => setOnlyCurrentMonth(!onlyCurrentMonth)}
            className={`w-full py-2 px-1 sm:px-2.5 rounded-xl text-[10px] sm:text-xs font-black transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs border text-center ${
              onlyCurrentMonth
                ? 'bg-blue-900 text-white border-blue-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="عند التفعيل يتم عرض مصروفات الشهر الحالي فقط، وعند الإلغاء يتم عرض مصروفات جميع الشهور"
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">الشهر الحالي</span>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                onlyCurrentMonth ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'
              }`}
            />
          </button>

          {/* Generate Expenses Report Image & Direct WhatsApp Share Button */}
          <button
            type="button"
            onClick={handleGenerateMonthlyReportImage}
            disabled={isGeneratingImage}
            className="w-full py-2 px-1 sm:px-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white rounded-xl text-[10px] sm:text-xs font-black transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs disabled:opacity-50 text-center"
            title="توليد تقرير المصروفات المتزامن تماماً مع البيانات المعروضة ومشاركته مباشرة عبر واتساب"
          >
            {isGeneratingImage ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-200 shrink-0" />
                <span className="truncate">جاري التوليد...</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
                <span className="truncate">توليد تقرير</span>
              </>
            )}
          </button>

          {/* Print Expenses Report Button */}
          <button
            type="button"
            onClick={handlePrintExpensesReport}
            className="w-full py-2 px-1 sm:px-2.5 bg-indigo-800 hover:bg-indigo-900 active:scale-95 text-white rounded-xl text-[10px] sm:text-xs font-black transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs text-center"
            title="طباعة تقرير المصروفات المعتمد المعروض حالياً"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
            <span className="truncate">طباعة تقرير</span>
          </button>

          {!isReadOnly && (
            <button
              onClick={openAddModal}
              className="w-full py-2 px-1 sm:px-2.5 flex items-center justify-center gap-1 bg-blue-900 text-white rounded-xl font-bold text-[10px] sm:text-xs hover:bg-blue-950 active:scale-[0.98] transition shadow-xs cursor-pointer text-center"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">إضافة مصروف</span>
            </button>
          )}
        </div>
      </div>

      {viewMode === 'table' ? (
        /* Expenses Table View */
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-extrabold text-[11px] border-b border-slate-100">
                  <th className="px-4 py-3">البند</th>
                  <th className="px-4 py-3">الشهر</th>
                  <th className="px-4 py-3">المبلغ</th>
                  <th className="px-4 py-3">ملاحظات والتفاصيل</th>
                  <th className="px-4 py-3 text-center">الفاتورة</th>
                  {!isReadOnly && role !== 'ASSISTANT' && <th className="px-4 py-3 text-center">الإجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={!isReadOnly && role !== 'ASSISTANT' ? 6 : 5} className="px-4 py-10 text-center text-slate-400 font-bold">
                      <div className="flex flex-col items-center gap-1.5">
                        <FileText className="w-7 h-7 stroke-[1.5]" />
                        <span>لا توجد مصروفات مسجلة تطابق هذه الشروط في {currentYear}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredExpenses
                    .sort((a, b) => b.month.localeCompare(a.month))
                    .map((exp) => {
                      const isSelected = selectedItemId === exp.id;
                      return (
                        <tr 
                          key={exp.id} 
                          onClick={() => setSelectedItemId(isSelected ? null : exp.id)}
                          className={`group transition cursor-pointer ${
                            isSelected 
                              ? 'bg-yellow-50/90 border-y border-yellow-400' 
                              : 'hover:bg-slate-50/50'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-[10px] font-black">
                              {exp.expenseType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 font-semibold">
                            {monthNamesArabic[parseInt(exp.month) - 1]} {exp.year}
                          </td>
                          <td className="px-4 py-3 text-red-600 font-black">{Math.round(exp.amount)} ج.م</td>
                          <td className="px-4 py-3 text-slate-500 font-semibold leading-relaxed max-w-xs truncate">
                            {exp.notes || 'لا توجد'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {exp.fileUrl ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); onPreviewImage(exp.fileUrl!); }}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition inline-flex items-center gap-1 text-[10px] cursor-pointer font-bold"
                                title="عرض الفاتورة"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>عرض</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-300 font-bold">لا يوجد</span>
                            )}
                          </td>
                          {!isReadOnly && role !== 'ASSISTANT' && (
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditModal(exp); }}
                                  className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded transition"
                                  title="تعديل"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(exp.id); }}
                                  className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                                  title="حذف"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                )}
                {filteredExpenses.length > 0 && (
                  <tr className="bg-red-50/90 border-t-2 border-red-200 font-extrabold text-slate-900">
                    <td colSpan={2} className="px-4 py-3.5 text-right font-black text-red-950 text-xs sm:text-sm">
                      إجمالي المصروفات الكلي:
                    </td>
                    <td className="px-4 py-3.5 text-red-700 text-sm font-black whitespace-nowrap">
                      {Math.round(totalAmount)} ج.م
                    </td>
                    <td colSpan={!isReadOnly && role !== 'ASSISTANT' ? 3 : 2} className="px-4 py-3.5"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Expenses Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredExpenses.length === 0 ? (
            <div className="col-span-full border border-dashed border-slate-200 rounded-2xl py-10 flex flex-col items-center justify-center text-slate-400 gap-2">
              <FileText className="w-8 h-8 stroke-[1.5]" />
              <p className="text-xs font-bold">لا توجد مصروفات مسجلة تطابق هذه الشروط في {currentYear}</p>
            </div>
          ) : (
            filteredExpenses
              .sort((a, b) => b.month.localeCompare(a.month))
              .map((exp) => {
                const isSelected = selectedItemId === exp.id;
                return (
                  <div 
                    key={exp.id} 
                    onClick={() => setSelectedItemId(isSelected ? null : exp.id)}
                    className={`rounded-2xl px-3.5 py-2.5 border shadow-sm flex flex-col justify-between transition duration-200 cursor-pointer ${
                      isSelected 
                        ? 'bg-yellow-50/90 border-yellow-400 shadow-md ring-2 ring-yellow-400/20' 
                        : 'bg-white border-slate-100 hover:border-red-100'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-lg text-[10px] font-black">
                          {exp.expenseType}
                        </span>
                        <span className="text-[11px] text-slate-500 font-bold">
                          {monthNamesArabic[parseInt(exp.month) - 1]} {exp.year}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between border-b border-slate-50 pb-2 mb-2">
                        <span className="text-[11px] text-slate-400 font-bold">المبلغ المستحق</span>
                        <span className="text-red-600 text-sm font-black">{Math.round(exp.amount)} ج.م</span>
                      </div>

                      {exp.notes && (
                        <p className="text-[10px] text-slate-600 font-bold bg-slate-50 p-2 rounded border border-slate-100 mb-2 leading-relaxed">
                          {exp.notes}
                        </p>
                      )}

                      {exp.fileUrl && (
                        <div 
                          onClick={(e) => { e.stopPropagation(); onPreviewImage(exp.fileUrl!); }}
                          className="flex items-center gap-2.5 p-2 bg-blue-50/60 hover:bg-blue-100/60 border border-blue-100 rounded-xl mb-2 cursor-pointer group/img transition shadow-2xs"
                          title="اضغط لمعاينة الفاتورة بالحجم الكامل"
                        >
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-blue-200 shrink-0 bg-slate-200">
                            <img src={exp.fileUrl} alt="فاتورة" className="w-full h-full object-cover group-hover/img:scale-110 transition duration-200" />
                            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center text-white">
                              <Eye className="w-3.5 h-3.5" />
                            </div>
                          </div>
                          <div className="text-right flex-1 min-w-0">
                            <span className="text-[10.5px] font-black text-blue-900 block truncate">فاتورة مرفقة</span>
                            <span className="text-[9.5px] text-blue-700 font-extrabold flex items-center gap-1">
                              <Eye className="w-3 h-3 text-blue-600" />
                              <span>اضغط للاطلاع على التفاصيل</span>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 border-t border-slate-50 pt-3 mt-2">
                      {exp.fileUrl ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onPreviewImage(exp.fileUrl!); }}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-blue-100 text-blue-700 hover:bg-blue-50 rounded-lg text-[10px] font-bold transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>عرض الفاتورة</span>
                        </button>
                      ) : (
                        <span className="flex-1 text-center text-[10px] text-slate-300 font-bold py-1.5">لا يوجد مستند مرفق</span>
                      )}

                      {!isReadOnly && role !== 'ASSISTANT' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(exp); }}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-100 rounded-lg transition cursor-pointer"
                            title="تعديل"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(exp.id); }}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-50 rounded-lg transition cursor-pointer"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
          )}
          {filteredExpenses.length > 0 && (
            <div className="col-span-full bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between text-red-950 shadow-3xs mt-2">
              <span className="text-xs font-black">إجمالي المصروفات الكلي:</span>
              <span className="text-base font-black text-red-700">{Math.round(totalAmount)} ج.م</span>
            </div>
          )}
        </div>
      )}
      {/* Add/Edit Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-slate-100 shadow-2xl animate-scale-up text-right">
            <h3 className="text-lg font-extrabold text-slate-950 border-b pb-3 mb-5">
              {selectedExpense ? (role === 'ASSISTANT' ? 'تعديل ملاحظات المصروف' : 'تعديل المصروف') : 'إضافة مصروف جديد'}
            </h3>

            {role === 'ASSISTANT' && selectedExpense && (
              <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-3 rounded-xl mb-4 font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-blue-600" />
                <span>صلاحية المساعد الفني تتيح لك التعديل في "خانة الملاحظات" فقط.</span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-xs p-4 rounded-xl mb-4 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">الشهر</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    disabled={role === 'ASSISTANT' && !!selectedExpense}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:bg-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-medium transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {monthNamesArabic.map((name, idx) => (
                      <option key={idx} value={String(idx + 1).padStart(2, '0')}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">نوع المصروف <span className="text-red-500">*</span></label>
                  <select
                    value={expenseType}
                    onChange={(e) => setExpenseType(e.target.value)}
                    disabled={role === 'ASSISTANT' && !!selectedExpense}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:bg-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-medium transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {expenseTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">المبلغ بالجنيه <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  placeholder="مثال: 500"
                  value={amount === '' || isNaN(Number(amount)) ? '' : amount}
                  onChange={(e) => setAmount(e.target.value !== '' ? Number(e.target.value) : '')}
                  disabled={role === 'ASSISTANT' && !!selectedExpense}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:bg-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none text-right font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-blue-900 flex items-center justify-between">
                  <span>ملاحظات وتفاصيل الفاتورة {role === 'ASSISTANT' && selectedExpense && <span className="text-emerald-700 font-extrabold">(مسموح للتعديل)</span>}</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: صيانة مجمع الصرف الصحي بالدور الأرضي"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-3 bg-white border-2 border-blue-200 focus:border-blue-600 rounded-xl text-sm outline-none text-right font-medium transition"
                />
              </div>

              {/* Invoice Image Upload & Interactive Preview */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-900" />
                    <span>صورة الفاتورة أو المستند المرفق</span>
                  </label>
                  {(base64Image || existingFileUrl) && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 font-black px-2 py-0.5 rounded-md border border-emerald-200/60">
                      {base64Image ? 'صورة جديدة جاهزة للحفظ' : 'صورة محفوظة مسبقاً'}
                    </span>
                  )}
                </div>

                {/* If an image is selected or exists */}
                {(base64Image || existingFileUrl) ? (
                  <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-2.5 flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      {/* Image Thumbnail with zoom overlay */}
                      <div 
                        onClick={() => onPreviewImage(base64Image || existingFileUrl)}
                        className="relative w-14 h-14 rounded-xl overflow-hidden border border-slate-200 cursor-pointer shadow-2xs shrink-0 group bg-slate-200 flex items-center justify-center"
                        title="انقر لمشاهدة تفاصيل الصورة بالحجم الكامل"
                      >
                        <img 
                          src={base64Image || existingFileUrl} 
                          alt="صورة الفاتورة" 
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                        />
                        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                          <Eye className="w-4 h-4" />
                        </div>
                      </div>

                      <div className="space-y-1 text-right min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">
                          {imageName || (base64Image ? 'صورة فاتورة جديدة' : 'صورة الفاتورة المسجلة')}
                        </p>
                        <button
                          type="button"
                          onClick={() => onPreviewImage(base64Image || existingFileUrl)}
                          className="text-[10.5px] text-blue-900 hover:text-blue-950 font-black flex items-center gap-1 cursor-pointer bg-blue-50/80 px-2 py-0.5 rounded-md border border-blue-100/60 w-fit"
                        >
                          <Eye className="w-3 h-3 text-blue-700" />
                          <span>معاينة الصورة كاملة</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => triggerFileSelection(false)}
                        className="px-2 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-black transition cursor-pointer shadow-2xs"
                        title="تغيير الصورة"
                      >
                        تغيير
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-lg transition cursor-pointer shadow-2xs"
                        title="حذف الصورة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* No image selected: Choice between Camera and File Upload */
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => triggerFileSelection(true)}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-50/80 hover:bg-blue-100 text-blue-900 border border-blue-200/70 rounded-xl text-xs font-black transition cursor-pointer active:scale-[0.98]"
                    >
                      <Camera className="w-4 h-4 text-blue-800" />
                      <span>التقاط صورة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerFileSelection(false)}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-black transition cursor-pointer active:scale-[0.98]"
                    >
                      <Upload className="w-4 h-4 text-slate-500" />
                      <span>رفع صورة</span>
                    </button>
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleImageChange(e)}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-50 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg text-sm font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-900 text-white rounded-lg text-sm font-bold hover:bg-blue-950 active:scale-[0.98] transition shadow-md shadow-blue-900/10"
                >
                  {selectedExpense ? 'حفظ التعديلات' : 'إضافة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirmation Dialog */}
      {confirmData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in text-right">
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 border border-slate-100 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-center gap-3 mb-3 text-amber-500">
              <AlertCircle className="w-10 h-10 stroke-[1.5]" />
            </div>
            <h3 className="text-xs font-black text-slate-900 text-center mb-2">
              {confirmData.type === 'delete' ? 'تأكيد عملية الحذف' : 'تأكيد حفظ البيانات والعمليات'}
            </h3>
            <p className="text-[11px] text-slate-600 text-center font-bold leading-relaxed mb-4">
              {confirmData.type === 'delete' 
                ? 'هل أنت متأكد من حذف هذا المصروف؟ سيؤدي هذا إلى إزالة البند المحدد بالكامل من سجلات النفقات.'
                : confirmData.type === 'edit'
                ? `هل تود حفظ التعديلات الجديدة على مصروف "${confirmData.expenseData?.expenseType}" بمبلغ ${confirmData.expenseData?.amount} ج.م؟`
                : `أنت على وشك إضافة مصروف جديد تحت بند "${confirmData.expenseData?.expenseType}" بمبلغ ${confirmData.expenseData?.amount} ج.م. هل تود التأكيد؟`}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmData(null)}
                className="flex-1 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 border border-slate-100 rounded-lg transition"
              >
                تراجع وإلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmData.type === 'delete' && confirmData.deleteId) {
                    onDelete(confirmData.deleteId);
                  } else if (confirmData.expenseData) {
                    if (confirmData.type === 'edit') {
                      onEdit(confirmData.expenseData, confirmData.base64Image);
                    } else {
                      onAdd(confirmData.expenseData, confirmData.base64Image);
                    }
                    setShowModal(false);
                  }
                  setConfirmData(null);
                }}
                className={`flex-1 py-2 text-[10px] font-bold text-white rounded-lg transition ${confirmData.type === 'delete' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-900 hover:bg-blue-950'}`}
              >
                {confirmData.type === 'delete' ? 'نعم، حذف' : 'نعم، حفظ وتأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Expenses Printable Report Area */}
      <div
        id="expenses-monthly-printable-area"
        className="printable-area hidden print:block text-right p-6 font-sans bg-white text-slate-900"
        dir="rtl"
      >
        {/* Header */}
        <div className="text-center space-y-2 border-b-2 border-slate-800 pb-4 mb-5">
          <h1 className="text-2xl font-black text-slate-900">اتحاد ملاك عمارة بيراميدز فيو ١</h1>
          <h2 className="text-base font-bold text-slate-700">
            {onlyCurrentMonth
              ? `تقرير ونفقات شهر ${monthNamesArabic[parseInt(actualCurrentMonth, 10) - 1]} (السنة المالية ${currentYear})`
              : filterMonth
              ? `تقرير ونفقات شهر ${monthNamesArabic[parseInt(filterMonth, 10) - 1]} (السنة المالية ${currentYear})`
              : `تقرير إجمالي نفقات ومصروفات (السنة المالية ${currentYear})`}
          </h2>
          <div className="flex justify-between items-center text-xs text-slate-500 pt-2 font-semibold">
            <span>تاريخ إصدار التقرير: {new Date().toLocaleDateString('ar-EG')}</span>
            <span>إجمالي بنود المصروفات بالتقرير: {filteredExpenses.length} بند</span>
          </div>

          {/* Active Filter Indicators on Report */}
          {(filterType || !onlyCurrentMonth) && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-dashed border-slate-200 text-[11px] text-slate-600 font-bold">
              <span className="text-slate-400">الفلاتر المطبقة:</span>
              {filterType && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-300">
                  فئة المصروف: {filterType}
                </span>
              )}
              {filterMonth && !onlyCurrentMonth && (
                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded border border-amber-200">
                  شهر: {monthNamesArabic[parseInt(filterMonth, 10) - 1]}
                </span>
              )}
              {!onlyCurrentMonth && !filterMonth && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                  عرض كل الشهور
                </span>
              )}
            </div>
          )}
        </div>

        {/* Stats Summary Bar */}
        <div className="grid grid-cols-3 gap-4 border border-slate-300 rounded-xl p-4 bg-slate-50 mb-6 text-xs">
          <div className="text-center space-y-1">
            <span className="font-extrabold text-slate-500">إجمالي المبلغ المنصرف</span>
            <div className="text-base font-black text-red-700">
              {filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()} ج.م
            </div>
          </div>
          <div className="text-center space-y-1 border-x border-slate-300">
            <span className="font-extrabold text-slate-500">عدد المعاملات/الفواتير</span>
            <div className="text-base font-black text-slate-800">{filteredExpenses.length} فاتورة</div>
          </div>
          <div className="text-center space-y-1">
            <span className="font-extrabold text-slate-500">متوسط قيمة المصروف</span>
            <div className="text-base font-black text-blue-900">
              {filteredExpenses.length > 0
                ? Math.round(filteredExpenses.reduce((sum, e) => sum + e.amount, 0) / filteredExpenses.length).toLocaleString()
                : 0}{' '}
              ج.م
            </div>
          </div>
        </div>

        {/* Expenses Table */}
        <table className="w-full text-right border-collapse text-xs border border-slate-300">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-300">
              <th className="border border-slate-300 p-2 text-center w-12">#</th>
              <th className="border border-slate-300 p-2">البند / فئة المصروف</th>
              <th className="border border-slate-300 p-2 text-center">الشهر</th>
              <th className="border border-slate-300 p-2 text-center">التاريخ</th>
              <th className="border border-slate-300 p-2 text-center">المبلغ</th>
              <th className="border border-slate-300 p-2">ملاحظات والتفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center p-6 text-slate-400 font-bold">
                  لا توجد مصروفات مسجلة تطابق هذه الشروط المحددة.
                </td>
              </tr>
            ) : (
              filteredExpenses.map((exp, idx) => (
                <tr key={exp.id} className="border-b border-slate-200">
                  <td className="border border-slate-300 p-2 text-center font-bold text-slate-500">{idx + 1}</td>
                  <td className="border border-slate-300 p-2 font-black text-slate-900">{exp.expenseType}</td>
                  <td className="border border-slate-300 p-2 text-center text-slate-700">
                    {monthNamesArabic[parseInt(exp.month, 10) - 1]} {exp.year}
                  </td>
                  <td className="border border-slate-300 p-2 text-center text-slate-600 font-mono">
                    {exp.date || '—'}
                  </td>
                  <td className="border border-slate-300 p-2 text-center font-black text-red-700">
                    {exp.amount.toLocaleString()} ج.م
                  </td>
                  <td className="border border-slate-300 p-2 text-slate-600">{exp.notes || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
          {filteredExpenses.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-800">
                <td colSpan={4} className="border border-slate-300 p-2.5 text-left pl-4 font-black">
                  إجمالي المبالغ المنصرفة:
                </td>
                <td className="border border-slate-300 p-2.5 text-center text-red-800 text-sm font-black">
                  {filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()} ج.م
                </td>
                <td className="border border-slate-300 p-2.5"></td>
              </tr>
            </tfoot>
          )}
        </table>

        <div className="mt-4 pt-3 border-t border-slate-200 text-center text-[11px] text-slate-400 font-semibold">
          تم استخراج هذا التقرير تلقائياً ومطابق تماماً للبيانات والشروط النشطة على الشاشة • اتحاد ملاك عمارة بيراميدز فيو ١
        </div>
      </div>

      {/* Share Report Modal */}
      <ShareReportModal
        isOpen={shareReportModal.isOpen}
        onClose={() => setShareReportModal((prev) => ({ ...prev, isOpen: false }))}
        imageBlob={shareReportModal.imageBlob}
        imageDataUrl={shareReportModal.imageDataUrl}
        fileName={shareReportModal.fileName}
        reportTitle="تقرير مصروفات معتمد"
        reportPeriodText={shareReportModal.reportPeriodText}
        reportStatsText={shareReportModal.reportStatsText}
        residents={residents}
        onSuccessToast={(msg) => {
          setToastMsg(msg);
          setTimeout(() => setToastMsg(null), 8000);
        }}
      />
    </div>
  );
};

