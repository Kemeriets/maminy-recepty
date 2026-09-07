import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import manifest from "../app/manifest";

describe("PWA", () => {
  it("имеет standalone manifest и полноразмерные иконки", () => {
    const value = manifest();
    expect(value.display).toBe("standalone");
    expect(value.start_url).toBe("/");
    expect(value.icons?.some((icon) => icon.sizes === "192x192")).toBe(true);
    expect(value.icons?.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable")).toBe(true);
  });

  it("service worker версионирует кэш и поддерживает обновление", async () => {
    const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
    expect(source).toMatch(/CACHE_VERSION/);
    expect(source).toMatch(/SKIP_WAITING/);
    expect(source).toMatch(/clients\.claim/);
    expect(source).toMatch(/self\.registration\.scope/);
    expect(source).toMatch(/__images/);
    expect(source).toMatch(/cloud-api\.yandex\.net/);
  });

  it("имеет переносимый manifest для статического хостинга", async () => {
    const source = await readFile(new URL("../public/manifest.static.webmanifest", import.meta.url), "utf8");
    const value = JSON.parse(source) as { start_url: string; scope: string; display: string; icons: Array<{ purpose: string }> };
    expect(value.start_url).toBe("./");
    expect(value.scope).toBe("./");
    expect(value.display).toBe("standalone");
    expect(value.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });
});
