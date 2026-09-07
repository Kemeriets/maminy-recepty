import { env } from "cloudflare:workers";
import { assertSameOrigin, errorResponse, getRequestIdentity } from "../../../server/auth";
import { ensureBook, registerImage } from "../../../server/book-store";
import type { RecipeImage, RecipeImageKind } from "../../../types/book";

export const dynamic = "force-dynamic";
const ALLOWED_TYPES = new Set(["image/webp", "image/jpeg", "image/png", "image/avif"]);
function bucket(): R2Bucket { const value = (env as unknown as { BUCKET?: R2Bucket }).BUCKET; if (!value) throw new Error("R2 binding BUCKET is unavailable"); return value; }
function extension(type: string) { return type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : type === "image/avif" ? "avif" : "webp"; }

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 8_000_000) return Response.json({ error: "Фотография слишком большая. Выберите её заново." }, { status: 413 });
    const access = await ensureBook(getRequestIdentity(request));
    const form = await request.formData();
    const id = String(form.get("id") || "");
    const kind = String(form.get("kind") || "") as RecipeImageKind;
    const alt = String(form.get("alt") || "").slice(0, 300);
    const width = Number(form.get("width") || 0) || null;
    const height = Number(form.get("height") || 0) || null;
    const main = form.get("main");
    const thumbnail = form.get("thumbnail");
    if (!/^image_[a-zA-Z0-9_-]{8,180}$/.test(id) || !["cover", "original", "step"].includes(kind)) return Response.json({ error: "Некорректные данные фотографии." }, { status: 400 });
    if (!(main instanceof File) || !(thumbnail instanceof File) || !ALLOWED_TYPES.has(main.type) || !ALLOWED_TYPES.has(thumbnail.type) || main.size > 4_500_000 || thumbnail.size > 1_000_000) return Response.json({ error: "Формат или размер фотографии не поддерживается." }, { status: 400 });
    const mainKey = `${access.book.id}/${id}/main.${extension(main.type)}`;
    const thumbnailKey = `${access.book.id}/${id}/thumb.${extension(thumbnail.type)}`;
    const storage = bucket();
    await storage.put(mainKey, main.stream(), { httpMetadata: { contentType: main.type, cacheControl: "private, max-age=31536000, immutable" }, customMetadata: { bookId: access.book.id, imageId: id } });
    try {
      await storage.put(thumbnailKey, thumbnail.stream(), { httpMetadata: { contentType: thumbnail.type, cacheControl: "private, max-age=31536000, immutable" }, customMetadata: { bookId: access.book.id, imageId: id } });
      const createdAt = new Date().toISOString();
      await registerImage(access, { id, kind, mainKey, thumbnailKey, alt, width, height, createdAt });
      const image: RecipeImage = { id, kind, url: `/api/images/${encodeURIComponent(id)}`, thumbnailUrl: `/api/images/${encodeURIComponent(id)}?variant=thumbnail`, alt, width, height, createdAt };
      return Response.json({ image }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      await Promise.all([storage.delete(mainKey), storage.delete(thumbnailKey)]).catch(() => undefined);
      throw error;
    }
  } catch (error) { return errorResponse(error); }
}
