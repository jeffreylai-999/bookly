-- Verifies checkout RPC gates, audit, due dates, and that direct loan inserts
-- are rejected for authenticated. Run after `pnpm supabase:start` (or db reset):
--   pnpm test:sql:checkout

begin;

-- Fake auth user (staff).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'c1111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'checkout-staff@bookly.local',
  crypt('test-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, full_name, email, role)
values (
  'c1111111-1111-1111-1111-111111111111',
  'Checkout Staff',
  'checkout-staff@bookly.local',
  'staff'
);

-- Adult type already seeded (borrow_cap 10, loan_period_days 21).
-- Student type: borrow_cap 5 — use a tiny-cap type for over-cap test.
insert into public.member_types (
  id, name, loan_period_days, renewal_limit, borrow_cap, fine_rate_per_day, hold_expiry_days
) values (
  'c0ffffff-ffff-ffff-ffff-ffffffffffff',
  'Tiny Cap',
  7,
  0,
  1,
  1.00,
  3
);

insert into public.members (
  id, name, member_type_id, status, card_barcode
) values
  (
    'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'Active Member',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-CHECKOUT-1'
  ),
  (
    'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'Suspended Member',
    '11111111-1111-1111-1111-111111111101',
    'suspended',
    'MBR-CHECKOUT-2'
  ),
  (
    'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'Blocked Member',
    '11111111-1111-1111-1111-111111111101',
    'blocked',
    'MBR-CHECKOUT-3'
  ),
  (
    'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    'Cap Member',
    'c0ffffff-ffff-ffff-ffff-ffffffffffff',
    'active',
    'MBR-CHECKOUT-4'
  ),
  (
    'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
    'Fine Member',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-CHECKOUT-5'
  );

insert into public.titles (id, title, author, genre)
values (
  'c0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Checkout Title',
  'Desk Author',
  'Fiction'
);

-- Service role can set any copy status for fixtures.
set local role service_role;

insert into public.copies (id, title_id, barcode, status)
values
  ('c0cccccc-cccc-cccc-cccc-cccccccccc01', 'c0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BK-CHK-AVAIL-1', 'available'),
  ('c0cccccc-cccc-cccc-cccc-cccccccccc02', 'c0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BK-CHK-AVAIL-2', 'available'),
  ('c0cccccc-cccc-cccc-cccc-cccccccccc03', 'c0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BK-CHK-ONLOAN', 'on_loan'),
  ('c0cccccc-cccc-cccc-cccc-cccccccccc04', 'c0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BK-CHK-HOLD', 'on_hold_shelf'),
  ('c0cccccc-cccc-cccc-cccc-cccccccccc05', 'c0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BK-CHK-LOST', 'lost'),
  ('c0cccccc-cccc-cccc-cccc-cccccccccc06', 'c0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BK-CHK-DMG', 'damaged'),
  ('c0cccccc-cccc-cccc-cccc-cccccccccc07', 'c0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BK-CHK-RET', 'retired'),
  ('c0cccccc-cccc-cccc-cccc-cccccccccc08', 'c0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BK-CHK-CAP-1', 'available'),
  ('c0cccccc-cccc-cccc-cccc-cccccccccc09', 'c0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BK-CHK-CAP-2', 'available'),
  ('c0cccccc-cccc-cccc-cccc-cccccccccc10', 'c0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BK-CHK-FINE', 'available');

-- Seed an outstanding fine above the default block threshold for Fine Member.
insert into public.fines (id, member_id, amount, amount_paid, reason, status)
values (
  'c0dddddd-dddd-dddd-dddd-ddddddddddd1',
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
  50.00,
  0,
  'overdue',
  'outstanding'
);

-- Act as staff.
set local role authenticated;
set local request.jwt.claim.sub = 'c1111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Direct INSERT into loans must be rejected.
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.loans (copy_id, member_id, checked_out_by, due_at)
    values (
      'c0cccccc-cccc-cccc-cccc-cccccccccc01',
      'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      'c1111111-1111-1111-1111-111111111111',
      now() + interval '21 days'
    );
  exception
    when insufficient_privilege then
      raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege on direct loan insert';
  end if;
end $$;

-- Happy path: available copy → loan + on_loan + due_at + audit.
do $$
declare
  v_loan public.loans;
  v_copy public.copies;
  v_due_floor timestamptz := now() + interval '20 days';
  v_due_ceil timestamptz := now() + interval '22 days';
begin
  select * into v_loan
  from public.checkout(
    'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    array['BK-CHK-AVAIL-1']::text[]
  );

  if v_loan.status <> 'active' then
    raise exception 'expected active loan, got %', v_loan.status;
  end if;
  if v_loan.copy_id <> 'c0cccccc-cccc-cccc-cccc-cccccccccc01' then
    raise exception 'loan copy_id mismatch';
  end if;
  if v_loan.member_id <> 'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1' then
    raise exception 'loan member_id mismatch';
  end if;
  if v_loan.due_at < v_due_floor or v_loan.due_at > v_due_ceil then
    raise exception 'due_at % not ~ now + 21 days (Adult)', v_loan.due_at;
  end if;

  select * into v_copy
  from public.copies
  where id = 'c0cccccc-cccc-cccc-cccc-cccccccccc01';

  if v_copy.status <> 'on_loan' then
    raise exception 'expected copy on_loan, got %', v_copy.status;
  end if;

  if not exists (
    select 1 from public.audit_log
    where actor = 'c1111111-1111-1111-1111-111111111111'
      and action = 'loan.checkout'
      and entity_type = 'loan'
      and entity_id = v_loan.id
      and detail->>'member_id' = 'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
      and detail->'barcodes' ? 'BK-CHK-AVAIL-1'
      and detail->'copy_ids' ? 'c0cccccc-cccc-cccc-cccc-cccccccccc01'
  ) then
    raise exception 'checkout should write loan.checkout audit row with copy arrays';
  end if;

  if (
    select count(*) from public.audit_log
    where action = 'loan.checkout'
      and detail->>'member_id' = 'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
  ) <> 1 then
    raise exception 'checkout should write exactly one audit row per call';
  end if;
end $$;

-- Multi-copy checkout: one audit row listing both barcodes.
do $$
declare
  v_count integer;
begin
  perform public.checkout(
    'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    array['BK-CHK-AVAIL-2', 'BK-CHK-FINE']::text[]
  );

  select count(*) into v_count
  from public.audit_log
  where action = 'loan.checkout'
    and detail->'barcodes' ? 'BK-CHK-AVAIL-2'
    and detail->'barcodes' ? 'BK-CHK-FINE';

  if v_count <> 1 then
    raise exception 'multi-copy checkout should write one audit row with both barcodes';
  end if;
end $$;

-- Helper: expect a typed exception code from checkout (session-local).
create function pg_temp.expect_checkout_error(
  p_member uuid,
  p_barcodes text[],
  p_code text
) returns void
language plpgsql
as $$
declare
  raised boolean := false;
begin
  begin
    perform public.checkout(p_member, p_barcodes);
  exception
    when others then
      if sqlerrm like p_code || '%' then
        raised := true;
      else
        raise exception 'expected %, got %', p_code, sqlerrm;
      end if;
  end;
  if not raised then
    raise exception 'expected % from checkout', p_code;
  end if;
end;
$$;

select pg_temp.expect_checkout_error(
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  array['BK-CHK-AVAIL-2']::text[],
  'member_suspended'
);

select pg_temp.expect_checkout_error(
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  array['BK-CHK-AVAIL-2']::text[],
  'member_blocked'
);

select pg_temp.expect_checkout_error(
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
  array['BK-CHK-FINE']::text[],
  'member_fine_blocked'
);

-- Cap member: first checkout fills borrow_cap=1; second must fail.
do $$
declare
  v_loan public.loans;
begin
  select * into v_loan
  from public.checkout(
    'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    array['BK-CHK-CAP-1']::text[]
  );
  if v_loan.id is null then
    raise exception 'cap member first checkout should succeed';
  end if;
end $$;

select pg_temp.expect_checkout_error(
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
  array['BK-CHK-CAP-2']::text[],
  'member_borrow_cap'
);

-- Copy status matrix.
select pg_temp.expect_checkout_error(
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  array['BK-CHK-ONLOAN']::text[],
  'copy_on_loan'
);
select pg_temp.expect_checkout_error(
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  array['BK-CHK-HOLD']::text[],
  'copy_on_hold_shelf'
);
select pg_temp.expect_checkout_error(
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  array['BK-CHK-LOST']::text[],
  'copy_lost'
);
select pg_temp.expect_checkout_error(
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  array['BK-CHK-DMG']::text[],
  'copy_damaged'
);
select pg_temp.expect_checkout_error(
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  array['BK-CHK-RET']::text[],
  'copy_retired'
);
select pg_temp.expect_checkout_error(
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  array['BK-DOES-NOT-EXIST']::text[],
  'copy_not_found'
);

-- Duplicates must raise duplicate_barcode, not preempt as member_borrow_cap.
-- Fixture: cap=1, zero active loans, two identical barcodes → distinct count is 1.
set local role service_role;
insert into public.members (id, name, member_type_id, status, card_barcode)
values (
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  'Dup Cap Member',
  'c0ffffff-ffff-ffff-ffff-ffffffffffff',
  'active',
  'MBR-CHECKOUT-6'
);
set local role authenticated;
set local request.jwt.claim.sub = 'c1111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.expect_checkout_error(
  'c0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  array['BK-CHK-CAP-2', 'BK-CHK-CAP-2']::text[],
  'duplicate_barcode'
);

rollback;
