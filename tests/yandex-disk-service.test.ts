import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookOperation } from "../types/book";

const storage = vi.hoisted(() => ({ getCloudAuth: vi.fn(), clearCloudAuth: vi.fn(), cacheImageBlob: vi.fn(), setCloudAuth: vi.fn() }));
vi.mock("../services/local-store", () => storage);

describe("первая отправка в папку приложения Яндекса", () => {
  const directories = new Set<string>();
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
    if (url.hostname === "download.example.com") {
      if (downloadFailures > 0) { downloadFailures -= 1; throw new TypeError("temporary transfer failure"); }
      return Response.json(operation);
    }
    if (deny) return Response.json({ error: deny === 403 ? "ForbiddenError" : "UnauthorizedError", message: "internal details" }, { status: deny });
    if (url.pathname.endsWith("/resources") && method === "PUT") {
      if (existing) return Response.json({ error: "DiskResourceAlreadyExistsError" }, { status: 409 });
      directories.add(path);
      return Response.json({ href: "https://example.com/resource" }, { status: 201 });
    }
    if (url.pathname.endsWith("/resources") && method === "GET") return Response.json({ type: conflictingFile ? "file" : "dir" });
    if (url.pathname.endsWith("/resources/upload")) {
      if (!existing && !directories.has(path.slice(0, path.lastIndexOf("/")))) return Response.json({ error: "DiskPathDoesntExistsError" }, { status: 404 });
      return Response.json({ href: "https://upload.example.com/book", method: "PUT" });
    }
    if (url.pathname.endsWith("/resources/download")) {
      downloadLinks += 1;
      return Response.json({ href: `https://download.example.com/book-${downloadLinks}`, method: "GET" });
    }
    throw new Error("Unexpected test request");
  });
  const operation: BookOperation = { opId: "offline-operation", createdAt: "2026-09-15T00:00:00Z", type: "demo.clear" };
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); directories.clear(); requests.length = 0; deny = 0; existing = false; conflictingFile = false; downloadFailures = 0; downloadLinks = 0;
    storage.getCloudAuth.mockResolvedValue({ accessToken: "fixture-token", expiresAt: null });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { __MAMINY_RECIPES_CONFIG__: { provider: "yandex-disk", assetBase: "./" } });
    vi.stubGlobal("document", { baseURI: "https://example.com/recipes/" });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("создаёт обе папки до отправки первого накопленного рецепта", async () => {
    const { uploadYandexOperation } = await import("../services/yandex-disk-service");
    await uploadYandexOperation(operation);
    expect(requests.slice(0, 3)).toEqual([
      { path: "/v1/disk/resources:app:/operations", method: "PUT" },
      { path: "/v1/disk/resources:app:/images", method: "PUT" },
      { path: "/v1/disk/resources/upload:app:/operations/offline-operation.json", method: "GET" },
    ]);
  });
  it("объединяет создание папок при одновременных отправках", async () => {
    const { uploadYandexOperation } = await import("../services/yandex-disk-service");
    await Promise.all([uploadYandexOperation(operation), uploadYandexOperation({ ...operation, opId: "second" })]);
    expect(requests.filter((request) => request.method === "PUT" && request.path.startsWith("/v1/disk/resources:"))).toHaveLength(2);
    expect(requests.filter((request) => request.path.startsWith("/v1/disk/resources/upload:"))).toHaveLength(2);
  });
  it("создаёт папки до отправки фото и его миниатюры", async () => {
    const { uploadYandexImage } = await import("../services/yandex-disk-service");
    const blob = new Blob(["photo"], { type: "image/webp" });
    await uploadYandexImage({ id: "photo", kind: "cover", main: blob, thumbnail: blob, alt: "", width: 10, height: 10, createdAt: operation.createdAt });
    expect(directories).toEqual(new Set(["app:/operations", "app:/images"]));
    expect(requests.filter((request) => request.path.startsWith("/v1/disk/resources/upload:"))).toHaveLength(2);
  });
  it("проверяет, что существующий ресурс действительно папка", async () => {
    existing = true;
    const { uploadYandexOperation } = await import("../services/yandex-disk-service");
    await uploadYandexOperation(operation);
    expect(requests.filter((request) => request.method === "GET" && request.path.startsWith("/v1/disk/resources:"))).toHaveLength(2);
  });
  it("не перезаписывает файл, оказавшийся на месте папки", async () => {
    existing = true; conflictingFile = true;
    const { uploadYandexOperation } = await import("../services/yandex-disk-service");
    await expect(uploadYandexOperation(operation)).rejects.toMatchObject({ status: 409, code: "DiskExpectedDirectoryError" });
    expect(requests.some((request) => request.path.startsWith("/v1/disk/resources/upload:"))).toBe(false);
  });
  it("сохраняет причину отказа и позволяет повторить после исправления разрешения", async () => {
    deny = 403;
    const { uploadYandexOperation } = await import("../services/yandex-disk-service");
    await expect(uploadYandexOperation(operation)).rejects.toMatchObject({ status: 403, code: "ForbiddenError" });
    expect(storage.clearCloudAuth).not.toHaveBeenCalled();
    deny = 0;
    await expect(uploadYandexOperation(operation)).resolves.toBeUndefined();
    expect(directories.has("app:/operations")).toBe(true);
  });
  it("при недействительном токене запрашивает повторный вход", async () => {
    deny = 401;
    const { uploadYandexOperation } = await import("../services/yandex-disk-service");
    await expect(uploadYandexOperation(operation)).rejects.toMatchObject({ status: 401 });
    expect(storage.clearCloudAuth).toHaveBeenCalledOnce();
  });
  it("получает новую временную ссылку после сбоя скачивания", async () => {
    downloadFailures = 1;
    const { downloadYandexOperation } = await import("../services/yandex-disk-service");
    await expect(downloadYandexOperation(operation.opId)).resolves.toMatchObject({ opId: operation.opId });
    expect(requests.filter((request) => request.path.startsWith("/v1/disk/resources/download:"))).toHaveLength(2);
    expect(downloadLinks).toBe(2);
  });
});
