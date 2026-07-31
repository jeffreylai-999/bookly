-- Verifies copies.status cannot be written by the authenticated role, and that
-- set_copy_status enforces on_loan rejection, admin retire, and audit.
-- Run: `pnpm exec supabase db reset` then `pnpm test:sql:copies-status`

begin;

-- Fake auth users: staff + admin.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated', 'catalog-staff@bookly.local',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated', 'catalog-admin@bookly.local',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.profiles (id, full_name, email, role)
values
  ('11111111-1111-1111-1111-111111111111', 'Catalog Staff', 'catalog-staff@bookly.local', 'staff'),
  ('22222222-2222-2222-2222-222222222222', 'Catalog Admin', 'catalog-admin@bookly.local', 'admin');

insert into public.titles (id, title, author, genre, isbn)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Test Title',
  'Test Author',
  'Fiction',
  '9780000000001'
);

-- Service role can set any status for fixtures.
set local role service_role;

insert into public.copies (id, title_id, barcode, status)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BK-TEST-001', 'available'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BK-TEST-002', 'on_loan'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BK-TEST-003', 'available');

-- Act as staff.
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Direct UPDATE of status must be rejected (column grant).
do $$
declare
  raised boolean := false;
begin
  begin
    update public.copies
    set status = 'lost'
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
  exception
    when insufficient_privilege then
      raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege when authenticated updates copies.status';
  end if;
end $$;

-- INSERT cannot smuggle a non-default status (status omitted from INSERT grant).
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.copies (title_id, barcode, status)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BK-TEST-SMUGGLE', 'retired');
  exception
    when insufficient_privilege then
      raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege when authenticated inserts copies.status';
  end if;
end $$;

-- INSERT without status succeeds and defaults to available.
insert into public.copies (title_id, barcode)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BK-TEST-NEW');

do $$
begin
  if not exists (
    select 1 from public.copies
    where barcode = 'BK-TEST-NEW' and status = 'available'
  ) then
    raise exception 'insert without status should default to available';
  end if;
end $$;

-- Non-status barcode update still works.
update public.copies
set barcode = 'BK-TEST-001-REN'
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

-- Direct UPDATE of title_id must be rejected (column grant).
do $$
declare
  raised boolean := false;
begin
  begin
    update public.copies
    set title_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
  exception
    when insufficient_privilege then
      raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege when authenticated updates copies.title_id';
  end if;
end $$;

-- set_copy_status: staff can mark available → lost, and it audits.
do $$
declare
  v_copy public.copies;
begin
  select * into v_copy
  from public.set_copy_status('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'lost');
  if v_copy.status <> 'lost' then
    raise exception 'expected lost after set_copy_status';
  end if;
  if not exists (
    select 1 from public.audit_log
    where action = 'copy.set_status'
      and entity_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
      and actor = '11111111-1111-1111-1111-111111111111'
      and detail->>'from' = 'available'
      and detail->>'to' = 'lost'
  ) then
    raise exception 'expected audit_log row for set_copy_status';
  end if;
end $$;

-- set_copy_status rejects on_loan.
do $$
declare
  raised boolean := false;
begin
  begin
    perform public.set_copy_status('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'lost');
  exception
    when others then
      if sqlerrm like '%copy_on_loan%' then
        raised := true;
      else
        raise;
      end if;
  end;
  if not raised then
    raise exception 'expected copy_on_loan when changing an on_loan copy';
  end if;
end $$;

-- Staff cannot retire.
do $$
declare
  raised boolean := false;
begin
  begin
    perform public.set_copy_status('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'retired');
  exception
    when others then
      if sqlerrm like '%admin_required%' then
        raised := true;
      else
        raise;
      end if;
  end;
  if not raised then
    raise exception 'expected admin_required when staff retires a copy';
  end if;
end $$;

-- Admin can retire.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_copy public.copies;
begin
  select * into v_copy
  from public.set_copy_status('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'retired');
  if v_copy.status <> 'retired' then
    raise exception 'expected retired after admin set_copy_status';
  end if;
end $$;

-- BK- prefix enforced.
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.copies (title_id, barcode)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'NO-PREFIX-1');
  exception
    when check_violation then
      raised := true;
  end;
  if not raised then
    raise exception 'expected check_violation for non-BK- barcode';
  end if;
end $$;

-- ISBN uniqueness.
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.titles (title, author, genre, isbn)
    values ('Dup ISBN', 'Author', 'Fiction', '9780000000001');
  exception
    when unique_violation then
      raised := true;
  end;
  if not raised then
    raise exception 'expected unique_violation for duplicate isbn';
  end if;
end $$;

-- Client cannot set copies.id on insert (column grant).
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.copies (id, title_id, barcode)
    values (
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'BK-TEST-ID'
    );
  exception
    when insufficient_privilege then
      raised := true;
  end;
  if not raised then
    raise exception 'expected insufficient_privilege when authenticated inserts copies.id';
  end if;
end $$;

-- add_title_with_copies trims barcodes before BK- validation.
do $$
declare
  v_payload jsonb;
begin
  select public.add_title_with_copies(
    'Trim Test',
    'Author',
    'Fiction',
    null,
    null,
    null,
    array['  BK-TRIM-001  ']
  ) into v_payload;

  if not exists (
    select 1 from public.copies
    where barcode = 'BK-TRIM-001'
      and title_id = (v_payload->>'id')::uuid
  ) then
    raise exception 'expected trimmed BK-TRIM-001 barcode after add_title_with_copies';
  end if;
end $$;

rollback;
