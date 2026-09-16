import { createId } from "../lib/ids";
import { strFromU8, strToU8, unzlibSync, zlibSync } from "fflate";
import type { BookOperation, RecipeImage } from "../types/book";
import {
  cacheImageBlob,
  clearCloudAuth,
  getCloudAuth,
  setCloudAuth,
  type PendingImage,
} from "./local-store";
import { getRuntimeConfig, runtimeAssetUrl } from "./runtime-config";
import { fetchWithRetry, fetchWithTimeout, NetworkRequestError, readResponseJson } from "./http";

const DISK_API = "https://cloud-api.yandex.net/v1/disk";
const OPERATIONS_DIR = "app:/operations";
const OPERATION_METADATA_DIR = "app:/operation-metadata-v2";
const IMAGES_DIR = "app:/images";
const METADATA_CHUNK_SIZE = 700;
const OAUTH_STATE_KEY = "maminy-recipes-yandex-oauth-state";
const OAUTH_RETURN_KEY = "maminy-recipes-yandex-oauth-return";
let folderSetup: { token: string; promise: Promise<void> } | null = null;

export class YandexDiskError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "YandexDiskError";
  }
}

async function activeToken(): Promise<string> {
  const auth = await getCloudAuth();
  if (!auth) throw new YandexDiskError("Яндекс Диск не подключён", 401);
  if (auth.expiresAt && auth.expiresAt <= Date.now()) {
    await clearCloudAuth();
    throw new YandexDiskError("Срок входа в Яндекс Диск закончился", 401);
  }
  return auth.accessToken;
}

async function diskRequest(path: string, init?: RequestInit): Promise<Response> {
  const token = await activeToken();
  const response = await fetchWithRetry(`${DISK_API}${path}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `OAuth ${token}`, ...init?.headers },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 404) folderSetup = null;
    if (response.status === 401) await clearCloudAuth();
    let body: { message?: string; error?: string } = {};
    try {
      body = await readResponseJson<{ message?: string; error?: string }>(response, 20000, "api");
    } catch (error) {
      // Preserve a genuine stalled/failed response as a network diagnostic;
      // malformed error payloads still become a safe generic HTTP error.
      if (error instanceof NetworkRequestError) throw error;
    }
    throw new YandexDiskError(body.message || "Яндекс Диск временно недоступен", response.status, body.error);
  }
  return response;
}

function query(values: Record<string, string | number | boolean>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) params.set(key, String(value));
  return params.toString();
}

async function ensureDirectory(path: string): Promise<void> {
  try {
    await diskRequest(`/resources?${query({ path })}`, { method: "PUT" });
  } catch (error) {
    if (!(error instanceof YandexDiskError) || error.status !== 409) throw error;
    // A conflicting file must not be mistaken for a usable directory.
    const response = await diskRequest(`/resources?${query({ path, fields: "type" })}`);
    const resource = await readResponseJson<{ type?: string }>(response, 20000, "api");
    if (resource.type !== "dir") throw new YandexDiskError("Вместо папки книги на Диске находится файл", 409, "DiskExpectedDirectoryError");
  }
}

export async function ensureYandexBookFolders(): Promise<void> {
  const token = await activeToken();
  if (folderSetup?.token === token) return folderSetup.promise;
  const setup = { token, promise: (async () => {
    await ensureDirectory(OPERATIONS_DIR);
    await ensureDirectory(OPERATION_METADATA_DIR);
    await ensureDirectory(IMAGES_DIR);
  })() };
  folderSetup = setup;
  try { await setup.promise; }
  catch (error) { if (folderSetup === setup) folderSetup = null; throw error; }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const standard = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(standard + "=".repeat((4 - standard.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeOperation(operation: BookOperation): string {
  return bytesToBase64Url(zlibSync(strToU8(JSON.stringify(operation)), { level: 9 }));
}

function decodeOperation(value: string): BookOperation {
  const operation = JSON.parse(strFromU8(unzlibSync(base64UrlToBytes(value)))) as unknown;
  if (!operation || typeof operation !== "object" || !("opId" in operation) || !("type" in operation)) throw new Error("Повреждена запись синхронизации");
  return operation as BookOperation;
}

function metadataChunkPath(opId: string, index: number): string {
  const safeName = opId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${OPERATION_METADATA_DIR}/m2-${safeName}-${index.toString(36).padStart(3, "0")}`;
}

async function writeOperationMetadata(operation: BookOperation): Promise<void> {
  await ensureYandexBookFolders();
  const encoded = encodeOperation(operation);
  const chunks = Array.from({ length: Math.ceil(encoded.length / METADATA_CHUNK_SIZE) }, (_, index) => encoded.slice(index * METADATA_CHUNK_SIZE, (index + 1) * METADATA_CHUNK_SIZE));
  if (!chunks.length || chunks.length > 200) throw new Error("Запись рецепта слишком велика для синхронизации");
  for (let index = 0; index < chunks.length; index += 1) {
    const path = metadataChunkPath(operation.opId, index);
    await ensureDirectory(path);
    await diskRequest(`/resources?${query({ path })}`, {
      method: "PATCH",
      body: JSON.stringify({ custom_properties: { v: "2", op: operation.opId, i: String(index), n: String(chunks.length), p: chunks[index] } }),
    });
  }
}

async function requestTransfer(kind: "upload" | "download", path: string): Promise<{ href: string; method?: string }> {
  const values: Record<string, string | boolean> = { path };
  if (kind === "upload") values.overwrite = true;
  const response = await diskRequest(`/resources/${kind}?${query(values)}`);
  return readResponseJson<{ href: string; method?: string }>(response, 25000, "transfer");
}

async function uploadBlob(path: string, blob: Blob, imageId: string, variant: "main" | "thumbnail"): Promise<void> {
  // The very first sync can contain queued recipes/photos before any cloud read.
  await ensureYandexBookFolders();
  const relay = getRuntimeConfig().mediaProxyUrl;
  if (relay) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/u.test(imageId) || !relay.startsWith("https://")) throw new Error("Некорректный адрес синхронизации фотографий");
    const endpoint = new URL(`${encodeURIComponent(imageId)}?variant=${variant}`, `${relay.replace(/\/$/u, "")}/`);
    const response = await fetchWithTimeout(endpoint, {
      method: "PUT",
      headers: { Authorization: `OAuth ${await activeToken()}`, "Content-Type": blob.type || "image/webp" },
      body: blob,
    }, 60000, "upload");
    if (!response.ok) throw new YandexDiskError("Не удалось загрузить фотографию в облако", response.status);
    return;
  }
  const transfer = await requestTransfer("upload", path);
  const response = await fetchWithTimeout(transfer.href, { method: transfer.method || "PUT", body: blob }, 45000, "upload");
  if (!response.ok) throw new YandexDiskError("Не удалось загрузить файл на Яндекс Диск", response.status);
}

async function downloadJson(path: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // Download links are temporary and may point to a different storage host.
    // After a failed transfer, request one fresh link instead of retrying the
    // same possibly stale/blocked URL over and over.
    const transfer = await requestTransfer("download", path);
    try {
      const response = await fetchWithRetry(transfer.href, { cache: "no-store" }, 30000, "download", 1);
      if (!response.ok) throw new YandexDiskError("Не удалось прочитать файл с Яндекс Диска", response.status);
      return await readResponseJson(response, 30000, "download");
    } catch (error) {
      lastError = error;
      const expiredLink = error instanceof YandexDiskError && [401, 403, 404].includes(error.status);
      if (attempt > 0 || (!(error instanceof NetworkRequestError) && !expiredLink)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

export async function uploadYandexOperation(operation: BookOperation): Promise<void> {
  await writeOperationMetadata(operation);
}

interface DiskResourceList {
  _embedded?: { items?: Array<{ name?: string; type?: string; custom_properties?: Record<string, unknown> }> };
}

export async function listYandexOperationIds(): Promise<string[]> {
  const result: string[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const response = await diskRequest(`/resources?${query({ path: OPERATIONS_DIR, limit, offset, fields: "_embedded.items.name,_embedded.items.type" })}`);
    const body = await readResponseJson<DiskResourceList>(response, 20000, "api");
    const items = body._embedded?.items ?? [];
    for (const item of items) if (item.type === "file" && item.name?.endsWith(".json")) result.push(item.name.slice(0, -5));
    if (items.length < limit) break;
    offset += limit;
  }
  return result;
}

export async function listYandexMetadataOperations(): Promise<BookOperation[]> {
  await ensureYandexBookFolders();
  const groups = new Map<string, { total: number; chunks: Map<number, string> }>();
  let offset = 0;
  const limit = 1000;
  while (true) {
    const response = await diskRequest(`/resources?${query({ path: OPERATION_METADATA_DIR, limit, offset, fields: "_embedded.items.name,_embedded.items.type,_embedded.items.custom_properties" })}`);
    const body = await readResponseJson<DiskResourceList>(response, 20000, "api");
    const items = body._embedded?.items ?? [];
    for (const item of items) {
      const properties = item.custom_properties;
      if (item.type !== "dir" || properties?.v !== "2" || typeof properties.op !== "string" || typeof properties.i !== "string" || typeof properties.n !== "string" || typeof properties.p !== "string") continue;
      const index = Number(properties.i);
      const total = Number(properties.n);
      if (!Number.isSafeInteger(index) || !Number.isSafeInteger(total) || index < 0 || total < 1 || total > 200 || index >= total || properties.op.length > 160 || properties.p.length > METADATA_CHUNK_SIZE || !/^[A-Za-z0-9_-]+$/u.test(properties.p)) continue;
      const group = groups.get(properties.op) ?? { total, chunks: new Map<number, string>() };
      if (group.total !== total) continue;
      group.chunks.set(index, properties.p);
      groups.set(properties.op, group);
    }
    if (items.length < limit) break;
    offset += limit;
  }
  const operations: BookOperation[] = [];
  for (const [opId, group] of groups) {
    if (group.chunks.size !== group.total) continue;
    const encoded = Array.from({ length: group.total }, (_, index) => group.chunks.get(index) ?? "").join("");
    const operation = decodeOperation(encoded);
    if (operation.opId !== opId) throw new Error("Повреждена запись синхронизации");
    operations.push(operation);
  }
  return operations;
}

export async function downloadYandexOperation(opId: string): Promise<BookOperation> {
  const safeName = opId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const value = await downloadJson(`${OPERATIONS_DIR}/${safeName}.json`);
  if (!value || typeof value !== "object" || !("opId" in value) || !("type" in value)) throw new Error("Повреждена запись синхронизации");
  return value as BookOperation;
}

export function yandexImageUrl(id: string, variant: "main" | "thumbnail" = "main"): string {
  const url = runtimeAssetUrl(`__images/${encodeURIComponent(id)}`);
  return variant === "thumbnail" ? `${url}?variant=thumbnail` : url;
}

export async function uploadYandexImage(image: PendingImage): Promise<RecipeImage> {
  await Promise.all([
    cacheImageBlob(image.id, "main", image.main),
    cacheImageBlob(image.id, "thumbnail", image.thumbnail),
  ]);
  await uploadBlob(`${IMAGES_DIR}/${image.id}.webp`, image.main, image.id, "main");
  await uploadBlob(`${IMAGES_DIR}/${image.id}-thumb.webp`, image.thumbnail, image.id, "thumbnail");
  return {
    id: image.id,
    kind: image.kind,
    url: yandexImageUrl(image.id),
    thumbnailUrl: yandexImageUrl(image.id, "thumbnail"),
    alt: image.alt,
    width: image.width,
    height: image.height,
    createdAt: image.createdAt,
  };
}

export async function isYandexConnected(): Promise<boolean> {
  try { await activeToken(); return true; }
  catch { return false; }
}

export function isYandexReady(): boolean {
  return Boolean(getRuntimeConfig().yandexClientId);
}

export async function consumeYandexOAuthCallback(): Promise<boolean> {
  if (typeof window === "undefined" || (!location.hash.includes("access_token=") && !location.hash.includes("error="))) return false;
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("access_token");
  const oauthError = params.get("error_description") || params.get("error");
  const returnedState = params.get("state");
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const returnHash = sessionStorage.getItem(OAUTH_RETURN_KEY) || "#settings";
  // Remove the credential from the address immediately, even if local storage fails.
  history.replaceState({}, "", `${location.pathname}${location.search}${returnHash}`);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_RETURN_KEY);
  if (!token || !returnedState || !expectedState || returnedState !== expectedState) {
    throw new Error(oauthError || "Не удалось безопасно завершить вход в Яндекс Диск");
  }
  const expiresIn = Number(params.get("expires_in"));
  await setCloudAuth({ accessToken: token, expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null });
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  return true;
}

export function beginYandexLogin(): void {
  const clientId = getRuntimeConfig().yandexClientId;
  if (!clientId) throw new Error("Подключение Яндекс Диска ещё не настроено");
  const state = createId("oauth");
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  sessionStorage.setItem(OAUTH_RETURN_KEY, location.hash && !location.hash.includes("access_token=") ? location.hash : "#settings");
  const redirectUri = runtimeAssetUrl("");
  const url = new URL("https://oauth.yandex.ru/authorize");
  url.searchParams.set("response_type", "token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "cloud_api:disk.app_folder");
  url.searchParams.set("force_confirm", "yes");
  location.assign(url.toString());
}

export async function disconnectYandex(): Promise<void> {
  await clearCloudAuth();
}
