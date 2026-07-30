-- Verifies profiles.role cannot be updated by the authenticated role.
-- Run against local stack: `pnpm exec supabase db reset` then
-- `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/profiles_role_grant.sql`
-- (or any SQL client pointed at the local DB).

begin;

-- Seed a fake auth user + profile without going through Auth admin API.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'authenticated',
  'authenticated',
  'role-grant-test@bookly.local',
  crypt('test-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (id, full_name, email, role)
values (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'Role Grant Test',
  'role-grant-test@bookly.local',
  'staff'
);

-- Act as the JWT owner of that row.
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","role":"authenticated"}';

do $$
declare
  raised boolean := false;
begin
  begin
    update public.profiles
    set role = 'admin'
    where id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  exception
    when insufficient_privilege then
      raised := true;
  end;

  if not raised then
    raise exception 'expected insufficient_privilege when authenticated updates profiles.role';
  end if;
end $$;

-- Allowed columns still update under own-row RLS.
update public.profiles
set full_name = 'Role Grant Test Updated'
where id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

do $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      and full_name = 'Role Grant Test Updated'
      and role = 'staff'
  ) then
    raise exception 'own-row update of non-role columns should succeed and leave role unchanged';
  end if;
end $$;

rollback;
