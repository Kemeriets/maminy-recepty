import { strToU8, unzipSync, zipSync } from "fflate";
import { APP_CONFIG } from "../config/app.config";
import { CURRENT_SCHEMA_VERSION, type BackupFile, type BookSnapshot, type RecipeImage } from "../types/book";

interface ZipBackupFile extends BackupFile {
  mediaIndex: Record<string, string>;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function createBackupObject(snapshot: BookSnapshot): BackupFile {
  return { ...snapshot, schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: new Date().toISOString(), appVersion: APP_CONFIG.version };
}

export function downloadJsonBackup(snapshot: BookSnapshot): void {
  const data = JSON.stringify(createBackupObject(snapshot), null, 2);
  download(new Blob([data], { type: "application/json;charset=utf-8" }), `maminy-recepty-${dateStamp()}.json`);
}

function extensionFromType(type: string): string {
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("avif")) return "avif";
  return "webp";
}

async function urlToBytes(url: string): Promise<{ bytes: Uint8Array; type: string }> {
  if (url.startsWith("data:")) {
    const response = await fetch(url);
    const blob = await response.blob();
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type };
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Не удалось добавить фотографию в копию: ${url}`);
  const blob = await response.blob();
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type };
}

function everyImage(snapshot: BookSnapshot): RecipeImage[] {
  const images: RecipeImage[] = [];
  for (const recipe of snapshot.recipes) {
    if (recipe.coverImage) images.push(recipe.coverImage);
    images.push(...recipe.originalPageImages);
    for (const step of recipe.steps) if (step.image) images.push(step.image);
  }
  return images;
}

export async function createZipBackup(snapshot: BookSnapshot): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const mediaIndex: Record<string, string> = {};
  const images = Array.from(new Map(everyImage(snapshot).map((image) => [image.id, image])).values());
  for (const image of images) {
    const main = await urlToBytes(image.url);
    const folder = image.kind === "original" ? "original-pages" : "images";
    const mainPath = `${folder}/${image.id}.${extensionFromType(main.type)}`;
    files[mainPath] = main.bytes;
    mediaIndex[image.id] = mainPath;
    if (image.thumbnailUrl && image.thumbnailUrl !== image.url) {
      const thumb = await urlToBytes(image.thumbnailUrl);
      files[`${folder}/${image.id}-thumb.${extensionFromType(thumb.type)}`] = thumb.bytes;
    }
  }
  const portable: ZipBackupFile = { ...createBackupObject(snapshot), mediaIndex };
  files["recipes.json"] = strToU8(JSON.stringify(portable, null, 2));
  files["README.txt"] = strToU8("Резервная копия приложения «Рецепты». Для восстановления загрузите этот ZIP в разделе «Импорт и восстановление».\n");
  return zipSync(files, { level: 6 });
}

export async function downloadZipBackup(snapshot: BookSnapshot): Promise<void> {
  const zipped = await createZipBackup(snapshot);
  download(new Blob([zipped.slice().buffer as ArrayBuffer], { type: "application/zip" }), `maminy-recepty-full-${dateStamp()}.zip`);
}

export async function readJsonFile(file: File): Promise<unknown> {
  try { return JSON.parse(new TextDecoder().decode(await file.arrayBuffer())); }
  catch { throw new Error("Файл не похож на корректный JSON"); }
}

export async function readZipBackup(file: File): Promise<{ backup: ZipBackupFile; media: Map<string, Blob> }> {
  let archive: Record<string, Uint8Array>;
  try { archive = unzipSync(new Uint8Array(await file.arrayBuffer())); }
  catch { throw new Error("Не удалось открыть ZIP-архив"); }
  const jsonBytes = archive["recipes.json"];
  if (!jsonBytes) throw new Error("В архиве нет файла recipes.json");
  let backup: ZipBackupFile;
  try { backup = JSON.parse(new TextDecoder().decode(jsonBytes)) as ZipBackupFile; }
  catch { throw new Error("Файл recipes.json внутри архива повреждён"); }
  if (backup.schemaVersion !== CURRENT_SCHEMA_VERSION || !Array.isArray(backup.recipes)) throw new Error("Версия резервной копии пока не поддерживается");
  const media = new Map<string, Blob>();
  for (const [imageId, path] of Object.entries(backup.mediaIndex ?? {})) {
    const bytes = archive[path];
    if (!bytes) continue;
    const extension = path.split(".").pop()?.toLowerCase();
    const type = extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "avif" ? "image/avif" : "image/webp";
    media.set(imageId, new Blob([bytes.slice().buffer as ArrayBuffer], { type }));
  }
  return { backup, media };
}
