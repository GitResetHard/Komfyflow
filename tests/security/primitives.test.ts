import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertOrigin,
  hashPassword,
  hashToken,
  randomToken,
  rateLimit,
  signPreference,
  verifyPassword,
  verifyPreference,
} from "../../src/lib/server/security";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("security primitives", () => {
  it("passwords use salted hashes and reject wrong passwords", async () => {
    const first = await hashPassword("long-test-password");
    const second = await hashPassword("long-test-password");
    expect(first).not.toBe(second);
    expect(first).not.toContain("long-test-password");
    expect(await verifyPassword("long-test-password", first)).toBe(true);
    expect(await verifyPassword("wrong-password", first)).toBe(false);
    expect(await verifyPassword("anything", "invalid")).toBe(false);
  });
  it("session tokens are high entropy and stored digest differs from bearer token", () => {
    const tokens = Array.from({ length: 100 }, randomToken);
    expect(new Set(tokens).size).toBe(100);
    for (const token of tokens) {
      expect(token.length).toBeGreaterThanOrEqual(43);
      expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
      expect(hashToken(token)).not.toBe(token);
    }
  });
  it("adult preference defaults off and cannot be forged by changing payload", () => {
    vi.stubEnv("SESSION_SECRET", "test-secret-not-production");
    expect(verifyPreference()).toBe(false);
    expect(verifyPreference("é".repeat(signPreference(true).length))).toBe(
      false,
    );
    expect(verifyPreference("adult:1")).toBe(false);
    expect(
      verifyPreference(signPreference(false).replace("adult:0", "adult:1")),
    ).toBe(false);
    expect(verifyPreference(signPreference(true))).toBe(true);
  });
  it("rejects missing, cross-site and lookalike origin on mutations", () => {
    vi.stubEnv("APP_URL", "https://komfyflow.example");
    for (const method of ["POST", "PATCH", "DELETE", "PUT"])
      for (const origin of [
        undefined,
        "https://evil.example",
        "https://komfyflow.example.evil.example",
        "http://komfyflow.example",
      ]) {
        const request = new Request("https://komfyflow.example/api/settings", {
          method,
          headers: origin ? { origin } : {},
        });
        expect(() => assertOrigin(request)).toThrow(
          "Request origin is not allowed.",
        );
      }
    expect(() =>
      assertOrigin(
        new Request("https://komfyflow.example/api/settings", {
          method: "POST",
          headers: { origin: "https://komfyflow.example" },
        }),
      ),
    ).not.toThrow();
  });
  it("throttles repeated operations and expires windows", async () => {
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("NODE_ENV", "test");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const key = randomToken();
    await rateLimit(key, 2, 1000);
    await rateLimit(key, 2, 1000);
    await expect(rateLimit(key, 2, 1000)).rejects.toThrow("Too many requests");
    vi.advanceTimersByTime(1001);
    await expect(rateLimit(key, 2, 1000)).resolves.toBeUndefined();
  });
});
