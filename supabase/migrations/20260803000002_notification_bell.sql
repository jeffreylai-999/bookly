-- Notification bell: Realtime + shared mark-read + localizable detail.
--
-- Realtime: the bell subscribes to INSERT on this table (spec §5). Tables are
-- not part of any publication by default, so `notifications` is added to the
-- fixed `supabase_realtime` publication Realtime listens on (local + hosted).
--
-- Mark-read: notifications insert/delete stayed revoked from `authenticated`
-- at table creation (ADR-0001) — this migration adds the one UPDATE path the
-- desk needs. Column-level GRANT UPDATE (read_at) means an UPDATE naming any
-- other column is rejected before RLS even runs; the RLS policy itself is
-- `using (true)` because read state is shared across the whole desk team, not
-- per-staff (spec: "shared read state — acceptable for a small desk team").
grant update (read_at) on table public.notifications to authenticated;

create policy notifications_update_read_at
  on public.notifications
  for update
  to authenticated
  using (true)
  with check (true);

alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- Messages carry data, not text (spec §10): the bell renders localized copy
-- client-side from `type` + `detail`, so every notification needs the names
-- to fill in, not just ids. promote_waiting_hold, mark_ready, and
-- record_payment are amended below to add `member_name` / `title` alongside
-- the existing ids — behaviour (gates, audit, the notify_on_hold_ready
-- setting toggle) is unchanged.
-- ---------------------------------------------------------------------------

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
  v_member_name text;
  v_title_title text;
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

  select member_types.hold_expiry_days, members.name
  into v_expiry_days, v_member_name
  from public.members
  join public.member_types on member_types.id = members.member_type_id
  where members.id = v_hold.member_id;

  select title into v_title_title
  from public.titles
  where id = p_title_id;

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
      'member_name', v_member_name,
      'title_id', v_hold.title_id,
      'title', v_title_title,
      'copy_id', v_copy.id,
      'copy_barcode', v_copy.barcode,
      'expires_at', v_hold.expires_at
    )
  );

  return v_hold.id;
end;
$$;

comment on function public.promote_waiting_hold(uuid, uuid) is
  'Ready the queue head onto a freed copy (or shelve it when the queue is empty); notification includes member/title names for the bell. Internal.';

create or replace function public.mark_ready(
  p_title_id uuid,
  p_copy_barcode text
)
returns public.holds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.profile_role;
  v_title public.titles;
  v_copy public.copies;
  v_hold public.holds;
  v_settings public.app_settings;
  v_member_name text;
  v_expiry_days integer;
  v_ready_at timestamptz := now();
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select role into v_role
  from public.profiles
  where id = v_actor;

  if not found then
    raise exception 'profile_missing' using errcode = 'P0001';
  end if;

  select * into v_title
  from public.titles
  where id = p_title_id
  for update;

  if not found then
    raise exception 'title_not_found' using errcode = 'P0001';
  end if;

  select * into v_copy
  from public.copies
  where barcode = p_copy_barcode
    and title_id = p_title_id
  for update;

  if not found then
    raise exception 'copy_not_found' using errcode = 'P0001';
  end if;

  if v_copy.status <> 'available' then
    raise exception 'copy_not_available' using errcode = 'P0001';
  end if;

  select * into v_hold
  from public.holds
  where title_id = p_title_id
    and status = 'waiting'
  order by queue_position
  limit 1
  for update;

  if not found then
    raise exception 'no_waiting_holds' using errcode = 'P0001';
  end if;

  select * into v_settings
  from public.app_settings
  where id = true
  for share;

  if not found then
    raise exception 'app_settings_missing' using errcode = 'P0001';
  end if;

  select member_types.hold_expiry_days, members.name
  into v_expiry_days, v_member_name
  from public.members
  join public.member_types on member_types.id = members.member_type_id
  where members.id = v_hold.member_id;

  update public.holds
  set
    status = 'ready',
    copy_id = v_copy.id,
    ready_at = v_ready_at,
    expires_at = v_ready_at + make_interval(days => v_expiry_days)
  where id = v_hold.id
  returning * into v_hold;

  update public.copies
  set status = 'on_hold_shelf'
  where id = v_copy.id;

  insert into public.audit_log (actor, action, entity_type, entity_id, detail)
  values (
    v_actor,
    'hold.mark_ready',
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

  if v_settings.notify_on_hold_ready then
    insert into public.notifications (type, entity_type, entity_id, detail)
    values (
      'hold_ready',
      'hold',
      v_hold.id,
      jsonb_build_object(
        'member_id', v_hold.member_id,
        'member_name', v_member_name,
        'title_id', v_hold.title_id,
        'title', v_title.title,
        'copy_id', v_copy.id,
        'copy_barcode', v_copy.barcode,
        'expires_at', v_hold.expires_at
      )
    );
  end if;

  return v_hold;
end;
$$;

revoke all on function public.mark_ready(uuid, text) from public;
grant execute on function public.mark_ready(uuid, text) to authenticated;

create or replace function public.record_payment(
  p_fine_id uuid,
  p_amount numeric,
  p_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.profile_role;
  v_fine public.fines;
  v_payment public.payments;
  v_member_name text;
  v_remaining numeric(10, 2);
  v_new_paid numeric(10, 2);
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

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_payment_amount' using errcode = 'P0001';
  end if;

  if p_method is null or length(trim(p_method)) = 0 then
    raise exception 'payment_method_required' using errcode = 'P0001';
  end if;

  select * into v_fine
  from public.fines
  where id = p_fine_id
  for update;

  if not found then
    raise exception 'fine_not_found' using errcode = 'P0001';
  end if;

  if v_fine.status = 'paid' then
    raise exception 'fine_already_paid' using errcode = 'P0001';
  end if;

  if v_fine.status = 'waived' then
    raise exception 'fine_waived' using errcode = 'P0001';
  end if;

  v_remaining := v_fine.amount - v_fine.amount_paid;

  if p_amount > v_remaining then
    raise exception 'payment_exceeds_balance' using errcode = 'P0001';
  end if;

  insert into public.payments (fine_id, amount, method, recorded_by)
  values (p_fine_id, p_amount, trim(p_method), v_actor)
  returning * into v_payment;

  v_new_paid := v_fine.amount_paid + p_amount;

  update public.fines
  set amount_paid = v_new_paid,
      status = case when v_new_paid >= amount then 'paid' else 'partial' end::public.fine_status
  where id = v_fine.id
  returning * into v_fine;

  select name into v_member_name
  from public.members
  where id = v_fine.member_id;

  insert into public.audit_log (actor, action, entity_type, entity_id, detail)
  values (
    v_actor,
    'fine.payment',
    'fine',
    v_fine.id,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'member_id', v_fine.member_id,
      'amount', v_payment.amount,
      'method', v_payment.method,
      'amount_paid', v_fine.amount_paid,
      'status', v_fine.status
    )
  );

  insert into public.notifications (type, entity_type, entity_id, detail)
  values (
    'payment_recorded',
    'payment',
    v_payment.id,
    jsonb_build_object(
      'fine_id', v_fine.id,
      'member_id', v_fine.member_id,
      'member_name', v_member_name,
      'amount', v_payment.amount,
      'method', v_payment.method,
      'remaining', v_fine.amount - v_fine.amount_paid
    )
  );

  return jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'fine', to_jsonb(v_fine)
  );
end;
$$;

revoke all on function public.record_payment(uuid, numeric, text) from public;
grant execute on function public.record_payment(uuid, numeric, text) to authenticated;
grant execute on function public.record_payment(uuid, numeric, text) to service_role;

comment on function public.record_payment(uuid, numeric, text) is
  'Record a full/partial payment; updates amount_paid + status, audits, notifies (bell detail includes the member name).';
