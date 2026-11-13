import { prisma } from "../db.js";
import { notFound } from "../errors.js";
import {
  computeStatistics,
  rankDiscipline,
  type DisciplineInfo,
  type RankingRow,
  type ScoringType,
  type Statistics,
} from "./ranking.js";

export interface Evaluation {
  event: { id: number; name: string; date: Date; status: string; archivedAt: Date | null };
  statistics: Statistics;
  rankings: { discipline: DisciplineInfo; rows: RankingRow[] }[];
}

export async function buildEvaluation(eventId: number): Promise<Evaluation> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      disciplines: { include: { discipline: true }, orderBy: { disciplineId: "asc" } },
      shooters: true,
      cards: true,
    },
  });
  if (!event) throw notFound("Die Veranstaltung");

  const disciplines: DisciplineInfo[] = event.disciplines.map(({ discipline: d }) => ({
    id: d.id,
    name: d.name,
    scoringType: d.scoringType as ScoringType,
    maxScore: d.maxScore,
    penaltySeconds: d.penaltySeconds,
  }));

  return {
    event: {
      id: event.id,
      name: event.name,
      date: event.date,
      status: event.status,
      archivedAt: event.archivedAt,
    },
    statistics: computeStatistics(disciplines, event.cards, event.shooters.length),
    rankings: disciplines.map((discipline) => ({
      discipline,
      rows: rankDiscipline(discipline, event.cards, event.shooters),
    })),
  };
}
