// A small, stateless transfer relay. OAuth stays on the device and is only
// forwarded to the Yandex Disk API; binary photos stay in the private app folder.
// This code is deployed separately from the public GitHub Pages frontend.
const DISK_API = "https://cloud-api.yandex.net/v1/disk";
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const APP_ORIGIN = "https://kemeriets.github.io";

function reply(status: number, message: string, origin: string, stage?: "disk-api" | "signed-link" | "transfer" | "relay"): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Expose-Headers": "X-Photo-Relay-Stage",
      ...(stage ? { "X-Photo-Relay-Stage": stage } : {}),
      Vary: "Origin",
    },
  });
}

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  // The relay's own origin is permitted for a private deployment check.
  const ownOrigin = new URL(request.url).origin;
  return origin === APP_ORIGIN || origin === ownOrigin ? origin : null;
}

function validTransferUrl(value: unknown, method: "GET" | "PUT"): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password) return null;
    const hostname = url.hostname;
    // Disk rotates its numbered transfer hosts (for example
    // uploader12g.disk.yandex.net). Only exact transfer prefixes on Yandex's
    // Disk subdomains are allowed; URLs supplied by an outside host are not.
    if (method === "GET" && (/^downloader[a-z0-9]*\.disk\.yandex\.(?:ru|net)$/u.test(hostname) || hostname.endsWith(".storage.yandex.net"))) return url;
    if (method === "PUT" && (/^uploader[a-z0-9]*\.disk\.yandex\.(?:ru|net)$/u.test(hostname) || hostname.endsWith(".storage.yandex.net"))) return url;
  } catch { /* Malformed signed URL. */ }
  return null;
}

async function fetchSignedFile(url: URL, method: "GET" | "PUT", bytes: ArrayBuffer | undefined, type: string | null): Promise<Response> {
  let current = url;
  for (let count = 0; count < 3; count += 1) {
    const response = await fetch(current, {
      method,
      ...(bytes ? { body: bytes, headers: { "Content-Type": type! } } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    // Yandex can redirect a download to a separate storage host. Follow only
    // HTTPS URLs owned by Yandex; never pass the OAuth token to a file host.
    if (method === "GET" && [301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("Location");
      const next = location ? validTransferUrl(new URL(location, current).toString(), method) : null;
      if (!next) throw new Error("Unsafe transfer redirect");
      current = next;
      continue;
    }
    return response;
  }
  throw new Error("Too many transfer redirects");
}

export default async function privatePhotos(request: Request): Promise<Response> {
  const origin = allowedOrigin(request);
  if (!origin) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "600",
        "Cache-Control": "no-store",
        Vary: "Origin",
      },
    });
  }
  if (request.method !== "GET" && request.method !== "PUT") return reply(405, "Method not allowed", origin);
  const url = new URL(request.url);
  const id = url.pathname.match(/^\/media\/([a-zA-Z0-9_-]{1,100})$/u)?.[1];
  if (!id) return reply(400, "Invalid photo ID", origin);
  // An unsigned public URL can check if the relay exists, but never access a photo.
  if (id === "health" && request.method === "GET") return reply(200, "ready", origin);
  if (url.searchParams.getAll("variant").length > 1 || [...url.searchParams.keys()].some((key) => key !== "variant") || (url.searchParams.has("variant") && !["main", "thumbnail"].includes(url.searchParams.get("variant")!))) return reply(400, "Invalid variant", origin);
  const auth = request.headers.get("Authorization") ?? "";
  if (!/^OAuth \S{16,4096}$/u.test(auth)) return reply(401, "Yandex login required", origin);
  const variant = url.searchParams.get("variant") === "thumbnail" ? "-thumb" : "";
  const path = `app:/images/${id}${variant}.webp`;
  let bytes: ArrayBuffer | undefined;
  if (request.method === "PUT") {
    if (!/^image\/(webp|jpeg)$/u.test(request.headers.get("Content-Type") ?? "")) return reply(415, "Unsupported photo type", origin);
    if (Number(request.headers.get("Content-Length")) > MAX_PHOTO_BYTES) return reply(413, "Photo too large", origin);
    bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return reply(413, "Photo too large", origin);
  }
  try {
    const endpoint = new URL(`${DISK_API}/resources/${request.method === "PUT" ? "upload" : "download"}`);
    endpoint.searchParams.set("path", path);
    if (request.method === "PUT") endpoint.searchParams.set("overwrite", "true");
    const linkResponse = await fetch(endpoint, {
      headers: { Authorization: auth, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!linkResponse.ok) return reply([401, 403, 404, 429, 507].includes(linkResponse.status) ? linkResponse.status : 502, "Yandex Disk unavailable", origin, "disk-api");
    const transfer = await linkResponse.json() as { href?: unknown; method?: unknown };
    const method = request.method as "GET" | "PUT";
    const signed = validTransferUrl(transfer.href, method);
    if (!signed || (transfer.method && transfer.method !== method)) return reply(502, "Invalid Yandex transfer link", origin, "signed-link");
    const fileResponse = await fetchSignedFile(signed, method, bytes, request.headers.get("Content-Type"));
    if (!fileResponse.ok) return reply(fileResponse.status >= 400 && fileResponse.status < 500 ? fileResponse.status : 502, "Photo transfer failed", origin, "transfer");
    if (method === "PUT") return reply(201, "saved", origin);
    const length = Number(fileResponse.headers.get("Content-Length"));
    if (length > MAX_PHOTO_BYTES) return reply(502, "Photo too large", origin);
    return new Response(fileResponse.body, {
      status: 200,
      headers: {
        "Content-Type": fileResponse.headers.get("Content-Type")?.startsWith("image/") ? fileResponse.headers.get("Content-Type")! : "image/webp",
        "Cache-Control": "private, no-store",
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
      },
    });
  } catch {
    return reply(502, "Photo transfer unavailable", origin, "relay");
  }
}
