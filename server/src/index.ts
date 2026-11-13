import os from "node:os";
import { createApp } from "./app.js";
import { getJwtSecret, host, port } from "./config.js";
import { prisma } from "./db.js";
import { bootstrap } from "./services/bootstrap.js";

getJwtSecret();
await bootstrap();

const server = createApp().listen(port, host, () => {
  console.log(`Result Manager läuft auf Port ${port}:`);
  console.log(`  http://localhost:${port}`);
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family === "IPv4" && !a.internal) console.log(`  http://${a.address}:${port}`);
    }
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
