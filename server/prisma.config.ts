import path from "node:path";
import { defineConfig } from "prisma/config";

// Must match src/config.ts: the database lives in DATA_DIR (default: <repo>/data).
const dataDir = path.resolve(process.env.DATA_DIR ?? "../data");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? `file:${path.join(dataDir, "result-manager.db")}`,
  },
});
