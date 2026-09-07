import { unzipSync } from "fflate";
import { z } from "zod";
import { normalizeSearch } from "../features/book/logic";
import { createId, nowIso } from "../lib/ids";
import { prepareAndQueueImage } from "./image-service";
import type { Author, BackupFile, BookOperationInput, BookSnapshot, Category, Recipe, RecipeImage, RecipeImportFile } from "../types/book";

const imageSpecSchema = z.object({ fileName: z.string().min(1).optional(), dataUrl: z.string().startsWith("data:image/").optional(), alt: z.string().optional() }).refine((value) => value.fileName || value.dataUrl, "Нужно указать fileName или dataUrl");
const importSchema = z.object({
  schemaVersion: z.number().int().min(1).max(1),
  generatedAt: z.string().optional(),
  source: z.string().optional(),
  recipes: z.array(z.object({
    id: z.string().optional(), title: z.string().trim().min(1), description: z.string().optional(), category: z.string().optional(), author: z.string().optional(),
    servings: z.number().positive().nullable().optional(), prepTimeMinutes: z.number().nonnegative().nullable().optional(), cookTimeMinutes: z.number().nonnegative().nullable().optional(),
    ingredients: z.array(z.object({ name: z.string().trim().min(1), amount: z.union([z.number(), z.string(), z.null()]).optional(), unit: z.string().optional(), note: z.string().optional() })).min(1),
    steps: z.array(z.union([z.string().trim().min(1), z.object({ text: z.string().trim().min(1) })])).min(1),
    note: z.string().optional(), familyStory: z.string().optional(), tags: z.array(z.string()).optional(), coverImage: imageSpecSchema.nullable().optional(), originalPageImages: z.array(imageSpecSchema).optional(),
  })).min(1).max(1000),
});

export type DuplicateStrategy = "skip" | "replace" | "copy";

export interface LoadedImportPackage {
  data: RecipeImportFile;
  attachments: Map<string, Blob>;
  backup: BackupFile | null;
  fileName: string;
}

export interface PreparedImport {
  operations: BookOperationInput[];
  recipes: Recipe[];
  addedCategories: Category[];
  addedAuthors: Author[];
  skippedTitles: string[];
  warnings: string[];
}

export function validateImportData(candidate: unknown): RecipeImportFile {
  const validated = importSchema.safeParse(candidate);
  if (!validated.success) {
    const first = validated.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Файл не соответствует схеме: ${first}`);
  }
  return validated.data as RecipeImportFile;
}

function isBackup(value: unknown): value is BackupFile & { mediaIndex?: Record<string, string> } {
  const record = value as Partial<BackupFile>;
  return Boolean(record && typeof record === "object" && record.book && Array.isArray(record.categories) && Array.isArray(record.authors) && Array.isArray(record.recipes));
}

function mimeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "avif") return "image/avif";
  return "image/webp";
}

function normalizeAttachmentMap(map: Map<string, Blob>): Map<string, Blob> {
  const result = new Map<string, Blob>();
  for (const [name, blob] of map) {
    result.set(name, blob);
    const baseName = name.split("/").pop();
    if (baseName && !result.has(baseName)) result.set(baseName, blob);
  }
  return result;
}

export function backupToImport(backup: BackupFile & { mediaIndex?: Record<string, string> }, includeDeleted = false): RecipeImportFile {
  const categoryNames = new Map(backup.categories.map((item) => [item.id, item.name]));
  const authorNames = new Map(backup.authors.map((item) => [item.id, item.name]));
  const mediaIndex = backup.mediaIndex ?? {};
  return {
    schemaVersion: 1,
    generatedAt: backup.exportedAt,
    source: "backup",
    recipes: backup.recipes.filter((recipe) => includeDeleted || !recipe.deletedAt).map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      category: recipe.categoryId ? categoryNames.get(recipe.categoryId) : undefined,
      author: recipe.authorId ? authorNames.get(recipe.authorId) : undefined,
      servings: recipe.servings,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      ingredients: recipe.ingredients.map((item) => ({ name: item.name, amount: item.amount ?? item.amountText ?? null, unit: item.unit, note: item.note ?? undefined })),
      steps: recipe.steps.map((step) => step.text),
      note: recipe.note,
      familyStory: recipe.familyStory,
      tags: recipe.tags,
      coverImage: recipe.coverImage ? (mediaIndex[recipe.coverImage.id] ? { fileName: mediaIndex[recipe.coverImage.id], alt: recipe.coverImage.alt ?? undefined } : recipe.coverImage.url.startsWith("data:") ? { dataUrl: recipe.coverImage.url, alt: recipe.coverImage.alt ?? undefined } : undefined) : undefined,
      originalPageImages: recipe.originalPageImages.map((image) => mediaIndex[image.id] ? { fileName: mediaIndex[image.id], alt: image.alt ?? undefined } : image.url.startsWith("data:") ? { dataUrl: image.url, alt: image.alt ?? undefined } : null).filter(Boolean) as Array<{ fileName?: string; dataUrl?: string; alt?: string }>,
    })),
  };
}

export async function loadImportPackage(files: File[]): Promise<LoadedImportPackage> {
  const packageFile = files.find((file) => file.name.toLowerCase().endsWith(".zip")) ?? files.find((file) => file.name.toLowerCase().endsWith(".json"));
  if (!packageFile) throw new Error("Выберите JSON или ZIP с рецептами");
  const attachments = new Map<string, Blob>();
  for (const file of files) if (file !== packageFile && file.type.startsWith("image/")) attachments.set(file.name, file);
  let parsed: unknown;
  if (packageFile.name.toLowerCase().endsWith(".zip")) {
    let archive: Record<string, Uint8Array>;
    try { archive = unzipSync(new Uint8Array(await packageFile.arrayBuffer())); }
    catch { throw new Error("Не удалось открыть ZIP. Возможно, архив повреждён."); }
    const jsonPath = archive["recipes.json"] ? "recipes.json" : Object.keys(archive).find((name) => name.toLowerCase().endsWith(".json"));
    if (!jsonPath) throw new Error("В ZIP не найден JSON-файл с рецептами");
    try { parsed = JSON.parse(new TextDecoder().decode(archive[jsonPath])); }
    catch { throw new Error("JSON внутри архива повреждён"); }
    for (const [path, bytes] of Object.entries(archive)) if (/\.(png|jpe?g|webp|avif)$/i.test(path)) attachments.set(path, new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeForPath(path) }));
  } else {
    try {
      const bytes = await packageFile.arrayBuffer();
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    }
    catch {
      throw new Error("JSON-файл повреждён или содержит лишний текст");
    }
  }
  const backup = isBackup(parsed) ? parsed : null;
  const candidate = backup ? backupToImport(backup) : parsed;
  return { data: validateImportData(candidate), attachments: normalizeAttachmentMap(attachments), backup, fileName: packageFile.name };
}

function parseImportedAmount(value: number | string | null | undefined): { amount: number | null; amountText: string | null } {
  if (typeof value === "number" && Number.isFinite(value)) return { amount: value, amountText: null };
  if (value === null || value === undefined || !String(value).trim()) return { amount: null, amountText: null };
  const text = String(value).trim();
  const simple = text.replace(",", ".");
  if (/^\d+(?:\.\d+)?$/.test(simple)) return { amount: Number(simple), amountText: null };
  const fraction = simple.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (fraction) return { amount: Number(fraction[1] ?? 0) + Number(fraction[2]) / Number(fraction[3]), amountText: null };
  return { amount: null, amountText: text };
}

async function dataUrlBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function prepareImageSpec(spec: { fileName?: string; dataUrl?: string; alt?: string } | null | undefined, kind: "cover" | "original", attachments: Map<string, Blob>, fallbackAlt: string, warnings: string[]): Promise<RecipeImage | null> {
  if (!spec) return null;
  const blob = spec.dataUrl ? await dataUrlBlob(spec.dataUrl) : spec.fileName ? attachments.get(spec.fileName) : undefined;
  if (!blob) {
    warnings.push(`Не найдена фотография «${spec.fileName ?? "без имени"}»`);
    return null;
  }
  return prepareAndQueueImage(blob, kind, spec.alt || fallbackAlt);
}

export async function prepareImport(pkg: LoadedImportPackage, snapshot: BookSnapshot, strategy: DuplicateStrategy): Promise<PreparedImport> {
  const now = nowIso();
  const categories = [...snapshot.categories];
  const authors = [...snapshot.authors];
  const addedCategories: Category[] = [];
  const addedAuthors: Author[] = [];
  const recipes: Recipe[] = [];
  const skippedTitles: string[] = [];
  const warnings: string[] = [];

  const categoryByName = (name?: string) => {
    if (!name?.trim()) return null;
    let found = categories.find((item) => normalizeSearch(item.name) === normalizeSearch(name));
    if (!found) {
      found = { id: createId("category"), bookId: snapshot.book.id, name: name.trim(), icon: "bookmark", order: categories.length, createdAt: now };
      categories.push(found); addedCategories.push(found);
    }
    return found.id;
  };
  const authorByName = (name?: string) => {
    if (!name?.trim()) return null;
    let found = authors.find((item) => normalizeSearch(item.name) === normalizeSearch(name));
    if (!found) {
      found = { id: createId("author"), bookId: snapshot.book.id, name: name.trim(), avatarUrl: null, order: authors.length, createdAt: now };
      authors.push(found); addedAuthors.push(found);
    }
    return found.id;
  };

  for (const imported of pkg.data.recipes) {
    const duplicate = snapshot.recipes.find((item) => !item.deletedAt && normalizeSearch(item.title) === normalizeSearch(imported.title));
    if (duplicate && strategy === "skip") { skippedTitles.push(imported.title); continue; }
    const coverImage = await prepareImageSpec(imported.coverImage, "cover", pkg.attachments, `Фотография блюда ${imported.title}`, warnings);
    const originalPageImages: RecipeImage[] = [];
    for (const spec of imported.originalPageImages ?? []) {
      const image = await prepareImageSpec(spec, "original", pkg.attachments, `Оригинал рецепта ${imported.title}`, warnings);
      if (image) originalPageImages.push(image);
    }
    const recipeId = duplicate && strategy === "replace" ? duplicate.id : imported.id && !snapshot.recipes.some((item) => item.id === imported.id) ? imported.id : createId("recipe");
    const recipe: Recipe = {
      id: recipeId,
      bookId: snapshot.book.id,
      title: imported.title.trim(),
      description: imported.description?.trim() ?? "",
      categoryId: categoryByName(imported.category),
      authorId: authorByName(imported.author),
      coverImage: coverImage ?? (duplicate && strategy === "replace" ? duplicate.coverImage : null),
      originalPageImages: originalPageImages.length ? originalPageImages : (duplicate && strategy === "replace" ? duplicate.originalPageImages : []),
      servings: imported.servings ?? null,
      prepTimeMinutes: imported.prepTimeMinutes ?? null,
      cookTimeMinutes: imported.cookTimeMinutes ?? null,
      ingredients: imported.ingredients.map((item, order) => ({ id: createId("ing"), name: item.name.trim(), ...parseImportedAmount(item.amount), unit: item.unit?.trim() ?? "", note: item.note?.trim() || null, order })),
      steps: imported.steps.map((item, order) => ({ id: createId("step"), order, text: typeof item === "string" ? item.trim() : item.text.trim(), image: null })),
      note: imported.note?.trim() ?? "",
      familyStory: imported.familyStory?.trim() ?? "",
      tags: (imported.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      favorite: duplicate?.favorite ?? false,
      isDemo: false,
      createdAt: duplicate?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
      revision: (duplicate?.revision ?? 0) + 1,
    };
    recipes.push(recipe);
  }

  const operations: BookOperationInput[] = [
    ...addedCategories.map((category) => ({ type: "category.upsert" as const, category })),
    ...addedAuthors.map((author) => ({ type: "author.upsert" as const, author })),
    ...recipes.map((recipe) => ({ type: "recipe.upsert" as const, recipe })),
  ];
  return { operations, recipes, addedCategories, addedAuthors, skippedTitles, warnings };
}
