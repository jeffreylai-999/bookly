-- Hold shelf lifecycle: fill-hold at check-in, shelf-copy release with
-- promotion, and lazy expiry of stale ready holds at checkout.
--
-- promote_waiting_hold is the shared promotion primitive: the queue head for
-- the title is readied onto the freed copy (notification included), or the
-- copy shelves itself when the queue is empty. Promotion ignores member
-- status — suspension blocks checkout, not queue standing.

create or replace function public.promote_waiting_hold(
  p_title_id uuid,
  p_copy_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_copy public.copies;
  v_hold public.holds;
  v_expiry_days integer;
  v_ready_at timestamptz := now();
begin
  select * into v_copy
  from public.copies
  where id = p_copy_id
  for update;

  if not found then
    raise exception 'copy_not_found' using errcode = 'P0001';
  end if;

  -- Queue order is enforced, not advisory: the lowest waiting position wins,
  -- and callers never pass a hold id.
  select * into v_hold
  from public.holds
  where title_id = p_title_id
    and status = 'waiting'
  order by queue_position
  limit 1
  for update;

  if not found then
    update public.copies
    set status = 'available'
    where id = p_copy_id;
    return null;
  end if;

  select member_types.hold_expiry_days into v_expiry_days
  from public.members
  join public.member_types on member_types.id = members.member_type_id
  where members.id = v_hold.member_id;

  update public.holds
  set
    status = 'ready',
    copy_id = p_copy_id,
    ready_at = v_ready_at,
    expires_at = v_ready_at + make_interval(days => v_expiry_days)
  where id = v_hold.id
  returning * into v_hold;

  update public.copies
  set status = 'on_hold_shelf'
  where id = p_copy_id;

  insert into public.notifications (type, entity_type, entity_id, detail)
  values (
    'hold_ready',
    'hold',
    v_hold.id,
    jsonb_build_object(
      'member_id', v_hold.member_id,
      'title_id', v_hold.title_id,
      'copy_id', v_copy.id,
      'copy_barcode', v_copy.barcode,
      'expires_at', v_hold.expires_at
    )
  );

  return v_hold.id;
end;
$$;

-- Internal helper: callable only from the definer RPCs, never from a JWT.
revoke all on function public.promote_waiting_hold(uuid, uuid) from public;

comment on function public.promote_waiting_hold(uuid, uuid) is
  'Ready the queue head onto a freed copy (or shelve it when the queue is empty); notification included. Internal.';

-- ---------------------------------------------------------------------------
-- checkin gains p_fill_hold: the staff "fill hold" choice is an explicit
-- parameter, reachable only on an ok return. The title row is locked ahead of
-- the copy row, matching the title -> copy order of the other hold RPCs.
-- ---------------------------------------------------------------------------

drop function public.checkin(text, text, numeric);

create or replace function public.checkin(
  p_copy_barcode text,
  p_condition text,
  p_damaged_amount numeric default null,
  p_fill_hold boolean default false
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
  v_hold_id uuid;
  v_hold jsonb;
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

  -- Fill-hold is a branch of the ok return only; damaged/lost end the flow.
  if coalesce(p_fill_hold, false) and p_condition <> 'ok' then
    raise exception 'fill_hold_requires_ok' using errcode = 'P0001';
  end if;

  -- Resolve the copy without a lock first so the title row can be locked
  -- ahead of the copy row — the same title -> copy order checkout,
  -- place_hold, cancel_hold, and mark_ready already follow.
  select * into v_copy
  from public.copies
  where barcode = trim(p_copy_barcode);

  if not found then
    raise exception 'copy_not_found' using errcode = 'P0001';
  end if;

  perform 1
  from public.titles
  where id = v_copy.title_id
  for update;

  select * into v_copy
  from public.copies
  where id = v_copy.id
  for update;

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
  elsif coalesce(p_fill_hold, false) then
    -- ok + fill hold: the queue head is promoted onto this copy (copy status
    -- included), or the copy shelves itself when the queue emptied meanwhile.
    v_hold_id := public.promote_waiting_hold(v_copy.title_id, v_copy.id);
    v_new_status := case
      when v_hold_id is null then 'available'::public.copy_status
      else 'on_hold_shelf'::public.copy_status
    end;
  else
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

  if v_hold_id is not null then
    select jsonb_build_object(
      'id', h.id,
      'member_id', h.member_id,
      'member_name', m.name,
      'copy_barcode', v_copy.barcode,
      'expires_at', h.expires_at
    )
    into v_hold
    from public.holds h
    join public.members m on m.id = h.member_id
    where h.id = v_hold_id;
  end if;

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
    'fine_ids', to_jsonb(v_fine_ids),
    'fill_hold', coalesce(p_fill_hold, false),
    'hold_id', v_hold_id
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
    'fines', v_fines,
    'hold', v_hold
  );
end;
$$;

revoke all on function public.checkin(text, text, numeric, boolean) from public;
grant execute on function public.checkin(text, text, numeric, boolean) to authenticated;

comment on function public.checkin(text, text, numeric, boolean) is
  'Check in a copy: finalize fines at current rate (ok/damaged/lost branches), fill the hold queue on ok when asked, close the loan, audit.';

-- ---------------------------------------------------------------------------
-- checkout: lazy expiry + promotion on release.
--   - A ready hold past expires_at is treated as expired at the desk, so a
--     stale shelf copy never blocks a same-day checkout.
--   - Auto-resolving the member's own hold releases its shelf copy to the
--     next waiting hold (or back to available), not blindly to available.
-- ---------------------------------------------------------------------------

create or replace function public.checkout(
  p_member_id uuid,
  p_copy_barcodes text[]
)
returns setof public.loans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.profile_role;
  v_member public.members;
  v_type public.member_types;
  v_settings public.app_settings;
  v_outstanding numeric(12, 2);
  v_active_count integer;
  v_barcode text;
  v_copy public.copies;
  v_shelf_hold public.holds;
  v_shelf_found boolean;
  v_shelf_expired boolean;
  v_active_hold public.holds;
  v_loan public.loans;
  v_due_at timestamptz;
  v_seen text[] := array[]::text[];
  v_loan_ids uuid[] := array[]::uuid[];
  v_copy_ids uuid[] := array[]::uuid[];
  v_fulfilled_hold_ids uuid[] := array[]::uuid[];
  v_expired_hold_ids uuid[] := array[]::uuid[];
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

  if p_copy_barcodes is null or cardinality(p_copy_barcodes) = 0 then
    raise exception 'copies_required' using errcode = 'P0001';
  end if;

  -- Checkout mutates the hold queue, so it must join the same title-row lock
  -- discipline as place_hold/cancel_hold/mark_ready. Taking it here, ahead of
  -- the member and copy rows, puts every queue mutation on one
  -- title -> member -> copy -> hold order. Distinct titles are locked in id
  -- order so two concurrent multi-title batches cannot deadlock on each other.
  perform 1
  from public.titles t
  where t.id in (
    select c.title_id
    from public.copies c
    where c.barcode in (
      select trim(b)
      from unnest(p_copy_barcodes) as b
      where trim(b) <> ''
    )
  )
  order by t.id
  for update;

  select * into v_member
  from public.members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  if v_member.status = 'suspended' then
    raise exception 'member_suspended' using errcode = 'P0001';
  end if;

  if v_member.status = 'blocked' then
    raise exception 'member_blocked' using errcode = 'P0001';
  end if;

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

  select coalesce(sum(f.amount - f.amount_paid), 0) into v_outstanding
  from public.fines f
  where f.member_id = p_member_id
    and f.status in ('outstanding', 'partial');

  -- Zero outstanding never blocks. Threshold 0 means "any positive balance blocks".
  if v_outstanding > 0 and v_outstanding >= v_settings.fine_block_threshold then
    raise exception 'member_fine_blocked' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_active_count
  from public.loans
  where member_id = p_member_id
    and status = 'active';

  -- Cap counts distinct non-empty barcodes so duplicates/blanks hit their own
  -- typed errors in the loop instead of preempting as member_borrow_cap.
  if v_active_count + (
    select count(distinct trim(b))::integer
    from unnest(p_copy_barcodes) as b
    where trim(b) <> ''
  ) > v_type.borrow_cap then
    raise exception 'member_borrow_cap' using errcode = 'P0001';
  end if;

  v_due_at := now() + make_interval(days => v_type.loan_period_days);

  foreach v_barcode in array p_copy_barcodes
  loop
    v_barcode := trim(v_barcode);

    if v_barcode = '' then
      raise exception 'copy_not_found' using errcode = 'P0001';
    end if;

    if v_barcode = any (v_seen) then
      raise exception 'duplicate_barcode' using errcode = 'P0001';
    end if;
    v_seen := array_append(v_seen, v_barcode);

    select * into v_copy
    from public.copies
    where barcode = v_barcode
    for update;

    if not found then
      raise exception 'copy_not_found' using errcode = 'P0001';
    end if;

    -- The ready hold tying this shelf copy to a member, if any. A stale one
    -- is lazily expired here — the desk fallback for the up-to-a-day cron
    -- lag — so it never blocks a same-day checkout.
    -- FOUND is captured at once: the UPDATE/INSERT statements below reset it.
    select * into v_shelf_hold
    from public.holds
    where copy_id = v_copy.id
      and status = 'ready'
    for update;

    v_shelf_found := found;
    v_shelf_expired := false;
    if v_shelf_found and v_shelf_hold.expires_at <= now() then
      update public.holds
      set status = 'expired'
      where id = v_shelf_hold.id;

      insert into public.audit_log (actor, action, entity_type, entity_id, detail)
      values (
        v_actor,
        'hold.expire',
        'hold',
        v_shelf_hold.id,
        jsonb_build_object(
          'member_id', v_shelf_hold.member_id,
          'title_id', v_shelf_hold.title_id,
          'copy_id', v_shelf_hold.copy_id,
          'lazy', true
        )
      );

      v_expired_hold_ids := array_append(v_expired_hold_ids, v_shelf_hold.id);
      v_shelf_expired := true;
    end if;

    if v_copy.status = 'on_hold_shelf' and not v_shelf_expired then
      if not v_shelf_found or v_shelf_hold.member_id <> p_member_id then
        raise exception 'copy_on_hold_shelf' using errcode = 'P0001';
      end if;
    end if;

    case v_copy.status
      when 'available', 'on_hold_shelf' then
        null;
      when 'on_loan' then
        raise exception 'copy_on_loan' using errcode = 'P0001';
      when 'lost' then
        raise exception 'copy_lost' using errcode = 'P0001';
      when 'damaged' then
        raise exception 'copy_damaged' using errcode = 'P0001';
      when 'retired' then
        raise exception 'copy_retired' using errcode = 'P0001';
      else
        raise exception 'copy_unavailable' using errcode = 'P0001';
    end case;

    insert into public.loans (
      copy_id, member_id, checked_out_by, due_at, status
    ) values (
      v_copy.id, p_member_id, v_actor, v_due_at, 'active'
    )
    returning * into v_loan;

    update public.copies
    set status = 'on_loan'
    where id = v_copy.id;

    -- Auto-resolve the member's own hold on the title: getting the title is
    -- fulfillment, ready or not. A ready hold's shelf copy is released to the
    -- queue in the same transaction. An already-stale ready hold expires
    -- instead of fulfilling.
    select * into v_active_hold
    from public.holds
    where title_id = v_copy.title_id
      and member_id = p_member_id
      and status in ('waiting', 'ready')
    for update;

    if found then
      if v_active_hold.status = 'ready' and v_active_hold.expires_at <= now() then
        update public.holds
        set status = 'expired'
        where id = v_active_hold.id;

        insert into public.audit_log (actor, action, entity_type, entity_id, detail)
        values (
          v_actor,
          'hold.expire',
          'hold',
          v_active_hold.id,
          jsonb_build_object(
            'member_id', v_active_hold.member_id,
            'title_id', v_active_hold.title_id,
            'copy_id', v_active_hold.copy_id,
            'lazy', true
          )
        );

        v_expired_hold_ids := array_append(v_expired_hold_ids, v_active_hold.id);

        if v_active_hold.copy_id is not null
          and v_active_hold.copy_id <> v_copy.id then
          perform public.promote_waiting_hold(v_copy.title_id, v_active_hold.copy_id);
        end if;
      else
        update public.holds
        set status = 'fulfilled'
        where id = v_active_hold.id;

        v_fulfilled_hold_ids := array_append(v_fulfilled_hold_ids, v_active_hold.id);

        if v_active_hold.copy_id is not null
          and v_active_hold.copy_id <> v_copy.id then
          perform public.promote_waiting_hold(v_copy.title_id, v_active_hold.copy_id);
        end if;
      end if;
    end if;

    v_loan_ids := array_append(v_loan_ids, v_loan.id);
    v_copy_ids := array_append(v_copy_ids, v_copy.id);
  end loop;

  insert into public.audit_log (actor, action, entity_type, entity_id, detail)
  values (
    v_actor,
    'loan.checkout',
    'loan',
    v_loan_ids[1],
    jsonb_build_object(
      'member_id', p_member_id,
      'copy_ids', to_jsonb(v_copy_ids),
      'barcodes', to_jsonb(v_seen),
      'loan_ids', to_jsonb(v_loan_ids),
      'due_at', v_due_at,
      'fulfilled_hold_ids', to_jsonb(v_fulfilled_hold_ids),
      'expired_hold_ids', to_jsonb(v_expired_hold_ids)
    )
  );

  return query
  select *
  from public.loans
  where id = any (v_loan_ids)
  order by checked_out_at;
end;
$$;

revoke all on function public.checkout(uuid, text[]) from public;
grant execute on function public.checkout(uuid, text[]) to authenticated;
