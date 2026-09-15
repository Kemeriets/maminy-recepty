import { describe, expect, it } from "vitest";
import { describeSyncError } from "../services/sync-error";
import { YandexDiskError } from "../services/yandex-disk-service";

describe("понятные и безопасные ошибки синхронизации", () => {
  it.each([[401, "auth"], [403, "permission"], [507, "quota"], [429, "rate-limit"], [503, "service"], [404, "data"]] as const)("объясняет HTTP %i", (status, kind) => {
    const issue = describeSyncError(new YandexDiskError("raw server text", status, "ForbiddenError"));
    expect(issue.kind).toBe(kind);
    expect(issue.diagnostic).toContain(`HTTP ${status}`);
    expect(JSON.stringify(issue)).not.toContain("raw server text");
  });
  it("извлекает исходную причину через обёртки репозитория", () => {
    const cause = new YandexDiskError("secret request URL", 403, "ForbiddenError");
    expect(describeSyncError(new Error("generic error", { cause })).kind).toBe("permission");
  });
  it("не выводит произвольное содержимое кода ошибки", () => {
    const issue = describeSyncError(new YandexDiskError("access_token=secret", 403, "https://example.com/?access_token=secret"));
    expect(issue.diagnostic).toBe("HTTP 403");
    expect(JSON.stringify(issue)).not.toContain("secret");
  });
  it("различает сеть, тайм-аут и повреждённый JSON", () => {
    expect(describeSyncError(new TypeError("Failed to fetch")).kind).toBe("network");
    expect(describeSyncError(new DOMException("timed out", "AbortError")).kind).toBe("timeout");
    expect(describeSyncError(new SyntaxError("invalid JSON")).kind).toBe("data");
  });
  it("предупреждает о нехватке локального места без совета удалить данные сайта", () => {
    const issue = describeSyncError(new DOMException("full", "QuotaExceededError"));
    expect(issue.kind).toBe("local");
    expect(issue.help).toContain("Не очищайте данные сайта");
  });
});
