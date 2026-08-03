-- Verifies the Settings slice guards: staff cannot write member_types or
-- app_settings (RLS/grants), admins can, the app_settings singleton stays
-- single, a member-type rule change applies to the next checkout, the
-- hold_ready notification toggle gates mark_ready, and log_audit accepts the
-- settings codes while still rejecting flow codes.
--
-- Run: `pnpm test:sql:settings` (after `pnpm supabase:start`).

begin;

-- ---------------------------------------------------------------------------
-- Fixtures: staff + admin users, a member of the seeded Adult type, a title
-- with three available copies, and two waiting holds (one per member).
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'dddddddd-dddd-dddd-dddd-dddddddd0001',
    'authenticated', 'authenticated', 'staff-settings-test@bookly.local',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'dddddddd-dddd-dddd-dddd-dddddddd0002',
    'authenticated', 'authenticated', 'admin-settings-test@bookly.local',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.profiles (id, full_name, email, role)
values
  ('dddddddd-dddd-dddd-dddd-dddddddd0001', 'Staff Settings Test', 'staff-settings-test@bookly.local', 'staff'),
  ('dddddddd-dddd-dddd-dddd-dddddddd0002', 'Admin Settings Test', 'admin-settings-test@bookly.local', 'admin');

insert into public.members (id, name, member_type_id, card_barcode, status)
values
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0101',
    'Settings Member One',
    '11111111-1111-1111-1111-111111111101',
    'MBR-SETTINGS-1',
    'active'
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0102',
    'Settings Member Two',
    '11111111-1111-1111-1111-111111111101',
    'MBR-SETTINGS-2',
    'active'
  );

-- Checkout and hold fixtures live on separate titles: checkout auto-fulfills
-- the member's own hold on the checked-out title, which would consume the
-- mark_ready queue.
insert into public.titles (id, title, author, genre)
values
  ('dddddddd-dddd-dddd-dddd-dddddddd0201', 'Settings Checkout Title', 'Desk Author', 'Fiction'),
  ('dddddddd-dddd-dddd-dddd-dddddddd0202', 'Settings Hold Title', 'Desk Author', 'Fiction');

insert into public.copies (id, title_id, barcode, status)
values
  ('dddddddd-dddd-dddd-dddd-dddddddd0301', 'dddddddd-dddd-dddd-dddd-dddddddd0201', 'BK-SETTINGS-1', 'available'),
  ('dddddddd-dddd-dddd-dddd-dddddddd0302', 'dddddddd-dddd-dddd-dddd-dddddddd0202', 'BK-SETTINGS-2', 'available'),
  ('dddddddd-dddd-dddd-dddd-dddddddd0303', 'dddddddd-dddd-dddd-dddd-dddddddd0202', 'BK-SETTINGS-3', 'available');

insert into public.holds (id, title_id, member_id, queue_position, status)
values
  ('dddddddd-dddd-dddd-dddd-dddddddd0401', 'dddddddd-dddd-dddd-dddd-dddddddd0202', 'dddddddd-dddd-dddd-dddd-dddddddd0101', 1, 'waiting'),
  ('dddddddd-dddd-dddd-dddd-dddddddd0402', 'dddddddd-dddd-dddd-dddd-dddddddd0202', 'dddddddd-dddd-dddd-dddd-dddddddd0102', 2, 'waiting');

-- ---------------------------------------------------------------------------
-- Staff session.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddd0001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddd0001","role":"authenticated"}';

-- Staff INSERT on member_types is rejected by the admin WITH CHECK policy.
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.member_types (
      name, loan_period_days, renewal_limit, borrow_cap, fine_rate_per_day, hold_expiry_days
    ) values ('Staff Smuggle', 7, 0, 1, 0.10, 3);
  exception
    when insufficient_privilege then
      raised := true;
  end;

  if not raised then
    raise exception 'expected insufficient_privilege when staff inserts into member_types';
  end if;
end $$;

-- Staff UPDATE on member_types matches no rows (USING policy) — the rule is unchanged.
update public.member_types
set loan_period_days = 99
where id = '11111111-1111-1111-1111-111111111101';

do $$
begin
  if not exists (
    select 1 from public.member_types
    where id = '11111111-1111-1111-1111-111111111101'
      and loan_period_days = 21
  ) then
    raise exception 'staff member_types update should have been filtered by RLS';
  end if;
end $$;

-- Staff DELETE on member_types removes nothing.
delete from public.member_types
where id = '11111111-1111-1111-1111-111111111101';

do $$
begin
  if not exists (
    select 1 from public.member_types
    where id = '11111111-1111-1111-1111-111111111101'
  ) then
    raise exception 'staff member_types delete should have been filtered by RLS';
  end if;
end $$;

-- Staff UPDATE on app_settings matches no rows — currency unchanged.
update public.app_settings
set currency = 'EUR'
where id = true;

do $$
begin
  if not exists (
    select 1 from public.app_settings
    where id = true and currency = 'USD'
  ) then
    raise exception 'staff app_settings update should have been filtered by RLS';
  end if;
end $$;

-- Staff has no INSERT/DELETE grant on app_settings at all (singleton guard).
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.app_settings (id) values (true);
  exception
    when insufficient_privilege then
      raised := true;
  end;

  if not raised then
    raise exception 'expected insufficient_privilege when staff inserts into app_settings';
  end if;
end $$;

do $$
declare
  raised boolean := false;
begin
  begin
    delete from public.app_settings where id = true;
  exception
    when insufficient_privilege then
      raised := true;
  end;

  if not raised then
    raise exception 'expected insufficient_privilege when staff deletes from app_settings';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Admin session.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddd0002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddd0002","role":"authenticated"}';

-- Admin can create / update / delete member types. The insert omits id —
-- the column grant excludes it, matching how the app writes.
insert into public.member_types (
  name, loan_period_days, renewal_limit, borrow_cap, fine_rate_per_day, hold_expiry_days
) values (
  'Settings Test Type',
  10,
  1,
  4,
  0.20,
  5
);

do $$
begin
  if not exists (
    select 1 from public.member_types
    where name = 'Settings Test Type'
      and loan_period_days = 10
  ) then
    raise exception 'admin insert into member_types should succeed';
  end if;
end $$;

-- Rule change: Adult loans drop from 21 to 3 days. The checkout below must
-- pick this up — rules are read at action time, never cached.
update public.member_types
set loan_period_days = 3
where id = '11111111-1111-1111-1111-111111111101';

-- Deleting an in-use type is stopped by the members FK, not silently allowed.
do $$
declare
  raised boolean := false;
begin
  begin
    delete from public.member_types
    where id = '11111111-1111-1111-1111-111111111101';
  exception
    when foreign_key_violation then
      raised := true;
  end;

  if not raised then
    raise exception 'expected foreign_key_violation when deleting an in-use member type';
  end if;
end $$;

-- Deleting an unused type works.
delete from public.member_types
where name = 'Settings Test Type';

do $$
begin
  if exists (
    select 1 from public.member_types
    where name = 'Settings Test Type'
  ) then
    raise exception 'admin delete of an unused member type should succeed';
  end if;
end $$;

-- Admin can update app_settings; the trigger bumps updated_at.
do $$
declare
  v_before timestamptz;
begin
  select updated_at into v_before
  from public.app_settings
  where id = true;

  update public.app_settings
  set currency = 'EUR',
      fine_block_threshold = 12.50,
      default_report_range_days = 30
  where id = true;

  if not exists (
    select 1 from public.app_settings
    where id = true
      and currency = 'EUR'
      and fine_block_threshold = 12.50
      and default_report_range_days = 30
      and updated_at > v_before
  ) then
    raise exception 'admin app_settings update should apply and bump updated_at';
  end if;
end $$;

-- Even an admin cannot move the singleton pk — the column grant excludes id.
do $$
declare
  raised boolean := false;
begin
  begin
    update public.app_settings set id = false where id = true;
  exception
    when insufficient_privilege then
      raised := true;
  end;

  if not raised then
    raise exception 'expected insufficient_privilege when admin updates app_settings.id';
  end if;
end $$;

-- The constant-pk check keeps the singleton single even for service_role.
reset role;
set local role service_role;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.app_settings (id) values (true);
  exception
    when unique_violation then
      raised := true;
  end;

  if not raised then
    raise exception 'expected unique_violation inserting a second app_settings row';
  end if;
end $$;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.app_settings (id) values (false);
  exception
    when check_violation then
      raised := true;
  end;

  if not raised then
    raise exception 'expected check_violation inserting app_settings id = false';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Rule change takes effect on the next action: staff checks out a copy for an
-- Adult member and the due date lands ~3 days out, not the seeded 21.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddd0001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddd0001","role":"authenticated"}';

select public.checkout(
  'dddddddd-dddd-dddd-dddd-dddddddd0101',
  array['BK-SETTINGS-1']
);

do $$
begin
  if not exists (
    select 1 from public.loans
    where member_id = 'dddddddd-dddd-dddd-dddd-dddddddd0101'
      and status = 'active'
      and due_at > now() + interval '2 days 23 hours'
      and due_at < now() + interval '3 days 1 hour'
  ) then
    raise exception 'checkout should read the updated loan_period_days (3 days)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Notification trigger: with notify_on_hold_ready off, mark_ready writes no
-- bell row; back on, the next mark_ready notifies again.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddd0002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddd0002","role":"authenticated"}';

update public.app_settings
set notify_on_hold_ready = false
where id = true;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddd0001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddd0001","role":"authenticated"}';

select public.mark_ready('dddddddd-dddd-dddd-dddd-dddddddd0202', 'BK-SETTINGS-2');

do $$
begin
  if not exists (
    select 1 from public.holds
    where id = 'dddddddd-dddd-dddd-dddd-dddddddd0401'
      and status = 'ready'
  ) then
    raise exception 'mark_ready should still ready the hold when notifications are off';
  end if;

  if exists (
    select 1 from public.notifications
    where type = 'hold_ready'
      and entity_id = 'dddddddd-dddd-dddd-dddd-dddddddd0401'
  ) then
    raise exception 'notify_on_hold_ready = false should suppress the bell row';
  end if;
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddd0002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddd0002","role":"authenticated"}';

update public.app_settings
set notify_on_hold_ready = true
where id = true;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddd0001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddd0001","role":"authenticated"}';

select public.mark_ready('dddddddd-dddd-dddd-dddd-dddddddd0202', 'BK-SETTINGS-3');

do $$
begin
  if not exists (
    select 1 from public.notifications
    where type = 'hold_ready'
      and entity_id = 'dddddddd-dddd-dddd-dddd-dddddddd0402'
  ) then
    raise exception 'notify_on_hold_ready = true should insert the bell row';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- log_audit: settings codes are admin-only (they log admin-only writes), staff
-- codes stay staff-loggable, flow codes stay RPC-only.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddd0001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddd0001","role":"authenticated"}';

-- Staff cannot forge a settings.update audit row.
do $$
declare
  raised boolean := false;
begin
  begin
    perform public.log_audit(
      'settings.update',
      'app_settings',
      '00000000-0000-0000-0000-000000000000',
      '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm = 'admin_required' then
        raised := true;
      else
        raise;
      end if;
  end;

  if not raised then
    raise exception 'expected admin_required when staff logs settings.update';
  end if;
end $$;

-- Staff cannot forge a member_type.delete audit row either.
do $$
declare
  raised boolean := false;
begin
  begin
    perform public.log_audit(
      'member_type.delete',
      'member_type',
      '11111111-1111-1111-1111-111111111101',
      '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm = 'admin_required' then
        raised := true;
      else
        raise;
      end if;
  end;

  if not raised then
    raise exception 'expected admin_required when staff logs member_type.delete';
  end if;
end $$;

-- Staff-level codes remain loggable by staff.
do $$
declare
  v_id uuid;
begin
  v_id := public.log_audit(
    'member.update',
    'member',
    'dddddddd-dddd-dddd-dddd-dddddddd0101',
    '{"name":"Settings Member One"}'::jsonb
  );

  if v_id is null then
    raise exception 'staff should still log member.update';
  end if;
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddd0002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddd0002","role":"authenticated"}';

do $$
declare
  v_id uuid;
begin
  v_id := public.log_audit(
    'settings.update',
    'app_settings',
    '00000000-0000-0000-0000-000000000000',
    '{"currency":"EUR"}'::jsonb
  );

  if v_id is null then
    raise exception 'log_audit should accept settings.update';
  end if;

  v_id := public.log_audit(
    'member_type.update',
    'member_type',
    '11111111-1111-1111-1111-111111111101',
    '{"loan_period_days":3}'::jsonb
  );

  if v_id is null then
    raise exception 'log_audit should accept member_type.update';
  end if;
end $$;

do $$
declare
  raised boolean := false;
begin
  begin
    perform public.log_audit(
      'loan.checkout',
      'loan',
      'dddddddd-dddd-dddd-dddd-dddddddd0101',
      '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like 'audit_action_not_allowed:%' then
        raised := true;
      else
        raise;
      end if;
  end;

  if not raised then
    raise exception 'expected audit_action_not_allowed for flow-reserved loan.checkout';
  end if;
end $$;

rollback;
