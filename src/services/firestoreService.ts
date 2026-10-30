import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  writeBatch,
  arrayUnion
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
import { deduplicateResidents, isSameFlatNumber } from '../utils/buildingStructure';
import { filterAndDeduplicatePayments, registerDeletedPaymentIds, restoreActivePaymentsFromDeletedSet } from '../utils/financialCalculations';

// Helper to recursively sanitize undefined values before saving to Firestore (handles arrays & nested objects)
function sanitizeForFirestore(data: any): any {
  if (data === undefined) return null;
  if (data === null || typeof data !== 'object') return data;
  if (data instanceof Date) return data;

  if (Array.isArray(data)) {
    return data
      .filter(item => item !== undefined)
      .map(item => sanitizeForFirestore(item));
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      result[key] = sanitizeForFirestore(value);
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
  return key;
}

export function getBuildingColRef(colName: string) {
  return collection(db, colName);
}

export function getBuildingDocRef(colName: string, docId: string) {
  return doc(db, colName, docId);
}

// Persistent Deleted Entity IDs Tracker to permanently prevent deleted items from reappearing on refresh/sync
const DELETED_ENTITY_IDS_KEY = 'pyramids_deleted_entity_ids_v1';
const DELETED_PAYMENTS_KEY = 'deleted_payment_ids_v2';

export function getDeletedEntityIds(): Set<string> {
  const combined = new Set<string>();
  try {
    const raw1 = localStorage.getItem(DELETED_ENTITY_IDS_KEY);
    if (raw1) {
      const parsed1 = JSON.parse(raw1);
      if (Array.isArray(parsed1)) {
        parsed1.forEach(id => {
          const s = String(id).trim();
          if (s) combined.add(s);
        });
      }
    }
  } catch {}

  try {
    const raw2 = localStorage.getItem(DELETED_PAYMENTS_KEY);
    if (raw2) {
      const parsed2 = JSON.parse(raw2);
      if (Array.isArray(parsed2)) {
        parsed2.forEach(id => {
          const s = String(id).trim();
          if (s) combined.add(s);
        });
      }
    }
  } catch {}

  return combined;
}

export function registerDeletedEntityId(id: string | number): void {
  if (!id) return;
  const cleanId = String(id).trim();
  if (!cleanId) return;
  try {
    const set = getDeletedEntityIds();
    set.add(cleanId);
    const arr = Array.from(set).slice(-2000);
    const json = JSON.stringify(arr);
    localStorage.setItem(DELETED_ENTITY_IDS_KEY, json);
    localStorage.setItem(DELETED_PAYMENTS_KEY, json);
  } catch {}
}

export function isEntityDeleted(id: string | number): boolean {
  if (!id) return false;
  return getDeletedEntityIds().has(String(id).trim());
}

export async function recordDeletedPaymentIdsInCloud(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const cleanIds = ids.map(id => String(id).trim()).filter(Boolean);
  if (cleanIds.length === 0) return;

  const payload = {
    paymentIds: arrayUnion(...cleanIds),
    updatedAt: new Date().toISOString()
  };

  const activeId = getActiveBuildingId();
  const promises: Promise<any>[] = [];

  // 1. Guaranteed allowed path under config collection
  try {
    promises.push(setDoc(doc(db, 'config', 'deleted_records'), payload, { merge: true }));
  } catch {}

  // 2. Standard system collection
  try {
    promises.push(setDoc(doc(db, 'system', 'deleted_records'), payload, { merge: true }));
  } catch {}

  // 3. Active building subcollection
  if (activeId && activeId !== DEFAULT_BUILDING_ID) {
    try {
      promises.push(setDoc(doc(db, 'buildings', activeId, 'system', 'deleted_records'), payload, { merge: true }));
      promises.push(setDoc(doc(db, 'buildings', activeId, 'config', 'deleted_records'), payload, { merge: true }));
    } catch {}
  }

  // 4. Default building fallback
  try {
    promises.push(setDoc(doc(db, 'buildings', DEFAULT_BUILDING_ID, 'system', 'deleted_records'), payload, { merge: true }));
    promises.push(setDoc(doc(db, 'buildings', DEFAULT_BUILDING_ID, 'config', 'deleted_records'), payload, { merge: true }));
  } catch {}

  await Promise.allSettled(promises);
}

export function subscribeToDeletedRecords(callback: (deletedPaymentIds: string[]) => void): () => void {
  const unsubs: (() => void)[] = [];
  const handledIds = new Set<string>();

  const processSnap = (snap: any) => {
    if (snap && snap.exists()) {
      const data = snap.data();
      const ids = Array.isArray(data?.paymentIds) ? data.paymentIds.map((id: any) => String(id).trim()).filter(Boolean) : [];
      const newIds = ids.filter((id: string) => !handledIds.has(id));
      if (newIds.length > 0) {
        newIds.forEach((id: string) => handledIds.add(id));
        registerDeletedEntityId(newIds[0]); // Register into localStorage
        registerDeletedPaymentIds(newIds);
        callback(ids);
      }
    }
  };

  // Listen to config/deleted_records (always allowed)
  try {
    const unsubConfig = onSnapshot(doc(db, 'config', 'deleted_records'), processSnap, () => {});
    unsubs.push(unsubConfig);
  } catch {}

  // Listen to system/deleted_records
  try {
    const unsubSystem = onSnapshot(doc(db, 'system', 'deleted_records'), processSnap, () => {});
    unsubs.push(unsubSystem);
  } catch {}

  const activeId = getActiveBuildingId();
  if (activeId && activeId !== DEFAULT_BUILDING_ID) {
    try {
      const unsubSub = onSnapshot(doc(db, 'buildings', activeId, 'config', 'deleted_records'), processSnap, () => {});
      unsubs.push(unsubSub);
    } catch {}
  }

  return () => {
    unsubs.forEach(unsub => {
      try { unsub(); } catch {}
    });
  };
}

// Low-level helper to permanently delete document across all Firestore structures (root, building subcollections, etc.)
async function deleteFromAllFirestorePaths(colName: string, id: string): Promise<void> {
  const cleanId = String(id).trim();
  registerDeletedEntityId(cleanId);
  registerDeletedPaymentIds(cleanId);
  offlineSync.purgeEntityFromQueue(cleanId);

  const activeId = getActiveBuildingId();
  const deletePromises: Promise<any>[] = [];

  // Soft-delete marker first so any active cache/query immediately treats it as deleted
  const softDeletePayload = {
    isDeleted: true,
    deletedAt: new Date().toISOString()
  };

  try {
    deletePromises.push(setDoc(doc(db, colName, cleanId), softDeletePayload, { merge: true }));
  } catch {}

  // 1. Root collection document delete
  try {
    deletePromises.push(deleteDoc(doc(db, colName, cleanId)));
  } catch {}

  // 2. Active building subcollection document delete
  if (activeId) {
    try {
      deletePromises.push(deleteDoc(doc(db, 'buildings', activeId, colName, cleanId)));
    } catch {}
  }

  // 3. Default building subcollection fallback
  if (activeId !== DEFAULT_BUILDING_ID) {
    try {
      deletePromises.push(deleteDoc(doc(db, 'buildings', DEFAULT_BUILDING_ID, colName, cleanId)));
    } catch {}
  }

  // 4. Query and eliminate any orphaned documents where data.id matches cleanId
  try {
    const q1 = query(collection(db, colName), where('id', '==', cleanId));
    const snap1 = await getDocs(q1);
    snap1.forEach(d => deletePromises.push(deleteDoc(d.ref)));
  } catch {}

  if (activeId && activeId !== DEFAULT_BUILDING_ID) {
    try {
      const q2 = query(collection(db, 'buildings', activeId, colName), where('id', '==', cleanId));
      const snap2 = await getDocs(q2);
      snap2.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    } catch {}
  }

  try {
    const qDef = query(collection(db, 'buildings', DEFAULT_BUILDING_ID, colName), where('id', '==', cleanId));
    const snapDef = await getDocs(qDef);
    snapDef.forEach(d => deletePromises.push(deleteDoc(d.ref)));
  } catch {}

  await Promise.allSettled(deletePromises);
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
    const activeId = getActiveBuildingId();
    const colRef = getBuildingColRef('residents');
    const snapshot = await getDocs(colRef);
    const residents: Resident[] = [];
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as Resident;
      if (data && (data.id || (data as any).flatNumber)) {
        residents.push(data);
      }
    });

    if (activeId && activeId !== DEFAULT_BUILDING_ID) {
      try {
        const subSnap = await getDocs(collection(db, 'buildings', activeId, 'residents'));
        subSnap.forEach(docSnap => {
          if (!residents.some(r => String(r.id) === String(docSnap.id))) {
            residents.push(docSnap.data() as Resident);
          }
        });
      } catch {}
    }

    const unique = deduplicateResidents(residents);
    offlineSync.saveCachedData(cacheKey, unique);
    return unique;
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.LIST,
      path: 'residents',
      userMessage: 'فشل تحميل بيانات السكان من Firestore'
    });
    return deduplicateResidents(cached);
  }
}

export async function saveResidentToFirestore(resident: Resident): Promise<void> {
  const cleanId = String(resident.id || `res_${resident.flatNumber}_${Date.now()}`);
  const activeId = getActiveBuildingId();
  const payload: Resident = { 
    ...resident, 
    id: cleanId,
    buildingId: (resident as any).buildingId || activeId
  };

  try {
    const docRef = getBuildingDocRef('residents', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });

    if (activeId && activeId !== DEFAULT_BUILDING_ID) {
      try {
        const subDocRef = doc(db, 'buildings', activeId, 'residents', cleanId);
        await setDoc(subDocRef, sanitizeForFirestore(payload), { merge: true });
      } catch {}
    }

    // Check if there are other documents with the same flatNumber but different ID (e.g. ghost or auto-created records)
    const cacheKey = getBuildingCacheKey('residents');
    const existingList = offlineSync.getCachedData<Resident[]>(cacheKey) || [];
    existingList.forEach(existing => {
      if (existing.id && existing.id !== cleanId && isSameFlatNumber(existing.flatNumber, resident.flatNumber)) {
        // Delete redundant duplicate record from Firestore
        deleteResidentFromFirestore(existing.id).catch(() => {});
      }
    });

  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: `residents/${cleanId}`
    });
    throw error;
  }
  // Local cache update with strict deduplication
  const cacheKey = getBuildingCacheKey('residents');
  let list = offlineSync.getCachedData<Resident[]>(cacheKey) || [];
  // Remove any conflicting resident for the same flat number
  list = list.filter(r => r.id !== cleanId && !isSameFlatNumber(r.flatNumber, resident.flatNumber));
  list.push(payload);
  const finalUnique = deduplicateResidents(list);
  offlineSync.saveCachedData(cacheKey, finalUnique);
}

export async function deleteResidentFromFirestore(id: string): Promise<void> {
  const cleanId = String(id);
  try {
    await deleteFromAllFirestorePaths('residents', cleanId);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `residents/${cleanId}`
    });
    throw error;
  }
  const cacheKey = getBuildingCacheKey('residents');
  let list = offlineSync.getCachedData<Resident[]>(cacheKey) || [];
  list = list.filter(r => String(r.id) !== cleanId);
  offlineSync.saveCachedData(cacheKey, list);
  offlineSync.purgeEntityFromQueue(cleanId);
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
    const activeId = getActiveBuildingId();
    const colRef = getBuildingColRef('payments');
    const snapshot = await getDocs(colRef);
    const payments: Payment[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as Payment;
      if (data && data.id) {
        payments.push(data);
      }
    });

    // Check subcollection fallback if any data exists
    if (activeId && activeId !== DEFAULT_BUILDING_ID) {
      try {
        const subSnap = await getDocs(collection(db, 'buildings', activeId, 'payments'));
        subSnap.forEach(docSnap => {
          if (!payments.some(p => String(p.id) === String(docSnap.id))) {
            payments.push(docSnap.data() as Payment);
          }
        });
      } catch {}
    }

    restoreActivePaymentsFromDeletedSet(payments);
    const cleanPayments = filterAndDeduplicatePayments(payments);
    offlineSync.saveCachedData(cacheKey, cleanPayments);
    return cleanPayments;
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.LIST,
      path: 'payments'
    });
    return filterAndDeduplicatePayments(cached);
  }
}

export async function savePaymentToFirestore(payment: Payment): Promise<void> {
  const cleanId = String(payment.id || `pay_${Date.now()}`);
  const activeId = getActiveBuildingId();
  const payload: Payment = { 
    ...payment, 
    id: cleanId,
    amount: Number(payment.amount) || 0,
    buildingId: (payment as any).buildingId || activeId
  };

  try {
    const docRef = getBuildingDocRef('payments', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });

    // Dual-write to building subcollection if custom building exists
    if (activeId && activeId !== DEFAULT_BUILDING_ID) {
      try {
        const subDocRef = doc(db, 'buildings', activeId, 'payments', cleanId);
        await setDoc(subDocRef, sanitizeForFirestore(payload), { merge: true });
      } catch {}
    }
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: `payments/${cleanId}`
    });
    throw error;
  }

  const cacheKey = getBuildingCacheKey('payments');
  let list = offlineSync.getCachedData<Payment[]>(cacheKey) || [];
  const idx = list.findIndex(p => String(p.id) === cleanId);
  if (idx >= 0) {
    list[idx] = payload;
  } else {
    list.push(payload);
  }
  const cleanList = filterAndDeduplicatePayments(list);
  offlineSync.saveCachedData(cacheKey, cleanList);
}

export async function saveBatchPaymentsToFirestore(paymentsToSave: Payment[]): Promise<void> {
  if (!paymentsToSave || paymentsToSave.length === 0) return;
  const activeId = getActiveBuildingId();
  const cacheKey = getBuildingCacheKey('payments');
  let list = offlineSync.getCachedData<Payment[]>(cacheKey) || [];

  const preparedPayments = paymentsToSave.map(payment => {
    const cleanId = String(payment.id || `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    return {
      ...payment,
      id: cleanId,
      amount: Number(payment.amount) || 0,
      buildingId: (payment as any).buildingId || activeId
    };
  });

  // Update local cache immediately in a single batch
  preparedPayments.forEach(payload => {
    const idx = list.findIndex(p => String(p.id) === payload.id);
    if (idx >= 0) {
      list[idx] = payload;
    } else {
      list.push(payload);
    }
  });
  const cleanList = filterAndDeduplicatePayments(list);
  offlineSync.saveCachedData(cacheKey, cleanList);

  try {
    const CHUNK_SIZE = 150;
    for (let i = 0; i < preparedPayments.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = preparedPayments.slice(i, i + CHUNK_SIZE);
      chunk.forEach(payload => {
        const docRef = getBuildingDocRef('payments', payload.id);
        batch.set(docRef, sanitizeForFirestore(payload), { merge: true });
        if (activeId && activeId !== DEFAULT_BUILDING_ID) {
          try {
            const subDocRef = doc(db, 'buildings', activeId, 'payments', payload.id);
            batch.set(subDocRef, sanitizeForFirestore(payload), { merge: true });
          } catch {}
        }
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.CREATE,
      path: 'payments'
    });
    throw error;
  }
}

export async function deleteBatchPaymentsFromFirestore(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const cleanIds = ids.map(id => String(id));
  registerDeletedPaymentIds(cleanIds);
  cleanIds.forEach(id => offlineSync.purgeEntityFromQueue(id));
  recordDeletedPaymentIdsInCloud(cleanIds).catch(() => {});

  const activeId = getActiveBuildingId();
  const cacheKey = getBuildingCacheKey('payments');
  let list = offlineSync.getCachedData<Payment[]>(cacheKey) || [];
  list = list.filter(p => !cleanIds.includes(String(p.id)));
  const cleanList = filterAndDeduplicatePayments(list);
  offlineSync.saveCachedData(cacheKey, cleanList);

  try {
    const CHUNK_SIZE = 150;
    for (let i = 0; i < cleanIds.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = cleanIds.slice(i, i + CHUNK_SIZE);
      chunk.forEach(cleanId => {
        // 1. Root collection
        const docRef = getBuildingDocRef('payments', cleanId);
        batch.delete(docRef);

        // 2. Active building subcollection
        if (activeId) {
          try {
            const subDocRef = doc(db, 'buildings', activeId, 'payments', cleanId);
            batch.delete(subDocRef);
          } catch {}
        }

        // 3. Default building subcollection fallback
        if (activeId !== DEFAULT_BUILDING_ID) {
          try {
            const defDocRef = doc(db, 'buildings', DEFAULT_BUILDING_ID, 'payments', cleanId);
            batch.delete(defDocRef);
          } catch {}
        }
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: 'payments'
    });
    throw error;
  }
}

export async function executeBatchPaymentsAtomic(params: {
  toSave?: Payment[];
  toDeleteIds?: string[];
}): Promise<void> {
  const { toSave = [], toDeleteIds = [] } = params;
  if (toSave.length === 0 && toDeleteIds.length === 0) return;

  const activeId = getActiveBuildingId();
  const cacheKey = getBuildingCacheKey('payments');
  const cleanDeleteIds = toDeleteIds.map(id => String(id));

  if (cleanDeleteIds.length > 0) {
    registerDeletedPaymentIds(cleanDeleteIds);
    cleanDeleteIds.forEach(id => offlineSync.purgeEntityFromQueue(id));
  }

  const preparedPayments = toSave.map(payment => {
    const cleanId = String(payment.id || `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    return {
      ...payment,
      id: cleanId,
      amount: Number(payment.amount) || 0,
      buildingId: (payment as any).buildingId || activeId
    };
  });

  // Synchronously update local cache so the UI updates instantly
  let list = offlineSync.getCachedData<Payment[]>(cacheKey) || [];
  if (cleanDeleteIds.length > 0) {
    list = list.filter(p => !cleanDeleteIds.includes(String(p.id)));
  }
  preparedPayments.forEach(payload => {
    const idx = list.findIndex(p => String(p.id) === payload.id);
    if (idx >= 0) {
      list[idx] = payload;
    } else {
      list.push(payload);
    }
  });
  const cleanList = filterAndDeduplicatePayments(list);
  offlineSync.saveCachedData(cacheKey, cleanList);

  // Firestore Atomic writeBatch (both deletes and sets committed together)
  try {
    const CHUNK_SIZE = 250;
    // Process deletes and saves in unified chunks
    const allOperations: Array<{ type: 'delete'; id: string } | { type: 'set'; data: Payment }> = [
      ...cleanDeleteIds.map(id => ({ type: 'delete' as const, id })),
      ...preparedPayments.map(data => ({ type: 'set' as const, data }))
    ];

    for (let i = 0; i < allOperations.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = allOperations.slice(i, i + CHUNK_SIZE);
      chunk.forEach(op => {
        if (op.type === 'delete') {
          const docRef = getBuildingDocRef('payments', op.id);
          batch.delete(docRef);
          if (activeId && activeId !== DEFAULT_BUILDING_ID) {
            try {
              const subDocRef = doc(db, 'buildings', activeId, 'payments', op.id);
              batch.delete(subDocRef);
            } catch {}
          }
        } else {
          const docRef = getBuildingDocRef('payments', op.data.id);
          batch.set(docRef, sanitizeForFirestore(op.data), { merge: true });
          if (activeId && activeId !== DEFAULT_BUILDING_ID) {
            try {
              const subDocRef = doc(db, 'buildings', activeId, 'payments', op.data.id);
              batch.set(subDocRef, sanitizeForFirestore(op.data), { merge: true });
            } catch {}
          }
        }
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: 'payments'
    });
    throw error;
  }
}

export async function deletePaymentFromFirestore(id: string): Promise<void> {
  const cleanId = String(id);
  registerDeletedPaymentIds(cleanId);
  offlineSync.purgeEntityFromQueue(cleanId);
  recordDeletedPaymentIdsInCloud([cleanId]).catch(() => {});

  try {
    await deleteFromAllFirestorePaths('payments', cleanId);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `payments/${cleanId}`
    });
    throw error;
  }

  const cacheKey = getBuildingCacheKey('payments');
  let list = offlineSync.getCachedData<Payment[]>(cacheKey) || [];
  list = list.filter(p => String(p.id) !== cleanId);
  const cleanList = filterAndDeduplicatePayments(list);
  offlineSync.saveCachedData(cacheKey, cleanList);
}

// ----------------------------------------------------
// EXPENSES
// ----------------------------------------------------
export async function getExpensesFromFirestore(): Promise<Expense[]> {
  const cacheKey = getBuildingCacheKey('expenses');
  const cached = offlineSync.getCachedData<Expense[]>(cacheKey) || [];
  try {
    const activeId = getActiveBuildingId();
    const colRef = getBuildingColRef('expenses');
    const snapshot = await getDocs(colRef);
    const expenses: Expense[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as Expense;
      if (data && data.id) {
        expenses.push(data);
      }
    });

    if (activeId && activeId !== DEFAULT_BUILDING_ID) {
      try {
        const subSnap = await getDocs(collection(db, 'buildings', activeId, 'expenses'));
        subSnap.forEach(docSnap => {
          if (!expenses.some(e => String(e.id) === String(docSnap.id))) {
            expenses.push(docSnap.data() as Expense);
          }
        });
      } catch {}
    }

    offlineSync.saveCachedData(cacheKey, expenses);
    return expenses;
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
  const activeId = getActiveBuildingId();
  const payload: Expense = { 
    ...expense, 
    id: cleanId,
    amount: Number(expense.amount) || 0,
    buildingId: (expense as any).buildingId || activeId
  };

  try {
    const docRef = getBuildingDocRef('expenses', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });

    if (activeId && activeId !== DEFAULT_BUILDING_ID) {
      try {
        const subDocRef = doc(db, 'buildings', activeId, 'expenses', cleanId);
        await setDoc(subDocRef, sanitizeForFirestore(payload), { merge: true });
      } catch {}
    }
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: `expenses/${cleanId}`
    });
    throw error;
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
  const cleanId = String(id);
  try {
    await deleteFromAllFirestorePaths('expenses', cleanId);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `expenses/${cleanId}`
    });
    throw error;
  }

  const cacheKey = getBuildingCacheKey('expenses');
  let list = offlineSync.getCachedData<Expense[]>(cacheKey) || [];
  list = list.filter(e => String(e.id) !== cleanId);
  offlineSync.saveCachedData(cacheKey, list);
  offlineSync.purgeEntityFromQueue(cleanId);
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

    const activeId = getActiveBuildingId();
    if (activeId && activeId !== DEFAULT_BUILDING_ID) {
      try {
        const subSnap = await getDocs(collection(db, 'buildings', activeId, 'chat_messages'));
        subSnap.forEach(docSnap => {
          if (!messages.some(m => String(m.id) === String(docSnap.id))) {
            messages.push(docSnap.data() as ChatMessage);
          }
        });
        messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      } catch {}
    }

    offlineSync.saveCachedData(cacheKey, messages);
    return messages;
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
  const activeId = getActiveBuildingId();
  const payload: ChatMessage = { 
    ...msg, 
    id: cleanId,
    buildingId: (msg as any).buildingId || activeId
  };

  try {
    const docRef = getBuildingDocRef('chat_messages', cleanId);
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });

    if (activeId && activeId !== DEFAULT_BUILDING_ID) {
      try {
        const subDocRef = doc(db, 'buildings', activeId, 'chat_messages', cleanId);
        await setDoc(subDocRef, sanitizeForFirestore(payload), { merge: true });
      } catch {}
    }
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.CREATE,
      path: `chat_messages/${cleanId}`
    });
    throw error;
  }

  const cacheKey = getBuildingCacheKey('chat_messages');
  let list = offlineSync.getCachedData<ChatMessage[]>(cacheKey) || [];
  if (!list.some(m => m && String(m.id) === String(cleanId))) {
    list.push(payload);
    offlineSync.saveCachedData(cacheKey, list);
  }
}

export async function deleteChatMessageFromFirestore(id: string): Promise<void> {
  const cleanId = String(id);
  try {
    await deleteFromAllFirestorePaths('chat_messages', cleanId);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `chat_messages/${cleanId}`
    });
    throw error;
  }

  const cacheKey = getBuildingCacheKey('chat_messages');
  let list = offlineSync.getCachedData<ChatMessage[]>(cacheKey) || [];
  list = list.filter(m => String(m.id) !== cleanId);
  offlineSync.saveCachedData(cacheKey, list);
  offlineSync.purgeEntityFromQueue(cleanId);
}

export async function updateChatMessageInFirestore(id: string, newText: string): Promise<void> {
  const cleanId = String(id);
  const activeId = getActiveBuildingId();
  try {
    const docRef = getBuildingDocRef('chat_messages', cleanId);
    await setDoc(docRef, { text: newText, editedAt: new Date().toISOString() }, { merge: true });

    if (activeId && activeId !== DEFAULT_BUILDING_ID) {
      try {
        const subDocRef = doc(db, 'buildings', activeId, 'chat_messages', cleanId);
        await setDoc(subDocRef, { text: newText, editedAt: new Date().toISOString() }, { merge: true });
      } catch {}
    }
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.UPDATE,
      path: `chat_messages/${cleanId}`
    });
    throw error;
  }

  const cacheKey = getBuildingCacheKey('chat_messages');
  let list = offlineSync.getCachedData<ChatMessage[]>(cacheKey) || [];
  list = list.map(m => String(m.id) === cleanId ? { ...m, text: newText } : m);
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
      offlineSync.saveCachedData(cacheKey, messages);
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
    offlineSync.saveCachedData(cacheKey, complaints);
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
  const cleanId = String(id);
  try {
    await deleteFromAllFirestorePaths('public_complaints', cleanId);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `public_complaints/${cleanId}`
    });
  }
  const cacheKey = getBuildingCacheKey('public_complaints');
  let list = offlineSync.getCachedData<PublicComplaint[]>(cacheKey) || [];
  list = list.filter(c => String(c.id) !== cleanId);
  offlineSync.saveCachedData(cacheKey, list);
  offlineSync.purgeEntityFromQueue(cleanId);
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
    offlineSync.saveCachedData(cacheKey, items);
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
  const cleanId = String(id);
  try {
    await deleteFromAllFirestorePaths('maintenance', cleanId);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `maintenance/${cleanId}`
    });
  }
  const cacheKey = getBuildingCacheKey('maintenance');
  let list = offlineSync.getCachedData<MaintenanceRequest[]>(cacheKey) || [];
  list = list.filter(m => String(m.id) !== cleanId);
  offlineSync.saveCachedData(cacheKey, list);
  offlineSync.purgeEntityFromQueue(cleanId);
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
    offlineSync.saveCachedData(cacheKey, polls);
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
  const cleanId = String(id);
  try {
    await deleteFromAllFirestorePaths('polls', cleanId);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `polls/${cleanId}`
    });
  }
  const cacheKey = getBuildingCacheKey('polls');
  let list = offlineSync.getCachedData<Poll[]>(cacheKey) || [];
  list = list.filter(p => String(p.id) !== cleanId);
  offlineSync.saveCachedData(cacheKey, list);
  offlineSync.purgeEntityFromQueue(cleanId);
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
    offlineSync.saveCachedData(cacheKey, items);
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
  const cleanId = String(id);
  try {
    await deleteFromAllFirestorePaths('admin_decisions', cleanId);
  } catch (error) {
    handleFirestoreError(error, {
      operation: OperationType.DELETE,
      path: `admin_decisions/${cleanId}`
    });
  }
  const cacheKey = getBuildingCacheKey('admin_decisions');
  let list = offlineSync.getCachedData<AdminDecision[]>(cacheKey) || [];
  list = list.filter(d => String(d.id) !== cleanId);
  offlineSync.saveCachedData(cacheKey, list);
  offlineSync.purgeEntityFromQueue(cleanId);
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
    offlineSync.saveCachedData(cacheKey, events);
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
  const cleanId = String(id);
  try {
    await deleteFromAllFirestorePaths('events', cleanId);
  } catch (error) {
    handleFirestoreError(error, { operation: OperationType.DELETE, path: `events/${cleanId}` });
  }
  const cacheKey = getBuildingCacheKey('events');
  let list = offlineSync.getCachedData<BuildingEvent[]>(cacheKey) || [];
  list = list.filter(e => String(e.id) !== cleanId);
  offlineSync.saveCachedData(cacheKey, list);
  offlineSync.purgeEntityFromQueue(cleanId);
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
    offlineSync.saveCachedData(cacheKey, craftsmen);
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
  const cleanId = String(id);
  try {
    await deleteFromAllFirestorePaths('craftsmen', cleanId);
  } catch (error) {
    handleFirestoreError(error, { operation: OperationType.DELETE, path: `craftsmen/${cleanId}` });
  }
  const cacheKey = getBuildingCacheKey('craftsmen');
  let list = offlineSync.getCachedData<Craftsman[]>(cacheKey) || [];
  list = list.filter(c => String(c.id) !== cleanId);
  offlineSync.saveCachedData(cacheKey, list);
  offlineSync.purgeEntityFromQueue(cleanId);
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
    const rootItemsMap = new Map<string, T>();
    const subItemsMap = new Map<string, T>();
    let debounceTimer: any = null;

    const emitMerged = () => {
      const mergedMap = new Map<string, T>();
      const deletedSet = getDeletedEntityIds();

      rootItemsMap.forEach((val, key) => {
        const isCancelled = (val as any)?.status === 'cancelled' || (val as any)?.status === 'لاغي' || (val as any)?.status === 'VOID' || (val as any)?.status === 'ملغي' || (val as any)?.status === 'مرفوض';
        if (isCancelled || (!deletedSet.has(key) && !(val as any)?.isDeleted && (val as any)?.status !== 'deleted')) {
          mergedMap.set(key, val);
        }
      });

      subItemsMap.forEach((val, key) => {
        const isCancelled = (val as any)?.status === 'cancelled' || (val as any)?.status === 'لاغي' || (val as any)?.status === 'VOID' || (val as any)?.status === 'ملغي' || (val as any)?.status === 'مرفوض';
        if (isCancelled || (!deletedSet.has(key) && !(val as any)?.isDeleted && (val as any)?.status !== 'deleted')) {
          mergedMap.set(key, val);
        }
      });

      let items = Array.from(mergedMap.values());
      if (sortFn) {
        items.sort(sortFn);
      }
      onUpdate(items);
    };

    const scheduleEmitMerged = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        emitMerged();
      }, 35);
    };

    const handleSnapshotChanges = (snapshot: any, targetMap: Map<string, T>) => {
      // 1. Process removed documents instantly
      if (typeof snapshot.docChanges === 'function') {
        snapshot.docChanges().forEach((change: any) => {
          if (change.type === 'removed') {
            const docId = String(change.doc.id).trim();
            const dataId = String((change.doc.data() as any)?.id || '').trim();
            const changeStatus = (change.doc.data() as any)?.status;
            const isCancelled = changeStatus === 'cancelled' || changeStatus === 'لاغي' || changeStatus === 'VOID' || changeStatus === 'ملغي';
            if (!isCancelled) {
              registerDeletedEntityId(docId);
              registerDeletedPaymentIds(docId);
              if (dataId) {
                registerDeletedEntityId(dataId);
                registerDeletedPaymentIds(dataId);
              }
            }
            rootItemsMap.delete(docId);
            if (dataId) rootItemsMap.delete(dataId);
            subItemsMap.delete(docId);
            if (dataId) subItemsMap.delete(dataId);
          }
        });
      }

      // 2. Re-populate current collection map with strict deleted filtering
      targetMap.clear();
      const currentDeleted = getDeletedEntityIds();

      snapshot.forEach((docSnap: any) => {
        const data = docSnap.data() as T;
        const docId = String(docSnap.id).trim();
        const id = String((data as any)?.id || docSnap.id).trim();

        const isCancelled = (data as any)?.status === 'cancelled' || (data as any)?.status === 'لاغي' || (data as any)?.status === 'VOID' || (data as any)?.status === 'ملغي' || (data as any)?.status === 'مرفوض';

        if (!isCancelled) {
          if (currentDeleted.has(id) || currentDeleted.has(docId)) {
            return;
          }
          if ((data as any)?.isDeleted === true || (data as any)?.status === 'deleted') {
            return;
          }
        }
        targetMap.set(id, data);
      });
      scheduleEmitMerged();
    };

    const colRef = getBuildingColRef(collectionName);
    const unsubRoot = onSnapshot(colRef, (snapshot) => {
      handleSnapshotChanges(snapshot, rootItemsMap);
    }, (error) => {
      console.warn(`[Firestore root listener notice for ${collectionName}]:`, error.message);
    });

    let unsubSub = () => {};
    const activeId = getActiveBuildingId();
    if (activeId && activeId !== DEFAULT_BUILDING_ID) {
      try {
        const subColRef = collection(db, 'buildings', activeId, collectionName);
        unsubSub = onSnapshot(subColRef, (snapshot) => {
          handleSnapshotChanges(snapshot, subItemsMap);
        }, (error) => {
          console.warn(`[Firestore subcollection listener notice for ${collectionName}]:`, error.message);
        });
      } catch {}
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubRoot();
      unsubSub();
    };
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

/**
 * Radical Data Sync Solution:
 * Purges local offline caches for active building and re-syncs all collections live from Firestore.
 */
export async function purgeAndSyncAllDataFromCloud(): Promise<any> {
  const activeId = getActiveBuildingId();
  const keys = ['residents', 'payments', 'expenses', 'rules', 'craftsmen', 'chat_messages', 'decisions', 'polls', 'public_complaints', 'maintenance', 'events', 'config', 'building_layout'];
  
  keys.forEach(k => {
    try {
      localStorage.removeItem(`cache_${activeId}_${k}`);
      localStorage.removeItem(`cache_${k}`);
    } catch {}
  });

  return getAllDataFromFirestore();
}

