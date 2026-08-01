#!/usr/bin/env node
/**
 * Two concurrent authenticated checkouts of the same copy — exactly one wins.
 * Uses a shared barrier row so both sessions enter checkout together.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolveContainer } from './supabase-project.mjs';

const STAFF_ID = 'c2111111-1111-1111-1111-111111111111';
const MEMBER_ID = 'c2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const TITLE_ID = 'c2bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const COPY_ID = 'c2cccccc-cccc-cccc-cccc-cccccccccc01';
const BARCODE = 'BK-CONC-001';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
