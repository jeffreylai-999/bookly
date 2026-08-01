-- Checkout fulfills a member's active hold for the checked-out title.
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
  v_own_ready_hold public.holds;
  v_active_hold public.holds;
  v_loan public.loans;
  v_due_at timestamptz;
  v_seen text[] := array[]::text[];
  v_loan_ids uuid[] := array[]::uuid[];
  v_copy_ids uuid[] := array[]::uuid[];
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

    select * into v_own_ready_hold
    from public.holds
    where copy_id = v_copy.id
      and member_id = p_member_id
      and status = 'ready'
    for update;

    if v_copy.status = 'on_hold_shelf' and not found then
      raise exception 'copy_on_hold_shelf' using errcode = 'P0001';
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

    select * into v_active_hold
    from public.holds
    where title_id = v_copy.title_id
      and member_id = p_member_id
      and status in ('waiting', 'ready')
    for update;

    if found then
      update public.holds
      set status = 'fulfilled'
      where id = v_active_hold.id;

      if v_active_hold.copy_id is not null
        and v_active_hold.copy_id <> v_copy.id then
        update public.copies
        set status = 'available'
        where id = v_active_hold.copy_id;
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
      'due_at', v_due_at
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
