import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLocalBookData, getCachedImageBlob, setCloudAuth } from "../services/local-store";

afterEach(() => vi.unstubAllGlobals());

describe("фото на втором устройстве", () => {
  it("service worker получает закрытое фото через службу и сохраняет миниатюру для последующего просмотра", async () => {
    await clearLocalBookData();
    await setCloudAuth({ accessToken: "long-fixture-oauth-token", expiresAt: null });
    const handlers = new Map<string, (event: { request: Request; respondWith: (response: Promise<Response>) => void }) => void>();
    const worker: Record<string, unknown> = {
      location: { origin: "https://kemeriets.github.io" },
      registration: { scope: "https://kemeriets.github.io/maminy-recepty/" },
      addEventListener: (name: string, handler: typeof handlers extends Map<string, infer T> ? T : never) => { handlers.set(name, handler); },
      __MAMINY_RECIPES_CONFIG__: undefined,
    };
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://family-photo-relay.netlify.app/media/photo_456?variant=thumbnail");
      expect(new Headers(init?.headers).get("Authorization")).toBe("OAuth long-fixture-oauth-token");
      return new Response(new Blob(["image-from-disk"], { type: "image/webp" }), { status: 200, headers: { "Content-Type": "image/webp" } });
    });
    const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    runInNewContext(source, {
      self: worker,
      importScripts: (url: string) => {
        expect(url).toBe("https://kemeriets.github.io/maminy-recepty/runtime-config.js");
        worker.__MAMINY_RECIPES_CONFIG__ = { mediaProxyUrl: "https://family-photo-relay.netlify.app/media" };
      },
      indexedDB, fetch: fetchMock, URL, Request, Response, Blob, Headers, AbortSignal, URLSearchParams, Date, setTimeout, clearTimeout,
      caches: {},
    });
    let transfer: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: new Request("https://kemeriets.github.io/maminy-recepty/__images/photo_456?variant=thumbnail"),
      respondWith: (value) => { transfer = value; },
    });
    expect(transfer).toBeDefined();
    const response = await transfer!;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("image-from-disk");
    expect(await (await getCachedImageBlob("photo_456", "thumbnail"))?.text()).toBe("image-from-disk");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
