create or replace function governance.verify_non_lineage_enterprise_acceptance(
  p_project_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_glossary jsonb := governance.verify_glossary_evidence_posture();
  v_stewardship jsonb := governance.verify_stewardship_governance_posture();
  v_classification jsonb := governance.verify_classification_privacy_posture();
  v_quality jsonb := governance.verify_quality_control_posture();
  v_workflow jsonb := governance.verify_workflow_contract_posture();
  v_audit_reporting jsonb := governance.verify_audit_reporting_posture();
  v_ai_assisted jsonb := governance.verify_ai_assisted_governance_posture();
  v_governance_intelligence jsonb := governance.verify_governance_intelligence_posture();
  v_autonomous_agent jsonb := governance.verify_autonomous_agent_posture();
  v_ai_system jsonb := governance.verify_ai_system_governance_posture();
  v_semantic jsonb := governance.verify_semantic_search_posture();
  v_security jsonb := governance.verify_database_api_security_posture();
  v_audit_chain jsonb := governance.verify_audit_chain(p_project_id);
  v_active_intelligence jsonb := governance.verify_ai_governance_intelligence_active(p_project_id);
  v_platform_contract_status text;
  v_observed_sources bigint := 0;
  v_complete_manifest_sources bigint := 0;
  v_current_assets bigint := 0;
  v_current_fields bigint := 0;
  v_identity_count bigint := 0;
  v_distinct_identity_count bigint := 0;
  v_null_identity_count bigint := 0;
  v_physical_versions bigint := 0;
  v_projected_assets bigint := 0;
  v_observed_jdbc_sources bigint := 0;
  v_accepted_jdbc_sources bigint := 0;
  v_multi_namespace_evidence boolean := false;
  v_lineage_boundary_valid boolean := false;
  v_corpus_boundary_valid boolean := false;
  v_valid boolean := false;
begin
  select status::text
  into v_platform_contract_status
  from governance.platform_contract_check_runs
  order by completed_at desc nulls last
  limit 1;

  with observed as (
    select s.id
    from catalog.data_sources s
    where s.project_id = p_project_id
      and s.status::text = 'ACTIVE'
      and exists (
        select 1
        from catalog.discovered_assets a
        where a.source_id = s.id
          and a.is_current
      )
      and exists (
        select 1
        from catalog.discovery_runs r
        where r.source_id = s.id
          and r.status::text = 'COMPLETED'
      )
  ), latest_runs as (
    select distinct on (r.source_id)
      r.source_id,
      r.schema_snapshot
    from catalog.discovery_runs r
    join observed o on o.id = r.source_id
    where r.status::text = 'COMPLETED'
    order by r.source_id, r.completed_at desc nulls last, r.started_at desc nulls last
  )
  select
    (select count(*) from observed),
    (select count(*)
       from latest_runs lr
      where coalesce((lr.schema_snapshot->'discovery_manifest'->>'complete')::boolean, false)
        and not coalesce((lr.schema_snapshot->'discovery_manifest'->>'truncated')::boolean, false)
        and coalesce((lr.schema_snapshot->'discovery_manifest'->>'failed_item_count')::bigint, 0) = 0
        and coalesce((lr.schema_snapshot->'discovery_manifest'->>'expected_object_count')::bigint, -1)
          = coalesce((lr.schema_snapshot->'discovery_manifest'->>'observed_object_count')::bigint, -2)
        and coalesce((lr.schema_snapshot->'discovery_manifest'->>'expected_field_count')::bigint, -1)
          = coalesce((lr.schema_snapshot->'discovery_manifest'->>'observed_field_count')::bigint, -2)),
    (select count(*)
       from catalog.discovered_assets a
       join observed o on o.id = a.source_id
      where a.is_current),
    (select coalesce(sum(jsonb_array_length(coalesce(a.columns, '[]'::jsonb))), 0)
       from catalog.discovered_assets a
       join observed o on o.id = a.source_id
      where a.is_current),
    (select count(a.identity_key)
       from catalog.discovered_assets a
       join observed o on o.id = a.source_id
      where a.is_current),
    (select count(distinct (a.source_id, a.identity_key))
       from catalog.discovered_assets a
       join observed o on o.id = a.source_id
      where a.is_current),
    (select count(*)
       from catalog.discovered_assets a
       join observed o on o.id = a.source_id
      where a.is_current
        and (a.identity_key is null or btrim(a.identity_key) = '')),
    (select count(*)
       from catalog.discovered_asset_versions av
       join observed o on o.id = av.source_id),
    (select count(*)
       from catalog.current_catalog_source_assets ca
       join observed o on o.id = ca.source_id)
  into
    v_observed_sources,
    v_complete_manifest_sources,
    v_current_assets,
    v_current_fields,
    v_identity_count,
    v_distinct_identity_count,
    v_null_identity_count,
    v_physical_versions,
    v_projected_assets;

  with observed_jdbc as (
    select s.id
    from catalog.data_sources s
    where s.project_id = p_project_id
      and s.status::text = 'ACTIVE'
      and s.source_type::text = 'JDBC'
      and exists (
        select 1
        from catalog.discovered_assets a
        where a.source_id = s.id
          and a.is_current
      )
      and exists (
        select 1
        from catalog.discovery_runs r
        where r.source_id = s.id
          and r.status::text = 'COMPLETED'
      )
  ), acceptance as (
    select j.id, catalog.verify_jdbc_source_acceptance(j.id, false) as evidence
    from observed_jdbc j
  )
  select
    count(*),
    count(*) filter (where coalesce((evidence->>'valid')::boolean, false)),
    coalesce(bool_or(
      coalesce((evidence->>'valid')::boolean, false)
      and coalesce((evidence->'discovery'->>'namespaces')::bigint, 0) > 1
    ), false)
  into v_observed_jdbc_sources, v_accepted_jdbc_sources, v_multi_namespace_evidence
  from acceptance;

  v_lineage_boundary_valid :=
    coalesce(v_active_intelligence->>'status', '') = 'PARTIAL'
    and coalesce((v_active_intelligence->>'failure_count')::bigint, -1) = 0
    and coalesce((v_active_intelligence->>'partial_or_external_count')::bigint, -1) = 1
    and jsonb_typeof(coalesce(v_active_intelligence->'blockers', '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(v_active_intelligence->'blockers', '[]'::jsonb)) = 1
    and v_active_intelligence->'blockers'->0->>'code' = 'REAL_FIELD_LINEAGE_DATA_NOT_INGESTED';

  v_corpus_boundary_valid :=
    v_active_intelligence->'checks'->'enterprise_governance_corpus'->>'status' = 'PASS'
    and coalesce((v_active_intelligence->'checks'->'enterprise_governance_corpus'->>'external_reference_documents')::bigint, 0) > 0
    and not coalesce((v_active_intelligence->'checks'->'enterprise_governance_corpus'->>'external_references_confer_internal_authority')::boolean, true);

  v_valid :=
    p_project_id is not null
    and coalesce((v_glossary->>'valid')::boolean, false)
    and coalesce((v_stewardship->>'valid')::boolean, false)
    and coalesce((v_classification->>'valid')::boolean, false)
    and coalesce((v_quality->>'valid')::boolean, false)
    and coalesce((v_workflow->>'valid')::boolean, false)
    and coalesce((v_audit_reporting->>'valid')::boolean, false)
    and coalesce((v_ai_assisted->>'valid')::boolean, false)
    and coalesce((v_governance_intelligence->>'valid')::boolean, false)
    and coalesce((v_autonomous_agent->>'valid')::boolean, false)
    and coalesce((v_ai_system->>'valid')::boolean, false)
    and coalesce((v_semantic->>'valid')::boolean, false)
    and coalesce((v_security->>'valid')::boolean, false)
    and coalesce((v_audit_chain->>'valid')::boolean, false)
    and v_platform_contract_status = 'PASSED'
    and v_observed_sources > 0
    and v_complete_manifest_sources = v_observed_sources
    and v_current_assets > 0
    and v_current_fields > 0
    and v_identity_count = v_current_assets
    and v_distinct_identity_count = v_current_assets
    and v_null_identity_count = 0
    and v_physical_versions >= v_current_assets
    and v_projected_assets = v_current_assets
    and v_observed_jdbc_sources > 0
    and v_accepted_jdbc_sources = v_observed_jdbc_sources
    and v_multi_namespace_evidence
    and v_lineage_boundary_valid
    and v_corpus_boundary_valid
    and v_active_intelligence->'checks'->'contracts_certification'->>'status' = 'PASS';

  return jsonb_build_object(
    'valid', v_valid,
    'state', case
      when v_valid then 'NON_LINEAGE_ENTERPRISE_ACCEPTANCE_PASSED'
      else 'NON_LINEAGE_ENTERPRISE_ACCEPTANCE_INCOMPLETE'
    end,
    'project_id', p_project_id,
    'scope', jsonb_build_object(
      'included_modules', jsonb_build_array(1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15),
      'excluded_modules', jsonb_build_array(3),
      'module_3', jsonb_build_object(
        'included', false,
        'state', 'BLOCKED_EXTERNAL',
        'blocker', 'DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED',
        'required_privilege', 'USE SCHEMA on system.access',
        'data_blocker', 'REAL_FIELD_LINEAGE_DATA_NOT_INGESTED',
        'inference_allowed', false
      )
    ),
    'catalog', jsonb_build_object(
      'observed_sources', v_observed_sources,
      'complete_manifest_sources', v_complete_manifest_sources,
      'current_assets', v_current_assets,
      'current_fields', v_current_fields,
      'identity_count', v_identity_count,
      'distinct_identity_count', v_distinct_identity_count,
      'null_identity_count', v_null_identity_count,
      'physical_versions', v_physical_versions,
      'projected_assets', v_projected_assets,
      'identity_and_versioning_valid',
        v_identity_count = v_current_assets
        and v_distinct_identity_count = v_current_assets
        and v_null_identity_count = 0
        and v_physical_versions >= v_current_assets
        and v_projected_assets = v_current_assets
    ),
    'jdbc', jsonb_build_object(
      'observed_sources', v_observed_jdbc_sources,
      'accepted_sources', v_accepted_jdbc_sources,
      'all_observed_sources_accepted', v_observed_jdbc_sources > 0 and v_accepted_jdbc_sources = v_observed_jdbc_sources,
      'multi_namespace_evidence', v_multi_namespace_evidence
    ),
    'governance', jsonb_build_object(
      'module_4_glossary', coalesce((v_glossary->>'valid')::boolean, false),
      'module_5_stewardship', coalesce((v_stewardship->>'valid')::boolean, false),
      'module_6_classification_privacy', coalesce((v_classification->>'valid')::boolean, false),
      'module_7_quality', coalesce((v_quality->>'valid')::boolean, false),
      'module_8_policy_controls', coalesce((v_quality->>'valid')::boolean, false) and v_platform_contract_status = 'PASSED',
      'module_9_workflow_remediation', coalesce((v_workflow->>'valid')::boolean, false),
      'module_10_contract_change_governance', coalesce((v_workflow->>'valid')::boolean, false) and v_active_intelligence->'checks'->'contracts_certification'->>'status' = 'PASS',
      'module_11_audit_evidence_reporting', coalesce((v_audit_reporting->>'valid')::boolean, false) and coalesce((v_audit_chain->>'valid')::boolean, false),
      'module_12_ai_assisted_governance', coalesce((v_ai_assisted->>'valid')::boolean, false),
      'module_13_governance_intelligence', coalesce((v_governance_intelligence->>'valid')::boolean, false),
      'module_14_autonomous_agents', coalesce((v_autonomous_agent->>'valid')::boolean, false),
      'module_15_ai_system_governance', coalesce((v_ai_system->>'valid')::boolean, false),
      'semantic_search', coalesce((v_semantic->>'valid')::boolean, false),
      'platform_contract_status', coalesce(v_platform_contract_status, 'MISSING'),
      'database_api_security', coalesce((v_security->>'valid')::boolean, false),
      'audit_chain', coalesce((v_audit_chain->>'valid')::boolean, false),
      'external_corpus_truth_boundary', v_corpus_boundary_valid
    ),
    'lineage_boundary', jsonb_build_object(
      'valid', v_lineage_boundary_valid,
      'expected_status', 'PARTIAL',
      'failure_count', v_active_intelligence->'failure_count',
      'partial_or_external_count', v_active_intelligence->'partial_or_external_count',
      'blockers', v_active_intelligence->'blockers'
    )
  );
end;
$$;

revoke all on function governance.verify_non_lineage_enterprise_acceptance(uuid) from public;
revoke execute on function governance.verify_non_lineage_enterprise_acceptance(uuid) from anon, authenticated;
grant execute on function governance.verify_non_lineage_enterprise_acceptance(uuid) to service_role;

comment on function governance.verify_non_lineage_enterprise_acceptance(uuid) is
  'Service-only enterprise acceptance verifier for Modules #1, #2 and #4-#15. Module #3 remains explicitly external-blocked and is never inferred or counted as complete.';
