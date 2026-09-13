-- Restore the server-only read path for canonical AI resource-budget evidence.
--
-- The AI Command Center authorizes admin.manage before constructing the
-- service-role backed resource-control state. The effective budget view is
-- SECURITY INVOKER, so service_role requires SELECT on both the view and its
-- base table. The original ADR-006 migration omitted those grants.
--
-- Keep this repair read-only and server-only. Do not widen access for anon or
-- authenticated users and do not disable RLS on the underlying policy table.

grant select on governance.ai_resource_budget_policy_versions to service_role;
grant select on governance.ai_resource_budget_policy_effective to service_role;

do $$
begin
  if not has_table_privilege('service_role', 'governance.ai_resource_budget_policy_versions', 'SELECT')
     or not has_table_privilege('service_role', 'governance.ai_resource_budget_policy_effective', 'SELECT') then
    raise exception 'AI_RESOURCE_BUDGET_SERVICE_READ_GRANT_MISSING';
  end if;

  if has_table_privilege('anon', 'governance.ai_resource_budget_policy_versions', 'SELECT')
     or has_table_privilege('anon', 'governance.ai_resource_budget_policy_effective', 'SELECT')
     or has_table_privilege('authenticated', 'governance.ai_resource_budget_policy_versions', 'SELECT')
     or has_table_privilege('authenticated', 'governance.ai_resource_budget_policy_effective', 'SELECT') then
    raise exception 'AI_RESOURCE_BUDGET_DIRECT_USER_READ_MUST_REMAIN_DENIED';
  end if;

  if has_table_privilege('service_role', 'governance.ai_resource_budget_policy_versions', 'INSERT')
     or has_table_privilege('service_role', 'governance.ai_resource_budget_policy_versions', 'UPDATE')
     or has_table_privilege('service_role', 'governance.ai_resource_budget_policy_versions', 'DELETE')
     or has_table_privilege('service_role', 'governance.ai_resource_budget_policy_versions', 'TRUNCATE')
     or has_table_privilege('service_role', 'governance.ai_resource_budget_policy_versions', 'REFERENCES')
     or has_table_privilege('service_role', 'governance.ai_resource_budget_policy_versions', 'TRIGGER') then
    raise exception 'AI_RESOURCE_BUDGET_SERVICE_MUTATION_GRANT_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'governance'
      and c.relname = 'ai_resource_budget_policy_versions'
      and c.relrowsecurity
  ) then
    raise exception 'AI_RESOURCE_BUDGET_RLS_MUST_REMAIN_ENABLED';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'governance'
      and c.relname = 'ai_resource_budget_policy_effective'
      and c.relkind = 'v'
      and coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']
  ) then
    raise exception 'AI_RESOURCE_BUDGET_VIEW_MUST_REMAIN_SECURITY_INVOKER';
  end if;
end
$$;

comment on view governance.ai_resource_budget_policy_effective is
  'Latest recorded ADR-006 resource budget policy per project/scope. The AI Command Center reads this canonical authority only through its server-side service-role state adapter after admin.manage authorization; direct anon/authenticated SELECT remains denied.';
