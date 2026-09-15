import { env } from "cloudflare:workers";
import { APP_CONFIG } from "../config/app.config";
import { createDemoSnapshot } from "../features/book/demo-data";
import { nowIso } from "../lib/ids";
import type { BookInfo, BookOperation, BookSnapshot, Recipe, RecipeImage } from "../types/book";
import type { RequestIdentity } from "./auth";

type D1Statement = ReturnType<D1Database["prepare"]>;
export interface BookAccess { book: BookInfo; userId: string; }
export interface MutationResult { orphanedKeys: string[]; }

function database(): D1Database {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new Error("D1 binding DB is unavailable");
  return binding;
}
function imageUrl(id: string, storageKey: string, variant: "main" | "thumbnail" = "main"): string {
  return storageKey.startsWith("/") ? storageKey : `/api/images/${encodeURIComponent(id)}${variant === "thumbnail" ? "?variant=thumbnail" : ""}`;
}
function safeTags(value: string): string[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }

async function seedBook(bookId: string, userId: string, statements: D1Statement[]): Promise<void> {
  const demo = createDemoSnapshot(userId);
  for (const category of demo.categories) statements.push(database().prepare("INSERT OR IGNORE INTO categories (id, book_id, name, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(category.id, bookId, category.name, category.icon, category.order, category.createdAt));
  for (const author of demo.authors) statements.push(database().prepare("INSERT OR IGNORE INTO authors (id, book_id, name, avatar_url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(author.id, bookId, author.name, author.avatarUrl ?? null, author.order, author.createdAt));
  for (const recipe of demo.recipes) {
    statements.push(database().prepare("INSERT OR IGNORE INTO recipes (id, book_id, title, description, category_id, author_id, servings, prep_time_minutes, cook_time_minutes, note, family_story, tags_json, is_demo, created_at, updated_at, deleted_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(recipe.id, bookId, recipe.title, recipe.description, recipe.categoryId, recipe.authorId, recipe.servings, recipe.prepTimeMinutes, recipe.cookTimeMinutes, recipe.note, recipe.familyStory, JSON.stringify(recipe.tags), recipe.isDemo ? 1 : 0, recipe.createdAt, recipe.updatedAt, recipe.deletedAt, recipe.revision));
    for (const item of recipe.ingredients) statements.push(database().prepare("INSERT OR IGNORE INTO ingredients (id, recipe_id, book_id, name, amount, amount_text, unit, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(item.id, recipe.id, bookId, item.name, item.amount, item.amountText ?? null, item.unit, item.note ?? null, item.order));
    for (const step of recipe.steps) statements.push(database().prepare("INSERT OR IGNORE INTO recipe_steps (id, recipe_id, book_id, text, sort_order) VALUES (?, ?, ?, ?, ?)").bind(step.id, recipe.id, bookId, step.text, step.order));
    const images = [recipe.coverImage, ...recipe.originalPageImages].filter(Boolean) as RecipeImage[];
    for (const image of images) statements.push(database().prepare("INSERT OR IGNORE INTO recipe_images (id, book_id, recipe_id, step_id, kind, storage_key, thumbnail_storage_key, alt, width, height, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)").bind(image.id, bookId, recipe.id, image.kind, image.url, image.thumbnailUrl ?? null, image.alt ?? null, image.width ?? null, image.height ?? null, image.createdAt));
    if (recipe.favorite) statements.push(database().prepare("INSERT OR IGNORE INTO favorites (book_id, recipe_id, user_id, created_at) VALUES (?, ?, ?, ?)").bind(bookId, recipe.id, userId, recipe.createdAt));
  }
  statements.push(database().prepare("UPDATE books SET seeded_at = ?, updated_at = ? WHERE id = ?").bind(nowIso(), nowIso(), bookId));
}

export async function ensureBook(identity: RequestIdentity): Promise<BookAccess> {
  const db = database();
  const existing = await db.prepare("SELECT b.id, b.name, b.family_name AS familyName, b.owner_user_id AS ownerUserId, b.created_at AS createdAt, b.updated_at AS updatedAt, b.seeded_at AS seededAt, m.role FROM book_members m JOIN books b ON b.id = m.book_id WHERE m.user_id = ? ORDER BY b.created_at LIMIT 1").bind(identity.userId).first<BookInfo & { seededAt: string | null }>();
  if (existing) return { book: { id: existing.id, name: existing.name, familyName: existing.familyName, ownerUserId: existing.ownerUserId, role: existing.role, createdAt: existing.createdAt, updatedAt: existing.updatedAt }, userId: identity.userId };

  const firstBook = await db.prepare("SELECT id, name, family_name AS familyName, owner_user_id AS ownerUserId, created_at AS createdAt, updated_at AS updatedAt, seeded_at AS seededAt FROM books ORDER BY created_at LIMIT 1").first<Omit<BookInfo, "role"> & { seededAt: string | null }>();
  if (firstBook) {
    await db.prepare("INSERT OR IGNORE INTO book_members (book_id, user_id, email, role, created_at) VALUES (?, ?, ?, 'editor', ?)").bind(firstBook.id, identity.userId, identity.email, nowIso()).run();
    return { book: { id: firstBook.id, name: firstBook.name, familyName: firstBook.familyName, ownerUserId: firstBook.ownerUserId, role: "editor", createdAt: firstBook.createdAt, updatedAt: firstBook.updatedAt }, userId: identity.userId };
  }

  const now = nowIso();
  const bookId = "book_family";
  const statements: D1Statement[] = [
    db.prepare("INSERT OR IGNORE INTO books (id, name, family_name, owner_user_id, seeded_at, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)").bind(bookId, APP_CONFIG.appName, APP_CONFIG.familyName, identity.userId, now, now),
    db.prepare("INSERT OR IGNORE INTO book_members (book_id, user_id, email, role, created_at) VALUES (?, ?, ?, 'owner', ?)").bind(bookId, identity.userId, identity.email, now),
  ];
  await seedBook(bookId, identity.userId, statements);
  await db.batch(statements);
  return { book: { id: bookId, name: APP_CONFIG.appName, familyName: APP_CONFIG.familyName, ownerUserId: identity.userId, role: "owner", createdAt: now, updatedAt: now }, userId: identity.userId };
}

export async function loadSnapshot(access: BookAccess): Promise<BookSnapshot> {
  const db = database();
  const bookId = access.book.id;
  const [categoryResult, authorResult, recipeResult, ingredientResult, stepResult, imageResult, favoriteResult, shoppingResult] = await Promise.all([
    db.prepare("SELECT id, book_id AS bookId, name, icon, sort_order AS 'order', created_at AS createdAt FROM categories WHERE book_id = ? ORDER BY sort_order, name").bind(bookId).all(),
    db.prepare("SELECT id, book_id AS bookId, name, avatar_url AS avatarUrl, sort_order AS 'order', created_at AS createdAt FROM authors WHERE book_id = ? ORDER BY sort_order, name").bind(bookId).all(),
    db.prepare("SELECT id, book_id AS bookId, title, description, category_id AS categoryId, author_id AS authorId, servings, prep_time_minutes AS prepTimeMinutes, cook_time_minutes AS cookTimeMinutes, note, family_story AS familyStory, tags_json AS tagsJson, is_demo AS isDemo, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt, revision FROM recipes WHERE book_id = ? ORDER BY updated_at DESC").bind(bookId).all(),
    db.prepare("SELECT id, recipe_id AS recipeId, name, amount, amount_text AS amountText, unit, note, sort_order AS 'order' FROM ingredients WHERE book_id = ? ORDER BY recipe_id, sort_order").bind(bookId).all(),
    db.prepare("SELECT id, recipe_id AS recipeId, text, sort_order AS 'order' FROM recipe_steps WHERE book_id = ? ORDER BY recipe_id, sort_order").bind(bookId).all(),
    db.prepare("SELECT id, recipe_id AS recipeId, step_id AS stepId, kind, storage_key AS storageKey, thumbnail_storage_key AS thumbnailStorageKey, alt, width, height, created_at AS createdAt FROM recipe_images WHERE book_id = ? AND recipe_id IS NOT NULL").bind(bookId).all(),
    db.prepare("SELECT recipe_id AS recipeId FROM favorites WHERE book_id = ? AND user_id = ?").bind(bookId, access.userId).all(),
    db.prepare("SELECT id, book_id AS bookId, name, amount, amount_text AS amountText, unit, checked, recipe_id AS recipeId, created_at AS createdAt, updated_at AS updatedAt FROM shopping_items WHERE book_id = ? ORDER BY checked, created_at").bind(bookId).all(),
  ]);
  type RawRecipe = Omit<Recipe, "ingredients" | "steps" | "coverImage" | "originalPageImages" | "favorite" | "tags" | "isDemo"> & { tagsJson: string; isDemo: number };
  type RawIngredient = Recipe["ingredients"][number] & { recipeId: string };
  type RawStep = Omit<Recipe["steps"][number], "image"> & { recipeId: string };
  type RawImage = { id: string; recipeId: string; stepId: string | null; kind: RecipeImage["kind"]; storageKey: string; thumbnailStorageKey: string | null; alt: string | null; width: number | null; height: number | null; createdAt: string };
  const rawIngredients = ingredientResult.results as unknown as RawIngredient[];
  const rawSteps = stepResult.results as unknown as RawStep[];
  const rawImages = imageResult.results as unknown as RawImage[];
  const favoriteIds = new Set((favoriteResult.results as unknown as Array<{ recipeId: string }>).map((item) => item.recipeId));
  const images = rawImages.map((item): RecipeImage & { recipeId: string; stepId: string | null } => ({ id: item.id, recipeId: item.recipeId, stepId: item.stepId, kind: item.kind, url: imageUrl(item.id, item.storageKey), thumbnailUrl: item.thumbnailStorageKey ? imageUrl(item.id, item.thumbnailStorageKey, "thumbnail") : null, alt: item.alt, width: item.width, height: item.height, createdAt: item.createdAt }));
  const recipes = (recipeResult.results as unknown as RawRecipe[]).map((raw): Recipe => {
    const recipeImages = images.filter((item) => item.recipeId === raw.id);
    const steps = rawSteps.filter((item) => item.recipeId === raw.id).map((step) => ({ id: step.id, order: step.order, text: step.text, image: recipeImages.find((image) => image.stepId === step.id) ?? null }));
    return { id: raw.id, bookId: raw.bookId, title: raw.title, description: raw.description, categoryId: raw.categoryId, authorId: raw.authorId, servings: raw.servings, prepTimeMinutes: raw.prepTimeMinutes, cookTimeMinutes: raw.cookTimeMinutes, note: raw.note, familyStory: raw.familyStory, tags: safeTags(raw.tagsJson), isDemo: Boolean(raw.isDemo), createdAt: raw.createdAt, updatedAt: raw.updatedAt, deletedAt: raw.deletedAt, revision: raw.revision, favorite: favoriteIds.has(raw.id), ingredients: rawIngredients.filter((item) => item.recipeId === raw.id).map((item) => ({ id: item.id, name: item.name, amount: item.amount, amountText: item.amountText, unit: item.unit, note: item.note, order: item.order })), steps, coverImage: recipeImages.find((image) => image.kind === "cover") ?? null, originalPageImages: recipeImages.filter((image) => image.kind === "original") };
  });
  return { schemaVersion: 1, book: access.book, categories: categoryResult.results as unknown as BookSnapshot["categories"], authors: authorResult.results as unknown as BookSnapshot["authors"], recipes, shoppingItems: (shoppingResult.results as unknown as BookSnapshot["shoppingItems"]).map((item) => ({ ...item, checked: Boolean(item.checked) })), syncedAt: nowIso() };
}

function assertEditor(access: BookAccess) { if (access.book.role === "viewer") throw new Response(JSON.stringify({ error: "У вас есть доступ только для просмотра." }), { status: 403, headers: { "Content-Type": "application/json" } }); }
function validText(value: unknown, max: number) { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function validateRecipe(recipe: Recipe) {
  if (!recipe || !validText(recipe.id, 160) || !validText(recipe.title, 120)) throw new Response(JSON.stringify({ error: "У рецепта нет корректного названия." }), { status: 400, headers: { "Content-Type": "application/json" } });
  if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length || recipe.ingredients.length > 300 || !Array.isArray(recipe.steps) || !recipe.steps.length || recipe.steps.length > 300) throw new Response(JSON.stringify({ error: "Проверьте ингредиенты и шаги приготовления." }), { status: 400, headers: { "Content-Type": "application/json" } });
}

export async function applyBookOperation(access: BookAccess, operation: BookOperation): Promise<MutationResult> {
  assertEditor(access);
  if (!operation || !validText(operation.opId, 180) || !validText(operation.type, 80)) throw new Response(JSON.stringify({ error: "Некорректная операция." }), { status: 400, headers: { "Content-Type": "application/json" } });
  const db = database();
  const bookId = access.book.id;
  const duplicate = await db.prepare("SELECT 1 AS found FROM processed_operations WHERE book_id = ? AND op_id = ?").bind(bookId, operation.opId).first();
  if (duplicate) return { orphanedKeys: [] };
  const statements: D1Statement[] = [];
  const orphanedKeys: string[] = [];
  const markProcessed = () => statements.push(db.prepare("INSERT INTO processed_operations (book_id, op_id, user_id, processed_at) VALUES (?, ?, ?, ?)").bind(bookId, operation.opId, access.userId, nowIso()));

  switch (operation.type) {
    case "recipe.upsert": {
      validateRecipe(operation.recipe);
      const recipe = operation.recipe;
      const collision = await db.prepare("SELECT book_id AS bookId FROM recipes WHERE id = ?").bind(recipe.id).first<{ bookId: string }>();
      if (collision && collision.bookId !== bookId) throw new Response(JSON.stringify({ error: "Идентификатор рецепта уже занят в другой книге." }), { status: 409, headers: { "Content-Type": "application/json" } });
      if (recipe.categoryId) {
        const category = await db.prepare("SELECT 1 AS found FROM categories WHERE id = ? AND book_id = ?").bind(recipe.categoryId, bookId).first();
        if (!category) throw new Response(JSON.stringify({ error: "Выбранная категория недоступна." }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      if (recipe.authorId) {
        const author = await db.prepare("SELECT 1 AS found FROM authors WHERE id = ? AND book_id = ?").bind(recipe.authorId, bookId).first();
        if (!author) throw new Response(JSON.stringify({ error: "Выбранный автор недоступен." }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const oldImages = await db.prepare("SELECT id, storage_key AS storageKey, thumbnail_storage_key AS thumbnailStorageKey FROM recipe_images WHERE book_id = ? AND recipe_id = ?").bind(bookId, recipe.id).all<{ id: string; storageKey: string; thumbnailStorageKey: string | null }>();
      const currentImageIds = new Set([recipe.coverImage, ...recipe.originalPageImages, ...recipe.steps.map((step) => step.image)].filter(Boolean).map((image) => image!.id));
      for (const image of oldImages.results) if (!currentImageIds.has(image.id)) { statements.push(db.prepare("DELETE FROM recipe_images WHERE id = ? AND book_id = ?").bind(image.id, bookId)); if (!image.storageKey.startsWith("/")) orphanedKeys.push(image.storageKey); if (image.thumbnailStorageKey && !image.thumbnailStorageKey.startsWith("/")) orphanedKeys.push(image.thumbnailStorageKey); }
      statements.push(db.prepare("INSERT INTO recipes (id, book_id, title, description, category_id, author_id, servings, prep_time_minutes, cook_time_minutes, note, family_story, tags_json, is_demo, created_at, updated_at, deleted_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, category_id=excluded.category_id, author_id=excluded.author_id, servings=excluded.servings, prep_time_minutes=excluded.prep_time_minutes, cook_time_minutes=excluded.cook_time_minutes, note=excluded.note, family_story=excluded.family_story, tags_json=excluded.tags_json, is_demo=excluded.is_demo, updated_at=excluded.updated_at, deleted_at=NULL, revision=excluded.revision WHERE recipes.book_id=excluded.book_id").bind(recipe.id, bookId, recipe.title.trim(), recipe.description, recipe.categoryId, recipe.authorId, recipe.servings, recipe.prepTimeMinutes, recipe.cookTimeMinutes, recipe.note, recipe.familyStory, JSON.stringify(recipe.tags.slice(0, 80)), recipe.isDemo ? 1 : 0, recipe.createdAt, recipe.updatedAt, recipe.revision));
      statements.push(db.prepare("DELETE FROM ingredients WHERE recipe_id = ? AND book_id = ?").bind(recipe.id, bookId));
      statements.push(db.prepare("DELETE FROM recipe_steps WHERE recipe_id = ? AND book_id = ?").bind(recipe.id, bookId));
      for (const item of recipe.ingredients) statements.push(db.prepare("INSERT INTO ingredients (id, recipe_id, book_id, name, amount, amount_text, unit, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(item.id, recipe.id, bookId, item.name.slice(0, 200), item.amount, item.amountText?.slice(0, 100) ?? null, item.unit.slice(0, 50), item.note ?? null, item.order));
      for (const step of recipe.steps) statements.push(db.prepare("INSERT INTO recipe_steps (id, recipe_id, book_id, text, sort_order) VALUES (?, ?, ?, ?, ?)").bind(step.id, recipe.id, bookId, step.text, step.order));
      const attach = [recipe.coverImage, ...recipe.originalPageImages, ...recipe.steps.map((step) => step.image)].filter(Boolean) as RecipeImage[];
      for (const image of attach) { const stepId = recipe.steps.find((step) => step.image?.id === image.id)?.id ?? null; statements.push(db.prepare("UPDATE recipe_images SET recipe_id = ?, step_id = ?, kind = ?, alt = ?, width = ?, height = ? WHERE id = ? AND book_id = ?").bind(recipe.id, stepId, image.kind, image.alt ?? null, image.width ?? null, image.height ?? null, image.id, bookId)); }
      break;
    }
    case "recipe.favorite":
      if (operation.favorite) statements.push(db.prepare("INSERT OR IGNORE INTO favorites (book_id, recipe_id, user_id, created_at) SELECT ?, id, ?, ? FROM recipes WHERE id = ? AND book_id = ?").bind(bookId, access.userId, operation.createdAt, operation.recipeId, bookId)); else statements.push(db.prepare("DELETE FROM favorites WHERE book_id = ? AND recipe_id = ? AND user_id = ?").bind(bookId, operation.recipeId, access.userId));
      break;
    case "recipe.delete": statements.push(db.prepare("UPDATE recipes SET deleted_at = ?, updated_at = ? WHERE id = ? AND book_id = ?").bind(operation.deletedAt, operation.createdAt, operation.recipeId, bookId)); break;
    case "recipe.restore": statements.push(db.prepare("UPDATE recipes SET deleted_at = NULL, updated_at = ? WHERE id = ? AND book_id = ?").bind(operation.createdAt, operation.recipeId, bookId)); break;
    case "recipe.deleteForever": {
      const images = await db.prepare("SELECT storage_key AS storageKey, thumbnail_storage_key AS thumbnailStorageKey FROM recipe_images WHERE book_id = ? AND recipe_id = ?").bind(bookId, operation.recipeId).all<{ storageKey: string; thumbnailStorageKey: string | null }>();
      for (const image of images.results) { if (!image.storageKey.startsWith("/")) orphanedKeys.push(image.storageKey); if (image.thumbnailStorageKey && !image.thumbnailStorageKey.startsWith("/")) orphanedKeys.push(image.thumbnailStorageKey); }
      statements.push(db.prepare("DELETE FROM recipes WHERE id = ? AND book_id = ?").bind(operation.recipeId, bookId)); break;
    }
    case "category.upsert": statements.push(db.prepare("INSERT INTO categories (id, book_id, name, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, icon=excluded.icon, sort_order=excluded.sort_order WHERE categories.book_id=excluded.book_id").bind(operation.category.id, bookId, operation.category.name.slice(0, 80), operation.category.icon.slice(0, 40), operation.category.order, operation.category.createdAt)); break;
    case "category.delete": statements.push(db.prepare("DELETE FROM categories WHERE id = ? AND book_id = ?").bind(operation.categoryId, bookId)); break;
    case "author.upsert": statements.push(db.prepare("INSERT INTO authors (id, book_id, name, avatar_url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, avatar_url=excluded.avatar_url, sort_order=excluded.sort_order WHERE authors.book_id=excluded.book_id").bind(operation.author.id, bookId, operation.author.name.slice(0, 100), operation.author.avatarUrl ?? null, operation.author.order, operation.author.createdAt)); break;
    case "author.delete": statements.push(db.prepare("DELETE FROM authors WHERE id = ? AND book_id = ?").bind(operation.authorId, bookId)); break;
    case "shopping.upsert": statements.push(db.prepare("INSERT INTO shopping_items (id, book_id, name, amount, amount_text, unit, checked, recipe_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, amount=excluded.amount, amount_text=excluded.amount_text, unit=excluded.unit, checked=excluded.checked, recipe_id=excluded.recipe_id, updated_at=excluded.updated_at WHERE shopping_items.book_id=excluded.book_id").bind(operation.item.id, bookId, operation.item.name.slice(0, 200), operation.item.amount, operation.item.amountText ?? null, operation.item.unit.slice(0, 50), operation.item.checked ? 1 : 0, operation.item.recipeId ?? null, operation.item.createdAt, operation.item.updatedAt)); break;
    case "shopping.delete": statements.push(db.prepare("DELETE FROM shopping_items WHERE id = ? AND book_id = ?").bind(operation.itemId, bookId)); break;
    case "shopping.clearChecked": statements.push(db.prepare("DELETE FROM shopping_items WHERE book_id = ? AND checked = 1").bind(bookId)); break;
    case "demo.clear": {
      const images = await db.prepare("SELECT i.storage_key AS storageKey, i.thumbnail_storage_key AS thumbnailStorageKey FROM recipe_images i JOIN recipes r ON r.id=i.recipe_id WHERE r.book_id=? AND r.is_demo=1").bind(bookId).all<{ storageKey: string; thumbnailStorageKey: string | null }>();
      for (const image of images.results) { if (!image.storageKey.startsWith("/")) orphanedKeys.push(image.storageKey); if (image.thumbnailStorageKey && !image.thumbnailStorageKey.startsWith("/")) orphanedKeys.push(image.thumbnailStorageKey); }
      statements.push(db.prepare("DELETE FROM recipes WHERE book_id = ? AND is_demo = 1").bind(bookId)); break;
    }
    default: throw new Response(JSON.stringify({ error: "Эта операция не поддерживается текущей версией книги." }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  markProcessed();
  statements.push(db.prepare("DELETE FROM processed_operations WHERE book_id = ? AND processed_at < datetime('now', '-90 days')").bind(bookId));
  await db.batch(statements);
  return { orphanedKeys };
}

export async function findImageForUser(access: BookAccess, id: string): Promise<{ storageKey: string; thumbnailStorageKey: string | null } | null> {
  return database().prepare("SELECT storage_key AS storageKey, thumbnail_storage_key AS thumbnailStorageKey FROM recipe_images WHERE id = ? AND book_id = ?").bind(id, access.book.id).first();
}

export async function registerImage(access: BookAccess, image: { id: string; kind: string; mainKey: string; thumbnailKey: string; alt: string; width: number | null; height: number | null; createdAt: string }): Promise<void> {
  assertEditor(access);
  const db = database();
  const collision = await db.prepare("SELECT book_id AS bookId FROM recipe_images WHERE id = ?").bind(image.id).first<{ bookId: string }>();
  if (collision && collision.bookId !== access.book.id) throw new Response(JSON.stringify({ error: "Идентификатор фотографии уже занят." }), { status: 409, headers: { "Content-Type": "application/json" } });
  await db.prepare("INSERT INTO recipe_images (id, book_id, recipe_id, step_id, kind, storage_key, thumbnail_storage_key, alt, width, height, created_at) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET storage_key=excluded.storage_key, thumbnail_storage_key=excluded.thumbnail_storage_key, alt=excluded.alt, width=excluded.width, height=excluded.height WHERE recipe_images.book_id=excluded.book_id").bind(image.id, access.book.id, image.kind, image.mainKey, image.thumbnailKey, image.alt, image.width, image.height, image.createdAt).run();
}
