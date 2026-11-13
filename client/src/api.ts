export type Role = "ADMIN" | "ISSUER" | "SCORER" | "EVALUATOR";
export type ScoringType = "POINTS" | "TIME";

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  roles: Role[];
}

export interface User extends SessionUser {
  active: boolean;
}

export interface Discipline {
  id: number;
  name: string;
  scoringType: ScoringType;
  maxScore: number;
  penaltySeconds: number;
  active: boolean;
}

export interface EventSummary {
  id: number;
  name: string;
  date: string;
  status: "OPEN" | "CLOSED";
  archivedAt: string | null;
  disciplines: Discipline[];
  cardCount: number;
}

export interface Shooter {
  id: number;
  number: number;
  name: string;
  cardCount: number;
}

export interface Card {
  id: number;
  eventId: number;
  cardNumber: number;
  issuedAt: string;
  score: number | null;
  rawTimeCs: number | null;
  penalties: number | null;
  scoredAt: string | null;
  shooter: { id: number; number: number; name: string };
  discipline: Discipline;
  issuedBy: { displayName: string } | null;
  scoredBy: { displayName: string } | null;
}

export interface RankingRow {
  place: number;
  shooterId: number;
  shooterNumber: number;
  shooterName: string;
  cardCount: number;
  cardNumber: number;
  score: number | null;
  rawTimeCs: number | null;
  penalties: number | null;
  finalTimeCs: number | null;
}

export interface Evaluation {
  event: { id: number; name: string; date: string; status: "OPEN" | "CLOSED"; archivedAt: string | null };
  statistics: {
    cardsIssued: number;
    cardsOpen: number;
    shooters: number;
    disciplines: { disciplineId: number; name: string; cards: number; openCards: number; shooters: number }[];
  };
  rankings: { discipline: Discipline; rows: RankingRow[] }[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Der Server ist nicht erreichbar.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Fehler ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};
