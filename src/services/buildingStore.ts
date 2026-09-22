import { Building, AppConfig } from '../types';
import { db } from './firebaseConfig';
import { collection, doc, getDocs, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { registerAdmin } from './authStore';

export const DEFAULT_BUILDING_ID = 'union_main_01';

export const DEFAULT_BUILDING: Building = {
  id: DEFAULT_BUILDING_ID,
  code: 'UN-01',
  name: 'العمارة',
  address: '',
  presidentName: '',
  presidentEmail: '',
  presidentPhone: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  status: 'ACTIVE',
  googleDriveBackupEmail: '',
  plan: 'COMMERCIAL_PRO'
};

const LOCAL_BUILDINGS_KEY = 'commercial_buildings_v1';
const ACTIVE_BUILDING_KEY = 'active_building_v1';

/**
 * Completely clear all temporary/cached app data for a pristine fresh launch
 */
export function clearAllAppData(): void {
  try {
    const preserveKeys: string[] = [];
    Object.keys(localStorage).forEach((key) => {
      if (!preserveKeys.includes(key)) {
        localStorage.removeItem(key);
      }
    });
    sessionStorage.clear();
  } catch (e) {
    console.error('Failed to clear app data:', e);
  }
}

// Get active building from local storage
export function getActiveBuilding(): Building {
  try {
    const raw = localStorage.getItem(ACTIVE_BUILDING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id) return parsed;
    }
  } catch (e) {
    console.warn('Error reading active building:', e);
  }
  return DEFAULT_BUILDING;
}

// Set active building
export function setActiveBuilding(building: Building): void {
  try {
    localStorage.setItem(ACTIVE_BUILDING_KEY, JSON.stringify(building));
    localStorage.setItem('active_building_id', building.id);
    localStorage.setItem('active_building_name', building.name);
    localStorage.setItem('active_building_code', building.code);
    localStorage.setItem('active_president_name', building.presidentName);
    localStorage.setItem('active_president_email', building.presidentEmail);
    window.dispatchEvent(new CustomEvent('building-changed', { detail: building }));
  } catch (e) {
    console.error('Failed to set active building:', e);
  }
}

// Get all buildings from local storage immediately (0ms latency)
export function getLocalBuildings(): Building[] {
  const localList: Building[] = [];
  try {
    const cached = localStorage.getItem(LOCAL_BUILDINGS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        parsed.forEach(b => {
          // Filter out dummy/placeholder buildings from old versions
          if (b && b.id && b.id !== 'union_main_01' && b.name && !localList.some(item => item.id === b.id)) {
            localList.push(b);
          }
        });
      }
    }
  } catch (e) {
    console.warn('Error reading local buildings:', e);
  }
  return localList;
}

// Fetch all registered buildings (Instant Local + Fast Background Firestore sync)
export async function getAllBuildings(): Promise<Building[]> {
  const localList = getLocalBuildings();

  // Fast background query to Firestore with timeout so UI is never blocked
  try {
    const fetchPromise = async () => {
      const colRef = collection(db, 'buildings');
      const snapshot = await getDocs(colRef);
      const firestoreList: Building[] = [];
      snapshot.forEach(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Building;
          if (data && data.id && data.id !== 'union_main_01' && data.name) {
            firestoreList.push(data);
          }
        }
      });
      return firestoreList;
    };

    const timeoutPromise = new Promise<Building[]>((_, reject) => 
      setTimeout(() => reject(new Error('Firestore timeout')), 1200)
    );

    const firestoreList = await Promise.race([fetchPromise(), timeoutPromise]);

    if (firestoreList && firestoreList.length > 0) {
      firestoreList.forEach(fb => {
        const idx = localList.findIndex(item => item.id === fb.id);
        if (idx >= 0) {
          localList[idx] = fb;
        } else {
          localList.push(fb);
        }
      });
      localStorage.setItem(LOCAL_BUILDINGS_KEY, JSON.stringify(localList));
    }
  } catch {
    // Return instant local cache on timeout or offline
  }

  return localList;
}

// Register a new commercial building & union (Instant execution)
export async function registerNewUnionBuilding(params: {
  buildingName: string;
  buildingAddress?: string;
  presidentName: string;
  presidentEmail: string;
  presidentPhone?: string;
  adminPassword: string;
}): Promise<{ building: Building; userSession: any }> {
  const cleanEmail = params.presidentEmail.trim().toLowerCase();
  const cleanName = params.buildingName.trim();
  const cleanPresName = params.presidentName.trim();
  const cleanAddress = params.buildingAddress?.trim() || '';
  const cleanPhone = params.presidentPhone?.trim() || '';

  // Generate unique ID and short shareable code (e.g. B-8291)
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const code = `B-${randomSuffix}`;
  const rawId = `bld_${Date.now()}_${randomSuffix}`;

  const newBuilding: Building = {
    id: rawId,
    code,
    name: cleanName,
    address: cleanAddress,
    presidentName: cleanPresName,
    presidentEmail: cleanEmail,
    presidentPhone: cleanPhone,
    createdAt: new Date().toISOString(),
    status: 'ACTIVE',
    googleDriveBackupEmail: cleanEmail,
    plan: 'COMMERCIAL_PRO',
  };

  // 1. Instantly save building locally (0ms)
  const all = getLocalBuildings();
  all.push(newBuilding);
  localStorage.setItem(LOCAL_BUILDINGS_KEY, JSON.stringify(all));

  // 2. Instantly register admin account for president
  try {
    await registerAdmin({
      name: cleanPresName,
      email: cleanEmail,
      phone: cleanPhone,
      password: params.adminPassword,
      securityKey: 'ADMIN_SUPER_KEY',
    });
  } catch (adminErr) {
    console.warn('Notice registering admin:', adminErr);
  }

  // 3. Instantly set as active building
  setActiveBuilding(newBuilding);

  // 4. Construct user session
  const userSession = {
    email: cleanEmail,
    displayName: cleanPresName,
    name: cleanPresName,
    uid: cleanEmail,
    role: 'ADMIN',
    buildingId: newBuilding.id,
    buildingName: newBuilding.name,
    buildingCode: newBuilding.code,
  };

  localStorage.setItem('custom_user_session', JSON.stringify(userSession));

  // 5. Asynchronous background sync to Firebase Firestore (non-blocking)
  (async () => {
    try {
      const bDocRef = doc(db, 'buildings', newBuilding.id);
      await setDoc(bDocRef, newBuilding, { merge: true });

      const initialConfig: AppConfig = {
        buildingId: newBuilding.id,
        buildingName: newBuilding.name,
        buildingAddress: newBuilding.address,
        buildingCode: newBuilding.code,
        presidentName: newBuilding.presidentName,
        presidentEmail: newBuilding.presidentEmail,
        presidentPhone: newBuilding.presidentPhone,
        expenseTypes: ['صيانة مصاعد', 'نظافة وخدمات', 'كهرباء خدمات', 'حراسة وأمن', 'صيانة سباكة ومياه', 'نثريات وطوارئ'],
        paymentTypes: ['اشتراك شهري', 'مساهمة صيانة', 'وديعة تجديد', 'أخرى'],
        activityTypes: ['سكني', 'سكني مغلق', 'مفروش', 'إداري', 'تجاري'],
        admins: [cleanEmail],
        managers: [],
        defaultMonthlyFee: 400,
        activityDefaultFees: { 'سكني': 400, 'سكني مغلق': 200, 'مفروش': 600, 'إداري': 800, 'تجاري': 500 },
        accountingStartDate: new Date().toISOString().split('T')[0],
      };

      const configRef = doc(db, 'buildings', newBuilding.id, 'config', 'app_config');
      await setDoc(configRef, initialConfig, { merge: true });
    } catch (fsErr) {
      console.warn('Background Firestore sync completed with notice:', fsErr);
    }
  })();

  return { building: newBuilding, userSession };
}

// Find building by code or email
export async function findBuilding(queryStr: string): Promise<Building | null> {
  const clean = queryStr.trim().toLowerCase();
  const list = await getAllBuildings();
  return list.find(b => 
    b.code.toLowerCase() === clean || 
    b.id.toLowerCase() === clean || 
    b.presidentEmail.toLowerCase() === clean ||
    b.name.toLowerCase().includes(clean)
  ) || null;
}

// Permanently delete a single building from Local Storage and Firestore
export async function deleteBuilding(buildingId: string): Promise<void> {
  // 1. Remove from local storage
  const current = getLocalBuildings().filter(b => b.id !== buildingId);
  localStorage.setItem(LOCAL_BUILDINGS_KEY, JSON.stringify(current));
  
  const active = getActiveBuilding();
  if (active.id === buildingId) {
    localStorage.removeItem(ACTIVE_BUILDING_KEY);
    localStorage.removeItem('active_building_id');
    localStorage.removeItem('active_building_name');
    localStorage.removeItem('active_building_code');
    localStorage.removeItem('active_president_name');
    localStorage.removeItem('active_president_email');
  }

  // 2. Delete from Firebase Firestore
  try {
    const docRef = doc(db, 'buildings', buildingId);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn('Notice deleting building from Firestore:', e);
  }
}

// Permanently delete all registered buildings and reset everything
export async function deleteAllBuildings(): Promise<void> {
  // 1. Clear local storage completely
  localStorage.removeItem(LOCAL_BUILDINGS_KEY);
  localStorage.removeItem(ACTIVE_BUILDING_KEY);
  localStorage.removeItem('active_building_id');
  localStorage.removeItem('active_building_name');
  localStorage.removeItem('active_building_code');
  localStorage.removeItem('active_president_name');
  localStorage.removeItem('active_president_email');
  localStorage.removeItem('custom_admins');
  localStorage.removeItem('custom_join_requests');
  localStorage.removeItem('custom_user_session');

  // 2. Delete all buildings from Firestore collection
  try {
    const colRef = collection(db, 'buildings');
    const snapshot = await getDocs(colRef);
    const deleteOps = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
    await Promise.all(deleteOps);
  } catch (e) {
    console.warn('Notice deleting all buildings from Firestore:', e);
  }
}

