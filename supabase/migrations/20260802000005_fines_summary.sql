-- Desk-level money totals behind the Fines page stat cards, aggregated in SQL
-- so the client fetches one row instead of two unbounded table reads.
-- Definitions mirror the checkout gate: outstanding counts materialized
-- outstanding/partial balances only; collected counts non-voided payments;
-- waived is the forgiven remainder (amount_paid on waived fines stands).
create view public.fines_summary
with (security_invoker = true)
as
select
  coalesce(
    sum(case
      when f.status in ('outstanding', 'partial') then f.amount - f.amount_paid
    end),
    0
  ) as outstanding_balance,
  (
    select coalesce(sum(p.amount), 0)
    from public.payments p
    where p.voided_by is null
  ) as collected_total,
  coalesce(
    sum(case when f.status = 'waived' then f.amount - f.amount_paid end),
    0
  ) as waived_total
from public.fines f;

comment on view public.fines_summary is
  'All-time desk money totals: outstanding balance, collected (non-voided payments), waived remainder.';

revoke all on public.fines_summary from anon, authenticated;
grant select on public.fines_summary to authenticated;
