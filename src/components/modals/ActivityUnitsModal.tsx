import React from 'react';
import { Building2, X, ChevronLeft } from 'lucide-react';
import { Resident, FloorConfig } from '../../types';
import { 
  compareFlatNumbers, 
  deriveFloorConfigsFromResidents, 
  getUnitNumbersForFloor 
} from '../../utils/buildingStructure';
import { formatPhoneForDisplay } from '../../utils/phoneUtils';

interface ActivityUnitsModalProps {
  activity: string | null;
  residents: Resident[];
  buildingLayout: FloorConfig[];
  onClose: () => void;
  onNavigateToResidents: () => void;
}

export const ActivityUnitsModal: React.FC<ActivityUnitsModalProps> = ({
  activity,
  residents,
  buildingLayout,
  onClose,
  onNavigateToResidents,
}) => {
  if (!activity) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-scale-up text-right" onClick={e => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center font-black">
              <Building2 className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black">وحدات نشاط: {activity}</h3>
              <p className="text-[11px] text-blue-200 font-semibold">
                تفاصيل كافة الوحدات المسجلة تحت هذا النشاط
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Units List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {(() => {
            const matchingResidents = residents.filter(r => (r.activityType || 'سكني').trim() === activity)
              .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));

            if (activity === 'شاغرة') {
              const effectiveFloors = Array.isArray(buildingLayout) ? buildingLayout : deriveFloorConfigsFromResidents(residents);
              const registeredSet = new Set(residents.map(r => String(r.flatNumber).trim()));
              const vacantFlats: string[] = [];
              effectiveFloors.forEach(f => {
                getUnitNumbersForFloor(f).forEach(u => {
                  if (!registeredSet.has(String(u).trim())) vacantFlats.push(String(u));
                });
              });

              if (vacantFlats.length === 0) {
                return (
                  <div className="text-center py-8 text-slate-400 font-bold text-xs">
                    لا توجد أي وحدات شاغرة بالعمارة حالياً.
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {vacantFlats.map(fNum => (
                    <div key={fNum} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center justify-center">
                      <span className="text-xs font-black text-slate-800">شقة {fNum}</span>
                      <span className="text-[10px] text-slate-500 font-bold">شاغرة / غير مسجل</span>
                    </div>
                  ))}
                </div>
              );
            }

            if (matchingResidents.length === 0) {
              return (
                <div className="text-center py-8 text-slate-400 font-bold text-xs">
                  لا توجد وحدات مسجلة تحت هذا النشاط حالياً.
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {matchingResidents.map(r => (
                  <div key={r.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1 hover:border-blue-200 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-blue-950">شقة {r.flatNumber}</span>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900">
                        {r.ownershipType || 'تمليك'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-700 truncate">{r.name}</div>
                    {r.phone && (
                      <div className="text-[10px] text-slate-500 font-medium font-mono phone-number-display" dir="ltr">
                        {formatPhoneForDisplay(r.phone)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateToResidents();
            }}
            className="px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <span>عرض كشف كافة الوحدات</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
