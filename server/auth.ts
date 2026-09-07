export interface RequestIdentity { userId: string; email: string | null; }

export function getRequestIdentity(request: Request): RequestIdentity {
  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (userId) return { userId, email };
  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "terminal.local") return { userId: "local-user", email: "local@example.invalid" };
  throw new Response(JSON.stringify({ error: "Чтобы открыть семейную книгу, войдите в разрешённый аккаунт." }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Response(JSON.stringify({ error: "Запрос отклонён из соображений безопасности." }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
export function errorResponse(error: unknown): Response {
  if (error instanceof Response) return error;
  console.error("Recipe book request failed", error);
  const message = error instanceof Error && /D1_ERROR|no such table|binding/i.test(error.message) ? "Хранилище книги ещё не готово. Попробуйте открыть страницу через минуту." : "Не удалось выполнить действие. Проверьте интернет и попробуйте ещё раз.";
  return Response.json({ error: message }, { status: 500 });
}
