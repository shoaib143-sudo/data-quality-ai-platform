-- Project profile readiness V2.
--
-- Goals:
--   * distinguish READY, PARTIALLY_READY, BLOCKED, and NOT_ASSESSED;
--   * keep readiness derived and read-only;
--   * evaluate JDBC discovery from the latest successful evidence bound to the
--     current active scope-version identity;
--   * fail closed for source types without an onboarded readiness policy;
--   * expose deterministic, UI-ready root-cause/remediation evidence;
--   * provide a dataset-version verifier suitable for ordinary profiling gates.

create or replace function catalog.verify_dataset_profile_readiness(
  p_project_id uuid,
  p_dataset_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with dataset_context as (
    select
      d.id as dataset_id,
      d.project_id,
      d.data_source_id as source_id,
      d.status::text as dataset_status,
      ds.status as source_status,
      upper(ds.source_type) as source_type,
      sor.operational_state,
      sor.latest_error_message
    from catalog.datasets d
    join catalog.data_sources ds
      on ds.id = d.data_source_id
     and ds.project_id = d.project_id
    left join catalog.source_operational_readiness sor
      on sor.source_id = ds.id
     and sor.project_id = d.project_id
    where d.project_id = p_project_id
      and d.id = p_dataset_id
  ),
  latest_version as (
    select distinct on (dv.dataset_id)
      dv.dataset_id,
      dv.id as dataset_version_id,
      dv.version_number,
      dv.source_uri,
      dv.content_hash,
      dv.schema_hash
    from catalog.dataset_versions dv
    join dataset_context dc on dc.dataset_id = dv.dataset_id
    order by dv.dataset_id, dv.version_number desc, dv.created_at desc, dv.id desc
  ),
  active_scope as (
    select distinct on (s.source_id)
      s.source_id,
      s.id as scope_id,
      s.current_version_id as scope_version_id
    from catalog.source_scopes s
    join dataset_context dc on dc.source_id = s.source_id
    join catalog.source_scope_versions sv
      on sv.id = s.current_version_id
     and sv.scope_id = s.id
     and sv.source_id = s.source_id
     and sv.project_id = s.project_id
    where s.project_id = p_project_id
      and s.status = 'ACTIVE'
      and s.current_version_id is not null
    order by s.source_id, s.updated_at desc, s.id desc
  ),
  latest_successful_manifest as (
    select distinct on (m.source_id)
      m.source_id,
      m.scope_id,
      m.scope_version_id,
      m.discovery_run_id,
      m.manifest_hash,
      m.completed_at
    from catalog.discovery_manifests m
    join active_scope sc
      on sc.source_id = m.source_id
     and sc.scope_id = m.scope_id
     and sc.scope_version_id = m.scope_version_id
    where m.project_id = p_project_id
      and m.complete = true
      and m.truncated = false
      and m.failed_item_count = 0
      and m.completed_at is not null
    order by m.source_id, m.completed_at desc, m.created_at desc, m.id desc
  ),
  evidence as (
    select
      dc.*,
      lv.dataset_version_id,
      aes.id as execution_source_id,
      sc.scope_id,
      sc.scope_version_id,
      lsm.discovery_run_id,
      lsm.manifest_hash,
      lsm.completed_at as discovery_completed_at,
      (dc.source_type = 'JDBC') as readiness_policy_onboarded,
      (dc.dataset_status = 'ACTIVE') as dataset_active,
      (dc.source_status = 'ACTIVE') as source_active,
      (dc.operational_state = 'OBSERVED_READY') as source_observed_ready,
      (sc.scope_id is not null and sc.scope_version_id is not null) as governed_scope_ready,
      (lv.dataset_version_id is not null and aes.id is not null) as execution_binding_ready,
      (lsm.discovery_run_id is not null) as discovery_evidence_ready
    from dataset_context dc
    left join latest_version lv on lv.dataset_id = dc.dataset_id
    left join profiling.dataset_execution_sources aes
      on aes.dataset_version_id = lv.dataset_version_id
     and aes.active = true
    left join active_scope sc on sc.source_id = dc.source_id
    left join latest_successful_manifest lsm on lsm.source_id = dc.source_id
  ),
  classified as (
    select
      e.*,
      case
        when not readiness_policy_onboarded then 'NOT_ASSESSED'
        when dataset_active
         and source_active
         and source_observed_ready
         and governed_scope_ready
         and execution_binding_ready
         and discovery_evidence_ready then 'READY'
        else 'BLOCKED'
      end as readiness_state,
      jsonb_strip_nulls(jsonb_build_object(
        'READINESS_RULE_NOT_ONBOARDED', case when not readiness_policy_onboarded then true end,
        'DATASET_NOT_ACTIVE', case when readiness_policy_onboarded and not dataset_active then true end,
        'SOURCE_NOT_ACTIVE', case when readiness_policy_onboarded and not source_active then true end,
        'SOURCE_NOT_OBSERVED_READY', case when readiness_policy_onboarded and not source_observed_ready then true end,
        'GOVERNED_SCOPE_NOT_READY', case when readiness_policy_onboarded and not governed_scope_ready then true end,
        'EXECUTION_SOURCE_NOT_BOUND', case when readiness_policy_onboarded and not execution_binding_ready then true end,
        'DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE', case when readiness_policy_onboarded and not discovery_evidence_ready then true end
      )) as blockers,
      jsonb_strip_nulls(jsonb_build_object(
        'READINESS_RULE_NOT_ONBOARDED', case when not readiness_policy_onboarded then jsonb_build_object(
          'root_cause', 'This source type does not yet have an onboarded DataNexus profiling-readiness policy.',
          'manual_action', 'Use a source type with an onboarded readiness policy or complete onboarding for this source type.',
          'ai_action', 'AI can diagnose the missing adapter/readiness-policy capabilities but cannot mark the source ready without governed evidence.',
          'ai_remediation', 'DIAGNOSE_ONLY',
          'approval_required', true
        ) end,
        'DATASET_NOT_ACTIVE', case when readiness_policy_onboarded and not dataset_active then jsonb_build_object(
          'root_cause', 'The dataset is not active.',
          'manual_action', 'Review the dataset lifecycle state and activate it if that is intended.',
          'ai_action', 'AI can explain the inactive state and prepare an activation action when policy permits.',
          'ai_remediation', 'POLICY_GATED',
          'approval_required', true
        ) end,
        'SOURCE_NOT_ACTIVE', case when readiness_policy_onboarded and not source_active then jsonb_build_object(
          'root_cause', 'The data source is not active.',
          'manual_action', 'Review the source lifecycle state and activate it if the source should be used.',
          'ai_action', 'AI can diagnose the source state and prepare a governed activation action.',
          'ai_remediation', 'POLICY_GATED',
          'approval_required', true
        ) end,
        'SOURCE_NOT_OBSERVED_READY', case when readiness_policy_onboarded and not source_observed_ready then jsonb_build_object(
          'root_cause', coalesce(latest_error_message, 'The source has not produced sufficient observed readiness evidence.'),
          'manual_action', 'Run or repair source discovery/connectivity until the source reaches OBSERVED_READY.',
          'ai_action', 'AI may diagnose and automatically retry low-risk discovery/connectivity steps when policy authorizes it.',
          'ai_remediation', 'LOW_RISK_WHEN_POLICY_AUTHORIZED',
          'approval_required', false
        ) end,
        'GOVERNED_SCOPE_NOT_READY', case when readiness_policy_onboarded and not governed_scope_ready then jsonb_build_object(
          'root_cause', 'There is no active governed source scope with a valid current scope-version identity.',
          'manual_action', 'Create or select the intended governed source scope and make its version current.',
          'ai_action', 'AI can diagnose the scope gap and propose a scope change, but governed scope changes require explicit user approval.',
          'ai_remediation', 'PROPOSE_ONLY',
          'approval_required', true
        ) end,
        'EXECUTION_SOURCE_NOT_BOUND', case when readiness_policy_onboarded and not execution_binding_ready then jsonb_build_object(
          'root_cause', 'The latest dataset version is not bound to an active profiling execution source.',
          'manual_action', 'Bind the latest dataset version to the intended executable source.',
          'ai_action', 'AI may repair an unambiguous low-risk execution binding when policy authorizes it, otherwise it must request approval.',
          'ai_remediation', 'LOW_RISK_WHEN_POLICY_AUTHORIZED',
          'approval_required', false
        ) end,
        'DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE', case when readiness_policy_onboarded and not discovery_evidence_ready then jsonb_build_object(
          'root_cause', 'No successful complete, non-truncated, zero-failure discovery evidence exists for the current active scope version.',
          'manual_action', 'Run discovery for the current scope and resolve any truncation or failed discovery items.',
          'ai_action', 'AI may diagnose discovery failures and retry safe discovery work; it cannot manufacture successful evidence.',
          'ai_remediation', 'LOW_RISK_WHEN_POLICY_AUTHORIZED',
          'approval_required', false
        ) end
      )) as remediation
    from evidence e
  )
  select coalesce(
    (
      select jsonb_build_object(
        'state', readiness_state,
        'profiling_ready', readiness_state = 'READY',
        'project_id', project_id,
        'dataset_id', dataset_id,
        'source_id', source_id,
        'source_type', source_type,
        'readiness_policy', case when readiness_policy_onboarded then 'JDBC_V1' else null end,
        'authority_semantics', 'DETERMINISTIC_DERIVED_READINESS_NO_AGENT_OVERRIDE',
        'dataset_version_id', dataset_version_id,
        'execution_source_id', execution_source_id,
        'scope_id', scope_id,
        'scope_version_id', scope_version_id,
        'discovery_run_id', discovery_run_id,
        'discovery_manifest_hash', manifest_hash,
        'discovery_completed_at', discovery_completed_at,
        'blockers', blockers,
        'remediation', remediation
      )
      from classified
    ),
    jsonb_build_object(
      'state', 'NOT_ASSESSED',
      'profiling_ready', false,
      'project_id', p_project_id,
      'dataset_id', p_dataset_id,
      'authority_semantics', 'DETERMINISTIC_DERIVED_READINESS_NO_AGENT_OVERRIDE',
      'blockers', jsonb_build_object('DATASET_NOT_FOUND', true),
      'remediation', jsonb_build_object(
        'DATASET_NOT_FOUND', jsonb_build_object(
          'root_cause', 'The dataset does not exist in this project or is not visible to the caller.',
          'manual_action', 'Confirm the project and dataset selection.',
          'ai_action', 'AI can help locate an accessible dataset but cannot bypass project authorization.',
          'ai_remediation', 'DIAGNOSE_ONLY',
          'approval_required', false
        )
      )
    )
  );
$$;

comment on function catalog.verify_dataset_profile_readiness(uuid, uuid) is
  'Returns deterministic per-dataset profiling readiness and UI-ready remediation evidence without mutating lifecycle authority. JDBC_V1 is the currently onboarded source readiness policy.';

create or replace function catalog.verify_dataset_version_profile_readiness(
  p_project_id uuid,
  p_dataset_version_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with target as (
    select dv.dataset_id
    from catalog.dataset_versions dv
    join catalog.datasets d on d.id = dv.dataset_id
    where dv.id = p_dataset_version_id
      and d.project_id = p_project_id
  ),
  base as (
    select catalog.verify_dataset_profile_readiness(p_project_id, t.dataset_id) as readiness
    from target t
  )
  select coalesce(
    (
      select case
        when readiness->>'dataset_version_id' = p_dataset_version_id::text then readiness
        else jsonb_set(
          jsonb_set(
            jsonb_set(
              readiness,
              '{state}',
              '"BLOCKED"'::jsonb,
              true
            ),
            '{profiling_ready}',
            'false'::jsonb,
            true
          ),
          '{blockers}',
          coalesce(readiness->'blockers', '{}'::jsonb) || jsonb_build_object('DATASET_VERSION_NOT_LATEST', true),
          true
        ) || jsonb_build_object(
          'remediation', coalesce(readiness->'remediation', '{}'::jsonb) || jsonb_build_object(
            'DATASET_VERSION_NOT_LATEST', jsonb_build_object(
              'root_cause', 'The requested dataset version is not the latest governed dataset version.',
              'manual_action', 'Select the latest dataset version for ordinary profiling.',
              'ai_action', 'AI can resolve the latest governed dataset version and retry the profiling request.',
              'ai_remediation', 'LOW_RISK_WHEN_POLICY_AUTHORIZED',
              'approval_required', false
            )
          )
        )
      end
      from base
    ),
    jsonb_build_object(
      'state', 'NOT_ASSESSED',
      'profiling_ready', false,
      'project_id', p_project_id,
      'dataset_version_id', p_dataset_version_id,
      'authority_semantics', 'DETERMINISTIC_DERIVED_READINESS_NO_AGENT_OVERRIDE',
      'blockers', jsonb_build_object('DATASET_VERSION_NOT_FOUND', true),
      'remediation', jsonb_build_object(
        'DATASET_VERSION_NOT_FOUND', jsonb_build_object(
          'root_cause', 'The dataset version does not exist in this project or is not visible to the caller.',
          'manual_action', 'Confirm the project and dataset version selection.',
          'ai_action', 'AI can help locate an accessible dataset version but cannot bypass project authorization.',
          'ai_remediation', 'DIAGNOSE_ONLY',
          'approval_required', false
        )
      )
    )
  );
$$;

comment on function catalog.verify_dataset_version_profile_readiness(uuid, uuid) is
  'Fail-closed deterministic readiness verifier for ordinary profiling execution of a specific dataset version. Only the latest governed dataset version may be READY.';

create or replace function catalog.verify_project_profile_readiness(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with assessed as (
    select
      d.id as dataset_id,
      catalog.verify_dataset_profile_readiness(p_project_id, d.id) as readiness
    from catalog.datasets d
    where d.project_id = p_project_id
  ),
  counts as (
    select
      count(*) as datasets_assessed,
      count(*) filter (where readiness->>'state' = 'READY') as ready_count,
      count(*) filter (where readiness->>'state' = 'BLOCKED') as blocked_count,
      count(*) filter (where readiness->>'state' = 'NOT_ASSESSED') as not_assessed_count
    from assessed
  ),
  summary as (
    select
      c.*,
      case
        when datasets_assessed = 0 then 'NOT_ASSESSED'
        when ready_count = datasets_assessed then 'READY'
        when ready_count > 0 then 'PARTIALLY_READY'
        when blocked_count > 0 then 'BLOCKED'
        else 'NOT_ASSESSED'
      end as project_state
    from counts c
  )
  select jsonb_build_object(
    'valid', project_state = 'READY',
    'state', project_state,
    'project_id', p_project_id,
    'authority_semantics', 'DERIVED_READINESS_DOES_NOT_MUTATE_SOURCE_OR_PROFILING_LIFECYCLE',
    'datasets_assessed', datasets_assessed,
    'profiling_ready', ready_count,
    'blocked', blocked_count,
    'not_assessed', not_assessed_count,
    'can_profile_any', ready_count > 0,
    'can_profile_all', datasets_assessed > 0 and ready_count = datasets_assessed,
    'datasets', coalesce(
      (select jsonb_agg(readiness order by dataset_id) from assessed),
      '[]'::jsonb
    )
  )
  from summary;
$$;

comment on function catalog.verify_project_profile_readiness(uuid) is
  'Aggregates deterministic dataset readiness into READY, PARTIALLY_READY, BLOCKED, or NOT_ASSESSED. READY datasets remain independently profileable in PARTIALLY_READY projects.';

revoke all on function catalog.verify_dataset_profile_readiness(uuid, uuid) from public, anon;
revoke all on function catalog.verify_dataset_version_profile_readiness(uuid, uuid) from public, anon;
revoke all on function catalog.verify_project_profile_readiness(uuid) from public, anon;

grant execute on function catalog.verify_dataset_profile_readiness(uuid, uuid) to authenticated, service_role;
grant execute on function catalog.verify_dataset_version_profile_readiness(uuid, uuid) to authenticated, service_role;
grant execute on function catalog.verify_project_profile_readiness(uuid) to authenticated, service_role;
