import { createId } from "../lib/ids";
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
const IMAGES_DIR = "app:/images";
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
    await ensureDirectory(IMAGES_DIR);
  })() };
  folderSetup = setup;
  try { await setup.promise; }
  catch (error) { if (folderSetup === setup) folderSetup = null; throw error; }
}

async function requestTransfer(kind: "upload" | "download", path: string): Promise<{ href: string; method?: string }> {
  const values: Record<string, string | boolean> = { path };
  if (kind === "upload") values.overwrite = true;
  const response = await diskRequest(`/resources/${kind}?${query(values)}`);
  return readResponseJson<{ href: string; method?: string }>(response, 25000, "transfer");
}

async function uploadBlob(path: string, blob: Blob): Promise<void> {
  // The very first sync can contain queued recipes/photos before any cloud read.
  await ensureYandexBookFolders();
  const transfer = await requestTransfer("upload", path);
  const response = await fetchWithTimeout(transfer.href, { method: transfer.method || "PUT", body: blob }, 45000, "upload");
  if (!response.ok) throw new YandexDiskError("Не удалось загрузить файл на Яндекс Диск", response.status);
}

async function downloadJson(path: string): Promise<unknown> {
  const transfer = await requestTransfer("download", path);
  const response = await fetchWithRetry(transfer.href, { cache: "no-store" }, 30000, "download");
  if (!response.ok) throw new YandexDiskError("Не удалось прочитать файл с Яндекс Диска", response.status);
  return readResponseJson(response, 30000, "download");
}

export async function uploadYandexOperation(operation: BookOperation): Promise<void> {
  const safeName = operation.opId.replace(/[^a-zA-Z0-9_-]/g, "_");
  await uploadBlob(`${OPERATIONS_DIR}/${safeName}.json`, new Blob([JSON.stringify(operation)], { type: "application/json" }));
}

interface DiskResourceList {
  _embedded?: { items?: Array<{ name?: string; type?: string }> };
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
  await uploadBlob(`${IMAGES_DIR}/${image.id}.webp`, image.main);
  await uploadBlob(`${IMAGES_DIR}/${image.id}-thumb.webp`, image.thumbnail);
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
