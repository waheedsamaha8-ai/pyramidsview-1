import React, { useState, useMemo, useEffect } from 'react';
import { Resident, UserRole, FloorConfig, Payment, AppConfig, JoinRequest } from '../types';
import { Search, Phone, Edit, Trash2, Home, AlertCircle, LayoutGrid, List, Settings2, Plus, X, Building2, Save, User, KeyRound, Wallet, ArrowDownRight, ArrowUpRight, CheckCircle2, UserCheck, UserX, Clock, Share2, RefreshCw, ShieldCheck, SlidersHorizontal, Contact } from 'lucide-react';
import { deriveFloorConfigsFromResidents, floorTypeLabels, getFloorName, getUnitNumbersForFloor, compareFlatNumbers, isSameFlatNumber, parseFlatNumber } from '../utils/buildingStructure';
import * as googleApi from '../services/googleApi';
import { 
  fetchAllJoinRequests, 
  updateJoinRequestStatus, 
  deleteJoinRequest 
} from '../services/authStore';
import { ConfirmModal } from './ConfirmModal';
import { ResidentInviteModal } from './ResidentInviteModal';
import { AddEditResidentModal } from './modals/AddEditResidentModal';
import { BuildingStructureModal } from './modals/BuildingStructureModal';
import { useResidentsData } from '../hooks/useResidentsData';
import { 
  calculateResidentFinancials, 
  getCarriedPreviousBalance, 
  getResidentMonthlyFee, 
  exportCarriedBalancesForYear,
  buildPaymentLookupIndex 
} from '../utils/financialCalculations';
import { formatMobileNumber, formatPhoneForDisplay, normalizePhoneInput, pickContactFromDevice } from '../utils/phoneUtils';
import { getActiveFirebaseConfig } from '../services/firebaseConfig';

export { 
  calculateResidentFinancials, 
  getCarriedPreviousBalance, 
  getResidentMonthlyFee, 
  exportCarriedBalancesForYear 
};

const columnLabels: Record<string, string> = {
  flatNumber: "رقم الوحدة",
  ownerName: "اسم المالك / الساكن",
  ownerPhone: "تليفون المالك",
  tenantName: "اسم المستأجر",
  tenantPhone: "تليفون المستأجر",
  monthlyFee: "الرسوم الشهرية",
  balance: "الرصيد / المديونية",
  activityType: "نوع النشاط",
  membership: "دعوات العضوية",
  notes: "ملاحظات",
  actions: "الإجراءات",
};

interface ResidentsListProps {
  residents: Resident[];
  payments?: Payment[];
  config?: AppConfig;
  activityTypes: string[];
  role: UserRole;
  onAdd: (resident: Resident) => void;
  onSetAll: (residents: Resident[]) => void;
  onEdit: (resident: Resident) => void;
  onDelete: (id: string) => void;
  floorConfigs: FloorConfig[];
  onSetFloorConfigs: (configs: FloorConfig[]) => void;
}

export const ResidentsList: React.FC<ResidentsListProps> = ({
  residents,
  payments = [],
  config,
  activityTypes,
  role,
  onAdd,
  onSetAll,
  onEdit,
  onDelete,
  floorConfigs,
  onSetFloorConfigs,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [showColSelector, setShowColSelector] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    flatNumber: true,
    ownerName: true,
    ownerPhone: true,
    tenantName: true,
    tenantPhone: true,
    monthlyFee: true,
    balance: true,
    activityType: true,
    membership: true,
    notes: true,
    actions: true,
  });

  // O(1) indexed payments lookup for instant financial calculations
  const paymentIndex = useMemo(() => buildPaymentLookupIndex(payments), [payments]);
  const [confirmData, setConfirmData] = useState<{ 
    type: 'add' | 'edit' | 'delete' | 'generate' | 'save_structure' | 'delete_floor'; 
    residentData?: Resident; 
    deleteId?: string; 
    deleteName?: string; 
    generatedResidents?: Resident[];
    structureToSave?: FloorConfig[];
    floorToDeleteId?: string;
    floorToDeleteLabel?: string;
  } | null>(null);

  const [subTab, setSubTab] = useState<'residents' | 'join-requests'>('residents');
  const [requestToDecline, setRequestToDecline] = useState<JoinRequest | null>(null);
  const [requestToDelete, setRequestToDelete] = useState<JoinRequest | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteResidentTarget, setInviteResidentTarget] = useState<Resident | null>(null);

  const {
    searchTerm,
    setSearchTerm,
    toastMsg,
    setToastMsg,
    isGenerating,
    joinRequests,
    loadingRequests,
    processingId,
    filteredResidents,
    effectiveFloorConfigs,
    floorResidentGroups,
    activatedResidents,
    handleApproveRequest,
    handleDeclineRequest,
    handleDeleteRequest,
    handleDeleteJoin,
    handleSendWhatsAppInvite,
    handleCopyCredentials,
    handleToggleRevokeMembership,
    persistFloorChange,
    getDefaultFeeForActivity,
  } = useResidentsData({
    residents,
    floorConfigs,
    config,
    role,
    onEdit,
    onSetAll,
    onSetFloorConfigs,
  });

  const isReadOnly = role === 'RESIDENT';

  const openAddModal = () => {
    setSelectedResident(null);
    setShowModal(true);
  };

  const openEditModal = (resident: Resident) => {
    setSelectedResident(resident);
    setShowModal(true);
  };

  const openStructureModal = () => {
    setShowConfigModal(true);
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmData({
      type: 'delete',
      deleteId: id,
      deleteName: name,
    });
  };

  return (
    <div className="space-y-4 text-right" dir="rtl">
      {/* Toast Feedback Banner */}
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

      {/* Tab Selector for Admin / Union President */}
      {role === 'ADMIN' && (
        <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-xs gap-2">
          <button
            onClick={() => setSubTab('residents')}
            className={`flex-1 sm:flex-none px-6 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
              subTab === 'residents'
                ? 'bg-blue-900 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            كشف الوحدات والسكان ({residents.length})
          </button>
          <button
            onClick={() => setSubTab('join-requests')}
            className={`flex-1 sm:flex-none px-6 py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              subTab === 'join-requests'
                ? 'bg-blue-900 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>الوحدات المفعلة ({activatedResidents.length})</span>
          </button>
        </div>
      )}

      {/* Resident View Information Banner */}
      {role === 'RESIDENT' && (
        <div className="bg-gradient-to-l from-blue-950 via-blue-900 to-indigo-900 text-white p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black">كشف الوحدات وسجل بيانات السكان</h2>
              <p className="text-[11px] text-blue-200/90 font-medium">دليل شواغل وحدات العمارة وأرقام الهواتف للتواصل (للقراءة والاطلاع فقط)</p>
            </div>
          </div>
          <div className="text-[11px] font-bold bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
            إجمالي الوحدات: <span className="font-black text-amber-300">{residents.length}</span> وحدة
          </div>
        </div>
      )}

      {subTab === 'residents' && (
        <>
          {/* Top controls & search */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <input
              type="text"
              placeholder="البحث بالاسم أو رقم الوحدة أو المستأجر..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-9 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-right font-semibold transition"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute top-3 right-3" />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'table' ? 'bg-white text-blue-900 shadow-2xs' : 'text-slate-400 hover:text-slate-600'}`}
                title="عرض جدول مفصل"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'cards' ? 'bg-white text-blue-900 shadow-2xs' : 'text-slate-400 hover:text-slate-600'}`}
                title="عرض كروت"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            {viewMode === 'table' && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColSelector(!showColSelector)}
                  className={`w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center transition cursor-pointer border border-slate-200/40 shrink-0 ${showColSelector ? 'bg-blue-50 text-blue-900 border-blue-200 shadow-2xs' : ''}`}
                  title="إظهار / إخفاء أعمدة الجدول"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>

                {showColSelector && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowColSelector(false)} />
                    <div className="absolute left-0 mt-2 w-52 bg-white rounded-2xl border border-slate-150 shadow-xl z-50 p-2.5 space-y-1 text-right animate-scale-up" dir="rtl">
                      <div className="px-2 py-1.5 border-b border-slate-100/80 mb-1.5">
                        <span className="text-[10px] font-black text-slate-400 block">إظهار/إخفاء الأعمدة</span>
                      </div>
                      <div className="max-h-64 overflow-y-auto pr-0.5 space-y-0.5">
                        {Object.entries(columnLabels).map(([key, label]) => {
                          if (key === 'membership' && role !== 'ADMIN') return null;
                          if (key === 'actions' && (isReadOnly || role === 'ASSISTANT')) return null;

                          const isChecked = visibleColumns[key];
                          return (
                            <label
                              key={key}
                              className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded-lg cursor-pointer transition text-[11px] font-bold text-slate-700 select-none text-right"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setVisibleColumns(prev => ({
                                    ...prev,
                                    [key]: !prev[key]
                                  }));
                                }}
                                className="w-3.5 h-3.5 text-blue-900 focus:ring-blue-500 border-slate-300 rounded cursor-pointer accent-blue-900"
                              />
                              <span className="flex-1 leading-none">{label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="text-[11px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100 hidden sm:block">
            إجمالي: <span className="text-blue-950 font-black">{filteredResidents.length}</span> وحدة
          </div>
        </div>

        {/* Action Buttons */}
        {!isReadOnly && role !== 'ASSISTANT' && (
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => {
                setInviteResidentTarget(null);
                setShowInviteModal(true);
              }}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 active:scale-[0.98] transition shadow-xs cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>دعوة ساكن للاتحاد</span>
            </button>

            <button
              onClick={openAddModal}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-900 text-white rounded-xl font-bold text-xs hover:bg-blue-950 active:scale-[0.98] transition shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة ساكن</span>
            </button>

            <button
              onClick={openStructureModal}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200 rounded-xl font-bold text-xs active:scale-[0.98] transition shadow-2xs cursor-pointer"
            >
              <Settings2 className="w-4 h-4 text-blue-900" />
              <span>إعداد هيكل العمارة</span>
            </button>
          </div>
        )}
      </div>

      {/* Residents List */}
      {viewMode === 'cards' ? (
        /* Cards View */
        filteredResidents.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Home className="w-10 h-10 stroke-[1.5] text-slate-300" />
            <p className="text-xs font-bold text-slate-500">لم يتم العثور على أي شواغل وحدات تطابق معايير البحث.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {floorResidentGroups.map((group) => (
              <div key={group.floor.id} className="space-y-3 pt-2">
                {/* Floor Divider Banner */}
                <div className="flex items-center justify-between bg-slate-200/70 dark:bg-[#16223b] px-4 py-2.5 rounded-2xl border border-slate-300/80 dark:border-slate-700 border-r-4 border-r-blue-700 dark:border-r-blue-400 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-blue-900 dark:bg-blue-600 text-white flex items-center justify-center shadow-xs">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                          {group.floor.floorLabel}
                        </span>
                        <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                          {group.residents.length} {group.residents.length === 1 ? 'وحدة' : 'وحدات'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold text-blue-900 dark:text-blue-300 bg-white dark:bg-slate-900 px-3 py-1 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-2xs">
                    {group.floor.activityType || 'سكني'}
                  </span>
                </div>

                {/* Cards for this Floor */}
                {group.residents.length === 0 ? (
                  <div className="bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl p-4 text-center flex flex-col sm:flex-row items-center justify-between gap-3">
                    <span className="text-xs text-slate-500 font-bold">لا توجد وحدات مسجلة في {group.floor.floorLabel} حالياً.</span>
                    {!isReadOnly && (
                      <button
                        onClick={() => {
                          const start = group.floor.startUnitNumber || 101;
                          setSelectedResident({
                            id: '',
                            flatNumber: String(start),
                            name: '',
                            activityType: group.floor.activityType || 'سكني',
                          } as any);
                          setShowModal(true);
                        }}
                        className="text-xs font-black text-blue-900 hover:text-blue-700 inline-flex items-center gap-1 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs cursor-pointer hover:bg-blue-50/50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة وحدة لهذا الدور</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {group.residents.map((res) => {
                    const fin = calculateResidentFinancials(res, paymentIndex, config?.accountingStartDate, config?.defaultMonthlyFee, config?.activityDefaultFees);
                    const isDebt = fin.netBalance < 0;
                    const isSurplus = fin.netBalance > 0;

                    const isSelected = selectedItemId === res.id;

                    return (
                      <div
                        key={res.id}
                        onClick={() => setSelectedItemId(isSelected ? null : res.id)}
                        className={`rounded-2xl p-3.5 sm:p-4 border shadow-xs flex flex-col justify-between relative group hover:shadow-md transition duration-200 cursor-pointer ${
                          isSelected 
                            ? 'bg-yellow-50/90 border-yellow-400 shadow-md ring-2 ring-yellow-400/20' 
                            : 'bg-white border-slate-100 hover:border-blue-200'
                        }`}
                      >
                        <div className="space-y-2.5">
                          {/* Flat Label, Activity, and Ownership Type */}
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span className="px-2.5 py-1 bg-blue-50 text-blue-800 rounded-lg text-[10px] font-black flex items-center gap-1">
                              <Home className="w-3 h-3" />
                              <span>وحدة {res.flatNumber}</span>
                            </span>
                            
                            <div className="flex items-center gap-1">
                              {res.ownershipType === 'إيجار' ? (
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200/60 rounded-md text-[9px] font-extrabold flex items-center gap-0.5">
                                  <KeyRound className="w-2.5 h-2.5" />
                                  <span>مستأجرة</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/60 rounded-md text-[9px] font-extrabold">
                                  تمليك
                                </span>
                              )}

                              <span className="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-100 rounded-md text-[9px] font-extrabold">
                                {res.activityType}
                              </span>
                            </div>
                          </div>

                          {/* Owner / Resident Name */}
                          <div>
                            <div className="text-[10px] text-slate-400 font-bold">المالك / الشاغل الأساسي:</div>
                            <h4 className="text-xs sm:text-sm font-black text-slate-900 leading-tight">{res.name}</h4>
                          </div>

                          {res.phone && (
                            <div className="flex flex-col items-start gap-1 font-mono text-[10px]" dir="ltr">
                              {res.phone.split(/[,/;|\n]+/).map((part, pIdx) => {
                                const cleanPhone = formatMobileNumber(part);
                                if (!cleanPhone) return null;
                                return (
                                  <a
                                    key={pIdx}
                                    href={`tel:${cleanPhone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1.5 text-blue-900 hover:text-blue-700 hover:underline font-bold font-mono transition px-2 py-1 bg-blue-50/70 hover:bg-blue-100/70 rounded-lg phone-number-display"
                                    title={`اتصال هاتفي بالمالك ${res.name}: ${cleanPhone}`}
                                    dir="ltr"
                                  >
                                    <Phone className="w-3 h-3 text-blue-900 shrink-0" />
                                    <span>{formatPhoneForDisplay(part)}</span>
                                  </a>
                                );
                              })}
                            </div>
                          )}

                          {/* Tenant Info if Rented */}
                          {res.ownershipType === 'إيجار' && res.tenantName && (
                            <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-200/60 space-y-1.5">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-amber-900 font-black flex items-center gap-1">
                                  <User className="w-3 h-3 text-amber-700" />
                                  <span>المستأجر: {res.tenantName}</span>
                                </span>
                              </div>
                              {res.tenantPhone && (
                                <div className="flex flex-col items-start gap-1 font-mono text-[10px]" dir="ltr">
                                  {res.tenantPhone.split(/[,/;|\n]+/).map((part, pIdx) => {
                                    const cleanPhone = formatMobileNumber(part);
                                    if (!cleanPhone) return null;
                                    return (
                                      <a
                                        key={pIdx}
                                        href={`tel:${cleanPhone}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-950 hover:underline font-bold font-mono transition px-1.5 py-0.5 bg-amber-100/60 hover:bg-amber-200/60 rounded-md phone-number-display"
                                        title={`اتصال هاتفي بالمستأجر ${res.tenantName}: ${cleanPhone}`}
                                        dir="ltr"
                                      >
                                        <Phone className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                                        <span>{formatPhoneForDisplay(part)}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Financial Status Section */}
                          <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100 space-y-1.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-500 font-bold">الرسوم الشهرية:</span>
                              <span className="font-black text-slate-800">{fin.monthlyFee.toLocaleString()} ج.م</span>
                            </div>

                            <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200/60">
                              <span className="text-slate-600 font-black">الرصيد المحاسبي:</span>
                              {isDebt ? (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-md font-black text-[11px]" dir="ltr">
                                  <ArrowDownRight className="w-3 h-3" />
                                  <span>-{Math.abs(fin.netBalance).toLocaleString()} ج.م</span>
                                </span>
                              ) : isSurplus ? (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-black text-[11px]" dir="ltr">
                                  <ArrowUpRight className="w-3 h-3" />
                                  <span>+{fin.netBalance.toLocaleString()} ج.م</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-black text-[11px]">
                                  0 ج.م (مسدد)
                                </span>
                              )}
                            </div>
                          </div>

                          {res.notes && !res.notes.includes('توليد تلقائي') && (
                            <p className="text-[10px] text-slate-400 font-semibold line-clamp-2 bg-slate-50/60 p-2 rounded-lg border border-slate-100/60">
                              {res.notes}
                            </p>
                          )}
                        </div>

                        {/* Admin Action Buttons */}
                        {!isReadOnly && role !== 'ASSISTANT' && (
                          <div className="flex items-center gap-1.5 border-t border-slate-100/80 pt-2.5 mt-3">
                            <button
                              onClick={() => openEditModal(res)}
                              className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 border border-slate-200 text-slate-700 rounded-lg text-[10px] font-bold hover:bg-slate-50 transition cursor-pointer"
                            >
                              <Edit className="w-3 h-3 text-blue-900" />
                              <span>تعديل</span>
                            </button>
                            <button
                              onClick={() => handleDelete(res.id, res.name)}
                              className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 border border-rose-100 bg-rose-50/40 text-rose-600 rounded-lg text-[10px] font-bold hover:bg-rose-50 transition cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>حذف</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        /* Table View */
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            {(() => {
              const tableColSpan = Object.keys(visibleColumns).filter(key => {
                if (!visibleColumns[key]) return false;
                if (key === 'membership' && role !== 'ADMIN') return false;
                if (key === 'actions' && (isReadOnly || role === 'ASSISTANT')) return false;
                return true;
              }).length;
              return (
                <table className="w-full text-right border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50/90 text-slate-500 font-extrabold text-[10px] border-b border-slate-200">
                      {visibleColumns.flatNumber && (
                        <th className="px-3 py-3 sticky right-0 bg-slate-50 shadow-xs z-10 border-l border-slate-200">رقم الوحدة</th>
                      )}
                      {visibleColumns.ownerName && (
                        <th className="px-3 py-3">اسم المالك / الساكن</th>
                      )}
                      {visibleColumns.ownerPhone && (
                        <th className="px-3 py-3">تليفون المالك</th>
                      )}
                      {visibleColumns.tenantName && (
                        <th className="px-3 py-3">اسم المستأجر</th>
                      )}
                      {visibleColumns.tenantPhone && (
                        <th className="px-3 py-3">تليفون المستأجر</th>
                      )}
                      {visibleColumns.monthlyFee && (
                        <th className="px-3 py-3 text-center">الرسوم الشهرية</th>
                      )}
                      {visibleColumns.balance && (
                        <th className="px-3 py-3 text-center">الرصيد / المديونية</th>
                      )}
                      {visibleColumns.activityType && (
                        <th className="px-3 py-3">نوع النشاط</th>
                      )}
                      {role === 'ADMIN' && visibleColumns.membership && (
                        <th className="px-3 py-3 text-center">دعوات الواتساب والعضوية</th>
                      )}
                      {visibleColumns.notes && (
                        <th className="px-3 py-3">ملاحظات</th>
                      )}
                      {!isReadOnly && role !== 'ASSISTANT' && visibleColumns.actions && (
                        <th className="px-3 py-3 text-center">الإجراءات</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                    {filteredResidents.length === 0 ? (
                      <tr>
                        <td colSpan={tableColSpan} className="px-4 py-8 text-center text-slate-400 font-bold">
                          لا توجد نتائج تطابق معايير البحث.
                        </td>
                      </tr>
                    ) : (
                      floorResidentGroups.map((group) => (
                        <React.Fragment key={group.floor.id}>
                          {/* Floor Separator Row */}
                          <tr className="bg-slate-200/90 dark:bg-[#16223b] border-y-2 border-slate-300 dark:border-slate-700">
                            <td colSpan={tableColSpan} className="py-3 px-4 text-right border-r-4 border-r-blue-700 dark:border-r-blue-400 sticky right-0 z-5 bg-slate-200/95 dark:bg-[#16223b]/95">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-lg bg-blue-900 dark:bg-blue-600 text-white flex items-center justify-center shadow-2xs">
                                <Building2 className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                                {group.floor.floorLabel}
                              </span>
                              <span className="text-[10px] sm:text-xs font-bold text-slate-600 dark:text-slate-300 bg-white/90 dark:bg-slate-900/90 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs">
                                {group.residents.length} {group.residents.length === 1 ? 'وحدة' : 'وحدات'}
                              </span>
                            </div>
                            <span className="text-[10px] font-extrabold text-blue-900 dark:text-blue-300 bg-white/90 dark:bg-slate-900/90 px-3 py-1 rounded-lg border border-slate-200/80 dark:border-slate-700 shadow-2xs">
                              {group.floor.activityType || 'سكني'}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Floor Residents */}
                      {group.residents.length === 0 ? (
                        <tr>
                          <td colSpan={tableColSpan} className="py-3 px-4 text-center text-slate-400 bg-slate-50/50">
                            <div className="flex items-center justify-center gap-3">
                              <span className="text-xs font-bold text-slate-500">لا توجد وحدات مسجلة في هذا الدور حالياً.</span>
                              {!isReadOnly && role !== 'ASSISTANT' && (
                                <button
                                  onClick={() => {
                                    const start = group.floor.startUnitNumber || 101;
                                    setSelectedResident({
                                      id: '',
                                      flatNumber: String(start),
                                      name: '',
                                      activityType: group.floor.activityType || 'سكني',
                                    } as any);
                                    setShowModal(true);
                                  }}
                                  className="text-xs font-black text-blue-900 hover:text-blue-700 inline-flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs cursor-pointer hover:bg-blue-50/50"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>إضافة وحدة لهذا الدور</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        group.residents.map((res) => {
                        const fin = calculateResidentFinancials(res, paymentIndex, config?.accountingStartDate, config?.defaultMonthlyFee, config?.activityDefaultFees);
                        const isDebt = fin.netBalance < 0;
                        const isSurplus = fin.netBalance > 0;
                        const displayNotes = (res.notes || '').includes('توليد تلقائي') ? '' : (res.notes || '');

                        const isSelected = selectedItemId === res.id;
                        const status = res.accountStatus || 'ACTIVE';

                        return (
                          <tr 
                            key={res.id} 
                            onClick={() => setSelectedItemId(isSelected ? null : res.id)}
                            className={`group transition cursor-pointer ${
                              isSelected 
                                ? 'bg-yellow-50/90 border-y border-yellow-400' 
                                : 'hover:bg-slate-50/70'
                            }`}
                          >
                            {/* Unit Number */}
                            {visibleColumns.flatNumber && (
                              <td className={`px-3 py-3 font-black whitespace-nowrap sticky right-0 z-5 border-l border-slate-100 shadow-xs transition ${
                                isSelected 
                                  ? 'bg-yellow-50 text-amber-950 font-black' 
                                  : 'bg-white text-blue-900 group-hover:bg-slate-50'
                              }`}>
                                وحدة {res.flatNumber}
                              </td>
                            )}

                            {/* Resident / Owner Name */}
                            {visibleColumns.ownerName && (
                              <td className="px-3 py-3 font-bold text-slate-900 whitespace-nowrap">
                                {res.name}
                              </td>
                            )}

                            {/* Owner Phone (Directly after Owner Name) with calling link */}
                            {visibleColumns.ownerPhone && (
                              <td className="px-3 py-3 text-slate-600" dir="ltr">
                                {res.phone ? (
                                  <div className="flex flex-col items-start gap-1">
                                    {res.phone.split(/[,/;|\n]+/).map((part, pIdx) => {
                                      const cleanPhone = formatMobileNumber(part);
                                      if (!cleanPhone) return null;
                                      return (
                                        <a
                                          key={pIdx}
                                          href={`tel:${cleanPhone}`}
                                          onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center gap-1 text-blue-900 hover:text-blue-700 hover:underline font-bold font-mono transition px-1.5 py-0.5 rounded-md hover:bg-blue-50 phone-number-display"
                                          title={`اتصال هاتفياً بالمالك ${res.name}: ${cleanPhone}`}
                                          dir="ltr"
                                        >
                                          <Phone className="w-3 h-3 text-blue-900 shrink-0" />
                                          <span dir="ltr">{formatPhoneForDisplay(part)}</span>
                                        </a>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-normal">—</span>
                                )}
                              </td>
                            )}

                            {/* Tenant Name */}
                            {visibleColumns.tenantName && (
                              <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                                {res.ownershipType === 'إيجار' && res.tenantName ? (
                                  <span className="text-amber-950 font-black">{res.tenantName}</span>
                                ) : (
                                  <span className="text-slate-300 font-normal">—</span>
                                )}
                              </td>
                            )}

                            {/* Tenant Phone (Directly after Tenant Name) with calling link */}
                            {visibleColumns.tenantPhone && (
                              <td className="px-3 py-3 text-slate-600" dir="ltr">
                                {res.ownershipType === 'إيجار' && res.tenantPhone ? (
                                  <div className="flex flex-col items-start gap-1">
                                    {res.tenantPhone.split(/[,/;|\n]+/).map((part, pIdx) => {
                                      const cleanPhone = formatMobileNumber(part);
                                      if (!cleanPhone) return null;
                                      return (
                                        <a
                                          key={pIdx}
                                          href={`tel:${cleanPhone}`}
                                          onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-950 hover:underline font-bold font-mono transition px-1.5 py-0.5 rounded-md hover:bg-amber-50 phone-number-display"
                                          title={`اتصال هاتفياً بالمستأجر ${res.tenantName}: ${cleanPhone}`}
                                          dir="ltr"
                                        >
                                          <Phone className="w-3 h-3 text-amber-800 shrink-0" />
                                          <span dir="ltr">{formatPhoneForDisplay(part)}</span>
                                        </a>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-normal">—</span>
                                )}
                              </td>
                            )}

                            {/* Monthly Fee */}
                            {visibleColumns.monthlyFee && (
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md font-black text-xs">
                                  {fin.monthlyFee.toLocaleString()} ج.م
                                </span>
                              </td>
                            )}

                            {/* Balance */}
                            {visibleColumns.balance && (
                              <td className="px-3 py-3 text-center whitespace-nowrap" title={`محسوب لعدد ${fin.monthsElapsed} شهر: مستحق ${fin.expectedDues.toLocaleString()} ج.م | مسدد ${fin.totalPaid.toLocaleString()} ج.م`}>
                                {isDebt ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg font-black text-xs" dir="ltr">
                                    <ArrowDownRight className="w-3.5 h-3.5" />
                                    <span>-{Math.abs(fin.netBalance).toLocaleString()} ج.م</span>
                                  </span>
                                ) : isSurplus ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-black text-xs" dir="ltr">
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                    <span>+{fin.netBalance.toLocaleString()} ج.م</span>
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg font-black text-xs">
                                    0 ج.م
                                  </span>
                                )}
                              </td>
                            )}

                            {/* Activity Type */}
                            {visibleColumns.activityType && (
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] text-slate-700 font-bold">
                                  {res.activityType}
                                </span>
                              </td>
                            )}

                            {/* WhatsApp Invitations & Membership Status */}
                            {role === 'ADMIN' && visibleColumns.membership && (
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <div className="flex flex-col items-center gap-1">
                                  {/* Account Status Badge */}
                                  {status === 'REVOKED' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                      <UserX className="w-3 h-3" />
                                      <span>عضوية ملغاة</span>
                                    </span>
                                  ) : status === 'INVITED' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                                      <Clock className="w-3 h-3" />
                                      <span>دعوة مرسلة</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>حساب مفعل</span>
                                    </span>
                                  )}

                                  {/* Action Buttons */}
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSendWhatsAppInvite(res, 'OWNER');
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black transition shadow-xs cursor-pointer active:scale-95"
                                      title="إرسال دعوة انضمام عبر الواتساب للمالك مع بيانات الدخول"
                                    >
                                      <Phone className="w-3 h-3 fill-current" />
                                      <span>دعوة واتساب</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCopyCredentials(res, 'OWNER');
                                      }}
                                      className="p-1 text-slate-600 hover:text-blue-900 bg-slate-100 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                                      title="نسخ الإيميل والباسورد المخصص للساكن"
                                    >
                                      <KeyRound className="w-3.5 h-3.5" />
                                    </button>

                                    {!isReadOnly && (
                                      status === 'REVOKED' ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleRevokeMembership(res, 'ACTIVE');
                                          }}
                                          className="p-1 text-emerald-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                                          title="إعادة تفعيل عضوية الساكن"
                                        >
                                          <UserCheck className="w-3.5 h-3.5" />
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleRevokeMembership(res, 'REVOKED');
                                          }}
                                          className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                          title="إلغاء عضوية وحظر دخول الساكن"
                                        >
                                          <UserX className="w-3.5 h-3.5" />
                                        </button>
                                      )
                                    )}
                                  </div>

                                  {/* Tenant WhatsApp Invite if available */}
                                  {res.ownershipType === 'إيجار' && res.tenantName && (
                                    <div className="flex items-center gap-1 mt-1 border-t border-slate-100 pt-1">
                                      <span className="text-[9px] text-amber-900 font-bold">المستأجر:</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSendWhatsAppInvite(res, 'TENANT');
                                        }}
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[9px] font-bold transition shrink-0 cursor-pointer"
                                        title="دعوة المستأجر عبر الواتساب"
                                      >
                                        <Phone className="w-2.5 h-2.5 fill-current" />
                                        <span>دعوة المستأجر</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            )}

                            {/* Notes */}
                            {visibleColumns.notes && (
                              <td className="px-3 py-3 text-slate-500 max-w-[150px] truncate" title={displayNotes}>
                                {displayNotes || <span className="text-slate-300 font-normal">—</span>}
                              </td>
                            )}

                            {/* Actions */}
                            {!isReadOnly && role !== 'ASSISTANT' && visibleColumns.actions && (
                              <td className="px-3 py-3 whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); openEditModal(res); }}
                                    className="p-1.5 text-slate-500 hover:text-blue-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                    title="تعديل بيانات الساكن"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(res.id, res.name); }}
                                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                    title="حذف الساكن"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      }))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
              );
            })()}
          </div>
        </div>
      )}

            {/* Add/Edit Resident Modal */}
      <AddEditResidentModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setSelectedResident(null);
        }}
        resident={selectedResident}
        residents={residents}
        activityTypes={activityTypes}
        defaultMonthlyFee={config?.defaultMonthlyFee || 400}
        activityDefaultFees={config?.activityDefaultFees}
        onSubmit={(residentData, isEdit) => {
          setConfirmData({
            type: isEdit ? 'edit' : 'add',
            residentData,
          });
        }}
      />
        </>
      )}

      {/* Activated Units (الوحدات المفعلة) Tab View */}
      {role === 'ADMIN' && subTab === 'join-requests' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-5 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-blue-900">الوحدات المفعلة والنشطة في الاتحاد</h2>
              <p className="text-xs text-slate-500 font-bold mt-1">تظهر هنا جميع الوحدات التي تم تفعيل انضمامها للتطبيق ودعوتها عبر نظام كشف الوحدات أو الواتساب.</p>
            </div>
            <div className="text-xs font-black bg-blue-50 text-blue-900 px-3.5 py-1.5 rounded-xl border border-blue-100">
              إجمالي المفعلين: {activatedResidents.length} وحدة
            </div>
          </div>

          {activatedResidents.length === 0 ? (
            <div className="text-center py-16 text-slate-400 flex flex-col items-center justify-center gap-2">
              <UserCheck className="w-12 h-12 text-slate-300 stroke-[1.5]" />
              <p className="text-sm font-bold text-slate-500">لا توجد وحدات مفعلة أو نشطة حالياً في النظام.</p>
              <p className="text-[11px] text-slate-400">قم بدعوة ساكن من كشف الوحدات أو عبر زر الدعوة بالأعلى للبدء.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-150 shadow-2xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-black border-b border-slate-100">
                    <th className="p-3.5 text-center">رقم الوحدة</th>
                    <th className="p-3.5">اسم المالك</th>
                    <th className="p-3.5">اسم المستأجر</th>
                    <th className="p-3.5 text-center">نوع السكن</th>
                    <th className="p-3.5 text-center">حالة الدخول</th>
                    <th className="p-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold">
                  {activatedResidents.map((res) => {
                    const isRevoked = res.accountStatus === 'REVOKED' || (res.ownershipType === 'إيجار' && res.tenantAccountStatus === 'REVOKED');
                    return (
                      <tr key={res.id} className="hover:bg-slate-50/50 transition">
                        <td className="p-3.5 text-center text-blue-950 font-black">
                          <span className="bg-blue-50 text-blue-950 px-3 py-1 rounded-lg border border-blue-100/40 font-mono text-xs">
                            شقة {res.flatNumber}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-800">
                          <div>{res.name}</div>
                          {res.phone && (
                            <div className="flex flex-col gap-1 mt-1 font-mono text-[10px]" dir="ltr">
                              {res.phone.split(/[,/;|\n]+/).map((part, pIdx) => {
                                const cleanP = formatMobileNumber(part);
                                if (!cleanP) return null;
                                return (
                                  <a
                                    key={pIdx}
                                    href={`tel:${cleanP}`}
                                    className="flex items-center gap-1 text-slate-500 hover:text-blue-900 transition"
                                    title={`اتصال: ${cleanP}`}
                                  >
                                    <Phone className="w-3 h-3 shrink-0 text-slate-400" />
                                    <span>{formatPhoneForDisplay(part)}</span>
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-800">
                          {res.ownershipType === 'إيجار' && res.tenantName ? (
                            <>
                              <div>{res.tenantName}</div>
                              {res.tenantPhone && (
                                <div className="flex flex-col gap-1 mt-1 font-mono text-[10px]" dir="ltr">
                                  {res.tenantPhone.split(/[,/;|\n]+/).map((part, pIdx) => {
                                    const cleanP = formatMobileNumber(part);
                                    if (!cleanP) return null;
                                    return (
                                      <a
                                        key={pIdx}
                                        href={`tel:${cleanP}`}
                                        className="flex items-center gap-1 text-slate-500 hover:text-amber-800 transition"
                                        title={`اتصال: ${cleanP}`}
                                      >
                                        <Phone className="w-3 h-3 shrink-0 text-slate-400" />
                                        <span>{formatPhoneForDisplay(part)}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-black rounded-md border">
                            {res.ownershipType || 'تمليك'}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          {isRevoked ? (
                            <span className="bg-red-50 text-red-700 px-2 py-1 rounded-lg text-[10px] font-black border border-red-150 inline-flex items-center gap-1">
                              <UserX className="w-3.5 h-3.5" />
                              موقوف مؤقتاً
                            </span>
                          ) : (
                            <div className="flex flex-col items-center gap-1.5">
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-black border border-emerald-150 inline-flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                                نشط ومفعّل
                              </span>
                              {(res.ownershipType === 'إيجار' ? res.tenantLastLoginAt : res.lastLoginAt) ? (
                                <span className="text-[10px] text-slate-500 font-bold bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100" dir="ltr">
                                  {new Date(res.ownershipType === 'إيجار' ? res.tenantLastLoginAt! : res.lastLoginAt!).toLocaleDateString('ar-EG', {
                                    dateStyle: 'short',
                                    timeStyle: 'short'
                                  })}
                                </span>
                              ) : (
                                <span className="text-[9px] text-slate-400 font-bold">دخول مباشر</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {/* إيقاف / تفعيل الانضمام */}
                            {isRevoked ? (
                              <button
                                onClick={() => handleToggleRevokeMembership(res, 'ACTIVE')}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-black cursor-pointer transition flex items-center gap-1 shadow-2xs"
                                title="تفعيل الانضمام والسماح بالدخول"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span className="whitespace-nowrap">تفعيل الدخول</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleRevokeMembership(res, 'REVOKED')}
                                className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-black cursor-pointer transition flex items-center gap-1 shadow-2xs"
                                title="إيقاف الانضمام وحظر الدخول مؤقتاً"
                              >
                                <UserX className="w-3.5 h-3.5 shrink-0" />
                                <span className="whitespace-nowrap">إيقاف الانضمام</span>
                              </button>
                            )}

                            {/* حذف الانضمام */}
                            <button
                              onClick={() => handleDeleteJoin(res)}
                              className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-black cursor-pointer transition flex items-center gap-1 shadow-2xs"
                              title="حذف تفويض الدخول ومسح كلمة المرور"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span className="whitespace-nowrap">حذف الدخول</span>
                            </button>

                            {/* إعادة إرسال دعوة بكلمة مرور عشوائية جديدة */}
                            <button
                              onClick={() => handleSendWhatsAppInvite(res, res.ownershipType === 'إيجار' ? 'TENANT' : 'OWNER')}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-black cursor-pointer transition flex items-center gap-1 shadow-2xs"
                              title="إرسال دعوة جديدة برمز مرور عشوائي"
                            >
                              <Share2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span className="whitespace-nowrap">إرسال دعوة (جديد)</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

            {/* Building Structure Modal */}
      <BuildingStructureModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        floorConfigs={floorConfigs}
        residents={residents}
        activityTypes={activityTypes}
        onPersistFloorChange={persistFloorChange}
        onDeleteFloor={(floorId, floorLabel) => {
          setConfirmData({
            type: 'delete_floor',
            floorToDeleteId: floorId,
            floorToDeleteLabel: floorLabel,
          });
        }}
      />

      {/* Custom Confirmation / Alert Dialog */}
      {confirmData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 border border-slate-100 shadow-2xl animate-scale-up text-right">
            <div className="flex items-center justify-center gap-3 mb-3 text-amber-500">
              <AlertCircle className="w-10 h-10 stroke-[1.5]" />
            </div>
            <h3 className="text-xs font-black text-slate-900 text-center mb-2">
              {confirmData.type === 'delete' ? 'تأكيد عملية الحذف' : confirmData.type === 'delete_floor' ? 'تأكيد حذف الدور بالكامل' : confirmData.type === 'generate' ? 'توليد هيكل العمارة الجديد' : 'تأكيد حفظ البيانات'}
            </h3>
            <p className="text-[11px] text-slate-600 text-center font-bold leading-relaxed mb-4">
              {confirmData.type === 'delete' 
                ? `هل أنت متأكد من حذف الوحدة / الساكن "${confirmData.deleteName}"؟ سيتم حذف هذه الوحدة بشكل منفصل فقط مع بقاء هيكل العمارة وكافة الوحدات الأخرى كما هي دون أي تغيير.`
                : confirmData.type === 'delete_floor'
                ? `هل أنت متأكد من حذف دور "${confirmData.floorToDeleteLabel}" بالكامل من هيكل العمارة وكافة الشقق والساكنين التابعين له بشكل نهائي؟ لا يمكن التراجع عن هذا الإجراء.`
                : confirmData.type === 'generate'
                ? `أنت على وشك إنشاء ${confirmData.generatedResidents?.length} وحدة سكنية جديدة بناءً على الهيكل المحدد. سيتم استبدال الكشف الحالي بهذا الكشف الجديد وحفظ الهيكل. هل تود الاستمرار؟`
                : confirmData.type === 'edit'
                ? `هل تريد فعلاً حفظ التعديلات المدخلة للساكن "${confirmData.residentData?.name}"؟`
                : `أنت على وشك إضافة ساكن جديد باسم "${confirmData.residentData?.name}" للوحدة رقم ${confirmData.residentData?.flatNumber}. هل تود تأكيد تنفيذ هذا الطلب؟`}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setConfirmData(null)}
                className="flex-1 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 border border-slate-100 rounded-lg transition cursor-pointer"
              >
                تراجع وإلغاء
              </button>
              <button
                onClick={async () => {
                  if (confirmData.type === 'delete_floor' && confirmData.floorToDeleteId) {
                    const updated = floorConfigs.filter(f => f.id !== confirmData.floorToDeleteId);
                    await persistFloorChange(updated);
                  } else if (confirmData.type === 'delete' && confirmData.deleteId) {
                    onDelete(confirmData.deleteId);
                  } else if (confirmData.type === 'generate' && confirmData.generatedResidents) {
                    if (confirmData.structureToSave) {
                      await onSetFloorConfigs(confirmData.structureToSave);
                    }
                    await onSetAll(confirmData.generatedResidents);
                    setShowConfigModal(false);
                  } else if (confirmData.residentData) {
                    if (confirmData.type === 'edit') {
                      onEdit(confirmData.residentData);
                    } else {
                      onAdd(confirmData.residentData);
                    }
                    setShowModal(false);
                  }
                  setConfirmData(null);
                }}
                className={`flex-1 py-2 text-[10px] font-bold text-white rounded-lg transition cursor-pointer ${(confirmData.type === 'delete' || confirmData.type === 'delete_floor') ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-900 hover:bg-blue-950'}`}
              >
                {(confirmData.type === 'delete' || confirmData.type === 'delete_floor') ? 'نعم، حذف' : confirmData.type === 'generate' ? 'تأكيد التوليد' : 'نعم، حفظ وتأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Decline Join Request */}
      <ConfirmModal
        isOpen={requestToDecline !== null}
        title="تأكيد رفض طلب الانضمام"
        message={`هل أنت متأكد من رغبتك في رفض طلب الانضمام للوحدة السكنية رقم (شقة ${requestToDecline?.flatNumber}) باسم "${requestToDecline?.residentType === 'OWNER' ? requestToDecline?.ownerName : requestToDecline?.tenantName}"؟ لن يتم تفعيل الحساب.`}
        confirmLabel="نعم، رفض الطلب"
        cancelLabel="تراجع"
        isDestructive={true}
        onConfirm={async () => {
          if (requestToDecline) {
            const req = requestToDecline;
            setRequestToDecline(null);
            await handleDeclineRequest(req);
          }
        }}
        onCancel={() => setRequestToDecline(null)}
      />

      {/* Confirm Delete Join Request / User */}
      <ConfirmModal
        isOpen={requestToDelete !== null}
        title="تأكيد حذف طلب الانضمام والمستخدم"
        message={`هل أنت متأكد من رغبتك في حذف طلب الانضمام والمستخدم الخاص بـ (شقة ${requestToDelete?.flatNumber}) باسم "${requestToDelete?.residentType === 'OWNER' ? requestToDelete?.ownerName : requestToDelete?.tenantName}" نهائياً من النظام؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="نعم، حذف نهائياً"
        cancelLabel="تراجع"
        isDestructive={true}
        onConfirm={async () => {
          if (requestToDelete) {
            const req = requestToDelete;
            setRequestToDelete(null);
            await handleDeleteRequest(req);
          }
        }}
        onCancel={() => setRequestToDelete(null)}
      />

      {/* Resident Invitation Modal */}
      <ResidentInviteModal
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setInviteResidentTarget(null);
        }}
        residents={residents}
        initialResident={inviteResidentTarget}
      />
    </div>
  );
};
