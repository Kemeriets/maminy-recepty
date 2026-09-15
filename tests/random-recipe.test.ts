import { describe, expect, it } from "vitest";
import { chooseRandomRecipe } from "../features/book/random-recipe";
import { createDemoSnapshot } from "../features/book/demo-data";
import { applyOperation } from "../features/book/logic";
import { formatBytes } from "../services/storage-service";
import type { BookSnapshot } from "../types/book";

describe("выбор блюда и покупки", () => {
  const recipes = createDemoSnapshot().recipes;
  it("выбирает только внутри категории", () => {
    expect(chooseRandomRecipe(recipes, recipes[0].categoryId, null, () => .99)?.id).toBe(recipes[0].id);
  });
  it("не предлагает удалённое блюдо и обрабатывает пустую категорию", () => {
    expect(chooseRandomRecipe(recipes, "empty")).toBeNull();
    expect(chooseRandomRecipe(recipes.map((recipe) => ({ ...recipe, deletedAt: "2026-09-15" })), null)).toBeNull();
  });
  it("не повторяет предыдущее блюдо, если есть выбор", () => {
    expect(chooseRandomRecipe(recipes, null, recipes[0].id, () => 0)?.id).not.toBe(recipes[0].id);
    expect(chooseRandomRecipe([recipes[0]], null, recipes[0].id)?.id).toBe(recipes[0].id);
  });
  it("очищает выбранный набор покупок, не затрагивая рецепты или новые пункты", () => {
    const snapshot = createDemoSnapshot();
    const template = { bookId: snapshot.book.id, name: "Мука", amount: null, unit: "", checked: false, createdAt: "2026-09-15", updatedAt: "2026-09-15" };
    const source: BookSnapshot = { ...snapshot, shoppingItems: [{ ...template, id: "one" }, { ...template, id: "two", checked: true }, { ...template, id: "new" }] };
    const cleared = ["one", "two"].reduce((book, itemId) => applyOperation(book, { opId: `clear-${itemId}`, type: "shopping.delete", itemId, createdAt: "2026-09-15" }), source);
    expect(cleared.shoppingItems.map((item) => item.id)).toEqual(["new"]);
    expect(cleared.recipes).toEqual(source.recipes);
    expect(source.shoppingItems).toHaveLength(3);
  });
  it("показывает размер понятными единицами", () => {
    expect(formatBytes(1024 * 1024)).toBe("1 МБ");
    expect(formatBytes(100)).toBe("100 Б");
  });
});
