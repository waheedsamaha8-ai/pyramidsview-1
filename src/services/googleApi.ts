import { 
  Resident, 
  Payment, 
  Expense, 
  BuildingRules, 
  AppConfig, 
  AdminResidentProfile,
  Craftsman, 
  CraftsmanComment,
  ChatMessage,
  AdminDecision,
  Poll,
  PublicComplaint,
  MaintenanceRequest,
  BuildingEvent,
  JoinRequest
} from '../types';
import { fetchAllJoinRequests } from './authStore';
import { formatMobileNumber } from '../utils/phoneUtils';
import { isSameFlatNumber } from '../utils/buildingStructure';

function formatPhoneForSheet(phone: string | number | null | undefined): string {
  const formatted = formatMobileNumber(phone);
  if (!formatted) return '';
  if (formatted.startsWith('+')) {
    return `'${formatted}`;
  }
  return formatted;
}

let currentAccessToken: string | null = null;
let spreadsheetId: string | null = null;
let sheetIds: { [title: string]: number } = {};

export interface DriveFoldersMap {
  rootFolderId: string;
  rootFolderUrl: string;
  sheetsFolderId: string;
  sheetsFolderUrl: string;
  receiptsFolderId: string;
  receiptsFolderUrl: string;
  expensesFolderId: string;
  expensesFolderUrl: string;
  complaintsFolderId: string;
  complaintsFolderUrl: string;
  chatFolderId: string;
  chatFolderUrl: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
}

let cachedDriveFolders: DriveFoldersMap | null = null;

/**
 * Safely parses any formatted or unformatted number string returned from Google Sheets.
 * Handles Arabic/Persian numerals, commas as thousand separators, currency symbols, and negative formats like (100) or -100.
 */
export function parseSheetNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val;
  }
  let str = String(val).trim();
  if (!str) return 0;

  // 1. Convert Arabic-Indic / Persian digits to English digits
  const standardDigits: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };
  str = str.replace(/[٠-٩۰-۹]/g, (char) => standardDigits[char] || char);

  // 2. Check for negative indicator: minus sign or accounting parenthesis (e.g., (1,200) )
  const isNegative = str.includes('-') || (str.startsWith('(') && str.endsWith(')'));

  // 3. Remove all non-numeric characters except decimal points
  let cleanStr = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if ((char >= '0' && char <= '9') || char === '.') {
      cleanStr += char;
    }
  }

  // 4. Parse as float
  const num = parseFloat(cleanStr);
  if (isNaN(num)) return 0;

  return isNegative ? -Math.abs(num) : num;
}

export function parseSheetNumberOptional(val: any): number | undefined {
  if (val === undefined || val === null || String(val).trim() === '') return undefined;
  const num = parseSheetNumber(val);
  return num === 0 && String(val).trim() !== '0' && String(val).trim() !== '٠' ? undefined : num;
}

export function parseSheetInt(val: any): number {
  return Math.round(parseSheetNumber(val));
}

export function parseSheetIntOptional(val: any): number | undefined {
  const num = parseSheetNumberOptional(val);
  return num !== undefined ? Math.round(num) : undefined;
}

export function parseFlatValue(val: any): number | string {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  if (!str) return '';
  const standardDigits: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };
  str = str.replace(/[٠-٩۰-۹]/g, (char) => standardDigits[char] || char);

  // If purely numeric integer
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }
  return str;
}

// Cache for read requests to save quota
const cache = {
  residents: { data: null as Resident[] | null, expiry: 0 },
  payments: { data: null as Payment[] | null, expiry: 0 },
  expenses: { data: null as Expense[] | null, expiry: 0 },
  rules: { data: null as string[] | null, expiry: 0 },
  craftsmen: { data: null as Craftsman[] | null, expiry: 0 },
  messages: { data: null as ChatMessage[] | null, expiry: 0 },
  decisions: { data: null as AdminDecision[] | null, expiry: 0 },
  polls: { data: null as Poll[] | null, expiry: 0 },
  complaints: { data: null as PublicComplaint[] | null, expiry: 0 },
  maintenance: { data: null as MaintenanceRequest[] | null, expiry: 0 },
  events: { data: null as BuildingEvent[] | null, expiry: 0 },
};

const CACHE_TTL = 10000; // 10 seconds TTL to heavily reduce quota during rapid clicks

function getFromCache<T>(key: keyof typeof cache): T | null {
  if (cache[key].data && Date.now() < cache[key].expiry) {
    return cache[key].data as unknown as T;
  }
  return null;
}

function setInCache(key: keyof typeof cache, data: any) {
  cache[key].data = data;
  cache[key].expiry = Date.now() + CACHE_TTL;
}

function getLocalCache<T>(key: string): T | null {
  try {
    const json = localStorage.getItem(`cache_${key}`);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

function setLocalCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`cache_${key}`, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function setAccessToken(token: string | null) {
  currentAccessToken = token;
  if (token && typeof window !== 'undefined') {
    localStorage.setItem('google_access_token', token);
  }
}

export function getAccessToken(): string | null {
  if (!currentAccessToken && typeof window !== 'undefined') {
    currentAccessToken = localStorage.getItem('google_access_token');
  }
  return currentAccessToken;
}

export function setSpreadsheetId(id: string | null) {
  spreadsheetId = id;
}

export function getSpreadsheetId(): string | null {
  return spreadsheetId;
}

// Check if accessToken is available
function checkAuth() {
  const token = getAccessToken();
  if (!token) {
    throw new Error('يرجى الضغط على زر "ربط Google Drive" لمنح صلاحية الوصول وإنشاء الملفات والجداول على Google Drive و Sheets.');
  }
}

// Main fetch wrapper with authorization
async function apiFetch(url: string, options: RequestInit = {}): Promise<any> {
  checkAuth();

  if (currentAccessToken === 'local-token') {
    console.warn('Google API bypassed for local-token (Resident session). Using local/cached operations.');
    if (url.includes('values/JoinRequests')) {
      try {
        const data = await fetchAllJoinRequests();
        const values = data.map((req: any) => [
          req.id,
          String(req.flatNumber),
          req.residentType,
          req.ownerName,
          req.ownerPhone,
          req.tenantName,
          req.tenantPhone,
          req.email,
          req.password,
          req.status,
          req.createdAt,
        ]);
        return { values };
      } catch (e) {
        console.error('Failed to fetch local join requests in bypass', e);
      }
    }
    if (url.includes('values/')) {
      return { values: [] };
    }
    return {};
  }

  const hasBody = options.body !== undefined && options.body !== null;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${currentAccessToken}`,
    ...(options.headers as Record<string, string> || {}),
  };
  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (networkError: any) {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const msg = networkError?.message || 'Failed to fetch';
    console.warn(`[Google API Network] ${isOffline ? 'Device is offline' : 'Fetch failed'} (${url}):`, msg);
    throw new Error(`Google API Network Error: ${msg}`);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || response.statusText;
    
    // Check if it is an authorization/token expiry or scope error
    if (
      response.status === 401 ||
      (response.status === 403 && errorMessage.toLowerCase().includes('scope')) ||
      errorMessage.toLowerCase().includes('insufficient') ||
      errorMessage.toLowerCase().includes('scope') ||
      errorMessage.toLowerCase().includes('credential') ||
      errorMessage.toLowerCase().includes('token') ||
      errorMessage.toLowerCase().includes('unauthorized') ||
      errorMessage.toLowerCase().includes('authenticated')
    ) {
      currentAccessToken = null;
      localStorage.removeItem('google_access_token');
      // Dispatch custom event to notify App.tsx to gracefully log out the user and show a message
      window.dispatchEvent(new CustomEvent('google-auth-error'));
    }
    
    throw new Error(`Google API Error: ${errorMessage}`);
  }
  return response.json();
}

// 1. Search for existing spreadsheet or create one
export async function initializeSpreadsheet(): Promise<string> {
  checkAuth();

  const defaultSheetTitles = [
    'Config', 
    'Residents', 
    'Payments', 
    'Expenses', 
    'Rules', 
    'Craftsmen', 
    'ChatMessages', 
    'AdminDecisions', 
    'Polls', 
    'Complaints', 
    'MaintenanceRequests', 
    'Events',
    'JoinRequests'
  ];

  const activeBId = (typeof window !== 'undefined' && (localStorage.getItem('active_building_id') || 'pyramids_view_1')) || 'pyramids_view_1';
  const activeBName = (typeof window !== 'undefined' && (localStorage.getItem('active_building_name') || localStorage.getItem('building_name') || 'Pyramids View 1')) || 'Pyramids View 1';
  const spreadsheetTitle = `${activeBName} - Management Database`;
  const buildingSheetStorageKey = `sheets_db_spreadsheet_id_${activeBId}`;

  if (currentAccessToken === 'local-token') {
    const sId = localStorage.getItem(buildingSheetStorageKey) || localStorage.getItem('sheets_db_spreadsheet_id') || 'local-resident-spreadsheet';
    spreadsheetId = sId;
    defaultSheetTitles.forEach((title, idx) => {
      sheetIds[title] = idx;
    });
    return sId;
  }
  
  // Check if we have a stored spreadsheet ID for this specific building
  const storedId = localStorage.getItem(buildingSheetStorageKey) || localStorage.getItem('sheets_db_spreadsheet_id');
  if (storedId && storedId !== 'local-resident-spreadsheet') {
    spreadsheetId = storedId;
    try {
      await fetchSheetMetadata();
      try {
        await ensureDriveFoldersStructure();
      } catch (fErr) {
        console.warn('Drive folder structure sync warning:', fErr);
      }
      return storedId;
    } catch (err) {
      console.warn('Could not verify cached spreadsheet ID, searching Drive:', err);
    }
  }

  // Search for file named with the building name
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(spreadsheetTitle)}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,name)`;
  const searchResult = await apiFetch(searchUrl);
  
  if (searchResult?.files && Array.isArray(searchResult.files) && searchResult.files.length > 0) {
    const sId = searchResult.files[0].id;
    spreadsheetId = sId;
    localStorage.setItem(buildingSheetStorageKey, sId);
    localStorage.setItem('sheets_db_spreadsheet_id', sId);
    await fetchSheetMetadata();
    try {
      await ensureDriveFoldersStructure();
    } catch (fErr) {
      console.warn('Drive folder structure sync warning:', fErr);
    }
    return sId;
  }
  
  // Create spreadsheet if not found
  const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  const body = {
    properties: {
      title: spreadsheetTitle,
    },
    sheets: [
      { properties: { title: 'Config' } },
      { properties: { title: 'Residents' } },
      { properties: { title: 'Payments' } },
      { properties: { title: 'Expenses' } },
      { properties: { title: 'Rules' } },
      { properties: { title: 'Craftsmen' } },
      { properties: { title: 'ChatMessages' } },
      { properties: { title: 'AdminDecisions' } },
      { properties: { title: 'Polls' } },
      { properties: { title: 'Complaints' } },
      { properties: { title: 'MaintenanceRequests' } },
      { properties: { title: 'Events' } },
      { properties: { title: 'JoinRequests' } },
    ],
  };
  
  const createResult = await apiFetch(createUrl, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  
  const sId = createResult?.spreadsheetId;
  if (!sId) {
    const fallbackId = `${activeBId}-fallback-db`;
    spreadsheetId = fallbackId;
    localStorage.setItem(buildingSheetStorageKey, fallbackId);
    localStorage.setItem('sheets_db_spreadsheet_id', fallbackId);
    defaultSheetTitles.forEach((title, idx) => {
      sheetIds[title] = idx;
    });
    return fallbackId;
  }

  spreadsheetId = sId;
  localStorage.setItem(buildingSheetStorageKey, sId);
  localStorage.setItem('sheets_db_spreadsheet_id', sId);
  
  // Map sheetIds safely
  if (Array.isArray(createResult?.sheets)) {
    createResult.sheets.forEach((sheet: any) => {
      if (sheet?.properties?.title && sheet?.properties?.sheetId !== undefined) {
        sheetIds[sheet.properties.title] = sheet.properties.sheetId;
      }
    });
  } else {
    defaultSheetTitles.forEach((title, idx) => {
      sheetIds[title] = idx;
    });
  }
  
  // Seed initial data
  await seedInitialData();
  try {
    await ensureDriveFoldersStructure();
  } catch (fErr) {
    console.warn('Drive folder structure sync warning:', fErr);
  }
  return sId;
}

// Fetch metadata to map Tab Title to Sheet ID (required for batchUpdates/deletes)
async function fetchSheetMetadata() {
  if (!spreadsheetId || currentAccessToken === 'local-token') return;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  const result = await apiFetch(url);
  if (Array.isArray(result?.sheets)) {
    result.sheets.forEach((sheet: any) => {
      if (sheet?.properties?.title && sheet?.properties?.sheetId !== undefined) {
        sheetIds[sheet.properties.title] = sheet.properties.sheetId;
      }
    });
  }

  // Ensure all required sheets exist (important for existing spreadsheets)
  await ensureRequiredSheets();
}

// Ensure all required sheets exist, create them if missing
async function ensureRequiredSheets() {
  if (!spreadsheetId || currentAccessToken === 'local-token') return;
  const requiredSheets = [
    'Config', 
    'Residents', 
    'Payments', 
    'Expenses', 
    'Rules', 
    'Craftsmen', 
    'ChatMessages', 
    'AdminDecisions', 
    'Polls', 
    'Complaints', 
    'MaintenanceRequests', 
    'Events',
    'JoinRequests'
  ];
  const existingSheets = Object.keys(sheetIds);
  const missingSheets = requiredSheets.filter(s => !existingSheets.includes(s));

  if (missingSheets.length > 0) {
    const requests = missingSheets.map(title => ({
      addSheet: {
        properties: { title }
      }
    }));

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const result = await apiFetch(url, {
      method: 'POST',
      body: JSON.stringify({ requests })
    });

    // Update sheetIds with new sheets safely
    if (Array.isArray(result?.replies)) {
      result.replies.forEach((reply: any) => {
        const sheet = reply?.addSheet;
        if (sheet?.properties?.title && sheet?.properties?.sheetId !== undefined) {
          sheetIds[sheet.properties.title] = sheet.properties.sheetId;
        }
      });
    }

    // Seed headers for missing sheets (clean - headers only)
    for (const title of missingSheets) {
      if (title === 'Craftsmen') {
        const craftsmenValues = [
          ['ID', 'Name', 'Specialty', 'Phone', 'Notes', 'AddedBy', 'Comments'],
        ];
        await writeSheetRange('Craftsmen!A1', craftsmenValues);
      } else if (title === 'ChatMessages') {
        const chatValues = [
          ['ID', 'SenderName', 'FlatNumber', 'Text', 'Timestamp', 'ImageUrl'],
        ];
        await writeSheetRange('ChatMessages!A1', chatValues);
      } else if (title === 'AdminDecisions') {
        const decisionValues = [
          ['ID', 'DecisionNumber', 'Title', 'Description', 'Category', 'Date', 'EffectiveDate', 'IssuedBy', 'Status', 'Notes'],
        ];
        await writeSheetRange('AdminDecisions!A1', decisionValues);
      } else if (title === 'Polls') {
        const pollValues = [
          ['ID', 'Title', 'Description', 'Options', 'UserVotes', 'CreatedAt', 'EndDate', 'Status'],
        ];
        await writeSheetRange('Polls!A1', pollValues);
      } else if (title === 'Complaints') {
        const compValues = [
          ['ID', 'Title', 'Description', 'FlatNumber', 'ResidentName', 'IsAnonymous', 'ImageUrl', 'Date', 'Comments'],
        ];
        await writeSheetRange('Complaints!A1', compValues);
      } else if (title === 'MaintenanceRequests') {
        const maintValues = [
          ['ID', 'FlatNumber', 'ResidentName', 'Title', 'Description', 'Category', 'Status', 'Priority', 'Date', 'Notes'],
        ];
        await writeSheetRange('MaintenanceRequests!A1', maintValues);
      } else if (title === 'Events') {
        const eventValues = [
          ['ID', 'Title', 'Description', 'Date', 'Time', 'Type', 'TargetAudience', 'Status'],
        ];
        await writeSheetRange('Events!A1', eventValues);
      } else if (title === 'JoinRequests') {
        const joinHeaders = [
          ['ID', 'FlatNumber', 'ResidentType', 'OwnerName', 'OwnerPhone', 'TenantName', 'TenantPhone', 'Email', 'Password', 'Status', 'CreatedAt']
        ];
        await writeSheetRange('JoinRequests!A1', joinHeaders);
      }
    }
  }
}

// Seed spreadsheet with column headers (Clean Slate - No Dummy Data)
async function seedInitialData() {
  if (!spreadsheetId) return;
  
  const configValues = [
    ['Key', 'Value'],
    ['expenseTypes', 'صيانة,كهرباء,مياه,أمن ونظافة,مصاعد,أخرى'],
    ['paymentTypes', 'اشتراك شهري,صيانة طارئة,تحصيلات اخرى'],
    ['activityTypes', 'سكني,سكني مغلق,مفروش,إداري,تجاري'],
    ['admins', 'waheedsamaha8@gmail.com'], // default admin from the context email
    ['managers', ''],
    ['accountingStartDate', '2026-01-01'],
    ['defaultMonthlyFee', '400'],
    ['activityDefaultFees', JSON.stringify({ 'سكني': 400, 'سكني مغلق': 200, 'مفروش': 600, 'إداري': 800, 'تجاري': 500 })],
  ];

  const residentValues = [
    ['ID', 'FlatNumber', 'Name', 'ActivityType', 'Phone', 'Notes', 'OwnershipType', 'TenantName', 'TenantPhone', 'MonthlyFee', 'InitialBalance'],
  ];

  const paymentValues = [
    ['ID', 'Year', 'Month', 'ResidentID', 'PaymentType', 'Amount', 'ReceiptNumber', 'Notes', 'FileID', 'Date', 'IsManuallyPaid'],
  ];

  const expenseValues = [
    ['ID', 'Year', 'Month', 'ExpenseType', 'Amount', 'Notes', 'FileID', 'Date'],
  ];

  const rulesValues = [
    ['Rule'],
    ['غير مسموح تمامًا تحويل الوحدات السكنية او الروف إلى فنادق أو غرف فندقية او أنشطة تجارية او إدارية.'],
    ['غير مسموح تماما أي استخدامات تُسبب إزعاجا للسكان أو تُخل بالراحة و الهدوء والأمن.'],
    ['ممنوع تأجير الوحدات للشركات إلا بعد موافقة اتحاد الملاك للتأكد من أن نشاط الشركة لن يخل بالهدوء.'],
    ['ممنوع منعاً باتاً تأجير الوحدات المفروشة إلا للأسر فقط والتأكيد على عدم السماح بأي تجاوزات مخلة.'],
    ['اعمال التشطيبات للشقق من الساعة ٨ صباحاً وحتى ٦ مساءً يومياً ماعدا يوم الجمعة.'],
    ['ممنوع منعاً باتاً استخدام المصاعد في نقل الاثاث ومواد البناء ومخلفات التشطيبات لضمان سلامتها.'],
  ];

  const craftsmenValues = [
    ['ID', 'Name', 'Specialty', 'Phone', 'Notes', 'AddedBy', 'Comments'],
  ];

  const chatValues = [
    ['ID', 'SenderName', 'FlatNumber', 'Text', 'Timestamp', 'ImageUrl'],
  ];

  const decisionValues = [
    ['ID', 'DecisionNumber', 'Title', 'Description', 'Category', 'Date', 'EffectiveDate', 'IssuedBy', 'Status', 'Notes'],
  ];

  const pollValues = [
    ['ID', 'Title', 'Description', 'Options', 'UserVotes', 'CreatedAt', 'EndDate', 'Status'],
  ];

  const compValues = [
    ['ID', 'Title', 'Description', 'FlatNumber', 'ResidentName', 'IsAnonymous', 'ImageUrl', 'Date', 'Comments'],
  ];

  const maintValues = [
    ['ID', 'FlatNumber', 'ResidentName', 'Title', 'Description', 'Category', 'Status', 'Priority', 'Date', 'Notes'],
  ];

  const eventValues = [
    ['ID', 'Title', 'Description', 'Date', 'Time', 'Type', 'TargetAudience', 'Status'],
  ];

  await writeSheetRange('Config!A1', configValues);
  await writeSheetRange('Residents!A1', residentValues);
  await writeSheetRange('Payments!A1', paymentValues);
  await writeSheetRange('Expenses!A1', expenseValues);
  await writeSheetRange('Rules!A1', rulesValues);
  await writeSheetRange('Craftsmen!A1', craftsmenValues);
  await writeSheetRange('ChatMessages!A1', chatValues);
  await writeSheetRange('AdminDecisions!A1', decisionValues);
  await writeSheetRange('Polls!A1', pollValues);
  await writeSheetRange('Complaints!A1', compValues);
  await writeSheetRange('MaintenanceRequests!A1', maintValues);
  await writeSheetRange('Events!A1', eventValues);
}

// Google Sheets cell limit safeguard: Google Sheets permits at most 50,000 characters per single cell.
export const MAX_SHEET_CELL_CHARS = 45000;

export function sanitizeSheetCell(val: any): string {
  if (val === undefined || val === null) return '';
  const str = typeof val === 'string' ? val : String(val);
  
  // If it's a raw base64 data URI (exceeds reasonable sheet cell length and shouldn't be stored in a cell)
  if (str.startsWith('data:') && str.length > 500) {
    return '[مرفق محلي - غير متزامن مع Drive]';
  }
  
  // Hard limit: Google Sheets allows maximum 50,000 characters per cell
  if (str.length > MAX_SHEET_CELL_CHARS) {
    console.warn(`[Google Sheets] Truncating cell content from ${str.length} to ${MAX_SHEET_CELL_CHARS} chars to comply with Google limit.`);
    return str.substring(0, MAX_SHEET_CELL_CHARS);
  }
  
  return str;
}

export function sanitizeSheetValues(values: any[][]): string[][] {
  if (!Array.isArray(values)) return [];
  return values.map(row => 
    Array.isArray(row) ? row.map(cell => sanitizeSheetCell(cell)) : []
  );
}

// Low-level helper to write a range to a sheet
async function writeSheetRange(range: string, values: (string | number | boolean)[][]) {
  if (!spreadsheetId) return;
  const sanitizedValues = sanitizeSheetValues(values);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
  await apiFetch(url, {
    method: 'PUT',
    body: JSON.stringify({ values: sanitizedValues }),
  });
}

// Low-level helper to clear a range in a sheet
async function clearSheetRange(range: string) {
  if (!spreadsheetId) return;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`;
  await apiFetch(url, {
    method: 'POST',
  });
}

// Low-level helper to append values to a sheet
async function appendSheetRow(sheetName: string, values: (string | number | boolean)[][]) {
  if (!spreadsheetId) return;
  const sanitizedValues = sanitizeSheetValues(values);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:append?valueInputOption=USER_ENTERED`;
  await apiFetch(url, {
    method: 'POST',
    body: JSON.stringify({ values: sanitizedValues }),
  });
}

// Fetch config from Sheets Config tab
export async function getAppConfig(): Promise<AppConfig> {
  const defaultActivityFees: Record<string, number> = {
    'سكني': 400,
    'سكني مغلق': 200,
    'مفروش': 600,
    'إداري': 800,
    'تجاري': 500,
  };

  const defaultAdminProfile: AdminResidentProfile = {
    flatNumber: 207,
    name: 'وحيد سماحة',
    phone: '',
    activityType: 'سكني',
    ownershipType: 'تمليك',
    monthlyFee: 400,
    initialBalance: 0,
    notes: 'رئيس اتحاد الملاك',
  };

  const config: AppConfig = {
    expenseTypes: ['صيانة', 'كهرباء', 'مياه', 'أمن ونظافة', 'مصاعد', 'أخرى'],
    paymentTypes: ['اشتراك شهري', 'صيانة طارئة', 'تحصيلات اخرى'],
    activityTypes: ['سكني', 'سكني مغلق', 'مفروش', 'إداري', 'تجاري'],
    admins: ['waheedsamaha8@gmail.com'],
    managers: [],
    accountingStartDate: '2026-01-01',
    defaultMonthlyFee: 400,
    activityDefaultFees: defaultActivityFees,
    adminResidentProfile: defaultAdminProfile,
  };

  if (!spreadsheetId || currentAccessToken === 'local-token' || spreadsheetId === 'local-resident-spreadsheet' || spreadsheetId === 'pyramids-view-1-fallback-db') {
    const cachedConfig = getLocalCache<AppConfig>('config');
    if (cachedConfig) {
      return { ...config, ...cachedConfig };
    }
    return config;
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Config!A1:B20`;
    const result = await apiFetch(url);
    const rows = Array.isArray(result?.values) ? result.values : [];
    
    rows.forEach((row: string[]) => {
      if (!Array.isArray(row) || row.length < 2) return;
      const [key, value] = row;
      if (key === 'expenseTypes') config.expenseTypes = value.split(',').filter(Boolean);
      if (key === 'paymentTypes') config.paymentTypes = value.split(',').filter(Boolean);
      if (key === 'activityTypes') config.activityTypes = value.split(',').filter(Boolean);
      if (key === 'admins') config.admins = value.split(',').filter(Boolean).map(e => e.toLowerCase().trim());
      if (key === 'managers') config.managers = value.split(',').filter(Boolean).map(e => e.toLowerCase().trim());
      if (key === 'accountingStartDate') config.accountingStartDate = value;
      if (key === 'defaultMonthlyFee') config.defaultMonthlyFee = parseSheetNumber(value) || 400;
      if (key === 'buildingLayout') {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            config.buildingLayout = parsed;
          }
        } catch {
          // ignore
        }
      }
      if (key === 'activityDefaultFees') {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object') {
            config.activityDefaultFees = { ...defaultActivityFees, ...parsed };
          }
        } catch {
          config.activityDefaultFees = defaultActivityFees;
        }
      }
      if (key === 'adminResidentProfile') {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object') {
            config.adminResidentProfile = { ...defaultAdminProfile, ...parsed };
          }
        } catch {
          config.adminResidentProfile = defaultAdminProfile;
        }
      }
      if (key === 'assistantConfig') {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object') {
            config.assistantConfig = parsed;
          }
        } catch {
          // ignore
        }
      }
    });

    if (!config.activityDefaultFees) {
      config.activityDefaultFees = defaultActivityFees;
    }
    if (!config.adminResidentProfile) {
      config.adminResidentProfile = defaultAdminProfile;
    }

    return config;
  } catch (err) {
    console.warn('Failed to fetch config from Google Sheets, using cached/default config:', err);
    const cachedConfig = getLocalCache<AppConfig>('config');
    return cachedConfig ? { ...config, ...cachedConfig } : config;
  }
}

// Save config changes back to Sheet
export async function saveAppConfig(config: AppConfig) {
  const defaultActivityFees: Record<string, number> = {
    'سكني': 400,
    'سكني مغلق': 200,
    'مفروش': 600,
    'إداري': 800,
    'تجاري': 500,
  };

  // Sync with backend /api/config if active
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).catch(() => {});
  }

  const values = [
    ['Key', 'Value'],
    ['expenseTypes', config.expenseTypes.join(',')],
    ['paymentTypes', config.paymentTypes.join(',')],
    ['activityTypes', config.activityTypes.join(',')],
    ['admins', config.admins.join(',')],
    ['managers', config.managers.join(',')],
    ['accountingStartDate', config.accountingStartDate || '2026-01-01'],
    ['defaultMonthlyFee', (config.defaultMonthlyFee || 400).toString()],
    ['buildingLayout', JSON.stringify(config.buildingLayout || [])],
    ['activityDefaultFees', JSON.stringify(config.activityDefaultFees || defaultActivityFees)],
    ['adminResidentProfile', JSON.stringify(config.adminResidentProfile || null)],
    ['assistantConfig', JSON.stringify(config.assistantConfig || null)],
  ];
  await writeSheetRange('Config!A1', values);
}

// Fetch Residents
export async function getResidents(): Promise<Resident[]> {
  const cached = getFromCache<Resident[]>('residents');
  if (cached) return cached;
  
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Residents!A2:K500`;
  const result = await apiFetch(url);
  const rows = result.values || [];
  
  const data = rows.map((row: string[]) => {
    const parsedFlat = parseFlatValue(row[1]);
    const parsedMonthlyFee = parseSheetNumberOptional(row[9]);
    const parsedInitialBalance = parseSheetNumber(row[10]);
    const rawNotes = row[5] || '';
    const cleanNotes = rawNotes.includes('توليد تلقائي') ? '' : rawNotes;

    return {
      id: row[0],
      flatNumber: parsedFlat,
      name: row[2],
      activityType: row[3] || 'سكني',
      phone: formatMobileNumber(row[4] || ''),
      notes: cleanNotes,
      ownershipType: row[6] || 'تمليك',
      tenantName: row[7] || '',
      tenantPhone: formatMobileNumber(row[8] || ''),
      monthlyFee: parsedMonthlyFee,
      initialBalance: parsedInitialBalance,
    };
  }).filter((r: any) => r.id && r.flatNumber !== undefined && r.flatNumber !== null && String(r.flatNumber).trim() !== '' && String(r.flatNumber) !== '0');
  
  setInCache('residents', data);
  return data;
}

// Add Resident
export async function addResidentSheet(resident: Resident): Promise<void> {
  const row = [
    resident.id,
    resident.flatNumber.toString(),
    resident.name,
    resident.activityType,
    formatPhoneForSheet(resident.phone || ''),
    resident.notes || '',
    resident.ownershipType || 'تمليك',
    resident.tenantName || '',
    formatPhoneForSheet(resident.tenantPhone || ''),
    (resident.monthlyFee ?? '').toString(),
    (resident.initialBalance ?? 0).toString(),
  ];
  await appendSheetRow('Residents', [row]);
  cache.residents.expiry = 0; // Invalidate cache AFTER successful mutation
}

// Set All Residents (Batch)
export async function setAllResidentsSheet(residents: Resident[]): Promise<void> {
  // 1. Clear the Residents sheet
  await clearSheetRange('Residents!A1:K2000');
  
  // 2. Prepare headers and rows
  const values = [
    ['ID', 'FlatNumber', 'Name', 'ActivityType', 'Phone', 'Notes', 'OwnershipType', 'TenantName', 'TenantPhone', 'MonthlyFee', 'InitialBalance'],
    ...residents.map(r => [
      r.id,
      r.flatNumber.toString(),
      r.name,
      r.activityType,
      formatPhoneForSheet(r.phone || ''),
      r.notes || '',
      r.ownershipType || 'تمليك',
      r.tenantName || '',
      formatPhoneForSheet(r.tenantPhone || ''),
      (r.monthlyFee ?? '').toString(),
      (r.initialBalance ?? 0).toString(),
    ])
  ];
  
  // 3. Write new data
  await writeSheetRange('Residents!A1', values);
  cache.residents.expiry = 0;
}

// Helper to find exact physical sheet row index by ID in column A
async function findRowIndexById(sheetTitle: string, id: string): Promise<number> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTitle)}!A2:A3000`;
  const result = await apiFetch(url);
  const rows = result.values || [];
  return rows.findIndex((row: string[]) => row && row[0] && row[0].trim() === id.trim());
}

// Edit Resident
export async function editResidentSheet(resident: Resident): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  
  // Update internal cache immediately
  if (cache.residents.data) {
    const list = cache.residents.data as Resident[];
    const idx = list.findIndex(r => (r.id && resident.id && r.id.trim().toLowerCase() === resident.id.trim().toLowerCase()) || isSameFlatNumber(r.flatNumber, resident.flatNumber));
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...resident };
    } else {
      list.push(resident);
    }
    cache.residents.data = list;
  }

  // Find exact physical row index in Google Sheets
  let rawRowIdx = await findRowIndexById('Residents', resident.id);
  
  // Fallback 1: Try finding by FlatNumber
  if (rawRowIdx === -1 && resident.flatNumber) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Residents!A2:B2000`;
    const result = await apiFetch(url);
    const rows = result.values || [];
    rawRowIdx = rows.findIndex((row: string[]) => row && isSameFlatNumber(row[1], resident.flatNumber));
  }

  // Fallback 2: If still not found, append as a new resident to prevent error
  if (rawRowIdx === -1) {
    console.warn(`[Google API] Resident ${resident.name} with ID ${resident.id} not found for edit. Appending instead.`);
    await addResidentSheet(resident);
    return;
  }
  
  const sheetRowNumber = rawRowIdx + 2; // Row offset (+1 for header, +1 for 1-based index)
  const range = `Residents!A${sheetRowNumber}:K${sheetRowNumber}`;
  const values = [[
    resident.id,
    resident.flatNumber.toString(),
    resident.name,
    resident.activityType,
    formatPhoneForSheet(resident.phone || ''),
    resident.notes || '',
    resident.ownershipType || 'تمليك',
    resident.tenantName || '',
    formatPhoneForSheet(resident.tenantPhone || ''),
    (resident.monthlyFee ?? '').toString(),
    (resident.initialBalance ?? 0).toString(),
  ]];
  await writeSheetRange(range, values);
  cache.residents.expiry = 0;
}

// Delete Resident (using batch update to delete the row)
export async function deleteResidentSheet(residentId: string): Promise<void> {
  if (cache.residents.data) {
    cache.residents.data = (cache.residents.data as Resident[]).filter(r => r.id !== residentId);
  }
  const rawRowIdx = await findRowIndexById('Residents', residentId);
  if (rawRowIdx === -1) {
    console.warn(`[Google API Warning] Resident with ID ${residentId} not found during delete. Skipping.`);
    return;
  }
  
  const sheetRowIndex = rawRowIdx + 1; // 0-based index for API requests (excluding header row is rawRowIdx + 1)
  await deleteSheetRow('Residents', sheetRowIndex);
  cache.residents.expiry = 0;
}

// Fetch Payments
export async function getPayments(): Promise<Payment[]> {
  const cached = getFromCache<Payment[]>('payments');
  if (cached) return cached;
  
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Payments!A2:M2000`;
  const result = await apiFetch(url);
  const rows = result.values || [];
  
  const data = rows.map((row: string[]) => {
    const parsedYear = parseSheetInt(row[1]);
    const parsedFlat = parseFlatValue(row[5]);
    const parsedAmount = parseSheetNumber(row[7] || '0');
    return {
      id: row[0],
      year: parsedYear || new Date().getFullYear(),
      month: (row[2] || '').padStart(2, '0'),
      residentId: row[3],
      residentName: row[4] || '',
      flatNumber: parsedFlat,
      paymentType: row[6],
      amount: parsedAmount,
      receiptNumber: row[8] || '',
      notes: row[9] || '',
      fileId: row[10] || '',
      fileUrl: row[10] ? `https://drive.google.com/uc?export=view&id=${row[10]}` : '',
      date: row[11] || '',
      isManuallyPaid: row[12] === 'TRUE',
    };
  }).filter((p: any) => p.id && p.year > 0);
  
  setInCache('payments', data);
  return data;
}

// Add Payment
export async function addPaymentSheet(payment: Payment): Promise<void> {
  const safeFileId = payment.fileId && payment.fileId.startsWith('data:') ? '' : (payment.fileId || '');
  const row = [
    payment.id,
    payment.year.toString(),
    payment.month,
    payment.residentId,
    payment.residentName,
    payment.flatNumber.toString(),
    payment.paymentType,
    payment.amount.toString(),
    payment.receiptNumber || '',
    payment.notes || '',
    safeFileId,
    payment.date || new Date().toISOString().split('T')[0],
    payment.isManuallyPaid ? 'TRUE' : 'FALSE',
  ];
  await appendSheetRow('Payments', [row]);
  cache.payments.expiry = 0;
}

// Edit Payment
export async function editPaymentSheet(payment: Payment): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const rawRowIdx = await findRowIndexById('Payments', payment.id);
  if (rawRowIdx === -1) throw new Error('لم يتم العثور على التحصيل.');
  
  const safeFileId = payment.fileId && payment.fileId.startsWith('data:') ? '' : (payment.fileId || '');
  const sheetRowNumber = rawRowIdx + 2;
  const range = `Payments!A${sheetRowNumber}:M${sheetRowNumber}`;
  const values = [[
    payment.id,
    payment.year.toString(),
    payment.month,
    payment.residentId,
    payment.residentName,
    payment.flatNumber.toString(),
    payment.paymentType,
    payment.amount.toString(),
    payment.receiptNumber || '',
    payment.notes || '',
    safeFileId,
    payment.date,
    payment.isManuallyPaid ? 'TRUE' : 'FALSE',
  ]];
  await writeSheetRange(range, values);
  cache.payments.expiry = 0;
}

// Delete Payment
export async function deletePaymentSheet(paymentId: string): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const rawRowIdx = await findRowIndexById('Payments', paymentId);
  if (rawRowIdx === -1) {
    console.warn(`[Google API Warning] Payment with ID ${paymentId} not found during delete. Skipping.`);
    return;
  }
  
  const sheetRowIndex = rawRowIdx + 1; // 0-based sheet index
  await deleteSheetRow('Payments', sheetRowIndex);
  cache.payments.expiry = 0;
}

// Fetch Expenses
export async function getExpenses(): Promise<Expense[]> {
  const cached = getFromCache<Expense[]>('expenses');
  if (cached) return cached;
  
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Expenses!A2:H1000`;
  const result = await apiFetch(url);
  const rows = result.values || [];
  
  const data = rows.map((row: string[]) => {
    const parsedYear = parseSheetInt(row[1]);
    const parsedAmount = parseSheetNumber(row[4] || '0');
    return {
      id: row[0],
      year: parsedYear || new Date().getFullYear(),
      month: (row[2] || '').padStart(2, '0'),
      expenseType: row[3],
      amount: parsedAmount,
      notes: row[5] || '',
      fileId: row[6] || '',
      fileUrl: row[6] ? `https://drive.google.com/uc?export=view&id=${row[6]}` : '',
      date: row[7] || '',
    };
  }).filter((e: any) => e.id && e.year > 0);
  
  setInCache('expenses', data);
  return data;
}

// Add Expense
export async function addExpenseSheet(expense: Expense): Promise<void> {
  const safeFileId = expense.fileId && expense.fileId.startsWith('data:') ? '' : (expense.fileId || '');
  const row = [
    expense.id,
    expense.year.toString(),
    expense.month,
    expense.expenseType,
    expense.amount.toString(),
    expense.notes || '',
    safeFileId,
    expense.date || new Date().toISOString().split('T')[0],
  ];
  await appendSheetRow('Expenses', [row]);
  cache.expenses.expiry = 0;
}

// Edit Expense
export async function editExpenseSheet(expense: Expense): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const rawRowIdx = await findRowIndexById('Expenses', expense.id);
  if (rawRowIdx === -1) throw new Error('لم يتم العثور على المصروف.');
  
  const safeFileId = expense.fileId && expense.fileId.startsWith('data:') ? '' : (expense.fileId || '');
  const sheetRowNumber = rawRowIdx + 2;
  const range = `Expenses!A${sheetRowNumber}:H${sheetRowNumber}`;
  const values = [[
    expense.id,
    expense.year.toString(),
    expense.month,
    expense.expenseType,
    expense.amount.toString(),
    expense.notes || '',
    safeFileId,
    expense.date,
  ]];
  await writeSheetRange(range, values);
  cache.expenses.expiry = 0;
}

// Delete Expense
export async function deleteExpenseSheet(expenseId: string): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const rawRowIdx = await findRowIndexById('Expenses', expenseId);
  if (rawRowIdx === -1) {
    console.warn(`[Google API Warning] Expense with ID ${expenseId} not found during delete. Skipping.`);
    return;
  }
  
  const sheetRowIndex = rawRowIdx + 1; // 0-based sheet index
  await deleteSheetRow('Expenses', sheetRowIndex);
  cache.expenses.expiry = 0;
}

// Fetch Building Rules
export async function getBuildingRules(): Promise<BuildingRules> {
  const cached = getFromCache<string[]>('rules');
  if (cached) return { rules: cached };
  
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Rules!A2:A100`;
  const result = await apiFetch(url);
  const rows = result.values || [];
  
  const rules = rows.map((row: string[]) => row[0]).filter(Boolean);
  setInCache('rules', rules);
  
  return {
    rules,
  };
}

// Batch fetch all major data sheets to save quota
export async function batchGetAllData(): Promise<{
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
}> {
  // Check if all data is cached
  const cResidents = getFromCache<Resident[]>('residents');
  const cPayments = getFromCache<Payment[]>('payments');
  const cExpenses = getFromCache<Expense[]>('expenses');
  const cRules = getFromCache<string[]>('rules');
  const cCraftsmen = getFromCache<Craftsman[]>('craftsmen');
  const cMessages = getFromCache<ChatMessage[]>('messages');
  const cDecisions = getFromCache<AdminDecision[]>('decisions');
  const cPolls = getFromCache<Poll[]>('polls');
  const cComplaints = getFromCache<PublicComplaint[]>('complaints');
  const cMaintenance = getFromCache<MaintenanceRequest[]>('maintenance');
  const cEvents = getFromCache<BuildingEvent[]>('events');

  if (cResidents && cPayments && cExpenses && cRules && cCraftsmen && cMessages && cDecisions && cPolls && cComplaints && cMaintenance && cEvents) {
    return { 
      residents: cResidents, 
      payments: cPayments, 
      expenses: cExpenses, 
      rules: cRules, 
      craftsmen: cCraftsmen,
      messages: cMessages,
      decisions: cDecisions,
      polls: cPolls,
      complaints: cComplaints,
      maintenance: cMaintenance,
      events: cEvents,
    };
  }

  const getFallbackData = () => ({
    residents: cResidents || getLocalCache<Resident[]>('residents') || [], 
    payments: cPayments || getLocalCache<Payment[]>('payments') || [], 
    expenses: cExpenses || getLocalCache<Expense[]>('expenses') || [], 
    rules: cRules || getLocalCache<{ rules: string[] }>('rules')?.rules || [], 
    craftsmen: cCraftsmen || getLocalCache<Craftsman[]>('craftsmen') || [],
    messages: cMessages || getLocalCache<ChatMessage[]>('chat_messages') || getLocalCache<ChatMessage[]>('messages') || [],
    decisions: cDecisions || getLocalCache<AdminDecision[]>('admin_decisions') || getLocalCache<AdminDecision[]>('decisions') || [],
    polls: cPolls || getLocalCache<Poll[]>('polls') || [],
    complaints: cComplaints || getLocalCache<PublicComplaint[]>('public_complaints') || getLocalCache<PublicComplaint[]>('complaints') || [],
    maintenance: cMaintenance || getLocalCache<MaintenanceRequest[]>('maintenance') || [],
    events: cEvents || getLocalCache<BuildingEvent[]>('events') || [],
  });

  if (!spreadsheetId || currentAccessToken === 'local-token' || spreadsheetId === 'local-resident-spreadsheet' || spreadsheetId === 'pyramids-view-1-fallback-db') {
    return getFallbackData();
  }

  try {
    const ranges = [
    'Residents!A2:K1000',
    'Payments!A2:M2000',
    'Expenses!A2:H1000',
    'Rules!A2:A200',
    'Craftsmen!A2:G1000',
    'ChatMessages!A2:F2000',
    'AdminDecisions!A2:J500',
    'Polls!A2:H500',
    'Complaints!A2:I1000',
    'MaintenanceRequests!A2:J1000',
    'Events!A2:H500'
  ];
  
  const queryParams = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${queryParams}`;
  
  const result = await apiFetch(url);
  const valueRanges = result.valueRanges || [];
  
  const residentsRows = valueRanges[0]?.values || [];
  const paymentsRows = valueRanges[1]?.values || [];
  const expensesRows = valueRanges[2]?.values || [];
  const rulesRows = valueRanges[3]?.values || [];
  const craftsmenRows = valueRanges[4]?.values || [];
  const chatRows = valueRanges[5]?.values || [];
  const decisionRows = valueRanges[6]?.values || [];
  const pollRows = valueRanges[7]?.values || [];
  const complaintRows = valueRanges[8]?.values || [];
  const maintenanceRows = valueRanges[9]?.values || [];
  const eventRows = valueRanges[10]?.values || [];
  
  const residents = residentsRows.map((row: string[]) => {
    const parsedFlat = parseFlatValue(row[1]);
    const parsedMonthlyFee = parseSheetNumberOptional(row[9]);
    const parsedInitialBalance = parseSheetNumber(row[10]);
    const rawNotes = row[5] || '';
    const cleanNotes = rawNotes.includes('توليد تلقائي') ? '' : rawNotes;
    
    return {
      id: row[0],
      flatNumber: parsedFlat,
      name: row[2] || '',
      activityType: row[3] || 'سكني',
      phone: formatMobileNumber(row[4] || ''),
      notes: cleanNotes,
      ownershipType: row[6] || 'تمليك',
      tenantName: row[7] || '',
      tenantPhone: formatMobileNumber(row[8] || ''),
      monthlyFee: parsedMonthlyFee,
      initialBalance: parsedInitialBalance,
    };
  }).filter((r: any) => r.id && r.flatNumber !== undefined && r.flatNumber !== null && String(r.flatNumber).trim() !== '' && String(r.flatNumber) !== '0');

  const payments = paymentsRows.map((row: string[]) => {
    const parsedYear = parseSheetInt(row[1]);
    const parsedFlat = parseFlatValue(row[5]);
    const parsedAmount = parseSheetNumber(row[7] || '0');
    return {
      id: row[0],
      year: parsedYear || new Date().getFullYear(),
      month: (row[2] || '').padStart(2, '0'),
      residentId: row[3],
      residentName: row[4] || '',
      flatNumber: parsedFlat,
      paymentType: row[6],
      amount: parsedAmount,
      receiptNumber: row[8] || '',
      notes: row[9] || '',
      fileId: row[10] || '',
      fileUrl: row[10] ? `https://drive.google.com/uc?export=view&id=${row[10]}` : '',
      date: row[11] || '',
      isManuallyPaid: row[12] === 'TRUE',
    };
  }).filter((p: any) => p.id && p.year > 0);

  const expenses = expensesRows.map((row: string[]) => {
    const parsedYear = parseSheetInt(row[1]);
    const parsedAmount = parseSheetNumber(row[4] || '0');
    return {
      id: row[0],
      year: parsedYear || new Date().getFullYear(),
      month: (row[2] || '').padStart(2, '0'),
      expenseType: row[3],
      amount: parsedAmount,
      notes: row[5] || '',
      fileId: row[6] || '',
      fileUrl: row[6] ? `https://drive.google.com/uc?export=view&id=${row[6]}` : '',
      date: row[7] || '',
    };
  }).filter((e: any) => e.id && e.year > 0);

  const rules = rulesRows.map((row: string[]) => row[0]).filter(Boolean);

  const craftsmen: Craftsman[] = craftsmenRows.map((row: string[]) => {
    let comments: CraftsmanComment[] = [];
    if (row[6]) {
      try {
        comments = JSON.parse(row[6]);
        if (!Array.isArray(comments)) comments = [];
      } catch (e) {
        comments = [];
      }
    }
    return {
      id: row[0],
      name: row[1] || '',
      specialty: row[2] || '',
      phone: formatMobileNumber(row[3] || ''),
      notes: row[4] || '',
      addedBy: row[5] || '',
      comments,
    };
  }).filter((c: any) => c.id && c.name);

  const messages: ChatMessage[] = chatRows.map((row: string[]) => {
    const flatNum = parseFlatValue(row[2]) || undefined;
    return {
      id: row[0],
      senderName: row[1] || '',
      flatNumber: flatNum,
      text: row[3] || '',
      timestamp: row[4] || new Date().toISOString(),
      imageUrl: row[5] || undefined,
    };
  }).filter((m: any) => m.id && (m.text || m.imageUrl));

  const decisions: AdminDecision[] = decisionRows.map((row: string[]) => {
    return {
      id: row[0],
      decisionNumber: row[1] || '',
      title: row[2] || '',
      description: row[3] || '',
      category: (row[4] as any) || 'تنظيمي',
      date: row[5] || '',
      effectiveDate: row[6] || undefined,
      issuedBy: row[7] || 'مجلس إدارة اتحاد الملاك',
      status: (row[8] as any) || 'ACTIVE',
      notes: row[9] || undefined,
    };
  }).filter((d: any) => d.id && d.title);

  const polls: Poll[] = pollRows.map((row: string[]) => {
    let options = [];
    let userVotes = {};
    try {
      options = row[3] ? JSON.parse(row[3]) : [];
    } catch (e) {
      options = [];
    }
    try {
      userVotes = row[4] ? JSON.parse(row[4]) : {};
    } catch (e) {
      userVotes = {};
    }
    return {
      id: row[0],
      title: row[1] || '',
      description: row[2] || '',
      options,
      userVotes,
      createdAt: row[5] || new Date().toISOString().split('T')[0],
      endDate: row[6] || '',
      status: (row[7] as any) || 'ACTIVE',
    };
  }).filter((p: any) => p.id && p.title);

  const complaints: PublicComplaint[] = complaintRows.map((row: string[]) => {
    const flatNum = parseFlatValue(row[3]) || undefined;
    let comments = [];
    try {
      comments = row[8] ? JSON.parse(row[8]) : [];
    } catch (e) {
      comments = [];
    }
    return {
      id: row[0],
      title: row[1] || '',
      description: row[2] || '',
      flatNumber: flatNum,
      residentName: row[4] || '',
      isAnonymous: row[5] === 'TRUE',
      imageUrl: row[6] || undefined,
      date: row[7] || new Date().toISOString().split('T')[0],
      comments,
    };
  }).filter((c: any) => c.id && c.title);

  const maintenance: MaintenanceRequest[] = maintenanceRows.map((row: string[]) => {
    const flatNum = parseFlatValue(row[1]);
    return {
      id: row[0],
      flatNumber: flatNum,
      residentName: row[2] || '',
      title: row[3] || '',
      description: row[4] || '',
      category: (row[5] as any) || 'أخرى',
      status: (row[6] as any) || 'PENDING',
      priority: (row[7] as any) || 'MEDIUM',
      date: row[8] || new Date().toISOString().split('T')[0],
      notes: row[9] || undefined,
    };
  }).filter((m: any) => m.id && m.title);

  const events: BuildingEvent[] = eventRows.map((row: string[]) => {
    return {
      id: row[0],
      title: row[1] || '',
      description: row[2] || '',
      date: row[3] || new Date().toISOString().split('T')[0],
      time: row[4] || undefined,
      type: (row[5] as any) || 'OTHER',
      targetAudience: (row[6] as any) || 'ALL',
      status: (row[7] as any) || 'SCHEDULED',
    };
  }).filter((e: any) => e.id && e.title);

  // Populate cache
  setInCache('residents', residents);
  setInCache('payments', payments);
  setInCache('expenses', expenses);
  setInCache('rules', rules);
  setInCache('craftsmen', craftsmen);
  setInCache('messages', messages);
  setInCache('decisions', decisions);
  setInCache('polls', polls);
  setInCache('complaints', complaints);
  setInCache('maintenance', maintenance);
  setInCache('events', events);

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
      events
    };
  } catch (error) {
    console.warn('Failed to batch fetch all data from Google Sheets, using fallback cache:', error);
    return getFallbackData();
  }
}

// Save Building Rules
export async function saveBuildingRulesSheet(rules: string[]) {
  // Clear original contents first
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Rules!A2:A100:clear`;
  await apiFetch(clearUrl, { method: 'POST' });
  
  const values = rules.map(rule => [rule]);
  await writeSheetRange('Rules!A2', values);
  cache.rules.expiry = 0;
}

// Helper to delete a row by index in a specific Sheet tab
async function deleteSheetRow(sheetTitle: string, rowIndex: number) {
  if (!spreadsheetId || currentAccessToken === 'local-token') return;
  if (sheetIds[sheetTitle] === undefined) {
    await fetchSheetMetadata();
  }
  const sheetId = sheetIds[sheetTitle];
  if (sheetId === undefined) {
    console.warn(`Cannot delete row from ${sheetTitle}: sheetId not found.`);
    return;
  }
  
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const body = {
    requests: [
      {
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      },
    ],
  };
  
  await apiFetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// 2. Google Drive Folder & File Management Service

export function getCachedDriveFolders(): DriveFoldersMap | null {
  if (cachedDriveFolders) return cachedDriveFolders;
  try {
    const bId = (typeof window !== 'undefined' && localStorage.getItem('active_building_id')) || 'pyramids_view_1';
    const raw = localStorage.getItem(`drive_folders_${bId}`) || localStorage.getItem('pyramids_drive_folders_v1');
    if (raw) {
      cachedDriveFolders = JSON.parse(raw);
      return cachedDriveFolders;
    }
  } catch {
    // Ignore error
  }
  return null;
}

export async function ensureDriveFoldersStructure(forceRefresh = false): Promise<DriveFoldersMap> {
  const activeBName = (typeof window !== 'undefined' && (localStorage.getItem('active_building_name') || localStorage.getItem('building_name') || 'بيراميدز فيو ١')) || 'بيراميدز فيو ١';
  const ROOT_FOLDER_NAME = `اتحاد ملاك ${activeBName}`;
  const SUBFOLDERS: Record<string, string> = {
    sheets: 'قواعد البيانات والجداول',
    receipts: 'صور إيصالات السداد',
    expenses: 'صور فواتير المصروفات',
    complaints: 'صور الشكاوى والصيانة',
    chat: 'صور ومرفقات المحادثات',
  };

  const fallbackMap: DriveFoldersMap = {
    rootFolderId: 'local-root-folder',
    rootFolderUrl: 'https://drive.google.com/',
    sheetsFolderId: 'local-sheets-folder',
    sheetsFolderUrl: 'https://drive.google.com/',
    receiptsFolderId: 'local-receipts-folder',
    receiptsFolderUrl: 'https://drive.google.com/',
    expensesFolderId: 'local-expenses-folder',
    expensesFolderUrl: 'https://drive.google.com/',
    complaintsFolderId: 'local-complaints-folder',
    complaintsFolderUrl: 'https://drive.google.com/',
    chatFolderId: 'local-chat-folder',
    chatFolderUrl: 'https://drive.google.com/',
    spreadsheetId: spreadsheetId || 'local-spreadsheet',
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId || 'local-spreadsheet'}/edit`,
  };

  // If not forcing a refresh, reuse cached folder structure if available
  if (!forceRefresh) {
    const existing = getCachedDriveFolders();
    if (existing && existing.rootFolderId && existing.rootFolderId !== 'local-root-folder' && existing.receiptsFolderId) {
      return existing;
    }
  }

  if (!currentAccessToken || currentAccessToken === 'local-token' || currentAccessToken.startsWith('local-')) {
    cachedDriveFolders = fallbackMap;
    localStorage.setItem('pyramids_drive_folders_v1', JSON.stringify(fallbackMap));
    return fallbackMap;
  }

  // If offline, return cached or fallback immediately without attempting network fetch
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = getCachedDriveFolders();
    return cached || fallbackMap;
  }

  try {
    // 1. Find or create Root Folder
    let rootFolderId = '';
    let rootFolderUrl = '';
    const searchRootQ = `name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const rootSearchRes = await apiFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchRootQ)}&fields=files(id,name,webViewLink)`);
    if (rootSearchRes?.files && rootSearchRes.files.length > 0) {
      rootFolderId = rootSearchRes.files[0].id;
      rootFolderUrl = rootSearchRes.files[0].webViewLink || `https://drive.google.com/drive/folders/${rootFolderId}`;
    } else {
      const createRootRes = await apiFetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
        method: 'POST',
        body: JSON.stringify({
          name: ROOT_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      });
      rootFolderId = createRootRes.id;
      rootFolderUrl = createRootRes.webViewLink || `https://drive.google.com/drive/folders/${rootFolderId}`;
    }

    // 2. Find or create Subfolders inside Root Folder
    const subfolderMap: Record<string, { id: string; url: string }> = {};

    for (const [key, folderName] of Object.entries(SUBFOLDERS)) {
      const searchSubQ = `name='${folderName}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const subSearchRes = await apiFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchSubQ)}&fields=files(id,name,webViewLink)`);
      if (subSearchRes?.files && subSearchRes.files.length > 0) {
        subfolderMap[key] = {
          id: subSearchRes.files[0].id,
          url: subSearchRes.files[0].webViewLink || `https://drive.google.com/drive/folders/${subSearchRes.files[0].id}`,
        };
      } else {
        const createSubRes = await apiFetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
          method: 'POST',
          body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [rootFolderId],
          }),
        });
        subfolderMap[key] = {
          id: createSubRes.id,
          url: createSubRes.webViewLink || `https://drive.google.com/drive/folders/${createSubRes.id}`,
        };
      }
    }

    // 3. Move/Place Spreadsheet into 'sheets' subfolder if needed
    if (spreadsheetId && subfolderMap.sheets?.id && !spreadsheetId.startsWith('local-')) {
      try {
        await apiFetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${subfolderMap.sheets.id}&fields=id,parents`, {
          method: 'PATCH',
          body: JSON.stringify({}),
        });
      } catch (e) {
        console.warn('Could not update spreadsheet parent folder:', e);
      }
    }

    const result: DriveFoldersMap = {
      rootFolderId,
      rootFolderUrl,
      sheetsFolderId: subfolderMap.sheets?.id || rootFolderId,
      sheetsFolderUrl: subfolderMap.sheets?.url || rootFolderUrl,
      receiptsFolderId: subfolderMap.receipts?.id || rootFolderId,
      receiptsFolderUrl: subfolderMap.receipts?.url || rootFolderUrl,
      expensesFolderId: subfolderMap.expenses?.id || rootFolderId,
      expensesFolderUrl: subfolderMap.expenses?.url || rootFolderUrl,
      complaintsFolderId: subfolderMap.complaints?.id || rootFolderId,
      complaintsFolderUrl: subfolderMap.complaints?.url || rootFolderUrl,
      chatFolderId: subfolderMap.chat?.id || rootFolderId,
      chatFolderUrl: subfolderMap.chat?.url || rootFolderUrl,
      spreadsheetId: spreadsheetId || '',
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    };

    cachedDriveFolders = result;
    const bId = (typeof window !== 'undefined' && localStorage.getItem('active_building_id')) || 'pyramids_view_1';
    localStorage.setItem(`drive_folders_${bId}`, JSON.stringify(result));
    localStorage.setItem('pyramids_drive_folders_v1', JSON.stringify(result));
    return result;
  } catch (err: any) {
    console.warn('Notice ensuring Google Drive folders (fallback/cached used):', err?.message || err);
    // Return cached or fallback
    const cached = getCachedDriveFolders();
    if (cached) return cached;
    return {
      rootFolderId: '',
      rootFolderUrl: 'https://drive.google.com/',
      sheetsFolderId: '',
      sheetsFolderUrl: 'https://drive.google.com/',
      receiptsFolderId: '',
      receiptsFolderUrl: 'https://drive.google.com/',
      expensesFolderId: '',
      expensesFolderUrl: 'https://drive.google.com/',
      complaintsFolderId: '',
      complaintsFolderUrl: 'https://drive.google.com/',
      chatFolderId: '',
      chatFolderUrl: 'https://drive.google.com/',
      spreadsheetId: spreadsheetId || '',
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    };
  }
}

export async function getCachedOrEnsureDriveFolders(forceRefresh = false): Promise<DriveFoldersMap | null> {
  if (!forceRefresh) {
    const cached = getCachedDriveFolders();
    if (cached && cached.rootFolderId && cached.spreadsheetId) return cached;
  }
  if (!currentAccessToken || currentAccessToken === 'local-token' || currentAccessToken.startsWith('local-')) {
    return getCachedDriveFolders();
  }
  return await ensureDriveFoldersStructure(forceRefresh);
}

// 2. Google Drive File Upload Service
export async function uploadFileToDrive(
  fileName: string, 
  base64Data: string, 
  mimeType: string = 'image/jpeg',
  category?: 'receipts' | 'expenses' | 'complaints' | 'chat' | 'general'
): Promise<string> {
  checkAuth();
  
  // Try to resolve target folder from category or fileName
  let parentFolderId: string | undefined = undefined;
  try {
    const folders = await getCachedOrEnsureDriveFolders();
    if (folders) {
      if (category === 'receipts' || fileName.startsWith('Receipt_')) {
        parentFolderId = folders.receiptsFolderId;
      } else if (category === 'expenses' || fileName.startsWith('Invoice_')) {
        parentFolderId = folders.expensesFolderId;
      } else if (category === 'complaints' || fileName.startsWith('Complaint_')) {
        parentFolderId = folders.complaintsFolderId;
      } else if (category === 'chat' || fileName.startsWith('Chat_')) {
        parentFolderId = folders.chatFolderId;
      } else {
        parentFolderId = folders.rootFolderId;
      }
    }
  } catch (e) {
    console.warn('Could not resolve Drive target folder, uploading to root:', e);
  }

  // Convert base64 back to raw binary data
  const base64Content = base64Data.split(',')[1] || base64Data;
  const byteCharacters = atob(base64Content);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const fileBlob = new Blob([byteArray], { type: mimeType });

  // Drive Multipart Upload endpoint
  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  
  const metadata: any = {
    name: fileName,
    mimeType: mimeType,
  };
  if (parentFolderId && parentFolderId !== 'local-root-folder' && !parentFolderId.startsWith('local-')) {
    metadata.parents = [parentFolderId];
  }
  
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', fileBlob);
  
  const headers = {
    'Authorization': `Bearer ${currentAccessToken}`,
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: form,
  });
  
  if (!response.ok) {
    const errorMsg = await response.text();
    throw new Error(`Google Drive Upload Error: ${errorMsg}`);
  }
  
  const fileData = await response.json();
  const fileId = fileData.id;
  
  // Make file publicly readable so it can be previewed seamlessly
  try {
    const permissionUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
    await fetch(permissionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentAccessToken}`,
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });
  } catch (err) {
    console.warn('Could not set file permission to public:', err);
  }
  
  return fileId;
}

// Craftsmen Management
export async function setAllCraftsmenSheet(craftsmen: Craftsman[]) {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const values = craftsmen.map(c => {
    const commentsJson = c.comments && c.comments.length > 0 ? JSON.stringify(c.comments) : '[]';
    return [c.id, c.name, c.specialty, formatPhoneForSheet(c.phone), c.notes || '', c.addedBy, commentsJson];
  });
  await clearSheetRange('Craftsmen!A2:G1000');
  if (values.length > 0) {
    await writeSheetRange(`Craftsmen!A2:G${values.length + 1}`, values);
  }
  cache.craftsmen.expiry = 0;
}

export async function addCraftsmanSheet(craftsman: Craftsman) {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const commentsJson = craftsman.comments && craftsman.comments.length > 0 ? JSON.stringify(craftsman.comments) : '[]';
  const values = [
    [craftsman.id, craftsman.name, craftsman.specialty, formatPhoneForSheet(craftsman.phone), craftsman.notes || '', craftsman.addedBy, commentsJson]
  ];
  await appendSheetRow('Craftsmen', values);
  cache.craftsmen.expiry = 0;
}

export async function editCraftsmanSheet(craftsman: Craftsman) {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const all = (await batchGetAllData()).craftsmen;
  const rowIndex = all.findIndex(c => c.id === craftsman.id);
  if (rowIndex === -1) throw new Error('لم يتم العثور على الفني لتعديله');
  
  const commentsJson = craftsman.comments && craftsman.comments.length > 0 ? JSON.stringify(craftsman.comments) : '[]';
  const range = `Craftsmen!A${rowIndex + 2}:G${rowIndex + 2}`;
  const values = [
    [craftsman.id, craftsman.name, craftsman.specialty, formatPhoneForSheet(craftsman.phone), craftsman.notes || '', craftsman.addedBy, commentsJson]
  ];
  await writeSheetRange(range, values);
  cache.craftsmen.expiry = 0;
}

export async function deleteCraftsmanSheet(id: string) {
  // Update memory cache immediately
  if (cache.craftsmen.data) {
    cache.craftsmen.data = cache.craftsmen.data.filter(c => c.id !== id);
  }
  cache.craftsmen.expiry = 0;

  // Update local cache immediately
  const localList = getLocalCache<Craftsman[]>('craftsmen');
  if (localList) {
    setLocalCache('craftsmen', localList.filter(c => c.id !== id));
  }

  if (!spreadsheetId || currentAccessToken === 'local-token') return;
  const all = (await batchGetAllData()).craftsmen;
  const rowIndex = all.findIndex(c => c.id === id);
  if (rowIndex === -1) return;

  await deleteSheetRow('Craftsmen', rowIndex + 1);
  cache.craftsmen.expiry = 0;
}

// ----------------------------------------------------
// Chat Messages Sheet Operations
// ----------------------------------------------------
export async function addChatMessageSheet(msg: ChatMessage): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const safeImageUrl = msg.imageUrl && msg.imageUrl.startsWith('data:') ? '' : (msg.imageUrl || '');
  const row = [
    msg.id,
    msg.senderName,
    msg.flatNumber !== undefined ? msg.flatNumber.toString() : '',
    msg.text || '',
    msg.timestamp,
    safeImageUrl,
  ];
  await appendSheetRow('ChatMessages', [row]);
  cache.messages.expiry = 0;
}

export async function setAllChatMessagesSheet(messages: ChatMessage[]): Promise<void> {
  const safeMessages: ChatMessage[] = Array.isArray(messages)
    ? messages
    : Array.isArray((messages as any)?.messages)
    ? (messages as any).messages
    : Array.isArray((messages as any)?.data)
    ? (messages as any).data
    : Array.isArray((messages as any)?.list)
    ? (messages as any).list
    : (messages && typeof messages === 'object' && (messages as any).id ? [messages as any] : []);

  // Update memory and local cache immediately
  cache.messages.data = safeMessages;
  cache.messages.expiry = Date.now() + CACHE_TTL;
  setLocalCache('chat_messages', safeMessages);
  setLocalCache('messages', safeMessages);

  if (!spreadsheetId || currentAccessToken === 'local-token') return;

  await clearSheetRange('ChatMessages!A1:F5000');
  const values = [
    ['ID', 'SenderName', 'FlatNumber', 'Text', 'Timestamp', 'ImageUrl'],
    ...safeMessages.map(m => [
      m.id || '',
      m.senderName || '',
      m.flatNumber !== undefined && m.flatNumber !== null ? m.flatNumber.toString() : '',
      m.text || '',
      m.timestamp || new Date().toISOString(),
      m.imageUrl && m.imageUrl.startsWith('data:') ? '' : (m.imageUrl || ''),
    ])
  ];
  await writeSheetRange('ChatMessages!A1', values);
}

// ----------------------------------------------------
// Admin Decisions Sheet Operations
// ----------------------------------------------------
export async function addAdminDecisionSheet(decision: AdminDecision): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const row = [
    decision.id,
    decision.decisionNumber,
    decision.title,
    decision.description,
    decision.category,
    decision.date,
    decision.effectiveDate || '',
    decision.issuedBy,
    decision.status,
    decision.notes || '',
  ];
  await appendSheetRow('AdminDecisions', [row]);
  cache.decisions.expiry = 0;
}

export async function editAdminDecisionSheet(decision: AdminDecision): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const all = (await batchGetAllData()).decisions;
  const rowIndex = all.findIndex(d => d.id === decision.id);
  if (rowIndex === -1) throw new Error('لم يتم العثور على القرار الإداري.');

  const range = `AdminDecisions!A${rowIndex + 2}:J${rowIndex + 2}`;
  const values = [[
    decision.id,
    decision.decisionNumber,
    decision.title,
    decision.description,
    decision.category,
    decision.date,
    decision.effectiveDate || '',
    decision.issuedBy,
    decision.status,
    decision.notes || '',
  ]];
  await writeSheetRange(range, values);
  cache.decisions.expiry = 0;
}

export async function deleteAdminDecisionSheet(id: string): Promise<void> {
  // Update memory cache immediately
  if (cache.decisions.data) {
    cache.decisions.data = cache.decisions.data.filter(d => d.id !== id);
  }
  cache.decisions.expiry = 0;

  // Update local cache immediately
  const localList = getLocalCache<AdminDecision[]>('admin_decisions') || getLocalCache<AdminDecision[]>('decisions');
  if (localList) {
    const filtered = localList.filter(d => d.id !== id);
    setLocalCache('admin_decisions', filtered);
    setLocalCache('decisions', filtered);
  }

  if (!spreadsheetId || currentAccessToken === 'local-token') return;
  const all = (await batchGetAllData()).decisions;
  const rowIndex = all.findIndex(d => d.id === id);
  if (rowIndex === -1) return;

  await deleteSheetRow('AdminDecisions', rowIndex + 1);
  cache.decisions.expiry = 0;
}

export async function setAllAdminDecisionsSheet(decisions: AdminDecision[]): Promise<void> {
  const safeDecisions: AdminDecision[] = Array.isArray(decisions)
    ? decisions
    : Array.isArray((decisions as any)?.decisions)
    ? (decisions as any).decisions
    : Array.isArray((decisions as any)?.data)
    ? (decisions as any).data
    : (decisions && typeof decisions === 'object' && (decisions as any).id ? [decisions as any] : []);

  await clearSheetRange('AdminDecisions!A1:J2000');
  const values = [
    ['ID', 'DecisionNumber', 'Title', 'Description', 'Category', 'Date', 'EffectiveDate', 'IssuedBy', 'Status', 'Notes'],
    ...safeDecisions.map(d => [
      d.id || '',
      d.decisionNumber || '',
      d.title || '',
      d.description || '',
      d.category || '',
      d.date || '',
      d.effectiveDate || '',
      d.issuedBy || '',
      d.status || '',
      d.notes || '',
    ])
  ];
  await writeSheetRange('AdminDecisions!A1', values);
  cache.decisions.expiry = 0;
}

// ----------------------------------------------------
// Polls & Voting Sheet Operations
// ----------------------------------------------------
export async function addPollSheet(poll: Poll): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const row = [
    poll.id,
    poll.title,
    poll.description,
    JSON.stringify(poll.options || []),
    JSON.stringify(poll.userVotes || {}),
    poll.createdAt,
    poll.endDate,
    poll.status,
  ];
  await appendSheetRow('Polls', [row]);
  cache.polls.expiry = 0;
}

export async function editPollSheet(poll: Poll): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const all = (await batchGetAllData()).polls;
  const rowIndex = all.findIndex(p => p.id === poll.id);
  if (rowIndex === -1) throw new Error('لم يتم العثور على الاستبيان.');

  const range = `Polls!A${rowIndex + 2}:H${rowIndex + 2}`;
  const values = [[
    poll.id,
    poll.title,
    poll.description,
    JSON.stringify(poll.options || []),
    JSON.stringify(poll.userVotes || {}),
    poll.createdAt,
    poll.endDate,
    poll.status,
  ]];
  await writeSheetRange(range, values);
  cache.polls.expiry = 0;
}

export async function deletePollSheet(id: string): Promise<void> {
  // Update memory cache immediately
  if (cache.polls.data) {
    cache.polls.data = cache.polls.data.filter(p => p.id !== id);
  }
  cache.polls.expiry = 0;

  // Update local cache immediately
  const localList = getLocalCache<Poll[]>('polls');
  if (localList) {
    setLocalCache('polls', localList.filter(p => p.id !== id));
  }

  if (!spreadsheetId || currentAccessToken === 'local-token') return;
  const all = (await batchGetAllData()).polls;
  const rowIndex = all.findIndex(p => p.id === id);
  if (rowIndex === -1) return;

  await deleteSheetRow('Polls', rowIndex + 1);
  cache.polls.expiry = 0;
}

export async function setAllPollsSheet(polls: Poll[]): Promise<void> {
  const safePolls: Poll[] = Array.isArray(polls)
    ? polls
    : Array.isArray((polls as any)?.polls)
    ? (polls as any).polls
    : Array.isArray((polls as any)?.data)
    ? (polls as any).data
    : (polls && typeof polls === 'object' && (polls as any).id ? [polls as any] : []);

  await clearSheetRange('Polls!A1:H1000');
  const values = [
    ['ID', 'Title', 'Description', 'Options', 'UserVotes', 'CreatedAt', 'EndDate', 'Status'],
    ...safePolls.map(p => [
      p.id || '',
      p.title || '',
      p.description || '',
      JSON.stringify(p.options || []),
      JSON.stringify(p.userVotes || {}),
      p.createdAt || '',
      p.endDate || '',
      p.status || '',
    ])
  ];
  await writeSheetRange('Polls!A1', values);
  cache.polls.expiry = 0;
}

// ----------------------------------------------------
// Complaints Sheet Operations
// ----------------------------------------------------
export async function addComplaintSheet(complaint: PublicComplaint): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const safeImageUrl = complaint.imageUrl && complaint.imageUrl.startsWith('data:') ? '' : (complaint.imageUrl || '');
  const row = [
    complaint.id,
    complaint.title,
    complaint.description,
    complaint.flatNumber !== undefined ? complaint.flatNumber.toString() : '',
    complaint.residentName,
    complaint.isAnonymous ? 'TRUE' : 'FALSE',
    safeImageUrl,
    complaint.date,
    JSON.stringify(complaint.comments || []),
  ];
  await appendSheetRow('Complaints', [row]);
  cache.complaints.expiry = 0;
}

export async function editComplaintSheet(complaint: PublicComplaint): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const all = (await batchGetAllData()).complaints;
  const rowIndex = all.findIndex(c => c.id === complaint.id);
  if (rowIndex === -1) throw new Error('لم يتم العثور على الشكوى.');

  const safeImageUrl = complaint.imageUrl && complaint.imageUrl.startsWith('data:') ? '' : (complaint.imageUrl || '');
  const range = `Complaints!A${rowIndex + 2}:I${rowIndex + 2}`;
  const values = [[
    complaint.id,
    complaint.title,
    complaint.description,
    complaint.flatNumber !== undefined ? complaint.flatNumber.toString() : '',
    complaint.residentName,
    complaint.isAnonymous ? 'TRUE' : 'FALSE',
    safeImageUrl,
    complaint.date,
    JSON.stringify(complaint.comments || []),
  ]];
  await writeSheetRange(range, values);
  cache.complaints.expiry = 0;
}

export async function deleteComplaintSheet(id: string): Promise<void> {
  // Update memory cache immediately
  if (cache.complaints.data) {
    cache.complaints.data = cache.complaints.data.filter(c => c.id !== id);
  }
  cache.complaints.expiry = 0;

  // Update local cache immediately
  const localList = getLocalCache<PublicComplaint[]>('public_complaints') || getLocalCache<PublicComplaint[]>('complaints');
  if (localList) {
    const filtered = localList.filter(c => c.id !== id);
    setLocalCache('public_complaints', filtered);
    setLocalCache('complaints', filtered);
  }

  if (!spreadsheetId || currentAccessToken === 'local-token') return;
  const all = (await batchGetAllData()).complaints;
  const rowIndex = all.findIndex(c => c.id === id);
  if (rowIndex === -1) return;

  await deleteSheetRow('Complaints', rowIndex + 1);
  cache.complaints.expiry = 0;
}

export async function setAllComplaintsSheet(complaints: PublicComplaint[]): Promise<void> {
  const safeComplaints: PublicComplaint[] = Array.isArray(complaints)
    ? complaints
    : Array.isArray((complaints as any)?.complaints)
    ? (complaints as any).complaints
    : Array.isArray((complaints as any)?.data)
    ? (complaints as any).data
    : (complaints && typeof complaints === 'object' && (complaints as any).id ? [complaints as any] : []);

  await clearSheetRange('Complaints!A1:I2000');
  const values = [
    ['ID', 'Title', 'Description', 'FlatNumber', 'ResidentName', 'IsAnonymous', 'ImageUrl', 'Date', 'Comments'],
    ...safeComplaints.map(c => [
      c.id || '',
      c.title || '',
      c.description || '',
      c.flatNumber !== undefined && c.flatNumber !== null ? c.flatNumber.toString() : '',
      c.residentName || '',
      c.isAnonymous ? 'TRUE' : 'FALSE',
      c.imageUrl && c.imageUrl.startsWith('data:') ? '' : (c.imageUrl || ''),
      c.date || '',
      JSON.stringify(c.comments || []),
    ])
  ];
  await writeSheetRange('Complaints!A1', values);
  cache.complaints.expiry = 0;
}

// ----------------------------------------------------
// Maintenance Requests Sheet Operations
// ----------------------------------------------------
export async function addMaintenanceRequestSheet(req: MaintenanceRequest): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const row = [
    req.id,
    req.flatNumber.toString(),
    req.residentName,
    req.title,
    req.description,
    req.category,
    req.status,
    req.priority,
    req.date,
    req.notes || '',
  ];
  await appendSheetRow('MaintenanceRequests', [row]);
  cache.maintenance.expiry = 0;
}

export async function editMaintenanceRequestSheet(req: MaintenanceRequest): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const all = (await batchGetAllData()).maintenance;
  const rowIndex = all.findIndex(m => m.id === req.id);
  if (rowIndex === -1) throw new Error('لم يتم العثور على طلب الصيانة.');

  const range = `MaintenanceRequests!A${rowIndex + 2}:J${rowIndex + 2}`;
  const values = [[
    req.id,
    req.flatNumber.toString(),
    req.residentName,
    req.title,
    req.description,
    req.category,
    req.status,
    req.priority,
    req.date,
    req.notes || '',
  ]];
  await writeSheetRange(range, values);
  cache.maintenance.expiry = 0;
}

export async function deleteMaintenanceRequestSheet(id: string): Promise<void> {
  // Update memory cache immediately
  if (cache.maintenance.data) {
    cache.maintenance.data = cache.maintenance.data.filter(m => m.id !== id);
  }
  cache.maintenance.expiry = 0;

  // Update local cache immediately
  const localList = getLocalCache<MaintenanceRequest[]>('maintenance');
  if (localList) {
    setLocalCache('maintenance', localList.filter(m => m.id !== id));
  }

  if (!spreadsheetId || currentAccessToken === 'local-token') return;
  const all = (await batchGetAllData()).maintenance;
  const rowIndex = all.findIndex(m => m.id === id);
  if (rowIndex === -1) return;

  await deleteSheetRow('MaintenanceRequests', rowIndex + 1);
  cache.maintenance.expiry = 0;
}

export async function setAllMaintenanceRequestsSheet(reqs: MaintenanceRequest[]): Promise<void> {
  const safeReqs: MaintenanceRequest[] = Array.isArray(reqs)
    ? reqs
    : Array.isArray((reqs as any)?.reqs)
    ? (reqs as any).reqs
    : Array.isArray((reqs as any)?.data)
    ? (reqs as any).data
    : (reqs && typeof reqs === 'object' && (reqs as any).id ? [reqs as any] : []);

  await clearSheetRange('MaintenanceRequests!A1:J2000');
  const values = [
    ['ID', 'FlatNumber', 'ResidentName', 'Title', 'Description', 'Category', 'Status', 'Priority', 'Date', 'Notes'],
    ...safeReqs.map(r => [
      r.id || '',
      r.flatNumber !== undefined && r.flatNumber !== null ? r.flatNumber.toString() : '',
      r.residentName || '',
      r.title || '',
      r.description || '',
      r.category || '',
      r.status || '',
      r.priority || '',
      r.date || '',
      r.notes || '',
    ])
  ];
  await writeSheetRange('MaintenanceRequests!A1', values);
  cache.maintenance.expiry = 0;
}

// ----------------------------------------------------
// Events Sheet Operations
// ----------------------------------------------------
export async function addEventSheet(event: BuildingEvent): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const row = [
    event.id,
    event.title,
    event.description,
    event.date,
    event.time || '',
    event.type,
    event.targetAudience,
    event.status,
  ];
  await appendSheetRow('Events', [row]);
  cache.events.expiry = 0;
}

export async function editEventSheet(event: BuildingEvent): Promise<void> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const all = (await batchGetAllData()).events;
  const rowIndex = all.findIndex(e => e.id === event.id);
  if (rowIndex === -1) throw new Error('لم يتم العثور على الموعد / الفعالية.');

  const range = `Events!A${rowIndex + 2}:H${rowIndex + 2}`;
  const values = [[
    event.id,
    event.title,
    event.description,
    event.date,
    event.time || '',
    event.type,
    event.targetAudience,
    event.status,
  ]];
  await writeSheetRange(range, values);
  cache.events.expiry = 0;
}

export async function deleteEventSheet(id: string): Promise<void> {
  if (!spreadsheetId) return;
  const all = (await batchGetAllData()).events;
  const rowIndex = all.findIndex(e => e.id === id);
  if (rowIndex === -1) return;

  await deleteSheetRow('Events', rowIndex + 1);
  cache.events.expiry = 0;
}

export async function setAllEventsSheet(events: BuildingEvent[]): Promise<void> {
  const safeEvents: BuildingEvent[] = Array.isArray(events)
    ? events
    : Array.isArray((events as any)?.events)
    ? (events as any).events
    : Array.isArray((events as any)?.data)
    ? (events as any).data
    : (events && typeof events === 'object' && (events as any).id ? [events as any] : []);

  await clearSheetRange('Events!A1:H1000');
  const values = [
    ['ID', 'Title', 'Description', 'Date', 'Time', 'Type', 'TargetAudience', 'Status'],
    ...safeEvents.map(e => [
      e.id || '',
      e.title || '',
      e.description || '',
      e.date || '',
      e.time || '',
      e.type || '',
      e.targetAudience || '',
      e.status || '',
    ])
  ];
  await writeSheetRange('Events!A1', values);
  cache.events.expiry = 0;
}

// ----------------------------------------------------
// Save All Communication & Management Data in Bulk
// ----------------------------------------------------
export async function syncAllCommunicationDataToSheets(data: {
  messages?: ChatMessage[];
  decisions?: AdminDecision[];
  polls?: Poll[];
  complaints?: PublicComplaint[];
  maintenance?: MaintenanceRequest[];
  craftsmen?: Craftsman[];
  events?: BuildingEvent[];
}): Promise<void> {
  if (data.messages) await setAllChatMessagesSheet(data.messages);
  if (data.decisions) await setAllAdminDecisionsSheet(data.decisions);
  if (data.polls) await setAllPollsSheet(data.polls);
  if (data.complaints) await setAllComplaintsSheet(data.complaints);
  if (data.maintenance) await setAllMaintenanceRequestsSheet(data.maintenance);
  if (data.events) await setAllEventsSheet(data.events);
  if (data.craftsmen) {
    await clearSheetRange('Craftsmen!A1:G1000');
    const values = [
      ['ID', 'Name', 'Specialty', 'Phone', 'Notes', 'AddedBy', 'Comments'],
      ...data.craftsmen.map(c => [
        c.id,
        c.name,
        c.specialty,
        c.phone,
        c.notes || '',
        c.addedBy,
        c.comments && c.comments.length > 0 ? JSON.stringify(c.comments) : '[]'
      ])
    ];
    await writeSheetRange('Craftsmen!A1', values);
    cache.craftsmen.expiry = 0;
  }
}

// Fetch file as blob for secure preview
export async function getFileBlob(fileId: string): Promise<Blob> {
  checkAuth();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${currentAccessToken}`,
      },
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Google Drive API error (${response.status}):`, errorText);
      if (response.status === 403) {
        throw new Error('صلاحيات غير كافية لعرض الصورة. قد تحتاج لتسجيل الخروج والدخول مجدداً.');
      }
      throw new Error('فشل تحميل ملف الصورة من Google Drive');
    }
    return response.blob();
  } catch (err: any) {
    console.error('Network or API error during getFileBlob:', err);
    throw err;
  }
}

// Fetch JoinRequests
export async function getJoinRequests(): Promise<JoinRequest[]> {
  if (!spreadsheetId) throw new Error('Spreadsheet not initialized');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/JoinRequests!A2:K1000`;
  const result = await apiFetch(url);
  const rows = result.values || [];
  
  return rows.map((row: string[]) => ({
    id: row[0] || '',
    flatNumber: parseSheetInt(row[1]) || 0,
    residentType: (row[2] || 'OWNER') as 'OWNER' | 'TENANT',
    ownerName: row[3] || '',
    ownerPhone: formatMobileNumber(row[4] || ''),
    tenantName: row[5] || '',
    tenantPhone: formatMobileNumber(row[6] || ''),
    email: (row[7] || '').toLowerCase().trim(),
    password: row[8] || '',
    status: (row[9] || 'PENDING') as 'PENDING' | 'APPROVED' | 'DECLINED',
    createdAt: row[10] || '',
  }));
}

// Add JoinRequest
export async function addJoinRequest(req: JoinRequest): Promise<void> {
  const row = [
    req.id,
    req.flatNumber.toString(),
    req.residentType,
    req.ownerName,
    formatPhoneForSheet(req.ownerPhone),
    req.tenantName,
    formatPhoneForSheet(req.tenantPhone),
    req.email.toLowerCase().trim(),
    req.password || '',
    req.status,
    req.createdAt,
  ];
  await appendSheetRow('JoinRequests', [row]);
}

// Update JoinRequest Status
export async function updateJoinRequestStatus(id: string, status: 'APPROVED' | 'DECLINED'): Promise<void> {
  const requests = await getJoinRequests();
  const idx = requests.findIndex(r => r.id === id);
  if (idx === -1) {
    console.warn('تنبيه: طلب الانضمام غير موجود في جدول بيانات جوجل (Google Sheets)، ربما تم تسجيله محلياً فقط.');
    return;
  }
  
  const sheetRowNumber = idx + 2; // offset
  const range = `JoinRequests!J${sheetRowNumber}`;
  await writeSheetRange(range, [[status]]);
}

// Delete JoinRequest
export async function deleteJoinRequestSheet(id: string): Promise<void> {
  const requests = await getJoinRequests();
  const idx = requests.findIndex(r => r.id === id);
  if (idx === -1) {
    console.warn('تنبيه: طلب الانضمام غير موجود في جدول بيانات جوجل (Google Sheets)، ربما تم تسجيله محلياً فقط.');
    return;
  }
  
  const sheetRowNumber = idx + 1; // offset
  await deleteSheetRow('JoinRequests', sheetRowNumber);
}

// Upload JSON Backup file directly to Google Drive
export async function uploadJsonBackupToDrive(jsonString: string, fileName?: string): Promise<string> {
  checkAuth();
  const dateStr = new Date().toISOString().split('T')[0];
  const activeBName = (typeof window !== 'undefined' && (localStorage.getItem('active_building_name') || localStorage.getItem('building_name') || 'Pyramids_View_1')) || 'Pyramids_View_1';
  const cleanBName = activeBName.replace(/\s+/g, '_');
  const finalFileName = fileName || `${cleanBName}_Full_Backup_${dateStr}.json`;

  let parentFolderId: string | undefined = undefined;
  try {
    const folders = await getCachedOrEnsureDriveFolders();
    if (folders && folders.rootFolderId && !folders.rootFolderId.startsWith('local-')) {
      parentFolderId = folders.rootFolderId;
    }
  } catch (e) {
    console.warn('Could not resolve root Drive folder for JSON backup, uploading to Drive root:', e);
  }

  const metadata: any = {
    name: finalFileName,
    mimeType: 'application/json',
  };
  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    jsonString +
    close_delim;

  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAccessToken()}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to upload JSON backup to Google Drive: ${errText || res.statusText}`);
  }

  const data = await res.json();
  return data.id;
}

