const CACHE_VERSION = "maminy-recipes-v1.3.4";
const IMAGE_CACHE_LIMIT_BYTES = 24 * 1024 * 1024;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const DB_NAME = "maminy-recipes";
const DB_VERSION = 2;
const DISK_API = "https://cloud-api.yandex.net/v1/disk";

function scoped(path = "") {
  return new URL(path, self.registration.scope).toString();
}

const SHELL = [
  scoped(""),
  scoped("manifest.static.webmanifest"),
  scoped("favicon.svg"),
  scoped("icons/icon-192.png"),
  scoped("icons/icon-512.png"),
  scoped("demo/sharlotka-thumb.webp"),
  scoped("demo/original-turtle-thumb.webp"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("maminy-recipes-") && !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => pruneImageCache().catch(() => undefined))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function openDatabase() {
  return new Promise((resolve, reject) => {
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
    request.onerror = () => reject(request.error);
  });
}

async function readStore(storeName, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function writeStore(storeName, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const request = transaction.objectStore(storeName).put(value);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

async function pruneImageCache() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("imageCache", "readwrite");
    const store = transaction.objectStore("imageCache");
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
      let total = entries.reduce((sum, item) => sum + item.blob.size, 0);
      for (const item of entries) { if (total <= IMAGE_CACHE_LIMIT_BYTES) break; store.delete(item.key); total -= item.blob.size; }
    };
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

function imagePlaceholder() {
  return new Response(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="#f5ead6"/><path d="M270 155h100v110H270z" fill="none" stroke="#8d6b48" stroke-width="12"/><circle cx="300" cy="185" r="13" fill="#8d6b48"/><path d="m280 245 32-38 22 25 18-18 28 31" fill="none" stroke="#8d6b48" stroke-width="10" stroke-linejoin="round"/></svg>',
    { status: 503, headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } },
  );
}

async function yandexImage(requestUrl, relativePath) {
  const id = decodeURIComponent(relativePath.slice("__images/".length));
  const variant = requestUrl.searchParams.get("variant") === "thumbnail" ? "thumbnail" : "main";
  const key = `${id}:${variant}`;
  const cached = await readStore("imageCache", key).catch(() => null);
  if (cached?.blob) {
    await writeStore("imageCache", { ...cached, updatedAt: new Date().toISOString() }).catch(() => undefined);
    return new Response(cached.blob, { headers: { "Content-Type": cached.blob.type || "image/webp", "Cache-Control": "no-store" } });
  }

  const auth = await readStore("auth", "yandex").catch(() => null);
  if (!auth?.accessToken || (auth.expiresAt && auth.expiresAt <= Date.now())) return imagePlaceholder();
  try {
    const suffix = variant === "thumbnail" ? "-thumb" : "";
    const params = new URLSearchParams({ path: `app:/images/${id}${suffix}.webp` });
    const linkResponse = await fetch(`${DISK_API}/resources/download?${params}`, { headers: { Authorization: `OAuth ${auth.accessToken}`, Accept: "application/json" } });
    if (!linkResponse.ok) return imagePlaceholder();
    const { href } = await linkResponse.json();
    const imageResponse = await fetch(href);
    if (!imageResponse.ok) return imagePlaceholder();
    const blob = await imageResponse.blob();
    await writeStore("imageCache", { key, blob, updatedAt: new Date().toISOString() }).catch(() => undefined);
    await pruneImageCache().catch(() => undefined);
    return new Response(blob, { headers: { "Content-Type": blob.type || "image/webp", "Cache-Control": "no-store" } });
  } catch {
    return imagePlaceholder();
  }
}

async function networkFirst(request, fallback) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && request.method === "GET") await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (fallback ? await caches.match(fallback) : undefined) || new Response("Нет подключения к интернету", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await (await caches.open(RUNTIME_CACHE)).put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  const relativePath = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : url.pathname.replace(/^\//, "");
  if (relativePath.startsWith("__images/")) { event.respondWith(yandexImage(url, relativePath)); return; }
  if (relativePath === "runtime-config.js") { event.respondWith(networkFirst(request)); return; }
  if (request.mode === "navigate") { event.respondWith(networkFirst(request, scoped(""))); return; }
  if (url.pathname === "/api/snapshot" || url.pathname.startsWith("/api/images/")) { event.respondWith(networkFirst(request)); return; }
  if (url.pathname.startsWith("/_next/static/") || /\.(?:css|js|svg|png|jpe?g|webp|avif|woff2?)$/i.test(url.pathname)) event.respondWith(cacheFirst(request));
});
