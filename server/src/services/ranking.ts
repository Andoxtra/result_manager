export type ScoringType = "POINTS" | "TIME";

export interface DisciplineInfo {
  id: number;
  name: string;
  scoringType: ScoringType;
  maxScore: number;
  penaltySeconds: number;
}

export interface ShooterInfo {
  id: number;
  number: number;
  name: string;
}

export interface CardInfo {
  cardNumber: number;
  shooterId: number;
  disciplineId: number;
  score: number | null;
  rawTimeCs: number | null;
  penalties: number | null;
}

export interface RankingRow {
  place: number;
  shooterId: number;
  shooterNumber: number;
  shooterName: string;
  /** cards issued to the shooter in this discipline */
  cardCount: number;
  /** card that produced the best result */
  cardNumber: number;
  score: number | null;
  rawTimeCs: number | null;
  penalties: number | null;
  finalTimeCs: number | null;
}

export interface DisciplineStatistics {
  disciplineId: number;
  name: string;
  cards: number;
  openCards: number;
  shooters: number;
}

export interface Statistics {
  cardsIssued: number;
  cardsOpen: number;
  shooters: number;
  disciplines: DisciplineStatistics[];
}

/** Raw time plus penalties, in hundredths of a second. */
export const finalTimeCs = (rawTimeCs: number, penalties: number, penaltySeconds: number) =>
  rawTimeCs + penalties * penaltySeconds * 100;

export function isScored(discipline: Pick<DisciplineInfo, "scoringType">, card: CardInfo) {
  return discipline.scoringType === "POINTS"
    ? card.score !== null
    : card.rawTimeCs !== null && card.penalties !== null;
}

/**
 * Ranking of one discipline: only the best scored card of each shooter counts.
 * Equal results share a place (1, 2, 2, 4).
 */
export function rankDiscipline(
  discipline: DisciplineInfo,
  cards: CardInfo[],
  shooters: ShooterInfo[],
): RankingRow[] {
  const shooterById = new Map(shooters.map((s) => [s.id, s]));
  const isTime = discipline.scoringType === "TIME";
  // comparable value where lower is always better
  const best = new Map<number, { value: number; card: CardInfo }>();
  const cardCount = new Map<number, number>();

  for (const card of cards) {
    if (card.disciplineId !== discipline.id) continue;
    cardCount.set(card.shooterId, (cardCount.get(card.shooterId) ?? 0) + 1);
    if (!isScored(discipline, card)) continue;
    const value = isTime
      ? finalTimeCs(card.rawTimeCs!, card.penalties!, discipline.penaltySeconds)
      : -card.score!;
    const current = best.get(card.shooterId);
    if (!current || value < current.value) best.set(card.shooterId, { value, card });
  }

  const entries = [...best.entries()]
    .map(([shooterId, b]) => ({ shooter: shooterById.get(shooterId)!, ...b }))
    .filter((e) => e.shooter)
    .sort((a, b) => a.value - b.value || a.shooter.number - b.shooter.number);

  const rows: RankingRow[] = [];
  entries.forEach((e, index) => {
    const previous = entries[index - 1];
    const place = previous && previous.value === e.value ? rows[index - 1].place : index + 1;
    rows.push({
      place,
      shooterId: e.shooter.id,
      shooterNumber: e.shooter.number,
      shooterName: e.shooter.name,
      cardCount: cardCount.get(e.shooter.id) ?? 0,
      cardNumber: e.card.cardNumber,
      score: isTime ? null : e.card.score,
      rawTimeCs: isTime ? e.card.rawTimeCs : null,
      penalties: isTime ? e.card.penalties : null,
      finalTimeCs: isTime ? e.value : null,
    });
  });
  return rows;
}

/** Shooters count as participants once they have received at least one card. */
export function computeStatistics(disciplines: DisciplineInfo[], cards: CardInfo[]): Statistics {
  const byId = new Map(disciplines.map((d) => [d.id, d]));
  const perDiscipline = new Map(
    disciplines.map((d) => [d.id, { cards: 0, openCards: 0, shooters: new Set<number>() }]),
  );
  const allShooters = new Set<number>();
  let cardsOpen = 0;

  for (const card of cards) {
    const discipline = byId.get(card.disciplineId);
    const stats = perDiscipline.get(card.disciplineId);
    if (!discipline || !stats) continue;
    allShooters.add(card.shooterId);
    stats.cards++;
    stats.shooters.add(card.shooterId);
    if (!isScored(discipline, card)) {
      stats.openCards++;
      cardsOpen++;
    }
  }

  return {
    cardsIssued: cards.length,
    cardsOpen,
    shooters: allShooters.size,
    disciplines: disciplines.map((d) => {
      const s = perDiscipline.get(d.id)!;
      return {
        disciplineId: d.id,
        name: d.name,
        cards: s.cards,
        openCards: s.openCards,
        shooters: s.shooters.size,
      };
    }),
  };
}

/** 4735 -> "47,35 s", 6235 -> "1:02,35 min" */
export function formatTime(cs: number): string {
  const hundredths = String(cs % 100).padStart(2, "0");
  const totalSeconds = Math.floor(cs / 100);
  if (totalSeconds < 60) return `${totalSeconds},${hundredths} s`;
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${Math.floor(totalSeconds / 60)}:${seconds},${hundredths} min`;
}
