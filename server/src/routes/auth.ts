import bcrypt from "bcryptjs";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { clearSessionCookie, requireAuth, setSessionCookie, toSessionUser } from "../auth.js";
import { isTest } from "../config.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

export const passwordSchema = z
  .string()
  .min(8, "Das Passwort muss mindestens 8 Zeichen lang sein.")
  .max(200);

// Compared against when the user does not exist, so both cases take equally long.
const DUMMY_HASH = bcrypt.hashSync("no-such-user", 12);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anmeldeversuche. Bitte später erneut versuchen." },
});

export const authRouter = Router();

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = z
    .object({ username: z.string().trim().min(1), password: z.string().min(1) })
    .parse(req.body);
  const user = await prisma.user.findUnique({ where: { username }, include: { roles: true } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    throw new HttpError(401, "Benutzername oder Passwort ist falsch.");
  }
  setSessionCookie(res, user.id);
  res.json(toSessionUser(user));
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

authRouter.post("/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = z
    .object({ currentPassword: z.string(), newPassword: passwordSchema })
    .parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Das aktuelle Passwort ist falsch.");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  });
  res.status(204).end();
});
