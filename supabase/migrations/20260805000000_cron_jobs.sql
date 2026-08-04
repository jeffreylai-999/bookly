-- Overnight pg_cron jobs: expire_holds + notify_overdue with library-local
-- morning gating (spec §4). Both are scheduled hourly in UTC; the body no-ops
-- unless local time is 08:00–09:00 and the job has not already stamped that
-- library-local day — DST-proof by construction (date+hour, not a fixed UTC hour).

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- ---------------------------------------------------------------------------
-- Last-run markers on the app_settings singleton. Bookkeeping columns — not
-- part of the admin column GRANT (clients never write them).
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column expire_holds_last_run_date date,
  add column notify_overdue_last_run_date date;

comment on column public.app_settings.expire_holds_last_run_date is
  'Library-local calendar date of the last effective expire_holds run.';
comment on column public.app_settings.notify_overdue_last_run_date is
  'Library-local calendar date of the last effective notify_overdue run.';

-- ---------------------------------------------------------------------------
-- Shared gate: morning hour in app_settings.timezone, once per local day.
-- Returns the library-local date when the job should run, else null.
-- p_now is injectable so SQL tests can pin DST transition mornings.
-- ---------------------------------------------------------------------------
create or replace function public.cron_local_run_date(
  p_last_run date,
  p_timezone text,
  p_now timestamptz
)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp;
  v_local_date date;
begin
  v_local := p_now at time zone p_timezone;
  v_local_date := v_local::date;

  if extract(hour from v_local)::integer <> 8 then
    return null;
  end if;

  if p_last_run is not distinct from v_local_date then
    return null;
  end if;

  return v_local_date;
end;
$$;

revoke all on function public.cron_local_run_date(date, text, timestamptz) from public;

comment on function public.cron_local_run_date(date, text, timestamptz) is
  'Internal: library-local morning gate for daily cron jobs. Returns local date or null.';

-- ---------------------------------------------------------------------------
-- expire_holds: ready holds past expires_at → expired; shelf copy promotes the
-- next waiting hold (via promote_waiting_hold) or returns to available.
-- ---------------------------------------------------------------------------
create or replace function public.expire_holds(
  p_now timestamptz default clock_timestamp()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.app_settings;
  v_run_date date;
  v_hold public.holds;
begin
  select * into v_settings
  from public.app_settings
  where id = true
  for update;

  if not found then
    raise exception 'app_settings_missing' using errcode = 'P0001';
  end if;

  v_run_date := public.cron_local_run_date(
    v_settings.expire_holds_last_run_date,
    v_settings.timezone,
    p_now
  );

  if v_run_date is null then
    return;
  end if;

  for v_hold in
    select *
    from public.holds
    where status = 'ready'
      and expires_at is not null
      and expires_at <= p_now
    order by expires_at, id
    for update
  loop
    update public.holds
    set status = 'expired'
    where id = v_hold.id;

    insert into public.audit_log (actor, action, entity_type, entity_id, detail)
    values (
      null,
      'hold.expire',
      'hold',
      v_hold.id,
      jsonb_build_object(
        'member_id', v_hold.member_id,
        'title_id', v_hold.title_id,
        'copy_id', v_hold.copy_id,
        'cron', true
      )
    );

    if v_hold.copy_id is not null then
      perform public.promote_waiting_hold(v_hold.title_id, v_hold.copy_id);
    end if;
  end loop;

  update public.app_settings
  set expire_holds_last_run_date = v_run_date
  where id = true;
end;
$$;

revoke all on function public.expire_holds(timestamptz) from public;
grant execute on function public.expire_holds(timestamptz) to postgres;
grant execute on function public.expire_holds(timestamptz) to service_role;

comment on function public.expire_holds(timestamptz) is
  'Daily (library-local morning) job: expire ready holds past expires_at and promote the queue.';

-- ---------------------------------------------------------------------------
-- notify_overdue: one overdue notification per overdue loan that has none yet
-- (anti-join on type+entity). Immune to due_at shifting on renewal.
-- ---------------------------------------------------------------------------
create or replace function public.notify_overdue(
  p_now timestamptz default clock_timestamp()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.app_settings;
  v_run_date date;
begin
  select * into v_settings
  from public.app_settings
  where id = true
  for update;

  if not found then
    raise exception 'app_settings_missing' using errcode = 'P0001';
  end if;

  v_run_date := public.cron_local_run_date(
    v_settings.notify_overdue_last_run_date,
    v_settings.timezone,
    p_now
  );

  if v_run_date is null then
    return;
  end if;

  if v_settings.notify_on_overdue then
    insert into public.notifications (type, entity_type, entity_id, detail)
    select
      'overdue',
      'loan',
      o.loan_id,
      jsonb_build_object(
        'member_id', o.member_id,
        'member_name', o.member_name,
        'title_id', o.title_id,
        'title', o.title,
        'loan_id', o.loan_id,
        'copy_id', o.copy_id,
        'copy_barcode', o.copy_barcode,
        'due_at', o.due_at,
        'days_late', o.days_late
      )
    from public.overdue_loans o
    where not exists (
      select 1
      from public.notifications n
      where n.type = 'overdue'
        and n.entity_type = 'loan'
        and n.entity_id = o.loan_id
    );
  end if;

  update public.app_settings
  set notify_overdue_last_run_date = v_run_date
  where id = true;
end;
$$;

revoke all on function public.notify_overdue(timestamptz) from public;
grant execute on function public.notify_overdue(timestamptz) to postgres;
grant execute on function public.notify_overdue(timestamptz) to service_role;

comment on function public.notify_overdue(timestamptz) is
  'Daily (library-local morning) job: insert one overdue notification per overdue loan lacking one.';

-- Hourly UTC schedules; gate inside the functions picks the library-local morning.
select cron.schedule(
  'expire-holds-hourly',
  '0 * * * *',
  $$select public.expire_holds()$$
);

select cron.schedule(
  'notify-overdue-hourly',
  '0 * * * *',
  $$select public.notify_overdue()$$
);
