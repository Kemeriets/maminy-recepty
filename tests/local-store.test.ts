import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { cacheImageBlob, cacheRemoteOperation, clearCloudAuth, clearLocalBookData, getCachedImageBlob, getCloudAuth, getLocalSnapshot, listQueuedOperations, listRemoteOperations, queueOperation, setCloudAuth, setLocalSnapshot } from "../services/local-store";
import { createDemoSnapshot } from "../features/book/demo-data";

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
});
