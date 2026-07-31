-- Catalog slice: titles, copies, audit_log, set_copy_status RPC.
-- copies.status is immutable from the client (column grants); status changes
-- go through set_copy_status (SECURITY DEFINER). See ADR-0001.

create type public.copy_status as enum (
  'available',
  'on_loan',
  'on_hold_shelf',
  'lost',
  'damaged',
  'retired'
);

create table public.titles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  genre text not null,
  isbn text,
  description text,
  replacement_cost numeric(10, 2),
  created_at timestamptz not null default now(),
  constraint titles_isbn_unique unique (isbn)
);

comment on table public.titles is 'Bibliographic works; never lent directly — only their copies are.';
comment on column public.titles.isbn is 'Unique when present; null allowed for titles without an ISBN.';

create table public.copies (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles (id) on delete restrict,
  barcode text not null,
  status public.copy_status not null default 'available',
  created_at timestamptz not null default now(),
  constraint copies_barcode_unique unique (barcode),
  constraint copies_barcode_bk_prefix check (barcode ~ '^BK-')
);

comment on table public.copies is 'Physical items of a title; unit of lending and of status.';
comment on column public.copies.status is 'Mutable only via set_copy_status / circulation RPCs — excluded from INSERT/UPDATE grants.';
comment on column public.copies.barcode is 'Scan id; BK- prefix enforced by CHECK (seed + add-forms).';

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is 'Append-only history; rows written only inside SECURITY DEFINER RPCs.';

create index copies_title_id_idx on public.copies (title_id);
create index copies_status_idx on public.copies (status);
create index titles_genre_idx on public.titles (genre);
create index audit_log_created_at_idx on public.audit_log (created_at desc);

alter table public.titles enable row level security;
alter table public.copies enable row level security;
alter table public.audit_log enable row level security;

grant usage on type public.copy_status to authenticated;

-- titles: staff read/write business columns; no DELETE (lifecycle via copies.retired).
-- id / created_at stay server-defaulted — not client-writable.
revoke all on table public.titles from anon, authenticated;
grant select on table public.titles to authenticated;
grant insert (title, author, genre, isbn, description, replacement_cost)
  on table public.titles to authenticated;
grant update (title, author, genre, isbn, description, replacement_cost)
  on table public.titles to authenticated;
grant select, insert, update, delete on table public.titles to service_role;

-- copies: staff may insert title_id + barcode only (status via RPC; id/created_at
-- server-defaulted). Updates limited to barcode — reassigning title_id would
-- silently corrupt availability/history.
revoke all on table public.copies from anon, authenticated;
grant select on table public.copies to authenticated;
grant insert (title_id, barcode) on table public.copies to authenticated;
grant update (barcode) on table public.copies to authenticated;
grant select, insert, update, delete on table public.copies to service_role;

-- audit_log: readable by staff; no direct writes for anyone except service_role
-- (RPCs are SECURITY DEFINER and write as the function owner).
revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to authenticated;
grant select, insert, update, delete on table public.audit_log to service_role;

create policy titles_select_authenticated
  on public.titles
  for select
  to authenticated
  using (true);

create policy titles_insert_authenticated
  on public.titles
  for insert
  to authenticated
  with check (true);

create policy titles_update_authenticated
  on public.titles
  for update
  to authenticated
  using (true)
  with check (true);

create policy copies_select_authenticated
  on public.copies
  for select
  to authenticated
  using (true);

create policy copies_insert_authenticated
  on public.copies
  for insert
  to authenticated
  with check (true);

create policy copies_update_authenticated
  on public.copies
  for update
  to authenticated
  using (true)
  with check (true);

create policy audit_log_select_authenticated
  on public.audit_log
  for select
  to authenticated
  using (true);

-- Add a title and its copies in one transaction. Enforces BK- prefix and
-- ISBN uniqueness (unique constraint). Copies always insert at default available.
create or replace function public.add_title_with_copies(
  p_title text,
  p_author text,
  p_genre text,
  p_isbn text,
  p_description text,
  p_replacement_cost numeric,
  p_barcodes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_title public.titles;
  v_barcode text;
  v_barcodes text[];
  v_copies jsonb := '[]'::jsonb;
  v_copy public.copies;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_title is null or length(trim(p_title)) = 0
     or p_author is null or length(trim(p_author)) = 0
     or p_genre is null or length(trim(p_genre)) = 0 then
    raise exception 'invalid_title_input' using errcode = 'P0001';
  end if;

  if p_barcodes is null or cardinality(p_barcodes) = 0 then
    raise exception 'barcodes_required' using errcode = 'P0001';
  end if;

  -- Trim before validating so leading/trailing space cannot reject a valid BK- code.
  select coalesce(array_agg(trim(b) order by ord), '{}')
  into v_barcodes
  from unnest(p_barcodes) with ordinality as t(b, ord);

  foreach v_barcode in array v_barcodes loop
    if v_barcode is null or v_barcode = '' or v_barcode !~ '^BK-' then
      raise exception 'barcode_invalid' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.titles (title, author, genre, isbn, description, replacement_cost)
  values (
    trim(p_title),
    trim(p_author),
    trim(p_genre),
    nullif(trim(p_isbn), ''),
    nullif(trim(p_description), ''),
    p_replacement_cost
  )
  returning * into v_title;

  foreach v_barcode in array v_barcodes loop
    insert into public.copies (title_id, barcode)
    values (v_title.id, v_barcode)
    returning * into v_copy;

    v_copies := v_copies || jsonb_build_array(jsonb_build_object(
      'id', v_copy.id,
      'barcode', v_copy.barcode,
      'status', v_copy.status
    ));
  end loop;

  insert into public.audit_log (actor, action, entity_type, entity_id, detail)
  values (
    v_actor,
    'title.create',
    'title',
    v_title.id,
    jsonb_build_object(
      'title', v_title.title,
      'author', v_title.author,
      'copy_count', cardinality(v_barcodes)
    )
  );

  return jsonb_build_object(
    'id', v_title.id,
    'title', v_title.title,
    'author', v_title.author,
    'genre', v_title.genre,
    'isbn', v_title.isbn,
    'description', v_title.description,
    'replacement_cost', v_title.replacement_cost,
    'created_at', v_title.created_at,
    'copies', v_copies
  );
end;
$$;

revoke all on function public.add_title_with_copies(text, text, text, text, text, numeric, text[]) from public;
grant execute on function public.add_title_with_copies(text, text, text, text, text, numeric, text[]) to authenticated;
grant execute on function public.add_title_with_copies(text, text, text, text, text, numeric, text[]) to service_role;

comment on function public.add_title_with_copies(text, text, text, text, text, numeric, text[]) is
  'Insert title + copies atomically; barcodes must use BK- prefix; audited.';

-- Catalog status actions outside check-in. Rejects on_loan (fine path is checkin).
-- Retire / un-retire assert admin. Audited in the same transaction.
create or replace function public.set_copy_status(
  p_copy_id uuid,
  p_status public.copy_status
)
returns public.copies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.profile_role;
  v_copy public.copies;
  v_from public.copy_status;
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

  select * into v_copy
  from public.copies
  where id = p_copy_id
  for update;

  if not found then
    raise exception 'copy_not_found' using errcode = 'P0001';
  end if;

  v_from := v_copy.status;

  if v_from = p_status then
    return v_copy;
  end if;

  if v_from = 'on_loan' then
    raise exception 'copy_on_loan' using errcode = 'P0001';
  end if;

  -- Admin-only: retire or leave retired (un-retire → available).
  if p_status = 'retired' or v_from = 'retired' then
    if v_role <> 'admin' then
      raise exception 'admin_required' using errcode = 'P0001';
    end if;
  end if;

  -- Allowed transitions for shelf-audit / repair (staff + admin):
  --   available | on_hold_shelf → lost | damaged | retired
  --   lost | damaged | retired → available (retire gated above)
  -- Circulation statuses on_loan / on_hold_shelf are not set here.
  if p_status in ('on_loan', 'on_hold_shelf')
     or not (
       (v_from in ('available', 'on_hold_shelf') and p_status in ('lost', 'damaged', 'retired'))
       or (v_from in ('lost', 'damaged', 'retired') and p_status = 'available')
     )
  then
    raise exception 'invalid_status_transition' using errcode = 'P0001';
  end if;

  update public.copies
  set status = p_status
  where id = p_copy_id
  returning * into v_copy;

  insert into public.audit_log (actor, action, entity_type, entity_id, detail)
  values (
    v_actor,
    'copy.set_status',
    'copy',
    v_copy.id,
    jsonb_build_object(
      'from', v_from,
      'to', p_status,
      'barcode', v_copy.barcode,
      'title_id', v_copy.title_id
    )
  );

  return v_copy;
end;
$$;

revoke all on function public.set_copy_status(uuid, public.copy_status) from public;
grant execute on function public.set_copy_status(uuid, public.copy_status) to authenticated;
grant execute on function public.set_copy_status(uuid, public.copy_status) to service_role;

comment on function public.set_copy_status(uuid, public.copy_status) is
  'Catalog mark lost/damaged/retire and restore to available; audited; admin for retire.';
