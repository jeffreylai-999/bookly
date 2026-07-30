#!/usr/bin/env node
/**
 * Runs supabase/tests/profiles_role_grant.sql against the local DB container.
 * Uses docker exec so it works without a host psql install (Windows-friendly).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/tests/profiles_role_grant.sql', 'utf8');
const result = spawnSync(
  'docker',
  ['exec', '-i', 'supabase_db_bookly', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: sql, encoding: 'utf8' },
);

if (result.error) {
  process.stderr.write(
    `Failed to run docker exec (is Docker running and is the local Supabase DB up?):\n${result.error.message}\n`,
  );
  process.exit(1);
}

process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
