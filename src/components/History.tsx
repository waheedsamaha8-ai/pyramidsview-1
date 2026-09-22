import React from 'react';
import { Payment, Expense } from '../types';
import { History as HistoryIcon, ArrowUpRight, ArrowDownRight, Clock, Calendar } from 'lucide-react';

interface HistoryProps {
  payments: Payment[];
  expenses: Expense[];
}

export const History: React.FC<HistoryProps> = ({ payments, expenses }) => {
  // Combine both arrays and sort by creation timestamp or date
  const combinedHistory = [
    ...payments.map((p) => ({
      id: p.id,
      type: 'payment' as const,
      title: 'تحصيل اشتراك',
      description: `تم تحصيل مبلغ ${Math.round(p.amount)} ج.م من وحدة ${p.flatNumber} (${p.residentName}) لـ ${p.paymentType}`,
      amount: p.amount,
      date: p.date,
      createdAt: p.createdAt,
    })),
    ...expenses.map((e) => ({
      id: e.id,
      type: 'expense' as const,
      title: 'مصروفات تشغيلية',
      description: `تم سداد مبلغ ${Math.round(e.amount)} ج.م لبند ${e.expenseType} - ${e.notes || ''}`,
      amount: e.amount,
      date: e.date,
      createdAt: e.createdAt,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4 text-right">
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-xs">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5 mb-5 justify-between">
          <span className="text-[11px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100">
            إجمالي السجلات: <strong className="text-slate-800">{combinedHistory.length}</strong>
          </span>
          <div className="flex items-center gap-2">
            <h2 className="text-xs sm:text-sm font-black text-slate-950">سجل المعاملات والعمليات الأخيرة</h2>
            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center text-blue-900">
              <HistoryIcon className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="space-y-4 relative border-r-2 border-slate-100 pr-3.5 mr-1.5">
          {combinedHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <HistoryIcon className="w-10 h-10 stroke-[1.5] text-slate-300" />
              <p className="text-xs font-bold text-slate-500">لا توجد معاملات مسجلة في التاريخ بعد.</p>
            </div>
          ) : (
            combinedHistory.slice(0, 40).map((item) => (
              <div key={item.id} className="relative flex gap-3 items-start pr-2">
                {/* Timeline Dot Indicator */}
                <div
                  className={`absolute -right-[21px] top-2 w-3 h-3 rounded-full border-2 border-white shadow-xs ${
                    item.type === 'payment' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />

                {/* Info Block */}
                <div className="flex-1 bg-slate-50/70 border border-slate-100 rounded-xl p-3 sm:p-3.5 hover:bg-slate-50 transition">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{item.date}</span>
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1 ${
                        item.type === 'payment'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          : 'bg-rose-50 text-rose-700 border border-rose-100'
                      }`}
                    >
                      {item.type === 'payment' ? (
                        <>
                          <ArrowUpRight className="w-3 h-3" />
                          <span>وارد (+{item.amount.toLocaleString()} ج.م)</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownRight className="w-3 h-3" />
                          <span>صادر (-{item.amount.toLocaleString()} ج.م)</span>
                        </>
                      )}
                    </span>
                  </div>

                  <h4 className="text-xs font-black text-slate-900 mb-0.5">{item.title}</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed font-semibold">{item.description}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
