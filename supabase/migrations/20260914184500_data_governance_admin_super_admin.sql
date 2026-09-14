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
