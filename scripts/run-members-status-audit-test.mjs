#!/usr/bin/env node
/**
 * Runs supabase/tests/members_status_audit.sql against the local DB container.
 * Mirrors scripts/run-profiles-role-test.mjs.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CONTAINER_PREFIX = 'supabase_db_';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function resolveContainer() {
  const override = process.env.SUPABASE_DB_CONTAINER;
  if (override) {
    return override;
  }

  const found = spawnSync(
    'docker',
    ['ps', '--filter', `name=${CONTAINER_PREFIX}`, '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  );

  if (found.error) {
    fail(`Could not run docker (is Docker installed and running?):\n${found.error.message}`);
  }
  if (found.status !== 0) {
    fail(`docker ps failed (exit ${found.status}):\n${found.stderr ?? ''}`);
  }

  const names = (found.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (names.length === 0) {
    fail(
      `No running ${CONTAINER_PREFIX}* container. Start the stack with \`pnpm supabase:start\`.`,
    );
  }
  if (names.length > 1) {
    fail(
      `Several Supabase DB containers are running:\n  ${names.join('\n  ')}\n` +
        'Pick one with SUPABASE_DB_CONTAINER=<name>.',
    );
  }

  return names[0];
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
