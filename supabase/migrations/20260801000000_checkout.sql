-- Checkout slice: app_settings, fines (balance gate), loans, checkout RPC.
-- Flow-critical: authenticated cannot INSERT/UPDATE/DELETE loans or fines;
-- only SECURITY DEFINER checkout (and later checkin/renew/fine RPCs) mutate them.

-- ---------------------------------------------------------------------------
-- app_settings singleton
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  currency text not null default 'USD',
  timezone text not null default 'America/New_York',
  default_locale text not null default 'en',
  fine_block_threshold numeric(10, 2) not null default 10.00
    check (fine_block_threshold >= 0),
  damaged_fee_default numeric(10, 2) not null default 10.00
    check (damaged_fee_default >= 0),
  lost_fee_default numeric(10, 2) not null default 25.00
    check (lost_fee_default >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is
  'Singleton system rules (currency, timezone, fine block-threshold). Constant PK.';

alter table public.app_settings enable row level security;

revoke all on table public.app_settings from anon, authenticated;
grant select on table public.app_settings to authenticated;
grant select, insert, update, delete on table public.app_settings to service_role;

create policy app_settings_select_authenticated
  on public.app_settings
  for select
  to authenticated
  using (true);

insert into public.app_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- fines (materialized balance for checkout gate; full fine RPCs land later)
-- ---------------------------------------------------------------------------
create type public.fine_status as enum ('outstanding', 'paid', 'partial', 'waived');
create type public.fine_reason as enum ('overdue', 'damaged', 'lost');

create table public.fines (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  loan_id uuid,
  amount numeric(10, 2) not null check (amount >= 0),
  amount_paid numeric(10, 2) not null default 0 check (amount_paid >= 0),
  reason public.fine_reason not null,
  status public.fine_status not null default 'outstanding',
  accrual_rule_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint fines_amount_paid_lte_amount check (amount_paid <= amount)
);

comment on table public.fines is
  'Materialized fines; checkout gates on outstanding balance only.';

create index fines_member_status_idx on public.fines (member_id, status);

alter table public.fines enable row level security;

grant usage on type public.fine_status to authenticated;
grant usage on type public.fine_reason to authenticated;

revoke all on table public.fines from anon, authenticated;
grant select on table public.fines to authenticated;
grant select, insert, update, delete on table public.fines to service_role;

create policy fines_select_authenticated
  on public.fines
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- loans
-- ---------------------------------------------------------------------------
create type public.loan_status as enum ('active', 'returned');

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  copy_id uuid not null references public.copies (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete restrict,
  checked_out_by uuid references public.profiles (id) on delete set null,
  checked_out_at timestamptz not null default now(),
  due_at timestamptz not null,
  returned_at timestamptz,
  renew_count integer not null default 0 check (renew_count >= 0),
  status public.loan_status not null default 'active',
  created_at timestamptz not null default now(),
  constraint loans_returned_requires_timestamp check (
    (status = 'returned' and returned_at is not null)
    or (status = 'active' and returned_at is null)
  )
);

comment on table public.loans is
  'Copy checked out to a member. Overdue is derived (due_at < now), never stored.';
comment on column public.loans.status is 'active | returned only — no overdue enum value.';

-- A copy can never be double-issued.
create unique index loans_one_active_per_copy_idx
  on public.loans (copy_id)
  where (status = 'active');

create index loans_member_status_idx on public.loans (member_id, status);
create index loans_due_at_idx on public.loans (due_at)
  where (status = 'active');

alter table public.loans enable row level security;

grant usage on type public.loan_status to authenticated;

revoke all on table public.loans from anon, authenticated;
grant select on table public.loans to authenticated;
grant select, insert, update, delete on table public.loans to service_role;

create policy loans_select_authenticated
  on public.loans
  for select
  to authenticated
  using (true);

-- Deferred FK: fines.loan_id → loans (fines created before loans in this file).
alter table public.fines
  add constraint fines_loan_id_fkey
  foreign key (loan_id) references public.loans (id) on delete set null;

-- ---------------------------------------------------------------------------
-- checkout RPC
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

  if v_outstanding >= v_settings.fine_block_threshold then
    raise exception 'member_fine_blocked' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_active_count
  from public.loans
  where member_id = p_member_id
    and status = 'active';

  if v_active_count + cardinality(p_copy_barcodes) > v_type.borrow_cap then
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

    case v_copy.status
      when 'available' then
        null; -- walk-up checkout allowed even if title has waiting holds (holds slice later)
      when 'on_hold_shelf' then
        -- Hold ownership / fulfillment lands with the Holds slice; reject for now.
        raise exception 'copy_on_hold_shelf' using errcode = 'P0001';
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

    insert into public.audit_log (actor, action, entity_type, entity_id, detail)
    values (
      v_actor,
      'loan.checkout',
      'loan',
      v_loan.id,
      jsonb_build_object(
        'member_id', p_member_id,
        'copy_id', v_copy.id,
        'barcode', v_barcode,
        'due_at', v_due_at
      )
    );

    v_loan_ids := array_append(v_loan_ids, v_loan.id);
    v_copy_ids := array_append(v_copy_ids, v_copy.id);
  end loop;

  return query
  select *
  from public.loans
  where id = any (v_loan_ids)
  order by checked_out_at;
end;
$$;

revoke all on function public.checkout(uuid, text[]) from public;
grant execute on function public.checkout(uuid, text[]) to authenticated;
