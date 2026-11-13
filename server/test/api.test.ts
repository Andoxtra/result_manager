import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { bootstrap } from "../src/services/bootstrap.js";

const app = createApp();
type Agent = ReturnType<typeof request.agent>;

async function login(username: string, password: string): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username, password }).expect(200);
  return agent;
}

let admin: Agent, issuer: Agent, scorer: Agent, evaluator: Agent;
let disciplines: Record<string, number>;
let eventId: number;

beforeAll(async () => {
  process.env.ADMIN_PASSWORD = "admin-password";
  await bootstrap();
  admin = await login("admin", "admin-password");

  for (const [username, role] of [["issuer", "ISSUER"], ["scorer", "SCORER"], ["evaluator", "EVALUATOR"]]) {
    await admin
      .post("/api/users")
      .send({ username, displayName: username, password: "password-123", roles: [role] })
      .expect(201);
  }
  issuer = await login("issuer", "password-123");
  scorer = await login("scorer", "password-123");
  evaluator = await login("evaluator", "password-123");

  const list = await admin.get("/api/disciplines").expect(200);
  disciplines = Object.fromEntries(list.body.map((d: { name: string; id: number }) => [d.name, d.id]));

  const event = await admin
    .post("/api/events")
    .send({ name: "Westernschießen 2024", date: "2024-09-14", disciplineIds: [disciplines["Büffel 50M"], disciplines["CAS"]] })
    .expect(201);
  eventId = event.body.id;
});

describe("bootstrap", () => {
  it("creates the four default disciplines", () => {
    expect(Object.keys(disciplines).sort()).toEqual(["Büffel 100M", "Büffel 50M", "CAS", "Greenhorn"]);
  });
});

describe("authentication", () => {
  it("rejects wrong credentials and unauthenticated requests", async () => {
    await request(app).post("/api/auth/login").send({ username: "admin", password: "wrong" }).expect(401);
    await request(app).post("/api/auth/login").send({ username: "nobody", password: "wrong" }).expect(401);
    await request(app).get("/api/events").expect(401);
    await request(app).get("/api/auth/me").expect(401);
  });

  it("never returns password hashes", async () => {
    const res = await admin.get("/api/users").expect(200);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("locks out deactivated users immediately", async () => {
    await admin.post("/api/users").send({ username: "temp", displayName: "Temp", password: "password-123", roles: ["ISSUER"] }).expect(201);
    const temp = await login("temp", "password-123");
    const users = await admin.get("/api/users");
    const id = users.body.find((u: { username: string }) => u.username === "temp").id;
    await admin.patch(`/api/users/${id}`).send({ active: false }).expect(200);
    await temp.get("/api/events").expect(401);
    await request(app).post("/api/auth/login").send({ username: "temp", password: "password-123" }).expect(401);
    await admin.delete(`/api/users/${id}`).expect(204);
  });

  it("keeps at least one active admin", async () => {
    const me = await admin.get("/api/auth/me");
    await admin.patch(`/api/users/${me.body.id}`).send({ roles: ["ISSUER"] }).expect(409);
    await admin.patch(`/api/users/${me.body.id}`).send({ active: false }).expect(409);
    await admin.delete(`/api/users/${me.body.id}`).expect(409);
  });
});

describe("permissions", () => {
  it("allows only admins to manage users, disciplines and events", async () => {
    for (const agent of [issuer, scorer, evaluator]) {
      await agent.get("/api/users").expect(403);
      await agent.post("/api/users").send({}).expect(403);
      await agent.post("/api/disciplines").send({ name: "X", scoringType: "POINTS" }).expect(403);
      await agent.post("/api/events").send({ name: "X", date: "2024-01-01", disciplineIds: [1] }).expect(403);
      await agent.patch(`/api/events/${eventId}`).send({ status: "CLOSED" }).expect(403);
      await agent.delete(`/api/events/${eventId}`).expect(403);
    }
  });

  it("allows only issuers to hand out cards and only scorers to enter results", async () => {
    const body = { shooterName: "Perm Test", disciplineId: disciplines["Büffel 50M"] };
    await scorer.post(`/api/events/${eventId}/cards`).send(body).expect(403);
    await evaluator.post(`/api/events/${eventId}/cards`).send(body).expect(403);
    const card = await issuer.post(`/api/events/${eventId}/cards`).send(body).expect(201);

    await issuer.put(`/api/cards/${card.body.id}/result`).send({ score: 50 }).expect(403);
    await evaluator.put(`/api/cards/${card.body.id}/result`).send({ score: 50 }).expect(403);
    await scorer.delete(`/api/cards/${card.body.id}`).expect(403);
    await issuer.delete(`/api/cards/${card.body.id}`).expect(204);
    // the shooter had no other card and is removed with it
    const shooters = await issuer.get(`/api/events/${eventId}/shooters`).expect(200);
    expect(shooters.body).toEqual([]);
  });

  it("keeps evaluation and export away from issuers while the event is running", async () => {
    await issuer.get(`/api/events/${eventId}/evaluation`).expect(403);
    await issuer.get(`/api/events/${eventId}/export.pdf`).expect(403);
    await scorer.get(`/api/events/${eventId}/evaluation`).expect(200);
    await evaluator.get(`/api/events/${eventId}/evaluation`).expect(200);
  });
});

describe("event workflow", () => {
  const cardIds: Record<string, number> = {};

  it("assigns shooter and card numbers and reuses the shooter for further cards", async () => {
    const b50 = disciplines["Büffel 50M"];
    const first = await issuer.post(`/api/events/${eventId}/cards`).send({ shooterName: "Anna", disciplineId: b50 }).expect(201);
    expect(first.body.shooter).toMatchObject({ number: 1, name: "Anna" });
    expect(first.body.cardNumber).toBe(1); // the card taken back above was the last one, its number is free again

    const second = await issuer.post(`/api/events/${eventId}/cards`).send({ shooterName: "Bert", disciplineId: b50 }).expect(201);
    expect(second.body.shooter.number).toBe(2);

    const again = await issuer.post(`/api/events/${eventId}/cards`).send({ shooterId: first.body.shooter.id, disciplineId: b50 }).expect(201);
    expect(again.body.shooter.number).toBe(1);
    const annaCas = await issuer.post(`/api/events/${eventId}/cards`).send({ shooterId: first.body.shooter.id, disciplineId: disciplines["CAS"] }).expect(201);
    const bertCas = await issuer.post(`/api/events/${eventId}/cards`).send({ shooterId: second.body.shooter.id, disciplineId: disciplines["CAS"] }).expect(201);

    Object.assign(cardIds, { anna1: first.body.id, bert1: second.body.id, anna2: again.body.id, annaCas: annaCas.body.id, bertCas: bertCas.body.id });
  });

  it("rejects disciplines that are not part of the event and invalid input", async () => {
    await issuer.post(`/api/events/${eventId}/cards`).send({ shooterName: "X", disciplineId: disciplines["Greenhorn"] }).expect(400);
    await issuer.post(`/api/events/${eventId}/cards`).send({ disciplineId: disciplines["CAS"] }).expect(400);
    await issuer.post(`/api/events/${eventId}/cards`).send({ shooterName: "  ", disciplineId: disciplines["CAS"] }).expect(400);
    await issuer.post(`/api/events/${eventId}/cards`).send({ shooterId: 99999, disciplineId: disciplines["CAS"] }).expect(404);
  });

  it("validates results against the discipline", async () => {
    await scorer.put(`/api/cards/${cardIds.anna1}/result`).send({ score: 101 }).expect(400);
    await scorer.put(`/api/cards/${cardIds.anna1}/result`).send({ score: -1 }).expect(400);
    await scorer.put(`/api/cards/${cardIds.anna1}/result`).send({ score: 7.5 }).expect(400);
    await scorer.put(`/api/cards/${cardIds.anna1}/result`).send({ rawTimeCs: 4000, penalties: 0 }).expect(400);
    await scorer.put(`/api/cards/${cardIds.annaCas}/result`).send({ score: 50 }).expect(400);
    await scorer.put(`/api/cards/${cardIds.annaCas}/result`).send({ rawTimeCs: 4000, penalties: -1 }).expect(400);
  });

  it("ranks by best card and reports statistics", async () => {
    await scorer.put(`/api/cards/${cardIds.anna1}/result`).send({ score: 70 }).expect(200);
    await scorer.put(`/api/cards/${cardIds.anna2}/result`).send({ score: 88 }).expect(200);
    await scorer.put(`/api/cards/${cardIds.bert1}/result`).send({ score: 85 }).expect(200);
    await scorer.put(`/api/cards/${cardIds.annaCas}/result`).send({ rawTimeCs: 4000, penalties: 3 }).expect(200);

    const res = await evaluator.get(`/api/events/${eventId}/evaluation`).expect(200);
    const [b50, cas] = res.body.rankings;
    expect(b50.rows.map((r: any) => [r.place, r.shooterName, r.score, r.cardCount])).toEqual([
      [1, "Anna", 88, 2],
      [2, "Bert", 85, 1],
    ]);
    expect(cas.rows.map((r: any) => [r.place, r.shooterName, r.finalTimeCs])).toEqual([[1, "Anna", 5500]]);
    expect(res.body.statistics).toMatchObject({ cardsIssued: 5, cardsOpen: 1, shooters: 2 });
    expect(res.body.statistics.disciplines.map((d: any) => [d.name, d.cards, d.shooters, d.openCards])).toEqual([
      ["Büffel 50M", 3, 2, 0],
      ["CAS", 2, 2, 1],
    ]);
  });

  it("lets issuers take back only cards without result", async () => {
    await issuer.delete(`/api/cards/${cardIds.anna1}`).expect(409);
  });

  it("exports a PDF with a statistics page and one page per discipline", async () => {
    const res = await scorer
      .get(`/api/events/${eventId}/export.pdf`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    const pdf = (res.body as Buffer).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(3);
  });

  it("does not allow removing a discipline that has cards", async () => {
    await admin.patch(`/api/events/${eventId}`).send({ disciplineIds: [disciplines["CAS"]] }).expect(409);
    const res = await admin
      .patch(`/api/events/${eventId}`)
      .send({ disciplineIds: [disciplines["Büffel 50M"], disciplines["CAS"], disciplines["Greenhorn"]] })
      .expect(200);
    expect(res.body.disciplines).toHaveLength(3);
    await admin.delete(`/api/disciplines/${disciplines["CAS"]}`).expect(409);
    await admin.patch(`/api/disciplines/${disciplines["CAS"]}`).send({ penaltySeconds: 10 }).expect(409);
  });

  it("makes a closed event read-only and its results visible to everyone", async () => {
    await admin.patch(`/api/events/${eventId}`).send({ status: "CLOSED" }).expect(200);
    await issuer.post(`/api/events/${eventId}/cards`).send({ shooterName: "Late", disciplineId: disciplines["CAS"] }).expect(409);
    await scorer.put(`/api/cards/${cardIds.bertCas}/result`).send({ rawTimeCs: 3000, penalties: 0 }).expect(409);
    await scorer.delete(`/api/cards/${cardIds.anna1}/result`).expect(409);
    await issuer.get(`/api/events/${eventId}/evaluation`).expect(200);
    // admins can still correct
    await admin.put(`/api/cards/${cardIds.bertCas}/result`).send({ rawTimeCs: 3000, penalties: 0 }).expect(200);
  });

  it("hides archived events from everyone but admins", async () => {
    await admin.patch(`/api/events/${eventId}`).send({ archived: true }).expect(200);
    expect((await evaluator.get("/api/events").expect(200)).body).toEqual([]);
    expect((await evaluator.get("/api/events?archived=true").expect(200)).body).toEqual([]);
    await evaluator.get(`/api/events/${eventId}`).expect(404);
    await evaluator.get(`/api/events/${eventId}/evaluation`).expect(404);
    await scorer.get(`/api/events/${eventId}/export.pdf`).expect(404);
    expect((await admin.get("/api/events?archived=true").expect(200)).body).toHaveLength(1);
    await admin.patch(`/api/events/${eventId}`).send({ archived: false }).expect(200);
    expect((await evaluator.get("/api/events").expect(200)).body).toHaveLength(1);
  });

  it("deletes an event together with its shooters and cards", async () => {
    await admin.delete(`/api/events/${eventId}`).expect(204);
    expect(await prisma.card.count()).toBe(0);
    expect(await prisma.shooter.count()).toBe(0);
    expect(await prisma.eventDiscipline.count()).toBe(0);
    expect(await prisma.discipline.count()).toBe(4);
  });
});
