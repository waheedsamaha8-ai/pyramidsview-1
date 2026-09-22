import React, { useState, useEffect } from 'react';
import { googleSignIn, logoutUser } from '../services/firebaseConfig';
import firebaseConfig from '../../firebase-applet-config.json';
import { 
  loginWithEmail, 
  registerAdmin, 
  submitJoinRequest, 
  fetchAllJoinRequests 
} from '../services/authStore';
import { 
  getAllBuildings, 
  setActiveBuilding, 
  registerNewUnionBuilding, 
  getActiveBuilding,
  clearAllAppData,
  deleteBuilding,
  deleteAllBuildings,
  DEFAULT_BUILDING_ID 
} from '../services/buildingStore';
import { Building as BuildingType, UserRole } from '../types';
import { formatMobileNumber } from '../utils/phoneUtils';
import { 
  Mail, 
  Lock, 
  Building, 
  Building2,
  User, 
  Phone, 
  CheckCircle, 
  AlertCircle, 
  LogIn, 
  ShieldCheck, 
  Users, 
  Key, 
  Sparkles,
  ArrowRight,
  Home,
  Wrench,
  Copy,
  ExternalLink,
  Globe,
  PlusCircle,
  FolderSync,
  MapPin,
  RotateCcw,
  Check,
  Trash2
} from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: any, token: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  // Top Level Tab: Sign In vs Register New Building
  const [topTab, setTopTab] = useState<'SIGN_IN' | 'REGISTER_BUILDING'>('SIGN_IN');

  // Main Portal Selector for Sign In: President vs Assistant vs Resident
  const [portalMode, setPortalMode] = useState<'PRESIDENT' | 'ASSISTANT' | 'RESIDENT'>('PRESIDENT');

  // Sub-tabs for residents
  const [residentTab, setResidentTab] = useState<'login' | 'register'>('login');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  // Multi-tenant Buildings State
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(DEFAULT_BUILDING_ID);
  
  // Custom in-app confirmation modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'single' | 'all' | 'factory_reset';
    bId?: string;
    bName?: string;
  }>({ isOpen: false, type: 'all' });

  // Fetch registered buildings on mount
  useEffect(() => {
    const loadBuildings = async () => {
      try {
        const list = await getAllBuildings();
        setBuildings(list);
        if (list.length === 0) {
          // If no buildings have been registered yet, default directly to registration
          setTopTab('REGISTER_BUILDING');
          setSelectedBuildingId('');
        } else {
          const active = getActiveBuilding();
          if (active && active.id && list.some(b => b.id === active.id)) {
            setSelectedBuildingId(active.id);
          } else {
            setSelectedBuildingId(list[0].id);
            setActiveBuilding(list[0]);
          }
        }
      } catch (err) {
        console.warn('Error loading buildings list:', err);
      }
    };
    loadBuildings();
  }, []);

  // Update active building when user selects from dropdown
  const handleSelectBuilding = (bId: string) => {
    setSelectedBuildingId(bId);
    const found = buildings.find(b => b.id === bId);
    if (found) {
      setActiveBuilding(found);
    }
    setLoginEmail('');
    setLoginPassword('');
  };

  // Delete single building handler (triggers custom modal)
  const handleDeleteBuildingClick = (bId: string) => {
    const target = buildings.find(b => b.id === bId);
    setDeleteModal({
      isOpen: true,
      type: 'single',
      bId,
      bName: target ? target.name : 'هذا الاتحاد',
    });
  };

  // Delete all buildings handler (triggers custom modal)
  const handleDeleteAllBuildingsClick = () => {
    setDeleteModal({
      isOpen: true,
      type: 'all',
    });
  };

  // Factory reset handler
  const handleFactoryResetClick = () => {
    setDeleteModal({
      isOpen: true,
      type: 'factory_reset',
    });
  };

  // Execute deletion confirmed by user in UI
  const handleConfirmExecuteDelete = async () => {
    const { type, bId } = deleteModal;
    setDeleteModal({ isOpen: false, type: 'all' });
    setLoading(true);
    setError(null);
    try {
      if (type === 'factory_reset') {
        clearAllAppData();
        setBuildings([]);
        setSelectedBuildingId('');
        setTopTab('REGISTER_BUILDING');
        setSuccessMessage('تم مسح كافة البيانات المؤقتة والذاكرة المحلية بنجاح.');
        setTimeout(() => {
          window.location.reload();
        }, 300);
        return;
      }

      if (type === 'single' && bId) {
        await deleteBuilding(bId);
        const updated = await getAllBuildings();
        setBuildings(updated);
        if (updated.length === 0) {
          setTopTab('REGISTER_BUILDING');
          setSelectedBuildingId('');
        } else {
          setSelectedBuildingId(updated[0].id);
          setActiveBuilding(updated[0]);
        }
        setSuccessMessage('تم حذف الاتحاد وجميع سجلاته بنجاح.');
      } else {
        await deleteAllBuildings();
        setBuildings([]);
        setSelectedBuildingId('');
        setTopTab('REGISTER_BUILDING');
        setSuccessMessage('تم حذف كافة الاتحادات المسجلة نهائياً. التطبيق جاهز تماماً كأول مرة لتسجيل اتحاد جديد!');
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء تنفيذ الحذف.');
    } finally {
      setLoading(false);
    }
  };

  // Sign In inputs
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register New Building inputs (Commercial / Multi-tenant Flow)
  const [newBuildingName, setNewBuildingName] = useState('');
  const [newBuildingAddress, setNewBuildingAddress] = useState('');
  const [newPresidentName, setNewPresidentName] = useState('');
  const [newPresidentEmail, setNewPresidentEmail] = useState('');
  const [newPresidentPhone, setNewPresidentPhone] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  // Resident Register (Join Request) inputs
  const [flatNumber, setFlatNumber] = useState('');
  const [residentType, setResidentType] = useState<'OWNER' | 'TENANT'>('OWNER');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  // Auto-detect invitation links (?invite=true&flat=204&name=...&bld=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const isInvite = params.get('invite') === 'true';
      const invitedFlat = params.get('flat');
      const invitedName = params.get('name');
      const invitedBuilding = params.get('bld');

      if (invitedBuilding) {
        setSelectedBuildingId(invitedBuilding);
      }

      if (isInvite || invitedFlat) {
        setTopTab('SIGN_IN');
        setPortalMode('RESIDENT');
        setResidentTab('register');
        if (invitedFlat) setFlatNumber(invitedFlat);
        if (invitedName) setOwnerName(decodeURIComponent(invitedName));
        setSuccessMessage(`مرحباً بكم! تم تجهيز طلب الانضمام لشقة رقم ${invitedFlat || ''} بدعوة كريمة من مجلس إدارة اتحاد الملاك.`);
      }
    } catch (e) {
      console.warn('Failed to parse invitation params:', e);
    }
  }, []);

  const handleCopyDomain = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 3000);
    }).catch(() => {});
  };

  // --------------------------------------------------------------------------
  // 1. REGISTER NEW UNION / BUILDING HANDLER
  // --------------------------------------------------------------------------
  const handleRegisterNewBuildingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBuildingName.trim()) {
      setError('الرجاء إدخال اسم العمارة أو البرج السكني.');
      return;
    }
    if (!newPresidentName.trim()) {
      setError('الرجاء إدخال اسم رئيس الاتحاد أو المسؤول.');
      return;
    }
    if (!newPresidentEmail.trim() || !newPresidentEmail.includes('@')) {
      setError('الرجاء إدخال بريد إلكتروني صالح لرئيس الاتحاد.');
      return;
    }
    if (!newAdminPassword.trim()) {
      setError('الرجاء تحديد كلمة مرور إدارية لحماية حساب رئيس الاتحاد.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await registerNewUnionBuilding({
        buildingName: newBuildingName.trim(),
        buildingAddress: newBuildingAddress.trim(),
        presidentName: newPresidentName.trim(),
        presidentEmail: newPresidentEmail.trim(),
        presidentPhone: newPresidentPhone.trim(),
        adminPassword: newAdminPassword.trim(),
      });

      setSuccessMessage(`تم تسجيل اتحاد "${result.building.name}" بنجاح! كود العمارة هو (${result.building.code}). جاري الدخول للوحة التحكم...`);
      
      // Fast instant transition into dashboard
      setTimeout(() => {
        onLoginSuccess(result.userSession, 'local-token');
      }, 300);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء تسجيل العمارة والحساب الجديد.');
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // 2. STANDARD EMAIL/PASSWORD LOGIN HANDLER
  // --------------------------------------------------------------------------
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setError('الرجاء إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Check if user belongs to a specific building
      const cleanEmail = loginEmail.trim().toLowerCase();
      const allBuildingsList = await getAllBuildings();
      const matchedBuilding = allBuildingsList.find(b => b.presidentEmail.toLowerCase().trim() === cleanEmail) ||
                              allBuildingsList.find(b => b.id === selectedBuildingId) ||
                              buildings.find(b => b.id === selectedBuildingId);
      if (matchedBuilding) {
        setActiveBuilding(matchedBuilding);
      }

      const data = await loginWithEmail(loginEmail, loginPassword);

      if (data.success) {
        if (data.flatNumber) {
          localStorage.setItem('resident_flat_number', data.flatNumber.toString());
        }
        const activeB = getActiveBuilding();
        const userRole: UserRole = (data.role as UserRole) || (portalMode === 'PRESIDENT' ? 'ADMIN' : portalMode === 'ASSISTANT' ? 'ASSISTANT' : 'RESIDENT');

        localStorage.setItem('user_role', userRole);
        localStorage.setItem('app_user_role', userRole);

        const user = {
          email: data.email,
          displayName: data.name,
          uid: data.email,
          role: userRole,
          flatNumber: data.flatNumber,
          buildingId: matchedBuilding?.id || activeB.id,
          buildingName: matchedBuilding?.name || activeB.name,
        };
        localStorage.setItem('custom_user_session', JSON.stringify(user));
        onLoginSuccess(user, 'local-token');
      }
    } catch (err: any) {
      setError(err.message || 'خطأ أثناء تسجيل الدخول بالبريد الإلكتروني.');
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // 3. GOOGLE SIGN-IN HANDLER (MULTI-TENANT AWARE)
  // --------------------------------------------------------------------------
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        const { user, accessToken } = result;
        const email = user.email?.toLowerCase().trim() || '';

        // 1. Check if email is a registered President or Admin of any building
        const allBuildingsList = await getAllBuildings();
        const matchedBuilding = allBuildingsList.find(b => b.presidentEmail.toLowerCase().trim() === email);

        if (matchedBuilding) {
          setActiveBuilding(matchedBuilding);
          (user as any).role = 'ADMIN';
          (user as any).buildingId = matchedBuilding.id;
          (user as any).buildingName = matchedBuilding.name;
          localStorage.setItem('custom_user_session', JSON.stringify({ 
            ...user, 
            role: 'ADMIN',
            buildingId: matchedBuilding.id,
            buildingName: matchedBuilding.name
          }));
          onLoginSuccess(user, accessToken);
          return;
        }

        // 2. Check join requests for residents
        const requests = await fetchAllJoinRequests();
        const match = requests.find((r: any) => r.email.toLowerCase().trim() === email);
        
        if (match) {
          if (match.status === 'APPROVED') {
            localStorage.setItem('resident_flat_number', match.flatNumber.toString());
            const currentB = getActiveBuilding();
            (user as any).role = 'RESIDENT';
            (user as any).flatNumber = match.flatNumber;
            (user as any).buildingId = currentB.id;
            (user as any).buildingName = currentB.name;
            localStorage.setItem('custom_user_session', JSON.stringify({ 
              ...user, 
              role: 'RESIDENT', 
              flatNumber: match.flatNumber,
              buildingId: currentB.id,
              buildingName: currentB.name
            }));
            onLoginSuccess(user, accessToken);
            return;
          } else if (match.status === 'PENDING') {
            await logoutUser();
            setError('طلب الانضمام الخاص بك قيد المراجعة حالياً من قبل إدارة اتحاد الملاك. يرجى المحاولة لاحقاً بمجرد الاعتماد.');
            return;
          } else if (match.status === 'DECLINED') {
            await logoutUser();
            setError('معذرةً، لقد تم رفض طلب الانضمام الخاص بك. يرجى التواصل مع إدارة الملاك.');
            return;
          }
        }

        // If user is not yet registered in any building, guide them to register their union
        setTopTab('REGISTER_BUILDING');
        setNewPresidentEmail(email);
        setNewPresidentName(user.displayName || '');
        setSuccessMessage(`مرحباً بك (${user.displayName || email})! تم ربط حساب Google بنجاح. يرجى إدخال اسم العمارة وكلمة المرور الإدارية لإنشاء اتحاد الملاك الخاص بك.`);
      }
    } catch (err: any) {
      console.error('Google sign in error:', err);
      const errMsg = String(err?.message || err?.code || err || '');
      if (errMsg.includes('auth/unauthorized-domain') || errMsg.includes('unauthorized-domain')) {
        const currentHostname = window.location.hostname || 'waheedsamaha8-ai.github.io';
        setUnauthorizedDomain(currentHostname);
      } else {
        setError(err?.message || 'فشل تسجيل الدخول بحساب Google. يمكنك استخدام كلمة المرور.');
      }
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // 4. RESIDENT JOIN REQUEST HANDLER
  // --------------------------------------------------------------------------
  const handleResidentRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flatNumber) {
      setError('الرجاء إدخال رقم الشقة.');
      return;
    }
    if (!ownerName || !ownerPhone) {
      setError('الرجاء كتابة اسم مالك الوحدة ورقم تليفون الواتساب.');
      return;
    }
    if (residentType === 'TENANT' && (!tenantName || !tenantPhone)) {
      setError('الرجاء كتابة اسم المستأجر ورقم تليفون الواتساب.');
      return;
    }
    if (!registerEmail || !registerPassword) {
      setError('الرجاء إدخال البريد الإلكتروني وكلمة المرور المطلوب التسجيل بهما.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload = {
        flatNumber: parseInt(flatNumber),
        residentType,
        ownerName: ownerName.trim(),
        ownerPhone: formatMobileNumber(ownerPhone),
        tenantName: residentType === 'TENANT' ? tenantName.trim() : '',
        tenantPhone: residentType === 'TENANT' ? formatMobileNumber(tenantPhone) : '',
        email: registerEmail.trim(),
        password: registerPassword,
      };

      const result = await submitJoinRequest(payload);

      setSuccessMessage(result.message || 'تم إرسال طلب الانضمام بنجاح! طلبك قيد المراجعة والاعتماد حالياً من قبل رئيس الاتحاد.');
      setFlatNumber('');
      setOwnerName('');
      setOwnerPhone('');
      setTenantName('');
      setTenantPhone('');
      setRegisterEmail('');
      setRegisterPassword('');
      setResidentTab('login');
    } catch (err: any) {
      setError(err.message || 'خطأ أثناء إرسال طلب الانضمام.');
    } finally {
      setLoading(false);
    }
  };

  const currentActiveBuilding = buildings.find(b => b.id === selectedBuildingId) || getActiveBuilding();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 sm:py-12 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-[#080d1a] dark:to-[#0f172a]" dir="rtl">
      <div className="w-full max-w-lg bg-white dark:bg-[#111a2e] rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-2xl flex flex-col transition-all">
        
        {/* Header Logo & Active Building */}
        <div className="flex flex-col items-center mb-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-900 to-indigo-900 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/25 mb-3 border border-blue-700/40">
            <Building2 className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-blue-950 dark:text-white text-center tracking-tight">
            {topTab === 'REGISTER_BUILDING' 
              ? 'تسجيل اتحاد ملاك وعمارة جديدة' 
              : 'العمارة'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs text-center mt-1 font-bold">
            {topTab === 'REGISTER_BUILDING' 
              ? 'أنشئ حساب اتحادك الجديد مع قاعدة بيانات سحابية ونسخ Google Drive مخصص فوراً' 
              : 'المنظومة السحابية الموحدة لإدارة شؤون وماليات وخدمات العمارات'}
          </p>
        </div>

        {/* ========================================================================= */}
        {/* TOP LEVEL NAVIGATION: SIGN IN VS REGISTER NEW BUILDING                   */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200/70 dark:border-slate-700 mb-5">
          <button
            type="button"
            onClick={() => {
              setTopTab('SIGN_IN');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              topTab === 'SIGN_IN'
                ? 'bg-blue-900 text-white shadow-md shadow-blue-900/30'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/50'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>تسجيل الدخول</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTopTab('REGISTER_BUILDING');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              topTab === 'REGISTER_BUILDING'
                ? 'bg-emerald-700 text-white shadow-md shadow-emerald-700/30'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/50'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-emerald-300" />
            <span>تسجيل عمارة جديدة ✨</span>
          </button>
        </div>

        {/* Global Feedback Notifications */}
        {error && (
          <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs p-3.5 rounded-2xl mb-4 font-bold text-right">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
            <div>{error}</div>
          </div>
        )}

        {successMessage && (
          <div className="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs p-3.5 rounded-2xl mb-4 font-bold text-right animate-fade-in">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            <div>{successMessage}</div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW A: REGISTER NEW COMMERCIAL BUILDING / UNION                          */}
        {/* ========================================================================= */}
        {topTab === 'REGISTER_BUILDING' && (
          <form onSubmit={handleRegisterNewBuildingSubmit} className="space-y-4">
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-emerald-900 dark:text-emerald-200 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-black">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>ميزات إنشاء حساب اتحاد الملاك المستقل:</span>
              </div>
              <ul className="list-disc list-inside text-[11px] space-y-1 font-bold pr-2 leading-relaxed opacity-95">
                <li>عزل كامل لقاعدة البيانات السحابية الخاصة بعمارتك على Firebase.</li>
                <li>تفعيل النسخ الاحتياطي على Google Drive و Google Sheets الخاصة برئيس الاتحاد.</li>
                <li>يتم ضبط عدد الشقق والاشتراك الشهري تلقائياً بقيم افتراضية قابلة للتعديل بحرية من شاشة الإعدادات الداخلية.</li>
              </ul>
            </div>

            {/* Building Name */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">
                اسم العمارة أو المجمع السكني <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                  <Building className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  type="text"
                  required
                  value={newBuildingName}
                  onChange={(e) => setNewBuildingName(e.target.value)}
                  placeholder="مثال: برج الصفوة، عمارة النرجس 5، مجمع الأندلس"
                  className="w-full pl-4 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-emerald-600 focus:outline-none text-right font-medium dark:text-white"
                />
              </div>
            </div>

            {/* Building Address (Optional) */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">
                العنوان أو الموقع (اختياري)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                  <MapPin className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  type="text"
                  value={newBuildingAddress}
                  onChange={(e) => setNewBuildingAddress(e.target.value)}
                  placeholder="مثال: التجمع الخامس - الحي الثاني، شارع التسعين"
                  className="w-full pl-4 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-emerald-600 focus:outline-none text-right font-medium dark:text-white"
                />
              </div>
            </div>

            {/* President Name */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">
                اسم رئيس الاتحاد أو المفوض الإداري <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  type="text"
                  required
                  value={newPresidentName}
                  onChange={(e) => setNewPresidentName(e.target.value)}
                  placeholder="مثال: د. أحمد عبد الرحمن"
                  className="w-full pl-4 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-emerald-600 focus:outline-none text-right font-medium dark:text-white"
                />
              </div>
            </div>

            {/* President Email */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">
                البريد الإلكتروني لرئيس الاتحاد (Google / Gmail المعتمد) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  type="email"
                  required
                  value={newPresidentEmail}
                  onChange={(e) => setNewPresidentEmail(e.target.value)}
                  placeholder="president@gmail.com"
                  className="w-full pl-4 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-emerald-600 focus:outline-none text-right font-medium dark:text-white"
                />
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 text-right">
                سيُستخدم هذا البريد للدخول وإدارة النسخ الاحتياطي على Google Drive وجداول البيانات.
              </p>
            </div>

            {/* Admin Password */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">
                كلمة المرور الإدارية للرئيس <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  type="password"
                  required
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="حدد كلمة مرور قوية لحساب الإدارة"
                  className="w-full pl-4 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-emerald-600 focus:outline-none text-right font-medium dark:text-white"
                />
              </div>
            </div>

            {/* President Phone */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">
                رقم هاتف رئيس الاتحاد (واتساب - اختياري)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                  <Phone className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  type="tel"
                  value={newPresidentPhone}
                  onChange={(e) => setNewPresidentPhone(e.target.value)}
                  placeholder="010XXXXXXXX"
                  className="w-full pl-4 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-emerald-600 focus:outline-none text-right font-medium dark:text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-black transition active:scale-[0.99] shadow-lg shadow-emerald-700/25 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>إنشاء اتحاد الملاك وبدء الاستخدام فوراً 🚀</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* ========================================================================= */}
        {/* VIEW B: SIGN IN TO EXISTING BUILDING                                      */}
        {/* ========================================================================= */}
        {topTab === 'SIGN_IN' && (
          <div className="space-y-4">
            {/* Building Switcher Dropdown (Shown if buildings exist) */}
            {buildings.length > 0 ? (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-700 dark:text-slate-200 text-[11px] font-black flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>العمارة / اتحاد الملاك النشط:</span>
                    <span className="text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                      ({buildings.length} مسجل)
                    </span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedBuildingId}
                    onChange={(e) => handleSelectBuilding(e.target.value)}
                    className="w-full py-2 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-slate-800 dark:text-white focus:outline-none focus:border-blue-800"
                  >
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code}) - رئيس الاتحاد: {b.presidentName || 'غير محدد'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/40 rounded-2xl flex items-center justify-between text-xs">
                <span className="text-blue-950 dark:text-blue-200 font-bold">
                  سجل الدخول مباشرة ببريدك وكلمة المرور
                </span>
                <button
                  type="button"
                  onClick={() => setTopTab('REGISTER_BUILDING')}
                  className="text-emerald-700 dark:text-emerald-400 font-black hover:underline cursor-pointer text-[11px]"
                >
                  + تسجيل اتحاد جديد
                </button>
              </div>
            )}

            {/* Portal Role Selector */}
            <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200/60 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setPortalMode('PRESIDENT');
                  setError(null);
                  setSuccessMessage(null);
                  if (currentActiveBuilding.presidentEmail) {
                    setLoginEmail(currentActiveBuilding.presidentEmail);
                  } else {
                    setLoginEmail('');
                  }
                }}
                className={`py-2 px-1 rounded-xl font-black text-[11px] sm:text-xs flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  portalMode === 'PRESIDENT'
                    ? 'bg-blue-900 text-white shadow-md shadow-blue-900/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>رئيس الاتحاد</span>
                </div>
                <span className={`text-[9px] font-bold ${portalMode === 'PRESIDENT' ? 'text-blue-200' : 'text-slate-400'}`}>
                  مجلس الإدارة
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPortalMode('ASSISTANT');
                  setError(null);
                  setSuccessMessage(null);
                  setLoginEmail('assistant@pyramids.com');
                  setLoginPassword('assistant123');
                }}
                className={`py-2 px-1 rounded-xl font-black text-[11px] sm:text-xs flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  portalMode === 'ASSISTANT'
                    ? 'bg-indigo-900 text-white shadow-md shadow-indigo-900/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Wrench className="w-3.5 h-3.5 text-indigo-400" />
                  <span>المساعد الفني</span>
                </div>
                <span className={`text-[9px] font-bold ${portalMode === 'ASSISTANT' ? 'text-indigo-200' : 'text-slate-400'}`}>
                  تحصيل ومصروفات
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPortalMode('RESIDENT');
                  setError(null);
                  setSuccessMessage(null);
                  setLoginEmail('');
                  setLoginPassword('');
                }}
                className={`py-2 px-1 rounded-xl font-black text-[11px] sm:text-xs flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  portalMode === 'RESIDENT'
                    ? 'bg-blue-900 text-white shadow-md shadow-blue-900/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  <span>السكان</span>
                </div>
                <span className={`text-[9px] font-bold ${portalMode === 'RESIDENT' ? 'text-blue-200' : 'text-slate-400'}`}>
                  كشوف الحساب
                </span>
              </button>
            </div>

            {/* Authorized Domain Alert helper */}
            {unauthorizedDomain && (
              <div className="bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 p-4 rounded-2xl space-y-3 text-right shadow-sm" dir="rtl">
                <div className="flex items-start gap-2.5">
                  <Globe className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-black text-xs sm:text-sm text-amber-900 dark:text-amber-200">
                      تفعيل النطاق في إعدادات Google Firebase المصرح بها (Authorized Domains)
                    </h4>
                    <p className="text-[11px] sm:text-xs text-amber-800 dark:text-amber-300 font-bold leading-relaxed">
                      لحماية بيانات الموقع، تشترط Google إضافة نطاق موقعك الحالي (<span className="underline font-black text-amber-950 dark:text-white font-mono dir-ltr inline-block">{unauthorizedDomain}</span>) إلى قائمة النطاقات المسموح لها لمرة واحدة فقط ليعمل تسجيل الدخول بـ Google.
                    </p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[11px] font-bold text-slate-500 shrink-0">النطاق المطلوب:</span>
                    <span className="font-mono text-xs font-black text-blue-900 dark:text-blue-300 truncate dir-ltr">
                      {unauthorizedDomain}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyDomain(unauthorizedDomain)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedDomain ? 'تم النسخ بنجاح ✓' : 'نسخ النطاق'}</span>
                    </button>
                    <a
                      href={`https://console.firebase.google.com/project/${firebaseConfig.projectId || 'gen-lang-client-0075821615'}/authentication/settings`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>فتح إعدادات Firebase للمشروع ({firebaseConfig.projectId || 'gen-lang-client-0075821615'})</span>
                    </a>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[10px] text-amber-800 dark:text-amber-300 font-bold">أو يمكنك الدخول فوراً بكلمة المرور أدناه:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setUnauthorizedDomain(null);
                      setError(null);
                    }}
                    className="text-xs font-black text-blue-800 dark:text-blue-300 hover:underline cursor-pointer"
                  >
                    الدخول بكلمة المرور أدناه ↓
                  </button>
                </div>
              </div>
            )}

            {/* PRESIDENT PORTAL */}
            {portalMode === 'PRESIDENT' && (
              <div className="space-y-4">
                {/* Google Sign-in Option */}
                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50/50 dark:from-blue-950/40 dark:to-indigo-950/30 border-2 border-blue-200 dark:border-blue-800 rounded-2xl space-y-3">
                  <div className="text-right">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-200 text-[10px] font-black rounded-full">
                        Google Sign-In
                      </span>
                      <span className="text-xs font-black text-blue-950 dark:text-blue-200">
                        بوابة رئيس الاتحاد السحابية
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-bold mt-2 leading-relaxed">
                      دخول مباشر ومزامنة تلقائية مع Google Drive وجداول البيانات لحساب مجلس إدارة الاتحاد.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="w-full py-3 px-4 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-black transition active:scale-[0.99] shadow-md shadow-blue-900/20 flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                      <g transform="matrix(1, 0, 0, 1, 0, 0)">
                        <path fill="#EA4335" d="M20.64 12.2c0-.7-.06-1.36-.18-2H12v3.78h4.84c-.2.11-.2.22-.3.43-.54 1.45-1.8 2.5-3.32 2.5a5.18 5.18 0 0 1-4.85-3.6l-2.63 2.03A10.3 10.3 0 0 0 12 22.36c5.73 0 10.55-1.9 14.07-5.18l-5.43-4.98z" />
                        <path fill="#4285F4" d="M12 22.36c3.24 0 5.95-1.07 7.93-2.91l-5.43-4.98c-1.5.11-3.04-.15-4.21-.86a5.18 5.18 0 0 1-3.3-3.6L4.35 12.04a10.3 10.3 0 0 0 7.65 10.32z" />
                        <path fill="#FBBC05" d="M4.35 12.04c-.25-.75-.4-1.55-.4-2.38s.15-1.63.4-2.38L1.72 5.25A10.3 10.3 0 0 0 0 9.66c0 1.63.3 3.19.85 4.63l3.5-3.25z" />
                        <path fill="#34A853" d="M12 4.14c1.76 0 3.3.61 4.54 1.8l3.4-3.15C17.9 1.07 15.24 0 12 0 7.34 0 3.3 2.7 1.25 6.64l3.5 3.25A5.18 5.18 0 0 1 12 4.14z" />
                      </g>
                    </svg>
                    <span>{loading ? 'جاري الاتصال...' : 'الدخول المباشر بحساب Google'}</span>
                  </button>
                </div>

                {/* Divider */}
                <div className="relative flex items-center justify-center py-1">
                  <div className="border-t border-slate-200 dark:border-slate-700 w-full"></div>
                  <span className="bg-white dark:bg-[#111a2e] px-3 text-[11px] font-black text-slate-400 shrink-0">
                    أو الدخول بكلمة المرور الإدارية
                  </span>
                  <div className="border-t border-slate-200 dark:border-slate-700 w-full"></div>
                </div>

                {/* Direct Email & Password Login */}
                <form onSubmit={handleEmailLogin} className="space-y-3">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">
                      البريد الإلكتروني الإداري
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                        <Mail className="h-4 w-4 text-slate-400" />
                      </span>
                      <input
                        type="email"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="admin@example.com"
                        className="w-full pl-4 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-900 focus:outline-none text-right font-medium dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">
                      كلمة المرور الإدارية
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-slate-400" />
                      </span>
                      <input
                        type="password"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-4 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-900 focus:outline-none text-right font-medium dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="pt-1 flex flex-col gap-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 px-4 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>تسجيل الدخول الإداري</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ASSISTANT PORTAL */}
            {portalMode === 'ASSISTANT' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl text-xs text-indigo-900 dark:text-indigo-300 font-bold leading-relaxed flex items-start gap-2">
                  <Wrench className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    أدخل البريد الإلكتروني وكلمة المرور المحددة للمساعد الفني بالاتحاد للدخول المباشر بالصلاحيات المخصصة.
                  </div>
                </div>

                <form onSubmit={handleEmailLogin} className="space-y-3.5">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">
                      البريد الإلكتروني للمساعد الفني
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                        <Mail className="h-4 w-4 text-slate-400" />
                      </span>
                      <input
                        type="email"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="assistant@pyramids.com"
                        className="w-full pl-4 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-indigo-600 focus:outline-none text-right font-medium dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">
                      كلمة المرور الخاصة بالمساعد الفني
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-slate-400" />
                      </span>
                      <input
                        type="password"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-4 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-indigo-600 focus:outline-none text-right font-medium dark:text-white"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-indigo-900 hover:bg-indigo-800 text-white rounded-xl text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>تسجيل الدخول بصلاحيات المساعد الفني</span>
                  </button>
                </form>
              </div>
            )}

            {/* RESIDENT PORTAL */}
            {portalMode === 'RESIDENT' && (
              <div className="space-y-4">
                {/* Sub-tabs: Resident Login vs Join Request */}
                <div className="flex border-b border-slate-200 dark:border-slate-700 mb-3">
                  <button
                    type="button"
                    onClick={() => setResidentTab('login')}
                    className={`flex-1 py-2 font-bold text-xs border-b-2 text-center transition cursor-pointer ${
                      residentTab === 'login'
                        ? 'border-blue-900 text-blue-950 dark:text-white font-black'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    تسجيل دخول الساكن
                  </button>
                  <button
                    type="button"
                    onClick={() => setResidentTab('register')}
                    className={`flex-1 py-2 font-bold text-xs border-b-2 text-center transition cursor-pointer ${
                      residentTab === 'register'
                        ? 'border-blue-900 text-blue-950 dark:text-white font-black'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    طلب انضمام لعمارة 📝
                  </button>
                </div>

                {residentTab === 'login' ? (
                  <form onSubmit={handleEmailLogin} className="space-y-3.5">
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">البريد الإلكتروني للساكن</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                          <Mail className="h-4 w-4 text-slate-400" />
                        </span>
                        <input
                          type="email"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="name@example.com أو flat101@pyramids.com"
                          className="w-full pl-4 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-900 focus:outline-none text-right font-medium dark:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">كلمة المرور</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                          <Lock className="h-4 w-4 text-slate-400" />
                        </span>
                        <input
                          type="password"
                          required
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-4 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-900 focus:outline-none text-right font-medium dark:text-white"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>تسجيل دخول الساكن</span>
                    </button>

                    <div className="relative my-3 flex items-center justify-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                      </div>
                      <span className="relative px-3 bg-white dark:bg-[#111a2e] text-slate-400 text-[11px] font-bold">أو الدخول عبر Google</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 border-2 border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition font-black text-xs text-slate-700 dark:text-slate-200 shadow-xs cursor-pointer"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                        <g transform="matrix(1, 0, 0, 1, 0, 0)">
                          <path fill="#EA4335" d="M20.64 12.2c0-.7-.06-1.36-.18-2H12v3.78h4.84c-.2.11-.2.22-.3.43-.54 1.45-1.8 2.5-3.32 2.5a5.18 5.18 0 0 1-4.85-3.6l-2.63 2.03A10.3 10.3 0 0 0 12 22.36c5.73 0 10.55-1.9 14.07-5.18l-5.43-4.98z" />
                          <path fill="#4285F4" d="M12 22.36c3.24 0 5.95-1.07 7.93-2.91l-5.43-4.98c-1.5.11-3.04-.15-4.21-.86a5.18 5.18 0 0 1-3.3-3.6L4.35 12.04a10.3 10.3 0 0 0 7.65 10.32z" />
                          <path fill="#FBBC05" d="M4.35 12.04c-.25-.75-.4-1.55-.4-2.38s.15-1.63.4-2.38L1.72 5.25A10.3 10.3 0 0 0 0 9.66c0 1.63.3 3.19.85 4.63l3.5-3.25z" />
                          <path fill="#34A853" d="M12 4.14c1.76 0 3.3.61 4.54 1.8l3.4-3.15C17.9 1.07 15.24 0 12 0 7.34 0 3.3 2.7 1.25 6.64l3.5 3.25A5.18 5.18 0 0 1 12 4.14z" />
                        </g>
                      </svg>
                      <span>الدخول بحساب Google المسجل بالاتحاد</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResidentRegisterSubmit} className="space-y-3">
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">رقم الشقة / الوحدة</label>
                      <input
                        type="number"
                        required
                        value={flatNumber}
                        onChange={(e) => setFlatNumber(e.target.value)}
                        placeholder="مثال: 101 أو 204"
                        className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-900 focus:outline-none text-right font-medium dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">صفة الساكن</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setResidentType('OWNER')}
                          className={`py-2 text-xs font-bold rounded-xl border transition cursor-pointer ${
                            residentType === 'OWNER'
                              ? 'bg-blue-900 text-white border-blue-900'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          مالك الشقة
                        </button>
                        <button
                          type="button"
                          onClick={() => setResidentType('TENANT')}
                          className={`py-2 text-xs font-bold rounded-xl border transition cursor-pointer ${
                            residentType === 'TENANT'
                              ? 'bg-blue-900 text-white border-blue-900'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          مستأجر
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">اسم المالك</label>
                      <input
                        type="text"
                        required
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        placeholder="الاسم الثلاثي لمالك الوحدة"
                        className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-900 focus:outline-none text-right font-medium dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">رقم هاتف المالك (واتساب)</label>
                      <input
                        type="tel"
                        required
                        value={ownerPhone}
                        onChange={(e) => setOwnerPhone(e.target.value)}
                        placeholder="010XXXXXXXX"
                        className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-900 focus:outline-none text-right font-medium dark:text-white"
                      />
                    </div>

                    {residentType === 'TENANT' && (
                      <>
                        <div>
                          <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">اسم المستأجر</label>
                          <input
                            type="text"
                            required
                            value={tenantName}
                            onChange={(e) => setTenantName(e.target.value)}
                            placeholder="الاسم الكامل للمستأجر"
                            className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-900 focus:outline-none text-right font-medium dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">رقم هاتف المستأجر (واتساب)</label>
                          <input
                            type="tel"
                            required
                            value={tenantPhone}
                            onChange={(e) => setTenantPhone(e.target.value)}
                            placeholder="01XXXXXXXXX"
                            className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-900 focus:outline-none text-right font-medium dark:text-white"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">البريد الإلكتروني المطلوب للتسجيل</label>
                      <input
                        type="email"
                        required
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        placeholder="example@gmail.com"
                        className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-900 focus:outline-none text-right font-medium dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1 text-right">كلمة المرور المطلوبة</label>
                      <input
                        type="password"
                        required
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-900 focus:outline-none text-right font-medium dark:text-white"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <span>إرسال طلب الانضمام لاعتماده 📤</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center flex flex-col items-center gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">
            العمارة - المنظومة السحابية الموحدة
          </span>
        </div>
      </div>

      {/* In-App Confirmation Modal (Bypasses iframe window.confirm restrictions) */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 mx-auto bg-red-100 dark:bg-red-950/60 rounded-2xl flex items-center justify-center text-red-600 dark:text-red-400 shadow-inner">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {deleteModal.type === 'all' 
                  ? 'حذف جميع الاتحادات المسجلة' 
                  : deleteModal.type === 'single'
                  ? `حذف "${deleteModal.bName || 'الاتحاد'}"`
                  : 'إعادة ضبط التطبيق بالكامل'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                {deleteModal.type === 'all'
                  ? 'هل أنت متأكد من حذف كافة الاتحادات المسجلة الـ 3 نهائياً؟ سيتم تفريغ النظام والبدء بحالة المصنع لتسجيل اتحادك الجديد.'
                  : deleteModal.type === 'single'
                  ? 'هل أنت متأكد من حذف هذا الاتحاد وكافة سجلاته المالية وسكاناته نهائياً من النظام والسحابة؟'
                  : 'هل ترغب في مسح البيانات المؤقتة والذاكرة المحلية والبدء من جديد بحالة المصنع؟'}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmExecuteDelete}
                disabled={loading}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-md shadow-red-600/20"
              >
                {loading ? 'جاري الحذف...' : 'نعم، حذف نهائي'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteModal({ isOpen: false, type: 'all' })}
                disabled={loading}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-black transition cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
