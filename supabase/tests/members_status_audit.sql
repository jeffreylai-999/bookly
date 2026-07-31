-- Verifies members.status cannot be written directly by authenticated, and that
-- set_member_status is the only path. Also covers log_audit allowlist + actor
-- derivation.
--
-- Run: `pnpm test:sql:members` (after `pnpm exec supabase db reset`).

begin;

-- ---------------------------------------------------------------------------
-- Seed auth users + profiles (staff + admin) without Auth admin API.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001',
    'authenticated', 'authenticated', 'staff-member-test@bookly.local',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002',
    'authenticated', 'authenticated', 'admin-member-test@bookly.local',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.profiles (id, full_name, email, role)
values
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001', 'Staff Member Test', 'staff-member-test@bookly.local', 'staff'),
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002', 'Admin Member Test', 'admin-member-test@bookly.local', 'admin');

insert into public.members (id, name, member_type_id, card_barcode, status)
values (
  'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001',
  'Ada Lovelace',
  '11111111-1111-1111-1111-111111111101',
  'MBR-TEST-0001',
  'active'
);

-- ---------------------------------------------------------------------------
-- Direct status UPDATE is rejected (column grant).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001","role":"authenticated"}';

do $$
declare
  raised boolean := false;
begin
  begin
    update public.members
    set status = 'suspended'
    where id = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001';
  exception
    when insufficient_privilege then
      raised := true;
  end;

  if not raised then
    raise exception 'expected insufficient_privilege when authenticated updates members.status';
  end if;
end $$;

-- Direct status INSERT smuggling is rejected (column grant).
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.members (name, member_type_id, card_barcode, status)
    values (
      'Smuggled',
      '11111111-1111-1111-1111-111111111101',
      'MBR-TEST-SMUG',
      'blocked'
    );
  exception
    when insufficient_privilege then
      raised := true;
  end;

  if not raised then
    raise exception 'expected insufficient_privilege when authenticated inserts members.status';
  end if;
end $$;

-- Non-status columns remain writable.
update public.members
set phone = '555-0100'
where id = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001';

do $$
begin
  if not exists (
    select 1 from public.members
    where id = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001'
      and phone = '555-0100'
      and status = 'active'
  ) then
    raise exception 'non-status member update should succeed and leave status unchanged';
  end if;
end $$;

-- Staff can suspend via RPC; audit row written with session actor.
select public.set_member_status(
  'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001',
  'suspended'
);

do $$
begin
  if not exists (
    select 1 from public.members
    where id = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001' and status = 'suspended'
  ) then
    raise exception 'set_member_status should suspend the member';
  end if;

  if not exists (
    select 1 from public.audit_log
    where actor = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001'
      and action = 'member.status'
      and entity_type = 'member'
      and entity_id = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001'
      and detail->>'from' = 'active'
      and detail->>'to' = 'suspended'
  ) then
    raise exception 'set_member_status should write an audit row for the session actor';
  end if;
end $$;

-- Staff cannot block.
do $$
declare
  raised boolean := false;
begin
  begin
    perform public.set_member_status(
      'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001',
      'blocked'
    );
  exception
    when others then
      if sqlerrm like 'admin_required%' then
        raised := true;
      else
        raise;
      end if;
  end;

  if not raised then
    raise exception 'expected admin_required when staff blocks a member';
  end if;
end $$;

-- Lift back to active so admin block test starts from a known state.
select public.set_member_status(
  'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001',
  'active'
);

-- Admin can block.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002","role":"authenticated"}';

select public.set_member_status(
  'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001',
  'blocked'
);

do $$
begin
  if not exists (
    select 1 from public.members
    where id = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001' and status = 'blocked'
  ) then
    raise exception 'admin set_member_status should block the member';
  end if;
end $$;

-- Staff cannot unblock.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001","role":"authenticated"}';

do $$
declare
  raised boolean := false;
begin
  begin
    perform public.set_member_status(
      'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001',
      'active'
    );
  exception
    when others then
      if sqlerrm like 'admin_required%' then
        raised := true;
      else
        raise;
      end if;
  end;

  if not raised then
    raise exception 'expected admin_required when staff unblocks a member';
  end if;
end $$;

-- Resume admin session for log_audit cases.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- log_audit: rejects flow-reserved codes; actor from session (not a param).
-- ---------------------------------------------------------------------------
do $$
declare
  raised boolean := false;
begin
  begin
    perform public.log_audit(
      'loan.checkout',
      'loan',
      'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001',
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

do $$
declare
  v_id uuid;
begin
  v_id := public.log_audit(
    'member.update',
    'member',
    'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001',
    '{"name":"Ada Lovelace"}'::jsonb
  );

  if v_id is null then
    raise exception 'log_audit should return an id';
  end if;

  if not exists (
    select 1 from public.audit_log
    where id = v_id
      and actor = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002'
      and action = 'member.update'
      and entity_type = 'member'
      and entity_id = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001'
  ) then
    raise exception 'log_audit should derive actor from auth.uid()';
  end if;
end $$;

-- Direct audit_log insert is rejected for authenticated.
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.audit_log (actor, action, entity_type, entity_id, detail)
    values (
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002',
      'member.update',
      'member',
      'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001',
      '{}'::jsonb
    );
  exception
    when insufficient_privilege then
      raised := true;
  end;

  if not raised then
    raise exception 'expected insufficient_privilege on direct audit_log insert';
  end if;
end $$;

rollback;
