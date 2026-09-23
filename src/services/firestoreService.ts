import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, notifyFirebaseStatus } from './firebaseConfig';
import {
  Resident,
  Payment,
  Expense,
  AppConfig,
  ChatMessage,
  PublicComplaint,
  MaintenanceRequest,
  Poll,
  AdminDecision,
  BuildingEvent,
  Craftsman,
  JoinRequest,
  AppNotification,
  Building
} from '../types';
import * as offlineSync from './offlineSync';
import { DEFAULT_BUILDING_ID } from './buildingStore';

// Helper to sanitize undefined values before saving to Firestore
function sanitizeForFirestore<T>(data: T): Record<string, any> {
  const result: Record<string, any> = {};
  if (!data || typeof data !== 'object') return result;
  
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

// Multi-tenant Collection & Document References
export function getActiveBuildingId(): string {
  try {
    return localStorage.getItem('active_building_id') || DEFAULT_BUILDING_ID;
  } catch {
    return DEFAULT_BUILDING_ID;
  }
}

export { isUsingCustomFirebase, getActiveFirebaseConfig, applyCustomFirebaseConfig } from './firebaseConfig';

export function getBuildingCacheKey(key: string): string {
  // Delegate cache key names directly to offlineSync's single unified getBuildingCacheKey
  return key;
}

export function getBuildingColRef(colName: string) {
  return collection(db, colName);
}

export function getBuildingDocRef(colName: string, docId: string) {
  return doc(db, colName, docId);
}

// ----------------------------------------------------
// BUILDINGS (Global Collection)
// ----------------------------------------------------
export async function getAllBuildingsFromFirestore(): Promise<Building[]> {
  try {
    const colRef = collection(db, 'buildings');
    const snapshot = await getDocs(colRef);
    const list: Building[] = [];
    snapshot.forEach(docSnap => {
      list.push(docSnap.data() as Building);
    });
    return list;
  } catch (error) {
    console.warn('Could not fetch buildings from firestore:', error);
    return [];
  }
}

export async function saveBuildingToFirestore(building: Building): Promise<void> {
  try {
    const docRef = doc(db, 'buildings', building.id);
    await setDoc(docRef, sanitizeForFirestore(building), { merge: true });
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: `buildings/${building.id}`
    });
  }
}

export async function getBuildingFromFirestore(id: string): Promise<Building | null> {
  try {
    const docRef = doc(db, 'buildings', id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as Building;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// ----------------------------------------------------
// RESIDENTS
// ----------------------------------------------------
export async function getResidentsFromFirestore(): Promise<Resident[]> {
  const cacheKey = getBuildingCacheKey('residents');
  const cached = offlineSync.getCachedData<Resident[]>(cacheKey) || [];
  try {
    const colRef = getBuildingColRef('residents');
    const snapshot = await getDocs(colRef);
    const residents: Resident[] = [];
    snapshot.forEach(docSnap => {
      residents.push(docSnap.data() as Resident);
    });
    if (residents.length > 0) {
      const remoteIds = new Set(residents.map(r => String(r.id)));
      const unsyncedLocal = cached.filter(r => !remoteIds.has(String(r.id)));
      const merged = [...residents, ...unsyncedLocal];
      offlineSync.saveCachedData(cacheKey, merged);
      return merged;
    }
    return cached;
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.LIST,
      path: 'residents',
      userMessage: 'فشل تحميل بيانات السكان من Firestore'
    });
    return cached;
  }
}

export async function saveResidentToFirestore(resident: Resident): Promise<void> {
  const cleanId = String(resident.id || `res_${resident.flatNumber}_${Date.now()}`);
  const payload = { ...resident, id: cleanId };
  try {
    const docRef = getBuildingDocRef('residents', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: `residents/${cleanId}`
    });
  }
  // Local cache update
  const cacheKey = getBuildingCacheKey('residents');
  let list = offlineSync.getCachedData<Resident[]>(cacheKey) || [];
  const idx = list.findIndex(r => String(r.id) === cleanId || String(r.flatNumber) === String(resident.flatNumber));
  if (idx >= 0) {
    list[idx] = payload;
  } else {
    list.push(payload);
  }
  offlineSync.saveCachedData(cacheKey, list);
}

export async function deleteResidentFromFirestore(id: string): Promise<void> {
  try {
    const docRef = getBuildingDocRef('residents', String(id));
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `residents/${id}`
    });
  }
  const cacheKey = getBuildingCacheKey('residents');
  let list = offlineSync.getCachedData<Resident[]>(cacheKey) || [];
  list = list.filter(r => String(r.id) !== String(id));
  offlineSync.saveCachedData(cacheKey, list);
}

export async function saveBatchResidentsToFirestore(residents: Resident[]): Promise<void> {
  const cacheKey = getBuildingCacheKey('residents');

  // Update local cache immediately for instant UI feedback
  offlineSync.saveCachedData(cacheKey, residents);

  try {
    const colRef = getBuildingColRef('residents');
    const snap = await getDocs(colRef);
    const serverResidents = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Resident));

    const activeIds = new Set(residents.map(r => String(r.id)));
    const deleteOps = serverResidents
      .filter(r => r && r.id && !activeIds.has(String(r.id)))
      .map(r => getBuildingDocRef('residents', String(r.id)));

    // Prepare set operations
    const setOps = residents.map(res => {
      const cleanId = String(res.id || `res_${res.flatNumber}`);
      return {
        ref: getBuildingDocRef('residents', cleanId),
        data: sanitizeForFirestore({ ...res, id: cleanId })
      };
    });

    // Process commits in small chunk sizes (150 ops max per batch)
    const CHUNK_SIZE = 150;

    // Process deletes
    for (let i = 0; i < deleteOps.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = deleteOps.slice(i, i + CHUNK_SIZE);
      chunk.forEach(ref => batch.delete(ref));
      await batch.commit().catch(err => console.warn('Delete batch commit warning:', err));
    }

    // Process sets
    for (let i = 0; i < setOps.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = setOps.slice(i, i + CHUNK_SIZE);
      chunk.forEach(op => batch.set(op.ref, op.data, { merge: true }));
      await batch.commit().catch(err => console.warn('Set batch commit warning:', err));
    }
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.CREATE,
      path: 'residents'
    });
  }
}

// ----------------------------------------------------
// PAYMENTS
// ----------------------------------------------------
export async function getPaymentsFromFirestore(): Promise<Payment[]> {
  const cacheKey = getBuildingCacheKey('payments');
  const cached = offlineSync.getCachedData<Payment[]>(cacheKey) || [];
  try {
    const colRef = getBuildingColRef('payments');
    const snapshot = await getDocs(colRef);
    const payments: Payment[] = [];
    snapshot.forEach(docSnap => {
      payments.push(docSnap.data() as Payment);
    });
    if (payments.length > 0) {
      const remoteIds = new Set(payments.map(p => String(p.id)));
      const unsyncedLocal = cached.filter(p => !remoteIds.has(String(p.id)));
      const merged = [...payments, ...unsyncedLocal];
      offlineSync.saveCachedData(cacheKey, merged);
      return merged;
    }
    return cached;
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.LIST,
      path: 'payments'
    });
    return cached;
  }
}

export async function savePaymentToFirestore(payment: Payment): Promise<void> {
  const cleanId = String(payment.id || `pay_${Date.now()}`);
  const payload = { ...payment, id: cleanId };
  try {
    const docRef = getBuildingDocRef('payments', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: `payments/${cleanId}`
    });
  }
  const cacheKey = getBuildingCacheKey('payments');
  let list = offlineSync.getCachedData<Payment[]>(cacheKey) || [];
  const idx = list.findIndex(p => String(p.id) === cleanId);
  if (idx >= 0) {
    list[idx] = payload;
  } else {
    list.push(payload);
  }
  offlineSync.saveCachedData(cacheKey, list);
}

export async function deletePaymentFromFirestore(id: string): Promise<void> {
  try {
    const docRef = getBuildingDocRef('payments', String(id));
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `payments/${id}`
    });
  }
  const cacheKey = getBuildingCacheKey('payments');
  let list = offlineSync.getCachedData<Payment[]>(cacheKey) || [];
  list = list.filter(p => String(p.id) !== String(id));
  offlineSync.saveCachedData(cacheKey, list);
}

// ----------------------------------------------------
// EXPENSES
// ----------------------------------------------------
export async function getExpensesFromFirestore(): Promise<Expense[]> {
  const cacheKey = getBuildingCacheKey('expenses');
  const cached = offlineSync.getCachedData<Expense[]>(cacheKey) || [];
  try {
    const colRef = getBuildingColRef('expenses');
    const snapshot = await getDocs(colRef);
    const expenses: Expense[] = [];
    snapshot.forEach(docSnap => {
      expenses.push(docSnap.data() as Expense);
    });
    if (expenses.length > 0) {
      const remoteIds = new Set(expenses.map(e => String(e.id)));
      const unsyncedLocal = cached.filter(e => !remoteIds.has(String(e.id)));
      const merged = [...expenses, ...unsyncedLocal];
      offlineSync.saveCachedData(cacheKey, merged);
      return merged;
    }
    return cached;
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.LIST,
      path: 'expenses'
    });
    return cached;
  }
}

export async function saveExpenseToFirestore(expense: Expense): Promise<void> {
  const cleanId = String(expense.id || `exp_${Date.now()}`);
  const payload = { ...expense, id: cleanId };
  try {
    const docRef = getBuildingDocRef('expenses', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: `expenses/${cleanId}`
    });
  }
  const cacheKey = getBuildingCacheKey('expenses');
  let list = offlineSync.getCachedData<Expense[]>(cacheKey) || [];
  const idx = list.findIndex(e => String(e.id) === cleanId);
  if (idx >= 0) {
    list[idx] = payload;
  } else {
    list.push(payload);
  }
  offlineSync.saveCachedData(cacheKey, list);
}

export async function deleteExpenseFromFirestore(id: string): Promise<void> {
  try {
    const docRef = getBuildingDocRef('expenses', String(id));
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `expenses/${id}`
    });
  }
  const cacheKey = getBuildingCacheKey('expenses');
  let list = offlineSync.getCachedData<Expense[]>(cacheKey) || [];
  list = list.filter(e => String(e.id) !== String(id));
  offlineSync.saveCachedData(cacheKey, list);
}

// ----------------------------------------------------
// APP CONFIG & RULES
// ----------------------------------------------------
export async function getConfigFromFirestore(): Promise<AppConfig | null> {
  const cacheKey = getBuildingCacheKey('config');
  try {
    const docRef = getBuildingDocRef('config', 'app_config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as AppConfig;
      offlineSync.saveCachedData(cacheKey, data);
      return data;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.READ,
      path: 'config/app_config'
    });
    return offlineSync.getCachedData<AppConfig>(cacheKey);
  }
}

export async function saveConfigToFirestore(config: AppConfig): Promise<void> {
  const cacheKey = getBuildingCacheKey('config');
  try {
    const docRef = getBuildingDocRef('config', 'app_config');
    await setDoc(docRef, sanitizeForFirestore({ ...config, updatedAt: new Date().toISOString() }), { merge: true });
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: 'config/app_config'
    });
  }
  offlineSync.saveCachedData(cacheKey, config);
}

export async function getRulesFromFirestore(): Promise<string[]> {
  const cacheKey = getBuildingCacheKey('rules');
  try {
    const docRef = getBuildingDocRef('rules', 'building_rules');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const rules = data?.rules || [];
      offlineSync.saveCachedData(cacheKey, { rules });
      return rules;
    }
    return [];
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.READ,
      path: 'rules/building_rules'
    });
    const cached = offlineSync.getCachedData<any>(cacheKey);
    return cached?.rules || [];
  }
}

export async function saveRulesToFirestore(rules: string[]): Promise<void> {
  const cacheKey = getBuildingCacheKey('rules');
  try {
    const docRef = getBuildingDocRef('rules', 'building_rules');
    await setDoc(docRef, { rules, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: 'rules/building_rules'
    });
  }
  offlineSync.saveCachedData(cacheKey, { rules });
}

// ----------------------------------------------------
// CHAT MESSAGES
// ----------------------------------------------------
export async function getChatMessagesFromFirestore(): Promise<ChatMessage[]> {
  const cacheKey = getBuildingCacheKey('chat_messages');
  const cached = offlineSync.getCachedData<ChatMessage[]>(cacheKey) || [];
  try {
    const colRef = getBuildingColRef('chat_messages');
    const q = query(colRef, orderBy('timestamp', 'asc'));
    const snapshot = await getDocs(q);
    const messages: ChatMessage[] = [];
    snapshot.forEach(docSnap => {
      messages.push(docSnap.data() as ChatMessage);
    });
    if (messages.length > 0) {
      const remoteIds = new Set(messages.map(m => String(m.id)));
      const unsyncedLocal = cached.filter(m => !remoteIds.has(String(m.id)));
      const merged = [...messages, ...unsyncedLocal].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      offlineSync.saveCachedData(cacheKey, merged);
      return merged;
    }
    return cached;
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.LIST,
      path: 'chat_messages'
    });
    return cached;
  }
}

export async function saveChatMessageToFirestore(msg: ChatMessage): Promise<void> {
  const cleanId = String(msg.id || `msg_${Date.now()}`);
  const payload = { ...msg, id: cleanId };
  try {
    const docRef = getBuildingDocRef('chat_messages', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.CREATE,
      path: `chat_messages/${cleanId}`
    });
  }
  const cacheKey = getBuildingCacheKey('chat_messages');
  let list = offlineSync.getCachedData<ChatMessage[]>(cacheKey) || [];
  list.push(payload);
  offlineSync.saveCachedData(cacheKey, list);
}

export async function deleteChatMessageFromFirestore(id: string): Promise<void> {
  try {
    const docRef = getBuildingDocRef('chat_messages', String(id));
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `chat_messages/${id}`
    });
  }
  const cacheKey = getBuildingCacheKey('chat_messages');
  let list = offlineSync.getCachedData<ChatMessage[]>(cacheKey) || [];
  list = list.filter(m => String(m.id) !== String(id));
  offlineSync.saveCachedData(cacheKey, list);
}

export async function updateChatMessageInFirestore(id: string, newText: string): Promise<void> {
  try {
    const docRef = getBuildingDocRef('chat_messages', String(id));
    await setDoc(docRef, { text: newText, editedAt: new Date().toISOString() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: `chat_messages/${id}`
    });
  }
  const cacheKey = getBuildingCacheKey('chat_messages');
  let list = offlineSync.getCachedData<ChatMessage[]>(cacheKey) || [];
  list = list.map(m => String(m.id) === String(id) ? { ...m, text: newText } : m);
  offlineSync.saveCachedData(cacheKey, list);
}

export function subscribeToChatMessages(callback: (messages: ChatMessage[]) => void): () => void {
  try {
    const colRef = getBuildingColRef('chat_messages');
    return onSnapshot(colRef, (snapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        messages.push(docSnap.data() as ChatMessage);
      });
      messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const cacheKey = getBuildingCacheKey('chat_messages');
      if (messages.length > 0) {
        offlineSync.saveCachedData(cacheKey, messages);
      }
      callback(messages);
    }, (error) => {
      console.warn('Realtime messages listener note:', error?.message);
    });
  } catch (err) {
    console.warn('Could not establish messages snapshot listener:', err);
    return () => {};
  }
}

// ----------------------------------------------------
// PUBLIC COMPLAINTS & SUGGESTIONS
// ----------------------------------------------------
export async function getComplaintsFromFirestore(): Promise<PublicComplaint[]> {
  const cacheKey = getBuildingCacheKey('public_complaints');
  try {
    const colRef = getBuildingColRef('public_complaints');
    const snapshot = await getDocs(colRef);
    const complaints: PublicComplaint[] = [];
    snapshot.forEach(docSnap => {
      complaints.push(docSnap.data() as PublicComplaint);
    });
    if (complaints.length > 0) {
      offlineSync.saveCachedData(cacheKey, complaints);
    }
    return complaints;
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.LIST,
      path: 'public_complaints'
    });
    return offlineSync.getCachedData<PublicComplaint[]>(cacheKey) || [];
  }
}

export async function saveComplaintToFirestore(complaint: PublicComplaint): Promise<void> {
  const cleanId = String(complaint.id || `comp_${Date.now()}`);
  const payload = { ...complaint, id: cleanId };
  try {
    const docRef = getBuildingDocRef('public_complaints', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.CREATE,
      path: `public_complaints/${cleanId}`
    });
  }
  const cacheKey = getBuildingCacheKey('public_complaints');
  let list = offlineSync.getCachedData<PublicComplaint[]>(cacheKey) || [];
  const idx = list.findIndex(c => String(c.id) === cleanId);
  if (idx >= 0) {
    list[idx] = payload;
  } else {
    list.unshift(payload);
  }
  offlineSync.saveCachedData(cacheKey, list);
}

export async function deleteComplaintFromFirestore(id: string): Promise<void> {
  try {
    const docRef = getBuildingDocRef('public_complaints', String(id));
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `public_complaints/${id}`
    });
  }
  const cacheKey = getBuildingCacheKey('public_complaints');
  let list = offlineSync.getCachedData<PublicComplaint[]>(cacheKey) || [];
  list = list.filter(c => String(c.id) !== String(id));
  offlineSync.saveCachedData(cacheKey, list);
}

// ----------------------------------------------------
// MAINTENANCE REQUESTS
// ----------------------------------------------------
export async function getMaintenanceFromFirestore(): Promise<MaintenanceRequest[]> {
  const cacheKey = getBuildingCacheKey('maintenance');
  try {
    const colRef = getBuildingColRef('maintenance');
    const snapshot = await getDocs(colRef);
    const items: MaintenanceRequest[] = [];
    snapshot.forEach(docSnap => {
      items.push(docSnap.data() as MaintenanceRequest);
    });
    if (items.length > 0) {
      offlineSync.saveCachedData(cacheKey, items);
    }
    return items;
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.LIST,
      path: 'maintenance'
    });
    return offlineSync.getCachedData<MaintenanceRequest[]>(cacheKey) || [];
  }
}

export async function saveMaintenanceToFirestore(item: MaintenanceRequest): Promise<void> {
  const cleanId = String(item.id || `maint_${Date.now()}`);
  const payload = { ...item, id: cleanId };
  try {
    const docRef = getBuildingDocRef('maintenance', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: `maintenance/${cleanId}`
    });
  }
  const cacheKey = getBuildingCacheKey('maintenance');
  let list = offlineSync.getCachedData<MaintenanceRequest[]>(cacheKey) || [];
  const idx = list.findIndex(m => String(m.id) === cleanId);
  if (idx >= 0) {
    list[idx] = payload;
  } else {
    list.push(payload);
  }
  offlineSync.saveCachedData(cacheKey, list);
}

export async function deleteMaintenanceFromFirestore(id: string): Promise<void> {
  try {
    const docRef = getBuildingDocRef('maintenance', String(id));
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `maintenance/${id}`
    });
  }
  const cacheKey = getBuildingCacheKey('maintenance');
  let list = offlineSync.getCachedData<MaintenanceRequest[]>(cacheKey) || [];
  list = list.filter(m => String(m.id) !== String(id));
  offlineSync.saveCachedData(cacheKey, list);
}

// ----------------------------------------------------
// POLLS & DECISIONS
// ----------------------------------------------------
export async function getPollsFromFirestore(): Promise<Poll[]> {
  const cacheKey = getBuildingCacheKey('polls');
  try {
    const colRef = getBuildingColRef('polls');
    const snapshot = await getDocs(colRef);
    const polls: Poll[] = [];
    snapshot.forEach(docSnap => {
      polls.push(docSnap.data() as Poll);
    });
    if (polls.length > 0) {
      offlineSync.saveCachedData(cacheKey, polls);
    }
    return polls;
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.LIST,
      path: 'polls'
    });
    return offlineSync.getCachedData<Poll[]>(cacheKey) || [];
  }
}

export async function savePollToFirestore(poll: Poll): Promise<void> {
  const cleanId = String(poll.id || `poll_${Date.now()}`);
  const payload = { ...poll, id: cleanId };
  try {
    const docRef = getBuildingDocRef('polls', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: `polls/${cleanId}`
    });
  }
  const cacheKey = getBuildingCacheKey('polls');
  let list = offlineSync.getCachedData<Poll[]>(cacheKey) || [];
  const idx = list.findIndex(p => String(p.id) === cleanId);
  if (idx >= 0) {
    list[idx] = payload;
  } else {
    list.push(payload);
  }
  offlineSync.saveCachedData(cacheKey, list);
}

export async function deletePollFromFirestore(id: string): Promise<void> {
  try {
    const docRef = getBuildingDocRef('polls', String(id));
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `polls/${id}`
    });
  }
  const cacheKey = getBuildingCacheKey('polls');
  let list = offlineSync.getCachedData<Poll[]>(cacheKey) || [];
  list = list.filter(p => String(p.id) !== String(id));
  offlineSync.saveCachedData(cacheKey, list);
}

export async function getDecisionsFromFirestore(): Promise<AdminDecision[]> {
  const cacheKey = getBuildingCacheKey('admin_decisions');
  try {
    const colRef = getBuildingColRef('admin_decisions');
    const snapshot = await getDocs(colRef);
    const items: AdminDecision[] = [];
    snapshot.forEach(docSnap => {
      items.push(docSnap.data() as AdminDecision);
    });
    if (items.length > 0) {
      offlineSync.saveCachedData(cacheKey, items);
    }
    return items;
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.LIST,
      path: 'admin_decisions'
    });
    return offlineSync.getCachedData<AdminDecision[]>(cacheKey) || [];
  }
}

export async function saveDecisionToFirestore(decision: AdminDecision): Promise<void> {
  const cleanId = String(decision.id || `dec_${Date.now()}`);
  const payload = { ...decision, id: cleanId };
  try {
    const docRef = getBuildingDocRef('admin_decisions', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: `admin_decisions/${cleanId}`
    });
  }
  const cacheKey = getBuildingCacheKey('admin_decisions');
  let list = offlineSync.getCachedData<AdminDecision[]>(cacheKey) || [];
  const idx = list.findIndex(d => String(d.id) === cleanId);
  if (idx >= 0) {
    list[idx] = payload;
  } else {
    list.push(payload);
  }
  offlineSync.saveCachedData(cacheKey, list);
}

export async function deleteDecisionFromFirestore(id: string): Promise<void> {
  try {
    const docRef = getBuildingDocRef('admin_decisions', String(id));
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `admin_decisions/${id}`
    });
  }
  const cacheKey = getBuildingCacheKey('admin_decisions');
  let list = offlineSync.getCachedData<AdminDecision[]>(cacheKey) || [];
  list = list.filter(d => String(d.id) !== String(id));
  offlineSync.saveCachedData(cacheKey, list);
}

// ----------------------------------------------------
// EVENTS & CRAFTSMEN
// ----------------------------------------------------
export async function getEventsFromFirestore(): Promise<BuildingEvent[]> {
  const cacheKey = getBuildingCacheKey('events');
  try {
    const colRef = getBuildingColRef('events');
    const snapshot = await getDocs(colRef);
    const events: BuildingEvent[] = [];
    snapshot.forEach(docSnap => {
      events.push(docSnap.data() as BuildingEvent);
    });
    if (events.length > 0) {
      offlineSync.saveCachedData(cacheKey, events);
    }
    return events;
  } catch (error) {
    return offlineSync.getCachedData<BuildingEvent[]>(cacheKey) || [];
  }
}

export async function saveEventToFirestore(event: BuildingEvent): Promise<void> {
  const cleanId = String(event.id || `ev_${Date.now()}`);
  const payload = { ...event, id: cleanId };
  try {
    const docRef = getBuildingDocRef('events', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, { operation: OperationType.UPDATE, path: `events/${cleanId}` });
  }
  const cacheKey = getBuildingCacheKey('events');
  let list = offlineSync.getCachedData<BuildingEvent[]>(cacheKey) || [];
  const idx = list.findIndex(e => String(e.id) === cleanId);
  if (idx >= 0) list[idx] = payload; else list.push(payload);
  offlineSync.saveCachedData(cacheKey, list);
}

export async function deleteEventFromFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(getBuildingDocRef('events', String(id)));
  } catch (error) {
    handleFirestoreError(error, { operation: OperationType.DELETE, path: `events/${id}` });
  }
  const cacheKey = getBuildingCacheKey('events');
  let list = offlineSync.getCachedData<BuildingEvent[]>(cacheKey) || [];
  list = list.filter(e => String(e.id) !== String(id));
  offlineSync.saveCachedData(cacheKey, list);
}

export async function getCraftsmenFromFirestore(): Promise<Craftsman[]> {
  const cacheKey = getBuildingCacheKey('craftsmen');
  try {
    const colRef = getBuildingColRef('craftsmen');
    const snapshot = await getDocs(colRef);
    const craftsmen: Craftsman[] = [];
    snapshot.forEach(docSnap => {
      craftsmen.push(docSnap.data() as Craftsman);
    });
    if (craftsmen.length > 0) {
      offlineSync.saveCachedData(cacheKey, craftsmen);
    }
    return craftsmen;
  } catch (error) {
    return offlineSync.getCachedData<Craftsman[]>(cacheKey) || [];
  }
}

export async function saveCraftsmanToFirestore(craftsman: Craftsman): Promise<void> {
  const cleanId = String(craftsman.id || `craft_${Date.now()}`);
  const payload = { ...craftsman, id: cleanId };
  try {
    await setDoc(getBuildingDocRef('craftsmen', cleanId), sanitizeForFirestore(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, { operation: OperationType.UPDATE, path: `craftsmen/${cleanId}` });
  }
  const cacheKey = getBuildingCacheKey('craftsmen');
  let list = offlineSync.getCachedData<Craftsman[]>(cacheKey) || [];
  const idx = list.findIndex(c => String(c.id) === cleanId);
  if (idx >= 0) list[idx] = payload; else list.push(payload);
  offlineSync.saveCachedData(cacheKey, list);
}

export async function deleteCraftsmanFromFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(getBuildingDocRef('craftsmen', String(id)));
  } catch (error) {
    handleFirestoreError(error, { operation: OperationType.DELETE, path: `craftsmen/${id}` });
  }
  const cacheKey = getBuildingCacheKey('craftsmen');
  let list = offlineSync.getCachedData<Craftsman[]>(cacheKey) || [];
  list = list.filter(c => String(c.id) !== String(id));
  offlineSync.saveCachedData(cacheKey, list);
}

// ----------------------------------------------------
// JOIN REQUESTS & INVITATIONS
// ----------------------------------------------------
export async function getJoinRequestsFromFirestore(): Promise<JoinRequest[]> {
  try {
    const colRef = getBuildingColRef('join_requests');
    const snapshot = await getDocs(colRef);
    const requests: JoinRequest[] = [];
    snapshot.forEach(docSnap => {
      requests.push(docSnap.data() as JoinRequest);
    });
    return requests;
  } catch (error) {
    handleFirestoreError(error, { operation: OperationType.LIST, path: 'join_requests' });
    try {
      const local = localStorage.getItem('custom_join_requests');
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  }
}

export async function saveJoinRequestToFirestore(req: JoinRequest): Promise<void> {
  const cleanId = String(req.id || `req_${Date.now()}`);
  const payload = { ...req, id: cleanId };
  try {
    await setDoc(getBuildingDocRef('join_requests', cleanId), sanitizeForFirestore(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, { operation: OperationType.CREATE, path: `join_requests/${cleanId}` });
  }
  try {
    const local = localStorage.getItem('custom_join_requests');
    const list: JoinRequest[] = local ? JSON.parse(local) : [];
    const idx = list.findIndex(r => String(r.id) === cleanId);
    if (idx >= 0) list[idx] = payload; else list.push(payload);
    localStorage.setItem('custom_join_requests', JSON.stringify(list));
  } catch {}
}

export async function updateJoinRequestStatusInFirestore(id: string, status: 'APPROVED' | 'REJECTED'): Promise<void> {
  try {
    await setDoc(getBuildingDocRef('join_requests', String(id)), { status, reviewedAt: new Date().toISOString() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, { operation: OperationType.UPDATE, path: `join_requests/${id}` });
  }
  try {
    const local = localStorage.getItem('custom_join_requests');
    if (local) {
      const list: JoinRequest[] = JSON.parse(local);
      const updated = list.map(r => String(r.id) === String(id) ? { ...r, status } : r);
      localStorage.setItem('custom_join_requests', JSON.stringify(updated));
    }
  } catch {}
}

// ----------------------------------------------------
// NOTIFICATIONS
// ----------------------------------------------------
export async function getNotificationsFromFirestore(): Promise<AppNotification[]> {
  try {
    const colRef = getBuildingColRef('notifications');
    const snapshot = await getDocs(colRef);
    const notifications: AppNotification[] = [];
    snapshot.forEach(docSnap => {
      notifications.push(docSnap.data() as AppNotification);
    });
    return notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    return [];
  }
}

export async function saveNotificationToFirestore(n: AppNotification): Promise<void> {
  const cleanId = String(n.id || `notif_${Date.now()}`);
  const payload = { ...n, id: cleanId };
  try {
    await setDoc(getBuildingDocRef('notifications', cleanId), sanitizeForFirestore(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, { operation: OperationType.CREATE, path: `notifications/${cleanId}` });
  }
}

export async function deleteNotificationFromFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(getBuildingDocRef('notifications', String(id)));
  } catch (error) {
    handleFirestoreError(error, { operation: OperationType.DELETE, path: `notifications/${id}` });
  }
}

export async function clearAllNotificationsInFirestore(): Promise<void> {
  try {
    const snapshot = await getDocs(getBuildingColRef('notifications'));
    const batch = writeBatch(db);
    snapshot.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, { operation: OperationType.DELETE, path: 'notifications' });
  }
}

export function subscribeToNotifications(callback: (notifs: AppNotification[]) => void): () => void {
  try {
    const colRef = getBuildingColRef('notifications');
    return onSnapshot(colRef, (snapshot) => {
      const notifs: AppNotification[] = [];
      snapshot.forEach((docSnap) => {
        notifs.push(docSnap.data() as AppNotification);
      });
      notifs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      callback(notifs);
    }, (error) => {
      console.warn('Realtime notifications listener note:', error?.message);
    });
  } catch (err) {
    console.warn('Could not establish notifications listener:', err);
    return () => {};
  }
}

// ----------------------------------------------------
// UNIFIED DATA FETCH
// ----------------------------------------------------
export async function getAllDataFromFirestore(): Promise<{
  residents: Resident[];
  payments: Payment[];
  expenses: Expense[];
  rules: string[];
  craftsmen: Craftsman[];
  messages: ChatMessage[];
  decisions: AdminDecision[];
  polls: Poll[];
  complaints: PublicComplaint[];
  maintenance: MaintenanceRequest[];
  events: BuildingEvent[];
  config: AppConfig | null;
}> {
  const [
    residents,
    payments,
    expenses,
    rules,
    craftsmen,
    messages,
    decisions,
    polls,
    complaints,
    maintenance,
    events,
    config
  ] = await Promise.all([
    getResidentsFromFirestore(),
    getPaymentsFromFirestore(),
    getExpensesFromFirestore(),
    getRulesFromFirestore(),
    getCraftsmenFromFirestore(),
    getChatMessagesFromFirestore(),
    getDecisionsFromFirestore(),
    getPollsFromFirestore(),
    getComplaintsFromFirestore(),
    getMaintenanceFromFirestore(),
    getEventsFromFirestore(),
    getConfigFromFirestore()
  ]);

  return {
    residents,
    payments,
    expenses,
    rules,
    craftsmen,
    messages,
    decisions,
    polls,
    complaints,
    maintenance,
    events,
    config
  };
}

// ----------------------------------------------------
// REAL-TIME LISTENERS
// ----------------------------------------------------
export function subscribeToFirestoreCollection<T>(
  collectionName: string,
  onUpdate: (items: T[]) => void,
  sortFn?: (a: T, b: T) => number
): () => void {
  try {
    const colRef = getBuildingColRef(collectionName);
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const items: T[] = [];
      snapshot.forEach(docSnap => {
        items.push(docSnap.data() as T);
      });
      if (sortFn) {
        items.sort(sortFn);
      }
      onUpdate(items);
    }, (error) => {
      console.warn(`[Firestore listener notice for ${collectionName}]:`, error.message);
    });
    return unsubscribe;
  } catch (error) {
    console.warn(`Failed to attach listener to ${collectionName}:`, error);
    return () => {};
  }
}

export function subscribeToComplaints(callback: (complaints: PublicComplaint[]) => void): () => void {
  return subscribeToFirestoreCollection<PublicComplaint>('public_complaints', callback, (a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function subscribeToMaintenance(callback: (maintenance: MaintenanceRequest[]) => void): () => void {
  return subscribeToFirestoreCollection<MaintenanceRequest>('maintenance', callback, (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

export function subscribeToPolls(callback: (polls: Poll[]) => void): () => void {
  return subscribeToFirestoreCollection<Poll>('polls', callback, (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

export function subscribeToDecisions(callback: (decisions: AdminDecision[]) => void): () => void {
  return subscribeToFirestoreCollection<AdminDecision>('admin_decisions', callback, (a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function subscribeToEvents(callback: (events: BuildingEvent[]) => void): () => void {
  return subscribeToFirestoreCollection<BuildingEvent>('events', callback, (a, b) => (a.date || '').localeCompare(b.date || ''));
}

export function subscribeToCraftsmen(callback: (craftsmen: Craftsman[]) => void): () => void {
  return subscribeToFirestoreCollection<Craftsman>('craftsmen', callback);
}

export function subscribeToResidents(callback: (residents: Resident[]) => void): () => void {
  return subscribeToFirestoreCollection<Resident>('residents', callback);
}

export function subscribeToPayments(callback: (payments: Payment[]) => void): () => void {
  return subscribeToFirestoreCollection<Payment>('payments', callback);
}

export function subscribeToExpenses(callback: (expenses: Expense[]) => void): () => void {
  return subscribeToFirestoreCollection<Expense>('expenses', callback);
}

export function subscribeToConfig(callback: (config: AppConfig) => void): () => void {
  try {
    const docRef = getBuildingDocRef('config', 'app_config');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        callback(snap.data() as AppConfig);
      }
    }, (error) => {
      console.warn('[Firestore listener notice for config]:', error.message);
    });
  } catch (error) {
    return () => {};
  }
}

export function subscribeToRules(callback: (rules: string[]) => void): () => void {
  try {
    const docRef = getBuildingDocRef('rules', 'building_rules');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callback(data?.rules || []);
      }
    }, (error) => {
      console.warn('[Firestore listener notice for rules]:', error.message);
    });
  } catch (error) {
    return () => {};
  }
}

