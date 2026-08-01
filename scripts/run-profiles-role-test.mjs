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
