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
import { 
  calculateResidentFinancials, 
  getCarriedPreviousBalance, 
  getResidentMonthlyFee, 
  exportCarriedBalancesForYear 
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
  const [searchTerm, setSearchTerm] = useState('');
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

  // Local draft of floor configs inside the structure modal
  const [localFloorConfigs, setLocalFloorConfigs] = useState<FloorConfig[]>([]);
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [newUnitInputs, setNewUnitInputs] = useState<Record<string, string>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [subTab, setSubTab] = useState<'residents' | 'join-requests'>('residents');
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [requestToDecline, setRequestToDecline] = useState<JoinRequest | null>(null);
  const [requestToDelete, setRequestToDelete] = useState<JoinRequest | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteResidentTarget, setInviteResidentTarget] = useState<Resident | null>(null);

  const activatedResidents = useMemo(() => {
    return residents.filter(r => {
      // Must be invited (INVITED or REVOKED) AND must have logged in (lastLoginAt or tenantLastLoginAt)
      const ownerActivated = (r.accountStatus === 'INVITED' || r.accountStatus === 'REVOKED') && !!r.lastLoginAt;
      const tenantActivated = r.ownershipType === 'إيجار' && (r.tenantAccountStatus === 'INVITED' || r.tenantAccountStatus === 'REVOKED') && !!r.tenantLastLoginAt;
      return ownerActivated || tenantActivated;
    }).sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
  }, [residents]);

  const handleDeleteJoin = (resident: Resident) => {
    const updated: Resident = {
      ...resident,
      accountStatus: 'ACTIVE', // reverts to inactive placeholder
      email: `flat${resident.flatNumber}@pyramids.com`,
      password: `pyr-${Math.floor(1000 + Math.random() * 9000)}`, // refresh password
      lastLoginAt: '', // clear login status
    };
    if (resident.ownershipType === 'إيجار') {
      updated.tenantAccountStatus = 'ACTIVE';
      updated.tenantEmail = `tenant${resident.flatNumber}@pyramids.com`;
      updated.tenantPassword = `pyr-${Math.floor(1000 + Math.random() * 9000)}`;
      updated.tenantLastLoginAt = ''; // clear login status
    }
    onEdit(updated);
    setToastMsg(`تم حذف وإلغاء تفعيل انضمام الوحدة ${resident.flatNumber} بالكامل بنجاح.`);
    setTimeout(() => setToastMsg(null), 4000);
  };

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
      
      // Check if unit exists first to enforce "Units are always registered by the president"
      const existingResident = residents.find(r => isSameFlatNumber(r.flatNumber, request.flatNumber));
      if (!existingResident) {
        throw new Error(`الوحدة رقم (${request.flatNumber}) غير مسجلة في هيكل العمارة. يجب على رئيس الاتحاد تسجيل هذه الوحدة في كشف الوحدات أولاً قبل الموافقة على طلب الانضمام.`);
      }
      
      // 1. Call authStore to update status to APPROVED
      await updateJoinRequestStatus(request.id, 'APPROVED');

      // 2. Auto sync the resident in the residents list
      const updatedResident: Resident = {
        ...existingResident,
        name: request.residentType === 'OWNER' && request.ownerName ? request.ownerName : existingResident.name,
        phone: request.residentType === 'OWNER' && request.ownerPhone ? formatMobileNumber(request.ownerPhone) : existingResident.phone,
        ownershipType: request.residentType === 'OWNER' ? 'تمليك' : 'إيجار',
        tenantName: request.residentType === 'TENANT' ? request.tenantName : existingResident.tenantName,
        tenantPhone: request.residentType === 'TENANT' && request.tenantPhone ? formatMobileNumber(request.tenantPhone) : existingResident.tenantPhone,
      };
      onEdit(updatedResident);

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
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>(['']);
  const [notes, setNotes] = useState('');
  const [ownershipType, setOwnershipType] = useState<'تمليك' | 'إيجار'>('تمليك');
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantPhoneNumbers, setTenantPhoneNumbers] = useState<string[]>(['']);
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
    setPhoneNumbers(['']);
    setNotes('');
    setOwnershipType('تمليك');
    setTenantName('');
    setTenantPhone('');
    setTenantPhoneNumbers(['']);
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

  const handlePickContactForOwner = async (index: number) => {
    const res = await pickContactFromDevice();
    if (res && res.supported === false) {
      alert('خاصية استيراد الأرقام من جهات الاتصال مدعومة على متصفحات الهواتف المحمولة (مثل Google Chrome على Android).');
      return;
    }
    if (res && res.tel) {
      const updated = [...phoneNumbers];
      updated[index] = res.tel;
      setPhoneNumbers(updated);
      if (!name.trim() && res.name) {
        setName(res.name);
      }
    }
  };

  const handlePickContactForTenant = async (index: number) => {
    const res = await pickContactFromDevice();
    if (res && res.supported === false) {
      alert('خاصية استيراد الأرقام من جهات الاتصال مدعومة على متصفحات الهواتف المحمولة (مثل Google Chrome على Android).');
      return;
    }
    if (res && res.tel) {
      const updated = [...tenantPhoneNumbers];
      updated[index] = res.tel;
      setTenantPhoneNumbers(updated);
      if (!tenantName.trim() && res.name) {
        setTenantName(res.name);
      }
    }
  };

  const openEditModal = (resident: Resident) => {
    setSelectedResident(resident);
    setFlatNumber(String(resident.flatNumber));
    setName(resident.name);
    setActivityType(resident.activityType);
    setPhone(formatMobileNumber(resident.phone || ''));
    
    const parts = (resident.phone || '').split(/[,/;|\n]+/).map(p => p.trim()).filter(Boolean);
    setPhoneNumbers(parts.length > 0 ? parts : ['']);

    const cleanNotes = (resident.notes || '').includes('توليد تلقائي') ? '' : (resident.notes || '');
    setNotes(cleanNotes);
    setOwnershipType((resident.ownershipType as any) === 'إيجار' ? 'إيجار' : 'تمليك');
    setTenantName(resident.tenantName || '');
    setTenantPhone(formatMobileNumber(resident.tenantPhone || ''));

    const partsTenant = (resident.tenantPhone || '').split(/[,/;|\n]+/).map(p => p.trim()).filter(Boolean);
    setTenantPhoneNumbers(partsTenant.length > 0 ? partsTenant : ['']);

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
    
    // Generate a fresh random password of form: pyr-XXXX (X is random digit)
    const newPassword = `pyr-${Math.floor(1000 + Math.random() * 9000)}`;
    const resEmail = isTenant 
      ? (resident.tenantEmail || `tenant${resident.flatNumber}@pyramids.com`)
      : (resident.email || `flat${resident.flatNumber}@pyramids.com`);

    const cleanPhone = rawPhone ? formatMobileNumber(rawPhone).replace(/[^\d+]/g, '') : '';
    
    // Inject Firebase config and building ID
    const activeBId = (typeof window !== 'undefined' && localStorage.getItem('active_building_id')) || '';
    const fbConfig = getActiveFirebaseConfig();
    const apiKeyParam = fbConfig.apiKey ? `&apiKey=${encodeURIComponent(fbConfig.apiKey)}` : '';
    const projectIdParam = fbConfig.projectId ? `&projectId=${encodeURIComponent(fbConfig.projectId)}` : '';
    
    const appUrl = `https://waheedsamaha8-ai.github.io/pyramidsview-1/?invite=true&bld=${encodeURIComponent(activeBId)}${apiKeyParam}${projectIdParam}&flat=${encodeURIComponent(resident.flatNumber || '')}&name=${encodeURIComponent(recipientName || '')}&email=${encodeURIComponent(resEmail)}&pass=${encodeURIComponent(newPassword)}`;

    const message = `مرحباً بك أستاذ/ة ${recipientName} 👋

يسرنا دعوة سيادتكم للانضمام إلى تطبيق اتحاد ملاك العمارة لمتابعة الخدمات والتحصيلات والتواصل.

بيانات دخولك المخصصة للتطبيق:
📍 رقم الشقة: ${resident.flatNumber}
👤 الاسم: ${recipientName}
✉️ البريد الإلكتروني: ${resEmail}
🔑 كلمة المرور الجديدة: ${newPassword}

رابط دخول التطبيق المباشر (مفعل بالكامل لمبنى سيادتكم):
${appUrl}

نتمنى لك تجربة متميزة!`;

    // Save the new password and update account status to INVITED
    const updatedRes = { ...resident };
    if (isTenant) {
      updatedRes.tenantPassword = newPassword;
      updatedRes.tenantAccountStatus = 'INVITED';
    } else {
      updatedRes.password = newPassword;
      updatedRes.accountStatus = 'INVITED';
    }
    onEdit(updatedRes);

    if (cleanPhone) {
      let formatted = cleanPhone;
      if (formatted.startsWith('01') && formatted.length === 11) {
        formatted = '2' + formatted; // Egypt code
      }
      const waUrl = `https://wa.me/${formatted.startsWith('+') ? formatted.slice(1) : formatted}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
    } else {
      navigator.clipboard.writeText(message);
      setToastMsg(`تم نسخ رسالة الدعوة بكلمة المرور الجديدة (${newPassword}) بنجاح! يمكنك إرسالها عبر الواتساب.`);
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
    setEditingFloorId(null);
    const base = (floorConfigs && floorConfigs.length > 0)
      ? floorConfigs
      : (residents && residents.length > 0 ? deriveFloorConfigsFromResidents(residents) : []);
    
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

    const finalPhone = phoneNumbers
      .map(p => formatMobileNumber(p.trim()))
      .filter(Boolean)
      .join(', ');

    const finalTenantPhone = ownershipType === 'إيجار'
      ? tenantPhoneNumbers.map(p => formatMobileNumber(p.trim())).filter(Boolean).join(', ')
      : '';

    const residentData: Resident = {
      id: selectedResident ? selectedResident.id : `res_${Date.now()}`,
      flatNumber: flatStr,
      name: name.trim(),
      activityType,
      phone: finalPhone,
      notes: notes.trim(),
      ownershipType,
      tenantName: ownershipType === 'إيجار' ? tenantName.trim() : '',
      tenantPhone: finalTenantPhone,
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

  const persistFloorChange = async (targetLayout: FloorConfig[]) => {
    setIsGenerating(true);
    try {
      if (targetLayout.length === 0) {
        await onSetFloorConfigs([]);
        await onSetAll([]);
        setToastMsg('تم إخلاء وتصميم هيكل العمارة بنجاح.');
        setTimeout(() => setToastMsg(null), 5000);
        return;
      }

      const newResidents: Resident[] = [];
      const presidentProfile = config?.adminResidentProfile;
      const presFlat = presidentProfile?.flatNumber || 207;
      let presidentAssigned = false;

      // Track processed IDs and flat numbers so no duplicate slots are generated
      const processedIds = new Set<string>();
      const processedFlats = new Set<string>();

      // Existing residents lookup map
      const existingMap = new Map<string, Resident>();
      residents.forEach(r => {
        if (r && r.flatNumber !== undefined && r.flatNumber !== null) {
          existingMap.set(String(r.flatNumber).trim(), r);
        }
      });

      targetLayout.forEach((configItem, floorIndex) => {
        const unitFee = getDefaultFeeForActivity(configItem.activityType);
        // Ensure we compute unit numbers dynamically if not set
        const floorUnits = Array.isArray(configItem.unitNumbers) ? configItem.unitNumbers : getUnitNumbersForFloor(configItem, residents);
        
        floorUnits.forEach((unitId, j) => {
          const isPresidentUnit = isSameFlatNumber(unitId, presFlat);
          const unitStr = String(unitId).trim();
          
          if (processedFlats.has(unitStr)) {
            // Already generated or mapped this flat, skip to prevent duplication
            return;
          }
          processedFlats.add(unitStr);

          const existingRes = existingMap.get(unitStr) || residents.find(r => isSameFlatNumber(r.flatNumber, unitId));

          if (isPresidentUnit && presidentProfile) {
            presidentAssigned = true;
            const presId = existingRes?.id || `res_president_${unitId}_${Date.now()}`;
            processedIds.add(presId);
            newResidents.push({
              ...(existingRes || {}),
              id: presId,
              flatNumber: unitId,
              name: (presidentProfile.name || 'وحيد سماحة').replace(/\s*\(رئيس الاتحاد\)/g, '').trim(),
              activityType: presidentProfile.activityType || configItem.activityType,
              phone: presidentProfile.phone || existingRes?.phone || '',
              notes: presidentProfile.notes || 'رئيس اتحاد الملاك',
              ownershipType: presidentProfile.ownershipType || 'تمليك',
              tenantName: existingRes?.tenantName || '',
              tenantPhone: existingRes?.tenantPhone || '',
              monthlyFee: presidentProfile.monthlyFee !== undefined && Number(presidentProfile.monthlyFee) > 0 
                ? Number(presidentProfile.monthlyFee) 
                : (existingRes?.monthlyFee || unitFee),
              initialBalance: presidentProfile.initialBalance !== undefined ? Number(presidentProfile.initialBalance) : (existingRes?.initialBalance || 0),
            } as Resident);
          } else if (existingRes) {
            // SAFE MERGE: Keep 100% of existing resident properties!
            processedIds.add(String(existingRes.id));
            newResidents.push({
              ...existingRes,
              flatNumber: unitId,
              activityType: existingRes.activityType || configItem.activityType,
              monthlyFee: existingRes.monthlyFee || unitFee,
            });
          } else {
            // Generate new placeholder resident slot for missing unit
            const genId = `res_gen_${unitId}_${Date.now()}_${floorIndex}_${j}`;
            processedIds.add(genId);
            newResidents.push({
              id: genId,
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
              email: `flat${unitId}@pyramids.com`,
              password: `pyr${unitId}#2026`,
              accountStatus: 'ACTIVE',
            });
          }
        });
      });

      // Explicitly add president profile if not assigned
      if (presidentProfile && !presidentAssigned) {
        const presStr = String(presFlat).trim();
        if (!processedFlats.has(presStr)) {
          processedFlats.add(presStr);
          const existingPres = existingMap.get(presStr) || residents.find(r => isSameFlatNumber(r.flatNumber, presFlat));
          const presId = existingPres?.id || `res_president_${presFlat}_${Date.now()}`;
          processedIds.add(presId);
          newResidents.push({
            ...(existingPres || {}),
            id: presId,
            flatNumber: presFlat,
            name: (presidentProfile.name || 'وحيد سماحة').replace(/\s*\(رئيس الاتحاد\)/g, '').trim(),
            activityType: presidentProfile.activityType || 'سكني',
            phone: presidentProfile.phone || existingPres?.phone || '',
            notes: presidentProfile.notes || 'رئيس اتحاد الملاك',
            ownershipType: presidentProfile.ownershipType || 'تمليك',
            tenantName: existingPres?.tenantName || '',
            tenantPhone: existingPres?.tenantPhone || '',
            monthlyFee: presidentProfile.monthlyFee !== undefined && Number(presidentProfile.monthlyFee) > 0
              ? Number(presidentProfile.monthlyFee)
              : getDefaultFeeForActivity(presidentProfile.activityType || 'سكني'),
            initialBalance: presidentProfile.initialBalance !== undefined ? Number(presidentProfile.initialBalance) : (existingPres?.initialBalance || 0),
          } as Resident);
        }
      }

      newResidents.sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));

      // Dedup pass to make 1000% sure we don't have duplicate flat numbers
      const finalUniqueResidents: Resident[] = [];
      const finalSeenFlats = new Set<string>();
      newResidents.forEach(res => {
        const fStr = String(res.flatNumber).trim();
        if (!finalSeenFlats.has(fStr)) {
          finalSeenFlats.add(fStr);
          finalUniqueResidents.push(res);
        }
      });

      // Save both structures and resident list directly to Firestore/state
      await onSetFloorConfigs(targetLayout);
      await onSetAll(finalUniqueResidents);

      setToastMsg('تم حفظ وتحديث هيكل العمارة وتوليد الشقق بنجاح دون أي تكرار! 🔥');
      setTimeout(() => setToastMsg(null), 5000);
    } catch (err: any) {
      alert('حدث خطأ أثناء الحفظ والمعالجة: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setIsGenerating(false);
    }
  };

  const removeFloorConfig = async (id: string) => {
    const updated = localFloorConfigs.filter(f => f.id !== id);
    setLocalFloorConfigs(updated);
    await persistFloorChange(updated);
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
                <table className="w-full text-right border-collapse">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                <div className="space-y-1.5 min-w-0">
                  <label className="text-[10px] font-black text-slate-600 block">أرقام هواتف المالك / الساكن</label>
                  <div className="space-y-2">
                    {phoneNumbers.map((num, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="01xxxxxxxxx"
                          value={num}
                          onChange={(e) => {
                            const updated = [...phoneNumbers];
                            updated[index] = normalizePhoneInput(e.target.value);
                            setPhoneNumbers(updated);
                          }}
                          onBlur={() => {
                            const updated = [...phoneNumbers];
                            updated[index] = formatMobileNumber(num);
                            setPhoneNumbers(updated);
                          }}
                          dir="ltr"
                          className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200/80 focus:bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-left font-mono font-bold transition"
                        />
                        <button
                          type="button"
                          onClick={() => handlePickContactForOwner(index)}
                          className="w-9 h-9 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 rounded-xl flex items-center justify-center transition shrink-0 cursor-pointer shadow-2xs"
                          title="استيراد الرقم من سجل جهات اتصال الهاتف"
                        >
                          <Contact className="w-4 h-4 stroke-[2]" />
                        </button>
                        {index === phoneNumbers.length - 1 ? (
                          <button
                            type="button"
                            onClick={() => setPhoneNumbers([...phoneNumbers, ''])}
                            className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center hover:bg-blue-100 transition shrink-0 cursor-pointer"
                            title="إضافة رقم آخر"
                          >
                            <Plus className="w-4 h-4 stroke-[2.5]" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = phoneNumbers.filter((_, i) => i !== index);
                              setPhoneNumbers(updated.length > 0 ? updated : ['']);
                            }}
                            className="w-9 h-9 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center hover:bg-rose-100 transition shrink-0 cursor-pointer"
                            title="حذف الرقم"
                          >
                            <Trash2 className="w-4 h-4 stroke-[1.5]" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tenant Fields (if rented) */}
              {ownershipType === 'إيجار' && (
                <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-900 border-b border-amber-200/60 pb-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                    <span>بيانات المستأجر الحالي للوحدة</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                    <div className="space-y-1.5 min-w-0">
                      <label className="text-[10px] font-black text-amber-950 block">أرقام هواتف المستأجر</label>
                      <div className="space-y-2">
                        {tenantPhoneNumbers.map((num, index) => (
                          <div key={index} className="flex items-center gap-1.5">
                            <input
                              type="text"
                              placeholder="01xxxxxxxxx"
                              value={num}
                              onChange={(e) => {
                                const updated = [...tenantPhoneNumbers];
                                updated[index] = normalizePhoneInput(e.target.value);
                                setTenantPhoneNumbers(updated);
                              }}
                              onBlur={() => {
                                const updated = [...tenantPhoneNumbers];
                                updated[index] = formatMobileNumber(num);
                                setTenantPhoneNumbers(updated);
                              }}
                              dir="ltr"
                              className="flex-1 min-w-0 px-3 py-2 bg-white border border-amber-200 focus:border-amber-500 rounded-xl text-xs outline-none text-left font-mono font-bold transition"
                            />
                            <button
                              type="button"
                              onClick={() => handlePickContactForTenant(index)}
                              className="w-9 h-9 bg-amber-100/80 hover:bg-amber-200 text-amber-900 border border-amber-300/80 rounded-xl flex items-center justify-center transition shrink-0 cursor-pointer shadow-2xs"
                              title="استيراد الرقم من سجل جهات اتصال الهاتف"
                            >
                              <Contact className="w-4 h-4 stroke-[2]" />
                            </button>
                            {index === tenantPhoneNumbers.length - 1 ? (
                              <button
                                type="button"
                                onClick={() => setTenantPhoneNumbers([...tenantPhoneNumbers, ''])}
                                className="w-9 h-9 bg-amber-100/70 text-amber-900 rounded-xl flex items-center justify-center hover:bg-amber-200/80 transition shrink-0 cursor-pointer"
                                title="إضافة رقم آخر"
                              >
                                <Plus className="w-4 h-4 stroke-[2.5]" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = tenantPhoneNumbers.filter((_, i) => i !== index);
                                  setTenantPhoneNumbers(updated.length > 0 ? updated : ['']);
                                }}
                                className="w-9 h-9 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center hover:bg-rose-100 transition shrink-0 cursor-pointer"
                                title="حذف الرقم"
                              >
                                <Trash2 className="w-4 h-4 stroke-[1.5]" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
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

              {/* Main Primary Action Button: Add New Floor (At the top of the body for main visibility) */}
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
                  <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-2">
                    <Building2 className="w-8 h-8 text-slate-400" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
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
                              onClick={async () => {
                                setEditingFloorId(null);
                                await persistFloorChange(localFloorConfigs);
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
                              onClick={async () => {
                                await persistFloorChange(localFloorConfigs);
                              }}
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
                              onClick={() => {
                                setConfirmData({
                                  type: 'delete_floor',
                                  floorToDeleteId: floor.id,
                                  floorToDeleteLabel: floor.floorLabel
                                });
                              }}
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
                onClick={() => setShowConfigModal(false)}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer shadow-2xs"
              >
                إغلاق النافذة
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
                    await removeFloorConfig(confirmData.floorToDeleteId);
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
