-- Overview launchpad (spec §7 "Overview (P1)"): read-only views backing the
-- morning briefing's "due today" list and 14-day checkout trend widget. No
-- new RPCs — the rest of the page reads existing aggregates (holds,
-- overdue_loans, fines_summary, audit_log). Both views are bucketed in
-- app_settings.timezone, the same mechanism overdue_loans.days_late uses, so
-- there is one source of "library-local day" across the app (ADR-0002).

-- ---------------------------------------------------------------------------
-- due_today_loans: active loans whose due_at falls on today's calendar date
-- in the library timezone. Distinct from overdue_loans (due_at < now()) — a
-- loan due later today is "due today" but not yet overdue; a loan due earlier
-- today that has already slipped past due_at is deliberately in *both* views
-- (the desk still needs it on today's list, and it now also carries an
-- accruing fine in "top overdue"). Acceptance criteria: respects
-- app_settings.timezone at midnight boundaries.
-- ---------------------------------------------------------------------------
create view public.due_today_loans
with (security_invoker = true)
as
select
  l.id as loan_id,
  l.copy_id,
  c.barcode as copy_barcode,
  t.id as title_id,
  t.title,
  t.author,
  l.member_id,
  m.name as member_name,
  m.card_barcode as member_card_barcode,
  l.checked_out_at,
  l.due_at
from public.loans l
join public.copies c on c.id = l.copy_id
join public.titles t on t.id = c.title_id
join public.members m on m.id = l.member_id
cross join public.app_settings s
where l.status = 'active'
  and s.id = true
  and (l.due_at at time zone s.timezone)::date = (now() at time zone s.timezone)::date;

comment on view public.due_today_loans is
  'Active loans due today in library-local time (app_settings.timezone). Overlaps overdue_loans for a loan already past due_at earlier the same day — both lists are meant to show it.';

revoke all on public.due_today_loans from anon, authenticated;
grant select on public.due_today_loans to authenticated;

-- ---------------------------------------------------------------------------
-- checkout_trend: the last 14 library-local days (today inclusive), zero-
-- filled via generate_series so a day with no checkouts still plots as a bar
-- instead of vanishing from the series. Feeds the Overview trend widget.
-- ---------------------------------------------------------------------------
create view public.checkout_trend
with (security_invoker = true)
as
select
  gs.day::date as day,
  count(l.id)::integer as checkouts
from public.app_settings s
cross join lateral generate_series(
  (now() at time zone s.timezone)::date - interval '13 days',
  (now() at time zone s.timezone)::date,
  interval '1 day'
) as gs(day)
left join public.loans l
  on (l.checked_out_at at time zone s.timezone)::date = gs.day::date
where s.id = true
group by gs.day
order by gs.day;

comment on view public.checkout_trend is
  '14-day (library-local, zero-filled) daily checkout counts for the Overview trend widget.';

revoke all on public.checkout_trend from anon, authenticated;
grant select on public.checkout_trend to authenticated;
