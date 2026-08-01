#!/usr/bin/env node
/**
 * Runs the Supabase CLI with this checkout's project id and port block injected,
 * so `supabase/config.toml` can stay worktree-agnostic. Use this instead of
 * calling `supabase` directly — a bare call resolves the `env(...)` placeholders
 * to empty and lands on a stack named `supabase_db_env_BOOKLY_PROJECT_ID_`.
 */
import { spawnSync } from 'node:child_process';
import { supabaseEnv } from './supabase-project.mjs';

const env = supabaseEnv();
process.stderr.write(
  `[supabase] project ${env.BOOKLY_PROJECT_ID} (api ${env.BOOKLY_PORT_API}, db ${env.BOOKLY_PORT_DB})\n`,
);

const result = spawnSync('npx', ['supabase', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ...env },
  shell: process.platform === 'win32',
});

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
