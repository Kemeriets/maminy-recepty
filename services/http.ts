// Bound network waits without losing local changes or the retry queue.
export type NetworkRequestStage = "api" | "transfer" | "upload" | "download";

/** A fetch/body failure with a safe, static phase label for the UI. */
export class NetworkRequestError extends Error {
  constructor(readonly stage: NetworkRequestStage, readonly timedOut: boolean, cause?: unknown) {
    super(timedOut ? "Сетевой запрос не ответил вовремя" : "Сетевой запрос не выполнен");
    this.name = "NetworkRequestError";
    if (cause !== undefined) this.cause = cause;
  }
}

function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === "AbortError";
}

function wrapNetworkError(value: unknown, stage: NetworkRequestStage): unknown {
  if (value instanceof NetworkRequestError) return value;
  if (isAbortError(value)) return new NetworkRequestError(stage, true, value);
  if (value instanceof TypeError) return new NetworkRequestError(stage, false, value);
  return value;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 20000,
  stage: NetworkRequestStage = "api",
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  catch (error) { throw wrapNetworkError(error, stage); }
  finally { clearTimeout(timer); }
}

/**
 * Read a small JSON response while retaining a timeout after headers arrive.
 * `Response.json()` can otherwise wait forever on a stalled mobile connection.
 */
export async function readResponseJson<T>(response: Response, timeoutMs = 20000, stage: NetworkRequestStage = "api"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new NetworkRequestError(stage, true)), timeoutMs);
  });
  try {
    return await Promise.race([response.json() as Promise<T>, timeout]);
  } catch (error) {
    const wrapped = wrapNetworkError(error, stage);
    if (wrapped !== error || error instanceof SyntaxError) throw wrapped;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Retry only idempotent reads. Writes are deliberately never retried here. */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 20000,
  stage: NetworkRequestStage = "api",
  attempts = 2,
): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  const canRetry = method === "GET" || method === "HEAD";
  const totalAttempts = canRetry ? Math.max(1, attempts) : 1;
  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      return await fetchWithTimeout(input, init, timeoutMs, stage);
    } catch (error) {
      if (attempt + 1 >= totalAttempts || !(error instanceof NetworkRequestError)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw new NetworkRequestError(stage, false);
}
