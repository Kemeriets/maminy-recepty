import { createId, nowIso } from "../lib/ids";
import { savePendingImage, type PendingImage } from "./local-store";
import type { RecipeImage, RecipeImageKind } from "../types/book";

interface EncodedImage {
  blob: Blob;
  width: number;
  height: number;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Не удалось обработать фотографию")), type, quality));
}

async function resizeImage(file: Blob, maxSide: number, quality: number): Promise<EncodedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Не удалось обработать фотографию");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob: Blob;
  try {
    blob = await canvasToBlob(canvas, "image/webp", quality);
  } catch {
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
  }
  return { blob, width, height };
}

export async function prepareImage(file: File | Blob, kind: RecipeImageKind, alt: string): Promise<{ pending: PendingImage; preview: RecipeImage }> {
  const id = createId("image");
  const maxSide = kind === "original" ? 2400 : 1600;
  const quality = kind === "original" ? 0.9 : 0.82;
  const [main, thumbnail] = await Promise.all([
    resizeImage(file, maxSide, quality),
    resizeImage(file, 520, 0.76),
  ]);
  const createdAt = nowIso();
  const pending: PendingImage = {
    id,
    kind,
    main: main.blob,
    thumbnail: thumbnail.blob,
    alt,
    width: main.width,
    height: main.height,
    createdAt,
  };
  const [url, thumbnailUrl] = await Promise.all([blobToDataUrl(main.blob), blobToDataUrl(thumbnail.blob)]);
  return {
    pending,
    preview: { id, kind, url, thumbnailUrl, alt, width: main.width, height: main.height, createdAt },
  };
}

export async function prepareAndQueueImage(file: File | Blob, kind: RecipeImageKind, alt: string): Promise<RecipeImage> {
  const prepared = await prepareImage(file, kind, alt);
  await savePendingImage(prepared.pending);
  return prepared.preview;
}

export async function uploadPendingImage(image: PendingImage): Promise<RecipeImage> {
  const form = new FormData();
  form.append("id", image.id);
  form.append("kind", image.kind);
  form.append("alt", image.alt);
  form.append("width", String(image.width));
  form.append("height", String(image.height));
  form.append("main", image.main, `${image.id}.webp`);
  form.append("thumbnail", image.thumbnail, `${image.id}-thumb.webp`);
  const response = await fetch("/api/images", { method: "POST", body: form });
  const body = await response.json().catch(() => ({})) as { image?: RecipeImage; error?: string };
  if (!response.ok || !body.image) throw new Error(body.error ?? "Не удалось загрузить фотографию");
  return body.image;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать фотографию"));
    reader.readAsDataURL(blob);
  });
}
