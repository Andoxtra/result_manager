import { Router } from "express";
import { z } from "zod";
import { hasRole, requireAuth, requireRole, type SessionUser } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError, idParam, notFound } from "../errors.js";
import { loadVisibleEvent } from "./events.js";

const shooterName = z.string().trim().min(1, "Name fehlt.").max(100);

const issueSchema = z
  .object({
    disciplineId: z.number().int().positive(),
    shooterId: z.number().int().positive().optional(),
    shooterName: shooterName.optional(),
  })
  .refine((d) => (d.shooterId === undefined) !== (d.shooterName === undefined), {
    message: "Entweder einen bestehenden Schützen wählen oder einen neuen Namen angeben.",
  });

const pointsResult = z.object({ score: z.number().int().min(0) });
const timeResult = z.object({
  rawTimeCs: z.number().int().min(1).max(100 * 3600 * 10),
  penalties: z.number().int().min(0).max(999),
});

const cardInclude = {
  shooter: true,
  discipline: true,
  issuedBy: { select: { displayName: true } },
  scoredBy: { select: { displayName: true } },
} as const;

/** Closed events are read-only for everyone except admins. */
function assertWritable(event: { status: string }, user: SessionUser | undefined) {
  if (event.status !== "OPEN" && !hasRole(user)) {
    throw new HttpError(409, "Die Veranstaltung ist abgeschlossen und kann nicht mehr geändert werden.");
  }
}

async function loadCard(id: number, user: SessionUser | undefined) {
  const card = await prisma.card.findUnique({ where: { id }, include: { event: true, discipline: true } });
  if (!card || (card.event.archivedAt && !hasRole(user))) throw notFound("Die Schießkarte");
  return card;
}

/** Routes below /api/events/:eventId */
export const eventCardsRouter = Router({ mergeParams: true });

eventCardsRouter.get("/shooters", requireAuth, async (req, res) => {
  const event = await loadVisibleEvent(idParam((req.params as { eventId?: string }).eventId), req.user);
  const shooters = await prisma.shooter.findMany({
    where: { eventId: event.id },
    include: { _count: { select: { cards: true } } },
    orderBy: { number: "asc" },
  });
  res.json(shooters.map((s) => ({ id: s.id, number: s.number, name: s.name, cardCount: s._count.cards })));
});

eventCardsRouter.get("/cards", requireAuth, async (req, res) => {
  const event = await loadVisibleEvent(idParam((req.params as { eventId?: string }).eventId), req.user);
  const cards = await prisma.card.findMany({
    where: { eventId: event.id },
    include: cardInclude,
    orderBy: { cardNumber: "desc" },
  });
  res.json(cards);
});

eventCardsRouter.post("/cards", requireRole("ISSUER"), async (req, res) => {
  const event = await loadVisibleEvent(idParam((req.params as { eventId?: string }).eventId), req.user);
  assertWritable(event, req.user);
  const data = issueSchema.parse(req.body);
  if (!event.disciplines.some((d) => d.disciplineId === data.disciplineId)) {
    throw new HttpError(400, "Diese Disziplin wird bei der Veranstaltung nicht geschossen.");
  }

  // Shooter and card numbers are "highest + 1"; the transaction keeps two issuers from
  // getting the same number (SQLite allows only one writer at a time).
  const card = await prisma.$transaction(async (tx) => {
    let shooterId = data.shooterId;
    if (shooterId !== undefined) {
      const shooter = await tx.shooter.findFirst({ where: { id: shooterId, eventId: event.id } });
      if (!shooter) throw notFound("Der Schütze");
    } else {
      const last = await tx.shooter.aggregate({ where: { eventId: event.id }, _max: { number: true } });
      const shooter = await tx.shooter.create({
        data: { eventId: event.id, name: data.shooterName!, number: (last._max.number ?? 0) + 1 },
      });
      shooterId = shooter.id;
    }
    const lastCard = await tx.card.aggregate({ where: { eventId: event.id }, _max: { cardNumber: true } });
    return tx.card.create({
      data: {
        eventId: event.id,
        shooterId,
        disciplineId: data.disciplineId,
        cardNumber: (lastCard._max.cardNumber ?? 0) + 1,
        issuedById: req.user!.id,
      },
      include: cardInclude,
    });
  });
  res.status(201).json(card);
});

export const shootersRouter = Router();

/** Correct a misspelled name. */
shootersRouter.patch("/:id", requireRole("ISSUER"), async (req, res) => {
  const id = idParam(req.params.id);
  const { name } = z.object({ name: shooterName }).parse(req.body);
  const shooter = await prisma.shooter.findUnique({ where: { id }, include: { event: true } });
  if (!shooter || (shooter.event.archivedAt && !hasRole(req.user))) throw notFound("Der Schütze");
  assertWritable(shooter.event, req.user);
  const updated = await prisma.shooter.update({ where: { id }, data: { name } });
  res.json({ id: updated.id, number: updated.number, name: updated.name });
});

export const cardsRouter = Router();

/** Issuers can take back a card that has no result yet; admins can remove any card. */
cardsRouter.delete("/:id", requireRole("ISSUER"), async (req, res) => {
  const card = await loadCard(idParam(req.params.id), req.user);
  assertWritable(card.event, req.user);
  const scored = card.score !== null || card.rawTimeCs !== null;
  if (scored && !hasRole(req.user)) {
    throw new HttpError(409, "Für diese Karte ist bereits ein Ergebnis erfasst.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.card.delete({ where: { id: card.id } });
    // a shooter without any card did not take part: remove them again
    if ((await tx.card.count({ where: { shooterId: card.shooterId } })) === 0) {
      await tx.shooter.delete({ where: { id: card.shooterId } });
    }
  });
  res.status(204).end();
});

cardsRouter.put("/:id/result", requireRole("SCORER"), async (req, res) => {
  const card = await loadCard(idParam(req.params.id), req.user);
  assertWritable(card.event, req.user);

  let result: { score: number | null; rawTimeCs: number | null; penalties: number | null };
  if (card.discipline.scoringType === "TIME") {
    result = { score: null, ...timeResult.parse(req.body) };
  } else {
    const { score } = pointsResult.parse(req.body);
    if (score > card.discipline.maxScore) {
      throw new HttpError(400, `Es sind höchstens ${card.discipline.maxScore} Punkte möglich.`);
    }
    result = { score, rawTimeCs: null, penalties: null };
  }

  const updated = await prisma.card.update({
    where: { id: card.id },
    data: { ...result, scoredAt: new Date(), scoredById: req.user!.id },
    include: cardInclude,
  });
  res.json(updated);
});

cardsRouter.delete("/:id/result", requireRole("SCORER"), async (req, res) => {
  const card = await loadCard(idParam(req.params.id), req.user);
  assertWritable(card.event, req.user);
  const updated = await prisma.card.update({
    where: { id: card.id },
    data: { score: null, rawTimeCs: null, penalties: null, scoredAt: null, scoredById: null },
    include: cardInclude,
  });
  res.json(updated);
});
