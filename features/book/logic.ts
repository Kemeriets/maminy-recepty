import type { BookOperation, BookSnapshot, Ingredient, Recipe } from "../../types/book";

export interface RecipeFilters {
  query?: string;
  categoryId?: string | null;
  authorId?: string | null;
  favoriteOnly?: boolean;
  withPhoto?: boolean | null;
  includeDeleted?: boolean;
}

export function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

export function searchableRecipeText(recipe: Recipe): string {
  return normalizeSearch([
    recipe.title,
    recipe.description,
    recipe.note,
    recipe.familyStory,
    ...recipe.tags,
    ...recipe.ingredients.flatMap((item) => [item.name, item.note ?? ""]),
  ].join(" "));
}

export function filterRecipes(recipes: Recipe[], filters: RecipeFilters): Recipe[] {
  const words = normalizeSearch(filters.query ?? "").split(" ").filter(Boolean);
  return recipes.filter((recipe) => {
    if (filters.includeDeleted ? !recipe.deletedAt : Boolean(recipe.deletedAt)) return false;
    if (filters.categoryId && recipe.categoryId !== filters.categoryId) return false;
    if (filters.authorId && recipe.authorId !== filters.authorId) return false;
    if (filters.favoriteOnly && !recipe.favorite) return false;
    if (filters.withPhoto === true && !recipe.coverImage && recipe.originalPageImages.length === 0) return false;
    if (filters.withPhoto === false && (recipe.coverImage || recipe.originalPageImages.length > 0)) return false;
    if (words.length && !words.every((word) => searchableRecipeText(recipe).includes(word))) return false;
    return true;
  });
}

export function scaleIngredient(ingredient: Ingredient, fromServings: number | null, toServings: number): Ingredient {
  if (!ingredient.amount || !fromServings || fromServings <= 0 || toServings <= 0) return ingredient;
  const scaled = ingredient.amount * (toServings / fromServings);
  return { ...ingredient, amount: Math.round((scaled + Number.EPSILON) * 100) / 100 };
}

// An unknown yield is one original batch. Keep the stored servings null so we
// never claim the original recipe feeds exactly one person.
export function baseServings(recipe: Recipe): number {
  return recipe.servings && recipe.servings > 0 ? recipe.servings : 1;
}

export function servingOptions(recipe: Recipe): number[] {
  const original = baseServings(recipe);
  const values = Array.from({ length: 32 }, (_, index) => (index + 1) / 2);
  return [...new Set([...values, original, original * 2])].sort((a, b) => a - b);
}

export function formatServings(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

export function formatAmount(value: number | null, amountText?: string | null): string {
  if (value === null) return amountText?.trim() ?? "";
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(rounded);
}

export function totalRecipeMinutes(recipe: Recipe): number | null {
  const total = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0);
  return total > 0 ? total : null;
}

export function applyOperation(snapshot: BookSnapshot, operation: BookOperation): BookSnapshot {
  const next: BookSnapshot = {
    ...snapshot,
    recipes: [...snapshot.recipes],
    categories: [...snapshot.categories],
    authors: [...snapshot.authors],
    shoppingItems: [...snapshot.shoppingItems],
  };
  switch (operation.type) {
    case "recipe.upsert": {
      const index = next.recipes.findIndex((item) => item.id === operation.recipe.id);
      if (index === -1) next.recipes.unshift(operation.recipe);
      else next.recipes[index] = operation.recipe;
      break;
    }
    case "recipe.favorite": {
      next.recipes = next.recipes.map((recipe) => recipe.id === operation.recipeId ? { ...recipe, favorite: operation.favorite, updatedAt: operation.createdAt } : recipe);
      break;
    }
    case "recipe.delete": {
      next.recipes = next.recipes.map((recipe) => recipe.id === operation.recipeId ? { ...recipe, deletedAt: operation.deletedAt, updatedAt: operation.createdAt } : recipe);
      break;
    }
    case "recipe.restore": {
      next.recipes = next.recipes.map((recipe) => recipe.id === operation.recipeId ? { ...recipe, deletedAt: null, updatedAt: operation.createdAt } : recipe);
      break;
    }
    case "recipe.deleteForever":
      next.recipes = next.recipes.filter((recipe) => recipe.id !== operation.recipeId);
      break;
    case "category.upsert": {
      const index = next.categories.findIndex((item) => item.id === operation.category.id);
      if (index === -1) next.categories.push(operation.category); else next.categories[index] = operation.category;
      break;
    }
    case "category.delete":
      next.categories = next.categories.filter((item) => item.id !== operation.categoryId);
      next.recipes = next.recipes.map((recipe) => recipe.categoryId === operation.categoryId ? { ...recipe, categoryId: null } : recipe);
      break;
    case "author.upsert": {
      const index = next.authors.findIndex((item) => item.id === operation.author.id);
      if (index === -1) next.authors.push(operation.author); else next.authors[index] = operation.author;
      break;
    }
    case "author.delete":
      next.authors = next.authors.filter((item) => item.id !== operation.authorId);
      next.recipes = next.recipes.map((recipe) => recipe.authorId === operation.authorId ? { ...recipe, authorId: null } : recipe);
      break;
    case "shopping.upsert": {
      const index = next.shoppingItems.findIndex((item) => item.id === operation.item.id);
      if (index === -1) next.shoppingItems.push(operation.item); else next.shoppingItems[index] = operation.item;
      break;
    }
    case "shopping.delete":
      next.shoppingItems = next.shoppingItems.filter((item) => item.id !== operation.itemId);
      break;
    case "shopping.clearChecked":
      next.shoppingItems = next.shoppingItems.filter((item) => !item.checked);
      break;
    case "demo.clear":
      next.recipes = next.recipes.filter((recipe) => !recipe.isDemo);
      break;
  }
  return next;
}

export function mergeShoppingIngredients(existing: BookSnapshot["shoppingItems"], incoming: BookSnapshot["shoppingItems"]): BookSnapshot["shoppingItems"] {
  const result = [...existing];
  for (const item of incoming) {
    const match = result.find((candidate) =>
      normalizeSearch(candidate.name) === normalizeSearch(item.name) &&
      normalizeSearch(candidate.unit) === normalizeSearch(item.unit) &&
      !candidate.checked && !item.checked && candidate.amount !== null && item.amount !== null,
    );
    if (match) match.amount = Math.round(((match.amount ?? 0) + (item.amount ?? 0)) * 100) / 100;
    else result.push(item);
  }
  return result;
}
