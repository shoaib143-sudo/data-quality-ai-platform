-- Phase 11 governed learning live readiness evidence.
-- Read-only projection used to prove structural and operational readiness.
-- No learning, approval, release, or action authority is granted here.

create or replace function agent.get_governed_learning_readiness_evidence(
  p_project_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, agent, governance, app, profiling, catalog
as $$
declare
  v_required_tables text[] := array[
    'agent.learning_candidates',
    'agent.learning_candidate_evidence',
    'agent.learning_candidate_transitions',
    'agent.learning_candidate_benchmarks',
    'agent.learning_candidate_approval_links',
    'agent.learning_candidate_releases',
    'agent.positive_learning_cases',
    'agent.positive_learning_case_occurrences',
    'agent.positive_learning_case_usages',
    'agent.agent_run_learning_provenance'
  ];
  v_required_tables_present boolean;
  v_required_rls_enabled boolean;
  v_active_admins integer;
  v_successful_runs integer;
  v_verified_runs integer;
  v_positive_cases integer;
  v_approved_cases integer;
  v_production_approved_cases integer;
  v_applied_usage integer;
  v_successful_usage integer;
  v_production_successful_usage integer;
begin
  if p_project_id is null then
    raise exception 'projectId is required';
  end if;

  select bool_and(to_regclass(table_name) is not null)
  into v_required_tables_present
  from unnest(v_required_tables) as t(table_name);

  select coalesce(bool_and(c.relrowsecurity), false)
  into v_required_rls_enabled
  from unnest(v_required_tables) as t(table_name)
  join pg_class c on c.oid = to_regclass(table_name)
  where to_regclass(table_name) is not null;

  if (select count(*) from unnest(v_required_tables)) <> (
    select count(*)
    from unnest(v_required_tables) as t(table_name)
    where to_regclass(table_name) is not null
  ) then
    v_required_rls_enabled := false;
  end if;

  select count(*)
  into v_active_admins
  from governance.project_role_bindings b
  where b.project_id = p_project_id
    and b.role_key = 'DATA_GOVERNANCE_ADMIN'
    and b.active = true
    and (b.expires_at is null or b.expires_at > statement_timestamp());

  select count(*)
  into v_successful_runs
  from agent.agent_runs r
  where r.project_id = p_project_id
    and r.status = 'SUCCEEDED';

  select count(distinct r.id)
  into v_verified_runs
  from agent.agent_runs r
  join agent.agent_run_learning_provenance p
    on p.agent_run_id = r.id
   and p.project_id = r.project_id
   and p.production_eligible = true
   and p.classification = 'PRODUCTION_ELIGIBLE'
   and p.synthetic_or_test_detected = false
  where r.project_id = p_project_id
    and r.status = 'SUCCEEDED'
    and (
      exists (
        select 1
        from agent.agent_evaluations e
        where e.project_id = p_project_id
          and e.evaluator_type = 'NATIVE_TRAJECTORY'
          and coalesce(e.dimensions->>'terminal_status','') = 'SUCCEEDED'
          and (e.agent_run_id = r.id or e.agent_run_id = r.parent_run_id)
      )
      or exists (
        select 1
        from agent.agent_artifacts a
        where a.agent_run_id = r.id
          and a.artifact_type = 'AGENT_RUN_RESULT'
          and a.content_hash is not null
      )
      or exists (
        select 1
        from profiling.profile_runs pr
        join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
        join catalog.datasets d on d.id = dv.dataset_id
        where pr.agent_run_id = r.id
          and pr.status = 'COMPLETED'
          and d.project_id = p_project_id
      )
    );

  select count(*)
  into v_positive_cases
  from agent.positive_learning_cases plc
  where plc.project_id = p_project_id;

  select count(*),
         count(*) filter (
           where plc.production_eligible = true
             and plc.learning_provenance_recorded_at is not null
         )
  into v_approved_cases, v_production_approved_cases
  from agent.positive_learning_cases plc
  where plc.project_id = p_project_id
    and plc.review_status = 'APPROVED';

  select count(*) filter (where u.usage_status = 'APPLIED'),
         count(*) filter (where u.usage_status = 'SUCCEEDED'),
         count(*) filter (
           where u.usage_status = 'SUCCEEDED'
             and plc.production_eligible = true
             and plc.review_status = 'APPROVED'
             and plc.learning_provenance_recorded_at is not null
         )
  into v_applied_usage, v_successful_usage, v_production_successful_usage
  from agent.positive_learning_case_usages u
  join agent.positive_learning_cases plc
    on plc.candidate_id = u.candidate_id
   and plc.project_id = u.project_id
  where u.project_id = p_project_id;

  return jsonb_build_object(
    'requiredTablesPresent', coalesce(v_required_tables_present, false),
    'requiredRlsEnabled', coalesce(v_required_rls_enabled, false),
    'activeDataGovernanceAdminBindingCount', coalesce(v_active_admins, 0),
    'successfulGovernedRunCount', coalesce(v_successful_runs, 0),
    'canonicallyVerifiedRunCount', coalesce(v_verified_runs, 0),
    'positiveCaseCount', coalesce(v_positive_cases, 0),
    'approvedPositiveCaseCount', coalesce(v_approved_cases, 0),
    'productionEligibleApprovedPositiveCaseCount', coalesce(v_production_approved_cases, 0),
    'appliedPositiveCaseUsageCount', coalesce(v_applied_usage, 0),
    'successfulPositiveCaseUsageCount', coalesce(v_successful_usage, 0),
    'productionEligibleSuccessfulPositiveCaseUsageCount', coalesce(v_production_successful_usage, 0)
  );
end;
$$;

revoke all on function agent.get_governed_learning_readiness_evidence(uuid)
  from public, anon, authenticated;
grant execute on function agent.get_governed_learning_readiness_evidence(uuid)
  to service_role;

comment on function agent.get_governed_learning_readiness_evidence(uuid) is
  'Read-only service-role projection of Phase 11 structural, authority, verified-run, approved-learning and reuse evidence. It grants no learning or release authority.';
