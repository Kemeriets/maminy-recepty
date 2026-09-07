import { env } from "cloudflare:workers";
import { errorResponse, getRequestIdentity } from "../../../../server/auth";
import { ensureBook, findImageForUser } from "../../../../server/book-store";

export const dynamic = "force-dynamic";
function bucket(): R2Bucket { const value = (env as unknown as { BUCKET?: R2Bucket }).BUCKET; if (!value) throw new Error("R2 binding BUCKET is unavailable"); return value; }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await ensureBook(getRequestIdentity(request));
    const { id } = await params;
    if (!/^image_[a-zA-Z0-9_-]{8,180}$/.test(id)) return new Response("Не найдено", { status: 404 });
    const image = await findImageForUser(access, id);
    if (!image) return new Response("Не найдено", { status: 404 });
    const variant = new URL(request.url).searchParams.get("variant");
    const key = variant === "thumbnail" && image.thumbnailStorageKey ? image.thumbnailStorageKey : image.storageKey;
    if (key.startsWith("/")) return Response.redirect(new URL(key, request.url), 302);
    const object = await bucket().get(key, { onlyIf: request.headers });
    if (!object) return new Response("Не найдено", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "private, max-age=31536000, immutable");
    headers.set("X-Content-Type-Options", "nosniff");
    if (!("body" in object)) return new Response(null, { status: 304, headers });
    return new Response(object.body, { headers });
  } catch (error) { return errorResponse(error); }
}
