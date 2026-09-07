import { describe, expect, it } from "vitest";
import { assertSameOrigin, getRequestIdentity } from "../server/auth";

describe("границы доступа API", () => {
  it("принимает личность только из доверенных заголовков платформы", () => {
    const request = new Request("https://recipes.example/api/snapshot", { headers: { "oai-authenticated-user-id": "user-42", "oai-authenticated-user-email": "mama@example.com" } });
    expect(getRequestIdentity(request)).toEqual({ userId: "user-42", email: "mama@example.com" });
  });

  it("не разрешает анонимный production-запрос", () => {
    expect(() => getRequestIdentity(new Request("https://recipes.example/api/snapshot"))).toThrow();
  });

  it("отклоняет запись с другого origin", () => {
    expect(() => assertSameOrigin(new Request("https://recipes.example/api/operations", { headers: { origin: "https://evil.example" } }))).toThrow();
  });
});
