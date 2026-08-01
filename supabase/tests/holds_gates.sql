-- Verifies hold RPC gates, queue ordering, cancellation, ready assignment,
-- audit/notification writes, and direct-write denial. Run after local startup:
--   pnpm test:sql:holds

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'd1111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'holds-staff@bookly.local',
  crypt('test-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, full_name, email, role)
values (
  'd1111111-1111-1111-1111-111111111111',
  'Holds Staff',
  'holds-staff@bookly.local',
  'staff'
);

insert into public.members (id, name, member_type_id, status, card_barcode)
values
  (
    'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'Active One',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-HOLD-1'
  ),
  (
    'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'Active Two',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-HOLD-2'
  ),
  (
    'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'Active Three',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-HOLD-3'
  ),
  (
    'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    'Suspended Member',
    '11111111-1111-1111-1111-111111111101',
    'suspended',
    'MBR-HOLD-4'
  ),
  (
    'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
    'Blocked Member',
    '11111111-1111-1111-1111-111111111101',
    'blocked',
    'MBR-HOLD-5'
  ),
  (
    'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
    'Borrower',
    '11111111-1111-1111-1111-111111111101',
    'active',
    'MBR-HOLD-6'
  );

insert into public.titles (id, title, author, genre)
values
  (
    'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'Hold Queue Title',
    'Desk Author',
    'Fiction'
  ),
  (
    'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    'Loan Gate Title',
    'Desk Author',
    'Fiction'
  );

set local role service_role;

insert into public.copies (id, title_id, barcode, status)
values
  (
    'd0cccccc-cccc-cccc-cccc-cccccccccc01',
    'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'BK-HOLD-1',
    'available'
  ),
  (
    'd0cccccc-cccc-cccc-cccc-cccccccccc02',
    'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'BK-HOLD-2',
    'on_loan'
  ),
  (
    'd0cccccc-cccc-cccc-cccc-cccccccccc03',
    'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    'BK-HOLD-3',
    'on_loan'
  ),
  (
    'd0cccccc-cccc-cccc-cccc-cccccccccc04',
    'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    'BK-HOLD-4',
    'available'
  );

insert into public.loans (id, copy_id, member_id, checked_out_by, due_at)
values (
  'd0dddddd-dddd-dddd-dddd-ddddddddddd1',
  'd0cccccc-cccc-cccc-cccc-cccccccccc03',
  'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  'd1111111-1111-1111-1111-111111111111',
  now() + interval '21 days'
);

-- SECURITY DEFINER functions must still reject calls without an authenticated uid.
reset role;
do $$
begin
  begin
    perform public.place_hold(
      'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
    );
    raise exception 'expected not_authenticated from place_hold';
  exception when others then
    if sqlerrm not like 'not_authenticated%' then
      raise;
    end if;
  end;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = 'd1999999-9999-9999-9999-999999999999';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"d1999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
begin
  begin
    perform public.place_hold(
      'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
    );
    raise exception 'expected profile_missing from place_hold';
  exception when others then
    if sqlerrm not like 'profile_missing%' then
      raise;
    end if;
  end;
end $$;

set local request.jwt.claim.sub = 'd1111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}';

create function pg_temp.expect_hold_error(
  p_member_id uuid,
  p_title_id uuid,
  p_code text
) returns void
language plpgsql
as $$
begin
  begin
    perform public.place_hold(p_member_id, p_title_id);
    raise exception 'expected % from place_hold', p_code;
  exception when others then
    if sqlerrm not like p_code || '%' then
      raise;
    end if;
  end;
end;
$$;

select pg_temp.expect_hold_error(
  'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
  'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'member_suspended'
);
select pg_temp.expect_hold_error(
  'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
  'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'member_blocked'
);
select pg_temp.expect_hold_error(
  'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa999',
  'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'member_not_found'
);
select pg_temp.expect_hold_error(
  'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb99',
  'title_not_found'
);
select pg_temp.expect_hold_error(
  'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'member_has_title_on_loan'
);

-- Direct authenticated writes to the flow-critical hold table are forbidden.
do $$
declare
  v_raised boolean := false;
begin
  begin
    insert into public.holds (title_id, member_id, queue_position)
    values (
      'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      99
    );
  exception
    when insufficient_privilege then
      v_raised := true;
  end;
  if not v_raised then
    raise exception 'expected insufficient_privilege on direct hold insert';
  end if;
end $$;

do $$
declare
  v_first public.holds;
  v_second public.holds;
  v_third public.holds;
begin
  v_first := public.place_hold(
    'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
  );
  v_second := public.place_hold(
    'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
  );
  v_third := public.place_hold(
    'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
  );

  if v_first.queue_position <> 1
     or v_second.queue_position <> 2
     or v_third.queue_position <> 3 then
    raise exception 'expected tail positions 1,2,3; got %,%,%',
      v_first.queue_position, v_second.queue_position, v_third.queue_position;
  end if;
end $$;

-- Move position 2's tuple after position 3 on disk. An UPDATE whose execution
-- order follows physical rows can then attempt 3 -> 2 before 2 -> 1.
reset role;
update public.holds
set created_at = created_at
where member_id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'
  and title_id = 'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

set local role authenticated;
set local request.jwt.claim.sub = 'd1111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_first public.holds;
  v_second public.holds;
  v_third public.holds;
  v_cancelled public.holds;
  v_positions integer[];
begin
  select * into v_first
  from public.holds
  where member_id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
    and title_id = 'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
  select * into v_second
  from public.holds
  where member_id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'
    and title_id = 'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
  select * into v_third
  from public.holds
  where member_id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'
    and title_id = 'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

  v_cancelled := public.cancel_hold(v_first.id);
  if v_cancelled.status <> 'cancelled' then
    raise exception 'cancel_hold should return cancelled row';
  end if;
  select array_agg(queue_position order by queue_position)
  into v_positions
    from public.holds
    where id in (v_second.id, v_third.id);

  if v_positions <> array[1, 2] then
    raise exception 'cancelling first of three holds should renumber to {1,2}, got %',
      v_positions;
  end if;
end $$;

select pg_temp.expect_hold_error(
  'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'hold_already_active'
);

do $$
declare
  v_third public.holds;
  v_ready public.holds;
begin
  select * into v_third
  from public.holds
  where member_id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'
    and title_id = 'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
    and status = 'waiting';

  if v_third.queue_position <> 2 then
    raise exception 'third hold should remain at renumbered position 2, got %',
      v_third.queue_position;
  end if;

  v_ready := public.mark_ready(
    'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'BK-HOLD-1'
  );

  if v_ready.member_id <> 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'
     or v_ready.status <> 'ready'
     or v_ready.copy_id <> 'd0cccccc-cccc-cccc-cccc-cccccccccc01'
     or v_ready.ready_at is null
     or v_ready.expires_at is null then
    raise exception 'mark_ready did not ready the first waiting hold';
  end if;

  if v_ready.expires_at < now() + interval '6 days 23 hours'
     or v_ready.expires_at > now() + interval '7 days 1 hour' then
    raise exception 'ready expiry should use Adult hold_expiry_days';
  end if;

  if (
    select status
    from public.holds
    where id = v_third.id
  ) <> 'waiting' then
    raise exception 'mark_ready should ready only one waiting hold';
  end if;

  if (
    select status
    from public.copies
    where id = 'd0cccccc-cccc-cccc-cccc-cccccccccc01'
  ) <> 'on_hold_shelf' then
    raise exception 'mark_ready should move assigned copy to on_hold_shelf';
  end if;

  if not exists (
    select 1
    from public.audit_log
    where actor = 'd1111111-1111-1111-1111-111111111111'
      and action = 'hold.mark_ready'
      and entity_type = 'hold'
      and entity_id = v_ready.id
      and detail->>'copy_id' = 'd0cccccc-cccc-cccc-cccc-cccccccccc01'
  ) then
    raise exception 'mark_ready should write hold.mark_ready audit row';
  end if;

  if not exists (
    select 1
    from public.notifications
    where type = 'hold_ready'
      and entity_type = 'hold'
      and entity_id = v_ready.id
      and detail->>'member_id' = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'
      and detail->>'copy_barcode' = 'BK-HOLD-1'
  ) then
    raise exception 'mark_ready should write hold_ready notification';
  end if;

  perform public.cancel_hold(v_ready.id);
  if (
    select status
    from public.copies
    where id = 'd0cccccc-cccc-cccc-cccc-cccccccccc01'
  ) <> 'available' then
    raise exception 'cancelling ready hold should release its copy';
  end if;
  if (
    select queue_position
    from public.holds
    where id = v_third.id
  ) <> 1 then
    raise exception 'cancelling ready hold should renumber active queue';
  end if;
end $$;

-- Cancelling a hold that already reached a terminal status must not overwrite
-- it. Reachable directly, and when checkout fulfils a hold while cancel_hold is
-- still blocked on that hold's row lock.
do $$
declare
  v_cancelled public.holds;
begin
  select * into v_cancelled
  from public.holds
  where member_id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
    and title_id = 'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
    and status = 'cancelled';

  if not found then
    raise exception 'expected a cancelled hold fixture';
  end if;

  begin
    perform public.cancel_hold(v_cancelled.id);
    raise exception 'expected hold_not_active from cancel_hold';
  exception when others then
    if sqlerrm not like 'hold_not_active%' then
      raise;
    end if;
  end;
end $$;

do $$
begin
  begin
    perform public.cancel_hold('d0eeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
    raise exception 'expected hold_not_found from cancel_hold';
  exception when others then
    if sqlerrm not like 'hold_not_found%' then
      raise;
    end if;
  end;

  begin
    perform public.mark_ready(
      'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      'BK-DOES-NOT-EXIST'
    );
    raise exception 'expected copy_not_found from mark_ready';
  exception when others then
    if sqlerrm not like 'copy_not_found%' then
      raise;
    end if;
  end;

  begin
    perform public.mark_ready(
      'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      'BK-HOLD-3'
    );
    raise exception 'expected copy_not_available from mark_ready';
  exception when others then
    if sqlerrm not like 'copy_not_available%' then
      raise;
    end if;
  end;

  begin
    perform public.mark_ready(
      'd0bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      'BK-HOLD-4'
    );
    raise exception 'expected no_waiting_holds from mark_ready';
  exception when others then
    if sqlerrm not like 'no_waiting_holds%' then
      raise;
    end if;
  end;
end $$;

rollback;
