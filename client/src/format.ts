import type { Card, Discipline, Role } from "./api";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  ISSUER: "Kartenausgabe",
  SCORER: "Ergebniserfassung",
  EVALUATOR: "Auswertung",
};

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

/** 4735 -> "47,35 s", 6235 -> "1:02,35 min" (hundredths of a second) */
export function formatTime(cs: number): string {
  const hundredths = String(cs % 100).padStart(2, "0");
  const totalSeconds = Math.floor(cs / 100);
  if (totalSeconds < 60) return `${totalSeconds},${hundredths} s`;
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${Math.floor(totalSeconds / 60)}:${seconds},${hundredths} min`;
}

/** Value for the time input field: "47,35" or "1:02,35" */
export const timeInputValue = (cs: number) => formatTime(cs).replace(/ (s|min)$/, "");

/**
 * Parses "47,35", "47.3", "47" (seconds) or "1:02,35" (minutes:seconds) into
 * hundredths of a second. Returns null if the text is not a valid time.
 */
export function parseTime(text: string): number | null {
  const match = /^(?:(\d{1,3}):)?(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = Number(match[2]);
  if (match[1] && seconds >= 60) return null;
  const hundredths = match[3] ? Number(match[3].padEnd(2, "0")) : 0;
  const cs = (minutes * 60 + seconds) * 100 + hundredths;
  return cs > 0 ? cs : null;
}

export const finalTimeCs = (rawTimeCs: number, penalties: number, discipline: Discipline) =>
  rawTimeCs + penalties * discipline.penaltySeconds * 100;

export const isScored = (card: Card) =>
  card.discipline.scoringType === "TIME" ? card.rawTimeCs !== null : card.score !== null;

export function cardResultText(card: Card): string {
  if (!isScored(card)) return "–";
  if (card.discipline.scoringType === "POINTS") return `${card.score} Punkte`;
  const final = finalTimeCs(card.rawTimeCs!, card.penalties!, card.discipline);
  return `${formatTime(final)} (${formatTime(card.rawTimeCs!)} + ${card.penalties} Fehler)`;
}
