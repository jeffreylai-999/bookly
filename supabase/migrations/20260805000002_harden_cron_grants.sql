-- Strip default privilege grants from anon and authenticated roles
-- to keep cron functions postgres/service_role-only.
revoke execute on function public.cron_local_run_date(date, text, timestamptz) from anon, authenticated;
revoke execute on function public.expire_holds(timestamptz) from anon, authenticated;
revoke execute on function public.notify_overdue(timestamptz) from anon, authenticated;
