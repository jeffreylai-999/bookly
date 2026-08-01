#!/usr/bin/env node
/**
 * Runs the transaction-scoped hold gates, then proves concurrent placement on
 * one title receives distinct queue positions.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CONTAINER_PREFIX = 'supabase_db_';
const STAFF_ID = 'd2111111-1111-1111-1111-111111111111';
const MEMBER_ONE_ID = 'd2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const MEMBER_TWO_ID = 'd2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
const TITLE_ID = 'd2bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function fail(message) {
  throw new Error(message);
}

function resolveContainer() {
  const override = process.env.SUPABASE_DB_CONTAINER;
  if (override) return override;

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
    fail(`No running ${CONTAINER_PREFIX}* container. Run \`pnpm supabase:start\`.`);
  }
  if (names.length > 1) {
    fail(
      `Several Supabase DB containers are running:\n  ${names.join('\n  ')}\n` +
        'Pick one with SUPABASE_DB_CONTAINER=<name>.',
    );
  }
  return names[0];
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

update public._holds_conc_barrier set ready_count = ready_count + 1 where id = 1;

do $$
declare
  v_go boolean := false;
begin
  while not v_go loop
    select go into v_go from public._holds_conc_barrier where id = 1;
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

const container = resolveContainer();
let concurrencyFixtureCreated = false;

try {
  const gates = psql(container, readFileSync('supabase/tests/holds_gates.sql', 'utf8'));
  process.stdout.write(gates.stdout ?? '');
  process.stderr.write(gates.stderr ?? '');

  psql(
    container,
    `
drop table if exists public._holds_conc_barrier;
create table public._holds_conc_barrier (
  id integer primary key,
  ready_count integer not null default 0,
  go boolean not null default false
);
grant select, update on public._holds_conc_barrier to authenticated;
insert into public._holds_conc_barrier (id) values (1);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '${STAFF_ID}',
  'authenticated', 'authenticated', 'holds-concurrency@bookly.local',
  crypt('test-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, full_name, email, role)
values ('${STAFF_ID}', 'Holds Concurrency Staff', 'holds-concurrency@bookly.local', 'staff');

insert into public.members (id, name, member_type_id, status, card_barcode)
values
  (
    '${MEMBER_ONE_ID}',
    'Concurrency Member One',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-HOLD-CONC-1'
  ),
  (
    '${MEMBER_TWO_ID}',
    'Concurrency Member Two',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-HOLD-CONC-2'
  );

insert into public.titles (id, title, author, genre)
values ('${TITLE_ID}', 'Concurrent Hold Title', 'Desk Author', 'Fiction');
`,
  );
  concurrencyFixtureCreated = true;

  const workers = [runWorker(container, MEMBER_ONE_ID), runWorker(container, MEMBER_TWO_ID)];

  let bothReady = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const probe = psql(
      container,
      'select ready_count from public._holds_conc_barrier where id = 1;',
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

  psql(container, 'update public._holds_conc_barrier set go = true where id = 1;');

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
  if (concurrencyFixtureCreated) {
    const cleanup = psql(
      container,
      `
drop table if exists public._holds_conc_barrier;
delete from public.holds where title_id = '${TITLE_ID}';
delete from public.members where id in ('${MEMBER_ONE_ID}', '${MEMBER_TWO_ID}');
delete from public.titles where id = '${TITLE_ID}';
delete from public.profiles where id = '${STAFF_ID}';
delete from auth.users where id = '${STAFF_ID}';
`,
      { allowFailure: true },
    );
    if (cleanup.status !== 0) {
      process.stderr.write(`Failed to remove hold concurrency fixture:\n${cleanup.stderr ?? ''}\n`);
      process.exitCode = 1;
    }
  }
}
