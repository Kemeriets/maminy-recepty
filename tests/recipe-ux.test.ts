import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "../config/app.config";
import { isOptionalRecipeNumber } from "../features/book/recipe-input";
import { createDemoSnapshot } from "../features/book/demo-data";
import { scaleIngredient } from "../features/book/logic";
import { recipeShareText } from "../services/recipe-share";

describe("упрощённый интерфейс рецептов", () => {
  it("использует нейтральное название без заставки и новых авторов", () => {
    expect(APP_CONFIG.appName).toBe("Рецепты");
    expect(APP_CONFIG.showGiftIntro).toBe(false);
    expect(createDemoSnapshot().authors).toEqual([]);
  });

  it("принимает десятичные количества и пустые необязательные поля", () => {
    for (const input of ["", "4", "2,5", "1.25", " 3 "]) expect(isOptionalRecipeNumber(input, true)).toBe(true);
    expect(isOptionalRecipeNumber("0")).toBe(true);
  });

  it("отклоняет некорректные числа и нулевые порции", () => {
    for (const input of ["Infinity", "NaN", "1e100", "-2", "0x20", "три"]) expect(isOptionalRecipeNumber(input)).toBe(false);
    expect(isOptionalRecipeNumber("0", true)).toBe(false);
  });

  it("передаёт полный рецепт без приватной ссылки", () => {
    const recipe = createDemoSnapshot().recipes[0];
    const text = recipeShareText(recipe);
    expect(text).toContain(recipe.title);
    expect(text).toContain("Ингредиенты:");
    for (const step of recipe.steps) expect(text).toContain(step.text);
    expect(text).toContain(recipe.note);
    expect(text).not.toContain("#recipe/");
    expect(text).not.toContain("github.io");
  });

  it("делится пересчитанными количествами, не меняя исходный рецепт", () => {
    const recipe = createDemoSnapshot().recipes[0];
    const before = JSON.stringify(recipe);
    const text = recipeShareText(recipe, recipe.ingredients.map((item) => scaleIngredient(item, recipe.servings, recipe.servings! * 2)), recipe.servings! * 2);
    expect(text).toContain(`Порций: ${recipe.servings! * 2}`);
    expect(JSON.stringify(recipe)).toBe(before);
  });
});
