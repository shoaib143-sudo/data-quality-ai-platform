-- Resource-scoped visibility foundation for Agent Policy v2.
-- Explicit dataset ACLs override project-level fallback. DENY always wins.

create table if not exists governance.resource_access_grants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  resource_type text not null check (resource_type in ('DATASET')),
  resource_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  effect text not null check (effect in ('ALLOW','DENY')),
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text not null check (length(btrim(reason)) > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  constraint resource_access_grants_window check (ends_at is null or ends_at > starts_at)
);

create index if not exists idx_resource_access_grants_lookup
  on governance.resource_access_grants(project_id, resource_type, resource_id, user_id, active);
create index if not exists idx_resource_access_grants_resource
  on governance.resource_access_grants(resource_type, resource_id, active);

alter table governance.resource_access_grants enable row level security;
revoke all on governance.resource_access_grants from anon, authenticated;
grant all on governance.resource_access_grants to service_role;

create or replace function governance.can_view_dataset_resource(p_user_id uuid, p_dataset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app, catalog, governance, app_private
as $$
declare
  v_project_id uuid;
  v_owner_user_id uuid;
  v_acl_count integer;
  v_allow boolean;
  v_deny boolean;
  v_is_steward boolean;
begin
  select d.project_id, d.owner_user_id
    into v_project_id, v_owner_user_id
  from catalog.datasets d
  where d.id = p_dataset_id;

  if v_project_id is null then
    return false;
  end if;

  if not app_private.is_project_member(v_project_id) then
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

comment on table governance.resource_access_grants is 'Explicit per-user resource visibility grants. DENY overrides ALLOW; project membership is fallback only when no explicit ACL exists.';
comment on function governance.can_view_dataset_resource(uuid, uuid) is 'Server-only dataset visibility check combining project membership, explicit ACLs, ownership and stewardship.';
