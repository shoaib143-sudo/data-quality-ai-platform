-- Keep evaluation authority separate from agent execution and administration.
-- This grant is additive and idempotent because the capability array is deduplicated.
update governance.access_roles
set capabilities = array(
  select distinct capability
  from unnest(capabilities || array['agent.learning.evaluate']::text[]) capability
  order by capability
)
where role_key = 'DATA_GOVERNANCE_ADMIN';

-- Fail closed if this sensitive evaluator permission is assigned to another role.
do $$
begin
  if exists (
    select 1
    from governance.access_roles
    where 'agent.learning.evaluate' = any(capabilities)
      and role_key <> 'DATA_GOVERNANCE_ADMIN'
  ) then
    raise exception 'agent.learning.evaluate may only be assigned to DATA_GOVERNANCE_ADMIN';
  end if;
end;
$$;
