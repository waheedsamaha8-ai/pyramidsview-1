import re

with open('src/components/Summaries.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove isEditing branch
start_idx = content.find('                          {isEditing ? (\n')
end_idx = content.find('                          ) : (\n')
if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + content[end_idx + len('                          ) : (\n'):]

# 2. Remove closing )}
closing_str = '                          </div>\n                          )}\n'
if closing_str in content:
    content = content.replace(closing_str, '                          </div>\n', 1)

# 3. Update 'تعديل التوزيع' button
old_edit_dist = 'onClick={() => handleStartEdit(pay, true)}'
new_edit_dist = """onClick={() => {
                                          setPaymentModalState({
                                            isOpen: true,
                                            payment: pay,
                                            resident: selectedCell.resident,
                                            month: pay.month || selectedCell.month,
                                          });
                                        }}"""
if old_edit_dist in content:
    content = content.replace(old_edit_dist, new_edit_dist, 1)

# 4. Update 'تعديل' button
old_edit_pay = 'onClick={() => handleStartEdit(pay, false)}'
new_edit_pay = """onClick={() => {
                                          setPaymentModalState({
                                            isOpen: true,
                                            payment: pay,
                                            resident: selectedCell.resident,
                                            month: pay.month || selectedCell.month,
                                          });
                                        }}"""
if old_edit_pay in content:
    content = content.replace(old_edit_pay, new_edit_pay, 1)

# 5. Update Delete handlers
old_delete_inline = """                                            onClick={() => {
                                              if (onDeletePayment) {
                                                onDeletePayment(pay.id);
                                              } else {
                                                onCellClick(selectedCell.resident.id, selectedCell.month, true, pay.id);
                                              }
                                              setSelectedCell(prev => prev ? {
                                                ...prev,
                                                payments: prev.payments.filter(p => p.id !== pay.id)
                                              } : null);
                                              setDeleteConfirmId(null);
                                            }}"""

new_delete_inline = """onClick={() => {
                                                const cleanId = String(pay.id);
                                                registerDeletedPaymentIds(cleanId);
                                                setLocalDeletedPaymentIds(prev => new Set(prev).add(cleanId));
                                                if (onDeletePayment) {
                                                  onDeletePayment(cleanId);
                                                } else {
                                                  onCellClick(selectedCell.resident.id, selectedCell.month, true, cleanId);
                                                }
                                                setSelectedCell(prev => prev ? {
                                                  ...prev,
                                                  payments: (prev.payments || []).filter(p => String(p.id) !== cleanId)
                                                } : null);
                                                setDeleteConfirmId(null);
                                              }}"""
if old_delete_inline in content:
    content = content.replace(old_delete_inline, new_delete_inline, 1)

old_delete_modal = """                                              onConfirm: () => {
                                                if (onDeletePayment) {
                                                  onDeletePayment(pay.id);
                                                } else {
                                                  onCellClick(selectedCell!.resident.id, selectedCell!.month, true, pay.id);
                                                }
                                                setSelectedCell(prev => prev ? {
                                                  ...prev,
                                                  payments: prev.payments.filter(p => p.id !== pay.id)
                                                } : null);
                                                setActionConfirm(null);
                                              }"""

new_delete_modal = """onConfirm: () => {
                                                  const cleanId = String(pay.id);
                                                  registerDeletedPaymentIds(cleanId);
                                                  setLocalDeletedPaymentIds(prev => new Set(prev).add(cleanId));
                                                  if (onDeletePayment) {
                                                    onDeletePayment(cleanId);
                                                  } else {
                                                    onCellClick(selectedCell!.resident.id, selectedCell!.month, true, cleanId);
                                                  }
                                                  setSelectedCell(prev => prev ? {
                                                    ...prev,
                                                    payments: (prev.payments || []).filter(p => String(p.id) !== cleanId)
                                                  } : null);
                                                  setActionConfirm(null);
                                                }"""
if old_delete_modal in content:
    content = content.replace(old_delete_modal, new_delete_modal, 1)

# 6. Replace Quick Payment Form with Add Payment Button
quick_start_str = '            {/* Quick Payment Input Form */}'
quick_end_str = '            {/* Footer */}'

q_start = content.find(quick_start_str)
q_end = content.find(quick_end_str)
if q_start != -1 and q_end != -1:
    add_payment_button_snippet = """            {/* Add Payment Button (replaces bottom quick input form) */}
            {!isReadOnly && role !== 'ASSISTANT' && (
              <div className="p-2.5 sm:p-3 bg-slate-50 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentModalState({
                      isOpen: true,
                      payment: null,
                      resident: selectedCell.resident,
                      month: selectedCell.month,
                    });
                  }}
                  className="w-full py-2.5 px-3 bg-blue-900 hover:bg-blue-950 active:scale-98 text-white rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>إضافة تحصيل</span>
                </button>
              </div>
            )}

"""
    content = content[:q_start] + add_payment_button_snippet + content[q_end:]

# 7. Add PaymentFormModal at the end of component
uhm_end = """      />
    </div>
  );
};"""

payment_form_modal_snippet = """      />

      {/* Payment Form Modal (Add / Edit / Multi-month distribution dialog) */}
      <PaymentFormModal
        isOpen={paymentModalState.isOpen}
        onClose={() => setPaymentModalState({ isOpen: false, payment: null })}
        initialPayment={paymentModalState.payment}
        initialResident={paymentModalState.resident || (selectedCell ? selectedCell.resident : null)}
        initialMonth={paymentModalState.month || (selectedCell ? selectedCell.month : undefined)}
        residents={residents}
        payments={payments}
        paymentTypes={availablePaymentTypes}
        role={role}
        currentYear={currentYear}
        floorConfigs={effectiveFloorConfigs}
        config={config}
        defaultMonthlyFee={defaultMonthlyFee}
        activityDefaultFees={activityDefaultFees}
        onAdd={(payment, base64Image) => {
          if (onAddPayment) {
            onAddPayment(payment, base64Image);
          }
          if (selectedCell && payment.residentId === selectedCell.resident.id && payment.month === selectedCell.month) {
            setSelectedCell(prev => prev ? {
              ...prev,
              payments: [...(prev.payments || []).filter(p => String(p.id) !== String(payment.id)), payment],
            } : null);
          }
        }}
        onEdit={(payment, base64Image) => {
          if (onEditPayment) {
            onEditPayment(payment, base64Image);
          }
          if (selectedCell) {
            setSelectedCell(prev => prev ? {
              ...prev,
              payments: (prev.payments || []).map(p => String(p.id) === String(payment.id) ? payment : p),
            } : null);
          }
        }}
        onDistributePayment={(originalPaymentId, distributedPayments, deletedPaymentIds) => {
          if (deletedPaymentIds && deletedPaymentIds.length > 0) {
            deletedPaymentIds.forEach(id => {
              const cleanId = String(id);
              registerDeletedPaymentIds(cleanId);
              setLocalDeletedPaymentIds(prev => new Set(prev).add(cleanId));
            });
          }
          if (onDistributePayment) {
            onDistributePayment(originalPaymentId, distributedPayments, deletedPaymentIds);
          }
          if (selectedCell) {
            const deletedSet = new Set((deletedPaymentIds || []).map(String));
            deletedSet.add(String(originalPaymentId));
            setSelectedCell(prev => {
              if (!prev) return null;
              const kept = (prev.payments || []).filter(p => !deletedSet.has(String(p.id)));
              const added = distributedPayments.filter(p => p.residentId === prev.resident.id && p.month === prev.month && p.year === currentYear);
              return {
                ...prev,
                payments: [...kept, ...added],
              };
            });
          }
        }}
        onEditResident={onEditResident}
        onPreviewImage={onPreviewImage}
      />
    </div>
  );
};"""

if uhm_end in content:
    content = content.replace(uhm_end, payment_form_modal_snippet, 1)

with open('src/components/Summaries.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Update completed successfully!")
