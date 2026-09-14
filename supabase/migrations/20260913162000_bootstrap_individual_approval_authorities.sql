-- Bootstrap individual approval authorities from existing governed accountability evidence.

insert into governance.agent_approval_authorities (
  user_id, project_id, domain, approval_axis, source_role_key,
  active, reason, created_by
)
select distinct
  d.owner_user_id,
  d.project_id,
  btrim(d.business_domain),
  'BUSINESS',
  'DATA_OWNER',
  true,
  'Bootstrapped from dataset ownership for Agent Policy v2.',
  d.owner_user_id
from catalog.datasets d
where d.owner_user_id is not null
  and nullif(btrim(d.business_domain),'') is not null
  and not exists (
    select 1 from governance.agent_approval_authorities a
    where a.user_id=d.owner_user_id
      and a.project_id=d.project_id
      and lower(a.domain)=lower(btrim(d.business_domain))
      and a.approval_axis='BUSINESS'
      and a.active
  );

insert into governance.agent_approval_authorities (
  user_id, project_id, domain, approval_axis, source_role_key,
  active, reason, created_by
)
select distinct
  s.user_id,
  s.project_id,
  btrim(d.business_domain),
  'BUSINESS',
  'DATA_STEWARD',
  true,
  'Bootstrapped from active dataset stewardship for Agent Policy v2.',
  s.user_id
from governance.current_stewardship_assignments s
join catalog.datasets d on d.id=s.dataset_id
where s.active
  and coalesce(s.effective,true)
  and nullif(btrim(d.business_domain),'') is not null
  and not exists (
    select 1 from governance.agent_approval_authorities a
    where a.user_id=s.user_id
      and a.project_id=s.project_id
      and lower(a.domain)=lower(btrim(d.business_domain))
      and a.approval_axis='BUSINESS'
      and a.active
  );

with project_domains as (
  select distinct project_id, btrim(business_domain) as domain
  from catalog.datasets
  where nullif(btrim(business_domain),'') is not null
  union
  select distinct project_id, btrim(domain) as domain
  from governance.critical_data_elements
  where nullif(btrim(domain),'') is not null
),
governance_users as (
  select distinct b.user_id, b.project_id, b.role_key
  from governance.project_role_bindings b
  where b.active
    and (b.expires_at is null or b.expires_at > now())
    and b.role_key in ('DATA_GOVERNANCE_ADMIN','DATA_GOVERNANCE_SPECIALIST')
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
  'Bootstrapped from active governance project role for Agent Policy v2.',
  g.user_id
from governance_users g
join project_domains d on d.project_id=g.project_id
where not exists (
  select 1 from governance.agent_approval_authorities a
  where a.user_id=g.user_id
    and a.project_id=g.project_id
    and lower(a.domain)=lower(d.domain)
    and a.approval_axis='GOVERNANCE'
    and a.active
);
