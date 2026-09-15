import { applyOperation } from "../features/book/logic";
import { createDemoSnapshot } from "../features/book/demo-data";
import { createId, nowIso } from "../lib/ids";
import {
  cacheRemoteOperation,
  hasRemoteOperation,
  getLocalSnapshot,
  listPendingImages,
  listQueuedOperations,
  listRemoteOperations,
  queueOperation,
  removePendingImage,
  removeQueuedOperation,
  setLocalSnapshot,
  saveSnapshotAndOperations,
} from "../services/local-store";
import { uploadPendingImage } from "../services/image-service";
import { getRuntimeConfig } from "../services/runtime-config";
import {
  beginYandexLogin,
  consumeYandexOAuthCallback,
  disconnectYandex,
  downloadYandexOperation,
  ensureYandexBookFolders,
  isYandexConnected,
  isYandexReady,
  listYandexOperationIds,
  uploadYandexImage,
  uploadYandexOperation,
  yandexImageUrl,
} from "../services/yandex-disk-service";
import type { BookOperation, BookOperationInput, BookSnapshot, Recipe, RecipeImage } from "../types/book";

export interface RepositoryLoadResult {
  snapshot: BookSnapshot;
  remote: boolean;
}

export interface RecipeRepository {
  load(): Promise<RepositoryLoadResult>;
  refresh(): Promise<BookSnapshot | null>;
  persist(snapshot: BookSnapshot, operation: BookOperation): Promise<boolean>;
  persistMany(snapshot: BookSnapshot, operations: BookOperation[]): Promise<boolean>;
  flush(snapshot: BookSnapshot): Promise<BookSnapshot>;
  provider(): "sites" | "yandex-disk" | "local";
  cloudReady(): boolean;
  cloudConnected(): Promise<boolean>;
  consumeLogin(): Promise<boolean>;
  connectCloud(): void;
  disconnectCloud(): Promise<void>;
}

function replaceImage(recipe: Recipe, localId: string, remote: RecipeImage): Recipe {
  let changed = false;
  const coverImage = recipe.coverImage?.id === localId ? (changed = true, remote) : recipe.coverImage;
  const originalPageImages = recipe.originalPageImages.map((image) => image.id === localId ? (changed = true, remote) : image);
  const steps = recipe.steps.map((step) => step.image?.id === localId ? (changed = true, { ...step, image: remote }) : step);
  return changed ? { ...recipe, coverImage, originalPageImages, steps, updatedAt: nowIso(), revision: recipe.revision + 1 } : recipe;
}

async function fetchSnapshot(): Promise<BookSnapshot> {
  const response = await fetch("/api/snapshot", { headers: { Accept: "application/json" }, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as { snapshot?: BookSnapshot; error?: string };
  if (!response.ok || !body.snapshot) throw new Error(body.error ?? "Семейная книга временно недоступна");
  return body.snapshot;
}

async function sendOperations(operations: BookOperation[]): Promise<void> {
  for (let offset = 0; offset < operations.length; offset += 50) {
    const response = await fetch("/api/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ operations: operations.slice(offset, offset + 50) }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Не удалось сохранить изменения");
  }
}

function normalizeYandexImage(image: RecipeImage | null | undefined): RecipeImage | null {
  if (!image) return null;
  return { ...image, url: yandexImageUrl(image.id), thumbnailUrl: yandexImageUrl(image.id, "thumbnail") };
}

function normalizeYandexOperation(operation: BookOperation): BookOperation {
  if (operation.type !== "recipe.upsert") return operation;
  return {
    ...operation,
    recipe: {
      ...operation.recipe,
      coverImage: normalizeYandexImage(operation.recipe.coverImage),
      originalPageImages: operation.recipe.originalPageImages.map((image) => normalizeYandexImage(image)!),
      steps: operation.recipe.steps.map((step) => ({ ...step, image: normalizeYandexImage(step.image) })),
    },
  };
}

async function fetchYandexSnapshot(): Promise<BookSnapshot> {
  await ensureYandexBookFolders();
  const ids = await listYandexOperationIds();
  for (const id of ids) {
    if (await hasRemoteOperation(id)) continue;
    const operation = normalizeYandexOperation(await downloadYandexOperation(id));
    await cacheRemoteOperation(operation);
  }
  const operations = (await listRemoteOperations()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.opId.localeCompare(b.opId));
  let snapshot = createDemoSnapshot("yandex-family");
  for (const operation of operations) snapshot = applyOperation(snapshot, operation);
  return { ...snapshot, syncedAt: nowIso() };
}

export class HybridRecipeRepository implements RecipeRepository {
  provider(): "sites" | "yandex-disk" | "local" { return getRuntimeConfig().provider; }
  cloudReady(): boolean { return this.provider() === "sites" || (this.provider() === "yandex-disk" && isYandexReady()); }
  async cloudConnected(): Promise<boolean> { return this.provider() === "sites" ? true : this.provider() === "yandex-disk" ? isYandexConnected() : false; }
  async consumeLogin(): Promise<boolean> { return this.provider() === "yandex-disk" ? consumeYandexOAuthCallback() : false; }
  connectCloud(): void {
    if (this.provider() !== "yandex-disk") throw new Error("Облачное подключение недоступно");
    beginYandexLogin();
  }
  async disconnectCloud(): Promise<void> { if (this.provider() === "yandex-disk") await disconnectYandex(); }

  async load(): Promise<RepositoryLoadResult> {
    const local = await getLocalSnapshot().catch(() => null);
    if (local) {
      return { snapshot: local, remote: false };
    }
    if (this.provider() === "local" || (this.provider() === "yandex-disk" && !(await isYandexConnected()))) {
      const demo = createDemoSnapshot();
      await setLocalSnapshot(demo).catch(() => undefined);
      return { snapshot: demo, remote: false };
    }
    try {
      const remote = this.provider() === "yandex-disk" ? await fetchYandexSnapshot() : await fetchSnapshot();
      await setLocalSnapshot(remote);
      return { snapshot: remote, remote: true };
    } catch {
      const demo = createDemoSnapshot();
      await setLocalSnapshot(demo).catch(() => undefined);
      return { snapshot: demo, remote: false };
    }
  }

  async refresh(): Promise<BookSnapshot | null> {
    if (this.provider() === "local" || (this.provider() === "yandex-disk" && !(await isYandexConnected()))) return null;
    try {
      const snapshot = this.provider() === "yandex-disk" ? await fetchYandexSnapshot() : await fetchSnapshot();
      await setLocalSnapshot(snapshot);
      return snapshot;
    } catch {
      return null;
    }
  }

  async persist(snapshot: BookSnapshot, operation: BookOperation): Promise<boolean> {
    await saveSnapshotAndOperations(snapshot, [operation]);
    if (this.provider() === "local" || (this.provider() === "yandex-disk" && !(await isYandexConnected()))) return false;
    try {
      if (this.provider() === "yandex-disk") {
        const hasLocalImage = operation.type === "recipe.upsert" && [operation.recipe.coverImage, ...operation.recipe.originalPageImages, ...operation.recipe.steps.map((step) => step.image)].some((image) => image?.url.startsWith("data:"));
        if (hasLocalImage) return true;
        const normalized = normalizeYandexOperation(operation);
        await uploadYandexOperation(normalized);
        await cacheRemoteOperation(normalized);
      } else await sendOperations([operation]);
      await removeQueuedOperation(operation.opId);
      return true;
    } catch {
      return false;
    }
  }

  async persistMany(snapshot: BookSnapshot, operations: BookOperation[]): Promise<boolean> {
    await saveSnapshotAndOperations(snapshot, operations);
    if (this.provider() === "local" || (this.provider() === "yandex-disk" && !(await isYandexConnected()))) return false;
    try {
      if (this.provider() === "yandex-disk") {
        const hasLocalImages = operations.some((operation) => operation.type === "recipe.upsert" && [operation.recipe.coverImage, ...operation.recipe.originalPageImages, ...operation.recipe.steps.map((step) => step.image)].some((image) => image?.url.startsWith("data:")));
        if (hasLocalImages) return true;
        for (const operation of operations) {
          const normalized = normalizeYandexOperation(operation);
          await uploadYandexOperation(normalized);
          await cacheRemoteOperation(normalized);
          await removeQueuedOperation(operation.opId);
        }
      } else {
        await sendOperations(operations);
        await Promise.all(operations.map((operation) => removeQueuedOperation(operation.opId)));
      }
      return true;
    } catch {
      return false;
    }
  }

  async flush(snapshot: BookSnapshot): Promise<BookSnapshot> {
    const provider = this.provider();
    if (provider === "local" || (provider === "yandex-disk" && !(await isYandexConnected()))) {
      await setLocalSnapshot(snapshot);
      return snapshot;
    }
    let working = snapshot;
    const pendingImages = await listPendingImages().catch(() => []);
    for (const pending of pendingImages) {
      try {
        const remoteImage = provider === "yandex-disk" ? await uploadYandexImage(pending) : await uploadPendingImage(pending);
        const changedRecipes = working.recipes.map((recipe) => replaceImage(recipe, pending.id, remoteImage));
        const updates = changedRecipes.filter((recipe, index) => recipe !== working.recipes[index]);
        working = { ...working, recipes: changedRecipes };
        for (const recipe of updates) {
          const operation: BookOperation = { opId: createId("op"), type: "recipe.upsert", recipe, createdAt: nowIso() };
          working = applyOperation(working, operation);
          await queueOperation(operation);
        }
        await removePendingImage(pending.id);
      } catch {
        await setLocalSnapshot(working);
        throw new Error(provider === "yandex-disk" ? "Не удалось загрузить фотографию в Яндекс Диск" : "Не удалось загрузить фотографию");
      }
    }

    const queued = (await listQueuedOperations()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const operation of queued) {
      try {
        if (provider === "yandex-disk") {
          const normalized = normalizeYandexOperation(operation);
          await uploadYandexOperation(normalized);
          await cacheRemoteOperation(normalized);
        } else await sendOperations([operation]);
        await removeQueuedOperation(operation.opId);
      } catch {
        if (provider === "yandex-disk") {
          await setLocalSnapshot(working);
          throw new Error("Не удалось синхронизировать книгу с Яндекс Диском");
        }
        break;
      }
    }
    const remote = await this.refresh();
    if (remote) return remote;
    await setLocalSnapshot(working);
    return working;
  }
}

export function makeOperation(operation: BookOperationInput): BookOperation {
  return { ...operation, opId: createId("op"), createdAt: nowIso() } as BookOperation;
}
