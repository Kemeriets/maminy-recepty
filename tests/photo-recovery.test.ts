import "fake-indexeddb/auto";
import { File as NodeFile } from "node:buffer";
import { beforeEach, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { createDemoSnapshot } from "../features/book/demo-data";
import { createBackupObject, recoverPhotoCacheFromZip } from "../services/backup-service";
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
});
