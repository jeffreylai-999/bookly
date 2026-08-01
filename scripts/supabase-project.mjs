/**
 * Single source of truth for this checkout's local Supabase identity.
 *
 * Every git worktree shares one repo but must not share one Supabase stack.
 * The CLI derives container names from `project_id`, so two worktrees carrying
 * the same id resolve to the same containers: a `supabase db reset` in one then
 * replays its migrations into the other's database and wipes any in-flight
 * test. Deriving the id — and a matching block of host ports — from the
 * checkout directory keeps concurrent worktrees independent without anyone
 * hand-editing config.toml per worktree.
 *
 * The main checkout keeps `bookly` so its existing containers are unaffected;
 * worktrees become `bookly-<dir>`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const PORT_FILE = '.supabase-local.json';
const PORT_STRIDE = 100;

// Mirrors the [api]/[db]/[studio]/... port fields in supabase/config.toml.
const BASE_PORTS = {
  BOOKLY_PORT_API: 54321,
  BOOKLY_PORT_DB: 54322,
  BOOKLY_PORT_SHADOW: 54320,
  BOOKLY_PORT_POOLER: 54329,
  BOOKLY_PORT_STUDIO: 54323,
  BOOKLY_PORT_MAIL: 54324,
  BOOKLY_PORT_ANALYTICS: 54327,
};

export function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
}

/**
 * Project ids end up inside container names, which accept only a narrow
 * character set. A checkout in `My Bookly` or `feature work` would otherwise
 * build an invalid name and fail with a docker error that says nothing about
 * the real cause, so everything is collapsed to a lowercase dash-slug. Applied
 * to an explicit BOOKLY_PROJECT_ID as well, for the same reason.
 */
function sanitizeId(raw) {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Never fall back to plain `bookly`: a degenerate directory name would then
  // silently adopt the main checkout's stack instead of getting its own.
  return slug === '' ? 'unnamed' : slug;
}

/** Exported for the unit test; prefer `projectId()`. */
export function projectIdFor(directoryName) {
  const name = sanitizeId(directoryName);
  // A checkout already called `bookly…` keeps its own name rather than
  // doubling up into `bookly-bookly-2`.
  return name.startsWith('bookly') ? name : `bookly-${name}`;
}

export function projectId() {
  if (process.env.BOOKLY_PROJECT_ID) return sanitizeId(process.env.BOOKLY_PROJECT_ID);
  return projectIdFor(basename(repoRoot()));
}

/** Container the SQL gate runners talk to over `docker exec`. */
export function containerName() {
  return process.env.SUPABASE_DB_CONTAINER ?? `supabase_db_${projectId()}`;
}

/**
 * Resolves this checkout's database container by exact name. Selecting by name
 * rather than by scanning for `supabase_db_*` is what lets sibling worktrees run
 * their stacks at the same time: an ambiguous scan would either hard-fail or,
 * worse, run the gates against another worktree's schema.
 */
export function resolveContainer() {
  const name = containerName();
  const found = spawnSync(
    'docker',
    ['ps', '--filter', `name=^${name}$`, '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  );

  if (found.error) {
    throw new Error(
      `Could not run docker (is Docker installed and running?):\n${found.error.message}`,
    );
  }
  if (found.status !== 0) {
    throw new Error(`docker ps failed (exit ${found.status}):\n${found.stderr ?? ''}`);
  }
  if (!(found.stdout ?? '').split('\n').some((line) => line.trim() === name)) {
    throw new Error(
      `No running container named ${name}. Start this worktree's stack with ` +
        '`pnpm supabase:start`, or point at another with SUPABASE_DB_CONTAINER.',
    );
  }
  return name;
}

/**
 * Offsets are persisted per checkout: a stack that is already running must keep
 * the ports it was started with, so re-deriving one on every call is not safe.
 *
 * Two worktrees can in principle hash to the same block. That surfaces loudly
 * as a port bind failure from `supabase start`, not as silent sharing — edit
 * `.supabase-local.json` to any other offset to resolve it.
 */
function resolveOffset() {
  const id = projectId();
  if (id === 'bookly') return 0;

  const file = join(repoRoot(), PORT_FILE);
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (saved.projectId === id && Number.isInteger(saved.offset)) return saved.offset;
  }

  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const offset = PORT_STRIDE * (1 + (hash % 90));

  writeFileSync(file, `${JSON.stringify({ projectId: id, offset }, null, 2)}\n`);
  return offset;
}

/** Env overrides consumed by the `env(...)` placeholders in config.toml. */
export function supabaseEnv() {
  const offset = resolveOffset();
  const vars = { BOOKLY_PROJECT_ID: projectId() };
  for (const [key, base] of Object.entries(BASE_PORTS)) {
    vars[key] = String(base + offset);
  }
  return vars;
}
