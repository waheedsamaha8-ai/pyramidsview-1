import React, { useState, useEffect } from 'react';
import { FloorConfig, Resident } from '../../types';
import { Building2, X, Plus, Trash2, Edit, Save, CheckCircle2 } from 'lucide-react';
import { 
  getUnitNumbersForFloor, 
  getFloorName, 
  isSameFlatNumber, 
  compareFlatNumbers, 
  parseFlatNumber 
} from '../../utils/buildingStructure';

interface BuildingStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  floorConfigs: FloorConfig[];
  residents: Resident[];
  activityTypes: string[];
  onPersistFloorChange: (configs: FloorConfig[]) => Promise<void>;
  onDeleteFloor: (floorId: string, floorLabel: string) => void;
}

const floorTypeLabels: Record<FloorConfig['type'], string> = {
  ground: 'دور أرضي',
  typical: 'دور متكرر',
  basement: 'بدروم',
  roof: 'روف',
  mezzanine: 'ميزانين',
};

export const BuildingStructureModal: React.FC<BuildingStructureModalProps> = ({
  isOpen,
  onClose,
  floorConfigs,
  residents,
  activityTypes,
  onPersistFloorChange,
  onDeleteFloor,
}) => {
  const [localFloorConfigs, setLocalFloorConfigs] = useState<FloorConfig[]>([]);
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [newUnitInputs, setNewUnitInputs] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const base = floorConfigs && floorConfigs.length > 0 ? floorConfigs : [];
      const initialized = base.map(f => {
        const units = getUnitNumbersForFloor(f, residents);
        return {
          ...f,
          unitNumbers: units,
          unitsCount: units.length,
          startUnitNumber: units.length > 0 ? units[0] : (f.startUnitNumber || 101),
        };
      });
      setLocalFloorConfigs(initialized);
      setEditingFloorId(null);
      setNewUnitInputs({});
      setToastMsg(null);
    }
  }, [isOpen, floorConfigs, residents]);

  if (!isOpen) return null;

  const addFloorConfig = () => {
    const floorCount = localFloorConfigs.length;
    const isGround = floorCount === 0;
    const startNum = isGround ? 1 : (floorCount * 100 + 1);
    const defaultUnits = [startNum, startNum + 1, startNum + 2, startNum + 3];
    const newId = `floor_${Date.now()}_${Math.random()}`;
    const newFloor: FloorConfig = {
      id: newId,
      type: isGround ? 'ground' : 'typical',
      floorLabel: isGround ? 'الدور الأرضي' : getFloorName(floorCount),
      unitsCount: defaultUnits.length,
      activityType: 'سكني',
      startUnitNumber: startNum,
      unitNumbers: defaultUnits,
    };
    setLocalFloorConfigs(prev => [...prev, newFloor]);
    setEditingFloorId(newId);
  };

  const updateFloorConfig = (id: string, updates: Partial<FloorConfig>) => {
    setLocalFloorConfigs(prev => prev.map(f => {
      if (f.id !== id) return f;
      const updated = { ...f, ...updates } as FloorConfig;
      if (updates.unitsCount !== undefined || updates.startUnitNumber !== undefined) {
        const count = updates.unitsCount !== undefined ? Math.max(1, updates.unitsCount) : f.unitsCount;
        const start = updates.startUnitNumber !== undefined ? updates.startUnitNumber : (f.startUnitNumber || 101);
        const startParsed = parseFlatNumber(start);
        const autoUnits: (number | string)[] = [];
        for (let i = 0; i < count; i++) {
          autoUnits.push(startParsed.main + i);
        }
        updated.unitNumbers = autoUnits;
        updated.unitsCount = autoUnits.length;
      }
      return updated;
    }));
  };

  const removeUnitFromFloorConfig = (floorId: string, unitNum: number | string) => {
    setLocalFloorConfigs(prev => prev.map(f => {
      if (f.id !== floorId) return f;
      const currentUnits = Array.isArray(f.unitNumbers) ? f.unitNumbers : getUnitNumbersForFloor(f, residents);
      const filtered = currentUnits.filter(u => !isSameFlatNumber(u, unitNum) && String(u).trim() !== String(unitNum).trim());
      return {
        ...f,
        unitNumbers: filtered,
        unitsCount: filtered.length,
        startUnitNumber: filtered.length > 0 ? filtered[0] : f.startUnitNumber,
      };
    }));
  };

  const addUnitToFloorConfig = (floorId: string, inputRaw: number | string) => {
    if (inputRaw === undefined || inputRaw === null) return;
    let str = String(inputRaw).trim();
    if (!str) return;

    const standardDigits: Record<string, string> = {
      '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8',
      '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8'
    };
    standardDigits['\u0669'] = '9';
    standardDigits['\u06f9'] = '9';
    str = str.replace(/[٠-٩۰-۹]/g, (char) => standardDigits[char] || char);

    const cleanUnit: number | string = /^\d+$/.test(str) ? parseInt(str, 10) : str;

    setLocalFloorConfigs(prev => prev.map(f => {
      if (f.id !== floorId) return f;
      const currentUnits = Array.isArray(f.unitNumbers) ? f.unitNumbers : getUnitNumbersForFloor(f, residents);
      if (currentUnits.some(u => isSameFlatNumber(u, cleanUnit) || String(u).trim() === String(cleanUnit).trim())) {
        alert(`الوحدة "${cleanUnit}" مسجلة بالفعل في هذا الدور`);
        return f;
      }
      const merged = [...currentUnits, cleanUnit].sort(compareFlatNumbers);
      return {
        ...f,
        unitNumbers: merged,
        unitsCount: merged.length,
        startUnitNumber: merged[0],
      };
    }));
    setNewUnitInputs(prev => ({ ...prev, [floorId]: '' }));
  };

  const handleSaveFloor = async (configsToSave: FloorConfig[]) => {
    setIsSaving(true);
    try {
      await onPersistFloorChange(configsToSave);
      setToastMsg('تم حفظ وتحديث هيكل العمارة وتوليد الشقق بنجاح! 🔥');
      setTimeout(() => setToastMsg(null), 5000);
    } catch (err: any) {
      alert('حدث خطأ أثناء الحفظ: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in" dir="rtl">
      <div className="w-full max-w-2xl bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-2xl animate-scale-up text-right flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b pb-3.5 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-50 text-blue-900 rounded-xl flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm sm:text-base font-black text-slate-950">إعداد وتصميم هيكل العمارة والأدوار</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl transition cursor-pointer">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-4 mb-4">
          {toastMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-start gap-2 animate-fade-in shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{toastMsg}</div>
              <button 
                type="button"
                onClick={() => setToastMsg(null)} 
                className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          <div className="bg-blue-50/60 p-3.5 rounded-2xl border border-blue-100/60">
            <p className="text-[11px] text-blue-950 font-bold leading-relaxed">
              يمكنك إضافة وتعديل الأدوار بسهولة. اضغط على زر حفظ بجانب الدور لتأكيد حفظه فوراً في الهيكل، أو تعديل لتغيير وحداته ونشاطه، أو حذف لإزالته نهائياً.
            </p>
          </div>

          <div>
            <button 
              type="button"
              onClick={addFloorConfig}
              className="w-full py-3.5 bg-blue-900 hover:bg-blue-950 text-white rounded-2xl flex items-center justify-center gap-2 font-black text-xs transition shadow-md active:scale-[0.98] cursor-pointer"
              title="إضافة دور جديد وتخصيص أرقام وحداته"
            >
              <Plus className="w-4 h-4 text-emerald-400 stroke-[3]" />
              <span>إضافة دور جديد لهيكل العمارة</span>
            </button>
          </div>

          <div className="space-y-3 pt-1">
            {localFloorConfigs.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2">
                <Building2 className="w-8 h-8 text-slate-400" />
                <p className="text-xs font-bold text-slate-600">
                  لا يوجد أي دور مصمم في هيكل العمارة حالياً.
                </p>
                <p className="text-[11px] text-slate-400 font-semibold">
                  اضغط على زر «إضافة دور جديد لهيكل العمارة» بالأعلى لبدء تصميم الهيكل.
                </p>
              </div>
            ) : (
              localFloorConfigs.map((floor) => {
                const floorUnits = Array.isArray(floor.unitNumbers) ? floor.unitNumbers : [];
                const currentInputVal = newUnitInputs[floor.id] || '';
                const isEditing = floor.id === editingFloorId;

                if (isEditing) {
                  return (
                    <div key={floor.id} className="bg-slate-50 p-4 rounded-2xl border-2 border-blue-200 flex flex-col gap-3 relative shadow-xs">
                      <div className="flex flex-col md:flex-row items-end md:items-center gap-3 min-w-0 w-full">
                        <div className="flex-1 min-w-[140px] space-y-1 w-full md:w-auto">
                          <label className="text-[10px] font-black text-blue-900">نوع/اسم الدور</label>
                          <div className="flex gap-1.5 min-w-0">
                            <select 
                              value={floor.type}
                              onChange={(e) => {
                                const val = e.target.value as FloorConfig['type'];
                                updateFloorConfig(floor.id, { type: val, floorLabel: floorTypeLabels[val] });
                              }}
                              className="flex-1 min-w-0 w-0 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none cursor-pointer"
                            >
                              {Object.entries(floorTypeLabels).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                              ))}
                            </select>
                            <input 
                              type="text"
                              value={floor.floorLabel}
                              onChange={(e) => updateFloorConfig(floor.id, { floorLabel: e.target.value })}
                              className="flex-1 min-w-0 w-0 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none"
                              placeholder="اسم الدور"
                            />
                          </div>
                        </div>

                        <div className="w-full md:w-auto grid grid-cols-3 gap-2 min-w-0">
                          <div className="space-y-1 min-w-0">
                            <label className="text-[10px] font-black text-blue-900 text-center block">عدد الوحدات</label>
                            <input 
                              type="number"
                              min="1"
                              value={floorUnits.length}
                              onChange={(e) => updateFloorConfig(floor.id, { unitsCount: parseInt(e.target.value) || 1 })}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-center min-w-0"
                            />
                          </div>

                          <div className="space-y-1 min-w-0">
                            <label className="text-[10px] font-black text-blue-900 text-center block">النشاط الافتراضي</label>
                            <select 
                              value={floor.activityType}
                              onChange={(e) => updateFloorConfig(floor.id, { activityType: e.target.value })}
                              className="w-full px-1.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none cursor-pointer min-w-0"
                            >
                              {activityTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1 min-w-0">
                            <label className="text-[10px] font-black text-blue-900 text-center block">بداية الأرقام</label>
                            <input 
                              type="number"
                              value={floor.startUnitNumber || ''}
                              placeholder="مثلاً: 101"
                              onChange={(e) => updateFloorConfig(floor.id, { startUnitNumber: parseInt(e.target.value) || 0 })}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-center min-w-0"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Explicit Unit Numbers Display & Surgical Deletion */}
                      <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500 ml-1">الوحدات في هذا الدور:</span>
                        {floorUnits.length === 0 ? (
                          <span className="text-[10px] text-amber-600 font-bold">لا توجد وحدات متبقية في هذا الدور</span>
                        ) : (
                          floorUnits.map(unitNum => (
                            <span 
                              key={unitNum} 
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-white text-slate-800 rounded-md border border-slate-200 text-[11px] font-black shadow-2xs group/chip hover:border-rose-300 transition"
                            >
                              <span dir="ltr">{unitNum}</span>
                              <button
                                type="button"
                                onClick={() => removeUnitFromFloorConfig(floor.id, unitNum)}
                                className="w-3.5 h-3.5 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-rose-500 transition cursor-pointer"
                                title={`حذف الوحدة ${unitNum} منفصلة من هذا الدور`}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          ))
                        )}

                        <div className="inline-flex items-center gap-1.5 mr-auto mt-1 sm:mt-0">
                          <input 
                            type="text"
                            placeholder="مثال: 502-2"
                            value={currentInputVal}
                            onChange={(e) => setNewUnitInputs(prev => ({ ...prev, [floor.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addUnitToFloorConfig(floor.id, currentInputVal);
                              }
                            }}
                            className="w-28 sm:w-36 px-2 py-1 bg-white border border-slate-200 focus:border-blue-500 rounded-lg text-xs font-bold outline-none text-center placeholder:text-[10px]"
                            dir="ltr"
                          />
                          <button
                            type="button"
                            onClick={() => addUnitToFloorConfig(floor.id, currentInputVal)}
                            disabled={!currentInputVal || !currentInputVal.trim()}
                            className="px-3 py-1 bg-blue-900 text-white hover:bg-blue-950 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg text-xs font-black transition flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>إضافة وحدة</span>
                          </button>
                        </div>
                      </div>

                      {/* Save and Cancel action buttons for this floor */}
                      <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFloorId(null);
                            const base = (floorConfigs && floorConfigs.length > 0) ? floorConfigs : [];
                            const initialized = base.map(f => {
                              const units = getUnitNumbersForFloor(f, residents);
                              return {
                                ...f,
                                unitNumbers: units,
                                unitsCount: units.length,
                                startUnitNumber: units.length > 0 ? units[0] : (f.startUnitNumber || 101),
                              };
                            });
                            setLocalFloorConfigs(initialized);
                          }}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-black flex items-center gap-1 transition cursor-pointer"
                          title="إلغاء التعديلات والعودة للهيكل المحفوظ"
                        >
                          <span>إلغاء</span>
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={async () => {
                            setEditingFloorId(null);
                            await handleSaveFloor(localFloorConfigs);
                          }}
                          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                          title="حفظ التعديلات الحالية لهذا الدور فورياً"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-100" />
                          <span>حفظ الدور وإغلاق التعديل</span>
                        </button>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div key={floor.id} className="bg-white p-3.5 rounded-2xl border border-slate-200/80 hover:border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition shadow-2xs">
                      <div className="space-y-1.5 flex-1 text-right">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="font-black text-slate-900 text-xs sm:text-sm">{floor.floorLabel}</span>
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                            {floor.type === 'ground' ? 'دور أرضي' : floor.type === 'typical' ? 'دور متكرر' : floor.type === 'basement' ? 'بدروم' : floor.type === 'roof' ? 'روف' : 'خدمات'}
                          </span>
                          <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md">
                            {floorUnits.length} وحدات ({floor.activityType})
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-1">
                          {floorUnits.map(unitNum => (
                            <span key={unitNum} className="px-1.5 py-0.5 bg-slate-50 text-slate-700 rounded-md border border-slate-100 text-[10px] font-bold" dir="ltr">
                              {unitNum}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleSaveFloor(localFloorConfigs)}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black flex items-center gap-1 transition cursor-pointer"
                          title="حفظ هيكل هذا الدور فورياً وتوليد شققه في قاعدة البيانات"
                        >
                          <Save className="w-3.5 h-3.5 text-emerald-600" />
                          <span>حفظ الدور</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingFloorId(floor.id)}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-850 border border-amber-200 rounded-xl text-xs font-black flex items-center gap-1 transition cursor-pointer"
                          title="تعديل الدور وأسماء ووحدات ونشاط هذا الدور"
                        >
                          <Edit className="w-3.5 h-3.5 text-amber-600" />
                          <span>تعديل</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteFloor(floor.id, floor.floorLabel)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-black flex items-center gap-1 transition cursor-pointer"
                          title="حذف هذا الدور بالكامل من قاعدة البيانات"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  );
                }
              })
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end pt-3 border-t border-slate-100">
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer shadow-2xs"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
