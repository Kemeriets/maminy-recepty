import { env } from "cloudflare:workers";
import { assertSameOrigin, errorResponse, getRequestIdentity } from "../../../server/auth";
import { applyBookOperation, ensureBook } from "../../../server/book-store";
import type { BookOperation } from "../../../types/book";

export const dynamic = "force-dynamic";

function objectBucket(): R2Bucket | null { return (env as unknown as { BUCKET?: R2Bucket }).BUCKET ?? null; }

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 5_000_000) return Response.json({ error: "Пакет изменений слишком большой. Разделите импорт на части." }, { status: 413 });
    const payload = await request.json() as { operations?: BookOperation[] };
    if (!Array.isArray(payload.operations) || payload.operations.length < 1 || payload.operations.length > 1000) return Response.json({ error: "Нет изменений для сохранения или их слишком много." }, { status: 400 });
    const access = await ensureBook(getRequestIdentity(request));
    const bucket = objectBucket();
    let processed = 0;
    for (const operation of payload.operations) {
      const result = await applyBookOperation(access, operation);
      processed += 1;
      if (bucket) for (const key of result.orphanedKeys) await bucket.delete(key).catch(() => undefined);
    }
    return Response.json({ ok: true, processed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
