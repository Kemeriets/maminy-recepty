import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry, NetworkRequestError, readResponseJson } from "../services/http";

describe("мобильная сеть: безопасные тайм-ауты и повторы", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("повторяет только чтение после краткого сетевого сбоя", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://cloud-api.yandex.net/v1/disk/resources", {}, 1000, "api");
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("не повторяет отправку файла автоматически", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithRetry("https://upload.example/file", { method: "PUT", body: "data" }, 1000, "upload"))
      .rejects.toMatchObject({ stage: "upload", timedOut: false });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("ограничивает ожидание тела ответа после получения заголовков", async () => {
    const response = { json: () => new Promise(() => undefined) } as Response;

    await expect(readResponseJson(response, 10, "download"))
      .rejects.toMatchObject({ stage: "download", timedOut: true });
  });

  it("помечает сетевую фазу без вывода URL или токена", () => {
    const issue = new NetworkRequestError("transfer", false, new TypeError("Failed to fetch"));
    expect(issue.message).not.toContain("cloud-api");
    expect(issue.message).not.toContain("token");
    expect(issue.stage).toBe("transfer");
  });
});
