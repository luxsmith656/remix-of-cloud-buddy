// IndexedDB cache for scanner data so the app remains usable offline.
// We cache batches + products so the barcode scanner can resolve lookups
// without network. Other modules can extend the same store as needed.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

interface CBSchema extends DBSchema {
  batches: {
    key: string; // normalized barcode token
    value: {
      token: string;
      batch: Record<string, unknown>;
      cachedAt: number;
    };
    indexes: { "by-cached": number };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown; updatedAt: number };
  };
}

let dbPromise: Promise<IDBPDatabase<CBSchema>> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB<CBSchema>("ellines-food-product-scanner", 1, {
      upgrade(db) {
        const batches = db.createObjectStore("batches", { keyPath: "token" });
        batches.createIndex("by-cached", "cachedAt");
        db.createObjectStore("meta", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

export async function cacheBatch(token: string, batch: Record<string, unknown>) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.put("batches", { token, batch, cachedAt: Date.now() });
  } catch (err) {
    console.warn("[offlineCache] cacheBatch failed", err);
  }
}

export async function cacheBatches(rows: Array<{ token: string; batch: Record<string, unknown> }>) {
  try {
    const db = await getDb();
    if (!db) return;
    const tx = db.transaction("batches", "readwrite");
    const now = Date.now();
    await Promise.all(rows.map((row) => tx.store.put({ ...row, cachedAt: now })));
    await tx.done;
    await setMeta("batches:lastSync", now);
  } catch (err) {
    console.warn("[offlineCache] cacheBatches failed", err);
  }
}

export async function getCachedBatch(token: string) {
  try {
    const db = await getDb();
    if (!db) return null;
    return (await db.get("batches", token)) ?? null;
  } catch {
    return null;
  }
}

export async function setMeta(key: string, value: unknown) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.put("meta", { key, value, updatedAt: Date.now() });
  } catch {
    /* noop */
  }
}

export async function getMeta<T = unknown>(key: string): Promise<T | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const row = await db.get("meta", key);
    return (row?.value as T) ?? null;
  } catch {
    return null;
  }
}
