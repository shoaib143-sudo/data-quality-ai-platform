-- Split retry/cancel authority from the broad agent.execute capability without changing current operator coverage.
update governance.access_roles
set capabilities = array(
  select distinct capability
  from unnest(capabilities || array['execution.retry','execution.cancel']::text[]) capability
  order by capability
)
where 'agent.execute' = any(capabilities);
