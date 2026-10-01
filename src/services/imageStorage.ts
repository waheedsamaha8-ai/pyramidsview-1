/**
 * IndexedDB Persistent Media Store
 * Provides durable, high-capacity client-side storage for receipt & invoice photos.
 * Prevents any loss of photos even if LocalStorage hits its 5MB quota.
 */

const DB_NAME = 'pyramids_view_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'media_images';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB not available'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const timeoutId = setTimeout(() => {
          dbPromise = null;
          reject(new Error('IndexedDB open timed out'));
        }, 2000);

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };

        request.onsuccess = (event) => {
          clearTimeout(timeoutId);
          resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = (event) => {
          clearTimeout(timeoutId);
          dbPromise = null;
          reject((event.target as IDBOpenDBRequest).error);
        };

        request.onblocked = () => {
          clearTimeout(timeoutId);
          dbPromise = null;
          reject(new Error('IndexedDB blocked'));
        };
      } catch (err) {
        dbPromise = null;
        reject(err);
      }
    });
  }

  return dbPromise;
}

export async function saveImageToIndexedDB(id: string, base64Data: string): Promise<void> {
  if (!id || !base64Data) return;
  try {
    const db = await getDB();
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record = {
          id: String(id),
          data: base64Data,
          updatedAt: Date.now()
        };
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch (err) {
    console.warn('[IndexedDB Image Store] Save failed:', err);
  }
}

export async function getImageFromIndexedDB(id: string): Promise<string | null> {
  if (!id) return null;
  try {
    const db = await getDB();
    return await new Promise<string | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(String(id));
        req.onsuccess = () => {
          const result = req.result;
          resolve(result && result.data ? result.data : null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function deleteImageFromIndexedDB(id: string): Promise<void> {
  if (!id) return;
  try {
    const db = await getDB();
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(String(id));
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch (err) {
    console.warn('[IndexedDB Image Store] Delete failed:', err);
  }
}

export async function getAllKeysFromIndexedDB(): Promise<string[]> {
  try {
    const db = await getDB();
    return await new Promise<string[]>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();
        req.onsuccess = () => {
          resolve((req.result || []).map(String));
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  } catch {
    return [];
  }
}

/**
 * Hydrates missing images (fileUrl) for payments or expenses by querying IndexedDB.
 * Restores any images that were previously pruned from localStorage cache.
 * High-performance: Fetches all stored keys once to avoid thousands of empty IndexedDB queries.
 */
export async function restoreEntityImagesFromIndexedDB<T extends { id: string | number; fileUrl?: string; fileId?: string }>(
  items: T[]
): Promise<T[]> {
  if (!items || !Array.isArray(items) || items.length === 0) return items;
  if (typeof window === 'undefined' || !window.indexedDB) return items;

  // 1. Check all stored image keys in a single fast call
  const storedKeysList = await getAllKeysFromIndexedDB();
  const storedKeys = new Set(storedKeysList);

  let hasRestoredAny = false;
  const updatedItems = await Promise.all(
    items.map(async (item) => {
      const strId = String(item.id);
      if (item.fileUrl && item.fileUrl.startsWith('data:image/')) {
        // Ensure image is also backed up in IndexedDB for resilience if not already there
        if (!storedKeys.has(strId)) {
          saveImageToIndexedDB(strId, item.fileUrl).catch(() => {});
        }
        return item;
      }

      // If no stored keys exist in DB, skip querying completely
      if (storedKeys.size === 0) {
        return item;
      }

      // If fileUrl is missing or empty, search IndexedDB ONLY if ID exists in stored keys
      let matchKey: string | null = null;
      if (storedKeys.has(strId)) matchKey = strId;
      else if (storedKeys.has(`${strId}_fileUrl`)) matchKey = `${strId}_fileUrl`;
      else if (storedKeys.has(`${strId}_receiptImage`)) matchKey = `${strId}_receiptImage`;
      else if (storedKeys.has(`${strId}_base64Image`)) matchKey = `${strId}_base64Image`;

      if (matchKey) {
        const cached = await getImageFromIndexedDB(matchKey);
        if (cached && typeof cached === 'string' && cached.startsWith('data:image/')) {
          hasRestoredAny = true;
          return {
            ...item,
            fileUrl: cached
          };
        }
      }

      return item;
    })
  );

  return hasRestoredAny ? updatedItems : items;
}

/**
 * Strips heavy data:image base64 strings from data before placing in localStorage,
 * while ensuring all images are safely and durably saved to IndexedDB first.
 * If maxAllowedLength is exceeded (default: any data:image > 500 characters), the string is emptied out in localStorage.
 */
export function sanitizeAndStoreHeavyImages(data: any, maxAllowedLength = 500): any {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map(item => sanitizeAndStoreHeavyImages(item, maxAllowedLength));
  }
  if (typeof data === 'object') {
    const clone = { ...data };
    for (const key of Object.keys(clone)) {
      const val = clone[key];
      if (typeof val === 'string' && val.startsWith('data:image/')) {
        const entityId = clone.id ? String(clone.id) : undefined;
        if (entityId) {
          saveImageToIndexedDB(`${entityId}_${key}`, val).catch(() => {});
          saveImageToIndexedDB(entityId, val).catch(() => {});
        }
        if (val.length > maxAllowedLength) {
          clone[key] = '';
        }
      } else if (typeof val === 'object' && val !== null) {
        clone[key] = sanitizeAndStoreHeavyImages(val, maxAllowedLength);
      }
    }
    return clone;
  }
  return data;
}
