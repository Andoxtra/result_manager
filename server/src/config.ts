import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** server/ directory, both when running from src/ (tsx) and dist/ (node). */
const serverRoot = path.resolve(import.meta.dirname, "..");

export const isTest = process.env.NODE_ENV === "test";
export const port = Number(process.env.PORT ?? 3000);
export const host = process.env.HOST ?? "0.0.0.0";

/** Holds the SQLite database and the session secret. Keep in sync with prisma.config.ts. */
export const dataDir = path.resolve(serverRoot, process.env.DATA_DIR ?? "../data");
export const databaseUrl =
  process.env.DATABASE_URL ?? `file:${path.join(dataDir, "result-manager.db")}`;

export const clientDist = path.resolve(serverRoot, process.env.CLIENT_DIST ?? "../client/dist");

/** Set COOKIE_SECURE=true when the app is served over HTTPS. */
export const cookieSecure = process.env.COOKIE_SECURE === "true";

let cachedSecret: string | undefined;

/** Secret for signing session tokens: JWT_SECRET, or a random one persisted in the data dir. */
export function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;
  if (process.env.JWT_SECRET) {
    cachedSecret = process.env.JWT_SECRET;
    return cachedSecret;
  }
  const file = path.join(dataDir, "session-secret");
  if (fs.existsSync(file)) {
    cachedSecret = fs.readFileSync(file, "utf8").trim();
  } else {
    fs.mkdirSync(dataDir, { recursive: true });
    cachedSecret = crypto.randomBytes(48).toString("hex");
    fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}
