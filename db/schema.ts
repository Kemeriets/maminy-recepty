import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const books = sqliteTable("books", {
  id: text("id").primaryKey(), name: text("name").notNull(), familyName: text("family_name").notNull().default("Семья"),
  ownerUserId: text("owner_user_id").notNull(), seededAt: text("seeded_at"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const bookMembers = sqliteTable("book_members", {
  bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), userId: text("user_id").notNull(), email: text("email"),
  role: text("role", { enum: ["owner", "editor", "viewer"] }).notNull().default("editor"), createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.bookId, table.userId] }), index("idx_book_members_user").on(table.userId)]);
export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), name: text("name").notNull(), icon: text("icon").notNull().default("bookmark"), sortOrder: integer("sort_order").notNull().default(0), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("uq_categories_book_name").on(table.bookId, table.name), index("idx_categories_book_order").on(table.bookId, table.sortOrder)]);
export const authors = sqliteTable("authors", {
  id: text("id").primaryKey(), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), name: text("name").notNull(), avatarUrl: text("avatar_url"), sortOrder: integer("sort_order").notNull().default(0), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("uq_authors_book_name").on(table.bookId, table.name), index("idx_authors_book_order").on(table.bookId, table.sortOrder)]);
export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), title: text("title").notNull(), description: text("description").notNull().default(""),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }), authorId: text("author_id").references(() => authors.id, { onDelete: "set null" }), servings: real("servings"), prepTimeMinutes: integer("prep_time_minutes"), cookTimeMinutes: integer("cook_time_minutes"),
  note: text("note").notNull().default(""), familyStory: text("family_story").notNull().default(""), tagsJson: text("tags_json").notNull().default("[]"), isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(), deletedAt: text("deleted_at"), revision: integer("revision").notNull().default(1),
}, (table) => [index("idx_recipes_book_deleted_updated").on(table.bookId, table.deletedAt, table.updatedAt), index("idx_recipes_book_category").on(table.bookId, table.categoryId), index("idx_recipes_book_author").on(table.bookId, table.authorId)]);
export const ingredients = sqliteTable("ingredients", {
  id: text("id").primaryKey(), recipeId: text("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  name: text("name").notNull(), amount: real("amount"), amountText: text("amount_text"), unit: text("unit").notNull().default(""), note: text("note"), sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [index("idx_ingredients_recipe_order").on(table.recipeId, table.sortOrder), index("idx_ingredients_book_name").on(table.bookId, table.name)]);
export const recipeSteps = sqliteTable("recipe_steps", {
  id: text("id").primaryKey(), recipeId: text("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), text: text("text").notNull(), sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [index("idx_recipe_steps_recipe_order").on(table.recipeId, table.sortOrder)]);
export const recipeImages = sqliteTable("recipe_images", {
  id: text("id").primaryKey(), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), recipeId: text("recipe_id").references(() => recipes.id, { onDelete: "cascade" }), stepId: text("step_id").references(() => recipeSteps.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["cover", "original", "step"] }).notNull(), storageKey: text("storage_key").notNull(), thumbnailStorageKey: text("thumbnail_storage_key"), alt: text("alt"), width: integer("width"), height: integer("height"), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_recipe_images_recipe").on(table.recipeId), index("idx_recipe_images_book").on(table.bookId)]);
export const favorites = sqliteTable("favorites", {
  bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), recipeId: text("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }), userId: text("user_id").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.recipeId, table.userId] }), index("idx_favorites_book_user").on(table.bookId, table.userId)]);
export const shoppingItems = sqliteTable("shopping_items", {
  id: text("id").primaryKey(), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), name: text("name").notNull(), amount: real("amount"), amountText: text("amount_text"), unit: text("unit").notNull().default(""), checked: integer("checked", { mode: "boolean" }).notNull().default(false),
  recipeId: text("recipe_id").references(() => recipes.id, { onDelete: "set null" }), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_shopping_book_checked_created").on(table.bookId, table.checked, table.createdAt)]);
export const processedOperations = sqliteTable("processed_operations", {
  bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), opId: text("op_id").notNull(), userId: text("user_id").notNull(), processedAt: text("processed_at").notNull(),
}, (table) => [primaryKey({ columns: [table.bookId, table.opId] }), index("idx_processed_operations_date").on(table.bookId, table.processedAt)]);
