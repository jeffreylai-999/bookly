-- Check-in slice: overdue_loans view (single source of the overdue formula) +
-- checkin RPC (ok / damaged / lost branches; fines born here). See ADR-0002.
-- Hold fill is deliberately absent: the holds table lands with the Holds slice,
-- so an ok check-in can only set the copy available for now.

-- ---------------------------------------------------------------------------
-- overdue_loans view: derived overdue + projection. days_late counts
-- library-local calendar days (dates bucketed in app_settings.timezone), so a
-- due 23:59 / check-in 00:01 boundary crossing is exactly 1 day late.
-- Circulation's overdue tab, Overview widgets, and the checkin fine all read
-- this same formula — no client-side duplicate.
-- ---------------------------------------------------------------------------
create view public.overdue_loans
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
  l.due_at,
  (now() at time zone s.timezone)::date - (l.due_at at time zone s.timezone)::date
    as days_late,
  mt.fine_rate_per_day,
  round(
    ((now() at time zone s.timezone)::date - (l.due_at at time zone s.timezone)::date)
      * mt.fine_rate_per_day,
    2
  ) as projected_fine
from public.loans l
join public.copies c on c.id = l.copy_id
join public.titles t on t.id = c.title_id
join public.members m on m.id = l.member_id
join public.member_types mt on mt.id = m.member_type_id
cross join public.app_settings s
where l.status = 'active'
  and l.due_at < now();

comment on view public.overdue_loans is
  'Derived overdue loans with library-local days_late and projected_fine. Single source of the overdue formula (ADR-0002).';

revoke all on public.overdue_loans from anon, authenticated;
grant select on public.overdue_loans to authenticated;

-- ---------------------------------------------------------------------------
-- checkin RPC: the desk's copy check-in action. One transaction: lock copy + loan,
-- finalize fines at the current rate (snapshotting the applied rule), set
-- returned_at, move the copy, audit.
--   ok      → overdue fine from the view projection when owed; copy available
--   damaged → overdue fine stacks + damage fine (default or audited override);
--             copy damaged; flow ends (no hold interaction)
--   lost    → replacement cost (title, else settings fallback) REPLACES any
--             overdue fine; copy lost; flow ends (no hold interaction)
-- ---------------------------------------------------------------------------
create or replace function public.checkin(
  p_copy_barcode text,
  p_condition text,
  p_damaged_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.profile_role;
  v_copy public.copies;
  v_loan public.loans;
  v_overdue public.overdue_loans;
  v_settings public.app_settings;
  v_title public.titles;
  v_fine_id uuid;
  v_fines jsonb := '[]'::jsonb;
  v_fine_ids uuid[] := array[]::uuid[];
  v_new_status public.copy_status;
  v_damage_amount numeric(10, 2);
  v_damage_overridden boolean := false;
  v_lost_amount numeric(10, 2);
  v_lost_basis text;
  v_detail jsonb;
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

  if p_condition is null or p_condition not in ('ok', 'damaged', 'lost') then
    raise exception 'invalid_condition' using errcode = 'P0001';
  end if;

  if p_damaged_amount is not null and p_condition <> 'damaged' then
    raise exception 'damaged_amount_unexpected' using errcode = 'P0001';
  end if;

  if p_damaged_amount is not null and p_damaged_amount < 0 then
    raise exception 'invalid_damaged_amount' using errcode = 'P0001';
  end if;

  select * into v_copy
  from public.copies
  where barcode = trim(p_copy_barcode)
  for update;

  if not found then
    raise exception 'copy_not_found' using errcode = 'P0001';
  end if;

  select * into v_loan
  from public.loans
  where copy_id = v_copy.id
    and status = 'active'
  for update;

  if not found then
    raise exception 'loan_not_found' using errcode = 'P0001';
  end if;

  select * into v_settings
  from public.app_settings
  where id = true
  for share;

  if not found then
    raise exception 'app_settings_missing' using errcode = 'P0001';
  end if;

  -- Fine projection from the same view the UI showed (ADR-0002). No row here
  -- means the loan is not overdue; projected_fine 0 means nothing is owed.
  select * into v_overdue
  from public.overdue_loans
  where loan_id = v_loan.id;

  -- ok + damaged: a late check-in owes the overdue fine (damaged stacks it with
  -- the damage fine; lost replaces it below — replacement cost, not late days).
  if p_condition in ('ok', 'damaged')
     and v_overdue.loan_id is not null
     and v_overdue.projected_fine > 0
  then
    insert into public.fines (member_id, loan_id, amount, reason, accrual_rule_snapshot)
    values (
      v_loan.member_id,
      v_loan.id,
      v_overdue.projected_fine,
      'overdue',
      jsonb_build_object(
        'fine_rate_per_day', v_overdue.fine_rate_per_day,
        'days_late', v_overdue.days_late,
        'timezone', v_settings.timezone,
        'computed_at', now()
      )
    )
    returning id into v_fine_id;

    v_fine_ids := array_append(v_fine_ids, v_fine_id);
  end if;

  if p_condition = 'damaged' then
    v_damage_amount := coalesce(p_damaged_amount, v_settings.damaged_fee_default);
    v_damage_overridden :=
      p_damaged_amount is not null and p_damaged_amount <> v_settings.damaged_fee_default;

    insert into public.fines (member_id, loan_id, amount, reason, accrual_rule_snapshot)
    values (
      v_loan.member_id,
      v_loan.id,
      v_damage_amount,
      'damaged',
      jsonb_build_object(
        'damaged_fee_default', v_settings.damaged_fee_default,
        'charged_amount', v_damage_amount,
        'overridden', v_damage_overridden
      )
    )
    returning id into v_fine_id;

    v_fine_ids := array_append(v_fine_ids, v_fine_id);
    v_new_status := 'damaged';
  elsif p_condition = 'lost' then
    select * into v_title
    from public.titles
    where id = v_copy.title_id;

    v_lost_basis := case
      when v_title.replacement_cost is not null then 'replacement_cost'
      else 'lost_fee_default'
    end;
    v_lost_amount := coalesce(v_title.replacement_cost, v_settings.lost_fee_default);

    insert into public.fines (member_id, loan_id, amount, reason, accrual_rule_snapshot)
    values (
      v_loan.member_id,
      v_loan.id,
      v_lost_amount,
      'lost',
      jsonb_build_object(
        'basis', v_lost_basis,
        'replacement_cost', v_title.replacement_cost,
        'lost_fee_default', v_settings.lost_fee_default
      )
    )
    returning id into v_fine_id;

    v_fine_ids := array_append(v_fine_ids, v_fine_id);
    v_new_status := 'lost';
  else
    -- ok: hold fill lands with the Holds slice; until then the copy is shelved.
    v_new_status := 'available';
  end if;

  update public.loans
  set status = 'returned',
      returned_at = now()
  where id = v_loan.id
  returning * into v_loan;

  update public.copies
  set status = v_new_status
  where id = v_copy.id
  returning * into v_copy;

  -- Result payload, in the order the fines were created (v_fine_ids order).
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'member_id', f.member_id,
      'loan_id', f.loan_id,
      'reason', f.reason,
      'amount', f.amount,
      'status', f.status,
      'accrual_rule_snapshot', f.accrual_rule_snapshot,
      'created_at', f.created_at
    )
    order by u.ord
  ), '[]'::jsonb)
  into v_fines
  from unnest(v_fine_ids) with ordinality as u(id, ord)
  join public.fines f on f.id = u.id;

  v_detail := jsonb_build_object(
    'member_id', v_loan.member_id,
    'copy_id', v_copy.id,
    'barcode', v_copy.barcode,
    'condition', p_condition,
    'days_late', v_overdue.days_late,
    'fine_ids', to_jsonb(v_fine_ids)
  );

  if p_condition = 'damaged' then
    -- Who charged what, and that it deviated from the default.
    v_detail := v_detail || jsonb_build_object(
      'damaged_fee_default', v_settings.damaged_fee_default,
      'damaged_amount', v_damage_amount,
      'damaged_overridden', v_damage_overridden
    );
  end if;

  insert into public.audit_log (actor, action, entity_type, entity_id, detail)
  values (v_actor, 'loan.checkin', 'loan', v_loan.id, v_detail);

  return jsonb_build_object(
    'loan', to_jsonb(v_loan),
    'copy_id', v_copy.id,
    'barcode', v_copy.barcode,
    'copy_status', v_copy.status,
    'condition', p_condition,
    'days_late', v_overdue.days_late,
    'fines', v_fines
  );
end;
$$;

revoke all on function public.checkin(text, text, numeric) from public;
grant execute on function public.checkin(text, text, numeric) to authenticated;

comment on function public.checkin(text, text, numeric) is
  'Check in a copy: finalize fines at current rate (ok/damaged/lost branches), close the loan, audit.';
