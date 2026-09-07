import { afterEach, describe, expect, it, vi } from "vitest";
import { getRuntimeConfig, isPortableRuntime, runtimeAssetUrl } from "../services/runtime-config";

describe("конфигурация переносимой сборки", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("по умолчанию сохраняет серверный режим текущего сайта", () => {
    expect(getRuntimeConfig().provider).toBe("sites");
    expect(isPortableRuntime()).toBe(false);
  });

  it("строит ссылки относительно каталога статического сайта", () => {
    vi.stubGlobal("window", { __MAMINY_RECIPES_CONFIG__: { provider: "yandex-disk", yandexClientId: "client", assetBase: "./" } });
    vi.stubGlobal("document", { baseURI: "https://example.ru/maminy-recepty/index.html" });
    expect(getRuntimeConfig().yandexClientId).toBe("client");
    expect(isPortableRuntime()).toBe(true);
    expect(runtimeAssetUrl("demo/photo.webp")).toBe("https://example.ru/maminy-recepty/demo/photo.webp");
  });
});
