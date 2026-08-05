-- Verifies the seven Reports metric functions (spec §7 "Reports (P2)")
-- against controlled fixtures with known, backdated timestamps: overdue
-- aging buckets (present-state, not range-scoped), dead stock (zero
-- checkouts in range + a lendable copy), high-demand (checkout count, tie
-- broken by waiting holds), fine collection (collected vs incurred per
-- day), new-member growth, peak hours, and genre breakdown. Also checks
-- the shared p_days validation and that a title with checkouts outside the
-- range still counts as dead stock (range-relative, not "never loaned").
-- Run after `pnpm supabase:start`:
--   pnpm test:sql:reports

begin;

-- app_settings.timezone is 'America/New_York' by default; pin it to UTC for
-- this test so "N days ago at HH:MM" fixtures land on the exact
-- library-local calendar day the assertions expect, with no DST surprises.
update public.app_settings set timezone = 'UTC' where id = true;

-- new-member growth is asserted as a delta against this baseline: unlike
-- loans/fines/payments (nothing else seeds those), `pnpm seed:auth` is part
-- of the documented local setup and inserts members with joined_at = now(),
-- which can land inside this test's own 7/14-day windows. A delta keeps the
-- assertion correct whether or not seed:auth has already run.
create temporary table report_test_baseline as
select
  coalesce((select sum(member_count) from public.report_new_member_growth(7)), 0) as growth_7,
  coalesce((select sum(member_count) from public.report_new_member_growth(14)), 0) as growth_14;
-- Read later under `set local role authenticated` (below); the table is
-- owned by the connecting (superuser) role, so cross-role access needs an
-- explicit grant.
grant select on report_test_baseline to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'f1111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'reports-staff@bookly.local',
  crypt('test-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, full_name, email, role)
values ('f1111111-1111-1111-1111-111111111111', 'Reports Staff', 'reports-staff@bookly.local', 'staff');

-- Members: three joins inside the 7-day range (today, 3 days ago, 6 days
-- ago) and one 10 days ago (outside a 7-day range, inside 14/30).
insert into public.members (id, name, member_type_id, status, card_barcode, joined_at)
values
  ('f2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Report Member One', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-RPT-1', now()),
  ('f2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Report Member Two', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-RPT-2', now() - interval '3 days'),
  ('f2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Report Member Three', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-RPT-3', now() - interval '6 days'),
  ('f2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Report Member Four', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-RPT-4', now() - interval '10 days');

-- Titles: Alpha (high demand, 2 checkouts in range + 1 waiting hold),
-- Beta (1 checkout in range, tie-break loser), Gamma (checkout only OUTSIDE
-- range — dead stock inside a 7-day range despite having loan history),
-- Delta (never loaned at all — dead stock everywhere), Epsilon (never
-- loaned, but its only copy is damaged — NOT dead stock: nothing lendable
-- can be sitting idle).
insert into public.titles (id, title, author, genre)
values
  ('f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Report Alpha', 'Author A', 'Sci-fi'),
  ('f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'Report Beta', 'Author B', 'Fiction'),
  ('f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'Report Gamma', 'Author C', 'Sci-fi'),
  ('f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', 'Report Delta', 'Author D', 'Fiction'),
  ('f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5', 'Report Epsilon', 'Author E', 'Mystery');

-- Fixtures on flow-critical tables require service_role (RLS/grants revoke
-- direct writes from authenticated — ADR-0001).
set local role service_role;

insert into public.copies (id, title_id, barcode, status)
values
  ('f3cccccc-cccc-cccc-cccc-cccccccccc01', 'f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'BK-RPT-ALPHA-1', 'available'),
  ('f3cccccc-cccc-cccc-cccc-cccccccccc02', 'f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'BK-RPT-BETA-1', 'available'),
  ('f3cccccc-cccc-cccc-cccc-cccccccccc03', 'f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'BK-RPT-GAMMA-1', 'available'),
  ('f3cccccc-cccc-cccc-cccc-cccccccccc04', 'f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', 'BK-RPT-DELTA-1', 'available'),
  -- Retired copy on a title with no other copies must NOT show up as dead
  -- stock (no lendable copy).
  ('f3cccccc-cccc-cccc-cccc-cccccccccc05', 'f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', 'BK-RPT-DELTA-2', 'retired'),
  -- Epsilon's only copy is damaged — not checkoutable, so not "lendable"
  -- even though it's not retired either.
  ('f3cccccc-cccc-cccc-cccc-cccccccccc06', 'f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5', 'BK-RPT-EPSILON-1', 'damaged');

-- Alpha: 2 checkouts in range (today 09:00, 2 days ago 14:00) + returned so
-- the copy is reusable; also a waiting hold for the high-demand tie-break.
insert into public.loans (copy_id, member_id, due_at, checked_out_at, returned_at, status)
values
  (
    'f3cccccc-cccc-cccc-cccc-cccccccccc01',
    'f2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    now() - interval '2 days' + interval '21 days',
    date_trunc('day', now() - interval '2 days') + interval '14 hours',
    date_trunc('day', now() - interval '1 day') + interval '10 hours',
    'returned'
  ),
  (
    'f3cccccc-cccc-cccc-cccc-cccccccccc01',
    'f2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    now() + interval '21 days',
    date_trunc('day', now()) + interval '9 hours',
    null,
    'active'
  );

-- Beta: 1 checkout in range (today 09:00, same hour as Alpha's second — hour
-- histogram should show 2 at that hour).
insert into public.loans (copy_id, member_id, due_at, checked_out_at, returned_at, status)
values (
  'f3cccccc-cccc-cccc-cccc-cccccccccc02',
  'f2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  now() + interval '21 days',
  date_trunc('day', now()) + interval '9 hours',
  null,
  'active'
);

-- Gamma: 1 checkout, but 20 days ago — outside a 7/14-day range, inside 30.
insert into public.loans (copy_id, member_id, due_at, checked_out_at, returned_at, status)
values (
  'f3cccccc-cccc-cccc-cccc-cccccccccc03',
  'f2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  now() - interval '20 days' + interval '21 days',
  now() - interval '20 days',
  now() - interval '19 days',
  'returned'
);

insert into public.holds (title_id, member_id, queue_position, status)
values ('f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'f2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 1, 'waiting');

-- Fines/payments: one fine incurred + fully paid today, one fine incurred
-- 3 days ago + partially paid 3 days ago (collected/incurred split across
-- the same day here), one voided payment that must NOT count as collected.
insert into public.fines (id, member_id, amount, reason, status, created_at)
values
  ('f4ffffff-ffff-ffff-ffff-ffffffffff01', 'f2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 10.00, 'overdue', 'paid', now()),
  ('f4ffffff-ffff-ffff-ffff-ffffffffff02', 'f2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 6.00, 'damaged', 'partial', now() - interval '3 days');

insert into public.payments (id, fine_id, amount, method, recorded_by, created_at)
values
  ('f5aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'f4ffffff-ffff-ffff-ffff-ffffffffff01', 10.00, 'cash', 'f1111111-1111-1111-1111-111111111111', now()),
  ('f5aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'f4ffffff-ffff-ffff-ffff-ffffffffff02', 2.00, 'cash', 'f1111111-1111-1111-1111-111111111111', now() - interval '3 days'),
  -- voided the same day it was recorded (below) — must be excluded from
  -- "collected" despite a non-null amount.
  ('f5aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'f4ffffff-ffff-ffff-ffff-ffffffffff01', 3.00, 'cash', 'f1111111-1111-1111-1111-111111111111', now());

update public.payments
set voided_by = 'f1111111-1111-1111-1111-111111111111', void_reason = 'test void', voided_at = now()
where id = 'f5aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';

-- An overdue loan (present-state) for the aging buckets: due 10 days ago,
-- still active → days_late = 10 → bucket '8-14'.
insert into public.loans (copy_id, member_id, due_at, checked_out_at, returned_at, status)
values (
  'f3cccccc-cccc-cccc-cccc-cccccccccc04',
  'f2aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
  now() - interval '10 days',
  now() - interval '31 days',
  null,
  'active'
);

-- ---------------------------------------------------------------------------
-- Act as staff (RLS lets any authenticated staff read every underlying
-- table + these SECURITY INVOKER functions — Reports is not admin-gated).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = 'f1111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Range validation: only 7/14/30 accepted.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.report_dead_stock(15);
    raise exception 'expected invalid_range from report_dead_stock';
  exception when others then
    if sqlerrm not like 'invalid_range%' then raise; end if;
  end;
  begin
    perform public.report_high_demand(null);
    raise exception 'expected invalid_range from report_high_demand';
  exception when others then
    if sqlerrm not like 'invalid_range%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- report_overdue_aging: present-state, unaffected by any range argument.
-- The Delta loan is 10 days late → '8-14'; everything else is 0.
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  select loan_count into v_count from public.report_overdue_aging() where bucket = '8-14';
  if v_count <> 1 then
    raise exception 'expected 1 loan in 8-14 bucket, got %', v_count;
  end if;

  select loan_count into v_count from public.report_overdue_aging() where bucket = '1-7';
  if v_count <> 0 then
    raise exception 'expected 0 loans in 1-7 bucket, got %', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- report_dead_stock: at 7 days, Gamma (checkout was 20 days ago) IS dead
-- stock again despite having loan history; Delta (never loaned, one
-- lendable copy despite the retired second copy) is dead stock at every
-- range; Alpha/Beta (checked out today) are never dead stock. Epsilon
-- (never loaned, but its only copy is damaged) is NEVER dead stock — it has
-- no copy capable of being idle in the first place.
-- ---------------------------------------------------------------------------
-- Scoped to this fixture's own titles: the base seed (supabase/seed.sql)
-- ships titles with no loan history at all, which are legitimately dead
-- stock at every range and would otherwise confound an unscoped assertion.
do $$
declare
  v_titles text[];
begin
  select coalesce(array_agg(title order by title), '{}') into v_titles
  from public.report_dead_stock(7)
  where title like 'Report %';
  if v_titles <> array['Report Delta', 'Report Gamma'] then
    raise exception 'expected [Delta, Gamma] dead at 7 days, got %', v_titles;
  end if;

  select coalesce(array_agg(title order by title), '{}') into v_titles
  from public.report_dead_stock(30)
  where title like 'Report %';
  if v_titles <> array['Report Delta'] then
    raise exception 'expected [Delta] dead at 30 days, got %', v_titles;
  end if;
end $$;

-- Delta's lendable_copies excludes the retired second copy; Epsilon has zero
-- lendable copies (damaged is not "available"/"on_hold_shelf") and so is
-- absent from the result set entirely (the `having ... > 0` clause), not
-- merely reported with a zero count.
do $$
declare
  v_count integer;
  v_epsilon_present boolean;
begin
  select lendable_copies into v_count
  from public.report_dead_stock(30)
  where title_id = 'f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4';
  if v_count <> 1 then
    raise exception 'expected 1 lendable copy for Delta (retired copy excluded), got %', v_count;
  end if;

  select exists (
    select 1 from public.report_dead_stock(30)
    where title_id = 'f3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5'
  ) into v_epsilon_present;
  if v_epsilon_present then
    raise exception 'Epsilon (damaged-only copy) must not appear as dead stock';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- report_high_demand: Alpha (2 checkouts, 1 waiting hold) ranks above Beta
-- (1 checkout, 0 holds); Gamma/Delta absent (zero checkouts in a 7-day
-- range).
-- ---------------------------------------------------------------------------
do $$
declare
  v_first record;
  v_second record;
  v_count integer;
begin
  -- Scoped to this fixture's own titles: seed titles have no loans and will
  -- not appear, but unrelated loan data from other concurrent sessions could
  -- otherwise cause a spurious count mismatch.
  select count(*) into v_count from public.report_high_demand(7) where title like 'Report %';
  if v_count <> 2 then
    raise exception 'expected 2 titles in high demand at 7 days, got %', v_count;
  end if;

  select title, checkout_count, waiting_holds into v_first
  from public.report_high_demand(7) order by checkout_count desc limit 1;
  if v_first.title <> 'Report Alpha' or v_first.checkout_count <> 2 or v_first.waiting_holds <> 1 then
    raise exception 'expected Alpha first with 2 checkouts / 1 hold, got %', v_first;
  end if;

  select title, checkout_count into v_second
  from public.report_high_demand(7) order by checkout_count desc offset 1 limit 1;
  if v_second.title <> 'Report Beta' or v_second.checkout_count <> 1 then
    raise exception 'expected Beta second with 1 checkout, got %', v_second;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- report_fine_collection: today collected = 10.00 (the 3.00 payment was
-- voided and must be excluded), today incurred = 10.00; 3 days ago
-- collected = 2.00, incurred = 6.00.
-- ---------------------------------------------------------------------------
do $$
declare
  v_today record;
  v_three_ago record;
begin
  select collected, incurred into v_today
  from public.report_fine_collection(7)
  where report_date = (now() at time zone 'UTC')::date;
  if v_today.collected <> 10.00 or v_today.incurred <> 10.00 then
    raise exception 'expected today collected 10.00 / incurred 10.00 (voided payment excluded), got % / %',
      v_today.collected, v_today.incurred;
  end if;

  select collected, incurred into v_three_ago
  from public.report_fine_collection(7)
  where report_date = (now() at time zone 'UTC')::date - 3;
  if v_three_ago.collected <> 2.00 or v_three_ago.incurred <> 6.00 then
    raise exception 'expected 3-days-ago collected 2.00 / incurred 6.00, got % / %',
      v_three_ago.collected, v_three_ago.incurred;
  end if;
end $$;

-- Zero-fill: a day with no activity still has a row.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.report_fine_collection(7);
  if v_count <> 7 then
    raise exception 'expected 7 zero-filled rows for a 7-day range, got %', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- report_new_member_growth: 3 joins land inside a 7-day range (today, -3,
-- -6); the 4th (-10 days) only appears once the range widens to 14/30.
-- ---------------------------------------------------------------------------
do $$
declare
  v_baseline record;
  v_sum_7 integer;
  v_sum_14 integer;
begin
  select * into v_baseline from report_test_baseline;

  select coalesce(sum(member_count), 0) into v_sum_7 from public.report_new_member_growth(7);
  if v_sum_7 - v_baseline.growth_7 <> 3 then
    raise exception 'expected 3 new members added in a 7-day range, got %', v_sum_7 - v_baseline.growth_7;
  end if;

  select coalesce(sum(member_count), 0) into v_sum_14 from public.report_new_member_growth(14);
  if v_sum_14 - v_baseline.growth_14 <> 4 then
    raise exception 'expected 4 new members added in a 14-day range, got %', v_sum_14 - v_baseline.growth_14;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- report_peak_hours: 2 checkouts at hour 9 (Alpha + Beta, both "today"), 1
-- at hour 14 (Alpha's first, 2 days ago) — both inside a 7-day range.
-- ---------------------------------------------------------------------------
do $$
declare
  v_hour9 integer;
  v_hour14 integer;
begin
  select checkout_count into v_hour9 from public.report_peak_hours(7) where hour_of_day = 9;
  if v_hour9 <> 2 then
    raise exception 'expected 2 checkouts at hour 9, got %', v_hour9;
  end if;

  select checkout_count into v_hour14 from public.report_peak_hours(7) where hour_of_day = 14;
  if v_hour14 <> 1 then
    raise exception 'expected 1 checkout at hour 14, got %', v_hour14;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- report_genre_breakdown: Sci-fi 2 (both Alpha checkouts), Fiction 1 (Beta)
-- in a 7-day range; Gamma's Sci-fi checkout only surfaces at 30 days.
-- ---------------------------------------------------------------------------
do $$
declare
  v_scifi_7 integer;
  v_fiction_7 integer;
  v_scifi_30 integer;
begin
  select checkout_count into v_scifi_7 from public.report_genre_breakdown(7) where genre = 'Sci-fi';
  if v_scifi_7 <> 2 then
    raise exception 'expected 2 Sci-fi checkouts at 7 days, got %', v_scifi_7;
  end if;

  select checkout_count into v_fiction_7 from public.report_genre_breakdown(7) where genre = 'Fiction';
  if v_fiction_7 <> 1 then
    raise exception 'expected 1 Fiction checkout at 7 days, got %', v_fiction_7;
  end if;

  select checkout_count into v_scifi_30 from public.report_genre_breakdown(30) where genre = 'Sci-fi';
  if v_scifi_30 <> 3 then
    raise exception 'expected 3 Sci-fi checkouts at 30 days (Gamma included), got %', v_scifi_30;
  end if;
end $$;

rollback;
