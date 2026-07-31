-- Members slice: member_types, members, audit_log, set_member_status, log_audit.
-- status on members is RPC-only (column grants exclude it). audit_log is append-only
-- via SECURITY DEFINER helpers; actor is always derived from auth.uid().

create type public.member_status as enum ('active', 'suspended', 'blocked');

create table public.member_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  loan_period_days integer not null check (loan_period_days > 0),
  renewal_limit integer not null check (renewal_limit >= 0),
  borrow_cap integer not null check (borrow_cap > 0),
  fine_rate_per_day numeric(10, 2) not null check (fine_rate_per_day >= 0),
  hold_expiry_days integer not null check (hold_expiry_days > 0),
  created_at timestamptz not null default now()
);

comment on table public.member_types is 'Per-type lending rules; editable later in Settings.';

create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  member_type_id uuid not null references public.member_types (id),
  email text,
  phone text,
  avatar_url text,
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  card_barcode text not null,
  created_at timestamptz not null default now(),
  constraint members_card_barcode_unique unique (card_barcode),
  constraint members_card_barcode_prefix check (card_barcode ~ '^MBR-')
);

comment on table public.members is 'Library members; status changes only via set_member_status.';
comment on column public.members.status is 'RPC-only — excluded from INSERT/UPDATE grants.';
comment on column public.members.card_barcode is 'Unique scan id; must start with MBR-.';
comment on column public.members.email is 'Nullable and not unique — families may share an address.';

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is 'Append-only history; inserts only via SECURITY DEFINER RPCs.';

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index members_name_idx on public.members (name);
create index members_status_idx on public.members (status);

alter table public.member_types enable row level security;
alter table public.members enable row level security;
alter table public.audit_log enable row level security;

grant usage on type public.member_status to authenticated;

-- member_types: readable by staff; writes are admin (Settings slice). Seed uses service_role.
revoke all on table public.member_types from anon, authenticated;
grant select on table public.member_types to authenticated;
grant select, insert, update, delete on table public.member_types to service_role;

create policy member_types_select_authenticated
  on public.member_types
  for select
  to authenticated
  using (true);

-- members: staff INSERT/UPDATE under RLS; no DELETE; status excluded from both grants.
revoke all on table public.members from anon, authenticated;
grant select on table public.members to authenticated;
grant insert (name, member_type_id, email, phone, avatar_url, joined_at, card_barcode)
  on table public.members to authenticated;
grant update (name, member_type_id, email, phone, avatar_url, joined_at, card_barcode)
  on table public.members to authenticated;
grant select, insert, update, delete on table public.members to service_role;

create policy members_select_authenticated
  on public.members
  for select
  to authenticated
  using (true);

create policy members_insert_authenticated
  on public.members
  for insert
  to authenticated
  with check (true);

create policy members_update_authenticated
  on public.members
  for update
  to authenticated
  using (true)
  with check (true);

-- audit_log: readable by authenticated (Audit viewer is admin-gated in the app);
-- no direct writes for anyone except service_role / definer functions.
revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to authenticated;
grant select, insert, update, delete on table public.audit_log to service_role;

create policy audit_log_select_authenticated
  on public.audit_log
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- log_audit: client-side simple edits. Actor from auth.uid(); action allowlist.
-- ---------------------------------------------------------------------------
create or replace function public.log_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_detail jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_action not in (
    'member.create',
    'member.update',
    'title.create',
    'title.update',
    'copy.create',
    'copy.update'
  ) then
    raise exception 'audit_action_not_allowed:%', p_action using errcode = 'P0001';
  end if;

  if p_entity_type is null or length(trim(p_entity_type)) = 0 then
    raise exception 'audit_entity_type_required' using errcode = 'P0001';
  end if;

  if p_entity_id is null then
    raise exception 'audit_entity_id_required' using errcode = 'P0001';
  end if;

  insert into public.audit_log (actor, action, entity_type, entity_id, detail)
  values (v_actor, p_action, p_entity_type, p_entity_id, coalesce(p_detail, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_audit(text, text, uuid, jsonb) from public;
grant execute on function public.log_audit(text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- set_member_status: sole write path to members.status. Audited in-transaction.
-- suspend/lift = staff; block/unblock asserts admin.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_status(
  p_member_id uuid,
  p_status public.member_status
)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.profile_role;
  v_before public.member_status;
  v_row public.members;
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

  select status into v_before
  from public.members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  if v_before = p_status then
    select * into v_row from public.members where id = p_member_id;
    return v_row;
  end if;

  -- Entering or leaving blocked, or any non suspend/lift, requires admin.
  if v_role <> 'admin' then
    if p_status = 'blocked' or v_before = 'blocked' then
      raise exception 'admin_required' using errcode = 'P0001';
    end if;
    if p_status not in ('active', 'suspended') then
      raise exception 'admin_required' using errcode = 'P0001';
    end if;
  end if;

  update public.members
  set status = p_status
  where id = p_member_id
  returning * into v_row;

  insert into public.audit_log (actor, action, entity_type, entity_id, detail)
  values (
    v_actor,
    'member.status',
    'member',
    p_member_id,
    jsonb_build_object('from', v_before, 'to', p_status)
  );

  return v_row;
end;
$$;

revoke all on function public.set_member_status(uuid, public.member_status) from public;
grant execute on function public.set_member_status(uuid, public.member_status) to authenticated;

-- Default lending rules (Settings can edit later). Fixed UUIDs keep seeds stable.
insert into public.member_types (
  id, name, loan_period_days, renewal_limit, borrow_cap, fine_rate_per_day, hold_expiry_days
) values
  (
    '11111111-1111-1111-1111-111111111101',
    'Adult',
    21,
    2,
    10,
    0.25,
    7
  ),
  (
    '11111111-1111-1111-1111-111111111102',
    'Student',
    14,
    1,
    5,
    0.10,
    5
  ),
  (
    '11111111-1111-1111-1111-111111111103',
    'Senior',
    28,
    3,
    12,
    0.15,
    7
  );
