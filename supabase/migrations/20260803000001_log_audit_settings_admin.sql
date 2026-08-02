-- Hardening: the settings audit codes (member_type.*, settings.update) log
-- admin-only table writes, so a staff JWT must not be able to forge them.
-- log_audit is SECURITY DEFINER — the admin check lives in the function body,
-- same pattern as the admin branches of the flow RPCs (ADR-0001).

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

  -- Settings codes mirror admin-only writes; staff can describe, never forge.
  if p_action in (
    'member_type.create',
    'member_type.update',
    'member_type.delete',
    'settings.update'
  ) and not public.is_admin() then
    raise exception 'admin_required' using errcode = 'P0001';
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
