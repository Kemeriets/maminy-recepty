import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoSnapshot } from "../features/book/demo-data";
import type { BookOperation } from "../types/book";

const storage = vi.hoisted(() => ({ getCloudAuth: vi.fn(), clearCloudAuth: vi.fn(), cacheImageBlob: vi.fn(), setCloudAuth: vi.fn() }));
vi.mock("../services/local-store", () => storage);

describe("синхронизация через API папки приложения Яндекса", () => {
  const directories = new Set<string>();
  const metadata = new Map<string, Record<string, unknown>>();
  const requests: Array<{ path: string; method: string }> = [];
  let deny = 0;
  let existing = false;
  let conflictingFile = false;
  let downloadFailures = 0;
  let downloadLinks = 0;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.searchParams.get("path") ?? "";
    requests.push({ path: url.pathname + ":" + path, method });
    if (url.hostname === "upload.example.com") return new Response(null, { status: 201 });
    if (url.hostname === "family-photo-relay.netlify.app") return new Response(null, { status: 201 });
    if (url.hostname === "download.example.com") {
      if (downloadFailures > 0) { downloadFailures -= 1; throw new TypeError("temporary transfer failure"); }
      return Response.json(operation);
    }
    if (deny) return Response.json({ error: deny === 403 ? "ForbiddenError" : "UnauthorizedError", message: "internal details" }, { status: deny });
    if (url.pathname.endsWith("/resources") && method === "PUT") {
      if (existing || directories.has(path)) return Response.json({ error: "DiskResourceAlreadyExistsError" }, { status: 409 });
      directories.add(path);
      return Response.json({ href: "https://example.com/resource" }, { status: 201 });
    }
    if (url.pathname.endsWith("/resources") && method === "PATCH") {
      const body = JSON.parse(String(init?.body)) as { custom_properties?: Record<string, unknown> };
      metadata.set(path, body.custom_properties ?? {});
      return Response.json({ path, custom_properties: body.custom_properties });
    }
    if (url.pathname.endsWith("/resources") && method === "GET") {
      if (path === "app:/operation-metadata-v2" && url.searchParams.get("fields")?.includes("_embedded")) {
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 1000);
        const items = [...metadata.entries()]
          .filter(([itemPath]) => itemPath.startsWith(`${path}/`))
          .slice(offset, offset + limit)
          .map(([itemPath, custom_properties]) => ({ name: itemPath.slice(path.length + 1), type: "dir", custom_properties }));
        return Response.json({ _embedded: { items } });
      }
      return Response.json({ type: conflictingFile ? "file" : "dir" });
    }
    if (url.pathname.endsWith("/resources/upload")) {
      if (!existing && !directories.has(path.slice(0, path.lastIndexOf("/")))) return Response.json({ error: "DiskPathDoesntExistsError" }, { status: 404 });
      return Response.json({ href: "https://upload.example.com/book", method: "PUT" });
    }
    if (url.pathname.endsWith("/resources/download")) {
      downloadLinks += 1;
      return Response.json({ href: `https://download.example.com/book-${downloadLinks}`, method: "GET" });
    }
    throw new Error(`Unexpected test request: ${method} ${url}`);
  });

  const operation: BookOperation = { opId: "offline-operation", createdAt: "2026-09-15T00:00:00Z", type: "demo.clear" };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    directories.clear();
    metadata.clear();
    requests.length = 0;
    deny = 0;
    existing = false;
    conflictingFile = false;
    downloadFailures = 0;
    downloadLinks = 0;
    storage.getCloudAuth.mockResolvedValue({ accessToken: "fixture-token", expiresAt: null });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { __MAMINY_RECIPES_CONFIG__: { provider: "yandex-disk", assetBase: "./" } });
    vi.stubGlobal("document", { baseURI: "https://example.com/recipes/" });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("создаёт служебные папки и сохраняет текст без файлового CDN", async () => {
    const { uploadYandexOperation } = await import("../services/yandex-disk-service");
    await uploadYandexOperation(operation);
    expect(requests.slice(0, 5)).toEqual([
      { path: "/v1/disk/resources:app:/operations", method: "PUT" },
      { path: "/v1/disk/resources:app:/operation-metadata-v2", method: "PUT" },
      { path: "/v1/disk/resources:app:/images", method: "PUT" },
      { path: "/v1/disk/resources:app:/operation-metadata-v2/m2-offline-operation-000", method: "PUT" },
      { path: "/v1/disk/resources:app:/operation-metadata-v2/m2-offline-operation-000", method: "PATCH" },
    ]);
    expect(requests.some((request) => request.path.includes("/resources/upload:"))).toBe(false);
  });

  it("читает обратно операцию только через основной API", async () => {
    const { listYandexMetadataOperations, uploadYandexOperation } = await import("../services/yandex-disk-service");
    await uploadYandexOperation(operation);
    await expect(listYandexMetadataOperations()).resolves.toEqual([operation]);
    expect(requests.some((request) => request.path.includes("/resources/download:"))).toBe(false);
  });

  it("разбивает крупную запись на части и собирает без потерь", async () => {
    const recipe = { ...createDemoSnapshot().recipes[0], id: "large", description: Array.from({ length: 1600 }, (_, index) => `${index.toString(36)}-${String.fromCharCode(1040 + index % 32)}`).join(" ") };
    const largeOperation: BookOperation = { opId: "large-operation", createdAt: operation.createdAt, type: "recipe.upsert", recipe };
    const { listYandexMetadataOperations, uploadYandexOperation } = await import("../services/yandex-disk-service");
    await uploadYandexOperation(largeOperation);
    expect([...metadata.values()].filter((value) => value.op === largeOperation.opId).length).toBeGreaterThan(1);
    await expect(listYandexMetadataOperations()).resolves.toEqual([largeOperation]);
  });

  it("игнорирует незавершённую запись вместо показа повреждённого рецепта", async () => {
    const recipe = { ...createDemoSnapshot().recipes[0], id: "large", description: Array.from({ length: 1600 }, (_, index) => `${index}-${index * 17}`).join(" ") };
    const largeOperation: BookOperation = { opId: "large-operation", createdAt: operation.createdAt, type: "recipe.upsert", recipe };
    const { listYandexMetadataOperations, uploadYandexOperation } = await import("../services/yandex-disk-service");
    await uploadYandexOperation(largeOperation);
    metadata.delete([...metadata.keys()].find((path) => path.endsWith("-001"))!);
    await expect(listYandexMetadataOperations()).resolves.toEqual([]);
  });

  it("объединяет создание служебных папок при одновременных отправках", async () => {
    const { uploadYandexOperation } = await import("../services/yandex-disk-service");
    await Promise.all([uploadYandexOperation(operation), uploadYandexOperation({ ...operation, opId: "second" })]);
    const roots = ["app:/operations", "app:/operation-metadata-v2", "app:/images"];
    expect(requests.filter((request) => request.method === "PUT" && roots.some((root) => request.path.endsWith(`:${root}`)))).toHaveLength(3);
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(2);
  });

  it("создаёт служебные папки до отправки фото и его миниатюры", async () => {
    const { uploadYandexImage } = await import("../services/yandex-disk-service");
    const blob = new Blob(["photo"], { type: "image/webp" });
    await uploadYandexImage({ id: "photo", kind: "cover", main: blob, thumbnail: blob, alt: "", width: 10, height: 10, createdAt: operation.createdAt });
    expect(directories).toEqual(new Set(["app:/operations", "app:/operation-metadata-v2", "app:/images"]));
    expect(requests.filter((request) => request.path.startsWith("/v1/disk/resources/upload:"))).toHaveLength(2);
  });

  it("отправляет фото через приватную службу, если она настроена, без прямой передачи в заблокированный файловый сервер", async () => {
    vi.stubGlobal("window", { __MAMINY_RECIPES_CONFIG__: { provider: "yandex-disk", assetBase: "./", mediaProxyUrl: "https://family-photo-relay.netlify.app/media" } });
    const { uploadYandexImage } = await import("../services/yandex-disk-service");
    const blob = new Blob(["photo"], { type: "image/webp" });
    await uploadYandexImage({ id: "photo", kind: "cover", main: blob, thumbnail: blob, alt: "", width: 10, height: 10, createdAt: operation.createdAt });
    expect(requests.filter((item) => item.path.startsWith("/media/photo:") && item.method === "PUT")).toHaveLength(2);
    expect(requests.filter((item) => item.path.startsWith("/v1/disk/resources/upload:"))).toHaveLength(0);
  });

  it("проверяет, что существующий ресурс действительно папка", async () => {
    existing = true;
    const { uploadYandexOperation } = await import("../services/yandex-disk-service");
    await uploadYandexOperation(operation);
    expect(requests.filter((request) => request.method === "GET" && request.path.startsWith("/v1/disk/resources:")).length).toBeGreaterThanOrEqual(4);
  });

  it("не перезаписывает файл, оказавшийся на месте папки", async () => {
    existing = true;
    conflictingFile = true;
    const { uploadYandexOperation } = await import("../services/yandex-disk-service");
    await expect(uploadYandexOperation(operation)).rejects.toMatchObject({ status: 409, code: "DiskExpectedDirectoryError" });
    expect(requests.some((request) => request.method === "PATCH")).toBe(false);
  });

  it("сохраняет причину отказа и позволяет повторить после исправления разрешения", async () => {
    deny = 403;
    const { uploadYandexOperation } = await import("../services/yandex-disk-service");
    await expect(uploadYandexOperation(operation)).rejects.toMatchObject({ status: 403, code: "ForbiddenError" });
    expect(storage.clearCloudAuth).not.toHaveBeenCalled();
    deny = 0;
    await expect(uploadYandexOperation(operation)).resolves.toBeUndefined();
    expect(directories.has("app:/operation-metadata-v2")).toBe(true);
  });

  it("при недействительном токене запрашивает повторный вход", async () => {
    deny = 401;
    const { uploadYandexOperation } = await import("../services/yandex-disk-service");
    await expect(uploadYandexOperation(operation)).rejects.toMatchObject({ status: 401 });
    expect(storage.clearCloudAuth).toHaveBeenCalledOnce();
  });

  it("сохраняет совместимость со старой записью и обновляет временную ссылку", async () => {
    downloadFailures = 1;
    const { downloadYandexOperation } = await import("../services/yandex-disk-service");
    await expect(downloadYandexOperation(operation.opId)).resolves.toMatchObject({ opId: operation.opId });
    expect(requests.filter((request) => request.path.startsWith("/v1/disk/resources/download:"))).toHaveLength(2);
    expect(downloadLinks).toBe(2);
  });
});
