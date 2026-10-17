/** Live Redis security checks. Run under local-integration-harness.sh with disposable Redis. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import {
  rateLimit,
  hashToken,
  signPreference,
  verifyPreference,
  randomToken,
} from "../../src/lib/server/security";
async function main() {
  const execute = promisify(execFile);
  const child = process.argv[2];
  if (child) {
    try {
      if (child === "limit") {
        try {
          await rateLimit(
            process.argv[3],
            Number(process.argv[4]),
            Number(process.argv[5]),
          );
          console.log("allowed");
        } catch (error) {
          console.log(`denied:${(error as { status: number }).status}`);
        }
      } else if (child === "preference") {
        console.log(verifyPreference(process.argv[3]) ? "enabled" : "disabled");
      } else if (child === "token") {
        console.log(hashToken(process.argv[3]));
      }
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  }
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("Live security test requires REDIS_URL");
  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
  const prefix = `security-integration:${randomUUID()}`;
  const keys: string[] = [];
  let checks = 0;
  async function instance(
    operation: string,
    args: string[],
    env: NodeJS.ProcessEnv = process.env,
  ) {
    const { stdout } = await execute(
      process.execPath,
      ["--import", "tsx", process.argv[1], operation, ...args],
      { env, timeout: 15000 },
    );
    return stdout.trim();
  }
  try {
    const shared = `${prefix}:shared`;
    keys.push(`kf:rate:${hashToken(shared)}`);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        instance("limit", [shared, "2", "10000"]),
      ),
    );
    assert.equal(results.filter((r) => r === "allowed").length, 2);
    assert.equal(results.filter((r) => r === "denied:429").length, 2);
    checks += 2;
    assert.equal(await redis.get(keys[0]), "4");
    const ttl = await redis.pttl(keys[0]);
    assert.ok(ttl > 0 && ttl <= 10000);
    checks += 2;
    const expiry = `${prefix}:expiry`;
    keys.push(`kf:rate:${hashToken(expiry)}`);
    assert.equal(await instance("limit", [expiry, "1", "3000"]), "allowed");
    assert.equal(await instance("limit", [expiry, "1", "3000"]), "denied:429");
    checks += 2;
    await new Promise((resolve) => setTimeout(resolve, 3100));
    assert.equal(await instance("limit", [expiry, "1", "3000"]), "allowed");
    checks++;
    assert.equal(
      await instance("limit", [`${prefix}:no-redis`, "1", "1000"], {
        ...process.env,
        NODE_ENV: "production",
        REDIS_URL: "",
      }),
      "denied:503",
    );
    checks++;
    const preference = signPreference(true);
    assert.equal(await instance("preference", [preference]), "enabled");
    assert.equal(
      await instance("preference", [preference], {
        ...process.env,
        SESSION_SECRET: "different-32-character-security-test-secret",
      }),
      "disabled",
    );
    checks += 2;
    assert.equal(
      await instance("preference", [signPreference(false)]),
      "disabled",
    );
    assert.equal(await instance("preference", ["adult:1"]), "disabled");
    checks += 2;
    const bearer = randomToken();
    const digest = hashToken(bearer);
    assert.equal(await instance("token", [bearer]), digest);
    assert.notEqual(bearer, digest);
    checks += 2;
    console.log(
      `PASS ${checks} live security assertions: cross-process atomic Redis limits, expiry, fail-closed configuration, signed adult preferences, stable hashed session-token lookup.`,
    );
  } finally {
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
