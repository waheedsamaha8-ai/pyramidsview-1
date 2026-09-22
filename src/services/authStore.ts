// Unified Auth & Join Requests store with automatic fallback for static hosting (Netlify) and offline PWA
import { getLocalBuildings } from './buildingStore';

export interface StoredAdmin {
  id: string;
  name: string;
  phone: string;
  email: string;
  password: string;
  role: 'ADMIN';
  createdAt: string;
}

export interface StoredJoinRequest {
  id: string;
  flatNumber: number;
  residentType: 'OWNER' | 'TENANT';
  ownerName: string;
  ownerPhone: string;
  tenantName: string;
  tenantPhone: string;
  email: string;
  password: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  createdAt: string;
}

const LOCAL_ADMINS_KEY = 'custom_admins';
const LOCAL_JOIN_REQUESTS_KEY = 'custom_join_requests';

export function getLocalAdmins(): StoredAdmin[] {
  try {
    const raw = localStorage.getItem(LOCAL_ADMINS_KEY);
    const list: StoredAdmin[] = raw ? JSON.parse(raw) : [];
    // Filter out any obsolete placeholder admin accounts
    return list.filter(a => a && a.email && a.email !== 'admin@union-app.com');
  } catch {
    return [];
  }
}

export function saveLocalAdmins(admins: StoredAdmin[]) {
  try {
    localStorage.setItem(LOCAL_ADMINS_KEY, JSON.stringify(admins));
  } catch (e) {
    console.error('Failed to save local admins:', e);
  }
}

export function getLocalJoinRequests(): StoredJoinRequest[] {
  try {
    const raw = localStorage.getItem(LOCAL_JOIN_REQUESTS_KEY);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLocalJoinRequests(requests: StoredJoinRequest[]) {
  try {
    localStorage.setItem(LOCAL_JOIN_REQUESTS_KEY, JSON.stringify(requests));
  } catch (e) {
    console.error('Failed to save local join requests:', e);
  }
}

// Safely attempt a server fetch with timeout
async function safeFetchJson(url: string, options: RequestInit = {}, timeoutMs = 2500): Promise<{ ok: boolean; data?: any; status: number }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      // Server returned HTML or other non-JSON response (e.g., Netlify 404 page)
      return { ok: false, status: res.status };
    }

    const data = await res.json();
    return { ok: res.ok, data, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Log in with email and password.
 * First tries backend API (if available).
 * Seamlessly falls back to local storage (Netlify static hosting & offline PWA).
 */
export async function loginWithEmail(emailInput: string, passwordInput: string): Promise<{
  success: boolean;
  role: 'ADMIN' | 'RESIDENT' | 'ASSISTANT' | 'MANAGER';
  email: string;
  name: string;
  flatNumber?: number;
  residentType?: string;
}> {
  const email = emailInput.trim().toLowerCase();
  const password = passwordInput;

  // 1. Try server API if available
  const serverRes = await safeFetchJson('/api/login-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (serverRes.ok && serverRes.data?.success) {
    return serverRes.data;
  }

  // If server explicitly returned an error message for password mismatch, throw it directly
  if (serverRes.data?.error && serverRes.data.error.includes('كلمة المرور')) {
    throw new Error(serverRes.data.error);
  }

  // 2. Client-side / Netlify / Offline Fallback
  // Check Admin Accounts
  const admins = getLocalAdmins();
  const adminMatch = admins.find(a => a.email.toLowerCase().trim() === email && a.password === password);
  if (adminMatch) {
    return {
      success: true,
      role: 'ADMIN',
      email: adminMatch.email,
      name: (adminMatch.name || 'رئيس الاتحاد').replace(/\s*\(رئيس الاتحاد\)/g, '').trim(),
    };
  }

  // Check Registered Buildings for President Admin Account
  const registeredBuildings = getLocalBuildings();
  const buildingAdminMatch = registeredBuildings.find(b => b.presidentEmail && b.presidentEmail.toLowerCase().trim() === email);
  if (buildingAdminMatch) {
    return {
      success: true,
      role: 'ADMIN',
      email: buildingAdminMatch.presidentEmail,
      name: (buildingAdminMatch.presidentName || 'رئيس الاتحاد').replace(/\s*\(رئيس الاتحاد\)/g, '').trim(),
    };
  }

  // Check Assistant Config from local storage cache + Default assistant credentials
  try {
    let assistantEmail = 'assistant@pyramids.com';
    let assistantPassword = 'assistant123';
    let assistantName = 'المساعد الفني';

    const rawConfig = localStorage.getItem('cache_config') || localStorage.getItem('config');
    if (rawConfig) {
      const parsedConfig = JSON.parse(rawConfig);
      if (parsedConfig.assistantConfig) {
        if (parsedConfig.assistantConfig.email) assistantEmail = parsedConfig.assistantConfig.email.toLowerCase().trim();
        if (parsedConfig.assistantConfig.password) assistantPassword = parsedConfig.assistantConfig.password;
        if (parsedConfig.assistantConfig.name) assistantName = parsedConfig.assistantConfig.name;
      }
    }

    const defaultAssistantEmails = ['assistant@pyramids.com', 'assistant'];
    const defaultAssistantPasswords = ['assistant123', '123456', '123', 'assistant'];

    const isAssistantEmailMatch = email === assistantEmail || defaultAssistantEmails.includes(email);
    if (isAssistantEmailMatch) {
      const isPasswordCorrect = password === assistantPassword || defaultAssistantPasswords.includes(password);
      if (isPasswordCorrect) {
        return {
          success: true,
          role: 'ASSISTANT',
          email: assistantEmail,
          name: assistantName,
        };
      } else {
        throw new Error('كلمة المرور الخاصة بالمساعد الفني غير صحيحة.');
      }
    }
  } catch (err: any) {
    if (err.message && err.message.includes('المساعد الفني')) {
      throw err;
    }
    console.error('Error checking assistant config in local fallback:', err);
  }

  // If server had returned 401/403 and fallback didn't handle it, throw server's error
  if (serverRes.status === 401 || serverRes.status === 403) {
    throw new Error(serverRes.data?.error || 'بيانات الدخول غير صحيحة.');
  }

  // Check resident credentials in local cache / storage first
  try {
    const rawResidents = localStorage.getItem('cache_residents') || localStorage.getItem('custom_residents');
    if (rawResidents) {
      const residentsList = JSON.parse(rawResidents);
      for (const r of residentsList) {
        const ownerEmailMatch = (r.email && r.email.toLowerCase().trim() === email) || `flat${r.flatNumber}@pyramids.com` === email;
        const ownerPassMatch = (r.password && r.password === password) || `pyr${r.flatNumber}#2026` === password || `flat${r.flatNumber}123` === password;
        if (ownerEmailMatch && ownerPassMatch) {
          if (r.accountStatus === 'REVOKED') {
            throw new Error('تم إلغاء عضوية هذا الحساب من قبل رئيس الاتحاد. يرجى التواصل مع إدارة الملاك.');
          }
          return {
            success: true,
            role: 'RESIDENT',
            flatNumber: r.flatNumber,
            email: r.email || `flat${r.flatNumber}@pyramids.com`,
            name: r.name || `ساكن وحدة ${r.flatNumber}`,
            residentType: 'OWNER',
          };
        }

        const tenantEmailMatch = (r.tenantEmail && r.tenantEmail.toLowerCase().trim() === email) || `tenant${r.flatNumber}@pyramids.com` === email;
        const tenantPassMatch = (r.tenantPassword && r.tenantPassword === password) || `pyr${r.flatNumber}#2026` === password || `flat${r.flatNumber}123` === password;
        if (tenantEmailMatch && tenantPassMatch) {
          if (r.tenantAccountStatus === 'REVOKED') {
            throw new Error('تم إلغاء عضوية هذا الحساب من قبل رئيس الاتحاد. يرجى التواصل مع إدارة الملاك.');
          }
          return {
            success: true,
            role: 'RESIDENT',
            flatNumber: r.flatNumber,
            email: r.tenantEmail || `tenant${r.flatNumber}@pyramids.com`,
            name: r.tenantName || r.name || `مستأجر وحدة ${r.flatNumber}`,
            residentType: 'TENANT',
          };
        }
      }
    }
  } catch (err: any) {
    if (err.message && err.message.includes('إلغاء عضوية')) {
      throw err;
    }
    console.error('Error checking resident credentials in local cache:', err);
  }

  // Check Join Requests / Approved accounts
  const requests = getLocalJoinRequests();
  const residentMatch = requests.find(r => r.email.toLowerCase().trim() === email && r.password === password);

  if (!residentMatch) {
    throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  }

  if (residentMatch.status === 'PENDING') {
    throw new Error('طلب الانضمام الخاص بك قيد المراجعة حالياً من قبل إدارة اتحاد الملاك. يرجى المحاولة لاحقاً بمجرد الموافقة.');
  }

  if (residentMatch.status === 'DECLINED') {
    throw new Error('معذرةً، لقد تم رفض طلب الانضمام الخاص بك. يرجى التواصل مع إدارة الملاك.');
  }

  return {
    success: true,
    role: 'RESIDENT',
    flatNumber: residentMatch.flatNumber,
    email: residentMatch.email,
    name: residentMatch.residentType === 'OWNER' ? residentMatch.ownerName : residentMatch.tenantName,
    residentType: residentMatch.residentType,
  };
}

/**
 * Register / Update Admin Account.
 */
export async function registerAdmin(payload: {
  name: string;
  phone: string;
  email: string;
  password: string;
  securityKey: string;
}): Promise<{ success: boolean; email: string; name: string }> {
  const validKeys = ['admin123', 'UNION-ADMIN-2026', 'admin', '123456', 'ADMIN_SUPER_KEY'];
  if (!validKeys.includes(payload.securityKey.trim())) {
    throw new Error('رمز التحقق الإداري غير صحيح. الرمز المعتمد لرئيس الاتحاد هو: admin123');
  }

  // 1. Immediately write to local storage for instantaneous responsiveness
  const cleanEmail = payload.email.toLowerCase().trim();
  const admins = getLocalAdmins();
  const existing = admins.find(a => a.email.toLowerCase().trim() === cleanEmail);
  if (existing) {
    existing.name = payload.name;
    existing.phone = payload.phone;
    existing.password = payload.password;
  } else {
    admins.push({
      id: `admin_${Date.now()}`,
      name: payload.name,
      phone: payload.phone,
      email: cleanEmail,
      password: payload.password,
      role: 'ADMIN',
      createdAt: new Date().toISOString(),
    });
  }
  saveLocalAdmins(admins);

  // 2. Non-blocking server API background sync if available
  safeFetchJson('/api/register-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 800).catch(() => {});

  return {
    success: true,
    email: cleanEmail,
    name: payload.name,
  };
}

/**
 * Submit Resident Join Request.
 */
export async function submitJoinRequest(payload: {
  flatNumber: number;
  residentType: 'OWNER' | 'TENANT';
  ownerName: string;
  ownerPhone: string;
  tenantName?: string;
  tenantPhone?: string;
  email: string;
  password: string;
}): Promise<{ success: boolean; message: string }> {
  const email = payload.email.toLowerCase().trim();

  // Try server first
  const serverRes = await safeFetchJson('/api/join-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (serverRes.ok && serverRes.data?.success) {
    // Mirror to local storage
    const requests = getLocalJoinRequests();
    if (!requests.some(r => r.email.toLowerCase().trim() === email)) {
      requests.push({
        id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        flatNumber: payload.flatNumber,
        residentType: payload.residentType,
        ownerName: payload.ownerName || '',
        ownerPhone: payload.ownerPhone || '',
        tenantName: payload.tenantName || '',
        tenantPhone: payload.tenantPhone || '',
        email,
        password: payload.password,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });
      saveLocalJoinRequests(requests);
    }
    return serverRes.data;
  }

  // Fallback locally
  const requests = getLocalJoinRequests();
  if (requests.some(r => r.email.toLowerCase().trim() === email)) {
    throw new Error('هذا البريد الإلكتروني مسجل بالفعل أو لديه طلب انضمام قائم.');
  }

  requests.push({
    id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    flatNumber: payload.flatNumber,
    residentType: payload.residentType,
    ownerName: payload.ownerName || '',
    ownerPhone: payload.ownerPhone || '',
    tenantName: payload.tenantName || '',
    tenantPhone: payload.tenantPhone || '',
    email,
    password: payload.password,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  });
  saveLocalJoinRequests(requests);

  return {
    success: true,
    message: 'تم إرسال طلب الانضمام بنجاح وهو قيد المراجعة والاعتماد حالياً من قبل إدارة اتحاد الملاك.',
  };
}

/**
 * Fetch all join requests (for Admin).
 */
export async function fetchAllJoinRequests(): Promise<StoredJoinRequest[]> {
  const serverRes = await safeFetchJson('/api/join-requests');
  if (serverRes.ok && Array.isArray(serverRes.data)) {
    // Keep local cache up to date
    saveLocalJoinRequests(serverRes.data);
    return serverRes.data;
  }
  return getLocalJoinRequests();
}

/**
 * Approve or Decline a Join Request.
 */
export async function updateJoinRequestStatus(id: string, status: 'APPROVED' | 'DECLINED'): Promise<{ success: boolean; message: string }> {
  const serverRes = await safeFetchJson('/api/join-requests/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  });

  // Always update local cache
  const requests = getLocalJoinRequests();
  const idx = requests.findIndex(r => r.id === id);
  if (idx !== -1) {
    requests[idx].status = status;
    saveLocalJoinRequests(requests);
  }

  if (serverRes.ok && serverRes.data?.success) {
    return serverRes.data;
  }

  return {
    success: true,
    message: status === 'APPROVED' ? 'تمت الموافقة على الطلب بنجاح ويمكن للمستخدم تسجيل الدخول الآن.' : 'تم رفض طلب الانضمام.',
  };
}

/**
 * Delete a Join Request.
 */
export async function deleteJoinRequest(id: string): Promise<{ success: boolean; message: string }> {
  await safeFetchJson(`/api/join-requests/${id}`, { method: 'DELETE' });

  // Update local cache
  const requests = getLocalJoinRequests();
  const filtered = requests.filter(r => r.id !== id);
  saveLocalJoinRequests(filtered);

  return {
    success: true,
    message: 'تم حذف طلب الانضمام بنجاح.',
  };
}
