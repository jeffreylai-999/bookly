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
  throw new Error(message);
}

function psql(container, sql, { ignoreStatus = false } = {}) {
  const result = spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
    { input: sql, encoding: 'utf8' },
  );
  if (result.error) fail(result.error.message);
  if (!ignoreStatus && result.status !== 0) {
    fail(`psql failed:\n${result.stderr}\n${result.stdout}`);
  }
  return result;
}

function runWorker(container, workerId) {
  const sql = `
set role authenticated;
set request.jwt.claim.sub = '${STAFF_ID}';
set request.jwt.claim.role = 'authenticated';
set request.jwt.claims = '{"sub":"${STAFF_ID}","role":"authenticated"}';

do $$
declare
  ready boolean := false;
begin
  while not ready loop
    select go into ready from public._checkout_conc_barrier where id = 1;
    if not coalesce(ready, false) then
      perform pg_sleep(0.02);
    end if;
  end loop;
end $$;

do $$
declare
  ok boolean := false;
  err text;
begin
  begin
    perform public.checkout('${MEMBER_ID}', array['${BARCODE}']::text[]);
    ok := true;
  exception
    when others then
      err := sqlerrm;
  end;

  insert into public._checkout_conc_results (worker_id, ok, err)
  values (${workerId}, ok, err);
end $$;
`;

  return new Promise((resolve) => {
    const child = spawn(
      'docker',
      ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('close', (code) => resolve({ workerId, code, stdout, stderr }));
    child.stdin.write(sql);
    child.stdin.end();
  });
}

function cleanupConcurrencyFixture(container, { ignoreStatus = false } = {}) {
  return psql(
    container,
    `
delete from public.audit_log
where action = 'loan.checkout'
  and detail -> 'copy_ids' ? '${COPY_ID}';
delete from public.loans where copy_id = '${COPY_ID}';
delete from public.copies where id = '${COPY_ID}';
delete from public.titles where id = '${TITLE_ID}';
delete from public.members where id = '${MEMBER_ID}';
delete from public.profiles where id = '${STAFF_ID}';
delete from auth.users where id = '${STAFF_ID}';
drop table if exists public._checkout_conc_barrier;
drop table if exists public._checkout_conc_results;
`,
    { ignoreStatus },
  );
}

const container = resolveContainer();
const runToken = randomUUID();

try {
  cleanupConcurrencyFixture(container);

  // Setup fixtures + barrier (committed).
  psql(
    container,
    `
drop table if exists public._checkout_conc_barrier;
drop table if exists public._checkout_conc_results;

create table public._checkout_conc_barrier (id int primary key, go boolean not null default false);
create table public._checkout_conc_results (
  worker_id int primary key,
  ok boolean not null,
  err text
);
grant select, update on public._checkout_conc_barrier to authenticated;
grant select, insert, update on public._checkout_conc_results to authenticated;
insert into public._checkout_conc_barrier (id, go) values (1, false);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '${STAFF_ID}',
  'authenticated', 'authenticated', 'conc-${runToken}@bookly.local',
  crypt('test-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
)
on conflict (id) do nothing;

insert into public.profiles (id, full_name, email, role)
values ('${STAFF_ID}', 'Conc Staff', 'conc-${runToken}@bookly.local', 'staff')
on conflict (id) do nothing;

insert into public.members (id, name, member_type_id, status, card_barcode)
values (
  '${MEMBER_ID}',
  'Conc Member',
  '11111111-1111-1111-1111-111111111101',
  'active',
  'MBR-CONC-${runToken.slice(0, 8)}'
)
on conflict (id) do nothing;

insert into public.titles (id, title, author, genre)
values ('${TITLE_ID}', 'Conc Title', 'Author', 'Fiction')
on conflict (id) do nothing;

insert into public.copies (id, title_id, barcode, status)
values ('${COPY_ID}', '${TITLE_ID}', '${BARCODE}', 'available');
`,
  );

  const workers = [runWorker(container, 1), runWorker(container, 2)];

  // Wait until both sessions are sitting in the barrier loop.
  let spunUp = false;
  for (let i = 0; i < 100; i++) {
    const probe = psql(
      container,
      `select count(*)::int as n
       from pg_stat_activity
       where state = 'active'
         and query ilike '%_checkout_conc_barrier%';`,
    );
    const n = Number((probe.stdout.match(/^\s*(\d+)\s*$/m) ?? [])[1] ?? 0);
    if (n >= 2) {
      spunUp = true;
      break;
    }
    spawnSync('sleep', ['0.05']);
  }

  if (!spunUp) {
    // Still release the barrier — workers may already be waiting with idle-in-transaction.
    process.stderr.write(
      'warning: could not confirm both workers via pg_stat_activity; releasing barrier anyway\n',
    );
  }

  psql(container, `update public._checkout_conc_barrier set go = true where id = 1;`);

  const results = await Promise.all(workers);
  for (const result of results) {
    if (result.code !== 0) {
      fail(
        `worker ${result.workerId} failed (exit ${result.code}):\n${result.stderr}\n${result.stdout}`,
      );
    }
  }

  const summary = psql(
    container,
    `
select
  (select count(*) from public._checkout_conc_results where ok) as wins,
  (select count(*) from public._checkout_conc_results where not ok) as losses,
  (select count(*) from public.loans where copy_id = '${COPY_ID}' and status = 'active') as active_loans,
  (select status::text from public.copies where id = '${COPY_ID}') as copy_status,
  (select string_agg(coalesce(err, 'ok'), ' | ' order by worker_id) from public._checkout_conc_results) as detail;
`,
  );

  process.stdout.write(summary.stdout);

  const wins = Number(
    (summary.stdout.match(/^\s*(\d+)\s+\|\s+(\d+)\s+\|\s+(\d+)/m) ?? [])[1] ?? -1,
  );
  const losses = Number(
    (summary.stdout.match(/^\s*(\d+)\s+\|\s+(\d+)\s+\|\s+(\d+)/m) ?? [])[2] ?? -1,
  );
  const activeLoans = Number(
    (summary.stdout.match(/^\s*(\d+)\s+\|\s+(\d+)\s+\|\s+(\d+)/m) ?? [])[3] ?? -1,
  );
  const copyStatus = (summary.stdout.match(/\|\s+(on_loan|available)\s+\|/m) ?? [])[1];

  if (wins !== 1 || losses !== 1 || activeLoans !== 1 || copyStatus !== 'on_loan') {
    fail(
      `concurrency invariant failed: wins=${wins} losses=${losses} active_loans=${activeLoans} copy=${copyStatus}`,
    );
  }

  process.stdout.write('checkout concurrency: exactly one winner\n');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  const cleanup = cleanupConcurrencyFixture(container, { ignoreStatus: true });
  if (cleanup.status !== 0) {
    process.stderr.write(
      `Failed to remove checkout concurrency fixture:\n${cleanup.stderr ?? ''}\n`,
    );
    process.exitCode = 1;
  }
}
