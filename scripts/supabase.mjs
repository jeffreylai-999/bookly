#!/usr/bin/env node
/**
 * Runs the Supabase CLI with this checkout's project id and port block injected,
 * so `supabase/config.toml` can stay worktree-agnostic. Use this instead of
 * calling `supabase` directly — a bare call resolves the `env(...)` placeholders
 * to empty and lands on a stack named `supabase_db_env_BOOKLY_PROJECT_ID_`.
 */
import { spawnSync } from 'node:child_process';
import { projectId, supabaseEnv } from './supabase-project.mjs';

// Worth running once in the main checkout, but not worth duplicating across
// every concurrent worktree stack. Excluded at run time rather than switched off
// in config.toml, so the committed defaults and the main checkout are unchanged.
const WORKTREE_EXCLUDES = 'studio,logflare,vector';

const env = supabaseEnv();
const args = process.argv.slice(2);

if (
  args[0] === 'start' &&
  projectId() !== 'bookly' &&
  !args.some((arg) => arg === '-x' || arg === '--exclude')
) {
  args.push('-x', WORKTREE_EXCLUDES);
}

process.stderr.write(
  `[supabase] project ${env.BOOKLY_PROJECT_ID} (api ${env.BOOKLY_PORT_API}, db ${env.BOOKLY_PORT_DB})\n`,
);

const result = spawnSync('npx', ['supabase', ...args], {
  stdio: 'inherit',
  env: { ...process.env, ...env },
  shell: process.platform === 'win32',
});

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
