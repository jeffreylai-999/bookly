#!/usr/bin/env node
/**
 * Writes `supabase gen types typescript --local` output to the types file.
 *
 * Not a shell redirect: `> file` under PowerShell emits UTF-8 *with* a BOM and
 * CRLF endings, which lands an invisible `﻿` before `export` and makes the
 * generated file diff noisily against every other file in the repo. Going
 * through Node keeps the write at UTF-8/LF regardless of which shell npm picks.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const OUT = 'src/app/core/supabase/database.types.ts';

const result = spawnSync('supabase', ['gen', 'types', 'typescript', '--local'], {
  encoding: 'utf8',
  shell: true,
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || 'supabase gen types failed\n');
  process.exit(result.status ?? 1);
}

const body = result.stdout.replace(/^﻿/, '').replace(/\r\n/g, '\n');

if (!body.trimStart().startsWith('export')) {
  process.stderr.write(
    `Unexpected generator output, refusing to write ${OUT}:\n${body.slice(0, 200)}\n`,
  );
  process.exit(1);
}

writeFileSync(OUT, body, { encoding: 'utf8' });
process.stdout.write(`Wrote ${OUT} (${body.length} bytes, UTF-8 no BOM, LF)\n`);
