import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Tests run against their own throw-away SQLite database.
const dataDir = path.join(os.tmpdir(), `result-manager-test-${process.pid}`);
process.env.DATA_DIR = dataDir;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    env: { DATA_DIR: dataDir, NODE_ENV: "test", JWT_SECRET: "test-secret" },
  },
});
