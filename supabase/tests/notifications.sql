-- Verifies the notification bell's server contract: direct INSERT/DELETE stay
-- rejected for authenticated (ADR-0001 — RPCs/cron are the only writers),
-- mark-read is column-limited to read_at (shared across the desk team), the
-- table is registered on the Realtime publication the bell subscribes to, and
-- mark_ready / record_payment stamp member/title names into detail so the
-- bell can render a localized message without extra client-side joins.
-- Run after `pnpm supabase:start`:
--   pnpm test:sql:notifications

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'f1111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'notif-staff@bookly.local',
  crypt('test-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, full_name, email, role)
values ('f1111111-1111-1111-1111-111111111111', 'Notif Staff', 'notif-staff@bookly.local', 'staff');

insert into public.members (id, name, member_type_id, status, card_barcode)
values (
  'f0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'Notif Member',
  '11111111-1111-1111-1111-111111111101',
  'active',
  'MBR-NOTIF-1'
);

insert into public.titles (id, title, author, genre)
values (
  'f0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'Notification Title',
  'Desk Author',
  'Fiction'
);

-- Fixture notification + fixture copy: as service role, since notifications
-- and copies.status are RPC/cron-only for authenticated.
set local role service_role;

insert into public.copies (id, title_id, barcode, status)
values (
  'f0cccccc-cccc-cccc-cccc-cccccccccc01',
  'f0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'BK-NOTIF-1',
  'available'
);

insert into public.notifications (id, type, entity_type, entity_id, detail)
values (
  'f0dddddd-dddd-dddd-dddd-dddddddddd01',
  'hold_ready',
  'hold',
  'f0eeeeee-eeee-eeee-eeee-eeeeeeeeee01',
  '{"member_name": "Fixture Member", "title": "Fixture Title"}'::jsonb
);

-- Act as staff.
set local role authenticated;
set local request.jwt.claim.sub = 'f1111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Direct INSERT/DELETE stay rejected — only RPCs and cron write notifications.
-- ---------------------------------------------------------------------------
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.notifications (type, entity_type, entity_id, detail)
    values ('hold_ready', 'hold', 'f0eeeeee-eeee-eeee-eeee-eeeeeeeeee02', '{}'::jsonb);
  exception
    when insufficient_privilege then raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege on direct notifications insert';
  end if;
end $$;

do $$
declare
  raised boolean := false;
begin
  begin
    delete from public.notifications where id = 'f0dddddd-dddd-dddd-dddd-dddddddddd01';
  exception
    when insufficient_privilege then raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege on direct notifications delete';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Mark-read is column-limited: any other column is rejected by the grant
-- before RLS even runs; read_at (the mark-read column) succeeds and is shared
-- (no owner check) — any staff member can clear any notification.
-- ---------------------------------------------------------------------------
do $$
declare
  raised boolean := false;
begin
  begin
    update public.notifications
    set type = 'overdue'
    where id = 'f0dddddd-dddd-dddd-dddd-dddddddddd01';
  exception
    when insufficient_privilege then raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege when authenticated updates notifications.type';
  end if;
end $$;

update public.notifications
set read_at = now()
where id = 'f0dddddd-dddd-dddd-dddd-dddddddddd01';

do $$
begin
  if not exists (
    select 1 from public.notifications
    where id = 'f0dddddd-dddd-dddd-dddd-dddddddddd01'
      and read_at is not null
  ) then
    raise exception 'expected read_at to be set after mark-read update';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: the bell subscribes to INSERT on this table, which only fires for
-- tables registered on the `supabase_realtime` publication.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    raise exception 'expected public.notifications on the supabase_realtime publication';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The unread-scan partial index exists, so the bell's unread-count query and
-- mark-all-read's update stay proportional to the unread backlog as the
-- unbounded, unpruned table grows.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'notifications'
      and indexname = 'notifications_unread_idx'
      and indexdef like '%WHERE (read_at IS NULL)%'
  ) then
    raise exception 'expected a partial index on notifications for read_at IS NULL';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- mark_ready stamps member_name + title into detail — the bell renders a
-- localized message without an extra client-side join.
-- ---------------------------------------------------------------------------
set local role service_role;

insert into public.holds (id, title_id, member_id, queue_position, status)
values (
  'f0ffffff-ffff-ffff-ffff-ffffffffff01',
  'f0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'f0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  1,
  'waiting'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f1111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_hold public.holds;
  v_detail jsonb;
begin
  v_hold := public.mark_ready('f0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'BK-NOTIF-1');

  select detail into v_detail
  from public.notifications
  where type = 'hold_ready' and entity_id = v_hold.id;

  if v_detail->>'member_name' <> 'Notif Member' then
    raise exception 'expected hold_ready detail member_name Notif Member, got %', v_detail;
  end if;
  if v_detail->>'title' <> 'Notification Title' then
    raise exception 'expected hold_ready detail title Notification Title, got %', v_detail;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- record_payment stamps member_name into detail the same way.
-- ---------------------------------------------------------------------------
set local role service_role;

insert into public.fines (id, member_id, amount, reason)
values (
  'f0aaaaaa-1111-1111-1111-111111111111',
  'f0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  5.00,
  'overdue'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f1111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_result jsonb;
  v_payment_id uuid;
  v_detail jsonb;
begin
  v_result := public.record_payment('f0aaaaaa-1111-1111-1111-111111111111', 5.00, 'cash');
  v_payment_id := (v_result->'payment'->>'id')::uuid;

  select detail into v_detail
  from public.notifications
  where type = 'payment_recorded' and entity_id = v_payment_id;

  if v_detail->>'member_name' <> 'Notif Member' then
    raise exception 'expected payment_recorded detail member_name Notif Member, got %', v_detail;
  end if;
end $$;

rollback;
