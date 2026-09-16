import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookOperation, RecipeImage } from "../types/book";
import { createDemoSnapshot } from "../features/book/demo-data";
import { HybridRecipeRepository } from "../repositories/recipe-repository";
import { cacheRemoteOperation, clearLocalBookData, getLocalSnapshot, listPendingImages, listQueuedOperations, queueOperation, savePendingImage, setLocalSnapshot } from "../services/local-store";
import { downloadYandexOperation, isYandexConnected, listYandexMetadataOperations, listYandexOperationIds, uploadYandexImage, uploadYandexOperation } from "../services/yandex-disk-service";

vi.mock("../services/yandex-disk-service", () => ({
  beginYandexLogin: vi.fn(), consumeYandexOAuthCallback: vi.fn(), disconnectYandex: vi.fn(),
  ensureYandexBookFolders: vi.fn(), isYandexConnected: vi.fn(), isYandexReady: vi.fn(() => true),
  downloadYandexOperation: vi.fn(), listYandexMetadataOperations: vi.fn(), listYandexOperationIds: vi.fn(), uploadYandexImage: vi.fn(), uploadYandexOperation: vi.fn(),
  yandexImageUrl: (id: string, variant = "main") => `https://example.ru/recipes/__images/${id}${variant === "thumbnail" ? "?variant=thumbnail" : ""}`,
}));

describe("синхронизация с Яндекс Диском", () => {
  const cloud = new Map<string, BookOperation>();
  const legacyCloud = new Map<string, BookOperation>();
  const repository = new HybridRecipeRepository();
  beforeEach(async () => {
    await clearLocalBookData(); vi.clearAllMocks(); cloud.clear(); legacyCloud.clear();
    vi.stubGlobal("window", { __MAMINY_RECIPES_CONFIG__: { provider: "yandex-disk", assetBase: "./", yandexClientId: "a".repeat(32) } });
    vi.stubGlobal("document", { baseURI: "https://example.ru/recipes/" });
    vi.mocked(isYandexConnected).mockResolvedValue(true);
    vi.mocked(uploadYandexOperation).mockImplementation(async (operation) => { cloud.set(operation.opId, operation); });
    vi.mocked(listYandexMetadataOperations).mockImplementation(async () => [...cloud.values()]);
    vi.mocked(listYandexOperationIds).mockImplementation(async () => [...legacyCloud.keys()]);
    vi.mocked(downloadYandexOperation).mockImplementation(async (id) => legacyCloud.get(id)!);
  });
  afterEach(() => vi.unstubAllGlobals());
  const customOperation = (): BookOperation => ({ opId: "new-recipe", createdAt: "2026-09-15T00:00:00Z", type: "recipe.upsert", recipe: { ...createDemoSnapshot().recipes[0], id: "custom", title: "Мой пирог", isDemo: false } });
  it("переносит локально созданный рецепт и сохраняет работающие демо-фото", async () => {
    const snapshot = createDemoSnapshot(); const operation = customOperation();
    await repository.persist({ ...snapshot, recipes: [operation.type === "recipe.upsert" ? operation.recipe : snapshot.recipes[0], ...snapshot.recipes] }, operation);
    const result = await repository.flush((await getLocalSnapshot())!);
    expect(result.recipes.find((recipe) => recipe.id === "custom")?.coverImage?.url).toContain("/demo/sharlotka.webp");
    expect(await listQueuedOperations()).toHaveLength(0);
  });
  it("не затирает неотправленные изменения при получении облачных данных", async () => {
    const operation = customOperation(); await queueOperation(operation);
    const result = await repository.refresh();
    expect(result?.recipes.some((recipe) => recipe.id === "custom")).toBe(true);
    expect(await listQueuedOperations()).toHaveLength(1);
  });
  it("не показывает успешную синхронизацию, если получение данных не удалось", async () => {
    const snapshot = createDemoSnapshot(); await setLocalSnapshot(snapshot);
    vi.mocked(listYandexOperationIds).mockRejectedValueOnce(new Error("Нет сети"));
    await expect(repository.flush(snapshot)).rejects.toThrow("Не удалось получить изменения");
    expect(await getLocalSnapshot()).toEqual(snapshot);
    expect(repository.getLastSyncError()).toBeInstanceOf(Error);
  });
  it("сохраняет исходную причину отказа и не теряет накопленную очередь", async () => {
    const snapshot = createDemoSnapshot(); const operation = customOperation();
    const failure = new Error("API отказал");
    await setLocalSnapshot(snapshot); await queueOperation(operation);
    vi.mocked(uploadYandexOperation).mockRejectedValueOnce(failure);
    await expect(repository.flush(snapshot)).rejects.toHaveProperty("cause", failure);
    expect(repository.getLastSyncError()).toBe(failure);
    expect(await listQueuedOperations()).toHaveLength(1);
    expect(await getLocalSnapshot()).toEqual(snapshot);
  });
  it("не применяет историю другого аккаунта из локального кэша", async () => {
    await cacheRemoteOperation(customOperation());
    const result = await repository.refresh();
    expect(result?.recipes.some((recipe) => recipe.id === "custom")).toBe(false);
  });
  it("переносит старую облачную запись из проверенного локального кэша без скачивания файла", async () => {
    const operation = customOperation();
    legacyCloud.set(operation.opId, operation);
    await cacheRemoteOperation(operation);
    vi.mocked(downloadYandexOperation).mockRejectedValue(new TypeError("CDN недоступен"));
    const result = await repository.refresh();
    expect(result?.recipes.some((recipe) => recipe.id === "custom")).toBe(true);
    expect(uploadYandexOperation).toHaveBeenCalledWith(expect.objectContaining({ opId: operation.opId }));
    expect(downloadYandexOperation).not.toHaveBeenCalled();
  });
  it("не отправляет фотографию несохранённого черновика", async () => {
    const blob = new Blob(["draft"], { type: "image/webp" });
    await savePendingImage({ id: "draft-photo", kind: "cover", main: blob, thumbnail: blob, alt: "", width: 10, height: 10, createdAt: "2026-09-15" });
    await repository.flush(createDemoSnapshot());
    expect(uploadYandexImage).not.toHaveBeenCalled();
    expect(await listPendingImages()).toHaveLength(1);
  });
  it("сохраняет фото и очередь при ошибке, а после повтора удаляет только отправленный файл", async () => {
    const snapshot = createDemoSnapshot(); const raw = customOperation();
    if (raw.type !== "recipe.upsert") throw new Error("fixture");
    const blob = new Blob(["photo"], { type: "image/webp" });
    const image: RecipeImage = { id: "photo", kind: "cover", url: "data:image/webp;base64,cGhvdG8=", thumbnailUrl: "data:image/webp;base64,cGhvdG8=", createdAt: raw.createdAt };
    raw.recipe.coverImage = image;
    const working = { ...snapshot, recipes: [raw.recipe, ...snapshot.recipes] };
    await savePendingImage({ ...image, main: blob, thumbnail: blob, alt: "", width: 10, height: 10 });
    await repository.persist(working, raw);
    vi.mocked(uploadYandexImage).mockRejectedValueOnce(new Error("Нет сети"));
    await expect(repository.flush(working)).rejects.toThrow("Не удалось загрузить фотографию");
    expect(await listPendingImages()).toHaveLength(1);
    expect(await listQueuedOperations()).toHaveLength(1);
    vi.mocked(uploadYandexImage).mockResolvedValue({ ...image, url: "https://example.ru/recipes/__images/photo", thumbnailUrl: "https://example.ru/recipes/__images/photo?variant=thumbnail" });
    const result = await repository.flush(working);
    expect(result.recipes.find((recipe) => recipe.id === "custom")?.coverImage?.url).toContain("/__images/photo");
    expect(await listPendingImages()).toHaveLength(0);
    expect(await listQueuedOperations()).toHaveLength(0);
  });
});
