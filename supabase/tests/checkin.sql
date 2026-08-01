-- Verifies the checkin RPC branches (ok / damaged / lost), the overdue_loans
-- view formula (library-local calendar days, day-boundary off-by-one), fine
-- stacking/replacement, audit rows, and that direct fines writes are rejected
-- for authenticated. Run after `pnpm supabase:start`:
--   pnpm test:sql:checkin

begin;

-- Fake auth user (staff).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'c2222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated', 'checkin-staff@bookly.local',
  crypt('test-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, full_name, email, role)
values (
  'c2222222-2222-2222-2222-222222222222',
  'Checkin Staff',
  'checkin-staff@bookly.local',
  'staff'
);

-- Adult type (seeded): fine_rate_per_day 0.25, loan_period_days 21.
insert into public.members (id, name, member_type_id, status, card_barcode)
values (
  'c3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Checkin Member',
  '11111111-1111-1111-1111-111111111101',
  'active',
  'MBR-CHECKIN-1'
);

insert into public.titles (id, title, author, genre, replacement_cost)
values
  (
    'c3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
    'Priced Title',
    'Desk Author',
    'Fiction',
    40.00
  ),
  (
    'c3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
    'Unpriced Title',
    'Desk Author',
    'Fiction',
    null
  );

-- Fixtures as service role: loans cannot be inserted as authenticated.
set local role service_role;

insert into public.copies (id, title_id, barcode, status)
values
  ('c3cccccc-cccc-cccc-cccc-cccccccccc01', 'c3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-CI-OK-ONTIME', 'on_loan'),
  ('c3cccccc-cccc-cccc-cccc-cccccccccc02', 'c3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-CI-OK-LATE', 'on_loan'),
  ('c3cccccc-cccc-cccc-cccc-cccccccccc03', 'c3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-CI-BOUNDARY', 'on_loan'),
  ('c3cccccc-cccc-cccc-cccc-cccccccccc04', 'c3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-CI-SAMEDAY', 'on_loan'),
  ('c3cccccc-cccc-cccc-cccc-cccccccccc05', 'c3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-CI-DMG-LATE', 'on_loan'),
  ('c3cccccc-cccc-cccc-cccc-cccccccccc06', 'c3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-CI-DMG-OVER', 'on_loan'),
  ('c3cccccc-cccc-cccc-cccc-cccccccccc07', 'c3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-CI-LOST-PRICED', 'on_loan'),
  ('c3cccccc-cccc-cccc-cccc-cccccccccc08', 'c3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'BK-CI-LOST-DEFAULT', 'on_loan'),
  ('c3cccccc-cccc-cccc-cccc-cccccccccc09', 'c3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-CI-AVAIL', 'available'),
  ('c3cccccc-cccc-cccc-cccc-cccccccccc10', 'c3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-CI-VIEW-FUTURE', 'on_loan');

-- Library-local boundary due dates (app_settings.timezone, default America/New_York):
--   BK-CI-BOUNDARY: yesterday 23:59 local → exactly 1 calendar day late.
--   BK-CI-SAMEDAY:  today 00:01 local     → overdue (due_at < now) but 0 days late.
insert into public.loans (copy_id, member_id, checked_out_by, checked_out_at, due_at, status)
select
  copies.id,
  'c3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'c2222222-2222-2222-2222-222222222222',
  now() - interval '10 days',
  case copies.barcode
    when 'BK-CI-OK-ONTIME' then now() + interval '5 days'
    when 'BK-CI-OK-LATE' then now() - interval '3 days'
    when 'BK-CI-BOUNDARY' then
      (((now() at time zone s.timezone)::date - 1) + time '23:59') at time zone s.timezone
    when 'BK-CI-SAMEDAY' then
      (((now() at time zone s.timezone)::date) + time '00:01') at time zone s.timezone
    when 'BK-CI-DMG-LATE' then now() - interval '2 days'
    when 'BK-CI-DMG-OVER' then now() + interval '5 days'
    when 'BK-CI-LOST-PRICED' then now() - interval '4 days'
    when 'BK-CI-LOST-DEFAULT' then now() + interval '5 days'
    when 'BK-CI-VIEW-FUTURE' then now() + interval '5 days'
  end,
  'active'
from public.copies
cross join public.app_settings s
where copies.barcode like 'BK-CI-%'
  and copies.status = 'on_loan';

-- Act as staff.
set local role authenticated;
set local request.jwt.claim.sub = 'c2222222-2222-2222-2222-222222222222';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c2222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- Direct writes into fines must be rejected (RPC-only mutation path).
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.fines (member_id, amount, reason)
    values ('c3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1.00, 'overdue');
  exception
    when insufficient_privilege then
      raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege on direct fines insert';
  end if;
end $$;

do $$
declare
  raised boolean := false;
begin
  begin
    update public.fines set amount = 0 where false;
  exception
    when insufficient_privilege then
      raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege on direct fines update';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- View formula: day-boundary off-by-one guard + not-due loans excluded.
-- ---------------------------------------------------------------------------
do $$
declare
  v_row public.overdue_loans;
begin
  select * into v_row
  from public.overdue_loans
  where copy_barcode = 'BK-CI-BOUNDARY';

  if not found then
    raise exception 'BK-CI-BOUNDARY should be present in overdue_loans';
  end if;

  if v_row.days_late <> 1 then
    raise exception 'day-boundary off-by-one: due 23:59 yesterday local, expected days_late 1, got %',
      v_row.days_late;
  end if;

  if v_row.projected_fine <> 0.25 then
    raise exception 'expected projected_fine 0.25 (1 day × 0.25), got %', v_row.projected_fine;
  end if;

  select * into v_row
  from public.overdue_loans
  where copy_barcode = 'BK-CI-SAMEDAY';

  if not found then
    raise exception 'BK-CI-SAMEDAY (due 00:01 today) is overdue and should be in the view';
  end if;

  if v_row.days_late <> 0 then
    raise exception 'due earlier today should be 0 calendar days late, got %', v_row.days_late;
  end if;

  if exists (
    select 1 from public.overdue_loans where copy_barcode = 'BK-CI-VIEW-FUTURE'
  ) then
    raise exception 'not-yet-due loan must not appear in overdue_loans';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- On-time ok return → loan returned, copy available, no fine.
-- ---------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
  v_loan public.loans;
  v_copy public.copies;
begin
  v_result := public.checkin('BK-CI-OK-ONTIME', 'ok');

  select * into v_loan from public.loans
  where copy_id = 'c3cccccc-cccc-cccc-cccc-cccccccccc01';

  if v_loan.status <> 'returned' or v_loan.returned_at is null then
    raise exception 'on-time ok checkin should return the loan with returned_at';
  end if;

  select * into v_copy from public.copies
  where id = 'c3cccccc-cccc-cccc-cccc-cccccccccc01';

  if v_copy.status <> 'available' then
    raise exception 'ok checkin should set copy available, got %', v_copy.status;
  end if;

  if exists (select 1 from public.fines where loan_id = v_loan.id) then
    raise exception 'on-time ok checkin should create no fine';
  end if;

  if (v_result->>'copy_status') <> 'available'
     or jsonb_array_length(v_result->'fines') <> 0 then
    raise exception 'checkin result payload mismatch for on-time ok: %', v_result;
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'loan.checkin'
      and entity_id = v_loan.id
      and detail->>'condition' = 'ok'
      and detail->>'barcode' = 'BK-CI-OK-ONTIME'
  ) then
    raise exception 'checkin should write a loan.checkin audit row';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Late ok return → fine equals the projection the view showed before check-in.
-- ---------------------------------------------------------------------------
do $$
declare
  v_projection numeric(10, 2);
  v_days integer;
  v_result jsonb;
  v_fine public.fines;
  v_loan_id uuid;
begin
  select l.id, o.projected_fine, o.days_late
  into v_loan_id, v_projection, v_days
  from public.loans l
  join public.overdue_loans o on o.loan_id = l.id
  where l.copy_id = 'c3cccccc-cccc-cccc-cccc-cccccccccc02';

  if v_projection is null then
    raise exception 'BK-CI-OK-LATE should have a view projection before checkin';
  end if;

  v_result := public.checkin('BK-CI-OK-LATE', 'ok');

  select * into v_fine from public.fines where loan_id = v_loan_id;

  if v_fine.reason <> 'overdue' then
    raise exception 'late ok checkin should create an overdue fine, got %', v_fine.reason;
  end if;

  if v_fine.amount <> v_projection then
    raise exception 'fine % should equal the pre-checkin projection %', v_fine.amount, v_projection;
  end if;

  if v_fine.amount <> v_days * 0.25 then
    raise exception 'fine should be days_late × rate (% × 0.25), got %', v_days, v_fine.amount;
  end if;

  if (v_fine.accrual_rule_snapshot->>'days_late')::integer <> v_days
     or (v_fine.accrual_rule_snapshot->>'fine_rate_per_day')::numeric <> 0.25 then
    raise exception 'overdue fine snapshot should record rate and days_late: %',
      v_fine.accrual_rule_snapshot;
  end if;

  if jsonb_array_length(v_result->'fines') <> 1
     or (v_result->'fines'->0->>'amount')::numeric <> v_projection then
    raise exception 'checkin result should carry the created fine: %', v_result;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Day boundary: due 23:59 yesterday local, returned now → exactly 1 day fine.
-- ---------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
  v_fine public.fines;
  v_loan_id uuid;
begin
  select id into v_loan_id from public.loans
  where copy_id = 'c3cccccc-cccc-cccc-cccc-cccccccccc03';

  v_result := public.checkin('BK-CI-BOUNDARY', 'ok');

  select * into v_fine from public.fines where loan_id = v_loan_id;

  if v_fine.amount <> 0.25 then
    raise exception 'boundary checkin fine should be exactly 1 day (0.25), got %', v_fine.amount;
  end if;

  if (v_result->>'days_late')::integer <> 1 then
    raise exception 'boundary checkin should report days_late 1, got %', v_result->>'days_late';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Same-day late (due 00:01 today): overdue but 0 calendar days → no fine.
-- ---------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
  v_loan_id uuid;
begin
  select id into v_loan_id from public.loans
  where copy_id = 'c3cccccc-cccc-cccc-cccc-cccccccccc04';

  v_result := public.checkin('BK-CI-SAMEDAY', 'ok');

  if exists (select 1 from public.fines where loan_id = v_loan_id) then
    raise exception 'same-day return owes nothing (0 calendar days late) — no fine expected';
  end if;

  if (v_result->>'days_late')::integer <> 0 then
    raise exception 'same-day checkin should report days_late 0, got %', v_result->>'days_late';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Late + damaged → overdue fine STACKS with the default damage fine.
-- ---------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
  v_loan_id uuid;
  v_overdue public.fines;
  v_damage public.fines;
  v_copy public.copies;
begin
  select id into v_loan_id from public.loans
  where copy_id = 'c3cccccc-cccc-cccc-cccc-cccccccccc05';

  v_result := public.checkin('BK-CI-DMG-LATE', 'damaged');

  if (select count(*) from public.fines where loan_id = v_loan_id) <> 2 then
    raise exception 'damaged late return should stack overdue + damage fines';
  end if;

  select * into v_overdue from public.fines
  where loan_id = v_loan_id and reason = 'overdue';
  select * into v_damage from public.fines
  where loan_id = v_loan_id and reason = 'damaged';

  if v_overdue.amount <> 0.50 then
    raise exception 'stacked overdue fine should be 2 × 0.25 = 0.50, got %', v_overdue.amount;
  end if;

  if v_damage.amount <> 10.00 then
    raise exception 'damage fine should default to damaged_fee_default 10.00, got %', v_damage.amount;
  end if;

  if (v_damage.accrual_rule_snapshot->>'overridden')::boolean then
    raise exception 'default damage charge should not be marked overridden';
  end if;

  select * into v_copy from public.copies
  where id = 'c3cccccc-cccc-cccc-cccc-cccccccccc05';

  if v_copy.status <> 'damaged' then
    raise exception 'damaged checkin should set copy damaged, got %', v_copy.status;
  end if;

  if jsonb_array_length(v_result->'fines') <> 2 then
    raise exception 'damaged late checkin result should list both fines: %', v_result;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Damaged with staff override → charged override, audited against the default.
-- ---------------------------------------------------------------------------
do $$
declare
  v_loan_id uuid;
  v_fine public.fines;
begin
  select id into v_loan_id from public.loans
  where copy_id = 'c3cccccc-cccc-cccc-cccc-cccccccccc06';

  perform public.checkin('BK-CI-DMG-OVER', 'damaged', 7.50);

  select * into v_fine from public.fines where loan_id = v_loan_id;

  if (select count(*) from public.fines where loan_id = v_loan_id) <> 1 then
    raise exception 'on-time damaged checkin should create exactly the damage fine';
  end if;

  if v_fine.reason <> 'damaged' or v_fine.amount <> 7.50 then
    raise exception 'override damage fine should be 7.50, got % %', v_fine.reason, v_fine.amount;
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'loan.checkin'
      and entity_id = v_loan_id
      and detail->>'condition' = 'damaged'
      and (detail->>'damaged_amount')::numeric = 7.50
      and (detail->>'damaged_fee_default')::numeric = 10.00
      and (detail->>'damaged_overridden')::boolean
  ) then
    raise exception 'damaged override should be audited with charged amount, default, and override flag';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Late + lost → replacement cost REPLACES the overdue fine (no stacking).
-- ---------------------------------------------------------------------------
do $$
declare
  v_loan_id uuid;
  v_fine public.fines;
  v_copy public.copies;
begin
  select id into v_loan_id from public.loans
  where copy_id = 'c3cccccc-cccc-cccc-cccc-cccccccccc07';

  perform public.checkin('BK-CI-LOST-PRICED', 'lost');

  if (select count(*) from public.fines where loan_id = v_loan_id) <> 1 then
    raise exception 'lost should replace the overdue fine — exactly one fine expected';
  end if;

  select * into v_fine from public.fines where loan_id = v_loan_id;

  if v_fine.reason <> 'lost' then
    raise exception 'lost checkin should create a lost fine, got %', v_fine.reason;
  end if;

  if v_fine.amount <> 40.00 then
    raise exception 'lost fine should be the title replacement_cost 40.00, got %', v_fine.amount;
  end if;

  if v_fine.accrual_rule_snapshot->>'basis' <> 'replacement_cost' then
    raise exception 'lost fine snapshot should record replacement_cost basis: %',
      v_fine.accrual_rule_snapshot;
  end if;

  select * into v_copy from public.copies
  where id = 'c3cccccc-cccc-cccc-cccc-cccccccccc07';

  if v_copy.status <> 'lost' then
    raise exception 'lost checkin should set copy lost, got %', v_copy.status;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Lost without a title price → lost_fee_default fallback.
-- ---------------------------------------------------------------------------
do $$
declare
  v_loan_id uuid;
  v_fine public.fines;
begin
  select id into v_loan_id from public.loans
  where copy_id = 'c3cccccc-cccc-cccc-cccc-cccccccccc08';

  perform public.checkin('BK-CI-LOST-DEFAULT', 'lost');

  select * into v_fine from public.fines where loan_id = v_loan_id;

  if v_fine.amount <> 25.00 then
    raise exception 'lost fallback should be lost_fee_default 25.00, got %', v_fine.amount;
  end if;

  if v_fine.accrual_rule_snapshot->>'basis' <> 'lost_fee_default' then
    raise exception 'fallback lost fine should record lost_fee_default basis: %',
      v_fine.accrual_rule_snapshot;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Typed errors.
-- ---------------------------------------------------------------------------
create function pg_temp.expect_checkin_error(
  p_barcode text,
  p_condition text,
  p_amount numeric,
  p_code text
) returns void
language plpgsql
as $$
declare
  raised boolean := false;
begin
  begin
    perform public.checkin(p_barcode, p_condition, p_amount);
  exception
    when others then
      if sqlerrm like p_code || '%' then
        raised := true;
      else
        raise exception 'expected %, got %', p_code, sqlerrm;
      end if;
  end;
  if not raised then
    raise exception 'expected % from checkin', p_code;
  end if;
end;
$$;

select pg_temp.expect_checkin_error('BK-DOES-NOT-EXIST', 'ok', null, 'copy_not_found');
select pg_temp.expect_checkin_error('BK-CI-AVAIL', 'ok', null, 'loan_not_found');
select pg_temp.expect_checkin_error('BK-CI-VIEW-FUTURE', 'wrecked', null, 'invalid_condition');
select pg_temp.expect_checkin_error('BK-CI-VIEW-FUTURE', 'ok', 5.00, 'damaged_amount_unexpected');
select pg_temp.expect_checkin_error('BK-CI-VIEW-FUTURE', 'damaged', -1.00, 'invalid_damaged_amount');

rollback;
