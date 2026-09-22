import * as googleApi from './googleApi';
import * as firestoreService from './firestoreService';
import * as offlineSync from './offlineSync';
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
  Craftsman 
} from '../types';

export interface BackupProgress {
  status: 'idle' | 'syncing' | 'success' | 'error';
  message: string;
  step: number;
  totalSteps: number;
  details?: string;
  timestamp?: string;
}

export interface BackupSummary {
  residentsCount: number;
  paymentsCount: number;
  expensesCount: number;
  maintenanceCount: number;
  decisionsCount: number;
  pollsCount: number;
  complaintsCount: number;
  craftsmenCount?: number;
  eventsCount?: number;
  chatCount?: number;
  imagesBackedUp: number;
  spreadsheetUrl?: string;
  driveFolderUrl?: string;
}

/**
 * Perform a full backup of all app data, tables, and images to Google Sheets & Google Drive
 */
export async function performGoogleBackup(
  onProgress?: (progress: BackupProgress) => void
): Promise<BackupSummary> {
  const token = googleApi.getAccessToken();
  if (!token || token === 'local-token') {
    throw new Error('يرجى تسجيل الدخول بحساب Google أولاً لتفعيل النسخ الاحتياطي على Google Drive و Sheets.');
  }

  onProgress?.({
    status: 'syncing',
    message: 'جاري تهيئة مجلدات Google Drive وجداول Google Sheets...',
    step: 1,
    totalSteps: 6,
  });

  // 1. Ensure Drive folder structure exists
  const driveFolders = await googleApi.ensureDriveFoldersStructure();

  // 2. Initialize spreadsheet
  onProgress?.({
    status: 'syncing',
    message: 'جاري ربط وتحديث قاعدة بيانات جداول Google Sheets...',
    step: 2,
    totalSteps: 6,
  });
  await googleApi.initializeSpreadsheet();

  // 3. Fetch all current data from Firestore/memory
  onProgress?.({
    status: 'syncing',
    message: 'جاري قراءة جميع السجلات والجداول من Firebase Firestore...',
    step: 3,
    totalSteps: 6,
  });

  const [
    residents,
    payments,
    expenses,
    maintenance,
    decisions,
    polls,
    complaints,
    craftsmen,
    events,
    messages,
    config,
    rules
  ] = await Promise.all([
    firestoreService.getResidentsFromFirestore(),
    firestoreService.getPaymentsFromFirestore(),
    firestoreService.getExpensesFromFirestore(),
    firestoreService.getMaintenanceFromFirestore(),
    firestoreService.getDecisionsFromFirestore(),
    firestoreService.getPollsFromFirestore(),
    firestoreService.getComplaintsFromFirestore(),
    firestoreService.getCraftsmenFromFirestore(),
    firestoreService.getEventsFromFirestore(),
    firestoreService.getChatMessagesFromFirestore(),
    firestoreService.getConfigFromFirestore(),
    firestoreService.getRulesFromFirestore()
  ]);

  // 4. Backup images to Google Drive
  onProgress?.({
    status: 'syncing',
    message: 'جاري فحص ونسخ صور الإيصالات والفواتير إلى Google Drive...',
    step: 4,
    totalSteps: 6,
  });

  let imagesBackedUp = 0;
  for (const p of payments) {
    if (p.fileId && p.fileId.startsWith('data:image')) {
      try {
        const uploadedId = await googleApi.uploadFileToDrive(
          `Receipt_Flat_${p.flatNumber}_${p.receiptNumber || p.id}`,
          p.fileId,
          'image/jpeg'
        );
        p.fileId = uploadedId;
        await firestoreService.savePaymentToFirestore(p);
        imagesBackedUp++;
      } catch (err) {
        console.warn('Could not backup payment image to drive:', err);
      }
    }
  }

  for (const e of expenses) {
    if (e.fileId && e.fileId.startsWith('data:image')) {
      try {
        const uploadedId = await googleApi.uploadFileToDrive(
          `Invoice_${e.expenseType}_${e.id}`,
          e.fileId,
          'image/jpeg'
        );
        e.fileId = uploadedId;
        await firestoreService.saveExpenseToFirestore(e);
        imagesBackedUp++;
      } catch (err) {
        console.warn('Could not backup expense image to drive:', err);
      }
    }
  }

  // 5. Sync tables into Google Sheets
  onProgress?.({
    status: 'syncing',
    message: 'جاري كتابة وتحديث جداول البيانات في Google Sheets...',
    step: 5,
    totalSteps: 6,
  });

  // Write all collections into Google Sheets
  try {
    if (residents.length > 0) await googleApi.setAllResidentsSheet(residents);
    if (config) await googleApi.saveAppConfig(config);
    if (rules && rules.length > 0) await googleApi.saveBuildingRulesSheet(rules);
    if (craftsmen.length > 0) await googleApi.setAllCraftsmenSheet(craftsmen);
    if (decisions.length > 0) await googleApi.setAllAdminDecisionsSheet(decisions);
    if (polls.length > 0) await googleApi.setAllPollsSheet(polls);
    if (complaints.length > 0) await googleApi.setAllComplaintsSheet(complaints);
    if (maintenance.length > 0) await googleApi.setAllMaintenanceRequestsSheet(maintenance);
    if (events.length > 0) await googleApi.setAllEventsSheet(events);
    if (messages.length > 0) await googleApi.setAllChatMessagesSheet(messages);

    // Save individual payments & expenses
    for (const pay of payments) {
      try {
        await googleApi.addPaymentSheet(pay);
      } catch {}
    }
    for (const exp of expenses) {
      try {
        await googleApi.addExpenseSheet(exp);
      } catch {}
    }
  } catch (sheetErr) {
    console.warn('Warning during batch sheet backup:', sheetErr);
  }

  // 6. Complete
  const summary: BackupSummary = {
    residentsCount: residents.length,
    paymentsCount: payments.length,
    expensesCount: expenses.length,
    maintenanceCount: maintenance.length,
    decisionsCount: decisions.length,
    pollsCount: polls.length,
    complaintsCount: complaints.length,
    craftsmenCount: craftsmen.length,
    eventsCount: events.length,
    chatCount: messages.length,
    imagesBackedUp,
    spreadsheetUrl: driveFolders?.spreadsheetUrl,
    driveFolderUrl: driveFolders?.rootFolderUrl
  };

  const backupMeta = {
    lastBackupDate: new Date().toISOString(),
    summary
  };
  localStorage.setItem('pyramids_last_google_backup', JSON.stringify(backupMeta));

  onProgress?.({
    status: 'success',
    message: 'تم إتمام النسخ الاحتياطي السحابي بنجاح على Google Drive و Google Sheets!',
    step: 6,
    totalSteps: 6,
    timestamp: new Date().toISOString(),
    details: `تم نسخ ${residents.length} ساكن، ${payments.length} إيصال، ${expenses.length} مصروف، و ${imagesBackedUp} صورة بنجاح.`
  });

  return summary;
}

/**
 * Restore from Google Sheets & Drive backup into Firebase Firestore and local cache
 */
export async function restoreFromGoogleBackup(
  onProgress?: (msg: string) => void
): Promise<{ restoredCounts: Record<string, number> }> {
  const token = googleApi.getAccessToken();
  if (!token || token === 'local-token') {
    throw new Error('يرجى تسجيل الدخول بحساب Google لاستعادة النسخة الاحتياطية من Google Sheets.');
  }

  onProgress?.('جاري قراءة البيانات من Google Sheets...');
  const data = await googleApi.batchGetAllData();

  const counts: Record<string, number> = {};

  if (Array.isArray(data.residents) && data.residents.length > 0) {
    onProgress?.(`جاري استعادة ${data.residents.length} من بيانات السكان إلى Firebase Firestore...`);
    await firestoreService.saveBatchResidentsToFirestore(data.residents);
    offlineSync.saveCachedData('residents', data.residents);
    counts['residents'] = data.residents.length;
  }

  if (Array.isArray(data.payments) && data.payments.length > 0) {
    onProgress?.(`جاري استعادة ${data.payments.length} من سجلات التحصيلات إلى Firebase Firestore...`);
    for (const p of data.payments) {
      await firestoreService.savePaymentToFirestore(p);
    }
    offlineSync.saveCachedData('payments', data.payments);
    counts['payments'] = data.payments.length;
  }

  if (Array.isArray(data.expenses) && data.expenses.length > 0) {
    onProgress?.(`جاري استعادة ${data.expenses.length} من سجلات المصروفات إلى Firebase Firestore...`);
    for (const e of data.expenses) {
      await firestoreService.saveExpenseToFirestore(e);
    }
    offlineSync.saveCachedData('expenses', data.expenses);
    counts['expenses'] = data.expenses.length;
  }

  if (Array.isArray(data.rules) && data.rules.length > 0) {
    await firestoreService.saveRulesToFirestore(data.rules);
    offlineSync.saveCachedData('rules', { rules: data.rules });
  }

  if (Array.isArray(data.craftsmen) && data.craftsmen.length > 0) {
    for (const c of data.craftsmen) {
      await firestoreService.saveCraftsmanToFirestore(c);
    }
    offlineSync.saveCachedData('craftsmen', data.craftsmen);
    counts['craftsmen'] = data.craftsmen.length;
  }

  if (Array.isArray(data.decisions) && data.decisions.length > 0) {
    for (const d of data.decisions) {
      await firestoreService.saveDecisionToFirestore(d);
    }
    offlineSync.saveCachedData('admin_decisions', data.decisions);
    counts['decisions'] = data.decisions.length;
  }

  if (Array.isArray(data.polls) && data.polls.length > 0) {
    for (const p of data.polls) {
      await firestoreService.savePollToFirestore(p);
    }
    offlineSync.saveCachedData('polls', data.polls);
    counts['polls'] = data.polls.length;
  }

  if (Array.isArray(data.complaints) && data.complaints.length > 0) {
    for (const comp of data.complaints) {
      await firestoreService.saveComplaintToFirestore(comp);
    }
    offlineSync.saveCachedData('public_complaints', data.complaints);
    counts['complaints'] = data.complaints.length;
  }

  if (Array.isArray(data.maintenance) && data.maintenance.length > 0) {
    for (const m of data.maintenance) {
      await firestoreService.saveMaintenanceToFirestore(m);
    }
    offlineSync.saveCachedData('maintenance', data.maintenance);
    counts['maintenance'] = data.maintenance.length;
  }

  if (Array.isArray(data.events) && data.events.length > 0) {
    for (const ev of data.events) {
      await firestoreService.saveEventToFirestore(ev);
    }
    offlineSync.saveCachedData('events', data.events);
    counts['events'] = data.events.length;
  }

  return { restoredCounts: counts };
}

/**
 * Generate and download a complete local JSON backup file of all collections
 */
export async function downloadLocalJsonBackup(): Promise<void> {
  const [
    residents,
    payments,
    expenses,
    maintenance,
    decisions,
    polls,
    events,
    craftsmen,
    complaints,
    messages,
    config,
    rules
  ] = await Promise.all([
    firestoreService.getResidentsFromFirestore(),
    firestoreService.getPaymentsFromFirestore(),
    firestoreService.getExpensesFromFirestore(),
    firestoreService.getMaintenanceFromFirestore(),
    firestoreService.getDecisionsFromFirestore(),
    firestoreService.getPollsFromFirestore(),
    firestoreService.getEventsFromFirestore(),
    firestoreService.getCraftsmenFromFirestore(),
    firestoreService.getComplaintsFromFirestore(),
    firestoreService.getChatMessagesFromFirestore(),
    firestoreService.getConfigFromFirestore(),
    firestoreService.getRulesFromFirestore()
  ]);

  const backupPayload = {
    version: '2.0',
    appName: 'بيراميدز فيو 1 - اتحاد الملاك',
    createdAt: new Date().toISOString(),
    building: {
      address: 'عمارة بيراميدز فيو 1 - هضبة الأهرام',
      boardPresident: 'أ/ وحيد سماحة (شقة 207)',
    },
    data: {
      residents,
      payments,
      expenses,
      maintenance,
      decisions,
      polls,
      events,
      craftsmen,
      complaints,
      messages,
      config,
      rules
    }
  };

  const jsonStr = JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `Pyramids_View_1_Backup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Restore from JSON backup file into Firestore & local cache
 */
export async function restoreFromJsonBackup(
  jsonContent: string,
  onProgress?: (msg: string) => void
): Promise<{ restoredCounts: Record<string, number> }> {
  const parsed = JSON.parse(jsonContent);
  const data = parsed.data || parsed;

  const counts: Record<string, number> = {};

  if (Array.isArray(data.residents) && data.residents.length > 0) {
    onProgress?.(`جاري استعادة ${data.residents.length} من بيانات السكان...`);
    await firestoreService.saveBatchResidentsToFirestore(data.residents);
    offlineSync.saveCachedData('residents', data.residents);
    counts['residents'] = data.residents.length;
  }

  if (Array.isArray(data.payments) && data.payments.length > 0) {
    onProgress?.(`جاري استعادة ${data.payments.length} من سجلات التحصيلات...`);
    for (const p of data.payments) {
      await firestoreService.savePaymentToFirestore(p);
    }
    offlineSync.saveCachedData('payments', data.payments);
    counts['payments'] = data.payments.length;
  }

  if (Array.isArray(data.expenses) && data.expenses.length > 0) {
    onProgress?.(`جاري استعادة ${data.expenses.length} من سجلات المصروفات...`);
    for (const e of data.expenses) {
      await firestoreService.saveExpenseToFirestore(e);
    }
    offlineSync.saveCachedData('expenses', data.expenses);
    counts['expenses'] = data.expenses.length;
  }

  if (Array.isArray(data.maintenance) && data.maintenance.length > 0) {
    onProgress?.(`جاري استعادة طلبات الصيانة...`);
    for (const m of data.maintenance) {
      await firestoreService.saveMaintenanceToFirestore(m);
    }
    offlineSync.saveCachedData('maintenance', data.maintenance);
    counts['maintenance'] = data.maintenance.length;
  }

  if (Array.isArray(data.decisions) && data.decisions.length > 0) {
    for (const d of data.decisions) {
      await firestoreService.saveDecisionToFirestore(d);
    }
    offlineSync.saveCachedData('admin_decisions', data.decisions);
    counts['decisions'] = data.decisions.length;
  }

  if (Array.isArray(data.polls) && data.polls.length > 0) {
    for (const p of data.polls) {
      await firestoreService.savePollToFirestore(p);
    }
    offlineSync.saveCachedData('polls', data.polls);
    counts['polls'] = data.polls.length;
  }

  if (Array.isArray(data.craftsmen) && data.craftsmen.length > 0) {
    for (const c of data.craftsmen) {
      await firestoreService.saveCraftsmanToFirestore(c);
    }
    offlineSync.saveCachedData('craftsmen', data.craftsmen);
    counts['craftsmen'] = data.craftsmen.length;
  }

  if (Array.isArray(data.events) && data.events.length > 0) {
    for (const ev of data.events) {
      await firestoreService.saveEventToFirestore(ev);
    }
    offlineSync.saveCachedData('events', data.events);
    counts['events'] = data.events.length;
  }

  if (Array.isArray(data.complaints) && data.complaints.length > 0) {
    for (const comp of data.complaints) {
      await firestoreService.saveComplaintToFirestore(comp);
    }
    offlineSync.saveCachedData('public_complaints', data.complaints);
    counts['complaints'] = data.complaints.length;
  }

  if (data.config) {
    await firestoreService.saveConfigToFirestore(data.config);
    offlineSync.saveCachedData('config', data.config);
  }

  if (data.rules && Array.isArray(data.rules)) {
    await firestoreService.saveRulesToFirestore(data.rules);
    offlineSync.saveCachedData('rules', { rules: data.rules });
  }

  return { restoredCounts: counts };
}
