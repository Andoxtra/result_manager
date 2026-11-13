import type { RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { cookieSecure, getJwtSecret } from "./config.js";
import { prisma } from "./db.js";
import { HttpError } from "./errors.js";

export const ROLES = ["ADMIN", "ISSUER", "SCORER", "EVALUATOR"] as const;
export type Role = (typeof ROLES)[number];

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  roles: Role[];
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const COOKIE = "rm_session";
const SESSION_HOURS = 12;

export function setSessionCookie(res: Response, userId: number) {
  const token = jwt.sign({ uid: userId }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: `${SESSION_HOURS}h`,
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    maxAge: SESSION_HOURS * 3600 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", secure: cookieSecure, path: "/" });
}

export function toSessionUser(user: {
  id: number;
  username: string;
  displayName: string;
  roles: { role: string }[];
}): SessionUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    roles: user.roles.map((r) => r.role as Role),
  };
}

/**
 * Loads the user for the session cookie on every request, so that deactivating a user
 * or changing roles takes effect immediately.
 */
export const loadUser: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[COOKIE];
  if (typeof token === "string") {
    try {
      const payload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
      const uid = typeof payload === "object" ? Number(payload.uid) : NaN;
      if (Number.isInteger(uid)) {
        const user = await prisma.user.findUnique({ where: { id: uid }, include: { roles: true } });
        if (user?.active) req.user = toSessionUser(user);
      }
    } catch {
      // invalid or expired token: treat as not logged in
    }
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, "Nicht angemeldet.");
  next();
};

export const hasRole = (user: SessionUser | undefined, ...roles: Role[]) =>
  !!user && (user.roles.includes("ADMIN") || roles.some((r) => user.roles.includes(r)));

/** Allows the given roles; ADMIN is always allowed. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new HttpError(401, "Nicht angemeldet.");
    if (!hasRole(req.user, ...roles)) throw new HttpError(403, "Keine Berechtigung.");
    next();
  };
}
