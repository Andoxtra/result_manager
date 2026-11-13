import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";

const DEFAULT_DISCIPLINES = [
  { name: "Büffel 50M", scoringType: "POINTS" },
  { name: "Büffel 100M", scoringType: "POINTS" },
  { name: "Greenhorn", scoringType: "POINTS" },
  { name: "CAS", scoringType: "TIME" },
];

/** On an empty database: create the admin user and the default disciplines. */
export async function bootstrap() {
  if ((await prisma.user.count()) === 0) {
    const username = process.env.ADMIN_USERNAME ?? "admin";
    const generated = !process.env.ADMIN_PASSWORD;
    const password = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(9).toString("base64url");
    await prisma.user.create({
      data: {
        username,
        displayName: "Administrator",
        passwordHash: await bcrypt.hash(password, 12),
        roles: { create: [{ role: "ADMIN" }] },
      },
    });
    console.log("──────────────────────────────────────────────");
    console.log(` Admin-Benutzer angelegt: ${username}`);
    if (generated) console.log(` Passwort: ${password}`);
    console.log(" Bitte nach der ersten Anmeldung das Passwort ändern.");
    console.log("──────────────────────────────────────────────");
  }

  if ((await prisma.discipline.count()) === 0) {
    for (const d of DEFAULT_DISCIPLINES) await prisma.discipline.create({ data: d });
  }
}
