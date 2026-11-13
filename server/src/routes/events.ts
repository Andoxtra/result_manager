import { Router } from "express";
import { z } from "zod";
import { hasRole, requireAuth, requireRole, type SessionUser } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError, idParam, notFound } from "../errors.js";
import { buildEvaluation } from "../services/evaluation.js";
import { renderEventPdf } from "../services/pdf.js";

const disciplineIds = z
  .array(z.number().int().positive())
  .min(1, "Mindestens eine Disziplin auswählen.")
  .transform((ids) => [...new Set(ids)]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(150),
  date: z.coerce.date(),
  disciplineIds,
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  date: z.coerce.date().optional(),
  disciplineIds: disciplineIds.optional(),
  status: z.enum(["PLANNED", "OPEN", "CLOSED"]).optional(),
  archived: z.boolean().optional(),
});

const eventInclude = {
  disciplines: { include: { discipline: true }, orderBy: { disciplineId: "asc" } },
  _count: { select: { cards: true } },
} as const;

type EventRow = {
  id: number;
  name: string;
  date: Date;
  status: string;
  archivedAt: Date | null;
  disciplines: { discipline: object }[];
  _count: { cards: number };
};

const toDto = (e: EventRow) => ({
  id: e.id,
  name: e.name,
  date: e.date,
  status: e.status,
  archivedAt: e.archivedAt,
  disciplines: e.disciplines.map((d) => d.discipline),
  cardCount: e._count.cards,
});

async function assertDisciplinesExist(ids: number[]) {
  const found = await prisma.discipline.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new HttpError(400, "Unbekannte Disziplin.");
}

/** Everyone but admins only gets to see the event that is currently running. */
export const isVisibleTo = (event: { status: string; archivedAt: Date | null }, user: SessionUser | undefined) =>
  hasRole(user) || (event.status === "OPEN" && !event.archivedAt);

export async function loadVisibleEvent(id: number, user: SessionUser | undefined) {
  const event = await prisma.event.findUnique({ where: { id }, include: eventInclude });
  if (!event || !isVisibleTo(event, user)) throw notFound("Die Veranstaltung");
  return event;
}

export const eventsRouter = Router();

eventsRouter.get("/", requireAuth, async (req, res) => {
  const isAdmin = hasRole(req.user);
  const includeArchived = req.query.archived === "true" && isAdmin;
  const events = await prisma.event.findMany({
    where: {
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(isAdmin ? {} : { status: "OPEN" }),
    },
    include: eventInclude,
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  res.json(events.map(toDto));
});

eventsRouter.get("/:id", requireAuth, async (req, res) => {
  res.json(toDto(await loadVisibleEvent(idParam(req.params.id), req.user)));
});

eventsRouter.post("/", requireRole(), async (req, res) => {
  const data = createSchema.parse(req.body);
  await assertDisciplinesExist(data.disciplineIds);
  const event = await prisma.event.create({
    data: {
      name: data.name,
      date: data.date,
      disciplines: { create: data.disciplineIds.map((disciplineId) => ({ disciplineId })) },
    },
    include: eventInclude,
  });
  res.status(201).json(toDto(event));
});

eventsRouter.patch("/:id", requireRole(), async (req, res) => {
  const id = idParam(req.params.id);
  const data = updateSchema.parse(req.body);
  const existing = await prisma.event.findUnique({ where: { id }, include: eventInclude });
  if (!existing) throw notFound("Die Veranstaltung");

  if (data.disciplineIds) {
    await assertDisciplinesExist(data.disciplineIds);
    const removed = existing.disciplines
      .map((d) => d.disciplineId)
      .filter((d) => !data.disciplineIds!.includes(d));
    if (removed.length > 0) {
      const used = await prisma.card.count({ where: { eventId: id, disciplineId: { in: removed } } });
      if (used > 0) {
        throw new HttpError(
          409,
          "Eine Disziplin, für die bereits Karten ausgegeben wurden, kann nicht entfernt werden.",
        );
      }
    }
  }

  // An archived event is always ended.
  const status = data.archived ? "CLOSED" : data.status;
  const archived = data.archived ?? !!existing.archivedAt;
  if (status === "OPEN" && archived) {
    throw new HttpError(409, "Eine archivierte Veranstaltung kann nicht gestartet werden.");
  }
  // Issuers and scorers always work on "the" running event, so there can only be one.
  if (status === "OPEN" && existing.status !== "OPEN") {
    const running = await prisma.event.findFirst({ where: { status: "OPEN", id: { not: id } } });
    if (running) {
      throw new HttpError(
        409,
        `Es läuft bereits die Veranstaltung „${running.name}“. Sie muss zuerst beendet werden.`,
      );
    }
  }

  const event = await prisma.event.update({
    where: { id },
    data: {
      name: data.name,
      date: data.date,
      status,
      archivedAt:
        data.archived === undefined ? undefined : data.archived ? (existing.archivedAt ?? new Date()) : null,
      disciplines: data.disciplineIds
        ? {
            deleteMany: { disciplineId: { notIn: data.disciplineIds } },
            upsert: data.disciplineIds.map((disciplineId) => ({
              where: { eventId_disciplineId: { eventId: id, disciplineId } },
              create: { disciplineId },
              update: {},
            })),
          }
        : undefined,
    },
    include: eventInclude,
  });
  res.json(toDto(event));
});

eventsRouter.delete("/:id", requireRole(), async (req, res) => {
  const id = idParam(req.params.id);
  if (!(await prisma.event.findUnique({ where: { id } }))) throw notFound("Die Veranstaltung");
  // shooters and cards are removed with the event (ON DELETE CASCADE)
  await prisma.event.delete({ where: { id } });
  res.status(204).end();
});

/** Rankings and statistics. */
eventsRouter.get("/:id/evaluation", requireRole("SCORER", "EVALUATOR"), async (req, res) => {
  const event = await loadVisibleEvent(idParam(req.params.id), req.user);
  res.json(await buildEvaluation(event.id));
});

eventsRouter.get("/:id/export.pdf", requireRole("SCORER", "EVALUATOR"), async (req, res) => {
  const event = await loadVisibleEvent(idParam(req.params.id), req.user);
  const pdf = await renderEventPdf(await buildEvaluation(event.id));
  const filename = `${event.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "Veranstaltung"}.pdf`;
  res
    .type("application/pdf")
    .set(
      "Content-Disposition",
      `attachment; filename="export.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    )
    .send(pdf);
});
