#!/usr/bin/env node
/**
 * Runs supabase/tests/profiles_role_grant.sql against the local DB container.
 * Uses docker exec so it works without a host psql install (Windows-friendly).
 *
 * The container is discovered from `docker ps` rather than hard-coded, so a
 * renamed `project_id` in config.toml keeps working. Set SUPABASE_DB_CONTAINER
 * to pick one explicitly when several stacks are up at once.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolveContainer } from './supabase-project.mjs';


function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const sql = readFileSync('supabase/tests/profiles_role_grant.sql', 'utf8');
const container = resolveContainer();

const result = spawnSync(
  'docker',
  ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: sql, encoding: 'utf8' },
);

if (result.error) {
  fail(`Failed to run docker exec against ${container}:\n${result.error.message}`);
}

process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
