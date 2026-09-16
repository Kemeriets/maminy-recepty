import type { BookOperation, BookSnapshot, RecipeImageKind } from "../types/book";

const DB_NAME = "maminy-recipes";
const DB_VERSION = 2;
export const IMAGE_CACHE_LIMIT_BYTES = 24 * 1024 * 1024;

export interface PendingImage {
  id: string;
  kind: RecipeImageKind;
  main: Blob;
  thumbnail: Blob;
  alt: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface StoredCloudAuth {
  accessToken: string;
  expiresAt: number | null;
}

interface CachedImage {
  key: string;
  blob: Blob;
  updatedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB недоступна"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("snapshot")) db.createObjectStore("snapshot");
      if (!db.objectStoreNames.contains("operations")) db.createObjectStore("operations", { keyPath: "opId" });
      if (!db.objectStoreNames.contains("pendingImages")) db.createObjectStore("pendingImages", { keyPath: "id" });
      if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts");
      if (!db.objectStoreNames.contains("remoteOperations")) db.createObjectStore("remoteOperations", { keyPath: "opId" });
      if (!db.objectStoreNames.contains("auth")) db.createObjectStore("auth");
      if (!db.objectStoreNames.contains("imageCache")) db.createObjectStore("imageCache", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Не удалось открыть локальное хранилище"));
  });
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error ?? new Error("Ошибка локального хранилища"));
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Не удалось сохранить данные на устройстве")); };
  });
}

export async function getLocalSnapshot(): Promise<BookSnapshot | null> {
  return transaction<BookSnapshot | undefined>("snapshot", "readonly", (store) => store.get("current")).then((value) => value ?? null);
}

export async function setLocalSnapshot(snapshot: BookSnapshot): Promise<void> {
  await transaction<IDBValidKey>("snapshot", "readwrite", (store) => store.put(snapshot, "current"));
}

export async function queueOperation(operation: BookOperation): Promise<void> {
  await transaction<IDBValidKey>("operations", "readwrite", (store) => store.put(operation));
}

// Snapshot and its synchronization queue must either both commit or both stay unchanged.
export async function saveSnapshotAndOperations(snapshot: BookSnapshot, operations: BookOperation[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["snapshot", "operations"], "readwrite");
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Не удалось сохранить данные на устройстве")); };
    try {
      tx.objectStore("snapshot").put(snapshot, "current");
      for (const operation of operations) tx.objectStore("operations").put(operation);
    } catch (error) { tx.abort(); reject(error); }
  });
}

export async function listQueuedOperations(): Promise<BookOperation[]> {
  return transaction<BookOperation[]>("operations", "readonly", (store) => store.getAll());
}

export async function removeQueuedOperation(opId: string): Promise<void> {
  await transaction<undefined>("operations", "readwrite", (store) => store.delete(opId));
}

export async function savePendingImage(image: PendingImage): Promise<void> {
  await transaction<IDBValidKey>("pendingImages", "readwrite", (store) => store.put(image));
}

export async function listPendingImages(): Promise<PendingImage[]> {
  return transaction<PendingImage[]>("pendingImages", "readonly", (store) => store.getAll());
}

export async function removePendingImage(id: string): Promise<void> {
  await transaction<undefined>("pendingImages", "readwrite", (store) => store.delete(id));
}

export async function cacheRemoteOperation(operation: BookOperation): Promise<void> {
  await transaction<IDBValidKey>("remoteOperations", "readwrite", (store) => store.put(operation));
}

export async function hasRemoteOperation(opId: string): Promise<boolean> {
  return transaction<BookOperation | undefined>("remoteOperations", "readonly", (store) => store.get(opId)).then(Boolean);
}

export async function listRemoteOperations(): Promise<BookOperation[]> {
  return transaction<BookOperation[]>("remoteOperations", "readonly", (store) => store.getAll());
}

export async function setCloudAuth(auth: StoredCloudAuth): Promise<void> {
  await transaction<IDBValidKey>("auth", "readwrite", (store) => store.put(auth, "yandex"));
}

export async function getCloudAuth(): Promise<StoredCloudAuth | null> {
  return transaction<StoredCloudAuth | undefined>("auth", "readonly", (store) => store.get("yandex")).then((value) => value ?? null);
}

export async function clearCloudAuth(): Promise<void> {
  await transaction<undefined>("auth", "readwrite", (store) => store.delete("yandex"));
}

export async function cacheImageBlob(id: string, variant: "main" | "thumbnail", blob: Blob): Promise<void> {
  const value: CachedImage = { key: `${id}:${variant}`, blob, updatedAt: new Date().toISOString() };
  await transaction<IDBValidKey>("imageCache", "readwrite", (store) => store.put(value));
  await pruneImageCache();
}

export async function pruneImageCache(limit = IMAGE_CACHE_LIMIT_BYTES): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("imageCache", "readwrite");
    const store = tx.objectStore("imageCache");
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = (request.result as CachedImage[]).sort((a, b) => Number(a.key.endsWith(":thumbnail")) - Number(b.key.endsWith(":thumbnail")) || a.updatedAt.localeCompare(b.updatedAt));
      let total = entries.reduce((sum, entry) => sum + entry.blob.size, 0);
      for (const entry of entries) { if (total <= limit) break; store.delete(entry.key); total -= entry.blob.size; }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export async function clearCachedImages(): Promise<void> {
  await transaction<undefined>("imageCache", "readwrite", (store) => store.clear());
}

export async function getCachedImageBlob(id: string, variant: "main" | "thumbnail"): Promise<Blob | null> {
  return transaction<CachedImage | undefined>("imageCache", "readonly", (store) => store.get(`${id}:${variant}`)).then((value) => value?.blob ?? null);
}

export async function saveDraft(key: string, value: unknown): Promise<void> {
  await transaction<IDBValidKey>("drafts", "readwrite", (store) => store.put(value, key));
}

export async function getDraft<T>(key: string): Promise<T | null> {
  return transaction<T | undefined>("drafts", "readonly", (store) => store.get(key)).then((value) => value ?? null);
}

export async function removeDraft(key: string): Promise<void> {
  await transaction<undefined>("drafts", "readwrite", (store) => store.delete(key));
}

export async function clearLocalBookData(): Promise<void> {
  const db = await openDatabase();
  await Promise.all(["snapshot", "operations", "pendingImages", "drafts", "remoteOperations", "imageCache"].map((storeName) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const request = tx.objectStore(storeName).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  })));
  db.close();
}
