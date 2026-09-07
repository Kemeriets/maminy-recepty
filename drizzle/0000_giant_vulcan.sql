CREATE TABLE `authors` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_authors_book_name` ON `authors` (`book_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_authors_book_order` ON `authors` (`book_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `book_members` (
	`book_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text,
	`role` text DEFAULT 'editor' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`book_id`, `user_id`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_book_members_user` ON `book_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`family_name` text DEFAULT 'Семья' NOT NULL,
	`owner_user_id` text NOT NULL,
	`seeded_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT 'bookmark' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_categories_book_name` ON `categories` (`book_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_categories_book_order` ON `categories` (`book_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `favorites` (
	`book_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`recipe_id`, `user_id`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_favorites_book_user` ON `favorites` (`book_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`book_id` text NOT NULL,
	`name` text NOT NULL,
	`amount` real,
	`amount_text` text,
	`unit` text DEFAULT '' NOT NULL,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ingredients_recipe_order` ON `ingredients` (`recipe_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_ingredients_book_name` ON `ingredients` (`book_id`,`name`);--> statement-breakpoint
CREATE TABLE `processed_operations` (
	`book_id` text NOT NULL,
	`op_id` text NOT NULL,
	`user_id` text NOT NULL,
	`processed_at` text NOT NULL,
	PRIMARY KEY(`book_id`, `op_id`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_processed_operations_date` ON `processed_operations` (`book_id`,`processed_at`);--> statement-breakpoint
CREATE TABLE `recipe_images` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`recipe_id` text,
	`step_id` text,
	`kind` text NOT NULL,
	`storage_key` text NOT NULL,
	`thumbnail_storage_key` text,
	`alt` text,
	`width` integer,
	`height` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`step_id`) REFERENCES `recipe_steps`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_images_recipe` ON `recipe_images` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_recipe_images_book` ON `recipe_images` (`book_id`);--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`book_id` text NOT NULL,
	`text` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_steps_recipe_order` ON `recipe_steps` (`recipe_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category_id` text,
	`author_id` text,
	`servings` real,
	`prep_time_minutes` integer,
	`cook_time_minutes` integer,
	`note` text DEFAULT '' NOT NULL,
	`family_story` text DEFAULT '' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_recipes_book_deleted_updated` ON `recipes` (`book_id`,`deleted_at`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_recipes_book_category` ON `recipes` (`book_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `idx_recipes_book_author` ON `recipes` (`book_id`,`author_id`);--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`name` text NOT NULL,
	`amount` real,
	`amount_text` text,
	`unit` text DEFAULT '' NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`recipe_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_shopping_book_checked_created` ON `shopping_items` (`book_id`,`checked`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
