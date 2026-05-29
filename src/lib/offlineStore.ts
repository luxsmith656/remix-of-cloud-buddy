import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { supabase } from "@/integrations/supabase/client";

export type SyncStatus = "Saved Offline" | "Pending Sync" | "Syncing" | "Synced" | "Sync Failed";
export type SyncActionType = "table-upsert" | "table-delete" | "rpc";

export type SyncQueueItem = {
  id: string;
  module: string;
  actionType: SyncActionType;
  table?: string;
  rpcName?: string;
  payload: Record<string, unknown>;
  localId?: string;
  userId?: string | null;
  expectedUpdatedAt?: string | null;
  createdAt: string;
  status: SyncStatus;
  error?: string | null;
};

interface OfflineSchema extends DBSchema {
  table_rows: {
    key: string;
    value: {
      key: string;
      table: string;
      id: string;
      row: Record<string, unknown>;
      cachedAt: number;
      pending?: boolean;
      deleted?: boolean;
    };
    indexes: { "by-table": string };
  };
  sync_queue: {
    key: string;
    value: SyncQueueItem;
    indexes: { "by-status": SyncStatus; "by-created": string };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown; updatedAt: number };
  };
}

const DB_NAME = "ellines-food-product-offline";
const DB_VERSION = 1;
const listeners = new Set<() => void>();
let dbPromise: Promise<IDBPDatabase<OfflineSchema>> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeOfflineSync(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getDb() {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB<OfflineSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const rows = db.createObjectStore("table_rows", { keyPath: "key" });
        rows.createIndex("by-table", "table");
        const queue = db.createObjectStore("sync_queue", { keyPath: "id" });
        queue.createIndex("by-status", "status");
        queue.createIndex("by-created", "createdAt");
        db.createObjectStore("meta", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

function rowKey(table: string, id: string) {
  return `${table}:${id}`;
}

function createLocalId() {
  return `local-${crypto.randomUUID()}`;
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export async function cacheTable(table: string, rows: Array<Record<string, unknown>>) {
  const db = await getDb();
  if (!db) return;
  const tx = db.transaction(["table_rows", "meta"], "readwrite");
  const now = Date.now();
  await Promise.all(rows.filter((row) => row.id).map((row) => tx.objectStore("table_rows").put({
    key: rowKey(table, String(row.id)),
    table,
    id: String(row.id),
    row,
    cachedAt: now,
    pending: false,
    deleted: false,
  })));
  await tx.objectStore("meta").put({ key: `${table}:lastSync`, value: now, updatedAt: now });
  await tx.done;
}

export async function getCachedTable<T = Record<string, unknown>>(table: string): Promise<T[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllFromIndex("table_rows", "by-table", table);
  return rows
    .filter((entry) => !entry.deleted)
    .sort((a, b) => b.cachedAt - a.cachedAt)
    .map((entry) => entry.row as T);
}

export async function upsertCachedRow(table: string, row: Record<string, unknown>, pending = false) {
  const db = await getDb();
  if (!db) return;
  const id = String(row.id || createLocalId());
  const nextRow = { ...row, id, sync_status: pending ? "Pending Sync" : "Synced" };
  await db.put("table_rows", {
    key: rowKey(table, id),
    table,
    id,
    row: nextRow,
    cachedAt: Date.now(),
    pending,
    deleted: false,
  });
  emit();
}

export async function markCachedRowDeleted(table: string, id: string) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.get("table_rows", rowKey(table, id));
  await db.put("table_rows", {
    key: rowKey(table, id),
    table,
    id,
    row: existing?.row || { id, sync_status: "Pending Sync" },
    cachedAt: Date.now(),
    pending: true,
    deleted: true,
  });
  emit();
}

export async function queueSyncAction(item: Omit<SyncQueueItem, "id" | "createdAt" | "status">) {
  const db = await getDb();
  if (!db) throw new Error("Offline storage is not available in this browser");
  const queued: SyncQueueItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "Pending Sync",
    error: null,
  };
  await db.put("sync_queue", queued);
  emit();
  return queued;
}

export async function getQueuedActions() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllFromIndex("sync_queue", "by-created");
  return rows.filter((row) => row.status !== "Synced");
}

export async function getPendingSyncCount() {
  const rows = await getQueuedActions();
  return rows.filter((row) => row.status === "Pending Sync" || row.status === "Saved Offline" || row.status === "Syncing").length;
}

export async function setOfflineMeta(key: string, value: unknown) {
  const db = await getDb();
  if (!db) return;
  await db.put("meta", { key, value, updatedAt: Date.now() });
}

export async function getOfflineMeta<T = unknown>(key: string): Promise<T | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db.get("meta", key);
  return (row?.value as T) ?? null;
}

async function syncTableUpsert(item: SyncQueueItem) {
  const table = item.table;
  if (!table) throw new Error("Missing table name");
  const payload = { ...item.payload };
  const id = String(payload.id || item.localId || "");
  delete payload.sync_status;

  if (item.expectedUpdatedAt && id && !id.startsWith("local-")) {
    const { data, error } = await (supabase as any).from(table).select("updated_at").eq("id", id).maybeSingle();
    if (error) throw error;
    if (data?.updated_at && data.updated_at !== item.expectedUpdatedAt) {
      throw new Error("Conflict detected: this record changed online before your offline edit synced.");
    }
  }

  if (id && !id.startsWith("local-")) {
    const { error } = await (supabase as any).from(table).update(payload).eq("id", id);
    if (error) throw error;
  } else {
    delete payload.id;
    const { data, error } = await (supabase as any).from(table).insert(payload).select().single();
    if (error) throw error;
    if (data) await upsertCachedRow(table, data as Record<string, unknown>, false);
  }
}

async function syncTableDelete(item: SyncQueueItem) {
  if (!item.table || !item.localId) throw new Error("Missing delete target");
  if (item.localId.startsWith("local-")) return;
  const { error } = await (supabase as any).from(item.table).delete().eq("id", item.localId);
  if (error) throw error;
}

async function syncRpc(item: SyncQueueItem) {
  if (!item.rpcName) throw new Error("Missing RPC name");
  const { error } = await supabase.rpc(item.rpcName as any, item.payload as any);
  if (error) throw error;
}

export async function processSyncQueue() {
  if (!isOnline()) return { synced: 0, failed: 0 };
  const db = await getDb();
  if (!db) return { synced: 0, failed: 0 };
  const rows = (await db.getAllFromIndex("sync_queue", "by-created")).filter((row) => row.status !== "Synced");
  let synced = 0;
  let failed = 0;

  for (const item of rows) {
    await db.put("sync_queue", { ...item, status: "Syncing", error: null });
    emit();
    try {
      if (item.actionType === "table-upsert") await syncTableUpsert(item);
      if (item.actionType === "table-delete") await syncTableDelete(item);
      if (item.actionType === "rpc") await syncRpc(item);
      await db.put("sync_queue", { ...item, status: "Synced", error: null });
      synced += 1;
    } catch (error: any) {
      await db.put("sync_queue", { ...item, status: "Sync Failed", error: error?.message || "Sync failed" });
      failed += 1;
    }
    emit();
  }

  return { synced, failed };
}

export async function syncCoreTables() {
  if (!isOnline()) return;
  const configs = [
    { table: "products", select: "*" },
    { table: "ingredients", select: "*" },
    { table: "batches", select: "*, products(name, category, variant, shelf_life, unit_price)" },
    { table: "recipes", select: "*, recipe_ingredients(*, ingredients(*)), products(*)" },
    { table: "suppliers", select: "*" },
    { table: "ingredient_receipts", select: "*, ingredients(name, unit), suppliers(name)" },
    { table: "product_dispatches", select: "*, products(name, variant), batches(batch_code, production_date, expiration_date)" },
    { table: "stock_movements", select: "*" },
    { table: "inventory_adjustment_requests", select: "*" },
    { table: "audit_logs", select: "*" },
  ];

  await Promise.all(configs.map(async ({ table, select }) => {
    const { data, error } = await (supabase as any).from(table).select(select).limit(500);
    if (!error && data) await cacheTable(table, data as Array<Record<string, unknown>>);
  }));
}

export async function readWithOfflineCache<T extends Record<string, unknown>>(
  table: string,
  fetcher: () => Promise<T[]>,
) {
  if (!isOnline()) return getCachedTable<T>(table);
  try {
    const rows = await fetcher();
    await cacheTable(table, rows);
    return rows;
  } catch (error) {
    const cached = await getCachedTable<T>(table);
    if (cached.length) return cached;
    throw error;
  }
}
