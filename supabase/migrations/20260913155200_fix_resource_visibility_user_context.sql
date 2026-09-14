-- Correct server-side dataset visibility membership evaluation to use the explicit user id.

create or replace function governance.can_view_dataset_resource(p_user_id uuid, p_dataset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app, catalog, governance
as $$
declare
  v_project_id uuid;
  v_owner_user_id uuid;
  v_acl_count integer;
  v_allow boolean;
  v_deny boolean;
  v_is_steward boolean;
  v_is_project_member boolean;
begin
  select d.project_id, d.owner_user_id
    into v_project_id, v_owner_user_id
  from catalog.datasets d
  where d.id = p_dataset_id;

  if v_project_id is null then
    return false;
  end if;

  select exists (
    select 1
    from governance.project_role_bindings b
    where b.project_id = v_project_id
      and b.user_id = p_user_id
      and b.active
      and (b.expires_at is null or b.expires_at > now())
  ) into v_is_project_member;

  if not v_is_project_member then
    return false;
  end if;

  select
    count(*)::integer,
    coalesce(bool_or(g.effect = 'ALLOW' and g.user_id = p_user_id), false),
    coalesce(bool_or(g.effect = 'DENY' and g.user_id = p_user_id), false)
  into v_acl_count, v_allow, v_deny
  from governance.resource_access_grants g
  where g.project_id = v_project_id
    and g.resource_type = 'DATASET'
    and g.resource_id = p_dataset_id
    and g.active
    and g.starts_at <= now()
    and (g.ends_at is null or g.ends_at > now());

  if v_deny then
    return false;
  end if;

  if v_owner_user_id = p_user_id then
    return true;
  end if;

  select exists (
    select 1
    from governance.current_stewardship_assignments s
    where s.project_id = v_project_id
      and s.dataset_id = p_dataset_id
      and s.user_id = p_user_id
      and s.active
      and coalesce(s.effective, true)
  ) into v_is_steward;

  if v_is_steward then
    return true;
  end if;

  if v_acl_count > 0 then
    return v_allow;
  end if;

  return true;
end;
$$;

revoke all on function governance.can_view_dataset_resource(uuid, uuid) from public, anon, authenticated;
grant execute on function governance.can_view_dataset_resource(uuid, uuid) to service_role;
