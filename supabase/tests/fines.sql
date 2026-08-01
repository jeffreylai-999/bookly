-- Verifies the fines desk slice: record_payment (partial → paid, overpay
-- guard, notification + audit), waive_fine (admin, remaining balance only),
-- void_payment (admin, fine recomputed from non-voided payments), the checkout
-- fine gate closing/opening on payment, and that direct writes to fines and
-- payments are rejected for authenticated. Run after `pnpm supabase:start`:
--   pnpm test:sql:fines

begin;

-- Staff + admin fake auth users.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'e1111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated', 'fines-staff@bookly.local',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e2222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated', 'fines-admin@bookly.local',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.profiles (id, full_name, email, role)
values
  ('e1111111-1111-1111-1111-111111111111', 'Fines Staff', 'fines-staff@bookly.local', 'staff'),
  ('e2222222-2222-2222-2222-222222222222', 'Fines Admin', 'fines-admin@bookly.local', 'admin');

-- Adult type (seeded): fine_rate_per_day 0.25, loan_period_days 21.
insert into public.members (id, name, member_type_id, status, card_barcode)
values
  (
    'e3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'Fine Member One',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-FINE-1'
  ),
  (
    'e3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'Fine Member Two',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-FINE-2'
  );

insert into public.titles (id, title, author, genre)
values (
  'e3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'Fine Gate Title',
  'Desk Author',
  'Fiction'
);

-- Fixtures as service role: copies status, fines, and payments cannot be
-- written as authenticated.
set local role service_role;

insert into public.copies (id, title_id, barcode, status)
values (
  'e3cccccc-cccc-cccc-cccc-cccccccccc01',
  'e3bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'BK-FINE-GATE-1',
  'available'
);

insert into public.fines (id, member_id, amount, reason)
values
  -- payment lifecycle (partial → paid)
  ('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'e3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 10.00, 'overdue'),
  -- waive after a partial payment
  ('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'e3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 5.00, 'damaged'),
  -- void recompute
  ('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'e3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 8.00, 'overdue'),
  -- checkout gate: 12.00 ≥ 10.00 threshold
  ('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'e3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 12.00, 'lost'),
  -- waive-then-void ordering guard
  ('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'e3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 6.00, 'overdue');

-- ---------------------------------------------------------------------------
-- Unauthenticated calls must be rejected by every RPC.
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  begin
    perform public.record_payment('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1.00, 'cash');
    raise exception 'expected not_authenticated from record_payment';
  exception when others then
    if sqlerrm not like 'not_authenticated%' then raise; end if;
  end;
  begin
    perform public.waive_fine('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'x');
    raise exception 'expected not_authenticated from waive_fine';
  exception when others then
    if sqlerrm not like 'not_authenticated%' then raise; end if;
  end;
  begin
    perform public.void_payment('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'x');
    raise exception 'expected not_authenticated from void_payment';
  exception when others then
    if sqlerrm not like 'not_authenticated%' then raise; end if;
  end;
end $$;

-- Act as staff.
set local role authenticated;
set local request.jwt.claim.sub = 'e1111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Direct writes to fines AND payments are rejected — RPCs are the only path.
-- ---------------------------------------------------------------------------
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.fines (member_id, amount, reason)
    values ('e3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1.00, 'overdue');
  exception
    when insufficient_privilege then raised := true;
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
    update public.fines set amount_paid = 0 where false;
  exception
    when insufficient_privilege then raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege on direct fines update';
  end if;
end $$;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.payments (fine_id, amount, method)
    values ('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1.00, 'cash');
  exception
    when insufficient_privilege then raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege on direct payments insert';
  end if;
end $$;

do $$
declare
  raised boolean := false;
begin
  begin
    update public.payments set amount = 0 where false;
  exception
    when insufficient_privilege then raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege on direct payments update';
  end if;
end $$;

do $$
declare
  raised boolean := false;
begin
  begin
    delete from public.payments where false;
  exception
    when insufficient_privilege then raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege on direct payments delete';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- record_payment validation.
-- ---------------------------------------------------------------------------
create function pg_temp.expect_payment_error(
  p_fine_id uuid,
  p_amount numeric,
  p_method text,
  p_code text
) returns void
language plpgsql
as $$
begin
  begin
    perform public.record_payment(p_fine_id, p_amount, p_method);
    raise exception 'expected % from record_payment', p_code;
  exception when others then
    if sqlerrm not like p_code || '%' then
      raise;
    end if;
  end;
end;
$$;

select pg_temp.expect_payment_error('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 0, 'cash', 'invalid_payment_amount');
select pg_temp.expect_payment_error('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', -1.00, 'cash', 'invalid_payment_amount');
select pg_temp.expect_payment_error('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', null, 'cash', 'invalid_payment_amount');
select pg_temp.expect_payment_error('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1.00, null, 'payment_method_required');
select pg_temp.expect_payment_error('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1.00, '  ', 'payment_method_required');
select pg_temp.expect_payment_error('e3faaaaa-0000-0000-0000-000000000000', 1.00, 'cash', 'fine_not_found');

-- ---------------------------------------------------------------------------
-- Partial payment → partial; completing payment → paid. Overpay rejected.
-- Notification + audit written per payment.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fine public.fines;
  v_result jsonb;
  v_payment_id uuid;
  v_notifications integer;
  v_audits integer;
begin
  v_result := public.record_payment('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 4.00, 'cash');
  v_payment_id := (v_result->'payment'->>'id')::uuid;

  select * into v_fine from public.fines
  where id = 'e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';

  if v_fine.amount_paid <> 4.00 or v_fine.status <> 'partial' then
    raise exception 'partial payment should give amount_paid 4.00 / partial, got % / %',
      v_fine.amount_paid, v_fine.status;
  end if;

  select count(*) into v_notifications from public.notifications
  where type = 'payment_recorded' and entity_id = v_payment_id;
  if v_notifications <> 1 then
    raise exception 'expected one payment_recorded notification, got %', v_notifications;
  end if;

  select count(*) into v_audits from public.audit_log
  where action = 'fine.payment' and entity_id = v_fine.id;
  if v_audits <> 1 then
    raise exception 'expected one fine.payment audit row, got %', v_audits;
  end if;

  -- 7.00 would overpay the 6.00 remaining balance.
  perform pg_temp.expect_payment_error(
    'e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 7.00, 'cash', 'payment_exceeds_balance'
  );

  perform public.record_payment('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 6.00, 'card');

  select * into v_fine from public.fines
  where id = 'e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';

  if v_fine.amount_paid <> 10.00 or v_fine.status <> 'paid' then
    raise exception 'completing payment should give amount_paid 10.00 / paid, got % / %',
      v_fine.amount_paid, v_fine.status;
  end if;
end $$;

-- A settled fine takes no more money.
select pg_temp.expect_payment_error('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1.00, 'cash', 'fine_already_paid');

-- ---------------------------------------------------------------------------
-- Waive: staff rejected; reason required; after a partial payment only the
-- remainder is forgiven — amount_paid untouched.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.waive_fine('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'staff attempt');
    raise exception 'expected admin_required from waive_fine';
  exception when others then
    if sqlerrm not like 'admin_required%' then raise; end if;
  end;
end $$;

-- Partially pay fine 2 first (staff), so the waive has a remainder to forgive.
select public.record_payment('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 2.00, 'cash');

-- Switch to admin.
set local request.jwt.claim.sub = 'e2222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"e2222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
begin
  begin
    perform public.waive_fine('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', null);
    raise exception 'expected waive_reason_required';
  exception when others then
    if sqlerrm not like 'waive_reason_required%' then raise; end if;
  end;
  begin
    perform public.waive_fine('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '   ');
    raise exception 'expected waive_reason_required';
  exception when others then
    if sqlerrm not like 'waive_reason_required%' then raise; end if;
  end;
end $$;

do $$
declare
  v_fine public.fines;
  v_detail jsonb;
begin
  v_fine := public.waive_fine('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'damaged in transit, goodwill');

  if v_fine.status <> 'waived' then
    raise exception 'waive should set status waived, got %', v_fine.status;
  end if;

  -- Prior payment stands: amount_paid is NOT zeroed by the waive.
  if v_fine.amount_paid <> 2.00 then
    raise exception 'waive must leave amount_paid untouched, expected 2.00, got %',
      v_fine.amount_paid;
  end if;

  select detail into v_detail from public.audit_log
  where action = 'fine.waive' and entity_id = v_fine.id;

  if (v_detail->>'forgiven')::numeric <> 3.00 then
    raise exception 'audit should record forgiven 3.00 (remainder only), got %', v_detail;
  end if;
end $$;

do $$
begin
  begin
    perform public.waive_fine('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'again');
    raise exception 'expected fine_already_waived';
  exception when others then
    if sqlerrm not like 'fine_already_waived%' then raise; end if;
  end;
  begin
    perform public.waive_fine('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'paid fine');
    raise exception 'expected fine_already_paid';
  exception when others then
    if sqlerrm not like 'fine_already_paid%' then raise; end if;
  end;
end $$;

-- No money can be taken on a waived fine.
select pg_temp.expect_payment_error('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 1.00, 'cash', 'fine_waived');

-- ---------------------------------------------------------------------------
-- Void: staff rejected; reason required; fine recomputed from non-voided
-- payments (paid → partial → outstanding as payments are voided away).
-- ---------------------------------------------------------------------------
-- Back to staff to record the payments being voided.
set local request.jwt.claim.sub = 'e1111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_first uuid;
  v_second uuid;
begin
  v_first := (public.record_payment('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 5.00, 'cash')->'payment'->>'id')::uuid;
  v_second := (public.record_payment('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 3.00, 'cash')->'payment'->>'id')::uuid;

  -- Stash ids in a temp table for the following blocks.
  create temporary table void_fixture (first uuid, second uuid) on commit drop;
  insert into void_fixture values (v_first, v_second);
end $$;

do $$
declare
  v_first uuid := (select first from void_fixture);
begin
  begin
    perform public.void_payment(v_first, 'staff attempt');
    raise exception 'expected admin_required from void_payment';
  exception when others then
    if sqlerrm not like 'admin_required%' then raise; end if;
  end;
end $$;

-- Admin again.
set local request.jwt.claim.sub = 'e2222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"e2222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_first uuid := (select first from void_fixture);
begin
  begin
    perform public.void_payment(v_first, null);
    raise exception 'expected void_reason_required';
  exception when others then
    if sqlerrm not like 'void_reason_required%' then raise; end if;
  end;
  begin
    perform public.void_payment('e3faaaaa-0000-0000-0000-000000000000', 'x');
    raise exception 'expected payment_not_found';
  exception when others then
    if sqlerrm not like 'payment_not_found%' then raise; end if;
  end;
end $$;

do $$
declare
  v_first uuid := (select first from void_fixture);
  v_second uuid := (select second from void_fixture);
  v_payment public.payments;
  v_fine public.fines;
begin
  perform public.void_payment(v_first, 'entered wrong amount');

  select * into v_payment from public.payments where id = v_first;
  if v_payment.voided_by is null or v_payment.void_reason is null or v_payment.voided_at is null then
    raise exception 'voided payment should carry voided_by/reason/at: %', v_payment;
  end if;

  -- Fine was paid (8.00 = 5 + 3); voiding the 5 leaves 3 → partial.
  select * into v_fine from public.fines
  where id = 'e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
  if v_fine.amount_paid <> 3.00 or v_fine.status <> 'partial' then
    raise exception 'void should recompute to amount_paid 3.00 / partial, got % / %',
      v_fine.amount_paid, v_fine.status;
  end if;

  begin
    perform public.void_payment(v_first, 'twice');
    raise exception 'expected payment_already_voided';
  exception when others then
    if sqlerrm not like 'payment_already_voided%' then raise; end if;
  end;

  -- Voiding the last payment empties the fine back to outstanding.
  perform public.void_payment(v_second, 'duplicate entry');

  select * into v_fine from public.fines
  where id = 'e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
  if v_fine.amount_paid <> 0 or v_fine.status <> 'outstanding' then
    raise exception 'voiding all payments should give amount_paid 0 / outstanding, got % / %',
      v_fine.amount_paid, v_fine.status;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Waive-then-void ordering: voiding against a waived fine is rejected.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = 'e1111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_payment uuid;
begin
  v_payment := (public.record_payment('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 2.00, 'cash')->'payment'->>'id')::uuid;
  insert into void_fixture values (v_payment, null);
end $$;

set local request.jwt.claim.sub = 'e2222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"e2222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_payment uuid := (select first from void_fixture where second is null);
begin
  perform public.waive_fine('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'waive first');

  begin
    perform public.void_payment(v_payment, 'too late');
    raise exception 'expected fine_waived from void_payment';
  exception when others then
    if sqlerrm not like 'fine_waived%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Checkout gate: 12.00 outstanding ≥ 10.00 threshold blocks; paying down to
-- 9.00 re-enables checkout.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = 'e1111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_loans integer;
begin
  begin
    perform public.checkout(
      'e3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
      array['BK-FINE-GATE-1']
    );
    raise exception 'expected member_fine_blocked from checkout';
  exception when others then
    if sqlerrm not like 'member_fine_blocked%' then raise; end if;
  end;

  perform public.record_payment('e3faaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 3.00, 'cash');

  perform public.checkout(
    'e3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    array['BK-FINE-GATE-1']
  );

  select count(*) into v_loans from public.loans
  where member_id = 'e3aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'
    and status = 'active';

  if v_loans <> 1 then
    raise exception 'paying below the threshold should re-enable checkout, active loans: %',
      v_loans;
  end if;
end $$;

rollback;
