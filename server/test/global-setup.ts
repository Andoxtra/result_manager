import { execFileSync } from "node:child_process";
import fs from "node:fs";

export default function setup() {
  const dataDir = process.env.DATA_DIR!;
  fs.mkdirSync(dataDir, { recursive: true });
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: process.env, stdio: "pipe" });
  return () => fs.rmSync(dataDir, { recursive: true, force: true });
}
