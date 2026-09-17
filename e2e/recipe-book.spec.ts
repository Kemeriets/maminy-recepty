import { expect, test } from "@playwright/test";

test("каталог показывает все карточки и возвращает на прежнее место", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Открыть рецепт «Домашний борщ»/ })).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("maminy-recipes", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const snapshot = await new Promise<{ recipes: Array<{ id: string; title: string }> }>((resolve, reject) => {
      const request = db.transaction("snapshot", "readonly").objectStore("snapshot").get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const template = snapshot.recipes[0];
    const recipes = Array.from({ length: 48 }, (_, i) => ({ ...template, id: `test-recipe-${i}`, title: `Тестовый рецепт ${i + 1}` }));
    snapshot.recipes = recipes;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("snapshot", "readwrite");
      tx.objectStore("snapshot").put(snapshot, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator(".recipe-card")).toHaveCount(48);
  await expect(page.getByRole("button", { name: /Показать ещё/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Открыть рецепт «Тестовый рецепт 48»" }).scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Открыть рецепт «Тестовый рецепт 48»" }).click();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect.poll(() => page.evaluate(() => scrollY), { timeout: 4000 }).toBeGreaterThan(before - 150);
});

test("без известного выхода можно выбрать 1,5 и 2,5 исходного рецепта", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Добавить рецепт", exact: true }).click();
  await page.getByLabel("Название блюда *").fill("Пирог без указанного выхода");
  await page.getByLabel("Название", { exact: true }).first().fill("Мука");
  await page.getByLabel("Количество", { exact: true }).first().fill("300");
  await page.getByLabel("Единица", { exact: true }).first().fill("г");
  await page.getByLabel("Шаг 1", { exact: true }).fill("Смешать продукты.");
  await page.getByRole("button", { name: "Сохранить рецепт", exact: true }).last().click();
  await expect(page.getByText("1 — ингредиенты как в исходном рецепте, 1,5 — в полтора раза больше.", { exact: false })).toBeVisible();
  await page.getByRole("combobox", { name: "Количество исходных рецептов" }).click();
  await page.getByRole("option", { name: "1,5", exact: true }).click();
  await expect(page.locator(".ingredient-list").getByText("450 г")).toBeVisible();
  await page.getByRole("combobox", { name: "Количество исходных рецептов" }).click();
  await page.getByRole("option", { name: "2,5", exact: true }).click();
  await expect(page.locator(".ingredient-list").getByText("750 г")).toBeVisible();
  await page.getByRole("button", { name: "Режим готовки", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Увеличить на полпорции" }).click();
  await expect(dialog.getByText("450 г")).toBeVisible();
});

test("режим готовки занимает весь экран и сохраняет отметки отдельно от рецепта", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Открыть рецепт «Домашний борщ»/ }).click();
  await page.getByRole("button", { name: "Режим готовки", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const bounds = await dialog.boundingBox();
  expect(bounds?.x).toBe(0); expect(bounds?.y).toBe(0);
  expect(bounds?.width).toBe(page.viewportSize()!.width);
  expect(bounds?.height).toBe(page.viewportSize()!.height);
  await dialog.getByRole("checkbox", { name: "Отметить шаг 1" }).check();
  await expect(dialog.getByText("1 из 4", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: "Режим готовки", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: "Отметить шаг 1" })).toBeChecked();
});

test("фильтры компактные, случайное блюдо учитывает категорию", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Фильтры", exact: true }).click();
  expect((await page.locator(".filter-popover").boundingBox())!.width).toBeLessThanOrEqual(330);
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Закрыть фильтры", exact: true }).click();
  const random = page.getByRole("button", { name: "Случайное", exact: true });
  if (await random.isVisible()) await random.click();
  else await page.getByRole("button", { name: "Что приготовить?", exact: true }).click();
  await page.getByRole("combobox", { name: "Категория случайного блюда" }).click();
  await page.getByRole("option", { name: "Супы", exact: true }).click();
  await page.getByRole("button", { name: "Выбрать блюдо", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Домашний борщ", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Открыть рецепт", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Домашний борщ", exact: true })).toBeVisible();
});

test("длинный текст не растягивает колонки, покупки очищаются с подтверждением", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Добавить рецепт", exact: true }).click();
  await page.getByLabel("Название блюда *").fill("Длинная заметка");
  await page.getByLabel("Название", { exact: true }).first().fill("Мука");
  await page.getByLabel("Уточнение", { exact: true }).first().fill("а".repeat(1000));
  await page.getByLabel("Шаг 1", { exact: true }).fill("Смешать и приготовить.");
  await page.getByLabel("Источник или комментарий", { exact: true }).fill("Большая заметка.\n".repeat(400));
  expect(await page.getByLabel("Источник или комментарий", { exact: true }).evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.getByRole("button", { name: "Сохранить рецепт", exact: true }).last().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText("Оригинал из старой книги", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Добавить в покупки", exact: true }).click();
  await page.getByRole("button", { name: /Добавить выбранное/ }).click();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: /Покупки/ }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Очистить весь список", exact: true }).click();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(page.locator(".shopping-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Очистить весь список", exact: true }).click();
  await page.getByRole("button", { name: "Очистить всё", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Список пока пуст", exact: true })).toBeVisible();
});

test("создание, редактирование и избранное", async ({ page }) => {
  await page.goto("/");
  const intro = page.getByRole("button", { name: "Открыть книгу" });
  if (await intro.isVisible().catch(() => false)) await intro.click();
  await page.getByPlaceholder("Найти рецепт или ингредиент").fill("Шарлотка");
  await page.getByRole("button", { name: /Открыть рецепт «Шарлотка с яблоками»/ }).click();
  await expect(page.getByRole("heading", { name: "Шарлотка с яблоками" })).toBeVisible();
  await page.getByRole("button", { name: /Назад/ }).first().click();
  await page.getByRole("button", { name: /Добавить рецепт/ }).click();
  await page.getByLabel("Название блюда *").fill("Тестовый кекс");
  await page.getByLabel("Название", { exact: true }).first().fill("Мука");
  await page.getByLabel("Количество", { exact: true }).first().fill("250");
  await page.getByLabel("Единица", { exact: true }).first().fill("г");
  await page.getByLabel("Шаг 1").fill("Смешать и выпечь до золотистой корочки.");
  await page.getByRole("button", { name: /Сохранить рецепт/ }).last().click();
  await expect(page.getByRole("heading", { name: "Тестовый кекс" })).toBeVisible();
  await page.getByRole("button", { name: "Редактировать" }).first().click();
  await page.getByLabel("Название блюда *").fill("Кекс");
  await page.getByRole("button", { name: /Сохранить рецепт/ }).last().click();
  await expect(page.getByRole("heading", { name: "Кекс", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Добавить в любимые" }).click();
  await expect(page.getByRole("button", { name: "Убрать из любимых" })).toBeVisible();
});

test("категории полностью доступны и разделы не смешиваются", async ({ page }) => {
  await page.goto("/");
  const categories = page.locator(".category-strip");
  await expect(categories.getByRole("button", { name: "Другое", exact: true })).toBeVisible();
  for (const button of await categories.getByRole("button").all()) {
    const bounds = await button.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await categories.getByRole("button", { name: "Любимые", exact: true }).click();
  await expect(categories.locator('[aria-pressed="true"]')).toHaveCount(1);
  await categories.getByRole("button", { name: "Супы", exact: true }).click();
  await expect(categories.getByRole("button", { name: "Любимые", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: /Открыть рецепт «Домашний борщ»/ })).toBeVisible();
  await categories.getByRole("button", { name: "Все рецепты", exact: true }).click();
  await expect(categories.locator('[aria-pressed="true"]')).toHaveCount(1);
});

test("нет авторов и сентиментальных заголовков, хранение объяснено", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Семейная книга", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Мамины рецепты", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Добавить рецепт", exact: true }).click();
  await expect(page.getByText("Автор", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  const menu = page.getByRole("button", { name: "Открыть настройки", exact: true });
  if (await menu.isVisible()) await menu.click();
  else await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByText("Авторы", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Синхронизация не настроена.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Как пользоваться/ }).click();
  await expect(page.getByRole("heading", { name: "Хранение и резервная копия", exact: true })).toBeVisible();
});
