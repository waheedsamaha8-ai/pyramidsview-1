import { useEffect } from 'react';
import * as firestoreService from '../services/firestoreService';
import * as offlineSync from '../services/offlineSync';
import { 
  ChatMessage, 
  PublicComplaint, 
  MaintenanceRequest, 
  Poll, 
  AdminDecision, 
  BuildingEvent, 
  Craftsman, 
  Resident, 
  Payment, 
  Expense, 
  AppConfig, 
  FloorConfig, 
  UserRole 
} from '../types';
import { deduplicateResidents } from '../utils/buildingStructure';

interface UseAppSyncOptions {
  userEmail?: string | null;
  buildingId?: string | null;
  role: UserRole;
  deletedMessageIdsRef: React.MutableRefObject<Set<string>>;
  deletedComplaintIdsRef: React.MutableRefObject<Set<string>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setComplaints: React.Dispatch<React.SetStateAction<PublicComplaint[]>>;
  setMaintenanceRequests: React.Dispatch<React.SetStateAction<MaintenanceRequest[]>>;
  setPolls: React.Dispatch<React.SetStateAction<Poll[]>>;
  setDecisions: React.Dispatch<React.SetStateAction<AdminDecision[]>>;
  setEvents: React.Dispatch<React.SetStateAction<BuildingEvent[]>>;
  setCraftsmen: React.Dispatch<React.SetStateAction<Craftsman[]>>;
  setResidents: React.Dispatch<React.SetStateAction<Resident[]>>;
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  setBuildingLayout: React.Dispatch<React.SetStateAction<FloorConfig[]>>;
  setRules: React.Dispatch<React.SetStateAction<string[]>>;
}

export function useAppSync({
  userEmail,
  buildingId,
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
}: UseAppSyncOptions) {
  useEffect(() => {
    let isMounted = true;
    let isApiServerAvailable = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    // Subscribe to Firestore collections for real-time multi-user sync across all roles
    const unsubChat = firestoreService.subscribeToChatMessages((firestoreMsgs) => {
      if (!isMounted || !Array.isArray(firestoreMsgs)) return;
      const deletedMsgIds = deletedMessageIdsRef.current;
      const validMsgs = firestoreMsgs.filter(m => m && m.id && !deletedMsgIds.has(m.id))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setMessages(validMsgs);
      offlineSync.saveCachedData('chat_messages', validMsgs);
    });

    const unsubComplaints = firestoreService.subscribeToComplaints((items) => {
      if (!isMounted || !Array.isArray(items)) return;
      const delSet = deletedComplaintIdsRef.current;
      const validComps = items.filter(c => c && c.id && !delSet.has(c.id))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setComplaints(validComps);
      offlineSync.saveCachedData('public_complaints', validComps);
    });

    const unsubMaintenance = firestoreService.subscribeToMaintenance((items) => {
      if (!isMounted || !Array.isArray(items)) return;
      const validItems = items.filter(m => m && m.id)
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      setMaintenanceRequests(validItems);
      offlineSync.saveCachedData('maintenance', validItems);
    });

    const unsubPolls = firestoreService.subscribeToPolls((items) => {
      if (!isMounted || !Array.isArray(items)) return;
      const validItems = items.filter(p => p && p.id)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setPolls(validItems);
      offlineSync.saveCachedData('polls', validItems);
    });

    const unsubDecisions = firestoreService.subscribeToDecisions((items) => {
      if (!isMounted || !Array.isArray(items)) return;
      const validItems = items.filter(d => d && d.id)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setDecisions(validItems);
      offlineSync.saveCachedData('admin_decisions', validItems);
    });

    const unsubEvents = firestoreService.subscribeToEvents((items) => {
      if (!isMounted || !Array.isArray(items)) return;
      const validItems = items.filter(e => e && e.id)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setEvents(validItems);
      offlineSync.saveCachedData('events', validItems);
    });

    const unsubCraftsmen = firestoreService.subscribeToCraftsmen((items) => {
      if (!isMounted || !Array.isArray(items)) return;
      const validItems = items.filter(c => c && c.id);
      setCraftsmen(validItems);
      offlineSync.saveCachedData('craftsmen', validItems);
    });

    const unsubResidents = firestoreService.subscribeToResidents((items) => {
      if (!isMounted || !Array.isArray(items)) return;
      const validItems = items.filter(r => r && r.id);
      const uniqueResidents = deduplicateResidents(validItems);
      setResidents(uniqueResidents);
      offlineSync.saveCachedData('residents', uniqueResidents);
    });

    const unsubPayments = firestoreService.subscribeToPayments((items) => {
      if (!isMounted || !Array.isArray(items)) return;
      const validItems = items.filter(p => p && p.id);
      setPayments(validItems);
      offlineSync.saveCachedData('payments', validItems);
    });

    const unsubExpenses = firestoreService.subscribeToExpenses((items) => {
      if (!isMounted || !Array.isArray(items)) return;
      const validItems = items.filter(e => e && e.id);
      setExpenses(validItems);
      offlineSync.saveCachedData('expenses', validItems);
    });

    const unsubConfig = firestoreService.subscribeToConfig((conf) => {
      if (!isMounted || !conf) return;
      setConfig(conf);
      offlineSync.saveCachedData('config', conf);
      if (Array.isArray(conf.buildingLayout)) {
        setBuildingLayout(conf.buildingLayout);
        offlineSync.saveCachedData('building_layout', conf.buildingLayout);
      }
    });

    const unsubRules = firestoreService.subscribeToRules((r) => {
      if (!isMounted || !Array.isArray(r)) return;
      setRules(r);
      offlineSync.saveCachedData('rules', { rules: r });
    });

    const fetchLatestChatAndComplaints = async () => {
      if (!isApiServerAvailable) return;
      try {
        const [chatRes, compRes] = await Promise.all([
          fetch('/api/chat').then(r => {
            if (r.status === 404) isApiServerAvailable = false;
            return r.ok ? r.json() : null;
          }).catch(() => {
            isApiServerAvailable = false;
            return null;
          }),
          fetch('/api/complaints').then(r => {
            if (r.status === 404) isApiServerAvailable = false;
            return r.ok ? r.json() : null;
          }).catch(() => {
            isApiServerAvailable = false;
            return null;
          }),
        ]);

        if (!isMounted || !isApiServerAvailable) return;

        const deletedMsgIds = deletedMessageIdsRef.current;
        const deletedCompIds = deletedComplaintIdsRef.current;

        if (chatRes && Array.isArray(chatRes)) {
          const validServer = chatRes.filter((m: any) => m && m.id && !deletedMsgIds.has(m.id))
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          setMessages(validServer);
          offlineSync.saveCachedData('chat_messages', validServer);
        }

        if (compRes && Array.isArray(compRes)) {
          const validServer = compRes.filter((c: any) => c && c.id && !deletedCompIds.has(c.id))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          setComplaints(validServer);
          offlineSync.saveCachedData('public_complaints', validServer);
        }
      } catch {
        isApiServerAvailable = false;
      }
    };

    if (isApiServerAvailable) {
      fetchLatestChatAndComplaints();
    }
    const interval = isApiServerAvailable ? setInterval(fetchLatestChatAndComplaints, 15000) : null;

    return () => {
      isMounted = false;
      unsubChat();
      unsubComplaints();
      unsubMaintenance();
      unsubPolls();
      unsubDecisions();
      unsubEvents();
      unsubCraftsmen();
      unsubResidents();
      unsubPayments();
      unsubExpenses();
      unsubConfig();
      unsubRules();
      if (interval) clearInterval(interval);
    };
  }, [userEmail, buildingId, role]);
}
