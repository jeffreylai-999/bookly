-- Admin roster reads for the audit viewer actor filter / join.
-- Own-row SELECT remains for staff; admins need every desk profile's name.
-- Uses a SECURITY DEFINER helper so the policy does not recurse on profiles RLS.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'::public.profile_role
  );
$$;

comment on function public.is_admin() is
  'True when the JWT subject is an admin profile; used by admin-scoped RLS policies.';

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create policy profiles_select_admin
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());
