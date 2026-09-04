# Bookly

A **staff-facing library desk tool** for circulation, catalog management, members, holds, and fines. This is a back-office application for library staff — not a patron portal.

## Tech Stack

- **Frontend**: [Angular 22](https://angular.dev/) with SSR (Server-Side Rendering via Vite)
- **Backend**: [Supabase](https://supabase.com/) (Postgres, GoTrue auth, PostgREST) — run locally via the Supabase CLI in Docker
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Testing**: [Vitest](https://vitest.dev/) (unit) + custom SQL test scripts (database layer)
- **Package manager**: [pnpm](https://pnpm.io/)

## Prerequisites

- **Node.js** ≥ 22.22.3 (or 24 / 26)
- **pnpm** 10.x (`npm install -g pnpm`) — repo pins `pnpm@10.34.5` via `packageManager`
- **Docker** (required to run the local Supabase stack)

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start the local Supabase stack

Docker must be running before starting Supabase.

```bash
pnpm supabase:start
```

This starts a local Postgres database, GoTrue auth, PostgREST API, and Supabase Studio. Migrations in `supabase/migrations/` and the seed file `supabase/seed.sql` are applied automatically on first start.

To check the running services and retrieve API keys:

```bash
pnpm supabase:status
# or: pnpm exec supabase status
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in the values shown by `pnpm supabase:status`:

```bash
cp .env.example .env
# then edit .env with SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY
```

`pnpm seed:auth` needs the **service role** key (local `.env` only — never commit it).

> The Angular app reads credentials from `src/environments/environment*.ts`, **not** from `.env`. The `.env` file is used only by Node seed/admin scripts.

### 4. Seed demo users

```bash
pnpm seed:auth
```

This creates the staff and admin demo accounts. Demo credentials (local only):

| Role  | Email                  | Password            |
| ----- | ---------------------- | ------------------- |
| Staff | staff@bookly.local     | bookly-staff-demo   |
| Admin | admin@bookly.local     | bookly-admin-demo   |

### 5. Start the development server

```bash
pnpm start
```

Open your browser and navigate to `http://localhost:4200/`. The application reloads automatically when source files change.

### Login note (local)

Invite-only: `[auth] enable_signup = false` (no self-signup) and `[auth.email] enable_signup = true` (email/password sign-in on). After `pnpm supabase:start`, run `pnpm seed:auth`, then sign in as `staff@bookly.local` / `bookly-staff-demo`. If Kong is down (`fetch failed` on port 54321), stop and start the stack from this checkout. Details: `AGENTS.md`.

## Available Scripts

| Script | Description |
| --- | --- |
| `pnpm start` | Start the Angular SSR dev server at `http://localhost:4200` |
| `pnpm build` | Production build (output in `dist/bookly/`) |
| `pnpm test` | Run unit tests with Vitest (headless) |
| `pnpm test:sql` | Run all SQL gate tests (requires Supabase stack) |
| `pnpm supabase:start` | Start the local Supabase stack |
| `pnpm supabase:stop` | Stop the local Supabase stack |
| `pnpm supabase:status` | Show running services and API keys |
| `pnpm supabase:reset` | Reset the local database (re-runs migrations + seed) |
| `pnpm supabase:types` | Regenerate TypeScript types from the database schema |
| `pnpm seed:auth` | Create demo staff/admin auth users (requires `.env`) |

## Running Unit Tests

```bash
pnpm test
```

Uses the Angular `unit-test` builder backed by Vitest and jsdom. Pass `CI=true` to run headless without watch mode.

## Running Database (SQL) Tests

These tests require the local Supabase stack to be running (`pnpm supabase:start`).

```bash
# all gates
pnpm test:sql

# or individually
pnpm test:sql:profiles-role
pnpm test:sql:profiles-select-admin
pnpm test:sql:members
pnpm test:sql:copies-status
pnpm test:sql:checkout
pnpm test:sql:checkout-concurrency
pnpm test:sql:holds
pnpm test:sql:holds-lifecycle
pnpm test:sql:checkin
pnpm test:sql:renew
pnpm test:sql:fines
pnpm test:sql:reports
pnpm test:sql:notifications
pnpm test:sql:cron
pnpm test:sql:settings
```

## CI

On pushes and pull requests to `main`, GitHub Actions runs:

- **Unit Tests** — `CI=true pnpm test`
- **SQL Tests** — local Supabase in Docker, then `pnpm test:sql`
- **CodeQL** — JavaScript/TypeScript static analysis

Workflows live in `.github/workflows/`.

## Deploy

GitHub Actions does not deploy. After the checks above pass, hosts pick up `main` via their Git integrations.

**Vercel (web app)**

1. Import `jeffreylai-999/bookly` at [vercel.com/new](https://vercel.com/new). Production branch: `main`.
2. Confirm Node.js is **24.x** (`package.json#engines`). Framework preset: Angular.
3. Leave Install / Build as defaults (`pnpm install`, `pnpm build`). SSR is wired by `vercel.json` + `api/index.js`.
4. Merge to `main`. Confirm the deployment serves `/` through the serverless function, not a static `index.html` shell.

Pin `packageManager` to pnpm 10.x. pnpm 12’s `bin/pnpm` is a placeholder unless install scripts run, which breaks Vercel’s provisioner.

**Supabase (database)**

1. In the hosted project: **Project Settings → Integrations → GitHub**. Authorize and select this repo.
2. Working directory: `.` (`supabase/` is at the repo root).
3. Enable **Deploy to production**. Leave **Automatic branching** off unless you want a preview database per PR.
4. Before the first deploy, confirm remote migration history matches `supabase/migrations` (`supabase migration list` against that project).
5. Merge to `main`. New migrations apply automatically. Auth settings and `seed.sql` do **not** — configure those in the dashboard.

## Project Structure

```
src/                  Angular application source
api/                  Vercel serverless entry (imports the SSR bundle)
vercel.json           Vercel rewrites + function includeFiles
supabase/
  migrations/         SQL migration files (applied in order)
  seed.sql            Reference/catalog seed data
  tests/              SQL test scripts
scripts/              Node.js tooling scripts (seed, type-gen, SQL test runners)
.github/workflows/    CI (unit, SQL, CodeQL)
docs/                 Architecture decisions (ADRs), design notes, plans
```

## Domain Glossary

| Term | Definition |
| --- | --- |
| **Member** | A person who borrows from the library (identified by card barcode `MBR-`) |
| **Title** | A bibliographic work (title / author / ISBN); never lent directly |
| **Copy** | A physical item of a title (`BK-` barcode); the unit of lending |
| **Loan** | One copy checked out to one member |
| **Hold** | A member's place in the queue for a title |
| **Check-out** | Issuing a copy to a member |
| **Check-in** | Returning a copy to the library |
| **Waive** | Admin forgiveness of a fine's remaining balance |
| **Void** | Admin reversal of an erroneous payment record |

## Additional Resources

- [Angular CLI Overview](https://angular.dev/tools/cli)
- [Supabase Local Development](https://supabase.com/docs/guides/local-development)
- [Vitest Documentation](https://vitest.dev/)
