import "dotenv/config";
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --import tsx prisma/seed.ts",
  },
  // Generation/build do not connect; migration commands require the configured database URL.
  datasource: {
    url:
      process.env.DATABASE_URL ||
      "mysql://unconfigured:unconfigured@127.0.0.1:3306/unconfigured",
  },
});
