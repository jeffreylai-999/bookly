-- Verifies the overnight pg_cron jobs: library-local morning gating + last-run
-- markers, expire_holds promotion chain, and notify_overdue anti-join
-- idempotency (incl. renew-then-overdue-again). Run after `pnpm supabase:start`:
--   pnpm test:sql:cron

begin;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'c1111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'cron-staff@bookly.local',
  crypt('test-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, full_name, email, role)
values (
  'c1111111-1111-1111-1111-111111111111',
  'Cron Staff',
  'cron-staff@bookly.local',
  'staff'
);

insert into public.members (id, name, member_type_id, status, card_barcode)
values
  ('c1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'Ready Member', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-CRON-1'),
  ('c1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'Next Member', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-CRON-2'),
  ('c1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03', 'Overdue Member', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-CRON-3'),
  ('c1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04', 'Solo Expire', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-CRON-4');

insert into public.titles (id, title, author, genre)
values
  ('c1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'Expire Promote Title', 'Cron Author', 'Fiction'),
  ('c1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'Expire Available Title', 'Cron Author', 'Fiction'),
  ('c1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03', 'Overdue Title', 'Cron Author', 'Fiction');

set local role service_role;

insert into public.copies (id, title_id, barcode, status)
values
  ('c1cccccc-cccc-cccc-cccc-cccccccccc01', 'c1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-CRON-PROMOTE', 'on_hold_shelf'),
  ('c1cccccc-cccc-cccc-cccc-cccccccccc02', 'c1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'BK-CRON-AVAIL', 'on_hold_shelf'),
  ('c1cccccc-cccc-cccc-cccc-cccccccccc03', 'c1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03', 'BK-CRON-OVERDUE', 'on_loan');

-- Ready holds past expiry relative to the pinned p_now values below (2026-03
-- through 2026-11), plus a waiting queue head on the promote title.
insert into public.holds (
  id, title_id, member_id, queue_position, status, copy_id, ready_at, expires_at
)
values
  (
    'c1dddddd-dddd-dddd-dddd-dddddddddd01',
    'c1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
    'c1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
    1, 'ready',
    'c1cccccc-cccc-cccc-cccc-cccccccccc01',
    timestamptz '2026-01-01 00:00:00+00',
    timestamptz '2026-01-08 00:00:00+00'
  ),
  (
    'c1dddddd-dddd-dddd-dddd-dddddddddd02',
    'c1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
    'c1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
    2, 'waiting',
    null, null, null
  ),
  (
    'c1dddddd-dddd-dddd-dddd-dddddddddd03',
    'c1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
    'c1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04',
    1, 'ready',
    'c1cccccc-cccc-cccc-cccc-cccccccccc02',
    timestamptz '2026-01-01 00:00:00+00',
    timestamptz '2026-01-08 00:00:00+00'
  );

insert into public.loans (
  id, copy_id, member_id, checked_out_by, checked_out_at, due_at, status
)
values (
  'c1eeeeee-eeee-eeee-eeee-eeeeeeeeee01',
  'c1cccccc-cccc-cccc-cccc-cccccccccc03',
  'c1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
  'c1111111-1111-1111-1111-111111111111',
  now() - interval '20 days',
  now() - interval '5 days',
  'active'
);

-- Pin library tz so local-hour math is deterministic across hosts.
update public.app_settings
set
  timezone = 'America/New_York',
  expire_holds_last_run_date = null,
  notify_overdue_last_run_date = null,
  notify_on_overdue = true
where id = true;

reset role;

-- Morning instant in America/New_York: 2026-07-15 08:30 EDT = 12:30 UTC.
-- Outside morning: 2026-07-15 10:30 EDT = 14:30 UTC.
-- Same morning, second tick: 2026-07-15 08:45 EDT = 12:45 UTC.
-- DST spring-forward morning (clocks jump 02→03): 2026-03-08 08:15 EDT = 12:15 UTC.
-- DST fall-back morning: 2026-11-01 08:15 EST = 13:15 UTC.

-- ---------------------------------------------------------------------------
-- A. Outside the morning window → no-op (holds untouched, marker unset).
-- ---------------------------------------------------------------------------
do $$
declare
  v_status text;
  v_marker date;
begin
  perform public.expire_holds(timestamptz '2026-07-15 14:30:00+00');

  select status into v_status
  from public.holds
  where id = 'c1dddddd-dddd-dddd-dddd-dddddddddd01';

  if v_status <> 'ready' then
    raise exception 'outside-morning expire_holds must leave ready hold untouched, got %', v_status;
  end if;

  select expire_holds_last_run_date into v_marker
  from public.app_settings
  where id = true;

  if v_marker is not null then
    raise exception 'outside-morning expire_holds must not set last-run marker';
  end if;
end;
$$;

do $$
declare
  v_count integer;
  v_marker date;
begin
  perform public.notify_overdue(timestamptz '2026-07-15 14:30:00+00');

  select count(*) into v_count
  from public.notifications
  where type = 'overdue'
    and entity_id = 'c1eeeeee-eeee-eeee-eeee-eeeeeeeeee01';

  if v_count <> 0 then
    raise exception 'outside-morning notify_overdue must insert nothing, got %', v_count;
  end if;

  select notify_overdue_last_run_date into v_marker
  from public.app_settings
  where id = true;

  if v_marker is not null then
    raise exception 'outside-morning notify_overdue must not set last-run marker';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- B. First morning run expires + promotes; second same-day run no-ops.
-- ---------------------------------------------------------------------------
do $$
declare
  v_expired public.holds;
  v_promoted public.holds;
  v_copy public.copies;
  v_notif_count integer;
  v_marker date;
  v_solo public.holds;
  v_solo_copy public.copies;
begin
  perform public.expire_holds(timestamptz '2026-07-15 12:30:00+00');

  select * into v_expired
  from public.holds
  where id = 'c1dddddd-dddd-dddd-dddd-dddddddddd01';

  if v_expired.status <> 'expired' then
    raise exception 'expired ready hold should be status=expired, got %', v_expired.status;
  end if;

  select * into v_promoted
  from public.holds
  where id = 'c1dddddd-dddd-dddd-dddd-dddddddddd02';

  if v_promoted.status <> 'ready' then
    raise exception 'queue head should be promoted to ready, got %', v_promoted.status;
  end if;
  if v_promoted.copy_id <> 'c1cccccc-cccc-cccc-cccc-cccccccccc01' then
    raise exception 'promoted hold should keep the shelf copy';
  end if;

  select * into v_copy
  from public.copies
  where id = 'c1cccccc-cccc-cccc-cccc-cccccccccc01';

  if v_copy.status <> 'on_hold_shelf' then
    raise exception 'promoted shelf copy should stay on_hold_shelf, got %', v_copy.status;
  end if;

  select count(*) into v_notif_count
  from public.notifications
  where type = 'hold_ready'
    and entity_id = 'c1dddddd-dddd-dddd-dddd-dddddddddd02';

  if v_notif_count <> 1 then
    raise exception 'promoted hold should insert exactly one hold_ready notification, got %', v_notif_count;
  end if;

  -- No queue → copy returns to available.
  select * into v_solo
  from public.holds
  where id = 'c1dddddd-dddd-dddd-dddd-dddddddddd03';

  if v_solo.status <> 'expired' then
    raise exception 'solo expired hold should be expired, got %', v_solo.status;
  end if;

  select * into v_solo_copy
  from public.copies
  where id = 'c1cccccc-cccc-cccc-cccc-cccccccccc02';

  if v_solo_copy.status <> 'available' then
    raise exception 'solo expiry should shelve copy as available, got %', v_solo_copy.status;
  end if;

  select expire_holds_last_run_date into v_marker
  from public.app_settings
  where id = true;

  if v_marker <> date '2026-07-15' then
    raise exception 'expire_holds should stamp library-local date, got %', v_marker;
  end if;

  -- Second tick same local morning: no further promotions / notifications.
  perform public.expire_holds(timestamptz '2026-07-15 12:45:00+00');

  select count(*) into v_notif_count
  from public.notifications
  where type = 'hold_ready'
    and entity_id = 'c1dddddd-dddd-dddd-dddd-dddddddddd02';

  if v_notif_count <> 1 then
    raise exception 'same-day re-run must not insert another hold_ready, got %', v_notif_count;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- C. notify_overdue: insert once; rerun inserts nothing; renew-then-overdue
--    again does not duplicate (anti-join on loan entity_id).
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
  v_detail jsonb;
  v_marker date;
begin
  perform public.notify_overdue(timestamptz '2026-07-15 12:30:00+00');

  select count(*) into v_count
  from public.notifications
  where type = 'overdue'
    and entity_type = 'loan'
    and entity_id = 'c1eeeeee-eeee-eeee-eeee-eeeeeeeeee01';

  if v_count <> 1 then
    raise exception 'notify_overdue should insert one overdue row, got %', v_count;
  end if;

  select detail into v_detail
  from public.notifications
  where type = 'overdue'
    and entity_id = 'c1eeeeee-eeee-eeee-eeee-eeeeeeeeee01';

  if v_detail ->> 'member_name' is distinct from 'Overdue Member'
     or v_detail ->> 'title' is distinct from 'Overdue Title' then
    raise exception 'overdue notification detail missing names: %', v_detail;
  end if;

  select notify_overdue_last_run_date into v_marker
  from public.app_settings
  where id = true;

  if v_marker <> date '2026-07-15' then
    raise exception 'notify_overdue should stamp library-local date, got %', v_marker;
  end if;

  -- Same-day re-run: still one row.
  perform public.notify_overdue(timestamptz '2026-07-15 12:45:00+00');

  select count(*) into v_count
  from public.notifications
  where type = 'overdue'
    and entity_id = 'c1eeeeee-eeee-eeee-eeee-eeeeeeeeee01';

  if v_count <> 1 then
    raise exception 'same-day notify_overdue re-run must insert nothing new, got %', v_count;
  end if;

  -- Simulate a renewal that cleared overdue, then the loan falls overdue again.
  -- Anti-join is on the loan id, not due_at — so no second notification.
  update public.app_settings
  set notify_overdue_last_run_date = null
  where id = true;

  update public.loans
  set due_at = now() + interval '7 days'
  where id = 'c1eeeeee-eeee-eeee-eeee-eeeeeeeeee01';

  update public.loans
  set due_at = now() - interval '2 days'
  where id = 'c1eeeeee-eeee-eeee-eeee-eeeeeeeeee01';

  perform public.notify_overdue(timestamptz '2026-07-16 12:30:00+00');

  select count(*) into v_count
  from public.notifications
  where type = 'overdue'
    and entity_id = 'c1eeeeee-eeee-eeee-eeee-eeeeeeeeee01';

  if v_count <> 1 then
    raise exception 'renewed-then-overdue-again must not duplicate overdue notification, got %', v_count;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- D. DST transition mornings still produce exactly one effective run
--    (both jobs; fixed-date cases).
-- ---------------------------------------------------------------------------
do $$
declare
  v_expire_marker date;
  v_notify_marker date;
begin
  update public.app_settings
  set
    expire_holds_last_run_date = null,
    notify_overdue_last_run_date = null
  where id = true;

  -- Spring forward 2026-03-08 (America/New_York): 08:15 local exists once.
  perform public.expire_holds(timestamptz '2026-03-08 12:15:00+00');
  perform public.notify_overdue(timestamptz '2026-03-08 12:15:00+00');
  perform public.expire_holds(timestamptz '2026-03-08 12:45:00+00');
  perform public.notify_overdue(timestamptz '2026-03-08 12:45:00+00');

  select expire_holds_last_run_date, notify_overdue_last_run_date
  into v_expire_marker, v_notify_marker
  from public.app_settings
  where id = true;

  if v_expire_marker <> date '2026-03-08' then
    raise exception 'DST spring-forward expire_holds should stamp once, got %', v_expire_marker;
  end if;
  if v_notify_marker <> date '2026-03-08' then
    raise exception 'DST spring-forward notify_overdue should stamp once, got %', v_notify_marker;
  end if;

  update public.app_settings
  set
    expire_holds_last_run_date = null,
    notify_overdue_last_run_date = null
  where id = true;

  -- Fall back 2026-11-01: 08:15 EST = 13:15 UTC.
  perform public.expire_holds(timestamptz '2026-11-01 13:15:00+00');
  perform public.notify_overdue(timestamptz '2026-11-01 13:15:00+00');
  perform public.expire_holds(timestamptz '2026-11-01 13:45:00+00');
  perform public.notify_overdue(timestamptz '2026-11-01 13:45:00+00');

  select expire_holds_last_run_date, notify_overdue_last_run_date
  into v_expire_marker, v_notify_marker
  from public.app_settings
  where id = true;

  if v_expire_marker <> date '2026-11-01' then
    raise exception 'DST fall-back expire_holds should stamp once, got %', v_expire_marker;
  end if;
  if v_notify_marker <> date '2026-11-01' then
    raise exception 'DST fall-back notify_overdue should stamp once, got %', v_notify_marker;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- E. Authenticated JWTs cannot execute the cron entry points.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = 'c1111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
begin
  begin
    perform public.expire_holds(timestamptz '2026-07-15 12:30:00+00');
    raise exception 'authenticated must not execute expire_holds';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlstate = '42501' then
        null;
      else
        raise;
      end if;
  end;

  begin
    perform public.notify_overdue(timestamptz '2026-07-15 12:30:00+00');
    raise exception 'authenticated must not execute notify_overdue';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlstate = '42501' then
        null;
      else
        raise;
      end if;
  end;
end;
$$;

rollback;
