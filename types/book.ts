export const CURRENT_SCHEMA_VERSION = 1 as const;

export type RecipeImageKind = "cover" | "original" | "step";

export interface RecipeImage {
  id: string;
  kind: RecipeImageKind;
  url: string;
  thumbnailUrl?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  createdAt: string;
}

export interface Ingredient {
  id: string;
  name: string;
  amount: number | null;
  amountText?: string | null;
  unit: string;
  note?: string | null;
  order: number;
}

export interface RecipeStep {
  id: string;
  order: number;
  text: string;
  image?: RecipeImage | null;
}

export interface Recipe {
  id: string;
  bookId: string;
  title: string;
  description: string;
  categoryId: string | null;
  authorId: string | null;
  coverImage: RecipeImage | null;
  originalPageImages: RecipeImage[];
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  note: string;
  familyStory: string;
  tags: string[];
  favorite: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  revision: number;
}

export interface Category {
  id: string;
  bookId: string;
  name: string;
  icon: string;
  order: number;
  createdAt: string;
}

export interface Author {
  id: string;
  bookId: string;
  name: string;
  avatarUrl?: string | null;
  order: number;
  createdAt: string;
}

export interface ShoppingItem {
  id: string;
  bookId: string;
  name: string;
  amount: number | null;
  amountText?: string | null;
  unit: string;
  checked: boolean;
  recipeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookInfo {
  id: string;
  name: string;
  familyName: string;
  ownerUserId: string;
  role: "owner" | "editor" | "viewer";
  createdAt: string;
  updatedAt: string;
}

export interface BookSnapshot {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  book: BookInfo;
  categories: Category[];
  authors: Author[];
  recipes: Recipe[];
  shoppingItems: ShoppingItem[];
  syncedAt: string | null;
}

export type BookOperation =
  | { opId: string; type: "recipe.upsert"; recipe: Recipe; createdAt: string }
  | { opId: string; type: "recipe.favorite"; recipeId: string; favorite: boolean; createdAt: string }
  | { opId: string; type: "recipe.delete"; recipeId: string; deletedAt: string; createdAt: string }
  | { opId: string; type: "recipe.restore"; recipeId: string; createdAt: string }
  | { opId: string; type: "recipe.deleteForever"; recipeId: string; createdAt: string }
  | { opId: string; type: "category.upsert"; category: Category; createdAt: string }
  | { opId: string; type: "category.delete"; categoryId: string; createdAt: string }
  | { opId: string; type: "author.upsert"; author: Author; createdAt: string }
  | { opId: string; type: "author.delete"; authorId: string; createdAt: string }
  | { opId: string; type: "shopping.upsert"; item: ShoppingItem; createdAt: string }
  | { opId: string; type: "shopping.delete"; itemId: string; createdAt: string }
  | { opId: string; type: "shopping.clearChecked"; createdAt: string }
  | { opId: string; type: "demo.clear"; createdAt: string };

type WithoutOperationMeta<T> = T extends unknown ? Omit<T, "opId" | "createdAt"> : never;
export type BookOperationInput = WithoutOperationMeta<BookOperation>;

export interface RecipeImportIngredient {
  name: string;
  amount?: number | string | null;
  unit?: string;
  note?: string;
}

export interface RecipeImportItem {
  id?: string;
  title: string;
  description?: string;
  category?: string;
  author?: string;
  servings?: number | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  ingredients: RecipeImportIngredient[];
  steps: Array<string | { text: string }>;
  note?: string;
  familyStory?: string;
  tags?: string[];
  coverImage?: { fileName?: string; dataUrl?: string; alt?: string } | null;
  originalPageImages?: Array<{ fileName?: string; dataUrl?: string; alt?: string }>;
}

export interface RecipeImportFile {
  schemaVersion: number;
  generatedAt?: string;
  source?: string;
  recipes: RecipeImportItem[];
}

export interface BackupFile extends BookSnapshot {
  exportedAt: string;
  appVersion: string;
}
