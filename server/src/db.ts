import fs from "node:fs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { dataDir, databaseUrl } from "./config.js";
import { PrismaClient } from "./generated/prisma/client.js";

fs.mkdirSync(dataDir, { recursive: true });

export const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
});
