export type RuntimeProvider = "sites" | "yandex-disk" | "local";

export interface RecipeBookRuntimeConfig {
  provider?: RuntimeProvider;
  yandexClientId?: string;
  assetBase?: string;
}

declare global {
  interface Window {
    __MAMINY_RECIPES_CONFIG__?: RecipeBookRuntimeConfig;
  }
}

export function getRuntimeConfig(): Required<RecipeBookRuntimeConfig> {
  const supplied = typeof window === "undefined" ? undefined : window.__MAMINY_RECIPES_CONFIG__;
  return {
    provider: supplied?.provider ?? "sites",
    yandexClientId: supplied?.yandexClientId?.trim() || getSavedYandexClientId(),
    assetBase: supplied?.assetBase ?? "/",
  };
}

const CLIENT_ID_KEY = "recipe-book-yandex-client-id";

function getSavedYandexClientId(): string {
  try { return typeof window === "undefined" ? "" : window.localStorage?.getItem(CLIENT_ID_KEY)?.trim() ?? ""; }
  catch { return ""; }
}

export function saveYandexClientId(value: string): void {
  const id = value.trim();
  if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error("ClientID должен содержать 32 символа. Скопируйте именно ClientID, не секрет или токен.");
  window.localStorage.setItem(CLIENT_ID_KEY, id);
}

export function runtimeAssetUrl(path: string): string {
  if (/^(?:data:|blob:|https?:)/i.test(path)) return path;
  const clean = path.replace(/^\/+/, "");
  const config = getRuntimeConfig();
  if (config.provider === "sites" || typeof document === "undefined") return `/${clean}`;
  const base = new URL(config.assetBase, document.baseURI);
  return new URL(clean, base).toString();
}

export function isPortableRuntime(): boolean {
  return getRuntimeConfig().provider !== "sites";
}
