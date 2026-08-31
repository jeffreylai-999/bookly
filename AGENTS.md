# AGENTS.md

Bookly is a staff-facing library desk tool. It is an Angular 22 SSR app backed by a
local Supabase stack (Postgres + GoTrue auth + PostgREST + Studio) run via the
Supabase CLI in Docker.

- Product/domain context: `CONTEXT.md`, `DESIGN.md`, `docs/`.
- Standard commands live in `package.json` scripts, `README.md`, and `angular.json`.
  Prefer those sources; this file only records non-obvious caveats.

## Cursor Cloud specific instructions

### Services

| Service | What it is | Run it with | Notes |
| --- | --- | --- | --- |
| Angular dev app | SSR dev server (Vite) at `http://localhost:4200` | `pnpm start` | Uses `src/environments/environment.development.ts` (hardcoded local Supabase URL + anon key); it does **not** read `.env`. |
| Supabase stack | Local Postgres/Auth/REST/Studio in Docker | `pnpm supabase:start` (stop: `pnpm supabase:stop`, keys: `pnpm exec supabase status`) | Required for anything past the login screen. Migrations in `supabase/migrations` + `supabase/seed.sql` apply automatically on first start. |

Lint/test/build (details in `package.json` / `README.md`):

- Tests: `pnpm test` (Angular `unit-test` builder → Vitest, jsdom). Runs headless; `CI=true` avoids watch mode. ~180 specs.
- Build: `pnpm build` (production) — SSR build into `dist/bookly`.
- Lint: there is **no** `lint` script and no ESLint config. Formatting is Prettier only
  (`pnpm exec prettier --check .`), and the repo is **not** currently Prettier-clean, so a
  failing `--check` is expected/pre-existing — do not mass-reformat.
- DB smoke tests (need the stack running): `pnpm test:sql:profiles-role`, `pnpm test:sql:members`,
  `pnpm test:sql:copies-status` (run SQL via `docker exec` against `supabase_db_bookly`).

### Node version (critical, non-obvious)

Angular CLI 22 requires Node `>=22.22.3` (or 24/26). The harness ships an older
`node` at `/exec-daemon/node` (v22.14.0) that is **first** in `PATH` and will make
`ng`/`pnpm test`/`pnpm build` fail with a Node-version error. The environment
snapshot pins Node 24 by placing symlinks in `/usr/local/cargo/bin` (which precedes
`/exec-daemon` in `PATH`) → `~/.nvm/versions/node/v24.15.0/bin/{node,npm,npx,corepack,pnpm}`.
If `node -v` ever reports 22.14.0 again, re-create those symlinks; do not rely on
`nvm use`, which only swaps the nvm `PATH` entry (still behind `/exec-daemon`).

### Docker (must be started each session)

Docker is installed but there is no init system, so the daemon is **not** running on a
fresh boot. Start it once per session before Supabase:

```bash
sudo dockerd > /tmp/dockerd.log 2>&1 &
# then allow non-root access for the session:
sudo chmod 666 /var/run/docker.sock
```

Docker 29 is configured for this VM (`/etc/docker/daemon.json`) with
`storage-driver: fuse-overlayfs` and `containerd-snapshotter: false`, and
iptables set to `iptables-legacy`. These are required here — do not change them.

### Seeding auth users / demo data

`pnpm seed:auth` creates the staff/admin users + sample members. It reads `.env`
(git-ignored) for `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. After
`pnpm supabase:start`, get the values from `pnpm exec supabase status` and write `.env`
(see `.env.example`). Demo credentials (local only) live in `scripts/seed-auth.mjs`:
`staff@bookly.local` / `bookly-staff-demo`, `admin@bookly.local` / `bookly-admin-demo`.

### Login: invite-only email (not a disabled provider)

Staff sign in with email+password (`signInWithPassword`). Self-signup stays off via
`[auth] enable_signup = false` (`GOTRUE_DISABLE_SIGNUP=true`). The email provider
must stay on via `[auth.email] enable_signup = true`. If that flag is false, the
CLI maps it to `GOTRUE_EXTERNAL_EMAIL_ENABLED=false` and login returns
`422 email_provider_disabled` ([supabase/supabase#40582](https://github.com/supabase/supabase/issues/40582)).

If Kong on `127.0.0.1:54321` is missing (`seed:auth` → `AuthRetryableFetchError: fetch failed`),
recreate the stack from this checkout: `pnpm supabase:stop && pnpm supabase:start`.
Do not reuse an Auth/Kong container whose bind mounts point at a deleted worktree.
