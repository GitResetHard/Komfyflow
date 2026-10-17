const required = ["APP_URL", "DATABASE_URL", "SESSION_SECRET"];
let failed = false;
for (const key of required)
  if (!process.env[key] || process.env[key].includes("replace-")) {
    console.error(`Configure ${key}`);
    failed = true;
  }
if ((process.env.SESSION_SECRET || "").length < 32) {
  console.error("SESSION_SECRET must contain at least 32 characters");
  failed = true;
}
if (process.env.NODE_ENV === "production") {
  if (!process.env.APP_URL?.startsWith("https://")) {
    console.error("Production APP_URL must use HTTPS");
    failed = true;
  }
  if (process.env.STORAGE_DRIVER !== "b2") {
    console.error("Release deployment requires private B2 storage");
    failed = true;
  }
  for (const key of [
    "B2_ENDPOINT",
    "B2_REGION",
    "B2_BUCKET",
    "B2_KEY_ID",
    "B2_APPLICATION_KEY",
    "REDIS_URL",
    "MAIL_WEBHOOK_URL",
  ])
    if (!process.env[key]) {
      console.error(`Production requires ${key}`);
      failed = true;
    }
}
process.exitCode = failed ? 1 : 0;
