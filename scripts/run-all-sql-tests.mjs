#!/usr/bin/env node
/**
 * Runs every `test:sql:*` package script in sequence against the local DB.
 * Requires `pnpm supabase:start` (or equivalent) first.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const scripts = Object.keys(pkg.scripts)
  .filter((name) => name.startsWith('test:sql:'))
  .sort();

if (scripts.length === 0) {
  process.stderr.write('No test:sql:* scripts found in package.json\n');
  process.exit(1);
}

for (const name of scripts) {
  process.stderr.write(`\n==> pnpm ${name}\n`);
  const result = spawnSync('pnpm', [name], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.stderr.write(`\nAll ${scripts.length} SQL gate tests passed.\n`);
