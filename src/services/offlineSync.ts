import { OfflineAction, Resident, Payment, Expense, AppConfig, BuildingRules } from '../types';
import * as firestoreService from './firestoreService';
import * as googleApi from './googleApi';

const QUEUE_KEY = 'offline_actions_queue';

// Get queued actions with automatic sanitization of oversized base64 data to prevent Google Sheets 50,000 cell limit errors
export function getOfflineQueue(): OfflineAction[] {
  const queueJson = localStorage.getItem(QUEUE_KEY);
  if (!queueJson) return [];
  try {
    const queue: OfflineAction[] = JSON.parse(queueJson);
    if (!Array.isArray(queue)) return [];

    let modified = false;
    for (const action of queue) {
      if (action && action.payload && typeof action.payload === 'object') {
        const p = action.payload;
        // Check for base64 or oversized strings in fields destined for Google Sheets cells
        for (const key of Object.keys(p)) {
          if (typeof p[key] === 'string') {
            if (p[key].startsWith('data:')) {
              if (!p.base64Image) {
                p.base64Image = p[key];
              }
              p[key] = ''; // Remove raw base64 from sheet cell field
              modified = true;
            } else if (p[key].length > 45000) {
              p[key] = p[key].substring(0, 45000);
              modified = true;
            }
          }
        }
      }
    }
    if (modified) {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
    return queue;
  } catch {
    return [];
  }
}

// Clear or update queued actions
export function saveOfflineQueue(queue: OfflineAction[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// Add an action to the queue
export function enqueueAction(type: OfflineAction['type'], payload: any) {
  const queue = getOfflineQueue();
  // Deep clone and sanitize payload for storage
  const sanitizedPayload = { ...payload };
  if (typeof sanitizedPayload.fileId === 'string' && sanitizedPayload.fileId.startsWith('data:')) {
    if (!sanitizedPayload.base64Image) sanitizedPayload.base64Image = sanitizedPayload.fileId;
    sanitizedPayload.fileId = '';
  }
  if (typeof sanitizedPayload.imageUrl === 'string' && sanitizedPayload.imageUrl.startsWith('data:')) {
    if (!sanitizedPayload.base64Image) sanitizedPayload.base64Image = sanitizedPayload.imageUrl;
    sanitizedPayload.imageUrl = '';
  }

  const newAction: OfflineAction = {
    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    payload: sanitizedPayload,
    timestamp: Date.now(),
  };
  queue.push(newAction);
  saveOfflineQueue(queue);
  
  // Update local caches immediately so the offline user sees their updates in the UI
  applyActionToLocalCache(type, payload);
}

// Low-level helper to apply offline modifications directly to local caches
function applyActionToLocalCache(type: OfflineAction['type'], payload: any) {
  switch (type) {
    case 'ADD_RESIDENT': {
      const list = getCachedData<Resident[]>('residents') || [];
      list.push(payload);
      saveCachedData('residents', list);
      break;
    }
    case 'EDIT_RESIDENT': {
      let list = getCachedData<Resident[]>('residents') || [];
      list = list.map(item => item.id === payload.id ? payload : item);
      saveCachedData('residents', list);
      break;
    }
    case 'DELETE_RESIDENT': {
      let list = getCachedData<Resident[]>('residents') || [];
      list = list.filter(item => item.id !== payload.id);
      saveCachedData('residents', list);
      
      // Cascade delete payments locally
      let payments = getCachedData<Payment[]>('payments') || [];
      payments = payments.filter(p => p.residentId !== payload.id);
      saveCachedData('payments', payments);
      break;
    }
    case 'ADD_PAYMENT': {
      const list = getCachedData<Payment[]>('payments') || [];
      list.push(payload);
      saveCachedData('payments', list);
      break;
    }
    case 'EDIT_PAYMENT': {
      let list = getCachedData<Payment[]>('payments') || [];
      list = list.map(item => item.id === payload.id ? payload : item);
      saveCachedData('payments', list);
      break;
    }
    case 'DELETE_PAYMENT': {
      let list = getCachedData<Payment[]>('payments') || [];
      list = list.filter(item => item.id !== payload.id);
      saveCachedData('payments', list);
      break;
    }
    case 'ADD_EXPENSE': {
      const list = getCachedData<Expense[]>('expenses') || [];
      list.push(payload);
      saveCachedData('expenses', list);
      break;
    }
    case 'EDIT_EXPENSE': {
      let list = getCachedData<Expense[]>('expenses') || [];
      list = list.map(item => item.id === payload.id ? payload : item);
      saveCachedData('expenses', list);
      break;
    }
    case 'DELETE_EXPENSE': {
      let list = getCachedData<Expense[]>('expenses') || [];
      list = list.filter(item => item.id !== payload.id);
      saveCachedData('expenses', list);
      break;
    }
    case 'UPDATE_RULES': {
      saveCachedData('rules', { rules: payload });
      break;
    }
    case 'UPDATE_CONFIG': {
      saveCachedData('config', payload);
      break;
    }
    case 'ADD_CRAFTSMAN': {
      const list = getCachedData<any[]>('craftsmen') || [];
      list.push(payload);
      saveCachedData('craftsmen', list);
      break;
    }
    case 'EDIT_CRAFTSMAN': {
      let list = getCachedData<any[]>('craftsmen') || [];
      list = list.map(item => item.id === payload.id ? payload : item);
      saveCachedData('craftsmen', list);
      break;
    }
    case 'DELETE_CRAFTSMAN': {
      let list = getCachedData<any[]>('craftsmen') || [];
      list = list.filter(item => item.id !== payload.id);
      saveCachedData('craftsmen', list);
      break;
    }
    case 'ADD_CHAT_MESSAGE': {
      const list = getCachedData<any[]>('chat_messages') || [];
      list.push(payload);
      saveCachedData('chat_messages', list);
      break;
    }
    case 'SET_ALL_CHAT': {
      const safeList = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.messages)
        ? payload.messages
        : Array.isArray(payload?.data)
        ? payload.data
        : (payload && typeof payload === 'object' && payload.id ? [payload] : (getCachedData<any[]>('chat_messages') || []));
      saveCachedData('chat_messages', safeList);
      break;
    }
    case 'ADD_DECISION': {
      const list = getCachedData<any[]>('admin_decisions') || [];
      list.push(payload);
      saveCachedData('admin_decisions', list);
      break;
    }
    case 'EDIT_DECISION': {
      let list = getCachedData<any[]>('admin_decisions') || [];
      list = list.map(item => item.id === payload.id ? payload : item);
      saveCachedData('admin_decisions', list);
      break;
    }
    case 'DELETE_DECISION': {
      let list = getCachedData<any[]>('admin_decisions') || [];
      list = list.filter(item => item.id !== payload.id);
      saveCachedData('admin_decisions', list);
      break;
    }
    case 'ADD_POLL': {
      const list = getCachedData<any[]>('polls') || [];
      list.push(payload);
      saveCachedData('polls', list);
      break;
    }
    case 'EDIT_POLL': {
      let list = getCachedData<any[]>('polls') || [];
      list = list.map(item => item.id === payload.id ? payload : item);
      saveCachedData('polls', list);
      break;
    }
    case 'DELETE_POLL': {
      let list = getCachedData<any[]>('polls') || [];
      list = list.filter(item => item.id !== payload.id);
      saveCachedData('polls', list);
      break;
    }
    case 'ADD_COMPLAINT': {
      const list = getCachedData<any[]>('public_complaints') || [];
      list.unshift(payload);
      saveCachedData('public_complaints', list);
      break;
    }
    case 'EDIT_COMPLAINT': {
      let list = getCachedData<any[]>('public_complaints') || [];
      list = list.map(item => item.id === payload.id ? payload : item);
      saveCachedData('public_complaints', list);
      break;
    }
    case 'DELETE_COMPLAINT': {
      let list = getCachedData<any[]>('public_complaints') || [];
      list = list.filter(item => item.id !== payload.id);
      saveCachedData('public_complaints', list);
      break;
    }
    case 'ADD_MAINTENANCE': {
      const list = getCachedData<any[]>('maintenance') || [];
      list.push(payload);
      saveCachedData('maintenance', list);
      break;
    }
    case 'EDIT_MAINTENANCE': {
      let list = getCachedData<any[]>('maintenance') || [];
      list = list.map(item => item.id === payload.id ? payload : item);
      saveCachedData('maintenance', list);
      break;
    }
    case 'DELETE_MAINTENANCE': {
      let list = getCachedData<any[]>('maintenance') || [];
      list = list.filter(item => item.id !== payload.id);
      saveCachedData('maintenance', list);
      break;
    }
    case 'ADD_EVENT': {
      const list = getCachedData<any[]>('events') || [];
      list.push(payload);
      saveCachedData('events', list);
      break;
    }
    case 'EDIT_EVENT': {
      let list = getCachedData<any[]>('events') || [];
      list = list.map(item => item.id === payload.id ? payload : item);
      saveCachedData('events', list);
      break;
    }
    case 'DELETE_EVENT': {
      let list = getCachedData<any[]>('events') || [];
      list = list.filter(item => item.id !== payload.id);
      saveCachedData('events', list);
      break;
    }
  }
}

function normalizeKeyAliases(key: string): string[] {
  if (key === 'chat_messages' || key === 'messages') return ['chat_messages', 'messages'];
  if (key === 'public_complaints' || key === 'complaints') return ['public_complaints', 'complaints'];
  if (key === 'admin_decisions' || key === 'decisions') return ['admin_decisions', 'decisions'];
  return [key];
}

function getBuildingCacheKey(k: string): string {
  try {
    const bId = localStorage.getItem('active_building_id') || 'pyramids_view_1';
    if (bId === 'pyramids_view_1') {
      return `cache_${k}`;
    }
    return `cache_${bId}_${k}`;
  } catch {
    return `cache_${k}`;
  }
}

// Standard getters and setters for local cache with automatic key alias synchronization
export function getCachedData<T>(key: string): T | null {
  const keys = normalizeKeyAliases(key);
  for (const k of keys) {
    const cacheKey = getBuildingCacheKey(k);
    const json = localStorage.getItem(cacheKey);
    if (json) {
      try {
        return JSON.parse(json);
      } catch {
        // continue
      }
    }
  }
  return null;
}

export function saveCachedData(key: string, data: any) {
  const keys = normalizeKeyAliases(key);
  for (const k of keys) {
    const cacheKey = getBuildingCacheKey(k);
    localStorage.setItem(cacheKey, JSON.stringify(data));
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pyramids_cache_updated', { detail: { key, keys, data } }));
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('pyramids_channel_sync');
        bc.postMessage({ type: 'CACHE_UPDATED', key, keys, data });
        bc.close();
      }
    } catch {
      // BroadcastChannel unavailable
    }
  }
}

// Proactively clear resident-related actions from the queue (e.g. when replacing all residents)
export function clearResidentActionsFromQueue() {
  const queue = getOfflineQueue();
  const filtered = queue.filter(action => 
    action.type !== 'ADD_RESIDENT' && 
    action.type !== 'EDIT_RESIDENT' && 
    action.type !== 'DELETE_RESIDENT'
  );
  if (filtered.length !== queue.length) {
    saveOfflineQueue(filtered);
    console.info(`[Offline Sync] Cleared ${queue.length - filtered.length} resident actions from queue.`);
  }
}

// Synchronize all queued actions to Firebase Firestore sequentially
export async function syncOfflineQueue(onProgress?: (msg: string) => void): Promise<number> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return 0;

  onProgress?.(`جاري مزامنة ${queue.length} من التحديثات المعلقة مع Firebase Firestore...`);
  
  let successCount = 0;
  const remainingActions: OfflineAction[] = [];

  for (let i = 0; i < queue.length; i++) {
    const action = queue[i];
    try {
      onProgress?.(`مزامنة: ${translateActionType(action.type)}...`);
      
      switch (action.type) {
        case 'ADD_RESIDENT':
        case 'EDIT_RESIDENT':
          await firestoreService.saveResidentToFirestore(action.payload);
          break;
        case 'DELETE_RESIDENT':
          await firestoreService.deleteResidentFromFirestore(action.payload.id || action.payload);
          break;
        case 'ADD_PAYMENT':
        case 'EDIT_PAYMENT':
          await firestoreService.savePaymentToFirestore(action.payload);
          break;
        case 'DELETE_PAYMENT':
          await firestoreService.deletePaymentFromFirestore(action.payload.id || action.payload);
          break;
        case 'ADD_EXPENSE':
        case 'EDIT_EXPENSE':
          await firestoreService.saveExpenseToFirestore(action.payload);
          break;
        case 'DELETE_EXPENSE':
          await firestoreService.deleteExpenseFromFirestore(action.payload.id || action.payload);
          break;
        case 'UPDATE_RULES':
          await firestoreService.saveRulesToFirestore(action.payload);
          break;
        case 'UPDATE_CONFIG':
          await firestoreService.saveConfigToFirestore(action.payload);
          break;
        case 'ADD_CRAFTSMAN':
        case 'EDIT_CRAFTSMAN':
          await firestoreService.saveCraftsmanToFirestore(action.payload);
          break;
        case 'DELETE_CRAFTSMAN':
          await firestoreService.deleteCraftsmanFromFirestore(action.payload.id || action.payload);
          break;
        case 'ADD_CHAT_MESSAGE':
          await firestoreService.saveChatMessageToFirestore(action.payload);
          break;
        case 'DELETE_CHAT_MESSAGE':
          await firestoreService.deleteChatMessageFromFirestore(action.payload.id || action.payload);
          break;
        case 'SET_ALL_CHAT': {
          const safeList = Array.isArray(action.payload)
            ? action.payload
            : Array.isArray(action.payload?.messages)
            ? action.payload.messages
            : Array.isArray(action.payload?.data)
            ? action.payload.data
            : (action.payload && typeof action.payload === 'object' && action.payload.id ? [action.payload] : []);
          for (const msg of safeList) {
            await firestoreService.saveChatMessageToFirestore(msg);
          }
          break;
        }
        case 'ADD_DECISION':
        case 'EDIT_DECISION':
          await firestoreService.saveDecisionToFirestore(action.payload);
          break;
        case 'DELETE_DECISION':
          await firestoreService.deleteDecisionFromFirestore(action.payload.id || action.payload);
          break;
        case 'ADD_POLL':
        case 'EDIT_POLL':
          await firestoreService.savePollToFirestore(action.payload);
          break;
        case 'DELETE_POLL':
          await firestoreService.deletePollFromFirestore(action.payload.id || action.payload);
          break;
        case 'ADD_COMPLAINT':
        case 'EDIT_COMPLAINT':
          await firestoreService.saveComplaintToFirestore(action.payload);
          break;
        case 'DELETE_COMPLAINT':
          await firestoreService.deleteComplaintFromFirestore(action.payload.id || action.payload);
          break;
        case 'ADD_MAINTENANCE':
        case 'EDIT_MAINTENANCE':
          await firestoreService.saveMaintenanceToFirestore(action.payload);
          break;
        case 'DELETE_MAINTENANCE':
          await firestoreService.deleteMaintenanceFromFirestore(action.payload.id || action.payload);
          break;
        case 'ADD_EVENT':
        case 'EDIT_EVENT':
          await firestoreService.saveEventToFirestore(action.payload);
          break;
        case 'DELETE_EVENT':
          await firestoreService.deleteEventFromFirestore(action.payload.id || action.payload);
          break;
      }
      
      successCount++;
    } catch (error: any) {
      console.warn(`[Offline Sync Note] Failed to sync action ${action.id} to Firestore:`, error);
      remainingActions.push(action);
    }
  }

  saveOfflineQueue(remainingActions);
  return successCount;
}

function translateActionType(type: OfflineAction['type']): string {
  switch (type) {
    case 'ADD_RESIDENT': return 'إضافة ساكن';
    case 'EDIT_RESIDENT': return 'تعديل ساكن';
    case 'DELETE_RESIDENT': return 'حذف ساكن';
    case 'ADD_PAYMENT': return 'إضافة عملية تحصيل';
    case 'EDIT_PAYMENT': return 'تعديل عملية تحصيل';
    case 'DELETE_PAYMENT': return 'حذف عملية تحصيل';
    case 'ADD_EXPENSE': return 'إضافة مصروف جديد';
    case 'EDIT_EXPENSE': return 'تعديل مصروف';
    case 'DELETE_EXPENSE': return 'حذف مصروف';
    case 'UPDATE_RULES': return 'تحديث تعليمات العمارة';
    case 'UPDATE_CONFIG': return 'تعديل إعدادات النظام';
    case 'ADD_CRAFTSMAN': return 'إضافة فني / صنايعي';
    case 'EDIT_CRAFTSMAN': return 'تعديل بيانات فني';
    case 'DELETE_CRAFTSMAN': return 'حذف فني';
    case 'ADD_CHAT_MESSAGE': return 'إرسال رسالة دردشة';
    case 'SET_ALL_CHAT': return 'تحديث سجل المحادثات';
    case 'ADD_DECISION': return 'إصدار قرار إداري';
    case 'EDIT_DECISION': return 'تعديل قرار إداري';
    case 'DELETE_DECISION': return 'حذف قرار إداري';
    case 'ADD_POLL': return 'إنشاء استبيان وتصويت';
    case 'EDIT_POLL': return 'تعديل استبيان وتصويت';
    case 'DELETE_POLL': return 'حذف استبيان';
    case 'ADD_COMPLAINT': return 'تقديم شكوى ومقترح';
    case 'EDIT_COMPLAINT': return 'تعديل شكوى ومقترح';
    case 'DELETE_COMPLAINT': return 'حذف شكوى';
    case 'ADD_MAINTENANCE': return 'طلب صيانة جديد';
    case 'EDIT_MAINTENANCE': return 'تحديث طلب صيانة';
    case 'DELETE_MAINTENANCE': return 'حذف طلب صيانة';
    case 'ADD_EVENT': return 'إضافة موعد أو فعالية';
    case 'EDIT_EVENT': return 'تعديل موعد أو فعالية';
    case 'DELETE_EVENT': return 'حذف موعد أو فعالية';
    default: return 'عملية قاعدة البيانات';
  }
}
