-- Renew slice: renew_loan RPC. Renews an active loan from a loan row.
-- Five gates, each a typed rejection (spec §6 Renew):
--   renewal_limit_reached   renew_count hit member_types.renewal_limit
--   title_has_waiting_holds the title has waiting holds (frees the copy at zero
--                           desk friction — deliberate asymmetry vs walk-up checkout)
--   member_suspended / member_blocked
--   member_fine_blocked     outstanding balance at/over the block threshold
--                           (materialized fines only — projections never gate)
--   loan_overdue            renewing would reset due_at and erase the
--                           accrued-but-unfinalized overdue fine; the loan must
--                           be checked in (fine finalized), then re-checked-out
-- Success: due_at = now() + loan_period_days (runs from the renewal moment, not
-- stacked on the old due date), renew_count + 1, audit row — one transaction.

create or replace function public.renew_loan(
  p_loan_id uuid
)
returns public.loans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.profile_role;
  v_loan public.loans;
  v_copy_id uuid;
  v_copy public.copies;
  v_member public.members;
  v_type public.member_types;
  v_settings public.app_settings;
  v_outstanding numeric(12, 2);
  v_previous_due_at timestamptz;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select role into v_role
  from public.profiles
  where id = v_actor;

  if v_role is null then
    raise exception 'profile_missing' using errcode = 'P0001';
  end if;

  -- Resolve the copy first so the lock order (copy, then loan) matches checkin.
  select l.copy_id into v_copy_id
  from public.loans l
  where l.id = p_loan_id;

  if not found then
    raise exception 'loan_not_found' using errcode = 'P0001';
  end if;

  select * into v_copy
  from public.copies
  where id = v_copy_id
  for update;

  select * into v_loan
  from public.loans
  where id = p_loan_id
  for update;

  -- Re-checked under the lock: a concurrent check-in may have returned the
  -- loan while this renewal waited on the copy row.
  if v_loan.status <> 'active' then
    raise exception 'loan_not_found' using errcode = 'P0001';
  end if;

  select * into v_member
  from public.members
  where id = v_loan.member_id;

  select * into v_type
  from public.member_types
  where id = v_member.member_type_id;

  select * into v_settings
  from public.app_settings
  where id = true
  for share;

  if not found then
    raise exception 'app_settings_missing' using errcode = 'P0001';
  end if;

  -- Gate 1: renewal limit.
  if v_loan.renew_count >= v_type.renewal_limit then
    raise exception 'renewal_limit_reached' using errcode = 'P0001';
  end if;

  -- Gate 2: waiting holds on the title. Only waiting holds block — a ready hold
  -- already has its own shelf copy, so it does not need this one.
  if exists (
    select 1
    from public.holds
    where title_id = v_copy.title_id
      and status = 'waiting'
  ) then
    raise exception 'title_has_waiting_holds' using errcode = 'P0001';
  end if;

  -- Gate 3: member standing.
  if v_member.status = 'suspended' then
    raise exception 'member_suspended' using errcode = 'P0001';
  end if;

  if v_member.status = 'blocked' then
    raise exception 'member_blocked' using errcode = 'P0001';
  end if;

  -- Gate 4: fine block-threshold, same materialized-balance rule as checkout.
  select coalesce(sum(f.amount - f.amount_paid), 0) into v_outstanding
  from public.fines f
  where f.member_id = v_loan.member_id
    and f.status in ('outstanding', 'partial');

  -- Zero outstanding never blocks. Threshold 0 means "any positive balance blocks".
  if v_outstanding > 0 and v_outstanding >= v_settings.fine_block_threshold then
    raise exception 'member_fine_blocked' using errcode = 'P0001';
  end if;

  -- Gate 5: already overdue (the fine-eraser hole — ADR-0002). Overdue is
  -- derived: due_at < now() on an active loan.
  if v_loan.due_at < now() then
    raise exception 'loan_overdue' using errcode = 'P0001';
  end if;

  v_previous_due_at := v_loan.due_at;

  update public.loans
  set due_at = now() + make_interval(days => v_type.loan_period_days),
      renew_count = renew_count + 1
  where id = v_loan.id
  returning * into v_loan;

  insert into public.audit_log (actor, action, entity_type, entity_id, detail)
  values (
    v_actor,
    'loan.renew',
    'loan',
    v_loan.id,
    jsonb_build_object(
      'member_id', v_loan.member_id,
      'copy_id', v_copy.id,
      'barcode', v_copy.barcode,
      'previous_due_at', v_previous_due_at,
      'due_at', v_loan.due_at,
      'renew_count', v_loan.renew_count
    )
  );

  return v_loan;
end;
$$;

revoke all on function public.renew_loan(uuid) from public;
grant execute on function public.renew_loan(uuid) to authenticated;

comment on function public.renew_loan(uuid) is
  'Renew an active loan: five gated typed rejections; due_at restarts from the renewal moment; audited.';
