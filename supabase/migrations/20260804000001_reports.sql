-- Reports slice: seven read-only, range-scoped aggregate functions backing the
-- Analytics page (spec §7 "Reports (P2)" metric definitions). All read-only —
-- no mutation, no audit row — so unlike the flow RPCs these run SECURITY
-- INVOKER (the caller's own already-granted SELECT privileges on loans,
-- holds, fines, payments, members, titles, copies are sufficient; nothing
-- here needs to bypass RLS). `set search_path = ''` is still set on every
-- function per the repo's blanket hardening against search-path hijack.
--
-- Every range-scoped metric buckets dates in `app_settings.timezone`, the
-- same convention as the `overdue_loans` view (ADR-0002) — a day boundary at
-- library-local midnight, not UTC. `p_days` is restricted to the UI's
-- 7/14/30 range selector values (matches the `default_report_range_days`
-- check constraint added in the settings migration).

-- ---------------------------------------------------------------------------
-- report_overdue_aging: present-state snapshot (NOT range-scoped) — current
-- overdue loans bucketed by days_late. Reads the overdue_loans view so this
-- is always the same formula as Circulation's overdue tab (ADR-0002).
-- ---------------------------------------------------------------------------
create or replace function public.report_overdue_aging()
returns table (
  bucket text,
  bucket_order smallint,
  loan_count integer
)
language sql
stable
set search_path = ''
as $$
  with buckets(bucket, bucket_order) as (
    values ('1-7', 1::smallint), ('8-14', 2::smallint), ('15-30', 3::smallint), ('30+', 4::smallint)
  ),
  aged as (
    select
      case
        when days_late <= 7 then '1-7'
        when days_late <= 14 then '8-14'
        when days_late <= 30 then '15-30'
        else '30+'
      end as bucket
    from public.overdue_loans
  )
  select b.bucket, b.bucket_order, count(a.bucket)::integer as loan_count
  from buckets b
  left join aged a on a.bucket = b.bucket
  group by b.bucket, b.bucket_order
  order by b.bucket_order;
$$;

revoke all on function public.report_overdue_aging() from public;
grant execute on function public.report_overdue_aging() to authenticated;

comment on function public.report_overdue_aging() is
  'Present-state overdue loans bucketed by days_late (1-7/8-14/15-30/30+). Not range-scoped.';

-- ---------------------------------------------------------------------------
-- Shared range-validation shape: p_days must be one of the selector values.
-- Inlined (not a helper function) — each function stays a single self
-- contained statement set, matching the rest of the codebase's style.
-- ---------------------------------------------------------------------------

-- report_dead_stock: titles with >=1 non-retired copy and zero checkouts in
-- range (range-relative, not "never loaned" — a title can cycle on and off
-- this list as the range moves).
create or replace function public.report_dead_stock(p_days integer)
returns table (
  title_id uuid,
  title text,
  author text,
  genre text,
  lendable_copies integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
  v_start date;
begin
  if p_days is null or p_days not in (7, 14, 30) then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;

  select s.timezone into v_tz from public.app_settings s where s.id = true;
  v_today := (now() at time zone v_tz)::date;
  v_start := v_today - (p_days - 1);

  return query
  select
    t.id,
    t.title,
    t.author,
    t.genre,
    -- Lendable = could be handed to a member right now (available, or on the
    -- hold shelf awaiting pickup). lost/damaged/retired copies cannot be
    -- checked out (the checkout RPC's copy-status matrix), so counting them
    -- here would misclassify a title as "dead stock" when it actually has no
    -- stock capable of being idle in the first place.
    count(c.id) filter (where c.status in ('available', 'on_hold_shelf'))::integer
      as lendable_copies
  from public.titles t
  join public.copies c on c.title_id = t.id
  group by t.id, t.title, t.author, t.genre
  having count(c.id) filter (where c.status in ('available', 'on_hold_shelf')) > 0
    and not exists (
      select 1
      from public.loans l
      join public.copies c2 on c2.id = l.copy_id
      where c2.title_id = t.id
        and (l.checked_out_at at time zone v_tz)::date between v_start and v_today
    )
  order by t.title;
end;
$$;

revoke all on function public.report_dead_stock(integer) from public;
grant execute on function public.report_dead_stock(integer) to authenticated;

comment on function public.report_dead_stock(integer) is
  'Titles with a lendable copy and zero checkouts in the last p_days days (7/14/30).';

-- report_high_demand: top titles by checkouts in range; ties broken by the
-- title's current waiting-hold count (a title with the same checkout count
-- but a longer queue is the hotter one right now).
create or replace function public.report_high_demand(p_days integer)
returns table (
  title_id uuid,
  title text,
  author text,
  checkout_count integer,
  waiting_holds integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
  v_start date;
begin
  if p_days is null or p_days not in (7, 14, 30) then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;

  select s.timezone into v_tz from public.app_settings s where s.id = true;
  v_today := (now() at time zone v_tz)::date;
  v_start := v_today - (p_days - 1);

  return query
  select
    t.id,
    t.title,
    t.author,
    count(l.id)::integer as checkout_count,
    coalesce(max(h.waiting_count), 0)::integer as waiting_holds
  from public.titles t
  join public.copies c on c.title_id = t.id
  join public.loans l
    on l.copy_id = c.id
    and (l.checked_out_at at time zone v_tz)::date between v_start and v_today
  left join (
    select holds.title_id, count(*) as waiting_count
    from public.holds
    where status = 'waiting'
    group by holds.title_id
  ) h on h.title_id = t.id
  group by t.id, t.title, t.author
  order by checkout_count desc, waiting_holds desc, t.title
  limit 10;
end;
$$;

revoke all on function public.report_high_demand(integer) from public;
grant execute on function public.report_high_demand(integer) to authenticated;

comment on function public.report_high_demand(integer) is
  'Top 10 titles by checkouts in the last p_days days (7/14/30); ties broken by current waiting holds.';

-- report_fine_collection: per-day collected (non-voided payments) vs incurred
-- (fines created), zero-filled so every day in range has a row.
create or replace function public.report_fine_collection(p_days integer)
returns table (
  report_date date,
  collected numeric,
  incurred numeric
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
  v_start date;
begin
  if p_days is null or p_days not in (7, 14, 30) then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;

  select s.timezone into v_tz from public.app_settings s where s.id = true;
  v_today := (now() at time zone v_tz)::date;
  v_start := v_today - (p_days - 1);

  return query
  with days as (
    select generate_series(v_start, v_today, interval '1 day')::date as report_date
  ),
  collected as (
    select (p.created_at at time zone v_tz)::date as d, sum(p.amount) as amt
    from public.payments p
    where p.voided_by is null
      and (p.created_at at time zone v_tz)::date between v_start and v_today
    group by 1
  ),
  incurred as (
    select (f.created_at at time zone v_tz)::date as d, sum(f.amount) as amt
    from public.fines f
    where (f.created_at at time zone v_tz)::date between v_start and v_today
    group by 1
  )
  select d.report_date, coalesce(c.amt, 0), coalesce(i.amt, 0)
  from days d
  left join collected c on c.d = d.report_date
  left join incurred i on i.d = d.report_date
  order by d.report_date;
end;
$$;

revoke all on function public.report_fine_collection(integer) from public;
grant execute on function public.report_fine_collection(integer) to authenticated;

comment on function public.report_fine_collection(integer) is
  'Per-day collected (non-voided payments) vs incurred (fines created) over the last p_days days (7/14/30), zero-filled.';

-- report_new_member_growth: members.joined_at count per day, zero-filled.
create or replace function public.report_new_member_growth(p_days integer)
returns table (
  report_date date,
  member_count integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
  v_start date;
begin
  if p_days is null or p_days not in (7, 14, 30) then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;

  select s.timezone into v_tz from public.app_settings s where s.id = true;
  v_today := (now() at time zone v_tz)::date;
  v_start := v_today - (p_days - 1);

  return query
  with days as (
    select generate_series(v_start, v_today, interval '1 day')::date as report_date
  ),
  joins as (
    select (m.joined_at at time zone v_tz)::date as d, count(*) as cnt
    from public.members m
    where (m.joined_at at time zone v_tz)::date between v_start and v_today
    group by 1
  )
  select d.report_date, coalesce(j.cnt, 0)::integer
  from days d
  left join joins j on j.d = d.report_date
  order by d.report_date;
end;
$$;

revoke all on function public.report_new_member_growth(integer) from public;
grant execute on function public.report_new_member_growth(integer) to authenticated;

comment on function public.report_new_member_growth(integer) is
  'members.joined_at count per day over the last p_days days (7/14/30), zero-filled.';

-- report_peak_hours: checkout-hour histogram (library tz), zero-filled 0-23.
-- Check-outs only (desk-load proxy) — check-ins are not counted.
create or replace function public.report_peak_hours(p_days integer)
returns table (
  hour_of_day smallint,
  checkout_count integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
  v_start date;
begin
  if p_days is null or p_days not in (7, 14, 30) then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;

  select s.timezone into v_tz from public.app_settings s where s.id = true;
  v_today := (now() at time zone v_tz)::date;
  v_start := v_today - (p_days - 1);

  return query
  with hours as (
    select generate_series(0, 23) as hour_of_day
  ),
  checkouts as (
    select extract(hour from (l.checked_out_at at time zone v_tz))::smallint as h
    from public.loans l
    where (l.checked_out_at at time zone v_tz)::date between v_start and v_today
  )
  select h.hour_of_day::smallint, count(c.h)::integer
  from hours h
  left join checkouts c on c.h = h.hour_of_day
  group by h.hour_of_day
  order by h.hour_of_day;
end;
$$;

revoke all on function public.report_peak_hours(integer) from public;
grant execute on function public.report_peak_hours(integer) to authenticated;

comment on function public.report_peak_hours(integer) is
  'Check-out-hour histogram (library tz) over the last p_days days (7/14/30), zero-filled 0-23. Check-outs only.';

-- report_genre_breakdown: checkouts in range grouped by titles.genre.
create or replace function public.report_genre_breakdown(p_days integer)
returns table (
  genre text,
  checkout_count integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
  v_start date;
begin
  if p_days is null or p_days not in (7, 14, 30) then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;

  select s.timezone into v_tz from public.app_settings s where s.id = true;
  v_today := (now() at time zone v_tz)::date;
  v_start := v_today - (p_days - 1);

  return query
  select t.genre, count(l.id)::integer as checkout_count
  from public.loans l
  join public.copies c on c.id = l.copy_id
  join public.titles t on t.id = c.title_id
  where (l.checked_out_at at time zone v_tz)::date between v_start and v_today
  group by t.genre
  order by checkout_count desc, t.genre;
end;
$$;

revoke all on function public.report_genre_breakdown(integer) from public;
grant execute on function public.report_genre_breakdown(integer) to authenticated;

comment on function public.report_genre_breakdown(integer) is
  'Checkouts over the last p_days days (7/14/30) grouped by titles.genre.';
