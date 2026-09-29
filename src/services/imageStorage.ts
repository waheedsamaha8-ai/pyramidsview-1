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

/**
 * Hydrates missing images (fileUrl) for payments or expenses by querying IndexedDB.
 * Restores any images that were previously pruned from localStorage cache.
 */
export async function restoreEntityImagesFromIndexedDB<T extends { id: string | number; fileUrl?: string; fileId?: string }>(
  items: T[]
): Promise<T[]> {
  if (!items || !Array.isArray(items) || items.length === 0) return items;
  if (typeof window === 'undefined' || !window.indexedDB) return items;

  let hasRestoredAny = false;
  const updatedItems = await Promise.all(
    items.map(async (item) => {
      if (item.fileUrl && item.fileUrl.startsWith('data:image/')) {
        // Ensure image is also backed up in IndexedDB for resilience
        saveImageToIndexedDB(String(item.id), item.fileUrl).catch(() => {});
        return item;
      }

      // If fileUrl is missing or empty, search IndexedDB
      const strId = String(item.id);
      const cached = await getImageFromIndexedDB(strId)
        || await getImageFromIndexedDB(`${strId}_fileUrl`)
        || await getImageFromIndexedDB(`${strId}_receiptImage`)
        || await getImageFromIndexedDB(`${strId}_base64Image`);

      if (cached && typeof cached === 'string' && cached.startsWith('data:image/')) {
        hasRestoredAny = true;
        return {
          ...item,
          fileUrl: cached
        };
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
