import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { cacheImageBlob, cacheRemoteOperation, clearCloudAuth, clearLocalBookData, getCachedImageBlob, getCloudAuth, getDraft, getLocalSnapshot, listQueuedOperations, listRemoteOperations, queueOperation, saveDraft, saveSnapshotAndOperations, setCloudAuth, setLocalSnapshot } from "../services/local-store";
import { createDemoSnapshot } from "../features/book/demo-data";
import type { BookOperation } from "../types/book";

describe("локальное offline-хранилище", () => {
  beforeEach(async () => { await clearLocalBookData().catch(() => undefined); await clearCloudAuth().catch(() => undefined); });
  it("сохраняет книгу между открытиями", async () => {
    const snapshot = createDemoSnapshot();
    await setLocalSnapshot(snapshot);
    expect((await getLocalSnapshot())?.recipes.length).toBe(snapshot.recipes.length);
  });
  it("не теряет ожидающую синхронизации операцию", async () => {
    await queueOperation({ opId: "offline-1", type: "recipe.favorite", recipeId: "recipe_sharlotka", favorite: true, createdAt: new Date().toISOString() });
    expect(await listQueuedOperations()).toHaveLength(1);
  });
  it("отдельно хранит уже полученные облачные операции", async () => {
    const operation = { opId: "remote-1", type: "recipe.favorite" as const, recipeId: "recipe_sharlotka", favorite: true, createdAt: new Date().toISOString() };
    await cacheRemoteOperation(operation);
    expect(await listRemoteOperations()).toEqual([operation]);
  });
  it("хранит вход и локальную копию облачной фотографии", async () => {
    await setCloudAuth({ accessToken: "test-token", expiresAt: null });
    const image = new Blob(["image"], { type: "image/webp" });
    await cacheImageBlob("image-1", "thumbnail", image);
    expect(await getCloudAuth()).toEqual({ accessToken: "test-token", expiresAt: null });
    expect((await getCachedImageBlob("image-1", "thumbnail"))?.type).toBe("image/webp");
  });
  it("фиксирует книгу и очередь синхронизации одной транзакцией", async () => {
    const snapshot = createDemoSnapshot();
    const operation: BookOperation = { opId: "atomic-1", type: "recipe.favorite", recipeId: snapshot.recipes[0].id, favorite: true, createdAt: new Date().toISOString() };
    await saveSnapshotAndOperations(snapshot, [operation]);
    expect(await getLocalSnapshot()).toEqual(snapshot);
    expect(await listQueuedOperations()).toEqual([operation]);
  });
  it("не изменяет книгу, если очередь не смогла сохраниться", async () => {
    const snapshot = createDemoSnapshot();
    await setLocalSnapshot(snapshot);
    const changed = { ...snapshot, recipes: [] };
    const invalid = { type: "recipe.favorite", recipeId: snapshot.recipes[0].id, favorite: true, createdAt: new Date().toISOString() } as BookOperation;
    await expect(saveSnapshotAndOperations(changed, [invalid])).rejects.toBeDefined();
    expect(await getLocalSnapshot()).toEqual(snapshot);
    expect(await listQueuedOperations()).toEqual([]);
  });
  it("сохраняет в черновике текст и прикреплённые фотографии", async () => {
    const draft = { values: { title: "Кекс" }, coverImage: { id: "draft-photo", url: "data:image/webp;base64,dGVzdA==" }, originalImages: [] };
    await saveDraft("recipe:new", draft);
    expect(await getDraft("recipe:new")).toEqual(draft);
  });
});
