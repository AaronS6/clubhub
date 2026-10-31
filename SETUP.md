# ClubHub — Setup Guide

School-club management platform: announcements, meetings, service hours,
chat, tasks, notes, finances, and a public club directory — all in one place.

This zip is the full source. The demo database (with the example account and
three clubs) is included, so it runs immediately after install.

## Requirements

- **Bun** (recommended) — https://bun.sh — or Node.js 20+
- SQLite (nothing to install — the DB is a single file, driver included)

## Run it (3 steps)

```bash
# 1. Install dependencies
bun install

# 2. Generate the Prisma client
bunx prisma generate

# 3. Start the dev server
bun run dev
```

Open http://localhost:3000 — done.

**Demo login:** `alex@clubhub.example` / `ClubHub2026!`
(Alex is executive of Robotics Club; Photography Club + Debate Society are
also seeded with their own content.)

> Using npm instead? `npm install`, `npx prisma generate`, `npm run dev`.

## What's inside

| Folder | What it is |
| --- | --- |
| `src/` | The whole Next.js app (App Router, TypeScript) |
| `prisma/` | Database schema |
| `db/custom.db` | SQLite database with the demo data included |
| `scripts/` | Seed scripts (re-runnable, idempotent) |
| `public/` | Landing-page photos, banners, icons |
| `mini-services/realtime/` | Socket.io service for live chat/notifications |

## Optional extras

**Realtime chat service** (socket.io — the app polls as a fallback without
it, so this is optional for local use):

```bash
cd mini-services/realtime
bun install
bun run dev        # runs on ports 3003/3004
```

**Reset the demo data** anytime:

```bash
bun run scripts/seed-example-account.ts
bun run scripts/seed-public-clubs.ts
```

**Start from a blank database** (your own clubs, no demo data):

```bash
rm db/custom.db
bun run db:push
CLUBHUB_DISABLE_AUTOSEED=1 bun run dev   # the auto-seed guard respects this flag
```

## Deploying for real

- Set `DATABASE_URL` to your production database.
- Set `NEXTAUTH_SECRET` — generate one with `openssl rand -hex 32`.
  (Dev mode works without it; production refuses to start without it.)
- `bun run build && bun start` (or deploy to Render/Vercel/Fly).
- The realtime mini-service deploys as its own small process (see
  `mini-services/realtime/Dockerfile`).

## Notes

- The database file path lives in `.env` (`DATABASE_URL`). It's already
  set correctly for this folder layout.
- Uploaded images (avatars, club banners/logos) are stored **inside the
  SQLite database**, so they survive filesystem resets.
- First login as an executive walks through a one-time handbook confirm +
  the executive guide tour — skip or finish them once.
