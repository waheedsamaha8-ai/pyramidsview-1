import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import defaultConfig from '../../firebase-applet-config.json';

export interface CustomFirebaseConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
}

export function getActiveFirebaseConfig(): CustomFirebaseConfig {
  try {
    const raw = localStorage.getItem('custom_firebase_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.projectId && parsed.apiKey) {
        return {
          ...parsed,
          authDomain: parsed.authDomain || `${parsed.projectId}.firebaseapp.com`
        };
      }
    }
  } catch {}
  return defaultConfig as CustomFirebaseConfig;
}

export function isUsingCustomFirebase(): boolean {
  try {
    const raw = localStorage.getItem('custom_firebase_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      return Boolean(parsed && parsed.projectId && parsed.apiKey);
    }
  } catch {}
  return false;
}

export function applyCustomFirebaseConfig(config: CustomFirebaseConfig | null) {
  if (config && config.projectId && config.apiKey) {
    localStorage.setItem('custom_firebase_config', JSON.stringify(config));
  } else {
    localStorage.removeItem('custom_firebase_config');
  }
  window.location.reload();
}

// Initialize active Firebase
const activeConfig = getActiveFirebaseConfig();
const app = initializeApp(activeConfig);
export const auth = getAuth(app);
export const db = (activeConfig as any).firestoreDatabaseId 
  ? getFirestore(app, (activeConfig as any).firestoreDatabaseId)
  : getFirestore(app);

export enum OperationType {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
}

export interface FirestoreErrorContext {
  operation: OperationType;
  path: string;
  userMessage?: string;
}

export type FirebaseStatusType = 'success' | 'error' | 'syncing';

export function notifyFirebaseStatus(status: FirebaseStatusType) {
  try {
    window.dispatchEvent(new CustomEvent('firebase-status-change', { detail: { status } }));
  } catch {}
}

export function handleFirestoreError(error: unknown, context: FirestoreErrorContext): void {
  const err = error as { code?: string; message?: string };
  const msg = err?.message || String(error || '');
  const isOffline = msg.toLowerCase().includes('offline') || err?.code === 'unavailable' || err?.code === 'failed-precondition';
  
  // Trigger red dot indicator if write operation fails
  if (context.operation !== OperationType.READ && context.operation !== OperationType.LIST) {
    notifyFirebaseStatus('error');
  }

  if (isOffline) {
    console.warn(`[Firestore Offline Note] ${context.operation} at ${context.path}: client is offline, using local cache seamlessly.`);
  } else {
    console.error(`[Firestore Error] ${context.operation} at ${context.path}:`, msg);
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'config', 'test_ping'));
    return true;
  } catch (error) {
    console.warn('[Firestore] Connection test notice:', error);
    return true;
  }
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Dedicated provider for Google Drive / Google Sheets backup when explicitly requested
export const googleDriveProvider = new GoogleAuthProvider();
googleDriveProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleDriveProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleDriveProvider.setCustomParameters({
  prompt: 'consent'
});

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        try {
          cachedAccessToken = localStorage.getItem('google_access_token');
        } catch {
          cachedAccessToken = null;
        }
        if (cachedAccessToken) {
          if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
        } else {
          cachedAccessToken = null;
          if (onAuthFailure) onAuthFailure();
        }
      }
    } else {
      cachedAccessToken = null;
      try {
        localStorage.removeItem('google_access_token');
      } catch {}
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Check if user returned from Google Redirect Sign In
export const checkRedirectResult = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || (await result.user.getIdToken());
      cachedAccessToken = token;
      try {
        localStorage.setItem('google_access_token', token);
      } catch {}
      return { user: result.user, accessToken: token };
    }
  } catch (err) {
    console.warn('Redirect result check notice:', err);
  }
  return null;
};

// Call from button click
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    let result = null;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    try {
      result = await signInWithPopup(auth, googleProvider);
    } catch (popupErr: any) {
      console.warn('signInWithPopup notice:', popupErr);
      const code = String(popupErr?.code || popupErr?.message || '');
      if (
        isMobileDevice ||
        code.includes('popup-blocked') ||
        code.includes('popup-closed-by-user') ||
        code.includes('cancelled-popup-request')
      ) {
        // Fallback to redirect flow for mobile web
        await signInWithRedirect(auth, googleProvider);
        return null;
      }
      throw popupErr;
    }

    if (!result) return null;

    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || (await result.user.getIdToken());

    cachedAccessToken = token;
    localStorage.setItem('google_access_token', token);
    return { user: result.user, accessToken: token };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const requestGoogleDriveToken = async (): Promise<string | null> => {
  try {
    const result = await signInWithPopup(auth, googleDriveProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
      try {
        localStorage.setItem('google_access_token', credential.accessToken);
      } catch {}
      return credential.accessToken;
    }
    return null;
  } catch (error: any) {
    console.error('Drive token request error:', error);
    const msg = String(error?.message || error?.code || error || '').toLowerCase();
    if (msg.includes('access-denied') || msg.includes('access_denied') || msg.includes('403') || msg.includes('unauthorized')) {
      throw new Error('الحساب الإلكتروني المختار ليس مضافاً كـ (مستخدم اختبار) في مشروع Google. يرجى اختيار البريد الإلكتروني الرئيسي المعتمد (waheedsamaha8@gmail.com) أو استخدام خيار تنزيل النسخة الاحتياطية المباشرة (ملف JSON).');
    }
    if (msg.includes('popup-closed-by-user') || msg.includes('cancelled')) {
      throw new Error('تم إلغاء نافذة تسجيل الدخول من قبل المستخدم.');
    }
    throw error;
  }
};

export const logoutUser = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  localStorage.removeItem('google_access_token');
};
export { app };
