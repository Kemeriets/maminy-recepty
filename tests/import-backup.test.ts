import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { File as NodeFile } from "node:buffer";
import { unzipSync } from "fflate";
import { createBackupObject, createZipBackup } from "../services/backup-service";
import { backupToImport, loadImportPackage, prepareImport, validateImportData } from "../services/import-service";
import { createDemoSnapshot } from "../features/book/demo-data";

describe("импорт и резервные копии", () => {
  it("принимает корректный пакет массового импорта", () => {
    const value = validateImportData({ schemaVersion: 1, recipes: [{ title: "Кекс", ingredients: [{ name: "Мука", amount: 200, unit: "г" }], steps: ["Смешать и выпечь"] }] });
    expect(value.recipes[0].title).toBe("Кекс");
  });

  it("читает поставляемый пример JSON как загруженный файл", async () => {
    const bytes = await readFile(new URL("../public/examples/recipes-import.example.json", import.meta.url));
    const file = new NodeFile([bytes], "recipes-import.example.json", { type: "application/json" });
    const loaded = await loadImportPackage([file as unknown as File]);
    expect(loaded.data.recipes[0].title).toBe("Торт «Черепаха»");
    expect(loaded.data.recipes[0].originalPageImages?.[0].fileName).toBe("photo_22_2026-09-04_00-31-33.jpg");
  });

  it("отклоняет рецепт без шагов", () => {
    expect(() => validateImportData({ schemaVersion: 1, recipes: [{ title: "Кекс", ingredients: [{ name: "Мука" }], steps: [] }] })).toThrow(/схеме/i);
  });

  it("готовит массовый импорт и создаёт новую категорию", async () => {
    const snapshot = createDemoSnapshot();
    const data = validateImportData({ schemaVersion: 1, recipes: [{ title: "Осенний кекс", category: "Сезонное", author: "Тётя Лена", ingredients: [{ name: "Мука", amount: "1/2", unit: "стакана" }], steps: ["Смешать"] }] });
    const prepared = await prepareImport({ data, attachments: new Map(), backup: null, fileName: "recipes.json" }, snapshot, "skip");
    expect(prepared.recipes).toHaveLength(1);
    expect(prepared.addedCategories[0].name).toBe("Сезонное");
    expect(prepared.recipes[0].ingredients[0].amount).toBe(.5);
  });

  it("экспортирует переносимую схему с версией", () => {
    const backup = createBackupObject(createDemoSnapshot());
    expect(backup.schemaVersion).toBe(1);
    expect(backup.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(backup.recipes.length).toBeGreaterThan(0);
  });

  it("собирает переносимый ZIP с JSON и фотографиями", async () => {
    const snapshot = createDemoSnapshot();
    const image = {
      id: "image_backup_test",
      kind: "cover" as const,
      url: "data:image/png;base64,iVBORw0KGgo=",
      thumbnailUrl: null,
      alt: "Проверочная фотография",
      width: 1,
      height: 1,
      createdAt: "2026-09-05T00:00:00.000Z",
    };
    snapshot.recipes = [{
      ...snapshot.recipes[0],
      coverImage: image,
      originalPageImages: [],
      steps: snapshot.recipes[0].steps.map((step) => ({ ...step, image: null })),
    }];
    const archive = unzipSync(await createZipBackup(snapshot));
    expect(archive["recipes.json"]).toBeDefined();
    expect(archive["README.txt"]).toBeDefined();
    expect(archive["images/image_backup_test.png"]).toBeDefined();
  });

  it("при полном восстановлении не теряет рецепты из корзины", () => {
    const snapshot = createDemoSnapshot();
    snapshot.recipes[0] = { ...snapshot.recipes[0], deletedAt: "2026-09-05T12:00:00.000Z" };
    const backup = createBackupObject(snapshot);
    expect(backupToImport(backup).recipes).toHaveLength(snapshot.recipes.length - 1);
    expect(backupToImport(backup, true).recipes).toHaveLength(snapshot.recipes.length);
  });
});
