import "fake-indexeddb/auto";
import { File as NodeFile } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { createDemoSnapshot } from "../features/book/demo-data";
import { createBackupObject, createPhotoTransferZip, recoverPhotoCacheFromZip } from "../services/backup-service";
import { clearLocalBookData, getCachedImageBlob, listQueuedOperations } from "../services/local-store";

function fixture(bookId?: string) {
  const snapshot = createDemoSnapshot();
  const imageId = "image_recovery_test";
  snapshot.recipes = [{ ...snapshot.recipes[0], coverImage: {
    id: imageId, kind: "cover", url: `/maminy-recepty/__images/${imageId}`,
    thumbnailUrl: `/maminy-recepty/__images/${imageId}?variant=thumbnail`,
    createdAt: "2026-09-16T00:00:00.000Z",
  }, originalPageImages: [] }];
  const backup = createBackupObject(snapshot);
  if (bookId) backup.book = { ...backup.book, id: bookId };
  const portable = { ...backup, mediaIndex: { [imageId]: `images/${imageId}.webp` } };
  const archive = zipSync({
    "recipes.json": strToU8(JSON.stringify(portable)),
    [`images/${imageId}.webp`]: strToU8("main-image"),
    [`images/${imageId}-thumb.webp`]: strToU8("thumb-image"),
  });
  return { snapshot, archive: new NodeFile([archive], "backup.zip", { type: "application/zip" }) as unknown as File, imageId };
}

describe("восстановление фото из полной ZIP-копии", () => {
  beforeEach(async () => { await clearLocalBookData(); });
  afterEach(() => vi.restoreAllMocks());

  it("возвращает фото в кэш и не создаёт операций над рецептами", async () => {
    const { snapshot, archive, imageId } = fixture();
    const result = await recoverPhotoCacheFromZip(archive, snapshot);
    expect(result).toEqual({ thumbnails: 1, full: 1 });
    expect(await (await getCachedImageBlob(imageId, "thumbnail"))?.text()).toBe("thumb-image");
    expect(await (await getCachedImageBlob(imageId, "main"))?.text()).toBe("main-image");
    expect(await listQueuedOperations()).toHaveLength(0);
  });

  it("не подменяет изображения архивом от другой книги", async () => {
    const { snapshot, archive, imageId } = fixture("foreign-book");
    await expect(recoverPhotoCacheFromZip(archive, snapshot)).rejects.toThrow("другой книге");
    expect(await getCachedImageBlob(imageId, "thumbnail")).toBeNull();
  });

  it("переносит доступные фото без рецептов и без изменений в облаке", async () => {
    const { snapshot, imageId } = fixture();
    const source = { ...snapshot, recipes: snapshot.recipes.map((recipe) => ({ ...recipe,
      coverImage: recipe.coverImage ? { ...recipe.coverImage, url: "data:image/webp;base64,bWFpbi1pbWFnZQ==", thumbnailUrl: "data:image/webp;base64,dGh1bWItaW1hZ2U=" } : null,
    })) };
    const transfer = await createPhotoTransferZip(source);
    expect(transfer).toMatchObject({ exported: 1, skipped: 0 });
    const entries = unzipSync(transfer.archive);
    expect(entries["photos-manifest.json"]).toBeDefined();
    expect(entries["recipes.json"]).toBeUndefined();
    const archive = new NodeFile([transfer.archive], "photos.zip", { type: "application/zip" }) as unknown as File;
    expect(await recoverPhotoCacheFromZip(archive, snapshot)).toEqual({ thumbnails: 1, full: 1 });
    expect(await (await getCachedImageBlob(imageId, "main"))?.text()).toBe("main-image");
    expect(await (await getCachedImageBlob(imageId, "thumbnail"))?.text()).toBe("thumb-image");
    expect(await listQueuedOperations()).toHaveLength(0);
  });

  it("явно считает пропущенные фото, не считая архив полной копией", async () => {
    const { snapshot } = fixture();
    const originalFetch = fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => String(input).includes("unavailable.example") ? Promise.reject(new TypeError("нет доступа")) : originalFetch(input, init));
    const source = { ...snapshot, recipes: snapshot.recipes.map((recipe) => ({ ...recipe,
      coverImage: recipe.coverImage ? { ...recipe.coverImage, url: "data:image/webp;base64,bWFpbi1pbWFnZQ==", thumbnailUrl: null } : null,
      originalPageImages: [{ id: "image_unavailable", kind: "original" as const, url: "https://unavailable.example/photo.webp", thumbnailUrl: null, createdAt: "2026-09-16" }],
    })) };
    const result = await createPhotoTransferZip(source);
    expect(result).toMatchObject({ exported: 1, skipped: 1 });
    expect(unzipSync(result.archive)["recipes.json"]).toBeUndefined();
  });
});
