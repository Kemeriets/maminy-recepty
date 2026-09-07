import { expect, test } from "@playwright/test";

test("основной сценарий семейной книги", async ({ page }) => {
  await page.goto("/");
  const intro = page.getByRole("button", { name: "Открыть книгу" });
  if (await intro.isVisible().catch(() => false)) await intro.click();
  await page.getByPlaceholder("Найти рецепт или ингредиент").fill("Шарлотка");
  await page.getByRole("button", { name: /Открыть рецепт «Шарлотка с яблоками»/ }).click();
  await expect(page.getByRole("heading", { name: "Шарлотка с яблоками" })).toBeVisible();
  await page.getByRole("button", { name: /Назад/ }).first().click();
  await page.getByRole("button", { name: /Добавить рецепт/ }).click();
  await page.getByLabel("Название блюда *").fill("Тестовый семейный кекс");
  await page.getByLabel("Название", { exact: true }).first().fill("Мука");
  await page.getByLabel("Количество", { exact: true }).first().fill("250");
  await page.getByLabel("Единица", { exact: true }).first().fill("г");
  await page.getByLabel("Шаг 1").fill("Смешать и выпечь до золотистой корочки.");
  await page.getByRole("button", { name: /Сохранить рецепт/ }).click();
  await expect(page.getByRole("heading", { name: "Тестовый семейный кекс" })).toBeVisible();
  await page.getByRole("button", { name: "Редактировать" }).first().click();
  await page.getByLabel("Название блюда *").fill("Семейный кекс");
  await page.getByRole("button", { name: /Сохранить рецепт/ }).click();
  await expect(page.getByRole("heading", { name: "Семейный кекс" })).toBeVisible();
  await page.getByRole("button", { name: "Добавить в любимые" }).click();
  await expect(page.getByRole("button", { name: "Убрать из любимых" })).toBeVisible();
});
