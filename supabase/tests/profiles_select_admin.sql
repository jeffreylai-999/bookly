-- Verifies staff see only their own profile; admins see the full desk roster
-- (needed for audit viewer actor filter + join).
--
-- Run: `pnpm test:sql:profiles-select-admin` (after `pnpm exec supabase db reset`).

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee1001',
    'authenticated', 'authenticated', 'staff-audit-test@bookly.local',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee1002',
    'authenticated', 'authenticated', 'admin-audit-test@bookly.local',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.profiles (id, full_name, email, role)
values
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeee1001', 'Staff Audit Test', 'staff-audit-test@bookly.local', 'staff'),
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeee1002', 'Admin Audit Test', 'admin-audit-test@bookly.local', 'admin');

-- Staff: own row only.
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee1001';
set local request.jwt.claim.role = 'authenticated';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.profiles;
  if v_count <> 1 then
    raise exception 'staff should see exactly 1 profile, saw %', v_count;
  end if;
  if not exists (
    select 1 from public.profiles
    where id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee1001'
  ) then
    raise exception 'staff should see their own profile';
  end if;
  if exists (
    select 1 from public.profiles
    where id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee1002'
  ) then
    raise exception 'staff must not see other profiles';
  end if;
end $$;

-- Admin: full roster.
set local request.jwt.claim.sub = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee1002';

do $$
declare
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'is_admin() should be true for admin JWT';
  end if;
  select count(*) into v_count from public.profiles;
  if v_count < 2 then
    raise exception 'admin should see at least the two seeded profiles, saw %', v_count;
  end if;
  if not exists (
    select 1 from public.profiles
    where id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee1001'
  ) then
    raise exception 'admin should see staff profiles';
  end if;
end $$;

rollback;
