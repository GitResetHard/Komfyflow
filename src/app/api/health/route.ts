import IORedis from "ioredis";
import { db } from "@/lib/server/db";
import { json } from "@/lib/server/api";
export const dynamic = "force-dynamic";
export async function GET() {
  let redis: IORedis | undefined;
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 2500),
      ),
    ]);
    if (process.env.REDIS_URL) {
      redis = new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 0,
        connectTimeout: 2000,
        retryStrategy: () => null,
        lazyConnect: true,
      });
      redis.on("error", () => undefined);
      await redis.connect();
      await Promise.race([
        redis.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 2000),
        ),
      ]);
    } else if (process.env.NODE_ENV === "production")
      throw new Error("Redis required");
    return json({
      status: "ok",
      database: "ready",
      queue: process.env.REDIS_URL ? "ready" : "inline-development",
    });
  } catch {
    return json({ status: "unavailable" }, 503);
  } finally {
    redis?.disconnect();
  }
}
