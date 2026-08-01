-- Hold queue and staff notifications. All flow-critical writes are RPC-only.

create type public.hold_status as enum (
  'waiting',
  'ready',
  'fulfilled',
  'cancelled',
  'expired'
);

create table public.holds (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete restrict,
  queue_position integer not null check (queue_position > 0),
  status public.hold_status not null default 'waiting',
  copy_id uuid references public.copies (id) on delete set null,
  ready_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint holds_ready_fields check (
    (
      status = 'ready'
      and copy_id is not null
      and ready_at is not null
      and expires_at is not null
    )
    or status <> 'ready'
  )
);

create unique index holds_one_active_member_title_idx
  on public.holds (member_id, title_id)
  where status in ('waiting', 'ready');

create unique index holds_active_title_position_idx
  on public.holds (title_id, queue_position)
  where status in ('waiting', 'ready');

create index holds_queue_idx
  on public.holds (title_id, queue_position)
  where status in ('waiting', 'ready');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('hold_ready', 'overdue', 'payment_recorded')),
  entity_type text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_created_at_idx
  on public.notifications (created_at desc);

alter table public.holds enable row level security;
alter table public.notifications enable row level security;

grant usage on type public.hold_status to authenticated;

revoke all on table public.holds from anon, authenticated;
grant select on table public.holds to authenticated;
grant select, insert, update, delete on table public.holds to service_role;

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant select, insert, update, delete on table public.notifications to service_role;

create policy holds_select_authenticated
  on public.holds
  for select
  to authenticated
  using (true);

create policy notifications_select_authenticated
  on public.notifications
  for select
  to authenticated
  using (true);

create or replace function public.place_hold(
  p_member_id uuid,
  p_title_id uuid
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
  v_member public.members;
  v_position integer;
  v_hold public.holds;
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

  if exists (
    select 1
    from public.holds
    where member_id = p_member_id
      and title_id = p_title_id
      and status in ('waiting', 'ready')
  ) then
    raise exception 'hold_already_active' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.loans
    join public.copies on copies.id = loans.copy_id
    where loans.member_id = p_member_id
      and loans.status = 'active'
      and copies.title_id = p_title_id
  ) then
    raise exception 'member_has_title_on_loan' using errcode = 'P0001';
  end if;

  select coalesce(max(queue_position), 0) + 1
  into v_position
  from public.holds
  where title_id = p_title_id
    and status in ('waiting', 'ready');

  insert into public.holds (title_id, member_id, queue_position)
  values (p_title_id, p_member_id, v_position)
  returning * into v_hold;

  return v_hold;
end;
$$;

revoke all on function public.place_hold(uuid, uuid) from public;
grant execute on function public.place_hold(uuid, uuid) to authenticated;

create or replace function public.cancel_hold(
  p_hold_id uuid
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
  v_hold public.holds;
  v_queue_offset integer;
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

  select * into v_hold
  from public.holds
  where id = p_hold_id;

  if not found then
    raise exception 'hold_not_found' using errcode = 'P0001';
  end if;

  select * into v_title
  from public.titles
  where id = v_hold.title_id
  for update;

  if not found then
    raise exception 'title_not_found' using errcode = 'P0001';
  end if;

  select * into v_hold
  from public.holds
  where id = p_hold_id
  for update;

  if not found then
    raise exception 'hold_not_found' using errcode = 'P0001';
  end if;

  if v_hold.status = 'ready' and v_hold.copy_id is not null then
    update public.copies
    set status = 'available'
    where id = v_hold.copy_id;
  end if;

  update public.holds
  set status = 'cancelled'
  where id = p_hold_id
  returning * into v_hold;

  -- Move every active position above the current range first. Final positions
  -- are then unoccupied regardless of UPDATE execution order.
  select coalesce(max(queue_position), 0)
  into v_queue_offset
  from public.holds
  where title_id = v_hold.title_id
    and status in ('waiting', 'ready');

  update public.holds
  set queue_position = queue_position + v_queue_offset
  where title_id = v_hold.title_id
    and status in ('waiting', 'ready');

  with active_positions as (
    select
      id,
      row_number() over (order by queue_position, created_at, id)::integer
        as new_position
    from public.holds
    where title_id = v_hold.title_id
      and status in ('waiting', 'ready')
  )
  update public.holds
  set queue_position = active_positions.new_position
  from active_positions
  where holds.id = active_positions.id
    and holds.queue_position <> active_positions.new_position;

  return v_hold;
end;
$$;

revoke all on function public.cancel_hold(uuid) from public;
grant execute on function public.cancel_hold(uuid) to authenticated;

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

  select member_types.hold_expiry_days into v_expiry_days
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

  return v_hold;
end;
$$;

revoke all on function public.mark_ready(uuid, text) from public;
grant execute on function public.mark_ready(uuid, text) to authenticated;
