import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { requireRole, ROLES } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError, idParam, notFound } from "../errors.js";
import { passwordSchema } from "./auth.js";

const rolesSchema = z.array(z.enum(ROLES)).transform((roles) => [...new Set(roles)]);

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[A-Za-z0-9._-]+$/, "Nur Buchstaben, Ziffern, Punkt, Binde- und Unterstrich."),
  displayName: z.string().trim().min(1).max(100),
  password: passwordSchema,
  roles: rolesSchema,
});

const updateSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  password: passwordSchema.optional(),
  roles: rolesSchema.optional(),
  active: z.boolean().optional(),
});

type UserWithRoles = {
  id: number;
  username: string;
  displayName: string;
  active: boolean;
  roles: { role: string }[];
};

const toDto = (u: UserWithRoles) => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  active: u.active,
  roles: u.roles.map((r) => r.role),
});

/** There must always be an active admin left, otherwise nobody can manage the app. */
async function assertAnotherAdmin(exceptUserId: number) {
  const others = await prisma.user.count({
    where: { id: { not: exceptUserId }, active: true, roles: { some: { role: "ADMIN" } } },
  });
  if (others === 0) {
    throw new HttpError(409, "Es muss mindestens ein aktiver Administrator bestehen bleiben.");
  }
}

export const usersRouter = Router();
usersRouter.use(requireRole());

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({ include: { roles: true }, orderBy: { username: "asc" } });
  res.json(users.map(toDto));
});

usersRouter.post("/", async (req, res) => {
  const data = createSchema.parse(req.body);
  if (await prisma.user.findUnique({ where: { username: data.username } })) {
    throw new HttpError(409, "Dieser Benutzername ist bereits vergeben.");
  }
  const user = await prisma.user.create({
    data: {
      username: data.username,
      displayName: data.displayName,
      passwordHash: await bcrypt.hash(data.password, 12),
      roles: { create: data.roles.map((role) => ({ role })) },
    },
    include: { roles: true },
  });
  res.status(201).json(toDto(user));
});

usersRouter.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const data = updateSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
  if (!existing) throw notFound("Der Benutzer");

  const wasAdmin = existing.active && existing.roles.some((r) => r.role === "ADMIN");
  const staysAdmin =
    (data.active ?? existing.active) &&
    (data.roles ? data.roles.includes("ADMIN") : existing.roles.some((r) => r.role === "ADMIN"));
  if (wasAdmin && !staysAdmin) await assertAnotherAdmin(id);

  const user = await prisma.user.update({
    where: { id },
    data: {
      displayName: data.displayName,
      active: data.active,
      passwordHash: data.password ? await bcrypt.hash(data.password, 12) : undefined,
      roles: data.roles
        ? { deleteMany: {}, create: data.roles.map((role) => ({ role })) }
        : undefined,
    },
    include: { roles: true },
  });
  res.json(toDto(user));
});

usersRouter.delete("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  if (id === req.user!.id) throw new HttpError(409, "Der eigene Benutzer kann nicht gelöscht werden.");
  const existing = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
  if (!existing) throw notFound("Der Benutzer");
  if (existing.active && existing.roles.some((r) => r.role === "ADMIN")) await assertAnotherAdmin(id);
  await prisma.user.delete({ where: { id } });
  res.status(204).end();
});
