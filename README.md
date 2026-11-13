# result_manager

Web application for running shooting events of a shooting club (see [USE_CASE](USE_CASE)):
hand out shooting cards, record results, rank each discipline by every shooter's best card,
export the results as PDF and keep past events. The user interface is German.

## Roles

A user can have several roles.

| Role | German name | May |
|---|---|---|
| `ISSUER` | Kartenausgabe | register shooters, hand out shooting cards, take back a card without result |
| `SCORER` | Ergebniserfassung | enter and correct results, see rankings, export PDF |
| `EVALUATOR` | Auswertung | see rankings and statistics, export PDF |
| `ADMIN` | Administrator | everything, plus users, disciplines and events |

## Course of an event

1. The admin creates the event ("geplant") and chooses its disciplines. Nobody else sees it yet.
2. The admin **starts** it ("läuft"). Issuers, scorers and evaluators now work on this event
   automatically; they never choose an event. Only one event can run at a time.
3. Every shooter is registered once ("Neuen Schützen anlegen") and gets the next shooter
   number. Cards are then handed out by looking the shooter up by number or name. A further
   card for a discipline the shooter already shot is a "Nachlösung" and is marked as such.
4. The admin **ends** the event ("beendet"). From then on only admins see it, under
   "Veranstaltungen", with rankings, statistics and PDF export. They can restart, archive
   or delete it. Do the final evaluation and export before ending, or as admin afterwards.

The app is built for phones as well as larger screens.

## How results count

- **Points disciplines** (Büffel 50M, Büffel 100M, Greenhorn): the scorer enters the total
  of the 10 rounds. Highest total wins.
- **Time disciplines** (CAS): the scorer enters the time and the number of penalties.
  Final time = time + penalties × 5 s. Lowest final time wins.
- A shooter can get any number of cards; only their best card per discipline is ranked.
- Equal results share a place (1, 2, 2, 4).
- Shooter numbers are assigned automatically per event, starting at 1.
- The statistics count registered shooters, cards, and how many cards were "nachgelöst".

Admins can add further disciplines of either kind under "Disziplinen".

## Running it at an event

Requires Node.js 22 or newer.

```bash
npm install
npm run build
ADMIN_PASSWORD='choose-a-password' npm start
```

The server prints the addresses it is reachable at, e.g. `http://192.168.1.20:3000`.
Other devices in the same network open that address in their browser.

On the very first start the user `admin` is created. Its password is `ADMIN_PASSWORD`; if
that is not set, a random password is generated and printed once to the console. After that
the variable is no longer needed. Log in, change the password, then create the other users
under "Benutzer" and the event under "Veranstaltungen".

### Docker

```bash
ADMIN_PASSWORD='choose-a-password' docker compose up -d --build
```

The data is kept in the volume `result-manager-data`.

### Data and backup

Everything is stored in `data/` (Docker: `/app/data`): the SQLite database
`result-manager.db` and `session-secret`, the key that signs logins. To back up, stop the
server and copy the folder.

### Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | port the server listens on |
| `DATA_DIR` | `data` in the repository | where database and session secret are stored |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | `admin`, random | first admin, only used when there is no user yet |
| `COOKIE_SECURE` | `false` | set to `true` when the app is served over HTTPS |
| `JWT_SECRET` | generated | signing key for logins, instead of the `session-secret` file |

The app speaks plain HTTP, which is fine inside a club network. To make it reachable from
the internet, put it behind a reverse proxy with HTTPS and set `COOKIE_SECURE=true`.

## Development

```bash
npm install
npm run dev        # API on :3000, Vite dev server on :5173
npm test           # server tests (ranking logic, permissions, event workflow)
npm run typecheck
```

- `server/` – Express API, Prisma with SQLite, PDF export with pdfkit
- `client/` – React (Vite), Mantine, TanStack Query

After changing `server/prisma/schema.prisma` run `npx prisma migrate dev` in `server/`.
`prisma` and `@prisma/client` are pinned to the same 7.x version on purpose; npm's `latest`
tag of the `prisma` CLI currently points to an 8.0 release candidate.
