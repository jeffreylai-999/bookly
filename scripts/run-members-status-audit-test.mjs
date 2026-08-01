#!/usr/bin/env node
/**
 * Runs supabase/tests/members_status_audit.sql against the local DB container.
 * Mirrors scripts/run-profiles-role-test.mjs.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolveContainer } from './supabase-project.mjs';


function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const sql = readFileSync('supabase/tests/members_status_audit.sql', 'utf8');
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
