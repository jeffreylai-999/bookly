-- Verifies the hold shelf lifecycle: check-in fill-hold (ok only, queue head
-- only, promotion ignoring member status), checkout fulfilment of the right
-- member's ready hold, rejection of the wrong member, walk-up auto-resolve
-- with shelf-copy release (promote next or available), and lazy expiry of
-- stale ready holds at the desk. Run after `pnpm supabase:start`:
--   pnpm test:sql:holds-lifecycle

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'e1111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'lifecycle-staff@bookly.local',
  crypt('test-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, full_name, email, role)
values (
  'e1111111-1111-1111-1111-111111111111',
  'Lifecycle Staff',
  'lifecycle-staff@bookly.local',
  'staff'
);

-- Adult type (seeded): hold_expiry_days 7.
insert into public.members (id, name, member_type_id, status, card_barcode)
values
  ('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'Head Member', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-LC-1'),
  ('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'Next Member', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-LC-2'),
  ('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03', 'Walkup Member', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-LC-3'),
  ('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04', 'Suspended Head', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-LC-4'),
  ('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05', 'Owner Member', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-LC-5'),
  -- Borrows the check-in fixtures so fines born there never gate later checkouts.
  ('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa06', 'Fixture Borrower', '11111111-1111-1111-1111-111111111101', 'active', 'MBR-LC-6');

insert into public.titles (id, title, author, genre)
values
  ('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'Fill Title', 'Desk Author', 'Fiction'),
  ('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'No Holds Title', 'Desk Author', 'Fiction'),
  ('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03', 'Skip Fill Title', 'Desk Author', 'Fiction'),
  ('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04', 'Suspended Head Title', 'Desk Author', 'Fiction'),
  ('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb05', 'Walkup Title', 'Desk Author', 'Fiction'),
  ('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb06', 'Release Title', 'Desk Author', 'Fiction'),
  ('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb07', 'Lazy Title', 'Desk Author', 'Fiction'),
  ('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb08', 'Owner Lazy Title', 'Desk Author', 'Fiction'),
  ('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb09', 'Waiting Walkup Title', 'Desk Author', 'Fiction');

-- Fixtures as service role: loans/copies cannot be written as authenticated.
set local role service_role;

insert into public.copies (id, title_id, barcode, status)
values
  ('e1cccccc-cccc-cccc-cccc-cccccccccc01', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-LC-FILL', 'on_loan'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc02', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-LC-DMG', 'on_loan'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc03', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'BK-LC-LOST', 'on_loan'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc04', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'BK-LC-NOHOLDS', 'on_loan'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc05', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03', 'BK-LC-SKIP', 'on_loan'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc06', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04', 'BK-LC-SUSP', 'on_loan'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc07', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb05', 'BK-LC-SHELF', 'available'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc08', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb05', 'BK-LC-WALKUP', 'available'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc09', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb06', 'BK-LC-REL-1', 'available'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc10', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb06', 'BK-LC-REL-2', 'available'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc11', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb07', 'BK-LC-LAZY', 'available'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc12', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb08', 'BK-LC-OWN-1', 'available'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc13', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb08', 'BK-LC-OWN-2', 'available'),
  ('e1cccccc-cccc-cccc-cccc-cccccccccc14', 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb09', 'BK-LC-WAIT', 'available');

insert into public.loans (copy_id, member_id, checked_out_by, checked_out_at, due_at, status)
select
  id,
  'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa06',
  'e1111111-1111-1111-1111-111111111111',
  now() - interval '5 days',
  now() + interval '16 days',
  'active'
from public.copies
where barcode like 'BK-LC-%'
  and status = 'on_loan';

-- Act as staff.
set local role authenticated;
set local request.jwt.claim.sub = 'e1111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}';

create function pg_temp.expect_checkin_error(
  p_barcode text,
  p_condition text,
  p_fill_hold boolean,
  p_code text
) returns void
language plpgsql
as $$
begin
  begin
    perform public.checkin(p_barcode, p_condition, null, p_fill_hold);
    raise exception 'expected % from checkin', p_code;
  exception when others then
    if sqlerrm not like p_code || '%' then
      raise;
    end if;
  end;
end;
$$;

create function pg_temp.expect_checkout_error(
  p_member_id uuid,
  p_barcodes text[],
  p_code text
) returns void
language plpgsql
as $$
begin
  begin
    perform public.checkout(p_member_id, p_barcodes);
    raise exception 'expected % from checkout', p_code;
  exception when others then
    if sqlerrm not like p_code || '%' then
      raise;
    end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- A. ok check-in with fill_hold readies the queue head onto the hold shelf.
-- ---------------------------------------------------------------------------
do $$
declare
  v_head public.holds;
  v_next public.holds;
  v_result jsonb;
begin
  v_head := public.place_hold(
    'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
    'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'
  );
  v_next := public.place_hold(
    'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
    'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'
  );

  v_result := public.checkin('BK-LC-FILL', 'ok', null, true);

  if v_result ->> 'copy_status' <> 'on_hold_shelf' then
    raise exception 'fill-hold check-in should leave the copy on the hold shelf, got %',
      v_result ->> 'copy_status';
  end if;

  if v_result -> 'hold' is null
     or (v_result -> 'hold' ->> 'member_id') <> 'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'
     or (v_result -> 'hold' ->> 'member_name') <> 'Head Member'
     or (v_result -> 'hold' ->> 'expires_at') is null then
    raise exception 'fill-hold payload should describe the readied head hold, got %', v_result;
  end if;

  select * into v_head from public.holds where id = v_head.id;
  if v_head.status <> 'ready'
     or v_head.copy_id <> 'e1cccccc-cccc-cccc-cccc-cccccccccc01'
     or v_head.ready_at is null
     or v_head.expires_at is null then
    raise exception 'head hold should be ready with copy and expiry set';
  end if;

  if v_head.expires_at < now() + interval '6 days 23 hours'
     or v_head.expires_at > now() + interval '7 days 1 hour' then
    raise exception 'fill-hold expiry should use the head member type hold_expiry_days';
  end if;

  if (select status from public.copies where id = 'e1cccccc-cccc-cccc-cccc-cccccccccc01')
     <> 'on_hold_shelf' then
    raise exception 'fill-hold should move the copy to on_hold_shelf';
  end if;

  -- The queue head is served, never a later row.
  select * into v_next from public.holds where id = v_next.id;
  if v_next.status <> 'waiting' or v_next.copy_id is not null then
    raise exception 'fill-hold must serve only the queue head';
  end if;

  if not exists (
    select 1
    from public.notifications
    where type = 'hold_ready'
      and entity_type = 'hold'
      and entity_id = v_head.id
      and detail ->> 'copy_barcode' = 'BK-LC-FILL'
  ) then
    raise exception 'fill-hold should write a hold_ready notification';
  end if;

  if not exists (
    select 1
    from public.audit_log
    where action = 'loan.checkin'
      and detail ->> 'hold_id' = v_head.id::text
      and detail ->> 'barcode' = 'BK-LC-FILL'
  ) then
    raise exception 'fill-hold should record the hold in the checkin audit row';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- B. Damaged/lost check-ins never fill a hold — the flag is rejected outright.
-- ---------------------------------------------------------------------------
select pg_temp.expect_checkin_error('BK-LC-DMG', 'damaged', true, 'fill_hold_requires_ok');
select pg_temp.expect_checkin_error('BK-LC-LOST', 'lost', true, 'fill_hold_requires_ok');

do $$
begin
  if (select status from public.copies where barcode = 'BK-LC-DMG') <> 'on_loan'
     or (select status from public.copies where barcode = 'BK-LC-LOST') <> 'on_loan' then
    raise exception 'rejected fill-hold must not touch the copy';
  end if;
  if exists (
    select 1
    from public.loans l
    join public.copies c on c.id = l.copy_id
    where c.barcode in ('BK-LC-DMG', 'BK-LC-LOST')
      and l.status <> 'active'
  ) then
    raise exception 'rejected fill-hold must not close the loan';
  end if;
end $$;

-- Damaged/lost without the flag still work and leave the queue waiting.
do $$
declare
  v_result jsonb;
begin
  v_result := public.checkin('BK-LC-DMG', 'damaged');
  if v_result ->> 'copy_status' <> 'damaged' or (v_result -> 'hold') is not null
     and v_result -> 'hold' <> 'null'::jsonb then
    raise exception 'damaged check-in should end the flow without hold interaction';
  end if;
  if not exists (
    select 1 from public.holds
    where title_id = 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01' and status = 'waiting'
  ) then
    raise exception 'damaged check-in must not fill the waiting hold';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- C. fill_hold with no waiting holds shelves the copy and reports no hold.
-- ---------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := public.checkin('BK-LC-NOHOLDS', 'ok', null, true);
  if v_result ->> 'copy_status' <> 'available' or (v_result -> 'hold') is not null
     and v_result -> 'hold' <> 'null'::jsonb then
    raise exception 'fill-hold with an empty queue should shelve the copy, got %', v_result;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- D. An ok check-in without the flag never fills, even with a waiting queue.
-- ---------------------------------------------------------------------------
do $$
declare
  v_hold public.holds;
  v_result jsonb;
begin
  v_hold := public.place_hold(
    'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
    'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03'
  );

  v_result := public.checkin('BK-LC-SKIP', 'ok');

  if v_result ->> 'copy_status' <> 'available' or (v_result -> 'hold') is not null
     and v_result -> 'hold' <> 'null'::jsonb then
    raise exception 'plain ok check-in should shelve the copy, got %', v_result;
  end if;
  if (select status from public.holds where id = v_hold.id) <> 'waiting' then
    raise exception 'plain ok check-in must leave the hold waiting';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- E. Promotion ignores member status: a suspended head is readied anyway.
-- ---------------------------------------------------------------------------
do $$
declare
  v_head public.holds;
  v_behind public.holds;
begin
  v_head := public.place_hold(
    'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04',
    'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04'
  );
  perform public.set_member_status('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04', 'suspended');
  v_behind := public.place_hold(
    'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
    'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04'
  );

  perform public.checkin('BK-LC-SUSP', 'ok', null, true);

  if (select status from public.holds where id = v_head.id) <> 'ready' then
    raise exception 'suspension blocks checkout, not queue standing: head should be readied';
  end if;
  if (select status from public.holds where id = v_behind.id) <> 'waiting' then
    raise exception 'only the queue head is promoted';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- F. The shelf copy is locked to its member: wrong member rejected, right
-- member's checkout fulfils the hold.
-- ---------------------------------------------------------------------------
select pg_temp.expect_checkout_error(
  'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
  array['BK-LC-FILL'],
  'copy_on_hold_shelf'
);

do $$
declare
  v_loan public.loans;
begin
  select * into v_loan
  from public.checkout('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', array['BK-LC-FILL']);

  if not exists (
    select 1
    from public.holds
    where member_id = 'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'
      and title_id = 'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'
      and status = 'fulfilled'
  ) then
    raise exception 'the right member''s checkout should fulfil the ready hold';
  end if;

  if (select status from public.copies where barcode = 'BK-LC-FILL') <> 'on_loan' then
    raise exception 'fulfilled shelf copy should be on loan';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- G. Walk-up checkout of a different copy auto-fulfils the member's own hold
-- and releases the shelf copy to the next waiting hold.
-- ---------------------------------------------------------------------------
do $$
declare
  v_own public.holds;
  v_next public.holds;
begin
  v_own := public.place_hold(
    'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
    'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb05'
  );
  v_next := public.place_hold(
    'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
    'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb05'
  );
  perform public.mark_ready('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb05', 'BK-LC-SHELF');

  perform public.checkout('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', array['BK-LC-WALKUP']);

  if (select status from public.holds where id = v_own.id) <> 'fulfilled' then
    raise exception 'walk-up checkout of another copy should fulfil the member''s own hold';
  end if;

  select * into v_next from public.holds where id = v_next.id;
  if v_next.status <> 'ready'
     or v_next.copy_id <> 'e1cccccc-cccc-cccc-cccc-cccccccccc07'
     or v_next.expires_at is null then
    raise exception 'released shelf copy should promote the next waiting hold';
  end if;

  if (select status from public.copies where barcode = 'BK-LC-SHELF') <> 'on_hold_shelf' then
    raise exception 'promoted copy should stay on the hold shelf';
  end if;
  if (select status from public.copies where barcode = 'BK-LC-WALKUP') <> 'on_loan' then
    raise exception 'walked-up copy should be on loan';
  end if;

  if not exists (
    select 1
    from public.notifications
    where type = 'hold_ready'
      and entity_type = 'hold'
      and entity_id = v_next.id
  ) then
    raise exception 'promotion on release should notify for the next hold';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- H. With no next waiting hold, the released shelf copy becomes available.
-- ---------------------------------------------------------------------------
do $$
declare
  v_own public.holds;
begin
  v_own := public.place_hold(
    'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
    'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb06'
  );
  perform public.mark_ready('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb06', 'BK-LC-REL-1');

  perform public.checkout('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03', array['BK-LC-REL-2']);

  if (select status from public.holds where id = v_own.id) <> 'fulfilled' then
    raise exception 'own hold should be fulfilled by the walk-up checkout';
  end if;
  if (select status from public.copies where barcode = 'BK-LC-REL-1') <> 'available' then
    raise exception 'released shelf copy with no queue should become available';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- I. Lazy expiry: a stale ready hold never blocks another member's checkout.
-- ---------------------------------------------------------------------------
do $$
declare
  v_hold public.holds;
begin
  v_hold := public.place_hold(
    'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
    'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb07'
  );
  perform public.mark_ready('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb07', 'BK-LC-LAZY');

  -- Age the hold past its shelf expiry, as if the daily job has not run yet.
  reset role;
  update public.holds
  set expires_at = now() - interval '1 hour'
  where id = v_hold.id;
  set local role authenticated;
  set local request.jwt.claim.sub = 'e1111111-1111-1111-1111-111111111111';
  set local request.jwt.claim.role = 'authenticated';
  set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}';

  perform public.checkout('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', array['BK-LC-LAZY']);

  if (select status from public.holds where id = v_hold.id) <> 'expired' then
    raise exception 'stale ready hold should be lazily expired at checkout';
  end if;
  if (select status from public.copies where barcode = 'BK-LC-LAZY') <> 'on_loan' then
    raise exception 'lazy expiry should free the shelf copy for the same-day checkout';
  end if;
  if not exists (
    select 1
    from public.loans
    where member_id = 'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02'
      and copy_id = 'e1cccccc-cccc-cccc-cccc-cccccccccc11'
      and status = 'active'
  ) then
    raise exception 'the walk-up member should hold the new loan';
  end if;
  if not exists (
    select 1
    from public.audit_log
    where action = 'hold.expire'
      and entity_type = 'hold'
      and entity_id = v_hold.id
      and (detail ->> 'lazy')::boolean
  ) then
    raise exception 'lazy expiry should write a hold.expire audit row';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- J. The owner's own stale hold expires too (never fulfils); its shelf copy
-- is released to the queue — here empty, so back to available.
-- ---------------------------------------------------------------------------
do $$
declare
  v_hold public.holds;
begin
  v_hold := public.place_hold(
    'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05',
    'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb08'
  );
  perform public.mark_ready('e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb08', 'BK-LC-OWN-1');

  reset role;
  update public.holds
  set expires_at = now() - interval '1 hour'
  where id = v_hold.id;
  set local role authenticated;
  set local request.jwt.claim.sub = 'e1111111-1111-1111-1111-111111111111';
  set local request.jwt.claim.role = 'authenticated';
  set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}';

  perform public.checkout('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05', array['BK-LC-OWN-2']);

  if (select status from public.holds where id = v_hold.id) <> 'expired' then
    raise exception 'an expired ready hold is lazily expired, not fulfilled';
  end if;
  if (select status from public.copies where barcode = 'BK-LC-OWN-1') <> 'available' then
    raise exception 'the stale shelf copy should be released to available';
  end if;
  if (select status from public.copies where barcode = 'BK-LC-OWN-2') <> 'on_loan' then
    raise exception 'the owner still checks out the walked-up copy';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- K. A waiting hold is fulfilled when the member walks up with any copy.
-- ---------------------------------------------------------------------------
do $$
declare
  v_hold public.holds;
begin
  v_hold := public.place_hold(
    'e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
    'e1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb09'
  );

  perform public.checkout('e1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03', array['BK-LC-WAIT']);

  if (select status from public.holds where id = v_hold.id) <> 'fulfilled' then
    raise exception 'a waiting hold should fulfil when the member checks out the title';
  end if;
end $$;

rollback;
