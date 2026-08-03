-- Fines desk slice: payments + record_payment / waive_fine / void_payment RPCs.
-- Flow-critical: authenticated cannot INSERT/UPDATE/DELETE payments (fines were
-- already locked down in the checkout slice); the SECURITY DEFINER RPCs are the
-- only mutation path. See ADR-0001.
--
-- Money rules (spec §6 "Fines / payments"):
--   * full/partial payments move a fine outstanding → partial → paid
--   * waive (admin) forgives the REMAINING balance only — prior payments stand
--   * void (admin) marks a payment voided and RECOMPUTES amount_paid + status
--     from the remaining non-voided payments
--   * money never flows backward: no overpayment, no refund surface
-- The checkout gate needs no change: it already sums amount - amount_paid over
-- outstanding/partial fines, so paying down re-enables checkout automatically.

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  fine_id uuid not null references public.fines (id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  method text not null,
  recorded_by uuid references public.profiles (id) on delete set null,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payments_void_fields_together check (
    (voided_by is null and void_reason is null and voided_at is null)
    or (voided_by is not null and void_reason is not null and voided_at is not null)
  )
);

comment on table public.payments is
  'Money received against a fine. Void = admin reversal; the fine is recomputed from non-voided payments.';
comment on column public.payments.method is
  'Desk-taken tender (cash/card/other); free text, display-only.';

create index payments_fine_id_idx on public.payments (fine_id);

alter table public.payments enable row level security;

revoke all on table public.payments from anon, authenticated;
grant select on table public.payments to authenticated;
grant select, insert, update, delete on table public.payments to service_role;

create policy payments_select_authenticated
  on public.payments
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- record_payment: full or partial payment against one fine. Locks the fine row
-- so two desks taking money on the same fine serialize. Overpayment is rejected
-- (money never flows backward — excess change is a desk procedure, not data).
-- ---------------------------------------------------------------------------
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
  'Record a full/partial payment; updates amount_paid + status, audits, notifies.';

-- ---------------------------------------------------------------------------
-- waive_fine: admin forgives the remaining balance. amount_paid is untouched —
-- prior payments stand (a wrong payment is void_payment's job, not waive's).
-- ---------------------------------------------------------------------------
create or replace function public.waive_fine(
  p_fine_id uuid,
  p_reason text
)
returns public.fines
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.profile_role;
  v_fine public.fines;
  v_forgiven numeric(10, 2);
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

  -- Definer bypasses RLS, so the admin gate is asserted here, in the body.
  if v_role <> 'admin' then
    raise exception 'admin_required' using errcode = 'P0001';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'waive_reason_required' using errcode = 'P0001';
  end if;

  select * into v_fine
  from public.fines
  where id = p_fine_id
  for update;

  if not found then
    raise exception 'fine_not_found' using errcode = 'P0001';
  end if;

  -- A settled fine has no remaining balance to forgive.
  if v_fine.status = 'paid' then
    raise exception 'fine_already_paid' using errcode = 'P0001';
  end if;

  if v_fine.status = 'waived' then
    raise exception 'fine_already_waived' using errcode = 'P0001';
  end if;

  v_forgiven := v_fine.amount - v_fine.amount_paid;

  update public.fines
  set status = 'waived'
  where id = v_fine.id
  returning * into v_fine;

  insert into public.audit_log (actor, action, entity_type, entity_id, detail)
  values (
    v_actor,
    'fine.waive',
    'fine',
    v_fine.id,
    jsonb_build_object(
      'member_id', v_fine.member_id,
      'reason', trim(p_reason),
      'forgiven', v_forgiven,
      'amount_paid', v_fine.amount_paid
    )
  );

  return v_fine;
end;
$$;

revoke all on function public.waive_fine(uuid, text) from public;
grant execute on function public.waive_fine(uuid, text) to authenticated;
grant execute on function public.waive_fine(uuid, text) to service_role;

comment on function public.waive_fine(uuid, text) is
  'Admin: forgive the remaining balance of a fine (reason required, audited).';

-- ---------------------------------------------------------------------------
-- void_payment: admin reverses an erroneous payment record, then recomputes
-- the fine from the remaining non-voided payments. Voiding against a waived
-- fine is rejected — the waive already closed it (void first, waive after).
-- ---------------------------------------------------------------------------
create or replace function public.void_payment(
  p_payment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.profile_role;
  v_payment public.payments;
  v_fine public.fines;
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

  -- Definer bypasses RLS, so the admin gate is asserted here, in the body.
  if v_role <> 'admin' then
    raise exception 'admin_required' using errcode = 'P0001';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'void_reason_required' using errcode = 'P0001';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment_not_found' using errcode = 'P0001';
  end if;

  if v_payment.voided_by is not null then
    raise exception 'payment_already_voided' using errcode = 'P0001';
  end if;

  select * into v_fine
  from public.fines
  where id = v_payment.fine_id
  for update;

  if v_fine.status = 'waived' then
    raise exception 'fine_waived' using errcode = 'P0001';
  end if;

  update public.payments
  set voided_by = v_actor,
      void_reason = trim(p_reason),
      voided_at = now()
  where id = v_payment.id
  returning * into v_payment;

  -- Recompute from what actually stands: non-voided payments only.
  select coalesce(sum(p.amount), 0) into v_new_paid
  from public.payments p
  where p.fine_id = v_fine.id
    and p.voided_by is null;

  update public.fines
  set amount_paid = v_new_paid,
      status = case
        when v_new_paid <= 0 then 'outstanding'
        when v_new_paid >= amount then 'paid'
        else 'partial'
      end::public.fine_status
  where id = v_fine.id
  returning * into v_fine;

  insert into public.audit_log (actor, action, entity_type, entity_id, detail)
  values (
    v_actor,
    'payment.void',
    'payment',
    v_payment.id,
    jsonb_build_object(
      'fine_id', v_fine.id,
      'member_id', v_fine.member_id,
      'amount', v_payment.amount,
      'reason', trim(p_reason),
      'amount_paid', v_fine.amount_paid,
      'status', v_fine.status
    )
  );

  return jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'fine', to_jsonb(v_fine)
  );
end;
$$;

revoke all on function public.void_payment(uuid, text) from public;
grant execute on function public.void_payment(uuid, text) to authenticated;
grant execute on function public.void_payment(uuid, text) to service_role;

comment on function public.void_payment(uuid, text) is
  'Admin: void an erroneous payment (reason required); fine recomputed from non-voided payments.';
