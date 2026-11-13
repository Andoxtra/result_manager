import { Router } from "express";
import { z } from "zod";
import { hasRole, requireAuth, requireRole, type SessionUser } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError, idParam, notFound } from "../errors.js";
import { isVisibleTo, loadVisibleEvent } from "./events.js";

const shooterName = z.string().trim().min(1, "Name fehlt.").max(100);

const issueSchema = z.object({
  disciplineId: z.number().int().positive(),
  shooterId: z.number().int().positive(),
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

/** Only the running event can be changed; admins can correct any event. */
function assertWritable(event: { status: string }, user: SessionUser | undefined) {
  if (event.status !== "OPEN" && !hasRole(user)) {
    throw new HttpError(409, "Die Veranstaltung läuft nicht und kann nicht geändert werden.");
  }
}

async function loadCard(id: number, user: SessionUser | undefined) {
  const card = await prisma.card.findUnique({ where: { id }, include: { event: true, discipline: true } });
  if (!card || !isVisibleTo(card.event, user)) throw notFound("Die Schießkarte");
  return card;
}

async function loadShooter(id: number, user: SessionUser | undefined) {
  const shooter = await prisma.shooter.findUnique({
    where: { id },
    include: { event: true, _count: { select: { cards: true } } },
  });
  if (!shooter || !isVisibleTo(shooter.event, user)) throw notFound("Der Schütze");
  return shooter;
}

const shooterDto = (s: { id: number; number: number; name: string }, cardCount: number) => ({
  id: s.id,
  number: s.number,
  name: s.name,
  cardCount,
});

/**
 * "Nachlösen": a card is a rebuy if the shooter already got an earlier card for the
 * same discipline.
 */
async function withRebuy<T extends { eventId: number; shooterId: number; disciplineId: number; cardNumber: number }>(
  card: T,
) {
  const earlier = await prisma.card.count({
    where: {
      eventId: card.eventId,
      shooterId: card.shooterId,
      disciplineId: card.disciplineId,
      cardNumber: { lt: card.cardNumber },
    },
  });
  return { ...card, rebuy: earlier > 0 };
}

const eventId = (params: unknown) => idParam((params as { eventId?: string }).eventId);

/** Routes below /api/events/:eventId */
export const eventCardsRouter = Router({ mergeParams: true });

eventCardsRouter.get("/shooters", requireAuth, async (req, res) => {
  const event = await loadVisibleEvent(eventId(req.params), req.user);
  const shooters = await prisma.shooter.findMany({
    where: { eventId: event.id },
    include: { _count: { select: { cards: true } } },
    orderBy: { number: "asc" },
  });
  res.json(shooters.map((s) => shooterDto(s, s._count.cards)));
});

/** Registers a shooter and assigns the next free shooter number of the event. */
eventCardsRouter.post("/shooters", requireRole("ISSUER"), async (req, res) => {
  const event = await loadVisibleEvent(eventId(req.params), req.user);
  assertWritable(event, req.user);
  const { name } = z.object({ name: shooterName }).parse(req.body);
  // "highest + 1" inside a transaction: SQLite allows only one writer at a time,
  // so two issuers cannot get the same number.
  const shooter = await prisma.$transaction(async (tx) => {
    const last = await tx.shooter.aggregate({ where: { eventId: event.id }, _max: { number: true } });
    return tx.shooter.create({
      data: { eventId: event.id, name, number: (last._max.number ?? 0) + 1 },
    });
  });
  res.status(201).json(shooterDto(shooter, 0));
});

eventCardsRouter.get("/cards", requireAuth, async (req, res) => {
  const event = await loadVisibleEvent(eventId(req.params), req.user);
  const cards = await prisma.card.findMany({
    where: { eventId: event.id },
    include: cardInclude,
    orderBy: { cardNumber: "asc" },
  });
  const seen = new Set<string>();
  const result = cards.map((card) => {
    const key = `${card.shooterId}:${card.disciplineId}`;
    const rebuy = seen.has(key);
    seen.add(key);
    return { ...card, rebuy };
  });
  res.json(result.reverse());
});

eventCardsRouter.post("/cards", requireRole("ISSUER"), async (req, res) => {
  const event = await loadVisibleEvent(eventId(req.params), req.user);
  assertWritable(event, req.user);
  const data = issueSchema.parse(req.body);
  if (!event.disciplines.some((d) => d.disciplineId === data.disciplineId)) {
    throw new HttpError(400, "Diese Disziplin wird bei der Veranstaltung nicht geschossen.");
  }

  const card = await prisma.$transaction(async (tx) => {
    const shooter = await tx.shooter.findFirst({ where: { id: data.shooterId, eventId: event.id } });
    if (!shooter) throw notFound("Der Schütze");
    const lastCard = await tx.card.aggregate({ where: { eventId: event.id }, _max: { cardNumber: true } });
    return tx.card.create({
      data: {
        eventId: event.id,
        shooterId: shooter.id,
        disciplineId: data.disciplineId,
        cardNumber: (lastCard._max.cardNumber ?? 0) + 1,
        issuedById: req.user!.id,
      },
      include: cardInclude,
    });
  });
  res.status(201).json(await withRebuy(card));
});

export const shootersRouter = Router();

/** Correct a misspelled name. */
shootersRouter.patch("/:id", requireRole("ISSUER"), async (req, res) => {
  const shooter = await loadShooter(idParam(req.params.id), req.user);
  assertWritable(shooter.event, req.user);
  const { name } = z.object({ name: shooterName }).parse(req.body);
  const updated = await prisma.shooter.update({ where: { id: shooter.id }, data: { name } });
  res.json(shooterDto(updated, shooter._count.cards));
});

/** A shooter registered by mistake can be removed as long as they have no card. */
shootersRouter.delete("/:id", requireRole("ISSUER"), async (req, res) => {
  const shooter = await loadShooter(idParam(req.params.id), req.user);
  assertWritable(shooter.event, req.user);
  if (shooter._count.cards > 0) {
    throw new HttpError(409, "Für diesen Schützen wurden bereits Schießkarten ausgegeben.");
  }
  await prisma.shooter.delete({ where: { id: shooter.id } });
  res.status(204).end();
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
  await prisma.card.delete({ where: { id: card.id } });
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
  res.json(await withRebuy(updated));
});

cardsRouter.delete("/:id/result", requireRole("SCORER"), async (req, res) => {
  const card = await loadCard(idParam(req.params.id), req.user);
  assertWritable(card.event, req.user);
  const updated = await prisma.card.update({
    where: { id: card.id },
    data: { score: null, rawTimeCs: null, penalties: null, scoredAt: null, scoredById: null },
    include: cardInclude,
  });
  res.json(await withRebuy(updated));
});
