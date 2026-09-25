import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import { 
  Building, 
  Building2,
  Home, 
  FileText, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Bell, 
  Sparkles, 
  History as HistoryIcon,
  Wifi, 
  WifiOff, 
  LogOut, 
  Download, 
  Menu, 
  X,
  Plus,
  CloudLightning,
  Smartphone,
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Settings,
  Share2,
  Trash2,
  Wrench,
  Vote,
  AlertTriangle,
  LayoutDashboard,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Users,
  RefreshCw,
  HardHat,
  MessageSquare,
  MessageCircle,
  Calendar,
  Scale,
  BookOpen,
  Moon,
  Sun,
  ShieldCheck
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

import { initAuth, logoutUser, googleSignIn, notifyFirebaseStatus } from './services/firebaseConfig';
import * as firestoreService from './services/firestoreService';
import * as backupService from './services/backupService';
import * as googleApi from './services/googleApi';
import * as offlineSync from './services/offlineSync';
import { fetchAllJoinRequests, verifyAuthorizedRole } from './services/authStore';
import { getActiveBuilding } from './services/buildingStore';
import { UserRole, Resident, Payment, Expense, AppNotification, BuildingRules, AppConfig, MaintenanceRequest, Poll, AdminDecision, BuildingEvent, ChatMessage, PublicComplaint, ComplaintComment, FloorConfig, Craftsman, CraftsmanComment } from './types';

// Importing Custom Components
import { useAppSync } from './hooks/useAppSync';
import { Login } from './components/Login';
import { ResidentsList } from './components/ResidentsList';
import { ExpensesList } from './components/ExpensesList';
import { PaymentsList } from './components/PaymentsList';
import { Summaries } from './components/Summaries';
import { History } from './components/History';
import { NotificationCenter } from './components/NotificationCenter';
import { MaintenanceRequests } from './components/MaintenanceRequests';
import { VotingPolls } from './components/VotingPolls';
import { EventsCalendar } from './components/EventsCalendar';
import { Chat } from './components/Chat';
import { SettingsTab } from './components/SettingsTab';
import { ConfirmModal } from './components/ConfirmModal';
import { DebtsReport } from './components/DebtsReport';
import { ResidentAccountStatement } from './components/ResidentAccountStatement';
import { Dashboard } from './components/Dashboard';
import { AppHeader } from './components/layout/AppHeader';
import { NavigationDrawer } from './components/layout/NavigationDrawer';
import { PwaInstallPrompt } from './components/pwa/PwaInstallPrompt';
import { ImagePreviewModal } from './components/modals/ImagePreviewModal';
import { BuildingRulesModal } from './components/modals/BuildingRulesModal';
import { ActivityUnitsModal } from './components/modals/ActivityUnitsModal';
import { calculateResidentFinancials } from './utils/financialCalculations';
import { removeUnitFromBuildingLayout, addUnitToBuildingLayout, compareFlatNumbers, isSameFlatNumber, parseFlatNumber, getUnitNumbersForFloor, deriveFloorConfigsFromResidents, deduplicateResidents } from './utils/buildingStructure';
import { formatMobileNumber, formatPhoneForDisplay } from './utils/phoneUtils';
import { 
  canDeleteChatMessage, 
  canDeleteComplaint, 
  canDeleteMaintenanceRequest, 
  canDeleteCraftsman, 
  canDeletePoll, 
  canDeleteDecision 
} from './utils/permissions';

// Synchronous session and state hydration helpers for instant refresh
const getInitialSavedSession = (): User | null => {
  try {
    const s = localStorage.getItem('custom_user_session');
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

const getInitialSavedToken = (): string | null => {
  try {
    return localStorage.getItem('google_access_token') || (localStorage.getItem('custom_user_session') ? 'local-token' : null);
  } catch {
    return null;
  }
};

const getInitialRole = (initialUser: User | null): UserRole => {
  if (!initialUser) return 'RESIDENT';
  const savedRole = (localStorage.getItem('user_role') || localStorage.getItem('app_user_role') || 'RESIDENT') as UserRole;
  return verifyAuthorizedRole(initialUser.email, savedRole);
};

const getInitialFlatNumber = (initialUser: User | null): number | string | undefined => {
  try {
    const cached = localStorage.getItem('resident_flat_number');
    if (cached) return cached;
  } catch {}
  if (!initialUser) return undefined;
  if ((initialUser as any).flatNumber) return (initialUser as any).flatNumber;
  return undefined;
};

const getInitialTab = (): 'dashboard' | 'residents' | 'payments' | 'expenses' | 'summaries' | 'history' | 'maintenance' | 'polls' | 'calendar' | 'chat' | 'settings' | 'debts-report' => {
  try {
    const saved = localStorage.getItem('pyramids_active_tab') as any;
    const validTabs = ['dashboard', 'residents', 'payments', 'expenses', 'summaries', 'history', 'maintenance', 'polls', 'calendar', 'chat', 'settings', 'debts-report'];
    if (saved && validTabs.includes(saved)) {
      return saved;
    }
  } catch {}
  return 'dashboard';
};

export default function App() {
  // Synchronous session hydration for instant, flicker-free refresh
  const initialUser = useMemo(() => getInitialSavedSession(), []);
  const [user, setUser] = useState<User | null>(initialUser);
  const [token, setToken] = useState<string | null>(() => getInitialSavedToken());
  const [role, setRole] = useState<UserRole>(() => getInitialRole(initialUser));
  const [flatNumber, setFlatNumber] = useState<number | string | undefined>(() => getInitialFlatNumber(initialUser));
  const [isInitializingAuth, setIsInitializingAuth] = useState<boolean>(!initialUser);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState<boolean>(false);
  const [firebaseStatus, setFirebaseStatus] = useState<'success' | 'error' | 'syncing'>('success');

  useEffect(() => {
    const handleFirebaseStatus = (e: any) => {
      if (e?.detail?.status) {
        setFirebaseStatus(e.detail.status);
      }
    };
    window.addEventListener('firebase-status-change', handleFirebaseStatus);
    return () => window.removeEventListener('firebase-status-change', handleFirebaseStatus);
  }, []);

  // App configurations & lists initialized synchronously from offline cache
  const [config, setConfig] = useState<AppConfig>(() => {
    const baseConfig: AppConfig = {
      expenseTypes: ['صيانة', 'كهرباء', 'مياه', 'أمن ونظافة', 'مصاعد', 'أخرى'],
      paymentTypes: ['اشتراك شهري', 'صيانة طارئة', 'تحصيلات اخرى'],
      activityTypes: ['سكني', 'سكني مغلق', 'مفروش', 'إداري', 'تجاري', 'بدون تشطيب'],
      admins: [],
      managers: [],
      accountingStartDate: '2026-01-01',
      defaultMonthlyFee: 400,
      activityDefaultFees: {
        'سكني': 400,
        'سكني مغلق': 200,
        'مفروش': 600,
        'إداري': 800,
        'تجاري': 500,
        'بدون تشطيب': 0,
      },
      adminResidentProfile: {
        flatNumber: 207,
        name: 'وحيد سماحة',
        phone: '',
        activityType: 'سكني',
        ownershipType: 'تمليك',
        monthlyFee: 400,
        initialBalance: 0,
        notes: 'رئيس اتحاد الملاك',
      }
    };
    try {
      const localConfig = offlineSync.getCachedData<AppConfig>('config');
      if (localConfig) {
        return {
          ...baseConfig,
          ...localConfig,
          adminResidentProfile: localConfig.adminResidentProfile || baseConfig.adminResidentProfile,
        };
      }
    } catch {}
    return baseConfig;
  });

  const [rules, setRules] = useState<string[]>(() => {
    try {
      const r = offlineSync.getCachedData<any>('rules');
      return r?.rules || [];
    } catch {
      return [];
    }
  });

  const [residents, setResidents] = useState<Resident[]>(() => {
    try {
      const raw = offlineSync.getCachedData<Resident[]>('residents');
      if (raw && Array.isArray(raw)) {
        return raw
          .filter(r => r && r.id && (!['1', '2', '3'].includes(String(r.id)) || (r.name !== 'محمد أحمد' && r.name !== 'خالد مصطفى' && r.name !== 'سمير عبد الله')))
          .map(r => ({
            ...r,
            notes: (r.notes || '').includes('توليد تلقائي') ? '' : (r.notes || '')
          }));
      }
    } catch {}
    return [];
  });

  const [payments, setPayments] = useState<Payment[]>(() => {
    try {
      const raw = offlineSync.getCachedData<Payment[]>('payments');
      return raw && Array.isArray(raw) ? raw.filter(p => p && p.id && p.id !== 'p1') : [];
    } catch {
      return [];
    }
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const raw = offlineSync.getCachedData<Expense[]>('expenses');
      return raw && Array.isArray(raw) ? raw.filter(e => e && e.id && e.id !== 'e1') : [];
    } catch {
      return [];
    }
  });

  // New features states initialized synchronously
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>(() => {
    try {
      const raw = offlineSync.getCachedData<MaintenanceRequest[]>('maintenance');
      return raw && Array.isArray(raw) ? raw.filter(m => m && m.id && typeof m.id === 'string' && !m.id.startsWith('req_seed_')) : [];
    } catch {
      return [];
    }
  });

  const [craftsmen, setCraftsmen] = useState<Craftsman[]>(() => {
    try {
      const raw = offlineSync.getCachedData<Craftsman[]>('craftsmen');
      return raw && Array.isArray(raw) ? raw.filter(c => c && c.id) : [];
    } catch {
      return [];
    }
  });

  const [polls, setPolls] = useState<Poll[]>(() => {
    try {
      const raw = offlineSync.getCachedData<Poll[]>('polls');
      return raw && Array.isArray(raw) ? raw.filter(p => p && p.id && typeof p.id === 'string' && !p.id.startsWith('poll_seed_')) : [];
    } catch {
      return [];
    }
  });

  const [decisions, setDecisions] = useState<AdminDecision[]>(() => {
    try {
      const raw = offlineSync.getCachedData<AdminDecision[]>('admin_decisions');
      return raw && Array.isArray(raw) ? raw.filter(d => d && d.id && typeof d.id === 'string' && !d.id.startsWith('dec_seed_')) : [];
    } catch {
      return [];
    }
  });

  const [events, setEvents] = useState<BuildingEvent[]>(() => {
    try {
      const raw = offlineSync.getCachedData<BuildingEvent[]>('events');
      return raw && Array.isArray(raw) ? raw.filter(e => e && e.id && typeof e.id === 'string' && !e.id.startsWith('ev_seed_')) : [];
    } catch {
      return [];
    }
  });

  // Track deleted IDs to prevent polling or local sync from resurrecting deleted items
  const getDeletedMessageIds = (): Set<string> => {
    try {
      const stored = localStorage.getItem('pyramids_deleted_msg_ids');
      return new Set<string>(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set<string>();
    }
  };

  const getDeletedComplaintIds = (): Set<string> => {
    try {
      const stored = localStorage.getItem('pyramids_deleted_comp_ids');
      return new Set<string>(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set<string>();
    }
  };

  const deletedMessageIdsRef = useRef<Set<string>>(getDeletedMessageIds());
  const deletedComplaintIdsRef = useRef<Set<string>>(getDeletedComplaintIds());

  const markMessageAsDeleted = useCallback((id: string) => {
    if (!id) return;
    deletedMessageIdsRef.current.add(id);
    try {
      const arr = Array.from(deletedMessageIdsRef.current).slice(-200);
      localStorage.setItem('pyramids_deleted_msg_ids', JSON.stringify(arr));
    } catch {}
  }, []);

  const markComplaintAsDeleted = useCallback((id: string) => {
    if (!id) return;
    deletedComplaintIdsRef.current.add(id);
    try {
      const arr = Array.from(deletedComplaintIdsRef.current).slice(-200);
      localStorage.setItem('pyramids_deleted_comp_ids', JSON.stringify(arr));
    } catch {}
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const raw = offlineSync.getCachedData<ChatMessage[]>('chat_messages');
      const delSet = getDeletedMessageIds();
      return raw && Array.isArray(raw) ? raw.filter(m => m && m.id && typeof m.id === 'string' && !m.id.startsWith('msg_seed_') && !delSet.has(m.id)) : [];
    } catch {
      return [];
    }
  });

  const [complaints, setComplaints] = useState<PublicComplaint[]>(() => {
    try {
      const raw = offlineSync.getCachedData<PublicComplaint[]>('public_complaints');
      const delSet = getDeletedComplaintIds();
      return raw && Array.isArray(raw) ? raw.filter(c => c && c.id && typeof c.id === 'string' && !c.id.startsWith('comp_seed_') && !delSet.has(c.id)) : [];
    } catch {
      return [];
    }
  });

  const [buildingLayout, setBuildingLayout] = useState<FloorConfig[]>(() => {
    try {
      return offlineSync.getCachedData<FloorConfig[]>('building_layout') || [];
    } catch {
      return [];
    }
  });
  
  // Report Generator States
  const [reportResidentId, setReportResidentId] = useState<string>('');
  const [reportPeriod, setReportPeriod] = useState<'year' | 'all' | 'custom'>('year');
  const [reportStartDate, setReportStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);

  // UI state with active tab persistence
  const [activeTab, setActiveTab] = useState<'dashboard' | 'residents' | 'payments' | 'expenses' | 'summaries' | 'history' | 'maintenance' | 'polls' | 'calendar' | 'chat' | 'settings' | 'debts-report'>(() => getInitialTab());

  // Automatically save active tab to keep user position on refresh
  useEffect(() => {
    if (activeTab) {
      localStorage.setItem('pyramids_active_tab', activeTab);
    }
  }, [activeTab]);

  // Sync residents to server for backend auth verification (if server is active)
  useEffect(() => {
    const isLocalOrNodeServer = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (isLocalOrNodeServer && residents && residents.length > 0) {
      try {
        fetch('/api/residents/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ residents }),
        }).catch(() => {});
      } catch {}
    }
  }, [residents]);

  // Real-time Firestore Sync & local offline sync
  useAppSync({
    userEmail: user?.email,
    buildingId: (user as any)?.buildingId,
    role,
    deletedMessageIdsRef,
    deletedComplaintIdsRef,
    setMessages,
    setComplaints,
    setMaintenanceRequests,
    setPolls,
    setDecisions,
    setEvents,
    setCraftsmen,
    setResidents,
    setPayments,
    setExpenses,
    setConfig,
    setBuildingLayout,
    setRules,
  });

  const [selectedActivityModal, setSelectedActivityModal] = useState<string | null>(null);
  const [maintenanceSubTab, setMaintenanceSubTab] = useState<'requests' | 'directory'>('requests');
  const [chatSubTab, setChatSubTab] = useState<'room' | 'complaints'>('room');
  const [pollsSubTab, setPollsSubTab] = useState<'polls' | 'decisions'>('polls');
  const [viewMode, setViewMode] = useState<'year' | 'month'>('year');
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // All notifications visible across roles
  const visibleNotifications = useMemo(() => {
    return notifications;
  }, [notifications]);
  const [syncing, setSyncing] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState('');
  const [mobileMenuOpen, setMenuOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Theme state permanently locked to Light Mode as requested by the user
  const isDarkMode = false;
  const setIsDarkMode = () => {};

  useEffect(() => {
    try {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('app_theme', 'light');
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) metaTheme.setAttribute('content', '#1e3a8a');
    } catch (e) {
      console.error('Failed to apply theme', e);
    }
  }, []);

  const handleToggleTheme = (dark?: boolean) => {
    // Permanently disabled
  };

  // Global In-App Confirm Modal State
  const [globalConfirm, setGlobalConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmLabel?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    isDestructive: true,
  });

  const openGlobalConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    isDestructive = true,
    confirmLabel = 'نعم، تأكيد الحذف'
  ) => {
    setGlobalConfirm({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setGlobalConfirm(prev => ({ ...prev, isOpen: false }));
      },
      isDestructive,
      confirmLabel,
    });
  };
  
  const handlePreviewImage = async (url: string) => {
    if (!url) return;
    
    // Check if it's a Google Drive URL
    const driveMatch = url.match(/id=([^&]+)/);
    if (driveMatch && driveMatch[1]) {
      const fileId = driveMatch[1];
      setPreviewLoading(true);
      setPreviewImage('loading'); // Show modal immediately with loading state
      try {
        const blob = await googleApi.getFileBlob(fileId);
        const blobUrl = URL.createObjectURL(blob);
        setPreviewImage(blobUrl);
      } catch (err) {
        console.warn("Failed to fetch drive image via API, falling back to direct URL:", err);
        // Fallback: Use direct Google Drive URL which might work if file is public
        // or if session is active in browser (referrer policy might help)
        setPreviewImage(url); 
      } finally {
        setPreviewLoading(false);
      }
    } else {
      setPreviewImage(url);
    }
  };

  const closePreview = () => {
    if (previewImage && previewImage.startsWith('blob:')) {
      URL.revokeObjectURL(previewImage);
    }
    setPreviewImage(null);
    setPreviewLoading(false);
  };
  
  // Custom Building Rules views
  const [showRulesReadModal, setShowRulesReadModal] = useState(false);
  const [showRulesEditModal, setShowRulesEditModal] = useState(false);
  const [newRuleText, setNewRuleText] = useState('');

  // Year filter (standard for summaries)
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // PWA Install state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const isIosDevice = typeof window !== 'undefined' && /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());

  // Sidebar categories state (default: all sections closed)
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  // Initialize Auth on load
  useEffect(() => {
    // One-time clean slate migration: wipe all dummy demo data and test sessions
    const CLEAN_SLATE_KEY = 'clean_slate_wipe_v4';
    if (!localStorage.getItem(CLEAN_SLATE_KEY)) {
      localStorage.removeItem('custom_user_session');
      localStorage.removeItem('resident_flat_number');
      localStorage.removeItem('cache_residents');
      localStorage.removeItem('cache_payments');
      localStorage.removeItem('cache_expenses');
      localStorage.removeItem('cache_maintenance');
      localStorage.removeItem('cache_polls');
      localStorage.removeItem('cache_admin_decisions');
      localStorage.removeItem('cache_events');
      localStorage.removeItem('cache_chat_messages');
      localStorage.removeItem('cache_public_complaints');
      localStorage.removeItem('custom_join_requests');
      localStorage.setItem(CLEAN_SLATE_KEY, 'true');
    }

    // Check local caches first to prevent blank screens
    const rawResidents = offlineSync.getCachedData<Resident[]>('residents');
    const rawPayments = offlineSync.getCachedData<Payment[]>('payments');
    const rawExpenses = offlineSync.getCachedData<Expense[]>('expenses');
    const localConfig = offlineSync.getCachedData<AppConfig>('config');
    const localRules = offlineSync.getCachedData<{ rules: string[] }>('rules');
    
    // Load features from caches (filtering any lingering seed records)
    const rawMaintenance = offlineSync.getCachedData<MaintenanceRequest[]>('maintenance');
    const rawPolls = offlineSync.getCachedData<Poll[]>('polls');
    const rawDecisions = offlineSync.getCachedData<AdminDecision[]>('admin_decisions');
    const rawEvents = offlineSync.getCachedData<BuildingEvent[]>('events');
    const localLayout = offlineSync.getCachedData<FloorConfig[]>('building_layout');

    const defaultActivityFees: Record<string, number> = {
      'سكني': 400,
      'سكني مغلق': 200,
      'مفروش': 600,
      'إداري': 800,
      'تجاري': 500,
      'بدون تشطيب': 0,
    };

    if (rawResidents) {
      const cleaned = rawResidents
        .filter(r => r && r.id && (!['1', '2', '3'].includes(String(r.id)) || (r.name !== 'محمد أحمد' && r.name !== 'خالد مصطفى' && r.name !== 'سمير عبد الله')))
        .map(r => ({
          ...r,
          notes: (r.notes || '').includes('توليد تلقائي') ? '' : (r.notes || '')
        }));
      setResidents(cleaned);
      syncApprovedRequestsWithResidents(cleaned).then(res => setResidents(res)).catch(() => {});
    } else {
      syncApprovedRequestsWithResidents([]).then(res => setResidents(res)).catch(() => {});
    }
    if (rawPayments) {
      setPayments(rawPayments.filter(p => p && p.id && p.id !== 'p1'));
    }
    if (rawExpenses) {
      setExpenses(rawExpenses.filter(e => e && e.id && e.id !== 'e1'));
    }
    if (localConfig) {
      setConfig({
        ...localConfig,
        defaultMonthlyFee: localConfig.defaultMonthlyFee || 400,
        activityDefaultFees: { ...defaultActivityFees, ...(localConfig.activityDefaultFees || {}) },
        activityTypes: localConfig.activityTypes && localConfig.activityTypes.length > 0 
          ? Array.from(new Set([...localConfig.activityTypes, 'سكني', 'سكني مغلق', 'مفروش', 'إداري', 'تجاري', 'بدون تشطيب']))
          : ['سكني', 'سكني مغلق', 'مفروش', 'إداري', 'تجاري', 'بدون تشطيب'],
      });
    }
    if (localRules && localRules.rules) setRules(localRules.rules);
    if (localLayout) setBuildingLayout(localLayout);

    // Maintenance requests (clean - no seed data)
    if (rawMaintenance) {
      setMaintenanceRequests(rawMaintenance.filter(m => m && m.id && typeof m.id === 'string' && !m.id.startsWith('req_seed_')));
    } else {
      setMaintenanceRequests([]);
    }

    // Polls (clean - no seed data)
    if (rawPolls) {
      setPolls(rawPolls.filter(p => p && p.id && typeof p.id === 'string' && !p.id.startsWith('poll_seed_')));
    } else {
      setPolls([]);
    }

    // Admin decisions (clean - no seed data)
    if (rawDecisions) {
      setDecisions(rawDecisions.filter(d => d && d.id && typeof d.id === 'string' && !d.id.startsWith('dec_seed_')));
    } else {
      setDecisions([]);
    }

    // Events (clean - no seed data)
    if (rawEvents) {
      setEvents(rawEvents.filter(e => e && e.id && typeof e.id === 'string' && !e.id.startsWith('ev_seed_')));
    } else {
      setEvents([]);
    }

    // Load Chat Messages and Complaints from Cache (clean - no seed data)
    const rawMessages = offlineSync.getCachedData<ChatMessage[]>('chat_messages');
    const rawComplaints = offlineSync.getCachedData<PublicComplaint[]>('public_complaints');

    if (rawMessages) {
      setMessages(rawMessages.filter(m => m && m.id && typeof m.id === 'string' && !m.id.startsWith('msg_seed_')));
    } else {
      setMessages([]);
    }

    if (rawComplaints) {
      setComplaints(rawComplaints.filter(c => c && c.id && typeof c.id === 'string' && !c.id.startsWith('comp_seed_')));
    } else {
      setComplaints([]);
    }

    let authResolved = false;

    // Fast background bootstrap if session was already hydrated synchronously
    if (initialUser) {
      const initialSavedTok = getInitialSavedToken() || 'local-token';
      googleApi.setAccessToken(initialSavedTok);
      bootstrapApp(initialUser, initialSavedTok, true);
    }

    // Safety timeout: Ensure the loading gate resolves rapidly
    const authTimeout = setTimeout(() => {
      if (!authResolved) {
        authResolved = true;
        setIsInitializingAuth(false);
      }
    }, 1000);

    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        authResolved = true;
        clearTimeout(authTimeout);
        setUser(currentUser);
        setToken(accessToken);
        googleApi.setAccessToken(accessToken);
        bootstrapApp(currentUser, accessToken, true);
      },
      () => {
        authResolved = true;
        clearTimeout(authTimeout);
        // If there's a custom email/password user session saved, restore it and bypass Google Auth listener
        const savedSession = localStorage.getItem('custom_user_session');
        if (savedSession) {
          try {
            const parsed = JSON.parse(savedSession);
            setUser(parsed);
            setToken('local-token');
            googleApi.setAccessToken('local-token');
            setIsInitializingAuth(false);
            bootstrapApp(parsed, 'local-token', true);
            return;
          } catch (e) {
            console.error('Failed to parse custom user session:', e);
          }
        }
        setUser(null);
        setToken(null);
        setIsInitializingAuth(false);
      }
    );

    // Network status listeners
    const handleOnline = () => {
      setIsOnline(true);
      addNotification('متصل بالإنترنت', 'جاري المزامنة التلقائية للبيانات المعلقة...', 'success');
      triggerBackgroundSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      addNotification('غير متصل بالإنترنت', 'يعمل التطبيق الآن في الوضع غير المتصل بالإنترنت. سيتم حفظ جميع التعديلات محلياً وتحديثها فور الاتصال.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Google API Credentials expiry handler
    const handleGoogleAuthError = () => {
      console.warn('Google API access token expired or invalid.');
      addNotification('ربط Google Drive بحاجة للتجديد', 'انتهت صلاحية تصريح Google Drive. يرجى اضغط على "ربط Google Drive" لإعادة المزامنة الاحتياطية بنجاح.', 'warning');
      localStorage.removeItem('google_access_token');
    };
    window.addEventListener('google-auth-error', handleGoogleAuthError);

    // PWA Install prompt listener
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Detect standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setPwaInstalled(true);
    }

    // Real-time local cache update listener across tabs and role view switches
    const handleSyncEvent = (e: any) => {
      const detailKey = e?.detail?.key || e?.key || '';
      const delMsgIds = deletedMessageIdsRef.current;
      const delCompIds = deletedComplaintIdsRef.current;
      
      if (!detailKey || detailKey.includes('chat_messages') || detailKey.includes('messages')) {
        const raw = offlineSync.getCachedData<ChatMessage[]>('chat_messages');
        if (raw && Array.isArray(raw)) setMessages(raw.filter(m => !m.id.startsWith('msg_seed_') && !delMsgIds.has(m.id)));
      }
      if (!detailKey || detailKey.includes('public_complaints') || detailKey.includes('complaints')) {
        const raw = offlineSync.getCachedData<PublicComplaint[]>('public_complaints');
        if (raw && Array.isArray(raw)) setComplaints(raw.filter(c => !c.id.startsWith('comp_seed_') && !delCompIds.has(c.id)));
      }
      if (!detailKey || detailKey.includes('maintenance')) {
        const raw = offlineSync.getCachedData<MaintenanceRequest[]>('maintenance');
        if (raw && Array.isArray(raw)) setMaintenanceRequests(raw.filter(m => !m.id.startsWith('req_seed_')));
      }
      if (!detailKey || detailKey.includes('polls')) {
        const raw = offlineSync.getCachedData<Poll[]>('polls');
        if (raw && Array.isArray(raw)) setPolls(raw.filter(p => !p.id.startsWith('poll_seed_')));
      }
      if (!detailKey || detailKey.includes('admin_decisions') || detailKey.includes('decisions')) {
        const raw = offlineSync.getCachedData<AdminDecision[]>('admin_decisions');
        if (raw && Array.isArray(raw)) setDecisions(raw.filter(d => !d.id.startsWith('dec_seed_')));
      }
      if (!detailKey || detailKey.includes('events')) {
        const raw = offlineSync.getCachedData<BuildingEvent[]>('events');
        if (raw && Array.isArray(raw)) setEvents(raw.filter(ev => !ev.id.startsWith('ev_seed_')));
      }
      if (!detailKey || detailKey.includes('craftsmen')) {
        const raw = offlineSync.getCachedData<Craftsman[]>('craftsmen');
        if (raw && Array.isArray(raw)) setCraftsmen(raw);
      }
      if (!detailKey || detailKey.includes('residents')) {
        const raw = offlineSync.getCachedData<Resident[]>('residents');
        if (raw && Array.isArray(raw)) setResidents(raw);
      }
      if (!detailKey || detailKey.includes('payments')) {
        const raw = offlineSync.getCachedData<Payment[]>('payments');
        if (raw && Array.isArray(raw)) setPayments(raw);
      }
      if (!detailKey || detailKey.includes('expenses')) {
        const raw = offlineSync.getCachedData<Expense[]>('expenses');
        if (raw && Array.isArray(raw)) setExpenses(raw);
      }
    };

    window.addEventListener('pyramids_cache_updated', handleSyncEvent);
    window.addEventListener('storage', handleSyncEvent);

    let bc: BroadcastChannel | null = null;
    try {
      if ('BroadcastChannel' in window) {
        bc = new BroadcastChannel('pyramids_channel_sync');
        bc.onmessage = (event) => {
          if (event?.data?.type === 'CACHE_UPDATED') {
            handleSyncEvent({ detail: { key: event.data.key } });
          }
        };
      }
    } catch {
      // BroadcastChannel unsupported
    }

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('google-auth-error', handleGoogleAuthError);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pyramids_cache_updated', handleSyncEvent);
      window.removeEventListener('storage', handleSyncEvent);
      if (bc) bc.close();
    };
  }, []);

  // Sync background queue on online status
  const triggerBackgroundSync = async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const syncedCount = await offlineSync.syncOfflineQueue((msg) => {
        setSyncStatusText(msg);
      });
      if (syncedCount > 0) {
        addNotification('تمت المزامنة بنجاح', `تم دمج ومزامنة عدد ${syncedCount} من العمليات بنجاح مع Firebase Firestore!`, 'success');
        // Refresh local lists from sheets after sync
        await refreshAllData();
      }
    } catch (err: any) {
      logError(err, 'triggerBackgroundSync');
      addNotification('خطأ في المزامنة', 'لم نتمكن من إتمام المزامنة التلقائية حالياً. سنحاول مرة أخرى لاحقاً.', 'error');
    } finally {
      setSyncing(false);
      setSyncStatusText('');
    }
  };

  // Helper to add smart alerts exclusively for: Chat, Registrations, Communication & Services
  const addNotification = (
    title: string, 
    message: string, 
    type: AppNotification['type'],
    category: AppNotification['category'] = 'communication'
  ) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newNotif: AppNotification = {
      id,
      title,
      message,
      type,
      category,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Helper to log errors without flooding console.error for expected auth expirations
  const logError = (err: any, context: string) => {
    const isAuthError = err?.message?.toLowerCase().includes('credential') || 
                        err?.message?.toLowerCase().includes('token') || 
                        err?.message?.toLowerCase().includes('unauthorized') || 
                        err?.message?.toLowerCase().includes('authenticated');
    if (isAuthError) {
      console.warn(`[Google Auth Warning during ${context}]:`, err.message || err);
    } else {
      console.error(`[Error during ${context}]:`, err);
    }
  };

  // Setup/Bootstrap app database instantly without loading screen delays
  const bootstrapApp = async (currentUser: User, accessToken: string, _isBackground = false) => {
    if (accessToken) {
      googleApi.setAccessToken(accessToken);
    }
    
    try {
      // 1. Immediately hydrate local state from local storage for instant 0ms entry across all roles
      const cachedConfig = offlineSync.getCachedData<AppConfig>('config');
      if (cachedConfig) {
        setConfig(cachedConfig);
        if (Array.isArray(cachedConfig.buildingLayout)) {
          setBuildingLayout(cachedConfig.buildingLayout);
        }
      }
      const cachedLayout = offlineSync.getCachedData<any[]>('building_layout');
      if (Array.isArray(cachedLayout)) setBuildingLayout(cachedLayout);
      const cachedResidents = offlineSync.getCachedData<Resident[]>('residents');
      if (cachedResidents) setResidents(cachedResidents);
      const cachedPayments = offlineSync.getCachedData<Payment[]>('payments');
      if (cachedPayments) setPayments(cachedPayments);
      const cachedExpenses = offlineSync.getCachedData<Expense[]>('expenses');
      if (cachedExpenses) setExpenses(cachedExpenses);
      const cachedCraftsmen = offlineSync.getCachedData<Craftsman[]>('craftsmen');
      if (cachedCraftsmen) setCraftsmen(cachedCraftsmen);
      const cachedMessages = offlineSync.getCachedData<ChatMessage[]>('chat_messages');
      if (cachedMessages) setMessages(cachedMessages);
      const cachedDecisions = offlineSync.getCachedData<AdminDecision[]>('admin_decisions');
      if (cachedDecisions) setDecisions(cachedDecisions);
      const cachedPolls = offlineSync.getCachedData<Poll[]>('polls');
      if (cachedPolls) setPolls(cachedPolls);
      const cachedComplaints = offlineSync.getCachedData<PublicComplaint[]>('public_complaints');
      if (cachedComplaints) setComplaints(cachedComplaints);
      const cachedMaintenance = offlineSync.getCachedData<MaintenanceRequest[]>('maintenance');
      if (cachedMaintenance) setMaintenanceRequests(cachedMaintenance);

      if (!currentUser) {
        setIsInitializingAuth(false);
        return;
      }

      // 2. Detect and verify user role against trusted identity
      const email = currentUser.email?.toLowerCase().trim() || '';
      let claimedRole: UserRole = role;

      if ((currentUser as any).role && ['ADMIN', 'MANAGER', 'ASSISTANT', 'RESIDENT'].includes((currentUser as any).role)) {
        claimedRole = (currentUser as any).role as UserRole;
      } else {
        const savedRole = localStorage.getItem('user_role') || localStorage.getItem('app_user_role');
        if (savedRole && ['ADMIN', 'MANAGER', 'ASSISTANT', 'RESIDENT'].includes(savedRole)) {
          claimedRole = savedRole as UserRole;
        }
      }

      // Cryptographically / identity-verified role enforcement - eliminates LocalStorage tampering
      const detectedRole = verifyAuthorizedRole(email, claimedRole, cachedConfig?.admins || []);

      setRole(detectedRole);
      localStorage.setItem('user_role', detectedRole);
      localStorage.setItem('app_user_role', detectedRole);

      const cachedFlat = localStorage.getItem('resident_flat_number') || (currentUser as any).flatNumber;
      if (cachedFlat) {
        setFlatNumber(String(cachedFlat));
      } else if (detectedRole === 'ADMIN') {
        const adminFlat = cachedConfig?.adminResidentProfile?.flatNumber || 207;
        setFlatNumber(adminFlat);
        localStorage.setItem('resident_flat_number', String(adminFlat));
      }

      // 3. Complete auth initialization IMMEDIATELY so login and switching are instant (0 seconds delay)
      setIsInitializingAuth(false);
      setIsBackgroundSyncing(false);

      // 4. Trigger data refresh silently in background from Firestore
      refreshAllData().catch(err => console.warn('Background refresh warning:', err));

    } catch (err: any) {
      logError(err, 'bootstrapApp');
    } finally {
      setIsInitializingAuth(false);
      setIsBackgroundSyncing(false);
    }
  };

  const syncApprovedRequestsWithResidents = async (currentResidents: Resident[]): Promise<Resident[]> => {
    try {
      const requests = await fetchAllJoinRequests();
      const approvedReqs = requests.filter(r => r.status === 'APPROVED');
      if (approvedReqs.length === 0) return currentResidents;

      let list = [...currentResidents];
      let changed = false;

      for (const req of approvedReqs) {
        const foundIdx = list.findIndex(r => isSameFlatNumber(r.flatNumber, req.flatNumber));
        if (foundIdx !== -1) {
          // Only update existing resident that was registered manually by union president
          const existing = list[foundIdx];
          const resName = req.residentType === 'OWNER' && req.ownerName ? req.ownerName : existing.name;
          const resPhone = req.residentType === 'OWNER' && req.ownerPhone ? formatMobileNumber(req.ownerPhone) : existing.phone;
          const updated: Resident = {
            ...existing,
            name: resName,
            phone: resPhone,
            ownershipType: req.residentType === 'OWNER' ? 'تمليك' : 'إيجار',
            tenantName: req.residentType === 'TENANT' ? (req.tenantName || existing.tenantName) : existing.tenantName,
            tenantPhone: req.residentType === 'TENANT' && req.tenantPhone ? formatMobileNumber(req.tenantPhone) : existing.tenantPhone,
          };
          list[foundIdx] = updated;
          changed = true;
          firestoreService.saveResidentToFirestore(updated).catch(() => {});
        }
      }

      if (changed) {
        const deduplicated = deduplicateResidents(list);
        offlineSync.saveCachedData('residents', deduplicated);
        return deduplicated;
      }
      return deduplicateResidents(list);
    } catch {
      return deduplicateResidents(currentResidents);
    }
  };

  const refreshAllData = async () => {
    try {
      const { 
        residents: loadedResidents, 
        payments: loadedPayments, 
        expenses: loadedExpenses, 
        rules: loadedRules, 
        craftsmen: loadedCraftsmen,
        messages: loadedMessages,
        decisions: loadedDecisions,
        polls: loadedPolls,
        complaints: loadedComplaints,
        maintenance: loadedMaintenance,
        events: loadedEvents,
        config: loadedConfig,
      } = await firestoreService.getAllDataFromFirestore();

      if (loadedConfig) {
        setConfig(prev => ({ ...prev, ...loadedConfig }));
        offlineSync.saveCachedData('config', loadedConfig);
        if (Array.isArray(loadedConfig.buildingLayout)) {
          setBuildingLayout(loadedConfig.buildingLayout);
          offlineSync.saveCachedData('building_layout', loadedConfig.buildingLayout);
        }
      }

      const syncedResidents = await syncApprovedRequestsWithResidents(loadedResidents);

      if (syncedResidents && syncedResidents.length > 0) {
        const uniqueResidents = deduplicateResidents(syncedResidents);
        setResidents(uniqueResidents);
        offlineSync.saveCachedData('residents', uniqueResidents);
        if (uniqueResidents.length < syncedResidents.length) {
          const keptIds = new Set(uniqueResidents.map(r => r.id));
          syncedResidents.forEach(r => {
            if (!keptIds.has(r.id)) {
              firestoreService.deleteResidentFromFirestore(r.id).catch(() => {});
            }
          });
        }
      }

      if (loadedPayments) {
        setPayments(loadedPayments);
        offlineSync.saveCachedData('payments', loadedPayments);
      }

      if (loadedExpenses) {
        setExpenses(loadedExpenses);
        offlineSync.saveCachedData('expenses', loadedExpenses);
      }

      if (loadedRules) {
        setRules(loadedRules);
        offlineSync.saveCachedData('rules', { rules: loadedRules });
      }

      if (loadedCraftsmen) {
        setCraftsmen(loadedCraftsmen);
        offlineSync.saveCachedData('craftsmen', loadedCraftsmen);
      }

      const delMsgIds = deletedMessageIdsRef.current;
      const delCompIds = deletedComplaintIdsRef.current;
      const safeLoadedMessages = (loadedMessages || []).filter(m => !delMsgIds.has(m.id)).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const safeLoadedComplaints = (loadedComplaints || []).filter(c => !delCompIds.has(c.id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      setMessages(safeLoadedMessages);
      offlineSync.saveCachedData('chat_messages', safeLoadedMessages);

      if (loadedDecisions) {
        const sortedDec = loadedDecisions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        setDecisions(sortedDec);
        offlineSync.saveCachedData('admin_decisions', sortedDec);
      }

      if (loadedPolls) {
        const sortedPolls = loadedPolls.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setPolls(sortedPolls);
        offlineSync.saveCachedData('polls', sortedPolls);
      }

      setComplaints(safeLoadedComplaints);
      offlineSync.saveCachedData('public_complaints', safeLoadedComplaints);

      if (loadedMaintenance) {
        const sortedMaint = loadedMaintenance.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        setMaintenanceRequests(sortedMaint);
        offlineSync.saveCachedData('maintenance', sortedMaint);
      }

      if (loadedEvents) {
        const sortedEv = loadedEvents.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        setEvents(sortedEv);
        offlineSync.saveCachedData('events', sortedEv);
      }

      notifyFirebaseStatus('success');
    } catch (err) {
      notifyFirebaseStatus('error');
      logError(err, 'refreshAllData');
    }
  };

  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);

  const handleConnectGoogleDrive = async () => {
    setIsConnectingGoogle(true);
    try {
      const { user: authedUser, accessToken } = await googleSignIn();
      setUser(authedUser);
      setToken(accessToken);
      googleApi.setAccessToken(accessToken);
      localStorage.setItem('google_access_token', accessToken);
      localStorage.removeItem('custom_user_session');
      addNotification('جاري ربط Google Drive', 'تم تسجيل الدخول بنجاح. جاري الآن إنشاء وفحص مجلدات Google Drive وجداول Google Sheets...', 'info');
      await bootstrapApp(authedUser, accessToken, false);
      addNotification('تم ربط Google Drive بنجاح', `تم إنشاء وربط مجلدات Google Drive وجداول Google Sheets بحساب ${authedUser.email || ''} بنجاح!`, 'success');
    } catch (err: any) {
      logError(err, 'handleConnectGoogleDrive');
      const domain = window.location.hostname || 'union-app';
      if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain')) {
        addNotification(
          'تفعيل نطاق Google مطلوب',
          `نطاق موقعك (${domain}) غير مصرح به في Firebase Console. يرجى إضافته إلى Authorized Domains في إعدادات المشروع gen-lang-client-0075821615 ليتمكن Google من إتمام المزامنة السحابية.`,
          'error'
        );
      } else {
        addNotification('خطأ في ربط Google Drive', err?.message || 'تعذر استكمال الربط مع Google حالياً.', 'error');
      }
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handlePwaInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setPwaInstalled(true);
    }
  };

  const handleLoginSuccess = (currentUser: any, accessToken: string) => {
    setUser(currentUser);
    setToken(accessToken);
    setActiveTab('dashboard');
    googleApi.setAccessToken(accessToken);
    bootstrapApp(currentUser, accessToken);
  };

  const handleLogout = async () => {
    openGlobalConfirm(
      'تسجيل الخروج',
      'هل تريد بالتأكيد تسجيل الخروج من لوحة التحكم؟',
      async () => {
        await logoutUser();
        localStorage.removeItem('custom_user_session');
        localStorage.removeItem('user_role');
        localStorage.removeItem('app_user_role');
        setUser(null);
        setToken(null);
        setRole('RESIDENT');
        localStorage.removeItem('google_access_token');
      },
      false,
      'تسجيل الخروج'
    );
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Actions wrapped to support offline queueing
  const addResident = (resident: Resident) => {
    if (role === 'RESIDENT') {
      addNotification('غير مسموح', 'لا يمتلك الساكن صلاحية إضافة سكان جدد.', 'warning');
      return;
    }
    const updatedResidents = [...residents.filter(r => r.id !== resident.id && !isSameFlatNumber(r.flatNumber, resident.flatNumber)), resident];
    setResidents(updatedResidents);
    offlineSync.saveCachedData('residents', updatedResidents);

    // Surgically update buildingLayout to include this unit in its corresponding floor
    const updatedLayout = addUnitToBuildingLayout(buildingLayout, resident.flatNumber, resident.activityType, updatedResidents);
    setBuildingLayout(updatedLayout);
    offlineSync.saveCachedData('building_layout', updatedLayout);

    const updatedConfig = { ...config, buildingLayout: updatedLayout };
    setConfig(updatedConfig);
    offlineSync.saveCachedData('config', updatedConfig);

    // Save directly to Firestore
    firestoreService.saveResidentToFirestore(resident)
      .then(() => firestoreService.saveConfigToFirestore(updatedConfig))
      .catch(err => {
        logError(err, 'addResident');
        offlineSync.enqueueAction('ADD_RESIDENT', resident);
      });

    addNotification('تسجيل ساكن جديد', `تمت إضافة الساكن ${resident.name} وحدة ${resident.flatNumber} بنجاح.`, 'success', 'registration');
  };

  const setAllResidents = async (newResidents: Resident[]) => {
    if (role === 'RESIDENT') return;
    const cleanResidents = deduplicateResidents(newResidents);
    setResidents(cleanResidents);
    offlineSync.saveCachedData('residents', cleanResidents);
    
    // Proactively clear any pending individual resident actions from the queue
    offlineSync.clearResidentActionsFromQueue();

    // Clean any discarded duplicate IDs from Firestore in background
    if (cleanResidents.length < newResidents.length) {
      const keptIds = new Set(cleanResidents.map(r => r.id));
      newResidents.forEach(r => {
        if (!keptIds.has(r.id)) {
          firestoreService.deleteResidentFromFirestore(r.id).catch(() => {});
        }
      });
    }
    
    try {
      await firestoreService.saveBatchResidentsToFirestore(cleanResidents);
    } catch (err) {
      logError(err, 'setAllResidents');
    }
  };

  const updateBuildingLayout = async (layout: FloorConfig[]) => {
    if (role === 'RESIDENT') return;
    setBuildingLayout(layout);
    offlineSync.saveCachedData('building_layout', layout);

    const updatedConfig = { ...config, buildingLayout: layout };
    setConfig(updatedConfig);
    offlineSync.saveCachedData('config', updatedConfig);

    try {
      await firestoreService.saveConfigToFirestore(updatedConfig);
    } catch (err) {
      logError(err, 'saveBuildingLayout');
    }
  };

  const editResident = (resident: Resident) => {
    if (role === 'RESIDENT') return;
    
    const existing = residents.find(r => r.id === resident.id);
    const oldFlatNumber = existing ? existing.flatNumber : resident.flatNumber;

    // Immediately persist in local state and offline cache
    const updatedResidents = residents.map((r) => (r.id === resident.id || isSameFlatNumber(r.flatNumber, resident.flatNumber)) ? resident : r);
    setResidents(updatedResidents);
    offlineSync.saveCachedData('residents', updatedResidents);

    let updatedConfig = config;
    if (!isSameFlatNumber(oldFlatNumber, resident.flatNumber)) {
      let updatedLayout = removeUnitFromBuildingLayout(buildingLayout, oldFlatNumber, updatedResidents);
      updatedLayout = addUnitToBuildingLayout(updatedLayout, resident.flatNumber, resident.activityType, updatedResidents);
      setBuildingLayout(updatedLayout);
      offlineSync.saveCachedData('building_layout', updatedLayout);

      updatedConfig = { ...config, buildingLayout: updatedLayout };
      setConfig(updatedConfig);
      offlineSync.saveCachedData('config', updatedConfig);
    }

    firestoreService.saveResidentToFirestore(resident)
      .then(() => {
        if (!isSameFlatNumber(oldFlatNumber, resident.flatNumber)) {
          return firestoreService.saveConfigToFirestore(updatedConfig);
        }
      })
      .catch(err => {
        logError(err, 'editResident');
        offlineSync.enqueueAction('EDIT_RESIDENT', resident);
      });

    addNotification('تعديل بيانات ساكن', `تم حفظ التعديلات للوحدة ${resident.flatNumber} (${resident.name}) بنجاح.`, 'success', 'registration');
  };

  const deleteResident = async (id: string) => {
    if (role === 'RESIDENT') return;
    const cleanId = String(id);
    const resident = residents.find(r => String(r.id) === cleanId);
    if (!resident) return;

    const flatToRemove = resident.flatNumber;

    // Purge from offline queue
    offlineSync.purgeEntityFromQueue(cleanId);

    // Immediately persist removal in local state and offline cache
    const updatedResidents = residents.filter((r) => String(r.id) !== cleanId);
    setResidents(updatedResidents);
    offlineSync.saveCachedData('residents', updatedResidents);

    const updatedPayments = payments.filter((p) => String(p.residentId) !== cleanId);
    setPayments(updatedPayments);
    offlineSync.saveCachedData('payments', updatedPayments);

    // Surgically remove the unit and its number from buildingLayout as well
    const updatedLayout = removeUnitFromBuildingLayout(buildingLayout, flatToRemove, updatedResidents);
    setBuildingLayout(updatedLayout);
    offlineSync.saveCachedData('building_layout', updatedLayout);

    const updatedConfig = { ...config, buildingLayout: updatedLayout };
    setConfig(updatedConfig);
    offlineSync.saveCachedData('config', updatedConfig);

    try {
      await firestoreService.deleteResidentFromFirestore(cleanId);
      await firestoreService.saveConfigToFirestore(updatedConfig);
      addNotification('حذف وحدة / ساكن', `تم حذف الوحدة ${flatToRemove} والساكن ${resident.name} نهائياً من كشف الوحدات وخريطة العمارة وجميع الجداول.`, 'info', 'registration');
    } catch (err) {
      logError(err, 'deleteResident');
      offlineSync.enqueueAction('DELETE_RESIDENT', { id: cleanId });
    }
  };

  const addPayment = (payment: Payment, base64Image?: string) => {
    const resolvedBase64 = base64Image || (payment.fileId?.startsWith('data:') ? payment.fileId : undefined);
    const cleanPayment: Payment = {
      ...payment,
      fileId: payment.fileId?.startsWith('data:') ? '' : (payment.fileId || '')
    };
    const payload = { ...cleanPayment, base64Image: resolvedBase64 };
    const localPayment: Payment = {
      ...cleanPayment,
      fileUrl: resolvedBase64 || cleanPayment.fileUrl
    };
    
    // Immediately persist in local state and offline cache
    const updatedPayments = [...payments.filter(p => p.id !== cleanPayment.id), localPayment];
    setPayments(updatedPayments);
    offlineSync.saveCachedData('payments', updatedPayments);

    // Persist directly to Firestore
    firestoreService.savePaymentToFirestore(localPayment)
      .then(() => {
        addNotification('تسجيل دفعة جديدة', `تم تسجيل دفعة بقيمة ${payment.amount} ج.م للوحدة ${payment.flatNumber} (${payment.residentName}) بنجاح.`, 'success', 'services');
      })
      .catch(err => {
        logError(err, 'addPayment');
        offlineSync.enqueueAction('ADD_PAYMENT', payload);
        addNotification('حفظ محلي (قيد المزامنة)', `تم حفظ الدفعة محلياً وسيتم رفعها لفايربيز تلقائياً.`, 'info', 'services');
      });
  };

  const editPayment = (payment: Payment, base64Image?: string) => {
    const resolvedBase64 = base64Image || (payment.fileId?.startsWith('data:') ? payment.fileId : undefined);
    const cleanPayment: Payment = {
      ...payment,
      fileId: payment.fileId?.startsWith('data:') ? '' : (payment.fileId || '')
    };
    const payload = { ...cleanPayment, base64Image: resolvedBase64 };
    const localPayment: Payment = {
      ...cleanPayment,
      fileUrl: resolvedBase64 || cleanPayment.fileUrl
    };
    const updatedPayments = payments.map((p) => p.id === cleanPayment.id ? localPayment : p);
    setPayments(updatedPayments);
    offlineSync.saveCachedData('payments', updatedPayments);

    firestoreService.savePaymentToFirestore(localPayment)
      .then(() => {
        addNotification('تعديل دفعة', `تم تحديث بيانات الدفعة للوحدة ${payment.flatNumber} بنجاح.`, 'success', 'services');
      })
      .catch(err => {
        logError(err, 'editPayment');
        offlineSync.enqueueAction('EDIT_PAYMENT', payload);
        addNotification('حفظ محلي (قيد المزامنة)', `تم تحديث الدفعة محلياً وسيتم رفعها لفايربيز تلقائياً.`, 'info', 'services');
      });
  };

  const deletePayment = async (id: string) => {
    const cleanId = String(id);
    const target = payments.find(p => String(p.id) === cleanId);
    
    offlineSync.purgeEntityFromQueue(cleanId);

    const updatedPayments = payments.filter((p) => String(p.id) !== cleanId);
    setPayments(updatedPayments);
    offlineSync.saveCachedData('payments', updatedPayments);

    try {
      await firestoreService.deletePaymentFromFirestore(cleanId);
      if (target) {
        addNotification('حذف دفعة', `تم حذف دفعة الوحدة ${target.flatNumber} بقيمة ${target.amount} ج.م نهائياً.`, 'info', 'services');
      }
    } catch (err) {
      logError(err, 'deletePayment');
      offlineSync.enqueueAction('DELETE_PAYMENT', { id: cleanId });
    }
  };

  const addExpense = (expense: Expense, base64Image?: string) => {
    const resolvedBase64 = base64Image || (expense.fileId?.startsWith('data:') ? expense.fileId : undefined);
    const cleanExpense: Expense = {
      ...expense,
      fileId: expense.fileId?.startsWith('data:') ? '' : (expense.fileId || '')
    };
    const payload = { ...cleanExpense, base64Image: resolvedBase64 };
    const localExpense: Expense = {
      ...cleanExpense,
      fileUrl: resolvedBase64 || cleanExpense.fileUrl
    };
    const updatedExpenses = [...expenses.filter(e => e.id !== cleanExpense.id), localExpense];
    setExpenses(updatedExpenses);
    offlineSync.saveCachedData('expenses', updatedExpenses);

    firestoreService.saveExpenseToFirestore(localExpense)
      .then(() => {
        addNotification('تسجيل مصروف جديد', `تم تسجيل مصروف ${expense.expenseType} بقيمة ${expense.amount} ج.م بنجاح.`, 'success', 'services');
      })
      .catch(err => {
        logError(err, 'addExpense');
        offlineSync.enqueueAction('ADD_EXPENSE', payload);
        addNotification('حفظ محلي (قيد المزامنة)', `تم حفظ المصروف محلياً وسيتم رفعه لفايربيز تلقائياً.`, 'info', 'services');
      });
  };

  const editExpense = (expense: Expense, base64Image?: string) => {
    const resolvedBase64 = base64Image || (expense.fileId?.startsWith('data:') ? expense.fileId : undefined);
    const cleanExpense: Expense = {
      ...expense,
      fileId: expense.fileId?.startsWith('data:') ? '' : (expense.fileId || '')
    };
    const payload = { ...cleanExpense, base64Image: resolvedBase64 };
    const localExpense: Expense = {
      ...cleanExpense,
      fileUrl: resolvedBase64 || cleanExpense.fileUrl
    };
    const updatedExpenses = expenses.map((e) => e.id === cleanExpense.id ? localExpense : e);
    setExpenses(updatedExpenses);
    offlineSync.saveCachedData('expenses', updatedExpenses);

    firestoreService.saveExpenseToFirestore(localExpense)
      .then(() => {
        addNotification('تعديل مصروف', `تم تحديث بيانات مصروف ${expense.expenseType} بنجاح.`, 'success', 'services');
      })
      .catch(err => {
        logError(err, 'editExpense');
        offlineSync.enqueueAction('EDIT_EXPENSE', payload);
      });
  };

  const deleteExpense = async (id: string) => {
    const cleanId = String(id);
    const target = expenses.find(e => String(e.id) === cleanId);

    offlineSync.purgeEntityFromQueue(cleanId);

    const updatedExpenses = expenses.filter((e) => String(e.id) !== cleanId);
    setExpenses(updatedExpenses);
    offlineSync.saveCachedData('expenses', updatedExpenses);

    try {
      await firestoreService.deleteExpenseFromFirestore(cleanId);
      if (target) {
        addNotification('حذف مصروف', `تم حذف مصروف ${target.expenseType} بقيمة ${target.amount} ج.م نهائياً.`, 'info', 'services');
      }
    } catch (err) {
      logError(err, 'deleteExpense');
      offlineSync.enqueueAction('DELETE_EXPENSE', { id: cleanId });
    }
  };

  // Matrix cell click actions (Quick edit statuses)
  const handleSummaryCellClick = (rId: string, m: string, currentPaid: boolean, paymentId?: string, customAmount?: number, paymentType?: string) => {
    const resident = residents.find((r) => r.id === rId);
    if (!resident) return;

    if (currentPaid && paymentId) {
      // Toggle to unpaid -> deleting record
      deletePayment(paymentId);
    } else {
      // Toggle to paid -> adding default fee or customAmount
      const pType = paymentType || 'اشتراك شهري';
      let pAmt = 200;
      if (customAmount !== undefined) {
        pAmt = customAmount;
      } else if (resident.monthlyFee && resident.monthlyFee > 0) {
        pAmt = resident.monthlyFee;
      } else if (config.defaultMonthlyFee) {
        pAmt = config.defaultMonthlyFee;
      }

      const newPay: Payment = {
        id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        year: currentYear,
        month: m,
        residentId: rId,
        residentName: resident.name,
        flatNumber: resident.flatNumber,
        paymentType: pType,
        amount: pAmt,
        receiptNumber: '',
        notes: customAmount !== undefined 
          ? `تم الدفع بقيمة مخصصة ${pAmt} ج.م (${pType})` 
          : `سداد اشتراك شهر ${m}/${currentYear}`,
        date: new Date().toISOString().split('T')[0],
        isManuallyPaid: true,
      };
      addPayment(newPay);
    }
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleText.trim()) return;

    const updatedRules = [...rules, newRuleText.trim()];
    setRules(updatedRules);
    setNewRuleText('');
    offlineSync.saveCachedData('rules', { rules: updatedRules });

    firestoreService.saveRulesToFirestore(updatedRules)
      .catch(() => offlineSync.enqueueAction('UPDATE_RULES', updatedRules));
  };

  const handleDeleteRule = (index: number) => {
    openGlobalConfirm(
      'حذف مادة من اللائحة',
      'هل تريد بالتأكيد إزالة بند التعليمات هذا من اللائحة العامة للعمارة؟',
      () => {
        const updatedRules = rules.filter((_, idx) => idx !== index);
        setRules(updatedRules);
        offlineSync.saveCachedData('rules', { rules: updatedRules });

        firestoreService.saveRulesToFirestore(updatedRules)
          .catch(() => offlineSync.enqueueAction('UPDATE_RULES', updatedRules));
      },
      true,
      'تأكيد الحذف'
    );
  };

  // Maintenance Requests Handlers
  const addMaintenanceRequest = (req: MaintenanceRequest) => {
    const updated = [...maintenanceRequests, req];
    setMaintenanceRequests(updated);
    offlineSync.saveCachedData('maintenance', updated);
    
    firestoreService.saveMaintenanceToFirestore(req)
      .catch(err => {
        logError(err, 'addMaintenanceRequest');
        offlineSync.enqueueAction('ADD_MAINTENANCE', req);
      });
    addNotification('طلب صيانة جديد', `تم تسجيل طلب الصيانة: "${req.title}" للوحدة ${req.flatNumber} بنجاح.`, 'warning', 'services');
  };

  const updateMaintenanceRequest = (id: string, updates: Partial<MaintenanceRequest>) => {
    const updated = maintenanceRequests.map(req => req.id === id ? { ...req, ...updates } : req);
    const target = updated.find(req => req.id === id);
    setMaintenanceRequests(updated);
    offlineSync.saveCachedData('maintenance', updated);
    if (target) {
      firestoreService.saveMaintenanceToFirestore(target)
        .catch(err => {
          logError(err, 'updateMaintenanceRequest');
          offlineSync.enqueueAction('EDIT_MAINTENANCE', target);
        });
    }
    addNotification('تحديث طلب الصيانة', 'تم تحديث حالة/تفاصيل طلب الصيانة بنجاح.', 'info', 'services');
  };

  const deleteMaintenanceRequest = async (id: string) => {
    const cleanId = String(id);
    const target = maintenanceRequests.find(req => String(req.id) === cleanId);
    if (!target) return;

    if (!canDeleteMaintenanceRequest(target, role, user, flatNumber)) {
      return;
    }

    offlineSync.purgeEntityFromQueue(cleanId);

    const updated = maintenanceRequests.filter(req => String(req.id) !== cleanId);
    setMaintenanceRequests(updated);
    offlineSync.saveCachedData('maintenance', updated);
    
    try {
      await firestoreService.deleteMaintenanceFromFirestore(cleanId);
    } catch (err) {
      logError(err, 'deleteMaintenanceRequest');
      offlineSync.enqueueAction('DELETE_MAINTENANCE', { id: cleanId });
    }
  };

  // Craftsmen Directory Handlers
  const addCraftsman = (craftsman: Craftsman) => {
    const updated = [...craftsmen, craftsman];
    setCraftsmen(updated);
    offlineSync.saveCachedData('craftsmen', updated);
    
    firestoreService.saveCraftsmanToFirestore(craftsman)
      .catch(err => {
        logError(err, 'addCraftsman');
        offlineSync.enqueueAction('ADD_CRAFTSMAN', craftsman);
      });
    addNotification('إضافة فني بالدليل', `تمت إضافة الفني "${craftsman.name}" (${craftsman.specialty}) لدليل الخدمات.`, 'success', 'services');
  };

  const deleteCraftsman = async (id: string) => {
    const cleanId = String(id);
    const target = craftsmen.find(c => String(c.id) === cleanId);
    if (!target) return;

    if (!canDeleteCraftsman(target, role, user, flatNumber)) {
      return;
    }

    offlineSync.purgeEntityFromQueue(cleanId);

    const updated = craftsmen.filter(c => String(c.id) !== cleanId);
    setCraftsmen(updated);
    offlineSync.saveCachedData('craftsmen', updated);
    
    try {
      await firestoreService.deleteCraftsmanFromFirestore(cleanId);
    } catch (err) {
      logError(err, 'deleteCraftsman');
      offlineSync.enqueueAction('DELETE_CRAFTSMAN', { id: cleanId });
    }
  };

  const editCraftsman = (updatedCraftsman: Craftsman) => {
    const target = craftsmen.find(c => c.id === updatedCraftsman.id);
    if (!target) return;

    if (role === 'RESIDENT') {
      const isMyCraft = (Boolean(user?.displayName) && Boolean(target.addedBy) && target.addedBy.toLowerCase().includes(user.displayName.toLowerCase().trim())) ||
        (flatNumber !== undefined && Boolean(target.addedBy) && target.addedBy.includes(String(flatNumber)));
      if (!isMyCraft) {
        return;
      }
    }

    const updated = craftsmen.map(c => c.id === updatedCraftsman.id ? updatedCraftsman : c);
    setCraftsmen(updated);
    offlineSync.saveCachedData('craftsmen', updated);
    
    firestoreService.saveCraftsmanToFirestore(updatedCraftsman)
      .catch(err => {
        logError(err, 'editCraftsman');
        offlineSync.enqueueAction('EDIT_CRAFTSMAN', updatedCraftsman);
      });
    addNotification('تعديل فني', `تم تحديث بيانات الفني "${updatedCraftsman.name}" بنجاح.`, 'info', 'services');
  };

  const addCraftsmanComment = (craftsmanId: string, comment: CraftsmanComment) => {
    const target = craftsmen.find(c => c.id === craftsmanId);
    if (!target) return;
    const updatedComments = [...(target.comments || []), comment];
    const updatedCraftsman: Craftsman = { ...target, comments: updatedComments };
    const updated = craftsmen.map(c => c.id === craftsmanId ? updatedCraftsman : c);
    setCraftsmen(updated);
    offlineSync.saveCachedData('craftsmen', updated);

    firestoreService.saveCraftsmanToFirestore(updatedCraftsman)
      .catch(err => {
        logError(err, 'addCraftsmanComment');
        offlineSync.enqueueAction('EDIT_CRAFTSMAN', updatedCraftsman);
      });
    addNotification('تقييم وتعليق على فني', `تمت إضافة تقييم للفني "${target.name}" بنجاح.`, 'success', 'services');
  };

  // Polls Handlers
  const addPoll = (poll: Poll) => {
    const updated = [poll, ...polls];
    setPolls(updated);
    offlineSync.saveCachedData('polls', updated);
    
    firestoreService.savePollToFirestore(poll)
      .catch(err => {
        logError(err, 'addPoll');
        offlineSync.enqueueAction('ADD_POLL', poll);
      });
    addNotification('طرح استبيان جديد', `تم نشر تصويت جديد بعنوان: "${poll.title}".`, 'info', 'communication');
  };

  const votePoll = (pollId: string, optionId: string, email: string) => {
    let updatedPoll: Poll | null = null;
    const updated = polls.map(p => {
      if (p.id !== pollId) return p;
      // Prevent multiple voting
      if (p.userVotes[email]) return p;
      
      const userVotes = { ...p.userVotes, [email]: optionId };
      const options = p.options.map(opt => opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt);
      updatedPoll = { ...p, userVotes, options };
      return updatedPoll;
    });
    
    setPolls(updated);
    offlineSync.saveCachedData('polls', updated);
    if (updatedPoll) {
      firestoreService.savePollToFirestore(updatedPoll)
        .catch(err => {
          logError(err, 'votePoll');
          offlineSync.enqueueAction('EDIT_POLL', updatedPoll);
        });
      const optionText = (updatedPoll as Poll).options.find(o => o.id === optionId)?.text || '';
      addNotification('تصويت في الاستبيان', `تم تسجيل صوت على الخيار "${optionText}" في: "${(updatedPoll as Poll).title}"`, 'success', 'communication');
    }
  };

  const closePoll = (pollId: string) => {
    let updatedPoll: Poll | null = null;
    const updated = polls.map(p => {
      if (p.id === pollId) {
        updatedPoll = { ...p, status: 'CLOSED' as const };
        return updatedPoll;
      }
      return p;
    });
    setPolls(updated);
    offlineSync.saveCachedData('polls', updated);
    if (updatedPoll) {
      firestoreService.savePollToFirestore(updatedPoll)
        .catch(err => {
          logError(err, 'closePoll');
          offlineSync.enqueueAction('EDIT_POLL', updatedPoll);
        });
    }
  };

  const reopenPoll = (pollId: string) => {
    let updatedPoll: Poll | null = null;
    const updated = polls.map(p => {
      if (p.id === pollId) {
        updatedPoll = { ...p, status: 'ACTIVE' as const };
        return updatedPoll;
      }
      return p;
    });
    setPolls(updated);
    offlineSync.saveCachedData('polls', updated);
    if (updatedPoll) {
      firestoreService.savePollToFirestore(updatedPoll)
        .catch(err => {
          logError(err, 'reopenPoll');
          offlineSync.enqueueAction('EDIT_POLL', updatedPoll);
        });
    }
  };

  const deletePoll = async (pollId: string) => {
    const cleanId = String(pollId);
    const target = polls.find(p => String(p.id) === cleanId);
    if (!target || !canDeletePoll(target, role)) return;

    offlineSync.purgeEntityFromQueue(cleanId);

    const updated = polls.filter(p => String(p.id) !== cleanId);
    setPolls(updated);
    offlineSync.saveCachedData('polls', updated);
    
    try {
      await firestoreService.deletePollFromFirestore(cleanId);
    } catch (err) {
      logError(err, 'deletePoll');
      offlineSync.enqueueAction('DELETE_POLL', { id: cleanId });
    }
  };

  // Administrative Decisions Handlers
  const addDecision = (decision: AdminDecision) => {
    const updated = [decision, ...decisions];
    setDecisions(updated);
    offlineSync.saveCachedData('admin_decisions', updated);
    
    firestoreService.saveDecisionToFirestore(decision)
      .catch(err => {
        logError(err, 'addDecision');
        offlineSync.enqueueAction('ADD_DECISION', decision);
      });
    addNotification('إصدار قرار إداري', `تم اعتماد ونشر القرار الإداري "${decision.title}".`, 'info', 'communication');
  };

  const editDecision = (decision: AdminDecision) => {
    const updated = decisions.map(d => d.id === decision.id ? decision : d);
    setDecisions(updated);
    offlineSync.saveCachedData('admin_decisions', updated);
    
    firestoreService.saveDecisionToFirestore(decision)
      .catch(err => {
        logError(err, 'editDecision');
        offlineSync.enqueueAction('EDIT_DECISION', decision);
      });
  };

  const deleteDecision = async (id: string) => {
    const cleanId = String(id);
    const target = decisions.find(d => String(d.id) === cleanId);
    if (!target || !canDeleteDecision(target, role)) return;

    offlineSync.purgeEntityFromQueue(cleanId);

    const updated = decisions.filter(d => String(d.id) !== cleanId);
    setDecisions(updated);
    offlineSync.saveCachedData('admin_decisions', updated);
    
    try {
      await firestoreService.deleteDecisionFromFirestore(cleanId);
    } catch (err) {
      logError(err, 'deleteDecision');
      offlineSync.enqueueAction('DELETE_DECISION', { id: cleanId });
    }
  };

  // Building Events Handlers
  const addBuildingEvent = (newEvent: BuildingEvent) => {
    const updated = [newEvent, ...events];
    setEvents(updated);
    offlineSync.saveCachedData('events', updated);
    
    firestoreService.saveEventToFirestore(newEvent)
      .catch(err => {
        logError(err, 'addBuildingEvent');
        offlineSync.enqueueAction('ADD_EVENT', newEvent);
      });
    addNotification('إضافة حدث بالتقويم', `تمت إضافة موعد "${newEvent.title}" لتقويم العمارة.`, 'info', 'communication');
  };

  const updateBuildingEvent = (id: string, updates: Partial<BuildingEvent>) => {
    const updated = events.map(ev => ev.id === id ? { ...ev, ...updates } : ev);
    const target = updated.find(ev => ev.id === id);
    setEvents(updated);
    offlineSync.saveCachedData('events', updated);
    if (target) {
      firestoreService.saveEventToFirestore(target)
        .catch(err => {
          logError(err, 'updateBuildingEvent');
          offlineSync.enqueueAction('EDIT_EVENT', target);
        });
    }
  };

  const deleteBuildingEvent = async (id: string) => {
    const cleanId = String(id);
    offlineSync.purgeEntityFromQueue(cleanId);

    const updated = events.filter(ev => String(ev.id) !== cleanId);
    setEvents(updated);
    offlineSync.saveCachedData('events', updated);
    
    try {
      await firestoreService.deleteEventFromFirestore(cleanId);
    } catch (err) {
      logError(err, 'deleteBuildingEvent');
      offlineSync.enqueueAction('DELETE_EVENT', { id: cleanId });
    }
  };

  // Save custom App Config helper
  const handleSaveAppConfig = (updatedConfig: AppConfig) => {
    // Check if any activity type was renamed or deleted to update residents accordingly
    const oldTypes = config.activityTypes || [];
    const newTypes = updatedConfig.activityTypes || [];
    let updatedResidents = [...residents];
    let residentsChanged = false;

    if (oldTypes.length === newTypes.length) {
      // Find if one item was renamed
      let renamedFrom: string | null = null;
      let renamedTo: string | null = null;
      for (let i = 0; i < oldTypes.length; i++) {
        if (oldTypes[i] !== newTypes[i]) {
          renamedFrom = oldTypes[i];
          renamedTo = newTypes[i];
          break;
        }
      }
      if (renamedFrom && renamedTo) {
        updatedResidents = residents.map(r => {
          if (r.activityType === renamedFrom) {
            residentsChanged = true;
            return { ...r, activityType: renamedTo! };
          }
          return r;
        });
      }
    } else if (newTypes.length < oldTypes.length) {
      // Find deleted types
      const deletedTypes = oldTypes.filter(t => !newTypes.includes(t));
      if (deletedTypes.length > 0) {
        const fallbackType = newTypes[0] || 'سكني';
        updatedResidents = residents.map(r => {
          if (deletedTypes.includes(r.activityType)) {
            residentsChanged = true;
            return { ...r, activityType: fallbackType };
          }
          return r;
        });
      }
    }

    // Sync admin resident profile to corresponding resident if exists - strictly DO NOT auto-create duplicate
    if (updatedConfig.adminResidentProfile) {
      const prof = updatedConfig.adminResidentProfile;
      const targetFlat = prof.flatNumber;
      const existingIdx = updatedResidents.findIndex(r => isSameFlatNumber(r.flatNumber, targetFlat));
      if (existingIdx !== -1) {
        residentsChanged = true;
        updatedResidents[existingIdx] = {
          ...updatedResidents[existingIdx],
          name: prof.name || updatedResidents[existingIdx].name,
          phone: prof.phone !== undefined ? prof.phone : updatedResidents[existingIdx].phone,
          activityType: prof.activityType || updatedResidents[existingIdx].activityType,
          ownershipType: prof.ownershipType || updatedResidents[existingIdx].ownershipType,
          notes: prof.notes || updatedResidents[existingIdx].notes || 'رئيس اتحاد الملاك',
          monthlyFee: prof.monthlyFee !== undefined && prof.monthlyFee > 0 ? prof.monthlyFee : updatedResidents[existingIdx].monthlyFee,
          initialBalance: prof.initialBalance !== undefined ? prof.initialBalance : updatedResidents[existingIdx].initialBalance,
        };
      }

      // If in resident mode or if active flatNumber matches, update flatNumber
      if (role === 'RESIDENT' || role === 'ADMIN') {
        setFlatNumber(targetFlat);
        localStorage.setItem('resident_flat_number', String(targetFlat));
      }
    }

    // Always ensure zero duplicates in residents
    const cleanUniqueResidents = deduplicateResidents(updatedResidents);
    if (cleanUniqueResidents.length !== updatedResidents.length) {
      residentsChanged = true;
      updatedResidents = cleanUniqueResidents;
    }

    if (residentsChanged) {
      setResidents(updatedResidents);
      offlineSync.saveCachedData('residents', updatedResidents);
      firestoreService.saveBatchResidentsToFirestore(updatedResidents).catch(() => {});
    }

    setConfig(updatedConfig);
    offlineSync.saveCachedData('config', updatedConfig);
    addNotification('تم حفظ الإعدادات', 'تم حفظ وتحديث إعدادات النظام بنجاح.', 'success');
    
    firestoreService.saveConfigToFirestore(updatedConfig)
      .catch(() => offlineSync.enqueueAction('UPDATE_CONFIG', updatedConfig));
  };

  // User identity display helpers across role views
  const getUserDisplayName = () => {
    if (role === 'ASSISTANT') return 'المساعد الفني';
    if (role === 'ADMIN') {
      const raw = user?.displayName || config.adminResidentProfile?.name || 'وحيد سماحة';
      return raw.replace(/\s*\(رئيس الاتحاد\)/g, '').replace(/\s*رئيس الاتحاد\s*\(/g, '').trim();
    }
    
    // RESIDENT
    if ((user as any)?.residentType === 'TENANT' && currentResidentObj?.tenantName) {
      return currentResidentObj.tenantName;
    }
    if (currentResidentObj?.name) {
      return currentResidentObj.name.replace(/\s*\(رئيس الاتحاد\)/g, '').trim();
    }
    if (user?.displayName) {
      return user.displayName.replace(/\s*\(رئيس الاتحاد\)/g, '').trim();
    }
    return `ساكن وحدة ${flatNumber || '?'}`;
  };

  const getUserFlatLabel = () => {
    if (role === 'ASSISTANT') return 'فني الصيانة';
    if (role === 'ADMIN') return 'إدارة الاتحاد';
    const flat = flatNumber || currentResidentObj?.flatNumber;
    return flat !== undefined && flat !== '' ? `شقة ${flat}` : 'ساكن العمارة';
  };

  // Chat room and complaints board handlers
  const handleSendChatMessage = (text: string, imageUrl?: string) => {
    const isBase64 = Boolean(imageUrl && imageUrl.startsWith('data:'));
    const senderName = getUserDisplayName();
    const senderFlat = getUserFlatLabel();

    const safeMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      senderName,
      flatNumber: senderFlat,
      text,
      imageUrl: imageUrl,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => {
      const map = new Map<string, ChatMessage>();
      prev.forEach(m => map.set(m.id, m));
      map.set(safeMsg.id, safeMsg);
      const updated = Array.from(map.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      offlineSync.saveCachedData('chat_messages', updated);
      return updated;
    });

    // Sync to backend server if active
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: safeMsg }),
      }).catch(() => {});
    }

    // Save directly to Firestore cloud database
    firestoreService.saveChatMessageToFirestore(safeMsg).catch(err => {
      logError(err, 'handleSendChatMessage');
      offlineSync.enqueueAction('ADD_CHAT_MESSAGE', safeMsg);
    });

    addNotification(
      'رسالة دردشة جديدة',
      `${safeMsg.senderName} (${senderFlat}): "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`,
      'info',
      'chat'
    );
  };

  const handleAddComplaint = (title: string, description: string, isAnonymous?: boolean, imageUrl?: string) => {
    const residentName = isAnonymous 
      ? 'فاعل خير (مجهول)' 
      : getUserDisplayName();

    const senderFlat = isAnonymous 
      ? undefined 
      : getUserFlatLabel();

    const safeComplaint: PublicComplaint = {
      id: `comp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title,
      description,
      flatNumber: senderFlat,
      residentName,
      isAnonymous,
      imageUrl: imageUrl,
      date: new Date().toISOString().split('T')[0],
      comments: [],
    };
    setComplaints(prev => {
      const map = new Map<string, PublicComplaint>();
      map.set(safeComplaint.id, safeComplaint);
      prev.forEach(c => map.set(c.id, c));
      const updated = Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      offlineSync.saveCachedData('public_complaints', updated);
      return updated;
    });

    // Sync directly to backend server if active
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complaint: safeComplaint }),
      }).catch(() => {});
    }

    // Save directly to Firestore cloud database
    firestoreService.saveComplaintToFirestore(safeComplaint).catch(err => {
      logError(err, 'handleAddComplaint');
      offlineSync.enqueueAction('ADD_COMPLAINT', safeComplaint);
    });

    addNotification('شكوى ومقترح جديد', `قام ${safeComplaint.residentName} (${senderFlat || 'مجهول'}) بنشر موضوع: "${title}"`, 'warning', 'communication');
  };

  const handleAddCommentToComplaint = (complaintId: string, text: string) => {
    const commentSenderName = getUserDisplayName();

    const newComment: ComplaintComment = {
      id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      senderName: commentSenderName,
      text,
      timestamp: new Date().toISOString(),
    };
    let targetComplaint: PublicComplaint | null = null;
    const updated = complaints.map(c => {
      if (c.id === complaintId) {
        targetComplaint = {
          ...c,
          comments: [...(c.comments || []), newComment],
        };
        return targetComplaint;
      }
      return c;
    });
    setComplaints(updated);
    offlineSync.saveCachedData('public_complaints', updated);

    // Sync to backend server if active
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      fetch(`/api/complaints/${complaintId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: newComment }),
      }).catch(() => {});
    }

    if (targetComplaint) {
      addNotification(
        'تعليق ورد جديد على شكوى',
        `${newComment.senderName} علّق على شكوى "${(targetComplaint as PublicComplaint).title}": "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`,
        'info',
        'communication'
      );
      firestoreService.saveComplaintToFirestore(targetComplaint).catch(err => {
        logError(err, 'handleAddCommentToComplaint');
        offlineSync.enqueueAction('EDIT_COMPLAINT', targetComplaint);
      });
    }
  };

  const handleEditCommentOfComplaint = (complaintId: string, commentId: string, newText: string) => {
    let targetComplaint: PublicComplaint | null = null;
    const updated = complaints.map(c => {
      if (c.id === complaintId) {
        targetComplaint = {
          ...c,
          comments: (c.comments || []).map(comm => comm.id === commentId ? { ...comm, text: newText } : comm)
        };
        return targetComplaint;
      }
      return c;
    });
    setComplaints(updated);
    offlineSync.saveCachedData('public_complaints', updated);

    if (targetComplaint) {
      firestoreService.saveComplaintToFirestore(targetComplaint).catch(err => {
        logError(err, 'handleEditCommentOfComplaint');
        offlineSync.enqueueAction('EDIT_COMPLAINT', targetComplaint);
      });
    }
  };

  const handleDeleteCommentOfComplaint = (complaintId: string, commentId: string) => {
    let targetComplaint: PublicComplaint | null = null;
    const updated = complaints.map(c => {
      if (c.id === complaintId) {
        targetComplaint = {
          ...c,
          comments: (c.comments || []).filter(comm => comm.id !== commentId)
        };
        return targetComplaint;
      }
      return c;
    });
    setComplaints(updated);
    offlineSync.saveCachedData('public_complaints', updated);

    if (targetComplaint) {
      firestoreService.saveComplaintToFirestore(targetComplaint).catch(err => {
        logError(err, 'handleDeleteCommentOfComplaint');
        offlineSync.enqueueAction('EDIT_COMPLAINT', targetComplaint);
      });
    }
  };

  const handleDeleteComplaint = async (complaintId: string) => {
    const cleanId = String(complaintId);
    const target = complaints.find(c => String(c.id) === cleanId);
    if (!target) return;

    if (!canDeleteComplaint(target, role, user, flatNumber)) {
      return;
    }

    markComplaintAsDeleted(cleanId);
    offlineSync.purgeEntityFromQueue(cleanId);

    const updated = complaints.filter(c => String(c.id) !== cleanId);
    setComplaints(updated);
    offlineSync.saveCachedData('public_complaints', updated);

    // Delete from backend server API if active
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      fetch(`/api/complaints/${cleanId}`, {
        method: 'DELETE',
      }).catch(() => {});
    }

    try {
      await firestoreService.deleteComplaintFromFirestore(cleanId);
    } catch (err) {
      logError(err, 'handleDeleteComplaint');
      offlineSync.enqueueAction('DELETE_COMPLAINT', { id: cleanId });
    }
  };

  const handleDeleteChatMessage = async (messageId: string) => {
    const cleanId = String(messageId);
    const target = messages.find(m => String(m.id) === cleanId);
    if (!target) return;

    if (!canDeleteChatMessage(target, role, user, flatNumber)) {
      return;
    }

    markMessageAsDeleted(cleanId);
    offlineSync.purgeEntityFromQueue(cleanId);

    const updated = messages.filter(m => String(m.id) !== cleanId);
    setMessages(updated);
    offlineSync.saveCachedData('chat_messages', updated);

    // Delete from backend server API if active
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      fetch(`/api/chat/${cleanId}`, {
        method: 'DELETE',
      }).catch(() => {});
    }

    try {
      await firestoreService.deleteChatMessageFromFirestore(cleanId);
    } catch (err) {
      logError(err, 'handleDeleteChatMessage');
      offlineSync.enqueueAction('DELETE_CHAT_MESSAGE', { id: cleanId });
    }
  };

  const handleEditChatMessage = (messageId: string, newText: string) => {
    let targetMsg: ChatMessage | null = null;
    const updated = messages.map(m => {
      if (m.id === messageId) {
        targetMsg = { ...m, text: newText };
        return targetMsg;
      }
      return m;
    });
    setMessages(updated);
    offlineSync.saveCachedData('chat_messages', updated);

    // Update in backend server API if active
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      fetch(`/api/chat/${messageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText }),
      }).catch(() => {});
    }

    if (targetMsg) {
      firestoreService.saveChatMessageToFirestore(targetMsg).catch(err => {
        logError(err, 'handleEditChatMessage');
      });
    }
  };

  const handleAddMessageReply = (messageId: string, text: string) => {
    const reply = {
      id: `rep_${Date.now()}`,
      senderName: getUserDisplayName(),
      senderRole: role,
      flatNumber: getUserFlatLabel(),
      text,
      timestamp: new Date().toISOString()
    };

    let targetMsg: ChatMessage | null = null;
    const updated = messages.map(m => {
      if (m.id === messageId) {
        const oldReplies = m.replies || [];
        targetMsg = {
          ...m,
          replies: [...oldReplies, reply]
        };
        return targetMsg;
      }
      return m;
    });

    setMessages(updated);
    offlineSync.saveCachedData('chat_messages', updated);

    if (targetMsg) {
      firestoreService.saveChatMessageToFirestore(targetMsg).catch(err => {
        logError(err, 'handleAddMessageReply');
      });
    }
  };

  const handleEditMessageReply = (messageId: string, replyId: string, text: string) => {
    let targetMsg: ChatMessage | null = null;
    const updated = messages.map(m => {
      if (m.id === messageId) {
        const oldReplies = m.replies || [];
        const updatedReplies = oldReplies.map(r => r.id === replyId ? { ...r, text } : r);
        targetMsg = {
          ...m,
          replies: updatedReplies
        };
        return targetMsg;
      }
      return m;
    });

    setMessages(updated);
    offlineSync.saveCachedData('chat_messages', updated);

    if (targetMsg) {
      firestoreService.saveChatMessageToFirestore(targetMsg).catch(err => {
        logError(err, 'handleEditMessageReply');
      });
    }
  };

  const handleDeleteMessageReply = (messageId: string, replyId: string) => {
    let targetMsg: ChatMessage | null = null;
    const updated = messages.map(m => {
      if (m.id === messageId) {
        const oldReplies = m.replies || [];
        const updatedReplies = oldReplies.filter(r => r.id !== replyId);
        targetMsg = {
          ...m,
          replies: updatedReplies
        };
        return targetMsg;
      }
      return m;
    });

    setMessages(updated);
    offlineSync.saveCachedData('chat_messages', updated);

    if (targetMsg) {
      firestoreService.saveChatMessageToFirestore(targetMsg).catch(err => {
        logError(err, 'handleDeleteMessageReply');
      });
    }
  };

  // Stats summaries
  const totalReceived = payments
    .filter((p) => p.year === currentYear && (viewMode === 'year' || p.month === String(currentMonth + 1).padStart(2, '0')))
    .reduce((sum, p) => sum + p.amount, 0);

  const totalSpent = expenses
    .filter((e) => e.year === currentYear && (viewMode === 'year' || e.month === String(currentMonth + 1).padStart(2, '0')))
    .reduce((sum, e) => sum + e.amount, 0);

  const currentSafeBalance = totalReceived - totalSpent;

  // Dynamic Unit Activity Statistical Breakdown
  const unitActivityStats = useMemo(() => {
    const counts: Record<string, number> = {};

    // 1. Calculate counts from residents list
    residents.forEach(res => {
      const act = (res.activityType || 'سكني').trim();
      counts[act] = (counts[act] || 0) + 1;
    });

    // 2. Derive all floor units to find vacant/unregistered ones if any
    const effectiveFloors = Array.isArray(buildingLayout)
      ? buildingLayout
      : deriveFloorConfigsFromResidents(residents);

    const registeredUnitNumbers = new Set(residents.map(r => String(r.flatNumber).trim()));

    effectiveFloors.forEach(floor => {
      const units = getUnitNumbersForFloor(floor);
      units.forEach(uStr => {
        if (!registeredUnitNumbers.has(String(uStr).trim())) {
          counts['شاغرة'] = (counts['شاغرة'] || 0) + 1;
        }
      });
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    const list = Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([activity, count]) => ({
        activity,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalUnits: total,
      breakdown: list,
    };
  }, [residents, buildingLayout]);

  const getActivityTheme = (activity: string, index: number) => {
    if (activity === 'سكني') {
      return {
        barBg: 'bg-blue-600',
        badgeBg: 'bg-blue-50 text-blue-800 border-blue-200',
        dotBg: 'bg-blue-600',
        textColor: 'text-blue-900',
      };
    }
    if (activity === 'سكني مغلق') {
      return {
        barBg: 'bg-indigo-500',
        badgeBg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        dotBg: 'bg-indigo-500',
        textColor: 'text-indigo-900',
      };
    }
    if (activity === 'تجاري') {
      return {
        barBg: 'bg-emerald-600',
        badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotBg: 'bg-emerald-600',
        textColor: 'text-emerald-900',
      };
    }
    if (activity === 'إداري') {
      return {
        barBg: 'bg-purple-600',
        badgeBg: 'bg-purple-50 text-purple-800 border-purple-200',
        dotBg: 'bg-purple-600',
        textColor: 'text-purple-900',
      };
    }
    if (activity === 'مفروش') {
      return {
        barBg: 'bg-fuchsia-500',
        badgeBg: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
        dotBg: 'bg-fuchsia-500',
        textColor: 'text-fuchsia-900',
      };
    }
    if (activity === 'تحت التشطيب' || (activity.includes('تشطيب') && !activity.includes('بدون'))) {
      return {
        barBg: 'bg-amber-500',
        badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
        dotBg: 'bg-amber-500',
        textColor: 'text-amber-900',
      };
    }
    if (activity === 'بدون تشطيب') {
      return {
        barBg: 'bg-slate-600',
        badgeBg: 'bg-slate-100 text-slate-800 border-slate-200',
        dotBg: 'bg-slate-600',
        textColor: 'text-slate-900',
      };
    }
    if (activity === 'شاغرة' || activity.includes('شاغر')) {
      return {
        barBg: 'bg-slate-800',
        badgeBg: 'bg-slate-200 text-slate-900 border-slate-300',
        dotBg: 'bg-slate-800',
        textColor: 'text-slate-900',
      };
    }

    const fallbacks = [
      { barBg: 'bg-cyan-600', badgeBg: 'bg-cyan-50 text-cyan-800 border-cyan-200', dotBg: 'bg-cyan-600', textColor: 'text-cyan-900' },
      { barBg: 'bg-rose-500', badgeBg: 'bg-rose-50 text-rose-800 border-rose-200', dotBg: 'bg-rose-500', textColor: 'text-rose-900' },
      { barBg: 'bg-teal-600', badgeBg: 'bg-teal-50 text-teal-800 border-teal-200', dotBg: 'bg-teal-600', textColor: 'text-teal-900' },
      { barBg: 'bg-sky-600', badgeBg: 'bg-sky-50 text-sky-800 border-sky-200', dotBg: 'bg-sky-600', textColor: 'text-sky-900' },
      { barBg: 'bg-lime-600', badgeBg: 'bg-lime-50 text-lime-800 border-lime-200', dotBg: 'bg-lime-600', textColor: 'text-lime-900' },
      { barBg: 'bg-orange-500', badgeBg: 'bg-orange-50 text-orange-800 border-orange-200', dotBg: 'bg-orange-500', textColor: 'text-orange-900' },
    ];
    return fallbacks[index % fallbacks.length];
  };

  // Chart data formatting
  const monthsAbbr = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const monthNamesArabic = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  const chartData = monthsAbbr.map((m, idx) => ({
    name: monthNamesArabic[idx],
    التحصيلات: payments.filter((p) => p.year === currentYear && p.month === m).reduce((sum, p) => sum + p.amount, 0),
    المصروفات: expenses.filter((e) => e.year === currentYear && e.month === m).reduce((sum, e) => sum + e.amount, 0),
  }));

  // Filtering for Resident view only
  const filteredResidentPayments = payments.filter(p => p.year === currentYear && (!flatNumber || isSameFlatNumber(p.flatNumber, flatNumber)));

  // Resolve the resident/tenant object for the current logged in user
  const currentResidentObj = useMemo(() => {
    // 1. Try finding by active flatNumber state
    const activeFlat = flatNumber !== undefined && flatNumber !== '' ? flatNumber : (role === 'ADMIN' ? config.adminResidentProfile?.flatNumber : undefined);
    if (activeFlat !== undefined && activeFlat !== '') {
      const found = residents.find(r => isSameFlatNumber(r.flatNumber, activeFlat));
      if (found) return found;
    }
    // 2. Try finding by cached localStorage flatNumber
    const cached = localStorage.getItem('resident_flat_number');
    if (cached) {
      const found = residents.find(r => isSameFlatNumber(r.flatNumber, cached));
      if (found) return found;
    }
    // 3. Try finding by user object flatNumber
    if ((user as any)?.flatNumber) {
      const userFlat = (user as any).flatNumber;
      const found = residents.find(r => isSameFlatNumber(r.flatNumber, userFlat));
      if (found) return found;
    }
    // 4. Try matching by user email with owner or tenant email
    if (user?.email) {
      const uEmail = user.email.toLowerCase().trim();
      const found = residents.find(r => 
        ((r as any).email && (r as any).email.toLowerCase().trim() === uEmail) ||
        ((r as any).tenantEmail && (r as any).tenantEmail.toLowerCase().trim() === uEmail)
      );
      if (found) return found;
    }
    // 5. Try matching by user displayName with owner or tenant name
    if (user?.displayName) {
      const uName = user.displayName.toLowerCase().trim();
      const found = residents.find(r => 
        (r.name && r.name.toLowerCase().trim() === uName) ||
        (r.tenantName && r.tenantName.toLowerCase().trim() === uName)
      );
      if (found) return found;
    }

    // 6. If user is in RESIDENT mode, construct a fallback resident using the logged-in resident's details
    if (role === 'RESIDENT' && user) {
      const resFlat = (user as any).flatNumber || flatNumber || 101;
      return {
        id: `res_user_${resFlat}`,
        flatNumber: resFlat,
        name: user.displayName || 'ساكن العمارة',
        phone: '',
        activityType: 'سكني',
        ownershipType: 'تمليك',
        monthlyFee: config.defaultMonthlyFee || 400,
        initialBalance: 0,
        notes: 'ساكن في اتحاد الملاك',
      } as Resident;
    }

    // 7. If user is ADMIN, construct fallback resident from adminResidentProfile
    if (role === 'ADMIN' && config.adminResidentProfile) {
      const p = config.adminResidentProfile;
      return {
        id: `res_admin_${p.flatNumber || 207}`,
        flatNumber: p.flatNumber || 207,
        name: (p.name || 'وحيد سماحة').replace(/\s*\(رئيس الاتحاد\)/g, '').trim(),
        phone: p.phone || '',
        activityType: p.activityType || 'سكني',
        ownershipType: p.ownershipType || 'تمليك',
        monthlyFee: p.monthlyFee !== undefined && p.monthlyFee > 0 ? p.monthlyFee : (config.defaultMonthlyFee || 400),
        initialBalance: p.initialBalance || 0,
        notes: p.notes || 'رئيس اتحاد الملاك',
      } as Resident;
    }

    return undefined;
  }, [residents, flatNumber, user, role, config.adminResidentProfile, config.defaultMonthlyFee]);

  // Keep flatNumber in sync if currentResidentObj was resolved
  useEffect(() => {
    if (currentResidentObj && flatNumber !== currentResidentObj.flatNumber) {
      setFlatNumber(currentResidentObj.flatNumber);
      localStorage.setItem('resident_flat_number', String(currentResidentObj.flatNumber));
    }
  }, [currentResidentObj, flatNumber]);

  // Unified community navigation and metrics across all communication and service views
  const communityCounts = {
    chat: messages.length,
    maintenance: maintenanceRequests.length,
    craftsmen: craftsmen.length,
    complaints: complaints.length,
    polls: polls.length,
    decisions: decisions.length,
    calendar: events.length,
  };

  const handleNavigateCommunity = (serviceId: string) => {
    switch (serviceId) {
      case 'chat':
        setChatSubTab('room');
        setActiveTab('chat');
        break;
      case 'complaints':
        setChatSubTab('complaints');
        setActiveTab('chat');
        break;
      case 'maintenance':
        setMaintenanceSubTab('requests');
        setActiveTab('maintenance');
        break;
      case 'craftsmen':
        setMaintenanceSubTab('directory');
        setActiveTab('maintenance');
        break;
      case 'polls':
        setPollsSubTab('polls');
        setActiveTab('polls');
        break;
      case 'decisions':
        setPollsSubTab('decisions');
        setActiveTab('polls');
        break;
      case 'calendar':
        setActiveTab('calendar');
        break;
      default:
        break;
    }
  };

  const handleSelectNotification = (notif: AppNotification) => {
    // Close notification panel immediately
    setShowNotifications(false);

    // Mark notification as read
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
    );

    const titleMsg = ((notif.title || '') + ' ' + (notif.message || '')).toLowerCase();
    const category = notif.category;

    if (category === 'chat' || titleMsg.includes('دردشة') || titleMsg.includes('رسالة') || titleMsg.includes('رساله') || titleMsg.includes('محادثة')) {
      setChatSubTab('room');
      setActiveTab('chat');
    } else if (titleMsg.includes('شكوى') || titleMsg.includes('شكاوى') || titleMsg.includes('مقترح')) {
      setChatSubTab('complaints');
      setActiveTab('chat');
    } else if (titleMsg.includes('صيانة') || titleMsg.includes('طلب صيانة') || category === 'services') {
      if (titleMsg.includes('صناعي') || titleMsg.includes('دليل') || titleMsg.includes('حرفي')) {
        setMaintenanceSubTab('directory');
      } else {
        setMaintenanceSubTab('requests');
      }
      setActiveTab('maintenance');
    } else if (titleMsg.includes('استبيان') || titleMsg.includes('استطلاع') || titleMsg.includes('تصويت')) {
      setPollsSubTab('polls');
      setActiveTab('polls');
    } else if (titleMsg.includes('قرار') || titleMsg.includes('قرارات')) {
      setPollsSubTab('decisions');
      setActiveTab('polls');
    } else if (titleMsg.includes('حدث') || titleMsg.includes('فعالية') || titleMsg.includes('تقويم') || titleMsg.includes('تاريخ')) {
      setActiveTab('calendar');
    } else if (category === 'registration' || titleMsg.includes('ساكن') || titleMsg.includes('انضمام') || titleMsg.includes('تسجيل')) {
      setActiveTab('residents');
    } else if (titleMsg.includes('تحصيل') || titleMsg.includes('إيصال') || titleMsg.includes('سداد') || titleMsg.includes('اشتراك') || titleMsg.includes('دفعة')) {
      setActiveTab('payments');
    } else if (titleMsg.includes('مصروف') || titleMsg.includes('فاتورة') || titleMsg.includes('صرف')) {
      setActiveTab('expenses');
    } else if (category === 'communication') {
      setPollsSubTab('polls');
      setActiveTab('polls');
    } else {
      setActiveTab('dashboard');
    }
  };

  // Authentication Gate:
  // 1. If actively checking/initializing auth on cold start, show graceful loading screen (never flash Login)
  if (isInitializingAuth) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-[#0b1329] flex flex-col items-center justify-center p-6 text-right select-none" dir="rtl">
        <div className="bg-white dark:bg-[#111a2e] p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xl max-w-sm w-full text-center space-y-5 animate-fade-in">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-900 to-indigo-900 dark:from-blue-800 dark:to-indigo-950 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-900/20">
            <Building2 className="w-8 h-8 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-blue-950 dark:text-white">{config?.buildingName || localStorage.getItem('active_building_name') || 'اتحاد ملاك بيراميدز فيو ١'}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1.5 leading-relaxed">
              جاري مزامنة واستعادة جلسة العمل بأمان...
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center justify-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
            <span>يرجى الانتظار لحظة...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Only show Login when definitely unauthenticated
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-[#0b1329]">
      
      {/* Top responsive banner / header */}
      <AppHeader
        buildingName={config?.buildingName || localStorage.getItem("active_building_name") || "بيراميدز فيو ١"}
        firebaseStatus={firebaseStatus}
        onRetrySync={triggerBackgroundSync}
        userDisplayName={getUserDisplayName()}
        userRoleLabel={role === "ADMIN" ? "إدارة الملاك" : role === "ASSISTANT" ? "المساعد الفني" : role === "MANAGER" ? "مدير العمارة" : getUserFlatLabel()}
        isBackgroundSyncing={isBackgroundSyncing}
        isOnline={isOnline}
        syncing={syncing}
        activeTab={activeTab}
        onNavigateTab={setActiveTab}
        unreadNotificationsCount={visibleNotifications.length}
        onOpenNotifications={() => setShowNotifications(true)}
        isMenuOpen={mobileMenuOpen}
        onToggleMenu={() => setMenuOpen(!mobileMenuOpen)}
      />

      {/* Navigation Drawer */}
      <NavigationDrawer
        isOpen={mobileMenuOpen}
        onClose={() => setMenuOpen(false)}
        buildingName={config?.buildingName || localStorage.getItem("active_building_name") || "بيراميدز فيو ١"}
        activeTab={activeTab}
        onNavigateTab={setActiveTab}
        onNavigatePollsTab={(sub) => setPollsSubTab(sub)}
        role={role}
        expandedSections={expandedSections}
        onToggleSection={toggleSection}
        onOpenRules={() => setShowRulesReadModal(true)}
        userName={role === "ASSISTANT" ? "المساعد الفني" : (user?.displayName || "")}
        onLogout={handleLogout}
      />

      {/* Main Application Stage */}
      <main className={`flex-1 max-w-full mx-auto w-full ${activeTab === "chat" ? "px-1 sm:px-1.5 py-1 sm:py-1.5 space-y-2" : "px-1 sm:px-1.5 py-3 space-y-3.5"}`} dir="rtl">
        {/* PWA install prompt */}
        <PwaInstallPrompt
          pwaInstalled={pwaInstalled}
          deferredPrompt={deferredPrompt}
          isIosDevice={isIosDevice}
          buildingName={config?.buildingName || localStorage.getItem("active_building_name") || "إدارة الملاك"}
          onInstall={handlePwaInstall}
        />



                {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <Dashboard
            currentYear={currentYear}
            setCurrentYear={setCurrentYear}
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            viewMode={viewMode}
            setViewMode={setViewMode}
            residents={residents}
            payments={payments}
            expenses={expenses}
            config={config}
            role={role}
            currentResidentObj={currentResidentObj}
            reportResidentId={reportResidentId}
            setReportResidentId={setReportResidentId}
            unitActivityStats={unitActivityStats}
            getActivityTheme={getActivityTheme}
            totalReceived={totalReceived}
            totalSpent={totalSpent}
            currentSafeBalance={currentSafeBalance}
            messages={messages}
            maintenanceRequests={maintenanceRequests}
            craftsmen={craftsmen}
            decisions={decisions}
            complaints={complaints}
            polls={polls}
            events={events}
            onNavigateTab={setActiveTab}
            onSetChatSubTab={setChatSubTab}
            onSetMaintenanceSubTab={setMaintenanceSubTab}
            onSetPollsSubTab={setPollsSubTab}
            onSelectActivityModal={setSelectedActivityModal}
            onPreviewImage={handlePreviewImage}
          />
        )}

        {/* Residents Tab */}
        {activeTab === 'residents' && (
          <ResidentsList 
            residents={residents}
            payments={payments}
            config={config}
            activityTypes={config.activityTypes}
            role={role}
            onAdd={addResident}
            onSetAll={setAllResidents}
            onEdit={editResident}
            onDelete={deleteResident}
            floorConfigs={buildingLayout}
            onSetFloorConfigs={updateBuildingLayout}
          />
        )}

        {/* Debts Report Tab */}
        {activeTab === 'debts-report' && (
          <DebtsReport 
            residents={residents}
            payments={payments}
            config={config}
            role={role}
            floorConfigs={buildingLayout}
            currentYear={currentYear}
            onSetAllResidents={setAllResidents}
          />
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <PaymentsList 
            payments={payments}
            residents={residents}
            paymentTypes={config.paymentTypes}
            role={role}
            currentYear={currentYear}
            floorConfigs={buildingLayout}
            config={config}
            onAdd={addPayment}
            onEdit={editPayment}
            onDelete={deletePayment}
            onPreviewImage={handlePreviewImage}
          />
        )}

        {/* Expenses Tab */}
        {activeTab === 'expenses' && (
          <ExpensesList 
            expenses={expenses}
            expenseTypes={config.expenseTypes}
            role={role}
            currentYear={currentYear}
            residents={residents}
            onAdd={addExpense}
            onEdit={editExpense}
            onDelete={deleteExpense}
            onPreviewImage={handlePreviewImage}
          />
        )}

        {/* Summaries Tab */}
        {activeTab === 'summaries' && (
          <Summaries 
            residents={residents}
            payments={payments}
            expenses={expenses}
            currentYear={currentYear}
            role={role}
            onCellClick={handleSummaryCellClick}
            onAddPayment={addPayment}
            floorConfigs={buildingLayout}
            expenseTypes={config.expenseTypes}
            onEditPayment={editPayment}
            onDeletePayment={deletePayment}
            activityDefaultFees={config.activityDefaultFees}
            defaultMonthlyFee={config.defaultMonthlyFee}
            paymentTypes={config.paymentTypes}
            config={config}
          />
        )}


        {/* History Tab */}
        {activeTab === 'history' && (
          <History 
            payments={payments}
            expenses={expenses}
          />
        )}

        {/* Maintenance Tab */}
        {activeTab === 'maintenance' && (
          <MaintenanceRequests 
            requests={maintenanceRequests}
            role={role}
            flatNumber={getUserFlatLabel()}
            userName={getUserDisplayName()}
            defaultSubTab={maintenanceSubTab}
            onAddRequest={addMaintenanceRequest}
            onUpdateRequest={updateMaintenanceRequest}
            onDeleteRequest={deleteMaintenanceRequest}
            craftsmen={craftsmen}
            onAddCraftsman={addCraftsman}
            onEditCraftsman={editCraftsman}
            onDeleteCraftsman={deleteCraftsman}
            onAddCraftsmanComment={addCraftsmanComment}
            onNavigateCommunity={handleNavigateCommunity}
            communityCounts={communityCounts}
          />
        )}

        {/* Voting Polls & Admin Decisions Tab */}
        {activeTab === 'polls' && (
          <VotingPolls 
            polls={polls}
            decisions={decisions}
            role={role}
            userEmail={user?.email || ''}
            defaultSubTab={pollsSubTab}
            onAddPoll={addPoll}
            onVote={votePoll}
            onClosePoll={closePoll}
            onReopenPoll={reopenPoll}
            onDeletePoll={deletePoll}
            onAddDecision={addDecision}
            onEditDecision={editDecision}
            onDeleteDecision={deleteDecision}
            onNavigateCommunity={handleNavigateCommunity}
            communityCounts={communityCounts}
          />
        )}

        {/* Events Calendar Tab */}
        {activeTab === 'calendar' && (
          <EventsCalendar 
            events={events}
            role={role}
            onAddEvent={addBuildingEvent}
            onUpdateEvent={updateBuildingEvent}
            onDeleteEvent={deleteBuildingEvent}
            onNavigateCommunity={handleNavigateCommunity}
            communityCounts={communityCounts}
          />
        )}

        {/* Chat & Complaints Tab */}
        {activeTab === 'chat' && (
          <Chat 
            messages={messages}
            complaints={complaints}
            role={role}
            flatNumber={getUserFlatLabel()}
            userName={getUserDisplayName()}
            defaultSubTab={chatSubTab}
            onSubTabChange={setChatSubTab}
            onSendMessage={handleSendChatMessage}
            onAddComplaint={handleAddComplaint}
            onAddComment={handleAddCommentToComplaint}
            onEditComment={handleEditCommentOfComplaint}
            onDeleteComment={handleDeleteCommentOfComplaint}
            onDeleteComplaint={handleDeleteComplaint}
            onDeleteMessage={handleDeleteChatMessage}
            onEditMessage={handleEditChatMessage}
            onAddMessageReply={handleAddMessageReply}
            onEditMessageReply={handleEditMessageReply}
            onDeleteMessageReply={handleDeleteMessageReply}
            onPreviewImage={handlePreviewImage}
            onNavigateCommunity={handleNavigateCommunity}
            communityCounts={communityCounts}
          />
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <SettingsTab 
            config={config}
            role={role}
            userEmail={user?.email || ''}
            onSaveConfig={handleSaveAppConfig}
            onNotification={addNotification}
            rules={rules}
            isDarkMode={isDarkMode}
            onToggleTheme={handleToggleTheme}
            onAddRule={(text) => {
              const updatedRules = [...rules, text];
              setRules(updatedRules);
              offlineSync.saveCachedData('rules', { rules: updatedRules });
              firestoreService.saveRulesToFirestore(updatedRules)
                .catch(() => offlineSync.enqueueAction('UPDATE_RULES', updatedRules));
              addNotification('تحديث اللائحة', 'تمت إضافة مادة جديدة للائحة تعليمات العمارة.', 'success');
            }}
            onDeleteRule={handleDeleteRule}
            onOpenEditRulesModal={() => setShowRulesEditModal(true)}
            onRefreshAllData={refreshAllData}
          />
        )}

      </main>

      {/* Global In-App Confirmation Modal */}
      <ConfirmModal 
        isOpen={globalConfirm.isOpen}
        title={globalConfirm.title}
        message={globalConfirm.message}
        onConfirm={globalConfirm.onConfirm}
        onCancel={() => setGlobalConfirm(prev => ({ ...prev, isOpen: false }))}
        isDestructive={globalConfirm.isDestructive}
        confirmLabel={globalConfirm.confirmLabel}
      />

      {/* Intelligent Alerts Side Bar */}
      {showNotifications && (
        <NotificationCenter 
          notifications={visibleNotifications}
          role={role}
          flatNumber={getUserFlatLabel()}
          onDismiss={(id) => setNotifications((prev) => prev.filter((n) => n.id !== id))}
          onClearAll={() => setNotifications((prev) => role === 'ASSISTANT' ? prev.filter(n => n.category === 'chat' || n.category === 'communication') : [])}
          onClose={() => setShowNotifications(false)}
          onSelectNotification={handleSelectNotification}
        />
      )}

            {/* High-Resolution Document & Image Preview Overlay */}
      <ImagePreviewModal
        imageUrl={previewImage}
        isLoading={previewLoading}
        onClose={closePreview}
      />

            {/* Building Rules Modals */}
      <BuildingRulesModal
        isOpen={showRulesReadModal}
        mode="view"
        rules={rules}
        role={role}
        onClose={() => setShowRulesReadModal(false)}
      />

      <BuildingRulesModal
        isOpen={showRulesEditModal}
        mode="edit"
        rules={rules}
        role={role}
        onClose={() => setShowRulesEditModal(false)}
        onAddRule={(text) => {
          const updatedRules = [...rules, text];
          setRules(updatedRules);
          offlineSync.saveCachedData('rules', { rules: updatedRules });
          firestoreService.saveRulesToFirestore(updatedRules)
            .catch(() => offlineSync.enqueueAction('UPDATE_RULES', updatedRules));
          addNotification('تحديث اللائحة', 'تمت إضافة مادة جديدة للائحة تعليمات العمارة.', 'success');
        }}
        onDeleteRule={handleDeleteRule}
      />

            {/* Modal for Selected Activity Units */}
      <ActivityUnitsModal
        activity={selectedActivityModal}
        residents={residents}
        buildingLayout={buildingLayout}
        onClose={() => setSelectedActivityModal(null)}
        onNavigateToResidents={() => setActiveTab('residents')}
      />

      {/* Footer (Rendered across all pages including complaints & suggestions box; hidden only in live chat room for full-screen messaging) */}
      {(activeTab !== 'chat' || chatSubTab === 'complaints') && (
        <footer className="bg-white dark:bg-[#111a2e] border-t border-slate-100 dark:border-slate-800 py-3 text-center mt-auto">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-extrabold">
            مع تحيات مجلس إدارة {config?.buildingName || localStorage.getItem('active_building_name') || 'اتحاد ملاك بيراميدز فيو ١'}
          </p>
        </footer>
      )}
    </div>
  );
}
