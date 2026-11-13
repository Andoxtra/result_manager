import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError, idParam, notFound } from "../errors.js";

const baseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scoringType: z.enum(["POINTS", "TIME"]),
  maxScore: z.number().int().min(1).max(100000),
  penaltySeconds: z.number().int().min(0).max(3600),
  active: z.boolean(),
});
const createSchema = baseSchema.partial({ maxScore: true, penaltySeconds: true, active: true });
const updateSchema = baseSchema.partial();

export const disciplinesRouter = Router();

disciplinesRouter.get("/", requireAuth, async (_req, res) => {
  res.json(await prisma.discipline.findMany({ orderBy: { id: "asc" } }));
});

disciplinesRouter.post("/", requireRole(), async (req, res) => {
  const data = createSchema.parse(req.body);
  if (await prisma.discipline.findUnique({ where: { name: data.name } })) {
    throw new HttpError(409, "Eine Disziplin mit diesem Namen besteht bereits.");
  }
  res.status(201).json(await prisma.discipline.create({ data }));
});

disciplinesRouter.patch("/:id", requireRole(), async (req, res) => {
  const id = idParam(req.params.id);
  const data = updateSchema.parse(req.body);
  const existing = await prisma.discipline.findUnique({ where: { id } });
  if (!existing) throw notFound("Die Disziplin");

  if (data.name && data.name !== existing.name) {
    if (await prisma.discipline.findUnique({ where: { name: data.name } })) {
      throw new HttpError(409, "Eine Disziplin mit diesem Namen besteht bereits.");
    }
  }
  // Changing how results are counted would silently change rankings of existing events.
  const changesScoring =
    (data.scoringType !== undefined && data.scoringType !== existing.scoringType) ||
    (data.penaltySeconds !== undefined && data.penaltySeconds !== existing.penaltySeconds);
  if (changesScoring && (await prisma.card.count({ where: { disciplineId: id } })) > 0) {
    throw new HttpError(
      409,
      "Wertungsart und Strafzeit können nicht geändert werden, da bereits Karten für diese Disziplin bestehen.",
    );
  }
  if (data.maxScore !== undefined && data.maxScore < existing.maxScore) {
    const above = await prisma.card.count({ where: { disciplineId: id, score: { gt: data.maxScore } } });
    if (above > 0) {
      throw new HttpError(409, "Es bestehen bereits Ergebnisse über dieser Höchstpunktzahl.");
    }
  }
  res.json(await prisma.discipline.update({ where: { id }, data }));
});

disciplinesRouter.delete("/:id", requireRole(), async (req, res) => {
  const id = idParam(req.params.id);
  const existing = await prisma.discipline.findUnique({
    where: { id },
    include: { _count: { select: { events: true, cards: true } } },
  });
  if (!existing) throw notFound("Die Disziplin");
  if (existing._count.events > 0 || existing._count.cards > 0) {
    throw new HttpError(
      409,
      "Die Disziplin wird in Veranstaltungen verwendet und kann nur deaktiviert werden.",
    );
  }
  await prisma.discipline.delete({ where: { id } });
  res.status(204).end();
});
