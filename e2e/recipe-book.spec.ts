import { expect, test } from "@playwright/test";

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
