# Golf YouTube Search

Find golf YouTube videos by **course**, not video title.

Big golf channels (Bob Does Sports, Good Good, Grant Horvat, Bryan Bros, etc.) routinely title videos like "WE PLAYED THE MOST EXCLUSIVE COURSE IN CALIFORNIA" without naming the course in any searchable metadata. This indexes the course names out of titles, descriptions, and auto-captions so you can actually search for them.

See [PLAN.md](./PLAN.md) for the full design and milestone breakdown.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind v4
- **Postgres on Neon** via the serverless HTTP driver
- **Drizzle ORM** for schema and queries
- Deploys to **Vercel**

## Local setup

```bash
pnpm install
cp .env.example .env.local   # then paste your Neon DATABASE_URL
pnpm db:push                 # apply schema to your DB
pnpm dev
```

Open http://localhost:3000.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Next.js dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | Generate a new Drizzle migration from `src/db/schema.ts` |
| `pnpm db:push` | Push the current schema directly to the DB (dev convenience) |
| `pnpm db:studio` | Open Drizzle Studio against the DB |

All `db:*` scripts read `DATABASE_URL` from `.env.local` via `dotenv-cli`.

## Project layout

```
src/
├── app/                 # Next.js routes
└── db/
    ├── index.ts         # Drizzle client (Neon HTTP)
    └── schema.ts        # Tables: courses, channels, videos, video_courses, extraction_review_queue
drizzle.config.ts        # Drizzle Kit config
PLAN.md                  # Design + milestones
```

## Milestone status

- [x] **M1** — Scaffold + Neon + Drizzle wired, hello-world page reads from DB
- [ ] **M2** — Course catalog seeded (OSM import + curated list)
- [ ] **M3** — YouTube ingestion for one channel
- [ ] **M4** — LLM extraction + review queue
- [ ] **M5** — Search UI + course pages
- [ ] **M6** — Backfill top 50 channels
- [ ] **M7** — Polish + share
