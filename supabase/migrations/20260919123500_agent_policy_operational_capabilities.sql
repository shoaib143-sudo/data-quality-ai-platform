-- Agent Policy v2 deterministic operational capability coherence.
-- Coarse operation capability is separate from approval-axis authority. Existing
-- Agent Policy authority records continue to decide BUSINESS/GOVERNANCE eligibility.

update governance.access_roles
set capabilities = array(
  select distinct capability
  from unnest(capabilities || array['execution.approve']::text[]) capability
  order by capability
)
where role_key in (
  'DATA_OWNER',
  'DATA_STEWARD',
  'DATA_GOVERNANCE_ADMIN',
  'DATA_GOVERNANCE_SPECIALIST'
);

update governance.access_roles
set capabilities = array(
  select distinct capability
  from unnest(capabilities || array['agent.admin']::text[]) capability
  order by capability
)
where role_key = 'DATA_GOVERNANCE_ADMIN';

-- Guard against accidental broad assignment. execution.approve is only the coarse
-- operation gate; scope, axis, delegation, SoD and request state are re-authorized
-- by Agent Policy v2 at decision time.
do $$
begin
  if exists (
    select 1
    from governance.access_roles
    where 'agent.admin' = any(capabilities)
      and role_key <> 'DATA_GOVERNANCE_ADMIN'
  ) then
    raise exception 'agent.admin may only be assigned to DATA_GOVERNANCE_ADMIN';
  end if;

  if exists (
    select 1
    from governance.access_roles
    where 'execution.approve' = any(capabilities)
      and role_key not in (
        'DATA_OWNER',
        'DATA_STEWARD',
        'DATA_GOVERNANCE_ADMIN',
        'DATA_GOVERNANCE_SPECIALIST'
      )
  ) then
    raise exception 'execution.approve has an unsupported role assignment';
  end if;
end;
$$;
