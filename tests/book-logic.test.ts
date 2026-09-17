import { describe, expect, it } from "vitest";
import { applyOperation, baseServings, filterRecipes, formatAmount, formatServings, scaleIngredient, servingOptions } from "../features/book/logic";
import { createDemoSnapshot } from "../features/book/demo-data";

describe("логика семейной книги", () => {
  it("создаёт и редактирует рецепт через одну операцию upsert", () => {
    const snapshot = createDemoSnapshot();
    const original = snapshot.recipes[0];
    const created = applyOperation(snapshot, { opId: "op-create", type: "recipe.upsert", recipe: { ...original, id: "recipe_new", title: "Новый пирог" }, createdAt: new Date().toISOString() });
    expect(created.recipes.some((item) => item.id === "recipe_new")).toBe(true);
    const edited = applyOperation(created, { opId: "op-edit", type: "recipe.upsert", recipe: { ...created.recipes[0], title: "Исправленный пирог" }, createdAt: new Date().toISOString() });
    expect(edited.recipes[0].title).toBe("Исправленный пирог");
  });

  it("делает мягкое удаление и восстановление", () => {
    const snapshot = createDemoSnapshot();
    const id = snapshot.recipes[0].id;
    const deleted = applyOperation(snapshot, { opId: "op-delete", type: "recipe.delete", recipeId: id, deletedAt: "2026-09-05T00:00:00Z", createdAt: "2026-09-05T00:00:00Z" });
    expect(deleted.recipes.find((item) => item.id === id)?.deletedAt).not.toBeNull();
    const restored = applyOperation(deleted, { opId: "op-restore", type: "recipe.restore", recipeId: id, createdAt: "2026-09-05T00:01:00Z" });
    expect(restored.recipes.find((item) => item.id === id)?.deletedAt).toBeNull();
  });

  it("ищет по названию и ингредиентам без учёта ё", () => {
    const snapshot = createDemoSnapshot();
    expect(filterRecipes(snapshot.recipes, { query: "яблоки" }).map((item) => item.title)).toContain("Шарлотка с яблоками");
    expect(filterRecipes(snapshot.recipes, { query: "свекла" }).map((item) => item.title)).toContain("Домашний борщ");
  });

  it("фильтрует избранные и категории", () => {
    const snapshot = createDemoSnapshot();
    const favorite = filterRecipes(snapshot.recipes, { favoriteOnly: true });
    expect(favorite).toHaveLength(1);
    expect(filterRecipes(snapshot.recipes, { categoryId: snapshot.recipes[0].categoryId })).toHaveLength(1);
  });

  it("пересчитывает только числовые количества", () => {
    const numeric = { id: "1", name: "Мука", amount: 250, amountText: null, unit: "г", note: null, order: 0 };
    const text = { ...numeric, id: "2", name: "Соль", amount: null, amountText: "по вкусу" };
    expect(scaleIngredient(numeric, 4, 8).amount).toBe(500);
    expect(formatAmount(scaleIngredient(text, 4, 8).amount, text.amountText)).toBe("по вкусу");
  });

  it("пересчитывает полпорции у известного выхода, не меняя исходный ингредиент", () => {
    const recipe = createDemoSnapshot().recipes.find((item) => item.servings);
    expect(recipe).toBeDefined();
    const original = { id: "flour", name: "Мука", amount: 300, amountText: null, unit: "г", note: null, order: 0 };
    expect(servingOptions(recipe!)).toEqual(expect.arrayContaining([0.5, 1, 1.5, 2, 2.5]));
    expect(scaleIngredient(original, 4, 1.5).amount).toBe(112.5);
    expect(original.amount).toBe(300);
    expect(formatServings(1.5)).toBe("1,5");
  });

  it("использует один исходный рецепт как основу, если выход неизвестен", () => {
    const recipe = { ...createDemoSnapshot().recipes[0], servings: null };
    const numeric = { id: "flour", name: "Мука", amount: 300, amountText: null, unit: "г", note: null, order: 0 };
    const text = { ...numeric, id: "salt", amount: null, amountText: "по вкусу" };
    expect(baseServings(recipe)).toBe(1);
    expect(recipe.servings).toBeNull();
    expect(servingOptions(recipe).slice(0, 5)).toEqual([0.5, 1, 1.5, 2, 2.5]);
    expect(scaleIngredient(numeric, baseServings(recipe), 1.5).amount).toBe(450);
    expect(scaleIngredient(text, baseServings(recipe), 2.5).amountText).toBe("по вкусу");
  });
});
