-- Fix report_high_demand: rewrite using CTEs to correctly count checkouts per
-- title and avoid potential fan-out from the copies-to-loans join with a
-- grouped left-join on waiting holds.
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
  with checkouts as (
    select c.title_id, count(l.id)::integer as checkout_count
    from public.loans l
    join public.copies c on c.id = l.copy_id
    where (l.checked_out_at at time zone v_tz)::date between v_start and v_today
    group by c.title_id
  ),
  holds_waiting as (
    select holds.title_id, count(*)::integer as waiting_count
    from public.holds
    where status = 'waiting'
    group by holds.title_id
  )
  select
    t.id,
    t.title,
    t.author,
    ch.checkout_count,
    coalesce(h.waiting_count, 0)
  from public.titles t
  join checkouts ch on ch.title_id = t.id
  left join holds_waiting h on h.title_id = t.id
  order by ch.checkout_count desc, coalesce(h.waiting_count, 0) desc, t.title
  limit 10;
end;
$$;

comment on function public.report_high_demand(integer) is
  'Top 10 titles by checkouts in the last p_days days (7/14/30); ties broken by current waiting holds.';
