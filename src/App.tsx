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

import { initAuth, logoutUser, googleSignIn } from './services/firebaseConfig';
import * as firestoreService from './services/firestoreService';
import * as backupService from './services/backupService';
import * as googleApi from './services/googleApi';
import * as offlineSync from './services/offlineSync';
import { fetchAllJoinRequests } from './services/authStore';
import { getActiveBuilding } from './services/buildingStore';
import { UserRole, Resident, Payment, Expense, AppNotification, BuildingRules, AppConfig, MaintenanceRequest, Poll, AdminDecision, BuildingEvent, ChatMessage, PublicComplaint, ComplaintComment, FloorConfig, Craftsman, CraftsmanComment } from './types';

// Importing Custom Components
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
import { calculateResidentFinancials } from './utils/financialCalculations';
import { removeUnitFromBuildingLayout, addUnitToBuildingLayout, compareFlatNumbers, isSameFlatNumber, parseFlatNumber, getUnitNumbersForFloor, deriveFloorConfigsFromResidents } from './utils/buildingStructure';
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
  return localStorage.getItem('google_access_token') || (localStorage.getItem('custom_user_session') ? 'local-token' : null);
};

const getInitialRole = (initialUser: User | null): UserRole => {
  if (!initialUser) return 'RESIDENT';
  if ((initialUser as any).role) return (initialUser as any).role;
  const email = initialUser.email?.toLowerCase().trim();
  const activeB = getActiveBuilding();
  if (email && activeB?.presidentEmail && email === activeB.presidentEmail.toLowerCase().trim()) return 'ADMIN';
  if (email === 'assistant@pyramids.com' || email === 'assistant') return 'ASSISTANT';
  return 'RESIDENT';
};

const getInitialFlatNumber = (initialUser: User | null): number | string | undefined => {
  if (!initialUser) return undefined;
  if ((initialUser as any).flatNumber) return (initialUser as any).flatNumber;
  const cached = localStorage.getItem('resident_flat_number');
  if (cached) return cached;
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
          .filter(r => !['1', '2', '3'].includes(String(r.id)) || (r.name !== 'محمد أحمد' && r.name !== 'خالد مصطفى' && r.name !== 'سمير عبد الله'))
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
      return raw && Array.isArray(raw) ? raw.filter(p => p.id !== 'p1') : [];
    } catch {
      return [];
    }
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const raw = offlineSync.getCachedData<Expense[]>('expenses');
      return raw && Array.isArray(raw) ? raw.filter(e => e.id !== 'e1') : [];
    } catch {
      return [];
    }
  });

  // New features states initialized synchronously
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>(() => {
    try {
      const raw = offlineSync.getCachedData<MaintenanceRequest[]>('maintenance');
      return raw && Array.isArray(raw) ? raw.filter(m => !m.id.startsWith('req_seed_')) : [];
    } catch {
      return [];
    }
  });

  const [craftsmen, setCraftsmen] = useState<Craftsman[]>(() => {
    try {
      return offlineSync.getCachedData<Craftsman[]>('craftsmen') || [];
    } catch {
      return [];
    }
  });

  const [polls, setPolls] = useState<Poll[]>(() => {
    try {
      const raw = offlineSync.getCachedData<Poll[]>('polls');
      return raw && Array.isArray(raw) ? raw.filter(p => !p.id.startsWith('poll_seed_')) : [];
    } catch {
      return [];
    }
  });

  const [decisions, setDecisions] = useState<AdminDecision[]>(() => {
    try {
      const raw = offlineSync.getCachedData<AdminDecision[]>('admin_decisions');
      return raw && Array.isArray(raw) ? raw.filter(d => !d.id.startsWith('dec_seed_')) : [];
    } catch {
      return [];
    }
  });

  const [events, setEvents] = useState<BuildingEvent[]>(() => {
    try {
      const raw = offlineSync.getCachedData<BuildingEvent[]>('events');
      return raw && Array.isArray(raw) ? raw.filter(e => !e.id.startsWith('ev_seed_')) : [];
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
      return raw && Array.isArray(raw) ? raw.filter(m => !m.id.startsWith('msg_seed_') && !delSet.has(m.id)) : [];
    } catch {
      return [];
    }
  });

  const [complaints, setComplaints] = useState<PublicComplaint[]>(() => {
    try {
      const raw = offlineSync.getCachedData<PublicComplaint[]>('public_complaints');
      const delSet = getDeletedComplaintIds();
      return raw && Array.isArray(raw) ? raw.filter(c => !c.id.startsWith('comp_seed_') && !delSet.has(c.id)) : [];
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

  // Sync residents to server for backend auth verification
  useEffect(() => {
    if (residents && residents.length > 0) {
      try {
        fetch('/api/residents/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ residents }),
        }).catch(() => {});
      } catch {}
    }
  }, [residents]);

  // Periodic polling to sync chat messages and complaints for all users
  useEffect(() => {
    let isMounted = true;
    const fetchLatestChatAndComplaints = async () => {
      try {
        const [chatRes, compRes] = await Promise.all([
          fetch('/api/chat').then(r => r.ok ? r.json() : null).catch(() => null),
          fetch('/api/complaints').then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        if (!isMounted) return;

        const deletedMsgIds = deletedMessageIdsRef.current;
        const deletedCompIds = deletedComplaintIdsRef.current;

        if (chatRes && Array.isArray(chatRes)) {
          setMessages(prev => {
            // Filter out any locally deleted messages from server response
            const validServer = chatRes.filter((m: any) => m && m.id && !deletedMsgIds.has(m.id));
            const serverIdSet = new Set(validServer.map(m => m.id));

            // Map by unique message ID to guarantee zero duplicates
            const map = new Map<string, ChatMessage>();

            // 1. Keep local messages that aren't deleted
            // If the server explicitly returned an empty or updated list, only retain very recent local items (< 15s) that may not have reached server yet
            const now = Date.now();
            prev.forEach(m => {
              if (m && m.id && !deletedMsgIds.has(m.id)) {
                const msgTime = new Date(m.timestamp).getTime();
                const isRecent = (now - msgTime) < 15000;
                // If it's on the server or recently created locally, keep it
                if (serverIdSet.has(m.id) || isRecent) {
                  map.set(m.id, m);
                }
              }
            });

            // 2. Merge server messages with unique ID indexing
            validServer.forEach((m: ChatMessage) => {
              const existing = map.get(m.id);
              if (existing) {
                // Preserve local image preview if server URL is still propagating
                map.set(m.id, {
                  ...existing,
                  ...m,
                  imageUrl: (m.imageUrl && !m.imageUrl.startsWith('data:')) ? m.imageUrl : (existing.imageUrl || m.imageUrl),
                });
              } else {
                map.set(m.id, m);
              }
            });

            const merged = Array.from(map.values())
              .filter(m => m && m.id && !deletedMsgIds.has(m.id))
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            const isDifferent = merged.length !== prev.length || 
              merged.some((m, idx) => !prev[idx] || prev[idx].id !== m.id || prev[idx].text !== m.text || prev[idx].imageUrl !== m.imageUrl);

            if (isDifferent) {
              offlineSync.saveCachedData('chat_messages', merged);
              return merged;
            }
            return prev;
          });
        }

        if (compRes && Array.isArray(compRes)) {
          setComplaints(prev => {
            const validServer = compRes.filter((c: any) => c && c.id && !deletedCompIds.has(c.id));
            const serverIdSet = new Set(validServer.map(c => c.id));
            const map = new Map<string, PublicComplaint>();

            const now = Date.now();
            prev.forEach(c => {
              if (c && c.id && !deletedCompIds.has(c.id)) {
                const compTime = new Date(c.date).getTime();
                const isRecent = (now - compTime) < 15000;
                if (serverIdSet.has(c.id) || isRecent) {
                  map.set(c.id, c);
                }
              }
            });

            validServer.forEach((c: PublicComplaint) => {
              const existing = map.get(c.id);
              if (existing) {
                map.set(c.id, {
                  ...existing,
                  ...c,
                  imageUrl: (c.imageUrl && !c.imageUrl.startsWith('data:')) ? c.imageUrl : (existing.imageUrl || c.imageUrl),
                  comments: c.comments || existing.comments || [],
                });
              } else {
                map.set(c.id, c);
              }
            });

            const merged = Array.from(map.values())
              .filter(c => c && c.id && !deletedCompIds.has(c.id))
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            const isDifferent = merged.length !== prev.length || 
              merged.some((c, idx) => !prev[idx] || prev[idx].id !== c.id || prev[idx].title !== c.title || (prev[idx].comments?.length || 0) !== (c.comments?.length || 0));

            if (isDifferent) {
              offlineSync.saveCachedData('public_complaints', merged);
              return merged;
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn('Error polling chat/complaints:', err);
      }
    };

    fetchLatestChatAndComplaints();
    const interval = setInterval(fetchLatestChatAndComplaints, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

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
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });

  // Touch gesture & mouse dragging refs for image preview
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const touchStartPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPinchingRef = useRef<boolean>(false);
  const isMouseDownRef = useRef<boolean>(false);
  const mouseStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const mouseStartPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapRef = useRef<number>(0);

  const handleStageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      isPinchingRef.current = true;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = previewZoom;
    } else if (e.touches.length === 1) {
      isPinchingRef.current = false;
      touchStartPosRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      touchStartPanRef.current = { ...previewPan };

      // Double-tap toggle zoom
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        if (previewZoom > 1) {
          setPreviewZoom(1);
          setPreviewPan({ x: 0, y: 0 });
        } else {
          setPreviewZoom(2.5);
        }
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
  };

  const handleStageTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (touchStartDistRef.current > 0) {
        const ratio = currentDist / touchStartDistRef.current;
        const newZoom = Math.min(5, Math.max(0.5, touchStartZoomRef.current * ratio));
        setPreviewZoom(newZoom);
        if (newZoom <= 1) {
          setPreviewPan({ x: 0, y: 0 });
        }
      }
    } else if (
      e.touches.length === 1 &&
      !isPinchingRef.current &&
      touchStartPosRef.current &&
      previewZoom > 1
    ) {
      const dx = e.touches[0].clientX - touchStartPosRef.current.x;
      const dy = e.touches[0].clientY - touchStartPosRef.current.y;
      setPreviewPan({
        x: touchStartPanRef.current.x + dx,
        y: touchStartPanRef.current.y + dy,
      });
    }
  };

  const handleStageTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      touchStartDistRef.current = null;
    }
    if (e.touches.length === 0) {
      touchStartPosRef.current = null;
      isPinchingRef.current = false;
    }
  };

  const handleStageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (previewZoom > 1) {
      isMouseDownRef.current = true;
      mouseStartPosRef.current = { x: e.clientX, y: e.clientY };
      mouseStartPanRef.current = { ...previewPan };
    }
  };

  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMouseDownRef.current && mouseStartPosRef.current && previewZoom > 1) {
      const dx = e.clientX - mouseStartPosRef.current.x;
      const dy = e.clientY - mouseStartPosRef.current.y;
      setPreviewPan({
        x: mouseStartPanRef.current.x + dx,
        y: mouseStartPanRef.current.y + dy,
      });
    }
  };

  const handleStageMouseUp = () => {
    isMouseDownRef.current = false;
    mouseStartPosRef.current = null;
  };

  const handleStageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const delta = -e.deltaY;
    setPreviewZoom((prev) => {
      const next = Math.min(5, Math.max(0.5, prev + (delta > 0 ? 0.25 : -0.25)));
      if (next <= 1) setPreviewPan({ x: 0, y: 0 });
      return next;
    });
  };

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
    setPreviewZoom(1);
    setPreviewRotation(0);
    setPreviewPan({ x: 0, y: 0 });
    
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
    setPreviewZoom(1);
    setPreviewRotation(0);
    setPreviewPan({ x: 0, y: 0 });
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
  const [showIosPwaGuide, setShowIosPwaGuide] = useState(false);
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
        .filter(r => !['1', '2', '3'].includes(String(r.id)) || (r.name !== 'محمد أحمد' && r.name !== 'خالد مصطفى' && r.name !== 'سمير عبد الله'))
        .map(r => ({
          ...r,
          notes: (r.notes || '').includes('توليد تلقائي') ? '' : (r.notes || '')
        }));
      setResidents(cleaned);
      syncApprovedRequestsWithResidents(cleaned).then(res => setResidents(res));
    } else {
      syncApprovedRequestsWithResidents([]).then(res => setResidents(res));
    }
    if (rawPayments) {
      setPayments(rawPayments.filter(p => p.id !== 'p1'));
    }
    if (rawExpenses) {
      setExpenses(rawExpenses.filter(e => e.id !== 'e1'));
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
    if (localRules) setRules(localRules.rules);
    if (localLayout) setBuildingLayout(localLayout);

    // Maintenance requests (clean - no seed data)
    if (rawMaintenance) {
      setMaintenanceRequests(rawMaintenance.filter(m => !m.id.startsWith('req_seed_')));
    } else {
      setMaintenanceRequests([]);
    }

    // Polls (clean - no seed data)
    if (rawPolls) {
      setPolls(rawPolls.filter(p => !p.id.startsWith('poll_seed_')));
    } else {
      setPolls([]);
    }

    // Admin decisions (clean - no seed data)
    if (rawDecisions) {
      setDecisions(rawDecisions.filter(d => !d.id.startsWith('dec_seed_')));
    } else {
      setDecisions([]);
    }

    // Events (clean - no seed data)
    if (rawEvents) {
      setEvents(rawEvents.filter(e => !e.id.startsWith('ev_seed_')));
    } else {
      setEvents([]);
    }

    // Load Chat Messages and Complaints from Cache (clean - no seed data)
    const rawMessages = offlineSync.getCachedData<ChatMessage[]>('chat_messages');
    const rawComplaints = offlineSync.getCachedData<PublicComplaint[]>('public_complaints');

    if (rawMessages) {
      setMessages(rawMessages.filter(m => !m.id.startsWith('msg_seed_')));
    } else {
      setMessages([]);
    }

    if (rawComplaints) {
      setComplaints(rawComplaints.filter(c => !c.id.startsWith('comp_seed_')));
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
    const handleGoogleAuthError = async () => {
      console.warn('Google auth credentials expired or invalid. Logging out.');
      addNotification('انتهت صلاحية الجلسة', 'انتهت صلاحية صلاحيات الوصول لحساب Google الخاص بك. يرجى تسجيل الدخول مجدداً لتحديث الاتصال بالبيانات.', 'error');
      try {
        await logoutUser();
      } catch (err) {
        console.error('Error during automatic logout:', err);
      }
      localStorage.removeItem('custom_user_session');
      setUser(null);
      setToken(null);
      setRole('RESIDENT');
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
        addNotification('تمت المزامنة بنجاح', `تم دمج ومزامنة عدد ${syncedCount} من العمليات بنجاح مع Google Sheets!`, 'success');
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

  // Setup/Bootstrap app database
  const bootstrapApp = async (currentUser: User, accessToken: string, isBackground = false) => {
    if (accessToken) {
      googleApi.setAccessToken(accessToken);
    }
    if (!isBackground) {
      setIsInitializingAuth(true);
    } else {
      setIsBackgroundSyncing(true);
    }
    try {
      if (!currentUser) {
        const cachedConfig = offlineSync.getCachedData<AppConfig>('config');
        if (cachedConfig) setConfig(cachedConfig);
        const cachedLayout = offlineSync.getCachedData<any[]>('building_layout');
        if (cachedLayout) setBuildingLayout(cachedLayout);
        return;
      }

      // Load configurations from Firestore (Primary Cloud Store)
      let appConfig = await firestoreService.getConfigFromFirestore();
      if (!appConfig) {
        const cached = offlineSync.getCachedData<AppConfig>('config');
        const activeB = getActiveBuilding();
        appConfig = cached || {
          admins: activeB.presidentEmail ? [activeB.presidentEmail] : [],
          managers: [],
          expenseTypes: ['صيانة مصاعد', 'نظافة', 'كهرباء خدمات', 'حراسة وأمن', 'صيانة مياه ومضخات', 'أخرى'],
          paymentTypes: ['تحصيل شهري', 'مساهمة طارئة', 'تبرع', 'أخرى'],
          activityTypes: ['سكني', 'سكني مغلق', 'مفروش', 'إداري', 'تجاري', 'بدون تشطيب'],
          defaultMonthlyFee: 400,
          accountingStartDate: '2026-01-01',
          buildingLayout: [],
        };
      }
      setConfig(appConfig);
      if (appConfig.buildingLayout && appConfig.buildingLayout.length > 0) {
        setBuildingLayout(appConfig.buildingLayout);
        offlineSync.saveCachedData('building_layout', appConfig.buildingLayout);
      }
      offlineSync.saveCachedData('config', appConfig);

      const email = currentUser.email?.toLowerCase().trim() || '';
      let detectedRole: UserRole = 'RESIDENT';

      const activeB = getActiveBuilding();
      const isPresident = (activeB.presidentEmail && email === activeB.presidentEmail.toLowerCase().trim()) || appConfig.admins.some(a => a.toLowerCase().trim() === email);

      if (
        (currentUser as any).role === 'ASSISTANT' ||
        (appConfig.assistantConfig && appConfig.assistantConfig.email?.toLowerCase().trim() === email) ||
        email === 'assistant@pyramids.com' ||
        email === 'assistant'
      ) {
        detectedRole = 'ASSISTANT';
      } else if (
        (currentUser as any).role === 'ADMIN' ||
        isPresident
      ) {
        detectedRole = 'ADMIN';
        const adminFlat = appConfig.adminResidentProfile?.flatNumber || (currentUser as any).flatNumber || 101;
        setFlatNumber(adminFlat);
        localStorage.setItem('resident_flat_number', String(adminFlat));
      } else if (
        (currentUser as any).role === 'MANAGER' ||
        appConfig.managers.some(m => m.toLowerCase().trim() === email)
      ) {
        detectedRole = 'MANAGER';
      } else {
        detectedRole = 'RESIDENT';
        // Auto filter or restore flat number
        const cachedFlat = (currentUser as any).flatNumber || localStorage.getItem('resident_flat_number');
        if (cachedFlat) {
          setFlatNumber(String(cachedFlat));
        }
      }

      setRole(detectedRole);

      // Refresh all Firestore records smoothly
      await refreshAllData();

    } catch (err: any) {
      if (err?.message?.includes('لم يتم تسجيل الدخول') || err?.message?.includes('الجلسة') || err?.message?.includes('Session expired')) {
        console.warn('Bootstrap skipped due to session status:', err.message);
      } else {
        logError(err, 'bootstrapApp');
      }
    } finally {
      setIsInitializingAuth(false);
      setIsBackgroundSyncing(false);
      // Run background sync for any queued offline items
      triggerBackgroundSync();
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
        const found = list.find(r => isSameFlatNumber(r.flatNumber, req.flatNumber));
        if (!found) {
          changed = true;
          const resName = req.residentType === 'OWNER' ? (req.ownerName || 'ساكن جديد') : (req.tenantName || 'ساكن جديد');
          const resPhone = formatMobileNumber(req.residentType === 'OWNER' ? req.ownerPhone : (req.tenantPhone || ''));
          const newRes: Resident = {
            id: `res_req_${req.id}`,
            flatNumber: req.flatNumber,
            name: resName,
            phone: resPhone,
            activityType: 'سكني',
            ownershipType: req.residentType === 'OWNER' ? 'تمليك' : 'إيجار',
            tenantName: req.residentType === 'TENANT' ? req.tenantName : '',
            tenantPhone: formatMobileNumber(req.tenantPhone || ''),
            monthlyFee: config?.defaultMonthlyFee || 400,
            initialBalance: 0,
            notes: 'تم الانضمام عبر طلب التسجيل الإلكتروني المعتمد',
          };
          list.push(newRes);
          // Persist to Firestore automatically
          firestoreService.saveResidentToFirestore(newRes).catch(() => {});
        }
      }

      if (changed) {
        offlineSync.saveCachedData('residents', list);
      }
      return list;
    } catch {
      return currentResidents;
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
      } = await firestoreService.getAllDataFromFirestore();

      const syncedResidents = await syncApprovedRequestsWithResidents(loadedResidents);

      setResidents(syncedResidents);
      setPayments(loadedPayments);
      setExpenses(loadedExpenses);
      setRules(loadedRules);
      setCraftsmen(loadedCraftsmen);
      const delMsgIds = deletedMessageIdsRef.current;
      const delCompIds = deletedComplaintIdsRef.current;
      const safeLoadedMessages = loadedMessages ? loadedMessages.filter(m => !delMsgIds.has(m.id)) : [];
      const safeLoadedComplaints = loadedComplaints ? loadedComplaints.filter(c => !delCompIds.has(c.id)) : [];

      if (loadedMessages) setMessages(safeLoadedMessages);
      if (loadedDecisions) setDecisions(loadedDecisions);
      if (loadedPolls) setPolls(loadedPolls);
      if (loadedComplaints) setComplaints(safeLoadedComplaints);
      if (loadedMaintenance) setMaintenanceRequests(loadedMaintenance);
      if (loadedEvents) setEvents(loadedEvents);

      // Save to offline storage
      offlineSync.saveCachedData('residents', syncedResidents);
      offlineSync.saveCachedData('payments', loadedPayments);
      offlineSync.saveCachedData('expenses', loadedExpenses);
      offlineSync.saveCachedData('rules', { rules: loadedRules });
      offlineSync.saveCachedData('craftsmen', loadedCraftsmen);
      if (loadedMessages) offlineSync.saveCachedData('chat_messages', safeLoadedMessages);
      if (loadedDecisions) offlineSync.saveCachedData('admin_decisions', loadedDecisions);
      if (loadedPolls) offlineSync.saveCachedData('polls', loadedPolls);
      if (loadedComplaints) offlineSync.saveCachedData('public_complaints', safeLoadedComplaints);
      if (loadedMaintenance) offlineSync.saveCachedData('maintenance', loadedMaintenance);
      if (loadedEvents) offlineSync.saveCachedData('events', loadedEvents);

    } catch (err) {
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
          `نطاق موقعك (${domain}) غير مصرح به في Firebase Console. يرجى إضافته إلى Authorized Domains في إعدادات المشروع gen-lang-client-0491644540 ليتمكن Google من إتمام المزامنة السحابية.`,
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

  const setAllResidents = (newResidents: Resident[]) => {
    if (role === 'RESIDENT') return;
    setResidents(newResidents);
    offlineSync.saveCachedData('residents', newResidents);
    
    // Proactively clear any pending individual resident actions from the queue
    offlineSync.clearResidentActionsFromQueue();
    
    firestoreService.saveBatchResidentsToFirestore(newResidents)
      .catch(err => {
        logError(err, 'setAllResidents');
      });
  };

  const updateBuildingLayout = (layout: FloorConfig[]) => {
    if (role === 'RESIDENT') return;
    setBuildingLayout(layout);
    offlineSync.saveCachedData('building_layout', layout);

    const updatedConfig = { ...config, buildingLayout: layout };
    setConfig(updatedConfig);
    offlineSync.saveCachedData('config', updatedConfig);

    firestoreService.saveConfigToFirestore(updatedConfig)
      .catch(err => logError(err, 'saveBuildingLayout'));
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

  const deleteResident = (id: string) => {
    if (role === 'RESIDENT') return;
    const resident = residents.find(r => r.id === id);
    if (!resident) return;

    const flatToRemove = resident.flatNumber;

    // Immediately persist removal in local state and offline cache
    const updatedResidents = residents.filter((r) => r.id !== id);
    setResidents(updatedResidents);
    offlineSync.saveCachedData('residents', updatedResidents);

    const updatedPayments = payments.filter((p) => p.residentId !== id);
    setPayments(updatedPayments);
    offlineSync.saveCachedData('payments', updatedPayments);

    // Surgically remove the unit and its number from buildingLayout as well
    const updatedLayout = removeUnitFromBuildingLayout(buildingLayout, flatToRemove, updatedResidents);
    setBuildingLayout(updatedLayout);
    offlineSync.saveCachedData('building_layout', updatedLayout);

    const updatedConfig = { ...config, buildingLayout: updatedLayout };
    setConfig(updatedConfig);
    offlineSync.saveCachedData('config', updatedConfig);

    firestoreService.deleteResidentFromFirestore(id)
      .then(() => firestoreService.saveConfigToFirestore(updatedConfig))
      .catch(err => {
        logError(err, 'deleteResident');
        offlineSync.enqueueAction('DELETE_RESIDENT', { id });
      });

    addNotification('حذف وحدة / ساكن', `تم حذف الوحدة ${flatToRemove} والساكن ${resident.name} نهائياً من كشف الوحدات وخريطة العمارة وجميع الجداول.`, 'info', 'registration');
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
      .catch(err => {
        logError(err, 'addPayment');
        offlineSync.enqueueAction('ADD_PAYMENT', payload);
      });

    addNotification('تسجيل دفعة جديدة', `تم تسجيل دفعة بقيمة ${payment.amount} ج.م للوحدة ${payment.flatNumber} (${payment.residentName}) بنجاح.`, 'success', 'services');
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
      .catch(err => {
        logError(err, 'editPayment');
        offlineSync.enqueueAction('EDIT_PAYMENT', payload);
      });

    addNotification('تعديل دفعة', `تم تحديث بيانات الدفعة للوحدة ${payment.flatNumber} بنجاح.`, 'success', 'services');
  };

  const deletePayment = (id: string) => {
    const target = payments.find(p => p.id === id);
    const updatedPayments = payments.filter((p) => p.id !== id);
    setPayments(updatedPayments);
    offlineSync.saveCachedData('payments', updatedPayments);

    firestoreService.deletePaymentFromFirestore(id)
      .catch(err => {
        logError(err, 'deletePayment');
        offlineSync.enqueueAction('DELETE_PAYMENT', { id });
      });

    if (target) {
      addNotification('حذف دفعة', `تم حذف دفعة الوحدة ${target.flatNumber} بقيمة ${target.amount} ج.م.`, 'info', 'services');
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
      .catch(err => {
        logError(err, 'addExpense');
        offlineSync.enqueueAction('ADD_EXPENSE', payload);
      });

    addNotification('تسجيل مصروف جديد', `تم تسجيل مصروف ${expense.expenseType} بقيمة ${expense.amount} ج.م بنجاح.`, 'success', 'services');
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
      .catch(err => {
        logError(err, 'editExpense');
        offlineSync.enqueueAction('EDIT_EXPENSE', payload);
      });

    addNotification('تعديل مصروف', `تم تحديث بيانات مصروف ${expense.expenseType} بنجاح.`, 'success', 'services');
  };

  const deleteExpense = (id: string) => {
    const target = expenses.find(e => e.id === id);
    const updatedExpenses = expenses.filter((e) => e.id !== id);
    setExpenses(updatedExpenses);
    offlineSync.saveCachedData('expenses', updatedExpenses);

    firestoreService.deleteExpenseFromFirestore(id)
      .catch(err => {
        logError(err, 'deleteExpense');
        offlineSync.enqueueAction('DELETE_EXPENSE', { id });
      });

    if (target) {
      addNotification('حذف مصروف', `تم حذف مصروف ${target.expenseType} بقيمة ${target.amount} ج.م.`, 'info', 'services');
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

  const deleteMaintenanceRequest = (id: string) => {
    const target = maintenanceRequests.find(req => req.id === id);
    if (!target) return;

    if (!canDeleteMaintenanceRequest(target, role, user, flatNumber)) {
      return;
    }

    const updated = maintenanceRequests.filter(req => req.id !== id);
    setMaintenanceRequests(updated);
    offlineSync.saveCachedData('maintenance', updated);
    
    firestoreService.deleteMaintenanceFromFirestore(id)
      .catch(err => {
        logError(err, 'deleteMaintenanceRequest');
        offlineSync.enqueueAction('DELETE_MAINTENANCE', { id });
      });
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

  const deleteCraftsman = (id: string) => {
    const target = craftsmen.find(c => c.id === id);
    if (!target) return;

    if (!canDeleteCraftsman(target, role, user, flatNumber)) {
      return;
    }

    const updated = craftsmen.filter(c => c.id !== id);
    setCraftsmen(updated);
    offlineSync.saveCachedData('craftsmen', updated);
    
    firestoreService.deleteCraftsmanFromFirestore(id)
      .catch(err => {
        logError(err, 'deleteCraftsman');
        offlineSync.enqueueAction('DELETE_CRAFTSMAN', { id });
      });
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

  const deletePoll = (pollId: string) => {
    const target = polls.find(p => p.id === pollId);
    if (!target || !canDeletePoll(target, role)) return;

    const updated = polls.filter(p => p.id !== pollId);
    setPolls(updated);
    offlineSync.saveCachedData('polls', updated);
    
    firestoreService.deletePollFromFirestore(pollId)
      .catch(err => {
        logError(err, 'deletePoll');
        offlineSync.enqueueAction('DELETE_POLL', { id: pollId });
      });
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

  const deleteDecision = (id: string) => {
    const target = decisions.find(d => d.id === id);
    if (!target || !canDeleteDecision(target, role)) return;

    const updated = decisions.filter(d => d.id !== id);
    setDecisions(updated);
    offlineSync.saveCachedData('admin_decisions', updated);
    
    firestoreService.deleteDecisionFromFirestore(id)
      .catch(err => {
        logError(err, 'deleteDecision');
        offlineSync.enqueueAction('DELETE_DECISION', { id });
      });
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

  const deleteBuildingEvent = (id: string) => {
    const updated = events.filter(ev => ev.id !== id);
    setEvents(updated);
    offlineSync.saveCachedData('events', updated);
    
    firestoreService.deleteEventFromFirestore(id)
      .catch(err => {
        logError(err, 'deleteBuildingEvent');
        offlineSync.enqueueAction('DELETE_EVENT', { id });
      });
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

    // Sync admin resident profile to corresponding resident if exists, or add it if new
    if (updatedConfig.adminResidentProfile) {
      const prof = updatedConfig.adminResidentProfile;
      const targetFlat = prof.flatNumber;
      const existingIdx = updatedResidents.findIndex(r => r.flatNumber === targetFlat);
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
      } else {
        residentsChanged = true;
        const newAdminRes: Resident = {
          id: `res_president_${targetFlat}_${Date.now()}`,
          flatNumber: targetFlat,
          name: (prof.name || 'وحيد سماحة').replace(/\s*\(رئيس الاتحاد\)/g, '').trim(),
          phone: prof.phone || '',
          activityType: prof.activityType || 'سكني',
          ownershipType: prof.ownershipType || 'تمليك',
          notes: prof.notes || 'رئيس اتحاد الملاك',
          monthlyFee: prof.monthlyFee !== undefined && prof.monthlyFee > 0 ? prof.monthlyFee : (updatedConfig.defaultMonthlyFee || 400),
          initialBalance: prof.initialBalance || 0,
        };
        updatedResidents = [...updatedResidents, newAdminRes].sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
      }

      // If in resident mode or if active flatNumber matches, update flatNumber
      if (role === 'RESIDENT' || role === 'ADMIN') {
        setFlatNumber(targetFlat);
        localStorage.setItem('resident_flat_number', String(targetFlat));
      }
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

    // Sync to backend server
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: safeMsg }),
    }).catch(() => {});

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

    // Sync directly to backend server for multi-user sharing
    fetch('/api/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complaint: safeComplaint }),
    }).catch(() => {});

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

    // Sync to backend server
    fetch(`/api/complaints/${complaintId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: newComment }),
    }).catch(() => {});

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

  const handleDeleteComplaint = (complaintId: string) => {
    const target = complaints.find(c => c.id === complaintId);
    if (!target) return;

    if (!canDeleteComplaint(target, role, user, flatNumber)) {
      return;
    }

    markComplaintAsDeleted(complaintId);

    const updated = complaints.filter(c => c.id !== complaintId);
    setComplaints(updated);
    offlineSync.saveCachedData('public_complaints', updated);

    // Delete from backend server API
    fetch(`/api/complaints/${complaintId}`, {
      method: 'DELETE',
    }).catch(() => {});

    firestoreService.deleteComplaintFromFirestore(complaintId).catch(err => {
      logError(err, 'handleDeleteComplaint');
      offlineSync.enqueueAction('DELETE_COMPLAINT', { id: complaintId });
    });
  };

  const handleDeleteChatMessage = (messageId: string) => {
    const target = messages.find(m => m.id === messageId);
    if (!target) return;

    if (!canDeleteChatMessage(target, role, user, flatNumber)) {
      return;
    }

    markMessageAsDeleted(messageId);

    const updated = messages.filter(m => m.id !== messageId);
    setMessages(updated);
    offlineSync.saveCachedData('chat_messages', updated);

    // Delete from backend server API
    fetch(`/api/chat/${messageId}`, {
      method: 'DELETE',
    }).catch(() => {});

    firestoreService.deleteChatMessageFromFirestore(messageId).catch(err => {
      logError(err, 'handleDeleteChatMessage');
      offlineSync.enqueueAction('DELETE_CHAT_MESSAGE', { id: messageId });
    });
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

    // Update in backend server API
    fetch(`/api/chat/${messageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText }),
    }).catch(() => {});

    if (targetMsg) {
      firestoreService.saveChatMessageToFirestore(targetMsg).catch(err => {
        logError(err, 'handleEditChatMessage');
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
    const effectiveFloors = (buildingLayout && buildingLayout.length > 0)
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
      <header className="sticky top-0 z-40 bg-white border-b border-slate-100 shadow-sm shadow-slate-100/40">
        <div className="max-w-full mx-auto px-2 sm:px-4 h-16 flex items-center justify-between" dir="rtl">
          
          {/* Right Section: Building Title & User Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-900 to-indigo-900 text-white rounded-2xl flex items-center justify-center font-black shadow-xs shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="flex flex-col text-right">
              <h1 className="text-sm sm:text-base font-black text-blue-950 tracking-tight leading-tight">{config?.buildingName || localStorage.getItem('active_building_name') || 'بيراميدز فيو ١'}</h1>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-700">
                  {getUserDisplayName()}
                </span>
                <span className="text-[10px] text-slate-400 font-bold">
                  ({role === 'ADMIN' ? 'إدارة الملاك' : role === 'ASSISTANT' ? 'المساعد الفني' : role === 'MANAGER' ? 'مدير العمارة' : getUserFlatLabel()})
                </span>
              </div>
            </div>
          </div>

          {/* Left Section: The ONLY 3 buttons on the top bar + online indicator */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Background Fast Sync indicator */}
            {isBackgroundSyncing && (
              <div 
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80 animate-pulse shadow-xs"
                title="جاري تحديث البيانات السحابية في الخلفية بسلاسة دون مقاطعة"
              >
                <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                <span>مزامنة سريعة...</span>
              </div>
            )}

            {/* Connection/Sync status indicator badge */}
            <div 
              onClick={triggerBackgroundSync}
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition shadow-xs cursor-pointer ${
                isOnline 
                  ? syncing 
                    ? 'bg-blue-50 text-blue-700 animate-pulse' 
                    : 'bg-emerald-50 text-emerald-700' 
                  : 'bg-amber-50 text-amber-700'
              }`}
              title={isOnline ? 'متصل بالسحابة وقاعدة البيانات' : 'وضع محلي غير متصل'}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  <span>{syncing ? 'مزامنة...' : 'متصل'}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>غير متصل</span>
                </>
              )}
            </div>

            {/* 1. زر الواجهة الرئيسية */}
            <button 
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-2 sm:px-3.5 sm:py-2 rounded-xl transition font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs ${
                activeTab === 'dashboard' 
                  ? 'bg-blue-900 text-white shadow-md' 
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-blue-900'
              }`}
              title="الواجهة الرئيسية"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">الواجهة الرئيسية</span>
            </button>

            {/* 2. زر الإشعارات */}
            <button 
              type="button"
              onClick={() => setShowNotifications(true)}
              className="relative p-2 sm:p-2.5 bg-blue-50 text-blue-900 hover:bg-blue-100 rounded-xl transition cursor-pointer flex items-center justify-center shadow-xs"
              title="تنبيهات وإشعارات النظام"
            >
              <Bell className="w-5 h-5 stroke-[2]" />
              {visibleNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black flex items-center justify-center rounded-full border-2 border-white animate-bounce">
                  {visibleNotifications.length}
                </span>
              )}
            </button>

            {/* 3. زر القائمة الجانبية */}
            <button 
              type="button"
              onClick={() => setMenuOpen(!mobileMenuOpen)}
              className={`p-2 sm:px-3.5 sm:py-2 rounded-xl transition font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs ${
                mobileMenuOpen
                  ? 'bg-blue-900 text-white shadow-md'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-blue-900'
              }`}
              title="القائمة الجانبية للتطبيق"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              <span className="hidden sm:inline">القائمة الجانبية</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Drawer (Opens on Sidebar Button click for all screen sizes) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end" onClick={() => setMenuOpen(false)}>
          <div 
            className="w-80 max-w-[85vw] h-full bg-white shadow-2xl p-5 flex flex-col justify-between animate-slide-left overflow-y-auto max-h-screen text-right"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-900 text-white rounded-xl flex items-center justify-center font-black">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm">قائمة النظام</h3>
                    <p className="text-[10px] text-slate-400 font-bold">{config?.buildingName || localStorage.getItem('active_building_name') || 'بيراميدز فيو ١'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Sections */}
              <div className="flex flex-col gap-2">
                
                {/* 1. Main Interface */}
                <button
                  onClick={() => { setActiveTab('dashboard'); setMenuOpen(false); }}
                  className={`flex items-center justify-between w-full py-3 px-3.5 rounded-2xl text-xs font-black transition cursor-pointer ${
                    activeTab === 'dashboard' ? 'bg-blue-900 text-white shadow-md' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>الواجهة الرئيسية</span>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
                </button>

                {/* 2. Collection & Finance Category */}
                <div className="space-y-1">
                  <button 
                    onClick={() => toggleSection('collection')}
                    className="w-full flex items-center justify-between py-2 px-3 bg-slate-50 rounded-xl text-xs font-black text-blue-950 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-emerald-600" />
                      <span>قسم التحصيل والمالية</span>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedSections.includes('collection') ? '' : '-rotate-90'}`} />
                  </button>
                  {expandedSections.includes('collection') && (
                    <div className="pr-3 flex flex-col gap-1 mt-1 border-r-2 border-emerald-200 mr-2">
                      <button
                        onClick={() => { setActiveTab('payments'); setMenuOpen(false); }}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'payments' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        التحصيلات وسندات القبض
                      </button>
                      <button
                        onClick={() => { setActiveTab('expenses'); setMenuOpen(false); }}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'expenses' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        المصروفات والفواتير
                      </button>
                      <button
                        onClick={() => { setActiveTab('debts-report'); setMenuOpen(false); }}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'debts-report' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        كشف المديونيات
                      </button>
                      <button
                        onClick={() => { setActiveTab('summaries'); setMenuOpen(false); }}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'summaries' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        الملخصات وخريطة السداد
                      </button>
                      <button
                        onClick={() => { setActiveTab('history'); setMenuOpen(false); }}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'history' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        سجل المعاملات المالية
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. Residents Category */}
                <div className="space-y-1">
                  <button 
                    onClick={() => toggleSection('residents')}
                    className="w-full flex items-center justify-between py-2 px-3 bg-slate-50 rounded-xl text-xs font-black text-blue-950 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span>قسم الوحدات والسكان</span>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedSections.includes('residents') ? '' : '-rotate-90'}`} />
                  </button>
                  {expandedSections.includes('residents') && (
                    <div className="pr-3 flex flex-col gap-1 mt-1 border-r-2 border-blue-200 mr-2">
                      <button
                        onClick={() => { setActiveTab('residents'); setMenuOpen(false); }}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'residents' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        كشف الوحدات وهيكل العمارة
                      </button>
                    </div>
                  )}
                </div>

                {/* 4. Services & Communication Category */}
                <div className="space-y-1">
                  <button 
                    onClick={() => toggleSection('services')}
                    className="w-full flex items-center justify-between py-2 px-3 bg-slate-50 rounded-xl text-xs font-black text-blue-950 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-purple-600" />
                      <span>الخدمات والتواصل</span>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedSections.includes('services') ? '' : '-rotate-90'}`} />
                  </button>
                  {expandedSections.includes('services') && (
                    <div className="pr-3 flex flex-col gap-1 mt-1 border-r-2 border-purple-200 mr-2">
                      <button
                        onClick={() => { setActiveTab('chat'); setMenuOpen(false); }}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'chat' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        الدردشة والشكاوى العامة
                      </button>
                      <button
                        onClick={() => { setActiveTab('maintenance'); setMenuOpen(false); }}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'maintenance' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        طلبات الصيانة وفنيي الصيانة
                      </button>
                      <button
                        onClick={() => { setPollsSubTab('polls'); setActiveTab('polls'); setMenuOpen(false); }}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'polls' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        القرارات والتصويت
                      </button>
                      <button
                        onClick={() => { setActiveTab('calendar'); setMenuOpen(false); }}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-right transition cursor-pointer ${activeTab === 'calendar' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        الأجندة والتقويم
                      </button>
                    </div>
                  )}
                </div>

                {/* 5. System Settings & Rules */}
                <div className="pt-2 border-t border-slate-100 mt-1 space-y-1">
                  {role !== 'ASSISTANT' && (
                    <button
                      onClick={() => { setActiveTab('settings'); setMenuOpen(false); }}
                      className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold text-right transition cursor-pointer flex items-center justify-between ${
                        activeTab === 'settings' ? 'bg-blue-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>إعدادات النظام</span>
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => { setShowRulesReadModal(true); setMenuOpen(false); }}
                    className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-right transition text-slate-700 hover:bg-amber-50 flex items-center justify-between cursor-pointer"
                  >
                    <span>تعليمات ونظام إدارة العمارة</span>
                    <BookOpen className="w-4 h-4 text-amber-700" />
                  </button>
                </div>
              </div>
            </div>

            {/* Logout button in drawer */}
            <div className="pt-4 border-t border-slate-100 mt-4 space-y-2">
              <div className="flex items-center justify-between px-1 text-[11px] text-slate-500 font-bold">
                <span>{role === 'ASSISTANT' ? 'المساعد الفني' : user.displayName}</span>
                {role !== 'ADMIN' && (
                  <span>{role === 'ASSISTANT' ? 'المساعد الفني' : 'ساكن'}</span>
                )}
              </div>
              <button
                onClick={() => { handleLogout(); setMenuOpen(false); }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-red-50 text-red-600 rounded-xl font-black text-xs hover:bg-red-100 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Application Stage */}
      <main className={`flex-1 max-w-full mx-auto w-full ${activeTab === 'chat' ? 'px-1 sm:px-1.5 py-1 sm:py-1.5 space-y-2' : 'px-1 sm:px-1.5 py-3 space-y-3.5'}`} dir="rtl">
        
        {/* PWA install banner for Android / iOS mobile */}
        {!pwaInstalled && (deferredPrompt || isIosDevice) && (
          <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-3.5 sm:p-4 rounded-2xl flex items-center justify-between border border-blue-800/40 shadow-md">
            <div className="text-right">
              <h3 className="font-extrabold text-xs sm:text-sm mb-0.5 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>تثبيت تطبيق {config?.buildingName || localStorage.getItem('active_building_name') || 'اتحاد الملاك'}</span>
              </h3>
              <p className="text-[10px] sm:text-xs text-indigo-200">ثبّت التطبيق على شاشة جوالك الرئيسية لاستخدام سريع ومباشر وإمكانية العمل بدون إنترنت.</p>
            </div>
            {deferredPrompt ? (
              <button
                type="button"
                onClick={handlePwaInstall}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-1 shadow-sm transition cursor-pointer whitespace-nowrap"
              >
                <span>تثبيت الآن</span>
              </button>
            ) : isIosDevice ? (
              <button
                type="button"
                onClick={() => setShowIosPwaGuide(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs flex items-center gap-1 shadow-sm transition cursor-pointer whitespace-nowrap"
              >
                <span>تثبيت على الآيفون</span>
              </button>
            ) : null}
          </div>
        )}

        {/* iOS PWA Install Guide Modal */}
        {showIosPwaGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4" dir="rtl">
            <div className="bg-slate-800 border border-slate-700 text-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-center text-slate-100">تثبيت التطبيق على الآيفون / الآيباد</h3>
              <div className="space-y-3 text-xs text-slate-300 bg-slate-900/60 p-4 rounded-2xl border border-slate-700/60">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 bg-blue-600 text-white font-bold rounded-full flex items-center justify-center shrink-0 text-[10px]">١</span>
                  <p>اضغط على أيقونة <strong>المشاركة (Share)</strong> في شريط متصفح Safari السفلي.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 bg-blue-600 text-white font-bold rounded-full flex items-center justify-center shrink-0 text-[10px]">٢</span>
                  <p>تمرير للأسفل واختيار <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIosPwaGuide(false)}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold rounded-xl transition text-xs"
              >
                فهمت، إغلاق
              </button>
            </div>
          </div>
        )}

        {/* Google Drive & Sheets Integration Alert for Union President if in local mode */}
        {role === 'ADMIN' && (token === 'local-token' || !token) && (
          <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white p-3.5 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between border-2 border-blue-500/50 shadow-lg gap-3">
            <div className="text-right space-y-1">
              <h3 className="font-black text-xs sm:text-sm flex items-center gap-1.5 text-blue-200">
                <CloudLightning className="w-4 h-4 text-amber-400" />
                <span>تنبيه رئيس الاتحاد: تفعيل المزامنة السحابية ومجلدات Google Drive</span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-300 font-bold leading-relaxed">
                أنت الآن متصل بالنظام المحلي. لمزامنة مجلدات Google Drive تلقائياً (الصور، الإيصالات، الفواتير، الشكاوى) وتصدير الجداول سحابياً بحسابك المعتمد {user?.email ? (<strong className="text-amber-300">({user.email})</strong>) : null}:
              </p>
            </div>
            <button
              type="button"
              onClick={handleConnectGoogleDrive}
              disabled={isConnectingGoogle}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow-md transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0 self-stretch sm:self-auto justify-center disabled:opacity-50"
            >
              {isConnectingGoogle ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                    <g transform="matrix(1, 0, 0, 1, 0, 0)">
                      <path fill="#EA4335" d="M20.64 12.2c0-.7-.06-1.36-.18-2H12v3.78h4.84c-.2.11-.2.22-.3.43-.54 1.45-1.8 2.5-3.32 2.5a5.18 5.18 0 0 1-4.85-3.6l-2.63 2.03A10.3 10.3 0 0 0 12 22.36c5.73 0 10.55-1.9 14.07-5.18l-5.43-4.98z" />
                      <path fill="#4285F4" d="M12 22.36c3.24 0 5.95-1.07 7.93-2.91l-5.43-4.98c-1.5.11-3.04-.15-4.21-.86a5.18 5.18 0 0 1-3.3-3.6L4.35 12.04a10.3 10.3 0 0 0 7.65 10.32z" />
                      <path fill="#FBBC05" d="M4.35 12.04c-.25-.75-.4-1.55-.4-2.38s.15-1.63.4-2.38L1.72 5.25A10.3 10.3 0 0 0 0 9.66c0 1.63.3 3.19.85 4.63l3.5-3.25z" />
                      <path fill="#34A853" d="M12 4.14c1.76 0 3.3.61 4.54 1.8l3.4-3.15C17.9 1.07 15.24 0 12 0 7.34 0 3.3 2.7 1.25 6.64l3.5 3.25A5.18 5.18 0 0 1 12 4.14z" />
                    </g>
                  </svg>
                  <span>ربط Google Drive السحابي الآن</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 animate-fade-in text-right">
            
            {/* Filter Toggle Year/Month */}
            <div className="flex flex-col items-center justify-center space-y-2 py-2">
              <div className="flex items-center gap-6 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm">
                <button 
                  onClick={() => {
                    if (viewMode === 'year') {
                      setCurrentYear(prev => prev - 1);
                    } else {
                      if (currentMonth === 0) {
                        setCurrentMonth(11);
                        setCurrentYear(prev => prev - 1);
                      } else {
                        setCurrentMonth(prev => prev - 1);
                      }
                    }
                  }}
                  className="p-1.5 hover:bg-white/50 rounded-lg text-slate-600 hover:text-blue-900 transition"
                  title="السابق"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <div 
                  onClick={() => setViewMode(prev => prev === 'year' ? 'month' : 'year')}
                  className="flex flex-col items-center cursor-pointer select-none min-w-[120px]"
                >
                  <span className="text-[10px] text-slate-400 font-extrabold">{viewMode === 'year' ? 'السنة المالية' : 'الفلتر الشهري'}</span>
                  <span className="text-xl font-black text-blue-950">
                    {viewMode === 'year' ? currentYear : `${monthNamesArabic[currentMonth]} ${currentYear}`}
                  </span>
                </div>

                <button 
                  onClick={() => {
                    if (viewMode === 'year') {
                      setCurrentYear(prev => prev + 1);
                    } else {
                      if (currentMonth === 11) {
                        setCurrentMonth(0);
                        setCurrentYear(prev => prev + 1);
                      } else {
                        setCurrentMonth(prev => prev + 1);
                      }
                    }
                  }}
                  className="p-1.5 hover:bg-white/50 rounded-lg text-slate-600 hover:text-blue-900 transition"
                  title="التالي"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <p className="text-[9px] text-slate-400 font-bold">انقر على الرقم للتبديل بين الفلتر السنوي والشهري</p>
            </div>
            
            {/* Interactive Unit Activities Distribution Bar & Statistical Counters */}
            <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-100 shadow-xs space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center shrink-0">
                    <Building2 className="w-4.5 h-4.5 stroke-[2.2]" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-blue-950 leading-tight">
                      إحصائيات العمارة
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold">
                      عداد تفاعلي يتغير حسب النشاط
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50/80 rounded-xl border border-blue-100 text-xs font-black text-blue-950 shrink-0 dir-rtl">
                  <span className="text-[10px] text-slate-500 font-extrabold">إجمالي العمارة:</span>
                  <span className="text-blue-900 font-black">{unitActivityStats.totalUnits} وحدة</span>
                </div>
              </div>

              {/* Dynamic Stacked Bar */}
              <div className="relative pt-0.5">
                <div className="flex h-4 sm:h-5 w-full rounded-xl overflow-hidden bg-slate-100 p-0.5 gap-0.5 border border-slate-200/70 shadow-xs">
                  {unitActivityStats.breakdown.map((item, idx) => {
                    const theme = getActivityTheme(item.activity, idx);
                    return (
                      <div
                        key={item.activity}
                        style={{ width: `${Math.max(item.percentage, 1.5)}%` }}
                        className={`${theme.barBg} h-full rounded-md transition-all duration-500 hover:brightness-110 cursor-pointer relative group`}
                        title={`${item.activity}: ${item.count} وحدة (${item.percentage.toFixed(1)}%)`}
                        onClick={() => setSelectedActivityModal(item.activity)}
                      >
                        {/* Hover Tooltip */}
                        <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-30 pointer-events-none">
                          <div className="bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg whitespace-nowrap">
                            {item.activity}: {item.count} وحدة ({item.percentage.toFixed(1)}%)
                          </div>
                          <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-1"></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Counters List - Full Width & Minimal Height */}
              <div className="flex flex-col gap-1.5 pt-1">
                {unitActivityStats.breakdown.map((item, idx) => {
                  const theme = getActivityTheme(item.activity, idx);
                  return (
                    <div
                      key={item.activity}
                      onClick={() => setSelectedActivityModal(item.activity)}
                      className={`px-3 py-1.5 sm:py-2 rounded-xl border transition-all cursor-pointer hover:shadow-xs hover:scale-[1.005] active:scale-[0.99] flex items-center justify-between w-full min-h-0 gap-2 ${theme.badgeBg}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full ${theme.dotBg} shrink-0`} />
                        <span className="text-xs font-black truncate">{item.activity}</span>
                        <span className="text-[10px] font-extrabold opacity-75 bg-white/60 px-1.5 py-0.5 rounded-md border border-black/5">
                          {item.percentage.toFixed(0)}%
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 dir-rtl">
                        <span className="text-xs sm:text-sm font-black tracking-tight">{item.count}</span>
                        <span className="text-[10px] font-extrabold opacity-80">وحدة</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* High level financial stats metrics - Three in a row as requested */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              
              <div 
                onClick={() => setActiveTab('payments')}
                className="bg-white rounded-2xl px-2.5 py-3 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-blue-200 hover:shadow-md transition active:scale-[0.99]"
              >
                <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 stroke-[2]" />
                </div>
                <div className="text-center">
                  <span className="text-[9px] text-slate-400 font-extrabold block">الإيرادات</span>
                  <span className="text-sm sm:text-lg font-black text-emerald-600 leading-tight">
                    {Math.round(totalReceived)} <span className="text-[10px]">ج.م</span>
                  </span>
                </div>
              </div>

              <div 
                onClick={() => setActiveTab('expenses')}
                className="bg-white rounded-2xl px-2.5 py-3 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-blue-200 hover:shadow-md transition active:scale-[0.99]"
              >
                <div className="w-9 h-9 bg-red-50 text-red-500 rounded-xl flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 stroke-[2]" />
                </div>
                <div className="text-center">
                  <span className="text-[9px] text-slate-400 font-extrabold block">المصروفات</span>
                  <span className="text-sm sm:text-lg font-black text-red-500 leading-tight">
                    {Math.round(totalSpent)} <span className="text-[10px]">ج.م</span>
                  </span>
                </div>
              </div>

              <div 
                onClick={() => setActiveTab('summaries')}
                className="bg-white rounded-2xl px-2.5 py-3 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-blue-200 hover:shadow-md transition active:scale-[0.99]"
              >
                <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <Wallet className="w-5 h-5 stroke-[2]" />
                </div>
                <div className="text-center">
                  <span className="text-[9px] text-slate-400 font-extrabold block">الرصيد</span>
                  <span className={`text-sm sm:text-lg font-black leading-tight ${currentSafeBalance >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    {Math.round(currentSafeBalance)} <span className="text-[10px]">ج.م</span>
                  </span>
                </div>
              </div>

            </div>

            {/* Residents Directory Link - Separate row */}
            <div 
              onClick={() => setActiveTab('residents')}
              className="bg-white rounded-2xl px-4 py-2.5 border border-slate-100 shadow-xs flex items-center justify-between cursor-pointer hover:border-blue-200 hover:shadow-md transition active:scale-[0.99] leading-[25px]"
            >
              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-extrabold block mb-0.5">كشف ودليل الوحدات والسكان (بيانات وأرقام الهواتف)</span>
                <span className="text-xl font-black text-slate-900">{residents.length} <span className="text-xs">وحدة بعمارة الاتحاد</span></span>
              </div>
              <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 stroke-[1.5]" />
              </div>
            </div>

            {/* Quick Access Communication & Services Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] text-slate-400 font-extrabold">الوصول السريع للخدمات والمجتمع</span>
                <h3 className="text-xs font-black text-slate-900">قسم التواصل والخدمات</h3>
              </div>

              {/* Row 1: Residents Chat spanning full width */}
              <button
                onClick={() => {
                  setChatSubTab('room');
                  setActiveTab('chat');
                }}
                className="w-full bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-100 shadow-xs flex items-center justify-between cursor-pointer hover:border-indigo-300 hover:shadow-md transition active:scale-[0.99] group relative"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition shrink-0">
                    <MessageCircle className="w-5 h-5 stroke-[2]" />
                  </div>
                  <div className="text-right">
                    <span className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-indigo-600 transition block">
                      دردشة السكان
                    </span>
                    <span className="text-[8px] leading-[15px] text-slate-400 font-bold block">
                      غرفة النقاش والمحادثات المباشرة بين سكان وملاك العمارة والمساعد الفني
                    </span>
                  </div>
                </div>

                {messages.length > 0 ? (
                  <span className="text-[9px] sm:text-[10px] font-black px-2.5 py-1 bg-indigo-100/70 text-indigo-700 rounded-full shrink-0">
                    {messages.length} رسالة
                  </span>
                ) : (
                  <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 px-2.5 py-1 bg-slate-50 rounded-full shrink-0">
                    غرفة المناقشة
                  </span>
                )}
              </button>

              {/* Grid of Service Buttons */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                
                {/* 1. Maintenance Requests */}
                <button
                  onClick={() => {
                    setMaintenanceSubTab('requests');
                    setActiveTab('maintenance');
                  }}
                  className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer hover:border-amber-300 hover:shadow-md transition active:scale-[0.98] group relative"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition">
                    <Wrench className="w-5 h-5 stroke-[2]" />
                  </div>
                  <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 group-hover:text-amber-600 transition leading-tight">
                    طلبات الصيانة
                  </span>
                  {maintenanceRequests.filter(r => r.status !== 'COMPLETED' && (r as any).status !== 'DONE').length > 0 ? (
                    <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-amber-100/70 text-amber-700 rounded-full">
                      {maintenanceRequests.filter(r => r.status !== 'COMPLETED' && (r as any).status !== 'DONE').length} قيد المتابعة
                    </span>
                  ) : (
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">
                      متابعة وإضافة
                    </span>
                  )}
                </button>

                {/* 2. Craftsmen Directory */}
                <button
                  onClick={() => {
                    setMaintenanceSubTab('directory');
                    setActiveTab('maintenance');
                  }}
                  className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer hover:border-blue-300 hover:shadow-md transition active:scale-[0.98] group relative"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition">
                    <HardHat className="w-5 h-5 stroke-[2]" />
                  </div>
                  <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 group-hover:text-blue-600 transition leading-tight">
                    دليل الصنايعية
                  </span>
                  {craftsmen.length > 0 ? (
                    <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-blue-100/70 text-blue-700 rounded-full">
                      {craftsmen.length} صنايعي معتمد
                    </span>
                  ) : (
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">
                      دليل الفنيين
                    </span>
                  )}
                </button>

                {/* 3. Administrative Decisions */}
                <button
                  onClick={() => {
                    setPollsSubTab('decisions');
                    setActiveTab('polls');
                  }}
                  className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer hover:border-emerald-300 hover:shadow-md transition active:scale-[0.98] group relative"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition">
                    <Scale className="w-5 h-5 stroke-[2]" />
                  </div>
                  <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 group-hover:text-emerald-600 transition leading-tight">
                    القرارات الإدارية
                  </span>
                  {decisions.length > 0 ? (
                    <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-emerald-100/70 text-emerald-700 rounded-full">
                      {decisions.length} قرار إداري
                    </span>
                  ) : (
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">
                      قرارات الإدارة
                    </span>
                  )}
                </button>

                {/* 4. Complaints & Suggestions */}
                <button
                  onClick={() => {
                    setChatSubTab('complaints');
                    setActiveTab('chat');
                  }}
                  className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer hover:border-rose-300 hover:shadow-md transition active:scale-[0.98] group relative"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition">
                    <AlertTriangle className="w-5 h-5 stroke-[2]" />
                  </div>
                  <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 group-hover:text-rose-600 transition leading-tight">
                    الشكاوى والمقترحات
                  </span>
                  {complaints.length > 0 ? (
                    <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-rose-100/70 text-rose-700 rounded-full">
                      {complaints.length} شكوى ومقترح
                    </span>
                  ) : (
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">
                      صندوق المقترحات
                    </span>
                  )}
                </button>

                {/* 5. Voting & Polls */}
                <button
                  onClick={() => {
                    setPollsSubTab('polls');
                    setActiveTab('polls');
                  }}
                  className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer hover:border-purple-300 hover:shadow-md transition active:scale-[0.98] group relative"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition">
                    <Vote className="w-5 h-5 stroke-[2]" />
                  </div>
                  <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 group-hover:text-purple-600 transition leading-tight">
                    التصويت والاستبيانات
                  </span>
                  {polls.length > 0 ? (
                    <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-purple-100/70 text-purple-700 rounded-full">
                      {polls.filter(p => p.status === 'ACTIVE').length} استبيان مفتوح
                    </span>
                  ) : (
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">
                      استطلاعات الرأي
                    </span>
                  )}
                </button>

                {/* 6. Agenda & Calendar */}
                <button
                  onClick={() => {
                    setActiveTab('calendar');
                  }}
                  className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer hover:border-cyan-300 hover:shadow-md transition active:scale-[0.98] group relative"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition">
                    <Calendar className="w-5 h-5 stroke-[2]" />
                  </div>
                  <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 group-hover:text-cyan-600 transition leading-tight">
                    الأجندة والتقويم
                  </span>
                  {events.length > 0 ? (
                    <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-cyan-100/70 text-cyan-700 rounded-full">
                      {events.length} موعد وحدث
                    </span>
                  ) : (
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">
                      مواعيد العمارة
                    </span>
                  )}
                </button>

              </div>
            </div>

            {/* If RESIDENT: Show Personal Resident Account Statement */}
            {role === 'RESIDENT' ? (
              <div className="pt-2">
                <ResidentAccountStatement
                  resident={currentResidentObj}
                  residents={residents}
                  payments={payments}
                  config={config}
                  currentYear={currentYear}
                  isResidentOnly={true}
                  onPreviewImage={handlePreviewImage}
                  onOpenResidentsList={() => setActiveTab('residents')}
                />
              </div>
            ) : (
              <div className="pt-2">
                <ResidentAccountStatement
                  resident={residents.find(r => r.id === reportResidentId) || residents.find(r => isSameFlatNumber(r.flatNumber, reportResidentId)) || residents[0]}
                  residents={residents}
                  payments={payments}
                  config={config}
                  currentYear={currentYear}
                  isResidentOnly={false}
                  onSelectResidentId={(id) => setReportResidentId(id)}
                  onSelectFlatNumber={(flatNum) => {
                    const found = residents.find(r => isSameFlatNumber(r.flatNumber, flatNum) || String(r.flatNumber) === String(flatNum));
                    if (found) setReportResidentId(found.id);
                  }}
                  onPreviewImage={handlePreviewImage}
                  onOpenResidentsList={() => setActiveTab('residents')}
                />
              </div>
            )}

          </div>
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
        />
      )}

      {/* High-Resolution Document & Image Preview Overlay */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4 md:p-6" dir="rtl">
          <div className="w-full max-w-6xl md:max-w-7xl h-[92vh] max-h-[92vh] bg-slate-900 text-white rounded-3xl p-3 sm:p-5 relative flex flex-col shadow-2xl overflow-hidden border border-slate-800 animate-scale-up">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 z-10 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white leading-tight">معاينة صورة المستند / الإيصال</h3>
                  <p className="text-[10px] text-slate-400 font-bold hidden sm:block">تكبير، تدوير ومراجعة تفاصيل الفواتير والتحصيلات بأكبر حجم واضوح متاح</p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {!previewLoading && previewImage !== 'loading' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPreviewZoom(prev => {
                        const next = Math.max(0.5, prev - 0.25);
                        if (next <= 1) setPreviewPan({ x: 0, y: 0 });
                        return next;
                      })}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                      title="تصغير (-)"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => { setPreviewZoom(1); setPreviewRotation(0); setPreviewPan({ x: 0, y: 0 }); }}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-xl transition text-xs font-black cursor-pointer min-w-[55px] text-center"
                      title="إعادة ضبط 100%"
                    >
                      {Math.round(previewZoom * 100)}%
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewZoom(prev => Math.min(5, prev + 0.25))}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                      title="تكبير (+)"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewRotation(prev => (prev + 90) % 360)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                      title="تدوير 90 درجة"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>

                    <a
                      href={previewImage}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition text-xs font-bold flex items-center gap-1.5 cursor-pointer hidden sm:flex"
                      title="فتح بالحجم الأصلي في تبويب جديد"
                    >
                      <Share2 className="w-4 h-4" />
                      <span className="hidden md:inline">فتح بالأصل</span>
                    </a>
                  </>
                )}

                <button
                  type="button"
                  onClick={closePreview}
                  className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 rounded-xl transition cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Canvas / Image Stage */}
            <div 
              className="flex-1 w-full h-full flex items-center justify-center bg-black/60 rounded-2xl overflow-hidden p-2 sm:p-4 my-2 relative select-none border border-slate-800/80 touch-none cursor-grab active:cursor-grabbing"
              onTouchStart={handleStageTouchStart}
              onTouchMove={handleStageTouchMove}
              onTouchEnd={handleStageTouchEnd}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseUp={handleStageMouseUp}
              onMouseLeave={handleStageMouseUp}
              onWheel={handleStageWheel}
            >
              {previewLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
                  <span className="text-sm font-bold text-slate-300">جاري تحميل صورة المستند بأعلى دقة...</span>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center overflow-hidden p-2">
                  <img
                    src={previewImage === 'loading' ? '' : previewImage}
                    alt="Receipt or Invoice document"
                    referrerPolicy="no-referrer"
                    style={{
                      transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom}) rotate(${previewRotation}deg)`,
                      transition: (touchStartDistRef.current || touchStartPosRef.current || isMouseDownRef.current) ? 'none' : 'transform 0.15s ease-out'
                    }}
                    className="max-w-full max-h-[84vh] object-contain rounded-lg shadow-2xl origin-center pointer-events-auto"
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center pt-2 shrink-0 text-slate-400 text-xs font-semibold">
              <span className="text-[11px] text-slate-400">
                يمكنك التكبير والتصغير بالسحب بالإصبعين (Pinch to Zoom) أو النقر المزدوج على الموبايل، والسحب للتنقل
              </span>
              {!previewLoading && previewImage !== 'loading' && (
                <a
                  href={previewImage}
                  target="_blank"
                  rel="noreferrer"
                  className="sm:hidden flex items-center gap-1 text-xs font-bold text-blue-400 hover:underline"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>فتح بالأصل</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Read-Only Building Rules Modal (Opened from Sidebar for All Residents) */}
      {showRulesReadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 overflow-y-auto" dir="rtl">
          <div className="w-full max-w-xl bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-xl animate-scale-up text-right my-auto">
            <div className="flex items-center justify-between border-b pb-2.5 mb-3">
              <button 
                onClick={() => setShowRulesReadModal(false)} 
                className="p-1.5 hover:bg-slate-50 rounded-lg transition"
                title="إغلاق"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <h3 className="text-sm font-black text-slate-900">تعليمات ونظام إدارة العمارة</h3>
                  <p className="text-[10px] text-slate-400 font-bold">اللائحة الداخلية المنظمة للعقار وقواعد حسن الجوار</p>
                </div>
                <div className="w-8 h-8 bg-yellow-50 text-yellow-700 rounded-lg flex items-center justify-center border border-yellow-200/50">
                  <BookOpen className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Notice banner in soft light yellow */}
            <div className="bg-yellow-50/60 border border-yellow-200/60 rounded-xl p-2.5 text-yellow-900 text-xs font-bold text-right leading-relaxed mb-3">
              <span className="text-[11px] font-bold">هذه اللائحة معتمدة من مجلس إدارة اتحاد الملاك للاطلاع والالتزام لكافة الملاك والسكان.</span>
            </div>

            {/* Rules list */}
            <div className="space-y-2">
              {rules.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-100 rounded-xl flex flex-col items-center justify-center gap-1.5">
                  <BookOpen className="w-6 h-6 text-slate-300" />
                  <p className="text-xs text-slate-400 font-bold">لا توجد مواد تعليمات مسجلة حالياً في اللائحة.</p>
                </div>
              ) : (
                rules.map((rule, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50/60 border border-slate-100 rounded-xl flex items-start gap-2.5">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 bg-yellow-50 text-yellow-900 border border-yellow-200/50 text-[10px] font-black rounded-md shrink-0 mt-0.5">
                      مادة {idx + 1}
                    </span>
                    <p className="text-xs text-slate-700 font-bold leading-relaxed flex-1 text-right">
                      {rule}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Building Rules Modal (Dedicated for Admins/Managers in Settings) */}
      {showRulesEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 overflow-y-auto" dir="rtl">
          <div className="w-full max-w-xl bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-xl animate-scale-up text-right my-auto">
            <div className="flex items-center justify-between border-b pb-2.5 mb-3">
              <button 
                onClick={() => setShowRulesEditModal(false)} 
                className="p-1.5 hover:bg-slate-50 rounded-lg transition"
                title="إغلاق"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <h3 className="text-sm font-black text-slate-900">تعديل وصياغة لوائح وتعليمات العمارة</h3>
                  <p className="text-[10px] text-slate-400 font-bold">لوحة تحكم إدارة الاتحاد لإضافة وتعديل وحذف بنود اللائحة</p>
                </div>
                <div className="w-8 h-8 bg-blue-50 text-blue-900 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Form to add rules */}
            {role !== 'RESIDENT' && (
              <form onSubmit={handleAddRule} className="flex gap-1.5 mb-4">
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-blue-900 text-white font-bold text-xs rounded-xl hover:bg-blue-950 transition flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة بند</span>
                </button>
                <input
                  type="text"
                  placeholder="صياغة مادة جديدة في اللائحة..."
                  value={newRuleText}
                  onChange={(e) => setNewRuleText(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-100 focus:bg-white rounded-xl text-xs outline-none text-right font-bold transition"
                  required
                />
              </form>
            )}

            {/* List with delete buttons */}
            <div className="space-y-2">
              {rules.length === 0 ? (
                <p className="text-center text-xs text-slate-400 font-bold py-6">لا توجد مواد تعليمات مسجلة حالياً.</p>
              ) : (
                rules.map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-3 justify-between p-2.5 bg-slate-50/60 border border-slate-100 rounded-xl">
                    {role !== 'RESIDENT' && (
                      <button
                        onClick={() => handleDeleteRule(idx)}
                        className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded-lg transition cursor-pointer shrink-0"
                        title="إزالة هذا البند"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <div className="flex items-start gap-2 flex-1 text-right">
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-yellow-50 text-yellow-900 border border-yellow-200/50 text-[10px] font-black rounded-md shrink-0 mt-0.5">
                        مادة {idx + 1}
                      </span>
                      <p className="text-xs text-slate-700 font-bold leading-relaxed flex-1">
                        {rule}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowRulesEditModal(false)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Selected Activity Units */}
      {selectedActivityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4" dir="rtl" onClick={() => setSelectedActivityModal(null)}>
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-scale-up text-right" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center font-black">
                  <Building2 className="w-5 h-5 text-blue-200" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black">وحدات نشاط: {selectedActivityModal}</h3>
                  <p className="text-[11px] text-blue-200 font-semibold">
                    تفاصيل كافة الوحدات المسجلة تحت هذا النشاط
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedActivityModal(null)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Units List */}
            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {(() => {
                const matchingResidents = residents.filter(r => (r.activityType || 'سكني').trim() === selectedActivityModal)
                  .sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));

                if (selectedActivityModal === 'شاغرة') {
                  const effectiveFloors = (buildingLayout && buildingLayout.length > 0) ? buildingLayout : deriveFloorConfigsFromResidents(residents);
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
                          <div className="text-[10px] text-slate-500 font-medium font-mono phone-number-display" dir="ltr">{formatPhoneForDisplay(r.phone)}</div>
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
                onClick={() => {
                  setSelectedActivityModal(null);
                  setActiveTab('residents');
                }}
                className="px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <span>عرض كشف كافة الوحدات</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSelectedActivityModal(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

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
