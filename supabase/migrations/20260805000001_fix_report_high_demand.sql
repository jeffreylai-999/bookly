-- Fix report_high_demand: remove h.waiting_count from GROUP BY and use
-- MAX() instead. Including a non-key column from a LEFT JOIN in GROUP BY
-- can produce duplicate title rows when PostgreSQL evaluates the join
-- differently across plan shapes (e.g. with the holds subquery returning
-- NULL vs a value for the same title_id).
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
