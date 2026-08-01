-- Settings slice: admin editors for member_types + app_settings.
-- These are simple aggregates, not flow tables (ADR-0001): writes stay direct
-- table writes, admin-gated by RLS policies via public.is_admin(), and audited
-- client-side through log_audit (allowlist extended below).

-- ---------------------------------------------------------------------------
-- app_settings: notification triggers + default report range (spec §4)
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column notify_on_hold_ready boolean not null default true,
  add column notify_on_overdue boolean not null default true,
  add column notify_on_payment boolean not null default true,
  add column default_report_range_days integer not null default 14
    check (default_report_range_days in (7, 14, 30));

comment on column public.app_settings.notify_on_hold_ready is
  'Bell insert gate for hold_ready notifications (read by mark_ready).';
comment on column public.app_settings.notify_on_overdue is
  'Bell insert gate for the daily overdue job (lands with the fines/notifications slice).';
comment on column public.app_settings.notify_on_payment is
  'Bell insert gate for payment_recorded notifications (lands with the fines slice).';
comment on column public.app_settings.default_report_range_days is
  'Initial Reports range selector value (7/14/30).';

-- updated_at is trigger-maintained so the column grant below can exclude it:
-- clients set rules, never bookkeeping columns.
create or replace function public.touch_app_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_settings_touch_updated_at
  before update on public.app_settings
  for each row
  execute function public.touch_app_settings_updated_at();

-- ---------------------------------------------------------------------------
-- member_types: admin-only writes. Column grants exclude id/created_at; the
-- policies gate every write on admin. Delete of an in-use type is stopped by
-- the members.member_type_id FK, so history cannot silently vanish.
-- ---------------------------------------------------------------------------
grant insert (name, loan_period_days, renewal_limit, borrow_cap, fine_rate_per_day, hold_expiry_days)
  on table public.member_types to authenticated;
grant update (name, loan_period_days, renewal_limit, borrow_cap, fine_rate_per_day, hold_expiry_days)
  on table public.member_types to authenticated;
grant delete on table public.member_types to authenticated;

create policy member_types_insert_admin
  on public.member_types
  for insert
  to authenticated
  with check (public.is_admin());

create policy member_types_update_admin
  on public.member_types
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy member_types_delete_admin
  on public.member_types
  for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- app_settings: admin-only UPDATE of the rule columns. authenticated gets no
-- INSERT/DELETE grant at all — the singleton row comes from the checkout
-- migration and the constant-pk check (id must be true) keeps it single even
-- for service_role.
-- ---------------------------------------------------------------------------
grant update (
  currency,
  timezone,
  default_locale,
  fine_block_threshold,
  damaged_fee_default,
  lost_fee_default,
  notify_on_hold_ready,
  notify_on_overdue,
  notify_on_payment,
  default_report_range_days
) on table public.app_settings to authenticated;

create policy app_settings_update_admin
  on public.app_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- log_audit: allowlist the settings codes. These are the client-side audits
-- for the single-table edits above; flow codes stay RPC-written only.
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
    'copy.update',
    'member_type.create',
    'member_type.update',
    'member_type.delete',
    'settings.update'
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
-- mark_ready: gate the hold_ready bell insert on app_settings so the Settings
-- toggle takes effect on the next mark-ready (spec: notification triggers).
-- ---------------------------------------------------------------------------
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

  if v_settings.notify_on_hold_ready then
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
  end if;

  return v_hold;
end;
$$;

revoke all on function public.mark_ready(uuid, text) from public;
grant execute on function public.mark_ready(uuid, text) to authenticated;
