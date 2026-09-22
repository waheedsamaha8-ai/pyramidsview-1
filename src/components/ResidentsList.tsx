import React, { useState, useMemo, useEffect } from 'react';
import { Resident, UserRole, FloorConfig, Payment, AppConfig, JoinRequest } from '../types';
import { Search, Phone, Edit, Trash2, Home, AlertCircle, LayoutGrid, List, Settings2, Plus, X, Building2, Save, User, KeyRound, Wallet, ArrowDownRight, ArrowUpRight, CheckCircle2, UserCheck, UserX, Clock, Share2 } from 'lucide-react';
import { deriveFloorConfigsFromResidents, floorTypeLabels, getFloorName, getUnitNumbersForFloor, compareFlatNumbers, isSameFlatNumber, parseFlatNumber } from '../utils/buildingStructure';
import * as googleApi from '../services/googleApi';
import { 
  fetchAllJoinRequests, 
  updateJoinRequestStatus, 
  deleteJoinRequest 
} from '../services/authStore';
import { ConfirmModal } from './ConfirmModal';
import { ResidentInviteModal } from './ResidentInviteModal';
import { 
  calculateResidentFinancials, 
  getCarriedPreviousBalance, 
  getResidentMonthlyFee, 
  exportCarriedBalancesForYear 
} from '../utils/financialCalculations';
import { formatMobileNumber, formatPhoneForDisplay, normalizePhoneInput } from '../utils/phoneUtils';

export { 
  calculateResidentFinancials, 
  getCarriedPreviousBalance, 
  getResidentMonthlyFee, 
  exportCarriedBalancesForYear 
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
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [confirmData, setConfirmData] = useState<{ 
    type: 'add' | 'edit' | 'delete' | 'generate' | 'save_structure'; 
    residentData?: Resident; 
    deleteId?: string; 
    deleteName?: string; 
    generatedResidents?: Resident[];
    structureToSave?: FloorConfig[];
  } | null>(null);

  // Local draft of floor configs inside the structure modal
  const [localFloorConfigs, setLocalFloorConfigs] = useState<FloorConfig[]>([]);
  const [newUnitInputs, setNewUnitInputs] = useState<Record<string, string>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [subTab, setSubTab] = useState<'residents' | 'join-requests'>('residents');
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [requestToDecline, setRequestToDecline] = useState<JoinRequest | null>(null);
  const [requestToDelete, setRequestToDelete] = useState<JoinRequest | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteResidentTarget, setInviteResidentTarget] = useState<Resident | null>(null);

  const fetchRequests = async () => {
    try {
      setLoadingRequests(true);
      const data = await fetchAllJoinRequests();
      // Sort newest first
      data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setJoinRequests(data);
    } catch (err) {
      console.error('Error fetching join requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (role === 'ADMIN') {
      fetchRequests();
    }
  }, [role]);

  const handleApproveRequest = async (request: JoinRequest) => {
    try {
      setProcessingId(request.id);
      
      // 1. Call authStore to update status to APPROVED
      await updateJoinRequestStatus(request.id, 'APPROVED');

      // 2. Auto sync/create the resident in the residents list
      const existingResident = residents.find(r => r.flatNumber === request.flatNumber);
      if (existingResident) {
        // Edit existing
        const updatedResident: Resident = {
          ...existingResident,
          name: request.ownerName || existingResident.name,
          phone: formatMobileNumber(request.ownerPhone) || existingResident.phone,
          ownershipType: request.residentType === 'OWNER' ? 'تمليك' : 'إيجار',
          tenantName: request.residentType === 'TENANT' ? request.tenantName : existingResident.tenantName,
          tenantPhone: formatMobileNumber(request.tenantPhone) || existingResident.tenantPhone,
        };
        onEdit(updatedResident);
      } else {
        // Create new
        const newRes: Resident = {
          id: `res_${Date.now()}`,
          flatNumber: request.flatNumber,
          name: request.residentType === 'OWNER' ? request.ownerName : (request.tenantName || 'ساكن جديد'),
          phone: formatMobileNumber(request.residentType === 'OWNER' ? request.ownerPhone : (request.tenantPhone || '')),
          activityType: 'سكني',
          notes: `تم الانضمام عبر طلب التسجيل الإلكتروني`,
          ownershipType: request.residentType === 'OWNER' ? 'تمليك' : 'إيجار',
          tenantName: request.residentType === 'TENANT' ? request.tenantName : '',
          tenantPhone: formatMobileNumber(request.residentType === 'TENANT' ? request.tenantPhone : ''),
          monthlyFee: config?.defaultMonthlyFee || 400,
          initialBalance: 0,
        };
        onAdd(newRes);
      }

      alert('تمت الموافقة على طلب الانضمام وتفعيل الحساب وتحديث قائمة السكان بنجاح!');
      fetchRequests();
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء الموافقة على الطلب.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineRequest = async (request: JoinRequest) => {
    try {
      setProcessingId(request.id);

      // Call authStore to update status to DECLINED
      await updateJoinRequestStatus(request.id, 'DECLINED');

      alert('تم رفض طلب الانضمام بنجاح.');
      fetchRequests();
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء رفض الطلب.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteRequest = async (request: JoinRequest) => {
    try {
      setProcessingId(request.id);

      // Call authStore to delete the request entirely
      await deleteJoinRequest(request.id);

      alert('تم حذف طلب الانضمام والبيانات الخاصة بالمستخدم نهائياً من التطبيق بنجاح.');
      fetchRequests();
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حذف الطلب.');
    } finally {
      setProcessingId(null);
    }
  };

  const getDefaultFeeForActivity = (activity: string): number => {
    if (config?.activityDefaultFees && config.activityDefaultFees[activity] !== undefined) {
      return config.activityDefaultFees[activity];
    }
    switch (activity) {
      case 'سكني': return 400;
      case 'سكني مغلق': return 200;
      case 'مفروش': return 600;
      case 'إداري': return 800;
      case 'تجاري': return 500;
      default: return config?.defaultMonthlyFee || 400;
    }
  };

  // Form states
  const [flatNumber, setFlatNumber] = useState<string>('');
  const [name, setName] = useState('');
  const [activityType, setActivityType] = useState('سكني');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [ownershipType, setOwnershipType] = useState<'تمليك' | 'إيجار'>('تمليك');
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [monthlyFee, setMonthlyFee] = useState<number | ''>(400);
  const [initialBalanceType, setInitialBalanceType] = useState<'debt' | 'surplus' | 'none'>('none');
  const [initialBalanceVal, setInitialBalanceVal] = useState<number | ''>('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [tenantPassword, setTenantPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const filteredResidents = residents.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.flatNumber.toString().includes(searchTerm) ||
      (r.phone && r.phone.includes(searchTerm)) ||
      (r.tenantPhone && r.tenantPhone.includes(searchTerm)) ||
      (r.tenantName && r.tenantName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Automatically initialize building structure if not yet configured
  useEffect(() => {
    if ((!floorConfigs || floorConfigs.length === 0) && residents.length > 0 && role !== 'RESIDENT') {
      const derived = deriveFloorConfigsFromResidents(residents);
      if (derived.length > 0) {
        onSetFloorConfigs(derived);
      }
    }
  }, [floorConfigs, residents, role, onSetFloorConfigs]);

  // Group residents by floor based on building configuration or derivation
  const effectiveFloorConfigs = useMemo(() => {
    if (floorConfigs && floorConfigs.length > 0) {
      return floorConfigs;
    }
    if (residents && residents.length > 0) {
      return deriveFloorConfigsFromResidents(residents);
    }
    return [];
  }, [floorConfigs, residents]);

  const floorResidentGroups = useMemo(() => {
    const sortedFiltered = [...filteredResidents].sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
    const assignedResidentIds = new Set<string>();
    const groups: { floor: FloorConfig; residents: Resident[] }[] = [];

    effectiveFloorConfigs.forEach((floor) => {
      const unitNumbers = getUnitNumbersForFloor(floor, residents);
      const floorResidents = sortedFiltered.filter(r => unitNumbers.some(u => isSameFlatNumber(u, r.flatNumber)));
      floorResidents.forEach(r => assignedResidentIds.add(r.id));
      // When searching, show floors with matching residents. When not searching, keep all building floors visible!
      if (floorResidents.length > 0 || !searchTerm.trim()) {
        groups.push({ floor, residents: floorResidents });
      }
    });

    const unassigned = sortedFiltered.filter(r => !assignedResidentIds.has(r.id));
    if (unassigned.length > 0) {
      groups.push({
        floor: {
          id: 'unassigned_floor',
          type: 'typical',
          floorLabel: 'وحدات إضافية / أخرى',
          unitsCount: unassigned.length,
          activityType: 'عام',
        },
        residents: unassigned,
      });
    }

    return groups;
  }, [effectiveFloorConfigs, residents, filteredResidents, searchTerm]);

  const openAddModal = () => {
    const defaultAct = activityTypes[0] || 'سكني';
    setSelectedResident(null);
    setFlatNumber('');
    setName('');
    setActivityType(defaultAct);
    setPhone('');
    setNotes('');
    setOwnershipType('تمليك');
    setTenantName('');
    setTenantPhone('');
    setMonthlyFee(getDefaultFeeForActivity(defaultAct));
    setInitialBalanceType('none');
    setInitialBalanceVal('');
    setEmail('');
    setPassword('');
    setTenantEmail('');
    setTenantPassword('');
    setError(null);
    setShowModal(true);
  };

  const openEditModal = (resident: Resident) => {
    setSelectedResident(resident);
    setFlatNumber(String(resident.flatNumber));
    setName(resident.name);
    setActivityType(resident.activityType);
    setPhone(formatMobileNumber(resident.phone || ''));
    const cleanNotes = (resident.notes || '').includes('توليد تلقائي') ? '' : (resident.notes || '');
    setNotes(cleanNotes);
    setOwnershipType((resident.ownershipType as any) === 'إيجار' ? 'إيجار' : 'تمليك');
    setTenantName(resident.tenantName || '');
    setTenantPhone(formatMobileNumber(resident.tenantPhone || ''));
    const fee = resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee > 0
      ? resident.monthlyFee 
      : getDefaultFeeForActivity(resident.activityType);
    setMonthlyFee(fee);
    
    const initBal = resident.initialBalance || 0;
    if (initBal < 0) {
      setInitialBalanceType('debt');
      setInitialBalanceVal(Math.abs(initBal));
    } else if (initBal > 0) {
      setInitialBalanceType('surplus');
      setInitialBalanceVal(initBal);
    } else {
      setInitialBalanceType('none');
      setInitialBalanceVal('');
    }

    setEmail(resident.email || `flat${resident.flatNumber}@pyramids.com`);
    setPassword(resident.password || `pyr${resident.flatNumber}#2026`);
    setTenantEmail(resident.tenantEmail || `tenant${resident.flatNumber}@pyramids.com`);
    setTenantPassword(resident.tenantPassword || `pyr${resident.flatNumber}#2026`);
    
    setError(null);
    setShowModal(true);
  };

  const handleSendWhatsAppInvite = (resident: Resident, targetType: 'OWNER' | 'TENANT' = 'OWNER') => {
    const isTenant = targetType === 'TENANT';
    const recipientName = isTenant ? (resident.tenantName || resident.name) : resident.name;
    const rawPhone = isTenant ? (resident.tenantPhone || resident.phone) : resident.phone;
    const resEmail = isTenant 
      ? (resident.tenantEmail || `tenant${resident.flatNumber}@pyramids.com`)
      : (resident.email || `flat${resident.flatNumber}@pyramids.com`);
    const resPassword = isTenant
      ? (resident.tenantPassword || `pyr${resident.flatNumber}#2026`)
      : (resident.password || `pyr${resident.flatNumber}#2026`);

    const cleanPhone = rawPhone ? formatMobileNumber(rawPhone).replace(/[^\d+]/g, '') : '';
    const appUrl = 'https://waheedsamaha8-ai.github.io/pyramids2/';

    const message = `مرحباً بك أستاذ/ة ${recipientName} 👋

يسرنا دعوة سيادتكم للانضمام إلى تطبيق اتحاد ملاك العمارة لمتابعة الخدمات والتحصيلات والتواصل.

بيانات دخولك المخصصة للتطبيق:
📍 رقم الشقة: ${resident.flatNumber}
👤 الاسم: ${recipientName}
✉️ البريد الإلكتروني: ${resEmail}
🔑 كلمة المرور: ${resPassword}

رابط دخول التطبيق:
${appUrl}

نتمنى لك تجربة متميزة!`;

    // Mark status as INVITED
    const updatedRes = { ...resident };
    if (isTenant) {
      updatedRes.tenantAccountStatus = 'INVITED';
    } else {
      updatedRes.accountStatus = 'INVITED';
    }
    onEdit(updatedRes);

    if (cleanPhone) {
      const waUrl = `https://wa.me/${cleanPhone.startsWith('+') ? cleanPhone.slice(1) : cleanPhone}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
    } else {
      navigator.clipboard.writeText(message);
      setToastMsg(`تم نسخ رسالة الدعوة وبيانات الدخول للساكن بنجاح! يمكنك إرسالها عبر الواتساب.`);
    }
  };

  const handleCopyCredentials = (resident: Resident, targetType: 'OWNER' | 'TENANT' = 'OWNER') => {
    const isTenant = targetType === 'TENANT';
    const resEmail = isTenant 
      ? (resident.tenantEmail || `tenant${resident.flatNumber}@pyramids.com`)
      : (resident.email || `flat${resident.flatNumber}@pyramids.com`);
    const resPassword = isTenant
      ? (resident.tenantPassword || `pyr${resident.flatNumber}#2026`)
      : (resident.password || `pyr${resident.flatNumber}#2026`);

    const textToCopy = `البريد الإلكتروني: ${resEmail}\nكلمة المرور: ${resPassword}`;
    navigator.clipboard.writeText(textToCopy);
    setToastMsg(`تم نسخ بيانات الدخول للوحدة ${resident.flatNumber} إلى الحافظة!`);
  };

  const handleToggleRevokeMembership = (resident: Resident, newStatus: 'ACTIVE' | 'REVOKED') => {
    const updated: Resident = {
      ...resident,
      accountStatus: newStatus,
      tenantAccountStatus: resident.ownershipType === 'إيجار' ? newStatus : resident.tenantAccountStatus,
    };
    onEdit(updated);
    if (newStatus === 'REVOKED') {
      setToastMsg(`تم إلغاء عضوية الساكن بوحدة ${resident.flatNumber} وحظر دخوله بنجاح.`);
    } else {
      setToastMsg(`تم إعادة تفعيل عضوية الساكن بوحدة ${resident.flatNumber} بنجاح.`);
    }
  };

  const openStructureModal = () => {
    const base = (floorConfigs && floorConfigs.length > 0)
      ? floorConfigs
      : deriveFloorConfigsFromResidents(residents);
    
    // Ensure all floors have explicit unitNumbers initialized so user can inspect and remove specific units
    const initialized = base.map(floor => {
      const units = getUnitNumbersForFloor(floor, residents);
      return {
        ...floor,
        unitNumbers: units,
        unitsCount: units.length,
        startUnitNumber: units.length > 0 ? units[0] : (floor.startUnitNumber || 101),
      };
    });
    setLocalFloorConfigs(initialized);
    setShowConfigModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const flatStr = String(flatNumber).trim();
    if (!flatStr || !name.trim()) {
      setError('يرجى ملء جميع الحقول المطلوبة (رقم الوحدة، اسم الساكن/المالك).');
      return;
    }

    const parsed = parseFlatNumber(flatStr);
    if (!flatStr || parsed.main >= 99999) {
      setError('يرجى إدخال رقم وحدة صحيح (مثل 502 أو 502-2 للشقق المكررة).');
      return;
    }

    // Check duplicate flat number (only when adding or changing flat number)
    const isDuplicate = residents.some(
      (r) => isSameFlatNumber(r.flatNumber, flatStr) && (!selectedResident || selectedResident.id !== r.id)
    );
    if (isDuplicate) {
      setError('رقم الوحدة هذا مسجل بالفعل لساكن آخر.');
      return;
    }

    let finalInitialBalance = 0;
    if (initialBalanceType === 'debt' && initialBalanceVal !== '') {
      finalInitialBalance = -Math.abs(Number(initialBalanceVal));
    } else if (initialBalanceType === 'surplus' && initialBalanceVal !== '') {
      finalInitialBalance = Math.abs(Number(initialBalanceVal));
    }

    const residentData: Resident = {
      id: selectedResident ? selectedResident.id : `res_${Date.now()}`,
      flatNumber: flatStr,
      name: name.trim(),
      activityType,
      phone: formatMobileNumber(phone),
      notes: notes.trim(),
      ownershipType,
      tenantName: ownershipType === 'إيجار' ? tenantName.trim() : '',
      tenantPhone: ownershipType === 'إيجار' ? formatMobileNumber(tenantPhone) : '',
      monthlyFee: monthlyFee !== '' ? Number(monthlyFee) : (config?.defaultMonthlyFee || 200),
      initialBalance: finalInitialBalance,
      email: email.trim() || `flat${flatStr}@pyramids.com`,
      password: password.trim() || `pyr${flatStr}#2026`,
      accountStatus: selectedResident?.accountStatus || 'ACTIVE',
      tenantEmail: ownershipType === 'إيجار' ? (tenantEmail.trim() || `tenant${flatStr}@pyramids.com`) : '',
      tenantPassword: ownershipType === 'إيجار' ? (tenantPassword.trim() || `pyr${flatStr}#2026`) : '',
      tenantAccountStatus: selectedResident?.tenantAccountStatus || 'ACTIVE',
    };

    setConfirmData({
      type: selectedResident ? 'edit' : 'add',
      residentData
    });
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmData({
      type: 'delete',
      deleteId: id,
      deleteName: name
    });
  };

  const isReadOnly = role === 'RESIDENT';

  const addFloorConfig = () => {
    const floorCount = localFloorConfigs.length;
    const startNum = (floorCount + 1) * 100 + 1;
    const defaultUnits = [startNum, startNum + 1, startNum + 2, startNum + 3];
    const newFloor: FloorConfig = {
      id: `floor_${Date.now()}`,
      type: 'typical',
      floorLabel: getFloorName(floorCount + 1),
      unitsCount: defaultUnits.length,
      activityType: 'سكني',
      startUnitNumber: startNum,
      unitNumbers: defaultUnits,
    };
    setLocalFloorConfigs(prev => [...prev, newFloor]);
  };

  const removeFloorConfig = (id: string) => {
    setLocalFloorConfigs(prev => prev.filter(f => f.id !== id));
  };

  const updateFloorConfig = (id: string, updates: Partial<FloorConfig>) => {
    setLocalFloorConfigs(prev => prev.map(f => {
      if (f.id !== id) return f;
      const updated = { ...f, ...updates } as FloorConfig;
      // If unitsCount or startUnitNumber changed directly without explicit unitNumbers update, regenerate units
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

  // Surgically remove a single unit from a floor within the modal
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

  // Surgically add a single unit to a floor within the modal (accepts numbers, 502-2, 502/2, etc.)
  const addUnitToFloorConfig = (floorId: string, inputRaw: number | string) => {
    if (inputRaw === undefined || inputRaw === null) return;
    let str = String(inputRaw).trim();
    if (!str) return;

    // Normalize Eastern Arabic numerals:
    const standardDigits: Record<string, string> = {
      '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
      '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
    };
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

  // Generate residents from structure AND save structure simultaneously, with alert confirmation
  const handleGenerateBuilding = () => {
    if (localFloorConfigs.length === 0) {
      alert('الرجاء إضافة أدوار أولاً لتوليد الوحدات.');
      return;
    }

    const newResidents: Resident[] = [];
    const presidentProfile = config?.adminResidentProfile;
    const presFlat = presidentProfile?.flatNumber || 207;
    let presidentAssigned = false;

    // Existing residents map to preserve user-customized occupant names & phones if they exist
    const existingMap = new Map<string, Resident>();
    residents.forEach(r => existingMap.set(String(r.flatNumber).trim(), r));

    localFloorConfigs.forEach((configItem, floorIndex) => {
      const unitFee = getDefaultFeeForActivity(configItem.activityType);
      const floorUnits = Array.isArray(configItem.unitNumbers) ? configItem.unitNumbers : getUnitNumbersForFloor(configItem, residents);
      
      floorUnits.forEach((unitId, j) => {
        const isPresidentUnit = isSameFlatNumber(unitId, presFlat);
        const unitStr = String(unitId).trim();

        if (isPresidentUnit && presidentProfile) {
          presidentAssigned = true;
          newResidents.push({
            id: existingMap.get(unitStr)?.id || `res_president_${unitId}_${Date.now()}`,
            flatNumber: unitId,
            name: (presidentProfile.name || 'وحيد سماحة').replace(/\s*\(رئيس الاتحاد\)/g, '').trim(),
            activityType: presidentProfile.activityType || configItem.activityType,
            phone: presidentProfile.phone || existingMap.get(unitStr)?.phone || '',
            notes: presidentProfile.notes || 'رئيس اتحاد الملاك',
            ownershipType: presidentProfile.ownershipType || 'تمليك',
            tenantName: existingMap.get(unitStr)?.tenantName || '',
            tenantPhone: existingMap.get(unitStr)?.tenantPhone || '',
            monthlyFee: presidentProfile.monthlyFee !== undefined && Number(presidentProfile.monthlyFee) > 0 
              ? Number(presidentProfile.monthlyFee) 
              : unitFee,
            initialBalance: presidentProfile.initialBalance !== undefined ? Number(presidentProfile.initialBalance) : (existingMap.get(unitStr)?.initialBalance || 0),
          });
        } else if (existingMap.has(unitStr)) {
          const existing = existingMap.get(unitStr)!;
          newResidents.push({
            ...existing,
            flatNumber: unitId,
            monthlyFee: existing.monthlyFee || unitFee,
          });
        } else {
          const matchedResident = residents.find(r => isSameFlatNumber(r.flatNumber, unitId));
          if (matchedResident) {
            newResidents.push({
              ...matchedResident,
              flatNumber: unitId,
              monthlyFee: matchedResident.monthlyFee || unitFee,
            });
          } else {
            newResidents.push({
              id: `res_gen_${unitId}_${Date.now()}_${floorIndex}_${j}`,
              flatNumber: unitId,
              name: `شاغل ${configItem.activityType} ${unitId}`,
              activityType: configItem.activityType,
              phone: '',
              notes: '',
              ownershipType: 'تمليك',
              tenantName: '',
              tenantPhone: '',
              monthlyFee: unitFee,
              initialBalance: 0,
            });
          }
        }
      });
    });

    // If president unit was not within generated standard loops, explicitly add their unit (e.g. 207)
    if (presidentProfile && !presidentAssigned) {
      const presStr = String(presFlat).trim();
      newResidents.push({
        id: existingMap.get(presStr)?.id || `res_president_${presFlat}_${Date.now()}`,
        flatNumber: presFlat,
        name: (presidentProfile.name || 'وحيد سماحة').replace(/\s*\(رئيس الاتحاد\)/g, '').trim(),
        activityType: presidentProfile.activityType || 'سكني',
        phone: presidentProfile.phone || existingMap.get(presStr)?.phone || '',
        notes: presidentProfile.notes || 'رئيس اتحاد الملاك',
        ownershipType: presidentProfile.ownershipType || 'تمليك',
        tenantName: existingMap.get(presStr)?.tenantName || '',
        tenantPhone: existingMap.get(presStr)?.tenantPhone || '',
        monthlyFee: presidentProfile.monthlyFee !== undefined && Number(presidentProfile.monthlyFee) > 0
          ? Number(presidentProfile.monthlyFee)
          : getDefaultFeeForActivity(presidentProfile.activityType || 'سكني'),
        initialBalance: presidentProfile.initialBalance !== undefined ? Number(presidentProfile.initialBalance) : (existingMap.get(presStr)?.initialBalance || 0),
      });
      newResidents.sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
    }

    // 1. Save building structure directly
    onSetFloorConfigs(localFloorConfigs);

    // 2. Generate and update all residents
    onSetAll(newResidents);

    // 3. Close the modal
    setShowConfigModal(false);

    // 4. Alert user & toast notification confirming saving and generation
    const confirmMsg = `تم الحفظ وتوليد الوحدات بنجاح!\nتم اعتماد هيكل العمارة وتوليد كشف الوحدات بإجمالي (${newResidents.length}) وحدة سكنية.`;
    setToastMsg(`تم الحفظ وتوليد الوحدات بنجاح! تم اعتماد هيكل العمارة وتحديث كشف الوحدات بإجمالي (${newResidents.length}) وحدة.`);
    setTimeout(() => setToastMsg(null), 8000);
    alert(confirmMsg);
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
            <Clock className="w-4 h-4" />
            <span>طلبات الانضمام الجديدة</span>
            {joinRequests.filter(r => r.status === 'PENDING').length > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
                {joinRequests.filter(r => r.status === 'PENDING').length}
              </span>
            )}
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
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'table' ? 'bg-white text-blue-900 shadow-2xs' : 'text-slate-400 hover:text-slate-600'}`}
              title="عرض جدول مفصل"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'cards' ? 'bg-white text-blue-900 shadow-2xs' : 'text-slate-400 hover:text-slate-600'}`}
              title="عرض كروت"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
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
                          setSelectedResident(null);
                          setFlatNumber(String(start));
                          setName('');
                          setPhone('');
                          setNotes('');
                          setMonthlyFee(getDefaultFeeForActivity(group.floor.activityType));
                          setInitialBalanceType('none');
                          setInitialBalanceVal('');
                          setActivityType(group.floor.activityType || 'سكني');
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
                    const fin = calculateResidentFinancials(res, payments, config?.accountingStartDate, config?.defaultMonthlyFee);
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
                            <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold phone-number-display" dir="ltr">
                              <a
                                href={`tel:${formatMobileNumber(res.phone)}`}
                                className="inline-flex items-center gap-1.5 text-blue-900 hover:text-blue-700 hover:underline font-bold font-mono transition px-2 py-1 bg-blue-50/70 hover:bg-blue-100/70 rounded-lg phone-number-display"
                                title={`اتصال هاتفي بالمالك ${res.name}: ${formatMobileNumber(res.phone)}`}
                                dir="ltr"
                              >
                                <Phone className="w-3 h-3 text-blue-900 shrink-0" />
                                <span dir="ltr">{formatPhoneForDisplay(res.phone)}</span>
                              </a>
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
                                <div className="text-[10px] font-bold text-slate-600 flex items-center gap-1 phone-number-display" dir="ltr">
                                  <a
                                    href={`tel:${formatMobileNumber(res.tenantPhone)}`}
                                    className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-950 hover:underline font-bold font-mono transition px-1.5 py-0.5 bg-amber-100/60 hover:bg-amber-200/60 rounded-md phone-number-display"
                                    title={`اتصال هاتفي بالمستأجر ${res.tenantName}: ${formatMobileNumber(res.tenantPhone)}`}
                                    dir="ltr"
                                  >
                                    <Phone className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                                    <span dir="ltr">{formatPhoneForDisplay(res.tenantPhone)}</span>
                                  </a>
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
              const tableColSpan = role === 'ADMIN' ? (!isReadOnly ? 11 : 10) : (!isReadOnly ? 10 : 9);
              return (
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 text-slate-500 font-extrabold text-[10px] border-b border-slate-200">
                      <th className="px-3 py-3 sticky right-0 bg-slate-50 shadow-xs z-10 border-l border-slate-200">رقم الوحدة</th>
                      <th className="px-3 py-3">اسم المالك / الساكن</th>
                      <th className="px-3 py-3">تليفون المالك</th>
                      <th className="px-3 py-3">اسم المستأجر</th>
                      <th className="px-3 py-3">تليفون المستأجر</th>
                      <th className="px-3 py-3 text-center">الرسوم الشهرية</th>
                      <th className="px-3 py-3 text-center">الرصيد / المديونية</th>
                      <th className="px-3 py-3">نوع النشاط</th>
                      {role === 'ADMIN' && (
                        <th className="px-3 py-3 text-center">دعوات الواتساب والعضوية</th>
                      )}
                      <th className="px-3 py-3">ملاحظات</th>
                      {!isReadOnly && role !== 'ASSISTANT' && <th className="px-3 py-3 text-center">الإجراءات</th>}
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
                                    setSelectedResident(null);
                                    setFlatNumber(String(start));
                                    setName('');
                                    setPhone('');
                                    setNotes('');
                                    setMonthlyFee(getDefaultFeeForActivity(group.floor.activityType));
                                    setInitialBalanceType('none');
                                    setInitialBalanceVal('');
                                    setActivityType(group.floor.activityType || 'سكني');
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
                        const fin = calculateResidentFinancials(res, payments, config?.accountingStartDate, config?.defaultMonthlyFee, config?.activityDefaultFees);
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
                            <td className={`px-3 py-3 font-black whitespace-nowrap sticky right-0 z-5 border-l border-slate-100 shadow-xs transition ${
                              isSelected 
                                ? 'bg-yellow-50 text-amber-950 font-black' 
                                : 'bg-white text-blue-900 group-hover:bg-slate-50'
                            }`}>
                              وحدة {res.flatNumber}
                            </td>

                            {/* Resident / Owner Name */}
                            <td className="px-3 py-3 font-bold text-slate-900 whitespace-nowrap">
                              {res.name}
                            </td>

                            {/* Owner Phone (Directly after Owner Name) with calling link */}
                            <td className="px-3 py-3 whitespace-nowrap text-slate-600" dir="ltr">
                              {res.phone ? (
                                <a
                                  href={`tel:${formatMobileNumber(res.phone)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-blue-900 hover:text-blue-700 hover:underline font-bold font-mono transition px-1.5 py-0.5 rounded-md hover:bg-blue-50 phone-number-display"
                                  title={`اتصال هاتفياً بالمالك ${res.name}: ${formatMobileNumber(res.phone)}`}
                                  dir="ltr"
                                >
                                  <Phone className="w-3 h-3 text-blue-900 shrink-0" />
                                  <span dir="ltr">{formatPhoneForDisplay(res.phone)}</span>
                                </a>
                              ) : (
                                <span className="text-slate-300 font-normal">—</span>
                              )}
                            </td>

                            {/* Tenant Name */}
                            <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                              {res.ownershipType === 'إيجار' && res.tenantName ? (
                                <span className="text-amber-950 font-black">{res.tenantName}</span>
                              ) : (
                                <span className="text-slate-300 font-normal">—</span>
                              )}
                            </td>

                            {/* Tenant Phone (Directly after Tenant Name) with calling link */}
                            <td className="px-3 py-3 whitespace-nowrap text-slate-600" dir="ltr">
                              {res.ownershipType === 'إيجار' && res.tenantPhone ? (
                                <a
                                  href={`tel:${formatMobileNumber(res.tenantPhone)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-950 hover:underline font-bold font-mono transition px-1.5 py-0.5 rounded-md hover:bg-amber-50 phone-number-display"
                                  title={`اتصال هاتفياً بالمستأجر ${res.tenantName}: ${formatMobileNumber(res.tenantPhone)}`}
                                  dir="ltr"
                                >
                                  <Phone className="w-3 h-3 text-amber-800 shrink-0" />
                                  <span dir="ltr">{formatPhoneForDisplay(res.tenantPhone)}</span>
                                </a>
                              ) : (
                                <span className="text-slate-300 font-normal">—</span>
                              )}
                            </td>

                            {/* Monthly Fee */}
                            <td className="px-3 py-3 text-center whitespace-nowrap">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md font-black text-xs">
                                {fin.monthlyFee.toLocaleString()} ج.م
                              </span>
                            </td>

                            {/* Balance */}
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

                            {/* Activity Type */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] text-slate-700 font-bold">
                                {res.activityType}
                              </span>
                            </td>

                            {/* WhatsApp Invitations & Membership Status */}
                            {role === 'ADMIN' && (
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
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[9px] font-bold transition cursor-pointer"
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
                            <td className="px-3 py-3 text-slate-500 max-w-[150px] truncate" title={displayNotes}>
                              {displayNotes || <span className="text-slate-300 font-normal">—</span>}
                            </td>

                            {/* Actions */}
                            {!isReadOnly && role !== 'ASSISTANT' && (
                              <td className="px-3 py-3 whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEditModal(res); }}
                                    className="p-1.5 text-slate-500 hover:text-blue-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                    title="تعديل بيانات الساكن"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
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
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-lg bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-2xl animate-scale-up text-right max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-sm sm:text-base font-black text-slate-950">
                {selectedResident ? 'تعديل بيانات الشقة والساكن' : 'إضافة شقة وساكن جديد'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-xl transition cursor-pointer">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 text-[11px] p-3 rounded-xl mb-4 font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Row 1: Flat Number & Activity Type */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600">رقم الوحدة / الشقة *</label>
                  <input
                    type="text"
                    placeholder="مثال: 502 أو 502-2"
                    value={flatNumber}
                    onChange={(e) => setFlatNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-right font-bold transition"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600">نوع النشاط</label>
                  <select
                    value={activityType}
                    onChange={(e) => {
                      const newAct = e.target.value;
                      setActivityType(newAct);
                      if (!selectedResident || monthlyFee === '' || monthlyFee === 0 || monthlyFee === 200 || monthlyFee === 400 || monthlyFee === 500 || monthlyFee === 600 || monthlyFee === 800) {
                        setMonthlyFee(getDefaultFeeForActivity(newAct));
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-right font-bold transition cursor-pointer"
                  >
                    {activityTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Owner/Resident Name & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600">اسم المالك / الشاغل الأساسي *</label>
                  <input
                    type="text"
                    placeholder="اسم المالك أو الساكن"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-right font-bold transition"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600">رقم هاتف المالك / الساكن</label>
                  <input
                    type="tel"
                    placeholder="01xxxxxxxxx أو +966539313467"
                    value={phone}
                    onChange={(e) => setPhone(normalizePhoneInput(e.target.value))}
                    onBlur={() => setPhone(formatMobileNumber(phone))}
                    dir="ltr"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-left font-mono font-bold transition placeholder:text-right placeholder:font-sans"
                  />
                </div>
              </div>

              {/* Tenant Fields (if rented) */}
              {ownershipType === 'إيجار' && (
                <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-900 border-b border-amber-200/60 pb-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                    <span>بيانات المستأجر الحالي للوحدة</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-amber-950">اسم المستأجر</label>
                      <input
                        type="text"
                        placeholder="اسم المستأجر"
                        value={tenantName}
                        onChange={(e) => setTenantName(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-amber-200 focus:border-amber-500 rounded-xl text-xs outline-none text-right font-bold transition"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-amber-950">رقم تليفون المستأجر</label>
                      <input
                        type="tel"
                        placeholder="01xxxxxxxxx أو +966539313467"
                        value={tenantPhone}
                        onChange={(e) => setTenantPhone(normalizePhoneInput(e.target.value))}
                        onBlur={() => setTenantPhone(formatMobileNumber(tenantPhone))}
                        dir="ltr"
                        className="w-full px-3 py-2 bg-white border border-amber-200 focus:border-amber-500 rounded-xl text-xs outline-none text-left font-mono font-bold transition placeholder:text-right placeholder:font-sans"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Row 4: Financial settings (Monthly Fee & Initial Balance Type/Val) */}
              <div className="space-y-3 p-3 bg-slate-50/80 border border-slate-200/70 rounded-2xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-700">الرسوم الشهرية (ج.م)</label>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      placeholder="400"
                      value={monthlyFee}
                      onChange={(e) => setMonthlyFee(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs outline-none text-right font-black transition"
                    />
                    <span className="text-[9px] text-slate-400 font-bold block truncate">الاشتراك الشهري للوحدة</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-700">حالة الرصيد السابق</label>
                    <div className="flex bg-white p-0.5 rounded-xl border border-slate-200/80 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setInitialBalanceType('none');
                          setInitialBalanceVal('');
                        }}
                        className={`flex-1 py-1 rounded-lg text-[9px] font-black transition cursor-pointer ${initialBalanceType === 'none' ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        لا يوجد
                      </button>
                      <button
                        type="button"
                        onClick={() => setInitialBalanceType('debt')}
                        className={`flex-1 py-1 rounded-lg text-[9px] font-black transition cursor-pointer ${initialBalanceType === 'debt' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-600 hover:bg-rose-50'}`}
                      >
                        مديونية
                      </button>
                      <button
                        type="button"
                        onClick={() => setInitialBalanceType('surplus')}
                        className={`flex-1 py-1 rounded-lg text-[9px] font-black transition cursor-pointer ${initialBalanceType === 'surplus' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-600 hover:bg-emerald-50'}`}
                      >
                        رصيد دائن
                      </button>
                    </div>
                  </div>
                </div>

                {initialBalanceType !== 'none' && (
                  <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="text-[10px] font-black text-slate-700">
                      {initialBalanceType === 'debt' ? 'قيمة المديونية المستحقة السابقة (ج.م)' : 'قيمة الرصيد الدائن الفائض السابق (ج.م)'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      placeholder="مثال: 500"
                      value={initialBalanceVal}
                      onChange={(e) => setInitialBalanceVal(e.target.value === '' ? '' : Math.abs(parseFloat(e.target.value)))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs outline-none text-right font-black transition"
                    />
                    <span className="text-[9px] text-slate-400 font-bold block truncate">
                      {initialBalanceType === 'debt' ? 'سيتم احتساب هذا المبلغ كمديونية قديمة متأخرة على الوحدة' : 'سيتم احتساب هذا المبلغ كرصيد دائن فائض مسدد مقدماً'}
                    </span>
                  </div>
                )}
              </div>

              {/* Row 5: Ownership Type & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600">حالة الشقة (تمليك / إيجار) *</label>
                  <div className="flex gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setOwnershipType('تمليك')}
                      className={`flex-1 py-2 rounded-xl text-xs font-black transition border cursor-pointer ${ownershipType === 'تمليك' ? 'bg-blue-900 text-white border-blue-900 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                    >
                      تمليك (مالك)
                    </button>
                    <button
                      type="button"
                      onClick={() => setOwnershipType('إيجار')}
                      className={`flex-1 py-2 rounded-xl text-xs font-black transition border cursor-pointer ${ownershipType === 'إيجار' ? 'bg-amber-600 text-white border-amber-600 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                    >
                      مستأجرة
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600">ملاحظات</label>
                  <input
                    type="text"
                    placeholder="اكتب ملاحظات إن وجدت..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-right font-bold transition"
                  />
                </div>
              </div>

              {/* Login Credentials Section */}
              <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between border-b border-blue-200/60 pb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-blue-900">
                    <KeyRound className="w-3.5 h-3.5 text-blue-700" />
                    <span>بيانات تسجيل الدخول للساكن</span>
                  </div>
                  <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                    توليد تلقائي
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-700">البريد الإلكتروني لدخول الساكن</label>
                    <input
                      type="email"
                      placeholder={`flat${flatNumber || 'X'}@pyramids.com`}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      dir="ltr"
                      className="w-full px-3 py-2 bg-white border border-blue-200 focus:border-blue-500 rounded-xl text-xs font-mono font-bold outline-none text-left transition"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-700">كلمة المرور لدخول الساكن</label>
                    <input
                      type="text"
                      placeholder={`pyr${flatNumber || 'X'}#2026`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      dir="ltr"
                      className="w-full px-3 py-2 bg-white border border-blue-200 focus:border-blue-500 rounded-xl text-xs font-mono font-bold outline-none text-left transition"
                    />
                  </div>
                </div>

                {ownershipType === 'إيجار' && (
                  <div className="pt-2 border-t border-blue-200/60">
                    <div className="text-[10px] font-black text-amber-900 mb-1.5">بيانات دخول المستأجر الخاص بالوحدة</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-700">البريد الإلكتروني للمستأجر</label>
                        <input
                          type="email"
                          placeholder={`tenant${flatNumber || 'X'}@pyramids.com`}
                          value={tenantEmail}
                          onChange={(e) => setTenantEmail(e.target.value)}
                          dir="ltr"
                          className="w-full px-3 py-2 bg-white border border-amber-200 focus:border-amber-500 rounded-xl text-xs font-mono font-bold outline-none text-left transition"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-700">كلمة المرور للمستأجر</label>
                        <input
                          type="text"
                          placeholder={`pyr${flatNumber || 'X'}#2026`}
                          value={tenantPassword}
                          onChange={(e) => setTenantPassword(e.target.value)}
                          dir="ltr"
                          className="w-full px-3 py-2 bg-white border border-amber-200 focus:border-amber-500 rounded-xl text-xs font-mono font-bold outline-none text-left transition"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 mt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-2 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-900 text-white rounded-xl text-xs font-black hover:bg-blue-950 active:scale-[0.98] transition shadow-xs cursor-pointer"
                >
                  {selectedResident ? 'حفظ التعديلات' : 'إضافة الشقة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}

      {/* Join Requests Tab View */}
      {role === 'ADMIN' && subTab === 'join-requests' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-5 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-blue-900">طلبات الانضمام والتحقق من الهوية</h2>
              <p className="text-xs text-slate-500 font-bold mt-1">تظهر هنا طلبات شواغل الوحدات (ملاك / مستأجرين) لتفعيل حساباتهم وتحديث قائمة السكان</p>
            </div>
            <button
              onClick={fetchRequests}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-black text-slate-700 transition cursor-pointer"
              disabled={loadingRequests}
            >
              {loadingRequests ? 'جاري التحديث...' : 'تحديث القائمة'}
            </button>
          </div>

          {loadingRequests ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
              <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-bold">جاري تحميل طلبات الانضمام المعلقة...</p>
            </div>
          ) : joinRequests.length === 0 ? (
            <div className="text-center py-16 text-slate-400 flex flex-col items-center justify-center gap-2">
              <Clock className="w-12 h-12 text-slate-300 stroke-[1.5]" />
              <p className="text-sm font-bold text-slate-500">لا توجد طلبات انضمام في النظام حالياً.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-150 shadow-2xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-black border-b border-slate-100">
                    <th className="p-3.5 text-center">الوحدة</th>
                    <th className="p-3.5">نوع شغل الوحدة</th>
                    <th className="p-3.5">بيانات المالك</th>
                    <th className="p-3.5">بيانات المستأجر</th>
                    <th className="p-3.5">البريد الإلكتروني المطلوب</th>
                    <th className="p-3.5 text-center">تاريخ التقديم</th>
                    <th className="p-3.5 text-center">الحالة</th>
                    <th className="p-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold">
                  {joinRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-3.5 text-center text-blue-950 font-black">
                        <span className="bg-blue-50 text-blue-950 px-2.5 py-1 rounded-lg border border-blue-100/40">
                          شقة {req.flatNumber}
                        </span>
                      </td>
                      <td className="p-3.5">
                        {req.residentType === 'OWNER' ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/40">مالك</span>
                        ) : (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100/40">مستأجر</span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-800">
                        <div>{req.ownerName}</div>
                        {req.ownerPhone && (
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 phone-number-display" dir="ltr">
                            <Phone className="w-3 h-3 shrink-0" />
                            <span dir="ltr" className="font-mono">{formatPhoneForDisplay(req.ownerPhone)}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-800">
                        {req.residentType === 'TENANT' ? (
                          <>
                            <div>{req.tenantName}</div>
                            {req.tenantPhone && (
                              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 phone-number-display" dir="ltr">
                                <Phone className="w-3 h-3 shrink-0" />
                                <span dir="ltr" className="font-mono">{formatPhoneForDisplay(req.tenantPhone)}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-600 font-medium font-mono" dir="ltr">
                        {req.email}
                      </td>
                      <td className="p-3.5 text-center text-slate-500">
                        {new Date(req.createdAt).toLocaleDateString('ar-EG', { dateStyle: 'short' })}
                      </td>
                      <td className="p-3.5 text-center">
                        {req.status === 'PENDING' && (
                          <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-xl text-[10px] font-black inline-flex items-center gap-1.5">
                            <Clock className="w-3 h-3 shrink-0" />
                            قيد الانتظار
                          </span>
                        )}
                        {req.status === 'APPROVED' && (
                          <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-xl text-[10px] font-black inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 shrink-0 animate-pulse" />
                            مقبول ومفعّل
                          </span>
                        )}
                        {req.status === 'DECLINED' && (
                          <span className="bg-rose-100 text-rose-800 px-2.5 py-1 rounded-xl text-[10px] font-black inline-flex items-center gap-1.5">
                            <UserX className="w-3 h-3 shrink-0" />
                            مرفوض
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {req.status === 'PENDING' ? (
                            <>
                              <button
                                onClick={() => handleApproveRequest(req)}
                                disabled={processingId !== null}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition inline-flex items-center gap-1 font-black cursor-pointer shadow-xs disabled:opacity-50"
                                title="قبول وتفعيل حساب المستخدم"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>قبول</span>
                              </button>
                              <button
                                onClick={() => setRequestToDecline(req)}
                                disabled={processingId !== null}
                                className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition inline-flex items-center gap-1 font-black cursor-pointer shadow-xs disabled:opacity-50"
                                title="رفض الطلب"
                              >
                                <UserX className="w-3.5 h-3.5" />
                                <span>رفض</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded-md">تم الحسم</span>
                          )}
                          <button
                            onClick={() => setRequestToDelete(req)}
                            disabled={processingId !== null}
                            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition inline-flex items-center gap-1 font-black cursor-pointer shadow-xs disabled:opacity-50"
                            title="حذف طلب الانضمام والمستخدم نهائياً"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Building Structure Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-2xl animate-scale-up text-right flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b pb-3.5 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-50 text-blue-900 rounded-xl flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm sm:text-base font-black text-slate-950">إعداد وتصميم هيكل العمارة والأدوار</h3>
              </div>
              <button onClick={() => setShowConfigModal(false)} className="p-1.5 hover:bg-slate-100 rounded-xl transition cursor-pointer">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 mb-4">
              <div className="bg-blue-50/60 p-3.5 rounded-2xl border border-blue-100/60">
                <p className="text-[11px] text-blue-950 font-bold leading-relaxed">
                  يمكنك تعديل الأدوار وإضافة وحذف الوحدات لكل دور بكل سهولة (تقبل صيغ مثل 502-2 و 502/2). عند الضغط على زر «توليد كشف وحدات» بالأسفل، يتم حفظ الهيكل المعتمد وتوليد كشف الوحدات والسكان معاً تلقائياً.
                </p>
              </div>

              <div className="space-y-3">
                {localFloorConfigs.map((floor) => {
                  const floorUnits = getUnitNumbersForFloor(floor, residents);
                  const currentInputVal = newUnitInputs[floor.id] || '';

                  return (
                    <div key={floor.id} className="bg-slate-50/80 p-3.5 sm:p-4 rounded-2xl border border-slate-200/70 flex flex-col gap-3 relative group">
                      <button 
                        onClick={() => removeFloorConfig(floor.id)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-rose-600 transition cursor-pointer z-10"
                        title="حذف هذا الدور بالكامل"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex flex-col md:flex-row items-end md:items-center gap-3">
                        <div className="flex-1 min-w-[140px] space-y-1 w-full md:w-auto">
                          <label className="text-[10px] font-black text-slate-500">نوع/اسم الدور</label>
                          <div className="flex gap-1.5">
                            <select 
                              value={floor.type}
                              onChange={(e) => {
                                const val = e.target.value as FloorConfig['type'];
                                updateFloorConfig(floor.id, { type: val, floorLabel: floorTypeLabels[val] });
                              }}
                              className="flex-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none cursor-pointer"
                            >
                              {Object.entries(floorTypeLabels).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                              ))}
                            </select>
                            <input 
                              type="text"
                              value={floor.floorLabel}
                              onChange={(e) => updateFloorConfig(floor.id, { floorLabel: e.target.value })}
                              className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none"
                              placeholder="اسم الدور"
                            />
                          </div>
                        </div>

                        <div className="w-full md:w-auto grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 text-center block">عدد الوحدات</label>
                            <input 
                              type="number"
                              min="1"
                              value={floorUnits.length}
                              onChange={(e) => updateFloorConfig(floor.id, { unitsCount: parseInt(e.target.value) || 1 })}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-center"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 text-center block">النشاط الافتراضي</label>
                            <select 
                              value={floor.activityType}
                              onChange={(e) => updateFloorConfig(floor.id, { activityType: e.target.value })}
                              className="w-full px-1.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none cursor-pointer"
                            >
                              {activityTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 text-center block">بداية الأرقام</label>
                            <input 
                              type="number"
                              value={floor.startUnitNumber || ''}
                              placeholder="مثلاً: 101"
                              onChange={(e) => updateFloorConfig(floor.id, { startUnitNumber: parseInt(e.target.value) || 0 })}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-center"
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
                            placeholder="مثال: 502-2 أو 502/2"
                            value={currentInputVal}
                            onChange={(e) => setNewUnitInputs(prev => ({ ...prev, [floor.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addUnitToFloorConfig(floor.id, currentInputVal);
                              }
                            }}
                            className="w-36 sm:w-44 px-2 py-1 bg-white border border-slate-200 focus:border-blue-500 rounded-lg text-xs font-bold outline-none text-center placeholder:text-[10px] placeholder:font-normal placeholder:text-slate-400"
                            dir="ltr"
                          />
                          <button
                            type="button"
                            onClick={() => addUnitToFloorConfig(floor.id, currentInputVal)}
                            disabled={!currentInputVal || !currentInputVal.trim()}
                            className="px-3 py-1 bg-blue-900 text-white hover:bg-blue-950 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg text-xs font-black transition flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                            title="إضافة هذه الوحدة للدور (يقبل 502-2 و 502/2 والأرقام العادية)"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>إضافة وحدة</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button 
                  onClick={addFloorConfig}
                  className="w-full py-3 border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-2xl text-slate-500 hover:text-blue-900 hover:bg-blue-50/40 transition flex items-center justify-center gap-2 font-bold text-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة دور جديد لهيكل العمارة</span>
                </button>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-4 border-t border-slate-100">
              <button 
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="w-full sm:w-auto px-4 py-2 text-slate-500 hover:text-slate-800 font-bold text-xs hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                إلغاء
              </button>

              <button 
                type="button"
                onClick={handleGenerateBuilding}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-900 text-white hover:bg-blue-950 rounded-xl font-black text-xs transition shadow-md active:scale-[0.98] cursor-pointer"
                title="حفظ هيكل العمارة وتوليد كشف الوحدات والسكان معاً"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>توليد كشف وحدات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation / Alert Dialog */}
      {confirmData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 border border-slate-100 shadow-2xl animate-scale-up text-right">
            <div className="flex items-center justify-center gap-3 mb-3 text-amber-500">
              <AlertCircle className="w-10 h-10 stroke-[1.5]" />
            </div>
            <h3 className="text-xs font-black text-slate-900 text-center mb-2">
              {confirmData.type === 'delete' ? 'تأكيد عملية الحذف' : confirmData.type === 'generate' ? 'توليد هيكل العمارة الجديد' : 'تأكيد حفظ البيانات'}
            </h3>
            <p className="text-[11px] text-slate-600 text-center font-bold leading-relaxed mb-4">
              {confirmData.type === 'delete' 
                ? `هل أنت متأكد من حذف الوحدة / الساكن "${confirmData.deleteName}"؟ سيتم حذف هذه الوحدة بشكل منفصل فقط مع بقاء هيكل العمارة وكافة الوحدات الأخرى كما هي دون أي تغيير.`
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
                onClick={() => {
                  if (confirmData.type === 'delete' && confirmData.deleteId) {
                    onDelete(confirmData.deleteId);
                  } else if (confirmData.type === 'generate' && confirmData.generatedResidents) {
                    if (confirmData.structureToSave) {
                      onSetFloorConfigs(confirmData.structureToSave);
                    }
                    onSetAll(confirmData.generatedResidents);
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
                className={`flex-1 py-2 text-[10px] font-bold text-white rounded-lg transition cursor-pointer ${confirmData.type === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-900 hover:bg-blue-950'}`}
              >
                {confirmData.type === 'delete' ? 'نعم، حذف' : confirmData.type === 'generate' ? 'تأكيد التوليد' : 'نعم، حفظ وتأكيد'}
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
