import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} wurde nicht gefunden.`);

/** Parses a numeric route parameter. */
export function idParam(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Ungültige ID.");
  return id;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = issue?.path.join(".");
    res.status(400).json({
      error: `Ungültige Eingabe${field ? ` (${field})` : ""}: ${issue?.message ?? ""}`.trim(),
    });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Ungültige Anfrage." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Interner Serverfehler." });
};
