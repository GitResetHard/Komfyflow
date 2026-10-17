import { afterEach, describe, expect, it, vi } from "vitest";
const redis = vi.hoisted(() => ({
  eval: vi.fn(),
  connect: vi.fn(),
  listenerCount: vi.fn(() => 1),
  on: vi.fn(),
  status: "ready",
}));
vi.mock("ioredis", () => ({
  default: vi.fn(function () {
    return redis;
  }),
}));
import { rateLimit, signPreference } from "../../src/lib/server/security";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("production request protection", () => {
  it("fails closed without shared Redis", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "");
    await expect(rateLimit("login:account", 10)).rejects.toMatchObject({
      status: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  });
  it("uses atomic increment+expiry and hashes identifiers in Redis keys", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    redis.eval.mockResolvedValueOnce(1);
    await expect(
      rateLimit("login:private@example.test", 2, 5000),
    ).resolves.toBeUndefined();
    const args = redis.eval.mock.calls[0];
    expect(args[0]).toContain("redis.call('INCR'");
    expect(args[0]).toContain("redis.call('PEXPIRE'");
    expect(args[1]).toBe(1);
    expect(args[2]).toMatch(/^kf:rate:[a-f0-9]{64}$/);
    expect(args[2]).not.toContain("private@example.test");
    expect(args[3]).toBe("5000");
  });
  it("denies requests once Redis count exceeds limit", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    redis.eval.mockResolvedValueOnce(3);
    await expect(rateLimit("login:account", 2)).rejects.toMatchObject({
      status: 429,
    });
  });
  it("does not silently fall back when Redis fails", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    redis.eval.mockRejectedValueOnce(new Error("Unavailable"));
    await expect(rateLimit("login:account", 2)).rejects.toMatchObject({
      status: 503,
    });
  });
  it.each(["", "short", "replace-with-at-least-32-random-characters"])(
    "rejects insecure production preference secret %s",
    (secret) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SESSION_SECRET", secret);
      expect(() => signPreference(true)).toThrow("Production SESSION_SECRET");
    },
  );
});
