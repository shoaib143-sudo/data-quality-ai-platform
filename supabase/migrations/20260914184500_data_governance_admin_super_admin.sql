-- Data Governance Admin is the DataNexus governance-platform Super Admin.
-- Organization ownership remains a separate tenant/IAM boundary.
with all_capabilities as (
  select array_agg(distinct capability order by capability) as capabilities
  from governance.access_roles
  cross join lateral unnest(capabilities) capability
)
update governance.access_roles r
set
  description = 'DataNexus governance-platform Super Admin with full governed platform administration. Organization ownership remains a separate IAM boundary.',
  capabilities = (
    select array_agg(distinct capability order by capability)
    from unnest(
      coalesce((select capabilities from all_capabilities), '{}'::text[])
      || array['admin.manage','catalog.delete','source.delete','project.delete']::text[]
    ) capability
  )
where r.role_key = 'DATA_GOVERNANCE_ADMIN';

-- Defense in depth: organization OWNER/ADMIN remains powerful, but permanent
-- destructive cleanup is reserved for a persona binding that explicitly
-- carries the delete capability. This prevents future authorizeProject(...)
-- callers from accidentally turning organization administration into delete
-- authority.
create or replace function governance.has_project_capability(
  p_project_id uuid,
  p_user_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'governance', 'app'
as $function$
  select
    (
      p_capability <> all(array['catalog.delete','source.delete','project.delete']::text[])
      and exists(
        select 1
        from app.projects p
        join app.organization_members om on om.organization_id = p.organization_id
        where p.id = p_project_id
          and om.user_id = p_user_id
          and om.role in ('OWNER','ADMIN')
      )
    )
    or exists(
      select 1
      from governance.project_role_bindings b
      join governance.access_roles r on r.role_key = b.role_key
      where b.project_id = p_project_id
        and b.user_id = p_user_id
        and b.active = true
        and (b.expires_at is null or b.expires_at > now())
        and p_capability = any(r.capabilities)
    )
    or (
      p_capability = any(array['catalog.read','glossary.read','lineage.read','profiling.read','quality.read','observability.read','audit.read','report.export']::text[])
      and exists(
        select 1
        from app.projects p
        join app.organization_members om on om.organization_id = p.organization_id
        where p.id = p_project_id
          and om.user_id = p_user_id
      )
    );
$function$;
