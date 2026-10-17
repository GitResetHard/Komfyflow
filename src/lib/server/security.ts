import IORedis from "ioredis";
import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCb);
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function secret() {
  const value = process.env.SESSION_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (!value ||
      value.length < 32 ||
      /^(?:replace-|development-only)/i.test(value))
  )
    throw new Error(
      "Production SESSION_SECRET must contain at least 32 random characters",
    );
  return value || "development-only-do-not-use-in-production";
}
export function signPreference(value: boolean) {
  const payload = value ? "adult:1" : "adult:0";
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("hex")}`;
}
export function verifyPreference(value?: string) {
  if (!value) return false;
  const expected = signPreference(true);
  const actualBytes = Buffer.from(value),
    expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}
export function assertOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : new URL(request.url).origin;
  if (!origin || origin !== expected)
    throw new HttpError(
      403,
      "Request origin is not allowed.",
      "INVALID_ORIGIN",
    );
}
const buckets = new Map<string, { count: number; until: number }>();
let limiter: IORedis | undefined;
let limiterConnection: Promise<void> | undefined;
const incrementWindow = `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count`;
/** Shared atomic counters in production. Never fail open when Redis is unavailable. */
export async function rateLimit(key: string, limit: number, windowMs = 60_000) {
  if (process.env.REDIS_URL) {
    limiter ??= new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    // Prevent uncaught EventEmitter errors; callers receive a controlled 503 below.
    if (limiter.listenerCount("error") === 0)
      limiter.on("error", () => undefined);
    let count: number;
    try {
      if (limiter.status === "wait")
        limiterConnection ??= limiter.connect().finally(() => {
          limiterConnection = undefined;
        });
      if (limiterConnection) await limiterConnection;
      count = Number(
        await limiter.eval(
          incrementWindow,
          1,
          `kf:rate:${hashToken(key)}`,
          String(windowMs),
        ),
      );
    } catch {
      throw new HttpError(
        503,
        "Request protection is temporarily unavailable. Please try again.",
        "RATE_LIMIT_UNAVAILABLE",
      );
    }
    if (!Number.isFinite(count))
      throw new HttpError(
        503,
        "Request protection is temporarily unavailable. Please try again.",
        "RATE_LIMIT_UNAVAILABLE",
      );
    if (count > limit)
      throw new HttpError(
        429,
        "Too many requests. Please try again shortly.",
        "RATE_LIMITED",
      );
    return;
  }
  if (process.env.NODE_ENV === "production")
    throw new HttpError(
      503,
      "Request protection is temporarily unavailable. Please try again.",
      "RATE_LIMIT_UNAVAILABLE",
    );
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k);
    if (buckets.size > 10_000)
      throw new HttpError(
        503,
        "Request protection is temporarily unavailable.",
        "RATE_LIMIT_UNAVAILABLE",
      );
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.until <= now) {
    buckets.set(key, { count: 1, until: now + windowMs });
    return;
  }
  if (++bucket.count > limit)
    throw new HttpError(
      429,
      "Too many requests. Please try again shortly.",
      "RATE_LIMITED",
    );
}
export function clientIp(request: Request) {
  return process.env.TRUST_PROXY === "true"
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    : "local";
}
