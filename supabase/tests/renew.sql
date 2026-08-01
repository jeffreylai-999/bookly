-- Verifies the renew_loan RPC: each of the five gates rejects with its own
-- typed code (renewal limit, waiting holds, suspended/blocked member, fine
-- block-threshold, already-overdue fine-eraser hole), and a successful renew
-- restarts the due date from the renewal moment, increments renew_count, and
-- audits. Run after `pnpm supabase:start`:
--   pnpm test:sql:renew

begin;

-- Fake auth user (staff).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'c4444444-4444-4444-4444-444444444444',
  'authenticated', 'authenticated', 'renew-staff@bookly.local',
  crypt('test-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, full_name, email, role)
values (
  'c4444444-4444-4444-4444-444444444444',
  'Renew Staff',
  'renew-staff@bookly.local',
  'staff'
);

-- Adult type (seeded): loan_period_days 21, renewal_limit 2, fine_rate 0.25.
-- No-Renew type: renewal_limit 0, so every renew hits the limit gate.
insert into public.member_types (
  id, name, loan_period_days, renewal_limit, borrow_cap, fine_rate_per_day, hold_expiry_days
) values (
  'c4ffffff-ffff-ffff-ffff-ffffffffffff',
  'No Renew',
  14,
  0,
  5,
  0.25,
  3
);

insert into public.members (id, name, member_type_id, status, card_barcode)
values
  (
    'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'Renew Member',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-RENEW-1'
  ),
  (
    'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'Limit Member',
    'c4ffffff-ffff-ffff-ffff-ffffffffffff',
    'active',
    'MBR-RENEW-2'
  ),
  (
    'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'Suspended Member',
    '11111111-1111-1111-1111-111111111101',
    'suspended',
    'MBR-RENEW-3'
  ),
  (
    'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    'Blocked Member',
    '11111111-1111-1111-1111-111111111101',
    'blocked',
    'MBR-RENEW-4'
  ),
  (
    'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
    'Fined Member',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-RENEW-5'
  ),
  (
    'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
    'Hold Watcher',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-RENEW-6'
  );

insert into public.titles (id, title, author, genre)
values
  ('c4bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'Renewable Title', 'Desk Author', 'Fiction'),
  ('c4bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'Wanted Title', 'Desk Author', 'Fiction');

-- Fixtures as service role: loans/holds/fines cannot be inserted as authenticated.
set local role service_role;

insert into public.copies (id, title_id, barcode, status)
values
  -- Active loans; all but BK-RN-OVERDUE due in the future.
  ('c4cccccc-cccc-cccc-cccc-cccccccccc01', 'c4bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-RN-OK', 'on_loan'),
  ('c4cccccc-cccc-cccc-cccc-cccccccccc03', 'c4bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-RN-LIMIT', 'on_loan'),
  ('c4cccccc-cccc-cccc-cccc-cccccccccc04', 'c4bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'BK-RN-HOLD', 'on_loan'),
  ('c4cccccc-cccc-cccc-cccc-cccccccccc05', 'c4bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-RN-SUSP', 'on_loan'),
  ('c4cccccc-cccc-cccc-cccc-cccccccccc06', 'c4bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-RN-BLOCKED', 'on_loan'),
  ('c4cccccc-cccc-cccc-cccc-cccccccccc07', 'c4bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-RN-FINED', 'on_loan'),
  ('c4cccccc-cccc-cccc-cccc-cccccccccc08', 'c4bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-RN-OVERDUE', 'on_loan'),
  -- Returned loan (loan_not_found on renew).
  ('c4cccccc-cccc-cccc-cccc-cccccccccc09', 'c4bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-RN-RETURNED', 'available');

insert into public.loans (copy_id, member_id, checked_out_by, checked_out_at, due_at, status, returned_at, renew_count)
select
  copies.id,
  (case copies.barcode
    when 'BK-RN-SUSP' then 'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'
    when 'BK-RN-BLOCKED' then 'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'
    when 'BK-RN-FINED' then 'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5'
    when 'BK-RN-LIMIT' then 'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'
    else 'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
  end)::uuid,
  'c4444444-4444-4444-4444-444444444444',
  now() - interval '7 days',
  case copies.barcode
    when 'BK-RN-OVERDUE' then now() - interval '1 day'
    else now() + interval '5 days'
  end,
  (case when copies.barcode = 'BK-RN-RETURNED' then 'returned' else 'active' end)::public.loan_status,
  case when copies.barcode = 'BK-RN-RETURNED' then now() - interval '2 days' end,
  0
from public.copies
where copies.barcode like 'BK-RN-%';

-- Gate 2 fixture: a waiting hold on Wanted Title (BK-RN-HOLD's title).
insert into public.holds (title_id, member_id, queue_position, status)
values (
  'c4bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
  'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  1,
  'waiting'
);

-- Gate 4 fixture: outstanding balance 12.50 ≥ fine_block_threshold 10.00.
insert into public.fines (member_id, amount, amount_paid, reason, status)
values (
  'c4aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
  12.50,
  0,
  'overdue',
  'outstanding'
);

-- Act as staff.
set local role authenticated;
set local request.jwt.claim.sub = 'c4444444-4444-4444-4444-444444444444';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c4444444-4444-4444-4444-444444444444","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Typed errors: helper + the five gates.
-- ---------------------------------------------------------------------------
create function pg_temp.expect_renew_error(
  p_barcode text,
  p_code text
) returns void
language plpgsql
as $$
declare
  v_loan_id uuid;
  raised boolean := false;
begin
  select l.id into v_loan_id
  from public.loans l
  join public.copies c on c.id = l.copy_id
  where c.barcode = p_barcode;

  begin
    perform public.renew_loan(v_loan_id);
  exception
    when others then
      if sqlerrm like p_code || '%' then
        raised := true;
      else
        raise exception 'expected %, got %', p_code, sqlerrm;
      end if;
  end;
  if not raised then
    raise exception 'expected % from renew_loan on %', p_code, p_barcode;
  end if;
end;
$$;

-- Unknown loan id.
do $$
declare
  raised boolean := false;
begin
  begin
    perform public.renew_loan('c4dddddd-dddd-dddd-dddd-dddddddddddd');
  exception
    when others then
      if sqlerrm like 'loan_not_found%' then
        raised := true;
      else
        raise exception 'expected loan_not_found, got %', sqlerrm;
      end if;
  end;
  if not raised then
    raise exception 'expected loan_not_found for an unknown loan id';
  end if;
end $$;

-- Already-returned loan.
select pg_temp.expect_renew_error('BK-RN-RETURNED', 'loan_not_found');

-- Gate 1: renewal limit (No Renew type has renewal_limit 0).
select pg_temp.expect_renew_error('BK-RN-LIMIT', 'renewal_limit_reached');

-- Gate 2: the title has a waiting hold.
select pg_temp.expect_renew_error('BK-RN-HOLD', 'title_has_waiting_holds');

-- Gate 3: member suspended / blocked.
select pg_temp.expect_renew_error('BK-RN-SUSP', 'member_suspended');
select pg_temp.expect_renew_error('BK-RN-BLOCKED', 'member_blocked');

-- Gate 4: outstanding fines at/over the block threshold.
select pg_temp.expect_renew_error('BK-RN-FINED', 'member_fine_blocked');

-- Gate 5 (the fine-eraser hole): an overdue loan must be checked in, not
-- renewed — renewing would reset due_at and erase the accruing overdue fine.
select pg_temp.expect_renew_error('BK-RN-OVERDUE', 'loan_overdue');

-- A rejected renew changes nothing: due dates and renew counts stand, no audit.
do $$
declare
  v_loan public.loans;
begin
  select l.* into v_loan
  from public.loans l
  join public.copies c on c.id = l.copy_id
  where c.barcode = 'BK-RN-OVERDUE';

  if v_loan.due_at >= now() or v_loan.renew_count <> 0 then
    raise exception 'rejected overdue renew must leave due_at and renew_count untouched: %',
      v_loan;
  end if;

  select l.* into v_loan
  from public.loans l
  join public.copies c on c.id = l.copy_id
  where c.barcode = 'BK-RN-LIMIT';

  if v_loan.renew_count <> 0 then
    raise exception 'rejected limit renew must leave renew_count untouched: %', v_loan;
  end if;

  if exists (select 1 from public.audit_log where action = 'loan.renew') then
    raise exception 'a rejected renew must not write an audit row';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Successful renew: due date runs from the renewal moment (not stacked on the
-- old due date), renew_count increments, audit row written.
-- ---------------------------------------------------------------------------
do $$
declare
  v_loan_id uuid;
  v_before public.loans;
  v_after public.loans;
  v_returned public.loans;
begin
  select l.* into v_before
  from public.loans l
  join public.copies c on c.id = l.copy_id
  where c.barcode = 'BK-RN-OK';

  v_loan_id := v_before.id;
  v_returned := public.renew_loan(v_loan_id);

  select * into v_after from public.loans where id = v_loan_id;

  if v_after.renew_count <> v_before.renew_count + 1 then
    raise exception 'renew should increment renew_count (% → %), got %',
      v_before.renew_count, v_before.renew_count + 1, v_after.renew_count;
  end if;

  -- New due date ≈ now + 21 days (Adult loan_period_days). The old due date was
  -- now + 5 days, so stacking would land at ≈ now + 26 days — the upper bound
  -- below proves the renewal runs from the renewal moment, not the old due date.
  if v_after.due_at < now() + interval '20 days'
     or v_after.due_at > now() + interval '22 days' then
    raise exception 'renew should set due_at ≈ now + loan_period_days, got % (old due %)',
      v_after.due_at, v_before.due_at;
  end if;

  if v_after.status <> 'active' or v_after.returned_at is not null then
    raise exception 'renew must keep the loan active';
  end if;

  -- The RPC returns the updated row.
  if v_returned.id <> v_loan_id
     or v_returned.due_at <> v_after.due_at
     or v_returned.renew_count <> v_after.renew_count then
    raise exception 'renew_loan should return the updated loan row';
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'loan.renew'
      and entity_type = 'loan'
      and entity_id = v_loan_id
      and actor = 'c4444444-4444-4444-4444-444444444444'
      and detail->>'barcode' = 'BK-RN-OK'
      and (detail->>'previous_due_at')::timestamptz = v_before.due_at
      and (detail->>'due_at')::timestamptz = v_after.due_at
      and (detail->>'renew_count')::integer = 1
  ) then
    raise exception 'renew should write a loan.renew audit row with before/after due dates';
  end if;
end $$;

-- Second renew on the same loan reaches the Adult limit (2); the third rejects.
do $$
declare
  v_loan_id uuid;
  v_after public.loans;
  raised boolean := false;
begin
  select l.id into v_loan_id
  from public.loans l
  join public.copies c on c.id = l.copy_id
  where c.barcode = 'BK-RN-OK';

  perform public.renew_loan(v_loan_id);

  select * into v_after from public.loans where id = v_loan_id;

  if v_after.renew_count <> 2 then
    raise exception 'second renew should take renew_count to 2, got %', v_after.renew_count;
  end if;

  begin
    perform public.renew_loan(v_loan_id);
  exception
    when others then
      if sqlerrm like 'renewal_limit_reached%' then
        raised := true;
      else
        raise exception 'expected renewal_limit_reached, got %', sqlerrm;
      end if;
  end;
  if not raised then
    raise exception 'renew at the limit should be rejected';
  end if;
end $$;

rollback;
