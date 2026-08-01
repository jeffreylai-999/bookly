#!/usr/bin/env node
/**
 * Runs supabase/tests/checkout_gates.sql against the local DB container.
 * Mirrors scripts/run-copies-status-test.mjs.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolveContainer } from './supabase-project.mjs';


function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
