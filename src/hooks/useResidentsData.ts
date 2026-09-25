import { useState, useMemo, useEffect, useCallback } from 'react';
import { Resident, FloorConfig, AppConfig, UserRole, JoinRequest } from '../types';
import { 
  deriveFloorConfigsFromResidents, 
  getUnitNumbersForFloor, 
  compareFlatNumbers, 
  isSameFlatNumber, 
  parseFlatNumber 
} from '../utils/buildingStructure';
import { 
  fetchAllJoinRequests, 
  updateJoinRequestStatus, 
  deleteJoinRequest 
} from '../services/authStore';
import { formatMobileNumber } from '../utils/phoneUtils';
import { getActiveFirebaseConfig } from '../services/firebaseConfig';

interface UseResidentsDataOptions {
  residents: Resident[];
  floorConfigs: FloorConfig[];
  config?: AppConfig;
  role: UserRole;
  onEdit: (resident: Resident) => void;
  onSetAll: (residents: Resident[]) => void;
  onSetFloorConfigs: (configs: FloorConfig[]) => void;
}

export function useResidentsData({
  residents,
  floorConfigs,
  config,
  role,
  onEdit,
  onSetAll,
  onSetFloorConfigs,
}: UseResidentsDataOptions) {
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Join requests state
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const showToast = useCallback((msg: string, durationMs: number = 4000) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), durationMs);
  }, []);

  const getDefaultFeeForActivity = useCallback((activity: string): number => {
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
  }, [config]);

  // Filtered residents based on search
  const filteredResidents = useMemo(() => {
    const s = searchTerm.toLowerCase().trim();
    if (!s) return residents;
    return residents.filter((r) =>
      r.name.toLowerCase().includes(s) ||
      r.flatNumber.toString().includes(s) ||
      (r.phone && r.phone.includes(s)) ||
      (r.tenantPhone && r.tenantPhone.includes(s)) ||
      (r.tenantName && r.tenantName.toLowerCase().includes(s))
    );
  }, [residents, searchTerm]);

  // Derived or configured floor layout
  const effectiveFloorConfigs = useMemo(() => {
    if (floorConfigs && floorConfigs.length > 0) {
      return floorConfigs;
    }
    if (residents && residents.length > 0) {
      return deriveFloorConfigsFromResidents(residents);
    }
    return [];
  }, [floorConfigs, residents]);

  // Group residents by floor
  const floorResidentGroups = useMemo(() => {
    const sortedFiltered = [...filteredResidents].sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
    const assignedResidentIds = new Set<string>();
    const groups: { floor: FloorConfig; residents: Resident[] }[] = [];

    effectiveFloorConfigs.forEach((floor) => {
      const unitNumbers = getUnitNumbersForFloor(floor, residents);
      const floorResidents = sortedFiltered.filter(r => unitNumbers.some(u => isSameFlatNumber(u, r.flatNumber)));
      floorResidents.forEach(r => assignedResidentIds.add(r.id));
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

  // Activated residents list for join & account activation
  const activatedResidents = useMemo(() => {
    return residents.filter(r => {
      const ownerActivated = (r.accountStatus === 'INVITED' || r.accountStatus === 'REVOKED') && !!r.lastLoginAt;
      const tenantActivated = r.ownershipType === 'إيجار' && (r.tenantAccountStatus === 'INVITED' || r.tenantAccountStatus === 'REVOKED') && !!r.tenantLastLoginAt;
      return ownerActivated || tenantActivated;
    }).sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
  }, [residents]);

  // Join Requests
  const fetchRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const data = await fetchAllJoinRequests();
      data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setJoinRequests(data);
    } catch (err) {
      console.error('Error fetching join requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'ADMIN') {
      fetchRequests();
    }
  }, [role, fetchRequests]);

  const handleApproveRequest = async (request: JoinRequest) => {
    try {
      setProcessingId(request.id);
      const existingResident = residents.find(r => isSameFlatNumber(r.flatNumber, request.flatNumber));
      if (!existingResident) {
        throw new Error(`الوحدة رقم (${request.flatNumber}) غير مسجلة في هيكل العمارة. يجب على رئيس الاتحاد تسجيل هذه الوحدة في كشف الوحدات أولاً قبل الموافقة على طلب الانضمام.`);
      }

      await updateJoinRequestStatus(request.id, 'APPROVED');

      const updatedResident: Resident = {
        ...existingResident,
        name: request.residentType === 'OWNER' && request.ownerName ? request.ownerName : existingResident.name,
        phone: request.residentType === 'OWNER' && request.ownerPhone ? formatMobileNumber(request.ownerPhone) : existingResident.phone,
        ownershipType: request.residentType === 'OWNER' ? 'تمليك' : 'إيجار',
        tenantName: request.residentType === 'TENANT' ? request.tenantName : existingResident.tenantName,
        tenantPhone: request.residentType === 'TENANT' && request.tenantPhone ? formatMobileNumber(request.tenantPhone) : existingResident.tenantPhone,
      };
      onEdit(updatedResident);
      showToast('تمت الموافقة على طلب الانضمام وتفعيل الحساب وتحديث قائمة السكان بنجاح!');
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
      await updateJoinRequestStatus(request.id, 'DECLINED');
      showToast('تم رفض طلب الانضمام بنجاح.');
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
      await deleteJoinRequest(request.id);
      showToast('تم حذف طلب الانضمام والبيانات الخاصة بالمستخدم نهائياً بنجاح.');
      fetchRequests();
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حذف الطلب.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteJoin = (resident: Resident) => {
    const updated: Resident = {
      ...resident,
      accountStatus: 'ACTIVE',
      email: `flat${resident.flatNumber}@pyramids.com`,
      password: `pyr-${Math.floor(1000 + Math.random() * 9000)}`,
      lastLoginAt: '',
    };
    if (resident.ownershipType === 'إيجار') {
      updated.tenantAccountStatus = 'ACTIVE';
      updated.tenantEmail = `tenant${resident.flatNumber}@pyramids.com`;
      updated.tenantPassword = `pyr-${Math.floor(1000 + Math.random() * 9000)}`;
      updated.tenantLastLoginAt = '';
    }
    onEdit(updated);
    showToast(`تم حذف وإلغاء تفعيل انضمام الوحدة ${resident.flatNumber} بالكامل بنجاح.`);
  };

  const handleSendWhatsAppInvite = (resident: Resident, targetType: 'OWNER' | 'TENANT' = 'OWNER') => {
    const isTenant = targetType === 'TENANT';
    const recipientName = isTenant ? (resident.tenantName || resident.name) : resident.name;
    const rawPhone = isTenant ? (resident.tenantPhone || resident.phone) : resident.phone;
    
    const newPassword = `pyr-${Math.floor(1000 + Math.random() * 9000)}`;
    const resEmail = isTenant 
      ? (resident.tenantEmail || `tenant${resident.flatNumber}@pyramids.com`)
      : (resident.email || `flat${resident.flatNumber}@pyramids.com`);

    const cleanPhone = rawPhone ? formatMobileNumber(rawPhone).replace(/[^\d+]/g, '') : '';
    const activeBId = (typeof window !== 'undefined' && localStorage.getItem('active_building_id')) || '';
    const fbConfig = getActiveFirebaseConfig();
    const apiKeyParam = fbConfig.apiKey ? `&apiKey=${encodeURIComponent(fbConfig.apiKey)}` : '';
    const projectIdParam = fbConfig.projectId ? `&projectId=${encodeURIComponent(fbConfig.projectId)}` : '';
    
    const appUrl = `https://waheedsamaha8-ai.github.io/pyramidsview-1/?invite=true&bld=${encodeURIComponent(activeBId)}${apiKeyParam}${projectIdParam}&flat=${encodeURIComponent(resident.flatNumber || '')}&name=${encodeURIComponent(recipientName || '')}&email=${encodeURIComponent(resEmail)}&pass=${encodeURIComponent(newPassword)}`;

    const message = `مرحباً بك أستاذ/ة ${recipientName} 👋\n\nيسرنا دعوة سيادتكم للانضمام إلى تطبيق اتحاد ملاك العمارة لمتابعة الخدمات والتحصيلات والتواصل.\n\nبيانات دخولك المخصصة للتطبيق:\n📍 رقم الشقة: ${resident.flatNumber}\n👤 الاسم: ${recipientName}\n✉️ البريد الإلكتروني: ${resEmail}\n🔑 كلمة المرور الجديدة: ${newPassword}\n\nرابط دخول التطبيق المباشر (مفعل بالكامل لمبنى سيادتكم):\n${appUrl}\n\nنتمنى لك تجربة متميزة!`;

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
        formatted = '2' + formatted;
      }
      const waUrl = `https://wa.me/${formatted.startsWith('+') ? formatted.slice(1) : formatted}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
    } else {
      navigator.clipboard.writeText(message);
      showToast(`تم نسخ رسالة الدعوة بكلمة المرور الجديدة (${newPassword}) بنجاح! يمكنك إرسالها عبر الواتساب.`);
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
    showToast(`تم نسخ بيانات الدخول للوحدة ${resident.flatNumber} إلى الحافظة!`);
  };

  const handleToggleRevokeMembership = (resident: Resident, newStatus: 'ACTIVE' | 'REVOKED') => {
    const updated: Resident = {
      ...resident,
      accountStatus: newStatus,
      tenantAccountStatus: resident.ownershipType === 'إيجار' ? newStatus : resident.tenantAccountStatus,
    };
    onEdit(updated);
    if (newStatus === 'REVOKED') {
      showToast(`تم إلغاء عضوية الساكن بوحدة ${resident.flatNumber} وحظر دخوله بنجاح.`);
    } else {
      showToast(`تم إعادة تفعيل عضوية الساكن بوحدة ${resident.flatNumber} بنجاح.`);
    }
  };

  // Persist Floor Change
  const persistFloorChange = async (targetLayout: FloorConfig[]) => {
    setIsGenerating(true);
    try {
      if (targetLayout.length === 0) {
        await onSetFloorConfigs([]);
        await onSetAll([]);
        showToast('تم إخلاء وتصميم هيكل العمارة بنجاح.', 5000);
        return;
      }

      const newResidents: Resident[] = [];
      const presidentProfile = config?.adminResidentProfile;
      const presFlat = presidentProfile?.flatNumber || 207;
      let presidentAssigned = false;

      const processedFlats = new Set<string>();
      const existingMap = new Map<string, Resident>();
      residents.forEach(r => {
        if (r && r.flatNumber !== undefined && r.flatNumber !== null) {
          existingMap.set(String(r.flatNumber).trim(), r);
        }
      });

      targetLayout.forEach((configItem, floorIndex) => {
        const unitFee = getDefaultFeeForActivity(configItem.activityType);
        const floorUnits = Array.isArray(configItem.unitNumbers) ? configItem.unitNumbers : getUnitNumbersForFloor(configItem, residents);
        
        floorUnits.forEach((unitId, j) => {
          const isPresidentUnit = isSameFlatNumber(unitId, presFlat);
          const unitStr = String(unitId).trim();
          
          if (processedFlats.has(unitStr)) {
            return;
          }
          processedFlats.add(unitStr);

          const existingRes = existingMap.get(unitStr) || residents.find(r => isSameFlatNumber(r.flatNumber, unitId));

          if (isPresidentUnit && presidentProfile) {
            presidentAssigned = true;
            const presId = existingRes?.id || `res_president_${unitId}_${Date.now()}`;
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
            newResidents.push({
              ...existingRes,
              flatNumber: unitId,
              activityType: existingRes.activityType || configItem.activityType,
              monthlyFee: existingRes.monthlyFee || unitFee,
            });
          } else {
            const genId = `res_gen_${unitId}_${Date.now()}_${floorIndex}_${j}`;
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

      if (presidentProfile && !presidentAssigned) {
        const presStr = String(presFlat).trim();
        if (!processedFlats.has(presStr)) {
          processedFlats.add(presStr);
          const existingPres = existingMap.get(presStr) || residents.find(r => isSameFlatNumber(r.flatNumber, presFlat));
          const presId = existingPres?.id || `res_president_${presFlat}_${Date.now()}`;
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

      const finalUniqueResidents: Resident[] = [];
      const finalSeenFlats = new Set<string>();
      newResidents.forEach(res => {
        const fStr = String(res.flatNumber).trim();
        if (!finalSeenFlats.has(fStr)) {
          finalSeenFlats.add(fStr);
          finalUniqueResidents.push(res);
        }
      });

      await onSetFloorConfigs(targetLayout);
      await onSetAll(finalUniqueResidents);

      showToast('تم حفظ وتحديث هيكل العمارة وتوليد الشقق بنجاح دون أي تكرار! 🔥', 5000);
    } catch (err: any) {
      alert('حدث خطأ أثناء الحفظ والمعالجة: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setIsGenerating(false);
    }
  };

  return {
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
    fetchRequests,
    handleApproveRequest,
    handleDeclineRequest,
    handleDeleteRequest,
    handleDeleteJoin,
    handleSendWhatsAppInvite,
    handleCopyCredentials,
    handleToggleRevokeMembership,
    persistFloorChange,
    getDefaultFeeForActivity,
  };
}
