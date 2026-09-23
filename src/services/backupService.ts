import * as firestoreService from './firestoreService';
import * as offlineSync from './offlineSync';
import { exportMonthlyExcelBackup } from './excelService';
import { 
  Resident, 
  Payment, 
  Expense, 
  AppConfig
} from '../types';

export interface BackupProgress {
  status: 'idle' | 'syncing' | 'success' | 'error';
  message: string;
  step: number;
  totalSteps: number;
  details?: string;
  timestamp?: string;
}

/**
 * Clean 100% Firebase Cloud Backup & Local JSON Generator
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
    version: '3.0',
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
  const bName = (config?.buildingName || 'Pyramids_View_1').replace(/\s+/g, '_');
  a.href = url;
  a.download = `نسخة_احتياطية_${bName}_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Restore from JSON backup file directly into Firebase Firestore & local cache
 */
export async function restoreFromJsonBackup(
  jsonContent: string,
  onProgress?: (msg: string) => void
): Promise<{ restoredCounts: Record<string, number> }> {
  const parsed = JSON.parse(jsonContent);
  const data = parsed.data || parsed;

  const counts: Record<string, number> = {};

  if (Array.isArray(data.residents) && data.residents.length > 0) {
    onProgress?.(`جاري استعادة ${data.residents.length} من بيانات السكان إلى Firebase...`);
    await firestoreService.saveBatchResidentsToFirestore(data.residents);
    offlineSync.saveCachedData('residents', data.residents);
    counts['residents'] = data.residents.length;
  }

  if (Array.isArray(data.payments) && data.payments.length > 0) {
    onProgress?.(`جاري استعادة ${data.payments.length} من سجلات التحصيلات إلى Firebase...`);
    for (const p of data.payments) {
      await firestoreService.savePaymentToFirestore(p);
    }
    offlineSync.saveCachedData('payments', data.payments);
    counts['payments'] = data.payments.length;
  }

  if (Array.isArray(data.expenses) && data.expenses.length > 0) {
    onProgress?.(`جاري استعادة ${data.expenses.length} من سجلات المصروفات إلى Firebase...`);
    for (const e of data.expenses) {
      await firestoreService.saveExpenseToFirestore(e);
    }
    offlineSync.saveCachedData('expenses', data.expenses);
    counts['expenses'] = data.expenses.length;
  }

  if (Array.isArray(data.maintenance) && data.maintenance.length > 0) {
    onProgress?.(`جاري استعادة طلبات الصيانة إلى Firebase...`);
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
    for (const pol of data.polls) {
      await firestoreService.savePollToFirestore(pol);
    }
    offlineSync.saveCachedData('polls', data.polls);
    counts['polls'] = data.polls.length;
  }

  if (Array.isArray(data.events) && data.events.length > 0) {
    for (const ev of data.events) {
      await firestoreService.saveEventToFirestore(ev);
    }
    offlineSync.saveCachedData('events', data.events);
    counts['events'] = data.events.length;
  }

  if (Array.isArray(data.craftsmen) && data.craftsmen.length > 0) {
    for (const cr of data.craftsmen) {
      await firestoreService.saveCraftsmanToFirestore(cr);
    }
    offlineSync.saveCachedData('craftsmen', data.craftsmen);
    counts['craftsmen'] = data.craftsmen.length;
  }

  if (data.config) {
    await firestoreService.saveConfigToFirestore(data.config);
    offlineSync.saveCachedData('config', data.config);
  }

  if (Array.isArray(data.rules)) {
    await firestoreService.saveRulesToFirestore(data.rules);
    offlineSync.saveCachedData('rules', { rules: data.rules });
  }

  return { restoredCounts: counts };
}

export { exportMonthlyExcelBackup };
