import type { Recipe } from "../../types/book";

export function chooseRandomRecipe(recipes: Recipe[], categoryId: string | null, previousId: string | null = null, random = Math.random): Recipe | null {
  const eligible = recipes.filter((recipe) => !recipe.deletedAt && (!categoryId || recipe.categoryId === categoryId));
  const candidates = eligible.length > 1 ? eligible.filter((recipe) => recipe.id !== previousId) : eligible;
  if (!candidates.length) return null;
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
  return candidates[index];
}
