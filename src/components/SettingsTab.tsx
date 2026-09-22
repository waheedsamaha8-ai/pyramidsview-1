import React, { useState, useEffect, useRef } from 'react';
import { AppConfig, UserRole, AdminResidentProfile } from '../types';
import { 
  Settings, Shield, Plus, Trash2, Check, X, Users, CreditCard, DollarSign, 
  Briefcase, Pencil, BookOpen, Edit3, Calendar, Calculator, CheckCircle2, 
  Moon, Sun, Palette, Sparkles, Home, UserCheck, Phone, BadgeCheck,
  Folder, FolderOpen, HardDrive, ExternalLink, FileSpreadsheet, Database, 
  RefreshCw, Cloud, Image as ImageIcon, Download, Upload, AlertCircle, Server,
  Building2, AlertTriangle
} from 'lucide-react';
import * as googleApi from '../services/googleApi';
import * as backupService from '../services/backupService';
import { requestGoogleDriveToken } from '../services/firebaseConfig';
import { getActiveBuilding, getAllBuildings, deleteBuilding, deleteAllBuildings } from '../services/buildingStore';

interface SettingsTabProps {
  config: AppConfig;
  role: UserRole;
  userEmail?: string;
  onSaveConfig: (updatedConfig: AppConfig) => void;
  onNotification?: (title: string, message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
  rules?: string[];
  onAddRule?: (ruleText: string) => void;
  onDeleteRule?: (index: number) => void;
  onOpenEditRulesModal?: () => void;
  isDarkMode?: boolean;
  onToggleTheme?: (isDark: boolean) => void;
  onRefreshAllData?: () => void;
  onConnectGoogleDrive?: () => void;
  isConnectingGoogle?: boolean;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  config,
  role,
  userEmail,
  onSaveConfig,
  onNotification,
  rules = [],
  onAddRule,
  onDeleteRule,
  onOpenEditRulesModal,
  isDarkMode = false,
  onToggleTheme,
  onRefreshAllData,
  onConnectGoogleDrive,
  isConnectingGoogle = false,
}) => {
  const isAdmin = role === 'ADMIN';
  const activeUserEmail = userEmail || config.presidentEmail || 'الحساب المعتمد حالياً';

  const getAuthUserUrl = (rawUrl?: string) => {
    if (!rawUrl || rawUrl === '#' || rawUrl === 'https://drive.google.com/' || rawUrl === 'https://docs.google.com/spreadsheets') {
      return rawUrl || 'https://drive.google.com/';
    }
    const email = activeUserEmail && activeUserEmail.includes('@') ? activeUserEmail : '';
    if (!email) return rawUrl;
    try {
      const url = new URL(rawUrl);
      url.searchParams.set('authuser', email);
      return url.toString();
    } catch {
      if (rawUrl.includes('authuser=')) return rawUrl;
      return rawUrl.includes('?') ? `${rawUrl}&authuser=${encodeURIComponent(email)}` : `${rawUrl}?authuser=${encodeURIComponent(email)}`;
    }
  };
  const [activeSubTab, setActiveSubTab] = useState<'settings' | 'storage' | 'permissions' | 'types'>('settings');
  const [newRuleInput, setNewRuleInput] = useState('');

  // Automatically reset to settings sub-tab if resident mode
  useEffect(() => {
    if (!isAdmin && activeSubTab === 'storage') {
      setActiveSubTab('settings');
    }
  }, [isAdmin, activeSubTab]);
  
  // Google Drive & Sheets Integration State
  const [driveFolders, setDriveFolders] = useState<googleApi.DriveFoldersMap | null>(() => googleApi.getCachedDriveFolders());
  const [isCheckingFolders, setIsCheckingFolders] = useState(false);
  const [folderSyncMessage, setFolderSyncMessage] = useState<string | null>(null);

  // Cloud & Local Backup States
  const [isBackingUpGoogle, setIsBackingUpGoogle] = useState(false);
  const [backupGoogleProgress, setBackupGoogleProgress] = useState<backupService.BackupProgress | null>(null);
  const [lastBackupInfo, setLastBackupInfo] = useState<any>(() => {
    try {
      const cached = localStorage.getItem('pyramids_last_google_backup');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  // Building Management Delete State (Admin Permissions Tab)
  const [buildingDeleteModal, setBuildingDeleteModal] = useState<{
    isOpen: boolean;
    type: 'single' | 'all';
    buildingName?: string;
  }>({ isOpen: false, type: 'single' });
  const [isDeletingBuilding, setIsDeletingBuilding] = useState(false);

  const handleConfirmDeleteBuilding = async () => {
    setIsDeletingBuilding(true);
    try {
      if (buildingDeleteModal.type === 'single') {
        const currentBuilding = getActiveBuilding();
        const bName = currentBuilding.name || config.buildingName || 'هذا الاتحاد';
        if (currentBuilding && currentBuilding.id) {
          await deleteBuilding(currentBuilding.id);
          onNotification?.('تم الحذف بنجاح', `تم حذف اتحاد "${bName}" وكافة سجلاته المالية وسكاناته بنجاح.`, 'success');
          setTimeout(() => {
            window.location.reload();
          }, 400);
        }
      } else {
        await deleteAllBuildings();
        onNotification?.('تم الحذف النهائي', 'تم حذف كافة الاتحادات والعمارات المسجلة نهائياً. التطبيق جاهز تماماً بحالة المصنع لتسجيل اتحاد جديد.', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 400);
      }
    } catch (err: any) {
      onNotification?.('خطأ في الحذف', err.message || 'تعذر إتمام عملية الحذف', 'error');
    } finally {
      setIsDeletingBuilding(false);
      setBuildingDeleteModal({ isOpen: false, type: 'single' });
    }
  };

  const handlePerformGoogleBackup = async () => {
    setIsBackingUpGoogle(true);
    setBackupGoogleProgress({
      status: 'syncing',
      message: 'جاري التحقق من ربط Google Drive...',
      step: 1,
      totalSteps: 6,
    });
    try {
      let token = googleApi.getAccessToken();
      if (!token || token === 'local-token') {
        setBackupGoogleProgress({
          status: 'syncing',
          message: 'جاري فتح نافذة مصادقة Google للحصول على التصريح...',
          step: 1,
          totalSteps: 6,
        });
        token = await requestGoogleDriveToken();
        if (token) {
          googleApi.setAccessToken(token);
        } else {
          throw new Error('لم يتم منح التصريح للوصول لـ Google Drive.');
        }
      }

      await backupService.performGoogleBackup((prog) => {
        setBackupGoogleProgress(prog);
      });
      const cached = localStorage.getItem('pyramids_last_google_backup');
      if (cached) setLastBackupInfo(JSON.parse(cached));
      onNotification?.('نسخ احتياطي ناجح', 'تم نسخ كافة الجداول والبيانات والصور إلى Google Drive و Sheets بنجاح.', 'success');
    } catch (err: any) {
      const errStr = (err?.message || '').toLowerCase();
      // If token expired or missing scope (and not access_denied / unverified user), retry once with fresh consent popup
      if (!errStr.includes('مستخدم اختبار') && !errStr.includes('access_denied') && !errStr.includes('access-denied') && (errStr.includes('scope') || errStr.includes('insufficient') || errStr.includes('permission') || errStr.includes('403') || errStr.includes('401') || errStr.includes('تسجيل الدخول'))) {
        try {
          setBackupGoogleProgress({
            status: 'syncing',
            message: 'تحديث تصريح Google Drive...',
            step: 1,
            totalSteps: 6,
          });
          const freshToken = await requestGoogleDriveToken();
          if (freshToken) {
            googleApi.setAccessToken(freshToken);
            await backupService.performGoogleBackup((prog) => {
              setBackupGoogleProgress(prog);
            });
            const cached = localStorage.getItem('pyramids_last_google_backup');
            if (cached) setLastBackupInfo(JSON.parse(cached));
            onNotification?.('نسخ احتياطي ناجح', 'تم نسخ كافة الجداول والبيانات والصور إلى Google Drive و Sheets بنجاح.', 'success');
            return;
          }
        } catch (retryErr: any) {
          err = retryErr;
        }
      }

      setBackupGoogleProgress({
        status: 'error',
        message: err.message || 'حدث خطأ أثناء إجراء النسخ الاحتياطي',
        step: 0,
        totalSteps: 6,
      });
      onNotification?.('خطأ في النسخ الاحتياطي', err.message || 'تعذر إتمام العملية', 'error');
    } finally {
      setIsBackingUpGoogle(false);
    }
  };

  const handleDownloadLocalBackup = async () => {
    try {
      await backupService.downloadLocalJsonBackup();
      onNotification?.('تصدير نسخة احتياطية', 'تم تجهيز وتحميل ملف النسخة الاحتياطية بصيغة JSON على جهازك.', 'success');
    } catch (err: any) {
      onNotification?.('خطأ في التصدير', 'تعذر تحميل النسخة الاحتياطية: ' + (err.message || ''), 'error');
    }
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsRestoring(true);
    setRestoreStatus('جاري قراءة ملف النسخة الاحتياطية...');
    try {
      const text = await file.text();
      await backupService.restoreFromJsonBackup(text, (msg) => {
        setRestoreStatus(msg);
      });
      setRestoreStatus('تمت استعادة البيانات بنجاح إلى قاعدة بيانات Firebase Firestore!');
      onNotification?.('استعادة البيانات', 'تم استيراد كافة السجلات بنجاح وتحديث قاعدة البيانات.', 'success');
      if (onRefreshAllData) {
        onRefreshAllData();
      }
    } catch (err: any) {
      setRestoreStatus('تعذر استعادة الملف: ' + (err.message || 'ملف غير صالح'));
      onNotification?.('فشل الاستعادة', err.message || 'ملف النسخة الاحتياطية غير صالح', 'error');
    } finally {
      setIsRestoring(false);
      if (restoreFileInputRef.current) {
        restoreFileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    const cached = googleApi.getCachedDriveFolders();
    if (cached) {
      setDriveFolders(cached);
    }
  }, []);

  const handleSyncDriveFolders = async () => {
    setIsCheckingFolders(true);
    setFolderSyncMessage(null);
    try {
      const updated = await googleApi.ensureDriveFoldersStructure(true);
      setDriveFolders(updated);
      setFolderSyncMessage('تم فحص ومزامنة كافة مجلدات Google Drive وجداول Google Sheets المرتبطة بحساب رئيس الاتحاد بنجاح!');
      setTimeout(() => setFolderSyncMessage(null), 5000);
    } catch (err: any) {
      setFolderSyncMessage('تعذر فحص المجلدات حالياً: ' + (err.message || 'حدث خطأ في الاتصال'));
    } finally {
      setIsCheckingFolders(false);
    }
  };

  // Accounting Settings state
  const defaultFeesMap: Record<string, number> = {
    'سكني': 400,
    'سكني مغلق': 200,
    'مفروش': 600,
    'إداري': 800,
    'تجاري': 500,
    'بدون تشطيب': 0,
  };

  const [accountingStartDate, setAccountingStartDate] = useState(config.accountingStartDate || '2026-01-01');
  const [defaultMonthlyFee, setDefaultMonthlyFee] = useState<number>(config.defaultMonthlyFee || 400);
  const [activityFees, setActivityFees] = useState<Record<string, number>>(() => ({
    ...defaultFeesMap,
    ...(config.activityDefaultFees || {})
  }));
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (config.accountingStartDate) setAccountingStartDate(config.accountingStartDate);
    if (config.defaultMonthlyFee) setDefaultMonthlyFee(config.defaultMonthlyFee);
    if (config.activityDefaultFees) {
      setActivityFees({ ...defaultFeesMap, ...config.activityDefaultFees });
    }
  }, [config]);

  // Input states for categories
  const [newActivityType, setNewActivityType] = useState('');
  const [newPaymentType, setNewPaymentType] = useState('');
  const [newExpenseType, setNewExpenseType] = useState('');

  const [editingItem, setEditingItem] = useState<{ key: 'activityTypes' | 'paymentTypes' | 'expenseTypes'; originalValue: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Editing Modal state for Types
  const [editingModal, setEditingModal] = useState<{
    key: 'activityTypes' | 'paymentTypes' | 'expenseTypes';
    originalValue: string;
    newValue: string;
    fee: number;
    error?: string;
  } | null>(null);

  const openEditModal = (key: 'activityTypes' | 'paymentTypes' | 'expenseTypes', value: string) => {
    const currentFee = activityFees[value] !== undefined ? activityFees[value] : (defaultFeesMap[value] ?? 400);
    setEditingModal({
      key,
      originalValue: value,
      newValue: value,
      fee: currentFee,
      error: undefined,
    });
  };

  const handleConfirmEditModal = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingModal) return;
    const trimmedVal = editingModal.newValue.trim();
    if (!trimmedVal) {
      setEditingModal(prev => prev ? { ...prev, error: 'يرجى إدخال اسم النوع' } : null);
      return;
    }

    const key = editingModal.key;
    const isDuplicate = config[key].some(item => item === trimmedVal && item !== editingModal.originalValue);
    if (isDuplicate) {
      setEditingModal(prev => prev ? { ...prev, error: 'هذا الاسم مستخدم بالفعل في القائمة' } : null);
      return;
    }

    const updatedList = config[key].map(item => item === editingModal.originalValue ? trimmedVal : item);
    
    let updatedActivityFees = { ...defaultFeesMap, ...(config.activityDefaultFees || {}), ...activityFees };
    if (key === 'activityTypes') {
      delete updatedActivityFees[editingModal.originalValue];
      updatedActivityFees[trimmedVal] = Number(editingModal.fee) >= 0 ? Number(editingModal.fee) : 0;
      setActivityFees(updatedActivityFees);
    }

    const updated: AppConfig = {
      ...config,
      [key]: updatedList,
      ...(key === 'activityTypes' ? { activityDefaultFees: updatedActivityFees } : {})
    };

    onSaveConfig(updated);
    if (onNotification) {
      const typeLabel = key === 'activityTypes' ? 'نوع الوحدة' : key === 'paymentTypes' ? 'نوع التحصيل' : 'نوع المصروف';
      onNotification('تم تعديل النوع بنجاح', `تم تحديث ${typeLabel} إلى "${trimmedVal}" بنجاح.`, 'success');
    }
    setEditingModal(null);
  };

  // Helper to start inline editing
  const startEditing = (key: 'activityTypes' | 'paymentTypes' | 'expenseTypes', value: string) => {
    setEditingItem({ key, originalValue: value });
    setEditValue(value);
  };

  // Helper to save inline editing
  const handleSaveEdit = (key: 'activityTypes' | 'paymentTypes' | 'expenseTypes') => {
    if (!editingItem || !editValue.trim()) return;
    const trimmedVal = editValue.trim();
    
    const exists = config[key].some(item => item === trimmedVal && item !== editingItem.originalValue);
    if (exists) return;

    const updatedList = config[key].map(item => item === editingItem.originalValue ? trimmedVal : item);
    
    let updatedActivityFees = { ...config.activityDefaultFees, ...activityFees };
    if (key === 'activityTypes') {
      const currentFee = updatedActivityFees[editingItem.originalValue] ?? 0;
      delete updatedActivityFees[editingItem.originalValue];
      updatedActivityFees[trimmedVal] = currentFee;
      setActivityFees(updatedActivityFees);
    }

    const updated = {
      ...config,
      [key]: updatedList,
      ...(key === 'activityTypes' ? { activityDefaultFees: updatedActivityFees } : {})
    };
    onSaveConfig(updated);
    if (onNotification) {
      onNotification('تم تعديل النوع بنجاح', `تم تعديل النوع إلى "${trimmedVal}" بنجاح.`, 'success');
    }
    setEditingItem(null);
    setEditValue('');
  };

  // Input states for admins and assistant
  const [newAdminEmail, setNewAdminEmail] = useState('');
  
  // Technical Assistant state
  const [assistantEmail, setAssistantEmail] = useState(config.assistantConfig?.email || '');
  const [assistantPassword, setAssistantPassword] = useState(config.assistantConfig?.password || '');
  const [assistantName, setAssistantName] = useState(config.assistantConfig?.name || 'المساعد الفني');
  const [assistantSavedSuccess, setAssistantSavedSuccess] = useState(false);

  useEffect(() => {
    if (config.assistantConfig) {
      setAssistantEmail(config.assistantConfig.email || '');
      setAssistantPassword(config.assistantConfig.password || '');
      setAssistantName(config.assistantConfig.name || 'المساعد الفني');
    }
  }, [config.assistantConfig]);

  const handleSaveAssistantConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!assistantEmail.trim() || !assistantPassword.trim()) return;

    const updated: AppConfig = {
      ...config,
      assistantConfig: {
        email: assistantEmail.trim().toLowerCase(),
        password: assistantPassword.trim(),
        name: assistantName.trim() || 'المساعد الفني',
      },
    };
    onSaveConfig(updated);
    setAssistantSavedSuccess(true);
    setTimeout(() => setAssistantSavedSuccess(false), 3000);
  };

  const handleRemoveAssistantConfig = () => {
    if (!isAdmin) return;
    const updated: AppConfig = {
      ...config,
    };
    delete updated.assistantConfig;
    onSaveConfig(updated);
    setAssistantEmail('');
    setAssistantPassword('');
    setAssistantName('المساعد الفني');
  };

  // Core update helper
  const updateConfig = (key: keyof AppConfig, updatedList: string[]) => {
    if (!isAdmin) return;
    const updated = {
      ...config,
      [key]: updatedList,
    };
    onSaveConfig(updated);
  };

  const handleSaveAccountingSettings = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;

    const updated: AppConfig = {
      ...config,
      accountingStartDate: accountingStartDate || '2026-01-01',
      defaultMonthlyFee: defaultMonthlyFee > 0 ? defaultMonthlyFee : 400,
      activityDefaultFees: activityFees,
    };
    onSaveConfig(updated);
    setSavedSuccess(true);
    if (onNotification) {
      onNotification('تم حفظ الإعدادات', 'تم حفظ وتطبيق تاريخ بدء المحاسبة والاشتراكات بنجاح.', 'success');
    }
    setTimeout(() => setSavedSuccess(false), 4000);
  };

  const handleResetDefaultActivityFees = () => {
    setActivityFees(defaultFeesMap);
    setDefaultMonthlyFee(400);
  };

  const handleAddActivityType = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newActivityType.trim();
    if (!trimmed || config.activityTypes.includes(trimmed)) return;
    
    const updatedActivityFees = {
      ...config.activityDefaultFees,
      [trimmed]: 0
    };
    setActivityFees(updatedActivityFees);
    
    const updated = {
      ...config,
      activityTypes: [...config.activityTypes, trimmed],
      activityDefaultFees: updatedActivityFees
    };
    onSaveConfig(updated);
    setNewActivityType('');
  };

  const handleAddPaymentType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPaymentType.trim() || config.paymentTypes.includes(newPaymentType.trim())) return;
    updateConfig('paymentTypes', [...config.paymentTypes, newPaymentType.trim()]);
    setNewPaymentType('');
  };

  const handleAddExpenseType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpenseType.trim() || config.expenseTypes.includes(newExpenseType.trim())) return;
    updateConfig('expenseTypes', [...config.expenseTypes, newExpenseType.trim()]);
    setNewExpenseType('');
  };

  const handleAddAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    const email = newAdminEmail.trim().toLowerCase();
    if (!email || config.admins.includes(email)) return;
    updateConfig('admins', [...config.admins, email]);
    setNewAdminEmail('');
  };

  const handleDeleteItem = (key: keyof AppConfig, item: string) => {
    if (!isAdmin) return;
    const currentVal = config[key];
    if (!Array.isArray(currentVal)) return;
    const filtered = currentVal.filter((x) => x !== item);
    
    let updatedActivityFees = { ...config.activityDefaultFees };
    if (key === 'activityTypes') {
      delete updatedActivityFees[item];
      setActivityFees(updatedActivityFees);
    }
    
    const updated = {
      ...config,
      [key]: filtered as string[],
      ...(key === 'activityTypes' ? { activityDefaultFees: updatedActivityFees } : {})
    };
    onSaveConfig(updated);
  };

  const handleAddNewRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleInput.trim()) return;
    if (onAddRule) {
      onAddRule(newRuleInput.trim());
      setNewRuleInput('');
    }
  };

  // Calculate elapsed months for summary
  const getElapsedMonths = () => {
    try {
      const start = new Date(accountingStartDate || '2026-01-01');
      const now = new Date();
      const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
      return Math.max(1, months);
    } catch {
      return 1;
    }
  };

  return (
    <div className="w-full space-y-3.5" dir="rtl">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs">
        <div className="text-right">
          <h2 className="text-lg font-black text-slate-900">إعدادات النظام والتحكم</h2>
          <p className="text-xs text-slate-500 mt-0.5 font-bold">تحديد تاريخ بدء المحاسبة وحساب المديونيات، تهيئة المصنفات، وإدارة الصلاحيات واللوائح.</p>
        </div>
      </div>

      {/* 4 Tabs Side-by-Side as explicitly requested */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/60 shadow-xs w-full">
        <button
          type="button"
          onClick={() => setActiveSubTab('settings')}
          className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'settings' 
              ? 'bg-blue-900 text-white shadow-sm' 
              : 'bg-white/90 text-slate-700 hover:bg-white hover:text-slate-950'
          }`}
        >
          <Calendar className={`w-4 h-4 ${activeSubTab === 'settings' ? 'text-white' : 'text-blue-800'}`} />
          <span>تبويب اعدادات</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('storage')}
          className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'storage' 
              ? 'bg-blue-900 text-white shadow-sm' 
              : 'bg-white/90 text-slate-700 hover:bg-white hover:text-slate-950'
          }`}
        >
          <Cloud className={`w-4 h-4 ${activeSubTab === 'storage' ? 'text-white' : 'text-emerald-700'}`} />
          <span>تبويب سحابة</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('permissions')}
          className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'permissions' 
              ? 'bg-blue-900 text-white shadow-sm' 
              : 'bg-white/90 text-slate-700 hover:bg-white hover:text-slate-950'
          }`}
        >
          <Shield className={`w-4 h-4 ${activeSubTab === 'permissions' ? 'text-white' : 'text-amber-700'}`} />
          <span>تبويب الصلاحيات</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('types')}
          className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'types' 
              ? 'bg-blue-900 text-white shadow-sm' 
              : 'bg-white/90 text-slate-700 hover:bg-white hover:text-slate-950'
          }`}
        >
          <Settings className={`w-4 h-4 ${activeSubTab === 'types' ? 'text-white' : 'text-purple-700'}`} />
          <span>تبويب الأنواع</span>
        </button>
      </div>

      {!isAdmin && (
        <div className="bg-yellow-50/60 border border-yellow-200/60 rounded-xl p-2.5 text-yellow-900 text-xs font-bold text-right leading-relaxed">
          💡 تنبيه: هذه الصفحة مخصصة لعرض القوانين والاختصاصات. وبصفتك ساكنًا، يمكنك الاطلاع عليها لمعرفة حقوقك وواجباتك، بينما ينفرد رئيس اتحاد الملاك بصلاحية التعديل والإضافة.
        </div>
      )}

      {/* SUBTAB 0: GENERAL ACCOUNTING SETTINGS (تاريخ بدء المحاسبة والاشتراكات) */}
      {activeSubTab === 'settings' && (
        <div className="space-y-3.5 text-right">

          {/* Card: Accounting start date and fee defaults */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 gap-2">
              <div className="text-right">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </span>
                  <span>تاريخ بدء المحاسبة واحتساب المديونيات والسداد</span>
                </h3>
                <p className="text-xs text-slate-500 font-bold mt-1 leading-relaxed">
                  حدد التاريخ الذي يبدأ منه التطبيق احتساب الشهور المستحقة والمديونيات على الوحدات السكنية ومقارنتها بما تم سداده.
                </p>
              </div>

              {savedSuccess && (
                <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black animate-fade-in self-start sm:self-auto">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>تم حفظ وتطبيق الإعدادات بنجاح!</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveAccountingSettings} className="space-y-4">
              {/* 1. Start Date Picker and Preset Buttons in One Row */}
              <div className="p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-2.5">
                <label className="block text-xs font-black text-slate-800">
                  تاريخ بدء المحاسبة (سنة - شهر - يوم):
                </label>
                
                {/* 3 Controls on One Single Row */}
                <div className="flex flex-row items-center gap-2 w-full">
                  <input
                    type="date"
                    value={accountingStartDate}
                    onChange={(e) => setAccountingStartDate(e.target.value)}
                    disabled={!isAdmin}
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs font-black text-slate-800 outline-none transition disabled:bg-slate-100 cursor-pointer text-center"
                    required
                  />

                  {/* Quick Preset Buttons */}
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => setAccountingStartDate('2026-01-01')}
                        className={`px-2.5 sm:px-3 py-2 text-[10.5px] sm:text-[11px] font-bold rounded-xl transition border cursor-pointer shrink-0 whitespace-nowrap shadow-2xs ${
                          accountingStartDate === '2026-01-01' 
                            ? 'bg-blue-900 text-white border-blue-900' 
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        بداية عام 2026 (2026-01-01)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          const y = now.getFullYear();
                          const m = String(now.getMonth() + 1).padStart(2, '0');
                          setAccountingStartDate(`${y}-${m}-01`);
                        }}
                        className={`px-2.5 sm:px-3 py-2 text-[10.5px] sm:text-[11px] font-bold rounded-xl transition border cursor-pointer shrink-0 whitespace-nowrap shadow-2xs ${
                          (() => {
                            const now = new Date();
                            const y = now.getFullYear();
                            const m = String(now.getMonth() + 1).padStart(2, '0');
                            return accountingStartDate === `${y}-${m}-01`;
                          })()
                            ? 'bg-blue-900 text-white border-blue-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        أول الشهر الحالي
                      </button>
                    </>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                  * تاريخ البدء الحالي المعتمد: <span className="text-blue-900 font-black">{accountingStartDate}</span> (يتم احتساب <span className="text-slate-900 font-black">{getElapsedMonths()}</span> شهر حتى تاريخ اليوم).
                </p>
              </div>

              {/* 3. Default Fees Per Activity Type */}
              <div className="p-4 bg-slate-50/90 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/70 pb-2.5">
                  <div>
                    <h4 className="text-xs font-black text-slate-900">
                      قيمة الاشتراك الافتراضي حسب نوع النشاط
                    </h4>
                    <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                      يتم تعيين هذه المبالغ تلقائياً عند إضافة أو تعديل الشقق وفقاً لنوع النشاط المحدد لكل وحدة
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={handleResetDefaultActivityFees}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-blue-900 border border-slate-200 rounded-xl text-[11px] font-bold transition cursor-pointer self-start sm:self-auto"
                    >
                      استعادة القيم الافتراضية المحددة
                    </button>
                  )}
                </div>

                 {/* Grid of Activity Default Fees */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                  {config.activityTypes.map((act) => {
                    const currentVal = activityFees[act] !== undefined 
                      ? activityFees[act] 
                      : (defaultFeesMap[act] || 0);

                    return (
                      <div
                        key={act}
                        className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-1.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-900"></span>
                            <span>{act}</span>
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {act === 'سكني' ? '(الافتراضي 400)' : act === 'سكني مغلق' ? '(الافتراضي 200)' : act === 'مفروش' ? '(الافتراضي 600)' : act === 'إداري' ? '(الافتراضي 800)' : act === 'تجاري' ? '(الافتراضي 500)' : act === 'بدون تشطيب' ? '(الافتراضي 0)' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="10"
                            value={currentVal}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setActivityFees(prev => ({ ...prev, [act]: val }));
                            }}
                            disabled={!isAdmin}
                            className="flex-1 px-2.5 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-lg text-xs font-black text-slate-900 outline-none text-right transition disabled:bg-slate-100"
                            placeholder="المبلغ"
                          />
                          <span className="text-[11px] font-bold text-slate-500 shrink-0">ج.م / شهر</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              {isAdmin && (
                <div className="flex flex-col sm:flex-row items-center justify-between pt-3 gap-2 border-t border-slate-100">
                  {savedSuccess ? (
                    <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black animate-fade-in w-full sm:w-auto">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>تم حفظ وتطبيق تاريخ بدء المحاسبة والاشتراكات بنجاح!</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-bold hidden sm:inline">
                      يتم حفظ وتطبيق الإعدادات على كشوف الحسابات فور الضغط.
                    </span>
                  )}

                  <button
                    type="submit"
                    className={`w-full sm:w-auto px-5 py-2.5 text-xs font-black rounded-xl shadow-sm hover:shadow transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 ${
                      savedSuccess
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-blue-900 hover:bg-blue-950 text-white'
                    }`}
                  >
                    {savedSuccess ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>تم الحفظ بنجاح ✓</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>حفظ وتطبيق تاريخ بدء المحاسبة والاشتراكات</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Educational Calculation Box */}
          <div className="bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-200/70 space-y-2">
            <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-blue-900" />
              <span>كيف يعمل احتساب رصيد ومديونية كل شقة؟</span>
            </h4>
            <ul className="text-xs text-slate-600 font-bold space-y-1.5 list-disc list-inside leading-relaxed">
              <li>يقوم النظام بعدّ الأشهر المنقضية من <span className="text-blue-900 font-black">تاريخ بدء المحاسبة</span> المحدد أعلاه حتى الشهر الحالي.</li>
              <li>يتم ضرب عدد الأشهر في <span className="text-slate-800 font-black">الرسوم الشهرية</span> المقررة للشقة لمعرفة إجمالي المبالغ المستحقة.</li>
              <li>يقوم النظام بجمع كل المبالغ المسددة في كشف التحصيلات لنفس الوحدة ومقارنتها بإجمالي المستحقات.</li>
              <li>إذا كان هناك عجز في السداد، يظهر الرصيد <span className="text-red-600 font-black">بالسالب وباللون الأحمر</span> (مديونية مستحقة). وإذا سدد الساكن مقدماً، يظهر الرصيد <span className="text-emerald-700 font-black">بالموجب وباللون الأخضر</span>.</li>
            </ul>
          </div>
        </div>
      )}

      {/* SUBTAB: GOOGLE DRIVE & GOOGLE SHEETS STORAGE */}
      {isAdmin && activeSubTab === 'storage' && (
        <div className="space-y-4 text-right">
          {/* Header Card */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-3">
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <Cloud className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <span>سحابة التخزين وقواعد البيانات (Google Drive & Google Sheets)</span>
                    </h3>
                    <p className="text-xs text-slate-500 font-bold mt-0.5">
                      النظام مرتبط ومؤمن بحساب Google المسجل والمفعل للنظام ({activeUserEmail}).
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3.5 py-1.5 rounded-xl border border-emerald-200/80 text-xs font-black self-start sm:self-auto">
                <BadgeCheck className="w-4 h-4 text-emerald-600" />
                <span>الحساب المرتبط: {activeUserEmail}</span>
              </div>
            </div>

            {folderSyncMessage && (
              <div className="p-3 bg-blue-50 text-blue-900 rounded-xl border border-blue-200 text-xs font-black flex items-center gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-blue-700 shrink-0" />
                <span>{folderSyncMessage}</span>
              </div>
            )}

            {/* Main Drive & Sheets Quick Access */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Main Drive Folder Card */}
              <div className="p-4 bg-gradient-to-br from-blue-50/80 to-slate-50 rounded-2xl border border-blue-100 flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                      <Folder className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] font-black px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                      المجلد الجذري
                    </span>
                  </div>
                  <h4 className="text-xs font-black text-slate-900">مجلد اتحاد الملاك الرئيسي (Google Drive)</h4>
                  <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                    المجلد الأساسي الذي يضم جدول البيانات المركزي وكافة مجلدات الصور والإيصالات المصنفة تلقائياً.
                  </p>
                </div>

                <a
                  href={getAuthUserUrl(driveFolders?.rootFolderUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 bg-blue-900 hover:bg-blue-950 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح المجلد في Google Drive</span>
                </a>
              </div>

              {/* Main Google Spreadsheet Card */}
              <div className="p-4 bg-gradient-to-br from-emerald-50/80 to-slate-50 rounded-2xl border border-emerald-100 flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                      <FileSpreadsheet className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                      جدول البيانات
                    </span>
                  </div>
                  <h4 className="text-xs font-black text-slate-900">جدول البيانات المركزي (Google Sheets)</h4>
                  <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                    ملف شيت الإدارة المركزي "Pyramids View 1 - Management Database" المحفوظ على حسابك ({activeUserEmail}).
                  </p>
                </div>

                <a
                  href={getAuthUserUrl(driveFolders?.spreadsheetUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح قاعدة البيانات في Google Sheets</span>
                </a>
              </div>
            </div>

            {/* Sync / Re-auth Buttons */}
            {isAdmin && (
              <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
                {onConnectGoogleDrive && (
                  <button
                    type="button"
                    onClick={onConnectGoogleDrive}
                    disabled={isConnectingGoogle}
                    className="px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    <Cloud className={`w-3.5 h-3.5 ${isConnectingGoogle ? 'animate-spin' : ''}`} />
                    <span>{isConnectingGoogle ? 'جاري الربط...' : 'ربط أو تغيير حساب Google Drive 🔗'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSyncDriveFolders}
                  disabled={isCheckingFolders}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingFolders ? 'animate-spin' : ''}`} />
                  <span>{isCheckingFolders ? 'جاري فحص وتحديث المجلدات...' : 'إعادة فحص ومزامنة المجلدات 🔄'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Subfolders Grid Card */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4 text-blue-900" />
                <span>فولدرات تصنيف وحفظ الصور والبيانات تلقائياً</span>
              </h3>
              <p className="text-[11px] text-slate-500 font-bold mt-1">
                يقوم النظام تلقائياً بتوجيه وتخزين كل صورة أو مستند في الفولدر الخاص به داخل Google Drive فور التقاطها أو رفعها:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* 1. Sheets Folder */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-emerald-100 text-emerald-800 flex items-center justify-center">
                      <Database className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-black text-slate-900">قواعد البيانات والجداول</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">يضم ملف قاعدة بيانات النظام الرئيسي</p>
                </div>
                <a
                  href={getAuthUserUrl(driveFolders?.sheetsFolderUrl || driveFolders?.rootFolderUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 flex items-center justify-between cursor-pointer"
                >
                  <span>عرض المجلد</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>

              {/* 2. Receipts Folder */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-blue-100 text-blue-800 flex items-center justify-center">
                      <ImageIcon className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-black text-slate-900">صور إيصالات السداد</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">تخزين صور إيصالات التحصيل وسندات القبض</p>
                </div>
                <a
                  href={getAuthUserUrl(driveFolders?.receiptsFolderUrl || driveFolders?.rootFolderUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 flex items-center justify-between cursor-pointer"
                >
                  <span>عرض المجلد</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>

              {/* 3. Expenses Folder */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-amber-100 text-amber-800 flex items-center justify-center">
                      <CreditCard className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-black text-slate-900">صور فواتير المصروفات</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">فواتير الكهرباء والمياه وقطع الغيار والصيانة</p>
                </div>
                <a
                  href={getAuthUserUrl(driveFolders?.expensesFolderUrl || driveFolders?.rootFolderUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 flex items-center justify-between cursor-pointer"
                >
                  <span>عرض المجلد</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>

              {/* 4. Complaints Folder */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-rose-100 text-rose-800 flex items-center justify-center">
                      <Shield className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-black text-slate-900">صور الشكاوى والصيانة</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">صور بلاغات الأعطال وشكاوى السكان المرفوعة</p>
                </div>
                <a
                  href={getAuthUserUrl(driveFolders?.complaintsFolderUrl || driveFolders?.rootFolderUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 flex items-center justify-between cursor-pointer"
                >
                  <span>عرض المجلد</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>

              {/* 5. Chat Attachments Folder */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-purple-100 text-purple-800 flex items-center justify-center">
                      <Folder className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-black text-slate-900">صور ومرفقات المحادثات</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">المرفقات والصور المتبادلة في غرفة المحادثة</p>
                </div>
                <a
                  href={getAuthUserUrl(driveFolders?.chatFolderUrl || driveFolders?.rootFolderUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 flex items-center justify-between cursor-pointer"
                >
                  <span>عرض المجلد</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>
            </div>
          </div>

          {/* Real-time Firebase Firestore Status Card */}
          <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl shadow-sm space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-800/80 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-white/10 text-amber-300 flex items-center justify-center">
                  <Server className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-xs sm:text-sm font-black flex items-center gap-1.5">
                    <span>قاعدة بيانات Firebase Firestore السحابية</span>
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  </h4>
                  <p className="text-[11px] text-blue-200 font-bold">
                    نظام التخزين السحابي الفوري المجاني - متصل ويعمل بنشاط
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-xl text-[11px] font-black self-start sm:self-auto">
                مزامنة فورية حية (Realtime)
              </span>
            </div>

            <p className="text-[11px] text-blue-100 font-medium leading-relaxed">
              جميع التعديلات والتحصيلات والمصروفات والرسائل تسجل فوراً في السحابة المجانية لـ Firebase، مع إمكانية استخدام زر النسخ الاحتياطي أدناه لحفظ نسخة مستقلة إضافية في Google Drive و Google Sheets.
            </p>
          </div>

          {/* Backup & Restore Controls (Google Drive & Local JSON) */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-blue-900" />
                  <span>النسخ الاحتياطي وحفظ البيانات (Google Backup & Local Backup)</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  حفظ نسخة من الجداول والبيانات والصور على حساب جوجل درايف وشيتس أو تنزيل ملف JSON محلي.
                </p>
              </div>

              {lastBackupInfo && (
                <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-2.5 py-1 rounded-lg">
                  آخر بيك اب سحابي: {new Date(lastBackupInfo.lastBackupDate).toLocaleDateString('ar-EG')} - {new Date(lastBackupInfo.lastBackupDate).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {/* Google Drive / Sheets Cloud Backup Action */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-blue-700" />
                    <span>نسخ احتياطي سحابي كامل إلى Google Drive & Google Sheets</span>
                  </h4>
                  <p className="text-[11px] text-slate-600 font-medium">
                    يقوم بحفظ وتحديث كافة كشوفات السكان، التحصيلات، فواتير المصروفات، وبلاغات الصيانة في جداول Sheets، ورفع كافة صور المستندات والإيصالات إلى Google Drive.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handlePerformGoogleBackup}
                  disabled={isBackingUpGoogle}
                  className="px-4 py-2.5 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isBackingUpGoogle ? 'animate-spin' : ''}`} />
                  <span>{isBackingUpGoogle ? 'جاري عمل النسخة الاحتياطية...' : 'أخذ نسخة احتياطية سحابية الآن ☁️'}</span>
                </button>
              </div>

              {/* Progress message */}
              {backupGoogleProgress && (
                <div className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  backupGoogleProgress.status === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : backupGoogleProgress.status === 'error'
                    ? 'bg-red-50 text-red-900 border-red-300'
                    : 'bg-white text-blue-900 border-blue-300 animate-pulse'
                }`}>
                  {backupGoogleProgress.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                  {backupGoogleProgress.status === 'error' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
                  {backupGoogleProgress.status === 'syncing' && <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />}
                  <div className="flex-1">
                    <div>{backupGoogleProgress.message}</div>
                    {backupGoogleProgress.details && (
                      <div className="text-[10px] text-slate-600 font-normal mt-0.5">{backupGoogleProgress.details}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Local JSON Backup & Restore Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Download JSON file */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-slate-700" />
                    <span>تنزيل نسخة احتياطية (ملف JSON محلي)</span>
                  </h4>
                  <p className="text-[10px] text-slate-500 font-medium">
                    تنزيل ملف كامل لكافة بيانات العقار والسجلات والرسائل والإعدادات لحفظه بأمان على هاتفك أو حاسوبك الشخصي.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadLocalBackup}
                  className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-blue-900" />
                  <span>تحميل ملف النسخة الاحتياطية (JSON) 💾</span>
                </button>
              </div>

              {/* Restore JSON file */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Upload className="w-4 h-4 text-slate-700" />
                    <span>استرجاع البيانات من نسخة احتياطية</span>
                  </h4>
                  <p className="text-[10px] text-slate-500 font-medium">
                    استيراد ملف JSON نسخة احتياطية سابقة وكتابة البيانات مباشرة إلى قاعدة بيانات Firebase السحابية.
                  </p>
                </div>

                <input
                  type="file"
                  ref={restoreFileInputRef}
                  onChange={handleRestoreFileChange}
                  accept=".json,application/json"
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => restoreFileInputRef.current?.click()}
                  disabled={isRestoring}
                  className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-700" />
                  <span>{isRestoring ? 'جاري الاسترجاع...' : 'اختيار ملف النسخة الاحتياطية واسترجاعه 📥'}</span>
                </button>
              </div>
            </div>

            {/* Restore Status banner */}
            {restoreStatus && (
              <div className="p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{restoreStatus}</span>
              </div>
            )}
          </div>

          {/* Info & Security Guarantee */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl text-xs text-emerald-950 font-bold space-y-1.5 leading-relaxed">
            <div className="flex items-center gap-2 text-emerald-900 font-black">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>ضمان استمرارية وأمان البيانات</span>
            </div>
            <p>
              يتم حفظ ومزامنة كافة السجلات في قواعد البيانات السحابية وجدول Google Sheets المرتبط بالحساب المسجل ({activeUserEmail}). هذا يضمن حفظ كافة البيانات في حسابك بشكل مستقل ودائم، مع إمكانية الوصول للملفات وتصديرها أو مشاركتها في أي وقت من هاتفك أو حاسوبك عبر تطبيقات Google الرسمية.
            </p>
          </div>
        </div>
      )}

      {/* SUBTAB 1: MANAGING TYPES AND CATEGORIES */}
      {activeSubTab === 'types' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-right">
          {/* 1. Apartment Types */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Users className="w-3.5 h-3.5" />
              </span>
              <h3 className="text-xs font-black text-slate-900">إدارة أنواع الوحدات</h3>
            </div>
            
            <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">تعريف الأنشطة المخصصة للشقق والمنشآت وتصنيفها.</p>

            {isAdmin && (
              <form onSubmit={handleAddActivityType} className="flex gap-1">
                <button
                  type="submit"
                  className="px-2.5 bg-blue-900 text-white rounded-lg font-bold text-xs hover:bg-blue-950 transition flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  placeholder="نوع جديد (مثال: عيادة)"
                  value={newActivityType}
                  onChange={(e) => setNewActivityType(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-100 focus:bg-white rounded-lg text-xs outline-none text-right font-bold transition"
                  required
                />
              </form>
            )}

            <div className="space-y-1.5">
              {config.activityTypes.map((type) => {
                const fee = activityFees[type] !== undefined ? activityFees[type] : (defaultFeesMap[type] ?? 400);
                return (
                  <div key={type} className="flex items-center justify-between p-2 bg-slate-50/70 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl transition gap-2">
                    {isAdmin ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem('activityTypes', type)}
                          className="p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition cursor-pointer"
                          title="حذف هذا النوع"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal('activityTypes', type)}
                          className="p-1.5 text-blue-700 hover:bg-blue-100/70 hover:text-blue-900 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-bold bg-blue-50/80 px-2"
                          title="تعديل هذا النوع والاشتراك"
                        >
                          <Pencil className="w-3 h-3 text-blue-800" />
                          <span>تعديل</span>
                        </button>
                      </div>
                    ) : (
                      <span className="w-4" />
                    )}

                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                        {fee} ج.م
                      </span>
                      <span className="text-xs font-black text-indigo-950 truncate">{type}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Payment Types */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CreditCard className="w-3.5 h-3.5" />
              </span>
              <h3 className="text-xs font-black text-slate-900">إدارة أنواع التحصيلات</h3>
            </div>

            <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">تحديد فئات الإيرادات والاشتراكات المقررة على سكان العمارة بانتظام.</p>

            {isAdmin && (
              <form onSubmit={handleAddPaymentType} className="flex gap-1">
                <button
                  type="submit"
                  className="px-2.5 bg-blue-900 text-white rounded-lg font-bold text-xs hover:bg-blue-950 transition flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  placeholder="نوع تحصيل (مثال: صيانة غاز)"
                  value={newPaymentType}
                  onChange={(e) => setNewPaymentType(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-100 focus:bg-white rounded-lg text-xs outline-none text-right font-bold transition"
                  required
                />
              </form>
            )}

            <div className="space-y-1.5">
              {config.paymentTypes.map((type) => {
                return (
                  <div key={type} className="flex items-center justify-between p-2 bg-slate-50/70 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl transition gap-2">
                    {isAdmin ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem('paymentTypes', type)}
                          className="p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition cursor-pointer"
                          title="حذف هذا النوع"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal('paymentTypes', type)}
                          className="p-1.5 text-emerald-800 hover:bg-emerald-100/70 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-bold bg-emerald-50/80 px-2"
                          title="تعديل هذا النوع"
                        >
                          <Pencil className="w-3 h-3 text-emerald-800" />
                          <span>تعديل</span>
                        </button>
                      </div>
                    ) : (
                      <span className="w-4" />
                    )}
                    <span className="text-xs font-black text-emerald-950 truncate">{type}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Expense Types */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5" />
              </span>
              <h3 className="text-xs font-black text-slate-900">إدارة أنواع المصروفات</h3>
            </div>

            <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">تعريف بنود الصرف وأوجه النفقات المسموح بها من قبل اتحاد الملاك.</p>

            {isAdmin && (
              <form onSubmit={handleAddExpenseType} className="flex gap-1">
                <button
                  type="submit"
                  className="px-2.5 bg-blue-900 text-white rounded-lg font-bold text-xs hover:bg-blue-950 transition flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  placeholder="بند مصروف (مثال: صيانة جراج)"
                  value={newExpenseType}
                  onChange={(e) => setNewExpenseType(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-100 focus:bg-white rounded-lg text-xs outline-none text-right font-bold transition"
                  required
                />
              </form>
            )}

            <div className="space-y-1.5">
              {config.expenseTypes.map((type) => {
                return (
                  <div key={type} className="flex items-center justify-between p-2 bg-slate-50/70 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl transition gap-2">
                    {isAdmin ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem('expenseTypes', type)}
                          className="p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition cursor-pointer"
                          title="حذف هذا النوع"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal('expenseTypes', type)}
                          className="p-1.5 text-amber-900 hover:bg-amber-100/70 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-bold bg-amber-50/80 px-2"
                          title="تعديل هذا النوع"
                        >
                          <Pencil className="w-3 h-3 text-amber-800" />
                          <span>تعديل</span>
                        </button>
                      </div>
                    ) : (
                      <span className="w-4" />
                    )}
                    <span className="text-xs font-black text-amber-950 truncate">{type}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: RESPONSIBILITIES AND PERMISSIONS */}
      {activeSubTab === 'permissions' && (
        <div className="space-y-3 text-right">
          {/* Rules Management Card inside Permissions */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3 text-right">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-2.5 gap-2">
              <div className="text-right">
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-yellow-700" />
                  <span>تعديل وصياغة لائحة وتعليمات إدارة العمارة ({rules.length})</span>
                </h3>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                  يمكن لرئيس الاتحاد إضافة وتعديل وحذف بنود وقواعد حسن الجوار المنظمة للعقار ليطلع عليها جميع السكان.
                </p>
              </div>
              {onOpenEditRulesModal && isAdmin && (
                <button
                  onClick={onOpenEditRulesModal}
                  className="px-3 py-1.5 bg-blue-50 text-blue-900 hover:bg-blue-100 rounded-xl text-xs font-bold transition flex items-center gap-1.5 self-start cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>فتح نافذة التعديل المنفصلة</span>
                </button>
              )}
            </div>

            {isAdmin && (
              <form onSubmit={handleAddNewRule} className="flex gap-1.5">
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-blue-900 text-white rounded-xl font-bold text-xs hover:bg-blue-950 active:scale-[0.98] transition flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة مادة للائحة</span>
                </button>
                <input
                  type="text"
                  placeholder="اكتب نص المادة أو التعليمات الجديدة (مثال: يمنع استخدام المصعد لنقل مواد البناء الثقيلة)..."
                  value={newRuleInput}
                  onChange={(e) => setNewRuleInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-xl text-xs outline-none text-right font-bold transition"
                  required
                />
              </form>
            )}

            {/* List of rules */}
            <div className="space-y-2">
              {rules.length === 0 ? (
                <p className="text-center text-xs text-slate-400 font-bold py-4">لا توجد مواد تعليمات مسجلة حالياً.</p>
              ) : (
                rules.map((rule, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2.5 p-2.5 bg-slate-50/60 hover:bg-slate-50 border border-slate-100 rounded-xl transition">
                    {isAdmin && onDeleteRule && (
                      <button
                        onClick={() => onDeleteRule(idx)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer shrink-0"
                        title="حذف البند"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <div className="flex-1 text-right">
                      <span className="inline-block px-1.5 py-0.5 bg-yellow-50 text-yellow-900 border border-yellow-200/50 text-[10px] font-black rounded-md ml-2">
                        مادة {idx + 1}
                      </span>
                      <span className="text-xs text-slate-800 font-bold leading-relaxed">{rule}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Split roles comparison grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            
            {/* 1. Admin/President Capabilities */}
            <div className="bg-white p-3.5 sm:p-4.5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b pb-2 mb-1">
                <span className="px-2.5 py-0.5 bg-blue-900 text-white text-[10px] font-black rounded-md">رئيس الاتحاد (المدير الإداري)</span>
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <span>صلاحيات رئيس الاتحاد</span>
                  <Shield className="w-3.5 h-3.5 text-blue-950 fill-blue-50" />
                </h3>
              </div>

              <p className="text-xs text-slate-500 font-bold leading-relaxed">يتمتع رئيس الاتحاد بكامل الصلاحيات الإدارية والرقابية والمالية لضمان سلامة تشغيل العقار ومصالح الملاك العليا.</p>

              <div className="space-y-2">
                {[
                  'إدارة وإضافة وحذف وحساب شؤون السكان',
                  'تسجيل، تعديل، وحذف كشوفات التحصيلات والاشتراكات المعتمدة',
                  'تسجيل وتحديث وفلترة وحذف فواتير المصروفات والنفقات',
                  'صياغة وإدارة اللائحة الداخلية وجدول العقوبات للعمارة',
                  'صياغة ونشر القرارات والاستبيانات التفاعلية وتصفية الأصوات',
                  'تنسيق وإقرار الأجندة والأحداث في تقويم العمارة التفاعلي',
                  'إرسال التنبيهات والإشعارات العامة لكافة السكان دفعة واحدة',
                  'تعديل وإعادة تهيئة إعدادات النظام ومصنفات الوحدات والتحصيلات',
                ].map((cap, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="mt-0.5 w-3.5 h-3.5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                    <span className="text-xs text-slate-700 font-bold leading-normal">{cap}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Resident Capabilities */}
            <div className="bg-white p-3.5 sm:p-4.5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b pb-2 mb-1">
                <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-black rounded-md">ساكن / مالك وحدة</span>
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <span>صلاحيات الساكن والشفافية المتاحة</span>
                  <Briefcase className="w-3.5 h-3.5 text-amber-600" />
                </h3>
              </div>

              <p className="text-xs text-slate-500 font-bold leading-relaxed">يستمتع الساكن بنظام كامل من الشفافية لتبادل الآراء والمشاركة المجتمعية مع حماية الخصوصية الشخصية.</p>

              <div className="space-y-2 border-b pb-3 mb-2">
                {/* Granted permissions */}
                {[
                  'الاطلاع الشامل على كشوف المبالغ المحصلة والتحققات المالية (للقراءة فقط)',
                  'الاطلاع التفصيلي على فواتير ومستندات المصروفات (للقراءة فقط)',
                  'المشاركة والتصويت الفعال في استبيانات القرارات العامة والجمعية العمومية',
                  'كتابة ونشر الشكاوى والتعليقات والتحذيرات على لوحة النقاشات المفتوحة',
                  'المحادثة والتفاعل الفوري مع الجيران في صفحة الدردشة الفورية',
                  'الاطلاع على لوائح وتعليمات العمارة للقراءة فقط',
                  'تقديم ومتابعة طلبات الصيانة الخاصة بالوحدة وتلقي الإشعار فور إصلاحها',
                ].map((cap, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="mt-0.5 w-3.5 h-3.5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                    <span className="text-xs text-slate-700 font-bold leading-normal">{cap}</span>
                  </div>
                ))}
              </div>

              {/* Explicit Restrictions */}
              <div className="space-y-1.5">
                <h4 className="text-[11px] font-extrabold text-red-600 mb-1">🚫 يمنع تماماً على الساكن:</h4>
                {[
                  'إضافة أو حذف أو تعديل بيانات وحسابات شقق الجيران الآخرين',
                  'إضافة أو تعديل أو إلغاء قيود التحصيل أو إيصالات الدفع الرسمية',
                  'تسجيل أو تعديل أو إلغاء فواتير ومصروفات العقار الموحدة',
                  'تعديل أو حذف أو تلاعب بلوائح وتعليمات اتحاد الملاك الأساسية',
                ].map((cap, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="mt-0.5 w-3.5 h-3.5 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                      <X className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                    <span className="text-xs text-slate-500 font-semibold leading-normal">{cap}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Executive users configuration (admins and managers list) */}
          {isAdmin && (
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-3">
              
              {/* Admins Emails config */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-black text-slate-800 border-b pb-1.5">تفويض بريد إلكتروني لرئاسة الاتحاد (الأدمن)</h4>
                <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">أدخل بريد جوجل الإلكتروني الخاص برئيس اتحاد الملاك لمنحه كل الصلاحيات.</p>
                
                <form onSubmit={handleAddAdmin} className="flex gap-1.5">
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-blue-900 text-white text-xs font-bold rounded-lg hover:bg-blue-950 transition cursor-pointer"
                  >
                    تفعيل تفويض أدمن
                  </button>
                  <input
                    type="email"
                    placeholder="email@gmail.com"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-100 focus:bg-white rounded-lg text-xs outline-none text-left font-bold transition"
                    required
                  />
                </form>

                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {config.admins.map((email) => (
                    <div key={email} className="flex items-center justify-between p-1.5 bg-slate-50 rounded-lg border border-slate-100">
                      <button
                        onClick={() => handleDeleteItem('admins', email)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded-md transition cursor-pointer disabled:opacity-40"
                        title="إلغاء التفويض"
                        disabled={config.admins.length <= 1} // Protect at least one main admin
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <span className="text-[10px] font-bold text-slate-700">{email}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Technical Assistant Config */}
              <div className="space-y-2.5 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 col-span-1 md:col-span-1">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700 pb-2">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                      <span>تفويض مساعد فني</span>
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold leading-relaxed mt-0.5">
                      تحديد إيميل وباسورد المساعد الفني لتسجيل التحصيل والمصروفات ومتابعة الصيانة والدليل والتقويم دون صلاحيات التعديل أو الحذف.
                    </p>
                  </div>
                  {config.assistantConfig?.email && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md border border-emerald-200 shrink-0">
                      تفويض مفعل
                    </span>
                  )}
                </div>

                <form onSubmit={handleSaveAssistantConfig} className="space-y-2.5 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 block mb-1">البريد الإلكتروني (Email)</label>
                      <input
                        type="email"
                        placeholder="assistant@pyramids.com"
                        value={assistantEmail}
                        onChange={(e) => setAssistantEmail(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-left"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 block mb-1">كلمة المرور (Password)</label>
                      <input
                        type="text"
                        placeholder="كلمة المرور"
                        value={assistantPassword}
                        onChange={(e) => setAssistantPassword(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-left"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 block mb-1">اسم المساعد الفني (اختياري)</label>
                    <input
                      type="text"
                      placeholder="مثال: المساعد الفني"
                      value={assistantName}
                      onChange={(e) => setAssistantName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-right"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1 gap-2">
                    {config.assistantConfig?.email ? (
                      <button
                        type="button"
                        onClick={handleRemoveAssistantConfig}
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>إلغاء التفويض</span>
                      </button>
                    ) : <div />}

                    <button
                      type="submit"
                      className="px-3.5 py-1.5 bg-blue-900 hover:bg-blue-950 text-white text-xs font-black rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>حفظ تفويض المساعد</span>
                    </button>
                  </div>

                  {assistantSavedSuccess && (
                    <div className="bg-emerald-50 text-emerald-800 text-[10px] font-bold p-2 rounded-lg border border-emerald-200 text-center">
                      تم تفعيل وحفظ تفويض المساعد الفني بنجاح!
                    </div>
                  )}
                </form>
              </div>

              {/* Building Management & Union Deletion Section */}
              <div className="bg-red-50/50 dark:bg-red-950/20 border-2 border-red-200 dark:border-red-900/40 p-4 rounded-2xl col-span-1 md:col-span-2 space-y-3 text-right">
                <div className="flex items-center justify-between border-b border-red-200 dark:border-red-900/50 pb-2.5">
                  <span className="px-2.5 py-0.5 bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 text-[10px] font-black rounded-md border border-red-200 dark:border-red-900">
                    صلاحيات الإدارة العليا
                  </span>
                  <h4 className="text-xs font-black text-red-950 dark:text-red-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <span>إدارة وإلغاء الاتحادات المسجلة (للرئيس فقط)</span>
                  </h4>
                </div>

                <p className="text-[11px] text-red-800 dark:text-red-300 font-bold leading-relaxed">
                  يمكن لرئيس الاتحاد الإداري حذف الاتحاد المسجل حالياً أو إلغاء جميع الاتحادات المسجلة وإعادة ضبط المنظومة السحابية.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const activeB = getActiveBuilding();
                      setBuildingDeleteModal({
                        isOpen: true,
                        type: 'single',
                        buildingName: activeB.name || config.buildingName || 'هذا الاتحاد',
                      });
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف الاتحاد الحالي النشط ("{config.buildingName || 'العمارة'}")</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBuildingDeleteModal({
                        isOpen: true,
                        type: 'all',
                      });
                    }}
                    className="px-4 py-2 bg-red-950 hover:bg-black text-white text-xs font-black rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-sm border border-red-900"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span>حذف جميع الاتحادات وبدء تطبيق جديد ✨</span>
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* Modal: Edit Type Dialog */}
      {editingModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" dir="rtl">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {editingModal.key === 'activityTypes' ? 'تعديل نوع الوحدة' : editingModal.key === 'paymentTypes' ? 'تعديل نوع التحصيل' : 'تعديل نوع المصروف'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-bold">
                    الاسم الحالي: <span className="text-slate-800 font-black">{editingModal.originalValue}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmEditModal} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-800">
                  الاسم الجديد:
                </label>
                <input
                  type="text"
                  value={editingModal.newValue}
                  onChange={(e) => setEditingModal(prev => prev ? { ...prev, newValue: e.target.value, error: undefined } : null)}
                  className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-black text-slate-900 outline-none text-right transition"
                  placeholder="أدخل الاسم الجديد"
                  autoFocus
                  required
                />
              </div>

              {editingModal.key === 'activityTypes' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-800">
                    الاشتراك الشهري الافتراضي لهذا النشاط:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={editingModal.fee}
                      onChange={(e) => setEditingModal(prev => prev ? { ...prev, fee: Number(e.target.value) || 0 } : null)}
                      className="flex-1 px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-black text-slate-900 outline-none text-right transition"
                    />
                    <span className="text-xs font-bold text-slate-500 shrink-0">ج.م / شهر</span>
                  </div>
                </div>
              )}

              {editingModal.error && (
                <p className="text-xs text-red-600 font-bold bg-red-50 p-2.5 rounded-xl border border-red-100">
                  {editingModal.error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white text-xs font-black rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>حفظ التعديل</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Union Confirmation */}
      {buildingDeleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn" dir="rtl">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 mx-auto bg-red-100 dark:bg-red-950/60 rounded-2xl flex items-center justify-center text-red-600 dark:text-red-400 shadow-inner">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {buildingDeleteModal.type === 'all' 
                  ? 'حذف جميع الاتحادات المسجلة' 
                  : `حذف اتحاد "${buildingDeleteModal.buildingName || config.buildingName || 'العمارة'}"`}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                {buildingDeleteModal.type === 'all'
                  ? 'هل أنت متأكد من حذف كافة الاتحادات المسجلة نهائياً؟ سيتم تفريغ كافة البيانات والبدء بحالة المصنع لتسجيل اتحاد جديد.'
                  : 'هل أنت متأكد من حذف هذا الاتحاد وكافة سجلاته المالية وسكاناته نهائياً من النظام والسحابة؟'}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmDeleteBuilding}
                disabled={isDeletingBuilding}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-md shadow-red-600/20 disabled:opacity-50"
              >
                {isDeletingBuilding ? 'جاري الحذف...' : 'نعم، حذف نهائي'}
              </button>
              <button
                type="button"
                onClick={() => setBuildingDeleteModal({ isOpen: false, type: 'single' })}
                disabled={isDeletingBuilding}
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

