-- Synthetic bootstrap governance records are demo scaffolding, not production approval scope.
-- A domain remains governed when it has real dataset evidence or a non-synthetic critical element.

with real_project_domains as (
  select distinct project_id, btrim(business_domain) as domain
  from catalog.datasets
  where nullif(btrim(business_domain), '') is not null

  union

  select distinct project_id, btrim(domain) as domain
  from governance.critical_data_elements
  where nullif(btrim(domain), '') is not null
    and lower(coalesce(metadata->>'synthetic_bootstrap', 'false')) not in ('true', '1', 'yes')
)
update governance.agent_approval_authorities a
set
  active = false,
  revoked_at = coalesce(a.revoked_at, now()),
  reason = a.reason || ' Revoked because the project/domain is backed only by synthetic bootstrap governance data.'
where a.active
  and a.approval_axis = 'GOVERNANCE'
  and a.source_role_key in ('DATA_GOVERNANCE_ADMIN', 'DATA_GOVERNANCE_SPECIALIST')
  and a.reason in (
    'Bootstrapped from active governance project role for Agent Policy v2.',
    'Refreshed from active governance project role for Agent Policy v2.'
  )
  and not exists (
    select 1
    from real_project_domains d
    where d.project_id = a.project_id
      and lower(d.domain) = lower(a.domain)
  );

with real_project_domains as (
  select distinct project_id, btrim(business_domain) as domain
  from catalog.datasets
  where nullif(btrim(business_domain), '') is not null

  union

  select distinct project_id, btrim(domain) as domain
  from governance.critical_data_elements
  where nullif(btrim(domain), '') is not null
    and lower(coalesce(metadata->>'synthetic_bootstrap', 'false')) not in ('true', '1', 'yes')
),
governance_users as (
  select distinct b.user_id, b.project_id, b.role_key
  from governance.project_role_bindings b
  where b.active
    and (b.expires_at is null or b.expires_at > now())
    and b.role_key in ('DATA_GOVERNANCE_ADMIN', 'DATA_GOVERNANCE_SPECIALIST')
)
insert into governance.agent_approval_authorities (
  user_id, project_id, domain, approval_axis, source_role_key,
  active, reason, created_by
)
select
  g.user_id,
  g.project_id,
  d.domain,
  'GOVERNANCE',
  g.role_key,
  true,
  'Refreshed from active governance project role for Agent Policy v2.',
  g.user_id
from governance_users g
join real_project_domains d on d.project_id = g.project_id
where not exists (
  select 1
  from governance.agent_approval_authorities a
  where a.user_id = g.user_id
    and a.project_id = g.project_id
    and lower(a.domain) = lower(d.domain)
    and a.approval_axis = 'GOVERNANCE'
    and a.active
);
