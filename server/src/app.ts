import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import { loadUser } from "./auth.js";
import { clientDist } from "./config.js";
import { errorHandler, HttpError } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { cardsRouter, eventCardsRouter, shootersRouter } from "./routes/cards.js";
import { disciplinesRouter } from "./routes/disciplines.js";
import { eventsRouter } from "./routes/events.js";
import { usersRouter } from "./routes/users.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY);

  app.use((_req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    res.set("Referrer-Policy", "same-origin");
    next();
  });

  const api = express.Router();
  api.use(express.json({ limit: "100kb" }));
  api.use(cookieParser());
  api.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  api.use(loadUser);
  api.use("/auth", authRouter);
  api.use("/users", usersRouter);
  api.use("/disciplines", disciplinesRouter);
  api.use("/events/:eventId", eventCardsRouter);
  api.use("/events", eventsRouter);
  api.use("/shooters", shootersRouter);
  api.use("/cards", cardsRouter);
  api.use(() => {
    throw new HttpError(404, "Nicht gefunden.");
  });
  app.use("/api", api);

  // Production: the built React app is served by the same process.
  if (fs.existsSync(path.join(clientDist, "index.html"))) {
    app.use(express.static(clientDist));
    app.get("/{*path}", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
