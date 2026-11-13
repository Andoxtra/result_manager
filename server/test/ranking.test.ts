import { describe, expect, it } from "vitest";
import {
  computeStatistics,
  formatTime,
  rankDiscipline,
  type CardInfo,
  type DisciplineInfo,
} from "../src/services/ranking.js";

const points: DisciplineInfo = { id: 1, name: "Büffel 50M", scoringType: "POINTS", maxScore: 100, penaltySeconds: 5 };
const cas: DisciplineInfo = { id: 2, name: "CAS", scoringType: "TIME", maxScore: 100, penaltySeconds: 5 };

const shooters = [
  { id: 1, number: 1, name: "Anna" },
  { id: 2, number: 2, name: "Bert" },
  { id: 3, number: 3, name: "Cora" },
  { id: 4, number: 4, name: "Dirk" },
];

let nextCard = 1;
const pointsCard = (shooterId: number, score: number | null): CardInfo => ({
  cardNumber: nextCard++, shooterId, disciplineId: 1, score, rawTimeCs: null, penalties: null,
});
const timeCard = (shooterId: number, rawTimeCs: number | null, penalties: number | null): CardInfo => ({
  cardNumber: nextCard++, shooterId, disciplineId: 2, score: null, rawTimeCs, penalties,
});

describe("rankDiscipline (points)", () => {
  it("counts only the best card of each shooter", () => {
    const rows = rankDiscipline(points, [pointsCard(1, 70), pointsCard(1, 92), pointsCard(1, 85), pointsCard(2, 90)], shooters);
    expect(rows.map((r) => [r.place, r.shooterName, r.score, r.cardCount])).toEqual([
      [1, "Anna", 92, 3],
      [2, "Bert", 90, 1],
    ]);
  });

  it("gives equal results the same place and skips the next one", () => {
    const rows = rankDiscipline(points, [pointsCard(1, 95), pointsCard(2, 90), pointsCard(3, 90), pointsCard(4, 80)], shooters);
    expect(rows.map((r) => r.place)).toEqual([1, 2, 2, 4]);
    expect(rows.map((r) => r.shooterName)).toEqual(["Anna", "Bert", "Cora", "Dirk"]);
  });

  it("ignores cards without result and cards of other disciplines", () => {
    const rows = rankDiscipline(points, [pointsCard(1, null), pointsCard(2, 0), timeCard(3, 3000, 0)], shooters);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ place: 1, shooterName: "Bert", score: 0 });
  });
});

describe("rankDiscipline (time)", () => {
  it("adds 5 seconds per penalty and ranks the lowest final time first", () => {
    const rows = rankDiscipline(cas, [timeCard(1, 4000, 3), timeCard(2, 5000, 0), timeCard(3, 4500, 1)], shooters);
    expect(rows.map((r) => [r.place, r.shooterName, r.finalTimeCs])).toEqual([
      [1, "Bert", 5000],
      [1, "Cora", 5000],
      [3, "Anna", 5500],
    ]);
  });

  it("uses the card with the best final time, not the best raw time", () => {
    const rows = rankDiscipline(cas, [timeCard(1, 3000, 4), timeCard(1, 4000, 0)], shooters);
    expect(rows[0]).toMatchObject({ rawTimeCs: 4000, penalties: 0, finalTimeCs: 4000, cardCount: 2 });
  });
});

describe("computeStatistics", () => {
  it("counts cards, open cards and distinct shooters", () => {
    const cards = [pointsCard(1, 80), pointsCard(1, null), pointsCard(2, 70), timeCard(1, 4000, 0), timeCard(3, null, null)];
    expect(computeStatistics([points, cas], cards)).toEqual({
      cardsIssued: 5,
      cardsOpen: 2,
      shooters: 3,
      disciplines: [
        { disciplineId: 1, name: "Büffel 50M", cards: 3, openCards: 1, shooters: 2 },
        { disciplineId: 2, name: "CAS", cards: 2, openCards: 1, shooters: 2 },
      ],
    });
  });
});

describe("formatTime", () => {
  it("formats hundredths of a second", () => {
    expect(formatTime(4735)).toBe("47,35 s");
    expect(formatTime(5)).toBe("0,05 s");
    expect(formatTime(6235)).toBe("1:02,35 min");
  });
});
