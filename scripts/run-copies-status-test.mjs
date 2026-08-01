#!/usr/bin/env node
/**
 * Runs supabase/tests/copies_status_grant.sql against the local DB container.
 * Mirrors scripts/run-profiles-role-test.mjs.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolveContainer } from './supabase-project.mjs';


function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
