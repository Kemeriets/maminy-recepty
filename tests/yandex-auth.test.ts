import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginYandexLogin, consumeYandexOAuthCallback } from "../services/yandex-disk-service";
import { clearCloudAuth, getCloudAuth } from "../services/local-store";
import { getRuntimeConfig, saveYandexClientId } from "../services/runtime-config";

describe("безопасная настройка входа", () => {
  const session = new Map<string, string>();
  const settings = new Map<string, string>();
  const locationMock = { hash: "#settings", pathname: "/recipes/", search: "", assign: vi.fn() };
  const historyMock = { replaceState: vi.fn() };
  beforeEach(async () => {
    await clearCloudAuth(); session.clear(); settings.clear(); vi.clearAllMocks(); locationMock.hash = "#settings";
    vi.stubGlobal("window", { __MAMINY_RECIPES_CONFIG__: { provider: "yandex-disk", assetBase: "./" }, localStorage: { getItem: (key: string) => settings.get(key) ?? null, setItem: (key: string, value: string) => settings.set(key, value) }, dispatchEvent: vi.fn() });
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => session.get(key) ?? null, setItem: (key: string, value: string) => session.set(key, value), removeItem: (key: string) => session.delete(key) });
    vi.stubGlobal("document", { baseURI: "https://example.ru/recipes/" });
    vi.stubGlobal("location", locationMock); vi.stubGlobal("history", historyMock); vi.stubGlobal("HashChangeEvent", Event);
  });
  afterEach(() => vi.unstubAllGlobals());
  const clientId = "a".repeat(32);
  it("сохраняет только публичный идентификатор правильного вида", () => {
    expect(() => saveYandexClientId("password-not-a-client-id")).toThrow("ClientID");
    saveYandexClientId(clientId); expect(getRuntimeConfig().yandexClientId).toBe(clientId);
  });
  it("запрашивает только папку приложения и точный адрес возврата", () => {
    saveYandexClientId(clientId); beginYandexLogin();
    const url = new URL(locationMock.assign.mock.calls[0][0]);
    expect(url.origin).toBe("https://oauth.yandex.ru");
    expect(url.searchParams.get("scope")).toBe("cloud_api:disk.app_folder");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.ru/recipes/");
    expect(url.searchParams.get("state")).toBeTruthy();
  });
  it("отклоняет токен с чужим state и удаляет его из адреса", async () => {
    saveYandexClientId(clientId); beginYandexLogin();
    locationMock.hash = "#access_token=fixture-token&state=wrong";
    await expect(consumeYandexOAuthCallback()).rejects.toThrow("безопасно");
    expect(await getCloudAuth()).toBeNull();
    expect(historyMock.replaceState).toHaveBeenCalledWith({}, "", "/recipes/#settings");
    expect(session.size).toBe(0);
  });
  it("хранит действительный вход локально, не в конфигурации", async () => {
    saveYandexClientId(clientId); beginYandexLogin();
    const state = new URL(locationMock.assign.mock.calls[0][0]).searchParams.get("state");
    locationMock.hash = `#access_token=fixture-token&state=${state}&expires_in=3600`;
    expect(await consumeYandexOAuthCallback()).toBe(true);
    expect((await getCloudAuth())?.accessToken).toBe("fixture-token");
    expect((await getCloudAuth())?.expiresAt).toBeGreaterThan(Date.now());
    expect([...settings.values()]).toEqual([clientId]);
  });
});
