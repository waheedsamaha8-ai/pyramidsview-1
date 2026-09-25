import React, { useState, useEffect } from 'react';
import { AppConfig, UserRole } from '../types';
import { Settings, Shield, Calendar, Cloud } from 'lucide-react';
import { getActiveBuilding, getAllBuildings } from '../services/buildingStore';
import { SettingsGeneralSection } from './settings/SettingsGeneralSection';
import { SettingsStorageSection } from './settings/SettingsStorageSection';
import { SettingsPermissionsSection } from './settings/SettingsPermissionsSection';
import { SettingsCategoriesSection } from './settings/SettingsCategoriesSection';

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
}) => {
  const isAdmin = role === 'ADMIN';

  const [activeSubTab, setActiveSubTab] = useState<'settings' | 'storage' | 'permissions' | 'types'>('settings');
  const [newRuleInput, setNewRuleInput] = useState('');

  // States to hold all buildings list and selected building to delete
  const [allBuildings, setAllBuildings] = useState<any[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');

  useEffect(() => {
    const loadAll = async () => {
      try {
        const list = await getAllBuildings();
        setAllBuildings(list);
        if (list.length > 0) {
          const active = getActiveBuilding();
          setSelectedBuildingId(active?.id || list[0].id);
        }
      } catch (err) {
        console.warn('Error loading buildings inside SettingsTab:', err);
      }
    };
    if (activeSubTab === 'permissions') {
      loadAll();
    }
  }, [activeSubTab]);

  // Automatically reset to settings sub-tab if resident mode
  useEffect(() => {
    if (!isAdmin && activeSubTab === 'storage') {
      setActiveSubTab('settings');
    }
  }, [isAdmin, activeSubTab]);

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
      setActivityFees(prev => ({ ...defaultFeesMap, ...config.activityDefaultFees }));
    }
  }, [config]);

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

  const handleAddNewRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleInput.trim()) return;
    if (onAddRule) {
      onAddRule(newRuleInput.trim());
      setNewRuleInput('');
    }
  };

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

      {/* SUBTAB 0: GENERAL ACCOUNTING SETTINGS */}
      {activeSubTab === 'settings' && (
        <SettingsGeneralSection
          config={config}
          isAdmin={isAdmin}
          accountingStartDate={accountingStartDate}
          setAccountingStartDate={setAccountingStartDate}
          activityFees={activityFees}
          setActivityFees={setActivityFees}
          defaultFeesMap={defaultFeesMap}
          handleResetDefaultActivityFees={handleResetDefaultActivityFees}
          savedSuccess={savedSuccess}
          handleSaveAccountingSettings={handleSaveAccountingSettings}
          getElapsedMonths={getElapsedMonths}
        />
      )}

      {/* SUBTAB 1: FIREBASE CLOUD DATABASE & EXCEL / JSON BACKUP */}
      {isAdmin && activeSubTab === 'storage' && (
        <SettingsStorageSection
          config={config}
          onNotification={onNotification}
          onRefreshAllData={onRefreshAllData}
        />
      )}

      {/* SUBTAB 2: RESPONSIBILITIES AND PERMISSIONS */}
      {activeSubTab === 'permissions' && (
        <SettingsPermissionsSection
          config={config}
          isAdmin={isAdmin}
          rules={rules}
          onAddRule={onAddRule}
          onDeleteRule={onDeleteRule}
          onOpenEditRulesModal={onOpenEditRulesModal}
          newRuleInput={newRuleInput}
          setNewRuleInput={setNewRuleInput}
          handleAddNewRule={handleAddNewRule}
          allBuildings={allBuildings}
          selectedBuildingId={selectedBuildingId}
          setSelectedBuildingId={setSelectedBuildingId}
          onSaveConfig={onSaveConfig}
          onNotification={onNotification}
        />
      )}

      {/* SUBTAB 3: MANAGING TYPES AND CATEGORIES */}
      {activeSubTab === 'types' && (
        <SettingsCategoriesSection
          config={config}
          isAdmin={isAdmin}
          activityFees={activityFees}
          setActivityFees={setActivityFees}
          defaultFeesMap={defaultFeesMap}
          onSaveConfig={onSaveConfig}
          onNotification={onNotification}
        />
      )}
    </div>
  );
};
