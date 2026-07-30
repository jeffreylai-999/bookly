-- Auth walking skeleton: staff/admin profiles.
-- role is immutable from the client via column-level GRANT (RLS alone cannot
-- exclude a column). Role changes happen only via the service role.

create type public.profile_role as enum ('staff', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.profile_role not null,
  locale text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Staff/admin desk users; id mirrors auth.users.';
comment on column public.profiles.role is 'Immutable from the client — excluded from UPDATE grant.';

alter table public.profiles enable row level security;

-- New tables are not auto-exposed (config.toml); grant the API surface explicitly.
grant usage on type public.profile_role to authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
-- role deliberately omitted — PostgREST/Postgres rejects client UPDATEs that touch it.
grant update (full_name, email, locale) on table public.profiles to authenticated;
-- Seed / dashboard admin API uses the service role (bypasses RLS, still needs table grants).
grant select, insert, update, delete on table public.profiles to service_role;

-- Own row only. The app never reads another user's profile — AuthService loads
-- `.eq('id', session.user.id)` — so a broader policy would only widen the blast
-- radius of a leaked anon-key session to every desk user's email and role.
-- Cross-user reads (an admin roster) need their own admin-scoped policy.
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
