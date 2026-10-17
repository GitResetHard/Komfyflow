import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
let client = globalDb.prisma;
function getClient(): PrismaClient {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url || !url.startsWith("mysql://"))
      throw new Error("Configure a mysql:// DATABASE_URL for MariaDB.");
    client = new PrismaClient({ adapter: new PrismaMariaDb(url) });
    if (process.env.NODE_ENV !== "production") globalDb.prisma = client;
  }
  return client;
}
/** Lazy construction keeps compilation independent of live service credentials. */
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const current = getClient();
    const value = Reflect.get(current, property);
    return typeof value === "function" ? value.bind(current) : value;
  },
});
