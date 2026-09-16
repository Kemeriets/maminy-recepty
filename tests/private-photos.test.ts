import { afterEach, describe, expect, it, vi } from "vitest";
import privatePhotos from "../netlify/edge-functions/private-photos";

const BASE = "https://family-photo-relay.netlify.app/media/photo_123?variant=main";
const ORIGIN = "https://kemeriets.github.io";
const TOKEN = "OAuth fixture-very-long-secret-token";

function request(method: string, url = BASE, headers: Record<string, string> = {}, body?: BodyInit): Request {
  return new Request(url, { method, headers: { Origin: ORIGIN, Authorization: TOKEN, ...headers }, ...(body ? { body } : {}) });
}

afterEach(() => vi.unstubAllGlobals());

describe("приватная автоматическая передача фото", () => {
  it("отвечает на CORS preflight с точным origin и не выдаёт фото без входа", async () => {
    const preflight = await privatePhotos(request("OPTIONS"));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect((await privatePhotos(request("GET", BASE, { Authorization: "" }))).status).toBe(401);
    expect((await privatePhotos(request("GET", BASE, { Origin: "https://evil.example" }))).status).toBe(403);
  });

  it("не позволяет читать другие файлы Диска и передавать токен посторонним сайтам", async () => {
    expect((await privatePhotos(request("GET", "https://family-photo-relay.netlify.app/media/../secrets"))).status).toBe(400);
    expect((await privatePhotos(request("GET", `${BASE}&variant=original`))).status).toBe(400);
    expect((await privatePhotos(request("DELETE"))).status).toBe(405);
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return Response.json({ href: "https://evil.example/collect-token", method: "GET" });
    }));
    expect((await privatePhotos(request("GET"))).status).toBe(502);
    expect(requests).toHaveLength(1);
  });

  it("читает приватное фото через серверную функцию с сохранением авторизации", async () => {
    const requests: Array<{ url: string; auth: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), auth: new Headers(init?.headers).get("Authorization") });
      if (String(input).startsWith("https://cloud-api.yandex.net/")) return Response.json({ href: "https://downloader.disk.yandex.ru/download/photo", method: "GET" });
      return new Response("private-image", { headers: { "Content-Type": "image/webp" } });
    }));
    const response = await privatePhotos(request("GET", BASE.replace("variant=main", "variant=thumbnail")));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("private-image");
    expect(requests[0].url).toContain("app%3A%2Fimages%2Fphoto_123-thumb.webp");
    expect(requests[0].auth).toBe(TOKEN);
    expect(requests[1].auth).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("загружает фото с телефона в закрытую папку Диска для компьютера", async () => {
    const requests: Array<{ url: string; method: string; auth: string | null; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), method: init?.method ?? "GET", auth: new Headers(init?.headers).get("Authorization"), body: init?.body });
      if (String(input).startsWith("https://cloud-api.yandex.net/")) return Response.json({ href: "https://uploader.disk.yandex.ru/upload/photo", method: "PUT" });
      return new Response(null, { status: 201 });
    }));
    const response = await privatePhotos(request("PUT", BASE, { "Content-Type": "image/webp" }, new Blob(["private-image"])));
    expect(response.status).toBe(201);
    expect(requests[0].url).toContain("app%3A%2Fimages%2Fphoto_123.webp");
    expect(requests[1].method).toBe("PUT");
    expect(requests[1].auth).toBeNull();
    expect(new TextDecoder().decode(requests[1].body as ArrayBuffer)).toBe("private-image");
  });

  it("принимает нумерованные адреса загрузки Яндекса и не передаёт им OAuth-токен", async () => {
    const hosts: Array<{ url: string; authorization: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      hosts.push({ url, authorization: new Headers(init?.headers).get("Authorization") });
      if (url.startsWith("https://cloud-api.yandex.net/")) return Response.json({ href: "https://uploader12g.disk.yandex.net/upload?token=signed", method: "PUT" });
      return new Response(null, { status: 201 });
    }));
    const response = await privatePhotos(request("PUT", BASE, { "Content-Type": "image/webp" }, new Blob(["picture"])));
    expect(response.status).toBe(201);
    expect(hosts).toHaveLength(2);
    expect(hosts[0].authorization).toBe(TOKEN);
    expect(hosts[1].url).toContain("uploader12g.disk.yandex.net");
    expect(hosts[1].authorization).toBeNull();
  });

  it("отклоняет похожий, но чужой адрес передачи файла", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ href: "https://uploader12g.disk.yandex.net.evil.example/upload", method: "PUT" })));
    const response = await privatePhotos(request("PUT", BASE, { "Content-Type": "image/webp" }, new Blob(["picture"])));
    expect(response.status).toBe(502);
    expect(response.headers.get("X-Photo-Relay-Stage")).toBe("signed-link");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
