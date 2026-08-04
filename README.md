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
- **pnpm** 10.x (`npm install -g pnpm`)
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
# then edit .env with your local SUPABASE_URL and SUPABASE_ANON_KEY
```

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

## Available Scripts

| Script | Description |
| --- | --- |
| `pnpm start` | Start the Angular SSR dev server at `http://localhost:4200` |
| `pnpm build` | Production build (output in `dist/bookly/`) |
| `pnpm test` | Run unit tests with Vitest (headless) |
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
pnpm test:sql:profiles-role
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

## Project Structure

```
src/                  Angular application source
supabase/
  migrations/         SQL migration files (applied in order)
  seed.sql            Reference/catalog seed data
  tests/              SQL test scripts
scripts/              Node.js tooling scripts (seed, type-gen, SQL test runners)
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
