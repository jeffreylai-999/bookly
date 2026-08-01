#!/usr/bin/env node
/**
 * Runs the transaction-scoped hold gates, then proves concurrent placement on
 * one title receives distinct queue positions.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolveContainer } from './supabase-project.mjs';

// Unlike the transaction-scoped gate files, these fixtures are COMMITTED: the
// concurrency probe needs two independent sessions to see each other's rows.
// They are therefore namespaced per run, so two checkouts sharing one database
// cannot collide on a primary key or delete each other's rows during cleanup.
// A hard crash leaves this run's rows behind; `pnpm supabase:reset` clears them.
const RUN_ID = (process.env.BOOKLY_RUN_ID ?? randomUUID()).replace(/[^a-z0-9]/gi, '').slice(0, 8);
const STAFF_ID = randomUUID();
const MEMBER_ONE_ID = randomUUID();
const MEMBER_TWO_ID = randomUUID();
const TITLE_ID = randomUUID();
const BARRIER = `public._holds_conc_barrier_${RUN_ID}`;
const STAFF_EMAIL = `holds-concurrency-${RUN_ID}@bookly.local`;
const MEMBER_ONE_BARCODE = `MBR-HOLD-CONC-${RUN_ID}-1`;
const MEMBER_TWO_BARCODE = `MBR-HOLD-CONC-${RUN_ID}-2`;

function fail(message) {
  throw new Error(message);
}

function psql(container, sql, { allowFailure = false } = {}) {
  const result = spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' },
  );
  if (result.error) fail(result.error.message);
  if (!allowFailure && result.status !== 0) {
    fail(`psql failed:\n${result.stderr ?? ''}\n${result.stdout ?? ''}`);
  }
  return result;
}

function runWorker(container, memberId) {
  const sql = `
set role authenticated;
set request.jwt.claim.sub = '${STAFF_ID}';
set request.jwt.claim.role = 'authenticated';
set request.jwt.claims = '{"sub":"${STAFF_ID}","role":"authenticated"}';

update ${BARRIER} set ready_count = ready_count + 1 where id = 1;

do $$
declare
  v_go boolean := false;
begin
  while not v_go loop
    select go into v_go from ${BARRIER} where id = 1;
    if not coalesce(v_go, false) then
      perform pg_sleep(0.02);
    end if;
  end loop;
end $$;

select (public.place_hold('${memberId}', '${TITLE_ID}')).queue_position;
`;

  return new Promise((resolve) => {
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        container,
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cleanupConcurrencyFixture(container, { allowFailure = false } = {}) {
  return psql(
    container,
    `
drop table if exists ${BARRIER};
do $$
begin
  if to_regclass('public.holds') is not null then
    execute 'delete from public.holds where title_id = ''${TITLE_ID}''';
  end if;
end $$;
delete from public.members where id in ('${MEMBER_ONE_ID}', '${MEMBER_TWO_ID}');
delete from public.titles where id = '${TITLE_ID}';
delete from public.profiles where id = '${STAFF_ID}';
delete from auth.users where id = '${STAFF_ID}';
`,
    { allowFailure },
  );
}

const container = resolveContainer();

try {
  const gates = psql(container, readFileSync('supabase/tests/holds_gates.sql', 'utf8'));
  process.stdout.write(gates.stdout ?? '');
  process.stderr.write(gates.stderr ?? '');

  cleanupConcurrencyFixture(container);

  psql(
    container,
    `
begin;
create table ${BARRIER} (
  id integer primary key,
  ready_count integer not null default 0,
  go boolean not null default false
);
grant select, update on ${BARRIER} to authenticated;
insert into ${BARRIER} (id) values (1);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '${STAFF_ID}',
  'authenticated', 'authenticated', '${STAFF_EMAIL}',
  crypt('test-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, full_name, email, role)
values ('${STAFF_ID}', 'Holds Concurrency Staff', '${STAFF_EMAIL}', 'staff');

insert into public.members (id, name, member_type_id, status, card_barcode)
values
  (
    '${MEMBER_ONE_ID}',
    'Concurrency Member One',
    '11111111-1111-1111-1111-111111111101',
    'active',
    '${MEMBER_ONE_BARCODE}'
  ),
  (
    '${MEMBER_TWO_ID}',
    'Concurrency Member Two',
    '11111111-1111-1111-1111-111111111101',
    'active',
    '${MEMBER_TWO_BARCODE}'
  );

insert into public.titles (id, title, author, genre)
values ('${TITLE_ID}', 'Concurrent Hold Title', 'Desk Author', 'Fiction');
commit;
`,
  );

  const workers = [runWorker(container, MEMBER_ONE_ID), runWorker(container, MEMBER_TWO_ID)];

  let bothReady = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const probe = psql(
      container,
      `select ready_count from ${BARRIER} where id = 1;`,
    );
    const readyCount = Number((probe.stdout.match(/^\s*(\d+)\s*$/m) ?? [])[1] ?? 0);
    if (readyCount === 2) {
      bothReady = true;
      break;
    }
    await sleep(20);
  }
  if (!bothReady) {
    fail('Concurrent hold workers did not reach the barrier.');
  }

  psql(container, `update ${BARRIER} set go = true where id = 1;`);

  const results = await Promise.all(workers);
  for (const [index, result] of results.entries()) {
    if (result.code !== 0) {
      fail(
        `hold worker ${index + 1} failed (exit ${result.code}):\n` +
          `${result.stderr}\n${result.stdout}`,
      );
    }
  }

  const assertion = psql(
    container,
    `
do $$
declare
  v_positions integer[];
begin
  select array_agg(queue_position order by queue_position)
  into v_positions
  from public.holds
  where title_id = '${TITLE_ID}'
    and status in ('waiting', 'ready');

  if v_positions <> array[1, 2] then
    raise exception 'expected concurrent queue positions {1,2}, got %', v_positions;
  end if;
end $$;
select 'holds concurrency: queue positions 1,2' as result;
`,
  );
  process.stdout.write(assertion.stdout ?? '');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  const cleanup = cleanupConcurrencyFixture(container, { allowFailure: true });
  if (cleanup.status !== 0) {
    process.stderr.write(`Failed to remove hold concurrency fixture:\n${cleanup.stderr ?? ''}\n`);
    process.exitCode = 1;
  }
}
