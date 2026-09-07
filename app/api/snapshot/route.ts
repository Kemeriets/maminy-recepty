import { errorResponse, getRequestIdentity } from "../../../server/auth";
import { ensureBook, loadSnapshot } from "../../../server/book-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await ensureBook(getRequestIdentity(request));
    const snapshot = await loadSnapshot(access);
    return Response.json({ snapshot }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
