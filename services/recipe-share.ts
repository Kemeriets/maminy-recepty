import { formatAmount } from "../features/book/logic";
import type { Ingredient, Recipe } from "../types/book";

// Private recipes are shared as text, not as a link to another device's local book.
export function recipeShareText(recipe: Recipe, ingredients: Ingredient[] = recipe.ingredients, servings = recipe.servings): string {
  return [
    recipe.title,
    recipe.description,
    servings ? `Порций: ${servings}` : "",
    `Ингредиенты:\n${ingredients.map((item) => {
      const quantity = [formatAmount(item.amount, item.amountText), item.unit].filter(Boolean).join(" ");
      return `• ${item.name}${quantity ? ` — ${quantity}` : ""}${item.note ? ` (${item.note})` : ""}`;
    }).join("\n")}`,
    `Приготовление:\n${recipe.steps.map((step, index) => `${index + 1}. ${step.text}`).join("\n")}`,
    recipe.note ? `Заметка:\n${recipe.note}` : "",
    recipe.familyStory ? `Источник или комментарий:\n${recipe.familyStory}` : "",
  ].filter(Boolean).join("\n\n");
}
